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
  const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('main [data-action=import-sheet]')]);
  await ch.setFiles(D + 'import-dossiers.xlsx'); await p.waitForSelector('#modal .imp-cols');
  await p.click('#modal [data-action=apply-import]'); await p.waitForTimeout(300);
  await p.click('a[data-nav=grille]'); await p.waitForSelector('.grille');
  const id = await p.$$eval('.grille tbody tr:nth-child(2) td[data-action=grille-steps]', (l) => l[l.length - 1].dataset.id);
  const td = `.grille td[data-id="${id}"]`;
  await p.click(td); await p.waitForSelector('#grille-pop');
  await p.click('#grille-pop [data-i="-1"]'); await p.waitForTimeout(150);
  console.log('après « remettre à faire » : ouverte', !!(await p.$('#grille-pop')), '|', await p.textContent('#grille-pop .gp-state'));
  for (const label of ['Banque affectée', 'Saisie des achats', 'Saisie des ventes', 'Contrôle']) {
    await p.click(`#grille-pop .gp-steps button:has-text("${label}")`); await p.waitForTimeout(150);
    console.log(`${label} → fenêtre ouverte : ${!!(await p.$('#grille-pop'))} | ${await p.textContent('#grille-pop .gp-state')} | case ${JSON.stringify(await p.$eval(td, (x) => x.textContent))} | focus : ${await p.evaluate(() => document.activeElement.textContent.trim())}`);
  }
  await p.click('#grille-pop .gp-steps button:has-text("Télépaiement")'); await p.waitForTimeout(300);
  console.log('dernière étape → ouverte :', !!(await p.$('#grille-pop')), '|', await p.textContent('#grille-pop .gp-state'), '| case', await p.$eval(td, (x) => x.textContent));
  await p.screenshot({ path: O + 'pop-persist.png' });
  await p.click('#grille-pop [data-action=grille-pop-close]'); await p.waitForTimeout(100);
  console.log('bouton Fermer :', !(await p.$('#grille-pop')), '| focus revenu sur la case :', await p.evaluate((sel) => document.activeElement === document.querySelector(sel), td));
  await p.click(td); await p.waitForSelector('#grille-pop'); await p.keyboard.press('Escape');
  console.log('Échap :', !(await p.$('#grille-pop')));
  await p.click(td); await p.waitForSelector('#grille-pop'); await p.click('h1');
  console.log('clic extérieur :', !(await p.$('#grille-pop')));
  await p.click(td); await p.waitForSelector('#grille-pop'); await p.click('#grille-pop [data-action=open-mission]'); await p.waitForTimeout(200);
  console.log('ouvrir la mission : fenêtre fermée', !(await p.$('#grille-pop')), '| modale', await p.$eval('#modal', (d) => d.open));
  console.log('erreurs', errors);
  await b.close();
})();
