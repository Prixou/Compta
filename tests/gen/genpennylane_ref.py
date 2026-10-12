# FEC de référence au format Pennylane (structure d'un export réel, données entièrement inventées) :
#   - exercice du 01/09/2026 au 31/08/2027, export en cours d'exercice (écritures du 01/09 au 12/10/2026), ValidDate vide ;
#   - n° d'écriture unique sur tout le fichier, PieceRef aléatoire, montants « 110,0 », Montantdevise signé et devise EUR ;
#   - journaux AN (à-nouveaux détaillés, une ligne par pièce non soldée, chaîne des dates de report en tête du libellé),
#     BQ1 (banque, libellés « … (ref: …) - LCC: … - NBE: … - IBE: … - CPY: IBAN »), HA, VT, RT (virement de la TVA
#     sur encaissements en TVA exigible au règlement), OD (extournes FNP, CCA, PCA) ;
#   - comptes suffixés par taux (…0003 pas de TVA, …0006 5,5 %, …0008 10 %, …0009 20 %, libellé « (TVA 10%) ») ;
#   - opérations bancaires non rapprochées en 4716001 (décaissements) et 4717001 (encaissements) en attente ;
#   - n° de facture de vente dans le libellé de la ligne client 411 (« Facture X - F-260158 », « Avoir X - F-260175 »).
#   python3 genpennylane_ref.py [dossier de sortie]   → 900000009FEC20270831.txt et 900000009-attendu.json
import sys, os, random, string, datetime, json
random.seed(42)
OUTDIR = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = os.path.join(OUTDIR, '900000009FEC20270831.txt')
EXP = os.path.join(OUTDIR, '900000009-attendu.json')
H = ['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate',
     'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise']
J = {'AN': 'Journal des à-nouveaux', 'BQ1': 'Journal de trésorerie - BANQUE EXEMPLE', 'HA': 'Journal d’achat', 'VT': 'Journal de vente',
     'RT': 'Journal des récupération de TVA', 'OD': 'Journal des opérations diverses'}
L = {
    '101': 'Capital', '1068': 'Autres réserves', '2154': 'Matériels industriels', '401': 'Fournisseurs', '411': 'Clients',
    '4081000009': 'Fournisseurs (TVA 20%)', '44551': 'TVA à décaisser', '44566': 'TVA sur autres biens et services',
    '4456400008': 'TVA déductible sur encaissements (TVA 10%)', '4456400009': 'TVA déductible sur encaissements (TVA 20%)',
    '44571006': 'TVA collectée à 5.5%', '44571008': 'TVA collectée à 10%', '44571009': 'TVA collectée à 20%',
    '4457400006': 'TVA collectée sur encaissements (TVA 5.5%)', '4457400008': 'TVA collectée sur encaissements (TVA 10%)',
    '4457400009': 'TVA collectée sur encaissements (TVA 20%)', '44586': "Taxes sur le chiffre d'affaires sur factures non parvenues",
    '4716001': 'Banque Exemple - BANQUE EXEMPLE - décaissements en attente', '4717001': 'Banque Exemple - BANQUE EXEMPLE - encaissements en attente',
    '4860000009': "Charges constatées d'avance (TVA 20%)", '487': "Produits constatés d'avance", '5121001': 'Banque Exemple - BANQUE EXEMPLE',
    '6010000009': 'Achats stockés - Matières premières et fournitures (TVA 20%)', '6061000009': 'Fournitures non stockables (eau, énergie, etc.) (TVA 20%)',
    '6061400009': 'CARBURANT (TVA 20%)', '6130010009': 'LOCATION SCI EXEMPLE (TVA 20%)', '6140000009': 'Charges locatives et de copropriété (TVA 20%)',
    '6257000008': 'Réceptions (TVA 10%)', '627': 'Services bancaires et assimilés', '6475000009': 'Médecine du travail, pharmacie (TVA 20%)',
    '7061': 'PRESTATIONS 10.00 %', '7061000008': 'PRESTATIONS 10.00 % (TVA 10%)', '7062000009': 'PRESTATIONS 20.00 % (TVA 20%)',
    '7065500006': 'PRESTATIONS 5.5% (TVA 5.5%)',
}
COLL_ATT = {10: '4457400008', 20: '4457400009', 5.5: '4457400006'}
COLL = {10: '44571008', 20: '44571009', 5.5: '44571006'}
PROD = {10: '7061000008', 20: '7062000009', 5.5: '7065500006'}
IBAN = 'FR7699999000010000000000099'
D = datetime.date
rows = []
num = [0]
letters = [0]


def pl(x):  # format des montants Pennylane : « 110,0 », « 24705,99 »
    return repr(round(x + 0.0, 2)).replace('.', ',')


def ref():
    return ''.join(random.choice(string.ascii_uppercase + string.digits) for _ in range(10))


def next_let():
    letters[0] += 1
    n, s = letters[0], ''
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def ent(j, date, lines, piece=None):
    """lines : (compte, (aux, auxlib) | None, libellé, débit, crédit). Renvoie les lignes créées (pour le lettrage)."""
    assert abs(sum(l[3] for l in lines) - sum(l[4] for l in lines)) < 0.005, lines
    num[0] += 1
    d = date.strftime('%Y%m%d')
    p = piece or ref()
    out = []
    for (acc, aux, lib, deb, cred) in lines:
        a = aux or ('', '')
        r = [j, J[j], str(num[0]), d, acc, L[acc], a[0], a[1], p, d, lib, pl(deb), pl(cred), '', '', '', f'{deb - cred:.2f}'.replace('.', ','), 'EUR']
        rows.append(r)
        out.append(r)
    return out


def letter(rs, date):
    k = next_let()
    for r in rs:
        r[13] = k
        r[14] = date.strftime('%Y%m%d')


def bank_lib(head, lcc='', npy='', nbe='SARL EXEMPLE SERVICES', refx=None):
    s = f'{head} (ref: {refx or ref()})'
    if lcc:
        s += f' - LCC: {lcc}'
    s += f' - LIB: BICEXFRPPXXX - NBE: {nbe}'
    if npy:
        s += f' - NPY: {npy}'
    return s + f' - MMO: EUR2000000001{random.randint(10000, 99999)} - CBE: {IBAN}'


r2 = lambda x: round(x + 0.0, 2)
CL = {k: v for k, v in [
    ('DURAND', ('411100901', 'DURAND ALAIN')), ('TILLEULS', ('411100902', 'SCI LES TILLEULS')), ('MARCHAND', ('411100903', 'MARCHAND SOPHIE')),
    ('LEROY', ('411100904', 'LEROY PAUL')), ('PINS', ('411100905', 'SCI DES PINS')), ('DELTA', ('411DELTA', 'DELTA BATIMENT')),
    ('BERNARD', ('411100907', 'BERNARD LUC')), ('PAIRE', ('411CPAIRE', 'PAIRE JEAN'))]}
SUP = {'CARBU': ('401100901', 'Carburant'), 'RESTO': ('401FRESTAU', 'RESTAURANT'), 'EDF': ('401FEDF', 'EDF'), 'MATX': ('401FMATERIAUX', 'MATERIAUX DU SUD')}
exp = {'sept': {'coll': {}, 'inv': {}, 'base': {}, 'ded': 0.0, 'dedAtt': 0.0, 'missing': [], 'missingOct': []}}
E = exp['sept']


def add(dct, k, v):
    dct[str(k)] = r2(dct.get(str(k), 0) + v)


# ---------- À-nouveaux (01/09/2026) : une ligne par pièce non soldée ----------
an_piece = ref()
anl = [
    ('101', None, 'Report à nouveau', 0, 7500.0),
    ('2154', None, 'Report à nouveau', 2350.0, 0),
    ('5121001', None, 'Report à nouveau', 18450.0, 0),
    ('44551', None, 'Report à nouveau', 0, 960.0),
    # facture impayée depuis mai : créance échue de plus de 90 jours au 30/09
    ('411', CL['BERNARD'], f'2026-05-20 – Facture BERNARD LUC - F-260108 – {ref()} - Report à nouveau', 8360.0, 0),
    # facture de juin réglée en septembre par un virement qui cite son n° (resté en compte d'attente)
    ('411', CL['DELTA'], f'2026-06-10 – Facture DELTA BATIMENT - F-260120 – {ref()} - Report à nouveau', 2915.0, 0),
    # facture et règlement anciens repris tous deux en à-nouveau, non lettrés : soldés entre eux
    ('411', CL['PAIRE'], f'2025-09-01 – 2024-09-01 – 2024-06-14 – PAIRE 10% F-240901 – {ref()} - Report à nouveau', 4180.2, 0),
    ('411', CL['PAIRE'], f'2025-09-01 – 2024-09-01 – 2024-07-02 – VIR M JEAN PAIRE VIREME – {ref()} - Report à nouveau', 0, 4180.2),
    ('401', SUP['RESTO'], f'2025-09-01 – 2025-06-19 – RESTAURANT 9.9.9.1 – 9.9.9.1 – {ref()} - Report à nouveau', 0, 31.4),
    ('4457400008', None, '2026-05-20 – Facture BERNARD LUC - F-260108 – Report à nouveau', 0, 760.0),
    ('4457400008', None, '2026-06-10 – Facture DELTA BATIMENT - F-260120 – Report à nouveau', 0, 265.0),
    ('487', None, 'Report à nouveau', 0, 4200.0),
    ('4081000009', None, 'Report à nouveau', 0, 2160.0),
    ('44586', None, 'Report à nouveau', 360.0, 0),
    ('4860000009', None, 'Report à nouveau', 138.0, 0),
]
bal = sum(l[3] - l[4] for l in anl)
anl.append(('1068', None, 'Report à nouveau', 0 if bal > 0 else -bal, bal if bal > 0 else 0))
an_rows = ent('AN', D(2026, 9, 1), anl, piece=an_piece)
inv_rows = {'F-260108': [r for r in an_rows if 'F-260108' in r[10] and r[4] == '411'], 'F-260120': [r for r in an_rows if 'F-260120' in r[10] and r[4] == '411']}

# ---------- Extournes du 01/09 (OD) : régularisations sans TVA ----------
ent('OD', D(2026, 9, 1), [('487', None, 'PCA – SCI DES PINS – 20/08/2026 au 15/10/2026 – Extourne', 4200.0, 0),
                          ('7061', None, 'PCA – SCI DES PINS – 20/08/2026 au 15/10/2026 – Extourne', 0, 4200.0)])
ent('OD', D(2026, 9, 1), [('4081000009', None, 'FNP – 31/08/2026 – Extourne', 2160.0, 0), ('6140000009', None, 'FNP – 31/08/2026 – Extourne', 0, 1800.0),
                          ('44586', None, 'FNP – 31/08/2026 – Extourne', 0, 360.0)])
ent('OD', D(2026, 9, 1), [('4860000009', None, 'CCA – MEDECINE DU TRAVAIL EXEMPLE – 01/01/2026 au 31/12/2026', 0, 138.0),
                          ('6475000009', None, 'CCA – MEDECINE DU TRAVAIL EXEMPLE – 01/01/2026 au 31/12/2026', 138.0, 0)])


# ---------- Factures de vente (TVA sur les encaissements) ----------
def sale(date, n, who, ht, rate=10, avoir=False):
    tva = r2(ht * rate / 100)
    ttc = r2(ht + tva)
    c = CL[who]
    lib = f"{'Avoir' if avoir else 'Facture'} {c[1]} - F-26{n:04d}"
    prod_lib = f'Forfait déplacement - Avoir {c[1]}' if avoir else lib
    s = -1 if avoir else 1
    rs = ent('VT', date, [(PROD[rate], None, prod_lib, ht if avoir else 0, 0 if avoir else ht),
                          ('411', c, lib, 0 if avoir else ttc, ttc if avoir else 0),
                          (COLL_ATT[rate], None, prod_lib, tva if avoir else 0, 0 if avoir else tva)])
    if date.month == 9:
        add(E['inv'], rate, s * tva)
        add(E['base'], rate, s * ht)
    inv_rows[f'F-26{n:04d}'] = [rs[1]]
    return ttc, tva


def rt_coll(date, lib, rate, tva):  # virement de la TVA encaissée en TVA exigible
    rs = ent('RT', date, [(COLL_ATT[rate], None, lib, tva, 0), (COLL[rate], None, lib, 0, tva)])
    letter([rs[0]], date)
    if date.month == 9:
        add(E['coll'], rate, tva)


def receipt(date, inv, who, ttc, tva, rate=10, lcc=''):
    lib = bank_lib(f'VIR INST DE {CL[who][1]}'[:31], lcc or f'EXEMPLE SERVICES {inv}', CL[who][1])
    rs = ent('BQ1', date, [('5121001', None, lib, ttc, 0), ('411', CL[who], lib, 0, ttc)])
    letter(inv_rows[inv] + [rs[1]], date)
    rt_coll(date, lib, rate, tva)


sept = [(2, 158, 'DURAND', 180.0), (4, 160, 'TILLEULS', 2740.0), (7, 161, 'MARCHAND', 1385.0), (8, 162, 'LEROY', 620.0), (9, 163, 'DURAND', 1040.0),
        (10, 164, 'PINS', 455.0), (11, 165, 'MARCHAND', 210.0), (14, 166, 'LEROY', 1935.0), (15, 167, 'TILLEULS', 815.0), (16, 168, 'DURAND', 1182.5),
        (17, 169, 'PINS', 2890.0), (18, 170, 'DURAND', 3975.0), (21, 171, 'MARCHAND', 940.0), (22, 172, 'LEROY', 165.0), (23, 173, 'TILLEULS', 1070.0),
        (24, 174, 'PINS', 585.0), (28, 180, 'MARCHAND', 1610.0), (29, 184, 'DURAND', 345.0), (29, 185, 'LEROY', 2210.0), (30, 186, 'PINS', 560.0)]
ttcs = {}
for (day, n, who, ht) in sept:
    ttcs[n] = sale(D(2026, 9, day), n, who, ht)
ttcs[176] = sale(D(2026, 9, 24), 176, 'TILLEULS', 1740.0, rate=20)
ttcs[177] = sale(D(2026, 9, 25), 177, 'LEROY', 4860.0, rate=5.5)
ttcs[175] = sale(D(2026, 9, 24), 175, 'DURAND', 230.0, avoir=True)
ttcs[178] = sale(D(2026, 9, 25), 178, 'MARCHAND', 380.0)
ttcs[179] = sale(D(2026, 9, 26), 179, 'PINS', 640.0, rate=20)
# F-260159 (isolée) et F-260181 à F-260183 (trou de trois) jamais saisies en septembre
E['missing'] = ['F-260159', 'F-260181', 'F-260182', 'F-260183']
oct_inv = [(1, 187, 'DURAND', 710.0), (2, 188, 'TILLEULS', 1340.0), (5, 189, 'LEROY', 1015.0), (6, 191, 'PINS', 1290.0), (8, 192, 'MARCHAND', 325.0),
           (9, 193, 'DURAND', 2085.0), (12, 194, 'LEROY', 505.0)]
for (day, n, who, ht) in oct_inv:
    ttcs[n] = sale(D(2026, 10, day), n, who, ht)
E['missingOct'] = ['F-260190']

# Règlements clients rapprochés (lettrés), avec le virement de la TVA en TVA exigible
receipt(D(2026, 9, 10), 'F-260158', 'DURAND', *ttcs[158])
receipt(D(2026, 9, 14), 'F-260160', 'TILLEULS', *ttcs[160])
receipt(D(2026, 9, 18), 'F-260161', 'MARCHAND', *ttcs[161])
receipt(D(2026, 9, 21), 'F-260162', 'LEROY', *ttcs[162])
receipt(D(2026, 9, 25), 'F-260166', 'LEROY', *ttcs[166])
receipt(D(2026, 9, 28), 'F-260176', 'TILLEULS', *ttcs[176], rate=20)
receipt(D(2026, 9, 29), 'F-260177', 'LEROY', *ttcs[177], rate=5.5)
receipt(D(2026, 10, 5), 'F-260164', 'PINS', *ttcs[164])

# ---------- Achats ----------
def purchase(date, sup, compte, ht, rate, vat_acc, lib):
    tva = r2(ht * rate / 100)
    ttc = r2(ht + tva)
    rs = ent('HA', date, [(compte, None, lib, ht, 0), ('401', SUP[sup], lib, 0, ttc), (vat_acc, None, lib, tva, 0)])
    if date.month == 9:
        if vat_acc == '44566':
            E['ded'] = r2(E['ded'] + tva)
        else:
            E['dedAtt'] = r2(E['dedAtt'] + tva)
    return rs[1], ttc, tva


def card(date, sup, rs401, ttc, head, rate=None, tva=0.0):
    lib = head
    rs = ent('BQ1', date, [('5121001', None, lib, 0, ttc), ('401', SUP[sup], lib, ttc, 0)])
    letter([rs401, rs[1]], date)
    if rate:  # TVA déductible sur encaissements : déductible au paiement
        t = ent('RT', date, [(f'445640000{8 if rate == 10 else 9}', None, lib, 0, tva), ('44566', None, lib, tva, 0)])
        letter([t[0]], date)
        if date.month == 9:
            E['ded'] = r2(E['ded'] + tva)


for i, (day, ht) in enumerate([(1, 118.4), (6, 96.25), (12, 84.1), (19, 91.7), (26, 102.35)]):
    r401, ttc, tva = purchase(D(2026, 9, day), 'CARBU', '6061400009', ht, 20, '44566', f'Facture Carburant - 1000{10 + i} 0000{i + 1} 00 02 00{100000 + i}')
    card(D(2026, 9, day + 1), 'CARBU', r401, ttc, f'CARTE X1111 STATION EXEMPLE {day + 1:02d}/09')
# Boulangerie (restaurant) : deux fois affectée et lettrée en septembre, puis en compte d'attente le 28/09 et le 06/10
for day, ht in [(3, 7.27), (9, 9.55)]:
    r401, ttc, tva = purchase(D(2026, 9, day), 'RESTO', '6257000008', ht, 10, '4456400008', f'Facture BOULANGERIE DU PORT - {ref()[:4].lower()} - {12000 + day}')
    card(D(2026, 9, day), 'RESTO', r401, ttc, 'CARTE X1111 BOULANGERIE DU PORT', rate=10, tva=tva)
r401, ttc, tva = purchase(D(2026, 9, 2), 'EDF', '6061000009', 52.18, 20, '44566', 'Facture EDF - 10000000001')
lib = bank_lib('ELECTRICITE DE FRANCE', 'EXEMPLE SERVICES REF EDF 1000000002', 'SARL EXEMPLE SERVICES', 'EDF')
rs = ent('BQ1', D(2026, 9, 2), [('5121001', None, lib, 0, ttc), ('401', SUP['EDF'], lib, ttc, 0)])
letter([r401, rs[1]], D(2026, 9, 2))
purchase(D(2026, 9, 16), 'MATX', '6010000009', 1987.6, 20, '44566', 'Facture MATERIAUX DU SUD - 0000000777')

# ---------- Banque : charges payées directement, TVA du mois précédent, opérations en attente ----------
for d in [D(2026, 9, 5), D(2026, 10, 5)]:
    lib = bank_lib('WEB SCI EXEMPLE LOYER', 'LOYER', 'SARL EXEMPLE SERVICES', 'SCI EXEMPLE', 'LOYER')
    ent('BQ1', d, [('5121001', None, lib, 0, 1650.0), ('6130010009', None, lib, 1650.0, 0)])
    ent('BQ1', d + datetime.timedelta(days=5), [('5121001', None, 'FRAIS TENUE DE COMPTE PROFESSIO', 0, 12.9), ('627', None, 'FRAIS TENUE DE COMPTE PROFESSIO', 12.9, 0)])
lib = bank_lib('B2B DIRECTION GENERALE DES FINA', 'TVA1-082026-3310CA3', 'SARL EXEMPLE SERVICES', 'DGFIP')
ent('BQ1', D(2026, 9, 15), [('5121001', None, lib, 0, 960.0), ('44551', None, lib, 960.0, 0)])


def wait(date, head, amt, lcc='', npy='', nbe='SARL EXEMPLE SERVICES', raw=False):
    lib = head if raw else bank_lib(head, lcc, npy, nbe)
    if amt > 0:
        ent('BQ1', date, [('5121001', None, lib, amt, 0), ('4717001', None, lib, 0, amt)])
    else:
        ent('BQ1', date, [('5121001', None, lib, 0, -amt), ('4716001', None, lib, -amt, 0)])


wait(D(2026, 9, 1), '0999001 ASSURANCES EXEMPLE', -186.3, 'MULTIRISQUE PRO EXEMPLE -ECHEANCE 09/2026 COTISATI', nbe='ASSURANCES EXEMPLE', npy='SARL EXEMPLE SERVICES')
rows[-1][10] = rows[-2][10] = rows[-1][10].replace(' - LIB:', ' - LC2: ON MENSUELLE - IBE: FR00ZZZ000000 SEPA - RUM: 000000000099999999999XXRCUR - LIB:')
wait(D(2026, 9, 9), 'TRAVAUX DELTA BATIMENT', 2915.0, 'ACOMPTE F260120', 'DELTA BATIMENT')        # facture F-260120 (à-nouveau)
wait(D(2026, 9, 15), 'VIR ORGANISME EXEMPLE SUBVENTI', 375.0, 'SUBVENTION EXEMPLE 2026', 'ORGANISME EXEMPLE')  # à identifier
wait(D(2026, 9, 28), 'CARTE X1111 BOULANGERIE DU PORT', -8.1, raw=True)                                        # déjà affecté et lettré
wait(D(2026, 9, 29), 'CARTE X1111 PARKING CENTRE', -4.6, raw=True)                                              # à identifier
wait(D(2026, 9, 30), 'VIR INST DE M ALAIN DURAND', 2600.0, 'EXEMPLE SERVICES F260170', 'M ALAIN DURAND')        # facture F-260170 du mois
wait(D(2026, 10, 6), 'CARTE X1111 BOULANGERIE DU PORT', -8.9, raw=True)

rows.sort(key=lambda r: int(r[2]))
with open(OUT, 'w', encoding='utf-8', newline='') as f:
    f.write('\t'.join(H) + '\n')
    for r in rows:
        f.write('\t'.join(r) + '\n')
E['collTotal'] = r2(sum(E['coll'].values()))
with open(EXP, 'w', encoding='utf-8') as f:
    json.dump(exp, f, ensure_ascii=False, indent=1)
print(OUT, len(rows), 'lignes ;', EXP, json.dumps(exp['sept'], ensure_ascii=False))
