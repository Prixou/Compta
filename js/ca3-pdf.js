/*
 * Déclaration de TVA CA3 en PDF (formulaire 3310-CA3-SD : copie téléchargée de l'espace professionnel, édition du
 * logiciel comptable) → montants de chaque ligne du formulaire, période et SIREN.
 *
 * Ca3Pdf.parse(doc, PdfReader) → [{ du, au, key, siren, pages: [n°], lines: { code: [montants] }, warnings: [texte] }]
 *   une entrée par déclaration (un document peut en contenir plusieurs, une par page ou par groupe de pages) ;
 *   key : « 2026-01 » (mois) ou « 2026-T1 » (trimestre) quand la période est un mois ou un trimestre civil ;
 *   lines : montants lus sur la ligne de chaque code (A1, B2, E1, F2, 08, 9B, 16, 19, 20, 22, 23, 25 à 28, 32…), de gauche à
 *   droite : pour les lignes de taux, la base hors taxe puis la taxe due.
 * Ca3Pdf.RATE_LINES : code de ligne → taux.
 * Les codes sont reconnus en tête de cellule (« 08 Taux normal 20 % », ou « 08 » seul suivi de son libellé), sur une ou
 * deux colonnes par ligne ; les nombres d'un libellé (« ligne 27 », « 20 % ») ne sont pas des montants.
 */
(function () {
  'use strict';

  const CODES = ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4', 'B5', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'F1', 'F2', 'F3', 'F4',
    'F5', 'F6', 'F7', 'F8', 'F9', '08', '09', '9B', '10', '11', 'T1', 'T2', 'TC', 'T3', 'T4', 'T5', 'T6', 'T7', '13', 'P1', 'P2', 'I1', 'I2',
    'I3', 'I4', 'I5', 'I6', '14', '15', '5B', '16', '17', '18', '19', '20', '21', '22', '2C', '22A', '23', '24', '2E', '25', '26', 'AA', '27',
    '28', '29', 'AB', 'Z5', '32'];
  const CODE_SET = new Set(CODES);
  const RATE_LINES = { '08': 20, '09': 5.5, '9B': 10, 10: 8.5, 11: 2.1, T1: 1.75, T2: 1.05, TC: 13, T3: 10, T4: 2.1, T5: 0.9, T6: 2.1 };
  const RE_NUM = /^-?\d{1,3}(?:[   .]\d{3})+(?:,\d{1,2})?$|^-?\d+(?:,\d{1,2})?$/;
  const num = (t) => Math.round(parseFloat(t.replace(/[   .]/g, '').replace(',', '.')) * 100) / 100;
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  const pad = (n) => String(n).padStart(2, '0');
  const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

  // Période : « Période du 01/01/2026 au 31/01/2026 », « du 01/07/2026 au 30/09/2026 », « Période : janvier 2026 »
  function period(text) {
    const t = norm(text);
    const RNG = '(\\d{2})[/.-](\\d{2})[/.-](\\d{4})\\s*(?:au|a|-)\\s*(\\d{2})[/.-](\\d{2})[/.-](\\d{4})';
    // La période de la déclaration d'abord (un en-tête peut aussi citer l'exercice)
    let m = t.match(new RegExp('periode[^0-9]{0,20}' + RNG)) || t.match(new RegExp(RNG));
    if (m) {
      const du = `${m[3]}-${m[2]}-${m[1]}`, au = `${m[6]}-${m[5]}-${m[4]}`;
      const y = +m[3], m1 = +m[2], m2 = +m[5];
      let key = null;
      if (m[1] === '01' && +m[4] === lastDay(+m[6], m2) && m[6] === m[3]) {
        if (m1 === m2) key = `${y}-${pad(m1)}`;
        else if (m2 === m1 + 2 && (m1 - 1) % 3 === 0) key = `${y}-T${(m1 + 2) / 3}`;
      }
      return { du, au, key };
    }
    m = t.match(/(?:periode|mois)\s*(?:de|d'|:)?\s*(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{4})/);
    if (m) {
      const mm = MOIS.indexOf(m[1]) + 1, y = +m[2];
      return { du: `${y}-${pad(mm)}-01`, au: `${y}-${pad(mm)}-${pad(lastDay(y, mm))}`, key: `${y}-${pad(mm)}` };
    }
    return null;
  }
  function siren(text) {
    const m = String(text).match(/SIRE[NT][^0-9]{0,20}(\d{3}[  ]?\d{3}[  ]?\d{3})/i);
    return m ? m[1].replace(/\D/g, '') : '';
  }

  // Cellules d'une ligne de texte : segments découpés en code / libellé / montant, de gauche à droite
  function items(line, PdfReader) {
    const out = [];
    PdfReader.segments(line).forEach((s) => {
      const t = s.text.trim();
      if (!t) return;
      if (RE_NUM.test(t)) { out.push({ x: s.x0, kind: 'num', t }); return; }
      const first = t.split(' ')[0];
      if (CODE_SET.has(first) && t.length > first.length) { out.push({ x: s.x0, kind: 'code', t: first }); out.push({ x: s.x0 + 1, kind: 'text', t: t.slice(first.length + 1) }); return; }
      if (CODE_SET.has(t)) { out.push({ x: s.x0, kind: 'code', t }); return; }
      out.push({ x: s.x0, kind: 'text', t });
    });
    // Nombre seul suivi d'un libellé : c'est un code de ligne (« 19 » puis « Biens constituant des immobilisations »)
    out.forEach((it, i) => { if (it.kind === 'num' && CODE_SET.has(it.t) && out[i + 1] && out[i + 1].kind === 'text') it.kind = 'code'; });
    return out;
  }

  function parse(doc, PdfReader) {
    const decls = [];
    let cur = null;
    doc.pages.forEach((page, pi) => {
      const lines = PdfReader.lines(page);
      const text = lines.map((l) => l.text).join('\n');
      const per = period(text);
      const isCa3 = /3310|ca3|decompte de la tva|tva brute|tva nette due/.test(norm(text));
      if (per && (!cur || cur.key !== per.key || cur.du !== per.du)) { cur = { du: per.du, au: per.au, key: per.key, siren: '', pages: [], lines: {}, warnings: [] }; decls.push(cur); }
      if (!cur) {
        if (!isCa3) return;
        cur = { du: '', au: '', key: null, siren: '', pages: [], lines: {}, warnings: [] };
        decls.push(cur);
      }
      cur.pages.push(pi + 1);
      if (!cur.siren) cur.siren = siren(text);
      lines.forEach((line) => {
        let code = null;
        items(line, PdfReader).forEach((it) => {
          if (it.kind === 'code') { code = it.t; return; }
          if (it.kind !== 'num' || !code || it.t === code) return;
          (cur.lines[code] = cur.lines[code] || []).push(num(it.t));
        });
      });
    });
    decls.forEach((d) => {
      if (!d.key) d.warnings.push(d.du ? `période du ${d.du} au ${d.au} : ni un mois ni un trimestre civil` : 'période non trouvée');
      if (!Object.keys(d.lines).length) d.warnings.push('aucune ligne du formulaire lue (PDF scanné ou mise en page non reconnue)');
    });
    return decls.filter((d) => Object.keys(d.lines).length || d.key);
  }

  const api = { parse, period, RATE_LINES, CODES };
  if (typeof window !== 'undefined') window.Ca3Pdf = api;
  if (typeof self !== 'undefined') self.Ca3Pdf = api;
})();
