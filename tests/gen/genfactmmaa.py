# FEC de test (données inventées) d'un dossier qui numérote ses factures « n° + mois et année » : la facture 5108 de
# janvier 2026 s'écrit « F51080126 ». Les ventes (VT) portent un n° interne « - P101 » et, rarement, le n° de facture ;
# les encaissements CB (BQ1) citent les n° de facture, souvent regroupés : « F5101-5102-5103-51040126 »,
# « 5105-51060126 », « F5109+51100126 », « F5111,5112,51130126 », « F 51140126 », « F5126+127+51280226 », et un libellé
# tronqué « F5116+5117+5118+5119+51200 ». N° jamais cités (factures manquantes) : 5107, 5121, 5142. Faute de frappe :
# « F 56890126 ». À ignorer : « CHQ 5113 » (achat), « F 30012026-1 », « F26000318 » (fournisseur).
#   python3 genfactmmaa.py [dossier de sortie]   → 800000008FEC20261231.txt et 800000008-attendu.json
import sys, os, json

OUTDIR = sys.argv[1] if len(sys.argv) > 1 else '.'
H = ['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate',
     'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise']
rows, n = [], 0


def fmt(v):
    return f'{v:.2f}'.replace('.', ',')


def entry(jc, jl, date, lines):
    global n
    n += 1
    d = date.replace('-', '')
    for compte, clib, aux, auxl, lib, deb, cre in lines:
        rows.append([jc, jl, str(n), d, compte, clib, aux, auxl, f'PC{n:05d}', d, lib, fmt(deb), fmt(cre), '', '', d, '', ''])


MONTHS = {1: range(5101, 5116), 2: range(5116, 5133), 3: range(5133, 5151)}
MISSING = {5107, 5121, 5142}
IN_SALE_LABEL = {5110, 5130}  # n° de facture repris dans le libellé de la vente
p = 100
for m, nums in MONTHS.items():
    for k, num in enumerate(nums):
        if num in MISSING:
            continue
        p += 1
        day = 2 + (k * 2) % 26
        date = f'2026-{m:02d}-{day:02d}'
        ht = 100 + (num % 7) * 25
        tva = round(ht * 0.1, 2)
        lib = f'SEJOUR CLIENT {num - 2000}' + (f' F{num}{m:02d}26' if num in IN_SALE_LABEL else '') + f' - P{p}'
        entry('VT', 'Journal de vente', date, [('411', 'Clients', '411DIV', 'CLIENTS DIVERS', lib, ht + tva, 0),
                                              ('7063100008', 'Prestations hébergement (TVA 10%)', '', '', lib, 0, ht),
                                              ('44571008', 'TVA collectée à 10%', '', '', lib, 0, tva)])

BQ = ('BQ1', 'Journal de trésorerie - BANQUE DEMO')
receipts = [
    ('2026-01-05', 'REMISE CB DEMO 050126 F5101-5102-5103-51040126'), ('2026-01-06', 'REMISE CB DEMO 060126 5105-51060126'),
    ('2026-01-10', 'REMISE CB DEMO 100126 F51080126'), ('2026-01-12', 'REMISE CB DEMO 120126 F5109+51100126'),
    ('2026-01-15', 'REMISE CB DEMO 150126 F5111,5112,51130126'), ('2026-01-18', 'REMISE CB DEMO 180126 F 56890126'),
    ('2026-01-20', 'REMISE CB DEMO 200126 F 51140126'), ('2026-01-25', 'REMISE CB DEMO 250126 F51150126'),
    ('2026-02-05', 'REMISE CB DEMO 050226 F5116+5117+5118+5119+51200'), ('2026-02-10', 'REMISE CB DEMO 100226 F5122-5123-51240226'),
    ('2026-02-11', 'VIR CLIENT DEMO F51250226'), ('2026-02-15', 'REMISE CB DEMO 150226 F5126+127+51280226'),
    ('2026-02-20', 'REMISE CB DEMO 200226 F5129,5130,51310226'), ('2026-02-25', 'REMISE CB DEMO 250226 F51320226'),
    ('2026-03-03', 'REMISE CB DEMO 030326 F5133-5134-5135-51360326'), ('2026-03-05', 'REMISE CB DEMO 050326 F5137+51380326'),
    ('2026-03-08', 'REMISE CB DEMO 080326 F51390326'), ('2026-03-12', 'REMISE CB DEMO 120326 F5140,51410326'),
    ('2026-03-16', 'REMISE CB DEMO 160326 F5143-5144-51450326'), ('2026-03-20', 'REMISE CB DEMO 200326 F51460326+51470326'),
    ('2026-03-25', 'REMISE CB DEMO 250326 F5148+5149+51500326'), ('2026-03-30', 'VIR CLIENT DEMO SOLDE F 30012026-1'),
]
for i, (date, lib) in enumerate(receipts):
    amt = 300 + i * 17.5
    entry(*BQ, date, [('5121001', 'Banque Demo', '', '', lib, amt, 0), ('411', 'Clients', '411DIV', 'CLIENTS DIVERS', lib, 0, amt)])
# Bruit : chèque d'achat, règlement fournisseur
entry('HA', "Journal d'achat", '2026-02-12', [('6061000009', 'Fournitures (TVA 20%)', '', '', 'FOURNISSEUR X CHQ 5113', 50, 0),
                                              ('44566', 'TVA déductible', '', '', 'FOURNISSEUR X CHQ 5113', 10, 0),
                                              ('401', 'Fournisseurs', '401X', 'FOURNISSEUR X', 'FOURNISSEUR X CHQ 5113', 0, 60)])
entry(*BQ, '2026-01-23', [('5121001', 'Banque Demo', '', '', '30907711/001 FOURNISSEUR Y F26000318', 0, 120),
                          ('401', 'Fournisseurs', '401Y', 'FOURNISSEUR Y', '30907711/001 FOURNISSEUR Y F26000318', 120, 0)])

with open(os.path.join(OUTDIR, '800000008FEC20261231.txt'), 'w', encoding='utf-8', newline='') as f:
    f.write('\t'.join(H) + '\r\n')
    for r in rows:
        f.write('\t'.join(r) + '\r\n')
present = sorted(x for m in MONTHS.values() for x in m if x not in MISSING)
exp = {'first': 5101, 'last': 5150, 'count': len(present), 'missing': {'2026-01': [5107], '2026-02': [5121], '2026-03': [5142]},
       'inSale': sorted(IN_SALE_LABEL), 'outliers': [2600, 5689]}
with open(os.path.join(OUTDIR, '800000008-attendu.json'), 'w', encoding='utf-8') as f:
    json.dump(exp, f, indent=1)
print(json.dumps(exp))
