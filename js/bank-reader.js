/*
 * Lecture locale des relevés bancaires, sans bibliothèque tierce, quelle que soit la banque :
 * CFONB 120 (EBICS), OFX / QFX, QIF, MT940 (SWIFT), CAMT.053 / 052 / 054 (ISO 20022), CSV et Excel exportés de la
 * banque en ligne (en-têtes français ou anglais, montant signé ou colonnes débit / crédit, colonne « Sens », solde,
 * fichier sans ligne d'en-tête) et relevé PDF (voir js/releve-pdf.js).
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

  const MONTHS = {
    jan: 1, janv: 1, janvier: 1, january: 1, fev: 2, fevr: 2, fevrier: 2, feb: 2, february: 2, mar: 3, mars: 3, march: 3,
    avr: 4, avril: 4, apr: 4, april: 4, mai: 5, may: 5, juin: 6, jun: 6, june: 6, juil: 7, juillet: 7, jul: 7, july: 7,
    aou: 8, aout: 8, aug: 8, august: 8, sep: 9, sept: 9, septembre: 9, september: 9, oct: 10, octobre: 10, october: 10,
    nov: 11, novembre: 11, november: 11, dec: 12, decembre: 12, december: 12,
  };
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const monthOf = (w) => MONTHS[norm(w).replace(/\.$/, '')] || null;

  // « 2026-10-05 », « 05/10/2026 », « 05.10.26 », « 20261005 », « 2026/10/05 », « 5 oct. 2026 », « Oct 5, 2026 »,
  // avec ou sans heure
  function parseDate(s) {
    s = String(s || '').trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return isoFromDMY(m[3], m[2], m[1]);
    s = s.replace(/[T\s]+\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2}|UTC)?$/i, '').trim();
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (m) return isoFromDMY(m[1], m[2], m[3]);
    m = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
    if (m) return isoFromDMY(m[3], m[2], m[1]);
    m = s.match(/^(\d{4})(\d{2})(\d{2})/);
    if (m) return isoFromDMY(m[3], m[2], m[1]);
    m = s.match(/^(\d{1,2})(?:er)?[\s-]+([A-Za-zÀ-ÿ]{3,9}\.?)[\s-]+(\d{2,4})$/);
    if (m && monthOf(m[2])) return isoFromDMY(m[1], monthOf(m[2]), m[3]);
    m = s.match(/^([A-Za-z]{3,9}\.?)\s+(\d{1,2}),?\s+(\d{4})$/);
    if (m && monthOf(m[1])) return isoFromDMY(m[2], monthOf(m[1]), m[3]);
    return null;
  }

  // « 1 234,56 », « -1.234,56 € », « 1,234.56 », « (12,50) », « 12,50- », « −12,50 », « +12,50 EUR »
  function parseAmount(s) {
    if (typeof s === 'number') return s;
    s = String(s || '').replace(/[\s  €]/g, '').replace(/EUR(OS?)?$/i, '').replace(/^EUR/i, '').replace(/−/g, '-');
    if (!s) return 0;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
    if (/^\+/.test(s)) s = s.slice(1);
    // 1.234,56 ou 1,234.56
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    const n = parseFloat(s);
    if (!/^-?\d+(\.\d+)?$/.test(s) || !Number.isFinite(n)) return NaN;
    return neg ? -n : n;
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

  // ---------- QIF ----------
  // Une opération par bloc terminé par « ^ » : D date, T (ou U) montant signé, P tiers, M mémo, N numéro.

  function readQif(text) {
    const res = { format: 'QIF', account: '', operations: [], opening: null, closing: null };
    const recs = [];
    let cur = {};
    text.split(/\r?\n/).forEach((raw) => {
      const l = raw.trim();
      if (!l || l[0] === '!') return;
      if (l === '^') { if (Object.keys(cur).length) recs.push(cur); cur = {}; return; }
      const k = l[0], v = l.slice(1).trim();
      if (k === 'D') cur.d = v;
      else if (k === 'T' || (k === 'U' && cur.t === undefined)) cur.t = v;
      else if (k === 'P') cur.p = v;
      else if (k === 'M') cur.m = v;
    });
    if (Object.keys(cur).length) recs.push(cur);
    // Jour puis mois (export français) sauf si les dates le contredisent (mois/jour à l'américaine)
    const parts = recs.map((r) => String(r.d || '').replace(/'/g, '/').split(/[/.-]/).map((x) => x.trim()));
    const md = parts.some((p) => p[0] && p[0].length <= 2 && +p[1] > 12) && !parts.some((p) => p[0] && p[0].length <= 2 && +p[0] > 12);
    recs.forEach((r, k) => {
      const p = parts[k];
      if (p.length < 3) return;
      const date = p[0].length === 4 ? isoFromDMY(p[2], p[1], p[0]) : md ? isoFromDMY(p[1], p[0], p[2]) : isoFromDMY(p[0], p[1], p[2]);
      const amount = round2(parseAmount(r.t));
      if (/^opening balance$|^solde (initial|d'ouverture)$/i.test(r.p || '')) { res.opening = { date, amount }; return; }
      res.operations.push({ date, label: [r.p, r.m && r.m !== r.p ? r.m : ''].filter(Boolean).join(' '), amount });
    });
    return res;
  }

  // ---------- MT940 (SWIFT) ----------
  // :25: compte, :60F: solde d'ouverture, :61: opération (date de valeur AAMMJJ, date comptable MMJJ, sens C / D /
  // RC / RD, montant à virgule), :86: libellé, :62F: solde de clôture.

  function readMt940(text) {
    const res = { format: 'MT940', account: '', operations: [], opening: null, closing: null };
    const fields = [];
    text.replace(/\r/g, '').split('\n').forEach((line) => {
      const m = /^:(\d{2}[A-Z]?):(.*)$/.exec(line);
      if (m) fields.push({ tag: m[1], v: m[2] });
      else if (fields.length && line.trim() && !/^-\}?$|^\{/.test(line.trim())) fields[fields.length - 1].v += `\n${line}`;
    });
    const ymd = (s) => isoFromDMY(s.slice(4, 6), s.slice(2, 4), `20${s.slice(0, 2)}`);
    const bal = (v) => {
      const m = /^([CD])(\d{6})([A-Z]{3})([\d,.]+)/.exec(v.trim());
      if (!m) return null;
      const a = parseAmount(m[4]);
      return { date: ymd(m[2]), amount: round2(m[1] === 'D' ? -a : a) };
    };
    let last = null;
    fields.forEach((f) => {
      if (f.tag === '25' && !res.account) res.account = f.v.trim();
      else if ((f.tag === '60F' || f.tag === '60M') && !res.opening) res.opening = bal(f.v);
      else if (f.tag === '62F' || f.tag === '62M') res.closing = bal(f.v);
      else if (f.tag === '61') {
        const m = /^(\d{6})(\d{4})?(RC|RD|C|D)([A-Z])?(\d[\d,]*)([A-Z]\w{3})?([\s\S]*)$/.exec(f.v.trim());
        if (!m) { last = null; return; }
        const a = parseAmount(m[5]);
        // Date comptable (MMJJ) de préférence à la date de valeur ; année de la date de valeur, au tournant de l'année près
        let date = ymd(m[1]);
        if (m[2]) {
          let y = 2000 + Number(m[1].slice(0, 2));
          const vm = Number(m[1].slice(2, 4)), bm = Number(m[2].slice(0, 2));
          if (bm - vm > 6) y--; else if (vm - bm > 6) y++;
          date = isoFromDMY(m[2].slice(2, 4), m[2].slice(0, 2), y) || date;
        }
        const debit = (m[3] === 'D' || m[3] === 'RC');
        last = { date, label: m[7].split('\n')[0].replace(/\/\/.*$/, '').trim(), amount: round2(debit ? -a : a) };
        res.operations.push(last);
      } else if (f.tag === '86' && last) {
        const info = f.v.replace(/\n/g, '').replace(/\?\d{2}/g, ' ').replace(/\s+/g, ' ').trim();
        if (info) last.label = last.label && !info.includes(last.label) ? `${info} ${last.label}`.trim() : info;
        last = null;
      }
    });
    return res;
  }

  // ---------- CAMT.053 (relevé), CAMT.052 (relevé intrajournalier), CAMT.054 (avis) ----------

  function readCamt(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Fichier CAMT illisible.');
    const all = (n, t) => Array.from(n.getElementsByTagNameNS('*', t));
    const first = (n, t) => n.getElementsByTagNameNS('*', t)[0] || null;
    const txt = (n) => (n ? n.textContent.trim() : '');
    const signed = (node) => {
      const amt = round2(parseAmount(txt(first(node, 'Amt'))));
      return txt(first(node, 'CdtDbtInd')) === 'DBIT' ? -amt : amt;
    };
    const kind = /camt\.052|BkToCstmrAcctRpt/.test(text) ? 'CAMT.052' : /camt\.054|BkToCstmrDbtCdtNtfctn/.test(text) ? 'CAMT.054' : 'CAMT.053';
    const res = { format: kind, account: txt(first(doc, 'IBAN')), operations: [], opening: null, closing: null };
    all(doc, 'Stmt').concat(all(doc, 'Rpt'), all(doc, 'Ntfctn')).forEach((stmt) => {
      all(stmt, 'Bal').forEach((bal) => {
        const code = txt(first(bal, 'Cd'));
        const dt = first(bal, 'Dt');
        const b = { date: parseDate(txt(first(dt, 'Dt')) || txt(first(dt, 'DtTm')) || txt(dt)), amount: signed(bal) };
        if ((code === 'OPBD' || code === 'PRCD') && !res.opening) res.opening = b;
        if (code === 'CLBD') res.closing = b;
      });
      all(stmt, 'Ntry').forEach((e) => {
        const bd = first(e, 'BookgDt') || first(e, 'ValDt');
        const label = txt(first(e, 'Ustrd')) || txt(first(e, 'AddtlNtryInf')) || txt(first(first(e, 'Cdtr') || e, 'Nm')) || txt(first(first(e, 'Dbtr') || e, 'Nm'));
        res.operations.push({ date: parseDate(txt(first(bd, 'Dt')) || txt(first(bd, 'DtTm'))), label, amount: signed(e) });
      });
    });
    return res;
  }

  // ---------- CSV / Excel (export de la banque en ligne) ----------

  // Colonnes reconnues d'après leur intitulé (français ou anglais)
  const COL = {
    date: (c) => /date|^le$|^jour$/.test(c) && !/naissance|echeance|export|creation du fichier/.test(c),
    // Date d'opération ou de comptabilisation de préférence à la date de valeur
    dateRank: (c) => (/valeur|value|\bval\b/.test(c) ? 3 : /operation|\bop\b|dateop|transaction|comptab|booking|completed|settlement|execution|reglement|^date$/.test(c) ? 0 : /started|debut|creation/.test(c) ? 2 : 1),
    amount: (c) => /montant|amount|somme|^mouvements?$/.test(c) && !/original|origine|exchange|change|taux|solde|balance|fee|frais|local/.test(c),
    amountRank: (c) => (/total|ttc|incl/.test(c) ? 0 : /\bht\b|excl|tva|vat/.test(c) ? 2 : 1),
    debit: (c) => /^debit|\bdebit\b|sortie|retrait|withdrawal|money out|paid out|decaissement|depense/.test(c) && !/credit|date|carte/.test(c),
    credit: (c) => /^credit|\bcredit\b|entree|depot|deposit|money in|paid in|encaissement|recette/.test(c) && !/debit|date|carte|transfer/.test(c),
    sens: (c) => /^sens$|^d\s*\/\s*c$|^dc$|debit\s*\/\s*credit|credit\s*\/\s*debit|^signe$|cdtdbtind|^type de mouvement$/.test(c),
    label: (c) => /libelle|label|description|intitule|nature|detail|motif|beneficiaire|tiers|payee|counterparty|partner name|contrepartie|communication|objet|wording|^operations?$|reference|memo|^nom\b/.test(c)
      && !/categor|iban|bic|compte|account|devise|currency|date|montant|amount/.test(c),
    balance: (c) => /^solde|balance/.test(c),
    status: (c) => /statut|status|^state$|^etat$/.test(c),
    fee: (c) => /^frais$|^fee|^fees$|commission/.test(c),
  };
  const SKIP_STATUS = /pending|declined|reverted|refus|annul|attente|failed|rejet|echou|cancel/i;

  function headerOf(cells) {
    const used = new Set();
    const best = (pred, rank) => {
      let k = -1;
      cells.forEach((c, i) => { if (!used.has(i) && c && pred(c) && (k < 0 || (rank && rank(c) < rank(cells[k])))) k = i; });
      if (k >= 0) used.add(k);
      return k;
    };
    const cols = { sens: best(COL.sens), date: best(COL.date, COL.dateRank) };
    cols.amount = best(COL.amount, COL.amountRank);
    cols.debit = best(COL.debit);
    cols.credit = best(COL.credit);
    cols.balance = best(COL.balance);
    cols.status = best(COL.status);
    cols.fee = best(COL.fee);
    cols.labels = [];
    for (let k; cols.labels.length < 3 && (k = best(COL.label)) >= 0;) cols.labels.push(k);
    return cols.date >= 0 && (cols.amount >= 0 || cols.debit >= 0 || cols.credit >= 0) ? cols : null;
  }

  // Fichier sans ligne d'en-tête : colonnes reconnues d'après leur contenu
  function inferColumns(rows) {
    const sample = rows.filter((r) => r.filter((c) => c.text.trim()).length >= 2).slice(0, 60);
    if (sample.length < 2) return null;
    const width = Math.max(...sample.map((r) => r.length));
    const rate = (k, test) => sample.filter((r) => r[k] && r[k].text.trim() && test(r[k].text.trim())).length / sample.length;
    const isDate = (t) => !!parseDate(t);
    const isAmt = (t) => /\d[.,]\d{2}\b/.test(t) && Number.isFinite(parseAmount(t));
    let date = -1, dr = 0;
    for (let k = 0; k < width; k++) { const r = rate(k, isDate); if (r > dr) { dr = r; date = k; } }
    if (dr < 0.8) return null;
    const amts = [];
    for (let k = 0; k < width; k++) if (k !== date && rate(k, (t) => isAmt(t) || /^-?\d+$/.test(t)) >= 0.3 && rate(k, isAmt) > 0) amts.push(k);
    if (!amts.length) return null;
    const cols = { date, amount: -1, debit: -1, credit: -1, balance: -1, status: -1, fee: -1, sens: -1, labels: [] };
    const filled = (k) => rate(k, (t) => !!t);
    if (amts.length >= 2 && filled(amts[0]) < 0.9 && filled(amts[1]) < 0.9) { cols.debit = amts[0]; cols.credit = amts[1]; }
    else cols.amount = amts[0];
    let lab = -1, len = 0;
    for (let k = 0; k < width; k++) {
      if (k === date || amts.includes(k)) continue;
      const avg = sample.reduce((t, r) => t + (r[k] ? r[k].text.trim().length : 0), 0) / sample.length;
      if (avg > len) { len = avg; lab = k; }
    }
    if (lab >= 0) cols.labels.push(lab);
    return cols;
  }

  function readTable(rows) {
    let h = -1, cols = null;
    for (let i = 0; i < Math.min(rows.length, 30) && h < 0; i++) {
      const c = headerOf(rows[i].map((x) => norm(x.text)));
      if (c) { h = i; cols = c; }
    }
    let format = 'CSV / Excel';
    if (h < 0) {
      cols = inferColumns(rows);
      if (!cols) throw new Error('Colonnes « Date » et « Montant » (ou « Débit » / « Crédit ») introuvables dans le fichier.');
      format = 'CSV / Excel (sans en-tête)';
    }
    const res = { format, account: '', operations: [], opening: null, closing: null };
    const withBal = [];
    rows.slice(h + 1).forEach((r) => {
      const g = (i) => (i >= 0 && r[i] ? String(r[i].text) : '');
      const date = parseDate(g(cols.date));
      if (!date) return;
      if (cols.status >= 0 && SKIP_STATUS.test(g(cols.status))) return;
      let amount;
      if (cols.amount >= 0) {
        amount = parseAmount(g(cols.amount));
        const sens = norm(g(cols.sens));
        if (/^(d|db|dr|debit|dbit|-)$/.test(sens)) amount = -Math.abs(amount);
        else if (/^(c|cr|credit|crdt|\+)$/.test(sens)) amount = Math.abs(amount);
        if (cols.fee >= 0 && g(cols.fee).trim()) amount -= Math.abs(parseAmount(g(cols.fee)) || 0);
      } else amount = Math.abs(parseAmount(g(cols.credit)) || 0) - Math.abs(parseAmount(g(cols.debit)) || 0);
      if (!Number.isFinite(amount) || amount === 0) return;
      const label = Array.from(new Set(cols.labels.map((k) => g(k).replace(/\s+/g, ' ').trim()).filter(Boolean))).join(' ');
      const op = { date, label, amount: round2(amount) };
      res.operations.push(op);
      if (cols.balance >= 0 && Number.isFinite(parseAmount(g(cols.balance))) && g(cols.balance).trim()) withBal.push({ op, bal: round2(parseAmount(g(cols.balance))) });
    });
    // Solde après chaque opération : soldes d'ouverture et de clôture, s'il s'enchaîne (fichier du plus ancien au plus
    // récent, ou l'inverse)
    if (withBal.length >= 2 && withBal.length === res.operations.length) {
      const chrono = withBal[0].op.date <= withBal[withBal.length - 1].op.date ? withBal : withBal.slice().reverse();
      const ok = chrono.every((x, i) => !i || Math.abs(chrono[i - 1].bal + x.op.amount - x.bal) < 0.005);
      if (ok) {
        res.opening = { date: chrono[0].op.date, amount: round2(chrono[0].bal - chrono[0].op.amount) };
        res.closing = { date: chrono[chrono.length - 1].op.date, amount: chrono[chrono.length - 1].bal };
      }
    }
    return res;
  }

  async function read(file) {
    const buf = await file.arrayBuffer();
    const name = (file.name || '').toLowerCase();
    if (/\.pdf$/.test(name) && window.PdfReader && window.RelevePdf) {
      const r = window.RelevePdf.parse(await window.PdfReader.read(buf), window.PdfReader);
      return finish({
        format: r.mode && r.mode !== 'en-têtes' ? 'PDF, colonnes déduites' : 'PDF', account: r.meta.compte || '',
        operations: r.ops.map((o) => ({ date: o.date, label: o.lib, amount: round2(o.credit - o.debit) })),
        opening: r.soldeInitial !== null && (r.meta.du || r.ops[0]) ? { date: r.meta.du || r.ops[0].date, amount: r.soldeInitial } : null,
        closing: r.soldeFinal !== null && (r.meta.au || r.ops[r.ops.length - 1]) ? { date: r.meta.au || r.ops[r.ops.length - 1].date, amount: r.soldeFinal } : null,
      });
    }
    if (/\.xls$/.test(name)) throw new Error("L'ancien format Excel .xls n'est pas lu : enregistrez le fichier au format .xlsx ou CSV, ou téléchargez le relevé en CSV, OFX ou PDF.");
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
    if (/<BkToCstmr(Stmt|AcctRpt|DbtCdtNtfctn)|camt\.05[234]/i.test(head)) return finish(readCamt(text));
    if (/OFXHEADER|<OFX>/i.test(head)) return finish(readOfx(text));
    if (/^!(Type|Account|Option)/im.test(head)) return finish(readQif(text));
    if (/^:20:/m.test(head) && /^:(60[FM]|61):/m.test(text)) return finish(readMt940(text));
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length && lines[0].startsWith('01') && lines.every((l) => /^(01|04|05|07)\d{5}/.test(l) && l.replace(/\s+$/, '').length <= 120)) return finish(readCfonb(text));
    return finish(readTable(window.SheetReader.readCsv(text).sheets[0].rows));
  }

  function finish(res) {
    res.operations = res.operations.filter((o) => o.date && Number.isFinite(o.amount) && o.amount !== 0);
    if (!res.operations.length) throw new Error(`Aucune opération lisible dans ce relevé (${res.format}).`);
    return res;
  }

  window.BankReader = { read, readCfonb, readOfx, readCamt, readQif, readMt940, readTable, parseDate, parseAmount };
})();
