# FEC de test au format Pennylane : n° de pièce aléatoire, n° de facture dans le libellé de la ligne client 411
# (« Facture X - F-260010 », « Avoir X - F-260011 »), libellé de la ligne de produit sans n° pour les avoirs.
#   python3 genpennylane.py [dossier de sortie]   → 888888888FEC20261231.txt (F-260007 en février, F-260012 à F-260014 entre février et mars, jamais saisies)
import sys, os, random, string, datetime
random.seed(5)
OUT = os.path.join(sys.argv[1] if len(sys.argv) > 1 else '.', '888888888FEC20261231.txt')
H = ['JournalCode','JournalLib','EcritureNum','EcritureDate','CompteNum','CompteLib','CompAuxNum','CompAuxLib','PieceRef','PieceDate','EcritureLib','Debit','Credit','EcritureLet','DateLet','ValidDate','Montantdevise','Idevise']
CL = ['MARTIN PAUL', 'SCI LES OLIVIERS', 'DUPONT ANNE', 'GARAGE DU CENTRE']
rows = []; num = 0
fr = lambda x: f'{x:.2f}'.replace('.', ',')
def ref(): return ''.join(random.choice(string.ascii_uppercase + string.digits) for _ in range(10))
d0 = datetime.date(2026, 1, 5)
for k in range(1, 31):
    if k in (7, 12, 13, 14): continue
    num += 1; d = (d0 + datetime.timedelta(days=k * 4)).strftime('%Y%m%d'); p = ref(); c = CL[k % 4]
    avoir = k % 9 == 0
    ht = 100.0 + k * 10; tva = round(ht * 0.2, 2); ttc = ht + tva
    lib = f"{'Avoir' if avoir else 'Facture'} {c} - F-26{k:04d}"
    prod = 'Forfait déplacement - Avoir' if avoir else lib
    sg = -1 if avoir else 1
    lines = [('706000', 'Prestations de services', '', '', prod, 0 if sg > 0 else ht, ht if sg > 0 else 0),
             ('411', 'Clients', f'411C{k % 4}', c, lib, ttc if sg > 0 else 0, 0 if sg > 0 else ttc),
             ('445710', 'TVA collectée', '', '', prod, 0 if sg > 0 else tva, tva if sg > 0 else 0)]
    for (acc, alib, aux, auxl, l, deb, cre) in lines:
        rows.append(['VT', 'Journal de vente', str(num), d, acc, alib, aux, auxl, p, d, l, fr(deb), fr(cre), '', '', d, '', ''])
with open(OUT, 'w', encoding='utf-8', newline='') as f:
    f.write('\t'.join(H) + '\r\n')
    for r in rows: f.write('\t'.join(r) + '\r\n')
print(OUT, len(rows), 'lignes')
