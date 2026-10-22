/*
 * Suivi Dossiers — Contrôle de la TVA de l'exercice (révision), sur le modèle de la feuille de travail TVA du cabinet :
 * récapitulatif des déclarations, TVA collectée, TVA déductible, contrôle des soldes de TVA après OD.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- Contrôle de la TVA de l'exercice ----------
// Du début de l'exercice au mois d'arrêté, tout part du FEC :
// 1. récapitulatif des déclarations : pré-rempli d'après les OD de TVA comptabilisées (TVA de chaque taux ÷ taux = base,
//    TVA déductible, crédit, TVA à payer) ; chaque case se remplace par le montant réellement déclaré ;
// 2. TVA collectée : produits de chaque compte rangés par taux (taux du compte : paramétrage de l'onglet TVA, sinon
//    écritures de vente, sinon libellé), corrections d'inventaire, contrôle en bases (CA × taux / TVA comptabilisée)
//    et TVA sur les encaissements (CA ± créances et avances clients / CA déclaré) ;
// 3. TVA déductible : soldes avant l'OD de la période, moins la TVA des prestations de services non réglées
//    (fournisseurs créditeurs, part des services lue dans leurs factures) ;
// 4. soldes théoriques et réels des comptes de TVA après l'OD.
// Les montants saisis sont conservés, chiffrés, dans le dossier (par exercice), les choix par fournisseur d'un
// exercice à l'autre.

// Corrections du chiffre d'affaires (HT) : clé, libellé, signe
const TVR_CA_ADJ = [
  ['reg', "Écritures d'inventaire reconnues (FAE, AAE, PCA et extournes)", -1],
  ['fae1', 'Factures à établir N-1', 1], ['aae1', 'Avoirs à établir N-1', -1], ['pca1', "Travaux facturés d'avance N-1", -1],
  ['fae', 'Factures à établir', -1], ['aae', 'Avoirs à établir', 1], ['pca', "Travaux facturés d'avance", 1],
  ['pertes', 'Créances passées en pertes', -1],
];
// TVA sur les encaissements : retraitements des créances et avances clients (HT)
const TVR_ENC = [
  ['cre1', 'Créances clients N-1', 1], ['av1', 'Avances clients N-1', -1], ['dout1', 'Créances douteuses N-1', 1],
  ['eff1', 'Effets à recevoir N-1', 1], ['esc1', 'Effets escomptés non échus N-1', 1],
  ['cre', 'Créances clients', -1], ['av', 'Avances clients', 1], ['dout', 'Créances douteuses', -1],
  ['eff', 'Effets à recevoir', -1], ['esc', 'Effets escomptés non échus', -1],
];
// Colonnes du récapitulatif hors bases par taux : clé, libellé, saisie
// Contrôle des soldes après OD : créances et avances de fin de période (HT), signe dans le solde théorique
const TVR_FIN = [['cre', 'Créances clients', 1], ['av', 'Avances clients', -1], ['dout', 'Créances douteuses', 1], ['eff', 'Effets à recevoir', 1], ['esc', 'Effets escomptés non échus', 1]];
const TVR_CA3_OTHER = [['acq', 'Acquisitions intracom. (base)'], ['exp', 'Export'], ['exo', 'Autres op. non imposables'], ['lic', 'Livraisons intracom.']];
const TVR_CA3_DED = [['dImmo', 'TVA déd. immobilisations'], ['dAbs', 'TVA déd. biens et services'], ['dIntra', 'TVA déd. intracom.']];

const tvrState = () => (ui.fec.tvr = ui.fec.tvr || { ym: '' });

// Saisies du dossier : par exercice (date de clôture), et choix par fournisseur
function tvrStore() {
  const c = clientById(ui.fec.clientId);
  const root = c ? (c.tvaRevue = c.tvaRevue || {}) : (ui.fec.tvaRevue = ui.fec.tvaRevue || {});
  root.frs = root.frs || {};
  root.ex = root.ex || {};
  const key = ui.fec.result.meta.closing || 'exercice';
  const ex = (root.ex[key] = root.ex[key] || {});
  ex.ca3 = ex.ca3 || {};
  ex.adj = ex.adj || {};
  ex.meta = ex.meta || {};
  return { root, ex };
}
// Mois cité dans le libellé d'une OD de TVA (« TVA juin 2026 », « Déclaration 06/2026 »), au plus 4 mois avant sa date
function tvrLibMonth(lib, date) {
  const t = norm(lib || '');
  let m = null, y = null;
  const named = t.match(/\b(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b\s*(20\d\d)?/);
  if (named) { m = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'].indexOf(named[1]) + 1; y = named[2] ? +named[2] : null; }
  else { const num = t.match(/\b(0[1-9]|1[0-2])[/.-](20\d\d)\b/); if (num) { m = +num[1]; y = +num[2]; } }
  if (!m || !date) return null;
  if (!y) y = m > +date.slice(5, 7) ? +date.slice(0, 4) - 1 : +date.slice(0, 4);
  const ym = `${y}-${pad(m)}`;
  const gap = (+date.slice(0, 4) - y) * 12 + (+date.slice(5, 7) - m);
  return gap >= 0 && gap <= 4 ? ym : null;
}
const tvrNum = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? undefined : Number(v));
const tvrParse = (s) => { const t = String(s).replace(/[\s  €]/g, '').replace(',', '.'); return t === '' || !Number.isFinite(Number(t)) ? undefined : Number(t); };

function tvrMonths(r) {
  const start = (r.meta.start || r.meta.minDate || '').slice(0, 7);
  const last = (r.meta.maxDate || '').slice(0, 7);
  const out = [];
  if (!start || !last) return out;
  for (let y = +start.slice(0, 4), m = +start.slice(5, 7); `${y}-${pad(m)}` <= last && out.length < 36; m === 12 ? (y++, m = 1) : m++) out.push(`${y}-${pad(m)}`);
  return out;
}

// Calcul complet au mois d'arrêté (mis en cache tant que ni les saisies ni le paramétrage ne changent)
function tvrCalc(r) {
  const M = tvaModel(r);
  const st = tvrState();
  const { root, ex } = tvrStore();
  const months = tvrMonths(r);
  const kind = M.freq || (tvaRegime() === 'T' ? 'quarter' : 'month');
  const A = tvaAssign(M, kind);
  const perOf = (ym) => (kind === 'quarter' ? quarterOf(ym) : ym);
  // Mois d'arrêté par défaut : fin de la dernière période dont l'OD de TVA est comptabilisée
  if (!months.includes(st.ym)) {
    const done = Array.from(new Set(M.decls.map((d) => { const ym = tvrLibMonth(d.lib, d.date); return ym ? perOf(ym) : d.per && d.per[kind]; }).filter(Boolean))).sort().pop();
    const ym = done ? tvaPeriod(done).months.slice(-1)[0] : months[months.length - 1];
    st.ym = months.includes(ym) ? ym : months[months.length - 1];
  }
  const arr = st.ym, P = perOf(arr), arrEnd = endOfMonth(`${arr}-01`);
  const sig = [M.sig, arr, JSON.stringify(ex), JSON.stringify(root.frs)].join('|');
  if (r._tvr && r._tvr.sig === sig) return r._tvr;
  const upto = months.filter((ym) => ym <= arr);
  const keys = Array.from(new Set(upto.map(perOf)));

  // Période de chaque OD de TVA : le mois cité dans son libellé (« TVA juin 2026 »), sinon le rattachement par montants
  const declOf = (d) => {
    const ym = tvrLibMonth(d.lib, d.date);
    if (ym) return perOf(ym);
    return d.per && d.per[kind] ? d.per[kind] : null;
  };
  const byKey = {};
  M.decls.forEach((d) => { const k = declOf(d); if (k) (byKey[k] = byKey[k] || []).push(d); });
  // Comptes de TVA : solde par date (AN + mouvements jusqu'à l'arrêté), avant et après l'OD de la période d'arrêté
  const declIn = (d, inclP) => { const k = declOf(d); return k ? (inclP ? k <= P : k < P) : d.date <= arrEnd; };
  const accBal = {};
  Object.values(M.acc).forEach((a) => {
    let ops = a.an, decl = 0;
    upto.forEach((ym) => { const x = (M.mv[ym] || {})[a.compte]; if (x) { ops += x.op + x.pay; decl += x.decl; } });
    const avant = ops + M.decls.filter((d) => declIn(d, false)).reduce((t, d) => t + (d.m[a.compte] || 0), 0);
    const apres = ops + M.decls.filter((d) => declIn(d, true)).reduce((t, d) => t + (d.m[a.compte] || 0), 0);
    accBal[a.compte] = { an: a.an, ops: round2(ops - a.an), decl: round2(decl), solde: round2(ops + decl), avant: round2(avant), apres: round2(apres) };
  });
  const accsOf = (fn) => Object.values(M.acc).filter(fn);
  const sumBal = (list, k) => round2(list.reduce((t, a) => t + accBal[a.compte][k], 0));

  // Produits de la période par compte : opérations et écritures d'inventaire (sans TVA, ou TVA à régulariser seule)
  const caOps = {}, caReg = {};
  upto.forEach((ym) => {
    Object.entries(M.T.ca7[ym] || {}).forEach(([c, v]) => { caOps[c] = (caOps[c] || 0) + v; });
    Object.entries((M.T.ca7r || {})[ym] || {}).forEach(([c, v]) => { caReg[c] = (caReg[c] || 0) + v; });
  });
  M.groups.forEach((g) => {
    if (g.kind !== 'op' || g.ym > arr || g.ym < months[0]) return;
    const vat = Object.keys(g.m).filter((c) => c.startsWith('445'));
    if (!vat.length || !vat.every((c) => M.roleOf(c) === 'regul')) return;
    Object.entries(g.m).forEach(([c, v]) => { if (c[0] === '7') { caOps[c] = (caOps[c] || 0) + v; caReg[c] = (caReg[c] || 0) - v; } });
  });
  const colOf = (c) => { const ro = M.ca[c] ? M.ca[c].role : 'sans'; return typeof ro === 'number' ? String(ro) : ro === 'hc' ? 'hc' : 'exo'; };
  const accounts = Object.keys(Object.assign({}, caOps, caReg)).sort().map((c) => {
    const amt = round2((caOps[c] || 0) + (caReg[c] || 0));
    return { compte: c, lib: (M.ca[c] || {}).lib || '', col: colOf(c), role: M.ca[c] ? M.ca[c].role : 'sans', src: M.ca[c] ? M.ca[c].src : 'auto', amt, reg: round2(caReg[c] || 0) };
  }).filter((x) => Math.abs(x.amt) >= 0.005 || Math.abs(x.reg) >= 0.005);

  // Taux du dossier : comptes de produits, comptes de TVA collectée mouvementés
  const collAccs = accsOf((a) => /^coll/.test(a.role));
  const rateSet = new Set(accounts.filter((x) => /^[\d.]+$/.test(x.col)).map((x) => Number(x.col)));
  collAccs.forEach((a) => { if (a.rate && Math.abs(accBal[a.compte].ops) >= 1) rateSet.add(a.rate); });
  Object.values(ex.ca3).forEach((o) => Object.keys(o).forEach((k) => { if (/^b[\d.]+$/.test(k) && tvrNum(o[k])) rateSet.add(Number(k.slice(1))); }));
  const R = Array.from(rateSet).sort((a, b) => b - a);
  const cols = R.map(String).concat('exo');
  const sumCols = (fn) => Object.fromEntries(cols.map((k) => [k, round2(fn(k))]));
  const vat = (k, v) => (k === 'exo' ? 0 : round2((v * Number(k)) / 100));

  // 1. Récapitulatif des déclarations
  const anCredit = sumBal(accsOf((a) => a.role === 'credit'), 'an');
  const rows = [];
  let prevCredit = Math.max(0, anCredit);
  keys.forEach((key, i) => {
    const per = tvaPeriod(key);
    const decls = byKey[key] || [];
    const auto = {};
    const tvaRate = {};
    let tvaNoRate = 0;
    decls.forEach((d) => Object.entries(d.m).forEach(([c, v]) => {
      const a = M.acc[c];
      if (!a || a.role !== 'coll') return;
      if (a.rate) tvaRate[a.rate] = (tvaRate[a.rate] || 0) + v; else tvaNoRate += v;
    }));
    if (tvaNoRate && R.length === 1) tvaRate[R[0]] = (tvaRate[R[0]] || 0) + tvaNoRate;
    const ops = A.ops[key] || tvaOps(M, per);
    const sumD = (k) => round2(decls.reduce((t, d) => t + (d[k] || 0), 0));
    // TVA autoliquidée de la période : déclarée avec la TVA à 20 % quand l'OD ne la distingue pas
    const acqTva = decls.length && Math.abs(sumD('auto')) < 0.01 && ops.auto > 0.01 ? ops.auto : sumD('auto');
    if (acqTva > 0.01 && Math.abs(sumD('auto')) < 0.01 && tvaRate[20]) tvaRate[20] -= acqTva;
    R.forEach((rt) => { if (tvaRate[rt]) auto[`b${rt}`] = Math.round((tvaRate[rt] * 100) / rt); });
    if (acqTva > 0.01) { auto.acq = Math.round(acqTva / 0.2); auto.dIntra = round2(acqTva); }
    const caRole = (role) => Math.round(per.months.reduce((t, ym) => t + Object.entries(M.T.ca7[ym] || {}).reduce((s, [c, v]) => s + ((M.ca[c] || {}).role === role ? v : 0), 0), 0));
    [['exp', 'export'], ['exo', 'exo'], ['lic', 'intra']].forEach(([k, role]) => { const v = caRole(role); if (v) auto[k] = v; });
    if (decls.length) {
      auto.dImmo = sumD('dedImmo');
      auto.dAbs = round2(sumD('ded') - (auto.dIntra && sumD('ded') >= auto.dIntra ? auto.dIntra : 0));
    }
    const ov = ex.ca3[key] || {};
    const v = (k) => { const o = tvrNum(ov[k]); return o !== undefined ? o : auto[k] || 0; };
    const bases = Object.fromEntries(R.map((rt) => [rt, v(`b${rt}`)]));
    // TVA collectée : bases × taux, autoliquidations à 20 %, sommes à ajouter (lignes 15 et 5B)
    const coll = round2(R.reduce((t, rt) => t + (bases[rt] * rt) / 100, 0) + v('acq') * 0.2 + v('add'));
    const base = round2(R.reduce((t, rt) => t + bases[rt], 0) + TVR_CA3_OTHER.reduce((t, [k]) => t + v(k), 0));
    // Report : crédit de la période précédente, plus la TVA à régulariser imputée par l'OD (acompte versé, 4458)
    const acompte = round2(decls.reduce((t, d) => t + Object.entries(d.m).reduce((x, [c, v]) => x + (M.roleOf(c) === 'regul' && v < 0 ? -v : 0), 0), 0));
    auto.report = round2((i === 0 ? Math.max(0, anCredit) : prevCredit) + acompte);
    const report = v('report');
    const dTot = round2(v('dImmo') + v('dAbs') + v('dIntra') + report);
    const due = round2(Math.max(0, coll - dTot));
    const remb = v('remb');
    const credit = due === 0 ? round2(dTot - coll - remb) : 0;
    prevCredit = credit;
    // OD de TVA comptabilisée : TVA à décaisser moins crédit constaté
    const creditNew = round2(decls.reduce((t, d) => t + Object.entries(d.m).reduce((s, [c, x]) => s + (M.roleOf(c) === 'credit' && x > 0 ? x : 0), 0), 0));
    const odNet = decls.length ? round2(sumD('due') - creditNew) : null;
    // Déclaration importée : TVA nette (ligne 28) et crédit à reporter (ligne 27) comparés au calcul
    const ca3 = ov._ca3 || null;
    const ca3Gap = ca3 ? round2(Math.abs(due - (ca3.l28 || 0)) + Math.abs(credit - (ca3.l27 || 0))) : null;
    rows.push({ key, label: per.label, decls: decls.length, auto, ov, v: Object.fromEntries(['acq', 'exp', 'exo', 'lic', 'add', 'dImmo', 'dAbs', 'dIntra', 'remb'].map((k) => [k, v(k)])),
      bases, base, coll, report, dTot, due, remb, credit, odNet, odGap: odNet === null ? null : round2(due - credit - odNet), ca3, ca3Gap });
  });
  const baseKeys = R.map((rt) => `b${rt}`).concat(TVR_CA3_OTHER.map(([k]) => k));
  const valOf = (row, k) => (k[0] === 'b' ? row.bases[Number(k.slice(1))] : row.v[k]);
  const tot = Object.fromEntries(baseKeys.concat(['add', 'dImmo', 'dAbs', 'dIntra', 'remb']).map((k) => [k, round2(rows.reduce((t, row) => t + (valOf(row, k) || 0), 0))]));
  ['base', 'coll', 'report', 'dTot', 'due', 'credit'].forEach((k) => { tot[k] = round2(rows.reduce((t, row) => t + row[k], 0)); });
  const adj = (row, k) => tvrNum((ex.adj[row] || {})[k]) || 0;
  const caDecl = Object.fromEntries(baseKeys.map((k) => [k, round2(tot[k] - adj('rd', k) + adj('ra', k))]));
  const tvaCaDecl = round2(R.reduce((t, rt) => t + (caDecl[`b${rt}`] * rt) / 100, 0) + caDecl.acq * 0.2);
  const recap = { rows, tot, caDecl, tvaCaDecl, ecart: round2(tot.coll - tvaCaDecl), baseKeys, showAdd: rows.some((row) => row.v.add) };

  // 2. TVA collectée
  const prodTot = sumCols((k) => accounts.filter((x) => x.col === k).reduce((t, x) => t + x.amt, 0));
  const adjAuto = { reg: sumCols((k) => accounts.filter((x) => x.col === k).reduce((t, x) => t + x.reg, 0)) };
  const adjVal = (row, k) => { const o = tvrNum((ex.adj[row] || {})[k]); return o !== undefined ? o : (adjAuto[row] || {})[k] || 0; };
  const caHt = sumCols((k) => prodTot[k] + TVR_CA_ADJ.reduce((t, [row, , s]) => t + s * adjVal(row, k), 0));
  const theo = sumCols((k) => vat(k, caHt[k]));
  const collOf = (k) => collAccs.filter((a) => (k === '?' ? !a.rate : String(a.rate) === k));
  const bRows = {
    solde: sumCols((k) => -sumBal(collOf(k), 'solde')), an: sumCols((k) => sumBal(collOf(k), 'an')), od: sumCols((k) => sumBal(collOf(k), 'decl')),
    diff: sumCols((k) => adjVal('diffLet', k)),
  };
  const noRate = collOf('?').filter((a) => Math.abs(accBal[a.compte].solde) >= 0.01 || Math.abs(accBal[a.compte].ops) >= 0.01);
  const compta = sumCols((k) => (k === 'exo' ? 0 : bRows.solde[k] + bRows.an[k] + bRows.od[k] + bRows.diff[k]));
  const collecte = { accounts, prodTot, adjAuto, caHt, theo, bRows, compta, ecart: sumCols((k) => theo[k] - compta[k]), noRate };

  // TVA sur les encaissements : avances d'après les comptes 419 dont le libellé donne le taux ; créances, douteux et
  // effets à saisir (soldes du FEC et TVA non exigible comptabilisée donnés en repère)
  const encAuto = {};
  const setA = (row, k, v) => { if (Math.abs(v) >= 0.005) (encAuto[row] = encAuto[row] || {})[k] = round2(((encAuto[row] || {})[k] || 0) + v); };
  const balAt = (x) => round2(x.an + upto.reduce((t, ym) => t + ((x.m || {})[ym] || 0), 0));
  const hints = { cre: [], av: [], dout: [], eff: [], att: [] };
  accsOf((a) => a.role === 'coll-att').forEach((a) => {
    const n1 = -a.an, fin = -(a.an + accBal[a.compte].ops + accBal[a.compte].decl);
    if (Math.abs(n1) >= 0.005 || Math.abs(fin) >= 0.005) hints.att.push({ compte: a.compte, lib: a.lib, n1, fin, rate: a.rate });
  });
  (r.balance || []).forEach((x) => {
    const kindH = x.compte.startsWith('419') ? 'av' : x.compte.startsWith('416') ? 'dout' : x.compte.startsWith('413') ? 'eff' : /^41[01]/.test(x.compte) ? 'cre' : null;
    if (!kindH) return;
    const n1 = x.an, fin = balAt(x);
    if (Math.abs(n1) < 0.005 && Math.abs(fin) < 0.005) return;
    hints[kindH].push({ compte: x.compte, lib: x.lib, n1: kindH === 'av' ? n1 : -n1, fin: kindH === 'av' ? fin : -fin });
    if (kindH !== 'av') return;
    // Avance au taux du libellé (« acomptes 10 % »), « pas de TVA » en non imposable ; sinon à répartir à la main
    const t = norm(x.lib);
    const rt = rateOfLabel(x.lib, false);
    const k = rt && R.includes(rt) ? String(rt) : RE_CA_EXO.test(t) ? 'exo' : null;
    if (!k) return;
    const ht = (v) => (k === 'exo' ? v : v / (1 + Number(k) / 100));
    setA('av1', k, ht(-n1));
    setA('av', k, ht(-fin));
  });
  // Créances et avances d'après le lettrage des comptes clients : factures non réglées à la date (ventilées par leurs
  // comptes de produits), règlements non encore affectés ; à-nouveaux et lignes sans ventilation répartis au prorata des
  // factures du client (TTC par taux). Seulement si les factures sont lettrées dans leur majorité.
  const cli = r.tvaCli;
  const cliState = !cli || !cli.invoices ? 'absent' : cli.truncated ? 'trop' : cli.lettered < 0.5 ? 'lettrage' : 'ok';
  if (cliState === 'ok') {
    const rateOf = (k) => (k === 'exo' ? 0 : Number(k));
    const colIn = (k) => (cols.includes(k) ? k : 'exo');
    const mixOf = (acc) => {
      const m = {};
      acc.lines.forEach((l) => { if (l[3]) Object.entries(l[3]).forEach(([c, v]) => { const k = colOf(c); if (k !== 'hc') m[colIn(k)] = (m[colIn(k)] || 0) + v * (1 + rateOf(colIn(k)) / 100); }); });
      return m;
    };
    const mixes = cli.accs.map(mixOf);
    const globalMix = {};
    mixes.forEach((m) => Object.entries(m).forEach(([k, v]) => { globalMix[k] = (globalMix[k] || 0) + v; }));
    const alloc = (row, ttc, m) => {
      const tot = Object.values(m).reduce((t, v) => t + v, 0);
      if (tot > 0) Object.entries(m).forEach(([k, w]) => setA(row, k, (ttc * w) / tot / (1 + rateOf(k) / 100)));
    };
    const start = `${months[0]}-01`;
    cli.accs.forEach((acc, i) => {
      const m = Object.keys(mixes[i]).length ? mixes[i] : globalMix;
      acc.lines.forEach(([date, amt, paid, split]) => {
        if (paid === '0000-00-00') return;
        if (!date) { if (amt > 0) alloc('cre1', amt, m); else alloc('av1', -amt, m); }
        if ((date || start) > arrEnd || (paid && paid <= arrEnd)) return;
        if (amt < 0) alloc('av', -amt, m);
        else if (split) Object.entries(split).forEach(([c, v]) => { const k = colOf(c); if (k !== 'hc') setA('cre', colIn(k), v); });
        else alloc('cre', amt, m);
      });
    });
  }
  const encVal = (row, k) => { const o = tvrNum((ex.adj[row] || {})[k]); return o !== undefined ? o : (encAuto[row] || {})[k] || 0; };
  const encTot = sumCols((k) => caHt[k] + TVR_ENC.reduce((t, [row, , s]) => t + s * encVal(row, k), 0));
  const encDecl = sumCols((k) => (k === 'exo' ? caDecl.exp + caDecl.exo + caDecl.lic : caDecl[`b${k}`] || 0));
  const encEcart = sumCols((k) => encTot[k] - encDecl[k]);
  const enc = { auto: encAuto, tot: encTot, decl: encDecl, ecart: encEcart, tva: sumCols((k) => vat(k, encEcart[k])), hints, cli: cliState, lettered: cli ? cli.lettered : null };

  // 3. TVA déductible, avant l'OD de la période d'arrêté
  const deb = (role, k) => sumBal(accsOf((a) => a.role === role), k);
  const autoliqDed = round2(accsOf((a) => a.role === 'autoliq').reduce((t, a) => t + Math.max(0, accBal[a.compte].avant), 0));
  const ded = { intra: autoliqDed, immo: deb('ded-immo', 'avant'), abs: deb('ded', 'avant'), att: deb('ded-att', 'avant'), report: deb('credit', 'avant') };
  ded.total = round2(ded.intra + ded.immo + ded.abs + ded.att + ded.report);
  // Fournisseurs créditeurs à l'arrêté : TVA des prestations de services non encore déductible
  const frs = ((r.pieces && r.pieces.tiersMonths) || []).filter((t) => t.racine !== '411').map((t) => {
    const s = -(t.an + upto.reduce((acc, ym) => acc + (t.m[ym] ? t.m[ym][0] - t.m[ym][1] : 0), 0));
    const key = `${t.racine}|${t.num}`;
    const o = root.frs[key] || {};
    const serv = o.s !== undefined ? !!o.s : t.sv !== null && t.sv !== undefined && t.sv >= 0.5;
    const rate = o.r !== undefined ? Number(o.r) : t.rt || 20;
    return { key, racine: t.racine, num: t.num, lib: t.lib, solde: round2(s), serv, rate, sv: t.sv, auto: o.s === undefined, tva: serv ? round2((s * rate) / (100 + rate)) : 0 };
  }).filter((x) => x.solde > 0.5).sort((a, b) => b.solde - a.solde).slice(0, 300);
  const nonDed = { abs: round2(frs.filter((x) => x.racine !== '404').reduce((t, x) => t + x.tva, 0)), immo: round2(frs.filter((x) => x.racine === '404').reduce((t, x) => t + x.tva, 0)) };
  ded.exigible = round2(ded.total - nonDed.abs - nonDed.immo);
  const declP = byKey[P] || [];
  ded.declared = declP.length ? round2(declP.reduce((t, d) => t + d.ded + d.dedImmo + Object.entries(d.m).reduce((s, [c, x]) => s + (M.roleOf(c) === 'credit' && x < 0 ? -x : 0), 0), 0)) : null;
  const deductible = Object.assign(ded, { frs, nonDed });

  // 4. Soldes après OD
  const sc = R.map((rt) => {
    const k = String(rt);
    const parts = Object.fromEntries(TVR_FIN.map(([row]) => [row, round2(encVal(row, k))]));
    const ht = round2(TVR_FIN.reduce((t, [row, , s]) => t + s * parts[row], 0));
    const theoS = vat(k, ht);
    const reel = -sumBal(collOf(k), 'apres');
    return { rate: rt, parts, ht, theo: theoS, reel, ecart: round2(theoS - reel), base: round2(((theoS - reel) * 100) / rt) };
  });
  const sdReel = { abs: round2(deb('ded', 'apres') + deb('ded-att', 'apres')), immo: deb('ded-immo', 'apres') };
  const sd = ['abs', 'immo'].map((k) => ({ k, theo: nonDed[k], reel: sdReel[k], ecart: round2(nonDed[k] - sdReel[k]), base: round2((nonDed[k] - sdReel[k]) / 0.2) }));

  // Compte de TVA principal de chaque nature (le plus mouvementé), pour l'OD de régularisation
  const mainOf = (list) => (list.slice().sort((a, b) => (a.role === 'coll' ? 0 : 1) - (b.role === 'coll' ? 0 : 1) || Math.abs(accBal[b.compte].ops) - Math.abs(accBal[a.compte].ops))[0] || {}).compte || '';
  const tvaAcc = { coll: Object.fromEntries(R.map((rt) => [rt, mainOf(collOf(String(rt)))])), abs: mainOf(accsOf((a) => a.role === 'ded')) || mainOf(accsOf((a) => a.role === 'ded-att')), immo: mainOf(accsOf((a) => a.role === 'ded-immo')) };
  const K = { sig, M, kind, arr, P, arrEnd, months, keys, R, cols, recap, collecte, enc, deductible, soldes: { coll: sc, ded: sd }, ex, accBal, anCredit, tvaAcc };
  Object.defineProperty(r, '_tvr', { value: K, configurable: true, writable: true, enumerable: false });
  return K;
}

// ---------- Affichage ----------
const tvrColLabel = (k) => (k === 'exo' ? 'Exo / non imp.' : rateTxt(Number(k)));
const tvrAmt = (v, dec) => (v === null || v === undefined || Math.abs(v) < 0.005 ? '' : eur(v, dec));
function tvrIn(path, ov, auto, label, dec) {
  const o = tvrNum(ov);
  return `<input class="tvr-in${o !== undefined ? ' set' : ''}" inputmode="decimal" data-tvr="${esc(path)}" value="${o === undefined ? '' : esc(String(o).replace('.', ','))}" placeholder="${esc(tvrAmt(auto, dec))}" aria-label="${esc(label)}" title="${o !== undefined ? 'Montant saisi (videz la case pour revenir au calcul)' : auto ? 'Calculé d\'après le FEC : saisissez le montant à retenir' : 'À saisir'}">`;
}
const tvrGap = (v, tol = 1) => `<td class="${Math.abs(v) >= tol ? 'cred' : ''}">${tvrAmt(v) || '0,00'}</td>`;

function viewTvaRevue() {
  const r = ui.fec.result;
  if (!r.cycles || !r.cycles.tva || !Object.keys(r.cycles.tva.months).length) return '<section class="card"><p class="muted">Aucune écriture datée : contrôle de la TVA impossible.</p></section>';
  const K = tvrCalc(r);
  const { recap, collecte: C, enc: E, deductible: D, soldes: S, ex, R, cols } = K;
  const meta = ex.meta;
  const ca3Cols = R.map((rt) => [`b${rt}`, `Base ${rateTxt(rt)}`]).concat(TVR_CA3_OTHER);
  const th = (cells) => `<tr>${cells.map((x) => `<th>${esc(x)}</th>`).join('')}</tr>`;
  const amtRow = (label, vals, cls, sign) => `<tr class="${cls || ''}"><td>${label}</td><td>${sign || ''}</td>${cols.map((k) => `<td>${tvrAmt(vals[k])}</td>`).join('')}<td>${tvrAmt(cols.reduce((t, k) => t + (vals[k] || 0), 0))}</td></tr>`;
  const inRow = (row, label, sign, autoVals, colsList = cols) => `<tr><td>${esc(label)}</td><td>${sign > 0 ? '(+)' : '(−)'}</td>${colsList.map((k) => `<td>${tvrIn(`adj|${row}|${k}`, (ex.adj[row] || {})[k], (autoVals || {})[k], `${label} — ${tvrColLabel(k)}`)}</td>`).join('')}<td></td></tr>`;
  const per = (key) => tvaPeriod(key);
  const arrLabel = moisNom(`${K.arr}-01`);
  const hint = (list, what) => (list.length ? `<p class="muted small">${what} (TTC, d'après le FEC) : ${list.map((h) => `${esc(h.compte)} ${esc(h.lib)} — N-1 ${eur(-h.n1)} €, ${esc(arrLabel)} ${eur(-h.fin)} €`).join(' ; ')}.</p>` : '');
  const roleTxt = (ro) => (typeof ro === 'number' ? rateTxt(ro) : CA_ROLES[ro] || ro);
  const ca3Labels = Object.fromEntries(R.map((rt) => [`b${rt}`, `Base ${rateTxt(rt)}`]).concat(TVR_CA3_OTHER, TVR_CA3_DED, [['report', 'Report crédit'], ['remb', 'Remboursement'], ['add', 'Sommes à ajouter']]));
  const caRoleOpts = Object.assign(Object.fromEntries(TVA_RATES.filter((x) => ![19.6, 7].includes(x)).map((x) => [String(x), rateTxt(x)])), CA_ROLES);

  return `<section class="card tvr">
    <h2>Contrôle de la TVA — exercice ${esc(fmtDate(r.meta.start || r.meta.minDate))} au ${esc(fmtDate(r.meta.closing || r.meta.maxDate))}</h2>
    <p class="muted small">Même déroulé que la feuille de travail TVA : récapitulatif des déclarations, TVA collectée, TVA déductible, soldes après OD. Les montants en gris sont calculés d'après le FEC ; une case saisie remplace le calcul (videz-la pour y revenir). Le taux de chaque compte de produits se choisit dans le tableau des produits (il vaut aussi pour l'onglet TVA de l'espace Mois). Saisies conservées, chiffrées, dans le dossier.</p>
    <div class="tvr-head">
      <label>Arrêté au <select data-tvr="ym">${options(Object.fromEntries(K.months.map((ym) => [ym, `fin ${moisNom(`${ym}-01`)}`])), K.arr)}</select></label>
      <label>Fait par <input data-tvr="meta|fait" value="${esc(meta.fait || '')}" placeholder="initiales"></label>
      <label>Visa du superviseur <input data-tvr="meta|visa" value="${esc(meta.visa || '')}" placeholder="initiales, date"></label>
      <button class="btn" data-action="tvr-export">Exporter en Excel</button>
    </div>
    ${ui.fec.clientId ? '' : '<p class="banner info"><span>FEC non rattaché à un dossier : les saisies ne seront pas conservées. Choisissez le dossier en haut de la page.</span></p>'}
  </section>

  <section class="card tvr">
    <h2>1. Récapitulatif des déclarations <span class="count">${recap.rows.length}</span></h2>
    <p class="muted small">Une ligne par ${K.kind === 'quarter' ? 'trimestre' : 'mois'} ; pré-rempli d'après les OD de TVA comptabilisées (TVA de chaque taux ÷ taux = base, arrondie à l'euro). Importez les déclarations déposées (PDF du formulaire 3310-CA3-SD : copie téléchargée de l'espace professionnel ou édition du logiciel) pour reprendre les montants exacts, ou saisissez-les. TVA collectée, crédit et TVA à payer sont recalculés ; « Écart OD » compare le net calculé à l'OD de TVA passée en comptabilité, le badge CA3 aux lignes 27 et 28 de la déclaration.</p>
    <div class="tvr-head"><label class="btn"><input type="file" accept="application/pdf,.pdf" multiple data-tvr-ca3 class="sr-only">Importer des CA3 (PDF)</label></div>
    ${(tvrState().msg || []).length ? `<ul class="tvr-msg">${tvrState().msg.map((m) => `<li class="${m.ok ? 'ok' : 'bad'}">${esc(m.t)}</li>`).join('')}</ul>` : ''}
    <div class="grid-wrap"><table class="dtable num tvr-t tvr-ca3">
      <thead>${th(['Période', ''].concat(ca3Cols.map(([, l]) => l), ['Total base'], recap.showAdd ? ['Sommes à ajouter'] : [], ['TVA collectée'], TVR_CA3_DED.map(([, l]) => l), ['Report crédit', 'Total TVA déd.', 'TVA à payer', 'Rembours.', 'Crédit à reporter', 'Écart OD']))}</thead>
      <tbody>${recap.rows.map((row) => {
        const inp = (k, auto, dec) => tvrIn(`ca3|${row.key}|${k}`, row.ov[k], auto, `${row.label} — ${ca3Labels[k]}`, dec);
        const c = row.ca3;
        const badge = c ? `<span class="tvr-badge${row.ca3Gap >= 1 ? ' bad' : ''}" title="${esc(`Importée de ${c.file || 'la déclaration'} : ligne 28 TVA nette ${eur(c.l28 || 0, 0)} €, ligne 27 crédit à reporter ${eur(c.l27 || 0, 0)} €${row.ca3Gap >= 1 ? ` ; le calcul donne ${eur(row.due)} € et ${eur(row.credit)} €` : ' : identique au calcul'}`)}">CA3</span>` : '';
        const clear = Object.keys(row.ov).length ? ` <button class="link-btn" data-action="tvr-ca3-clear" data-key="${esc(row.key)}" title="Effacer les montants saisis ou importés de la période" aria-label="Effacer les montants saisis ou importés de ${esc(row.label)}">×</button>` : '';
        return `<tr><td>${esc(row.label)} ${badge}${clear}</td><td>${row.decls ? '<span class="muted small" title="OD de TVA comptabilisée">OD</span>' : ''}</td>
          ${ca3Cols.map(([k]) => `<td>${inp(k, row.auto[k], 0)}</td>`).join('')}
          <td>${tvrAmt(row.base, 0)}</td>${recap.showAdd ? `<td>${inp('add', 0)}</td>` : ''}<td>${tvrAmt(row.coll)}</td>
          ${TVR_CA3_DED.map(([k]) => `<td>${inp(k, row.auto[k])}</td>`).join('')}
          <td>${inp('report', row.auto.report)}</td><td>${tvrAmt(row.dTot)}</td><td>${tvrAmt(row.due)}</td><td>${inp('remb', 0)}</td><td>${tvrAmt(row.credit)}</td>
          ${row.odGap === null ? '<td class="muted small">pas d\'OD</td>' : tvrGap(row.odGap)}</tr>`;
      }).join('')}
      <tr class="strong"><td>Total</td><td></td>${ca3Cols.map(([k]) => `<td>${tvrAmt(recap.tot[k], 0)}</td>`).join('')}<td>${tvrAmt(recap.tot.base, 0)}</td>${recap.showAdd ? `<td>${tvrAmt(recap.tot.add)}</td>` : ''}<td>${tvrAmt(recap.tot.coll)}</td>${TVR_CA3_DED.map(([k]) => `<td>${tvrAmt(recap.tot[k])}</td>`).join('')}<td>${tvrAmt(recap.tot.report)}</td><td>${tvrAmt(recap.tot.dTot)}</td><td>${tvrAmt(recap.tot.due)}</td><td>${tvrAmt(recap.tot.remb)}</td><td>${tvrAmt(recap.tot.credit)}</td><td></td></tr>
      <tr><td>Régul. à déduire (exercice)</td><td>(−)</td>${ca3Cols.map(([k, l]) => `<td>${tvrIn(`adj|rd|${k}`, (ex.adj.rd || {})[k], 0, `Régularisation à déduire — ${l}`, 0)}</td>`).join('')}<td colspan="${recap.showAdd ? 12 : 11}"></td></tr>
      <tr><td>Régul. à ajouter (N-1)</td><td>(+)</td>${ca3Cols.map(([k, l]) => `<td>${tvrIn(`adj|ra|${k}`, (ex.adj.ra || {})[k], 0, `Régularisation à ajouter — ${l}`, 0)}</td>`).join('')}<td colspan="${recap.showAdd ? 12 : 11}"></td></tr>
      <tr class="strong"><td>CA déclaré</td><td></td>${ca3Cols.map(([k]) => `<td>${tvrAmt(recap.caDecl[k], 0)}</td>`).join('')}<td colspan="${recap.showAdd ? 12 : 11}"></td></tr>
      </tbody></table></div>
    <p>TVA collectée déclarée (a) <strong>${eur(recap.tot.coll)} €</strong> · TVA sur le CA déclaré (b) <strong>${eur(recap.tvaCaDecl)} €</strong> · écart (a) − (b) <strong class="${Math.abs(recap.ecart) >= 1 ? 'cred' : ''}">${eur(recap.ecart)} €</strong></p>
  </section>

  <section class="card tvr">
    <h2>2. TVA collectée</h2>
    <h3>Chiffre d'affaires par taux, au ${esc(fmtDate(K.arrEnd))}</h3>
    <div class="grid-wrap"><table class="dtable num tvr-t">
      <thead>${th(['Compte', 'Libellé', 'Taux'].concat(cols.map(tvrColLabel), ['Total']))}</thead>
      <tbody>${C.accounts.filter((x) => x.col !== 'hc').map((x) => `<tr><td>${esc(x.compte)}</td><td class="lbl">${esc(x.lib)}</td>
        <td><select data-tvap="ca" data-c="${esc(x.compte)}" aria-label="Taux du compte ${esc(x.compte)}" class="${x.role === 'sans' ? 'warn' : ''}">${options(caRoleOpts, x.src === 'param' ? String(x.role) : '', x.src === 'param' ? 'automatique' : `auto · ${roleTxt(x.role)}`)}</select></td>
        ${cols.map((k) => `<td>${x.col === k ? tvrAmt(x.amt) : ''}</td>`).join('')}<td>${tvrAmt(x.amt)}</td></tr>`).join('')}
      <tr class="strong"><td colspan="3">Total des produits</td>${cols.map((k) => `<td>${tvrAmt(C.prodTot[k])}</td>`).join('')}<td>${tvrAmt(cols.reduce((t, k) => t + C.prodTot[k], 0))}</td></tr>
      ${TVR_CA_ADJ.map(([row, label, s]) => `<tr><td colspan="2" class="lbl">${esc(label)}</td><td>${s > 0 ? '(+)' : '(−)'}</td>${cols.map((k) => `<td>${tvrIn(`adj|${row}|${k}`, (ex.adj[row] || {})[k], (C.adjAuto[row] || {})[k], `${label} — ${tvrColLabel(k)}`)}</td>`).join('')}<td></td></tr>`).join('')}
      <tr class="strong"><td colspan="3">Total CA HT</td>${cols.map((k) => `<td>${tvrAmt(C.caHt[k])}</td>`).join('')}<td>${tvrAmt(cols.reduce((t, k) => t + C.caHt[k], 0))}</td></tr>
      </tbody></table></div>
    ${C.accounts.some((x) => x.col === 'hc') ? `<p class="muted small">Comptes hors champ, non retenus : ${C.accounts.filter((x) => x.col === 'hc').map((x) => `${esc(x.compte)} ${esc(x.lib)} (${eur(x.amt)} €)`).join(', ')}. À changer dans l'onglet TVA (espace Mois) s'ils sont soumis à la TVA.</p>` : ''}
    <p class="muted small">Les écritures d'inventaire reconnues sont retirées d'office ; les lignes suivantes ne se remplissent que pour celles que le FEC ne permet pas de reconnaître.</p>

    <h3>Contrôle en bases</h3>
    <div class="grid-wrap"><table class="dtable num tvr-t">
      <thead>${th(['', ''].concat(R.map((rt) => rateTxt(rt)), ['Total']))}</thead>
      <tbody>
        <tr class="strong"><td>TVA collectée sur le CA (A)</td><td></td>${R.map((rt) => `<td>${tvrAmt(C.theo[rt])}</td>`).join('')}<td>${tvrAmt(R.reduce((t, rt) => t + C.theo[rt], 0))}</td></tr>
        <tr><td>Solde des comptes de TVA collectée au ${esc(fmtDate(K.arrEnd))}</td><td></td>${R.map((rt) => `<td>${tvrAmt(C.bRows.solde[rt])}</td>`).join('')}<td></td></tr>
        <tr><td>À-nouveaux</td><td>(+/−)</td>${R.map((rt) => `<td>${tvrAmt(C.bRows.an[rt])}</td>`).join('')}<td></td></tr>
        <tr><td>OD de TVA (déclarations)</td><td>(+)</td>${R.map((rt) => `<td>${tvrAmt(C.bRows.od[rt])}</td>`).join('')}<td></td></tr>
        <tr><td>OD de différence de lettrage</td><td>(+/−)</td>${R.map((rt) => `<td>${tvrIn(`adj|diffLet|${rt}`, (ex.adj.diffLet || {})[rt], 0, `OD de différence de lettrage — ${rateTxt(rt)}`)}</td>`).join('')}<td></td></tr>
        <tr class="strong"><td>TVA collectée comptabilisée (B)</td><td></td>${R.map((rt) => `<td>${tvrAmt(C.compta[rt])}</td>`).join('')}<td>${tvrAmt(R.reduce((t, rt) => t + C.compta[rt], 0))}</td></tr>
        <tr class="strong"><td>Écart (A) − (B)</td><td></td>${R.map((rt) => tvrGap(C.ecart[rt])).join('')}${tvrGap(R.reduce((t, rt) => t + C.ecart[rt], 0))}</tr>
      </tbody></table></div>
    ${C.noRate.length ? `<p class="banner info"><span>Comptes de TVA collectée sans taux, non répartis : ${C.noRate.map((a) => `${esc(a.compte)} ${esc(a.lib)}`).join(', ')}. Indiquez leur taux dans l'onglet TVA (Paramétrage des comptes) s'ils portent de la TVA sur les ventes.</span></p>` : ''}

    <h3>TVA sur les encaissements</h3>
    <p class="muted small">Encaissements = CA HT ± créances et avances clients de début et de fin de période (HT), comparés au CA déclaré. ${{
      ok: `Créances et avances calculées d'après le lettrage des comptes clients (${Math.round((E.lettered || 0) * 100)} % des factures lettrées) : factures non réglées à la date, ventilées par leurs comptes de produits ; règlements non encore affectés en avances ; à-nouveaux répartis au prorata des factures du client.`,
      lettrage: `Lettrage des comptes clients insuffisant (${Math.round((E.lettered || 0) * 100)} % des factures lettrées) : créances à saisir, ou à importer d'une liste de factures non réglées.`,
      trop: 'Trop de lignes clients pour le calcul d\'après le lettrage : créances à saisir, ou à importer d\'une liste de factures non réglées.',
      absent: 'Pas de factures clients dans le FEC : créances à saisir, ou à importer d\'une liste de factures non réglées.',
    }[E.cli]} Avances des comptes 419 dont le libellé donne le taux (« pas de TVA » en non imposable). Soldes du FEC rappelés sous le tableau.</p>
    <div class="tvr-head">
      <label>Liste de factures non réglées <select data-tvr="factFor">${options({ cre: `au ${fmtDate(K.arrEnd)} (créances de fin)`, cre1: "à l'ouverture (créances N-1)" }, tvrState().factFor || 'cre')}</select></label>
      <label class="btn"><input type="file" accept=".xlsx,.csv,.txt" data-tvr-fact class="sr-only">Importer (Excel, CSV)</label>
    </div>
    ${(tvrState().msgF || []).length ? `<ul class="tvr-msg">${tvrState().msgF.map((m) => `<li class="${m.ok ? 'ok' : 'bad'}">${esc(m.t)}</li>`).join('')}</ul>` : ''}
    <div class="grid-wrap"><table class="dtable num tvr-t">
      <thead>${th(['', ''].concat(cols.map(tvrColLabel), ['Total']))}</thead>
      <tbody>
        ${amtRow('Total CA HT', C.caHt, 'strong')}
        ${TVR_ENC.map(([row, label, s]) => inRow(row, label, s, E.auto[row])).join('')}
        ${amtRow('Encaissements HT', E.tot, 'strong')}
        ${amtRow('CA déclaré', E.decl)}
        <tr class="strong"><td>Écart (base à déclarer)</td><td></td>${cols.map((k) => tvrGap(E.ecart[k])).join('')}${tvrGap(cols.reduce((t, k) => t + E.ecart[k], 0))}</tr>
        <tr class="strong"><td>Écart (TVA à déclarer)</td><td></td>${cols.map((k) => tvrGap(E.tva[k])).join('')}${tvrGap(cols.reduce((t, k) => t + E.tva[k], 0))}</tr>
      </tbody></table></div>
    ${hint(E.hints.cre, 'Créances clients')}${hint(E.hints.av, 'Avances clients')}${hint(E.hints.dout, 'Créances douteuses')}${hint(E.hints.eff, 'Effets à recevoir')}
    ${E.hints.att.length ? `<p class="muted small">TVA collectée non exigible comptabilisée (TVA des factures non encore encaissées selon le lettrage) : ${E.hints.att.map((h) => `${esc(h.compte)} ${esc(h.lib)} — N-1 ${eur(h.n1)} €, ${esc(arrLabel)} ${eur(h.fin)} €${h.rate ? ` (soit ${eur((h.fin * 100) / h.rate)} € HT)` : ''}`).join(' ; ')}.</p>` : ''}
  </section>

  <section class="card tvr">
    <h2>3. TVA déductible — ${esc(per(K.P).label)}</h2>
    <p class="muted small">Soldes des comptes de TVA déductible au ${esc(fmtDate(K.arrEnd))}, avant l'OD de TVA de la période, moins la TVA des prestations de services non encore réglées (déductible au paiement).</p>
    <div class="grid-wrap"><table class="dtable num tvr-t tvr-narrow"><tbody>
      <tr><td>TVA déductible sur acquisitions intracommunautaires</td><td>${tvrAmt(D.intra) || '0,00'}</td></tr>
      <tr><td>TVA déductible sur immobilisations</td><td>${tvrAmt(D.immo) || '0,00'}</td></tr>
      <tr><td>TVA déductible sur autres biens et services</td><td>${tvrAmt(D.abs) || '0,00'}</td></tr>
      ${Math.abs(D.att) >= 0.005 ? `<tr><td>TVA déductible sur encaissements (non exigible)</td><td>${tvrAmt(D.att)}</td></tr>` : ''}
      <tr><td>Report de crédit de TVA</td><td>${tvrAmt(D.report) || '0,00'}</td></tr>
      <tr class="strong"><td>Total TVA déductible</td><td>${tvrAmt(D.total) || '0,00'}</td></tr>
      <tr><td>− TVA non déductible sur prestations non réglées (annexe)</td><td>${tvrAmt(D.nonDed.abs + D.nonDed.immo) || '0,00'}</td></tr>
      <tr class="strong"><td>Total TVA déductible exigible</td><td>${tvrAmt(D.exigible) || '0,00'}</td></tr>
      <tr><td>dont acquisitions intracommunautaires</td><td>${tvrAmt(D.intra) || '0,00'}</td></tr>
      <tr><td>dont immobilisations</td><td>${tvrAmt(D.immo - D.nonDed.immo) || '0,00'}</td></tr>
      ${D.declared === null ? '' : `<tr><td>Déduite par l'OD de TVA de la période (report compris)</td><td>${tvrAmt(D.declared) || '0,00'}</td></tr><tr class="strong"><td>Écart</td>${tvrGap(round2(D.exigible - D.declared))}</tr>`}
    </tbody></table></div>
    <h3>Annexe — fournisseurs créditeurs au ${esc(fmtDate(K.arrEnd))} <span class="count">${D.frs.length}</span></h3>
    <p class="muted small">Cochez les prestations de services : leur TVA ne se déduit qu'au paiement. Cochées d'office quand les factures du fournisseur sont surtout des services (comptes 61, 62…) ; taux le plus fréquent de ses factures. Choix conservés pour les contrôles suivants.</p>
    ${D.frs.length ? `<div class="grid-wrap"><table class="dtable num tvr-t tvr-frs">
      <thead>${th(['Compte', 'Fournisseur', 'Solde TTC', 'Services', 'Taux', 'TVA non déductible'])}</thead>
      <tbody>${D.frs.map((x) => `<tr class="${x.serv ? '' : 'muted'}"><td>${esc(x.num)}</td><td>${esc(x.lib)}${x.racine === '404' ? ' <span class="muted small">(immobilisations)</span>' : ''}</td><td>${tvrAmt(x.solde)}</td>
        <td><label class="check inline"><input type="checkbox" data-tvr="frs-s|${esc(x.key)}"${x.serv ? ' checked' : ''}><span class="sr-only">Prestations de services : ${esc(x.lib)}</span></label>${x.auto && x.sv !== null && x.sv !== undefined ? `<span class="muted small" title="Part des services dans ses factures">${Math.round(x.sv * 100)} %</span>` : ''}</td>
        <td><select data-tvr="frs-r|${esc(x.key)}" aria-label="Taux de TVA : ${esc(x.lib)}">${options(Object.fromEntries([20, 10, 5.5, 2.1, 8.5].map((t) => [String(t), rateTxt(t)])), String(x.rate))}</select></td><td>${tvrAmt(x.tva)}</td></tr>`).join('')}
      <tr class="strong"><td colspan="5">TVA non déductible sur prestations non réglées</td><td>${tvrAmt(D.nonDed.abs + D.nonDed.immo) || '0,00'}</td></tr></tbody></table></div>` : '<p class="muted">Aucun fournisseur créditeur à cette date.</p>'}
  </section>

  <section class="card tvr">
    <h2>4. Contrôle des soldes de TVA après OD</h2>
    <h3>TVA collectée</h3>
    <p class="muted small">Créances et avances de fin de période reprises de la TVA sur les encaissements ; solde réel des comptes de TVA collectée de chaque taux après l'OD de la période.</p>
    <div class="grid-wrap"><table class="dtable num tvr-t">
      <thead>${th(['', ''].concat(R.map((rt) => `HT ${rateTxt(rt)}`)))}</thead>
      <tbody>
        ${TVR_FIN.map(([row, label, s]) => `<tr><td>${esc(label)}</td><td>${s > 0 ? '(+)' : '(−)'}</td>${S.coll.map((x) => `<td>${tvrAmt(x.parts[row])}</td>`).join('')}</tr>`).join('')}
        <tr class="strong"><td>Total HT (créances − avances + douteuses + effets)</td><td></td>${S.coll.map((x) => `<td>${tvrAmt(x.ht) || '0,00'}</td>`).join('')}</tr>
        <tr><td>Solde théorique du compte de TVA collectée</td><td></td>${S.coll.map((x) => `<td>${tvrAmt(x.theo) || '0,00'}</td>`).join('')}</tr>
        <tr><td>Solde réel (créditeur) après OD</td><td></td>${S.coll.map((x) => `<td>${tvrAmt(x.reel) || '0,00'}</td>`).join('')}</tr>
        <tr class="strong"><td>Écart</td><td></td>${S.coll.map((x) => tvrGap(x.ecart)).join('')}</tr>
        <tr><td>Base HT correspondante</td><td></td>${S.coll.map((x) => `<td>${tvrAmt(x.base) || '0,00'}</td>`).join('')}</tr>
      </tbody></table></div>
    <h3>TVA déductible</h3>
    <div class="grid-wrap"><table class="dtable num tvr-t tvr-narrow">
      <thead>${th(['', 'Biens et services', 'Immobilisations'])}</thead>
      <tbody>
        <tr><td>Solde théorique (TVA des prestations non réglées)</td>${S.ded.map((x) => `<td>${tvrAmt(x.theo) || '0,00'}</td>`).join('')}</tr>
        <tr><td>Solde réel (débiteur) après OD</td>${S.ded.map((x) => `<td>${tvrAmt(x.reel) || '0,00'}</td>`).join('')}</tr>
        <tr class="strong"><td>Écart</td>${S.ded.map((x) => tvrGap(x.ecart)).join('')}</tr>
        <tr><td>Base HT à 20 %</td>${S.ded.map((x) => `<td>${tvrAmt(x.base) || '0,00'}</td>`).join('')}</tr>
      </tbody></table></div>
  </section>

  ${tvrOdCard(r, K)}

  <section class="card tvr">
    <h2>Remarques</h2>
    <textarea data-tvr="meta|notes" rows="4" aria-label="Remarques" placeholder="Écarts expliqués, régularisations à passer…">${esc(meta.notes || '')}</textarea>
  </section>`;
}

function tvrOdCard(r, K) {
  const o = K.ex.od || {};
  const items = tvrOdItems(r, K);
  const seuil = tvrNum(o.seuil) !== undefined ? tvrNum(o.seuil) : 10;
  return `<section class="card tvr">
    <h2>5. OD de régularisation proposée <span class="count">${items.filter((x) => x.on).length}</span></h2>
    <p class="muted small">Une écriture par écart des soldes de TVA après OD (partie 4) : le compte de TVA est ramené à son solde théorique. Contrepartie : écart d'arrondi (charge 658 ou produit 758) sous le seuil, sinon TVA à régulariser (4458) à reprendre sur la prochaine déclaration. Cochez, changez la contrepartie au besoin, puis exportez pour ACD ou Pennylane (format FEC, Excel ou CSV).</p>
    <div class="tvr-head">
      <label>Seuil de l'écart d'arrondi <input class="tvr-in" inputmode="decimal" data-tvr="od|seuil" value="${esc(o.seuil === undefined ? '' : String(o.seuil).replace('.', ','))}" placeholder="10,00"></label>
      <label>Journal <input data-tvr="od|journal" value="${esc(o.journal || '')}" placeholder="OD" size="6"></label>
      <label>Date <input type="date" data-tvr="od|date" value="${esc(o.date || K.arrEnd)}"></label>
    </div>
    ${items.length ? `<div class="grid-wrap"><table class="dtable num tvr-t">
      <thead><tr><th>Passer</th><th>Écart</th><th>Montant</th><th>Compte de TVA</th><th>Contrepartie</th><th>Compte</th></tr></thead>
      <tbody>${items.map((x) => `<tr class="${x.on ? '' : 'muted'}">
        <td><label class="check inline"><input type="checkbox" data-tvr="od-on|${esc(x.id)}"${x.on ? ' checked' : ''}><span class="sr-only">Passer : ${esc(x.label)}</span></label></td>
        <td class="lbl">${esc(x.what)}</td><td>${eur(x.amt)}</td>
        <td>${esc(x.tva)} <span class="muted small">${x.side === 'D' ? 'débit' : 'crédit'}</span></td>
        <td><select data-tvr="od-kind|${esc(x.id)}" aria-label="Contrepartie : ${esc(x.what)}">${options({ arrondi: "Écart d'arrondi (658 / 758)", regul: 'TVA à régulariser (4458)' }, x.kind)}</select></td>
        <td><input class="tvr-in" data-tvr="od-cpt|${esc(x.id)}" value="${esc(x.cp === x.auto ? '' : x.cp)}" placeholder="${esc(x.auto)}" aria-label="Compte de contrepartie : ${esc(x.what)}"></td></tr>`).join('')}</tbody></table></div>
    <div class="tvr-head"><button class="btn" data-action="tvr-od-export" data-kind="fec">Exporter (format FEC)</button><button class="btn" data-action="tvr-od-export" data-kind="xlsx">Excel</button><button class="btn" data-action="tvr-od-export" data-kind="csv">CSV</button></div>`
    : '<p class="muted">Aucun écart sur les soldes de TVA après OD : pas d\'écriture à passer.</p>'}
    <p class="muted small">Écarts sous ${eur(seuil)} € : écart d'arrondi, cochés d'office. Au-delà, l'écriture n'est pas cochée : vérifiez d'abord la cause (créances et avances, déclaration, saisie), puis cochez-la si elle est justifiée.</p>
  </section>`;
}

function onTvrChange(t) {
  const path = t.dataset.tvr;
  if (path === 'ym') { tvrState().ym = t.value; return tvrRedraw(); }
  if (path === 'factFor') { tvrState().factFor = t.value; return; }
  const { root, ex } = tvrStore();
  const [kind, a, b] = path.split('|');
  if (kind === 'meta') ex.meta[a] = t.value.trim();
  else if (kind === 'od' || kind === 'od-on' || kind === 'od-kind' || kind === 'od-cpt') {
    const od = (ex.od = ex.od || {});
    const key = path.slice(kind.length + 1);
    if (kind === 'od') {
      if (a === 'seuil') { const v = tvrParse(t.value); if (v === undefined) delete od.seuil; else od.seuil = v; }
      else if (a === 'journal') od.journal = t.value.trim().toUpperCase().slice(0, 6);
      else if (a === 'date') od.date = t.value;
    } else {
      const it = ((od.items = od.items || {})[key] = od.items[key] || {});
      if (kind === 'od-on') it.on = t.checked;
      else if (kind === 'od-kind') { it.kind = t.value; delete it.cpt; }
      else { const v = t.value.trim().toUpperCase(); if (!v) delete it.cpt; else if (/^[1-7][0-9A-Z]{2,19}$/.test(v)) it.cpt = v; else { toast('Numéro de compte invalide.', true); return; } }
    }
  }
  else if (kind === 'frs-s' || kind === 'frs-r') {
    const key = path.slice(kind.length + 1);
    const o = (root.frs[key] = root.frs[key] || {});
    if (kind === 'frs-s') o.s = t.checked; else o.r = Number(t.value);
  } else if (kind === 'ca3' || kind === 'adj') {
    const v = tvrParse(t.value);
    if (v === undefined && t.value.trim()) { toast('Montant non reconnu.', true); return; }
    const store = kind === 'ca3' ? ex.ca3 : ex.adj;
    const o = (store[a] = store[a] || {});
    if (v === undefined) delete o[b]; else o[b] = v;
    if (!Object.keys(o).length) delete store[a];
  }
  if (clientById(ui.fec.clientId)) persist();
  if (kind !== 'meta') tvrRedraw();
}
// Redessine en gardant la case suivante (tabulation), le défilement de la page et celui des tableaux
function tvrRedraw() {
  setTimeout(() => {
    const a = document.activeElement;
    const next = a && a.dataset ? a.dataset.tvr : undefined;
    const y = window.scrollY;
    const xs = $$('.tvr .grid-wrap').map((el) => el.scrollLeft);
    refresh();
    $$('.tvr .grid-wrap').forEach((el, i) => { if (xs[i]) el.scrollLeft = xs[i]; });
    window.scrollTo(0, y);
    const el = next && $(`[data-tvr="${CSS.escape(next)}"]`);
    if (el) { el.focus({ preventScroll: true }); if (el.select) el.select(); }
  }, 0);
}

// Synthèse du contrôle pour le portefeuille : écarts en valeur absolue (TVA, en euros), à partir de 1 €
function tvrSummary(r, K) {
  const abs = (list) => round2(list.reduce((t, v) => t + Math.abs(v || 0), 0));
  const rows = K.recap.rows.filter((x) => x.odGap !== null);
  const od = abs(rows.map((x) => x.odGap));
  const noOd = K.recap.rows.filter((x) => x.odGap === null && x.base).length;
  const bases = abs(K.R.map((rt) => K.collecte.ecart[rt]));
  const enc = K.enc.cli === 'ok' ? abs(K.R.map((rt) => K.enc.tva[rt])) : null;
  const ded = K.deductible.declared === null ? null : round2(Math.abs(K.deductible.exigible - K.deductible.declared));
  const soldes = abs(K.soldes.coll.map((x) => x.ecart).concat(K.soldes.ded.map((x) => x.ecart)));
  const odItems = tvrOdItems(r, K).length;
  const ca3 = K.recap.rows.filter((x) => x.ca3).length;
  const total = round2(od + bases + (enc || 0) + (ded || 0) + soldes);
  return { arr: K.arr, periods: K.recap.rows.length, od, noOd, bases, enc, ded, soldes, odItems, ca3, total, ecart: [od, bases, enc || 0, ded || 0, soldes].some((v) => v >= 1) };
}

// ---------- OD de régularisation ----------
// Une ligne par écart des soldes de TVA après OD : le compte de TVA est ramené à son solde théorique, contre un compte
// d'écart d'arrondi (658 / 758) sous le seuil, sinon contre la TVA à régulariser (4458) à reprendre sur la prochaine
// déclaration. Chaque ligne se coche, et sa contrepartie se change.
function tvrOdItems(r, K) {
  const o = K.ex.od || {};
  const seuil = tvrNum(o.seuil) !== undefined ? tvrNum(o.seuil) : 10;
  const regul = (r.balance.find((b) => /^4458(0*)$/.test(b.compte)) || {}).compte || '4458'.padEnd(acctLen(r), '0');
  const label = (what) => `Régularisation ${what} au ${fmtDate(K.arrEnd)}`;
  const raw = [];
  K.soldes.coll.forEach((x) => { if (Math.abs(x.ecart) >= 0.01 && K.tvaAcc.coll[x.rate]) raw.push({ id: `coll|${x.rate}`, what: `TVA collectée ${rateTxt(x.rate)}`, tva: K.tvaAcc.coll[x.rate], side: x.ecart > 0 ? 'C' : 'D', amt: Math.abs(x.ecart) }); });
  K.soldes.ded.forEach((x) => { const acc = K.tvaAcc[x.k]; if (Math.abs(x.ecart) >= 0.01 && acc) raw.push({ id: `ded|${x.k}`, what: x.k === 'abs' ? 'TVA déductible sur biens et services' : 'TVA déductible sur immobilisations', tva: acc, side: x.ecart > 0 ? 'D' : 'C', amt: Math.abs(x.ecart) }); });
  return raw.map((x) => {
    const it = (o.items || {})[x.id] || {};
    const kind = it.kind || (x.amt < seuil ? 'arrondi' : 'regul');
    // Contrepartie au sens opposé du compte de TVA : charge (658) au débit, produit (758) au crédit
    const cpSide = x.side === 'D' ? 'C' : 'D';
    const auto = kind === 'regul' ? regul : acctOf(r, cpSide === 'D' ? '658' : '758');
    const cp = it.cpt || auto;
    const amt = round2(x.amt);
    const lines = [{ compte: x.tva, d: x.side === 'D' ? amt : 0, c: x.side === 'C' ? amt : 0, lib: label(x.what) }, { compte: cp, d: cpSide === 'D' ? amt : 0, c: cpSide === 'C' ? amt : 0, lib: label(x.what) }];
    // Cochée d'office sous le seuil seulement : un écart plus important se vérifie avant d'être passé
    return Object.assign(x, { amt, kind, cp, auto, on: it.on !== undefined ? !!it.on : amt < seuil, label: label(x.what), lines });
  });
}
function tvrOdEntries(r, K) {
  const o = K.ex.od || {};
  const date = o.date || K.arrEnd;
  return tvrOdItems(r, K).filter((x) => x.on).map((x, i) => ({ num: i + 1, piece: `TVA${String(i + 1).padStart(3, '0')}`, date, label: x.label, lines: x.lines }));
}
async function tvrOdExport(kind) {
  const r = ui.fec.result;
  const K = tvrCalc(r);
  const entries = tvrOdEntries(r, K);
  if (!entries.length) { toast('Aucune écriture cochée.', true); return; }
  const ok = await ask({ title: 'Fichier non chiffré', message: "Le fichier d'écritures contient des montants du dossier <strong>non chiffrés</strong>. Importez-le dans votre logiciel (écritures à vérifier avant validation), puis supprimez-le.", okLabel: 'Exporter' });
  if (!ok) return;
  const journal = ((K.ex.od || {}).journal || 'OD').toUpperCase().slice(0, 6);
  const base = `od-tva-${r.meta.siren || 'dossier'}-${K.arr}`;
  const amt = (v) => (v ? v.toFixed(2).replace('.', ',') : '0,00');
  const clean = (x) => String(x || '').replace(/[\t\r\n;]+/g, ' ');
  if (kind === 'fec') {
    const rows = [['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise'].join('\t')];
    entries.forEach((e) => { const d = e.date.replace(/-/g, ''); e.lines.forEach((l) => rows.push([journal, 'Opérations diverses', e.num, d, l.compte, clean(acctLib(r, l.compte)), '', '', e.piece, d, clean(l.lib), amt(l.d), amt(l.c), '', '', '', '', ''].join('\t'))); });
    download(`${base}.txt`, rows.join('\r\n') + '\r\n', 'text/plain;charset=utf-8');
  } else {
    const list = [];
    entries.forEach((e) => e.lines.forEach((l) => list.push([journal, fmtDate(e.date), e.piece, l.compte, '', '', acctLib(r, l.compte), l.lib, l.d, l.c])));
    if (kind === 'xlsx') {
      const t = (v, st) => ({ v, s: st === undefined ? 2 : st });
      const rows = [ECR_COLS.map((c) => t(c, 1))].concat(list.map((x) => x.slice(0, 8).map((v) => t(v)).concat([{ v: x[8], s: 8 }, { v: x[9], s: 8 }])));
      const blob = XlsxWriter.build({ sheets: [{ name: 'Écritures', rows, widths: [9, 12, 10, 12, 14, 26, 30, 50, 14, 14], freeze: { row: 1 } }] });
      download(`${base}.xlsx`, blob, blob.type);
    } else {
      const a = (v) => (v ? v.toFixed(2).replace('.', ',') : '');
      const q = (v) => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
      download(`${base}.csv`, '\ufeff' + [ECR_COLS.join(';')].concat(list.map((x) => x.slice(0, 8).concat([a(x[8]), a(x[9])]).map(q).join(';'))).join('\r\n') + '\r\n', 'text/csv;charset=utf-8');
    }
  }
  const c = clientById(ui.fec.clientId);
  if (c) { log(c.id, `OD de régularisation de TVA exportée (${entries.length} écriture(s), format ${kind.toUpperCase()}).`, true); persist(); }
}

// ---------- Import des CA3 déposées ----------
// Lignes du formulaire → colonnes du récapitulatif. La base des lignes de taux comprend les autoliquidations (A3, B2,
// B4), reportées à part ; la TVA déductible de la ligne 20 comprend celle des acquisitions intracommunautaires (17).
function tvrCa3Map(L, file) {
  const v = (c, i = 0) => (L[c] && L[c][i] !== undefined ? L[c][i] : 0);
  const ov = {};
  Object.entries(Ca3Pdf.RATE_LINES).forEach(([c, rt]) => { if (L[c]) ov[`b${rt}`] = round2((ov[`b${rt}`] || 0) + v(c, 0)); });
  const acq = round2(v('A3') + v('B2') + v('B4'));
  ov.acq = acq;
  if (acq && (ov.b20 || 0) >= acq) ov.b20 = round2(ov.b20 - acq);
  ov.exp = v('E1');
  ov.exo = round2(v('E2') + v('E3') + v('E4') + v('E5') + v('E6'));
  ov.lic = v('F2');
  const abs = round2(v('20') + v('21')), intra = v('17');
  ov.dImmo = v('19');
  ov.dIntra = intra && intra <= abs ? intra : 0;
  ov.dAbs = round2(abs - ov.dIntra);
  ov.report = round2(v('22') + v('2C'));
  ov.remb = v('26');
  ov.add = round2(v('15') + v('5B'));
  ov._ca3 = { file, l16: v('16'), l23: v('23'), l25: v('25'), l27: v('27'), l28: v('28'), l32: v('32') };
  return ov;
}
async function tvrImportCa3(files) {
  const st = tvrState();
  const r = ui.fec.result;
  const K = tvrCalc(r);
  const { ex } = tvrStore();
  st.msg = [];
  for (const file of Array.from(files || [])) {
    try {
      const decls = Ca3Pdf.parse(await PdfReader.read(await file.arrayBuffer()), PdfReader);
      if (!decls.length) { st.msg.push({ ok: false, t: `${file.name} : aucune déclaration CA3 reconnue (PDF scanné ou mise en page non reconnue).` }); continue; }
      decls.forEach((d) => {
        const where = `${file.name}${decls.length > 1 ? ` (page ${d.pages.join(', ')})` : ''}`;
        if (d.siren && r.meta.siren && d.siren !== r.meta.siren) { st.msg.push({ ok: false, t: `${where} : SIREN ${d.siren}, différent de celui du FEC (${r.meta.siren}) ; non importée.` }); return; }
        if (!d.key) { st.msg.push({ ok: false, t: `${where} : ${d.warnings.join(' ; ') || 'période non reconnue'} ; non importée.` }); return; }
        const quarterly = d.key.includes('T');
        if (quarterly !== (K.kind === 'quarter')) { st.msg.push({ ok: false, t: `${where} : déclaration ${quarterly ? 'trimestrielle' : 'mensuelle'}, alors que les OD de TVA du dossier sont ${K.kind === 'quarter' ? 'trimestrielles' : 'mensuelles'} ; non importée.` }); return; }
        if (!tvaPeriod(d.key).months.some((ym) => K.months.includes(ym))) { st.msg.push({ ok: false, t: `${where} : ${tvaPeriod(d.key).label}, hors de l'exercice du FEC ; non importée.` }); return; }
        ex.ca3[d.key] = Object.assign({}, ex.ca3[d.key] || {}, tvrCa3Map(d.lines, file.name));
        st.msg.push({ ok: true, t: `${where} : ${tvaPeriod(d.key).label} importée${d.key > tvaPeriod(perOfKind(K.kind, K.arr)).key ? ' (après le mois d\'arrêté : visible en le reculant)' : ''}.` });
      });
    } catch (e) {
      st.msg.push({ ok: false, t: `${file.name} : ${e.message || e}` });
    }
  }
  if (clientById(ui.fec.clientId)) persist();
  tvrRedraw();
}
// ---------- Liste de factures non réglées (export du logiciel de facturation) ----------
// Colonnes reconnues par leur intitulé : n° de facture, date, HT, TVA, TTC, reste dû, taux, statut, HT ou TVA par taux.
// Reste dû (ou TTC des factures non payées d'après le statut ; toutes, sans l'un ni l'autre) ventilé en HT par taux.
const TVR_FACT_COLS = [
  ['htR', /\b(ht|base|hors tax\w*)\b.*?(\d+(?:[.,]\d+)?)\s*%/], ['tvaR', /\b(tva|taxe)\b.*?(\d+(?:[.,]\d+)?)\s*%/], ['taux', /taux/],
  ['reste', /reste|restant|solde|\bdu\b|a regler|a payer|non regle|impaye|encours|en cours/], ['ttc', /ttc|toutes taxes|net a payer|montant total|^total$/],
  ['ht', /\bht\b|hors tax/], ['tva', /\btva\b|\btaxes?\b/], ['date', /^date|date (de )?(la )?facture|date d.?emission/],
  ['num', /n[°o]|numero|^facture$|reference|^piece/], ['statut', /statut|etat|paiement|regle/],
];
function tvrAmount(t) {
  let x = String(t || '').replace(/[\s\u00a0\u202f€]/g, '');
  if (!x) return null;
  if (/,\d+$/.test(x)) x = x.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, '');
  else x = x.replace(/,/g, '');
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
const tvrIso = (t) => { const m = String(t || '').match(/^(\d{4})-(\d{2})-(\d{2})|^(\d{2})[/.-](\d{2})[/.-](\d{4})/); return !m ? '' : m[1] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[6]}-${m[5]}-${m[4]}`; };
async function tvrImportFactures(file) {
  const st = tvrState();
  const which = st.factFor || 'cre';
  const r = ui.fec.result;
  const K = tvrCalc(r);
  const { ex } = tvrStore();
  st.msgF = [];
  try {
    const book = await SheetReader.read(file);
    const rows = ((book.sheets || [])[0] || {}).rows || [];
    const txt = (c) => (c && c.text !== undefined ? String(c.text) : '').trim();
    // Ligne d'en-tête : la première qui nomme au moins deux colonnes connues, dont un montant
    let hi = -1, map = null;
    for (let i = 0; i < Math.min(rows.length, 20) && hi < 0; i++) {
      const m = { htR: [], tvaR: [] };
      rows[i].forEach((c, j) => {
        const h = norm(txt(c));
        if (!h) return;
        for (const [k, re] of TVR_FACT_COLS) {
          const mm = h.match(re);
          if (!mm) continue;
          if (k === 'htR' || k === 'tvaR') m[k].push([j, parseFloat(mm[2].replace(',', '.'))]);
          else if (m[k] === undefined) m[k] = j;
          break;
        }
      });
      if (['reste', 'ttc', 'ht'].some((k) => m[k] !== undefined) || m.htR.length) { hi = i; map = m; }
    }
    if (hi < 0) throw new Error('colonnes non reconnues (il faut au moins un montant HT, TTC ou reste dû, avec son intitulé)');
    const R = K.R, def = R[0] || 20;
    const out = {};
    let n = 0, total = 0, guessed = 0, skipped = 0;
    const cell = (row, k) => (map[k] === undefined ? null : tvrAmount(txt(row[map[k]])));
    rows.slice(hi + 1).forEach((row) => {
      const first = norm(row.slice(0, 3).map(txt).join(' '));
      if (/\btotal\b/.test(first)) return;
      const date = map.date !== undefined ? tvrIso(txt(row[map.date])) : '';
      if (date && (which === 'cre' ? date > K.arrEnd : date >= `${K.months[0]}-01`)) { skipped++; return; }
      // HT par taux de la facture
      let hts = {};
      if (map.htR.length) map.htR.forEach(([j, rt]) => { const v = tvrAmount(txt(row[j])); if (v) hts[rt] = (hts[rt] || 0) + v; });
      else if (map.tvaR.length) map.tvaR.forEach(([j, rt]) => { const v = tvrAmount(txt(row[j])); if (v && rt) hts[rt] = (hts[rt] || 0) + (v * 100) / rt; });
      const ht = cell(row, 'ht'), tva = cell(row, 'tva'), ttc = cell(row, 'ttc');
      if (!Object.keys(hts).length) {
        let rt = map.taux !== undefined ? tvrAmount(txt(row[map.taux]).replace('%', '')) : null;
        if (rt !== null && rt > 0 && rt < 1) rt = round2(rt * 100);
        if (rt === null && ht && tva !== null) rt = Math.abs(tva) < 0.005 ? 0 : snapRate(ht, tva);
        if (rt === null && ht && ttc) rt = snapRate(ht, ttc - ht);
        if (rt === null) { rt = def; if (ht || ttc) guessed++; }
        const base = ht !== null ? ht : ttc !== null ? ttc / (1 + rt / 100) : null;
        if (base) hts[rt] = base;
      }
      const ttcCalc = Object.entries(hts).reduce((t, [rt, v]) => t + v * (1 + Number(rt) / 100), 0);
      const full = ttc !== null ? ttc : ttcCalc;
      if (!full) return;
      let due = map.reste !== undefined ? cell(row, 'reste') : null;
      if (due === null && map.statut !== undefined) {
        const s2 = norm(txt(row[map.statut]));
        due = /(non|im)\s?pay|attente|a payer|retard|partiel|ouvert|due?\b/.test(s2) ? full : /pay|regl|sold|encaiss/.test(s2) ? 0 : full;
      }
      if (due === null) due = full;
      if (!due) return;
      n++;
      total += due;
      Object.entries(hts).forEach(([rt, v]) => { const k = Number(rt) === 0 ? 'exo' : R.includes(Number(rt)) ? String(Number(rt)) : 'exo'; out[k] = (out[k] || 0) + (v * due) / full; });
    });
    if (!n) throw new Error('aucune facture non réglée trouvée');
    ex.adj[which] = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, round2(v)]));
    (ex.factSrc = ex.factSrc || {})[which] = { file: file.name, n, total: round2(total) };
    st.msgF.push({ ok: true, t: `${file.name} : ${n} facture(s) non réglée(s), ${eur(total)} € TTC, reportées en ${which === 'cre' ? `créances clients au ${fmtDate(K.arrEnd)}` : 'créances clients N-1'} (HT par taux).${skipped ? ` ${skipped} facture(s) ${which === 'cre' ? "postérieure(s) à l'arrêté" : "de l'exercice"} écartée(s).` : ''}${guessed ? ` Taux non indiqué pour ${guessed} facture(s) : ${rateTxt(def)} retenu.` : ''}${map.reste === undefined && map.statut === undefined ? ' Ni reste dû ni statut : toutes les factures de la liste sont comptées comme non réglées.' : ''}` });
  } catch (e) {
    st.msgF.push({ ok: false, t: `${file.name} : ${e.message || e}` });
  }
  if (clientById(ui.fec.clientId)) persist();
  tvrRedraw();
}

const perOfKind = (kind, ym) => (kind === 'quarter' ? quarterOf(ym) : ym);
function tvrClearPeriod(key) {
  const { ex } = tvrStore();
  delete ex.ca3[key];
  if (clientById(ui.fec.clientId)) persist();
  tvrRedraw();
}

// Export Excel : une feuille par partie, valeurs calculées et saisies
async function tvrExport() {
  const r = ui.fec.result;
  const K = tvrCalc(r);
  const ok = await ask({ title: 'Fichier non chiffré', message: 'Le classeur contient le chiffre d\'affaires, la TVA et les soldes fournisseurs du dossier <strong>non chiffrés</strong>.', okLabel: 'Exporter' });
  if (!ok) return;
  const { recap, collecte: C, enc: E, deductible: D, soldes: S, R, cols, ex } = K;
  const t = (v, s) => ({ v: v === undefined || v === null ? '' : v, s: s === undefined ? 2 : s });
  const n = (v, s) => ({ v: round2(Number(v) || 0), s: s || 8 });
  const H = (cells) => cells.map((x) => t(x, 1));
  const c = clientById(ui.fec.clientId);
  const head = (title) => [[{ v: title, s: 10 }], [t(c ? clientLabel(c) : r.meta.fileName, 0)],
    [t(`Exercice du ${fmtDate(r.meta.start || r.meta.minDate)} au ${fmtDate(r.meta.closing || r.meta.maxDate)} · arrêté au ${fmtDate(K.arrEnd)}`, 0)],
    [t(`Fait par : ${ex.meta.fait || ''}`, 0), t(`Visa : ${ex.meta.visa || ''}`, 0)], []];
  const ca3Cols = R.map((rt) => [`b${rt}`, `Base ${rateTxt(rt)}`]).concat(TVR_CA3_OTHER);
  const rec = head('Récapitulatif des déclarations de TVA').concat([H(['Période'].concat(ca3Cols.map(([, l]) => l), ['Total base', 'Sommes à ajouter', 'TVA collectée'], TVR_CA3_DED.map(([, l]) => l), ['Report crédit', 'Total TVA déd.', 'TVA à payer', 'Remboursement', 'Crédit à reporter', 'Écart OD', 'Source']))]);
  recap.rows.forEach((row) => rec.push([t(row.label)].concat(ca3Cols.map(([k]) => n(k[0] === 'b' ? row.bases[Number(k.slice(1))] : row.v[k])), [n(row.base), n(row.v.add), n(row.coll)], TVR_CA3_DED.map(([k]) => n(row.v[k])), [n(row.report), n(row.dTot), n(row.due), n(row.remb), n(row.credit), row.odGap === null ? t('pas d\'OD') : n(row.odGap),
    t(row.ca3 ? `CA3 importée (${row.ca3.file || ''})${row.ca3Gap >= 1 ? ' : écart avec les lignes 27 / 28' : ''}` : Object.keys(row.ov).length ? 'saisie' : row.decls ? 'OD de TVA' : '')])));
  rec.push([t('Total', 1)].concat(ca3Cols.map(([k]) => n(recap.tot[k], 9)), [n(recap.tot.base, 9), n(recap.tot.add, 9), n(recap.tot.coll, 9)], TVR_CA3_DED.map(([k]) => n(recap.tot[k], 9)), [n(recap.tot.report, 9), n(recap.tot.dTot, 9), n(recap.tot.due, 9), n(recap.tot.remb, 9), n(recap.tot.credit, 9)]));
  [['rd', 'Régul. à déduire (exercice)'], ['ra', 'Régul. à ajouter (N-1)']].forEach(([k, l]) => rec.push([t(l)].concat(ca3Cols.map(([ck]) => n(tvrNum((ex.adj[k] || {})[ck]) || 0)))));
  rec.push([t('CA déclaré', 1)].concat(ca3Cols.map(([k]) => n(recap.caDecl[k], 9))));
  rec.push([], [t('TVA collectée déclarée (a)', 1), n(recap.tot.coll, 9)], [t('TVA sur le CA déclaré (b)', 1), n(recap.tvaCaDecl, 9)], [t('Écart (a) − (b)', 1), n(recap.ecart, 9)]);

  const colH = cols.map(tvrColLabel);
  const sumC = (vals) => cols.reduce((x, k) => x + (vals[k] || 0), 0);
  const coll = head('TVA collectée').concat([H(['Compte', 'Libellé', 'Taux'].concat(colH, ['Total']))]);
  C.accounts.filter((x) => x.col !== 'hc').forEach((x) => coll.push([t(x.compte), t(x.lib), t(x.col === 'exo' ? (CA_ROLES[x.role] || x.role) : rateTxt(Number(x.col)))].concat(cols.map((k) => (x.col === k ? n(x.amt) : t(''))), [n(x.amt)])));
  coll.push([t('Total des produits', 1), t(''), t('')].concat(cols.map((k) => n(C.prodTot[k], 9)), [n(sumC(C.prodTot), 9)]));
  const adjV = (row, k) => { const o = tvrNum((ex.adj[row] || {})[k]); return o !== undefined ? o : (C.adjAuto[row] || {})[k] || 0; };
  TVR_CA_ADJ.forEach(([row, label, s]) => coll.push([t(label), t(''), t(s > 0 ? '(+)' : '(−)')].concat(cols.map((k) => n(adjV(row, k))))));
  coll.push([t('Total CA HT', 1), t(''), t('')].concat(cols.map((k) => n(C.caHt[k], 9)), [n(sumC(C.caHt), 9)]), []);
  coll.push([t('Contrôle en bases', 1), t(''), t('')].concat(R.map((rt) => t(rateTxt(rt), 1))));
  [['TVA collectée sur le CA (A)', C.theo], [`Solde des comptes de TVA collectée au ${fmtDate(K.arrEnd)}`, C.bRows.solde], ['À-nouveaux', C.bRows.an], ['OD de TVA (déclarations)', C.bRows.od],
    ['OD de différence de lettrage', C.bRows.diff], ['TVA collectée comptabilisée (B)', C.compta], ['Écart (A) − (B)', C.ecart]].forEach(([l, vals]) => coll.push([t(l), t(''), t('')].concat(R.map((rt) => n(vals[rt])))));
  coll.push([], [t('TVA sur les encaissements', 1), t(''), t('')].concat(H(colH)));
  const encV = (row, k) => { const o = tvrNum((ex.adj[row] || {})[k]); return o !== undefined ? o : (E.auto[row] || {})[k] || 0; };
  coll.push([t('Total CA HT'), t(''), t('')].concat(cols.map((k) => n(C.caHt[k]))));
  TVR_ENC.forEach(([row, label, s]) => coll.push([t(label), t(''), t(s > 0 ? '(+)' : '(−)')].concat(cols.map((k) => n(encV(row, k))))));
  [['Encaissements HT', E.tot], ['CA déclaré', E.decl], ['Écart (base à déclarer)', E.ecart], ['Écart (TVA à déclarer)', E.tva]].forEach(([l, vals]) => coll.push([t(l, 1), t(''), t('')].concat(cols.map((k) => n(vals[k], 9)))));

  const ded = head(`TVA déductible — ${tvaPeriod(K.P).label}`).concat([
    [t('TVA déductible sur acquisitions intracommunautaires'), n(D.intra)], [t('TVA déductible sur immobilisations'), n(D.immo)], [t('TVA déductible sur autres biens et services'), n(D.abs)],
    [t('TVA déductible sur encaissements (non exigible)'), n(D.att)], [t('Report de crédit de TVA'), n(D.report)], [t('Total TVA déductible', 1), n(D.total, 9)],
    [t('− TVA non déductible sur prestations non réglées'), n(D.nonDed.abs + D.nonDed.immo)], [t('Total TVA déductible exigible', 1), n(D.exigible, 9)],
    [t('dont acquisitions intracommunautaires'), n(D.intra)], [t('dont immobilisations'), n(D.immo - D.nonDed.immo)]]
    .concat(D.declared === null ? [] : [[t("Déduite par l'OD de TVA de la période"), n(D.declared)], [t('Écart', 1), n(D.exigible - D.declared, 9)]]),
    [[], H(['Compte', 'Fournisseur', 'Solde TTC', 'Services', 'Taux', 'TVA non déductible'])],
    D.frs.map((x) => [t(x.num), t(x.lib), n(x.solde), t(x.serv ? 'Oui' : 'Non'), t(rateTxt(x.rate)), n(x.tva)]));
  const sol = head('Contrôle des soldes de TVA après OD').concat([H(['TVA collectée'].concat(R.map((rt) => `HT ${rateTxt(rt)}`)))],
    TVR_FIN.map(([row, label, s2]) => [t(`${label} ${s2 > 0 ? '(+)' : '(−)'}`)].concat(S.coll.map((x) => n(x.parts[row])))),
    [['Total HT (créances − avances + douteuses + effets)', 'ht'], ['Solde théorique', 'theo'], ['Solde réel (créditeur) après OD', 'reel'], ['Écart', 'ecart'], ['Base HT correspondante', 'base']].map(([l, k]) => [t(l)].concat(S.coll.map((x) => n(x[k])))),
    [[], H(['TVA déductible', 'Biens et services', 'Immobilisations'])],
    [['Solde théorique (TVA des prestations non réglées)', 'theo'], ['Solde réel (débiteur) après OD', 'reel'], ['Écart', 'ecart'], ['Base HT à 20 %', 'base']].map(([l, k]) => [t(l)].concat(S.ded.map((x) => n(x[k])))),
    [[], [t('Remarques', 1)], [t(ex.meta.notes || '')]]);
  const odRows = [H(ECR_COLS)];
  tvrOdEntries(r, K).forEach((e) => e.lines.forEach((l) => odRows.push([t((ex.od || {}).journal || 'OD'), t(fmtDate(e.date)), t(e.piece), t(l.compte), t(''), t(''), t(acctLib(r, l.compte)), t(l.lib), n(l.d), n(l.c)])));
  const wide = [44, 14].concat(Array(20).fill(14));
  const blob = XlsxWriter.build({ sheets: [
    { name: 'Récapitulatif CA3', rows: rec, widths: [22].concat(Array(24).fill(13)) },
    { name: 'TVA collectée', rows: coll, widths: [14, 40, 10].concat(Array(12).fill(14)) },
    { name: 'TVA déductible', rows: ded, widths: [50, 34, 14, 10, 10, 16] },
    { name: 'Contrôle des soldes', rows: sol, widths: wide },
    { name: 'OD de régularisation', rows: odRows, widths: [9, 12, 10, 12, 14, 20, 30, 50, 14, 14] },
  ] });
  const base = (c ? clientLabel(c) : r.meta.siren || 'dossier').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '');
  download(`controle-tva-${base}-${K.arr}.xlsx`, blob, blob.type);
}
