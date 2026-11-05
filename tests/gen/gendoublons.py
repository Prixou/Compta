# FEC de test (données inventées) d'une officine saisie dans ACD, pour la recherche des factures fournisseurs en double.
# Bruit : grossistes à plusieurs livraisons par jour, laboratoires, loyer mensuel (n° de bail), énergie mensuelle (n° de
# contrat), journal « AC » à n° de pièce interne (B000…) et n° de facture dans le libellé.
# Doublons à trouver (très probables) : facture saisie deux fois le même jour, ressaisie le mois suivant, saisie sur un
# autre compte (fournisseurs divers), même pièce interne saisie deux fois, copie non lettrée d'une facture payée.
# Probables : faute de frappe sur le montant, même facture sans n°, loyer saisi deux fois en juin, et deux pièces aux n°
# différents (même jour, même montant, même fournisseur), jamais très probables.
# Pas des doublons : même montant à 6 mois d'écart, facture et avoir, date dans le libellé,
# loyer et énergie mensuels, doublon déjà annulé par un avoir, copie rattachée à un règlement (lettrée avec son paiement).
#   python3 gendoublons.py [dossier de sortie]   → 777777777FEC20261231.txt
import sys, os, random

OUTDIR = sys.argv[1] if len(sys.argv) > 1 else '.'
random.seed(7)
H = ['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate',
     'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise']
rows, n = [], [0]


def fmt(v):
    return f'{v:.2f}'.replace('.', ',')


def day(m, j):
    return f'2026{m:02d}{j:02d}'


def inv(d, aux, name, amt, piece, lib, jc='HA', jl='ACHATS', let=''):
    """Facture (montant > 0) ou avoir (< 0) : fournisseur, achats, TVA déductible."""
    n[0] += 1
    a = abs(amt); ht = round(a / 1.055, 2); tva = round(a - ht, 2); fa = amt > 0
    for c, cl, x, xl, de, cr, lt in [('401000', 'FOURNISSEURS', aux, name, 0 if fa else a, a if fa else 0, let),
                                     ('607000', 'ACHATS MARCHANDISES', '', '', ht if fa else 0, 0 if fa else ht, ''),
                                     ('445660', 'TVA DEDUCTIBLE', '', '', tva if fa else 0, 0 if fa else tva, '')]:
        rows.append([jc, jl, str(n[0]), d, c, cl, x, xl, piece, d, lib, fmt(de), fmt(cr), lt, d if lt else '', d, '', ''])


def pay(d, aux, name, amt, lib, let=''):
    n[0] += 1
    rows.append(['BQ', 'BANQUE', str(n[0]), d, '401000', 'FOURNISSEURS', aux, name, f'BQ{n[0]}', d, lib, fmt(amt), '0,00', let, d if let else '', d, '', ''])
    rows.append(['BQ', 'BANQUE', str(n[0]), d, '512000', 'BANQUE', '', '', f'BQ{n[0]}', d, lib, '0,00', fmt(amt), '', '', d, '', ''])


GRN, GRS = ('FGRNORD', 'GROSSISTE NORD'), ('FREPSUD', 'REPARTITEUR SUD')
k = 0
for m in range(1, 11):
    for j in range(1, 29):
        for (g, nm), choices in ((GRN, (0, 1, 1, 2)), (GRS, (0, 0, 1))):
            for _ in range(random.choice(choices)):
                k += 1
                inv(day(m, j), g, nm, round(random.uniform(40, 4000), 2), f'FA26{k:05d}', nm.split()[0])
    for g, nm in (('FALPHA', 'LABORATOIRES ALPHA'), ('FBETA', 'BETA PHARMA'), ('FGAMMA', 'GAMMA SANTE')):
        k += 1
        inv(day(m, 10), g, nm, round(random.uniform(50, 2500), 2), f'L{k:06d}', nm)
    inv(day(m, 1), 'FSCI', 'SCI EXEMPLE', 1650.00, 'BAIL2024', 'LOYER SCI EXEMPLE')
    inv(day(m, 20), 'FENER', 'ENERGIE EXEMPLE', round(random.uniform(380, 520), 2), 'CT558877', 'ENERGIE CONTRAT 558877')
    pay(day(m, 25), 'FGRNORD', 'GROSSISTE NORD', 3000.0, 'LCR GROSSISTE NORD')
    # Journal ACD à n° de pièce interne : n° de facture du laboratoire dans le libellé
    for j in (5, 18):
        k += 1
        inv(day(m, j), 'FEPSI', 'LABO EPSILON', round(random.uniform(30, 900), 2), f'B{5000 + k:09d}', f'LABO EPSILON {920000000 + k}', jc='AC', jl='ACHATS GED')

# --- Doublons très probables ---
inv(day(3, 12), *GRN, 1234.56, 'FA2601234', 'GROSSISTE'); inv(day(3, 12), *GRN, 1234.56, 'FA2601234', 'GROSSISTE')
inv(day(2, 2), 'FALPHA', 'LABORATOIRES ALPHA', 638.94, 'F260555', 'LABORATOIRES ALPHA'); inv(day(2, 12), 'FALPHA', 'LABORATOIRES ALPHA', 638.94, 'F260555', 'ALPHA')
# Sans n° de facture, même jour, libellés identiques à l'espace et au tiret près, n° de chèque : même libellé
inv(day(3, 5), 'FCHQ', 'FOURNISSEUR', 250.00, '', 'FOURNISSEUR- CHQ 555123'); inv(day(3, 5), 'FCHQ', 'FOURNISSEUR', 250.00, '', 'FOURNISSEUR - CHQ 555123')
inv(day(8, 7), 'FBETA', 'BETA PHARMA', 597.11, 'INV-778899', 'BETA PHARMA'); inv(day(8, 7), 'FDIVERS', 'FOURNISSEURS DIVERS', 597.11, 'INV-778899', 'BETA PHARMA')
inv(day(4, 22), 'FEPSI', 'LABO EPSILON', 412.80, 'B000009001', 'LABO EPSILON 920555001', jc='AC', jl='ACHATS GED')
inv(day(5, 6), 'FEPSI', 'LABO EPSILON', 412.80, 'B000009001', 'LABO EPSILON 920555001', jc='AC', jl='ACHATS GED')
inv(day(9, 14), 'FZETA', 'ZETA MEDICAL', 210.00, 'Z2609', 'ZETA MEDICAL', let='C'); pay(day(9, 30), 'FZETA', 'ZETA MEDICAL', 210.00, 'VIR ZETA MEDICAL', let='C')
inv(day(9, 14), 'FZETA', 'ZETA MEDICAL', 210.00, f'B{9500:09d}', 'ZETA MEDICAL 14-09-2026', jc='AC', jl='ACHATS GED')
# --- À vérifier ---
inv(day(5, 15), 'FGAMMA', 'GAMMA SANTE', 1162.22, 'CO-445566', 'GAMMA SANTE'); inv(day(5, 15), 'FGAMMA', 'GAMMA SANTE', 1126.22, 'CO-445566', 'GAMMA SANTE')
# Sans n° de facture, même montant, un jour d'écart : pas un doublon (même date exigée)
inv(day(6, 16), 'FDELTA', 'DELTA DERMO', 127.14, '', 'DELTA DERMO'); inv(day(6, 17), 'FDELTA', 'DELTA DERMO', 127.14, '', 'DELTA DERMO')
# Loyer mensuel saisi deux fois le 1er juin (la référence du bail n'est pas un n° de facture) : probable
inv(day(6, 1), 'FSCI', 'SCI EXEMPLE', 1650.00, 'BAIL2024', 'LOYER SCI EXEMPLE')
# Même jour, même montant, même fournisseur, n° de pièce différents (l'une payée) : probable, jamais très probable
inv(day(10, 6), 'FKAPPA', 'KAPPA SANTE', 345.60, '145', 'KAPPA SANTE', let='D'); pay(day(10, 20), 'FKAPPA', 'KAPPA SANTE', 345.60, 'VIR KAPPA', let='D')
inv(day(10, 6), 'FKAPPA', 'KAPPA SANTE', 345.60, '146', 'KAPPA SANTE')
# N° différents, toutes deux lettrées, même jour, même montant, libellé proche (facture saisie à la main puis reçue) : probable
for j, a in ((3, 64.20), (12, 31.40), (19, 77.05)): inv(day(8, j), 'FTHETA', 'THETA LAB', a, f'TL-202608{j:02d}', 'THETA LAB')
inv(day(10, 9), 'FTHETA', 'THETA LAB', 88.88, 'MANUEL', 'THETA LAB REPARATION FRIGO', let='E'); pay(day(10, 21), 'FTHETA', 'THETA LAB', 88.88, 'VIR THETA', let='E')
inv(day(10, 9), 'FTHETA', 'THETA LAB', 88.88, 'TL-20261009', 'THETA LAB REPARATION FRIGO', let='F'); pay(day(10, 22), 'FTHETA', 'THETA LAB', 88.88, 'VIR THETA', let='F')
# Même chose mais libellés réduits au nom du fournisseur : deux factures réglées, rien à signaler
inv(day(8, 4), 'FLAMBDA', 'LAMBDA SANTE', 70.10, 'LS-20260804', 'LAMBDA SANTE')
inv(day(10, 13), 'FLAMBDA', 'LAMBDA SANTE', 99.99, 'LS-20261013', 'LAMBDA SANTE', let='G'); pay(day(10, 23), 'FLAMBDA', 'LAMBDA SANTE', 99.99, 'VIR LAMBDA', let='G')
inv(day(10, 13), 'FLAMBDA', 'LAMBDA SANTE', 99.99, 'LS-20261014', 'LAMBDA SANTE', let='H'); pay(day(10, 24), 'FLAMBDA', 'LAMBDA SANTE', 99.99, 'VIR LAMBDA', let='H')
# N° saisi en partie (fin du n°, une seule facture du fournisseur) : probable
inv(day(10, 10), 'FIOTA', 'IOTA PHARMA', 150.00, '6020455891', 'IOTA PHARMA'); inv(day(10, 12), 'FIOTA', 'IOTA PHARMA', 150.00, '55891', 'IOTA PHARMA')
# N° de chèque dans le libellé (référence du règlement), n° de pièce différents avec des points : pas des doublons
inv(day(5, 30), 'FATEL', 'ATELIER EXEMPLE', 274.80, '26.05.118', 'ATELIER EXEMPLE CHQ 5550281'); inv(day(5, 30), 'FATEL', 'ATELIER EXEMPLE', 274.80, '26.04.118', 'ATELIER EXEMPLE 04.2026 CH 5550281')
for pc, lb in (('61733', 'JEAN EXEMPLE- CHQ 5550262'), ('-61734', 'JEAN EXEMPLE -CHQ 5550262'), ('-61735', 'JEAN EXEMPLE - CHQ 5550262')):
    inv(day(2, 24), 'FDIVERS', 'FOURNISSEURS DIVERS', 30.00, pc, lb)
# Exactement le même n°, montants à 5 centimes d'écart (512,40 et 512,45) : à vérifier (probable)
inv(day(6, 8), 'FRHO', 'RHO MEDICAL', 512.40, 'RH-5512', 'RHO MEDICAL'); inv(day(6, 9), 'FRHO', 'RHO MEDICAL', 512.45, 'RH-5512', 'RHO MEDICAL')
# Même n° dans les libellés mais n° de pièce présents et différents : le n° du libellé n'est pas pris, probable
inv(day(5, 18), 'FEPSI', 'LABO EPSILON', 146.00, 'B000009301', 'LABO EPSILON 2026-22-00319 29.06', jc='AC', jl='ACHATS GED')
inv(day(5, 18), 'FEPSI', 'LABO EPSILON', 146.00, 'B000009302', 'LABO EPSILON 2026-22-00319 29.06', jc='AC', jl='ACHATS GED')
# Écriture sans n° de pièce : son n° est lu dans le libellé, le même que le n° de pièce de l'autre : très probable
inv(day(11, 3), 'FSIGMA', 'SIGMA LAB', 184.30, 'S2609170', 'SIGMA LAB'); inv(day(11, 10), 'FSIGMA', 'SIGMA LAB', 184.30, '', 'SIGMA LAB FACT S2609170')
# --- Pas des doublons ---
inv(day(4, 4), *GRS, 899.00, 'OC77812', 'REPARTITEUR'); inv(day(4, 6), *GRS, 899.00, 'OC77812', 'REPARTITEUR')
inv(day(4, 30), *GRS, -899.00, 'OC77812', 'ANNULATION DOUBLON OC77812')                                   # déjà annulé
inv(day(3, 20), *GRN, 432.10, 'FA2690001', 'GROSSISTE'); inv(day(9, 14), *GRN, 432.10, 'FA2690002', 'GROSSISTE')  # 6 mois d'écart
inv(day(7, 8), 'FGAMMA', 'GAMMA SANTE', 250.00, 'CO-9001', 'GAMMA SANTE'); inv(day(7, 20), 'FGAMMA', 'GAMMA SANTE', -250.00, 'CO-9001', 'AVOIR GAMMA')  # facture et avoir
inv(day(2, 15), *GRN, 811.40, 'FA2691001', 'GROSSISTE 15.02.2026'); inv(day(2, 15), *GRN, 377.25, 'FA2691002', 'GROSSISTE 15.02.2026')  # date dans le libellé
inv(day(7, 9), 'FEPSI', 'LABO EPSILON', 55.55, 'B000009101', 'LABO EPSILON 920777100', jc='AC', jl='ACHATS GED')
inv(day(7, 10), 'FEPSI', 'LABO EPSILON', 55.55, 'B000009102', 'LABO EPSILON 920777245', jc='AC', jl='ACHATS GED')  # deux n° de facture différents : pas un doublon
# Copie rattachée à un règlement : facture recopiée (même n°) pour un second paiement du même montant, chacune lettrée
inv(day(1, 20), 'FOMEGA', 'OMEGA SERVICES', 1171.84, 'OM2026-01', 'OMEGA SERVICES OM2026-01', let='A'); pay(day(2, 5), 'FOMEGA', 'OMEGA SERVICES', 1171.84, 'VIR OMEGA', let='A')
inv(day(2, 5), 'FOMEGA', 'OMEGA SERVICES', 1171.84, 'OM2026-01', 'OMEGA SERVICES OM2026-01', let='B'); pay(day(3, 25), 'FOMEGA', 'OMEGA SERVICES', 1171.84, 'VIR OMEGA', let='B')
# Même n°, même montant, mais 4 mois d'écart (01/01 et 01/05) : pas comparées (plus de 3 semaines)
inv(day(1, 1), 'FMU', 'MU SERVICES', 480.00, 'MU-77001', 'MU SERVICES'); inv(day(5, 1), 'FMU', 'MU SERVICES', 480.00, 'MU-77001', 'MU SERVICES')
# Dates dans le libellé (2026.04.15 et 2026.05.15) : pas des n° de facture
inv(day(4, 28), 'FPRESTA', 'PRESTA CONSEIL', 300.00, '', 'PRESTA CONSEIL 2026.04.15'); inv(day(5, 5), 'FPRESTA', 'PRESTA CONSEIL', 300.00, '', 'PRESTA CONSEIL 2026.05.15')
# Sans n° de facture, même jour, montants à 5 centimes près : pas un doublon (au centime près exigé)
inv(day(11, 16), 'FNU', 'NU MEDICAL', 75.40, '', 'NU MEDICAL'); inv(day(11, 16), 'FNU', 'NU MEDICAL', 75.45, '', 'NU MEDICAL')
# N° saisi en partie (pas exactement le même n°), 5 centimes d'écart : pas un doublon
inv(day(11, 20), 'FKSI', 'KSI PHARMA', 99.40, '8812345678', 'KSI PHARMA'); inv(day(11, 21), 'FKSI', 'KSI PHARMA', 99.45, '45678', 'KSI PHARMA')

rows.insert(0, ['AN', 'A NOUVEAUX', '0', '20260101', '401000', 'FOURNISSEURS', 'FGRNORD', 'GROSSISTE NORD', 'AN', '20260101', 'A NOUVEAU', '0,00', '5000,00', '', '', '20260101', '', ''])
rows.insert(1, ['AN', 'A NOUVEAUX', '0', '20260101', '890000', 'BILAN OUVERTURE', '', '', 'AN', '20260101', 'A NOUVEAU', '5000,00', '0,00', '', '', '20260101', '', ''])
os.makedirs(OUTDIR, exist_ok=True)
with open(os.path.join(OUTDIR, '777777777FEC20261231.txt'), 'w', encoding='cp1252', newline='\r\n') as f:
    f.write('\t'.join(H) + '\n' + '\n'.join('\t'.join(r) for r in rows) + '\n')
print(len(rows), 'lignes,', n[0], 'écritures')
