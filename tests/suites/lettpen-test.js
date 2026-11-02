const { chromium } = require('playwright');
// Lettrage : grand livre fournisseurs au format Pennylane (texte inventé) : comptes « 40… - Nom », à-nouveau
// « AN AAAA-MM-JJ – », journaux BQ1, référence de pièce retirée du libellé ; règlement remboursé ; société et période
// reprises dans les mails ; mail « Règlement ? » (société non pharmaceutique), global ou par fournisseur.
let ko = 0;
const expect = (cond, label, info) => { if (cond) console.log(`OK ${label}`); else { ko++; console.log(`KO ${label}${info ? ' : ' + info : ''}`); } };
const GL = `SOCIETE DEMO SAS Grand livre - Fournisseurs
PÉRIODE du 01/01/2026 au 31/12/2026
COMPT. FIG Date Journal Libellé Débit Crédit Solde
401ALPHA - FOURNISSEUR ALPHA
01/01/2026 AN 2026-01-01 – Report à nouveau 500,00 -500,00
10/01/2026 ACH Facture F-1001 PL7XK2M9QA 1 200,00 -1 700,00
15/01/2026 BQ1 Virement ALPHA 500,00 -1 200,00
20/02/2026 BQ1 Virement ALPHA 1 200,00 0,00
TOTAL 401ALPHA 1 700,00 1 700,00
401BETA - FOURNISSEUR BETA
05/03/2026 BQ1 Prélèvement BETA 300,00 300,00
06/03/2026 BQ1 Remboursement BETA 300,00 0,00
10/03/2026 ACH Facture B-77 450,00 -450,00
TOTAL 401BETA 300,00 750,00`;
(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8765' });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await pg.goto('http://localhost:8765/');
  await pg.fill('input[name=p1]', 'Cabinet-Test-2026!'); await pg.fill('input[name=p2]', 'Cabinet-Test-2026!'); await pg.check('input[name=ack]'); await pg.click('button[type=submit]'); await pg.waitForSelector('.layout');
  await pg.goto('http://localhost:8765/#/lettrage'); await pg.waitForSelector('.lett-paste');
  await pg.click('.lett-paste summary');
  await pg.fill('#lett-tx', GL);
  await pg.click('[data-action=lett-text]'); await pg.waitForTimeout(200);
  const s = await pg.evaluate(() => ({ msg: ui.lett.msg, by: Object.fromEntries(ui.lett.accs.map((a) => [a.code, { name: a.name, g: a.groups.map((g) => g.m), rest: a.rest.map((x) => [x.date, x.label, x.a]), lines: a.lines.map((x) => [x.j, x.type, x.side, x.an, x.label]) }])) }));
  expect(/^Format Pennylane : 2 compte/.test(s.msg), 'format Pennylane reconnu', s.msg);
  const A = s.by['401ALPHA'] || {}, B = s.by['401BETA'] || {};
  expect(A.name === 'FOURNISSEUR ALPHA' && A.g && A.g.length === 2 && !A.rest.length && A.lines[0][0] === 'AN' && A.lines[0][1] === 'achat' && A.lines[0][3] && A.lines[1][4] === 'ACH Facture F-1001',
    'compte « 40… - Nom », à-nouveau au crédit = facture, journaux BQ1, référence de pièce retirée, tout lettré', JSON.stringify(A));
  expect(B.g && B.g.join() === 'règlement ↔ remboursement' && B.rest.length === 1 && B.rest[0][2] === 45000, 'règlement remboursé lettré avec son remboursement, facture restée ouverte', JSON.stringify(B));

  await pg.check('.lett-mx input[data-f=bilan]'); await pg.waitForTimeout(150);
  expect((await pg.inputValue('.lett-mx input[data-f=sc]')) === 'SOCIETE DEMO SAS' && (await pg.inputValue('.lett-mx input[data-f=db]')) === '2026-12-31' && (await pg.inputValue('.lett-mx input[data-f=dd]')) === '2026-01-01',
    'société, clôture et début d\'exercice repris du grand livre');
  await pg.uncheck('.lett-mx input[data-f=bilan]'); await pg.waitForTimeout(100);
  expect(!(await pg.$('[data-action=lett-mx-reg]')), '« Règlement ? » masqué pour une pharmacie');
  await pg.check('.lett-mx input[data-f=nonph]'); await pg.waitForTimeout(150);
  let t = await pg.$eval('textarea[data-lett=mxtxt][data-i="#reg"]', (x) => x.value).catch(() => '');
  expect(t.includes('FOURNISSEUR BETA\n10/03/2026 - facture n° B-77 - 450,00 €') && t.includes('Total : 450,00 €') && !t.includes('ALPHA'), 'mail global « Règlement ? » : factures non réglées par fournisseur', t.slice(0, 200));
  await pg.check('.lett-mx input[data-f=regm][value=fournisseur]'); await pg.waitForTimeout(150);
  const per = await pg.$$eval('textarea[data-lett=mxtxt]', (x) => x.filter((e) => e.dataset.i.startsWith('reg:')).map((e) => e.value));
  expect(per.length === 1 && per[0].includes('factures suivantes de FOURNISSEUR BETA'), 'un mail par fournisseur', JSON.stringify(per).slice(0, 200));
  await pg.click('[data-action=lett-mx-all][data-g=reg]'); await pg.waitForTimeout(150);
  const clip = await pg.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  expect(clip.startsWith('Objet : Factures non réglées - FOURNISSEUR BETA'), 'copie des mails « Règlement ? »', clip.slice(0, 80));
  await pg.click('[data-action=lett-mx-reg]'); await pg.waitForTimeout(150);
  expect(!(await pg.$('textarea[data-i^="reg:"]')) && !(await pg.$('textarea[data-i="#reg"]')), 'bouton « Règlement ? » : demande retirée');

  console.log(ko ? `${ko} écart(s)` : 'lettrage Pennylane conforme');
  console.log('erreurs', errors);
  await br.close();
  if (ko) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(1); });
