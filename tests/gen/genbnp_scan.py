"""Relevés de lettres de change BNP Paribas scannés (PDF image, JPEG), données inventées, pour la lecture par
reconnaissance de caractères des écritures LCR (tests/suites/lcrbnp-test.js). Mise en page du relevé « présentées au
paiement » (tableau des effets, n° d'ordre avec clé), bruit de numérisation ; le second relevé a un trait vertical
laissé par la vitre du scanner et des séparations en pointillés. Usage : python3 tests/gen/genbnp_scan.py (Pillow)."""
import json, os, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = os.path.join(os.path.dirname(__file__), '..', 'fixtures', 'lcr-bnp')
FONT = '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
BOLD = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'
W, H = 1653, 2338
COLS = [0, 143, 310, 671, 868, 1120, 1223, 1468]
MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']


def key(n):
    return ((22 - (n * 100) % 97) % 97 + 97) % 97


def num(n):
    return f'{n} {key(n):02d}'


def eur(c):
    s = f'{c // 100:,}'.replace(',', ' ')
    return f'{s},{c % 100:02d}'


def releve(name, rel, regl, edit, effets, streak=False, dotted=False, seed=1):
    random.seed(seed)
    im = Image.new('L', (W, H), 255)
    d = ImageDraw.Draw(im)
    f = lambda s, b=False: ImageFont.truetype(BOLD if b else FONT, s)
    d.text((150, 50), 'BNP PARIBAS', font=f(44, True), fill=0)
    d.text((790, 70), 'RELEVE DE LETTRES DE CHANGE', font=f(36, True), fill=0)
    d.text((790, 115), 'PRESENTEES AU PAIEMENT', font=f(26), fill=0)
    d.text((790, 150), 'DOCUMENT A CONSERVER', font=f(26, True), fill=0)
    d.text((130, 235), 'AGENCE DEMO', font=f(27), fill=0)
    d.text((130, 268), '1, rue de la Démonstration', font=f(27), fill=0)
    d.text((1010, 420), 'PHARMACIE DEMO', font=f(29), fill=0)
    d.text((1010, 452), '2 PLACE DU TEST', font=f(29), fill=0)
    d.text((130, 470), 'Agence de domiciliation :', font=f(27), fill=0)
    d.text((130, 500), 'AGENCE DEMO (01234)', font=f(27), fill=0)
    d.text((130, 532), 'RIB    : 30004 01234 00099988877 12', font=f(27), fill=0)
    d.text((130, 564), 'IBAN  : FR76 3000 4012 3400 0999 8887 712', font=f(27), fill=0)
    d.text((130, 724), f'Date de règlement : {regl}', font=f(27), fill=0)
    d.text((130, 756), f'Relevé : {num(rel)}', font=f(27), fill=0)
    dd, mm, yy = edit
    d.text((1025, 724), f'le {dd} {MOIS[mm - 1]} {yy}', font=f(27), fill=0)
    d.text((130, 805), 'Convention de Paiement Sauf Désaccord : option 1', font=f(26, True), fill=0)
    total = sum(e[3] for e in effets)
    d.text((240, 1050), 'REJET TOTAL de', font=f(28, True), fill=0)
    d.text((660, 1050), f'{eur(total)} euros -> Code motif du rejet total :', font=f(28), fill=0)
    d.text((240, 1105), 'REJET PARTIEL Montant total des effets à rejeter :', font=f(28), fill=0)
    x0, top = 126, 1163
    X = [x0 + c for c in COLS]
    line = lambda a, b, y, t=3: d.rectangle([a, y, b, y + t - 1], fill=0)
    vline = lambda x, a, b: d.rectangle([x, a, x + 1, b], fill=0)
    line(X[0], X[7], top, 4)
    line(X[0], X[5], top + 78, 2)
    line(X[0], X[7], top + 156, 3)
    hb = top + 158
    rows = len(effets)
    tt = hb + rows * 36
    bottom = tt + 73
    line(X[0], X[7], tt, 3)
    line(X[0], X[7], bottom, 3)
    for x in (X[0], X[5], X[6], X[7]):
        vline(x, top, bottom)
    for x in X[1:5]:
        vline(x, top + 78, tt)
    vline(X[4], tt, bottom)
    d.text((X[0] + 300, top + 25), 'CARACTERISTIQUES DES EFFETS EN EUROS', font=f(27), fill=0)
    for x, t1, t2 in [(X[0] + 10, 'NUMERO', "D'ORDRE"), (X[1] + 12, 'REFERENCE', 'TIRE'), (X[2] + 90, 'NOM DU TIREUR', ''), (X[3] + 15, 'ECHEANCE ET', 'NATURE (1)'), (X[4] + 60, 'MONTANT', '')]:
        d.text((x, top + 88), t1, font=f(27), fill=0)
        d.text((x, top + 120), t2, font=f(27), fill=0)
    for i, (n, ref, nom, c, ech, nat) in enumerate(effets):
        y = hb + i * 36
        if i:
            if dotted:
                for xx in range(X[0], X[5], 9):
                    d.rectangle([xx, y, xx + 4, y], fill=0)
            else:
                line(X[0], X[5], y, 1)
        d.text((X[0] + 8, y + 5), num(n), font=f(26), fill=0)
        d.text((X[1] + 8, y + 5), ref, font=f(26), fill=0)
        d.text((X[2] + 8, y + 5), nom, font=f(26), fill=0)
        d.text((X[3] + 8, y + 5), f'{ech}  {nat}', font=f(26), fill=0)
        a = eur(c)
        d.text((X[5] - 10 - d.textlength(a, font=f(26)), y + 5), a, font=f(26), fill=0)
    d.text((X[0] + 15, tt + 8), f'TOTAL DU RELEVE EN EUROS, AU {regl}', font=f(26, True), fill=0)
    d.text((X[0] + 15, tt + 40), f'VALEUR {regl}', font=f(26, True), fill=0)
    a = eur(total)
    d.text((X[5] - 10 - d.textlength(a, font=f(26, True)), tt + 8), a, font=f(26, True), fill=0)
    d.text((130, bottom + 15), 'Ce document, daté et signé, est à renvoyer à l\'adresse ci-dessus avant la date de règlement.', font=f(22), fill=0)
    if streak:
        for x in (520, 1400):
            d.rectangle([x, 0, x + 1, H], fill=20)
    im = im.filter(ImageFilter.GaussianBlur(0.6))
    px = im.load()
    for _ in range(25000):
        px[random.randrange(W), random.randrange(H)] = random.randrange(150, 255)
    im = im.rotate(0.15, fillcolor=255, resample=Image.BICUBIC)
    im.convert('RGB').save(os.path.join(OUT, name), 'PDF', resolution=200, quality=82)
    return {'releve': num(rel).replace(' ', ''), 'regl': regl.replace('.', '/'), 'au': f'{dd:02d}/{mm:02d}/{yy}', 'contrat': '30004-01234-00099988877',
            'total': total, 'effets': [[num(e[0]).replace(' ', ''), e[2], e[4].replace('.', '/'), e[3]] for e in effets]}


exp = {}
exp['bnp-scan-1.pdf'] = releve('bnp-scan-1.pdf', 700100, '05.11.2026', (30, 10, 2026), [
    (700101, '1100220033', 'LABORATOIRE ALPHA', 198017, '05.11.2026', 'A'),
    (700102, '', 'BETA DISTRIBUTION SAS', 63996, '05.11.2026', 'NA'),
    (700103, 'V260000123', 'GAMMA SANTE', 7281, '05.11.2026', 'A'),
])
exp['bnp-scan-2.pdf'] = releve('bnp-scan-2.pdf', 700250, '26.11.2026', (20, 11, 2026), [
    (700251, 'DELTA', 'DELTA FRANCE', 65530, '24.11.2026', 'A'),
    (700252, '9900112233', 'EPSILON SAS', 26796, '24.11.2026', 'NA'),
    (700253, '0000000000', 'ZETA LABORATOIRES', 114505, '24.11.2026', 'NA'),
    (700254, '', 'S.A.S. ETA PHARMA', 77315, '26.11.2026', 'A'),
    (700255, '2006000111', 'THETA SANTE', 6454, '26.11.2026', 'A'),
], streak=True, dotted=True, seed=2)
json.dump(exp, open(os.path.join(OUT, 'attendu.json'), 'w'), ensure_ascii=False, indent=1)
print('ok')
