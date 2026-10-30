const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, '../fixtures/social/');
const O = path.join(__dirname, '../out/');
// CYCLE SOCIAL : cadrage de la paie (tests/gen/gensocial.py, données inventées). Récapitulatif et détail des cotisations
// SILAE au format .xls (BIFF8), grand livre Pennylane en .xlsx. Résultats attendus (attendu.json) produits par l'outil
// autonome d'origine (« Cadrage paie ») sur les mêmes fichiers : montants, statuts et notes identiques.
let ko = 0;
const expect = (cond, label, info) => { if (cond) console.log(`OK ${label}`); else { ko++; console.log(`KO ${label}${info ? ' : ' + info : ''}`); } };
const EXP = JSON.parse(fs.readFileSync(D + 'attendu.json', 'utf8'));
const EXPF = JSON.parse(fs.readFileSync(D + 'attendu-fec.json', 'utf8'));
(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8765' });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await pg.goto('http://localhost:8765/');
  await pg.fill('input[name=p1]', 'Cabinet-Test-2026!'); await pg.fill('input[name=p2]', 'Cabinet-Test-2026!'); await pg.check('input[name=ack]'); await pg.click('button[type=submit]'); await pg.waitForSelector('.layout');
  // Page autonome (sans FEC ouvert) : l'adresse #/social reste disponible ; le menu mène à l'onglet Paie de l'Espace FEC
  await pg.goto('http://localhost:8765/#/social'); await pg.waitForSelector('.soc-zones');
  expect((await pg.textContent('h1')) === 'CYCLE SOCIAL' && !(await pg.$('a[data-nav=social]')), 'page « CYCLE SOCIAL » (hors menu)');
  const drop = async (zone, file) => {
    const [ch] = await Promise.all([pg.waitForEvent('filechooser'), pg.click(`.soc-drop[data-zone=${zone}]`)]);
    await ch.setFiles(D + file);
    await pg.waitForFunction((z) => ui.social && ui.social.files.some((f) => f.zone === z), zone);
    await pg.waitForTimeout(150);
  };
  const dump = () => pg.evaluate(() => ui.social.last.cards.map((c) => [c.key, c.s, c.c, c.e, c.st, socNote(ui.social, c)]));
  const same = (a, b) => a.length === b.length && a.every((x, i) => x[0] === b[i][0] && x[1] === b[i][1] && x[2] === b[i][2] && x[3] === b[i][3] && x[4] === b[i][4] && x[5] === b[i][5]);

  // 1. Mauvaise case : fichier refusé
  await drop('recap', 'detail-cotisations.xls');
  expect((await pg.textContent('.soc-zone:nth-child(1)')).includes('déposez-le dans la bonne case'), 'fichier déposé dans la mauvaise case : refusé');

  // 2. Les trois fichiers (.xls ancien format, .xlsx)
  await drop('recap', 'recap-paie.xls');
  await drop('cot', 'detail-cotisations.xls');
  await drop('gl', 'grand-livre-pa.xlsx');
  expect(await pg.evaluate(() => !!ui.social.last && ui.social.dClo === '2026-03-31'), 'analyse lancée, date de clôture reprise de la dernière période', await pg.evaluate(() => ui.social.err));
  let got = await dump();
  expect(same(got, EXP.before), 'mêmes montants, statuts et notes que l\'outil d\'origine (641, 645, 63, 421, 431, 437, 442)', JSON.stringify(got.map((x) => x.slice(0, 5))));
  expect((await pg.textContent('.soc-card[data-key="421000"] .soc-note')).includes('(non réglé : 03/2026)'), 'net de mars non réglé signalé');

  // 3. Reclassement proposé entre 6451 et 6453, écriture à passer
  await pg.click('.soc-card[data-key="645100"] [data-social=move]'); await pg.waitForTimeout(150);
  got = await dump();
  const od = await pg.evaluate(() => socOdRows(ui.social));
  expect(same(got, EXP.after) && JSON.stringify(od) === JSON.stringify(EXP.od), 'reclassement : écart justifié des deux côtés, écriture 6453 / 6451', JSON.stringify(od));
  expect((await pg.textContent('.soc-od')).includes('Reclassement paie 6451 vers 6453'), 'écritures de reclassement affichées');
  await pg.click('.soc-card[data-key="645100"] [data-social=unrec]'); await pg.waitForTimeout(150);
  expect(same(await dump(), EXP.before), 'reclassement retiré');

  // 4. Motif saisi, retiré ; piste
  await pg.fill('.soc-card[data-key="63-6333"] [data-soc-ml]', 'Formation restée en 6451');
  await pg.fill('.soc-card[data-key="63-6333"] [data-soc-ma]', '30');
  await pg.click('.soc-card[data-key="63-6333"] [data-action=social-add]'); await pg.waitForTimeout(150);
  let n = await pg.textContent('.soc-card[data-key="63-6333"] .soc-note');
  expect(n.includes('Motif : Formation restée en 6451 (30,00 €)') && (await pg.textContent('.soc-card[data-key="63-6333"] .soc-chip')) === 'Écart justifié', 'motif saisi : écart justifié', n);
  await pg.click('.soc-card[data-key="63-6333"] [data-action=social-rm]'); await pg.waitForTimeout(150);
  expect((await pg.textContent('.soc-card[data-key="63-6333"] .soc-chip')) === 'À justifier', 'motif retiré');

  // 5. Organismes rattachés modifiés à la main
  await pg.click('.soc-card[data-key="645300"] .soc-det summary');
  await pg.click('.soc-card[data-key="645300"] [data-social=org]:checked'); await pg.waitForTimeout(150);
  expect(await pg.evaluate(() => { const c = socCardOf('645300'); return c.s === 0 && c.sub === 'Aucun organisme rattaché'; }), 'organisme détaché du 6453');
  await pg.evaluate(() => { ui.social.MAP = {}; socRun(); refresh(); });

  // 6. Copie des notes
  await pg.click('[data-action=social-copy-all]'); await pg.waitForTimeout(150);
  const clip = await pg.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  expect(clip === EXP.before.map((x) => x[5]).join('\n\n'), 'toutes les notes copiées', clip.slice(0, 100));

  // 7. Récapitulatif enregistré en page HTML avec l'extension .xls : même résultat
  await drop('recap', 'recap-paie-html.xls');
  expect(same(await dump(), EXP.before), 'export « Excel » en HTML (.xls) lu comme le classeur', await pg.evaluate(() => ui.social.err || JSON.stringify(ui.social.files)));

  // 8. Logiciel comptable retenu
  await pg.fill('[data-social=soft]', 'ACD'); await pg.dispatchEvent('[data-social=soft]', 'change'); await pg.waitForTimeout(150);
  expect((await pg.textContent('.soc-card[data-key="641"] .soc-note')).replace(/[\u202f\u00a0]/g, ' ').startsWith('641 – SILAE : 15 200,00 € / ACD :') && await pg.evaluate(() => data.settings.socialSoft === 'ACD'), 'nom du logiciel dans les notes, retenu');

  // 9. FEC à la place du grand livre : paie passée au journal OD, repérée écriture par écriture
  await pg.fill('[data-social=soft]', 'Pennylane'); await pg.dispatchEvent('[data-social=soft]', 'change'); await pg.waitForTimeout(100);
  await pg.click('[data-action=social-clear]'); await pg.waitForTimeout(150);
  await drop('recap', 'recap-paie.xls');
  await drop('cot', 'detail-cotisations.xls');
  await drop('gl', '900000010FEC20260331.txt');
  expect((await pg.textContent('.soc-zone:nth-child(3)')).includes('FEC : ') && (await pg.textContent('.soc-zone:nth-child(3) h2')) === 'FEC', 'case FEC : fichier texte lu, lignes des classes 42, 43, 44, 63 et 64 retenues', await pg.textContent('.soc-zone:nth-child(3) .soc-files'));
  got = await dump();
  expect(same(got, EXPF.before), 'FEC : mêmes montants, statuts et notes que l\'outil d\'origine (paie en journal OD)', JSON.stringify(got.map((x) => x.slice(0, 5))));
  await pg.click('.soc-card[data-key="645100"] [data-social=move]'); await pg.waitForTimeout(150);
  expect(same(await dump(), EXPF.after) && JSON.stringify(await pg.evaluate(() => socOdRows(ui.social))) === JSON.stringify(EXPF.od), 'FEC : reclassement et écriture identiques');

  // 10. Téléphone, retrait des fichiers, verrouillage
  await pg.screenshot({ path: O + 'social.png', fullPage: true });
  await pg.setViewportSize({ width: 390, height: 844 }); await pg.waitForTimeout(300);
  const over = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const wide = await pg.evaluate(() => [...document.querySelectorAll('#main *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('.grid-wrap')).slice(0, 5).map((e) => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right)).join(' | '));
  expect(over <= 1, 'téléphone : pas de débordement horizontal', `${over} ${wide}`);
  await pg.click('[data-action=social-clear]'); await pg.waitForTimeout(150);
  expect(await pg.evaluate(() => !ui.social || (!ui.social.files.length && !ui.social.last)), 'fichiers retirés');
  await pg.evaluate(() => forgetSession());
  expect(await pg.evaluate(() => ui.social === null), 'verrouillage : paie effacée de la mémoire');

  console.log(ko ? `${ko} écart(s)` : 'cycle social conforme');
  console.log('erreurs', errors);
  await br.close();
  if (ko) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(1); });
