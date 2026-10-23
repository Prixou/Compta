const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
// Lettrage proposé (page « Lettrage ») : grand livre fournisseurs inventé (tests/gen/genlettrage.py) en PDF et en texte,
// puis FEC inventé (tests/gen/gentvarevue.py), fournisseurs et clients.
let ko = 0;
const expect = (cond, label, info) => { if (cond) console.log(`OK ${label}`); else { ko++; console.log(`KO ${label}${info ? ' : ' + info : ''}`); } };
const EXP = JSON.parse(fs.readFileSync(D + 'lettrage/attendu.json', 'utf8'));
(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8765' });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await pg.goto('http://localhost:8765/');
  await pg.fill('input[name=p1]', 'Cabinet-Test-2026!'); await pg.fill('input[name=p2]', 'Cabinet-Test-2026!'); await pg.check('input[name=ack]'); await pg.click('button[type=submit]'); await pg.waitForSelector('.layout');
  await pg.click('a[data-nav=lettrage]'); await pg.waitForSelector('.fec-drop');
  const S = () => pg.evaluate(() => {
    const st = ui.lett;
    const tot = { accounts: st.accs.length, lines: st.accs.reduce((t, a) => t + a.lines.length, 0), groups: 0, lettered: 0, amount: 0, open: 0 };
    const by = {};
    st.accs.forEach((a) => {
      a.groups.forEach((g) => { tot.groups++; tot.lettered += g.lines.length; tot.amount += g.lines.filter((x) => x.side === 'D').reduce((s, x) => s + x.a, 0) / 100; });
      tot.open += a.rest.length;
      by[a.code] = { groups: a.groups.length, open: a.rest.length, skipped: a.skipped, methods: a.groups.map((g) => g.m), letters: a.groups.map((g) => g.l) };
    });
    return { tot, by, src: st.src, msg: st.msg };
  });
  const check = (s, what) => {
    const t = s.tot;
    expect(t.accounts === EXP.accounts && t.lines === EXP.lines && t.groups === EXP.groups && t.lettered === EXP.lettered && Math.abs(t.amount - EXP.amount) < 0.01 && t.open === EXP.open,
      `${what} : ${EXP.groups} lettrages, ${EXP.lettered} écritures, ${EXP.amount} € lettrables, ${EXP.open} ouvertes`, JSON.stringify(t));
    const ok = Object.entries(EXP.byAccount).every(([code, e]) => { const b = s.by[code]; return b && b.groups === e.groups && b.open === e.open && (e.skipped === undefined || b.skipped === e.skipped) && (!e.methods || e.methods.join() === b.methods.join()); });
    expect(ok, `${what} : par compte, plus anciennes d'abord (FALPHA, à-nouveau compris), montant identique (FBETA), EI ignoré, compte continué sur la page suivante`, JSON.stringify(s.by));
  };

  // 1. Grand livre PDF
  const [ch] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('.fec-drop')]);
  await ch.setFiles(D + 'lettrage/grand-livre.pdf');
  await pg.waitForFunction(() => ui.lett && ui.lett.status === 'done' && ui.lett.accs.length, null, { timeout: 15000 });
  await pg.waitForTimeout(200);
  check(await S(), 'grand livre PDF');
  expect(await pg.$$eval('details.lett-acc', (x) => x.length) === 2, 'compte sans lettrage possible masqué');
  expect(await pg.$eval('details.lett-acc:has-text("FALPHA") .lett-l', (x) => x.textContent) === 'AA', 'lettres AA, AB… par compte');
  await pg.screenshot({ path: O + 'lettrage.png', fullPage: true });
  await pg.uncheck('input[data-lett=hide]'); await pg.waitForTimeout(150);
  expect(await pg.$$eval('details.lett-acc', (x) => x.length) === 3, 'tous les comptes affichés quand la case est décochée');
  await pg.fill('input[data-lett=q]', 'beta'); await pg.dispatchEvent('input[data-lett=q]', 'change'); await pg.waitForTimeout(150);
  expect(await pg.$$eval('details.lett-acc', (x) => x.length) === 1, 'recherche par compte ou nom');
  await pg.fill('input[data-lett=q]', ''); await pg.dispatchEvent('input[data-lett=q]', 'change'); await pg.waitForTimeout(150);

  // 2. Journaux de règlement : sans LCR, la traite de FBETA n'est plus lettrée ; choix conservé
  await pg.fill('input[data-lett=jr]', 'OD, BQ'); await pg.dispatchEvent('input[data-lett=jr]', 'change'); await pg.waitForTimeout(200);
  let s = await S();
  expect(s.by.FBETA.groups === 0 && s.by.FBETA.skipped === 2 && (await pg.evaluate(() => data.settings.lettrage.jr)) === 'OD, BQ', 'journaux de règlement modifiés : lettrage recalculé, choix conservé', JSON.stringify(s.by.FBETA));
  await pg.fill('input[data-lett=jr]', 'OD, BQ, LCR'); await pg.dispatchEvent('input[data-lett=jr]', 'change'); await pg.waitForTimeout(200);

  // 3. Texte collé
  await pg.click('.lett-paste summary');
  await pg.fill('#lett-tx', fs.readFileSync(D + 'lettrage/grand-livre.txt', 'utf8'));
  await pg.click('[data-action=lett-text]'); await pg.waitForTimeout(200);
  check(await S(), 'texte collé');

  // 4. Copie (tableur) et export Excel
  await pg.click('[data-action=lett-copy]'); await pg.waitForTimeout(200);
  const clip = await pg.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  expect(clip.startsWith('Compte\tLettre\tDate') && clip.trim().split('\n').length === EXP.lettered + 1, 'copie : une ligne par écriture lettrée', clip.slice(0, 120));
  await pg.click('[data-action=lett-xlsx]'); await pg.waitForSelector('#ask');
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#ask button[type=submit]')]);
  await dl.saveAs(O + dl.suggestedFilename());
  const zip = fs.readFileSync(O + dl.suggestedFilename());
  expect(zip.slice(0, 2).toString() === 'PK' && ['Lettrages', 'Écritures ouvertes', 'Synthèse'].every((x) => zip.includes(Buffer.from(x))), 'export Excel : lettrages, écritures ouvertes, synthèse', dl.suggestedFilename());

  // 5. FEC : lignes non lettrées des fournisseurs, puis des clients
  const [ch2] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('.fec-drop')]);
  await ch2.setFiles(D + '600000006FEC20261231.txt');
  await pg.waitForFunction(() => ui.lett && ui.lett.src === 'fec' && ui.lett.status === 'done', null, { timeout: 30000 });
  await pg.waitForTimeout(200);
  s = await S();
  expect(s.by.SCI && s.by.SCI.groups === 2 && s.by.SCI.open === 1 && s.by.GROS && s.by.GROS.open === 1 && s.by.IMMO && s.by.IMMO.groups === 1 && s.tot.groups === 3,
    'FEC : loyers réglés lettrés deux à deux, loyer de mars ouvert, immobilisation lettrée (404)', JSON.stringify(s.by));
  await pg.selectOption('select[data-lett=tiers]', 'cli'); await pg.waitForTimeout(200);
  s = await S();
  expect(s.tot.accounts === 1 && s.tot.lines === 1 && s.tot.groups === 0, 'FEC, clients : seule la facture non lettrée reste (vente de mars)', JSON.stringify(s));

  // 6. FEC ouvert dans l'analyse
  await pg.click('[data-action=lett-clear]');
  await pg.goto('http://localhost:8765/#/fec'); await pg.waitForSelector('.fec-drop');
  const [ch3] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('.fec-drop')]);
  await ch3.setFiles(D + '600000006FEC20261231.txt'); await pg.waitForSelector('.fec-meta');
  await pg.click('a[data-nav=lettrage]'); await pg.waitForSelector('[data-action=lett-fec]');
  await pg.click('[data-action=lett-fec]'); await pg.waitForTimeout(200);
  s = await S();
  expect(s.src === 'fec' && s.tot.groups === 3, 'bouton « Utiliser le FEC ouvert »', JSON.stringify(s.tot));

  // 7. Téléphone et verrouillage
  await pg.setViewportSize({ width: 390, height: 844 }); await pg.waitForTimeout(300);
  const over = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over <= 1, 'téléphone : pas de débordement horizontal', String(over));
  await pg.screenshot({ path: O + 'lettrage-mobile.png' });
  await pg.evaluate(() => forgetSession());
  expect(await pg.evaluate(() => ui.lett === null), 'verrouillage : lettrage effacé de la mémoire');

  console.log(ko ? `${ko} écart(s)` : 'lettrage proposé conforme');
  console.log('erreurs', errors);
  await br.close();
  if (ko) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(1); });
