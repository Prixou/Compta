/*
 * Suivi Dossiers — Analyse de FEC : factures fournisseurs en double (espace Révision A–K, onglet « Doublons »).
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------------------------------------------------------------------------
// Doublons
// ---------------------------------------------------------------------------

// Recherche faite par le moteur (findDoublons, js/fec-worker.js) : triangulation sur la date, le n° de facture (ou de pièce
// interne), le montant, le libellé et le compte fournisseur ; 3 critères sur 5 dont le montant ou le n°.

// Groupes écartés à la main (« Pas un doublon ») : conservés dans le dossier (clé du groupe → date du choix).
function doublonsEcartes(create) {
  const f = ui.fec || {};
  const o = clientById(f.clientId) || f;
  return o.doublonsEcartes || (create ? (o.doublonsEcartes = {}) : {});
}

// Doublons de l'analyse : très probables, probables et écartés (choix du dossier pour l'analyse en cours).
function doublonsView(r) {
  const d = r && r.cycles && r.cycles.achats && r.cycles.achats.doublons;
  if (!d) return null;
  const ec = ui.fec && ui.fec.result === r ? doublonsEcartes() : {};
  const live = d.groups.filter((g) => !ec[g.key]);
  return { d, fort: live.filter((g) => g.fort), verif: live.filter((g) => !g.fort), ecartes: d.groups.filter((g) => ec[g.key]) };
}
const doublonsCount = (r) => { const v = doublonsView(r); return v ? v.fort.length + v.verif.length : 0; };

// Résumé d'un groupe (élément de la feuille de travail du cycle C, écriture d'annulation) : fournisseur, montant, pièces.
const dupExample = (g) => `${g.rows[0].name} · ${eur(Math.abs(g.rows[0].amt))} € · ${g.rows.map((x) => `${x.piece || 'sans pièce'} du ${fmtDate(x.date)}`).join(', ')}`;
const DUP_CRIT = ['Date', 'N°', 'Montant', 'Libellé', 'Compte'];
const dupCrit = (c) => DUP_CRIT.map((l, i) => `${l} ${c[i] === '1' ? '✔' : '✗'}`).join(' · ');
const DUP_ROLE = { garder: ['ok', 'à garder'], annuler: ['bad', 'à annuler ?'], verifier: ['warn', 'à vérifier'] };

function viewDoublons(r) {
  const v = doublonsView(r);
  if (!v) return '<section class="card"><p class="muted">Recherche des doublons indisponible pour ce FEC.</p></section>';
  const { d } = v;
  const table = (rows, withRole) => `<div class="grid-wrap"><table class="dtable num dup-table"><thead><tr>${withRole ? '<th>Suggestion</th>' : ''}<th>Journal</th><th>N° écriture</th><th>Date</th><th>Pièce</th><th class="txt">Libellé</th><th class="txt">Fournisseur</th><th>Montant</th><th>Lettrage</th></tr></thead>
    <tbody>${rows.map((x) => `<tr>${withRole ? `<td><span class="badge ${DUP_ROLE[x.role][0]}">${DUP_ROLE[x.role][1]}</span></td>` : ''}<td>${esc(x.jc)}</td><td>${esc(x.num)}</td><td>${fmtDate(x.date)}</td><td>${esc(x.piece)}</td><td class="txt">${esc(x.lib)}</td><td class="txt">${esc(x.name)} <span class="muted small">${esc(x.sup)}</span></td><td>${eur(x.amt)}</td><td>${esc(x.let)}</td></tr>`).join('')}</tbody></table></div>`;
  const group = (g, k, ecarte) => `<div class="dup-group${g.fort ? ' fort' : ''}">
    <div class="dup-head"><strong>${k}. ${g.fort ? 'Très probable' : 'Probable'}</strong><span class="muted small">${g.score}/5 · ${dupCrit(g.crit)}${g.note ? ` · ${esc(g.note)}` : ''}</span>
      <span class="dup-actions">${ecarte ? `<button class="btn small" data-action="doublon-retablir" data-key="${esc(g.key)}">Rétablir</button>`
    : `${g.fort && g.rows.some((x) => x.role === 'annuler') ? '<button class="btn small" data-action="fec-tab" data-tab="ecritures">Écriture d\'annulation</button>' : ''}<button class="btn small" data-action="doublon-ecarte" data-key="${esc(g.key)}">Pas un doublon</button>`}</span></div>
    ${table(g.rows, true)}</div>`;
  const live = v.fort.concat(v.verif);
  return `<section class="card">
      <h2>Factures fournisseurs en double</h2>
      <p class="muted small">Chaque facture ou avoir fournisseur est comparé aux autres sur cinq critères : <strong>date</strong> (3 jours d'écart au plus), <strong>n° de facture</strong> (lu dans le n° de pièce et le libellé, ou même n° de pièce interne : même document saisi deux fois), <strong>montant</strong> (au centime), <strong>libellé</strong> (proche) et <strong>compte fournisseur</strong>. Doublon : 3 critères sur 5 dont le montant ou le n° ; « très probable » avec le même n° et le même montant (ou 4 critères), jamais si les deux pièces portent des n° différents (« probable »). Ne sont pas des doublons : la facture mensuelle d'un même montant (sauf deux fois le même mois), une facture et son avoir, un doublon déjà annulé par un avoir, une copie rattachée à un règlement (chaque exemplaire lettré avec son propre paiement). Pièce à garder : la lettrée, sinon la première saisie.</p>
      <p><strong>${d.n.toLocaleString('fr-FR')}</strong> facture(s) et avoir(s) contrôlé(s) · <strong>${v.fort.length}</strong> très probable(s) · <strong>${v.verif.length}</strong> probable(s)${d.copies.length ? ` · ${d.copies.length} copie(s) rattachée(s) à un règlement` : ''}${d.fixed ? ` · ${d.fixed} doublon(s) déjà annulé(s)` : ''}</p>
      <div class="pieces-actions"><button class="btn" data-action="doublons-xlsx"${live.length || d.copies.length ? '' : ' disabled'}>Liste Excel</button></div>
    </section>
    <section class="card">
      ${live.length ? live.map((g, k) => group(g, k + 1, false)).join('') : '<p class="muted">Aucune facture fournisseur en double. 👍</p>'}
      ${v.ecartes.length ? `<details class="pieces-ecartes"${ui.fec.dupEcartesOpen ? ' open' : ''}><summary>Écartés <span class="count">${v.ecartes.length}</span></summary>
        <p class="muted small">Groupes marqués « Pas un doublon » : conservés dans le dossier, ils ne sont plus signalés.</p>
        ${v.ecartes.map((g, k) => group(g, k + 1, true)).join('')}</details>` : ''}
      ${d.copies.length ? `<details class="pieces-ecartes"><summary>Copies rattachées à un règlement <span class="count">${d.copies.length}</span></summary>
        <p class="muted small">Factures recopiées pour rattacher un règlement dont la pièce manque : chaque exemplaire est lettré avec son propre paiement. Pour information, ce ne sont pas des doublons.</p>
        ${table(d.copies, false)}</details>` : ''}
    </section>`;
}

// Liste Excel : doublons (groupe, niveau, critères, suggestion) et copies rattachées à un règlement.
function exportDoublonsXlsx() {
  const f = ui.fec;
  const v = doublonsView(f.result);
  if (!v) return;
  const t = (x, s) => ({ v: x, s: s === undefined ? 2 : s });
  const line = (x) => [t(x.jc), t(x.num), { v: XlsxWriter.serial(x.date), s: 11 }, t(x.piece), t(x.lib), t(x.sup), t(x.name), { v: x.amt, s: 8 }, t(x.let)];
  const head = ['Journal', 'N° écriture', 'Date', 'Pièce', 'Libellé', 'Compte', 'Fournisseur', 'Montant', 'Lettrage'];
  const rows = [['Groupe', 'Niveau', 'Score', 'Critères', 'Remarque', 'Suggestion'].concat(head).map((c) => t(c, 1))];
  v.fort.concat(v.verif).forEach((g, k) => g.rows.forEach((x) => rows.push([{ v: k + 1, s: 0 }, t(g.fort ? 'Très probable' : 'Probable'), t(`${x.score}/5`), t(dupCrit(x.crit)), t(g.note), t(DUP_ROLE[x.role][1])].concat(line(x)))));
  const copies = [head.map((c) => t(c, 1))].concat(v.d.copies.map(line));
  const blob = XlsxWriter.build({ sheets: [
    { name: 'Doublons', rows, widths: [8, 14, 7, 52, 30, 13, 8, 11, 11, 16, 46, 12, 30, 12, 9], freeze: { row: 1 } },
    { name: 'Copies rattachées', rows: copies, widths: [8, 11, 11, 16, 46, 12, 30, 12, 9], freeze: { row: 1 } },
  ] });
  const c = clientById(f.clientId);
  const name = `Doublons${c ? ` - ${c.nom}` : ''} - ${f.result.meta.fileName || 'FEC'}`.replace(/\.txt$/i, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\\/:*?"<>|]+|[^\x20-\x7e]+/g, ' ').replace(/\s+/g, ' ').trim();
  download(`${name}.xlsx`, blob, blob.type);
}
