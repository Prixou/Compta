const { chromium } = require('playwright');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
const { fecTab, fecMonth } = require('./lib');
const PW = 'Cabinet-Test-2026!';
const R = [];
const ok = (name, cond, info) => { R.push([cond ? 'OK ' : 'KO ', name, info || '']); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8765' });
  const p = await ctx.newPage();
  const errors = [], csp = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { const t = m.text(); if (/Content Security Policy|Refused to/i.test(t)) csp.push(t); else if (m.type() === 'error') errors.push(t); });
  p.on('dialog', (d) => { errors.push('DIALOGUE INATTENDU ' + d.message()); d.dismiss(); });
  const unlock = async (page) => { await page.fill('input[name=password]', PW); await page.click('button[type=submit]'); await page.waitForSelector('.layout'); };
  const go = async (hash, sel) => { await p.goto('http://localhost:8765/#/' + hash); await p.waitForSelector(sel || 'main h1'); };
  const pick = async (selector, file) => { const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click(selector)]); await ch.setFiles(D + file); };

  await p.goto('http://localhost:8765/');
  // Mot de passe trop faible refusé
  await p.fill('input[name=p1]', 'aaaaaaaaaa'); await p.fill('input[name=p2]', 'aaaaaaaaaa'); await p.check('input[name=ack]'); await p.click('button[type=submit]');
  ok('Mot de passe faible refusé', (await p.textContent('[data-error]')).includes('faible'));
  await p.fill('input[name=p1]', PW); await p.fill('input[name=p2]', PW); await p.click('button[type=submit]'); await p.waitForSelector('.layout');

  // 1. Injections
  const X = '<img src=x onerror="window.__xss=1">';
  await go('dossiers'); await p.click('main [data-action=new-client]');
  await p.fill('#modal input[name=nom]', 'Test ' + X); await p.fill('#modal input[name=contact]', X); await p.fill('#modal textarea[name=notes]', X);
  await p.fill('#modal input[name=email]', 'a@b.fr'); await p.fill('#modal input[name=siren]', '111111111');
  await p.click('#modal button[type=submit]'); await p.waitForSelector('.grid-detail');
  await p.click('main button[data-action=new-mission]'); await p.fill('#modal input[name=titre]', '<script>window.__xss=2</script>Mission');
  await p.fill('#modal textarea[name=etapes]', 'Pièces reçues ' + X); await p.click('#modal button[type=submit]');
  await p.fill('textarea[name=texte]', X); await p.click('form[data-form=journal] button');
  await go('dossiers'); await pick('main [data-action=import-sheet]', 'piege.xlsx'); await p.waitForSelector('#modal .imp-cols'); await p.click('#modal [data-action=apply-import]');
  await p.waitForTimeout(300);
  await go('fec', '.fec-drop'); await p.screenshot({ path: O + 'dbg2.png' }); await pick('.fec-drop', '111111111FEC20251231.txt'); await p.waitForSelector('.fec-meta');
  for (const tab of ['synthese', 'pieces', 'revue', 'rappro', 'conformite', 'sig', 'balance', 'details']) { await fecTab(p, tab, 0); await p.waitForTimeout(60); }
  await fecTab(p, 'rappro', 0); await pick('button[data-action=rappro-import]', 'releve-piege.csv'); await p.waitForTimeout(200);
  await fecTab(p, 'pieces', 0);
  await p.click('button[data-action=pieces-demande]').catch(() => {}); await p.waitForTimeout(200);
  if (await p.$('#msg-body')) await p.click('#modal [data-action=close-modal]');
  for (const h of ['tableau', 'dossiers', 'missions', 'grille', 'parametres', 'aide']) await go(h);
  await go('missions'); await p.click('.mrow:has-text("Mission")'); await p.waitForTimeout(100); await p.keyboard.press('Escape');
  const xss = await p.evaluate(() => ({ flag: window.__xss, img: document.querySelectorAll('img[src="x"]').length, script: Array.from(document.querySelectorAll('script')).filter((s) => !s.src).length }));
  ok('Aucune injection de code (noms, notes, journal, Excel, FEC, relevé)', !xss.flag && !xss.img && !xss.script, JSON.stringify(xss));
  ok('Aucune violation de la politique de sécurité (CSP)', !csp.length, csp.slice(0, 2).join(' | '));

  // 2. Mode discret
  await go('tableau'); await p.click('.sidebar button[data-action=toggle-discret]');
  let leak = [];
  for (const h of ['tableau', 'dossiers', 'missions', 'grille']) { await go(h); const t = await p.innerText('main'); if (/Test <img|PIEGE/.test(t)) leak.push(h); }
  await go('dossiers'); await p.click('.seg button[data-view=tableau]'); if (/PIEGE|Test </.test(await p.innerText('main'))) leak.push('dossiers-tableau');
  ok('Mode discret : aucun nom de client affiché', !leak.length, leak.join(','));
  await p.click('.sidebar button[data-action=toggle-discret]');

  // 3. Fichiers invalides
  const fecErr = async (file) => { await go('fec', 'main h1'); if (await p.$('button[data-action=fec-pick]')) await pick('button[data-action=fec-pick]', file); else await pick('.fec-drop', file); await p.waitForSelector('.banner.warn, .fec-meta', { timeout: 15000 }); return (await p.textContent('main')).replace(/\s+/g, ' '); };
  let t = await fecErr('vide.txt'); ok('FEC vide : message clair', /aucune écriture|impossible/i.test(t), t.match(/vide\.txt : [^.]*\./)?.[0]);
  t = await fecErr('entete-seul.txt'); ok('FEC avec en-tête seul : message clair', /aucune écriture/i.test(t));
  t = await fecErr('pas-un-fec.txt'); ok('Fichier qui n\'est pas un FEC : message clair', /pas être un FEC|séparateur/i.test(t));
  t = await fecErr('point-virgule.txt'); ok('FEC au point-virgule : lu mais signalé non conforme', /Point-virgule|non conforme/i.test(await p.innerText('main')) || /Séparateur/.test(t));
  await go('dossiers'); await pick('main [data-action=import-sheet]', 'binaire.xlsx'); await p.waitForTimeout(400);
  ok('Excel corrompu : erreur affichée sans plantage', /valide|illisible|Excel/i.test(await p.textContent('#toast')), await p.textContent('#toast'));

  // 4. Sauvegarde puis restauration complète
  await go('fec', 'main h1'); await pick(await p.$('.fec-drop') ? '.fec-drop' : 'button[data-action=fec-pick]', '111111111FEC20251231.txt'); await p.waitForSelector('.fec-meta');
  await p.click('button[data-action=fec-save]');
  await go('dossiers');
  const before = { dossiers: await p.$$eval('#dossier-list .dcard, #dossier-list tbody tr', (x) => x.length) };
  await go('missions'); await p.selectOption('select[data-filter="mf.statut"]', 'toutes'); before.missions = await p.$$eval('#mission-list .mrow', (x) => x.length);
  await go('parametres');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button[data-action=export-backup]')]); await dl.saveAs(O + 'checkup-backup.json');
  const p2 = await (await b.newContext({ locale: 'fr-FR' })).newPage();
  p2.on('pageerror', (e) => errors.push('P2 ' + e.message));
  await p2.goto('http://localhost:8765/'); const [c2] = await Promise.all([p2.waitForEvent('filechooser'), p2.click('[data-action=restore-setup]')]);
  await c2.setFiles(O + 'checkup-backup.json'); await p2.fill('#ask input[name=value]', PW); await p2.click('#ask button[type=submit]'); await p2.waitForSelector('.layout');
  await p2.goto('http://localhost:8765/#/dossiers'); await p2.waitForSelector('#dossier-list');
  const after = { dossiers: await p2.$$eval('#dossier-list .dcard, #dossier-list tbody tr', (x) => x.length) };
  await p2.goto('http://localhost:8765/#/missions'); await p2.waitForSelector('#mission-list'); await p2.selectOption('select[data-filter="mf.statut"]', 'toutes'); after.missions = await p2.$$eval('#mission-list .mrow', (x) => x.length);
  await p2.goto('http://localhost:8765/#/dossiers'); await p2.fill('input[data-filter=qDossiers]', 'Test'); await p2.click('#dossier-list a, #dossier-list tbody tr'); await p2.waitForSelector('.grid-detail');
  ok('Restauration : dossiers, missions et synthèse FEC identiques', before.dossiers === after.dossiers && before.missions === after.missions && !!(await p2.$('.fec-hist')), JSON.stringify({ before, after }));
  const wrong = await (await b.newContext()).newPage(); await wrong.goto('http://localhost:8765/');
  const [c3] = await Promise.all([wrong.waitForEvent('filechooser'), wrong.click('[data-action=restore-setup]')]); await c3.setFiles(O + 'checkup-backup.json');
  await wrong.fill('#ask input[name=value]', 'mauvais-mot-de-passe'); await wrong.click('#ask button[type=submit]'); await wrong.waitForTimeout(1500);
  ok('Restauration avec mauvais mot de passe refusée', /incorrect/i.test(await wrong.textContent('#toast')) && !(await wrong.$('.layout')));

  // 5. Verrouillage automatique (horloge simulée installée avant le chargement, sur un coffre à part)
  {
    const q = await (await b.newContext({ locale: 'fr-FR' })).newPage();
    await q.clock.install();
    await q.goto('http://localhost:8765/');
    await q.fill('input[name=p1]', PW); await q.fill('input[name=p2]', PW); await q.check('input[name=ack]'); await q.click('button[type=submit]'); await q.waitForSelector('.layout');
    await q.goto('http://localhost:8765/#/parametres'); await q.selectOption('select[data-setting=autoLockMin]', '1');
    await q.clock.fastForward(75000); await q.waitForTimeout(300);
    ok('Verrouillage automatique après inactivité', !!(await q.$('form[data-form=unlock]')));
    await q.close();
  }

  // 6. Hors ligne (service worker)
  const off = await b.newContext({ locale: 'fr-FR' }); const po = await off.newPage();
  await po.goto('http://localhost:8765/'); await po.evaluate(() => navigator.serviceWorker.ready); await po.reload(); await po.waitForTimeout(500);
  await off.setOffline(true); await po.reload(); await po.waitForSelector('form[data-form=setup], form[data-form=unlock]', { timeout: 8000 }).catch(() => {});
  ok('Fonctionne hors ligne après une première visite', !!(await po.$('form[data-form=setup], form[data-form=unlock]')));
  const assets = await po.evaluate(async () => { const keys = await caches.keys(); const c = await caches.open(keys[keys.length - 1]); return (await c.keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search); });
  // Tous les scripts chargés par la page, le moteur d'analyse et la feuille de style doivent être en cache.
  const needed = (await po.evaluate(() => Array.from(document.scripts).map((x) => new URL(x.src).pathname))).concat(['/js/fec-worker.js', '/css/styles.css']);
  const missing = needed.filter((f) => !assets.some((a) => a.startsWith(f)));
  ok('Tous les fichiers de l\'application en cache hors ligne', !missing.length && needed.length > 20, `${assets.length} fichiers${missing.length ? ' — manquants : ' + missing.join(', ') : ''}`);

  // 7. Mobile : pas de débordement horizontal, écran par écran
  await p.setViewportSize({ width: 375, height: 800 });
  const over = [];
  for (const h of ['tableau', 'dossiers', 'missions', 'grille', 'parametres', 'aide']) { await go(h); if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) over.push(h); }
  await go('fec', 'main h1'); await pick(await p.$('.fec-drop') ? '.fec-drop' : 'button[data-action=fec-pick]', '123456789FEC20251231.txt'); await p.waitForSelector('.fec-meta');
  for (const tab of ['synthese', 'pieces', 'revue', 'rappro', 'conformite', 'sig', 'balance', 'details']) { await fecTab(p, tab, 0); await p.waitForTimeout(80); if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) over.push('fec-' + tab); }
  await go('dossiers'); await p.fill('input[data-filter=qDossiers]', 'Test'); await p.click('#dossier-list a, #dossier-list tbody tr'); await p.waitForSelector('.grid-detail');
  if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) over.push('fiche dossier');
  ok('Mobile (375 px) : aucun écran ne déborde', !over.length, over.join(', '));
  await p.setViewportSize({ width: 1366, height: 900 });

  // Verrouillage : fenêtres et notifications effacées
  await go('dossiers'); await pick('main [data-action=import-sheet]', 'piege.xlsx'); await p.waitForSelector('#modal .imp-cols');
  await p.evaluate(() => { document.querySelector('#toast').textContent = 'TVA 09/2026 — CLIENT SECRET : OK'; });
  await p.keyboard.press('Escape');
  await p.click('.sidebar button[data-action=lock]').catch(async () => { await p.click('.topbar button[data-action=lock]'); });
  await p.waitForSelector('form[data-form=unlock]');
  const residue = await p.evaluate(() => ({ modal: document.querySelector('#modal').innerHTML.length, toast: document.querySelector('#toast').textContent, text: document.body.innerText }));
  ok('Verrouillage : aucune donnée résiduelle à l\'écran', !residue.modal && !residue.toast && !/PIEGE|Test|SECRET/.test(residue.text), JSON.stringify({ modal: residue.modal, toast: residue.toast }));
  await unlock(p);

  ok('Aucune erreur JavaScript', !errors.length, errors.slice(0, 3).join(' | '));
  console.log(R.map((r) => r.join(' ')).join('\n'));
  await b.close();
})().catch((e) => { console.error(R.map((r) => r.join(' ')).join('\n')); console.error(e); process.exit(1); });
