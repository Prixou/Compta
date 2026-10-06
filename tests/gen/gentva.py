# FEC de test du contrôle de TVA : restaurant-traiteur fictif, plusieurs taux, liquidations mensuelles et anomalies connues.
import random, datetime
random.seed(7)
OUT = '777777777FEC20251231.txt'
H = ['JournalCode','JournalLib','EcritureNum','EcritureDate','CompteNum','CompteLib','CompAuxNum','CompAuxLib','PieceRef','PieceDate','EcritureLib','Debit','Credit','EcritureLet','DateLet','ValidDate','Montantdevise','Idevise']
J = {'AN':'A nouveaux','VT':'Ventes','AC':'Achats','BQ':'Banque','CA':'Caisse','OD':'Opérations diverses'}
L = {'101000':'Capital social','164000':'Emprunts','218300':'Matériel informatique','401000':'Fournisseurs','411000':'Clients',
     '445200':'TVA due intracommunautaire','445620':'TVA sur immobilisations','445660':'TVA déductible sur ABS','445711':'TVA collectée 20 %','445712':'TVA collectée 10 %','445713':'TVA collectée 5,5 %',
     '445510':'TVA à décaisser','471000':'Compte d\'attente','445670':'Crédit de TVA à reporter','512000':'Crédit Agricole','530000':'Caisse',
     '601000':'Achats matières premières','607000':'Achats de marchandises','606140':'Carburants','613200':'Loyer','613500':'Location véhicule de tourisme (LLD)','622800':'Prestations informatiques',
     '623400':'Cadeaux à la clientèle','625600':'Missions','626000':'Télécommunications','658000':"Charges diverses (écarts d'arrondi)",'758000':"Produits divers (écarts d'arrondi)",
     '706100':'Prestations traiteur 20 %','707110':'Ventes restaurant 10 %','707120':'Ventes à emporter 5,5 %','707130':'Ventes boissons alcoolisées 20 %','707300':'Ventes export','707400':'Livraisons intracommunautaires'}
CL = [('C01','MAIRIE DE NIMES'),('C02','ARENES EVENTS'),('C03','CLINIQUE DU PARC'),('C04','DOMAINE ROUX'),('C05','TRAITEUR BERLIN GMBH'),('C06','LONDON FOOD LTD')]
FO = {'F1':('F01','METRO NIMES'),'F2':('F02','PRIMEURS DU GARD'),'F3':('F03','SCI DU PORT'),'F4':('F04','ORANGE BUSINESS'),'F5':('F05','KAFFEE IMPORT GMBH'),'F6':('F06','CLOUD SERVICES IRELAND'),'F7':('F07','ARVAL LLD'),'F8':('F08','LDLC PRO')}
rows = []; num = [0]
def fr(x): return f'{x:.2f}'.replace('.', ',')
def ent(j, date, lines, piece=None, lib=None):
    num[0] += 1; n = num[0]; d = date.strftime('%Y%m%d'); p = piece or f'{j}{n:05d}'
    tot = round(sum(l[3] for l in lines) - sum(l[4] for l in lines), 2)
    assert abs(tot) < 0.005, (lines, tot)
    for (acc, aux, lb, deb, cred) in lines:
        a = aux or ('', '')
        rows.append([j, J[j], str(n), d, acc, L[acc], a[0], a[1], p, d, lb, fr(deb), fr(cred), '', '', d, '', ''])
D = datetime.date
def wd(y, m, d):
    x = D(y, m, min(d, 28))
    while x.weekday() >= 5: x += datetime.timedelta(days=1)
    return x
r2 = lambda x: round(x + 1e-9, 2)
VAT = {20: '445711', 10: '445712', 5.5: '445713'}
# Opérations par mois, pour calculer les liquidations
mon = {}
def M(date): return mon.setdefault(date.strftime('%Y-%m'), {'coll': {}, 'ded': 0.0, 'dedi': 0.0, 'auto': 0.0})
def coll(date, acc, v, skip=False):
    if not skip: M(date)['coll'][acc] = r2(M(date)['coll'].get(acc, 0) + v)

ent('AN', D(2025,1,1), [('101000',None,'A nouveau',0,10000),('164000',None,'A nouveau',0,20000),('512000',None,'A nouveau',27100,0),('530000',None,'A nouveau',5000,0),('445510',None,'TVA décembre 2024',0,2100)])
ent('BQ', D(2025,1,20), [('445510',None,'DGFIP TVA 12/2024',2100,0),('512000',None,'PRLV DGFIP TVA 12/2024',0,2100)])

inv = [0]
for m in range(1, 10):
    # Z de caisse hebdomadaires : restaurant 10 %, à emporter 5,5 %, boissons alcoolisées 20 %
    for w in range(4):
        dt = wd(2025, m, 3 + w * 7)
        h10, h55, h20 = r2(random.uniform(3000, 5000)), r2(random.uniform(400, 900)), r2(random.uniform(500, 1200))
        t10, t55, t20 = r2(h10 * .10), r2(h55 * .055), r2(h20 * .20)
        ttc = r2(h10 + h55 + h20 + t10 + t55 + t20)
        ent('CA', dt, [('512000',None,'Remise CB et espèces Z',ttc,0),('707110',None,'Z de caisse',0,h10),('707120',None,'Z de caisse',0,h55),('707130',None,'Z de caisse',0,h20),
                       ('445712',None,'Z de caisse',0,t10),('445713',None,'Z de caisse',0,t55),('445711',None,'Z de caisse',0,t20)])
        coll(dt, '445712', t10); coll(dt, '445713', t55); coll(dt, '445711', t20)
    # Factures traiteur 20 %
    for k in range(3):
        dt = wd(2025, m, 5 + k * 8); c = CL[k % 4]; inv[0] += 1; p = f'TR-{inv[0]:04d}'
        ht = r2(random.uniform(1500, 4000)); tva = r2(ht * .2)
        rate_acc = '445711'
        if m == 3 and k == 0: tva = 150.0; ht = 1000.0             # TVA à 15 % : erreur de taux
        if m == 5 and k == 1: tva = r2(ht * .10); rate_acc = '445712'  # prestation à 20 % passée en TVA 10 %
        late = (m == 6 and k == 2)                                   # facture saisie après la déclaration de juin
        if late: dt = D(2025, 6, 27)
        ent('VT', dt, [('411000',c,f'Facture {p} {c[1]}',r2(ht+tva),0),('706100',None,f'Facture {p}',0,ht),(rate_acc,None,f'Facture {p}',0,tva)], piece=p)
        coll(dt, rate_acc, tva, skip=late)
        pdt = dt + datetime.timedelta(days=30)
        if pdt <= D(2025,9,30): ent('BQ', wd(*pdt.timetuple()[:3]), [('512000',None,f'VIR {c[1]}',r2(ht+tva),0),('411000',c,f'Règlement {p}',0,r2(ht+tva))])
    # Achats de marchandises 5,5 % et 20 %, matières premières
    for k in range(3):
        dt = wd(2025, m, 4 + k * 9); f = FO['F1'] if k != 1 else FO['F2']
        ht = r2(random.uniform(2000, 3500)); tva = r2(ht * (0.055 if k != 2 else 0.2))
        acc = '607000' if k != 1 else '601000'
        ent('AC', dt, [(acc,None,f'Facture {f[1]}',ht,0),('445660',None,f'TVA {f[1]}',tva,0),('401000',f,f'Facture {f[1]}',0,r2(ht+tva))])
        M(dt)['ded'] = r2(M(dt)['ded'] + tva)
    # Loyer SCI sans TVA, téléphone, carburant, LLD véhicule de tourisme
    dt = wd(2025, m, 2); ent('AC', dt, [('613200',None,'Loyer SCI DU PORT',1800,0),('401000',FO['F3'],'Loyer',0,1800)])
    dt = wd(2025, m, 12); ent('AC', dt, [('626000',None,'Facture ORANGE',85,0),('445660',None,'TVA ORANGE',17,0),('401000',FO['F4'],'Facture ORANGE',0,102)]); M(dt)['ded'] = r2(M(dt)['ded'] + 17)
    dt = wd(2025, m, 15); ent('BQ', dt, [('606140',None,'CB TOTAL ENERGIES NIMES',110,0),('445660',None,'TVA carburant',22,0),('512000',None,'CB TOTAL ENERGIES NIMES',0,132)]); M(dt)['ded'] = r2(M(dt)['ded'] + 22)
    dt = wd(2025, m, 6); ent('AC', dt, [('613500',None,'Loyer LLD ARVAL',450,0),('445660',None,'TVA LLD',90,0),('401000',FO['F7'],'Loyer LLD ARVAL',0,540)]); M(dt)['ded'] = r2(M(dt)['ded'] + 90)

# Février : ordinateurs (TVA passée en 44566 au lieu de 44562) → crédit de TVA
dt = D(2025,2,18); ent('AC', dt, [('218300',None,'Serveur et postes LDLC',25000,0),('445660',None,'TVA LDLC',5000,0),('401000',FO['F8'],'Facture LDLC',0,30000)]); M(dt)['ded'] = r2(M(dt)['ded'] + 5000)
# Avril : acquisition intracommunautaire de café (autoliquidée et déduite), hôtel
dt = D(2025,4,9); ent('AC', dt, [('607000',None,'Café KAFFEE IMPORT',4000,0),('445660',None,'TVA autoliquidée',800,0),('445200',None,'TVA due intracom',0,800),('401000',FO['F5'],'Facture KAFFEE IMPORT',0,4000)])
M(dt)['ded'] = r2(M(dt)['ded'] + 800); M(dt)['auto'] = r2(M(dt)['auto'] + 800)
dt = D(2025,4,23); ent('BQ', dt, [('625600',None,'CB HOTEL IBIS MONTPELLIER',150,0),('445660',None,'TVA hôtel',15,0),('512000',None,'CB HOTEL IBIS MONTPELLIER',0,165)]); M(dt)['ded'] = r2(M(dt)['ded'] + 15)
# Avril : vente export sans TVA ; juin : livraison intracommunautaire et prestation sans TVA inexpliquée ; cadeau
ent('VT', D(2025,4,14), [('411000',CL[5],'Facture TR-EXP1 LONDON FOOD',2500,0),('707300',None,'Facture TR-EXP1',0,2500)], piece='TR-EXP1')
ent('VT', D(2025,6,10), [('411000',CL[4],'Facture TR-UE1 BERLIN',3100,0),('707400',None,'Facture TR-UE1',0,3100)], piece='TR-UE1')
ent('VT', D(2025,6,16), [('411000',CL[3],'Facture TR-SANS DOMAINE ROUX',1200,0),('706100',None,'Facture TR-SANS',0,1200)], piece='TR-SANS')
dt = D(2025,6,20); ent('AC', dt, [('623400',None,'Coffrets cadeaux clients',400,0),('445660',None,'TVA cadeaux',80,0),('401000',FO['F1'],'Coffrets cadeaux',0,480)]); M(dt)['ded'] = r2(M(dt)['ded'] + 80)
# Juillet : prestation informatique d'un prestataire étranger autoliquidée mais non déduite
dt = D(2025,7,8); ent('AC', dt, [('622800',None,'CLOUD SERVICES IRELAND',1000,0),('471000',None,'TVA autoliquidée à affecter',200,0),('445200',None,'TVA autoliquidée',0,200),('401000',FO['F6'],'Facture CLOUD SERVICES',0,1000)]); M(dt)['auto'] = r2(M(dt)['auto'] + 200)

# Liquidations mensuelles (janvier à août) au dernier jour du mois, paiement vers le 19 du mois suivant
credit = 0.0
for m in range(1, 9):
    k = f'2025-{m:02d}'; x = mon[k]
    end = (D(2025, m + 1, 1) - datetime.timedelta(days=1))
    lines = [(a, None, f'TVA {m:02d}/2025', v, 0) for a, v in sorted(x['coll'].items())]
    if x['auto']: lines.append(('445200', None, f'TVA {m:02d}/2025', x['auto'], 0))
    brute = r2(sum(x['coll'].values()) + x['auto'])
    lines.append(('445660', None, f'TVA {m:02d}/2025', 0, x['ded']))
    net = r2(brute - x['ded'] - credit)
    if credit: lines.append(('445670', None, f'Imputation crédit', 0, credit))
    if net < 0:
        lines.append(('445670', None, f'Crédit TVA {m:02d}/2025', -net, 0)); credit = -net
    else:
        credit = 0.0
        due = float(round(net)); diff = r2(due - net)
        lines.append(('445510', None, f'TVA à payer {m:02d}/2025', 0, due))
        if diff > 0: lines.append(('658000', None, 'Arrondi TVA', diff, 0))
        elif diff < 0: lines.append(('758000', None, 'Arrondi TVA', 0, -diff))
        pay = due - 100 if m == 4 else due   # avril : paiement inférieur de 100 €
        ent('OD', end, lines, piece=f'TVA{m:02d}')
        ent('BQ', wd(2025, m + 1, 19), [('445510',None,f'DGFIP TVA {m:02d}/2025',pay,0),('512000',None,f'PRLV DGFIP TVA {m:02d}/2025',0,pay)])
        continue
    ent('OD', end, lines, piece=f'TVA{m:02d}')

with open(OUT, 'w', encoding='utf-8', newline='') as fh:
    fh.write('\t'.join(H) + '\r\n')
    for r in rows: fh.write('\t'.join(r) + '\r\n')
print(OUT, len(rows), 'lignes')
