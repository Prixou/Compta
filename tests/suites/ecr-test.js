const { chromium } = require('playwright');
const fs = require('fs');
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
  await ch.setFiles(D + '444444444FEC20251231.txt'); await p.waitForSelector('.fec-meta');
  await p.click('button[data-action=fec-tab][data-tab=ecritures]'); await p.waitForTimeout(150);
  console.log('KPI :', await p.$$eval('.fec-kpis .kpi', (k) => k.map((x) => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
  console.log(await p.$$eval('.ecr-prop', (l) => l.map((x) => '  - ' + x.querySelector('strong').textContent + ' :: ' + Array.from(x.querySelectorAll('.ecr-lines tbody tr')).map((r) => r.textContent.replace(/\s+/g, ' ').trim()).join(' / ')).join('\n')));
  await p.screenshot({ path: O + 'ecr-1.png', fullPage: true });
  // Modifier un montant, décocher une proposition, changer le taux
  await p.fill('input[data-ecr-amt^="cca:"]', '1800'); await p.press('input[data-ecr-amt^="cca:"]', 'Tab'); await p.waitForTimeout(150);
  await p.uncheck('input[data-ecr-sel="is"]').catch(() => console.log('(pas d\'IS)')); await p.waitForTimeout(150);
  await p.fill('input[data-ecr=taux]', '100'); await p.press('input[data-ecr=taux]', 'Tab'); await p.waitForTimeout(150);
  console.log('après modif :', await p.$$eval('.fec-kpis .kpi', (k) => k.map((x) => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
  for (const [act, file] of [['ecr-fec', 'ecr.txt'], ['ecr-xlsx', 'ecr.xlsx'], ['ecr-csv', 'ecr.csv']]) {
    await p.click(`button[data-action=${act}]`);
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#ask button[type=submit]')]);
    await dl.saveAs(O + file); console.log('export', file, dl.suggestedFilename());
  }
  console.log('erreurs', errors);
  await b.close();
})();
