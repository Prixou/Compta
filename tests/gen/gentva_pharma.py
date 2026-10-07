# FEC de test du contrôle de TVA d'une officine fictive, avec les montants attendus calculés indépendamment.
#   python3 gentva_pharma.py [dossier de sortie]
# Produit 555555555FEC20251231.txt et 555555555-attendu.json (TVA des opérations de chaque mois, déclarations).
import random, datetime, json, sys, os
random.seed(11)
OUTDIR = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = os.path.join(OUTDIR, '555555555FEC20251231.txt')
EXP = os.path.join(OUTDIR, '555555555-attendu.json')
H = ['JournalCode','JournalLib','EcritureNum','EcritureDate','CompteNum','CompteLib','CompAuxNum','CompAuxLib','PieceRef','PieceDate','EcritureLib','Debit','Credit','EcritureLet','DateLet','ValidDate','Montantdevise','Idevise']
J = {'AN':'A nouveaux','VE':'Ventes','AC':'Achats','BQ':'Banque','OD':'Opérations diverses'}
L = {'101000':'Capital','218300':'Matériel informatique','401000':'Fournisseurs','411000':'Clients tiers payant',
     '445510':'TVA à décaisser','445620':'TVA déductible sur immobilisations','445660':'TVA déductible sur ABS','445670':'Crédit de TVA à reporter',
     '445710':'TVA collectée 10%','445712':'TVA collectée 2,1%','445715':'TVA collectée 5,5%','445720':'TVA collectée 20%',
     '511200':'Cartes bancaires à encaisser','512000':'Banque Populaire','530000':'Caisse',
     '607000':'Achats de marchandises','609700':'Remises et ristournes obtenues','658000':"Écarts d'arrondi (charges)",
     '706100':'Honoraires de dispensation','707010':'Ventes TVA 10%','707020':'Ventes TVA 20%','707021':'Ventes TVA 2,1%','707055':'Ventes TVA 5,5%',
     '708800':'Rémunération sur objectifs de santé publique','758000':"Écarts d'arrondi (produits)"}
VAT = {2.1: '445712', 5.5: '445715', 10: '445710', 20: '445720'}
CA = {2.1: '707021', 5.5: '707055', 10: '707010', 20: '707020'}
rows = []; num = [0]
r2 = lambda x: round(x + 1e-9, 2)
def fr(x): return f'{x:.2f}'.replace('.', ',')
lines_all = []  # (date, kind, compte, d, c)
def ent(j, date, lines, kind='op', lib=None):
    num[0] += 1; n = num[0]; d = date.strftime('%Y%m%d'); p = f'{j}{n:05d}'
    tot = r2(sum(l[2] for l in lines) - sum(l[3] for l in lines))
    assert abs(tot) < 0.005, (lines, tot)
    for (acc, lb, deb, cred) in lines:
        rows.append([j, J[j], str(n), d, acc, L[acc], '', '', p, d, lb, fr(deb), fr(cred), '', '', d, '', ''])
        lines_all.append((date, kind, acc, deb, cred))
D = datetime.date
def last(y, m): return (D(y + (m == 12), m % 12 + 1, 1) - datetime.timedelta(days=1))

# À-nouveaux : TVA à décaisser de décembre 2024 (payée en janvier)
ent('AN', D(2025, 1, 1), [('445510', 'A nouveau', 0, 1850), ('101000', 'A nouveau', 1850, 0)], kind='an')
exp = {}
late_march = None
for m in range(1, 13):
    y = 2025
    E = exp.setdefault(f'{y}-{m:02d}', {'coll': {}, 'ded': 0, 'dedImmo': 0, 'ca': {}})
    def addcoll(rt, v): E['coll'][str(rt)] = r2(E['coll'].get(str(rt), 0) + v)
    def addca(acc, v): E['ca'][acc] = r2(E['ca'].get(acc, 0) + v)
    # Z de caisse quotidiens (jours ouvrés) : ventes comptoir aux quatre taux
    for day in range(1, last(y, m).day + 1):
        dt = D(y, m, day)
        if dt.weekday() == 6: continue
        mult = 0.45 if m == 8 else 1
        hts = {2.1: r2(random.uniform(300, 700) * mult), 5.5: r2(random.uniform(150, 350) * mult), 10: r2(random.uniform(40, 120) * mult), 20: r2(random.uniform(250, 550) * mult)}
        lines = []
        tot = 0
        for rt, ht in hts.items():
            tva = r2(ht * rt / 100)
            # Anomalie : TVA à 5,5 % passée à 2,1 % le 12 juin
            if dt == D(2025, 6, 12) and rt == 5.5: tva = r2(ht * 2.1 / 100)
            lines += [(CA[rt], f'Z caisse {day:02d}/{m:02d}', 0, ht), (VAT[rt], f'Z caisse {day:02d}/{m:02d}', 0, tva)]
            addca(CA[rt], ht); addcoll(rt, tva); tot += ht + tva
        tot = r2(tot)
        cb = r2(tot * 0.7)
        lines = [('511200', f'Z caisse {day:02d}/{m:02d}', cb, 0), ('530000', f'Z caisse {day:02d}/{m:02d}', r2(tot - cb), 0)] + lines
        ent('VE', dt, lines)
    # Factures de tiers payant (assurance maladie) : médicaments remboursables 2,1 % et honoraires de dispensation 2,1 %
    for k in range(2):
        dt = D(y, m, 10 + 10 * k)
        med = r2(random.uniform(9000, 14000)); hon = r2(random.uniform(1500, 2500))
        tva = r2((med + hon) * 0.021)
        ent('VE', dt, [('411000', 'Facture tiers payant CPAM', r2(med + hon + tva), 0), ('707021', 'Facture tiers payant CPAM', 0, med), ('706100', 'Facture tiers payant CPAM', 0, hon), ('445712', 'Facture tiers payant CPAM', 0, tva)])
        addca('707021', med); addca('706100', hon); addcoll(2.1, tva)
    # ROSP (hors champ de la TVA), trimestrielle
    if m % 3 == 0:
        ent('VE', D(y, m, 25), [('411000', 'ROSP trimestre', 1200, 0), ('708800', 'ROSP trimestre', 0, 1200)])
        addca('708800', 1200)
    # Vente à 20 % sans TVA (oubli) le 8 octobre
    if m == 10:
        ent('VE', D(y, 10, 8), [('411000', 'Vente matériel orthopédique', 480, 0), ('707020', 'Vente matériel orthopédique', 0, 480)])
        addca('707020', 480)
    # Achats grossiste : factures à 2,1 % + 5,5 % + 20 %
    for k in range(4):
        dt = D(y, m, 3 + 7 * k)
        parts = {2.1: r2(random.uniform(6000, 9000)), 5.5: r2(random.uniform(1500, 2500)), 20: r2(random.uniform(1500, 3000))}
        tva = r2(sum(r2(v * rt / 100) for rt, v in parts.items()))
        ht = r2(sum(parts.values()))
        lines = [('607000', 'Facture grossiste', ht, 0), ('445660', 'Facture grossiste', tva, 0), ('401000', 'Facture grossiste', 0, r2(ht + tva))]
        if m == 3 and k == 3:
            # Facture du 24 mars saisie après la déclaration de mars : non reprise dans l'OD de mars
            late_march = tva
        ent('AC', dt, lines)
        E['ded'] = r2(E['ded'] + tva)
    # Remise de fin de trimestre (avoir)
    if m % 3 == 0:
        ent('AC', D(y, m, 27), [('401000', 'RFA laboratoire', 600, 0), ('609700', 'RFA laboratoire', 0, 500), ('445660', 'RFA laboratoire', 0, 100)])
        E['ded'] = r2(E['ded'] - 100)
    # Investissement en août (crédit de TVA)
    if m == 8:
        ent('AC', D(y, 8, 18), [('218300', 'Robot de dispensation', 60000, 0), ('445620', 'Robot de dispensation', 12000, 0), ('401000', 'Robot de dispensation', 0, 72000)])
        E['dedImmo'] = r2(E['dedImmo'] + 12000)

# Déclarations (OD de TVA) établies sur le solde des comptes, comme le logiciel de production, et paiements
bal = {}
def balance_at(dt, excl=None):
    b = {}
    for (d, kind, acc, deb, cred) in lines_all:
        if d <= dt and acc.startswith('445') and not (excl and excl(d, kind, acc, deb, cred)):
            b[acc] = r2(b.get(acc, 0) + deb - cred)
    return b
decls = {}
credit = 0
for m in range(1, 13):
    y = 2025
    end = last(y, m)
    od_date = D(y, m + 1, 15) if m <= 6 else end
    # Solde des comptes de TVA collectée et déductible à la fin du mois, déclarations passées comprises
    excl = None
    if m == 3:
        # la facture tardive (24 mars) n'était pas saisie au moment de la déclaration de mars
        excl = lambda d, kind, acc, deb, cred: d == D(2025, 3, 24) and acc == '445660'
    b = balance_at(end, excl)
    coll = {a: -v for a, v in b.items() if a.startswith('4457') and abs(v) >= 0.005}
    ded = b.get('445660', 0); dedi = b.get('445620', 0)
    brute = r2(sum(coll.values()))
    net = r2(brute - ded - dedi - credit)
    lines = [(a, f'TVA {m:02d}/{y}', v, 0) for a, v in coll.items()]
    if ded: lines.append(('445660', f'TVA {m:02d}/{y}', 0, ded))
    if dedi: lines.append(('445620', f'TVA {m:02d}/{y}', 0, dedi))
    used = credit
    if used: lines.append(('445670', f'TVA {m:02d}/{y}', 0, used))
    if net >= 0:
        due = round(net)
        lines.append(('445510', f'TVA {m:02d}/{y}', 0, due))
        diff = r2(due - net)
        if diff > 0: lines.append(('658000', 'Arrondi TVA', diff, 0))
        elif diff < 0: lines.append(('758000', 'Arrondi TVA', 0, -diff))
        credit = 0; cnew = 0
    else:
        cnew = r2(-net); due = 0
        lines.append(('445670', f'TVA {m:02d}/{y}', cnew, 0))
        credit = cnew
    ent('OD', od_date, lines, kind='decl')
    decls[f'{y}-{m:02d}'] = {'date': od_date.isoformat(), 'coll': brute, 'ded': ded, 'dedImmo': dedi, 'due': due, 'creditNew': cnew, 'creditUsed': used}
    if due:
        pd = D(y + (m == 12), m % 12 + 1, 19)
        if pd.year == 2025:
            ent('BQ', pd, [('445510', f'Paiement TVA {m:02d}/{y}', due, 0), ('512000', f'Paiement TVA {m:02d}/{y}', 0, due)], kind='pay')
# Paiement de la TVA de décembre 2024 (à-nouveau)
ent('BQ', D(2025, 1, 20), [('445510', 'Paiement TVA 12/2024', 1850, 0), ('512000', 'Paiement TVA 12/2024', 0, 1850)], kind='pay')

rows.sort(key=lambda r: (r[3], int(r[2])))
with open(OUT, 'w', encoding='utf-8', newline='') as f:
    f.write('\t'.join(H) + '\r\n')
    for r in rows: f.write('\t'.join(r) + '\r\n')
with open(EXP, 'w', encoding='utf-8') as f:
    json.dump({'months': exp, 'decls': decls, 'lateMarch': late_march}, f, ensure_ascii=False, indent=1)
print(OUT, len(rows), 'lignes')
