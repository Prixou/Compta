/*
 * Lecture de fichiers Excel (.xlsx) et CSV, entièrement dans le navigateur,
 * sans bibliothèque tierce : le fichier n'est jamais envoyé nulle part.
 *
 * Renvoie { sheets: [{ name, rows }] } où chaque ligne est un tableau de cellules
 * { text, na } : `text` est la valeur affichée (dates au format AAAA-MM-JJ),
 * `na` indique une cellule hachurée (motif de remplissage), souvent utilisée
 * pour signaler « non applicable ».
 */
(function () {
  'use strict';

  // ---------- ZIP ----------

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Ce navigateur ne sait pas lire les fichiers Excel. Mettez-le à jour ou enregistrez le fichier au format CSV.');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzip(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("Ce fichier n'est pas un classeur Excel (.xlsx) valide.");
    const count = view.getUint16(eocd + 10, true);
    let p = view.getUint32(eocd + 16, true);
    const dec = new TextDecoder();
    const entries = {};
    for (let i = 0; i < count; i++) {
      if (view.getUint32(p, true) !== 0x02014b50) break;
      const method = view.getUint16(p + 10, true);
      const size = view.getUint32(p + 20, true);
      const nameLen = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const commentLen = view.getUint16(p + 32, true);
      const offset = view.getUint32(p + 42, true);
      const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      entries[name] = { method, size, offset };
      p += 46 + nameLen + extraLen + commentLen;
    }
    return {
      has: (name) => !!entries[name],
      async text(name) {
        const e = entries[name];
        if (!e) return null;
        const start = e.offset + 30 + view.getUint16(e.offset + 26, true) + view.getUint16(e.offset + 28, true);
        const raw = bytes.subarray(start, start + e.size);
        return dec.decode(e.method === 0 ? raw : await inflateRaw(raw));
      },
    };
  }

  // ---------- XLSX ----------

  const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
  const all = (node, tag) => Array.from(node.getElementsByTagNameNS('*', tag));
  const first = (node, tag) => node.getElementsByTagNameNS('*', tag)[0] || null;
  const attr = (node, name) => (node ? node.getAttribute(name) : null);

  function colIndex(ref) {
    let n = 0;
    for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  function resolvePath(base, target) {
    if (target.startsWith('/')) return target.slice(1);
    const parts = base.split('/').slice(0, -1);
    for (const seg of target.split('/')) {
      if (seg === '..') parts.pop();
      else if (seg !== '.') parts.push(seg);
    }
    return parts.join('/');
  }

  const DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

  function isDateFormat(code) {
    const cleaned = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
    return /[dmy]/i.test(cleaned) && !/^[#0.,\s%]*$/.test(cleaned);
  }

  function serialToDate(serial, date1904) {
    const ms = Math.round((serial + (date1904 ? 1462 : 0) - 25569) * 86400000);
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }

  function numberText(n) {
    if (Number.isInteger(n)) return String(n);
    return String(Math.round(n * 1e9) / 1e9);
  }

  async function readXlsx(buffer) {
    const zip = await unzip(buffer);
    const wbPath = 'xl/workbook.xml';
    const wbText = await zip.text(wbPath);
    if (!wbText) throw new Error('Classeur Excel illisible.');
    const wb = xml(wbText);
    const date1904 = ['1', 'true'].includes(attr(first(wb, 'workbookPr'), 'date1904'));

    const rels = {};
    const relsText = await zip.text('xl/_rels/workbook.xml.rels');
    if (relsText) all(xml(relsText), 'Relationship').forEach((r) => (rels[attr(r, 'Id')] = resolvePath(wbPath, attr(r, 'Target'))));

    const shared = [];
    const ssText = await zip.text('xl/sharedStrings.xml');
    if (ssText) {
      all(xml(ssText), 'si').forEach((si) => {
        // Le texte phonétique (rPh) n'est pas affiché dans Excel : on l'ignore.
        shared.push(all(si, 't').filter((t) => t.parentNode.localName !== 'rPh').map((t) => t.textContent).join(''));
      });
    }

    // Styles : formats de nombre (dates, zéros de tête) et motifs de remplissage.
    const styles = [];
    const stText = await zip.text('xl/styles.xml');
    if (stText) {
      const st = xml(stText);
      const numFmts = {};
      all(st, 'numFmt').forEach((f) => (numFmts[attr(f, 'numFmtId')] = attr(f, 'formatCode') || ''));
      const fills = all(first(st, 'fills') || st, 'fill').map((f) => attr(first(f, 'patternFill'), 'patternType') || 'none');
      const xfs = first(st, 'cellXfs');
      if (xfs) {
        Array.from(xfs.children).forEach((xf) => {
          const id = Number(attr(xf, 'numFmtId') || 0);
          const code = numFmts[id] || '';
          const pattern = fills[Number(attr(xf, 'fillId') || 0)] || 'none';
          const zeros = code.match(/^0+$/);
          styles.push({
            date: DATE_FORMAT_IDS.has(id) || (!!code && isDateFormat(code)),
            padTo: zeros ? zeros[0].length : 0,
            hatched: !['none', 'solid', 'gray125'].includes(pattern),
          });
        });
      }
    }

    const sheets = [];
    for (const s of all(wb, 'sheet')) {
      const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || attr(s, 'r:id');
      const path = rels[rid] || `xl/worksheets/sheet${sheets.length + 1}.xml`;
      const text = await zip.text(path);
      if (!text) continue;
      const doc = xml(text);
      const rows = [];
      all(doc, 'row').forEach((row, ri) => {
        const r = Number(attr(row, 'r')) - 1;
        const rowIdx = Number.isFinite(r) && r >= 0 ? r : ri;
        const cells = [];
        all(row, 'c').forEach((c, ci) => {
          const ref = attr(c, 'r');
          const idx = ref ? colIndex(ref) : ci;
          const type = attr(c, 't');
          const style = styles[Number(attr(c, 's') || 0)] || {};
          const v = first(c, 'v');
          let out = '';
          if (type === 's') out = shared[Number(v && v.textContent)] || '';
          else if (type === 'inlineStr') out = all(c, 't').map((t) => t.textContent).join('');
          else if (type === 'str' || type === 'e') out = v ? v.textContent : '';
          else if (type === 'b') out = v && v.textContent === '1' ? 'VRAI' : 'FAUX';
          else if (v && v.textContent !== '') {
            const n = Number(v.textContent);
            if (!Number.isFinite(n)) out = v.textContent;
            else if (style.date) out = serialToDate(n, date1904);
            else {
              out = numberText(n);
              if (style.padTo && /^\d+$/.test(out)) out = out.padStart(style.padTo, '0');
            }
          }
          cells[idx] = { text: out.trim(), na: !!style.hatched };
        });
        rows[rowIdx] = cells;
      });
      sheets.push({ name: attr(s, 'name') || `Feuille ${sheets.length + 1}`, rows: normalize(rows) });
    }
    if (!sheets.length) throw new Error('Aucune feuille lisible dans ce classeur.');
    return { sheets };
  }

  function normalize(rows) {
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || [];
      const cells = [];
      for (let j = 0; j < r.length; j++) cells.push(r[j] || { text: '', na: false });
      out.push(cells);
    }
    return out;
  }

  // ---------- CSV ----------

  function readCsv(text) {
    text = text.replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/, 1)[0];
    const counts = { ';': 0, ',': 0, '\t': 0 };
    for (const ch of firstLine) if (ch in counts) counts[ch]++;
    const sep = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    const toDate = (s) => {
      const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s;
    };
    return { sheets: [{ name: 'CSV', rows: rows.map((r) => r.map((t) => ({ text: toDate(t.trim()), na: false }))) }] };
  }

  async function read(file) {
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.csv') || name.endsWith('.txt')) {
      const buf = await file.arrayBuffer();
      let text;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
      } catch (e) {
        text = new TextDecoder('windows-1252').decode(buf); // CSV Excel « ANSI »
      }
      return readCsv(text);
    }
    if (name.endsWith('.xls')) {
      throw new Error("L'ancien format .xls n'est pas pris en charge : dans Excel, faites « Enregistrer sous » au format .xlsx.");
    }
    return readXlsx(await file.arrayBuffer());
  }

  window.SheetReader = { read, readCsv };
})();
