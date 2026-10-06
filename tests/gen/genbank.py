import datetime, random
random.seed(3)
rows = [l.split('\t') for l in open('123456789FEC20251231.txt', encoding='iso-8859-15', newline='').read().split('\r\n')[1:] if l]
ops = []  # (date, label, cents)
opening = 0
for r in rows:
    if r[4] != '512000': continue
    cents = round((float(r[11].replace(',', '.')) - float(r[12].replace(',', '.'))) * 100)
    d = r[3]
    if r[0] == 'AN': opening += cents; continue
    if not (d.isdigit() and '20250101' <= d <= '20251231'): continue
    try: dt = datetime.datetime.strptime(d, '%Y%m%d').date()
    except ValueError: continue
    ops.append([dt + datetime.timedelta(days=random.choice([0, 0, 1, 2, 3])), r[10].upper()[:31], cents])
# Chèque émis non encaissé : on retire le dernier paiement fournisseur de décembre
idx = max(i for i, o in enumerate(ops) if o[2] < 0 and 'PAIEMENT' in o[1] and o[0].month == 12)
removed = ops.pop(idx)
# Remise groupée : deux règlements clients d'octobre fusionnés
cl = [i for i, o in enumerate(ops) if o[2] > 0 and 'RÈGLEMENT' in o[1] and o[0].month == 10][:2]
a, b = ops[cl[0]], ops[cl[1]]
ops[cl[0]] = [a[0], 'REMISE CHEQUES 2', a[2] + b[2]]; ops.pop(cl[1])
# Opérations bancaires non comptabilisées
ops += [[datetime.date(2025, 5, 12), 'PRLV SEPA AXA ASSURANCE', -8990], [datetime.date(2025, 6, 30), 'FRAIS TENUE DE COMPTE', -1500], [datetime.date(2025, 10, 3), 'VIR RECU SARL NOUVEAU CLIENT', 125000]]
ops.sort(key=lambda o: o[0])
closing = opening + sum(o[2] for o in ops)
print('opérations', len(ops), '· ouverture', opening / 100, '· clôture', closing / 100, '· chèque retiré', removed[1], removed[2] / 100)

def cfonb_amt(c):
    s = f'{abs(c):014d}'
    last = int(s[-1])
    code = ('{ABCDEFGHI' if c >= 0 else '}JKLMNOPQR')[last]
    return s[:-1] + code
def rec(code, dt, amt, label=''):
    line = code + '30002' + '0000' + '00123' + 'EUR' + '2' + ' ' + '00012345678' + '  ' + dt.strftime('%d%m%y') + '  ' + dt.strftime('%d%m%y') + label.ljust(31)[:31] + '  ' + '0000000' + ' ' + ' ' + cfonb_amt(amt) + ''.ljust(16)
    assert len(line) == 120, len(line)
    return line
with open('releve-2025.cfonb', 'w', newline='') as f:
    f.write(rec('01', datetime.date(2024, 12, 31), opening) + '\r\n')
    for d, l, c in ops: f.write(rec('04', d, c, l) + '\r\n')
    f.write(rec('07', datetime.date(2025, 12, 31), closing) + '\r\n')
with open('releve-2025.ofx', 'w') as f:
    f.write('OFXHEADER:100\nDATA:OFXSGML\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><ACCTID>00012345678</BANKACCTFROM><BANKTRANLIST>\n')
    for d, l, c in ops: f.write(f'<STMTTRN>\n<TRNTYPE>{"CREDIT" if c > 0 else "DEBIT"}\n<DTPOSTED>{d:%Y%m%d}\n<TRNAMT>{c / 100:.2f}\n<NAME>{l}\n</STMTTRN>\n')
    f.write(f'</BANKTRANLIST><LEDGERBAL><BALAMT>{closing / 100:.2f}<DTASOF>20251231</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>\n')
with open('releve-2025-camt053.xml', 'w', encoding='utf-8') as f:
    f.write('<?xml version="1.0" encoding="UTF-8"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt><Acct><Id><IBAN>FR7630002000000001234567890</IBAN></Id></Acct>')
    bal = lambda code, c, d: f'<Bal><Tp><CdOrPrtry><Cd>{code}</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">{abs(c) / 100:.2f}</Amt><CdtDbtInd>{"CRDT" if c >= 0 else "DBIT"}</CdtDbtInd><Dt><Dt>{d}</Dt></Dt></Bal>'
    f.write(bal('OPBD', opening, '2025-01-01') + bal('CLBD', closing, '2025-12-31'))
    for d, l, c in ops:
        f.write(f'<Ntry><Amt Ccy="EUR">{abs(c) / 100:.2f}</Amt><CdtDbtInd>{"CRDT" if c > 0 else "DBIT"}</CdtDbtInd><BookgDt><Dt>{d:%Y-%m-%d}</Dt></BookgDt><NtryDtls><TxDtls><RmtInf><Ustrd>{l.replace("&", "&amp;")}</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>')
    f.write('</Stmt></BkToCstmrStmt></Document>')
with open('releve-2025.csv', 'w', encoding='cp1252', newline='') as f:
    f.write('Téléchargement du 05/01/2026;;;\r\nCompte courant n° 00012345678;;;\r\n\r\nDate;Libellé;Débit euros;Crédit euros\r\n')
    for d, l, c in ops:
        amt = f'{abs(c) / 100:.2f}'.replace('.', ',')
        f.write(f'{d:%d/%m/%Y};"{l}";{amt if c < 0 else ""};{amt if c > 0 else ""}\r\n')
