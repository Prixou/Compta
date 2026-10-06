const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
const PW = 'Cabinet-Test-2026!';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8765' });
  // Simulation de l'API de fichiers (sauvegarde automatique) : non disponible en navigateur sans interface.
  await ctx.addInitScript(() => {
    window.__writes = [];
    const handle = { name: 'sauvegarde-auto.json', kind: 'file',
      queryPermission: async () => 'granted', requestPermission: async () => 'granted',
      createWritable: async () => ({ write: async (t) => window.__writes.push(t), close: async () => {} }) };
    window.showSaveFilePicker = async () => handle;
    const mem = {};
    document.addEventListener('DOMContentLoaded', () => {
      window.Vault.getMeta = async (k) => mem[k];
      window.Vault.setMeta = async (k, v) => { if (v === undefined) delete mem[k]; else mem[k] = v; };
    });
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  const external = [];
  p.on('request', (r) => { if (!r.url().startsWith('http://localhost:8765')) external.push(r.url()); });

  await p.goto('http://localhost:8765/');
  await p.fill('input[name=p1]', PW); await p.fill('input[name=p2]', PW);
  await p.check('input[name=ack]'); await p.click('button[type=submit]');
  await p.waitForSelector('.layout');
  // Paramètres
  await p.click('a[data-nav=parametres]');
  await p.fill('input[name=cabinet]', 'Cabinet Test'); await p.fill('input[name=utilisateur]', 'AAA');
  await p.click('form[data-form=settings] button[type=submit]');
  // Import
  const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('main [data-action=import-sheet]')]);
  await ch.setFiles(D + 'import-dossiers.xlsx');
  await p.waitForSelector('#modal .imp-cols');
  await p.click('#modal [data-action=apply-import]');
  await p.waitForTimeout(300);
  console.log('1. import :', await p.textContent('#toast'));

  // 2. Calendrier fiscal
  await p.click('a[data-nav=tableau]');
  await p.click('main [data-action=open-cal]');
  await p.waitForSelector('#modal .cal-obs');
  console.log('2. obligations :', (await p.$$eval('#modal .cal-ob', (e) => e.map((x) => x.querySelector('strong').textContent + ' ' + Array.from(x.querySelectorAll('.badge')).map((b) => b.textContent).join(' ')))).join(' | '));
  console.log('   résumé :', (await p.textContent('#modal .imp-summary')).replace(/\s+/g, ' ').trim());
  await p.screenshot({ path: O + 'n1-calendrier.png' });
  await p.click('#modal [data-action=apply-cal]');
  await p.waitForTimeout(300);
  console.log('   ', await p.textContent('#toast'));
  // Vérification des dates de quelques dossiers
  async function dossier(q) {
    await p.click('a[data-nav=missions]');
    await p.selectOption('select[data-filter="mf.statut"]', 'toutes');
    await p.fill('input[data-filter="mf.q"]', q);
    await p.waitForTimeout(100);
    return p.$$eval('#mission-list .mrow', (rows) => rows.map((r) => r.querySelector('.mrow-title').textContent.trim() + ' → ' + r.querySelector('.due').getAttribute('title') + '|' + r.querySelector('.due').textContent));
  }
  console.log('   SARL mensuelle (jour 21) :', (await dossier('SARL IMMOBILIERE DES COTEAUX')).join(' ; '));
  console.log('   EARL CA12 :', (await dossier('DOMAINE DES SOURCES')).join(' ; '));
  console.log('   SELARL clôture 31/03 :', (await dossier('KINE PLUS')).filter((x) => !x.startsWith('TVA 0')).join(' ; '));
  console.log('   SCI trimestrielle :', (await dossier('LES ARCADES')).join(' ; '));
  // Réouverture : rien à recréer
  await p.click('a[data-nav=tableau]');
  await p.click('main [data-action=open-cal]');
  console.log('   2e passage :', (await p.textContent('#modal .imp-summary')).replace(/\s+/g, ' ').trim());
  await p.click('#modal [data-action=close-modal]');

  // 3. Pointage rapide
  await p.click('a[data-nav=grille]');
  await p.click('button[data-action=grille-mode][data-mode=pointage]');
  const sel = '.grille tr:has-text("SARL IMMOBILIERE DES COTEAUX") td[data-action]';
  const before = await p.$$eval(sel, (t) => t.map((x) => x.textContent).join(' '));
  await p.locator(sel).nth(8).click();
  const after = await p.$$eval(sel, (t) => t.map((x) => x.textContent).join(' '));
  await p.locator(sel).nth(8).click();
  const undo = await p.$$eval(sel, (t) => t.map((x) => x.textContent).join(' '));
  console.log('3. pointage :', before, '→', after, '→', undo);
  await p.locator(sel).nth(8).click(); // on laisse septembre à OK

  // 4. Export Excel
  await p.click('button[data-action=export-grille]');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#ask button[type=submit]')]);
  await dl.saveAs(O + 'export-grille.xlsx');
  console.log('4. export Excel :', dl.suggestedFilename());

  // 5. Message client
  await p.click('a[data-nav=dossiers]');
  await p.fill('input[data-filter=qDossiers]', 'BOULANGERIE MARTIN');
  await p.click('#dossier-list a, #dossier-list tbody tr');
  await p.click('.mrow:has-text("TVA 10/2026")');
  await p.click('#modal [data-action=open-msg]');
  await p.waitForSelector('#msg-body');
  console.log('5. objet :', await p.inputValue('#msg-subject'));
  console.log('   message :\n' + (await p.inputValue('#msg-body')).split('\n').map((l) => '     | ' + l).join('\n'));
  await p.screenshot({ path: O + 'n2-message.png' });
  await p.click('#modal [data-action=msg-copy]');
  await p.waitForTimeout(200);
  console.log('   presse-papiers identique :', (await p.evaluate(() => navigator.clipboard.readText())).startsWith('Bonjour'));
  await p.click('#modal [data-action=close-modal]');
  await p.waitForTimeout(200);
  console.log('   journal :', await p.$eval('.journal li', (li) => li.textContent.replace(/\s+/g, ' ').trim()));
  console.log('   statut :', await p.$eval('.mrow:has-text("TVA 10/2026") .badge', (b) => b.textContent));
  await p.fill('textarea[name=texte]', 'Appel du client : pièces envoyées par courrier.');
  await p.click('form[data-form=journal] button');

  // 6. Filtre « Mes dossiers »
  await p.click('a[data-nav=tableau]');
  await p.waitForSelector('select[data-dash=resp]');
  const kpiAll = await p.$$eval('.kpi strong', (k) => k.map((x) => x.textContent).join('/'));
  await p.selectOption('select[data-dash=resp]', 'BBB');
  const kpiNis = await p.$$eval('.kpi strong', (k) => k.map((x) => x.textContent).join('/'));
  console.log('6. KPI tous :', kpiAll, '| BBB :', kpiNis, '| options :', await p.$$eval('select[data-dash=resp] option', (o) => o.map((x) => x.textContent).join(', ')));
  await p.selectOption('select[data-dash=resp]', '');
  await p.screenshot({ path: O + 'n3-dashboard.png', fullPage: true });

  // 7. Agenda
  await p.click('a[data-nav=parametres]');
  await p.click('button[data-action=open-ics]');
  const [ics] = await Promise.all([p.waitForEvent('download'), p.click('#modal button[type=submit]')]);
  await ics.saveAs(O + 'agenda.ics');
  const icsText = fs.readFileSync(O + 'agenda.ics', 'utf8');
  console.log('7. ICS : événements', (icsText.match(/BEGIN:VEVENT/g) || []).length, '| noms de clients présents ?', /BOULANGERIE|IMMOBILIERE|DOMAINE/.test(icsText), '| lignes > 75 octets ?', icsText.split('\r\n').some((l) => Buffer.byteLength(l) > 75));
  console.log(icsText.split('\r\n').slice(6, 20).join('\n'));

  // 8. Sauvegarde automatique
  await p.click('button[data-action=autobackup-choose]');
  await p.waitForTimeout(500);
  const w1 = await p.evaluate(() => window.__writes.length);
  const content = await p.evaluate(() => window.__writes[0]);
  console.log('8. sauvegarde auto : écritures', w1, '| chiffrée ?', JSON.parse(content).format, '| noms en clair ?', /BOULANGERIE/.test(content));
  console.log('   carte :', (await p.textContent('section.card:has-text("Sauvegarde automatique")')).replace(/\s+/g, ' ').trim().slice(0, 120));
  await p.fill('input[name=cabinet]', 'Cabinet Test 2');
  await p.click('form[data-form=settings] button[type=submit]');
  await p.click('.sidebar button[data-action=lock]');
  await p.waitForSelector('form[data-form=unlock]');
  console.log('   écritures après modification + verrouillage :', await p.evaluate(() => window.__writes.length));

  // 9. Aide
  await p.fill('input[name=password]', PW); await p.click('button[type=submit]');
  await p.waitForSelector('.layout');
  await p.click('.sidebar a[href="#/aide"]');
  await p.waitForSelector('.help');
  await p.screenshot({ path: O + 'n4-aide.png' });
  console.log('9. aide :', await p.$$eval('.help h2', (h) => h.map((x) => x.textContent).join(' | ')));

  // 10. Relance 9 jours plus tard
  await p.clock.install({ time: new Date(Date.now() + 9 * 86400000) });
  await p.reload();
  await p.fill('input[name=password]', PW); await p.click('button[type=submit]');
  await p.waitForSelector('.layout');
  await p.goto('http://localhost:8765/#/tableau');
  await p.waitForSelector('.kpis');
  const relH2 = await p.$$eval('section.card h2', (h) => h.map((x) => x.textContent.replace(/\s+/g, ' ').trim()).filter((t) => t.startsWith('À relancer')));
  console.log('10. +9 jours :', relH2, await p.$$eval('section.card:has(h2:text-matches("À relancer")) .mrow-client', (e) => e.map((x) => x.textContent)));
  await p.click('section.card:has(h2:text-matches("À relancer")) .mrow');
  await p.click('#modal [data-action=open-msg]');
  console.log('    modèle proposé :', await p.textContent('#modal .msg-models .on'));
  console.log((await p.inputValue('#msg-body')).split('\n').slice(2, 6).map((l) => '     | ' + l).join('\n'));
  await p.click('#modal [data-action=close-modal]');

  // 11. Réimport de l'export Excel dans un coffre neuf
  const p2 = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'fr-FR' })).newPage();
  p2.on('pageerror', (e) => errors.push('PAGEERROR2 ' + e.message));
  await p2.goto('http://localhost:8765/');
  await p2.fill('input[name=p1]', PW); await p2.fill('input[name=p2]', PW);
  await p2.check('input[name=ack]'); await p2.click('button[type=submit]');
  await p2.waitForSelector('.layout');
  const [ch2] = await Promise.all([p2.waitForEvent('filechooser'), p2.click('main [data-action=import-sheet]')]);
  await ch2.setFiles(O + 'export-grille.xlsx');
  await p2.waitForSelector('#modal .imp-cols');
  console.log('11. réimport export :', (await p2.textContent('#modal .imp-summary')).replace(/\s+/g, ' ').trim());

  // 12. Mobile
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto('http://localhost:8765/#/tableau');
  await p.waitForSelector('.kpis');
  await p.screenshot({ path: O + 'n5-mobile-dashboard.png' });
  console.log('débordement horizontal mobile ?', await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth));

  console.log('requêtes externes :', external, '\nerreurs :', errors);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
