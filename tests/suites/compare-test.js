const { chromium } = require('playwright');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const K = D + 'compare/';
const O = path.join(__dirname, '../out/');
// Comparateur de FEC : un FEC présenté comme ACD (référence) et le même exercice présenté comme Pennylane (comptes, journaux,
// n° et tiers différents), avec des différences connues (tests/gen/gencompare.py) ; puis la page « Comparer deux FEC ».
let ko = 0;
const expect = (cond, label, info) => { if (cond) console.log(`OK ${label}`); else { ko++; console.log(`KO ${label}${info ? ' : ' + info : ''}`); } };
const EXP = JSON.parse(fs.readFileSync(K + 'compare-attendu.json', 'utf8'));
const ACD = 'acd-900000010FEC20251231.txt', PL = 'pennylane-900000010FEC20251231.txt', PART = 'pennylane-partiel-900000010FEC20251231.txt';
const BASE = 'http://localhost:8765/';

const ctx = { self: { postMessage() {} }, postMessage() {}, console, TextDecoder, TextEncoder, Intl };
vm.createContext(ctx);
['fec-worker.js', 'fec-compare.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/', f), 'utf8'), ctx));
const buf = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
const compare = (a, b, opts, names) => ctx.self.compareFec({ buffer: buf(a), fileName: (names || [])[0] || 'a.txt' }, { buffer: buf(b), fileName: (names || [])[1] || 'b.txt' }, opts || {});
const file = (f) => fs.readFileSync(f.includes('/') ? f : K + f);
const run = (a, b, opts) => compare(file(a), file(b), opts, [path.basename(a), path.basename(b)]);
// Résultat (classes 6 et 7) calculé directement sur le fichier, sans le comparateur
const resultOf = (f) => {
  const L = file(f).toString('utf8').split(/\r?\n/).filter(Boolean);
  const H = L[0].split('\t');
  const [c, d, cr] = ['CompteNum', 'Debit', 'Credit'].map((k) => H.indexOf(k));
  return Math.round(L.slice(1).map((l) => l.split('\t')).filter((x) => /^[67]/.test(x[c])).reduce((t, x) => t + parseFloat(x[cr].replace(',', '.') || 0) - parseFloat(x[d].replace(',', '.') || 0), 0) * 100) / 100;
};

(async () => {
  // 1. Moteur : ACD (référence) / Pennylane
  const r = run(ACD, PL);
  const s = r.stats;
  console.log('stats :', JSON.stringify(s));
  expect(s.absent === 2 && s.extra === 2 && s.modified === 3, 'ACD / Pennylane : 2 écritures absentes, 2 en plus, 3 modifiées', `${s.absent} / ${s.extra} / ${s.modified}`);
  expect(s.identical + s.ventil + s.modified + s.absent === s.refOps, 'chaque écriture de la référence est classée une fois');
  expect(r.absent.map((e) => `${e.dt}|${e.p}|${e.amount}`).join() === EXP.absent.map((e) => `${e.date}|${e.piece}|${e.total}`).join(), 'factures non saisies retrouvées (date, pièce, montant)', r.absent.map((e) => `${e.dt}|${e.p}|${e.amount}`).join());
  expect(r.extra.map((e) => `${e.dt}|${e.amount}`).sort().join() === EXP.extra.map((e) => `${e.date}|${e.total}`).sort().join(), 'commission en plus et facture saisie deux fois retrouvées', r.extra.map((e) => `${e.dt}|${e.amount}`).join());
  const mod = (p) => r.modified.find((m) => m.ref.p === p);
  const mm = mod(EXP.montant[0].piece), mc = mod(EXP.compte[0].piece), md = mod(EXP.date[0].piece);
  expect(mm && mm.types.join() === 'montant' && mm.diffs.length === 3, 'facture au montant différent : 3 lignes en écart de montant', mm && JSON.stringify(mm.types));
  expect(mc && mc.types.join() === 'compte' && mc.diffs[0].ref.k === EXP.compte[0].ref && mc.diffs[0].cmp.k === EXP.compte[0].cmp, 'facture imputée sur un autre compte : 622600 → 623100', mc && JSON.stringify(mc.diffs));
  expect(md && md.types.join() === 'date' && md.days === EXP.date[0].days, 'facture datée autrement : + 3 jours', md && JSON.stringify([md.types, md.days]));
  expect(s.ventil === 12 && r.groups.length === 12 && r.groups.every((g) => g.k === '431000'), 'paie en une écriture (ACD) ou deux (Pennylane) : ventilation différente, pas un écart', `${s.ventil} / ${r.groups.length}`);
  const maps = r.maps.map((m) => `${m.ref}>${m.cmp}`);
  expect(maps.includes('512000>512100') && maps.includes('T401:BOULANGERIE ARTISAN>T401:BOULANGERIE ARTISANALE'), 'correspondances reconnues : banque 51200000 ↔ 5121001, tiers au nom tronqué', maps.join(' | '));
  expect(!r.balance.some((b) => b.k.startsWith('T401:GARAGE') && b.mapped) && r.balance.some((b) => b.k === 'T401:GARAGE DU CENTRE'), 'tiers « Garage du Centre SARL » = « GARAGE DU CENTRE » (forme juridique ignorée)');
  const an = r.balance.filter((b) => Math.abs(b.ecartAN) >= 0.005).map((b) => `${b.k}:${b.ecartAN}`).sort();
  expect(an.join() === '106800:200,110000:-200', 'à-nouveaux : seuls 1068 et 110 diffèrent (globaux d\'un côté, détaillés par pièce de l\'autre)', an.join());
  const res = r.synth.find((x) => x.strong);
  expect(res.ref === resultOf(ACD) && res.cmp === resultOf(PL), 'résultat de chaque FEC conforme au fichier', `${res.ref} / ${resultOf(ACD)} ; ${res.cmp} / ${resultOf(PL)}`);
  expect(r.accountPairs.length === 1 && r.accountPairs[0].ref === '622600', 'imputations différentes résumées par paire de comptes');
  // Référence inversée : absentes et en plus échangées
  const sw = run(PL, ACD);
  expect(sw.stats.absent === 2 && sw.stats.extra === 2 && sw.stats.modified === 3 && sw.stats.sumAbs === s.sumExtra && sw.stats.sumExtra === s.sumAbs, 'référence inversée : absentes et en plus échangées');
  // Même fichier : aucune différence
  const same = run(ACD, ACD);
  expect(same.stats.identical === same.stats.refOps && !same.stats.absent && !same.stats.extra && !same.stats.modified && !same.maps.length && !same.balance.some((b) => b.ecart), 'même FEC des deux côtés : tout identique');
  // Export en cours d'exercice : période commune
  const p = run(ACD, PART);
  expect(p.period.restricted && p.period.end === '2025-10-31' && p.period.outRef > 0 && !p.period.outCmp, 'FEC comparé arrêté au 31/10 : comparaison limitée à la période commune', JSON.stringify(p.period));
  expect(p.stats.absent === 2 && p.stats.extra === 1 && p.stats.modified === 3, 'période commune : mêmes différences jusqu\'au 31/10', JSON.stringify(p.stats));
  const pf = run(ACD, PART, { full: true });
  expect(!pf.period.restricted && pf.stats.absent > 30, 'option « tout comparer » : les écritures de novembre et décembre apparaissent absentes', String(pf.stats.absent));
  // Deux exports du même logiciel : lignes supprimées retrouvées une à une
  const src = file(D + '123456789FEC20251231.txt').toString('latin1').split('\n');
  const removed = src.filter((l, i) => i && i % 53 === 0 && l.trim()).length;
  const cut = Buffer.from(src.filter((l, i) => !(i && i % 53 === 0 && l.trim())).join('\n'), 'latin1');
  const rc = compare(file(D + '123456789FEC20251231.txt'), cut, {}, ['123456789FEC20251231.txt', '123456789FEC20251231.txt']);
  const absLines = rc.modified.reduce((t, m) => t + m.diffs.filter((x) => x.t === 'abs').length, 0) + rc.absent.reduce((t, e) => t + e.lines.length, 0);
  expect(absLines === removed && !rc.extra.length, `même logiciel : ${removed} lignes supprimées retrouvées`, `${absLines} / ${removed} ; ${JSON.stringify(rc.stats)}`);
  const w = compare(file(ACD), file(D + '123456789FEC20251231.txt'), {}, [ACD, '123456789FEC20251231.txt']);
  expect(w.warnings.some((x) => /SIREN différents/.test(x)), 'SIREN différents : signalé');
  let err = '';
  try { compare(Buffer.from('pas un FEC'), file(ACD), {}, ['x.txt', ACD]); } catch (e) { err = e.message; }
  expect(/en-tête de FEC non reconnu/.test(err), 'fichier qui n\'est pas un FEC : refusé', err);

  // 2. Page « Comparer deux FEC »
  const br = await chromium.launch();
  const pg = await (await br.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true })).newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await pg.goto(BASE);
  await pg.fill('input[name=p1]', 'Cabinet-Test-2026!'); await pg.fill('input[name=p2]', 'Cabinet-Test-2026!'); await pg.check('input[name=ack]'); await pg.click('button[type=submit]'); await pg.waitForSelector('.layout');
  await pg.goto(BASE + '#/fec'); await pg.waitForSelector('.fec-drop');
  await pg.click('a[href="#/comparer"]'); await pg.waitForSelector('.cmp-slots');
  const pick = async (side, f) => { const [ch] = await Promise.all([pg.waitForEvent('filechooser'), pg.click(`.cmp-slot[data-side=${side}]`)]); await ch.setFiles(K + f); };
  await pick('ref', ACD);
  expect(!(await pg.$('.fec-kpis')), 'un seul FEC choisi : pas encore de comparaison');
  await pick('cmp', PL);
  await pg.waitForSelector('.fec-kpis', { timeout: 20000 });
  const kpis = await pg.$$eval('.fec-kpis .kpi', (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  console.log('indicateurs :', kpis.join(' | '));
  expect(/^2 ?Absentes/.test(kpis[1]) && /^2 ?En plus/.test(kpis[2]) && /^3 ?Écritures modifiées/.test(kpis[3]), 'indicateurs : 2 absentes, 2 en plus, 3 modifiées');
  expect((await pg.textContent('.cmp-slot[data-side=ref]')).includes('Du 03/01/2025 au 31/12/2025'), 'période de chaque FEC affichée');
  await pg.click('button[data-action=cmp-tab][data-tab=ecritures]');
  expect(await pg.$$eval('.cmp-entry', (x) => x.length) === 7, 'onglet Écritures : 7 écritures listées');
  await pg.click('.cmp-entry summary');
  expect(await pg.$$eval('.cmp-entry[open] .cmp-table tbody tr', (x) => x.length) === 3, 'détail d\'une écriture absente : 3 lignes');
  await pg.click('button[data-action=cmp-tab][data-tab=balance]');
  const nDiff = await pg.$$eval('.cmp-table tbody tr.cmp-diff', (x) => x.length);
  await pg.check('input[data-cmp=all]');
  expect(nDiff > 5 && (await pg.$$eval('.cmp-table tbody tr:not(.cmp-rub)', (x) => x.length)) > nDiff, 'balance : comptes en écart, puis tous les comptes', String(nDiff));
  await pg.click('button[data-action=cmp-tab][data-tab=an]');
  expect(await pg.$$eval('.cmp-table tbody tr', (x) => x.length) === 2, 'onglet À-nouveaux : 1068 et 110');
  await pg.click('button[data-action=cmp-tab][data-tab=corresp]');
  expect((await pg.textContent('main')).includes('5121001'), 'onglet Correspondances : banque 5121001');
  await pg.screenshot({ path: O + 'comparer.png', fullPage: true });
  // Export Excel
  await pg.click('button[data-action=cmp-export]'); await pg.waitForSelector('#ask[open]');
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#ask button[type=submit]')]);
  await dl.saveAs(O + 'comparaison.xlsx');
  const book = await pg.evaluate(async (b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bk = await SheetReader.read(new File([bin], 'x.xlsx'));
    return bk.sheets.map((sh) => ({ name: sh.name, n: sh.rows.length }));
  }, fs.readFileSync(O + 'comparaison.xlsx').toString('base64'));
  console.log('export :', dl.suggestedFilename(), JSON.stringify(book));
  const sheet = (n) => book.find((x) => x.name === n) || { n: -1 };
  expect(book.length === 7 && sheet('Absentes').n === 7 && sheet('En plus').n === 6 && sheet('Modifiées').n === 6, 'export Excel : 7 feuilles, lignes des écritures absentes, en plus et modifiées', JSON.stringify(book));
  // Inverser la référence
  await pg.click('button[data-action=cmp-swap]');
  await pg.waitForSelector('.fec-kpis', { timeout: 20000 });
  expect((await pg.textContent('.cmp-slot[data-side=ref]')).includes(PL), 'Inverser : Pennylane devient la référence');
  // FEC partiel : période commune, puis tout comparer
  await pick('ref', ACD); await pg.waitForSelector('.fec-kpis', { timeout: 20000 });
  await pick('cmp', PART); await pg.waitForSelector('.cmp-period', { timeout: 20000 });
  expect(/période commune, du 03\/01\/2025 au 31\/10\/2025/.test(await pg.textContent('.cmp-period')), 'export partiel : période commune annoncée');
  await pg.check('input[data-cmp=full]');
  await pg.waitForFunction(() => /Toutes les écritures sont comparées/.test((document.querySelector('.cmp-period') || {}).textContent || ''), null, { timeout: 20000 });
  expect(true, 'option « tout comparer » appliquée');
  // Mobile
  await pg.setViewportSize({ width: 390, height: 844 }); await pg.waitForTimeout(200);
  expect(!(await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'mobile : pas de débordement horizontal');
  // Verrouillage : fichiers et résultat effacés
  await pg.evaluate(() => forgetSession());
  expect(await pg.evaluate(() => !ui.cmp), 'verrouillage : comparaison effacée');

  console.log(ko ? `${ko} écart(s)` : 'comparateur conforme');
  console.log('erreurs', errors);
  await br.close();
  if (ko) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(1); });
