/*
 * Rapprochement du FEC avec l'état des immobilisations du module immo (PDF texte, ou texte collé) : écritures passées
 * sur les comptes d'immobilisations (classe 2, hors 28 et 29) sans fiche dans le module, contrôle du solde de chaque compte.
 * Montants en centimes (entiers). Tout est lu sur l'appareil.
 *
 * ImmoEtat.readFec(text) → { lines, hasRan, ranJournals, start, end } : lignes des écritures qui mouvementent un compte
 *   d'immobilisation (toutes leurs lignes : fournisseur 40, TVA 445), à-nouveaux repérés (journal AN / RAN, libellé « à nouveau »).
 * ImmoEtat.rowsFromPdf(doc, PdfReader) / ImmoEtat.rowsFromText(text) → lignes { texts, amts } de l'état : quatre montants
 *   par ligne (début, acquisitions, sorties, fin) ; une ligne dont des zéros sont laissés en blanc est replacée d'après les
 *   colonnes apprises sur les lignes complètes (bord droit des montants).
 * ImmoEtat.parse(rows) → { company, period, edition, accounts: { n: { num, n, label, fiches, immo, compta, ecart, sum, readOk } }, order,
 *   grand, fiches } : « Compte n° … » ouvre un compte (« (suite) » le continue), une ligne chiffrée est une fiche (code puis
 *   libellé), « Sous-total immobilisation », « comptabilité » et « Ecart » closent le compte, « Total … » les totaux.
 *   Lecture contrôlée : la somme des fiches de chaque compte doit redonner son sous-total imprimé (readOk).
 * ImmoEtat.reconcile(fec, etat) → { hasRan, missing, extraCredits, orphanFiches, orphanSorties, matched, rows, totals, warnings } :
 *   par compte et par montant HT, au centime ; une facture ventilée sur plusieurs fiches ou plusieurs factures sur une fiche
 *   sont reconnues jusqu'à quatre éléments ; écart de chaque compte (solde du FEC − valeur brute de fin de l'état, ou, sans
 *   à-nouveaux, mouvements − acquisitions et sorties), expliqué par les écritures sans fiche ou résiduel.
 */
(function () {
  'use strict';

  const AMT = '-?\\(?-?\\d{1,3}(?:[\\u00a0\\u202f .]\\d{3})*,\\d{2}\\)?-?';
  const AMT_RE = new RegExp(`^${AMT}$`);
  const AMT_G = new RegExp(`(?:^|\\s)(${AMT})(?=\\s|$)`, 'g');
  const compact = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '').toLowerCase();

  // Montant texte → centimes
  function cents(s) {
    let t = String(s == null ? '' : s).trim();
    if (!t) return 0;
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    if (t.endsWith('-')) { neg = true; t = t.slice(0, -1); }
    if (t.startsWith('-')) { neg = !neg; t = t.slice(1); }
    t = t.replace(/[\s  ]/g, '');
    t = t.includes(',') && t.includes('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(',', '.');
    const v = Math.round(parseFloat(t) * 100);
    if (!Number.isFinite(v)) return 0;
    return neg ? -v : v;
  }
  // Compte sans les zéros de fin (2181000000 = 2181)
  const normAcct = (s) => { const d = String(s || '').replace(/\D/g, ''); return d.replace(/0+$/, '') || d; };
  const isImmo = (n) => /^2/.test(n) && !/^2[89]/.test(n);
  function normDate(s) {
    const t = String(s || '').trim();
    let m;
    if ((m = t.match(/^(\d{4})-?(\d{2})-?(\d{2})/))) return m[1] + m[2] + m[3];
    if ((m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/))) return m[3] + m[2] + m[1];
    return '';
  }
  const RAN_JC = /^(AN|RAN|ANO|ANX|A-N|AN\d+|RN)$/i;
  const isRan = (l) => RAN_JC.test(l.jc) || /nouveau/i.test(l.jl) || /(report|reprise)\s.{0,3}\s?nouveau|(^|[\s.])(a|à|�)[\s-]*nouveaux?\b/i.test(l.lib);

  // ---------- FEC ----------
  function readFec(text) {
    const raw = String(text).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
    if (raw.length < 2) throw new Error('Le FEC est vide.');
    const head = raw[0];
    const sep = ['\t', '|', ';'].sort((a, b) => head.split(b).length - head.split(a).length)[0];
    const cols = head.split(sep).map((h) => compact(h.replace(/^"|"$/g, '')));
    const ix = (n) => cols.indexOf(n);
    const I = { jc: ix('journalcode'), jl: ix('journallib'), num: ix('ecriturenum'), date: ix('ecrituredate'), compte: ix('comptenum'), compteLib: ix('comptelib'),
      auxLib: ix('compauxlib'), piece: ix('pieceref'), lib: ix('ecriturelib'), d: ix('debit'), c: ix('credit'), mt: ix('montant'), sens: ix('sens') };
    if (I.compte < 0) throw new Error('Colonne CompteNum introuvable : ce fichier ne ressemble pas à un FEC.');
    if ((I.d < 0 || I.c < 0) && (I.mt < 0 || I.sens < 0)) throw new Error('Colonnes Debit / Credit (ou Montant / Sens) introuvables dans le FEC.');
    const g = (f, i) => (i >= 0 && f[i] !== undefined ? f[i].replace(/^"|"$/g, '').trim() : '');
    // Premier passage : écritures qui mouvementent une immobilisation, à-nouveaux, période ; second : leurs lignes
    const keep = new Set(), ranJ = new Set();
    let hasRan = false, start = '', end = '';
    const split = raw.map((r) => r.split(sep));
    for (let k = 1; k < split.length; k++) {
      const f = split[k];
      const l = { jc: g(f, I.jc), jl: g(f, I.jl), lib: g(f, I.lib) };
      if (isRan(l)) { hasRan = true; if (ranJ.size < 4) ranJ.add(l.jc + (g(f, I.num) ? ` ${g(f, I.num)}` : '')); }
      const d = normDate(g(f, I.date));
      if (d) { if (!start || d < start) start = d; if (!end || d > end) end = d; }
      if (isImmo(normAcct(g(f, I.compte)))) keep.add(`${l.jc}|${g(f, I.num)}`);
    }
    const lines = [];
    for (let k = 1; k < split.length; k++) {
      const f = split[k];
      const compte = g(f, I.compte);
      if (!compte || !keep.has(`${g(f, I.jc)}|${g(f, I.num)}`)) continue;
      let d, c;
      if (I.d >= 0 && I.c >= 0) { d = cents(g(f, I.d)); c = cents(g(f, I.c)); }
      else { const m = cents(g(f, I.mt)); const s = g(f, I.sens).toUpperCase(); if (s === 'D' || s === '+1' || s === '1') { d = m; c = 0; } else { d = 0; c = m; } }
      lines.push({ jc: g(f, I.jc), jl: g(f, I.jl), num: g(f, I.num), date: normDate(g(f, I.date)), compte, compteLib: g(f, I.compteLib), auxLib: g(f, I.auxLib),
        piece: g(f, I.piece), lib: g(f, I.lib), d, c });
    }
    return { lines, hasRan, ranJournals: [...ranJ], start, end };
  }

  // ---------- État des immobilisations ----------
  // Lignes du PDF : textes et montants (bord droit estimé dans chaque morceau de ligne)
  function rowsFromPdf(doc, PdfReader) {
    const raw = [];
    (doc.pages || []).forEach((page) => PdfReader.lines(page).forEach((line) => {
      const texts = [], am = [];
      PdfReader.segments(line).forEach((s) => {
        const t = String(s.text).trim();
        if (!t) return;
        const cw = (s.x1 - s.x0) / Math.max(1, String(s.text).length);
        let rest = String(s.text), m;
        AMT_G.lastIndex = 0;
        const found = [];
        while ((m = AMT_G.exec(s.text))) found.push({ v: m[1], end: m.index + m[0].length });
        if (found.length) {
          found.forEach((f) => { am.push({ s: f.v, x1: s.x0 + cw * f.end }); rest = rest.replace(f.v, ' '); });
          rest = rest.replace(/\s+/g, ' ').trim();
          if (rest) texts.push(rest);
        } else texts.push(t);
      });
      raw.push({ texts, am });
    }));
    return placeAmounts(raw);
  }
  // Quatre colonnes de montants apprises sur les lignes complètes ; une ligne incomplète est replacée au plus près
  function placeAmounts(raw) {
    const edges = [[], [], [], []];
    raw.forEach((r) => { if (r.am.length === 4) r.am.forEach((a, j) => edges[j].push(a.x1)); });
    const med = edges.map((e) => { const s = e.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; });
    return raw.map((r) => {
      let amts = null;
      if (r.am.length >= 4) amts = r.am.slice(-4).map((a) => cents(a.s));
      else if (r.am.length && med.every((m) => m !== null)) {
        amts = [0, 0, 0, 0];
        r.am.forEach((a) => {
          let best = 0;
          med.forEach((m, j) => { if (Math.abs(m - a.x1) < Math.abs(med[best] - a.x1)) best = j; });
          amts[best] = cents(a.s);
        });
      }
      return { texts: r.texts, amts };
    });
  }
  // Texte collé : quatre montants en fin de ligne
  function rowsFromText(text) {
    return String(text).split(/\r?\n/).map((line) => {
      const toks = line.trim().split(/[\s  ]+/).filter(Boolean);
      const groups = [];
      let i = toks.length - 1;
      while (i >= 0 && groups.length < 4) {
        if (!/^-?\(?\d{1,3},\d{2}\)?-?$/.test(toks[i])) break;
        const parts = [toks[i]];
        let j = i - 1;
        while (j >= 0 && /^\d{3}/.test(parts[0].replace(/^-?\(?/, '')) && /^-?\(?\d{1,3}$/.test(toks[j])) {
          parts.unshift(toks[j]);
          j--;
          if (!/^\d{3}$/.test(parts[0].replace(/^-?\(?/, ''))) break;
        }
        groups.unshift(parts.join(' '));
        i = j;
      }
      if (groups.length === 4) return { texts: [toks.slice(0, i + 1).join(' ')], amts: groups.map(cents) };
      return { texts: [line.trim()], amts: null };
    }).filter((r) => r.texts[0] || r.amts);
  }

  function parse(rows) {
    const out = { company: '', period: null, edition: '', accounts: {}, order: [], grand: {} };
    let cur = null, inGrand = false;
    const first = rows.find((r) => r.texts.join('').trim());
    rows.forEach((row) => {
      const t = row.texts.join(' ').replace(/\s+/g, ' ').trim();
      const c = compact(t);
      if (!out.period) {
        const m = t.match(/du\s+(\d{2}\/\d{2}\/\d{4})\s+au\s+(\d{2}\/\d{2}\/\d{4})/i);
        if (m) out.period = { start: normDate(m[1]), end: normDate(m[2]) };
      }
      if (!out.edition) { const m = t.match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*\d{1,2}:\d{2}/); if (m && /page/i.test(t)) out.edition = m[1]; }
      // Nom du dossier : première ligne de texte, sans la date d'édition ni le numéro de page imprimés à droite
      if (!out.company && row === first && !/etat|exercice|immobilisation/i.test(c) && !row.amts) out.company = t.replace(/\s*\d{2}\/\d{2}\/\d{4}\s*-\s*\d{1,2}:\d{2}.*$|\s*page\s*\d+.*$/i, '').trim();
      if (/^compten/.test(c)) {
        const m = t.match(/(\d{3,})\s*(.*)$/);
        if (m) {
          const n = normAcct(m[1]);
          if (!out.accounts[n]) { out.accounts[n] = { num: m[1], n, label: m[2].replace(/\(\s*suite\s*\)/i, '').trim(), fiches: [], immo: null, compta: null, ecart: null }; out.order.push(n); }
          cur = out.accounts[n];
        }
        inGrand = false;
        return;
      }
      if (!row.amts) return;
      const [deb, acq, sor, fin] = row.amts;
      const v = { deb, acq, sor, fin };
      if (/^total/.test(c)) { inGrand = true; if (/comptabilit/.test(c)) out.grand.compta = v; else out.grand.immo = v; return; }
      if (/^(sous-?total)?immobilisation/.test(c)) { if (cur) cur.immo = v; return; }
      if (/^(sous-?total)?comptabilit/.test(c)) { if (cur) cur.compta = v; return; }
      if (/^ecart/.test(c)) { if (inGrand) out.grand.ecart = v; else if (cur) cur.ecart = v; return; }
      if (!cur || inGrand) return;
      const toks = t.split(' ');
      const code = toks.shift() || '';
      cur.fiches.push({ code, label: toks.join(' '), acct: cur.n, ...v });
    });
    out.order.forEach((n) => {
      const a = out.accounts[n];
      const s = a.fiches.reduce((x, f) => ({ deb: x.deb + f.deb, acq: x.acq + f.acq, sor: x.sor + f.sor, fin: x.fin + f.fin }), { deb: 0, acq: 0, sor: 0, fin: 0 });
      a.sum = s;
      a.readOk = !a.immo || (s.deb === a.immo.deb && s.acq === a.immo.acq && s.sor === a.immo.sor && s.fin === a.immo.fin);
    });
    out.fiches = out.order.reduce((k, n) => k + out.accounts[n].fiches.length, 0);
    return out;
  }

  // ---------- Rapprochement ----------
  function subsetSum(items, target, maxSize, tol) {
    const cand = items.filter((x) => x.v > 0 && x.v <= target + tol).sort((a, b) => b.v - a.v).slice(0, 40);
    let found = null;
    const rec = (start, acc, sum) => {
      if (found) return;
      if (acc.length >= 2 && Math.abs(sum - target) <= tol) { found = acc.slice(); return; }
      if (acc.length >= maxSize) return;
      for (let i = start; i < cand.length; i++) {
        if (sum + cand[i].v > target + tol) continue;
        acc.push(cand[i]);
        rec(i + 1, acc, sum + cand[i].v);
        acc.pop();
        if (found) return;
      }
    };
    rec(0, [], 0);
    return found;
  }
  // 1 pour 1, puis plusieurs écritures pour une fiche, puis une écriture pour plusieurs fiches
  function matchSets(A, B, tol = 1) {
    const groups = [], ua = new Set(A), ub = new Set(B);
    A.forEach((a) => {
      const b = [...ub].find((x) => Math.abs(a.v - x.v) <= tol);
      if (b) { groups.push({ a: [a], b: [b], kind: '1-1' }); ua.delete(a); ub.delete(b); }
    });
    [...ub].forEach((b) => {
      const s = subsetSum([...ua], b.v, 4, tol);
      if (s) { groups.push({ a: s, b: [b], kind: 'n-1' }); s.forEach((x) => ua.delete(x)); ub.delete(b); }
    });
    [...ua].forEach((a) => {
      const s = subsetSum([...ub], a.v, 4, tol);
      if (s) { groups.push({ a: [a], b: s, kind: '1-n' }); s.forEach((x) => ub.delete(x)); ua.delete(a); }
    });
    return { groups, ua: [...ua], ub: [...ub] };
  }

  function reconcile(fec, etat) {
    const ecr = new Map();
    fec.lines.forEach((l) => { const k = `${l.jc}|${l.num}`; if (!ecr.has(k)) ecr.set(k, []); ecr.get(k).push(l); });
    const immoLines = fec.lines.filter((l) => isImmo(normAcct(l.compte)));
    const ranLines = immoLines.filter(isRan);
    const hasRan = fec.hasRan;
    const mvts = immoLines.filter((l) => !isRan(l)).map((l, i) => {
      const all = ecr.get(`${l.jc}|${l.num}`) || [l];
      const tiers = all.filter((x) => /^40/.test(x.compte));
      const amt = l.d - l.c;
      return { id: `m${i}`, date: l.date, jc: l.jc, num: l.num, piece: l.piece, lib: l.lib, compte: l.compte, compteLib: l.compteLib, acct: normAcct(l.compte), amt, v: Math.abs(amt),
        supplier: (tiers[0] && (tiers[0].auxLib || tiers[0].compteLib)) || '', ttc: tiers.reduce((s, x) => s + x.c - x.d, 0),
        tva: all.filter((x) => /^445/.test(x.compte)).reduce((s, x) => s + x.d - x.c, 0),
        reclass: all.some((x) => x !== l && isImmo(normAcct(x.compte)) && Math.sign(x.d - x.c) === -Math.sign(amt)), hints: [] };
    });
    const accts = [...new Set([...etat.order, ...immoLines.map((l) => normAcct(l.compte))])].sort();
    const matched = [], missing = [], extraCredits = [], orphanFiches = [], orphanSorties = [], rows = [];
    accts.forEach((n) => {
      const pa = etat.accounts[n];
      const fiches = pa ? pa.fiches : [];
      const deb = mvts.filter((m) => m.acct === n && m.amt > 0), cre = mvts.filter((m) => m.acct === n && m.amt < 0);
      const r1 = matchSets(deb, fiches.filter((f) => f.acq !== 0).map((f) => ({ ...f, v: Math.abs(f.acq) })));
      const r2 = matchSets(cre, fiches.filter((f) => f.sor !== 0).map((f) => ({ ...f, v: Math.abs(f.sor) })));
      r1.groups.forEach((g) => matched.push({ ...g, acct: n, type: 'acq' }));
      r2.groups.forEach((g) => matched.push({ ...g, acct: n, type: 'sor' }));
      const fecRan = ranLines.filter((l) => normAcct(l.compte) === n).reduce((s, l) => s + l.d - l.c, 0);
      const fecMvt = mvts.filter((m) => m.acct === n).reduce((s, m) => s + m.amt, 0);
      const fecFin = fecRan + fecMvt;
      const fl = immoLines.find((l) => normAcct(l.compte) === n) || {};
      const im = pa ? pa.immo || pa.sum : null;
      const ecart = !im ? (hasRan ? fecFin : fecMvt) : hasRan ? fecFin - im.fin : fecMvt - (im.acq - im.sor);
      const unNet = r1.ua.reduce((s, m) => s + m.amt, 0) + r2.ua.reduce((s, m) => s + m.amt, 0);
      const residual = ecart - unNet;
      const status = ecart === 0 && unNet === 0 ? 'ok' : residual === 0 ? 'explained' : 'open';
      r1.ua.forEach((m) => missing.push(m));
      r2.ua.forEach((m) => extraCredits.push(m));
      r1.ub.forEach((f) => orphanFiches.push({ ...f, acctStatus: status }));
      r2.ub.forEach((f) => orphanSorties.push({ ...f, acctStatus: status }));
      if (!pa && !immoLines.some((l) => normAcct(l.compte) === n && (l.d || l.c))) return;
      rows.push({ n, num: (pa && pa.num) || fl.compte || n, label: (pa && pa.label) || fl.compteLib || '', inEtat: !!pa, readOk: pa ? pa.readOk : true,
        fecRan, fecMvt, fecFin, immo: im, ecart, unNet, residual, status, fecVsCompta: hasRan && pa && pa.compta ? fecFin - pa.compta.fin : null });
    });
    // Indices : montant retrouvé sur une fiche d'un autre compte, reclassement entre comptes d'immobilisations
    missing.forEach((m) => {
      const f = orphanFiches.find((x) => x.acct !== m.acct && Math.abs(x.v - m.v) <= 1);
      if (f) { m.hints.push({ type: 'otherAcct', code: f.code, acct: (etat.accounts[f.acct] || {}).num || f.acct }); f.hint = { supplier: m.supplier || m.piece, compte: m.compte }; }
      if (m.reclass) m.hints.push({ type: 'reclass' });
    });
    missing.sort((a, b) => a.date.localeCompare(b.date));
    const sum = (l, k) => l.reduce((s, x) => s + x[k], 0);
    const totals = { missingHT: sum(missing, 'amt'), missingTVA: sum(missing, 'tva'), missingTTC: sum(missing, 'ttc'), ecart: sum(rows, 'ecart'), residual: sum(rows, 'residual'),
      acqFec: mvts.filter((m) => m.amt > 0).reduce((s, m) => s + m.amt, 0), nAcqFec: mvts.filter((m) => m.amt > 0).length };
    const dmy = (d) => (d && d.length === 8 ? `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}` : '');
    const warnings = [];
    if (!hasRan) warnings.push('Aucun à-nouveau dans le FEC : les mouvements de l’exercice sont comparés aux colonnes acquisitions − sorties de l’état.');
    if (etat.period && fec.end && etat.period.end < fec.end) warnings.push(`Le FEC va jusqu’au ${dmy(fec.end)} et l’état s’arrête au ${dmy(etat.period.end)} : les écritures postérieures apparaissent comme sans fiche.`);
    if (etat.period && fec.start && hasRan && fec.start > etat.period.start) warnings.push(`Le FEC commence le ${dmy(fec.start)}, après le début de l’état (${dmy(etat.period.start)}) : les acquisitions antérieures sont dans l’à-nouveau et figurent comme fiches sans écriture, ce qui est normal si le solde du compte concorde.`);
    const bad = rows.filter((r) => r.inEtat && !r.readOk);
    if (bad.length) warnings.push(`Lecture de l’état à vérifier sur ${bad.map((r) => r.num).join(', ')} : la somme des fiches ne redonne pas le sous-total imprimé.`);
    const gap = rows.filter((r) => r.fecVsCompta);
    if (gap.length) warnings.push(`Sur ${gap.length} compte(s), le solde du FEC diffère de la ligne « comptabilité » de l’état : l’état a peut-être été édité avant les dernières saisies.`);
    return { hasRan, ranJournals: fec.ranJournals, missing, extraCredits, orphanFiches, orphanSorties, matched, rows, totals, warnings };
  }

  self.ImmoEtat = { readFec, rowsFromPdf, rowsFromText, parse, reconcile, cents, normAcct, AMT_RE };
})();
