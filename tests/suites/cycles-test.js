const { chromium } = require('playwright');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await p.goto('http://localhost:8765/');
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!');
  await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.click('main [data-action=new-client]');
  await p.fill('#modal input[name=nom]', 'SARL CYCLES'); await p.selectOption('#modal select[name=forme]', 'SARL');
  await p.fill('#modal input[name=siren]', '444444444'); await p.click('#modal button[type=submit]'); await p.waitForSelector('.grid-detail');
  await p.goto('http://localhost:8765/#/fec'); await p.waitForSelector('.fec-drop');
  const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('.fec-drop')]);
  await ch.setFiles(D + '444444444FEC20251231.txt');
  await p.waitForSelector('.fec-meta', { timeout: 30000 });
  console.log('onglets :', await p.$$eval('.fec-tabs button', (b) => b.map((x) => x.textContent).join(' · ')));
  console.log('tuiles :', await p.$$eval('.cycle-tile', (k) => k.map((x) => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
  await p.screenshot({ path: O + 'cy0-synthese.png', fullPage: true });
  for (const tab of ['achats', 'charges', 'clients', 'treso']) {
    await p.click(`button[data-action=fec-tab][data-tab=${tab}]`); await p.waitForTimeout(150);
    console.log(`\n=== ${tab.toUpperCase()}`);
    console.log('KPI :', await p.$$eval('.fec-kpis .kpi', (k) => k.map((x) => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
    console.log(await p.$$eval('.fec-checks .fec-check', (l) => l.map((x) => '  ' + x.querySelector('.lvl').textContent + ' ' + x.querySelector('strong').textContent + ' — ' + ((x.querySelector('.muted') || {}).textContent || '').slice(0, 150)).join('\n')));
    await p.screenshot({ path: O + `cy-${tab}.png`, fullPage: true });
  }
  // Échéance modifiée
  await p.click('button[data-action=fec-tab][data-tab=clients]');
  await p.fill('input[data-fec=terme]', '60'); await p.press('input[data-fec=terme]', 'Tab'); await p.waitForTimeout(200);
  console.log('\nD441-6 clients à 60 j :', await p.$$eval('.d441 tbody tr', (t) => t.map((r) => r.textContent.replace(/\s+/g, ' ').trim()).join(' / ')));
  // Pièces
  await p.click('button[data-action=fec-tab][data-tab=pieces]'); await p.waitForTimeout(150);
  console.log('\npièces :', await p.$$eval('.pieces-group', (g) => g.map((x) => x.querySelector('h3').textContent.replace(/\s+/g, ' ') + ' : ' + Array.from(x.querySelectorAll('.piece span')).map((s) => s.textContent).filter((t) => /espèces|professionnel|contravention|DAS2|charges constatées|Notes de frais|Factures de vente n°/.test(t)).join(' || ')).join('\n')));
  // Mission + export
  await p.click('button[data-action=fec-mission]');
  console.log('\ntoast :', await p.textContent('#toast'));
  await p.click('button[data-action=fec-export]');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#ask button[type=submit]')]);
  await dl.saveAs(O + 'analyse-cycles.xlsx');
  // Mobile
  const m = await (await b.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'dark', locale: 'fr-FR' })).newPage();
  m.on('pageerror', (e) => errors.push('PAGEERROR(m) ' + e.message));
  await m.goto('http://localhost:8765/');
  await m.fill('input[name=p1]', 'Cabinet-Test-2026!'); await m.fill('input[name=p2]', 'Cabinet-Test-2026!');
  await m.check('input[name=ack]'); await m.click('button[type=submit]'); await m.waitForSelector('.layout');
  await m.goto('http://localhost:8765/#/fec'); await m.waitForSelector('.fec-drop');
  const [ch3] = await Promise.all([m.waitForEvent('filechooser'), m.click('.fec-drop')]);
  await ch3.setFiles(D + '444444444FEC20251231.txt'); await m.waitForSelector('.fec-meta');
  const over = [];
  for (const tab of ['synthese', 'achats', 'charges', 'clients', 'treso']) {
    await m.click(`button[data-action=fec-tab][data-tab=${tab}]`); await m.waitForTimeout(150);
    if (await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) over.push(tab);
    await m.screenshot({ path: O + `cym-${tab}.png`, fullPage: true });
  }
  console.log('débordement mobile :', over);
  // Pharmacie : pas d'onglet Clients
  await p.goto('http://localhost:8765/#/fec/pharma'); await p.waitForSelector('.fec-drop');
  const [ch4] = await Promise.all([p.waitForEvent('filechooser'), p.click('.fec-drop')]);
  await ch4.setFiles(D + '333333333FEC20251231.txt'); await p.waitForSelector('.fec-meta');
  console.log('\npharma onglets :', await p.$$eval('.fec-tabs button', (b) => b.map((x) => x.textContent).join(' · ')));
  await p.click('button[data-action=fec-tab][data-tab=treso]'); await p.waitForTimeout(150);
  console.log('pharma tréso :', await p.$$eval('.fec-checks .fec-check strong', (l) => l.map((x) => x.textContent).join(' | ')));
  console.log('erreurs', errors);
  await b.close();
})();
