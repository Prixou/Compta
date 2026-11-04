const { chromium } = require('playwright');
// Lettrage : échéance écrite dans le libellé des factures (officines, grand livre ACD, texte inventé). Des factures du même
// montant chaque mois ne sont réglées que par le règlement tombé à quelques jours de leur échéance (5 par défaut) ; une date
// antérieure à l'écriture (date de la facture) n'est pas une échéance ; réglage vide : échéance ignorée.
let ko = 0;
const expect = (cond, label, info) => { if (cond) console.log(`OK ${label}`); else { ko++; console.log(`KO ${label}${info ? ' : ' + info : ''}`); } };
const GL = `123456 - PHARMACIE DEMO Grands-livres Edition provisoire
Du 01/01/2026 au 31/12/2026
Date Pièce Jnl Libellé Débit Crédit Solde
Compte FLABO LABORATOIRE FICTIF
19/05/2026 B000000101 AC LABORATOIRE FICTIF 03-07-2026 412,35 -412,35
24/06/2026 B000000102 AC LABORATOIRE FICTIF 08-08-2026 412,35 -824,70
04/07/2026 B000000103 BQ 7000001 LABORATOIRE FICTIF 412,35 -412,35
11/08/2026 B000000104 BQ 7000002 LABORATOIRE FICTIF 412,35 0,00
19/08/2026 B000000105 AC LABORATOIRE FICTIF 03-10-2026 412,35 -412,35
05/09/2026 B000000106 BQ 7000003 LCR 600001 RLV 00000001 412,35 0,00
06/10/2026 B000000107 BQ 7000004 LCR LABORATOIRE FICTIF 412,35 412,35
15/10/2026 B000000108 AC LABORATOIRE FICTIF 29-11-2026 412,35 0,00
Total compte FLABO
Compte FGROS GROSSISTE FICTIF
12/03/2026 B000000201 AC GROSSISTE FICTIF FACT 10-03-2026 250,00 -250,00
15/04/2026 B000000202 BQ VIR GROSSISTE FICTIF 250,00 0,00
Total compte FGROS`;
(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await pg.goto('http://localhost:8765/');
  await pg.fill('input[name=p1]', 'Cabinet-Test-2026!'); await pg.fill('input[name=p2]', 'Cabinet-Test-2026!'); await pg.check('input[name=ack]'); await pg.click('button[type=submit]'); await pg.waitForSelector('.layout');
  await pg.goto('http://localhost:8765/#/lettrage'); await pg.waitForSelector('.lett-paste');
  await pg.click('.lett-paste summary');
  await pg.fill('#lett-tx', GL);
  await pg.click('[data-action=lett-text]'); await pg.waitForTimeout(200);
  const res = () => pg.evaluate(() => Object.fromEntries(ui.lett.accs.map((a) => [a.code, {
    g: a.groups.map((g) => `${g.m} : ${g.lines.map((x) => x.date).join(' + ')}`), rest: a.rest.map((x) => x.date) }])));
  const setEch = async (v) => {
    if (!(await pg.isVisible('input[data-lett=ech]'))) await pg.click('details[data-keep=lett-set] summary');
    await pg.fill('input[data-lett=ech]', v); await pg.dispatchEvent('input[data-lett=ech]', 'change'); await pg.waitForTimeout(200);
  };

  // 1. Échéance du libellé, 5 jours d'écart au plus (réglage par défaut)
  let r = await res();
  const E = '1 règlement ↔ 1 facture à l\'échéance';
  expect(JSON.stringify(r.FLABO.g) === JSON.stringify([`${E} : 19/05/2026 + 04/07/2026`, `${E} : 24/06/2026 + 11/08/2026`, `${E} : 19/08/2026 + 06/10/2026`])
    && JSON.stringify(r.FLABO.rest) === '["05/09/2026","15/10/2026"]', 'chaque règlement solde la facture dont l’échéance tombe à quelques jours', JSON.stringify(r.FLABO));
  expect(JSON.stringify(r.FGROS.g) === JSON.stringify(['1 règlement ↔ 1 facture : 12/03/2026 + 15/04/2026']), 'date du libellé antérieure à l’écriture : date de facture, pas une échéance', JSON.stringify(r.FGROS));
  expect(/échéance du libellé ± 5 j/.test(await pg.textContent('details[data-keep=lett-set] summary')), 'réglage rappelé dans le résumé');

  // 2. Écart de 2 jours au plus : les règlements à 3 jours de l'échéance restent ouverts
  await setEch('2');
  r = await res();
  expect(r.FLABO.g.length === 1 && r.FLABO.g[0] === `${E} : 19/05/2026 + 04/07/2026` && r.FLABO.rest.length === 6, 'écart de 2 jours : un seul lettrage', JSON.stringify(r.FLABO));

  // 3. Réglage vide : échéance ignorée, la facture la plus ancienne est soldée d'abord
  await setEch('');
  r = await res();
  expect(r.FLABO.g.length === 3 && r.FLABO.g[2] === '1 règlement ↔ 1 facture : 19/08/2026 + 05/09/2026', 'réglage vide : échéance ignorée', JSON.stringify(r.FLABO));
  await setEch('5');
  expect(await pg.evaluate(() => data.settings.lettrage.ech === '5'), 'réglage retenu');

  console.log(ko ? `${ko} écart(s)` : 'échéances du libellé conformes');
  console.log('erreurs', errors);
  await br.close();
})();
