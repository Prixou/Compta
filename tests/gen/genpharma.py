import datetime, random
random.seed(5)
H = 'JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|CompAuxNum|CompAuxLib|PieceRef|PieceDate|EcritureLib|Debit|Credit|EcritureLet|DateLet|ValidDate|Montantdevise|Idevise'.split('|')
L = {'530000':'Caisse','511500':'Cartes bancaires à encaisser','511200':'Chèques à encaisser','512000':'Banque','411000':'Clients tiers payant','411300':'Clients particuliers',
     '707021':'Ventes TVA 2,1%','707055':'Ventes TVA 5,5%','707010':'Ventes TVA 10%','707020':'Ventes TVA 20%','706100':'Honoraires de dispensation',
     '445712':'TVA collectée 2,1%','445715':'TVA collectée 5,5%','445710':'TVA collectée 10%','445720':'TVA collectée 20%',
     '607000':'Achats de marchandises','609700':'RRR obtenus sur achats','445660':'TVA déductible','401000':'Fournisseurs','101000':'Capital','370000':'Stock de marchandises','110000':'Report à nouveau','627000':'Frais bancaires'}
ORG = [('CPAM30','CPAM DU GARD'),('MSA','MSA LANGUEDOC'),('MUT01','HARMONIE MUTUELLE'),('MUT02','MGEN'),('VIAMED','VIAMEDIS'),('ALMERYS','ALMERYS')]
PAT = ('P-DUPONT','DUPONT JEAN (ardoise)')
rows=[]; n=[0]
def e(j,d,lines,lib=''):
    n[0]+=1; ds=d.strftime('%Y%m%d')
    for acc,aux,l,de,cr in lines:
        a=aux or ('','')
        rows.append([j,{'AN':'A nouveaux','VT':'Ventes LGO','BQ':'Banque','AC':'Achats','OD':'Opérations diverses'}[j],str(n[0]),ds,acc,L[acc],a[0],a[1],f'{j}{n[0]}',ds,l,f'{de:.2f}'.replace('.',','),f'{cr:.2f}'.replace('.',','),'','',ds,'',''])
D=datetime.date
e('AN',D(2025,1,1),[('512000',None,'AN',40000,0),('370000',None,'AN',90000,0),('411000',ORG[0],'AN',18000,0),('411000',ORG[2],'AN',6000,0),('101000',None,'AN',0,100000),('401000',('OCP','OCP REPARTITION'),'AN',0,54000)])
tp_due = {o[0]:0 for o in ORG}
for day in range(0, 365):
    d = D(2025,1,1)+datetime.timedelta(days=day)
    if d.weekday()==6: continue
    ht = {'707021':random.uniform(900,1500),'707055':random.uniform(50,150),'707010':random.uniform(100,250),'707020':random.uniform(150,400)}
    tx = {'707021':.021,'707055':.055,'707010':.10,'707020':.20}; tva = {'707021':'445712','707055':'445715','707010':'445710','707020':'445720'}
    ttc = sum(v*(1+tx[k]) for k,v in ht.items()) + 120
    tp_amo = round(ttc*0.45,2); tp_amc = round(ttc*0.15,2); cb = round(ttc*0.3,2); esp = round(ttc*0.07,2)
    ch = round(ttc - tp_amo - tp_amc - cb - esp, 2)
    org_amo = ORG[0] if random.random()<0.85 else ORG[1]; org_amc = random.choice(ORG[2:])
    lines = [('411000',org_amo,'Z caisse TP AMO',tp_amo,0),('411000',org_amc,'Z caisse TP AMC',tp_amc,0),('511500',None,'Z caisse CB',cb,0),('530000',None,'Z caisse espèces',esp,0),('511200',None,'Z caisse chèques',ch,0)]
    tp_due[org_amo[0]] += tp_amo; tp_due[org_amc[0]] += tp_amc
    for k,v in ht.items(): lines += [(k,None,'Z caisse',0,round(v,2)),(tva[k],None,'Z caisse',0,round(v*tx[k],2))]
    lines += [('706100',None,'Honoraires dispensation',0,120)]
    diff = round(sum(l[3]-l[4] for l in lines),2)
    lines[-1] = ('706100',None,'Honoraires dispensation',0,round(120+diff,2))
    e('VT',d,lines)
    # remise CB + chèques en banque le lendemain, espèces versées chaque semaine
    e('BQ',d+datetime.timedelta(days=1),[('512000',None,'REMISE CB',cb,0),('511500',None,'REMISE CB',0,cb)])
    e('BQ',d+datetime.timedelta(days=2),[('512000',None,'REMISE CHEQUES',ch,0),('511200',None,'REMISE CHEQUES',0,ch)])
    e('BQ',d+datetime.timedelta(days=1),[('512000',None,'VERSEMENT ESPECES',esp,0),('530000',None,'VERSEMENT ESPECES',0,esp)])
    # paiements NOEMIE groupés (CPAM tous les 3 jours, mutuelles chaque semaine), avec rejets non payés
    if day % 3 == 0:
        for o in ORG[:2]:
            amt = round(tp_due[o[0]]*0.97,2)
            if amt>0: e('BQ',d+datetime.timedelta(days=4),[('512000',None,f'VIR NOEMIE {o[1]}',amt,0),('411000',o,f'VIR NOEMIE {o[1]}',0,amt)]); tp_due[o[0]] -= amt
    if day % 7 == 0:
        for o in ORG[2:]:
            amt = round(tp_due[o[0]]*(1.02 if o[0]=='MUT02' else 0.95),2)   # MGEN paie un peu plus (trop-perçu)
            if amt>0: e('BQ',d+datetime.timedelta(days=5),[('512000',None,f'VIR {o[1]}',amt,0),('411000',o,f'VIR {o[1]}',0,amt)]); tp_due[o[0]] -= amt
    if day % 4 == 0:
        ht2 = round(random.uniform(3000,6000),2)
        e('AC',d,[('607000',None,'Facture OCP',ht2,0),('445660',None,'Facture OCP',round(ht2*0.04,2),0),('401000',('OCP','OCP REPARTITION'),'Facture OCP',0,round(ht2*1.04,2))])
        e('BQ',d+datetime.timedelta(days=10),[('401000',('OCP','OCP REPARTITION'),'PRLV OCP',round(ht2*1.04,2),0),('512000',None,'PRLV OCP',0,round(ht2*1.04,2))])
e('VT',D(2025,3,4),[('411300',PAT,'Ardoise M. Dupont',85.4,0),('707020',None,'Ardoise',0,71.17),('445720',None,'Ardoise',0,14.23)])
with open('222222222FEC20251231.txt','w',encoding='utf-8') as f:
    f.write('|'.join(H)+'\n')
    for r in rows: f.write('|'.join(r)+'\n')
print(len(rows),'lignes')
