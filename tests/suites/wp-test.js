const { chromium } = require('playwright');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
const { fecTab, fecMonth } = require('./lib');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' })).newPage();
  const errors = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await p.goto('http://localhost:8765/');
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!');
  await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.click('main [data-action=new-client]');
  await p.fill('#modal input[name=nom]', 'SARL CYCLES'); await p.selectOption('#modal select[name=forme]', 'SARL');
  await p.fill('#modal input[name=siren]', '444444444'); await p.click('#modal button[type=submit]'); await p.waitForSelector('.grid-detail');
  const load = async () => {
    await p.goto('http://localhost:8765/#/fec'); await p.waitForSelector('.fec-drop, .fec-meta');
    const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-action=fec-pick]')]);
    await ch.setFiles(D + '444444444FEC20251231.txt'); await p.waitForSelector('.fec-meta'); await p.waitForTimeout(200);
  };
  await load();
  const tab = async (t) => { await fecTab(p, t, 0); await p.waitForTimeout(150); };
  await tab('charges');
  console.log('avant :', await p.textContent('.wp-bar'), '| onglet', await p.textContent('button[data-tab=charges]'));
  const row = (label) => `.fec-check:has(strong:text("${label}"))`;
  await p.selectOption(`${row('Charges récurrentes incomplètes')} select[data-wp=st]`, 'piece'); await p.waitForTimeout(150);
  await p.fill(`${row('Charges récurrentes incomplètes')} input[data-wp=note]`, 'Loyers mars et août demandés au client'); await p.press(`${row('Charges récurrentes incomplètes')} input[data-wp=note]`, 'Tab');
  await p.selectOption(`${row('Amendes et pénalités en charges déductibles')} select[data-wp=st]`, 'corrige'); await p.waitForTimeout(150);
  // Netflix justifié : ne plus signaler
  await p.click(`${row('Dépenses à caractère personnel possibles')} summary`);
  await p.click(`${row('Dépenses à caractère personnel possibles')} .fec-ex li:has-text("NETFLIX") button`);
  await p.fill('#ask input[name=value]', 'Abonnement utilisé pour la veille marketing'); await p.click('#ask button[type=submit]'); await p.waitForTimeout(200);
  console.log('perso après mémo :', await p.textContent(`${row('Dépenses à caractère personnel possibles')} .fec-check-text .muted`));
  await p.click('button[data-action=wp-review][data-cycle=charges]'); await p.waitForTimeout(150);
  console.log('après :', await p.textContent('.wp-bar'), '| onglet', await p.textContent('button[data-tab=charges]'));
  // Ré-analyse : les statuts et la mémoire sont conservés
  await load(); await tab('charges');
  console.log('ré-analyse :', await p.textContent('.wp-bar'), '| statut', await p.$eval(`${row('Charges récurrentes incomplètes')} select`, (s) => s.value), '| note', await p.$eval(`${row('Charges récurrentes incomplètes')} input[data-wp=note]`, (i) => i.value));
  console.log('perso :', await p.textContent(`${row('Dépenses à caractère personnel possibles')} .fec-check-text .muted`));
  await tab('synthese');
  console.log('tuiles :', await p.$$eval('.cycle-tile', (k) => k.map((x) => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
  await p.screenshot({ path: O + 'wp-synthese.png', fullPage: true });
  await tab('charges'); await p.screenshot({ path: O + 'wp-charges.png', fullPage: true });
  // Pièces : Netflix n'est plus demandé ?
  await tab('pieces');
  console.log('Netflix :', await p.$$eval('.piece span', (l) => l.map((x) => x.textContent).filter((t) => /NETFLIX/.test(t))));
  // Impression du dossier de travail
  await p.evaluate(() => { window.print = () => { window.__printed = document.querySelector('#print-area').innerText; }; });
  await tab('synthese'); await p.click('button[data-action=wp-print]'); await p.waitForTimeout(100);
  const printed = await p.evaluate(() => window.__printed || '');
  console.log('impression :', printed.length, 'caractères ;', /Revu par/.test(printed), /Loyers mars et août/.test(printed));
  // Dossier : mémoire de révision
  await p.click('a[data-nav=dossiers]'); await p.click('#dossier-list a, #dossier-list tbody tr'); await p.waitForSelector('.grid-detail');
  console.log('mémoire :', (await p.textContent('.memo-list')).replace(/\s+/g, ' ').trim());
  console.log('erreurs', errors);
  await b.close();
})();
