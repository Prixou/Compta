/*
 * Suivi Dossiers — Pièces à demander au client et aux fournisseurs.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- Pièces à demander au client ----------

const PIECES_CATS = {
  banque: 'Relevés bancaires',
  achats: 'Factures fournisseurs',
  justif: 'Justificatifs de dépenses payées directement',
  ventes: 'Ventes et encaissements',
  tp: 'Tiers payant et patients',
  attente: 'Opérations à identifier',
  releve: 'Opérations bancaires non comptabilisées',
  immo: 'Immobilisations',
  social: 'Social',
  associe: "Compte courant d'associé",
  caisse: 'Caisse',
  cloture: 'Documents de clôture',
  questions: 'Questions',
};

const ymOf = (iso) => iso.slice(0, 7);
function monthsBetween(a, b) {
  const out = [];
  if (!a || !b || a > b) return out;
  let [y, m] = a.split('-').map(Number);
  const [y2, m2] = b.split('-').map(Number);
  while (y < y2 || (y === y2 && m <= m2)) {
    out.push(`${y}-${pad(m)}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

// « janvier 2025 », « de mars à mai 2025 », « de novembre 2024 à janvier 2025 ».
function fmtMonths(list) {
  const label = (ym, withYear) => MOIS_LONGS[Number(ym.slice(5, 7)) - 1] + (withYear ? ' ' + ym.slice(0, 4) : '');
  const sorted = list.slice().sort();
  const ranges = [];
  sorted.forEach((ym) => {
    const last = ranges[ranges.length - 1];
    if (last && monthsBetween(last[1], ym).length === 2) last[1] = ym;
    else ranges.push([ym, ym]);
  });
  const de = (w) => (/^[aeiou]/.test(w) ? `d'${w}` : `de ${w}`);
  return ranges.map(([a, b]) => {
    if (a === b) return label(a, true);
    const first = label(a, a.slice(0, 4) !== b.slice(0, 4));
    if (monthsBetween(a, b).length === 2) return `${first} et ${label(b, true)}`;
    return `${de(first)} à ${label(b, true)}`;
  }).join(', ');
}

function median(values) {
  const v = values.slice().sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
}

function defaultArrete(r, mode) {
  const m = r.meta;
  if (mode === 'bilan' && m.closing) return m.closing;
  const last = (r.pieces && r.pieces.maxOp) || m.maxDate;
  if (!last || last === '0000') return todayStr();
  const eom = endOfMonth(last);
  // Situation : fin du dernier mois complet saisi.
  return daysUntilFrom(last, eom) <= 5 ? eom : addDays(`${last.slice(0, 7)}-01`, -1);
}

function daysUntilFrom(a, b) {
  return Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
}

const moisNom = (iso) => `${MOIS_LONGS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const piecesLabel = (mode, arrete) => (mode === 'mois' ? `mois de ${moisNom(arrete)}` : `${mode === 'bilan' ? 'bilan' : 'situation'} au ${fmtDate(arrete)}`);

// Mois dont un tiers est habituellement facturé : au moins 3 des 6 mois précédents, dont l'un des 2 derniers.
function usuallyMonthly(months, ym) {
  const start = `${ym}-01`;
  const prior = monthsBetween(ymOf(addDays(start, -175)), ymOf(addDays(start, -1)));
  const seen = prior.filter((m) => Math.abs(months[m] || 0) >= 0.01);
  if (seen.length < 3 || !prior.slice(-2).some((m) => Math.abs(months[m] || 0) >= 0.01)) return null;
  return median(seen.map((m) => months[m]));
}

// Tiers « fourre-tout » (divers, occasionnels) : jamais d'estimation de facture récurrente.
const RE_DIVERS = /\bdivers|diverse|occasionnel|ponctuel|autres? (fournisseurs?|clients?)|\bvarious\b|\bmisc/i;

// Abonnement : facturé chaque mois pour un montant stable (écart de 20 % au plus autour du montant habituel).
function stableMonthly(t, ym) {
  if (RE_DIVERS.test(t.lib || '')) return null;
  const med = usuallyMonthly(t.months, ym);
  if (med === null || med <= 0) return null;
  const start = `${ym}-01`;
  const prior = monthsBetween(ymOf(addDays(start, -175)), ymOf(addDays(start, -1))).map((m) => t.months[m]).filter((v) => Math.abs(v || 0) >= 0.01);
  return prior.every((v) => Math.abs(v - med) <= med * 0.2) ? med : null;
}

// Abonnement sur l'exercice : facturé au moins 3 mois et 60 % des mois depuis le premier, montant stable (20 % près).
// Renvoie le montant mensuel habituel et les mois sans facture jusqu'à `endYm`, ou null.
function subscriptionGaps(sp, endYm) {
  if (RE_DIVERS.test(sp.lib || '')) return null;
  const months = Object.keys(sp.months).filter((ym) => ym <= endYm).sort();
  if (months.length < 3) return null;
  const window = monthsBetween(months[0], endYm);
  if (months.length / window.length < 0.6) return null;
  const med = median(months.map((ym) => sp.months[ym]));
  if (med <= 0 || !months.every((ym) => Math.abs(sp.months[ym] - med) <= med * 0.2)) return null;
  return { med, missing: window.filter((ym) => !sp.months[ym]) };
}

// Règlements et encaissements non affectés à une facture, regroupés par tiers : une demande par tiers, chaque paiement daté.
function unmatchedPieces(r, push, from, to, scope) {
  const pharma = ui.fecProfile === 'pharmacie';
  const d = fmtDate;
  const groups = new Map();
  (r.pieces.unmatched || []).filter((u) => u.date >= from && u.date <= to && (u.racine === '401' || !pharma)).forEach((u) => {
    const k = u.racine + '|' + u.num;
    (groups.get(k) || groups.set(k, []).get(k)).push(u);
  });
  groups.forEach((list) => {
    const u0 = list[0];
    const total = list.reduce((s2, u) => s2 + u.amt, 0);
    const det = list.slice(0, 8).map((u) => `du ${d(u.date)} (${eur(u.amt)} €)`).join(', ') + (list.length > 8 ? ` et ${list.length - 8} autre(s), total ${eur(total)} €` : '');
    if (u0.racine === '401') push('achats', `nf:${scope}:${u0.num}`, list.length === 1
      ? `Facture ${u0.lib} correspondant au paiement de ${eur(u0.amt)} € du ${d(u0.date)}`
      : `Factures ${u0.lib} correspondant aux paiements ${det}`);
    else push('ventes', `ne:${scope}:${u0.num}`, list.length === 1
      ? `Facture ou avoir ${u0.lib} correspondant à l'encaissement de ${eur(u0.amt)} € du ${d(u0.date)}`
      : `Factures ou avoirs ${u0.lib} correspondant aux encaissements ${det}`);
  });
  return groups;
}

// Demande mensuelle : pièces manquantes du mois pour les cycles achats et ventes.
function monthPieces(r, arrete) {
  const items = [];
  const push = (cat, id, text) => items.push({ cat, id: `${cat}:${id}`, text });
  const p = r.pieces;
  const cy = r.cycles;
  const ym = ymOf(arrete);
  const start = `${ym}-01`, end = endOfMonth(start), mois = moisNom(start);
  const inM = (date) => date >= start && date <= end;
  const d = fmtDate;
  const pharma = ui.fecProfile === 'pharmacie';

  // Règlements fournisseurs et encaissements clients du mois non affectés à une facture (paiement par paiement)
  const asked = unmatchedPieces(r, push, start, end, ym);
  // Archive de justificatifs : écritures du mois sans pièce (exact), à la place de la liste des dépenses payées directement.
  // Les abonnements dont la facture n'est pas saisie du tout restent détectés : l'archive ne peut pas les voir.
  const exact = justifOk(r);
  justifPieces(r, push, start, end, ym);
  // Abonnements : fournisseurs facturés chaque mois pour un montant stable, sans facture ce mois-ci
  p.suppliers.forEach((sp) => {
    if (Math.abs(sp.months[ym] || 0) >= 0.01 || asked.has('401|' + sp.num)) return;
    const med = stableMonthly(sp, ym);
    if (med !== null) push('achats', 'rec:' + sp.num, `Facture ${sp.lib} de ${mois} (abonnement de ${eur(med)} € par mois)`);
  });
  // Dépenses payées directement (banque ou caisse → charge, sans facture fournisseur)
  const groups = new Map();
  (exact ? [] : p.directLines || []).filter((l) => inM(l[0])).forEach(([date, compte, clib, elib, amt]) => {
    const lib = String(elib).replace(/\S*\d\S*/g, '').replace(/\s+/g, ' ').trim() || elib;
    const k = compte + '|' + norm(lib);
    const g = groups.get(k) || groups.set(k, { lib, clib, n: 0, total: 0, date }).get(k);
    g.n++;
    g.total += amt;
  });
  const docName = (lib) => (/amende|antai|contravention|\bpv\b|penalit/i.test(lib) ? 'Avis de contravention' : 'Facture');
  Array.from(groups.values()).sort((a, b) => b.total - a.total).forEach((g, i) => push('justif', `m${ym}:${i}`, g.n === 1
    ? `${docName(g.lib)} « ${g.lib.slice(0, 45)} » du ${d(g.date)} (${eur(g.total)} €) — ${g.clib}`
    : `Factures « ${g.lib.slice(0, 45)} » : ${g.n} paiements en ${mois}, total ${eur(g.total)} € — ${g.clib}`));
  // Acquisitions d'immobilisations du mois
  p.immo.filter((l) => inM(l.date)).forEach((l, i) => push('immo', `m${ym}:${i}`, `Facture d'acquisition « ${l.lib} » du ${d(l.date)} (${eur(l.montant)} €, ${l.clib})`));
  // Opérations en attente du mois
  p.attente.filter((l) => inM(l.date) && !l.lettre).forEach((l, i) => push('attente', `m${ym}:${i}`, `Justificatif de l'opération « ${l.lib} » du ${d(l.date)} : ${l.c > 0 ? 'encaissement' : 'paiement'} de ${eur(l.c || l.d)} €`));

  if (!pharma && cy) {
    // Ventes : clients facturés chaque mois sans facture ce mois-ci
    cy.clients.customers.forEach((c) => {
      if (!c.months || Math.abs(c.months[ym] || 0) >= 0.01 || RE_DIVERS.test(c.lib || '') || asked.has('411|' + c.num)) return;
      const med = usuallyMonthly(c.months, ym);
      if (med !== null) push('ventes', 'mcli:' + c.num, `Factures de vente à ${c.lib} pour ${mois} (facturé habituellement chaque mois, environ ${eur(med, 0)} € TTC)`);
    });
    // Numéros de facture manquants dans la séquence du mois
    cy.clients.numbering.filter((g) => !g.sparse && g.seq).forEach((g) => {
      // Chaque trou de la numérotation est rattaché au mois de la facture qui le suit.
      const miss = [];
      for (let i = 1; i < g.seq.length && miss.length < 200; i++) {
        if (!inM(g.seq[i][1])) continue;
        for (let n = g.seq[i - 1][0] + 1; n < g.seq[i][0] && miss.length < 200; n++) miss.push(n);
      }
      if (!miss.length) return;
      const ref = (n) => g.prefix + String(n).padStart(g.w || 0, '0');
      const ranges = [];
      miss.forEach((n) => { const last = ranges[ranges.length - 1]; if (last && n === last[1] + 1) last[1] = n; else ranges.push([n, n]); });
      push('ventes', `num:${g.prefix}:${ym}`, `Factures de vente n° ${ranges.slice(0, 10).map(([a, b]) => (a === b ? ref(a) : `${ref(a)} à ${ref(b)}`)).join(', ')} (${mois}) : copies, ou confirmation de leur annulation`);
    });
    // Ventes sans TVA dont la nature n'est pas identifiable (contrôle de la TVA du mois)
    const tvM = cy.tva && cy.tva.months[ym];
    if (tvM && tvM.noVat.unknown.n) push('questions', `tvanv:${ym}`, `Ventes sans TVA de ${mois} (${tvM.noVat.unknown.n} facture(s), ${eur(tvM.noVat.unknown.base)} € HT) : nature des opérations (export, livraison intracommunautaire avec le n° de TVA du client, opération exonérée) ?`);
    // Encaissements enregistrés en ventes sans facture client (activité facturée)
    const facture = cy.clients.customers.reduce((s, c) => s + c.ht, 0);
    if (r.kpi.ca > 0 && facture >= r.kpi.ca * 0.5) (cy.clients.directSales || []).filter(([date]) => inM(date)).slice(0, 15).forEach(([date, amt, lib], i) => push('ventes', `enc:${ym}:${i}`, `Facture de vente correspondant à l'encaissement « ${lib} » du ${d(date)} (${eur(amt)} €)`));
  }
  return items;
}

// Noms à ne jamais solliciter (réglage « Ne jamais demander de pièces pour ces fournisseurs »), en mot entier.
function ignoredRe() {
  const list = (data.settings.piecesIgnore || []).map((x) => norm(x).trim()).filter(Boolean);
  if (!list.length) return null;
  return new RegExp(`(^|[^a-z0-9])(${list.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})([^a-z0-9]|$)`);
}

function computePieces(r, mode, arrete) {
  const re = ignoredRe();
  const items = computePiecesRaw(r, mode, arrete);
  return re ? items.filter((i) => i.cat === 'cloture' || !re.test(norm(i.text))) : items;
}

function computePiecesRaw(r, mode, arrete) {
  if (mode === 'mois') return monthPieces(r, arrete);
  const p = r.pieces;
  const items = [];
  const push = (cat, id, text) => items.push({ cat, id: `${cat}:${id}`, text });
  const endYm = ymOf(arrete);
  const startYm = ymOf(r.meta.start && r.meta.start <= arrete ? r.meta.start : p.minOp || arrete);
  const period = monthsBetween(startYm, endYm);
  const d = (iso) => fmtDate(iso);
  const bilan = mode === 'bilan';

  // Relevés bancaires
  p.banks.forEach((b) => {
    const closed = Math.abs(b.solde) < 0.01 && b.last < addDays(arrete, -60);
    const expected = monthsBetween(ymOf(b.first) > startYm ? ymOf(b.first) : startYm, closed ? ymOf(b.last) : endYm);
    const missing = expected.filter((ym) => !b.months[ym]);
    if (missing.length) push('banque', b.compte, `Relevés du compte ${b.lib || b.compte} (${b.compte}) : ${fmtMonths(missing)}`);
    else if (!closed && b.last < addDays(arrete, -10)) push('banque', b.compte + ':fin', `Relevés du compte ${b.lib || b.compte} (${b.compte}) du ${d(addDays(b.last, 1))} au ${d(arrete)}`);
    if (bilan && !closed) push('banque', b.compte + ':solde', `Relevé du compte ${b.lib || b.compte} au ${d(arrete)} (ou attestation de solde bancaire)`);
  });

  // Règlements et encaissements non affectés à une facture, paiement par paiement (en officine, le tiers payant est traité à part)
  const pharma = ui.fecProfile === 'pharmacie';
  const asked = p.unmatched ? unmatchedPieces(r, push, '0000-00-00', arrete, 'per') : new Map();
  if (!p.unmatched) p.tiers.forEach((t) => {
    if (t.racine === '401' && t.s > 0) push('achats', 'deb:' + t.num, `Facture ${t.lib} correspondant au paiement de ${eur(t.s)} € (compte fournisseur débiteur : payé mais non facturé)`);
    if (t.racine === '411' && t.s < 0 && !pharma) push('ventes', 'cred:' + t.num, `Facture ou avoir ${t.lib} : règlement de ${eur(-t.s)} € reçu sans facture correspondante`);
  });

  // Archive de justificatifs : écritures sans pièce (exact), à la place de la liste des dépenses payées directement
  const exact = justifOk(r);
  justifPieces(r, push, r.meta.start || '0000-00-00', arrete, 'per');

  // Abonnements (montant mensuel stable) dont des factures manquent ; jamais d'estimation pour les dépenses ponctuelles
  p.suppliers.forEach((sp) => {
    const sub = !asked.has('401|' + sp.num) && subscriptionGaps(sp, endYm);
    if (sub && sub.missing.length) push('achats', sp.num, `Factures ${sp.lib} : ${fmtMonths(sub.missing)} (abonnement de ${eur(sub.med)} € par mois)`);
  });
  if (pharma && r.aging) pharmaPieces(r, mode, arrete, push);
  cyclePieces(r, mode, arrete, push);
  // Éléments marqués « pièce demandée » dans la feuille de travail
  if (ui.fec && ui.fec.result === r) Object.values(wpStore().items).forEach((it) => Object.entries(it.els || {}).forEach(([ek, el]) => {
    // Texte destiné au client : sans n° de compte ni référence d'écriture interne.
    const txt = String(el.label || '').split(' · ').filter((x) => !/^\d{4,}\b/.test(x) && !/^[A-Z0-9]{1,5} \d+$/.test(x)).join(' · ');
    if (el.st === 'piece') push('questions', 'el:' + ek.slice(0, 80), `Justificatif de l'opération : ${txt}${el.note ? ` — ${el.note}` : ''}`);
  }));

  // Dépenses payées directement (banque ou caisse → charge, sans compte fournisseur)
  (exact ? [] : p.direct).filter((g) => g.first <= arrete).forEach((g, i) => {
    const months = Object.keys(g.months).filter((ym) => ym <= endYm);
    const when = g.count === 1 ? `du ${d(g.first)}` : `: ${g.count} paiements (${fmtMonths(months)})`;
    const label = g.label.replace(/\S*\d\S*/g, '').replace(/\s+/g, ' ').trim() || g.label;
    push('justif', `${g.compte}:${i}`, `Factures « ${label.slice(0, 45)} » ${when}, total ${eur(g.total)} € — ${g.clib}`);
  });

  // Opérations en compte d'attente
  p.attente.filter((l) => l.date <= arrete && !l.lettre && Math.abs(l.soldeCompte) >= 0.01).forEach((l, i) => {
    push('attente', `${l.compte}:${i}`, `Justificatif de l'opération « ${l.lib} » du ${d(l.date)} : ${l.c > 0 ? 'encaissement' : 'paiement'} de ${eur(l.c || l.d)} €`);
  });

  // Immobilisations acquises
  p.immo.filter((l) => l.date <= arrete).forEach((l, i) => {
    push('immo', `${l.compte}:${i}`, `Facture d'acquisition « ${l.lib} » du ${d(l.date)} (${eur(l.montant)} €, ${l.clib})`);
  });

  // Paie
  const payMonths = Object.keys(p.payroll).filter((ym) => ym <= endYm).sort();
  if (payMonths.length >= 3) {
    const missing = monthsBetween(payMonths[0], endYm).filter((ym) => !p.payroll[ym]);
    if (missing.length) push('social', 'paie', `Bulletins et journal de paie : ${fmtMonths(missing)}`);
  }

  // Compte courant d'associé
  const cca = p.cca.filter((l) => l.date <= arrete);
  if (cca.length) {
    const out = cca.reduce((t, l) => t + l.d, 0), inn = cca.reduce((t, l) => t + l.c, 0);
    push('associe', 'mvts', `Justificatifs des ${cca.length} mouvement(s) du compte courant d'associé (retraits ${eur(out)} €, apports ${eur(inn)} €)`);
  }

  // Opérations du relevé bancaire non comptabilisées (rapprochement)
  const rappro = ui.fec && ui.fec.result === r && ui.fec.rappro && ui.fec.rappro.include ? rapproResult() : null;
  if (rappro) rappro.bankOnly.filter((o) => o.date <= arrete).forEach((o, i) => {
    push('releve', `${o.date}:${o.amount}:${i}`, `Justificatif de l'opération bancaire « ${o.label} » du ${d(o.date)} (${o.amount > 0 ? 'encaissement' : 'paiement'} de ${eur(Math.abs(o.amount))} €), non comptabilisée`);
  });

  // Caisse
  if (r.alerts.some((a) => a.label === 'Caisse créditrice')) push('caisse', 'neg', 'Brouillard de caisse et justificatifs des dépenses en espèces (la caisse devient négative à certaines dates)');

  if (bilan) {
    const f = p.flags;
    push('cloture', 'fnp', `Factures fournisseurs reçues après le ${d(arrete)} mais concernant l'exercice (factures non parvenues)`);
    if (!pharma) push('cloture', 'fae', `Prestations réalisées ou marchandises livrées avant le ${d(arrete)} et non encore facturées`);
    if (f.stock && !pharma) push('cloture', 'stock', `Inventaire des stocks et en-cours valorisé au ${d(arrete)}`);
    if (f.emprunt) push('cloture', 'emprunt', `Tableaux d'amortissement des emprunts (capital restant dû au ${d(arrete)})`);
    if (f.leasing) push('cloture', 'leasing', 'Contrats de crédit-bail ou de location financière en cours');
    if (f.salaires) push('cloture', 'cp', `Journal de paie annuel et état des congés payés acquis non pris au ${d(arrete)}`);
    if (f.caisse) push('cloture', 'caisse', `Procès-verbal de caisse (espèces en caisse au ${d(arrete)})`);
    if (f.cca) push('cloture', 'cca', "Relevé du compte courant d'associé et convention de compte courant éventuelle");
    if (f.vehicules) push('cloture', 'vehicules', 'Cartes grises des véhicules de la société');
    if (f.assurance) push('cloture', 'assurance', "Échéanciers des contrats d'assurance (charges constatées d'avance)");
    if (f.taxes) push('cloture', 'taxes', "Avis d'imposition de CFE et de taxe foncière de l'année");
    push('cloture', 'litiges', 'Litiges, contentieux ou événements importants à signaler (provisions éventuelles)');

    // Questions sur les créances et dettes anciennes
    const limit = addDays(arrete, -90);
    p.tiers.filter((t) => t.racine === '411' && !pharma && t.s >= 50 && (t.lastC || t.lastD || '0') < limit).sort((a, b) => b.s - a.s).slice(0, 15).forEach((t) => {
      push('questions', 'cli:' + t.num, `Créance ${t.lib} de ${eur(t.s)} € sans règlement depuis ${t.lastC ? 'le ' + d(t.lastC) : 'le début de l\'exercice'} : toujours recouvrable ?`);
    });
    p.tiers.filter((t) => t.racine === '401' && t.s <= -50 && (t.lastD || t.lastC || '0') < limit).sort((a, b) => a.s - b.s).slice(0, 15).forEach((t) => {
      push('questions', 'four:' + t.num, `Dette ${t.lib} de ${eur(-t.s)} € non réglée depuis ${t.lastD ? 'le ' + d(t.lastD) : 'le début de l\'exercice'} : toujours due (litige, avoir attendu) ?`);
    });
  }
  return items;
}

// Demande en cours : celle du mois affiché dans l'espace « Mois », sinon celle de la situation ou du bilan (espace « Révision »).
function piecesState() {
  const f = ui.fec;
  if (f.space === 'mois') {
    const p = (f.piecesMois = f.piecesMois || { mode: 'mois', excluded: new Set() });
    p.arrete = endOfMonth(`${fecMonth()}-01`);
    return p;
  }
  if (!f.pieces) {
    const mode = isSituation(f.result) ? 'situation' : 'bilan';
    f.pieces = { mode, arrete: defaultArrete(f.result, mode), excluded: new Set() };
  }
  return f.pieces;
}

function selectedPieces() {
  const st = piecesState();
  return computePieces(ui.fec.result, st.mode, st.arrete).filter((i) => !st.excluded.has(i.id));
}

function piecesText(items) {
  const groups = {};
  items.forEach((i) => (groups[i.cat] = groups[i.cat] || []).push(i.text));
  return Object.keys(PIECES_CATS).filter((k) => groups[k]).map((k) => `${PIECES_CATS[k]} :\n${groups[k].map((t) => `- ${t}`).join('\n')}`).join('\n\n');
}

function viewPieces() {
  const f = ui.fec;
  const st = piecesState();
  const items = computePieces(f.result, st.mode, st.arrete);
  const kept = items.filter((i) => !st.excluded.has(i.id));
  const c = clientById(f.clientId);
  const groups = {};
  items.forEach((i) => (groups[i.cat] = groups[i.cat] || []).push(i));
  return `
    <section class="card">
      <h2>${st.mode === 'mois' ? `Pièces du mois à demander au client — ${esc(moisNom(st.arrete))}` : 'Pièces à demander au client'}</h2>
      <p class="muted small">${st.mode === 'mois'
        ? 'Demande du mois, cycles achats et ventes : factures des fournisseurs et clients habituels absentes, règlements et encaissements sans facture, dépenses payées directement, numéros de facture manquants, opérations à identifier. À envoyer dès la saisie du mois pour anticiper la situation ou le bilan.'
        : "Liste établie à partir des écritures : relevés manquants, factures récurrentes absentes, paiements sans facture, opérations à identifier… Décochez ce qui ne s'applique pas, puis créez la demande."}</p>
      <div class="filters pieces-opts">
        ${st.mode === 'mois' ? '' : `<div class="seg" role="group" aria-label="Travail à préparer">
          <button class="${st.mode === 'situation' ? 'on' : ''}" data-action="pieces-mode" data-mode="situation">Situation</button>
          <button class="${st.mode === 'bilan' ? 'on' : ''}" data-action="pieces-mode" data-mode="bilan">Bilan</button>
        </div>
        <label class="inline-label">Arrêté au <input type="date" data-pieces="arrete" value="${esc(st.arrete)}"></label>`}
        <span class="muted small">${kept.length} élément(s) retenu(s) sur ${items.length}</span>
      </div>
      ${items.length ? Object.keys(PIECES_CATS).filter((k) => groups[k]).map((k) => `
        <div class="pieces-group">
          <h3>${esc(PIECES_CATS[k])} <span class="count">${groups[k].length}</span></h3>
          ${groups[k].map((i) => `<label class="check piece"><input type="checkbox" data-piece="${esc(i.id)}"${st.excluded.has(i.id) ? '' : ' checked'}><span>${esc(i.text)}</span></label>`).join('')}
        </div>`).join('') : '<p class="muted">Aucun élément manquant détecté pour cette période. 👍</p>'}
      <div class="pieces-actions">
        <button class="btn primary" data-action="pieces-demande"${c && kept.length ? '' : ' disabled'}>${icon('mail')}Créer la demande et préparer le mail</button>
        <button class="btn" data-action="pieces-copy"${kept.length ? '' : ' disabled'}>Copier la liste</button>
        <button class="btn" data-action="pieces-xlsx"${kept.length ? '' : ' disabled'}>Liste Excel pour le client</button>
      </div>
      ${c ? '' : '<p class="muted small">Rattachez l\'analyse à un dossier (en haut de page) pour créer la demande : une mission dont chaque étape est une pièce, avec relance automatique de ce qui manque encore.</p>'}
    </section>
    ${supplierRequestsCard()}`;
}

// ---------- Demandes de factures directement aux fournisseurs (laboratoires, grossistes…) ----------

// Période couverte par la demande : l'exercice jusqu'à la date d'arrêté, ou le mois en mode mensuel.
function supplierPeriod(r) {
  const st = piecesState();
  if (st.mode === 'mois') return { from: `${ymOf(st.arrete)}-01`, to: endOfMonth(`${ymOf(st.arrete)}-01`) };
  return { from: r.meta.start || r.pieces.minOp || st.arrete, to: st.mode === 'bilan' ? r.meta.closing || st.arrete : st.arrete };
}

// Factures manquantes par fournisseur : paiements sans facture et mois d'abonnement absents, sur la période.
function supplierRequests(r) {
  const { from, to } = supplierPeriod(r);
  const re = ignoredRe();
  const map = new Map();
  const get = (num, lib) => map.get(num) || map.set(num, { num, lib, pays: [], months: [], docs: [] }).get(num);
  (r.pieces.unmatched || []).filter((u) => u.racine === '401' && u.date >= from && u.date <= to).forEach((u) => get(u.num, u.lib).pays.push(u));
  const exact = justifOk(r);
  if (exact) r.cycles.justif.missing.filter((x) => x.kind === 'achat' && x.date >= from && x.date <= to).forEach((x) => get(x.num, x.tlib).docs.push(x));
  const endYm = ymOf(to), startYm = ymOf(from);
  r.pieces.suppliers.forEach((sp) => {
    const sub = subscriptionGaps(sp, endYm);
    const missing = sub ? sub.missing.filter((ym) => ym >= startYm) : [];
    if (missing.length) get(sp.num, sp.lib).months.push(...missing);
  });
  return Array.from(map.values()).filter((x) => !re || !re.test(norm(x.lib)))
    .map((x) => Object.assign(x, { total: x.pays.reduce((t, u) => t + u.amt, 0) }))
    .sort((a, b) => b.total - a.total || a.lib.localeCompare(b.lib, 'fr'));
}

// Coordonnées du dossier chez chaque fournisseur (n° de compte client, e-mail), conservées chiffrées dans le dossier.
const supplierInfo = (c, num) => (c && c.fournisseurs && c.fournisseurs[num]) || {};

function supplierMail(r, c, x) {
  const s = data.settings;
  const info = supplierInfo(c, x.num);
  const { from, to } = supplierPeriod(r);
  const nom = c ? c.nom : '';
  const periode = `du ${fmtDate(from)} au ${fmtDate(to)}`;
  const lines = [];
  if (x.docs.length) {
    lines.push('- le duplicata des factures suivantes :');
    x.docs.forEach((u) => lines.push(`    • ${u.avoir ? 'avoir' : 'facture'}${u.piece ? ` n° ${u.piece}` : ''} du ${fmtDate(u.date)} : ${eur(Math.abs(u.amt))} €`));
  }
  if (x.pays.length) {
    lines.push('- le duplicata des factures correspondant aux règlements suivants :');
    x.pays.forEach((u) => lines.push(`    • règlement du ${fmtDate(u.date)} : ${eur(u.amt)} €${u.label ? ` (${u.label})` : ''}`));
  }
  if (x.months.length) lines.push(`- les factures de ${fmtMonths(x.months)}`);
  lines.push(`- un relevé de compte (factures, avoirs et règlements) pour la période ${periode}`);
  const subject = `Demande de factures — ${nom}${info.numClient ? ` — compte client n° ${info.numClient}` : ''} — période ${periode}`;
  const body = ['Bonjour,', '',
    `Nous sommes l'expert-comptable de ${nom}${c && c.siren ? ` (SIREN ${c.siren})` : ''}${info.numClient ? `, votre client sous le n° ${info.numClient}` : ''}.`,
    `Afin d'établir ses comptes pour la période ${periode}, pourriez-vous nous adresser :`, '',
    ...lines, '',
    'Vous pouvez nous les transmettre en réponse à ce message.', '',
    'Avec nos remerciements,', s.signature || [s.utilisateur, s.cabinet].filter(Boolean).join('\n')].join('\n');
  return { subject, body, to: info.email || '' };
}

function supplierRequestsCard() {
  const f = ui.fec;
  const r = f.result;
  if (!r.pieces.unmatched) return '';
  const c = clientById(f.clientId);
  const list = supplierRequests(r);
  const { from, to } = supplierPeriod(r);
  return `<section class="card">
    <h2>Demandes directes aux fournisseurs <span class="count">${list.length}</span></h2>
    <p class="muted small">Pour les laboratoires, grossistes et autres fournisseurs dont des factures manquent du ${fmtDate(from)} au ${fmtDate(to)} : un mail par fournisseur, avec le n° de compte client du dossier chez lui, la dénomination et la période, demandant le duplicata des factures et un relevé de compte. Le n° client et l'e-mail saisis sont conservés, chiffrés, dans le dossier pour les prochaines demandes. À envoyer avec l'accord du client, dans le cadre de votre mission.</p>
    ${!c ? '<p class="banner info">Rattachez l\'analyse à un dossier (en haut de page) pour enregistrer les n° clients et préparer les mails.</p>' : ''}
    ${list.length ? `<div class="supp-list">${list.map((x) => {
      const info = supplierInfo(c, x.num);
      const what = [x.docs.length ? `${x.docs.length} facture(s) sans justificatif` : '', x.pays.length ? `${x.pays.length} règlement(s) sans facture, ${eur(x.total)} €` : '', x.months.length ? `factures de ${fmtMonths(x.months)}` : ''].filter(Boolean).join(' · ');
      return `<div class="supp-row">
        <div class="supp-name"><strong>${esc(x.lib)}</strong> <span class="muted small">${esc(x.num)}</span><div class="muted small">${esc(what)}${info.sentAt ? ` · demandé le ${fmtDate(info.sentAt.slice(0, 10))}` : ''}</div></div>
        <label class="inline-label">N° client <input type="text" data-supp="numClient" data-k="${esc(x.num)}" data-lib="${esc(x.lib)}" value="${esc(info.numClient || '')}" placeholder="chez ce fournisseur" spellcheck="false"${c ? '' : ' disabled'}></label>
        <label class="inline-label">E-mail <input type="email" data-supp="email" data-k="${esc(x.num)}" data-lib="${esc(x.lib)}" value="${esc(info.email || '')}" placeholder="comptabilite@…" spellcheck="false"${c ? '' : ' disabled'}></label>
        <span class="supp-actions">
          <button class="btn small primary" data-action="supp-mail" data-k="${esc(x.num)}"${c ? '' : ' disabled'}>${icon('mail')}Mail</button>
          <button class="btn small" data-action="supp-copy" data-k="${esc(x.num)}"${c ? '' : ' disabled'}>Copier</button>
        </span>
      </div>`;
    }).join('')}</div>` : '<p class="muted">Aucune facture fournisseur manquante sur la période.</p>'}
  </section>`;
}

function supplierSend(num, copy) {
  const f = ui.fec;
  const c = clientById(f.clientId);
  const x = supplierRequests(f.result).find((y) => y.num === num);
  if (!c || !x) return;
  const mail = supplierMail(f.result, c, x);
  c.fournisseurs = c.fournisseurs || {};
  c.fournisseurs[num] = Object.assign(c.fournisseurs[num] || {}, { lib: x.lib, sentAt: nowIso() });
  log(c.id, `Demande de factures adressée au fournisseur ${x.lib} (${x.docs.length} facture(s), ${x.pays.length} règlement(s), ${x.months.length} mois).`, true);
  persist();
  if (copy) {
    const text = `Objet : ${mail.subject}\n\n${mail.body}`;
    navigator.clipboard.writeText(text).then(() => toast(`Mail pour ${x.lib} copié : collez-le dans votre messagerie.`), () => toast('Copie impossible sur ce navigateur.', true));
    refresh();
    return;
  }
  refresh();
  window.location.href = `mailto:${encodeURIComponent(mail.to).replace(/%40/g, '@')}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`;
  toast(`Messagerie ouverte pour ${x.lib}. Demande notée dans le journal du dossier.`);
}

function createPiecesRequest() {
  const f = ui.fec;
  const c = clientById(f.clientId);
  const st = piecesState();
  const items = selectedPieces();
  if (!c || !items.length) return;
  const label = piecesLabel(st.mode, st.arrete);
  const titre = `Demande de pièces — ${label}`;
  const stamp = nowIso();
  let m = missionsOf(c.id).find((x) => x.titre === titre && isOpen(x));
  const steps = items.map((i) => ({ id: uid(), label: i.text, cat: PIECES_CATS[i.cat], done: false, doneAt: null }));
  if (m) {
    m.etapes = m.etapes.concat(steps.filter((e) => !m.etapes.some((x) => x.label === e.label)));
    m.updatedAt = stamp;
  } else {
    m = {
      id: uid(), clientId: c.id, type: 'libre', titre, exercice: st.arrete.slice(0, 4), echeance: addDays(todayStr(), 10),
      statut: 'a_faire', priorite: 'normale', responsable: c.responsable || c.collaborateur || data.settings.utilisateur,
      recurrence: 'aucune', notes: `Liste établie à partir du FEC ${f.result.meta.fileName} le ${fmtDate(todayStr())}. Cochez chaque pièce à sa réception.`,
      suiteCreee: false, termineLe: null, createdAt: stamp, updatedAt: stamp, etapes: steps,
      demandePieces: { mode: st.mode, arrete: st.arrete },
    };
    data.missions.push(m);
    log(c.id, `Demande de pièces préparée (${label}) : ${steps.length} élément(s).`, true);
  }
  persist();
  openMessage(c.id, m.id);
}

function exportPiecesXlsx() {
  const f = ui.fec;
  const st = piecesState();
  const items = selectedPieces();
  const c = clientById(f.clientId);
  const t = (v, s) => ({ v, s: s === undefined ? 2 : s });
  const rows = [[{ v: `Pièces à fournir — ${piecesLabel(st.mode, st.arrete)}${c ? ' — ' + c.nom : ''}`, s: 10 }], [],
    [t('Catégorie', 1), t('Élément demandé', 1), t('Fourni', 1), t('Commentaire', 1)]]
    .concat(items.map((i) => [t(PIECES_CATS[i.cat]), t(i.text), t(''), t('')]));
  const blob = XlsxWriter.build({ sheets: [{ name: 'Pièces à fournir', rows, widths: [30, 110, 10, 40], freeze: { row: 3 }, filter: { row: 3 } }] });
  download(`pieces-a-fournir-${st.arrete}.xlsx`, blob, blob.type);
}
