# Rapprochement d'un relevé et du journal de banque (données entièrement inventées) : octobre 2025.
#   - journal-banque-900000011FEC20251031.txt : FEC limité au journal de banque (BQ) du mois, présentation ACD
#     (51200000, collectifs 40100000 / 41100000 et comptes auxiliaires, charges et produits), sans à-nouveaux ;
#   - releve-octobre-2025.csv (Date ; Libellé ; Débit ; Crédit) et releve-octobre-2025.ofx (avec solde de fin) ;
#   - rappro-attendu.json : différences attendues.
# Différences connues : 3 opérations non comptabilisées, 2 écritures absentes du relevé (chèque non encaissé, remise
# en cours), un montant aux chiffres inversés, un montant différent, un sens inversé, un doublon, une remise de chèques
# comptabilisée chèque par chèque, et des écritures datées un ou deux jours avant le relevé.
#   python3 genrappro.py [dossier de sortie]
import sys, os, json

OUTDIR = sys.argv[1] if len(sys.argv) > 1 else '.'
H = ['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate',
     'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise']
CPT = {'601': ('60100000', 'Achats matières'), '606': ('60610000', 'Energie'), '6064': ('60640000', 'Fournitures administratives'),
       '613': ('61320000', 'Locations immobilières'), '616': ('61600000', 'Primes d\'assurance'), '625': ('62510000', 'Voyages et déplacements'),
       '6278': ('62780000', 'Frais bancaires'), '641': ('42100000', 'Personnel - rémunérations dues'), '445': ('44551000', 'TVA à décaisser'),
       '706': ('70600000', 'Prestations de services'), '6061': ('60611000', 'Carburant')}
SUP = {'ENERGIE': ('FENERGI', 'ENERGIE DU SUD'), 'BETA': ('FBETA', 'FOURNISSEUR BETA'), 'BAIL': ('FBAIL', 'SCI DU PARC')}
CLI = {'ALPHA': ('CALPHA', 'CLIENT ALPHA'), 'GAMMA': ('CGAMMA', 'CLIENT GAMMA'), 'DELTA': ('CDELTA', 'CLIENT DELTA')}

# Opérations : (date relevé, libellé relevé, montant relevé (+ crédit), date compta, libellé compta, montant compta, contrepartie)
# montant relevé None : absente du relevé ; date compta None : non comptabilisée.
ops = [
    ('2025-10-01', 'PRLV SEPA SCI DU PARC LOYER OCTOBRE', -1350.00, '2025-10-01', 'Loyer octobre SCI DU PARC', -1350.00, ('401', 'BAIL')),
    ('2025-10-02', 'VIR SEPA CLIENT ALPHA FACT F2025-101', 2400.00, '2025-10-02', 'Règlement CLIENT ALPHA F2025-101', 2400.00, ('411', 'ALPHA')),
    ('2025-10-03', 'CB STATION SERVICE NIMES', -62.40, '2025-10-03', 'Carburant', -62.40, ('6061', None)),
    ('2025-10-05', 'VIR SEPA CLIENT GAMMA', 800.00, '2025-10-05', 'Règlement CLIENT GAMMA', 800.00, ('411', 'GAMMA')),
    ('2025-10-07', 'CB PAPETERIE CENTRALE', -45.90, '2025-10-06', 'Fournitures bureau', -45.90, ('6064', None)),
    ('2025-10-08', 'CB STATION SERVICE NIMES', -62.40, '2025-10-08', 'CB STATION SERVICE NIMES', -62.40, ('6061', None)),
    ('2025-10-09', 'VIR SALAIRE SEPTEMBRE', -2150.00, '2025-10-09', 'Salaire septembre', -2150.00, ('641', None)),
    ('2025-10-10', 'VIR SEPA CLIENT DELTA FACT F2025-098', 1750.00, '2025-10-10', 'Règlement CLIENT DELTA F2025-098', 1750.00, ('411', 'DELTA')),
    ('2025-10-12', 'PRLV SEPA ENERGIE DU SUD', -1243.50, '2025-10-12', 'PRLV ENERGIE DU SUD', -1234.50, ('401', 'ENERGIE')),
    ('2025-10-14', 'CB HOTEL DU CENTRE LYON', -118.00, '2025-10-13', 'Hôtel déplacement Lyon', -118.00, ('625', None)),
    ('2025-10-15', 'PRLV SEPA ASSUR PRO CONTRAT 4521', -145.20, None, None, None, None),
    ('2025-10-16', 'VIR SEPA FOURNISSEUR BETA', -560.00, '2025-10-16', 'VIR FOURNISSEUR BETA', -565.00, ('401', 'BETA')),
    ('2025-10-17', 'REMBOURSEMENT TROP PERCU ENERGIE DU SUD', 89.90, '2025-10-17', 'Remboursement ENERGIE DU SUD', -89.90, ('401', 'ENERGIE')),
    ('2025-10-20', 'PRLV DGFIP TVA SEPTEMBRE', -1830.00, '2025-10-20', 'TVA septembre', -1830.00, ('445', None)),
    ('2025-10-22', 'VIR SEPA CLIENT ALPHA FACT F2025-110', 3120.00, '2025-10-21', 'Règlement CLIENT ALPHA F2025-110', 3120.00, ('411', 'ALPHA')),
    ('2025-10-24', 'CB RESTAURANT LE MARCHE', -38.50, '2025-10-24', 'Repas d\'affaires', -38.50, ('625', None)),
    ('2025-10-25', None, None, '2025-10-25', 'CHQ 1234567 FOURNISSEUR BETA', -450.00, ('401', 'BETA')),
    ('2025-10-27', 'PRLV SEPA FOURNISSEUR BETA ECHEANCE', -980.00, '2025-10-27', 'Échéance FOURNISSEUR BETA', -980.00, ('401', 'BETA')),
    ('2025-10-28', 'VIR SEPA CLIENT GAMMA', 1200.00, None, None, None, None),
    ('2025-10-30', None, None, '2025-10-30', 'REMISE CHEQUES 0001240', 380.00, ('706', None)),
    ('2025-10-31', 'FRAIS TENUE DE COMPTE', -12.50, None, None, None, None),
]
# Doublon : la station du 08/10 passée deux fois ; remise de chèques du 18/10 comptabilisée chèque par chèque
dup = ('2025-10-08', 'CB STATION SERVICE NIMES', -62.40, ('6061', None))
remise = ('2025-10-18', 'REMISE CHEQUES 0001239', 900.00, [('CLIENT ALPHA', 300.00, 'ALPHA'), ('CLIENT DELTA', 250.00, 'DELTA'), ('CLIENT GAMMA', 350.00, 'GAMMA')])

rows, n = [], 0


def fmt(v):
    return f'{v:.2f}'.replace('.', ',')


def entry(date, lib, lines):
    global n
    n += 1
    d = date.replace('-', '')
    for compte, clib, aux, auxl, deb, cre in lines:
        rows.append(['BQ', 'Banque', str(n), d, compte, clib, aux, auxl, f'BQ{n:04d}', d, lib, fmt(deb), fmt(cre), '', '', d, '', ''])


def counter(cp, amount):
    k, t = cp
    if k in ('401', '411'):
        code, name = (SUP if k == '401' else CLI)[t]
        compte, clib = ('40100000', 'Fournisseurs') if k == '401' else ('41100000', 'Clients')
        return (compte, clib, code, name)
    compte, clib = CPT[k]
    return (compte, clib, '', '')


booked = []
for dr, lr, ar, dc, lc, ac, cp in ops:
    if dc is None:
        continue
    compte, clib, aux, auxl = counter(cp, ac)
    entry(dc, lc, [('51200000', 'BANQUE EXEMPLE', '', '', max(ac, 0), max(-ac, 0)), (compte, clib, aux, auxl, max(-ac, 0), max(ac, 0))])
    booked.append(ac)
d0, l0, a0, cp0 = dup
compte, clib, aux, auxl = counter(cp0, a0)
entry(d0, l0, [('51200000', 'BANQUE EXEMPLE', '', '', 0, -a0), (compte, clib, aux, auxl, -a0, 0)])
booked.append(a0)
lines = []
for name, amt, key in remise[3]:
    code, cname = CLI[key]
    lines.append(('51200000', 'BANQUE EXEMPLE', '', '', amt, 0))
    lines.append(('41100000', 'Clients', code, cname, 0, amt))
    booked.append(amt)
entry(remise[0], 'Remise de chèques 0001239', lines)
rows.sort(key=lambda r: (r[3], int(r[2])))

stmt = [(dr, lr, ar) for dr, lr, ar, *_ in ops if ar is not None] + [(remise[0], remise[1], remise[2])]
stmt.sort(key=lambda x: x[0])
opening = 10000.00
closing = round(opening + sum(a for _, _, a in stmt), 2)
compta = round(opening + sum(booked), 2)

with open(os.path.join(OUTDIR, 'journal-banque-900000011FEC20251031.txt'), 'w', encoding='utf-8', newline='') as f:
    f.write('\t'.join(H) + '\r\n')
    for r in rows:
        f.write('\t'.join(r) + '\r\n')
with open(os.path.join(OUTDIR, 'releve-octobre-2025.csv'), 'w', encoding='utf-8', newline='') as f:
    f.write('Date;Libellé;Débit;Crédit\r\n')
    for d, l, a in stmt:
        dd = '/'.join(reversed(d.split('-')))
        f.write(f'{dd};{l};{fmt(-a) if a < 0 else ""};{fmt(a) if a > 0 else ""}\r\n')
with open(os.path.join(OUTDIR, 'releve-octobre-2025.ofx'), 'w', encoding='utf-8', newline='') as f:
    f.write('OFXHEADER:100\r\nDATA:OFXSGML\r\nVERSION:102\r\n\r\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>EUR<BANKACCTFROM><BANKID>99999<ACCTID>00000000099</BANKACCTFROM><BANKTRANLIST><DTSTART>20251001<DTEND>20251031\r\n')
    for i, (d, l, a) in enumerate(stmt):
        f.write(f'<STMTTRN><TRNTYPE>{"CREDIT" if a > 0 else "DEBIT"}<DTPOSTED>{d.replace("-", "")}<TRNAMT>{a:.2f}<FITID>OCT{i:03d}<NAME>{l}</STMTTRN>\r\n')
    f.write(f'</BANKTRANLIST><LEDGERBAL><BALAMT>{closing:.2f}<DTASOF>20251031</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>\r\n')

# Relevé PDF au format courant des banques : dates sans année (« 01.10 »), date de valeur, libellés sur deux lignes,
# en-têtes « Date opé. / Date valeur / Libellé de l'opération / Débit (€) / Crédit (€) », période en toutes lettres, deux pages
# (« A reporter » / « Report »), ancien et nouveau solde datés.
def pdf_statement(path):
    W = {c: 556 for c in '0123456789'}
    W.update({' ': 278, ',': 278, '.': 278, '-': 333})
    def esc(t):
        return t.encode('cp1252').replace(b'\\', b'\\\\').replace(b'(', b'\\(').replace(b')', b'\\)').decode('latin-1')
    def txt(x, top, t, size=9, bold=False, right=False):
        w = sum(W.get(ch, 556) for ch in t) * size / 1000
        x0 = x - w if right else x
        return f'BT /{"F2" if bold else "F1"} {size} Tf 1 0 0 1 {x0:.2f} {842 - top - size * 0.75:.2f} Tm ({esc(t)}) Tj ET'
    def money(v):
        return f'{abs(v):,.2f}'.replace(',', ' ').replace('.', ',')
    def head(top):
        return [txt(40, top, 'Date opé.', 8, True), txt(80, top, 'Date valeur', 8, True), txt(135, top, "Libellé de l'opération", 8, True),
                txt(470, top, 'Débit (€)', 8, True, True), txt(550, top, 'Crédit (€)', 8, True, True)]
    pages, ops_left = [], list(stmt)
    deb_t = sum(-a for _, _, a in stmt if a < 0); cre_t = sum(a for _, _, a in stmt if a > 0)
    run_d = run_c = 0
    for pn in (1, 2):
        s = [txt(40, 40, 'BANQUE FICTIVE - AGENCE DE DEMO', 10, True), txt(40, 58, 'EXTRAIT DE COMPTE', 13, True),
             txt(40, 76, 'Relevé du 1er octobre 2025 au 31 octobre 2025'), txt(330, 76, 'Compte n° 99999 00000 00000000099')]
        s += head(104)
        top = 120
        if pn == 1:
            s += [txt(135, top, 'SOLDE CREDITEUR AU 30.09.2025', 9, True), txt(550, top, money(opening), 9, True, True)]
        else:
            s += [txt(135, top, 'REPORT', 9, True), txt(470, top, money(run_d), 9, True, True), txt(550, top, money(run_c), 9, True, True)]
        chunk = ops_left[:12] if pn == 1 else ops_left
        ops_left = ops_left[12:]
        for d, l, a in chunk:
            top += 14
            dd = d[8:10] + '.' + d[5:7]
            cut = l.rfind(' ', 0, 30) if len(l) > 30 else -1
            parts = [l[:cut], l[cut + 1:]] if cut > 0 else [l]
            s += [txt(40, top, dd), txt(80, top, dd), txt(135, top, parts[0])]
            s.append(txt(470 if a < 0 else 550, top, money(a), 9, False, True))
            if len(parts) > 1 and parts[1].strip():
                top += 11
                s.append(txt(135, top, parts[1].strip()))
            if a < 0: run_d += -a
            else: run_c += a
        top += 18
        if pn == 1:
            s += [txt(135, top, 'A REPORTER', 9, True), txt(470, top, money(run_d), 9, True, True), txt(550, top, money(run_c), 9, True, True)]
        else:
            s += [txt(135, top, 'TOTAL DES MOUVEMENTS', 9, True), txt(470, top, money(deb_t), 9, True, True), txt(550, top, money(cre_t), 9, True, True)]
            top += 14
            s += [txt(135, top, 'NOUVEAU SOLDE CREDITEUR AU 31.10.2025', 9, True), txt(550, top, money(closing), 9, True, True)]
        s.append(txt(500, 810, f'Page {pn}/2', 8))
        pages.append('\n'.join(s).encode('latin-1'))
    objs = {1: b'<< /Type /Catalog /Pages 2 0 R >>', 2: b'<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
            5: b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
            6: b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'}
    for i, content in enumerate(pages):
        objs[3 + i] = f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents {7 + i} 0 R >>'.encode()
        objs[7 + i] = f'<< /Length {len(content)} >>\nstream\n'.encode() + content + b'\nendstream'
    out = bytearray(b'%PDF-1.4\n')
    offs = {}
    for k in sorted(objs):
        offs[k] = len(out)
        out += f'{k} 0 obj\n'.encode() + objs[k] + b'\nendobj\n'
    x = len(out)
    out += f'xref\n0 {max(offs) + 1}\n0000000000 65535 f \n'.encode() + b''.join(f'{offs[k]:010d} 00000 n \n'.encode() for k in sorted(offs))
    out += f'trailer\n<< /Size {max(offs) + 1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n'.encode()
    with open(path, 'wb') as f:
        f.write(out)


pdf_statement(os.path.join(OUTDIR, 'releve-octobre-2025.pdf'))
exp = {'closing': closing, 'compta': compta, 'stmtOps': len(stmt), 'bankOnly': [-145.20, 1200.00, -12.50], 'bookOnly': [-450.00, 380.00],
       'transp': [-1243.50, -1234.50], 'ecart': [-560.00, -565.00], 'sens': [89.90, -89.90], 'doublon': -62.40, 'remise': 900.00}
with open(os.path.join(OUTDIR, 'rappro-attendu.json'), 'w', encoding='utf-8') as f:
    json.dump(exp, f, indent=1)
print(json.dumps(exp))
