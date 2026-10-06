# Variante lettrée : chaque facture de tiers payant est réglée et lettrée individuellement, sauf quelques rejets.
import datetime, random
random.seed(9)
H = 'JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|CompAuxNum|CompAuxLib|PieceRef|PieceDate|EcritureLib|Debit|Credit|EcritureLet|DateLet|ValidDate|Montantdevise|Idevise'.split('|')
rows = [l.split('|') for l in open('222222222FEC20251231.txt', encoding='utf-8').read().split('\n')[1:] if l]
# On retire les virements groupés et on règle chaque ligne de tiers payant une à une
rows = [r for r in rows if not (r[0] == 'BQ' and r[4] in ('512000', '411000') and ('NOEMIE' in r[10] or r[10].startswith('VIR ')))]
out, n, code = [], [100000], [0]
def lettre():
    code[0] += 1
    s, c = '', code[0]
    while c: s = chr(65 + (c - 1) % 26) + s; c = (c - 1) // 26
    return s
rejets = []
for r in rows:
    out.append(r)
    if r[0] == 'VT' and r[4] == '411000' and r[11] != '0,00' and r[6] not in ('P-DUPONT',):
        amt = r[11]; d = datetime.datetime.strptime(r[3], '%Y%m%d').date()
        if random.random() < 0.03 and d.month < 11:   # rejet : jamais payé
            rejets.append((r[7], r[3], amt)); continue
        pay = d + datetime.timedelta(days=4 if r[6] in ('CPAM30', 'MSA') else 12)
        if pay.year > 2025: continue
        L = lettre(); r[13] = L; r[14] = pay.strftime('%Y%m%d')
        n[0] += 1; ds = pay.strftime('%Y%m%d')
        out.append(['BQ', 'Banque', str(n[0]), ds, '512000', 'Banque', '', '', f'BQ{n[0]}', ds, f'VIR {r[7]}', amt, '0,00', '', '', ds, '', ''])
        out.append(['BQ', 'Banque', str(n[0]), ds, '411000', 'Clients tiers payant', r[6], r[7], f'BQ{n[0]}', ds, f'VIR {r[7]}', '0,00', amt, L, ds, ds, '', ''])
with open('333333333FEC20251231.txt', 'w', encoding='utf-8') as f:
    f.write('|'.join(H) + '\n')
    for r in out: f.write('|'.join(r) + '\n')
print(len(out), 'lignes ·', len(rejets), 'rejets plantés pour', round(sum(float(a.replace(',', '.')) for _, _, a in rejets), 2), '€ ·', ', '.join(sorted({x[0] for x in rejets})))
