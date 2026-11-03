// Factures fournisseurs en double (onglet « Doublons » de Révision A–K) sur un FEC d'officine inventé
// (tests/gen/gendoublons.py) : doublons très probables et à vérifier, pièges écartés, copies rattachées à un règlement,
// « Pas un doublon » conservé dans le dossier, contrôle du cycle C, écritures d'annulation, contrôle du mois, liste Excel.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, '../fixtures/doublons/');
const O = path.join(__dirname, '../out/');
const { fecTab, fecMonth } = require('./lib');
let ko = 0;
const expect = (ok, label, detail) => { console.log(`${ok ? 'OK' : 'KO'} ${label}${!ok && detail !== undefined ? ` : ${detail}` : ''}`); if (!ok) ko++; };
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true })).newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('http://localhost:8765/');
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!');
  await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.click('main [data-action=new-client]'); await p.fill('#modal input[name=nom]', 'PHARMACIE EXEMPLE');
  await p.fill('#modal input[name=siren]', '777777777'); await p.click('#modal button[type=submit]'); await p.waitForSelector('.grid-detail');
  await p.goto('http://localhost:8765/#/fec'); await p.waitForSelector('.fec-drop');
  const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('.fec-drop')]);
  await ch.setFiles(D + '777777777FEC20261231.txt'); await p.waitForSelector('.fec-meta');

  // 1. Onglet « Doublons »
  await fecTab(p, 'doublons', 200);
  const tabTxt = async () => (await p.textContent('.fec-tabs button[data-tab=doublons]')).trim();
  const groups = () => p.$$eval('.dup-group', (l) => l.map((g) => ({
    fort: g.classList.contains('fort'), head: g.querySelector('.dup-head').textContent.replace(/\s+/g, ' ').trim(),
    rows: Array.from(g.querySelectorAll('tbody tr')).map((tr) => tr.textContent.replace(/\s+/g, ' ').trim()),
  })));
  let G = await groups();
  console.log('=== DOUBLONS\n' + G.map((g) => `${g.head}\n   ${g.rows.join('\n   ')}`).join('\n'));
  const live = G.filter((g) => !g.head.includes('Rétablir'));
  const find = (re) => live.find((g) => g.rows.some((t) => re.test(t)));
  expect(await tabTxt() === 'Doublons (12)', 'onglet « Doublons » de Révision A–K, avec le nombre de groupes', await tabTxt());
  expect(live.filter((g) => g.fort).length === 6 && live.filter((g) => !g.fort).length === 6, '6 doublons très probables, 6 probables');
  const chq = find(/CHQ 928992/);
  expect(chq && chq.fort && /Libellé ✔/.test(chq.head), 'libellés identiques à l\'espace et au tiret près (« FOURNISSEUR- CHQ 928992 ») : même libellé', chq && chq.head);
  expect(!find(/DESGARDIN/) && !find(/BABAU/), 'n° de chèque dans le libellé : pas un n° de facture ; n° de pièce 26.05.215 et 26.04.215 (ni des dates) différents : pas des doublons');
  expect(!find(/MU SERVICES/), 'même n° et même montant à 4 mois d\'écart : pas comparées (plus de 3 semaines)');
  expect(!find(/PRESTA CONSEIL/), 'dates dans le libellé (2026.04.15, 2026.05.15) : pas des n° de facture');
  expect(find(/IOTA PHARMA/) && !find(/IOTA PHARMA/).fort && /n° saisi en partie/.test(find(/IOTA PHARMA/).head), 'n° de facture saisi en partie (fin du n°, une seule facture) : probable, jamais très probable');
  expect(find(/REPARATION FRIGO/) && !find(/REPARATION FRIGO/).fort, 'n° différents, toutes deux lettrées, même jour, même montant, même libellé (mots propres aux deux factures) : probable');
  expect(!find(/LAMBDA SANTE/), 'même cas mais libellés réduits au nom du fournisseur : le nom ne fait pas un même libellé, rien à signaler');
  const ex = find(/GROSSISTE NORD.*1 234,56/);
  expect(ex && ex.fort && /4\/5/.test(ex.head) && ex.rows.some((t) => /^à garder/.test(t)) && ex.rows.some((t) => /^à annuler \?/.test(t)), 'facture saisie deux fois le même jour : très probable, une à garder, une à annuler');
  expect(find(/LABORATOIRES ALPHA.*638,94/) && find(/LABORATOIRES ALPHA.*638,94/).fort, 'facture ressaisie dix jours plus tard (même n°, même montant) : très probable');
  const autre = find(/FDIVERS/);
  expect(autre && autre.fort && autre.rows.some((t) => /^à annuler \?.*FDIVERS/.test(t)), 'facture saisie aussi sur « Fournisseurs divers » : très probable, la copie à annuler');
  expect(find(/B000009001/) && find(/B000009001/).fort, 'même n° de pièce interne (B000…) saisi deux fois : très probable');
  const zeta = find(/ZETA MEDICAL/);
  expect(zeta && zeta.fort && zeta.rows.some((t) => /^à garder.*210,00C$/.test(t)) && zeta.rows.some((t) => /^à annuler \?.*B000009500/.test(t)), 'copie non lettrée d\'une facture payée : très probable, l\'original lettré à garder');
  const loyer = find(/LOYER SCI EXEMPLE/);
  expect(loyer && !loyer.fort && /^\d+\. Probable/.test(loyer.head) && /facture mensuelle saisie deux fois le même mois/.test(loyer.head) && loyer.rows.length === 2, 'loyer mensuel saisi deux fois en juin : probable (les autres mois ne sont pas des doublons)');
  expect(find(/1 126,22/) && !find(/1 126,22/).fort, 'même n°, faute de frappe sur le montant : probable');
  expect(find(/DELTA DERMO/) && !find(/DELTA DERMO/).fort, 'même facture sans n°, même montant à un jour d\'écart : probable');
  const kappa = find(/KAPPA SANTE/), eps = find(/55,55/);
  expect(kappa && !kappa.fort && /n° de pièce ou de facture différents/.test(kappa.head), 'même date, même montant, même compte mais n° de pièce différents : probable, jamais très probable (même si l\'une est payée)', kappa && kappa.head);
  expect(!eps, 'deux n° de facture du fournisseur différents : deux factures, pas un doublon');
  const all = live.flatMap((g) => g.rows).join('\n');
  expect(!/432,10|377,25|811,40|ENERGIE|AVOIR GAMMA|REPARTITEUR SUD/.test(all), 'pièges écartés : même montant à 6 mois d\'écart, date dans le libellé, énergie mensuelle, facture et avoir, doublon déjà annulé');
  const card = await p.textContent('main');
  expect(/1 doublon\(s\) déjà annulé\(s\)/.test(card) && /2 copie\(s\) rattachée\(s\) à un règlement/.test(card), 'résumé : doublon déjà annulé et copies rattachées à un règlement comptés à part');
  const copies = await p.$$eval('.pieces-ecartes:has(summary:text("Copies rattachées")) tbody tr', (l) => l.map((tr) => tr.textContent));
  expect(copies.length === 2 && copies.every((t) => /OMEGA SERVICES/.test(t)), 'copies (facture recopiée, chaque exemplaire lettré avec son paiement) : listées à part', copies.length);

  // 2. « Pas un doublon » : conservé dans le dossier, rétabli
  await p.click('.dup-group:has(td:text("DELTA DERMO")) button[data-action=doublon-ecarte]'); await p.waitForTimeout(150);
  const saved = await p.evaluate(() => Object.keys(clientById(ui.fec.clientId).doublonsEcartes || {}).length);
  expect(await tabTxt() === 'Doublons (11)' && saved === 1, '« Pas un doublon » : groupe écarté, choix conservé dans le dossier', `${await tabTxt()} ${saved}`);
  await p.click('.pieces-ecartes:has(summary:text("Écartés")) summary');
  await p.click('button[data-action=doublon-retablir]'); await p.waitForTimeout(150);
  expect(await tabTxt() === 'Doublons (12)' && await p.evaluate(() => !Object.keys(clientById(ui.fec.clientId).doublonsEcartes).length), 'groupe rétabli');

  // 3. Liste Excel : doublons et copies
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button[data-action=doublons-xlsx]')]);
  const file = O + 'doublons.xlsx';
  await dl.saveAs(file);
  const raw = fs.readFileSync(file).toString('utf8');
  expect(/Doublons - PHARMACIE EXEMPLE/.test(dl.suggestedFilename()) && /name="Doublons"/.test(raw) && /name="Copies rattachées"/.test(raw) && /GROSSISTE NORD/.test(raw) && /OMEGA SERVICES/.test(raw),
    'liste Excel : onglets « Doublons » et « Copies rattachées »', dl.suggestedFilename());

  // 4. Cycle C, écritures d'annulation, contrôle du mois
  await fecTab(p, 'achats', 200);
  const c = await p.textContent('.fec-check:has(strong:text("Factures fournisseurs en double"))');
  expect(/6 doublon\(s\) très probable\(s\) et 6 probable\(s\)/.test(c) && /onglet « Doublons »/.test(c), 'cycle C : contrôle « Factures fournisseurs en double » repris de l\'onglet', c.replace(/\s+/g, ' ').slice(0, 160));
  expect(!(await p.$('.fec-check:has(strong:text("même montant à quelques jours"))')), 'ancien contrôle « même montant à quelques jours d\'intervalle » remplacé');
  await fecTab(p, 'ecritures', 200);
  const ecr = await p.$$eval('input[data-ecr-sel^="dup:"]', (l) => l.length);
  expect(ecr === 6, 'écritures : une annulation par copie d\'un doublon très probable', ecr);
  await fecTab(p, 'mois-saisie', 0); await fecMonth(p, '2026-03');
  const m = await p.textContent('.fec-check:has(strong:text("Factures fournisseurs en double"))');
  expect(/^\s*Factures fournisseurs en double\s*2 doublon\(s\) dont une copie est saisie dans le mois \(2 très probable\(s\)\)/.test(m.replace(/\s+/g, ' ')) || /2 doublon\(s\) dont une copie est saisie dans le mois \(2 très probable\(s\)\)/.test(m), 'contrôle de saisie de mars : 2 doublons dont la copie est saisie dans le mois', m.replace(/\s+/g, ' ').slice(0, 160));

  await p.screenshot({ path: O + 'doublons.png', fullPage: true });
  console.log(ko ? `${ko} écart(s)` : 'Factures fournisseurs en double : tous les contrôles sont conformes');
  console.log('erreurs', errors);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
