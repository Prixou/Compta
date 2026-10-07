const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
// Montant de la déclaration de TVA (à payer, crédit, néant) dans le suivi mensuel et la fiche de mission.
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const PW = 'Cabinet-Test-2026!';
  await p.goto('http://localhost:8765/');
  await p.fill('input[name=p1]', PW); await p.fill('input[name=p2]', PW); await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.click('a[data-nav=dossiers]'); await p.click('main [data-action=new-client]');
  await p.fill('#modal input[name=nom]', 'SARL BOULANGERIE MARTIN'); await p.fill('#modal input[name=siren]', '111111111');
  await p.selectOption('#modal select[name=regimeTva]', 'Réel normal (mensuel)'); await p.click('#modal button[type=submit]'); await p.waitForSelector('.grid-detail');
  await p.click('main [data-action=new-mission]'); await p.selectOption('#modal select[name=type]', 'tva');
  await p.fill('#modal input[name=exercice]', '09/2026'); await p.fill('#modal input[name=titre]', 'TVA 09/2026'); await p.selectOption('#modal select[name=recurrence]', 'mensuelle');
  await p.click('#modal button[type=submit]'); await p.waitForTimeout(150);
  // 1. Suivi mensuel : montant saisi dans la fenêtre des étapes
  await p.goto('http://localhost:8765/#/grille'); await p.waitForSelector('select[data-grille=annee]');
  await p.selectOption('select[data-grille=annee]', '2026'); await p.waitForSelector('.grille');
  const cell = (col) => p.locator('.grille tbody tr', { hasText: 'BOULANGERIE' }).locator(`td[data-col="${col}"]`);
  await cell(9).click(); await p.waitForSelector('#grille-pop .tva-amt');
  await p.fill('#grille-pop input[data-tva-net=montant]', '1234,5'); await p.press('#grille-pop input[data-tva-net=montant]', 'Tab'); await p.waitForTimeout(200);
  console.log('1. case :', (await cell(9).textContent()).trim(), '| champ :', await p.inputValue('#grille-pop input[data-tva-net=montant]'), '| info-bulle :', (await cell(9).getAttribute('title')).split('\n')[1]);
  await p.click('#grille-pop [data-action=grille-pop-close]');
  // 2. Fiche de la mission : crédit saisi avec un signe moins, puis néant
  await p.click('button[data-action=grille-mode][data-mode=fiche]'); await cell(9).click(); await p.waitForSelector('#modal .tva-amt');
  await p.fill('#modal input[data-tva-net=montant]', '-560'); await p.press('#modal input[data-tva-net=montant]', 'Tab'); await p.waitForTimeout(200);
  console.log('2. crédit :', await p.$eval('#modal select[data-tva-net=sens]', (s) => s.value), await p.inputValue('#modal input[data-tva-net=montant]'), '| case :', (await cell(9).textContent()).trim());
  await p.selectOption('#modal select[data-tva-net=sens]', 'neant'); await p.waitForTimeout(200);
  console.log('   néant : champ désactivé ?', await p.$eval('#modal input[data-tva-net=montant]', (i) => i.disabled), '| case :', (await cell(9).textContent()).trim());
  await p.selectOption('#modal select[data-tva-net=sens]', 'payer'); await p.fill('#modal input[data-tva-net=montant]', '2 450'); await p.press('#modal input[data-tva-net=montant]', 'Tab'); await p.waitForTimeout(200);
  await p.fill('#modal input[data-tva-net=montant]', 'abc'); await p.press('#modal input[data-tva-net=montant]', 'Tab'); await p.waitForTimeout(200);
  console.log('   saisie invalide :', await p.textContent('#toast'), '| case :', (await cell(9).textContent()).trim());
  // 3. Mission terminée : l'occurrence suivante ne reprend pas le montant
  await p.click('#modal [data-action=complete-mission]'); await p.waitForTimeout(300);
  await p.goto('http://localhost:8765/#/tableau'); await p.goto('http://localhost:8765/#/grille'); await p.waitForSelector('.grille');
  console.log('3. septembre :', (await cell(9).textContent()).trim(), '| octobre :', (await cell(10).textContent()).trim());
  // 4. Liste des missions
  await p.goto('http://localhost:8765/#/missions'); await p.selectOption('select[data-filter="mf.statut"]', 'toutes'); await p.waitForTimeout(150);
  console.log('4. liste :', await p.$$eval('.mrow', (l) => l.map((x) => x.querySelector('.mrow-title').textContent + ' [' + ((x.querySelector('.tva-chip') || {}).textContent || '—') + ']').join(' | ')));
  // 5. Export Excel : feuille des montants
  await p.goto('http://localhost:8765/#/grille'); await p.waitForSelector('.grille');
  await p.click('button[data-action=export-grille]');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#ask button[type=submit]')]);
  await dl.saveAs(O + 'grille-montants.xlsx');
  const xml = fs.readFileSync(O + 'grille-montants.xlsx').toString('utf8');
  console.log('5. feuilles :', (xml.match(/<sheet name="[^"]+"/g) || []).join(' '), '| 2450 présent ?', /<v>2450<\/v>/.test(xml));
  await p.screenshot({ path: O + 'tvanet-grille.png' });
  // Mobile
  await p.setViewportSize({ width: 375, height: 812 }); await p.reload(); await p.fill('input[name=password]', PW); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.goto('http://localhost:8765/#/grille'); await p.waitForSelector('.grille');
  await p.click('button[data-action=grille-mode][data-mode=etapes]'); await cell(10).click(); await p.waitForSelector('#grille-pop .tva-amt');
  console.log('mobile : fenêtre dans l\'écran ?', await p.$eval('#grille-pop', (x) => x.getBoundingClientRect().right <= window.innerWidth + 1));
  console.log('erreurs', errors);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
