"""Cycle social : récapitulatif de paie et détail des cotisations SILAE (ancien format .xls, BIFF8) et grand livre
Pennylane du journal de paie (.xlsx), données inventées. Trois mois (01 à 03/2026) ; la part patronale de retraite de
février est comptabilisée en 645100 au lieu de 645300 (reclassement attendu), la formation professionnelle est restée
en 645100 (aucun 6333), le net de mars n'est pas réglé. Usage : python3 tests/gen/gensocial.py (xlwt, openpyxl)."""
import datetime, os
import xlwt, openpyxl

OUT = os.path.join(os.path.dirname(__file__), '..', 'fixtures', 'social')
P = ['01/2026', '02/2026', '03/2026']
BRUT = [5000, 5000, 5200]
U_SAL = [400, 400, 416]
U_PAT = [1500, 1500, 1560]  # dont 10 € de formation professionnelle par mois
R_SAL, R_PAT, PAS = 200, 300, 100
NET = [b - u - R_SAL - PAS for b, u in zip(BRUT, U_SAL)]


def recap():
    wb = xlwt.Workbook(encoding='utf-8')
    ws = wb.add_sheet('Récapitulatif')
    ws.write(0, 0, 'Récapitulatif de paie par période')
    ws.write(1, 0, 'SOCIETE DEMO PAIE')
    for i, p in enumerate(P + ['Total']):
        ws.write(2, 2 + 2 * i, p)
    for j, h in enumerate(['Code', 'Libellé'] + ['Salarial', 'Patronal'] * 4):
        ws.write(3, j, h)
    lines = [('B100', 'Salaire Brut', BRUT, [0] * 3), ('R900', 'Total des retenues', [u + R_SAL + PAS for u in U_SAL], [u + R_PAT for u in U_PAT]),
             ('K500', 'Net à payer', NET, [0] * 3)]
    for r, (code, lib, sal, pat) in enumerate(lines, start=4):
        ws.write(r, 0, code)
        ws.write(r, 1, lib)
        for i in range(3):
            ws.write(r, 2 + 2 * i, sal[i])
            ws.write(r, 3 + 2 * i, pat[i])
        ws.write(r, 8, sum(sal))
        ws.write(r, 9, sum(pat))
    wb.save(os.path.join(OUT, 'recap-paie.xls'))
    # Même récapitulatif en page HTML enregistrée avec l'extension .xls (export « tableur » de certains logiciels)
    cells = {}
    cells[(0, 0)] = 'Récapitulatif de paie par période'
    for i, p in enumerate(P + ['Total']):
        cells[(2, 2 + 2 * i)] = p
    for j, h in enumerate(['Code', 'Libellé'] + ['Salarial', 'Patronal'] * 4):
        cells[(3, j)] = h
    for r, (code, lib, sal, pat) in enumerate(lines, start=4):
        cells[(r, 0)], cells[(r, 1)] = code, lib
        for i in range(3):
            cells[(r, 2 + 2 * i)], cells[(r, 3 + 2 * i)] = str(sal[i]).replace('.', ','), str(pat[i]).replace('.', ',')
        cells[(r, 8)], cells[(r, 9)] = str(sum(sal)), str(sum(pat))
    html = '<html><head><meta charset="utf-8"></head><body><table>' + ''.join(
        '<tr>' + ''.join(f'<td>{cells.get((r, c), "")}</td>' for c in range(10)) + '</tr>' for r in range(4 + len(lines))) + '</table></body></html>'
    open(os.path.join(OUT, 'recap-paie-html.xls'), 'w', encoding='utf-8').write(html)


def cot():
    wb = xlwt.Workbook(encoding='utf-8')
    ws = wb.add_sheet('Cotisations')
    ws.write(0, 0, 'Détail des cotisations')
    for j, h in enumerate(['Code', 'Libellé', 'Base', 'Taux', 'Salarial', 'Patronal']):
        ws.write(2, j, h)
    r = [3]

    def row(code, lib, sal, pat):
        ws.write(r[0], 0, code)
        ws.write(r[0], 1, lib)
        ws.write(r[0], 4, sal)
        ws.write(r[0], 5, pat)
        r[0] += 1

    def org(name, lines, msal, mpat, pay):
        for l in lines:
            row(*l)
        for i, p in enumerate(P):
            row('', f'{name} - {p}', msal[i], mpat[i])
        row('', name, sum(msal), sum(mpat))
        row('', pay, '', '')
    org('URSSAF', [('100', 'Maladie vieillesse famille', sum(U_SAL), sum(U_PAT) - 30), ('TC1', 'Contribution formation professionnelle', 0, 30)], U_SAL, U_PAT, 'Paiement mensuel, échéance le 15')
    org('AG2R RETRAITE', [('RC1', 'Retraite complémentaire', 3 * R_SAL, 3 * R_PAT)], [R_SAL] * 3, [R_PAT] * 3, 'Paiement mensuel, échéance le 25')
    org('DGFIP Prélèvement à la source', [('PAS', 'Impôt prélevé à la source', 3 * PAS, 0)], [PAS] * 3, [0] * 3, 'Paiement mensuel, échéance le 15')
    wb.save(os.path.join(OUT, 'detail-cotisations.xls'))


def gl():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Grand livre'
    ws.append(['Grand livre', None, None, None, None, None, None])
    ws.append(['Compte', 'Date', 'Journal', 'Libellé', 'Lettrage', 'Débit', 'Crédit'])
    ends = [datetime.date(2026, 1, 31), datetime.date(2026, 2, 28), datetime.date(2026, 3, 31)]
    rows = []
    for i, d in enumerate(ends):
        let = 'ABC'[i] if i < 2 else None
        rows += [('641100', d, 'PA', 'Salaires', None, BRUT[i], None),
                 ('645100', d, 'PA', 'Charges URSSAF', None, U_PAT[i] + (R_PAT if i == 1 else 0), None),
                 ('431100', d, 'PA', 'URSSAF', None, None, U_SAL[i] + U_PAT[i]),
                 ('437100', d, 'PA', 'AG2R', None, None, R_SAL + R_PAT),
                 ('442100', d, 'PA', 'Prélèvement à la source', None, None, PAS),
                 ('421000', d, 'PA', 'Net à payer', let, None, NET[i])]
        if i != 1:
            rows.append(('645300', d, 'PA', 'Charges retraite', None, R_PAT, None))
        if i < 2:
            rows.append(('421000', d + datetime.timedelta(days=3), 'BQ', 'Virement salaires', let, NET[i], None))
    for r in sorted(rows, key=lambda x: (x[0], x[1])):
        ws.append(list(r))
    for c in ws['B'][2:]:
        c.number_format = 'DD/MM/YYYY'
    wb.save(os.path.join(OUT, 'grand-livre-pa.xlsx'))


recap(); cot(); gl()
print('net', NET, 'total', sum(NET))
