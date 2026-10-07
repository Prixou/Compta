/*
 * Suivi Dossiers — Contrôle de la TVA (déclaration mensuelle ou trimestrielle).
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- Contrôle de la TVA ----------
// Tout part des comptes, comme dans le logiciel de production :
// - TVA de la période = mouvements des comptes de TVA des écritures de la période, hors écritures de déclaration
//   (OD de TVA) et de paiement ;
// - chiffre d'affaires par taux = mouvements des comptes de produits rattachés à ce taux ;
// - la nature des comptes et les taux sont déduits des numéros, des libellés et des écritures, et se corrigent dans
//   « Paramétrage des comptes » (conservé, chiffré, dans le dossier).
// Les montants affichés se retrouvent donc dans la balance ou le grand livre du logiciel pour la même période.

const QUARTER_NAMES = ['1er', '2e', '3e', '4e'];
const rateTxt = (r) => `${String(r).replace('.', ',')} %`;
const TVA_RATES = [20, 10, 5.5, 2.1, 8.5, 13, 0.9, 1.05, 19.6, 7];
const TVA_ROLES = {
  coll: 'TVA collectée', 'coll-att': 'TVA collectée non exigible (encaissements)', autoliq: 'TVA autoliquidée due',
  ded: 'TVA déductible biens et services', 'ded-immo': 'TVA déductible immobilisations', credit: 'Crédit de TVA à reporter',
  due: 'TVA à décaisser', remb: 'Remboursement de crédit demandé', acompte: 'Acomptes de TVA (CA12)', regul: 'TVA à régulariser (non déclarée)', autre: 'Non pris en compte',
};
const CA_ROLES = { export: 'Exportation (ligne 04)', intra: 'Livraison intracommunautaire (ligne 06)', exo: 'Non imposable ou exonéré (ligne 05)', hc: 'Hors champ (non déclaré)', sans: 'À qualifier' };
// Ligne de la CA3 (formulaire 3310-CA3) de chaque taux ; 2,1 % en métropole : taux particulier, annexe 3310 A.
const CA3_RATE_LINE = { 20: '08', 5.5: '09', 10: '9B', 8.5: '10', 2.1: '14', 13: '14', 0.9: '14', 1.05: '14', 19.6: '13', 7: '13' };

// Période : « 2025-06 » (mois) ou « 2025-T2 » (trimestre).
function tvaPeriod(key) {
  const q = key.match(/^(\d{4})-T([1-4])$/);
  if (q) {
    const y = q[1], n = Number(q[2]);
    const months = [1, 2, 3].map((k) => `${y}-${pad((n - 1) * 3 + k)}`);
    return { key, kind: 'quarter', months, label: `${QUARTER_NAMES[n - 1]} trimestre ${y}`, exercice: `T${n} ${y}`, start: `${months[0]}-01`, end: endOfMonth(`${months[2]}-01`) };
  }
  return { key, kind: 'month', months: [key], label: moisNom(`${key}-01`), exercice: `${key.slice(5)}/${key.slice(0, 4)}`, start: `${key}-01`, end: endOfMonth(`${key}-01`) };
}
const quarterOf = (ym) => `${ym.slice(0, 4)}-T${Math.ceil(Number(ym.slice(5, 7)) / 3)}`;
const periodKeys = (T, kind) => Array.from(new Set(Object.keys(T.months).sort().map((ym) => (kind === 'quarter' ? quarterOf(ym) : ym))));

function tvaRegime() {
  const c = clientById(ui.fec.clientId);
  return c ? tvaShort(c.regimeTva) : '';
}

function tvaState() {
  const f = ui.fec;
  const T = f.result.cycles && f.result.cycles.tva;
  if (!f.tvaCtl && T) {
    const months = Object.keys(T.months).sort();
    // Période du mois affiché dans l'espace « Mois »
    let ym = fecMonth();
    if (!T.months[ym]) ym = months[months.length - 1];
    const kind = tvaRegime() === 'T' ? 'quarter' : 'month';
    f.tvaCtl = { kind, key: kind === 'quarter' ? quarterOf(ym) : ym };
  }
  return f.tvaCtl;
}

// ---------- Nature des comptes ----------

// Taux indiqué dans un libellé (« TVA collectée 5,5 % », « Ventes 20% »). `strict` : le libellé doit parler de TVA ou de taux.
function rateOfLabel(lib, strict) {
  const t = norm(lib);
  if (strict && !/%|tva|taux|\btx\b/.test(t)) return null;
  const m = t.match(/(?:^|[^\d,.])(19[,.]60?|2[,.]10?|5[,.]50?|8[,.]50?|1[,.]05|0[,.]90?|20|10|13|7)(?:[,.]0+)?\s*(?:%|$|[^\d,.])/);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}
// Taux correspondant à une TVA et une base, aux arrondis près.
function snapRate(base, vat) {
  if (Math.abs(base) < 0.01) return null;
  for (const r of TVA_RATES) if (Math.abs(vat - (base * r) / 100) <= Math.max(0.05, Math.abs(base) * 0.0015)) return r;
  return null;
}

function defaultVatRole(compte, lib) {
  const t = norm(lib);
  if (compte.startsWith('4457')) return /attente|encaiss|non exigible|differe|a regulariser/.test(t) ? 'coll-att' : 'coll';
  if (compte.startsWith('44567')) return 'credit';
  if (compte.startsWith('44562')) return 'ded-immo';
  if (compte.startsWith('4456')) return 'ded';
  if (compte.startsWith('4452')) return 'autoliq';
  if (compte.startsWith('4455')) return 'due';
  if (compte.startsWith('44583')) return 'remb';
  if (compte.startsWith('44581')) return 'acompte';
  if (compte.startsWith('4458')) return 'regul';
  return 'autre';
}
const RE_CA_EXPORT = /export|hors ?(ue|cee|union|communaut)|pays tiers/;
const RE_CA_INTRA = /intra|communautaire|union europ|livraisons? (ue|europe)/;
const RE_CA_EXO = /exon|non soumis|non assujet|non imposable|franchise|art\.? ?(26[1-3]|293)|\bdebours\b|taux zero|sans tva|0 ?%/;
const RE_CA_HC = /hors champ|subvention|rosp|remuneration sur objectif|forfait|indemnit|refactur.*debours/;

// Paramètres du dossier : nature et taux corrigés par l'utilisateur (le reste est automatique).
function tvaParams() {
  const c = clientById(ui.fec.clientId);
  if (c) return (c.tvaParams = c.tvaParams || { acc: {}, ca: {} });
  return (ui.fec.tvaParams = ui.fec.tvaParams || { acc: {}, ca: {} });
}

// ---------- Modèle : comptes, écritures, déclarations ----------

function tvaModel(r) {
  const T = r.cycles.tva;
  const P = tvaParams();
  const sig = JSON.stringify(P) + '|' + (ui.fec.clientId || '');
  if (r._tvaM && r._tvaM.sig === sig) return r._tvaM;
  const acc = {};
  Object.entries(T.accs).forEach(([c, a]) => {
    const o = P.acc[c] || {};
    const role = o.role || defaultVatRole(c, a.lib);
    const lr = rateOfLabel(a.lib, false);
    acc[c] = { compte: c, lib: a.lib, an: a.an, role, rate: o.rate !== undefined && o.rate !== '' ? Number(o.rate) : /^(coll|coll-att|autoliq)$/.test(role) ? lr : null, auto: !P.acc[c] };
  });
  const roleOf = (c) => (acc[c] ? acc[c].role : 'autre');
  const isColl = (c) => /^coll/.test(roleOf(c));

  // Nature de chaque écriture : opération, déclaration (OD de TVA) ou paiement
  const groups = T.g.map(([date, ref, piece, lib, m, p5, fl]) => {
    let due = false, collD = false, collC = false, dedC = false, dedD = false, autoD = false, has70 = false;
    Object.entries(m).forEach(([c, v]) => {
      if (c.startsWith('70')) { has70 = true; return; }
      if (!c.startsWith('445')) return;
      const ro = roleOf(c);
      if (ro === 'due' || ro === 'credit' || ro === 'remb') due = true;
      else if (ro === 'coll' || ro === 'coll-att') { if (v > 0) collD = true; else collC = true; }
      else if (ro === 'ded' || ro === 'ded-immo') { if (v < 0) dedC = true; else dedD = true; }
      else if (ro === 'autoliq' && v > 0) autoD = true;
    });
    let kind = 'op';
    if (!has70 && due && (collD || dedC || autoD)) kind = 'decl';
    else if (!has70 && collD && dedC && !(fl & 1)) kind = 'decl'; // déclaration et paiement dans la même écriture
    else if (due && Math.abs(p5) >= 0.01 && !collD && !collC && !dedC && !dedD) kind = 'pay';
    return { date, ym: date.slice(0, 7), ref, piece, lib, m, p5, kind };
  });

  // Taux des comptes de produits constatés sur les écritures (base × taux = TVA)
  const votes = {};
  const vote = (c, rt) => { const v = (votes[c] = votes[c] || {}); v[rt] = (v[rt] || 0) + 1; };
  groups.forEach((g) => {
    if (g.kind !== 'op') return;
    const caL = Object.entries(g.m).filter(([c]) => c[0] === '7').map(([c, v]) => [c, -v]);
    const vatL = Object.entries(g.m).filter(([c]) => isColl(c)).map(([c, v]) => [c, -v]);
    if (!caL.length || !vatL.length) return;
    const rates = new Set(vatL.map(([c]) => acc[c].rate));
    const baseT = caL.reduce((t, [, v]) => t + v, 0), vatT = vatL.reduce((t, [, v]) => t + v, 0);
    if (rates.size === 1 && !rates.has(null)) {
      const rt = [...rates][0];
      if (snapRate(baseT, vatT) === rt) caL.forEach(([c]) => vote(c, rt));
      else caL.forEach(([c, b]) => { if (vatL.some(([, v]) => snapRate(b, v) === rt)) vote(c, rt); });
    } else if (!rates.has(null)) {
      caL.forEach(([c, b]) => { const hit = vatL.find(([vc, v]) => snapRate(b, v) === acc[vc].rate); if (hit) vote(c, acc[hit[0]].rate); });
    } else {
      const rt = snapRate(baseT, vatT);
      if (rt !== null) caL.forEach(([c]) => vote(c, rt));
    }
  });
  const nvBy = {};
  T.nv.forEach(([, , , , m]) => Object.keys(m).forEach((c) => { if (c.startsWith('70')) nvBy[c] = (nvBy[c] || 0) + 1; }));
  const ca = {};
  Object.entries(T.ca).forEach(([c, a]) => {
    const o = P.ca[c];
    const v = votes[c] || {};
    const n = Object.values(v).reduce((t, x) => t + x, 0);
    const best = Object.entries(v).sort((x, y) => y[1] - x[1])[0];
    const voted = best && best[1] >= Math.max(1, n * 0.8) ? Number(best[0]) : null;
    const lr = rateOfLabel(a.lib, true);
    const t = norm(a.lib);
    let role, src;
    if (o !== undefined && o !== '') { role = /^[\d.]+$/.test(String(o)) ? Number(o) : o; src = 'param'; }
    else if (voted !== null) { role = voted; src = 'ecritures'; }
    else if (lr !== null && c.startsWith('70')) { role = lr; src = 'libelle'; }
    else if (!c.startsWith('70')) { role = n ? (best ? Number(best[0]) : 'hc') : 'hc'; src = n ? 'ecritures' : 'auto'; }
    else if (RE_CA_EXPORT.test(t)) { role = 'export'; src = 'libelle'; }
    else if (RE_CA_INTRA.test(t)) { role = 'intra'; src = 'libelle'; }
    else if (RE_CA_HC.test(t)) { role = 'hc'; src = 'libelle'; }
    else if (RE_CA_EXO.test(t)) { role = 'exo'; src = 'libelle'; }
    else { role = 'sans'; src = 'auto'; }
    ca[c] = { compte: c, lib: a.lib, role, src, votes: v, nVotes: n, labelRate: lr, nv: nvBy[c] || 0 };
  });
  const caRate = (c) => (ca[c] && typeof ca[c].role === 'number' ? ca[c].role : null);

  // Mouvements par mois et par compte de TVA : opérations, déclarations, paiements
  const mv = {};
  groups.forEach((g) => {
    const M = (mv[g.ym] = mv[g.ym] || {});
    Object.entries(g.m).forEach(([c, v]) => {
      if (!c.startsWith('445')) return;
      const x = (M[c] = M[c] || { op: 0, decl: 0, pay: 0 });
      x[g.kind] += v;
    });
  });
  const decls = groups.filter((g) => g.kind === 'decl').map((g) => {
    const s = (fn) => round2(Object.entries(g.m).filter(([c]) => c.startsWith('445') && fn(roleOf(c))).reduce((t, [, v]) => t + v, 0));
    return (g.decl = Object.assign({}, g, {
      coll: s((ro) => ro === 'coll'), ded: -s((ro) => ro === 'ded'), dedImmo: -s((ro) => ro === 'ded-immo'), auto: s((ro) => ro === 'autoliq'),
      due: -s((ro) => ro === 'due'), creditMove: s((ro) => ro === 'credit'),
      remb: -s((ro) => ro === 'remb'), pay: round2(-g.p5), other: round2(Object.entries(g.m).filter(([c]) => !c.startsWith('445')).reduce((t, [, v]) => t + v, 0)),
    }));
  });
  const pays = groups.filter((g) => g.kind === 'pay').map((g) => Object.assign({}, g, { amt: round2(-g.p5) }));
  // Périodicité des déclarations comptabilisées : mensuelle si au moins 60 % des mois ont la leur
  const nMonths = Object.keys(T.months).length;
  const freq = decls.length ? (decls.length >= nMonths * 0.6 ? 'month' : 'quarter') : null;
  const model = { sig, T, acc, ca, caRate, roleOf, groups, mv, decls, pays, freq, assign: {} };
  Object.defineProperty(r, '_tvaM', { value: model, configurable: true, writable: true, enumerable: false });
  return model;
}

// Opérations d'une période (mouvements hors déclarations et paiements) : TVA par nature et par taux, CA par compte.
function tvaOps(M, per) {
  const o = { coll: 0, collRate: {}, collNoRate: 0, att: 0, auto: 0, ded: 0, dedImmo: 0, regul: 0, other: 0, ca: {}, months: 0 };
  per.months.forEach((ym) => {
    if (M.T.months[ym]) o.months++;
    Object.entries(M.mv[ym] || {}).forEach(([c, x]) => {
      const a = M.acc[c] || { role: 'autre' };
      const v = x.op;
      if (a.role === 'coll') { o.coll -= v; if (a.rate) o.collRate[a.rate] = (o.collRate[a.rate] || 0) - v; else o.collNoRate -= v; }
      else if (a.role === 'coll-att') o.att -= v;
      else if (a.role === 'autoliq') o.auto -= v;
      else if (a.role === 'ded') o.ded += v;
      else if (a.role === 'ded-immo') o.dedImmo += v;
      else if (a.role === 'regul') o.regul += v;
      else if (a.role === 'autre') o.other += v;
    });
    Object.entries(M.T.ca7[ym] || {}).forEach(([c, v]) => { o.ca[c] = (o.ca[c] || 0) + v; });
  });
  ['coll', 'collNoRate', 'att', 'auto', 'ded', 'dedImmo', 'regul', 'other'].forEach((k) => { o[k] = round2(o[k]); });
  Object.keys(o.collRate).forEach((k) => { o.collRate[k] = round2(o.collRate[k]); });
  Object.keys(o.ca).forEach((k) => { o.ca[k] = round2(o.ca[k]); });
  return o;
}

// Rattachement des écritures de déclaration aux périodes : celle dont la TVA des opérations est la plus proche,
// parmi les périodes qui se terminent entre 75 jours avant et 12 jours après la date de l'écriture.
function tvaAssign(M, kind) {
  if (M.assign[kind]) return M.assign[kind];
  const keys = periodKeys(M.T, kind);
  const ops = {};
  keys.forEach((k) => { ops[k] = tvaOps(M, tvaPeriod(k)); });
  const by = {};
  M.decls.forEach((d) => {
    let best = null;
    keys.forEach((k) => {
      const per = tvaPeriod(k);
      if (d.date < addDays(per.end, -12) || d.date > addDays(per.end, 75)) return;
      const o = ops[k];
      const score = Math.abs(d.coll - o.coll) + Math.abs(d.ded + d.dedImmo - o.ded - o.dedImmo) + Math.abs(d.auto - o.auto);
      const dist = Math.abs(daysUntilFrom(per.end, d.date));
      if (!best || score < best.score - 0.5 || (Math.abs(score - best.score) <= 0.5 && dist < best.dist)) best = { k, score, dist };
    });
    if (best) { (d.per = d.per || {})[kind] = best.k; (by[best.k] = by[best.k] || []).push(d); }
  });
  return (M.assign[kind] = { by, ops });
}

// Calcul complet d'une période : opérations, déclaration comptabilisée, soldes, CA par taux, brouillon CA3.
function tvaCalc(r, per) {
  const M = tvaModel(r);
  const A = tvaAssign(M, per.kind);
  const o = A.ops[per.key] || tvaOps(M, per);
  // Déclarations comptabilisées d'une autre périodicité (ex. mensuelles vues par trimestre) : pas de rapprochement.
  const freqOk = !M.freq || M.freq === per.kind;
  const own = freqOk ? A.by[per.key] || [] : [];
  const sum = (k) => round2(own.reduce((t, d) => t + d[k], 0));
  const liq = own.length ? { list: own, date: own[own.length - 1].date, coll: sum('coll'), ded: sum('ded'), dedImmo: sum('dedImmo'), auto: sum('auto'), due: sum('due'), creditMove: sum('creditMove'), remb: sum('remb'), pay: sum('pay'), other: sum('other') } : null;

  // Comptes de TVA : solde d'ouverture, opérations, déclarations et paiements de la période, solde de fin
  const before = Object.keys(M.mv).filter((ym) => ym < per.months[0]);
  const accounts = Object.values(M.acc).map((a) => {
    const x = { compte: a.compte, lib: a.lib, role: a.role, rate: a.rate, start: a.an, op: 0, decl: 0, pay: 0 };
    before.forEach((ym) => { const y = M.mv[ym][a.compte]; if (y) x.start += y.op + y.decl + y.pay; });
    per.months.forEach((ym) => { const y = (M.mv[ym] || {})[a.compte]; if (y) { x.op += y.op; x.decl += y.decl; x.pay += y.pay; } });
    ['start', 'op', 'decl', 'pay'].forEach((k) => { x[k] = round2(x[k]); });
    x.end = round2(x.start + x.op + x.decl + x.pay);
    return x;
  }).filter((x) => x.start || x.op || x.decl || x.pay || x.end).sort((a, b) => a.compte.localeCompare(b.compte));

  // Soldes avant la déclaration de la période (déclarations des périodes précédentes passées) : reliquats
  const hasDecl = M.decls.length > 0 && freqOk;
  const later = (d) => !!(d.per && d.per[per.kind]) && tvaPeriod(d.per[per.kind]).start >= per.start;
  const balEnd = (role) => {
    let t = 0;
    Object.values(M.acc).filter((a) => a.role === role).forEach((a) => { t += a.an; });
    M.groups.forEach((g) => {
      if (g.date > per.end || (g.kind === 'decl' && later(g.decl))) return;
      Object.entries(g.m).forEach(([c, v]) => { if (c.startsWith('445') && M.roleOf(c) === role) t += v; });
    });
    return round2(t);
  };
  const solde = hasDecl ? { coll: -balEnd('coll'), ded: balEnd('ded') + balEnd('ded-immo'), auto: -balEnd('autoliq') } : null;
  const rel = solde ? { coll: round2(solde.coll - o.coll), ded: round2(solde.ded - o.ded - o.dedImmo), auto: round2(solde.auto - o.auto) } : { coll: 0, ded: 0, auto: 0 };
  // Crédit de la déclaration précédente (ligne 22) : solde débiteur du compte de crédit avant la déclaration de la période
  const report = freqOk ? Math.max(0, balEnd('credit')) : 0;
  if (liq) {
    // Crédit imputé et crédit reporté par l'OD de TVA (le crédit disponible est imputé en totalité, comme sur la CA3)
    liq.creditUsed = report > 0 ? report : Math.max(0, -liq.creditMove);
    liq.creditNew = round2(liq.creditMove + liq.creditUsed);
    if (liq.creditNew < -0.005) Object.assign(liq, { creditUsed: round2(-liq.creditMove), creditNew: 0 });
  }

  // Chiffre d'affaires par taux et rapprochement avec la TVA collectée
  const byRate = {}, nonTax = {};
  const caRows = Object.entries(o.ca).filter(([, v]) => Math.abs(v) >= 0.01).map(([c, v]) => Object.assign({ base: v }, M.ca[c] || { compte: c, lib: '', role: 'hc' }));
  caRows.forEach((x) => {
    if (typeof x.role === 'number') {
      const y = (byRate[x.role] = byRate[x.role] || { base: 0, base70: 0, base7: 0, n: 0 });
      y.base += x.base; y.n++;
      if (x.compte.startsWith('70')) y.base70 += x.base; else y.base7 += x.base;
    } else nonTax[x.role] = (nonTax[x.role] || 0) + x.base;
  });
  const ratedAcc = Object.keys(o.collRate).length > 0 && Math.abs(o.collNoRate) < 0.01;
  const rates = Array.from(new Set(Object.keys(byRate).map(Number).concat(Object.keys(o.collRate).map(Number)))).sort((a, b) => b - a);
  const rapp = rates.map((rt) => {
    const b = byRate[rt] || { base: 0, base70: 0, base7: 0 };
    const theo = round2((b.base * rt) / 100);
    const compta = ratedAcc ? round2(o.collRate[rt] || 0) : null;
    return { rate: rt, base: round2(b.base), base70: round2(b.base70), base7: round2(b.base7), theo, compta, ecart: compta === null ? null : round2(compta - theo) };
  });
  const theoTotal = round2(rapp.reduce((t, x) => t + x.theo, 0));

  // Brouillon de CA3 (opérations de la période)
  const brute = round2(o.coll + o.auto);
  const dedTot = round2(o.ded + o.dedImmo + report);
  const net = round2(brute - dedTot);
  const rows = [];
  const base01 = round2(Object.values(byRate).reduce((t, x) => t + x.base70, 0));
  const base02 = round2(Object.values(byRate).reduce((t, x) => t + x.base7, 0));
  rows.push({ h: 'A. Montant des opérations réalisées' });
  rows.push({ line: '01', label: 'Ventes, prestations de services', base: base01 });
  if (base02) rows.push({ line: '02', label: 'Autres opérations imposables', base: base02 });
  if (o.auto) rows.push({ line: '2A / 03', label: 'Achats autoliquidés (services ligne 2A, biens ligne 03) — base estimée au taux de 20 %', base: round2(o.auto / 0.2) });
  if (nonTax.export) rows.push({ line: '04', label: 'Exportations hors Union européenne', base: round2(nonTax.export) });
  if (nonTax.exo) rows.push({ line: '05', label: 'Autres opérations non imposables', base: round2(nonTax.exo) });
  if (nonTax.intra) rows.push({ line: '06', label: 'Livraisons intracommunautaires', base: round2(nonTax.intra) });
  if (nonTax.sans) rows.push({ line: '?', label: 'Produits sans taux défini (à qualifier dans le paramétrage)', base: round2(nonTax.sans), warn: true });
  rows.push({ h: 'B. Décompte de la TVA à payer' });
  rapp.forEach((x) => rows.push({ line: CA3_RATE_LINE[x.rate] || '14', label: `Taux ${rateTxt(x.rate)}${x.rate === 2.1 ? ' (taux particulier, annexe 3310 A)' : ''}${ratedAcc ? '' : ' — TVA théorique'}`, base: x.base, tva: ratedAcc ? x.compta : x.theo }));
  const otherColl = ratedAcc ? 0 : round2(o.coll - theoTotal);
  if (Math.abs(otherColl) >= 0.01) rows.push({ line: '', label: 'Écart entre la TVA comptabilisée et la TVA théorique des ventes', tva: otherColl, warn: Math.abs(otherColl) >= 1 });
  if (o.auto) rows.push({ line: '', label: 'TVA autoliquidée', tva: o.auto });
  rows.push({ line: '16', label: 'Total de la TVA brute due', tva: brute, strong: true });
  rows.push({ line: '19', label: 'TVA déductible sur immobilisations', tva: o.dedImmo });
  rows.push({ line: '20', label: 'TVA déductible sur autres biens et services', tva: o.ded });
  if (report) rows.push({ line: '22', label: 'Report du crédit de la déclaration précédente', tva: report });
  rows.push({ line: '23', label: 'Total de la TVA déductible', tva: dedTot, strong: true });
  rows.push(net >= 0 ? { line: '28', label: 'TVA nette due', tva: net, strong: true } : { line: '25 / 27', label: 'Crédit de TVA (à reporter ou à rembourser)', tva: -net, strong: true });
  const draft = { rows, brute, ded: dedTot, net, taxable: round2(base01 + base02) };

  // Paiement : règlement de la TVA à décaisser dans les 70 jours suivant la fin de la période
  const due = liq ? liq.due : 0;
  const payC = M.pays.filter((p) => p.date > per.end && p.date <= addDays(per.end, 70) && (!liq || p.date >= liq.date));
  const pay = due > 0 ? payC.slice().sort((a, b) => Math.abs(a.amt - due) - Math.abs(b.amt - due))[0] || (liq && liq.pay ? { date: liq.date, amt: liq.pay, ref: liq.list[0].ref, lib: liq.list[0].lib } : null) : null;

  return { M, per, o, liq, accounts, solde, rel, report, rapp, ratedAcc, theoTotal, caRows, nonTax, draft, pay, due, freqOk };
}

// Montants télédéclarés saisis par l'utilisateur (conservés, chiffrés, dans le dossier).
function tvaDeclStore() {
  const c = clientById(ui.fec.clientId);
  if (c) return (c.tvaDecl = c.tvaDecl || {});
  return (ui.fec.tvaDecl = ui.fec.tvaDecl || {});
}

// Montants télédéclarés d'une période ; à défaut de net saisi ici, le montant noté dans la mission TVA du dossier.
function declOf(key) {
  const d = Object.assign({}, tvaDeclStore()[key]);
  if (d.net === '' || d.net === undefined) {
    const m = tvaMissionOf(ui.fec.clientId, tvaPeriod(key).exercice);
    if (tvaNetSet(m) && m.tvaNetSrc !== 'fec') Object.assign(d, { net: m.tvaNet, fromMission: true });
  }
  return d;
}

// Écritures de vente de la période dont la TVA ne correspond pas aux taux des comptes de produits.
function rateExamples(K) {
  const { M, per } = K;
  const out = [];
  M.groups.forEach((g) => {
    if (g.kind !== 'op' || !per.months.includes(g.ym)) return;
    let theo = 0, base = 0, vat = 0, ok = false;
    Object.entries(g.m).forEach(([c, v]) => {
      if (c[0] === '7') { const rt = M.caRate(c); if (rt !== null) { theo += (-v * rt) / 100; base -= v; ok = true; } }
      else if (/^coll$/.test(M.roleOf(c))) vat -= v;
    });
    if (!ok || Math.abs(vat - theo) <= Math.max(1, Math.abs(theo) * 0.01)) return;
    out.push({ gap: vat - theo, text: `${fmtDate(g.date)} · ${g.ref} · ${g.lib} · base ${eur(base)} € · TVA ${eur(vat)} € au lieu de ${eur(theo)} €` });
  });
  return out.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
}

function tvaChecks(r, K) {
  const { M, per, o, liq, rel, rapp, ratedAcc, theoTotal, draft, pay, due } = K;
  const out = checksList();
  const c = clientById(ui.fec.clientId);
  const reg = c ? norm(c.regimeTva) : '';
  const maxOp = r.pieces.maxOp || r.meta.maxDate;
  const tol = (x) => Math.max(2, Math.abs(x) * 0.005);
  if (/franchise|non assujetti/.test(reg) && o.coll > 0.01) out.add('error', 'TVA collectée alors que le dossier est en franchise ou non assujetti', `${eur(o.coll)} € de TVA collectée : régime du dossier à vérifier (dépassement des seuils de franchise ?).`);

  // Paramétrage
  const sans = K.caRows.filter((x) => x.role === 'sans');
  if (sans.length) out.add('warn', 'Comptes de produits sans taux de TVA', `${sans.length} compte(s) mouvementé(s) sur la période sans taux identifié : précisez leur taux ou leur nature dans « Paramétrage des comptes » (en bas de page).`, sans.map((x) => `${x.compte} ${x.lib} : ${eur(x.base)} €`), { full: true });
  const autres = K.accounts.filter((x) => x.role === 'autre' && Math.abs(x.op) >= 0.01);
  if (autres.length) out.add('info', 'Comptes de TVA non pris en compte', 'Comptes 445 dont la nature n\'est pas reconnue : à préciser dans le paramétrage s\'ils doivent entrer dans la déclaration.', autres.map((x) => `${x.compte} ${x.lib} : mouvement ${eur(x.op)} €`), { full: true });

  // Rapprochement chiffre d'affaires / TVA collectée
  if (rapp.length) {
    if (ratedAcc) {
      const bad = rapp.filter((x) => Math.abs(x.ecart) >= tol(x.theo));
      if (bad.length) out.add('warn', 'TVA collectée différente du chiffre d\'affaires × taux', 'Écart entre la TVA comptabilisée par taux et la TVA calculée sur les comptes de produits de ce taux : TVA mal ventilée entre les taux, vente imputée sur un compte d\'un autre taux, avoir ou facture sans TVA.', bad.map((x) => `${rateTxt(x.rate)} : base ${eur(x.base)} €, TVA attendue ${eur(x.theo)} €, comptabilisée ${eur(x.compta)} € (écart ${eur(x.ecart)} €)`), { full: true });
      else out.add('ok', 'TVA collectée cohérente avec le chiffre d\'affaires', `Taux par taux, la TVA comptabilisée correspond aux comptes de produits (${rapp.map((x) => rateTxt(x.rate)).join(', ')}).`);
    } else {
      const gap = round2(o.coll - theoTotal);
      if (Math.abs(gap) >= tol(theoTotal)) out.add('warn', 'TVA collectée différente du chiffre d\'affaires × taux', `TVA comptabilisée ${eur(o.coll)} €, attendue d'après les comptes de produits ${eur(theoTotal)} € (écart ${eur(gap)} €).`, rapp.map((x) => `${rateTxt(x.rate)} : base ${eur(x.base)} €, TVA attendue ${eur(x.theo)} €`), { full: true });
      else out.add('ok', 'TVA collectée cohérente avec le chiffre d\'affaires', `${eur(o.coll)} € comptabilisés pour ${eur(theoTotal)} € attendus.`);
    }
    const ex = rateExamples(K);
    if (ex.length) out.add('info', 'Écritures de vente dont la TVA ne correspond pas au taux du compte', `${ex.length} écriture(s) : pour retrouver l'origine d'un écart (taux, compte de produit ou montant de TVA erroné).`, ex.slice(0, 30).map((x) => x.text), { full: ex.length <= 30 });
  } else if (o.coll >= 1) out.add('warn', 'TVA collectée sans chiffre d\'affaires taxable', `${eur(o.coll)} € de TVA collectée, mais aucun compte de produits rattaché à un taux : à paramétrer.`);
  const nvG = M.T.nv.filter(([date, , , , m]) => per.months.includes(date.slice(0, 7)) && Object.keys(m).some((cpt) => M.caRate(cpt) !== null));
  if (nvG.length) out.add('warn', 'Ventes sans TVA sur des comptes taxables', `${nvG.length} écriture(s) sur des comptes de produits soumis à la TVA, sans ligne de TVA : TVA oubliée, ou compte à corriger (export, exonération).`, nvG.slice(0, 30).map(([date, ref, , lib, m]) => `${fmtDate(date)} · ${ref} · ${lib} · ${eur(-Object.values(m).reduce((t, v) => t + v, 0))} € HT`), { full: nvG.length <= 30 });
  const nt = K.nonTax;
  if (nt.export) out.add('info', `Exportations : ${eur(nt.export)} € HT (ligne 04)`, "Justificatifs d'exportation (déclaration en douane) à conserver.");
  if (nt.intra) out.add('info', `Livraisons intracommunautaires : ${eur(nt.intra)} € HT (ligne 06)`, "N° de TVA intracommunautaire du client sur la facture ; état récapitulatif à déposer.");
  if (nt.exo) out.add('info', `Opérations non imposables : ${eur(nt.exo)} € HT (ligne 05)`, 'Mention de l\'exonération sur les factures.');
  if (Math.abs(o.att) >= 0.01) out.add('info', `TVA non encore exigible (encaissements) : ${eur(o.att)} € sur la période`, 'TVA facturée en attente d\'encaissement : seule la TVA virée en TVA collectée exigible est déclarée.');

  // Déclaration comptabilisée, reliquats, paiement
  const late = maxOp && maxOp > addDays(per.end, 25);
  if (!K.freqOk) out.add('info', `Déclarations comptabilisées ${M.freq === 'month' ? 'mensuelles' : 'trimestrielles'}`, `Les OD de TVA du dossier sont ${M.freq === 'month' ? 'mensuelles' : 'trimestrielles'} : passez en « ${M.freq === 'month' ? 'Mois' : 'Trimestre'} » pour les rapprocher des écritures.`);
  else if (!liq) {
    if (M.decls.length && late) out.add('warn', 'Déclaration de la période non comptabilisée', 'Aucune écriture de déclaration (OD de TVA) ne correspond à cette période, alors que les déclarations des autres périodes le sont.');
    else if (!M.decls.length) out.add('info', 'Aucune écriture de déclaration de TVA dans le FEC', 'Le dossier ne comptabilise pas ses déclarations (ou pas encore) : le calcul repose sur les seules écritures de la période.');
  } else {
    const diffs = [];
    const cmp = (label, a, b) => { if (Math.abs(a - b) >= 1) diffs.push(`${label} : écritures de la période ${eur(a)} €, déclaration ${eur(b)} € (écart ${eur(b - a)} €)`); };
    cmp('TVA collectée', o.coll, liq.coll); cmp('TVA autoliquidée', o.auto, liq.auto); cmp('TVA déductible', round2(o.ded + o.dedImmo), round2(liq.ded + liq.dedImmo));
    const refs = liq.list.map((d) => `${fmtDate(d.date)} (${d.ref})`).join(', ');
    if (diffs.length) out.add('warn', `Déclaration comptabilisée différente des écritures de la période`, `Écriture(s) ${refs} : écart avec la TVA des opérations de la période. Factures saisies après la déclaration, reliquat d'une période précédente repris, ou erreur dans l'OD de TVA.`, diffs);
    else out.add('ok', `Déclaration comptabilisée conforme (${refs})`, `TVA collectée ${eur(liq.coll)} €, déductible ${eur(liq.ded + liq.dedImmo)} €${liq.due ? `, à payer ${eur(liq.due)} €` : ''}${liq.creditNew ? `, crédit reporté ${eur(liq.creditNew)} €` : ''}.`);
    if (liq.list.length > 1) out.add('info', 'Plusieurs écritures de déclaration pour la période', 'Déclaration rectificative ou OD complémentaire : vérifier l\'absence de double emploi.', liq.list.map((d) => `${fmtDate(d.date)} · ${d.ref} · ${d.lib} : collectée ${eur(d.coll)} €, déductible ${eur(d.ded + d.dedImmo)} €`));
    if (Math.abs(liq.other) >= 5) out.add('info', `Autre montant dans l'écriture de déclaration : ${eur(liq.other)} €`, 'Écart d\'arrondi ou ligne de charge / produit dans l\'OD de TVA : au-delà des arrondis à l\'euro, à justifier.');
  }
  if (K.solde && (liq || late)) {
    if (Math.abs(rel.coll) >= 1) out.add('warn', `TVA collectée des périodes précédentes restée en compte : ${eur(rel.coll)} €`, `Solde des comptes de TVA collectée avant la déclaration de la période : ${eur(K.solde.coll)} €, pour ${eur(o.coll)} € d'opérations. TVA comptabilisée après une déclaration (non déclarée), ou déclarée en trop : à régulariser.`);
    if (Math.abs(rel.ded) >= 1) out.add('info', `TVA déductible des périodes précédentes restée en compte : ${eur(rel.ded)} €`, `Solde des comptes de TVA déductible avant la déclaration : ${eur(K.solde.ded)} €, pour ${eur(round2(o.ded + o.dedImmo))} € d'opérations. Factures saisies après une déclaration (TVA à récupérer) ou avoirs.`);
    if (Math.abs(rel.auto) >= 1) out.add('warn', `TVA autoliquidée restée en compte : ${eur(rel.auto)} €`, 'La TVA autoliquidée doit être reprise à chaque déclaration.');
  }
  if (liq && due > 0) {
    if (!pay) { if (maxOp && maxOp > addDays(per.end, 45)) out.add('warn', 'Paiement de la TVA non trouvé', `${eur(due)} € à payer selon la déclaration comptabilisée : aucun règlement de la TVA à décaisser dans les 70 jours.`); }
    else if (Math.abs(pay.amt - due) >= 1) out.add('warn', `Paiement de la TVA différent du montant dû : ${eur(pay.amt)} € pour ${eur(due)} €`, `Règlement du ${fmtDate(pay.date)} (${pay.lib}) : écart de ${eur(pay.amt - due)} €.`);
    else out.add('ok', `TVA payée le ${fmtDate(pay.date)}`, `${eur(pay.amt)} €.`);
  }
  if (draft.net <= -760) out.add('info', `Crédit de TVA de ${eur(-draft.net)} € : remboursement possible`, 'Crédit d\'au moins 760 € : remboursement demandable (formulaire 3519), à défaut report sur la déclaration suivante.');

  // TVA déductible (écritures de la période)
  const B = (k) => {
    const b = { n: 0, total: 0, ex: [] };
    per.months.forEach((ym) => { const x = (M.T.chk[ym] || {})[k]; if (x) { b.n += x.n; b.total += x.total; b.ex = b.ex.concat(x.ex).slice(0, 30); } });
    return b;
  };
  const full = (b) => ({ full: b.ex.length >= b.n });
  const add = (k, level, label, detail) => { const b = B(k); if (b.n) out.add(level, label, detail(b), b.ex, full(b)); };
  add('autoliqND', 'warn', 'TVA autoliquidée non déduite', (b) => `${b.n} facture(s), ${eur(b.total)} € : la TVA autoliquidée est en principe déductible en même temps.`);
  add('vehicle', 'warn', 'TVA déduite sur des véhicules de tourisme', (b) => `${b.n} écriture(s), ${eur(b.total)} € : TVA non récupérable sur l'achat, la location et l'entretien des véhicules de tourisme (sauf utilitaires et activités de transport, location ou auto-école).`);
  add('fuel', 'info', 'TVA sur carburants', (b) => `${eur(b.total)} € : véhicules de tourisme 80 % récupérable, utilitaires 100 %. Part non récupérable si véhicules de tourisme : ${eur(b.total * 0.2)} €.`);
  add('lodging', 'warn', "TVA déduite sur de l'hébergement", (b) => `${b.n} écriture(s), ${eur(b.total)} € : non récupérable pour l'hébergement des dirigeants et du personnel.`);
  add('gift', 'warn', 'TVA déduite sur des cadeaux de plus de 73 € TTC', (b) => `${b.n} écriture(s), ${eur(b.total)} € : non récupérable au-delà de 73 € TTC par bénéficiaire et par an.`);
  add('perso', 'warn', 'TVA déduite sur des dépenses à caractère personnel possibles', (b) => `${b.n} écriture(s), ${eur(b.total)} € : déductible seulement si la dépense est engagée pour l'entreprise.`);
  add('overP', 'warn', 'TVA déductible supérieure à 20 % du HT', (b) => `${b.n} écriture(s) : erreur de saisie ou TVA déduite deux fois ?`);
  add('immoAbs', 'info', 'TVA sur immobilisations comptabilisée en autres biens et services', (b) => `${eur(b.total)} € : à déclarer ligne 19 et non ligne 20.`);
  add('absImmo', 'info', 'TVA sur charges comptabilisée en TVA sur immobilisations', (b) => `${eur(b.total)} € : à déclarer ligne 20 et non ligne 19.`);
  add('noVatP', 'info', 'Factures fournisseurs sans TVA (150 € HT ou plus)', (b) => `${b.n} facture(s), ${eur(b.total)} € HT : fournisseur non assujetti, autoliquidation à passer, ou TVA oubliée ?`);

  // Montants déclarés (saisis ici ou dans le suivi mensuel)
  const d = declOf(per.key);
  const diffs = [];
  const cmpD = (label, decl, calc) => { if (decl !== '' && decl !== undefined && decl !== null && Math.abs(Number(decl) - calc) >= 1) diffs.push(`${label} : déclaré ${eur(decl)} €, comptabilité ${eur(calc)} € (écart ${eur(Number(decl) - calc)} €)`); };
  cmpD('Ligne 01 (ventes)', d.b01, draft.taxable); cmpD('Ligne 16 (TVA brute)', d.t16, draft.brute); cmpD('Ligne 23 (TVA déductible)', d.t23, draft.ded); cmpD(`Net à payer (+) ou crédit (−)${d.fromMission ? ' noté dans le suivi mensuel' : ''}`, d.net, draft.net);
  if (diffs.length) out.add('error', 'Déclaration déposée différente de la comptabilité', 'Écart entre les montants déclarés et les écritures de la période : déclaration rectificative ou régularisation sur la suivante.', diffs);
  else if (['b01', 't16', 't23', 'net'].some((k) => d[k] !== '' && d[k] !== undefined)) out.add('ok', 'Déclaration déposée conforme à la comptabilité', 'Les montants déclarés correspondent aux écritures de la période.');
  return out;
}

function tvaData(r) {
  const st = tvaState();
  const per = tvaPeriod(st.key);
  const K = tvaCalc(r, per);
  const cycle = `tva-${per.key}`;
  const checks = applyMemo(tvaChecks(r, K), cycle);
  return Object.assign({ st, per, cycle, checks }, K);
}

// Concordance sur l'exercice : période par période, TVA calculée, comptabilisée et déclarée.
function tvaConcordance(r, kind) {
  const M = tvaModel(r);
  return periodKeys(M.T, kind).map((key) => {
    const K = tvaCalc(r, tvaPeriod(key));
    const d = declOf(key);
    const declNet = d.net !== '' && d.net !== undefined ? Number(d.net) : null;
    return { key, per: K.per, taxable: K.draft.taxable, coll: K.o.coll, brute: K.draft.brute, ded: K.draft.ded, net: K.draft.net, liqNet: K.liq ? round2(K.liq.due - K.liq.creditNew) : null, declNet, ok: (controlOf(key) || {}).at };
  });
}

const controlOf = (key) => { const c = clientById(ui.fec.clientId); return c && c.tvaControles ? c.tvaControles[key] : (ui.fec.tvaControles || {})[key]; };

// ---------- Écran ----------

function tvaParamsCard(K) {
  const { M } = K;
  const P = tvaParams();
  const c = clientById(ui.fec.clientId);
  const accRows = Object.values(M.acc).sort((a, b) => a.compte.localeCompare(b.compte));
  const caRows = Object.values(M.ca).sort((a, b) => a.compte.localeCompare(b.compte));
  const rateOpts = (cur) => `<option value=""${cur === null || cur === undefined ? ' selected' : ''}>—</option>${TVA_RATES.map((rt) => `<option value="${rt}"${cur === rt ? ' selected' : ''}>${rateTxt(rt)}</option>`).join('')}`;
  const srcTxt = (x) => (x.src === 'param' ? 'paramétré' : x.src === 'ecritures' ? `constaté (${x.nVotes} écriture${x.nVotes > 1 ? 's' : ''})` : x.src === 'libelle' ? 'libellé' : 'automatique');
  const caVal = (x) => (typeof x.role === 'number' ? String(x.role) : x.role);
  const open = Object.keys(P.acc).length || Object.keys(P.ca).length || caRows.some((x) => x.role === 'sans' && Math.abs(K.o.ca[x.compte] || 0) >= 0.01) || accRows.some((a) => a.role === 'autre' && Math.abs((K.accounts.find((y) => y.compte === a.compte) || {}).op || 0) >= 0.01);
  return `<section class="card"><details${open ? ' open' : ''}><summary><h2>Paramétrage des comptes</h2></summary>
    <p class="muted small">Nature des comptes de TVA et taux des comptes de produits, déduits des numéros, des libellés et des écritures. Corrigez-les si besoin : ${c ? 'le paramétrage est conservé, chiffré, dans le dossier et resservira aux prochaines analyses' : 'rattachez l\'analyse à un dossier pour conserver le paramétrage'}.</p>
    <div class="grid2">
      <div class="grid-wrap"><table class="dtable tva-params"><thead><tr><th>Compte de TVA</th><th>Nature</th><th>Taux</th></tr></thead><tbody>
        ${accRows.map((a) => `<tr><td><strong>${esc(a.compte)}</strong><div class="muted small">${esc(a.lib)}</div></td>
          <td><select data-tvap="acc-role" data-c="${esc(a.compte)}" aria-label="Nature du compte ${esc(a.compte)}">${Object.entries(TVA_ROLES).map(([k, l]) => `<option value="${k}"${a.role === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>${P.acc[a.compte] ? ' <button class="link-btn small" data-action="tvap-reset" data-kind="acc" data-c="' + esc(a.compte) + '">auto</button>' : ''}</td>
          <td>${/^(coll|coll-att|autoliq)$/.test(a.role) ? `<select data-tvap="acc-rate" data-c="${esc(a.compte)}" aria-label="Taux du compte ${esc(a.compte)}">${rateOpts(a.rate)}</select>` : ''}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="grid-wrap"><table class="dtable tva-params"><thead><tr><th>Compte de produits</th><th>Taux ou nature</th><th>Origine</th></tr></thead><tbody>
        ${caRows.map((x) => `<tr class="${x.role === 'sans' ? 'flag' : ''}"><td><strong>${esc(x.compte)}</strong><div class="muted small">${esc(x.lib)}</div></td>
          <td><select data-tvap="ca" data-c="${esc(x.compte)}" aria-label="Taux du compte ${esc(x.compte)}">${TVA_RATES.map((rt) => `<option value="${rt}"${caVal(x) === String(rt) ? ' selected' : ''}>TVA ${rateTxt(rt)}</option>`).join('')}${Object.entries(CA_ROLES).map(([k, l]) => `<option value="${k}"${caVal(x) === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></td>
          <td class="small">${srcTxt(x)}${x.labelRate !== null && typeof x.role === 'number' && x.labelRate !== x.role ? ` <span class="cred">· libellé ${rateTxt(x.labelRate)}</span>` : ''}${P.ca[x.compte] !== undefined ? ` <button class="link-btn small" data-action="tvap-reset" data-kind="ca" data-c="${esc(x.compte)}">auto</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>
    </div></details></section>`;
}

function viewTva() {
  const f = ui.fec;
  const r = f.result;
  if (!r.cycles || !r.cycles.tva || !Object.keys(r.cycles.tva.months).length) return '<section class="card"><p class="muted">Aucune écriture datée : contrôle de la TVA impossible.</p></section>';
  const K = tvaData(r);
  const { st, per, o, liq, draft, cycle, checks, rapp, ratedAcc, report, pay } = K;
  const keys = periodKeys(K.M.T, st.kind);
  const reg = tvaRegime();
  const ctl = controlOf(per.key);
  const pg = wpProgress(cycle, checks);
  const c = clientById(f.clientId);
  const d = declOf(per.key);
  const cell = (v) => (v === undefined || v === null ? '' : eur(v));
  const regTxt = { M: 'TVA mensuelle', T: 'TVA trimestrielle', CA12: 'régime simplifié (CA12 annuelle)', F: 'franchise en base' }[reg];
  const conc = tvaConcordance(r, st.kind);
  const dedOps = round2(o.ded + o.dedImmo);
  const declNet = d.net !== '' && d.net !== undefined ? Number(d.net) : null;
  // Tableau de calcul : écritures de la période, déclaration comptabilisée, écart
  const calcRows = [
    ...(ratedAcc ? rapp.map((x) => [`TVA collectée ${rateTxt(x.rate)}`, x.compta, null, '']) : []),
    ...(ratedAcc && Math.abs(o.collNoRate) >= 0.01 ? [['TVA collectée (comptes sans taux)', o.collNoRate, null, '']] : []),
    ['TVA collectée', o.coll, liq && liq.coll, 'strong'],
    ...(o.auto || (liq && liq.auto) ? [['TVA autoliquidée', o.auto, liq && liq.auto, '']] : []),
    ['TVA déductible sur immobilisations', o.dedImmo, liq && liq.dedImmo, ''],
    ['TVA déductible sur autres biens et services', o.ded, liq && liq.ded, ''],
    ['Crédit de la période précédente imputé', report, liq && liq.creditUsed, ''],
    ['TVA nette (à payer +, crédit −)', draft.net, liq && round2(liq.due - liq.creditNew), 'strong'],
  ];
  return `
    <section class="card">
      <div class="card-head"><h2>Contrôle de la TVA — ${esc(per.label)} <span class="badge beta">bêta</span></h2>
        <div class="head-actions">
          <button class="btn small" data-action="tva-xlsx">Excel</button>
          <button class="btn small" data-action="tva-print">Imprimer / PDF</button>
        </div></div>
      <div class="filters">
        <div class="seg" role="group" aria-label="Périodicité">
          <button class="${st.kind === 'month' ? 'on' : ''}" data-action="tva-kind" data-kind="month">Mois</button>
          <button class="${st.kind === 'quarter' ? 'on' : ''}" data-action="tva-kind" data-kind="quarter">Trimestre</button>
        </div>
        <select data-tva="key" aria-label="Période">${options(Object.fromEntries(keys.map((k) => [k, tvaPeriod(k).label.replace(/^./, (x) => x.toUpperCase())])), per.key)}</select>
        ${regTxt ? `<span class="muted small">Dossier : ${esc(regTxt)}${reg === 'T' && st.kind === 'month' ? ' — passez en « Trimestre »' : reg === 'M' && st.kind === 'quarter' ? ' — passez en « Mois »' : ''}</span>` : ''}
      </div>
      <p class="muted small">Calcul fait sur les comptes : TVA = mouvements des comptes 445 des écritures de la période (hors écritures de déclaration et de paiement), chiffre d'affaires = mouvements des comptes de produits de chaque taux. Les mêmes montants se retrouvent dans la balance de votre logiciel pour la période. Fonction en bêta : comparez-la à votre outil de contrôle.</p>
      ${reg === 'CA12' ? '<div class="banner info"><span>Dossier au régime simplifié : ce contrôle sert à suivre la TVA en cours d\'année ; la CA12 reprend l\'exercice entier.</span></div>' : ''}
      ${o.months < per.months.length ? `<div class="banner warn"><span>Le FEC ne couvre que ${o.months} mois sur ${per.months.length} de la période.</span></div>` : ''}
      <div class="kpis fec-kpis">
        ${kpiTile('TVA collectée', eurK(o.coll))}
        ${kpiTile('TVA déductible', eurK(dedOps))}
        ${kpiTile(draft.net >= 0 ? 'TVA nette à payer' : 'Crédit de TVA', `${eur(Math.abs(draft.net), 0)} €`, draft.net < 0 ? 'kpi-wait' : '')}
        ${kpiTile(d.fromMission ? 'Déclaré (suivi mensuel)' : 'Déclaré', declNet === null ? '—' : `${eur(Math.abs(declNet), 0)} €${declNet < 0 ? ' crédit' : ''}`, declNet !== null && Math.abs(declNet - draft.net) >= 1 ? 'kpi-late' : '')}
        ${kpiTile('Points à vérifier', pg.left, pg.left ? 'kpi-wait' : '')}
      </div>
      <div class="tva-validate">
        ${ctl ? `<span class="lvl lvl-ok"><b aria-hidden="true">✓</b>Contrôle validé${ctl.by ? ` par ${esc(ctl.by)}` : ''} le ${fmtDate(ctl.at.slice(0, 10))}${ctl.net !== undefined ? ` (${ctl.net >= 0 ? 'à payer' : 'crédit'} ${eur(Math.abs(ctl.net))} €)` : ''}</span> <button class="link-btn" data-action="tva-validate" data-undo="1">Annuler</button>`
          : `<button class="btn primary" data-action="tva-validate">✓ Valider le contrôle de ${esc(per.label)}</button>
             <span class="muted small">${c ? `Coche l'étape « Contrôle et calcul de la TVA » de la mission ${esc(per.exercice)} et note le montant dans le suivi mensuel s'il n'y est pas.` : 'Rattachez l\'analyse à un dossier pour conserver le contrôle.'}</span>`}
      </div>
    </section>
    <section class="card"><h2>Calcul de la TVA de la période</h2>
        <div class="grid-wrap"><table class="dtable num r2 tva-calc"><thead><tr><th></th><th>Écritures de la période</th><th>${liq ? `Déclaration comptabilisée${liq.list.length === 1 ? ` du ${fmtDate(liq.date)}` : 's'}` : 'Déclaration comptabilisée'}</th><th>Écart</th></tr></thead>
        <tbody>${calcRows.map(([l, a, b, cls]) => `<tr class="${cls}"><td>${esc(l)}</td><td>${eur(a)}</td><td>${b === null ? '' : liq ? eur(b) : '—'}</td><td class="${liq && b !== null && Math.abs(a - b) >= 1 ? 'cred' : ''}">${liq && b !== null ? eur(round2(b - a)) : ''}</td></tr>`).join('')}</tbody></table></div>
        <table class="dtable num sig"><tbody>
          ${K.solde ? `<tr><td>Solde de la TVA collectée avant déclaration</td><td class="${Math.abs(K.rel.coll) >= 1 ? 'cred' : ''}">${eur(K.solde.coll)}</td></tr>
          <tr><td>Solde de la TVA déductible avant déclaration</td><td class="${Math.abs(K.rel.ded) >= 1 ? 'cred' : ''}">${eur(K.solde.ded)}</td></tr>` : ''}
          ${Math.abs(o.att) >= 0.01 ? `<tr><td>TVA non exigible (encaissements), mouvement</td><td>${eur(o.att)}</td></tr>` : ''}
          <tr><td>Paiement</td><td>${pay ? `${eur(pay.amt)} € le ${fmtDate(pay.date)}` : K.due > 0 ? 'non trouvé' : '—'}</td></tr>
          ${declNet !== null ? `<tr><td>Montant déclaré${d.fromMission ? ' (suivi mensuel)' : ''}</td><td class="${Math.abs(declNet - draft.net) >= 1 ? 'cred' : ''}">${declNet >= 0 ? `${eur(declNet)} € à payer` : `crédit ${eur(-declNet)} €`}</td></tr>` : ''}
        </tbody></table>
        <p class="muted small">Écart : déclaration comptabilisée − écritures de la période. Un écart vient en général de factures saisies après la déclaration, ou d'un reliquat d'une période précédente repris dans l'OD de TVA.</p>
      </section>
      <section class="card"><h2>Chiffre d'affaires et TVA collectée par taux</h2>
        ${rapp.length ? `<div class="grid-wrap"><table class="dtable num r2 tva-rapp"><thead><tr><th>Taux</th><th>Base HT</th><th>TVA attendue</th><th>TVA comptabilisée</th><th>Écart</th></tr></thead>
        <tbody>${rapp.map((x) => `<tr><td>${rateTxt(x.rate)}</td><td>${eur(x.base)}</td><td>${eur(x.theo)}</td><td>${x.compta === null ? '—' : eur(x.compta)}</td><td class="${x.ecart !== null && Math.abs(x.ecart) >= 2 ? 'cred' : ''}">${x.ecart === null ? '' : eur(x.ecart)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th>Total</th><th>${eur(rapp.reduce((t, x) => t + x.base, 0))}</th><th>${eur(K.theoTotal)}</th><th>${eur(o.coll)}</th><th class="${Math.abs(o.coll - K.theoTotal) >= 2 ? 'cred' : ''}">${eur(round2(o.coll - K.theoTotal))}</th></tr></tfoot></table></div>` : '<p class="muted">Aucun compte de produits rattaché à un taux sur la période.</p>'}
        <details class="viz-table"><summary>Comptes de produits de la période</summary>
          <div class="grid-wrap"><table class="dtable num l3"><thead><tr><th>Compte</th><th>Libellé</th><th>Taux ou nature</th><th>Montant</th></tr></thead>
          <tbody>${K.caRows.map((x) => `<tr class="${x.role === 'sans' ? 'flag' : ''}"><td>${esc(x.compte)}</td><td>${esc(x.lib)}</td><td>${typeof x.role === 'number' ? rateTxt(x.role) : esc(CA_ROLES[x.role] || x.role)}</td><td>${eur(x.base)}</td></tr>`).join('')}</tbody></table></div>
        </details>
        <p class="muted small">${ratedAcc ? 'TVA comptabilisée : mouvements des comptes de TVA collectée de chaque taux.' : 'Les comptes de TVA collectée ne sont pas ventilés par taux : seul le total est rapproché.'} Taux des comptes de produits : voir « Paramétrage des comptes ».</p>
      </section>
    <section class="card"><h2>Contrôles <span class="count">${pg.left}</span></h2>
      ${wpCycleBar(cycle, checks, 'Marquer la TVA comme revue')}
      ${wpCheckList(checks, cycle)}
    </section>
    <section class="card"><h2>Comptes de TVA de la période</h2>
      <p class="muted small">À comparer avec la balance ou le grand livre des comptes 445 de votre logiciel pour la même période (soldes débiteurs positifs, créditeurs négatifs). « Déclaration » : écritures d'OD de TVA ; « Paiement » : règlements de la TVA à décaisser.</p>
      <div class="grid-wrap"><table class="dtable num l3 tva-acc"><thead><tr><th>Compte</th><th>Libellé</th><th>Nature</th><th>Solde d'ouverture</th><th>Opérations</th><th>Déclaration</th><th>Paiement</th><th>Solde de fin</th></tr></thead>
        <tbody>${K.accounts.map((x) => `<tr><td>${esc(x.compte)}</td><td>${esc(x.lib)}</td><td class="small">${esc(TVA_ROLES[x.role] || '')}${x.rate ? ` · ${rateTxt(x.rate)}` : ''}</td><td>${eur(x.start)}</td><td>${eur(x.op)}</td><td>${x.decl ? eur(x.decl) : ''}</td><td>${x.pay ? eur(x.pay) : ''}</td><td>${eur(x.end)}</td></tr>`).join('')}</tbody></table></div>
      ${liq ? `<p class="muted small">Écriture(s) de déclaration rattachée(s) à la période : ${liq.list.map((x) => `${fmtDate(x.date)} · ${esc(x.ref)} · ${esc(x.lib)}`).join(' ; ')}.</p>` : ''}
      <div class="pieces-actions"><button class="btn small" data-action="tva-lines">Exporter les écritures de TVA de la période (Excel)</button></div>
    </section>
    <section class="card"><h2>Brouillon de déclaration (CA3)</h2>
      <div class="grid-wrap"><table class="dtable num tva-draft"><thead><tr><th>Ligne</th><th>Libellé</th><th>Base HT</th><th>TVA</th></tr></thead>
      <tbody>${draft.rows.map((x) => x.h ? `<tr class="tva-h"><td colspan="4">${esc(x.h)}</td></tr>`
        : `<tr class="${x.strong ? 'strong' : ''}${x.warn ? ' flag' : ''}"><td>${esc(x.line)}</td><td>${esc(x.label)}</td><td>${cell(x.base)}</td><td>${cell(x.tva)}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted small">Établi sur les écritures de la période (numéros de ligne du formulaire 3310-CA3, montants à arrondir à l'euro). Les taxes assimilées et les régularisations restent à ajouter.</p>
    </section>
    ${tvaParamsCard(K)}
    <section class="card"><h2>Montants télédéclarés <span class="muted small">(facultatif)</span></h2>
      <p class="muted small">Saisissez les montants de la déclaration déposée pour la comparer aux écritures. Le net est aussi celui du suivi mensuel (mission TVA de la période). Conservés${c ? ', chiffrés, dans le dossier' : ' pendant la session (rattachez un dossier pour les conserver)'}.</p>
      <div class="filters tva-decl">
        <label class="inline-label">Ligne 01 <input type="number" step="0.01" data-tva-decl="b01" value="${esc(d.b01 ?? '')}" placeholder="${eur(draft.taxable, 0)}"></label>
        <label class="inline-label">Ligne 16 <input type="number" step="0.01" data-tva-decl="t16" value="${esc(d.t16 ?? '')}" placeholder="${eur(draft.brute, 0)}"></label>
        <label class="inline-label">Ligne 23 <input type="number" step="0.01" data-tva-decl="t23" value="${esc(d.t23 ?? '')}" placeholder="${eur(draft.ded, 0)}"></label>
        <label class="inline-label">Net (à payer +, crédit −) <input type="number" step="0.01" data-tva-decl="net" value="${esc(d.net ?? '')}" placeholder="${eur(draft.net, 0)}"></label>
      </div>
    </section>
    <section class="card"><h2>Concordance de la TVA sur l'exercice</h2>
      <div class="grid-wrap"><table class="dtable num r2 tva-conc"><thead><tr><th>Période</th><th>Base taxable</th><th>TVA collectée</th><th>TVA brute</th><th>TVA déductible</th><th>Nette calculée</th><th>Déclaration comptabilisée</th><th>Déclarée</th><th>Écart</th><th>Contrôle</th></tr></thead>
      <tbody>${conc.map((x) => {
        const ref = x.declNet !== null ? x.declNet : x.liqNet;
        const gap = ref === null ? null : round2(ref - x.net);
        return `<tr class="${x.key === per.key ? 'strong' : ''}"><td><button class="link-btn" data-action="tva-goto" data-key="${x.key}">${esc(x.per.label)}</button></td><td>${eur(x.taxable, 0)}</td><td>${eur(x.coll, 0)}</td><td>${eur(x.brute, 0)}</td><td>${eur(x.ded, 0)}</td><td>${eur(x.net, 0)}</td>
          <td>${x.liqNet === null ? '—' : eur(x.liqNet, 0)}</td><td>${x.declNet === null ? '' : eur(x.declNet, 0)}</td><td class="${gap !== null && Math.abs(gap) >= 1 ? 'cred' : ''}">${gap === null ? '' : Math.abs(gap) < 1 ? '0' : eur(gap, 0)}</td><td>${x.ok ? '✓' : ''}</td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr><th>Total</th><th>${eur(conc.reduce((t, x) => t + x.taxable, 0), 0)}</th><th>${eur(conc.reduce((t, x) => t + x.coll, 0), 0)}</th><th>${eur(conc.reduce((t, x) => t + x.brute, 0), 0)}</th><th>${eur(conc.reduce((t, x) => t + x.ded, 0), 0)}</th><th>${eur(conc.reduce((t, x) => t + x.net, 0), 0)}</th><th>${eur(conc.reduce((t, x) => t + (x.liqNet || 0), 0), 0)}</th><th></th><th></th><th></th></tr></tfoot></table></div>
      <p class="muted small">Nette calculée : positive à payer, négative crédit. Déclaration comptabilisée : TVA à décaisser moins crédit reporté de l'OD de TVA. Écart : avec le montant déclaré (saisi ici ou dans le suivi mensuel), à défaut avec la déclaration comptabilisée. Sert aussi à la concordance du chiffre d'affaires et de la TVA à la clôture.</p>
    </section>`;
}

// Paramétrage modifié : nature ou taux d'un compte.
function setTvaParam(kind, compte, value, field) {
  const P = tvaParams();
  if (kind === 'acc') {
    const cur = Object.assign({}, P.acc[compte] || {});
    if (value === '' && field === 'rate') delete cur.rate; else cur[field] = field === 'rate' ? Number(value) : value;
    if (Object.keys(cur).length) P.acc[compte] = cur; else delete P.acc[compte];
  } else if (value === '' || value === null) delete P.ca[compte];
  else P.ca[compte] = /^[\d.]+$/.test(value) ? Number(value) : value;
  if (clientById(ui.fec.clientId)) persist();
  refresh();
}

function tvaValidate(undo) {
  const f = ui.fec;
  const r = f.result;
  const { per, draft, liq } = tvaData(r);
  const c = clientById(f.clientId);
  const store = c ? (c.tvaControles = c.tvaControles || {}) : (f.tvaControles = f.tvaControles || {});
  if (undo) {
    delete store[per.key];
    const mt = c && tvaMissionOf(c.id, per.exercice);
    if (mt && mt.tvaNetSrc === 'fec') { delete mt.tvaNet; delete mt.tvaNetSrc; }
    if (c) { log(c.id, `Contrôle de la TVA de ${per.label} annulé.`, true); persist(); }
    return refresh();
  }
  store[per.key] = { at: nowIso(), by: data.settings.utilisateur || '', net: draft.net, brute: draft.brute, ded: draft.ded, liq: liq ? liq.date : '' };
  if (c) {
    log(c.id, `Contrôle de la TVA de ${per.label} validé depuis le FEC : ${draft.net >= 0 ? `${eur(draft.net)} € à payer` : `crédit de ${eur(-draft.net)} €`}.`, true);
    const done = autoStep(c.id, ['tva'], [per.exercice], /^contr[ôo]le/i, 'contrôle de la TVA validé depuis l\'analyse du FEC');
    // Montant de la mission TVA de la période, s'il n'est pas encore noté (arrondi à l'euro, comme la CA3).
    const mt = tvaMissionOf(c.id, per.exercice);
    const noted = mt && !tvaNetSet(mt);
    if (noted) Object.assign(mt, { tvaNet: Math.round(draft.net), tvaNetSrc: 'fec', updatedAt: nowIso() });
    persist();
    toast(`${done ? `Contrôle validé — ${done}` : 'Contrôle validé et noté au journal du dossier'}${noted ? ` ; montant noté dans la mission « ${mt.titre} »` : ''}.`);
  } else toast('Contrôle validé pour cette session : rattachez un dossier pour le conserver.');
  refresh();
}

function tvaHtml() {
  const r = ui.fec.result;
  const K = tvaData(r);
  const { per, liq, draft, cycle, checks, o } = K;
  const c = clientById(ui.fec.clientId);
  const ctl = controlOf(per.key);
  const st = wpStore();
  const row = (x) => {
    const it = st.items[wpKey(cycle, x.label)] || {};
    const state = x.level === 'ok' ? '' : checkState(cycle, x);
    return `<tr><td>${esc((LEVEL[x.level] || LEVEL.info).label)}</td><td><strong>${esc(x.label)}</strong><div class="note-sub">${esc(x.detail || '')}</div></td><td>${esc(x.level === 'ok' ? '—' : WP_ST[state || ''])}</td><td>${esc(it.note || '')}</td></tr>`;
  };
  return `<article class="note">
    <header class="note-head">
      <div><div class="note-cab">${esc(data.settings.cabinet || '')}</div><h1>Contrôle de la TVA — ${esc(per.label)}</h1>
      <div class="note-sub">${esc(c ? c.nom : r.meta.fileName)}${ctl ? ` — validé${ctl.by ? ` par ${esc(ctl.by)}` : ''} le ${fmtDate(ctl.at.slice(0, 10))}` : ''}</div></div>
      <div class="note-date">${fmtDate(todayStr())}</div>
    </header>
    <h2>Calcul</h2>
    <p>TVA collectée ${eur(o.coll)} € ; TVA autoliquidée ${eur(o.auto)} € ; TVA déductible ${eur(round2(o.ded + o.dedImmo))} € ; crédit imputé ${eur(K.report)} € ; ${draft.net >= 0 ? `TVA nette à payer ${eur(draft.net)} €` : `crédit de TVA ${eur(-draft.net)} €`}.
      ${liq ? `Déclaration comptabilisée du ${fmtDate(liq.date)} : collectée ${eur(liq.coll)} €, déductible ${eur(liq.ded + liq.dedImmo)} €, à payer ${eur(liq.due)} €${liq.creditNew ? `, crédit reporté ${eur(liq.creditNew)} €` : ''}.` : 'Déclaration non comptabilisée.'}</p>
    <h2>Brouillon de déclaration</h2>
    <table class="note-table"><thead><tr><th>Ligne</th><th>Libellé</th><th>Base HT</th><th>TVA</th></tr></thead><tbody>
      ${draft.rows.map((x) => x.h ? `<tr><td colspan="4"><strong>${esc(x.h)}</strong></td></tr>` : `<tr><td>${esc(x.line)}</td><td>${esc(x.label)}</td><td>${x.base === undefined ? '' : eur(x.base) + ' €'}</td><td>${x.tva === undefined ? '' : eur(x.tva) + ' €'}</td></tr>`).join('')}
    </tbody></table>
    <h2>Contrôles</h2>
    <table class="note-table wp-table"><thead><tr><th>Niveau</th><th>Contrôle</th><th>Statut</th><th>Commentaire</th></tr></thead><tbody>${checks.map(row).join('')}</tbody></table>
    <p class="note-foot">Établi à partir du FEC, sur l'appareil du cabinet. Document de travail interne couvert par le secret professionnel.</p>
  </article>`;
}

function tvaExport(linesOnly) {
  const r = ui.fec.result;
  const K = tvaData(r);
  const { per, draft, checks, st, M } = K;
  const c = clientById(ui.fec.clientId);
  const t = (v, s) => ({ v, s: s === undefined ? 2 : s });
  const n = (v, s) => ({ v: Number(v) || 0, s: s || 8 });
  const lvl = (l) => (LEVEL[l] || LEVEL.info).label;
  const NAT = { op: 'Opération', decl: 'Déclaration', pay: 'Paiement' };
  const lines = [[t('Date', 1), t('Écriture', 1), t('Pièce', 1), t('Compte', 1), t('Libellé du compte', 1), t('Nature du compte', 1), t('Débit', 1), t('Crédit', 1), t("Type d'écriture", 1), t("Libellé de l'écriture", 1)]];
  M.groups.filter((g) => per.months.includes(g.ym)).forEach((g) => Object.entries(g.m).filter(([cpt]) => cpt.startsWith('445')).forEach(([cpt, v]) => {
    const a = M.acc[cpt] || {};
    lines.push([t(fmtDate(g.date)), t(g.ref), t(g.piece), t(cpt), t(a.lib || ''), t(TVA_ROLES[a.role] || ''), n(v > 0 ? v : 0), n(v < 0 ? -v : 0), t(NAT[g.kind]), t(g.lib)]);
  }));
  const accs = [[t('Compte', 1), t('Libellé', 1), t('Nature', 1), t("Solde d'ouverture", 1), t('Opérations', 1), t('Déclaration', 1), t('Paiement', 1), t('Solde de fin', 1)]]
    .concat(K.accounts.map((x) => [t(x.compte), t(x.lib), t(TVA_ROLES[x.role] || ''), n(x.start), n(x.op), n(x.decl), n(x.pay), n(x.end)]));
  const detail = [{ name: 'Comptes de TVA', rows: accs, widths: [12, 36, 30, 16, 16, 16, 16, 16], freeze: { row: 1 } }, { name: 'Écritures de TVA', rows: lines, widths: [11, 12, 14, 12, 32, 30, 14, 14, 14, 44], freeze: { row: 1 } }];
  if (linesOnly) {
    const b2 = XlsxWriter.build({ sheets: detail });
    return download(`ecritures-tva-${r.meta.siren || 'dossier'}-${per.key}.xlsx`, b2, b2.type);
  }
  const decl = [[{ v: `Contrôle de la TVA — ${per.label}${c ? ' — ' + c.nom : ''}`, s: 10 }], [], [t('Ligne', 1), t('Libellé', 1), t('Base HT', 1), t('TVA', 1)]]
    .concat(draft.rows.map((x) => (x.h ? [t(x.h, 1)] : [t(x.line), t(x.label), x.base === undefined ? t('') : n(x.base), x.tva === undefined ? t('') : n(x.tva, x.strong ? 9 : 8)])));
  const rapp = [[t('Taux', 1), t('Base HT', 1), t('TVA attendue', 1), t('TVA comptabilisée', 1), t('Écart', 1)]].concat(K.rapp.map((x) => [t(rateTxt(x.rate)), n(x.base), n(x.theo), x.compta === null ? t('') : n(x.compta), x.ecart === null ? t('') : n(x.ecart)]))
    .concat([[], [t('Compte', 1), t('Libellé', 1), t('Taux ou nature', 1), t('Montant', 1)]], K.caRows.map((x) => [t(x.compte), t(x.lib), t(typeof x.role === 'number' ? rateTxt(x.role) : CA_ROLES[x.role] || x.role), n(x.base)]));
  const ctl = [[t('Niveau', 1), t('Contrôle', 1), t('Détail', 1), t('Éléments', 1)]].concat(checks.map((x) => [t(lvl(x.level)), t(x.label), t(x.detail || ''), t((x.examples || []).join('\n'))]));
  const conc = [[t('Période', 1), t('Base taxable', 1), t('TVA collectée', 1), t('TVA brute', 1), t('TVA déductible', 1), t('Nette calculée', 1), t('Déclaration comptabilisée', 1), t('Déclarée', 1)]]
    .concat(tvaConcordance(r, st.kind).map((x) => [t(x.per.label), n(x.taxable), n(x.coll), n(x.brute), n(x.ded), n(x.net), x.liqNet === null ? t('') : n(x.liqNet), x.declNet === null ? t('') : n(x.declNet)]));
  const blob = XlsxWriter.build({ sheets: [
    { name: 'Déclaration', rows: decl, widths: [8, 70, 16, 16] },
    { name: 'CA par taux', rows: rapp, widths: [12, 40, 30, 18, 14] },
    ...detail,
    { name: 'Contrôles', rows: ctl, widths: [12, 55, 80, 90], freeze: { row: 1 } },
    { name: 'Concordance', rows: conc, widths: [22, 16, 16, 16, 16, 16, 18, 16], freeze: { row: 1 } },
  ] });
  download(`controle-tva-${r.meta.siren || 'dossier'}-${per.key}.xlsx`, blob, blob.type);
}
