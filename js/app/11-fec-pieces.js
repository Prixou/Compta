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
  divers: 'Opérations diverses',
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
    const ops = list.map((u) => ({ date: u.date, amt: u.amt }));
    if (u0.racine === '401') push('achats', `nf:${scope}:${u0.num}`, list.length === 1
      ? `Facture ${u0.lib} correspondant au paiement de ${eur(u0.amt)} € du ${d(u0.date)}`
      : `Factures ${u0.lib} correspondant aux paiements ${det}`,
    { doc: list.length === 1 ? `Facture ${u0.lib} correspondant au paiement` : `Factures ${u0.lib} correspondant aux ${list.length} paiements`, ops });
    else push('ventes', `ne:${scope}:${u0.num}`, list.length === 1
      ? `Facture ou avoir ${u0.lib} correspondant à l'encaissement de ${eur(u0.amt)} € du ${d(u0.date)}`
      : `Factures ou avoirs ${u0.lib} correspondant aux encaissements ${det}`,
    { doc: list.length === 1 ? `Facture ou avoir ${u0.lib} correspondant à l'encaissement` : `Factures ou avoirs ${u0.lib} correspondant aux ${list.length} encaissements`, ops });
  });
  return groups;
}

// ---------- Opérations en compte d'attente (47) ----------

// Rubriques au choix pour une opération en compte d'attente, dans l'ordre du menu.
const ATTENTE_RUBRIQUES = ['ventes', 'achats', 'divers'];

// Rubrique proposée : celle du compte déjà utilisé pour le même libellé, sinon le sens de l'opération
// (encaissement → ventes et encaissements, paiement → factures fournisseurs).
function attenteDefaut(l) {
  const sug = l.sug && l.sug[0];
  if (!sug) return l.c > 0 ? 'ventes' : 'achats';
  if (/^(40|60|61|62|2)/.test(sug)) return 'achats';
  if (/^(41|70)/.test(sug)) return 'ventes';
  return 'divers';
}

// Clé stable d'une opération (compte, date, montant, libellé) : sa rubrique est retrouvée d'une analyse à l'autre.
const attenteKey = (l) => `${l.compte}|${l.date}|${(l.d - l.c).toFixed(2)}|${norm(l.lib).replace(/\s+/g, ' ').trim().slice(0, 40)}`;

// Rubriques choisies, conservées dans le dossier (ou le temps de l'analyse si elle n'est rattachée à aucun dossier).
// `create` : crée le registre s'il n'existe pas encore (sinon lecture seule, sans rien ajouter au dossier).
function rubriquesStore(create) {
  const f = ui.fec;
  const c = clientById(f.clientId);
  if (c) return c.piecesRubriques || (create ? (c.piecesRubriques = {}) : {});
  return f.rubriques || (create ? (f.rubriques = {}) : {});
}

function setRubrique(key, cat) {
  if (!ATTENTE_RUBRIQUES.includes(cat)) return;
  const store = rubriquesStore(true);
  store[key] = cat;
  // Au-delà de 2 000 opérations, les plus anciennes sont oubliées.
  const keys = Object.keys(store);
  if (keys.length > 2000) keys.sort((a, b) => a.split('|')[1].localeCompare(b.split('|')[1])).slice(0, keys.length - 2000).forEach((k) => delete store[k]);
  if (clientById(ui.fec.clientId)) persist();
  refresh();
}

// Une demande par opération, rangée dans sa rubrique : le client reçoit des factures, des ventes ou des opérations diverses
// à justifier, et non des « opérations à identifier ».
function attentePieces(r, push, lines) {
  const store = ui.fec && ui.fec.result === r ? rubriquesStore() : {};
  const seen = new Map();
  const d = fmtDate;
  lines.forEach((l) => {
    const base = attenteKey(l);
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    const key = n ? `${base}#${n}` : base;
    const cat = ATTENTE_RUBRIQUES.includes(store[key]) ? store[key] : attenteDefaut(l);
    const enc = l.c > 0, amt = l.c || l.d;
    const op = `« ${l.lib} »`;
    const doc = cat === 'achats' ? (enc ? `Avoir fournisseur correspondant à l'encaissement ${op}` : `Facture correspondant au paiement ${op}`)
      : cat === 'ventes' ? (enc ? `Facture de vente correspondant à l'encaissement ${op}` : `Avoir client correspondant au paiement ${op}`)
      : `Justificatif ${enc ? "de l'encaissement" : 'du paiement'} ${op}`;
    push(cat, key, `${doc} du ${d(l.date)} (${eur(amt)} €)`, { id: 'attente:' + key, src: 'attente', key, compte: l.compte, doc, ops: [{ date: l.date, amt }] });
  });
}

// Demande mensuelle : pièces manquantes du mois pour les cycles achats et ventes.
function monthPieces(r, arrete) {
  const items = [];
  // `x` : précisions pour la liste Excel (doc : document sans date ni montant, ops : opérations datées, total).
  const push = (cat, id, text, x) => items.push(Object.assign({ cat, id: `${cat}:${id}`, text }, x));
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
    const g = groups.get(k) || groups.set(k, { lib, clib, n: 0, total: 0, date, ops: [] }).get(k);
    g.n++;
    g.total += amt;
    g.ops.push({ date, amt });
  });
  const docName = (lib) => (/amende|antai|contravention|\bpv\b|penalit/i.test(lib) ? 'Avis de contravention' : 'Facture');
  Array.from(groups.values()).sort((a, b) => b.total - a.total).forEach((g, i) => push('justif', `m${ym}:${i}`, g.n === 1
    ? `${docName(g.lib)} « ${g.lib.slice(0, 45)} » du ${d(g.date)} (${eur(g.total)} €) — ${g.clib}`
    : `Factures « ${g.lib.slice(0, 45)} » : ${g.n} paiements en ${mois}, total ${eur(g.total)} € — ${g.clib}`,
  { doc: `${g.n === 1 ? docName(g.lib) : 'Factures'} « ${g.lib.slice(0, 45)} » — ${g.clib}`, ops: g.ops.sort((a, b) => a.date.localeCompare(b.date)) }));
  // Acquisitions d'immobilisations du mois
  p.immo.filter((l) => inM(l.date)).forEach((l, i) => push('immo', `m${ym}:${i}`, `Facture d'acquisition « ${l.lib} » du ${d(l.date)} (${eur(l.montant)} €, ${l.clib})`,
    { doc: `Facture d'acquisition « ${l.lib} » (${l.clib})`, ops: [{ date: l.date, amt: l.montant }] }));
  // Opérations en attente du mois, chacune dans sa rubrique
  // (sauf les encaissements qui citent une facture client : identifiés, à lettrer)
  attentePieces(r, push, p.attente.filter((l) => inM(l.date) && !l.lettre && !(l.sug && l.sug[7])));

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
      // Une pièce par facture manquante (pas de plage de numéros), pour suivre chacune
      miss.slice(0, 50).forEach((n) => push('ventes', `num:${g.prefix}:${n}`, `Facture de vente n° ${ref(n)} (${mois}) : copie, ou confirmation de son annulation`));
      if (miss.length > 50) push('ventes', `num:${g.prefix}:${ym}:+`, `Factures de vente n° ${miss.slice(50).map(ref).join(', ')} (${mois}) : copies, ou confirmation de leur annulation`);
    });
    // Ventes sans TVA dont la nature n'est pas identifiable (contrôle de la TVA du mois)
    // Ventes sans TVA sur des comptes taxables ou non qualifiés (contrôle de la TVA)
    if (cy.tva && cy.tva.nv) {
      const TM = tvaModel(r);
      const nvM = cy.tva.nv.filter(([date, , , , m]) => date.slice(0, 7) === ym && Object.keys(m).some((c) => c.startsWith('70') && TM.ca[c] && (typeof TM.ca[c].role === 'number' || TM.ca[c].role === 'sans')));
      const base = nvM.reduce((t, [, , , , m]) => t - Object.values(m).reduce((x, v) => x + v, 0), 0);
      if (nvM.length) push('questions', `tvanv:${ym}`, `Ventes sans TVA de ${mois} (${nvM.length} facture(s), ${eur(base)} € HT) : nature des opérations (export, livraison intracommunautaire avec le n° de TVA du client, opération exonérée) ?`);
    }
    // Encaissements enregistrés en ventes sans facture client (activité facturée)
    const facture = cy.clients.customers.reduce((s, c) => s + c.ht, 0);
    if (r.kpi.ca > 0 && facture >= r.kpi.ca * 0.5) (cy.clients.directSales || []).filter(([date]) => inM(date)).slice(0, 15).forEach(([date, amt, lib], i) => push('ventes', `enc:${ym}:${i}`, `Facture de vente correspondant à l'encaissement « ${lib} » du ${d(date)} (${eur(amt)} €)`,
      { doc: `Facture de vente correspondant à l'encaissement « ${lib} »`, ops: [{ date, amt }] }));
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
  const push = (cat, id, text, x) => items.push(Object.assign({ cat, id: `${cat}:${id}`, text }, x));
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
    push('justif', `${g.compte}:${i}`, `Factures « ${label.slice(0, 45)} » ${when}, total ${eur(g.total)} € — ${g.clib}`, g.count === 1
      ? { doc: `Facture « ${label.slice(0, 45)} » — ${g.clib}`, ops: [{ date: g.first, amt: g.total }] }
      : { doc: `Factures « ${label.slice(0, 45)} » ${when} — ${g.clib}`, total: g.total });
  });

  // Opérations en compte d'attente, chacune dans sa rubrique
  attentePieces(r, push, p.attente.filter((l) => l.date <= arrete && !l.lettre && Math.abs(l.soldeCompte) >= 0.01 && !(l.sug && l.sug[7])));

  // Immobilisations acquises
  p.immo.filter((l) => l.date <= arrete).forEach((l, i) => {
    push('immo', `${l.compte}:${i}`, `Facture d'acquisition « ${l.lib} » du ${d(l.date)} (${eur(l.montant)} €, ${l.clib})`,
      { doc: `Facture d'acquisition « ${l.lib} » (${l.clib})`, ops: [{ date: l.date, amt: l.montant }] });
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
    push('releve', `${o.date}:${o.amount}:${i}`, `Justificatif de l'opération bancaire « ${o.label} » du ${d(o.date)} (${o.amount > 0 ? 'encaissement' : 'paiement'} de ${eur(Math.abs(o.amount))} €), non comptabilisée`,
      { doc: `Justificatif ${o.amount > 0 ? "de l'encaissement" : 'du paiement'} « ${o.label} », non comptabilisé`, ops: [{ date: o.date, amt: Math.abs(o.amount) }] });
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
  const nAttente = items.filter((i) => i.src === 'attente').length;
  const piece = (i) => {
    const box = `<label class="check piece"><input type="checkbox" data-piece="${esc(i.id)}"${st.excluded.has(i.id) ? '' : ' checked'}><span>${esc(i.text)}</span></label>`;
    if (i.src !== 'attente') return box;
    // Opération en compte d'attente : rubrique de la demande au choix
    return `<div class="piece-row">${box}<span class="piece-rub"><span class="badge" title="Opération en compte d'attente">${esc(i.compte)}</span>
      <select data-piece-rub="${esc(i.key)}" aria-label="Rubrique de la demande">${ATTENTE_RUBRIQUES.map((k) => `<option value="${k}"${k === i.cat ? ' selected' : ''}>${esc(PIECES_CATS[k])}</option>`).join('')}</select></span></div>`;
  };
  return `
    <section class="card">
      <h2>${st.mode === 'mois' ? `Pièces du mois à demander au client — ${esc(moisNom(st.arrete))}` : 'Pièces à demander au client'}</h2>
      <p class="muted small">${st.mode === 'mois'
        ? 'Demande du mois, cycles achats et ventes : factures des fournisseurs et clients habituels absentes, règlements et encaissements sans facture, dépenses payées directement, numéros de facture manquants, opérations en compte d\'attente. À envoyer dès la saisie du mois pour anticiper la situation ou le bilan.'
        : "Liste établie à partir des écritures : relevés manquants, factures récurrentes absentes, paiements sans facture, opérations en compte d'attente… Décochez ce qui ne s'applique pas, puis créez la demande."}</p>
      ${nAttente ? `<p class="muted small">Opérations en compte d'attente (${nAttente}, repérées par leur n° de compte) : choisissez pour chacune la rubrique de la demande, <em>Ventes et encaissements</em>, <em>Factures fournisseurs</em> ou <em>Opérations diverses</em>. La rubrique proposée suit l'affectation déjà utilisée pour le même libellé, sinon le sens de l'opération ; votre choix est conservé dans le dossier.</p>` : ''}
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
          ${groups[k].map(piece).join('')}
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
  const steps = items.map((i) => Object.assign({ id: uid(), label: i.text, cat: PIECES_CATS[i.cat], done: false, doneAt: null }, i.src === 'attente' ? { pid: i.id } : {}));
  if (m) {
    steps.forEach((e) => {
      // Opération en compte d'attente changée de rubrique : son étape est mise à jour plutôt que doublée.
      const old = m.etapes.find((x) => x.label === e.label || (e.pid && x.pid === e.pid));
      if (!old) m.etapes.push(e);
      else if (e.pid && !old.done) Object.assign(old, { label: e.label, cat: e.cat });
    });
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
  const st = piecesState();
  const c = clientById(ui.fec.clientId);
  const blob = XlsxWriter.build({ sheets: [piecesSheet(selectedPieces(), st, c)] });
  // Nom de fichier sans accent ni caractère interdit : certains navigateurs remplacent sinon le nom par « download ».
  const name = `Documents a fournir${c ? ` - ${c.nom}` : ''} - ${piecesLabel(st.mode, st.arrete)}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\//g, '-').replace(/[\\:*?"<>|]+|[^\x20-\x7e]+/g, ' ').replace(/\s+/g, ' ').trim();
  download(`${name}.xlsx`, blob, blob.type);
}

// Largeur d'un texte en Calibri 11, en largeurs de chiffre (l'unité des colonnes Excel), d'après les chasses de la police.
function charWidth(ch) {
  const b = ch.normalize('NFD')[0];
  if (/[0-9]/.test(b)) return 1;
  if (/[fijlrt]/.test(b)) return 0.62;
  if (/[mw]/.test(b)) return 1.5;
  if (/[a-z]/.test(b)) return 0.95;
  if (/[IJ]/.test(b)) return 0.6;
  if (/[MW]/.test(b)) return 1.72;
  if (/[A-Z]/.test(b)) return 1.1;
  if (/[ \u00a0]/.test(b)) return 0.45;
  if (/[—@%]/.test(b)) return 1.9;
  if (/[€«»#&]/.test(b)) return 1;
  return /[.,;:'!|]/.test(b) ? 0.5 : 0.8;
}
const textWidth = (t) => Array.from(t).reduce((w, ch) => w + charWidth(ch), 0);

// Nombre de lignes d'un texte renvoyé à la ligne dans une colonne large de `width` chiffres.
function wrapLines(text, width) {
  return String(text).split('\n').reduce((n, para) => {
    let lines = 1, len = 0;
    para.split(' ').forEach((word) => {
      const w = textWidth(word);
      if (len && len + 0.45 + w > width) { lines++; len = 0; }
      len += (len ? 0.45 : 0) + w;
      while (len > width) { lines++; len -= width; }
    });
    return n + lines;
  }, 0);
}

// Liste remise au client, présentée comme un document du cabinet : en-tête, explication, récapitulatif, puis une rubrique
// par bandeau. Une ligne par document, sa date et son montant dans leurs colonnes (une ligne par opération quand la demande
// en regroupe plusieurs), et deux colonnes à remplir : « Transmis » (menu Oui / Non / Sans objet, colorée) et commentaires.
// À l'impression, un bandeau n'est jamais séparé de son premier document.
function piecesSheet(items, st, c) {
  const s = data.settings;
  const W = [6, 62, 13, 15, 12, 36];
  const PAGE = 500; // hauteur utile d'une page A4 paysage, en points (un peu moins que les 516 réels)
  const rows = [], heights = {}, merges = [], fillRefs = [], breaks = [];
  let used = 0;
  const add = (row, h) => {
    rows.push(row);
    heights[rows.length - 1] = h;
    used = used + h > PAGE ? h : used + h;
    return rows.length;
  };
  // Saut de page avant les `h` points qui suivent s'ils ne tiennent plus sur la page.
  const keep = (h) => { if (used && used + h > PAGE && h <= PAGE) { breaks.push(rows.length); used = 0; } };
  const wide = (v, style, h) => { const n = add([{ v, s: style }].concat([1, 2, 3, 4, 5].map(() => ({ s: style }))), h); merges.push(`A${n}:F${n}`); };
  const lineH = (n) => Math.max(20, n * 15 + 5);
  const dp = st.mode === 'mois' ? `la comptabilité de ${moisNom(st.arrete)}` : `votre ${st.mode === 'bilan' ? 'bilan' : 'situation'} au ${fmtDate(st.arrete)}`;
  const objet = st.mode === 'mois' ? `Comptabilité de ${moisNom(st.arrete)}` : `${st.mode === 'bilan' ? 'Bilan' : 'Situation'} au ${fmtDate(st.arrete)}`;
  const m = c && missionsOf(c.id).find((x) => x.titre === `Demande de pièces — ${piecesLabel(st.mode, st.arrete)}` && isOpen(x));
  const limit = m && m.echeance && m.echeance > todayStr() ? fmtDate(m.echeance) : '';

  // En-tête
  wide('Documents à nous transmettre', 13, 32);
  wide(c ? `${c.nom} — ${objet}` : objet, 14, 22);
  wide(`Liste établie le ${fmtDate(todayStr())}${s.cabinet ? ` par ${s.cabinet}` : ''}${limit ? ` · réponse souhaitée avant le ${limit}` : ''}`, 15, 18);
  add([], 8);
  const intro = `Afin d'établir ${dp}, merci de nous transmettre les documents ci-dessous. Vous pouvez les envoyer au fur et à mesure : indiquez « Oui » dans la colonne « Transmis » pour chaque document envoyé, ou « Sans objet » s'il n'existe pas, en le précisant en commentaire.`;
  wide(intro, 16, lineH(wrapLines(intro, W.reduce((a, b) => a + b, 0) - 6)) + 8);

  // Récapitulatif par rubrique
  const groups = {};
  items.forEach((i) => (groups[i.cat] = groups[i.cat] || []).push(i));
  const cats = Object.keys(PIECES_CATS).filter((k) => groups[k]);
  add([], 10);
  keep(20 * (cats.length + 1));
  add([{ s: 0 }, { v: 'Rubrique', s: 18 }, { v: 'Documents', s: 18 }], 20);
  cats.forEach((k) => add([{ s: 0 }, { v: PIECES_CATS[k], s: 25 }, { v: groups[k].length, s: 26 }], 20));

  // Une rubrique par bandeau, un document par ligne
  let n = 0;
  cats.forEach((k) => {
    const q = k === 'questions';
    const blocks = groups[k].map((it) => {
      const all = it.ops || [];
      const ops = all.slice(0, 30);
      // Espaces insécables dans les guillemets : « et » ne restent jamais seuls en début de ligne.
      const doc = (it.doc || it.text).replace(/« /g, '«\u00a0').replace(/ »/g, '\u00a0»') + (all.length > ops.length ? ` (${ops.length} premières opérations sur ${all.length})` : '');
      const lines = Math.max(1, ops.length);
      const h = Math.max(20, Math.ceil((wrapLines(doc, W[1] - 2) * 15 + 5) / lines));
      return { it, ops, doc, lines, h };
    });
    add([], 14);
    keep(24 + 22 + blocks[0].h * blocks[0].lines);
    wide(`${PIECES_CATS[k].toUpperCase()}  ·  ${groups[k].length} ${q ? 'question' : 'document'}${groups[k].length > 1 ? 's' : ''}`, 17, 24);
    add([{ v: 'N°', s: 18 }, { v: q ? 'Question' : 'Document demandé', s: 18 }, { v: 'Date', s: 18 }, { v: 'Montant', s: 18 }, { v: q ? 'Répondu' : 'Transmis', s: 18 }, { v: q ? 'Votre réponse' : 'Vos commentaires', s: 18 }], 22);
    const first = rows.length + 1;
    blocks.forEach(({ it, ops, doc, lines, h }) => {
      n++;
      if (lines > 1) keep(h * lines);
      const r0 = rows.length + 1;
      for (let j = 0; j < lines; j++) {
        const op = ops[j];
        const amt = op ? op.amt : !j && typeof it.total === 'number' ? it.total : null;
        add([j ? { s: 20 } : { v: n, s: 20 }, j ? { s: 19 } : { v: doc, s: 19 },
          op ? { v: XlsxWriter.serial(op.date), s: 21 } : { s: 21 }, amt === null ? { s: 22 } : { v: Math.round(amt * 100) / 100, s: 22 },
          { s: 23 }, { s: 24 }], h);
      }
      if (lines > 1) merges.push(`A${r0}:A${r0 + lines - 1}`, `B${r0}:B${r0 + lines - 1}`);
    });
    fillRefs.push(`E${first}:E${rows.length}`);
  });

  // Pied de page
  const sig = s.signature || [s.utilisateur, s.cabinet].filter(Boolean).join('\n');
  const sigH = sig ? lineH(wrapLines(sig, 120)) : 0;
  add([], 16);
  keep(20 + sigH);
  wide('Merci pour votre collaboration. Pour toute question, nous restons à votre disposition.', 27, 20);
  if (sig) wide(sig, 27, sigH);

  const ref = fillRefs.join(' ');
  const amp = (x) => String(x || '').replace(/&/g, '&&');
  return {
    name: 'Documents à fournir', rows, widths: W, heights, merges, breaks, grid: false, filter: false,
    lists: ref ? [{ ref, values: ['Oui', 'Non', 'Sans objet'] }] : [],
    colors: ref ? [{ ref, equals: 'Oui', style: 0 }, { ref, equals: 'Non', style: 1 }, { ref, equals: 'Sans objet', style: 2 }] : [],
    page: { landscape: true, footer: `&L${amp(s.cabinet)}&C${amp(c ? `${c.nom} — ${objet}` : objet)}&RPage &P / &N` },
  };
}
