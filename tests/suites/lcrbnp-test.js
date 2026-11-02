const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, '../fixtures/lcr-bnp/');
const O = path.join(__dirname, '../out/');
// Écritures LCR : relevés de lettres de change BNP Paribas scannés (PDF image, tests/gen/genbnp_scan.py, données
// inventées), lus par reconnaissance de caractères dans le navigateur ; le second a un trait de scanner et des pointillés.
// Puis correction d'une lecture : montant, effet retiré et ajouté, total recontrôlé.
let ko = 0;
const expect = (cond, label, info) => { if (cond) console.log(`OK ${label}`); else { ko++; console.log(`KO ${label}${info ? ' : ' + info : ''}`); } };
const EXP = JSON.parse(fs.readFileSync(D + 'attendu.json', 'utf8'));
(async () => {
  const br = await chromium.launch();
  const pg = await (await br.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' })).newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await pg.goto('http://localhost:8765/');
  await pg.fill('input[name=p1]', 'Cabinet-Test-2026!'); await pg.fill('input[name=p2]', 'Cabinet-Test-2026!'); await pg.check('input[name=ack]'); await pg.click('button[type=submit]'); await pg.waitForSelector('.layout');
  await pg.goto('http://localhost:8765/#/lcr'); await pg.waitForSelector('[data-action=lcr-pdf]');
  const t0 = Date.now();
  const [ch] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('[data-action=lcr-pdf]')]);
  await ch.setFiles(Object.keys(EXP).map((f) => D + f));
  await pg.waitForFunction((n) => ui.lcr && !ui.lcr.progress && ui.lcr.rel.length + ui.lcr.errors.length >= n, Object.keys(EXP).length, { timeout: 120000 });
  const ms = Date.now() - t0;
  const got = await pg.evaluate(() => ui.lcr.rel.map((r) => ({ file: r.file, bank: r.bank, ocr: r.ocr, releve: r.releve, regl: r.regl, au: r.au, contrat: r.contrat, total: r.total, controle: r.controle, effets: r.effets.map((e) => [e.num, e.nom, e.ech, e.c, e.avis]) })));
  expect(got.length === 2 && !(await pg.evaluate(() => ui.lcr.errors.length)), `deux scans BNP lus (${ms} ms)`, JSON.stringify(await pg.evaluate(() => ui.lcr.errors)));
  Object.entries(EXP).forEach(([f, e]) => {
    const r = got.find((x) => x.file === f) || {};
    const eff = (r.effets || []).map((x) => x.slice(0, 4));
    expect(r.bank === 'BNP' && r.ocr && r.releve === e.releve && r.regl === e.regl && r.au === e.au && r.contrat === e.contrat && r.total === e.total && r.controle,
      `${f} : en-tête (n° de relevé, règlement, édition, compte) et total contrôlé`, JSON.stringify(Object.assign({}, r, { effets: undefined })));
    expect(JSON.stringify(eff) === JSON.stringify(e.effets) && r.effets.every((x) => x[4] === 'P'), `${f} : effets (n° d'ordre, tireur, échéance, montant)`, JSON.stringify(eff));
  });
  expect((await pg.textContent('.lcr-rel')).includes('BNP Paribas') && (await pg.$$eval('.lcr-ocr', (x) => x.length)) === 2, 'banque affichée, lecture à vérifier proposée pour chaque scan');
  const E = await pg.evaluate(() => lcrEntries().map((en) => [en.r.piece, en.lines.length, en.tot]));
  expect(E.length === 2 && E.every(([, n], i) => n === EXP[Object.keys(EXP)[i]].effets.length + 1), 'une écriture par relevé : effets au débit, total au crédit', JSON.stringify(E));

  // Correction d'une lecture
  const i = await pg.evaluate(() => ui.lcr.rel.findIndex((r) => r.file === 'bnp-scan-2.pdf'));
  const box = `.lcr-ocr:nth-of-type(${i + 1})`;
  const sel = (j, f) => `input[data-lcr=ocr][data-r="${i}"][data-j="${j}"][data-f="${f}"]`;
  const setv = async (s, v) => { await pg.fill(s, v); await pg.dispatchEvent(s, 'change'); await pg.waitForTimeout(120); };
  await pg.evaluate(() => document.querySelectorAll('.lcr-ocr').forEach((d) => { d.open = true; }));
  await setv(sel(4, 'c'), '64,45');
  let r = await pg.evaluate((i) => ({ c: ui.lcr.rel[i].effets[4].c, ctl: ui.lcr.rel[i].controle }), i);
  expect(r.c === 6445 && !r.ctl && (await pg.textContent('.lcr-rel')).includes('Écart'), 'montant corrigé : écart avec le total du relevé signalé', JSON.stringify(r));
  await setv(sel(4, 'c'), '64,54');
  expect(await pg.evaluate((i) => ui.lcr.rel[i].controle, i), 'montant rétabli : total contrôlé');
  await pg.click(`[data-action=lcr-ocr-del][data-r="${i}"][data-j="4"]`); await pg.waitForTimeout(120);
  r = await pg.evaluate((i) => ({ n: ui.lcr.rel[i].effets.length, ctl: ui.lcr.rel[i].controle }), i);
  expect(r.n === 4 && !r.ctl, 'effet retiré : écart signalé', JSON.stringify(r));
  await pg.evaluate(() => document.querySelectorAll('.lcr-ocr').forEach((d) => { d.open = true; }));
  await pg.click(`[data-action=lcr-ocr-add][data-r="${i}"]`); await pg.waitForTimeout(120);
  await pg.evaluate(() => document.querySelectorAll('.lcr-ocr').forEach((d) => { d.open = true; }));
  await setv(sel(4, 'num'), '70025583');
  await setv(sel(4, 'nom'), 'theta sante');
  await setv(sel(4, 'ech'), '26.11.2026');
  await setv(sel(4, 'c'), '64,54');
  r = await pg.evaluate((i) => { const x = ui.lcr.rel[i]; return { ctl: x.controle, e: x.effets[4] }; }, i);
  expect(r.ctl && r.e.nom === 'THETA SANTE' && r.e.ech === '26/11/2026' && !r.e.doubt, 'effet ajouté à la main : total contrôlé', JSON.stringify(r));

  await pg.screenshot({ path: O + 'lcr-bnp.png', fullPage: true });
  await pg.setViewportSize({ width: 390, height: 844 }); await pg.waitForTimeout(300);
  const over = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over <= 1, 'téléphone : pas de débordement horizontal', String(over));
  await pg.evaluate(() => forgetSession());
  expect(await pg.evaluate(() => ui.lcr === null), 'verrouillage : relevés effacés de la mémoire');
  console.log(ko ? `${ko} écart(s)` : 'relevés BNP scannés conformes');
  console.log('erreurs', errors);
  await br.close();
  if (ko) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(1); });
