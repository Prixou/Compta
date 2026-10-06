# FEC de test des cycles (SARL fictive) avec anomalies volontaires connues.
import random, datetime
random.seed(11)
OUT = '444444444FEC20251231.txt'
H = ['JournalCode','JournalLib','EcritureNum','EcritureDate','CompteNum','CompteLib','CompAuxNum','CompAuxLib','PieceRef','PieceDate','EcritureLib','Debit','Credit','EcritureLet','DateLet','ValidDate','Montantdevise','Idevise']
J = {'AN':'A nouveaux','VT':'Ventes','AC':'Achats','BQ':'Banque','B2':'Banque 2','CA':'Caisse','OD':'Opérations diverses'}
L = {'101000':'Capital social','164000':'Emprunts','215400':'Matériel','401000':'Fournisseurs','408100':'Fournisseurs factures non parvenues','411000':'Clients','416000':'Clients douteux',
     '418100':'Clients factures à établir','421000':'Personnel','431000':'Urssaf','445200':'TVA due intracommunautaire','445660':'TVA déductible','445710':'TVA collectée','455000':'Associé compte courant',
     '471000':'Attente','511200':'Chèques à encaisser','512000':'Banque Populaire','512200':'Banque Postale','530000':'Caisse','580000':'Virements internes',
     '601000':'Achats matières','606400':'Fournitures administratives','606800':'Autres fournitures','613200':'Loyers','612200':'Crédit-bail véhicule','616000':'Assurances','618100':'Abonnements et documentation',
     '622600':'Honoraires','623400':'Cadeaux à la clientèle','625100':'Voyages et déplacements','625600':'Missions','625700':'Réceptions','626000':'Télécommunications','627000':'Services bancaires',
     '641000':'Salaires','645000':'Charges sociales','661500':'Intérêts bancaires','706000':'Prestations de services','707000':'Ventes de marchandises'}
CL = [('C%02d' % i, n) for i, n in enumerate(['ATELIER BLEU','BATI SUD','CAFE DU PORT','DOMAINE ROUX','ECOLE MONTESSORI LUNEL','GARAGE MARTIN','HOTEL DES ARENES','IMMO GARD'], 1)]
FO = {k: (k, v) for k, v in [('F01','GROSSISTE MATERIAUX'),('F02','PAPETERIE NIMOISE'),('F03','SCI LES OLIVIERS'),('F04','AXA ASSURANCES'),('F05','CABINET AVOCAT DURAND'),('F06','EXPERT COMPTABLE AUDIT'),('F07','ORANGE BUSINESS'),('F08','FOURNISSEUR ALLEMAND GMBH'),('F09','ARTISAN NON ASSUJETTI'),('F10','TRANSPORTS LENT'),('F11','VOLKSWAGEN BANK'),('F12','RESTAURANT DIVERS')]}
rows = []; num = [0]
def fr(x): return f'{x:.2f}'.replace('.', ',')
def ent(j, date, lines, piece=None, pdate=None):
    num[0] += 1; n = num[0]; d = date.strftime('%Y%m%d'); p = piece or f'{j}{n:05d}'
    pd = (pdate or date).strftime('%Y%m%d')
    for (acc, aux, lib, deb, cred) in lines:
        a = aux or ('', '')
        rows.append([j, J[j], str(n), d, acc, L[acc], a[0], a[1], p, pd, lib, fr(deb), fr(cred), '', '', d, '', ''])
def wd(y, m, d):
    x = datetime.date(y, m, min(d, 28))
    while x.weekday() >= 5: x += datetime.timedelta(days=1)
    return x
D = datetime.date
ent('AN', D(2025,1,1), [('101000',None,'A nouveau',0,20000),('164000',None,'A nouveau',0,15000),('215400',None,'A nouveau',30000,0),('512000',None,'A nouveau',9000,0),('512200',None,'A nouveau',300,0),
    ('530000',None,'A nouveau',400,0),('411000',CL[0],'A nouveau',3600,0),('416000',None,'A nouveau',2500,0),('418100',None,'A nouveau',1800,0),('408100',None,'A nouveau',0,1200),('401000',FO['F01'],'A nouveau',0,4800),
    ('455000',None,'A nouveau',0,4600)])
# Extourne partielle des 408 seulement (418 non extournée)
ent('OD', D(2025,1,2), [('408100',None,'Extourne FNP',600,0),('601000',None,'Extourne FNP',0,600)])
inv = [0]
def sale(date, c, ht, tva_rate=0.2, piece=None, pay_days=20):
    if not piece: inv[0] += 1
    p = piece or f'FA-2025-{inv[0]:04d}'; tva = round(ht * tva_rate, 2)
    ent('VT', date, [('411000',c,f'Facture {p} {c[1]}',ht+tva,0),('706000',None,f'Facture {p}',0,ht)] + ([('445710',None,f'Facture {p}',0,tva)] if tva else []), piece=p)
    if pay_days is not None and date + datetime.timedelta(days=pay_days) <= D(2025,12,31):
        ent('BQ', wd(*(date + datetime.timedelta(days=pay_days)).timetuple()[:3]), [('512000',None,f'VIR {c[1]} {p}',ht+tva,0),('411000',c,f'Règlement {p}',0,ht+tva)])
for m in range(1, 13):
    for k in range(9):
        c = CL[(m + k) % 6]; ht = round(random.uniform(800, 3500), 2)
        delay = 75 if c == CL[3] else 25
        if inv[0] + 1 in (45, 46):          # trous dans la numérotation : 0045 et 0046 jamais saisies
            inv[0] += 2
        sale(wd(2025, m, 2 + k * 3), c, ht, pay_days=delay)
# Doublon de numéro de facture, facture sans TVA (export), client impayé ancien
sale(D(2025,6,12), CL[1], 1500, piece='FA-2025-0060')
sale(D(2025,5,5), CL[6], 4200, tva_rate=0, pay_days=30)
sale(D(2025,3,10), CL[7], 5200, pay_days=None)
sale(D(2025,4,14), CL[7], 2300, pay_days=None)
# Gros CA facturé la dernière semaine
for k in range(4): sale(D(2025,12,22 + k), CL[2], 9000, pay_days=None)
# Ventes : pièce datée de 2026 saisie en 2025
ent('VT', D(2025,12,31), [('411000',CL[4],'Facture janvier 2026',1200,0),('706000',None,'Facture janvier 2026',0,1000),('445710',None,'Facture janvier 2026',0,200)], piece=f'FA-2025-{inv[0]+1:04d}', pdate=D(2026,1,8))

def purch(date, f, acc, ht, rate=0.2, piece=None, pay_days=30, pdate=None, lib=None, tva=None):
    tva = round(ht * rate, 2) if tva is None else tva; p = piece or f'{f[0]}-{date:%m%d}-{random.randint(100,999)}'
    lines = [(acc,None,lib or f'Facture {f[1]}',ht,0)] + ([('445660',None,f'TVA {f[1]}',tva,0)] if tva else []) + [('401000',f,lib or f'Facture {f[1]}',0,ht+tva)]
    ent('AC', date, lines, piece=p, pdate=pdate)
    if pay_days is not None and date + datetime.timedelta(days=pay_days) <= D(2025,12,31):
        ent('BQ', wd(*(date + datetime.timedelta(days=pay_days)).timetuple()[:3]), [('401000',f,f'PRLV {f[1]}',ht+tva,0),('512000',None,f'PRLV {f[1]}',0,ht+tva)])
for m in range(1, 13):
    for k in range(3): purch(wd(2025, m, 4 + k * 8), FO['F01'], '601000', round(random.uniform(900, 2600), 2), pay_days=95 if m in (2, 5, 9) else 40)
    purch(wd(2025, m, 6), FO['F02'], '606400', round(random.uniform(60, 240), 2), pay_days=10)
    if m not in (3, 8): purch(wd(2025, m, 1), FO['F03'], '613200', 1500, rate=0, pay_days=3, lib='Loyer bureau')     # loyer sans TVA, mars et août manquants
    purch(wd(2025, m, 15), FO['F07'], '626000', 89.9, pay_days=5)
    purch(D(2025, m, 1), FO['F11'], '612200', 578.38, piece='FO65826910', pay_days=2)   # échéance mensuelle, même n° de contrat
    purch(wd(2025, m, 20), FO['F06'], '622600', 400, pay_days=15, lib='Honoraires comptables')
    ent('OD', wd(2025, m, 27), [('641000',None,'Salaires',3200,0),('645000',None,'Charges sociales',1350,0),('421000',None,'Net à payer',0,2500),('431000',None,'Urssaf',0,2050)])
    ent('BQ', wd(2025, m, 28), [('421000',None,'VIR salaires',2500,0),('512000',None,'VIR salaires',0,2500)])
    ent('BQ', wd(2025, m, 15), [('431000',None,'PRLV URSSAF',2050,0),('512000',None,'PRLV URSSAF',0,2050)])
    ent('BQ', wd(2025, m, 10), [('618100',None,'CB NETFLIX.COM',17.99,0),('512000',None,'CB NETFLIX.COM',0,17.99)])
    ent('BQ', wd(2025, m, 25), [('627000',None,'FRAIS TENUE DE COMPTE',9.5,0),('512000',None,'FRAIS',0,9.5)])
# Restaurants (fournisseur fourre-tout, montants variables) : facture saisie sauf en septembre
for m in range(1, 13):
    amt = round(random.uniform(45, 260), 2)
    if m == 9:
        ent('BQ', D(2025, 9, 12), [('401000',FO['F12'],'CB RESTAURANT LE PATIO',amt,0),('512000',None,'CB RESTAURANT LE PATIO',0,amt)])
    else:
        purch(wd(2025, m, 11), FO['F12'], '625700', round(amt/1.1, 2), rate=0.1, pay_days=1, lib='Restaurant')
# Paiement fournisseur sans facture (septembre)
ent('BQ', D(2025, 9, 18), [('401000',FO['F02'],'VIR PAPETERIE NIMOISE',432.10,0),('512000',None,'VIR PAPETERIE NIMOISE',0,432.10)])
# Doublon strict (même pièce), doublon possible (2 jours, autre pièce)
purch(D(2025,7,8), FO['F01'], '601000', 1850, piece='GM-2025-0778', pay_days=30)
purch(D(2025,7,9), FO['F01'], '601000', 1850, piece='GM-2025-0778', pay_days=None)
purch(D(2025,10,6), FO['F10'], '601000', 640, piece='TL-551', pay_days=20)
purch(D(2025,10,8), FO['F10'], '601000', 640, piece='TL-553', pay_days=20)
# TVA à 25 %, facture sans TVA, autoliquidation incomplète
purch(D(2025,4,3), FO['F02'], '606400', 500, tva=125, pay_days=10)
purch(D(2025,6,3), FO['F09'], '601000', 800, rate=0, pay_days=10)
ent('AC', D(2025,9,15), [('601000',None,'Achat intracom',3000,0),('445200',None,'TVA autoliquidée',0,600),('401000',FO['F08'],'Achat intracom',0,3000)], piece='DE-2025-77')
# Assurance annuelle (CCA), avocat (DAS2), cut-off achats
purch(D(2025,10,1), FO['F04'], '616000', 2400, rate=0, pay_days=10, lib='Prime annuelle multirisque')
purch(D(2025,5,20), FO['F05'], '622600', 2500, pay_days=20, lib='Honoraires contentieux')
purch(D(2025,12,30), FO['F02'], '606400', 300, pay_days=None, pdate=D(2026,1,12), lib='Facture janvier')
purch(D(2025,1,15), FO['F02'], '606400', 420, pay_days=10, pdate=D(2024,12,18), lib='Facture décembre 2024')
# Dépenses personnelles, amende, week-end, cadeau avec TVA, note de frais
ent('BQ', D(2025,8,9), [('606800',None,'CB DECATHLON NIMES',249.9,0),('512000',None,'CB DECATHLON',0,249.9)])
ent('BQ', D(2025,11,22), [('606800',None,'CB CARREFOUR MARKET',86.4,0),('512000',None,'CB CARREFOUR',0,86.4)])
ent('BQ', D(2025,6,4), [('625100',None,'AMENDE ANTAI 135 EUR',135,0),('512000',None,'ANTAI',0,135)])
ent('BQ', D(2025,9,13), [('625700',None,'CB RESTAURANT LE CHEVAL BLANC',184,0),('512000',None,'CB RESTAURANT',0,184)])
ent('AC', D(2025,12,12), [('623400',None,'Coffrets cadeaux clients',500,0),('445660',None,'TVA cadeaux',100,0),('401000',FO['F02'],'Coffrets cadeaux',0,600)], piece='PN-CAD-01')
ent('OD', D(2025,11,30), [('625600',None,'Note de frais novembre',140,0),('455000',None,'Note de frais novembre',0,140)])
# Trésorerie : espèces, 58 non soldé, 511, compte dormant, découvert, agios, associé
ent('CA', D(2025,6,18), [('401000',FO['F01'],'Règlement espèces',1500,0),('530000',None,'Règlement espèces',0,1500)])
ent('CA', D(2025,6,16), [('530000',None,'Remise client espèces',1800,0),('411000',CL[5],'Règlement espèces',0,1800)])
ent('BQ', D(2025,10,20), [('580000',None,'Virement vers Banque Postale',500,0),('512000',None,'VIR INTERNE',0,500)])
ent('BQ', D(2025,12,29), [('511200',None,'Remise chèques',780,0),('411000',CL[1],'Remise chèques',0,780)])
ent('B2', D(2025,5,30), [('627000',None,'Frais Banque Postale',6,0),('512200',None,'Frais',0,6)])
ent('BQ', D(2025,2,3), [('455000',None,'Retrait associé',14000,0),('512000',None,'VIR associé',0,14000)])
ent('BQ', D(2025,3,28), [('512000',None,'Apport associé',6000,0),('455000',None,'Apport associé',0,6000)])
ent('BQ', D(2025,3,31), [('661500',None,'Agios T1',84,0),('512000',None,'Agios',0,84)])
ent('BQ', D(2025,11,12), [('512000',None,'VIR RECU INCONNU',2300,0),('471000',None,'VIR RECU INCONNU',0,2300)])
rows.sort(key=lambda r: (r[3], int(r[2])))
order = []; seen = set()
for r in rows:
    if r[2] not in seen: seen.add(r[2]); order.append(r[2])
ren = {o: str(i + 1) for i, o in enumerate(order)}
for r in rows: r[2] = ren[r[2]]
with open(OUT, 'w', encoding='utf-8', newline='') as fh:
    fh.write('\t'.join(H) + '\r\n')
    for r in rows: fh.write('\t'.join(r) + '\r\n')
print(OUT, len(rows), 'lignes')
