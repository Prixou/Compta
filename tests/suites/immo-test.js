// Cycle G : rapprochement du FEC de l'analyse avec l'état des immobilisations du module immo (tests/gen/genimmo.py, données
// inventées) : PDF sur deux pages (zéros en blanc sur la seconde) et même état en texte collé.
const { chromium } = require('playwright');
const path = require('path');
const D = path.join(__dirname, '../fixtures/immo/');
const O = path.join(__dirname, '../out/');
const fs = require('fs');
const { fecTab } = require('./lib');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8765' });
  const p = await ctx.newPage();
  const errors = [];
  const ko = (cond, msg) => console.log(`${cond ? 'OK' : 'KO'} ${msg}`);
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  const BASE = process.env.BASE || 'http://localhost:8765/';
  await p.goto(BASE);
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!');
  await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.click('main [data-action=new-client]');
  await p.fill('#modal input[name=nom]', 'SAS ATELIER FICTIF'); await p.selectOption('#modal select[name=forme]', 'SAS');
  await p.fill('#modal input[name=siren]', '700000007'); await p.click('#modal button[type=submit]'); await p.waitForSelector('.grid-detail');
  await p.goto(BASE + '#/fec'); await p.waitForSelector('.fec-drop');
  let [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('.fec-drop')]);
  await ch.setFiles(D + '700000007FEC20261231.txt'); await p.waitForSelector('.fec-meta');
  await fecTab(p, 'immo', 0); await p.waitForTimeout(120);
  const checks = () => p.$$eval('.fec-checks .fec-check', (l) => l.map((x) => x.querySelector('.lvl').textContent + ' ' + x.querySelector('strong').textContent));
  ko((await checks()).some((x) => /Information Rapprochement avec l’état des immobilisations à faire/.test(x)), 'cycle G : rapprochement à faire');

  ko(/Rapprochement avec l’état des immobilisations du module immo à faire/.test(await p.textContent('main')), 'cycle G : renvoi vers l’onglet Immobilisations');

  // 1. Onglet Immobilisations de l'Espace FEC, état en PDF : le FEC de l'analyse est relu
  await fecTab(p, 'immo-etat');
  [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-action=immo-etat-pick]')]);
  await ch.setFiles(D + 'etat-immobilisations.pdf');
  await p.waitForSelector('.ie-verdict'); await p.waitForTimeout(150);
  const head = (await p.textContent('.ie > p.muted:nth-of-type(2)')).replace(/\s+/g, ' ');
  ko(/SAS ATELIER FICTIF · exercice du 01\/01\/2026 au 31\/12\/2026 · 7 comptes, 14 fiches Lecture contrôlée sur les sous-totaux/.test(head), `état lu, contrôlé sur les sous-totaux : ${head}`);
  const res = () => p.evaluate(() => {
    const r = ui.fec.immoEtat.res;
    return { missing: r.missing.map((m) => `${m.compte} ${m.amt} ${m.supplier} ${m.tva} ${m.ttc} ${m.hints.map((h) => h.type + ':' + (h.code || '')).join(',')}`),
      extra: r.extraCredits.map((m) => `${m.compte} ${m.amt}`), orph: r.orphanFiches.map((f) => `${f.code} ${f.acctStatus}`), sorties: r.orphanSorties.map((f) => f.code),
      matched: r.matched.map((g) => `${g.acct} ${g.type} ${g.kind}`), rows: r.rows.map((x) => `${x.n} ${x.ecart} ${x.residual} ${x.status}`), totals: r.totals };
  });
  const R = await res();
  console.log(JSON.stringify(R));
  ko(JSON.stringify(R.missing) === JSON.stringify(['215400 340000 OUTILLAGE IMAGINAIRE 68000 408000 ', '218100 185000 ELEC INVENTEE 37000 222000 otherAcct:B26002']), 'écritures sans fiche : fraiseuse (2154) et tableau électrique (2181, même montant sur une fiche du 2183)');
  ko(JSON.stringify(R.matched) === JSON.stringify(['2135 acq 1-n', '2154 acq 1-1', '2154 acq n-1', '2182 sor 1-1', '2183 acq 1-1']), 'rapprochements : facture ventilée sur deux fiches, deux factures sur une fiche, cession');
  ko(JSON.stringify(R.extra) === '["218400 -30000"]' && JSON.stringify(R.sorties) === '["L00002"]' && JSON.stringify(R.orph) === '["B26002 open"]', 'avoir sans sortie, sortie sans écriture, fiche sans écriture');
  ko(JSON.stringify(R.rows) === JSON.stringify(['205 150000 150000 open', '2135 0 0 ok', '2154 340000 0 explained', '2181 185000 0 explained', '2182 0 0 ok', '2183 -185000 -185000 open', '2184 -30000 0 explained'])
    && R.totals.missingHT === 525000 && R.totals.residual === -35000, 'contrôle par compte : écarts expliqués ou à expliquer');
  ko(/Même montant sur la fiche B26002 \(compte 2183000000\)/.test(await p.textContent('.ie')), 'indice affiché sur l’écriture sans fiche');
  await p.screenshot({ path: O + 'immo-g.png', fullPage: true });

  // 2. Copie pour Excel
  await p.click('[data-action=immo-etat-copy][data-what=missing]'); await p.waitForTimeout(150);
  const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ko(clip.split('\n').length === 3 && clip.includes('20/05/2026\tAC\t6\tOF-520\tOUTILLAGE IMAGINAIRE\tOUTILLAGE IMAGINAIRE - FRAISEUSE\t215400\t3400,00\t680,00\t4080,00'), 'écritures sans fiche copiées pour un tableur');

  // 3. Synthèse enregistrée : contrôles du cycle G, pièce établie, colonne « Selon pièce »
  await fecTab(p, 'immo');
  const c1 = await checks();
  console.log('contrôles :\n  ' + c1.join('\n  '));
  ko(c1.some((x) => /À vérifier 2 acquisitions sans fiche dans le module immo/.test(x)) && c1.some((x) => /À vérifier 2050000000 LOGICIELS : écart avec l’état des immobilisations/.test(x))
    && c1.some((x) => /À vérifier 2183000000 MATERIEL DE BUREAU : écart avec l’état/.test(x)) && !c1.some((x) => /à faire/.test(x)), 'contrôles du cycle G repris du rapprochement');
  const docs = await p.$$eval('.cyc-docs li', (l) => l.filter((x) => /Tableau des immobilisations/.test(x.textContent)).map((x) => x.querySelector('select').selectedOptions[0].textContent));
  ko(docs.length === 1 && docs[0] === 'Édition lue', `pièce « Tableau des immobilisations » : ${docs}`);
  const soldes = await p.evaluate(() => JSON.stringify(wpSoldeStore()));
  ko(soldes === '{"205000":3000,"213500":62000,"215400":48500,"218100":25000,"218200":0,"218300":11140,"218400":5000}', `valeur brute de l’état dans « Selon pièce » ${soldes}`);
  ko(await p.evaluate(() => clientBySiren('700000007').revision['2026-12-31'].immoEtat.missing.length === 2), 'synthèse enregistrée dans le dossier');

  // 4. Nouvelle session sur l'analyse (détail effacé) : synthèse affichée ; puis texte collé, même résultat
  await fecTab(p, 'immo-etat');
  await p.evaluate(() => { ui.fec.immoEtat = null; refresh(); });
  ko(/Rapprochement fait le .* avec etat-immobilisations\.pdf : 2 écriture\(s\) sans fiche \(5 250,00 € HT\), 2 compte\(s\) en écart/.test((await p.textContent('.ie')).replace(/[  ]/g, ' ')), 'synthèse enregistrée affichée');
  await p.click('.ie-paste summary');
  await p.fill('[data-ie-text]', fs.readFileSync(D + 'etat-immobilisations.txt', 'utf8'));
  await p.click('[data-action=immo-etat-text]'); await p.waitForSelector('.ie-verdict'); await p.waitForTimeout(150);
  const R2 = await res();
  ko(JSON.stringify(R2) === JSON.stringify(R), 'texte collé : même rapprochement que le PDF');

  // 5. Mauvais fichier
  [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-action=immo-etat-pick]')]);
  await ch.setFiles(path.join(__dirname, '../fixtures/silae/silae-journal-de-paie.pdf')); await p.waitForTimeout(400);
  ko(/silae-journal-de-paie\.pdf : aucune ligne « Compte n° »/.test(await p.textContent('.ie .banner.warn')), 'PDF qui n’est pas un état : refusé');

  // 6. Téléphone
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  ko(await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 1, 'téléphone : pas de débordement horizontal');
  console.log('erreurs', errors);
  await b.close();
})();
