# FEC de test (données inventées) pour le contrôle de la TVA de l'exercice (onglet « Contrôle TVA ») : hôtel au réel
# mensuel, hébergement à 10 % (taux lu dans les écritures, pas dans le libellé), location de salle à 20 %, bonis sans TVA (écritures à part).
#   - janvier : OD « TVA janvier 2026 » du 31/01, report du crédit de l'à-nouveau (300) ;
#   - février : immobilisation, crédit de 800 ; OD « TVA février 2026 » passée le 15/03 (mois lu dans le libellé) ;
#   - mars : une vente à 10 % comptabilisée avec 90 € de TVA au lieu de 100 (écart de 10 € au contrôle en bases) ;
#     OD « Déclaration de TVA » du 31/03 sans mois (rattachée par les montants), crédit imputé, loyer de mars déduit
#     alors qu'il n'est pas payé (prestation de services : écart de 400 € sur la TVA déductible) ;
#   - avril : ventes, pas encore d'OD (mois d'arrêté par défaut : mars) ;
#   - à-nouveaux : crédit de TVA 300, clients 1 000, acomptes « séjours 10 % » 2 200 TTC (2 000 HT).
#   python3 gentvarevue.py [dossier de sortie]   → 600000006FEC20261231.txt et 600000006-attendu.json
import sys, os, json

OUTDIR = sys.argv[1] if len(sys.argv) > 1 else '.'
H = ['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate',
     'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise']
LIB = {'101000': 'Capital', '411000': 'Clients', '419100': 'Acomptes clients séjours 10 %', '401000': 'Fournisseurs', '404000': "Fournisseurs d'immobilisations",
       '512000': 'Banque Demo', '706100': 'Hébergement', '706200': 'Location de salle 20 %', '708800': 'Bonis clients (pas de TVA)',
       '613200': 'Locations immobilières', '601000': 'Achats de denrées', '215400': 'Matériel', '44571100': 'TVA collectée 10 %',
       '44571200': 'TVA collectée 20 %', '44566000': 'TVA déductible sur autres biens et services', '44562000': 'TVA déductible sur immobilisations',
       '44567000': 'Crédit de TVA à reporter', '44551000': 'TVA à décaisser'}
JL = {'AN': 'A nouveaux', 'VT': 'Ventes', 'HA': 'Achats', 'BQ': 'Banque', 'OD': 'Opérations diverses'}
rows, n = [], 0


def fmt(v):
    return f'{v:.2f}'.replace('.', ',')


def entry(jc, date, lib, lines):
    global n
    n += 1
    d = date.replace('-', '')
    assert abs(sum(x[2] for x in lines) - sum(x[3] for x in lines)) < 0.001, lib
    for compte, aux, deb, cre in lines:
        al = {'C001': 'CLIENTS HOTEL', 'SCI': 'SCI DEMO LOCATION', 'GROS': 'GROSSISTE DEMO', 'IMMO': 'EQUIPEMENT DEMO'}.get(aux, '')
        rows.append([jc, JL[jc], str(n), d, compte, LIB[compte], aux, al, f'P{n:04d}', d, lib, fmt(deb), fmt(cre), '', '', d, '', ''])


entry('AN', '2026-01-01', 'A nouveaux', [('44567000', '', 300, 0), ('411000', 'C001', 1000, 0), ('419100', '', 0, 2200), ('512000', '', 900, 0)])
SALES = {1: (10000, 5000), 2: (8000, 4000), 3: (12000, 6000), 4: (9000, 0)}
for m, (h10, h20) in SALES.items():
    d = f'2026-{m:02d}-10'
    ttc = round(h10 * 1.1 + h20 * 1.2, 2)
    lines = [('411000', 'C001', ttc, 0), ('706100', '', 0, h10), ('44571100', '', 0, round(h10 * 0.1, 2))]
    if h20:
        lines += [('706200', '', 0, h20), ('44571200', '', 0, round(h20 * 0.2, 2))]
    entry('VT', d, f'Ventes du mois {m:02d}/2026', lines)
    entry('VT', d, f'Bonis clients {m:02d}/2026', [('708800', '', 20, 0), ('411000', 'C001', 0, 20)])
    entry('BQ', f'2026-{m:02d}-20', 'Remise clients', [('512000', '', ttc - 20, 0), ('411000', 'C001', 0, ttc - 20)])
# Vente de mars avec une TVA erronée (90 au lieu de 100)
entry('VT', '2026-03-12', 'Séminaire hébergement', [('411000', 'C001', 1090, 0), ('706100', '', 0, 1000), ('44571100', '', 0, 90)])
# Loyers (prestation de services) et denrées (biens)
for m in (1, 2, 3):
    entry('HA', f'2026-{m:02d}-05', f'Loyer {m:02d}/2026', [('613200', '', 2000, 0), ('44566000', '', 400, 0), ('401000', 'SCI', 0, 2400)])
entry('HA', '2026-01-08', 'Denrées janvier', [('601000', '', 1000, 0), ('44566000', '', 200, 0), ('401000', 'GROS', 0, 1200)])
entry('HA', '2026-02-12', 'Matériel cuisine', [('215400', '', 10000, 0), ('44562000', '', 2000, 0), ('404000', 'IMMO', 0, 12000)])
entry('BQ', '2026-02-06', 'Loyer janvier', [('401000', 'SCI', 2400, 0), ('512000', '', 0, 2400)])
entry('BQ', '2026-03-06', 'Loyer février', [('401000', 'SCI', 2400, 0), ('512000', '', 0, 2400)])
entry('BQ', '2026-03-20', 'Matériel cuisine', [('404000', 'IMMO', 12000, 0), ('512000', '', 0, 12000)])
# OD de TVA
entry('OD', '2026-01-31', 'TVA janvier 2026', [('44571100', '', 1000, 0), ('44571200', '', 1000, 0), ('44566000', '', 0, 600), ('44567000', '', 0, 300), ('44551000', '', 0, 1100)])
entry('BQ', '2026-02-15', 'DGFIP TVA janvier', [('44551000', '', 1100, 0), ('512000', '', 0, 1100)])
entry('OD', '2026-03-15', 'TVA février 2026', [('44571100', '', 800, 0), ('44571200', '', 800, 0), ('44566000', '', 0, 400), ('44562000', '', 0, 2000), ('44567000', '', 800, 0)])
entry('OD', '2026-03-31', 'Déclaration de TVA', [('44571100', '', 1290, 0), ('44571200', '', 1200, 0), ('44566000', '', 0, 400), ('44567000', '', 0, 800), ('44551000', '', 0, 1290)])

with open(os.path.join(OUTDIR, '600000006FEC20261231.txt'), 'w', encoding='utf-8', newline='') as f:
    f.write('\t'.join(H) + '\r\n')
    for r in rows:
        f.write('\t'.join(r) + '\r\n')
exp = {
    'arrete': '2026-03',
    'recap': {'2026-01': {'b10': 10000, 'b20': 5000, 'coll': 2000, 'dAbs': 600, 'report': 300, 'due': 1100, 'credit': 0},
              '2026-02': {'b10': 8000, 'b20': 4000, 'coll': 1600, 'dAbs': 400, 'dImmo': 2000, 'report': 0, 'due': 0, 'credit': 800},
              '2026-03': {'b10': 12900, 'b20': 6000, 'coll': 2490, 'dAbs': 400, 'report': 800, 'due': 1290, 'credit': 0}},
    'caHt': {'10': 31000, '20': 15000, 'exo': -60},
    'ecartBases': {'10': 10, '20': 0},
    'avances': {'10': 2000},
    'encEcart': {'10': 100},
    'deductible': {'total': 1200, 'nonDed': 400, 'exigible': 800, 'declared': 1200},
}
with open(os.path.join(OUTDIR, '600000006-attendu.json'), 'w', encoding='utf-8') as f:
    json.dump(exp, f, indent=1)
print(json.dumps(exp))
