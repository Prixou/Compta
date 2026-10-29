/*
 * Suivi Dossiers — Ratios sectoriels : ratios INSEE Ésane 2023 par code NAF, comparés aux chiffres d'un dossier
 * (saisis ou repris de l'analyse FEC ouverte). Données : js/ratios-insee.js, chargé à la première ouverture.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- Ratios sectoriels ----------

const RAT_LEVELS = { a10: 'Agrégat A10', a21: 'Section', a88: 'Division', a272: 'Groupe', sc: 'Sous-classe' };
const RAT_SIZES = [['MIC', 'Microentreprises'], ['PME', 'PME hors micro'], ['ETIGE', 'ETI et grandes entreprises']];

const ratDiv = (a, b, k) => (ratNum(a) && ratNum(b) && b !== 0 ? (a / b) * k : null);
const ratNum = (x) => typeof x === 'number' && Number.isFinite(x);

// Ratios Ésane (i : colonne INSEE). dir : +1 plus haut = mieux, -1 plus bas = mieux, 0 neutre. c : ratio du dossier (k€).
const RAT_RATIOS = [
  { f: 'Activité et production' },
  { i: 0, l: "Taux d'exportation", d: 'CA export / CA', u: '%', dir: 0, c: (v) => ratDiv(v.exp, v.ca, 100) },
  { i: 1, l: 'Taux de valeur ajoutée', d: 'VA / CA', u: '%', dir: 1, c: (v) => ratDiv(v.va, v.ca, 100) },
  { i: 2, l: 'Productivité apparente du travail', d: 'VA / effectif ETP', u: 'k€', dir: 1, c: (v) => ratDiv(v.va, v.etp, 1) },
  { i: 3, l: 'Intensité capitalistique', d: 'Immobilisations corporelles / effectif ETP', u: 'k€', dir: 0, c: (v) => ratDiv(v.immo, v.etp, 1) },
  { f: 'Partage de la valeur ajoutée' },
  { i: 4, l: 'Part des frais de personnel', d: 'Frais de personnel / VA', u: '%', dir: -1, c: (v) => ratDiv(v.fp, v.va, 100) },
  { i: 5, l: 'Taux de marge', d: 'EBE / VA', u: '%', dir: 1, c: (v) => ratDiv(v.ebe, v.va, 100) },
  { f: 'Rentabilité' },
  { i: 6, l: 'Rentabilité économique', d: "EBE / capital d'exploitation (immos + BFR)", u: '%', dir: 1, c: (v) => (v.cap > 0 ? ratDiv(v.ebe, v.cap, 100) : null) },
  { i: 7, l: 'Rentabilité financière', d: 'Résultat net / capitaux propres', u: '%', dir: 1, c: (v) => (v.cp > 0 ? ratDiv(v.rn, v.cp, 100) : null) },
  { i: 8, l: 'Rentabilité globale', d: '(EBE + produits financiers) / actif net', u: '%', dir: 1, c: null },
  { f: 'Endettement et solvabilité' },
  { i: 9, l: 'Levier financier', d: 'Emprunts et dettes financières / fonds propres', u: '%', dir: -1, c: (v) => (v.cp > 0 ? ratDiv(v.emp, v.cp, 100) : null) },
  { i: 10, l: 'Taux de prélèvement financier', d: "Charges d'intérêts / EBE", u: '%', dir: -1, c: (v) => (v.ebe > 0 ? ratDiv(v.int, v.ebe, 100) : null) },
  { i: 11, l: "Taux d'endettement", d: 'Emprunts et dettes financières / total passif', u: '%', dir: -1, c: (v) => ratDiv(v.emp, v.tp, 100) },
  { i: 17, l: "Taux d'autonomie financière", d: 'Capitaux propres / total passif', u: '%', dir: 1, c: (v) => ratDiv(v.cp, v.tp, 100) },
  { i: 18, l: 'Couverture des valeurs immobilisées', d: 'Ressources stables / immobilisations brutes', u: '%', dir: 1, c: null },
  { f: 'Autofinancement et investissement' },
  { i: 12, l: "Marge d'autofinancement", d: 'CAF / VA', u: '%', dir: 1, c: (v) => ratDiv(v.caf, v.va, 100) },
  { i: 15, l: "Taux d'investissement", d: 'Investissements corporels / VA', u: '%', dir: 0, c: (v) => ratDiv(v.inv, v.va, 100) },
  { i: 16, l: "Taux d'autofinancement", d: 'CAF / investissements corporels', u: '%', dir: 1, c: (v) => ratDiv(v.caf, v.inv, 100) },
  { f: 'Délais de paiement' },
  { i: 13, l: 'Délai fournisseurs', d: 'Dettes fournisseurs / achats TTC × 360', u: 'j', dir: 0, c: (v) => (v.tvaR === null || v.ach === null ? null : ratDiv(v.fou, v.ach * (1 + v.tvaR), 360)) },
  { i: 14, l: 'Délai clients', d: 'Créances clients / CA TTC × 360', u: 'j', dir: -1, c: (v) => (v.tvaR === null || v.ca === null ? null : ratDiv(v.cli, v.ca * (1 + v.tvaR), 360)) },
  { f: 'Fonds de roulement' },
  { i: 19, l: 'BFR total du secteur', d: 'Somme des BFR des entreprises du secteur', u: 'M€', dir: 0, c: null },
];

// Indicateurs calculés sur les agrégats des sous-classes (M€).
const RAT_IND = [
  { l: 'CA moyen par entreprise', d: "CA / nombre d'entreprises", u: 'k€', s: (a) => ratDiv(a.ca, a.n, 1000), c: (v) => v.ca, dir: 0 },
  { l: 'Effectif moyen par entreprise', d: "ETP / nombre d'entreprises", u: 'ETP', s: (a) => ratDiv(a.etp, a.n, 1), c: (v) => v.etp, dir: 0 },
  { l: 'CA par salarié', d: 'CA / effectif ETP', u: 'k€', s: (a) => ratDiv(a.ca, a.etp, 1000), c: (v) => ratDiv(v.ca, v.etp, 1), dir: 1 },
  { l: 'Valeur ajoutée / CA', d: 'VA / CA', u: '%', s: (a) => ratDiv(a.va, a.ca, 100), c: (v) => ratDiv(v.va, v.ca, 100), dir: 1 },
  { l: 'Frais de personnel / CA', d: 'Salaires et charges sociales / CA', u: '%', s: (a) => ratDiv(a.fp, a.ca, 100), c: (v) => ratDiv(v.fp, v.ca, 100), dir: -1 },
  { l: 'EBE / CA', d: "Taux de marge brute d'exploitation", u: '%', s: (a) => ratDiv(a.ebe, a.ca, 100), c: (v) => ratDiv(v.ebe, v.ca, 100), dir: 1 },
  { l: 'Résultat courant / CA', d: 'RCAI / CA', u: '%', s: (a) => ratDiv(a.rcai, a.ca, 100), c: (v) => ratDiv(v.rcai, v.ca, 100), dir: 1 },
  { l: 'Résultat net / CA', d: 'Rentabilité commerciale', u: '%', s: (a) => ratDiv(a.rn, a.ca, 100), c: (v) => ratDiv(v.rn, v.ca, 100), dir: 1 },
  { l: 'CAF / CA', d: "Capacité d'autofinancement / CA", u: '%', s: (a) => ratDiv(a.caf, a.ca, 100), c: (v) => ratDiv(v.caf, v.ca, 100), dir: 1 },
  { l: 'Investissements / CA', d: 'Investissements corporels bruts / CA', u: '%', s: (a) => ratDiv(a.inv, a.ca, 100), c: (v) => ratDiv(v.inv, v.ca, 100), dir: 0 },
];

// Chiffres du dossier (k€), dans l'ordre du formulaire.
const RAT_FIELDS = [
  ['Compte de résultat', [['ca', "Chiffre d'affaires HT"], ['exp', 'dont export'], ['ach', 'Achats + charges externes HT'], ['va', 'Valeur ajoutée'], ['fp', 'Frais de personnel'], ['ebe', 'EBE'], ['int', "Charges d'intérêts"], ['rcai', 'Résultat courant av. impôts'], ['rn', 'Résultat net'], ['caf', 'CAF']]],
  ['Bilan et effectif', [['cp', 'Capitaux propres'], ['emp', 'Emprunts et dettes fin.'], ['tp', 'Total bilan'], ['immo', 'Immos corporelles brutes'], ['cap', 'Immos nettes + BFR'], ['inv', 'Investissements corporels'], ['cli', 'Créances clients'], ['fou', 'Dettes fournisseurs'], ['etp', 'Effectif (ETP)'], ['tva', 'Taux de TVA (délais) %']]],
];
const RAT_KEYS = RAT_FIELDS.flatMap(([, list]) => list.map(([k]) => k));
// Chiffres absents du FEC : conservés quand on reprend l'analyse.
const RAT_MANUAL = ['exp', 'etp', 'tva'];

// ---------- Données ----------

let ratLoading = null;
function ratData() { return self.RATIOS_INSEE || null; }
function ratLoad() {
  if (ratData() || ratLoading) return;
  ratLoading = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = `js/ratios-insee.js?v=${ASSET_VERSION}`;
    s.onload = resolve;
    s.onerror = () => { ratLoading = null; toast('Impossible de charger les ratios INSEE.', true); resolve(); };
    document.head.appendChild(s);
  }).then(() => { if (location.hash.startsWith('#/ratios')) refresh(); });
}

function ratState() {
  ui.ratios = ui.ratios || { cur: null, ref: 'g', vals: { tva: 20 }, clientId: '', src: '', q: '' };
  return ui.ratios;
}

const ratDotted = (code) => (/^\d{4}[A-Z]$/.test(code) || /^\d{3}y?$/.test(code) ? `${code.slice(0, 2)}.${code.slice(2)}` : code);
const ratNorm = (s) => String(s || '').toUpperCase().replace(/[\s.]/g, '');

// Code saisi (69.20Z, 6920, 692, 47, M…) → sous-classe ou regroupement connu.
function ratResolve(raw) {
  const D = ratData();
  const c = ratNorm(raw);
  if (!D || !c) return null;
  if (/^\d{4}[A-Z]$/.test(c) && D.s[c]) return { code: c, kind: 'sc' };
  if (/^\d{4}$/.test(c)) { const k = Object.keys(D.s).find((x) => x.startsWith(c)); if (k) return { code: k, kind: 'sc' }; }
  if (D.g[c]) return { code: c, kind: 'g' };
  if (/^\d$/.test(c) && D.g['0' + c]) return { code: '0' + c, kind: 'g' };
  return null;
}

// Niveaux du plus large au plus fin (section, division, groupe, sous-classe).
function ratLineage(cur) {
  const D = ratData();
  let grp = null, dv = null;
  if (cur.kind === 'sc') { grp = cur.code.slice(0, 3); dv = cur.code.slice(0, 2); }
  else { const lvl = D.g[cur.code][0]; if (lvl === 'a272') { grp = cur.code; dv = cur.code.slice(0, 2); } else if (lvl === 'a88') dv = cur.code; }
  const sec = dv ? D.sec[dv] : (D.g[cur.code][0] === 'a21' ? cur.code : null);
  const out = [];
  if (sec && D.g[sec]) out.push({ code: sec, kind: 'g', lvl: 'a21' });
  if (dv && D.g[dv]) out.push({ code: dv, kind: 'g', lvl: 'a88' });
  if (grp && D.g[grp]) out.push({ code: grp, kind: 'g', lvl: 'a272' });
  if (cur.kind === 'sc') out.push({ code: cur.code, kind: 'sc', lvl: 'sc' });
  return { out, grp, dv, sec };
}

// Agrégats (M€) des sous-classes couvertes par le code.
function ratAggregate(cur) {
  const D = ratData();
  let keys;
  if (cur.kind === 'sc') keys = [cur.code];
  else {
    const lvl = D.g[cur.code][0];
    if (lvl === 'a21' || lvl === 'a10') { const divs = Object.keys(D.sec).filter((k) => k.length === 2 && D.sec[k] === cur.code); keys = Object.keys(D.s).filter((k) => divs.includes(k.slice(0, 2))); }
    else keys = Object.keys(D.s).filter((k) => k.startsWith(cur.code.replace(/y$/, '')));
  }
  const names = ['n', 'etp', 'ca', 'exp', 'va', 'fp', 'ebe', 'caf', 'rcai', 'rn', 'inv'];
  const a = Object.fromEntries(names.map((n) => [n, 0]));
  const inc = new Set();
  keys.forEach((k) => names.forEach((n, j) => { const x = D.s[k][j + 1]; if (ratNum(x)) a[n] += x; else inc.add(n); }));
  if (keys.length === 1) inc.forEach((n) => { a[n] = null; });
  return { a, inc: inc.size > 0, count: keys.length };
}

// Recherche par code ou par libellé.
function ratSearch(text) {
  const D = ratData();
  if (!D) return [];
  if (!ratSearch.index) {
    ratSearch.index = Object.entries(D.g).filter(([, v]) => v[0] !== 'a10').map(([k, v]) => ({ code: k, kind: 'g', lvl: v[0], label: v[1], key: norm(v[1]) }))
      .concat(Object.entries(D.s).map(([k, v]) => ({ code: k, kind: 'sc', lvl: 'sc', label: v[0], key: norm(v[0]) })));
  }
  const n = ratNorm(text);
  const s = norm(text).trim();
  if (!s) return [];
  let res = [];
  if (/^[0-9]/.test(n)) res = ratSearch.index.filter((x) => /^[0-9]/.test(x.code) && x.code.startsWith(n));
  else if (/^[A-Z]$/.test(n)) res = ratSearch.index.filter((x) => x.code === n);
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length && s.length > 1 && !/^[0-9]+[a-z]?$/.test(s)) ratSearch.index.forEach((x) => { if (words.every((w) => x.key.includes(w)) && !res.includes(x)) res.push(x); });
  const rank = { a21: 0, a88: 1, a272: 2, sc: 3 };
  res.sort((a, b) => (b.code === n) - (a.code === n) || a.code.length - b.code.length || rank[a.lvl] - rank[b.lvl] || a.code.localeCompare(b.code));
  return res.slice(0, 14);
}

// ---------- Chiffres repris du FEC ----------

// Chiffres du dossier en k€ d'après la balance de l'analyse FEC (approximations de la liasse : voir l'aide).
function ratiosFromFec(r) {
  const bal = r.balance || [];
  const sum = (pref, excl, fn) => bal.reduce((t, x) => (pref.some((p) => x.compte.startsWith(p)) && !(excl || []).some((p) => x.compte.startsWith(p)) ? t + fn(x) : t), 0);
  const D = (pref, excl) => sum(pref, excl, (x) => x.s);
  const P = (pref, excl) => -sum(pref, excl, (x) => x.s);
  const deb = (pref, excl) => sum(pref, excl, (x) => (x.s > 0 ? x.s : 0));
  const cre = (pref, excl) => sum(pref, excl, (x) => (x.s < 0 ? -x.s : 0));
  const sig = (label) => { const x = (r.sig || []).find((s) => s.label === label); return x ? x.value : null; };
  const b = r.bilan;
  const passif = (i) => b.passif[i][1];
  const actif = (i) => b.actif[i][1];
  const rn = r.kpi.resultat;
  const caf = rn + D(['681', '686', '687']) - P(['781', '786', '787']) + D(['675']) - P(['775']) - P(['777']);
  // Acquisitions de l'exercice : débits hors à-nouveaux des 21, et des 23 nets des mises en service.
  const inv = sum(['21'], null, (x) => x.dm) + Math.max(0, sum(['23'], null, (x) => x.dm - x.cm));
  const bfr = actif(1) + actif(2) - passif(3) - passif(4) - passif(5);
  const k = (v) => (v === null ? null : Math.round(v / 100) / 10);
  return {
    ca: k(r.kpi.ca), ach: k(D(['60', '61', '62'])), va: k(r.kpi.va), fp: k(D(['64'])), ebe: k(r.kpi.ebe), int: k(D(['661'])),
    rcai: k(sig('Résultat courant avant impôt')), rn: k(rn), caf: k(caf),
    cp: k(passif(0)), emp: k(passif(2)), tp: k(b.totalPassif), immo: k(D(['21', '22', '23'])), cap: k(actif(0) + bfr), inv: k(inv),
    cli: k(deb(['41'], ['419'])), fou: k(cre(['401', '403', '408'])),
  };
}

const ratFecLabel = (f) => `Analyse FEC${f.result.meta.closing ? ` · clôture ${fmtDate(f.result.meta.closing)}` : ''}`;

function ratClientVals() {
  const v = Object.fromEntries(RAT_KEYS.map((k) => [k, ratNum(ratState().vals[k]) ? ratState().vals[k] : null]));
  v.tvaR = v.tva === null ? null : v.tva / 100;
  return v;
}

// Saisie conservée dans le dossier choisi (chiffrée avec les autres données).
function ratSave() {
  const st = ratState();
  const c = clientById(st.clientId);
  if (!c) return;
  c.ratios = { vals: Object.assign({}, st.vals), src: st.src };
  persist();
}

function ratSelectClient(id) {
  const st = ratState();
  const c = clientById(id);
  st.clientId = c ? c.id : '';
  if (!c) return;
  if (c.ratios) Object.assign(st, { vals: Object.assign({ tva: 20 }, c.ratios.vals), src: c.ratios.src || '' });
  else Object.assign(st, { vals: { tva: 20 }, src: '' });
  const r = c.naf && ratResolve(c.naf);
  if (r) st.cur = r;
}

function ratTakeFec() {
  const st = ratState();
  const f = ui.fec;
  if (!f || !f.result) return;
  if (f.clientId && f.clientId !== st.clientId) ratSelectClient(f.clientId);
  const keep = Object.fromEntries(RAT_MANUAL.filter((k) => ratNum(st.vals[k])).map((k) => [k, st.vals[k]]));
  st.vals = Object.assign({ tva: 20 }, ratiosFromFec(f.result), keep);
  st.src = ratFecLabel(f);
  ratSave();
  refresh();
  toast("Chiffres repris de l'analyse FEC : complétez l'effectif.");
}

// ---------- Affichage ----------

const ratFmtNum = (x, u) => (u === 'j' || Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('fr-FR') : x.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
function ratFmt(x, u) {
  if (x === 'S') return '<span class="muted" title="Secret statistique">S</span>';
  if (!ratNum(x)) return '<span class="muted" title="Non disponible">–</span>';
  return `${ratFmtNum(x, u)}${u ? ` <span class="rat-u">${u}</span>` : ''}`;
}
function ratPosition(cl, se, dir, u) {
  if (!ratNum(cl) || !ratNum(se)) return '';
  const diff = cl - se;
  if (Math.abs(diff) / Math.max(Math.abs(se), u === 'j' ? 5 : 1) < 0.1) return '<span class="rat-pos eq">Dans la norme</span>';
  const above = diff > 0;
  const cls = dir === 0 ? 'neu' : (dir > 0) === above ? 'good' : 'bad';
  return `<span class="rat-pos ${cls}">${above ? 'Au-dessus' : 'En dessous'}</span>`;
}
function ratEcart(cl, se, u) {
  if (!ratNum(cl) || !ratNum(se)) return '<span class="muted">–</span>';
  const d = cl - se;
  return `${d > 0 ? '+' : ''}${ratFmtNum(d, u === 'j' ? 'j' : '')} <span class="rat-u">${u === '%' ? 'pt' : u}</span>`;
}
function ratEvol(v, p, u) {
  if (!ratNum(v) || !ratNum(p)) return '<span class="muted">–</span>';
  const d = v - p;
  if (Math.abs(d) < 0.05) return '<span class="muted">=</span>';
  return `<span class="muted">${d > 0 ? '▲' : '▼'} ${ratFmtNum(Math.abs(d), u === 'j' ? 'j' : '')}</span>`;
}
const ratRaw = (x) => (ratNum(x) ? String(Math.round(x * 10) / 10).replace('.', ',') : x == null ? '' : String(x));

// Valeurs de référence : groupe (toutes tailles) ou division par taille.
function ratRef(cur, L) {
  const D = ratData();
  const st = ratState();
  const ratioCode = cur.kind === 'sc' ? L.grp : cur.code;
  const sizes = L.dv && D.t[L.dv] ? RAT_SIZES.filter(([k]) => D.t[L.dv][k]) : [];
  const ref = st.ref !== 'g' && sizes.some(([k]) => k === st.ref) ? st.ref : 'g';
  if (ref === 'g') return { ratioCode, sizes, ref, vals: D.g[ratioCode].slice(3), prev: D.p[ratioCode] ? D.p[ratioCode].slice(1) : null, name: 'Secteur 2023', src: `Groupe ${ratDotted(ratioCode)} · ${D.g[ratioCode][1]} · Ésane 2023, rappel 2022` };
  return { ratioCode, sizes, ref, vals: D.t[L.dv][ref].slice(1), prev: null, name: 'Taille 2023', src: `Division ${L.dv} · ${RAT_SIZES.find(([k]) => k === ref)[1]} · Ésane 2023` };
}

// Lignes des deux tableaux de comparaison (affichage et copie Excel).
function ratRows(cur) {
  const L = ratLineage(cur);
  const rv = ratRef(cur, L);
  const v = ratClientVals();
  const ratios = RAT_RATIOS.map((r) => (r.f ? r : Object.assign({}, r, { se: rv.vals[r.i], prev: rv.prev ? rv.prev[r.i] : null, cl: r.c ? r.c(v) : null })));
  const ag = ratAggregate(cur);
  const ind = RAT_IND.map((r) => Object.assign({}, r, { se: r.s(ag.a), cl: r.c(v) }));
  return { L, rv, ratios, ag, ind };
}

function ratTables(cur) {
  const D = ratData();
  const { L, rv, ratios, ag, ind } = ratRows(cur);
  const head = `<tr><th>Ratio</th><th>${rv.name}</th>${rv.prev ? '<th>2022</th><th>Évol.</th>' : ''}<th>Dossier</th><th>Écart</th><th>Position</th></tr>`;
  const cols = rv.prev ? 7 : 5;
  const body = ratios.map((r) => (r.f ? `<tr class="rat-fam"><td colspan="${cols}">${r.f}</td></tr>` : `<tr><td><span class="rat-lab">${r.l}</span><span class="rat-def">${r.d}</span></td><td class="strong">${ratFmt(r.se, r.u)}</td>${rv.prev ? `<td>${ratFmt(r.prev, r.u)}</td><td>${ratEvol(r.se, r.prev, r.u)}</td>` : ''}<td>${r.c ? ratFmt(r.cl, r.u) : '<span class="muted" title="Non calculable avec ces chiffres">n/a</span>'}</td><td>${r.c ? ratEcart(r.cl, r.se, r.u) : ''}</td><td>${r.c ? ratPosition(r.cl, r.se, r.dir, r.u) : ''}</td></tr>`)).join('');
  const indBody = ind.map((r) => `<tr><td><span class="rat-lab">${r.l}</span><span class="rat-def">${r.d}</span></td><td class="strong">${ratFmt(r.se, r.u)}</td><td>${ratFmt(r.cl, r.u)}</td><td>${ratEcart(r.cl, r.se, r.u)}</td><td>${r.dir === 0 && r.u !== '%' ? '' : ratPosition(r.cl, r.se, r.dir, r.u)}</td></tr>`).join('');
  const T = L.dv && D.t[L.dv];
  const cats = T ? [['T', 'Ensemble'], ['MIC', 'Micro'], ['PME', 'PME'], ['ETIGE', 'ETI / GE']].filter(([k]) => T[k]) : [];
  const size = T ? `<section class="card"><h2>Par taille d'entreprise</h2><p class="muted small">Division ${L.dv} · ${esc(D.g[L.dv][1])} · Ésane 2023</p>
    <div class="grid-wrap"><table class="dtable rat-table"><thead><tr><th>Ratio</th>${cats.map(([, n]) => `<th>${n}</th>`).join('')}</tr></thead><tbody>
    <tr><td><span class="rat-lab">Nombre d'entreprises</span></td>${cats.map(([k]) => `<td>${ratFmt(T[k][0], '')}</td>`).join('')}</tr>
    ${RAT_RATIOS.filter((r) => !r.f && r.i !== 19).map((r) => `<tr><td><span class="rat-lab">${r.l}</span></td>${cats.map(([k]) => `<td>${ratFmt(T[k][r.i + 1], r.u)}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div></section>` : '';
  return `<section class="card"><div class="card-head"><div><h2>Ratios comptables</h2><p class="muted small">${esc(rv.src)}</p></div>
      <div class="filters"><label class="inline-label rat-ref">Comparer à<select data-ratios="ref">${options(Object.fromEntries([['g', `Secteur ${ratDotted(rv.ratioCode)} (toutes tailles)`]].concat(rv.sizes.map(([k, n]) => [k, `Division ${L.dv} · ${n}`]))), rv.ref)}</select></label>
      <button class="btn small" data-action="ratios-copy">Copier pour Excel</button></div></div>
      <div class="grid-wrap"><table class="dtable rat-table"><thead>${head}</thead><tbody>${body}</tbody></table></div></section>
    <section class="card"><h2>Indicateurs de résultat</h2><p class="muted small">${cur.kind === 'sc' ? `Sous-classe ${ratDotted(cur.code)}` : `Cumul des ${ag.count} sous-classes du secteur`} · calculé sur les agrégats Ésane 2023${ag.inc && cur.kind !== 'sc' ? ' (sous-classes sous secret exclues)' : ''}</p>
      <div class="grid-wrap"><table class="dtable rat-table"><thead><tr><th>Indicateur</th><th>Secteur 2023</th><th>Dossier</th><th>Écart</th><th>Position</th></tr></thead><tbody>${indBody}</tbody></table></div></section>
    ${size}`;
}

function ratSuggest(q) {
  const list = ratSearch(q);
  if (!list.length) return q.trim() ? '<p class="muted small">Aucun secteur trouvé.</p>' : '';
  return `<ul class="rat-sugg">${list.map((x) => `<li><button type="button" data-action="ratios-go" data-code="${esc(x.code)}" data-kind="${x.kind}"><span class="rat-code">${ratDotted(x.code)}</span><span>${esc(x.label)}</span><span class="rat-lvl">${RAT_LEVELS[x.lvl]}</span></button></li>`).join('')}</ul>`;
}

function ratClientPanel() {
  const st = ratState();
  const f = ui.fec && ui.fec.status === 'done' && ui.fec.result ? ui.fec : null;
  const clients = data.clients.filter((c) => !c.archive).sort((a, b) => clientLabel(a).localeCompare(clientLabel(b), 'fr'));
  const c = clientById(st.clientId);
  const input = (k, label) => `<label>${label}<input type="text" inputmode="decimal" data-ratios-f="${k}" value="${ratNum(st.vals[k]) ? String(st.vals[k]).replace('.', ',') : ''}" autocomplete="off" spellcheck="false"></label>`;
  return `<aside class="card rat-client">
    <h2>Le dossier</h2>
    <p class="muted small">Montants en k€, exercice complet.</p>
    <label>Dossier<select data-ratios="client">${options(Object.fromEntries(clients.map((x) => [x.id, `${x.code ? x.code + ' — ' : ''}${clientLabel(x)}`])), st.clientId, '— Sans dossier —')}</select></label>
    ${f ? `<button class="btn block" data-action="ratios-fec">Reprendre l'analyse FEC</button><p class="muted small">${esc(f.fileName)}${f.clientId && f.clientId !== st.clientId && clientById(f.clientId) ? ` · dossier ${esc(clientLabel(clientById(f.clientId)))}` : ''}</p>` : '<p class="muted small">Ouvrez un FEC dans l\'analyse FEC pour reprendre ses chiffres ici.</p>'}
    ${st.src ? `<p class="small"><span class="badge">${esc(st.src)}</span></p>` : ''}
    ${c && st.cur && ratNorm(c.naf) !== st.cur.code ? `<button class="btn small block" data-action="ratios-naf">Retenir ${ratDotted(st.cur.code)} comme code NAF du dossier</button>` : ''}
    <div class="rat-form">
      ${RAT_FIELDS.map(([legend, list]) => `<fieldset><legend>${legend}</legend><div class="rat-fields">${list.map(([k, l]) => input(k, l)).join('')}</div></fieldset>`).join('')}
    </div>
    <button class="btn small" data-action="ratios-clear">Vider</button>
  </aside>`;
}

function viewRatios(clientId) {
  const st = ratState();
  const D = ratData();
  if (!D) {
    ratLoad();
    return '<div class="page-head"><h1>Ratios sectoriels</h1></div><section class="card"><p class="muted">Chargement des ratios INSEE…</p></section>';
  }
  if (clientId && clientId !== st.clientId && clientById(clientId)) ratSelectClient(clientId);
  const cur = st.cur && (st.cur.kind === 'sc' ? D.s[st.cur.code] : D.g[st.cur.code]) ? st.cur : null;
  const search = `<section class="card rat-search">
      <label>Code NAF ou activité<input type="search" data-ratios="q" value="${esc(st.q)}" placeholder="69.20Z, 692, 47… ou boulangerie, pharmacie…" autocomplete="off" spellcheck="false"></label>
      <div class="rat-sugg-box">${ratSuggest(st.q)}</div></section>`;
  const head = `<div class="page-head"><div><h1>Ratios sectoriels</h1><p class="muted small">INSEE, Ésane 2023 · NAF rév. 2 · données sur l'appareil, aucune connexion</p></div></div>`;
  if (!cur) {
    return `${head}${search}<div class="rat-layout"><div><section class="card"><p class="muted">Recherchez un secteur par son code NAF (fiche du dossier, extrait Kbis ou avis de situation INSEE) ou par son libellé.</p>
      <div class="rat-chips">${['6920Z', '1071C', '4773Z', '4334Z', '5610A', '4520A', '8622C', '6831Z'].filter((k) => D.s[k]).map((k) => `<button type="button" class="rat-chip" data-action="ratios-go" data-code="${k}" data-kind="sc"><span class="rat-code">${ratDotted(k)}</span>${esc(D.s[k][0])}</button>`).join('')}</div></section></div>${ratClientPanel()}</div>`;
  }
  const L = ratLineage(cur);
  const label = cur.kind === 'sc' ? D.s[cur.code][0] : D.g[cur.code][1];
  const ratioCode = cur.kind === 'sc' ? L.grp : cur.code;
  const rg = D.g[ratioCode];
  const a = ratAggregate(cur).a;
  const kpi = (k, v, n) => `<div class="kpi"><span>${k}</span><strong>${v}</strong><span>${n}</span></div>`;
  let children = [];
  if (cur.kind === 'sc') children = Object.keys(D.s).filter((k) => k.startsWith(L.grp) && k !== cur.code).map((k) => [k, 'sc', D.s[k][0]]);
  else if (rg[0] === 'a272') children = Object.keys(D.s).filter((k) => k.startsWith(cur.code)).map((k) => [k, 'sc', D.s[k][0]]);
  else if (rg[0] === 'a88') children = Object.keys(D.g).filter((k) => D.g[k][0] === 'a272' && k.length === 3 && k.startsWith(cur.code)).map((k) => [k, 'g', D.g[k][1]]);
  else if (rg[0] === 'a21') children = Object.keys(D.g).filter((k) => D.g[k][0] === 'a88' && D.sec[k] === cur.code).map((k) => [k, 'g', D.g[k][1]]);
  return `${head}${search}
    <nav class="rat-crumbs" aria-label="Hiérarchie NAF">${L.out.map((x) => `<button type="button" class="link-btn small" data-action="ratios-go" data-code="${esc(x.code)}" data-kind="${x.kind}"><span class="rat-code">${ratDotted(x.code)}</span> ${x.code === cur.code ? RAT_LEVELS[x.lvl] : esc(x.kind === 'sc' ? D.s[x.code][0] : D.g[x.code][1])}</button>`).join('<span class="muted">›</span>')}</nav>
    <h2 class="rat-title">${esc(label)}</h2>
    <p class="muted small">${cur.kind === 'sc' ? `Sous-classe <span class="rat-code">${ratDotted(cur.code)}</span>. Les ratios comptables INSEE sont publiés au niveau du groupe <span class="rat-code">${ratDotted(ratioCode)}</span> (${esc(rg[1])}).` : `${RAT_LEVELS[rg[0]]} <span class="rat-code">${ratDotted(cur.code)}</span>.`}</p>
    <div class="kpis rat-kpis">
      ${kpi('Entreprises', ratFmt(cur.kind === 'sc' ? a.n : rg[2], ''), cur.kind === 'sc' ? 'dans la sous-classe' : 'dans le secteur')}
      ${kpi("Chiffre d'affaires", ratNum(a.ca) ? `${ratFmtNum(a.ca / 1000, '')} Md€` : ratFmt(a.ca), 'cumul du secteur')}
      ${kpi('Effectif salarié', ratNum(a.etp) ? `${ratFmtNum(a.etp, '')} ETP` : ratFmt(a.etp), 'équivalent temps plein')}
      ${kpi('CA moyen', ratFmt(ratDiv(a.ca, a.n, 1000), 'k€'), 'par entreprise')}
      ${kpi('Taux de marge', ratFmt(rg[8], '%'), `EBE / VA, groupe ${ratDotted(ratioCode)}`)}
    </div>
    <div class="rat-layout">
      <div><div id="rat-tables">${ratTables(cur)}</div>
        ${children.length ? `<section class="card"><h2>${cur.kind === 'sc' ? `Autres activités du groupe ${ratDotted(L.grp)}` : 'Activités détaillées'}</h2><div class="rat-chips">${children.map(([k, kind, l]) => `<button type="button" class="rat-chip" data-action="ratios-go" data-code="${esc(k)}" data-kind="${kind}"><span class="rat-code">${ratDotted(k)}</span>${esc(l)}</button>`).join('')}</div></section>` : ''}
      </div>
      ${ratClientPanel()}
    </div>
    <p class="muted small rat-note"><strong>Lecture.</strong> Les ratios INSEE sont des ratios <em>agrégés</em> (somme des numérateurs du secteur divisée par la somme des dénominateurs) : ils pèsent surtout les grandes entreprises. Pour une TPE, comparez plutôt à la catégorie « Microentreprises » de la division. Les moyennes par entreprise incluent les micro-entrepreneurs. « S » = secret statistique. Les délais de paiement INSEE sont calculés sur des montants TTC et 360 jours ; le dossier applique le taux de TVA indiqué. Chiffres repris du FEC : approximations à partir de la balance (voir l'aide).<br>
    <strong>Sources.</strong> Insee, Ésane 2023 (publié le 18/09/2025) : ratios comptables par groupe et par taille (insee.fr/fr/statistiques/8611638), principales caractéristiques par sous-classe (insee.fr/fr/statistiques/8611562). Champ : entreprises marchandes hors agriculture et hors services financiers, France.</p>`;
}

// Mise à jour pendant la frappe : seules les suggestions ou les tableaux sont redessinés (le curseur reste en place).
function ratiosInput(t) {
  const st = ratState();
  if (t.dataset.ratios === 'q') {
    st.q = t.value;
    const box = $('.rat-sugg-box');
    if (box) box.innerHTML = ratSuggest(st.q);
    return;
  }
  if (t.dataset.ratiosF) {
    const v = parseMontant(t.value);
    if (v === null) delete st.vals[t.dataset.ratiosF];
    else st.vals[t.dataset.ratiosF] = v;
    ratSave();
    const box = $('#rat-tables');
    if (box && st.cur) box.innerHTML = ratTables(st.cur);
  }
}

function ratiosChange(t) {
  const st = ratState();
  if (t.dataset.ratios === 'ref') { st.ref = t.value; refresh(); }
  else if (t.dataset.ratios === 'client') { ratSelectClient(t.value); refresh(); }
}

// Entrée dans la recherche : premier résultat, ou code exact.
function ratiosEnter(t) {
  const st = ratState();
  const first = ratSearch(t.value)[0];
  const r = first ? { code: first.code, kind: first.kind } : ratResolve(t.value);
  if (!r) return;
  st.cur = r;
  st.q = '';
  refresh();
  window.scrollTo(0, 0);
}

function ratiosGo(el) {
  const st = ratState();
  st.cur = { code: el.dataset.code, kind: el.dataset.kind };
  st.q = '';
  refresh();
  window.scrollTo(0, 0);
}

function ratiosCopy() {
  const st = ratState();
  if (!st.cur) return;
  const D = ratData();
  const { rv, ratios, ind } = ratRows(st.cur);
  const label = st.cur.kind === 'sc' ? D.s[st.cur.code][0] : D.g[st.cur.code][1];
  const diff = (r) => (ratNum(r.cl) && ratNum(r.se) ? ratRaw(r.cl - r.se) : '');
  const lines = [[`Secteur ${ratDotted(st.cur.code)} ${label}`], ['Ratio', 'Unité', rv.name].concat(rv.prev ? ['2022'] : [], ['Dossier', 'Écart'])]
    .concat(ratios.filter((r) => !r.f).map((r) => [r.l, r.u, ratRaw(r.se)].concat(rv.prev ? [ratRaw(r.prev)] : [], [ratRaw(r.cl), diff(r)])))
    .concat([[], ['Indicateurs de résultat', 'Unité', 'Secteur 2023', 'Dossier', 'Écart']], ind.map((r) => [r.l, r.u, ratRaw(r.se), ratRaw(r.cl), diff(r)]));
  navigator.clipboard.writeText(lines.map((l) => l.join('\t')).join('\n')).then(() => toast('Tableau copié : collez-le dans Excel.'), () => toast('Copie impossible sur ce navigateur.', true));
}

function ratiosSetNaf() {
  const st = ratState();
  const c = clientById(st.clientId);
  if (!c || !st.cur) return;
  c.naf = ratDotted(st.cur.code);
  c.updatedAt = nowIso();
  persist();
  refresh();
  toast(`Code NAF ${c.naf} enregistré dans le dossier.`);
}
