const { chromium } = require('playwright');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' })).newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:8765/'); await p.waitForSelector('form[data-form=setup]');
  // Coffre volumineux : 500 dossiers, 24 missions chacun
  await p.evaluate(async () => {
    const uid = () => crypto.randomUUID();
    const formes = ['SARL', 'SAS', 'SCI', 'EURL', 'SELARL'];
    const resp = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'];
    const clients = [], missions = [];
    for (let i = 0; i < 500; i++) {
      const c = { id: uid(), code: String(100000 + i), nom: `DOSSIER ${i}`, forme: formes[i % 5], regimeTva: i % 3 ? 'Réel normal (mensuel)' : 'Réel normal (trimestriel)', jourTva: '21', cloture: '31/12', responsable: resp[i % 5], archive: false, createdAt: new Date().toISOString() };
      clients.push(c);
      for (let m = 1; m <= 12; m++) {
        const done = m <= 8;
        missions.push({ id: uid(), clientId: c.id, type: 'tva', titre: `TVA ${String(m).padStart(2, '0')}/2026`, exercice: `${String(m).padStart(2, '0')}/2026`, echeance: `2026-${String(Math.min(m + 1, 12)).padStart(2, '0')}-21`, statut: done ? 'termine' : 'a_faire', priorite: 'normale', responsable: c.responsable, recurrence: 'mensuelle', etapes: [{ id: uid(), label: 'Pièces reçues', done }, { id: uid(), label: 'Télédéclaration', done }], notes: '' });
      }
      for (let k = 0; k < 12; k++) missions.push({ id: uid(), clientId: c.id, type: 'libre', titre: `Mission ${k}`, exercice: '2026', echeance: `2026-${String(1 + (k % 12)).padStart(2, '0')}-15`, statut: k % 4 ? 'en_cours' : 'attente_client', priorite: 'normale', responsable: c.responsable, recurrence: 'aucune', etapes: [], notes: '' });
    }
    await window.Vault.create('Cabinet-Test-2026!', { version: 1, settings: { utilisateur: 'AAA' }, clients, missions, journal: [] });
  });
  await p.reload();
  let t = Date.now();
  await p.fill('input[name=password]', 'Cabinet-Test-2026!'); await p.click('button[type=submit]'); await p.waitForSelector('.kpis');
  const res = { 'Déverrouillage + tableau de bord': Date.now() - t };
  const timeView = async (hash, sel) => { const s = Date.now(); await p.goto('http://localhost:8765/#/' + hash); await p.waitForSelector(sel); return Date.now() - s; };
  res['Dossiers (500 cartes)'] = await timeView('dossiers', '#dossier-list .dcard');
  res['Missions (liste)'] = await timeView('missions', '#mission-list .mrow');
  res['Suivi mensuel (grille)'] = await timeView('grille', '.grille tbody tr');
  t = Date.now(); await p.fill('input[data-filter=qDossiers]', '').catch(() => {});
  await p.goto('http://localhost:8765/#/dossiers'); await p.waitForSelector('#dossier-list .dcard');
  t = Date.now(); await p.type('input[data-filter=qDossiers]', 'DOSSIER 42'); await p.waitForFunction(() => document.querySelectorAll('#dossier-list .dcard').length < 20); res['Recherche (10 frappes)'] = Date.now() - t;
  await p.goto('http://localhost:8765/#/grille'); await p.waitForSelector('.grille');
  await p.click('button[data-action=grille-mode][data-mode=pointage]');
  t = Date.now(); await p.click('.grille td[data-action=grille-toggle] >> nth=100'); res['Pointage d\'une case'] = Date.now() - t;
  t = Date.now(); await p.goto('http://localhost:8765/#/tableau'); await p.click('main [data-action=open-cal]'); await p.waitForSelector('#modal .cal-obs'); res['Calendrier fiscal (calcul)'] = Date.now() - t;
  await p.click('#modal [data-action=close-modal]');
  const lines = Object.entries(res).map(([k, v]) => `${v < 1500 ? 'OK ' : 'LENT'} ${k.padEnd(34)} ${v} ms`);
  console.log(lines.join('\n'));
  console.log('erreurs', errors);
  await b.close();
})();
