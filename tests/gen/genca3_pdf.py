# Déclarations de TVA CA3 en PDF (données entièrement inventées), mise en page voisine du formulaire 3310-CA3-SD, pour
# le dossier fictif de gentvarevue.py (SIREN 600 000 006) :
#   - ca3-2026-01.pdf : janvier 2026, une page ; codes et libellés dans le même texte (« 08 Taux normal 20 % »), cadre A
#     sur deux colonnes (opérations imposables / non imposables), montants alignés à droite, police Helvetica standard ;
#     base à 10 % déclarée 10 004 (l'OD de TVA ne permet d'en déduire que 10 000) ;
#   - ca3-2026-02-03.pdf : février et mars 2026, une déclaration par page, codes en textes séparés, en-tête citant
#     aussi l'exercice (« du 01/01/2026 au 31/12/2026 »), flux compressés.
#   python3 genca3_pdf.py [dossier de sortie]   → ca3-2026-01.pdf, ca3-2026-02-03.pdf et ca3-attendu.json
import sys, os, json, zlib

OUTDIR = sys.argv[1] if len(sys.argv) > 1 else '.'
H = 842


def esc(s):
    return s.encode('cp1252').replace(b'\\', b'\\\\').replace(b'(', b'\\(').replace(b')', b'\\)').decode('latin-1')


def fr(n):
    return f'{n:,.0f}'.replace(',', ' ')


def txt(x, top, s, size=8, bold=False, right=False):
    w = len(s) * size * 0.5
    x0 = x - w if right else x
    return f'BT /{"F2" if bold else "F1"} {size} Tf 1 0 0 1 {x0:.2f} {H - top:.2f} Tm ({esc(s)}) Tj ET'


def declaration(p, du, au, split_codes):
    s = ['0.5 w 30 800 m 565 800 l S']
    s.append(txt(40, 30, 'DÉCLARATION DE TVA ET DE TAXES ASSIMILÉES - RÉGIME DU RÉEL NORMAL', 10, True))
    s.append(txt(450, 30, 'N° 3310-CA3-SD', 9, True))
    if not split_codes:
        s.append(txt(40, 52, f'Période du {du} au {au}', 9))
    else:
        s.append(txt(40, 52, 'Exercice du 01/01/2026 au 31/12/2026', 9))
        s.append(txt(300, 52, f'Période : du {du} au {au}', 9))
    s.append(txt(40, 66, "Désignation de l'entreprise : HOTEL TVA DEMO", 9))
    s.append(txt(300, 66, 'SIREN : 600 000 006', 9))
    s.append(txt(40, 90, 'A - MONTANT DES OPÉRATIONS RÉALISÉES', 9, True))
    s.append(txt(40, 104, 'OPÉRATIONS IMPOSABLES (H.T.)', 8, True))
    s.append(txt(310, 104, 'OPÉRATIONS NON IMPOSABLES', 8, True))
    top = 118

    def row(x, code, label, amounts, right_edges):
        out = []
        if split_codes:
            out.append(txt(x, top, code))
            out.append(txt(x + 16, top, label))
        else:
            out.append(txt(x, top, f'{code} {label}'))
        for v, xr in zip(amounts, right_edges):
            if v is not None:
                out.append(txt(xr, top, fr(v), right=True))
        return out

    left = [('A1', 'Ventes, prestations de services', p.get('A1')), ('A2', 'Autres opérations imposables', p.get('A2')),
            ('A3', 'Achats de prestations de services intracommunautaires', p.get('A3')), ('B2', 'Acquisitions intracommunautaires', p.get('B2'))]
    right = [('E1', 'Exportations hors UE', p.get('E1')), ('E2', 'Autres opérations non imposables', p.get('E2')),
             ('F2', 'Livraisons intracommunautaires', p.get('F2')), ('F3', "Livraisons d'électricité", p.get('F3'))]
    for (c1, l1, v1), (c2, l2, v2) in zip(left, right):
        s.extend(row(40, c1, l1, [v1], [290]))
        s.extend(row(310, c2, l2, [v2], [560]))
        top += 14
    top += 10
    s.append(txt(40, top, 'B - DÉCOMPTE DE LA TVA À PAYER', 9, True))
    top += 14
    s.append(txt(470, top, 'Base hors taxe', 8, True, True))
    s.append(txt(560, top, 'Taxe due', 8, True, True))
    top += 14
    lines = [('08', 'Taux normal 20 %', p.get('08')), ('09', 'Taux réduit 5,5 %', p.get('09')), ('9B', 'Taux réduit 10 %', p.get('9B')),
             ('5B', 'Sommes à ajouter, y compris acompte congés', p.get('5B')), ('16', 'Total de la TVA brute due (lignes 08 à 5B)', p.get('16')),
             ('17', 'Dont TVA sur acquisitions intracommunautaires', p.get('17')), ('19', 'Biens constituant des immobilisations', p.get('19')),
             ('20', 'Autres biens et services', p.get('20')), ('22', 'Report du crédit apparaissant ligne 27 de la précédente déclaration', p.get('22')),
             ('2C', 'Sommes à imputer, y compris acompte congés', p.get('2C')), ('23', 'Total TVA déductible (lignes 19 à 2C)', p.get('23')),
             ('25', 'Crédit de TVA (ligne 23 - ligne 16)', p.get('25')), ('26', 'Remboursement de crédit demandé sur formulaire n°3519 joint', p.get('26')),
             ('27', 'Crédit à reporter (ligne 25 - ligne 26 - ligne AA)', p.get('27')), ('28', 'TVA nette due (ligne 16 - ligne 23)', p.get('28')),
             ('32', 'Total à payer (lignes 28 + 29 + Z5 - AB)', p.get('32'))]
    for code, label, v in lines:
        if isinstance(v, tuple):
            s.extend(row(40, code, label, list(v), [470, 560]))
        else:
            s.extend(row(40, code, label, [v], [560]))
        top += 14
    s.append(txt(40, 810, 'Document fictif généré pour les tests - données inventées', 7))
    return '\n'.join(s).encode('latin-1')


def write_pdf(path, contents, compress):
    objs = [(1, b'<< /Type /Catalog /Pages 2 0 R >>')]
    kids = []
    num = 5
    pages = []
    for c in contents:
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


JAN = {'A1': 15004, '08': (5000, 1000), '9B': (10004, 1000), '16': 2000, '20': 600, '22': 300, '23': 900, '28': 1100, '32': 1100}
FEB = {'A1': 12000, '08': (4000, 800), '9B': (8000, 800), '16': 1600, '19': 2000, '20': 400, '23': 2400, '25': 800, '27': 800}
MAR = {'A1': 18900, '08': (6000, 1200), '9B': (12900, 1290), '16': 2490, '20': 400, '22': 800, '23': 1200, '28': 1290, '32': 1290}
write_pdf(os.path.join(OUTDIR, 'ca3-2026-01.pdf'), [declaration(JAN, '01/01/2026', '31/01/2026', False)], False)
write_pdf(os.path.join(OUTDIR, 'ca3-2026-02-03.pdf'), [declaration(FEB, '01/02/2026', '28/02/2026', True), declaration(MAR, '01/03/2026', '31/03/2026', True)], True)
exp = {k: {c: (list(v) if isinstance(v, tuple) else [v]) for c, v in d.items()} for k, d in (('2026-01', JAN), ('2026-02', FEB), ('2026-03', MAR))}
with open(os.path.join(OUTDIR, 'ca3-attendu.json'), 'w', encoding='utf-8') as f:
    json.dump(exp, f, indent=1)
print('ok')
