const { chromium } = require('playwright');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
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
    await p.click(`.fec-tabs button[data-tab=${tab}]`); await p.waitForTimeout(150);
    const li = p.locator('.fec-check', { hasText: 'imputés sur un autre' }).first();
    console.log(`\n${tab} :`, (await li.locator('strong').first().textContent()), '—', (await li.locator('.fec-check-text .muted').first().textContent()).slice(0, 120));
    console.log((await li.locator('.wp-el-text').allTextContents()).map((x) => '   ' + x).join('\n'));
  }
  await p.click('.fec-tabs button[data-tab=ecritures]'); await p.waitForTimeout(150);
  const sec = p.locator('section.card', { hasText: 'Reclassements entre comptes de tiers' });
  console.log('\nécritures :', (await sec.locator('.ecr-prop').allTextContents()).map((x) => x.replace(/\s+/g, ' ').trim().slice(0, 260)).join('\n   '));
  // Élément justifié → écriture écartée
  await p.click('.fec-tabs button[data-tab=clients]'); await p.waitForTimeout(150);
  const li = p.locator('.fec-check', { hasText: 'imputés sur un autre' }).first();
  await li.locator('summary').click();
  await li.locator('select[data-wp=el-st]').first().selectOption('justifie'); await p.waitForTimeout(200);
  await p.click('.fec-tabs button[data-tab=ecritures]'); await p.waitForTimeout(150);
  console.log('après justification :', (await p.locator('section.card', { hasText: 'Reclassements entre comptes de tiers' }).locator('.ecr-prop.off').count()), 'écriture(s) écartée(s)');
  console.log('erreurs', errors);
  await b.close();
})();
