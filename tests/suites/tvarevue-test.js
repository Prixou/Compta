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
      caHt: k.collecte.caHt, ecart: k.collecte.ecart, av1: (k.enc.auto.av1 || {}), cre1: (k.enc.auto.cre1 || {}), cre: (k.enc.auto.cre || {}), cli: k.enc.cli, encEcart: k.enc.ecart, ded: { total: k.deductible.total, nonDed: k.deductible.nonDed.abs, exigible: k.deductible.exigible, declared: k.deductible.declared },
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
  expect(k.cli === 'ok' && near(k.cre1[10], EXP.cre1['10']) && near(k.cre1[20], EXP.cre1['20']), 'créances N-1 d\'après le lettrage : à-nouveau réparti au prorata des factures du client', JSON.stringify(k.cre1));
  expect(near(k.cre[10], EXP.cre['10']) && !k.cre[20], 'créances au 31/03 d\'après le lettrage : facture non réglée, ventilée par ses comptes de produits', JSON.stringify(k.cre));
  expect(near(k.encEcart[10], EXP.encEcart['10']) && near(k.encEcart[20], EXP.encEcart['20']), 'TVA sur les encaissements : écarts de base à 10 % et 20 %', JSON.stringify(k.encEcart));
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

  // 5. Import des CA3 déposées (PDF fictifs : tests/gen/genca3_pdf.py)
  await pg.selectOption('select[data-tvr=ym]', '2026-03'); await pg.waitForTimeout(250);
  await pg.setInputFiles('input[data-tvr-ca3]', [D + 'ca3/ca3-2026-01.pdf', D + 'ca3/ca3-2026-02-03.pdf']);
  await pg.waitForFunction(() => (ui.fec.tvr.msg || []).length >= 3, null, { timeout: 10000 });
  await pg.waitForTimeout(300);
  const msg = await pg.evaluate(() => ui.fec.tvr.msg);
  expect(msg.length === 3 && msg.every((m) => m.ok), 'CA3 : trois déclarations importées (deux PDF, dont un de deux pages)', JSON.stringify(msg));
  const ca3 = await pg.evaluate(() => tvrCalc(ui.fec.result).recap.rows.map((x) => ({ key: x.key, b10: x.bases[10], b20: x.bases[20], report: x.report, credit: x.credit, gap: x.ca3Gap, src: !!x.ca3 })));
  expect(ca3.length === 3 && near(ca3[0].b10, 10004) && near(ca3[0].b20, 5000) && near(ca3[1].credit, 800) && near(ca3[2].report, 800) && ca3.every((x) => x.src && x.gap < 1),
    'CA3 : bases exactes reprises (10 004 à 10 %), crédit et report, lignes 27 et 28 identiques au calcul', JSON.stringify(ca3));
  const badges = await pg.$$eval('.tvr-badge', (x) => x.map((b) => (b.classList.contains('bad') ? 'ÉCART ' : '') + b.title));
  expect(badges.length === 3 && !badges.some((b) => b.startsWith('ÉCART')), 'CA3 : badge sur chaque période importée', JSON.stringify(badges));
  expect(await pg.evaluate(() => data.clients[0].tvaRevue.ex['2026-12-31'].ca3['2026-02']._ca3.l27 === 800), 'CA3 : montants conservés dans le dossier');
  await pg.click('[data-action=tvr-ca3-clear][data-key="2026-01"]'); await pg.waitForTimeout(250);
  k = await K();
  expect(near(k.rows[0].bases[10], 10000) && !(await pg.evaluate(() => tvrCalc(ui.fec.result).recap.rows[0].ca3)), 'période effacée : retour aux montants de l\'OD de TVA');

  // Liste de factures non réglées exportée du logiciel de facturation (CSV)
  await pg.setInputFiles('input[data-tvr-fact]', D + 'factures-non-reglees.csv');
  await pg.waitForFunction(() => (ui.fec.tvr.msgF || []).length >= 1, null, { timeout: 10000 });
  await pg.waitForTimeout(300);
  const msgF = await pg.evaluate(() => ui.fec.tvr.msgF);
  const adjCre = await pg.evaluate(() => data.clients[0].tvaRevue.ex['2026-12-31'].adj.cre);
  expect(msgF[0].ok && near(adjCre[10], 1000) && near(adjCre[20], 250) && /1 facture\(s\) postérieure/.test(msgF[0].t), 'liste de factures : reste dû en HT par taux, facture réglée et facture d\'avril écartées', JSON.stringify({ msgF, adjCre }));

  // OD de régularisation proposée d'après les soldes de TVA après OD
  const odItems = () => pg.evaluate(() => { const r = ui.fec.result; return tvrOdItems(r, tvrCalc(r)).map((x) => ({ id: x.id, amt: x.amt, side: x.side, tva: x.tva, cp: x.cp, kind: x.kind, on: x.on, d: x.lines.reduce((t, l) => t + l.d, 0), c: x.lines.reduce((t, l) => t + l.c, 0) })); });
  let od = await odItems();
  const o10 = od.find((x) => x.id === 'coll|10'), o20 = od.find((x) => x.id === 'coll|20');
  expect(od.length === 2 && o10 && near(o10.amt, 100) && o10.side === 'D' && o10.tva === '44571100' && o10.cp === '445800' && o20 && near(o20.amt, 50) && o20.side === 'C' && od.every((x) => near(x.d, x.c) && !x.on),
    'OD proposée : un écart par taux, compte de TVA ramené au solde théorique contre la TVA à régulariser (4458), non cochée au-delà du seuil', JSON.stringify(od));
  await pg.selectOption('select[data-tvr="od-kind|coll|20"]', 'arrondi'); await pg.waitForTimeout(250);
  od = await odItems();
  expect(od.find((x) => x.id === 'coll|20').cp === '658000', 'OD : écart d\'arrondi au crédit de la TVA, contre une charge (658)', JSON.stringify(od));
  await pg.check('input[data-tvr="od-on|coll|20"]'); await pg.waitForTimeout(250);
  await pg.click('[data-action=tvr-od-export][data-kind=fec]');
  await pg.waitForSelector('#ask');
  const [dlOd] = await Promise.all([pg.waitForEvent('download'), pg.click('#ask button[type=submit]')]);
  await dlOd.saveAs(O + dlOd.suggestedFilename());
  const odTxt = fs.readFileSync(O + dlOd.suggestedFilename(), 'utf8').trim().split(/\r?\n/).map((l) => l.split('\t'));
  const sum = (i) => odTxt.slice(1).reduce((t, l) => t + Number(l[i].replace(',', '.')), 0);
  expect(odTxt.length === 3 && odTxt[0][0] === 'JournalCode' && near(sum(11), 50) && near(sum(12), 50) && odTxt.slice(1).some((l) => l[4] === '44571200') && odTxt.slice(1).some((l) => l[4] === '658000'),
    'OD exportée au format FEC : écriture cochée seulement, équilibrée', JSON.stringify(odTxt));

  // 6. Export Excel (fichier non chiffré : confirmation)
  await pg.click('[data-action=tvr-export]');
  await pg.waitForSelector('#ask');
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#ask button[type=submit]')]);
  const file = O + dl.suggestedFilename();
  await dl.saveAs(file);
  const zip = fs.readFileSync(file);
  expect(/^controle-tva-.*-2026-03\.xlsx$/.test(dl.suggestedFilename()) && zip.slice(0, 2).toString() === 'PK' && ['Récapitulatif CA3', 'TVA collectée', 'TVA déductible', 'Contrôle des soldes'].every((s) => zip.includes(Buffer.from(s))), 'export Excel : quatre feuilles', dl.suggestedFilename());

  // 7. Portefeuille : contrôle de la TVA de chaque dossier (saisies du dossier reprises), ouverture sur l'onglet
  await pg.goto('http://localhost:8765/#/portefeuille'); await pg.waitForSelector('.fec-drop');
  const [chB] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('.fec-drop')]);
  await chB.setFiles(['600000006FEC20261231.txt', '900000009FEC20270831.txt', '444444444FEC20251231.txt'].map((f) => D + f));
  await pg.waitForFunction(() => !document.querySelector('.fec-loading') && document.querySelector('.dtable.batch-tva'), null, { timeout: 120000 });
  const tvaRows = await pg.$$eval('.dtable.batch-tva tbody tr', (t) => t.map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
  const sumT = await pg.evaluate(() => ui.batch.items.filter((x) => x.sum && x.sum.tva).map((x) => ({ f: x.fileName, ...x.sum.tva })));
  const demo = sumT.find((x) => x.f.startsWith('600000006'));
  expect(tvaRows.length === 3 && demo && demo.arr === '2026-03' && near(demo.od, 0) && near(demo.bases, 10) && demo.ca3 === 2 && demo.ecart, 'portefeuille : synthèse du contrôle TVA par dossier (écart de 10 € en bases, CA3 importées reprises)', JSON.stringify(sumT));
  const top = sumT.slice().sort((a, b) => b.total - a.total)[0];
  expect(tvaRows[0].includes(top.f.startsWith('600000006') ? 'HOTEL TVA DEMO' : top.f), 'portefeuille : dossiers classés du plus grand écart au plus petit', `${top.f} / ${tvaRows[0]}`);
  await pg.click('.dtable.batch-tva tr:has-text("HOTEL TVA DEMO") button[data-action=batch-open]'); await pg.waitForSelector('.tvr');
  expect(await pg.textContent('.fec-tabs button.on') === 'Contrôle TVA', 'portefeuille : « Ouvrir » mène à l\'onglet Contrôle TVA du dossier');

  // 8. Téléphone : pas de défilement horizontal de la page (les tableaux défilent dans leur cadre)
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
