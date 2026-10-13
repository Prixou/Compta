/*
 * Lecture du texte d'un PDF, entièrement dans le navigateur et sans bibliothèque tierce : le fichier n'est jamais envoyé.
 *
 * PdfReader.read(buffer) → Promise<{ pages: [{ width, height, glyphs: [{ x, y, w, h, ch }] }] }>
 *   Chaque caractère affiché, avec sa position sur la page (origine en bas à gauche, en points), sa largeur et sa hauteur.
 * PdfReader.lines(page) → [{ y, glyphs, text }] : caractères regroupés en lignes, de haut en bas, triés de gauche à droite.
 * PdfReader.segments(line) → [{ x0, x1, text }] : morceaux d'une ligne séparés par un large blanc (colonnes d'un tableau).
 *
 * Pris en charge : PDF générés par un logiciel (relevés, éditions comptables) : objets directs et flux d'objets, flux
 * compressés (Flate) ou en ASCII, polices simples (WinAnsi, MacRoman, différences, ToUnicode) et composites avec
 * ToUnicode, formulaires (XObject). Non pris en charge : PDF chiffrés, PDF scannés (images, sans texte).
 */
(function () {
  'use strict';

  // ---------- Lecture des objets ----------
  const WS = new Set([0, 9, 10, 12, 13, 32]);
  const DELIM = new Set('()<>[]{}/%'.split('').map((c) => c.charCodeAt(0)));

  const latin1 = (u8) => {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return s;
  };

  // Analyseur d'objets PDF sur une chaîne d'octets (latin1). Valeurs : nombre, booléen, null, nom ('/Nom'),
  // chaîne ({ s }), tableau, dictionnaire (objet), référence ({ ref }), opérateur ({ op }).
  function Lexer(str, pos) {
    this.s = str;
    this.p = pos || 0;
  }
  Lexer.prototype.skip = function () {
    const s = this.s;
    for (;;) {
      const c = s.charCodeAt(this.p);
      if (WS.has(c)) this.p++;
      else if (c === 37) { while (this.p < s.length && s[this.p] !== '\n' && s[this.p] !== '\r') this.p++; } // commentaire
      else return;
    }
  };
  Lexer.prototype.value = function () {
    this.skip();
    const s = this.s;
    if (this.p >= s.length) return undefined;
    const c = s[this.p];
    if (c === '<' && s[this.p + 1] === '<') {
      this.p += 2;
      const d = {};
      for (;;) {
        this.skip();
        if (s[this.p] === '>' && s[this.p + 1] === '>') { this.p += 2; return d; }
        if (this.p >= s.length) return d;
        const k = this.value();
        const v = this.value();
        if (typeof k === 'string' && k[0] === '/') d[k.slice(1)] = v;
      }
    }
    if (c === '[') {
      this.p++;
      const a = [];
      for (;;) {
        this.skip();
        if (s[this.p] === ']') { this.p++; return a; }
        if (this.p >= s.length) return a;
        a.push(this.value());
      }
    }
    if (c === '(') return { s: this.literal() };
    if (c === '<') {
      const e = s.indexOf('>', this.p);
      const hex = s.slice(this.p + 1, e).replace(/[^0-9a-fA-F]/g, '');
      this.p = e + 1;
      let out = '';
      for (let i = 0; i < hex.length; i += 2) out += String.fromCharCode(parseInt((hex.slice(i, i + 2) + '0').slice(0, 2), 16));
      return { s: out };
    }
    if (c === '/') {
      let e = this.p + 1;
      while (e < s.length && !WS.has(s.charCodeAt(e)) && !DELIM.has(s.charCodeAt(e))) e++;
      const n = s.slice(this.p + 1, e).replace(/#([0-9a-fA-F]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
      this.p = e;
      return '/' + n;
    }
    if (c === ']' || c === '>' || c === ')' || c === '{' || c === '}') { this.p++; return { op: c }; }
    // Mot : nombre, référence « n g R », mot-clé ou opérateur
    let e = this.p;
    while (e < s.length && !WS.has(s.charCodeAt(e)) && !DELIM.has(s.charCodeAt(e))) e++;
    if (e === this.p) e++;
    const w = s.slice(this.p, e);
    this.p = e;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) {
      const n = parseFloat(w);
      if (/^\d+$/.test(w)) { // référence ?
        const m = /^\s+(\d+)\s+R(?![^\s<>\[\]()\/%])/.exec(s.slice(this.p, this.p + 24));
        if (m) { this.p += m[0].length; return { ref: n }; }
      }
      return n;
    }
    if (w === 'true') return true;
    if (w === 'false') return false;
    if (w === 'null') return null;
    return { op: w };
  };
  Lexer.prototype.literal = function () {
    const s = this.s;
    let depth = 0, out = '';
    this.p++;
    while (this.p < s.length) {
      const c = s[this.p++];
      if (c === '\\') {
        const n = s[this.p++];
        if (n === 'n') out += '\n';
        else if (n === 'r') out += '\r';
        else if (n === 't') out += '\t';
        else if (n === 'b') out += '\b';
        else if (n === 'f') out += '\f';
        else if (n === '\r') { if (s[this.p] === '\n') this.p++; }
        else if (n === '\n') { /* continuation */ }
        else if (n >= '0' && n <= '7') {
          let o = n;
          while (o.length < 3 && s[this.p] >= '0' && s[this.p] <= '7') o += s[this.p++];
          out += String.fromCharCode(parseInt(o, 8) & 255);
        } else out += n;
      } else if (c === '(') { depth++; out += c; }
      else if (c === ')') { if (!depth) break; depth--; out += c; }
      else out += c;
    }
    return out;
  };

  // ---------- Filtres ----------
  async function inflate(u8) {
    const tryFmt = async (fmt, data) => new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream(fmt))).arrayBuffer());
    for (const fmt of ['deflate', 'deflate-raw']) {
      for (const cut of [0, 1, 2]) {
        try { return await tryFmt(fmt, cut ? u8.subarray(0, u8.length - cut) : u8); } catch (e) { /* format suivant */ }
      }
    }
    throw new Error('flux compressé illisible');
  }
  function asciiHex(u8) {
    const t = latin1(u8).replace(/[^0-9a-fA-F]/g, '');
    const out = new Uint8Array(Math.ceil(t.length / 2));
    for (let i = 0; i < t.length; i += 2) out[i / 2] = parseInt((t.slice(i, i + 2) + '0').slice(0, 2), 16);
    return out;
  }
  function ascii85(u8) {
    const t = latin1(u8).replace(/\s+/g, '').replace(/^<~/, '').replace(/~>.*$/, '');
    const out = [];
    for (let i = 0; i < t.length;) {
      if (t[i] === 'z') { out.push(0, 0, 0, 0); i++; continue; }
      const chunk = t.slice(i, i + 5);
      i += 5;
      const pad = 5 - chunk.length;
      let v = 0;
      for (let k = 0; k < 5; k++) v = v * 85 + ((chunk.charCodeAt(k) || 117) - 33);
      const b = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
      out.push(...b.slice(0, 4 - pad));
    }
    return new Uint8Array(out);
  }

  // ---------- Document ----------
  async function read(buffer) {
    const bytes = new Uint8Array(buffer);
    const raw = latin1(bytes);
    if (raw.slice(0, 1024).indexOf('%PDF') < 0) throw new Error("Ce fichier n'est pas un PDF.");
    if (/\/Encrypt\s*(\d+\s+\d+\s+R|<<)/.test(raw.slice(raw.lastIndexOf('trailer') >= 0 ? raw.lastIndexOf('trailer') : Math.max(0, raw.length - 4096)))) {
      throw new Error('PDF protégé par mot de passe : enregistrez-en une copie non protégée (impression en PDF), puis réessayez.');
    }
    const objs = new Map();
    const re = /(\d+)\s+(\d+)\s+obj\b/g;
    const starts = [];
    let m;
    while ((m = re.exec(raw))) starts.push([+m[1], m.index + m[0].length]);
    starts.forEach(([num, start], i) => {
      const end = i + 1 < starts.length ? starts[i + 1][1] : raw.length;
      const lx = new Lexer(raw, start);
      let value;
      try { value = lx.value(); } catch (e) { return; }
      const o = { value };
      lx.skip();
      if (raw.startsWith('stream', lx.p)) {
        let p = lx.p + 6;
        if (raw[p] === '\r') p++;
        if (raw[p] === '\n') p++;
        o.dataStart = p;
        o.segEnd = end;
      }
      objs.set(num, o);
    });
    const get = (v) => {
      let guard = 0;
      while (v && typeof v === 'object' && 'ref' in v && guard++ < 32) { const o = objs.get(v.ref); v = o ? o.value : null; }
      return v;
    };
    const streamBytes = (o) => {
      const len = get(o.value && o.value.Length);
      let end = typeof len === 'number' ? o.dataStart + len : -1;
      if (end < 0 || end > raw.length || raw.slice(end, end + 32).indexOf('endstream') < 0) {
        end = raw.lastIndexOf('endstream', o.segEnd);
        if (end < o.dataStart) end = o.dataStart;
        if (raw[end - 1] === '\n') end--;
        if (raw[end - 1] === '\r') end--;
      }
      return bytes.subarray(o.dataStart, end);
    };
    const decoded = new Map();
    const decode = async (o) => {
      if (decoded.has(o)) return decoded.get(o);
      let data = streamBytes(o);
      let filters = get(o.value.Filter);
      filters = filters ? (Array.isArray(filters) ? filters : [filters]).map(get) : [];
      for (const f of filters) {
        if (f === '/FlateDecode' || f === '/Fl') data = await inflate(data);
        else if (f === '/ASCIIHexDecode' || f === '/AHx') data = asciiHex(data);
        else if (f === '/ASCII85Decode' || f === '/A85') data = ascii85(data);
        else throw new Error(`filtre ${f} non pris en charge`);
      }
      decoded.set(o, data);
      return data;
    };
    // Flux d'objets (PDF 1.5 et suivants)
    for (const [, o] of Array.from(objs)) {
      const v = o.value;
      if (!v || v.Type !== '/ObjStm' || o.dataStart === undefined) continue;
      let txt;
      try { txt = latin1(await decode(o)); } catch (e) { continue; }
      const n = get(v.N), first = get(v.First);
      const hl = new Lexer(txt, 0);
      const pairs = [];
      for (let i = 0; i < n; i++) pairs.push([hl.value(), hl.value()]);
      pairs.forEach(([num, off]) => {
        if (objs.has(num)) return;
        const lx = new Lexer(txt, first + off);
        objs.set(num, { value: lx.value(), fromStm: true });
      });
    }
    // Arbre des pages
    let root = null;
    const tm = /trailer\s*<<[\s\S]*?\/Root\s+(\d+)\s+\d+\s+R/g;
    let t;
    while ((t = tm.exec(raw))) root = +t[1];
    if (root === null) for (const [, o] of objs) if (o.value && o.value.Type === '/XRef' && o.value.Root) root = o.value.Root.ref;
    let catalog = root !== null ? get({ ref: root }) : null;
    if (!catalog || !catalog.Pages) for (const [, o] of objs) if (o.value && o.value.Type === '/Catalog') { catalog = o.value; }
    if (!catalog) throw new Error('Structure du PDF illisible (catalogue introuvable).');
    const pageList = [];
    const walk = (node, inh, depth) => {
      node = get(node);
      if (!node || depth > 50) return;
      const res = node.Resources !== undefined ? node.Resources : inh.Resources;
      const box = node.MediaBox !== undefined ? node.MediaBox : inh.MediaBox;
      if (node.Type === '/Pages' || node.Kids) (get(node.Kids) || []).forEach((k) => walk(k, { Resources: res, MediaBox: box }, depth + 1));
      else pageList.push({ node, res, box });
    };
    walk(catalog.Pages, {}, 0);

    const fontCache = new Map();
    const pages = [];
    for (const pg of pageList) {
      const box = (get(pg.box) || [0, 0, 595, 842]).map(get);
      const glyphs = [];
      const contents = get(pg.node.Contents);
      const parts = Array.isArray(contents) ? contents : contents ? [pg.node.Contents] : [];
      let data = '';
      for (const c of parts) {
        const o = c && c.ref !== undefined ? objs.get(c.ref) : null;
        if (!o || o.dataStart === undefined) continue;
        try { data += latin1(await decode(o)) + '\n'; } catch (e) { /* flux illisible : ignoré */ }
      }
      await runContent(data, get(pg.res) || {}, [1, 0, 0, 1, 0, 0], glyphs, { get, objs, decode, fontCache }, 0);
      pages.push({ width: box[2] - box[0], height: box[3] - box[1], x0: box[0], y0: box[1], glyphs });
    }
    return { pages };
  }

  // ---------- Polices ----------
  // Largeurs des caractères 32 à 126 d'Helvetica (= Arial), pour les polices standard déclarées sans table de largeurs
  const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
  const HELVB = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
  const WIN = (() => { try { return new TextDecoder('windows-1252').decode(Uint8Array.from({ length: 256 }, (_, i) => i)); } catch (e) { return null; } })();
  const MAC = (() => { try { return new TextDecoder('macintosh').decode(Uint8Array.from({ length: 256 }, (_, i) => i)); } catch (e) { return null; } })();
  const NAMED = {
    space: ' ', exclam: '!', quotedbl: '"', numbersign: '#', dollar: '$', percent: '%', ampersand: '&', quotesingle: "'", quoteright: '’', quoteleft: '‘',
    parenleft: '(', parenright: ')', asterisk: '*', plus: '+', comma: ',', hyphen: '-', minus: '-', period: '.', slash: '/', colon: ':', semicolon: ';', less: '<',
    equal: '=', greater: '>', question: '?', at: '@', bracketleft: '[', backslash: '\\', bracketright: ']', asciicircum: '^', underscore: '_', grave: '`',
    braceleft: '{', bar: '|', braceright: '}', asciitilde: '~', Euro: '€', euro: '€', endash: '–', emdash: '—', bullet: '•', ellipsis: '…', degree: '°',
    section: '§', quotedblleft: '“', quotedblright: '”', quotedblbase: '„', quotesinglbase: '‚', guillemotleft: '«', guillemotright: '»', nbspace: ' ',
    nonbreakingspace: ' ', oe: 'œ', OE: 'Œ', ae: 'æ', AE: 'Æ', germandbls: 'ß', sterling: '£', yen: '¥', copyright: '©', registered: '®', trademark: '™',
    zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', mu: 'µ', twosuperior: '²', threesuperior: '³',
    ordfeminine: 'ª', ordmasculine: 'º', paragraph: '¶', periodcentered: '·', multiply: '×', divide: '÷', plusminus: '±', onehalf: '½', onequarter: '¼',
  };
  const MARKS = { acute: '́', grave: '̀', circumflex: '̂', dieresis: '̈', cedilla: '̧', tilde: '̃', ring: '̊', caron: '̌' };
  function glyphChar(name) {
    if (NAMED[name] !== undefined) return NAMED[name];
    if (/^[A-Za-z]$/.test(name)) return name;
    let mm = /^uni([0-9A-Fa-f]{4})/.exec(name) || /^u([0-9A-Fa-f]{4,6})$/.exec(name);
    if (mm) return String.fromCodePoint(parseInt(mm[1], 16));
    mm = /^([A-Za-z])(acute|grave|circumflex|dieresis|cedilla|tilde|ring|caron)$/.exec(name);
    if (mm) return (mm[1] + MARKS[mm[2]]).normalize('NFC');
    return null;
  }
  function parseCMap(txt) {
    const map = new Map();
    let codeLen = 1;
    const sp = /begincodespacerange([\s\S]*?)endcodespacerange/.exec(txt);
    if (sp) { const h = /<([0-9a-fA-F]+)>/.exec(sp[1]); if (h) codeLen = Math.max(1, h[1].length / 2); }
    const utf16 = (hex) => {
      let s = '';
      for (let i = 0; i + 4 <= hex.length; i += 4) s += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
      if (hex.length === 2) s = String.fromCharCode(parseInt(hex, 16));
      return s;
    };
    let b;
    const reChar = /beginbfchar([\s\S]*?)endbfchar/g;
    while ((b = reChar.exec(txt))) {
      const re2 = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g;
      let x;
      while ((x = re2.exec(b[1]))) map.set(parseInt(x[1], 16), utf16(x[2]));
    }
    const reRange = /beginbfrange([\s\S]*?)endbfrange/g;
    while ((b = reRange.exec(txt))) {
      const re2 = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<([0-9a-fA-F]*)>|\[([^\]]*)\])/g;
      let x;
      while ((x = re2.exec(b[1]))) {
        const lo = parseInt(x[1], 16), hi = parseInt(x[2], 16);
        if (hi - lo > 65535) continue;
        if (x[4] !== undefined) {
          const base = x[4];
          const head = base.slice(0, -4), last = parseInt(base.slice(-4) || '0', 16);
          for (let c = lo; c <= hi; c++) map.set(c, utf16(head + (last + c - lo).toString(16).padStart(4, '0')));
        } else {
          const list = (x[5].match(/<([0-9a-fA-F]*)>/g) || []).map((h) => h.slice(1, -1));
          list.forEach((h, i) => map.set(lo + i, utf16(h)));
        }
      }
    }
    return { map, codeLen };
  }
  async function loadFont(ref, ctx) {
    const key = ref && ref.ref !== undefined ? ref.ref : ref;
    if (ctx.fontCache.has(key)) return ctx.fontCache.get(key);
    const { get, objs, decode } = ctx;
    const f = get(ref) || {};
    const font = { codeLen: 1, widths: null, first: 0, dw: 500, cmap: null, enc: null };
    const sub = f.Subtype;
    let desc = f;
    if (sub === '/Type0') {
      font.codeLen = 2;
      desc = get((get(f.DescendantFonts) || [])[0]) || {};
      font.dw = get(desc.DW) || 1000;
      const w = get(desc.W);
      if (Array.isArray(w)) {
        font.cw = new Map();
        for (let i = 0; i < w.length;) {
          const a = get(w[i]), b = get(w[i + 1]);
          if (Array.isArray(b)) { b.forEach((x, k) => font.cw.set(a + k, get(x))); i += 2; }
          else { const v = get(w[i + 2]); for (let c = a; c <= b; c++) font.cw.set(c, v); i += 3; }
        }
      }
    } else {
      font.first = get(f.FirstChar) || 0;
      const w = get(f.Widths);
      font.widths = Array.isArray(w) ? w.map(get) : null;
      const fd = get(f.FontDescriptor);
      font.dw = (fd && get(fd.MissingWidth)) || 500;
      const bf = String(get(f.BaseFont) || '');
      if (!font.widths && /Helvetica|Arial/i.test(bf)) { font.widths = /Bold|Black|Heavy/i.test(bf) ? HELVB : HELV; font.first = 32; font.dw = 556; }
      else if (!font.widths && /Courier/i.test(bf)) font.dw = 600;
      // Encodage : base (WinAnsi par défaut) et différences
      const enc = get(f.Encoding);
      let base = WIN;
      const bname = typeof enc === 'string' ? enc : enc && get(enc.BaseEncoding);
      if (bname === '/MacRomanEncoding' && MAC) base = MAC;
      const table = base ? base.split('') : Array.from({ length: 256 }, (_, i) => String.fromCharCode(i));
      const diff = enc && typeof enc === 'object' ? get(enc.Differences) : null;
      if (Array.isArray(diff)) {
        let code = 0;
        diff.map(get).forEach((d) => {
          if (typeof d === 'number') code = d;
          else if (typeof d === 'string') { const ch = glyphChar(d.slice(1)); if (ch !== null) table[code] = ch; code++; }
        });
      }
      font.enc = table;
    }
    const tu = f.ToUnicode;
    const to = tu && tu.ref !== undefined ? objs.get(tu.ref) : null;
    if (to && to.dataStart !== undefined) {
      try {
        const cm = parseCMap(latin1(await decode(to)));
        font.cmap = cm.map;
        if (sub === '/Type0') font.codeLen = cm.codeLen || 2;
      } catch (e) { /* CMap illisible */ }
    }
    font.decode = (code) => {
      if (font.cmap && font.cmap.has(code)) return font.cmap.get(code);
      if (font.enc) return font.enc[code] || '';
      return '';
    };
    font.width = (code) => {
      if (font.cw) return font.cw.has(code) ? font.cw.get(code) : font.dw;
      if (font.widths) { const v = font.widths[code - font.first]; if (typeof v === 'number') return v; }
      return font.dw;
    };
    ctx.fontCache.set(key, font);
    return font;
  }

  // ---------- Contenu des pages ----------
  const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];

  async function runContent(data, res, ctm0, glyphs, ctx, depth) {
    const { get, objs, decode } = ctx;
    const lx = new Lexer(data, 0);
    const ops = [];
    let ctm = ctm0.slice();
    const stack = [];
    let tm = [1, 0, 0, 1, 0, 0], tlm = tm.slice();
    let font = null, size = 0, tc = 0, tw = 0, th = 1, tl = 0, rise = 0;
    const fonts = get(res.Font) || {};
    const xobjs = get(res.XObject) || {};
    const show = (str) => {
      if (!font) return;
      const step = font.codeLen;
      for (let i = 0; i < str.length; i += step) {
        const code = step === 2 ? (str.charCodeAt(i) << 8) | (str.charCodeAt(i + 1) || 0) : str.charCodeAt(i);
        const w0 = font.width(code) / 1000;
        const m = mul([size * th, 0, 0, size, 0, rise], mul(tm, ctm));
        const ch = font.decode(code);
        if (ch) glyphs.push({ x: m[4], y: m[5], w: w0 * Math.hypot(m[0], m[1]), h: Math.hypot(m[2], m[3]), ch });
        const tx = (w0 * size + tc + (code === 32 && step === 1 ? tw : 0)) * th;
        tm = mul([1, 0, 0, 1, tx, 0], tm);
      }
    };
    for (;;) {
      const v = lx.value();
      if (v === undefined) break;
      if (!(v && typeof v === 'object' && 'op' in v)) { ops.push(v); continue; }
      const op = v.op;
      const a = ops.splice(0, ops.length);
      const n = (i) => (typeof a[i] === 'number' ? a[i] : 0);
      switch (op) {
        case 'q': stack.push(ctm.slice()); break;
        case 'Q': if (stack.length) ctm = stack.pop(); break;
        case 'cm': ctm = mul([n(0), n(1), n(2), n(3), n(4), n(5)], ctm); break;
        case 'BT': tm = [1, 0, 0, 1, 0, 0]; tlm = tm.slice(); break;
        case 'Tf': { const fr = fonts[typeof a[0] === 'string' ? a[0].slice(1) : '']; font = fr ? await loadFont(fr, ctx) : null; size = n(1); break; }
        case 'Td': tlm = mul([1, 0, 0, 1, n(0), n(1)], tlm); tm = tlm.slice(); break;
        case 'TD': tl = -n(1); tlm = mul([1, 0, 0, 1, n(0), n(1)], tlm); tm = tlm.slice(); break;
        case 'Tm': tlm = [n(0), n(1), n(2), n(3), n(4), n(5)]; tm = tlm.slice(); break;
        case 'T*': tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm.slice(); break;
        case 'TL': tl = n(0); break;
        case 'Tc': tc = n(0); break;
        case 'Tw': tw = n(0); break;
        case 'Tz': th = n(0) / 100; break;
        case 'Ts': rise = n(0); break;
        case 'Tj': if (a[0] && a[0].s !== undefined) show(a[0].s); break;
        case "'": tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm.slice(); if (a[0] && a[0].s !== undefined) show(a[0].s); break;
        case '"': tw = n(0); tc = n(1); tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm.slice(); if (a[2] && a[2].s !== undefined) show(a[2].s); break;
        case 'TJ':
          (Array.isArray(a[0]) ? a[0] : []).forEach((e) => {
            if (e && e.s !== undefined) show(e.s);
            else if (typeof e === 'number') tm = mul([1, 0, 0, 1, (-e / 1000) * size * th, 0], tm);
          });
          break;
        case 'BI': { // image en ligne : données binaires jusqu'à « EI »
          const e = data.indexOf('EI', data.indexOf('ID', lx.p) + 3);
          lx.p = e < 0 ? data.length : e + 2;
          break;
        }
        case 'Do': {
          if (depth > 6 || typeof a[0] !== 'string') break;
          const ref = xobjs[a[0].slice(1)];
          const o = ref && ref.ref !== undefined ? objs.get(ref.ref) : null;
          if (!o || !o.value || o.value.Subtype !== '/Form' || o.dataStart === undefined) break;
          let txt;
          try { txt = latin1(await decode(o)); } catch (e) { break; }
          const fm = (get(o.value.Matrix) || [1, 0, 0, 1, 0, 0]).map(get);
          await runContent(txt, get(o.value.Resources) || res, mul(fm, ctm), glyphs, ctx, depth + 1);
          break;
        }
        default: break;
      }
    }
  }

  // ---------- Lignes et colonnes ----------
  // Caractères d'une page regroupés en lignes (même hauteur à 40 % du corps près), de haut en bas puis de gauche à droite ;
  // une espace est ajoutée entre deux caractères séparés d'un blanc visible.
  function lines(page) {
    const gs = page.glyphs.filter((g) => g.ch && g.h > 0).slice().sort((a, b) => b.y - a.y || a.x - b.x);
    const out = [];
    gs.forEach((g) => {
      const l = out.length && Math.abs(out[out.length - 1].y - g.y) <= Math.max(1, 0.4 * Math.min(out[out.length - 1].h, g.h)) ? out[out.length - 1] : null;
      if (l) l.glyphs.push(g);
      else out.push({ y: g.y, h: g.h, glyphs: [g] });
    });
    out.forEach((l) => {
      l.glyphs.sort((a, b) => a.x - b.x);
      let t = '';
      l.glyphs.forEach((g, i) => {
        const p = l.glyphs[i - 1];
        if (p && g.x - (p.x + p.w) > 0.2 * g.h && !/\s$/.test(t) && !/^\s/.test(g.ch)) t += ' ';
        t += g.ch;
      });
      l.text = t.replace(/\s+/g, ' ').trim();
    });
    return out;
  }
  // Morceaux d'une ligne séparés par un blanc d'au moins `gap` fois le corps (colonnes).
  function segments(line, gap) {
    const segs = [];
    let cur = null;
    line.glyphs.forEach((g) => {
      if (cur && g.x - cur.x1 > (gap || 1) * g.h) { segs.push(cur); cur = null; }
      if (!cur) cur = { x0: g.x, x1: g.x + g.w, glyphs: [] };
      cur.glyphs.push(g);
      cur.x1 = Math.max(cur.x1, g.x + g.w);
    });
    if (cur) segs.push(cur);
    return segs.map((s) => {
      let t = '';
      s.glyphs.forEach((g, i) => {
        const p = s.glyphs[i - 1];
        if (p && g.x - (p.x + p.w) > 0.2 * g.h && !/\s$/.test(t) && !/^\s/.test(g.ch)) t += ' ';
        t += g.ch;
      });
      return { x0: s.x0, x1: s.x1, text: t.replace(/\s+/g, ' ').trim() };
    }).filter((s) => s.text);
  }

  const api = { read, lines, segments };
  if (typeof window !== 'undefined') window.PdfReader = api;
  if (typeof self !== 'undefined') self.PdfReader = api;
})();
