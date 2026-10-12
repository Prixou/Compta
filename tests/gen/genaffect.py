# FEC de test des suggestions d'affectation : opérations bancaires récurrentes déjà affectées et lettrées,
# puis les mêmes libellés passés en compte d'attente, et un relevé bancaire avec une opération non comptabilisée.
#   python3 genaffect.py [dossier de sortie]
import sys, os, datetime
OUTDIR = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = os.path.join(OUTDIR, '666666666FEC20251231.txt')
CSV = os.path.join(OUTDIR, 'releve-666-2025.csv')
H = ['JournalCode','JournalLib','EcritureNum','EcritureDate','CompteNum','CompteLib','CompAuxNum','CompAuxLib','PieceRef','PieceDate','EcritureLib','Debit','Credit','EcritureLet','DateLet','ValidDate','Montantdevise','Idevise']
J = {'AN':'A nouveaux','AC':'Achats','VT':'Ventes','BQ':'Banque','OD':'Opérations diverses'}
L = {'101000':'Capital','401000':'Fournisseurs','411000':'Clients','445660':'TVA déductible','445710':'TVA collectée','471000':"Compte d'attente",
     '512000':'Banque','613200':'Loyers','626000':'Télécommunications','706000':'Prestations de services'}
rows = []; num = [0]; bank = []
D = datetime.date
def fr(x): return f'{x:.2f}'.replace('.', ',')
def ent(j, date, lines, lib, piece=None):
    num[0] += 1; n = num[0]; d = date.strftime('%Y%m%d'); p = piece or f'{j}{n:05d}'
    assert abs(sum(l[2] for l in lines) - sum(l[3] for l in lines)) < 0.005
    for (acc, aux, deb, cred, let) in [(l + (None,))[:5] if len(l) == 4 else l for l in lines]:
        a = aux or ('', '')
        rows.append([j, J[j], str(n), d, acc, L[acc], a[0], a[1], p, d, lib, fr(deb), fr(cred), let or '', d if let else '', d, '', ''])
        if acc == '512000' and j != 'AN': bank.append((date, lib, round(deb - cred, 2)))
ORANGE = ('F07', 'ORANGE BUSINESS'); CLI = ('C01', 'CABINET MEDICAL DU PARC')
ent('AN', D(2025, 1, 1), [('512000', None, 20000, 0), ('101000', None, 0, 20000)], 'A nouveau')
for m in range(1, 13):
    # Facture et prélèvement Orange : 401 lettré
    if m <= 10:
        ent('AC', D(2025, m, 3), [('626000', None, 100, 0), ('445660', None, 20, 0), ('401000', ORANGE, 0, 120, f'O{m}')], f'Facture Orange {m:02d}/2025')
        ent('BQ', D(2025, m, 15), [('401000', ORANGE, 120, 0, f'O{m}'), ('512000', None, 0, 120)], 'PRLV SEPA ORANGE SA FR45XYZ')
    # Facture client et virement reçu : 411 lettré
    if m <= 10:
        ent('VT', D(2025, m, 5), [('411000', CLI, 600, 0, f'C{m}'), ('706000', None, 0, 500), ('445710', None, 0, 100)], f'Facture prestations {m:02d}/2025', piece=f'FA{m:04d}')
        ent('BQ', D(2025, m, 20), [('512000', None, 600, 0), ('411000', CLI, 0, 600, f'C{m}')], 'VIR CABINET MEDICAL DU PARC')
    # Loyer : charge (compte non lettrable)
    if m <= 10:
        ent('BQ', D(2025, m, 5), [('613200', None, 800, 0), ('512000', None, 0, 800)], 'PRLV SCI DU PORT LOYER')
# Novembre : les mêmes opérations passées en compte d'attente, et une opération inconnue
ent('BQ', D(2025, 11, 15), [('471000', None, 120, 0), ('512000', None, 0, 120)], 'PRLV SEPA ORANGE SA FR45XYZ')
ent('BQ', D(2025, 11, 20), [('512000', None, 600, 0), ('471000', None, 0, 600)], 'VIR CABINET MEDICAL DU PARC')
ent('BQ', D(2025, 11, 5), [('471000', None, 800, 0), ('512000', None, 0, 800)], 'PRLV SCI DU PORT LOYER')
ent('BQ', D(2025, 11, 22), [('471000', None, 75, 0), ('512000', None, 0, 75)], 'PRLV INCONNU ZQX')
rows.sort(key=lambda r: (r[3], int(r[2])))
with open(OUT, 'w', encoding='utf-8', newline='') as f:
    f.write('\t'.join(H) + '\r\n')
    for r in rows: f.write('\t'.join(r) + '\r\n')
# Relevé de décembre : opérations non comptabilisées (le FEC s'arrête au 30 novembre pour la banque)
bank += [(D(2025, 12, 5), 'PRLV SCI DU PORT LOYER', -800.0), (D(2025, 12, 15), 'PRLV SEPA ORANGE SA FR45XYZ', -120.0), (D(2025, 12, 18), 'CB INCONNUE 18/12', -42.5)]
with open(CSV, 'w', encoding='utf-8', newline='') as f:
    f.write('Date;Libellé;Montant\r\n')
    for (d, lib, amt) in sorted(bank):
        f.write(f'{d.strftime("%d/%m/%Y")};"{lib}";{fr(amt)}\r\n')
print(OUT, len(rows), 'lignes ;', CSV)
