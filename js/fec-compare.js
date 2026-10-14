/*
 * Comparaison de deux Fichiers des Écritures Comptables du même exercice (par exemple l'export d'ACD et celui de
 * Pennylane) : différences du FEC comparé par rapport au FEC de référence (celui qui a été déclaré).
 *
 * Exécuté dans un Web Worker : les deux fichiers sont lus sur l'appareil, sans jamais être envoyés ni conservés.
 * Reçoit { ref: { buffer, fileName }, cmp: { buffer, fileName }, opts: { full } } ;
 * renvoie { type: 'progress', pct } puis { type: 'done', result } ou { type: 'error', message }.
 *
 * Deux logiciels n'ont ni les mêmes numéros de comptes (ACD 60610000, Pennylane 6061000009 suffixé par le taux de TVA),
 * ni les mêmes journaux, ni les mêmes n° d'écriture ou de pièce. La comparaison se fait donc :
 *  - par compte ramené à 6 chiffres (606100) et, pour les tiers, par nom (« Garage du Centre SARL » = « GARAGE DU CENTRE ») ;
 *  - avec les correspondances de comptes apprises sur les opérations identiques (même date, même sens, même montant, même
 *    compte à 3 chiffres) : banque 512000 ↔ 512100, tiers au nom tronqué… Elles sont listées, sans être des écarts ;
 *  - ligne à ligne, puis écriture par écriture : écritures identiques, datées autrement, montants ou comptes différents,
 *    lignes ou écritures absentes ou en plus, et ventilations différentes d'un même total (salaires en une ou deux
 *    écritures, ventes centralisées par jour ou par mois).
 * Les à-nouveaux, souvent globaux d'un côté et détaillés par pièce de l'autre, sont comparés compte par compte.
 * Par défaut, si les deux FEC ne couvrent pas la même période (export en cours d'exercice), seule la période commune est
 * comparée (opts.full : tout comparer).
 */
'use strict';

// Lecture du FEC, dates et montants : fonctions du moteur d'analyse (js/fec-worker.js)
if (typeof importScripts === 'function' && typeof parseAmount === 'undefined') importScripts('fec-worker.js' + ((self.location && self.location.search) || ''));

(function () {
  const MAX_LIST = 3000; // éléments transmis par catégorie (les totaux portent sur tout)
  const MAX_LINES = 40; // lignes détaillées par écriture
  const DATE_TOL = 62; // écart de date toléré (jours) pour reconnaître une même écriture

  // ---------- Comptes et tiers ----------
  const LEGAL = /\b(SARL|SAS|SASU|EURL|SA|SNC|SCP|SELARL|SELAS|SELAFA|SCM|EIRL|EI|ETS|ETABLISSEMENTS?|STE|SOCIETE|CIE)\b/g;
  const tiersName = (s) => normTxt(s).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(LEGAL, ' ').replace(/\s+/g, ' ').trim();
  // Libellé de compte collectif ou générique : le compte n'est pas un compte de tiers individuel
  const RE_GENERIC = /^(fournisseurs?|clients?|collectif|divers|comptes? (fournisseurs?|clients?))\b|non parvenues|a etablir|a recevoir|avoirs? a|effets|retenues|acomptes|douteu|litig/;
  function lineKey(compte, clib, auxNum, auxLib) {
    const c = compte.replace(/\s+/g, '').toUpperCase();
    const digits = c.replace(/\D/g, '');
    const root = digits.slice(0, 3);
    if (auxNum || auxLib) return `T${root}:${tiersName(auxLib) || tiersName(auxNum) || c}`;
    if (/[A-Z]/.test(c.slice(3))) return `T${root}:${tiersName(clib) || c.slice(3)}`;
    // Compte de tiers individuel numérique (4010012 « GARAGE DU CENTRE ») : rapproché par le nom
    if (/^(401|404|411)/.test(digits) && digits.length > 6 && clib && !RE_GENERIC.test(normTxt(clib))) return `T${root}:${tiersName(clib)}`;
    return (digits + '000000').slice(0, 6);
  }
  const rootOf = (k) => (k[0] === 'T' ? k.slice(1, 4) : k.slice(0, 3));
  const isTiers = (k) => k[0] === 'T';

  // ---------- Lecture ----------
  function readFec(buffer, fileName, p0, p1) {
    const { text, encoding } = decode(buffer);
    let end = text.indexOf('\n');
    const headerLine = (end < 0 ? text : text.slice(0, end)).replace(/^﻿/, '').replace(/\r$/, '');
    const counts = { '\t': headerLine.split('\t').length - 1, '|': headerLine.split('|').length - 1, ';': headerLine.split(';').length - 1 };
    let sep = counts['\t'] >= counts['|'] ? '\t' : '|';
    if (!counts['\t'] && !counts['|']) sep = ';';
    const header = headerLine.split(sep).map((h) => h.trim().toLowerCase());
    const col = (n) => header.indexOf(n.toLowerCase());
    const I = {};
    ['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef', 'EcritureLib', 'Debit', 'Credit', 'Montant', 'Sens'].forEach((c) => { I[c] = col(c); });
    const montantSens = I.Debit < 0 && I.Montant >= 0 && I.Sens >= 0;
    if (['JournalCode', 'EcritureNum', 'EcritureDate', 'CompteNum'].some((c) => I[c] < 0) || (!montantSens && (I.Debit < 0 || I.Credit < 0))) {
      throw new Error(`${fileName || 'Fichier'} : en-tête de FEC non reconnu (colonnes JournalCode, EcritureNum, EcritureDate, CompteNum, Debit et Credit attendues).`);
    }
    const nameMatch = String(fileName).match(/(\d{9})FEC(\d{8})/i);
    const F = { name: fileName, encoding, siren: nameMatch ? nameMatch[1] : '', closing: nameMatch ? parseDate(nameMatch[2]).iso : null,
      lines: [], entries: [], minOp: '9999', maxOp: '0000', nLines: 0, nZero: 0, nBad: 0, totalD: 0, totalC: 0, labels: new Map(), nums: new Map() };
    const entryOf = new Map();
    const total = text.length;
    let pos = end < 0 ? total : end + 1, next = 0;
    while (pos < total) {
      end = text.indexOf('\n', pos);
      if (end < 0) end = total;
      let line = text.slice(pos, end);
      pos = end + 1;
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (!line.trim()) continue;
      if (pos > next) { self.postMessage({ type: 'progress', pct: Math.round(p0 + ((p1 - p0) * pos) / total) }); next = pos + total / 25; }
      const f = line.split(sep);
      const g = (k) => (I[k] >= 0 && f[I[k]] !== undefined ? f[I[k]].trim() : '');
      F.nLines++;
      let d, c;
      if (montantSens) {
        const m = parseAmount(g('Montant'));
        const s = g('Sens').toUpperCase();
        const deb = s === 'D' || s === '+1' || s === '1';
        d = deb ? m : 0; c = deb ? 0 : m;
      } else { d = parseAmount(g('Debit')); c = parseAmount(g('Credit')); }
      if (Number.isNaN(d) || Number.isNaN(c)) { F.nBad++; d = Number.isNaN(d) ? 0 : d; c = Number.isNaN(c) ? 0 : c; }
      const v = Math.round(d * 100) - Math.round(c * 100);
      F.totalD += Math.round(d * 100); F.totalC += Math.round(c * 100);
      if (!v) { F.nZero++; continue; }
      const jc = g('JournalCode'), num = g('EcritureNum'), compte = g('CompteNum'), clib = g('CompteLib');
      const auxNum = g('CompAuxNum'), auxLib = g('CompAuxLib');
      const dt = parseDate(g('EcritureDate')).iso || '';
      const an = isAN(jc, g('JournalLib'));
      const k = lineKey(compte, clib, auxNum, auxLib);
      if (!F.labels.has(k)) F.labels.set(k, isTiers(k) ? (auxLib || clib || auxNum || compte) : clib);
      let ns = F.nums.get(k);
      if (!ns) F.nums.set(k, (ns = new Set()));
      if (ns.size < 6) ns.add(isTiers(k) && auxNum ? auxNum : compte);
      const ek = jc + '\u0001' + num + '\u0001' + dt;
      let ei = entryOf.get(ek);
      if (ei === undefined) {
        ei = F.entries.length;
        entryOf.set(ek, ei);
        F.entries.push({ j: jc, n: num, dt, p: g('PieceRef'), l: '', an, lines: [], deb: 0, i: ei });
      }
      const E = F.entries[ei];
      const lib = bankLib(g('EcritureLib'));
      if (!E.l && lib) E.l = lib;
      if (!E.p) E.p = g('PieceRef');
      if (v > 0) E.deb += v;
      const li = F.lines.length;
      F.lines.push({ e: ei, k, s: v > 0 ? 1 : -1, a: Math.abs(v), dt, cpt: compte, cl: isTiers(k) ? (auxLib || clib) : clib, aux: auxNum, l: lib, an, t: null, m: -1 });
      E.lines.push(li);
      if (!an && dt) { if (dt < F.minOp) F.minOp = dt; if (dt > F.maxOp) F.maxOp = dt; }
    }
    if (!F.entries.length) throw new Error(`${fileName || 'Fichier'} : aucune écriture lue.`);
    if (F.minOp === '9999') { F.minOp = ''; F.maxOp = ''; }
    return F;
  }

  // ---------- Comparaison ----------
  function compareFec(refIn, cmpIn, opts) {
    opts = opts || {};
    const R = readFec(refIn.buffer, refIn.fileName || '', 0, 35);
    const C = readFec(cmpIn.buffer, cmpIn.fileName || '', 35, 70);
    const warnings = [];
    if (R.siren && C.siren && R.siren !== C.siren) warnings.push(`SIREN différents dans les noms de fichiers (${R.siren} et ${C.siren}) : vérifiez qu'il s'agit du même dossier.`);
    const rClo = R.closing || R.maxOp, cClo = C.closing || C.maxOp;
    if (R.closing && C.closing && R.closing !== C.closing) warnings.push(`Dates de clôture différentes dans les noms de fichiers (${dmy(R.closing)} et ${dmy(C.closing)}) : les deux FEC ne portent peut-être pas sur le même exercice.`);

    // Période comparée
    const start = R.minOp > C.minOp ? R.minOp : C.minOp, stop = R.maxOp < C.maxOp ? R.maxOp : C.maxOp;
    const differ = R.minOp !== C.minOp || R.maxOp !== C.maxOp;
    const restrict = !opts.full && differ && start && stop && start <= stop;
    const inPeriod = (E) => E.an || !restrict || (E.dt >= start && E.dt <= stop);
    const out = { ref: 0, cmp: 0 };
    [[R, 'ref'], [C, 'cmp']].forEach(([F, side]) => F.entries.forEach((E) => { E.on = inPeriod(E); if (!E.on) out[side]++; }));
    const opsOf = (F) => F.entries.filter((E) => E.on && !E.an);
    const rOps = opsOf(R), cOps = opsOf(C);
    self.postMessage({ type: 'progress', pct: 75 });

    // 1. Correspondances de comptes, apprises sur les lignes de même date, sens, montant et compte à 3 chiffres
    const idxL = new Map();
    cOps.forEach((E) => E.lines.forEach((li) => {
      const l = C.lines[li];
      const key = `${l.dt}|${l.s}|${l.a}|${isTiers(l.k) ? 'T' : ''}${rootOf(l.k)}`;
      const arr = idxL.get(key);
      if (arr) { if (!arr.includes(l.k)) arr.push(l.k); } else idxL.set(key, [l.k]);
    }));
    const votes = new Map(), ident = new Map();
    rOps.forEach((E) => E.lines.forEach((li) => {
      const l = R.lines[li];
      const keys = idxL.get(`${l.dt}|${l.s}|${l.a}|${isTiers(l.k) ? 'T' : ''}${rootOf(l.k)}`);
      if (!keys) return;
      if (keys.includes(l.k)) { ident.set(l.k, (ident.get(l.k) || 0) + 1); return; }
      if (keys.length !== 1) return;
      const v = votes.get(l.k) || new Map();
      v.set(keys[0], (v.get(keys[0]) || 0) + 1);
      votes.set(l.k, v);
    }));
    const map = new Map(), maps = [];
    votes.forEach((v, rk) => {
      let best = null, n = 0, tot = ident.get(rk) || 0;
      v.forEach((cnt, ck) => { tot += cnt; if (cnt > n) { n = cnt; best = ck; } });
      if (n >= 0.6 * tot && (n >= 2 || !C.labels.has(rk))) { map.set(rk, best); maps.push({ ref: rk, cmp: best, n }); }
    });
    const mk = (k) => map.get(k) || k;

    // 2. Écritures identiques (même date, mêmes lignes), de préférence à même n° de pièce et d'écriture ; puis lignes
    // identiques (date, sens, montant, compte), les écritures étant appariées par leurs lignes communes
    const sig = (F, E, mapped) => E.lines.map((li) => { const l = F.lines[li]; return `${l.s * l.a}|${mapped ? mk(l.k) : l.k}`; }).sort().join(';');
    const link = (ri, ci, t) => { const r = R.lines[ri], c = C.lines[ci]; r.m = ci; c.m = ri; r.t = t; c.t = t; };
    const pairEntries = (E, F, t) => {
      E.pair = F.i; F.pair = E.i;
      const used = new Set();
      E.lines.forEach((ri) => {
        const r = R.lines[ri];
        const ci = F.lines.find((x) => !used.has(x) && C.lines[x].s === r.s && C.lines[x].a === r.a && C.lines[x].k === mk(r.k));
        if (ci === undefined) return;
        used.add(ci);
        link(ri, ci, t);
      });
    };
    const entIdx = new Map();
    cOps.forEach((F) => { const k = `${F.dt}|${sig(C, F, false)}`; const arr = entIdx.get(k); if (arr) arr.push(F); else entIdx.set(k, [F]); });
    const rSig = new Map();
    rOps.forEach((E) => rSig.set(E, `${E.dt}|${sig(R, E, true)}`));
    // d'abord les écritures de même pièce ou de même n° (deux exports du même logiciel), puis les autres
    [1, 0].forEach((min) => rOps.forEach((E) => {
      if (E.pair !== undefined) return;
      const arr = entIdx.get(rSig.get(E));
      if (!arr || !arr.length) return;
      let best = -1, bestS = min - 1;
      arr.forEach((F, i) => { const sc = (F.p && F.p === E.p ? 2 : 0) + (F.j === E.j && F.n === E.n ? 1 : 0); if (sc > bestS) { bestS = sc; best = i; } });
      if (best >= 0) pairEntries(E, arr.splice(best, 1)[0], 'eq');
    }));
    const lineIdx = new Map();
    cOps.forEach((F) => {
      if (F.pair !== undefined) return;
      F.lines.forEach((li) => {
        const l = C.lines[li];
        const key = `${l.dt}|${l.s}|${l.a}|${l.k}`;
        const arr = lineIdx.get(key);
        if (arr) arr.push(li); else lineIdx.set(key, [li]);
      });
    });
    // Deux tours : d'abord les lignes dont l'écriture est déjà repérée (autre ligne, même pièce ou même n°), puis les autres
    [1, 0].forEach((min) => rOps.forEach((E) => {
      if (E.pair !== undefined) return;
      const hint = new Map();
      E.lines.forEach((ri) => { const r = R.lines[ri]; if (r.m >= 0) hint.set(C.lines[r.m].e, (hint.get(C.lines[r.m].e) || 0) + 1); });
      E.lines.forEach((ri) => {
        const r = R.lines[ri];
        if (r.m >= 0) return;
        const arr = lineIdx.get(`${r.dt}|${r.s}|${r.a}|${mk(r.k)}`);
        if (!arr || !arr.length) return;
        let best = -1, bestN = min - 1;
        arr.forEach((ci, i) => {
          const F = C.entries[C.lines[ci].e];
          const n = (hint.get(F.i) || 0) * 4 + (F.p && F.p === E.p ? 2 : 0) + (F.j === E.j && F.n === E.n ? 1 : 0);
          if (n > bestN) { bestN = n; best = i; }
        });
        if (best < 0) return;
        const ci = arr.splice(best, 1)[0];
        link(ri, ci, 'eq');
        hint.set(C.lines[ci].e, (hint.get(C.lines[ci].e) || 0) + 1);
      });
    }));
    const cands = [];
    rOps.forEach((E) => {
      if (E.pair !== undefined) return;
      const n = new Map();
      E.lines.forEach((ri) => { const r = R.lines[ri]; if (r.m >= 0) n.set(C.lines[r.m].e, (n.get(C.lines[r.m].e) || 0) + 1); });
      n.forEach((cnt, ce) => cands.push([cnt, E.i, ce]));
    });
    cands.sort((a, b) => b[0] - a[0]);
    cands.forEach(([, re, ce]) => {
      const E = R.entries[re], F = C.entries[ce];
      if (E.pair === undefined && F.pair === undefined) { E.pair = ce; F.pair = re; }
    });

    // 3. Écritures sans ligne commune : même contenu à une autre date, puis même date et mêmes comptes ou même total
    const free = (F, ops) => ops.filter((E) => E.pair === undefined && E.lines.every((li) => F.lines[li].m < 0));
    const keyset = (F, E, mapped) => Array.from(new Set(E.lines.map((li) => (mapped ? mk(F.lines[li].k) : F.lines[li].k)))).sort().join(';');
    const pairBy = (keyR, keyC, nearest) => {
      const idx = new Map();
      free(C, cOps).forEach((F) => { const k = keyC(F); const arr = idx.get(k); if (arr) arr.push(F); else idx.set(k, [F]); });
      free(R, rOps).forEach((E) => {
        const arr = idx.get(keyR(E));
        if (!arr) return;
        let best = -1, bestD = Infinity;
        arr.forEach((F, i) => {
          if (F.pair !== undefined) return;
          const dd = Math.abs(daysBetween(E.dt, F.dt));
          if ((nearest ? dd <= DATE_TOL : dd === 0) && dd < bestD) { bestD = dd; best = i; }
        });
        if (best < 0) return;
        if (!nearest && arr.filter((F) => F.pair === undefined && F.dt === E.dt).length > 1) return; // ambigu
        const F = arr[best];
        E.pair = F.i; F.pair = E.i;
      });
    };
    pairBy((E) => sig(R, E, true), (F) => sig(C, F, false), true);
    pairBy((E) => `${E.dt}|${keyset(R, E, true)}`, (F) => `${F.dt}|${keyset(C, F, false)}`, false);
    pairBy((E) => `${E.dt}|${E.deb}`, (F) => `${F.dt}|${F.deb}`, false);
    pairBy((E) => `${E.deb}|${keyset(R, E, true)}`, (F) => `${F.deb}|${keyset(C, F, false)}`, true);
    self.postMessage({ type: 'progress', pct: 85 });

    // 4. Ventilations différentes d'un même total (par jour) : salaires en une ou deux écritures, ventes centralisées…
    const groups = [];
    const regroup = (keyR, keyC, scopeR, scopeC, period) => {
      const g = new Map();
      const addG = (F, li, key, side) => {
        let x = g.get(key);
        if (!x) g.set(key, (x = { ref: [], cmp: [], sR: 0, sC: 0 }));
        x[side].push(li);
        const l = F.lines[li];
        if (side === 'ref') x.sR += l.s * l.a; else x.sC += l.s * l.a;
      };
      scopeR.forEach((E) => E.lines.forEach((li) => { const l = R.lines[li]; if (!l.t) addG(R, li, keyR(l), 'ref'); }));
      scopeC.forEach((F) => F.lines.forEach((li) => { const l = C.lines[li]; if (!l.t) addG(C, li, keyC(l), 'cmp'); }));
      g.forEach((x) => {
        if (!x.ref.length || !x.cmp.length || x.sR !== x.sC) return;
        x.ref.forEach((li) => { R.lines[li].t = 'grp'; });
        x.cmp.forEach((li) => { C.lines[li].t = 'grp'; });
        const l = R.lines[x.ref[0]];
        groups.push({ period, dt: period === 'jour' ? l.dt : l.dt.slice(0, 7), k: mk(l.k), s: l.s, a: Math.abs(x.sR), nRef: x.ref.length, nCmp: x.cmp.length });
      });
    };
    regroup((l) => `${l.dt}|${mk(l.k)}|${l.s}`, (l) => `${l.dt}|${l.k}|${l.s}`, rOps, cOps, 'jour');

    // 5. Écritures appariées : comptes différents (même montant), montants différents (même compte), lignes en plus ou en moins
    rOps.forEach((E) => {
      if (E.pair === undefined) return;
      const F = C.entries[E.pair];
      const L = E.lines.filter((li) => !R.lines[li].t);
      const M = F.lines.filter((li) => !C.lines[li].t);
      const take = (pred, t) => L.slice().forEach((ri) => {
        const r = R.lines[ri];
        if (r.t) return;
        let best = -1, bestV = Infinity;
        M.forEach((ci, i) => { const c = C.lines[ci]; if (c.t || !pred(r, c)) return; const dv = Math.abs(c.a - r.a); if (dv < bestV) { bestV = dv; best = i; } });
        if (best >= 0) link(ri, M[best], t);
      });
      take((r, c) => c.s === r.s && c.a === r.a && c.k === mk(r.k), 'eq');
      take((r, c) => c.s === r.s && c.a === r.a, 'compte');
      take((r, c) => c.s === r.s && c.k === mk(r.k), 'montant');
      L.forEach((ri) => { if (!R.lines[ri].t) R.lines[ri].t = 'abs'; });
      M.forEach((ci) => { if (!C.lines[ci].t) C.lines[ci].t = 'plus'; });
    });

    // 6. Écritures restantes : regroupement par mois (centralisation mensuelle d'un côté, détail de l'autre)
    regroup((l) => `${l.dt.slice(0, 7)}|${mk(l.k)}|${l.s}`, (l) => `${l.dt.slice(0, 7)}|${l.k}|${l.s}`,
      rOps.filter((E) => E.pair === undefined), cOps.filter((F) => F.pair === undefined), 'mois');
    self.postMessage({ type: 'progress', pct: 92 });

    // ---------- Résultats ----------
    const eur = (cents) => Math.round(cents) / 100;
    const lineOut = (F, li) => {
      const l = F.lines[li], E = F.entries[l.e];
      return { j: E.j, n: E.n, dt: l.dt, p: E.p, cpt: l.cpt, aux: l.aux, cl: l.cl, l: l.l, d: l.s > 0 ? eur(l.a) : 0, c: l.s < 0 ? eur(l.a) : 0, k: l.k };
    };
    const entryOut = (F, E, keep) => ({ j: E.j, n: E.n, dt: E.dt, p: E.p, l: E.l, total: eur(E.deb), nLines: E.lines.length,
      tiers: (E.lines.map((li) => F.lines[li]).find((l) => isTiers(l.k)) || {}).cl || '',
      lines: E.lines.filter((li) => !keep || keep(F.lines[li])).slice(0, MAX_LINES).map((li) => lineOut(F, li)) });
    const cap = (arr) => arr.slice(0, MAX_LIST);
    const absent = [], extra = [], modified = [];
    let identical = 0, ventil = 0, sumAbs = 0, sumExtra = 0;
    // Écriture sans équivalent : seules ses lignes restées sans correspondance sont listées (les autres se retrouvent,
    // ventilées autrement, dans d'autres écritures)
    const amountOf = (F, lis) => { let d = 0, c = 0; lis.forEach((li) => { const l = F.lines[li]; if (l.s > 0) d += l.a; else c += l.a; }); return Math.max(d, c); };
    rOps.forEach((E) => {
      const ls = E.lines.map((li) => R.lines[li]);
      if (E.pair === undefined) {
        const rem = E.lines.filter((li) => !R.lines[li].t);
        if (!rem.length) { ventil++; return; }
        const amt = amountOf(R, rem);
        sumAbs += amt;
        absent.push(Object.assign(entryOut(R, E, (l) => !l.t), { amount: eur(amt), partial: rem.length < E.lines.length }));
        return;
      }
      const F = C.entries[E.pair];
      const dd = daysBetween(E.dt, F.dt);
      const diffs = [];
      E.lines.forEach((ri) => {
        const r = R.lines[ri];
        if (r.t === 'compte' || r.t === 'montant') diffs.push({ t: r.t, ref: lineOut(R, ri), cmp: lineOut(C, r.m), ecart: r.t === 'montant' ? eur(C.lines[r.m].a - r.a) : 0 });
        else if (r.t === 'abs') diffs.push({ t: 'abs', ref: lineOut(R, ri), cmp: null });
      });
      F.lines.forEach((ci) => { if (C.lines[ci].t === 'plus') diffs.push({ t: 'plus', ref: null, cmp: lineOut(C, ci) }); });
      if (!dd && !diffs.length) {
        if (ls.some((l) => l.t === 'grp') || F.lines.some((ci) => C.lines[ci].t === 'grp')) ventil++; else identical++;
        return;
      }
      const types = Array.from(new Set(diffs.map((x) => x.t))).concat(dd ? ['date'] : []);
      modified.push({ ref: entryOut(R, E), cmp: entryOut(C, F), days: dd, types, diffs: diffs.slice(0, MAX_LINES) });
    });
    cOps.forEach((F) => {
      if (F.pair !== undefined) return;
      const rem = F.lines.filter((li) => !C.lines[li].t);
      if (!rem.length) return;
      const amt = amountOf(C, rem);
      sumExtra += amt;
      extra.push(Object.assign(entryOut(C, F, (l) => !l.t), { amount: eur(amt), partial: rem.length < F.lines.length }));
    });
    // Comptes différents par paire (ACD 615600 → Pennylane 606300 : n lignes, total)
    const pairs = new Map();
    modified.forEach((m) => m.diffs.forEach((x) => {
      if (x.t !== 'compte') return;
      const key = x.ref.k + '>' + x.cmp.k;
      const p = pairs.get(key) || { ref: x.ref.k, cmp: x.cmp.k, n: 0, total: 0 };
      p.n++;
      p.total = Math.round((p.total + x.ref.d + x.ref.c) * 100) / 100;
      pairs.set(key, p);
    }));

    // Balances comparées (compte aligné sur le FEC comparé), à-nouveaux compris, sur la période comparée
    const bal = new Map();
    const row = (k) => {
      let b = bal.get(k);
      if (!b) bal.set(k, (b = { k, ref: 0, cmp: 0, refAN: 0, cmpAN: 0, refD: 0, refC: 0, cmpD: 0, cmpC: 0, refKeys: new Set() }));
      return b;
    };
    R.entries.forEach((E) => { if (!E.on) return; E.lines.forEach((li) => { const l = R.lines[li]; const b = row(mk(l.k)); b.refKeys.add(l.k); const v = l.s * l.a; b.ref += v; if (E.an) b.refAN += v; if (v > 0) b.refD += v; else b.refC -= v; }); });
    C.entries.forEach((F) => { if (!F.on) return; F.lines.forEach((li) => { const l = C.lines[li]; const b = row(l.k); const v = l.s * l.a; b.cmp += v; if (F.an) b.cmpAN += v; if (v > 0) b.cmpD += v; else b.cmpC -= v; }); });
    const label = (k, refKeys) => {
      const rk = refKeys && refKeys.size ? Array.from(refKeys)[0] : k;
      return R.labels.get(rk) || C.labels.get(k) || '';
    };
    const nums = (F, k) => Array.from(F.nums.get(k) || []);
    const balance = Array.from(bal.values()).map((b) => {
      const refKeys = Array.from(b.refKeys);
      return { k: b.k, root: rootOf(b.k), tiers: isTiers(b.k), lib: label(b.k, b.refKeys),
        refNums: refKeys.flatMap((rk) => nums(R, rk)).slice(0, 6), cmpNums: nums(C, b.k), mapped: refKeys.some((rk) => rk !== b.k),
        ref: eur(b.ref), cmp: eur(b.cmp), ecart: eur(b.cmp - b.ref), refAN: eur(b.refAN), cmpAN: eur(b.cmpAN), ecartAN: eur(b.cmpAN - b.refAN),
        refD: eur(b.refD), refC: eur(b.refC), cmpD: eur(b.cmpD), cmpC: eur(b.cmpC) };
    }).sort((a, b) => (a.root + a.k).localeCompare(b.root + b.k));

    // Chiffres clés (soldes, en positif dans le sens naturel du poste)
    const sumRoot = (side, re, sign) => eur(Array.from(bal.values()).filter((b) => re.test(rootOf(b.k))).reduce((t, b) => t + b[side], 0) * (sign || 1));
    const KEYS = [
      ["Chiffre d'affaires (70)", /^70/, -1], ['Produits (classe 7)', /^7/, -1], ['Charges (classe 6)', /^6/, 1], ['Achats (60)', /^60/, 1],
      ['Services extérieurs (61, 62)', /^6[12]/, 1], ['Impôts et taxes (63)', /^63/, 1], ['Charges de personnel (64)', /^64/, 1],
      ['Dotations (68)', /^68/, 1], ['Immobilisations nettes (20 à 29)', /^2/, 1], ['Stocks (3)', /^3/, 1], ['Clients (41)', /^41/, 1],
      ['Fournisseurs (40)', /^40/, -1], ['État, TVA et impôts (44)', /^44/, -1], ['Trésorerie (50 à 53)', /^5[0-3]/, 1],
      ['Capitaux propres hors résultat (10 à 14)', /^1[0-4]/, -1], ['Emprunts (16)', /^16/, -1],
    ];
    const synth = KEYS.map(([lab, re, sign]) => { const r = sumRoot('ref', re, sign), c = sumRoot('cmp', re, sign); return { label: lab, ref: r, cmp: c, ecart: Math.round((c - r) * 100) / 100 }; });
    const res = (side) => -sumRoot(side, /^[67]/);
    synth.splice(3, 0, { label: 'Résultat (produits − charges)', ref: res('ref'), cmp: res('cmp'), ecart: Math.round((res('cmp') - res('ref')) * 100) / 100, strong: true });
    const facts = (F, ops) => ({ name: F.name, siren: F.siren, closing: F.closing, encoding: F.encoding, start: F.minOp, end: F.maxOp,
      entries: ops.length, anEntries: F.entries.filter((E) => E.an && E.on).length, lines: F.nLines, zero: F.nZero, bad: F.nBad,
      totalD: eur(F.totalD), totalC: eur(F.totalC), journals: Array.from(new Set(F.entries.map((E) => E.j))).sort() });
    const labelOf = (k) => R.labels.get(k) || C.labels.get(k) || '';
    const result = {
      ref: facts(R, rOps), cmp: facts(C, cOps), warnings,
      period: { start, end: stop, restricted: !!restrict, differ, outRef: out.ref, outCmp: out.cmp },
      synth,
      stats: { identical, ventil, modified: modified.length, absent: absent.length, extra: extra.length, sumAbs: eur(sumAbs), sumExtra: eur(sumExtra),
        dates: modified.filter((m) => m.days).length, montants: modified.filter((m) => m.types.includes('montant')).length,
        comptes: modified.filter((m) => m.types.includes('compte')).length, lignes: modified.filter((m) => m.types.includes('abs') || m.types.includes('plus')).length,
        groups: groups.length, refOps: rOps.length, cmpOps: cOps.length },
      absent: cap(absent.sort((a, b) => a.dt.localeCompare(b.dt))), extra: cap(extra.sort((a, b) => a.dt.localeCompare(b.dt))),
      modified: cap(modified.sort((a, b) => a.ref.dt.localeCompare(b.ref.dt))),
      groups: cap(groups.sort((a, b) => a.dt.localeCompare(b.dt) || a.k.localeCompare(b.k)).map((x) => Object.assign(x, { a: eur(x.a), lib: labelOf(x.k) }))),
      accountPairs: Array.from(pairs.values()).sort((a, b) => b.n - a.n).map((p) => Object.assign(p, { refLib: labelOf(p.ref), cmpLib: labelOf(p.cmp) })),
      maps: maps.sort((a, b) => b.n - a.n).map((x) => Object.assign(x, { refLib: R.labels.get(x.ref) || '', cmpLib: C.labels.get(x.cmp) || '', refNums: nums(R, x.ref), cmpNums: nums(C, x.cmp) })),
      balance,
    };
    return result;
  }

  self.compareFec = compareFec;
  self.onmessage = (e) => {
    try {
      self.postMessage({ type: 'done', result: compareFec(e.data.ref, e.data.cmp, e.data.opts || {}) });
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message || String(err) });
    }
  };
})();
