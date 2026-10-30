/*
 * Suivi Dossiers — Cycle G : rapprochement du FEC de l'analyse avec l'état des immobilisations du module immo
 * (lecture et calcul dans js/immo-etat.js).
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- Cycle G : FEC / état des immobilisations ----------
// L'état (PDF texte édité depuis le module immo, ou son texte collé) est déposé dans le cycle G ; le FEC de l'analyse est
// relu (seules les écritures qui mouvementent une immobilisation sont gardées). Le détail reste en mémoire le temps de
// l'analyse ; la synthèse (écritures sans fiche, écart de chaque compte) est enregistrée dans la feuille de l'exercice :
// contrôles du cycle G, pièce « Tableau des immobilisations » établie, colonne « Selon pièce » des comptes (valeur brute
// de fin de l'état, quand le FEC a ses à-nouveaux).

const ieEur = (c) => eur((c || 0) / 100);
const ieNeg = (c) => `<span class="${c < 0 ? 'cred' : ''}">${ieEur(c)}</span>`;
const ieDmy = (d) => (d && d.length === 8 ? `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}` : '');
const immoEtatSummary = () => wpStore().immoEtat || null;
const ieState = () => (ui.fec.immoEtat = ui.fec.immoEtat || { etat: null, name: '', err: '', busy: false, fec: null, res: null });
const IE_ST = { ok: ['ok', 'Concorde'], explained: ['just', 'Écart expliqué'], open: ['anom', 'Écart à expliquer'], absent: ['anom', 'Absent de l’état'] };
const ieStatus = (x) => (x.inEtat === false ? 'absent' : x.status);

async function ieFec(st) {
  if (st.fec) return st.fec;
  const f = ui.fec;
  if (!f.file) throw new Error("le FEC de cette analyse n'est plus en mémoire : relancez l'analyse du FEC pour faire le rapprochement");
  const src = await fecSource(f.file);
  st.fec = ImmoEtat.readFec(socDecode(new Uint8Array(src.buffer)));
  return st.fec;
}

// État déposé (PDF) ou collé (texte)
async function immoEtatLoad(file, text) {
  const f = ui.fec;
  if (!f || !f.result || (!file && !String(text || '').trim())) return;
  const st = ieState(), name = file ? file.name : 'Texte collé';
  Object.assign(st, { busy: true, err: '' });
  refresh();
  try {
    let rows;
    if (file) {
      rows = ImmoEtat.rowsFromPdf(await PdfReader.read(await file.arrayBuffer()), PdfReader);
      if (!rows.some((x) => x.texts.length || x.amts)) throw new Error('ce PDF ne contient pas de texte (document scanné ?) : rééditez l’état depuis le logiciel, ou collez son texte');
    } else rows = ImmoEtat.rowsFromText(text);
    const etat = ImmoEtat.parse(rows);
    if (!etat.order.length) throw new Error('aucune ligne « Compte n° » : ce document ne ressemble pas à un état des immobilisations');
    Object.assign(st, { etat, name, res: ImmoEtat.reconcile(await ieFec(st), etat) });
    if (ui.fec === f) ieSave(st);
  } catch (e) {
    st.err = `${name} : ${e.message || e}`;
  }
  st.busy = false;
  if (ui.fec === f) refresh();
}

function ieSave(st) {
  const ws = wpStore(), res = st.res;
  ws.immoEtat = { at: nowIso(), file: st.name, company: st.etat.company, hasRan: res.hasRan, totals: res.totals,
    missing: res.missing.map((m) => ({ date: m.date, piece: m.piece, supplier: m.supplier || m.lib, compte: m.compte, amt: m.amt })),
    extra: res.extraCredits.length, orphans: res.orphanFiches.length, sorties: res.orphanSorties.length,
    rows: res.rows.map((x) => ({ num: x.num, label: x.label, ecart: x.ecart, residual: x.residual, status: ieStatus(x) })) };
  // Valeur brute de fin de l'état dans la colonne « Selon pièce » (un seul compte du FEC pour le compte de l'état)
  if (res.hasRan) {
    const fecAccs = balOf(ui.fec.result, ['2']).filter((b) => !/^2[89]/.test(b.compte));
    res.rows.filter((x) => x.immo).forEach((x) => {
      const l = fecAccs.filter((b) => ImmoEtat.normAcct(b.compte) === x.n);
      if (l.length === 1) (ws.soldes = ws.soldes || {})[l[0].compte] = x.immo.fin / 100;
    });
  }
  wpSave();
}

// Contrôles du cycle G
function immoEtatChecks(r, out) {
  const sv = immoEtatSummary();
  if (!sv) {
    if (balOf(r, ['20', '21', '22', '23']).some((b) => Math.abs(b.s) >= 1 || b.dm >= 1)) out.add('info', 'Rapprochement avec l’état des immobilisations à faire', 'Déposez l’état des immobilisations édité depuis le module immo (PDF) dans le cadre « État des immobilisations » de ce cycle : les acquisitions sans fiche et les écarts de solde sont listés.');
    return;
  }
  const n = sv.missing.length;
  if (n) out.add('warn', `${n} acquisition${n > 1 ? 's' : ''} sans fiche dans le module immo`, `${ieEur(sv.totals.missingHT)} € HT à immobiliser (fiches à créer d'après l'état ${sv.file}).`, sv.missing.map((m) => `${ieDmy(m.date)} · ${m.compte} · ${m.supplier} : ${ieEur(m.amt)} €`));
  const open = sv.rows.filter((x) => x.status === 'open' || x.status === 'absent');
  open.forEach((x) => out.add('warn', `${x.num} ${x.label} : écart avec l’état des immobilisations`, x.status === 'absent' ? `Compte absent de l’état : ${ieEur(x.ecart)} € dans le FEC.` : `Écart FEC − état de ${ieEur(x.ecart)} €, dont ${ieEur(x.residual)} € non expliqués par les écritures sans fiche.`));
  if (!n && !open.length) out.add('ok', 'État des immobilisations concordant avec le FEC', `Chaque acquisition a sa fiche et le solde de chaque compte concorde (état ${sv.file}).`);
}

// ---------- Affichage ----------
function ieMissingTable(list, empty) {
  const hint = (h) => (h.type === 'otherAcct' ? `Même montant sur la fiche ${esc(h.code)} (compte ${esc(h.acct)}) : vérifier l’imputation` : 'Reclassement entre comptes d’immobilisations');
  const rows = list.map((m) => `<tr><td>${ieDmy(m.date)}</td><td>${esc(m.jc)} ${esc(m.num)}</td><td>${esc(m.piece || '—')}</td>
    <td class="ie-lib"><strong>${esc(m.supplier || m.lib || '—')}</strong>${m.supplier && m.lib && m.lib !== m.supplier ? `<span class="muted small"> ${esc(m.lib)}</span>` : ''}${m.hints.map((h) => `<span class="ie-hint">${hint(h)}</span>`).join('')}</td>
    <td>${esc(m.compte)}</td><td class="n">${ieNeg(m.amt)}</td><td class="n">${m.tva ? ieEur(m.tva) : '—'}</td><td class="n">${m.ttc ? ieEur(m.ttc) : '—'}</td></tr>`).join('');
  const t = list.reduce((a, m) => ({ ht: a.ht + m.amt, tva: a.tva + m.tva, ttc: a.ttc + m.ttc }), { ht: 0, tva: 0, ttc: 0 });
  return `<div class="grid-wrap"><table class="dtable ie-t"><thead><tr><th>Date</th><th>Journal</th><th>Pièce</th><th>Fournisseur · libellé</th><th>Compte</th><th class="n">HT</th><th class="n">TVA</th><th class="n">TTC</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="8" class="muted">${empty}</td></tr>`}</tbody>
    ${list.length ? `<tfoot><tr><td colspan="5">Total : ${list.length} écriture${list.length > 1 ? 's' : ''}</td><td class="n">${ieNeg(t.ht)}</td><td class="n">${ieEur(t.tva)}</td><td class="n">${ieEur(t.ttc)}</td></tr></tfoot>` : ''}</table></div>`;
}

function ieResults(st) {
  const res = st.res, t = res.totals, n = res.missing.length, ran = res.hasRan;
  const sub = n === 0 && t.residual === 0 ? 'Chaque acquisition du FEC a sa fiche et les soldes des comptes concordent avec l’état.'
    : t.residual === 0 ? `L’écart entre le FEC et l’état (${ieEur(t.ecart)} €) est entièrement expliqué par ${n > 1 ? 'ces écritures' : 'cette écriture'}.`
      : `Il reste ${ieEur(t.residual)} € d’écart à expliquer après ${n ? (n > 1 ? 'ces écritures' : 'cette écriture') : 'rapprochement'} : voir le contrôle par compte.`;
  let h = `<p class="muted small">${esc(st.name)}${st.etat.company ? ` · ${esc(st.etat.company)}` : ''}${st.etat.period ? ` · exercice du ${ieDmy(st.etat.period.start)} au ${ieDmy(st.etat.period.end)}` : ''} · ${st.etat.order.length} comptes, ${st.etat.fiches} fiches
      ${st.etat.order.every((k) => st.etat.accounts[k].readOk) ? '<span class="soc-chip ok">Lecture contrôlée sur les sous-totaux</span>' : '<span class="soc-chip just">Sous-totaux non retrouvés sur certains comptes</span>'}</p>
    <div class="ie-verdict"><span class="ie-fig ${n ? 'late' : 'ok'}">${n}</span><div><strong>${n > 1 ? 'écritures à créer' : n ? 'écriture à créer' : 'écriture manquante'} dans le module immo</strong>
      <p class="muted small">${sub} HT ${ieEur(t.missingHT)} €, TVA ${ieEur(t.missingTVA)} €, TTC ${ieEur(t.missingTTC)} € · écart FEC − état ${ieEur(t.ecart)} € · acquisitions de l’exercice : ${t.nAcqFec} ligne(s), ${ieEur(t.acqFec)} €.</p></div>
      <span class="soc-chip ${t.residual === 0 ? 'ok' : 'anom'}">${t.residual === 0 ? (n ? 'Écart entièrement expliqué' : 'Rien à signaler') : `Écart résiduel ${ieEur(t.residual)} €`}</span></div>
    ${res.warnings.map((w) => `<div class="banner info"><span>${esc(w)}</span></div>`).join('')}
    <h3>Écritures sans fiche dans le module immo ${n ? '<button class="btn small" data-action="immo-etat-copy" data-what="missing">Copier pour Excel</button>' : ''}</h3>
    <p class="muted small">Lignes passées au débit d’un compte d’immobilisation sans fiche correspondante : les fiches à créer. Fournisseur, TVA et TTC viennent des autres lignes de l’écriture (40 et 445).</p>
    ${ieMissingTable(res.missing, 'Toutes les acquisitions du FEC ont une fiche dans le module.')}
    <h3>Contrôle par compte <button class="btn small" data-action="immo-etat-copy" data-what="accounts">Copier pour Excel</button></h3>
    <p class="muted small">${ran ? 'Solde du FEC (à-nouveau + mouvements) comparé à la valeur brute de fin de l’état.' : 'Mouvements du FEC comparés aux colonnes acquisitions − sorties de l’état.'}</p>
    <div class="grid-wrap"><table class="dtable ie-t"><thead><tr><th>Compte</th><th>Libellé</th>${ran ? '<th class="n">À-nouveau FEC</th>' : ''}<th class="n">Mouvements FEC</th><th class="n">${ran ? 'Solde FEC' : 'Net FEC'}</th><th class="n">${ran ? 'Valeur brute fin (état)' : 'Acq. − sorties (état)'}</th><th class="n">Écart</th><th>Statut</th></tr></thead><tbody>
    ${res.rows.map((x) => {
      const [cls, lab] = IE_ST[ieStatus(x)];
      return `<tr><td>${esc(x.num)}</td><td class="ie-lib">${esc(x.label)}${x.readOk ? '' : '<span class="ie-hint">Lecture du sous-total à vérifier</span>'}${x.fecVsCompta ? `<span class="ie-hint">Solde FEC ≠ ligne « comptabilité » de l’état (${ieEur(x.fecVsCompta)})</span>` : ''}</td>
        ${ran ? `<td class="n">${ieEur(x.fecRan)}</td>` : ''}<td class="n">${ieNeg(x.fecMvt)}</td><td class="n">${ieEur(ran ? x.fecFin : x.fecMvt)}</td><td class="n">${x.immo ? ieEur(ran ? x.immo.fin : x.immo.acq - x.immo.sor) : '—'}</td>
        <td class="n">${x.ecart ? ieNeg(x.ecart) : '0,00'}</td><td><span class="soc-chip ${cls}">${x.status === 'open' && x.inEtat ? `${ieEur(x.residual)} à expliquer` : lab}</span></td></tr>`;
    }).join('')}</tbody></table></div>`;
  if (res.extraCredits.length || res.orphanSorties.length) {
    h += `<h3>Sorties et avoirs à vérifier</h3><p class="muted small">Crédits passés sur des comptes d’immobilisations sans sortie correspondante dans le module, et sorties du module sans écriture dans le FEC.</p>
      ${res.extraCredits.length ? ieMissingTable(res.extraCredits, '') : ''}
      ${res.orphanSorties.length ? `<div class="grid-wrap"><table class="dtable ie-t"><thead><tr><th>Compte</th><th>Fiche</th><th>Libellé</th><th class="n">Sortie</th></tr></thead><tbody>${res.orphanSorties.map((f) => `<tr><td>${esc((st.etat.accounts[f.acct] || {}).num || f.acct)}</td><td>${esc(f.code)}</td><td>${esc(f.label)}</td><td class="n">${ieEur(f.sor)}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  }
  if (res.orphanFiches.length) {
    h += `<details class="soc-det ie-orph"${res.orphanFiches.some((f) => f.acctStatus !== 'ok') ? ' open' : ''}><summary>Fiches du module sans écriture dans le FEC (${res.orphanFiches.length})</summary>
      <p class="muted small">Acquisition de l’exercice sur l’état sans écriture correspondante. Si le solde du compte concorde, ce sont en général des acquisitions antérieures au début du FEC, comprises dans l’à-nouveau.</p>
      <div class="grid-wrap"><table class="dtable ie-t"><thead><tr><th>Compte</th><th>Fiche</th><th>Libellé</th><th class="n">Acquisition</th><th>Statut</th></tr></thead><tbody>${res.orphanFiches.map((f) => `<tr><td>${esc((st.etat.accounts[f.acct] || {}).num || f.acct)}</td><td>${esc(f.code)}</td>
        <td class="ie-lib">${esc(f.label)}${f.hint ? `<span class="ie-hint">Même montant que ${esc(f.hint.supplier)} (compte ${esc(f.hint.compte)})</span>` : ''}</td><td class="n">${ieEur(f.acq)}</td>
        <td><span class="soc-chip ${f.acctStatus === 'ok' ? 'ok' : 'anom'}">${f.acctStatus === 'ok' ? 'Solde concordant' : 'À vérifier'}</span></td></tr>`).join('')}</tbody></table></div></details>`;
  }
  if (res.matched.length) {
    const kind = (g) => (g.kind === '1-1' ? '1 pour 1' : g.kind === '1-n' ? `facture ventilée sur ${g.b.length} fiches` : `${g.a.length} écritures sur 1 fiche`);
    h += `<details class="soc-det"><summary>Écritures rapprochées des fiches (${res.matched.length})</summary><div class="grid-wrap"><table class="dtable ie-t"><thead><tr><th>Date</th><th>Écriture</th><th class="n">Montant</th><th>Fiche</th><th class="n">Montant fiche</th><th>Compte</th><th>Type</th></tr></thead><tbody>
      ${res.matched.map((g) => `<tr><td>${g.a.map((m) => ieDmy(m.date)).join('<br>')}</td><td class="ie-lib">${g.a.map((m) => `${esc(m.supplier || m.lib)} <span class="muted small">${esc(m.piece)}</span>`).join('<br>')}</td>
        <td class="n">${g.a.map((m) => ieNeg(m.amt)).join('<br>')}</td><td class="ie-lib">${g.b.map((f) => `${esc(f.code)} ${esc(f.label)}`).join('<br>')}</td><td class="n">${g.b.map((f) => ieEur(g.type === 'sor' ? f.sor : f.acq)).join('<br>')}</td>
        <td>${esc((st.etat.accounts[g.acct] || {}).num || g.acct)}</td><td>${g.type === 'sor' ? 'Sortie · ' : ''}${kind(g)}</td></tr>`).join('')}</tbody></table></div></details>`;
  }
  return h;
}

// Synthèse enregistrée (état lu lors d'une session précédente)
function ieSaved(sv) {
  const n = sv.missing.length, open = sv.rows.filter((x) => x.status === 'open' || x.status === 'absent').length;
  return `<p class="muted small">Rapprochement fait le ${fmtDateTime(sv.at)} avec ${esc(sv.file)} : ${n} écriture(s) sans fiche (${ieEur(sv.totals.missingHT)} € HT), ${open} compte(s) en écart. Déposez à nouveau l’état pour revoir le détail.</p>
    <div class="grid-wrap"><table class="dtable ie-t"><thead><tr><th>Compte</th><th>Libellé</th><th class="n">Écart</th><th>Statut</th></tr></thead><tbody>
    ${sv.rows.map((x) => `<tr><td>${esc(x.num)}</td><td class="ie-lib">${esc(x.label)}</td><td class="n">${x.ecart ? ieNeg(x.ecart) : '0,00'}</td><td><span class="soc-chip ${IE_ST[x.status][0]}">${IE_ST[x.status][1]}</span></td></tr>`).join('')}</tbody></table></div>`;
}

function immoEtatCard() {
  const st = ui.fec.immoEtat, sv = immoEtatSummary(), done = st && st.res;
  let h = `<section class="card ie"><h2>État des immobilisations</h2>
    <p class="muted small">Rapprochement avec l’état du module immo : écritures passées sur les comptes d’immobilisations (classe 2, hors 28 et 29) sans fiche dans le module, puis solde de chaque compte. Le FEC de cette analyse est repris ; l’état est lu sur cet appareil et n’est pas conservé.</p>`;
  if (st && st.busy) h += '<p class="muted small" role="status">Lecture en cours…</p>';
  if (st && st.err) h += `<div class="banner warn"><span>${esc(st.err)}</span></div>`;
  if (done) h += ieResults(st);
  else if (sv) h += ieSaved(sv);
  return `${h}<p class="ie-bar"><button class="btn${done ? '' : ' primary'}" data-action="immo-etat-pick">${done || sv ? 'Déposer un autre état (PDF)' : 'Déposer l’état des immobilisations (PDF)'}</button></p>
    <details class="ie-paste"><summary>Le PDF ne se lit pas ? Collez le texte de l’état</summary>
      <p class="muted small">Les lignes « Compte n° … », puis une ligne par fiche avec ses quatre montants en fin de ligne (début, acquisitions, sorties, fin), les sous-totaux « immobilisation » et « comptabilité ».</p>
      <textarea data-ie-text rows="6" spellcheck="false" aria-label="Texte de l’état des immobilisations"></textarea>
      <p><button class="btn small" data-action="immo-etat-text">Lire ce texte</button></p></details></section>`;
}

// Copie pour un tableur (montants au format français)
function immoEtatCopy(what) {
  const st = ui.fec && ui.fec.immoEtat, res = st && st.res;
  if (!res) return;
  const xl = (c) => ((c || 0) / 100).toFixed(2).replace('.', ',');
  const L = what === 'missing'
    ? [['Date', 'Journal', 'N° écriture', 'Pièce', 'Fournisseur', 'Libellé', 'Compte', 'Montant HT', 'TVA', 'TTC']].concat(res.missing.map((m) => [ieDmy(m.date), m.jc, m.num, m.piece, m.supplier, m.lib, m.compte, xl(m.amt), xl(m.tva), xl(m.ttc)]))
    : [['Compte', 'Libellé', 'À-nouveau FEC', 'Mouvements FEC', 'Solde FEC', 'Valeur brute fin état', 'Écart FEC - état', 'Statut']].concat(res.rows.map((x) => [x.num, x.label, xl(x.fecRan), xl(x.fecMvt), xl(x.fecFin), x.immo ? xl(x.immo.fin) : '', xl(x.ecart), IE_ST[ieStatus(x)][1]]));
  navigator.clipboard.writeText(L.map((r) => r.join('\t')).join('\n')).then(() => toast(`${L.length - 1} ligne(s) copiée(s) : collez-les dans un tableur.`), () => toast('Copie impossible sur ce navigateur.', true));
}
