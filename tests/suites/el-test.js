const { chromium } = require('playwright');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' })).newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('http://localhost:8765/');
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!');
  await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.click('main [data-action=new-client]'); await p.fill('#modal input[name=nom]', 'SARL CYCLES'); await p.selectOption('#modal select[name=forme]', 'SARL');
  await p.fill('#modal input[name=siren]', '444444444'); await p.click('#modal button[type=submit]'); await p.waitForSelector('.grid-detail');
  await p.goto('http://localhost:8765/#/fec'); await p.waitForSelector('.fec-drop');
  const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('.fec-drop')]);
  await ch.setFiles(D + '444444444FEC20251231.txt'); await p.waitForSelector('.fec-meta');
  const tab = async (t) => { await p.click(`button[data-action=fec-tab][data-tab=${t}]`); await p.waitForTimeout(150); };
  const row = (label) => `.fec-check:has(strong:text("${label}"))`;
  // Achats : doublon → élément justifié → écriture écartée
  await tab('achats');
  console.log('achats :', await p.$$eval('.fec-check strong', (l) => l.map((x) => x.textContent).filter((t) => /double|même montant/.test(t))));
  await tab('ecritures');
  console.log('écriture doublon cochée avant :', await p.$eval('input[data-ecr-sel^="dup:"]', (i) => i.checked));
  await tab('achats');
  const R = row('Factures fournisseurs en double');
  await p.click(`${R} summary`);
  await p.selectOption(`${R} select[data-wp=el-st]`, 'justifie'); await p.waitForTimeout(150);
  console.log('détail resté ouvert :', await p.$eval(`${R} details`, (d) => d.open), '| compteur :', await p.textContent(`${R} .wp-count`), '| barre :', (await p.textContent('.wp-bar')).replace(/\s+/g, ' ').trim());
  await tab('ecritures');
  console.log('écriture doublon après « justifié » :', await p.$eval('input[data-ecr-sel^="dup:"]', (i) => i.checked), '|', (await p.textContent('.ecr-prop:has(input[data-ecr-sel^="dup:"])')).includes('Écartée'));
  // Charges : 14 dépenses perso, traitement unitaire + groupé
  await tab('charges');
  const P = row('Dépenses à caractère personnel possibles');
  await p.click(`${P} summary`);
  const sels = await p.$$(`${P} select[data-wp=el-st]`);
  console.log('éléments :', sels.length);
  await p.selectOption(`${P} select[data-wp=el-st] >> nth=0`, 'piece'); await p.waitForTimeout(150);
  await p.fill(`${P} input[data-wp=el-note] >> nth=0`, 'Facture demandée au client'); await p.press(`${P} input[data-wp=el-note] >> nth=0`, 'Tab'); await p.waitForTimeout(100);
  await p.selectOption(`${P} select[data-wp=el-st] >> nth=1`, 'na'); await p.waitForTimeout(150);
  console.log('compteur :', await p.textContent(`${P} .wp-count`));
  await p.check(`${P} input[data-wp=hide]`); await p.waitForTimeout(150);
  console.log('masqués :', (await p.$$(`${P} li.wp-el`)).length, 'affichés |', await p.textContent(`${P} details > p.muted`));
  await p.selectOption(`${P} select[data-wp=bulk]`, 'justifie'); await p.waitForTimeout(200);
  console.log('après « tous justifiés » :', await p.textContent(`${P} .wp-count`), '| état contrôle traité :', await p.$eval(P, (li) => li.classList.contains('wp-done')));
  console.log('barre :', (await p.textContent('.wp-bar')).replace(/\s+/g, ' ').trim());
  await p.uncheck(`${P} input[data-wp=hide]`); await p.waitForTimeout(150);
  await p.screenshot({ path: O + 'el-charges.png', fullPage: true });
  // Pièce demandée → pièces à demander
  await tab('pieces');
  console.log('pièce issue d\'un élément :', await p.$$eval('.piece span', (l) => l.map((x) => x.textContent).filter((t) => /^Justificatif \(/.test(t))));
  // Impression
  await p.evaluate(() => { window.print = () => { window.__printed = document.querySelector('#print-area').innerText; }; });
  await tab('synthese'); await p.click('button[data-action=wp-print]'); await p.waitForTimeout(100);
  const pr = await p.evaluate(() => window.__printed || '');
  console.log('impression contient la note de l\'élément :', pr.includes('Facture demandée au client'));
  // Ré-analyse : statuts conservés
  const [ch2] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-action=fec-pick]')]);
  await ch2.setFiles(D + '444444444FEC20251231.txt'); await p.waitForSelector('.fec-meta'); await tab('charges');
  console.log('après ré-analyse :', await p.textContent(`${P} .wp-count`));
  console.log('erreurs', errors);
  await b.close();
})();
