/*
 * Suivi Dossiers — Analyse de FEC : lancement, graphiques, écran principal.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------------------------------------------------------------------------
// Analyse de FEC
// ---------------------------------------------------------------------------

const ASSET_VERSION = '28';
let fecWorker = null;

const eur = (n, dec) => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: dec === 0 ? 0 : 2, maximumFractionDigits: dec === 0 ? 0 : 2 });
const eurK = (n) => {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M€';
  if (a >= 1e3) return (n / 1e3).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' k€';
  return eur(n, 0) + ' €';
};
const LEVEL = {
  ok: { icon: '✓', label: 'Conforme' },
  info: { icon: 'i', label: 'Information' },
  warn: { icon: '!', label: 'À vérifier' },
  error: { icon: '✕', label: 'Anomalie' },
};

// Libellé « problème » de chaque contrôle, utilisé pour les étapes de la mission de revue.
const FEC_FAIL = {
  nom: 'Nom de fichier non conforme', sep: 'Séparateur non conforme', cols: 'Colonnes non conformes',
  equil: 'Écritures déséquilibrées', balance: 'Balance générale déséquilibrée', nbcol: 'Lignes au nombre de zones incorrect',
  oblig: 'Zones obligatoires non renseignées', date: 'Dates invalides', datefmt: 'Dates hors format AAAAMMJJ',
  montant: 'Montants non numériques', numdate: 'Écritures portant plusieurs dates', apresclo: 'Écritures postérieures à la clôture',
  avantex: "Écritures antérieures au début de l'exercice", chrono: 'Numérotation non chronologique', compte: 'Numéros de compte non conformes',
  classe: 'Comptes hors classes 1 à 7', libcompte: 'Libellés de compte multiples', aux: 'Comptes auxiliaires incomplets',
  lettrage: 'Lettrage incomplet', devise: 'Devise incomplète', negatif: 'Montants négatifs', debcred: 'Lignes au débit et au crédit',
};

// Points de révision du profil affiché (officine : alertes adaptées + contrôles spécifiques).
function fecPoints(r) {
  return ui.fecProfile === 'pharmacie' ? fecAlerts(r).concat(pharmaChecks(r).filter((x) => x.level !== 'ok')) : r.alerts;
}

// Points généraux après application de la mémoire du dossier (éléments déjà justifiés).
const genPoints = (r) => applyMemo(fecPoints(r), 'gen');

function fecCounts(r) {
  const all = r.checks.concat(genPoints(r), cyclePoints(r));
  return { errors: all.filter((c) => c.level === 'error').length, warnings: all.filter((c) => c.level === 'warn').length };
}

// Analyse d'un FEC : principal (target 'main') ou exercice précédent pour la revue analytique ('prev').
function startFec(file, target) {
  if (!file) return;
  if (fecWorker) fecWorker.terminate();
  if (target === 'prev') {
    const st = ui.fec;
    Object.assign(st, { prevStatus: 'loading', prevName: file.name, prev: null, prevError: '', prevSame: null, prevSameStatus: '' });
    refresh();
    return runFecWorker(file, st, (res, err) => {
      Object.assign(st, err ? { prevStatus: 'error', prevError: err } : { prevStatus: 'done', prev: res });
      if (!err) startSamePeriod(file, st, res);
      refresh();
    });
  }
  ui.fec = { status: 'loading', pct: 0, fileName: file.name, space: data.settings.fecSpace || 'revision', section: null, q: '', classe: '' };
  refresh();
  runFecWorker(file, ui.fec, null);
}

// Situation intermédiaire : dernière écriture à plus de 20 jours de la clôture.
const isSituation = (r) => !!(r && r.meta.closing && r.pieces && r.pieces.maxOp && r.pieces.maxOp < addDays(r.meta.closing, -20));

// Pour une situation, le FEC N-1 est aussi analysé jusqu'à la même date, pour comparer des périodes identiques.
function startSamePeriod(file, st, full) {
  const r = st.result;
  if (!isSituation(r)) return;
  const shift = full.meta.closing && r.meta.closing ? daysUntilFrom(full.meta.closing, r.meta.closing) : 365;
  st.prevUntil = addDays(r.pieces.maxOp, -shift);
  st.prevSameStatus = 'loading';
  runFecWorker(file, st, (res, err) => {
    Object.assign(st, err ? { prevSameStatus: 'error' } : { prevSameStatus: 'done', prevSame: res });
    if (!st.prevMode) st.prevMode = 'same';
    refresh();
  }, st.prevUntil);
}

// FEC N-1 utilisé pour les comparaisons : même période pour une situation (si disponible), sinon exercice complet.
function cmpPrev() {
  const f = ui.fec;
  if (!f || !f.prev) return null;
  return f.prevMode !== 'full' && f.prevSame ? f.prevSame : f.prev;
}

const fecAlive = (st) => !!data && ui.fecState === st;

// Profil d'analyse : l'activité du dossier rattaché (structure classique ou officine), sinon déduit du contenu du FEC.
function applyProfile(st) {
  const c = clientById(st.clientId);
  if (c && c.activite) Object.assign(st, { profile: c.activite, profileAuto: false });
  else Object.assign(st, { profile: withFec(st, 'classique', () => looksLikePharmacy(st.result)) ? 'pharmacie' : 'classique', profileAuto: true });
  return st.profile;
}

// Profil choisi à la main : il devient l'activité du dossier rattaché (ses prochains FEC seront analysés ainsi).
function setFecProfile(p) {
  const f = ui.fec;
  if (!f || !['classique', 'pharmacie'].includes(p)) return;
  Object.assign(f, { profile: p, profileAuto: false });
  const c = clientById(f.clientId);
  if (c && c.activite !== p) {
    c.activite = p;
    c.updatedAt = nowIso();
    persist();
    toast(`${clientLabel(c)} : ${p === 'pharmacie' ? 'officine' : 'structure classique'}, retenu pour les prochaines analyses (fiche du dossier).`);
  }
  refresh();
}

// Trois espaces de travail sur un même FEC, selon la question du moment.
const FEC_SPACES = {
  mois: { label: 'Mois', hint: 'Gestion courante : pièces du mois, contrôles de saisie, TVA' },
  revision: { label: 'Révision', hint: 'Situation et bilan : cycles, écritures, pièces, revue N-1, rapprochement' },
  consult: { label: 'Consultation', hint: 'Chiffres : SIG, bilan, balance, journaux et tiers, conformité du fichier' },
};
const SPACE_OF = { 'mois-pieces': 'mois', 'mois-saisie': 'mois', tva: 'mois', sig: 'consult', balance: 'consult', details: 'consult', conformite: 'consult' };
const spaceOf = (tab) => SPACE_OF[tab] || 'revision';

// Mois de l'espace « Mois » (AAAA-MM) : par défaut le dernier mois complet saisi.
function fecMonth() {
  const f = ui.fec;
  const months = (f.result.monthly || []).map((x) => x.mois);
  if (!f.month || !months.includes(f.month)) {
    let ym = ymOf(defaultArrete(f.result, 'situation'));
    if (!months.includes(ym)) ym = months[months.length - 1] || ymOf(todayStr());
    f.month = ym;
  }
  return f.month;
}

// Contenu à analyser : le FEC lui-même, ou celui d'une archive .zip « FEC + justificatifs » (seuls les noms des justificatifs sont lus).
const isZip = (file) => /\.zip$/i.test(file.name || '') || /zip/.test(file.type || '');
async function fecSource(file) {
  if (!isZip(file)) return { buffer: await file.arrayBuffer(), name: file.name, docs: null };
  const a = await ArchiveReader.read(file);
  return { buffer: a.fec.buffer, name: a.fec.name, docs: a.docs.map((d) => ({ base: d.base })), archive: file.name };
}

function runFecWorker(file, st, onDone, until) {
  fecSource(file).then(({ buffer, name, docs, archive }) => {
    fecWorker = new Worker('js/fec-worker.js?v=' + ASSET_VERSION);
    fecWorker.onmessage = (e) => {
      const m = e.data;
      if (!fecAlive(st)) return;
      if (m.type === 'progress') {
        st.pct = m.pct;
        if (ui.fec !== st) return;
        const bar = $('.fec-progress span');
        if (bar) bar.style.width = m.pct + '%';
        const label = $('.fec-progress-label');
        if (label) label.textContent = `Analyse en cours… ${m.pct} %`;
        return;
      }
      fecWorker.terminate();
      fecWorker = null;
      if (m.type === 'done' && archive) m.result.meta.archive = archive;
      if (onDone) return onDone(m.type === 'done' ? m.result : null, m.type === 'error' ? m.message : '');
      if (m.type === 'error') Object.assign(st, { status: 'error', message: m.message });
      else {
        const siren = m.result.meta.siren;
        const match = clientBySiren(siren);
        Object.assign(st, { status: 'done', result: m.result, clientId: match ? match.id : '' });
        applyProfile(st);
      }
      if (location.hash.startsWith('#/fec') && ui.fec === st) refresh();
      else toast(m.type === 'error' ? 'Analyse du FEC impossible.' : 'Analyse du FEC terminée.');
    };
    fecWorker.onerror = (err) => {
      if (!fecAlive(st)) return;
      if (onDone) return onDone(null, err.message || 'Erreur pendant l\'analyse.');
      Object.assign(st, { status: 'error', message: err.message || 'Erreur pendant l\'analyse.' });
      refresh();
    };
    fecWorker.postMessage({ buffer, fileName: name, until: until || '', docs }, [buffer]);
  }, (err) => {
    if (!fecAlive(st)) return;
    if (onDone) return onDone(null, err.message);
    Object.assign(st, { status: 'error', message: err.message });
    refresh();
  });
}

// ---------- Graphiques (SVG) ----------

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

const moisLabel = (ym) => MOIS_COURTS[Number(ym.slice(5, 7)) - 1] + (ym.slice(5, 7) === '01' ? ' ' + ym.slice(2, 4) : '');

function roundedBar(x, y0, y1, w) {
  // Barre arrondie (4 px) côté valeur, ancrée sur la ligne de base.
  const top = Math.min(y0, y1), h = Math.abs(y1 - y0);
  if (h < 0.5) return '';
  const r = Math.min(4, w / 2, h);
  if (y1 < y0) return `M${x},${y0}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${y0}Z`;
  return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
}

function axisY(ticks, y, W, left, fmtFn) {
  return ticks.map((t) => `<line class="viz-grid" x1="${left}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/><text class="viz-axis" x="${left - 6}" y="${y(t) + 4}" text-anchor="end">${esc(fmtFn(t))}</text>`).join('');
}

// Barres groupées (même unité, un seul axe).
function barChart(rows, series, opts) {
  const W = 720, H = 230, left = 58, right = 8, top = 10, bottom = 26;
  const vals = rows.flatMap((r) => series.map((s) => r[s.key]));
  const max = niceMax(Math.max(0, ...vals));
  const min = Math.min(0, ...vals) < 0 ? -niceMax(-Math.min(...vals)) : 0;
  const y = (v) => top + ((max - v) / (max - min)) * (H - top - bottom);
  const ticks = [min, min / 2, 0, max / 2, max].filter((v, i, a) => a.indexOf(v) === i && (v >= 0 || min < 0));
  const gw = (W - left - right) / rows.length;
  const bw = Math.max(3, Math.min(18, (gw - 8 - 2 * (series.length - 1)) / series.length));
  const every = rows.length > 14 ? 2 : 1;
  const marks = rows.map((r, i) => {
    const x0 = left + i * gw + (gw - (bw * series.length + 2 * (series.length - 1))) / 2;
    const bars = series.map((s, k) => `<path d="${roundedBar(x0 + k * (bw + 2), y(0), y(r[s.key]), bw)}" fill="var(${s.color})"/>`).join('');
    const tip = `${opts.tipTitle(r)}\n` + series.map((s) => `${s.label} : ${eur(r[s.key])} €`).join('\n');
    return `${bars}<rect class="viz-hit" x="${left + i * gw}" y="${top}" width="${gw}" height="${H - top - bottom}" data-tip="${esc(tip)}" tabindex="0"/>
      ${i % every === 0 ? `<text class="viz-axis" x="${left + i * gw + gw / 2}" y="${H - 8}" text-anchor="middle">${esc(opts.xLabel(r))}</text>` : ''}`;
  }).join('');
  return `<div class="viz-scroll"><svg class="viz" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria)}">${axisY(ticks, y, W - right, left, eurK)}<line class="viz-base" x1="${left}" x2="${W - right}" y1="${y(0)}" y2="${y(0)}"/>${marks}</svg></div>`;
}

function lineChart(rows, key, opts) {
  const W = 720, H = 200, left = 58, right = 8, top = 12, bottom = 26;
  const vals = rows.map((r) => r[key]);
  const max = Math.max(0, ...vals) > 0 ? niceMax(Math.max(...vals)) : 0;
  const min = Math.min(0, ...vals) < 0 ? -niceMax(-Math.min(...vals)) : 0;
  const span = max - min || 1;
  const y = (v) => top + ((max - v) / span) * (H - top - bottom);
  const gw = (W - left - right) / rows.length;
  const x = (i) => left + i * gw + gw / 2;
  const ticks = [min, (min + max) / 2, max].concat(min < 0 && max > 0 ? [0] : []).filter((v, i, a) => a.indexOf(v) === i);
  const every = rows.length > 14 ? 2 : 1;
  const path = rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r[key]).toFixed(1)}`).join('');
  return `<div class="viz-scroll"><svg class="viz" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria)}">${axisY(ticks, y, W - right, left, eurK)}
    <line class="viz-base" x1="${left}" x2="${W - right}" y1="${y(0)}" y2="${y(0)}"/>
    <path d="${path}" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round"/>
    ${rows.map((r, i) => `<circle cx="${x(i)}" cy="${y(r[key])}" r="4" fill="var(--series-1)" stroke="var(--surface)" stroke-width="2"/>
      <rect class="viz-hit" x="${left + i * gw}" y="${top}" width="${gw}" height="${H - top - bottom}" data-tip="${esc(`${opts.tipTitle(r)}\n${opts.label} : ${eur(r[key])} €`)}" tabindex="0"/>
      ${i % every === 0 ? `<text class="viz-axis" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(opts.xLabel(r))}</text>` : ''}`).join('')}
    ${rows.length ? `<text class="viz-label" x="${x(rows.length - 1) - 6}" y="${y(rows[rows.length - 1][key]) - 10}" text-anchor="end">${esc(eurK(rows[rows.length - 1][key]))}</text>` : ''}
  </svg></div>`;
}

function benfordChart(b) {
  const W = 720, H = 200, left = 44, right = 8, top = 10, bottom = 26;
  const max = niceMax(Math.max(...b.rows.map((r) => Math.max(r.observe, r.attendu))));
  const y = (v) => top + ((max - v) / max) * (H - top - bottom);
  const gw = (W - left - right) / 9;
  const pct = (v) => (v * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %';
  return `<div class="viz-scroll"><svg class="viz" viewBox="0 0 ${W} ${H}" role="img" aria-label="Répartition des premiers chiffres comparée à la loi de Benford">
    ${axisY([0, max / 2, max], y, W - right, left, pct)}<line class="viz-base" x1="${left}" x2="${W - right}" y1="${y(0)}" y2="${y(0)}"/>
    ${b.rows.map((r, i) => {
      const x0 = left + i * gw;
      return `<path d="${roundedBar(x0 + gw / 2 - 11, y(0), y(r.observe), 22)}" fill="var(--series-1)"/>
        <line x1="${x0 + gw / 2 - 16}" x2="${x0 + gw / 2 + 16}" y1="${y(r.attendu)}" y2="${y(r.attendu)}" stroke="var(--text)" stroke-width="2" stroke-linecap="round"/>
        <rect class="viz-hit" x="${x0}" y="${top}" width="${gw}" height="${H - top - bottom}" tabindex="0" data-tip="${esc(`Premier chiffre ${r.chiffre}\nObservé : ${pct(r.observe)} (${r.n.toLocaleString('fr-FR')})\nAttendu : ${pct(r.attendu)}`)}"/>
        <text class="viz-axis" x="${x0 + gw / 2}" y="${H - 8}" text-anchor="middle">${r.chiffre}</text>`;
    }).join('')}
  </svg></div>`;
}

const legend = (items) => `<div class="viz-legend">${items.map(([color, label, line]) => `<span><i class="${line ? 'key-line' : 'key-box'} key${color.replace('--', '-')}"></i>${esc(label)}</span>`).join('')}</div>`;

// ---------- Écran ----------

function levelBadge(level) {
  const l = LEVEL[level] || LEVEL.info;
  return `<span class="lvl lvl-${level}" title="${l.label}"><b aria-hidden="true">${l.icon}</b>${l.label}</span>`;
}

function checkList(items, showOk) {
  const list = showOk ? items : items.filter((c) => c.level !== 'ok');
  if (!list.length) return '<p class="muted">Aucun point relevé.</p>';
  const order = { error: 0, warn: 1, info: 2, ok: 3 };
  return `<ul class="fec-checks">${list.slice().sort((a, b) => order[a.level] - order[b.level]).map((c) => `
    <li class="fec-check">
      ${c.examples && c.examples.length ? '<details><summary>' : '<div class="fec-check-row">'}
        ${levelBadge(c.level)}
        <span class="fec-check-text"><span><strong>${esc(c.label)}</strong>${c.count && c.level !== 'ok' && c.count > 1 ? ` <span class="count">${c.count.toLocaleString('fr-FR')}</span>` : ''}</span>${c.detail ? `<span class="muted small">${esc(c.detail)}</span>` : ''}</span>
      ${c.examples && c.examples.length ? `</summary><ul class="fec-ex">${c.examples.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></details>` : '</div>'}
    </li>`).join('')}</ul>`;
}

function viewFec() {
  const f = ui.fec;
  const pharma = ui.fecProfile === 'pharmacie';
  const head = `<div class="page-head"><h1>Analyse FEC</h1>
    <div class="head-actions">${f && f.status === 'done' ? `<button class="btn" data-action="fec-export">Exporter en Excel</button>` : ''}
      <a class="btn" href="#/portefeuille">${icon('grid')}Plusieurs dossiers</a>
      <button class="btn primary" data-action="fec-pick">${f ? 'Analyser un autre FEC' : 'Choisir un FEC'}</button></div></div>`;
  if (!f) {
    return `${head}
      <div class="fec-drop card" data-action="fec-pick" role="button" tabindex="0">
        ${icon('chart', 'fec-drop-ico')}
        <p><strong>Déposez le FEC d'un dossier ici</strong> ou cliquez pour le choisir</p>
        <p class="muted small">Fichier .txt ou .csv au format de l'article A47 A-1 du LPF (tabulation ou « | », UTF-8 ou ISO-8859-15), y compris BNC / BA, ou archive <strong>.zip « FEC + justificatifs »</strong> (export Pennylane). Le dossier est retrouvé par le SIREN ; une pharmacie est reconnue (ou indiquée dans la fiche du dossier) et analysée comme une officine.</p>
      </div>
      <div class="grid3 space-cards">
        ${Object.entries(FEC_SPACES).map(([k, x]) => `<button class="card space-card${k === (data.settings.fecSpace || 'revision') ? ' on' : ''}" data-action="fec-pick" data-space="${k}" title="Choisir un FEC et l'ouvrir dans l'espace ${esc(x.label)}"><strong>${esc(x.label)}</strong><span class="muted small">${esc(x.hint)}.</span>${k === (data.settings.fecSpace || 'revision') ? '<em>Ouvert à l\'arrivée du FEC</em>' : ''}</button>`).join('')}
      </div>
      <section class="card"><h2>${icon('shield')} Confidentialité</h2>
        <p>Le FEC est analysé <strong>sur cet appareil uniquement</strong>, dans un processus isolé : il n'est ni envoyé, ni conservé. Seule la synthèse (chiffres clés et nombre d'anomalies) peut être enregistrée, chiffrée, dans le dossier si vous le demandez.</p>
        <p class="muted small">Les analyses sont indicatives et ne remplacent pas le contrôle du fichier par l'outil officiel Test Compta Demat de la DGFiP. Les fonctions marquées <span class="badge beta">bêta</span> n'ont pas encore été validées sur de vrais dossiers : contrôlez leurs résultats.</p>
      </section>`;
  }
  if (f.status === 'loading') {
    return `${head}<section class="card fec-loading"><p><strong>${esc(f.fileName)}</strong></p>
      <div class="fec-progress"><span data-w="${f.pct}"></span></div><p class="muted fec-progress-label">Analyse en cours… ${f.pct} %</p>
      <p class="muted small">Le fichier est lu sur cet appareil. Pour un gros FEC, cela peut prendre quelques secondes.</p></section>`;
  }
  if (f.status === 'error') {
    return `${head}<div class="banner warn"><span><strong>${esc(f.fileName)}</strong> : ${esc(f.message)}</span></div>`;
  }
  const r = f.result;
  const m = r.meta;
  const { errors, warnings } = fecCounts(r);
  const dmy = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
  const clients = data.clients.filter((c) => !c.archive).sort((a, b) => clientLabel(a).localeCompare(clientLabel(b), 'fr'));
  if (f.section && spaceOf(f.section) !== f.space) f.space = spaceOf(f.section);
  const space = FEC_SPACES[f.space] ? f.space : (f.space = 'revision');
  const cnt = (label, n) => `${label}${n ? ` (${n})` : ''}`;
  // Onglets de l'espace affiché (les compteurs des autres espaces ne sont pas calculés)
  let tabs, tva = null;
  if (space === 'mois') {
    const ym = fecMonth();
    tva = r.cycles && r.cycles.tva && Object.keys(r.cycles.tva.months).length ? tvaData(r) : null;
    tabs = { 'mois-pieces': cnt('Pièces du mois', computePieces(r, 'mois', endOfMonth(`${ym}-01`)).length), 'mois-saisie': cnt('Contrôles de saisie', saisieLeft(r, ym)) };
    if (tva) tabs.tva = cnt('TVA · bêta', wpProgress(tva.cycle, tva.checks).left);
  } else if (space === 'consult') {
    tabs = { sig: 'SIG et bilan', balance: 'Balance', details: 'Journaux et tiers', conformite: cnt('Conformité du fichier', errors) };
  } else {
    const nbPieces = r.pieces ? computePieces(r, piecesState().mode, piecesState().arrete).length : 0;
    const cc = cycleChecks(r);
    const cyc = (k, label) => ({ [k]: cnt(label, cc ? wpProgress(k, cc[k]).left : 0) });
    tabs = Object.assign({ synthese: 'Synthèse' }, pharma ? { tp: 'Tiers payant', catva: 'CA & TVA' } : {},
      cc ? Object.assign(cyc('achats', 'Achats'), cyc('charges', 'Charges externes'), pharma ? {} : cyc('clients', 'Clients'), cyc('treso', 'Trésorerie')) : {},
      r.cycles ? { ecritures: cnt('Écritures', ecrProposals(r).filter((p) => p.on).length) } : {},
      { pieces: cnt('Pièces à demander', nbPieces), revue: 'Revue N / N-1', rappro: 'Rapprochement' });
  }
  f.lastTab = f.lastTab || {};
  if (!tabs[f.section]) f.section = tabs[f.lastTab[space]] ? f.lastTab[space] : Object.keys(tabs)[0];
  f.lastTab[space] = f.section;
  // Profil fixé par le dossier mais contenu du FEC différent : on le signale.
  const isPh = looksLikePharmacy(r);
  const suggest = !f.profileAuto && isPh !== pharma
    ? `<div class="banner info"><span>${isPh ? 'Ce FEC ressemble à celui d\'une <strong>pharmacie</strong> (tiers payant, TVA à 2,1 %, honoraires), alors que le dossier est indiqué en structure classique.' : 'Ce FEC ne ressemble pas à celui d\'une pharmacie, alors que le dossier est indiqué comme officine.'}</span><button class="btn small" data-action="fec-profile" data-to="${isPh ? 'pharmacie' : 'classique'}">${isPh ? 'Analyser comme une officine' : 'Analyser en structure classique'}</button></div>` : '';
  let body = '';

  if (f.section === 'synthese') {
    const k = r.kpi;
    const tile = (label, value, cls) => `<div class="kpi ${cls || ''}"><strong>${value}</strong><span>${label}</span></div>`;
    const nbPieces = r.pieces ? computePieces(r, piecesState().mode, piecesState().arrete).length : 0;
    body = `
      ${nbPieces ? `<div class="banner info"><span><strong>${nbPieces} pièce(s) ou information(s)</strong> à demander au client pour ${piecesState().mode === 'bilan' ? 'le bilan' : 'la situation'} au ${fmtDate(piecesState().arrete)}.</span><button class="btn small" data-action="fec-tab" data-tab="pieces">Voir la liste</button></div>` : ''}
      <div class="kpis fec-kpis">
        ${tile('Anomalies', errors, errors ? 'kpi-late' : '')}
        ${tile('Points à vérifier', warnings, warnings ? 'kpi-wait' : '')}
        ${tile('Chiffre d\'affaires', eurK(k.ca))}
        ${pharma ? (() => {
          const ph = pharmaData(r, pharmaRef(r));
          return `${tile('Taux de marque', ph.tauxMarque === null ? '—' : (ph.tauxMarque * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %')}
            ${tile('Encours tiers payant', eurK(ph.encoursAmo + ph.encoursAmc))}
            ${tile(`Rejets probables${ph.lettrage ? '' : ' (estim.)'}`, eurK(ph.rejets), ph.rejets > 0 ? 'kpi-late' : '')}`;
        })() : `${tile('Résultat', eurK(k.resultat), k.resultat < 0 ? 'kpi-late' : '')}
        ${tile('EBE', eurK(k.ebe))}
        ${tile('Trésorerie', eurK(k.tresorerie), k.tresorerie < 0 ? 'kpi-late' : '')}`}
      </div>
      ${cyclesCard(r)}
      ${justifCard(r)}
      ${r.monthly.length ? `
      <section class="card"><h2>Chiffre d'affaires et charges par mois</h2>
        ${legend([['--series-1', 'Chiffre d\'affaires (70)'], ['--series-2', 'Charges (classe 6)']])}
        ${barChart(r.monthly, [{ key: 'ca', label: 'Chiffre d\'affaires', color: '--series-1' }, { key: 'charges', label: 'Charges', color: '--series-2' }], { aria: 'Chiffre d\'affaires et charges par mois', xLabel: (x) => moisLabel(x.mois), tipTitle: (x) => moisLabel(x.mois).replace(/ \d+$/, '') + ' ' + x.mois.slice(0, 4) })}
      </section>
      <section class="card"><h2>Trésorerie en fin de mois <span class="muted small">(comptes 51 à 53, à-nouveaux compris)</span></h2>
        ${lineChart(r.monthly, 'tresorerie', { aria: 'Trésorerie en fin de mois', label: 'Trésorerie', xLabel: (x) => moisLabel(x.mois), tipTitle: (x) => 'Fin ' + moisLabel(x.mois).replace(/ \d+$/, '').toLowerCase() + ' ' + x.mois.slice(0, 4) })}
        <details class="viz-table"><summary>Voir les données mensuelles</summary>
          <div class="grid-wrap"><table class="dtable num"><thead><tr><th>Mois</th><th>CA</th><th>Charges</th><th>TVA collectée</th><th>TVA déductible</th><th>Trésorerie</th></tr></thead>
          <tbody>${r.monthly.map((x) => `<tr><td>${x.mois.slice(5)}/${x.mois.slice(0, 4)}</td><td>${eur(x.ca)}</td><td>${eur(x.charges)}</td><td>${eur(x.tvaCollectee)}</td><td>${eur(x.tvaDeductible)}</td><td>${eur(x.tresorerie)}</td></tr>`).join('')}</tbody></table></div>
        </details>
      </section>` : ''}
      <section class="card"><h2>Points de révision <span class="count">${genPoints(r).filter((x) => x.level !== 'ok').length}</span></h2>${wpCycleBar('gen', genPoints(r))}${wpCheckList(genPoints(r), 'gen')}</section>
      ${errors ? `<section class="card"><h2>Anomalies de conformité du fichier</h2>${checkList(r.checks.filter((c) => c.level === 'error'))}<button class="btn small" data-action="fec-tab" data-tab="conformite">Voir tous les contrôles</button></section>` : ''}`;
  } else if (f.section === 'mois-pieces') {
    body = viewPieces();
  } else if (f.section === 'mois-saisie') {
    body = viewSaisie();
  } else if (f.section === 'ecritures') {
    body = viewEcritures();
  } else if (f.section === 'achats') {
    body = viewAchats();
  } else if (f.section === 'charges') {
    body = viewCharges();
  } else if (f.section === 'clients') {
    body = viewClients();
  } else if (f.section === 'treso') {
    body = viewTreso();
  } else if (f.section === 'tva') {
    body = viewTva();
  } else if (f.section === 'tp') {
    body = viewTiersPayant();
  } else if (f.section === 'catva') {
    body = viewCaTva();
  } else if (f.section === 'rappro') {
    body = viewRappro();
  } else if (f.section === 'revue') {
    body = viewRevue();
  } else if (f.section === 'pieces') {
    body = viewPieces();
  } else if (f.section === 'conformite') {
    body = `<section class="card"><h2>Contrôles de conformité du fichier</h2>
      <p class="muted small">Référence : article A47 A-1 du livre des procédures fiscales. Cliquez sur un contrôle pour voir des exemples de lignes concernées.</p>
      ${checkList(r.checks, true)}</section>`;
  } else if (f.section === 'sig') {
    const row = (label, v, strong) => `<tr class="${strong ? 'strong' : ''}"><td>${esc(label)}</td><td>${eur(v)}</td></tr>`;
    body = `<div class="grid2">
      <section class="card"><h2>Soldes intermédiaires de gestion</h2>
        <table class="dtable num sig"><tbody>${r.sig.map((s) => row(s.label, s.value, s.strong)).join('')}</tbody></table>
        <p class="muted small">Calculés à partir des comptes de classes 6 et 7 du FEC (hors écritures de clôture).</p></section>
      <section class="card"><h2>Bilan simplifié</h2>
        <table class="dtable num sig"><thead><tr><th>Actif</th><th></th></tr></thead><tbody>${r.bilan.actif.map(([l, v]) => row(l, v)).join('')}${row('Total actif', r.bilan.totalActif, true)}</tbody></table>
        <table class="dtable num sig"><thead><tr><th>Passif</th><th></th></tr></thead><tbody>${r.bilan.passif.map(([l, v]) => row(l, v)).join('')}${row('Total passif', r.bilan.totalPassif, true)}</tbody></table>
        <p class="muted small">${m.hasAN ? 'À-nouveaux inclus.' : '<strong>Sans à-nouveaux</strong> : les postes de bilan sont incomplets.'} Classement selon le sens du solde de chaque compte.</p></section>
    </div>`;
  } else if (f.section === 'balance') {
    const q = norm(f.q);
    const list = r.balance.filter((b) => (!f.classe || b.compte[0] === f.classe) && (!q || norm(b.compte + ' ' + b.lib).includes(q)));
    const tot = list.reduce((t, b) => ({ d: t.d + b.d, c: t.c + b.c }), { d: 0, c: 0 });
    body = `<section class="card">
      <div class="filters">
        <input type="search" placeholder="Compte ou libellé…" data-fec="q" value="${esc(f.q)}" spellcheck="false" autocomplete="off">
        <select data-fec="classe" aria-label="Classe">${options({ '': 'Toutes les classes', 1: '1 — Capitaux', 2: '2 — Immobilisations', 3: '3 — Stocks', 4: '4 — Tiers', 5: '5 — Financiers', 6: '6 — Charges', 7: '7 — Produits' }, f.classe)}</select>
      </div>
      <div class="grid-wrap"><table class="dtable num balance"><thead><tr><th>Compte</th><th>Libellé</th><th>Débit</th><th>Crédit</th><th>Solde</th></tr></thead>
        <tbody>${list.slice(0, 600).map((b) => `<tr><td>${esc(b.compte)}</td><td>${esc(b.lib)}</td><td>${eur(b.d)}</td><td>${eur(b.c)}</td><td class="${b.s < 0 ? 'cred' : ''}">${eur(Math.abs(b.s))} ${b.s < 0 ? 'C' : b.s > 0 ? 'D' : ''}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th colspan="2">Total (${list.length} comptes)</th><th>${eur(tot.d)}</th><th>${eur(tot.c)}</th><th>${eur(Math.abs(tot.d - tot.c))} ${tot.d - tot.c < 0 ? 'C' : tot.d - tot.c > 0 ? 'D' : ''}</th></tr></tfoot></table></div>
      ${list.length > 600 ? `<p class="muted small">600 premiers comptes affichés : affinez la recherche ou exportez en Excel.</p>` : ''}
    </section>`;
  } else {
    const tiersTable = (list, col) => `<div class="grid-wrap"><table class="dtable num"><thead><tr><th>Compte</th><th>Nom</th><th>${col}</th><th>Solde</th></tr></thead><tbody>${list.map((t) => `<tr><td>${esc(t.num)}</td><td>${esc(t.lib)}</td><td>${eur(col === 'Facturé (débit)' ? t.d : t.c)}</td><td class="${t.s < 0 ? 'cred' : ''}">${eur(Math.abs(t.s))} ${t.s < 0 ? 'C' : t.s > 0 ? 'D' : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Aucun</td></tr>'}</tbody></table></div>`;
    body = `
      <div class="grid2">
        <section class="card"><h2>Principaux clients (411)</h2>${tiersTable(r.tiers.clients, 'Facturé (débit)')}</section>
        <section class="card"><h2>Principaux fournisseurs (401)</h2>${tiersTable(r.tiers.fournisseurs, 'Facturé (crédit)')}</section>
      </div>
      <section class="card"><h2>Journaux</h2><div class="grid-wrap"><table class="dtable num"><thead><tr><th>Code</th><th>Libellé</th><th>Écritures</th><th>Lignes</th><th>Débit</th><th>Crédit</th></tr></thead>
        <tbody>${r.journals.map((j) => `<tr><td>${esc(j.code)}</td><td>${esc(j.lib)}</td><td>${j.entries.toLocaleString('fr-FR')}</td><td>${j.lines.toLocaleString('fr-FR')}</td><td>${eur(j.d)}</td><td>${eur(j.c)}</td></tr>`).join('')}</tbody></table></div></section>
      <section class="card"><h2>Loi de Benford <span class="muted small">(${r.benford.n.toLocaleString('fr-FR')} montants ≥ 10 €)</span></h2>
        ${r.benford.level === 'n/a' ? '<p class="muted">Pas assez de montants pour un test significatif (500 minimum).</p>' : `
        ${legend([['--series-1', 'Fréquence observée'], ['--text', 'Fréquence attendue (Benford)', true]])}
        ${benfordChart(r.benford)}
        <p>Écart absolu moyen : <strong>${r.benford.mad.toFixed(4)}</strong> — ${levelBadge(r.benford.level === 'conforme' || r.benford.level === 'acceptable' ? 'ok' : 'info')} ${esc(r.benford.level)} <span class="muted small">(seuils de Nigrini : 0,006 / 0,012 / 0,015)</span></p>`}
      </section>`;
  }

  return `${head}
    <section class="card fec-meta">
      <div class="fec-meta-grid">
        <div><div class="muted small">Fichier</div><strong class="fec-file">${esc(m.fileName)}</strong></div>
        <div><div class="muted small">SIREN · clôture</div>${esc(m.siren || '—')} · ${dmy(m.closing)}</div>
        <div><div class="muted small">Période des écritures</div>${dmy(m.minDate)} → ${dmy(m.maxDate)}</div>
        <div><div class="muted small">Volume</div>${m.lines.toLocaleString('fr-FR')} lignes · ${m.entries.toLocaleString('fr-FR')} écritures · ${m.accounts.toLocaleString('fr-FR')} comptes</div>
        ${r.cycles && r.cycles.justif ? `<div><div class="muted small">Justificatifs${m.archive ? ` (${esc(m.archive)})` : ''}</div>${r.cycles.justif.docs.toLocaleString('fr-FR')} fichier(s) · ${r.cycles.justif.judged ? `${Math.round((r.cycles.justif.ok / r.cycles.justif.judged) * 100)} % des pièces retrouvées` : 'rapprochement impossible'}</div>` : ''}
      </div>
      <div class="fec-link">
        <label>Dossier<select data-fec="client">${options(Object.fromEntries(clients.map((c) => [c.id, `${c.code ? c.code + ' — ' : ''}${clientLabel(c)}`])), f.clientId, '— Rattacher à un dossier —')}</select></label>
        <label>Profil<select data-fec="profile">${options({ classique: `Structure classique${f.profileAuto && !pharma ? ' (détecté)' : ''}`, pharmacie: `Officine (pharmacie)${f.profileAuto && pharma ? ' (détectée)' : ''}` }, ui.fecProfile)}</select></label>
        <button class="btn" data-action="fec-save"${f.clientId ? '' : ' disabled'}>Enregistrer la synthèse</button>
        <button class="btn" data-action="fec-mission"${f.clientId && (errors || warnings) ? '' : ' disabled'}>Créer une mission de revue</button>
      </div>
    </section>
    ${suggest}
    <div class="seg fec-spaces" role="tablist" aria-label="Espace de travail">${Object.entries(FEC_SPACES).map(([k, x]) => `<button role="tab" aria-selected="${k === space}" class="${k === space ? 'on' : ''}" data-action="fec-space" data-space="${k}" title="${esc(x.hint)}"><strong>${esc(x.label)}</strong><span>${esc(x.hint)}</span></button>`).join('')}</div>
    ${space === 'mois' ? moisHeader(r, tva) : ''}
    <div class="seg fec-tabs" role="tablist" aria-label="${esc(FEC_SPACES[space].label)}">${Object.entries(tabs).map(([k, l]) => `<button role="tab" aria-selected="${k === f.section}" class="${k === f.section ? 'on' : ''}" data-action="fec-tab" data-tab="${k}">${esc(l)}</button>`).join('')}</div>
    ${body}`;
}
