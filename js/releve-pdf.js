/*
 * Relevé bancaire en PDF → liste des opérations, avec contrôle des totaux et des soldes. Toutes les banques dont le PDF
 * a du texte sélectionnable (pas les PDF scannés) :
 *   1. lecture par les en-têtes de colonnes (édition « Relevé bancaire » d'ACD, BNP Paribas, Société Générale, LCL,
 *      Crédit Agricole, Crédit Mutuel / CIC, La Banque Postale, Caisse d'Épargne, banques en ligne…) : « Date »,
 *      « Débit » / « Dépenses » / « Sortie » / « Argent sortant »…, « Crédit » / « Recettes » / « Entrée »…, ou un
 *      seul « Montant » signé, et éventuellement « Valeur » (date de valeur, écartée) et « Solde » (solde progressif) ;
 *   2. à défaut d'en-têtes reconnus, ou si leurs totaux ne tombent pas juste, colonnes déduites de la position des
 *      montants (débit et crédit, montant signé, solde progressif ; signe donné par les rubriques « Virements reçus »,
 *      « Prélèvements »… quand les montants ne sont pas signés) : chaque hypothèse n'est retenue que si elle se vérifie
 *      au centime (solde initial + crédits − débits = solde final, totaux imprimés, ou solde progressif).
 *
 * RelevePdf.parse(doc, PdfReader) → {
 *   meta: { titre, dossier, compte, du, au },                  dates au format AAAA-MM-JJ
 *   ops: [{ date, lib, debit, credit, page }],                  montants positifs, en euros
 *   soldeInitial, soldeFinal, soldeCalcule, totals: { debit, credit }   (null si absents du relevé)
 *   controls: [{ ok, label }], warnings: [texte], mode
 * }
 * Les montants sont rattachés à une colonne d'après leur position (montants alignés à droite).
 */
(function () {
  'use strict';

  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  const round2 = (n) => Math.round(n * 100) / 100 || 0;
  const eq = (a, b) => Math.abs(a - b) < 0.005;
  const fmt = (n) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pad2 = (n) => String(n).padStart(2, '0');

  // ---------- Montants ----------
  // « 1 234,56 », « 1.234,56 », « 1234,56 » ; avec `dot` aussi « 1,234.56 » et « 12.50 ». Signe devant (+, -, −), moins
  // derrière ou parenthèses ; devise collée ou séparée par un blanc (€, EUR).
  const RE_COMMA = /^\d{1,3}(?:[ .  ]\d{3})*,\d{2}$|^\d+,\d{2}$/;
  const RE_DOT = /^\d{1,3}(?:,\d{3})+\.\d{2}$|^\d+\.\d{2}$/;
  const amount = (t) => {
    let s = String(t).replace(/[\s  ]/g, '');
    if (/,\d{2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    return round2(parseFloat(s));
  };
  function money(text, dot) {
    let t = String(text || '').replace(/[  ]/g, ' ').trim().replace(/\s*(€|EUR|EUROS?|¤)$/i, '').replace(/^(€|EUR)\s*/i, '').trim();
    let sign = 0, m;
    if ((m = /^\((.+)\)$/.exec(t))) { sign = -1; t = m[1].trim(); }
    if ((m = /^([+\-−])\s?(.+)$/.exec(t))) { sign = m[1] === '+' ? 1 : -1; t = m[2]; }
    else if ((m = /^(.+?)\s?([-−])$/.exec(t))) { sign = -1; t = m[1]; }
    if (!(RE_COMMA.test(t) || (dot && RE_DOT.test(t)))) return null;
    return { v: amount(t), sign };
  }
  const isCurrency = (t) => /^(€|EUR|EUROS?|¤)$/i.test(String(t).trim());

  // ---------- Dates ----------
  const RE_DATE = /^(\d{2})[/.-](\d{2})[/.-](\d{4}|\d{2})\b/;
  const iso = (d, m, y) => `${String(y).length === 2 ? '20' + y : y}-${pad2(m)}-${pad2(d)}`;
  const isoOf = (s) => { const m = RE_DATE.exec(String(s || '').trim()); return m ? iso(m[1], m[2], m[3]) : null; };
  const MONTHS = new Map(Object.entries({
    JAN: 1, JANV: 1, JANVIER: 1, JANUARY: 1, FEV: 2, FEVR: 2, FEVRIER: 2, FEB: 2, FEBRUARY: 2, MAR: 3, MARS: 3, MARCH: 3,
    AVR: 4, AVRIL: 4, APR: 4, APRIL: 4, MAI: 5, MAY: 5, JUIN: 6, JUN: 6, JUNE: 6, JUIL: 7, JUILLET: 7, JUL: 7, JULY: 7,
    AOU: 8, AOUT: 8, AUG: 8, AUGUST: 8, SEP: 9, SEPT: 9, SEPTEMBRE: 9, SEPTEMBER: 9, OCT: 10, OCTOBRE: 10, OCTOBER: 10,
    NOV: 11, NOVEMBRE: 11, NOVEMBER: 11, DEC: 12, DECEMBRE: 12, DECEMBER: 12,
  }));
  const monthOf = (w) => MONTHS.get(norm(w).replace(/\.$/, '')) || (/^\d{1,2}$/.test(w) && +w >= 1 && +w <= 12 ? +w : null);
  // « 1er octobre 2025 », « 01/10/2025 », « 01.10.25 » → AAAA-MM-JJ
  const isoAny = (d, m, y) => {
    const mm = monthOf(m);
    if (!mm || Number(d) < 1 || Number(d) > 31) return null;
    return iso(d, mm, y);
  };
  const RE_PERIOD = /\bdu\s+(\d{1,2})(?:er)?[\s/.-]+(\d{1,2}|[a-zéûè]+\.?)[\s/.-]+(\d{4}|\d{2})\s+au\s+(\d{1,2})(?:er)?[\s/.-]+(\d{1,2}|[a-zéûè]+\.?)[\s/.-]+(\d{4}|\d{2})\b/i;
  const RE_FULL = /\b(\d{2})[/.-](\d{2})[/.-](\d{4})\b/;
  const RE_LONG = /\b(\d{1,2})(?:er)?\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\s+(\d{4})\b/i;
  // Date en tête de ligne : complète (« 05/10/2026 », « 05.10.26 », « 2026-10-05 »), courte (« 05.10 », « 05/10 »), en
  // lettres (« 5 oct. 2026 », « 05 octobre », « 21sept. ») → { d, m, y (ou null), len }
  function lineDate(text) {
    const t = String(text || '');
    let m = /^(\d{2})[/.-](\d{2})[/.-](\d{4}|\d{2})(?![\d,])/.exec(t);
    if (m) return { d: m[1], m: m[2], y: m[3].length === 2 ? '20' + m[3] : m[3], len: m[0].length };
    m = /^(\d{4})-(\d{2})-(\d{2})\b/.exec(t);
    if (m) return { d: m[3], m: m[2], y: m[1], len: m[0].length };
    m = /^(\d{2})[/.](\d{2})(?![/.-]?\d|,\d)/.exec(t);
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) return { d: m[1], m: m[2], y: null, len: m[0].length };
    m = /^(\d{1,2})(?:er)?\s?([A-Za-zÀ-ÿ]{3,9}\.?)(?:\s+(\d{4}))?(?![\w])/.exec(t);
    if (m && MONTHS.has(norm(m[2]).replace(/\.$/, '')) && +m[1] >= 1 && +m[1] <= 31) return { d: pad2(m[1]), m: pad2(monthOf(m[2])), y: m[3] || null, len: m[0].length };
    return null;
  }

  // ---------- Libellés particuliers ----------
  const RE_PAGE = /\bpage\s*-?\s*\d+\b|^\d+\s*\/\s*\d+$/i;
  // Fin du tableau des opérations (informations et frais qui suivent, avec des dates et des montants)
  const RE_END = /^(INFORMATIONS? PREALABLES?|FRAIS CONSTATES|DETAIL DES FRAIS|VOS FRAIS|RECAPITULATIF DES FRAIS|TOTAL DES FRAIS|BON A SAVOIR)\b/;
  const RE_TOTAL = /^(TOTAL|TOTAUX)\b(?! DES FRAIS| FRAIS)/;
  const RE_SUB = /^(REPORT|A REPORTER|SOUS-TOTAL|SOUS TOTAL)\b/;
  // Paragraphe hors tableau : « Ancien solde au 01/09/2026 : 2 658,68 EUR »
  const RE_SOLDE_PARA = /\b(ANCIEN|NOUVEAU) SOLDE (?:\w+ )?AU (\d{2})[/.](\d{2})[/.](\d{4})\s*:?\s*([-+−]?\s?\d{1,3}(?:[ .  ]\d{3})*,\d{2})/;

  // En-têtes de colonnes reconnus
  const H_DATE = /^(DATES?|LE|JOUR)\b/;
  const H_DEB = /^(DEPENSES?|DEBITS?|SORTIES?|MONTANT DEBIT|ARGENT SORTANT|RETRAITS?|DECAISSEMENTS?|MONEY OUT|PAID OUT|WITHDRAWALS?)\b/;
  const H_CRE = /^(RECETTES?|CREDITS?|ENTREES?|MONTANT CREDIT|ARGENT ENTRANT|DEPOTS?|ENCAISSEMENTS?|MONEY IN|PAID IN|DEPOSITS?)\b/;
  const H_AMT = /^(MONTANTS?|AMOUNT|MOUVEMENTS?)\b(?! (DEBIT|CREDIT))/;
  const H_BAL = /^(SOLDES?|RESTE|BALANCE)\b/;
  const H_VAL = /^(DATE )?(DE )?VALEUR$|^(DATE )?VAL\.?$/;
  const RE_DATE_ONLY = /^\d{2}[/.-]\d{2}([/.-](\d{4}|\d{2}))?$/;
  // Rubriques des relevés sans colonnes débit / crédit (montants non signés)
  const SEC_CRE = /^(VIREMENTS? RECUS?|OPERATIONS? DE DEPOTS?|REMISES?( DE CHEQUES?)?|DEPOTS?|VERSEMENTS?|ENCAISSEMENTS?|CREDITS?|AUTRES CREDITS?|INTERETS?)\b/;
  const SEC_DEB = /^(PRELEVEMENTS?|PAIEMENTS?|RETRAITS?|FRAIS|COTISATIONS?|CHEQUES? EMIS|PAIEMENTS? CHEQUES?|VIREMENTS? EMIS|DEBITS?|AUTRES DEBITS?|COMMISSIONS?|ECHEANCES?)\b/;

  // Informations du relevé (période, compte, titre) et année des dates sans année
  function readMeta(doc, P) {
    const meta = { titre: '', dossier: '', compte: '', du: null, au: null };
    let yearHint = null, auRef = null;
    // Lignes du haut de la première page, jusqu'à l'en-tête du tableau ou la première opération
    const first = [];
    for (const l of doc.pages[0] ? P.lines(doc.pages[0]).slice(0, 40) : []) {
      const k = norm(l.text);
      if ((/^(DATE|LE)\b/.test(k) && /DEBIT|CREDIT|MONTANT|DEPENSES|RECETTES|SORTIE|ENTREE/.test(k)) || (lineDate(l.text) && /\d,\d{2}\b/.test(l.text))) break;
      first.push(l);
    }
    first.forEach((l, i) => {
      const t = l.text;
      const per = RE_PERIOD.exec(t);
      const cpt = /\bcompte\s*n[°o]?\s*:?\s*(.+)$/i.exec(t);
      const full = RE_FULL.exec(t);
      const long = RE_LONG.exec(t);
      if (full && !yearHint) yearHint = full[3];
      if (long && !yearHint) yearHint = long[3];
      const au = /\bau\s+(\d{2})[/.](\d{2})[/.](\d{4})\b/i.exec(t);
      if (au) auRef = iso(au[1], au[2], au[3]);
      if (per && !meta.du) { meta.du = isoAny(per[1], per[2].replace(/\.$/, ''), per[3]); meta.au = isoAny(per[4], per[5].replace(/\.$/, ''), per[6]); }
      if (cpt && !meta.compte) meta.compte = cpt[1].trim();
      if (per || cpt) return;
      if (/relev[eé]|extrait de compte/i.test(t) && !meta.titre) meta.titre = t;
      else if (i === 0 && !meta.dossier) meta.dossier = t;
    });
    // Année d'une date sans année : celle qui la place dans la période du relevé (à 45 jours près), sinon l'année de la
    // date de référence (« … au 30/09/2026 ») ou d'une date complète lue en tête du relevé
    const yearOf = (d, m) => {
      if (meta.du && meta.au) {
        const ys = Array.from(new Set([meta.du.slice(0, 4), meta.au.slice(0, 4)]));
        const lo = Date.parse(meta.du) - 45 * 864e5, hi = Date.parse(meta.au) + 45 * 864e5;
        return ys.find((y) => { const t = Date.parse(`${y}-${m}-${d}`); return t >= lo && t <= hi; }) || meta.au.slice(0, 4);
      }
      if (auRef) { const y = +auRef.slice(0, 4); return Date.parse(`${y}-${m}-${d}`) > Date.parse(auRef) + 45 * 864e5 ? String(y - 1) : String(y); }
      return yearHint;
    };
    return { meta, yearOf };
  }

  // Contrôles communs : totaux imprimés, soldes, solde progressif, période
  function controlsOf(r) {
    const { ops, totals, soldeInitial, soldeFinal, meta } = r;
    const sumD = round2(ops.reduce((t, o) => t + o.debit, 0));
    const sumC = round2(ops.reduce((t, o) => t + o.credit, 0));
    const controls = [];
    if (totals) {
      controls.push({ ok: eq(sumD, totals.debit), label: `Total des dépenses : ${fmt(sumD)} €${eq(sumD, totals.debit) ? ' = ' : ' ≠ '}total du relevé ${fmt(totals.debit)} €` });
      controls.push({ ok: eq(sumC, totals.credit), label: `Total des recettes : ${fmt(sumC)} €${eq(sumC, totals.credit) ? ' = ' : ' ≠ '}total du relevé ${fmt(totals.credit)} €` });
    } else controls.push({ ok: null, label: `Pas de ligne « Total » dans le relevé : dépenses ${fmt(sumD)} €, recettes ${fmt(sumC)} €` });
    if (soldeInitial !== null && soldeFinal !== null) {
      const calc = round2(soldeInitial - sumD + sumC);
      controls.push({ ok: eq(calc, soldeFinal), label: `Solde initial ${fmt(soldeInitial)} € − dépenses + recettes = ${fmt(calc)} €${eq(calc, soldeFinal) ? ' = ' : ' ≠ '}solde final ${fmt(soldeFinal)} €` });
    }
    const withBal = ops.filter((o) => o.solde !== undefined && o.solde !== null);
    if (withBal.length >= 2 && withBal.length >= ops.length / 2) {
      let prev = soldeInitial !== null ? soldeInitial : null, bad = 0;
      ops.forEach((o) => {
        if (o.solde === undefined || o.solde === null) { if (prev !== null) prev = round2(prev + o.credit - o.debit); return; }
        if (prev !== null && !eq(round2(prev + o.credit - o.debit), o.solde)) bad++;
        prev = o.solde;
      });
      controls.push({ ok: !bad, label: bad ? `Solde progressif : ${bad} ligne(s) en écart` : 'Solde progressif juste à chaque ligne' });
    }
    if (meta.du && meta.au) {
      const out = ops.filter((o) => o.date < meta.du || o.date > meta.au);
      controls.push({ ok: !out.length, label: out.length ? `${out.length} opération(s) datée(s) hors de la période du relevé` : 'Toutes les opérations sont dans la période du relevé' });
    }
    return { controls, sumD, sumC };
  }

  // ---------- 1. Lecture par les en-têtes de colonnes ----------
  function parseHeaders(doc, P, base) {
    const meta = Object.assign({}, base.meta);
    const yearOf = base.yearOf;
    const ops = [];
    const warnings = [];
    let soldeInitial = null, soldeFinal = null, soldeCalcule = null, totals = null;
    let cols = null; // { deb, cre } ou { amt }, avec val (date de valeur, écartée) et bal (solde progressif)
    let headerSeen = false, stopped = false;
    const paraSolde = (t) => {
      const m = RE_SOLDE_PARA.exec(norm(t));
      if (!m) return false;
      const mv = money(m[5], false);
      if (!mv) return false;
      const v = mv.sign < 0 ? -mv.v : mv.v;
      if (m[1] === 'ANCIEN' && soldeInitial === null) soldeInitial = v;
      if (m[1] === 'NOUVEAU') soldeFinal = v;
      return true;
    };
    doc.pages.forEach((page, pi) => {
      const lines = P.lines(page);
      let hi = -1;
      lines.forEach((l, i) => {
        if (hi >= 0) return;
        const segs = P.segments(l, 1);
        const names = segs.map((s) => norm(s.text));
        const pick = (re) => segs[names.findIndex((n) => re.test(n))];
        const deb = pick(H_DEB), cre = pick(H_CRE), amt = pick(H_AMT);
        // En-têtes serrés : « Date opé. Date valeur » peut former un seul morceau ; il suffit qu'il commence par « Date »
        if (names.some((n) => H_DATE.test(n)) && ((deb && cre) || amt)) {
          hi = i;
          cols = deb && cre ? { deb, cre } : { amt };
          cols.val = pick(H_VAL) || segs[names.findIndex((n) => /\bVALEUR\b/.test(n))] || null;
          const bal = segs.filter((s, k) => H_BAL.test(names[k]) && s !== deb && s !== cre && s !== amt).pop();
          cols.bal = bal || null;
          headerSeen = true;
          stopped = false;
        }
      });
      if (!cols) { lines.forEach((l) => paraSolde(l.text)); return; }
      if (hi < 0) lines.forEach((l) => paraSolde(l.text)); else lines.slice(0, hi).forEach((l) => paraSolde(l.text));
      let last = null, lastY = null;
      lines.slice(hi + 1).forEach((l) => {
        if (stopped) return;
        if (RE_PAGE.test(l.text)) return; // pied de page
        const segs = P.segments(l, 1).filter((s) => !isCurrency(s.text));
        // Montant : nombre qui finit dans les colonnes de montants (une date « 05.10 » à gauche n'en est pas un)
        const amtX = cols.amt ? cols.amt.x0 : Math.min(cols.deb.x0, cols.cre.x0);
        const isAmt = (s) => s.x1 >= amtX - 5 && money(s.text, true) !== null;
        const amts = segs.filter(isAmt);
        // Date de valeur : écartée du libellé
        const texts = segs.filter((s, i) => !isAmt(s)
          && !(i && cols.val && RE_DATE_ONLY.test(s.text) && s.x1 > cols.val.x0 - 4 && s.x0 < cols.val.x1 + 4));
        let deb = 0, cre = 0, bal = null;
        amts.forEach((s) => {
          const mv = money(s.text, true);
          const v = mv.sign < 0 ? -mv.v : mv.v;
          // Colonne dont le bord droit de l'en-tête est le plus proche du bord droit du montant
          const cand = (cols.amt ? [['amt', cols.amt]] : [['deb', cols.deb], ['cre', cols.cre]]).concat(cols.bal ? [['bal', cols.bal]] : []);
          const near = cand.reduce((b, c) => (Math.abs(s.x1 - c[1].x1) < Math.abs(s.x1 - b[1].x1) ? c : b));
          if (near[0] === 'bal') { bal = v; return; }
          if (near[0] === 'amt') { if (v < 0) deb += -v; else cre += v; return; }
          if (near[0] === 'deb') deb += mv.v; else cre += mv.v;
        });
        deb = round2(deb); cre = round2(cre);
        const first = texts[0] ? texts[0].text : '';
        const ld = lineDate(first);
        let d = null;
        if (ld) { const y = ld.y || yearOf(ld.d, ld.m); if (y) d = { d: ld.d, m: ld.m, y, len: ld.len }; }
        let rest = (d ? first.slice(d.len) : first).trim();
        if (d && cols.val) rest = rest.replace(/^\d{2}[/.-]\d{2}([/.-](\d{4}|\d{2}))?(?![\d,])\s*/, '');
        const lib = [rest].concat(texts.slice(1).map((s) => s.text)).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
        const key = norm(lib);
        if (RE_END.test(norm(l.text))) { stopped = true; return; }
        if (d && (!texts[0] || texts[0].x0 < (cols.deb ? Math.min(cols.deb.x0, cols.cre.x0) : cols.amt.x0))) {
          const op = { date: iso(d.d, d.m, d.y), lib, debit: deb, credit: cre, page: pi + 1 };
          if (bal !== null) op.solde = bal;
          ops.push(op);
          last = op; lastY = l.y;
          return;
        }
        if (/^SOLDE CALCULE/.test(key)) { soldeCalcule = round2(cre - deb); last = null; return; }
        const val = bal !== null && !deb && !cre ? bal : round2(cre - deb);
        const signed = /DEBITEUR/.test(key) && val > 0 && cols.amt ? -val : val;
        if (/^SOLDE (FINAL|FIN|NOUVEAU)|^NOUVEAU SOLDE/.test(key)) { if (deb || cre || bal !== null) soldeFinal = signed; last = null; return; }
        if (/^SOLDE (INITIAL|DEBUT|PRECEDENT|REPORTE)|^ANCIEN SOLDE/.test(key)) { if (soldeInitial === null && (deb || cre || bal !== null)) soldeInitial = signed; last = null; return; }
        // « Solde au 31/03 », « Solde créditeur au … » : le premier est le solde initial, le suivant le solde final
        if (/^SOLDE\b/.test(key) && (deb || cre || bal !== null)) { if (soldeInitial === null && !ops.length) soldeInitial = signed; else soldeFinal = signed; last = null; return; }
        if (paraSolde(l.text)) { last = null; return; }
        if (RE_TOTAL.test(key) && (deb || cre)) { totals = { debit: deb, credit: cre }; last = null; return; }
        if (RE_SUB.test(key)) { last = null; return; }
        // Montant sur la ligne suivant celle de la date (libellé sur plusieurs lignes, montant en dernier)
        if (amts.length && last && !last.debit && !last.credit && lastY !== null && lastY - l.y <= 3.3 * l.h) {
          last.debit = deb; last.credit = cre;
          if (bal !== null) last.solde = bal;
          if (lib) last.lib = `${last.lib} ${lib}`.trim();
          lastY = l.y;
          return;
        }
        // Suite du libellé de l'opération précédente (ligne sans date ni montant, juste en dessous)
        if (!amts.length && lib && last && lastY !== null && lastY - l.y <= 2.2 * l.h) {
          last.lib = `${last.lib} ${lib}`.trim();
          lastY = l.y;
          return;
        }
        if (amts.length) warnings.push(`Ligne avec montant sans date, ignorée (page ${pi + 1}) : ${l.text}`);
      });
    });
    if (!headerSeen) throw new Error('Mise en page non reconnue : en-têtes « Date », « Débit » et « Crédit » (ou « Montant ») introuvables.');
    if (!ops.length) throw new Error('Aucune opération trouvée dans ce relevé.');
    ops.filter((o) => !o.debit && !o.credit).forEach((o) => warnings.push(`Opération sans montant (page ${o.page}) : ${o.lib}`));
    // Solde progressif sans solde initial ni final imprimé : déduit de la première et de la dernière ligne
    if (soldeInitial === null && ops[0].solde !== undefined) soldeInitial = round2(ops[0].solde - ops[0].credit + ops[0].debit);
    if (soldeFinal === null && ops[ops.length - 1].solde !== undefined) soldeFinal = ops[ops.length - 1].solde;
    const r = { meta, ops, soldeInitial, soldeFinal, soldeCalcule, totals, warnings, mode: 'en-têtes' };
    return Object.assign(r, controlsOf(r));
  }

  // ---------- 2. Colonnes déduites de la position des montants ----------
  function parseDeduced(doc, P, base) {
    const meta = Object.assign({}, base.meta);
    const yearOf = base.yearOf;
    const all = [];
    doc.pages.forEach((page, pi) => P.lines(page).forEach((l) => {
      if (RE_PAGE.test(l.text)) return;
      all.push({ page: pi + 1, y: l.y, h: l.h || 8, text: l.text, segs: P.segments(l, 1).filter((s) => !isCurrency(s.text)) });
    }));
    // Point décimal seulement si aucun montant n'a de virgule décimale
    const dot = !all.some((l) => l.segs.some((s) => money(s.text, false)));
    let stop = false;
    all.forEach((l) => {
      l.key = norm(l.text);
      if (RE_END.test(l.key)) stop = true;
      l.out = stop;
      l.amts = l.segs.map((s, i) => ({ s, i, mv: money(s.text, dot) })).filter((a) => a.mv && !(a.i === 0 && lineDate(a.s.text)));
      const ld = l.segs[0] ? lineDate(l.segs[0].text) : null;
      if (ld) { const y = ld.y || yearOf(ld.d, ld.m); if (y) l.date = { iso: iso(ld.d, ld.m, y), len: ld.len }; }
    });
    let cand = all.filter((l) => !l.out && l.date && l.amts.length);
    if (!cand.length) throw new Error('Mise en page non reconnue : aucune ligne qui commence par une date et finit par un montant. Seuls les relevés au texte sélectionnable sont lus (pas les PDF scannés).');
    // Position des dates : la plus fréquente (à 4 points près)
    const xs = new Map();
    cand.forEach((l) => { const k = Math.round(l.segs[0].x0 / 4); xs.set(k, (xs.get(k) || 0) + 1); });
    const dx = Array.from(xs.entries()).sort((a, b) => b[1] - a[1])[0][0] * 4;
    cand = cand.filter((l) => Math.abs(l.segs[0].x0 - dx) <= 6);
    // Colonnes de montants : bords droits regroupés (écart de plus de 20 points entre colonnes)
    const edges = cand.flatMap((l) => l.amts.map((a) => a.s.x1)).sort((a, b) => a - b);
    const groups = [];
    edges.forEach((x) => { const g = groups[groups.length - 1]; if (g && x - g[g.length - 1] <= 20) g.push(x); else groups.push([x]); });
    const cols = groups.filter((g) => g.length >= Math.max(2, cand.length * 0.05)).map((g) => g[Math.floor(g.length / 2)]);
    const colOf = (x) => { let best = -1, dist = 13; cols.forEach((c, k) => { const dd = Math.abs(x - c); if (dd < dist) { dist = dd; best = k; } }); return best; };
    all.forEach((l) => l.amts.forEach((a) => { a.col = colOf(a.s.x1); }));
    const K = cols.length;
    const HYP = { 1: [['signe'], ['rubrique']], 2: [['debit', 'credit'], ['credit', 'debit'], ['signe', 'solde']], 3: [['debit', 'credit', 'solde'], ['credit', 'debit', 'solde']] }[K];
    if (!HYP) throw new Error(`Mise en page non reconnue : ${K} colonnes de montants.`);
    const candSet = new Set(cand);
    const firstOp = all.indexOf(cand[0]);
    // Rubrique en cours (relevés sans colonnes débit / crédit) : signe des montants non signés
    let sec = 0;
    all.forEach((l) => {
      if (!l.amts.length && !l.date && l.text.length < 60) { if (SEC_CRE.test(l.key)) sec = 1; else if (SEC_DEB.test(l.key)) sec = -1; }
      l.sec = sec;
    });
    const tries = HYP.map((roles) => {
      const ops = [], warnings = [];
      let soldeInitial = null, soldeFinal = null, totals = null, last = null;
      const signedOf = (a) => {
        const role = roles[a.col];
        if (role === 'debit') return -a.mv.v;
        if (role === 'credit') return a.mv.v;
        return a.mv.sign < 0 ? -a.mv.v : a.mv.v;
      };
      all.forEach((l, idx) => {
        if (l.out) return;
        const inCols = l.amts.filter((a) => a.col >= 0);
        if (candSet.has(l)) {
          const op = { date: l.date.iso, lib: '', debit: 0, credit: 0, page: l.page };
          const lead = l.segs[0].text.slice(l.date.len).trim();
          op.lib = [lead].concat(l.segs.slice(1).filter((s) => !inCols.some((a) => a.s === s) && !RE_DATE_ONLY.test(s.text)).map((s) => s.text)).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
          inCols.forEach((a) => {
            const role = roles[a.col];
            if (role === 'solde') { op.solde = a.mv.sign < 0 ? -a.mv.v : a.mv.v; return; }
            let v;
            if (role === 'rubrique') v = (a.mv.sign || l.sec || 1) * a.mv.v;
            else v = signedOf(a);
            if (v < 0) op.debit = round2(op.debit - v); else op.credit = round2(op.credit + v);
          });
          ops.push(op);
          last = { op, l };
          return;
        }
        // Solde imprimé : avant la première opération, solde initial ; après, solde final
        if (/SOLDE/.test(l.key.replace(/\s/g, '')) && inCols.length) {
          const a = inCols[inCols.length - 1];
          let v = signedOf(a);
          if (roles[a.col] === 'rubrique' || roles[a.col] === 'signe' || roles[a.col] === 'solde') v = a.mv.sign < 0 || /DEBITEUR/.test(l.key) ? -a.mv.v : a.mv.v;
          if (idx < firstOp) { if (soldeInitial === null) soldeInitial = v; } else soldeFinal = v;
          last = null;
          return;
        }
        if (RE_TOTAL.test(l.key) && inCols.length >= 2) {
          const t = { debit: 0, credit: 0 };
          inCols.forEach((a) => { if (roles[a.col] === 'debit') t.debit = round2(t.debit + a.mv.v); if (roles[a.col] === 'credit') t.credit = round2(t.credit + a.mv.v); });
          if (t.debit || t.credit) totals = t;
          last = null;
          return;
        }
        // Suite du libellé : ligne sans montant, en retrait de la colonne des dates, juste en dessous
        if (!l.amts.length && last && l.page === last.l.page && l.segs[0] && l.segs[0].x0 > dx + 15 && last.l.y - l.y <= 2.2 * Math.max(l.h, 8)
          && !/TOTAL|SOLDE|REPORT/.test(l.key)) {
          last.op.lib = `${last.op.lib} ${l.segs.map((s) => s.text).join(' ')}`.replace(/\s+/g, ' ').trim();
          last.l = l;
          return;
        }
        if (l.amts.length) last = null;
      });
      if (soldeInitial === null && ops[0] && ops[0].solde !== undefined) soldeInitial = round2(ops[0].solde - ops[0].credit + ops[0].debit);
      if (soldeFinal === null && ops.length && ops[ops.length - 1].solde !== undefined) soldeFinal = ops[ops.length - 1].solde;
      const r = { meta, ops, soldeInitial, soldeFinal, soldeCalcule: null, totals, warnings, mode: `colonnes déduites (${roles.join(', ')})` };
      Object.assign(r, controlsOf(r));
      const checks = r.controls.filter((c) => c.ok !== null && !/période/.test(c.label));
      r.verified = checks.length > 0 && checks.every((c) => c.ok);
      return r;
    });
    const ok = tries.find((r) => r.verified);
    if (ok) return ok;
    // Aucune hypothèse vérifiable : montants signés sur une seule colonne, repris avec un avertissement
    const signedOnly = tries.find((r, k) => HYP[k][0] === 'signe' && HYP[k].length === 1 && cand.some((l) => l.amts.some((a) => a.mv.sign)));
    if (signedOnly && !signedOnly.controls.some((c) => c.ok === false)) {
      signedOnly.warnings.push('Aucun solde ni total imprimé pour vérifier la lecture : contrôlez les montants.');
      return signedOnly;
    }
    throw new Error('Mise en page non reconnue : aucune lecture des colonnes de montants ne retrouve les soldes ou les totaux du relevé.');
  }

  function parse(doc, P) {
    const base = readMeta(doc, P);
    let byHeaders = null, err = null;
    try { byHeaders = parseHeaders(doc, P, base); } catch (e) { err = e; }
    // Lecture par les en-têtes juste : retenue. Sinon, colonnes déduites si elles se vérifient au centime.
    if (byHeaders && !byHeaders.controls.some((c) => c.ok === false) && !byHeaders.warnings.some((w) => /sans montant/.test(w))) return byHeaders;
    let deduced = null;
    try { deduced = parseDeduced(doc, P, base); } catch (e) { if (!byHeaders) throw /opération/.test(err.message) && !/en-têtes/.test(err.message) ? err : e; }
    if (deduced && (deduced.verified || !byHeaders)) return deduced;
    return byHeaders;
  }

  const api = { parse, amount, isoOf, money, lineDate };
  if (typeof window !== 'undefined') window.RelevePdf = api;
  if (typeof self !== 'undefined') self.RelevePdf = api;
})();
