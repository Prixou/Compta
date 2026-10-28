// Dossier de révision : cycles A à K (rangement des comptes, contrôles, comptes du cycle, pièces du cycle, dossier de travail).
const { chromium } = require('playwright');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
const { fecTab } = require('./lib');
const CYCLES = ['regul', 'treso', 'achats', 'charges', 'clients', 'stocks', 'immo', 'social', 'etat', 'capitaux', 'autres'];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const p = await ctx.newPage();
  const errors = [];
  const ko = (cond, msg) => console.log(`${cond ? 'OK' : 'KO'} ${msg}`);
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await p.goto(process.env.BASE || 'http://localhost:8765/');
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!');
  await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.click('main [data-action=new-client]');
  await p.fill('#modal input[name=nom]', 'SARL DOSSIER'); await p.selectOption('#modal select[name=forme]', 'SARL');
  await p.fill('#modal input[name=siren]', '123456789'); await p.click('#modal button[type=submit]'); await p.waitForSelector('.grid-detail');
  await p.goto((process.env.BASE || 'http://localhost:8765/') + '#/fec'); await p.waitForSelector('.fec-drop');
  let [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('.fec-drop')]);
  await ch.setFiles(D + '123456789FEC20251231.txt'); await p.waitForSelector('.fec-meta');

  // Rangement des comptes
  const map = await p.evaluate(() => ['471000', '580000', '512000', '627000', '164000', '455000', '401000', '607000', '765000', '606100', '613200', '651000', '654000', '655000', '411000', '491000', '681700', '706000', '370000', '603700', '218200', '681100', '775000', '421000', '645000', '445710', '635110', '671200', '695000', '101000', '120000', '151000', '681500', '741000', '467000', '486000', '671800', '758000', '890000'].map((c) => `${c}:${cycleOf(c) ? CYCLE_DEF[cycleOf(c)].l : '-'}`).join(' '));
  console.log('rangement :', map);
  ko(map === '471000:A 580000:A 512000:B 627000:B 164000:B 455000:B 401000:C 607000:C 765000:C 606100:D 613200:D 651000:D 654000:E 655000:K 411000:E 491000:E 681700:E 706000:E 370000:F 603700:F 218200:G 681100:G 775000:G 421000:H 645000:H 445710:I 635110:I 671200:I 695000:I 101000:J 120000:J 151000:J 681500:J 741000:J 467000:K 486000:K 671800:K 758000:K 890000:-', 'rangement des comptes A à K');

  // Onglets, tuiles de la synthèse et barre des cycles
  const tabs = await p.$$eval('.fec-tabs button', (x) => x.map((y) => y.textContent).join(' · '));
  console.log('onglets :', tabs);
  ko(/Cycles A à K/.test(tabs) && !/Achats|Trésorerie/.test(tabs), 'un seul onglet pour les cycles');
  const tiles = await p.$$eval('.cycle-tile', (k) => k.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  console.log('tuiles :\n  ' + tiles.join('\n  '));
  ko(tiles.length === 11 && /^\d+A · Régularité/.test(tiles[0]) && /K · Autres comptes/.test(tiles[10]), '11 tuiles A à K');
  await p.click('.fec-tabs button[data-tab="cycles"]'); await p.waitForTimeout(150);
  const bar = await p.$$eval('.fec-cycles button', (x) => x.map((y) => y.textContent.trim()));
  console.log('barre :', bar.join(' | '));
  ko(bar.length === 11, 'barre des cycles');

  // Chaque cycle : contrôles, comptes, pièces
  for (const k of CYCLES) {
    await fecTab(p, k, 0); await p.waitForTimeout(120);
    const head = await p.$eval('.fec-cycles button.on', (x) => x.textContent.trim());
    const checks = await p.$$eval('.fec-checks .fec-check', (l) => l.map((x) => x.querySelector('.lvl').textContent + ' ' + x.querySelector('strong').textContent));
    const accts = await p.$$eval('.cyc-acc tbody tr:not(.strong)', (l) => l.map((x) => Array.from(x.cells).slice(0, 5).map((c) => c.textContent.trim()).join(' ')));
    const docs = await p.$$eval('.cyc-docs li', (l) => l.map((x) => x.querySelector('.cyc-doc-text').textContent.replace(/\s+/g, ' ').trim()));
    console.log(`\n=== ${head}\n contrôles : ${checks.join(' | ')}\n comptes (${accts.length}) : ${accts.slice(0, 6).join(' / ')}\n pièces : ${docs.join(' | ')}`);
    await p.screenshot({ path: O + `dossier-${k}.png`, fullPage: true });
  }

  // Cycle A : comptes d'attente soldés et 471 vide (un seul point), virements internes
  const att = await p.evaluate(() => {
    const r = ui.fec.result; const cc = cycleChecks(r);
    const list = cc.regul.filter((x) => /attente/.test(x.label)).map((x) => `${x.level} ${x.label} (${x.examples.length})`);
    // 471 soldé mais mouvementé : point « Écritures passées en compte d'attente »
    const b = r.balance.find((x) => x.compte.startsWith('471')); const s = b.s; b.s = 0; delete r._cc;
    const solde = cycleChecks(r).regul.filter((x) => /attente/.test(x.label)).map((x) => `${x.level} ${x.label}`);
    b.s = s; delete r._cc;
    return { list, solde };
  });
  console.log('comptes d\'attente :', JSON.stringify(att));
  ko(att.list.length === 1 && /^error Comptes d'attente non soldés \([1-9]/.test(att.list[0]) && att.solde.join() === "warn Écritures passées en compte d'attente", 'A : comptes d\'attente soldés et 471 vide');

  // Cycle J : capital, résultat N-1 et pièces
  await fecTab(p, 'capitaux', 0); await p.waitForTimeout(120);
  const j = await p.$$eval('.cyc-docs li', (l) => l.map((x) => x.textContent));
  ko(j.some((t) => /Procès-verbal d'approbation/.test(t)), 'J : procès-verbal d\'approbation demandé');

  // Compte justifié et pièce reçue : compteurs mis à jour et conservés dans le dossier
  await fecTab(p, 'treso', 0); await p.waitForTimeout(120);
  const before = await p.$eval('.cyc-acc', (t) => t.closest('.card').querySelector('h2 .count').textContent);
  await p.check('.cyc-acc input[data-wpacc]'); await p.waitForTimeout(150);
  const after = await p.$eval('.cyc-acc', (t) => t.closest('.card').querySelector('h2 .count').textContent);
  ko(Number(after) === Number(before) - 1 || Number(before) === 0, `compte justifié : ${before} → ${after}`);
  await p.fill('.cyc-acc input[data-comment]', 'Relevé au 31/12 rapproché'); await p.press('.cyc-acc input[data-comment]', 'Tab'); await p.waitForTimeout(100);
  const docsB = await p.$$eval('.cyc-docs select', (s) => s.length);
  if (docsB) {
    await p.selectOption('.cyc-docs select >> nth=0', 'recu'); await p.waitForTimeout(150);
    ko(await p.$eval('.cyc-docs li', (li) => li.classList.contains('done')), 'pièce marquée reçue');
  }
  const store = await p.evaluate(() => { const st = wpStore(); return { comptes: Object.keys(st.comptes || {}).length, docs: Object.keys(st.docs || {}).length, com: Object.values(revueComments().comments).filter(Boolean).length }; });
  ko(store.comptes === 1 && store.com === 1 && store.docs === (docsB ? 1 : 0), `feuille de travail : ${JSON.stringify(store)}`);

  // Cycle B : solde selon la pièce (relevé bancaire) — écart nul : compte justifié ; écart : affiché, compte à justifier
  const cnt = () => p.$eval('.cyc-acc', (t) => Number(t.closest('.card').querySelector('h2 .count').textContent));
  const n0 = await cnt();
  await p.fill('input[data-wpsolde="512000"]', '78 728,64'); await p.press('input[data-wpsolde="512000"]', 'Tab'); await p.waitForTimeout(150);
  const ok512 = await p.$eval('input[data-wpacc="512000"]', (x) => x.checked && x.disabled);
  ko(ok512 && (await cnt()) === n0 - 1, `banque justifiée par le relevé (écart nul) : ${n0} → ${await cnt()}`);
  await p.fill('input[data-wpsolde="512000"]', '78 700'); await p.press('input[data-wpsolde="512000"]', 'Tab'); await p.waitForTimeout(150);
  const ec = await p.$eval('input[data-wpsolde="512000"]', (x) => x.closest('tr').cells[7].textContent.trim());
  ko(/^\+28,64$/.test(ec) && (await cnt()) === n0, `écart avec le relevé affiché : ${ec}`);
  // Compte courant débiteur (un seul point, dans le cycle B), caisse de plus de 10 000 €
  const cb = await p.evaluate(() => {
    const r = ui.fec.result; const cc = cycleChecks(r);
    const cca = cc.treso.filter((x) => /Compte courant/.test(x.label)).map((x) => `${x.level} ${x.label} : ${x.examples.join(' / ')}`);
    const gen = genPoints(r).filter((x) => /Compte courant/.test(x.label)).length;
    const c = r.cycles.treso.accounts.find((a) => a.compte.startsWith('53')); const s0 = c.solde; c.solde = 12000; delete r._cc;
    const caisse = cycleChecks(r).treso.filter((x) => /caisse élevé/.test(x.label)).map((x) => `${x.level} ${x.label}`);
    c.solde = s0; delete r._cc;
    return { cca, gen, caisse };
  });
  console.log('cycle B :', JSON.stringify(cb));
  ko(cb.cca.length === 1 && /^error .*455000 .*débiteur/.test(cb.cca[0]) && cb.gen === 0, 'B : compte courant débiteur dans le cycle B seulement');
  ko(cb.caisse.join() === 'warn Solde de caisse élevé', 'B : caisse de plus de 10 000 €');
  // Compte courant et caisse : solde à la date de révision seulement (débiteur ou négative en cours d'exercice : rien)
  const atDate = await p.evaluate(() => {
    const r = ui.fec.result; const b = r.balance.find((x) => x.compte === '455000'); const s0 = b.s;
    const c = r.cycles.treso.accounts.find((x) => x.compte.startsWith('53')); const c0 = c.solde;
    b.s = -500; delete r._cc;
    const ok = cycleChecks(r).treso.filter((y) => /Compte courant|Caisse créditrice/.test(y.label)).map((y) => `${y.level} ${y.label}`);
    c.solde = -120; delete r._cc;
    const neg = cycleChecks(r).treso.filter((y) => /Caisse créditrice/.test(y.label)).map((y) => `${y.level} ${y.label} : ${y.examples.join(' / ')}`);
    b.s = s0; c.solde = c0; delete r._cc;
    return { ok, neg, gen: genPoints(r).filter((y) => /Caisse créditrice/.test(y.label)).length };
  });
  console.log('date de révision :', JSON.stringify(atDate));
  ko(atDate.ok.join() === "ok Compte courant d'associé non débiteur" && atDate.gen === 0 && /^error Caisse créditrice : 530000/.test(atDate.neg.join()), 'B : compte courant et caisse contrôlés à la date de révision');

  // Points généraux : statut commun avec la synthèse
  const gen = await p.evaluate(() => { const r = ui.fec.result; const cc = cycleChecks(r); return Object.keys(cc).map((k) => `${k}:${cc[k].filter((x) => x.via).length}`).join(' ') + ` / gen:${genPoints(r).length}`; });
  console.log('points généraux par cycle :', gen);

  // Pièces à demander pour le bilan : pièces des cycles ajoutées une fois
  await fecTab(p, 'pieces', 0); await p.waitForTimeout(200);
  const pieces = await p.$$eval('.check.piece span', (s) => s.map((x) => x.textContent));
  const dup = pieces.filter((t, i) => pieces.indexOf(t) !== i);
  console.log('pièces du dossier :', pieces.filter((t) => /approbation|DSN|Relevés des placements|Méthode de valorisation|Dernière facture|kilomètres|Effectif au/.test(t)).join(' || '));
  ko(!dup.length, `aucune pièce en double ${dup.join(' | ')}`);

  // FEC N-1 : à-nouveaux rapprochés de la clôture N-1, colonne N-1 des comptes
  await fecTab(p, 'revue', 0);
  [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('button[data-action=fec-prev]')]);
  await ch.setFiles(D + '123456789FEC20241231.txt'); await p.waitForSelector('table.revue');
  await fecTab(p, 'regul', 0); await p.waitForTimeout(150);
  const an = await p.$$eval('.fec-checks .fec-check', (l) => l.map((x) => x.querySelector('strong').textContent + ' — ' + ((x.querySelector('.muted') || {}).textContent || '')).filter((t) => /nouveaux/.test(t)));
  console.log('à-nouveaux :', an.join(' | '));
  ko(an.length === 1 && !/non rapprochés/.test(an[0]), 'à-nouveaux comparés au FEC N-1');
  const n1 = await p.$eval('.cyc-acc thead', (t) => t.textContent);
  ko(/N-1/.test(n1), 'colonne N-1 des comptes du cycle');
  // Écart d'à-nouveau : un solde N-1 modifié est signalé
  const ecart = await p.evaluate(() => {
    const f = ui.fec; const b = f.prev.balance.find((x) => x.compte.startsWith('512'));
    b.s += 100; delete f.result._cc; const cc = cycleChecks(f.result); b.s -= 100; delete f.result._cc;
    return cc.regul.filter((x) => /nouveaux/.test(x.label)).map((x) => `${x.level} ${x.label} : ${x.examples.join(' / ')}`).join(' | ');
  });
  console.log('écart simulé :', ecart);
  ko(/^warn .*512/.test(ecart), 'écart d\'à-nouveau signalé');

  // Dossier de travail : tous les cycles utilisés, comptes et pièces
  const wp = await p.evaluate(() => { const h = workpaperHtml(); return { cycles: (h.match(/<h2>[A-K] · /g) || []).length, comptes: /<th>Justifié<\/th>/.test(h), pieces: /<th>Pièce<\/th>/.test(h) }; });
  ko(wp.cycles >= 6 && wp.comptes && wp.pieces, `dossier de travail : ${JSON.stringify(wp)}`);

  // Mobile : pas de débordement horizontal sur une page de cycle
  const m = await (await b.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'fr-FR' })).newPage();
  m.on('pageerror', (e) => errors.push('PAGEERROR(m) ' + e.message));
  await m.goto(process.env.BASE || 'http://localhost:8765/');
  await m.fill('input[name=p1]', 'Cabinet-Test-2026!'); await m.fill('input[name=p2]', 'Cabinet-Test-2026!');
  await m.check('input[name=ack]'); await m.click('button[type=submit]'); await m.waitForSelector('.layout');
  await m.goto((process.env.BASE || 'http://localhost:8765/') + '#/fec'); await m.waitForSelector('.fec-drop');
  const [ch2] = await Promise.all([m.waitForEvent('filechooser'), m.click('.fec-drop')]);
  await ch2.setFiles(D + '444444444FEC20251231.txt'); await m.waitForSelector('.fec-meta');
  const over = [];
  for (const k of ['regul', 'achats', 'immo', 'social']) {
    await fecTab(m, k, 0); await m.waitForTimeout(120);
    if (await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) over.push(k);
  }
  await m.screenshot({ path: O + 'dossier-mobile.png', fullPage: true });
  ko(!over.length, `mobile sans débordement ${over.join(', ')}`);
  console.log('erreurs', errors);
  await b.close();
})();
