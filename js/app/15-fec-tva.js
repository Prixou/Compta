/*
 * Suivi Dossiers — Contrôle de la TVA.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- Contrôle de la TVA du mois (ou du trimestre) ----------

const QUARTER_NAMES = ['1er', '2e', '3e', '4e'];
const TVA_KIND = { coll: 'TVA collectée', 'coll-att': 'Collectée en attente (non exigible)', ded: 'TVA déductible', 'ded-immo': 'TVA déductible sur immobilisations', autoliq: 'TVA autoliquidée', due: 'TVA à décaisser', credit: 'Crédit de TVA', regul: 'À régulariser (non déclarée)', autre: 'Autre' };

function tvaAccountsTable(core) {
  const tot = (k) => core.accounts.reduce((t, x) => t + x[k], 0);
  return `<div class="grid-wrap"><table class="dtable num tva-acc"><thead><tr><th>Compte</th><th>Libellé</th><th>Pris comme</th><th>Solde d'ouverture</th><th>Débit opérations</th><th>Crédit opérations</th><th>Liquidation</th><th>Paiement</th><th>Solde de fin</th></tr></thead>
    <tbody>${core.accounts.map((x) => `<tr><td>${esc(x.compte)}</td><td>${esc(x.lib)}</td><td class="small">${esc(TVA_KIND[x.kind] || '')}${x.rate ? ` · ${rateTxt(x.rate)}` : ''}</td>
      <td>${eur(x.start)}</td><td>${eur(x.d)}</td><td>${eur(x.c)}</td><td>${x.liq ? eur(x.liq) : ''}</td><td>${x.pay ? eur(x.pay) : ''}</td><td class="${Math.abs(x.end) >= 0.01 && /coll|ded/.test(x.kind) ? 'cred' : ''}">${eur(x.end)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><th colspan="3">Total</th><th>${eur(tot('start'))}</th><th>${eur(tot('d'))}</th><th>${eur(tot('c'))}</th><th>${eur(tot('liq'))}</th><th>${eur(tot('pay'))}</th><th>${eur(tot('end'))}</th></tr></tfoot></table></div>`;
}
const rateTxt = (r) => `${String(r).replace('.', ',')} %`;
// Ligne de la déclaration CA3 (formulaire 3310-CA3) pour chaque taux.
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
const prevPeriodKey = (key) => {
  const q = key.match(/^(\d{4})-T([1-4])$/);
  if (q) return Number(q[2]) > 1 ? `${q[1]}-T${Number(q[2]) - 1}` : `${Number(q[1]) - 1}-T4`;
  return ymOf(addDays(`${key}-01`, -1));
};

function tvaRegime() {
  const c = clientById(ui.fec.clientId);
  return c ? tvaShort(c.regimeTva) : '';
}

function tvaState() {
  const f = ui.fec;
  const T = f.result.cycles && f.result.cycles.tva;
  if (!f.tvaCtl && T) {
    const months = Object.keys(T.months).sort();
    let ym = ymOf(defaultArrete(f.result, 'situation'));
    if (!T.months[ym]) ym = months[months.length - 1];
    const kind = tvaRegime() === 'T' ? 'quarter' : 'month';
    f.tvaCtl = { kind, key: kind === 'quarter' ? quarterOf(ym) : ym };
  }
  return f.tvaCtl;
}

// Grand livre de la TVA par période : totaux, écriture de liquidation rattachée, soldes restant en compte.
// Une liquidation datée des derniers jours d'un mois concerne ce mois ; datée plus tôt, la période précédente
// (déclaration passée à la date de dépôt). Des montants identiques à l'une des deux périodes l'emportent sur la date.
function tvaLedger(r, kind) {
  if (r._tvaL && r._tvaL[kind]) return r._tvaL[kind];
  const T = r.cycles.tva;
  const months = Object.keys(T.months).sort();
  const keys = Array.from(new Set(months.map((ym) => (kind === 'quarter' ? quarterOf(ym) : ym))));
  const tot = {};
  keys.forEach((k) => {
    const t = (tot[k] = { coll: 0, ded: 0, auto: 0 });
    tvaPeriod(k).months.forEach((ym) => {
      const M = T.months[ym];
      if (!M) return;
      t.coll += M.coll; t.ded += M.dedAbs + M.dedImmo; t.auto += M.autoliq.biens.tva + M.autoliq.services.tva;
    });
  });
  const score = (l, k) => (tot[k] ? Math.abs(l.coll - tot[k].coll) + Math.abs(l.ded - tot[k].ded) + Math.abs(l.autoliq - tot[k].auto) : Infinity);
  const assigned = {}, extra = {};
  months.forEach((ym) => T.months[ym].liq.forEach((l) => {
    const k1 = kind === 'quarter' ? quarterOf(ym) : ym, k0 = prevPeriodKey(k1);
    const endOfM = l.date >= addDays(endOfMonth(l.date), -6);
    const firstOfQ = Number(ym.slice(5, 7)) % 3 === 1;
    const s1 = score(l, k1), s0 = score(l, k0);
    let pick = kind === 'quarter' ? (firstOfQ ? (s0 <= s1 ? k0 : k1) : k1) : endOfM ? k1 : k0;
    if (s0 < 1 && s1 >= 1) pick = k0;
    else if (s1 < 1 && s0 >= 1) pick = k1;
    if (!tot[pick]) pick = tot[k1] ? k1 : k0;
    if (!tot[pick]) return;
    l['_k' + kind] = pick;
    const cur = assigned[pick];
    if (!cur) assigned[pick] = l;
    else (extra[pick] = extra[pick] || []).push(score(l, pick) < score(cur, pick) ? ((assigned[pick] = l), cur) : l);
  }));
  // Solde des comptes d'une nature à la fin d'un mois (débit positif).
  const bal = (kinds, ym) => Object.entries(T.meta).filter(([, m]) => kinds.includes(m.kind))
    .reduce((t, [c, m]) => t + m.an + months.filter((k) => k <= ym).reduce((x, k) => x + (T.months[k].mv[c] || 0), 0), 0);
  const out = {};
  let prevRes = null;
  keys.forEach((k) => {
    const per = tvaPeriod(k);
    const lastYm = per.months.filter((ym) => T.months[ym]).pop();
    const liq = assigned[k] || null;
    const after = !!liq && liq.date > per.end;
    const res = {
      coll: round2(-bal(['coll'], lastYm) - (after ? liq.coll : 0)),
      ded: round2(bal(['ded', 'ded-immo'], lastYm) - (after ? liq.ded : 0)),
      autoliq: round2(-bal(['autoliq'], lastYm) - (after ? liq.autoliq : 0)),
      att: round2(-bal(['coll-att'], lastYm)),
      credit: round2(Math.max(0, bal(['credit'], lastYm) - (after ? liq.credit - liq.creditUsed : 0))),
    };
    // Paiement : règlement de la TVA à décaisser dans les deux mois qui suivent, au montant le plus proche
    const pays = [];
    const m1 = ymOf(addDays(per.end, 1)), m2 = ymOf(addDays(`${m1}-01`, 40));
    [m1, m2].forEach((ym) => (T.months[ym] ? T.months[ym].pay : []).forEach((p) => pays.push(p)));
    const due = liq ? liq.due : 0;
    const pay = due > 0 ? pays.slice().sort((a, b) => Math.abs(a.amt - due) - Math.abs(b.amt - due))[0] || null : null;
    out[k] = { per, tot: tot[k], liq, liqOk: !!liq && score(liq, k) <= Math.max(5, (tot[k].coll + tot[k].ded) * 0.002), after, extra: extra[k] || [], res, prevRes, pay, due };
    prevRes = res;
  });
  Object.defineProperty(r, '_tvaL', { value: Object.assign(r._tvaL || {}, { [kind]: out }), configurable: true, writable: true, enumerable: false });
  return out;
}

// Agrégats de la période (bases, taux, contrôles) et écriture de liquidation rattachée.
function tvaCore(r, per) {
  const T = r.cycles.tva;
  const A = {
    ca70: 0, serv: 0, rates: {}, other7: { base: 0, tva: 0, n: 0 }, unrated: { base: 0, tva: 0, n: 0 }, noVat: {}, coll: 0, collAtt: 0, collAcc: {}, collInv: 0,
    dedImmo: 0, dedAbs: 0, autoliq: { biens: { base: 0, tva: 0, n: 0, rates: {} }, services: { base: 0, tva: 0, n: 0, rates: {} } }, enc: { ttc: 0, tva: 0 }, chk: {}, months: 0,
  };
  per.months.forEach((ym) => {
    const M = T.months[ym];
    if (!M) return;
    A.months++;
    ['ca70', 'serv', 'coll', 'collAtt', 'collInv', 'dedImmo', 'dedAbs'].forEach((k) => { A[k] += M[k]; });
    Object.entries(M.rates).forEach(([rt, x]) => { const y = (A.rates[rt] = A.rates[rt] || { base: 0, tva: 0, n: 0 }); y.base += x.base; y.tva += x.tva; y.n += x.n; });
    ['other7', 'unrated', 'enc'].forEach((k) => Object.keys(M[k]).forEach((f) => { A[k][f] += M[k][f]; }));
    Object.entries(M.collAcc).forEach(([c, v]) => { A.collAcc[c] = (A.collAcc[c] || 0) + v; });
    Object.entries(M.noVat).forEach(([k, z]) => { const y = (A.noVat[k] = A.noVat[k] || { base: 0, n: 0, ex: [] }); y.base += z.base; y.n += z.n; y.ex = y.ex.concat(z.ex).slice(0, 30); });
    ['biens', 'services'].forEach((k) => {
      const a = A.autoliq[k], b = M.autoliq[k];
      a.base += b.base; a.tva += b.tva; a.n += b.n;
      Object.entries(b.rates).forEach(([rt, v]) => { a.rates[rt] = (a.rates[rt] || 0) + v; });
    });
    Object.entries(M.chk).forEach(([k, b]) => { const y = (A.chk[k] = A.chk[k] || { n: 0, total: 0, ex: [] }); y.n += b.n; y.total += b.total; y.ex = y.ex.concat(b.ex).slice(0, 30); });
  });
  A.autoliqTva = A.autoliq.biens.tva + A.autoliq.services.tva;
  A.ded = A.dedImmo + A.dedAbs;
  const L = tvaLedger(r, per.kind)[per.key] || { liq: null, liqOk: false, after: false, extra: [], res: { coll: 0, ded: 0, autoliq: 0, att: 0, credit: 0 }, prevRes: null, pay: null, due: 0 };
  // Report du crédit (ligne 22) : celui imputé par la liquidation, sinon le crédit disponible avant la déclaration à préparer.
  A.report = L.liq ? L.liq.creditUsed : L.res.credit;
  A.creditAvail = L.res.credit;
  // Comptes de TVA de la période : solde d'ouverture, mouvements des opérations, liquidation, paiement, solde de fin
  const months = Object.keys(T.months).sort();
  const accounts = Object.entries(T.meta).map(([c, m]) => {
    const start = m.an + months.filter((k) => k < per.months[0]).reduce((t, k) => t + (T.months[k].mv[c] || 0), 0);
    const x = { compte: c, lib: m.lib, kind: m.kind, rate: m.rate, start, d: 0, c: 0, liq: 0, pay: 0, n: 0 };
    per.months.forEach((ym) => { const a = T.months[ym] && T.months[ym].acc[c]; if (a) { x.d += a.d; x.c += a.c; x.liq += a.liq; x.pay += a.pay; x.n += a.n; } });
    x.end = round2(x.start + x.d - x.c + x.liq + x.pay);
    return x;
  }).filter((x) => x.n || Math.abs(x.start) >= 0.01 || Math.abs(x.end) >= 0.01).sort((a, b) => a.compte.localeCompare(b.compte));
  // Méthode des soldes (déclaration établie sur le solde des comptes avant liquidation, comme les logiciels de production) :
  // la TVA restée en compte des périodes précédentes est reprise. Seulement si le dossier comptabilise ses liquidations.
  // Pas de méthode des soldes si des liquidations d'autres périodes sont datées dans celle-ci (ex. trimestre d'un dossier mensuel).
  const kk = '_k' + per.kind;
  const foreign = L.extra.length > 0 || per.months.some((ym) => T.months[ym] && T.months[ym].liq.some((l) => l[kk] && l[kk] !== per.key && l[kk] !== prevPeriodKey(per.key)));
  const hasLiq = !foreign && months.some((k) => T.months[k].liq.length);
  const own = L.liq && !L.after ? L.liq : null;
  const sumEnd = (kinds) => accounts.filter((x) => kinds.includes(x.kind)).reduce((t, x) => t + x.end, 0);
  const solde = hasLiq ? {
    coll: round2(-sumEnd(['coll']) + (own ? own.coll : 0)),
    ded: round2(sumEnd(['ded', 'ded-immo']) + (own ? own.ded : 0)),
    autoliq: round2(-sumEnd(['autoliq']) + (own ? own.autoliq : 0)),
  } : null;
  A.relColl = solde ? round2(solde.coll - A.coll) : 0;
  A.relDed = solde ? round2(solde.ded - A.ded) : 0;
  A.relAuto = solde ? round2(solde.autoliq - A.autoliqTva) : 0;
  return Object.assign({ A, accounts, solde, hasLiq, hasAtt: Object.values(T.meta).some((m) => m.kind === 'coll-att') }, L);
}

// Brouillon de déclaration : lignes de la CA3, bases et TVA.
function tvaDraft(A, meta) {
  const rows = [];
  const byRate = {};
  const add = (rt, base, tva, src) => { const x = (byRate[rt] = byRate[rt] || { base: 0, tva: 0, src }); x.base += base; x.tva += tva; };
  let otherColl = 0;
  if (A.collAtt || Object.keys(A.collAcc).some((c) => (meta[c] || {}).kind === 'coll-att')) {
    // TVA sur les encaissements tenue en comptabilité : la déclaration retient la TVA virée en compte exigible.
    Object.entries(A.collAcc).forEach(([c, v]) => { const rt = (meta[c] || {}).rate; if (rt) add(rt, (v * 100) / rt, v, 'derived'); else otherColl += v; });
  } else {
    Object.entries(A.rates).forEach(([rt, x]) => add(Number(rt), x.base, x.tva, 'factures'));
    otherColl = A.coll - Object.values(A.rates).reduce((t, x) => t + x.tva, 0) - A.unrated.tva - A.other7.tva;
  }
  ['biens', 'services'].forEach((k) => Object.entries(A.autoliq[k].rates).forEach(([rt, v]) => {
    if (rt === 'x') { otherColl += v; return; }
    const x = (byRate[rt] = byRate[rt] || { base: 0, tva: 0 });
    x.base += (v * 100) / Number(rt); x.tva += v; x.auto = (x.auto || 0) + v;
  }));
  const noVat = (k) => (A.noVat[k] ? A.noVat[k].base : 0);
  const taxable = Object.values(A.rates).reduce((t, x) => t + x.base, 0) + A.unrated.base;
  rows.push({ h: 'A. Montant des opérations réalisées' });
  rows.push({ line: '01', label: 'Ventes, prestations de services', base: taxable });
  if (A.other7.base) rows.push({ line: '02', label: 'Autres opérations imposables', base: A.other7.base });
  if (A.autoliq.services.base) rows.push({ line: '2A', label: 'Achats de prestations de services intracommunautaires (autoliquidation)', base: A.autoliq.services.base });
  if (A.autoliq.biens.base) rows.push({ line: '03', label: 'Acquisitions intracommunautaires (ou importations, ligne 2B)', base: A.autoliq.biens.base });
  if (noVat('export')) rows.push({ line: '04', label: 'Exportations hors Union européenne', base: noVat('export') });
  if (noVat('exo') + noVat('autoliq')) rows.push({ line: '05', label: 'Autres opérations non imposables (exonérées, sous-traitance autoliquidée…)', base: noVat('exo') + noVat('autoliq') });
  if (noVat('intra')) rows.push({ line: '06', label: 'Livraisons intracommunautaires', base: noVat('intra') });
  if (noVat('unknown')) rows.push({ line: '?', label: 'Ventes sans TVA à qualifier', base: noVat('unknown'), warn: true });
  rows.push({ h: 'B. TVA brute' });
  Object.keys(byRate).map(Number).sort((a, b) => b - a).forEach((rt) => {
    const x = byRate[rt];
    rows.push({ line: CA3_RATE_LINE[rt] || '14', label: `Taux ${rateTxt(rt)}${x.auto ? ` (dont autoliquidation ${eur(x.auto)} €)` : ''}${x.src === 'derived' ? ' — base reconstituée' : ''}`, base: x.base, tva: x.tva });
  });
  if (A.unrated.tva) rows.push({ line: '?', label: 'TVA collectée au taux non identifié', base: A.unrated.base, tva: A.unrated.tva, warn: true });
  if (A.other7.tva) rows.push({ line: '', label: 'TVA sur autres opérations imposables', base: A.other7.base, tva: A.other7.tva });
  if (Math.abs(otherColl) >= 0.01) rows.push({ line: '', label: 'Autre TVA collectée (acomptes, régularisations, virements)', tva: otherColl });
  const rel = Math.abs(A.relColl || 0) >= 0.01 ? A.relColl : 0, relA = Math.abs(A.relAuto || 0) >= 0.01 ? A.relAuto : 0, relD = Math.abs(A.relDed || 0) >= 0.01 ? A.relDed : 0;
  if (rel) rows.push({ line: '', label: 'Reliquat de TVA collectée resté en compte (périodes précédentes)', tva: rel, warn: true });
  if (relA) rows.push({ line: '', label: 'Reliquat de TVA autoliquidée resté en compte', tva: relA, warn: true });
  const brute = A.coll + A.autoliqTva + rel + relA;
  rows.push({ line: '16', label: 'Total de la TVA brute due', tva: brute, strong: true });
  if (A.autoliq.biens.tva) rows.push({ line: '17', label: 'dont TVA sur acquisitions intracommunautaires', tva: A.autoliq.biens.tva });
  rows.push({ h: 'TVA déductible' });
  rows.push({ line: '19', label: 'Biens constituant des immobilisations', tva: A.dedImmo });
  rows.push({ line: '20', label: 'Autres biens et services', tva: A.dedAbs });
  if (relD) rows.push({ line: '20', label: 'Reliquat de TVA déductible resté en compte (périodes précédentes)', tva: relD, warn: true });
  if (A.report) rows.push({ line: '22', label: 'Report du crédit de la déclaration précédente', tva: A.report });
  const ded = A.ded + relD + A.report;
  rows.push({ line: '23', label: 'Total de la TVA déductible', tva: ded, strong: true });
  const net = brute - ded;
  rows.push(net >= 0 ? { line: '28', label: 'TVA nette due', tva: net, strong: true } : { line: '25', label: 'Crédit de TVA', tva: -net, strong: true });
  return { rows, brute: round2(brute), ded: round2(ded), net: round2(net), taxable: round2(taxable), byRate };
}

// Montants télédéclarés saisis par l'utilisateur (conservés, chiffrés, dans le dossier).
function tvaDeclStore() {
  const c = clientById(ui.fec.clientId);
  if (c) return (c.tvaDecl = c.tvaDecl || {});
  return (ui.fec.tvaDecl = ui.fec.tvaDecl || {});
}

function tvaChecks(r, per, core, draft) {
  const { A, liq, liqOk, liqAfter, res, pay, due } = core;
  const out = checksList();
  const ch = (k) => A.chk[k] || { n: 0, total: 0, ex: [] };
  const full = (b) => ({ full: b.ex.length >= b.n });
  const c = clientById(ui.fec.clientId);
  const reg = c ? norm(c.regimeTva) : '';
  const maxOp = r.pieces.maxOp || r.meta.maxDate;
  if (/franchise|non assujetti/.test(reg) && (A.coll > 0.01 || draft.taxable > 0.01)) out.add('error', 'TVA collectée alors que le dossier est en franchise ou non assujetti', `${eur(A.coll)} € de TVA collectée : régime du dossier à vérifier (dépassement des seuils de franchise ?).`);

  // Liquidation et soldes des comptes de TVA
  if (!liq) {
    if (maxOp && maxOp > addDays(per.end, 25)) out.add('warn', 'Aucune écriture de liquidation de la TVA', `La TVA de la période n'est pas soldée en comptabilité (pas d'écriture débitant la TVA collectée et créditant la TVA déductible et la TVA à décaisser) : déclaration non comptabilisée ?`);
    else out.add('info', 'Liquidation de la TVA non encore comptabilisée', 'Normal si la déclaration de la période n\'est pas encore déposée : le brouillon ci-dessus sert à la préparer.');
  } else {
    const diffs = [];
    const cmp = (label, a, b) => { if (Math.abs(a - b) >= 1) diffs.push(`${label} : calculé ${eur(a)} €, liquidé ${eur(b)} € (écart ${eur(a - b)} €)`); };
    cmp('TVA collectée', A.coll, liq.coll); cmp('TVA autoliquidée', A.autoliqTva, liq.autoliq); cmp('TVA déductible', A.ded, liq.ded);
    if (!liqOk || diffs.length) out.add('warn', `Écriture de liquidation du ${fmtDate(liq.date)} différente de la TVA de la période`, 'La déclaration comptabilisée ne reprend pas toute la TVA des écritures de la période : factures saisies après la déclaration, ou erreur de liquidation.', diffs);
    else out.add('ok', `Liquidation du ${fmtDate(liq.date)} conforme`, `TVA collectée ${eur(liq.coll)} €, déductible ${eur(liq.ded)} €${liq.due ? `, à payer ${eur(liq.due)} €` : ''}${liq.credit ? `, crédit ${eur(liq.credit)} €` : ''}.`);
    if (core.extra.length) out.add('info', 'Autres écritures de liquidation rattachées à la période', 'Écritures de TVA complémentaires ou rectificatives : vérifier qu\'elles ne font pas double emploi.', core.extra.map((l) => `${fmtDate(l.date)} · ${l.ref} · ${l.lib} : collectée ${eur(l.coll)} €, déductible ${eur(l.ded)} €, à payer ${eur(l.due)} €`));
    if (Math.abs(liq.other) >= 5) out.add('info', `Écart d'arrondi ou autre ligne dans la liquidation : ${eur(liq.other)} €`, "Montant passé en charges ou produits divers dans l'écriture de TVA : au-delà des arrondis à l'euro, à justifier.");
  }
  if (liq || (maxOp && maxOp > addDays(per.end, 25))) {
    const before = core.prevRes ? core.prevRes.coll : 0;
    if (res.coll >= 1) out.add('warn', `TVA collectée restée en compte : ${eur(res.coll)} €`, `Solde créditeur de la TVA collectée${liq ? ' après la liquidation' : ''}${Math.abs(before) >= 1 ? ` (dont ${eur(before)} € déjà présents à la fin de la période précédente)` : ''} : TVA comptabilisée mais non déclarée (factures saisies après la déclaration, avoirs, erreurs d'imputation). À régulariser sur la prochaine déclaration.`);
    else if (res.coll <= -1) out.add('warn', `TVA collectée liquidée en trop : ${eur(-res.coll)} €`, 'Solde débiteur de la TVA collectée après la liquidation : TVA déclarée deux fois ou facture supprimée après la déclaration ?');
    if (res.ded >= 1) out.add('info', `TVA déductible non récupérée : ${eur(res.ded)} €`, 'Solde débiteur de la TVA déductible après la liquidation : factures saisies après la déclaration (à récupérer sur la suivante), ou TVA sur prestations non encore payées.');
    else if (res.ded <= -1) out.add('warn', `TVA déductible récupérée en trop : ${eur(-res.ded)} €`, 'Solde créditeur de la TVA déductible après la liquidation : avoir fournisseur, doublon ou erreur de liquidation.');
    if (Math.abs(res.autoliq) >= 1) out.add('warn', `TVA autoliquidée non soldée : ${eur(res.autoliq)} €`, 'La TVA autoliquidée (4452) doit être reprise en TVA brute à chaque déclaration.');
  }
  if (liq && due > 0) {
    const late = maxOp && maxOp > addDays(per.end, 40);
    if (!pay) { if (late) out.add('warn', 'Paiement de la TVA non trouvé', `${eur(due)} € à payer selon la liquidation : aucun règlement de la TVA à décaisser dans les deux mois suivants.`); }
    else if (Math.abs(pay.amt - due) >= 1) out.add('warn', `Paiement de la TVA différent du montant dû : ${eur(pay.amt)} € pour ${eur(due)} €`, `Règlement du ${fmtDate(pay.date)} (${pay.lib}) : écart de ${eur(pay.amt - due)} €.`);
    else out.add('ok', `TVA payée le ${fmtDate(pay.date)}`, `${eur(pay.amt)} €.`);
  }

  // TVA collectée
  const rt = ch('rate'), mm = ch('mismatch');
  if (rt.n) out.add('warn', 'TVA collectée à un taux non identifié', `${rt.n} écriture(s) dont la TVA ne correspond à aucun taux légal (écart total ${eur(rt.total)} €) : erreur de saisie ou de paramétrage ?`, rt.ex, full(rt));
  if (mm.n) out.add('warn', 'Taux de TVA différent du taux du compte de vente', `${mm.n} écriture(s) : la TVA appliquée ne correspond pas au taux indiqué sur le compte de vente.`, mm.ex, full(mm));
  if (!rt.n && !mm.n && Object.keys(A.rates).length) out.add('ok', 'TVA collectée cohérente avec les bases', `Taux appliqués : ${Object.keys(A.rates).map(Number).sort((a, b) => b - a).map(rateTxt).join(', ')}.`);
  const nv = (k) => A.noVat[k] || { base: 0, n: 0, ex: [] };
  if (nv('unknown').n) out.add('warn', 'Ventes sans TVA à justifier', `${nv('unknown').n} facture(s), ${eur(nv('unknown').base)} € HT : export, livraison intracommunautaire, opération exonérée… ou TVA oubliée ?`, nv('unknown').ex, { full: nv('unknown').ex.length >= nv('unknown').n });
  if (nv('export').n) out.add('info', `Exportations : ${eur(nv('export').base)} € HT (ligne 04)`, "Justificatifs d'exportation (déclaration en douane) à conserver.", nv('export').ex);
  if (nv('intra').n) out.add('info', `Livraisons intracommunautaires : ${eur(nv('intra').base)} € HT (ligne 06)`, "N° de TVA intracommunautaire du client sur la facture ; état récapitulatif TVA (biens) ou déclaration européenne de services à déposer.", nv('intra').ex);
  if (nv('exo').n || nv('autoliq').n) out.add('info', `Opérations non imposables : ${eur(nv('exo').base + nv('autoliq').base)} € HT (ligne 05)`, 'Exonérations, débours, sous-traitance autoliquidée : mention correspondante sur la facture.', nv('exo').ex.concat(nv('autoliq').ex));
  if (A.collAtt || core.hasAtt) out.add('info', `TVA sur les encaissements en attente : ${eur(core.res.att)} €`, `TVA facturée non encore exigible (comptes d'attente) ; ${eur(A.collAtt)} € de mouvement net sur la période. Seule la TVA virée en TVA exigible est déclarée.`);
  else if (A.ca70 > 0 && A.serv >= A.ca70 * 0.3 && A.enc.tva > 0) out.add('info', 'Prestations de services : TVA exigible à l\'encaissement', `Sauf option pour les débits, la TVA des prestations est due à l'encaissement : TVA comprise dans les règlements clients de la période ≈ ${eur(A.enc.tva)} €, contre ${eur(A.collInv)} € de TVA facturée. Vérifiez l'option du dossier.`);

  // TVA déductible
  const b = (k) => ch(k);
  if (b('autoliqND').n) out.add('warn', 'TVA autoliquidée non déduite', `${b('autoliqND').n} facture(s), ${eur(b('autoliqND').total)} € : la TVA autoliquidée est en principe déductible en même temps (ligne 20 ou 19).`, b('autoliqND').ex, full(b('autoliqND')));
  if (A.autoliqTva) out.add('info', `Autoliquidation : ${eur(A.autoliqTva)} € de TVA`, `${A.autoliq.biens.tva ? `Biens ${eur(A.autoliq.biens.base)} € HT (ligne 03, TVA ligne 17)` : ''}${A.autoliq.biens.tva && A.autoliq.services.tva ? ' ; ' : ''}${A.autoliq.services.tva ? `services ${eur(A.autoliq.services.base)} € HT (ligne 2A)` : ''} : TVA reprise en TVA brute et déduite.`);
  if (b('vehicle').n) out.add('warn', 'TVA déduite sur des véhicules de tourisme', `${b('vehicle').n} écriture(s), ${eur(b('vehicle').total)} € : la TVA sur l'achat, la location, le crédit-bail et l'entretien des véhicules de tourisme n'est pas récupérable (sauf utilitaires et activités de transport, location ou auto-école).`, b('vehicle').ex, full(b('vehicle')));
  if (b('fuel').n) out.add('info', `TVA sur carburants : ${eur(b('fuel').total)} €`, `Véhicules de tourisme : 80 % récupérable (gazole et essence) ; utilitaires : 100 %. Part non récupérable si véhicules de tourisme : ${eur(b('fuel').total * 0.2)} €.`, b('fuel').ex, full(b('fuel')));
  if (b('lodging').n) out.add('warn', "TVA déduite sur de l'hébergement", `${b('lodging').n} écriture(s), ${eur(b('lodging').total)} € : non récupérable pour l'hébergement des dirigeants et du personnel (récupérable pour celui des clients ou de tiers).`, b('lodging').ex, full(b('lodging')));
  if (b('gift').n) out.add('warn', 'TVA déduite sur des cadeaux de plus de 73 € TTC', `${b('gift').n} écriture(s), ${eur(b('gift').total)} € : non récupérable au-delà de 73 € TTC par bénéficiaire et par an.`, b('gift').ex, full(b('gift')));
  if (b('perso').n) out.add('warn', 'TVA déduite sur des dépenses à caractère personnel possibles', `${b('perso').n} écriture(s), ${eur(b('perso').total)} € : déductible seulement si la dépense est engagée pour l'entreprise.`, b('perso').ex, full(b('perso')));
  if (b('overP').n) out.add('warn', 'TVA déductible supérieure à 20 % du HT', `${b('overP').n} écriture(s) : erreur de saisie ou TVA déduite deux fois ?`, b('overP').ex, full(b('overP')));
  if (b('immoAbs').n) out.add('info', 'TVA sur immobilisations comptabilisée en autres biens et services', `${eur(b('immoAbs').total)} € : à déclarer ligne 19 (immobilisations) et non ligne 20.`, b('immoAbs').ex, full(b('immoAbs')));
  if (b('absImmo').n) out.add('info', 'TVA sur charges comptabilisée en TVA sur immobilisations', `${eur(b('absImmo').total)} € : à déclarer ligne 20 et non ligne 19.`, b('absImmo').ex, full(b('absImmo')));
  if (b('noVatP').n) out.add('info', 'Factures fournisseurs sans TVA (150 € HT ou plus)', `${b('noVatP').n} facture(s), ${eur(b('noVatP').total)} € HT : fournisseur non assujetti, loyer non soumis, autoliquidation à passer, ou TVA oubliée ?`, b('noVatP').ex, full(b('noVatP')));

  // Crédit de TVA et cohérence avec les autres périodes
  if (draft.net <= -760) out.add('info', `Crédit de TVA de ${eur(-draft.net)} € : remboursement possible`, `Crédit d'au moins 760 € : remboursement demandable sur la déclaration (formulaire 3519), à défaut report sur la suivante.`);
  const T = r.cycles.tva;
  const others = Object.keys(T.months).filter((k) => !per.months.includes(k) && T.months[k].ca70 > 0);
  const ratio = (list) => { const ca = list.reduce((t, k) => t + T.months[k].ca70, 0); return ca > 0 ? list.reduce((t, k) => t + T.months[k].coll, 0) / ca : null; };
  const avg = ratio(others), cur = A.ca70 > 0 ? A.coll / A.ca70 : null;
  if (avg !== null && cur !== null && others.length >= 3 && Math.abs(cur - avg) >= 0.02) out.add('info', `TVA collectée : ${pctFr(cur)} du chiffre d'affaires contre ${pctFr(avg)} en moyenne`, 'Variation du taux apparent de TVA : changement de la répartition des ventes par taux, ventes sans TVA ou erreurs de saisie ?');
  const prev = fecPrev();
  const PT = prev && prev.cycles.tva;
  if (PT) {
    const ly = per.months.map((ym) => `${Number(ym.slice(0, 4)) - 1}${ym.slice(4)}`).filter((k) => PT.months[k]);
    const caP = ly.reduce((t, k) => t + PT.months[k].ca70, 0), tvP = ly.reduce((t, k) => t + PT.months[k].coll, 0);
    if (ly.length && caP > 0 && Math.abs(A.ca70 - caP) / caP >= 0.3) out.add('info', `Chiffre d'affaires ${A.ca70 > caP ? 'en hausse' : 'en baisse'} de ${pctFr(Math.abs(A.ca70 - caP) / caP, 0)} sur un an`, `${eur(caP, 0)} € → ${eur(A.ca70, 0)} € HT ; TVA collectée ${eur(tvP, 0)} € → ${eur(A.coll, 0)} €.`);
  }

  // Montants télédéclarés
  const d = tvaDeclStore()[per.key];
  if (d) {
    const diffs = [];
    const cmp = (label, decl, calc) => { if (decl !== '' && decl !== undefined && decl !== null && Math.abs(Number(decl) - calc) >= 1) diffs.push(`${label} : déclaré ${eur(decl)} €, comptabilité ${eur(calc)} € (écart ${eur(Number(decl) - calc)} €)`); };
    cmp('Ligne 01 (base des ventes)', d.b01, draft.taxable); cmp('Ligne 16 (TVA brute)', d.t16, draft.brute); cmp('Ligne 23 (TVA déductible)', d.t23, draft.ded); cmp('Net à payer (+) ou crédit (−)', d.net, draft.net);
    if (diffs.length) out.add('error', 'Déclaration déposée différente de la comptabilité', 'Écarts entre les montants télédéclarés et les écritures de la période : déclaration rectificative ou régularisation sur la suivante.', diffs);
    else if (['b01', 't16', 't23', 'net'].some((k) => d[k] !== '' && d[k] !== undefined)) out.add('ok', 'Déclaration déposée conforme à la comptabilité', 'Les montants télédéclarés saisis correspondent aux écritures de la période.');
  }
  return out;
}

function tvaData(r) {
  const st = tvaState();
  const per = tvaPeriod(st.key);
  const core = tvaCore(r, per);
  const draft = tvaDraft(core.A, r.cycles.tva.meta);
  const cycle = `tva-${per.key}`;
  const checks = applyMemo(tvaChecks(r, per, core, draft), cycle);
  return { st, per, core, draft, cycle, checks };
}

// Concordance sur l'exercice : TVA calculée, liquidée et déclarée, période par période.
function tvaConcordance(r, kind) {
  const T = r.cycles.tva;
  const keys = Array.from(new Set(Object.keys(T.months).sort().map((ym) => (kind === 'quarter' ? quarterOf(ym) : ym))));
  const decl = tvaDeclStore();
  return keys.map((key) => {
    const per = tvaPeriod(key);
    const core = tvaCore(r, per);
    const draft = tvaDraft(core.A, T.meta);
    const d = decl[key];
    const declNet = d && d.net !== '' && d.net !== undefined ? Number(d.net) : null;
    const liqNet = core.liq ? round2(core.liq.due - core.liq.credit) : null;
    return { key, per, ca: core.A.ca70, taxable: draft.taxable, brute: draft.brute, ded: draft.ded, net: draft.net, liqNet, declNet, ok: (controlOf(key) || {}).at };
  });
}

const controlOf = (key) => { const c = clientById(ui.fec.clientId); return c && c.tvaControles ? c.tvaControles[key] : (ui.fec.tvaControles || {})[key]; };

function viewTva() {
  const f = ui.fec;
  const r = f.result;
  if (!r.cycles || !r.cycles.tva || !Object.keys(r.cycles.tva.months).length) return '<section class="card"><p class="muted">Aucune écriture datée : contrôle de la TVA impossible.</p></section>';
  const { st, per, core, draft, cycle, checks } = tvaData(r);
  const { A, liq, liqOk, res, pay } = core;
  const T = r.cycles.tva;
  const months = Object.keys(T.months).sort();
  const keys = st.kind === 'quarter' ? Array.from(new Set(months.map(quarterOf))) : months;
  const reg = tvaRegime();
  const ctl = controlOf(per.key);
  const pg = wpProgress(cycle, checks);
  const c = clientById(f.clientId);
  const d = tvaDeclStore()[per.key] || {};
  const cell = (v) => (v === undefined || v === null ? '' : eur(v));
  const regTxt = { M: 'TVA mensuelle', T: 'TVA trimestrielle', CA12: 'régime simplifié (CA12 annuelle)', F: 'franchise en base' }[reg];
  const conc = tvaConcordance(r, st.kind);
  const sumRates = Object.entries(A.rates).sort((a, b) => Number(b[0]) - Number(a[0]));
  return `
    <section class="card">
      <div class="card-head"><h2>Contrôle de la TVA — ${esc(per.label)}</h2>
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
      ${reg === 'CA12' ? '<div class="banner info"><span>Dossier au régime simplifié : ce contrôle mensuel sert à suivre la TVA en cours d\'année ; la déclaration annuelle CA12 reprend l\'exercice entier.</span></div>' : ''}
      ${A.months < per.months.length ? `<div class="banner warn"><span>Le FEC ne couvre que ${A.months} mois sur ${per.months.length} de la période.</span></div>` : ''}
      <div class="kpis fec-kpis">
        ${kpiTile('TVA brute (collectée et autoliquidée)', eurK(draft.brute))}
        ${kpiTile('TVA déductible', eurK(draft.ded))}
        ${kpiTile(draft.net >= 0 ? 'TVA nette à payer' : 'Crédit de TVA', `${eur(Math.abs(draft.net), 0)} €`, draft.net < 0 ? 'kpi-wait' : '')}
        ${kpiTile('Points à vérifier', pg.left, pg.left ? 'kpi-wait' : '')}
        ${kpiTile('Liquidation comptabilisée', liq ? (liqOk ? `✓ ${fmtDate(liq.date)}` : `≠ ${fmtDate(liq.date)}`) : '—', liq && !liqOk ? 'kpi-late' : '')}
      </div>
      <div class="tva-validate">
        ${ctl ? `<span class="lvl lvl-ok"><b aria-hidden="true">✓</b>Contrôle validé${ctl.by ? ` par ${esc(ctl.by)}` : ''} le ${fmtDate(ctl.at.slice(0, 10))}${ctl.net !== undefined ? ` (${ctl.net >= 0 ? 'à payer' : 'crédit'} ${eur(Math.abs(ctl.net))} €)` : ''}</span> <button class="link-btn" data-action="tva-validate" data-undo="1">Annuler</button>`
          : `<button class="btn primary" data-action="tva-validate">✓ Valider le contrôle de ${esc(per.label)}</button>
             <span class="muted small">${c ? `Coche l'étape « Contrôle et calcul de la TVA » de la mission ${esc(per.exercice)} du dossier et note le contrôle au journal.` : 'Rattachez l\'analyse à un dossier pour conserver le contrôle.'}</span>`}
      </div>
    </section>
    <div class="grid2">
      <section class="card"><h2>Brouillon de déclaration (CA3)</h2>
        <div class="grid-wrap"><table class="dtable num tva-draft"><thead><tr><th>Ligne</th><th>Libellé</th><th>Base HT</th><th>TVA</th></tr></thead>
        <tbody>${draft.rows.map((x) => x.h ? `<tr class="tva-h"><td colspan="4">${esc(x.h)}</td></tr>`
          : `<tr class="${x.strong ? 'strong' : ''}${x.warn ? ' flag' : ''}"><td>${esc(x.line)}</td><td>${esc(x.label)}</td><td>${cell(x.base)}</td><td>${cell(x.tva)}</td></tr>`).join('')}</tbody></table></div>
        <p class="muted small">Reconstitué à partir des écritures de la période (numéros de ligne du formulaire 3310-CA3). À comparer à la déclaration préparée dans votre logiciel : les taxes assimilées, les régularisations et les ventilations particulières (annexe 3310 A) restent à ajouter.</p>
      </section>
      <section class="card"><h2>Rapprochement avec la comptabilité</h2>
        <div class="grid-wrap"><table class="dtable num"><thead><tr><th></th><th>Écritures de la période</th><th>${liq ? `Liquidation du ${fmtDate(liq.date)}` : 'Liquidation'}</th><th>Écart</th></tr></thead>
        <tbody>${[['TVA collectée', A.coll, liq && liq.coll], ['TVA autoliquidée', A.autoliqTva, liq && liq.autoliq], ['TVA déductible', A.ded, liq && liq.ded], ['Crédit imputé', A.report, liq && liq.creditUsed], ['TVA à payer', Math.max(0, draft.net), liq && liq.due], ['Crédit à reporter', Math.max(0, -draft.net), liq && liq.credit]]
          .map(([l, a, b]) => `<tr><td>${l}</td><td>${eur(a)}</td><td>${liq ? eur(b) : '—'}</td><td class="${liq && Math.abs(a - b) >= 1 ? 'cred' : ''}">${liq ? eur(a - b) : ''}</td></tr>`).join('')}</tbody></table></div>
        <table class="dtable num sig"><tbody>
          <tr><td>TVA collectée restant en compte${liq ? ' après liquidation' : ''}</td><td class="${Math.abs(res.coll) >= 1 ? 'cred' : ''}">${eur(res.coll)}</td></tr>
          <tr><td>TVA déductible restant en compte${liq ? ' après liquidation' : ''}</td><td>${eur(res.ded)}</td></tr>
          ${core.hasAtt ? `<tr><td>TVA sur encaissements en attente</td><td>${eur(res.att)}</td></tr>` : ''}
          ${A.creditAvail ? `<tr><td>Crédit de TVA disponible (44567)</td><td>${eur(A.creditAvail)}</td></tr>` : ''}
          <tr><td>Paiement</td><td>${pay ? `${eur(pay.amt)} € le ${fmtDate(pay.date)}` : core.due > 0 ? 'non trouvé' : '—'}</td></tr>
        </tbody></table>
        <p class="muted small">Après chaque liquidation, les comptes de TVA collectée et déductible doivent être soldés : un reste signale de la TVA comptabilisée mais non déclarée.</p>
      </section>
    </div>
    <section class="card"><h2>Comptes de TVA de la période</h2>
      <p class="muted small">À comparer ligne à ligne avec la balance ou le grand livre des comptes 445 dans votre logiciel (ACD…) pour la même période. Soldes : débiteurs positifs, créditeurs négatifs. « Liquidation » : écriture de déclaration de TVA ; « Paiement » : règlement de la TVA à décaisser. ${core.solde ? `Solde à déclarer avant liquidation : TVA collectée ${eur(core.solde.coll)} €, déductible ${eur(core.solde.ded)} €${Math.abs(A.relColl) >= 0.01 || Math.abs(A.relDed) >= 0.01 ? ` — dont reliquats des périodes précédentes ${eur(A.relColl)} € collectée et ${eur(A.relDed)} € déductible` : ''}.` : 'Aucune liquidation de TVA comptabilisée dans le FEC : la TVA de la période est calculée sur les seules écritures de la période.'}</p>
      ${tvaAccountsTable(core)}
      <div class="pieces-actions"><button class="btn small" data-action="tva-lines">Exporter le détail des lignes de TVA (Excel)</button></div>
    </section>
    <section class="card"><h2>TVA collectée par taux</h2>
      ${sumRates.length || A.unrated.n ? `<div class="grid-wrap"><table class="dtable num"><thead><tr><th>Taux</th><th>Écritures</th><th>Base HT</th><th>TVA comptabilisée</th><th>TVA théorique</th><th>Écart</th></tr></thead>
      <tbody>${sumRates.map(([rt, x]) => { const theo = (x.base * Number(rt)) / 100; return `<tr><td>${rateTxt(Number(rt))}</td><td>${x.n}</td><td>${eur(x.base)}</td><td>${eur(x.tva)}</td><td>${eur(theo)}</td><td class="${Math.abs(x.tva - theo) >= 1 ? 'cred' : ''}">${eur(x.tva - theo)}</td></tr>`; }).join('')}
        ${A.unrated.n ? `<tr class="flag"><td>Non identifié</td><td>${A.unrated.n}</td><td>${eur(A.unrated.base)}</td><td>${eur(A.unrated.tva)}</td><td>—</td><td></td></tr>` : ''}</tbody></table></div>
      <p class="muted small">Taux lu sur les comptes de TVA collectée (« TVA collectée 10 % »), sinon déduit du rapport TVA / base de chaque écriture ; les écritures à plusieurs taux sont ventilées entre les taux habituels du dossier. Chiffre d'affaires de la période (70) : ${eur(A.ca70)} € HT.</p>` : '<p class="muted">Aucune vente avec TVA sur la période.</p>'}
    </section>
    <section class="card"><h2>Contrôles <span class="count">${pg.left}</span></h2>
      <div class="wp-bar"><span class="wp-progress"><span class="wp-track"><i data-w="${pg.total ? Math.round((pg.done / pg.total) * 100) : 100}"></i></span>${pg.done} / ${pg.total} point(s) traité(s)${pg.wait ? ` · ${pg.wait} en attente de pièce` : ''}</span></div>
      ${wpCheckList(checks, cycle)}
    </section>
    <section class="card"><h2>Montants télédéclarés <span class="muted small">(facultatif)</span></h2>
      <p class="muted small">Saisissez les montants de la déclaration déposée pour la comparer aux écritures : un écart signale une déclaration à rectifier ou une régularisation à prévoir. Conservés${c ? ', chiffrés, dans le dossier' : ' pendant la session (rattachez un dossier pour les conserver)'}.</p>
      <div class="filters tva-decl">
        <label class="inline-label">Ligne 01 <input type="number" step="0.01" data-tva-decl="b01" value="${esc(d.b01 ?? '')}" placeholder="${eur(draft.taxable, 0)}"></label>
        <label class="inline-label">Ligne 16 <input type="number" step="0.01" data-tva-decl="t16" value="${esc(d.t16 ?? '')}" placeholder="${eur(draft.brute, 0)}"></label>
        <label class="inline-label">Ligne 23 <input type="number" step="0.01" data-tva-decl="t23" value="${esc(d.t23 ?? '')}" placeholder="${eur(draft.ded, 0)}"></label>
        <label class="inline-label">Net (à payer +, crédit −) <input type="number" step="0.01" data-tva-decl="net" value="${esc(d.net ?? '')}" placeholder="${eur(draft.net, 0)}"></label>
      </div>
    </section>
    <section class="card"><h2>Concordance de la TVA sur l'exercice</h2>
      <div class="grid-wrap"><table class="dtable num tva-conc"><thead><tr><th>Période</th><th>CA HT (70)</th><th>Base taxable</th><th>TVA brute</th><th>TVA déductible</th><th>Nette calculée</th><th>Liquidée</th><th>Déclarée</th><th>Écart</th><th>Contrôle</th></tr></thead>
      <tbody>${conc.map((x) => {
        const ref = x.declNet !== null ? x.declNet : x.liqNet;
        const gap = ref === null ? null : round2(x.net - ref);
        return `<tr class="${x.key === per.key ? 'strong' : ''}"><td><button class="link-btn" data-action="tva-goto" data-key="${x.key}">${esc(x.per.label)}</button></td><td>${eur(x.ca, 0)}</td><td>${eur(x.taxable, 0)}</td><td>${eur(x.brute, 0)}</td><td>${eur(x.ded, 0)}</td><td>${eur(x.net, 0)}</td>
          <td>${x.liqNet === null ? '—' : eur(x.liqNet, 0)}</td><td>${x.declNet === null ? '' : eur(x.declNet, 0)}</td><td class="${gap !== null && Math.abs(gap) >= 1 ? 'cred' : ''}">${gap === null ? '' : Math.abs(gap) < 1 ? '0' : eur(gap, 0)}</td><td>${x.ok ? '✓' : ''}</td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr><th>Total</th><th>${eur(conc.reduce((t, x) => t + x.ca, 0), 0)}</th><th>${eur(conc.reduce((t, x) => t + x.taxable, 0), 0)}</th><th>${eur(conc.reduce((t, x) => t + x.brute, 0), 0)}</th><th>${eur(conc.reduce((t, x) => t + x.ded, 0), 0)}</th><th>${eur(conc.reduce((t, x) => t + x.net, 0), 0)}</th><th>${eur(conc.reduce((t, x) => t + (x.liqNet || 0), 0), 0)}</th><th></th><th></th><th></th></tr></tfoot></table></div>
      <p class="muted small">Nette calculée : TVA brute − TVA déductible (positive : à payer, négative : crédit). Écart : avec la déclaration saisie, à défaut avec la liquidation comptabilisée. Ce tableau sert aussi au contrôle de concordance du chiffre d'affaires et de la TVA à la clôture.</p>
    </section>`;
}

function tvaValidate(undo) {
  const f = ui.fec;
  const r = f.result;
  const { per, draft, core } = tvaData(r);
  const c = clientById(f.clientId);
  const store = c ? (c.tvaControles = c.tvaControles || {}) : (f.tvaControles = f.tvaControles || {});
  if (undo) {
    delete store[per.key];
    if (c) { log(c.id, `Contrôle de la TVA de ${per.label} annulé.`, true); persist(); }
    return refresh();
  }
  store[per.key] = { at: nowIso(), by: data.settings.utilisateur || '', net: draft.net, brute: draft.brute, ded: draft.ded, liq: core.liq ? core.liq.date : '' };
  if (c) {
    log(c.id, `Contrôle de la TVA de ${per.label} validé depuis le FEC : ${draft.net >= 0 ? `${eur(draft.net)} € à payer` : `crédit de ${eur(-draft.net)} €`}.`, true);
    const done = autoStep(c.id, ['tva'], [per.exercice], /^contr[ôo]le/i, 'contrôle de la TVA validé depuis l\'analyse du FEC');
    persist();
    toast(done ? `Contrôle validé — ${done}.` : 'Contrôle validé et noté au journal du dossier.');
  } else toast('Contrôle validé pour cette session : rattachez un dossier pour le conserver.');
  refresh();
}

function tvaHtml() {
  const r = ui.fec.result;
  const { per, core, draft, cycle, checks } = tvaData(r);
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
    <h2>Brouillon de déclaration</h2>
    <table class="note-table"><thead><tr><th>Ligne</th><th>Libellé</th><th>Base HT</th><th>TVA</th></tr></thead><tbody>
      ${draft.rows.map((x) => x.h ? `<tr><td colspan="4"><strong>${esc(x.h)}</strong></td></tr>` : `<tr><td>${esc(x.line)}</td><td>${esc(x.label)}</td><td>${x.base === undefined ? '' : eur(x.base) + ' €'}</td><td>${x.tva === undefined ? '' : eur(x.tva) + ' €'}</td></tr>`).join('')}
    </tbody></table>
    <h2>Rapprochement</h2>
    <p>${core.liq ? `Liquidation du ${fmtDate(core.liq.date)} : TVA collectée ${eur(core.liq.coll)} €, déductible ${eur(core.liq.ded)} €, à payer ${eur(core.liq.due)} €${core.liq.credit ? `, crédit ${eur(core.liq.credit)} €` : ''}.` : 'Liquidation non comptabilisée.'}
      TVA collectée restant en compte : ${eur(core.res.coll)} € ; TVA déductible restant en compte : ${eur(core.res.ded)} €.${core.pay ? ` Paiement de ${eur(core.pay.amt)} € le ${fmtDate(core.pay.date)}.` : ''}</p>
    <h2>Contrôles</h2>
    <table class="note-table wp-table"><thead><tr><th>Niveau</th><th>Contrôle</th><th>Statut</th><th>Commentaire</th></tr></thead><tbody>${checks.map(row).join('')}</tbody></table>
    <p class="note-foot">Établi à partir du FEC, sur l'appareil du cabinet. Document de travail interne couvert par le secret professionnel.</p>
  </article>`;
}

function tvaExport(linesOnly) {
  const r = ui.fec.result;
  const { per, draft, checks, st, core } = tvaData(r);
  const T = r.cycles.tva;
  const c = clientById(ui.fec.clientId);
  const t = (v, s) => ({ v, s: s === undefined ? 2 : s });
  const n = (v, s) => ({ v: Number(v) || 0, s: s || 8 });
  const lvl = (l) => (LEVEL[l] || LEVEL.info).label;
  const decl = [[{ v: `Contrôle de la TVA — ${per.label}${c ? ' — ' + c.nom : ''}`, s: 10 }], [], [t('Ligne', 1), t('Libellé', 1), t('Base HT', 1), t('TVA', 1)]]
    .concat(draft.rows.map((x) => (x.h ? [t(x.h, 1)] : [t(x.line), t(x.label), x.base === undefined ? t('') : n(x.base), x.tva === undefined ? t('') : n(x.tva, x.strong ? 9 : 8)])));
  const ctl = [[t('Niveau', 1), t('Contrôle', 1), t('Détail', 1), t('Éléments', 1)]].concat(checks.map((x) => [t(lvl(x.level)), t(x.label), t(x.detail || ''), t((x.examples || []).join('\n'))]));
  const conc = [[t('Période', 1), t('CA HT (70)', 1), t('Base taxable', 1), t('TVA brute', 1), t('TVA déductible', 1), t('Nette calculée', 1), t('Liquidée', 1), t('Déclarée', 1)]]
    .concat(tvaConcordance(r, st.kind).map((x) => [t(x.per.label), n(x.ca), n(x.taxable), n(x.brute), n(x.ded), n(x.net), x.liqNet === null ? t('') : n(x.liqNet), x.declNet === null ? t('') : n(x.declNet)]));
  const NAT = { op: 'Opération', liq: 'Liquidation', pay: 'Paiement' };
  const lines = [[t('Date', 1), t('Écriture', 1), t('Pièce', 1), t('Compte', 1), t('Libellé du compte', 1), t('Pris comme', 1), t('Débit', 1), t('Crédit', 1), t('Nature', 1), t("Libellé de l'écriture", 1)]]
    .concat(per.months.flatMap((ym) => (T.months[ym] ? T.months[ym].lines : [])).map(([date, ref, piece, compte, d, c, cls, lib]) => [t(fmtDate(date)), t(ref), t(piece), t(compte), t((T.meta[compte] || {}).lib || ''), t(TVA_KIND[(T.meta[compte] || {}).kind] || ''), n(d), n(c), t(NAT[cls] || cls), t(lib)]));
  const accs = [[t('Compte', 1), t('Libellé', 1), t('Pris comme', 1), t("Solde d'ouverture", 1), t('Débit opérations', 1), t('Crédit opérations', 1), t('Liquidation', 1), t('Paiement', 1), t('Solde de fin', 1)]]
    .concat(core.accounts.map((x) => [t(x.compte), t(x.lib), t(TVA_KIND[x.kind] || ''), n(x.start), n(x.d), n(x.c), n(x.liq), n(x.pay), n(x.end)]));
  const detail = [{ name: 'Comptes de TVA', rows: accs, widths: [12, 36, 30, 16, 16, 16, 16, 16, 16], freeze: { row: 1 } }, { name: 'Lignes de TVA', rows: lines, widths: [11, 12, 14, 12, 32, 28, 14, 14, 13, 44], freeze: { row: 1 } }];
  if (linesOnly) {
    const b2 = XlsxWriter.build({ sheets: detail });
    return download(`lignes-tva-${r.meta.siren || 'dossier'}-${per.key}.xlsx`, b2, b2.type);
  }
  const blob = XlsxWriter.build({ sheets: [
    { name: 'Déclaration', rows: decl, widths: [8, 70, 16, 16], filter: false },
    ...detail,
    { name: 'Contrôles', rows: ctl, widths: [12, 55, 80, 90], freeze: { row: 1 } },
    { name: 'Concordance', rows: conc, widths: [22, 16, 16, 16, 16, 16, 16, 16], freeze: { row: 1 } },
  ] });
  download(`controle-tva-${r.meta.siren || 'dossier'}-${per.key}.xlsx`, blob, blob.type);
}
