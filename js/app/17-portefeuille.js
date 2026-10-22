/*
 * Suivi Dossiers — Portefeuille : plusieurs FEC en une fois.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- Portefeuille : analyse de plusieurs FEC en une fois ----------

// Exécute `fn` comme si l'analyse `st` était ouverte dans l'analyseur `profile`.
function withFec(st, profile, fn) {
  const saveState = ui.fecState;
  ui.fecState = st;
  st.profile = profile;
  try {
    return fn();
  } finally {
    ui.fecState = saveState;
  }
}

// Analyse d'un fichier dans son propre Web Worker (indépendant de l'analyse affichée).
function analyseFile(file) {
  return fecSource(file).then(({ buffer, name, docs, archive }) => new Promise((resolve) => {
    const w = new Worker('js/fec-worker.js?v=' + ASSET_VERSION);
    w.onmessage = (e) => {
      if (e.data.type === 'progress') return;
      w.terminate();
      if (e.data.type === 'done' && archive) e.data.result.meta.archive = archive;
      resolve(e.data.type === 'done' ? { result: e.data.result } : { error: e.data.message });
    };
    w.onerror = (err) => {
      w.terminate();
      resolve({ error: err.message || "Erreur pendant l'analyse." });
    };
    w.postMessage({ buffer, fileName: name, docs }, [buffer]);
  }), (err) => ({ error: err.message }));
}

function batchSummary(it) {
  return withFec(it.st, it.profile, () => {
    const r = it.st.result;
    const { errors, warnings } = fecCounts(r);
    const cc = cycleChecks(r);
    const left = {};
    Object.keys(cc).forEach((k) => { left[k] = wpProgress(k, cc[k]).left; });
    left.gen = wpProgress('gen', genPoints(r)).left;
    const mode = isSituation(r) ? 'situation' : 'bilan';
    const pieces = computePieces(r, mode, defaultArrete(r, mode)).length;
    const props = ecrProposals(r).filter((p) => p.on);
    const moisArrete = defaultArrete(r, 'mois');
    const tva = r.cycles && r.cycles.tva && Object.keys(r.cycles.tva.months).length ? tvrSummary(r, tvrCalc(r)) : null;
    return {
      tva,
      moisArrete, moisPieces: piecesCount(r, 'mois', moisArrete),
      errors, warnings, left, total: Object.values(left).reduce((s, v) => s + v, 0), pieces, mode,
      ecr: props.length, impact: props.reduce((s, p) => s + ecrImpact(p.lines), 0),
      ca: r.kpi.ca, resultat: r.kpi.resultat, treso: r.kpi.tresorerie,
    };
  });
}

async function batchRun(files) {
  const list = files.filter((f) => /\.(txt|csv|tsv|zip)$/i.test(f.name));
  if (!list.length) return toast('Aucun fichier FEC (.txt, .csv) sélectionné.', true);
  const b = (ui.batch = { items: [], total: list.length, done: 0, running: true });
  refresh();
  for (const file of list) {
    if (ui.batch !== b) return; // verrouillage ou nouveau lot
    b.current = file.name;
    refresh();
    const res = await analyseFile(file);
    if (ui.batch !== b) return;
    const it = { fileName: file.name };
    if (res.error) Object.assign(it, { error: res.error });
    else {
      const r = res.result;
      const siren = r.meta.siren;
      const c = clientBySiren(siren);
      it.st = { status: 'done', result: r, clientId: c ? c.id : '', section: 'synthese', q: '', classe: '', fileName: file.name, pct: 100 };
      it.profile = applyProfile(it.st);
      it.sum = batchSummary(it);
    }
    b.items.push(it);
    b.done++;
  }
  b.running = false;
  b.current = '';
  refresh();
  toast(`${b.done} FEC analysé(s).`);
}

function batchItems() {
  const b = ui.batch;
  if (!b) return [];
  return b.items.map((it, i) => Object.assign({ i }, it)).sort((x, y) => (x.error ? 1 : 0) - (y.error ? 1 : 0) || (y.sum ? y.sum.errors * 3 + y.sum.total : 0) - (x.sum ? x.sum.errors * 3 + x.sum.total : 0));
}

function viewBatch() {
  const b = ui.batch;
  const head = `<div class="page-head"><h1>Portefeuille — FEC de plusieurs dossiers</h1>
    <div class="head-actions">${b && !b.running && b.items.length ? '<button class="btn" data-action="batch-xlsx">Exporter en Excel</button>' : ''}
      <a class="btn" href="#/fec">${icon('chart')}Analyse d'un dossier</a>
      <button class="btn primary" data-action="batch-pick"${b && b.running ? ' disabled' : ''}>${b ? 'Analyser d\'autres FEC' : 'Choisir les FEC'}</button></div></div>`;
  if (!b) {
    return `${head}
      <div class="fec-drop card" data-action="batch-pick" role="button" tabindex="0">
        ${icon('chart', 'fec-drop-ico')}
        <p><strong>Sélectionnez ou déposez ici les FEC de plusieurs dossiers</strong> (par exemple tous les dossiers d'un collaborateur), ou leurs archives .zip</p>
        <p class="muted small">Chaque fichier est analysé sur cet appareil, l'un après l'autre, puis rattaché à son dossier par le SIREN du nom de fichier. Rien n'est envoyé ni conservé.</p>
      </div>
      <section class="card"><h2>À quoi ça sert</h2><ul class="bullets">
        <li>Voir d'un coup d'œil <strong>par quels dossiers commencer</strong> : anomalies, points à traiter par cycle, pièces à demander, écritures à passer.</li>
        <li>Ouvrir chaque dossier pour la révision détaillée, ou directement sur sa demande de pièces mensuelle (cumulée depuis le début de l'exercice). Le profil (structure classique ou officine) vient de la fiche du dossier, sinon du contenu du FEC.</li>
        <li>Enregistrer en une fois la synthèse de chaque analyse dans son dossier.</li>
      </ul></section>`;
  }
  const items = batchItems();
  const ok = items.filter((x) => x.sum);
  const linked = ok.filter((x) => x.st.clientId);
  const tot = (k) => ok.reduce((s, x) => s + x.sum[k], 0);
  const name = (x) => {
    const c = x.st && clientById(x.st.clientId);
    return c ? `${c.code ? esc(c.code) + ' — ' : ''}${esc(clientLabel(c))}` : `<span class="muted">${esc(x.fileName)}</span>`;
  };
  const cyc = (x) => ['achats', 'charges', 'clients', 'treso'].filter((k) => x.sum.left[k]).map((k) => `${{ achats: 'Ach.', charges: 'Ch. ext.', clients: 'Cli.', treso: 'Tréso.' }[k]} ${x.sum.left[k]}`).join(' · ');
  return `${head}
    ${b.running ? `<section class="card fec-loading"><p><strong>Analyse ${b.done + 1} / ${b.total}</strong> : ${esc(b.current || '')}</p>
      <div class="fec-progress"><span data-w="${Math.round((b.done / b.total) * 100)}"></span></div></section>` : ''}
    <div class="kpis fec-kpis">
      ${kpiTile('FEC analysés', `${ok.length}${b.total ? ` / ${b.total}` : ''}`)}
      ${kpiTile('Rattachés à un dossier', linked.length, linked.length < ok.length ? 'kpi-wait' : '')}
      ${kpiTile('Anomalies', tot('errors'), tot('errors') ? 'kpi-late' : '')}
      ${kpiTile('Points à traiter', tot('total'), tot('total') ? 'kpi-wait' : '')}
      ${kpiTile('Pièces à demander', tot('pieces'))}
      ${kpiTile('Écritures proposées', tot('ecr'))}
      ${kpiTile('Écarts de TVA', ok.filter((x) => x.sum.tva && x.sum.tva.ecart).length, ok.some((x) => x.sum.tva && x.sum.tva.ecart) ? 'kpi-wait' : '')}
    </div>
    <section class="card"><div class="card-head"><h2>Dossiers par charge de révision</h2>
      ${!b.running && linked.length ? `<button class="btn small" data-action="batch-save">Enregistrer les synthèses dans les dossiers (${linked.length})</button>` : ''}</div>
      <div class="grid-wrap"><table class="dtable num batch"><thead><tr><th>Dossier</th><th>Travail</th><th>Anomalies</th><th>À traiter</th><th>Détail par cycle</th><th>Pièces</th><th title="Gestion courante : pièces manquantes depuis le début de l'exercice jusqu'à la fin du dernier mois saisi">Pièces manquantes</th><th>Écritures</th><th>Impact résultat</th><th>CA</th><th>Résultat</th><th></th></tr></thead>
      <tbody>${items.map((x) => x.error ? `<tr><td>${esc(x.fileName)}</td><td colspan="10" class="late">${esc(x.error)}</td><td></td></tr>` : `<tr>
        <td>${name(x)}</td><td>${x.sum.mode === 'situation' ? 'Situation' : 'Bilan'}${x.profile === 'pharmacie' ? ' · officine' : ''}</td>
        <td class="${x.sum.errors ? 'late' : ''}">${x.sum.errors}</td><td>${x.sum.total}</td><td class="small">${cyc(x) || '—'}</td><td>${x.sum.pieces}</td><td>${x.sum.moisPieces ? `<button class="link-btn" data-action="batch-open" data-i="${x.i}" data-mois="1" title="Ouvrir la demande de pièces mensuelle">${x.sum.moisPieces} · ${esc(MOIS_COURTS[Number(x.sum.moisArrete.slice(5, 7)) - 1])}</button>` : '—'}</td><td>${x.sum.ecr}</td>
        <td class="${x.sum.impact < 0 ? 'cred' : ''}">${x.sum.ecr ? eur(x.sum.impact, 0) : ''}</td><td>${eurK(x.sum.ca)}</td><td class="${x.sum.resultat < 0 ? 'cred' : ''}">${eurK(x.sum.resultat)}</td>
        <td><button class="btn small" data-action="batch-open" data-i="${x.i}">Ouvrir</button></td></tr>`).join('')}</tbody></table></div>
      <p class="muted small">Classement : anomalies de conformité d'abord, puis nombre de points de révision restant à traiter. Les FEC sans dossier correspondant (SIREN) peuvent être ouverts et rattachés manuellement.</p>
    </section>
    ${batchTvaCard(ok, name)}`;
}

// Contrôle de la TVA de l'exercice de chaque dossier (onglet « Contrôle TVA »), du plus grand écart au plus petit
function batchTvaCard(ok, name) {
  const list = ok.filter((x) => x.sum.tva).sort((a, b) => b.sum.tva.total - a.sum.tva.total);
  if (!list.length) return '';
  const cell = (v, title) => (v === null ? `<td class="muted small" title="${esc(title || '')}">—</td>` : `<td class="${v >= 1 ? 'cred' : ''}">${v >= 0.005 ? eur(v) : '0'}</td>`);
  return `<section class="card"><h2>Contrôle de la TVA <span class="count">${list.filter((x) => x.sum.tva.ecart).length} en écart</span></h2>
    <p class="muted small">Pour chaque dossier, le contrôle de l'onglet « Contrôle TVA » (espace Révision) au dernier mois dont l'OD de TVA est comptabilisée, avec les saisies et les CA3 importées déjà conservées dans le dossier. Écarts en euros de TVA, en valeur absolue ; à partir de 1 € en rouge.</p>
    <div class="grid-wrap"><table class="dtable num batch-tva"><thead><tr><th>Dossier</th><th>Arrêté</th><th title="Net calculé et OD de TVA comptabilisée, toutes périodes">Écart OD</th><th title="CA × taux et TVA collectée comptabilisée">Contrôle en bases</th><th title="TVA sur les encaissements à déclarer (si les comptes clients sont lettrés)">Encaissements</th><th title="TVA déductible exigible et TVA déduite par l'OD de la période">Déductible</th><th title="Soldes théoriques et réels des comptes de TVA après OD">Soldes après OD</th><th>OD proposées</th><th>CA3 importées</th><th></th></tr></thead>
    <tbody>${list.map((x) => { const t = x.sum.tva; return `<tr><td>${name(x)}</td><td>${esc(MOIS_COURTS[Number(t.arr.slice(5, 7)) - 1])} ${esc(t.arr.slice(0, 4))}</td>
      ${cell(t.od)}${cell(t.bases)}${cell(t.enc, 'Comptes clients peu lettrés : à contrôler dans le dossier')}${cell(t.ded, "Pas d'OD de TVA pour la période d'arrêté")}${cell(t.soldes)}
      <td>${t.odItems || ''}</td><td>${t.ca3 ? `${t.ca3} / ${t.periods}` : ''}</td><td><button class="btn small" data-action="batch-open" data-i="${x.i}" data-tab="tvarev">Ouvrir</button></td></tr>`; }).join('')}</tbody></table></div>
  </section>`;
}

function batchExport() {
  const t = (v, s) => ({ v, s: s === undefined ? 2 : s });
  const n = (v, s) => ({ v: Number(v) || 0, s: s || 8 });
  const rows = [['Dossier', 'Fichier', 'Travail', 'Profil', 'Anomalies', 'Points à traiter', 'Achats', 'Charges externes', 'Clients', 'Trésorerie', 'Généraux', 'Pièces à demander', 'Pièces manquantes (fin de mois)', 'Écritures proposées', 'Impact résultat', 'CA', 'Résultat', 'Trésorerie fin'].map((c) => t(c, 1))]
    .concat(batchItems().filter((x) => x.sum).map((x) => {
      const c = clientById(x.st.clientId);
      return [t(c ? clientLabel(c) : ''), t(x.fileName), t(x.sum.mode === 'situation' ? 'Situation' : 'Bilan'), t(x.profile === 'pharmacie' ? 'Pharmacie' : 'Classique'),
        n(x.sum.errors, 2), n(x.sum.total, 2), n(x.sum.left.achats || 0, 2), n(x.sum.left.charges || 0, 2), n(x.sum.left.clients || 0, 2), n(x.sum.left.treso || 0, 2), n(x.sum.left.gen || 0, 2),
        n(x.sum.pieces, 2), n(x.sum.moisPieces, 2), n(x.sum.ecr, 2), n(x.sum.impact), n(x.sum.ca), n(x.sum.resultat), n(x.sum.treso)];
    }));
  const tvaRows = [['Dossier', 'Fichier', 'Arrêté', 'Écart OD', 'Contrôle en bases', 'Encaissements', 'Déductible', 'Soldes après OD', 'OD proposées', 'CA3 importées', 'Périodes'].map((c) => t(c, 1))]
    .concat(batchItems().filter((x) => x.sum && x.sum.tva).map((x) => {
      const c = clientById(x.st.clientId), v = x.sum.tva;
      return [t(c ? clientLabel(c) : ''), t(x.fileName), t(v.arr), n(v.od), n(v.bases), v.enc === null ? t('—') : n(v.enc), v.ded === null ? t('—') : n(v.ded), n(v.soldes), n(v.odItems, 2), n(v.ca3, 2), n(v.periods, 2)];
    }));
  const blob = XlsxWriter.build({ sheets: [{ name: 'Portefeuille', rows, widths: [34, 30, 11, 11, 11, 13, 9, 11, 9, 11, 10, 12, 12, 12, 14, 14, 14, 14], freeze: { row: 1 } },
    { name: 'Contrôle TVA', rows: tvaRows, widths: [34, 30, 10, 12, 14, 14, 12, 14, 12, 12, 10], freeze: { row: 1 } }] });
  download(`portefeuille-fec-${todayStr()}.xlsx`, blob, blob.type);
}

function pickFiles(accept) {
  return new Promise((resolve) => {
    const input = $('#file-input');
    input.value = '';
    input.accept = accept;
    input.multiple = true;
    input.onchange = () => {
      const files = Array.from(input.files || []);
      input.multiple = false;
      resolve(files);
    };
    input.click();
  });
}
