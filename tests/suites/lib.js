// Aides communes aux suites : navigation dans l'analyse FEC (espaces Mois / Révision / Consultation).
'use strict';
const SPACE_OF = { 'mois-pieces': 'mois', 'mois-ventes': 'mois', 'mois-saisie': 'mois', tva: 'mois', sig: 'consult', balance: 'consult', details: 'consult', conformite: 'consult' };

// Cycles du dossier de révision : sous l'onglet « Cycles A à K » de l'espace Révision.
const CYCLE_TABS = ['regul', 'treso', 'achats', 'charges', 'clients', 'stocks', 'immo', 'social', 'etat', 'capitaux', 'autres'];

// Ouvre un onglet de l'analyse, en passant d'abord dans son espace s'il n'est pas affiché (et dans « Cycles A à K » pour un cycle).
async function fecTab(p, tab, wait = 150) {
  if (!(await p.$(`.fec-tabs button[data-tab="${tab}"]`))) await p.click(`.fec-spaces button[data-space=${SPACE_OF[tab] || 'revision'}]`);
  if (CYCLE_TABS.includes(tab) && !(await p.$(`.fec-tabs button[data-tab="${tab}"]`))) await p.click('.fec-tabs button[data-tab="cycles"]');
  await p.click(`.fec-tabs button[data-tab="${tab}"]`);
  if (wait) await p.waitForTimeout(wait);
}

// Espace Mois : choisit le mois affiché (AAAA-MM).
async function fecMonth(p, ym, wait = 200) {
  if (!(await p.$('input[data-fec=month]'))) await fecTab(p, 'mois-pieces', 0);
  await p.fill('input[data-fec=month]', ym);
  await p.dispatchEvent('input[data-fec=month]', 'change');
  if (wait) await p.waitForTimeout(wait);
}

module.exports = { fecTab, fecMonth, SPACE_OF };
