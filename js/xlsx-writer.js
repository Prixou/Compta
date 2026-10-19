/*
 * Écriture d'un classeur Excel (.xlsx) simple, entièrement dans le navigateur
 * et sans bibliothèque tierce (archive ZIP non compressée).
 *
 * XlsxWriter.build({ sheetName, rows, widths, freeze }) → Blob
 *   rows : tableau de lignes, chaque cellule = { v: texte ou nombre, s: style }
 *   styles : 0 normal, 1 en-tête, 2 texte bordé, 3 OK (vert), 4 retard (rouge),
 *            5 non applicable (hachuré), 6 à faire, 7 attente client (violet),
 *            8 montant (# ##0,00), 9 montant en gras, 10 titre, 11 date (jj/mm/aaaa), 12 nombre sans séparateur (0,00)
 *   Document remis au client (13 à 27) : 13 grand titre, 14 sous-titre, 15 mention discrète, 16 encadré d'explication,
 *            17 bandeau de rubrique, 18 en-tête de colonne, 19 texte de tableau, 20 n° de ligne, 21 date de tableau,
 *            22 montant de tableau (# ##0,00 €), 23 case à remplir centrée, 24 case à remplir (texte),
 *            25 libellé de récapitulatif, 26 nombre de récapitulatif, 27 texte de pied de page,
 *            28 case à cocher (valeur true / false : case cochable d'un clic dans Excel 365, VRAI / FAUX ailleurs)
 *   Une date s'écrit { v: numéro de série Excel, s: 11 } (voir XlsxWriter.serial).
 * Plusieurs feuilles : XlsxWriter.build({ sheets: [{ name, rows, widths, freeze }, …] })
 * Options d'une feuille : heights { n° de ligne (0…) : hauteur en points }, merges ['A1:F1', …], grid: false (sans quadrillage),
 *   lists [{ ref: 'E5:E9 E12:E14', values: ['Oui', 'Non'] }] (menu déroulant),
 *   colors [{ ref, equals: 'Oui' (ou true), style: 0 vert | 1 orange | 2 gris }] (couleur selon la valeur),
 *   page { landscape, footer } (mise en page : une page de large, pied de page au format Excel &L &C &R),
 *   breaks [n° de la première ligne (0…) de chaque nouvelle page] (sauts de page).
 */
(function () {
  'use strict';

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function zip(files) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    files.forEach(({ name, content }) => {
      const nameBytes = enc.encode(name);
      const data = enc.encode(content);
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // noms en UTF-8
      local.setUint16(8, 0, true); // stockage sans compression
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, nameBytes.length, true);
      parts.push(new Uint8Array(local.buffer), nameBytes, data);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, data.length, true);
      cd.setUint32(24, data.length, true);
      cd.setUint16(28, nameBytes.length, true);
      cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), nameBytes);
      offset += 30 + nameBytes.length + data.length;
    });
    const cdSize = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  const xmlEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
    // Caractères de contrôle interdits en XML.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

  function colName(i) {
    let s = '';
    for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  }

  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/><numFmt numFmtId="166" formatCode="#,##0.00\ &quot;€&quot;"/></numFmts>
<fonts count="12"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF006100"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font>
<font><b/><sz val="18"/><color rgb="FF1F3A5F"/><name val="Calibri"/></font><font><sz val="12"/><color rgb="FF44546A"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF7F8C9A"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FF1F3A5F"/><name val="Calibri"/></font><font><sz val="11"/><color rgb="FF1B2430"/><name val="Calibri"/></font><font><sz val="10"/><color rgb="FF7F8C9A"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF1F3A5F"/><name val="Calibri"/></font></fonts>
<fills count="11"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFC6EFCE"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFC7CE"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="darkUp"><fgColor rgb="FF808080"/><bgColor rgb="FFFFFFFF"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE4DFEC"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1F3A5F"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F0"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEEF3F8"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF8E1"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="5"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF999999"/></left><right style="thin"><color rgb="FF999999"/></right><top style="thin"><color rgb="FF999999"/></top><bottom style="thin"><color rgb="FF999999"/></bottom><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFD0D7E1"/></bottom><diagonal/></border>
<border><left/><right/><top/><bottom style="medium"><color rgb="FF1F3A5F"/></bottom><diagonal/></border>
<border><left style="thin"><color rgb="FFE3D3A0"/></left><right style="thin"><color rgb="FFE3D3A0"/></right><top style="thin"><color rgb="FFE3D3A0"/></top><bottom style="thin"><color rgb="FFE3D3A0"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="29">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="9" fillId="9" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1" indent="1"/></xf>
<xf numFmtId="0" fontId="7" fillId="7" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="8" fillId="8" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="49" fontId="9" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="10" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
<xf numFmtId="165" fontId="9" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
<xf numFmtId="166" fontId="9" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="9" fillId="10" borderId="4" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
<xf numFmtId="49" fontId="9" fillId="10" borderId="4" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="9" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="11" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="10" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="9" fillId="10" borderId="4" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/><extLst><ext uri="{C7286773-470A-42A8-94C5-96B5CB345126}" xmlns:xfpb="http://schemas.microsoft.com/office/spreadsheetml/2022/featurepropertybag"><xfpb:xfComplement i="0"/></ext></extLst></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
<dxfs count="3"><dxf><font><b/><color rgb="FF006100"/></font><fill><patternFill><bgColor rgb="FFC6EFCE"/></patternFill></fill></dxf><dxf><font><color rgb="FF9C5700"/></font><fill><patternFill><bgColor rgb="FFFFEB9C"/></patternFill></fill></dxf><dxf><font><color rgb="FF7F8C9A"/></font><fill><patternFill><bgColor rgb="FFF2F2F2"/></patternFill></fill></dxf></dxfs>
</styleSheet>`;

  function sheetXml({ rows, widths, freeze, filter, heights, merges, grid, lists, colors, page, breaks }) {
    const cols = (widths || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    const ht = (r) => (heights && heights[r] ? ` ht="${heights[r]}" customHeight="1"` : '');
    const sheetRows = rows.map((row, r) => `<row r="${r + 1}"${ht(r)}>${row.map((cell, c) => {
      if (!cell) return '';
      const ref = colName(c) + (r + 1);
      const s = cell.s ? ` s="${cell.s}"` : '';
      if (cell.v === undefined || cell.v === null || cell.v === '') return `<c r="${ref}"${s}/>`;
      if (typeof cell.v === 'boolean') return `<c r="${ref}"${s} t="b"><v>${cell.v ? 1 : 0}</v></c>`;
      if (typeof cell.v === 'number') return Number.isFinite(cell.v) ? `<c r="${ref}"${s}><v>${cell.v}</v></c>` : `<c r="${ref}"${s}/>`;
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(cell.v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    const paneXml = freeze ? `<pane xSplit="${freeze.col || 0}" ySplit="${freeze.row || 0}" topLeftCell="${colName(freeze.col || 0)}${(freeze.row || 0) + 1}" activePane="bottomRight" state="frozen"/>` : '';
    const pane = freeze || grid === false ? `<sheetViews><sheetView${grid === false ? ' showGridLines="0"' : ''} workbookViewId="0">${paneXml}</sheetView></sheetViews>` : '';
    const lastRef = colName(Math.max(0, ...rows.map((r) => r.length - 1))) + rows.length;
    const auto = filter !== false && rows.length > 1 ? `<autoFilter ref="A${(filter && filter.row) || 1}:${lastRef}"/>` : '';
    const merged = merges && merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
    const cf = (colors || []).map((x, i) => `<conditionalFormatting sqref="${x.ref}"><cfRule type="cellIs" dxfId="${x.style || 0}" priority="${i + 1}" operator="equal"><formula>${typeof x.equals === 'boolean' ? String(x.equals).toUpperCase() : `"${xmlEsc(x.equals)}"`}</formula></cfRule></conditionalFormatting>`).join('');
    const dv = lists && lists.length ? `<dataValidations count="${lists.length}">${lists.map((x) => `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${x.ref}"><formula1>"${xmlEsc(x.values.join(','))}"</formula1></dataValidation>`).join('')}</dataValidations>` : '';
    const setup = page ? `<printOptions horizontalCentered="1"/><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="${page.landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>${page.footer ? `<headerFooter><oddFooter>${xmlEsc(page.footer)}</oddFooter></headerFooter>` : ''}` : '';
    const brk = breaks && breaks.length ? `<rowBreaks count="${breaks.length}" manualBreakCount="${breaks.length}">${breaks.map((r) => `<brk id="${r}" max="16383" man="1"/>`).join('')}</rowBreaks>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${page ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : ''}${pane}${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${sheetRows}</sheetData>${auto}${merged}${cf}${dv}${setup}${brk}</worksheet>`;
  }

  function build(opts) {
    const sheets = (opts.sheets || [Object.assign({ name: opts.sheetName }, opts)]).map((sh, i) => Object.assign({}, sh, {
      name: xmlEsc(String(sh.name || `Feuille ${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)),
    }));
    const n = sheets.length;
    const idx = Array.from({ length: n }, (_, i) => i + 1);
    // Cases à cocher (style 28) : propriétés de la fonctionnalité « case à cocher » d'Excel 365
    const fpb = sheets.some((sh) => sh.rows.some((row) => row.some((cell) => cell && cell.s === 28)));
    return zip([
      { name: '[Content_Types].xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${idx.map((i) => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${fpb ? '<Override PartName="/xl/featurePropertyBag/featurePropertyBag.xml" ContentType="application/vnd.ms-excel.featurepropertybag+xml"/>' : ''}</Types>` },
      { name: '_rels/.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sh, i) => `<sheet name="${sh.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${idx.map((i) => `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${fpb ? `<Relationship Id="rId${n + 2}" Type="http://schemas.microsoft.com/office/2022/11/relationships/FeaturePropertyBag" Target="featurePropertyBag/featurePropertyBag.xml"/>` : ''}</Relationships>` },
      { name: 'xl/styles.xml', content: STYLES },
    ].concat(fpb ? [{ name: 'xl/featurePropertyBag/featurePropertyBag.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<FeaturePropertyBags xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/featurepropertybag"><bag type="Checkbox"/><bag type="XFControls"><bagId k="CellControl">0</bagId></bag><bag type="XFComplement"><bagId k="XFControls">1</bagId></bag><bag type="XFComplements" extRef="XFComplementsMapperExtRef"><a k="MappedFeaturePropertyBags"><bagId>2</bagId></a></bag></FeaturePropertyBags>` }] : []).concat(sheets.map((sh, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, content: sheetXml(sh) }))));
  }

  // Numéro de série Excel d'une date AAAA-MM-JJ (jours depuis le 30/12/1899).
  const serial = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000) : null;
  };

  window.XlsxWriter = { build, serial };
})();
