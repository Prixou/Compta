/*
 * Reconnaissance de caractères (OCR) des documents scannés, entièrement dans le navigateur : moteur Tesseract
 * (js/ocr/, licence Apache 2.0) hébergé avec l'application et chargé à la première utilisation ; rien n'est envoyé.
 *
 * ScanOcr.page(jpeg) → Promise<Page> : photo JPEG d'une page ramenée à 1 653 points de large (A4 à 200 ppp), en niveaux
 *   de gris. Page : { w, h, g: Uint8Array (0 = noir, 255 = blanc) }.
 * ScanOcr.cleanStreaks(page) : efface les traits verticaux laissés par la vitre du scanner (colonnes sombres sur presque
 *   toute la hauteur de la page) ; renvoie leurs abscisses.
 * ScanOcr.hLines(page, x0, x1, y0, y1, frac) / vLines(page, x0, x1, y0, y1, frac) : traits horizontaux ou verticaux
 *   (part de pixels sombres ≥ frac sur la longueur), regroupés : [{ a, b }] (première et dernière ligne ou colonne).
 * ScanOcr.text(page, box, opts) → Promise<string> : texte d'une zone { x0, y0, x1, y1 }, agrandie et binarisée ;
 *   opts.psm (7 = une ligne, 6 = un bloc), opts.chars (caractères autorisés), opts.scale.
 * ScanOcr.dark(page, box) : part de pixels sombres d'une zone.
 */
(function () {
  'use strict';

  const BASE = 'js/ocr/';
  const WIDTH = 1653;
  const DARK = 150;
  let engineP = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Moteur de lecture des scans introuvable : rechargez l\'application.'));
      document.head.appendChild(s);
    });
  }
  // Instructions SIMD du WebAssembly (navigateurs récents) : moteur plus rapide
  const simd = () => { try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); } catch (e) { return false; } };
  function engine() {
    if (!engineP) {
      engineP = (async () => {
        if (typeof WebAssembly === 'undefined') throw new Error('Ce navigateur ne sait pas lire les documents scannés : mettez-le à jour.');
        if (!window.Tesseract) await loadScript(`${BASE}tesseract.min.js?v=1`);
        return window.Tesseract.createWorker('fra', 1, {
          workerPath: `${BASE}worker.min.js`, corePath: `${BASE}${simd() ? 'tesseract-core-simd-lstm.js' : 'tesseract-core-lstm.js'}`,
          langPath: BASE.replace(/\/$/, ''), gzip: true, cacheMethod: 'none', workerBlobURL: false,
        });
      })();
      engineP.catch(() => { engineP = null; });
    }
    return engineP;
  }
  // Arrêt du moteur (verrouillage) : la mémoire est rendue
  async function stop() {
    const p = engineP;
    engineP = null;
    if (p) { try { (await p).terminate(); } catch (e) { /* déjà arrêté */ } }
  }

  async function page(jpeg) {
    const bmp = await createImageBitmap(new Blob([jpeg], { type: 'image/jpeg' }));
    const k = WIDTH / bmp.width;
    const w = WIDTH, h = Math.round(bmp.height * k);
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.fillStyle = '#fff';
    cx.fillRect(0, 0, w, h);
    cx.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    const d = cx.getImageData(0, 0, w, h).data;
    const g = new Uint8Array(w * h);
    for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    return { w, h, g };
  }

  const group = (list) => {
    const out = [];
    list.forEach((v) => { const l = out[out.length - 1]; if (l && v - l.b <= 2) l.b = v; else out.push({ a: v, b: v }); });
    return out;
  };
  function hLines(p, x0, x1, y0, y1, frac) {
    const ys = [];
    for (let y = Math.max(0, y0); y < Math.min(p.h, y1); y++) {
      let n = 0;
      for (let x = x0, o = y * p.w; x < x1; x++) if (p.g[o + x] < DARK) n++;
      if (n >= (x1 - x0) * frac) ys.push(y);
    }
    return group(ys);
  }
  function vLines(p, x0, x1, y0, y1, frac) {
    const xs = [];
    for (let x = Math.max(0, x0); x < Math.min(p.w, x1); x++) {
      let n = 0;
      for (let y = y0; y < y1; y++) if (p.g[y * p.w + x] < DARK) n++;
      if (n >= (y1 - y0) * frac) xs.push(x);
    }
    return group(xs);
  }
  function cleanStreaks(p) {
    const lines = vLines(p, 0, p.w, Math.round(p.h * 0.08), Math.round(p.h * 0.92), 0.5);
    lines.forEach((l) => {
      for (let x = Math.max(0, l.a - 3); x <= Math.min(p.w - 1, l.b + 3); x++) for (let y = 0; y < p.h; y++) p.g[y * p.w + x] = 255;
    });
    return lines.map((l) => (l.a + l.b) / 2);
  }
  function dark(p, b) {
    let n = 0, t = 0;
    for (let y = Math.max(0, b.y0); y < Math.min(p.h, b.y1); y++) for (let x = Math.max(0, b.x0); x < Math.min(p.w, b.x1); x++) { t++; if (p.g[y * p.w + x] < DARK) n++; }
    return t ? n / t : 0;
  }
  // Zone binarisée, débarrassée des bords de cellule (traits verticaux sur presque toute la hauteur, traits horizontaux
  // sur une bonne part de la largeur), recadrée sur son contenu avec une marge blanche, puis agrandie
  function crop(p, b, scale) {
    const x0 = Math.max(0, Math.round(b.x0)), y0 = Math.max(0, Math.round(b.y0)), x1 = Math.min(p.w, Math.round(b.x1)), y1 = Math.min(p.h, Math.round(b.y1));
    const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0), pad = 10;
    const bin = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) bin[y * w + x] = p.g[(y0 + y) * p.w + x0 + x] < 165 ? 1 : 0;
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (let y = 0; y < h; y++) n += bin[y * w + x];
      if (n > h * 0.85) for (let y = 0; y < h; y++) bin[y * w + x] = 0;
    }
    // Traits horizontaux, pleins ou pointillés : longs et fins (3 points au plus), alors que le texte est haut
    const cnt = (y, a, z) => { let n = 0; if (y < 0 || y >= h) return 0; for (let x = a; x <= z; x++) n += bin[y * w + x]; return n; };
    const rule = [];
    for (let y = 0; y < h; y++) {
      let run = 0, best = 0, first = -1, last = -1;
      for (let x = 0; x < w; x++) { const v = bin[y * w + x]; run = v ? run + 1 : 0; if (run > best) best = run; if (v) { if (first < 0) first = x; last = x; } }
      const span = last - first + 1, n = cnt(y, first, last);
      rule[y] = first >= 0 && (best > Math.max(40, w * 0.3) || (span > Math.max(60, w * 0.35) && n > span * 0.45 && cnt(y - 3, first, last) < n * 0.25 && cnt(y + 3, first, last) < n * 0.25));
    }
    for (let y = 0; y < h; y++) if (rule[y]) for (let x = 0; x < w; x++) bin[y * w + x] = 0;
    let bx0 = w, by0 = h, bx1 = -1, by1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (bin[y * w + x]) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
    if (bx1 < 0) { bx0 = 0; by0 = 0; bx1 = 0; by1 = 0; }
    const cw = bx1 - bx0 + 1 + pad * 2, ch = by1 - by0 + 1 + pad * 2;
    const src = document.createElement('canvas');
    src.width = cw;
    src.height = ch;
    const sx = src.getContext('2d');
    const img = sx.createImageData(cw, ch);
    img.data.fill(255);
    for (let y = by0; y <= by1; y++) {
      for (let x = bx0; x <= bx1; x++) {
        if (!bin[y * w + x]) continue;
        const i = ((y - by0 + pad) * cw + x - bx0 + pad) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
      }
    }
    sx.putImageData(img, 0, 0);
    if (scale === 1) return src;
    const cv = document.createElement('canvas');
    cv.width = Math.round(cw * scale);
    cv.height = Math.round(ch * scale);
    const cx = cv.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(src, 0, 0, cv.width, cv.height);
    return cv;
  }
  async function text(p, b, opts) {
    const o = Object.assign({ psm: 7, chars: '', scale: 1.5 }, opts);
    const w = await engine();
    await w.setParameters({ tessedit_pageseg_mode: String(o.psm), tessedit_char_whitelist: o.chars, preserve_interword_spaces: '1' });
    const cv = crop(p, b, o.scale);
    const { data } = await w.recognize(cv);
    return data.text.replace(/\s+$/g, '').replace(/^\s+/, '');
  }

  window.ScanOcr = { page, cleanStreaks, hLines, vLines, text, dark, stop, ready: engine };
})();
