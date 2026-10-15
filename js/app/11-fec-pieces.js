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
// « 31 août 2026 », « 1er septembre 2025 ».
const dateLongue = (iso) => `${Number(iso.slice(8, 10)) === 1 ? '1er' : Number(iso.slice(8, 10))} ${MOIS_LONGS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const piecesLabel = (mode, arrete) => (mode === 'mois' ? `comptabilité au ${dateLongue(arrete)}` : `${mode === 'bilan' ? 'bilan' : 'situation'} au ${fmtDate(arrete)}`);
// Objet d'une demande : « mettre à jour votre comptabilité au 31 août 2026 », « établir votre situation au 31/03/2027 ».
const piecesBut = (dp) => (dp.mode === 'mois' ? `mettre à jour votre comptabilité au ${dateLongue(dp.arrete)}` : `établir votre ${dp.mode === 'bilan' ? 'bilan' : 'situation'} au ${fmtDate(dp.arrete)}`);
const afinDe = (but) => `Afin ${/^[aeéiou]/i.test(but) ? "d'" : 'de '}${but}`;

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

// ---------- Identité des opérations demandées ----------

// Clés des opérations, stables d'une analyse à l'autre : une pièce cochée « reçue » dans une demande n'est plus proposée,
// une pièce déjà demandée n'est pas redemandée. Chaque opération a une clé de famille (pay, dir, immo, att, enc, jus, abo,
// cli, num, tvanv, rel) et, pour une opération de banque, une clé « op » (date, montant payé, libellé) qui la suit quand
// elle change de compte (Pennylane : 4716 → 401 ou 6xx). Deux opérations identiques reçoivent un suffixe « #n », calculé
// sur toute la liste du FEC et non sur la période affichée, pour rester stable d'un mois à l'autre.
function keyer() {
  const seen = new Map();
  return (base) => {
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return n ? `${base}#${n}` : base;
  };
}
const keyLib = (lib) => norm(lib).replace(/[\s|]+/g, ' ').trim().slice(0, 40);
const opKey = (date, amt, lib) => `op|${date}|${Math.round(Math.abs(amt) * 100)}|${keyLib(lib)}`;
// Date (AAAA-MM-JJ ou AAAA-MM) d'une clé, '' si elle n'en porte pas (n° de facture manquant).
const keyDate = (k) => k.split('|').find((x) => /^\d{4}-\d{2}(-\d{2})?$/.test(x)) || '';

// Clés des opérations de chaque liste du FEC, dans l'ordre de la liste (calculées une fois par analyse).
function pieceKeys(r) {
  if (r._pk) return r._pk;
  const p = r.pieces, cy = r.cycles || {};
  const each = (arr, fn) => { const k = keyer(), o = keyer(); return (arr || []).map((x) => fn(x, k, o)); };
  const pk = {
    // Paiement sans facture : montant brut du paiement (le reste non couvert change à chaque facture reçue). `alias` : la
    // facture d'abonnement (ou du client facturé chaque mois) du même mois, déjà demandée ou reçue à ce titre.
    unm: each(p.unmatched, (u, k, o) => ({ keys: [k(`pay|${u.racine}|${u.num}|${u.date}|${u.brut || u.amt}`), o(opKey(u.date, u.brut || u.amt, u.label || u.lib))], alias: `${u.racine === '401' ? 'abo' : 'cli'}|${u.num}|${ymOf(u.date)}` })),
    att: each(p.attente, (l, k, o) => ['att|' + k(attenteKey(l)), o(opKey(l.date, l.c || l.d, l.lib))]),
    dir: each(p.directLines, ([date, compte, , elib, amt, bq], k, o) => [k(`dir|${compte}|${date}|${amt}|${keyLib(elib)}`), o(opKey(date, bq || amt, elib))]),
    immo: each(p.immo, (l, k) => [k(`immo|${l.compte}|${l.date}|${l.montant}`)]),
    enc: each(cy.clients && cy.clients.directSales, ([date, amt, lib], k, o) => [k(`enc|${date}|${amt}|${keyLib(lib)}`), o(opKey(date, amt, lib))]),
    jus: each(cy.justif && cy.justif.missing, (x, k, o) => [k(`jus|${x.kind}|${x.num || ''}|${x.date}|${x.amt}|${x.piece || keyLib(x.lib || '')}`)]
      .concat(x.kind === 'direct' ? [o(opKey(x.date, x.amt, x.lib || ''))] : [])),
  };
  Object.defineProperty(r, '_pk', { value: pk });
  return pk;
}

// Filtre sans mémoire : toutes les opérations (liste brute).
const ALL_PIECES = { ok: () => true, gone: () => false };

// Mois de la plus ancienne opération d'un élément (mois rattaché à l'étape de la demande).
const itemYm = (i, fallback) => (i.ym || (i.ops && i.ops.length ? i.ops.map((o) => o.date).sort()[0].slice(0, 7) : '')
  || ((i.keys || []).map(keyDate).filter(Boolean).sort()[0] || '').slice(0, 7) || ymOf(fallback));

// Règlements et encaissements non affectés à une facture, regroupés par tiers : une demande par tiers, chaque paiement daté.
// `flt.ok(clés)` : opération à proposer ; `flt.gone(clé)` : facture déjà demandée ou reçue.
function unmatchedPieces(r, push, from, to, flt) {
  const pharma = ui.fecProfile === 'pharmacie';
  const d = fmtDate;
  const K = pieceKeys(r).unm;
  const groups = new Map();
  (r.pieces.unmatched || []).forEach((u, i) => {
    if (u.date < from || u.date > to || (u.racine !== '401' && pharma) || !flt.ok(K[i].keys) || flt.gone(K[i].alias)) return;
    const k = u.racine + '|' + u.num;
    (groups.get(k) || groups.set(k, []).get(k)).push({ u, keys: K[i].keys });
  });
  groups.forEach((g) => {
    const list = g.map((x) => x.u);
    const u0 = list[0];
    const total = list.reduce((s2, u) => s2 + u.amt, 0);
    const det = list.slice(0, 8).map((u) => `du ${d(u.date)} (${eur(u.amt)} €)`).join(', ') + (list.length > 8 ? ` et ${list.length - 8} autre(s), total ${eur(total)} €` : '');
    const x = { ops: list.map((u) => ({ date: u.date, amt: u.amt })), keys: g.flatMap((y) => y.keys) };
    if (u0.racine === '401') push('achats', `nf:${u0.num}`, list.length === 1
      ? `Facture ${u0.lib} correspondant au paiement de ${eur(u0.amt)} € du ${d(u0.date)}`
      : `Factures ${u0.lib} correspondant aux paiements ${det}`,
    Object.assign({ doc: list.length === 1 ? `Facture ${u0.lib} correspondant au paiement` : `Factures ${u0.lib} correspondant aux ${list.length} paiements` }, x));
    else push('ventes', `ne:${u0.num}`, list.length === 1
      ? `Facture ou avoir ${u0.lib} correspondant à l'encaissement de ${eur(u0.amt)} € du ${d(u0.date)}`
      : `Factures ou avoirs ${u0.lib} correspondant aux encaissements ${det}`,
    Object.assign({ doc: list.length === 1 ? `Facture ou avoir ${u0.lib} correspondant à l'encaissement` : `Factures ou avoirs ${u0.lib} correspondant aux ${list.length} encaissements` }, x));
  });
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

// Opérations encore en compte d'attente du `from` au `to` (le moteur ne transmet que les lignes ni lettrées ni reclassées).
const attenteOuvertes = (p, from, to) => (p.attente || []).filter((l) => l.date >= from && l.date <= to && !l.lettre && Math.abs(l.soldeCompte) >= 0.01);

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
  syncAttenteStep(key, cat);
  if (clientById(ui.fec.clientId)) persist();
  refresh();
}

// Pièce demandée pour une opération en compte d'attente, selon sa rubrique.
function attenteDoc(l, cat) {
  const enc = l.c > 0;
  const op = `« ${l.lib} »`;
  return cat === 'achats' ? (enc ? `Avoir fournisseur correspondant à l'encaissement ${op}` : `Facture correspondant au paiement ${op}`)
    : cat === 'ventes' ? (enc ? `Facture de vente correspondant à l'encaissement ${op}` : `Avoir client correspondant au paiement ${op}`)
    : `Justificatif ${enc ? "de l'encaissement" : 'du paiement'} ${op}`;
}

// Opération déjà demandée dont on change la rubrique : l'étape en attente de la demande suit (libellé et rubrique).
function syncAttenteStep(key, cat) {
  const f = ui.fec;
  const c = f && clientById(f.clientId);
  if (!c) return;
  const i = pieceKeys(f.result).att.findIndex((ks) => ks[0] === 'att|' + key);
  const l = f.result.pieces.attente[i];
  if (!l) return;
  missionsOf(c.id).filter((m) => isOpen(m) && m.demandePieces).forEach((m) => m.etapes.forEach((e) => {
    if (e.done || e.pid !== 'attente:' + key) return;
    const doc = attenteDoc(l, cat);
    Object.assign(e, { label: `${doc} du ${fmtDate(l.date)} (${eur(l.c || l.d)} €)`, doc, cat: PIECES_CATS[cat] });
    m.updatedAt = nowIso();
  }));
}

// Une demande par opération de banque ou de caisse restée en attente, rangée dans sa rubrique : le client reçoit des
// factures, des ventes ou des opérations diverses à justifier, et non des « opérations à identifier ». Les OD et factures
// passées en attente ne sont pas demandées (à reclasser au cabinet), ni les encaissements qui citent une facture client.
function attentePieces(r, push, from, to, flt) {
  const store = ui.fec && ui.fec.result === r ? rubriquesStore() : {};
  const K = pieceKeys(r).att;
  (r.pieces.attente || []).forEach((l, i) => {
    if (l.date < from || l.date > to || l.lettre || Math.abs(l.soldeCompte) < 0.01 || l.bank === false || (l.sug && l.sug[7]) || !flt.ok(K[i])) return;
    const key = K[i][0].slice(4);
    const cat = ATTENTE_RUBRIQUES.includes(store[key]) ? store[key] : attenteDefaut(l);
    const amt = l.c || l.d;
    const doc = attenteDoc(l, cat);
    push(cat, key, `${doc} du ${fmtDate(l.date)} (${eur(amt)} €)`, { id: 'attente:' + key, src: 'attente', key, compte: l.compte, doc, ops: [{ date: l.date, amt }], keys: K[i] });
  });
}

// Début de l'exercice : date d'ouverture déduite de la clôture, ou première écriture si elle est antérieure (premier
// exercice de plus de 12 mois) ; à défaut, début du mois de `to`.
function exStart(r, to) {
  const p = r.pieces || {};
  if (r.meta.start && r.meta.start <= to) return p.minOp && p.minOp < r.meta.start ? p.minOp : r.meta.start;
  return p.minOp && p.minOp <= to ? p.minOp : `${ymOf(to)}-01`;
}

// Demande mensuelle : pièces manquantes de l'exercice jusqu'à la fin du mois choisi (cycles achats et ventes, opérations en
// attente), d'après l'état actuel du FEC : une pièce d'un mois précédent toujours absente reste demandée. Les contrôles
// faits mois par mois (abonnements, clients facturés chaque mois, ventes sans TVA) sont refaits pour chaque mois de la
// période. `flt` écarte les opérations déjà reçues, déjà demandées ou écartées (voir piecesSuivi).
function monthPieces(r, arrete, flt) {
  const items = [];
  // `x` : précisions pour la liste Excel (doc : document sans date ni montant, ops : opérations datées, total), clés des
  // opérations (keys) et mois rattaché (ym).
  const push = (cat, id, text, x) => items.push(Object.assign({ cat, id: `${cat}:${id}`, text }, x));
  const p = r.pieces;
  const cy = r.cycles;
  const ym = ymOf(arrete);
  const end = endOfMonth(`${ym}-01`);
  const from = exStart(r, end);
  const months = monthsBetween(ymOf(from), ym);
  const inP = (date) => date >= from && date <= end;
  const pharma = ui.fecProfile === 'pharmacie';

  // Règlements fournisseurs et encaissements clients non affectés à une facture (paiement par paiement)
  unmatchedPieces(r, push, from, end, flt);
  // Mois où un tiers a un paiement sans facture (demandé, reçu ou non) : sa facture du mois n'est pas demandée une seconde fois.
  const askedM = new Set((p.unmatched || []).filter((u) => inP(u.date)).map((u) => `${u.racine}|${u.num}|${ymOf(u.date)}`));
  // Archive de justificatifs : écritures sans pièce (exact), à la place de la liste des dépenses payées directement.
  // Les abonnements dont la facture n'est pas saisie du tout restent détectés : l'archive ne peut pas les voir.
  justifPieces(r, push, from, end, flt);
  // Abonnements : mois sans facture d'un fournisseur facturé chaque mois pour un montant stable
  p.suppliers.forEach((sp) => {
    let med = null;
    const miss = months.filter((m) => {
      if (Math.abs(sp.months[m] || 0) >= 0.01 || askedM.has(`401|${sp.num}|${m}`) || !flt.ok([`abo|${sp.num}|${m}`])) return false;
      const v = stableMonthly(sp, m);
      if (v !== null) med = v;
      return v !== null;
    });
    if (miss.length) push('achats', 'rec:' + sp.num, `${miss.length > 1 ? 'Factures' : 'Facture'} ${sp.lib} : ${fmtMonths(miss)} (abonnement de ${eur(med)} € par mois)`, { keys: miss.map((m) => `abo|${sp.num}|${m}`) });
  });
  // Dépenses payées directement, acquisitions d'immobilisations, opérations en compte d'attente
  directPieces(r, push, from, end, flt);
  immoPieces(r, push, from, end, flt);
  attentePieces(r, push, from, end, flt);

  if (!pharma && cy) {
    // Ventes : mois sans facture d'un client facturé chaque mois
    cy.clients.customers.forEach((c) => {
      if (!c.months || RE_DIVERS.test(c.lib || '')) return;
      let med = null;
      const miss = months.filter((m) => {
        if (Math.abs(c.months[m] || 0) >= 0.01 || askedM.has(`411|${c.num}|${m}`) || !flt.ok([`cli|${c.num}|${m}`])) return false;
        const v = usuallyMonthly(c.months, m);
        if (v !== null) med = v;
        return v !== null;
      });
      if (miss.length) push('ventes', 'mcli:' + c.num, `Factures de vente à ${c.lib} : ${fmtMonths(miss)} (facturé habituellement chaque mois, environ ${eur(med, 0)} € TTC)`, { keys: miss.map((m) => `cli|${c.num}|${m}`) });
    });
    numberingPieces(r, push, from, end, flt);
    // Ventes sans TVA sur des comptes taxables ou non qualifiés (contrôle de la TVA), regroupées par mois ; le paramétrage
    // de la TVA (coûteux) n'est lu que s'il y en a sur la période.
    const nvIn = cy.tva && cy.tva.nv ? cy.tva.nv.filter(([date]) => inP(date)) : [];
    if (nvIn.length) {
      const TM = tvaModel(r);
      const byM = new Map();
      nvIn.filter(([, , , , m]) => Object.keys(m).some((c) => c.startsWith('70') && TM.ca[c] && (typeof TM.ca[c].role === 'number' || TM.ca[c].role === 'sans'))).forEach(([date, , , , m]) => {
        const x = byM.get(ymOf(date)) || byM.set(ymOf(date), { n: 0, base: 0 }).get(ymOf(date));
        x.n++;
        x.base -= Object.values(m).reduce((t, v) => t + v, 0);
      });
      const ms = Array.from(byM.keys()).filter((m) => flt.ok([`tvanv|${m}`])).sort();
      const n = ms.reduce((t, m) => t + byM.get(m).n, 0), base = ms.reduce((t, m) => t + byM.get(m).base, 0);
      if (ms.length) push('questions', `tvanv:${ms[0]}`, `Ventes sans TVA (${fmtMonths(ms)} : ${n} facture(s), ${eur(base)} € HT) : nature des opérations (export, livraison intracommunautaire avec le n° de TVA du client, opération exonérée) ?`, { keys: ms.map((m) => `tvanv|${m}`) });
    }
    // Encaissements enregistrés en ventes sans facture client (activité facturée), 15 par mois au plus
    const facture = cy.clients.customers.reduce((s, c) => s + c.ht, 0);
    if (r.kpi.ca > 0 && facture >= r.kpi.ca * 0.5) {
      const K = pieceKeys(r).enc;
      const perM = {};
      (cy.clients.directSales || []).forEach(([date, amt, lib], i) => {
        if (!inP(date) || !flt.ok(K[i]) || (perM[ymOf(date)] = (perM[ymOf(date)] || 0) + 1) > 15) return;
        push('ventes', 'enc:' + K[i][0], `Facture de vente correspondant à l'encaissement « ${lib} » du ${fmtDate(date)} (${eur(amt)} €)`,
          { doc: `Facture de vente correspondant à l'encaissement « ${lib} »`, ops: [{ date, amt }], keys: K[i] });
      });
    }
  }
  return items;
}

// Dépenses payées directement (banque ou caisse → charge, sans facture fournisseur), regroupées par compte et libellé sur
// la période. `opts.min` / `opts.max` : montant minimal d'un groupe et nombre de groupes (situation et bilan).
function directPieces(r, push, from, to, flt, opts = {}) {
  if (justifOk(r)) return; // archive de justificatifs : liste exacte (justifPieces)
  const K = pieceKeys(r).dir;
  const groups = new Map();
  (r.pieces.directLines || []).forEach(([date, compte, clib, elib, amt], i) => {
    if (date < from || date > to || !flt.ok(K[i])) return;
    const lib = String(elib).replace(/\S*\d\S*/g, '').replace(/\s+/g, ' ').trim() || elib;
    const k = compte + '|' + norm(lib);
    const g = groups.get(k) || groups.set(k, { lib, clib, n: 0, total: 0, ops: [], keys: [] }).get(k);
    g.n++;
    g.total = round2(g.total + amt);
    g.ops.push({ date, amt });
    g.keys.push(...K[i]);
  });
  const docName = (lib) => (/amende|antai|contravention|\bpv\b|penalit/i.test(lib) ? 'Avis de contravention' : 'Facture');
  Array.from(groups.values()).filter((g) => g.total >= (opts.min || 0)).sort((a, b) => b.total - a.total).slice(0, opts.max || Infinity).forEach((g) => {
    g.ops.sort((a, b) => a.date.localeCompare(b.date));
    const lib = g.lib.slice(0, 45);
    push('justif', 'dir:' + g.keys[0], g.n === 1
      ? `${docName(g.lib)} « ${lib} » du ${fmtDate(g.ops[0].date)} (${eur(g.total)} €) — ${g.clib}`
      : `Factures « ${lib} » : ${g.n} paiements (${fmtMonths(Array.from(new Set(g.ops.map((o) => ymOf(o.date)))))}), total ${eur(g.total)} € — ${g.clib}`,
    { doc: `${g.n === 1 ? docName(g.lib) : 'Factures'} « ${lib} » — ${g.clib}`, ops: g.ops, keys: g.keys });
  });
}

// Acquisitions d'immobilisations de la période : une facture par acquisition.
function immoPieces(r, push, from, to, flt) {
  const K = pieceKeys(r).immo;
  r.pieces.immo.forEach((l, i) => {
    if (l.date >= from && l.date <= to && flt.ok(K[i])) push('immo', K[i][0], `Facture d'acquisition « ${l.lib} » du ${fmtDate(l.date)} (${eur(l.montant)} €, ${l.clib})`,
      { doc: `Facture d'acquisition « ${l.lib} » (${l.clib})`, ops: [{ date: l.date, amt: l.montant }], keys: K[i] });
  });
}

// Numéros de facture de vente manquants : chaque trou de la numérotation est rattaché au mois de la facture qui le suit ;
// une pièce par numéro (50 par série, puis une ligne pour le reste).
function numberingPieces(r, push, from, to, flt) {
  if (!r.cycles || ui.fecProfile === 'pharmacie') return;
  r.cycles.clients.numbering.filter((g) => !g.sparse && g.seq).forEach((g) => {
    const miss = [];
    const key = (n) => `num|${g.jc || ''}|${g.prefix}|${n}`;
    for (let i = 1; i < g.seq.length && miss.length < 200; i++) {
      const date = g.seq[i][1];
      if (!date || date < from || date > to) continue;
      for (let n = g.seq[i - 1][0] + 1; n < g.seq[i][0] && miss.length < 200; n++) if (flt.ok([key(n)])) miss.push([n, date]);
    }
    if (!miss.length) return;
    const ref = (n) => g.prefix + String(n).padStart(g.w || 0, '0');
    miss.slice(0, 50).forEach(([n, date]) => push('ventes', `num:${g.jc || ''}:${g.prefix}:${n}`, `Facture de vente n° ${ref(n)} (${moisNom(date)}) : copie, ou confirmation de son annulation`, { keys: [key(n)], ym: ymOf(date) }));
    const rest = miss.slice(50);
    if (rest.length) push('ventes', `num:${g.jc || ''}:${g.prefix}:+`, `Factures de vente n° ${rest.map(([n]) => ref(n)).join(', ')} : copies, ou confirmation de leur annulation`, { keys: rest.map(([n]) => key(n)), ym: ymOf(rest[0][1]) });
  });
}

// Noms à ne jamais solliciter (réglage « Ne jamais demander de pièces pour ces fournisseurs »), en mot entier.
function ignoredRe() {
  const list = (data.settings.piecesIgnore || []).map((x) => norm(x).trim()).filter(Boolean);
  if (!list.length) return null;
  return new RegExp(`(^|[^a-z0-9])(${list.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})([^a-z0-9]|$)`);
}
const ignoreFilter = (items) => { const re = ignoredRe(); return re ? items.filter((i) => i.cat === 'cloture' || !re.test(norm(i.text))) : items; };

// ---------- Suivi des demandes de pièces du dossier ----------

const normLab = (t) => norm(t).replace(/\s+/g, ' ').trim();
// Mois rattaché à une étape d'une demande (étapes antérieures à la version 46 : mois de la demande).
const stepYm = (m, e) => e.ym || ymOf((m.demandePieces && m.demandePieces.arrete) || m.createdAt || todayStr());

// Demande de pièces du même exercice que l'analyse : même date de clôture, ou date d'arrêté comprise dans l'exercice.
function sameExercice(dp, r) {
  if (dp.closing && r.meta.closing) return dp.closing === r.meta.closing;
  const to = r.meta.closing || '9999-12-31';
  return dp.arrete >= exStart(r, r.meta.closing || (r.pieces && r.pieces.maxOp) || dp.arrete) && dp.arrete <= to;
}

// Pièces écartées volontairement (décochées lors d'une demande) : conservées par dossier, proposées à part.
function ecartesStore(create) {
  const f = ui.fec;
  const c = clientById(f.clientId);
  if (c) return c.piecesEcartes || (create ? (c.piecesEcartes = {}) : {});
  return f.ecartes || (create ? (f.ecartes = {}) : {});
}
function setEcarte(keys, on) {
  const store = ecartesStore(true);
  keys.forEach((k) => { if (on) store[k] = todayStr(); else delete store[k]; });
  const all = Object.keys(store);
  if (all.length > 2000) all.sort((a, b) => store[a].localeCompare(store[b])).slice(0, all.length - 2000).forEach((k) => delete store[k]);
}

// Mémoire des demandes de l'exercice, tirée des missions « Demande de pièces » du dossier rattaché à l'analyse :
// pièces reçues (étapes cochées, demande ouverte ou terminée), pièces déjà demandées (étapes en attente d'une demande
// ouverte), pièces écartées. Les étapes sans clé (demandes antérieures à la version 46, relevés, documents de clôture,
// questions) sont reconnues à leur libellé.
function piecesSuivi(r) {
  const f = ui.fec;
  const c = f && f.result === r && clientById(f.clientId);
  const recv = new Set(), pend = new Map(), recvLab = new Set(), pendLab = new Map();
  let nRecues = 0;
  const ec = f && f.result === r ? ecartesStore() : {};
  if (c) missionsOf(c.id).filter((m) => m.demandePieces && sameExercice(m.demandePieces, r)).forEach((m) => m.etapes.forEach((e) => {
    const lab = e.keys && e.keys.length ? null : normLab(e.label);
    if (e.done) { (e.keys || []).forEach((k) => recv.add(k)); if (lab) recvLab.add(lab); nRecues++; }
    else if (isOpen(m)) { (e.keys || []).forEach((k) => pend.set(k, { m, e })); if (lab) pendLab.set(lab, { m, e }); }
  }));
  const gone = (k) => recv.has(k) || pend.has(k);
  return {
    c, recv, pend, recvLab, pendLab, ec, nRecues,
    // Nouvelles opérations : ni reçues, ni déjà demandées, ni écartées
    flt: { ok: (keys) => keys.every((k) => !gone(k) && !ec[k]), gone },
    // Opérations écartées (et seulement elles)
    fltEc: { ok: (keys) => keys.every((k) => !gone(k)) && keys.some((k) => ec[k]), gone },
  };
}

// Élément sans clé déjà reçu ou déjà demandé (reconnu à son libellé).
const knownLab = (S, i) => S.recvLab.has(normLab(i.text)) || S.pendLab.has(normLab(i.text));

// Pièces à demander : opérations jamais demandées (ni reçues, ni en attente, ni écartées), hors fournisseurs à ne jamais
// solliciter.
function computePieces(r, mode, arrete, S = piecesSuivi(r)) {
  return ignoreFilter(computePiecesRaw(r, mode, arrete, S.flt).filter((i) => !knownLab(S, i)));
}

// Pièces écartées lors d'une demande précédente (décochées), toujours manquantes.
function computePiecesEcartes(r, mode, arrete, S = piecesSuivi(r)) {
  if (!Object.keys(S.ec).length) return [];
  return ignoreFilter(computePiecesRaw(r, mode, arrete, S.fltEc).filter((i) => i.keys && i.keys.length && !knownLab(S, i)));
}

// Familles de pièces que l'analyse sait recalculer (une pièce absente de la liste est alors bien comptabilisée).
function piecesCoverage(r, mode) {
  const cov = new Set(['att', 'immo', 'abo', justifOk(r) ? 'jus' : 'dir']);
  if (r.pieces.unmatched) cov.add('pay');
  if (r.cycles && ui.fecProfile !== 'pharmacie') {
    cov.add('num');
    if (mode === 'mois') ['cli', 'tvanv', 'enc'].forEach((x) => cov.add(x));
  }
  return cov;
}
const TRUNC_OF = { pay: 'unm', att: 'att', dir: 'dir', immo: 'immo', enc: 'enc' };

// Contexte du contrôle « comptabilisée depuis la demande » : clés et opérations (date, montant) encore listées dans la
// liste brute (sans mémoire, avant le filtre des fournisseurs à ne jamais solliciter).
function solveCtx(r, mode, arrete) {
  const raw = computePiecesRaw(r, mode, arrete, ALL_PIECES);
  const present = new Set(), weak = new Set();
  raw.forEach((i) => {
    (i.keys || []).forEach((k) => present.add(k));
    (i.ops || []).forEach((o) => weak.add(`${o.date}|${Math.round(Math.abs(o.amt) * 100)}`));
  });
  (r.pieces.unmatched || []).forEach((u, i) => present.add(pieceKeys(r).unm[i].alias));
  return { present, weak, cov: piecesCoverage(r, mode), from: exStart(r, arrete), to: arrete, maxOp: r.pieces.maxOp || arrete, trunc: r.pieces.trunc || {} };
}

// Étape en attente dont la pièce a été comptabilisée depuis la demande : toutes ses opérations relèvent de familles
// recalculées par l'analyse, sur sa période (ni tronquée, ni postérieure au FEC), et aucune n'est plus listée, même sous
// une autre forme (même date et même montant). Jamais pour une étape décochée à la main après une coche automatique.
function solvable(m, e, x) {
  if (e.done || e.noAuto || !e.keys || !e.keys.length) return false;
  if ((m.demandePieces.maxOp || '') > x.maxOp) return false;
  const fam = e.keys.filter((k) => !k.startsWith('op|'));
  if (!fam.length) return false;
  for (const k of fam) {
    const f = k.split('|')[0];
    if (!x.cov.has(f) || (k.startsWith('pay|411') && ui.fecProfile === 'pharmacie')) return false;
    const dt = keyDate(k);
    if (!dt) { if (f !== 'num') return false; continue; }
    if (dt < x.from.slice(0, dt.length) || dt > x.to.slice(0, dt.length) || dt > x.maxOp.slice(0, dt.length)) return false;
    const tr = x.trunc[TRUNC_OF[f]];
    if (tr && dt < tr.slice(0, dt.length)) return false;
  }
  if (e.keys.some((k) => x.present.has(k))) return false;
  return !e.keys.some((k) => k.startsWith('op|') && x.weak.has(k.split('|').slice(1, 3).join('|')));
}

// Pièces déjà demandées, toujours attendues : étapes en attente des demandes ouvertes de l'exercice, rattachées à un mois
// jusqu'à celui de la liste. `sent` : date d'envoi (première relance ou envoi postérieur à l'ajout de l'étape).
function piecesPending(r, mode, arrete, S = piecesSuivi(r)) {
  if (!S.c) return [];
  const x = solveCtx(r, mode, arrete);
  const out = [];
  const seen = new Set();
  missionsOf(S.c.id).filter((m) => isOpen(m) && m.demandePieces && sameExercice(m.demandePieces, r)).forEach((m) => m.etapes.forEach((e) => {
    if (e.done || seen.has(e.id) || stepYm(m, e) > ymOf(arrete)) return;
    seen.add(e.id);
    const at = e.at || m.createdAt || '';
    const sent = (m.relances || []).filter((t) => t >= at).sort()[0] || '';
    out.push({ m, e, sent, comptab: solvable(m, e, x) });
  }));
  return out;
}

// Coche les pièces déjà demandées et comptabilisées depuis (action explicite : création de la demande, relance, bouton).
function autoSolve(c, r, st, stamp = nowIso()) {
  const list = piecesPending(r, st.mode, st.arrete).filter((x) => x.comptab);
  const why = `comptabilisée d'après le FEC ${r.meta.fileName}`;
  list.forEach(({ m, e }) => {
    Object.assign(e, { done: true, doneAt: stamp, auto: why });
    m.updatedAt = stamp;
  });
  if (list.length) log(c.id, `${list.length} pièce(s) déjà demandée(s) et comptabilisée(s) depuis cochée(s) automatiquement (${why}).`, true);
  // Demande dont toutes les pièces sont désormais reçues
  new Set(list.map((x) => x.m)).forEach((m) => {
    if (m.etapes.every((e) => e.done)) setStatus(m, 'termine');
    else if (m.demandePieces.mode === 'mois') piecesReceived(m);
  });
  return list.length;
}

function computePiecesRaw(r, mode, arrete, flt = ALL_PIECES) {
  if (mode === 'mois') return monthPieces(r, arrete, flt);
  const p = r.pieces;
  const items = [];
  const push = (cat, id, text, x) => items.push(Object.assign({ cat, id: `${cat}:${id}`, text }, x));
  const from = exStart(r, arrete);
  const endYm = ymOf(arrete);
  const startYm = ymOf(from);
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
  if (p.unmatched) unmatchedPieces(r, push, '0000-00-00', arrete, flt);
  else p.tiers.forEach((t) => {
    if (t.racine === '401' && t.s > 0) push('achats', 'deb:' + t.num, `Facture ${t.lib} correspondant au paiement de ${eur(t.s)} € (compte fournisseur débiteur : payé mais non facturé)`);
    if (t.racine === '411' && t.s < 0 && !pharma) push('ventes', 'cred:' + t.num, `Facture ou avoir ${t.lib} : règlement de ${eur(-t.s)} € reçu sans facture correspondante`);
  });

  // Archive de justificatifs : écritures sans pièce (exact), à la place de la liste des dépenses payées directement
  justifPieces(r, push, r.meta.start || '0000-00-00', arrete, flt);

  // Abonnements (montant mensuel stable) dont des factures manquent ; jamais d'estimation pour les dépenses ponctuelles
  const askedT = new Set((p.unmatched || []).filter((u) => u.date <= arrete).map((u) => `${u.racine}|${u.num}`));
  p.suppliers.forEach((sp) => {
    const sub = !askedT.has('401|' + sp.num) && subscriptionGaps(sp, endYm);
    const miss = sub ? sub.missing.filter((m) => flt.ok([`abo|${sp.num}|${m}`])) : [];
    if (miss.length) push('achats', 'rec:' + sp.num, `Factures ${sp.lib} : ${fmtMonths(miss)} (abonnement de ${eur(sub.med)} € par mois)`, { keys: miss.map((m) => `abo|${sp.num}|${m}`) });
  });
  if (pharma && r.aging) pharmaPieces(r, mode, arrete, push);
  numberingPieces(r, push, '0000-00-00', arrete, flt);
  cyclePieces(r, mode, arrete, push);
  // Éléments marqués « pièce demandée » dans la feuille de travail
  if (ui.fec && ui.fec.result === r) Object.values(wpStore().items).forEach((it) => Object.entries(it.els || {}).forEach(([ek, el]) => {
    // Texte destiné au client : sans n° de compte ni référence d'écriture interne.
    const txt = String(el.label || '').split(' · ').filter((x) => !/^\d{4,}\b/.test(x) && !/^[A-Z0-9]{1,5} \d+$/.test(x)).join(' · ');
    if (el.st === 'piece') push('questions', 'el:' + ek.slice(0, 80), `Justificatif de l'opération : ${txt}${el.note ? ` — ${el.note}` : ''}`);
  }));

  // Dépenses payées directement (banque ou caisse → charge, sans compte fournisseur) : groupes de 30 € au moins
  directPieces(r, push, '0000-00-00', arrete, flt, { min: 30, max: 120 });

  // Opérations en compte d'attente, chacune dans sa rubrique
  attentePieces(r, push, '0000-00-00', arrete, flt);

  // Immobilisations acquises
  immoPieces(r, push, '0000-00-00', arrete, flt);

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
  const rkey = keyer();
  if (rappro) rappro.bankOnly.filter((o) => o.date <= arrete).forEach((o) => {
    const keys = [rkey(`rel|${o.date}|${o.amount}|${keyLib(o.label)}`), opKey(o.date, o.amount, o.label)];
    if (!flt.ok(keys)) return;
    push('releve', keys[0], `Justificatif de l'opération bancaire « ${o.label} » du ${d(o.date)} (${o.amount > 0 ? 'encaissement' : 'paiement'} de ${eur(Math.abs(o.amount))} €), non comptabilisée`,
      { doc: `Justificatif ${o.amount > 0 ? "de l'encaissement" : 'du paiement'} « ${o.label} », non comptabilisé`, ops: [{ date: o.date, amt: Math.abs(o.amount) }], keys });
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
    p.from = exStart(f.result, p.arrete);
    return p;
  }
  if (!f.pieces) {
    const mode = isSituation(f.result) ? 'situation' : 'bilan';
    f.pieces = { mode, arrete: defaultArrete(f.result, mode), excluded: new Set() };
  }
  f.pieces.from = exStart(f.result, f.pieces.arrete);
  return f.pieces;
}

function selectedPieces() {
  const st = piecesState();
  return computePieces(ui.fec.result, st.mode, st.arrete).filter((i) => !st.excluded.has(i.id));
}

// Contenu de l'onglet : pièces à demander (jamais demandées), déjà demandées (en attente du client), écartées.
function piecesView(r, st) {
  const S = piecesSuivi(r);
  return { S, fresh: computePieces(r, st.mode, st.arrete, S), pending: piecesPending(r, st.mode, st.arrete, S), ecartes: computePiecesEcartes(r, st.mode, st.arrete, S) };
}
// Pièces encore dues par le client à la date : à demander et déjà demandées (compteurs de l'onglet et du portefeuille).
function piecesCount(r, mode, arrete) {
  const S = piecesSuivi(r);
  return computePieces(r, mode, arrete, S).length + piecesPending(r, mode, arrete, S).length;
}

// Rubrique d'une étape (libellé enregistré) ; les « opérations à identifier » des premières demandes vont en opérations diverses.
const CAT_OF_LABEL = Object.assign({ 'Opérations à identifier': 'divers' }, ...Object.entries(PIECES_CATS).map(([k, v]) => ({ [v]: k })));
// Pièce déjà demandée présentée comme un élément de liste (Excel, texte copié), telle que le client l'a reçue.
const pendingItem = ({ e }) => ({ cat: CAT_OF_LABEL[e.cat] || 'questions', id: 'step:' + e.id, text: e.label, doc: e.doc, ops: e.ops, total: e.total });

function piecesText(items, pending = []) {
  const block = (list) => {
    const groups = {};
    list.forEach((i) => (groups[i.cat] = groups[i.cat] || []).push(i.text));
    return Object.keys(PIECES_CATS).filter((k) => groups[k]).map((k) => `${PIECES_CATS[k]} :\n${groups[k].map((t) => `- ${t}`).join('\n')}`).join('\n\n');
  };
  return [items.length ? block(items) : '', pending.length ? `Pour rappel, déjà demandés :\n\n${block(pending.map(pendingItem))}` : ''].filter(Boolean).join('\n\n');
}
function piecesCopyText() {
  const st = piecesState();
  const v = piecesView(ui.fec.result, st);
  return piecesText(v.fresh.filter((i) => !st.excluded.has(i.id)), v.pending);
}

// Familles dont la liste du moteur est tronquée (fichier volumineux) à une date postérieure au début de la période.
function truncNote(r, from) {
  const t = r.pieces.trunc || {};
  const names = { unm: 'paiements sans facture', dir: 'dépenses payées directement', att: "comptes d'attente", immo: 'immobilisations', enc: 'encaissements sans facture' };
  const list = Object.keys(names).filter((k) => t[k] && t[k] > from);
  return list.length ? `<div class="banner warn"><span><strong>Liste partielle (fichier volumineux)</strong> : ${list.map((k) => `${names[k]} antérieur(e)s au ${fmtDate(t[k])}`).join(', ')} non examiné(e)s.</span></div>` : '';
}

function viewPieces() {
  const f = ui.fec;
  const r = f.result;
  const st = piecesState();
  const mois = st.mode === 'mois';
  const v = piecesView(r, st);
  const items = v.fresh;
  const kept = items.filter((i) => !st.excluded.has(i.id));
  const c = clientById(f.clientId);
  const req = c && openRequest(c, st, r);
  const nAttente = items.filter((i) => i.src === 'attente').length;
  const byCat = (list, catOf) => {
    const groups = {};
    list.forEach((x) => (groups[catOf(x)] = groups[catOf(x)] || []).push(x));
    return Object.keys(PIECES_CATS).filter((k) => groups[k]).map((k) => [k, groups[k]]);
  };
  const rubSel = (key, cat) => `<select data-piece-rub="${esc(key)}" aria-label="Rubrique de la demande">${ATTENTE_RUBRIQUES.map((k) => `<option value="${k}"${k === cat ? ' selected' : ''}>${esc(PIECES_CATS[k])}</option>`).join('')}</select>`;
  const piece = (i) => {
    const box = `<label class="check piece"><input type="checkbox" data-piece="${esc(i.id)}"${st.excluded.has(i.id) ? '' : ' checked'}><span>${esc(i.text)}</span></label>`;
    if (i.src !== 'attente') return box;
    // Opération en compte d'attente : rubrique de la demande au choix
    return `<div class="piece-row">${box}<span class="piece-rub"><span class="badge" title="Opération en compte d'attente">${esc(i.compte)}</span>${rubSel(i.key, i.cat)}</span></div>`;
  };
  const pend = ({ m, e, sent, comptab }) => {
    const key = (e.pid || '').startsWith('attente:') ? e.pid.slice(8) : '';
    const cat = CAT_OF_LABEL[e.cat];
    const when = sent ? `demandée le ${fmtDate(sent.slice(0, 10))}` : `ajoutée le ${fmtDate((e.at || m.createdAt || '').slice(0, 10))}, pas encore envoyée`;
    return `<div class="piece-row pending"><span class="piece-text">${esc(e.label)}</span><span class="piece-rub">
      ${comptab ? '<span class="badge ok" title="Plus listée dans le FEC : facture saisie ou opération reclassée">comptabilisée depuis la demande</span>' : ''}
      <span class="badge warn">${esc(when)}</span>
      ${key && ATTENTE_RUBRIQUES.includes(cat) ? `<span class="badge" title="Opération en compte d'attente">${esc(key.split('|')[0])}</span>${rubSel(key, cat)}` : ''}
      <button class="btn small" data-action="piece-recue" data-mission="${esc(m.id)}" data-step="${esc(e.id)}">Reçue</button></span></div>`;
  };
  const nComptab = v.pending.filter((x) => x.comptab).length;
  const action = kept.length ? (req ? 'Compléter la demande en cours et préparer le mail' : 'Créer la demande et préparer le mail') : v.pending.length ? 'Préparer la relance' : 'Créer la demande et préparer le mail';
  const group = (k, list, fn) => `<div class="pieces-group"><h3>${esc(PIECES_CATS[k])} <span class="count">${list.length}</span></h3>${list.map(fn).join('')}</div>`;
  return `
    <section class="card">
      <h2>${mois ? `Pièces manquantes au ${esc(dateLongue(st.arrete))}` : 'Pièces à demander au client'}</h2>
      <p class="muted small">${mois
        ? `Exercice ouvert le ${esc(dateLongue(st.from))} : pièces des achats et des ventes encore manquantes jusqu'au ${esc(dateLongue(st.arrete))} (mois choisi et mois précédents), d'après le FEC actuel. Une pièce cochée « reçue » dans une demande n'est plus proposée ; une pièce déjà demandée reste listée avec la date de la demande, sans être redemandée. La demande mensuelle du dossier est unique : elle se complète de mois en mois.`
        : "Liste établie à partir des écritures : relevés manquants, factures récurrentes absentes, paiements sans facture, opérations en compte d'attente… Une pièce cochée « reçue » dans une demande du dossier n'est plus proposée. Décochez ce qui ne s'applique pas, puis créez la demande."}</p>
      ${truncNote(r, st.from)}
      ${c ? '' : '<div class="banner info"><span>Rattachez l\'analyse à un dossier (en haut de page) : les pièces déjà demandées ou reçues seront reconnues et la demande pourra être créée.</span></div>'}
      ${nAttente ? `<p class="muted small">Opérations en compte d'attente (${nAttente}, repérées par leur n° de compte) : choisissez pour chacune la rubrique de la demande, <em>Ventes et encaissements</em>, <em>Factures fournisseurs</em> ou <em>Opérations diverses</em>. La rubrique proposée suit l'affectation déjà utilisée pour le même libellé, sinon le sens de l'opération ; votre choix est conservé dans le dossier.</p>` : ''}
      <div class="filters pieces-opts">
        ${mois ? '' : `<div class="seg" role="group" aria-label="Travail à préparer">
          <button class="${st.mode === 'situation' ? 'on' : ''}" data-action="pieces-mode" data-mode="situation">Situation</button>
          <button class="${st.mode === 'bilan' ? 'on' : ''}" data-action="pieces-mode" data-mode="bilan">Bilan</button>
        </div>
        <label class="inline-label">Arrêté au <input type="date" data-pieces="arrete" value="${esc(st.arrete)}"></label>`}
        <span class="muted small">${kept.length} élément(s) retenu(s) sur ${items.length}${v.pending.length ? ` · ${v.pending.length} déjà demandé(s)` : ''}</span>
      </div>
      <h3 class="pieces-head">À demander <span class="count">${items.length}</span></h3>
      ${items.length ? byCat(items, (i) => i.cat).map(([k, list]) => group(k, list, piece)).join('') : `<p class="muted">Aucune nouvelle pièce à demander${mois ? ` du ${esc(fmtDate(st.from))} au ${esc(fmtDate(st.arrete))}` : ' pour cette période'}. 👍</p>`}
      ${v.pending.length ? `<h3 class="pieces-head">Déjà demandées, en attente du client <span class="count">${v.pending.length}</span></h3>
        <p class="muted small">Pièces des demandes en cours, toujours attendues : elles figurent dans le mail (« Pour rappel ») et la liste Excel, sans être redemandées. « Reçue » coche la pièce dans sa demande.</p>
        ${nComptab ? `<p class="small"><button class="btn small" data-action="pieces-sync">Marquer comme reçues les pièces comptabilisées depuis la demande (${nComptab})</button></p>` : ''}
        ${byCat(v.pending, (x) => CAT_OF_LABEL[x.e.cat] || 'questions').map(([k, list]) => group(k, list, pend)).join('')}` : ''}
      ${v.ecartes.length ? `<details class="pieces-ecartes"><summary>Écartées <span class="count">${v.ecartes.length}</span></summary>
        <p class="muted small">Pièces décochées lors d'une demande précédente : elles ne sont plus proposées. Cochez-en une pour la remettre dans les pièces à demander.</p>
        ${v.ecartes.map((i) => `<label class="check piece"><input type="checkbox" data-ecarte="${esc(JSON.stringify(i.keys))}"><span>${esc(i.text)}</span></label>`).join('')}
      </details>` : ''}
      ${v.S.nRecues ? `<p class="muted small">${v.S.nRecues} pièce(s) reçue(s) depuis le début de l'exercice ne sont plus proposées.</p>` : ''}
      <div class="pieces-actions">
        <button class="btn primary" data-action="pieces-demande"${c && (kept.length || v.pending.length) ? '' : ' disabled'}>${icon('mail')}${action}</button>
        <button class="btn" data-action="pieces-copy"${kept.length || v.pending.length ? '' : ' disabled'}>Copier la liste</button>
        <button class="btn" data-action="pieces-xlsx"${kept.length || v.pending.length ? '' : ' disabled'}>Liste Excel pour le client</button>
      </div>
    </section>
    ${supplierRequestsCard()}`;
}

// ---------- Demandes de factures directement aux fournisseurs (laboratoires, grossistes…) ----------

// Période couverte par la demande : l'exercice jusqu'à la date d'arrêté, ou le mois en mode mensuel.
function supplierPeriod(r) {
  const st = piecesState();
  if (st.mode === 'mois') return { from: st.from, to: st.arrete };
  return { from: st.from, to: st.mode === 'bilan' ? r.meta.closing || st.arrete : st.arrete };
}

// Factures manquantes par fournisseur : paiements sans facture et mois d'abonnement absents, sur la période, sauf les
// factures déjà reçues du client.
function supplierRequests(r) {
  const { from, to } = supplierPeriod(r);
  const re = ignoredRe();
  const recv = piecesSuivi(r).recv;
  const got = (keys) => keys.some((k) => recv.has(k));
  const K = pieceKeys(r);
  const map = new Map();
  const get = (num, lib) => map.get(num) || map.set(num, { num, lib, pays: [], months: [], docs: [] }).get(num);
  (r.pieces.unmatched || []).forEach((u, i) => {
    if (u.racine === '401' && u.date >= from && u.date <= to && !got(K.unm[i].keys.concat(K.unm[i].alias))) get(u.num, u.lib).pays.push(u);
  });
  const exact = justifOk(r);
  if (exact) r.cycles.justif.missing.forEach((x, i) => { if (x.kind === 'achat' && x.date >= from && x.date <= to && !got(K.jus[i])) get(x.num, x.tlib).docs.push(x); });
  const endYm = ymOf(to), startYm = ymOf(from);
  r.pieces.suppliers.forEach((sp) => {
    const sub = subscriptionGaps(sp, endYm);
    const missing = sub ? sub.missing.filter((ym) => ym >= startYm && !recv.has(`abo|${sp.num}|${ym}`)) : [];
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

// Demande en cours du dossier : pour la demande mensuelle, la demande mensuelle ouverte de l'exercice (une seule, cumulative) ;
// pour une situation ou un bilan, celle de la même date.
function openRequest(c, st, r) {
  const list = missionsOf(c.id).filter((x) => isOpen(x) && x.demandePieces && x.demandePieces.mode === st.mode);
  if (st.mode !== 'mois') return list.find((x) => x.demandePieces.arrete === st.arrete);
  return list.filter((x) => sameExercice(x.demandePieces, r)).sort((a, b) => b.demandePieces.arrete.localeCompare(a.demandePieces.arrete))[0];
}

// Étape d'une demande pour un élément de la liste : clés et mois des opérations, document et opérations pour l'Excel.
const pieceStep = (i, st, stamp) => Object.assign({ id: uid(), label: i.text, cat: PIECES_CATS[i.cat], done: false, doneAt: null, at: stamp, ym: itemYm(i, st.arrete) },
  i.keys && i.keys.length ? { keys: i.keys } : {}, i.doc ? { doc: i.doc } : {}, i.ops && i.ops.length ? { ops: i.ops.slice(0, 30) } : {},
  typeof i.total === 'number' ? { total: i.total } : {}, i.src === 'attente' ? { pid: i.id } : {});

// Étapes en attente des demandes antérieures à la version 46 (sans clé), reconnues à leur libellé : elles reçoivent les clés
// de leurs opérations, pour être suivies comme les autres.
function adoptKeys(c, r, st) {
  const byLab = new Map(computePiecesRaw(r, st.mode, st.arrete).filter((i) => i.keys && i.keys.length).map((i) => [normLab(i.text), i]));
  missionsOf(c.id).filter((m) => isOpen(m) && m.demandePieces && sameExercice(m.demandePieces, r)).forEach((m) => m.etapes.forEach((e) => {
    const i = !e.done && !e.keys && byLab.get(normLab(e.label));
    if (i) Object.assign(e, { keys: i.keys, ym: e.ym || stepYm(m, e) }, i.src === 'attente' ? { pid: i.id } : {});
  }));
}

// Autres demandes mensuelles ouvertes du même exercice (créées avant la version 46) : leurs pièces encore attendues passent
// dans la demande unique ; elles sont closes sans valoir réception (« Pièces reçues » des missions du mois non cochées).
function absorbMonthly(c, target, r, stamp) {
  missionsOf(c.id).filter((x) => x !== target && isOpen(x) && x.demandePieces && x.demandePieces.mode === 'mois' && sameExercice(x.demandePieces, r)).forEach((o) => {
    const wait = o.etapes.filter((e) => !e.done);
    const dup = (e) => target.etapes.some((t) => !t.done && ((e.keys && t.keys && e.keys.some((k) => t.keys.includes(k))) || normLab(t.label) === normLab(e.label)));
    wait.filter((e) => !dup(e)).forEach((e) => target.etapes.push(Object.assign({}, e, { ym: stepYm(o, e) })));
    o.etapes = o.etapes.filter((e) => e.done);
    Object.assign(o, { statut: 'termine', termineLe: todayStr(), updatedAt: stamp, notes: `${o.notes ? o.notes + '\n' : ''}Pièces encore attendues (${wait.length}) reprises le ${fmtDate(todayStr())} dans « ${target.titre} ».` });
    log(c.id, `Demande « ${o.titre} » regroupée dans « ${target.titre} » : ${wait.length} pièce(s) encore attendue(s) reprise(s).`, true);
  });
}

// « Créer la demande » : pièces déjà comptabilisées cochées, nouvelles pièces ajoutées à la demande en cours (mensuelle :
// unique et cumulative pour l'exercice), pièces décochées écartées des listes suivantes, puis mail (« Pour rappel » pour les
// pièces déjà demandées) ou relance s'il n'y a rien de nouveau.
function createPiecesRequest() {
  const f = ui.fec;
  const r = f.result;
  const c = clientById(f.clientId);
  const st = piecesState();
  if (!c) return;
  const stamp = nowIso();
  autoSolve(c, r, st, stamp);
  adoptKeys(c, r, st);
  const all = computePieces(r, st.mode, st.arrete);
  const items = all.filter((i) => !st.excluded.has(i.id));
  const off = all.filter((i) => st.excluded.has(i.id) && i.keys && i.keys.length);
  let m = openRequest(c, st, r);
  if (!items.length && !m) {
    // Rien de nouveau : relance de la demande ouverte de l'exercice qui attend encore des pièces
    const w = piecesPending(r, st.mode, st.arrete)[0];
    persist();
    if (w) return openMessage(c.id, w.m.id, 'relance');
    toast('Toutes les pièces demandées sont reçues.');
    return refresh();
  }
  const titre = `Demande de pièces — ${piecesLabel(st.mode, st.arrete)}`;
  const exercice = (r.meta.closing || st.arrete).slice(0, 4);
  const dpNew = { mode: st.mode, from: st.from, arrete: st.arrete, closing: r.meta.closing || '', maxOp: r.pieces.maxOp || '', v: 2 };
  const steps = items.map((i) => pieceStep(i, st, stamp));
  if (!m) {
    m = {
      id: uid(), clientId: c.id, type: 'libre', titre, exercice, echeance: addDays(todayStr(), 10),
      statut: 'a_faire', priorite: 'normale', responsable: c.responsable || c.collaborateur || data.settings.utilisateur,
      recurrence: 'aucune', notes: `Liste établie à partir du FEC ${r.meta.fileName} le ${fmtDate(todayStr())}. Cochez chaque pièce à sa réception.`,
      suiteCreee: false, termineLe: null, createdAt: stamp, updatedAt: stamp, etapes: steps, demandePieces: dpNew,
    };
    data.missions.push(m);
    log(c.id, `Demande de pièces préparée (${piecesLabel(st.mode, st.arrete)}) : ${steps.length} élément(s).`, true);
    if (st.mode === 'mois') absorbMonthly(c, m, r, stamp);
  } else {
    const dp = m.demandePieces;
    const later = st.arrete > dp.arrete;
    m.demandePieces = Object.assign({}, dp, dpNew, {
      from: dp.from && dp.from < st.from ? dp.from : st.from,
      arrete: later ? st.arrete : dp.arrete, // la demande ne recule jamais
      maxOp: [dp.maxOp || '', dpNew.maxOp].sort().pop(),
    });
    if (st.mode === 'mois' && (later || !dp.v)) Object.assign(m, { titre: `Demande de pièces — ${piecesLabel('mois', m.demandePieces.arrete)}`, exercice });
    if (st.mode === 'mois') absorbMonthly(c, m, r, stamp);
    m.etapes.push(...steps);
    if (steps.length) {
      m.echeance = [m.echeance || '', addDays(todayStr(), 10)].sort().pop();
      log(c.id, `Demande de pièces complétée (${piecesLabel(st.mode, m.demandePieces.arrete)}) : ${steps.length} élément(s) ajouté(s).`, true);
    }
    m.updatedAt = stamp;
  }
  if (off.length) setEcarte(off.flatMap((i) => i.keys), true);
  st.excluded.clear();
  if (m.etapes.every((e) => e.done)) setStatus(m, 'termine');
  persist();
  if (!isOpen(m)) {
    toast('Toutes les pièces demandées sont reçues.');
    return refresh();
  }
  openMessage(c.id, m.id, steps.length ? 'pieces' : 'relance');
}

function exportPiecesXlsx() {
  const st = piecesState();
  const c = clientById(ui.fec.clientId);
  // Pièces à demander retenues, puis pièces déjà demandées et toujours attendues
  const v = piecesView(ui.fec.result, st);
  const blob = XlsxWriter.build({ sheets: [piecesSheet(v.fresh.filter((i) => !st.excluded.has(i.id)).concat(v.pending.map(pendingItem)), st, c, v.pending.length)] });
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
function piecesSheet(items, st, c, nPending = 0) {
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
  const but = piecesBut(st);
  const objet = st.mode === 'mois' ? `Comptabilité au ${dateLongue(st.arrete)}` : `${st.mode === 'bilan' ? 'Bilan' : 'Situation'} au ${fmtDate(st.arrete)}`;
  const m = c && openRequest(c, st, ui.fec.result);
  const limit = m && m.echeance && m.echeance > todayStr() ? fmtDate(m.echeance) : '';

  // En-tête
  wide('Documents à nous transmettre', 13, 32);
  wide(c ? `${c.nom} — ${objet}` : objet, 14, 22);
  wide(`Liste établie le ${fmtDate(todayStr())}${s.cabinet ? ` par ${s.cabinet}` : ''}${limit ? ` · réponse souhaitée avant le ${limit}` : ''}`, 15, 18);
  add([], 8);
  const intro = `${afinDe(but)}, merci de nous transmettre les documents ci-dessous${nPending ? ', y compris ceux déjà demandés et pas encore reçus' : ''}. Vous pouvez les envoyer au fur et à mesure : indiquez « Oui » dans la colonne « Transmis » pour chaque document envoyé, ou « Sans objet » s'il n'existe pas, en le précisant en commentaire.`;
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
