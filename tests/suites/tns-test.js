const { chromium } = require('playwright');
const path = require('path');
const O = path.join(__dirname, '../out/');
// TNS-COTISATION : régularisation des cotisations des TNS (données inventées). Montants attendus calculés avec l'outil
// autonome d'origine (« Régularisation TNS ») sur les mêmes saisies.
let ko = 0;
const expect = (cond, label, info) => { if (cond) console.log(`OK ${label}`); else { ko++; console.log(`KO ${label}${info ? ' : ' + info : ''}`); } };
const near = (a, b) => Math.abs(a - b) < 0.01;
(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await pg.goto('http://localhost:8765/');
  await pg.fill('input[name=p1]', 'Cabinet-Test-2026!'); await pg.fill('input[name=p2]', 'Cabinet-Test-2026!'); await pg.check('input[name=ack]'); await pg.click('button[type=submit]'); await pg.waitForSelector('.layout');
  await pg.click('a[data-nav=tns]'); await pg.waitForSelector('.tns-profiles');
  expect((await pg.textContent('h1')) === 'Cotisations TNS' && (await pg.textContent('a[data-nav=tns]')).includes('Cotisations TNS'), 'page et menu « Cotisations TNS »');
  const set = async (k, v) => { await pg.fill(`[data-tns=${k}]`, v); await pg.dispatchEvent(`[data-tns=${k}]`, 'change'); await pg.waitForTimeout(60); };
  const res = () => pg.evaluate(() => tnsCompute(ui.tns.S).res.map((o) => [o.nom, o.calcN1, o.calcN, o.total]));

  // 1. Gérant de société à l'IS, exercice clos en septembre
  await pg.click('[data-action=tns-profil][data-p=is]'); await pg.waitForTimeout(100);
  await set('cloture', '2026-09');
  for (const [k, v] of [['remu', '40000'], ['cotisPrises', '15000'], ['dividendes', '10000'], ['capital', '20000'], ['assietteN', '50000'], ['defN1U', '21000'], ['provN1U', '18000'], ['regPayU', '1000'], ['provNU', '19500'], ['provResteU', '4875'], ['capPrec', '2500']]) await set(k, v);
  let r = await res();
  expect(r.length === 1 && near(r[0][1], 20378.55) && near(r[0][2], 21636.76) && near(r[0][3], 3602.57), 'IS : définitives N-1 recalculées, définitives N estimées, reste dû (9/12)', JSON.stringify(r));
  const situ = await pg.textContent('.tns-situ');
  expect(situ.includes('Situation au 30/09/2026') && situ.includes('Quote-part 2026 rattachée (9/12)') && situ.includes('Reste dû à la clôture') && /646\s*4386/.test(situ.replace(/\s+/g, ' ')) && situ.includes('Extourne'),
    'situation au 30/09 et écritures (extourne 4386, charge 646 / 4386)', situ.slice(0, 200));
  expect((await pg.textContent('.tns-org')).includes('621 €'), 'contrôle de l\'avis : écart de 621 € signalé sur les définitives');

  // 2. Pharmacien : Urssaf + CAVP, revenu N estimé
  await pg.click('[data-action=tns-profil][data-p=pharma]'); await pg.waitForTimeout(100);
  for (const [k, v] of [['cloture', '2026-12'], ['benef', '90000'], ['cotisDed', '20000'], ['madelin', ''], ['assietteN', ''], ['revBrutN', '120000'], ['defN1U', '30000'], ['provN1U', '28000'], ['regPayU', ''], ['provNU', '31000'], ['provResteU', '0'], ['defN1C', '15000'], ['provN1C', '14000'], ['provNC', '15500'], ['provResteC', '0'], ['capPrec', '']]) await set(k, v);
  r = await res();
  expect(r.length === 2 && r[1][0] === 'CAVP' && near(r[0][1], 16754) && near(r[0][2], 18410.22) && near(r[0][3], -10589.78) && near(r[1][1], 16893.01) && near(r[1][2], 17115.2) && near(r[1][3], 2615.2),
    'pharmacien : Urssaf et CAVP, trop-versé Urssaf, reste dû CAVP', JSON.stringify(r));
  const ths = (await pg.$$eval('.tns-situ th', (x) => x.map((e) => e.textContent))).join(), situ2 = await pg.textContent('.tns-situ');
  expect(ths.startsWith('Élément,Urssaf,CAVP,Total') && situ2.includes('4387'), 'colonnes Urssaf, CAVP, Total ; trop-versé global en 4387', ths + ' | ' + situ2.slice(-400));

  // 3. Saisie conservée dans le dossier
  await pg.evaluate(() => { data.clients.push({ id: 'tns-demo', nom: 'PHARMACIE DEMO', code: 'D01' }); persist(); });
  await pg.goto('http://localhost:8765/#/tns/tns-demo'); await pg.waitForTimeout(200);
  expect((await pg.inputValue('[data-tns=client]')) === 'PHARMACIE DEMO', 'dossier choisi : nom repris');
  await set('benef', '55000');
  expect(await pg.evaluate(() => data.clients.find((c) => c.id === 'tns-demo').tns.benef === '55000'), 'saisie conservée dans le dossier');
  await pg.selectOption('[data-tns=dossier]', ''); await pg.waitForTimeout(100);
  await pg.selectOption('[data-tns=dossier]', 'tns-demo'); await pg.waitForTimeout(100);
  expect((await pg.inputValue('[data-tns=benef]')) === '55000', 'saisie reprise en rouvrant le dossier');

  // 4. Rapport imprimable
  await pg.evaluate(() => { window.print = () => { window.__printed = document.getElementById('print-area').textContent; }; });
  await pg.click('[data-action=tns-print]'); await pg.waitForTimeout(100);
  const rep = (await pg.evaluate(() => window.__printed || '')).replace(/\s+/g, ' ');
  expect(rep.includes('Régularisation des cotisations sociales TNS') && rep.includes('PHARMACIE DEMO') && rep.includes('3. Situation au 31/12/2026') && rep.includes('4. Écritures proposées') && rep.includes('5. Définitives 2025 recalculées'), 'rapport : revenus, contrôle, situation, écritures, détail', rep.slice(0, 160));

  // 5. Téléphone et verrouillage
  await pg.setViewportSize({ width: 390, height: 844 }); await pg.waitForTimeout(300);
  const over = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over <= 1, 'téléphone : pas de débordement horizontal', String(over));
  await pg.screenshot({ path: O + 'tns-mobile.png', fullPage: true });
  await pg.setViewportSize({ width: 1366, height: 950 }); await pg.waitForTimeout(200);
  await pg.screenshot({ path: O + 'tns.png', fullPage: true });
  await pg.evaluate(() => forgetSession());
  expect(await pg.evaluate(() => ui.tns === null), 'verrouillage : saisie effacée de la mémoire');

  console.log(ko ? `${ko} écart(s)` : 'TNS-COTISATION conforme');
  console.log('erreurs', errors);
  await br.close();
  if (ko) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(1); });
