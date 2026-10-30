const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
// Relevés de toutes les banques (tests/gen/genbanques.py, données inventées) : PDF aux mises en page des principales
// banques, lus par les en-têtes ou par les colonnes déduites et vérifiés au centime ; CSV des banques en ligne (en-têtes
// français ou anglais, colonne « Sens », sans en-tête, opérations en attente écartées, frais, solde) ; QIF, MT940,
// CAMT.052 ; import dans le rapprochement.
let ko = 0;
const expect = (cond, label, info) => { if (cond) console.log(`OK ${label}`); else { ko++; console.log(`KO ${label}${info ? ' : ' + info : ''}`); } };
const EXP = JSON.parse(fs.readFileSync(D + 'banques/attendu.json', 'utf8'));
const near = (a, b) => a !== null && b !== null && a !== undefined && b !== undefined && Math.abs(a - b) < 0.005;
(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('http://localhost:8765/');

  // 1. PDF : opérations, soldes, période, mode de lecture, contrôles
  for (const [name, e] of Object.entries(EXP.pdf)) {
    const r = await p.evaluate(async (name) => {
      const buf = await (await fetch(`tests/fixtures/banques/${name}`)).arrayBuffer();
      try {
        const res = RelevePdf.parse(await PdfReader.read(buf), PdfReader);
        return {
          n: res.ops.length, sumD: res.sumD, sumC: res.sumC, si: res.soldeInitial, sf: res.soldeFinal, mode: res.mode, du: res.meta.du, au: res.meta.au,
          bad: res.controls.filter((c) => c.ok === false).map((c) => c.label), warn: res.warnings,
          oct: res.ops.every((o) => /^2026-10-\d\d$/.test(o.date)), libs: res.ops.every((o) => o.lib.length > 3),
        };
      } catch (err) { return { err: err.message }; }
    }, name);
    expect(!r.err && r.n === e.ops && near(r.sumD, e.sumD) && near(r.sumC, e.sumC) && near(r.si, e.soldeInitial) && near(r.sf, e.soldeFinal),
      `${name} : ${e.ops} opérations, dépenses ${e.sumD}, recettes ${e.sumC}, soldes ${e.soldeInitial} → ${e.soldeFinal}`, JSON.stringify(r));
    expect(r.mode === e.mode && r.oct && r.libs && !(r.bad || []).length && !(r.warn || []).length && (!e.du || (r.du === e.du && r.au === e.au)),
      `${name} : lecture ${e.mode}, dates d'octobre 2026, libellés, contrôles justes`, JSON.stringify({ mode: r.mode, du: r.du, au: r.au, bad: r.bad, warn: r.warn }));
  }

  // 2. Fichiers : format, opérations, soldes
  for (const [name, e] of Object.entries(EXP.files)) {
    const r = await p.evaluate(async (name) => {
      const buf = await (await fetch(`tests/fixtures/banques/${name}`)).arrayBuffer();
      try {
        const res = await BankReader.read(new File([buf], name));
        const ops = res.operations;
        return {
          format: res.format, n: ops.length, sumD: Math.round(-ops.filter((o) => o.amount < 0).reduce((t, o) => t + o.amount, 0) * 100) / 100,
          sumC: Math.round(ops.filter((o) => o.amount > 0).reduce((t, o) => t + o.amount, 0) * 100) / 100,
          opening: res.opening && res.opening.amount, closing: res.closing && res.closing.amount,
          oct: ops.every((o) => /^2026-10-\d\d$/.test(o.date)), libs: ops.every((o) => o.label && o.label.length > 3),
        };
      } catch (err) { return { err: err.message }; }
    }, name);
    expect(!r.err && r.format === e.format && r.n === e.ops && near(r.sumD, e.sumD) && near(r.sumC, e.sumC) && r.oct && r.libs
      && (e.opening === undefined || (near(r.opening, e.opening) && near(r.closing, e.closing))),
    `${name} : ${e.format}, ${e.ops} opérations, dépenses ${e.sumD}, recettes ${e.sumC}${e.opening !== undefined ? `, soldes ${e.opening} → ${e.closing}` : ''}`, JSON.stringify(r));
  }

  // 3. Relevé illisible : message clair
  const bad = await p.evaluate(async () => {
    try { await BankReader.read(new File(['Bonjour,\nveuillez trouver ci-joint\n'], 'note.txt')); return ''; } catch (e) { return e.message; }
  });
  expect(/introuvables/.test(bad), 'fichier qui n\'est pas un relevé : refusé avec un message', bad);

  // 4. Rapprochement : relevés de plusieurs formats ajoutés à la suite
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!'); await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.goto('http://localhost:8765/#/fec'); await p.waitForSelector('.fec-drop');
  let [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('.fec-drop')]);
  await ch.setFiles(D + '123456789FEC20251231.txt'); await p.waitForSelector('.fec-meta');
  const { fecTab } = require('./lib');
  await fecTab(p, 'rappro', 0);
  for (const f of ['pdf-mouvements.pdf', 'releve.sta', 'csv-type-revolut.csv']) {
    [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('button[data-action=rappro-import]')]);
    await ch.setFiles(D + 'banques/' + f);
    await p.waitForTimeout(400);
  }
  const txt = await p.textContent('main');
  expect(/pdf-mouvements\.pdf \(PDF, colonnes déduites, \d+ op\.\)/.test(txt) && /releve\.sta \(MT940, \d+ op\.\)/.test(txt) && /csv-type-revolut\.csv \(CSV \/ Excel, \d+ op\.\)/.test(txt),
    'rapprochement : relevés PDF (colonnes déduites), MT940 et CSV importés à la suite', txt.slice(txt.indexOf('Relevés'), txt.indexOf('Relevés') + 300));

  console.log(ko ? `${ko} écart(s)` : 'relevés de toutes les banques lus');
  console.log('erreurs', errors);
  await br.close();
  if (ko) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(1); });
