const { chromium } = require('playwright');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ locale: 'fr-FR' })).newPage();
  await p.clock.install();
  await p.goto('http://localhost:8765/');
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!'); await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.goto('http://localhost:8765/#/parametres'); await p.waitForSelector('select[data-setting=autoLockMin]');
  await p.selectOption('select[data-setting=autoLockMin]', '1');
  await p.clock.runFor(50000);
  console.log('après 50 s : verrouillé ?', !!(await p.$('form[data-form=unlock]')));
  await p.clock.runFor(25000);
  console.log('après 75 s : verrouillé ?', !!(await p.$('form[data-form=unlock]')));
  // Données effacées de l'écran
  console.log('texte de la page ne contient que l\'écran de verrouillage :', (await p.innerText('body')).includes('Déverrouiller'));
  await b.close();
})();
