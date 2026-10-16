const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const O = path.join(__dirname, '../out/');
const { fecTab, fecMonth } = require('./lib');
// Comptes d'attente soldés dans le moteur : à-nouveau repris par une OD, reclassement un pour un, OD regroupant les opérations
// du mois, lignes lettrées, facture passée en attente (ni banque ni caisse), et plus de 3 000 lignes ouvertes (les plus
// récentes gardées). FEC au format ACD généré ici, données fictives (SIREN 911111119, exercice 2025).
const DIR = path.join(O, 'attente');
fs.mkdirSync(DIR, { recursive: true });
const FEC = path.join(DIR, '911111119FEC20251231.txt');
const rows = [['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise']];
let num = 0;
const fr = (x) => x.toFixed(2).replace('.', ',');
// Écriture équilibrée : [compte, libellé du compte, débit, crédit, lettrage]
const entry = (jc, jl, date, lib, lines) => {
  num++;
  lines.forEach(([compte, clib, d, c, let_]) => rows.push([jc, jl, String(num), date.replace(/-/g, ''), compte, clib, '', '', `P${num}`, date.replace(/-/g, ''), lib, fr(d), fr(c), let_ || '', let_ ? date.replace(/-/g, '') : '', '20260115', '', '']));
};
const BQ = ['BQ', 'Banque'], OD = ['OD', 'Opérations diverses'], AN = ['AN', 'A nouveaux'];
const att = (d, c, let_) => ['471000', "Compte d'attente", d, c, let_];
const bank = (d, c) => ['512000', 'Banque', d, c];
entry(...AN, '2025-01-01', 'A nouveau', [att(300, 0), ['101000', 'Capital', 0, 300]]);
entry(...OD, '2025-01-02', 'Reprise à-nouveau attente', [['625100', 'Déplacements', 300, 0], att(0, 300)]);
entry(...BQ, '2025-02-10', 'PRLV PAIRE 120', [att(120, 0), bank(0, 120)]);
entry(...OD, '2025-02-20', 'Reclassement PAIRE', [['606300', 'Fournitures', 120, 0], att(0, 120)]);
[['2025-03-05', 40], ['2025-03-10', 25], ['2025-03-15', 35]].forEach(([dt, a]) => entry(...BQ, dt, `CB MOIS ${a}`, [att(a, 0), bank(0, a)]));
entry(...OD, '2025-03-30', 'Reclassement du mois', [['606300', 'Fournitures', 100, 0], att(0, 100)]);
entry(...BQ, '2025-04-10', 'VIR LETTRE 50', [att(50, 0, 'AA'), bank(0, 50)]);
entry(...OD, '2025-04-20', 'Reclassement lettré', [['606300', 'Fournitures', 50, 0], att(0, 50, 'AA')]);
// 3 100 petites opérations de banque restées en attente, de juillet à novembre
for (let i = 0; i < 3100; i++) {
  const dt = new Date(Date.UTC(2025, 6, 1) + Math.floor(i * 153 / 3100) * 86400000).toISOString().slice(0, 10);
  entry(...BQ, dt, `CB DIVERS ${i}`, [att(10 + (i % 50) + 0.37, 0), bank(0, 10 + (i % 50) + 0.37)]);
}
// Compte 472000 : OD rapprochée seulement dans sa fenêtre (mois de l'OD et précédent)
const att2 = (d, c) => ['472000', "Compte d'attente 2", d, c];
entry(...BQ, '2025-02-05', 'VIR INCONNU 33', [att2(33, 0), bank(0, 33)]); // jamais identifiée
[['2025-05-05', 20], ['2025-05-10', 25]].forEach(([dt, a]) => entry(...BQ, dt, `CB MAI ${a}`, [att2(a, 0), bank(0, a)]));
entry(...OD, '2025-05-31', 'Reclassement mai', [['606300', 'Fournitures', 45, 0], att2(0, 45)]);
[['2025-11-03', 13], ['2025-11-10', 20]].forEach(([dt, a]) => entry(...BQ, dt, `CB NOV ${a}`, [att2(a, 0), bank(0, a)]));
entry(...OD, '2025-11-30', 'Reclassement novembre', [['606300', 'Fournitures', 33, 0], att2(0, 33)]);
entry(...BQ, '2025-12-03', 'PRLV INCONNU 45', [att2(45, 0), bank(0, 45)]); // même montant que l'OD de mai
// Compte 473000 : deux opérations de banque de sens opposé ne se soldent pas entre elles
const att3 = (d, c) => ['473000', "Compte d'attente 3", d, c];
entry(...BQ, '2025-01-05', 'B1 100', [att3(100, 0), bank(0, 100)]);
entry(...OD, '2025-01-31', 'OD1 100', [['606300', 'Fournitures', 100, 0], att3(0, 100)]);
entry(...BQ, '2025-02-03', 'B2 SORTIE 50', [att3(50, 0), bank(0, 50)]);
entry(...BQ, '2025-02-10', 'B3 ENTREE 50', [bank(50, 0), att3(0, 50)]);
entry(...BQ, '2025-03-01', 'B4 70', [att3(70, 0), bank(0, 70)]);
entry(...OD, '2025-03-15', 'OD2 70', [['606300', 'Fournitures', 70, 0], att3(0, 70)]);
entry(...BQ, '2025-04-01', 'B5 30', [att3(30, 0), bank(0, 30)]);
entry(...BQ, '2025-12-20', 'PRLV OUVERTE 75', [att(75, 0), bank(0, 75)]);
entry(['HA', 'Achats'][0], 'Achats', '2025-12-22', 'Facture ACHAT EN ATTENTE', [['606300', 'Fournitures', 200, 0], ['445660', 'TVA déductible', 40, 0], att(0, 240)]);
entry(['VT', 'Ventes'][0], 'Ventes', '2025-12-23', 'Facture VENTE 1', [['411000', 'Clients', 1200, 0], ['706000', 'Prestations', 0, 1000], ['445710', 'TVA collectée', 0, 200]]);
fs.writeFileSync(FEC, rows.map((r) => r.join('\t')).join('\n') + '\n');

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' })).newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  let ko = 0;
  const expect = (cond, label, info) => { if (cond) console.log(`OK ${label}`); else { ko++; console.log(`KO ${label}${info ? ' : ' + info : ''}`); } };
  await p.goto('http://localhost:8765/');
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!'); await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.goto('http://localhost:8765/#/fec'); await p.waitForSelector('.fec-drop');
  const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('.fec-drop')]);
  await ch.setFiles(FEC); await p.waitForSelector('.fec-meta', { timeout: 60000 });
  const x = await p.evaluate(() => {
    const pc = ui.fec.result.pieces;
    return { n: pc.attente.length, libs: pc.attente.map((l) => l.lib), mois: pc.attenteMois || {}, dec: pc.attente.filter((l) => l.date >= '2025-12-01').map((l) => `${l.lib}:${l.bank}`), trunc: pc.trunc || {}, max: pc.attenteMax,
      first: pc.attente[0] && pc.attente[0].date, last: pc.attente[pc.attente.length - 1].date, dl: (pc.directLines[0] || []).length, unm: pc.unmatched.every((u) => typeof u.brut === 'number') };
  });
  console.log(JSON.stringify({ n: x.n, dec: x.dec, trunc: x.trunc, first: x.first, last: x.last }));
  const settled = ['Reprise à-nouveau attente', 'PRLV PAIRE 120', 'Reclassement PAIRE', 'CB MOIS 40', 'CB MOIS 25', 'CB MOIS 35', 'Reclassement du mois', 'VIR LETTRE 50', 'Reclassement lettré'];
  expect(!settled.some((s) => x.libs.includes(s)), 'lignes soldées écartées : à-nouveau repris, paire, OD du mois, lettrage', settled.filter((s) => x.libs.includes(s)).join(', '));
  expect(x.dec.includes('PRLV OUVERTE 75:true') && x.dec.includes('Facture ACHAT EN ATTENTE:false'), 'décembre : opération ouverte et facture passée en attente (hors banque)', x.dec.join(' | '));
  expect(x.dec.includes('PRLV INCONNU 45:true') && !x.mois['2025-05'], "OD de mai : soldée avec les opérations de mai, pas avec celle de décembre du même montant", JSON.stringify(x.mois));
  expect(!x.libs.some((l) => /^CB NOV|Reclassement novembre/.test(l)), "OD de novembre : soldée avec les opérations du mois, pas avec celle de février du même montant");
  expect(x.mois['2025-02'] === 3 && x.mois['2025-04'] === 1 && !x.mois['2025-03'] && !x.mois['2025-01'], 'opération de février jamais identifiée et opérations de banque opposées restées ouvertes', JSON.stringify(x.mois));
  expect(x.n === 3000 && x.max && x.trunc.att && x.trunc.att === x.first && x.last === '2025-12-22', 'plus de 3 000 lignes ouvertes : les 3 000 plus récentes, date de coupure indiquée', `${x.n} ${x.trunc.att} ${x.first}`);
  expect(Object.values(x.mois).reduce((t, n) => t + n, 0) === 3107, 'décompte par mois de toutes les lignes ouvertes, avant troncature', JSON.stringify(x.mois));
  expect(x.dl === 0 || x.dl === 6, 'dépenses directes : montant payé en banque transmis');
  expect(x.unm, 'paiements sans facture : montant brut transmis');
  // Contrôles de saisie de décembre : les lignes ouvertes du mois et le rappel des mois précédents
  await fecTab(p, 'mois-saisie', 0); await fecMonth(p, '2025-12');
  const ctl = await p.$$eval('.fec-check', (l) => l.map((e) => e.textContent.replace(/\s+/g, ' ')).filter((t) => /compte d'attente/i.test(t)).join(' || '));
  console.log('contrôle :', ctl.slice(0, 400));
  expect(/3 ligne\(s\) du mois sur les comptes 471 à 478 encore ouverte\(s\) \(ni lettrée\(s\), ni reclassée\(s\)\), dont 2 opération\(s\) de banque ou de caisse/.test(ctl) && /3104 autre\(s\) ligne\(s\) des mois précédents/.test(ctl), 'contrôle du mois : lignes ouvertes, opérations de banque, mois précédents (décompte avant troncature)');
  // Pièces manquantes de décembre : l'opération ouverte, pas la facture passée en attente
  await fecTab(p, 'mois-pieces', 0); await fecMonth(p, '2025-12');
  const pieces = await p.evaluate(() => computePieces(ui.fec.result, 'mois', '2025-12-31').filter((i) => i.src === 'attente').map((i) => i.text));
  expect(pieces.some((t) => /PRLV OUVERTE 75/.test(t)) && !pieces.some((t) => /ACHAT EN ATTENTE/.test(t)), 'pièces : opération de banque demandée, facture en attente non demandée');
  const banner = await p.textContent('main');
  expect(/Liste partielle \(fichier volumineux\) : comptes d'attente antérieur\(e\)s au/.test(banner), 'liste tronquée signalée');
  console.log(ko ? `${ko} écart(s)` : "Comptes d'attente : tous les contrôles sont conformes");
  console.log('erreurs', errors);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
