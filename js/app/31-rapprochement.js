/*
 * Suivi Dossiers — Rapprocher un relevé bancaire et le journal de banque du mois (FEC limité au journal de banque) :
 * opérations non comptabilisées, écritures absentes du relevé, montants différents, sens inversés, doublons, état de
 * rapprochement et écritures à passer.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- Rapprocher un relevé ----------
// Le relevé est lu par js/bank-reader.js (PDF, CSV, Excel, OFX, CAMT.053, CFONB) et le FEC par le moteur d'analyse
// (js/fec-worker.js) ; l'appariement reprend celui du rapprochement de l'analyse FEC (reconcile, même montant à quelques
// jours près, puis regroupements), complété ici par les montants différents, les sens inversés et les doublons.
// Tout reste en mémoire : rien n'est enregistré, et le verrouillage efface l'écran.

const brapState = () => (ui.brap = ui.brap || { files: [], errors: [], ops: [], opening: null, closing: null, fec: null, r: null, status: 'idle', tol: 5, compte: '', soldeReleve: '', soldeCompta: '', runId: 0 });
const brapRefresh = () => { if (location.hash.startsWith('#/rapprochement')) refresh(); };
const BRAP_STOP = new Set(['prlv', 'prelevement', 'sepa', 'carte', 'vir', 'virement', 'recu', 'emis', 'des', 'les', 'ref', 'fact', 'facture', 'paiement',
  'remise', 'cheque', 'chq', 'sas', 'sarl', 'eur', 'euros', 'pour', 'avec', 'echeance']);
const brapTokens = (s) => new Set(norm(s).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !BRAP_STOP.has(w)));
const brapSim = (a, b) => { const B = brapTokens(b); let n = 0; brapTokens(a).forEach((w) => { if (B.has(w)) n++; }); return n; };
// Mêmes chiffres dans un autre ordre (1 234,50 / 1 243,50) : faute de frappe probable
const brapDigits = (x) => String(Math.round(Math.abs(x) * 100)).split('').sort().join('');

async function brapAddStatements(files) {
  const st = brapState();
  const list = Array.from(files || []).filter(Boolean);
  if (!list.length) return;
  const key = (o) => `${o.date}|${o.amount}|${o.label}`;
  for (const file of list) {
    try {
      const res = await BankReader.read(file);
      const known = new Set(st.ops.map(key));
      const added = res.operations.filter((o) => !known.has(key(o)));
      st.ops = st.ops.concat(added).sort((a, b) => a.date.localeCompare(b.date));
      st.files.push({ name: file.name, format: res.format, n: res.operations.length, dup: res.operations.length - added.length, account: res.account || '' });
      if (res.opening && (!st.opening || res.opening.date < st.opening.date)) st.opening = res.opening;
      if (res.closing && (!st.closing || res.closing.date > st.closing.date)) st.closing = res.closing;
    } catch (e) {
      st.errors.push(`${file.name} : ${e.message || e}`);
    }
  }
  st.soldeReleve = '';
  brapRefresh();
}

function brapSetFec(file) {
  if (!file) return;
  const st = brapState();
  const run = ++st.runId;
  Object.assign(st, { fec: file, r: null, status: 'running', message: '', compte: '', soldeCompta: '' });
  brapRefresh();
  const alive = () => run === st.runId && ui.brap === st;
  const fail = (message) => { if (!alive()) return; Object.assign(st, { status: 'error', message }); brapRefresh(); };
  fecSource(file).then(({ buffer, name }) => {
    if (!alive()) return;
    const w = new Worker('js/fec-worker.js?v=' + ASSET_VERSION);
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') return;
      w.terminate();
      if (!alive()) return;
      if (m.type !== 'done') return fail(m.message);
      if (!Object.keys(m.result.bankLines || {}).length) return fail('Aucune écriture sur un compte de banque (512 et suivants) dans ce FEC.');
      Object.assign(st, { status: 'done', r: m.result, fecName: name });
      brapRefresh();
    };
    w.onerror = (err) => { w.terminate(); fail(err.message || 'Erreur pendant la lecture du FEC.'); };
    w.postMessage({ buffer, fileName: name }, [buffer]);
  }, (err) => fail(err.message));
}

// Fichiers déposés : sur un emplacement précis, sinon le FEC (en-tête « JournalCode », archive .zip) est reconnu à son contenu
async function brapDrop(files, side) {
  const list = Array.from(files || []).filter(Boolean);
  if (!list.length) return;
  if (side === 'fec') return brapSetFec(list[0]);
  if (side === 'rel') return brapAddStatements(list);
  const isFec = async (f) => /\.zip$/i.test(f.name) || /journalcode/i.test(await f.slice(0, 400).text().catch(() => ''));
  let fec = null;
  for (const f of list) if (!fec && (await isFec(f))) fec = f;
  if (fec) brapSetFec(fec);
  const rest = list.filter((f) => f !== fec);
  if (rest.length) brapAddStatements(rest);
}

// Compte de banque du FEC : celui qui retrouve le plus d'opérations du relevé
function brapAccounts(st) {
  const bl = st.r.bankLines;
  const amounts = new Set(st.ops.map((o) => Math.round(o.amount * 100)));
  return Object.keys(bl).map((c) => ({ compte: c, lib: (st.r.balance.find((b) => b.compte === c) || {}).lib || '', n: bl[c].length, hits: bl[c].filter((l) => amounts.has(Math.round(l[1] * 100))).length }))
    .sort((a, b) => b.hits - a.hits || b.n - a.n);
}

function brapCalc(st) {
  const r = st.r;
  const accs = brapAccounts(st);
  if (!accs.some((a) => a.compte === st.compte)) st.compte = accs[0].compte;
  const lines = r.bankLines[st.compte] || [];
  const bal = r.balance.find((b) => b.compte === st.compte);
  const hasAN = !!bal && (Math.abs(bal.d - bal.dm) >= 0.005 || Math.abs(bal.c - bal.cm) >= 0.005);
  const tol = Math.max(0, Math.min(31, Number(st.tol) || 0));
  const res = reconcile(st.ops, lines, tol, bal ? bal.an : 0);
  const days = (a, b) => Math.abs(daysUntilFrom(a, b));
  // Période du relevé : de son solde d'ouverture (à défaut, du 1er du mois si le relevé commence en début de mois) à son
  // solde de fin ; les écritures de cette période absentes du relevé en font partie, même avant la première opération.
  const pStart = st.opening && st.opening.date <= res.start ? st.opening.date : res.start.slice(8) <= '05' ? res.start.slice(0, 8) + '01' : res.start;
  const pEnd = st.closing && st.closing.date >= res.end ? st.closing.date : res.end;
  let bankRest = res.bankOnly.slice(), bookRest = res.book.filter((l) => !l.match && l.date >= pStart && l.date <= pEnd);
  const bookOnly = bookRest.slice();
  // 1. Sens inversé : même montant au débit d'un côté et au crédit de l'autre
  const sens = [];
  bankRest.slice().forEach((o) => {
    const l = bookRest.filter((x) => Math.abs(x.amount + o.amount) < 0.005 && days(x.date, o.date) <= tol).sort((a, b) => days(a.date, o.date) - days(b.date, o.date))[0];
    if (!l) return;
    sens.push({ o, l, diff: round2(o.amount - l.amount) });
    bankRest = bankRest.filter((x) => x !== o); bookRest = bookRest.filter((x) => x !== l);
  });
  // 2. Montants différents : même sens, dates proches, libellés voisins ou chiffres inversés
  const cands = [];
  bankRest.forEach((o) => bookRest.forEach((l) => {
    if (Math.sign(o.amount) !== Math.sign(l.amount) || days(o.date, l.date) > tol) return;
    const sim = brapSim(o.label, l.label);
    const transp = brapDigits(o.amount) === brapDigits(l.amount);
    const rel = Math.abs(o.amount - l.amount) / Math.max(Math.abs(o.amount), Math.abs(l.amount));
    if (!transp && !(sim >= 1 && rel <= 0.5)) return;
    cands.push({ o, l, transp, score: (transp ? 10 : 0) + sim * 3 - days(o.date, l.date) * 0.1 - rel });
  }));
  cands.sort((a, b) => b.score - a.score);
  const usedO = new Set(), usedL = new Set(), ecarts = [];
  cands.forEach((c) => {
    if (usedO.has(c.o) || usedL.has(c.l)) return;
    usedO.add(c.o); usedL.add(c.l);
    ecarts.push({ o: c.o, l: c.l, diff: round2(c.o.amount - c.l.amount), transp: c.transp });
  });
  bankRest = bankRest.filter((o) => !usedO.has(o)); bookRest = bookRest.filter((l) => !usedL.has(l));
  // 3. Doublons : écriture absente du relevé, jumelle d'une écriture rapprochée (même montant, même libellé, dates proches)
  const matchedBook = Array.from(new Set(res.bank.flatMap((o) => o.match || [])));
  const doublons = [];
  bookRest.slice().forEach((l) => {
    const twin = matchedBook.find((x) => Math.abs(x.amount - l.amount) < 0.005 && days(x.date, l.date) <= 3 && (norm(x.label) === norm(l.label) || brapSim(x.label, l.label) >= 1));
    if (!twin) return;
    doublons.push({ l, twin });
    bookRest = bookRest.filter((x) => x !== l);
  });
  // Regroupements (une opération pour plusieurs écritures, ou l'inverse)
  const groups = res.bank.filter((o) => o.match && o.match.length > 1).map((o) => ({ bank: [o], book: o.match }))
    .concat(matchedBook.filter((b) => b.match && b.match.length > 1).map((b) => ({ bank: b.match, book: [b] })));
  const shifted = res.bank.filter((o) => o.match && o.match.length === 1 && o.match[0].match.length === 1 && o.match[0].date !== o.date).length;

  // Différence de mouvements entre le relevé et le journal, et ce qui l'explique
  const sum = (list, f) => round2(list.reduce((t, x) => t + (f ? f(x) : x.amount), 0));
  const consideredBook = new Set(matchedBook.concat(bookOnly));
  const mvt = { releve: sum(st.ops), compta: sum(Array.from(consideredBook)) };
  const A = sum(bankRest), B = sum(bookRest), D = sum(doublons, (x) => x.l.amount), C = round2(sum(ecarts, (x) => x.diff) + sum(sens, (x) => x.diff));
  mvt.diff = round2(mvt.releve - mvt.compta);
  mvt.reste = round2(mvt.diff - (A - B - D + C));

  // État de rapprochement à la date de fin du relevé
  const ref = st.closing && st.closing.date >= res.start ? st.closing.date : res.end;
  const num = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
  const releveAuto = st.closing && st.closing.date === ref ? st.closing.amount : st.opening ? round2(st.opening.amount + sum(st.ops.filter((o) => o.date <= ref))) : null;
  const releve = num(st.soldeReleve) !== null ? num(st.soldeReleve) : releveAuto;
  const upTo = (list, f) => sum(list.filter((x) => (f ? f(x) : x).date <= ref), f ? (x) => f(x).amount : null);
  const a = upTo(bankRest), b = upTo(bookRest), d = upTo(doublons, (x) => x.l);
  const c = round2(ecarts.filter((x) => x.o.date <= ref).reduce((t, x) => t + x.diff, 0) + sens.filter((x) => x.o.date <= ref).reduce((t, x) => t + x.diff, 0));
  const attendu = releve === null ? null : round2(releve - a + b + d - c);
  const comptaAuto = hasAN ? res.balanceAt(ref) : null;
  const compta = num(st.soldeCompta) !== null ? num(st.soldeCompta) : comptaAuto;
  const ecart = attendu === null || compta === null ? null : round2(compta - attendu);
  const journal = (() => { const n = {}; lines.forEach((l) => { const j = String(l[4] || '').split(' ')[0]; if (j) n[j] = (n[j] || 0) + 1; }); return Object.keys(n).sort((x, y) => n[y] - n[x])[0] || 'BQ'; })();
  return { accs, bal, hasAN, tol, res, pStart, pEnd, bankRest, bookRest, sens, ecarts, doublons, groups, shifted, mvt, A, B, C, D, ref, releve, releveAuto, a, b, c, d, attendu, compta, comptaAuto, ecart, journal };
}

// Compte suggéré pour une opération non comptabilisée : celui des écritures au même libellé dans le FEC ; à défaut, celui
// de l'écriture rapprochée d'une autre opération du relevé au même libellé (« VIR SEPA CLIENT GAMMA » du 05/10, saisi
// « Règlement CLIENT GAMMA »).
function brapKey(r, lib) {
  const stop = new Set((r.labelIdx && r.labelIdx.stop) || []);
  return norm(lib).replace(/[^a-z ]+/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !stop.has(w)).slice(0, 2).join(' ');
}
function brapSug(st, K, o) {
  const direct = labelSug(st.r, o.label, o.amount > 0);
  if (direct) return direct;
  const k = brapKey(st.r, o.label);
  if (!k) return null;
  const twins = K.res.bank.filter((x) => x.match && x.match.length === 1 && Math.sign(x.amount) === Math.sign(o.amount) && brapKey(st.r, x.label) === k);
  for (const tw of twins) {
    const cp = (st.r.bankCp || {})[tw.match[0].ref];
    // Même présentation que les suggestions de l'analyse : [compte, auxiliaire, libellé, nombre, lettrées, total, date]
    if (cp) return [cp[0], cp[1], cp[2], twins.length, 0, twins.length, tw.date, null, `comme l'opération du ${fmtDate(tw.date)}`];
  }
  return twins.length ? labelSug(st.r, twins[0].match[0].label, o.amount > 0) : null;
}
const brapSugTxt = (sg) => (sg[8] ? `${sg[0]}${sg[1] ? ' ' + sg[1] : ''} ${sg[2]} (${sg[8]})` : sugTxt(sg));

// Écritures à passer pour les opérations non comptabilisées : banque contre le compte suggéré (ou 471 d'attente)
function brapEntries(st, K) {
  return K.bankRest.map((o, i) => {
    const sg = brapSug(st, K, o);
    const amt = Math.abs(o.amount);
    const lib = String(o.label || '').slice(0, 60);
    const accLib = (c) => (st.r.balance.find((x) => x.compte === c) || {}).lib || '';
    const other = sg ? { compte: sg[0], aux: sg[1] ? { num: sg[1], lib: sg[2] } : null, clib: sg[1] ? accLib(sg[0]) : sg[2] || accLib(sg[0]) } : { compte: '471000', aux: null, clib: 'Compte d\'attente' };
    return {
      date: o.date, piece: `RAP${String(i + 1).padStart(3, '0')}`, lib, sug: sg,
      lines: [
        { compte: st.compte, clib: (K.bal || {}).lib || 'Banque', aux: null, lib, d: o.amount > 0 ? amt : 0, c: o.amount < 0 ? amt : 0 },
        { compte: other.compte, clib: other.clib, aux: other.aux, lib, d: o.amount < 0 ? amt : 0, c: o.amount > 0 ? amt : 0 },
      ],
    };
  });
}

async function brapExport(kind) {
  const st = brapState();
  const K = brapCalc(st);
  const ok = await ask({ title: 'Fichier non chiffré', message: `Le fichier contient des opérations bancaires et des noms de tiers <strong>non chiffrés</strong>.${kind === 'xlsx' ? '' : ' Importez-le dans votre logiciel (écritures à vérifier avant validation), puis supprimez-le.'}`, okLabel: 'Exporter' });
  if (!ok) return;
  const base = `rapprochement-${st.compte}-${K.ref}`;
  if (kind === 'fec' || kind === 'ecr') {
    const entries = brapEntries(st, K);
    if (kind === 'fec') {
      const amt = (v) => (v ? v.toFixed(2).replace('.', ',') : '0,00');
      const clean = (s) => String(s || '').replace(/[\t\r\n]+/g, ' ');
      const rows = [['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise'].join('\t')];
      entries.forEach((e, i) => { const dt = e.date.replace(/-/g, ''); e.lines.forEach((l) => rows.push([K.journal, 'Banque', i + 1, dt, l.compte, clean(l.clib), l.aux ? l.aux.num : '', l.aux ? clean(l.aux.lib) : '', e.piece, dt, clean(l.lib), amt(l.d), amt(l.c), '', '', '', '', ''].join('\t'))); });
      download(`${base}-ecritures.txt`, rows.join('\r\n') + '\r\n', 'text/plain;charset=utf-8');
    } else {
      const t = (v, s) => ({ v: v === undefined || v === null ? '' : v, s: s === undefined ? 2 : s });
      const n = (v) => ({ v: Number(v) || 0, s: 8 });
      const rows = [ECR_COLS.map((x) => t(x, 1))];
      entries.forEach((e) => e.lines.forEach((l) => rows.push([t(K.journal), t(fmtDate(e.date)), t(e.piece), t(l.compte), t(l.aux ? l.aux.num : ''), t(l.aux ? l.aux.lib : ''), t(l.clib), t(l.lib), n(l.d), n(l.c)])));
      const blob = XlsxWriter.build({ sheets: [{ name: 'Écritures', rows, widths: [9, 12, 10, 12, 14, 26, 30, 50, 14, 14], freeze: { row: 1 } }] });
      download(`${base}-ecritures.xlsx`, blob, blob.type);
    }
    return;
  }
  const t = (v, s) => ({ v: v === undefined || v === null ? '' : v, s: s === undefined ? 2 : s });
  const n = (v, s) => ({ v: Number(v) || 0, s: s || 8 });
  const d = (iso) => ({ v: XlsxWriter.serial(iso), s: 11 });
  const opRows = (list) => list.map((o) => [d(o.date), t(o.label || ''), n(o.amount), t(o.ref || '')]);
  const H = (cells) => cells.map((x) => t(x, 1));
  const etat = [[{ v: `État de rapprochement — compte ${st.compte} au ${fmtDate(K.ref)}`, s: 10 }], [],
    [t('Solde du relevé', 1), K.releve === null ? t('non fourni') : n(K.releve, 9)],
    [t('− Opérations du relevé non comptabilisées', 1), n(-K.a)], [t('+ Écritures absentes du relevé', 1), n(K.b)],
    [t('+ Doublons probables', 1), n(K.d)], [t('− Écarts de montant et de sens (relevé − comptabilité)', 1), n(-K.c)],
    [t('= Solde comptable attendu', 1), K.attendu === null ? t('') : n(K.attendu, 9)],
    [t('Solde comptable', 1), K.compta === null ? t('non fourni') : n(K.compta, 9)],
    [t('Écart inexpliqué', 1), K.ecart === null ? t('') : n(K.ecart, 9)], [],
    [t('Mouvements du relevé', 1), n(K.mvt.releve)], [t('Mouvements du journal de banque', 1), n(K.mvt.compta)], [t('Différence', 1), n(K.mvt.diff, 9)]];
  const blob = XlsxWriter.build({ sheets: [
    { name: 'État de rapprochement', rows: etat, widths: [55, 18] },
    { name: 'Non comptabilisées', rows: [H(['Date', 'Libellé', 'Montant', 'Compte suggéré'])].concat(K.bankRest.map((o) => { const sg = brapSug(st, K, o); return [d(o.date), t(o.label), n(o.amount), t(sg ? brapSugTxt(sg) : '')]; })), widths: [12, 60, 15, 50], freeze: { row: 1 } },
    { name: 'Absentes du relevé', rows: [H(['Date', 'Libellé', 'Montant', 'Écriture'])].concat(opRows(K.bookRest)), widths: [12, 60, 15, 14], freeze: { row: 1 } },
    { name: 'Montants différents', rows: [H(['Date relevé', 'Libellé relevé', 'Montant relevé', 'Date écriture', 'Libellé écriture', 'Montant comptabilisé', 'Écart', 'Écriture', 'Remarque'])].concat(K.ecarts.concat(K.sens).map((x) => [d(x.o.date), t(x.o.label), n(x.o.amount), d(x.l.date), t(x.l.label), n(x.l.amount), n(x.diff), t(x.l.ref), t(Math.abs(x.o.amount + x.l.amount) < 0.005 ? 'Sens inversé (débit / crédit)' : x.transp ? 'Chiffres inversés' : '')])), widths: [12, 40, 14, 12, 40, 14, 12, 12, 26], freeze: { row: 1 } },
    { name: 'Doublons', rows: [H(['Date', 'Libellé', 'Montant', 'Écriture en double', 'Écriture rapprochée'])].concat(K.doublons.map((x) => [d(x.l.date), t(x.l.label), n(x.l.amount), t(x.l.ref), t(x.twin.ref)])), widths: [12, 50, 14, 16, 16], freeze: { row: 1 } },
  ] });
  download(`${base}.xlsx`, blob, blob.type);
}

// ---------- Écran ----------
function viewBrap() {
  const st = ui.brap || { files: [], errors: [], ops: [] };
  const hasRel = st.ops && st.ops.length;
  const head = `<div class="page-head"><h1>Rapprocher un relevé</h1><div class="head-actions">
      ${st.files.length || st.fec ? '<button class="btn" data-action="brap-clear">Effacer</button>' : ''}</div></div>`;
  const relSlot = `<div class="card fec-drop cmp-slot${hasRel ? ' on' : ''}" data-action="brap-pick-rel" data-side="rel" role="button" tabindex="0">
      <span class="cmp-role">Relevé bancaire</span>
      ${hasRel ? `<strong>${st.files.map((f) => esc(f.name)).join(', ')}</strong>
        <span class="muted small">${st.ops.length} opération(s) du ${fmtDate(st.ops[0].date)} au ${fmtDate(st.ops[st.ops.length - 1].date)}${st.files.some((f) => f.dup) ? ' · opérations en double ignorées' : ''}</span>
        <span class="muted small">Cliquer pour ajouter un autre relevé</span>`
      : `${icon('file', 'fec-drop-ico')}<span><strong>Déposez le relevé</strong> de n'importe quelle banque (PDF, CSV, Excel, OFX, QIF, MT940, CAMT, CFONB) ou cliquez pour le choisir</span>`}
    </div>`;
  const fecSlot = `<div class="card fec-drop cmp-slot${st.fec ? ' on' : ''}" data-action="brap-pick-fec" data-side="fec" role="button" tabindex="0">
      <span class="cmp-role">FEC du journal de banque</span>
      ${st.fec ? `<strong class="cmp-file">${esc(st.fec.name)}</strong>${st.status === 'running' ? '<span class="muted small">Lecture…</span>' : st.r ? `<span class="muted small">${Object.values(st.r.bankLines).reduce((t, l) => t + l.length, 0)} ligne(s) de banque</span>` : ''}<span class="muted small">Cliquer pour changer de fichier</span>`
      : `${icon('chart', 'fec-drop-ico')}<span><strong>Déposez le FEC</strong> exporté pour le seul journal de banque du mois (ou le FEC complet)</span>`}
    </div>`;
  const errs = (st.errors || []).map((e) => `<div class="banner warn"><span>${esc(e)}</span></div>`).join('')
    + (st.status === 'error' ? `<div class="banner warn"><span>${esc(st.message)}</span></div>` : '');
  const slots = `<div class="cmp-slots brap-slots">${relSlot}<span></span>${fecSlot}</div>${errs}`;
  if (!hasRel || !st.r) {
    return `${head}${slots}
      <section class="card"><h2>${icon('help')} Principe</h2><ul>
        <li>Déposez le <strong>relevé bancaire</strong> du mois et le <strong>FEC</strong> exporté pour le seul journal de banque de ce mois (ACD : export FEC limité au journal et à la période ; le FEC complet convient aussi).</li>
        <li>Chaque opération du relevé est recherchée dans le compte de banque : même montant à quelques jours près, puis regroupements (une remise pour plusieurs écritures, ou l'inverse).</li>
        <li>Restent : les <strong>opérations non comptabilisées</strong> (avec le compte déjà utilisé pour le même libellé), les <strong>écritures absentes du relevé</strong> (chèques non encaissés…), les <strong>montants différents</strong> (dont chiffres inversés), les <strong>sens inversés</strong> et les <strong>doublons</strong>. L'état de rapprochement chiffre l'écart restant, et les écritures manquantes s'exportent pour ACD ou Pennylane.</li>
      </ul></section>
      <section class="card"><h2>${icon('shield')} Confidentialité</h2><p>Le relevé et le FEC sont lus <strong>sur cet appareil uniquement</strong> : rien n'est envoyé ni conservé, et tout est effacé au verrouillage.</p></section>`;
  }
  const K = brapCalc(st);
  const { res } = K;
  const tile = (label, value, cls) => `<div class="kpi ${cls || ''}"><strong>${value}</strong><span>${label}</span></div>`;
  const nEcarts = K.ecarts.length + K.sens.length;
  const ok = !K.bankRest.length && !K.bookRest.length && !nEcarts && !K.doublons.length;
  const money = (v) => `<span class="${v < 0 ? 'cred' : ''}">${eur(v)}</span>`;
  const opTable = (list, cols, row) => `<div class="grid-wrap"><table class="dtable cmp-table"><thead><tr>${cols.map((c) => `<th${/Montant|Écart/.test(c) ? ' class="n"' : ''}>${c}</th>`).join('')}</tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>`;
  const sec = (title, count, total, hint, body) => `<section class="card"><div class="card-head"><h2>${title} <span class="count">${count}</span></h2>${total !== null ? `<strong>${eur(total)} €</strong>` : ''}</div>${hint ? `<p class="muted small">${hint}</p>` : ''}${count ? body : '<p class="muted">Aucune.</p>'}</section>`;
  const accOpts = Object.fromEntries(K.accs.map((a) => [a.compte, `${a.compte} — ${a.lib} (${a.hits}/${st.ops.length})`]));
  const inp = (k, v, ph) => `<input type="number" step="0.01" class="brap-amt" data-brap="${k}" value="${esc(v)}" placeholder="${ph === null || ph === undefined ? 'à saisir' : esc(eur(ph))}" aria-label="${k === 'soldeReleve' ? 'Solde du relevé' : 'Solde comptable'}">`;
  const etat = `<section class="card"><h2>État de rapprochement au ${fmtDate(K.ref)}</h2>
      <table class="dtable cmp-table brap-etat"><tbody>
        <tr><td>Solde du relevé${st.closing && st.closing.date === K.ref ? ' (lu sur le relevé)' : st.opening ? ' (solde d\'ouverture + opérations)' : ''}</td><td class="n">${inp('soldeReleve', st.soldeReleve, K.releveAuto)}</td></tr>
        <tr><td>− Opérations du relevé non comptabilisées</td><td class="n">${eur(-K.a)}</td></tr>
        <tr><td>+ Écritures absentes du relevé</td><td class="n">${eur(K.b)}</td></tr>
        ${K.d ? `<tr><td>+ Doublons probables</td><td class="n">${eur(K.d)}</td></tr>` : ''}
        ${K.c ? `<tr><td>− Écarts de montant et de sens (relevé − comptabilité)</td><td class="n">${eur(-K.c)}</td></tr>` : ''}
        <tr class="cmp-strong"><td>= Solde comptable attendu</td><td class="n">${K.attendu === null ? '<span class="muted">solde du relevé à saisir</span>' : eur(K.attendu)}</td></tr>
        <tr><td>Solde comptable du compte ${esc(st.compte)} au ${fmtDate(K.ref)}${K.hasAN ? ' (à-nouveau + mouvements du FEC)' : ' (dans ACD : le FEC du seul journal ne contient pas le solde d\'ouverture)'}</td><td class="n">${inp('soldeCompta', st.soldeCompta, K.comptaAuto)}</td></tr>
        <tr class="cmp-strong"><td>Écart inexpliqué</td><td class="n">${K.ecart === null ? '<span class="muted">—</span>' : `<span class="${Math.abs(K.ecart) >= 0.01 ? 'cred' : ''}">${eur(K.ecart)}</span>`}</td></tr>
      </tbody></table>
      ${K.ecart !== null && Math.abs(K.ecart) >= 0.01 ? '<p class="muted small">Un écart restant vient en général de suspens des mois précédents (chèque émis le mois dernier et débité ce mois-ci, qui apparaît ici comme non comptabilisé) ou d\'une erreur antérieure au mois.</p>' : ''}
    </section>`;
  const mvt = `<section class="card"><h2>Différence entre le relevé et le journal de banque</h2>
      <table class="dtable cmp-table brap-etat"><tbody>
        <tr><td>Mouvements du relevé (${st.ops.length} opérations)</td><td class="n">${eur(K.mvt.releve)}</td></tr>
        <tr><td>Mouvements du journal de banque rapprochés ou de la période</td><td class="n">${eur(K.mvt.compta)}</td></tr>
        <tr class="cmp-strong"><td>Différence</td><td class="n">${money(K.mvt.diff)}</td></tr>
        <tr><td>dont opérations non comptabilisées (${K.bankRest.length})</td><td class="n">${eur(K.A)}</td></tr>
        <tr><td>dont écritures absentes du relevé (${K.bookRest.length})</td><td class="n">${eur(-K.B)}</td></tr>
        ${K.doublons.length ? `<tr><td>dont doublons (${K.doublons.length})</td><td class="n">${eur(-K.D)}</td></tr>` : ''}
        ${nEcarts ? `<tr><td>dont montants ou sens différents (${nEcarts})</td><td class="n">${eur(K.C)}</td></tr>` : ''}
      </tbody></table></section>`;
  const sugCell = (o) => { const sg = brapSug(st, K, o); return sg ? esc(brapSugTxt(sg)) : '<span class="muted">471 — à affecter</span>'; };
  return `${head}${slots}
    <div class="filters">
      <label class="inline-label brap-acc">Compte <select data-brap="compte" aria-label="Compte de banque">${options(accOpts, st.compte)}</select></label>
      <label class="inline-label">Tolérance <input type="number" min="0" max="31" data-brap="tol" value="${K.tol}"> jours</label>
      <button class="btn" data-action="brap-export" data-kind="xlsx">Exporter en Excel</button>
    </div>
    ${ok ? '<div class="banner ok"><span><strong>Relevé et journal de banque concordent</strong> : toutes les opérations sont rapprochées.</span></div>' : ''}
    <div class="kpis fec-kpis">
      ${tile('Opérations rapprochées', `${res.matched} / ${res.bank.length}`)}
      ${tile('Non comptabilisées', K.bankRest.length, K.bankRest.length ? 'kpi-late' : '')}
      ${tile('Absentes du relevé', K.bookRest.length, K.bookRest.length ? 'kpi-wait' : '')}
      ${tile('Montants ou sens différents', nEcarts, nEcarts ? 'kpi-late' : '')}
      ${tile('Doublons probables', K.doublons.length, K.doublons.length ? 'kpi-late' : '')}
      ${tile('Écart inexpliqué', K.ecart === null ? '—' : eur(K.ecart), K.ecart !== null && Math.abs(K.ecart) >= 0.01 ? 'kpi-late' : '')}
    </div>
    ${etat}
    ${mvt}
    ${sec('Opérations du relevé non comptabilisées', K.bankRest.length, K.A, 'À saisir dans le journal de banque. Compte suggéré : celui des écritures au même libellé du FEC (à défaut, 471 en attente d\'affectation).',
    `${opTable(K.bankRest, ['Date', 'Libellé du relevé', 'Montant', 'Compte suggéré'], (o) => `<tr><td>${fmtDate(o.date)}</td><td>${esc(o.label)}</td><td class="n">${money(o.amount)}</td><td class="small">${sugCell(o)}</td></tr>`)}
      <div class="pieces-actions"><button class="btn" data-action="brap-export" data-kind="fec">Écritures à passer (FEC pour ACD / Pennylane)</button><button class="btn" data-action="brap-export" data-kind="ecr">Écritures à passer (Excel)</button></div>`)}
    ${sec('Écritures absentes du relevé', K.bookRest.length, K.B, 'Chèques émis non encaissés, remises en cours (à reporter dans l\'état de rapprochement), ou écritures erronées à corriger.',
    opTable(K.bookRest, ['Date', 'Libellé', 'Montant', 'Écriture'], (l) => `<tr><td>${fmtDate(l.date)}</td><td>${esc(l.label)}</td><td class="n">${money(l.amount)}</td><td>${esc(l.ref || '')}</td></tr>`))}
    ${sec('Montants ou sens différents', nEcarts, null, 'Même opération, comptabilisée pour un autre montant ou dans l\'autre sens : l\'écriture est à corriger.',
    opTable(K.sens.concat(K.ecarts), ['Relevé', 'Montant relevé', 'Écriture', 'Montant comptabilisé', 'Écart', 'Remarque'], (x) => `<tr><td>${fmtDate(x.o.date)} · ${esc(x.o.label)}</td><td class="n">${money(x.o.amount)}</td><td>${fmtDate(x.l.date)} · ${esc(x.l.ref || '')} · ${esc(x.l.label)}</td><td class="n">${money(x.l.amount)}</td><td class="n"><strong>${eur(x.diff)}</strong></td><td class="small">${Math.abs(x.o.amount + x.l.amount) < 0.005 ? 'Sens inversé (débit / crédit)' : x.transp ? 'Chiffres inversés' : ''}</td></tr>`))}
    ${sec('Doublons probables', K.doublons.length, K.D, 'Écriture passée deux fois : une seule figure sur le relevé.',
    opTable(K.doublons, ['Date', 'Libellé', 'Montant', 'Écriture en double', 'Déjà rapprochée'], (x) => `<tr><td>${fmtDate(x.l.date)}</td><td>${esc(x.l.label)}</td><td class="n">${money(x.l.amount)}</td><td>${esc(x.l.ref || '')}</td><td>${esc(x.twin.ref || '')} du ${fmtDate(x.twin.date)}</td></tr>`))}
    <section class="card"><details><summary><h2>Opérations rapprochées <span class="count">${res.matched}</span></h2></summary>
      <p class="muted small">${K.groups.length ? `${K.groups.length} regroupement(s) (une opération du relevé pour plusieurs écritures, ou l'inverse). ` : ''}${K.shifted ? `${K.shifted} opération(s) rapprochée(s) à une autre date (tolérance de ${K.tol} jours). ` : ''}</p>
      ${opTable(res.bank.filter((o) => o.match), ['Date', 'Libellé du relevé', 'Montant', 'Écriture(s)'], (o) => `<tr><td>${fmtDate(o.date)}</td><td>${esc(o.label)}</td><td class="n">${money(o.amount)}</td><td class="small">${o.match.map((l) => `${fmtDate(l.date)} · ${esc(l.ref || '')}${o.match.length > 1 ? ` · ${eur(l.amount)}` : ''}`).join('<br>')}</td></tr>`)}
    </details></section>`;
}

function onBrapChange(t) {
  const st = brapState();
  const k = t.dataset.brap;
  if (k === 'compte') { st.compte = t.value; st.soldeCompta = ''; refresh(); }
  else if (k === 'tol') { st.tol = Math.max(0, Math.min(31, Number(t.value) || 0)); refresh(); }
  else if (k === 'soldeReleve' || k === 'soldeCompta') { st[k] = t.value; refresh(); }
}
