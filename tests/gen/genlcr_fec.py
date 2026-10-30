# FEC fictif (dossier 909090909, exercice 2026) dont les comptes fournisseurs 401 portent les mêmes comptes auxiliaires
# et intitulés que tests/fixtures/lcr/listing-fournisseurs.csv : il remplace le listing dans « Écritures LCR » (page
# autonome ou onglet de l'Espace FEC). Achats au journal AC (charges 607, TVA 44566, fournisseur 401 auxiliaire),
# règlements par LCR au journal BQ (403 effets à payer).
#   python3 genlcr_fec.py [dossier de sortie]
import sys, os

OUTDIR = sys.argv[1] if len(sys.argv) > 1 else '.'
FRS = [('FALPHA', 'FOURNISSEUR ALPHA'), ('FBETA', 'BETA DISTRIBUTION'), ('FBETA2', 'BETA LOGISTIQUE'), ('FGAMMA', 'GAMMA SANTE'), ('FDELTA', 'DELTA'),
       ('FZETA', 'ZETA'), ('FOMEGA', 'OMEGA SERVICES'), ('FOMEGA2', 'OMEGA SERVICES SUD'), ('FKAPPA', 'KAPPA CONSEIL')]
LIB = {'607000': 'ACHATS DE MARCHANDISES', '445660': 'TVA DEDUCTIBLE', '401000': 'FOURNISSEURS', '403000': 'EFFETS A PAYER', '512000': 'BANQUE'}
rows, n = [], [0]


def fr(c):
    return f'{c // 100},{c % 100:02d}'


def entry(jc, jl, date, piece, lib, lines):
    n[0] += 1
    for acc, aux, auxlib, d, c in lines:
        rows.append([jc, jl, str(n[0]), date, acc, LIB[acc], aux, auxlib, piece, date, lib, fr(d), fr(c), '', '', date, '', ''])


for i, (code, nom) in enumerate(FRS):
    ht = 100000 + i * 12500
    tva = ht // 5
    date = f'2026{3 + i % 6:02d}{10 + i:02d}'
    entry('AC', 'ACHATS', date, f'F{i + 1:03d}', f'{nom} FACTURE {i + 1}', [('607000', '', '', ht, 0), ('445660', '', '', tva, 0), ('401000', code, nom, 0, ht + tva)])
    if i < 5:
        entry('BQ', 'BANQUE', date[:6] + '28', f'LCR{i + 1:03d}', f'LCR {nom}', [('401000', code, nom, ht + tva, 0), ('403000', '', '', 0, ht + tva)])

HEAD = 'JournalCode\tJournalLib\tEcritureNum\tEcritureDate\tCompteNum\tCompteLib\tCompAuxNum\tCompAuxLib\tPieceRef\tPieceDate\tEcritureLib\tDebit\tCredit\tEcritureLet\tDateLet\tValidDate\tMontantdevise\tIdevise'
with open(os.path.join(OUTDIR, '909090909FEC20261231.txt'), 'w', encoding='utf-8', newline='\r\n') as f:
    f.write('\n'.join([HEAD] + ['\t'.join(r) for r in rows]) + '\n')
print('ok')
