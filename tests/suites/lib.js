// Aides communes aux suites : navigation dans l'Espace FEC (onglets Synthèse, Révision A–K, Mois, Rapprochement bancaire,
// Lettrage, Paie, Immobilisations, TVA, Consultation, et leurs sous-onglets).
'use strict';
const GROUP_OF = { synthese: 'synthese', tp: 'officine', catva: 'officine', cycles: 'revision', ecritures: 'revision', pieces: 'revision', revue: 'revision',
  'mois-pieces': 'mois', 'mois-ventes': 'mois', 'mois-saisie': 'mois', rappro: 'banque', brap: 'banque', lettrage: 'lettrage', paie: 'paie', 'immo-etat': 'immos',
  tvarev: 'tva', tva: 'tva', graphes: 'consult', sig: 'consult', balance: 'consult', details: 'consult', conformite: 'consult' };

// Cycles du dossier de révision : sous-onglet « Cycles A à K » de l'onglet Révision A–K.
const CYCLE_TABS = ['regul', 'treso', 'achats', 'charges', 'clients', 'stocks', 'immo', 'social', 'etat', 'capitaux', 'autres'];

// Ouvre un sous-onglet de l'Espace FEC, en passant d'abord par son onglet (et par « Cycles A à K » pour un cycle).
async function fecTab(p, tab, wait = 150) {
  const sub = `.fec-tabs button[data-tab="${tab}"]`;
  if (!(await p.$(sub))) {
    await p.click(`.fec-groups button[data-group="${CYCLE_TABS.includes(tab) ? 'revision' : GROUP_OF[tab] || 'synthese'}"]`);
    if (CYCLE_TABS.includes(tab) && !(await p.$(sub))) await p.click('.fec-tabs button[data-tab="cycles"]');
  }
  if (await p.$(sub)) await p.click(sub);
  if (wait) await p.waitForTimeout(wait);
}

// Menu « Plus » du bandeau de l'Espace FEC (exporter, enregistrer la synthèse, mission de revue…)
async function fecMore(p, action, wait = 150) {
  if (!(await p.$('.fec-more[open]'))) await p.click('.fec-more summary');
  await p.click(`.fec-more-menu [data-action="${action}"]`);
  if (wait) await p.waitForTimeout(wait);
}

// Espace Mois : choisit le mois affiché (AAAA-MM).
async function fecMonth(p, ym, wait = 200) {
  if (!(await p.$('input[data-fec=month]'))) await fecTab(p, 'mois-pieces', 0);
  await p.fill('input[data-fec=month]', ym);
  await p.dispatchEvent('input[data-fec=month]', 'change');
  if (wait) await p.waitForTimeout(wait);
}

module.exports = { fecTab, fecMonth, fecMore, GROUP_OF };
