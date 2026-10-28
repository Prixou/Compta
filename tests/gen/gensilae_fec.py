# FEC fictif d'un dossier avec paie (SIREN 456 456 456, exercice 2025), pour le rapprochement avec les éditions Silae
# (gensilae_pdf.py) : salaires en 641100 (30 500,00 €, congés payés à part en 641200), cotisations patronales par
# organisme (645100 URSSAF, 645300 Klesia, 645400 AG2R, 645500 Harmonie, 645600 France Travail, 645800 OPCO ; congés
# payés en 645200), 421, 431 et 437 réglés le mois suivant (décembre reste dû), congés payés à payer 428200 = 2 150,00 € et
# 438200 = 903,00 €. Écart volontaire : mutuelle 320,00 € en comptabilité pour 300,00 € dans l'édition.
#   python3 gensilae_fec.py [dossier de sortie]   → 456456456FEC20251231.txt
import sys, os, calendar

OUTDIR = sys.argv[1] if len(sys.argv) > 1 else '.'
HEAD = 'JournalCode\tJournalLib\tEcritureNum\tEcritureDate\tCompteNum\tCompteLib\tCompAuxNum\tCompAuxLib\tPieceRef\tPieceDate\tEcritureLib\tDebit\tCredit\tEcritureLet\tDateLet\tValidDate\tMontantdevise\tIdevise'
JOURNAUX = {'AN': 'A nouveaux', 'PA': 'Paie', 'BQ': 'Banque', 'OD': 'Opérations diverses'}
LIB = {'101000': 'Capital social', '110000': 'Report à nouveau', '512000': 'Banque', '641100': 'Salaires et appointements', '641200': 'Congés payés',
       '645100': 'Cotisations URSSAF', '645200': 'Charges sociales sur congés payés', '645300': 'Retraite complémentaire Klesia', '645400': 'Prévoyance AG2R',
       '645500': 'Mutuelle Harmonie', '645600': 'Assurance chômage France Travail', '645800': 'Formation professionnelle OPCO',
       '421000': 'Personnel - rémunérations dues', '431000': 'URSSAF', '437100': 'Klesia', '437200': 'AG2R', '437300': 'Harmonie mutuelle',
       '437400': 'France Travail', '437500': 'OPCO', '428200': 'Dettes provisionnées pour congés payés', '438200': 'Charges sociales sur congés payés'}
# organisme : (compte de charge, compte de dette, part salariale annuelle, part patronale annuelle)
ORGS = [('645100', '431000', 2897.50, 8540.00), ('645300', '437100', 1220.00, 1830.00), ('645400', '437200', 150.00, 380.00),
        ('645500', '437300', 300.00, 320.00), ('645600', '437400', 0.00, 1220.00), ('645800', '437500', 0.00, 330.00)]
lines, num = [], [0]


def fmt(v):
    return f'{v:.2f}'.replace('.', ',')


def entry(jc, date, piece, lib, rows):
    num[0] += 1
    assert abs(sum(d for _, d, _ in rows) - sum(c for _, _, c in rows)) < 0.005
    for compte, d, c in rows:
        lines.append('\t'.join([jc, JOURNAUX[jc], str(num[0]), date, compte, LIB[compte], '', '', piece, date, lib, fmt(d), fmt(c), '', '', date, '', '']))


def split(total, m):
    """Part du mois m (1 à 12) d'un montant annuel, le dernier mois prenant l'arrondi."""
    base = round(total / 12, 2)
    return round(total - base * 11, 2) if m == 12 else base


entry('AN', '20250101', 'AN', 'A nouveau', [('512000', 60000.00, 0), ('101000', 0, 10000.00), ('110000', 0, 50000.00)])
due = []
for m in range(1, 13):
    d = f'2025{m:02d}{calendar.monthrange(2025, m)[1]:02d}'
    gross = 3000.00 if m == 12 else 2500.00
    rows = [('641100', gross, 0)]
    sal_m = 0
    credits = []
    for charge, dette, sal, pat in ORGS:
        s_m, p_m = split(sal, m), split(pat, m)
        sal_m += s_m
        rows.append((charge, p_m, 0))
        credits.append((dette, 0, round(s_m + p_m, 2)))
    net = round(gross - sal_m, 2)
    rows += [('421000', 0, net)] + credits
    entry('PA', d, f'PAIE{m:02d}', f'Paie {m:02d}/2025', rows)
    if m < 12:
        pay = f'2025{m + 1:02d}05'
        total = round(net + sum(c for _, _, c in credits), 2)
        entry('BQ', pay, f'VIR{m:02d}', f'Salaires et cotisations {m:02d}/2025', [('421000', net, 0)] + [(dette, c, 0) for dette, _, c in credits] + [('512000', 0, total)])
entry('OD', '20251231', 'CP2025', 'Provision congés payés', [('641200', 2150.00, 0), ('428200', 0, 2150.00), ('645200', 903.00, 0), ('438200', 0, 903.00)])
with open(os.path.join(OUTDIR, '456456456FEC20251231.txt'), 'w', encoding='utf-8') as f:
    f.write(HEAD + '\n' + '\n'.join(lines) + '\n')
print(len(lines), 'lignes')
