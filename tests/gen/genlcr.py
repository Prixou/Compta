# Relevés d'effets à payer (LCR) et listing fournisseurs, données entièrement inventées, pour la page « Écritures LCR » :
#   python3 genlcr.py [dossier de sortie]   → releve-1001.pdf, releve-1002.pdf, releve-1003.pdf (Crédit Agricole),
#   releve-cic.pdf (CIC), listing-fournisseurs.csv, listing-autre.csv
#   - relevé 1001 (contrat 99887766, édité le 25/05/2026, réglé le 31/05/2026) : quatre effets dont un rejeté (R),
#     tireurs précédés d'un n° de tireur ; nombre et total conformes ;
#   - relevé 1002 (réglé le 15/06/2026, sur deux pages) : un tireur absent du listing (sans compte), un tireur trouvé
#     malgré la forme juridique (« ZETA GROUPE FRANCE ») ;
#   - relevé 1003 : total annoncé différent de la somme des effets (écart), tireur proche de deux comptes (à confirmer) ;
#   - relevé CIC 004512 (lettres de change, compte 12345 67890 00012345678) : colonnes séparées par des blancs, effet
#     « A VUE », effet refusé (montant dans la colonne des refus), ligne d'effet coupée en deux, n° de ligne en tête.
import sys, os

OUTDIR = sys.argv[1] if len(sys.argv) > 1 else '.'
H = 842


def fr(c):
    return f'{c / 100:,.2f}'.replace(',', '#').replace('.', ',').replace('#', ' ')


def esc(s):
    return s.encode('cp1252').replace(b'\\', b'\\\\').replace(b'(', b'\\(').replace(b')', b'\\)').decode('latin-1')


def txt(x, top, s, size=8, right=False, bold=False):
    x0 = x - len(s) * size * 0.5 if right else x
    return f'BT /{"F2" if bold else "F1"} {size} Tf 1 0 0 1 {x0:.2f} {H - top:.2f} Tm ({esc(s)}) Tj ET'


def pdf(pages):
    objs = [(1, b'<< /Type /Catalog /Pages 2 0 R >>'), (3, b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
            (4, b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')]
    kids, num = [], 5
    for c in pages:
        c = '\n'.join(c).encode('latin-1')
        kids.append(f'{num} 0 R')
        objs.append((num, f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {num + 1} 0 R >>'.encode()))
        objs.append((num + 1, f'<< /Length {len(c)} >>\nstream\n'.encode() + c + b'\nendstream'))
        num += 2
    objs.append((2, f'<< /Type /Pages /Kids [{" ".join(kids)}] /Count {len(pages)} >>'.encode()))
    objs.sort()
    out = bytearray(b'%PDF-1.4\n')
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
    return bytes(out)


# (n° tireur, tireur, n° d'effet, code, référence, échéance, montant en centimes, avis)
RELEVES = [
    ('1001', '25/05/2026', '31/05/2026', None, [
        ('100245', 'FOURNISSEUR ALPHA SAS', '00000101', '0', 'F-1001', '31/05/2026', 125000, 'P'),
        ('100311', 'BETA DISTRIBUTION', '00000102', '0', '', '31/05/2026', 48000, 'P'),
        ('100412', 'GAMMA SANTE', '00000103', '1', 'F-77', '31/05/2026', 9990, 'R'),
        ('100518', 'LABORATOIRES DELTA', '00000104', '0', 'F-500', '31/05/2026', 200000, 'P'),
    ]),
    ('1002', '10/06/2026', '15/06/2026', None, [
        ('100245', 'FOURNISSEUR ALPHA SAS', '00000201', '0', 'F-1010', '15/06/2026', 30000, 'P'),
        ('100620', 'EPSILON MEDICAL', '00000202', '2', '', '15/06/2026', 15000, 'P'),
        ('100733', 'ZETA GROUPE FRANCE', '00000203', '0', 'Z-9', '15/06/2026', 7550, 'P'),
    ] + [('100245', 'FOURNISSEUR ALPHA SAS', f'0000021{k}', '0', f'F-11{k}', '15/06/2026', 1000 * (k + 1), 'P') for k in range(10)]),
    ('1003', '20/06/2026', '30/06/2026', 100000, [
        ('100801', 'OMEGA SERVICES', '00000301', '0', 'O-12', '30/06/2026', 60000, 'P'),
        ('100518', 'LABORATOIRES DELTA', '00000302', '0', 'F-512', '30/06/2026', 39900, 'P'),
    ]),
]

for num, au, regl, wrong_total, effets in RELEVES:
    total = sum(e[6] for e in effets)
    pages, cur, top = [], [], 0

    def head(first):
        global cur, top
        cur, top = [], 40
        cur.append(txt(40, top, 'BANQUE DEMO - AGENCE CENTRE', 9, bold=True))
        top += 16
        cur.append(txt(40, top, f"RELEVÉ D'EFFETS A PAYER en EUR n° {num}", 11, bold=True))
        top += 16
        cur.append(txt(40, top, f'Situation AU {au}'))
        cur.append(txt(300, top, 'Client : SOCIETE DEMO'))
        top += 12
        cur.append(txt(40, top, 'Contrat n° 99887766'))
        cur.append(txt(300, top, f'Date de règlement : {regl}'))
        top += 20
        for s, x in (('N° tireur', 40), ('Tireur', 85), ('N° effet', 250), ('Code', 300), ('Référence', 330), ('Échéance', 400), ('Montant', 470), ('Avis', 520)):
            cur.append(txt(x, top, s, 8, bold=True))
        top += 14

    head(True)
    for k, (nt, nom, ne, code, ref, ech, c, avis) in enumerate(effets):
        if num == '1002' and k == 8:
            cur.append(txt(480, 815, 'Page 1 / 2'))
            pages.append(cur)
            head(False)
        cur += [txt(40, top, nt), txt(85, top, nom), txt(250, top, ne), txt(300, top, code)]
        if ref:
            cur.append(txt(330, top, ref))
        cur += [txt(400, top, ech), txt(505, top, fr(c), right=True), txt(522, top, avis)]
        top += 12
    top += 10
    cur.append(txt(40, top, f"Nombre d'effet(s) {len(effets)}", 9, bold=True))
    cur.append(txt(300, top, f'Total {fr(wrong_total or total)}', 9, bold=True))
    pages.append(cur)
    with open(os.path.join(OUTDIR, f'releve-{num}.pdf'), 'wb') as f:
        f.write(pdf(pages))

# Relevé de lettres de change (CIC)
cur, top = [], 40
cur.append(txt(40, top, 'RELEVE DE LETTRES DE CHANGE - DEMANDE D\'ACCORD DE PAIEMENT', 11, bold=True))
top += 18
cur.append(txt(40, top, 'LE : 05/07/2026'))
top += 12
cur += [txt(40, top, 'N° RELEVE 004512'), txt(300, top, 'DATE DE REGLEMENT : 10/07/2026')]
top += 12
cur.append(txt(40, top, 'NOMBRE DE LCR : 4'))
top += 16
cur += [txt(40, top, 'COMPTE A DEBITER', 8, bold=True), txt(200, top, 'DATE', 8, bold=True), txt(300, top, 'MONTANT', 8, bold=True)]
top += 12
cur += [txt(40, top, '12345 67890 00012345678'), txt(200, top, '10/07/2026'), txt(300, top, '2 345,60')]
top += 20
for s_, x in (('N°', 30), ('N° EFFET', 50), ('TIREUR', 110), ('REFERENCE', 260), ('CODE', 315), ('ECHEANCE', 345), ('MONTANT', 420), ('MONTANT REFUSE', 470)):
    cur.append(txt(x, top, s_, 7, bold=True))
top += 12
CIC = [('1', '0004512001', 'FOURNISSEUR ALPHA SAS', 'F-2001', 'A', '10/07/2026', 120000, 0),
       ('2', '0004512002', 'BETA DISTRIBUTION', '', 'B', 'A VUE', 48000, 0),
       ('3', '0004512003', 'GAMMA SANTE', 'F-88', '', '10/07/2026', 9990, 9990),
       ('4', '0004512004', 'LABORATOIRES DELTA', 'F-600', '', '10/07/2026', 56570, 0)]
for k, num, nom, ref, code, ech, c, refus in CIC:
    cur += [txt(30, top, k), txt(50, top, num), txt(110, top, nom)]
    if k == '4':  # ligne coupée : référence, échéance et montant sur la ligne suivante
        top += 10
    if ref:
        cur.append(txt(260, top, ref))
    if code:
        cur.append(txt(318, top, code))
    cur += [txt(345, top, ech), txt(455, top, fr(c), right=True)]
    if refus:
        cur.append(txt(520, top, fr(refus), right=True))
    top += 12
top += 8
cur.append(txt(40, top, 'DOMICILIATION : BANQUE DEMO - AGENCE CENTRE'))
top += 12
cur += [txt(40, top, 'TOTAL RELEVE', 9, bold=True), txt(455, top, fr(sum(e[6] for e in CIC)), 9, right=True, bold=True)]
with open(os.path.join(OUTDIR, 'releve-cic.pdf'), 'wb') as f:
    f.write(pdf([cur]))

with open(os.path.join(OUTDIR, 'listing-autre.csv'), 'w', encoding='utf-8') as f:
    f.write('Compte;Intitulé\nFAUTRE1;AUTRE FOURNISSEUR UN\nFAUTRE2;AUTRE FOURNISSEUR DEUX\n')

with open(os.path.join(OUTDIR, 'listing-fournisseurs.csv'), 'w', encoding='utf-8') as f:
    f.write('Compte;Intitulé\n')
    for code, lib in (('FALPHA', 'FOURNISSEUR ALPHA'), ('FBETA', 'BETA DISTRIBUTION'), ('FBETA2', 'BETA LOGISTIQUE'), ('FGAMMA', 'GAMMA SANTE'),
                      ('FDELTA', 'DELTA'), ('FZETA', 'ZETA'), ('FOMEGA', 'OMEGA SERVICES'), ('FOMEGA2', 'OMEGA SERVICES SUD'), ('FKAPPA', 'KAPPA CONSEIL')):
        f.write(f'{code};{lib}\n')
print('ok')
