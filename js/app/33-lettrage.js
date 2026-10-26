/*
 * Suivi Dossiers — Lettrage proposé des comptes de tiers (fournisseurs, clients) d'après le grand livre non lettré
 * (PDF ou texte de l'édition « Grands-livres ») ou d'après un FEC.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- Lettrage proposé ----------
// Compte par compte, les factures les plus anciennes sont réglées en premier : factures et règlements, triés par date,
// sont cumulés tant que leurs totaux ne sont pas égaux ; à l'égalité, le groupe forme un lettrage. Les écritures restées
// ouvertes (une facture ancienne impayée bloque le cumul) sont ensuite rapprochées : montant identique (un règlement, une
// facture), puis facture réglée en plusieurs fois (plusieurs règlements dont la somme est son montant, les plus proches
// de sa date d'abord), puis règlement de plusieurs factures.
// Grand livre : « Compte <code> <nom> » ouvre chaque compte (répété en haut de page), puis une écriture par ligne (ou sur
// plusieurs lignes) : date, pièce, journal, libellé, montant et solde progressif ; le sens se déduit de la variation du
// solde. Un à-nouveau qui cite sa date et son journal d'origine (« 15/12/2025 -AC- ») les reprend. Seules les écritures
// des journaux d'achat et de règlement indiqués sont lettrées.
// FEC : lignes non lettrées des comptes 401 et 404 (ou 411) ; une écriture de banque ou de caisse est un règlement, une
// écriture de charges, de produits ou d'immobilisation une facture, quel que soit son journal.
// Tout reste en mémoire : rien n'est enregistré, et le verrouillage efface l'écran ; seuls les journaux sont retenus.

const lettState = () => (ui.lett = ui.lett || { src: '', fileName: '', text: '', fec: null, accs: [], msg: '', hide: true, q: '', tiers: 'frs', status: 'idle', runId: 0 });
function lettJournals() {
  const s = data.settings.lettrage || {};
  return { ja: s.ja !== undefined ? s.ja : 'AC, AH, HA, VT, VE', jr: s.jr !== undefined ? s.jr : 'OD, BQ, LCR' };
}
const lettList = (s) => String(s || '').toUpperCase().split(/[,;\s]+/).filter(Boolean);
const lettCents = (s) => Math.round(parseFloat(s.replace(/\s/g, '').replace(',', '.')) * 100);
const lettFmt = (c) => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const LETT_N = '(-?\\d{1,3}(?:\\s\\d{3})*,\\d{2})';
const LETT_END = new RegExp('(?<=\\s)' + LETT_N + '\\s+' + LETT_N + '\\s*$');
const LETT_NOISE = /Page - \d+|Grands-livres|Edition provisoire|^Du \d|^Date |^Pièce|^Débit|^Comp[ .]|^Total|^\d{6,8} - |^Let\./;

// Grand livre (texte) → comptes et écritures
function lettParseGl(text, JA, JR) {
  const accs = [];
  let cur = null, pend = null, prev = 0;
  const known = new Set([...JA, ...JR, 'AN', 'EI']);
  const fin = () => {
    const me = pend.t.match(LETT_END);
    if (!me) return false;
    const label = pend.t.slice(0, me.index).trim(), amt = lettCents(me[1]), bal = lettCents(me[2]), delta = bal - prev;
    prev = bal;
    let j = '?', d = pend.d;
    const mk = label.match(/(\d\d)\/(\d\d)\/(\d{4})\s+-([A-Z]{2,4})-/);
    if (mk) { j = mk[4]; d = `${mk[3]}-${mk[2]}-${mk[1]}`; }
    else j = label.split(/\s+/).find((t) => known.has(t)) || '?';
    const type = JA.includes(j) ? 'achat' : JR.includes(j) ? 'reglement' : 'autre';
    cur.lines.push({ d, date: fmtDate(pend.d), j, label: label.replace(/\s+/g, ' '), a: Math.abs(delta) || amt, side: delta > 0 ? 'D' : 'C', type, i: cur.lines.length });
    return true;
  };
  for (const raw of String(text).split('\n')) {
    const l = raw.trim();
    if (!l) continue;
    const mc = l.match(/^Com\s?pte\s+(\S+)\s*(.*)$/);
    if (mc && cur && cur.code === mc[1]) { pend = null; continue; }
    if (mc) { cur = { code: mc[1], name: mc[2], lines: [] }; accs.push(cur); prev = 0; pend = null; continue; }
    if (LETT_NOISE.test(l)) { pend = null; continue; }
    if (!cur) continue;
    const md = l.match(/^(\d\d)\/(\d\d)\/(\d{4})\s+(.*)$/);
    if (md) pend = { d: `${md[3]}-${md[2]}-${md[1]}`, t: md[4] };
    else if (pend) pend.t += ' ' + l;
    else continue;
    if (fin()) pend = null;
  }
  return accs;
}

// FEC (lignes non lettrées des comptes de tiers, voir lettOpen dans le moteur) → comptes et écritures
function lettFromFec(open, JA, JR, tiers) {
  const roots = tiers === 'cli' ? ['411'] : ['401', '404'];
  return open.accs.filter((a) => roots.includes(a.racine)).map((a) => {
    const lines = a.lines.map(([date, amt, jc, lib, piece, kind], i) => {
      const side = amt > 0 ? 'D' : 'C';
      // Facture : crédit d'un fournisseur, débit d'un client
      const inv = (side === 'C') === (tiers !== 'cli');
      const type = JA.includes(jc) ? 'achat' : JR.includes(jc) ? 'reglement' : !date || jc === 'AN' ? (inv ? 'achat' : 'reglement')
        : kind === 'b' ? 'reglement' : kind === 'c' ? 'achat' : 'autre';
      return { d: date || '0000-00-00', date: date ? fmtDate(date) : 'à-nouveau', j: date ? jc : 'AN', label: [piece, lib].filter(Boolean).join(' '), a: Math.round(Math.abs(amt) * 100), side, type, i };
    });
    return { code: a.num, name: a.lib, lines };
  });
}

// Lettrage d'un compte : les plus anciennes d'abord, puis montants identiques
function lettRun(a) {
  const L = a.lines.filter((x) => x.type !== 'autre');
  const key = (x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : x.i - y.i);
  const C = L.filter((x) => x.side === 'C').sort(key), D = L.filter((x) => x.side === 'D').sort(key);
  let n = 0;
  const nxt = () => { const k = n++; return String.fromCharCode(65 + (Math.floor(k / 26) % 26)) + String.fromCharCode(65 + (k % 26)); };
  a.groups = [];
  let ic = 0, id = 0, sc = 0, sd = 0, gc = [], gd = [];
  while (ic < C.length || id < D.length) {
    if (sc <= sd && ic < C.length) { sc += C[ic].a; gc.push(C[ic++]); }
    else if (id < D.length) { sd += D[id].a; gd.push(D[id++]); }
    else break;
    if (sc === sd && gc.length && gd.length) { a.groups.push({ l: nxt(), m: 'Plus anciennes d\'abord', lines: [...gc, ...gd] }); gc = []; gd = []; sc = sd = 0; }
  }
  const rc = [...gc, ...C.slice(ic)], rd = [...gd, ...D.slice(id)];
  const used = new Set();
  rd.forEach((d) => { const k = rc.findIndex((c) => c.a === d.a); if (k >= 0) { const c = rc.splice(k, 1)[0]; used.add(d); a.groups.push({ l: nxt(), m: 'Montant identique', lines: [c, d] }); } });
  // Une écriture d'un côté, plusieurs de l'autre : facture réglée en plusieurs fois, puis règlement de plusieurs factures
  const open = [...rc, ...rd.filter((d) => !used.has(d))].sort(key);
  const done = new Set();
  // Compte très chargé (compte collectif « clients divers », ventes en carte) : deux règlements par facture au plus, parmi
  // les dix plus proches, sauf s'ils citent sa référence ou son nom ; sinon jusqu'à quatre parmi vingt. Une somme exacte de
  // nombreux règlements a d'autant plus de chances de tomber juste par hasard qu'il y a d'écritures ouvertes.
  const crowded = open.length > 80;
  [['achat', 'reglement', 'Plusieurs règlements'], ['reglement', 'achat', 'Règlement de plusieurs factures']].forEach(([one, many, m]) => {
    open.filter((x) => x.type === one).forEach((x) => {
      if (done.has(x)) return;
      // Règlements d'un an avant (acomptes) à six mois après la facture ; factures d'un an avant à un mois après le
      // règlement. Ceux qui citent la même référence ou le même nom d'abord, puis les plus proches en date.
      const days = (y) => (Date.parse(y.d) - Date.parse(x.d)) / 864e5 * (one === 'achat' ? 1 : -1);
      const [lo, hi] = one === 'achat' ? [-366, 183] : [-31, 366];
      const dated = !x.d.startsWith('0000');
      const tx = lettTok(x.label);
      const near = (y) => { for (const w of lettTok(y.label)) if (tx.has(w)) return 1; return 0; };
      const cands = open.filter((y) => !done.has(y) && y.type === many && y.side !== x.side && y.a < x.a && (!dated || y.d.startsWith('0000') || (days(y) >= lo && days(y) <= hi)))
        .map((y) => ({ y, s: near(y), dd: Math.abs(days(y) || 0) }));
      cands.sort((p, q) => q.s - p.s || p.dd - q.dd || p.y.i - q.y.i);
      const cited = cands.filter((c) => c.s);
      const pick = (cited.length >= 2 && lettSubset(x.a, cited.slice(0, 20).map((c) => c.y), 4))
        || lettSubset(x.a, cands.slice(0, crowded ? 10 : 20).map((c) => c.y), crowded ? 2 : 4);
      if (!pick) return;
      done.add(x);
      pick.forEach((y) => done.add(y));
      a.groups.push({ l: nxt(), m, lines: [x, ...pick] });
    });
  });
  a.rest = open.filter((x) => !done.has(x));
  a.bal = L.reduce((s, x) => s + (x.side === 'D' ? x.a : -x.a), 0);
  a.skipped = a.lines.filter((x) => x.type === 'autre').length;
  a.map = new Map();
  a.groups.forEach((g) => g.lines.forEach((x) => a.map.set(x, g)));
  return a;
}

// Mots qui rapprochent une facture de ses règlements : nom (au moins 4 lettres), référence (au moins 3 chiffres :
// « F100 », « 2026-011 », hors années seules), hors mots courants des libellés de règlement
const LETT_STOP = new Set(['facture', 'factures', 'client', 'clients', 'fournisseur', 'virement', 'sepa', 'cheque', 'paiement', 'reglement', 'acompte', 'solde', 'remise', 'recu', 'prlv', 'prelevement', 'avoir', 'divers', 'carte']);
const lettTok = (s) => new Set(norm(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => ((/\d{3,}/.test(w) && !/^(19|20)\d\d$/.test(w)) || (w.length >= 4 && !/\d/.test(w))) && !LETT_STOP.has(w)));

// Sous-ensemble de `cands` (dans l'ordre de préférence) dont la somme fait exactement `target` (centimes) : au plus
// maxK écritures, recherche bornée (le premier trouvé, donc le plus proche en date, est retenu).
function lettSubset(target, cands, maxK = 6, budget = 30000) {
  const suf = [];
  for (let i = cands.length - 1, t = 0; i >= 0; i--) { t += cands[i].a; suf[i] = t; }
  const pick = [];
  let steps = 0;
  // Exactement k écritures, pour k = 2, 3… : la solution la plus courte d'abord
  const dfs = (i, rem, k) => {
    if (pick.length === k) return rem === 0;
    if (i >= cands.length || suf[i] < rem) return false;
    for (let j = i; j <= cands.length - (k - pick.length); j++) {
      if (++steps > budget) return false;
      if (cands[j].a > rem) continue;
      pick.push(cands[j]);
      if (dfs(j + 1, rem - cands[j].a, k)) return true;
      pick.pop();
    }
    return false;
  };
  for (let k = 2; k <= Math.min(maxK, cands.length); k++) if (dfs(0, target, k)) return pick.slice();
  return null;
}

// Calcul d'après la source chargée (grand livre ou FEC) et les journaux indiqués
function lettCompute() {
  const st = lettState();
  const { ja, jr } = lettJournals();
  const JA = lettList(ja), JR = lettList(jr);
  st.accs = (st.src === 'fec' && st.fec ? lettFromFec(st.fec.open, JA, JR, st.tiers) : st.src === 'gl' ? lettParseGl(st.text, JA, JR) : []).map(lettRun);
  const nl = st.accs.reduce((t, a) => t + a.lines.length, 0);
  if (st.src === 'gl') st.msg = st.accs.length ? `${st.accs.length} compte(s) lu(s), ${nl} écriture(s).` : 'Aucun compte reconnu : le texte doit contenir les lignes « Compte … » et les écritures datées.';
  else if (st.src === 'fec') st.msg = `${st.accs.length} compte(s) ${st.tiers === 'cli' ? 'clients' : 'fournisseurs'} avec des écritures non lettrées, ${nl} écriture(s)${st.fec.open.truncated ? ' (FEC très volumineux : liste tronquée)' : ''}.`;
}
const lettRefresh = () => { if (location.hash.startsWith('#/lettrage')) refresh(); };

async function lettFile(file) {
  if (!file) return;
  const st = lettState();
  const run = ++st.runId;
  Object.assign(st, { fileName: file.name, status: 'running', msg: 'Lecture du fichier…', accs: [] });
  lettRefresh();
  try {
    if (/\.pdf$/i.test(file.name)) {
      const doc = await PdfReader.read(await file.arrayBuffer());
      const text = doc.pages.map((p) => PdfReader.lines(p).map((l) => l.text).join('\n')).join('\n');
      if (run !== st.runId) return;
      Object.assign(st, { src: 'gl', text, fec: null, status: 'done' });
      if (!text.trim()) { st.msg = 'Ce PDF ne contient pas de texte (document scanné) : collez le texte du grand livre dans la zone prévue.'; return lettRefresh(); }
    } else if (/\.zip$/i.test(file.name) || /journalcode/i.test(await file.slice(0, 400).text().catch(() => ''))) {
      st.msg = 'Analyse du FEC…';
      lettRefresh();
      const r = await lettFecResult(file);
      if (run !== st.runId) return;
      Object.assign(st, { src: 'fec', fec: { open: r.lettOpen, name: file.name, siren: r.meta.siren }, text: '', status: 'done' });
    } else {
      const text = await file.text();
      if (run !== st.runId) return;
      Object.assign(st, { src: 'gl', text, fec: null, status: 'done' });
    }
    lettCompute();
  } catch (e) {
    if (run !== st.runId) return;
    Object.assign(st, { status: 'error', msg: `Lecture impossible (${e.message || e}). Copiez le texte du grand livre et collez-le dans la zone prévue.` });
  }
  lettRefresh();
}
function lettFecResult(file) {
  return fecSource(file).then(({ buffer, name }) => new Promise((resolve, reject) => {
    const w = new Worker('js/fec-worker.js?v=' + ASSET_VERSION);
    w.onmessage = (e) => {
      if (e.data.type === 'progress') return;
      w.terminate();
      if (e.data.type === 'done') resolve(e.data.result); else reject(new Error(e.data.message));
    };
    w.onerror = (err) => { w.terminate(); reject(new Error(err.message || "Erreur pendant l'analyse du FEC.")); };
    w.postMessage({ buffer, fileName: name }, [buffer]);
  }));
}
function lettUseOpenFec() {
  const st = lettState();
  const r = ui.fec && ui.fec.result;
  if (!r || !r.lettOpen) return;
  st.runId++;
  Object.assign(st, { src: 'fec', fec: { open: r.lettOpen, name: r.meta.fileName, siren: r.meta.siren }, text: '', fileName: r.meta.fileName, status: 'done' });
  lettCompute();
  lettRefresh();
}
function lettText(text) {
  const st = lettState();
  st.runId++;
  Object.assign(st, { src: 'gl', text: String(text || ''), fec: null, fileName: 'texte collé', status: 'done' });
  lettCompute();
  lettRefresh();
}

function lettTotals(accs) {
  let nl = 0, ng = 0, mt = 0, nr = 0;
  accs.forEach((a) => { a.groups.forEach((g) => { ng++; nl += g.lines.length; mt += g.lines.filter((x) => x.side === 'D').reduce((s, x) => s + x.a, 0); }); nr += a.rest.length; });
  return { nl, ng, mt, nr };
}

function viewLettrage() {
  const st = lettState();
  const { ja, jr } = lettJournals();
  const accs = st.accs;
  const T = lettTotals(accs);
  const q = norm(st.q || '');
  const shown = accs.filter((a) => a.lines.length && (!st.hide || a.groups.length) && (!q || norm(`${a.code} ${a.name}`).includes(q)));
  const openFec = ui.fec && ui.fec.result && ui.fec.result.lettOpen ? ui.fec.result.meta.fileName : '';
  const kindOf = (x, g) => (g ? `<span class="lett-l" title="${esc(g.m)}">${esc(g.l)}</span>${g.m === 'Plusieurs règlements' || g.m === 'Règlement de plusieurs factures' ? ` <span class="muted small">${g.m === 'Plusieurs règlements' ? 'en plusieurs fois' : 'plusieurs factures'}</span>` : ''}` : x.type === 'autre' ? '<span class="muted" title="Journal ni d\'achat ni de règlement : non lettré">—</span>' : '<span class="lett-open">ouvert</span>');
  return `<div class="page-head"><h1>Lettrage des comptes de tiers</h1>
      <div class="head-actions">${accs.some((a) => a.groups.length) ? '<button class="btn" data-action="lett-copy">Copier les lettrages (tableur)</button><button class="btn" data-action="lett-xlsx">Exporter en Excel</button>' : ''}${st.src ? '<button class="btn" data-action="lett-clear">Effacer</button>' : ''}</div></div>
    <p class="muted">Chargez le grand livre non lettré (PDF de l'édition « Grands-livres », ou son texte) ou un FEC : l'outil propose, compte par compte, les écritures à lettrer en réglant d'abord les factures les plus anciennes, puis en rapprochant les montants identiques, les factures réglées en plusieurs fois et les règlements de plusieurs factures. Rien n'est envoyé ni conservé.</p>
    <div class="fec-drop card" data-action="lett-pick" role="button" tabindex="0">
      ${icon('file', 'fec-drop-ico')}
      <p><strong>${st.fileName ? esc(st.fileName) : 'Sélectionnez ou déposez ici le grand livre (PDF, texte) ou un FEC'}</strong></p>
      <p class="muted small">${st.status === 'running' ? esc(st.msg) : 'Grand livre de l\'édition « Grands-livres » (ACD…) non lettré, ou FEC (.txt, .csv, .zip) : seules ses écritures non lettrées sont reprises.'}</p>
    </div>
    <section class="card">
      <div class="lett-opts">
        <label>Journaux d'achat (ou de vente) <input data-lett="ja" value="${esc(ja)}"></label>
        <label>Journaux de règlement <input data-lett="jr" value="${esc(jr)}"></label>
        ${st.src === 'fec' ? `<label>Comptes <select data-lett="tiers">${options({ frs: 'Fournisseurs (401, 404)', cli: 'Clients (411)' }, st.tiers)}</select></label>` : ''}
        ${openFec && !(st.src === 'fec' && st.fec && st.fec.name === openFec) ? `<button class="btn" data-action="lett-fec">Utiliser le FEC ouvert (${esc(openFec)})</button>` : ''}
      </div>
      <p class="muted small">${st.src === 'fec' ? 'FEC : une écriture de banque ou de caisse est un règlement, une écriture de charges, de produits ou d\'immobilisation une facture ; les journaux indiqués priment.' : 'Grand livre : seules les écritures des journaux indiqués sont lettrées ; les autres restent affichées (« — »).'}</p>
      <details class="lett-paste"><summary>Ou coller le texte du grand livre</summary>
        <textarea id="lett-tx" rows="5" placeholder="Compte FDEMO FOURNISSEUR DEMO&#10;10/08/2026 B0001 AC FOURNISSEUR DEMO F-101 1 250,00 -1 250,00">${st.src === 'gl' && st.fileName === 'texte collé' ? esc(st.text) : ''}</textarea>
        <button class="btn" data-action="lett-text">Analyser le texte</button></details>
      ${st.msg && st.status !== 'running' ? `<p class="${st.status === 'error' || !accs.length ? 'late' : 'muted'} small" role="status">${esc(st.msg)}</p>` : ''}
    </section>
    ${accs.length ? `<div class="kpis fec-kpis">
      ${kpiTile('Lettrages proposés', T.ng)}${kpiTile('Écritures à lettrer', T.nl)}${kpiTile('Montant lettrable', `${lettFmt(T.mt)} €`)}${kpiTile('Écritures restant ouvertes', T.nr, T.nr ? 'kpi-wait' : '')}
    </div>
    <div class="lett-opts">
      <label class="check inline"><input type="checkbox" data-lett="hide"${st.hide ? ' checked' : ''}> Masquer les comptes sans lettrage possible</label>
      <label>Rechercher <input type="search" data-lett="q" value="${esc(st.q || '')}" placeholder="compte ou nom"></label>
    </div>
    ${shown.map((a) => {
      const ok = !a.rest.length && a.groups.length;
      const rows = a.lines.slice().sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : x.i - y.i));
      return `<details class="card lett-acc"${ok ? '' : ' open'}><summary><strong>${esc(a.code)}</strong> <span class="muted">${esc(a.name)} · ${a.groups.length} lettrage(s)${(() => { const k = a.groups.filter((g) => g.m === 'Plusieurs règlements').length; return k ? ` dont ${k} en plusieurs règlements` : ''; })()} · ${a.rest.length} ouverte(s)</span> <span class="badge ${ok ? 'ok' : 'wait'}">${ok ? 'Soldé' : `Solde ouvert ${lettFmt(Math.abs(a.bal))} €`}</span></summary>
        <div class="grid-wrap"><table class="dtable lett-t"><thead><tr><th>Lettre</th><th>Date</th><th>Jnl</th><th>Libellé</th><th class="n">Débit</th><th class="n">Crédit</th></tr></thead><tbody>
        ${rows.map((x) => { const g = a.map.get(x); return `<tr class="${x.type === 'autre' ? 'muted' : g ? '' : 'lett-o'}"><td>${kindOf(x, g)}</td><td>${esc(x.date)}</td><td>${esc(x.j)}</td><td class="lbl">${esc(x.label)}</td><td class="n">${x.side === 'D' ? lettFmt(x.a) : ''}</td><td class="n">${x.side === 'C' ? lettFmt(x.a) : ''}</td></tr>`; }).join('')}
        </tbody></table></div>${a.skipped ? `<p class="muted small">${a.skipped} écriture(s) hors journaux d'achat et de règlement, non lettrée(s).</p>` : ''}</details>`;
    }).join('')}
    ${!accs.some((a) => a.groups.length) ? '<section class="card"><p class="muted">Aucun lettrage possible avec les journaux indiqués.</p></section>' : !shown.length ? '<p class="muted">Aucun compte ne correspond à la recherche.</p>' : ''}` : ''}`;
}

function onLettChange(t) {
  const st = lettState();
  const k = t.dataset.lett;
  if (k === 'ja' || k === 'jr') {
    data.settings.lettrage = Object.assign(lettJournals(), { [k]: t.value.trim() });
    persist();
    lettCompute();
  } else if (k === 'tiers') { st.tiers = t.value; lettCompute(); }
  else if (k === 'hide') st.hide = t.checked;
  else if (k === 'q') st.q = t.value;
  refresh();
}

function lettRows() {
  const out = [];
  lettState().accs.forEach((a) => a.groups.forEach((g) => g.lines.forEach((x) => out.push({ a, g, x }))));
  return out;
}
async function lettCopy() {
  const t = ['Compte\tLettre\tDate\tJournal\tLibellé\tDébit\tCrédit'];
  lettRows().forEach(({ a, g, x }) => t.push([a.code, g.l, x.date, x.j, x.label, x.side === 'D' ? lettFmt(x.a) : '', x.side === 'C' ? lettFmt(x.a) : ''].join('\t')));
  try { await navigator.clipboard.writeText(t.join('\n')); toast('Lettrages copiés : collez-les dans Excel.'); } catch (e) { toast('Copie impossible sur ce navigateur.', true); }
}
async function lettExport() {
  const ok = await ask({ title: 'Fichier non chiffré', message: 'Le classeur contient les écritures et les noms des tiers <strong>non chiffrés</strong>. Supprimez-le après usage.', okLabel: 'Exporter' });
  if (!ok) return;
  const st = lettState();
  const t = (v, s) => ({ v: v === undefined || v === null ? '' : v, s: s === undefined ? 2 : s });
  const n = (c) => ({ v: c / 100, s: 8 });
  const H = (cells) => cells.map((x) => t(x, 1));
  const amounts = (x) => [x.side === 'D' ? n(x.a) : t(''), x.side === 'C' ? n(x.a) : t('')];
  const lett = [H(['Compte', 'Nom', 'Lettre', 'Méthode', 'Date', 'Journal', 'Libellé', 'Débit', 'Crédit'])]
    .concat(lettRows().map(({ a, g, x }) => [t(a.code), t(a.name), t(g.l), t(g.m), t(x.date), t(x.j), t(x.label)].concat(amounts(x))));
  const open = [H(['Compte', 'Nom', 'Date', 'Journal', 'Libellé', 'Débit', 'Crédit'])];
  st.accs.forEach((a) => a.rest.slice().sort((x, y) => (x.d < y.d ? -1 : 1)).forEach((x) => open.push([t(a.code), t(a.name), t(x.date), t(x.j), t(x.label)].concat(amounts(x)))));
  const syn = [H(['Compte', 'Nom', 'Lettrages', 'Écritures lettrées', 'Écritures ouvertes', 'Solde ouvert'])]
    .concat(st.accs.filter((a) => a.lines.length).map((a) => [t(a.code), t(a.name), { v: a.groups.length, s: 2 }, { v: a.groups.reduce((s, g) => s + g.lines.length, 0), s: 2 }, { v: a.rest.length, s: 2 }, n(a.bal)]));
  const blob = XlsxWriter.build({ sheets: [
    { name: 'Lettrages', rows: lett, widths: [14, 30, 8, 22, 12, 8, 50, 14, 14], freeze: { row: 1 } },
    { name: 'Écritures ouvertes', rows: open, widths: [14, 30, 12, 8, 50, 14, 14], freeze: { row: 1 } },
    { name: 'Synthèse', rows: syn, widths: [14, 34, 10, 12, 12, 14], freeze: { row: 1 } },
  ] });
  download(`lettrage-${(st.fec && st.fec.siren) || 'grand-livre'}-${todayStr()}.xlsx`, blob, blob.type);
}
