/*
 * Éditions de paie Silae en PDF (journal de paie, détail des cotisations, solde de repos) → lignes chiffrées avec leur
 * libellé et l'intitulé de la colonne de chaque montant, pour les rapprocher des comptes du cycle Personnel.
 *
 * SilaePdf.parse(doc, PdfReader) → { kind, title, rows: [{ page, lab, group, amounts: [{ v, col }] }] }
 *   kind : 'journal' (journal de paie), 'cotis' (détail des cotisations), 'repos' (solde de repos), '' si non reconnu (à titre
 *   indicatif : l'application demande quelle édition est déposée) ;
 *   rows : lignes portant au moins un montant (nombre à deux décimales) ; lab : texte de la ligne avant le premier montant ;
 *   group : dernier intitulé de groupe lu au-dessus (ligne de texte seule sous l'en-tête des colonnes : organisme…) ;
 *   col : intitulé de la colonne du montant (textes courts des lignes d'en-tête de la page situés au-dessus de lui).
 * SilaePdf.pick(rows, key, memo) → { row, amount } : ligne et montant retenus pour un contrôle ('brut', 'net', 'pat', 'cp', 'cpch')
 *   d'après les intitulés (« brut », « part patronale », « indemnité », « charges », ligne de total…), ou le choix mémorisé
 *   (memo : { lab, col } en clés de SilaePdf.key) ; null si rien n'est reconnu.
 * SilaePdf.candidates(rows, key) → [{ row, amount, sc }] : lignes proposées pour le choix à la main, les plus probables d'abord.
 * La mise en page des éditions dépend des options choisies dans Silae (salariés en lignes ou en colonnes, rubriques…) :
 * la lecture s'appuie sur les intitulés et non sur des positions fixes, et le choix peut être corrigé dans l'application.
 */
(function () {
  'use strict';

  const AMT = '-?\\d{1,3}(?:[\\u00a0\\u202f .]\\d{3})*,\\d{2}|-?\\d+,\\d{2}';
  const RE_NUM = new RegExp(`^(?:${AMT})$`);
  const RE_TAIL = new RegExp(`^(.*\\S)\\s+(${AMT})$`);
  const num = (t) => Math.round(parseFloat(t.replace(/[   .]/g, '').replace(',', '.')) * 100) / 100;
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  // Libellé comparable d'une édition à l'autre : lettres seules
  const key = (s) => norm(s).replace(/[^a-z]+/g, ' ').trim();

  function kindOf(text) {
    const t = norm(text);
    if (/journal de paie|livre de paie/.test(t)) return 'journal';
    if (/(details?|recapitulatif|etat|journal) des cotisations/.test(t)) return 'cotis';
    if (/soldes? (de|des) (repos|conges)/.test(t)) return 'repos';
    return '';
  }

  // Segments d'une ligne ; un montant collé à son libellé (« Total brut 30 500,00 ») est séparé en deux.
  function cells(line, PdfReader) {
    const out = [];
    PdfReader.segments(line).forEach((s) => {
      const t = String(s.text).trim();
      if (!t) return;
      const m = RE_NUM.test(t) ? null : RE_TAIL.exec(t);
      if (!m) { out.push({ x0: s.x0, x1: s.x1, t }); return; }
      const cw = (s.x1 - s.x0) / t.length;
      out.push({ x0: s.x0, x1: s.x0 + cw * m[1].length, t: m[1] }, { x0: s.x1 - cw * m[2].length, x1: s.x1, t: m[2] });
    });
    return out;
  }

  // Intitulé de la colonne d'un montant : textes courts des lignes d'en-tête qui le surplombent, de haut en bas.
  function colOf(heads, s) {
    return heads.filter((h) => h.x1 - h.x0 < 160 && h.x0 - 3 <= s.x1 && h.x1 + 3 >= s.x0).map((h) => h.t).join(' ');
  }

  function parse(doc, PdfReader) {
    let kind = '', title = '', group = '';
    const rows = [];
    (doc.pages || []).forEach((page, pi) => {
      const lines = PdfReader.lines(page).map((l) => cells(l, PdfReader));
      if (!kind) {
        const top = lines.slice(0, 12).map((l) => l.map((s) => s.t).join(' '));
        kind = kindOf(top.join(' '));
        if (kind) title = top.find((t) => kindOf(t)) || '';
      }
      // En-tête : lignes sans montant au-dessus de la première ligne chiffrée de la page ; il se termine à la dernière ligne
      // dont un texte surplombe une colonne de montants (intitulés des colonnes)
      const first = lines.findIndex((l) => l.some((s) => RE_NUM.test(s.t)));
      const heads = first < 0 ? [] : [].concat(...lines.slice(0, first));
      const numSegs = [].concat(...lines).filter((s) => RE_NUM.test(s.t));
      const overNum = (s) => numSegs.some((n) => s.x0 - 3 <= n.x1 && s.x1 + 3 >= n.x0);
      let headEnd = -1;
      for (let i = 0; i < first; i++) if (lines[i].some(overNum)) headEnd = i;
      lines.forEach((l, li) => {
        const nums = l.filter((s) => RE_NUM.test(s.t));
        if (!nums.length) {
          // Intitulé de groupe (organisme…) : texte seul sous l'en-tête des colonnes, hors pied de page
          const t = l.map((s) => s.t).join(' ');
          if (first >= 0 && li > headEnd && !l.some(overNum) && !/^page\b|\d+ ?\/ ?\d+$/.test(norm(t))) group = t;
          return;
        }
        const lab = l.filter((s) => !RE_NUM.test(s.t) && s.x0 < nums[0].x0).map((s) => s.t).join(' ');
        rows.push({ page: pi + 1, lab, group, amounts: nums.map((s) => ({ v: num(s.t), col: colOf(heads, s) })) });
      });
    });
    return { kind, title, rows };
  }

  // Intitulés attendus pour chaque contrôle (libellé de la ligne ou de la colonne) et intitulés à écarter.
  const RULES = {
    brut: { yes: /\bbrut/, no: /\bnet\b|imposable|abatt|plafon|tranche|base|assiette/ },
    net: { yes: /net a payer|net paye|net verse/, no: /imposable|avant|social/ },
    pat: { yes: /patron|employeur/, no: /salari/ },
    cp: { yes: /indemnit|provision|valoris|montant/, no: /charge|cotis|jour|nombre|\bnb\b|acquis|pris\b/ },
    cpch: { yes: /charge|cotis/, no: /jour|nombre|\bnb\b|acquis|pris\b/ },
  };
  const WORDS = /total|brut|net|patron|employeur|salari|cotis|charge|provision|indemnit|conge|montant|solde|valoris/;

  function score(row, ai, k) {
    const R = RULES[k], a = row.amounts[ai];
    const nl = norm(row.lab), nc = norm(a.col);
    let sc = 0;
    if (R.yes.test(nl)) sc += 3;
    if (R.yes.test(nc)) sc += 3;
    if (/total/.test(nl)) sc += 2;
    if (R.no.test(nl) || R.no.test(nc)) sc -= 5;
    if (ai === row.amounts.length - 1) sc += 1;
    return sc;
  }

  function candidates(rows, k) {
    const out = [];
    rows.forEach((row, ri) => row.amounts.forEach((a, ai) => {
      if (WORDS.test(norm(row.lab)) || WORDS.test(norm(a.col))) out.push({ row: ri, amount: ai, sc: score(row, ai, k) });
    }));
    return out.sort((x, y) => y.sc - x.sc || Math.abs(rows[y.row].amounts[y.amount].v) - Math.abs(rows[x.row].amounts[x.amount].v)).slice(0, 80);
  }

  function pick(rows, k, memo) {
    let best = null;
    rows.forEach((row, ri) => row.amounts.forEach((a, ai) => {
      const sc = memo && memo.lab === key(row.lab) && memo.col === key(a.col) ? 100 : score(row, ai, k);
      // Retenu si le libellé ou la colonne est reconnu (le total d'une colonne « brut », la ligne « Salaire brut » au dernier montant…)
      if (sc < 4) return;
      if (!best || sc > best.sc || (sc === best.sc && Math.abs(a.v) > Math.abs(best.v))) best = { row: ri, amount: ai, sc, v: a.v };
    }));
    return best;
  }

  window.SilaePdf = { parse, pick, candidates, key };
})();
