# Relevés bancaires PDF de test (données entièrement inventées) :
#   - releve-acd.pdf : mise en page de l'édition « Relevé bancaire » d'ACD (PDF 1.4, polices TrueType Arial non
#     incorporées, encodage WinAnsi + Euro, repère réduit à 75 % et retourné, un caractère par opérateur Td, montants
#     alignés à droite, fonds et filets), sur 2 pages : en-tête Date / Opérations / Dépenses / Recettes répété avec le
#     solde initial, libellé sur deux lignes, libellés finissant par un nombre, montants à séparateur de milliers et de
#     moins d'un euro, remboursement en recette, lignes Total, Solde Final et Solde Calculé, pied de page « … Page - n » ;
#   - releve-banque.pdf : relevé de banque en colonnes Date / Valeur / Libellé / Débit / Crédit (chaînes entières, TJ
#     avec crénage, Helvetica standard sans table de largeurs, flux non compressé, dates sur deux chiffres, milliers
#     séparés par un point, ancien solde débiteur, total des opérations et nouveau solde).
#   python3 genreleve_pdf.py [dossier de sortie]   → releve-acd.pdf, releve-banque.pdf et releve-attendu.json
import sys, os, json, zlib, random

OUTDIR = sys.argv[1] if len(sys.argv) > 1 else '.'
rnd = random.Random(2026)

# Largeurs Helvetica / Arial (1/1000 du corps) des caractères 32 à 255 en encodage WinAnsi
_W = {
    'F1': [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 0, 556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 0, 500, 667, 278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611, 667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278, 556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500],
    'F2': [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 0, 556, 0, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 0, 500, 667, 278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611, 722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278, 611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556],
}
_W['F3'] = _W['F1']


def wb(ch):
    return ch.encode('cp1252')


def width(font, ch):
    return _W[font][wb(ch)[0] - 32]


def esc(b):
    return b.replace(b'\\', b'\\\\').replace(b'(', b'\\(').replace(b')', b'\\)')


def fr(n, sep=' '):
    s = f'{abs(n):,.2f}'.replace(',', '#').replace('.', ',').replace('#', sep)
    return ('-' if n < 0 else '') + s


def fdate(iso, short=False):
    y, m, d = iso.split('-')
    return f'{d}/{m}/{y[2:] if short else y}'


def write_pdf(path, objects, root, info=None):
    # objects : liste de (numéro, octets du corps) ; fins de ligne CRLF comme l'édition ACD
    out = bytearray(b'%PDF-1.4\r\n%\xe2\xe3\xcf\xd3\r\n%\r\n')
    offs = {}
    for num, body in objects:
        offs[num] = len(out)
        out += f'{num} 0 obj\r\n'.encode() + body + b'\r\nendobj\r\n'
    xref = len(out)
    n = max(offs) + 1
    out += f'xref\r\n0 {n}\r\n0000000000 65535 f\r\n'.encode()
    for i in range(1, n):
        out += f'{offs.get(i, 0):010d} {"00000 n" if i in offs else "65535 f"}\r\n'.encode()
    out += f'trailer\n<<\n/Size {n}\r\n/Root {root} 0 R\r\n'.encode() + (f'/Info {info} 0 R\r\n'.encode() if info else b'') + f'>>\r\nstartxref\r\n{xref}\r\n%%EOF\r\n'.encode()
    with open(path, 'wb') as f:
        f.write(out)


def stream(data, compress=True):
    if compress:
        z = zlib.compress(data, 9)
        return f'<</Length {len(z)}\n/Filter [/FlateDecode] >>\r\nstream\r\n'.encode() + z + b'\r\nendstream'
    return f'<</Length {len(data)} >>\r\nstream\r\n'.encode() + data + b'\r\nendstream'


# ---------------------------------------------------------------------------
# 1. Relevé ACD
# ---------------------------------------------------------------------------
LIBS_D = [
    ('PRLV SEPA FOURNISSEUR ENERGIE', 80, 420), ('CB STATION CARBURANT', 40, 95), ('CB FOURNITURES BUREAU', 12, 160),
    ('PRLV SEPA ASSURANCE MULTIRISQUE', 90, 240), ('CB RESTAURANT LE DEMO', 18, 85), ('PRLV SEPA OPERATEUR TELECOM', 30, 75),
    ('VIR SEPA FOURNISSEUR GROSSISTE', 900, 4800), ('CHEQUE N 0001234', 60, 900), ('PRLV SEPA LOCATION MATERIEL', 120, 320),
    ('CB PEAGE AUTOROUTE', 4, 38),
]
LIBS_C = [('REMISE CB', 300, 2600), ('VIR SEPA CLIENT ALPHA', 400, 3500), ('REMISE CHEQUES', 150, 1900), ('VIR SEPA CLIENT BETA', 250, 2200)]


def acd_ops():
    ops = []
    days = sorted(rnd.randint(2, 30) for _ in range(54))
    for i, d in enumerate(days):
        date = f'2026-03-{d:02d}'
        if rnd.random() < 0.38:
            lib, a, b = rnd.choice(LIBS_C)
            ops.append({'date': date, 'lib': f'{lib} {d:02d}03', 'debit': 0, 'credit': round(rnd.uniform(a, b), 2)})
        else:
            lib, a, b = rnd.choice(LIBS_D)
            ops.append({'date': date, 'lib': lib, 'debit': round(rnd.uniform(a, b), 2), 'credit': 0})
    # Cas particuliers
    ops[3] = {'date': ops[3]['date'], 'lib': 'FRAIS TENUE DE COMPTE', 'debit': 0.80, 'credit': 0}
    ops[7] = {'date': ops[7]['date'], 'lib': 'LOYER LOCAL COMMERCIAL MARS 2026', 'debit': 1450.00, 'credit': 0}
    ops[12] = {'date': ops[12]['date'], 'lib': 'URSSAF COTISATIONS 02 2026', 'debit': 2315.47, 'credit': 0}
    ops[18] = {'date': ops[18]['date'], 'lib': 'VIR SEPA CLIENT GAMMA FACTURE F-2026-031 SOLDE TRAVAUX', 'debit': 0, 'credit': 12480.00,
               'wrap': 'ACOMPTE DEDUIT CHANTIER 12'}
    ops[25] = {'date': ops[25]['date'], 'lib': 'REMBOURSEMENT LITIGE CB', 'debit': 0, 'credit': 42.15}
    ops[31] = {'date': ops[31]['date'], 'lib': 'DGFIP TVA 02 2026', 'debit': 3870.00, 'credit': 0}
    ops[40] = {'date': ops[40]['date'], 'lib': 'COMMISSION INTERVENTION', 'debit': 8.00, 'credit': 0}
    ops[47] = {'date': ops[47]['date'], 'lib': 'VIR SALAIRE MARS 2026 ÉQUIPE', 'debit': 10250.33, 'credit': 0}
    return ops


def acd():
    ops = acd_ops()
    si = 8452.17
    td = round(sum(o['debit'] for o in ops), 2)
    tc = round(sum(o['credit'] for o in ops), 2)
    sf = round(si - td + tc, 2)
    U = lambda pt: round(pt / 0.75)  # points → unités du repère réduit à 75 %
    BLUE, DARK, ORANGE = '0.125 0.471 0.675 rg', '0.2 0.263 0.345 rg', '0.89 0.467 0.129 rg'

    def cells_bt(cells):
        # cells : (police, corps en unités, couleur, x en points, haut en points, texte, aligné à droite)
        out = ['BT 1 0 0 1 0 0 Tm']
        cx = cy = 0
        cur = None
        for font, size, col, x, top, txt, right in cells:
            if (font, size, col) != cur:
                out.append(f'/{font} {size} Tf 0 Ts {col}')
                cur = (font, size, col)
            adv = [round(width(font, ch) * size / 1000) for ch in txt]
            xu = U(x) - (sum(adv) if right else 0)
            yu = -U(top + 0.75 * size * 0.75)
            for ch, a in zip(txt, adv):
                out.append(f'{xu - cx} {yu - cy} Td(' + esc(wb(ch)).decode('latin-1') + ')Tj')
                cx, cy = xu, yu
                xu += a
        out.append('ET 1 0 0 1 0 0 cm')
        return ' '.join(out)

    def amount_cell(v, top):
        # solde ou total : positif sous Recettes, négatif sous Dépenses
        return ('F1', 11, BLUE, 567 if v >= 0 else 477, top, fr(abs(v)), True)

    def page(rows, n, last):
        s = ['q 0.75 0 0 0.75 0 842 cm q 1 1 1 rg 26 -38 741 -150 re f Q']
        s.append(cells_bt([('F2', 11, DARK, 28, 32, 'DEMO BOULANGERIE TEST SARL', False)]))
        s.append(cells_bt([('F1', 19, ORANGE, 247, 50, 'Relevé bancaire', False)]))
        s.append(cells_bt([('F2', 11, BLUE, 233, 83, 'du ' + fdate('2026-03-01') + ' au ' + fdate('2026-03-31'), False),
                           ('F2', 11, BLUE, 407, 96, 'Compte n° 512100 BANQUE FICTIVE 00099', False)]))
        s.append('0.929 0.953 0.992 rg 0.792 0.871 0.941 RG 1 w 1 J 1 j [] 0 d 26 -150 741 -18 re b*')
        s.append(cells_bt([('F2', 11, DARK, 26, 111, 'Date', False), ('F2', 11, DARK, 82, 111, 'Opérations', False),
                           ('F2', 11, DARK, 456, 111, 'Dépenses', True), ('F2', 11, DARK, 544, 111, 'Recettes', True)]))
        s.append(cells_bt([('F1', 11, DARK, 320, 124, 'Solde Initial', False), amount_cell(si, 124)]))
        top = 139
        for k, o in enumerate(rows):
            if k % 2:
                s.append(f'q 0.957 0.973 0.996 rg 26 -{U(top - 3)} 741 -18 re f Q')
            cells = [('F1', 11, DARK, 26, top, fdate(o['date']), False), ('F1', 11, DARK, 82, top, o['lib'], False)]
            if o['debit']:
                cells.append(('F1', 11, DARK, 477, top, fr(o['debit']), True))
            if o['credit']:
                cells.append(('F1', 11, DARK, 567, top, fr(o['credit']), True))
            s.append(cells_bt(cells))
            top += 13.6
            if o.get('wrap'):
                s.append(cells_bt([('F1', 11, DARK, 82, top, o['wrap'], False)]))
                top += 13.6
        if last:
            top += 2
            s.append(f'1 1 1 rg 0.89 0.467 0.129 RG 1 w 1 J 1 j [] 0 d 26 -{U(top - 2)} m 767 -{U(top - 2)} l S')
            s.append(cells_bt([('F2', 11, DARK, 320, top, 'Total', False), ('F2', 11, BLUE, 477, top, fr(td), True), ('F2', 11, BLUE, 567, top, fr(tc), True)]))
            s.append(cells_bt([('F2', 11, DARK, 320, top + 12, 'Solde Final', False), amount_cell(sf, top + 12)]))
            s.append(cells_bt([('F1', 11, DARK, 320, top + 24, 'Solde Calculé', False), amount_cell(sf, top + 24)]))
        s.append(cells_bt([('F1', 13, BLUE, 26, 794, 'Logiciel Démo', False), ('F3', 13, BLUE, 576, 794, f'Page - {n}', True)]))
        s.append(cells_bt([('F1', 11, BLUE, 434, 798, '13/10/2026 à 09:30', False)]))
        s.append('Q')
        return ' \r\n'.join(s).encode('latin-1')

    p1, p2 = ops[:44], ops[44:]
    widths = lambda f: ('[ 750 750 ' + ' '.join(map(str, _W[f])) + ' ]').encode()
    font = lambda enc, w, fd, name: f'<<\r\n/Type/Font\n/Subtype/TrueType\n/BaseFont/{name}\n/Encoding {enc} 0 R\n/FirstChar 30\r\n/LastChar 255\r\n/Widths {w} 0 R\r\n/FontDescriptor {fd} 0 R\r\n>>'.encode()
    fdesc = lambda name: f'<<\r\n/Type/FontDescriptor\n/FontName/{name}\n/Ascent 728\n/CapHeight 500\n/Descent -210\n/Flags 32\n/FontBBox [-665 -325 2000 1040]\n/ItalicAngle 0\n/StemV 0\r\n>>'.encode()
    encd = b'<<\r\n/Type/Encoding/Differences\n[128 /Euro]/BaseEncoding/WinAnsiEncoding\r\n>>'
    objs = [
        (1, b'<<\r\n/Creator(Generateur de test)\n/Producer(genreleve_pdf.py)\r\n>>'),
        (6, stream(page(p1, 1, False))), (7, stream(page(p2, 2, True))),
        (4, encd), (5, encd),
        (8, widths('F1')), (9, fdesc('Arial')), (10, font(4, 8, 9, 'Arial')),
        (11, widths('F2')), (12, fdesc('Arial,Bold')), (13, font(4, 11, 12, 'Arial,Bold')),
        (14, widths('F3')), (15, fdesc('Arial')), (16, font(5, 14, 15, 'Arial')),
        (3, b'<<\r\n/ProcSet [/PDF/Text/ImageC]\r\n/Font << /F1 10 0 R\r\n/F2 13 0 R\r\n/F3 16 0 R >>\r\n>>'),
        (17, b'<<\r\n/Type/Pages\r\n/Count 2\r\n/Kids [ 18 0 R\r\n19 0 R ]\r\n>>'),
        (18, b'<<\r\n/Type/Page\r\n/Parent 17 0 R\r\n/Resources 3 0 R\r\n/MediaBox [0 0 595.276 841.890]\r\n/Contents 6 0 R\r\n>>'),
        (19, b'<<\r\n/Type/Page\r\n/Parent 17 0 R\r\n/Resources 3 0 R\r\n/MediaBox [0 0 595.276 841.890]\r\n/Contents 7 0 R\r\n>>'),
        (20, b'<<\r\n/Type/Catalog\r\n/Pages 17 0 R\r\n/PageMode/UseOutlines\r\n>>'),
    ]
    write_pdf(os.path.join(OUTDIR, 'releve-acd.pdf'), objs, 20, 1)
    exp_ops = [{'date': o['date'], 'lib': (o['lib'] + (' ' + o['wrap'] if o.get('wrap') else '')), 'debit': o['debit'], 'credit': o['credit']} for o in ops]
    return {'du': '2026-03-01', 'au': '2026-03-31', 'compte': '512100 BANQUE FICTIVE 00099', 'soldeInitial': si, 'soldeFinal': sf,
            'totals': {'debit': td, 'credit': tc}, 'ops': exp_ops}


# ---------------------------------------------------------------------------
# 2. Relevé de banque (Date / Valeur / Libellé / Débit / Crédit)
# ---------------------------------------------------------------------------
def banque():
    rows = [
        ('2026-04-01', '2026-04-01', 'PRLV SEPA FOURNISSEUR ENERGIE', 312.40, 0),
        ('2026-04-02', '2026-04-03', 'REMISE CB 0204', 0, 1875.20),
        ('2026-04-03', '2026-04-03', 'VIR SEPA CLIENT DELTA FACT 2026-118', 0, 4200.00),
        ('2026-04-07', '2026-04-07', 'CB FOURNITURES 0504', 64.90, 0),
        ('2026-04-08', '2026-04-08', 'CHEQUE 0004567', 1250.00, 0),
        ('2026-04-10', '2026-04-11', 'REMISE CHEQUES 3', 0, 980.55),
        ('2026-04-14', '2026-04-14', 'PRLV SEPA URSSAF 03 2026', 1988.12, 0),
        ('2026-04-15', '2026-04-15', 'COTISATION CARTE AFFAIRES', 4.50, 0),
        ('2026-04-17', '2026-04-17', 'VIR SEPA CLIENT EPSILON', 0, 12345.67),
        ('2026-04-22', '2026-04-22', 'PRLV SEPA DGFIP TVA 03 2026', 2760.00, 0),
        ('2026-04-24', '2026-04-24', 'VIR SALAIRES AVRIL 2026', 8420.18, 0),
        ('2026-04-28', '2026-04-29', 'INTERETS DEBITEURS 1ER TRIMESTRE', 17.33, 0),
        ('2026-04-30', '2026-04-30', 'FRAIS TENUE DE COMPTE', 0.95, 0),
    ]
    si = -1250.40
    td = round(sum(r[3] for r in rows), 2)
    tc = round(sum(r[4] for r in rows), 2)
    sf = round(si - td + tc, 2)
    H = 842

    def txt(font, size, x, top, s, right=False, kern=False):
        b = wb(s)
        w = sum(width('F1' if font == 'F1' else 'F2', ch) for ch in s) * size / 1000
        x0 = x - w if right else x
        y = H - top - size * 0.75
        if kern and ' ' in s:
            # mots séparés par un crénage au lieu d'une espace
            parts = s.split(' ')
            arr = ' -333 '.join('(' + esc(wb(p)).decode('latin-1') + ')' for p in parts)
            return f'BT /{font} {size} Tf 1 0 0 1 {x0:.2f} {y:.2f} Tm [{arr}] TJ ET'
        return f'BT /{font} {size} Tf 1 0 0 1 {x0:.2f} {y:.2f} Tm (' + esc(b).decode('latin-1') + ') Tj ET'

    s = ['0.5 w 30 772 m 565 772 l S']
    s.append(txt('F2', 10, 40, 40, 'BANQUE FICTIVE - AGENCE DEMO'))
    s.append(txt('F2', 14, 40, 60, 'RELEVÉ DE COMPTE COURANT'))
    s.append(txt('F1', 9, 40, 80, 'Période du ' + fdate('2026-04-01') + ' au ' + fdate('2026-04-30')))
    s.append(txt('F1', 9, 330, 80, 'Compte n° 99999 00000 00000000099'))
    s.append(txt('F2', 9, 40, 110, 'Date'))
    s.append(txt('F2', 9, 85, 110, 'Valeur'))
    s.append(txt('F2', 9, 130, 110, 'Libellé'))
    s.append(txt('F2', 9, 470, 110, 'Débit', True))
    s.append(txt('F2', 9, 550, 110, 'Crédit', True))
    top = 126
    s.append(txt('F2', 9, 130, top, 'ANCIEN SOLDE DEBITEUR AU 31/03/2026', kern=True))
    s.append(txt('F2', 9, 470, top, fr(-si, '.'), True))
    for d, v, lib, deb, cre in rows:
        top += 14
        s.append(txt('F1', 9, 40, top, fdate(d, True)))
        s.append(txt('F1', 9, 85, top, fdate(v, True)))
        s.append(txt('F1', 9, 130, top, lib, kern=True))
        if deb:
            s.append(txt('F1', 9, 470, top, fr(deb, '.'), True))
        if cre:
            s.append(txt('F1', 9, 550, top, fr(cre, '.'), True))
    top += 20
    s.append(txt('F2', 9, 130, top, 'TOTAL DES OPERATIONS', kern=True))
    s.append(txt('F2', 9, 470, top, fr(td, '.'), True))
    s.append(txt('F2', 9, 550, top, fr(tc, '.'), True))
    top += 14
    s.append(txt('F2', 9, 130, top, 'NOUVEAU SOLDE CREDITEUR AU 30/04/2026', kern=True))
    s.append(txt('F2', 9, 550, top, fr(sf, '.'), True))
    s.append(txt('F1', 8, 500, 810, 'Page 1/1'))
    content = '\n'.join(s).encode('latin-1')
    objs = [
        (1, b'<< /Type /Catalog /Pages 2 0 R >>'),
        (2, b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
        (3, b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>'),
        (4, stream(content, compress=False)),
        (5, b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
        (6, b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
    ]
    write_pdf(os.path.join(OUTDIR, 'releve-banque.pdf'), objs, 1)
    return {'du': '2026-04-01', 'au': '2026-04-30', 'compte': '99999 00000 00000000099', 'soldeInitial': si, 'soldeFinal': sf,
            'totals': {'debit': td, 'credit': tc}, 'ops': [{'date': d, 'lib': lib, 'debit': deb, 'credit': cre} for d, v, lib, deb, cre in rows]}


exp = {'releve-acd.pdf': acd(), 'releve-banque.pdf': banque()}
with open(os.path.join(OUTDIR, 'releve-attendu.json'), 'w', encoding='utf-8') as f:
    json.dump(exp, f, ensure_ascii=False, indent=1)
for k, v in exp.items():
    print(k, len(v['ops']), 'opérations', v['totals'], 'solde final', v['soldeFinal'])
