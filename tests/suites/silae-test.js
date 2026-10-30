// Cycle H et CYCLE SOCIAL : cadrage de la paie ouvert depuis l'analyse (FEC repris), éditions Silae en PDF (journal de paie,
// détail des cotisations, solde de repos), sur le FEC fictif 456456456 (tests/gen/gensilae_fec.py) et les éditions fictives
// de tests/gen/gensilae_pdf.py ; synthèse enregistrée dans le dossier et reprise dans les contrôles et les pièces du cycle H.
const { chromium } = require('playwright');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
const { fecTab } = require('./lib');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' })).newPage();
  const errors = [];
  const ko = (cond, msg) => console.log(`${cond ? 'OK' : 'KO'} ${msg}`);
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  const BASE = process.env.BASE || 'http://localhost:8765/';
  await p.goto(BASE);
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!');
  await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.click('main [data-action=new-client]');
  await p.fill('#modal input[name=nom]', 'SARL PAIE FICTIVE'); await p.selectOption('#modal select[name=forme]', 'SARL');
  await p.fill('#modal input[name=siren]', '456456456'); await p.click('#modal button[type=submit]'); await p.waitForSelector('.grid-detail');
  await p.goto(BASE + '#/fec'); await p.waitForSelector('.fec-drop');
  let [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('.fec-drop')]);
  await ch.setFiles(D + 'silae/456456456FEC20251231.txt'); await p.waitForSelector('.fec-meta');
  await fecTab(p, 'social', 0); await p.waitForTimeout(120);
  const checks = () => p.$$eval('.fec-checks .fec-check', (l) => l.map((x) => x.querySelector('.lvl').textContent + ' ' + x.querySelector('strong').textContent));
  ko((await checks()).some((x) => /Information Cadrage de la paie à faire/.test(x)), 'cycle H : cadrage de la paie à faire');

  // 1. Depuis le cycle H : onglet Paie de l'Espace FEC, le FEC de l'analyse est repris (pas de case FEC), le dossier rattaché
  await p.click('[data-action=social-from-fec]'); await p.waitForSelector('.soc-zones'); await p.waitForTimeout(200);
  const z3 = await p.evaluate(() => ui.social.files.map((x) => x.info).join(' '));
  ko(/FEC de l'analyse : \d+ lignes retenues/.test(z3) && (await p.textContent('.fec-groups button.on')) === 'Paie' && !(await p.$('.soc-drop[data-zone=gl]'))
    && await p.evaluate(() => ui.social.link.clientId === clientBySiren('456456456').id && ui.social.link.closing === '2025-12-31'), `onglet Paie, FEC de l'analyse repris, dossier rattaché : ${z3.trim()}`);
  const drop = async (zone, file) => {
    [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click(`.soc-drop[data-zone=${zone}]`)]);
    await ch.setFiles(D + 'silae/' + file); await p.waitForTimeout(300);
  };
  await drop('cot', 'silae-journal-de-paie.pdf');
  ko((await p.textContent('.soc-zone:nth-child(2)')).includes('déposez-le dans la bonne case'), 'journal de paie déposé dans la case des cotisations : refusé');

  // 2. Les trois éditions en PDF
  await drop('recap', 'silae-journal-de-paie.pdf');
  await drop('cot', 'silae-detail-cotisations.pdf');
  await drop('repos', 'silae-solde-de-repos.pdf');
  const files = await p.$$eval('.soc-files li em', (l) => l.map((x) => x.textContent));
  console.log('fichiers :\n  ' + files.join('\n  '));
  ko(files.some((t) => /salaire brut 30 500,00 €, net à payer 25 932,50 €/.test(t.replace(/ | /g, ' '))) && files.some((t) => /6 organisme\(s\)/.test(t)), 'PDF lus : brut et net du journal, 6 organismes');
  const cards = await p.evaluate(() => ui.social.last.cards.map((c) => [c.key, c.s, c.c, c.st]));
  console.log('cadrage :\n  ' + cards.map((c) => c.join(' | ')).join('\n  '));
  const card = (k) => cards.find((c) => c[0] === k) || [];
  const is = (k, s, c, st) => { const x = card(k); return x[1] === s && x[2] === c && x[3] === st; };
  ko(is('641', 30500, 30500, 'ok'), '641 : brut du journal de paie, congés payés (641200) exclus');
  [['645100', 8540], ['645300', 1830], ['645400', 380], ['645600', 1220], ['645800', 330]].forEach(([k, v]) => ko(is(k, v, v, 'ok'), `${k} rapproché de la part patronale de son organisme (${v})`));
  ko(is('645500', 300, 320, 'anom'), 'mutuelle : écart de 20 € signalé');
  ko(!card('645200').length, 'charges sociales sur congés payés (645200) hors rapprochement des organismes');
  ko(is('63-6312', 120, 0, 'just') && is('63-6333', 210, 0, 'just'), 'taxe d’apprentissage et formation comptabilisées en 6458 : motif automatique');
  ko(is('421000', 25932.5, 25932.5, 'ok') && is('431000', 11437.5, 11437.5, 'ok') && is('437300', 600, 620, 'anom'), '421 au net à payer, 43x aux cotisations des organismes');
  ko(is('428200', 2150, 2150, 'ok') && is('438200', 903, 903, 'ok'), 'solde de repos : 4282 et 4382');
  await p.screenshot({ path: O + 'silae-social.png', fullPage: true });

  // 3. Ligne du solde de repos choisie à la main : retenue pour le cabinet, retrouvée au dépôt suivant
  const pickOpt = (sel, re) => p.$eval(sel, (s, r) => Array.from(s.options).find((o) => new RegExp(r).test(o.textContent)).value, re.source);
  await p.selectOption('select[data-social=line][data-id=cp]', await pickOpt('select[data-social=line][data-id=cp]', /DUPONT Jean · Indemnité/));
  await p.waitForTimeout(150);
  const memo = await p.evaluate(() => JSON.stringify(data.settings.silaeMap.cp));
  ko(card('428200').length && await p.evaluate(() => socCardOf('428200').s === 980 && socCardOf('428200').st === 'anom') && memo === '{"lab":"dupont jean","group":"","col":"indemnite"}', `ligne choisie à la main retenue ${memo}`);
  await drop('repos', 'silae-solde-de-repos.pdf');
  ko(await p.evaluate(() => socCardOf('428200').s === 980), 'ligne retenue retrouvée au dépôt suivant');
  await p.selectOption('select[data-social=line][data-id=cp]', await pickOpt('select[data-social=line][data-id=cp]', /^Total · Indemnité/));
  await p.waitForTimeout(150);
  ko(await p.evaluate(() => socCardOf('428200').st === 'ok'), 'ligne « Total · Indemnité » rétablie');

  // 4. Organisme détaché d'un compte : enregistré par son nom dans le dossier, repris à la réouverture
  await p.click('.soc-card[data-key="645500"] .soc-det summary');
  await p.click('.soc-card[data-key="645500"] [data-social=org]:checked'); await p.waitForTimeout(150);
  const saved = await p.evaluate(() => JSON.stringify(clientBySiren('456456456').revision['2025-12-31'].social.MAP));
  ko(saved === '{"645500":[]}', `rattachement enregistré dans le dossier ${saved}`);
  await fecTab(p, 'social', 300);
  await p.evaluate(() => { ui.social = null; });
  await p.click('[data-action=social-from-fec]'); await p.waitForSelector('.soc-zones'); await p.waitForTimeout(200);
  await drop('recap', 'silae-journal-de-paie.pdf');
  await drop('cot', 'silae-detail-cotisations.pdf');
  ko(await p.evaluate(() => socCardOf('645500').sub === 'Aucun organisme rattaché'), 'réouverture : rattachement repris');
  await p.click('.soc-card[data-key="645500"] .soc-det summary');
  await p.click('.soc-card[data-key="645500"] [data-social=org][data-org=o3]'); await p.waitForTimeout(150);
  ko(await p.evaluate(() => JSON.stringify(clientBySiren('456456456').revision['2025-12-31'].social.MAP) === '{"645500":["HARMONIE MUTUELLE"]}' && socCardOf('645500').s === 300), 'organisme rattaché à la main par son nom');
  await drop('repos', 'silae-solde-de-repos.pdf');

  // 5. Retour au cycle H : synthèse, contrôles, pièces, colonne « Selon pièce » des congés payés
  await fecTab(p, 'social', 300);
  const c2 = await checks();
  console.log('contrôles :\n  ' + c2.join('\n  '));
  ko(c2.some((x) => /À vérifier 6455 Mutuelle Harmonie : écart avec la paie Silae/.test(x)) && c2.some((x) => /À vérifier 4373 Harmonie mutuelle : écart avec la paie Silae/.test(x))
    && c2.some((x) => /Conforme Paie Silae : 15 comptes sans écart/.test(x)) && c2.some((x) => /Conforme 6312 Taxe d’apprentissage : écart justifié avec la paie Silae/.test(x)) && !c2.some((x) => /à faire/.test(x)), 'contrôles du cycle H repris du cadrage');
  const sum = (await p.textContent('.card:has([data-action=social-from-fec])')).replace(/\s+/g, ' ');
  ko(/éditions lues : journal de paie, détail des cotisations, solde de repos\) : 2 compte\(s\) à justifier sur 19/.test(sum) && /Ouvrir l’onglet Paie/.test(sum), 'cadre « Cadrage de la paie » du cycle H');
  const docs = await p.$$eval('.cyc-docs li', (l) => l.map((x) => x.querySelector('select').selectedOptions[0].textContent));
  ko(docs.length === 3 && docs.every((t) => t === 'Édition lue'), `pièces du cycle : ${docs.join(', ')}`);
  ko(await p.evaluate(() => JSON.stringify(wpSoldeStore()) === '{"428200":2150,"438200":903}'), 'congés payés : montant du solde de repos dans la colonne « Selon pièce »');
  await p.screenshot({ path: O + 'silae-h.png', fullPage: true });

  // 6. Solde de repos en Excel (même lecture que le PDF)
  await p.click('[data-action=social-from-fec]'); await p.waitForSelector('.soc-zones');
  await p.evaluate(async () => {
    const H = (v) => ({ v, s: 1 });
    const blob = XlsxWriter.build({ sheetName: 'Solde', rows: [[{ v: 'SOLDE DE REPOS' }], [H('Salarié'), H('Acquis'), H('Pris'), H('Solde (jours)'), H('Indemnité'), H('Charges')],
      [{ v: 'DUPONT Jean' }, { v: 25 }, { v: 18 }, { v: 7 }, { v: 980 }, { v: 411.6 }], [{ v: 'Total' }, { v: 62.5 }, { v: 48 }, { v: 14.5 }, { v: 2150 }, { v: 903 }]] });
    await socLoad([new File([blob], 'solde-repos.xlsx')], 'repos');
  });
  await p.waitForTimeout(200);
  ko(await p.evaluate(() => socCardOf('428200').s === 2150 && socCardOf('438200').s === 903), 'solde de repos Excel : indemnité et charges lues');

  // 7. Téléphone
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  ko(await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 1, 'téléphone : pas de débordement horizontal');
  await p.setViewportSize({ width: 1366, height: 950 });

  // 8. Ancien rapprochement (montants relevés avant la fusion) : repris dans les contrôles tant que le cadrage n'est pas refait
  await fecTab(p, 'social', 200);
  await p.evaluate(() => { const ws = wpStore(); delete ws.social; ws.silae = { brut: { v: 30000, lab: 'Total', group: '', col: 'Salaire brut', file: 'ancien.pdf' } }; ui.social = null; refresh(); });
  await p.waitForTimeout(200);
  const c3 = await checks();
  ko(c3.some((x) => /À vérifier Rémunération du personnel : écart avec le journal de paie Silae/.test(x)) && /ancienne version/.test(await p.textContent('.card:has([data-action=social-from-fec])')), 'ancien rapprochement repris dans les contrôles');
  console.log('erreurs', errors);
  await b.close();
})();
