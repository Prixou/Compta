import datetime
H = ['JournalCode','JournalLib','EcritureNum','EcritureDate','CompteNum','CompteLib','CompAuxNum','CompAuxLib','PieceRef','PieceDate','EcritureLib','Debit','Credit','EcritureLet','DateLet','ValidDate','Montantdevise','Idevise']
J = {'AN':'A nouveaux','AC':'Achats','VT':'Ventes','BQ':'Banque','OD':'Opérations diverses'}
L = {'101000':'Capital','512000':'Société Générale','401000':'Fournisseurs','411000':'Clients','6061':'Electricité','626000':'Télécommunications','613200':'Loyers',
     '445660':'TVA déductible','445710':'TVA collectée','706000':'Prestations','641000':'Salaires','421000':'Personnel rémunérations dues','471000':'Attente','218300':'Matériel informatique','164000':'Emprunt','661100':'Intérêts'}
rows=[]; n=[0]
def e(j, d, lines):
    n[0]+=1; ds=d.strftime('%Y%m%d')
    for acc, aux, lib, deb, cre in lines:
        a = aux or ('','')
        rows.append([j,J[j],str(n[0]),ds,acc,L[acc],a[0],a[1],f'P{n[0]}',ds,lib,f'{deb:.2f}'.replace('.',','),f'{cre:.2f}'.replace('.',','),'','',ds,'',''])
D=datetime.date
e('AN', D(2025,1,1), [('512000',None,'AN',20000,0),('164000',None,'AN',0,15000),('101000',None,'AN',0,5000)])
EDF=('F-EDF','EDF Entreprises'); CLI=('C-DUP','Dupuis SA'); BAIL=('F-SCI','SCI du Parc'); INF=('F-INFO','InfoPro')
for m in range(1,10):
    if m not in (5,6): e('AC', D(2025,m,5), [('6061',None,'Facture EDF',100,0),('445660',None,'Facture EDF',20,0),('401000',EDF,'Facture EDF',0,120)])
    e('AC', D(2025,m,1), [('613200',None,'Loyer',800,0),('401000',BAIL,'Loyer',0,800)])
    e('VT', D(2025,m,10), [('411000',CLI,'Facture Dupuis',3600,0),('706000',None,'Facture Dupuis',0,3000),('445710',None,'Facture Dupuis',0,600)])
    if m != 7:  # aucun relevé saisi pour juillet
        e('BQ', D(2025,m,12), [('512000',None,'VIR DUPUIS SA',3600,0),('411000',CLI,'Règlement Dupuis',0,3600)])
        e('BQ', D(2025,m,15), [('626000',None,f'PRLV SEPA ORANGE {m:02d}25',45,0),('512000',None,f'PRLV SEPA ORANGE {m:02d}25',0,45)])
        e('BQ', D(2025,m,20), [('401000',BAIL,'Loyer',800,0),('512000',None,'Loyer',0,800)])
        e('BQ', D(2025,m,25), [('164000',None,'Echéance prêt',400,0),('661100',None,'Intérêts',50,0),('512000',None,'Echéance prêt',0,450)])
    if m != 8: e('OD', D(2025,m,28), [('641000',None,'Salaires',2000,0),('421000',None,'Salaires',0,2000)])
e('BQ', D(2025,3,18), [('218300',None,'VIR INFOPRO ORDINATEUR',1450,0),('512000',None,'VIR INFOPRO ORDINATEUR',0,1450)])
e('BQ', D(2025,4,2), [('512000',None,'VIR RECU REF 88412',980,0),('471000',None,'VIR RECU REF 88412',0,980)])
e('BQ', D(2025,9,8), [('401000',INF,'VIR INFOPRO',600,0),('512000',None,'VIR INFOPRO',0,600)])
e('BQ', D(2025,9,9), [('512000',None,'VIR DUPUIS SA',1500,0),('411000',CLI,'Règlement Dupuis',0,1500)])
with open('987654321FEC20251231.txt','w',encoding='utf-8',newline='') as f:
    f.write('|'.join(H)+'\n')
    for r in rows: f.write('|'.join(r)+'\n')
print(len(rows),'lignes')
