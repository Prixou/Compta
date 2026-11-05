/*
 * Suivi Dossiers — Analyse de FEC : justificatifs des charges (espace Révision A–K, onglet « Justificatifs des charges »).
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------------------------------------------------------------------------
// Justificatifs des charges
// ---------------------------------------------------------------------------

// Revue des comptes de charge d'après une archive « FEC + pièces jointes » (export Pennylane « Inclure les pièces jointes »,
// ou archive dont les fichiers portent le n° de pièce) : chaque écriture de charges (classe 6) avec ou sans pièce jointe,
// compte par compte. Le moteur (buildCycles, js/fec-worker.js) écarte la paie, les régularisations d'inventaire, les
// dotations, l'impôt sur les bénéfices et la variation des stocks. Ici : comptes où une pièce est attendue (choix conservé
// dans le dossier) et montant minimal des écritures listées.

// Comptes sans pièce attendue par défaut : frais bancaires (relevé) et charges financières (échéancier, relevé).
const CHG_SANS_PIECE = ['627', '66'];
const CHG_CHECK = 'Charges sans pièce jointe';
const CHG_VIA = { B: 'Banque ou caisse', F: 'Fournisseur', A: 'Associé', O: 'Opération diverse' };
const CHG_EX_MAX = 300;

const chgPrefs = () => { const o = piecesPrefs(); return { acc: o.chgAcc || {}, seuil: Number(o.chgSeuil) || 0 }; };
const chgExpected = (compte, pr) => (compte in pr.acc ? pr.acc[compte] : !CHG_SANS_PIECE.some((p) => compte.startsWith(p)));

// Écritures sans pièce jointe retenues (comptes où une pièce est attendue, montant minimal) et totaux par compte.
function chgReview(r) {
  const cd = r && r.cycles && r.cycles.chgDocs;
  if (!cd) return null;
  const pr = chgPrefs();
  const key = JSON.stringify(pr);
  if (r._chg && r._chg.key === key) return r._chg.val;
  const libOf = new Map(cd.accounts.map((a) => [a.compte, a.lib]));
  const rows = cd.accounts.map((a) => Object.assign({}, a, { exp: chgExpected(a.compte, pr), miss: 0, missAmt: 0 }));
  const by = new Map(rows.map((x) => [x.compte, x]));
  const list = [];
  cd.missing.forEach((m) => {
    const lines = m[7].filter(([c]) => chgExpected(c, pr));
    if (!lines.length) return;
    const amt = round2(lines.reduce((t, l) => t + l[1], 0));
    if (pr.seuil && Math.abs(amt) < pr.seuil) return;
    list.push({ date: m[0], jc: m[1], num: m[2], piece: m[3], lib: m[4], tiers: m[5], via: m[6], lines, amt });
    lines.forEach(([c, a]) => { const x = by.get(c); if (x) { x.miss++; x.missAmt = round2(x.missAmt + a); } });
  });
  const exp = rows.filter((x) => x.exp);
  const val = {
    cd, rows, list, libOf, seuil: pr.seuil,
    n: exp.reduce((t, x) => t + x.n, 0), ok: exp.reduce((t, x) => t + x.ok, 0), unk: exp.reduce((t, x) => t + x.unk, 0),
    total: round2(list.reduce((t, x) => t + x.amt, 0)),
  };
  Object.defineProperty(r, '_chg', { value: { key, val }, configurable: true, writable: true, enumerable: false });
  return val;
}
const chgCount = (r) => { const v = chgReview(r); return v ? v.list.length : 0; };

// Élément de la feuille de travail : segments séparés par « · » ; le compte et la référence d'écriture (« BQ 45 ») ne sont
// pas repris dans la demande de pièces au client.
function chgEx(x, libOf) {
  const lib = x.lib || '—';
  const tiers = x.tiers && !norm(lib).includes(norm(x.tiers)) ? ` · ${x.tiers}` : '';
  const comptes = x.lines.map(([c]) => `${c} ${(libOf.get(c) || '').slice(0, 40)}`.trim()).join(', ');
  return `${fmtDate(x.date)} · ${x.jc} ${x.num} · ${lib}${tiers} · ${eur(x.amt)} € · ${comptes}`;
}

// Contrôle du cycle D : écritures de charges sans pièce jointe, à traiter une par une (les plus fortes d'abord).
function chgCheck(r, out) {
  const v = chgReview(r);
  if (!v) return;
  const src = v.cd.attCol ? `colonne « ${v.cd.attCol} » du FEC` : 'n° de pièce retrouvé dans les noms des fichiers';
  if (!v.list.length) {
    if (v.n) out.add('ok', 'Toutes les charges ont leur pièce jointe', `${v.n} écriture(s) de charges rapprochées des pièces de l'archive (${src}).`);
    return;
  }
  const ex = v.list.slice().sort((a, b) => Math.abs(b.amt) - Math.abs(a.amt)).slice(0, CHG_EX_MAX).map((x) => chgEx(x, v.libOf));
  out.add('warn', CHG_CHECK, `${v.list.length} écriture(s), ${eur(v.total, 0)} €, sans pièce jointe dans l'archive (${src}) : pièce à obtenir ou dépense à justifier. Détail par compte dans l'onglet « Justificatifs des charges ».`,
    ex, { full: v.list.length <= CHG_EX_MAX, beta: true });
}

function chgNoArchive(r) {
  const j = r.cycles && r.cycles.justif;
  return `<section class="card"><h2>Justificatifs des charges <span class="badge beta">bêta</span></h2>
    <p>Pour revoir les comptes de charge écriture par écriture et repérer celles qui n'ont pas de pièce jointe, analysez l'<strong>archive « FEC + pièces jointes »</strong> au lieu du FEC seul.</p>
    <ol class="chg-steps">
      <li>Dans Pennylane : <em>Saisie comptable</em> → <em>Exports</em> → <em>Exporter le FEC</em>, cochez <strong>« Inclure les pièces jointes »</strong>.</li>
      <li>Déposez l'archive .zip telle quelle sur cette page (ou « Changer de FEC »). Seuls les noms des pièces sont lus : les fichiers ne sont jamais ouverts.</li>
    </ol>
    <p class="muted small">L'archive de Pennylane contient le FEC officiel et un FEC secondaire qui indique la pièce jointe de chaque écriture : c'est ce dernier qui est analysé. Une autre archive convient si les fichiers portent le n° de pièce des écritures.${j ? '' : ' Ce FEC a été déposé seul.'}</p>
  </section>`;
}

function viewChgDocs(r) {
  const v = chgReview(r);
  if (!v) return chgNoArchive(r);
  const cd = v.cd;
  const pc = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—');
  const m = r.meta;
  const src = cd.attCol
    ? `FEC ${m.archiveSrc && m.archiveSrc !== m.fileName ? `« ${esc(m.archiveSrc)} » (FEC secondaire de l'archive)` : 'de l\'archive'}, colonne « ${esc(cd.attCol)} »`
    : 'n° de pièce des écritures retrouvé dans les noms des fichiers de l\'archive';
  const skip = [cd.skip.paie ? `${cd.skip.paie} écriture(s) de paie` : '', cd.skip.regul ? `${cd.skip.regul} écriture(s) de régularisation (charges à payer, constatées d'avance, TVA)` : ''].filter(Boolean);
  const rows = v.rows.filter((x) => x.n).map((x) => `<tr class="${x.exp ? '' : 'muted'}">
      <td><label class="check inline"><input type="checkbox" data-chg-acc="${esc(x.compte)}"${x.exp ? ' checked' : ''} aria-label="Pièce attendue pour le compte ${esc(x.compte)}"></label></td>
      <td>${esc(x.compte)} <span class="muted small">${esc(x.lib)}</span></td><td>${x.n}</td><td>${eur(x.amt)}</td>
      <td>${x.ok} <span class="muted small">${pc(x.ok, x.n - x.unk)}</span></td>
      <td class="${x.exp && x.miss ? 'cred' : ''}">${x.exp ? x.miss || '' : '<span class="muted small">non attendue</span>'}</td><td class="${x.exp && x.miss ? 'cred' : ''}">${x.exp && x.miss ? eur(x.missAmt) : ''}</td></tr>`).join('');
  const cc = cycleChecks(r);
  const chk = cc && cc.charges.find((c) => c.label === CHG_CHECK);
  // Liste des écritures dépliée à la première visite de l'onglet, puis selon le choix de l'utilisateur
  const f = ui.fec;
  if (chk && !f.chgSeen) { f.wpOpen = f.wpOpen || new Set(); f.wpOpen.add(wpKey('charges', CHG_CHECK)); f.chgSeen = true; }
  return `<section class="card"><h2>Justificatifs des charges <span class="badge beta">bêta</span></h2>
    <p class="muted small">Pièce jointe de chaque écriture : ${src}${cd.docs ? ` · ${cd.docs.toLocaleString('fr-FR')} fichier(s) dans l'archive` : ''}. Seuls les noms des pièces sont lus.</p>
    <div class="kpis chg-kpis">
      <div class="kpi"><strong>${v.n.toLocaleString('fr-FR')}</strong><span>Écritures de charges</span></div>
      <div class="kpi"><strong>${pc(v.ok, v.n - v.unk)}</strong><span>Avec pièce jointe</span></div>
      <div class="kpi${v.list.length ? ' kpi-late' : ''}"><strong>${v.list.length.toLocaleString('fr-FR')}</strong><span>Sans pièce jointe</span></div>
      <div class="kpi${v.list.length ? ' kpi-late' : ''}"><strong>${eur(v.total, 0)} €</strong><span>Montant sans pièce</span></div>
    </div>
    ${cd.absent.n ? `<div class="banner warn"><span><strong>${cd.absent.n} pièce(s) citée(s) par le FEC introuvable(s) dans l'archive</strong> : comptées comme jointes. ${cd.absent.ex.map(esc).join(' ; ')}${cd.absent.n > cd.absent.ex.length ? '…' : ''}</span></div>` : ''}
    ${v.unk ? `<p class="muted small">${v.unk} écriture(s) non jugée(s) : n° de pièce trop court ou générique pour être retrouvé dans les noms des fichiers.</p>` : ''}
    ${cd.cut ? `<p class="muted small">Écritures sans pièce antérieures au ${fmtDate(cd.cut)} non détaillées (${cd.missingTotal.toLocaleString('fr-FR')} au total).</p>` : ''}
    <p class="muted small">Non revues : ${skip.length ? skip.join(', ') + ', ' : ''}dotations, impôt sur les bénéfices, variation des stocks et valeur des immobilisations cédées (sans pièce par nature).</p>
  </section>
  <section class="card"><h2>Par compte</h2>
    <div class="tool-bar">
      <label class="inline-label">Ne pas lister les écritures de moins de <input type="number" min="0" step="1" data-chg-seuil value="${v.seuil || ''}" placeholder="0"> €</label>
      <button class="btn small" data-action="chg-copy"${v.list.length ? '' : ' disabled'}>Copier pour Excel</button>
    </div>
    <p class="muted small">Décochez un compte dont les écritures n'appellent pas de pièce (frais bancaires et charges financières décochés d'office) : choix conservé dans le dossier.</p>
    <div class="grid-wrap"><table class="dtable num"><thead><tr><th>Pièce attendue</th><th>Compte</th><th>Écritures</th><th>Montant</th><th>Avec pièce</th><th>Sans pièce</th><th>Montant sans pièce</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7" class="muted">Aucune écriture de charges.</td></tr>'}</tbody></table></div>
  </section>
  ${chk ? `<section class="card"><h2>Écritures sans pièce jointe</h2>
    <p class="muted small">Pour chaque écriture : statut et commentaire, repris dans le cycle D. « Pièce demandée » l'ajoute aux pièces à demander au client.</p>
    ${wpCheckList([chk], 'charges')}</section>` : ''}`;
}

// Copie pour un tableur des écritures sans pièce jointe retenues.
function chgCopy() {
  const v = chgReview(ui.fec && ui.fec.result);
  if (!v || !v.list.length) return;
  const xl = (n) => n.toFixed(2).replace('.', ',');
  const L = [['Date', 'Journal', 'N° écriture', 'Pièce', 'Libellé', 'Fournisseur', 'Contrepartie', 'Comptes', 'Montant']]
    .concat(v.list.map((x) => [fmtDate(x.date), x.jc, x.num, x.piece, x.lib, x.tiers, CHG_VIA[x.via] || '', x.lines.map(([c]) => c).join(' '), xl(x.amt)]));
  navigator.clipboard.writeText(L.map((row) => row.map((c) => String(c).replace(/[\t\n]/g, ' ')).join('\t')).join('\n'))
    .then(() => toast(`${L.length - 1} écriture(s) copiée(s) : collez-les dans un tableur.`), () => toast('Copie impossible sur ce navigateur.', true));
}
