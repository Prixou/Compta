const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
const { fecTab, fecMonth } = require('./lib');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const PW = 'Cabinet-Test-2026!';
  await p.goto('http://localhost:8765/');
  await p.fill('input[name=p1]', PW); await p.fill('input[name=p2]', PW);
  await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  const newClient = async (nom, siren, resp) => {
    await p.goto('http://localhost:8765/#/dossiers'); await p.click('main [data-action=new-client]');
    await p.fill('#modal input[name=nom]', nom); await p.fill('#modal input[name=siren]', siren); await p.fill('#modal input[name=responsable]', resp);
    await p.click('#modal button[type=submit]'); await p.waitForSelector('.grid-detail');
  };
  await newClient('SARL CYCLES', '444444444', 'AAA');
  await newClient('SCI AUTRE', '555555555', 'BBB');
  const newMission = async (client, type, exercice, titre) => {
    await p.goto('http://localhost:8765/#/missions'); await p.click('main [data-action=new-mission]');
    await p.selectOption('#modal select[name=clientId]', { label: client });
    await p.selectOption('#modal select[name=type]', type);
    await p.fill('#modal input[name=exercice]', exercice); await p.fill('#modal input[name=titre]', titre);
    await p.click('#modal button[type=submit]'); await p.waitForTimeout(150);
  };
  await newMission('SARL CYCLES', 'tva', '06/2025', 'TVA 06/2025');
  await newMission('SARL CYCLES', 'bilan', '2025', 'Bilan annuel 2025');
  await newMission('SCI AUTRE', 'tva', '06/2025', 'TVA 06/2025');

  // B. Portefeuille cohérent
  await p.goto('http://localhost:8765/#/tableau'); await p.waitForSelector('select[data-dash]');
  await p.selectOption('select[data-dash]', 'BBB'); await p.waitForTimeout(150);
  const kpiOpen = await p.textContent('.kpis .kpi:nth-child(2) strong');
  await p.click('.kpis .kpi:nth-child(2)'); await p.waitForSelector('#mission-list');
  console.log('B. tableau (BBB) missions en cours :', kpiOpen, '| liste :', await p.$eval('#mission-list .muted', (x) => x.textContent), '| filtre :', await p.$eval('select[data-filter="mf.resp"]', (s) => s.value));
  await p.goto('http://localhost:8765/#/grille'); await p.waitForSelector('select[data-grille=resp]');
  console.log('   suivi mensuel filtre :', await p.$eval('select[data-grille=resp]', (s) => s.value));
  await p.goto('http://localhost:8765/#/tableau'); await p.selectOption('select[data-dash]', ''); await p.waitForTimeout(100);

  // C. Demande de pièces du mois -> étape « Pièces reçues » de la TVA du mois
  await p.goto('http://localhost:8765/#/fec'); await p.waitForSelector('.fec-drop');
  const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('.fec-drop')]);
  await ch.setFiles(D + '444444444FEC20251231.txt'); await p.waitForSelector('.fec-meta');
  await fecTab(p, 'mois-pieces', 0); await fecMonth(p, '2025-06', 150);
  await p.click('button[data-action=pieces-demande]'); await p.waitForSelector('#modal[open]');
  await p.click('#modal [data-action=close-modal]');
  await p.goto('http://localhost:8765/#/grille'); await p.waitForSelector('select[data-grille=annee]');
  await p.selectOption('select[data-grille=annee]', '2025'); await p.waitForSelector('.grille');
  await p.click('button[data-action=grille-mode][data-mode=etapes]');
  const row = p.locator('.grille tbody tr', { hasText: 'SARL CYCLES' });
  await row.locator('td[data-col="6"]').click(); await p.waitForSelector('#grille-pop');
  console.log('C. fenêtre du mois :', (await p.textContent('#grille-pop .gp-req')).replace(/\s+/g, ' ').trim());
  await p.click('#grille-pop .gp-req [data-action=open-mission]'); await p.waitForSelector('#modal[open] .sheet');
  await p.click('#modal [data-action=complete-mission]'); await p.waitForTimeout(200);
  console.log('   toast :', await p.textContent('#toast'));
  await row.locator('td[data-col="6"]').click(); await p.waitForSelector('#grille-pop');
  console.log('   étapes TVA 06 :', await p.$$eval('#grille-pop .gp-steps button.done', (l) => l.map((x) => x.textContent.trim())));
  await p.keyboard.press('Escape');

  // D. Mission de revue synchronisée avec la feuille de travail
  await p.goto('http://localhost:8765/#/fec'); await p.waitForSelector('.fec-meta');
  await p.click('button[data-action=fec-mission]'); await p.waitForTimeout(150);
  await fecTab(p, 'achats', 0); await p.waitForTimeout(150);
  const first = p.locator('.wp > li:has(select[data-wp=st])').first();
  const label = (await first.locator('strong').first().textContent()).trim();
  await first.locator('select[data-wp=st]').selectOption('justifie'); await p.waitForTimeout(200);
  await p.goto('http://localhost:8765/#/missions'); await p.fill('input[data-filter="mf.q"]', 'Revue FEC'); await p.waitForTimeout(150);
  await p.click('#mission-list .mrow'); await p.waitForSelector('#modal .steps');
  const st = await p.$$eval('#modal .steps li', (l) => l.map((x) => (x.querySelector('input').checked ? '✓ ' : '○ ') + x.textContent.replace(/\s+/g, ' ').trim()));
  console.log('D. point justifié :', label, '\n   étape de la mission :', st.filter((x) => x.includes(label)));
  await p.click('#modal [data-action=close-modal]');

  // E. Tous les cycles revus -> « Révision des comptes » du bilan 2025
  await p.goto('http://localhost:8765/#/fec'); await p.waitForSelector('.fec-meta');
  for (const k of ['achats', 'charges', 'clients', 'treso']) {
    await fecTab(p, k, 0); await p.waitForTimeout(100);
    await p.click(`button[data-action=wp-review][data-cycle=${k}]:not([data-undo])`); await p.waitForTimeout(150);
  }
  console.log('E. toast :', await p.textContent('#toast'));
  await p.goto('http://localhost:8765/#/missions'); await p.fill('input[data-filter="mf.q"]', 'Bilan annuel'); await p.waitForTimeout(150);
  await p.click('#mission-list .mrow'); await p.waitForSelector('#modal .steps');
  console.log('   bilan :', await p.$$eval('#modal .steps li', (l) => l.filter((x) => x.querySelector('input').checked).map((x) => x.textContent.replace(/\s+/g, ' ').trim())));
  await p.click('#modal [data-action=close-modal]');

  // F. Modèle modifié -> missions en cours mises à jour
  await p.goto('http://localhost:8765/#/parametres'); await p.click('button[data-action=edit-template][data-id=tva]');
  await p.waitForSelector('#modal textarea[name=etapes]');
  const cur = await p.inputValue('#modal textarea[name=etapes]');
  await p.fill('#modal textarea[name=etapes]', cur + '\nArchivage des pièces');
  await p.click('#modal button[type=submit]'); await p.waitForSelector('#ask[open]');
  console.log('F. question :', (await p.textContent('#ask .modal-body')).replace(/\s+/g, ' ').trim());
  await p.click('#ask button[type=submit]'); await p.waitForTimeout(200);
  console.log('   toast :', await p.textContent('#toast'));
  await p.goto('http://localhost:8765/#/grille'); await p.waitForSelector('select[data-grille=annee]');
  await p.selectOption('select[data-grille=annee]', '2025'); await p.waitForSelector('.grille');
  await row.locator('td[data-col="6"]').click(); await p.waitForSelector('#grille-pop');
  console.log('   étapes TVA 06 SARL :', await p.$$eval('#grille-pop .gp-steps button', (l) => l.map((x) => (x.classList.contains('done') ? '✓' : '○') + x.textContent.trim().replace(/^\S+/, '')).join(' | ')));
  await p.keyboard.press('Escape');

  // G. Clics rapides puis rechargement : tout est enregistré
  const row2 = p.locator('.grille tbody tr', { hasText: 'SCI AUTRE' });
  await row2.locator('td[data-col="6"]').click(); await p.waitForSelector('#grille-pop');
  for (const i of [0, 1, 2, 3, 4]) await p.click(`#grille-pop button[data-action=grille-step][data-i="${i}"]`);
  await p.reload(); await p.fill('input[name=password]', PW); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.goto('http://localhost:8765/#/grille'); await p.waitForSelector('select[data-grille=annee]');
  await p.selectOption('select[data-grille=annee]', '2025'); await p.waitForSelector('.grille');
  console.log('G. après rechargement, SCI AUTRE juin :', (await p.locator('.grille tbody tr', { hasText: 'SCI AUTRE' }).locator('td[data-col="6"]').textContent()).trim());

  // H. Dépôt de plusieurs FEC sur le portefeuille
  await p.goto('http://localhost:8765/#/portefeuille'); await p.waitForSelector('.fec-drop');
  const txt = fs.readFileSync(D + '444444444FEC20251231.txt', 'latin1');
  await p.evaluate((content) => {
    const dt = new DataTransfer();
    const bytes = Uint8Array.from(content, (c) => c.charCodeAt(0));
    dt.items.add(new File([bytes], '444444444FEC20251231.txt', { type: 'text/plain' }));
    dt.items.add(new File([bytes], '444444444FEC20241231.txt', { type: 'text/plain' }));
    document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, txt);
  await p.waitForSelector('table.batch tbody tr', { timeout: 30000 });
  await p.waitForFunction(() => document.querySelectorAll('table.batch tbody tr').length === 2, null, { timeout: 30000 });
  console.log('H. portefeuille par dépôt :', await p.$$eval('table.batch tbody tr', (l) => l.map((x) => x.cells[0].textContent.trim())));
  console.log('erreurs', errors);
  await b.close();
})();
