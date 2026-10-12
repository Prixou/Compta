const { chromium } = require('playwright');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
const { fecTab, fecMonth } = require('./lib');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' })).newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('http://localhost:8765/');
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!');
  await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.click('main [data-action=new-client]'); await p.fill('#modal input[name=nom]', 'SARL CYCLES'); await p.fill('#modal input[name=contact]', 'Madame Durand').catch(() => {});
  await p.fill('#modal input[name=siren]', '444444444'); await p.click('#modal button[type=submit]'); await p.waitForSelector('.grid-detail');
  await p.goto('http://localhost:8765/#/fec'); await p.waitForSelector('.fec-drop');
  const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('.fec-drop')]);
  await ch.setFiles(D + '444444444FEC20251231.txt'); await p.waitForSelector('.fec-meta');
  await fecTab(p, 'mois-pieces', 200);
  const dump = async (ym) => {
    await fecMonth(p, ym);
    console.log(`\n=== ${ym}`, await p.$eval('.pieces-opts .muted', (x) => x.textContent));
    console.log(await p.$$eval('.pieces-group', (g) => g.map((x) => x.querySelector('h3').textContent.replace(/\s+/g, ' ').trim() + '\n   - ' + Array.from(x.querySelectorAll('.piece span')).map((s) => s.textContent).join('\n   - ')).join('\n')));
  };
  await dump('2025-08'); await dump('2025-09'); await dump('2025-06');
  await p.screenshot({ path: O + 'mois.png', fullPage: true });
  await p.click('button[data-action=pieces-demande]'); await p.waitForSelector('#modal textarea, #modal .msg-body', { timeout: 5000 }).catch(() => {});
  console.log('\nmail :', (await p.textContent('#modal')).replace(/\s+/g, ' ').slice(0, 400));
  // Numérotation des factures de vente du mois (toutes les écritures de produits)
  await p.click('#modal [data-action=close-modal]').catch(() => {});
  const numChecks = async (ym) => {
    await fecTab(p, 'mois-saisie', 0); await fecMonth(p, ym);
    return p.$$eval('.fec-checks > .fec-check', (l) => l.map((x) => (x.querySelector('strong').textContent + ' — ' + ((x.querySelector('.fec-check-text .muted') || {}).textContent || '').slice(0, 90) + ' :: ' + Array.from(x.querySelectorAll('.wp-el-text')).map((e) => e.textContent).join(' / ')).replace(/\s+/g, ' ')).filter((t) => /numérot|n° de facture|chronologique|plusieurs fois/i.test(t)));
  };
  const expectNum = (list, re, label) => console.log(list.some((t) => re.test(t)) ? `OK ${label}` : `KO ${label} : ${JSON.stringify(list)}`);
  const mai = await numChecks('2025-05');
  console.log('\nnumérotation mai :\n  ' + mai.join('\n  '));
  expectNum(mai, /manquantes dans la numérotation.*FA-2025-0045 : entre FA-2025-0044 du 23\/05\/2025 et FA-2025-0047 du 26\/05\/2025 \/ FA-2025-0046 : entre FA-2025-0044/, 'mai : FA-2025-0045 et FA-2025-0046 manquantes, une ligne chacune');
  expectNum(mai, /hors ordre chronologique.*FA-2025-0111 du 05\/05\/2025/, 'mai : facture hors ordre chronologique');
  const juil = await numChecks('2025-07');
  console.log('numérotation juillet :\n  ' + juil.join('\n  '));
  expectNum(juil, /plusieurs fois.*FA-2025-0060/, 'juillet : FA-2025-0060 en double');
  const sept = await numChecks('2025-09');
  console.log('numérotation septembre :\n  ' + sept.join('\n  '));
  expectNum(sept, /Numérotation des factures de vente continue/, 'septembre : numérotation continue');
  console.log('erreurs', errors);
  await b.close();
})();
