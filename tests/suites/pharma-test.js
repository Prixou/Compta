const { chromium } = require('playwright');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
const { fecTab, fecMonth } = require('./lib');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' })).newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('http://localhost:8765/');
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!');
  await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  const pick = async (sel, file) => { const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click(sel)]); await ch.setFiles(D + file); };
  const tabTxt = async (tab) => { await fecTab(p, tab, 0); await p.waitForTimeout(100); return p.innerText('main'); };
  const prof = () => p.$eval('select[data-fec=profile]', (s) => s.selectedOptions[0].textContent);
  // 1. FEC classique : profil détecté « structure classique », pas d'onglet officine
  await p.goto('http://localhost:8765/#/fec'); await p.waitForSelector('.fec-drop');
  await pick('.fec-drop', '123456789FEC20251231.txt'); await p.waitForSelector('.fec-meta');
  console.log('classique — profil :', await prof(), '| suggestion ?', !!(await p.$('[data-action=fec-profile]')), '| onglets :', await p.$$eval('.fec-tabs button', (b) => b.map((x) => x.textContent).join(' · ')));
  // 2. FEC pharmacie (non lettré), sans dossier : profil officine détecté
  await pick('button[data-action=fec-pick]', '222222222FEC20251231.txt'); await p.waitForFunction(() => (document.querySelector('.fec-file') || {}).textContent === '222222222FEC20251231.txt');
  console.log('pharmacie — profil :', await prof(), '| titre :', await p.textContent('main h1'));
  console.log('onglets :', await p.$$eval('.fec-tabs button', (b) => b.map((x) => x.textContent).join(' · ')));
  console.log('KPI :', await p.$$eval('.fec-kpis .kpi', (k) => k.map((x) => x.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));
  console.log('Points de révision :\n  ' + (await p.$$eval('section.card:has(h2:text-matches("Points de révision")) .fec-check', (l) => l.map((x) => x.querySelector('.lvl').textContent.trim() + ' ' + x.querySelector('strong').textContent + ' — ' + (x.querySelector('.muted') || { textContent: '' }).textContent.slice(0, 110)))).join('\n  '));
  await p.screenshot({ path: O + 'ph1-synthese.png', fullPage: true });
  await fecTab(p, 'tp', 0); await p.waitForTimeout(100);
  console.log('Tiers payant :\n  ' + (await p.$$eval('table.tp tbody tr', (t) => t.map((r) => Array.from(r.children).map((c) => c.textContent.trim()).join(' | ')))).join('\n  '));
  await p.screenshot({ path: O + 'ph2-tp.png', fullPage: true });
  await fecTab(p, 'catva', 0); await p.waitForTimeout(100);
  console.log('CA & TVA :\n  ' + (await p.$$eval('main section.card >> nth=1 >> tbody tr', (t) => t.map((r) => r.textContent.replace(/\s+/g, ' ').trim()))).join('\n  '));
  await p.screenshot({ path: O + 'ph3-catva.png', fullPage: true });
  await fecTab(p, 'pieces', 0); await p.click('button[data-action=pieces-mode][data-mode=bilan]'); await p.waitForTimeout(100);
  console.log('Pièces (bilan) :\n  ' + (await p.$$eval('.pieces-group', (g) => g.map((x) => x.querySelector('h3').textContent.replace(/\s+/g, ' ').trim() + ' : ' + Array.from(x.querySelectorAll('.piece span')).map((s) => s.textContent).join(' / ')))).join('\n  '));
  // 3. Profil changé à la main (sans dossier rattaché) : les onglets suivent
  await p.selectOption('select[data-fec=profile]', 'classique'); await p.waitForTimeout(150);
  console.log('forcé en classique — onglet Tiers payant ?', !!(await p.$('.fec-tabs button[data-tab=tp]')), '| profil :', await prof());
  await p.selectOption('select[data-fec=profile]', 'pharmacie'); await p.waitForTimeout(150);
  // 4. Dossier indiqué « structure classique » mais FEC d'officine : écart signalé, correction enregistrée dans la fiche
  await p.goto('http://localhost:8765/#/dossiers'); await p.click('main [data-action=new-client]');
  await p.fill('#modal input[name=nom]', 'PHARMACIE DES ARCADES'); await p.fill('#modal input[name=siren]', '333333333');
  await p.selectOption('#modal select[name=activite]', 'classique'); await p.click('#modal button[type=submit]'); await p.waitForSelector('.grid-detail');
  await p.goto('http://localhost:8765/#/fec'); await p.waitForSelector('.fec-meta');
  await pick('button[data-action=fec-pick]', '333333333FEC20251231.txt'); await p.waitForFunction(() => (document.querySelector('.fec-file') || {}).textContent === '333333333FEC20251231.txt');
  console.log('dossier classique — profil :', await prof(), '| suggestion :', (await p.textContent('.banner.info:has([data-action=fec-profile])')).replace(/\s+/g, ' ').trim().slice(0, 110));
  await p.click('[data-action=fec-profile]'); await p.waitForTimeout(200);
  console.log('après correction :', await prof(), '| toast :', await p.textContent('#toast'), '| suggestion ?', !!(await p.$('[data-action=fec-profile]')));
  await fecTab(p, 'tp', 0); await p.waitForTimeout(100);
  console.log('Lettré — tiers payant :\n  ' + (await p.$$eval('table.tp tbody tr', (t) => t.map((r) => Array.from(r.children).map((c) => c.textContent.trim()).join(' | ')))).join('\n  '));
  console.log('Factures > 60 j :', await p.$$eval('.tp-detail summary', (s) => s.map((x) => x.textContent.trim()).join(' | ')));
  await p.screenshot({ path: O + 'ph4-lettre.png', fullPage: true });
  await p.goto('http://localhost:8765/#/dossiers'); await p.click('#dossier-list a:has-text("PHARMACIE DES ARCADES"), #dossier-list tr:has-text("PHARMACIE DES ARCADES")'); await p.waitForSelector('.grid-detail');
  console.log('fiche du dossier :', (await p.textContent('.field:has(dt:text("Activité (analyse FEC)")) dd')).trim());
  await p.goto('http://localhost:8765/#/fec'); await p.waitForSelector('.fec-meta');
  // 5. Export Excel
  await p.click('button[data-action=fec-export]');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#ask button[type=submit]')]);
  await dl.saveAs(O + 'analyse-pharma.xlsx');
  console.log('erreurs', errors);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
