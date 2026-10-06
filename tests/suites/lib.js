// Aides communes aux suites : navigation dans l'analyse FEC (espaces Mois / Révision / Consultation).
'use strict';
const SPACE_OF = { 'mois-pieces': 'mois', 'mois-saisie': 'mois', tva: 'mois', sig: 'consult', balance: 'consult', details: 'consult', conformite: 'consult' };

// Ouvre un onglet de l'analyse, en passant d'abord dans son espace s'il n'est pas affiché.
async function fecTab(p, tab, wait = 150) {
  if (!(await p.$(`.fec-tabs button[data-tab="${tab}"]`))) await p.click(`.fec-spaces button[data-space=${SPACE_OF[tab] || 'revision'}]`);
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
