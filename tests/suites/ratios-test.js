// Ratios sectoriels : recherche NAF, comparaison au secteur, saisie, reprise de l'analyse FEC, code NAF du dossier.
const { chromium } = require('playwright');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
const BASE = process.env.BASE || 'http://localhost:8765/';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  const errors = [];
  const ko = (cond, msg) => console.log(`${cond ? 'OK' : 'KO'} ${msg}`);
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await p.goto(BASE);
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!');
  await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  // Dossier avec son code NAF (saisi sans point : enregistré au format 69.20Z)
  await p.click('main [data-action=new-client]');
  await p.fill('#modal input[name=nom]', 'SARL DOSSIER'); await p.fill('#modal input[name=siren]', '123456789');
  await p.fill('#modal input[name=naf]', '6920z'); await p.click('#modal button[type=submit]'); await p.waitForSelector('.grid-detail');
  ko((await p.textContent('.grid-detail')).includes('69.20Z'), 'code NAF affiché sur la fiche au format 69.20Z');

  // Page sans dossier : recherche par libellé puis par code
  await p.click('a[data-nav=ratios]'); await p.waitForSelector('.rat-search');
  await p.fill('input[data-ratios=q]', 'boulangerie');
  const sugg = await p.$$eval('.rat-sugg button', (l) => l.map((x) => x.textContent));
  console.log('suggestions « boulangerie » :', sugg.slice(0, 4).join(' | '));
  ko(sugg.some((x) => x.includes('10.71C')), 'recherche par libellé');
  ko(await p.evaluate(() => document.activeElement.dataset.ratios === 'q'), 'la recherche garde le focus');
  await p.fill('input[data-ratios=q]', '47.73'); await p.press('input[data-ratios=q]', 'Enter'); await p.waitForSelector('.rat-title');
  ko((await p.textContent('.rat-title')).includes('pharmaceutiques'), 'Entrée ouvre la sous-classe 47.73Z');
  console.log('fil :', (await p.textContent('.rat-crumbs')).replace(/\s+/g, ' ').trim());
  await p.click('.rat-crumbs button:nth-of-type(2)'); await p.waitForTimeout(100);
  ko((await p.textContent('.rat-title')).includes('Commerce de détail'), 'le fil remonte à la division 47');
  ko((await p.$$('.rat-chips .rat-chip')).length > 5, 'groupes de la division proposés');

  // Dossier : son code NAF ouvre son secteur, la saisie calcule les ratios
  await p.goto(BASE + '#/dossiers'); await p.waitForSelector('main');
  await p.click('text=SARL DOSSIER'); await p.waitForSelector('.grid-detail');
  await p.click('main a[href^="#/ratios/"]'); await p.waitForSelector('.rat-title');
  ko((await p.textContent('.rat-title')).includes('Activités comptables'), 'le bouton de la fiche ouvre le secteur du dossier (69.20Z)');
  const row = (label) => p.$$eval('.rat-table tbody tr', (l, lb) => { const r = l.find((x) => x.cells[0].textContent.startsWith(lb)); return r ? Array.from(r.cells).map((c) => c.textContent.replace(/\s+/g, ' ').trim()) : null; }, label);
  for (const [k, v] of [['va', '820'], ['ebe', '170'], ['ca', '1 200'], ['etp', '11']]) await p.fill(`[data-ratios-f=${k}]`, v);
  const marge = await row('Taux de marge');
  console.log('taux de marge :', marge.join(' | '));
  ko(marge[1] === '17,3 %' && marge[4] === '20,7 %' && marge[5] === '+3,4 pt' && marge[6] === 'Au-dessus', 'taux de marge du dossier, écart et position (EBE 170 / VA 820)');
  const prod = await row('Productivité');
  ko(prod[4] === '74,5 k€' && prod[6] === 'En dessous', 'productivité apparente du travail (VA / ETP)');
  ko(await p.evaluate(() => document.activeElement.dataset.ratiosF === 'etp'), 'la saisie garde le focus');
  await p.selectOption('select[data-ratios=ref]', 'MIC'); await p.waitForTimeout(100);
  ko((await row('Taux de marge'))[1] === '45,0 %', 'comparaison aux microentreprises de la division 69');
  await p.selectOption('select[data-ratios=ref]', 'g');

  // Saisie conservée dans le dossier
  await p.goto(BASE + '#/tableau'); await p.waitForSelector('main');
  await p.goto(BASE + '#/ratios'); await p.waitForSelector('.rat-title');
  ko(await p.inputValue('[data-ratios-f=ebe]') === '170', 'saisie conservée');

  // Reprise de l'analyse FEC
  await p.goto(BASE + '#/fec'); await p.waitForSelector('.fec-drop');
  const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('.fec-drop')]);
  await ch.setFiles(D + '123456789FEC20251231.txt'); await p.waitForSelector('.fec-meta');
  const kpi = await p.evaluate(() => ui.fec.result.kpi);
  await p.goto(BASE + '#/ratios'); await p.waitForSelector('[data-action=ratios-fec]');
  await p.click('[data-action=ratios-fec]'); await p.waitForTimeout(150);
  const vals = await p.evaluate(() => ui.ratios.vals);
  console.log('repris du FEC (k€) :', JSON.stringify(vals));
  ko(vals.ca === Math.round(kpi.ca / 100) / 10 && vals.ebe === Math.round(kpi.ebe / 100) / 10 && vals.rn === Math.round(kpi.resultat / 100) / 10, 'CA, EBE et résultat repris du FEC en k€');
  ko(vals.etp === 11 && vals.tva === 20, 'effectif et taux de TVA saisis conservés');
  ko(await p.evaluate(() => ui.ratios.clientId === ui.fec.clientId && !!ui.fec.clientId), 'dossier rattaché repris de l\'analyse');
  ko((await p.textContent('.rat-client')).includes('Analyse FEC'), 'origine des chiffres affichée');
  const marge2 = await row('Taux de marge');
  console.log('taux de marge (FEC) :', marge2.join(' | '));
  ko(marge2[4] === `${(Math.round((vals.ebe / vals.va) * 1000) / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1 })} %`, 'taux de marge calculé sur le SIG du FEC');
  ko((await row('Rentabilité économique'))[4] === '–', 'pas de rentabilité économique sur un capital d\'exploitation négatif');

  // Autre secteur : proposer de l'enregistrer dans le dossier
  await p.fill('input[data-ratios=q]', '4334Z'); await p.press('input[data-ratios=q]', 'Enter'); await p.waitForSelector('[data-action=ratios-naf]');
  await p.click('[data-action=ratios-naf]'); await p.waitForTimeout(150);
  ko(await p.evaluate(() => data.clients[0].naf) === '43.34Z', 'code NAF enregistré dans le dossier');

  // Copie Excel
  await p.click('[data-action=ratios-copy]'); await p.waitForTimeout(150);
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  console.log('copie :', clip.split('\n').slice(0, 3).join(' / '));
  ko(clip.startsWith('Secteur 43.34Z') && clip.includes('Taux de marge\t%\t') && clip.includes('Indicateurs de résultat'), 'tableau copié pour Excel');

  await p.screenshot({ path: O + 'ratios.png', fullPage: true });
  await p.setViewportSize({ width: 375, height: 812 }); await p.waitForTimeout(200);
  ko(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'pas de débordement sur mobile');
  await p.screenshot({ path: O + 'ratios-mobile.png', fullPage: true });

  // Verrouillage : les chiffres ne restent pas en mémoire
  await p.evaluate(() => lock());
  ko(await p.evaluate(() => ui.ratios === null), 'chiffres effacés de la mémoire au verrouillage');
  console.log('erreurs', errors);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
