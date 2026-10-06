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
  await p.goto('http://localhost:8765/#/fec'); await p.waitForSelector('.fec-drop');
  let [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('.fec-drop')]);
  await ch.setFiles(D + '123456789FEC20251231.txt'); await p.waitForSelector('.fec-meta');
  await p.click('button[data-action=fec-tab][data-tab=rappro]');
  for (const f of ['releve-2025.cfonb', 'releve-2025.ofx', 'releve-2025-camt053.xml', 'releve-2025.csv']) {
    if (await p.$('button[data-action=rappro-reset]')) await p.click('button[data-action=rappro-reset]');
    [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('button[data-action=rappro-import]')]);
    await ch.setFiles(D + f);
    await p.waitForSelector('.fec-kpis', { timeout: 10000 }).catch(() => {});
    const k = await p.$$eval('.fec-kpis .kpi', (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ')).catch(() => '—');
    const etat = await p.$$eval('section.card:has(h2:text-matches("État de rapprochement")) tr', (t) => t.map((r) => r.textContent.replace(/\s+/g, ' ').trim()).join(' / ')).catch(() => '—');
    console.log(`\n[${f}] ${k}\n   ${etat}`);
  }
  console.log('non comptabilisées :', await p.$$eval('section.card:has(h2:text-matches("non comptabilisées")) tbody tr', (t) => t.map((r) => r.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
  console.log('absentes du relevé :', await p.$$eval('section.card:has(h2:text-matches("Écritures absentes")) tbody tr', (t) => t.map((r) => r.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
  await p.screenshot({ path: O + 'b1-rappro.png', fullPage: true });
  await p.click('button[data-action=fec-tab][data-tab=pieces]');
  await p.click('button[data-action=pieces-mode][data-mode=situation]');
  console.log('pièces (catégorie relevé) :', await p.$$eval('.pieces-group:has(h3:text-matches("non comptabilisées")) .piece span', (s) => s.map((x) => x.textContent).join(' | ')));
  console.log('erreurs', errors);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
