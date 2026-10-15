const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
const { fecTab, fecMonth } = require('./lib');
// Pièces à demander : opérations en compte d'attente rangées au choix en ventes et encaissements, factures fournisseurs ou
// opérations diverses (choix conservé dans le dossier), et liste Excel présentée comme un document remis au client.
// FEC de référence Pennylane (opérations bancaires en attente 4716 / 4717, TVA sur les encaissements).
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8765' });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  let ko = 0;
  const expect = (cond, label, info) => { if (cond) console.log(`OK ${label}`); else { ko++; console.log(`KO ${label}${info ? ' : ' + info : ''}`); } };
  await p.goto('http://localhost:8765/');
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!'); await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.click('a[data-nav=parametres]');
  await p.fill('input[name=cabinet]', 'Cabinet Martin & Associés'); await p.fill('input[name=utilisateur]', 'Quentin');
  await p.click('form[data-form=settings] button[type=submit]');
  await p.goto('http://localhost:8765/#/dossiers'); await p.click('main [data-action=new-client]');
  await p.fill('#modal input[name=nom]', 'EXEMPLE CONSEIL'); await p.fill('#modal input[name=siren]', '900000009');
  await p.fill('#modal input[name=contact]', 'Madame Exemple'); await p.fill('#modal input[name=email]', 'contact@exemple.fr');
  await p.click('#modal button[type=submit]'); await p.waitForSelector('.grid-detail');
  const load = async () => {
    await p.goto('http://localhost:8765/#/fec'); await p.waitForSelector('main [data-action=fec-pick]');
    const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('main [data-action=fec-pick] >> nth=0')]);
    await ch.setFiles(D + '900000009FEC20270831.txt'); await p.waitForSelector('.fec-meta');
    await fecTab(p, 'mois-pieces', 0); await fecMonth(p, '2026-09');
  };
  const groups = () => p.$$eval('.pieces-group', (g) => g.map((x) => ({
    h: x.querySelector('h3').firstChild.textContent.trim(),
    items: Array.from(x.querySelectorAll('.check.piece')).map((l) => {
      const row = l.closest('.piece-row');
      const sel = row && row.querySelector('select[data-piece-rub]');
      return { text: l.querySelector('span').textContent, rub: sel ? sel.value : null, compte: row ? row.querySelector('.badge').textContent : null };
    }),
  })));
  const find = (g, re) => g.flatMap((x) => x.items.map((i) => Object.assign({ h: x.h }, i))).find((i) => re.test(i.text));

  await load();
  let g = await groups();
  console.log(g.map((x) => `${x.h}\n   - ${x.items.map((i) => (i.rub ? `[${i.compte} → ${i.rub}] ` : '') + i.text).join('\n   - ')}`).join('\n'));
  expect(!g.some((x) => x.h === 'Opérations à identifier'), 'plus de rubrique « Opérations à identifier »');
  const att = g.flatMap((x) => x.items).filter((i) => i.rub);
  expect(att.length >= 3 && att.every((i) => /^47/.test(i.compte)), `${att.length} opérations en compte d'attente, chacune avec son menu de rubrique`);
  const parking = find(g, /PARKING CENTRE/);
  expect(parking && parking.h === 'Factures fournisseurs' && parking.rub === 'achats' && /^Facture correspondant au paiement « .*PARKING CENTRE.* » du \d\d\/\d\d\/2026 \([\d  ,]+ €\)$/.test(parking.text), 'paiement sans affectation connue : proposé en factures fournisseurs', parking && JSON.stringify(parking));
  const boul = find(g, /BOULANGERIE DU PORT/);
  expect(boul && boul.rub === 'achats', 'libellé déjà affecté à un fournisseur : factures fournisseurs', boul && JSON.stringify(boul));
  const options = await p.$$eval('select[data-piece-rub] >> nth=0', (s) => Array.from(s[0].options).map((o) => o.textContent));
  expect(options.join('|') === 'Ventes et encaissements|Factures fournisseurs|Opérations diverses', 'menu : ventes et encaissements, factures fournisseurs, opérations diverses', options.join('|'));
  await p.screenshot({ path: O + 'rubriques-1.png', fullPage: true });

  // Choix d'une autre rubrique : l'opération change de rubrique et de libellé
  const selPark = p.locator('.piece-row', { hasText: 'PARKING CENTRE' }).locator('select[data-piece-rub]');
  await selPark.selectOption('divers'); await p.waitForTimeout(150);
  g = await groups();
  let park2 = find(g, /PARKING CENTRE/);
  expect(park2 && park2.h === 'Opérations diverses' && /^Justificatif du paiement « .*PARKING CENTRE.* » du /.test(park2.text), 'rangée en opérations diverses', park2 && JSON.stringify(park2));
  // Une opération en factures fournisseurs passe en ventes et encaissements
  const other = att.find((i) => !/PARKING CENTRE/.test(i.text) && i.rub === 'achats');
  if (other) {
    const lib = other.text.match(/« (.*?) »/)[1];
    await p.locator('.piece-row', { hasText: lib }).locator('select[data-piece-rub]').selectOption('ventes'); await p.waitForTimeout(150);
    const moved = find(await groups(), new RegExp(lib.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    expect(moved && moved.h === 'Ventes et encaissements' && /^Avoir client correspondant au paiement « /.test(moved.text), 'paiement rangé en ventes : avoir client demandé', moved && JSON.stringify(moved));
    await p.locator('.piece-row', { hasText: lib }).locator('select[data-piece-rub]').selectOption('achats'); await p.waitForTimeout(150);
  }
  // Décocher une opération ne dépend pas de sa rubrique
  const cb = p.locator('.piece-row', { hasText: 'PARKING CENTRE' }).locator('input[data-piece]');
  await cb.uncheck(); await selPark.selectOption('achats'); await p.waitForTimeout(150);
  expect(!(await cb.isChecked()), 'opération décochée : reste décochée après un changement de rubrique');
  await cb.check(); await selPark.selectOption('divers'); await p.waitForTimeout(150);

  // Choix conservé dans le dossier : nouvelle analyse du même FEC
  await load();
  park2 = find(await groups(), /PARKING CENTRE/);
  expect(park2 && park2.h === 'Opérations diverses', 'rubrique retrouvée à la nouvelle analyse (conservée dans le dossier)', park2 && park2.h);

  // Mail et mission : rubrique « Opérations diverses »
  await p.click('button[data-action=pieces-demande]'); await p.waitForSelector('#msg-body');
  const body = await p.inputValue('#msg-body');
  console.log('=== MAIL\n' + body);
  expect(/Opérations diverses :\n- Justificatif du paiement « [^\n]*PARKING CENTRE/.test(body), 'mail : opération sous « Opérations diverses »');
  expect(!/Opérations à identifier/.test(body), 'mail : pas d\'« Opérations à identifier »');
  await p.click('#modal [data-action=close-modal]');
  // Changement de rubrique après la création : l'étape est mise à jour, pas doublée
  await fecTab(p, 'mois-pieces', 0); await fecMonth(p, '2026-09');
  await p.locator('.piece-row', { hasText: 'PARKING CENTRE' }).locator('select[data-piece-rub]').selectOption('achats'); await p.waitForTimeout(150);
  const before = await p.evaluate(() => data.missions.find((m) => m.demandePieces).etapes.length);
  await p.click('button[data-action=pieces-demande]'); await p.waitForSelector('#msg-body');
  const steps = await p.evaluate(() => data.missions.find((m) => m.demandePieces).etapes.filter((e) => /PARKING CENTRE/.test(e.label)).map((e) => `${e.cat} : ${e.label}`));
  const after = await p.evaluate(() => data.missions.find((m) => m.demandePieces).etapes.length);
  expect(steps.length === 1 && /^Factures fournisseurs : Facture correspondant au paiement/.test(steps[0]) && after === before, 'mission : étape mise à jour (rubrique et libellé), sans doublon', `${before} → ${after} ${JSON.stringify(steps)}`);
  await p.click('#modal [data-action=close-modal]');
  await fecTab(p, 'mois-pieces', 0); await fecMonth(p, '2026-09');
  await p.locator('.piece-row', { hasText: 'PARKING CENTRE' }).locator('select[data-piece-rub]').selectOption('divers'); await p.waitForTimeout(150);

  // Liste Excel pour le client
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button[data-action=pieces-xlsx]')]);
  const name = dl.suggestedFilename();
  const file = O + 'rubriques-documents.xlsx';
  await dl.saveAs(file);
  expect(name === 'Documents a fournir - EXEMPLE CONSEIL - comptabilite au 30 septembre 2026.xlsx', 'nom du fichier : client et période', name);
  const raw = fs.readFileSync(file).toString('utf8');
  const sheet = raw.slice(raw.indexOf('<worksheet'), raw.indexOf('</worksheet>') + 12);
  const texts = Array.from(sheet.matchAll(/<t xml:space="preserve">([^<]*)<\/t>/g)).map((m) => m[1]);
  console.log('=== EXCEL\n' + texts.join('\n'));
  expect(texts[0] === 'Documents à nous transmettre' && texts[1] === 'EXEMPLE CONSEIL — Comptabilité au 30 septembre 2026', 'en-tête : titre, client et période', texts.slice(0, 2).join(' | '));
  expect(/^Liste établie le \d\d\/\d\d\/\d{4} par Cabinet Martin &amp; Associés · réponse souhaitée avant le /.test(texts[2]), 'cabinet, date et échéance de la demande', texts[2]);
  expect(texts.includes('OPÉRATIONS DIVERSES  ·  1 document') && texts.some((t) => /^FACTURES FOURNISSEURS  ·  \d+ documents$/.test(t)), 'une rubrique par bandeau, avec son nombre de documents');
  expect(texts.some((t) => /^Justificatif du paiement «\u00a0.*PARKING CENTRE.*\u00a0»$/.test(t)), 'document sans date ni montant dans le texte (colonnes à part), guillemets insécables');
  expect(!texts.some((t) => /Opérations à identifier/.test(t)), 'Excel : pas d\'« Opérations à identifier »');
  expect(/showGridLines="0"/.test(sheet) && /<mergeCells count="\d+">/.test(sheet), 'sans quadrillage, cellules fusionnées');
  expect(/<dataValidation type="list"[^>]*sqref="E\d+:E\d+( E\d+:E\d+)*"><formula1>"Oui,Non,Sans objet"<\/formula1>/.test(sheet), 'colonne « Transmis » : menu Oui / Non / Sans objet');
  expect((sheet.match(/<cfRule type="cellIs"/g) || []).length === 3, 'colonne « Transmis » colorée selon la réponse');
  expect(/orientation="landscape" fitToWidth="1" fitToHeight="0"/.test(sheet) && /<oddFooter>&amp;LCabinet Martin &amp;&amp; Associés&amp;C/.test(sheet), 'mise en page : paysage, une page de large, pied de page');
  const dates = (sheet.match(/<c r="C\d+" s="21"><v>\d+<\/v>/g) || []).length;
  const amts = (sheet.match(/<c r="D\d+" s="22"><v>[\d.]+<\/v>/g) || []).length;
  expect(dates >= 5 && amts >= 5, `dates (${dates}) et montants (${amts}) dans leurs colonnes, au format date et monétaire`);
  expect(!/autoFilter/.test(sheet), 'pas de filtre automatique sur le document client');
  console.log(ko ? `${ko} écart(s)` : 'Rubriques des opérations en attente et liste Excel : tous les contrôles sont conformes');
  console.log('erreurs', errors);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
