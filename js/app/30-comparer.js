/*
 * Suivi Dossiers — Comparer deux FEC du même exercice (ACD et Pennylane, deux exports successifs…) : différences du FEC
 * comparé par rapport au FEC de référence (celui qui a été déclaré).
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- Comparer deux FEC ----------
// Le moteur (js/fec-compare.js) tourne dans un Web Worker. Les fichiers et le résultat restent en mémoire : ils ne sont
// jamais enregistrés et sont effacés au verrouillage.

const CMP_TABS = { synthese: 'Synthèse', ecritures: 'Écritures', balance: 'Balance', tiers: 'Tiers', an: 'À-nouveaux', corresp: 'Correspondances' };
const CMP_TYPES = { date: 'Date', montant: 'Montant', compte: 'Compte', abs: 'Ligne absente', plus: 'Ligne en plus' };
const CMP_SHOW = 300; // éléments affichés par liste (tout figure dans l'export Excel)
const cmpState = () => (ui.cmp = ui.cmp || { ref: null, cmp: null, full: false, all: false, status: 'idle', tab: 'synthese', runId: 0 });
let cmpWorker = null;
const cmpRefresh = () => { if (location.hash.startsWith('#/comparer')) refresh(); };

// Fichiers déposés : sur un emplacement précis, ou deux à la fois (le premier est la référence)
function cmpDrop(files, side) {
  const st = cmpState();
  files = Array.from(files || []).filter(Boolean);
  if (!files.length) return;
  if (side) st[side] = files[0];
  else if (files.length >= 2) { st.ref = files[0]; st.cmp = files[1]; }
  else if (!st.ref) st.ref = files[0];
  else st.cmp = files[0];
  cmpRun();
}

function cmpStop() {
  if (cmpWorker) { cmpWorker.terminate(); cmpWorker = null; }
}

function cmpRun() {
  const st = cmpState();
  cmpStop();
  if (!st.ref || !st.cmp) { Object.assign(st, { status: 'idle', res: null }); cmpRefresh(); return; }
  const run = ++st.runId;
  Object.assign(st, { status: 'running', pct: 0, res: null, message: '' });
  cmpRefresh();
  const alive = () => run === st.runId && ui.cmp === st;
  const fail = (message) => { if (!alive()) return; Object.assign(st, { status: 'error', message }); cmpRefresh(); };
  Promise.all([fecSource(st.ref), fecSource(st.cmp)]).then(([a, b]) => {
    if (!alive()) return;
    const w = (cmpWorker = new Worker('js/fec-compare.js?v=' + ASSET_VERSION));
    w.onmessage = (e) => {
      const m = e.data;
      if (!alive()) { w.terminate(); return; }
      if (m.type === 'progress') {
        st.pct = m.pct;
        const bar = $('.fec-progress span');
        if (bar) bar.style.width = m.pct + '%';
        return;
      }
      w.terminate();
      if (cmpWorker === w) cmpWorker = null;
      if (m.type !== 'done') return fail(m.message);
      Object.assign(st, { status: 'done', res: m.result });
      if (location.hash.startsWith('#/comparer')) refresh();
      else toast('Comparaison des FEC terminée.');
    };
    w.onerror = (err) => { w.terminate(); if (cmpWorker === w) cmpWorker = null; fail(err.message || 'Erreur pendant la comparaison.'); };
    w.postMessage({ ref: { buffer: a.buffer, fileName: a.name }, cmp: { buffer: b.buffer, fileName: b.name }, opts: { full: st.full } }, a.buffer === b.buffer ? [a.buffer] : [a.buffer, b.buffer]);
  }, (err) => fail(err.message));
}

// ---------- Affichage ----------
const cmpN = (n) => (Number(n) || 0).toLocaleString('fr-FR');
const cmpSolde = (v) => (Math.abs(v) < 0.005 ? '—' : `${eur(Math.abs(v))} ${v > 0 ? 'D' : 'C'}`);
const cmpEcart = (v) => (Math.abs(v) < 0.005 ? '' : `${v > 0 ? '+' : '−'}${eur(Math.abs(v))}`);
// Écart de solde (comparé − référence) : en plus au débit (D) ou au crédit (C) dans le FEC comparé
const cmpDelta = (v) => (Math.abs(v) < 0.005 ? '' : `${eur(Math.abs(v))} ${v > 0 ? 'D' : 'C'}`);
const cmpAcct = (l) => `${l.cpt}${l.aux ? ' · ' + l.aux : ''}${l.cl ? ' ' + l.cl : ''}`;
const cmpNums = (b, side) => (side === 'ref' ? b.refNums : b.cmpNums).join(', ');

function cmpLinesTable(lines) {
  return `<div class="grid-wrap"><table class="dtable cmp-table"><thead><tr><th>Compte</th><th>Libellé</th><th class="n">Débit</th><th class="n">Crédit</th></tr></thead>
    <tbody>${lines.map((l) => `<tr><td>${esc(cmpAcct(l))}</td><td>${esc(l.l)}</td><td class="n">${l.d ? eur(l.d) : ''}</td><td class="n">${l.c ? eur(l.c) : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

function cmpEntry(e) {
  return `<details class="cmp-entry"><summary><span class="cmp-when">${fmtDate(e.dt)}</span><span class="badge">${esc(e.j)} ${esc(e.n)}</span>${e.p ? `<span class="muted small">${esc(e.p)}</span>` : ''}
      <span class="cmp-lib">${esc(e.l || e.tiers || '')}</span>${e.partial ? '<span class="badge warn">en partie</span>' : ''}<strong class="cmp-amt">${eur(e.amount)} €</strong></summary>
    ${e.partial ? '<p class="muted small">Seules les lignes sans équivalent sont listées : les autres lignes de cette écriture se retrouvent, ventilées autrement, dans le FEC comparé.</p>' : ''}
    ${cmpLinesTable(e.lines)}</details>`;
}

function cmpModified(m) {
  const badges = m.types.map((t) => `<span class="badge warn">${t === 'date' ? `Date ${m.days > 0 ? '+' : '−'}${Math.abs(m.days)} j` : esc(CMP_TYPES[t])}</span>`).join('');
  const rows = m.diffs.map((x) => {
    const r = x.ref, c = x.cmp;
    const amt = (l) => (l ? eur(l.d || l.c) + (l.d ? ' D' : ' C') : '');
    return `<tr><td>${esc(CMP_TYPES[x.t])}</td><td>${r ? esc(cmpAcct(r)) : ''}</td><td class="n">${amt(r)}</td><td>${c ? esc(cmpAcct(c)) : ''}</td><td class="n">${amt(c)}</td><td class="n">${x.t === 'montant' ? cmpEcart(x.ecart) : ''}</td></tr>`;
  }).join('');
  return `<details class="cmp-entry"><summary><span class="cmp-when">${fmtDate(m.ref.dt)}${m.days ? ` → ${fmtDate(m.cmp.dt)}` : ''}</span><span class="badge">${esc(m.ref.j)} ${esc(m.ref.n)}</span>${m.ref.p ? `<span class="muted small">${esc(m.ref.p)}</span>` : ''}
      <span class="cmp-lib">${esc(m.ref.l || m.ref.tiers || '')}</span>${badges}<strong class="cmp-amt">${eur(m.ref.total)} €</strong></summary>
    <p class="muted small">FEC comparé : ${esc(m.cmp.j)} ${esc(m.cmp.n)} du ${fmtDate(m.cmp.dt)}${m.cmp.p ? `, pièce ${esc(m.cmp.p)}` : ''}${m.cmp.l ? ` — ${esc(m.cmp.l)}` : ''}</p>
    ${rows ? `<div class="grid-wrap"><table class="dtable cmp-table"><thead><tr><th>Différence</th><th>Référence : compte</th><th class="n">Montant</th><th>Comparé : compte</th><th class="n">Montant</th><th class="n">Écart</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="small">Mêmes lignes, à une autre date.</p>'}
  </details>`;
}

const cmpMore = (n) => (n > CMP_SHOW ? `<p class="muted small">… et ${cmpN(n - CMP_SHOW)} autre(s) : liste complète dans l'export Excel.</p>` : '');
const cmpCapNote = (shown, total) => (total > shown ? `<p class="muted small">Les ${cmpN(shown)} premiers éléments sur ${cmpN(total)} sont détaillés (export Excel compris).</p>` : '');

function cmpBalanceRows(rows, cols) {
  let rub = '';
  return rows.map((b) => {
    const code = b.root.slice(0, 2);
    const headRow = !b.tiers && code !== rub ? `<tr class="cmp-rub"><td colspan="${cols}">${esc(code)} · ${esc(RUBRIQUES[code] || '')}</td></tr>` : '';
    rub = code;
    const acc = b.tiers ? `${b.root} · ${esc(b.lib)}` : `${esc(cmpNums(b, 'ref') || b.k)}${b.mapped ? ` <span class="muted small">↔ ${esc(cmpNums(b, 'cmp'))}</span>` : ''}`;
    return `${headRow}<tr class="${Math.abs(b.ecart) >= 0.005 ? 'cmp-diff' : ''}"><td>${acc}</td>${b.tiers ? '' : `<td>${esc(b.lib)}</td>`}<td class="n">${cmpSolde(b.ref)}</td><td class="n">${cmpSolde(b.cmp)}</td><td class="n"><strong>${cmpDelta(b.ecart)}</strong></td></tr>`;
  }).join('');
}

function cmpTabBody(st, r) {
  const s = r.stats;
  const showAll = st.all;
  if (st.tab === 'ecritures') {
    const sec = (title, count, sum, items, render, hint) => `<section class="card"><div class="card-head"><h2>${title} <span class="count">${cmpN(count)}</span></h2>${sum !== null ? `<strong>${eur(sum)} €</strong>` : ''}</div>
      ${hint ? `<p class="muted small">${hint}</p>` : ''}
      ${count ? items.slice(0, CMP_SHOW).map(render).join('') + cmpMore(items.length) + cmpCapNote(items.length, count) : '<p class="muted">Aucune.</p>'}</section>`;
    const groups = r.groups.slice(0, CMP_SHOW);
    return `${sec('Écritures absentes du FEC comparé', s.absent, s.sumAbs, r.absent, cmpEntry, 'Écritures du FEC de référence sans équivalent dans le FEC comparé (ni à une autre date, ni ventilées autrement) : à saisir, ou à justifier.')}
      ${sec('Écritures en plus dans le FEC comparé', s.extra, s.sumExtra, r.extra, cmpEntry, 'Écritures du FEC comparé absentes du FEC de référence : doublons, opérations saisies d\'un seul côté…')}
      ${sec('Écritures modifiées', s.modified, null, r.modified, cmpModified, `Même écriture des deux côtés, avec une différence : ${s.dates} de date, ${s.montants} de montant, ${s.comptes} de compte, ${s.lignes} avec des lignes en plus ou en moins.`)}
      <section class="card"><h2>Ventilations différentes d'un même total <span class="count">${cmpN(r.groups.length)}</span></h2>
        <p class="muted small">Même total sur un compte, le même jour (ou le même mois), réparti en un nombre de lignes différent : paie en une ou deux écritures, ventes centralisées… Ce ne sont pas des écarts.</p>
        ${groups.length ? `<div class="grid-wrap"><table class="dtable cmp-table"><thead><tr><th>Période</th><th>Compte</th><th>Sens</th><th class="n">Montant</th><th class="n">Lignes réf.</th><th class="n">Lignes comparé</th></tr></thead>
          <tbody>${groups.map((g) => `<tr><td>${g.period === 'jour' ? fmtDate(g.dt) : esc(g.dt.split('-').reverse().join('/'))}</td><td>${esc(g.k.replace(/^T\d{3}:/, ''))} ${esc(g.k[0] === 'T' ? '' : g.lib)}</td><td>${g.s > 0 ? 'Débit' : 'Crédit'}</td><td class="n">${eur(g.a)}</td><td class="n">${g.nRef}</td><td class="n">${g.nCmp}</td></tr>`).join('')}</tbody></table></div>${cmpMore(r.groups.length)}` : '<p class="muted">Aucune.</p>'}
      </section>`;
  }
  if (st.tab === 'balance' || st.tab === 'tiers') {
    const tiers = st.tab === 'tiers';
    const rows = r.balance.filter((b) => b.tiers === tiers && (showAll || Math.abs(b.ecart) >= 0.005));
    const nAll = r.balance.filter((b) => b.tiers === tiers).length;
    const cols = tiers ? 4 : 5;
    return `<section class="card"><div class="card-head"><h2>${tiers ? 'Soldes des tiers' : 'Balance comparée'} <span class="count">${cmpN(rows.length)}</span></h2>
        <label class="check inline"><input type="checkbox" data-cmp="all"${showAll ? ' checked' : ''}><span>Afficher aussi les ${tiers ? 'tiers' : 'comptes'} sans écart (${cmpN(nAll)})</span></label></div>
      <p class="muted small">${tiers ? 'Tiers rapprochés par leur nom (formes juridiques et ponctuation ignorées). ' : 'Comptes ramenés à 6 chiffres ; « ↔ » : compte correspondant dans le FEC comparé. '}Soldes à-nouveaux compris, sur la période comparée ; écart : ce que le FEC comparé a en plus au débit (D) ou au crédit (C).</p>
      ${rows.length ? `<div class="grid-wrap"><table class="dtable cmp-table"><thead><tr><th>${tiers ? 'Tiers' : 'Compte'}</th>${tiers ? '' : '<th>Libellé</th>'}<th class="n">Référence</th><th class="n">Comparé</th><th class="n">Écart</th></tr></thead>
        <tbody>${cmpBalanceRows(rows, cols)}</tbody></table></div>` : `<p class="muted">Aucun écart${tiers ? ' sur les tiers' : ' de solde'}.</p>`}</section>`;
  }
  if (st.tab === 'an') {
    const rows = r.balance.filter((b) => Math.abs(b.ecartAN) >= 0.005);
    return `<section class="card"><h2>À-nouveaux <span class="count">${cmpN(rows.length)}</span></h2>
      <p class="muted small">À-nouveaux comparés compte par compte (souvent globaux dans un logiciel et détaillés par pièce dans l'autre). FEC de référence : ${cmpN(r.ref.anEntries)} écriture(s) d'à-nouveaux ; FEC comparé : ${cmpN(r.cmp.anEntries)}.</p>
      ${rows.length ? `<div class="grid-wrap"><table class="dtable cmp-table"><thead><tr><th>Compte</th><th>Libellé</th><th class="n">Référence</th><th class="n">Comparé</th><th class="n">Écart</th></tr></thead>
        <tbody>${rows.map((b) => `<tr class="cmp-diff"><td>${b.tiers ? b.root : esc(cmpNums(b, 'ref') || b.k)}</td><td>${esc(b.lib)}</td><td class="n">${cmpSolde(b.refAN)}</td><td class="n">${cmpSolde(b.cmpAN)}</td><td class="n"><strong>${cmpDelta(b.ecartAN)}</strong></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Mêmes à-nouveaux dans les deux FEC.</p>'}</section>`;
  }
  if (st.tab === 'corresp') {
    return `<section class="card"><h2>Imputations différentes <span class="count">${cmpN(r.accountPairs.length)}</span></h2>
        <p class="muted small">Même opération (même date et même montant) passée sur un autre compte dans le FEC comparé : détail dans Écritures modifiées.</p>
        ${r.accountPairs.length ? `<div class="grid-wrap"><table class="dtable cmp-table"><thead><tr><th>Référence</th><th>Comparé</th><th class="n">Lignes</th><th class="n">Montant</th></tr></thead>
          <tbody>${r.accountPairs.map((p) => `<tr><td>${esc(p.ref.replace(/^T(\d{3}):/, '$1 · '))} ${esc(p.ref[0] === 'T' ? '' : p.refLib)}</td><td>${esc(p.cmp.replace(/^T(\d{3}):/, '$1 · '))} ${esc(p.cmp[0] === 'T' ? '' : p.cmpLib)}</td><td class="n">${p.n}</td><td class="n">${eur(p.total)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aucune.</p>'}
      </section>
      <section class="card"><h2>Comptes correspondants <span class="count">${cmpN(r.maps.length)}</span></h2>
        <p class="muted small">Numéros ou noms différents d'un logiciel à l'autre pour le même compte, reconnus sur des opérations identiques (même date, sens et montant) : banque 512000 ↔ 5121001, tiers au nom tronqué… Ce ne sont pas des écarts, mais vérifiez qu'ils correspondent bien.</p>
        ${r.maps.length ? `<div class="grid-wrap"><table class="dtable cmp-table"><thead><tr><th>Référence</th><th>Comparé</th><th class="n">Opérations</th></tr></thead>
          <tbody>${r.maps.map((m) => `<tr><td>${esc(m.refNums.join(', '))} ${esc(m.refLib)}</td><td>${esc(m.cmpNums.join(', '))} ${esc(m.cmpLib)}</td><td class="n">${m.n}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Mêmes comptes dans les deux FEC.</p>'}
      </section>`;
  }
  // Synthèse
  const rubs = new Map();
  r.balance.forEach((b) => {
    const code = b.root.slice(0, 2);
    const x = rubs.get(code) || { code, ref: 0, cmp: 0 };
    x.ref += b.ref; x.cmp += b.cmp;
    rubs.set(code, x);
  });
  const rubRows = Array.from(rubs.values()).map((x) => Object.assign(x, { ecart: Math.round((x.cmp - x.ref) * 100) / 100 }))
    .filter((x) => Math.abs(x.ecart) >= 0.005).sort((a, b) => a.code.localeCompare(b.code));
  return `<section class="card"><h2>Chiffres clés</h2>
      <div class="grid-wrap"><table class="dtable cmp-table"><thead><tr><th></th><th class="n">Référence</th><th class="n">Comparé</th><th class="n">Écart</th></tr></thead>
        <tbody>${r.synth.map((x) => `<tr class="${x.strong ? 'cmp-strong' : ''}${Math.abs(x.ecart) >= 0.005 ? ' cmp-diff' : ''}"><td>${esc(x.label)}</td><td class="n">${eur(x.ref)}</td><td class="n">${eur(x.cmp)}</td><td class="n"><strong>${cmpEcart(x.ecart)}</strong></td></tr>`).join('')}
          <tr><td>Écritures (hors à-nouveaux)</td><td class="n">${cmpN(r.ref.entries)}</td><td class="n">${cmpN(r.cmp.entries)}</td><td class="n">${r.cmp.entries !== r.ref.entries ? cmpEcart(r.cmp.entries - r.ref.entries).replace(',00', '') : ''}</td></tr>
          <tr><td>Total des débits du fichier</td><td class="n">${eur(r.ref.totalD)}</td><td class="n">${eur(r.cmp.totalD)}</td><td class="n">${cmpEcart(Math.round((r.cmp.totalD - r.ref.totalD) * 100) / 100)}</td></tr>
        </tbody></table></div>
      <p class="muted small">Soldes dans le sens naturel de chaque poste (produits et dettes au crédit en positif), à-nouveaux compris.</p>
    </section>
    <section class="card"><h2>Écarts par rubrique <span class="count">${rubRows.length}</span></h2>
      ${rubRows.length ? `<div class="grid-wrap"><table class="dtable cmp-table"><thead><tr><th>Rubrique</th><th class="n">Référence</th><th class="n">Comparé</th><th class="n">Écart</th></tr></thead>
        <tbody>${rubRows.map((x) => `<tr class="cmp-diff"><td>${esc(x.code)} · ${esc(RUBRIQUES[x.code] || '')}</td><td class="n">${cmpSolde(x.ref)}</td><td class="n">${cmpSolde(x.cmp)}</td><td class="n"><strong>${cmpDelta(x.ecart)}</strong></td></tr>`).join('')}</tbody></table></div>
        <p class="muted small">Écart : ce que le FEC comparé a en plus au débit (D) ou au crédit (C). Détail compte par compte dans l'onglet Balance.</p>` : '<p class="muted">Aucun écart de solde.</p>'}
    </section>`;
}

function viewCompare() {
  const st = ui.cmp || { status: 'idle' };
  const r = st.status === 'done' ? st.res : null;
  const head = `<div class="page-head"><h1>Comparer deux FEC</h1><div class="head-actions">
      ${st.ref || st.cmp ? '<button class="btn" data-action="cmp-clear">Effacer</button>' : ''}
      ${r ? '<button class="btn primary" data-action="cmp-export">Exporter en Excel</button>' : ''}</div></div>`;
  const slot = (side, title, hint) => {
    const f = st[side];
    const x = r && r[side];
    return `<div class="card fec-drop cmp-slot${f ? ' on' : ''}" data-action="cmp-pick" data-side="${side}" role="button" tabindex="0">
      <span class="cmp-role">${title}</span>
      ${f ? `<strong class="cmp-file">${esc(f.name)}</strong>
        ${x ? `<span class="muted small">${x.start ? `Du ${fmtDate(x.start)} au ${fmtDate(x.end)} · ` : ''}${cmpN(x.entries)} écritures · ${cmpN(x.lines)} lignes</span><span class="muted small">Journaux ${esc(x.journals.join(', '))}</span>` : ''}
        <span class="muted small">Cliquer ou déposer un fichier pour le remplacer</span>`
      : `${icon('file', 'fec-drop-ico')}<span>${hint}</span>`}
    </div>`;
  };
  const slots = `<div class="cmp-slots">
      ${slot('ref', 'FEC de référence', '<strong>Déposez le FEC déclaré</strong> ou cliquez pour le choisir')}
      <button class="btn cmp-swap" data-action="cmp-swap" title="Inverser la référence et le FEC comparé" aria-label="Inverser"${st.ref && st.cmp ? '' : ' disabled'}>⇄</button>
      ${slot('cmp', 'FEC à comparer', '<strong>Déposez l\'autre FEC</strong> du même exercice')}
    </div>`;
  if (st.status === 'idle' || !st.status) {
    return `${head}${slots}
      <section class="card"><h2>${icon('help')} Principe</h2>
        <ul>
          <li>Choisissez le <strong>FEC de référence</strong> (celui qui a été déclaré, par exemple l'export d'ACD) et le <strong>FEC à comparer</strong> (par exemple l'export de Pennylane du même exercice). Les archives .zip « FEC + justificatifs » de Pennylane sont acceptées.</li>
          <li>Les deux logiciels n'ont ni les mêmes numéros de comptes, ni les mêmes journaux, ni les mêmes n° de pièce : les comptes sont ramenés à 6 chiffres, les tiers rapprochés par leur nom, et les correspondances (banque 512000 ↔ 5121001…) reconnues sur les opérations identiques.</li>
          <li>Résultat : écritures absentes ou en plus, écritures modifiées (date, montant, compte, lignes), balance, tiers et à-nouveaux comparés, avec export Excel.</li>
        </ul>
      </section>
      <section class="card"><h2>${icon('shield')} Confidentialité</h2>
        <p>Les deux FEC sont comparés <strong>sur cet appareil uniquement</strong>, dans un processus isolé : ils ne sont ni envoyés, ni conservés. Le résultat est effacé au verrouillage.</p>
      </section>`;
  }
  if (st.status === 'running') {
    return `${head}${slots}<section class="card fec-loading"><p><strong>Comparaison en cours…</strong></p>
      <div class="fec-progress"><span data-w="${st.pct || 0}"></span></div><p class="muted small">Les deux fichiers sont lus et comparés sur cet appareil.</p></section>`;
  }
  if (st.status === 'error') return `${head}${slots}<div class="banner warn"><span>${esc(st.message)}</span></div>`;
  const s = r.stats;
  const balDiff = r.balance.filter((b) => Math.abs(b.ecart) >= 0.005).length;
  const res = r.synth.find((x) => x.strong);
  const same = !s.absent && !s.extra && !s.modified && !balDiff;
  const tile = (label, value, cls) => `<div class="kpi ${cls || ''}"><strong>${value}</strong><span>${label}</span></div>`;
  const per = r.period;
  const fullBox = per.differ ? `<label class="check"><input type="checkbox" data-cmp="full"${st.full ? ' checked' : ''}><span>Comparer aussi les écritures hors de la période commune</span></label>` : '';
  const counts = { ecritures: s.absent + s.extra + s.modified, balance: r.balance.filter((b) => !b.tiers && Math.abs(b.ecart) >= 0.005).length,
    tiers: r.balance.filter((b) => b.tiers && Math.abs(b.ecart) >= 0.005).length, an: r.balance.filter((b) => Math.abs(b.ecartAN) >= 0.005).length, corresp: r.maps.length + r.accountPairs.length };
  if (!CMP_TABS[st.tab]) st.tab = 'synthese';
  return `${head}${slots}
    ${r.warnings.map((w) => `<div class="banner warn"><span>${esc(w)}</span></div>`).join('')}
    ${per.differ ? `<div class="banner info cmp-period"><span>Les deux FEC ne couvrent pas la même période (référence : ${r.ref.start ? `du ${fmtDate(r.ref.start)} au ${fmtDate(r.ref.end)}` : '—'} ; comparé : ${r.cmp.start ? `du ${fmtDate(r.cmp.start)} au ${fmtDate(r.cmp.end)}` : '—'}).
      ${per.restricted ? `Seule la <strong>période commune, du ${fmtDate(per.start)} au ${fmtDate(per.end)}</strong>, est comparée : ${cmpN(per.outRef)} écriture(s) du FEC de référence et ${cmpN(per.outCmp)} du FEC comparé sont hors de cette période.` : 'Toutes les écritures sont comparées : celles qui sont hors de la période de l\'autre FEC apparaissent comme absentes ou en plus.'}</span>${fullBox}</div>` : ''}
    ${same ? `<div class="banner ok"><span><strong>Aucune différence</strong> : mêmes écritures${s.ventil ? ` (${cmpN(s.ventil)} ventilée(s) autrement)` : ''} et mêmes soldes dans les deux FEC${r.maps.length ? ', aux correspondances de comptes près' : ''}.</span></div>` : ''}
    <div class="kpis fec-kpis">
      ${tile('Écritures identiques', `${cmpN(s.identical + s.ventil)} / ${cmpN(s.refOps)}`)}
      ${tile('Absentes du FEC comparé', cmpN(s.absent), s.absent ? 'kpi-late' : '')}
      ${tile('En plus dans le FEC comparé', cmpN(s.extra), s.extra ? 'kpi-late' : '')}
      ${tile('Écritures modifiées', cmpN(s.modified), s.modified ? 'kpi-wait' : '')}
      ${tile('Comptes et tiers en écart', cmpN(balDiff), balDiff ? 'kpi-wait' : '')}
      ${tile('Écart de résultat (€)', res ? cmpEcart(res.ecart) || '0,00' : '—', res && Math.abs(res.ecart) >= 0.005 ? 'kpi-late' : '')}
    </div>
    <div class="seg fec-tabs" role="tablist">${Object.entries(CMP_TABS).map(([k, l]) => `<button role="tab" aria-selected="${k === st.tab}" class="${k === st.tab ? 'on' : ''}" data-action="cmp-tab" data-tab="${k}">${esc(l)}${counts[k] ? ` <span class="count">${cmpN(counts[k])}</span>` : ''}</button>`).join('')}</div>
    ${cmpTabBody(st, r)}`;
}

function onCmpChange(t) {
  const st = cmpState();
  if (t.dataset.cmp === 'full') { st.full = t.checked; cmpRun(); }
  else if (t.dataset.cmp === 'all') { st.all = t.checked; refresh(); }
}

// ---------- Export Excel ----------
async function cmpExport() {
  const st = cmpState();
  const r = st.res;
  if (!r) return;
  const ok = await ask({
    title: 'Fichier non chiffré',
    message: 'Le fichier Excel contient le détail des écritures des deux FEC (tiers, libellés, montants) <strong>non chiffré</strong>. Conservez-le dans le dossier du client, à l\'abri.',
    okLabel: 'Exporter',
  });
  if (!ok) return;
  const H = (cells) => cells.map((v) => ({ v, s: 1 }));
  const d = (iso) => (iso ? { v: XlsxWriter.serial(iso), s: 11 } : { v: '' });
  const m = (v) => ({ v: Math.round((Number(v) || 0) * 100) / 100, s: 8 });
  const t = (v) => ({ v: v === undefined || v === null ? '' : String(v) });
  const s = r.stats;
  const synth = [[{ v: 'Comparaison de FEC', s: 10 }], [],
    [t('FEC de référence'), t(r.ref.name), t(r.ref.start ? `du ${fmtDate(r.ref.start)} au ${fmtDate(r.ref.end)}` : ''), t(`${r.ref.entries} écritures`)],
    [t('FEC comparé'), t(r.cmp.name), t(r.cmp.start ? `du ${fmtDate(r.cmp.start)} au ${fmtDate(r.cmp.end)}` : ''), t(`${r.cmp.entries} écritures`)],
    [t('Période comparée'), t(r.period.start ? `du ${fmtDate(r.period.start)} au ${fmtDate(r.period.end)}${r.period.restricted ? ' (période commune)' : ''}` : '')], [],
    H(['Écritures', 'Nombre', 'Montant']),
    [t('Identiques'), { v: s.identical }], [t('Ventilées autrement (même total)'), { v: s.ventil }], [t('Absentes du FEC comparé'), { v: s.absent }, m(s.sumAbs)],
    [t('En plus dans le FEC comparé'), { v: s.extra }, m(s.sumExtra)], [t('Modifiées'), { v: s.modified }], [],
    H(['Chiffres clés', 'Référence', 'Comparé', 'Écart'])].concat(r.synth.map((x) => [t(x.label), m(x.ref), m(x.cmp), m(x.ecart)]));
  r.warnings.forEach((w) => synth.push([], [t(w)]));
  const lineHead = H(['Date', 'Journal', 'N° écriture', 'Pièce', 'Libellé', 'Compte', 'Compte auxiliaire', 'Libellé du compte', 'Débit', 'Crédit']);
  const lineRows = (list) => [lineHead].concat(list.flatMap((e) => e.lines.map((l) => [d(e.dt), t(e.j), t(e.n), t(e.p), t(l.l || e.l), t(l.cpt), t(l.aux), t(l.cl), m(l.d), m(l.c)])));
  const modRows = [H(['Date référence', 'Date comparé', 'Journal', 'N° écriture', 'Pièce', 'Libellé', 'Différence', 'Compte référence', 'Débit réf.', 'Crédit réf.', 'Compte comparé', 'Débit comparé', 'Crédit comparé', 'Écart'])];
  r.modified.forEach((x) => {
    const base = [d(x.ref.dt), d(x.cmp.dt), t(x.ref.j), t(x.ref.n), t(x.ref.p), t(x.ref.l)];
    if (!x.diffs.length) modRows.push(base.concat([t(`Date (${x.days > 0 ? '+' : ''}${x.days} j)`)]));
    x.diffs.forEach((y) => modRows.push(base.concat([t(CMP_TYPES[y.t] + (x.days ? ` ; date (${x.days > 0 ? '+' : ''}${x.days} j)` : '')),
      t(y.ref ? cmpAcct(y.ref) : ''), y.ref ? m(y.ref.d) : t(''), y.ref ? m(y.ref.c) : t(''), t(y.cmp ? cmpAcct(y.cmp) : ''), y.cmp ? m(y.cmp.d) : t(''), y.cmp ? m(y.cmp.c) : t(''), y.t === 'montant' ? m(y.ecart) : t('')])));
  });
  const balRows = [H(['Compte(s) référence', 'Compte(s) comparé', 'Libellé', 'Solde référence', 'Solde comparé', 'Écart', 'À-nouveau référence', 'À-nouveau comparé', 'Écart à-nouveau'])]
    .concat(r.balance.map((b) => [t(b.tiers ? b.root : b.refNums.join(', ')), t(b.tiers ? b.root : b.cmpNums.join(', ')), t(b.lib), m(b.ref), m(b.cmp), m(b.ecart), m(b.refAN), m(b.cmpAN), m(b.ecartAN)]));
  const grpRows = [H(['Période', 'Compte', 'Libellé', 'Sens', 'Montant', 'Lignes référence', 'Lignes comparé'])]
    .concat(r.groups.map((g) => [t(g.period === 'jour' ? fmtDate(g.dt) : g.dt), t(g.k.replace(/^T\d{3}:/, '')), t(g.lib), t(g.s > 0 ? 'Débit' : 'Crédit'), m(g.a), { v: g.nRef }, { v: g.nCmp }]));
  const corRows = [H(['Type', 'Référence', 'Libellé', 'Comparé', 'Libellé', 'Nombre'])]
    .concat(r.maps.map((x) => [t('Compte correspondant'), t(x.refNums.join(', ')), t(x.refLib), t(x.cmpNums.join(', ')), t(x.cmpLib), { v: x.n }]))
    .concat(r.accountPairs.map((x) => [t('Imputation différente'), t(x.ref), t(x.refLib), t(x.cmp), t(x.cmpLib), { v: x.n }]));
  const blob = XlsxWriter.build({ sheets: [
    { name: 'Synthèse', rows: synth, widths: [34, 44, 26, 16] },
    { name: 'Absentes', rows: lineRows(r.absent), widths: [11, 8, 10, 14, 40, 12, 14, 30, 13, 13], freeze: { row: 1 } },
    { name: 'En plus', rows: lineRows(r.extra), widths: [11, 8, 10, 14, 40, 12, 14, 30, 13, 13], freeze: { row: 1 } },
    { name: 'Modifiées', rows: modRows, widths: [11, 11, 8, 10, 14, 36, 18, 30, 12, 12, 30, 12, 12, 12], freeze: { row: 1 } },
    { name: 'Ventilations', rows: grpRows, widths: [11, 26, 30, 8, 13, 10, 10], freeze: { row: 1 } },
    { name: 'Balance', rows: balRows, widths: [18, 18, 36, 14, 14, 13, 14, 14, 13], freeze: { row: 1 } },
    { name: 'Correspondances', rows: corRows, widths: [22, 26, 30, 26, 30, 10], freeze: { row: 1 } },
  ] });
  const base = (r.ref.siren || 'fec') + '-comparaison';
  download(`${base}-${(r.period.end || r.ref.end || '').replace(/-/g, '')}.xlsx`, blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
