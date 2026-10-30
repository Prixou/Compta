/*
 * Suivi Dossiers — CYCLE SOCIAL : cadrage de la paie (641, 645, 63 liés à la paie, 42 et 43, congés payés 4282 et 4382)
 * entre les éditions SILAE (récapitulatif ou journal de paie, détail des cotisations, solde de repos ; Excel ou PDF) et le
 * FEC (celui de l'analyse en cours, déposé, ou un grand livre du journal de paie), avec une note par compte, les motifs
 * d’écart et les écritures de reclassement. C'est aussi le rapprochement avec Silae du cycle H de la révision.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- CYCLE SOCIAL ----------
// Quatre dépôts : récapitulatif de paie SILAE (Excel : brut, net, indemnités par période) ou journal de paie (PDF : brut et
// net de l'exercice), détail des cotisations SILAE (Excel ou PDF ; par organisme : parts salariale et patronale, détail
// mensuel en Excel, contributions formation et apprentissage), FEC (ou grand livre Excel du journal de paie), solde de
// repos (facultatif, PDF ou Excel : indemnité et charges de congés payés à la clôture). Ouvert depuis le cycle H de
// l'analyse, le FEC analysé est repris et la synthèse est enregistrée dans la feuille de l'exercice. Dans un FEC, les
// écritures de paie sont celles qui mouvementent un 645 ou créditent le
// 421, quel que soit leur journal ; dans un grand livre, celles des journaux de paie. Chaque compte est rapproché de la paie : 641 du brut, chaque 645 de la part patronale des organismes
// qui lui sont rattachés (automatiquement, au plus près, ou à la main), 6312 / 6333 / 6335 des contributions, 421 du
// net, 43x et 44x des cotisations (salariales + patronales) de leurs organismes. Un écart reçoit des motifs
// (automatiques, saisis, pistes trouvées dans les autres comptes) ; deux écarts opposés sont proposés en reclassement.
// Congés payés : 6412 et les 641 / 645 dont le libellé cite les congés restent hors du brut et des organismes ; 4282 et
// 4382 sont rapprochés du solde de repos. Les fichiers restent en mémoire (le verrouillage efface l'écran). Rattaché à un
// dossier (FEC de l'analyse, ou FEC dont le SIREN est celui d'un dossier), le cadrage est enregistré chiffré dans la
// feuille de l'exercice : organismes rattachés (par leur nom), comptes 641 retenus, motifs, reclassements et synthèse.
// Le nom du logiciel comptable et la ligne choisie dans une édition PDF (brut, net, congés payés) valent pour le cabinet.

const SOC_TOL = 0.05;
const socFmt = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const socF = (n) => socFmt.format(Math.abs(n) < 0.005 ? 0 : n);
const socFa = (n) => socF(Math.abs(n));
const socNum = (v) => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v).replace(/[\s  €]/g, '');
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '');
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const socTxt = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
const socShort = (a) => { let s = String(a).replace(/0+$/, ''); while (s.length < 3) s += '0'; return s; };
const socR2 = (n) => Math.round(n * 100) / 100;
const socLL = (l) => [l.code, l.lib].filter(Boolean).join(' ');
const socSum = (a) => socR2((a || []).reduce((x, y) => x + y, 0));

function socState() {
  ui.social = ui.social || { files: [], parsed: { recap: null, cot: null, gl: [], repos: null }, pdf: {}, MAP: {}, MAN: {}, RM: {}, SAL: {}, RECL: [], dClo: '', last: null, err: '', inputs: {}, link: null, fecOf: null };
  return ui.social;
}
const socSoft = () => data.settings.socialSoft || 'Pennylane';

// ---------- Lecture des fichiers ----------
async function socReadRows(file) {
  const book = await SheetReader.read(file);
  const out = [];
  book.sheets.forEach((s) => s.rows.forEach((r) => out.push(r.map((c) => c.text))));
  return out;
}
function socDecode(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('windows-1252').decode(buf); }
}
function socKindOf(rows) {
  const head = rows.slice(0, 15).map((r) => (r || []).map(socTxt).join(' | ')).join('\n');
  if (/détail des cotisations/i.test(head) || /code ducs/i.test(head)) return 'cot';
  if (/récapitulatif de paie/i.test(head)) return 'recap';
  if (/compte/i.test(head) && /d[ée]bit/i.test(head) && /cr[ée]dit/i.test(head)) return 'gl';
  const allText = rows.slice(0, 80).map((r) => (r || []).map(socTxt).join('|')).join('\n');
  if (/Salaire Brut/i.test(allText)) return 'recap';
  if (/Patronal/i.test(allText)) return 'cot';
  return null;
}

function socParseRecap(rows) {
  const hi = rows.findIndex((r) => r && r.some((c) => /^Salarial$/i.test(socTxt(c))));
  if (hi < 0) throw new Error('Récapitulatif de paie : colonne « Salarial » introuvable');
  const hdr = rows[hi].map(socTxt), prow = (rows[hi - 1] || []).map(socTxt);
  const li = hdr.findIndex((c) => /^libell/i.test(c)), ci = hdr.findIndex((c) => /^code$/i.test(c));
  const per = [], others = [];
  let tot = null;
  hdr.forEach((c, i) => {
    if (!/^Salarial$/i.test(c)) return;
    const lab = prow[i - 1] || prow[i] || prow[i - 2] || '';
    const m = lab.match(/(\d{2})\/(\d{4})/);
    const pc = /^Patronal$/i.test(hdr[i + 1] || '') ? i + 1 : hdr.findIndex((x) => /^Patronal$/i.test(x));
    if (m) per.push({ p: `${m[1]}/${m[2]}`, s: i, pt: pc });
    else if (/total/i.test(lab)) tot = { p: '', s: i, pt: pc };
    else others.push({ p: '', s: i, pt: pc });
  });
  if (!per.length) { if (tot) per.push(tot); else per.push(...others); }
  const lines = [];
  for (let k = hi + 1; k < rows.length; k++) {
    const r = rows[k] || [];
    const lib = socTxt(r[li]);
    if (!lib) continue;
    lines.push({ code: socTxt(r[ci]), lib, sal: per.map((p) => socNum(r[p.s])), pat: per.map((p) => (p.pt >= 0 ? socNum(r[p.pt]) : 0)) });
  }
  const get = (re) => lines.find((l) => re.test(l.lib));
  const brut = get(/^Salaire Brut$/i), net = get(/^Net à payer$/i), indem = get(/^Total indemnités coût global/i), report = get(/^Report des mois/i), ret = get(/^Total des retenues$/i);
  const extras = lines.filter((l) => /^K/i.test(l.code) && !/impôt|exonération|net à payer|rémunération|montant net|net imposable/i.test(l.lib) && Math.abs(socSum(l.sal)) > 0.005)
    .map((l) => ({ lib: l.lib, amt: socSum(l.sal) }));
  return { periods: per.map((p) => p.p), brut: brut ? brut.sal : [], net: net ? net.sal : [], indem: indem ? indem.sal : null, report: report ? socSum(report.sal) : 0, patTot: ret ? socSum(ret.pat) : 0, extras };
}

function socParseCot(rows) {
  const hi = rows.findIndex((r) => r && r.some((c) => /^Patronal$/i.test(socTxt(c))) && r.some((c) => /^Salarial$/i.test(socTxt(c))));
  if (hi < 0) throw new Error('Détail des cotisations : en-têtes introuvables');
  const hdr = rows[hi].map(socTxt);
  const ci = hdr.findIndex((c) => /^code$/i.test(c)), li = hdr.findIndex((c) => /^libell/i.test(c)), si = hdr.findIndex((c) => /^Salarial$/i.test(c)), pi = hdr.findIndex((c) => /^Patronal$/i.test(c));
  const orgs = [];
  let buf = [], pend = null, last = null;
  for (let k = hi + 1; k < rows.length; k++) {
    const r = rows[k] || [];
    const code = socTxt(r[ci]), lib = socTxt(r[li]);
    if (!code && !lib) continue;
    const m = !code && lib.match(/^(.*\S)\s+-\s+(\d{2}\/\d{4})$/);
    if (m) {
      if (!pend || pend.name !== m[1]) pend = { name: m[1], monthly: {} };
      pend.monthly[m[2]] = { sal: socNum(r[si]), pat: socNum(r[pi]) };
      continue;
    }
    if (!code && /paiement/i.test(lib)) {
      if (last) { last.ref = lib.split(',')[0].trim(); last.freq = (lib.match(/paiement\s+(\w+)/i) || [])[1] || ''; }
      continue;
    }
    if (!code && /^(sous total|salarial \+ patronal|total des charges)/i.test(lib)) continue;
    if (!code && ((pend && lib === pend.name) || (!pend && buf.length))) {
      const o = { name: lib, monthly: pend ? pend.monthly : {}, lines: buf, sal: socNum(r[si]), pat: socNum(r[pi]) };
      orgs.push(o);
      last = o;
      buf = [];
      pend = null;
      continue;
    }
    if (!code) continue;
    buf.push({ code, lib, sal: socNum(r[si]), pat: socNum(r[pi]) });
  }
  return socOrgFinish(orgs);
}
// Organismes : clé, nom affiché (référence en cas d'homonymes), contributions formation et apprentissage, prélèvement à la source
function socOrgFinish(orgs) {
  const names = {};
  orgs.forEach((o) => { names[o.name] = (names[o.name] || 0) + 1; });
  orgs.forEach((o, i) => {
    o.key = `o${i}`;
    o.label = o.name + (names[o.name] > 1 && o.ref ? ` (${o.ref})` : '');
    o.tcLines = o.lines.filter((l) => /^TC/i.test(l.code) || /apprentissage|formation prof|constructys|ccca|apnab/i.test(l.lib));
    o.tc = socR2(o.tcLines.reduce((a, l) => a + l.pat + l.sal, 0));
    o.tcPat = socR2(o.tcLines.reduce((a, l) => a + l.pat, 0));
    o.isPAS = Math.abs(o.pat) < 0.005 && /source|PAS|DGFIP/i.test(`${o.name} ${o.lines.map((l) => l.lib).join(' ')}`);
  });
  return orgs;
}

// ---------- Éditions PDF SILAE (et solde de repos en tableur) ----------
// Lignes au format de js/silae-pdf.js : { lab, group, amounts: [{ v, col }] }. Montant retenu pour le brut et le net
// (journal de paie), l'indemnité et les charges de congés payés (solde de repos) : reconnu d'après les intitulés, ou ligne
// choisie à la main, retenue pour le cabinet (data.settings.silaeMap, repère comparable d'une édition à l'autre).
const SOC_PDF_ZONE = { journal: 'recap', cotis: 'cot', repos: 'repos' };
const SOC_LINE = { brut: 'Salaire brut', net: 'Net à payer', cp: 'Indemnité de congés payés', cpch: 'Charges sur congés payés' };
const socLineZone = (id) => (id === 'brut' || id === 'net' ? 'recap' : 'repos');
const socLineMemo = (row, a) => ({ lab: SilaePdf.key(row.lab), group: SilaePdf.key(row.group), col: SilaePdf.key(a.col) });
function socLineFind(rows, m) {
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    if (SilaePdf.key(row.lab) !== m.lab || (m.group !== undefined && SilaePdf.key(row.group) !== m.group)) continue;
    const ai = row.amounts.findIndex((a) => SilaePdf.key(a.col) === m.col);
    if (ai >= 0) return { row: ri, amount: ai };
  }
  return null;
}
function socLinePick(P, ids) {
  const memo = data.settings.silaeMap || {};
  ids.forEach((id) => {
    const p = (memo[id] && socLineFind(P.rows, memo[id])) || SilaePdf.pick(P.rows, id);
    P.sel[id] = p ? { row: p.row, amount: p.amount } : null;
  });
}
// Montant retenu : { v, row, a } ou null
function socLine(st, id) {
  const P = st.pdf[socLineZone(id)], sel = P && P.sel[id];
  if (!sel) return null;
  const row = P.rows[sel.row], a = row && row.amounts[sel.amount];
  return a ? { v: a.v, row, a } : null;
}
const socLineTxt = (row, a) => `${[row.group, row.lab || '(sans libellé)'].filter(Boolean).join(' · ')}${a.col ? ` · ${a.col}` : ''}`;
async function socReadPdf(file) {
  const d = SilaePdf.parse(await PdfReader.read(await file.arrayBuffer()), PdfReader);
  if (!d.rows.length) throw new Error('aucun montant lu (PDF scanné, sans texte ?)');
  return d;
}
// Détail des cotisations en PDF : un organisme par groupe (intitulé seul au-dessus de ses lignes), ses totaux sur la ligne
// « Total <organisme> » (à défaut, somme de ses lignes) ; colonnes salariale et patronale d'après leur intitulé.
function socCotFromPdf(rows) {
  const SAL = /salari/, PAT = /patron|employeur/;
  if (!rows.some((r) => r.amounts.some((a) => PAT.test(SilaePdf.key(a.col))))) throw new Error('Détail des cotisations : colonne « Part patronale » introuvable');
  const col = (r, re) => { const a = r.amounts.find((x) => re.test(SilaePdf.key(x.col))); return a ? a.v : 0; };
  const G = new Map();
  rows.forEach((r) => {
    const k = SilaePdf.key(r.lab);
    if (/^total (general|des cotisations|employeur|salari|charges)/.test(k)) return;
    if (!G.has(r.group || '')) G.set(r.group || '', { lines: [], tot: null });
    const g = G.get(r.group || '');
    if (/^total\b/.test(k)) g.tot = r;
    else g.lines.push({ code: '', lib: r.lab, sal: col(r, SAL), pat: col(r, PAT) });
  });
  const orgs = [];
  G.forEach((g, name) => {
    if (!g.lines.length && !g.tot) return;
    orgs.push({ name: name || 'Cotisations', monthly: {}, lines: g.lines,
      sal: g.tot ? col(g.tot, SAL) : socSum(g.lines.map((l) => l.sal)), pat: g.tot ? col(g.tot, PAT) : socSum(g.lines.map((l) => l.pat)) });
  });
  if (!orgs.length) throw new Error('Détail des cotisations : aucun organisme lu');
  return socOrgFinish(orgs);
}
// Tableur (solde de repos) → lignes : intitulé de chaque colonne chiffrée lu dans la dernière ligne de textes au-dessus,
// groupe = ligne d'un seul texte
function socSheetLines(rows) {
  const isNum = (t) => /^-?\d{1,3}(?:[\s\u00a0\u202f.]\d{3})*(?:,\d+)?$|^-?\d+(?:[.,]\d+)?$/.test(t);
  const out = [];
  let head = [], group = '';
  rows.forEach((r) => {
    const c = (r || []).map(socTxt);
    const nums = c.map((t, i) => (t && isNum(t) ? i : -1)).filter((i) => i >= 0), texts = c.filter((t) => t && !isNum(t));
    if (!nums.length) {
      if (texts.length >= 2) head = c;
      else if (texts.length === 1 && head.length) group = texts[0];
      return;
    }
    const lab = c.slice(0, nums[0]).filter(Boolean).join(' ');
    out.push({ page: 1, lab, group, amounts: nums.map((i) => ({ v: socR2(socNum(c[i])), col: head[i] || '' })) });
  });
  return out;
}

// Date d'une écriture : AAAA-MM-JJ (lecteur de classeurs), numéro de série Excel ou JJ/MM/AA(AA)
function socDate(v) {
  const t = socTxt(v);
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], m[2] - 1, +m[3], 12));
  if (/^\d{5}(\.\d+)?$/.test(t)) return new Date(Math.round((Number(t) - 25569) * 864e5) + 12 * 3600e3);
  m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return new Date(Date.UTC(y, m[2] - 1, +m[1], 12)); }
  return null;
}
const socMk = (d) => (d ? `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` : '');
function socParseGl(rows) {
  const hi = rows.findIndex((r) => r && r.some((c) => /compte/i.test(socTxt(c))) && r.some((c) => /d[ée]bit/i.test(socTxt(c))));
  if (hi < 0) throw new Error('Grand livre : en-têtes introuvables');
  const h = rows[hi].map(socTxt);
  const idx = (re) => h.findIndex((c) => re.test(c));
  const ai = idx(/compte/i), exact = h.findIndex((c) => /^date$/i.test(c)), di = exact >= 0 ? exact : idx(/^date(?!.*éch)/i);
  const ji = idx(/journal/i), ti = idx(/^let/i), de = idx(/d[ée]bit/i), cr = idx(/cr[ée]dit/i);
  const out = [];
  let lastAcc = '', lastLib = '';
  for (let k = hi + 1; k < rows.length; k++) {
    const r = rows[k] || [];
    const cell = socTxt(r[ai]);
    if (/\b(sous-)?total\b/i.test(r.map(socTxt).join(' '))) continue;
    const m = cell.replace(/\s/g, '').match(/^(\d{3,})/) || cell.match(/(\d{4,})/);
    if (m) { lastAcc = m[1]; lastLib = cell.replace(/^[\d\s]+[-–:]?\s*/, '').trim(); }
    const dv = socNum(r[de]), cv = socNum(r[cr]);
    if (!lastAcc || (Math.abs(dv) < 0.005 && Math.abs(cv) < 0.005)) continue;
    const d = socDate(r[di]);
    out.push({ acc: lastAcc, lib: lastLib, date: d, mk: socMk(d), jnl: ji >= 0 ? socTxt(r[ji]).toUpperCase() : '', let: ti >= 0 ? socTxt(r[ti]) : '', d: dv, c: cv });
  }
  return out;
}

// FEC (texte) : seules les lignes des classes 42, 43, 44, 63 et 64 sont retenues, avec leur écriture (journal + numéro)
function socParseFec(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) throw new Error('fichier vide');
  const h0 = lines[0];
  const sep = h0.includes('\t') ? '\t' : h0.includes('|') ? '|' : ';';
  const clean = (x) => (x || '').trim().replace(/^"|"$/g, '');
  const H = h0.split(sep).map((x) => clean(x).toLowerCase());
  const ix = (n) => H.indexOf(n);
  const iJ = ix('journalcode'), iN = ix('ecriturenum'), iD = ix('ecrituredate'), iC = ix('comptenum'), iCL = ix('comptelib'), iDe = ix('debit'), iCr = ix('credit'), iL = ix('ecriturelet'), iM = ix('montant'), iS = ix('sens');
  if (iC < 0 || iJ < 0) throw new Error('en-têtes FEC introuvables (JournalCode, CompteNum)');
  const out = [];
  for (let k = 1; k < lines.length; k++) {
    const c = lines[k].split(sep).map(clean);
    const acc = (c[iC] || '').replace(/\s/g, '');
    if (!/^(4[234]|6[34])/.test(acc)) continue;
    let d = iDe >= 0 ? socNum(c[iDe]) : 0, cr = iCr >= 0 ? socNum(c[iCr]) : 0;
    if (iDe < 0 && iM >= 0) { const m = socNum(c[iM]); if (/^(c|-)/i.test(c[iS] || '')) { cr = m; d = 0; } else { d = m; cr = 0; } }
    const ds = (c[iD] || '').replace(/\D/g, '');
    const dt = ds.length === 8 ? new Date(Date.UTC(+ds.slice(0, 4), +ds.slice(4, 6) - 1, +ds.slice(6, 8), 12)) : socDate(c[iD]);
    const jnl = (c[iJ] || '').toUpperCase();
    out.push({ acc, lib: iCL >= 0 ? c[iCL] || '' : '', date: dt, mk: socMk(dt), jnl, ecr: `${jnl}|${c[iN] || k}`, let: iL >= 0 ? c[iL] || '' : '', d, c: cr });
  }
  return out;
}

async function socLoad(list, zone) {
  const st = socState();
  if (!list.length) return;
  if (zone !== 'gl') { st.files = st.files.filter((x) => x.zone !== zone); st.parsed[zone] = null; delete st.pdf[zone]; }
  const N = { recap: 'un récapitulatif ou un journal de paie', cot: 'un détail des cotisations', gl: 'un grand livre', repos: 'un solde de repos' };
  for (const file of list) {
    try {
      if (/\.pdf$/i.test(file.name) || /pdf/.test(file.type || '')) {
        if (zone === 'gl') throw new Error('déposez ici le FEC (fichier texte) ou un grand livre Excel');
        const d = await socReadPdf(file);
        if (d.kind && SOC_PDF_ZONE[d.kind] !== zone) throw new Error(`ce fichier ressemble à ${N[SOC_PDF_ZONE[d.kind]]}, déposez-le dans la bonne case`);
        let info;
        if (zone === 'cot') {
          st.parsed.cot = socCotFromPdf(d.rows);
          info = `PDF : ${st.parsed.cot.length} organisme(s), part patronale ${socF(st.parsed.cot.reduce((x, o) => x + o.pat, 0))} €`;
        } else {
          const P = (st.pdf[zone] = { rows: d.rows, sel: {} }), ids = zone === 'recap' ? ['brut', 'net'] : ['cp', 'cpch'];
          socLinePick(P, ids);
          if (zone === 'recap') st.parsed.recap = { periods: [''], brut: [], net: [], indem: null, report: 0, patTot: 0, extras: [], pdf: true };
          else st.parsed.repos = true;
          info = `PDF : ${ids.map((id) => { const l = socLine(st, id); return `${SOC_LINE[id].toLowerCase()} ${l ? `${socF(l.v)} €` : 'à choisir'}`; }).join(', ')}`;
        }
        st.files.push({ name: file.name, zone, info });
        continue;
      }
      if (zone === 'gl' && !/\.xls/i.test(file.name)) {
        const t = socDecode(new Uint8Array(await file.arrayBuffer()));
        if (/journalcode/i.test(t.slice(0, 1000))) {
          // Un FEC est complet : il remplace ce qui était déposé dans la case (et le FEC de l'analyse : rattachement refait)
          const gl = socParseFec(t);
          st.parsed.gl = gl;
          st.glFec = true;
          st.files = st.files.filter((x) => x.zone !== 'gl');
          st.fecOf = null;
          st.link = null;
          st.files.push({ name: file.name, zone, info: `FEC : ${gl.length} lignes retenues (classes 42, 43, 44, 63, 64) – comptes : ${[...new Set(gl.map((x) => socShort(x.acc)))].sort().join(', ')}` });
          socLinkFile(st, file.name);
          continue;
        }
      }
      const rows = await socReadRows(file);
      const k = socKindOf(rows);
      if (k && k !== zone) throw new Error(`ce fichier ressemble à ${N[k]}, déposez-le dans la bonne case`);
      let info = '';
      if (zone === 'recap') st.parsed.recap = socParseRecap(rows);
      else if (zone === 'cot') st.parsed.cot = socParseCot(rows);
      else if (zone === 'repos') {
        const P = (st.pdf.repos = { rows: socSheetLines(rows), sel: {} });
        if (!P.rows.length) throw new Error('aucun montant lu');
        socLinePick(P, ['cp', 'cpch']);
        st.parsed.repos = true;
      } else {
        const gl = socParseGl(rows);
        // Grands livres : ils s'ajoutent entre eux, mais remplacent un FEC
        if (st.glFec) { st.parsed.gl = []; st.files = st.files.filter((x) => x.zone !== 'gl'); st.glFec = false; st.fecOf = null; st.link = null; }
        st.parsed.gl.push(...gl);
        info = `${gl.length} lignes lues – comptes : ${[...new Set(gl.map((x) => socShort(x.acc)))].sort().join(', ') || 'aucun'}`;
      }
      st.files.push({ name: file.name, zone, info });
    } catch (e) {
      st.files.push({ name: file.name, zone, err: e.message || String(e) });
    }
  }
  if (st.parsed.recap && !st.dClo) {
    const p = st.parsed.recap.periods.filter(Boolean).slice(-1)[0];
    if (p) { const [m, y] = p.split('/').map(Number); st.dClo = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); }
  }
  socRun();
  if (location.hash.startsWith('#/social')) refresh();
}
function socDrop(files, zone) {
  if (zone) socLoad(files, zone);
  else toast('Déposez chaque fichier dans sa case : récapitulatif ou journal de paie, détail des cotisations, FEC, solde de repos.', true);
}

// ---------- Dossier ----------
// Feuille de l'exercice où le cadrage est enregistré : celle du dossier (chiffrée), ou celle de l'analyse en mémoire.
function socSheet(st, create) {
  const c = st.link && clientById(st.link.clientId);
  if (c) {
    const k = st.link.closing;
    if (!create) return c.revision && c.revision[k] && c.revision[k].social ? c.revision[k] : null;
    c.revision = c.revision || {};
    return (c.revision[k] = c.revision[k] || { items: {}, cycles: {}, fileName: st.link.fileName || '' });
  }
  const f = st.fecOf;
  if (!f || ui.fec !== f) return null;
  if (!create) return f.wp && f.wp.social ? f.wp : null;
  return (f.wp = f.wp || { items: {}, cycles: {} });
}
// Rattachement : les choix enregistrés (organismes, comptes 641, motifs, reclassements) sont repris s'il n'y en a pas encore.
function socLink(st, clientId, closing, fileName) {
  st.link = { clientId, closing, fileName: fileName || '' };
  const ws = socSheet(st, false);
  if (!ws || st.RECL.length || [st.MAP, st.SAL, st.MAN, st.RM].some((o) => Object.keys(o).length)) return;
  const sv = JSON.parse(JSON.stringify(ws.social));
  ['MAP', 'SAL', 'MAN', 'RM'].forEach((k) => { st[k] = sv[k] || {}; });
  st.RECL = sv.RECL || [];
}
// FEC déposé : dossier retrouvé par le SIREN du nom du fichier (SIRENFECAAAAMMJJ), clôture d'après la date
function socLinkFile(st, name) {
  const m = /^(\d{9})FEC(\d{4})(\d{2})(\d{2})/i.exec(name || '');
  if (!m) return;
  const iso = `${m[2]}-${m[3]}-${m[4]}`;
  if (!st.dClo) st.dClo = iso;
  const c = clientBySiren(m[1]);
  if (c && !st.link) socLink(st, c.id, iso, name);
}
function socSave(st) {
  const ws = st.last && socSheet(st, true);
  if (!ws) return;
  const cards = st.last.cards;
  ws.social = JSON.parse(JSON.stringify({ at: nowIso(), MAP: st.MAP, SAL: st.SAL, MAN: st.MAN, RM: st.RM, RECL: st.RECL,
    docs: { journal: !!st.parsed.recap, cotis: !!st.parsed.cot, repos: !!st.parsed.repos },
    sum: cards.map((cd) => ({ key: cd.key, sec: cd.sec, title: cd.title, name: cd.name || cd.sub, s: cd.s, c: cd.c, e: cd.s == null ? null : cd.e, st: cd.s == null ? '' : cd.st, note: socNote(st, cd) })) }));
  // Congés payés : le montant du solde de repos remplit la colonne « Selon pièce » du compte (un seul 4282 ou 4382)
  cards.filter((cd) => cd.sec === 'cp' && cd.s != null && (cd.accs || []).length === 1).forEach((cd) => { (ws.soldes = ws.soldes || {})[cd.accs[0]] = cd.s; });
  if (st.link && clientById(st.link.clientId)) persist();
}
// Depuis le cycle H de l'analyse : le FEC analysé est repris (pas de nouveau dépôt), le cadrage rattaché à son exercice.
async function socFromFec() {
  const f = ui.fec, r = f && f.result;
  if (!r) return;
  const closing = r.meta.closing || r.meta.fileName;
  let st = ui.social;
  if (!(st && st.fecOf === f)) {
    ui.social = null;
    st = socState();
    st.fecOf = f;
    st.dClo = r.meta.closing || '';
    socLink(st, f.clientId || '', closing, r.meta.fileName);
    if (f.file) {
      try {
        const src = await fecSource(f.file);
        const gl = socParseFec(socDecode(new Uint8Array(src.buffer)));
        st.parsed.gl = gl;
        st.glFec = true;
        st.files.push({ name: src.name, zone: 'gl', info: `FEC de l'analyse : ${gl.length} lignes retenues (classes 42, 43, 44, 63, 64)` });
      } catch (e) {
        st.files.push({ name: f.fileName || r.meta.fileName, zone: 'gl', err: e.message || String(e) });
      }
    }
    socRun();
  }
  location.hash = '#/social';
}

// ---------- Calcul ----------
function socAggregate(rows) {
  const A = {};
  rows.forEach((r) => {
    const a = A[r.acc] || (A[r.acc] = { acc: r.acc, short: socShort(r.acc), lib: '', rows: [], D: 0, C: 0 });
    if (!a.lib && r.lib) a.lib = r.lib;
    a.rows.push(r);
    a.D += r.d;
    a.C += r.c;
  });
  Object.values(A).forEach((a) => { a.D = socR2(a.D); a.C = socR2(a.C); a.solde = socR2(a.D - a.C); });
  return A;
}
// Journal de paie : celui qui crédite le plus souvent le 421 (à défaut, qui mouvemente le 645), hors banque et à-nouveaux
function socPaieJournal(rows) {
  const cnt = {};
  const pick = rows.filter((r) => /^421/.test(r.acc) && r.c > 0);
  (pick.length ? pick : rows.filter((r) => /^645/.test(r.acc))).forEach((r) => { if (/^AN$|^BQ|^BAN/.test(r.jnl)) return; cnt[r.jnl] = (cnt[r.jnl] || 0) + 1; });
  const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : 'PA';
}
function socPaieJournals(rows, pj) {
  const s = new Set();
  rows.forEach((r) => { if ((/^645/.test(r.acc) || (/^421/.test(r.acc) && r.c > 0)) && !/^AN$|^BQ|^BAN/.test(r.jnl)) s.add(r.jnl); });
  if (!s.size) s.add(pj);
  return s;
}
const socSubsets = (arr, max) => {
  const out = [];
  const rec = (st, cur) => { if (cur.length) out.push(cur.slice()); if (cur.length === max) return; for (let i = st; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); } };
  rec(0, []);
  return out;
};
// Rattachement automatique comptes ↔ organismes (1 à 3 par compte) : au plus près à 2 %, puis à 10 %, puis le plus proche
function socAutoMap(accs, orgs, variants) {
  const used = new Set(), res = {};
  const pass = (list, ok) => list.sort((a, b) => Math.abs(b.amt) - Math.abs(a.amt)).forEach((a) => {
    let best = null;
    socSubsets(orgs.filter((o) => !used.has(o.key)), 3).forEach((sub) => variants.forEach((fn) => {
      const v = sub.reduce((x, o) => x + fn(o), 0);
      const d = Math.abs(a.amt - v);
      if (!best || d < best.d - 0.001 || (Math.abs(d - best.d) < 0.001 && sub.length < best.sub.length)) best = { sub, d };
    }));
    if (best && ok(best.d, a)) { res[a.key] = best.sub.map((o) => o.key); best.sub.forEach((o) => used.add(o.key)); }
  });
  pass([...accs], (d, a) => d <= Math.max(1, Math.abs(a.amt) * 0.02));
  pass(accs.filter((a) => !res[a.key]), (d, a) => d <= Math.abs(a.amt) * 0.1);
  accs.filter((a) => !res[a.key]).forEach((a) => {
    let best = null;
    orgs.filter((o) => !used.has(o.key)).forEach((o) => { const rel = Math.abs(a.amt - variants[0](o)) / Math.max(1, Math.abs(a.amt)); if (!best || rel < best.rel) best = { o, rel }; });
    if (best && best.rel < 0.6) { res[a.key] = [best.o.key]; used.add(best.o.key); } else res[a.key] = [];
  });
  return res;
}
// Pistes : un montant de la paie (ou la somme de deux) égal à l'écart restant
function socFindSug(r, cands) {
  const out = [];
  if (Math.abs(r) <= SOC_TOL) return out;
  cands.forEach((c) => { if (Math.abs(Math.abs(c.amt) - Math.abs(r)) <= SOC_TOL) out.push({ lib: c.lib, amt: r }); });
  if (out.length < 2) {
    for (let i = 0; i < cands.length && out.length < 3; i++) {
      for (let j = i + 1; j < cands.length && out.length < 3; j++) if (Math.abs(cands[i].amt + cands[j].amt - r) <= SOC_TOL) out.push({ lib: `${cands[i].lib} et ${cands[j].lib}`, amt: r });
    }
  }
  return out.slice(0, 3);
}

function socCompute(st) {
  const R = st.parsed.recap, O = st.parsed.cot, G = st.parsed.gl;
  const { MAP, MAN, RM, SAL, RECL } = st;
  const A = socAggregate(G), PJ = socPaieJournal(G), PJS = socPaieJournals(G, PJ), per = R.periods;
  // Écritures de paie : dans un FEC, toute écriture qui mouvemente un 645 ou crédite le 421 (quel que soit le journal) ;
  // dans un grand livre, les journaux de paie
  const PE = new Set(G.filter((r) => r.ecr && (/^645/.test(r.acc) || (/^421/.test(r.acc) && r.c > 0)) && !/^R?AN$|^BQ|^BAN/.test(r.jnl)).map((r) => r.ecr));
  const isP = (r) => (r.ecr ? PE.has(r.ecr) : PJS.has(r.jnl));
  const cards = [], orgByKey = {};
  O.forEach((o) => { orgByKey[o.key] = o; });
  // Organismes rattachés à la main : retenus par leur nom (d'une édition à l'autre) ; nom disparu → rattachement automatique
  const keysOf = (acc, auto) => {
    const L = MAP[acc];
    if (!L) return auto[acc] || [];
    const ks = L.map((l) => (O.find((o) => o.label === l) || {}).key).filter(Boolean);
    return ks.length || !L.length ? ks : auto[acc] || [];
  };
  // Congés payés : charge (6412, ou 641 / 645 dont le libellé cite les congés) et dettes 4282 / 4382
  const CPRE = /cong|\bcp\b/i;
  const cpCharge = (a) => (a.lib ? CPRE.test(a.lib) : /^6412/.test(a.acc));
  const cpDebt = (a) => /^4[23]82/.test(a.acc) || (/^4[23]8/.test(a.acc) && CPRE.test(a.lib));
  const flows = (a) => socR2(a.rows.filter((r) => isP(r)).reduce((x, r) => x + r.c - r.d, 0));
  const month = (a) => { const m = {}; a.rows.forEach((r) => { m[r.mk] = (m[r.mk] || 0) + r.d - r.c; }); return m; };
  const monthPJ = (a) => { const m = {}; a.rows.filter((r) => isP(r)).forEach((r) => { m[r.mk] = (m[r.mk] || 0) + r.c - r.d; }); return m; };

  // 641
  const a641 = Object.values(A).filter((a) => /^641/.test(a.acc));
  a641.forEach((a) => { a.sal = SAL[a.acc] === undefined ? a.rows.some((r) => isP(r)) && !cpCharge(a) : SAL[a.acc]; });
  const g1 = a641.filter((a) => a.sal && !/^6414/.test(a.acc)), g2 = a641.filter((a) => a.sal && /^6414/.test(a.acc));
  if (g1.length || R.brut.length) {
    const c = socR2(g1.reduce((x, a) => x + a.solde, 0));
    const mm = {};
    g1.forEach((a) => { const m = month(a); Object.keys(m).forEach((k) => { mm[k] = (mm[k] || 0) + m[k]; }); });
    cards.push({ sec: '641', key: '641', title: '641', sub: 'Rémunérations (brut)', s: socSum(R.brut), c, solde: c, kind: 'charge', line: R.pdf ? 'brut' : '',
      comp: g1.map((a) => `${a.short} : ${socF(a.solde)} €`).join(' ; '),
      monthly: per.map((p, i) => ({ p, s: R.brut[i] || 0, c: socR2(mm[p] || 0) })),
      cands: [...per.map((p, i) => ({ lib: `brut de ${p}`, amt: R.brut[i] || 0 })), ...R.extras] });
  }
  g2.forEach((a) => {
    const tva = O.flatMap((o) => o.lines.filter((l) => /TVA/i.test(l.lib)).map((l) => ({ lib: l.lib, amt: -l.pat })));
    cards.push({ sec: '641', key: a.acc, title: a.short, sub: 'Indemnités hors brut', name: a.lib, s: R.indem ? socSum(R.indem) : 0, c: a.solde, solde: a.solde, kind: 'charge', cands: [...R.extras, ...tva] });
  });

  // 645
  const a645 = Object.values(A).filter((a) => /^645/.test(a.acc) && !cpCharge(a));
  const o645 = O.filter((o) => !o.isPAS && Math.abs(o.pat) > 0.005);
  const auto645 = socAutoMap(a645.map((a) => ({ key: a.acc, amt: a.solde })), o645, [(o) => o.pat, (o) => o.pat - o.tcPat]);
  const mapped = new Set([...Object.keys(MAP).flatMap((acc) => keysOf(acc, {})), ...Object.values(auto645).flat()]);
  a645.forEach((a) => {
    const keys = keysOf(a.acc, auto645);
    const os = keys.map((k) => orgByKey[k]).filter(Boolean);
    const s = socR2(os.reduce((x, o) => x + o.pat, 0)), tc = socR2(os.reduce((x, o) => x + o.tcPat, 0));
    const mpj = month(a);
    const auto = [];
    if (tc > 0.005 && Math.abs(s - a.solde - tc) < Math.abs(s - a.solde)) {
      auto.push({ id: 'tc', lib: `taxe d’apprentissage et contributions formation comptabilisées en classe 63${os.some((o) => o.tcLines.some((l) => /TVA/i.test(l.lib))) ? ' et TVA en 44566' : ''} (${[...new Set(os.flatMap((o) => o.tcLines.map((l) => l.lib)))].join(', ')})`, amt: tc });
    }
    cards.push({ sec: '645', key: a.acc, title: a.short, name: a.lib, sub: os.map((o) => o.label).join(' + ') || 'Aucun organisme rattaché', s, c: a.solde, solde: a.solde, kind: 'charge', orgs: o645, sel: keys, auto,
      monthly: per.map((p) => ({ p, s: socR2(os.reduce((x, o) => x + ((o.monthly[p] || {}).pat || 0), 0)), c: socR2(mpj[p] || 0) })),
      cands: [...os.flatMap((o) => Object.entries(o.monthly).map(([p, v]) => ({ lib: `${o.label} ${p}`, amt: v.pat }))),
        ...os.flatMap((o) => o.lines.filter((l) => Math.abs(l.pat) > 0.005).map((l) => ({ lib: socLL(l), amt: l.pat }))),
        ...o645.filter((o) => !mapped.has(o.key)).map((o) => ({ lib: `organisme non rattaché ${o.label}`, amt: o.pat }))] });
  });

  // 63 liés à la paie
  const tcItems = [];
  O.forEach((o) => o.tcLines.forEach((l, i) => {
    if (/TVA/i.test(l.lib)) return;
    const amt = socR2(l.pat + l.sal);
    if (Math.abs(amt) >= 0.005) tcItems.push({ key: `${o.key}t${i}`, org: o.key, label: `${socLL(l)} (${o.label})`, amt });
  }));
  const tvaAmt = socR2(O.reduce((x, o) => x + o.tcLines.filter((l) => /TVA/i.test(l.lib)).reduce((y, l) => y + l.pat + l.sal, 0), 0));
  const debit = (a) => socR2(a.rows.filter((r) => isP(r)).reduce((x, r) => x + r.d - r.c, 0));
  const a63 = Object.values(A).filter((a) => (/^63(12|33|35)/.test(a.acc) ? a.rows.length > 0 : /^63/.test(a.acc) && Math.abs(debit(a)) > 0.005));
  if (tcItems.length || a63.length) {
    const bucket = (t) => (/libératoire/i.test(t.label) ? '6335' : /apprentissage/i.test(t.label) && !/ccca/i.test(t.label) ? '6312' : '6333');
    const B = { 6312: "Taxe d’apprentissage", 6333: 'Formation professionnelle continue', 6335: "Versements libératoires de taxe d’apprentissage" };
    const used63 = new Set();
    const tvaAcc = Object.values(A).filter((a) => /^4456/.test(a.acc) && Math.abs(debit(a) - tvaAmt) <= SOC_TOL);
    const tvaTxt = tvaAmt > 0.005 ? `TVA sur contributions : ${socF(tvaAmt)} €${tvaAcc.length ? ` retrouvée en ${tvaAcc.map((a) => a.short).join(', ')}` : ' (non retrouvée en 4456)'}` : '';
    Object.keys(B).forEach((code) => {
      const its = tcItems.filter((t) => bucket(t) === code), accs = a63.filter((a) => a.short.startsWith(code));
      accs.forEach((a) => used63.add(a.acc));
      const s = socR2(its.reduce((x, t) => x + t.amt, 0)), c = socR2(accs.reduce((x, a) => x + a.solde, 0));
      const comp = [accs.length > 1 ? accs.map((a) => `${a.short} : ${socF(a.solde)} €`).join(' ; ') : '', code === '6333' ? tvaTxt : ''].filter(Boolean).join(' – ');
      // Sans compte 63 : contribution comprise dans un 645 dont l'organisme est rapproché sans écart → motif automatique
      const auto = [];
      if (!accs.length) {
        const by = new Map();
        its.forEach((t) => {
          const c6 = cards.find((x) => x.sec === '645' && x.sel.includes(t.org) && Math.abs(x.s - x.c) <= SOC_TOL);
          if (c6) by.set(c6, socR2((by.get(c6) || 0) + t.amt));
        });
        by.forEach((amt, c6) => auto.push({ id: `in${c6.key}`, lib: `comptabilisée en ${c6.title} avec les cotisations ${c6.sub} (à reclasser en ${code})`, amt }));
      }
      cards.push({ sec: '63', key: `63-${code}`, title: code, name: B[code], sub: B[code] + (its.length ? ` : ${its.map((t) => t.label).join(' + ')}` : ''), comp, accs: accs.map((a) => a.acc), s, c, solde: c, kind: 'charge', auto, cands: tcItems.map((t) => ({ lib: t.label, amt: t.amt })) });
    });
    a63.filter((a) => !used63.has(a.acc)).forEach((a) => {
      const c = debit(a);
      cards.push({ sec: '63', key: a.acc, title: a.short, name: a.lib, sub: 'Compte 63 hors 6312, 6333 et 6335', s: 0, c, solde: c, kind: 'charge', auto: [], cands: tcItems.map((t) => ({ lib: t.label, amt: t.amt })) });
    });
  }

  // 42 / 43 (et 442, 447)
  const a4 = Object.values(A).filter((a) => (/^4(2|3)/.test(a.acc) || /^44(2|7)/.test(a.acc)) && !cpDebt(a));
  const o43 = O.filter((o) => !o.isPAS), oPAS = O.filter((o) => o.isPAS);
  const map43 = a4.filter((a) => /^43/.test(a.acc) && Math.abs(flows(a)) > 0.005), map44 = a4.filter((a) => /^44/.test(a.acc) && Math.abs(flows(a)) > 0.005);
  const auto43 = Object.assign(socAutoMap(map43.map((a) => ({ key: a.acc, amt: flows(a) })), o43, [(o) => o.sal + o.pat, (o) => o.sal + o.pat - o.tc]),
    socAutoMap(map44.map((a) => ({ key: a.acc, amt: flows(a) })), oPAS, [(o) => o.sal + o.pat]));
  a4.sort((x, y) => x.acc.localeCompare(y.acc)).forEach((a) => {
    const fl = flows(a), solde = socR2(a.C - a.D);
    const unl = a.rows.filter((r) => !r.let);
    const anUnl = socR2(unl.filter((r) => /^R?AN$/.test(r.jnl)).reduce((x, r) => x + r.c - r.d, 0));
    const unlM = {};
    unl.filter((r) => isP(r)).forEach((r) => { unlM[r.mk] = (unlM[r.mk] || 0) + r.c - r.d; });
    const lettre = a.rows.some((r) => r.let);
    const points = [];
    if (lettre && Math.abs(anUnl) > 0.005) points.push(`à-nouveau non lettré de ${socFa(anUnl)} €${anUnl < 0 ? ' (débiteur)' : ''}`);
    if (solde < -0.005) points.push(`solde débiteur de ${socFa(solde)} € sur un compte de dettes`);
    const open = !lettre ? [] : Object.entries(unlM).filter(([, v]) => Math.abs(v) > 0.005).map(([k]) => k);
    const base = { sec: '4', key: a.acc, title: a.short, name: a.lib, solde, kind: 'tiers', points, open };
    if (/^421/.test(a.acc)) {
      const mpj = monthPJ(a);
      cards.push({ ...base, sub: 'Net à payer', s: socSum(R.net), c: fl, line: R.pdf ? 'net' : '', monthly: per.map((p, i) => ({ p, s: R.net[i] || 0, c: socR2(mpj[p] || 0) })),
        cands: [{ lib: 'report des mois précédents', amt: -R.report }, ...per.map((p, i) => ({ lib: `net de ${p}`, amt: R.net[i] || 0 })), ...R.extras] });
    } else if (Math.abs(fl) > 0.005 && /^4(3|4)/.test(a.acc)) {
      const pool = /^44/.test(a.acc) ? oPAS : o43;
      const keys = keysOf(a.acc, auto43);
      const os = keys.map((k) => orgByKey[k]).filter(Boolean);
      const s = socR2(os.reduce((x, o) => x + o.sal + o.pat, 0)), tc = socR2(os.reduce((x, o) => x + o.tc, 0));
      const mpj = monthPJ(a);
      const auto = [];
      if (tc > 0.005 && Math.abs(s - fl - tc) < Math.abs(s - fl)) auto.push({ id: 'tc', lib: `contributions formation (${[...new Set(os.flatMap((o) => o.tcLines.map((l) => l.lib)))].join(', ')}) créditées hors de ce compte`, amt: tc });
      cards.push({ ...base, sub: os.map((o) => o.label).join(' + ') || 'Aucun organisme rattaché', s, c: fl, orgs: pool, sel: keys, auto,
        monthly: per.map((p) => ({ p, s: socR2(os.reduce((x, o) => x + (o.monthly[p] ? o.monthly[p].sal + o.monthly[p].pat : 0), 0)), c: socR2(mpj[p] || 0) })),
        cands: [...os.flatMap((o) => Object.entries(o.monthly).map(([p, v]) => ({ lib: `${o.label} ${p}`, amt: v.sal + v.pat }))), ...os.flatMap((o) => o.lines.map((l) => ({ lib: socLL(l), amt: l.sal + l.pat })))] });
    } else cards.push({ ...base, sub: "Hors paie (écritures d’OD ou de banque)", s: null, c: null });
  });

  // Congés payés : soldes de 4282 et 4382 à la clôture rapprochés de l'indemnité et des charges du solde de repos
  const cpAccs = Object.values(A).filter(cpDebt), cpCh = Object.values(A).filter((a) => /^64[15]/.test(a.acc) && cpCharge(a));
  [['cp', '4282', 'Congés payés à payer', /^428/, /^641/], ['cpch', '4382', 'Charges sociales sur congés payés', /^438/, /^645/]].forEach(([id, t, lab, re, reCh]) => {
    const L = cpAccs.filter((a) => re.test(a.acc)), ch = cpCh.filter((a) => reCh.test(a.acc));
    if (!L.length && !st.parsed.repos) return;
    const got = socLine(st, id), solde = socR2(L.reduce((x, a) => x + a.C - a.D, 0)), one = L.length === 1 ? L[0] : null;
    cards.push({ sec: 'cp', key: one ? one.acc : t, title: one ? one.short : t, name: lab, accs: L.map((a) => a.acc), line: id,
      sub: lab + (got ? ` – ${socLineTxt(got.row, got.a)}` : ''),
      comp: [L.length > 1 ? L.map((a) => `${a.short} : ${socF(a.C - a.D)} €`).join(' ; ') : '', ch.length ? `charge de l’exercice : ${ch.map((a) => `${a.short} ${socF(a.solde)} €`).join(' ; ')}` : ''].filter(Boolean).join(' – '),
      s: st.parsed.repos ? socR2(Math.abs(got ? got.v : 0)) : null, c: solde, solde, kind: 'tiers', points: [], open: [], auto: [], cands: [] });
  });

  // Recherche d'un montant dans les autres comptes (journal de paie) : total de l'exercice, montant mensuel, écriture
  const nPer = per.filter(Boolean).length || 12;
  const dfr = (d) => (d ? d.toISOString().slice(0, 10).split('-').reverse().join('/') : '');
  const locate = (cd, r, side) => {
    const target = Math.abs(r);
    if (target <= SOC_TOL) return [];
    const out = [], pref = side > 0 ? /^4(3|4)/ : /^6(3|4)/;
    Object.values(A).forEach((a) => {
      if (a.acc === cd.key || (cd.key.startsWith('63-') && a.short.startsWith(cd.key.slice(3)))) return;
      const rows = a.rows.filter((x) => isP(x));
      if (!rows.length) return;
      const val = (x) => (side > 0 ? x.c - x.d : x.d - x.c);
      const p = pref.test(a.acc) ? 0.5 : 0;
      const tot = socR2(rows.reduce((s, x) => s + val(x), 0));
      if (Math.abs(tot - target) <= SOC_TOL) out.push({ lib: `montant retrouvé en ${a.short} (${socF(tot)} € sur l’exercice)`, amt: r, acc: a.short, full: a.acc, score: 3 + p });
      const k = socR2(target / nPer);
      if (k > 0.005 && Math.abs(tot - target) > SOC_TOL) {
        const ms = new Set(rows.filter((x) => Math.abs(val(x) - k) <= 0.02).map((x) => x.mk));
        if (ms.size >= Math.max(2, nPer - 1)) out.push({ lib: `${socF(k)} € par mois sur ${ms.size} mois en ${a.short}`, amt: r, acc: a.short, full: a.acc, score: 2 + p });
      }
      rows.forEach((x) => { if (Math.abs(val(x) - target) <= SOC_TOL) out.push({ lib: `écriture du ${dfr(x.date)} en ${a.short} (${socF(val(x))} €)`, amt: r, acc: a.short, full: a.acc, score: 1 + p }); });
    });
    const seen = new Set();
    return out.sort((a, b) => b.score - a.score).filter((o) => !seen.has(o.lib) && seen.add(o.lib)).slice(0, 4);
  };

  // Motifs : automatiques (sauf retirés), saisis, reclassements ; puis déplacements proposés et pistes
  cards.forEach((cd) => {
    if (cd.s == null) return;
    cd.e = socR2(cd.s - cd.c);
    cd.mot = [...(cd.auto || []).filter((m) => !(RM[cd.key] || []).includes(m.id)), ...(MAN[cd.key] || []).map((m, i) => ({ ...m, id: `m${i}`, man: true }))];
  });
  const cardOf = (acc) => cards.find((c) => c.key === acc) || cards.find((c) => c.key.startsWith('63-') && (c.accs || []).includes(acc))
    || cards.find((c) => c.key.startsWith('63-') && /^\d/.test(acc) && socShort(acc).startsWith(c.key.slice(3)));
  RECL.forEach((rc, i) => {
    const to = cards.find((c) => c.key === rc.to);
    if (!to || to.s == null) return;
    const fr = cardOf(rc.from);
    to.mot.push({ id: `r${i}`, rec: i, lib: rc.amt > 0 ? `reclassement à passer depuis ${rc.fromShort}` : `reclassement à passer vers ${rc.fromShort}`, amt: rc.amt });
    if (fr && fr.s != null && fr !== to) fr.mot.push({ id: `r${i}`, rec: i, lib: rc.amt > 0 ? `reclassement à passer vers ${to.title}` : `reclassement à passer depuis ${to.title}`, amt: -rc.amt });
  });
  cards.forEach((cd) => { if (cd.s == null) return; cd.res = socR2(cd.e - cd.mot.reduce((x, m) => x + m.amt, 0)); cd.moves = []; });
  cards.forEach((cd) => {
    if (cd.s == null || !cd.mot) return;
    const side = cd.sec === '4' ? 1 : -1;
    cd.mot.forEach((m) => {
      if (m.id !== 'tc') return;
      const loc = locate(cd, m.amt, side).filter((o) => o.score >= 2);
      if (loc.length) m.lib += ` – retrouvé en ${[...new Set(loc.map((o) => o.acc))].join(', ')}`;
      else if (cd.sec === '645' && a63.length) m.lib += ` – voir ${a63.map((a) => a.short).join(', ')}`;
    });
  });
  const accOf = (c) => (c.key.startsWith('63-') ? (c.accs || [])[0] || c.key : c.key);
  ['645', '4', '63'].forEach((sec) => {
    const L = cards.filter((c) => c.sec === sec && c.s != null && Math.abs(c.res) > SOC_TOL);
    for (let i = 0; i < L.length; i++) {
      for (let j = i + 1; j < L.length; j++) {
        const a = L[i], b = L[j];
        if (Math.abs(a.res + b.res) > SOC_TOL) continue;
        a.moves.push({ lib: a.res > 0 ? `comptabilisé en ${b.title} au lieu de ${a.title}` : `comptabilisé en ${a.title} au lieu de ${b.title}`, amt: a.res, from: accOf(b), fromShort: b.title });
        b.moves.push({ lib: b.res > 0 ? `comptabilisé en ${a.title} au lieu de ${b.title}` : `comptabilisé en ${b.title} au lieu de ${a.title}`, amt: b.res, from: accOf(a), fromShort: a.title });
      }
    }
  });
  cards.forEach((cd) => {
    if (cd.s == null) return;
    const loc = Math.abs(cd.res) > SOC_TOL && cd.sec !== '641' && cd.sec !== 'cp' ? locate(cd, cd.res, cd.sec === '4' ? 1 : -1) : [];
    loc.forEach((o) => { if (o.full && o.score >= 2 && !cd.moves.some((m) => m.fromShort === o.acc)) cd.moves.push({ lib: o.lib, amt: cd.res, from: o.full, fromShort: o.acc }); });
    cd.sug = [...loc.filter((o) => !(o.full && o.score >= 2)), ...socFindSug(cd.res, cd.cands || [])].slice(0, 5);
    cd.st = Math.abs(cd.e) <= SOC_TOL ? 'ok' : Math.abs(cd.res) <= SOC_TOL ? 'just' : 'anom';
    if (cd.points && cd.points.length && cd.st === 'ok') cd.st = 'just';
  });
  return { cards, PJ, A, onlyPJ: G.every((r) => isP(r)) };
}
function socRun() {
  const st = socState();
  st.err = '';
  st.last = null;
  const R = st.parsed.recap;
  if (R && R.pdf) {
    const b = socLine(st, 'brut'), n = socLine(st, 'net');
    R.brut = b ? [b.v] : [];
    R.net = n ? [n.v] : [];
  }
  if (!(st.parsed.recap && st.parsed.cot && st.parsed.gl.length)) return;
  try { st.last = socCompute(st); } catch (e) { st.err = `Analyse impossible : ${e.message}`; console.error(e); }
  if (st.last) socSave(st);
}

// ---------- Notes ----------
const socDateFr = (st) => (st.dClo ? fmtDate(st.dClo) : '—');
function socNote(st, cd) {
  const D = socDateFr(st), SOFT = socSoft();
  if (cd.s == null) {
    let t = `${cd.title} – ${cd.sec === 'cp' ? 'Solde de repos non déposé' : 'Hors paie'} – Solde = ${socFa(cd.solde)} € au ${D}`;
    if (cd.points.length) t += `\nPoint : ${cd.points.join(' ; ')}`;
    return t;
  }
  const head = `${cd.title} – SILAE : ${socF(cd.s)} € / ${SOFT} : ${socF(cd.c)} €`;
  const solde = cd.kind === 'tiers' ? cd.solde : cd.c;
  const W = cd.kind === 'tiers' && cd.sec !== 'cp' && st.last && st.last.onlyPJ ? 'Montant comptabilisé' : 'Solde';
  let t;
  if (Math.abs(cd.e) <= SOC_TOL) t = `${head}\n0,00 € d’écart – ${W} = ${socF(Math.abs(solde))} € au ${D}`;
  else {
    t = `${head}\n${socFa(cd.e)} € d’écart – Motif : ${cd.mot.length ? cd.mot.map((x) => `${x.lib} (${socF(x.amt)} €)`).join(' ; ') : 'à justifier'}`;
    if (cd.mot.length) t += ` – Si on rajoute le motif = ${socF(cd.c + cd.mot.reduce((x, y) => x + y.amt, 0))} € au ${D}`;
    if (Math.abs(cd.res) > SOC_TOL && cd.mot.length) t += ` – Reste ${socF(cd.res)} € à justifier`;
    if (cd.kind === 'tiers') t += `\n${W} = ${socFa(solde)} € au ${D}`;
  }
  if (cd.kind === 'tiers' && cd.open && cd.open.length) t += ` (non réglé : ${cd.open.join(', ')})`;
  if (cd.points && cd.points.length) t += `\nPoint : ${cd.points.join(' ; ')}`;
  return t;
}
// Écritures de reclassement : le compte de charge reçoit au débit, le compte de tiers au crédit
function socOdRows(st) {
  if (!st.last) return [];
  const D = socDateFr(st);
  return st.RECL.map((rc) => {
    const to = st.last.cards.find((c) => c.key === rc.to);
    if (!to) return null;
    const bare = (k) => (k.startsWith('63-') ? k.slice(3) : k);
    const toAcc = bare(to.key.startsWith('63-') ? (to.accs || [])[0] || to.key : to.key), frAcc = bare(rc.from);
    const charge = to.sec !== '4';
    let deb = charge ? toAcc : frAcc, cre = charge ? frAcc : toAcc;
    if (rc.amt < 0) [deb, cre] = [cre, deb];
    return { d: D, deb: socShort(deb), cre: socShort(cre), m: Math.abs(rc.amt), l: rc.amt > 0 ? `Reclassement paie ${socShort(frAcc)} vers ${socShort(toAcc)}` : `Reclassement paie ${socShort(toAcc)} vers ${socShort(frAcc)}` };
  }).filter(Boolean);
}

// ---------- Affichage ----------
const SOC_CHIP = { ok: "0 € d’écart", just: 'Écart justifié', anom: 'À justifier' };
const SOC_SECS = [['641', '641 salarié'], ['645', '645 salarié'], ['63', '63 liés à la paie'], ['4', '42 et 43 salarié'], ['cp', 'Congés payés (4282 et 4382)']];
const SOC_ZONES = [
  { k: 'recap', n: 1, t: 'Récap ou journal de paie SILAE', accept: '.xls,.xlsx,.xlsm,.xltx,.pdf', drop: 'Déposer le récap ou le journal de paie', hint: 'Excel ouvert depuis SILAE, ou PDF du journal de paie',
    steps: '<li>Sélectionner la période souhaitée</li><li>Clic droit, <b>Récapitulatif de paie par période</b></li><li><b>Ouvrir dans tableur</b> (à droite de l\'écran)</li><li>Enregistrer le tableau sous <b>Classeur Excel XLS</b> dans le dossier sur lequel vous travaillez</li><li>Ou : <b>journal de paie</b> de l\'exercice enregistré en PDF (brut et net de l\'exercice, sans détail mensuel)</li>' },
  { k: 'cot', n: 2, t: 'Détail cotisations SILAE', accept: '.xls,.xlsx,.xlsm,.xltx,.pdf', drop: 'Déposer le détail des cotisations', hint: 'Excel ouvert depuis SILAE, ou PDF',
    steps: '<li>Sélectionner la période souhaitée</li><li>Clic droit, <b>Détail des cotisations</b></li><li><b>Ouvrir dans tableur</b> (à droite de l\'écran)</li><li>Enregistrer le tableau sous <b>Classeur Excel XLS</b> dans le dossier sur lequel vous travaillez</li><li>Ou : l\'édition enregistrée en PDF (organismes et leurs totaux, sans détail mensuel)</li>' },
  { k: 'gl', n: 3, t: 'FEC', accept: '.txt,.csv,.fec,.xls,.xlsx', drop: 'Déposer le FEC', hint: 'Fichier texte du FEC (un grand livre Excel est aussi accepté)',
    steps: '<li>Exporter le <b>FEC</b> de l\'exercice depuis le logiciel comptable</li><li>Le déposer tel quel, sans l\'ouvrir ni le modifier (fichier .txt)</li>',
    note: 'Les écritures de paie sont repérées automatiquement (toute écriture qui mouvemente un 645 ou crédite le 421), quel que soit le journal. Ouvert depuis le cycle H de l\'analyse, le FEC analysé est déjà là.' },
  { k: 'repos', n: 4, t: 'Solde de repos SILAE', opt: true, accept: '.pdf,.xls,.xlsx,.xlsm', drop: 'Déposer le solde de repos', hint: 'Facultatif : PDF ou Excel, à la date de clôture',
    steps: '<li>Éditer le <b>solde de repos</b> (congés payés) à la date de clôture</li><li>L\'enregistrer en PDF, ou l\'ouvrir dans le tableur et l\'enregistrer en Excel</li><li>L\'indemnité et les charges sont rapprochées des comptes 4282 et 4382</li>' },
];
const socChip = (cd) => (cd.s == null ? `<span class="soc-chip vide">${cd.sec === 'cp' ? 'Solde de repos à déposer' : 'Hors paie'}</span>` : `<span class="soc-chip ${cd.st}">${SOC_CHIP[cd.st]}</span>`);
// Ligne retenue dans une édition PDF ou un tableur (brut, net, congés payés), modifiable
function socLineSelect(st, id) {
  const P = st.pdf[socLineZone(id)];
  if (!P) return '';
  const cur = P.sel[id];
  const list = SilaePdf.candidates(P.rows, id);
  if (cur && !list.some((x) => x.row === cur.row && x.amount === cur.amount)) list.unshift(cur);
  return `<label class="soc-line">Ligne de l'édition (${esc(SOC_LINE[id].toLowerCase())}) <select data-social="line" data-id="${id}">${cur ? '' : '<option value="">— Choisir la ligne —</option>'}${list.map((x) => {
    const row = P.rows[x.row], a = row.amounts[x.amount];
    return `<option value="${x.row}:${x.amount}"${cur && cur.row === x.row && cur.amount === x.amount ? ' selected' : ''}>${esc(`${socLineTxt(row, a)} : ${socF(a.v)}`.slice(0, 120))}</option>`;
  }).join('')}</select></label>`;
}

function socCard(st, cd, note) {
  const SOFT = esc(socSoft());
  const k = esc(cd.key);
  let h = `<section class="card soc-card" data-key="${k}"><div class="soc-ch"><h3>${esc(cd.title)}</h3><span class="soc-nums">${cd.s != null ? `<span>SILAE <b>${socF(cd.s)}</b></span><span>${SOFT} <b>${socF(cd.c)}</b></span>` : ''}${socChip(cd)}</span></div>
    <p class="muted small">${esc(cd.sub)}${cd.comp ? ` – ${esc(cd.comp)}` : ''}</p>${cd.line ? socLineSelect(st, cd.line) : ''}<div class="soc-note ${cd.s == null ? '' : cd.st}">${esc(note)}</div>`;
  if (cd.s != null && Math.abs(cd.e) > SOC_TOL) {
    h += `<ul class="soc-mlist">${cd.mot.map((m) => (m.rec != null
      ? `<li><label class="check inline soc-mv"><input type="checkbox" checked data-social="unrec" data-i="${m.rec}"> ${esc(m.lib)} : <b>${socF(m.amt)} €</b> <span class="muted small">déplacé</span></label></li>`
      : `<li><span>${esc(m.lib)} : <b>${socF(m.amt)} €</b> <span class="muted small">${m.man ? 'saisi' : 'automatique'}</span></span><button class="btn small" data-action="social-rm" data-key="${k}" data-id="${esc(m.id)}">Retirer</button></li>`)).join('')}</ul>`;
    if (cd.moves.length) h += `<ul class="soc-mlist">${cd.moves.map((m, i) => `<li><label class="check inline soc-mv"><input type="checkbox" data-social="move" data-key="${k}" data-i="${i}"> Déplacer : ${esc(m.lib)} (${socF(m.amt)} €)</label></li>`).join('')}</ul>`;
    if (cd.sug.length) h += `<ul class="soc-mlist soc-sug">${cd.sug.map((s, i) => `<li><span>Piste : ${esc(s.lib)} (${socF(s.amt)} €)</span><button class="btn small" data-action="social-sug" data-key="${k}" data-i="${i}">Mettre dans le motif</button></li>`).join('')}</ul>`;
    const best = Math.abs(cd.res) > SOC_TOL ? cd.moves[0] || cd.sug[0] || null : null;
    const inp = st.inputs[cd.key] || { lib: best ? best.lib : '', amt: Math.abs(cd.res) > SOC_TOL ? socF(cd.res) : '' };
    h += `<div class="soc-addm"><input placeholder="Motif" aria-label="Motif" data-soc-ml value="${esc(inp.lib)}"><input inputmode="decimal" placeholder="Montant" aria-label="Montant du motif" data-soc-ma value="${esc(inp.amt)}"><button class="btn small" data-action="social-add" data-key="${k}">Ajouter le motif</button></div>`;
  }
  if (cd.orgs) h += `<details class="soc-det"><summary>Organismes rattachés</summary><div class="soc-orgs">${cd.orgs.map((o) => `<label class="check inline"><input type="checkbox" data-social="org" data-key="${k}" data-org="${o.key}"${cd.sel.includes(o.key) ? ' checked' : ''}> ${esc(o.label)} : ${socF(cd.sec === '645' ? o.pat : o.sal + o.pat)} €</label>`).join('')}</div></details>`;
  if (cd.key === '641') h += `<details class="soc-det"><summary>Comptes 641 retenus comme salariés</summary><div class="soc-orgs">${Object.values(st.last.A).filter((a) => /^641/.test(a.acc)).map((a) => `<label class="check inline"><input type="checkbox" data-social="sal" data-acc="${esc(a.acc)}"${a.sal ? ' checked' : ''}> ${a.short} : ${socF(a.solde)} €</label>`).join('')}</div></details>`;
  if (cd.monthly && cd.monthly.some((m) => m.p)) {
    h += `<details class="soc-det"><summary>Détail mensuel</summary><div class="grid-wrap"><table class="dtable soc-t"><thead><tr><th>Période</th><th class="n">SILAE</th><th class="n">${SOFT}</th><th class="n">Écart</th></tr></thead><tbody>${cd.monthly.map((m) => {
      const e = socR2(m.s - m.c);
      return `<tr><td>${esc(m.p)}</td><td class="n">${socF(m.s)}</td><td class="n">${socF(m.c)}</td><td class="n${Math.abs(e) > SOC_TOL ? ' late' : ''}">${socF(e)}</td></tr>`;
    }).join('')}</tbody></table></div></details>`;
  }
  return `${h}<p class="soc-bar"><button class="btn small" data-action="social-copy" data-key="${k}">Copier la note</button></p></section>`;
}

// Dossier rattaché : le cadrage est enregistré dans la feuille de l'exercice (cycle H de la révision)
function socLinkInfo(st) {
  const c = st.link && clientById(st.link.clientId);
  const back = st.fecOf && ui.fec === st.fecOf ? '<button class="btn small" data-action="social-back">Revenir au cycle H de l\'analyse</button>' : '';
  if (!c && !back) return '';
  const where = c ? `Dossier ${esc(clientLabel(c))}, exercice clos le ${esc(/^\d{4}-\d{2}-\d{2}$/.test(st.link.closing) ? fmtDate(st.link.closing) : st.link.closing)} : le cadrage est enregistré dans le dossier de révision (cycle H) et repris à la prochaine ouverture.`
    : 'Analyse sans dossier rattaché : le cadrage est repris dans le cycle H le temps de la session.';
  return `<div class="banner info soc-link"><span>${where}</span>${back}</div>`;
}

function viewSocial() {
  const st = socState();
  const zone = (z) => {
    const fs = st.files.filter((x) => x.zone === z.k);
    const ok = z.k === 'gl' ? st.parsed.gl.length : st.parsed[z.k];
    const bad = fs.some((x) => x.err);
    return `<section class="card soc-zone"><div class="soc-zh"><span class="soc-n">${z.n}</span><h2>${z.t}</h2><span class="soc-chip ${ok ? 'ok' : bad ? 'anom' : 'vide'}">${ok ? 'Chargé' : bad ? 'Fichier refusé' : z.opt ? 'Facultatif' : 'À déposer'}</span></div>
      <ol class="soc-steps">${z.steps}</ol>${z.note ? `<p class="muted small soc-hint">${z.note}</p>` : ''}
      <div class="fec-drop soc-drop" data-action="social-pick" data-zone="${z.k}" role="button" tabindex="0"><p><strong>${z.drop}</strong></p><p class="muted small">${z.hint}</p></div>
      ${fs.length ? `<ul class="soc-files">${fs.map((x) => `<li><span>${esc(x.name)}</span><em class="${x.err ? 'late' : 'muted'}">${esc(x.err || x.info || 'Chargé')}</em></li>`).join('')}</ul>` : ''}</section>`;
  };
  let h = `<div class="page-head"><div><h1>CYCLE SOCIAL</h1><p class="muted small">Cadrage paie : 641, 645, 63, 42 et 43, congés payés</p></div>
      <div class="head-actions">${st.last ? '<button class="btn" data-action="social-copy-all">Copier toutes les notes</button>' : ''}${st.files.length ? '<button class="btn" data-action="social-clear">Retirer les fichiers</button>' : ''}</div></div>
    <p class="muted">Déposez les exports SILAE et le FEC dans leur case en suivant les étapes. Chaque compte est ensuite rapproché de la paie et reçoit sa note. Les fichiers sont lus sur l'appareil : rien n'est envoyé ni conservé.</p>
    ${socLinkInfo(st)}
    <div class="soc-zones">${SOC_ZONES.map(zone).join('')}</div>
    <section class="card"><div class="lett-opts">
      <label>Date de clôture <input type="date" data-social="dClo" value="${esc(st.dClo)}"></label>
      <label>Nom du logiciel comptable <input data-social="soft" value="${esc(socSoft())}"></label>
    </div>${st.err ? `<p class="late small" role="status">${esc(st.err)}</p>` : ''}</section>`;
  if (!st.last) return h;
  const { cards } = st.last;
  const notes = new Map(cards.map((cd) => [cd.key, socNote(st, cd)]));
  h += `<section class="card"><h2>Synthèse</h2><div class="grid-wrap"><table class="dtable soc-t"><thead><tr><th>Compte</th><th class="n">SILAE</th><th class="n">${esc(socSoft())}</th><th class="n">Écart</th><th class="n">Solde au ${socDateFr(st)}</th><th>Statut</th></tr></thead><tbody>
    ${SOC_SECS.map(([s, l]) => {
      const L = cards.filter((c) => c.sec === s);
      if (!L.length) return '';
      return `<tr class="soc-grp"><td colspan="6">${l}</td></tr>${L.map((cd) => `<tr><td>${esc(cd.title)} <span class="muted small">${esc(cd.sub)}</span></td><td class="n">${cd.s == null ? '' : socF(cd.s)}</td><td class="n">${cd.c == null ? '' : socF(cd.c)}</td><td class="n${cd.st === 'anom' ? ' late' : ''}">${cd.s == null ? '' : socF(cd.e)}</td><td class="n">${socF(cd.kind === 'tiers' ? cd.solde : cd.c)}</td><td>${socChip(cd)}</td></tr>`).join('')}`;
    }).join('')}</tbody></table></div></section>`;
  const OD = socOdRows(st);
  if (OD.length) {
    h += `<section class="card soc-od"><h2>Écritures de reclassement à passer</h2><div class="grid-wrap"><table class="dtable soc-t"><thead><tr><th>Date</th><th>Compte débité</th><th>Compte crédité</th><th class="n">Montant</th><th>Libellé</th></tr></thead><tbody>
      ${OD.map((o) => `<tr><td>${o.d}</td><td>${esc(o.deb)}</td><td>${esc(o.cre)}</td><td class="n">${socF(o.m)}</td><td>${esc(o.l)}</td></tr>`).join('')}</tbody></table></div>
      <p class="soc-bar"><button class="btn small" data-action="social-copy-od">Copier les écritures</button></p></section>`;
  }
  SOC_SECS.forEach(([s, l]) => {
    const L = cards.filter((c) => c.sec === s);
    if (L.length) h += `<h2 class="soc-sec">${l}</h2>${L.map((cd) => socCard(st, cd, notes.get(cd.key))).join('')}`;
  });
  return h;
}

// ---------- Actions ----------
async function socClip(text, done) {
  try { await navigator.clipboard.writeText(text); toast(done); } catch (e) { toast('Copie impossible sur ce navigateur.', true); }
}
const socCardOf = (key) => (socState().last ? socState().last.cards.find((c) => c.key === key) : null);
function socAction(name, el) {
  const st = socState();
  const key = el.dataset.key;
  const cd = key ? socCardOf(key) : null;
  if (name === 'pick') {
    const z = SOC_ZONES.find((x) => x.k === el.dataset.zone);
    return pickFiles(z.accept).then((files) => socLoad(z.k === 'gl' ? files : files.slice(0, 1), z.k));
  }
  if (name === 'back') {
    if (!(st.fecOf && ui.fec === st.fecOf)) return;
    Object.assign(ui.fec, { space: 'revision', section: 'social' });
    location.hash = '#/fec';
    return;
  }
  if (name === 'clear') { ui.social = null; return refresh(); }
  if (name === 'copy-all') return st.last && socClip(st.last.cards.map((c) => socNote(st, c)).join('\n\n'), `${st.last.cards.length} notes copiées.`);
  if (name === 'copy-od') return socClip(socOdRows(st).map((o) => [o.d, o.deb, o.cre, socF(o.m), o.l].join('\t')).join('\n'), 'Écritures copiées : collez-les dans un tableur.');
  if (!cd) return;
  if (name === 'copy') return socClip(socNote(st, cd), `Note ${cd.title} copiée.`);
  if (name === 'rm') {
    const id = el.dataset.id;
    if (id.startsWith('m')) st.MAN[key].splice(+id.slice(1), 1);
    else (st.RM[key] = st.RM[key] || []).push(id);
  } else if (name === 'sug') {
    const s = cd.sug[+el.dataset.i];
    st.inputs[key] = { lib: s.lib, amt: socF(s.amt) };
  } else if (name === 'add') {
    const card = el.closest('.soc-card');
    const lib = card.querySelector('[data-soc-ml]').value.trim(), amt = socNum(card.querySelector('[data-soc-ma]').value);
    if (!lib || !amt) return toast('Saisissez un motif et un montant.', true);
    (st.MAN[key] = st.MAN[key] || []).push({ lib, amt });
    delete st.inputs[key];
  }
  socRun();
  refresh();
}
function onSocialChange(t) {
  const st = socState();
  const k = t.dataset.social;
  if (k === 'dClo') st.dClo = t.value;
  else if (k === 'soft') { data.settings.socialSoft = t.value.trim() || 'Pennylane'; persist(); }
  else if (k === 'sal') { st.SAL[t.dataset.acc] = t.checked; socRun(); }
  else if (k === 'unrec') { st.RECL.splice(+t.dataset.i, 1); socRun(); }
  else if (k === 'line') {
    const id = t.dataset.id, P = st.pdf[socLineZone(id)];
    if (P && t.value) {
      const [ri, ai] = t.value.split(':').map(Number);
      P.sel[id] = { row: ri, amount: ai };
      (data.settings.silaeMap = data.settings.silaeMap || {})[id] = socLineMemo(P.rows[ri], P.rows[ri].amounts[ai]);
      persist();
    }
    socRun();
  }
  else {
    const cd = socCardOf(t.dataset.key);
    if (!cd) return;
    if (k === 'move') { const m = cd.moves[+t.dataset.i]; st.RECL.push({ to: cd.key, from: m.from, fromShort: m.fromShort, amt: m.amt }); }
    else if (k === 'org') st.MAP[cd.key] = [...t.closest('.soc-card').querySelectorAll('[data-social=org]:checked')].map((x) => (st.parsed.cot.find((o) => o.key === x.dataset.org) || {}).label).filter(Boolean);
    delete st.inputs[cd.key];
    socRun();
  }
  refresh();
}
