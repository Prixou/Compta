# Situation 2026 au 30/06 (dossier 444) et exercice 2025 complet avec charges de fin d'année.
src = open('444444444FEC20251231.txt', encoding='utf-8', newline='').read().split('\r\n')
head, rows = src[0], [r.split('\t') for r in src[1:] if r]
extra = [
 ['OD','Opérations diverses','9001','20251231','681120','Dotations aux amortissements','','','DOT25','20251231','Dotation 2025','6000,00','0,00','','','20251231','',''],
 ['OD','Opérations diverses','9001','20251231','281540','Amortissements matériel','','','DOT25','20251231','Dotation 2025','0,00','6000,00','','','20251231','',''],
 ['BQ','Banque','9002','20251215','635110','CFE','','','CFE25','20251215','CFE 2025','1400,00','0,00','','','20251215','',''],
 ['BQ','Banque','9002','20251215','512000','Banque Populaire','','','CFE25','20251215','CFE 2025','0,00','1400,00','','','20251215','',''],
]
open('n1/444444444FEC20251231.txt','w',encoding='utf-8',newline='').write('\r\n'.join([head] + ['\t'.join(r) for r in rows + extra]) + '\r\n')
out = []
for r in rows:
    x = r[:]
    if x[0] != 'AN' and not ('20250101' <= x[3] <= '20250630'): continue
    for i in (3, 9, 15):
        if x[i]: x[i] = str(int(x[i][:4]) + 1) + x[i][4:]
    x[8] = x[8].replace('2025', '2026')
    out.append(x)
open('situ/444444444FEC20261231.txt','w',encoding='utf-8',newline='').write('\r\n'.join([head] + ['\t'.join(r) for r in out]) + '\r\n')
print(len(out), 'lignes situation')
