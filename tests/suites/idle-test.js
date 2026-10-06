const { chromium } = require('playwright');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ locale: 'fr-FR' })).newPage();
  await p.clock.install();
  await p.goto('http://localhost:8765/');
  const PW = 'Cabinet-Test-2026!';
  await p.fill('input[name=p1]', PW); await p.fill('input[name=p2]', PW); await p.check('input[name=ack]'); await p.click('button[type=submit]');
  await p.waitForSelector('.layout');
  await p.goto('http://localhost:8765/#/parametres'); await p.selectOption('select[data-setting=autoLockMin]', '1');
  await p.clock.fastForward(75000); await p.waitForTimeout(300);
  console.log('verrouillée après 75 s d\'inactivité :', !!(await p.$('form[data-form=unlock]')));
  await b.close();
})();
