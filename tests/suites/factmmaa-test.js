const { chromium } = require('playwright');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
const { fecTab, fecMonth } = require('./lib');
// Numérotation « n° + mois et année » (F51080126 = facture 5108 de janvier 2026), citée surtout dans les encaissements,
// en listes « F5101-5102-51040126 », « F5113+5114+… », « F5111,5112,51130126 » (tests/gen/genfactmmaa.py).
let ko = 0;
const expect = (cond, label, info) => { if (cond) console.log(`OK ${label}`); else { ko++; console.log(`KO ${label}${info ? ' : ' + info : ''}`); } };
const EXP = JSON.parse(fs.readFileSync(D + '800000008-attendu.json', 'utf8'));
const analyse = (file) => {
  const ctx = { self: { postMessage() {} }, postMessage() {}, console, TextDecoder, TextEncoder, Intl };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/fec-worker.js'), 'utf8'), ctx);
  const b = fs.readFileSync(D + file);
  Object.assign(ctx, { __b: b.buffer.slice(b.byteOffset, b.byteOffset + b.length), __n: path.basename(file) });
  return vm.runInContext('analyse(__b, __n)', ctx);
};
(async () => {
  // 1. Moteur
  const r = analyse('800000008FEC20261231.txt');
  const sx = r.cycles.clients.numbering.find((g) => g.src === 'mmaa');
  expect(sx && sx.first === 'F' + EXP.first && sx.last === 'F' + EXP.last && sx.count === EXP.count, `série F${EXP.first} → F${EXP.last} reconnue (${EXP.count} n°, listes et libellé tronqué compris)`, sx && `${sx.first} ${sx.last} ${sx.count}`);
  const miss = sx ? sx.gaps.flatMap(([a, b]) => Array.from({ length: b - a - 1 }, (_, k) => a + k + 1)) : [];
  expect(miss.join() === Object.values(EXP.missing).flat().join(), 'n° jamais cités : 5107, 5121, 5142', miss.join());
  expect(sx && sx.outliers.map(([n]) => n).join() === EXP.outliers.join(), 'fautes de frappe et références fournisseur écartées de la suite', sx && JSON.stringify(sx.outliers));
  expect(sx && sx.vente === EXP.inSale.length && sx.onlyEnc.length === EXP.count - EXP.inSale.length, 'n° lus dans les ventes (2) et seulement dans les encaissements (45)');
  const p = r.cycles.clients.numbering.find((g) => g.prefix === 'P');
  expect(p && p.missing === 0 && p.count === EXP.count, 'n° interne « - P147 » en fin de libellé préféré au n° de facture cité avant');
  // Pas de fausse série sur les autres FEC de test
  const others = fs.readdirSync(D).filter((f) => /FEC\d{8}\.txt$/.test(f) && !f.startsWith('800000008') && !f.startsWith('FEC-gros'));
  const bad = others.filter((f) => analyse(f).cycles.clients.numbering.some((g) => g.src === 'mmaa'));
  expect(!bad.length, `aucune série « mois et année » sur les ${others.length} autres FEC de test`, bad.join(', '));

  // 2. Écran : onglet Factures de vente de l'espace Mois
  const br = await chromium.launch();
  const pg = await (await br.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' })).newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await pg.goto('http://localhost:8765/');
  await pg.fill('input[name=p1]', 'Cabinet-Test-2026!'); await pg.fill('input[name=p2]', 'Cabinet-Test-2026!'); await pg.check('input[name=ack]'); await pg.click('button[type=submit]'); await pg.waitForSelector('.layout');
  await pg.click('main [data-action=new-client]'); await pg.fill('#modal input[name=nom]', 'HOTEL DEMO'); await pg.fill('#modal input[name=siren]', '800000008');
  await pg.click('#modal button[type=submit]'); await pg.waitForSelector('.grid-detail');
  await pg.goto('http://localhost:8765/#/fec'); await pg.waitForSelector('.fec-drop');
  const [ch] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('.fec-drop')]);
  await ch.setFiles(D + '800000008FEC20261231.txt'); await pg.waitForSelector('.fec-meta');
  await fecTab(pg, 'mois-ventes', 0);
  const items = async (ym) => { await fecMonth(pg, ym); await pg.waitForTimeout(100); return pg.evaluate((m) => saisieChecks(ui.fec.result, m).filter((x) => /numérotation|n° de facture/i.test(x.label)).map((x) => `${x.label} :: ${(x.examples || []).join(' / ')}`), ym); };
  for (const [ym, nums] of Object.entries(EXP.missing)) {
    const l = await items(ym);
    expect(l.some((x) => /^Factures de vente manquantes/.test(x) && nums.every((n) => x.includes(`F${n} : entre`))), `${ym} : F${nums.join(', F')} signalée manquante`, l.join(' | ').slice(0, 300));
  }
  const jan = await items('2026-01');
  expect(jan.some((x) => /^N° de facture cités seulement dans les encaissements :: .*F5101 \(encaissement/.test(x)), 'janvier : n° cités seulement dans les encaissements listés');
  expect(await pg.$$eval('.ventes-series input[data-ventes-serie]', (x) => x.length) === 2, 'tableau des séries : case « Contrôler » par série');
  const pieces = await pg.evaluate(() => { const out = []; numberingPieces(ui.fec.result, (cat, key, label) => out.push(label), '2026-01-01', '2026-03-31', { ok: () => true }); return out; });
  expect(pieces.some((x) => /F5107 \(janvier 2026\)/.test(x)), 'pièces à demander : facture F5107 de janvier', pieces.join(' | ').slice(0, 200));
  await pg.screenshot({ path: O + 'factures-mmaa.png', fullPage: true });
  // Série décochée : plus contrôlée, choix conservé dans le dossier
  await pg.uncheck('.ventes-series input[data-ventes-serie^="F + mois"]'); await pg.waitForTimeout(150);
  const after = await items('2026-01');
  expect(!after.some((x) => /F5107/.test(x)), 'série décochée : F5107 n\'est plus signalée');
  expect(await pg.evaluate(() => data.clients[0].ventesSeries && Object.values(data.clients[0].ventesSeries).includes(false)), 'choix enregistré dans la fiche du dossier');
  console.log(ko ? `${ko} écart(s)` : 'numérotation « mois et année » conforme');
  console.log('erreurs', errors);
  await br.close();
  if (ko) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(1); });
