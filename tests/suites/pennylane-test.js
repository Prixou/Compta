const { chromium } = require('playwright');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
const { fecTab, fecMonth } = require('./lib');
// FEC de référence au format Pennylane (tests/gen/genpennylane_ref.py) : toutes les fonctions de l'analyse sur un export
// en cours d'exercice, TVA sur les encaissements, opérations bancaires en attente (4716 / 4717), à-nouveaux détaillés.
const A = require(D + '900000009-attendu.json').sept;
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' })).newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('http://localhost:8765/');
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!'); await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.goto('http://localhost:8765/#/fec'); await p.waitForSelector('.fec-drop');
  const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('.fec-drop')]);
  await ch.setFiles(D + '900000009FEC20270831.txt'); await p.waitForSelector('.fec-meta');
  let ko = 0;
  const expect = (cond, label, info) => { if (cond) console.log(`OK ${label}`); else { ko++; console.log(`KO ${label}${info ? ' : ' + info : ''}`); } };
  const sp = (s) => s.replace(/[\s  ]+/g, ' ').trim();
  const fr = (x) => sp(x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const main = async () => sp(await p.textContent('main'));
  const openAll = () => p.$$eval('details', (l) => l.forEach((d) => { d.open = true; }));

  // 1. Conformité : la date de validation vide d'un export en cours d'exercice n'est pas une anomalie
  await fecTab(p, 'conformite', 150);
  const conf = await main();
  expect(/ValidDate vide sur \d+ ligne\(s\) : écritures non encore validées/.test(conf), 'ValidDate vide : information (export en cours d\'exercice)');
  expect(!/\(\d+\)/.test(sp(await p.textContent('.fec-tabs button[data-tab=conformite]'))), 'aucune anomalie de conformité comptée', await p.textContent('.fec-tabs button[data-tab=conformite]'));

  // 2. Factures de vente de septembre : chaque facture manquante sur sa ligne
  await fecTab(p, 'mois-ventes', 0); await fecMonth(p, '2026-09'); await openAll();
  const ventes = await p.$$eval('.wp-el-text', (l) => l.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  console.log('manquantes :\n  ' + ventes.join('\n  '));
  A.missing.forEach((n) => expect(ventes.some((t) => t.startsWith(`${n} : entre `)), `${n} listée seule`));
  expect(ventes.some((t) => /^F-260182 : entre F-260180 du 28\/09\/2026 et F-260184 du 29\/09\/2026$/.test(t)), 'trou de trois factures : bornes affichées sur chaque ligne');
  expect(!(await main()).includes(' à F-26018'), 'aucune plage « F-x à F-y »');

  // 3. Pièces du mois : une pièce par facture manquante, libellés bancaires raccourcis, encaissements identifiés retirés
  await fecTab(p, 'mois-pieces', 0); await fecMonth(p, '2026-09');
  const pieces = await main();
  // Numéros manquants (journal de ventes) : signalés dans l'onglet Ventes, jamais demandés dans les pièces du mois
  A.missing.forEach((n) => expect(!pieces.includes(`Facture de vente n° ${n} (septembre 2026) : copie, ou confirmation de son annulation`), `facture ${n} manquante : pas demandée (journal de ventes)`));
  expect(!/\b(IBE|CPY|RUM|MMO|CBE|LIB): /.test(pieces), 'références techniques des libellés bancaires écartées (IBAN, mandat, BIC…)');
  expect(pieces.includes('« 0999001 ASSURANCES EXEMPLE · MULTIRISQUE PRO EXEMPLE -ECHEANCE 09/2026 COTISATION MENSUELLE »'), 'libellé bancaire : tête et communication (LCC + LC2)');
  expect(pieces.includes('PARKING CENTRE'), 'opération inconnue : justificatif demandé');
  expect(!pieces.includes('ACOMPTE F260120') && !pieces.includes('F260170'), 'encaissements qui citent une facture : pas de justificatif demandé');

  // 4. Contrôles de saisie : affectations suggérées (facture citée, libellé déjà affecté et lettré)
  await fecTab(p, 'mois-saisie', 0); await fecMonth(p, '2026-09'); await openAll();
  const att = await p.$$eval('.fec-check', (l) => l.filter((x) => /compte d'attente/.test(x.textContent)).map((x) => Array.from(x.querySelectorAll('.wp-el-text')).map((e) => e.textContent.replace(/\s+/g, ' ').trim())).flat());
  console.log('attente :\n  ' + att.join('\n  '));
  expect(att.some((t) => /ACOMPTE F260120.*suggérée : 411 411DELTA DELTA BATIMENT — facture F-260120 du 10\/06\/2026, 2 915,00 € TTC/.test(sp(t))), 'acompte → facture F-260120 reprise en à-nouveau');
  expect(att.some((t) => /F260170.*suggérée : 411 411100901 DURAND ALAIN — facture F-260170 du 18\/09\/2026/.test(t)), 'virement → facture F-260170 du mois');
  expect(att.some((t) => /BOULANGERIE DU PORT.*suggérée : 401 401FRESTAU RESTAURANT \(2 fois, lettré\)/.test(t)), 'carte : libellé déjà affecté et lettré');
  expect(att.some((t) => /PARKING CENTRE/.test(t) && !/suggérée/.test(t)), 'opération inconnue sans suggestion');

  // 5. TVA de septembre (encaissements) : TVA exigible = virements du journal RT, déductible = 44566, rapprochement sur la TVA facturée
  await fecTab(p, 'tva', 0); await fecMonth(p, '2026-09'); await openAll();
  const calc = await p.$$eval('table.tva-calc tbody tr', (l) => l.map((r) => Array.from(r.cells).map((c) => c.textContent.replace(/[\s  ]+/g, ' ').trim())));
  const row = (label) => (calc.find((r) => r[0] === label) || [])[1];
  console.log('calcul :', JSON.stringify(calc));
  expect(row('TVA collectée') === fr(A.collTotal), `TVA collectée exigible ${fr(A.collTotal)}`, row('TVA collectée'));
  Object.entries(A.coll).forEach(([rt, v]) => expect(row(`TVA collectée ${String(rt).replace('.', ',')} % (exigible)`) === fr(v), `TVA exigible à ${rt} % : ${fr(v)}`, row(`TVA collectée ${rt} % (exigible)`)));
  expect(row('TVA déductible sur autres biens et services') === fr(A.ded), `TVA déductible ${fr(A.ded)} (sans la TVA sur encaissements non payée)`, row('TVA déductible sur autres biens et services'));
  const rapp = await p.$$eval('table.tva-rapp tbody tr', (l) => l.map((r) => Array.from(r.cells).map((c) => c.textContent.replace(/[\s  ]+/g, ' ').trim())));
  console.log('rapprochement :', JSON.stringify(rapp));
  Object.entries(A.inv).forEach(([rt, v]) => {
    const r = rapp.find((x) => x[0] === `${String(rt).replace('.', ',')} %`) || [];
    expect(r[1] === fr(A.base[rt]) && r[3] === fr(v) && r[4] === '0,00', `taux ${rt} % : base ${fr(A.base[rt])}, TVA facturée ${fr(v)}, écart nul`, r.join(' | '));
  });
  expect(/TVA facturée/.test(await p.textContent('table.tva-rapp thead')), 'colonne « TVA facturée » (régime des encaissements)');
  const tva = await main();
  expect(/Régularisations de produits sans TVA/.test(tva) && /7061 PRESTATIONS 10\.00 % : 4 200,00 €/.test(tva), 'extourne de PCA écartée du rapprochement');
  expect(!/Ventes sans TVA sur des comptes taxables/.test(tva), "pas de « vente sans TVA » pour l'extourne de PCA");
  expect(!/Écritures de vente dont la TVA ne correspond pas/.test(tva), 'factures de vente au bon taux (TVA non exigible comprise)');

  // 6. Écritures proposées : pas de CCA estimée sur 6 semaines d'écritures, dépréciation de la seule créance de mai
  await fecTab(p, 'ecritures', 200);
  const ecr = await main();
  expect(!/CCA — /.test(ecr), "pas de charge constatée d'avance estimée sur un export de début d'exercice");
  expect(/Dépréciation de la créance BERNARD LUC/.test(ecr) && /la plus ancienne du 20\/05\/2026/.test(ecr), 'créance de mai (date lue dans l\'à-nouveau) à déprécier');
  expect(!/Dépréciation de la créance (PAIRE|DURAND|SCI|LEROY|MARCHAND|DELTA)/.test(ecr), 'factures de septembre, et facture et règlement repris en à-nouveau, non dépréciés');
  expect(/Le libellé cite la facture F-260120/.test(ecr), 'reclassement de l\'acompte vers le client DELTA');

  // 7. Octobre : F-260190 manquante
  await fecTab(p, 'mois-ventes', 0); await fecMonth(p, '2026-10'); await openAll();
  const oct = await p.$$eval('.wp-el-text', (l) => l.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  expect(oct.some((t) => /^F-260190 : entre F-260189 du 05\/10\/2026 et F-260191 du 06\/10\/2026/.test(t)), 'octobre : F-260190 manquante');
  await p.screenshot({ path: O + 'pennylane.png', fullPage: true });
  console.log(ko ? `${ko} écart(s)` : 'FEC Pennylane : tous les contrôles sont conformes');
  console.log('erreurs', errors);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
