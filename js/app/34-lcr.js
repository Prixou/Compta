/*
 * Suivi Dossiers — Écritures LCR pour ACD : relevés d'effets à payer (PDF) → une OD par relevé (chaque effet au débit
 * du fournisseur, le total au crédit du compte de contrepartie) et fichier d'import ACD.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- Écritures LCR ----------
// 1. Listing fournisseurs du dossier (Excel ou CSV : colonne A le compte, colonne B l'intitulé), retenu.
// 2. Relevés en PDF, autant qu'on veut : relevé d'effets à payer du Crédit Agricole (n° du relevé, date de règlement,
//    date d'édition « AU », contrat, effets avec avis P = payé, R ou S = rejeté) ou relevé de lettres de change du CIC
//    (n° de relevé, date de règlement, date « LE : », compte et total, effets ; un montant refusé = rejeté) ; nombre et
//    total contrôlés. Le dossier est repéré par le contrat (Crédit Agricole) ou le compte (CIC).
// 3. Chaque tireur est rapproché d'un compte du listing (mots du nom, formes juridiques ignorées) ; les corrections et
//    confirmations sont retenues pour le dossier, et reprises le mois suivant, comme le listing (associé au dossier au
//    premier export) et les réglages.
// 4. Écritures : une par relevé (pièce = n° du relevé), effets payés au débit, total au crédit ; fichier d'import ACD
//    (point-virgule, sans en-tête, montants avec virgule, Windows) et tableau de contrôle Excel.
// Les relevés restent en mémoire ; listings, correspondances et réglages sont dans les données chiffrées.

const LCR_DEF = { journal: 'OD', banque: '58003000', dateMode: 'reglement', libMax: 30 };
const lcrState = () => (ui.lcr = ui.lcr || { rel: [], errors: [], view: 'todo', progress: '', planErr: '', idx: null, sug: null, linked: '' });
const lcrData = () => data.settings.lcrAcd || {};
const LCR_BANKS = { CA: 'Crédit Agricole', CIC: 'CIC' };
// Réglages du dossier des relevés chargés, sinon les derniers utilisés
function lcrOpts() {
  const d = lcrData(), c = lcrContrat();
  return Object.assign({}, LCR_DEF, (c !== 'sans-contrat' && (d.optsBy || {})[c]) || d.opts || {});
}
function lcrSave(fn) {
  const s = (data.settings.lcrAcd = Object.assign({ opts: {}, plan: null, mem: {}, plans: {}, optsBy: {} }, data.settings.lcrAcd || {}));
  s.plans = s.plans || {};
  s.optsBy = s.optsBy || {};
  fn(s);
  persist();
}
const lcrEur = (c) => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lcrDec = (c) => `${Math.floor(c / 100)},${String(c % 100).padStart(2, '0')}`;
const lcrCents = (s) => parseInt(String(s).replace(/[^\d]/g, ''), 10);
const lcrPl = (n, a, b) => `${n} ${n > 1 ? b : a}`;

// ---------- Listing fournisseurs ----------
const LCR_STOP = new Set('SA SAS SASU SARL SNC EURL SLU SL SCS SCA CLT STE SOCIETE LAB LABO LABOS LABORAT LABORATOIR LABORATOIRE LABORATOIRES FRANCE FRANC FRAN FR INTERNATIONAL INTERNATIONALE INTERNA INTERNAT INTL DE DU DES LA LE LES ET CO CIE GROUPE GROUP CIAL GMBH KG LTD LIMITED INC SPA BV AG'.split(' '));
function lcrToks(s) {
  const all = String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter((t) => t.length > 1);
  const kept = all.filter((t) => !LCR_STOP.has(t));
  return kept.length ? kept : all;
}
// Listing du dossier des relevés chargés (associé au premier export), sinon le dernier chargé ; et son index (mots de
// l'intitulé, plus le code sans son F initial)
function lcrPlanRaw() {
  const d = lcrData(), c = lcrContrat();
  const own = c !== 'sans-contrat' && (d.plans || {})[c];
  return own ? Object.assign({}, own, { for: c }) : d.plan;
}
function lcrPlan() {
  const p = lcrPlanRaw();
  if (!p || !p.rows || !p.rows.length) return null;
  const st = lcrState();
  const key = `${p.at}|${p.for || ''}`;
  if (!st.idx || st.idx.key !== key) {
    st.idx = {
      key, map: new Map(p.rows.map((r) => [String(r[0]), String(r[1] || '')])),
      index: p.rows.map(([code, lib]) => {
        const t = lcrToks(lib || '');
        const c = String(code).toUpperCase().replace(/^F/, '');
        return { code: String(code), lib: String(lib || ''), t, all: c.length > 2 && !t.includes(c) ? t.concat([c]) : t };
      }),
    };
    st.sug = new Map();
  }
  return Object.assign({ name: p.name, at: p.at, rows: p.rows, for: p.for || '' }, st.idx);
}
// Associe le listing affiché au dossier des relevés chargés (repris ensuite automatiquement)
function lcrLink() {
  const c = lcrContrat(), p = lcrPlanRaw();
  if (!p || c === 'sans-contrat' || p.for === c) return;
  lcrSave((s) => { s.plans[c] = { name: p.name, at: p.at, rows: p.rows }; });
  lcrState().linked = c;
}
async function lcrPlanFile(file) {
  if (!file) return;
  const st = lcrState();
  st.planErr = '';
  try {
    const book = await SheetReader.read(file);
    const txt = (c) => (c && c.text !== undefined ? String(c.text) : '').trim();
    let best = null;
    (book.sheets || []).forEach((sh) => {
      const rows = (sh.rows || []).map((r) => [txt(r[0]), txt(r[1])]).filter((r) => r[0] && r[1] && !/compte|intitul/i.test(r[0]));
      if (!best || rows.length > best.length) best = rows;
    });
    if (!best || !best.length) throw new Error('aucun compte trouvé : la colonne A doit contenir les codes et la colonne B les intitulés');
    const plan = { name: file.name, at: new Date().toISOString(), rows: best };
    const c = st.rel.length ? lcrContrat() : 'sans-contrat';
    lcrSave((s) => { s.plan = plan; if (c !== 'sans-contrat') s.plans[c] = plan; });
    if (c !== 'sans-contrat') st.linked = c;
    toast(`Listing fournisseurs chargé : ${lcrPl(best.length, 'compte', 'comptes')}.`);
  } catch (e) {
    st.planErr = `Listing illisible (${e.message || e}).`;
  }
  lcrRefresh();
}

// ---------- Rapprochement tireur → compte ----------
function lcrScore(tt, entry) {
  let s = 0;
  const used = new Set();
  tt.forEach((t) => {
    let b = 0, bp = null;
    entry.all.forEach((p) => {
      let v = 0;
      if (t === p) v = 1;
      else if ((t.length >= 3 && p.startsWith(t)) || (p.length >= 4 && t.startsWith(p))) v = 0.85;
      if (v > b) { b = v; bp = p; }
    });
    s += b;
    if (bp) used.add(bp);
  });
  const cov = entry.t.length ? entry.t.filter((p) => used.has(p)).length / entry.t.length : 0;
  return { s: s / tt.length, cov };
}
function lcrSuggest(nom) {
  const plan = lcrPlan();
  if (!plan) return { code: '', sure: false, note: 'Chargez le listing fournisseurs', cands: [] };
  const st = lcrState();
  if (st.sug.has(nom)) return st.sug.get(nom);
  const tt = lcrToks(nom);
  const res = plan.index.map((e) => Object.assign({ e }, lcrScore(tt, e))).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || b.cov - a.cov);
  const top = res[0], sec = res[1];
  let out;
  const firstHit = top && lcrScore([tt[0]], top.e).s >= 0.85;
  if (!top || top.s < 0.5 || (top.s < 0.85 && !firstHit)) out = { code: '', sure: false, note: 'Aucun compte proche dans le listing', cands: [] };
  else {
    const tieClose = sec && sec.s > top.s - 0.25;
    const brokenByCov = sec && Math.abs(sec.s - top.s) < 0.01 && top.cov - sec.cov >= 0.4;
    const sure = top.s >= 0.85 && (!tieClose || brokenByCov);
    const near = res.filter((x) => x.s >= top.s - 0.01).slice(0, 3);
    let note = '';
    if (near.length > 1 && !brokenByCov) note = `Plusieurs comptes possibles : ${near.map((x) => x.e.code).join(', ')}`;
    else if (!sure && tieClose) note = `Proche aussi de ${sec.e.code} (${sec.e.lib})`;
    else if (!sure) note = `Rapprochement partiel avec « ${top.e.lib} »`;
    out = { code: top.e.code, sure, note, cands: near.map((x) => x.e.code) };
  }
  st.sug.set(nom, out);
  return out;
}
// Dossier des relevés chargés (contrat ou compte le plus fréquent) : listing, correspondances et réglages lui sont retenus
function lcrContrat() {
  const c = {};
  ((ui.lcr && ui.lcr.rel) || []).forEach((r) => { if (r.contrat) c[r.contrat] = (c[r.contrat] || 0) + 1; });
  const k = Object.keys(c).sort((a, b) => c[b] - c[a]);
  return k[0] || 'sans-contrat';
}
const lcrMem = () => (lcrData().mem || {})[lcrContrat()] || {};
function lcrSetMem(nom, val) {
  const c = lcrContrat();
  lcrSave((s) => {
    const m = (s.mem[c] = s.mem[c] || {});
    if (val) m[nom] = val; else delete m[nom];
  });
}
function lcrResolve(nom) {
  const plan = lcrPlan();
  const m = lcrMem()[nom];
  if (m && m.code) {
    if (!plan || !plan.map.has(m.code)) return { code: m.code, st: 'creer', note: plan ? 'Ce code n\'est pas dans le listing : à créer dans ACD' : 'Chargez le listing', memo: true };
    return { code: m.code, st: m.ok ? 'memo' : 'verif', note: m.ok ? '' : 'Suggestion à confirmer', memo: true };
  }
  const g = lcrSuggest(nom);
  if (!g.code) return { code: '', st: 'vide', note: g.note, memo: false };
  return { code: g.code, st: g.sure ? 'auto' : 'verif', note: g.note, memo: false };
}
const LCR_LABEL = { memo: 'Mémorisé', auto: 'Trouvé', verif: 'À confirmer', creer: 'À créer', vide: 'Sans compte' };
const LCR_CHIP = { memo: 'ok', auto: 'ok', verif: 'warn', creer: 'bad', vide: 'bad' };
const lcrChip = (s) => `<span class="badge ${LCR_CHIP[s]}">${LCR_LABEL[s]}</span>`;
const LCR_TODO = new Set(['verif', 'creer', 'vide']);

// ---------- Lecture des relevés ----------
const LCR_AMT = '\\d{1,3}(?:[ .]\\d{3})*,\\d{2}';
const LCR_UNKNOWN = 'Format non reconnu. Formats lus : relevé d\'effets à payer du Crédit Agricole, relevé de lettres de change du CIC.';
function lcrFinish(o) {
  const sum = o.effets.reduce((a, e) => a + e.c, 0);
  const r = {
    ok: true, bank: o.bank, releve: o.releve, key: `${o.bank}:${o.releve}`, piece: parseInt(o.releve, 10), regl: `${o.rg[1]}/${o.rg[2]}/${o.rg[3]}`,
    au: o.au ? `${o.au[1]}/${o.au[2]}/${o.au[3]}` : null, nb: o.nb, total: o.total, contrat: o.contrat || '', effets: o.effets, sum,
  };
  r.controle = (r.nb === null || r.nb === r.effets.length) && (r.total === null || r.total === sum);
  return r;
}
// Crédit Agricole : « Relevé d'effets à payer »
const LCR_EFFET = new RegExp('^(.+?)\\s+(\\d{8})\\s+([012])\\s+(?:(.*?)\\s*)?(\\d{2}/\\d{2}/\\d{4}|[àaÀA] [vV][uU][eE])\\s+(' + LCR_AMT + ')\\s+([PRS])(?:\\s|$)');
function lcrParseCA(L, T) {
  const m1 = T.match(/RELEV[EÉ] D.EFFETS A PAYER en EUR n[°º]\s*(\d+)/i) || T.match(/RELEV[EÉ] n[°º]\s*(\d+)/i) || T.match(/relev[ée] d.effets [àa] payer n[°º]\s*(\d+)/i);
  const rg = T.match(/Date de r[èe]glement\s*:\s*(\d{2})[./](\d{2})[./](\d{4})/i);
  const au = T.match(/\bAU\s+(\d{2})[./](\d{2})[./](\d{4})/);
  const nb = T.match(/Nombre d.effet\(s\)\s*(\d+)/i);
  const tot = T.match(new RegExp('Nombre d.effet\\(s\\)\\s*\\d+\\s*Total\\s*(' + LCR_AMT + ')', 'i')) || T.match(new RegExp('\\bTotal\\s+(' + LCR_AMT + ')'));
  const ct = T.match(/contrat n[°º]\s*(\d+)/i);
  const effets = [], seen = new Set();
  L.forEach((line) => {
    const m = LCR_EFFET.exec(line);
    if (!m || seen.has(m[2])) return;
    seen.add(m[2]);
    effets.push({ nom: m[1].replace(/\s+/g, ' ').trim().replace(/^(?:\d{3,}\s+)+/, ''), num: m[2], ref: (m[4] || '').trim(), ech: m[5], c: lcrCents(m[6]), avis: m[7] });
  });
  if (!m1 || !rg || !effets.length) return null;
  return lcrFinish({ bank: 'CA', releve: m1[1], rg, au, nb: nb ? +nb[1] : null, total: tot ? lcrCents(tot[1]) : null, contrat: ct ? ct[1] : '', effets });
}
// CIC : « Relevé de lettres de change - demande d'accord de paiement » ; les colonnes sont séparées par au moins deux
// blancs, un montant refusé après le montant rejette l'effet.
const LCR_CIC = new RegExp('^(\\d{5,10})\\s+(.+?)\\s+(?:([AB])\\s+)?(\\d{2}/\\d{2}/\\d{4}|[àaÀA] vue)\\s+(' + LCR_AMT + ')(?:\\s{2,}(.*))?$', 'i');
function lcrParseCIC(raw, T) {
  const m1 = T.match(/N[°º]\s*RELEVE\s+(\d{3,})/i);
  const rg = T.match(/DATE DE REGLEMENT\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  const au = T.match(/^LE\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/m);
  const nb = T.match(/NOMBRE DE LCR\s*:\s*(\d+)/i);
  const tl = T.match(new RegExp('(\\d{5} \\d{5} \\d{11})\\s+\\d{2}/\\d{2}/\\d{4}\\s+(' + LCR_AMT + ')'));
  const effets = [], seen = new Set();
  const lines = raw.map((x) => x.replace(/[  ]/g, ' ').trim().replace(/^(?:\S{1,3}\s+)+(?=\d{5,10}\s)/, ''));
  const take = (m) => {
    if (seen.has(m[1])) return;
    seen.add(m[1]);
    const parts = m[2].split(/\s{2,}/).map((x) => x.trim()).filter(Boolean);
    effets.push({ nom: parts[0].replace(/\s+/g, ' '), num: m[1], ref: parts.slice(1).filter((x) => !/^[AB]$/.test(x)).join(' '), ech: m[4], c: lcrCents(m[5]), avis: m[6] && /\d,\d{2}/.test(m[6]) ? 'R' : 'P' });
  };
  let inTable = false;
  lines.forEach((line, i) => {
    if (/N[°º]\s*EFFET/i.test(line)) { inTable = true; return; }
    if (/DOMICILIATION|TOTAL RELEVE/i.test(line)) { inTable = false; return; }
    if (!inTable || !/^\d{5,10}\s+\S/.test(line)) return;
    let m = LCR_CIC.exec(line);
    // Ligne d'effet coupée en deux par le PDF : recollée avec la suivante
    if (!m && lines[i + 1] && !/^\d{5,10}\s+\S/.test(lines[i + 1])) m = LCR_CIC.exec(`${line}   ${lines[i + 1]}`);
    if (m) take(m);
  });
  if (!m1 || !rg || !effets.length) return null;
  return lcrFinish({ bank: 'CIC', releve: m1[1], rg, au, nb: nb ? +nb[1] : null, total: tl ? lcrCents(tl[2]) : null, contrat: tl ? tl[1].replace(/ /g, '-') : '', effets });
}
// Lignes du PDF, colonnes séparées par trois blancs
function lcrParse(raw) {
  const L = raw.map((x) => x.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const T = L.join('\n');
  let r = null;
  if (/LETTRES DE CHANGE/i.test(T) && /N[°º]\s*EFFET/i.test(T)) r = lcrParseCIC(raw, T);
  if (!r) r = lcrParseCA(L, T);
  return r || { ok: false, msg: LCR_UNKNOWN };
}
const lcrPdfLines = (doc) => doc.pages.flatMap((p) => PdfReader.lines(p).map((l) => PdfReader.segments(l, 0.9).map((x) => x.text).join('   ')));
async function lcrAddPdfs(files) {
  const list = Array.from(files || []);
  if (!list.length) return;
  const st = lcrState();
  let i = 0;
  for (const f of list) {
    i++;
    st.progress = `Lecture ${i} / ${list.length} : ${f.name}`;
    lcrRefresh();
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { st.errors.push({ file: f.name, msg: 'Ce fichier n\'est pas un PDF.' }); continue; }
    try {
      const doc = await PdfReader.read(await f.arrayBuffer());
      const r = lcrParse(lcrPdfLines(doc));
      if (!r.ok) st.errors.push({ file: f.name, msg: r.msg });
      else if (st.rel.some((x) => x.key === r.key)) st.errors.push({ file: f.name, msg: `Relevé n° ${r.releve} déjà chargé : doublon ignoré.` });
      else { r.file = f.name; st.rel.push(r); }
    } catch (e) {
      st.errors.push({ file: f.name, msg: `Lecture impossible : ${(e && e.message) || e}` });
    }
  }
  st.progress = '';
  st.rel.sort((a, b) => a.key.localeCompare(b.key));
  lcrRefresh();
}
// Fichiers déposés : PDF = relevés, Excel ou CSV = listing
function lcrDrop(files) {
  const list = Array.from(files || []);
  const plan = list.find((f) => /\.(xlsx|xls|csv|txt)$/i.test(f.name));
  if (plan) lcrPlanFile(plan);
  const pdfs = list.filter((f) => f !== plan);
  if (pdfs.length) lcrAddPdfs(pdfs);
}
const lcrRefresh = () => { if (location.hash.startsWith('#/lcr')) refresh(); };

// ---------- Écritures ----------
function lcrEntries() {
  const o = lcrOpts();
  const lib = (s) => s.replace(/;/g, ',').slice(0, Math.max(5, o.libMax | 0)).trimEnd();
  return lcrState().rel.map((r) => {
    const d = o.dateMode === 'releve' && r.au ? r.au : r.regl;
    const [dd, mm, yyyy] = d.split('/');
    const paid = r.effets.filter((e) => e.avis === 'P');
    const tot = paid.reduce((a, e) => a + e.c, 0);
    const lines = paid.map((e) => { const a = lcrResolve(e.nom); return { compte: a.code, lib: lib(`LCR ${e.num} ${e.nom}`), deb: e.c, cre: 0, e, a }; });
    lines.push({ compte: o.banque, lib: lib(`RELEVE LCR ${r.piece} DU ${dd}/${mm}/${yyyy.slice(2)}`), deb: 0, cre: tot, credit: true });
    return { r, dd, mm, yyyy, lines, tot, rejected: r.effets.filter((e) => e.avis !== 'P') };
  });
}
function lcrFileLines(E) {
  const o = lcrOpts();
  const out = [];
  E.forEach((en) => en.lines.forEach((l) => out.push([o.journal, en.dd, en.mm, en.yyyy, en.r.piece, l.compte, l.lib, lcrDec(l.deb), lcrDec(l.cre)].join(';'))));
  return out;
}
const LCR_CP = { 0x20AC: 0x80, 0x201A: 0x82, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2013: 0x96, 0x2014: 0x97, 0x0152: 0x8C, 0x0153: 0x9C };
function lcrCp1252(text) {
  const b = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); b[i] = c < 256 ? c : (LCR_CP[c] || 63); }
  return b;
}
function lcrTireurs() {
  const t = new Map();
  lcrState().rel.forEach((r) => r.effets.forEach((e) => {
    if (e.avis !== 'P') return;
    const x = t.get(e.nom) || { nom: e.nom, n: 0, c: 0 };
    x.n++;
    x.c += e.c;
    t.set(e.nom, x);
  }));
  return Array.from(t.values()).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}
function lcrPeriod() {
  const st = lcrState();
  if (!st.rel.length) return '';
  const [, mm, yyyy] = (st.rel[0].au || st.rel[0].regl).split('/');
  return `${yyyy}-${mm}`;
}
const lcrFileTag = () => { const c = lcrContrat(); return `${c !== 'sans-contrat' ? c + '_' : ''}${lcrPeriod()}`; };

// ---------- Écran ----------
function viewLcr() {
  const st = lcrState();
  const plan = lcrPlan();
  const o = lcrOpts();
  const dossier = lcrContrat();
  const T = lcrTireurs().map((t) => Object.assign(t, { a: lcrResolve(t.nom) }));
  const todo = T.filter((x) => LCR_TODO.has(x.a.st));
  const step = (n, title, sub, done, body, side = '') => `<section class="card lcr-step${done ? ' done' : ''}"><div class="lcr-head"><span class="lcr-n">${n}</span><div><h2>${title}</h2><p class="muted small">${sub}</p></div>${side ? `<div class="lcr-side">${side}</div>` : ''}</div>${body}</section>`;

  // 1. Listing
  const s1 = step(1, 'Listing fournisseurs', 'Fichier Excel ou CSV du dossier : colonne A le compte, colonne B l\'intitulé. Il est retenu (données chiffrées).', !!plan,
    `${plan ? `<div class="lcr-loaded"><span><strong>${esc(plan.name)}</strong> · ${lcrPl(plan.rows.length, 'compte', 'comptes')}${plan.at ? ` · chargé le ${esc(fmtDate(plan.at.slice(0, 10)))}` : ''}</span><button class="btn small" data-action="lcr-plan">Remplacer le listing</button></div>
      ${st.rel.length && dossier !== 'sans-contrat' ? (plan.for === dossier ? `<p class="lcr-alert good">${st.linked !== dossier ? 'Listing de ce dossier repris automatiquement. ' : ''}Ce listing est associé au compte ${esc(dossier)}.</p>`
    : `<p class="lcr-alert warn"><strong>Vérifiez que ce listing est bien celui du dossier</strong> des relevés chargés (compte ${esc(dossier)}). Il sera associé à ce compte au premier export, puis repris automatiquement.</p>`) : ''}`
      : `<div class="fec-drop lcr-drop" data-action="lcr-plan" role="button" tabindex="0">${icon('file', 'fec-drop-ico')}<p><strong>Sélectionnez ou déposez ici le listing fournisseurs</strong></p><p class="muted small">Excel (.xlsx) ou CSV</p></div>`}
    ${st.planErr ? `<p class="late small" role="alert">${esc(st.planErr)}</p>` : ''}`);

  // 2. Relevés
  const ctr = new Set(st.rel.map((r) => r.contrat).filter(Boolean));
  const s2 = step(2, 'Relevés LCR', 'Les relevés d\'effets à payer en PDF, autant que vous voulez en une fois. Un relevé déjà chargé est ignoré.', st.rel.length > 0,
    `<div class="fec-drop lcr-drop" data-action="lcr-pdf" role="button" tabindex="0">${icon('file', 'fec-drop-ico')}<p><strong>Sélectionnez ou déposez ici les relevés PDF</strong></p><p class="muted small">${st.progress ? esc(st.progress) : 'Lus dans votre navigateur : ils ne sont envoyés nulle part ni conservés.'}</p></div>
    ${st.errors.map((e) => `<p class="lcr-alert bad"><strong>${esc(e.file)}</strong> : ${esc(e.msg)}</p>`).join('')}
    ${ctr.size > 1 ? `<p class="lcr-alert warn">Ces relevés viennent de plusieurs comptes (${[...ctr].map(esc).join(', ')}). Chargez les relevés d'un seul dossier à la fois : les correspondances sont retenues pour le compte ${esc(dossier)}.</p>`
    : st.rel.length ? `<p class="muted small lcr-dossier">${esc(LCR_BANKS[st.rel[0].bank] || '')} · compte ${esc(dossier)}</p>` : ''}
    ${st.rel.length ? `<div class="grid-wrap"><table class="dtable lcr-rel"><thead><tr><th>Relevé</th><th>Banque</th><th>Édité le</th><th>Règlement</th><th class="n">Effets</th><th class="n">Total</th><th>Contrôle</th><th>Fichier</th><th></th></tr></thead><tbody>
      ${st.rel.map((r, i) => { const rej = r.effets.filter((e) => e.avis !== 'P').length; return `<tr><td class="mono">${esc(r.releve)}</td><td>${esc(LCR_BANKS[r.bank] || r.bank)}</td><td>${esc(r.au || '')}</td><td>${esc(r.regl)}</td><td class="n">${r.effets.length}${rej ? ` <span class="badge warn">${lcrPl(rej, 'rejeté', 'rejetés')}</span>` : ''}</td><td class="n">${lcrEur(r.sum)}</td><td>${r.controle ? '<span class="badge ok">= relevé</span>' : `<span class="badge bad">Écart : relevé ${r.total != null ? lcrEur(r.total) : '?'}${r.nb != null ? `, ${r.nb} effets` : ''}</span>`}</td><td class="muted lcr-file">${esc(r.file)}</td><td><button class="btn small" data-action="lcr-del" data-i="${i}" aria-label="Retirer le relevé ${esc(r.releve)}">Retirer</button></td></tr>`; }).join('')}
      </tbody></table></div>` : ''}`,
    st.rel.length || st.errors.length ? '<button class="btn small" data-action="lcr-clear">Vider la liste</button>' : '');

  // 3. Comptes
  const rows = st.view === 'todo' ? todo : T;
  const s3 = step(3, 'Comptes fournisseurs', 'Chaque tireur est rapproché d\'un compte du listing. Vos corrections et confirmations sont retenues pour ce dossier : le mois prochain, elles seront reprises.', T.length > 0 && !!plan && !todo.length,
    !T.length ? '<p class="muted">Les fournisseurs des relevés apparaîtront ici.</p>'
      : `${!plan ? '<p class="lcr-alert warn">Chargez le listing fournisseurs (étape 1) pour rapprocher les comptes.</p>' : ''}
      ${st.view === 'todo' && !todo.length ? `<p class="lcr-alert good"><strong>Tous les comptes sont rapprochés.</strong> ${lcrPl(T.length, 'fournisseur', 'fournisseurs')}, aucun à confirmer ni à créer.</p>`
        : `<div class="grid-wrap"><table class="dtable lcr-acc"><thead><tr><th>Tireur sur le relevé</th><th>Compte</th><th>Intitulé dans le listing</th><th class="n">Effets</th><th class="n">Montant</th><th>Statut</th><th></th></tr></thead><tbody>
        ${rows.map((x) => { const libp = plan && x.a.code ? plan.map.get(x.a.code) : ''; return `<tr><td class="lcr-tireur"><strong>${esc(x.nom)}</strong>${x.a.note ? `<span class="muted small">${esc(x.a.note)}</span>` : ''}</td>
          <td><input class="lcr-input${x.a.code ? '' : ' empty'}" data-lcr="acct" data-nom="${esc(x.nom)}" list="lcr-plan-list" value="${esc(x.a.code)}" placeholder="Code" aria-label="Compte pour ${esc(x.nom)}" autocomplete="off" spellcheck="false"></td>
          <td class="lcr-lib${libp || !x.a.code ? '' : ' late'}">${libp ? esc(libp) : x.a.code ? 'Absent du listing' : '<span class="muted">Saisissez ou choisissez un code</span>'}</td>
          <td class="n">${x.n}</td><td class="n">${lcrEur(x.c)}</td><td>${lcrChip(x.a.st)}</td>
          <td class="lcr-act">${x.a.st === 'verif' ? `<button class="btn small" data-action="lcr-ok" data-nom="${esc(x.nom)}">Confirmer</button>` : ''}${x.a.memo ? `<button class="btn small" data-action="lcr-forget" data-nom="${esc(x.nom)}" title="Oublier ce choix et revenir à la suggestion">Oublier</button>` : ''}</td></tr>`; }).join('')}
        </tbody></table></div>`}
      ${plan ? `<datalist id="lcr-plan-list">${plan.rows.map(([c, l]) => `<option value="${esc(c)}">${esc(l)}</option>`).join('')}</datalist>` : ''}`,
    T.length ? `<div class="seg" role="group" aria-label="Afficher"><button class="${st.view === 'todo' ? 'on' : ''}" data-action="lcr-view" data-v="todo" aria-pressed="${st.view === 'todo'}">À traiter (${todo.length})</button><button class="${st.view === 'all' ? 'on' : ''}" data-action="lcr-view" data-v="all" aria-pressed="${st.view === 'all'}">Tous (${T.length})</button></div>` : '');

  // 4. Écritures et import ACD
  let s4body = '<p class="muted">Les écritures apparaîtront ici après le chargement des relevés.</p>';
  let done4 = false;
  if (st.rel.length) {
    const E = lcrEntries();
    const lines = lcrFileLines(E);
    const nEff = E.reduce((a, e) => a + e.lines.length - 1, 0);
    const tot = E.reduce((a, e) => a + e.tot, 0);
    const okCtl = st.rel.filter((r) => r.controle).length;
    const vide = T.filter((t) => t.a.st === 'vide'), cre = T.filter((t) => t.a.st === 'creer'), ver = T.filter((t) => t.a.st === 'verif');
    const blocked = vide.length > 0;
    done4 = !blocked && !cre.length && !ver.length;
    const FIELDS = ['Code journal', 'Jour', 'Mois', 'Année', 'N° de pièce', 'Compte', 'Libellé', 'Débit', 'Crédit'];
    s4body = `<div class="kpis fec-kpis">${kpiTile('Écritures', E.length)}${kpiTile('Effets', nEff)}${kpiTile('Débit = crédit', `${lcrEur(tot)} €`)}${kpiTile('Contrôle relevés', `${okCtl} / ${st.rel.length}`, okCtl === st.rel.length ? '' : 'kpi-late')}</div>
      ${vide.length ? `<p class="lcr-alert bad"><strong>${lcrPl(vide.length, 'fournisseur n\'a', 'fournisseurs n\'ont')} pas de compte</strong> : ${vide.map((t) => esc(t.nom)).join(', ')}. Renseignez-les à l'étape 3 pour débloquer le fichier.</p>` : ''}
      ${cre.length ? `<p class="lcr-alert bad"><strong>À créer dans ACD avant l'import</strong> : ${cre.map((t) => `<span class="mono">${esc(t.a.code)}</span> (${esc(t.nom)})`).join(', ')}.</p>` : ''}
      ${ver.length ? `<p class="lcr-alert warn"><strong>${lcrPl(ver.length, 'compte reste', 'comptes restent')} à confirmer</strong> à l'étape 3. Le fichier utilise la suggestion en attendant.</p>` : ''}
      ${done4 ? '<p class="lcr-alert good"><strong>Prêt pour l\'import.</strong> Tous les comptes sont rapprochés et présents dans le listing.</p>' : ''}
      <div class="lcr-actions"><button class="btn primary" data-action="lcr-txt"${blocked ? ' disabled' : ''}>Télécharger pour ACD (.txt)</button><button class="btn" data-action="lcr-xlsx"${blocked ? ' disabled' : ''}>Tableau de contrôle (.xlsx)</button><button class="btn" data-action="lcr-copy"${blocked ? ' disabled' : ''}>Copier le contenu</button></div>
      <details class="lcr-box"><summary>Réglages des écritures et de l'import ACD (retenus pour ce dossier)</summary><div class="lcr-inner">
        <div class="lett-opts">
          <label>Code journal <input data-lcr="journal" value="${esc(o.journal)}" maxlength="6"></label>
          <label>Compte au crédit <input data-lcr="banque" value="${esc(o.banque)}" maxlength="20"></label>
          <label>Date des écritures <select data-lcr="dateMode">${options({ reglement: 'Date de règlement', releve: 'Date d\'édition du relevé' }, o.dateMode)}</select></label>
          <label>Libellé, caractères max. <input data-lcr="libMax" type="number" min="10" max="60" value="${o.libMax | 0}"></label>
        </div>
        <div class="lcr-two"><dl class="lcr-acd"><dt>Type de caractères</dt><dd>Windows</dd><dt>Type de séparateur</dt><dd>Point virgule</dd><dt>Montant en centimes</dt><dd>Décoché</dd><dt>Séparateur de texte</dt><dd>Vide</dd><dt>Gestion des tiers</dt><dd>Aucun changement</dd></dl>
        <div class="grid-wrap"><table class="dtable lcr-cols"><thead><tr><th>Pos.</th><th>Champ</th><th>Exemple</th></tr></thead><tbody>${lines[0] ? lines[0].split(';').map((v, i) => `<tr><td>${i + 1}</td><td>${FIELDS[i]}</td><td class="mono">${esc(v)}</td></tr>`).join('') : ''}</tbody></table></div></div>
      </div></details>
      <details class="lcr-box"><summary>Aperçu du fichier (${lcrPl(lines.length, 'ligne', 'lignes')})</summary><div class="lcr-inner"><pre class="lcr-file" tabindex="0">${esc(lines.join('\n'))}</pre></div></details>
      ${E.map((en) => `<article class="lcr-entry"><div class="lcr-entry-head"><div><strong>Pièce ${en.r.piece}</strong> <span class="muted small">OD du ${en.dd}/${en.mm}/${en.yyyy} · relevé du ${esc(en.r.au || '?')} · ${lcrPl(en.lines.length - 1, 'effet', 'effets')}</span></div><strong class="mono">${lcrEur(en.tot)} €</strong></div>
        <div class="grid-wrap"><table class="dtable lcr-journal"><thead><tr><th>Compte</th><th>Libellé</th><th class="n">Échéance</th><th class="n">Débit</th><th class="n">Crédit</th><th></th></tr></thead><tbody>
        ${en.lines.map((l) => (l.credit ? `<tr class="lcr-credit"><td class="mono">${esc(l.compte)}</td><td class="mono">${esc(l.lib)}</td><td></td><td class="n"></td><td class="n">${lcrEur(l.cre)}</td><td></td></tr>`
    : `<tr><td class="mono">${l.compte ? esc(l.compte) : '<span class="badge bad">?</span>'}</td><td class="mono">${esc(l.lib)}</td><td class="n muted">${esc(l.e.ech)}</td><td class="n">${lcrEur(l.deb)}</td><td class="n"></td><td>${l.a.st === 'memo' || l.a.st === 'auto' ? '' : lcrChip(l.a.st)}</td></tr>`)).join('')}
        ${en.rejected.map((e) => `<tr class="lcr-rej"><td></td><td class="mono">${esc(`LCR ${e.num} ${e.nom}`)}</td><td class="n">${esc(e.ech)}</td><td class="n">${lcrEur(e.c)}</td><td class="n"></td><td><span class="badge warn">Rejeté (${esc(e.avis)})</span></td></tr>`).join('')}
        </tbody></table></div></article>`).join('')}`;
  }
  const s4 = step(4, 'Écritures et import ACD', 'Contrôlez les écritures, puis téléchargez le fichier à importer dans ACD.', done4, s4body);

  return `<div class="page-head"><h1>Écritures LCR pour ACD</h1></div>
    <p class="muted">Déposez le listing fournisseurs du dossier et les relevés LCR en PDF. L'outil passe chaque effet au débit du fournisseur, le total du relevé au crédit du compte de contrepartie, une écriture par relevé, et prépare le fichier d'import ACD. Relevés lus : Crédit Agricole (relevé d'effets à payer) et CIC (relevé de lettres de change). Les effets rejetés ne sont pas repris.</p>
    <div class="lcr">${s1}${s2}${s3}${s4}</div>`;
}

function onLcrChange(t) {
  const k = t.dataset.lcr;
  if (k === 'acct') {
    const v = t.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    lcrSetMem(t.dataset.nom, v ? { code: v, ok: true } : null);
  } else if (k in LCR_DEF) {
    const v = k === 'journal' ? t.value.toUpperCase().replace(/[^A-Z0-9]/g, '') || LCR_DEF.journal
      : k === 'banque' ? t.value.toUpperCase().replace(/[^A-Z0-9]/g, '') || LCR_DEF.banque
        : k === 'libMax' ? Math.min(60, Math.max(10, parseInt(t.value, 10) || LCR_DEF.libMax)) : t.value;
    const c = lcrContrat();
    const next = Object.assign(lcrOpts(), { [k]: v });
    lcrSave((s) => { s.opts = next; if (c !== 'sans-contrat') s.optsBy[c] = next; });
  } else return;
  const open = $$('.lcr details').map((d) => d.open);
  refresh();
  $$('.lcr details').forEach((d, i) => { d.open = !!open[i]; });
}

// ---------- Fichiers ----------
const lcrText = () => lcrFileLines(lcrEntries()).join('\r\n') + '\r\n';
async function lcrConfirm() {
  return ask({ title: 'Fichier non chiffré', message: 'Le fichier contient les écritures et les noms des fournisseurs <strong>non chiffrés</strong>. Supprimez-le après l\'import.', okLabel: 'Télécharger' });
}
async function lcrDownloadTxt() {
  if (!(await lcrConfirm())) return;
  lcrLink();
  refresh();
  const blob = new Blob([lcrCp1252(lcrText())], { type: 'text/plain' });
  download(`Import_ACD_OD_LCR_${lcrFileTag()}.txt`, blob, blob.type);
}
async function lcrDownloadXlsx() {
  if (!(await lcrConfirm())) return;
  lcrLink();
  refresh();
  const o = lcrOpts();
  const plan = lcrPlan();
  const t = (v, s) => ({ v: v === undefined || v === null ? '' : v, s: s === undefined ? 2 : s });
  const n = (c) => ({ v: c / 100, s: 8 });
  const rows = [['Journal', 'JJ', 'MM', 'AAAA', 'N° pièce', 'N° compte', 'Libellé', 'Débit', 'Crédit', 'Échéance LCR', 'N° effet', 'Tireur', 'Intitulé compte', 'Statut'].map((x) => t(x, 1))];
  lcrEntries().forEach((en) => en.lines.forEach((l) => rows.push([t(o.journal), t(en.dd), t(en.mm), t(en.yyyy), { v: en.r.piece, s: 2 }, t(l.compte), t(l.lib), n(l.deb), n(l.cre),
    t(l.e ? l.e.ech : ''), t(l.e ? l.e.num : ''), t(l.e ? l.e.nom : ''), t(l.credit ? '' : (plan && plan.map.get(l.compte)) || 'Absent du listing'), t(l.credit ? '' : LCR_LABEL[l.a.st])])));
  const blob = XlsxWriter.build({ sheets: [{ name: 'Ecritures OD', rows, widths: [6, 4, 4, 6, 9, 12, 32, 12, 12, 12, 11, 28, 32, 12], freeze: { row: 1 } }] });
  download(`Ecritures_OD_LCR_${lcrFileTag()}.xlsx`, blob, blob.type);
}
async function lcrCopy() {
  lcrLink();
  refresh();
  try { await navigator.clipboard.writeText(lcrText()); toast('Contenu copié.'); } catch (e) { toast('Copie impossible sur ce navigateur : ouvrez l\'aperçu du fichier.', true); }
}
