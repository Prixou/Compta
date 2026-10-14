# Deux FEC du même exercice (2025), données entièrement inventées, pour le comparateur de FEC :
#   - acd-900000010FEC20251231.txt : présentation ACD (comptes à 8 chiffres, collectifs 40100000 / 41100000 et comptes
#     auxiliaires, journaux AC / VE / BQ / OD / AN, n° d'écriture par journal, n° de facture en pièce, à-nouveaux globaux,
#     paie du mois en une écriture) — c'est le FEC de référence ;
#   - pennylane-900000010FEC20251231.txt : présentation Pennylane (comptes suffixés par le taux de TVA, banque 5121001,
#     tiers 401XXX au nom complet ou différent, journaux HA / VT / BQ1 / OD / AN, n° d'écriture unique, pièce aléatoire,
#     à-nouveaux détaillés par pièce, paie en deux écritures) avec des différences connues :
#       2 factures d'achat absentes, 1 commission bancaire en plus, 1 facture de vente en double, 1 facture au montant
#       différent, 1 facture imputée sur un autre compte, 1 facture datée autrement, à-nouveaux 1068 / 110 répartis autrement ;
#   - pennylane-partiel-900000010FEC20251231.txt : le même, exporté au 31/10/2025 (export en cours d'exercice).
#   python3 gencompare.py [dossier de sortie]   → les trois FEC et compare-attendu.json
import sys, os, json, random

OUTDIR = sys.argv[1] if len(sys.argv) > 1 else '.'
rnd = random.Random(2025)
H = ['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate',
     'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise']

# Comptes : clé logique → (ACD, libellé ACD), (Pennylane, libellé Pennylane)
ACC = {
    'capital': (('10100000', 'Capital'), ('101000', 'Capital')),
    'reserve': (('10680000', 'Autres réserves'), ('106800', 'Autres réserves')),
    'ran': (('11000000', 'Report à nouveau'), ('110000', 'Report à nouveau (solde créditeur)')),
    'bank': (('51200000', 'BANQUE EXEMPLE'), ('5121001', 'Banque Exemple - BANQUE EXEMPLE')),
    'fourn': (('40100000', 'Fournisseurs'), ('401', 'Fournisseurs')),
    'client': (('41100000', 'Clients'), ('411', 'Clients')),
    'tvaded': (('44566000', 'TVA déductible sur ABS'), ('4456600009', 'TVA sur autres biens et services (TVA 20%)')),
    'tvaded55': (('44566000', 'TVA déductible sur ABS'), ('4456600006', 'TVA sur autres biens et services (TVA 5.5%)')),
    'tvacol': (('44571000', 'TVA collectée'), ('44571009', 'TVA collectée à 20%')),
    'vente': (('70600000', 'Prestations de services'), ('7060000009', 'Prestations de services (TVA 20%)')),
    'energie': (('60610000', 'Energie'), ('6061000009', 'Fournitures non stockables (eau, énergie, etc.) (TVA 20%)')),
    'fournit': (('60640000', 'Fournitures administratives'), ('6064000009', 'Fournitures administratives (TVA 20%)')),
    'achats': (('60700000', 'Achats de marchandises'), ('6070000006', 'Achats de marchandises (TVA 5.5%)')),
    'entretien': (('61550000', 'Entretien matériel'), ('6155000009', 'Entretien et réparations sur biens mobiliers (TVA 20%)')),
    'honor': (('62260000', 'Honoraires'), ('6226000009', 'Honoraires (TVA 20%)')),
    'pub': (('62310000', 'Publicité'), ('6231000009', 'Annonces et insertions (TVA 20%)')),
    'telecom': (('62620000', 'Frais de télécommunications'), ('6262000009', 'Frais de télécommunications (TVA 20%)')),
    'frais': (('62780000', 'Frais bancaires'), ('6278000000', 'Autres frais et commissions sur prestations de services')),
    'sal': (('64100000', 'Rémunérations du personnel'), ('641100', 'Salaires, appointements')),
    'charges': (('64500000', 'Charges sociales'), ('645100', 'Cotisations à l\'URSSAF')),
    'perso': (('42100000', 'Personnel - rémunérations dues'), ('421000', 'Personnel - Rémunérations dues')),
    'urssaf': (('43100000', 'Sécurité sociale'), ('431000', 'Sécurité sociale')),
}
# Fournisseurs : code ACD, nom ACD, nom Pennylane, compte de charge, taux de TVA
SUP = [('FBUREAU', 'FOURNITURES BUREAU PRO', 'Fournitures Bureau Pro SAS', 'fournit', 20),
       ('FENERGI', 'ENERGIE PLUS', 'Energie Plus', 'energie', 20),
       ('FGARAGE', 'GARAGE DU CENTRE', 'Garage du Centre SARL', 'entretien', 20),
       ('FCONSEI', 'CABINET CONSEIL', 'Cabinet Conseil', 'honor', 20),
       ('FBOULAN', 'BOULANGERIE ARTISAN', 'BOULANGERIE ARTISANALE', 'achats', 5.5),
       ('FTELECO', 'TELECOM SERVICES', 'Telecom Services', 'telecom', 20)]
CLI = [('CALPHA', 'ALPHA INDUSTRIE', 'Alpha Industrie'), ('CBETA', 'BETA SERVICES', 'Beta Services SAS'),
       ('CGAMMA', 'GAMMA', 'Gamma'), ('CDELTA', 'DELTA CONSTRUCTION', 'Delta Construction')]

# Écritures logiques : (journal, date, pièce, libellé, lignes [(compte logique, tiers, débit, crédit)], options)
ops = []


def add(kind, date, piece, lib, lines, **o):
    ops.append(dict(kind=kind, date=date, piece=piece, lib=lib, lines=lines, **o))


def r2(x):
    return round(x + 1e-9, 2)


# À-nouveaux
add('AN', '2025-01-01', 'AN2025', 'A nouveau', [('capital', None, 0, 10000), ('reserve', None, 0, 5000), ('ran', None, 0, 4200),
                                                ('bank', None, 18000, 0), ('fourn', SUP[0], 0, 1200), ('client', CLI[0], 2400, 0)])
inv = {'F': 0, 'C': 0}
for m in range(1, 13):
    mm = f'{m:02d}'
    for i, (code, an, pn, acc, rate) in enumerate(SUP):
        day = 3 + i * 3
        ht = r2(rnd.uniform(80, 900))
        tva = r2(ht * rate / 100)
        ttc = r2(ht + tva)
        inv['F'] += 1
        num = f'FA25-{inv["F"]:04d}'
        date = f'2025-{mm}-{day:02d}'
        tag = f'{code}-{mm}'
        add('AC', date, num, f'{an} {num}', [(acc, None, ht, 0), ('tvaded55' if rate == 5.5 else 'tvaded', None, tva, 0), ('fourn', SUP[i], 0, ttc)], tag=tag)
        pay = f'2025-{mm}-{min(day + 10, 28):02d}'
        add('BQ', pay, f'PRLV{inv["F"]:04d}', f'PRLV {an}', [('fourn', SUP[i], ttc, 0), ('bank', None, 0, ttc)], tag=tag + '-pay')
    for k, day in ((0, 10), (1, 20)):
        cli = CLI[(m * 2 + k) % 4]
        ht = r2(rnd.uniform(1500, 6000))
        tva = r2(ht * 0.2)
        ttc = r2(ht + tva)
        inv['C'] += 1
        num = f'F2025-{inv["C"]:03d}'
        date = f'2025-{mm}-{day:02d}'
        tag = f'{cli[0]}-{mm}-{day}'
        add('VE', date, num, f'Facture {num} {cli[1]}', [('client', cli, ttc, 0), ('vente', None, 0, ht), ('tvacol', None, 0, tva)], tag=tag)
        rec = f'2025-{mm}-{day + 6:02d}'
        add('BQ', rec, f'VIR{inv["C"]:03d}', f'VIR {cli[1]} {num}', [('bank', None, ttc, 0), ('client', cli, 0, ttc)], tag=tag + '-rec')
    # Paie (ACD : une écriture ; Pennylane : salaires et charges séparés)
    last = {2: 28, 4: 30, 6: 30, 9: 30, 11: 30}.get(m, 31)
    add('OD', f'2025-{mm}-{last}', f'PAIE{mm}', f'Salaires {mm}/2025', [('sal', None, 5000, 0), ('charges', None, 2100, 0), ('perso', None, 0, 3900), ('urssaf', None, 0, 3200)], tag=f'PAIE-{mm}')
    add('BQ', f'2025-{mm}-{last}', f'FR{mm}', f'FRAIS TENUE DE COMPTE {mm}/2025', [('frais', None, 12, 0), ('bank', None, 0, 12)], tag=f'FRAIS-{mm}')


def find(tag):
    return next(o for o in ops if o.get('tag') == tag)


# ---- Différences du FEC Pennylane (le FEC ACD est la référence) ----
expected = {'absent': [], 'extra': [], 'montant': [], 'compte': [], 'date': []}
for tag in ('FTELECO-03', 'FBUREAU-06'):  # factures non saisies (le règlement l'est)
    o = find(tag)
    o['pl_skip'] = True
    expected['absent'].append({'date': o['date'], 'piece': o['piece'], 'total': max(sum(l[2] for l in o['lines']), sum(l[3] for l in o['lines']))})
o = find('FGARAGE-07')  # montant saisi différemment
ht, rate = 405.00, 20
o['pl_lines'] = [('entretien', None, ht, 0), ('tvaded', None, r2(ht * rate / 100), 0), ('fourn', SUP[2], 0, r2(ht * 1.2))]
expected['montant'].append({'date': o['date'], 'piece': o['piece']})
o = find('FCONSEI-09')  # imputé en publicité au lieu d'honoraires
o['pl_lines'] = [('pub' if l[0] == 'honor' else l[0], l[1], l[2], l[3]) for l in o['lines']]
expected['compte'].append({'date': o['date'], 'piece': o['piece'], 'ref': '622600', 'cmp': '623100'})
o = find('CBETA-10-20') if any(x.get('tag') == 'CBETA-10-20' for x in ops) else next(x for x in ops if x.get('tag', '').endswith('-10-20') and x['kind'] == 'VE')
o['pl_date'] = '2025-10-23'
expected['date'].append({'date': o['date'], 'piece': o['piece'], 'days': 3})
# En plus dans Pennylane : commission bancaire et facture de vente saisie deux fois
add('BQ', '2025-05-15', 'COM0515', 'COMMISSION INTERVENTION', [('frais', None, 8, 0), ('bank', None, 0, 8)], pl_only=True)
expected['extra'].append({'date': '2025-05-15', 'total': 8})
dup = next(x for x in ops if x['kind'] == 'VE' and x['date'].startswith('2025-11'))
d2 = dict(dup, pl_only=True, tag=None)
ops.append(d2)
expected['extra'].append({'date': dup['date'], 'total': dup['lines'][0][2]})


def fmt(v):
    return '' if v == 0 else f'{v:.2f}'.replace('.', ',')


def fmt_pl(v):
    # Pennylane : « 110,0 »
    s = f'{v:.2f}'.rstrip('0')
    return (s + '0' if s.endswith('.') else s).replace('.', ',')


def acd_rows():
    J = {'AN': 'A nouveaux', 'AC': 'Achats', 'VE': 'Ventes', 'BQ': 'Banque', 'OD': 'Opérations diverses'}
    seq = {}
    rows = []
    for o in sorted((o for o in ops if not o.get('pl_only')), key=lambda o: (o['date'], o['kind'])):
        seq[o['kind']] = seq.get(o['kind'], 0) + 1
        num = str(seq[o['kind']])
        d = o['date'].replace('-', '')
        for acc, t, deb, cre in o['lines']:
            (cn, cl), _ = ACC[acc]
            aux, auxl = (t[0], t[1]) if t else ('', '')
            rows.append([o['kind'], J[o['kind']], num, d, cn, cl, aux, auxl, o['piece'], d, o['lib'], fmt(deb) or '0,00', fmt(cre) or '0,00', '', '', d, '', ''])
    return rows


def pl_rows(until=None):
    J = {'AN': 'Journal des à-nouveaux', 'AC': 'Journal d’achat', 'VE': 'Journal de vente', 'BQ': 'Journal de trésorerie - BANQUE EXEMPLE', 'OD': 'Journal des opérations diverses'}
    code = {'AN': 'AN', 'AC': 'HA', 'VE': 'VT', 'BQ': 'BQ1', 'OD': 'OD'}
    rows = []
    n = 0
    prng = random.Random(7)
    entries = []
    for o in ops:
        if o.get('pl_skip'):
            continue
        date = o.get('pl_date', o['date'])
        lines = o.get('pl_lines', o['lines'])
        if o['kind'] == 'AN':
            # À-nouveaux détaillés : une écriture par pièce, réserves réparties autrement (1068 4 800 et 110 4 400)
            entries.append((date, 'AN', 'Report capitaux', [('capital', None, 0, 10000), ('reserve', None, 0, 4800), ('ran', None, 0, 4400), ('bank', None, 18000, 0),
                                                           ('client', CLI[0], 1200, 0), ('client', CLI[0], 1200, 0)]))
            entries.append((date, 'AN', 'FA24-0901', [('fourn', SUP[0], 0, 700)]))
            entries.append((date, 'AN', 'FA24-0950', [('fourn', SUP[0], 0, 500)]))
            continue
        if o['kind'] == 'OD' and o['piece'].startswith('PAIE'):
            entries.append((date, 'OD', o['lib'] + ' - salaires', [('sal', None, 5000, 0), ('perso', None, 0, 3900), ('urssaf', None, 0, 1100)]))
            entries.append((date, 'OD', o['lib'] + ' - charges', [('charges', None, 2100, 0), ('urssaf', None, 0, 2100)]))
            continue
        entries.append((date, o['kind'], o['lib'], lines))
    entries.sort(key=lambda e: e[0])
    for date, kind, lib, lines in entries:
        if until and date > until and kind != 'AN':
            continue
        n += 1
        d = date.replace('-', '')
        piece = ''.join(prng.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(8))
        tot_an = [l for l in lines if l[2] or l[3]]
        if kind == 'AN':
            # équilibrer les à-nouveaux détaillés par pièce sur le compte de report
            deb = sum(l[2] for l in tot_an)
            cre = sum(l[3] for l in tot_an)
            if deb != cre:
                tot_an = tot_an + [('ran', None, r2(cre - deb), 0) if cre > deb else ('ran', None, 0, r2(deb - cre))]
        for acc, t, deb, cre in tot_an:
            _, (cn, cl) = ACC[acc]
            aux, auxl = (('401' if acc == 'fourn' else '411') + t[0][1:], t[2]) if t else ('', '')
            l = lib if not t else (('Facture ' if kind in ('AC', 'VE') else '') + f'{t[2]} - {lib}')
            md = deb if deb else -cre
            rows.append([code[kind], J[kind], str(n), d, cn, cl, aux, auxl, piece, d, l, fmt_pl(deb) if deb else '0,0', fmt_pl(cre) if cre else '0,0', '', '', '', fmt_pl(abs(md)) if md >= 0 else '-' + fmt_pl(-md), 'EUR'])
    return rows


def write(name, rows):
    with open(os.path.join(OUTDIR, name), 'w', encoding='utf-8', newline='') as f:
        f.write('\t'.join(H) + '\r\n')
        for r in rows:
            f.write('\t'.join(r) + '\r\n')


write('acd-900000010FEC20251231.txt', acd_rows())
write('pennylane-900000010FEC20251231.txt', pl_rows())
write('pennylane-partiel-900000010FEC20251231.txt', pl_rows('2025-10-31'))
with open(os.path.join(OUTDIR, 'compare-attendu.json'), 'w', encoding='utf-8') as f:
    json.dump(expected, f, ensure_ascii=False, indent=1)
print(json.dumps(expected, ensure_ascii=False))
