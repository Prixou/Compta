// Œuf de Pâques de la version 100 : curseur spinosaure (« spino » tapé hors d'un champ, ou cinq clics sur le numéro de version).
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'fr-FR' })).newPage();
  const errors = [];
  const ko = (cond, msg) => console.log(`${cond ? 'OK' : 'KO'} ${msg}`);
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  const BASE = process.env.BASE || 'http://localhost:8765/';
  await p.goto(BASE);
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!');
  await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  const on = () => p.evaluate(() => document.documentElement.classList.contains('spino'));
  const cursor = (sel) => p.$eval(sel, (el) => getComputedStyle(el).cursor);
  ko(!(await on()), 'pas de spinosaure par défaut');

  // « spino » tapé dans un champ : rien ; hors d'un champ : le spinosaure arrive
  await p.goto(BASE + '#/notes'); await p.waitForTimeout(150);
  const field = await p.$('main input[type=search], main input:not([type=checkbox])');
  if (field) { await field.click(); await p.keyboard.type('spino'); await p.waitForTimeout(100); }
  ko(!(await on()), '« spino » tapé dans un champ : sans effet');
  await p.click('main h1'); await p.keyboard.type('spino'); await p.waitForTimeout(150);
  ko(await on() && /spinosaure\.svg/.test(await cursor('main h1')) && await p.evaluate(() => data.settings.spino === true), 'curseur spinosaure, choix retenu');
  ko(field ? (await cursor('main input[type=search], main input:not([type=checkbox])')) === 'text' : true, 'champs de saisie : curseur de texte conservé');
  // Retenu à la navigation, retiré au verrouillage
  await p.goto(BASE + '#/dossiers'); await p.waitForTimeout(150);
  ko(await on(), 'spinosaure conservé d\'une page à l\'autre');
  // Cinq clics sur le numéro de version : il repart
  for (let i = 0; i < 5; i++) await p.click('.sidebar .brand [data-action=spino-tap]');
  await p.waitForTimeout(150);
  ko(!(await on()) && await p.evaluate(() => data.settings.spino === false) && /v100/.test(await p.textContent('.sidebar .brand')), 'cinq clics sur « v100 » : spinosaure reparti');
  await p.click('main h1'); await p.keyboard.type('spino'); await p.waitForTimeout(150);
  await p.evaluate(() => forgetSession());
  ko(!(await on()), 'verrouillage : curseur normal sur l\'écran de déverrouillage');
  console.log('erreurs', errors);
  await b.close();
})();
