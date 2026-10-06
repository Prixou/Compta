/*
 * Suivi Dossiers — Cycles de révision et justificatifs.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- Cycles de révision : achats, charges externes, clients, trésorerie ----------

const CYCLES = { achats: 'Achats et fournisseurs', charges: 'Charges externes', clients: 'Ventes et clients', treso: 'Trésorerie' };
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

// Points de révision généraux repris dans un cycle (non recomptés dans les totaux).
function linkedAlerts(r, out, labels) {
  fecAlerts(r).filter((a) => labels.includes(a.label)).forEach((a) => out.push(Object.assign({}, a, { linked: true })));
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
  linkedAlerts(r, out, ['Fournisseurs débiteurs']);
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

function chkCharges(r, ref, prev) {
  const ch = r.cycles.charges;
  const out = checksList();
  const { mv, solde } = sums(r);
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
  const ext = mv(['61', '62']);
  const direct = ch.accounts.reduce((s, a) => s + Math.max(0, a.direct), 0);
  if (direct > 2000 && direct > ext * 0.3) out.add('info', 'Charges externes payées sans facture fournisseur', `${eur(direct, 0)} € (${pctFr(direct / ext, 0)}) comptabilisés directement depuis la banque : les factures correspondantes doivent être au dossier.`);
  if (prev && r.kpi.ca > 0 && prev.kpi.ca > 0) {
    const n = ext / r.kpi.ca, p = sums(prev).mv(['61', '62']) / prev.kpi.ca;
    if (Math.abs(n - p) >= 0.05) out.add('info', `Charges externes : ${pctFr(p)} → ${pctFr(n)} du chiffre d'affaires`, 'Variation significative du poids des charges externes : voir les comptes en hausse ci-dessous.');
  }
  return out;
}

function chkClients(r, ref, prev, terme) {
  const cl = r.cycles.clients;
  const out = checksList();
  const { solde } = sums(r);
  linkedAlerts(r, out, ['Clients créditeurs']);
  mispostCheck(r, out, '411');
  const nb = cl.numbering.filter((g) => !g.sparse);
  if (!cl.numbering.length && cl.invoices >= 10) out.add('info', 'Numérotation des factures de vente non contrôlable', 'Les n° de pièce des factures de vente ne se terminent pas par un numéro.');
  else if (cl.numbering.length && !nb.length) out.add('info', 'Numérotation des factures non exploitable', `Les n° de pièce (${cl.numbering[0].first}…) semblent être des n° d'écriture : le n° de facture n'est pas repris dans le FEC.`);
  nb.forEach((g) => {
    const name = `${g.first} à ${g.last}`;
    if (g.missing) out.add('warn', `Factures de vente manquantes dans la numérotation (${name})`, `${g.missing} numéro(s) absent(s) : factures annulées (à justifier), non saisies ou émises par un autre outil ? La numérotation doit être continue (art. 242 nonies A de l'annexe II du CGI).`, g.ranges);
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

function chkTreso(r, ref) {
  const t = r.cycles.treso;
  const out = checksList();
  const { mv } = sums(r);
  const pharma = ui.fecProfile === 'pharmacie';
  linkedAlerts(r, out, ['Caisse créditrice', 'Banque créditrice en fin de période']);
  if (pharma) mispostCheck(r, out, '411');
  const banks = t.accounts.filter((a) => /^51[2-9]/.test(a.compte));
  banks.filter((a) => a.negDays > 0).forEach((a) => out.add(a.negDays > 30 ? 'warn' : 'info', `Découvert : ${a.lib || a.compte}`, `${a.negDays} jour(s) à découvert en comptabilité, plus bas ${eur(a.min)} € le ${fmtDate(a.minDate)} : autorisation de découvert, agios et rapprochement à vérifier.`));
  if (banks.length && !banks.some((a) => a.negDays)) out.add('ok', 'Aucun découvert bancaire en comptabilité', `${banks.length} compte(s) bancaire(s) toujours créditeurs.`);
  if (t.cash.n) out.add('warn', 'Opérations en espèces de 1 000 € ou plus', `${t.cash.n} opération(s), ${eur(t.cash.total, 0)} € : paiement en espèces limité à 1 000 € entre professionnels et avec les particuliers résidents (art. L112-6 et D112-3 du code monétaire et financier), amende jusqu'à 5 % des sommes.`, t.cash.ex, { full: t.cash.ex.length >= t.cash.n });
  else if (t.accounts.some((a) => a.compte.startsWith('53'))) out.add('ok', 'Pas de paiement en espèces de 1 000 € ou plus', '');
  const caisses = t.accounts.filter((a) => a.compte.startsWith('53'));
  const totCaisse = caisses.reduce((s, a) => s + a.solde, 0);
  if (totCaisse > Math.max(3000, r.kpi.ca / 24)) out.add('info', `Solde de caisse élevé : ${eur(totCaisse, 0)} €`, "Plus de deux semaines de chiffre d'affaires en espèces : procès-verbal de caisse, remises en banque non comptabilisées ?");
  caisses.filter((a) => a.last && Math.abs(a.solde) >= 1 && daysUntilFrom(a.last, ref) > 60).forEach((a) => out.add('info', `Caisse sans mouvement depuis le ${fmtDate(a.last)}`, `${a.lib} : solde de ${eur(a.solde)} € inchangé : espèces réellement détenues ?`));
  const vi = t.accounts.filter((a) => a.compte.startsWith('58') && Math.abs(a.solde) >= 0.01);
  if (vi.length) out.add('warn', 'Virements internes non soldés', 'Le compte 58 doit être soldé : virement de compte à compte dont une seule moitié est comptabilisée.', vi.map((a) => `${a.compte} ${a.lib} : ${eur(a.solde)} €`));
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

// Contrôles des quatre cycles (mis en cache par résultat et paramètres).
function cycleChecks(r) {
  if (!r || !r.cycles) return null;
  const ref = pharmaRef(r);
  const prev = fecPrev();
  const terme = fecTerme();
  const key = [ref, ui.fecProfile, prev ? prev.meta.fileName : '', terme, r.alerts.length, ui.fec.clientId || '', Object.keys(wpMemo()).length].join('|');
  if (r._cc && r._cc.key === key) return r._cc.val;
  const val = {
    achats: applyMemo(chkAchats(r, ref, prev, terme), 'achats'),
    charges: applyMemo(chkCharges(r, ref, prev), 'charges'),
    clients: ui.fecProfile === 'pharmacie' ? [] : applyMemo(chkClients(r, ref, prev, terme), 'clients'),
    treso: applyMemo(chkTreso(r, ref), 'treso'),
  };
  Object.defineProperty(r, '_cc', { value: { key, val }, configurable: true, writable: true, enumerable: false });
  return val;
}

// Points propres aux cycles (hors points généraux déjà repris), avec le nom du cycle.
function cyclePoints(r) {
  const cc = cycleChecks(r);
  if (!cc) return [];
  return Object.keys(cc).flatMap((k) => cc[k].filter((x) => !x.linked).map((x) => Object.assign({}, x, { cycle: k })));
}

const kpiTile = (label, value, cls, n1) => `<div class="kpi ${cls || ''}"><strong>${value}</strong><span>${label}</span>${n1 !== undefined && n1 !== null ? `<em>N-1 : ${n1}</em>` : ''}</div>`;
const daysTxt = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${Math.round(v)} j`);

function cycleHead(key, intro) {
  const list = cycleChecks(ui.fec.result)[key];
  const n = (lvl) => list.filter((x) => x.level === lvl).length;
  return `<section class="card"><h2>Contrôles — ${esc(CYCLES[key])} <span class="count">${wpProgress(key, list).left}</span></h2>
    <p class="muted small">${intro}</p>${wpCycleBar(key, list)}${wpCheckList(list, key)}</section>`;
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
      <div class="grid-wrap"><table class="dtable num"><thead><tr><th>Série</th><th>Factures</th><th>Du n°</th><th>Au n°</th><th>Manquants</th><th>Doublons</th></tr></thead>
      <tbody>${cl.numbering.map((g) => `<tr><td>${esc(g.prefix || '(sans préfixe)')}${g.sparse ? ' <span class="muted small">n° d\'écriture ?</span>' : ''}</td><td>${g.count}</td><td>${g.first}</td><td>${g.last}</td><td>${g.sparse ? '—' : g.missing}</td><td>${g.dups.length || ''}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
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
    ${cycleHead('treso', "Découverts, caisse, espèces de 1 000 € ou plus, virements internes, comptes dormants, flux avec les associés et comptes d'attente. Le rapprochement avec le relevé se fait dans l'onglet Rapprochement.")}
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

// Carte de la synthèse : un accès par cycle avec le nombre de points.
function cyclesCard(r) {
  const cc = cycleChecks(r);
  if (!cc) return '';
  const keys = Object.keys(CYCLES).filter((k) => k !== 'clients' || ui.fecProfile !== 'pharmacie');
  return `<section class="card"><div class="card-head"><h2>Cycles de révision</h2><button class="btn small" data-action="wp-print">Dossier de travail (PDF)</button></div><div class="kpis fec-kpis cycle-tiles">${keys.map((k) => {
    const pg = wpProgress(k, cc[k]);
    const rev = wpStore().cycles[k];
    return `<button class="kpi cycle-tile ${pg.left ? 'kpi-wait' : ''}" data-action="fec-tab" data-tab="${k}"><strong>${pg.left}</strong><span>${esc(CYCLES[k])}</span><em>${pg.total ? `${pg.done} / ${pg.total} traité(s)${pg.wait ? ` · ${pg.wait} en attente` : ''}` : 'rien à signaler'}${rev ? ` · revu ✓` : ''}</em></button>`;
  }).join('')}</div></section>`;
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

// Écritures sans justificatif sur la période, regroupées par tiers.
function justifPieces(r, push, from, to, scope) {
  if (!justifOk(r)) return;
  const d = fmtDate;
  const list = r.cycles.justif.missing.filter((x) => x.date >= from && x.date <= to);
  const desc = (x) => `${x.avoir ? 'avoir' : 'facture'}${x.piece ? ` n° ${x.piece}` : ''} du ${d(x.date)} (${eur(Math.abs(x.amt))} €)`;
  const groups = new Map();
  list.filter((x) => x.kind !== 'direct').forEach((x) => { const k = x.kind + '|' + x.num; (groups.get(k) || groups.set(k, []).get(k)).push(x); });
  groups.forEach((l) => {
    const x0 = l[0];
    const items = l.slice(0, 12).map(desc).join(', ') + (l.length > 12 ? ` et ${l.length - 12} autre(s)` : '');
    if (x0.kind === 'achat') push('achats', `jm:${scope}:${x0.num}`, `${l.length > 1 ? 'Factures' : 'Facture'} ${x0.tlib} : ${items}`);
    else push('ventes', `jv:${scope}:${x0.num}`, `${l.length > 1 ? 'Factures de vente' : 'Facture de vente'} à ${x0.tlib} : ${items}`);
  });
  list.filter((x) => x.kind === 'direct').slice(0, 60).forEach((x, i) => push('justif', `jd:${scope}:${i}`, `Justificatif « ${x.lib} » du ${d(x.date)} (${eur(x.amt)} €)`));
}

// Pièces et questions issues des cycles.
function cyclePieces(r, mode, arrete, push) {
  if (!r.cycles) return;
  const cy = r.cycles;
  const d = fmtDate;
  const bilan = mode === 'bilan';
  if (ui.fecProfile !== 'pharmacie') cy.clients.numbering.filter((g) => !g.sparse && g.missing).forEach((g) => {
    push('ventes', 'num:' + g.prefix, g.missing <= 30
      ? `Factures de vente n° ${g.ranges.join(', ')} : copies, ou confirmation de leur annulation (absentes de la comptabilité)`
      : `Liste des factures de vente de la série ${g.prefix} (${g.missing} numéros absents de la comptabilité entre ${g.first} et ${g.last})`);
  });
  const item = (x) => `« ${x.lib} » du ${d(x.date)} (${eur(Math.abs(x.amt))} €)`;
  const OPS = 'Opérations en espèces de 1 000 € ou plus', PERSO = 'Dépenses à caractère personnel possibles';
  cy.treso.cash.items.filter((x) => x.date <= arrete && !memoHas('treso', OPS, x.lib)).slice(0, 10).forEach((x, i) => push('caisse', 'esp:' + i, `Justificatif de l'opération en espèces ${item(x)} : paiement en espèces limité à 1 000 €`));
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
  }
}
