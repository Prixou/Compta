import random, datetime, sys
random.seed(11)
Y = int(__import__('os').environ.get('YEAR', '2025'))
SCALE = int(sys.argv[1]) if len(sys.argv) > 1 else 1
OUT = sys.argv[2] if len(sys.argv) > 2 else '123456789FEC20251231.txt'
H = ['JournalCode','JournalLib','EcritureNum','EcritureDate','CompteNum','CompteLib','CompAuxNum','CompAuxLib','PieceRef','PieceDate','EcritureLib','Debit','Credit','EcritureLet','DateLet','ValidDate','Montantdevise','Idevise']
J = {'AN':'A nouveaux','VT':'Ventes','AC':'Achats','BQ':'Banque','CA':'Caisse','OD':'Opérations diverses'}
L = {'101000':'Capital social','110000':'Report à nouveau','164000':'Emprunts','215400':'Matériel industriel','281540':'Amort. matériel',
     '401000':'Fournisseurs','411000':'Clients','421000':'Personnel - rémunérations dues','431000':'Urssaf','445660':'TVA déductible sur ABS',
     '445710':'TVA collectée','455000':'Associés - comptes courants','471000':'Compte d\'attente','512000':'Banque Crédit Agricole','530000':'Caisse',
     '607000':'Achats de marchandises','606100':'Fournitures non stockables','613200':'Locations immobilières','627000':'Frais bancaires',
     '641000':'Rémunérations du personnel','645000':'Charges sociales','661100':'Intérêts des emprunts','681120':'Dotations amort. immo corp.',
     '706000':'Prestations de services','707000':'Ventes de marchandises'}
clients = [('C%03d' % i, 'Client %s' % n) for i, n in enumerate(['Durand','Martin','Bernard','Petit','Robert','Richard','Dubois','Moreau','Laurent','Simon'], 1)]
fourns = [('F%03d' % i, 'Fournisseur %s' % n) for i, n in enumerate(['Métro','Leclerc','Bureau Vallée','Orange','EDF','Loueur Immo'], 1)]
rows = []; num = [0]
def ent(j, date, lines, piece=None, override_num=None):
    if override_num is None: num[0] += 1
    n = override_num or num[0]
    d = date.strftime('%Y%m%d')
    p = piece or f'{j}{n:05d}'
    for (acc, aux, lib, deb, cred) in lines:
        a = aux or ('', '')
        rows.append([j, J[j], str(n), d, acc, L.get(acc, acc), a[0], a[1], p, d, lib, f'{deb:.2f}'.replace('.', ','), f'{cred:.2f}'.replace('.', ','), '', '', d, '', ''])
    return n
D0 = datetime.date(Y, 1, 1)
ent('AN', D0, [('101000',None,'A nouveau',0,10000),('110000',None,'A nouveau',0,5000),('164000',None,'A nouveau',0,3000),('281540',None,'A nouveau',0,3000),
               ('401000',fourns[0],'A nouveau',0,1500),('512000',None,'A nouveau',12000,0),('530000',None,'A nouveau',500,0),('215400',None,'A nouveau',8000,0),('411000',clients[0],'A nouveau',2000,0)])
def workday(y, m, d):
    x = datetime.date(y, m, d)
    while x.weekday() >= 5 or (x.month, x.day) in [(1,1),(5,1),(5,8),(7,14),(8,15),(11,1),(11,11),(12,25),(4,21),(5,29),(6,9)]: x += datetime.timedelta(days=1)
    return x
for rep in range(SCALE):
  for m in range(1, 13):
    for k in range(6):
        c = random.choice(clients); ht = round(random.uniform(300, 4000), 2); tva = round(ht * .2, 2)
        dt = workday(Y, m, 2 + k * 4)
        ent('VT', dt, [('411000',c,f'Facture {c[1]}',ht+tva,0),('706000',None,f'Facture {c[1]}',0,ht),('445710',None,f'Facture {c[1]}',0,tva)])
        ent('BQ', workday(Y, m, 3 + k * 4), [('512000',None,f'Règlement {c[1]}',ht+tva,0),('411000',c,f'Règlement {c[1]}',0,ht+tva)])
    for k in range(4):
        f = random.choice(fourns[:3]); ht = round(random.uniform(200, 1800), 2); tva = round(ht * .2, 2)
        dt = workday(Y, m, 5 + k * 5)
        ent('AC', dt, [('607000',None,f'Achat {f[1]}',ht,0),('445660',None,f'Achat {f[1]}',tva,0),('401000',f,f'Achat {f[1]}',0,ht+tva)])
        ent('BQ', workday(Y, m, 6 + k * 5), [('401000',f,f'Paiement {f[1]}',ht+tva,0),('512000',None,f'Paiement {f[1]}',0,ht+tva)])
    ent('AC', workday(Y, m, 1), [('613200',None,'Loyer',1000,0),('445660',None,'Loyer',200,0),('401000',fourns[5],'Loyer',0,1200)])
    ent('BQ', workday(Y, m, 2), [('401000',fourns[5],'Loyer',1200,0),('512000',None,'Loyer',0,1200)])
    ent('OD', workday(Y, m, 28), [('641000',None,'Salaires',2500,0),('645000',None,'Charges sociales',1050,0),('421000',None,'Salaires',0,1950),('431000',None,'Urssaf',0,1600)])
    ent('BQ', workday(Y, m, 28), [('421000',None,'Virement salaires',1950,0),('512000',None,'Virement salaires',0,1950)])
    ent('BQ', workday(Y, m, 15), [('431000',None,'Urssaf',1600,0),('512000',None,'Urssaf',0,1600)])
    ent('BQ', workday(Y, m, 20), [('661100',None,'Intérêts',25,0),('164000',None,'Echéance emprunt',230,0),('627000',None,'Frais',12.5,0),('512000',None,'Echéance',0,267.5)])
    ent('CA', workday(Y, m, 10), [('530000',None,'Ventes comptoir',360,0),('707000',None,'Ventes comptoir',0,300),('445710',None,'Ventes comptoir',0,60)])
    ent('CA', workday(Y, m, 12), [('606100',None,'Petites fournitures',45,0),('530000',None,'Petites fournitures',0,45)])
# --- Anomalies volontaires ---
ent('CA', datetime.date(Y, 6, 17), [('606100',None,'Achat espèces important',2900,0),('530000',None,'Achat espèces important',0,2900)])   # caisse négative
ent('OD', datetime.date(Y, 4, 30), [('641000',None,'Prime oubliée',500,0),('421000',None,'Prime oubliée',0,450)])                     # déséquilibrée
ent('OD', datetime.date(Y, 3, 9), [('606100',None,'Achat du dimanche',80,0),('512000',None,'Achat du dimanche',0,80)])                # dimanche
ent('OD', datetime.date(Y, 7, 14), [('606100',None,'Achat du 14 juillet',60,0),('512000',None,'Achat du 14 juillet',0,60)])          # férié
for _ in range(2):                                                                                                                       # doublon
    ent('AC', datetime.date(Y, 9, 10), [('607000',None,'Achat Métro',1000,0),('445660',None,'Achat Métro',200,0),('401000',fourns[0],'Achat Métro',0,1200)], piece='FA-2025-0917')
ent('BQ', datetime.date(Y, 11, 5), [('512000',None,'Virement inconnu',750,0),('471000',None,'Virement inconnu',0,750)])                # 471 non soldé
ent('BQ', datetime.date(Y, 11, 6), [('512000',None,'Règlement Durand (en double)',9000,0),('411000',clients[0],'Règlement Durand',0,9000)]) # client créditeur ?
ent('BQ', datetime.date(Y, 12, 2), [('455000',None,'Retrait associé',3000,0),('512000',None,'Retrait associé',0,3000)])                # 455 débiteur
ent('OD', datetime.date(Y, 12, 31), [('681120',None,'Dotation amortissements',1600,0),('281540',None,'Dotation amortissements',0,1600)])
n = ent('OD', datetime.date(Y, 12, 31), [('606100',None,'Date invalide',10,0),('512000',None,'Date invalide',0,10)])
rows[-2][3] = '20250230'; rows[-1][3] = '20250230'                                                                                          # date invalide
ent('OD', datetime.date(Y + 1, 1, 5), [('627000',None,'Frais janvier 2026',8,0),('512000',None,'Frais janvier 2026',0,8)])                 # après clôture
rows[-1][5] = ''                                                                                                                           # libellé de compte manquant
ent('OD', datetime.date(Y, 2, 1), [('627000',None,'Saisie tardive',5,0),('512000',None,'Saisie tardive',0,5)])                          # inversion chrono
last = rows[-2:]
body = rows[:-2]
order = sorted({(r[3], int(r[2])) for r in body})
renum = {old: i + 1 for i, (_, old) in enumerate(order)}
for r in body: r[2] = str(renum[int(r[2])])
for r in last: r[2] = str(len(order) + 1)
rows = body + last
with open(OUT, 'w', encoding='iso-8859-15', newline='') as fh:
    fh.write('\t'.join(H) + '\r\n')
    for r in rows: fh.write('\t'.join(r) + '\r\n')
print(OUT, len(rows), 'lignes', num[0], 'écritures')
