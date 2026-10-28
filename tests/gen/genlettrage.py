# Grand livre fournisseurs non lettré (données entièrement inventées), mise en page de l'édition « Grands-livres » :
# en-tête de dossier, « Compte <code> <nom> » répété en haut de page, colonnes Date / Pièce / Jnl / Libellé / Débit /
# Crédit / Solde (montant puis solde progressif en fin de ligne), libellé sur deux lignes, à-nouveau citant sa date et son
# journal d'origine (« 15/12/2025 -AC- »), écriture d'un journal ni d'achat ni de règlement (EI), totaux et pieds de page.
#   python3 genlettrage.py [dossier de sortie]   → grand-livre.pdf, grand-livre.txt et attendu.json
#   - FALPHA : à-nouveau 1 200 réglé le 15/01, factures 800 + 450 réglées ensemble le 20/02, facture de mars ouverte ;
#   - FBETA (sur deux pages) : LCR de 2 500 (montant identique), facture de 600 sur deux lignes, écart EI ignoré, deux
#     factures de 75 le même jour (doublon de niveau 2) ;
#   - FGAMMA : règlement de 99,90 daté deux jours avant la facture (pas de lettrage : règlement sans facture, dans le
#     mail), facture saisie deux fois (doublon de niveau 1) ;
#   - C0001 (client) : facture de 9 000 payée en trois fois (3 000, 2 500, 3 500), facture de 500 impayée ; paiement de
#     120 deux jours avant la facture de 120 : pas de lettrage ;
#   - FEPS : virement de 500 pour deux factures de février (200 et 300) ; virement de 400 pour 150 + 250 à cinq jours
#     d'écart (pas de lettrage avec un écart maximal de 3 jours), facture plus ancienne de 1 000 ouverte ;
#   - FSIGMA : factures de 100 et 200 et relevé de 300 saisi en plus, réglés par un virement de 300 ;
#   - FTAU : factures 500 + 300 moins un avoir de 100 réglées par 700 ; avoir de 50 qui annule une facture de 50 ;
#   - FDELTA1 / FDELTA2 : règlement de 750 sur un compte, facture de 750 sur l'autre compte du même fournisseur
#     (hypothèse) ;
#   - FOMEGA : factures 380 + 500 ouvertes, payées par une LCR de 880 du compte d'attente FLCR (proposition unique) ; la
#     LCR de 999 ne correspond à aucun fournisseur ;
#   - FNC : virement de 300 pour les factures de 100 et 200, une facture de 950 entre les deux (lettré seulement si le
#     fournisseur est déclaré « à factures non consécutives ») ;
#   - FBNCDEMO : compte ignoré (« BNC »).
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


# Écritures : (date, journal, libellé (une ou deux lignes), montant en centimes, sens) ; pièces numérotées B000000001…
ACCOUNTS = [
    ('FALPHA', 'FOURNISSEUR ALPHA', [
        ('01/01/2026', 'AN', ['15/12/2025 -AC- FOURNISSEUR ALPHA F-901'], 120000, 'C'),
        ('10/01/2026', 'AC', ['FOURNISSEUR ALPHA F-1001'], 80000, 'C'),
        ('15/01/2026', 'BQ', ['VIR FOURNISSEUR ALPHA F-901'], 120000, 'D'),
        ('10/02/2026', 'AC', ['FOURNISSEUR ALPHA F-1002'], 45000, 'C'),
        ('20/02/2026', 'BQ', ['VIR FOURNISSEUR ALPHA F-1001 F-1002'], 125000, 'D'),
        ('10/03/2026', 'AC', ['FOURNISSEUR ALPHA F-1003'], 30000, 'C'),
    ]),
    ('FBETA', 'FOURNISSEUR BETA', [
        ('05/01/2026', 'AC', ['FOURNISSEUR BETA F-77'], 100000, 'C'),
        ('08/01/2026', 'AC', ['FOURNISSEUR BETA F-78'], 250000, 'C'),
        ('12/02/2026', 'LCR', ['LCR FOURNISSEUR BETA F-78'], 250000, 'D'),
        ('20/02/2026', 'AC', ['FOURNISSEUR BETA F-79 ENTRETIEN', 'MATERIEL DE CUISINE'], 60000, 'C'),
        ('25/02/2026', 'EI', ['ECART DE CONVERSION'], 50, 'C'),
        ('25/02/2026', 'AC', ['FOURNISSEUR BETA F-80'], 7500, 'C'),
        ('25/02/2026', 'AC', ['FOURNISSEUR BETA F-81'], 7500, 'C'),
    ]),
    ('FGAMMA', 'FOURNISSEUR GAMMA', [
        ('01/03/2026', 'BQ', ['VIR FOURNISSEUR GAMMA F-505'], 9990, 'D'),
        ('03/03/2026', 'AC', ['FOURNISSEUR GAMMA F-505'], 9990, 'C'),
        ('04/03/2026', 'AC', ['FOURNISSEUR GAMMA F-505'], 9990, 'C'),
    ]),
    ('C0001', 'CLIENT KAPPA', [
        ('05/01/2026', 'VT', ['CLIENT KAPPA FACTURE 2026-010'], 50000, 'D'),
        ('10/01/2026', 'VT', ['CLIENT KAPPA FACTURE 2026-011'], 900000, 'D'),
        ('15/01/2026', 'BQ', ['VIR CLIENT KAPPA ACOMPTE 2026-011'], 300000, 'C'),
        ('05/02/2026', 'BQ', ['VIR CLIENT KAPPA 2026-011'], 250000, 'C'),
        ('05/03/2026', 'BQ', ['CHQ CLIENT KAPPA SOLDE 2026-011'], 350000, 'C'),
        ('18/03/2026', 'BQ', ['VIR CLIENT KAPPA 2026-012'], 12000, 'C'),
        ('20/03/2026', 'VT', ['CLIENT KAPPA FACTURE 2026-012'], 12000, 'D'),
    ]),
    ('FEPS', 'FOURNISSEUR EPSILON', [
        ('02/01/2026', 'AC', ['FOURNISSEUR EPSILON F-300'], 100000, 'C'),
        ('01/02/2026', 'AC', ['FOURNISSEUR EPSILON F-301'], 20000, 'C'),
        ('03/02/2026', 'AC', ['FOURNISSEUR EPSILON F-302'], 30000, 'C'),
        ('10/02/2026', 'BQ', ['VIR FOURNISSEUR EPSILON F-301 F-302'], 50000, 'D'),
        ('25/02/2026', 'AC', ['FOURNISSEUR EPSILON F-303'], 15000, 'C'),
        ('02/03/2026', 'AC', ['FOURNISSEUR EPSILON F-304'], 25000, 'C'),
        ('10/03/2026', 'BQ', ['VIR FOURNISSEUR EPSILON'], 40000, 'D'),
    ]),
    ('FSIGMA', 'FOURNISSEUR SIGMA', [
        ('01/04/2026', 'AC', ['FOURNISSEUR SIGMA F-2001'], 10000, 'C'),
        ('05/04/2026', 'AC', ['FOURNISSEUR SIGMA F-2002'], 20000, 'C'),
        ('30/04/2026', 'AC', ['FOURNISSEUR SIGMA RELEVE AVRIL'], 30000, 'C'),
        ('10/05/2026', 'BQ', ['VIR FOURNISSEUR SIGMA'], 30000, 'D'),
    ]),
    ('FTAU', 'FOURNISSEUR TAU', [
        ('01/04/2026', 'AC', ['FOURNISSEUR TAU F-3001'], 50000, 'C'),
        ('10/04/2026', 'AC', ['FOURNISSEUR TAU F-3002'], 30000, 'C'),
        ('15/04/2026', 'AC', ['AVOIR FOURNISSEUR TAU F-3003'], 10000, 'D'),
        ('18/04/2026', 'AC', ['FOURNISSEUR TAU F-3004'], 5000, 'C'),
        ('20/04/2026', 'AC', ['AVOIR FOURNISSEUR TAU F-3005'], 5000, 'D'),
        ('30/04/2026', 'BQ', ['VIR FOURNISSEUR TAU'], 70000, 'D'),
    ]),
    ('FDELTA1', 'DELTA SANTE', [
        ('15/05/2026', 'BQ', ['VIR DELTA SANTE'], 75000, 'D'),
    ]),
    ('FDELTA2', 'DELTA SANTE GROUPE', [
        ('02/05/2026', 'AC', ['DELTA SANTE GROUPE F-4001'], 75000, 'C'),
    ]),
    ('FOMEGA', 'FOURNISSEUR OMEGA', [
        ('05/05/2026', 'AC', ['FOURNISSEUR OMEGA F-7001'], 38000, 'C'),
        ('12/05/2026', 'AC', ['FOURNISSEUR OMEGA F-7002'], 50000, 'C'),
    ]),
    ('FLCR', 'LCR A AFFECTER', [
        ('20/05/2026', 'BQ', ['LCR ECHEANCE MAI'], 88000, 'D'),
        ('21/05/2026', 'BQ', ['LCR ECHEANCE MAI'], 99900, 'D'),
    ]),
    ('FNC', 'FOURNISSEUR NONSUITE', [
        ('01/06/2026', 'AC', ['FOURNISSEUR NONSUITE F-5001'], 10000, 'C'),
        ('03/06/2026', 'AC', ['FOURNISSEUR NONSUITE F-5002'], 95000, 'C'),
        ('05/06/2026', 'AC', ['FOURNISSEUR NONSUITE F-5003'], 20000, 'C'),
        ('10/06/2026', 'BQ', ['VIR FOURNISSEUR NONSUITE'], 30000, 'D'),
    ]),
    ('FBNCDEMO', 'ASSOCIE DEMO', [
        ('10/06/2026', 'AC', ['HONORAIRES ASSOCIE DEMO F-9001'], 10000, 'C'),
    ]),
]
PAGE_BREAK_AFTER = ('FBETA', 3)  # le compte FBETA continue sur la page 2 après sa 3e écriture

pages, text_lines = [], []
PIECES = iter(range(1, 1000))
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
    for s, x, r in (('Date', 40, False), ('Pièce', 90, False), ('Jnl', 145, False), ('Libellé', 178, False), ('Débit', 430, True), ('Crédit', 490, True), ('Solde', 555, True)):
        cur.append(txt(x, top, s, 8, right=r, bold=True))
    text_lines.append('Date Pièce Jnl Libellé Débit Crédit Solde')
    top += 14


def footer():
    cur.append(txt(480, 815, f'Page - {page_no}'))
    text_lines.append(f'Page - {page_no}')
    pages.append('\n'.join(cur).encode('latin-1'))


header()
for code, name, lines in ACCOUNTS:
    if top > 740:
        footer()
        header()
    cur.append(txt(40, top, f'Compte {code} {name}', 9, bold=True))
    text_lines.append(f'Compte {code} {name}')
    top += 14
    bal = 0
    for k, (date, jnl, labels, amt, side) in enumerate(lines):
        piece = 'AN' if jnl == 'AN' else f'B{next(PIECES):09d}'
        if top > 770:  # page pleine : le compte continue sur la page suivante
            footer()
            header()
            cur.append(txt(40, top, f'Compte {code} {name}', 9, bold=True))
            text_lines.append(f'Compte {code} {name}')
            top += 14
        bal += amt if side == 'D' else -amt
        for li, lab in enumerate(labels):
            last = li == len(labels) - 1
            row = []
            if li == 0:
                row += [txt(40, top, date), txt(90, top, piece), txt(145, top, jnl)]
            row.append(txt(178, top, lab))
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
R1, R2 = '1 règlement ↔ 1 facture', '1 règlement ↔ 2 factures'
exp = {
    'accounts': 11, 'lines': 48, 'groups': 9, 'lettered': 27, 'amount': 16000.00, 'open': 20, 'shownHidden': 6, 'ignored': 1,
    'byAccount': {'FALPHA': {'groups': 2, 'open': 1, 'methods': [R1, R2]},
                  'FBETA': {'groups': 1, 'open': 4, 'skipped': 1, 'methods': [R1]},
                  'FGAMMA': {'groups': 0, 'open': 3},
                  'C0001': {'groups': 1, 'open': 3, 'methods': ['1 facture ↔ 3 règlements'], 'sizes': [4]},
                  'FEPS': {'groups': 2, 'open': 1, 'methods': [R2, R2]},
                  'FSIGMA': {'groups': 1, 'open': 0, 'methods': ['relevé + 2 factures ↔ 1 règlement (écart de 300,00 €)'], 'sizes': [4]},
                  'FTAU': {'groups': 2, 'open': 0, 'methods': ['2 factures + 1 avoir ↔ 1 règlement', '1 avoir ↔ 1 facture'], 'sizes': [4, 2]},
                  'FDELTA1': {'groups': 0, 'open': 1}, 'FDELTA2': {'groups': 0, 'open': 1},
                  'FOMEGA': {'groups': 0, 'open': 2}, 'FNC': {'groups': 0, 'open': 4}},
    'hyp': [['FDELTA1', 'FDELTA2', 750.00]],
    'dups': [[1, ['FGAMMA', 'FGAMMA']], [2, ['FBETA', 'FBETA']]],
    'lcr': [[880.00, ['FOMEGA']], [999.00, []]],
    'mail': ['FOURNISSEUR GAMMA - 01/03/2026 - facture manquante (règlement de 99,90 €)',
             'FOURNISSEUR NONSUITE - 10/06/2026 - facture manquante (règlement de 300,00 €)'],
}
with open(os.path.join(OUTDIR, 'attendu.json'), 'w', encoding='utf-8') as f:
    json.dump(exp, f, indent=1)
print('ok', len(pages), 'pages')
