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
  const PW = 'Cabinet-Test-2026!';
  await p.goto('http://localhost:8765/');
  await p.fill('input[name=p1]', PW); await p.fill('input[name=p2]', PW); await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.click('main [data-action=new-client]'); await p.fill('#modal input[name=nom]', 'BISTROT DU PORT'); await p.fill('#modal input[name=siren]', '777777777');
  await p.selectOption('#modal select[name=regimeTva]', 'Réel normal (mensuel)'); await p.fill('#modal input[name=jourTva]', '19');
  await p.click('#modal button[type=submit]'); await p.waitForSelector('.grid-detail');
  // Mission TVA 06/2025
  await p.click('main [data-action=new-mission]'); await p.selectOption('#modal select[name=type]', 'tva');
  await p.fill('#modal input[name=exercice]', '06/2025'); await p.fill('#modal input[name=titre]', 'TVA 06/2025'); await p.click('#modal button[type=submit]'); await p.waitForTimeout(150);
  await p.goto('http://localhost:8765/#/fec'); await p.waitForSelector('.fec-drop');
  const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('.fec-drop')]);
  await ch.setFiles(D + '777777777FEC20251231.txt'); await p.waitForSelector('.fec-meta');
  console.log('onglets :', await p.$$eval('.fec-tabs button', (l) => l.map((x) => x.textContent).join(' · ')));
  await p.click('.fec-tabs button[data-tab=tva]'); await p.waitForSelector('.tva-draft');
  const dump = async (title) => {
    console.log(`\n===== ${title} :`, await p.$eval('main .card h2', (x) => x.textContent));
    console.log('KPI :', await p.$$eval('main .fec-kpis .kpi', (l) => l.map((x) => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
    console.log('CA3 :\n  ' + (await p.$$eval('.tva-draft tbody tr', (l) => l.map((x) => Array.from(x.cells).map((c) => c.textContent.trim()).join(' | ')))).join('\n  '));
    console.log('Contrôles :\n  ' + (await p.$$eval('section.card:has(h2:text-matches("^Contrôles")) .fec-check', (l) => l.map((x) => x.querySelector('.lvl').textContent + ' ' + x.querySelector('strong').textContent + ' — ' + ((x.querySelector('.fec-check-text .muted') || {}).textContent || '').slice(0, 140)))).join('\n  '));
  };
  await dump('défaut');
  for (const k of ['2025-02', '2025-03', '2025-04', '2025-06', '2025-07']) {
    await p.selectOption('select[data-tva=key]', k); await p.waitForTimeout(200);
    await dump(k);
  }
  await p.screenshot({ path: O + 'tva-juillet.png', fullPage: true });
  console.log('\nconcordance :\n  ' + (await p.$$eval('.tva-conc tbody tr', (l) => l.map((x) => Array.from(x.cells).map((c) => c.textContent.trim()).join(' | ')))).join('\n  '));
  // Trimestre
  await p.click('button[data-action=tva-kind][data-kind=quarter]'); await p.waitForTimeout(200);
  await dump('trimestre');
  await p.click('button[data-action=tva-kind][data-kind=month]'); await p.waitForTimeout(200);
  // Juin : montants déclarés + validation
  await p.selectOption('select[data-tva=key]', '2025-06'); await p.waitForTimeout(200);
  await p.fill('input[data-tva-decl=net]', '2456'); await p.dispatchEvent('input[data-tva-decl=net]', 'change'); await p.waitForTimeout(200);
  console.log('\ndéclaré :', (await p.$$eval('.fec-check', (l) => l.map((x) => x.textContent.replace(/\s+/g, ' ')).filter((t) => /déposée/.test(t)))).join(' / ').slice(0, 300));
  await p.click('button[data-action=tva-validate]'); await p.waitForTimeout(200);
  console.log('validation :', await p.textContent('#toast'), '|', (await p.textContent('.tva-validate')).replace(/\s+/g, ' ').trim());
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button[data-action=tva-xlsx]').then(() => p.click('#ask button[type=submit]'))]);
  console.log('export :', dl.suggestedFilename());
  await p.screenshot({ path: O + 'tva-juin.png', fullPage: true });
  // Mobile
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(200);
  console.log('débordement mobile :', await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
    await p.evaluate(() => Array.from(document.querySelectorAll('main *')).filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('.grid-wrap, .viz-scroll, .fec-tabs')).slice(0, 6).map((e) => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right))));
  console.log('erreurs', errors);
  await b.close();
})();
