# Rapprochement du FEC avec l'état des immobilisations (données entièrement inventées) : dossier fictif 700000007,
# exercice 2026, à-nouveaux au journal AN, achats au journal AC (fournisseur 401, TVA 44562), cession et dotations en OD.
#   - 700000007FEC20261231.txt : FEC ;
#   - etat-immobilisations.pdf : état des immobilisations du module immo (comptes « Compte n° », une ligne par fiche avec
#     début d'exercice / acquisitions / sorties / fin d'exercice, « Sous-total immobilisation », « comptabilité », « Ecart »,
#     totaux), sur deux pages (compte continué « (suite) »), zéros laissés en blanc sur la seconde page ;
#   - etat-immobilisations.txt : le même état en texte (à coller quand le PDF ne se lit pas).
# Cas prévus : facture ventilée sur deux fiches (2135), deux factures sur une fiche et une facture sans fiche (2154),
# facture sans fiche dont le montant figure sur une fiche d'un autre compte (2181 / 2183), cession rapprochée de sa sortie
# (2182), avoir sans sortie (2184), sortie du module sans écriture (205), amortissements (28) ignorés.
#   python3 genimmo.py [dossier de sortie]
import sys, os

OUTDIR = sys.argv[1] if len(sys.argv) > 1 else '.'
H = 842


def fr(c):
    """centimes → « 1 234,56 »"""
    s = f'{abs(c) / 100:,.2f}'.replace(',', ' ').replace('.', ',')
    return ('-' if c < 0 else '') + s


LIB = {'205000': 'LOGICIELS', '213500': 'AGENCEMENTS CONSTRUCTIONS', '215400': 'MATERIEL INDUSTRIEL', '218100': 'INSTALLATIONS GENERALES',
       '218200': 'MATERIEL DE TRANSPORT', '218300': 'MATERIEL DE BUREAU', '218400': 'MOBILIER', '281540': 'AMORT. MATERIEL INDUSTRIEL',
       '281820': 'AMORT. MATERIEL DE TRANSPORT', '101300': 'CAPITAL', '401000': 'FOURNISSEURS', '445620': 'TVA DEDUCTIBLE IMMO',
       '681120': 'DOTATIONS AMORT. IMMO CORP.', '512000': 'BANQUE'}
lines = []
num = [0]


def entry(jc, jl, date, piece, lib, rows, aux=('', '')):
    num[0] += 1
    for acc, d, c in rows:
        a = aux if acc == '401000' else ('', '')
        lines.append([jc, jl, str(num[0]), date, acc, LIB[acc], a[0], a[1], piece, date, lib, fr(d).replace(' ', ''), fr(c).replace(' ', ''), '', '', date, '', ''])


AN = {'205000': 450000, '213500': 5000000, '215400': 4000000, '218100': 2500000, '218200': 3000000, '218300': 800000, '218400': 500000}
entry('AN', 'A NOUVEAUX', '20260101', 'AN', 'A NOUVEAUX', [(a, v, 0) for a, v in AN.items()] + [('281540', 0, 1200000), ('281820', 0, 3000000),
      ('101300', 0, sum(AN.values()) - 4200000)])


def achat(date, piece, fourn, code, lib, acc, ht):
    tva = ht // 5
    entry('AC', 'ACHATS', date, piece, f'{fourn} - {lib}', [('401000', 0, ht + tva), (acc, ht, 0), ('445620', tva, 0)], (code, fourn))


achat('20260215', 'BF-2026-014', 'BATI FICTIF', 'FBATI', 'EXTENSION ATELIER', '213500', 1200000)
achat('20260310', 'OF-310', 'OUTILLAGE IMAGINAIRE', 'FOUTI', 'TOUR NUMERIQUE', '215400', 650000)
achat('20260402', 'PC-0402', 'PERCEUSES DE FICTION', 'FPERC', 'PERCEUSE A COLONNE', '215400', 120000)
achat('20260418', 'PC-0418', 'PERCEUSES DE FICTION', 'FPERC', 'SUPPORT ET ETAU', '215400', 80000)
achat('20260520', 'OF-520', 'OUTILLAGE IMAGINAIRE', 'FOUTI', 'FRAISEUSE', '215400', 340000)
achat('20260611', 'EL-611', 'ELEC INVENTEE', 'FELEC', 'TABLEAU ELECTRIQUE', '218100', 185000)
achat('20260704', 'IN-704', 'INFORMATIQUE FICTIVE', 'FINFO', 'ORDINATEUR PORTABLE', '218300', 129000)
entry('AC', 'ACHATS', '20260905', 'MB-AV12', 'MEUBLES DE FICTION - AVOIR', [('401000', 36000, 0), ('218400', 0, 30000), ('445620', 0, 6000)], ('FMEUB', 'MEUBLES DE FICTION'))
entry('OD', 'OPERATIONS DIVERSES', '20261015', 'CES-01', 'CESSION FOURGON', [('281820', 3000000, 0), ('218200', 0, 3000000)])
entry('OD', 'OPERATIONS DIVERSES', '20261231', 'DOT-2026', 'DOTATIONS AUX AMORTISSEMENTS', [('681120', 400000, 0), ('281540', 0, 400000)])

HEAD = 'JournalCode\tJournalLib\tEcritureNum\tEcritureDate\tCompteNum\tCompteLib\tCompAuxNum\tCompAuxLib\tPieceRef\tPieceDate\tEcritureLib\tDebit\tCredit\tEcritureLet\tDateLet\tValidDate\tMontantdevise\tIdevise'
with open(os.path.join(OUTDIR, '700000007FEC20261231.txt'), 'w', encoding='utf-8', newline='\r\n') as f:
    f.write('\n'.join([HEAD] + ['\t'.join(l) for l in lines]) + '\n')

# Comptabilité de chaque compte d'immobilisation (début, acquisitions, sorties, fin) d'après le FEC
compta = {}
for l in lines:
    a = l[4]
    if not a.startswith('2') or a.startswith('28'):
        continue
    d = int(round(float(l[11].replace(',', '.')) * 100)); c = int(round(float(l[12].replace(',', '.')) * 100))
    v = compta.setdefault(a, [0, 0, 0, 0])
    if l[0] == 'AN':
        v[0] += d - c
    else:
        v[1] += d; v[2] += c
for v in compta.values():
    v[3] = v[0] + v[1] - v[2]

# Fiches du module immo : (code, libellé, début, acquisitions, sorties)
FICHES = {
    '205000': [('L00001', 'LOGICIEL DE GESTION', 300000, 0, 0), ('L00002', 'ANCIEN LOGICIEL', 150000, 0, 150000)],
    '213500': [('C00001', 'BATIMENT ATELIER', 5000000, 0, 0), ('C26001', 'EXTENSION GROS OEUVRE', 0, 800000, 0), ('C26002', 'EXTENSION ELECTRICITE', 0, 400000, 0)],
    '215400': [('M00001', 'PRESSE HYDRAULIQUE', 4000000, 0, 0), ('M26001', 'TOUR NUMERIQUE', 0, 650000, 0), ('M26002', 'PERCEUSE A COLONNE EQUIPEE', 0, 200000, 0)],
    '218100': [('A00001', 'INSTALLATION ELECTRIQUE', 2500000, 0, 0)],
    '218200': [('V00001', 'FOURGON', 3000000, 0, 3000000)],
    '218300': [('B00001', 'POSTES INFORMATIQUES', 800000, 0, 0), ('B26001', 'ORDINATEUR PORTABLE', 0, 129000, 0), ('B26002', 'TABLEAU ELECTRIQUE', 0, 185000, 0)],
    '218400': [('F00001', 'MOBILIER DE BUREAU', 500000, 0, 0)],
}
ORDER = ['205000', '213500', '215400', '218100', '218200', '218300', '218400']


def sub(rows):
    s = [sum(r[i] for r in rows) for i in (2, 3, 4)]
    return s + [s[0] + s[1] - s[2]]


# Lignes de l'état : ('compte', numéro, libellé, suite) | ('fiche', code, libellé, [4 montants]) | ('tot', libellé, [4 montants])
items = []
grand_i, grand_c = [0, 0, 0, 0], [0, 0, 0, 0]
for a in ORDER:
    fs = FICHES[a]
    items.append(('compte', a + '0000', LIB[a], False))
    for code, lab, deb, acq, sor in fs:
        items.append(('fiche', code, lab, [deb, acq, sor, deb + acq - sor]))
    si, sc = sub(fs), compta[a]
    items += [('tot', 'Sous-total immobilisation', si), ('tot', 'comptabilité', sc), ('tot', 'Ecart', [x - y for x, y in zip(si, sc)])]
    grand_i = [x + y for x, y in zip(grand_i, si)]
    grand_c = [x + y for x, y in zip(grand_c, sc)]
items += [('tot', 'Total immobilisation', grand_i), ('tot', 'Total comptabilité', grand_c), ('tot', 'Ecart', [x - y for x, y in zip(grand_i, grand_c)])]
# Page 2 à partir de la troisième fiche du 218300 (compte continué)
cut = next(i for i, it in enumerate(items) if it[0] == 'fiche' and it[1] == 'B26001')
pages = [items[:cut], [('compte', '2183000000', LIB['218300'], True)] + items[cut:]]

HEADER = ['SAS ATELIER FICTIF', 'Etat des immobilisations', 'Exercice du 01/01/2026 au 31/12/2026']
txt_lines = list(HEADER)
for it in items:
    if it[0] == 'compte':
        txt_lines.append(f'Compte n° {it[1]} {it[2]}')
    elif it[0] == 'fiche':
        txt_lines.append(f'{it[1]} {it[2]} ' + ' '.join(fr(v) for v in it[3]))
    else:
        txt_lines.append(f'{it[1]} ' + ' '.join(fr(v) for v in it[2]))
with open(os.path.join(OUTDIR, 'etat-immobilisations.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(txt_lines) + '\n')


# ---------- PDF ----------
def esc(s):
    return s.encode('cp1252').replace(b'\\', b'\\\\').replace(b'(', b'\\(').replace(b')', b'\\)').decode('latin-1')


def txt(x, top, s, size=8, bold=False, right=False):
    w = len(s) * size * 0.5
    x0 = x - w if right else x
    return f'BT /{"F2" if bold else "F1"} {size} Tf 1 0 0 1 {x0:.2f} {H - top:.2f} Tm ({esc(s)}) Tj ET'


EDGES = [330, 410, 480, 555]


def page(its, n, blank_zero):
    s = [txt(40, 40, HEADER[0], 10, True), txt(40, 54, HEADER[1], 12, True), txt(40, 68, HEADER[2], 8),
         txt(555, 40, f'30/01/2027 - 10:15 Page {n}/2', 7, right=True)]
    for h, xr in zip(['Début', 'Acquisitions', 'Sorties', 'Fin'], EDGES):
        s.append(txt(xr, 92, h, 8, True, right=True))
    s.append(txt(40, 92, 'Code', 8, True)); s.append(txt(90, 92, 'Libellé', 8, True))
    top = 110
    for it in its:
        if it[0] == 'compte':
            top += 6
            s.append(txt(40, top, f'Compte n° {it[1]} {it[2]}' + (' (suite)' if it[3] else ''), 8, True))
        elif it[0] == 'fiche':
            s.append(txt(40, top, it[1], 8)); s.append(txt(90, top, it[2], 8))
            for v, xr in zip(it[3], EDGES):
                if v or not blank_zero:
                    s.append(txt(xr, top, fr(v), 8, right=True))
        else:
            s.append(txt(60, top, it[1], 8, True))
            for v, xr in zip(it[2], EDGES):
                s.append(txt(xr, top, fr(v), 8, True, right=True))
        top += 13
    return '\n'.join(s)


def write_pdf(path, contents):
    objs = [(1, b'<< /Type /Catalog /Pages 2 0 R >>')]
    kids, pgs, n = [], [], 5
    for c in contents:
        c = c.encode('latin-1')
        kids.append(f'{n} 0 R')
        pgs.append((n, f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {n + 1} 0 R >>'.encode()))
        pgs.append((n + 1, f'<< /Length {len(c)} >>\nstream\n'.encode() + c + b'\nendstream'))
        n += 2
    objs.append((2, f'<< /Type /Pages /Kids [{" ".join(kids)}] /Count {len(contents)} >>'.encode()))
    objs.append((3, b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'))
    objs.append((4, b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'))
    objs += pgs
    out = bytearray(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
    offs = {}
    for k, body in objs:
        offs[k] = len(out)
        out += f'{k} 0 obj\n'.encode() + body + b'\nendobj\n'
    xref = len(out)
    size = max(offs) + 1
    out += f'xref\n0 {size}\n0000000000 65535 f \n'.encode()
    for i in range(1, size):
        out += f'{offs[i]:010d} 00000 n \n'.encode()
    out += f'trailer\n<< /Size {size} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
    with open(path, 'wb') as f:
        f.write(out)


write_pdf(os.path.join(OUTDIR, 'etat-immobilisations.pdf'), [page(pages[0], 1, False), page(pages[1], 2, True)])
print('ok')
