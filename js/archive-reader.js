/*
 * Lecture locale d'une archive .zip « FEC + justificatifs » (export Pennylane, par exemple).
 *
 * Seul le répertoire de l'archive est lu (noms des fichiers) : les justificatifs eux-mêmes ne
 * sont jamais ouverts ni décompressés. Le FEC contenu dans l'archive est extrait pour l'analyse.
 * Le fichier est lu par morceaux (File.slice) : une archive de plusieurs centaines de Mo ne
 * remplit pas la mémoire.
 *
 * ArchiveReader.read(file) → { fec: { name, buffer }, docs: [{ name, base }], total }
 */
(function () {
  'use strict';

  const DOC_RE = /\.(pdf|jpe?g|png|gif|tiff?|heic|heif|webp|bmp|docx?|xlsx?|odt|ods|eml|msg|html?|xml|txt|csv)$/i;

  const slice = (file, start, end) => file.slice(start, end).arrayBuffer();

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Ce navigateur ne sait pas lire les archives .zip : mettez-le à jour.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer();
  }

  // Répertoire central de l'archive (ZIP et ZIP64).
  async function directory(file) {
    const tailLen = Math.min(file.size, 65557 + 20);
    const tail = new DataView(await slice(file, file.size - tailLen, file.size));
    let eocd = -1;
    for (let i = tail.byteLength - 22; i >= 0; i--) {
      if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("Ce fichier n'est pas une archive .zip valide.");
    let count = tail.getUint16(eocd + 10, true);
    let cdSize = tail.getUint32(eocd + 12, true);
    let cdOffset = tail.getUint32(eocd + 16, true);
    // ZIP64 : localisateur juste avant l'enregistrement de fin
    if ((cdOffset === 0xffffffff || count === 0xffff) && eocd >= 20 && tail.getUint32(eocd - 20, true) === 0x07064b50) {
      const off64 = Number(tail.getBigUint64(eocd - 20 + 8, true));
      const rec = new DataView(await slice(file, off64, off64 + 56));
      count = Number(rec.getBigUint64(32, true));
      cdSize = Number(rec.getBigUint64(40, true));
      cdOffset = Number(rec.getBigUint64(48, true));
    }
    const cd = new DataView(await slice(file, cdOffset, cdOffset + cdSize));
    const bytes = new Uint8Array(cd.buffer);
    const utf8 = new TextDecoder('utf-8');
    const latin = new TextDecoder('windows-1252');
    const entries = [];
    let p = 0;
    for (let i = 0; i < count && p + 46 <= cd.byteLength; i++) {
      if (cd.getUint32(p, true) !== 0x02014b50) break;
      const flags = cd.getUint16(p + 8, true);
      const method = cd.getUint16(p + 10, true);
      let csize = cd.getUint32(p + 20, true);
      let size = cd.getUint32(p + 24, true);
      const nameLen = cd.getUint16(p + 28, true);
      const extraLen = cd.getUint16(p + 30, true);
      const commentLen = cd.getUint16(p + 32, true);
      let offset = cd.getUint32(p + 42, true);
      const raw = bytes.subarray(p + 46, p + 46 + nameLen);
      const name = (flags & 0x800 ? utf8 : latin).decode(raw);
      // Champ ZIP64 des tailles et du décalage
      let q = p + 46 + nameLen;
      const end = q + extraLen;
      while (q + 4 <= end) {
        const id = cd.getUint16(q, true), len = cd.getUint16(q + 2, true);
        if (id === 0x0001) {
          let r = q + 4;
          if (size === 0xffffffff) { size = Number(cd.getBigUint64(r, true)); r += 8; }
          if (csize === 0xffffffff) { csize = Number(cd.getBigUint64(r, true)); r += 8; }
          if (offset === 0xffffffff) { offset = Number(cd.getBigUint64(r, true)); }
        }
        q += 4 + len;
      }
      entries.push({ name, method, csize, size, offset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  async function extract(file, e) {
    const head = new DataView(await slice(file, e.offset, e.offset + 30));
    if (head.getUint32(0, true) !== 0x04034b50) throw new Error(`Archive endommagée (${e.name}).`);
    const start = e.offset + 30 + head.getUint16(26, true) + head.getUint16(28, true);
    const data = await slice(file, start, start + e.csize);
    if (e.method === 0) return data;
    if (e.method === 8) return inflateRaw(data);
    throw new Error(`Méthode de compression non prise en charge pour ${e.name}.`);
  }

  const baseName = (name) => name.split('/').pop();
  const isJunk = (name) => /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)/i.test(name) || name.endsWith('/');

  async function read(file) {
    const entries = (await directory(file)).filter((e) => !isJunk(e.name));
    // Le FEC : fichier texte dont le nom contient « FEC » (ex. 123456789FEC20251231.txt), sinon le plus gros fichier texte.
    const texts = entries.filter((e) => /\.(txt|csv|tsv)$/i.test(e.name));
    const fecEntry = texts.find((e) => /\d{9}FEC\d{8}/i.test(baseName(e.name))) || texts.find((e) => /fec/i.test(baseName(e.name)))
      || texts.slice().sort((a, b) => b.size - a.size)[0];
    if (!fecEntry) throw new Error("Aucun FEC (.txt) trouvé dans l'archive.");
    const buffer = await extract(file, fecEntry);
    const docs = entries.filter((e) => e !== fecEntry && DOC_RE.test(e.name)).map((e) => ({ name: e.name, base: baseName(e.name) }));
    return { fec: { name: baseName(fecEntry.name), buffer }, docs, total: entries.length };
  }

  window.ArchiveReader = { read };
})();
