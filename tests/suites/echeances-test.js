const { chromium } = require('playwright');
const path = require('path');
const O = path.join(__dirname, '../out/');
// Échéances qui tombent un samedi, un dimanche ou un jour férié : reportées au premier jour ouvré suivant pour le retard
// (suivi mensuel, missions, tableau de bord), la date saisie restant inchangée ; occurrence suivante sans dérive.
let ko = 0;
const expect = (cond, label, info) => { if (cond) console.log(`OK ${label}`); else { ko++; console.log(`KO ${label}${info ? ' : ' + info : ''}`); } };
(async () => {
  const br = await chromium.launch();
  const pg = await (await br.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' })).newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await pg.goto('http://localhost:8765/');
  await pg.fill('input[name=p1]', 'Cabinet-Test-2026!'); await pg.fill('input[name=p2]', 'Cabinet-Test-2026!'); await pg.check('input[name=ack]'); await pg.click('button[type=submit]'); await pg.waitForSelector('.layout');

  // 1. Échéance effective
  const eff = await pg.evaluate(() => Object.fromEntries(['2026-11-15', '2026-11-14', '2026-11-11', '2026-12-25', '2026-04-04', '2026-05-14', '2026-05-25', '2026-11-17'].map((d) => [d, effDue(d)])));
  expect(eff['2026-11-15'] === '2026-11-16' && eff['2026-11-14'] === '2026-11-16', 'samedi et dimanche : reportés au lundi', JSON.stringify(eff));
  expect(eff['2026-11-11'] === '2026-11-12' && eff['2026-12-25'] === '2026-12-28', 'jours fériés : 11 novembre, Noël (vendredi → lundi)', JSON.stringify(eff));
  expect(eff['2026-04-04'] === '2026-04-07' && eff['2026-05-14'] === '2026-05-15' && eff['2026-05-25'] === '2026-05-26', 'fêtes mobiles : lundi de Pâques, Ascension, lundi de Pentecôte', JSON.stringify(eff));
  expect(eff['2026-11-17'] === '2026-11-17', 'jour ouvré : inchangé');

  // 2. et 3. TVA due le dimanche 15/11/2026 : vendredi, lundi, mardi (une session par jour, horloge simulée)
  const day = async (iso) => {
    const p = await (await br.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' })).newPage();
    p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
    await p.clock.install({ time: new Date(`${iso}T09:00:00+01:00`) });
    await p.goto('http://localhost:8765/');
    await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!'); await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
    await p.click('main [data-action=new-client]'); await p.fill('#modal input[name=nom]', 'DOSSIER ECHEANCES'); await p.click('#modal button[type=submit]'); await p.waitForSelector('.grid-detail');
    const r = await p.evaluate(() => {
      const c = data.clients[0];
      c.jourTva = '15';
      c.regimeTva = 'Mensuelle';
      const tpl = templateById('tva');
      const m = { id: uid(), clientId: c.id, type: 'tva', titre: 'TVA 10/2026', exercice: '10/2026', echeance: '2026-11-15', statut: 'a_faire', priorite: 'normale', responsable: '', recurrence: 'mensuelle', notes: '', suiteCreee: false, termineLe: null, createdAt: nowIso(), updatedAt: nowIso(), etapes: tpl.etapes.map((label) => ({ id: uid(), label, done: false, doneAt: null })) };
      data.missions.push(m);
      const b = dueBadge(m);
      return { id: m.id, late: isLate(m), badge: b.replace(/<[^>]+>/g, ''), title: (b.match(/title="([^"]*)"/) || [])[1] || '' };
    });
    await p.evaluate(() => { ui.grille.year = 2026; location.hash = '#/grille'; });
    await p.waitForSelector(`.grille td[data-id="${r.id}"]`);
    r.cell = await p.$eval(`.grille td[data-id="${r.id}"]`, (td) => `${td.className} | ${td.title || (td.querySelector('[title]') || {}).title || ''}`);
    if (iso.endsWith('16')) await p.screenshot({ path: O + 'echeances-grille.png' });
    await p.context().close();
    return r;
  };
  const fri = await day('2026-11-13'), mon = await day('2026-11-16'), tue = await day('2026-11-17');
  expect(!fri.late && fri.badge === 'Dans 3 j' && /dimanche 15\/11\/2026 reportée/.test(fri.title), 'vendredi : compte à rebours jusqu\'au lundi, report indiqué', JSON.stringify(fri));
  expect(!mon.late && mon.badge === "Aujourd'hui", 'dimanche 15 → lundi 16 : pas en retard le lundi', JSON.stringify(mon));
  expect(tue.late && tue.badge === 'Retard 1 j', 'en retard à partir du mardi (1 jour, compté depuis le lundi)', JSON.stringify(tue));
  expect(!/g-late/.test(mon.cell) && /reportée au premier jour ouvré/.test(mon.cell), 'suivi mensuel : pas en retard le lundi, report dans l\'infobulle', mon.cell.slice(0, 160));
  expect(/g-late/.test(tue.cell), 'suivi mensuel : en retard le mardi', tue.cell.slice(0, 120));

  // 4. Occurrence suivante : depuis le jour limite TVA du dossier (pas de dérive après un report)
  await pg.click('main [data-action=new-client]'); await pg.fill('#modal input[name=nom]', 'DOSSIER ECHEANCES'); await pg.click('#modal button[type=submit]'); await pg.waitForSelector('.grid-detail');
  const next = await pg.evaluate(() => {
    const c = data.clients[0];
    c.jourTva = '15';
    // Ancienne échéance déjà reportée au lundi
    const m = { clientId: c.id, type: 'tva', echeance: '2026-11-16' };
    const tva = nextDue(m, 1);
    const acompte = nextDue(Object.assign({}, m, { type: 'acompte_is', echeance: '2026-03-16' }), 3);
    const autre = nextDue(Object.assign({}, m, { type: 'libre', echeance: '2026-11-15' }), 1);
    return { tva, acompte, autre };
  });
  expect(next.tva === '2026-12-15' && next.acompte === '2026-06-15' && next.autre === '2026-12-15', 'occurrence suivante : jour limite TVA du dossier, 15 pour les acomptes, même jour sinon', JSON.stringify(next));

  console.log(ko ? `${ko} écart(s)` : 'échéances conformes');
  console.log('erreurs', errors);
  await br.close();
  if (ko) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(1); });
