const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
const { fecTab } = require('./lib');
// Contrôle de la TVA : chiffres de l'application comparés aux montants attendus calculés à la génération du FEC
// (tests/gen/gentva_pharma.py). Toute différence produit une ligne « KO », qui fait échouer la suite.
(async () => {
  const exp = JSON.parse(fs.readFileSync(D + '555555555-attendu.json', 'utf8'));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const PW = 'Cabinet-Test-2026!';
  await p.goto('http://localhost:8765/');
  await p.fill('input[name=p1]', PW); await p.fill('input[name=p2]', PW); await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.click('main [data-action=new-client]'); await p.fill('#modal input[name=nom]', 'PHARMACIE DES ARCADES'); await p.fill('#modal input[name=siren]', '555555555');
  await p.selectOption('#modal select[name=regimeTva]', 'Réel normal (mensuel)'); await p.click('#modal button[type=submit]'); await p.waitForSelector('.grid-detail');
  for (const per of ['04/2025', '09/2025']) {
    await p.click('main [data-action=new-mission]'); await p.selectOption('#modal select[name=type]', 'tva');
    await p.fill('#modal input[name=exercice]', per); await p.fill('#modal input[name=titre]', `TVA ${per}`); await p.click('#modal button[type=submit]'); await p.waitForTimeout(120);
  }
  await p.goto('http://localhost:8765/#/fec'); await p.waitForSelector('.fec-drop');
  const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('.fec-drop')]);
  await ch.setFiles(D + '555555555FEC20251231.txt'); await p.waitForSelector('.fec-meta');
  await fecTab(p, 'tva', 200); await p.waitForSelector('.tva-calc');
  let ko = 0;
  const eq = (label, a, b2) => { if (Math.abs((a || 0) - (b2 || 0)) > 0.011) { ko++; console.log(`KO ${label} : application ${a}, attendu ${b2}`); } };
  // Les douze mois
  for (const ym of Object.keys(exp.months).sort()) {
    await p.selectOption('select[data-tva=key]', ym); await p.waitForTimeout(80);
    const k = await p.evaluate(() => { const K = tvaData(ui.fec.result); return { o: K.o, liq: K.liq && Object.assign({}, K.liq, { list: undefined }), report: K.report, net: K.draft.net, rel: K.rel, labels: K.checks.filter((x) => x.level !== 'ok').map((x) => x.label) }; });
    const E = exp.months[ym], Dc = exp.decls[ym];
    Object.entries(E.coll).forEach(([rt, v]) => eq(`${ym} TVA collectée ${rt} %`, k.o.collRate[rt], v));
    eq(`${ym} TVA déductible`, k.o.ded, E.ded); eq(`${ym} TVA déductible immobilisations`, k.o.dedImmo, E.dedImmo);
    Object.entries(E.ca).forEach(([acc, v]) => eq(`${ym} produits ${acc}`, k.o.ca[acc], v));
    if (!k.liq) { ko++; console.log(`KO ${ym} : déclaration du ${Dc.date} non rattachée`); }
    else {
      if (k.liq.date !== Dc.date) { ko++; console.log(`KO ${ym} : déclaration rattachée du ${k.liq.date} au lieu du ${Dc.date}`); }
      ['coll', 'ded', 'dedImmo', 'due', 'creditNew', 'creditUsed'].forEach((f) => eq(`${ym} déclaration ${f}`, k.liq[f], Dc[f]));
    }
    console.log(`${ym} : collectée ${k.o.coll} · déductible ${round(k.o.ded + k.o.dedImmo)} · crédit imputé ${k.report} · net ${k.net} · OD ${k.liq ? k.liq.date : '—'} · reliquats ${JSON.stringify(k.rel)}\n    points : ${k.labels.join(' | ') || '—'}`);
  }
  function round(x) { return Math.round(x * 100) / 100; }
  // Anomalies attendues
  const labelsOf = async (ym) => { await p.selectOption('select[data-tva=key]', ym); await p.waitForTimeout(80); return p.evaluate(() => tvaData(ui.fec.result).checks.filter((x) => x.level !== 'ok').map((x) => x.label + ' :: ' + (x.examples || []).join(' / '))); };
  const has = (list, re, label) => { if (!list.some((x) => re.test(x))) { ko++; console.log(`KO ${label} non signalé`); } else console.log(`OK ${label}`); };
  has(await labelsOf('2025-03'), /Déclaration comptabilisée différente/, 'mars : facture saisie après la déclaration');
  has(await labelsOf('2025-04'), /TVA déductible des périodes précédentes restée en compte : 718,38/, 'avril : reliquat de TVA déductible de 718,38 €');
  has(await labelsOf('2025-06'), /chiffre d'affaires × taux.*5,5 %/, 'juin : TVA à 5,5 % comptée à 2,1 %');
  has(await labelsOf('2025-06'), /TVA ne correspond pas au taux du compte :: .*12\/06\/2025/, 'juin : écriture du 12/06 en cause');
  const oct = await labelsOf('2025-10');
  has(oct, /Ventes sans TVA sur des comptes taxables :: .*08\/10\/2025/, 'octobre : vente sans TVA du 08/10');
  has(oct, /chiffre d'affaires × taux.*20 % : base .*écart [-−]9[5-7],\d\d/, 'octobre : écart d\'environ 96 € à 20 %');
  has(await labelsOf('2025-08'), /remboursement possible/, 'août : crédit remboursable');
  // Paramétrage : honoraires à 2,1 % (constaté), ROSP hors champ
  const roles = await p.evaluate(() => { const M = tvaModel(ui.fec.result); return { hon: M.ca['706100'].role, honSrc: M.ca['706100'].src, rosp: M.ca['708800'].role, v20: M.ca['707020'].role }; });
  console.log('rôles :', JSON.stringify(roles));
  if (roles.hon !== 2.1 || roles.rosp !== 'hc' || roles.v20 !== 20) { ko++; console.log('KO taux des comptes de produits'); }
  // Écran : tableau de calcul de septembre (crédit d'août imputé)
  await p.selectOption('select[data-tva=key]', '2025-09'); await p.waitForTimeout(100);
  console.log('septembre :\n  ' + (await p.$$eval('.tva-calc tbody tr', (l) => l.map((r) => Array.from(r.cells).map((c) => c.textContent.trim()).join(' | ')))).join('\n  '));
  // Paramétrage modifié : ROSP passée en « non imposable » puis remise en automatique
  if (!(await p.isVisible('select[data-tvap=ca][data-c="708800"]'))) await p.click('section.card:has(h2:text("Paramétrage des comptes")) summary');
  await p.selectOption('select[data-tvap=ca][data-c="708800"]', 'exo'); await p.waitForTimeout(150);
  console.log('ROSP en non imposable :', await p.evaluate(() => tvaData(ui.fec.result).nonTax.exo || 0), '| conservé dans le dossier :', await p.evaluate(() => JSON.stringify(data.clients[0].tvaParams)));
  await p.click('button[data-action=tvap-reset][data-c="708800"]'); await p.waitForTimeout(150);
  console.log('remis en automatique :', await p.evaluate(() => tvaModel(ui.fec.result).ca['708800'].role));
  // Trimestre : déclarations mensuelles signalées
  await p.click('button[data-action=tva-kind][data-kind=quarter]'); await p.waitForTimeout(150);
  console.log('trimestre :', await p.evaluate(() => { const K = tvaData(ui.fec.result); return `${K.per.label} · collectée ${K.o.coll} · ${K.checks.filter((x) => /mensuelles/.test(x.label)).map((x) => x.label).join('')}`; }));
  await p.click('button[data-action=tva-kind][data-kind=month]'); await p.waitForTimeout(150);
  // Validation : montant noté dans la mission du suivi mensuel
  await p.selectOption('select[data-tva=key]', '2025-04'); await p.waitForTimeout(100);
  await p.click('button[data-action=tva-validate]'); await p.waitForTimeout(200);
  console.log('validation :', await p.textContent('#toast'));
  console.log('mission TVA 04/2025 :', await p.evaluate(() => tvaNetLabel(data.missions.find((m) => m.titre === 'TVA 04/2025'))));
  // Exports
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button[data-action=tva-xlsx]').then(() => p.click('#ask button[type=submit]'))]);
  await dl.saveAs(O + 'controle-tva-pharma.xlsx');
  const xml = fs.readFileSync(O + 'controle-tva-pharma.xlsx').toString('utf8');
  console.log('export :', (xml.match(/<sheet name="[^"]+"/g) || []).join(' '));
  await p.screenshot({ path: O + 'tvactl.png', fullPage: true });
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(200);
  console.log('débordement mobile :', await p.evaluate(() => Array.from(document.querySelectorAll('main *')).filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('.grid-wrap, .viz-scroll, .fec-tabs')).slice(0, 5).map((e) => e.tagName + '.' + e.className)));
  console.log(ko ? `${ko} écart(s)` : 'tous les montants concordent');
  console.log('erreurs', errors);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
