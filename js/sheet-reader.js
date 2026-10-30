/*
 * Lecture de fichiers Excel (.xlsx, ancien format .xls, ou export « Excel » en HTML / XML) et CSV, entièrement dans le navigateur,
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
    // Séparateur : le plus fréquent sur les premières lignes (certaines banques font précéder l'en-tête de lignes
    // d'informations sur le compte)
    const counts = { ';': 0, ',': 0, '\t': 0 };
    for (const line of text.split(/\r?\n/, 10)) for (const ch of line.replace(/"[^"]*"/g, '')) if (ch in counts) counts[ch]++;
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

  // ---------- Ancien format Excel (.xls, BIFF8 dans un fichier composé OLE) ----------

  // Flux nommé d'un fichier composé (secteurs de 512 octets en général ; petits flux dans le mini-flux)
  function cfbStream(buffer, names) {
    const dv = new DataView(buffer);
    const secSize = 1 << dv.getUint16(30, true), miniSize = 1 << dv.getUint16(32, true);
    const nFat = dv.getUint32(44, true), dirStart = dv.getUint32(48, true), miniCut = dv.getUint32(56, true);
    const miniFatStart = dv.getUint32(60, true);
    let difatSec = dv.getUint32(68, true);
    const off = (s) => 512 + s * secSize;
    const fatSecs = [];
    for (let i = 0; i < 109 && fatSecs.length < nFat; i++) fatSecs.push(dv.getUint32(76 + i * 4, true));
    while (fatSecs.length < nFat && difatSec < 0xfffffffa) {
      for (let i = 0; i < secSize / 4 - 1 && fatSecs.length < nFat; i++) fatSecs.push(dv.getUint32(off(difatSec) + i * 4, true));
      difatSec = dv.getUint32(off(difatSec) + secSize - 4, true);
    }
    const fat = [];
    fatSecs.forEach((s) => { for (let i = 0; i < secSize / 4; i++) fat.push(dv.getUint32(off(s) + i * 4, true)); });
    const chain = (start, table) => { const out = []; for (let s = start; s < 0xfffffffa && out.length <= table.length; s = table[s]) out.push(s); return out; };
    const readChain = (start, size) => {
      const out = new Uint8Array(chain(start, fat).length * secSize);
      chain(start, fat).forEach((s, i) => out.set(new Uint8Array(buffer, off(s), Math.min(secSize, buffer.byteLength - off(s))), i * secSize));
      return size === undefined ? out : out.subarray(0, size);
    };
    const dir = readChain(dirStart);
    const dd = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
    const entries = [];
    for (let p = 0; p + 128 <= dir.length; p += 128) {
      const len = dd.getUint16(p + 64, true);
      let name = '';
      for (let i = 0; i < Math.max(0, len / 2 - 1); i++) name += String.fromCharCode(dd.getUint16(p + i * 2, true));
      entries.push({ name, type: dir[p + 66], start: dd.getUint32(p + 116, true), size: dd.getUint32(p + 120, true) });
    }
    const e = entries.find((x) => x.type === 2 && names.includes(x.name));
    if (!e) return null;
    if (e.size >= miniCut) return readChain(e.start, e.size);
    const root = entries.find((x) => x.type === 5);
    const mini = readChain(root.start, root.size);
    const mf = readChain(miniFatStart);
    const mfv = new DataView(mf.buffer, mf.byteOffset, mf.byteLength);
    const miniFat = [];
    for (let i = 0; i < mf.length / 4; i++) miniFat.push(mfv.getUint32(i * 4, true));
    const secs = chain(e.start, miniFat);
    const out = new Uint8Array(secs.length * miniSize);
    secs.forEach((s, i) => out.set(mini.subarray(s * miniSize, (s + 1) * miniSize), i * miniSize));
    return out.subarray(0, e.size);
  }

  function readXls(buffer) {
    const wbBytes = cfbStream(buffer, ['Workbook', 'Book']);
    if (!wbBytes) throw new Error('Classeur Excel (.xls) illisible.');
    const dv = new DataView(wbBytes.buffer, wbBytes.byteOffset, wbBytes.byteLength);
    // Enregistrements : [type, début des données, longueur] ; les CONTINUE (0x3C) suivent leur enregistrement
    const recs = [];
    for (let p = 0; p + 4 <= wbBytes.length;) {
      const type = dv.getUint16(p, true), len = dv.getUint16(p + 2, true);
      recs.push([type, p + 4, len]);
      p += 4 + len;
    }
    let biff8 = true, date1904 = false, cp = 'windows-1252';
    const latin = (from, n) => new TextDecoder(cp).decode(wbBytes.subarray(from, from + n));
    const utf16 = (from, n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(dv.getUint16(from + i * 2, true)); return s; };
    // Chaîne Unicode BIFF8 à `p` (longueur sur `lb` octets) : { s, end }
    const uniStr = (p, lb) => {
      const n = lb === 1 ? wbBytes[p] : dv.getUint16(p, true);
      p += lb;
      if (!biff8) return { s: latin(p, n), end: p + n };
      const fl = wbBytes[p++];
      let rt = 0, sz = 0;
      if (fl & 8) { rt = dv.getUint16(p, true); p += 2; }
      if (fl & 4) { sz = dv.getUint32(p, true); p += 4; }
      const s = fl & 1 ? utf16(p, n) : latin(p, n);
      return { s, end: p + n * (fl & 1 ? 2 : 1) + rt * 4 + sz };
    };
    const formats = {}, xfDate = [], sst = [], sheets = [];
    const BUILTIN_DATES = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
    for (let i = 0; i < recs.length; i++) {
      const [type, p, len] = recs[i];
      if (type === 0x0809 && i === 0) biff8 = dv.getUint16(p, true) === 0x0600;
      else if (type === 0x0042) { const c = dv.getUint16(p, true); if (c === 1200) cp = 'utf-16le'; else if (c !== 1252 && c !== 0x8000) { try { new TextDecoder(`windows-${c}`); cp = `windows-${c}`; } catch (e) { /* page de code inconnue : windows-1252 */ } } }
      else if (type === 0x0022) date1904 = dv.getUint16(p, true) === 1;
      else if (type === 0x041e) { const id = dv.getUint16(p, true); formats[id] = biff8 ? uniStr(p + 2, 2).s : latin(p + 3, wbBytes[p + 2]); }
      else if (type === 0x00e0) { const f = dv.getUint16(p + 2, true); xfDate.push(f); }
      else if (type === 0x0085) sheets.push({ pos: dv.getUint32(p, true), hidden: wbBytes[p + 4], kind: wbBytes[p + 5], name: biff8 ? uniStr(p + 6, 1).s : latin(p + 7, wbBytes[p + 6]) });
      else if (type === 0x00fc) {
        // Table des chaînes partagées : une chaîne peut se poursuivre dans un CONTINUE, qui recommence par un octet
        // d'options (1 = UTF-16)
        const segs = [[p, p + len]];
        for (let j = i + 1; j < recs.length && recs[j][0] === 0x003c; j++) segs.push([recs[j][1], recs[j][1] + recs[j][2]]);
        const total = dv.getUint32(p + 4, true);
        let si = 0, q = p + 8;
        const next = () => { si++; q = segs[si][0]; };
        while (sst.length < total && si < segs.length) {
          if (q >= segs[si][1]) { if (si + 1 >= segs.length) break; next(); }
          const n = dv.getUint16(q, true);
          let fl = wbBytes[q + 2];
          q += 3;
          let rt = 0, sz = 0;
          if (fl & 8) { rt = dv.getUint16(q, true); q += 2; }
          if (fl & 4) { sz = dv.getUint32(q, true); q += 4; }
          let s = '', left = n;
          while (left > 0) {
            const w = fl & 1 ? 2 : 1;
            const can = Math.min(left, Math.floor((segs[si][1] - q) / w));
            s += w === 2 ? utf16(q, can) : new TextDecoder('windows-1252').decode(wbBytes.subarray(q, q + can));
            q += can * w;
            left -= can;
            if (left > 0) { if (si + 1 >= segs.length) break; next(); fl = wbBytes[q++]; }
          }
          // Mise en forme et données phonétiques : peuvent elles aussi déborder sur le CONTINUE suivant
          let skip = rt * 4 + sz;
          while (skip > 0) { const can = Math.min(skip, segs[si][1] - q); q += can; skip -= can; if (skip > 0) { if (si + 1 >= segs.length) break; next(); } }
          sst.push(s);
        }
      }
    }
    const isDate = (xf) => { const f = xfDate[xf]; return f !== undefined && (BUILTIN_DATES.has(f) || (!!formats[f] && isDateFormat(formats[f]))); };
    const rk = (v) => { let n = v & 2 ? v >> 2 : new DataView(new Uint32Array([0, v & 0xfffffffc]).buffer).getFloat64(0, true); if (v & 1) n /= 100; return n; };
    const numCell = (n, xf) => ({ text: isDate(xf) ? serialToDate(n, date1904) : numberText(n), na: false });
    const byPos = new Map(recs.map((r, i) => [r[1] - 4, i]));
    const out = [];
    for (const sh of sheets) {
      if (sh.kind !== 0) continue;
      let i = byPos.get(sh.pos);
      if (i === undefined) continue;
      const rows = [];
      const put = (r, c, cell) => { (rows[r] = rows[r] || [])[c] = cell; };
      for (i++; i < recs.length && recs[i][0] !== 0x000a; i++) {
        const [type, p] = recs[i];
        const r = dv.getUint16(p, true), c = dv.getUint16(p + 2, true), xf = dv.getUint16(p + 4, true);
        if (type === 0x00fd) put(r, c, { text: (sst[dv.getUint32(p + 6, true)] || '').trim(), na: false });
        else if (type === 0x0204) put(r, c, { text: uniStr(p + 6, 2).s.trim(), na: false });
        else if (type === 0x0203) put(r, c, numCell(dv.getFloat64(p + 6, true), xf));
        else if (type === 0x027e) put(r, c, numCell(rk(dv.getInt32(p + 6, true)), xf));
        else if (type === 0x00bd) {
          const last = dv.getUint16(p + recs[i][2] - 2, true);
          for (let k = c; k <= last; k++) { const o = p + 4 + (k - c) * 6; put(r, k, numCell(rk(dv.getInt32(o + 2, true)), dv.getUint16(o, true))); }
        } else if (type === 0x0006) {
          // Formule : résultat en cache (nombre, ou chaîne dans l'enregistrement STRING qui suit)
          if (dv.getUint16(p + 12, true) === 0xffff) {
            const k = wbBytes[p + 6];
            if (k === 0) { const s = recs[i + 1] && recs[i + 1][0] === 0x0207 ? uniStr(recs[i + 1][1], 2).s : ''; put(r, c, { text: s.trim(), na: false }); }
            else if (k === 1) put(r, c, { text: wbBytes[p + 8] ? 'VRAI' : 'FAUX', na: false });
          } else put(r, c, numCell(dv.getFloat64(p + 6, true), xf));
        } else if (type === 0x0205) put(r, c, { text: wbBytes[p + 7] ? '' : wbBytes[p + 6] ? 'VRAI' : 'FAUX', na: false });
      }
      out.push({ name: sh.name, rows: normalize(rows) });
    }
    if (!out.length) throw new Error('Aucune feuille lisible dans ce classeur.');
    return { sheets: out };
  }

  // ---------- Tableau HTML ou XML Excel 2003 enregistré avec l'extension .xls ----------

  function readMarkup(text) {
    const cellText = (el) => el.textContent.replace(/\s+/g, ' ').trim();
    if (/<Workbook[\s>]/.test(text) && /urn:schemas-microsoft-com:office:spreadsheet/.test(text)) {
      const doc = xml(text);
      const sheets = all(doc, 'Worksheet').map((ws) => {
        const rows = [];
        let r = -1;
        all(ws, 'Row').forEach((row) => {
          const ri = Number(row.getAttributeNS('*', 'Index') || attr(row, 'ss:Index'));
          r = ri ? ri - 1 : r + 1;
          const cells = [];
          let c = -1;
          Array.from(row.children).filter((x) => x.localName === 'Cell').forEach((cell) => {
            const ci = Number(attr(cell, 'ss:Index'));
            c = ci ? ci - 1 : c + 1;
            const d = first(cell, 'Data');
            let t = d ? d.textContent.trim() : '';
            if (d && attr(d, 'ss:Type') === 'DateTime') t = t.slice(0, 10);
            cells[c] = { text: t, na: false };
          });
          rows[r] = cells;
        });
        return { name: attr(ws, 'ss:Name') || 'Feuille', rows: normalize(rows) };
      });
      if (sheets.length) return { sheets };
    }
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const sheets = Array.from(doc.querySelectorAll('table')).map((t, k) => {
      const rows = [];
      Array.from(t.rows).forEach((tr, r) => {
        const cells = rows[r] = rows[r] || [];
        let c = 0;
        Array.from(tr.cells).forEach((td) => {
          while (cells[c]) c++;
          const rs = Math.max(1, td.rowSpan || 1), cs = Math.max(1, td.colSpan || 1);
          for (let i = 0; i < rs; i++) { const row = rows[r + i] = rows[r + i] || []; row[c] = { text: i ? '' : cellText(td), na: false }; for (let j = 1; j < cs; j++) row[c + j] = { text: '', na: false }; }
          c += cs;
        });
      });
      return { name: `Tableau ${k + 1}`, rows: normalize(rows) };
    });
    if (!sheets.length) throw new Error('Aucun tableau lisible dans ce fichier.');
    return { sheets };
  }

  async function read(file) {
    const name = (file.name || '').toLowerCase();
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return readXls(await file.arrayBuffer());
    if (/\.xl[st][xm]?$/.test(name) && !(head[0] === 0x50 && head[1] === 0x4b)) {
      // Export « Excel » qui est en fait une page HTML ou du XML (fréquent dans les logiciels de paie et de comptabilité)
      const buf = await file.arrayBuffer();
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder('windows-1252').decode(buf); }
      if (/^\s*</.test(text.replace(/^﻿/, ''))) return readMarkup(text);
      // Texte séparé par des tabulations ou des points-virgules enregistré en .xls ; un .xlsx doit être un vrai classeur
      if (name.endsWith('.xls') && !/[\u0000-\u0008]/.test(text.slice(0, 2000))) return readCsv(text);
      return readXlsx(buf);
    }
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
    return readXlsx(await file.arrayBuffer());
  }

  window.SheetReader = { read, readCsv };
})();
