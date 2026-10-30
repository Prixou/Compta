/*
 * Suivi Dossiers — Relevés bancaires en PDF (édition « Relevé bancaire » d'ACD) → fichier Excel pour l'import de
 * transactions bancaires (Pennylane ou autre logiciel).
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- Relevés PDF → Excel ----------
// Lecture sur l'appareil (js/pdf-reader.js, js/releve-pdf.js). Les opérations restent en mémoire, ne sont jamais
// enregistrées et sont effacées au verrouillage.

const REL_FORMATS = {
  signe: { label: 'Montant signé', hint: 'Date, Libellé, Montant (dépense en négatif, recette en positif) : format des modèles d\'import Pennylane et de la plupart des logiciels.' },
  dc: { label: 'Débit et crédit', hint: 'Date, Libellé, Débit, Crédit : pour les imports qui attendent deux colonnes de montants.' },
};
const relState = () => (ui.rel = ui.rel || { files: [], format: 'signe' });

async function relAdd(files) {
  const list = Array.from(files || []).filter(Boolean);
  if (!list.length) return;
  const st = relState();
  for (const file of list) {
    const it = { name: file.name, status: 'loading' };
    st.files.push(it);
    if (location.hash.startsWith('#/releves')) refresh();
    try {
      if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') throw new Error("Ce fichier n'est pas un PDF.");
      const doc = await PdfReader.read(await file.arrayBuffer());
      const res = RelevePdf.parse(doc, PdfReader);
      const same = (r) => r.meta.compte === res.meta.compte && r.meta.du === res.meta.du && r.meta.au === res.meta.au && r.ops.length === res.ops.length && r.sumD === res.sumD && r.sumC === res.sumC;
      if (st.files.some((f) => f !== it && f.status === 'done' && same(f.res))) throw new Error('Relevé déjà ajouté : il ne sera pas repris deux fois dans le fichier Excel.');
      Object.assign(it, { status: 'done', res });
    } catch (e) {
      Object.assign(it, { status: 'error', message: e.message || String(e) });
    }
  }
  // Relevés dans l'ordre chronologique
  st.files.sort((a, b) => ((a.res && a.res.meta.du) || '9').localeCompare((b.res && b.res.meta.du) || '9'));
  if (location.hash.startsWith('#/releves')) refresh();
  else toast('Relevé(s) PDF lu(s).');
}

const relOps = (st) => st.files.filter((f) => f.status === 'done').flatMap((f) => f.res.ops);

function relRows(st) {
  const ops = relOps(st);
  const head = st.format === 'dc' ? ['Date', 'Libellé', 'Débit', 'Crédit'] : ['Date', 'Libellé', 'Montant'];
  const rows = [head.map((v) => ({ v, s: 1 }))];
  ops.forEach((o) => {
    const date = { v: XlsxWriter.serial(o.date), s: 11 };
    const lib = { v: o.lib };
    if (st.format === 'dc') rows.push([date, lib, o.debit ? { v: o.debit, s: 12 } : { v: '' }, o.credit ? { v: o.credit, s: 12 } : { v: '' }]);
    else rows.push([date, lib, { v: Math.round((o.credit - o.debit) * 100) / 100, s: 12 }]);
  });
  return rows;
}

async function relDownload() {
  const st = relState();
  const ops = relOps(st);
  if (!ops.length) return;
  const bad = st.files.some((f) => f.status === 'done' && f.res.controls.some((c) => c.ok === false));
  const ok = await ask({
    title: 'Fichier non chiffré',
    message: `Le fichier Excel contient ${ops.length} opération(s) bancaire(s) <strong>non chiffrées</strong>. Importez-le, puis supprimez-le.${bad ? '<br><strong>Attention : un contrôle de totaux ou de solde est en écart</strong>, vérifiez le relevé avant l\'import.' : ''}`,
    okLabel: 'Télécharger',
  });
  if (!ok) return;
  const dates = ops.map((o) => o.date).sort();
  const blob = XlsxWriter.build({ sheetName: 'Transactions', rows: relRows(st), widths: st.format === 'dc' ? [12, 60, 14, 14] : [12, 60, 14], freeze: { row: 1 } });
  download(`transactions-${dates[0]}-${dates[dates.length - 1]}.xlsx`, blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

function viewReleves() {
  const st = ui.rel;
  const has = st && st.files.length;
  const head = `<div class="page-head"><h1>Relevés PDF → Excel</h1>
    <div class="head-actions">${has ? '<button class="btn" data-action="rel-clear">Effacer</button>' : ''}
      <button class="btn primary" data-action="rel-pick">${has ? 'Ajouter des relevés' : 'Choisir des relevés PDF'}</button></div></div>`;
  const drop = `<div class="fec-drop card" data-action="rel-pick" role="button" tabindex="0">
      ${icon('file', 'fec-drop-ico')}
      <p><strong>Déposez les relevés bancaires PDF ici</strong> ou cliquez pour les choisir (plusieurs à la fois)</p>
      <p class="muted small">Édition « Relevé bancaire » d'ACD (colonnes Date, Opérations, Dépenses, Recettes) et mises en page voisines (Débit / Crédit). Le PDF doit contenir du texte : un relevé scanné (image) ne peut pas être lu.</p>
    </div>`;
  const about = `<section class="card"><h2>${icon('shield')} Confidentialité</h2>
      <p>Les relevés sont lus <strong>sur cet appareil uniquement</strong> : ils ne sont ni envoyés ni conservés. Les opérations restent en mémoire jusqu'au téléchargement du fichier Excel, à « Effacer » ou au verrouillage.</p>
      <p class="muted small">Pour comparer un relevé au journal de banque et trouver les écarts : Espace FEC, onglet <a href="#/fec">Rapprochement bancaire</a>.</p>
    </section>`;
  if (!has) return head + drop + about;
  const done = st.files.filter((f) => f.status === 'done');
  const ops = relOps(st);
  const sumD = ops.reduce((t, o) => t + o.debit, 0), sumC = ops.reduce((t, o) => t + o.credit, 0);
  const masked = (c) => (c ? `…${c.replace(/\s+/g, '').slice(-5)}` : '');
  const remove = (i) => `<button class="btn small" data-action="rel-remove" data-i="${i}">Retirer</button>`;
  const cards = st.files.map((f, i) => {
    if (f.status === 'loading') return `<section class="card"><h2>${esc(f.name)}</h2><p class="muted">Lecture en cours…</p></section>`;
    if (f.status === 'error') return `<section class="card"><div class="card-head"><h2>${esc(f.name)}</h2>${remove(i)}</div><div class="banner warn"><span>${esc(f.message)}</span></div></section>`;
    const r = f.res;
    const bad = r.controls.some((c) => c.ok === false);
    return `<section class="card rel-file">
      <div class="card-head"><h2>${esc(f.name)}</h2><span class="rel-head"><span class="badge${bad ? ' warn' : ''}">${bad ? 'Écart à vérifier' : 'Contrôles OK'}</span>${remove(i)}</span></div>
      <p class="small">${esc(r.meta.titre || 'Relevé')}${r.meta.du ? ` du ${fmtDate(r.meta.du)} au ${fmtDate(r.meta.au)}` : ''}${r.meta.compte ? ` · compte ${esc(masked(r.meta.compte))}` : ''} · <strong>${r.ops.length} opération(s)</strong> · dépenses ${eur(r.sumD)} € · recettes ${eur(r.sumC)} €</p>
      <ul class="rel-controls">${r.controls.map((c) => `<li class="${c.ok === false ? 'cred' : ''}">${c.ok === true ? '✓' : c.ok === false ? '✗' : '•'} ${esc(c.label)}</li>`).join('')}</ul>
      ${r.warnings.length ? `<details><summary class="small">${r.warnings.length} ligne(s) à vérifier</summary><ul class="small">${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
    </section>`;
  }).join('');
  return `${head}
    ${cards}
    ${done.length ? `<section class="card">
      <h2>Fichier Excel pour l'import <span class="count">${ops.length}</span></h2>
      <div class="anon-modes">${Object.entries(REL_FORMATS).map(([k, x]) => `<label class="check"><input type="radio" name="rel-format" data-rel="format" value="${k}"${st.format === k ? ' checked' : ''}><span><strong>${esc(x.label)}</strong><br><span class="muted small">${esc(x.hint)}</span></span></label>`).join('')}</div>
      <p class="muted small">Une feuille « Transactions », une ligne par opération, dans l'ordre des relevés ; dates au format date d'Excel, montants en nombres. Total : dépenses ${eur(sumD)} €, recettes ${eur(sumC)} €.</p>
      <p><button class="btn primary" data-action="rel-download">Télécharger le fichier Excel</button></p>
      <div class="grid-wrap"><table class="dtable num rel-table"><thead><tr><th>Date</th><th>Libellé</th><th>Dépense</th><th>Recette</th></tr></thead>
        <tbody>${ops.slice(0, 2000).map((o) => `<tr><td>${fmtDate(o.date)}</td><td>${esc(o.lib)}</td><td>${o.debit ? eur(o.debit) : ''}</td><td>${o.credit ? eur(o.credit) : ''}</td></tr>`).join('')}</tbody></table></div>
    </section>` : ''}
    ${drop}`;
}

function onRelChange(t) {
  const st = relState();
  if (t.dataset.rel === 'format' && REL_FORMATS[t.value]) { st.format = t.value; refresh(); }
}
