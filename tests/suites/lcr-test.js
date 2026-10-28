const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
// Écritures LCR pour ACD (page « Écritures LCR ») : listing fournisseurs et relevés inventés (tests/gen/genlcr.py :
// Crédit Agricole et CIC), rapprochement des tireurs, correspondances, listing et réglages retenus par dossier, fichier
// d'import ACD.
let ko = 0;
const expect = (cond, label, info) => { if (cond) console.log(`OK ${label}`); else { ko++; console.log(`KO ${label}${info ? ' : ' + info : ''}`); } };
(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8765' });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await pg.goto('http://localhost:8765/');
  await pg.fill('input[name=p1]', 'Cabinet-Test-2026!'); await pg.fill('input[name=p2]', 'Cabinet-Test-2026!'); await pg.check('input[name=ack]'); await pg.click('button[type=submit]'); await pg.waitForSelector('.layout');
  await pg.click('a[data-nav=lcr]'); await pg.waitForSelector('.lcr');
  const pick = async (sel, files) => { const [ch] = await Promise.all([pg.waitForEvent('filechooser'), pg.click(sel)]); await ch.setFiles(files); };
  const R = (n) => D + `lcr/releve-${n}.pdf`;
  const rowOf = (nom) => pg.$eval(`.lcr-acc tr:has(input[data-nom="${nom}"])`, (tr) => tr.textContent).catch(() => '');
  const download = async (sel) => {
    await pg.click(sel); await pg.waitForSelector('#ask');
    const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#ask button[type=submit]')]);
    await dl.saveAs(O + dl.suggestedFilename());
    return { name: dl.suggestedFilename(), buf: fs.readFileSync(O + dl.suggestedFilename()) };
  };

  // 1. Listing fournisseurs (retenu dans les données chiffrées)
  await pick('[data-action=lcr-plan]', D + 'lcr/listing-fournisseurs.csv');
  await pg.waitForSelector('.lcr-loaded');
  expect((await pg.evaluate(() => data.settings.lcrAcd.plan.rows.length)) === 9 && (await pg.textContent('.lcr-loaded')).includes('9 comptes'), 'listing fournisseurs lu et retenu');

  // 2. Relevés : trois relevés (dont un sur deux pages), un PDF qui n'est pas un relevé, un doublon
  await pick('[data-action=lcr-pdf]', [R(1001), R(1002), R(1003), D + 'lettrage/grand-livre.pdf']);
  await pg.waitForFunction(() => ui.lcr && !ui.lcr.progress && ui.lcr.rel.length === 3, null, { timeout: 15000 });
  await pick('[data-action=lcr-pdf]', R(1001));
  await pg.waitForFunction(() => ui.lcr.errors.length === 2, null, { timeout: 15000 });
  let s = await pg.evaluate(() => ({ rel: ui.lcr.rel.map((r) => [r.bank, r.releve, r.regl, r.au, r.contrat, r.effets.length, r.effets.filter((e) => e.avis === 'P').length, r.sum, r.controle]), err: ui.lcr.errors.map((e) => e.msg) }));
  expect(JSON.stringify(s.rel) === JSON.stringify([['CA', '1001', '31/05/2026', '25/05/2026', '99887766', 4, 3, 382990, true], ['CA', '1002', '15/06/2026', '10/06/2026', '99887766', 13, 13, 107550, true], ['CA', '1003', '30/06/2026', '20/06/2026', '99887766', 2, 2, 99900, false]]),
    'relevés lus : n°, dates, contrat, effets (deux pages, effet rejeté), contrôle du nombre et du total', JSON.stringify(s.rel));
  expect(/Format non reconnu/.test(s.err[0]) && /déjà chargé/.test(s.err[1]), 'PDF qui n\'est pas un relevé et doublon signalés', JSON.stringify(s.err));
  expect((await pg.textContent('.lcr-rel')).replace(/\s/g, ' ').includes('Écart : relevé 1 000,00'), 'écart entre le total annoncé et les effets signalé');
  expect((await pg.textContent('.lcr-dossier')).includes('Crédit Agricole · compte 99887766') && (await pg.textContent('.lcr-step .lcr-alert.warn')).includes('Vérifiez que ce listing est bien celui du dossier'),
    'banque et compte du dossier ; listing pas encore associé au dossier');

  // 3. Comptes : trouvés, à confirmer, sans compte
  expect((await pg.textContent('[data-action=lcr-view][data-v=todo]')).includes('(2)') && (await pg.textContent('[data-action=lcr-view][data-v=all]')).includes('(6)'), 'six tireurs, deux à traiter (rejeté exclu)');
  expect((await rowOf('EPSILON MEDICAL')).includes('Sans compte') && (await rowOf('OMEGA SERVICES')).includes('À confirmer') && (await rowOf('OMEGA SERVICES')).includes('Plusieurs comptes possibles : FOMEGA, FOMEGA2'),
    'tireur absent du listing sans compte, tireur proche de deux comptes à confirmer');
  await pg.click('[data-action=lcr-view][data-v=all]'); await pg.waitForTimeout(100);
  const auto = await pg.$$eval('.lcr-acc tbody tr', (trs) => trs.map((tr) => [tr.querySelector('input').dataset.nom, tr.querySelector('input').value, tr.querySelector('.badge').textContent]));
  expect(JSON.stringify(auto.filter((x) => x[2] === 'Trouvé').map((x) => x[1])) === JSON.stringify(['FBETA', 'FALPHA', 'FDELTA', 'FZETA']), 'tireurs trouvés malgré la forme juridique et les mots courants', JSON.stringify(auto));
  expect(await pg.$eval('[data-action=lcr-txt]', (b) => b.disabled), 'fichier bloqué tant qu\'un tireur n\'a pas de compte');

  // 4. Corrections retenues par contrat
  await pg.fill('input[data-nom="EPSILON MEDICAL"]', 'feps'); await pg.dispatchEvent('input[data-nom="EPSILON MEDICAL"]', 'change'); await pg.waitForTimeout(100);
  await pg.click('tr:has(input[data-nom="OMEGA SERVICES"]) [data-action=lcr-ok]'); await pg.waitForTimeout(100);
  s = await pg.evaluate(() => data.settings.lcrAcd.mem['99887766']);
  expect(s['EPSILON MEDICAL'].code === 'FEPS' && s['OMEGA SERVICES'].code === 'FOMEGA' && (await rowOf('EPSILON MEDICAL')).includes('À créer') && (await rowOf('OMEGA SERVICES')).includes('Mémorisé'),
    'code saisi (à créer dans ACD) et suggestion confirmée retenus pour le contrat', JSON.stringify(s));
  expect((await pg.textContent('.lcr')).includes('À créer dans ACD avant l\'import') && !(await pg.$eval('[data-action=lcr-txt]', (b) => b.disabled)), 'fichier débloqué, compte à créer signalé');

  // 5. Fichier d'import ACD
  let f = await download('[data-action=lcr-txt]');
  let lines = f.buf.toString('latin1').split('\r\n');
  expect(f.name === 'Import_ACD_OD_LCR_99887766_2026-05.txt' && lines.length === 22 && lines[21] === ''
    && lines[0] === 'OD;31;05;2026;1001;FALPHA;LCR 00000101 FOURNISSEUR ALPHA;1250,00;0,00'
    && lines[2] === 'OD;31;05;2026;1001;FDELTA;LCR 00000104 LABORATOIRES DELT;2000,00;0,00'
    && lines[3] === 'OD;31;05;2026;1001;58003000;RELEVE LCR 1001 DU 31/05/26;0,00;3730,00'
    && lines.includes('OD;15;06;2026;1002;FEPS;LCR 00000202 EPSILON MEDICAL;150,00;0,00')
    && lines[20] === 'OD;30;06;2026;1003;58003000;RELEVE LCR 1003 DU 30/06/26;0,00;999,00',
  'fichier ACD : une OD par relevé, effets payés au débit, total au crédit, libellés de 30 caractères, CRLF', JSON.stringify(lines.slice(0, 4)));
  expect((await pg.evaluate(() => data.settings.lcrAcd.plans['99887766'].rows.length)) === 9 && (await pg.textContent('.lcr-alert.good')).includes('Ce listing est associé au compte 99887766'), 'listing associé au dossier au premier export');
  // Réglages : journal, date d'édition du relevé, retenus
  await pg.click('.lcr-box summary');
  await pg.fill('input[data-lcr=journal]', 'lc'); await pg.dispatchEvent('input[data-lcr=journal]', 'change'); await pg.waitForTimeout(100);
  await pg.selectOption('select[data-lcr=dateMode]', 'releve'); await pg.waitForTimeout(100);
  expect((await pg.textContent('pre.lcr-file')).startsWith('LC;25;05;2026;1001;FALPHA') && (await pg.evaluate(() => data.settings.lcrAcd.optsBy['99887766'].journal)) === 'LC' && await pg.$eval('.lcr-box', (d) => d.open),
    'réglages : code journal et date d\'édition, retenus pour le dossier');
  await pg.selectOption('select[data-lcr=dateMode]', 'reglement'); await pg.waitForTimeout(100);
  f = await download('[data-action=lcr-xlsx]');
  expect(f.buf.slice(0, 2).toString() === 'PK' && f.buf.includes(Buffer.from('Ecritures OD')) && f.name === 'Ecritures_OD_LCR_99887766_2026-05.xlsx', 'tableau de contrôle Excel', f.name);
  await pg.click('[data-action=lcr-copy]'); await pg.waitForTimeout(150);
  const clip = await pg.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  expect(clip.split('\r\n').filter(Boolean).length === 21 && clip.startsWith('LC;31;05;2026'), 'contenu copié');
  await pg.screenshot({ path: O + 'lcr.png', fullPage: true });

  // 6. Mois suivant : correspondances reprises ; « Oublier » revient à la suggestion
  await pg.click('[data-action=lcr-clear]'); await pg.waitForTimeout(100);
  await pick('[data-action=lcr-pdf]', [R(1002), R(1003)]);
  await pg.waitForFunction(() => ui.lcr.rel.length === 2, null, { timeout: 15000 });
  await pg.click('[data-action=lcr-view][data-v=all]'); await pg.waitForTimeout(100);
  expect((await rowOf('EPSILON MEDICAL')).includes('À créer') && (await rowOf('OMEGA SERVICES')).includes('Mémorisé'), 'correspondances reprises au chargement suivant');
  await pg.click('tr:has(input[data-nom="OMEGA SERVICES"]) [data-action=lcr-forget]'); await pg.waitForTimeout(100);
  expect((await rowOf('OMEGA SERVICES')).includes('À confirmer') && !(await pg.evaluate(() => data.settings.lcrAcd.mem['99887766']['OMEGA SERVICES'])), 'correspondance oubliée');
  await pg.click('.lcr-rel tr:has-text("1003") [data-action=lcr-del]'); await pg.waitForTimeout(100);
  expect((await pg.evaluate(() => ui.lcr.rel.map((r) => r.releve).join())) === '1002', 'relevé retiré');

  // 7. CIC : relevé de lettres de change d'un autre dossier (compte), réglages propres
  await pg.click('[data-action=lcr-clear]'); await pg.waitForTimeout(100);
  await pick('[data-action=lcr-pdf]', R('cic'));
  await pg.waitForFunction(() => ui.lcr.rel.length === 1, null, { timeout: 15000 });
  s = await pg.evaluate(() => { const r = ui.lcr.rel[0]; return [r.bank, r.releve, r.piece, r.regl, r.au, r.contrat, r.nb, r.total, r.controle, r.effets.map((e) => [e.nom, e.ref, e.ech, e.c, e.avis])]; });
  expect(JSON.stringify(s) === JSON.stringify(['CIC', '004512', 4512, '10/07/2026', '05/07/2026', '12345-67890-00012345678', 4, 234560, true,
    [['FOURNISSEUR ALPHA SAS', 'F-2001', '10/07/2026', 120000, 'P'], ['BETA DISTRIBUTION', '', 'A VUE', 48000, 'P'], ['GAMMA SANTE', 'F-88', '10/07/2026', 9990, 'R'], ['LABORATOIRES DELTA', 'F-600', '10/07/2026', 56570, 'P']]]),
  'CIC : n° de relevé, dates, compte, total, effet à vue, effet refusé, ligne coupée recollée', JSON.stringify(s));
  expect((await pg.textContent('.lcr-dossier')).includes('CIC · compte 12345-67890-00012345678') && (await pg.textContent('.lcr-step .lcr-alert.warn')).includes('Vérifiez que ce listing'), 'CIC : autre dossier, listing à vérifier');
  await pg.click('.lcr-box summary');
  await pg.fill('input[data-lcr=journal]', 'ac'); await pg.dispatchEvent('input[data-lcr=journal]', 'change'); await pg.waitForTimeout(100);
  f = await download('[data-action=lcr-txt]');
  lines = f.buf.toString('latin1').split('\r\n');
  expect(f.name === 'Import_ACD_OD_LCR_12345-67890-00012345678_2026-07.txt' && lines.length === 5 && lines[0] === 'AC;10;07;2026;4512;FALPHA;LCR 0004512001 FOURNISSEUR ALP;1200,00;0,00'
    && lines[1] === 'AC;10;07;2026;4512;FBETA;LCR 0004512002 BETA DISTRIBUTI;480,00;0,00' && lines[3] === 'AC;10;07;2026;4512;58003000;RELEVE LCR 4512 DU 10/07/26;0,00;2245,70',
  'CIC : fichier ACD (effet refusé non repris)', JSON.stringify(lines));
  // Retour au premier dossier, après un autre listing chargé sans relevé : listing et réglages du dossier repris
  await pg.click('[data-action=lcr-clear]'); await pg.waitForTimeout(100);
  await pick('[data-action=lcr-plan]', D + 'lcr/listing-autre.csv'); await pg.waitForTimeout(300);
  expect((await pg.textContent('.lcr-loaded')).includes('listing-autre.csv'), 'autre listing chargé sans relevé');
  await pick('[data-action=lcr-pdf]', R(1001));
  await pg.waitForFunction(() => ui.lcr.rel.length === 1, null, { timeout: 15000 });
  expect((await pg.textContent('.lcr-loaded')).includes('listing-fournisseurs.csv') && (await pg.textContent('.lcr-alert.good')).includes('Listing de ce dossier repris automatiquement')
    && (await pg.textContent('pre.lcr-file')).startsWith('LC;31;05;2026;1001;FALPHA'), 'listing et réglages du dossier repris automatiquement');
  await pick('[data-action=lcr-pdf]', R('cic'));
  await pg.waitForFunction(() => ui.lcr.rel.length === 2, null, { timeout: 15000 });
  expect((await pg.textContent('.lcr')).includes('Ces relevés viennent de plusieurs comptes'), 'relevés de deux dossiers signalés');

  // 8. Téléphone et verrouillage
  await pg.setViewportSize({ width: 390, height: 844 }); await pg.waitForTimeout(300);
  const over = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over <= 1, 'téléphone : pas de débordement horizontal', String(over));
  await pg.screenshot({ path: O + 'lcr-mobile.png', fullPage: true });
  await pg.evaluate(() => forgetSession());
  expect(await pg.evaluate(() => ui.lcr === null), 'verrouillage : relevés effacés de la mémoire');

  console.log(ko ? `${ko} écart(s)` : 'écritures LCR conformes');
  console.log('erreurs', errors);
  await br.close();
  if (ko) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(1); });
