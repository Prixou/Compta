/*
 * Suivi Dossiers — Cycles de révision et justificatifs.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- Dossier de révision : cycles A à K ----------

// Cycles dans l'ordre du dossier et rangement des comptes : le préfixe le plus long l'emporte (627 en B, le reste des 62
// en D ; 654 en E et 655 en K, le reste des 65 en D ; 58 en A, le reste de la classe 5 en B) ; un compte des classes 1 à 7
// sans préfixe connu va en K. Les clés achats, charges, clients et treso sont celles des premières versions : les statuts
// déjà saisis dans les feuilles de travail sont conservés.
const CYCLE_DEF = {
  regul: { l: 'A', nom: 'Régularité formelle', court: 'Régularité', pref: ['47', '58'] },
  treso: { l: 'B', nom: 'Trésorerie et financement', court: 'Trésorerie', pref: ['16', '17', '45', '5', '627', '66', '76', '686', '786', '796'] },
  achats: { l: 'C', nom: 'Achats et fournisseurs', court: 'Achats', pref: ['40', '60', '765'] },
  charges: { l: 'D', nom: 'Charges externes', court: 'Charges externes', pref: ['606', '61', '62', '65', '79'] },
  clients: { l: 'E', nom: 'Ventes et clients', court: 'Ventes', pref: ['41', '491', '654', '665', '70', '73', '6817', '7817'] },
  stocks: { l: 'F', nom: 'Stocks et en-cours', court: 'Stocks', pref: ['3', '603', '71'] },
  immo: { l: 'G', nom: 'Immobilisations', court: 'Immobilisations', pref: ['2', '675', '6811', '6812', '6816', '72', '775', '7811', '7816'] },
  social: { l: 'H', nom: 'Personnel', court: 'Personnel', pref: ['42', '43', '64', '691'] },
  etat: { l: 'I', nom: 'État', court: 'État', pref: ['44', '63', '6712', '69'] },
  capitaux: { l: 'J', nom: 'Capitaux propres et provisions', court: 'Capitaux propres', pref: ['10', '11', '12', '13', '14', '15', '6815', '687', '74', '777', '7815', '787'] },
  autres: { l: 'K', nom: 'Autres comptes', court: 'Autres comptes', pref: ['18', '46', '48', '49', '655', '67', '68', '75', '77', '78', '797'] },
};
const CYCLES = Object.fromEntries(Object.entries(CYCLE_DEF).map(([k, c]) => [k, `${c.l} · ${c.nom}`]));
const CYCLE_PREF = Object.entries(CYCLE_DEF).flatMap(([k, c]) => c.pref.map((p) => [p, k])).sort((a, b) => b[0].length - a[0].length);
const cycleMemo = new Map();
function cycleOf(compte) {
  if (!/^[1-7]/.test(compte)) return null;
  if (!cycleMemo.has(compte)) cycleMemo.set(compte, (CYCLE_PREF.find(([p]) => compte.startsWith(p)) || [0, 'autres'])[1]);
  return cycleMemo.get(compte);
}
const pctFr = (x, dec) => (x * 100).toLocaleString('fr-FR', { maximumFractionDigits: dec === undefined ? 1 : dec }) + ' %';
const fecTerme = () => Math.max(0, Math.min(180, Math.round(Number(ui.fec.terme) || 30)));
const fecPrev = () => { const p = cmpPrev(); return p && p.cycles ? p : null; };
const yearEnd = (r) => !!r.meta.closing && !!r.pieces.maxOp && r.pieces.maxOp >= addDays(r.meta.closing, -10);
const RUB3 = {
  611: 'Sous-traitance générale', 612: 'Redevances de crédit-bail', 613: 'Locations', 614: 'Charges locatives et de copropriété',
  615: 'Entretien et réparations', 616: "Primes d'assurance", 617: 'Études et recherches', 618: 'Documentation, colloques et divers',
  619: 'Rabais, remises et ristournes obtenus', 621: 'Personnel extérieur', 622: "Honoraires et rémunérations d'intermédiaires",
  623: 'Publicité et relations publiques', 624: 'Transports', 625: 'Déplacements, missions et réceptions', 626: 'Frais postaux et télécommunications',
  627: 'Services bancaires', 628: 'Cotisations et divers', 629: 'Rabais, remises et ristournes obtenus',
};

function checksList() {
  const out = [];
  // `full` : la liste d'exemples est complète (sinon d'autres éléments existent au-delà de ceux affichés).
  out.add = (level, label, detail, examples, extra) => out.push(Object.assign({ level, label, detail: detail || '', examples: examples || [], count: 0, full: (examples || []).length < 10 }, extra || {}));
  return out;
}

// Points de révision généraux rangés dans leur cycle (A par défaut) : statut et mémoire communs avec la synthèse (feuille
// « gen »), non recomptés dans les totaux.
const GEN_CYCLE = [[/^(Caisse|Banque)|transit|^Écarts de caisse/, 'treso'], [/^Fournisseurs débiteurs|remise/i, 'achats'],
  [/^Clients créditeurs|tiers payant|^Trop-perçus|^Honoraires de dispensation/, 'clients'], [/TVA|^Ventes sans taux/, 'etat']];
const genCycle = (label) => (GEN_CYCLE.find(([re]) => re.test(label)) || [0, 'regul'])[1];
function genIn(r, out, key) {
  genPoints(r).filter((a) => genCycle(a.label) === key).forEach((a) => out.push(Object.assign({}, a, { via: 'gen' })));
}
// Contrôles de cohérence de la revue N / N-1 rangés dans leur cycle (honoraires et cadeaux : déjà contrôlés en D).
const COH_CYCLE = [[/^Salaires restant dus/, ''], [/TVA|^Impôt sur les sociétés|^Pénalités|^Taxes sur les véhicules/, 'etat'], [/^Salaires|charges sociales/i, 'social'],
  [/amortissements/, 'immo'], [/^Emprunts|^Taux d'intérêt|^Intérêts/, 'treso'], [/^Capitaux propres/, 'capitaux'],
  [/^Mois sans chiffre|^Chiffre d'affaires|^Délai de paiement clients/, 'clients'], [/^Taux de marge/, 'stocks'], [/^Dons/, 'charges'],
  [/^Exercices non consécutifs|^SIREN/, 'regul']];
function cohIn(coh, out, key) {
  coh.filter((x) => (COH_CYCLE.find(([re]) => re.test(x.label)) || [0, ''])[1] === key).forEach((x) => out.push(Object.assign({}, x)));
}

// Régularisations de l'exercice précédent (à-nouveaux) qui doivent être extournées en début d'exercice.
function regulCheck(r, out, prefixes, label) {
  const rows = r.balance.filter((b) => prefixes.some((p) => b.compte.startsWith(p)) && Math.abs(b.an) >= 1);
  if (!rows.length || !r.meta.hasAN) return;
  const open = rows.filter((b) => (b.an < 0 ? b.dm : b.cm) < Math.abs(b.an) - 1);
  if (open.length) out.add('warn', label, "Les régularisations de l'exercice précédent (à-nouveaux) doivent être extournées à l'ouverture : risque de charges ou de produits comptés deux fois.", open.map((b) => `${b.compte} ${b.lib} : à-nouveau ${eur(Math.abs(b.an))} €, extourné ${eur(b.an < 0 ? b.dm : b.cm)} €`));
  else out.add('ok', label.replace(/ non (extourné(?:e)?s)$/, ' $1'), `${rows.length} compte(s) repris en à-nouveau et soldé(s).`);
}

function cutCheck(out, cut, what) {
  if (cut.after.n) out.add('warn', `${what} : pièces datées après la clôture`, `${cut.after.n} ligne(s), ${eur(cut.after.total, 0)} € : pièces de l'exercice suivant comptabilisées dans l'exercice (séparation des exercices).`, cut.after.ex, { full: cut.after.ex.length >= cut.after.n });
  if (cut.before.n) out.add('info', `${what} : pièces de l'exercice précédent`, `${cut.before.n} ligne(s), ${eur(cut.before.total, 0)} € datées avant l'ouverture : auraient dû être rattachées à l'exercice précédent (charges à payer ou produits à recevoir) ?`, cut.before.ex, { full: cut.before.ex.length >= cut.before.n });
  if (!cut.after.n && !cut.before.n) out.add('ok', `${what} : séparation des exercices`, 'Aucune pièce datée hors de l\'exercice.');
}

// Factures non réglées à la date de référence, par tranche de retard après l'échéance (tableau de l'art. D441-6 du code de commerce).
function overdue(r, racine, ref, terme) {
  const b = { b1: [0, 0], b31: [0, 0], b61: [0, 0], b91: [0, 0] };
  const tiers = [];
  const startAge = r.meta.start ? Math.max(0, daysUntilFrom(r.meta.start, ref)) : 999;
  (r.aging || []).filter((t) => t.racine === racine).forEach((t) => {
    const x = { num: t.num, lib: t.lib, late: 0, b91: 0, oldest: '' };
    t.open.forEach((o) => {
      if (o.amt <= 0 || (!o.an && o.date > ref)) return;
      const days = o.an ? startAge : daysUntilFrom(addDays(o.date, terme), ref);
      if (days < 1) return;
      const k = days <= 30 ? 'b1' : days <= 60 ? 'b31' : days <= 90 ? 'b61' : 'b91';
      b[k][0]++;
      b[k][1] += o.amt;
      x.late += o.amt;
      if (k === 'b91') x.b91 += o.amt;
      if (!x.oldest || (o.an ? '0' : o.date) < x.oldest) x.oldest = o.an ? '0' : o.date;
    });
    if (x.late > 0) tiers.push(x);
  });
  tiers.sort((p, q) => q.b91 - p.b91 || q.late - p.late);
  return Object.assign(b, { tiers, total: [b.b1[0] + b.b31[0] + b.b61[0] + b.b91[0], b.b1[1] + b.b31[1] + b.b61[1] + b.b91[1]] });
}
const oldestTxt = (t) => (t.oldest === '0' ? 'reprise en à-nouveau' : `la plus ancienne du ${fmtDate(t.oldest)}`);

function chkAchats(r, ref, prev, terme) {
  const a = r.cycles.achats;
  const out = checksList();
  const { mv, solde } = sums(r);
  const pharma = ui.fecProfile === 'pharmacie';
  genIn(r, out, 'achats');
  mispostCheck(r, out, '401');
  if (a.dupStrong.n) out.add('warn', 'Factures fournisseurs en double', `${a.dupStrong.n} facture(s) saisie(s) deux fois (même fournisseur, même montant, même n° de pièce, à moins de 15 jours d'écart) : ${eur(a.dupStrong.total)} € de charges et de TVA déductible en trop ?`, a.dupStrong.ex, { full: a.dupStrong.ex.length >= a.dupStrong.n });
  else if (a.invoices) out.add('ok', 'Aucune facture fournisseur en double', `${a.invoices.toLocaleString('fr-FR')} factures contrôlées (fournisseur, montant et n° de pièce)${a.recurringRefs ? ` ; ${a.recurringRefs} référence(s) d'échéancier mensuel (loyer, crédit-bail, abonnement) écartée(s)` : ''}.`);
  if (a.dupPossible.n) out.add('info', "Factures de même montant à quelques jours d'intervalle", `${a.dupPossible.n} cas chez un même fournisseur (3 jours au plus) : livraisons distinctes ou doublon ?`, a.dupPossible.ex, { full: a.dupPossible.ex.length >= a.dupPossible.n });
  const od = overdue(r, '401', ref, terme);
  if (od.b91[1] > 0) out.add('warn', 'Dettes fournisseurs échues depuis plus de 90 jours', `${eur(od.b91[1], 0)} € (${od.b91[0]} facture(s)) : litige, avoir attendu, ou facture déjà réglée par un autre moyen ?`, od.tiers.filter((t) => t.b91 > 0).slice(0, 10).map((t) => `${t.lib} : ${eur(t.b91)} € (${oldestTxt(t)})`));
  if (a.delay.lateN) out.add(a.delay.lateAmt > a.delay.paidAmt * 0.2 ? 'warn' : 'info', 'Factures fournisseurs réglées à plus de 60 jours', `${a.delay.lateN} facture(s), ${eur(a.delay.lateAmt, 0)} € : au-delà du délai légal maximal (art. L441-10 du code de commerce), amende administrative possible.`, a.suppliers.filter((s) => s.lateN).slice(0, 10).map((s) => `${s.lib} : ${s.lateN} facture(s), délai moyen ${s.delay} j`));
  else if (a.delay.paidN) out.add('ok', 'Délais de paiement fournisseurs', `Délai moyen constaté : ${a.delay.avg} jours, aucune facture réglée au-delà de 60 jours.`);
  if (a.overVat.n) out.add('warn', 'TVA déductible supérieure à 20 %', `${a.overVat.n} facture(s), ${eur(a.overVat.total, 0)} € de TVA : erreur de saisie ou TVA déduite en double ?`, a.overVat.ex, { full: a.overVat.ex.length >= a.overVat.n });
  if (a.autoliq.n) out.add('warn', 'Autoliquidation incomplète', `${a.autoliq.n} facture(s) : TVA autoliquidée (4452) non déduite en totalité (4456).`, a.autoliq.ex, { full: a.autoliq.ex.length >= a.autoliq.n });
  const nv = a.noVat.reduce((s, g) => s + g.total, 0);
  if (nv > 0) out.add('info', 'Factures sans TVA déductible', `${a.noVat.reduce((s, g) => s + g.n, 0)} facture(s) de plus de 150 € HT, ${eur(nv, 0)} € : fournisseur non assujetti, opération exonérée, ou TVA oubliée ?`, a.noVat.slice(0, 10).map((g) => `${g.compte} ${g.lib} : ${g.n} facture(s), ${eur(g.total, 0)} € — ex. ${g.ex[0]}`));
  else if (a.invoices && !a.overVat.n) out.add('ok', 'TVA déductible des factures', 'Chaque facture de plus de 150 € HT porte une TVA déductible cohérente (20 % au plus).');
  cutCheck(out, a.cut, 'Achats');
  regulCheck(r, out, ['408'], "Factures non parvenues de l'exercice précédent non extournées");
  const fnp = -solde(['408']);
  if (fnp > 0.01) out.add('ok', `Factures non parvenues comptabilisées : ${eur(fnp, 0)} €`, 'Compte 408 à la date de fin des écritures.');
  else if (yearEnd(r) && a.invoices >= 12) out.add('info', 'Aucune facture non parvenue à la clôture', "Compte 408 non utilisé : vérifier les factures reçues après la clôture qui concernent l'exercice.");
  if (!pharma && mv(['607']) > 10000 && Math.abs(mv(['609'])) < 0.01 && Math.abs(solde(['4098'])) < 0.01) out.add('info', 'Aucune remise ni ristourne fournisseur', "Remises de fin d'année à recevoir (4098) à demander aux principaux fournisseurs ?");
  const top = a.suppliers[0];
  if (top && top.share > 0.5 && a.nbSuppliers >= 3) out.add('info', `Dépendance fournisseur : ${top.lib}`, `${pctFr(top.share, 0)} des achats facturés de l'exercice.`);
  if (prev) {
    const known = new Set(prev.cycles.achats.suppliers.map((s) => norm(s.lib)));
    const news = a.suppliers.filter((s) => s.ttc >= Math.max(3000, a.ttc * 0.02) && !known.has(norm(s.lib)));
    if (news.length) out.add('info', 'Nouveaux fournisseurs significatifs', `${news.length} fournisseur(s) absent(s) de l'exercice précédent : existence et coordonnées bancaires à vérifier (fraude au faux fournisseur).`, news.slice(0, 10).map((s) => `${s.lib} : ${eur(s.ttc, 0)} € TTC`));
  }
  return out;
}

// Factures et règlements imputés sur un autre compte de tiers que le leur.
const MISPOST = { 401: 'Factures ou règlements imputés sur un autre fournisseur', 411: 'Factures ou règlements imputés sur un autre client' };
const mispostEx = (x) => `${fmtDate(x.date)}${x.ref ? ` · ${x.ref}` : ''} · « ${x.lib} » · ${eur(x.amt)} € : ${x.kind} passé${x.kind === 'facture' ? 'e' : ''} sur ${x.from.lib} (${x.from.num}) — ${x.reason === 'libelle' ? `le libellé désigne ${x.to.lib} (${x.to.num})` : `montant identique à la facture de ${x.to.lib} (${x.to.num}) du ${fmtDate(x.invDate)}, sans facture de ce montant sur ${x.from.lib}`}`;
function mispostCheck(r, out, racine) {
  const list = (r.misposted && r.misposted[racine]) || [];
  const who = racine === '401' ? 'fournisseur' : ui.fecProfile === 'pharmacie' ? 'organisme ou patient' : 'client';
  if (list.length) out.add('warn', MISPOST[racine].replace(/client$/, who), `${list.length} écriture(s), ${eur(list.reduce((t, x) => t + x.amt, 0))} € : imputation à corriger (le solde des deux comptes est faux, et les relances, lettrages et demandes de pièces en dépendent). L'écriture de reclassement est proposée dans l'onglet Écritures.`, list.map(mispostEx), { full: true, beta: true });
  else if (r.misposted) out.add('ok', `Imputation des ${racine === '401' ? 'factures et règlements fournisseurs' : 'factures et encaissements clients'}`, `Aucune écriture dont le libellé ou le montant désigne un autre ${who}.`, [], { beta: true });
}

const ccaEx = (x) => `${fmtDate(x.date)} · ${x.compte} ${x.lib} · ${x.label} · ${eur(x.amt, 0)} € → ${eur(x.cca, 0)} € (période présumée de ${x.cover} mois)`;

function chkCharges(r, ref, prev, coh) {
  const ch = r.cycles.charges;
  const out = checksList();
  const { mv, solde } = sums(r);
  cohIn(coh, out, 'charges');
  const last = [ref, r.pieces.maxOp || ref].sort()[0];
  const period = monthsBetween(ymOf(r.meta.start && r.meta.start <= last ? r.meta.start : r.pieces.minOp || last), ymOf(last));
  const has = (a, ym) => Math.abs(a.months[ym] || 0) >= 0.01;
  const miss = [];
  if (period.length >= 6) ch.accounts.forEach((a) => {
    const present = period.filter((ym) => has(a, ym));
    if (present.length < 6 || present.length / period.length < 0.6 || present.length === period.length) return;
    const med = median(present.map((ym) => a.months[ym]));
    if (med >= 30) miss.push(`${a.compte} ${a.lib} : ${fmtMonths(period.filter((ym) => !has(a, ym)))} (habituellement ${eur(med, 0)} € par mois)`);
  });
  if (miss.length) out.add('warn', 'Charges récurrentes incomplètes', `${miss.length} compte(s) habituellement mouvementés chaque mois présentent des mois sans charge : factures non saisies ?`, miss);
  else if (period.length >= 6) out.add('ok', 'Charges récurrentes complètes', 'Les comptes mouvementés chaque mois le sont sur toute la période.');
  if (r.meta.closing) {
    const est = ch.cca.reduce((s, x) => s + x.cca, 0);
    const cca = solde(['486']);
    if (ch.cca.length) out.add(cca < est * 0.5 ? 'warn' : 'info', `Charges constatées d'avance probables : ${eur(est, 0)} €`, `${ch.cca.length} paiement(s) annuels ou trimestriels couvrant une période postérieure au ${fmtDate(r.meta.closing)} (estimation à confirmer sur les factures) ; comptabilisé en 486 : ${eur(cca, 0)} €.`, ch.cca.slice(0, 12).map(ccaEx), { full: ch.cca.length <= 12 });
  }
  regulCheck(r, out, ['486'], "Charges constatées d'avance de l'exercice précédent non extournées");
  regulCheck(r, out, ['4286', '4386', '4486', '4686'], "Charges à payer de l'exercice précédent non extournées");
  if (ch.das2.length) out.add('info', `DAS2 : ${ch.das2.length} bénéficiaire(s) de plus de 1 200 €`, "Honoraires, commissions et droits d'auteur à déclarer (DAS2) avec la liasse ou au plus tard début mai ; montants TTC estimés.", ch.das2.slice(0, 15).map((b) => `${b.benef} : ${eur(b.total, 0)} € (${b.comptes.join(', ')})`));
  if (ch.perso.n) out.add('warn', 'Dépenses à caractère personnel possibles', `${ch.perso.n} dépense(s), ${eur(ch.perso.total, 0)} € (grandes surfaces, loisirs, abonnements…) : intérêt de l'entreprise à justifier, sinon réintégration et avantage en nature.`, ch.perso.ex, { full: ch.perso.ex.length >= ch.perso.n });
  if (ch.amendes.n) out.add('warn', 'Amendes et pénalités en charges déductibles', `${ch.amendes.n} dépense(s), ${eur(ch.amendes.total, 0)} € : non déductibles (art. 39-2 du CGI), à isoler en 6712 et à réintégrer ; désignation du conducteur pour les contraventions.`, ch.amendes.ex, { full: ch.amendes.ex.length >= ch.amendes.n });
  if (ch.weekend.n) out.add('info', 'Frais de réception ou de déplacement le week-end', `${ch.weekend.n} dépense(s), ${eur(ch.weekend.total, 0)} € : caractère professionnel à justifier.`, ch.weekend.ex, { full: ch.weekend.ex.length >= ch.weekend.n });
  if (ch.giftVat.n) out.add('warn', 'TVA déduite sur des cadeaux de plus de 73 €', `${ch.giftVat.n} écriture(s), ${eur(ch.giftVat.total, 0)} € de TVA : non récupérable au-delà de 73 € TTC par bénéficiaire et par an.`, ch.giftVat.ex, { full: ch.giftVat.ex.length >= ch.giftVat.n });
  else if (ch.gifts.n) out.add('info', `Cadeaux de plus de 73 € : ${eur(ch.gifts.total, 0)} €`, 'TVA non récupérable au-delà de 73 € TTC par bénéficiaire et par an ; relevé des frais généraux (2067) si le total dépasse 3 000 €.', ch.gifts.ex, { full: ch.gifts.ex.length >= ch.gifts.n });
  if (ch.notesFrais.n) out.add('info', "Dépenses avancées par l'associé", `${ch.notesFrais.n} écriture(s), ${eur(ch.notesFrais.total, 0)} € portées au crédit du compte courant : notes de frais et justificatifs à obtenir.`, ch.notesFrais.ex, { full: ch.notesFrais.ex.length >= ch.notesFrais.n });
  cutCheck(out, ch.cut, 'Charges externes');
  // Débits des comptes 61 et 62 (les extournes d'à-nouveaux, au crédit, ne réduisent pas la base)
  const ext = mv(['61', '62']);
  const extD = r.balance.filter((b) => /^6[12]/.test(b.compte)).reduce((t, b) => t + b.dm, 0) || ext;
  const direct = ch.accounts.reduce((s, a) => s + Math.max(0, a.direct), 0);
  if (direct > 2000 && direct > extD * 0.3) out.add('info', 'Charges externes payées sans facture fournisseur', `${eur(direct, 0)} € (${pctFr(direct / extD, 0)}) comptabilisés directement depuis la banque : les factures correspondantes doivent être au dossier.`);
  if (prev && r.kpi.ca > 0 && prev.kpi.ca > 0) {
    const n = ext / r.kpi.ca, p = sums(prev).mv(['61', '62']) / prev.kpi.ca;
    if (Math.abs(n - p) >= 0.05) out.add('info', `Charges externes : ${pctFr(p)} → ${pctFr(n)} du chiffre d'affaires`, 'Variation significative du poids des charges externes : voir les comptes en hausse ci-dessous.');
  }
  return out;
}

// Numéros de facture de vente manquants, un par ligne, avec les factures qui encadrent chaque trou.
function missingInvoices(g, keep, tag = '', max = 1000) {
  const ref = serieRef(g);
  const list = [];
  let n = 0;
  (g.gaps || []).filter(keep || (() => true)).forEach(([a, b, da, db]) => {
    for (let k = a + 1; k < b; k++) {
      n++;
      if (list.length < max) list.push(`${ref(k)} : entre ${ref(a)} du ${fmtDate(da)} et ${ref(b)} du ${fmtDate(db)}${tag}`);
    }
  });
  return { list, n };
}

function chkClients(r, ref, prev, terme, coh) {
  const cl = r.cycles.clients;
  const out = checksList();
  const { solde } = sums(r);
  genIn(r, out, 'clients');
  cohIn(coh, out, 'clients');
  // Officine : tiers payant, CA et TVA par taux dans leurs onglets
  if (ui.fecProfile === 'pharmacie') return out;
  mispostCheck(r, out, '411');
  const nb = cl.numbering.filter((g) => !g.sparse && serieOn(g));
  if (!cl.numbering.length && cl.invoices >= 10) out.add('info', 'Numérotation des factures de vente non contrôlable', 'Les n° de pièce des factures de vente ne se terminent pas par un numéro.');
  else if (cl.numbering.length && !nb.length) out.add('info', 'Numérotation des factures non exploitable', `Les n° de pièce (${cl.numbering[0].first}…) ${cl.numbering.some((g) => g.ecriture) ? 'sont les n° d\'écriture' : 'ne forment pas une suite'} : le n° de facture n'est pas repris dans le FEC.`);
  nb.forEach((g) => {
    const name = `${g.first} à ${g.last}${nb.length > 1 || !g.prefix ? `, ${g.label}` : ''}`;
    const mi = missingInvoices(g);
    if (g.missing) out.add('warn', `Factures de vente manquantes dans la numérotation (${name})`, `${g.missing} numéro(s) absent(s) : factures annulées (à justifier), non saisies ou émises par un autre outil ? La numérotation doit être continue (art. 242 nonies A de l'annexe II du CGI).`, mi.list, { full: mi.list.length >= g.missing });
    else out.add('ok', 'Numérotation continue des factures de vente', `${g.count} factures, de ${name}.`);
    if (g.dups.length) out.add('warn', 'Numéros de facture utilisés plusieurs fois', `${g.dups.length} numéro(s) en double : facture saisie deux fois ou n° réattribué ?`, g.dups);
    if (g.inversions) out.add('info', 'Numérotation non chronologique', `${g.inversions} facture(s) portant un numéro supérieur à une facture datée plus tard.`, g.invEx);
  });
  const od = overdue(r, '411', ref, terme);
  const dep = -solde(['491']);
  if (od.b91[1] > 0) out.add(dep >= od.b91[1] * 0.5 ? 'info' : 'warn', 'Créances clients échues depuis plus de 90 jours', `${eur(od.b91[1], 0)} € (${od.b91[0]} facture(s)) ; dépréciation comptabilisée (491) : ${eur(dep, 0)} €. Recouvrabilité à apprécier client par client.`, od.tiers.filter((t) => t.b91 > 0).slice(0, 12).map((t) => `${t.lib} : ${eur(t.b91)} € (${oldestTxt(t)})`));
  else if (cl.invoices) out.add('ok', 'Pas de créance échue depuis plus de 90 jours', `Échéance calculée à ${terme} jours de la date de facture.`);
  const douteux = solde(['416']);
  if (douteux > 0.01 && dep < 0.01) out.add('warn', 'Clients douteux sans dépréciation', `${eur(douteux, 0)} € en 416 sans dépréciation (491).`);
  if (cl.delay.lateN) out.add('info', 'Factures clients réglées à plus de 60 jours', `${cl.delay.lateN} facture(s), ${eur(cl.delay.lateAmt, 0)} € : relances et pénalités de retard (art. L441-10 du code de commerce).`, cl.customers.filter((c) => c.lateN).slice(0, 10).map((c) => `${c.lib} : ${c.lateN} facture(s), délai moyen ${c.delay} j`));
  else if (cl.delay.paidN) out.add('ok', 'Délais de paiement clients', `Délai moyen d'encaissement constaté : ${cl.delay.avg} jours.`);
  if (cl.overVat.n) out.add('warn', 'TVA collectée supérieure à 20 %', `${cl.overVat.n} facture(s) : erreur de saisie ?`, cl.overVat.ex, { full: cl.overVat.ex.length >= cl.overVat.n });
  if (cl.noVat.n) out.add('info', 'Factures de vente sans TVA', `${cl.noVat.n} facture(s), ${eur(cl.noVat.total, 0)} € HT : export, livraison intracommunautaire, autoliquidation ou exonération ? La mention correspondante doit figurer sur la facture.`, cl.noVat.ex, { full: cl.noVat.ex.length >= cl.noVat.n });
  cutCheck(out, cl.cut, 'Ventes');
  if (cl.lastWeek >= 5000 && cl.avgWeek > 0 && cl.lastWeek > 2.5 * cl.avgWeek) out.add('info', "Facturation inhabituelle en fin d'exercice", `${eur(cl.lastWeek, 0)} € TTC facturés les 7 derniers jours, contre ${eur(cl.avgWeek, 0)} € par semaine en moyenne : prestations achevées et livraisons effectuées à la clôture ?`);
  regulCheck(r, out, ['418'], "Factures à établir de l'exercice précédent non extournées");
  regulCheck(r, out, ['487'], "Produits constatés d'avance de l'exercice précédent non extournés");
  const top = cl.customers[0];
  if (top && top.share > 0.3 && cl.nbCustomers >= 3) out.add('info', `Dépendance client : ${top.lib}`, `${pctFr(top.share, 0)} du chiffre d'affaires facturé.`);
  if (cl.avoirs > 1000 && cl.avoirs > cl.ttc * 0.05) out.add('info', `Avoirs émis : ${eur(cl.avoirs, 0)} € TTC`, `${pctFr(cl.avoirs / cl.ttc)} de la facturation : litiges, remises de fin d'année, erreurs de facturation ?`);
  const factHT = cl.customers.reduce((s, c) => s + c.ht, 0);
  const sansClient = r.kpi.ca - factHT;
  if (r.kpi.ca > 0 && sansClient > 2000 && sansClient > r.kpi.ca * 0.1) out.add('info', "Chiffre d'affaires comptabilisé sans compte client", `${eur(sansClient, 0)} € (${pctFr(sansClient / r.kpi.ca, 0)}) : ventes au comptant ou encaissées directement en banque — Z de caisse, relevés et factures à rapprocher.`);
  if (prev) {
    const p = prev.cycles.clients;
    const now = new Set(cl.customers.filter((c) => c.ttc > 0).map((c) => norm(c.lib)));
    const lost = p.customers.filter((c) => c.ttc >= p.ttc * 0.05 && !now.has(norm(c.lib)));
    if (lost.length) out.add('info', 'Clients importants non refacturés', `${lost.length} client(s) significatif(s) de l'exercice précédent sans facture cette année.`, lost.slice(0, 10).map((c) => `${c.lib} : ${eur(c.ttc, 0)} € TTC en N-1`));
  }
  return out;
}

function chkTreso(r, ref, coh) {
  const t = r.cycles.treso;
  const out = checksList();
  const { mv, solde } = sums(r);
  const pharma = ui.fecProfile === 'pharmacie';
  genIn(r, out, 'treso');
  cohIn(coh, out, 'treso');
  if (pharma) mispostCheck(r, out, '411');
  const emp = -solde(['164', '165', '166', '167', '168'], ['1688']);
  if (yearEnd(r) && emp > 1000 && Math.abs(solde(['1688'])) < 0.01) out.add('info', "Pas d'intérêts courus sur emprunts (1688)", `Emprunts de ${eur(emp, 0)} € à la clôture : intérêts courus non échus entre la dernière échéance et la clôture, d'après les tableaux d'amortissement.`);
  const newEmp = r.balance.filter((b) => /^16[4-8]/.test(b.compte) && !b.compte.startsWith('1688')).reduce((s, b) => s + b.cm, 0);
  if (newEmp >= 1000) out.add('info', `Emprunts souscrits dans l'exercice : ${eur(newEmp, 0)} €`, "Contrat de prêt, tableau d'amortissement et garanties (caution, nantissement) ; frais de dossier et assurance à ventiler.");
  // Valeurs mobilières : justifiées par le document de valorisation à la clôture (valeur saisie dans les comptes du cycle)
  const vmp = balOf(r, ['50'], ['509']).filter((b) => Math.abs(b.s) >= 1);
  if (vmp.length) {
    const tot = vmp.reduce((s, b) => s + b.s, 0), dep = -solde(['590']), so = wpSoldeStore();
    if (vmp.every((b) => so[b.compte] !== undefined)) {
      const val = vmp.reduce((s, b) => s + so[b.compte], 0), ml = tot - dep - val;
      if (ml >= 1) out.add('warn', 'Moins-value latente sur les valeurs mobilières', `Valeur à la clôture ${eur(val)} € pour ${eur(tot)} € inscrits${dep >= 0.01 ? `, dépréciation comptabilisée ${eur(dep)} €` : ''} : dépréciation complémentaire de ${eur(ml)} € à comptabiliser (590).`);
      else out.add('ok', 'Valeurs mobilières justifiées par leur valorisation', `Valeur à la clôture ${eur(val)} € pour ${eur(tot)} € inscrits${dep >= 0.01 ? `, dépréciation ${eur(dep)} €` : ''}.`);
    } else out.add('info', `Valeurs mobilières de placement : ${eur(tot, 0)} €`, "À justifier par le document de valorisation à la date de clôture : saisissez la valeur de chaque compte dans « Comptes du cycle » (moins-value latente à déprécier en 590, plus-value latente non comptabilisée).");
  }
  // Compte courant d'associé et caisse : contrôlés sur leur solde à la date de révision (fin de la période du FEC)
  const ccaEnd = balOf(r, ['455']).filter((b) => b.s >= 0.01);
  if (ccaEnd.length) out.add('error', "Compte courant d'associé débiteur", "Un compte courant d'associé ne doit pas être débiteur à la date de révision : avance interdite aux associés personnes physiques des SARL et aux dirigeants des SA et SAS (art. L223-21, L225-43 et L227-12 du code de commerce), risque d'abus de biens sociaux et de réintégration fiscale.", ccaEnd.map((b) => `${b.compte} ${b.lib} : solde débiteur de ${eur(b.s)} €`));
  else if (balOf(r, ['455']).length) out.add('ok', "Compte courant d'associé non débiteur", 'Solde créditeur ou nul à la date de révision.');
  const banks = t.accounts.filter((a) => /^51[2-9]/.test(a.compte));
  banks.filter((a) => a.negDays > 0).forEach((a) => out.add(a.negDays > 30 ? 'warn' : 'info', `Découvert : ${a.lib || a.compte}`, `${a.negDays} jour(s) à découvert en comptabilité, plus bas ${eur(a.min)} € le ${fmtDate(a.minDate)} : autorisation de découvert, agios et rapprochement à vérifier.`));
  if (banks.length && !banks.some((a) => a.negDays)) out.add('ok', 'Aucun découvert bancaire en comptabilité', `${banks.length} compte(s) bancaire(s) toujours créditeurs.`);
  if (t.cash.n) out.add('warn', 'Opérations en espèces de 1 000 € ou plus', `${t.cash.n} opération(s), ${eur(t.cash.total, 0)} € : paiement en espèces limité à 1 000 € entre professionnels et avec les particuliers résidents (art. L112-6 et D112-3 du code monétaire et financier), amende jusqu'à 5 % des sommes.`, t.cash.ex, { full: t.cash.ex.length >= t.cash.n });
  else if (t.accounts.some((a) => a.compte.startsWith('53'))) out.add('ok', 'Pas de paiement en espèces de 1 000 € ou plus', '');
  const caisses = t.accounts.filter((a) => a.compte.startsWith('53'));
  const neg = caisses.filter((a) => a.solde <= -0.01);
  if (neg.length) out.add('error', 'Caisse créditrice', 'Une caisse ne peut pas être créditrice à la date de révision : recettes non comptabilisées ou dépenses en trop, risque de rejet de comptabilité.', neg.map((a) => `${a.compte} ${a.lib} : ${eur(a.solde)} €`));
  const high = caisses.filter((a) => a.solde > 10000);
  if (high.length) out.add('warn', 'Solde de caisse élevé', "Plus de 10 000 € d'espèces en caisse, montant inhabituel : à justifier par le procès-verbal de caisse (remises en banque, recettes ou dépenses non comptabilisées ?).", high.map((a) => `${a.compte} ${a.lib} : ${eur(a.solde)} €`));
  caisses.filter((a) => a.last && Math.abs(a.solde) >= 1 && daysUntilFrom(a.last, ref) > 60).forEach((a) => out.add('info', `Caisse sans mouvement depuis le ${fmtDate(a.last)}`, `${a.lib} : solde de ${eur(a.solde)} € inchangé : espèces réellement détenues ?`));
  if (!pharma) {
    const ve = t.accounts.filter((a) => a.compte.startsWith('511') && Math.abs(a.solde) >= 0.01);
    if (ve.length) out.add('info', "Valeurs à l'encaissement non soldées", "Chèques ou remises de cartes en attente : vérifier leur crédit en banque après la date d'arrêté.", ve.map((a) => `${a.compte} ${a.lib} : ${eur(a.solde)} €`));
  }
  banks.filter((a) => Math.abs(a.solde) >= 1 && a.last && daysUntilFrom(a.last, ref) > 60).forEach((a) => out.add('info', `Compte bancaire sans mouvement depuis le ${fmtDate(a.last)}`, `${a.lib || a.compte} : solde de ${eur(a.solde)} € — relevé à la date d'arrêté, ou compte clôturé à solder.`));
  const agios = mv(['6615']);
  if (agios > 50 && banks.length && !banks.some((a) => a.negDays)) out.add('info', 'Agios sans découvert en comptabilité', `${eur(agios, 0)} € d'intérêts bancaires alors que les comptes ne sont jamais débiteurs en comptabilité : découverts en dates de valeur, ou écritures saisies en retard.`);
  const moves = (re) => t.big.filter((m) => re.test(m.cp)).slice(0, 10).map((m) => `${fmtDate(m.date)} · ${m.amt > 0 ? '+' : ''}${eur(m.amt)} € · ${m.cp} ${m.cplib} · ${m.lib}`);
  const as = t.flux.find((f) => f.cat === 'associes');
  if (as && as.enc + as.dec >= 1000) out.add('info', `Flux avec les associés : apports ${eur(as.enc, 0)} €, retraits ${eur(as.dec, 0)} €`, 'Justificatifs et convention de compte courant ; des retraits répétés constituent des avances au dirigeant à surveiller.', moves(/^45/));
  const dv = t.flux.find((f) => f.cat === 'divers');
  if (dv && dv.enc + dv.dec >= 500) out.add('info', "Mouvements bancaires sur des comptes d'attente ou divers", `Encaissements ${eur(dv.enc, 0)} €, décaissements ${eur(dv.dec, 0)} € : opérations à identifier avant la clôture.`, moves(/^4[67]/));
  if (r.kpi.tresorerie < 0) out.add('warn', 'Trésorerie nette négative', `${eur(r.kpi.tresorerie, 0)} € : continuité d'exploitation et financement à examiner.`);
  return out;
}

// Contrôles des cycles A à K, dans l'ordre du dossier (mis en cache par résultat et paramètres).
function cycleChecks(r) {
  if (!r || !r.cycles) return null;
  const ref = pharmaRef(r);
  const prev = fecPrev();
  const terme = fecTerme();
  const key = [ref, ui.fecProfile, prev ? prev.meta.fileName : '', ui.fec.prev ? ui.fec.prev.meta.fileName : '', terme, ui.fec.seuil || '', r.alerts.length, ui.fec.clientId || '', Object.keys(wpMemo()).length, JSON.stringify(ventesSeriesStore()), JSON.stringify(wpSoldeStore()), JSON.stringify(silaeStore())].join('|');
  if (r._cc && r._cc.key === key) return r._cc.val;
  const coh = coherenceChecks(r, prev, clientById(ui.fec.clientId));
  const val = {
    regul: applyMemo(chkRegul(r, coh), 'regul'),
    treso: applyMemo(chkTreso(r, ref, coh), 'treso'),
    achats: applyMemo(chkAchats(r, ref, prev, terme), 'achats'),
    charges: applyMemo(chkCharges(r, ref, prev, coh), 'charges'),
    clients: applyMemo(chkClients(r, ref, prev, terme, coh), 'clients'),
    stocks: applyMemo(chkStocks(r, prev, coh), 'stocks'),
    immo: applyMemo(chkImmo(r, coh), 'immo'),
    social: applyMemo(chkSocial(r, ref, coh), 'social'),
    etat: applyMemo(chkEtat(r, prev, coh), 'etat'),
    capitaux: applyMemo(chkCapitaux(r, ref, coh), 'capitaux'),
    autres: applyMemo(chkAutres(r, coh), 'autres'),
  };
  Object.defineProperty(r, '_cc', { value: { key, val }, configurable: true, writable: true, enumerable: false });
  return val;
}

// Points propres aux cycles (hors points généraux repris), avec le nom du cycle.
function cyclePoints(r) {
  const cc = cycleChecks(r);
  if (!cc) return [];
  return Object.keys(cc).flatMap((k) => cc[k].filter((x) => !x.linked && !x.via).map((x) => Object.assign({}, x, { cycle: k })));
}

const kpiTile = (label, value, cls, n1) => `<div class="kpi ${cls || ''}"><strong>${value}</strong><span>${label}</span>${n1 !== undefined && n1 !== null ? `<em>N-1 : ${n1}</em>` : ''}</div>`;
const daysTxt = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${Math.round(v)} j`);

// Contrôles du cycle, puis ses comptes (feuille maîtresse) et ses pièces.
function cycleHead(key, intro) {
  const r = ui.fec.result;
  const list = cycleChecks(r)[key];
  return `<section class="card"><h2>Contrôles — ${esc(CYCLES[key])} <span class="count">${wpProgress(key, list).left}</span></h2>
    <p class="muted small">${intro}</p>${wpCycleBar(key, list)}${wpCheckList(list, key)}</section>
    ${comptesCard(r, key)}${docsCard(r, key)}`;
}

function terminput() {
  return `<label class="inline-label">Échéance des factures <input type="number" min="0" max="180" step="1" data-fec="terme" value="${fecTerme()}" aria-label="Délai de paiement en jours"> jours après la date de facture</label>`;
}

// Tableau des factures non réglées dont le terme est échu (art. D441-6 du code de commerce).
function overdueTable(od, base, baseLabel, title) {
  const cols = ['b1', 'b31', 'b61', 'b91'];
  const pc = (v) => (base > 0 ? pctFr(v / base) : '—');
  return `<h3>${esc(title)}</h3>
    <div class="grid-wrap"><table class="dtable num d441"><thead><tr><th>Retard après l'échéance</th><th>1 à 30 j</th><th>31 à 60 j</th><th>61 à 90 j</th><th>91 j et plus</th><th>Total</th></tr></thead>
    <tbody>
      <tr><td>Nombre de factures</td>${cols.map((k) => `<td>${od[k][0]}</td>`).join('')}<td>${od.total[0]}</td></tr>
      <tr><td>Montant TTC</td>${cols.map((k) => `<td>${eur(od[k][1], 0)}</td>`).join('')}<td>${eur(od.total[1], 0)}</td></tr>
      <tr><td>% ${esc(baseLabel)}</td>${cols.map((k) => `<td>${pc(od[k][1])}</td>`).join('')}<td>${pc(od.total[1])}</td></tr>
    </tbody></table></div>`;
}

function tiersTableHtml(list, prevList, kind) {
  const prevBy = new Map((prevList || []).map((x) => [norm(x.lib), x]));
  const rows = list.filter((x) => x.inv || Math.abs(x.s || 0) >= 0.01).slice(0, 30);
  if (!rows.length) return '<p class="muted">Aucune facture identifiée.</p>';
  return `<div class="grid-wrap"><table class="dtable num tiers-cyc"><thead><tr><th>${kind === 'clients' ? 'Client' : 'Fournisseur'}</th><th>Factures</th><th>TTC</th><th>Part</th>${prevList ? '<th>N-1</th>' : ''}<th>Avoirs</th><th>Solde</th><th>Délai moyen</th><th>&gt; 60 j</th></tr></thead>
    <tbody>${rows.map((x) => {
      const p = prevBy.get(norm(x.lib));
      const s = kind === 'clients' ? x.s : -x.s;
      return `<tr><td>${esc(x.lib)} <span class="muted small">${esc(x.num)}</span></td><td>${x.inv}</td><td>${eur(x.ttc, 0)}</td><td>${x.share ? pctFr(x.share, 0) : ''}</td>${prevList ? `<td>${p ? eur(p.ttc, 0) : '—'}</td>` : ''}
        <td>${x.avAmt ? eur(x.avAmt, 0) : ''}</td><td class="${s < 0 ? 'cred' : ''}">${eur(s || 0, 0)}</td><td>${daysTxt(x.delay)}</td><td>${x.lateN || ''}</td></tr>`;
    }).join('')}</tbody></table></div>
    <p class="muted small">Délai moyen pondéré par les montants, entre la facture et son règlement (${(list.some((x) => x.paidN) ? 'lettrage du FEC, ou à défaut règlements imputés sur les factures les plus anciennes' : 'aucun règlement identifié')}). Solde positif = ${kind === 'clients' ? 'dû par le client' : 'dû au fournisseur'}.</p>`;
}

function viewAchats() {
  const f = ui.fec, r = f.result, a = r.cycles.achats, prev = fecPrev();
  const { mv, solde } = sums(r);
  const ps = prev ? sums(prev) : null;
  const ref = pharmaRef(r);
  const od = overdue(r, '401', ref, fecTerme());
  const rt = ratios(r);
  return `
    <div class="kpis fec-kpis">
      ${kpiTile('Achats consommés (60)', eurK(mv(['60'])), '', ps ? eurK(ps.mv(['60'])) : null)}
      ${kpiTile('Factures fournisseurs', a.invoices.toLocaleString('fr-FR'), '', prev ? prev.cycles.achats.invoices.toLocaleString('fr-FR') : null)}
      ${kpiTile('Fournisseurs actifs', a.nbSuppliers, '', prev ? prev.cycles.achats.nbSuppliers : null)}
      ${kpiTile('Dettes fournisseurs', eurK(Math.max(0, -solde(['40'], ['408', '409']))), '', ps ? eurK(Math.max(0, -ps.solde(['40'], ['408', '409']))) : null)}
      ${kpiTile('Délai de paiement réel', daysTxt(a.delay.avg), a.delay.avg > 60 ? 'kpi-late' : '', prev ? daysTxt(prev.cycles.achats.delay.avg) : null)}
      ${kpiTile('Crédit fournisseurs (bilan)', daysTxt(rt.dpo), '', prev ? daysTxt(ratios(prev).dpo) : null)}
    </div>
    ${cycleHead('achats', "Factures en double, dettes anciennes, délais de paiement, TVA déductible, séparation des exercices et factures non parvenues. Cliquez sur un point pour voir le détail.")}
    ${r.monthly.length ? `<section class="card"><h2>Achats et charges externes par mois</h2>
      ${legend([['--series-1', 'Achats (60)'], ['--series-2', 'Charges externes (61-62)']])}
      ${barChart(r.monthly, [{ key: 'achats', label: 'Achats', color: '--series-1' }, { key: 'ext', label: 'Charges externes', color: '--series-2' }], { aria: 'Achats et charges externes par mois', xLabel: (x) => moisLabel(x.mois), tipTitle: (x) => moisLabel(x.mois).replace(/ \d+$/, '') + ' ' + x.mois.slice(0, 4) })}
    </section>` : ''}
    <section class="card"><h2>Principaux fournisseurs</h2>${tiersTableHtml(a.suppliers, prev ? prev.cycles.achats.suppliers : null, 'fournisseurs')}</section>
    <section class="card"><h2>Factures reçues non réglées à échéance dépassée</h2>
      <div class="filters">${terminput()}<span class="muted small">au ${fmtDate(ref)}</span></div>
      ${overdueTable(od, a.ttc, 'des achats TTC de l\'exercice', 'Tableau des délais de paiement fournisseurs (art. D441-6 du code de commerce)')}
      ${od.tiers.length ? `<details class="viz-table"><summary>Détail par fournisseur (${od.tiers.length})</summary><div class="grid-wrap"><table class="dtable num"><thead><tr><th>Fournisseur</th><th>Échu</th><th>dont &gt; 90 j</th><th>Plus ancienne</th></tr></thead>
        <tbody>${od.tiers.slice(0, 60).map((t) => `<tr><td>${esc(t.lib)}</td><td>${eur(t.late, 0)}</td><td>${t.b91 ? eur(t.b91, 0) : ''}</td><td>${t.oldest === '0' ? 'À-nouveau' : fmtDate(t.oldest)}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
    </section>`;
}

function monthDots(a, period) {
  return `<span class="mdots" aria-label="${period.filter((ym) => Math.abs(a.months[ym] || 0) >= 0.01).length} mois sur ${period.length}">${period.map((ym) => `<i class="${Math.abs(a.months[ym] || 0) >= 0.01 ? 'on' : ''}" title="${esc(`${moisLabel(ym).replace(/ \d+$/, '')} ${ym.slice(0, 4)} : ${eur(a.months[ym] || 0, 0)} €`)}"></i>`).join('')}</span>`;
}

function viewCharges() {
  const f = ui.fec, r = f.result, ch = r.cycles.charges, prev = fecPrev();
  const { mv, solde } = sums(r);
  const ext = mv(['61', '62']);
  const ca = r.kpi.ca;
  const prevAcc = new Map(prev ? prev.cycles.charges.accounts.map((a) => [a.compte, a]) : []);
  const last = [pharmaRef(r), r.pieces.maxOp || pharmaRef(r)].sort()[0];
  const period = monthsBetween(ymOf(r.meta.start && r.meta.start <= last ? r.meta.start : r.pieces.minOp || last), ymOf(last)).slice(-15);
  const direct = ch.accounts.reduce((s, a) => s + Math.max(0, a.direct), 0);
  const est = ch.cca.reduce((s, x) => s + x.cca, 0);
  const groups = {};
  ch.accounts.filter((a) => Math.abs(a.total) >= 0.01 || prevAcc.has(a.compte)).forEach((a) => (groups[a.compte.slice(0, 3)] = groups[a.compte.slice(0, 3)] || []).push(a));
  prevAcc.forEach((p) => { if (!ch.accounts.some((a) => a.compte === p.compte) && Math.abs(p.total) >= 0.01) (groups[p.compte.slice(0, 3)] = groups[p.compte.slice(0, 3)] || []).push({ compte: p.compte, lib: p.lib, total: 0, months: {}, direct: 0 }); });
  const pc = (v) => (ca > 0 ? pctFr(v / ca) : '—');
  const varCell = (n, p) => (prev ? `<td>${eur(p, 0)}</td>${pctCell(p ? (n - p) / Math.abs(p) : null)}` : '');
  const rows = Object.keys(groups).sort().map((g) => {
    const list = groups[g].sort((x, y) => x.compte.localeCompare(y.compte));
    const tot = list.reduce((s, a) => s + a.total, 0);
    const totP = list.reduce((s, a) => s + ((prevAcc.get(a.compte) || {}).total || 0), 0);
    return `<tr class="strong"><td>${g}</td><td>${esc(RUB3[g] || '')}</td><td>${eur(tot, 0)}</td><td>${pc(tot)}</td>${varCell(tot, totP)}<td></td><td></td></tr>
      ${list.map((a) => `<tr><td>${esc(a.compte)}</td><td>${esc(a.lib)}</td><td>${eur(a.total, 0)}</td><td>${pc(a.total)}</td>${varCell(a.total, (prevAcc.get(a.compte) || {}).total || 0)}<td>${monthDots(a, period)}</td><td>${a.direct > 0.5 && a.total > 0 ? pctFr(Math.min(1, a.direct / a.total), 0) : ''}</td></tr>`).join('')}`;
  }).join('');
  return `
    <div class="kpis fec-kpis">
      ${kpiTile('Charges externes (61-62)', eurK(ext), '', prev ? eurK(sums(prev).mv(['61', '62'])) : null)}
      ${kpiTile("Part du chiffre d'affaires", ca > 0 ? pctFr(ext / ca) : '—', '', prev && prev.kpi.ca > 0 ? pctFr(sums(prev).mv(['61', '62']) / prev.kpi.ca) : null)}
      ${kpiTile('Payées sans facture fournisseur', eurK(direct))}
      ${kpiTile("Charges constatées d'avance estimées", eurK(est), est > solde(['486']) * 2 && est > 0 ? 'kpi-wait' : '')}
      ${kpiTile('Bénéficiaires DAS2', ch.das2.length)}
      ${kpiTile('Dépenses à justifier', ch.perso.n + ch.amendes.n, ch.perso.n + ch.amendes.n ? 'kpi-wait' : '')}
    </div>
    ${cycleHead('charges', "Charges récurrentes manquantes, charges constatées d'avance, honoraires (DAS2), dépenses personnelles, amendes, cadeaux, notes de frais et séparation des exercices.")}
    <section class="card"><h2>Charges externes par compte</h2>
      <div class="grid-wrap"><table class="dtable num cyc-ext"><thead><tr><th>Compte</th><th>Libellé</th><th>Montant</th><th>% CA</th>${prev ? '<th>N-1</th><th>Var.</th>' : ''}<th>Mois mouvementés</th><th>Payé direct</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="8" class="muted">Aucune charge externe.</td></tr>'}</tbody></table></div>
      <p class="muted small">Chaque point représente un mois de la période (plein : charge comptabilisée). « Payé direct » : part réglée depuis la banque sans compte fournisseur.</p>
    </section>
    ${ch.cca.length ? `<section class="card"><h2>Charges constatées d'avance probables au ${fmtDate(r.meta.closing)}</h2>
      <div class="grid-wrap"><table class="dtable num l3"><thead><tr><th>Date</th><th>Compte</th><th>Libellé</th><th>Montant</th><th>Période présumée</th><th>CCA estimée</th></tr></thead>
      <tbody>${ch.cca.map((x) => `<tr><td>${fmtDate(x.date)}</td><td>${esc(x.compte)}</td><td>${esc(x.label)}</td><td>${eur(x.amt, 0)}</td><td>${x.cover} mois</td><td>${eur(x.cca, 0)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th colspan="5">Total estimé (486 comptabilisé : ${eur(solde(['486']), 0)} €)</th><th>${eur(est, 0)}</th></tr></tfoot></table></div>
      <p class="muted small">Paiements isolés de plus de 300 € sur des comptes réglés une à quatre fois par an (assurances, loyers, maintenance, abonnements…) : la période couverte est présumée de 12 ou 3 mois à partir de la date de la pièce.</p></section>` : ''}
    ${ch.das2.length ? `<section class="card"><h2>Honoraires et commissions à déclarer (DAS2)</h2>
      <div class="grid-wrap"><table class="dtable num"><thead><tr><th>Bénéficiaire</th><th>Comptes</th><th>Montant TTC estimé</th></tr></thead>
      <tbody>${ch.das2.map((b) => `<tr><td>${esc(b.benef)}</td><td>${esc(b.comptes.join(', '))}</td><td>${eur(b.total, 0)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
}

function viewClients() {
  const f = ui.fec, r = f.result, cl = r.cycles.clients, prev = fecPrev();
  const { solde } = sums(r);
  const ps = prev ? sums(prev) : null;
  const ref = pharmaRef(r);
  const od = overdue(r, '411', ref, fecTerme());
  const rt = ratios(r);
  return `
    <div class="kpis fec-kpis">
      ${kpiTile("Chiffre d'affaires HT", eurK(r.kpi.ca), '', prev ? eurK(prev.kpi.ca) : null)}
      ${kpiTile('Factures émises', cl.invoices.toLocaleString('fr-FR'), '', prev ? prev.cycles.clients.invoices.toLocaleString('fr-FR') : null)}
      ${kpiTile('Créances clients', eurK(Math.max(0, solde(['41'], ['419']))), '', ps ? eurK(Math.max(0, ps.solde(['41'], ['419']))) : null)}
      ${kpiTile("Délai d'encaissement réel", daysTxt(cl.delay.avg), cl.delay.avg > 60 ? 'kpi-late' : '', prev ? daysTxt(prev.cycles.clients.delay.avg) : null)}
      ${kpiTile('Crédit clients (bilan)', daysTxt(rt.dso), '', prev ? daysTxt(ratios(prev).dso) : null)}
      ${kpiTile('Échu depuis plus de 90 j', eurK(od.b91[1]), od.b91[1] > 0 ? 'kpi-late' : '')}
    </div>
    ${cycleHead('clients', "Numérotation des factures, créances échues et dépréciations, délais d'encaissement, TVA collectée, séparation des exercices, factures à établir et produits constatés d'avance.")}
    <section class="card"><h2>Principaux clients</h2>${tiersTableHtml(cl.customers, prev ? prev.cycles.clients.customers : null, 'clients')}</section>
    <section class="card"><h2>Factures émises non réglées à échéance dépassée</h2>
      <div class="filters">${terminput()}<span class="muted small">au ${fmtDate(ref)}</span></div>
      ${overdueTable(od, cl.ttc, "du chiffre d'affaires TTC facturé", 'Tableau des délais de paiement clients (art. D441-6 du code de commerce)')}
      ${od.tiers.length ? `<details class="viz-table"><summary>Détail par client (${od.tiers.length})</summary><div class="grid-wrap"><table class="dtable num"><thead><tr><th>Client</th><th>Échu</th><th>dont &gt; 90 j</th><th>Plus ancienne</th></tr></thead>
        <tbody>${od.tiers.slice(0, 60).map((t) => `<tr><td>${esc(t.lib)}</td><td>${eur(t.late, 0)}</td><td>${t.b91 ? eur(t.b91, 0) : ''}</td><td>${t.oldest === '0' ? 'À-nouveau' : fmtDate(t.oldest)}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
    </section>
    ${cl.numbering.length ? `<section class="card"><h2>Numérotation des factures de vente</h2>
      <div class="grid-wrap"><table class="dtable num"><thead><tr><th>Série</th><th>Factures et avoirs</th><th>Du n°</th><th>Au n°</th><th>Manquants</th><th>Doublons</th></tr></thead>
      <tbody>${cl.numbering.map((g) => `<tr><td>${esc(g.label)}${g.sparse ? ` <span class="muted small">${g.ecriture ? 'n° d\'écriture' : 'pas une suite ?'}</span>` : ''}</td><td>${g.count}</td><td>${g.first}</td><td>${g.last}</td><td>${g.sparse ? '—' : g.missing}</td><td>${g.dups.length || ''}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted small">Toutes les écritures de produits (comptes 70, 75 et 77), factures et avoirs, par journal et préfixe du n° de pièce.</p></section>` : ''}`;
}

function viewTreso() {
  const f = ui.fec, r = f.result, t = r.cycles.treso, prev = fecPrev();
  const { mv } = sums(r);
  const enc = r.monthly.reduce((s, m) => s + (m.enc || 0), 0);
  const dec = r.monthly.reduce((s, m) => s + (m.dec || 0), 0);
  const low = r.monthly.length ? r.monthly.reduce((m, x) => (x.tresorerie < m.tresorerie ? x : m)) : null;
  const neg = Math.max(0, ...t.accounts.filter((a) => /^51[2-9]/.test(a.compte)).map((a) => a.negDays));
  const bigOther = t.big;
  const totF = t.flux.reduce((s, x) => ({ enc: s.enc + x.enc, dec: s.dec + x.dec }), { enc: 0, dec: 0 });
  return `
    <div class="kpis fec-kpis">
      ${kpiTile('Trésorerie de fin', eurK(r.kpi.tresorerie), r.kpi.tresorerie < 0 ? 'kpi-late' : '', prev ? eurK(prev.kpi.tresorerie) : null)}
      ${kpiTile('Encaissements', eurK(enc))}
      ${kpiTile('Décaissements', eurK(dec))}
      ${kpiTile('Plus bas de fin de mois', low ? eurK(low.tresorerie) : '—', low && low.tresorerie < 0 ? 'kpi-late' : '')}
      ${kpiTile('Jours de découvert', neg, neg ? 'kpi-wait' : '')}
      ${kpiTile('Frais et agios bancaires', eurK(mv(['627', '6615'])), '', prev ? eurK(sums(prev).mv(['627', '6615'])) : null)}
    </div>
    ${cycleHead('treso', "Banques justifiées par le relevé à la date de clôture, emprunts par leur tableau d'amortissement (capital restant dû), caisse par le procès-verbal (ni créditrice ni au-delà de 10 000 €), valeurs mobilières par leur valorisation, compte courant d'associé non débiteur à la date de révision ; découverts, espèces de 1 000 € ou plus, comptes dormants. Le rapprochement détaillé avec le relevé se fait dans l'onglet Rapprochement.")}
    ${r.monthly.length ? `<section class="card"><h2>Encaissements et décaissements par mois</h2>
      ${legend([['--series-1', 'Encaissements'], ['--series-2', 'Décaissements']])}
      ${barChart(r.monthly, [{ key: 'enc', label: 'Encaissements', color: '--series-1' }, { key: 'dec', label: 'Décaissements', color: '--series-2' }], { aria: 'Encaissements et décaissements par mois', xLabel: (x) => moisLabel(x.mois), tipTitle: (x) => moisLabel(x.mois).replace(/ \d+$/, '') + ' ' + x.mois.slice(0, 4) })}
      <p class="muted small">Banques (512 et suivants) et caisses (53), hors virements internes.</p>
    </section>` : ''}
    <section class="card"><h2>Comptes de trésorerie</h2>
      <div class="grid-wrap"><table class="dtable num"><thead><tr><th>Compte</th><th>Libellé</th><th>Ouverture</th><th>Encaissements</th><th>Décaissements</th><th>Solde</th><th>Plus bas</th><th>Jours débiteurs</th><th>Dernière opération</th></tr></thead>
      <tbody>${t.accounts.map((a) => `<tr><td>${esc(a.compte)}</td><td>${esc(a.lib)}</td><td>${eur(a.an, 0)}</td><td>${eur(a.enc, 0)}</td><td>${eur(a.dec, 0)}</td><td class="${a.solde < 0 ? 'cred' : ''}">${eur(a.solde, 0)}</td>
        <td class="${a.min < 0 ? 'cred' : ''}">${eur(a.min, 0)}${a.minDate && a.min < a.an - 0.005 ? ` <span class="muted small">${fmtDate(a.minDate)}</span>` : ''}</td><td>${a.negDays || ''}</td><td>${a.last ? fmtDate(a.last) : '—'}</td></tr>`).join('')}</tbody></table></div>
    </section>
    <section class="card"><h2>Origine et destination des flux</h2>
      <div class="grid-wrap"><table class="dtable num sig r2"><thead><tr><th>Nature (contrepartie)</th><th>Encaissements</th><th>Décaissements</th><th>Net</th></tr></thead>
      <tbody>${t.flux.map((x) => `<tr><td>${esc(x.label)}</td><td>${eur(x.enc, 0)}</td><td>${eur(x.dec, 0)}</td><td class="${x.enc - x.dec < 0 ? 'cred' : ''}">${eur(x.enc - x.dec, 0)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th>Total</th><th>${eur(totF.enc, 0)}</th><th>${eur(totF.dec, 0)}</th><th>${eur(totF.enc - totF.dec, 0)}</th></tr></tfoot></table></div>
      <p class="muted small">Chaque mouvement de banque ou de caisse est classé selon le compte de contrepartie de l'écriture.</p>
    </section>
    ${bigOther.length ? `<section class="card"><h2>Mouvements importants hors clients, fournisseurs et paie</h2>
      <div class="grid-wrap"><table class="dtable num l3 l4"><thead><tr><th>Date</th><th>Compte</th><th>Contrepartie</th><th>Libellé</th><th>Montant</th></tr></thead>
      <tbody>${bigOther.slice(0, 20).map((m) => `<tr><td>${fmtDate(m.date)}</td><td>${esc(m.compte)}</td><td>${esc(m.cp)} <span class="muted small">${esc(m.cplib)}</span></td><td>${esc(m.lib)}</td><td class="${m.amt < 0 ? 'cred' : ''}">${eur(m.amt, 0)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
}

// Carte de la synthèse : un accès par cycle (A à K) avec le nombre de points, de comptes et de pièces restants.
function cyclesCard(r) {
  const cc = cycleChecks(r);
  if (!cc) return '';
  return `<section class="card"><div class="card-head"><h2>Dossier de révision</h2><button class="btn small" data-action="wp-print">Dossier de travail (PDF)</button></div><div class="kpis fec-kpis cycle-tiles">${Object.keys(CYCLE_DEF).map((k) => {
    const pg = wpProgress(k, cc[k]);
    const rev = wpStore().cycles[k];
    const used = cycleUsed(r, k);
    const acc = accLeft(r, k), doc = docsLeft(r, k);
    const rest = [acc ? `${acc} compte(s) à justifier` : '', doc ? `${doc} pièce(s) à obtenir` : ''].filter(Boolean).join(' · ');
    return `<button class="kpi cycle-tile${pg.left ? ' kpi-wait' : ''}${used ? '' : ' cycle-na'}" data-action="fec-tab" data-tab="${k}"><strong>${pg.left}</strong><span>${esc(CYCLES[k])}</span><em>${!used ? 'sans objet' : `${pg.total ? `${pg.done} / ${pg.total} point(s) traité(s)${pg.wait ? ` · ${pg.wait} en attente` : ''}` : 'rien à signaler'}${rest ? ` · ${rest}` : ''}`}${rev ? ' · revu ✓' : ''}</em></button>`;
  }).join('')}</div></section>`;
}

// Barre des cycles A à K, sous les onglets de l'espace Révision.
function cycleBar(r, cur) {
  const cc = cycleChecks(r);
  return `<div class="seg fec-tabs fec-cycles" role="tablist" aria-label="Cycles du dossier de révision">${Object.keys(CYCLE_DEF).map((k) => {
    const left = wpProgress(k, cc[k]).left;
    return `<button role="tab" aria-selected="${k === cur}" class="${k === cur ? 'on' : ''}${cycleUsed(r, k) ? '' : ' na'}" data-action="fec-tab" data-tab="${k}" title="${esc(CYCLES[k])}"><b>${CYCLE_DEF[k].l}</b> ${esc(CYCLE_DEF[k].court)}${left ? ` (${left})` : ''}</button>`;
  }).join('')}</div>`;
}

// ---------- Dossier de révision : contrôles des cycles A, F, G, H, I, J et K ----------

const dcTxt = (v, dec) => (Math.abs(v) < 0.005 ? '—' : `${eur(Math.abs(v), dec)} ${v < 0 ? 'C' : 'D'}`);
const balOf = (r, pref, excl) => r.balance.filter((b) => pref.some((p) => b.compte.startsWith(p)) && !(excl || []).some((p) => b.compte.startsWith(p)));
const accLine = (b, v) => `${b.compte} ${b.lib} : ${v === undefined ? dcTxt(b.s) : `${eur(v)} €`}`;

// Solde de sens inhabituel : charges créditrices et produits débiteurs (hors rabais, remises et ristournes, variations de
// stock), amortissements et dépréciations débiteurs, immobilisations ou stocks créditeurs, capital, subventions, provisions
// ou emprunts débiteurs. Fournisseurs, clients, banque, caisse et compte courant : points généraux.
function oddSide(b) {
  const c = b.compte, s = b.s;
  if (Math.abs(s) < 1) return false;
  if (c[0] === '6') return s < 0 && !/^6(\d9|\d\d9|03)/.test(c);
  if (c[0] === '7') return s > 0 && !/^7(\d9|\d\d9|13)/.test(c);
  if (/^(28|29|39|49|59)/.test(c)) return s > 0;
  if (c[0] === '2') return s < 0 && !/^2[67]9/.test(c);
  if (c[0] === '3') return s < 0;
  return /^(10[1-7]|13[0-8]|1[45]|16[0-8])/.test(c) && s > 0;
}

// À-nouveaux de l'exercice = soldes de clôture du FEC N-1 complet, compte par compte (classes 1 à 5) ; capital, réserves,
// report à nouveau et résultat (10 à 12) en total, résultat N-1 compris (il peut être déjà affecté dans les à-nouveaux).
function anCheck(r, prev, out) {
  if (!r.meta.hasAN) return;
  if (!prev) return out.add('info', "À-nouveaux non rapprochés de l'exercice précédent", "Chargez le FEC N-1 dans l'onglet Revue N / N-1 : chaque à-nouveau sera comparé au solde de clôture du compte.");
  const an = new Map(), clo = new Map(), lib = new Map();
  r.balance.forEach((b) => { if (/^[1-5]/.test(b.compte)) { an.set(b.compte, b.an); lib.set(b.compte, b.lib); } });
  prev.balance.forEach((b) => { if (/^[1-5]/.test(b.compte)) { clo.set(b.compte, b.s); if (!lib.has(b.compte)) lib.set(b.compte, b.lib); } });
  let a1 = 0, c1 = prev.balance.reduce((t, b) => (/^[67]/.test(b.compte) ? t + b.s : t), 0);
  const diffs = [];
  new Set([...an.keys(), ...clo.keys()]).forEach((k) => {
    const a = an.get(k) || 0, c = clo.get(k) || 0;
    if (/^1[012]/.test(k)) { a1 += a; c1 += c; return; }
    if (Math.abs(a - c) >= 1) diffs.push([k, `${k} ${lib.get(k)} : à-nouveau ${dcTxt(a)}, clôture N-1 ${dcTxt(c)}`]);
  });
  if (Math.abs(a1 - c1) >= 1) diffs.push(['1', `Capital, réserves, report à nouveau et résultat (10 à 12) : à-nouveaux ${dcTxt(a1)}, clôture N-1 résultat compris ${dcTxt(c1)}`]);
  diffs.sort((x, y) => x[0].localeCompare(y[0]));
  if (diffs.length) out.add('warn', "À-nouveaux différents des soldes de clôture de l'exercice précédent", `${diffs.length} écart(s) avec ${prev.meta.fileName} : écritures passées sur l'exercice précédent après la reprise des soldes, ou à-nouveaux modifiés ?`, diffs.slice(0, 60).map((x) => x[1]), { full: diffs.length <= 60 });
  else out.add('ok', "À-nouveaux conformes à la clôture de l'exercice précédent", `${an.size} compte(s) de bilan rapproché(s) de ${prev.meta.fileName}.`);
}

// Comptes d'attente (471 à 475, 478) soldés, et compte 471 vide : chaque opération est imputée directement sur son compte,
// sans écriture de reclassement. Anomalie à la clôture si un solde subsiste.
function attenteCheck(r, out) {
  const acc = balOf(r, ['47'], ['476', '477']).filter((b) => b.dm + b.cm >= 0.01 || Math.abs(b.an) >= 0.01 || Math.abs(b.s) >= 0.01);
  if (!acc.length) return out.add('ok', "Comptes d'attente vides", "Aucune écriture en compte d'attente : chaque opération est imputée sur son compte.");
  const open = acc.filter((b) => Math.abs(b.s) >= 0.01);
  const ops = ((r.pieces && r.pieces.attente) || []).filter((l) => /^47[1-58]/.test(l.compte));
  const ex = acc.map((b) => `${b.compte} ${b.lib} : ${Math.abs(b.an) >= 0.01 ? `à-nouveau ${dcTxt(b.an)}, ` : ''}${eur(b.dm)} € au débit et ${eur(b.cm)} € au crédit dans l'exercice, solde ${Math.abs(b.s) < 0.005 ? 'nul' : dcTxt(b.s)}`)
    .concat(ops.slice(0, 40).map((l) => `${fmtDate(l.date)} · ${l.compte} · « ${l.lib} » · ${eur(l.d || l.c)} € ${l.d ? 'au débit' : 'au crédit'} : opération à imputer`));
  const rule = "le compte 471 doit rester vide : chaque opération est imputée directement sur son compte, sans écriture de reclassement";
  if (open.length) out.add(yearEnd(r) ? 'error' : 'warn', "Comptes d'attente non soldés", `${open.length} compte(s) non soldé(s), ${ops.length} opération(s) en attente (demandées avec les pièces) : les comptes d'attente doivent être soldés et ${rule}.`, ex, { full: ops.length <= 40 && !r.pieces.attenteMax });
  else out.add('warn', "Écritures passées en compte d'attente", `Comptes soldés, mais ${rule}.`, ex, { full: true });
}

function chkRegul(r, coh) {
  const out = checksList();
  genIn(r, out, 'regul');
  cohIn(coh, out, 'regul');
  attenteCheck(r, out);
  const vi = balOf(r, ['58']);
  const open = vi.filter((b) => Math.abs(b.s) >= 0.01);
  if (open.length) out.add(yearEnd(r) ? 'error' : 'warn', 'Virements internes non soldés', "Le compte 58 doit être soldé : virement de compte à compte dont une seule moitié est comptabilisée, ou fonds en transit à la date d'arrêté.", open.map((b) => accLine(b)));
  else if (vi.length) out.add('ok', 'Virements internes soldés', 'Compte 58 à zéro en fin de période.');
  anCheck(r, ui.fec.prev, out);
  const odd = r.balance.filter(oddSide);
  if (odd.length) out.add('warn', 'Comptes au solde de sens inhabituel', `${odd.length} compte(s) : charge créditrice, produit débiteur, amortissement ou dépréciation débiteurs, immobilisation ou stock créditeurs, capital, provision ou emprunt débiteurs — erreur d'imputation, extourne en double ou écriture inversée ?`, odd.slice(0, 40).map((b) => accLine(b)), { full: odd.length <= 40 });
  else out.add('ok', 'Sens des soldes', 'Aucune charge créditrice ni aucun produit débiteur, pas d\'amortissement, de capital, de provision ou d\'emprunt de sens inverse.');
  return out;
}

function chkStocks(r, prev, coh) {
  const out = checksList();
  const { mv, solde, opening } = sums(r);
  cohIn(coh, out, 'stocks');
  const bal3 = balOf(r, ['3'], ['39']);
  if (!bal3.some((b) => Math.abs(b.s) >= 0.01 || Math.abs(b.an) >= 0.01) && Math.abs(mv(['603'])) < 0.01) {
    const buy = mv(['601', '602', '607']);
    if (yearEnd(r) && buy > 20000) out.add('info', 'Achats stockables sans stock', `${eur(buy, 0)} € d'achats de matières, d'approvisionnements ou de marchandises sans compte de stock : aucun stock à la clôture, ou inventaire non comptabilisé ?`);
    return out;
  }
  [['31', '6031', 'matières premières'], ['32', '6032', 'autres approvisionnements'], ['37', '6037', 'marchandises']].forEach(([st, va, lib]) => {
    const si = opening([st]), sf = solde([st]), v = mv([va]);
    if (Math.abs(si) < 0.01 && Math.abs(sf) < 0.01 && Math.abs(v) < 0.01) return;
    const ecart = v - (si - sf);
    if (Math.abs(ecart) >= 1) out.add('warn', `Variation du stock de ${lib} incohérente`, `${va} : ${eur(v)} € pour un stock passé de ${eur(si)} € à ${eur(sf)} € (variation attendue ${eur(si - sf)} €, écart ${eur(ecart)} €).`);
    else out.add('ok', `Variation du stock de ${lib} cohérente`, `Stock initial ${eur(si, 0)} €, stock final ${eur(sf, 0)} €, variation ${eur(v, 0)} € (${va}).`);
  });
  const siP = opening(['33', '34', '35']), sfP = solde(['33', '34', '35']), vP = -mv(['713']);
  if (Math.abs(siP) >= 0.01 || Math.abs(sfP) >= 0.01 || Math.abs(vP) >= 0.01) {
    if (Math.abs(vP - (sfP - siP)) >= 1) out.add('warn', 'Variation des en-cours et produits incohérente', `713 : ${eur(vP)} € pour des en-cours et produits passés de ${eur(siP)} € à ${eur(sfP)} € (variation attendue ${eur(sfP - siP)} €).`);
    else out.add('ok', 'Variation des en-cours et produits cohérente', `De ${eur(siP, 0)} € à ${eur(sfP, 0)} € (713).`);
  }
  const stock = solde(['3'], ['39']);
  if (!bal3.some((b) => b.dm + b.cm >= 0.01)) out.add(yearEnd(r) ? 'warn' : 'info', 'Stock de clôture non comptabilisé', yearEnd(r)
    ? `Les comptes de stock n'ont pas bougé depuis l'ouverture (${eur(stock, 0)} €) : inventaire de fin d'exercice à comptabiliser.`
    : `Situation : le stock d'ouverture (${eur(stock, 0)} €) est conservé ; inventaire intermédiaire, ou estimation par le taux de marge ?`);
  const dep = -solde(['39']);
  if (dep > 0.01) out.add('info', `Dépréciation des stocks : ${eur(dep, 0)} €`, `${stock > 0 ? `${pctFr(dep / stock)} du stock brut` : 'Stock brut nul'}${Math.abs(dep + opening(['39'])) < 0.01 ? ", inchangée depuis l'ouverture" : ''} : à justifier par l'état des articles obsolètes, abîmés ou vendus à perte.`);
  if (prev) {
    const sp = sums(prev).solde(['3'], ['39']);
    const dv = stock - sp;
    if (sp > 0 && Math.abs(dv) >= (ui.fec.seuil || defaultSeuil(r)) && Math.abs(dv) / sp >= 0.3) out.add('info', `Stock ${dv > 0 ? 'en hausse' : 'en baisse'} de ${pctFr(Math.abs(dv) / sp, 0)}`, `${eur(sp, 0)} € → ${eur(stock, 0)} €${prev.kpi.ca > 0 ? `, pour un chiffre d'affaires ${r.kpi.ca >= prev.kpi.ca ? 'en hausse' : 'en baisse'} de ${pctFr(Math.abs(r.kpi.ca - prev.kpi.ca) / prev.kpi.ca, 0)}` : ''} : inventaire, valorisation et articles sans rotation à vérifier.`);
  }
  return out;
}

function chkImmo(r, coh) {
  const out = checksList();
  const { mv, solde } = sums(r);
  cohIn(coh, out, 'immo');
  const sorties = balOf(r, ['20', '21', '22', '26']).filter((b) => b.cm >= 1);
  const prix = -mv(['775']), vnc = mv(['675']);
  if (sorties.length && Math.abs(prix) < 0.01 && Math.abs(vnc) < 0.01) out.add('warn', "Sortie d'immobilisation sans écriture de cession", `${eur(sorties.reduce((s, b) => s + b.cm, 0), 0)} € au crédit des comptes d'immobilisations, sans valeur comptable des éléments cédés (675) ni produit de cession (775) : cession, mise au rebut ou erreur d'imputation ?`, sorties.map((b) => accLine(b, b.cm)));
  else if (prix >= 0.01 && !sorties.length) out.add('warn', "Produit de cession sans sortie d'immobilisation", `Prix de cession de ${eur(prix, 0)} € (775) : la valeur brute et les amortissements de l'élément cédé restent à sortir (675, 28).`);
  else if (prix >= 0.01 || vnc >= 0.01) out.add('info', `Cessions de l'exercice : ${prix >= vnc ? 'plus' : 'moins'}-value de ${eur(Math.abs(prix - vnc), 0)} €`, `Prix de cession ${eur(prix, 0)} € (775), valeur comptable ${eur(vnc, 0)} € (675) : plus ou moins-value à court ou à long terme à déterminer.`);
  const amort = balOf(r, ['28']).reduce((s, b) => s + b.cm, 0), dot = mv(['6811', '6871']);
  if ((amort >= 1 || dot >= 1) && Math.abs(amort - dot) >= 1) out.add('warn', 'Dotations différentes des amortissements comptabilisés', `Dotations ${eur(dot, 0)} € (6811, 6871), amortissements portés au crédit des comptes 28 : ${eur(amort, 0)} € — écriture incomplète ou imputation à vérifier.`);
  const over = [['20', '280'], ['21', '281']].filter(([g, a]) => -solde([a]) > solde([g]) + 1).map(([g, a]) => `${a} : amortissements ${eur(-solde([a]), 0)} € pour une valeur brute de ${eur(solde([g]), 0)} € (${g})`);
  if (over.length) out.add('warn', 'Amortissements supérieurs à la valeur brute', 'Immobilisation sortie sans ses amortissements, ou dotation en trop ?', over);
  const enc = balOf(r, ['23']).filter((b) => Math.abs(b.s) >= 1);
  if (enc.length) {
    const still = enc.some((b) => b.dm + b.cm < 0.01);
    out.add(still ? 'warn' : 'info', `Immobilisations en cours : ${eur(enc.reduce((s, b) => s + b.s, 0), 0)} €`, still
      ? "Montant inchangé depuis l'ouverture : travaux achevés à mettre en service (virement au compte 21 et début de l'amortissement) ?"
      : "Travaux en cours à la clôture : à virer au compte 21 à la mise en service.", enc.map((b) => accLine(b)));
  }
  const cb = mv(['612']);
  if (cb >= 1) out.add('info', `Redevances de crédit-bail : ${eur(cb, 0)} €`, "Engagements de crédit-bail (redevances restant à payer, valeur résiduelle) à mentionner en annexe ; part non déductible pour un véhicule de tourisme.");
  const acq = balOf(r, ['20', '21', '22', '23', '26', '27']).reduce((s, b) => s + b.dm, 0) - balOf(r, ['23']).reduce((s, b) => s + b.cm, 0);
  if (acq >= 1) out.add('info', `Investissements de l'exercice : ${eur(acq, 0)} €`, "Factures demandées avec les pièces : date de mise en service, durée d'utilisation, composants ; dépenses de plus de 500 € HT passées en charges à reclasser ?");
  return out;
}

function chkSocial(r, ref, coh) {
  const out = checksList();
  const { mv, solde } = sums(r);
  cohIn(coh, out, 'social');
  const pay = (r.pieces && r.pieces.payroll) || {};
  const months = Object.keys(pay).sort();
  if (months.length >= 3) {
    const all = monthsBetween(months[0], ymOf([ref, r.pieces.maxOp || ref].sort()[0]));
    const miss = all.filter((ym) => !pay[ym]);
    if (miss.length) out.add('warn', 'Mois sans salaire comptabilisé', `${fmtMonths(miss)} : paie non comptabilisée, ou plus de salarié ?`);
    else out.add('ok', 'Salaires comptabilisés chaque mois', `${all.length} mois de paie.`);
  }
  silaeChecks(r, out);
  // Rémunérations dues (421) : soldées, ou salaires du dernier mois réglés au début de l'exercice suivant
  const last = months[months.length - 1], du = -solde(['421']);
  if (du >= 1 && last && du > pay[last] + 1) out.add('warn', "Salaires restant dus de plus d'un mois", `${eur(du)} € au crédit du 421 pour ${eur(pay[last])} € de salaires bruts en ${fmtMonths([last])} : seuls les salaires du dernier mois, réglés au début de l'exercice suivant, peuvent rester dus.`);
  else if (du >= 1) out.add('ok', 'Salaires du dernier mois restant dus', `${eur(du)} € au crédit du 421, réglés au début de l'exercice suivant.`);
  else if (balOf(r, ['421']).length && Math.abs(solde(['421'])) < 1) out.add('ok', 'Rémunérations dues soldées', 'Compte 421 à zéro.');
  const remu = mv(['644']);
  if (remu >= 1 && mv(['646']) < 0.01) out.add('warn', 'Rémunération du dirigeant sans cotisations personnelles', `${eur(remu, 0)} € en 644 sans cotisations sociales personnelles (646) : appels de cotisations à comptabiliser.`);
  const deb43 = balOf(r, ['43']).filter((b) => b.s >= 1);
  if (deb43.length) out.add('warn', 'Organismes sociaux débiteurs', 'Cotisations versées en trop, ou charges sociales non comptabilisées (dernier mois, régularisation annuelle) ?', deb43.map((b) => accLine(b)));
  // Organismes sociaux (431 à 437) : reste dû le dernier mois ou le dernier trimestre de cotisations, estimé sur les trois
  // derniers mois de salaires bruts (cotisations patronales de l'exercice rapportées aux salaires, plus 22 % de part salariale)
  const soc = balOf(r, ['431', '432', '433', '434', '435', '436', '437']);
  const due = soc.reduce((t, b) => t + Math.max(0, -b.s), 0);
  const gross = mv(['641']), q = months.slice(-3).reduce((t, ym) => t + pay[ym], 0);
  const est = gross > 0 ? q * (mv(['645', '647', '648']) / gross + 0.22) : 0;
  if (est > 0 && due > est * 1.15) out.add('warn', "Dettes sociales de plus d'un trimestre", `${eur(due)} € dus aux organismes sociaux (431 à 437), pour environ ${eur(est, 0)} € de cotisations sur les trois derniers mois de salaires : seul le dernier mois ou le dernier trimestre doit rester à régler (retard, échéancier, ou règlements non lettrés ?).`, soc.filter((b) => b.s <= -1).map((b) => accLine(b)));
  else if (due >= 1) out.add('ok', 'Dettes sociales du dernier mois ou du dernier trimestre', `${eur(due)} € dus aux organismes sociaux (431 à 437)${est > 0 ? `, pour environ ${eur(est, 0)} € de cotisations sur les trois derniers mois` : ''}.`);
  const av = balOf(r, ['42']).filter((b) => b.s >= 1);
  if (av.length) out.add('info', `Personnel débiteur : ${eur(av.reduce((s, b) => s + b.s, 0), 0)} €`, 'Avances et acomptes au personnel (425) à récupérer sur les salaires, ou erreur de paie ?', av.map((b) => accLine(b)));
  if (yearEnd(r) && mv(['641']) > 20000 && Math.abs(solde(['4282', '4382'])) < 0.01) out.add('info', 'Pas de congés payés à payer à la clôture', `Congés acquis et non pris au ${fmtDate(r.meta.closing)} à provisionner, charges sociales comprises (4282, 4382), sauf adhésion à une caisse de congés payés.`);
  return out;
}

function chkEtat(r, prev, coh) {
  const out = checksList();
  const { mv, solde } = sums(r);
  genIn(r, out, 'etat');
  cohIn(coh, out, 'etat');
  const is = mv(['695', '696']), isN1 = prev ? sums(prev).mv(['695']) : 0;
  const acomptes = balOf(r, ['444']).reduce((s, b) => s + b.dm, 0), s444 = solde(['444']);
  if (isN1 > 3000 && acomptes < 1 && mv(['695']) < 1 && Object.keys(r.pieces.payroll || {}).length !== 1) out.add('warn', "Aucun acompte d'impôt sur les sociétés", `Impôt de l'exercice précédent : ${eur(isN1, 0)} € : acomptes trimestriels dus (le 15 du 3e, 6e, 9e et 12e mois) — paiements non comptabilisés ?`);
  if (Math.abs(s444) >= 1 || is >= 1) out.add('info', `Impôt sur les sociétés : charge de ${eur(is, 0)} €, ${s444 < -0.5 ? `reste à payer ${eur(-s444, 0)} €` : s444 > 0.5 ? `créance de ${eur(s444, 0)} €` : 'compte 444 soldé'}`, `Acomptes et règlements de l'exercice : ${eur(acomptes, 0)} € ; solde du 444 à rapprocher du relevé de solde (2572) et du calcul de l'impôt.`);
  const cfe = mv(['6351']) >= 1 || balOf(r, ['63']).some((b) => /\bcfe\b|cotisation fonci|\bcet\b|contribution [ée]conomique/i.test(b.lib) && b.dm >= 1);
  if (yearEnd(r) && (r.meta.hasAN || prev) && !cfe) out.add('info', 'Aucune cotisation foncière des entreprises (6351)', "CFE due chaque année, sauf l'année de création ou exonération : avis d'imposition à télécharger sur l'espace professionnel.");
  if (prev && yearEnd(r)) {
    const now = new Map(balOf(r, ['63']).map((b) => [b.compte, b.dm - b.cm]));
    const gone = balOf(prev, ['63']).filter((b) => b.dm - b.cm >= 150 && (now.get(b.compte) || 0) < (b.dm - b.cm) * 0.1);
    if (gone.length) out.add('info', "Impôts et taxes de l'exercice précédent absents", 'Taxe plus due cette année, ou avis non comptabilisé ?', gone.map((b) => `${b.compte} ${b.lib} : ${eur(b.dm - b.cm, 0)} € en N-1, ${eur(now.get(b.compte) || 0, 0)} € cette année`));
  }
  const credit = solde(['44567']);
  if (credit >= 1) out.add('info', `Crédit de TVA à reporter : ${eur(credit, 0)} €`, 'À rapprocher de la dernière déclaration ; remboursement à demander (3519) si le crédit est durable.');
  return out;
}

function chkCapitaux(r, ref, coh) {
  const out = checksList();
  const { mv, solde, opening } = sums(r);
  cohIn(coh, out, 'capitaux');
  const c = clientById(ui.fec.clientId);
  const cap0 = -opening(['101']), cap = -solde(['101']);
  if (Math.abs(cap - cap0) >= 1) out.add('warn', "Capital modifié dans l'exercice", `${eur(cap0, 0)} € → ${eur(cap, 0)} € : procès-verbal d'assemblée, statuts mis à jour, formalités au greffe et libération des apports.`);
  else if (cap > 0) out.add('ok', `Capital inchangé : ${eur(cap, 0)} €`, 'À rapprocher des statuts et du Kbis.');
  const r12 = solde(['12']), a12 = opening(['12']);
  if (Math.abs(r12) >= 1) {
    const late = !!r.meta.start && ref > addMonths(r.meta.start, 6);
    out.add(late ? 'warn' : 'info', "Résultat de l'exercice précédent non affecté", `${r12 < 0 ? 'Bénéfice' : 'Perte'} de ${eur(Math.abs(r12), 0)} € encore au compte 12 : écriture d'affectation (réserves, report à nouveau, dividendes) à passer d'après la décision d'approbation des comptes${late ? ', due dans les six mois de la clôture' : ''}.`);
  } else if (Math.abs(a12) >= 1) out.add('ok', "Résultat de l'exercice précédent affecté", `${a12 < 0 ? 'Bénéfice' : 'Perte'} de ${eur(Math.abs(a12), 0)} € réparti dans l'exercice.`);
  // Réserve légale : 5 % du bénéfice (diminué du report à nouveau débiteur) jusqu'à 10 % du capital (SARL, SAS, SA)
  if (c && /^(EURL|SARL|SAS|SASU|SA|SELARL|SELAS)$/.test(c.forme || '') && cap > 0 && -a12 > 0 && mv(['12']) > 0.5) {
    const dot = balOf(r, ['1061']).reduce((s, b) => s + b.cm, 0);
    const due = Math.max(0, Math.min(0.05 * (-a12 - Math.max(0, opening(['11']))), 0.1 * cap + opening(['1061'])));
    if (due - dot >= 1) out.add('warn', 'Réserve légale insuffisamment dotée', `5 % du bénéfice de l'exercice précédent (diminué du report à nouveau débiteur) jusqu'à ce que la réserve atteigne 10 % du capital : ${eur(due, 0)} € attendus, ${eur(dot, 0)} € dotés (art. L232-10 du code de commerce).`);
  }
  const subv = -solde(['13'], ['139']);
  if (yearEnd(r) && subv >= 1 && -mv(['777', '747']) < 0.01) out.add('warn', "Subvention d'investissement sans reprise au résultat", `${eur(subv, 0)} € de subventions (13) : quote-part à virer au résultat au rythme de l'amortissement du bien financé (139 / 777).`);
  const prov = -solde(['15']);
  if (prov >= 1) {
    const dot = mv(['6815', '6865', '6875']), rep = -mv(['7815', '7865', '7875']);
    out.add('info', `Provisions pour risques et charges : ${eur(prov, 0)} €`, dot < 0.01 && rep < 0.01
      ? "Inchangées depuis l'ouverture : risque toujours d'actualité à la clôture ? Justificatif à jour (litige, courrier d'avocat, garantie)."
      : `Dotations ${eur(dot, 0)} €, reprises ${eur(rep, 0)} € : justificatif de chaque provision (litige, courrier d'avocat, garantie).`, balOf(r, ['15']).filter((b) => Math.abs(b.s) >= 1).map((b) => accLine(b)));
  }
  const derog = -solde(['145']);
  if (yearEnd(r) && derog >= 1 && Math.abs(mv(['6872', '7872'])) < 0.01) out.add('info', 'Amortissements dérogatoires sans dotation ni reprise', `${eur(derog, 0)} € en 145 : dotation (6872) ou reprise (7872) de l'exercice à calculer avec le tableau des amortissements.`);
  const ex = balOf(r, ['108']);
  const prel = ex.reduce((s, b) => s + b.dm, 0), app = ex.reduce((s, b) => s + b.cm, 0);
  if (prel + app >= 1) out.add('info', `Compte de l'exploitant : prélèvements ${eur(prel, 0)} €, apports ${eur(app, 0)} €`, "Dépenses personnelles payées par l'entreprise à y imputer plutôt qu'en charges.");
  const ran = solde(['11']);
  if (ran >= 1) out.add('info', `Report à nouveau débiteur : ${eur(ran, 0)} €`, 'Pertes antérieures à apurer en priorité par les bénéfices suivants (avant la réserve légale et les dividendes).');
  return out;
}

function chkAutres(r, coh) {
  const out = checksList();
  const { mv } = sums(r);
  cohIn(coh, out, 'autres');
  const seuil = ui.fec.seuil || defaultSeuil(r);
  const div = balOf(r, ['46']).filter((b) => Math.abs(b.s) >= 1);
  if (div.length) {
    const old = div.filter((b) => b.dm + b.cm < 0.01).length;
    out.add(old ? 'warn' : 'info', 'Débiteurs et créditeurs divers non soldés', `${div.length} compte(s)${old ? `, dont ${old} sans mouvement depuis l'ouverture` : ''} : nature et justificatif de chaque solde (sommes à recevoir ou à payer, avances, indemnités).`, div.map((b) => `${accLine(b)}${b.dm + b.cm < 0.01 ? " (inchangé depuis l'ouverture)" : ''}`));
  }
  const lia = balOf(r, ['18']).filter((b) => Math.abs(b.s) >= 1);
  if (lia.length) out.add('warn', 'Comptes de liaison non soldés', 'Les comptes de liaison des établissements doivent se compenser : balances des établissements à rapprocher.', lia.map((b) => accLine(b)));
  const lines = (pref, excl, sg) => balOf(r, pref, excl).filter((b) => Math.abs(b.dm - b.cm) >= 0.5).map((b) => accLine(b, sg * (b.dm - b.cm)));
  const ce = mv(['67'], ['6712', '675']), pe = -mv(['77'], ['775', '777']), apg = -mv(['75']);
  if (ce >= seuil / 2) out.add('info', `Charges exceptionnelles : ${eur(ce, 0)} €`, "Nature de chaque opération (rappels d'impôts, pénalités, dons, créances irrécouvrables, régularisations sur exercices antérieurs) : la plupart des pénalités et des dons ne sont pas déductibles.", lines(['67'], ['6712', '675'], 1));
  if (pe >= seuil / 2) out.add('info', `Produits exceptionnels : ${eur(pe, 0)} €`, "Nature de chaque opération (dégrèvements, indemnités d'assurance, abandons de créances, régularisations sur exercices antérieurs) : justificatif à obtenir.", lines(['77'], ['775', '777'], -1));
  if (apg >= seuil) out.add('info', `Autres produits de gestion courante : ${eur(apg, 0)} €`, 'Redevances, revenus des immeubles, quotes-parts et produits divers : contrat ou justificatif.', lines(['75'], [], -1));
  const r48 = balOf(r, ['48']).filter((b) => Math.abs(b.s) >= 1);
  if (r48.length) out.add('info', 'Comptes de régularisation', "Détail du calcul de chaque charge ou produit constaté d'avance (période couverte, pièce d'origine).", r48.map((b) => accLine(b)));
  return out;
}

// ---------- Dossier de révision : comptes et pièces du cycle, pages des cycles ----------

// Comptes du cycle (feuille maîtresse) : solde, solde N-1 (FEC de l'exercice précédent, à défaut à-nouveau pour un compte de
// bilan), variation. À justifier : compte de bilan non soldé, variation significative (seuil de la revue N / N-1 et 20 %).
// Plus de 15 comptes de fournisseurs ou de clients (un compte par tiers) : regroupés sous leur racine.
function cycleAccounts(r, key) {
  const prev = fecPrev();
  const seuil = ui.fec.seuil || defaultSeuil(r);
  const mk = [key, prev ? prev.meta.fileName : '', seuil].join('|');
  const memo = r._acc || Object.defineProperty(r, '_acc', { value: new Map(), configurable: true, writable: true, enumerable: false })._acc;
  if (memo.has(mk)) return memo.get(mk);
  const pick = (res) => {
    const list = res.balance.filter((b) => cycleOf(b.compte) === key);
    const many = new Set(['401', '411'].filter((p) => list.filter((b) => b.compte.startsWith(p)).length > 15));
    const m = new Map();
    list.forEach((b) => {
      const k = many.has(b.compte.slice(0, 3)) ? b.compte.slice(0, 3) : b.compte;
      const x = m.get(k) || m.set(k, { compte: k, lib: k === b.compte ? b.lib : `${k === '401' ? 'Fournisseurs' : 'Clients'} (comptes regroupés)`, s: 0, an: 0, mvt: 0 }).get(k);
      x.s += b.s; x.an += b.an; x.mvt += b.dm + b.cm;
    });
    return m;
  };
  const cur = pick(r), pm = prev ? pick(prev) : new Map();
  pm.forEach((b, k) => { if (!cur.has(k)) cur.set(k, { compte: k, lib: b.lib, s: 0, an: 0, mvt: 0 }); });
  const out = Array.from(cur.values()).map((a) => {
    const bilan = a.compte[0] < '6';
    const n1 = prev ? (pm.get(a.compte) || { s: 0 }).s : bilan ? a.an : null;
    const same = n1 === null || Math.abs(n1) < 0.005 || Math.abs(a.s) < 0.005 || (n1 < 0) === (a.s < 0);
    const delta = n1 === null ? null : same ? Math.abs(a.s) - Math.abs(n1) : a.s - n1;
    const pct = n1 !== null && same && Math.abs(n1) >= 0.005 ? delta / Math.abs(n1) : null;
    const flagged = n1 !== null && Math.abs(delta) >= seuil && (pct === null || Math.abs(pct) >= 0.2);
    // À justifier même soldés : compte 471 mouvementé (il doit rester vide), banques (relevé) et emprunts (tableau d'amortissement)
    return Object.assign(a, { bilan, n1, same, delta, pct, flagged, todo: (bilan && Math.abs(a.s) >= 1) || flagged || (/^(471|51[2-9]|16[4-8])/.test(a.compte) && a.mvt >= 0.01) });
  }).filter((a) => Math.abs(a.s) >= 0.005 || a.mvt >= 0.005 || Math.abs(a.an) >= 0.005 || (a.n1 !== null && Math.abs(a.n1) >= 0.005))
    .sort((x, y) => x.compte.localeCompare(y.compte));
  memo.set(mk, out);
  return out;
}
// Solde selon la pièce (relevé, tableau d'amortissement, procès-verbal…) : écart = solde du compte − pièce ; valeurs mobilières :
// plus-value (+) ou moins-value (−) latente. Compte justifié : case cochée, ou écart nul (valeurs mobilières : pas de moins-value).
const pieceHint = (c) => (/^16/.test(c) ? 'Capital restant dû' : /^51[2-9]/.test(c) ? 'Solde du relevé' : /^511/.test(c) ? 'Solde communiqué' : /^53/.test(c) ? 'Procès-verbal' : /^50/.test(c) ? 'Valeur de clôture' : 'Solde de la pièce');
function accEcart(a) {
  const v = wpSoldeStore()[a.compte];
  if (v === undefined || !a.bilan) return null;
  return Math.round((a.compte.startsWith('50') ? v - Math.abs(a.s) : Math.abs(a.s) - v) * 100) / 100;
}
function accDone(a) {
  if (wpAccStore()[a.compte]) return true;
  const e = accEcart(a);
  return e !== null && (a.compte.startsWith('50') ? e >= 0 : e === 0);
}
const accLeft = (r, key) => cycleAccounts(r, key).filter((a) => a.todo && !accDone(a)).length;
// Cycle sans objet : aucun compte et aucun point relevé (le cycle A s'applique à tout FEC).
const cycleUsed = (r, key) => key === 'regul' || cycleAccounts(r, key).length > 0 || (cycleChecks(r)[key] || []).some((x) => x.level !== 'ok');

// Groupe d'un compte : préfixe de rangement de trois chiffres ou plus (627 en B…), sinon rubrique à deux chiffres.
const accGroup = (compte) => { const p = (CYCLE_PREF.find(([x]) => compte.startsWith(x)) || [''])[0]; return p.length >= 3 ? p : compte.slice(0, 2); };
const GROUP_LIB = { 603: 'Variation des stocks', 606: 'Achats non stockés de matières et fournitures', 627: 'Services bancaires', 654: 'Pertes sur créances irrécouvrables',
  655: 'Quotes-parts de résultat sur opérations faites en commun', 665: 'Escomptes accordés', 675: "Valeurs comptables des éléments d'actif cédés", 691: 'Participation des salariés',
  765: 'Escomptes obtenus', 775: "Produits des cessions d'éléments d'actif", 777: "Quote-part des subventions d'investissement virée au résultat",
  6712: 'Pénalités, amendes fiscales et pénales', 6811: 'Dotations aux amortissements', 6815: 'Dotations aux provisions pour risques et charges',
  6817: 'Dotations aux dépréciations des actifs circulants', 7815: 'Reprises sur provisions pour risques et charges', 7817: 'Reprises sur dépréciations des actifs circulants' };

function comptesCard(r, key) {
  const rows = cycleAccounts(r, key);
  const prev = fecPrev();
  if (!rows.length) return `<section class="card"><h2>Comptes du cycle</h2><p class="muted">Aucun compte de ce cycle dans le FEC${prev ? " ni dans celui de l'exercice précédent" : ''}.</p></section>`;
  const st = wpAccStore(), so = wpSoldeStore();
  const com = revueComments().comments;
  const groups = new Map();
  rows.forEach((a) => { const g = accGroup(a.compte); (groups.get(g) || groups.set(g, []).get(g)).push(a); });
  const varTxt = (a) => (a.n1 === null ? '—' : !a.same ? 'sens inversé' : Math.abs(a.delta) < 0.5 ? '0' : `${a.delta > 0 ? '+' : '−'}${eur(Math.abs(a.delta), 0)}`);
  const body = Array.from(groups.entries()).map(([g, list]) => {
    const s = list.reduce((t, a) => t + a.s, 0), n1 = list.some((a) => a.n1 !== null) ? list.reduce((t, a) => t + (a.n1 || 0), 0) : null;
    return `${list.length > 1 ? `<tr class="strong"><td>${esc(g)}</td><td>${esc(GROUP_LIB[g] || RUBRIQUES[g] || RUBRIQUES[g.slice(0, 2)] || '')}</td><td>${n1 === null ? '—' : dcTxt(n1, 0)}</td><td>${dcTxt(s, 0)}</td><td colspan="6"></td></tr>` : ''}
      ${list.map((a) => {
        const done = accDone(a), e = accEcart(a), hint = pieceHint(a.compte);
        const ok = e !== null && (a.compte.startsWith('50') ? e >= 0 : e === 0);
        return `<tr class="${a.todo && !done ? 'flag' : done ? 'done' : ''}"><td>${esc(a.compte)}</td><td>${esc(a.lib)}</td><td>${a.n1 === null ? '—' : dcTxt(a.n1)}</td><td>${dcTxt(a.s)}</td><td>${varTxt(a)}</td>${a.n1 === null ? '<td class="muted">—</td>' : pctCell(a.pct)}
        <td class="solde">${a.bilan ? `<input type="text" inputmode="decimal" data-wpsolde="${esc(a.compte)}" value="${so[a.compte] === undefined ? '' : esc(eur(so[a.compte]))}" placeholder="${hint}" autocomplete="off" aria-label="${hint} (compte ${esc(a.compte)})">` : ''}</td>
        <td class="${e === null ? '' : ok ? 'ecart-ok' : 'cred'}">${e === null ? '' : e === 0 ? '0' : `${e > 0 ? '+' : '−'}${eur(Math.abs(e))}`}</td>
        <td class="chk"><input type="checkbox" data-wpacc="${esc(a.compte)}"${done ? ' checked' : ''}${done && !st[a.compte] ? ' disabled title="Justifié par la pièce"' : ''} aria-label="Compte ${esc(a.compte)} justifié"></td>
        <td class="comment"><input data-comment="${esc(a.compte)}" value="${esc(com[a.compte] || '')}" placeholder="${a.bilan ? 'Justification du solde…' : 'Explication de la variation…'}" spellcheck="false" autocomplete="off" aria-label="Commentaire du compte ${esc(a.compte)}"></td></tr>`;
      }).join('')}`;
  }).join('');
  return `<section class="card"><h2>Comptes du cycle <span class="count">${rows.filter((a) => a.todo && !accDone(a)).length}</span></h2>
    <p class="muted small">Solde de chaque compte du cycle${prev ? `, comparé à l'exercice précédent (${esc(prev.meta.fileName)})` : ", comparé à l'ouverture pour les comptes de bilan (chargez le FEC N-1 dans l'onglet Revue N / N-1 pour comparer aussi les charges et les produits)"}. Surlignés : à justifier — compte de bilan non soldé, banque ou emprunt mouvementé, ou variation d'au moins ${eur(ui.fec.seuil || defaultSeuil(r), 0)} € et 20 %. « Selon pièce » : solde du relevé, capital restant dû du tableau d'amortissement, procès-verbal de caisse, valeur des placements… ; le compte est justifié quand l'écart est nul. Les commentaires sont repris dans la revue N / N-1.</p>
    <div class="grid-wrap"><table class="dtable num cyc-acc"><thead><tr><th>Compte</th><th>Libellé</th><th>${prev ? 'N-1' : 'Ouverture'}</th><th>Solde</th><th>Variation</th><th>%</th><th>Selon pièce</th><th>Écart</th><th>Justifié</th><th>Commentaire</th></tr></thead>
    <tbody>${body}</tbody></table></div></section>`;
}

// Pièces et documents de chaque cycle, selon les comptes mouvementés. `cab` : document établi par le cabinet ; sinon à obtenir
// du client et ajouté à la demande de pièces du bilan, sauf `std` (déjà demandé par la liste de clôture ou pièce par pièce).
const DOC_ST = { '': 'À obtenir', demande: 'Demandé', recu: 'Reçu', na: 'Sans objet' };
const DOC_ST_CAB = { '': 'À établir', demande: 'En cours', recu: 'Établi', na: 'Sans objet' };
function docsOf(r, key, arrete) {
  const { mv, solde, opening } = sums(r);
  const live = (pref, excl) => balOf(r, pref, excl).some((b) => Math.abs(b.s) >= 0.01 || b.dm + b.cm >= 0.01);
  const fl = (r.pieces && r.pieces.flags) || {};
  const d = fmtDate(arrete);
  const pharma = ui.fecProfile === 'pharmacie';
  const cy = r.cycles;
  const L = [];
  const add = (id, text, o) => L.push(Object.assign({ id: `${key}:${id}`, text, cat: 'cloture' }, o || {}));
  if (key === 'regul') {
    if (r.meta.hasAN && !ui.fec.prev) add('n1', "FEC ou balance de l'exercice précédent (rapprochement des à-nouveaux)", { cab: true });
    if (balOf(r, ['47'], ['476', '477']).some((b) => Math.abs(b.s) >= 0.01)) add('attente', "Justificatifs des opérations en compte d'attente", { std: true });
  } else if (key === 'treso') {
    if (live(['51'], ['511'])) {
      add('releves', `Relevés bancaires de l'exercice et relevé au ${d} (ou attestation de solde)`, { std: true });
      add('rappro', `État de rapprochement bancaire au ${d}`, { cab: true });
    }
    if (live(['16'])) add('emprunt', `Tableaux d'amortissement des emprunts (capital restant dû au ${d})`, { std: !!fl.emprunt });
    if (balOf(r, ['164', '165', '166', '167']).reduce((s, b) => s + b.cm, 0) >= 1000) add('pret', "Contrats des prêts souscrits dans l'exercice (montant, taux, garanties)");
    if (!pharma && balOf(r, ['511']).some((b) => Math.abs(b.s) >= 0.01)) add('511', `Détail du solde des valeurs à l'encaissement au ${d} (chèques et cartes remis en banque, non encore crédités)`);
    if (live(['53'])) add('caisse', `Procès-verbal de caisse (espèces en caisse au ${d})`, { std: !!fl.caisse });
    if (live(['455'])) add('cca', "Relevé du compte courant d'associé et convention de compte courant éventuelle", { std: !!fl.cca, cat: 'associe' });
    if (live(['50'])) add('vmp', `Relevé du portefeuille de valeurs mobilières au ${d} (valeur au cours de clôture)`);
    if (-mv(['76'], ['765', '786', '796']) >= 1) add('ifu', "Relevés des placements et des produits financiers de l'exercice (intérêts, dividendes, IFU)");
  } else if (key === 'achats') {
    add('fnp', `Factures fournisseurs reçues après le ${d} mais concernant l'exercice (factures non parvenues)`, { std: true });
    if (!pharma && mv(['607']) > 10000) add('rfa', "Remises, ristournes et avoirs de fin d'année à recevoir des fournisseurs");
    if (solde(['4091']) >= 1) add('acomptes', "Bons de commande des acomptes versés aux fournisseurs (4091) : livraison reçue à la clôture ?", { cat: 'questions' });
  } else if (key === 'charges') {
    if (fl.assurance) add('assurance', "Échéanciers des contrats d'assurance (charges constatées d'avance)", { std: true });
    if (fl.leasing) add('leasing', 'Contrats de crédit-bail ou de location financière en cours', { std: true });
    if (live(['6132'])) add('bail', "Bail des locaux et dernier avis d'échéance (loyer, charges, dépôt de garantie)");
    if (live(['6135'])) add('loc', 'Contrats de location de véhicules et de matériel (loyers restant à courir)');
    if (cy.charges.das2.length) add('das2', "Coordonnées (SIRET, adresse) des bénéficiaires d'honoraires et de commissions de plus de 1 200 € (DAS2)", { std: true });
    if (cy.charges.notesFrais.n) add('ndf', "Notes de frais et justificatifs des dépenses avancées par l'associé", { std: true });
    if (balOf(r, ['625']).some((b) => /kilom|\bik\b/i.test(b.lib) && b.dm >= 1)) add('ik', 'Relevé des kilomètres professionnels et carte grise du véhicule utilisé (indemnités kilométriques)');
  } else if (key === 'clients') {
    if (pharma) {
      add('tp', `Balance âgée et état des rejets du tiers payant édités par le LGO au ${d}`, { std: true });
      add('z', "Récapitulatif annuel du chiffre d'affaires par taux de TVA (LGO)", { std: true });
      add('rosp', "Décomptes de l'Assurance maladie : ROSP, rémunérations forfaitaires, gardes et astreintes", { std: true });
    } else {
      add('fae', `Prestations réalisées ou marchandises livrées avant le ${d} et non encore facturées`, { std: true });
      if (live(['411'])) add('agee', `Balance âgée des clients au ${d}`, { cab: true });
      if (cy.clients.invoices) add('cutoff', `Dernière facture émise avant le ${d} et première facture émise après (séparation des exercices)`);
      if (live(['416', '491']) || overdue(r, '411', arrete, fecTerme()).b91[1] > 0) add('douteux', 'Point sur les clients douteux ou en litige : relances, mises en demeure, déclarations de créance (redressement ou liquidation judiciaire)', { cat: 'questions' });
      if (-solde(['4191']) >= 1) add('acomptes', 'Commandes des acomptes reçus des clients (4191) : livraison ou prestation réalisée à la clôture ?', { cat: 'questions' });
      if (r.kpi.ca - cy.clients.customers.reduce((s, x) => s + x.ht, 0) > Math.max(2000, r.kpi.ca * 0.1)) add('z', "Récapitulatif annuel des ventes au comptant (tickets Z de caisse ou logiciel d'encaissement)");
    }
  } else if (key === 'stocks') {
    if (live(['3'], ['39']) || Math.abs(mv(['603'])) >= 0.01) {
      if (pharma) add('inv', `Inventaire valorisé des stocks édité par le LGO au ${d} (prix d'achat, hors périmés)`, { std: true });
      else {
        add('inv', `Inventaire des stocks et en-cours valorisé au ${d}`, { std: !!fl.stock });
        add('methode', 'Méthode de valorisation des stocks et liste des articles obsolètes, abîmés ou vendus à perte (dépréciation)');
      }
      if (live(['33', '34', '35'])) add('encours', `État des travaux et prestations en cours au ${d} (avancement, coûts engagés)`);
    }
  } else if (key === 'immo') {
    if ((r.pieces.immo || []).length) add('fact', "Factures d'acquisition des immobilisations de l'exercice (date de mise en service)", { std: true, cat: 'immo' });
    if (live(['2'])) add('tableau', `Tableau des immobilisations et des amortissements au ${d}`, { cab: true });
    if (balOf(r, ['20', '21', '22', '26']).some((b) => b.cm >= 1) || -mv(['775']) >= 1) add('cession', 'Factures ou actes de cession des immobilisations vendues ou mises au rebut (certificat de cession, carte grise barrée)', { cat: 'immo' });
    if (fl.vehicules) add('cg', 'Cartes grises des véhicules de la société', { std: true });
    if (balOf(r, ['211', '213']).some((b) => b.dm >= 1)) add('acte', "Acte notarié des acquisitions immobilières (ventilation terrain et construction, frais d'acquisition)", { cat: 'immo' });
    if (balOf(r, ['275']).some((b) => b.dm >= 1)) add('depot', "Justificatifs des dépôts de garantie versés dans l'exercice (bail, contrats)", { cat: 'immo' });
    if (live(['26', '271', '272'])) add('titres', "Derniers comptes annuels des sociétés dont les titres sont détenus (valeur d'inventaire)");
  } else if (key === 'social') {
    // Paie faite sur Silae par le cabinet : rien à demander au client, les éditions servent au rapprochement (lues = établies)
    if (live(['641'])) add('jp', "Journal de paie de l'exercice (Silae)", { cab: true, silae: 'journal' });
    if (live(['645', '43'])) add('cotis', "Détail des cotisations de l'exercice (Silae)", { cab: true, silae: 'cotis' });
    if (live(['641', '4282'])) add('repos', `Solde de repos au ${d} (Silae)`, { cab: true, silae: 'repos' });
  } else if (key === 'etat') {
    if (live(['445'])) add('tva', "Déclarations de TVA de l'exercice (CA3 ou CA12) et accusés de dépôt", { cab: true });
    if (live(['444']) || mv(['695']) >= 1) add('is', "Relevés d'acomptes (2571) et de solde (2572) d'impôt sur les sociétés", { cab: true });
    if (fl.taxes) add('cfe', "Avis d'imposition de CFE et de taxe foncière de l'année", { std: true });
    if (live(['44'])) add('cfisc', 'Extrait du compte fiscal professionnel (paiements, crédits et restes à payer)', { cab: true });
    if (mv(['6712']) >= 1) add('amendes', "Avis de contravention, de majoration ou de pénalité de l'exercice", { std: !!cy.charges.amendes.n });
  } else if (key === 'capitaux') {
    const c = clientById(ui.fec.clientId);
    if (!(c && /^(EI|Micro|Particulier)/.test(c.forme || '')) && r.meta.hasAN) add('pv', "Procès-verbal d'approbation des comptes de l'exercice précédent (affectation du résultat)");
    if (balOf(r, ['101']).some((b) => b.dm + b.cm >= 1)) add('statuts', 'Statuts à jour et procès-verbal de la modification du capital (formalités au greffe)');
    if (live(['15'])) add('prov', "Justificatifs des provisions pour risques et charges (litiges, courriers d'avocat, garanties, devis)");
    add('litiges', 'Litiges, contentieux ou événements importants à signaler (provisions éventuelles)', { std: true });
    if (live(['13', '74'])) add('subv', 'Conventions ou notifications des subventions reçues ou à recevoir (conditions, biens financés)');
    if (live(['457'])) add('div', 'Décision de distribution des dividendes et déclaration 2777 (prélèvement à la source)');
  } else if (key === 'autres') {
    if (balOf(r, ['46']).some((b) => Math.abs(b.s) >= 1)) add('divers', 'Justificatifs des soldes des débiteurs et créditeurs divers (46)');
    if (live(['486', '487'])) add('regul', "Détail du calcul des charges et produits constatés d'avance", { cab: true });
    const seuil = ui.fec.seuil || defaultSeuil(r);
    if (mv(['67'], ['6712', '675']) >= seuil / 2 || -mv(['77'], ['775', '777']) >= seuil / 2) add('exc', 'Justificatifs des charges et produits exceptionnels (nature de chaque opération)');
    if (live(['18'])) add('liaison', 'Balances des établissements (comptes de liaison)');
  }
  return L;
}

// Pièces du cycle avec leur statut : celui choisi dans la feuille de travail, sinon celui de la demande de pièces (étape
// demandée ou reçue, reconnue à son libellé).
function cycleDocs(r, key) {
  const list = docsOf(r, key, piecesState().arrete);
  if (!list.length) return list;
  const S = piecesSuivi(r);
  const loc = wpDocStore();
  return list.map((x) => {
    const own = (loc[x.id] || {}).st || '';
    const lab = normLab(x.text);
    const lu = x.silae && silaeControls(r).some((c) => c.doc === x.silae && silaeStore()[c.id]);
    const auto = S.recvLab.has(lab) || lu ? 'recu' : S.pendLab.has(lab) ? 'demande' : '';
    return Object.assign(x, { own, auto, lu: !!lu, st: own || auto });
  });
}
const docsLeft = (r, key) => cycleDocs(r, key).filter((x) => !['recu', 'na'].includes(x.st)).length;

function docsCard(r, key) {
  const list = cycleDocs(r, key);
  if (!list.length) return '';
  const bilan = piecesState().mode === 'bilan';
  return `<section class="card"><h2>Pièces du cycle <span class="count">${list.filter((x) => !['recu', 'na'].includes(x.st)).length}</span></h2>
    <p class="muted small">Documents attendus d'après les comptes mouvementés. Ceux du client sont repris dans la demande de pièces ${bilan ? 'du bilan' : 'quand l\'arrêté est un bilan'} (onglet Pièces à demander), sauf s'ils sont reçus ou sans objet ; le statut de la demande (demandé, reçu) s'affiche ici.</p>
    <ul class="cyc-docs">${list.map((x) => {
      const ST = x.cab ? DOC_ST_CAB : DOC_ST;
      return `<li class="${['recu', 'na'].includes(x.st) ? 'done' : ''}"><span class="cyc-doc-text">${esc(x.text)} <span class="muted small">${x.cab ? 'cabinet' : x.std ? 'client · demandé avec les pièces' : 'client'}</span></span>
        <select data-wpdoc="${esc(x.id)}" aria-label="Statut de la pièce">${Object.entries(ST).map(([v, l]) => `<option value="${v}"${x.own === v ? ' selected' : ''}>${v === '' && x.auto ? (x.lu ? 'Édition lue' : `${DOC_ST[x.auto]} (demande de pièces)`) : l}</option>`).join('')}</select></li>`;
    }).join('')}</ul></section>`;
}

// Pièces des cycles à demander au client avec le bilan (sauf celles que la demande contient déjà).
function dossierPieces(r, arrete, push) {
  const loc = ui.fec && ui.fec.result === r ? wpDocStore() : {};
  Object.keys(CYCLE_DEF).forEach((k) => docsOf(r, k, arrete).filter((x) => !x.cab && !x.std && !['recu', 'na'].includes((loc[x.id] || {}).st)).forEach((x) => push(x.cat, `cyc:${x.id}`, x.text)));
}

const CYCLE_INTRO = {
  regul: "Comptes d'attente soldés et compte 471 vide (aucune écriture), virements internes soldés ; à-nouveaux comparés à la clôture de l'exercice précédent, sens des soldes, doublons et dates atypiques.",
  clients: "Officine : le tiers payant, le chiffre d'affaires et la TVA par taux ont leurs onglets.",
  stocks: "Variation de stock comparée aux stocks d'ouverture et de clôture, inventaire, dépréciation et évolution du stock.",
  immo: 'Investissements, cessions, dotations aux amortissements, immobilisations en cours et crédit-bail.',
  social: "Rapprochement avec les éditions Silae (journal de paie, détail des cotisations, solde de repos), paie de chaque mois, salaires du dernier mois restant dus, cotisations du dernier mois ou du dernier trimestre restant dues, rémunération du dirigeant.",
  etat: 'TVA, impôt sur les sociétés, CFE et autres impôts et taxes, crédit de TVA.',
  capitaux: "Capital, affectation du résultat de l'exercice précédent, réserve légale, subventions et provisions.",
  autres: 'Débiteurs et créditeurs divers, comptes de régularisation, opérations exceptionnelles et autres produits.',
};

// Indicateurs des cycles sans page propre (comparés à N-1 si le FEC précédent est chargé).
function cycleKpis(r, key) {
  const prev = fecPrev();
  const S = sums;
  const t = (label, f, cls) => kpiTile(label, eurK(f(r)), cls, prev ? eurK(f(prev)) : null);
  const side = (x, pref, sg) => x.balance.reduce((s, b) => (pref.some((p) => b.compte.startsWith(p)) && Math.sign(b.s) === sg ? s + Math.abs(b.s) : s), 0);
  const pct = (x, f) => { const v = f(x); return v === null || !Number.isFinite(v) ? '—' : pctFr(v); };
  let tiles = [];
  if (key === 'regul') {
    const err = r.checks.filter((c) => c.level === 'error').length;
    tiles = [kpiTile('Anomalies du fichier', err, err ? 'kpi-late' : ''), kpiTile("Comptes d'attente", eurK(balOf(r, ['47']).reduce((s, b) => s + Math.abs(b.s), 0))),
      kpiTile('Virements internes', eurK(S(r).solde(['58']))), kpiTile('Écritures', r.meta.entries.toLocaleString('fr-FR')), kpiTile('Journaux', r.meta.journalsCount), kpiTile('Comptes', r.meta.accounts.toLocaleString('fr-FR'))];
  } else if (key === 'clients') {
    tiles = [t("Chiffre d'affaires", (x) => x.kpi.ca), t('Créances clients', (x) => S(x).solde(['41'], ['419']))];
  } else if (key === 'stocks') {
    const tm = (x) => ratios(x).tauxMarge;
    tiles = [t('Stock final', (x) => S(x).solde(['3'], ['39'])), kpiTile('Stock initial', eurK(S(r).opening(['3'], ['39']))), t('Variation de stock (603)', (x) => S(x).mv(['603'])),
      t('Dépréciation (39)', (x) => -S(x).solde(['39'])), kpiTile('Taux de marge', pct(r, tm), '', prev ? pct(prev, tm) : null), t('Achats consommés', (x) => S(x).mv(['601', '602', '603', '607']))];
  } else if (key === 'immo') {
    tiles = [t('Valeur brute', (x) => S(x).solde(['2'], ['28', '29'])), t('Amortissements et dépréciations', (x) => -S(x).solde(['28', '29'])), t('Valeur nette', (x) => S(x).solde(['2'])),
      t('Acquisitions (débits)', (x) => balOf(x, ['20', '21', '22', '23', '26', '27']).reduce((s, b) => s + b.dm, 0)), t('Dotations (6811)', (x) => S(x).mv(['6811'])), t('Prix de cession (775)', (x) => -S(x).mv(['775']))];
  } else if (key === 'social') {
    const sal = (x) => S(x).mv(['641', '644']), ch = (x) => S(x).mv(['645', '646', '647', '648']);
    tiles = [t('Rémunérations (641, 644)', sal), t('Charges sociales', ch), kpiTile('Taux de charges', pct(r, (x) => (sal(x) > 0 ? ch(x) / sal(x) : null)), '', prev ? pct(prev, (x) => (sal(x) > 0 ? ch(x) / sal(x) : null)) : null),
      t('Dettes sociales', (x) => -S(x).solde(['42', '43'])), kpiTile('Mois de paie', Object.keys(r.pieces.payroll || {}).length), t('Dirigeant (644)', (x) => S(x).mv(['644']))];
  } else if (key === 'etat') {
    tiles = [t('TVA due (445)', (x) => -S(x).solde(['445'])), t('Impôt sur les sociétés', (x) => S(x).mv(['695', '696'])), t('Impôts et taxes (63)', (x) => S(x).mv(['63'])),
      t("Dettes envers l'État", (x) => side(x, ['44'], -1)), t("Créances sur l'État", (x) => side(x, ['44'], 1)), t('Amendes (6712)', (x) => S(x).mv(['6712']))];
  } else if (key === 'capitaux') {
    tiles = [t('Capital', (x) => -S(x).solde(['101'])), t('Capitaux propres', (x) => x.bilan.passif[0][1]), t('Résultat', (x) => x.kpi.resultat, r.kpi.resultat < 0 ? 'kpi-late' : ''),
      t('Report à nouveau', (x) => -S(x).solde(['11'])), t("Subventions d'investissement", (x) => -S(x).solde(['13'])), t('Provisions (15)', (x) => -S(x).solde(['15']))];
  } else if (key === 'autres') {
    tiles = [t('Débiteurs divers', (x) => side(x, ['46'], 1)), t('Créditeurs divers', (x) => side(x, ['46'], -1)), t("Charges constatées d'avance", (x) => S(x).solde(['486'])),
      t("Produits constatés d'avance", (x) => -S(x).solde(['487'])), t('Charges exceptionnelles', (x) => S(x).mv(['67'])), t('Produits exceptionnels', (x) => -S(x).mv(['77']))];
  }
  return tiles.length ? `<div class="kpis fec-kpis">${tiles.join('')}</div>` : '';
}

function cycleBanner(r, key) {
  if (key === 'regul') {
    const err = r.checks.filter((c) => c.level === 'error').length, warn = r.checks.filter((c) => c.level === 'warn').length;
    return `<div class="banner ${err ? 'warn' : 'info'}"><span><strong>Conformité du fichier</strong> (art. A47 A-1 du LPF) : ${err ? `${err} anomalie(s)` : 'aucune anomalie'}${warn ? `, ${warn} point(s) à vérifier` : ''} sur ${r.checks.length} contrôles.</span><button class="btn small" data-action="fec-tab" data-tab="conformite">Voir le détail</button></div>`;
  }
  if (key === 'etat' && r.cycles.tva && Object.keys(r.cycles.tva.months).length) return '<div class="banner info"><span>Déclarations de TVA, TVA collectée et déductible de l\'exercice : onglet <strong>Contrôle TVA</strong>.</span><button class="btn small" data-action="fec-tab" data-tab="tvarev">Ouvrir</button></div>';
  if (key === 'clients') return '<div class="banner info"><span>Officine : encours et rejets du tiers payant, chiffre d\'affaires et TVA par taux.</span><button class="btn small" data-action="fec-tab" data-tab="tp">Tiers payant</button><button class="btn small" data-action="fec-tab" data-tab="catva">CA &amp; TVA</button></div>';
  return '';
}

// Page d'un cycle : pages détaillées de B à E, page commune pour les autres (et pour E en officine).
const CYCLE_VIEWS = { treso: viewTreso, achats: viewAchats, charges: viewCharges, clients: viewClients };
function viewCycle(key) {
  const r = ui.fec.result;
  ui.fec.lastCycle = key;
  if (CYCLE_VIEWS[key] && !(key === 'clients' && ui.fecProfile === 'pharmacie')) return CYCLE_VIEWS[key]();
  return `${cycleKpis(r, key)}${cycleBanner(r, key)}${key === 'social' ? silaeCard(r) : ''}${cycleHead(key, CYCLE_INTRO[key])}`;
}

// ---------- Cycle H : rapprochement avec les éditions de paie Silae ----------

// Chaque édition est déposée avec son bouton (le titre du PDF n'est pas lu) et rapprochée des comptes du dossier :
//   - journal de paie : rémunération du personnel (comptes 641 du FEC hors congés payés : 641, 6411, 64111…) avec le brut ;
//   - détail des cotisations : chaque compte 645 hors congés payés (un par organisme : URSSAF, Klesia…) avec la part patronale
//     de son organisme, retrouvé d'après le libellé du compte ;
//   - solde de repos : congés payés à payer (4282) et charges sociales sur congés payés (4382).
// Congés payés : 6412 et 6452, ou comptes dont le libellé cite les congés. Les PDF sont lus sur l'appareil et ne sont pas
// conservés : seuls les montants retenus sont enregistrés. Ligne choisie à la main : retenue pour le cabinet (journal de
// paie, solde de repos : même mise en page partout) ou pour le dossier (organisme de chaque compte 645).
const SILAE_DOCS = { journal: 'Journal de paie', cotis: 'Détail des cotisations', repos: 'Solde de repos' };
const SILAE_ED = { journal: 'journal de paie', cotis: 'détail des cotisations', repos: 'solde de repos' };
const silaeCp = (b, p) => b.compte.startsWith(p + '2') || /cong/i.test(b.lib);

// Contrôles du dossier, d'après ses comptes : { id, doc, label, comptes, fec }.
function silaeControls(r) {
  const out = [];
  const rem = balOf(r, ['641']).filter((b) => !silaeCp(b, '641') && b.dm + b.cm >= 0.01);
  if (rem.length) out.push({ id: 'brut', doc: 'journal', label: 'Rémunération du personnel', comptes: rem.map((b) => b.compte), fec: rem.reduce((t, b) => t + b.dm - b.cm, 0) });
  balOf(r, ['645']).filter((b) => !silaeCp(b, '645') && b.dm + b.cm >= 0.01)
    .forEach((b) => out.push({ id: 'org:' + b.compte, doc: 'cotis', label: b.lib, comptes: [b.compte], fec: b.dm - b.cm, org: true }));
  const sal = balOf(r, ['641']).length;
  [['cp', '4282', 'Congés payés à payer'], ['cpch', '4382', 'Charges sociales sur congés payés']].forEach(([id, p, label]) => {
    const l = balOf(r, [p]);
    if (l.length || sal) out.push({ id, doc: 'repos', label, comptes: l.map((b) => b.compte), fec: Math.abs(l.reduce((t, b) => t + b.s, 0)) });
  });
  return out.map((c) => Object.assign(c, { fec: Math.round(c.fec * 100) / 100 }));
}
const silaeEcart = (c, cur) => (cur ? Math.round((c.fec - cur.v) * 100) / 100 : null);
const silaeName = (c) => (c.org ? `${c.comptes[0]} ${c.label}` : c.label);

function silaeChecks(r, out) {
  const sil = silaeStore();
  const ctl = silaeControls(r);
  const read = ctl.filter((c) => sil[c.id]);
  if (!read.length) {
    if (ctl.some((c) => c.doc === 'journal')) out.add('info', 'Rapprochement avec Silae à faire', 'Déposez le journal de paie, le détail des cotisations et le solde de repos (PDF Silae) dans le cadre « Rapprochement avec Silae » : chaque compte est comparé à l\'édition.');
    return;
  }
  read.forEach((c) => {
    const cur = sil[c.id], e = silaeEcart(c, cur);
    const ligne = `« ${[cur.group, cur.lab].filter(Boolean).join(' · ')}${cur.col ? ` · ${cur.col}` : ''} »`;
    if (Math.abs(e) >= 1) out.add('warn', `${silaeName(c)} : écart avec le ${SILAE_ED[c.doc]} Silae`, `${c.comptes.join(', ') || 'aucun compte'} : ${eur(c.fec)} € en comptabilité, ${eur(cur.v)} € dans l'édition (${ligne}) : écart de ${eur(e)} €.`);
    else out.add('ok', `${silaeName(c)} : conforme au ${SILAE_ED[c.doc]} Silae`, `${eur(c.fec)} € (${c.comptes.join(', ')}).`);
  });
}

// Repère d'une ligne (libellé, groupe, colonne), comparable d'une édition à l'autre ; ligne retrouvée par ce repère.
const silaeMemo = (row, a) => ({ lab: SilaePdf.key(row.lab), group: SilaePdf.key(row.group), col: SilaePdf.key(a.col) });
function silaeFind(rows, m) {
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    if (SilaePdf.key(row.lab) !== m.lab || (m.group !== undefined && SilaePdf.key(row.group) !== m.group)) continue;
    const ai = row.amounts.findIndex((a) => SilaePdf.key(a.col) === m.col);
    if (ai >= 0) return { row: ri, amount: ai };
  }
  return null;
}

// Organisme d'un compte 645 dans le détail des cotisations : mots du libellé du compte (URSSAF, Klesia…) retrouvés dans le
// libellé de la ligne ou de son groupe ; ligne de total de l'organisme de préférence ; montant de la colonne patronale.
const ORG_STOP = new Set(['cotisations', 'cotisation', 'charges', 'charge', 'sociales', 'sociale', 'social', 'patronales', 'patronale', 'salariales',
  'salariale', 'organismes', 'organisme', 'caisse', 'caisses', 'total', 'part', 'des', 'les', 'aux', 'sur', 'pour', 'avec']);
const orgWords = (s) => SilaePdf.key(s).split(' ').filter((w) => w.length >= 3 && !ORG_STOP.has(w));
const patCol = (row) => { const i = row.amounts.findIndex((a) => /patron|employeur/.test(SilaePdf.key(a.col))); return i >= 0 ? i : row.amounts.length - 1; };
function orgPick(rows, lib) {
  const words = orgWords(lib);
  let best = null;
  rows.forEach((row, ri) => {
    const nl = SilaePdf.key(row.lab);
    if (/total (general|des cotisations|employeur|salari)/.test(nl)) return;
    const txt = new Set(orgWords(`${row.lab} ${row.group || ''}`));
    const hit = words.filter((w) => txt.has(w)).length;
    if (!hit) return;
    const ai = patCol(row), v = row.amounts[ai].v;
    // La ligne de total de l'organisme l'emporte sur ses lignes de cotisations
    const sc = (/total/.test(nl) ? 100 : 0) + hit * 10;
    if (!best || sc > best.sc || (sc === best.sc && Math.abs(v) > Math.abs(best.v))) best = { row: ri, amount: ai, sc, v };
  });
  return best;
}

// Montant retenu pour un contrôle ; `remember` : choix fait à la main. Les congés payés (un seul compte 4282 ou 4382)
// remplissent aussi la colonne « Selon pièce » des comptes du cycle.
function silaeSet(c, d, ri, ai, remember) {
  const row = d.rows[ri], a = row.amounts[ai];
  silaeStore()[c.id] = { v: a.v, lab: row.lab, group: row.group || '', col: a.col, file: d.file };
  if (remember) {
    if (c.org) silaeDossierMap()[c.comptes[0]] = silaeMemo(row, a);
    else (data.settings.silaeMap = data.settings.silaeMap || {})[c.id] = silaeMemo(row, a);
  }
  if (c.doc === 'repos' && c.comptes.length === 1) wpSoldeStore()[c.comptes[0]] = Math.abs(a.v);
}

async function silaeRead(doc, file) {
  const f = ui.fec, r = f.result;
  if (!file || !SILAE_DOCS[doc]) return;
  f.silae = f.silae || {};
  f.silaeMsg = [];
  try {
    const d = SilaePdf.parse(await PdfReader.read(await file.arrayBuffer()), PdfReader);
    if (!d.rows.length) f.silaeMsg.push({ ok: false, t: `${file.name} : aucun montant lu (PDF scanné, sans texte ?).` });
    else {
      f.silae[doc] = { file: file.name, rows: d.rows };
      const map = data.settings.silaeMap || {}, dmap = silaeDossierMap();
      const got = silaeControls(r).filter((c) => c.doc === doc).map((c) => {
        // Ligne choisie la dernière fois, sinon reconnue (intitulés habituels ; organisme d'après le libellé du compte)
        const memo = c.org ? dmap[c.comptes[0]] : map[c.id];
        const p = (memo && silaeFind(d.rows, memo)) || (c.org ? orgPick(d.rows, c.label) : SilaePdf.pick(d.rows, c.id));
        if (!p) { delete silaeStore()[c.id]; return `${silaeName(c)} : ligne à choisir`; }
        silaeSet(c, f.silae[doc], p.row, p.amount, false);
        return `${silaeName(c)} ${eur(silaeStore()[c.id].v)} €`;
      });
      f.silaeMsg.push({ ok: true, t: `${file.name} lu comme ${SILAE_DOCS[doc].toLowerCase()} — ${got.join(' ; ') || 'aucun compte à rapprocher'}.` });
    }
  } catch (e) {
    f.silaeMsg.push({ ok: false, t: `${file.name} : ${e.message || e}` });
  }
  wpSave();
  refresh();
}

function silaeCard(r) {
  const f = ui.fec, sil = silaeStore(), docs = f.silae || {}, ctl = silaeControls(r);
  const lineTxt = (row, a) => `${[row.group, row.lab || '(sans libellé)'].filter(Boolean).join(' · ')}${a.col ? ` · ${a.col}` : ''} : ${eur(a.v)}`;
  const src = (c, d) => {
    const cur = sil[c.id];
    if (!d) return cur ? `${esc([cur.group, cur.lab].filter(Boolean).join(' · '))}${cur.col ? ` · ${esc(cur.col)}` : ''}<div class="muted small">${esc(cur.file)}</div>` : '<span class="muted small">PDF non déposé</span>';
    // Organisme : la colonne patronale de chaque ligne, celles qui citent l'organisme d'abord ; sinon lignes les plus probables
    const list = c.org
      ? d.rows.map((row, ri) => ({ row: ri, amount: patCol(row), sc: orgWords(`${row.lab} ${row.group || ''}`).filter((w) => orgWords(c.label).includes(w)).length })).sort((x, y) => y.sc - x.sc).slice(0, 120)
      : SilaePdf.candidates(d.rows, c.id);
    return `<select data-silae="${esc(c.id)}" aria-label="Ligne de l'édition : ${esc(silaeName(c))}"><option value="">— Choisir la ligne —</option>${list.map((x) => {
      const row = d.rows[x.row], a = row.amounts[x.amount];
      const on = cur && cur.file === d.file && cur.lab === row.lab && (cur.group || '') === (row.group || '') && cur.col === a.col && cur.v === a.v;
      return `<option value="${x.row}:${x.amount}"${on ? ' selected' : ''}>${esc(lineTxt(row, a).slice(0, 120))}</option>`;
    }).join('')}</select>`;
  };
  const block = (doc) => {
    const d = docs[doc];
    const rows = ctl.filter((c) => c.doc === doc).map((c) => {
      const cur = sil[c.id], e = silaeEcart(c, cur);
      return `<tr><td>${esc(c.comptes.join(', ') || '—')}</td><td>${esc(c.label)}</td><td>${eur(c.fec)}</td><td class="silae-src">${src(c, d)}</td><td>${cur ? eur(cur.v) : '—'}</td>
        <td class="${e === null ? '' : Math.abs(e) < 1 ? 'ecart-ok' : 'cred'}">${e === null ? '' : Math.abs(e) < 1 ? '0' : `${e > 0 ? '+' : '−'}${eur(Math.abs(e))}`}</td></tr>`;
    }).join('');
    return `<div class="silae-doc"><h3>${SILAE_DOCS[doc]} <button class="btn small" data-action="silae-pick" data-doc="${doc}">${d ? 'Remplacer le PDF' : 'Déposer le PDF'}</button>${d ? `<span class="muted small">${esc(d.file)}</span>` : ''}</h3>
      ${rows ? `<div class="grid-wrap"><table class="dtable num silae"><thead><tr><th>Compte</th><th>Libellé</th><th>Comptabilité</th><th>Ligne de l'édition</th><th>Édition</th><th>Écart</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted small">Aucun compte à rapprocher.</p>'}</div>`;
  };
  return `<section class="card"><h2>Rapprochement avec Silae</h2>
    <p class="muted small">Déposez chaque édition avec son bouton : journal de paie et détail des cotisations de l'exercice, solde de repos à la clôture. Chaque compte est comparé à sa ligne : rémunération du personnel (641 hors congés payés) au brut du journal de paie, chaque compte 645 à la part patronale de son organisme (retrouvé d'après le libellé du compte), 4282 et 4382 au solde de repos. Si la ligne proposée n'est pas la bonne, choisissez-en une autre : le choix est retenu pour les éditions suivantes. Les PDF sont lus sur cet appareil et ne sont pas conservés.</p>
    ${(f.silaeMsg || []).map((m) => `<div class="banner ${m.ok ? 'info' : 'warn'}"><span>${esc(m.t)}</span></div>`).join('')}
    ${Object.keys(SILAE_DOCS).map(block).join('')}</section>`;
}

// ---------- Justificatifs (archive FEC + pièces) ----------

const justifOk = (r) => !!(r.cycles && r.cycles.justif && r.cycles.justif.reliable);
const JUSTIF_KINDS = { achat: 'Factures fournisseurs', vente: 'Factures de vente', direct: 'Dépenses payées directement' };

function justifCard(r) {
  const j = r.cycles && r.cycles.justif;
  if (!j) return '';
  const pc = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—');
  return `<section class="card"><h2>Justificatifs de l'archive <span class="badge beta">bêta</span></h2>
    <p class="muted small">${j.docs.toLocaleString('fr-FR')} fichier(s) dans l'archive${j.attCol ? `, colonne « ${esc(j.attCol)} » du FEC utilisée` : ''}. Chaque écriture est rapprochée d'un justificatif par ${j.attCol ? 'le nom de pièce jointe indiqué dans le FEC' : 'son n° de pièce, retrouvé dans le nom du fichier'} ; seuls les noms des fichiers sont lus.</p>
    <div class="grid-wrap"><table class="dtable num"><thead><tr><th>Écritures</th><th></th><th>Total</th><th>Avec justificatif</th><th>Sans justificatif</th><th>Non rapprochables</th></tr></thead>
    <tbody>${Object.entries(JUSTIF_KINDS).map(([k, l]) => { const x = j.kinds[k]; return `<tr><td>${l}</td><td></td><td>${x.n}</td><td>${x.ok} <span class="muted small">${pc(x.ok, x.n - x.unk)}</span></td><td class="${x.n - x.unk - x.ok ? 'cred' : ''}">${x.n - x.unk - x.ok}</td><td>${x.unk || ''}</td></tr>`; }).join('')}</tbody></table></div>
    ${j.reliable ? `<p class="muted small">Les ${j.missingTotal} écriture(s) sans justificatif sont reprises une par une dans les <strong>pièces à demander</strong> (au client ou directement au fournisseur).</p>`
      : `<div class="banner warn"><span><strong>Rapprochement peu fiable</strong> : ${j.judged ? `seulement ${j.ok} pièce(s) sur ${j.judged} retrouvée(s)` : 'aucun n° de pièce exploitable'}. Les noms des fichiers ne semblent pas reprendre le n° de pièce des écritures, les pièces à demander restent donc établies sans l'archive. Exemples de fichiers : ${j.samples.docs.map((x) => `« ${esc(x)} »`).join(', ') || '—'} ; exemples de n° de pièce : ${j.samples.pieces.map((x) => `« ${esc(x)} »`).join(', ') || '—'}. Indiquez à votre interlocuteur comment Pennylane nomme les fichiers pour adapter le rapprochement.</span></div>`}
  </section>`;
}

// Écritures sans justificatif sur la période, regroupées par tiers ; `flt` écarte les pièces déjà reçues, déjà demandées ou
// écartées (voir piecesSuivi) ; `opts.charges` : dépenses payées directement des charges externes seules (61, 62) ;
// `opts.paiements` : dépenses payées directement seules (rien des journaux d'achats et de ventes).
function justifPieces(r, push, from, to, flt = ALL_PIECES, opts = {}) {
  if (!justifOk(r)) return;
  const d = fmtDate;
  const K = pieceKeys(r).jus;
  const list = r.cycles.justif.missing.map((x, i) => ({ x, keys: K[i] })).filter(({ x, keys }) => x.date >= from && x.date <= to && flt.ok(keys));
  const desc = (x) => `${x.avoir ? 'avoir' : 'facture'}${x.piece ? ` n° ${x.piece}` : ''} du ${d(x.date)} (${eur(Math.abs(x.amt))} €)`;
  const groups = new Map();
  list.filter(({ x }) => x.kind !== 'direct' && !opts.paiements).forEach((y) => { const k = y.x.kind + '|' + y.x.num; (groups.get(k) || groups.set(k, []).get(k)).push(y); });
  groups.forEach((l) => {
    const x0 = l[0].x;
    const items = l.slice(0, 12).map(({ x }) => desc(x)).join(', ') + (l.length > 12 ? ` et ${l.length - 12} autre(s)` : '');
    // Liste Excel : le type de pièce, puis le libellé de chaque écriture (avec son n° de pièce)
    const av = l.filter(({ x }) => x.avoir).length;
    const pl = l.length > 1 ? 's' : '';
    const type = av === l.length ? `Avoir${pl}` : av ? 'Factures et avoirs' : `Facture${pl}`;
    const extra = { keys: l.flatMap((y) => y.keys), doc: type, tiers: `${x0.kind === 'achat' ? '401' : '411'}|${x0.num}`, tlib: x0.tlib,
      ops: l.map(({ x }) => ({ date: x.date, amt: Math.abs(x.amt), doc: x.avoir ? 'Avoir' : 'Facture', lib: x.piece && !String(x.lib).includes(x.piece) ? `${x.lib} (pièce n° ${x.piece})` : x.lib })) };
    if (x0.kind === 'achat') push('achats', `jm:${x0.num}`, `${l.length > 1 ? 'Factures' : 'Facture'} ${x0.tlib} : ${items}`, extra);
    else push('ventes', `jv:${x0.num}`, `${l.length > 1 ? 'Factures de vente' : 'Facture de vente'} à ${x0.tlib} : ${items}`, extra);
  });
  // Dépenses payées directement sans justificatif : les 200 plus récentes de la période
  list.filter(({ x }) => x.kind === 'direct' && (!opts.charges || /^6[12]/.test(x.compte || ''))).sort((a, b) => b.x.date.localeCompare(a.x.date)).slice(0, 200).forEach(({ x, keys }) => push('justif', `jd:${keys[0]}`, `Justificatif « ${x.lib} » du ${d(x.date)} (${eur(x.amt)} €)`,
    { doc: 'Justificatif', ops: [{ date: x.date, amt: x.amt, lib: x.lib }], keys }));
}

// Pièces et questions issues des cycles.
function cyclePieces(r, mode, arrete, push) {
  if (!r.cycles) return;
  const cy = r.cycles;
  const d = fmtDate;
  const bilan = mode === 'bilan';
  // (numéros de facture manquants : numberingPieces, commun à la demande mensuelle)
  const item = (x) => `« ${x.lib} » du ${d(x.date)} (${eur(Math.abs(x.amt))} €)`;
  const OPS = 'Opérations en espèces de 1 000 € ou plus', PERSO = 'Dépenses à caractère personnel possibles';
  cy.treso.cash.items.filter((x) => x.date <= arrete && !memoHas('treso', OPS, x.lib)).slice(0, 10).forEach((x, i) => push('caisse', 'esp:' + i, `Justificatif de l'opération en espèces ${item(x)} : paiement en espèces limité à 1 000 €`,
    { doc: "Justificatif de l'opération en espèces (paiement en espèces limité à 1 000 €)", ops: [{ date: x.date, amt: Math.abs(x.amt), lib: x.lib }] }));
  (cy.charges.perso.groups || []).filter((g) => g.first <= arrete && !memoHas('charges', PERSO, g.lib)).slice(0, 10).forEach((g, i) => push('questions', 'perso:' + i, g.n === 1
    ? `Caractère professionnel de la dépense « ${g.lib} » du ${d(g.first)} (${eur(g.total)} €)`
    : `Caractère professionnel des dépenses « ${g.lib} » : ${g.n} paiements du ${d(g.first)} au ${d(g.last)} (${eur(g.total)} €)`));
  if (cy.charges.amendes.n && !memoHas('charges', 'Amendes et pénalités en charges déductibles', '*')) push('questions', 'amendes', `Avis de contravention ou de pénalité réglés par l'entreprise (${cy.charges.amendes.n}, ${eur(cy.charges.amendes.total)} €) : nature et, pour les contraventions, désignation du conducteur`);
  if (cy.charges.notesFrais.n && !memoHas('charges', "Dépenses avancées par l'associé", '*')) push('justif', 'ndf', `Notes de frais et justificatifs des ${cy.charges.notesFrais.n} dépense(s) avancée(s) par l'associé (${eur(cy.charges.notesFrais.total)} €)`);
  if (bilan) {
    cy.charges.cca.slice(0, 8).forEach((x, i) => push('cloture', 'cca:' + i, `Facture « ${x.label} » du ${d(x.date)} (${eur(x.amt)} €) : période couverte, pour les charges constatées d'avance`));
    const re = ignoredRe();
    const das2 = cy.charges.das2.filter((b) => !re || !re.test(norm(b.benef)));
    if (das2.length && !memoHas('charges', 'DAS2 : 0 bénéficiaire(s) de plus de 1 200 €', '*')) push('questions', 'das2', `Pour la DAS2 : SIRET et adresse de ${das2.slice(0, 8).map((b) => b.benef).join(', ')}${das2.length > 8 ? '…' : ''}`);
    dossierPieces(r, arrete, push);
  }
}
