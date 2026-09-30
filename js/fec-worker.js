/*
 * Analyse d'un Fichier des Écritures Comptables (FEC, art. A47 A-1 du LPF).
 *
 * Exécuté dans un Web Worker : le fichier est lu et analysé sur l'appareil,
 * sans jamais être envoyé ni conservé. Reçoit { buffer, fileName }, renvoie
 * { type: 'progress', pct } puis { type: 'done', result } ou { type: 'error', message }.
 */
'use strict';

const COLS = ['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib',
  'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise'];
const COLS_BNC = ['DateRglt', 'ModeRglt', 'NatOp', 'IdClient'];
const REQUIRED = ['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'PieceRef', 'PieceDate', 'EcritureLib', 'ValidDate'];
const MAX_EXAMPLES = 8;

self.onmessage = (e) => {
  try {
    self.postMessage({ type: 'done', result: analyse(e.data.buffer, e.data.fileName || '') });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || String(err) });
  }
};

// ---------- Utilitaires ----------

function decode(buffer) {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buffer), encoding: 'UTF-8' };
  } catch (e) {
    return { text: new TextDecoder('iso-8859-15').decode(buffer), encoding: 'ISO-8859-15' };
  }
}

const pad = (n) => String(n).padStart(2, '0');
const round2 = (n) => Math.round(n * 100) / 100 || 0;

// Renvoie AAAA-MM-JJ, ou null ; `std` indique le format réglementaire AAAAMMJJ.
function parseDate(s) {
  s = (s || '').trim();
  let y, m, d, std = false;
  let r = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (r) { [, y, m, d] = r; std = true; }
  else if ((r = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) [, y, m, d] = r;
  else if ((r = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) [, d, m, y] = r;
  else return { iso: null, std: false };
  const dt = new Date(Date.UTC(+y, +m - 1, +d));
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +m - 1 || dt.getUTCDate() !== +d) return { iso: null, std: false };
  return { iso: `${y}-${m}-${d}`, std };
}

function parseAmount(s) {
  s = (s || '').replace(/[\s  ]/g, '');
  if (s === '') return 0;
  if (!/^[+-]?\d+([.,]\d+)?$/.test(s)) return NaN;
  return parseFloat(s.replace(',', '.'));
}

function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return Date.UTC(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1);
}
const FERIES = ['01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25'];
const holidayCache = {};
function dayKind(iso) {
  const t = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  if (new Date(t).getUTCDay() === 0) return 'dimanche';
  if (FERIES.includes(iso.slice(5))) return 'jour férié';
  const y = +iso.slice(0, 4);
  const e = (holidayCache[y] = holidayCache[y] || easter(y));
  const diff = Math.round((t - e) / 86400000);
  return [1, 39, 50].includes(diff) ? 'jour férié' : '';
}

const normTxt = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const STOP = new Set(['prlv', 'prelevement', 'prel', 'sepa', 'cb', 'carte', 'vir', 'virement', 'recu', 'emis', 'du', 'de', 'des', 'le', 'la', 'les', 'ref',
  'fact', 'facture', 'echeance', 'ech', 'paiement', 'pmt', 'achat', 'sa', 'sas', 'sarl', 'fr', 'france', 'europe', 'et', 'pour', 'mois', 'avis']);
// Clé de regroupement d'un libellé bancaire (« PRLV SEPA ORANGE 0425 » → « orange »).
function labelKey(s) {
  const words = normTxt(s).replace(/[^a-z ]+/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
  return words.slice(0, 2).join(' ') || '?';
}

const isAN = (code, lib) => /^(AN|ANO|RAN|OUV|NOUV|A-N|A\.N)/i.test(code) || /nouveau|ouverture|report/i.test(lib);
const fmt = (n) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------- Analyse ----------

function analyse(buffer, fileName) {
  const { text, encoding } = decode(buffer);
  const checks = [];
  const add = (id, label, level, count, detail, examples) => checks.push({ id, label, level, count, detail: detail || '', examples: examples || [] });

  // Nom du fichier : SIRENFECAAAAMMJJ
  const nameMatch = fileName.match(/(\d{9})FEC(\d{8})/i);
  const siren = nameMatch ? nameMatch[1] : '';
  const closing = nameMatch ? parseDate(nameMatch[2]).iso : null;
  add('nom', 'Nom du fichier au format SIRENFECAAAAMMJJ', nameMatch && closing ? 'ok' : 'warn', nameMatch && closing ? 0 : 1,
    nameMatch && closing ? `SIREN ${siren}, clôture le ${closing.split('-').reverse().join('/')}` : `« ${fileName} » : le nom attendu est du type 123456789FEC20251231.txt`);

  // Première ligne : en-tête et séparateur
  let pos = 0;
  let end = text.indexOf('\n');
  const headerLine = (end < 0 ? text : text.slice(0, end)).replace(/^﻿/, '').replace(/\r$/, '');
  const counts = { '\t': headerLine.split('\t').length - 1, '|': headerLine.split('|').length - 1, ';': headerLine.split(';').length - 1 };
  let sep = counts['\t'] >= counts['|'] ? '\t' : '|';
  if (!counts['\t'] && !counts['|']) {
    if (!counts[';']) throw new Error("Impossible de lire l'en-tête : le fichier ne semble pas être un FEC (séparateur tabulation ou « | » attendu).");
    sep = ';';
  }
  add('sep', 'Séparateur de zones (tabulation ou « | »)', sep === ';' ? 'error' : 'ok', sep === ';' ? 1 : 0,
    sep === '\t' ? 'Tabulation' : sep === '|' ? 'Barre verticale' : 'Point-virgule : non conforme à l\'article A47 A-1');
  add('enc', 'Encodage des caractères', 'ok', 0, encoding);

  const header = headerLine.split(sep).map((h) => h.trim());
  const idx = {};
  header.forEach((h, i) => { idx[h.toLowerCase()] = i; });
  const col = (name) => (idx[name.toLowerCase()] === undefined ? -1 : idx[name.toLowerCase()]);
  const montantSens = col('Debit') < 0 && col('Montant') >= 0 && col('Sens') >= 0;
  const expected = montantSens ? COLS.map((c) => (c === 'Debit' ? 'Montant' : c === 'Credit' ? 'Sens' : c)) : COLS;
  const missing = expected.filter((c) => col(c) < 0);
  const bnc = COLS_BNC.every((c) => col(c) >= 0);
  const orderOk = expected.every((c, i) => header[i] && header[i].toLowerCase() === c.toLowerCase());
  const caseOk = expected.every((c) => col(c) < 0 || header[col(c)] === c);
  if (missing.length) add('cols', 'Colonnes réglementaires présentes', 'error', missing.length, `Manquantes : ${missing.join(', ')}`);
  else add('cols', 'Colonnes réglementaires présentes', orderOk && caseOk ? 'ok' : 'warn', orderOk && caseOk ? 0 : 1,
    `${header.length} colonnes${bnc ? ' (format BNC / BA en comptabilité de trésorerie)' : ''}${montantSens ? ' (variante Montant / Sens)' : ''}${orderOk ? '' : ' — ordre différent de l\'ordre réglementaire'}${caseOk ? '' : ' — casse des intitulés différente'}`);
  if (missing.some((c) => ['JournalCode', 'EcritureNum', 'EcritureDate', 'CompteNum'].includes(c)) || (!montantSens && (col('Debit') < 0 || col('Credit') < 0))) {
    throw new Error(`Colonnes indispensables absentes (${missing.join(', ')}) : analyse impossible.`);
  }
  const I = {};
  COLS.concat(['Montant', 'Sens']).forEach((c) => { I[c] = col(c); });

  // Compteurs et agrégats
  const ex = {}; // exemples par contrôle
  const cnt = {};
  const bump = (k, example) => {
    cnt[k] = (cnt[k] || 0) + 1;
    if (example && (ex[k] = ex[k] || []).length < MAX_EXAMPLES) ex[k].push(example);
  };
  const reqEmpty = {};
  REQUIRED.forEach((f) => { reqEmpty[f] = 0; });
  const accounts = new Map();
  const aux = new Map();
  const journals = new Map();
  const entries = new Map();
  const months = new Map();
  const caisse = [];
  const dupSeen = new Map();
  const benford = new Array(10).fill(0);
  let totalD = 0, totalC = 0, lines = 0, minDate = '9999', maxDate = '0000', hasAN = false, minOp = '9999', maxOp = '0000';
  // Données pour la demande de pièces
  const bankMonths = new Map();
  const supInv = new Map();
  const payroll = {};
  const attenteLines = [], immoLines = [], ccaLines = [], chargeLines = [];
  const flags = {};
  const start = closing ? (() => { const d = new Date(Date.UTC(+closing.slice(0, 4) - 1, +closing.slice(5, 7) - 1, +closing.slice(8, 10) + 1)); return d.toISOString().slice(0, 10); })() : null;

  let lineNo = 1;
  const total = text.length;
  let nextProgress = 0;
  pos = end < 0 ? total : end + 1;
  while (pos < total) {
    end = text.indexOf('\n', pos);
    if (end < 0) end = total;
    let line = text.slice(pos, end);
    pos = end + 1;
    lineNo++;
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (!line.trim()) continue;
    if (pos > nextProgress) {
      self.postMessage({ type: 'progress', pct: Math.round((pos / total) * 100) });
      nextProgress = pos + total / 50;
    }
    lines++;
    const f = line.split(sep);
    if (f.length !== header.length) bump('nbcol', `Ligne ${lineNo} : ${f.length} zones au lieu de ${header.length}`);
    const g = (k) => (I[k] >= 0 && f[I[k]] !== undefined ? f[I[k]].trim() : '');

    const jc = g('JournalCode'), jl = g('JournalLib'), num = g('EcritureNum'), compte = g('CompteNum'), clib = g('CompteLib');
    const auxNum = g('CompAuxNum'), auxLib = g('CompAuxLib'), piece = g('PieceRef'), elib = g('EcritureLib');
    let d, c;
    if (montantSens) {
      const m = parseAmount(g('Montant'));
      const s = g('Sens').toUpperCase();
      const debitSide = s === 'D' || s === '+1' || s === '1';
      d = debitSide ? m : 0;
      c = debitSide ? 0 : m;
    } else {
      d = parseAmount(g('Debit'));
      c = parseAmount(g('Credit'));
    }
    const short = () => `Ligne ${lineNo} · ${jc} ${num} · ${g('EcritureDate')} · ${compte} ${clib.slice(0, 30)} · ${elib.slice(0, 40)} · D ${g('Debit') || g('Montant')} C ${g('Credit') || g('Sens')}`;
    if (Number.isNaN(d) || Number.isNaN(c)) {
      bump('montant', short());
      d = Number.isNaN(d) ? 0 : d;
      c = Number.isNaN(c) ? 0 : c;
    }
    if (d < 0 || c < 0) bump('negatif', short());
    if (d !== 0 && c !== 0) bump('debcred', short());
    if (d === 0 && c === 0) bump('zero', short());

    REQUIRED.forEach((k) => { if (I[k] >= 0 && !g(k)) reqEmpty[k]++; });
    if (REQUIRED.some((k) => I[k] >= 0 && !g(k))) bump('oblig', short());

    const ed = parseDate(g('EcritureDate'));
    const pd = parseDate(g('PieceDate'));
    const vd = parseDate(g('ValidDate'));
    if (!ed.iso) bump('date', `${short()} (date d'écriture)`);
    else if (!ed.std) bump('datefmt', short());
    if (g('PieceDate') && !pd.iso) bump('date', `${short()} (date de pièce)`);
    if (g('ValidDate') && !vd.iso) bump('date', `${short()} (date de validation)`);
    if (g('DateLet') && !parseDate(g('DateLet')).iso) bump('date', `${short()} (date de lettrage)`);

    const an = isAN(jc, jl);
    if (an) hasAN = true;
    const date = ed.iso || '';
    if (date) {
      if (date < minDate) minDate = date;
      if (date > maxDate) maxDate = date;
      if (closing && date > closing) bump('apresclo', short());
      if (start && date < start && !an) bump('avantex', short());
    }

    if (!/^\d{3}/.test(compte)) bump('compte', short());
    else if (!'1234567'.includes(compte[0])) bump('classe', short());
    if (!!auxNum !== !!auxLib) bump('aux', short());
    if (!!g('EcritureLet') !== !!g('DateLet')) bump('lettrage', short());
    const md = g('Montantdevise'), dev = g('Idevise');
    if ((md && parseAmount(md) !== 0 && !dev) || (dev && !md)) bump('devise', short());

    totalD += d;
    totalC += c;

    // Comptes
    let a = accounts.get(compte);
    if (!a) accounts.set(compte, (a = { compte, lib: clib, d: 0, c: 0, libs: 0, dAN: 0, cAN: 0 }));
    else if (clib && a.lib !== clib) { if (!a.libs) bump('libcompte', `Compte ${compte} : « ${a.lib} » / « ${clib} »`); a.libs++; }
    a.d += d;
    a.c += c;
    if (an) { a.dAN += d; a.cAN += c; }

    // Comptes auxiliaires de tiers
    if (/^4[01]/.test(compte)) {
      const k = compte.slice(0, 3) + '|' + (auxNum || compte);
      let t = aux.get(k);
      if (!t) aux.set(k, (t = { racine: compte.slice(0, 3), num: auxNum || compte, lib: auxLib || clib, d: 0, c: 0 }));
      t.d += d;
      t.c += c;
      if (date && !an) {
        if (d > 0 && date > (t.lastD || '')) t.lastD = date;
        if (c > 0 && date > (t.lastC || '')) t.lastC = date;
      }
    }

    // Journaux et écritures
    let j = journals.get(jc);
    if (!j) journals.set(jc, (j = { code: jc, lib: jl, lines: 0, entries: 0, d: 0, c: 0, an }));
    j.lines++;
    j.d += d;
    j.c += c;
    const ek = jc + '\u0001' + num;
    let en = entries.get(ek);
    if (!en) {
      entries.set(ek, (en = { jc, num, date, valid: vd.iso || date, d: 0, c: 0, line: lineNo, an, lib: elib }));
      j.entries++;
    } else if (date && en.date && en.date !== date) {
      if (!en.multi) bump('numdate', `Journal ${jc}, écriture ${num} : ${en.date} et ${date}`);
      en.multi = true;
    }
    en.d += d;
    en.c += c;
    if (/^5[13]/.test(compte)) en.has5 = true;
    if (/^4[01]/.test(compte)) en.has4 = true;

    // Demande de pièces : relevés, factures récurrentes, opérations à justifier
    if (/^3|^603/.test(compte)) flags.stock = true;
    if (compte.startsWith('16')) flags.emprunt = true;
    if (compte.startsWith('612')) flags.leasing = true;
    if (compte.startsWith('641')) flags.salaires = true;
    if (compte.startsWith('53')) flags.caisse = true;
    if (compte.startsWith('2182')) flags.vehicules = true;
    if (compte.startsWith('455')) flags.cca = true;
    if (compte.startsWith('635')) flags.taxes = true;
    if (compte.startsWith('616')) flags.assurance = true;
    if (date && !an) {
      const ym = date.slice(0, 7);
      if (date < minOp) minOp = date;
      if (date > maxOp) maxOp = date;
      if (compte.startsWith('51')) {
        let bk = bankMonths.get(compte);
        if (!bk) bankMonths.set(compte, (bk = { compte, lib: clib, months: {}, first: date, last: date }));
        bk.months[ym] = (bk.months[ym] || 0) + 1;
        if (date < bk.first) bk.first = date;
        if (date > bk.last) bk.last = date;
      }
      if (compte.startsWith('401') && c > 0) {
        const k = auxNum || compte;
        let sp = supInv.get(k);
        if (!sp) supInv.set(k, (sp = { num: k, lib: auxLib || clib, months: {} }));
        sp.months[ym] = (sp.months[ym] || 0) + c;
      }
      if (compte.startsWith('641') && d > 0) payroll[ym] = (payroll[ym] || 0) + d;
      if (/^47[1-8]/.test(compte) && attenteLines.length < 400) attenteLines.push({ date, compte, lib: elib, d, c, lettre: !!g('EcritureLet') });
      if (/^2[0-7]/.test(compte) && d > 0 && immoLines.length < 300) immoLines.push({ date, compte, clib, lib: elib, montant: d });
      if (compte.startsWith('455') && ccaLines.length < 300) ccaLines.push({ date, lib: elib, d, c });
      if (compte[0] === '6' && d > 0) chargeLines.push([ek, compte, clib, elib, d, date]);
    }

    // Mensuel
    if (date) {
      const mk = date.slice(0, 7);
      let mo = months.get(mk);
      if (!mo) months.set(mk, (mo = { mois: mk, ca: 0, produits: 0, charges: 0, tvaCollectee: 0, tvaDeductible: 0, treso: 0 }));
      const cl = compte[0];
      if (cl === '7') { mo.produits += c - d; if (compte.startsWith('70')) mo.ca += c - d; }
      else if (cl === '6') mo.charges += d - c;
      if (compte.startsWith('4457')) mo.tvaCollectee += c - d;
      if (compte.startsWith('4456')) mo.tvaDeductible += d - c;
      if (/^5[1-3]/.test(compte)) mo.treso += d - c;
    }

    // Caisse
    if (compte.startsWith('53') && date) caisse.push([date, d - c]);

    // Doublons potentiels (même compte, date, montant et pièce dans deux écritures différentes)
    const amt = d || c;
    if (amt > 0 && date && !an && /^(401|411|6|7)/.test(compte)) {
      const dk = `${compte}|${auxNum}|${date}|${d}|${c}|${piece}`;
      const prev = dupSeen.get(dk);
      if (prev === undefined) dupSeen.set(dk, ek);
      else if (prev !== ek) bump('doublon', short());
    }

    // Loi de Benford (premier chiffre significatif des montants ≥ 10)
    if (amt >= 10 && !an) benford[+String(Math.floor(amt))[0]]++;
  }
  self.postMessage({ type: 'progress', pct: 100 });
  if (!lines) throw new Error('Le fichier ne contient aucune écriture.');

  // Écritures déséquilibrées, dates atypiques, numérotation
  const numsByJournal = new Map();
  let allNumeric = true;
  const globalNums = new Set();
  let unbalanced = 0;
  const unbalancedEx = [];
  const atypical = { dimanche: 0, 'jour férié': 0 };
  const atypicalEx = [];
  entries.forEach((en) => {
    const diff = round2(en.d - en.c);
    if (Math.abs(diff) >= 0.01) {
      unbalanced++;
      if (unbalancedEx.length < MAX_EXAMPLES) unbalancedEx.push(`Journal ${en.jc}, écriture ${en.num} du ${en.date} (ligne ${en.line}) : écart ${fmt(diff)} €`);
    }
    if (en.date && !en.an) {
      const kind = dayKind(en.date);
      if (kind) {
        atypical[kind]++;
        if (atypicalEx.length < MAX_EXAMPLES) atypicalEx.push(`${kind} ${en.date.split('-').reverse().join('/')} : journal ${en.jc}, écriture ${en.num} — ${en.lib.slice(0, 50)}`);
      }
    }
    if (/^\d+$/.test(en.num)) {
      if (!numsByJournal.has(en.jc)) numsByJournal.set(en.jc, []);
      numsByJournal.get(en.jc).push([+en.num, en.valid]);
      globalNums.add(+en.num);
    } else allNumeric = false;
  });
  // Numérotation : globale si les numéros sont uniques sur tout le fichier, sinon par journal.
  let gaps = 0, inversions = 0;
  const invEx = [];
  const seqs = allNumeric && globalNums.size === entries.size
    ? [Array.from(numsByJournal.values()).flat()]
    : Array.from(numsByJournal.values());
  seqs.forEach((list) => {
    list.sort((x, y) => x[0] - y[0]);
    for (let i = 1; i < list.length; i++) {
      gaps += Math.max(0, list[i][0] - list[i - 1][0] - 1);
      if (list[i][1] && list[i - 1][1] && list[i][1] < list[i - 1][1]) {
        inversions++;
        if (invEx.length < MAX_EXAMPLES) invEx.push(`N° ${list[i - 1][0]} validée le ${list[i - 1][1]} puis n° ${list[i][0]} validée le ${list[i][1]}`);
      }
    }
  });

  const diffTotal = round2(totalD - totalC);
  const reqDetail = Object.entries(reqEmpty).filter(([, n]) => n).map(([k, n]) => `${k} : ${n}`).join(' · ');

  add('equil', 'Chaque écriture est équilibrée (débit = crédit)', unbalanced ? 'error' : 'ok', unbalanced, unbalanced ? `${unbalanced} écriture(s) déséquilibrée(s)` : `${entries.size} écritures équilibrées`, unbalancedEx);
  add('balance', 'Balance générale équilibrée', Math.abs(diffTotal) >= 0.01 ? 'error' : 'ok', Math.abs(diffTotal) >= 0.01 ? 1 : 0, `Débit ${fmt(totalD)} € · Crédit ${fmt(totalC)} €${Math.abs(diffTotal) >= 0.01 ? ` · écart ${fmt(diffTotal)} €` : ''}`);
  add('nbcol', 'Nombre de zones identique sur chaque ligne', cnt.nbcol ? 'error' : 'ok', cnt.nbcol || 0, '', ex.nbcol);
  add('oblig', 'Zones obligatoires renseignées', cnt.oblig ? 'error' : 'ok', cnt.oblig || 0, reqDetail || 'Toutes renseignées', ex.oblig);
  add('date', 'Dates valides', cnt.date ? 'error' : 'ok', cnt.date || 0, '', ex.date);
  add('datefmt', 'Dates au format AAAAMMJJ', cnt.datefmt ? 'warn' : 'ok', cnt.datefmt || 0, '', ex.datefmt);
  add('montant', 'Montants numériques', cnt.montant ? 'error' : 'ok', cnt.montant || 0, '', ex.montant);
  add('numdate', 'Une écriture = une seule date', cnt.numdate ? 'error' : 'ok', cnt.numdate || 0, 'Un même n° d\'écriture ne doit pas porter plusieurs dates', ex.numdate);
  if (closing) {
    add('apresclo', 'Aucune écriture postérieure à la clôture', cnt.apresclo ? 'error' : 'ok', cnt.apresclo || 0, '', ex.apresclo);
    add('avantex', 'Écritures dans l\'exercice (12 mois présumés)', cnt.avantex ? 'warn' : 'ok', cnt.avantex || 0, cnt.avantex ? 'Exercice de plus de 12 mois ou écritures antérieures ?' : '', ex.avantex);
  }
  add('chrono', 'Numérotation chronologique (ordre de validation)', inversions ? 'warn' : 'ok', inversions, `${inversions ? 'Numéros attribués dans un ordre différent des dates de validation. ' : ''}${gaps ? `${gaps} numéro(s) manquant(s) dans la séquence (information).` : ''}`, invEx);
  add('compte', 'Numéros de compte conformes au PCG (3 premiers caractères numériques)', cnt.compte ? 'error' : 'ok', cnt.compte || 0, '', ex.compte);
  add('classe', 'Comptes des classes 1 à 7', cnt.classe ? 'warn' : 'ok', cnt.classe || 0, 'Classes 8 et 9 : engagements, comptabilité analytique', ex.classe);
  add('libcompte', 'Un libellé unique par compte', cnt.libcompte ? 'warn' : 'ok', cnt.libcompte || 0, '', ex.libcompte);
  add('aux', 'Compte auxiliaire : numéro et libellé renseignés ensemble', cnt.aux ? 'warn' : 'ok', cnt.aux || 0, '', ex.aux);
  add('lettrage', 'Lettrage : code et date renseignés ensemble', cnt.lettrage ? 'warn' : 'ok', cnt.lettrage || 0, '', ex.lettrage);
  add('devise', 'Devise : montant et code renseignés ensemble', cnt.devise ? 'warn' : 'ok', cnt.devise || 0, '', ex.devise);
  add('negatif', 'Pas de montant négatif', cnt.negatif ? 'warn' : 'ok', cnt.negatif || 0, '', ex.negatif);
  add('debcred', 'Pas de ligne à la fois au débit et au crédit', cnt.debcred ? 'warn' : 'ok', cnt.debcred || 0, '', ex.debcred);
  add('zero', 'Lignes à montant nul', cnt.zero ? 'info' : 'ok', cnt.zero || 0, '', ex.zero);

  // ---------- Balance, SIG, bilan ----------
  const balance = Array.from(accounts.values())
    .map((x) => ({ compte: x.compte, lib: x.lib, d: round2(x.d), c: round2(x.c), s: round2(x.d - x.c), an: round2(x.dAN - x.cAN) }))
    .sort((x, y) => x.compte.localeCompare(y.compte));
  const sum = (pref, excl, fn) => balance.reduce((t, x) => (pref.some((p) => x.compte.startsWith(p)) && !(excl || []).some((p) => x.compte.startsWith(p)) ? t + fn(x) : t), 0);
  const D = (pref, excl) => round2(sum(pref, excl, (x) => x.s));
  const P = (pref, excl) => round2(-sum(pref, excl, (x) => x.s));

  const ventesMarch = P(['707', '7097']);
  const coutMarch = D(['607', '6087', '6097', '6037']);
  const marge = round2(ventesMarch - coutMarch);
  const production = round2(P(['70'], ['707', '7097']) + P(['71']) + P(['72']));
  const conso = D(['601', '602', '6031', '6032', '604', '605', '606', '608', '609', '61', '62'], ['6087', '6097']);
  const va = round2(marge + production - conso);
  const ebe = round2(va + P(['74']) - D(['63']) - D(['64']));
  const rex = round2(ebe + P(['75', '781', '791']) - D(['65', '681']));
  const rfi = round2(P(['76', '786', '796']) - D(['66', '686']));
  const rexc = round2(P(['77', '787', '797']) - D(['67', '687']));
  const impot = D(['69']);
  const resultat = round2(P(['7']) - D(['6']));
  const sig = [
    ['Chiffre d\'affaires net', P(['70'])],
    ['Ventes de marchandises', ventesMarch],
    ['Coût d\'achat des marchandises vendues', coutMarch],
    ['Marge commerciale', marge, true],
    ['Production de l\'exercice', production],
    ['Consommations en provenance de tiers', conso],
    ['Valeur ajoutée', va, true],
    ['Subventions d\'exploitation', P(['74'])],
    ['Impôts et taxes', D(['63'])],
    ['Charges de personnel', D(['64'])],
    ['Excédent brut d\'exploitation (EBE)', ebe, true],
    ['Résultat d\'exploitation', rex, true],
    ['Résultat financier', rfi],
    ['Résultat courant avant impôt', round2(rex + rfi), true],
    ['Résultat exceptionnel', rexc],
    ['Participation et impôt sur les bénéfices', impot],
    ['Résultat net', resultat, true],
  ].map(([label, value, strong]) => ({ label, value, strong: !!strong }));

  const bal4 = (fn) => round2(balance.filter((x) => /^[45]/.test(x.compte)).reduce((t, x) => t + fn(x), 0));
  const debit = (x) => (x.s > 0 ? x.s : 0);
  const credit = (x) => (x.s < 0 ? -x.s : 0);
  const immo = D(['2']);
  const stocks = D(['3']);
  const creances = bal4((x) => (x.compte[0] === '4' ? debit(x) : 0));
  const tresoActif = bal4((x) => (x.compte[0] === '5' ? debit(x) : 0));
  const cp = round2(P(['10', '11', '12', '13', '14']) + resultat);
  const provisions = P(['15']);
  const dettesFin = round2(P(['16', '17']) + bal4((x) => (x.compte[0] === '5' ? credit(x) : 0)));
  const fournisseurs = bal4((x) => (x.compte.startsWith('40') ? credit(x) : 0));
  const fiscSoc = bal4((x) => (/^4[234]/.test(x.compte) ? credit(x) : 0));
  const autresDettes = bal4((x) => (/^4[15-9]/.test(x.compte) ? credit(x) : 0));
  const totalActif = round2(immo + stocks + creances + tresoActif);
  const totalPassif = round2(cp + provisions + dettesFin + fournisseurs + fiscSoc + autresDettes);
  const bilan = {
    actif: [['Immobilisations nettes', immo], ['Stocks', stocks], ['Créances', creances], ['Trésorerie', tresoActif]],
    passif: [['Capitaux propres (dont résultat)', cp], ['Provisions', provisions], ['Emprunts et dettes financières', dettesFin], ['Fournisseurs', fournisseurs], ['Dettes fiscales et sociales', fiscSoc], ['Autres dettes', autresDettes]],
    totalActif, totalPassif,
  };

  // ---------- Mensuel ----------
  let cumul = 0;
  const monthly = Array.from(months.values()).sort((x, y) => x.mois.localeCompare(y.mois)).map((m) => {
    cumul += m.treso;
    return { mois: m.mois, ca: round2(m.ca), produits: round2(m.produits), charges: round2(m.charges), tvaCollectee: round2(m.tvaCollectee), tvaDeductible: round2(m.tvaDeductible), tresorerie: round2(cumul) };
  });

  // ---------- Points de révision ----------
  const alerts = [];
  const alert = (level, label, detail, examples) => alerts.push({ level, label, detail, examples: examples || [] });

  if (!hasAN) alert('warn', 'Pas d\'écritures d\'à-nouveaux détectées', 'Sans à-nouveaux, les soldes de bilan (trésorerie, tiers, capitaux) sont incomplets : le bilan simplifié n\'est qu\'indicatif.');
  if (Math.abs(totalActif - totalPassif) >= 1 && hasAN) alert('info', 'Bilan simplifié non équilibré', `Actif ${fmt(totalActif)} € / Passif ${fmt(totalPassif)} € : vérifier l'affectation du résultat antérieur et les comptes de liaison.`);

  // Caisse créditrice
  caisse.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  let solde = 0, minSolde = 0, negDays = 0;
  const negEx = [];
  for (let i = 0; i < caisse.length; i++) {
    solde += caisse[i][1];
    if (i === caisse.length - 1 || caisse[i + 1][0] !== caisse[i][0]) {
      if (solde < -0.005) {
        negDays++;
        if (negEx.length < MAX_EXAMPLES) negEx.push(`${caisse[i][0].split('-').reverse().join('/')} : solde ${fmt(round2(solde))} €`);
      }
      minSolde = Math.min(minSolde, solde);
    }
  }
  if (negDays) alert('error', 'Caisse créditrice', `Solde de caisse négatif sur ${negDays} jour(s) (minimum ${fmt(round2(minSolde))} €) : une caisse ne peut pas être créditrice, risque de rejet de comptabilité.`, negEx);

  const attente = balance.filter((x) => /^47[1-8]/.test(x.compte) && Math.abs(x.s) >= 0.01);
  if (attente.length) alert('warn', 'Comptes d\'attente non soldés', `${attente.length} compte(s) 471 à 478 à régulariser avant la clôture.`, attente.slice(0, MAX_EXAMPLES).map((x) => `${x.compte} ${x.lib} : ${fmt(x.s)} €`));

  const auxList = Array.from(aux.values()).map((t) => ({ ...t, d: round2(t.d), c: round2(t.c), s: round2(t.d - t.c) }));
  const clientsCred = auxList.filter((t) => t.racine === '411' && t.s <= -0.01).sort((x, y) => x.s - y.s);
  if (clientsCred.length) alert('warn', 'Clients créditeurs', `${clientsCred.length} client(s) au solde créditeur : avoir, double règlement ou facture non saisie ?`, clientsCred.slice(0, MAX_EXAMPLES).map((t) => `${t.num} ${t.lib} : ${fmt(t.s)} €`));
  const fournDeb = auxList.filter((t) => t.racine === '401' && t.s >= 0.01).sort((x, y) => y.s - x.s);
  if (fournDeb.length) alert('warn', 'Fournisseurs débiteurs', `${fournDeb.length} fournisseur(s) au solde débiteur : facture manquante ou double paiement ?`, fournDeb.slice(0, MAX_EXAMPLES).map((t) => `${t.num} ${t.lib} : ${fmt(t.s)} €`));

  const ccaDeb = balance.filter((x) => x.compte.startsWith('455') && x.s >= 0.01);
  if (ccaDeb.length) alert('error', 'Compte courant d\'associé débiteur', 'Interdit dans les SARL et SA pour les associés personnes physiques (art. L223-21 et L225-43 C. com.) ; risque d\'abus de biens sociaux et de réintégration fiscale.', ccaDeb.map((x) => `${x.compte} ${x.lib} : ${fmt(x.s)} €`));

  const banqueCred = balance.filter((x) => x.compte.startsWith('512') && x.s <= -0.01);
  if (banqueCred.length) alert('info', 'Banque créditrice en fin de période', 'Découvert à reclasser en dettes financières au bilan, ou rapprochement bancaire à vérifier.', banqueCred.map((x) => `${x.compte} ${x.lib} : ${fmt(x.s)} €`));

  if (cnt.doublon) alert('warn', 'Doublons potentiels', `${cnt.doublon} ligne(s) identique(s) (compte, date, montant, pièce) dans des écritures différentes.`, ex.doublon);
  const nAtyp = atypical.dimanche + atypical['jour férié'];
  if (nAtyp) alert('info', 'Écritures datées un dimanche ou un jour férié', `${atypical.dimanche} le dimanche, ${atypical['jour férié']} un jour férié : à justifier en cas de contrôle.`, atypicalEx);

  const accts6 = balance.some((x) => /^[67]/.test(x.compte) && (x.d || x.c));
  if (!accts6) alert('warn', 'Aucun mouvement sur les comptes de gestion', 'Les comptes de charges et de produits sont vides ou soldés : le compte de résultat ne peut pas être calculé.');

  // Loi de Benford
  const nB = benford.slice(1).reduce((t, x) => t + x, 0);
  const benfordRows = [];
  let mad = 0;
  for (let k = 1; k <= 9; k++) {
    const exp = Math.log10(1 + 1 / k);
    const obs = nB ? benford[k] / nB : 0;
    mad += Math.abs(obs - exp);
    benfordRows.push({ chiffre: k, observe: obs, attendu: exp, n: benford[k] });
  }
  mad = nB ? mad / 9 : 0;
  const benfordLevel = nB < 500 ? 'n/a' : mad < 0.006 ? 'conforme' : mad < 0.012 ? 'acceptable' : mad < 0.015 ? 'limite' : 'non conforme';
  if (benfordLevel === 'non conforme' || benfordLevel === 'limite') {
    alert('info', 'Répartition des montants atypique (loi de Benford)', `Écart moyen ${mad.toFixed(4)} (${benfordLevel}) : indicateur statistique utilisé par l'administration fiscale, à interpréter avec prudence (activité à prix fixes, abonnements…).`);
  }

  // Paiements passés directement de la banque vers un compte de charges (sans compte fournisseur) : facture à obtenir.
  const direct = new Map();
  chargeLines.forEach(([ek, compte, clib, elib, amt, date]) => {
    const en = entries.get(ek);
    if (!en || !en.has5 || en.has4 || /^(627|6[3-9]|64|658|66|67|68|69)/.test(compte)) return;
    const key = compte + '|' + labelKey(elib);
    let gr = direct.get(key);
    if (!gr) direct.set(key, (gr = { compte, clib, label: elib, count: 0, total: 0, months: {}, first: date, last: date }));
    gr.count++;
    gr.total += amt;
    gr.months[date.slice(0, 7)] = (gr.months[date.slice(0, 7)] || 0) + amt;
    if (date < gr.first) gr.first = date;
    if (date > gr.last) { gr.last = date; gr.label = elib; }
  });
  const soldeOf = (compte) => { const x = accounts.get(compte); return x ? round2(x.d - x.c) : 0; };
  const pieces = {
    minOp: minOp === '9999' ? null : minOp,
    maxOp: maxOp === '0000' ? null : maxOp,
    banks: Array.from(bankMonths.values()).map((b) => ({ ...b, solde: soldeOf(b.compte) })),
    suppliers: Array.from(supInv.values()).filter((x) => Object.keys(x.months).length >= 3)
      .map((x) => ({ num: x.num, lib: x.lib, months: Object.fromEntries(Object.entries(x.months).map(([k, v]) => [k, round2(v)])) })),
    payroll,
    attente: attenteLines.map((l) => ({ ...l, soldeCompte: soldeOf(l.compte) })),
    immo: immoLines,
    cca: ccaLines,
    direct: Array.from(direct.values()).filter((x) => x.total >= 30).sort((a, b) => b.total - a.total).slice(0, 120)
      .map((x) => ({ ...x, total: round2(x.total) })),
    tiers: auxList.filter((t) => Math.abs(t.s) >= 0.01).map((t) => ({ racine: t.racine, num: t.num, lib: t.lib, s: t.s, lastD: t.lastD || '', lastC: t.lastC || '' })),
    flags,
  };

  const tiers = {
    clients: auxList.filter((t) => t.racine === '411').sort((x, y) => y.d - x.d).slice(0, 10),
    fournisseurs: auxList.filter((t) => t.racine === '401').sort((x, y) => y.c - x.c).slice(0, 10),
  };

  return {
    meta: {
      fileName, siren, closing, start, encoding, separator: sep === '\t' ? 'tabulation' : sep, lines, entries: entries.size,
      accounts: accounts.size, journalsCount: journals.size, minDate, maxDate, bnc, hasAN, totalD: round2(totalD), totalC: round2(totalC),
    },
    checks,
    alerts,
    balance,
    sig,
    bilan,
    monthly,
    journals: Array.from(journals.values()).map((j) => ({ ...j, d: round2(j.d), c: round2(j.c) })).sort((x, y) => x.code.localeCompare(y.code)),
    tiers,
    benford: { rows: benfordRows, n: nB, mad, level: benfordLevel },
    pieces,
    kpi: {
      ca: P(['70']), marge, va, ebe, rex, resultat,
      tresorerie: round2(balance.filter((x) => /^5[1-3]/.test(x.compte)).reduce((t, x) => t + x.s, 0)),
      totalBilan: totalActif,
    },
  };
}
