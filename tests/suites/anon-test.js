const { chromium } = require('playwright');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const D = path.join(__dirname, '../fixtures/');
const O = path.join(__dirname, '../out/');
// Anonymisation d'un FEC : aucun nom de client, de personne ni du dossier, aucun identifiant dans le fichier produit ;
// fournisseurs conservés (mode « clients ») ou remplacés (mode « tout ») ; écritures équilibrées, encodage conservé, et
// structure intacte (même analyse : numérotation des factures, suggestions d'affectation, conformité).
let ko = 0;
const expect = (cond, label, info) => { if (cond) console.log(`OK ${label}`); else { ko++; console.log(`KO ${label}${info ? ' : ' + info : ''}`); } };
const load = (file) => {
  const ctx = { self: { postMessage() {} }, postMessage() {}, console, TextDecoder, TextEncoder, Intl };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/', file), 'utf8'), ctx);
  return ctx;
};
const ANON = load('fec-anon.js');
const anonymize = (buf, name, opts) => { Object.assign(ANON, { __b: buf, __n: name, __o: opts }); return vm.runInContext('anonymizeFec(__b, __n, __o)', ANON); };
const analyse = (text, name) => {
  const W = load('fec-worker.js');
  const b = Buffer.from(text, 'utf8');
  Object.assign(W, { __b: b.buffer.slice(b.byteOffset, b.byteOffset + b.length), __n: name });
  return vm.runInContext('analyse(__b, __n)', W);
};
const NAMES = ['DURAND', 'ALAIN', 'TILLEULS', 'MARCHAND', 'SOPHIE', 'LEROY', 'PAUL', 'BERNARD', 'DELTA', 'PAIRE', 'JEAN', 'EXEMPLE', 'Exemple'];
const balanced = (text) => {
  const L = text.split(/\r?\n/).filter(Boolean);
  const H = L[0].split('\t');
  const [j, n, d, c] = ['JournalCode', 'EcritureNum', 'Debit', 'Credit'].map((k) => H.indexOf(k));
  const s = new Map();
  L.slice(1).forEach((l) => { const f = l.split('\t'); const k = f[j] + '|' + f[n]; s.set(k, (s.get(k) || 0) + Math.round(parseFloat(f[d].replace(',', '.')) * 100) - Math.round(parseFloat(f[c].replace(',', '.')) * 100)); });
  return Array.from(s.values()).filter((v) => v !== 0).length;
};

(async () => {
  // 1. Moteur, sur le FEC de référence Pennylane
  const src = fs.readFileSync(D + '900000009FEC20270831.txt');
  const orig = src.toString('utf8');
  const r = anonymize(src.buffer.slice(src.byteOffset, src.byteOffset + src.length), '900000009FEC20270831.txt', { seed: 7, scale: true });
  const out = r.text;
  expect(Buffer.from(r.bytes).toString('utf8') === out, 'fichier produit en UTF-8, comme l\'original');
  console.log('dossier reconnu :', r.report.dossier, '· motifs :', JSON.stringify(r.report.byWhy));
  expect(r.report.mode === 'clients' && /EXEMPLE/.test(r.report.dossier), 'mode « clients » par défaut, dossier reconnu dans les virements');
  expect(/401FRESTAU/.test(out) && /\bCarburant\b/.test(out), 'mode « clients » : fournisseurs conservés');
  console.log('fichier :', r.fileName, '· coefficient', r.report.factor, '·', JSON.stringify(r.report.stats));
  expect(/^9\d{8}FEC20270831\.txt$/.test(r.fileName) && !r.fileName.startsWith('900000009'), 'SIREN du nom de fichier remplacé, date de clôture conservée', r.fileName);
  const left = NAMES.filter((w) => new RegExp(`\\b${w}\\b`).test(out));
  expect(!left.length, 'aucun nom de client ni du dossier dans le fichier', left.join(', '));
  expect(!out.includes('FR7699999000010000000000099') && r.report.stats.iban > 0, 'IBAN remplacés');
  const oL = orig.split('\n').filter(Boolean), aL = out.split('\n').filter(Boolean);
  expect(oL[0] === aL[0] && oL.length === aL.length, 'en-tête et nombre de lignes identiques', `${oL.length} / ${aL.length}`);
  expect(aL.every((l) => l.split('\t').length === 18), '18 zones sur chaque ligne');
  expect(balanced(out) === 0, 'toutes les écritures restent équilibrées après modification des montants', String(balanced(out)));
  expect(oL[5].split('\t')[11] !== aL[5].split('\t')[11] || oL[5].split('\t')[12] !== aL[5].split('\t')[12], 'montants modifiés');
  // Cohérence des pseudonymes : le nom du client (CompAuxLib) se retrouve dans le libellé de ses factures
  const cli = aL.map((l) => l.split('\t')).find((f) => f[6] === '411100901');
  expect(cli && aL.some((l) => l.split('\t')[10].includes(cli[7].split(' ')[0] + ' ' + cli[7].split(' ')[1] + ' - F-2601')), 'même pseudonyme pour un tiers dans le compte et dans les libellés', cli && cli[7]);
  // Même analyse sur le fichier anonymisé : structure intacte
  const A = analyse(orig, '900000009FEC20270831.txt'), B = analyse(out, r.fileName);
  const num = (x) => x.cycles.clients.numbering.map((g) => `${g.label}:${g.ranges.join(',')}`).join(' | ');
  console.log('numérotation :', num(B));
  expect(num(A) === num(B), 'factures manquantes identiques (F-260159, F-260181 à F-260183, F-260190)');
  const sug = (x) => x.pieces.attente.map((l) => (l.sug ? (l.sug[7] ? 'facture' : 'libellé') : '-')).join(',');
  expect(sug(A) === sug(B), 'mêmes suggestions d\'affectation (facture citée, libellé déjà affecté)', sug(B));
  const lvl = (x) => x.checks.map((c) => c.id + ':' + c.level).join(' ');
  expect(lvl(A) === lvl(B), 'mêmes contrôles de conformité');
  // Mode « tout » : fournisseurs remplacés aussi
  const rAll = anonymize(src.buffer.slice(src.byteOffset, src.byteOffset + src.length), '900000009FEC20270831.txt', { seed: 7, mode: 'all' });
  expect(!/FRESTAU/.test(rAll.text) && !NAMES.some((w) => new RegExp(`\\b${w}\\b`).test(rAll.text)), 'mode « tout » : fournisseurs remplacés');
  // Sans l'option montants : montants strictement identiques
  const r2 = anonymize(src.buffer.slice(src.byteOffset, src.byteOffset + src.length), '900000009FEC20270831.txt', { seed: 7, scale: false });
  const amt = (t) => t.split('\n').filter(Boolean).map((l) => l.split('\t').slice(11, 13).join('|') + '|' + l.split('\t')[16]).join('\n');
  expect(amt(r2.text) === amt(orig), 'option montants désactivée : montants inchangés');
  // Mots choisis par l'utilisateur : remplacés (force) ou conservés (keep)
  const r3 = anonymize(src.buffer.slice(src.byteOffset, src.byteOffset + src.length), '900000009FEC20270831.txt', { seed: 7, scale: false, force: ['boulangerie'], keep: ['tilleuls'], own: ['Station Exemple'] });
  expect(!/BOULANGERIE/.test(r3.text) && /TILLEULS/.test(r3.text), 'mots à remplacer et à conserver choisis par l\'utilisateur');
  expect(!/STATION EXEMPLE/i.test(r3.text), 'nom du dossier (fiche) remplacé');
  // Encodage ISO-8859-15 et BOM UTF-8 conservés ; salaires et associés anonymisés
  const H0 = oL[0];
  const iso = `${H0}\r\nAN\tÀ nouveaux\t1\t20250101\t106100\tRéserve légale\t\t\tA1\t20250101\tÀ nouveau 5 € Œuvre\t0,00\t100,00\t\t\t20250101\t\t\r\nAN\tÀ nouveaux\t1\t20250101\t455100\tCompte courant Hélène Garçon\t\t\tA1\t20250101\tApport Hélène Garçon\t100,00\t0,00\t\t\t20250101\t\t\r\nBQ\tBanque\t2\t20250131\t421000\tRémunérations dues\t\t\tB1\t20250131\tVIR SALAIRE JANVIER BÉRANGÈRE TOURNESOL\t1200,00\t0,00\t\t\t20250131\t\t\r\nBQ\tBanque\t2\t20250131\t512000\tBanque\t\t\tB1\t20250131\tVIR SALAIRE JANVIER BÉRANGÈRE TOURNESOL\t0,00\t1200,00\t\t\t20250131\t\t\r\n`;
  const latin9 = Buffer.from(Array.from(iso).map((ch) => ({ '€': 0xa4, 'Œ': 0xbc }[ch] || ch.charCodeAt(0))));
  const r5 = anonymize(latin9.buffer.slice(latin9.byteOffset, latin9.byteOffset + latin9.length), '123456789FEC20251231.txt', { seed: 5 });
  const back = new TextDecoder('iso-8859-15').decode(Buffer.from(r5.bytes));
  console.log('ISO-8859-15 :', JSON.stringify(back.split('\r\n').slice(1, 4).map((l) => l.split('\t')[5] + ' | ' + l.split('\t')[10])));
  expect(r5.report.encoding === 'ISO-8859-15' && back === r5.text && /Réserve légale/.test(back) && /5 € Œuvre/.test(back) && back.includes('\r\n'), 'encodage ISO-8859-15, accents, € et fins de ligne CRLF conservés');
  expect(!/Hélène|Garçon|BÉRANGÈRE|TOURNESOL/i.test(back) && /SALAIRE JANVIER/.test(back), 'associé et salarié anonymisés, vocabulaire de paie conservé');
  const bomBuf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(iso, 'utf8')]);
  const r6 = anonymize(bomBuf.buffer.slice(bomBuf.byteOffset, bomBuf.byteOffset + bomBuf.length), '123456789FEC20251231.txt', { seed: 5 });
  expect(r6.bytes[0] === 0xef && r6.bytes[1] === 0xbb && r6.bytes[2] === 0xbf && r6.report.encoding === 'UTF-8 avec BOM', 'BOM UTF-8 conservé');
  // Identifiants dans les libellés : téléphone, e-mail, SIRET du dossier
  const H = oL[0];
  const extra = `${H}\nBQ\tBanque\t1\t20250105\t512000\tBanque\t\t\tP1\t20250105\tVIR DUPONTEL TEL 06 12 34 56 78 contact@dupontel.fr SIRET 12345678900017 www.dupontel.fr\t0,00\t100,00\t\t\t20250105\t\t\nBQ\tBanque\t1\t20250105\t706000\tVentes\t\t\tP1\t20250105\tVIR DUPONTEL\t100,00\t0,00\t\t\t20250105\t\t\n`;
  const b4 = Buffer.from(extra, 'utf8');
  const r4 = anonymize(b4.buffer.slice(b4.byteOffset, b4.byteOffset + b4.length), '123456789FEC20251231.txt', { seed: 3, scale: false, mode: 'all' });
  console.log('libellé :', r4.text.split('\n')[1].split('\t')[10]);
  expect(!/DUPONTEL|dupontel|06 12 34 56 78|12345678900017/.test(r4.text) && /contact@exemple\.fr/.test(r4.text), 'téléphone, e-mail, site et SIRET masqués');
  // Autres FEC de test (ACD, pharmacie) : aucune erreur, écritures équilibrées
  ['123456789FEC20251231.txt', '555555555FEC20251231.txt', '666666666FEC20251231.txt'].forEach((f) => {
    const b = fs.readFileSync(D + f);
    const x = anonymize(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), f, { seed: 11, scale: true });
    const o = b.toString('utf8');
    expect(balanced(x.text) === balanced(o) && x.report.lines === o.split(/\r?\n/).filter(Boolean).length - 1, `${f} : anonymisé, équilibre des écritures inchangé`, `${balanced(o)} → ${balanced(x.text)}`);
  });

  // 2. Page « Anonymiser un FEC »
  const br = await chromium.launch();
  const p = await (await br.newContext({ viewport: { width: 1366, height: 950 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', acceptDownloads: true })).newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('http://localhost:8765/');
  await p.fill('input[name=p1]', 'Cabinet-Test-2026!'); await p.fill('input[name=p2]', 'Cabinet-Test-2026!'); await p.check('input[name=ack]'); await p.click('button[type=submit]'); await p.waitForSelector('.layout');
  await p.goto('http://localhost:8765/#/fec'); await p.waitForSelector('.fec-drop');
  await p.click('a[href="#/anonymiser"]'); await p.waitForSelector('.fec-drop');
  const [ch] = await Promise.all([p.waitForEvent('filechooser'), p.click('.fec-drop')]);
  await ch.setFiles(D + '900000009FEC20270831.txt'); await p.waitForSelector('.anon-chips');
  const pv = await p.textContent('.anon-preview');
  expect(!NAMES.some((w) => pv.includes(w)), 'aperçu sans nom de tiers');
  expect(await p.isDisabled('button[data-action=anon-download]'), 'téléchargement bloqué tant que la relecture n\'est pas confirmée');
  expect(await p.isChecked('input[data-anon=mode][value=clients]') && !(await p.isChecked('input[data-anon=scale]')), 'par défaut : mode « clients », montants inchangés');
  // Un mot conservé à remplacer (clic), un mot ajouté à la main
  await p.click('.anon-chip[data-k="FRESTAU"][data-mode=force]');
  await p.fill('input[data-anon=extra]', 'port');
  await p.click('.anon-extra button[data-action=anon-run]');
  await p.waitForSelector('.anon-chip[data-k="FRESTAU"][data-mode=keep]');
  expect(await p.$('.anon-chip[data-k="PORT"][data-mode=keep]'), 'mot ajouté à la main : remplacé');
  expect(!(await p.textContent('.anon-preview')).includes('FRESTAU'), 'mot conservé cliqué : remplacé');
  await p.check('input[data-anon=ok]');
  await p.click('button[data-action=anon-download]'); await p.waitForSelector('#ask[open]');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#ask button[type=submit]')]);
  const name = dl.suggestedFilename();
  await dl.saveAs(O + name);
  const got = fs.readFileSync(O + name, 'utf8');
  expect(/^9\d{8}FEC20270831\.txt$/.test(name), 'nom du fichier téléchargé : SIREN fictif', name);
  expect(!NAMES.some((w) => new RegExp(`\\b${w}\\b`).test(got)) && !/FRESTAU|\bPORT\b/.test(got) && /\bCarburant\b/.test(got), 'fichier téléchargé : ni nom de client, ni mots choisis ; fournisseurs conservés');
  expect(balanced(got) === 0, 'fichier téléchargé : écritures équilibrées');
  await p.screenshot({ path: O + 'anonymiser.png', fullPage: true });
  // Effacer : plus rien en mémoire
  await p.click('button[data-action=anon-clear]'); await p.waitForTimeout(100);
  expect(!(await p.$('.anon-chips')), 'Effacer : fichier et liste des noms retirés de l\'écran');
  console.log(ko ? `${ko} écart(s)` : 'anonymisation conforme');
  console.log('erreurs', errors);
  await br.close();
  if (ko) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(1); });
