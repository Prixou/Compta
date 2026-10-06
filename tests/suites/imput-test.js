const { chromium } = require('playwright');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
const { fecTab, fecMonth } = require('./lib');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' })).newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const PW = 'Cabinet-Test-2026!';
  await p.goto('http://localhost:8765/');
  await p.fill('input[name=p1]', PW); await p.fill('input[name=p2]', PW); await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.goto('http://localhost:8765/#/fec'); await p.waitForSelector('.fec-drop');
  const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('.fec-drop')]);
  await ch.setFiles(D + '444444444FEC20251231-imput.txt'); await p.waitForSelector('.fec-meta');
  for (const tab of ['achats', 'clients']) {
    await fecTab(p, tab, 0); await p.waitForTimeout(150);
    const li = p.locator('.fec-check', { hasText: 'imputés sur un autre' }).first();
    console.log(`\n${tab} :`, (await li.locator('strong').first().textContent()), '—', (await li.locator('.fec-check-text .muted').first().textContent()).slice(0, 120));
    console.log((await li.locator('.wp-el-text').allTextContents()).map((x) => '   ' + x).join('\n'));
  }
  await fecTab(p, 'ecritures', 0); await p.waitForTimeout(150);
  const sec = p.locator('section.card', { hasText: 'Reclassements entre comptes de tiers' });
  console.log('\nécritures :', (await sec.locator('.ecr-prop').allTextContents()).map((x) => x.replace(/\s+/g, ' ').trim().slice(0, 260)).join('\n   '));
  // Élément justifié → écriture écartée
  await fecTab(p, 'clients', 0); await p.waitForTimeout(150);
  const li = p.locator('.fec-check', { hasText: 'imputés sur un autre' }).first();
  await li.locator('summary').click();
  await li.locator('select[data-wp=el-st]').first().selectOption('justifie'); await p.waitForTimeout(200);
  await fecTab(p, 'ecritures', 0); await p.waitForTimeout(150);
  console.log('après justification :', (await p.locator('section.card', { hasText: 'Reclassements entre comptes de tiers' }).locator('.ecr-prop.off').count()), 'écriture(s) écartée(s)');
  // Espace Mois : contrôles de la saisie du mois
  const saisie = async (ym) => {
    await fecTab(p, 'mois-saisie', 0); await fecMonth(p, ym);
    console.log(`\nsaisie ${ym} — onglet :`, await p.textContent('.fec-tabs button[data-tab=mois-saisie]'), '| barre :', (await p.textContent('.wp-bar')).replace(/\s+/g, ' ').trim());
    console.log((await p.$$eval('.fec-checks > .fec-check', (l) => l.map((x) => '   ' + x.querySelector('.lvl').textContent.trim() + ' ' + x.querySelector('strong').textContent + (x.querySelector('.badge.beta') ? ' [bêta]' : '') + ' — ' + Array.from(x.querySelectorAll('.wp-el-text')).map((e) => e.textContent).join(' / ').slice(0, 200)))).join('\n'));
  };
  await saisie('2025-03'); await saisie('2025-07'); await saisie('2025-11');
  console.log('KPI du mois :', await p.$$eval('.mois-head .kpi', (k) => k.map((x) => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
  await p.click('button[data-action=fec-month][data-step="-1"]'); await p.waitForTimeout(150);
  console.log('mois précédent :', await p.$eval('input[data-fec=month]', (i) => i.value));
  // Le contrôle de TVA suit le mois choisi
  await fecTab(p, 'tva', 150);
  console.log('TVA :', (await p.textContent('.card-head h2')).replace(/\s+/g, ' ').trim());
  await p.screenshot({ path: O + 'mois-saisie.png', fullPage: true });
  console.log('erreurs', errors);
  await b.close();
})();
