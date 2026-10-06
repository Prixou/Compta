const { chromium } = require('playwright');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR' });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const U = 'http://localhost:8765/';
  const state = async () => (await p.$('.layout')) ? 'ouverte' : (await p.$('[data-action=open-device]')) ? 'verrouillée (bouton Ouvrir)' : (await p.$('form[data-form=unlock]')) ? 'mot de passe demandé' : '?';
  await p.goto(U);
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!');
  await p.check('input[name=ack]'); await p.check('input[name=device]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.click('main [data-action=new-client]'); await p.fill('#modal input[name=nom]', 'SARL TEST'); await p.click('#modal button[type=submit]'); await p.waitForSelector('.grid-detail');
  await p.reload(); await p.waitForTimeout(1500);
  console.log('1. rechargement après création :', await state(), '| dossier présent :', (await p.textContent('body')).includes('SARL TEST'));
  await p.click('.sidebar [data-action=lock]'); await p.waitForTimeout(300);
  console.log('2. après Verrouiller :', await state(), '| données à l\'écran :', (await p.textContent('body')).includes('SARL TEST'));
  await p.click('[data-action=open-device]'); await p.waitForSelector('.layout');
  console.log('   après Ouvrir :', await state());
  await p.goto(U + '#/parametres'); await p.waitForSelector('[data-device]');
  console.log('3. paramètres : case cochée', await p.$eval('[data-device]', (i) => i.checked), '| verrouillage auto masqué', !(await p.$('[data-setting=autoLockMin]')));
  // Changement de mot de passe en mode sans mot de passe
  await p.fill('form[data-form=password] input[name=old]', 'Cabinet-Test-2026!');
  await p.fill('form[data-form=password] input[name=p1]', 'Nouveau-Secret-2026!'); await p.fill('form[data-form=password] input[name=p2]', 'Nouveau-Secret-2026!');
  await p.click('form[data-form=password] button[type=submit]'); await p.waitForTimeout(2500);
  await p.reload(); await p.waitForTimeout(1500);
  console.log('4. après changement de mot de passe + rechargement :', await state());
  // Désactivation
  await p.goto(U + '#/parametres'); await p.waitForSelector('[data-device]');
  await p.uncheck('[data-device]'); await p.waitForTimeout(300);
  await p.reload(); await p.waitForTimeout(1000);
  console.log('5. après désactivation + rechargement :', await state());
  await p.fill('input[name=password]', 'Nouveau-Secret-2026!'); await p.click('form[data-form=unlock] button[type=submit]'); await p.waitForSelector('.layout');
  console.log('   avec le nouveau mot de passe :', await state());
  // Réactivation avec confirmation (annulée puis acceptée)
  await p.goto(U + '#/parametres'); await p.waitForSelector('[data-device]');
  await p.check('[data-device]'); await p.click('#ask [data-ask=cancel]'); await p.waitForTimeout(200);
  console.log('6. confirmation annulée : case', await p.$eval('[data-device]', (i) => i.checked));
  await p.check('[data-device]'); await p.click('#ask button[type=submit]'); await p.waitForTimeout(300);
  await p.reload(); await p.waitForTimeout(1500);
  console.log('   réactivé + rechargement :', await state());
  await p.screenshot({ path: O + 'device-settings.png' });
  console.log('erreurs', errors);
  await b.close();
})();
