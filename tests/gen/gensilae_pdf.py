# Éditions de paie au format des éditions Silae (données entièrement inventées) pour le dossier fictif 123456789
# (FEC 2025 : salaires 641000 = 30 500,00 €, charges sociales 645000 = 12 600,00 €) :
#   - silae-journal-de-paie.pdf : salariés en lignes, colonnes Salaire brut / Cotisations salariales / Cotisations patronales
#     / Net imposable / Net à payer (intitulés sur deux lignes), ligne « Total » ;
#   - silae-detail-cotisations.pdf : organismes en lignes, colonnes Base / Part salariale / Part patronale / Total, ligne
#     « Total général », flux compressé ;
#   - silae-solde-de-repos.pdf : salariés en lignes, colonnes Acquis / Pris / Solde (jours) / Indemnité / Charges, ligne
#     « Total » (indemnité 2 150,00 €, charges 903,00 €).
#   python3 gensilae_pdf.py [dossier de sortie]
import sys, os, zlib

OUTDIR = sys.argv[1] if len(sys.argv) > 1 else '.'
H = 842


def esc(s):
    return s.encode('cp1252').replace(b'\\', b'\\\\').replace(b'(', b'\\(').replace(b')', b'\\)').decode('latin-1')


def fr(n):
    return f'{n:,.2f}'.replace(',', ' ').replace('.', ',')


def txt(x, top, s, size=8, bold=False, right=False):
    w = len(s) * size * 0.5
    x0 = x - w if right else x
    return f'BT /{"F2" if bold else "F1"} {size} Tf 1 0 0 1 {x0:.2f} {H - top:.2f} Tm ({esc(s)}) Tj ET'


def write_pdf(path, contents, compress):
    objs = [(1, b'<< /Type /Catalog /Pages 2 0 R >>')]
    kids, pages, num = [], [], 5
    for c in contents:
        c = c.encode('latin-1')
        kids.append(f'{num} 0 R')
        if compress:
            z = zlib.compress(c, 9)
            st = f'<< /Length {len(z)} /Filter /FlateDecode >>\nstream\n'.encode() + z + b'\nendstream'
        else:
            st = f'<< /Length {len(c)} >>\nstream\n'.encode() + c + b'\nendstream'
        pages.append((num, f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {num + 1} 0 R >>'.encode()))
        pages.append((num + 1, st))
        num += 2
    objs.append((2, f'<< /Type /Pages /Kids [{" ".join(kids)}] /Count {len(contents)} >>'.encode()))
    objs.append((3, b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'))
    objs.append((4, b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'))
    objs += pages
    out = bytearray(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
    offs = {}
    for n, body in objs:
        offs[n] = len(out)
        out += f'{n} 0 obj\n'.encode() + body + b'\nendobj\n'
    xref = len(out)
    size = max(offs) + 1
    out += f'xref\n0 {size}\n0000000000 65535 f \n'.encode()
    for i in range(1, size):
        out += f'{offs[i]:010d} 00000 n \n'.encode()
    out += f'trailer\n<< /Size {size} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
    with open(path, 'wb') as f:
        f.write(out)


def table(title, sub, heads, rows, total_label, edges, label_x=40):
    """heads : [(ligne 1, ligne 2)] par colonne chiffrée ; rows : [(libellé, [montants])] ; edges : bord droit de chaque colonne."""
    s = [txt(40, 40, title, 12, True), txt(40, 58, 'SARL DOSSIER FICTIF - SIRET 123 456 789 00012', 8), txt(40, 70, sub, 8)]
    s.append(txt(label_x, 104, heads[0][0], 8, True))
    for (h1, h2), xr in zip(heads[1:], edges):
        s.append(txt(xr, 96, h1, 8, True, right=True))
        if h2:
            s.append(txt(xr, 104, h2, 8, True, right=True))
    top = 122
    for lab, vals in rows + [(total_label, [round(sum(v[i] for _, v in rows), 2) for i in range(len(edges))])]:
        bold = lab == total_label
        s.append(txt(label_x, top, lab, 8, bold))
        for v, xr in zip(vals, edges):
            s.append(txt(xr, top, fr(v), 8, bold, right=True))
        top += 14
    return '\n'.join(s)


SAL = [('DUPONT Jean', 12000.00), ('MARTIN Claire', 10500.00), ('LEROY Paul', 8000.00)]
PAT = [4957.38, 4337.70, 3304.92]  # 12 600,00
journal = table('JOURNAL DE PAIE', 'Période du 01/01/2025 au 31/12/2025',
                [('Salarié', None), ('Salaire', 'brut'), ('Cotisations', 'salariales'), ('Cotisations', 'patronales'), ('Net', 'imposable'), ('Net', 'à payer')],
                [(n, [b, round(b * 0.22, 2), p, round(b * 0.81, 2), round(b * 0.78, 2)]) for (n, b), p in zip(SAL, PAT)],
                'Total', [230, 310, 390, 470, 550])
cotis = table('DÉTAIL DES COTISATIONS', 'Période du 01/01/2025 au 31/12/2025',
              [('Organisme', None), ('Base', None), ('Part', 'salariale'), ('Part', 'patronale'), ('Total', None)],
              [('URSSAF', [30500.00, 2897.50, 8540.00, 11437.50]), ('Retraite complémentaire AGIRC-ARRCO', [30500.00, 1220.00, 1830.00, 3050.00]),
               ('Prévoyance', [30500.00, 150.00, 380.00, 530.00]), ('Mutuelle', [30500.00, 300.00, 300.00, 600.00]),
               ('France Travail', [30500.00, 0.00, 1220.00, 1220.00]), ('Formation professionnelle et apprentissage', [30500.00, 0.00, 330.00, 330.00])],
              'Total général', [300, 380, 460, 550])
repos = table('SOLDE DE REPOS', 'Situation au 31/12/2025 - Congés payés',
              [('Salarié', None), ('Acquis', None), ('Pris', None), ('Solde', '(jours)'), ('Indemnité', None), ('Charges', None)],
              [('DUPONT Jean', [25.00, 18.00, 7.00, 980.00, 411.60]), ('MARTIN Claire', [25.00, 20.00, 5.00, 650.00, 273.00]),
               ('LEROY Paul', [12.50, 10.00, 2.50, 520.00, 218.40])],
              'Total', [250, 310, 380, 470, 550])
write_pdf(os.path.join(OUTDIR, 'silae-journal-de-paie.pdf'), [journal], False)
write_pdf(os.path.join(OUTDIR, 'silae-detail-cotisations.pdf'), [cotis], True)
write_pdf(os.path.join(OUTDIR, 'silae-solde-de-repos.pdf'), [repos], False)
print('ok')
