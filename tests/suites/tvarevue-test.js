const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
const { fecTab } = require('./lib');
// Contrôle de la TVA de l'exercice (onglet « Contrôle TVA » de l'espace Révision) sur un FEC inventé
// (tests/gen/gentvarevue.py) : récapitulatif d'après les OD de TVA, contrôle en bases, encaissements, TVA déductible.
let ko = 0;
const expect = (cond, label, info) => { if (cond) console.log(`OK ${label}`); else { ko++; console.log(`KO ${label}${info ? ' : ' + info : ''}`); } };
const EXP = JSON.parse(fs.readFileSync(D + '600000006-attendu.json', 'utf8'));
const near = (a, b) => Math.abs((a || 0) - (b || 0)) < 0.01;
(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await pg.goto('http://localhost:8765/');
  await pg.fill('input[name=p1]', 'Cabinet-Test-2026!'); await pg.fill('input[name=p2]', 'Cabinet-Test-2026!'); await pg.check('input[name=ack]'); await pg.click('button[type=submit]'); await pg.waitForSelector('.layout');
  await pg.click('main [data-action=new-client]'); await pg.fill('#modal input[name=nom]', 'HOTEL TVA DEMO'); await pg.fill('#modal input[name=siren]', '600000006');
  await pg.click('#modal button[type=submit]'); await pg.waitForSelector('.grid-detail');
  await pg.goto('http://localhost:8765/#/fec'); await pg.waitForSelector('.fec-drop');
  const [ch] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('.fec-drop')]);
  await ch.setFiles(D + '600000006FEC20261231.txt'); await pg.waitForSelector('.fec-meta');
  await fecTab(pg, 'tvarev');
  await pg.waitForSelector('.tvr');
  const K = () => pg.evaluate(() => {
    const k = tvrCalc(ui.fec.result);
    return { arr: k.arr, R: k.R, rows: k.recap.rows.map((x) => ({ key: x.key, bases: x.bases, coll: x.coll, dAbs: x.v.dAbs, dImmo: x.v.dImmo, report: x.report, due: x.due, credit: x.credit, odGap: x.odGap })),
      caHt: k.collecte.caHt, ecart: k.collecte.ecart, av1: (k.enc.auto.av1 || {}), encEcart: k.enc.ecart, ded: { total: k.deductible.total, nonDed: k.deductible.nonDed.abs, exigible: k.deductible.exigible, declared: k.deductible.declared },
      frs: k.deductible.frs.map((x) => [x.num, x.serv, x.tva]) };
  });
  let k = await K();
  // 1. Récapitulatif des déclarations d'après les OD de TVA
  expect(k.arr === EXP.arrete, `mois d'arrêté par défaut : dernière OD de TVA (${EXP.arrete})`, k.arr);
  for (const [key, e] of Object.entries(EXP.recap)) {
    const row = k.rows.find((x) => x.key === key);
    const ok = row && near(row.bases[10], e.b10) && near(row.bases[20], e.b20) && near(row.coll, e.coll) && near(row.dAbs, e.dAbs) && near(row.dImmo, e.dImmo) && near(row.report, e.report) && near(row.due, e.due) && near(row.credit, e.credit) && near(row.odGap, 0);
    expect(ok, `récapitulatif ${key} : bases, TVA collectée et déductible, report, TVA à payer, crédit (écart OD nul)`, JSON.stringify(row));
  }
  // 2. TVA collectée : CA par taux (taux de l'hébergement lu dans les écritures), contrôle en bases
  expect(near(k.caHt[10], EXP.caHt['10']) && near(k.caHt[20], EXP.caHt['20']) && near(k.caHt.exo, EXP.caHt.exo), 'CA HT par taux (10 % lu dans les écritures, bonis sans TVA)', JSON.stringify(k.caHt));
  expect(near(k.ecart[10], EXP.ecartBases['10']) && near(k.ecart[20], EXP.ecartBases['20']), 'contrôle en bases : écart de 10 € à 10 % (TVA erronée), aucun à 20 %', JSON.stringify(k.ecart));
  expect(near(k.av1[10], EXP.avances['10']), 'avances N-1 : acomptes « 10 % » repris en HT', JSON.stringify(k.av1));
  expect(near(k.encEcart[10], EXP.encEcart['10']), 'TVA sur les encaissements : écart de base à 10 %', JSON.stringify(k.encEcart));
  // 3. TVA déductible
  const d = EXP.deductible;
  expect(near(k.ded.total, d.total) && near(k.ded.nonDed, d.nonDed) && near(k.ded.exigible, d.exigible) && near(k.ded.declared, d.declared), 'TVA déductible : soldes avant OD, loyer non réglé non déductible, OD comparée', JSON.stringify(k.ded));
  expect(k.frs.some(([n, s, t]) => n === 'SCI' && s && near(t, 400)) && k.frs.some(([n, s]) => n === 'GROS' && !s), 'annexe : loyer coché (services), denrées non cochées', JSON.stringify(k.frs));
  await pg.screenshot({ path: O + 'tva-revue.png', fullPage: true });

  // 4. Saisie : base déclarée de janvier, tabulation vers la case suivante, conservation dans le dossier
  const cell = 'input[data-tvr="ca3|2026-01|b10"]';
  await pg.fill(cell, '10 050');
  await pg.keyboard.press('Tab');
  await pg.waitForTimeout(250);
  k = await K();
  expect(near(k.rows[0].coll, 2005) && near(k.rows[0].odGap, 5), 'base saisie : TVA collectée recalculée, écart avec l\'OD signalé', JSON.stringify(k.rows[0]));
  expect(await pg.evaluate(() => document.activeElement && document.activeElement.dataset.tvr), 'tabulation : le curseur reste dans le tableau après le recalcul', await pg.evaluate(() => document.activeElement && document.activeElement.outerHTML.slice(0, 80)));
  expect(await pg.evaluate(() => data.clients[0].tvaRevue.ex['2026-12-31'].ca3['2026-01'].b10 === 10050), 'saisie conservée dans le dossier, par exercice');
  await pg.fill(cell, ''); await pg.keyboard.press('Tab'); await pg.waitForTimeout(250);
  k = await K();
  expect(near(k.rows[0].coll, 2000), 'case vidée : retour au montant calculé');
  // Fournisseur décoché, taux d'un compte de produits changé (même paramétrage que l'onglet TVA)
  await pg.uncheck('input[data-tvr="frs-s|401|SCI"]'); await pg.waitForTimeout(250);
  k = await K();
  expect(near(k.ded.nonDed, 0) && (await pg.evaluate(() => data.clients[0].tvaRevue.frs['401|SCI'].s === false)), 'annexe : fournisseur décoché, choix conservé');
  await pg.selectOption('select[data-tvap=ca][data-c="706200"]', '10'); await pg.waitForTimeout(250);
  k = await K();
  expect(near(k.caHt[10], EXP.caHt['10'] + EXP.caHt['20']) && !k.caHt[20], 'taux d\'un compte de produits changé : CA reclassé', JSON.stringify(k.caHt));
  await pg.selectOption('select[data-tvap=ca][data-c="706200"]', ''); await pg.waitForTimeout(250);
  // Mois d'arrêté
  await pg.selectOption('select[data-tvr=ym]', '2026-02'); await pg.waitForTimeout(250);
  k = await K();
  expect(k.arr === '2026-02' && k.rows.length === 2 && near(k.caHt[10], 18000), 'arrêté à fin février : récapitulatif et CA à cette date', `${k.arr} ${k.rows.length} ${k.caHt[10]}`);

  // 5. Export Excel (fichier non chiffré : confirmation)
  await pg.click('[data-action=tvr-export]');
  await pg.waitForSelector('#ask');
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#ask button[type=submit]')]);
  const file = O + dl.suggestedFilename();
  await dl.saveAs(file);
  const zip = fs.readFileSync(file);
  expect(/^controle-tva-.*-2026-02\.xlsx$/.test(dl.suggestedFilename()) && zip.slice(0, 2).toString() === 'PK' && ['Récapitulatif CA3', 'TVA collectée', 'TVA déductible', 'Contrôle des soldes'].every((s) => zip.includes(Buffer.from(s))), 'export Excel : quatre feuilles', dl.suggestedFilename());

  // 6. Téléphone : pas de défilement horizontal de la page (les tableaux défilent dans leur cadre)
  await pg.setViewportSize({ width: 390, height: 844 }); await pg.waitForTimeout(600);
  const over = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 1) console.log('débordement', JSON.stringify(await pg.evaluate(() => { const W = window.innerWidth; return { sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, x: window.scrollX, el: Array.from(document.querySelectorAll('body *')).filter((e) => e.getBoundingClientRect().right > W + 1 || e.getBoundingClientRect().left < -1).slice(0, 8).map((e) => e.tagName + '.' + String(e.className).slice(0, 30) + ' ' + Math.round(e.getBoundingClientRect().left) + '/' + Math.round(e.getBoundingClientRect().right)) }; })));
  expect(over <= 1, 'téléphone : pas de débordement horizontal', String(over));
  await pg.screenshot({ path: O + 'tva-revue-mobile.png' });

  console.log(ko ? `${ko} écart(s)` : 'contrôle de la TVA de l\'exercice conforme');
  console.log('erreurs', errors);
  await br.close();
  if (ko) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(1); });
