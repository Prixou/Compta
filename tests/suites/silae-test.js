// Cycle H : rapprochement avec les éditions de paie Silae (journal de paie, détail des cotisations, solde de repos), sur le
// FEC fictif 456456456 (tests/gen/gensilae_fec.py) et les éditions fictives de tests/gen/gensilae_pdf.py.
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

  // Un bouton par édition : le titre du PDF n'est pas lu (« DÉTAILS DES COTISATIONS » au pluriel)
  const drop = async (doc, file) => {
    [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click(`button[data-action=silae-pick][data-doc=${doc}]`)]);
    await ch.setFiles(D + 'silae/' + file); await p.waitForTimeout(250);
  };
  await drop('journal', 'silae-journal-de-paie.pdf');
  await drop('cotis', 'silae-detail-cotisations.pdf');
  await drop('repos', 'silae-solde-de-repos.pdf');
  const table = () => p.$$eval('.silae-doc', (docs) => docs.map((d) => d.querySelector('h3').firstChild.textContent.trim() + ' :\n' + Array.from(d.querySelectorAll('tbody tr')).map((x) => '  ' + Array.from(x.cells).map((c) => (c.querySelector('select') ? c.querySelector('select').selectedOptions[0].textContent : c.textContent).replace(/\s+/g, ' ').trim()).join(' | ')).join('\n')).join('\n'));
  const t1 = await table();
  console.log(t1);
  console.log('messages :', await p.$$eval('.banner span', (x) => x.map((y) => y.textContent).filter((t) => / lu comme /.test(t)).join(' || ')));
  ko(/641100 \| Rémunération du personnel \| 30 500,00 \| .*Salaire brut : 30 500,00 \| 30 500,00 \| 0/.test(t1) && !/641200/.test(t1), 'journal de paie : rémunération du personnel (641100, hors congés payés)');
  const orgs = [['645100', 'URSSAF', '8 540,00', '0'], ['645300', 'KLESIA RETRAITE', '1 830,00', '0'], ['645400', 'AG2R PRÉVOYANCE', '380,00', '0'],
    ['645500', 'HARMONIE MUTUELLE', '300,00', '\\+20,00'], ['645600', 'FRANCE TRAVAIL', '1 220,00', '0'], ['645800', 'OPCO / FORMATION', '330,00', '0']];
  orgs.forEach(([c, org, v, e]) => ko(new RegExp(`${c} \\| [^|]+ \\| [^|]+ \\| ${org.replace('/', '\\/')} · Total ${org.replace('/', '\\/')} · Part patronale : ${v} \\| ${v} \\| ${e}$`, 'm').test(t1.replace(/ | /g, ' ')), `détail des cotisations : ${c} rapproché de ${org} (écart ${e.replace('\\', '')})`));
  ko(!/645200/.test(t1), 'charges sociales sur congés payés (645200) hors rapprochement des organismes');
  ko(/428200 \| Congés payés à payer \| 2 150,00 \| .* \| 2 150,00 \| 0/.test(t1.replace(/ | /g, ' ')) && /438200 \| Charges sociales sur congés payés \| 903,00 \| .* \| 903,00 \| 0/.test(t1), 'solde de repos : 4282 et 4382');
  const checks = await p.$$eval('.fec-checks .fec-check', (l) => l.map((x) => x.querySelector('.lvl').textContent + ' ' + x.querySelector('strong').textContent));
  console.log('contrôles :\n  ' + checks.join('\n  '));
  ko(checks.some((x) => /À vérifier 645500 Mutuelle Harmonie : écart avec le détail des cotisations Silae/.test(x)) && checks.some((x) => /Conforme 645100 Cotisations URSSAF : conforme au détail des cotisations Silae/.test(x)) && checks.some((x) => /Conforme Rémunération du personnel : conforme au journal de paie Silae/.test(x)), 'contrôles : un par compte, écart de la mutuelle signalé');
  await p.screenshot({ path: O + 'silae-h.png', fullPage: true });

  // Ligne choisie à la main pour un compte 645 : retenue pour le dossier, retrouvée à la lecture suivante
  await p.selectOption('select[data-silae="org:645500"]', { label: await p.$eval('select[data-silae="org:645500"]', (s) => Array.from(s.options).find((o) => /Mutuelle obligatoire · Part patronale/.test(o.textContent)).textContent) });
  await p.waitForTimeout(150);
  const memo = await p.evaluate(() => JSON.stringify(clientById(ui.fec.clientId).silaeLines));
  ko(/"645500":\{"lab":"mutuelle obligatoire","group":"harmonie mutuelle","col":"part patronale"\}/.test(memo), `choix retenu pour le dossier ${memo}`);
  await drop('cotis', 'silae-detail-cotisations.pdf');
  const again = await p.$eval('select[data-silae="org:645500"]', (s) => s.selectedOptions[0].textContent);
  ko(/Mutuelle obligatoire · Part patronale/.test(again), `ligne retenue retrouvée : ${again}`);
  // Pièces du cycle : éditions lues
  const docs = await p.$$eval('.cyc-docs li', (l) => l.map((x) => x.querySelector('select').selectedOptions[0].textContent));
  ko(docs.length === 3 && docs.every((t) => t === 'Édition lue'), `pièces du cycle : ${docs.join(', ')}`);
  console.log('erreurs', errors);
  await b.close();
})();
