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
exp = {'closing': closing, 'compta': compta, 'stmtOps': len(stmt), 'bankOnly': [-145.20, 1200.00, -12.50], 'bookOnly': [-450.00, 380.00],
       'transp': [-1243.50, -1234.50], 'ecart': [-560.00, -565.00], 'sens': [89.90, -89.90], 'doublon': -62.40, 'remise': 900.00}
with open(os.path.join(OUTDIR, 'rappro-attendu.json'), 'w', encoding='utf-8') as f:
    json.dump(exp, f, indent=1)
print(json.dumps(exp))
