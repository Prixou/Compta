const { chromium } = require('playwright');
const path = require('path');
const O = path.join(__dirname, '../out/');
// Calcul de TVA : HT / TVA / TTC aux quatre taux et ventilation par taux.
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('http://localhost:8765/');
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!'); await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.click('a[data-nav=calcul]'); await p.waitForSelector('.calc-main');
  const vals = () => p.$$eval('[data-calc]', (l) => l.map((x) => `${x.dataset.calc}=${x.value}`).join(' '));
  await p.fill('[data-calc=ht]', '1000'); console.log('HT 1000 à 20 % :', await vals());
  await p.fill('[data-calc=ttc]', '119,99'); console.log('TTC 119,99 :', await vals());
  await p.fill('[data-calc=tva]', '55'); console.log('TVA 55 :', await vals());
  await p.click('button[data-action=calc-rate][data-taux="5.5"]'); console.log('taux 5,5 % (TVA 55 conservée) :', await vals(), '| focus actif :', await p.evaluate(() => document.activeElement.tagName));
  await p.click('button[data-action=calc-rate][data-taux="2.1"]'); await p.fill('[data-calc=ttc]', '1 021,00'); console.log('2,1 % TTC 1 021 :', await vals());
  console.log('quatre taux :\n  ' + (await p.$$eval('.calc-all tbody tr', (l) => l.map((r) => Array.from(r.cells).map((c) => c.textContent.trim()).join(' | ')))).join('\n  '));
  await p.click('.calc-all tbody tr:first-child td:nth-child(3) button'); await p.waitForTimeout(150);
  console.log('copie :', JSON.stringify(await p.evaluate(() => navigator.clipboard.readText())), '|', await p.textContent('#toast'));
  await p.fill('[data-calc=ht]', 'abc'); console.log('saisie invalide :', await vals());
  // Ventilation d'un Z de caisse d'officine (TTC)
  for (const [t, v] of [['20', '120'], ['10', '55'], ['5.5', '211'], ['2.1', '1021']]) await p.fill(`[data-calc-vent="${t}"]`, v);
  console.log('ventilation :\n  ' + (await p.$$eval('.calc-vent tbody tr, .calc-vent tfoot tr', (l) => l.map((r) => Array.from(r.cells).map((c) => (c.querySelector('input') ? c.querySelector('input').value : c.textContent.trim())).join(' | ')))).join('\n  '));
  await p.click('button[data-action=calc-vent-copy]'); await p.waitForTimeout(150);
  console.log('tableau copié :\n' + await p.evaluate(() => navigator.clipboard.readText()));
  await p.click('button[data-action=calc-vent-mode][data-mode=ht]');
  console.log('saisie HT (valeurs conservées) :', await p.$$eval('.calc-vent tfoot td', (l) => l.map((x) => x.textContent.trim()).join(' | ')));
  await p.screenshot({ path: O + 'calc.png', fullPage: true });
  await p.setViewportSize({ width: 375, height: 812 }); await p.waitForTimeout(200);
  console.log('débordement mobile :', await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), '| menu :', await p.$$eval('.nav a', (l) => l.filter((x) => x.offsetParent).map((x) => x.textContent).join(', ')),
    '| barre du bas dans l\'écran ?', await p.$$eval('.nav a', (l) => l.filter((x) => x.offsetParent).every((x) => x.getBoundingClientRect().right <= window.innerWidth + 1)), '| raccourci en haut ?', !!(await p.$('.topbar a[href="#/calcul"]')));
  await p.screenshot({ path: O + 'calc-mobile.png', fullPage: true });
  console.log('erreurs', errors);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
