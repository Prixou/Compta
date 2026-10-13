const { chromium } = require('playwright');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
// Relevés bancaires PDF → Excel d'import : lecture du PDF (édition « Relevé bancaire » d'ACD et relevé de banque en
// Date / Valeur / Libellé / Débit / Crédit), opérations, soldes et contrôles ; page « Relevés PDF », fichier Excel
// produit (montant signé ou débit / crédit) ; import du relevé PDF dans le rapprochement.
let ko = 0;
const expect = (cond, label, info) => { if (cond) console.log(`OK ${label}`); else { ko++; console.log(`KO ${label}${info ? ' : ' + info : ''}`); } };
const EXP = JSON.parse(fs.readFileSync(D + 'releve-attendu.json', 'utf8'));
const BASE = 'http://localhost:8765/';

(async () => {
  // 1. Lecture des PDF (mêmes scripts que la page, hors navigateur)
  const ctx = { window: {}, TextDecoder, Response, Blob, DecompressionStream, console };
  vm.createContext(ctx);
  ['pdf-reader.js', 'releve-pdf.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/', f), 'utf8'), ctx));
  const { PdfReader, RelevePdf } = ctx.window;
  for (const [file, exp] of Object.entries(EXP)) {
    const b = fs.readFileSync(D + file);
    const r = RelevePdf.parse(await PdfReader.read(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)), PdfReader);
    const key = (o) => `${o.date}|${o.lib}|${o.debit}|${o.credit}`;
    const got = r.ops.map(key), want = exp.ops.map(key);
    const diff = want.map((w, i) => (w === got[i] ? null : `${i}: attendu ${w}, lu ${got[i]}`)).filter(Boolean);
    expect(got.length === want.length && !diff.length, `${file} : ${want.length} opérations lues à l'identique (date, libellé, dépense, recette)`, `${got.length} lues ; ${diff.slice(0, 3).join(' ; ')}`);
    expect(r.meta.du === exp.du && r.meta.au === exp.au && r.meta.compte === exp.compte, `${file} : période et compte`, JSON.stringify(r.meta));
    expect(r.soldeInitial === exp.soldeInitial && r.soldeFinal === exp.soldeFinal, `${file} : soldes initial et final`, `${r.soldeInitial} / ${r.soldeFinal}`);
    expect(r.totals && r.totals.debit === exp.totals.debit && r.totals.credit === exp.totals.credit, `${file} : ligne Total lue`, JSON.stringify(r.totals));
    expect(r.controls.length >= 3 && r.controls.every((c) => c.ok === true) && !r.warnings.length, `${file} : contrôles de totaux, de solde et de période réussis`, JSON.stringify(r.controls.concat(r.warnings)));
  }
  const acd = EXP['releve-acd.pdf'].ops;
  expect(acd.some((o) => / SOLDE TRAVAUX ACOMPTE DEDUIT CHANTIER 12$/.test(o.lib)), 'libellé sur deux lignes réuni');
  // Écart détecté : opération retirée du relevé lu
  {
    const b = fs.readFileSync(D + 'releve-acd.pdf');
    const doc = await PdfReader.read(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
    const ln = PdfReader.lines(doc.pages[0]);
    const victim = ln.find((l) => /FRAIS TENUE DE COMPTE/.test(l.text));
    doc.pages[0].glyphs = doc.pages[0].glyphs.filter((g) => Math.abs(g.y - victim.y) > 0.5);
    const r = RelevePdf.parse(doc, PdfReader);
    expect(r.ops.length === acd.length - 1 && r.controls.filter((c) => c.ok === false).length === 2, 'opération manquante : total des dépenses et solde final en écart', JSON.stringify(r.controls));
  }
  // Fichiers refusés
  const fail = async (bytes) => { try { RelevePdf.parse(await PdfReader.read(bytes), PdfReader); return ''; } catch (e) { return e.message; } };
  expect(/pas un PDF/.test(await fail(new TextEncoder().encode('Date;Libellé;Montant').buffer)), 'fichier qui n\'est pas un PDF : refusé');
  const enc = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R /Encrypt 2 0 R >>\n%%EOF');
  expect(/mot de passe/.test(await fail(enc.buffer.slice(enc.byteOffset, enc.byteOffset + enc.length))), 'PDF protégé : message explicite');

  // 2. Page « Relevés PDF »
  const br = await chromium.launch();
  const p = await (await br.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true })).newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(BASE);
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!'); await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.click('a[data-nav=releves]'); await p.waitForSelector('.fec-drop');
  let [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('.fec-drop')]);
  // Ordre inverse : la page les remet dans l'ordre chronologique
  await ch.setFiles([D + 'releve-banque.pdf', D + 'releve-acd.pdf']);
  await p.waitForFunction(() => document.querySelectorAll('.rel-file').length === 2, null, { timeout: 15000 });
  const badges = await p.$$eval('.rel-file .badge', (x) => x.map((e) => e.textContent));
  expect(badges.join() === 'Contrôles OK,Contrôles OK', 'deux relevés lus, contrôles OK', badges.join());
  const total = acd.length + EXP['releve-banque.pdf'].ops.length;
  expect(await p.$$eval('.rel-table tbody tr', (r) => r.length) === total, `aperçu : ${total} opérations`);
  expect(!(await p.textContent('main')).includes('00000000099') && (await p.textContent('main')).includes('…00099'), 'n° de compte masqué à l\'écran');
  // Même relevé ajouté deux fois : refusé
  [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('button[data-action=rel-pick]')]);
  await ch.setFiles(D + 'releve-acd.pdf');
  await p.waitForFunction(() => /déjà ajouté/.test(document.querySelector('main').textContent), null, { timeout: 10000 });
  expect(await p.$$eval('.rel-table tbody tr', (r) => r.length) === total, 'relevé ajouté deux fois : signalé et non repris');
  await p.click('section.card:has(.banner.warn) button[data-action=rel-remove]');
  expect((await p.$$('section.card:has(.banner.warn)')).length === 0 && (await p.$$('.rel-file')).length === 2, 'Retirer : le relevé en double disparaît, les autres restent');
  await p.screenshot({ path: O + 'releves.png', fullPage: true });
  // Mobile : pas de débordement horizontal
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(200);
  expect(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'mobile : pas de débordement horizontal');
  await p.setViewportSize({ width: 1366, height: 950 });

  // Téléchargement : montant signé (par défaut), puis débit / crédit
  const readXlsx = async (file) => p.evaluate(async (b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const book = await SheetReader.read(new File([bin], 'x.xlsx'));
    return { name: book.sheets[0].name, rows: book.sheets[0].rows.map((r) => r.map((c) => c.text)) };
  }, fs.readFileSync(file).toString('base64'));
  const fmt = (n) => String(Math.round(n * 100) / 100);
  for (const mode of ['signe', 'dc']) {
    if (mode === 'dc') await p.check('input[data-rel=format][value=dc]');
    await p.click('button[data-action=rel-download]'); await p.waitForSelector('#ask[open]');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#ask button[type=submit]')]);
    const name = dl.suggestedFilename();
    await dl.saveAs(O + 'releves-' + mode + '.xlsx');
    const x = await readXlsx(O + 'releves-' + mode + '.xlsx');
    expect(name === 'transactions-2026-03-02-2026-04-30.xlsx', `${mode} : nom du fichier d'après la période`, name);
    const head = x.rows[0].join('|');
    expect(mode === 'dc' ? head === 'Date|Libellé|Débit|Crédit' : head === 'Date|Libellé|Montant', `${mode} : en-têtes`, head);
    expect(x.rows.length === total + 1, `${mode} : une ligne par opération`, String(x.rows.length));
    const all = acd.concat(EXP['releve-banque.pdf'].ops);
    const bad = all.map((o, i) => {
      const r = x.rows[i + 1];
      const want = mode === 'dc' ? [o.date, o.lib, o.debit ? fmt(o.debit) : '', o.credit ? fmt(o.credit) : ''] : [o.date, o.lib, fmt(o.credit - o.debit)];
      return r.map(String).join('|') === want.join('|') ? null : `${i}: ${r.join('|')} ≠ ${want.join('|')}`;
    }).filter(Boolean);
    expect(!bad.length, `${mode} : dates, libellés et montants exacts, dans l'ordre chronologique des relevés`, bad.slice(0, 3).join(' ; '));
  }

  // 3. Rapprochement : le relevé PDF s'importe directement
  await p.goto(BASE + '#/fec'); await p.waitForSelector('.fec-drop');
  [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('.fec-drop')]);
  await ch.setFiles(D + '123456789FEC20251231.txt'); await p.waitForSelector('.fec-meta');
  const { fecTab } = require('./lib');
  await fecTab(p, 'rappro', 0);
  [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('button[data-action=rappro-import]')]);
  await ch.setFiles(D + 'releve-banque.pdf');
  await p.waitForFunction(() => /releve-banque\.pdf \(PDF, 13 op\.\)/.test(document.querySelector('main').textContent), null, { timeout: 10000 }).catch(() => {});
  expect(/releve-banque\.pdf \(PDF, 13 op\.\)/.test(await p.textContent('main')), 'rapprochement : relevé PDF importé (13 opérations)');

  // Verrouillage : relevés effacés de la mémoire
  expect(await p.evaluate(() => !!(ui.rel && ui.rel.files.length)), 'relevés en mémoire avant verrouillage');
  await p.evaluate(() => forgetSession && forgetSession());
  expect(await p.evaluate(() => !ui.rel), 'verrouillage : relevés effacés');

  console.log(ko ? `${ko} écart(s)` : 'relevés PDF conformes');
  console.log('erreurs', errors);
  await br.close();
  if (ko) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(1); });
