# Grand livre fournisseurs non lettré (données entièrement inventées), mise en page de l'édition « Grands-livres » :
# en-tête de dossier, « Compte <code> <nom> » répété en haut de page, colonnes Date / Pièce / Jnl / Libellé / Débit /
# Crédit / Solde (montant puis solde progressif en fin de ligne), libellé sur deux lignes, à-nouveau citant sa date et son
# journal d'origine (« 15/12/2025 -AC- »), écriture d'un journal ni d'achat ni de règlement (EI), totaux et pieds de page.
#   python3 genlettrage.py [dossier de sortie]   → grand-livre.pdf, grand-livre.txt et attendu.json
#   - FALPHA : à-nouveau 1 200 réglé le 15/01, factures 800 + 450 réglées ensemble le 20/02 (plus anciennes d'abord),
#     facture de mars ouverte ;
#   - FBETA (sur deux pages) : factures 1 000 et 2 500, LCR de 2 500 (montant identique), facture de 600 sur deux lignes,
#     écart EI ignoré ;
#   - FGAMMA : une facture, aucun lettrage possible ;
#   - C0001 (client) : facture de 900 payée en trois fois (300, 250, 350) alors qu'une facture plus ancienne de 500 reste
#     impayée (le cumul des plus anciennes ne tombe jamais juste) ;
#   - FEPS : un virement de 500 règle deux factures (200 et 300), une facture plus ancienne de 1 000 restant ouverte.
import sys, os, json

OUTDIR = sys.argv[1] if len(sys.argv) > 1 else '.'
H = 842


def fr(c):
    s = f'{abs(c) / 100:,.2f}'.replace(',', '#').replace('.', ',').replace('#', ' ')
    return ('-' if c < 0 else '') + s


def esc(s):
    return s.encode('cp1252').replace(b'\\', b'\\\\').replace(b'(', b'\\(').replace(b')', b'\\)').decode('latin-1')


def txt(x, top, s, size=8, right=False, bold=False):
    x0 = x - len(s) * size * 0.5 if right else x
    return f'BT /{"F2" if bold else "F1"} {size} Tf 1 0 0 1 {x0:.2f} {H - top:.2f} Tm ({esc(s)}) Tj ET'


# Écritures : (date, pièce, journal, libellé (une ou deux lignes), montant en centimes, sens)
ACCOUNTS = [
    ('FALPHA', 'FOURNISSEUR ALPHA', [
        ('01/01/2026', 'AN', 'AN', ['15/12/2025 -AC- FOURNISSEUR ALPHA F-901'], 120000, 'C'),
        ('10/01/2026', 'B0001', 'AC', ['FOURNISSEUR ALPHA F-1001'], 80000, 'C'),
        ('15/01/2026', 'R0001', 'BQ', ['VIR FOURNISSEUR ALPHA F-901'], 120000, 'D'),
        ('10/02/2026', 'B0002', 'AC', ['FOURNISSEUR ALPHA F-1002'], 45000, 'C'),
        ('20/02/2026', 'R0002', 'BQ', ['VIR FOURNISSEUR ALPHA F-1001 F-1002'], 125000, 'D'),
        ('10/03/2026', 'B0003', 'AC', ['FOURNISSEUR ALPHA F-1003'], 30000, 'C'),
    ]),
    ('FBETA', 'FOURNISSEUR BETA', [
        ('05/01/2026', 'B0004', 'AC', ['FOURNISSEUR BETA F-77'], 100000, 'C'),
        ('08/01/2026', 'B0005', 'AC', ['FOURNISSEUR BETA F-78'], 250000, 'C'),
        ('12/02/2026', 'R0003', 'LCR', ['LCR FOURNISSEUR BETA F-78'], 250000, 'D'),
        ('20/02/2026', 'B0006', 'AC', ['FOURNISSEUR BETA F-79 ENTRETIEN', 'MATERIEL DE CUISINE'], 60000, 'C'),
        ('25/02/2026', 'OD0001', 'EI', ['ECART DE CONVERSION'], 50, 'C'),
    ]),
    ('FGAMMA', 'FOURNISSEUR GAMMA', [
        ('03/03/2026', 'B0007', 'AC', ['FOURNISSEUR GAMMA F-5'], 9990, 'C'),
    ]),
    ('C0001', 'CLIENT DELTA', [
        ('05/01/2026', 'V0001', 'VT', ['CLIENT DELTA FACTURE 2026-010'], 50000, 'D'),
        ('10/01/2026', 'V0002', 'VT', ['CLIENT DELTA FACTURE 2026-011'], 90000, 'D'),
        ('15/01/2026', 'R0010', 'BQ', ['VIR CLIENT DELTA ACOMPTE 2026-011'], 30000, 'C'),
        ('05/02/2026', 'R0011', 'BQ', ['VIR CLIENT DELTA 2026-011'], 25000, 'C'),
        ('05/03/2026', 'R0012', 'BQ', ['CHQ CLIENT DELTA SOLDE 2026-011'], 35000, 'C'),
    ]),
    ('FEPS', 'FOURNISSEUR EPSILON', [
        ('02/01/2026', 'B0010', 'AC', ['FOURNISSEUR EPSILON F-300'], 100000, 'C'),
        ('01/02/2026', 'B0011', 'AC', ['FOURNISSEUR EPSILON F-301'], 20000, 'C'),
        ('03/02/2026', 'B0012', 'AC', ['FOURNISSEUR EPSILON F-302'], 30000, 'C'),
        ('10/02/2026', 'R0013', 'BQ', ['VIR FOURNISSEUR EPSILON F-301 F-302'], 50000, 'D'),
    ]),
]
PAGE_BREAK_AFTER = ('FBETA', 3)  # le compte FBETA continue sur la page 2 après sa 3e écriture

pages, text_lines = [], []
cur, top, page_no = [], 0, 0


def header():
    global cur, top, page_no
    page_no += 1
    cur = []
    top = 40
    for s, x, b in (('123456 - DOSSIER DEMO', 40, True), ('Grands-livres', 260, True), ('Edition provisoire', 470, False)):
        cur.append(txt(x, top, s, 9, bold=b))
    text_lines.extend(['123456 - DOSSIER DEMO Grands-livres Edition provisoire'])
    top += 14
    cur.append(txt(40, top, 'Du 01/01/2026 au 31/12/2026'))
    text_lines.append('Du 01/01/2026 au 31/12/2026')
    top += 16
    for s, x, r in (('Date', 40, False), ('Pièce', 90, False), ('Jnl', 140, False), ('Libellé', 170, False), ('Débit', 430, True), ('Crédit', 490, True), ('Solde', 555, True)):
        cur.append(txt(x, top, s, 8, right=r, bold=True))
    text_lines.append('Date Pièce Jnl Libellé Débit Crédit Solde')
    top += 14


def footer():
    cur.append(txt(480, 815, f'Page - {page_no}'))
    text_lines.append(f'Page - {page_no}')
    pages.append('\n'.join(cur).encode('latin-1'))


header()
for code, name, lines in ACCOUNTS:
    cur.append(txt(40, top, f'Compte {code} {name}', 9, bold=True))
    text_lines.append(f'Compte {code} {name}')
    top += 14
    bal = 0
    for k, (date, piece, jnl, labels, amt, side) in enumerate(lines):
        bal += amt if side == 'D' else -amt
        for li, lab in enumerate(labels):
            last = li == len(labels) - 1
            row = []
            if li == 0:
                row += [txt(40, top, date), txt(90, top, piece), txt(140, top, jnl)]
            row.append(txt(170, top, lab))
            t = (f'{date} {piece} {jnl} ' if li == 0 else '') + lab
            if last:
                row.append(txt(430 if side == 'D' else 490, top, fr(amt), right=True))
                row.append(txt(555, top, fr(bal), right=True))
                t += f' {fr(amt)} {fr(bal)}'
            cur.extend(row)
            text_lines.append(t)
            top += 12
        if (code, k + 1) == PAGE_BREAK_AFTER:
            footer()
            header()
            cur.append(txt(40, top, f'Compte {code} {name}', 9, bold=True))
            text_lines.append(f'Compte {code} {name}')
            top += 14
    cur.append(txt(170, top, f'Total compte {code}', 8, bold=True))
    text_lines.append(f'Total compte {code}')
    top += 18
footer()

objs = [(1, b'<< /Type /Catalog /Pages 2 0 R >>'), (3, b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
        (4, b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')]
kids, num = [], 5
for c in pages:
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
with open(os.path.join(OUTDIR, 'grand-livre.pdf'), 'wb') as f:
    f.write(out)
with open(os.path.join(OUTDIR, 'grand-livre.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(text_lines) + '\n')
exp = {
    'accounts': 5, 'lines': 21, 'groups': 5, 'lettered': 14, 'amount': 6350.00, 'open': 6,
    'byAccount': {'FALPHA': {'groups': 2, 'open': 1, 'methods': ["Plus anciennes d'abord", "Plus anciennes d'abord"]},
                  'FBETA': {'groups': 1, 'open': 2, 'skipped': 1, 'methods': ['Montant identique']},
                  'FGAMMA': {'groups': 0, 'open': 1},
                  'C0001': {'groups': 1, 'open': 1, 'methods': ['Plusieurs règlements'], 'sizes': [4]},
                  'FEPS': {'groups': 1, 'open': 1, 'methods': ['Règlement de plusieurs factures'], 'sizes': [3]}},
}
with open(os.path.join(OUTDIR, 'attendu.json'), 'w', encoding='utf-8') as f:
    json.dump(exp, f, indent=1)
print('ok', len(pages), 'pages')
