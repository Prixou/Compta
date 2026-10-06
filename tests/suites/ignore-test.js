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
  await p.goto('http://localhost:8765/#/parametres'); await p.waitForSelector('textarea[name=piecesIgnore]');
  console.log('valeur par défaut :', JSON.stringify(await p.$eval('textarea[name=piecesIgnore]', (t) => t.value)));
  const sept = async () => {
    await p.goto('http://localhost:8765/#/fec'); await p.waitForSelector('.fec-drop, .fec-meta');
    if (await p.$('.fec-drop')) { const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('.fec-drop')]); await ch.setFiles(D + '444444444FEC20251231.txt'); await p.waitForSelector('.fec-meta'); }
    await p.click('button[data-tab=pieces]'); if (!(await p.$('input[data-pieces=mois]'))) await p.click('button[data-action=pieces-mode][data-mode=mois]');
    await p.fill('input[data-pieces=mois]', '2025-09'); await p.dispatchEvent('input[data-pieces=mois]', 'change'); await p.waitForTimeout(200);
    return p.$$eval('.piece span', (l) => l.map((x) => x.textContent));
  };
  console.log('avant :', await sept());
  await p.goto('http://localhost:8765/#/parametres'); await p.waitForSelector('textarea[name=piecesIgnore]');
  await p.fill('textarea[name=piecesIgnore]', 'CABINET AUDIT\nPapeterie Nîmoise');
  await p.click('form[data-form=settings] button[type=submit]'); await p.waitForTimeout(300);
  console.log('après :', await sept());
  console.log('erreurs', errors);
  await b.close();
})();
