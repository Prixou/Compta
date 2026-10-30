# Éditions de paie au format des éditions Silae (données entièrement inventées) pour le dossier fictif 123456789
# (FEC 2025 : salaires 641000 = 30 500,00 €, charges sociales 645000 = 12 600,00 €) :
#   - silae-journal-de-paie.pdf : salariés en lignes, colonnes Salaire brut / Cotisations salariales / Cotisations patronales
#     / Net imposable / Net à payer (intitulés sur deux lignes), ligne « Total » ;
#   - silae-detail-cotisations.pdf : titre « DÉTAILS DES COTISATIONS » (pluriel), organismes en groupes (intitulé seul, lignes de
#     cotisations, « Total <organisme> »), colonnes Base / Part salariale / Part patronale / Total, ligne « Total général »,
#     flux compressé (organismes du FEC fictif 456456456 : URSSAF, Klesia, AG2R, Harmonie, France Travail, OPCO) ;
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
    s = [txt(40, 40, title, 12, True), txt(40, 58, 'SARL PAIE FICTIVE - SIRET 456 456 456 00018', 8), txt(40, 70, sub, 8)]
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


def grouped(title, sub, heads, items, edges, label_x=40):
    """items : ('g', intitulé de groupe) ou (libellé, [montants ou None], gras)."""
    s = [txt(40, 40, title, 12, True), txt(40, 58, 'SARL PAIE FICTIVE - SIRET 456 456 456 00018', 8), txt(40, 70, sub, 8)]
    s.append(txt(label_x, 104, heads[0][0], 8, True))
    for (h1, h2), xr in zip(heads[1:], edges):
        s.append(txt(xr, 96, h1, 8, True, right=True))
        if h2:
            s.append(txt(xr, 104, h2, 8, True, right=True))
    top = 122
    for it in items:
        if it[0] == 'g':
            top += 4
            s.append(txt(label_x, top, it[1], 8, True))
        else:
            lab, vals, bold = it
            s.append(txt(label_x + (0 if bold else 10), top, lab, 8, bold))
            for v, xr in zip(vals, edges):
                if v is not None:
                    s.append(txt(xr, top, fr(v), 8, bold, right=True))
        top += 14
    return '\n'.join(s)


ORGS = [('URSSAF', [('Maladie', 0, 3965.00), ('Vieillesse plafonnée', 2097.50, 2592.50), ('Allocations familiales', 0, 1067.50),
                    ('Accident du travail', 0, 915.00), ('CSG / CRDS', 800.00, 0)]),
        ('KLESIA RETRAITE', [('Retraite complémentaire tranche 1', 1220.00, 1830.00)]),
        ('AG2R PRÉVOYANCE', [('Prévoyance non cadres', 150.00, 380.00)]),
        ('HARMONIE MUTUELLE', [('Mutuelle obligatoire', 300.00, 300.00)]),
        ('FRANCE TRAVAIL', [('Assurance chômage', 0, 1220.00)]),
        ('OPCO / FORMATION', [('Formation professionnelle', 0, 210.00), ("Taxe d'apprentissage", 0, 120.00)])]
items = []
for org, lines in ORGS:
    items.append(('g', org))
    for lab, sal, pat in lines:
        items.append((lab, [30500.00, sal, pat, round(sal + pat, 2)], False))
    ts, tp = round(sum(x[1] for x in lines), 2), round(sum(x[2] for x in lines), 2)
    items.append((f'Total {org}', [None, ts, tp, round(ts + tp, 2)], True))
TS, TP = round(sum(x[1] for _, l in ORGS for x in l), 2), round(sum(x[2] for _, l in ORGS for x in l), 2)
items.append(('Total général', [None, TS, TP, round(TS + TP, 2)], True))
cotis = grouped('DÉTAILS DES COTISATIONS', 'Période du 01/01/2025 au 31/12/2025',
                [('Organisme / cotisation', None), ('Base', None), ('Part', 'salariale'), ('Part', 'patronale'), ('Total', None)], items, [300, 380, 460, 550])


# Cotisations salariales = 4 567,50 et net à payer = 25 932,50, comme le détail des cotisations et le 421 du FEC fictif
SAL = [('DUPONT Jean', 12000.00, 1797.00), ('MARTIN Claire', 10500.00, 1572.50), ('LEROY Paul', 8000.00, 1198.00)]
PAT = [4957.38, 4337.70, 3304.92]  # 12 600,00
journal = table('JOURNAL DE PAIE', 'Période du 01/01/2025 au 31/12/2025',
                [('Salarié', None), ('Salaire', 'brut'), ('Cotisations', 'salariales'), ('Cotisations', 'patronales'), ('Net', 'imposable'), ('Net', 'à payer')],
                [(n, [b, s, p, round(b - s + b * 0.02, 2), round(b - s, 2)]) for (n, b, s), p in zip(SAL, PAT)],
                'Total', [230, 310, 390, 470, 550])
repos = table('SOLDE DE REPOS', 'Situation au 31/12/2025 - Congés payés',
              [('Salarié', None), ('Acquis', None), ('Pris', None), ('Solde', '(jours)'), ('Indemnité', None), ('Charges', None)],
              [('DUPONT Jean', [25.00, 18.00, 7.00, 980.00, 411.60]), ('MARTIN Claire', [25.00, 20.00, 5.00, 650.00, 273.00]),
               ('LEROY Paul', [12.50, 10.00, 2.50, 520.00, 218.40])],
              'Total', [250, 310, 380, 470, 550])
write_pdf(os.path.join(OUTDIR, 'silae-journal-de-paie.pdf'), [journal], False)
write_pdf(os.path.join(OUTDIR, 'silae-detail-cotisations.pdf'), [cotis], True)
write_pdf(os.path.join(OUTDIR, 'silae-solde-de-repos.pdf'), [repos], False)
print('ok')
