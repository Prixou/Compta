// Justificatifs des charges : archive fictive « FEC + pièces jointes » au format de l'export Pennylane (tests/gen/genjustifs.py) :
// FEC secondaire avec NomActuelDeLaPieceJointe retenu, revue par compte, comptes sans pièce attendue, seuil, copie,
// contrôle du cycle D et pièce demandée ; FEC seul : marche à suivre.
const { chromium } = require('playwright');
const path = require('path');
const { fecTab } = require('./lib');
const D = path.join(__dirname, '../fixtures/justifs/');
const O = path.join(__dirname, '../out/');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8765' });
  const p = await ctx.newPage();
  const errors = [];
  const ko = (cond, msg) => console.log(`${cond ? 'OK' : 'KO'} ${msg}`);
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  const BASE = process.env.BASE || 'http://localhost:8765/';
  await p.goto(BASE);
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!');
  await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.click('main [data-action=new-client]');
  await p.fill('#modal input[name=nom]', 'CABINET LIBERAL FICTIF'); await p.selectOption('#modal select[name=forme]', 'EI');
  await p.fill('#modal input[name=siren]', '919191919'); await p.click('#modal button[type=submit]'); await p.waitForSelector('.grid-detail');

  const load = async (file) => {
    await p.goto(BASE + '#/fec'); await p.waitForSelector('.fec-drop, .fec-meta');
    const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-action=fec-pick]')]);
    await ch.setFiles(D + file); await p.waitForTimeout(300); await p.waitForSelector('.fec-meta', { timeout: 20000 });
  };
  const state = () => p.evaluate(() => {
    const v = chgReview(ui.fec.result);
    return { n: v.n, ok: v.ok, list: v.list.length, total: v.total, absent: v.cd.absent.n, skip: v.cd.skip, att: v.cd.attCol, src: ui.fec.result.meta.archiveSrc,
      file: ui.fec.result.meta.fileName, siren: ui.fec.result.meta.siren, miss: v.cd.missingTotal,
      rows: v.rows.map((x) => `${x.compte} ${x.n} ${x.ok} ${x.exp ? x.miss : '-'}`) };
  });

  // 1. Archive Pennylane : FEC secondaire avec les pièces jointes, nom et SIREN du FEC officiel
  await load('919191919-pieces-jointes.zip');
  await fecTab(p, 'justifs');
  let s = await state();
  console.log(JSON.stringify(s));
  ko(s.att === 'NomActuelDeLaPieceJointe' && s.src === 'ecritures-avec-pieces-jointes.txt' && s.file === '919191919FEC20261231.txt' && s.siren === '919191919',
    'archive : FEC secondaire analysé (colonne NomActuelDeLaPieceJointe), nom et SIREN du FEC officiel');
  ko(s.n === 34 && s.ok === 27 && s.list === 7 && Math.abs(s.total - 3336.8) < 0.001, `7 écritures sans pièce pour 3 336,80 € sur 34 (${s.list}, ${s.total})`);
  ko(JSON.stringify(s.rows) === JSON.stringify(['606400 3 1 2', '613200 12 11 1', '616000 1 0 1', '622600 2 1 1', '625100 2 2 0', '625700 2 1 1', '626200 12 11 1', '627000 12 0 -', '661100 12 0 -']),
    'revue par compte : frais bancaires et intérêts sans pièce attendue');
  ko(s.skip.paie === 12 && s.skip.regul === 1 && s.miss === 31 && s.absent === 1, 'paie et charges à payer écartées, pièce citée absente de l’archive signalée');
  const main = (await p.textContent('main')).replace(/\s+/g, ' ');
  ko(/Sans pièce jointe/.test(main) && /3 336,80|3 337 €/.test(main.replace(/[\u00a0\u202f]/g, ' ')) && /1 pièce\(s\) citée\(s\) par le FEC introuvable/.test(main), 'onglet : chiffres clés et pièce introuvable');
  ko(/Justificatifs des charges \(7\)/.test(await p.textContent('.fec-tabs')), 'compteur du sous-onglet');
  await p.screenshot({ path: O + 'justifs.png', fullPage: true });

  // 2. Compte coché ou décoché, seuil : choix conservés dans le dossier
  await p.click('input[data-chg-acc="627000"]'); await p.waitForTimeout(150);
  s = await state();
  ko(s.list === 19 && Math.abs(s.total - 3516.8) < 0.001, `627 coché : 19 écritures (${s.list})`);
  await p.click('input[data-chg-acc="627000"]'); await p.waitForTimeout(150);
  await p.fill('input[data-chg-seuil]', '100'); await p.dispatchEvent('input[data-chg-seuil]', 'change'); await p.waitForTimeout(150);
  s = await state();
  ko(s.list === 4, `seuil de 100 € : 4 écritures (${s.list})`);
  ko(await p.evaluate(() => { const c = clientBySiren('919191919'); return c.chgSeuil === 100 && c.chgAcc['627000'] === false; }), 'choix conservés dans le dossier');
  await p.fill('input[data-chg-seuil]', '0'); await p.dispatchEvent('input[data-chg-seuil]', 'change'); await p.waitForTimeout(150);

  // 3. Copie pour un tableur
  await p.click('[data-action=chg-copy]'); await p.waitForTimeout(150);
  const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ko(clip.split('\n').length === 8 && clip.includes('20/01/2026\tBQ\t') && clip.includes('PRLV ASSURANCE INVENTEE RCP\t\tBanque ou caisse\t616000\t840,00')
    && clip.includes('CABINET FICTIF CONSEIL FACTURE 2026-092\tCABINET FICTIF CONSEIL\tFournisseur\t622600\t1200,00'), 'écritures sans pièce copiées');

  // 4. Contrôle du cycle D, élément par élément ; « Pièce demandée » : ajoutée aux pièces à demander
  const chk = await p.evaluate(() => { const c = cycleChecks(ui.fec.result).charges.find((x) => x.label === 'Charges sans pièce jointe'); return c && { level: c.level, n: c.examples.length, first: c.examples[0] }; });
  ko(chk && chk.level === 'warn' && chk.n === 7 && /CABINET FICTIF CONSEIL FACTURE 2026-092 · 1 200,00 € · 622600/.test(chk.first.replace(/[\u00a0\u202f]/g, ' ')), `contrôle du cycle D, la plus forte d’abord : ${chk && chk.first}`);
  const sel = 'main details[data-wpk] select[data-wp="el-st"]';
  if (!(await p.$(`${sel}`)) || !(await p.isVisible(sel))) await p.click('main details[data-wpk] summary');
  const assur = await p.$('main details[data-wpk] li.wp-el:has-text("PRLV ASSURANCE INVENTEE RCP") select[data-wp="el-st"]');
  await assur.selectOption('piece'); await p.waitForTimeout(200);
  await fecTab(p, 'pieces', 250);
  const pieces = (await p.textContent('main')).replace(/\s+/g, ' ').replace(/[\u00a0\u202f]/g, ' ');
  ko(/Justificatif de l'opération : 20\/01\/2026 · PRLV ASSURANCE INVENTEE RCP · 840,00 €/.test(pieces) && !/BQ \d+ · PRLV ASSURANCE/.test(pieces), 'pièce demandée : reprise dans les pièces à demander, sans compte ni référence d’écriture');
  await fecTab(p, 'synthese');
  ko(/Charges sans pièce jointe/.test(await p.textContent('main')), 'synthèse : point à traiter');

  // 5. FEC seul : marche à suivre pour l'export Pennylane avec pièces jointes
  await load('919191919FEC20261231.txt');
  await fecTab(p, 'justifs');
  ko(/Inclure les pièces jointes/.test(await p.textContent('main')) && !(await p.evaluate(() => ui.fec.result.cycles.chgDocs)), 'FEC seul : export avec pièces jointes expliqué');
  console.log('erreurs', errors);
  await b.close();
})();
