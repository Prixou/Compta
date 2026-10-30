const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
// Lettrage proposé (page « Lettrage ») : grand livre fournisseurs inventé (tests/gen/genlettrage.py) en PDF et en texte
// (lettrages, hypothèses, compte d'attente, relevé, doublons, mail, comptes fermés, réglages), puis FEC inventé
// (tests/gen/gentvarevue.py), fournisseurs et clients.
let ko = 0;
const expect = (cond, label, info) => { if (cond) console.log(`OK ${label}`); else { ko++; console.log(`KO ${label}${info ? ' : ' + info : ''}`); } };
const EXP = JSON.parse(fs.readFileSync(D + 'lettrage/attendu.json', 'utf8'));
(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8765' });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await pg.goto('http://localhost:8765/');
  await pg.fill('input[name=p1]', 'Cabinet-Test-2026!'); await pg.fill('input[name=p2]', 'Cabinet-Test-2026!'); await pg.check('input[name=ack]'); await pg.click('button[type=submit]'); await pg.waitForSelector('.layout');
  await pg.click('a[data-nav=lettrage]'); await pg.waitForSelector('.fec-drop');
  const S = () => pg.evaluate(() => {
    const st = ui.lett;
    const tot = { accounts: st.accs.length, lines: st.accs.reduce((t, a) => t + a.lines.length, 0), groups: 0, lettered: 0, amount: 0, open: 0 };
    const hyp = st.hyp.map((y) => [y.a.code, y.b.code, y.p.a / 100]);
    const dups = st.dup.map((d) => [d.l, d.g.map(([a]) => a.code)]);
    const lcr = st.lcr.map((r) => [r.p.a / 100, r.c.map((c) => c.b.code)]);
    const mail = st.miss.map((m) => `${m.n} - ${m.d} - facture manquante (règlement de ${lettFmt(m.a)} €)`);
    const by = {};
    st.accs.forEach((a) => {
      a.groups.forEach((g) => { tot.groups++; tot.lettered += g.lines.length; tot.amount += g.lines.filter((x) => x.side === 'D').reduce((s, x) => s + x.a, 0) / 100; });
      tot.open += a.rest.length;
      by[a.code] = { groups: a.groups.length, open: a.rest.length, skipped: a.skipped, methods: a.groups.map((g) => g.m), letters: a.groups.map((g) => g.l), sizes: a.groups.map((g) => g.lines.length), rest: a.rest.map((x) => x.d) };
      // Jamais de règlement antérieur à l'une des factures de son lettrage
      a.groups.forEach((g) => { const last = g.lines.filter((x) => x.side === a.inv).reduce((m, x) => (x.d > m ? x.d : m), ''); if (g.lines.some((x) => x.side !== a.inv && x.type === 'reglement' && x.d < last)) tot.early = (tot.early || 0) + 1; });
    });
    return { tot, by, src: st.src, msg: st.msg, ignored: st.ignored, hyp, dups, lcr, mail };
  });
  const check = (s, what) => {
    const t = s.tot;
    expect(t.accounts === EXP.accounts && t.lines === EXP.lines && t.groups === EXP.groups && t.lettered === EXP.lettered && Math.abs(t.amount - EXP.amount) < 0.01 && t.open === EXP.open && s.ignored === EXP.ignored,
      `${what} : ${EXP.groups} lettrages, ${EXP.lettered} écritures, ${EXP.amount} € lettrables, ${EXP.open} ouvertes, compte BNC ignoré, compte d'attente à part`, JSON.stringify(t));
    const ok = Object.entries(EXP.byAccount).every(([code, e]) => { const b = s.by[code]; return b && b.groups === e.groups && b.open === e.open && (e.skipped === undefined || b.skipped === e.skipped) && (!e.methods || e.methods.join() === b.methods.join()) && (!e.sizes || e.sizes.join() === b.sizes.join()) && (!e.rest || e.rest.join() === b.rest.join()); });
    expect(ok, `${what} : par compte, factures consécutives les plus anciennes d'abord (FALPHA, à-nouveau compris), montant identique (FBETA), facture client de 9 000 € payée en trois fois (C0001), jamais de règlement avant sa facture (FGAMMA, C0001), factures peu espacées (FEPS), relevé saisi en plus (FSIGMA), avoirs (FTAU), règlement de douze factures (FLONG), factures non consécutives seulement si la combinaison est unique et peu espacée (FLAMBDA, FAMB, FNC), deux factures pour deux règlements (FDUO), avoir arrivé après une autre facture (FOMICRON), avoir dans un lot réglé en deux fois (FPI), EI ignoré, compte continué sur la page suivante`, JSON.stringify(s.by));
    expect(!t.early, `${what} : aucun règlement lettré avec une facture postérieure`, String(t.early));
    expect(JSON.stringify(s.hyp) === JSON.stringify(EXP.hyp) && JSON.stringify(s.dups) === JSON.stringify(EXP.dups) && JSON.stringify(s.lcr) === JSON.stringify(EXP.lcr) && JSON.stringify(s.mail) === JSON.stringify(EXP.mail),
      `${what} : hypothèse entre deux comptes du même fournisseur, doublons de niveaux 1 et 2, compte d'attente (proposition unique, avoir déduit, montant sans fournisseur), règlements sans facture`, JSON.stringify([s.hyp, s.dups, s.lcr, s.mail]));
  };
  const setOpt = async (k, v) => { await pg.$eval('details.tool-set', (d) => { d.open = true; }); await pg.fill(`input[data-lett=${k}]`, v); await pg.dispatchEvent(`input[data-lett=${k}]`, 'change'); await pg.waitForTimeout(150); };
  const mailLines = () => pg.$eval('#lett-mail', (x) => x.value.split('\n').filter((l) => l.includes('facture manquante ('))).catch(() => []);

  // 1. Grand livre PDF
  const [ch] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('.fec-drop')]);
  await ch.setFiles(D + 'lettrage/grand-livre.pdf');
  await pg.waitForFunction(() => ui.lett && ui.lett.status === 'done' && ui.lett.accs.length, null, { timeout: 15000 });
  await pg.waitForTimeout(200);
  check(await S(), 'grand livre PDF');
  expect(await pg.$$eval('details.lett-acc', (x) => x.length) === EXP.shownHidden, 'comptes sans lettrage possible masqués');
  expect(await pg.$eval('details.lett-acc:has-text("FALPHA") .lett-l', (x) => x.textContent) === 'AA', 'lettres AA, AB… par compte');
  expect(await pg.$eval('details.lett-acc:has-text("C0001") .lett-leg', (x) => x.textContent.includes('1 facture ↔ 3 règlements')), 'méthode de chaque lettrage sous le tableau');
  const panels = await pg.evaluate(() => ({
    hyp: (document.querySelector('.lett-hyp') || {}).textContent || '', lcr: (document.querySelector('.lett-lcr') || {}).textContent || '',
    rel: (document.querySelector('.lett-relc') || {}).textContent || '', dup: (document.querySelector('.lett-dup') || {}).textContent || '',
    relRow: document.querySelectorAll('tr.lett-rel-r .lett-relb').length, relRows: document.querySelectorAll('tr.lett-rel').length,
  }));
  expect(panels.hyp.includes('FDELTA1') && panels.hyp.includes('FDELTA2') && panels.lcr.includes('FLCR') && panels.lcr.includes('FOMEGA') && panels.lcr.includes('unique') && panels.lcr.includes('aucun fournisseur trouvé')
    && panels.rel.includes('FSIGMA') && panels.relRow === 1 && panels.relRows === 4 && panels.dup.includes('niveau 1') && panels.dup.includes('niveau 2'),
  'encadrés : hypothèses, compte d\'attente, relevé (lignes surlignées, badge RELEVÉ), doublons', JSON.stringify(panels).slice(0, 300));
  expect(JSON.stringify(await mailLines()) === JSON.stringify(EXP.mail), 'mail des factures manquantes');
  await pg.screenshot({ path: O + 'lettrage.png', fullPage: true });
  await pg.uncheck('input[data-lett=hide]'); await pg.waitForTimeout(150);
  expect(await pg.$$eval('details.lett-acc', (x) => x.length) === EXP.accounts, 'tous les comptes affichés quand la case est décochée');
  expect(await pg.$$eval('.lett-t .badge.warn', (x) => x.filter((b) => b.textContent === 'doublon ?').length) === 4 && await pg.$$eval('.lett-open', (x) => x.filter((b) => b.textContent === 'hypothèse').length) === 2,
    'écritures en doublon et en hypothèse signalées dans les comptes');
  await setOpt('q', 'beta');
  expect(await pg.$$eval('details.lett-acc', (x) => x.length) === 1, 'recherche par compte ou nom');
  await setOpt('q', '');

  // 2. Fermer un compte lettré de son côté : il quitte la liste et le mail ; il se rouvre
  await pg.click('details.lett-acc:has-text("FGAMMA") [data-action=lett-close]'); await pg.waitForTimeout(150);
  let codes = await pg.$$eval('details.lett-acc summary strong', (x) => x.map((e) => e.textContent));
  expect(!codes.includes('FGAMMA') && codes.length === EXP.accounts - 1 && (await pg.textContent('.lett-closed')).includes('FGAMMA') && (await mailLines()).length === EXP.mail.length - 1,
    'compte fermé : retiré de la liste et du mail, listé parmi les comptes fermés', JSON.stringify(codes));
  await pg.click('.lett-closed [data-action=lett-reopen]'); await pg.waitForTimeout(150);
  expect(await pg.$$eval('details.lett-acc', (x) => x.length) === EXP.accounts && !(await pg.$('.lett-closed')) && (await mailLines()).length === EXP.mail.length, 'compte rouvert');
  await pg.check('input[data-lett=hide]'); await pg.waitForTimeout(150);

  // 3. Mail : modifiable (texte conservé), copié
  await pg.fill('#lett-mail', (await pg.inputValue('#lett-mail')).replace('Bonjour,', 'Bonjour Madame,'));
  await pg.dispatchEvent('#lett-mail', 'change');
  await setOpt('q', '');
  expect((await pg.inputValue('#lett-mail')).startsWith('Bonjour Madame,'), 'mail modifié conservé');
  await pg.click('[data-action=lett-mail]'); await pg.waitForTimeout(150);
  const mailClip = await pg.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  expect(mailClip.startsWith('Bonjour Madame,') && EXP.mail.every((l) => mailClip.includes(l)), 'mail copié', mailClip.slice(0, 80));

  // 3 bis. Visa d'une hypothèse : règlement transféré sur l'autre compte et lettré avec ses factures ; décoché, retour
  await pg.check('.lett-hyp input[data-lett=visa]'); await pg.waitForTimeout(150);
  let v = await pg.evaluate(() => { const y = ui.lett.hyp[0]; const g = y.b.groups.find((x) => x.visa); return { ok: y.ok, inA: y.a.lines.includes(y.p), g: g && g.lines.length, inv: y.inv.length, b: y.b.code, moved: y.p.moved, a: y.a.code }; });
  expect(v.ok && !v.inA && v.g === v.inv + 1 && v.moved === v.a && (await pg.textContent('.lett-hyp h2')).includes('1 validée')
    && (await pg.textContent(`details.lett-acc[data-code="${v.b}"]`)).includes(`transféré de ${v.a}`) && await pg.$('.lett-hyp [data-action=lett-go]'),
  'visa d\'une hypothèse : règlement transféré et lettré, signalé dans le compte', JSON.stringify(v));
  await pg.click('.lett-hyp [data-action=lett-go]'); await pg.waitForTimeout(100);
  await pg.uncheck('.lett-hyp input[data-lett=visa]'); await pg.waitForTimeout(150);
  v = await pg.evaluate(() => { const y = ui.lett.hyp[0]; return { ok: y.ok, inA: y.a.lines.includes(y.p), visa: y.b.groups.some((x) => x.visa) }; });
  expect(!v.ok && v.inA && !v.visa, 'visa retiré : règlement rendu à son compte', JSON.stringify(v));

  // 3 ter. Mails de bilan (un par fournisseur à problème) et de révision mensuelle
  await pg.check('.lett-mx input[data-f=bilan]'); await pg.waitForTimeout(150);
  await pg.fill('.lett-mx input[data-f=sc]', 'SOCIETE DEMO'); await pg.dispatchEvent('.lett-mx input[data-f=sc]', 'change'); await pg.waitForTimeout(150);
  const bil = await pg.$$eval('.lett-mx textarea[data-lett=mxtxt]', (x) => x.map((t) => [t.dataset.i, t.value]));
  const missCodes = await pg.evaluate(() => [...new Set(ui.lett.miss.map((m) => m.code))]);
  expect(bil.length >= missCodes.length && missCodes.every((c) => bil.some(([i]) => i === c)) && bil.every(([, t]) => t.includes('SOCIETE DEMO') && t.includes('extrait de compte'))
    && (await pg.textContent('.lett-mx')).includes('Bilan au 31/12/'), 'mails de bilan : un par fournisseur à problème, société reprise', JSON.stringify(bil.map(([i]) => i)));
  await pg.check('.lett-mx input[data-f=situation]'); await pg.waitForTimeout(150);
  expect(!(await pg.isChecked('.lett-mx input[data-f=bilan]')) && (await pg.textContent('.lett-mx')).includes('Situation au'), 'bilan ou situation, au choix');
  await pg.click('[data-action=lett-mx-all]'); await pg.waitForTimeout(150);
  const allClip = await pg.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  expect(allClip.startsWith('Objet : Situation au') && allClip.split('--------').length === bil.length, 'copie de tous les mails', allClip.slice(0, 80));
  await pg.uncheck('.lett-mx input[data-f=situation]');
  await pg.check('.lett-mx input[data-f=rev]'); await pg.waitForTimeout(150);
  const rev = await pg.$eval('.lett-mx textarea[data-i="#rev"]', (x) => x.value);
  expect(rev.includes('révision mensuelle arrêtée au') && EXP.mail.every((l) => rev.includes(l)), 'mail de révision mensuelle : factures manquantes', rev.slice(0, 120));
  await pg.uncheck('.lett-mx input[data-f=rev]'); await pg.waitForTimeout(100);

  // 4. Réglages : retenus, lettrage recalculé
  await setOpt('ex', 'FGAMMA');
  expect((await mailLines()).length === EXP.mail.length - 1 && (await pg.evaluate(() => data.settings.lettrage.ex)) === 'FGAMMA', 'compte exclu du mail, choix conservé');
  await setOpt('ex', '');
  await setOpt('nc', 'nonsuite');
  let s = await S();
  expect(s.by.FNC.groups === 1 && s.by.FNC.open === 1 && /non consécutives/.test(s.by.FNC.methods[0]), 'fournisseur à factures non consécutives', JSON.stringify(s.by.FNC));
  await setOpt('nc', '');
  await setOpt('m1', 'mensuel');
  s = await S();
  expect(s.by.FMENS.groups === 2 && s.by.FMENS.rest.join() === '2026-08-10' && (await pg.textContent('details.lett-acc:has-text("FMENS") summary')).includes('échéance M+1') && !s.tot.early,
    'fournisseur à échéance M+1 : le règlement d\'octobre solde la facture de septembre, celle d\'août reste ouverte', JSON.stringify(s.by.FMENS));
  await setOpt('m1', '');
  await setOpt('md', '3');
  s = await S();
  expect(s.by.FEPS.groups === 1 && s.by.FEPS.open === 4, 'écart maximal entre factures d\'un même règlement', JSON.stringify(s.by.FEPS));
  await setOpt('md', '45');
  await setOpt('jr', 'OD, BQ');
  s = await S();
  expect(s.by.FBETA.groups === 0 && s.by.FBETA.skipped === 2 && (await pg.evaluate(() => data.settings.lettrage.jr)) === 'OD, BQ', 'journaux de règlement modifiés : lettrage recalculé, choix conservé', JSON.stringify(s.by.FBETA));
  await setOpt('jr', 'OD, BQ, LCR, CA, CE');
  await setOpt('ign', '');
  s = await S();
  expect(s.tot.accounts === EXP.accounts + 1 && s.ignored === 0, 'plus aucun compte ignoré', JSON.stringify(s.tot));
  await setOpt('ign', 'BNC');
  await setOpt('lc', '');
  s = await S();
  expect(s.tot.accounts === EXP.accounts + 1 && !(await pg.$('.lett-lcr')), 'sans compte d\'attente : compte lettré comme les autres', JSON.stringify(s.tot));
  await setOpt('lc', 'LCR');

  // 5. Texte collé
  await pg.click('.lett-paste summary');
  await pg.fill('#lett-tx', fs.readFileSync(D + 'lettrage/grand-livre.txt', 'utf8'));
  await pg.click('[data-action=lett-text]'); await pg.waitForTimeout(200);
  check(await S(), 'texte collé');

  // 6. Copie (tableur) et export Excel
  await pg.click('[data-action=lett-copy]'); await pg.waitForTimeout(200);
  const clip = await pg.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  expect(clip.startsWith('Compte\tLettre\tDate') && clip.trim().split('\n').length === EXP.lettered + 1, 'copie : une ligne par écriture lettrée', clip.slice(0, 120));
  await pg.click('[data-action=lett-xlsx]'); await pg.waitForSelector('#ask');
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#ask button[type=submit]')]);
  await dl.saveAs(O + dl.suggestedFilename());
  const zip = fs.readFileSync(O + dl.suggestedFilename());
  const sheets = ['Lettrages', 'Écritures ouvertes', 'Synthèse', 'Hypothèses', "Compte d'attente", 'Relevés', 'Doublons', 'Règlements sans facture'];
  expect(zip.slice(0, 2).toString() === 'PK' && sheets.every((x) => zip.includes(Buffer.from(x))), 'export Excel : lettrages, écritures ouvertes, synthèse, hypothèses, compte d\'attente, relevés, doublons, règlements sans facture', sheets.filter((x) => !zip.includes(Buffer.from(x))).join());

  // 7. FEC : lignes non lettrées des fournisseurs, puis des clients
  const [ch2] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('.fec-drop')]);
  await ch2.setFiles(D + '600000006FEC20261231.txt');
  await pg.waitForFunction(() => ui.lett && ui.lett.src === 'fec' && ui.lett.status === 'done', null, { timeout: 30000 });
  await pg.waitForTimeout(200);
  s = await S();
  expect(s.by.SCI && s.by.SCI.groups === 2 && s.by.SCI.open === 1 && s.by.GROS && s.by.GROS.open === 1 && s.by.IMMO && s.by.IMMO.groups === 1 && s.tot.groups === 3,
    'FEC : loyers réglés lettrés deux à deux, loyer de mars ouvert, immobilisation lettrée (404)', JSON.stringify(s.by));
  await pg.selectOption('select[data-lett=tiers]', 'cli'); await pg.waitForTimeout(200);
  s = await S();
  expect(s.tot.accounts === 1 && s.tot.lines === 1 && s.tot.groups === 0, 'FEC, clients : seule la facture non lettrée reste (vente de mars)', JSON.stringify(s));

  // 8. FEC ouvert dans l'analyse
  await pg.click('[data-action=lett-clear]');
  await pg.goto('http://localhost:8765/#/fec'); await pg.waitForSelector('.fec-drop');
  const [ch3] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('.fec-drop')]);
  await ch3.setFiles(D + '600000006FEC20261231.txt'); await pg.waitForSelector('.fec-meta');
  await pg.click('a[data-nav=lettrage]'); await pg.waitForSelector('[data-action=lett-fec]');
  await pg.click('[data-action=lett-fec]'); await pg.waitForTimeout(200);
  s = await S();
  expect(s.src === 'fec' && s.tot.groups === 3, 'bouton « Utiliser le FEC ouvert »', JSON.stringify(s.tot));
  // Onglet Lettrage de l'Espace FEC : le FEC ouvert est repris d'office
  await pg.click('[data-action=lett-clear]');
  await pg.goto('http://localhost:8765/#/fec'); await pg.waitForSelector('.fec-groups');
  await pg.click('.fec-groups button[data-group=lettrage]'); await pg.waitForTimeout(200);
  s = await S();
  expect(s.src === 'fec' && s.tot.groups === 3 && !(await pg.$('main h1:has-text("Lettrage")')) && (await pg.textContent('.fec-groups button.on')) === 'Lettrage et LCR', 'onglet Lettrage de l’Espace FEC : FEC ouvert repris', JSON.stringify(s.tot));
  await pg.click('a[data-nav=lettrage]'); await pg.waitForSelector('.fec-drop');

  // 9. Téléphone et verrouillage
  await pg.setViewportSize({ width: 390, height: 844 }); await pg.waitForTimeout(300);
  const over = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over <= 1, 'téléphone : pas de débordement horizontal', String(over));
  await pg.screenshot({ path: O + 'lettrage-mobile.png' });
  await pg.evaluate(() => forgetSession());
  expect(await pg.evaluate(() => ui.lett === null), 'verrouillage : lettrage effacé de la mémoire');

  console.log(ko ? `${ko} écart(s)` : 'lettrage proposé conforme');
  console.log('erreurs', errors);
  await br.close();
  if (ko) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(1); });
