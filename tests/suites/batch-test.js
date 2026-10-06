const { chromium } = require('playwright');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('http://localhost:8765/');
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!');
  await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  for (const [nom, siren] of [['SARL CYCLES', '444444444'], ['PHARMACIE DU CENTRE', '333333333']]) {
    await p.click('a[data-nav=dossiers]'); await p.click('main [data-action=new-client]');
    await p.fill('#modal input[name=nom]', nom); await p.fill('#modal input[name=siren]', siren); await p.click('#modal button[type=submit]'); await p.waitForSelector('.grid-detail');
  }
  await p.goto('http://localhost:8765/#/fec/lot'); await p.waitForSelector('.fec-drop');
  const t0 = Date.now();
  const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('.fec-drop')]);
  await ch.setFiles(['444444444FEC20251231.txt', '123456789FEC20251231.txt', '222222222FEC20251231.txt', '333333333FEC20251231.txt', 'pas-un-fec.txt', 'situ/444444444FEC20261231.txt'].map((f) => D + f));
  await p.waitForFunction(() => !document.querySelector('.fec-loading') && document.querySelector('.dtable.batch'), null, { timeout: 120000 });
  console.log('durée', Date.now() - t0, 'ms');
  console.log('KPI :', await p.$$eval('.fec-kpis .kpi', (k) => k.map((x) => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
  console.log(await p.$$eval('.dtable.batch tbody tr', (t) => t.map((r) => '  ' + r.textContent.replace(/\s+/g, ' ').trim()).join('\n')));
  await p.screenshot({ path: O + 'batch.png', fullPage: true });
  await p.click('button[data-action=batch-save]'); console.log('toast :', await p.textContent('#toast'));
  await p.click('button[data-action=batch-xlsx]');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#ask button[type=submit]')]); await dl.saveAs(O + 'portefeuille.xlsx');
  // Ouvrir le dossier pharmacie
  await p.click('.dtable.batch tr:has-text("PHARMACIE DU CENTRE") button[data-action=batch-open]'); await p.waitForSelector('.fec-meta');
  console.log('ouvert :', await p.textContent('h1'), '|', await p.textContent('.fec-file'), '|', await p.$eval('select[data-fec=client]', (s) => s.selectedOptions[0].textContent));
  await p.goto('http://localhost:8765/#/fec/lot'); await p.waitForSelector('.dtable.batch');
  console.log('lot conservé :', (await p.$$('.dtable.batch tbody tr')).length, 'lignes');
  // Mobile
  const m = await (await b.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, locale: 'fr-FR' })).newPage();
  await m.goto('http://localhost:8765/');
  await m.fill('input[name=p1]', 'Cabinet-Test-2026!'); await m.fill('input[name=p2]', 'Cabinet-Test-2026!');
  await m.check('input[name=ack]'); await m.click('button[type=submit]'); await m.waitForSelector('.layout');
  await m.goto('http://localhost:8765/#/fec/lot'); await m.waitForSelector('.fec-drop');
  console.log('débordement mobile :', await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1));
  console.log('erreurs', errors);
  await b.close();
})();
