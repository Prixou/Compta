# Relevés bancaires de test (données entièrement inventées, banque « BANQUE DEMO ») reprenant les mises en page des
# relevés des principales banques, telles que les décrivent les lecteurs libres de relevés (en-têtes, formats de date et
# de montant, lignes de solde et de total), et les formats de fichiers des banques en ligne :
#   PDF lus par les en-têtes de colonnes :
#   - pdf-nature-operations.pdf : Date / Nature des opérations / Valeur / Débit / Crédit, dates « 05.10 », milliers
#     séparés par un point, « SOLDE CREDITEUR AU », montant sur la ligne qui suit la date, « TOTAL DES OPERATIONS »
#     (relevés de type BNP Paribas) ;
#   - pdf-solde-precedent.pdf : Date / Valeur / Nature de l'opération / Débit / Crédit, dates complètes, « SOLDE
#     PRÉCÉDENT AU », « TOTAUX DES MOUVEMENTS », « NOUVEAU SOLDE AU » (type Société Générale) ;
#   - pdf-date-libelle.pdf : DATE LIBELLE / VALEUR / DEBIT / CREDIT, dates « 05.10.26 » dans la colonne du libellé,
#     « ANCIEN SOLDE », « TOTAUX », « SOLDE EN EUROS » (type LCL) ;
#   - pdf-debit-euros.pdf : Date / Date valeur / Opération / Débit EUROS / Crédit EUROS, libellés sur deux lignes,
#     « SOLDE CREDITEUR AU » (type Crédit Mutuel / CIC) ;
#   - pdf-ancien-solde.pdf : Date / Opération / Débit (€) / Crédit (€), dates « 05/10 », année lue dans « Relevé édité le
#     2 novembre 2026 », « Ancien solde au », « Total des opérations », « Nouveau solde au » (type La Banque Postale) ;
#   - pdf-date-ope.pdf : Date opé. / Date valeur / Libellé des opérations / Débit / Crédit, « Ancien solde créditeur
#     au », « Nouveau solde créditeur au » (type Crédit Agricole) ;
#   - pdf-montant-solde.pdf : Date / Libellé / Montant / Solde, dates « 5 oct. 2026 », montants signés suivis de « € »,
#     solde après chaque opération, sans solde initial imprimé (banques en ligne) ;
#   - pdf-money-out.pdf : Date / Description / Money out / Money in / Balance, montants « 1,234.56 » (relevé en anglais) ;
#   PDF lus par les colonnes déduites (sans en-tête « Débit » / « Crédit » reconnu) :
#   - pdf-mouvements.pdf : « Date » au-dessus de « Opérations / Valeur / Mouvements », débits et crédits sous la même
#     colonne « Mouvements » à deux alignements, « SOLDE AU », « NOUVEAU SOLDE AU » (type Boursorama) ;
#   - pdf-rubriques.pdf : un seul « Montant » non signé, sens donné par les rubriques « Virements reçus »,
#     « Prélèvements », « Paiements carte bancaire »… (anciens relevés de type Caisse d'Épargne) ;
#   Fichiers : CSV des banques en ligne (en-têtes de type Boursorama, N26, Fortuneo, Revolut ; colonne « Sens » ;
#   fichier sans en-tête), QIF, MT940 et CAMT.052.
#   python3 genbanques.py [dossier de sortie]   → fichiers ci-dessus et attendu.json
import sys, os, json, random

OUTDIR = sys.argv[1] if len(sys.argv) > 1 else '.'
H = 842
rnd = random.Random(2610)

# Largeurs Helvetica (1/1000 du corps) des caractères des montants ; lettres à 0,6 en moyenne
WIDTH = {**{d: 556 for d in '0123456789'}, ' ': 278, ',': 278, '.': 278, '-': 333, '+': 584, '€': 556, '(': 333, ')': 333}


def width(s, size):
    return sum(WIDTH.get(c, 600) for c in s) * size / 1000


def esc(s):
    return s.encode('cp1252').replace(b'\\', b'\\\\').replace(b'(', b'\\(').replace(b')', b'\\)').decode('latin-1')


def fr(c, sep=' ', dec=','):
    s = f'{abs(c) / 100:,.2f}'.replace(',', '#').replace('.', dec).replace('#', sep)
    return ('-' if c < 0 else '') + s


class Page:
    def __init__(self):
        self.ops = []

    def text(self, x, top, s, size=8, bold=False, right=False):
        x0 = x - width(s, size) if right else x
        self.ops.append(f'BT /{"F2" if bold else "F1"} {size} Tf 1 0 0 1 {x0:.2f} {H - top:.2f} Tm ({esc(s)}) Tj ET')


def write_pdf(name, pages):
    objs = [(1, b'<< /Type /Catalog /Pages 2 0 R >>'), (3, b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
            (4, b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')]
    kids, num = [], 5
    for p in pages:
        c = '\n'.join(p.ops).encode('latin-1')
        kids.append(f'{num} 0 R')
        objs.append((num, f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {num + 1} 0 R >>'.encode()))
        objs.append((num + 1, f'<< /Length {len(c)} >>\nstream\n'.encode() + c + b'\nendstream'))
        num += 2
    objs.append((2, f'<< /Type /Pages /Kids [{" ".join(kids)}] /Count {len(pages)} >>'.encode()))
    objs.sort()
    out = bytearray(b'%PDF-1.4\n')
    offs = {}
    for n, body in objs:
        offs[n] = len(out)
        out += f'{n} 0 obj\n'.encode() + body + b'\nendobj\n'
    xref = len(out)
    size = max(offs) + 1
    out += f'xref\n0 {size}\n0000000000 65535 f \n'.encode()
    for i in range(1, size):
        out += f'{offs[i]:010d} 00000 n \n'.encode()
    out += f'trailer\n<< /Size {size} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
    with open(os.path.join(OUTDIR, name), 'wb') as f:
        f.write(out)


# Opérations inventées d'octobre 2026 : (jour, libellé, suite du libellé, montant en centimes, + crédit / - débit)
LIBS_D = ['CB LIBRAIRIE DU CENTRE', 'PRLV SEPA ENERGIE DEMO', 'CB STATION SERVICE', 'PRLV SEPA ASSURANCE DEMO', 'CHEQUE 0001234',
          'CB FOURNITURES BUREAU', 'PRLV URSSAF DEMO', 'COMMISSIONS COTISATION', 'CB RESTAURANT LE PORT', 'VIR SEPA LOYER BUREAU']
LIBS_C = ['VIR SEPA RECU CLIENT ALPHA', 'REMISE CHEQUES 0004521', 'VIR SEPA RECU CLIENT BETA', 'VERSEMENT ESPECES']


def operations(n=12, big=False):
    ops = []
    days = sorted(rnd.sample(range(2, 30), n))
    for k, d in enumerate(days):
        credit = k % 4 == 1
        lib = rnd.choice(LIBS_C if credit else LIBS_D)
        amt = rnd.randint(150000, 900000) if credit and big else rnd.randint(1500, 250000) if not credit else rnd.randint(30000, 400000)
        if k == 3:
            amt = 123456  # milliers
        more = 'REF FACTURE 2026-10-' + str(k).zfill(3) if k % 5 == 2 else ''
        ops.append({'day': d, 'lib': lib, 'more': more, 'a': amt, 'c': credit})
    return ops


def expected(ops, opening, mode, du='2026-10-01', au='2026-10-31'):
    sd = sum(o['a'] for o in ops if not o['c'])
    sc = sum(o['a'] for o in ops if o['c'])
    return {'ops': len(ops), 'sumD': sd / 100, 'sumC': sc / 100, 'soldeInitial': opening / 100, 'soldeFinal': (opening - sd + sc) / 100, 'mode': mode, 'du': du, 'au': au}


EXP = {}


def table_pdf(name, cfg):
    """Relevé à colonnes : cfg donne les en-têtes, les positions et le rendu des dates, des montants et des soldes."""
    ops = cfg['ops']
    opening = cfg['opening']
    p = Page()
    top = 40
    p.text(40, top, 'BANQUE DEMO - AGENCE CENTRE', 9, bold=True)
    top += 14
    for line in cfg['head']:
        p.text(40, top, line)
        top += 12
    top += 8
    for (s, x, right) in cfg['cols']:
        p.text(x, top, s, 8, bold=True, right=right)
    top += 14
    sep = cfg.get('sep', ' ')
    amt = lambda c: fr(c, sep)
    x_deb, x_cre = cfg['x_deb'], cfg['x_cre']
    if cfg.get('open_label'):
        p.text(cfg['x_lib'], top, cfg['open_label'])
        p.text(x_cre if opening >= 0 else x_deb, top, amt(abs(opening)), right=True)
        top += 14
    for o in ops:
        d = cfg['date'](o['day'])
        if cfg.get('date_in_label'):
            p.text(cfg['x_date'], top, f"{d} {o['lib']}")
        else:
            p.text(cfg['x_date'], top, d)
            p.text(cfg['x_lib'], top, o['lib'])
        if cfg.get('x_val') is not None:
            p.text(cfg['x_val'], top, cfg['date_val'](o['day']))
        x = x_cre if o['c'] else x_deb
        if cfg.get('amount_next_line') and o['more']:
            # Montant sur la ligne suivant celle de la date
            top += 11
            p.text(cfg['x_lib'], top, o['more'])
            p.text(x, top, amt(o['a']), right=True)
        else:
            p.text(x, top, amt(o['a']), right=True)
            if o['more']:
                top += 11
                p.text(cfg['x_lib'] + cfg.get('indent', 0), top, o['more'])
        top += 13
    sd = sum(o['a'] for o in ops if not o['c'])
    sc = sum(o['a'] for o in ops if o['c'])
    top += 4
    p.text(cfg['x_lib'], top, cfg['total_label'], bold=True)
    p.text(x_deb, top, amt(sd), right=True)
    p.text(x_cre, top, amt(sc), right=True)
    top += 14
    closing = opening - sd + sc
    p.text(cfg['x_lib'], top, cfg['close_label'], bold=True)
    p.text(x_cre if closing >= 0 else x_deb, top, amt(abs(closing)), right=True)
    top += 20
    if cfg.get('after'):
        p.text(40, top, cfg['after'])
    p.text(480, 815, 'Page 1 / 1')
    write_pdf(name, [p])
    EXP[name] = expected(ops, opening, 'en-têtes', *cfg.get('period', ('2026-10-01', '2026-10-31')))


dm = lambda sep, y='': (lambda d: f'{d:02d}{sep}10{y}')

# Type BNP Paribas
ops = operations()
table_pdf('pdf-nature-operations.pdf', {
    'ops': ops, 'opening': 755097, 'sep': '.',
    'head': ['RELEVE DE COMPTE CHEQUES', 'du 1 octobre 2026 au 31 octobre 2026', 'Monnaie du compte : Euro'],
    'cols': [('Date', 40, False), ('Nature des opérations', 80, False), ('Valeur', 340, False), ('Débit', 460, True), ('Crédit', 540, True)],
    'x_date': 40, 'x_lib': 80, 'x_val': 340, 'date': dm('.'), 'date_val': dm('.'), 'x_deb': 460, 'x_cre': 540,
    'open_label': 'SOLDE CREDITEUR AU 30.09.2026', 'total_label': 'TOTAL DES OPERATIONS', 'close_label': 'SOLDE CREDITEUR AU 31.10.2026',
    'amount_next_line': True, 'after': 'BANQUE DEMO SA au capital de 1 000 000 euros',
})
# Type Société Générale
ops = operations()
table_pdf('pdf-solde-precedent.pdf', {
    'ops': ops, 'opening': 248912, 'sep': '.',
    'head': ['RELEVE DE COMPTE', 'du 01/10/2026 au 31/10/2026'],
    'cols': [('Date', 40, False), ('Valeur', 92, False), ("Nature de l'opération", 150, False), ('Débit', 470, True), ('Crédit', 545, True)],
    'x_date': 40, 'x_lib': 150, 'x_val': 92, 'date': dm('/', '/2026'), 'date_val': dm('/', '/2026'), 'x_deb': 470, 'x_cre': 545,
    'open_label': 'SOLDE PRÉCÉDENT AU 30/09/2026', 'total_label': 'TOTAUX DES MOUVEMENTS', 'close_label': 'NOUVEAU SOLDE AU 31/10/2026',
})
# Type LCL
ops = operations()
table_pdf('pdf-date-libelle.pdf', {
    'ops': ops, 'opening': 51234,
    'head': ['RELEVE DE COMPTE COURANT', 'du 01.10.2026 au 31.10.2026'],
    'cols': [('DATE LIBELLE', 40, False), ('VALEUR', 340, False), ('DEBIT', 460, True), ('CREDIT', 540, True)],
    'x_date': 40, 'x_lib': 40, 'x_val': 340, 'date': dm('.', '.26'), 'date_val': dm('.', '.26'), 'date_in_label': True, 'indent': 40,
    'x_deb': 460, 'x_cre': 540,
    'open_label': 'ANCIEN SOLDE', 'total_label': 'TOTAUX', 'close_label': 'SOLDE EN EUROS',
})
# Type Crédit Mutuel / CIC
ops = operations()
table_pdf('pdf-debit-euros.pdf', {
    'ops': ops, 'opening': 1290000, 'sep': '.',
    'head': ['EXTRAIT DE COMPTE', 'du 01/10/2026 au 31/10/2026'],
    'cols': [('Date', 40, False), ('Date valeur', 95, False), ('Opération', 160, False), ('Débit EUROS', 470, True), ('Crédit EUROS', 550, True)],
    'x_date': 40, 'x_lib': 160, 'x_val': 95, 'date': dm('/', '/2026'), 'date_val': dm('/', '/2026'), 'x_deb': 470, 'x_cre': 550,
    'open_label': 'SOLDE CREDITEUR AU 30/09/2026', 'total_label': 'Total des mouvements', 'close_label': 'SOLDE CREDITEUR AU 31/10/2026',
})
# Type La Banque Postale (année tirée de la date d'édition)
ops = operations()
table_pdf('pdf-ancien-solde.pdf', {
    'ops': ops, 'opening': 87654,
    'head': ['Relevé de vos comptes', 'Relevé édité le 2 novembre 2026'],
    'cols': [('Date', 40, False), ('Opération', 85, False), ('Débit (€)', 470, True), ('Crédit (€)', 545, True)],
    'x_date': 40, 'x_lib': 85, 'date': dm('/'), 'x_deb': 470, 'x_cre': 545,
    'open_label': 'Ancien solde au 30/09/2026', 'total_label': 'Total des opérations', 'close_label': 'Nouveau solde au 31/10/2026',
    'period': (None, None),
})
# Type Crédit Agricole
ops = operations()
table_pdf('pdf-date-ope.pdf', {
    'ops': ops, 'opening': 312045,
    'head': ['Relevé de compte', 'du 1er octobre 2026 au 31 octobre 2026'],
    'cols': [('Date opé.', 40, False), ('Date valeur', 85, False), ('Libellé des opérations', 140, False), ('Débit', 470, True), ('Crédit', 545, True)],
    'x_date': 40, 'x_lib': 140, 'x_val': 85, 'date': dm('.'), 'date_val': dm('.'), 'x_deb': 470, 'x_cre': 545,
    'open_label': 'Ancien solde créditeur au 30.09.2026', 'total_label': 'Total des opérations', 'close_label': 'Nouveau solde créditeur au 31.10.2026',
})

# Banque en ligne : montant signé, solde après chaque opération, dates en lettres, devise après le montant
ops = operations()
p = Page()
p.text(40, 40, 'BANQUE DEMO', 9, bold=True)
p.text(40, 54, 'Relevé de compte - octobre 2026')
top = 80
for s, x, r in (('Date', 40, False), ('Libellé', 110, False), ('Montant', 470, True), ('Solde', 545, True)):
    p.text(x, top, s, 8, bold=True, right=r)
top += 14
bal = 64000
for o in ops:
    v = o['a'] if o['c'] else -o['a']
    bal += v
    p.text(40, top, f"{o['day']} oct. 2026")
    p.text(110, top, o['lib'])
    p.text(470, top, ('+' if v > 0 else '') + fr(v) + ' €', right=True)
    p.text(545, top, fr(bal) + ' €', right=True)
    top += 13
write_pdf('pdf-montant-solde.pdf', [p])
EXP['pdf-montant-solde.pdf'] = expected(ops, 64000, 'en-têtes', None, None)

# Relevé en anglais : point décimal, virgule des milliers, solde après chaque opération
ops = operations(big=True)
p = Page()
p.text(40, 40, 'BANQUE DEMO', 9, bold=True)
p.text(40, 54, 'Account statement')
top = 80
for s, x, r in (('Date', 40, False), ('Description', 110, False), ('Money out', 400, True), ('Money in', 470, True), ('Balance', 545, True)):
    p.text(x, top, s, 8, bold=True, right=r)
top += 14
bal = 1000000
en = lambda c: f'{c / 100:,.2f}'
for o in ops:
    v = o['a'] if o['c'] else -o['a']
    bal += v
    p.text(40, top, f"{o['day']:02d}/10/2026")
    p.text(110, top, o['lib'])
    p.text(470 if o['c'] else 400, top, en(o['a']), right=True)
    p.text(545, top, en(bal), right=True)
    top += 13
write_pdf('pdf-money-out.pdf', [p])
EXP['pdf-money-out.pdf'] = expected(ops, 1000000, 'en-têtes', None, None)

# Type Boursorama : en-tête sur deux lignes, « Mouvements » sur deux alignements (débit, crédit)
ops = operations()
p = Page()
p.text(40, 40, 'BANQUE DEMO', 9, bold=True)
p.text(40, 54, 'Relevé de compte')
p.text(40, 66, 'Période du 01/10/2026 au 31/10/2026')
top = 92
p.text(46, top, 'Date', 8, bold=True)
top += 12
for s, x in (('Opérations', 95), ('Valeur', 381), ('Mouvements', 442)):
    p.text(x, top, s, 8, bold=True)
top += 16
p.text(327, top, 'SOLDE AU')
p.text(376, top, '01/10/2026')
p.text(560, top, fr(100000), right=True)
top += 14
for o in ops:
    p.text(46, top, f"{o['day']:02d}/10/2026")
    p.text(95, top, o['lib'])
    p.text(375, top, f"{o['day']:02d}/10/2026")
    p.text(560 if o['c'] else 490, top, fr(o['a']), right=True)
    if o['more']:
        top += 10
        p.text(112, top, o['more'])
    top += 13
sd = sum(o['a'] for o in ops if not o['c'])
sc = sum(o['a'] for o in ops if o['c'])
top += 4
p.text(95, top, 'Total des opérations', bold=True)
p.text(490, top, fr(sd), right=True)
p.text(560, top, fr(sc), right=True)
top += 14
p.text(297, top, 'NOUVEAU SOLDE AU')
p.text(376, top, '31/10/2026')
fin = 100000 - sd + sc
p.text(560 if fin >= 0 else 490, top, fr(abs(fin)), right=True)
write_pdf('pdf-mouvements.pdf', [p])
EXP['pdf-mouvements.pdf'] = expected(ops, 100000, 'colonnes déduites (debit, credit)')

# Ancien type Caisse d'Épargne : rubriques, un seul montant non signé
ops = operations()
p = Page()
p.text(40, 40, 'BANQUE DEMO', 9, bold=True)
p.text(40, 54, 'Relevé de compte du 01/10/2026 au 31/10/2026')
top = 80
for s, x, r in (('Date', 40, False), ('Libellé', 90, False), ('Montant', 530, True)):
    p.text(x, top, s, 8, bold=True, right=r)
top += 14
p.text(90, top, 'SOLDE AU 30/09/2026')
p.text(530, top, fr(250000), right=True)
top += 18
sections = [('Virements reçus', lambda o: o['c'] and 'VIR' in o['lib']), ('Opérations de dépôt', lambda o: o['c'] and 'VIR' not in o['lib']),
            ('Prélèvements', lambda o: not o['c'] and 'PRLV' in o['lib']), ('Paiements carte bancaire', lambda o: not o['c'] and o['lib'].startswith('CB')),
            ('Paiements chèques', lambda o: not o['c'] and 'CHEQUE' in o['lib']), ('Frais bancaires et cotisations', lambda o: not o['c'] and not o['lib'].startswith(('CB', 'PRLV', 'CHEQUE')))]
for title, test in sections:
    sel = [o for o in ops if test(o)]
    if not sel:
        continue
    p.text(90, top, title, 9, bold=True)
    top += 13
    for o in sel:
        p.text(40, top, f"{o['day']:02d}/10")
        p.text(90, top, o['lib'])
        p.text(530, top, fr(o['a']), right=True)
        top += 12
    top += 6
sd = sum(o['a'] for o in ops if not o['c'])
sc = sum(o['a'] for o in ops if o['c'])
p.text(90, top, 'SOLDE AU 31/10/2026')
p.text(530, top, fr(250000 - sd + sc), right=True)
write_pdf('pdf-rubriques.pdf', [p])
EXP['pdf-rubriques.pdf'] = expected(ops, 250000, 'colonnes déduites (rubrique)')

# ---------- Fichiers ----------
FILES = {}


def file_exp(name, ops, opening=None, fmt=None):
    sd = sum(o['a'] for o in ops if not o['c'])
    sc = sum(o['a'] for o in ops if o['c'])
    e = {'ops': len(ops), 'sumD': sd / 100, 'sumC': sc / 100, 'format': fmt}
    if opening is not None:
        e['opening'] = opening / 100
        e['closing'] = (opening - sd + sc) / 100
    FILES[name] = e


def save(name, text, enc='utf-8'):
    with open(os.path.join(OUTDIR, name), 'w', encoding=enc, newline='') as f:
        f.write(text)


sg = lambda o: o['a'] if o['c'] else -o['a']
ops = operations()
save('csv-type-boursorama.csv', 'dateOp;dateVal;label;category;categoryParent;supplierFound;amount;comment;accountNum;accountLabel;accountbalance\r\n'
     + ''.join(f"2026-10-{o['day']:02d};2026-10-{o['day']:02d};\"{o['lib']}\";\"Divers\";\"Divers\";\"\";{fr(sg(o), '')};;00012345678;\"COMPTE DEMO\";4521,30\r\n" for o in ops))
file_exp('csv-type-boursorama.csv', ops, fmt='CSV / Excel')
ops = operations()
save('csv-type-n26.csv', '"Booking Date","Value Date","Partner Name","Partner Iban",Type,"Payment Reference","Account Name","Amount (EUR)","Original Amount","Original Currency","Exchange Rate"\n'
     + ''.join(f"2026-10-{o['day']:02d},2026-10-{o['day']:02d},\"{o['lib']}\",FR7600000000000000000000000,\"{'Credit Transfer' if o['c'] else 'Debit Transfer'}\",\"{o['more']}\",\"Compte courant\",{sg(o) / 100:.2f},,,\n" for o in ops))
file_exp('csv-type-n26.csv', ops, fmt='CSV / Excel')
ops = operations()
save('csv-type-fortuneo.csv', 'Date opération;Date valeur;libellé;Débit;Crédit;\r\n'
     + ''.join(f"{o['day']:02d}/10/2026;{o['day']:02d}/10/2026;{o['lib']};{'' if o['c'] else fr(-o['a'], '')};{fr(o['a'], '') if o['c'] else ''};\r\n" for o in ops), 'cp1252')
file_exp('csv-type-fortuneo.csv', ops, fmt='CSV / Excel')
# Revolut : heure, frais, état (une opération en attente et une annulée non reprises), solde après chaque opération
ops = operations()
rows, bal, nets = [], 50000, []
for k, o in enumerate(ops):
    fee = 100 if k == 4 else 0
    bal += sg(o) - fee
    nets.append(sg(o) - fee)
    rows.append(f"{'TOPUP' if o['c'] else 'CARD_PAYMENT'},Current,2026-10-{o['day']:02d} 09:12:00,2026-10-{o['day']:02d} 14:32:11,{o['lib']},{sg(o) / 100:.2f},{fee / 100:.2f},EUR,COMPLETED,{bal / 100:.2f}")
    if k == 2:
        rows.append(f"CARD_PAYMENT,Current,2026-10-{o['day']:02d} 10:00:00,,CB EN ATTENTE,-25.00,0.00,EUR,PENDING,")
    if k == 7:
        rows.append(f"CARD_PAYMENT,Current,2026-10-{o['day']:02d} 11:00:00,2026-10-{o['day']:02d} 11:05:00,CB ANNULEE,-40.00,0.00,EUR,REVERTED,")
save('csv-type-revolut.csv', 'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\n' + '\n'.join(rows) + '\n')
FILES['csv-type-revolut.csv'] = {'ops': len(ops), 'sumD': -sum(n for n in nets if n < 0) / 100, 'sumC': sum(n for n in nets if n > 0) / 100,
                                 'opening': 500.0, 'closing': bal / 100, 'format': 'CSV / Excel'}
# Fichier sans ligne d'en-tête (export de type LCL)
ops = operations()
save('csv-sans-entete.csv', ''.join(f"{o['day']:02d}/10/2026;{fr(sg(o), '')};{'Virement' if o['c'] else 'Carte'};;{o['lib']};\r\n" for o in ops))
file_exp('csv-sans-entete.csv', ops, fmt='CSV / Excel (sans en-tête)')
# Colonne « Sens » (D / C) et montants non signés, avec symbole euro
ops = operations()
save('csv-sens.csv', 'Date;Libellé;Montant;Sens\r\n' + ''.join(f"{o['day']:02d}/10/2026;{o['lib']};{fr(o['a'])} €;{'C' if o['c'] else 'D'}\r\n" for o in ops))
file_exp('csv-sens.csv', ops, fmt='CSV / Excel')
# QIF
ops = operations()
save('releve.qif', '!Type:Bank\n' + ''.join(f"D{o['day']:02d}/10/2026\nT{fr(sg(o), '')}\nP{o['lib']}\n{'M' + o['more'] + chr(10) if o['more'] else ''}^\n" for o in ops))
file_exp('releve.qif', ops, fmt='QIF')
# MT940
ops = operations()
sd = sum(o['a'] for o in ops if not o['c'])
sc = sum(o['a'] for o in ops if o['c'])
mt = [':20:STMT2610', ':25:30001/00000000000123456789', ':28C:00010/001', f':60F:C260930EUR{fr(345600, "")}']
for o in ops:
    mt.append(f":61:2610{o['day']:02d}10{o['day']:02d}{'C' if o['c'] else 'D'}{fr(o['a'], '')}NTRFNONREF//REF{o['day']:02d}")
    mt.append(f":86:{o['lib']}" + (f"\n{o['more']}" if o['more'] else ''))
fin = 345600 - sd + sc
mt.append(f":62F:{'C' if fin >= 0 else 'D'}261031EUR{fr(abs(fin), '')}")
mt.append('-')
save('releve.sta', '\r\n'.join(mt) + '\r\n')
file_exp('releve.sta', ops, 345600, fmt='MT940')
# CAMT.052 (relevé intrajournalier)
ops = operations()
sd = sum(o['a'] for o in ops if not o['c'])
sc = sum(o['a'] for o in ops if o['c'])
ntry = ''.join(f"<Ntry><Amt Ccy=\"EUR\">{o['a'] / 100:.2f}</Amt><CdtDbtInd>{'CRDT' if o['c'] else 'DBIT'}</CdtDbtInd><BookgDt><Dt>2026-10-{o['day']:02d}</Dt></BookgDt>"
               f"<NtryDtls><TxDtls><RmtInf><Ustrd>{o['lib']}</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>" for o in ops)
save('releve-camt052.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.052.001.02"><BkToCstmrAcctRpt>'
     '<GrpHdr><MsgId>DEMO</MsgId></GrpHdr><Rpt><Id>R1</Id><Acct><Id><IBAN>FR7600000000000000000000000</IBAN></Id></Acct>'
     f"<Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy=\"EUR\">1000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2026-10-01</Dt></Dt></Bal>"
     f"<Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy=\"EUR\">{abs(100000 - sd + sc) / 100:.2f}</Amt><CdtDbtInd>{'CRDT' if 100000 - sd + sc >= 0 else 'DBIT'}</CdtDbtInd><Dt><Dt>2026-10-31</Dt></Dt></Bal>"
     f'{ntry}</Rpt></BkToCstmrAcctRpt></Document>\n')
file_exp('releve-camt052.xml', ops, 100000, fmt='CAMT.052')

with open(os.path.join(OUTDIR, 'attendu.json'), 'w', encoding='utf-8') as f:
    json.dump({'pdf': EXP, 'files': FILES}, f, indent=1, ensure_ascii=False)
print('ok', len(EXP), 'PDF,', len(FILES), 'fichiers')
