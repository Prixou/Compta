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
  const rows = async () => p.$$eval('.grille tbody tr', (t) => t.slice(0, 6).map((r) => Array.from(r.children).slice(0, 4).map((c) => c.textContent.trim()).join(' | ')));
  console.log('mode par défaut :', await p.$eval('.seg button.on[data-action=grille-mode]', (b) => b.textContent));
  console.log('tri N° :', await rows());
  await p.click('.grille th[data-key=nom]'); await p.waitForTimeout(150);
  console.log('tri nom :', await rows());
  await p.click('.grille th[data-key=nom]'); await p.waitForTimeout(150);
  console.log('tri nom inversé :', (await rows()).slice(0, 3), '| en-tête :', await p.$eval('.grille th[data-key=nom]', (t) => t.textContent));
  await p.selectOption('select[data-grille-sort]', 'jour'); await p.waitForTimeout(150);
  console.log('tri jour :', await rows());
  await p.selectOption('select[data-grille-sort]', 'tva'); await p.waitForTimeout(150);
  console.log('tri TVA :', (await rows()).map((r) => r.split(' | ')[2]).join(','));
  await p.selectOption('select[data-grille-sort]', 'code'); await p.waitForTimeout(150);
  // Étapes : clic sur une case à faire
  const cell = '.grille tbody tr:nth-child(1) td[data-action=grille-steps] >> nth=0';
  const id = await p.$eval('.grille tbody tr:nth-child(1) td[data-action=grille-steps]', (td) => td.dataset.id);
  const td = `.grille td[data-id="${id}"]`;
  console.log('case avant :', JSON.stringify(await p.$eval(td, (x) => x.textContent)));
  if (await p.$('#grille-pop')) await p.keyboard.press('Escape'); await p.click(td); await p.waitForSelector('#grille-pop');
  console.log('étapes proposées :', await p.$$eval('#grille-pop .gp-steps button', (l) => l.map((x) => x.textContent.trim()).join(' | ')));
  await p.screenshot({ path: O + 'grille-pop.png' });
  await p.click('#grille-pop .gp-steps button >> nth=1'); await p.waitForTimeout(200);
  console.log('après « 2e étape » :', JSON.stringify(await p.$eval(td, (x) => x.textContent)), '| classe', await p.$eval(td, (x) => x.className), '| toast :', await p.textContent('#toast'));
  console.log('info-bulle :', (await p.$eval(td, (x) => x.title)).replace(/\n/g, ' / '));
  // Reculer d'une étape : re-cliquer sur la même étape la décoche
  if (await p.$('#grille-pop')) await p.keyboard.press('Escape'); await p.click(td); await p.waitForSelector('#grille-pop'); await p.click('#grille-pop .gp-steps button.current'); await p.waitForTimeout(200);
  console.log('re-clic sur l\'étape courante :', JSON.stringify(await p.$eval(td, (x) => x.textContent)));
  // Dernière étape : termine
  if (await p.$('#grille-pop')) await p.keyboard.press('Escape'); await p.click(td); await p.waitForSelector('#grille-pop'); const n = (await p.$$('#grille-pop .gp-steps button')).length;
  await p.click(`#grille-pop .gp-steps button >> nth=${n - 1}`); await p.waitForTimeout(300);
  console.log('dernière étape :', JSON.stringify(await p.$eval(td, (x) => x.textContent)), await p.$eval(td, (x) => x.className));
  // Fermeture par Échap et clic extérieur
  if (await p.$('#grille-pop')) await p.keyboard.press('Escape'); await p.click(td); await p.waitForSelector('#grille-pop'); await p.keyboard.press('Escape');
  console.log('Échap ferme :', !(await p.$('#grille-pop')));
  if (await p.$('#grille-pop')) await p.keyboard.press('Escape'); await p.click(td); await p.waitForSelector('#grille-pop'); await p.click('h1');
  console.log('clic extérieur ferme :', !(await p.$('#grille-pop')));
  // Remettre à faire
  if (await p.$('#grille-pop')) await p.keyboard.press('Escape'); await p.click(td); await p.click('#grille-pop [data-i="-1"]'); await p.waitForTimeout(200);
  console.log('remis à faire :', JSON.stringify(await p.$eval(td, (x) => x.textContent)));
  // Tri conservé après rechargement
  await p.click('.grille th[data-key=jour]'); await p.reload();
  await p.fill('input[name=password]', 'Cabinet-Test-2026!'); await p.click('form[data-form=unlock] button[type=submit]'); await p.waitForSelector('.layout');
  await p.goto('http://localhost:8765/#/grille'); await p.waitForSelector('.grille');
  console.log('tri après rechargement :', await p.$eval('select[data-grille-sort]', (s) => s.value));
  await p.screenshot({ path: O + 'grille.png', fullPage: false });
  // Mobile
  const m = await (await b.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, locale: 'fr-FR' })).newPage();
  await m.goto('http://localhost:8765/');
  await m.fill('input[name=p1]', 'Cabinet-Test-2026!'); await m.fill('input[name=p2]', 'Cabinet-Test-2026!');
  await m.check('input[name=ack]'); await m.click('button[type=submit]'); await m.waitForSelector('.layout');
  const [ch2] = await Promise.all([m.waitForEvent('filechooser'), m.click('main [data-action=import-sheet]')]);
  await ch2.setFiles(D + 'import-dossiers.xlsx'); await m.waitForSelector('#modal .imp-cols'); await m.click('#modal [data-action=apply-import]'); await m.waitForTimeout(300);
  await m.goto('http://localhost:8765/#/grille'); await m.waitForSelector('.grille');
  await m.click('.grille td[data-action=grille-steps] >> nth=0'); await m.waitForSelector('#grille-pop');
  console.log('mobile : débordement', await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), '| pop dans l\'écran', await m.$eval('#grille-pop', (x) => { const r = x.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; }));
  await m.screenshot({ path: O + 'grille-mobile.png' });
  console.log('erreurs', errors);
  await b.close();
})();
