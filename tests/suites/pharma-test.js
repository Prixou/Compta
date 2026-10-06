const { chromium } = require('playwright');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' })).newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('http://localhost:8765/');
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!');
  await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  const pick = async (sel, file) => { const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click(sel)]); await ch.setFiles(D + file); };
  const tabTxt = async (tab) => { await p.click(`button[data-action=fec-tab][data-tab=${tab}]`); await p.waitForTimeout(100); return p.innerText('main'); };
  // 1. FEC classique dans l'analyseur classique
  await p.goto('http://localhost:8765/#/fec'); await p.waitForSelector('.fec-drop');
  await pick('.fec-drop', '123456789FEC20251231.txt'); await p.waitForSelector('.fec-meta');
  console.log('classique — suggestion pharmacie ?', !!(await p.$('[data-action=fec-switch]')), '| onglets :', await p.$$eval('.fec-tabs button', (b) => b.map((x) => x.textContent).join(' · ')));
  // 2. FEC pharmacie (non lettré) dans l'analyseur pharmacie
  await p.goto('http://localhost:8765/#/fec/pharma'); await p.waitForSelector('main h1');
  console.log('pharmacie — vide au départ :', !!(await p.$('.fec-drop')), '| titre :', await p.textContent('main h1'));
  await pick('.fec-drop', '222222222FEC20251231.txt'); await p.waitForSelector('.fec-meta');
  console.log('onglets :', await p.$$eval('.fec-tabs button', (b) => b.map((x) => x.textContent).join(' · ')));
  console.log('KPI :', await p.$$eval('.fec-kpis .kpi', (k) => k.map((x) => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
  console.log('Points de révision :\n  ' + (await p.$$eval('section.card:has(h2:text-matches("Points de révision")) .fec-check', (l) => l.map((x) => x.querySelector('.lvl').textContent.trim() + ' ' + x.querySelector('strong').textContent + ' — ' + (x.querySelector('.muted') || { textContent: '' }).textContent.slice(0, 110)))).join('\n  '));
  await p.screenshot({ path: O + 'ph1-synthese.png', fullPage: true });
  await p.click('button[data-action=fec-tab][data-tab=tp]'); await p.waitForTimeout(100);
  console.log('Tiers payant :\n  ' + (await p.$$eval('table.tp tbody tr', (t) => t.map((r) => Array.from(r.children).map((c) => c.textContent.trim()).join(' | ')))).join('\n  '));
  await p.screenshot({ path: O + 'ph2-tp.png', fullPage: true });
  await p.click('button[data-action=fec-tab][data-tab=catva]'); await p.waitForTimeout(100);
  console.log('CA & TVA :\n  ' + (await p.$$eval('main section.card >> nth=1 >> tbody tr', (t) => t.map((r) => r.textContent.replace(/\s+/g, ' ').trim()))).join('\n  '));
  await p.screenshot({ path: O + 'ph3-catva.png', fullPage: true });
  await p.click('button[data-action=fec-tab][data-tab=pieces]'); await p.click('button[data-action=pieces-mode][data-mode=bilan]'); await p.waitForTimeout(100);
  console.log('Pièces (bilan) :\n  ' + (await p.$$eval('.pieces-group', (g) => g.map((x) => x.querySelector('h3').textContent.replace(/\s+/g, ' ').trim() + ' : ' + Array.from(x.querySelectorAll('.piece span')).map((s) => s.textContent).join(' / ')))).join('\n  '));
  // 3. Retour à l'analyseur classique : son FEC est toujours là
  await p.click('.fec-profiles a[href="#/fec"]'); await p.waitForFunction(() => document.querySelector('main h1').textContent.includes('classique'));
  console.log('classique conservé :', await p.textContent('.fec-file'));
  // 4. FEC pharmacie déposé dans le classique → suggestion et bascule
  await pick('button[data-action=fec-pick]', '333333333FEC20251231.txt'); await p.waitForFunction(() => (document.querySelector('.fec-file') || {}).textContent === '333333333FEC20251231.txt');
  await p.goto('http://localhost:8765/#/fec/pharma'); await p.waitForFunction(() => document.querySelector('main h1').textContent.includes('Pharmacie'));
  console.log('pharmacie conservé :', await p.textContent('.fec-file'));
  await p.goto('http://localhost:8765/#/fec'); await p.waitForFunction(() => document.querySelector('main h1').textContent.includes('classique'));
  console.log('suggestion affichée :', (await p.textContent('.banner.info')).replace(/\s+/g, ' ').trim().slice(0, 90));
  await p.click('[data-action=fec-switch]'); await p.waitForFunction(() => document.querySelector('main h1').textContent.includes('Pharmacie'));
  console.log('après bascule :', await p.textContent('main h1'), '·', await p.textContent('.fec-file'));
  await p.click('button[data-action=fec-tab][data-tab=tp]'); await p.waitForTimeout(100);
  console.log('Lettré — tiers payant :\n  ' + (await p.$$eval('table.tp tbody tr', (t) => t.map((r) => Array.from(r.children).map((c) => c.textContent.trim()).join(' | ')))).join('\n  '));
  console.log('Factures > 60 j :', await p.$$eval('.tp-detail summary', (s) => s.map((x) => x.textContent.trim()).join(' | ')));
  await p.screenshot({ path: O + 'ph4-lettre.png', fullPage: true });
  // 5. Export Excel
  await p.click('button[data-action=fec-export]');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#ask button[type=submit]')]);
  await dl.saveAs(O + 'analyse-pharma.xlsx');
  console.log('erreurs', errors);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
