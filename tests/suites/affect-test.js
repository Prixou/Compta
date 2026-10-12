const { chromium } = require('playwright');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
const { fecTab, fecMonth } = require('./lib');
// Suggestions d'affectation : opérations en compte d'attente et opérations du relevé non comptabilisées,
// d'après les opérations au même libellé déjà affectées (et lettrées pour les comptes de tiers) dans le FEC.
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' })).newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('http://localhost:8765/');
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!'); await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.goto('http://localhost:8765/#/fec'); await p.waitForSelector('.fec-drop');
  const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('.fec-drop')]);
  await ch.setFiles(D + '666666666FEC20251231.txt'); await p.waitForSelector('.fec-meta');
  let ko = 0;
  const expect = (cond, label, info) => { if (cond) console.log(`OK ${label}`); else { ko++; console.log(`KO ${label}${info ? ' : ' + info : ''}`); } };
  // 1. Contrôles de saisie de novembre
  await fecTab(p, 'mois-saisie', 0); await fecMonth(p, '2025-11');
  const att = await p.$$eval('.fec-check', (l) => l.filter((x) => /compte d'attente/.test(x.textContent)).map((x) => Array.from(x.querySelectorAll('.wp-el-text')).map((e) => e.textContent.replace(/\s+/g, ' ').trim())).flat());
  console.log('attente :\n  ' + att.join('\n  '));
  expect(att.some((t) => /ORANGE SA.*suggérée : 401000 F07 ORANGE BUSINESS \(10 fois, lettré\)/.test(t)), 'prélèvement Orange → 401 F07 lettré');
  expect(att.some((t) => /CABINET MEDICAL DU PARC.*suggérée : 411000 C01 CABINET MEDICAL DU PARC/.test(t)), 'virement client → 411 C01');
  expect(att.some((t) => /SCI DU PORT LOYER.*suggérée : 613200 Loyers \(10 fois\)/.test(t)), 'loyer → 613200');
  expect(att.some((t) => /INCONNU ZQX/.test(t) && !/suggérée/.test(t)), 'opération inconnue sans suggestion');
  // 2. Écritures de reclassement proposées
  await fecTab(p, 'ecritures', 200);
  const sec = p.locator('section.card', { hasText: "Affectation des opérations en compte d'attente" });
  const props = await sec.locator('.ecr-prop').allTextContents();
  console.log('écritures :\n  ' + props.map((x) => x.replace(/\s+/g, ' ').trim().slice(0, 220)).join('\n  '));
  expect(props.length === 3, '3 écritures de reclassement proposées', String(props.length));
  // 3. Relevé bancaire : opérations non comptabilisées
  await fecTab(p, 'rappro', 150);
  const [ch2] = await Promise.all([p.waitForEvent('filechooser'), p.click('button[data-action=rappro-import]')]);
  await ch2.setFiles(D + 'releve-666-2025.csv'); await p.waitForTimeout(400);
  const rows = await p.$$eval('section.card:has(h2:text("non comptabilisées")) tbody tr', (l) => l.map((r) => Array.from(r.cells).map((c) => c.textContent.trim()).join(' | ')));
  console.log('relevé :\n  ' + rows.join('\n  '));
  expect(rows.some((t) => /SCI DU PORT LOYER.*613200 Loyers/.test(t)), 'relevé : loyer → 613200');
  expect(rows.some((t) => /ORANGE SA.*401000 F07 ORANGE BUSINESS/.test(t)), 'relevé : Orange → 401 F07');
  expect(rows.some((t) => /CB INCONNUE.*—$/.test(t)), 'relevé : opération inconnue sans suggestion');
  // 4. Onglet Factures de vente : n° lu dans le libellé (pièce = n° d'écriture), FV-0207 manquante en juillet
  await fecTab(p, 'mois-ventes', 0); await fecMonth(p, '2025-03');
  const v = (await p.textContent('main')).replace(/\s+/g, ' ');
  console.log('onglet :', await p.textContent('.fec-tabs button[data-tab=mois-ventes]'));
  expect(/FV-0207 : entre FV-0206/.test(v), 'mars : FV-0207 manquante (n° lu dans le libellé)');
  expect(/FV-, n° lu dans le libellé/.test(v), 'série FV- lue dans le libellé');
  expect(/Voir les \d+ écriture\(s\) de vente du mois/.test(v), 'liste des ventes du mois');
  await p.screenshot({ path: O + 'ventes-mois.png', fullPage: true });
  // 5. Format Pennylane : n° de facture dans le libellé de la ligne client 411 (avoirs compris)
  await p.click('button[data-action=fec-pick]').catch(() => {});
  const [ch3] = await Promise.all([p.waitForEvent('filechooser'), p.click('button[data-action=fec-pick]')]);
  await ch3.setFiles(D + '888888888FEC20261231.txt'); await p.waitForFunction(() => (document.querySelector('.fec-file') || {}).textContent === '888888888FEC20261231.txt');
  await fecTab(p, 'mois-ventes', 0); await fecMonth(p, '2026-02');
  const pl = (await p.textContent('main')).replace(/\s+/g, ' ');
  expect(/F-260007 : entre F-260006/.test(pl), 'Pennylane : F-260007 manquante (février)');
  expect(/F-260012 : entre F-260011/.test(pl), 'Pennylane : F-260012 manquante (février)');
  expect(/F-260013 : entre F-260011 du \d\d\/02\/2026 et F-260015 du \d\d\/03\/2026/.test(pl) && /F-260014 : entre F-260011/.test(pl), 'trou de 3 factures : F-260013 et F-260014 sur leur propre ligne');
  expect(!/ à F-26/.test(pl), 'factures manquantes listées une par une, sans plage');
  await p.screenshot({ path: O + 'affect.png', fullPage: true });
  console.log(ko ? `${ko} écart(s)` : 'toutes les suggestions sont correctes');
  console.log('erreurs', errors);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
