const { chromium } = require('playwright');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
const { fecTab, fecMonth } = require('./lib');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  const external = []; p.on('request', (r) => { if (!r.url().startsWith('http://localhost:8765')) external.push(r.url()); });
  await p.goto('http://localhost:8765/');
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!');
  await p.check('input[name=ack]'); await p.click('button[type=submit]');
  await p.waitForSelector('.layout');
  // Dossier avec le SIREN du FEC
  await p.click('main [data-action=new-client]');
  await p.fill('#modal input[name=nom]', 'SARL EXEMPLE'); await p.selectOption('#modal select[name=forme]', 'SARL');
  await p.fill('#modal input[name=siren]', '123 456 789'); await p.fill('#modal input[name=code]', '009999');
  await p.click('#modal button[type=submit]'); await p.waitForSelector('.grid-detail');

  await p.click('a[data-nav=fec]'); await p.waitForSelector('.fec-drop');
  await p.screenshot({ path: O + 'f0-accueil.png' });
  const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('.fec-drop')]);
  await ch.setFiles(D + '123456789FEC20251231.txt');
  await p.waitForSelector('.fec-meta', { timeout: 30000 });
  console.log('meta :', (await p.textContent('.fec-meta-grid')).replace(/\s+/g, ' ').trim());
  console.log('dossier rattaché :', await p.$eval('select[data-fec=client]', (s) => s.selectedOptions[0].textContent));
  console.log('KPI :', await p.$$eval('.fec-kpis .kpi', (k) => k.map((x) => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
  console.log('points de révision :', await p.$$eval('section.card:has(h2:text-matches("Points de révision")) .fec-check', (l) => l.map((x) => x.querySelector('.lvl').textContent + ' ' + x.querySelector('strong').textContent).join(' | ')));
  // Info-bulle
  await p.hover('.viz rect.viz-hit >> nth=5');
  console.log('info-bulle :', (await p.textContent('#viz-tip')).replace(/\s+/g, ' '));
  await p.screenshot({ path: O + 'f1-synthese.png', fullPage: true });
  for (const tab of ['conformite', 'sig', 'balance', 'details']) {
    await fecTab(p, tab, 0);
    await p.waitForTimeout(150);
    await p.screenshot({ path: O + `f2-${tab}.png`, fullPage: true });
  }
  await fecTab(p, 'balance', 0);
  await p.fill('input[data-fec=q]', '512'); await p.waitForTimeout(150);
  console.log('balance filtrée 512 :', await p.$$eval('.balance tbody tr', (t) => t.map((r) => r.textContent.replace(/\s+/g, ' ').trim())));
  console.log('focus conservé dans la recherche :', await p.evaluate(() => document.activeElement && document.activeElement.dataset.fec));
  // Export Excel
  await p.click('button[data-action=fec-export]');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#ask button[type=submit]')]);
  await dl.saveAs(O + 'analyse-fec.xlsx');
  // Enregistrer + mission
  await p.click('button[data-action=fec-save]');
  console.log('toast :', await p.textContent('#toast'));
  await p.click('button[data-action=fec-mission]');
  console.log('toast :', await p.textContent('#toast'));
  await p.click('a[data-nav=dossiers]'); await p.click('#dossier-list a, #dossier-list tbody tr');
  await p.waitForSelector('.fec-hist');
  console.log('carte dossier :', (await p.textContent('.fec-hist')).replace(/\s+/g, ' ').trim());
  await p.click('.mrow:has-text("Revue FEC 2025")');
  console.log('mission de revue :', await p.$$eval('#modal .steps li', (l) => l.map((x) => x.textContent.trim()).join(' | ')));
  await p.click('#modal [data-action=close-modal]');
  // Gros volume
  await p.click('a[data-nav=fec]');
  const t0 = Date.now();
  const [ch2] = await Promise.all([p.waitForEvent('filechooser'), p.click('button[data-action=fec-pick]')]);
  await ch2.setFiles(D + 'FEC-gros-volume.txt');
  await p.waitForSelector('.fec-progress', { timeout: 5000 }).catch(() => {});
  const pctSeen = await p.$eval('.fec-progress-label', (x) => x.textContent).catch(() => '(trop rapide)');
  await p.waitForSelector('.fec-meta', { timeout: 120000 });
  console.log('gros FEC (37 Mo, 302 437 lignes) :', Date.now() - t0, 'ms ; progression vue :', pctSeen);
  // Verrouillage : l'analyse est oubliée
  await p.click('.sidebar button[data-action=lock]');
  await p.fill('input[name=password]', 'Cabinet-Test-2026!'); await p.click('button[type=submit]');
  await p.waitForSelector('.layout'); await p.goto('http://localhost:8765/#/fec'); await p.waitForSelector('main h1');
  console.log('après verrouillage, analyse effacée :', !!(await p.$('.fec-drop')));
  // Mobile + sombre
  const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'dark', locale: 'fr-FR' })).newPage();
  m.on('pageerror', (e) => errors.push('PAGEERROR(m) ' + e.message));
  await m.goto('http://localhost:8765/');
  await m.fill('input[name=p1]', 'Cabinet-Test-2026!'); await m.fill('input[name=p2]', 'Cabinet-Test-2026!');
  await m.check('input[name=ack]'); await m.click('button[type=submit]'); await m.waitForSelector('.layout');
  await m.goto('http://localhost:8765/#/fec'); await m.waitForSelector('.fec-drop');
  const [ch3] = await Promise.all([m.waitForEvent('filechooser'), m.click('.fec-drop')]);
  await ch3.setFiles(D + '123456789FEC20251231.txt');
  await m.waitForSelector('.fec-meta');
  await m.screenshot({ path: O + 'f3-mobile-sombre.png', fullPage: true });
  console.log('débordement mobile :', await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth));
  console.log('externes :', external, '\nerreurs :', errors);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
