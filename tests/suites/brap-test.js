const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '../fixtures/rappro/');
const O = path.join(__dirname, '../out/');
// Rapprocher un relevé et le FEC du seul journal de banque (tests/gen/genrappro.py) : opérations non comptabilisées,
// écritures absentes du relevé, chiffres inversés, montant différent, sens inversé, doublon, remise regroupée, état de
// rapprochement à zéro, compte suggéré et écritures à passer.
let ko = 0;
const expect = (cond, label, info) => { if (cond) console.log(`OK ${label}`); else { ko++; console.log(`KO ${label}${info ? ' : ' + info : ''}`); } };
const EXP = JSON.parse(fs.readFileSync(F + 'rappro-attendu.json', 'utf8'));
const sorted = (a) => a.slice().sort((x, y) => x - y).join();
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true })).newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('http://localhost:8765/');
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!'); await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.click('a[data-nav=rapprochement]'); await p.waitForSelector('.cmp-slots');
  let [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-action=brap-pick-rel]')]); await ch.setFiles(F + 'releve-octobre-2025.ofx');
  await p.waitForFunction(() => ui.brap && ui.brap.ops.length > 0);
  [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-action=brap-pick-fec]')]); await ch.setFiles(F + 'journal-banque-900000011FEC20251031.txt');
  await p.waitForSelector('.fec-kpis', { timeout: 15000 });
  const K = await p.evaluate(() => { const K = brapCalc(ui.brap); return { n: K.res.bank.length, matched: K.res.matched, bankRest: K.bankRest.map((o) => o.amount), bookRest: K.bookRest.map((l) => l.amount), sens: K.sens.map((x) => [x.o.amount, x.l.amount]), ecarts: K.ecarts.map((x) => [x.o.amount, x.l.amount, x.transp]), doublons: K.doublons.map((x) => x.l.amount), groups: K.groups.map((g) => [g.bank.length, g.book.length, g.bank[0].amount]), mvt: K.mvt, releve: K.releve, attendu: K.attendu, compte: ui.brap.compte }; });
  console.log(JSON.stringify(K));
  expect(K.n === EXP.stmtOps && K.compte === '51200000', `relevé OFX lu (${EXP.stmtOps} opérations), compte de banque retrouvé`);
  expect(sorted(K.bankRest) === sorted(EXP.bankOnly), 'opérations non comptabilisées : assurance, virement client, frais', K.bankRest.join());
  expect(sorted(K.bookRest) === sorted(EXP.bookOnly), 'écritures absentes du relevé : chèque non encaissé, remise en cours', K.bookRest.join());
  expect(K.ecarts.some((x) => x[0] === EXP.transp[0] && x[1] === EXP.transp[1] && x[2]), 'montant aux chiffres inversés (1 243,50 / 1 234,50)');
  expect(K.ecarts.some((x) => x[0] === EXP.ecart[0] && x[1] === EXP.ecart[1] && !x[2]), 'montant différent (560 / 565)');
  expect(K.sens.length === 1 && K.sens[0][0] === EXP.sens[0] && K.sens[0][1] === EXP.sens[1], 'sens inversé (remboursement passé au crédit de la banque)');
  expect(K.doublons.length === 1 && K.doublons[0] === EXP.doublon, 'doublon : carburant du 08/10 passé deux fois');
  expect(K.groups.some((g) => g[0] === 1 && g[1] === 3 && g[2] === EXP.remise), 'remise de chèques : 1 opération du relevé pour 3 écritures');
  expect(K.mvt.reste === 0, 'différence de mouvements entièrement expliquée', JSON.stringify(K.mvt));
  expect(K.releve === EXP.closing && K.attendu === EXP.compta, `état de rapprochement : solde du relevé ${EXP.closing}, solde comptable attendu ${EXP.compta}`, `${K.releve} / ${K.attendu}`);
  // Solde comptable saisi (le FEC du seul journal n'a pas d'à-nouveau) : écart nul
  await p.fill('input[data-brap=soldeCompta]', String(EXP.compta)); await p.press('input[data-brap=soldeCompta]', 'Enter'); await p.waitForTimeout(150);
  expect(await p.evaluate(() => brapCalc(ui.brap).ecart) === 0, 'solde comptable saisi : écart inexpliqué nul');
  await p.fill('input[data-brap=soldeCompta]', String(EXP.compta + 100)); await p.press('input[data-brap=soldeCompta]', 'Enter'); await p.waitForTimeout(150);
  expect(await p.evaluate(() => brapCalc(ui.brap).ecart) === 100, 'solde comptable différent : écart de 100 € signalé');
  // Compte suggéré : virement du client GAMMA comme celui du 05/10
  const sug = await p.$$eval('section.card:has(h2:text-matches("non comptabilisées")) tbody tr', (t) => t.map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
  expect(sug.some((x) => /CLIENT GAMMA.*41100000 CGAMMA/.test(x)) && sug.some((x) => /FRAIS TENUE.*471/.test(x)), 'compte suggéré : 411 GAMMA pour le virement, 471 à défaut', sug.join(' || '));
  await p.screenshot({ path: O + 'rapprochement.png', fullPage: true });
  // Écritures à passer (FEC) : 3 écritures équilibrées, banque contre le compte suggéré
  await p.click('button[data-action=brap-export][data-kind=fec]'); await p.waitForSelector('#ask[open]');
  let [dl] = await Promise.all([p.waitForEvent('download'), p.click('#ask button[type=submit]')]);
  await dl.saveAs(O + 'rappro-ecritures.txt');
  const L = fs.readFileSync(O + 'rappro-ecritures.txt', 'utf8').trim().split(/\r?\n/).map((l) => l.split('\t'));
  const bal = new Map();
  L.slice(1).forEach((f) => bal.set(f[2], (bal.get(f[2]) || 0) + Math.round(parseFloat(f[11].replace(',', '.')) * 100) - Math.round(parseFloat(f[12].replace(',', '.')) * 100)));
  expect(L.length === 7 && L[0][0] === 'JournalCode' && [...bal.values()].every((v) => v === 0) && L.slice(1).every((f) => f[0] === 'BQ'), 'écritures à passer : 3 écritures équilibrées au journal BQ', JSON.stringify(L.slice(1).map((f) => f.slice(0, 6))));
  expect(L.some((f) => f[4] === '41100000' && f[6] === 'CGAMMA' && f[12] === '1200,00'), 'écriture du virement GAMMA : crédit 411 CGAMMA');
  // Export Excel
  await p.click('.filters button[data-action=brap-export][data-kind=xlsx]'); await p.waitForSelector('#ask[open]');
  [dl] = await Promise.all([p.waitForEvent('download'), p.click('#ask button[type=submit]')]);
  await dl.saveAs(O + 'rapprochement.xlsx');
  const book = await p.evaluate(async (b64) => { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const bk = await SheetReader.read(new File([bin], 'x.xlsx')); return bk.sheets.map((s) => [s.name, s.rows.length]); }, fs.readFileSync(O + 'rapprochement.xlsx').toString('base64'));
  expect(JSON.stringify(book) === JSON.stringify([['État de rapprochement', 14], ['Non comptabilisées', 4], ['Absentes du relevé', 3], ['Montants différents', 4], ['Doublons', 2]]), 'export Excel : état de rapprochement et listes', JSON.stringify(book));
  // Relevé CSV (sans solde) : mêmes différences, solde du relevé à saisir
  await p.click('button[data-action=brap-clear]');
  await p.waitForSelector('[data-action=brap-pick-rel]');
  [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-action=brap-pick-rel]')]); await ch.setFiles(F + 'releve-octobre-2025.csv');
  await p.waitForFunction(() => ui.brap && ui.brap.ops.length > 0);
  [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-action=brap-pick-fec]')]); await ch.setFiles(F + 'journal-banque-900000011FEC20251031.txt');
  await p.waitForSelector('.fec-kpis', { timeout: 15000 });
  const C = await p.evaluate(() => { const K = brapCalc(ui.brap); return [K.bankRest.length, K.bookRest.length, K.ecarts.length + K.sens.length, K.doublons.length, K.releve]; });
  expect(C.join() === '3,2,3,1,', 'relevé CSV : mêmes différences, solde du relevé à saisir', C.join());
  await p.fill('input[data-brap=soldeReleve]', String(EXP.closing)); await p.press('input[data-brap=soldeReleve]', 'Enter'); await p.waitForTimeout(150);
  await p.fill('input[data-brap=soldeCompta]', String(EXP.compta)); await p.press('input[data-brap=soldeCompta]', 'Enter'); await p.waitForTimeout(150);
  expect(await p.evaluate(() => brapCalc(ui.brap).ecart) === 0, 'soldes saisis : écart inexpliqué nul');
  // Mobile, verrouillage
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(200);
  expect(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'mobile : pas de débordement horizontal');
  await p.evaluate(() => forgetSession());
  expect(await p.evaluate(() => !ui.brap), 'verrouillage : relevé et FEC effacés');
  console.log(ko ? `${ko} écart(s)` : 'rapprochement conforme');
  console.log('erreurs', errors);
  await b.close();
  if (ko) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(1); });
