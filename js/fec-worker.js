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
    self.postMessage({ type: 'done', result: analyse(e.data.buffer, e.data.fileName || '', e.data.until || '') });
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

// Dépenses à caractère personnel probables et amendes (libellés normalisés).
const RE_PERSO = /netflix|spotify|deezer|disney|canal ?\+|amazon prime|playstation|nintendo|steam|airbnb|sephora|\bzara\b|kiabi|decathlon|ikea|carrefour|leclerc|auchan|intermarche|\blidl\b|super ?u\b|monoprix|franprix|picard|bijout|coiffeur|parfumerie|veterinaire|creche|cinema|\bugc\b|pathe|cdiscount|jouet|club med|camping|\bgolf\b|fitness|basic.fit|salle de sport|esthetique|\bpmu\b|\bfdj\b|francaise des jeux|loto/;
const RE_AMENDE = /\bamende|contravention|\bantai\b|forfait post|\bfps\b|proces.verbal|\bpv\b|penalite|majoration de retard|interets? de retard/;
const dmy = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const dayMs = 86400000;
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / dayMs);
// Ajoute une occurrence : exemple lisible et, si fourni, élément structuré (date, libellé, montant) pour la demande de pièces.
const addEx = (o, amt, example, max, item) => {
  o.n++;
  o.total = round2(o.total + amt);
  if (o.ex.length < (max || 12)) o.ex.push(example);
  if (item && o.items.length < (max || 12)) o.items.push(item);
};
const bucket = () => ({ n: 0, total: 0, ex: [], items: [] });

const isAN = (code, lib) => /^(AN|ANO|RAN|OUV|NOUV|A-N|A\.N)/i.test(code) || /nouveau|ouverture|report/i.test(lib);
const fmt = (n) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------- Analyse ----------

// `until` (AAAA-MM-JJ, facultatif) : écritures postérieures ignorées, pour comparer une situation à la même période de l'exercice précédent.
function analyse(buffer, fileName, until) {
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
  const bankLines = {}; // lignes des comptes 51 (hors à-nouveaux) pour le rapprochement bancaire
  const flags = {};
  // Cycles de révision
  const auxNames = new Map();
  const chAcc = new Map(); // comptes 61 / 62 : montants par mois, grosses lignes (charges constatées d'avance)
  const tresoAcc = new Map(); // comptes 50 à 58 : à-nouveau et mouvements datés
  const cut = { achats: { after: bucket(), before: bucket() }, charges: { after: bucket(), before: bucket() }, ventes: { after: bucket(), before: bucket() } };
  const perso = bucket(), amendes = bucket(), weekend = bucket(), gifts = bucket();
  const persoG = new Map(); // dépenses personnelles possibles regroupées par libellé (abonnements répétés)
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
    if (until && date > until && !an) continue;
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
      if (!t) aux.set(k, (t = { racine: compte.slice(0, 3), compte, num: auxNum || compte, lib: auxLib || clib, clib, d: 0, c: 0, lines: [] }));
      t.d += d;
      t.c += c;
      // Lignes conservées pour la balance âgée : date, débit, crédit, lettrage, libellé, à-nouveau.
      if (date || an) t.lines.push([date || '0000-00-00', d, c, g('EcritureLet'), elib, an ? 1 : 0, jc + '\u0001' + num]);
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
    if (date && !an) {
      (en.l = en.l || []).push(compte, auxNum, d, c); // à plat (4 valeurs par ligne) pour limiter la mémoire
      if (!en.piece && piece) en.piece = piece;
      if (/^4[01]/.test(compte) && !auxNames.has(auxNum || compte)) auxNames.set(auxNum || compte, auxLib || clib);
    }
    if (/^5[0-8]/.test(compte)) {
      let ta = tresoAcc.get(compte);
      if (!ta) tresoAcc.set(compte, (ta = { compte, lib: clib, an: 0, lines: [] }));
      if (an) ta.an += d - c;
      else if (date) ta.lines.push([date, d - c]);
    }

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
      // Comptes bancaires (512 et suivants) ; les 511 « valeurs à l'encaissement » (CB, chèques) sont des comptes de transit.
      if (/^51[2-9]/.test(compte)) {
        (bankLines[compte] = bankLines[compte] || []).push([date, round2(d - c), elib, piece, jc + ' ' + num]);
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
      // Séparation des exercices : pièce datée hors de l'exercice
      if (closing && pd.iso && /^(60|61|62|70)/.test(compte)) {
        const cyc = compte[0] === '7' ? 'ventes' : compte.startsWith('60') ? 'achats' : 'charges';
        const amt = round2(compte[0] === '7' ? c - d : d - c);
        const exm = `Pièce du ${dmy(pd.iso)} saisie le ${dmy(date)} · ${compte} · ${elib.slice(0, 50)} · ${fmt(amt)} €`;
        const it = { date, pdate: pd.iso, compte, lib: elib.slice(0, 60), amt, piece };
        if (pd.iso > closing && date <= closing) addEx(cut[cyc].after, amt, exm, 30, it);
        else if (start && pd.iso < start) addEx(cut[cyc].before, amt, exm, 30, it);
      }
      if (/^6[12]/.test(compte)) {
        let ca = chAcc.get(compte);
        if (!ca) chAcc.set(compte, (ca = { compte, lib: clib, total: 0, n: 0, direct: 0, months: {}, big: [] }));
        ca.total += d - c;
        ca.n++;
        ca.months[ym] = (ca.months[ym] || 0) + d - c;
        if (d >= 300 && ca.big.length < 60) ca.big.push([date, d, elib]);
      }
      if (d > 0 && /^(606|61|62|65)/.test(compte)) {
        const t = normTxt(elib);
        const exm = `${dmy(date)} · ${compte} ${clib.slice(0, 25)} · ${elib.slice(0, 50)} · ${fmt(d)} €`;
        const item = { date, lib: elib.slice(0, 60), amt: round2(d), compte };
        if (RE_AMENDE.test(t)) addEx(amendes, d, exm, 12, item);
        else if (RE_PERSO.test(t)) {
          addEx(perso, d, exm, 20, item);
          const k = labelKey(elib);
          const g = persoG.get(k) || persoG.set(k, { lib: elib.replace(/\s+/g, ' ').trim().slice(0, 60), n: 0, total: 0, first: date, last: date }).get(k);
          g.n++;
          g.total = round2(g.total + d);
          if (date < g.first) g.first = date;
          if (date > g.last) g.last = date;
        }
        if (compte.startsWith('625')) {
          const dow = new Date(date + 'T00:00:00Z').getUTCDay();
          if (dow === 0 || dow === 6) addEx(weekend, d, `${dow ? 'Samedi' : 'Dimanche'} ${exm}`);
        }
        if (compte.startsWith('6234') && d > 73) { addEx(gifts, d, exm); en.gift = compte; }
      }
    }

    // Mensuel
    if (date) {
      const mk = date.slice(0, 7);
      let mo = months.get(mk);
      if (!mo) months.set(mk, (mo = { mois: mk, ca: 0, produits: 0, charges: 0, tvaCollectee: 0, tvaDeductible: 0, treso: 0, achats: 0, ext: 0, enc: 0, dec: 0 }));
      const cl = compte[0];
      if (cl === '7') { mo.produits += c - d; if (compte.startsWith('70')) mo.ca += c - d; }
      else if (cl === '6') {
        mo.charges += d - c;
        if (compte.startsWith('60')) mo.achats += d - c;
        else if (/^6[12]/.test(compte)) mo.ext += d - c;
      }
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
    .map((x) => ({ compte: x.compte, lib: x.lib, d: round2(x.d), c: round2(x.c), s: round2(x.d - x.c), an: round2(x.dAN - x.cAN), dm: round2(x.d - x.dAN), cm: round2(x.c - x.cAN) }))
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

  perso.groups = Array.from(persoG.values()).sort((a, b) => b.total - a.total).slice(0, 30);
  const cycles = buildCycles({ entries, aux, auxNames, accounts, chAcc, tresoAcc, cut, perso, amendes, weekend, gifts, closing, start, months, maxOp });

  // ---------- Mensuel ----------
  let cumul = 0;
  const monthly = Array.from(months.values()).sort((x, y) => x.mois.localeCompare(y.mois)).map((m) => {
    cumul += m.treso;
    return { mois: m.mois, ca: round2(m.ca), produits: round2(m.produits), charges: round2(m.charges), tvaCollectee: round2(m.tvaCollectee), tvaDeductible: round2(m.tvaDeductible), tresorerie: round2(cumul),
      achats: round2(m.achats), ext: round2(m.ext), enc: round2(m.enc), dec: round2(m.dec) };
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

  const auxList = Array.from(aux.values()).map(({ lines: _l, ...t }) => ({ ...t, d: round2(t.d), c: round2(t.c), s: round2(t.d - t.c) }));

  // Règlements fournisseurs et encaissements clients non affectés à une facture : lignes non lettrées (si le compte
  // est lettré), rapprochement montant pour montant, puis imputation sur les factures restantes ; les règlements
  // les plus récents qui restent sans facture sont listés un par un (date, montant, libellé).
  const unmatched = [];
  aux.forEach((t) => {
    if (t.racine !== '401' && t.racine !== '411') return;
    const sign = t.racine === '401' ? -1 : 1; // facture > 0, règlement < 0
    const lettered = t.lines.some((l) => l[3]);
    const items = [];
    t.lines.forEach(([date, d, c, let_, lib, isAn, ek]) => {
      if (lettered && let_) return;
      const amt = round2(sign * (d - c));
      if (!amt) return;
      const en = !isAn && entries.get(ek);
      items.push({ date, amt, lib, bank: !!(en && en.has5) });
    });
    const pays = items.filter((x) => x.amt < 0 && x.bank).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (!pays.length) return;
    const invs = items.filter((x) => x.amt > 0).map((x) => ({ date: x.date, rest: x.amt })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    // Avoirs et acomptes (lignes négatives hors banque) imputés sur les factures les plus anciennes
    let cred = -items.filter((x) => x.amt < 0 && !x.bank).reduce((s2, x) => s2 + x.amt, 0);
    for (const v of invs) { if (cred <= 0.005) break; const take = Math.min(cred, v.rest); v.rest -= take; cred -= take; }
    // Rapprochement montant pour montant (facture à 62 jours au plus du paiement)
    const byAmt = new Map();
    invs.forEach((v) => { if (v.rest > 0.005) { const k = Math.round(v.rest * 100); (byAmt.get(k) || byAmt.set(k, []).get(k)).push(v); } });
    const rest = pays.filter((pm) => {
      const list = byAmt.get(Math.round(-pm.amt * 100)) || [];
      const v = list.find((x) => x.rest > 0.005 && Math.abs(daysBetween(pm.date, x.date)) <= 62);
      if (!v) return true;
      v.rest = 0;
      return false;
    });
    // Imputation sur les factures restantes les plus anciennes, datées au plus 10 jours après le paiement
    let i0 = 0; // factures déjà soldées en tête de liste
    rest.forEach((pm) => {
      let a = -pm.amt;
      while (i0 < invs.length && invs[i0].rest <= 0.005) i0++;
      for (let i = i0; i < invs.length; i++) {
        const v = invs[i];
        if (a <= 0.005) break;
        if (v.rest <= 0.005) continue;
        if (daysBetween(pm.date, v.date) > 10) break;
        const take = Math.min(a, v.rest);
        v.rest -= take;
        a -= take;
      }
      if (a >= 0.01 && unmatched.length < 5000) unmatched.push({ racine: t.racine, num: t.num, lib: t.lib, date: pm.date, amt: round2(a), label: String(pm.lib || '').slice(0, 60) });
    });
  });
  unmatched.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Balance âgée des tiers (411 clients, 401 fournisseurs) : pièces non soldées et leur date.
  // Avec lettrage dans le FEC : lignes non lettrées. Sinon : règlements imputés sur les factures les plus anciennes (FIFO).
  const aging = [];
  aux.forEach((t) => {
    if (!['411', '401'].includes(t.racine) || Math.abs(t.d - t.c) < 0.01) return;
    const sign = t.racine === '401' ? -1 : 1;
    const items = t.lines.map(([date, d, c, let_, lib, an]) => ({ date, amt: round2(sign * (d - c)), let: let_, lib, an: !!an })).filter((x) => x.amt !== 0);
    const lettered = items.some((x) => x.let);
    let open;
    if (lettered) {
      open = items.filter((x) => !x.let);
    } else {
      const invoices = items.filter((x) => x.amt > 0).sort((a, b) => a.date.localeCompare(b.date));
      const payments = items.filter((x) => x.amt < 0);
      let credit = -payments.reduce((s, x) => s + x.amt, 0);
      open = [];
      invoices.forEach((x) => {
        if (credit >= x.amt - 0.005) { credit -= x.amt; return; }
        open.push({ ...x, amt: round2(x.amt - credit) });
        credit = 0;
      });
      if (credit > 0.005) {
        const last = payments.sort((a, b) => b.date.localeCompare(a.date))[0];
        open.push({ date: last ? last.date : '', amt: round2(-credit), lib: 'Règlements non imputés (trop-perçu)', an: false });
      }
    }
    open.sort((a, b) => a.date.localeCompare(b.date));
    aging.push({
      racine: t.racine, compte: t.compte, num: t.num, lib: t.lib, clib: t.clib, s: round2(t.d - t.c), method: lettered ? 'lettrage' : 'fifo',
      billed: round2(items.filter((x) => x.amt > 0 && !x.an).reduce((s, x) => s + x.amt, 0)), openCount: open.length,
      open: open.slice(0, 200).map(({ date, amt, lib, an }) => ({ date, amt, lib, an })),
    });
  });
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
  const directLines = []; // paiements directs ligne à ligne, pour la demande mensuelle
  chargeLines.forEach(([ek, compte, clib, elib, amt, date]) => {
    const en = entries.get(ek);
    if (!en || !en.has5 || en.has4 || /^(627|6[3-9]|64|658|66|67|68|69)/.test(compte)) return;
    if (directLines.length < 5000) directLines.push([date, compte, clib, elib, round2(amt)]);
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
    directLines,
    unmatched,
    // Mouvements mensuels des comptes clients et fournisseurs (à-nouveau, puis débit / crédit par mois)
    tiersMonths: Array.from(aux.values()).filter((t) => t.racine === '401' || t.racine === '411').map((t) => {
      const m = {};
      let an = 0;
      t.lines.forEach(([date, d, c, , , isAn]) => {
        if (isAn) { an += d - c; return; }
        const ym = date.slice(0, 7);
        const x = (m[ym] = m[ym] || [0, 0]);
        x[0] = round2(x[0] + d);
        x[1] = round2(x[1] + c);
      });
      return { racine: t.racine, num: t.num, lib: t.lib, an: round2(an), m };
    }),
    flags,
  };

  const tiers = {
    clients: auxList.filter((t) => t.racine === '411').sort((x, y) => y.d - x.d).slice(0, 10),
    fournisseurs: auxList.filter((t) => t.racine === '401').sort((x, y) => y.c - x.c).slice(0, 10),
  };

  return {
    meta: {
      fileName, siren, closing, start, until: until || '', encoding, separator: sep === '\t' ? 'tabulation' : sep, lines, entries: entries.size,
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
    bankLines,
    aging,
    cycles,
    kpi: {
      ca: P(['70']), marge, va, ebe, rex, resultat,
      tresorerie: round2(balance.filter((x) => /^5[1-3]/.test(x.compte)).reduce((t, x) => t + x.s, 0)),
      totalBilan: totalActif,
    },
  };
}

// ---------- Cycles de révision : achats, charges externes, clients, trésorerie ----------

const isSup = (c) => /^40[1-7]/.test(c);
const isCli = (c) => /^41[13]/.test(c);
const TRESO = /^(51[2-9]|53)/;
const FLUX_LABELS = {
  clients: 'Clients', ventes: 'Ventes et produits encaissés directement', remises: 'Remises CB et chèques (511)', fournisseurs: 'Fournisseurs',
  charges: 'Charges payées directement', salaires: 'Salaires', social: 'Organismes sociaux', etat: 'État (TVA, impôts et taxes)',
  emprunts: 'Emprunts', associes: 'Associés et groupe', capital: 'Capital et subventions', investissements: 'Immobilisations',
  financier: 'Frais et produits financiers', divers: 'Attente et débiteurs / créditeurs divers', interne: 'Virements internes (58)', autres: 'Autres',
};
function fluxCat(c) {
  if (/^41/.test(c)) return 'clients';
  if (/^40/.test(c)) return 'fournisseurs';
  if (/^(42|64)/.test(c)) return 'salaires';
  if (/^43/.test(c)) return 'social';
  if (/^(44|63|69)/.test(c)) return 'etat';
  if (/^(16|17|518|519)/.test(c)) return 'emprunts';
  if (/^45/.test(c)) return 'associes';
  if (/^(10|13)/.test(c)) return 'capital';
  if (/^2/.test(c)) return 'investissements';
  if (/^(66|76|627)/.test(c)) return 'financier';
  if (/^(6[0-25]|67)/.test(c)) return 'charges';
  if (/^(7[0-57])/.test(c)) return 'ventes';
  if (/^(46|47)/.test(c)) return 'divers';
  if (/^511/.test(c)) return 'remises';
  if (/^58/.test(c)) return 'interne';
  return 'autres';
}

// Délais de paiement réels d'un tiers : par lettrage si le compte est lettré, sinon règlements imputés sur les factures les plus anciennes.
function payDelays(t) {
  const sign = t.racine === '401' ? -1 : 1;
  const items = t.lines.map(([date, d, c, let_, , an]) => ({ date, amt: round2(sign * (d - c)), let: let_, an: !!an })).filter((x) => x.amt !== 0);
  let paidN = 0, paidAmt = 0, wsum = 0, lateN = 0, lateAmt = 0;
  const done = (inv, payDate) => {
    if (inv.an) return;
    const days = Math.max(0, daysBetween(inv.date, payDate));
    paidN++;
    paidAmt += inv.amt;
    wsum += inv.amt * days;
    if (days > 60) { lateN++; lateAmt += inv.amt; }
  };
  if (items.some((x) => x.let)) {
    const groups = new Map();
    items.forEach((x) => { if (x.let) (groups.get(x.let) || groups.set(x.let, []).get(x.let)).push(x); });
    groups.forEach((g) => {
      const pays = g.filter((x) => x.amt < 0);
      if (!pays.length) return;
      const payDate = pays.reduce((m, x) => (x.date > m ? x.date : m), '');
      g.filter((x) => x.amt > 0).forEach((inv) => done(inv, payDate));
    });
  } else {
    const inv = items.filter((x) => x.amt > 0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).map((x) => ({ ...x, rest: x.amt }));
    const pays = items.filter((x) => x.amt < 0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let i = 0;
    pays.forEach((p) => {
      let rest = -p.amt;
      while (rest > 0.005 && i < inv.length) {
        const take = Math.min(rest, inv[i].rest);
        inv[i].rest -= take;
        rest -= take;
        if (inv[i].rest < 0.005) { done(inv[i], p.date); i++; }
      }
    });
  }
  return { paidN, paidAmt: round2(paidAmt), delay: paidAmt > 0 ? Math.round(wsum / paidAmt) : null, lateN, lateAmt: round2(lateAmt) };
}

function buildCycles(x) {
  const { entries, aux, auxNames, accounts, chAcc, tresoAcc, cut, closing, start, months } = x;
  const libOf = (c) => (accounts.get(c) || {}).lib || '';
  const sups = new Map(), custs = new Map();
  const agg = (map, key) => {
    let a = map.get(key);
    if (!a) map.set(key, (a = { num: key, lib: auxNames.get(key) || key, inv: 0, ht: 0, tva: 0, ttc: 0, av: 0, avAmt: 0, pay: 0, payAmt: 0, first: '', last: '' }));
    return a;
  };
  const purchases = [], sales = [];
  const noVatP = new Map(), overVatP = bucket(), autoliq = bucket(), noVatS = bucket(), overVatS = bucket();
  const cash = bucket(), notesFrais = bucket(), giftVat = bucket();
  const directSales = [];
  const das2 = new Map();
  const flux = {}, big = [];
  let avoirsP = 0, avoirsS = 0;
  const fluxAdd = (cat, amt, ym) => {
    const f = (flux[cat] = flux[cat] || { cat, label: FLUX_LABELS[cat], enc: 0, dec: 0 });
    if (amt > 0) f.enc += amt; else f.dec -= amt;
    const mo = months.get(ym);
    if (mo && cat !== 'interne') { if (amt > 0) mo.enc += amt; else mo.dec -= amt; }
  };

  entries.forEach((en, ek) => {
    if (en.an || !en.l) return;
    const L = [];
    for (let i = 0; i < en.l.length; i += 4) L.push([en.l[i], en.l[i + 1], en.l[i + 2], en.l[i + 3]]);
    let supNet = 0, supKey = '', supMax = 0, chg = 0, im = 0, tv6 = 0, tv52 = 0, cliNet = 0, cliKey = '', cliMax = 0, ven = 0, tv7 = 0, tr = 0, hasTr = false, c455 = 0;
    let main = '', mainAmt = 0;
    for (const [compte, auxNum, d, c] of L) {
      const amt = d - c;
      if (isSup(compte)) { supNet += amt; if (Math.abs(amt) > supMax) { supMax = Math.abs(amt); supKey = auxNum || compte; } }
      else if (isCli(compte)) { cliNet += amt; if (Math.abs(amt) > cliMax) { cliMax = Math.abs(amt); cliKey = auxNum || compte; } }
      else if (/^6[0-2]/.test(compte)) { chg += amt; if (amt > mainAmt) { mainAmt = amt; main = compte; } }
      else if (/^2[0-3]/.test(compte)) { im += amt; if (amt > mainAmt) { mainAmt = amt; main = compte; } }
      else if (compte.startsWith('4456')) tv6 += amt;
      else if (compte.startsWith('4452')) tv52 -= amt;
      else if (compte.startsWith('4457')) tv7 -= amt;
      else if (compte.startsWith('70')) ven -= amt;
      else if (compte.startsWith('455')) c455 -= amt;
      if (TRESO.test(compte)) { tr += amt; hasTr = true; }
    }
    const date = en.date;
    const ref = `${dmy(date)} · ${en.jc} ${en.num} · ${(en.lib || '').slice(0, 45)}`;

    // Achats : factures, avoirs, règlements
    const ht = round2(chg + im);
    if (supNet < -0.005 && ht > 0.005 && !hasTr) {
      const ttc = round2(-supNet);
      const a = agg(sups, supKey);
      a.inv++; a.ht += ht; a.tva += tv6; a.ttc += ttc;
      if (!a.first || date < a.first) a.first = date;
      if (date > a.last) a.last = date;
      purchases.push([supKey, date, ttc, en.piece || '', ref, ht, round2(tv6), main]);
      if (ht >= 150 && tv6 < 0.01 && tv52 < 0.01 && !/^(616|627)/.test(main)) {
        let g = noVatP.get(main);
        if (!g) noVatP.set(main, (g = { compte: main, lib: libOf(main), ...bucket() }));
        addEx(g, ht, `${ref} · ${a.lib} · ${fmt(ht)} € HT`, 5);
      }
      if (tv6 > ht * 0.2 + 1) addEx(overVatP, tv6, `${ref} · ${a.lib} · HT ${fmt(ht)} € · TVA ${fmt(round2(tv6))} € (${(tv6 / ht * 100).toFixed(1).replace('.', ',')} %)`);
      if (tv52 > 0.01 && tv6 < tv52 - 1) addEx(autoliq, tv52, `${ref} · ${a.lib} · TVA autoliquidée ${fmt(round2(tv52))} €, déduite ${fmt(round2(tv6))} €`, 12,
        { date, sup: a.lib, piece: en.piece || '', amt: round2(tv52 - tv6), compte: main });
    } else if (supNet > 0.005 && ht < -0.005 && !hasTr) {
      const a = agg(sups, supKey);
      a.av++; a.avAmt += supNet; avoirsP += supNet;
    } else if (supNet > 0.005 && tr < -0.005) {
      const a = agg(sups, supKey);
      a.pay++; a.payAmt += supNet;
    }

    // Ventes : factures, avoirs, encaissements
    if (cliNet > 0.005 && ven > 0.005 && !hasTr) {
      const a = agg(custs, cliKey);
      a.inv++; a.ht += ven; a.tva += tv7; a.ttc += cliNet;
      if (!a.first || date < a.first) a.first = date;
      if (date > a.last) a.last = date;
      sales.push([cliKey, date, round2(cliNet), en.piece || '', ref, ek]);
      const cm = (a.months = a.months || {});
      cm[date.slice(0, 7)] = round2((cm[date.slice(0, 7)] || 0) + cliNet);
      if (ven >= 150 && tv7 < 0.01) addEx(noVatS, ven, `${ref} · ${a.lib} · ${fmt(round2(ven))} € HT`);
      if (tv7 > ven * 0.2 + 1) addEx(overVatS, tv7, `${ref} · ${a.lib} · HT ${fmt(round2(ven))} € · TVA ${fmt(round2(tv7))} €`);
    } else if (cliNet < -0.005 && ven < -0.005 && !hasTr) {
      const a = agg(custs, cliKey);
      a.av++; a.avAmt -= cliNet; avoirsS -= cliNet;
    } else if (cliNet < -0.005 && tr > 0.005) {
      const a = agg(custs, cliKey);
      a.pay++; a.payAmt -= cliNet;
    } else if (hasTr && tr > 0.005 && ven > 0.005 && Math.abs(cliNet) < 0.005 && directSales.length < 5000) {
      directSales.push([date, round2(tr), (en.lib || '').slice(0, 60)]); // encaissement comptabilisé en vente sans compte client
    }

    // Charges externes : paiements directs, honoraires (DAS2), notes de frais, cadeaux
    for (const [compte, auxNum, d, c] of L) {
      if (/^6[12]/.test(compte) && hasTr && !supNet && chAcc.get(compte)) chAcc.get(compte).direct += d - c;
      if (/^(622[1-46-8]|6516|653)/.test(compte) && d - c > 0) {
        const benef = supKey ? auxNames.get(supKey) || supKey : (en.lib || '').replace(/\S*\d\S*/g, '').replace(/\s+/g, ' ').trim() || en.lib;
        const key = supKey || labelKey(en.lib);
        let b = das2.get(key);
        if (!b) das2.set(key, (b = { benef, total: 0, comptes: [] }));
        b.total += (d - c) + (ht > 0 && tv6 > 0 ? tv6 * (d - c) / ht : 0);
        if (!b.comptes.includes(compte)) b.comptes.push(compte);
      }
    }
    if (c455 > 0.005 && chg > 0.005 && !hasTr) addEx(notesFrais, chg, `${ref} · ${fmt(round2(chg))} €`);
    if (en.gift && tv6 > 0.01) addEx(giftVat, tv6, `${ref} · TVA déduite ${fmt(round2(tv6))} €`, 12, { date, lib: en.lib || '', amt: round2(tv6), compte: en.gift });

    // Trésorerie : flux par nature de contrepartie, espèces, gros mouvements
    if (hasTr) {
      const others = L.filter((l) => !TRESO.test(l[0]));
      const nonVat = others.filter((l) => !l[0].startsWith('445'));
      let dom = '', domAmt = 0;
      nonVat.forEach((l) => { const a = Math.abs(l[2] - l[3]); if (a > domAmt) { domAmt = a; dom = l[0]; } });
      const ym = date.slice(0, 7);
      others.forEach(([compte, , d, c]) => fluxAdd(fluxCat(compte.startsWith('445') && dom ? dom : compte), c - d, ym));
      const real = others.some((l) => !/^5/.test(l[0]));
      for (const [compte, , d, c] of L) {
        if (!TRESO.test(compte)) continue;
        const amt = round2(d - c);
        const cp = dom || (others[0] || [''])[0];
        if (compte.startsWith('53') && Math.abs(amt) >= 1000 && real) addEx(cash, Math.abs(amt), `${ref} · ${amt > 0 ? 'encaissement' : 'paiement'} de ${fmt(Math.abs(amt))} € · contrepartie ${cp} ${libOf(cp).slice(0, 30)}`, 30, { date, lib: (en.lib || '').slice(0, 60), amt });
        if (Math.abs(amt) >= 1000 && real) big.push({ date, amt, compte, cp, cplib: libOf(cp), lib: en.lib || '', ref: `${en.jc} ${en.num}` });
      }
    }
  });

  // Délais de paiement réels par tiers
  const delays = new Map();
  aux.forEach((t) => { if (t.racine === '401' || t.racine === '411') delays.set(t.racine + '|' + t.num, payDelays(t)); });
  const finish = (map, racine, total) => {
    const list = [];
    let pN = 0, pAmt = 0, w = 0, lN = 0, lAmt = 0;
    aux.forEach((t) => {
      if (t.racine !== racine) return;
      const a = map.get(t.num) || agg(map, t.num);
      const dl = delays.get(racine + '|' + t.num) || {};
      Object.assign(a, { lib: t.lib || a.lib, s: round2(t.d - t.c), paidN: dl.paidN || 0, delay: dl.delay === undefined ? null : dl.delay, lateN: dl.lateN || 0, lateAmt: dl.lateAmt || 0 });
      if (dl.paidAmt) { pN += dl.paidN; pAmt += dl.paidAmt; w += dl.paidAmt * dl.delay; lN += dl.lateN; lAmt += dl.lateAmt; }
    });
    map.forEach((a) => {
      ['ht', 'tva', 'ttc', 'avAmt', 'payAmt'].forEach((k) => { a[k] = round2(a[k]); });
      a.share = total > 0 ? a.ttc / total : 0;
      list.push(a);
    });
    list.sort((a, b) => b.ttc - a.ttc || Math.abs(b.s || 0) - Math.abs(a.s || 0));
    return { list: list.slice(0, 300), count: list.filter((a) => a.inv).length, delay: { paidN: pN, paidAmt: round2(pAmt), avg: pAmt > 0 ? Math.round(w / pAmt) : null, lateN: lN, lateAmt: round2(lAmt) } };
  };
  const ttcP = round2(purchases.reduce((s, p) => s + p[2], 0));
  const ttcS = round2(sales.reduce((s, p) => s + p[2], 0));
  const supF = finish(sups, '401', ttcP);
  const cliF = finish(custs, '411', ttcS);

  // Factures fournisseurs en double : même fournisseur, même montant, même n° de pièce, saisies à moins de 15 jours d'écart.
  // Une même référence qui revient chaque mois pour le même montant est un n° de contrat ou d'échéancier (loyer,
  // crédit-bail, abonnement) : ce n'est pas un doublon.
  const dupStrong = bucket(), dupPossible = bucket(), recurring = new Set();
  purchases.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[2] - b[2] || (a[1] < b[1] ? -1 : 1)));
  for (let i = 1; i < purchases.length; i++) {
    const p = purchases[i], q = purchases[i - 1];
    if (p[0] !== q[0] || Math.abs(p[2] - q[2]) > 0.005 || p[2] < 50) continue;
    const name = auxNames.get(p[0]) || p[0];
    const gap = Math.abs(daysBetween(q[1], p[1]));
    if (p[3] && p[3] === q[3]) {
      if (gap >= 15) { recurring.add(p[0] + '|' + p[3]); continue; }
      addEx(dupStrong, p[2], `${name} · ${fmt(p[2])} € · pièce ${p[3]} saisie le ${dmy(q[1])} et le ${dmy(p[1])}`, 30,
        { sup: p[0], supLib: name, date: p[1], piece: p[3], ttc: p[2], ht: p[5], tva: p[6], compte: p[7] });
    } else if (gap <= 3) addEx(dupPossible, p[2], `${name} · ${fmt(p[2])} € · pièces ${q[3] || '?'} (${dmy(q[1])}) et ${p[3] || '?'} (${dmy(p[1])})`, 30);
  }

  // Numérotation des factures de vente (art. 242 nonies A, annexe II du CGI)
  const groups = new Map();
  sales.forEach(([, date, ttc, piece, ref, ek]) => {
    const m = String(piece).match(/^(.*?)(\d+)$/);
    if (!m || m[2].length > 9) return;
    const g = groups.get(m[1]) || groups.set(m[1], new Map()).get(m[1]);
    if (!g.w) g.w = m[2].length;
    const n = +m[2];
    (g.get(n) || g.set(n, []).get(n)).push({ date, ttc, piece, ek });
  });
  const numbering = [];
  groups.forEach((g, prefix) => {
    if (g.size < 10) return;
    const nums = Array.from(g.keys()).sort((a, b) => a - b);
    const ref = (n) => prefix + String(n).padStart(g.w, '0');
    const ranges = [];
    let missing = 0, inversions = 0;
    const invEx = [];
    for (let i = 1; i < nums.length; i++) {
      const gap = nums[i] - nums[i - 1] - 1;
      if (gap > 0) {
        missing += gap;
        if (ranges.length < 25) ranges.push(gap === 1 ? ref(nums[i - 1] + 1) : `${ref(nums[i - 1] + 1)} à ${ref(nums[i] - 1)}`);
      }
      const a = g.get(nums[i - 1])[0], b = g.get(nums[i])[0];
      if (b.date < a.date) { inversions++; if (invEx.length < 8) invEx.push(`${a.piece} du ${dmy(a.date)} puis ${b.piece} du ${dmy(b.date)}`); }
    }
    const dups = [];
    g.forEach((list) => {
      const distinct = new Set(list.map((x) => x.ek));
      if (distinct.size > 1 && dups.length < 20) dups.push(`${list[0].piece} : ${list.map((x) => `${dmy(x.date)} (${fmt(x.ttc)} €)`).join(' et ')}`);
    });
    numbering.push({ prefix, w: g.w, seq: g.size <= 6000 ? nums.map((n) => [n, g.get(n)[0].date]) : null, count: g.size, first: ref(nums[0]), last: ref(nums[nums.length - 1]), missing, ranges, inversions, invEx, dups, sparse: missing > g.size });
  });
  numbering.sort((a, b) => b.count - a.count);

  // Charges constatées d'avance probables : paiements annuels ou trimestriels qui couvrent l'exercice suivant
  const cca = [];
  if (closing) {
    chAcc.forEach((ca) => {
      if (!/^(612|613|614|615|616|618|6231|6233|6236|626|6281|6226)/.test(ca.compte)) return;
      const nMonths = Object.values(ca.months).filter((v) => Math.abs(v) >= 0.01).length;
      const cover = nMonths <= 2 ? 12 : nMonths <= 5 ? 3 : 0;
      if (!cover) return;
      ca.big.forEach(([date, amt, lib]) => {
        if (date > closing) return;
        const end = new Date(Date.parse(date));
        end.setUTCMonth(end.getUTCMonth() + cover);
        const total = (end - Date.parse(date)) / dayMs;
        const rest = (end - Date.parse(closing)) / dayMs - 1;
        if (rest <= 0) return;
        const v = round2((amt * rest) / total);
        if (v >= 50) cca.push({ compte: ca.compte, lib: ca.lib, date, amt, label: lib, cover, cca: v });
      });
    });
    cca.sort((a, b) => b.cca - a.cca);
  }

  // Trésorerie par compte : soldes, plus bas, jours à découvert
  const endDate = closing || x.maxOp;
  const tresorerie = [];
  tresoAcc.forEach((ta) => {
    ta.lines.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    let s = ta.an, enc = 0, dec = 0, negDays = 0;
    let min = s, minDate = start || '', max = s, maxDate = start || '';
    if (s < -0.005 && start && ta.lines.length) negDays += Math.max(0, daysBetween(start, ta.lines[0][0]));
    for (let i = 0; i < ta.lines.length; i++) {
      const [date, amt] = ta.lines[i];
      s += amt;
      if (amt > 0) enc += amt; else dec -= amt;
      const next = i + 1 < ta.lines.length ? ta.lines[i + 1][0] : null;
      if (next === date) continue;
      if (s < min) { min = s; minDate = date; }
      if (s > max) { max = s; maxDate = date; }
      if (s < -0.005) negDays += Math.max(1, daysBetween(date, next || (endDate && endDate > date ? endDate : date)));
    }
    tresorerie.push({
      compte: ta.compte, lib: ta.lib || libOf(ta.compte), an: round2(ta.an), enc: round2(enc), dec: round2(dec), solde: round2(s),
      min: round2(min), minDate, max: round2(max), maxDate, negDays, ops: ta.lines.length,
      first: ta.lines.length ? ta.lines[0][0] : '', last: ta.lines.length ? ta.lines[ta.lines.length - 1][0] : '',
    });
  });
  tresorerie.sort((a, b) => a.compte.localeCompare(b.compte));
  big.sort((a, b) => Math.abs(b.amt) - Math.abs(a.amt));

  // Facturation de fin d'exercice (risque de séparation des exercices)
  let lastWeek = 0;
  if (closing) sales.forEach(([, date, ttc]) => { if (date <= closing && daysBetween(date, closing) < 7) lastWeek += ttc; });
  const spanDays = start && closing ? daysBetween(start, closing) + 1 : 365;

  return {
    achats: {
      invoices: purchases.length, ttc: ttcP, avoirs: round2(avoirsP), suppliers: supF.list, nbSuppliers: supF.count, delay: supF.delay,
      dupStrong, dupPossible, recurringRefs: recurring.size, noVat: Array.from(noVatP.values()).sort((a, b) => b.total - a.total), overVat: overVatP, autoliq, cut: cut.achats,
    },
    charges: {
      accounts: Array.from(chAcc.values()).map(({ big: _b, ...a }) => ({ ...a, total: round2(a.total), direct: round2(a.direct), months: Object.fromEntries(Object.entries(a.months).map(([k, v]) => [k, round2(v)])) })).sort((a, b) => a.compte.localeCompare(b.compte)),
      cca: cca.slice(0, 40), das2: Array.from(das2.values()).map((b) => ({ ...b, total: round2(b.total) })).filter((b) => b.total > 1200).sort((a, b) => b.total - a.total),
      perso: x.perso, amendes: x.amendes, weekend: x.weekend, gifts: x.gifts, giftVat, notesFrais, cut: cut.charges,
    },
    clients: {
      invoices: sales.length, ttc: ttcS, avoirs: round2(avoirsS), customers: cliF.list, nbCustomers: cliF.count, delay: cliF.delay, directSales,
      numbering, noVat: noVatS, overVat: overVatS, cut: cut.ventes, lastWeek: round2(lastWeek), avgWeek: round2((ttcS / spanDays) * 7),
    },
    treso: {
      accounts: tresorerie, cash,
      flux: Object.values(flux).map((f) => ({ ...f, enc: round2(f.enc), dec: round2(f.dec) })).sort((a, b) => (b.enc + b.dec) - (a.enc + a.dec)),
      big: big.filter((m) => !/^4[0-3]/.test(m.cp)).slice(0, 40), // hors clients, fournisseurs et paie
    },
  };
}
