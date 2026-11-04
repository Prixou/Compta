# Archive fictive « FEC + pièces jointes » sur le modèle de l'export Pennylane (Exporter le FEC, « Inclure les pièces
# jointes ») : FEC officiel 919191919FEC20261231.txt, FEC secondaire non officiel (même contenu et deux colonnes de plus,
# NomOriginalDeLaPieceJointe et NomActuelDeLaPieceJointe) et dossier « Pièces jointes ». Données entièrement inventées.
# Comptabilité de trésorerie d'un libéral : dépenses passées directement en banque, quelques factures par le 401.
#   python3 genjustifs.py [dossier de sortie]   → 919191919-pieces-jointes.zip et 919191919FEC20261231.txt (FEC seul)
#
# Attendu (comptes où une pièce est attendue, frais bancaires 627 et intérêts 661 non attendus par défaut) :
#   34 écritures de charges, 27 avec pièce jointe ; 7 sans pièce jointe pour 3 336,80 € :
#   loyer de mai (6132, 1 000), téléphone d'août (6262, 60), fournitures (6064, 45,90 et 128,40), restaurant (6257, 62,50),
#   assurance (616, 840), honoraires de septembre (6226, 1 200 par le 401).
#   627 et 661 : 12 écritures chacun, aucune pièce (19 écritures, 3 516,80 € si le 627 est coché).
#   Écartées : 12 écritures de paie, 1 de régularisation (charges à payer 408) ; dotation 6811 non revue.
#   Une pièce citée par le FEC (déplacement de novembre) absente du dossier « Pièces jointes ».
import sys, os, zipfile, random

random.seed(19)
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
HEAD = ['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef',
        'PieceDate', 'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise']
ATT = ['NomOriginalDeLaPieceJointe', 'NomActuelDeLaPieceJointe']
JL = {'BQ': 'Banque', 'HA': 'Achats', 'OD': 'Opérations diverses'}
LIB = {'512000': 'Banque', '613200': 'Locations immobilières', '626200': 'Téléphone', '445660': 'TVA déductible', '627000': 'Services bancaires',
       '164000': 'Emprunts', '661100': 'Intérêts des emprunts', '641000': 'Rémunérations du personnel', '421000': 'Personnel - rémunérations dues',
       '431000': 'Sécurité sociale', '706000': 'Honoraires', '606400': 'Fournitures administratives', '625700': 'Réceptions',
       '625100': 'Voyages et déplacements', '616000': "Primes d'assurance", '622600': 'Honoraires', '401000': 'Fournisseurs',
       '408000': 'Fournisseurs - factures non parvenues', '681100': 'Dotations aux amortissements', '281800': 'Amortissements autres immobilisations'}
rows, files, nums = [], [], {}


def fr(x):
    return f'{x:.2f}'.replace('.', ',')


def ref():
    return ''.join(random.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(10))


def entry(jc, date, lib, lines, pj=None, absent=False):
    """lines : (compte, débit, crédit[, auxiliaire, nom]) ; pj : nom d'origine de la pièce jointe (None : pas de pièce)."""
    nums[jc] = nums.get(jc, 0) + 1
    piece = ref()
    actuel = ''
    if pj:
        actuel = f'{piece}-{len(files) + 1:04d}.pdf'
        if not absent:
            files.append(actuel)
    for k, ln in enumerate(lines):
        acc, d, c = ln[0], ln[1], ln[2]
        aux, auxlib = (ln[3], ln[4]) if len(ln) > 3 else ('', '')
        # Pièce jointe indiquée sur la ligne de charge (ou la première ligne), pas forcément sur toutes les lignes
        on = pj and (acc[0] == '6' or (k == 0 and not any(x[0][0] == '6' for x in lines)))
        rows.append([jc, JL[jc], str(nums[jc]), date, acc, LIB[acc], aux, auxlib, piece, date, lib, fr(d), fr(c), '', '', date, '', '',
                     pj if on else '', actuel if on else ''])


for m in range(1, 13):
    mm = f'{m:02d}'
    fin = '28' if m == 2 else '30'
    entry('BQ', f'2026{mm}05', f'PRLV LOYER CABINET {mm}/2026', [('613200', 1000, 0), ('512000', 0, 1000)], None if m == 5 else f'quittance-loyer-{mm}.pdf')
    entry('BQ', f'2026{mm}10', 'PRLV OPERATEUR TELECOM FICTIF', [('626200', 60, 0), ('445660', 12, 0), ('512000', 0, 72)], None if m == 8 else f'facture-telephone-{mm}.pdf')
    entry('BQ', f'2026{mm}15', 'ECHEANCE PRET PROFESSIONNEL', [('164000', 500, 0), ('661100', 40, 0), ('512000', 0, 540)])
    entry('BQ', f'2026{mm}20', 'VIR HONORAIRES PATIENTS', [('512000', 3000, 0), ('706000', 0, 3000)])
    entry('BQ', f'2026{mm}28', 'FRAIS TENUE DE COMPTE', [('627000', 15, 0), ('512000', 0, 15)])
    entry('OD', f'2026{mm}{fin}', f'SALAIRES {mm}/2026', [('641000', 2000, 0), ('421000', 0, 1600), ('431000', 0, 400)])

entry('BQ', '20260212', 'CB PAPETERIE IMAGINAIRE', [('606400', 45.90, 0), ('512000', 0, 45.90)])
entry('BQ', '20260603', 'CB FOURNITURES DE BUREAU FICTIVES', [('606400', 128.40, 0), ('512000', 0, 128.40)])
entry('BQ', '20260917', 'CB PAPETERIE IMAGINAIRE', [('606400', 89, 0), ('512000', 0, 89)], 'ticket-papeterie.pdf')
entry('BQ', '20260321', 'CB RESTAURANT LE FICTIF', [('625700', 62.50, 0), ('512000', 0, 62.50)])
entry('BQ', '20261007', 'CB RESTAURANT LE FICTIF', [('625700', 48, 0), ('512000', 0, 48)], 'note-restaurant.pdf')
entry('BQ', '20260409', 'CB TRAIN IMAGINAIRE', [('625100', 230, 0), ('512000', 0, 230)], 'billet-train.pdf')
entry('BQ', '20261114', 'CB TRAIN IMAGINAIRE', [('625100', 175, 0), ('512000', 0, 175)], 'billet-train-novembre.pdf', absent=True)
entry('BQ', '20260120', 'PRLV ASSURANCE INVENTEE RCP', [('616000', 840, 0), ('512000', 0, 840)])
FRS = ('FCONSEIL', 'CABINET FICTIF CONSEIL')
entry('HA', '20260331', 'CABINET FICTIF CONSEIL FACTURE 2026-031', [('622600', 900, 0), ('445660', 180, 0), ('401000', 0, 1080, *FRS)], 'facture-conseil-mars.pdf')
entry('BQ', '20260415', 'VIR CABINET FICTIF CONSEIL', [('401000', 1080, 0, *FRS), ('512000', 0, 1080)])
entry('HA', '20260930', 'CABINET FICTIF CONSEIL FACTURE 2026-092', [('622600', 1200, 0), ('445660', 240, 0), ('401000', 0, 1440, *FRS)])
entry('BQ', '20261015', 'VIR CABINET FICTIF CONSEIL', [('401000', 1440, 0, *FRS), ('512000', 0, 1440)])
entry('OD', '20261231', 'HONORAIRES A RECEVOIR', [('622600', 300, 0), ('408000', 0, 300)])
entry('OD', '20261231', 'DOTATION AUX AMORTISSEMENTS', [('681100', 1500, 0), ('281800', 0, 1500)])


def fec(cols, extra):
    return '\r\n'.join(['\t'.join(cols)] + ['\t'.join(r if extra else r[:18]) for r in rows]) + '\r\n'


official = fec(HEAD, False)
with open(os.path.join(OUT, '919191919FEC20261231.txt'), 'w', encoding='utf-8', newline='') as f:
    f.write(official)
with zipfile.ZipFile(os.path.join(OUT, '919191919-pieces-jointes.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('919191919FEC20261231.txt', official)
    z.writestr('ecritures-avec-pieces-jointes.txt', fec(HEAD + ATT, True))
    for name in files:
        z.writestr(f'Pièces jointes/{name}', b'%PDF-1.4\n% piece fictive\n')
print('ok', len(rows), 'lignes,', len(files), 'pièces')
