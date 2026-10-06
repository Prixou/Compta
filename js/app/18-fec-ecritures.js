/*
 * Suivi Dossiers — Écritures proposées, exports de l’analyse, info-bulles, dépôt de fichiers.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- Écritures de clôture proposées (import ACD / Pennylane) ----------

const round2 = (n) => Math.round(n * 100) / 100 || 0;

// Longueur habituelle des comptes généraux du dossier (6, 8 chiffres…).
function acctLen(r) {
  if (r._len) return r._len;
  const n = {};
  r.balance.forEach((b) => { if (/^[67]\d+$/.test(b.compte)) n[b.compte.length] = (n[b.compte.length] || 0) + 1; });
  const len = Number(Object.keys(n).sort((a, b) => n[b] - n[a])[0]) || 6;
  Object.defineProperty(r, '_len', { value: len, configurable: true });
  return len;
}

// Compte du dossier commençant par `prefix` (le plus mouvementé), sinon compte standard complété par des zéros.
function acctOf(r, prefix) {
  const list = r.balance.filter((b) => b.compte.startsWith(prefix));
  if (list.length) return list.sort((a, b) => b.d + b.c - (a.d + a.c))[0].compte;
  return prefix.padEnd(acctLen(r), '0');
}
const STD_LIB = {
  486: "Charges constatées d'avance", 487: "Produits constatés d'avance", 416: 'Clients douteux ou litigieux', 491: 'Dépréciations des comptes clients',
  6817: 'Dotations aux dépréciations des actifs circulants', 6712: 'Pénalités et amendes', 695: 'Impôts sur les bénéfices', 444: 'État - impôt sur les bénéfices',
  4456: 'TVA déductible', 408: 'Fournisseurs - factures non parvenues', 418: 'Clients - factures à établir',
};
const acctLib = (r, compte) => {
  const b = r.balance.find((x) => x.compte === compte);
  if (b) return b.lib;
  const k = Object.keys(STD_LIB).sort((a, b) => b.length - a.length).find((p) => compte.startsWith(p));
  return k ? STD_LIB[k] : '';
};

// Contrepartie présumée pour l'extourne d'une régularisation de l'exercice précédent.
function largest(r, prefixes) {
  const list = r.balance.filter((b) => prefixes.some((p) => b.compte.startsWith(p)));
  if (!list.length) return prefixes[0].padEnd(acctLen(r), '0');
  return list.sort((a, b) => Math.abs(b.dm - b.cm) - Math.abs(a.dm - a.cm))[0].compte;
}
const REGUL = [
  ['408', 'C', ['60', '61', '62'], "Extourne des factures non parvenues de l'exercice précédent"],
  ['418', 'D', ['70'], "Extourne des factures à établir de l'exercice précédent"],
  ['486', 'D', ['61', '62', '60'], "Extourne des charges constatées d'avance de l'exercice précédent"],
  ['487', 'C', ['70'], "Extourne des produits constatés d'avance de l'exercice précédent"],
  ['4286', 'C', ['641'], "Extourne des dettes de congés payés et charges à payer (personnel) de l'exercice précédent"],
  ['4386', 'C', ['645'], "Extourne des charges sociales à payer de l'exercice précédent"],
  ['4486', 'C', ['63'], "Extourne des impôts et taxes à payer de l'exercice précédent"],
  ['4686', 'C', ['62', '61'], "Extourne des charges à payer diverses de l'exercice précédent"],
  ['4198', 'C', ['709', '70'], "Extourne des avoirs à établir de l'exercice précédent"],
  ['4098', 'D', ['609', '60'], "Extourne des rabais et remises à obtenir de l'exercice précédent"],
];

function ecrState() {
  const f = ui.fec;
  if (!f.ecr) f.ecr = { off: new Set(), forceOn: new Set(), amounts: {}, cptes: {}, journal: 'OD', date: '', extourne: false, taux: 50 };
  f.ecr.forceOn = f.ecr.forceOn || new Set();
  if (!f.ecr.date) f.ecr.date = isSituation(f.result) ? defaultArrete(f.result, 'situation') : f.result.meta.closing || pharmaRef(f.result);
  return f.ecr;
}

// Propositions : { id, group, label, why, amount, editable, cpte (contrepartie modifiable), extournable, make(amount, cpte) → lignes }.
function ecrProposals(r) {
  if (!r.cycles) return [];
  const cy = r.cycles;
  const st = ecrState();
  const out = [];
  const L = (compte, lib, d, c, aux) => ({ compte, lib, d: round2(d), c: round2(c), aux: aux || null });
  const add = (p) => out.push(p);
  const dt = fmtDate;
  const closing = r.meta.closing;

  // 1. Charges constatées d'avance probables
  if (closing) cy.charges.cca.forEach((x, i) => add({
    src: { cycle: 'charges', check: "Charges constatées d'avance probables : 0 €", ex: ccaEx(x) },
    id: `cca:${x.compte}:${x.date}:${i}`, group: "Charges et produits constatés d'avance", extournable: true, editable: true, amount: x.cca,
    label: `CCA — ${x.label}`, why: `Paiement du ${dt(x.date)} de ${eur(x.amt)} € (${x.compte}), période présumée de ${x.cover} mois : montant à ajuster selon la facture.`,
    make: (a) => [L(acctOf(r, '486'), `CCA ${x.label}`, a, 0), L(x.compte, `CCA ${x.label}`, 0, a)],
  }));
  // 2. Pièces de l'exercice suivant comptabilisées dans l'exercice
  [...cy.achats.cut.after.items.map((x, i) => [x, 'Achats', cy.achats.cut.after.ex[i], 'achats']), ...cy.charges.cut.after.items.map((x, i) => [x, 'Charges externes', cy.charges.cut.after.ex[i], 'charges'])].forEach(([x, what, ex, cycle], i) => add({
    src: { cycle, check: `${what} : pièces datées après la clôture`, ex },
    id: `cutc:${x.compte}:${x.date}:${i}`, group: "Charges et produits constatés d'avance", extournable: true, editable: true, amount: x.amt,
    label: `Charge de l'exercice suivant — ${x.lib}`, why: `Pièce du ${dt(x.pdate)} saisie le ${dt(x.date)} sur ${x.compte} : neutralisée en charge constatée d'avance.`,
    make: (a) => [L(acctOf(r, '486'), `CCA ${x.lib}`, a, 0), L(x.compte, `CCA ${x.lib}`, 0, a)],
  }));
  if (ui.fecProfile !== 'pharmacie') cy.clients.cut.after.items.forEach((x, i) => add({
    src: { cycle: 'clients', check: 'Ventes : pièces datées après la clôture', ex: cy.clients.cut.after.ex[i] },
    id: `cutv:${x.compte}:${x.date}:${i}`, group: "Charges et produits constatés d'avance", extournable: true, editable: true, amount: x.amt,
    label: `Produit de l'exercice suivant — ${x.lib}`, why: `Facture du ${dt(x.pdate)} saisie le ${dt(x.date)} sur ${x.compte} : neutralisée en produit constaté d'avance.`,
    make: (a) => [L(x.compte, `PCA ${x.lib}`, a, 0), L(acctOf(r, '487'), `PCA ${x.lib}`, 0, a)],
  }));

  // 3. Régularisations de l'exercice précédent non extournées
  if (r.meta.hasAN) REGUL.forEach(([prefix, side, cp, label]) => {
    r.balance.filter((b) => b.compte.startsWith(prefix) && Math.abs(b.an) >= 1).forEach((b) => {
      const rest = round2(Math.abs(b.an) - (b.an < 0 ? b.dm : b.cm));
      if (rest < 1) return;
      const id = `regul:${b.compte}`;
      add({
        id, group: "Extournes de l'exercice précédent", extournable: false, editable: true, amount: rest, cpte: largest(r, cp),
        label: `${label} (${b.compte})`, why: `À-nouveau de ${eur(Math.abs(b.an))} €, dont ${eur(rest)} € non extournés. Contrepartie présumée : vérifiez le compte.`,
        make: (a, c) => (side === 'C' ? [L(b.compte, label, a, 0), L(c, label, 0, a)] : [L(c, label, a, 0), L(b.compte, label, 0, a)]),
      });
    });
  });

  // 4. Dépréciation des créances clients échues depuis plus de 90 jours
  if (ui.fecProfile !== 'pharmacie' && closing) {
    const od = overdue(r, '411', closing, fecTerme());
    const { mv, solde } = sums(r);
    const tx = r.kpi.ca > 0 ? Math.min(0.2, Math.max(0, -mv(['4457']) / r.kpi.ca)) : 0.2;
    const dep = -solde(['491']);
    if (dep < 0.01) od.tiers.filter((t) => t.b91 >= 50).forEach((t) => {
      const ht = round2(t.b91 / (1 + tx));
      add({
        id: `dep:${t.num}`, group: 'Dépréciation des créances', extournable: false, editable: true, amount: round2((ht * st.taux) / 100),
        label: `Dépréciation de la créance ${t.lib}`, why: `${eur(t.b91)} € TTC échus depuis plus de 90 jours (${oldestTxt(t)}), soit ${eur(ht)} € HT ; dotation proposée à ${st.taux} % du HT, à apprécier selon le risque.`,
        make: (a) => [
          L(acctOf(r, '416'), `Reclassement ${t.lib} en douteux`, t.b91, 0), L(acctOf(r, '411'), `Reclassement ${t.lib} en douteux`, 0, t.b91, { num: t.num, lib: t.lib }),
          L(acctOf(r, '6817'), `Dépréciation ${t.lib}`, a, 0), L(acctOf(r, '491'), `Dépréciation ${t.lib}`, 0, a),
        ],
      });
    });
    const douteux = solde(['416']);
    if (douteux > 0.01 && dep < 0.01) add({
      id: 'dep:416', group: 'Dépréciation des créances', extournable: false, editable: true, amount: round2((douteux / (1 + tx)) * st.taux / 100),
      label: 'Dépréciation des clients douteux (416)', why: `${eur(douteux)} € TTC en 416 sans dépréciation ; dotation proposée à ${st.taux} % du HT.`,
      make: (a) => [L(acctOf(r, '6817'), 'Dépréciation clients douteux', a, 0), L(acctOf(r, '491'), 'Dépréciation clients douteux', 0, a)],
    });
  }

  // 5. Corrections
  cy.achats.dupStrong.items.forEach((x, i) => add({
    src: { cycle: 'achats', check: 'Factures fournisseurs en double', ex: cy.achats.dupStrong.ex[i] },
    id: `dup:${x.sup}:${x.piece}:${i}`, group: 'Corrections', extournable: false, editable: false, amount: x.ttc,
    label: `Annulation de la facture en double ${x.piece} — ${x.supLib}`, why: `Facture de ${eur(x.ttc)} € TTC saisie deux fois (la seconde le ${dt(x.date)}) : à confirmer sur le relevé fournisseur.`,
    make: () => [L(acctOf(r, '401'), `Annulation doublon ${x.piece}`, x.ttc, 0, { num: x.sup, lib: x.supLib }), L(x.compte, `Annulation doublon ${x.piece}`, 0, x.ht)]
      .concat(x.tva > 0.005 ? [L(acctOf(r, '4456'), `Annulation doublon ${x.piece}`, 0, x.tva)] : []),
  }));
  const amendes = {};
  cy.charges.amendes.items.forEach((x) => { if (x.compte && !x.compte.startsWith('6712')) amendes[x.compte] = round2((amendes[x.compte] || 0) + x.amt); });
  Object.entries(amendes).forEach(([compte, amt]) => add({
    id: `amende:${compte}`, group: 'Corrections', extournable: false, editable: true, amount: amt,
    label: `Reclassement des amendes et pénalités (${compte})`, why: 'Non déductibles : isolées en 6712 pour être réintégrées sur la 2058-A.',
    make: (a) => [L(acctOf(r, '6712'), 'Reclassement amendes', a, 0), L(compte, 'Reclassement amendes', 0, a)],
  }));
  cy.charges.giftVat.items.forEach((x, i) => add({
    src: { cycle: 'charges', check: 'TVA déduite sur des cadeaux de plus de 73 €', ex: cy.charges.giftVat.ex[i] },
    id: `gift:${x.date}:${i}`, group: 'Corrections', extournable: false, editable: true, amount: x.amt,
    label: `TVA non récupérable sur cadeaux — ${x.lib}`, why: `TVA déduite le ${dt(x.date)} sur des cadeaux de plus de 73 € TTC.`,
    make: (a) => [L(x.compte, 'TVA non récupérable cadeaux', a, 0), L(acctOf(r, '4456'), 'TVA non récupérable cadeaux', 0, a)],
  }));
  cy.achats.autoliq.items.forEach((x, i) => add({
    src: { cycle: 'achats', check: 'Autoliquidation incomplète', ex: cy.achats.autoliq.ex[i] },
    id: `autoliq:${x.date}:${i}`, group: 'Corrections', extournable: false, editable: true, amount: x.amt,
    label: `Déduction de la TVA autoliquidée — ${x.sup}`, why: `Facture ${x.piece || ''} du ${dt(x.date)} : TVA autoliquidée non déduite (à vérifier : droit à déduction total ?).`,
    make: (a) => [L(acctOf(r, '4456'), 'TVA autoliquidée déductible', a, 0), L(x.compte, 'TVA autoliquidée déductible', 0, a)],
  }));

  // 6. Reclassement des écritures imputées sur un autre compte de tiers
  ['401', '411'].forEach((racine) => ((r.misposted && r.misposted[racine]) || []).forEach((x, i) => {
    const cycle = racine === '401' ? 'achats' : ui.fecProfile === 'pharmacie' ? 'treso' : 'clients';
    const lab = MISPOST[racine].replace(/client$/, racine === '411' && ui.fecProfile === 'pharmacie' ? 'organisme ou patient' : 'client');
    add({
      src: { cycle, check: lab, ex: mispostEx(x) },
      id: `mis:${racine}:${x.from.num}:${x.date}:${i}`, group: 'Reclassements entre comptes de tiers', extournable: false, editable: false, amount: x.amt,
      label: `Reclassement ${x.kind === 'facture' ? 'de la facture' : 'du règlement'} « ${x.lib} » de ${x.from.lib} vers ${x.to.lib}`,
      why: `${x.kind === 'facture' ? 'Facture' : 'Règlement'} du ${dt(x.date)} de ${eur(x.amt)} € : ${x.reason === 'libelle' ? `le libellé désigne ${x.to.lib}` : `montant identique à une facture de ${x.to.lib}`}. À confirmer sur la pièce avant import.`,
      // Compte auxiliaire seulement quand le FEC en utilise (sinon un compte 401 / 411 par tiers).
      make: () => [L(x.from.compte, `Reclassement ${x.lib}`, x.c, x.d, x.from.num !== x.from.compte ? { num: x.from.num, lib: x.from.lib } : null),
        L(x.to.compte, `Reclassement ${x.lib}`, x.d, x.c, x.to.num !== x.to.compte ? { num: x.to.num, lib: x.to.lib } : null)],
    });
  }));

  const finish = (p) => {
    p.amount = round2(st.amounts[p.id] !== undefined ? st.amounts[p.id] : p.amount);
    p.cpteValue = p.cpte ? st.cptes[p.id] || p.cpte : null;
    p.lines = p.make(p.amount, p.cpteValue).filter((l) => l.d || l.c);
    p.dismissed = !!p.src && elDismissed(p.src);
    p.on = st.forceOn.has(p.id) || (!st.off.has(p.id) && !p.dismissed);
    return p;
  };
  out.forEach(finish);

  // 6. Situation : charges annuelles au prorata
  const pj = projection(r);
  if (pj) pj.annual.forEach((a) => {
    // Compte de contrepartie : celui du dossier (situation ou exercice précédent), sinon compte standard.
    const any = (prefix) => (r.balance.some((b) => b.compte.startsWith(prefix)) || !pj.full.balance.some((b) => b.compte.startsWith(prefix)) ? acctOf(r, prefix) : acctOf(pj.full, prefix));
    const cp = /^681/.test(a.compte) ? any('28') : /^63/.test(a.compte) ? any('4486') : /^641/.test(a.compte) ? any('4286') : /^64/.test(a.compte) ? any('4386') : any('4686');
    out.push(finish({
      id: `sit:${a.compte}`, group: 'Situation : charges annuelles au prorata', extournable: true, editable: true, amount: a.prorata, cpte: cp,
      label: `${a.lib} (${a.compte}) au prorata`, why: `${eur(a.full, 0)} € sur l'exercice précédent, comptabilisés après la date de situation : ${Math.round(pj.ratio * 100)} % à étaler. Contrepartie présumée à vérifier.`,
      make: (amt, c2) => [L(a.compte, `Situation ${a.lib}`, amt, 0), L(c2, `Situation ${a.lib}`, 0, amt)],
    }));
  });

  // 7. Impôt sur les sociétés estimé, après prise en compte des autres écritures retenues
  const c = clientById(ui.fec.clientId);
  const isCo = c ? presumedIS(c) : r.balance.some((b) => /^(695|444)/.test(b.compte));
  if (closing && yearEnd(r) && isCo) {
    const { mv } = sums(r);
    const isBooked = mv(['695']);
    const reint = mv(['6712']) + Object.values(amendes).reduce((s, v) => s + v, 0);
    const other = out.filter((p) => p.on).reduce((s, p) => s + ecrImpact(p.lines), 0);
    const base = r.kpi.resultat + isBooked + other + reint;
    if (base > 0) {
      const is = round2(Math.min(base, 42500) * 0.15 + Math.max(0, base - 42500) * 0.25 - isBooked);
      if (is >= 1) out.push(finish({
        id: 'is', group: 'Impôt sur les sociétés', extournable: false, editable: true, amount: is,
        label: 'Impôt sur les sociétés estimé', why: `Résultat avant impôt ${eur(r.kpi.resultat + isBooked, 0)} €${other ? `, écritures retenues ci-dessus ${other > 0 ? '+' : ''}${eur(other, 0)} €` : ''}, amendes réintégrées ${eur(reint, 0)} € : base ${eur(base, 0)} €. 15 % jusqu'à 42 500 € (taux réduit PME, sous conditions) puis 25 %, moins l'IS déjà comptabilisé (${eur(isBooked, 0)} €). Hors autres retraitements fiscaux.`,
        make: (a) => [L(acctOf(r, '695'), 'Impôt sur les sociétés', a, 0), L(acctOf(r, '444'), 'Impôt sur les sociétés', 0, a)],
      }));
    }
  }
  return out;
}

const ecrImpact = (lines) => lines.reduce((s, l) => s + (/^7/.test(l.compte) ? l.c - l.d : /^6/.test(l.compte) ? -(l.d - l.c) : 0), 0);

// Écritures retenues, numérotées, avec leur extourne éventuelle au lendemain.
function ecrEntries(r) {
  const st = ecrState();
  const list = ecrProposals(r).filter((p) => p.on && p.lines.length);
  const next = addDays(st.date, 1);
  const entries = [];
  list.forEach((p) => {
    entries.push({ date: st.date, label: p.label, lines: p.lines });
    if (st.extourne && p.extournable) entries.push({ date: next, label: `Extourne — ${p.label}`, lines: p.lines.map((l) => ({ ...l, d: l.c, c: l.d, lib: `Extourne ${l.lib}` })) });
  });
  entries.forEach((e, i) => { e.num = i + 1; e.piece = `REV${String(i + 1).padStart(3, '0')}`; });
  return entries;
}

function ecrFileBase(r) {
  return `ecritures-revision-${r.meta.siren || 'dossier'}-${(ecrState().date || '').replace(/-/g, '')}`;
}

// Format FEC (art. A47 A-1) : importable dans ACD (import FEC) et Pennylane.
function exportEcrFec(r) {
  const st = ecrState();
  const amt = (v) => (v ? v.toFixed(2).replace('.', ',') : '0,00');
  const clean = (s) => String(s || '').replace(/[\t\r\n]+/g, ' ');
  const head = ['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise'];
  const rows = [head.join('\t')];
  ecrEntries(r).forEach((e) => {
    const d = e.date.replace(/-/g, '');
    e.lines.forEach((l) => rows.push([st.journal, 'Opérations diverses', e.num, d, l.compte, clean(acctLib(r, l.compte)), l.aux ? l.aux.num : '', l.aux ? clean(l.aux.lib) : '', e.piece, d, clean(l.lib), amt(l.d), amt(l.c), '', '', '', '', ''].join('\t')));
  });
  download(`${ecrFileBase(r)}.txt`, rows.join('\r\n') + '\r\n', 'text/plain;charset=utf-8');
}

// Tableur (Excel ou CSV) : une ligne par mouvement, pour l'import paramétrable d'ACD ou l'import d'écritures de Pennylane.
function ecrRows(r) {
  const st = ecrState();
  const rows = [];
  ecrEntries(r).forEach((e) => e.lines.forEach((l) => rows.push({
    journal: st.journal, date: fmtDate(e.date), piece: e.piece, compte: l.compte, aux: l.aux ? l.aux.num : '', auxLib: l.aux ? l.aux.lib : '',
    clib: acctLib(r, l.compte), lib: l.lib, d: l.d, c: l.c,
  })));
  return rows;
}
const ECR_COLS = ['Journal', 'Date', 'N° de pièce', 'Compte', 'Compte auxiliaire', 'Libellé du compte auxiliaire', 'Libellé du compte', "Libellé de l'écriture", 'Débit', 'Crédit'];

function exportEcrXlsx(r) {
  const t = (v, s) => ({ v, s: s === undefined ? 2 : s });
  const n = (v) => ({ v: Number(v) || 0, s: 8 });
  const rows = [ECR_COLS.map((c) => t(c, 1))].concat(ecrRows(r).map((x) => [t(x.journal), t(x.date), t(x.piece), t(x.compte), t(x.aux), t(x.auxLib), t(x.clib), t(x.lib), n(x.d), n(x.c)]));
  const blob = XlsxWriter.build({ sheets: [{ name: 'Écritures', rows, widths: [9, 12, 10, 12, 14, 26, 30, 50, 14, 14], freeze: { row: 1 } }] });
  download(`${ecrFileBase(r)}.xlsx`, blob, blob.type);
}

function exportEcrCsv(r) {
  const q = (v) => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const a = (v) => (v ? v.toFixed(2).replace('.', ',') : '');
  const lines = [ECR_COLS.join(';')].concat(ecrRows(r).map((x) => [x.journal, x.date, x.piece, x.compte, x.aux, x.auxLib, x.clib, x.lib, a(x.d), a(x.c)].map(q).join(';')));
  download(`${ecrFileBase(r)}.csv`, '﻿' + lines.join('\r\n') + '\r\n', 'text/csv;charset=utf-8');
}

async function ecrExport(kind) {
  const r = ui.fec.result;
  const ok = await ask({ title: 'Fichier non chiffré', message: "Le fichier d'écritures contient des montants et des noms de tiers <strong>non chiffrés</strong>. Importez-le dans votre logiciel puis supprimez-le.", okLabel: 'Exporter' });
  if (!ok) return;
  if (kind === 'fec') exportEcrFec(r);
  else if (kind === 'xlsx') exportEcrXlsx(r);
  else exportEcrCsv(r);
  const c = clientById(ui.fec.clientId);
  if (c) {
    log(c.id, `Écritures de révision exportées (${ecrEntries(r).length} écriture(s), format ${kind.toUpperCase()}).`, true);
    persist();
  }
}

function viewEcritures() {
  const r = ui.fec.result;
  const st = ecrState();
  const props = ecrProposals(r);
  const on = props.filter((p) => p.on);
  const impact = on.reduce((s, p) => s + ecrImpact(p.lines), 0);
  const groups = {};
  props.forEach((p) => (groups[p.group] = groups[p.group] || []).push(p));
  const lineTable = (p) => `<div class="grid-wrap"><table class="dtable num ecr-lines"><thead><tr><th>Compte</th><th>Libellé</th><th>Débit</th><th>Crédit</th></tr></thead>
    <tbody>${p.lines.map((l) => `<tr><td>${esc(l.compte)}${l.aux ? ` <span class="muted small">${esc(l.aux.num)}</span>` : ''}</td><td>${esc(l.lib)}</td><td>${l.d ? eur(l.d) : ''}</td><td>${l.c ? eur(l.c) : ''}</td></tr>`).join('')}</tbody></table></div>`;
  return `
    <section class="card">
      <h2>Écritures de clôture proposées</h2>
      <p class="muted small">Calculées à partir des contrôles des cycles. Décochez ce qui ne s'applique pas, ajustez les montants estimés, puis exportez le fichier à importer dans <strong>ACD</strong> ou <strong>Pennylane</strong>. Les écritures ne sont pas validées : elles restent modifiables dans votre logiciel après l'import.</p>
      <div class="filters ecr-opts">
        <label class="inline-label">Journal <input type="text" data-ecr="journal" value="${esc(st.journal)}" maxlength="6" spellcheck="false" aria-label="Code journal"></label>
        <label class="inline-label">Date <input type="date" data-ecr="date" value="${esc(st.date)}"></label>
        <label class="check inline"><input type="checkbox" data-ecr="extourne"${st.extourne ? ' checked' : ''}><span>Extourner les CCA / PCA au ${fmtDate(addDays(st.date, 1))}</span></label>
        <label class="inline-label">Dépréciation <input type="number" min="0" max="100" step="5" data-ecr="taux" value="${st.taux}" aria-label="Taux de dépréciation"> % du HT</label>
      </div>
      <div class="kpis fec-kpis">
        ${kpiTile('Écritures retenues', `${on.length} / ${props.length}`)}
        ${kpiTile('Impact sur le résultat', `${impact > 0 ? '+' : ''}${eurK(impact)}`, impact < 0 ? 'kpi-late' : '')}
        ${kpiTile('Résultat après écritures', eurK(r.kpi.resultat + impact))}
      </div>
      <div class="pieces-actions">
        <button class="btn primary" data-action="ecr-fec"${on.length ? '' : ' disabled'}>Fichier FEC (.txt) — ACD / Pennylane</button>
        <button class="btn" data-action="ecr-xlsx"${on.length ? '' : ' disabled'}>Excel</button>
        <button class="btn" data-action="ecr-csv"${on.length ? '' : ' disabled'}>CSV (point-virgule)</button>
      </div>
      <p class="muted small">ACD : import d'écritures au format FEC, ou import paramétrable du CSV. Pennylane : import d'écritures (FEC ou tableur). Faites un premier essai sur un dossier test pour valider la correspondance des comptes et du journal.</p>
    </section>
    ${props.length ? Object.keys(groups).map((g) => `<section class="card"><h2>${esc(g)} <span class="count">${groups[g].length}</span></h2>
      ${groups[g].map((p) => `<div class="ecr-prop${p.on ? '' : ' off'}">
        <label class="check"><input type="checkbox" data-ecr-sel="${esc(p.id)}"${p.on ? ' checked' : ''}><span><strong>${esc(p.label)}</strong><span class="muted small">${esc(p.why)}</span>${p.dismissed && !p.on ? '<span class="muted small">Écartée : élément justifié ou sans objet dans la feuille de travail.</span>' : ''}</span></label>
        <div class="ecr-edit">
          ${p.editable ? `<label class="inline-label">Montant <input type="number" step="0.01" min="0" data-ecr-amt="${esc(p.id)}" value="${p.amount}"> €</label>` : `<span class="muted small">${eur(p.amount)} €</span>`}
          ${p.cpte ? `<label class="inline-label">Contrepartie <input type="text" data-ecr-cpte="${esc(p.id)}" value="${esc(p.cpteValue)}" spellcheck="false" maxlength="20"></label>` : ''}
        </div>
        ${lineTable(p)}
      </div>`).join('')}</section>`).join('') : '<section class="card"><p class="muted">Aucune écriture à proposer pour ce FEC : rien à régulariser parmi les points détectés automatiquement.</p></section>'}`;
}

// Feuilles Excel des cycles : fournisseurs, clients, charges externes, trésorerie.
function cycleSheets(r, t, n) {
  const cy = r.cycles;
  const h = (cols) => cols.map((c) => t(c, 1));
  const tiers = (list) => [h(['Compte', 'Nom', 'Factures', 'HT', 'TVA', 'TTC', 'Part', 'Avoirs', 'Règlements', 'Solde', 'Délai moyen (j)', 'Réglées > 60 j'])]
    .concat(list.map((x) => [t(x.num), t(x.lib), n(x.inv, 2), n(x.ht), n(x.tva), n(x.ttc), n(Math.round((x.share || 0) * 1000) / 10, 2), n(x.avAmt), n(x.payAmt), n(x.s || 0), x.delay === null ? t('') : n(x.delay, 2), n(x.lateN, 2)]));
  const sheets = [{ name: 'Fournisseurs', rows: tiers(cy.achats.suppliers), widths: [12, 34, 10, 14, 12, 14, 8, 12, 14, 14, 14, 14], freeze: { row: 1 } }];
  if (ui.fecProfile !== 'pharmacie') sheets.push({ name: 'Clients', rows: tiers(cy.clients.customers), widths: [12, 34, 10, 14, 12, 14, 8, 12, 14, 14, 14, 14], freeze: { row: 1 } });
  const months = Array.from(new Set(cy.charges.accounts.flatMap((a) => Object.keys(a.months)))).sort();
  sheets.push({
    name: 'Charges externes', freeze: { row: 1 }, widths: [12, 34, 14].concat(months.map(() => 11), [14]),
    rows: [h(['Compte', 'Libellé', 'Total'].concat(months.map((ym) => `${ym.slice(5)}/${ym.slice(0, 4)}`), ['Payé direct']))]
      .concat(cy.charges.accounts.map((a) => [t(a.compte), t(a.lib), n(a.total)].concat(months.map((ym) => n(a.months[ym] || 0)), [n(a.direct)]))),
  });
  sheets.push({
    name: 'Trésorerie', widths: [40, 16, 16, 16, 16, 16, 14, 14, 14], filter: false,
    rows: [h(['Compte', 'Ouverture', 'Encaissements', 'Décaissements', 'Solde', 'Plus bas', 'Date plus bas', 'Jours débiteurs', 'Dernière opération'])]
      .concat(cy.treso.accounts.map((a) => [t(`${a.compte} ${a.lib}`), n(a.an), n(a.enc), n(a.dec), n(a.solde), n(a.min), t(a.minDate ? fmtDate(a.minDate) : ''), n(a.negDays, 2), t(a.last ? fmtDate(a.last) : '')]))
      .concat([[], h(['Nature des flux', 'Encaissements', 'Décaissements', 'Net'])], cy.treso.flux.map((x) => [t(x.label), n(x.enc), n(x.dec), n(x.enc - x.dec)])),
  });
  return sheets;
}

function fecExport() {
  const r = ui.fec.result;
  const m = r.meta;
  const t = (v, s) => ({ v, s: s === undefined ? 2 : s });
  const n = (v, s) => ({ v: Number(v) || 0, s: s || 8 });
  const title = (v) => [{ v, s: 10 }];
  const synth = [title(`Analyse FEC — ${m.fileName}`), [], [t('SIREN', 1), t(m.siren || '')], [t('Clôture', 1), t(m.closing ? m.closing.split('-').reverse().join('/') : '')],
    [t('Lignes', 1), n(m.lines, 2)], [t('Écritures', 1), n(m.entries, 2)], [t('Total débit', 1), n(m.totalD)], [t('Total crédit', 1), n(m.totalC)], [],
    title('Soldes intermédiaires de gestion'), ...r.sig.map((s) => [t(s.label, s.strong ? 1 : 2), n(s.value, s.strong ? 9 : 8)]), [],
    title('Bilan simplifié'), [t('Actif', 1), t('', 1)], ...r.bilan.actif.map(([l, v]) => [t(l), n(v)]), [t('Total actif', 1), n(r.bilan.totalActif, 9)],
    [t('Passif', 1), t('', 1)], ...r.bilan.passif.map(([l, v]) => [t(l), n(v)]), [t('Total passif', 1), n(r.bilan.totalPassif, 9)]];
  const lvl = (l) => (LEVEL[l] || LEVEL.info).label;
  const controls = [[t('Type', 1), t('Statut', 1), t('Contrôle', 1), t('Nombre', 1), t('Détail', 1), t('Exemples', 1)]]
    .concat(r.checks.map((c) => [t('Conformité'), t(lvl(c.level)), t(c.label), n(c.count, 2), t(c.detail), t(c.examples.join('\n'))]))
    .concat(fecPoints(r).map((c) => [t('Révision'), t(lvl(c.level)), t(c.label), t(''), t(c.detail), t((c.examples || []).join('\n'))]))
    .concat(cyclePoints(r).map((c) => [t(CYCLES[c.cycle]), t(lvl(c.level)), t(c.label), t(''), t(c.detail), t((c.examples || []).join('\n'))]));
  const balance = [[t('Compte', 1), t('Libellé', 1), t('Débit', 1), t('Crédit', 1), t('Solde débiteur', 1), t('Solde créditeur', 1)]]
    .concat(r.balance.map((b) => [t(b.compte), t(b.lib), n(b.d), n(b.c), n(b.s > 0 ? b.s : 0), n(b.s < 0 ? -b.s : 0)]));
  const monthly = [[t('Mois', 1), t('Chiffre d\'affaires', 1), t('Produits', 1), t('Charges', 1), t('TVA collectée', 1), t('TVA déductible', 1), t('Trésorerie fin de mois', 1)]]
    .concat(r.monthly.map((x) => [t(`${x.mois.slice(5)}/${x.mois.slice(0, 4)}`), n(x.ca), n(x.produits), n(x.charges), n(x.tvaCollectee), n(x.tvaDeductible), n(x.tresorerie)]));
  const journals = [[t('Code', 1), t('Libellé', 1), t('Écritures', 1), t('Lignes', 1), t('Débit', 1), t('Crédit', 1)]]
    .concat(r.journals.map((j) => [t(j.code), t(j.lib), n(j.entries, 2), n(j.lines, 2), n(j.d), n(j.c)]));
  const blob = XlsxWriter.build({
    sheets: [
      { name: 'Synthèse', rows: synth, widths: [44, 18], filter: false },
      { name: 'Contrôles', rows: controls, widths: [22, 13, 52, 10, 60, 90], freeze: { row: 1 } },
      { name: 'Balance', rows: balance, widths: [12, 40, 16, 16, 16, 16], freeze: { row: 1 } },
      { name: 'Mensuel', rows: monthly, widths: [10, 18, 16, 16, 16, 16, 22], freeze: { row: 1 } },
      { name: 'Journaux', rows: journals, widths: [10, 30, 12, 12, 16, 16], freeze: { row: 1 } },
    ].concat(r.cycles ? cycleSheets(r, t, n) : [], ui.fecProfile === 'pharmacie' && r.aging ? [{
      name: 'Tiers payant', freeze: { row: 1 }, widths: [34, 14, 20, 14, 12, 12, 12, 12, 12, 16],
      rows: [[t('Organisme', 1), t('Compte', 1), t('Type', 1), t('Solde', 1), t('≤ 30 j', 1), t('31-60 j', 1), t('61-90 j', 1), t('> 90 j', 1), t('Encours (j)', 1), t('Rejets probables', 1)]]
        .concat(pharmaData(r, pharmaRef(r)).tiers.map((x) => [t(x.lib), t(x.num), t(CAT_LABEL[x.cat]), n(x.s), n(x.b30), n(x.b60), n(x.b90), n(x.bOld), n(x.encoursJours === null ? 0 : Math.round(x.encoursJours), 2), n(x.rejets)])),
    }] : []),
  });
  download(`analyse-${(m.fileName || 'fec').replace(/\.[^.]+$/, '')}.xlsx`, blob, blob.type);
}

function fecSave() {
  const f = ui.fec;
  const c = clientById(f.clientId);
  if (!c) return;
  const r = f.result;
  const { errors, warnings } = fecCounts(r);
  c.fec = (c.fec || []).filter((x) => x.fileName !== r.meta.fileName).concat({
    id: uid(), date: nowIso(), fileName: r.meta.fileName, closing: r.meta.closing, lines: r.meta.lines, entries: r.meta.entries,
    errors, warnings, kpi: r.kpi, points: genPoints(r).concat(cyclePoints(r).filter((a) => a.level === 'error' || a.level === 'warn')).filter((a) => a.level !== 'ok').map((a) => a.label), profil: ui.fecProfile,
  });
  log(c.id, `Analyse FEC ${r.meta.closing ? 'au ' + r.meta.closing.split('-').reverse().join('/') : r.meta.fileName} : ${errors} anomalie(s), ${warnings} point(s) à vérifier.`, true);
  persist();
  toast('Synthèse enregistrée dans le dossier (le FEC lui-même n\'est pas conservé).');
}

function fecMission() {
  const f = ui.fec;
  const c = clientById(f.clientId);
  if (!c) return;
  const r = f.result;
  const year = fecYear(r);
  // Chaque étape garde la clé du point de la feuille de travail : elle se coche quand le point y est traité.
  const gen = genPoints(r).map((x) => Object.assign({}, x, { key: wpKey('gen', x.label) }));
  const cyc = cyclePoints(r).map((x) => Object.assign({}, x, { key: wpKey(x.cycle, x.label) }));
  const items = r.checks.concat(gen, cyc).filter((x) => x.level === 'error' || x.level === 'warn')
    .sort((a, b) => (a.level === 'error' ? 0 : 1) - (b.level === 'error' ? 0 : 1))
    .map((x) => ({ key: x.key, label: `${x.cycle ? CYCLES[x.cycle] + ' — ' : ''}${FEC_FAIL[x.id] || x.label}${x.count ? ` (${x.count})` : ''}` }));
  const titre = `Revue FEC ${year}`;
  const existing = missionsOf(c.id).find((m) => m.titre === titre && isOpen(m));
  const stamp = nowIso();
  const etapes = items.map((x) => Object.assign({ id: uid(), label: x.label, done: false, doneAt: null }, x.key ? { key: x.key } : {}));
  if (existing) {
    existing.etapes.forEach((e) => { const x = !e.key && etapes.find((y) => y.label === e.label && y.key); if (x) e.key = x.key; });
    existing.etapes = existing.etapes.concat(etapes.filter((e) => !existing.etapes.some((x) => x.label === e.label)));
    existing.updatedAt = stamp;
  } else {
    data.missions.push({
      id: uid(), clientId: c.id, type: 'libre', titre, exercice: year, echeance: addDays(todayStr(), 14), statut: 'a_faire', priorite: items.length && r.checks.concat(genPoints(r), cyclePoints(r)).some((x) => x.level === 'error') ? 'haute' : 'normale',
      responsable: c.responsable || c.collaborateur || data.settings.utilisateur, recurrence: 'aucune', notes: `Points relevés par l'analyse du fichier ${r.meta.fileName} le ${fmtDate(todayStr())}.`,
      suiteCreee: false, termineLe: null, createdAt: stamp, updatedAt: stamp, etapes,
    });
    log(c.id, `Mission « ${titre} » créée depuis l'analyse du FEC (${items.length} point(s)).`, true);
  }
  syncReviewMission();
  persist();
  toast(`${existing ? 'Mission mise à jour' : 'Mission créée'} : ${items.length} point(s) à traiter, dans le dossier ${clientLabel(c)}.`);
}

// Info-bulles des graphiques (texte uniquement, jamais de HTML).
function showTip(el) {
  let tip = $('#viz-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'viz-tip';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
  }
  tip.textContent = '';
  el.dataset.tip.split('\n').forEach((line, i) => {
    const row = document.createElement('div');
    if (i === 0) row.className = 'tip-title';
    else {
      const [label, value] = line.split(' : ');
      const v = document.createElement('strong');
      v.textContent = value || '';
      row.appendChild(v);
      row.appendChild(document.createTextNode(' ' + label));
      tip.appendChild(row);
      return;
    }
    row.textContent = line;
    tip.appendChild(row);
  });
  const box = el.getBoundingClientRect();
  tip.style.display = 'block';
  const w = tip.offsetWidth;
  tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, box.left + box.width / 2 - w / 2)) + 'px';
  tip.style.top = Math.max(8, box.top + window.scrollY - tip.offsetHeight - 6) + 'px';
  el.classList.add('hover');
}

function hideTip(el) {
  const tip = $('#viz-tip');
  if (tip) tip.style.display = 'none';
  if (el) el.classList.remove('hover');
}

document.addEventListener('pointerover', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) showTip(el); });
document.addEventListener('pointerout', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) hideTip(el); });
document.addEventListener('focusin', (e) => { if (e.target.dataset && e.target.dataset.tip) showTip(e.target); });
document.addEventListener('focusout', (e) => { if (e.target.dataset && e.target.dataset.tip) hideTip(e.target); });

// Glisser-déposer d'un FEC sur la page d'analyse.
document.addEventListener('dragover', (e) => {
  if (data && location.hash.startsWith('#/fec')) {
    e.preventDefault();
    const zone = $('.fec-drop');
    if (zone) zone.classList.add('over');
  }
});
document.addEventListener('dragleave', () => { const zone = $('.fec-drop'); if (zone) zone.classList.remove('over'); });
document.addEventListener('drop', (e) => {
  if (data && location.hash.startsWith('#/fec')) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    if (location.hash.startsWith('#/fec/lot')) { if (files.length && !(ui.batch && ui.batch.running)) batchRun(files); }
    else if (files[0]) startFec(files[0]);
  }
});
