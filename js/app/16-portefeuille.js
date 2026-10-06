/*
 * Suivi Dossiers — Portefeuille : plusieurs FEC en une fois.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- Portefeuille : analyse de plusieurs FEC en une fois ----------

// Exécute `fn` comme si l'analyse `st` était ouverte dans l'analyseur `profile`.
function withFec(st, profile, fn) {
  const saveProfile = ui.fecProfile, saveState = ui.fecStates[profile];
  ui.fecProfile = profile;
  ui.fecStates[profile] = st;
  try {
    return fn();
  } finally {
    ui.fecProfile = saveProfile;
    ui.fecStates[profile] = saveState;
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
    return {
      moisArrete, moisPieces: computePieces(r, 'mois', moisArrete).length,
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
      it.profile = withFec(it.st, 'classique', () => looksLikePharmacy(r)) ? 'pharmacie' : 'classique';
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
  const head = `<div class="page-head"><h1>Analyse FEC — Portefeuille</h1>
    <div class="head-actions">${b && !b.running && b.items.length ? '<button class="btn" data-action="batch-xlsx">Exporter en Excel</button>' : ''}
      <button class="btn primary" data-action="batch-pick"${b && b.running ? ' disabled' : ''}>${b ? 'Analyser d\'autres FEC' : 'Choisir les FEC'}</button></div></div>${fecProfilesNav('lot')}`;
  if (!b) {
    return `${head}
      <div class="fec-drop card" data-action="batch-pick" role="button" tabindex="0">
        ${icon('chart', 'fec-drop-ico')}
        <p><strong>Sélectionnez ou déposez ici les FEC de plusieurs dossiers</strong> (par exemple tous les dossiers d'un collaborateur), ou leurs archives .zip</p>
        <p class="muted small">Chaque fichier est analysé sur cet appareil, l'un après l'autre, puis rattaché à son dossier par le SIREN du nom de fichier. Rien n'est envoyé ni conservé.</p>
      </div>
      <section class="card"><h2>À quoi ça sert</h2><ul class="bullets">
        <li>Voir d'un coup d'œil <strong>par quels dossiers commencer</strong> : anomalies, points à traiter par cycle, pièces à demander, écritures à passer.</li>
        <li>Ouvrir chaque dossier dans le bon analyseur (classique ou pharmacie, détecté automatiquement) pour la révision détaillée.</li>
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
    </div>
    <section class="card"><div class="card-head"><h2>Dossiers par charge de révision</h2>
      ${!b.running && linked.length ? `<button class="btn small" data-action="batch-save">Enregistrer les synthèses dans les dossiers (${linked.length})</button>` : ''}</div>
      <div class="grid-wrap"><table class="dtable num batch"><thead><tr><th>Dossier</th><th>Travail</th><th>Anomalies</th><th>À traiter</th><th>Détail par cycle</th><th>Pièces</th><th>Pièces du mois</th><th>Écritures</th><th>Impact résultat</th><th>CA</th><th>Résultat</th><th></th></tr></thead>
      <tbody>${items.map((x) => x.error ? `<tr><td>${esc(x.fileName)}</td><td colspan="10" class="late">${esc(x.error)}</td><td></td></tr>` : `<tr>
        <td>${name(x)}</td><td>${x.sum.mode === 'situation' ? 'Situation' : 'Bilan'}${x.profile === 'pharmacie' ? ' · officine' : ''}</td>
        <td class="${x.sum.errors ? 'late' : ''}">${x.sum.errors}</td><td>${x.sum.total}</td><td class="small">${cyc(x) || '—'}</td><td>${x.sum.pieces}</td><td>${x.sum.moisPieces ? `<button class="link-btn" data-action="batch-open" data-i="${x.i}" data-mois="1" title="Ouvrir la demande du mois">${x.sum.moisPieces} · ${esc(MOIS_COURTS[Number(x.sum.moisArrete.slice(5, 7)) - 1])}</button>` : '—'}</td><td>${x.sum.ecr}</td>
        <td class="${x.sum.impact < 0 ? 'cred' : ''}">${x.sum.ecr ? eur(x.sum.impact, 0) : ''}</td><td>${eurK(x.sum.ca)}</td><td class="${x.sum.resultat < 0 ? 'cred' : ''}">${eurK(x.sum.resultat)}</td>
        <td><button class="btn small" data-action="batch-open" data-i="${x.i}">Ouvrir</button></td></tr>`).join('')}</tbody></table></div>
      <p class="muted small">Classement : anomalies de conformité d'abord, puis nombre de points de révision restant à traiter. Les FEC sans dossier correspondant (SIREN) peuvent être ouverts et rattachés manuellement.</p>
    </section>`;
}

function batchExport() {
  const t = (v, s) => ({ v, s: s === undefined ? 2 : s });
  const n = (v, s) => ({ v: Number(v) || 0, s: s || 8 });
  const rows = [['Dossier', 'Fichier', 'Travail', 'Profil', 'Anomalies', 'Points à traiter', 'Achats', 'Charges externes', 'Clients', 'Trésorerie', 'Généraux', 'Pièces à demander', 'Pièces du mois', 'Écritures proposées', 'Impact résultat', 'CA', 'Résultat', 'Trésorerie fin'].map((c) => t(c, 1))]
    .concat(batchItems().filter((x) => x.sum).map((x) => {
      const c = clientById(x.st.clientId);
      return [t(c ? clientLabel(c) : ''), t(x.fileName), t(x.sum.mode === 'situation' ? 'Situation' : 'Bilan'), t(x.profile === 'pharmacie' ? 'Pharmacie' : 'Classique'),
        n(x.sum.errors, 2), n(x.sum.total, 2), n(x.sum.left.achats || 0, 2), n(x.sum.left.charges || 0, 2), n(x.sum.left.clients || 0, 2), n(x.sum.left.treso || 0, 2), n(x.sum.left.gen || 0, 2),
        n(x.sum.pieces, 2), n(x.sum.moisPieces, 2), n(x.sum.ecr, 2), n(x.sum.impact), n(x.sum.ca), n(x.sum.resultat), n(x.sum.treso)];
    }));
  const blob = XlsxWriter.build({ sheets: [{ name: 'Portefeuille', rows, widths: [34, 30, 11, 11, 11, 13, 9, 11, 9, 11, 10, 12, 12, 12, 14, 14, 14, 14], freeze: { row: 1 } }] });
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
