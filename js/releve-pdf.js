/*
 * Relevé bancaire en PDF (édition « Relevé bancaire » d'ACD, et mises en page voisines : colonnes Date, Opérations ou
 * Libellé, Dépenses / Débit et Recettes / Crédit) → liste des opérations, avec contrôle des totaux et des soldes.
 *
 * RelevePdf.parse(doc, PdfReader) → {
 *   meta: { titre, dossier, compte, du, au },                  dates au format AAAA-MM-JJ
 *   ops: [{ date, lib, debit, credit, page }],                  montants positifs, en euros
 *   soldeInitial, soldeFinal, soldeCalcule, totals: { debit, credit }   (null si absents du relevé)
 *   controls: [{ ok, label }], warnings: [texte]
 * }
 * Les montants sont rattachés à une colonne d'après leur position sous les en-têtes (montants alignés à droite).
 */
(function () {
  'use strict';

  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  const round2 = (n) => Math.round(n * 100) / 100 || 0;
  const RE_AMT = /^[-+]?\d{1,3}(?:[ .  ]\d{3})*,\d{2}$|^[-+]?\d+,\d{2}$|^[-+]?\d{1,3}(?:,\d{3})*\.\d{2}$/;
  const amount = (t) => {
    let s = t.replace(/[\s  ]/g, '');
    if (/,\d{2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    return round2(parseFloat(s));
  };
  const RE_DATE = /^(\d{2})[/.-](\d{2})[/.-](\d{4}|\d{2})\b/;
  const iso = (d, m, y) => `${y.length === 2 ? '20' + y : y}-${m}-${d}`;
  const isoOf = (s) => { const m = RE_DATE.exec(String(s || '').trim()); return m ? iso(m[1], m[2], m[3]) : null; };
  const fmt = (n) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // En-têtes de colonnes reconnus
  const H_DATE = /^DATES?( OPERATION| OPE\.?)?$/;
  const H_DEB = /^(DEPENSES?|DEBITS?|SORTIES?|DEBIT EUROS?|MONTANT DEBIT)$/;
  const H_CRE = /^(RECETTES?|CREDITS?|ENTREES?|CREDIT EUROS?|MONTANT CREDIT)$/;
  const H_AMT = /^(MONTANTS?|MONTANT EUROS?)$/;
  const H_VAL = /^(DATE )?(DE )?VALEUR$|^(DATE )?VAL\.?$/;
  const RE_DATE_ONLY = /^\d{2}[/.-]\d{2}[/.-](\d{4}|\d{2})$/;

  function parse(doc, P) {
    const meta = { titre: '', dossier: '', compte: '', du: null, au: null };
    const ops = [];
    const warnings = [];
    let soldeInitial = null, soldeFinal = null, soldeCalcule = null, totals = null;
    let cols = null; // { deb: {x0, x1}, cre: {x0, x1}, amt, val } (val : colonne « Valeur », date de valeur écartée)
    let headerSeen = false;
    doc.pages.forEach((page, pi) => {
      const lines = P.lines(page);
      // En-tête du tableau sur cette page (sinon : colonnes de la page précédente)
      let hi = -1;
      lines.forEach((l, i) => {
        if (hi >= 0) return;
        const segs = P.segments(l, 1);
        const names = segs.map((s) => norm(s.text));
        const deb = segs[names.findIndex((n) => H_DEB.test(n))];
        const cre = segs[names.findIndex((n) => H_CRE.test(n))];
        const amt = segs[names.findIndex((n) => H_AMT.test(n))];
        if (names.some((n) => H_DATE.test(n)) && ((deb && cre) || amt)) {
          hi = i;
          cols = deb && cre ? { deb, cre } : { amt };
          cols.val = segs[names.findIndex((n) => H_VAL.test(n))] || null;
          headerSeen = true;
        }
      });
      // Informations du relevé, au-dessus du tableau de la première page
      if (pi === 0) lines.slice(0, hi >= 0 ? hi : 8).forEach((l, i) => {
        const t = l.text;
        const per = /\bdu\s+(\d{2}\/\d{2}\/\d{2,4})\s+au\s+(\d{2}\/\d{2}\/\d{2,4})/i.exec(t);
        const cpt = /\bcompte\s*n[°o]?\s*:?\s*(.+)$/i.exec(t);
        if (per && !meta.du) { meta.du = isoOf(per[1]); meta.au = isoOf(per[2]); }
        if (cpt && !meta.compte) meta.compte = cpt[1].trim();
        if (per || cpt) return;
        if (/relev[eé]/i.test(t) && !meta.titre) meta.titre = t;
        else if (i === 0 && !meta.dossier) meta.dossier = t;
      });
      if (!cols) return;
      let last = null, lastY = null;
      lines.slice(hi + 1).forEach((l) => {
        if (/\bpage\s*-?\s*\d+\b/i.test(l.text)) return; // pied de page
        const segs = P.segments(l, 1);
        const amts = segs.filter((s) => RE_AMT.test(s.text));
        // Date de valeur : écartée du libellé
        const texts = segs.filter((s, i) => !RE_AMT.test(s.text)
          && !(i && cols.val && RE_DATE_ONLY.test(s.text) && s.x1 > cols.val.x0 - 4 && s.x0 < cols.val.x1 + 4));
        let deb = 0, cre = 0;
        amts.forEach((s) => {
          const v = amount(s.text);
          if (cols.amt) { if (v < 0) deb += -v; else cre += v; return; }
          // Colonne dont le bord droit de l'en-tête est le plus proche du bord droit du montant
          if (Math.abs(s.x1 - cols.deb.x1) <= Math.abs(s.x1 - cols.cre.x1)) deb += v; else cre += v;
        });
        deb = round2(deb); cre = round2(cre);
        const first = texts[0] ? texts[0].text : '';
        const d = RE_DATE.exec(first);
        let rest = (d ? first.slice(d[0].length) : first).trim();
        if (d && cols.val) rest = rest.replace(/^\d{2}[/.-]\d{2}[/.-](\d{4}|\d{2})\b\s*/, '');
        const lib = [rest].concat(texts.slice(1).map((s) => s.text)).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
        const key = norm(lib);
        if (d && (!texts[0] || texts[0].x0 < (cols.deb ? cols.deb.x0 : cols.amt.x0))) {
          const op = { date: iso(d[1], d[2], d[3]), lib, debit: deb, credit: cre, page: pi + 1 };
          if (!deb && !cre) warnings.push(`Opération sans montant (page ${pi + 1}) : ${l.text}`);
          ops.push(op);
          last = op; lastY = l.y;
          return;
        }
        if (/^SOLDE CALCULE/.test(key)) { soldeCalcule = round2(cre - deb); last = null; return; }
        if (/^SOLDE (FINAL|FIN|NOUVEAU)|^NOUVEAU SOLDE/.test(key)) { soldeFinal = round2(cre - deb); last = null; return; }
        if (/^SOLDE (INITIAL|DEBUT|PRECEDENT)|^ANCIEN SOLDE/.test(key)) { if (soldeInitial === null && (deb || cre)) soldeInitial = round2(cre - deb); last = null; return; }
        // « Solde au 31/03 », « Solde créditeur au … » : le premier est le solde initial, le suivant le solde final
        if (/^SOLDE\b/.test(key) && (deb || cre)) { if (soldeInitial === null) soldeInitial = round2(cre - deb); else soldeFinal = round2(cre - deb); last = null; return; }
        if (/^TOTAL/.test(key) && (deb || cre)) { totals = { debit: deb, credit: cre }; last = null; return; }
        if (/^(REPORT|A REPORTER|SOUS-TOTAL|SOUS TOTAL)/.test(key)) { last = null; return; }
        // Suite du libellé de l'opération précédente (ligne sans date ni montant, juste en dessous)
        if (!amts.length && lib && last && lastY !== null && lastY - l.y <= 2.2 * l.h) {
          last.lib = `${last.lib} ${lib}`.trim();
          lastY = l.y;
          return;
        }
        if (amts.length) warnings.push(`Ligne avec montant sans date, ignorée (page ${pi + 1}) : ${l.text}`);
      });
    });
    if (!headerSeen) throw new Error('Mise en page non reconnue : en-têtes « Date », « Dépenses » / « Débit » et « Recettes » / « Crédit » introuvables. Seuls les relevés au texte sélectionnable sont lus (pas les PDF scannés).');
    if (!ops.length) throw new Error('Aucune opération trouvée dans ce relevé.');

    // Contrôles
    const sumD = round2(ops.reduce((t, o) => t + o.debit, 0));
    const sumC = round2(ops.reduce((t, o) => t + o.credit, 0));
    const controls = [];
    const eq = (a, b) => Math.abs(a - b) < 0.005;
    if (totals) {
      controls.push({ ok: eq(sumD, totals.debit), label: `Total des dépenses : ${fmt(sumD)} €${eq(sumD, totals.debit) ? ' = ' : ' ≠ '}total du relevé ${fmt(totals.debit)} €` });
      controls.push({ ok: eq(sumC, totals.credit), label: `Total des recettes : ${fmt(sumC)} €${eq(sumC, totals.credit) ? ' = ' : ' ≠ '}total du relevé ${fmt(totals.credit)} €` });
    } else controls.push({ ok: null, label: `Pas de ligne « Total » dans le relevé : dépenses ${fmt(sumD)} €, recettes ${fmt(sumC)} €` });
    if (soldeInitial !== null && soldeFinal !== null) {
      const calc = round2(soldeInitial - sumD + sumC);
      controls.push({ ok: eq(calc, soldeFinal), label: `Solde initial ${fmt(soldeInitial)} € − dépenses + recettes = ${fmt(calc)} €${eq(calc, soldeFinal) ? ' = ' : ' ≠ '}solde final ${fmt(soldeFinal)} €` });
    }
    if (meta.du && meta.au) {
      const out = ops.filter((o) => o.date < meta.du || o.date > meta.au);
      controls.push({ ok: !out.length, label: out.length ? `${out.length} opération(s) datée(s) hors de la période du relevé` : 'Toutes les opérations sont dans la période du relevé' });
    }
    return { meta, ops, soldeInitial, soldeFinal, soldeCalcule, totals, controls, warnings, sumD, sumC };
  }

  const api = { parse, amount, isoOf };
  if (typeof window !== 'undefined') window.RelevePdf = api;
})();
