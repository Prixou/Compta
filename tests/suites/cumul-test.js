const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
const { fecTab, fecMonth } = require('./lib');
// Pièces manquantes de l'espace Mois, cumulées depuis le début de l'exercice : demande mensuelle unique qui se complète,
// pièces reçues jamais redemandées, pièces déjà demandées en « Pour rappel », « Pièces reçues » des missions du mois coché
// mois par mois, pièces écartées, demandes antérieures reprises, pièces comptabilisées depuis la demande.
// FEC de référence Pennylane (exercice du 01/09/2026 au 31/08/2027, écritures de septembre et octobre 2026).
const FEC = D + '900000009FEC20270831.txt';
// Variante : la facture de vente F-260159, manquante, est saisie (même SIREN et même clôture).
const DER = path.join(O, 'cumul');
fs.mkdirSync(DER, { recursive: true });
const FEC2 = path.join(DER, '900000009FEC20270831.txt');
fs.writeFileSync(FEC2, fs.readFileSync(FEC, 'utf8').replace(/\n$/, '') + '\n' + [
  ['VT', 'Journal de vente', '999', '20260903', '7061000008', 'PRESTATIONS 10.00 % (TVA 10%)', '', '', 'ZZTEST0159', '20260903', 'Facture DURAND ALAIN - F-260159', '0,0', '100,0', '', '', '', '-100,00', 'EUR'],
  ['VT', 'Journal de vente', '999', '20260903', '411', 'Clients', '411100901', 'DURAND ALAIN', 'ZZTEST0159', '20260903', 'Facture DURAND ALAIN - F-260159', '110,0', '0,0', '', '', '', '110,00', 'EUR'],
  ['VT', 'Journal de vente', '999', '20260903', '4457400008', 'TVA collectée sur encaissements (TVA 10%)', '', '', 'ZZTEST0159', '20260903', 'Facture DURAND ALAIN - F-260159', '0,0', '10,0', '', '', '', '-10,00', 'EUR'],
].map((l) => l.join('\t')).join('\n') + '\n');

(async () => {
  const b = await chromium.launch();
  let ko = 0;
  const expect = (cond, label, info) => { if (cond) console.log(`OK ${label}`); else { ko++; console.log(`KO ${label}${info ? ' : ' + info : ''}`); } };
  const errors = [];
  const start = async () => {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8765' });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto('http://localhost:8765/');
    await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!'); await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
    await p.click('a[data-nav=parametres]');
    await p.fill('input[name=cabinet]', 'Cabinet Martin'); await p.fill('input[name=utilisateur]', 'Quentin');
    await p.click('form[data-form=settings] button[type=submit]');
    await p.goto('http://localhost:8765/#/dossiers'); await p.click('main [data-action=new-client]');
    await p.fill('#modal input[name=nom]', 'EXEMPLE CONSEIL'); await p.fill('#modal input[name=siren]', '900000009');
    await p.fill('#modal input[name=contact]', 'Madame Exemple'); await p.fill('#modal input[name=email]', 'contact@exemple.fr');
    await p.click('#modal button[type=submit]'); await p.waitForSelector('.grid-detail');
    return p;
  };
  const load = async (p, file, ym) => {
    await p.goto('http://localhost:8765/#/fec'); await p.waitForSelector('main [data-action=fec-pick]');
    const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('main [data-action=fec-pick] >> nth=0')]);
    await ch.setFiles(file); await p.waitForSelector('.fec-meta');
    await fecTab(p, 'mois-pieces', 0); await fecMonth(p, ym);
  };
  const month = async (p, ym) => { await fecTab(p, 'mois-pieces', 0); await fecMonth(p, ym); };
  // Blocs de la carte : À demander (cases), déjà demandées, écartées
  const view = (p) => p.evaluate(() => {
    const card = Array.from(document.querySelectorAll('main section.card')).find((x) => x.querySelector('.pieces-actions'));
    const txt = (e) => e.textContent.replace(/\s+/g, ' ').trim();
    return {
      h2: txt(card.querySelector('h2')), intro: txt(card.querySelector('p.muted')),
      fresh: Array.from(card.querySelectorAll('.check.piece input[data-piece]')).map((i) => ({ id: i.dataset.piece, text: txt(i.closest('label').querySelector('span')) })),
      pending: Array.from(card.querySelectorAll('.piece-row.pending')).map((r) => ({ text: txt(r.querySelector('.piece-text')), badges: Array.from(r.querySelectorAll('.badge')).map(txt) })),
      ecartes: Array.from(card.querySelectorAll('input[data-ecarte]')).map((i) => txt(i.closest('label').querySelector('span'))),
      card: txt(card), tab: txt(document.querySelector('.fec-tabs button[data-tab="mois-pieces"]')),
    };
  });
  const demandes = (p) => p.evaluate(() => data.missions.filter((m) => m.demandePieces).map((m) => ({ titre: m.titre, statut: m.statut, dp: m.demandePieces, exercice: m.exercice,
    etapes: m.etapes.map((e) => ({ id: e.id, label: e.label, done: e.done, keys: e.keys || [], ym: e.ym, at: e.at, auto: e.auto || '', doc: e.doc, ops: e.ops })) })));
  const has = (list, re) => list.some((x) => re.test(typeof x === 'string' ? x : x.text));

  // ---------- 1. Liste cumulée sans demande : octobre reprend ce qui manque depuis septembre ----------
  const p = await start();
  await load(p, FEC, '2026-09');
  const sept = await view(p);
  const septKeys = await p.evaluate(() => computePieces(ui.fec.result, 'mois', '2026-09-30').flatMap((i) => i.keys || []));
  await month(p, '2026-10');
  let v = await view(p);
  console.log('=== OCTOBRE (sans demande)\n   - ' + v.fresh.map((x) => x.text).join('\n   - '));
  expect(v.h2 === 'Pièces manquantes au 31 octobre 2026', 'titre : pièces manquantes à la fin du mois', v.h2);
  expect(/Exercice ouvert le 1er septembre 2026/.test(v.intro), "début de l'exercice indiqué", v.intro.slice(0, 80));
  expect(has(v.fresh, /PARKING CENTRE.*29\/09\/2026/) && has(v.fresh, /F-260159 \(septembre 2026\)/) && has(v.fresh, /F-260190 \(octobre 2026\)/), 'octobre : pièces de septembre toujours manquantes et pièces d\'octobre');
  expect(has(v.fresh, /^Factures « WEB SCI EXEMPLE LOYER » : 2 paiements \(septembre et octobre 2026\)/), 'loyers prélevés : un élément, deux paiements sur la période');
  expect(new Set(v.fresh.map((x) => x.id)).size === v.fresh.length, 'identifiants des éléments uniques');
  const octKeys = await p.evaluate(() => computePieces(ui.fec.result, 'mois', '2026-10-31').flatMap((i) => i.keys || []));
  expect(septKeys.length > 5 && septKeys.every((k) => octKeys.includes(k)), `toutes les opérations de septembre (${septKeys.length}) sont dans la liste d'octobre`);
  expect(/^Pièces manquantes \(\d+\)$/.test(v.tab) && Number(v.tab.match(/\d+/)[0]) === v.fresh.length, 'onglet « Pièces manquantes (N) »', v.tab);
  const keyless = await p.evaluate(() => computePieces(ui.fec.result, 'mois', '2026-10-31').filter((i) => !(i.keys && i.keys.length)).map((i) => i.text));
  expect(!keyless.length, 'chaque élément de la demande mensuelle porte les clés de ses opérations', keyless.join(' | '));
  const lab = await p.evaluate(() => [dateLongue('2026-09-01'), dateLongue('2026-08-31'), piecesLabel('mois', '2026-08-31'), exStart(ui.fec.result, '2026-10-31')]);
  expect(lab.join('|') === '1er septembre 2026|31 août 2026|comptabilité au 31 août 2026|2026-09-01', 'libellés de date et début d\'exercice', lab.join('|'));
  await p.screenshot({ path: O + 'cumul-1.png', fullPage: true });

  // ---------- 2. Demande de septembre ----------
  await month(p, '2026-09');
  await p.click('button[data-action=pieces-demande]'); await p.waitForSelector('#msg-body');
  let body = await p.inputValue('#msg-body');
  expect(/^Afin de mettre à jour votre comptabilité au 30 septembre 2026, nous avons besoin des éléments suivants :/m.test(body), 'mail : objet de la demande', body.split('\n')[2]);
  expect(await p.inputValue('#msg-subject') === 'EXEMPLE CONSEIL — pièces nécessaires pour votre comptabilité au 30 septembre 2026', 'objet du mail', await p.inputValue('#msg-subject'));
  await p.click('#modal [data-action=msg-copy]');
  await p.click('#modal [data-action=close-modal]');
  let dm = await demandes(p);
  expect(dm.length === 1 && dm[0].titre === 'Demande de pièces — comptabilité au 30 septembre 2026', 'une demande mensuelle', dm.map((m) => m.titre).join(' | '));
  const dp = dm[0].dp;
  expect(dp.mode === 'mois' && dp.from === '2026-09-01' && dp.arrete === '2026-09-30' && dp.closing === '2027-08-31' && dp.v === 2 && dm[0].exercice === '2027', 'demande : période, clôture, exercice de la clôture', JSON.stringify(dp) + ' ' + dm[0].exercice);
  expect(dm[0].etapes.every((e) => e.keys.length && e.ym === '2026-09' && e.at), 'étapes : clés, mois et date d\'ajout');
  expect(dm[0].etapes.some((e) => e.doc && e.ops && e.ops.length), 'étapes : document et opérations conservés pour la liste Excel');

  // ---------- 3. Pièce reçue, puis liste d'octobre ----------
  const parking = dm[0].etapes.find((e) => /PARKING CENTRE/.test(e.label));
  await p.evaluate((id) => { const m = data.missions.find((x) => x.demandePieces); toggleStep(m, id, true); }, parking.id);
  await month(p, '2026-10');
  v = await view(p);
  console.log('=== OCTOBRE (après la demande de septembre)\n   À demander :\n   - ' + v.fresh.map((x) => x.text).join('\n   - ') + '\n   Déjà demandées :\n   - ' + v.pending.map((x) => `${x.text} [${x.badges.join(', ')}]`).join('\n   - '));
  expect(has(v.fresh, /PARKING CENTRE/), 'pièce cochée reçue mais toujours manquante dans le FEC : de nouveau à demander');
  expect(!v.pending.length && !/Déjà demandées/.test(v.card), 'pas de bloc « déjà demandées »');
  expect(has(v.fresh, /F-260190/) && has(v.fresh, /F-260159/) && has(v.fresh, /^Factures « WEB SCI EXEMPLE LOYER » : 2 paiements/), 'à demander : toutes les pièces manquantes, déjà demandées ou non');
  expect(/^Pièces manquantes \(\d+\)$/.test(v.tab) && Number(v.tab.match(/\d+/)[0]) === v.fresh.length, 'onglet : pièces manquantes', v.tab);
  // Pièces toujours manquantes : jamais « comptabilisées », quel que soit l'espace (liste de la situation plafonnée, détecteurs différents)
  const fauxPos = await p.evaluate(() => ['mois', 'situation', 'bilan'].map((mode) => piecesPending(ui.fec.result, mode, mode === 'bilan' ? '2027-08-31' : '2026-10-31').filter((x) => x.comptab).length).join(','));
  expect(fauxPos === '0,0,0', 'aucune pièce manquante signalée comptabilisée (Mois, situation, bilan)', fauxPos);

  // ---------- 4. Demande d'octobre : la demande unique se complète, mail « Pour rappel », pièce écartée ----------
  const f190 = v.fresh.find((x) => /F-260190/.test(x.text));
  await p.uncheck(`input[data-piece="${f190.id}"]`);
  const nSept = dm[0].etapes.length;
  await p.click('button[data-action=pieces-demande]'); await p.waitForSelector('#msg-body');
  body = await p.inputValue('#msg-body');
  console.log('=== MAIL D\'OCTOBRE\n' + body);
  expect(await p.evaluate(() => ui.msg.modele) === 'pieces', 'modèle « demande de documents » (et non relance)');
  expect(/Afin de mettre à jour votre comptabilité au 31 octobre 2026, nous avons besoin des éléments suivants :/.test(body) && !/Pour rappel/.test(body), 'mail : une seule liste, sans « Pour rappel »');
  expect(/WEB SCI EXEMPLE LOYER » : 2 paiements/.test(body) && /F-260159/.test(body) && /PARKING/.test(body) && !/F-260190/.test(body), 'mail : toutes les pièces manquantes, sauf la pièce écartée');
  await p.click('#modal [data-action=msg-copy]');
  await p.click('#modal [data-action=close-modal]');
  dm = await demandes(p);
  const keysAll = dm[0].etapes.filter((e) => !e.done).flatMap((e) => e.keys);
  expect(dm.length === 1 && dm[0].titre === 'Demande de pièces — comptabilité au 31 octobre 2026' && dm[0].dp.arrete === '2026-10-31' && dm[0].dp.from === '2026-09-01', 'toujours une seule demande mensuelle, passée au 31 octobre', dm.map((m) => `${m.titre} ${m.dp.arrete}`).join(' | '));
  expect(new Set(keysAll).size === keysAll.length, 'aucune opération attendue deux fois dans la demande');
  expect(dm[0].etapes.some((e) => e.ym === '2026-10') && dm[0].etapes.filter((e) => e.ym === '2026-09').length >= nSept, 'étapes de septembre gardent leur mois, octobre ajouté');
  await month(p, '2026-10');
  v = await view(p);
  expect(v.ecartes.length === 1 && /F-260190/.test(v.ecartes[0]) && !has(v.fresh, /F-260190/), 'pièce décochée : rangée dans « Écartées »', v.ecartes.join(' | '));
  // Retour en septembre : la demande ne recule pas
  await month(p, '2026-09');
  await p.click('button[data-action=pieces-demande]'); await p.waitForSelector('#msg-body');
  expect(await p.evaluate(() => ui.msg.modele) === 'relance', 'rien de nouveau en septembre : relance');
  await p.click('#modal [data-action=close-modal]');
  dm = await demandes(p);
  expect(dm[0].dp.arrete === '2026-10-31', 'la demande ne recule pas au 30 septembre');
  // Pièce écartée remise
  await month(p, '2026-10');
  await p.click('.pieces-ecartes summary'); await p.click('input[data-ecarte]'); await p.waitForTimeout(150);
  v = await view(p);
  expect(has(v.fresh, /F-260190/) && !v.ecartes.length, 'pièce écartée remise dans les pièces à demander');

  // ---------- 5. « Pièces reçues » des missions TVA, mois par mois ----------
  await p.evaluate(() => {
    const c = data.clients[0];
    ['09/2026', '10/2026'].forEach((ex) => data.missions.push({ id: uid(), clientId: c.id, type: 'tva', titre: `TVA ${ex}`, exercice: ex, echeance: '', statut: 'en_cours', priorite: 'normale',
      responsable: '', recurrence: 'aucune', notes: '', suiteCreee: false, termineLe: null, createdAt: nowIso(), updatedAt: nowIso(), etapes: [{ id: uid(), label: 'Pièces reçues', done: false, doneAt: null }, { id: uid(), label: 'Déclaration', done: false, doneAt: null }] }));
    persist();
  });
  const tva = () => p.evaluate(() => data.missions.filter((m) => m.type === 'tva').map((m) => `${m.exercice}:${m.etapes[0].done ? 'reçue' : 'attente'}`).join(' '));
  dm = await demandes(p);
  for (const e of dm[0].etapes.filter((x) => x.ym === '2026-09' && !x.done)) await p.evaluate((id) => { const m = data.missions.find((x) => x.demandePieces && x.statut !== 'termine'); toggleStep(m, id, true); }, e.id);
  expect(await tva() === '09/2026:reçue 10/2026:attente', 'pièces de septembre toutes reçues : « Pièces reçues » de la TVA de septembre seule', await tva());
  // « Pièces reçues » de septembre décochée à la main : plus jamais recochée automatiquement
  await p.evaluate(() => { const m = data.missions.find((x) => x.type === 'tva' && x.exercice === '09/2026'); toggleStep(m, m.etapes[0].id, false); });
  for (const e of dm[0].etapes.filter((x) => x.ym === '2026-10' && !x.done)) await p.evaluate((id) => { const m = data.missions.find((x) => x.demandePieces && x.statut !== 'termine'); if (m) toggleStep(m, id, true); }, e.id);
  dm = await demandes(p);
  expect(await tva() === '09/2026:attente 10/2026:reçue' && dm[0].statut === 'termine', 'toutes reçues : TVA d\'octobre cochée, celle de septembre décochée à la main reste décochée, demande terminée', `${await tva()} ${dm[0].statut}`);
  await p.close();

  // ---------- 6. Demandes antérieures (sans clés) reprises, comptabilisées depuis, coche annulée ----------
  const q = await start();
  await q.evaluate(() => {
    const c = data.clients[0];
    const old = (titre, arrete, etapes, relances) => ({ id: uid(), clientId: c.id, type: 'libre', titre, exercice: arrete.slice(0, 4), echeance: '', statut: 'attente_client', priorite: 'normale', responsable: '',
      recurrence: 'aucune', notes: '', suiteCreee: false, termineLe: null, createdAt: '2026-10-02T09:00:00.000Z', updatedAt: '2026-10-02T09:00:00.000Z', relances,
      demandePieces: { mode: 'mois', arrete }, etapes: etapes.map(([label, done]) => ({ id: uid(), label, cat: 'Ventes et encaissements', done, doneAt: done ? '2026-10-03T09:00:00.000Z' : null })) });
    data.missions.push(old('Demande de pièces — mois de septembre 2026', '2026-09-30', [
      ['Facture de vente n° F-260159 (septembre 2026) : copie, ou confirmation de son annulation', false],
      ['Facture de vente n° F-260181 (septembre 2026) : copie, ou confirmation de son annulation', true],
      // Libellé d'avant la version 45 pour une opération en compte d'attente
      ["Justificatif de l'opération « CARTE X1111 PARKING CENTRE » du 29/09/2026 : paiement de 4,60 €", false]], ['2026-10-02T09:05:00.000Z']));
    data.missions.push(old("Demande de pièces — mois d'octobre 2026", '2026-10-31', [['Facture de vente n° F-260182 (septembre 2026) : copie, ou confirmation de son annulation', false]], []));
    data.missions.push({ id: uid(), clientId: c.id, type: 'tva', titre: 'TVA 09/2026', exercice: '09/2026', echeance: '', statut: 'en_cours', priorite: 'normale', responsable: '', recurrence: 'aucune', notes: '',
      suiteCreee: false, termineLe: null, createdAt: nowIso(), updatedAt: nowIso(), etapes: [{ id: uid(), label: 'Pièces reçues', done: false, doneAt: null }] });
    persist();
  });
  await load(q, FEC, '2026-10');
  v = await view(q);
  expect(has(v.fresh, /F-260159/) && has(v.fresh, /F-260181/) && has(v.fresh, /F-260182/) && has(v.fresh, /PARKING CENTRE/) && !v.pending.length, 'anciennes demandes : pièces toujours manquantes listées à demander');
  await q.click('button[data-action=pieces-demande]'); await q.waitForSelector('#msg-body');
  await q.click('#modal [data-action=close-modal]');
  dm = await demandes(q);
  const open = dm.filter((m) => m.statut !== 'termine');
  const closed = dm.find((m) => m.titre === 'Demande de pièces — mois de septembre 2026');
  expect(open.length === 1 && open[0].titre === 'Demande de pièces — comptabilité au 31 octobre 2026', 'une seule demande ouverte, renommée', dm.map((m) => `${m.titre} (${m.statut})`).join(' | '));
  expect(closed && closed.statut === 'termine' && closed.etapes.every((e) => e.done), 'demande de septembre close, pièces attendues reprises');
  const f159 = open[0].etapes.find((e) => /F-260159/.test(e.label));
  expect(f159 && !f159.done && f159.keys.length && f159.ym === '2026-09', 'pièce reprise : clés retrouvées, mois de septembre', JSON.stringify(f159));
  const park = open[0].etapes.find((e) => /PARKING CENTRE/.test(e.label));
  expect(park && park.keys.some((k) => k.startsWith('att|')) && open[0].etapes.filter((e) => /PARKING CENTRE/.test(e.label)).length === 1, 'opération en attente reprise une seule fois, avec ses clés');
  expect(await q.evaluate(() => data.missions.find((m) => m.type === 'tva').etapes[0].done) === false, 'reprise sans valoir réception : TVA de septembre non cochée');
  // Facture F-260159 saisie depuis la demande : signalée, cochée à la demande de l'utilisateur
  await load(q, FEC2, '2026-10');
  const comptab = () => q.evaluate(() => piecesPending(ui.fec.result, 'mois', '2026-10-31').filter((x) => x.comptab).map((x) => x.e.label).join(' | '));
  const tag = await comptab();
  expect(/F-260159/.test(tag) && !/\|/.test(tag), 'facture saisie depuis : seule pièce reconnue comptabilisée', tag);
  const copie = await q.evaluate(() => piecesCopyText());
  expect(!/F-260159/.test(copie) && /F-260182/.test(copie), 'texte copié : pièce saisie absente, pièces manquantes présentes');
  await fecTab(q, 'mois-pieces', 0);
  await q.click('button[data-action=pieces-demande]'); await q.waitForSelector('#msg-body');
  await q.click('#modal [data-action=close-modal]');
  dm = await demandes(q);
  const auto = dm.find((m) => m.statut !== 'termine').etapes.find((e) => /F-260159/.test(e.label));
  expect(auto.done && /^comptabilisée d'après le FEC 900000009FEC20270831\.txt$/.test(auto.auto), 'cochée automatiquement, avec la raison', auto.auto);
  // Coche annulée à la main : jamais recochée
  await q.evaluate((id) => { const m = data.missions.find((x) => x.demandePieces && x.statut !== 'termine'); toggleStep(m, id, false); }, auto.id);
  await month(q, '2026-10');
  expect(!(await comptab()), 'coche annulée : plus proposée à la coche automatique');
  // Le FEC d'origine (facture absente) ne coche rien
  await load(q, FEC, '2026-10');
  expect(!(await comptab()), 'FEC où la facture manque toujours : aucune pièce signalée comptabilisée');
  await q.screenshot({ path: O + 'cumul-2.png', fullPage: true });

  // ---------- 7. Demande du bilan pendant la demande mensuelle : le mail porte sur le bilan ----------
  await fecTab(q, 'pieces', 0);
  await q.click('button[data-action=pieces-mode][data-mode=bilan]');
  await q.click('button[data-action=pieces-demande]'); await q.waitForSelector('#msg-body');
  const prim = await q.evaluate(() => { const m = missionById(ui.msg.primary); return m && m.demandePieces ? m.demandePieces.mode : ''; });
  const subj = await q.inputValue('#msg-subject');
  console.log('mail du bilan :', prim, '—', subj);
  const corps = await q.inputValue('#msg-body');
  expect(prim === 'bilan' && subj === 'EXEMPLE CONSEIL — pièces nécessaires pour votre bilan au 31/08/2027' && /^Afin d'établir votre bilan au 31\/08\/2027, nous avons besoin/m.test(corps) && !/Pour rappel/.test(corps),
    'mail ouvert depuis la demande du bilan : objet du bilan, une seule liste', `${prim} — ${subj}`);
  await q.click('#modal [data-action=close-modal]');
  // Série de plus de 6 000 factures (sans séquence détaillée) : numéros manquants d'après les trous transmis
  const miss = await q.evaluate(() => JSON.stringify(seriesMissing({ seq: null, gaps: [[5, 8, '2026-09-01', '2026-09-03'], [20, 22, '2026-10-01', '2026-10-05']] }, '2026-09-01', '2026-09-30')));
  expect(miss === '[[6,"2026-09-03"],[7,"2026-09-03"]]', 'numérotation sans séquence : trous du moteur', miss);

  console.log(ko ? `${ko} écart(s)` : 'Pièces manquantes cumulées : tous les contrôles sont conformes');
  console.log('erreurs', errors);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
