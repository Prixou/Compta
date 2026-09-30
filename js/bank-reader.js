/*
 * Lecture locale des relevés bancaires, sans bibliothèque tierce :
 * CFONB 120 (EBICS), OFX, CAMT.053 (ISO 20022), CSV et Excel.
 *
 * BankReader.read(file) → { format, account, operations: [{ date, label, amount }],
 *                           opening: { date, amount } | null, closing: { date, amount } | null }
 * Convention : montant positif = crédit sur le compte (argent reçu), négatif = débit.
 */
(function () {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');
  const round2 = (n) => Math.round(n * 100) / 100 || 0;

  function isoFromDMY(d, m, y) {
    if (String(y).length === 2) y = 2000 + Number(y);
    const dt = new Date(Date.UTC(+y, +m - 1, +d));
    if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +m - 1 || dt.getUTCDate() !== +d) return null;
    return `${y}-${pad(m)}-${pad(d)}`;
  }

  function parseDate(s) {
    s = String(s || '').trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return isoFromDMY(m[3], m[2], m[1]);
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (m) return isoFromDMY(m[1], m[2], m[3]);
    m = s.match(/^(\d{4})(\d{2})(\d{2})/);
    if (m) return isoFromDMY(m[3], m[2], m[1]);
    return null;
  }

  function parseAmount(s) {
    if (typeof s === 'number') return s;
    s = String(s || '').replace(/[\s  €]/g, '');
    if (!s) return 0;
    // 1.234,56 ou 1,234.56
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : NaN;
  }

  // ---------- CFONB 120 ----------

  function cfonbAmount(field, decimals) {
    const last = field[field.length - 1];
    const pos = '{ABCDEFGHI'.indexOf(last);
    const neg = '}JKLMNOPQR'.indexOf(last);
    const digit = pos >= 0 ? pos : neg;
    if (digit < 0 || !/^\d+$/.test(field.slice(0, -1))) return NaN;
    const v = Number(field.slice(0, -1) + digit) / Math.pow(10, decimals || 0);
    return round2(neg >= 0 ? -v : v);
  }

  function readCfonb(text) {
    const res = { format: 'CFONB 120', account: '', operations: [], opening: null, closing: null };
    text.split(/\r?\n/).forEach((raw) => {
      const line = raw.replace(/\s+$/, '').padEnd(120, ' ');
      const rec = line.slice(0, 2);
      const dec = Number(line[19]) || 0;
      const date = (p) => isoFromDMY(line.slice(p, p + 2), line.slice(p + 2, p + 4), line.slice(p + 4, p + 6));
      if (rec === '01' || rec === '07') {
        res.account = res.account || line.slice(21, 32).trim();
        const bal = { date: date(34), amount: cfonbAmount(line.slice(90, 104), dec) };
        if (rec === '01' && !res.opening) res.opening = bal;
        if (rec === '07') res.closing = bal;
      } else if (rec === '04') {
        res.operations.push({ date: date(34), label: line.slice(48, 79).trim(), amount: cfonbAmount(line.slice(90, 104), dec) });
      } else if (rec === '05' && res.operations.length) {
        const extra = line.slice(48, 118).trim();
        const op = res.operations[res.operations.length - 1];
        if (extra && op.label.length < 120) op.label = `${op.label} ${extra}`.trim();
      }
    });
    return res;
  }

  // ---------- OFX (SGML ou XML) ----------

  function ofxTag(block, tag) {
    const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'));
    return m ? m[1].trim() : '';
  }

  function readOfx(text) {
    const res = { format: 'OFX', account: ofxTag(text, 'ACCTID'), operations: [], opening: null, closing: null };
    const parts = text.split(/<STMTTRN>/i).slice(1);
    parts.forEach((p) => {
      const block = p.split(/<\/STMTTRN>/i)[0];
      const name = ofxTag(block, 'NAME'), memo = ofxTag(block, 'MEMO');
      res.operations.push({
        date: parseDate(ofxTag(block, 'DTPOSTED')),
        label: [name, memo && memo !== name ? memo : ''].filter(Boolean).join(' '),
        amount: round2(parseAmount(ofxTag(block, 'TRNAMT'))),
      });
    });
    const ledger = text.split(/<LEDGERBAL>/i)[1];
    if (ledger) res.closing = { date: parseDate(ofxTag(ledger, 'DTASOF')), amount: round2(parseAmount(ofxTag(ledger, 'BALAMT'))) };
    return res;
  }

  // ---------- CAMT.053 ----------

  function readCamt(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Fichier CAMT.053 illisible.');
    const all = (n, t) => Array.from(n.getElementsByTagNameNS('*', t));
    const first = (n, t) => n.getElementsByTagNameNS('*', t)[0] || null;
    const txt = (n) => (n ? n.textContent.trim() : '');
    const signed = (node) => {
      const amt = round2(parseAmount(txt(first(node, 'Amt'))));
      return txt(first(node, 'CdtDbtInd')) === 'DBIT' ? -amt : amt;
    };
    const res = { format: 'CAMT.053', account: txt(first(doc, 'IBAN')), operations: [], opening: null, closing: null };
    all(doc, 'Stmt').forEach((stmt) => {
      all(stmt, 'Bal').forEach((bal) => {
        const code = txt(first(bal, 'Cd'));
        const dt = first(bal, 'Dt');
        const b = { date: parseDate(txt(first(dt, 'Dt')) || txt(first(dt, 'DtTm')) || txt(dt)), amount: signed(bal) };
        if ((code === 'OPBD' || code === 'PRCD') && !res.opening) res.opening = b;
        if (code === 'CLBD') res.closing = b;
      });
      all(stmt, 'Ntry').forEach((e) => {
        const bd = first(e, 'BookgDt');
        const label = txt(first(e, 'Ustrd')) || txt(first(e, 'AddtlNtryInf')) || txt(first(first(e, 'Cdtr') || e, 'Nm')) || txt(first(first(e, 'Dbtr') || e, 'Nm'));
        res.operations.push({ date: parseDate(txt(first(bd, 'Dt')) || txt(first(bd, 'DtTm'))), label, amount: signed(e) });
      });
    });
    return res;
  }

  // ---------- CSV / Excel (export de la banque en ligne) ----------

  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  function readTable(rows) {
    let h = -1, cols = null;
    for (let i = 0; i < Math.min(rows.length, 30) && h < 0; i++) {
      const cells = rows[i].map((c) => norm(c.text));
      const find = (re) => cells.findIndex((c) => re.test(c));
      const date = find(/^date( d'?operation| operation| comptable| de l'operation)?$|^date/);
      const montant = find(/^montant|^amount|^somme/);
      const debit = find(/^debit/), credit = find(/^credit/);
      if (date >= 0 && (montant >= 0 || debit >= 0 || credit >= 0)) {
        h = i;
        cols = { date, montant, debit, credit, label: find(/libelle|description|intitule|nature|detail|operation$|motif/) };
      }
    }
    if (h < 0) throw new Error('Colonnes « Date » et « Montant » (ou « Débit » / « Crédit ») introuvables dans le fichier.');
    const res = { format: 'CSV / Excel', account: '', operations: [], opening: null, closing: null };
    rows.slice(h + 1).forEach((r) => {
      const g = (i) => (i >= 0 && r[i] ? r[i].text : '');
      const date = parseDate(g(cols.date));
      if (!date) return;
      let amount;
      if (cols.montant >= 0) amount = parseAmount(g(cols.montant));
      else amount = Math.abs(parseAmount(g(cols.credit)) || 0) - Math.abs(parseAmount(g(cols.debit)) || 0);
      if (!Number.isFinite(amount) || amount === 0) return;
      res.operations.push({ date, label: g(cols.label), amount: round2(amount) });
    });
    return res;
  }

  async function read(file) {
    const buf = await file.arrayBuffer();
    const name = (file.name || '').toLowerCase();
    if (/\.(xlsx|xlsm)$/.test(name)) {
      const book = await window.SheetReader.read(file);
      return finish(readTable(book.sheets.find((s) => s.rows.length > 1).rows));
    }
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch (e) {
      text = new TextDecoder('windows-1252').decode(buf);
    }
    text = text.replace(/^﻿/, '');
    const head = text.slice(0, 2000);
    if (/<BkToCstmrStmt|camt\.053/i.test(head)) return finish(readCamt(text));
    if (/OFXHEADER|<OFX>/i.test(head)) return finish(readOfx(text));
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length && lines[0].startsWith('01') && lines.every((l) => /^(01|04|05|07)\d{5}/.test(l) && l.replace(/\s+$/, '').length <= 120)) return finish(readCfonb(text));
    return finish(readTable(window.SheetReader.readCsv(text).sheets[0].rows));
  }

  function finish(res) {
    res.operations = res.operations.filter((o) => o.date && Number.isFinite(o.amount) && o.amount !== 0);
    if (!res.operations.length) throw new Error(`Aucune opération lisible dans ce relevé (${res.format}).`);
    return res;
  }

  window.BankReader = { read, readCfonb, readOfx, readCamt, readTable };
})();
