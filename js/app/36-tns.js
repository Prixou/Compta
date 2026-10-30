/*
 * Suivi Dossiers — TNS-COTISATION : régularisation des cotisations sociales des travailleurs non salariés à la clôture
 * (contrôle de l'avis Urssaf et de la caisse de retraite, reste dû ou trop-versé, écritures, rapport imprimable).
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- TNS-COTISATION ----------
// L'avis de l'Urssaf (définitives N-1, provisionnelles N, calendrier) et la date de clôture sont saisis ; l'outil
// recalcule les cotisations avec les barèmes de la réforme de l'assiette (2025-2026) pour contrôler l'avis, puis calcule
// ce qui reste dû au bilan : régularisation N-1 restant à payer + quote-part N rattachée à l'exercice (M/12 des
// définitives N estimées) − provisionnelles N payées. Saisie conservée dans le dossier choisi (chiffrée avec les autres
// données), en mémoire seulement sans dossier.

const TNS_YP = { 2025: { PASS: 47100, smic: 11.88 }, 2026: { PASS: 48060, smic: 12.02 }, 2027: { PASS: 48060, smic: 12.02 } };
const tnsYp = (y) => TNS_YP[y] || TNS_YP[2027];
const TNS_PROFILES = {
  ir: { nom: 'Gérant soumis à l\'IR', sub: 'BIC / EI / EURL à l\'IR · Urssaf', caisse: null, type: 'ir' },
  is: { nom: 'Gérant de société à l\'IS', sub: 'Gérant majoritaire · Urssaf', caisse: null, type: 'is' },
  kine: { nom: 'BNC · Kinésithérapeute', sub: 'Urssaf + CARPIMKO', caisse: 'CARPIMKO', type: 'bnc' },
  pharma: { nom: 'BNC · Pharmacien', sub: 'Urssaf + CAVP', caisse: 'CAVP', type: 'bnc' },
  archi: { nom: 'BNC · Architecte', sub: 'Urssaf (CIPAV incluse)', caisse: null, type: 'bnc' },
};
const tnsDef = () => ({
  client: '', prepare: '', profil: 'ir', cloture: `${new Date().getFullYear()}-12`, activite: 'artisan', partConv: '100', pamcMal: '0,10', pecAF: '0', capiCavp: '2906',
  benef: '', cotisDed: '', madelin: '', remu: '', cotisPrises: '', avantages: '', dividendes: '', capital: '', revBrutN1: '',
  assietteN: '', revBrutN: '', capPrec: '',
  defN1U: '', provN1U: '', regPayU: '', provNU: '', provResteU: '',
  defN1C: '', provN1C: '', regPayC: '', provNC: '', provResteC: '',
});

function tnsState() {
  ui.tns = ui.tns || { clientId: '', S: tnsDef() };
  return ui.tns;
}
function tnsSave() {
  const st = tnsState();
  const c = clientById(st.clientId);
  if (!c) return;
  c.tns = Object.assign({}, st.S);
  persist();
}
function tnsSelectClient(id) {
  const st = tnsState();
  const c = clientById(id);
  st.clientId = c ? c.id : '';
  if (c) st.S = Object.assign(tnsDef(), { client: c.nom || '' }, c.tns || {});
}

const tnsNum = (v) => {
  if (v === '' || v == null) return null;
  const n = parseFloat(String(v).replace(/[\s  €]/g, '').replace(',', '.'));
  return Number.isNaN(n) ? null : n;
};
const tnsN0 = (v) => tnsNum(v) || 0;
const tnsClamp = (x, a, b) => Math.min(Math.max(x, a), b);
const tnsNf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const tnsNf2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tnsEur = (v) => (v == null || Number.isNaN(v) ? '—' : `${tnsNf.format(Math.round(v))} €`);
const tnsEur2 = (v) => (v == null || Number.isNaN(v) ? '—' : `${tnsNf2.format(v)} €`);
const tnsPct = (v) => `${tnsNf2.format(v)} %`;

// Taux maladie progressif (interpolé entre les points du barème, en fraction du PASS)
function tnsTauxMaladie(A, P) {
  const k = [[0, 0], [0.2, 0], [0.4, 1.5], [0.6, 4], [1.1, 6.5], [2, 7.7], [3, 8.5]];
  const x = A / P;
  if (x >= 3) return 8.5;
  for (let i = 1; i < k.length; i++) {
    if (x <= k[i][0]) { const [x0, t0] = k[i - 1], [x1, t1] = k[i]; return t0 + ((t1 - t0) * (x - x0)) / (x1 - x0); }
  }
  return 8.5;
}
const tnsMaladie = (A, P) => (A <= 3 * P ? (A * tnsTauxMaladie(A, P)) / 100 : 3 * P * 0.085 + (A - 3 * P) * 0.065);
const tnsAfTaux = (A, P) => (A > 1.4 * P ? 3.1 : A > 1.1 * P ? (3.1 * (A - 1.1 * P)) / (0.3 * P) : 0);
// Assiette unique de la réforme : revenu brut − abattement de 26 % (borné à 1,76 % et 130 % du PASS)
function tnsAssiette(R, y) {
  const P = tnsYp(y).PASS;
  const ab = R > 0 ? Math.min(tnsClamp(R * 0.26, P * 0.0176, P * 1.3), R) : 0;
  return { R, abatt: ab, A: Math.max(0, R - ab) };
}

// Cotisations d'une année sur une assiette : { U: lignes Urssaf, C: lignes caisse } ; ligne = [libellé, assiette, taux, montant]
function tnsCotis(S, y, A) {
  const { PASS: P, smic } = tnsYp(y), pr = S.profil, pl = TNS_PROFILES[pr].type === 'bnc';
  const U = [], C = [];
  if (pr === 'kine') {
    const share = tnsClamp(tnsN0(S.partConv), 0, 100) / 100, tm = tnsTauxMaladie(A, P);
    U.push(['Maladie, activité conventionnée (part praticien)', A * share, tnsPct(tnsN0(S.pamcMal)), (A * share * tnsN0(S.pamcMal)) / 100]);
    if (share < 1) U.push(['Maladie, dépassements et hors convention', A * (1 - share), tnsPct(tm), (A * (1 - share) * tm) / 100]);
  } else U.push([`Maladie dans la limite de ${tnsNf.format(3 * P)} €`, A, tnsPct(tnsTauxMaladie(A, P)), tnsMaladie(A, P)]);
  if (pl) { const b = tnsClamp(A, 0.4 * P, 3 * P); U.push(['Indemnités journalières', b, '0,30 %', b * 0.003]); }
  else { const b = tnsClamp(A, 0.4 * P, 5 * P); U.push([`Indemnités journalières dans la limite de ${tnsNf.format(5 * P)} €`, b, '0,50 %', b * 0.005]); }
  const pec = pr === 'kine' ? tnsClamp(tnsN0(S.pecAF), 0, 100) / 100 : 0;
  U.push(['Allocations familiales', A, tnsPct(tnsAfTaux(A, P)), ((A * tnsAfTaux(A, P)) / 100) * (1 - pec)]);
  const Arb = Math.max(A, 450 * smic);
  if (!pl) {
    U.push([`Retraite de base dans la limite de ${tnsNf.format(P)} €`, Math.min(Arb, P), '17,87 %', Math.min(Arb, P) * 0.1787]);
    if (Arb > P) U.push(['Retraite de base au-delà du PASS', Arb - P, '0,72 %', (Arb - P) * 0.0072]);
    U.push([`Retraite complémentaire dans la limite de ${tnsNf.format(P)} €`, Math.min(A, P), '8,10 %', Math.min(A, P) * 0.081]);
    if (A > P) U.push(['Retraite complémentaire de 1 à 4 PASS', tnsClamp(A - P, 0, 3 * P), '9,10 %', tnsClamp(A - P, 0, 3 * P) * 0.091]);
    const Aid = Math.min(Math.max(A, 0.115 * P), P);
    U.push([`Invalidité-décès dans la limite de ${tnsNf.format(P)} €`, Aid, '1,30 %', Aid * 0.013]);
  }
  const rbPL = [['Retraite de base, tranche 1', Math.min(Arb, P), '8,73 %', Math.min(Arb, P) * 0.0873], ['Retraite de base, tranche 2', Math.min(Arb, 5 * P), '1,87 %', Math.min(Arb, 5 * P) * 0.0187]];
  if (pr === 'archi') {
    U.push(...rbPL);
    U.push(['Retraite complémentaire CIPAV, jusqu\'à 1 PASS', Math.min(A, P), '11 %', Math.min(A, P) * 0.11]);
    if (A > P) U.push(['Retraite complémentaire CIPAV, 1 à 4 PASS', tnsClamp(A - P, 0, 3 * P), '21 %', tnsClamp(A - P, 0, 3 * P) * 0.21]);
    const Aid = tnsClamp(A, 0.37 * P, 1.85 * P);
    U.push(['Invalidité-décès CIPAV', Aid, '0,50 %', Aid * 0.005]);
  }
  const cfpT = !pl && S.activite === 'artisan' ? 0.29 : 0.25;
  U.push([`Formation professionnelle ${y}`, P, tnsPct(cfpT), (P * cfpT) / 100]);
  if (pr === 'kine') U.push(['Contribution URPS (CURPS)', A, '0,10 %', Math.min(A * 0.001, P * 0.005)]);
  U.push(['CSG-CRDS', A, '9,70 %', A * 0.097]);
  if (pr === 'kine') {
    C.push(...rbPL);
    C.push(['Retraite complémentaire', Math.min(A, 5 * P), '8,70 % (min. 2 091 €)', Math.max(Math.min(A, 5 * P) * 0.087, 2091)]);
    C.push(['ASV, part forfaitaire', null, 'forfait', 222]);
    C.push(['ASV, part proportionnelle', Math.min(A, 5 * P), '0,16 %', Math.min(A, 5 * P) * 0.0016]);
    C.push(['Invalidité-décès', null, 'forfait', 1022]);
  } else if (pr === 'pharma') {
    C.push(...rbPL);
    C.push(['Retraite complémentaire, répartition', null, 'forfait', 7657]);
    C.push(['Retraite complémentaire, capitalisation (classe)', null, 'selon classe', tnsN0(S.capiCavp)]);
    C.push(['Invalidité-décès', null, 'forfait', 696]);
  }
  const sum = (L) => L.reduce((a, l) => a + l[3], 0);
  return { U, C, tU: sum(U), tC: sum(C), csgDed: A * 0.068, csgND: A * 0.029 };
}
// Revenu brut N-1 : celui de l'avis, sinon reconstitué (rémunération et dividendes au-delà de 10 % du capital à l'IS ;
// bénéfice + cotisations obligatoires et Madelin déduits sinon)
function tnsRevenuN1(S) {
  if (tnsNum(S.revBrutN1) != null) return tnsNum(S.revBrutN1);
  if (TNS_PROFILES[S.profil].type === 'is') {
    if (![S.remu, S.cotisPrises, S.madelin, S.avantages, S.dividendes].some((x) => tnsNum(x) != null)) return null;
    return tnsN0(S.remu) + tnsN0(S.cotisPrises) + tnsN0(S.madelin) + tnsN0(S.avantages) + Math.max(0, tnsN0(S.dividendes) - 0.1 * tnsN0(S.capital));
  }
  if (tnsNum(S.benef) == null) return null;
  return tnsN0(S.benef) + tnsN0(S.cotisDed) + tnsN0(S.madelin);
}

function tnsCompute(S) {
  const [N, M] = String(S.cloture || '').split('-').map(Number);
  const R1 = tnsRevenuN1(S);
  const a1 = R1 == null ? null : tnsAssiette(R1, N - 1);
  const c1 = a1 ? tnsCotis(S, N - 1, a1.A) : null;
  let AN = null, src = '';
  if (tnsNum(S.revBrutN) != null) { AN = tnsAssiette(tnsNum(S.revBrutN), N).A; src = 'revenu brut estimé'; }
  else if (tnsNum(S.assietteN) != null) { AN = tnsNum(S.assietteN); src = 'assiette de l\'avis'; }
  const cN = AN == null ? null : tnsCotis(S, N, AN);
  const orgs = [['U', 'Urssaf']];
  if (TNS_PROFILES[S.profil].caisse) orgs.push(['C', TNS_PROFILES[S.profil].caisse]);
  const res = orgs.map(([k, nom]) => {
    const calcN1 = c1 ? c1[`t${k}`] : null, calcN = cN ? cN[`t${k}`] : null;
    const defN1 = tnsNum(S[`defN1${k}`]) ?? calcN1, provN1 = tnsNum(S[`provN1${k}`]), regPay = tnsN0(S[`regPay${k}`]);
    const provN = tnsNum(S[`provN${k}`]), provReste = tnsN0(S[`provReste${k}`]);
    const regul = defN1 != null && provN1 != null ? defN1 - provN1 : null;
    const resteN1 = regul == null ? null : regul - regPay;
    const quote = calcN == null ? null : (calcN * M) / 12;
    const provPaye = provN == null ? null : provN - provReste;
    const soldeN = quote == null || provPaye == null ? null : quote - provPaye;
    return {
      k, nom, calcN1, calcN, defN1, provN1, regPay, provN, provReste, regul, resteN1, quote, provPaye, soldeN,
      total: resteN1 == null || soldeN == null ? null : resteN1 + soldeN,
      ecartN1: tnsNum(S[`defN1${k}`]) != null && calcN1 != null ? tnsNum(S[`defN1${k}`]) - calcN1 : null,
      ecartProvN: provN != null && calcN != null && src === 'assiette de l\'avis' ? provN - calcN : null,
    };
  });
  const tot = res.every((o) => o.total != null) ? res.reduce((a, o) => a + o.total, 0) : null;
  const d = new Date(N, M, 0);
  const fin = `${pad(d.getDate())}/${pad(M)}/${N}`;
  return { N, M, fin, R1, a1, c1, AN, src, cN, res, tot };
}
// Écritures proposées : [débit, crédit, libellé, montant]
function tnsEntries(S, r) {
  const out = [], cap = tnsNum(S.capPrec);
  if (cap) out.push(['4386', '646', 'Extourne des charges à payer du bilan précédent', cap]);
  if (r.tot != null && Math.abs(r.tot) >= 1) out.push(r.tot > 0 ? ['646', '4386', `Cotisations sociales restant dues au ${r.fin}`, r.tot] : ['4387', '646', `Cotisations sociales trop versées au ${r.fin}`, -r.tot]);
  return out;
}
const tnsControl = (e) => (e == null ? '—' : Math.abs(e) <= 5 ? 'Conforme' : `Écart ${tnsEur(e)}`);
const TNS_SITU = (r) => [[`Régularisation ${r.N - 1} restant à payer`, 'resteN1'], [`Définitives ${r.N} estimées`, 'calcN'], [`Quote-part ${r.N} rattachée (${r.M}/12)`, 'quote'], [`Provisionnelles ${r.N} payées au ${r.fin}`, 'provPaye'], [`Solde ${r.N} (quote-part − payé)`, 'soldeN']];
const tnsSum = (r, k) => (r.res.every((o) => o[k] != null) ? r.res.reduce((a, o) => a + o[k], 0) : null);

function tnsDetail(S, c, titre) {
  if (!c) return '';
  const p = TNS_PROFILES[S.profil];
  const lines = (L) => L.map((l) => `<tr><td>${esc(l[0])}</td><td class="n">${l[1] == null ? '—' : tnsEur(l[1])}</td><td class="n">${esc(l[2])}</td><td class="n">${tnsEur(l[3])}</td></tr>`).join('');
  return `<section class="card"><h2>${esc(titre)}</h2><div class="grid-wrap"><table class="dtable tns-t"><thead><tr><th>Cotisation</th><th class="n">Assiette</th><th class="n">Taux</th><th class="n">Montant</th></tr></thead><tbody>
    ${p.caisse ? '<tr class="tns-sec"><td colspan="4">Urssaf</td></tr>' : ''}${lines(c.U)}<tr class="tns-tot"><td>Total Urssaf</td><td></td><td></td><td class="n">${tnsEur(c.tU)}</td></tr>
    ${p.caisse ? `<tr class="tns-sec"><td colspan="4">${esc(p.caisse)}</td></tr>${lines(c.C)}<tr class="tns-tot"><td>Total ${esc(p.caisse)}</td><td></td><td></td><td class="n">${tnsEur(c.tC)}</td></tr>` : ''}
    </tbody></table></div><p class="muted small">CSG déductible : ${tnsEur(c.csgDed)} · CSG-CRDS non déductible : ${tnsEur(c.csgND)}</p></section>`;
}

function viewTns(clientId) {
  const st = tnsState();
  if (clientId && clientId !== st.clientId && clientById(clientId)) tnsSelectClient(clientId);
  const S = st.S, p = TNS_PROFILES[S.profil], t = p.type, r = tnsCompute(S), N = r.N, M = r.M;
  const clients = data.clients.filter((c) => !c.archive).sort((a, b) => clientLabel(a).localeCompare(clientLabel(b), 'fr'));
  const f = (k, l, ph = '') => `<label>${esc(l)}<input data-tns="${k}" value="${esc(S[k])}" inputmode="decimal" autocomplete="off"${ph ? ` placeholder="${esc(ph)}"` : ''}></label>`;
  const revN1 = t === 'is'
    ? f('remu', `Rémunération nette ${N - 1} (art. 62)`) + f('cotisPrises', 'Cotisations obligatoires prises en charge') + f('madelin', 'Madelin / PER pris en charge') + f('avantages', 'Avantages en nature') + f('dividendes', 'Dividendes perçus') + f('capital', 'Capital + primes + comptes courants')
    : f('benef', t === 'bnc' ? `Bénéfice BNC ${N - 1}` : `Bénéfice ${N - 1}`) + f('cotisDed', 'Cotisations obligatoires déduites') + f('madelin', 'Madelin / PER déduits');
  const extra = (t !== 'bnc' ? `<label>Activité<select data-tns="activite">${options({ artisan: 'Artisan (formation 0,29 %)', commercant: 'Commerçant (formation 0,25 %)' }, S.activite === 'artisan' ? 'artisan' : 'commercant')}</select></label>` : '')
    + (S.profil === 'kine' ? f('partConv', 'Part du revenu conventionnée (%)') + f('pamcMal', 'Taux maladie à charge du praticien (%)') + f('pecAF', 'Prise en charge des allocations familiales (%)') : '')
    + (S.profil === 'pharma' ? f('capiCavp', 'Capitalisation CAVP de la classe (€)') : '');
  const good = (e) => (e == null ? '' : Math.abs(e) <= 5 ? 'tns-pos' : 'tns-neg');
  const orgInputs = (o) => `<section class="card"><h2>Avis ${esc(o.nom)}</h2><p class="muted small">Montants de l'avis reçu en ${N}.</p>
    <h3>Définitives ${N - 1}</h3><div class="tns-grid">
     ${f(`defN1${o.k}`, `Cotisations définitives ${N - 1}`, o.calcN1 != null ? `recalculé : ${Math.round(o.calcN1)}` : '')}
     ${f(`provN1${o.k}`, `Provisionnelles ${N - 1} déjà appelées`)}
     ${f(`regPay${o.k}`, `Régularisation ${N - 1} déjà payée au ${r.fin}`, '0')}</div>
    <h3>Provisionnelles ${N}</h3><div class="tns-grid">
     ${f(`provN${o.k}`, `Total des provisionnelles ${N}`, o.calcN != null ? `recalculé : ${Math.round(o.calcN)}` : '')}
     ${f(`provReste${o.k}`, `Provisionnelles ${N} restant à payer après le ${r.fin}`, '0')}</div>
    <div class="kpis tns-kpis">
     ${kpiTile(`Régularisation ${N - 1}`, tnsEur(o.regul), o.regul > 0 ? 'tns-neg' : 'tns-pos')}
     ${kpiTile(`Contrôle définitives ${N - 1}`, o.ecartN1 == null ? '—' : Math.abs(o.ecartN1) <= 5 ? 'Conforme' : tnsEur(o.ecartN1), good(o.ecartN1))}
     ${o.ecartProvN != null ? kpiTile(`Contrôle provisionnelles ${N}`, Math.abs(o.ecartProvN) <= 5 ? 'Conforme' : tnsEur(o.ecartProvN), good(o.ecartProvN)) : ''}
    </div></section>`;
  const multi = r.res.length > 1;
  const ent = tnsEntries(S, r);
  return `<div class="page-head"><div><h1>Cotisations TNS</h1><p class="muted small">Régularisation des cotisations sociales des travailleurs non salariés à la clôture</p></div>
      <div class="head-actions"><button class="btn" data-action="tns-print">${icon('file')}Rapport (imprimer ou PDF)</button><button class="btn" data-action="tns-clear">Vider</button></div></div>
    <p class="muted">Reprenez l'avis de l'Urssaf (définitives ${N - 1}, provisionnelles ${N}, calendrier) et la date de clôture. L'outil contrôle les montants avec les taux en vigueur et calcule ce qui reste dû au bilan, année par année.</p>
    <div class="tns-profiles" role="group" aria-label="Profil">${Object.entries(TNS_PROFILES).map(([k, x]) => `<button type="button" data-action="tns-profil" data-p="${k}" aria-pressed="${S.profil === k}">${esc(x.nom)}<small>${esc(x.sub)}</small></button>`).join('')}</div>
    <section class="card"><h2>Clôture et revenus</h2>
      <div class="tns-grid">
        <label>Dossier<select data-tns="dossier">${options(Object.fromEntries(clients.map((x) => [x.id, `${x.code ? x.code + ' — ' : ''}${clientLabel(x)}`])), st.clientId, '— Sans dossier —')}</select></label>
        <label>Client<input data-tns="client" value="${esc(S.client)}" autocomplete="off"></label>
        <label>Préparé par<input data-tns="prepare" value="${esc(S.prepare)}" autocomplete="off"></label>
        <label>Date de clôture de l'exercice<input type="month" data-tns="cloture" value="${esc(S.cloture)}"></label>
        ${extra}
      </div>
      <p class="muted small">${st.clientId ? 'Saisie conservée dans le dossier (chiffrée avec les autres données).' : 'Sans dossier, la saisie reste en mémoire jusqu\'au verrouillage.'}</p>
      <h3>Revenu ${N - 1} (pour contrôler les définitives ${N - 1})</h3>
      <div class="tns-grid">${revN1}${f('revBrutN1', `ou revenu brut ${N - 1} de l'avis`)}</div>
      ${r.a1 ? `<p class="muted small">Revenu brut ${tnsEur(r.a1.R)} − abattement ${tnsEur(r.a1.abatt)} = assiette ${tnsEur(r.a1.A)}</p>` : ''}
      <h3>Revenu ${N} (pour estimer les définitives ${N})</h3>
      <div class="tns-grid">${f('assietteN', `Assiette ${N} de l'avis (revenu estimé)`)}${f('revBrutN', `ou revenu brut ${N} estimé à la clôture`)}</div>
      <p class="muted small">${r.AN == null ? `Sans revenu ${N}, la quote-part ${N} ne peut pas être calculée.` : `Assiette ${N} retenue : ${tnsEur(r.AN)} (${esc(r.src)}). Si le résultat de l'exercice laisse prévoir un revenu ${N} différent, saisissez le revenu brut estimé.`}</p>
    </section>
    <div class="tns-org">${r.res.map(orgInputs).join('')}</div>
    <section class="card tns-situ"><h2>Situation au ${r.fin}</h2>
      <p class="muted small">${M === 12 ? `Exercice calé sur l'année civile : les cotisations ${N} sont rattachées en totalité.` : `Exercice décalé : ${M} mois de ${N} sont rattachés à l'exercice (${M}/12 des définitives ${N} estimées), et la régularisation ${N - 1} restant à payer est une dette à la clôture.`}</p>
      <div class="grid-wrap"><table class="dtable tns-t"><thead><tr><th>Élément</th>${r.res.map((o) => `<th class="n">${esc(o.nom)}</th>`).join('')}${multi ? '<th class="n">Total</th>' : ''}</tr></thead><tbody>
        ${TNS_SITU(r).map(([l, k]) => `<tr><td>${esc(l)}</td>${r.res.map((o) => `<td class="n">${tnsEur(o[k])}</td>`).join('')}${multi ? `<td class="n">${tnsEur(tnsSum(r, k))}</td>` : ''}</tr>`).join('')}
        <tr class="tns-tot"><td>${r.tot == null ? 'Reste dû' : r.tot >= 0 ? 'Reste dû à la clôture' : 'Trop-versé à la clôture'}</td>${r.res.map((o) => `<td class="n ${o.total > 0 ? 'tns-neg' : 'tns-pos'}">${tnsEur(o.total)}</td>`).join('')}${multi ? `<td class="n">${tnsEur(r.tot)}</td>` : ''}</tr>
      </tbody></table></div>
      <h3>Écritures</h3>
      <div class="tns-grid">${f('capPrec', 'Charges à payer au bilan précédent (4386)', '0')}</div>
      ${r.tot == null ? `<p class="muted small">Complétez l'avis et le revenu ${N} pour obtenir les écritures.</p>` : `<div class="grid-wrap"><table class="dtable tns-t tns-entry"><thead><tr><th>Débit</th><th>Crédit</th><th>Libellé</th><th class="n">Montant</th></tr></thead><tbody>
        ${ent.map((e) => `<tr><td>${e[0]}</td><td>${e[1]}</td><td>${esc(e[2])}</td><td class="n">${tnsEur2(e[3])}</td></tr>`).join('')}
        ${Math.abs(r.tot) < 1 ? '<tr><td colspan="4">Aucune charge à payer à la clôture.</td></tr>' : ''}
      </tbody></table></div>
      <p class="muted small">${t === 'is' ? 'Écriture dans les comptes de la société (cotisations du gérant).' : 'Pour une entreprise individuelle, la CSG-CRDS non déductible comprise dans la charge reste à réintégrer extra-comptablement.'}</p>`}
    </section>
    ${tnsDetail(S, r.c1, `Définitives ${N - 1} recalculées`)}
    ${tnsDetail(S, r.cN, `Définitives ${N} estimées`)}
    <p class="tns-note small">Barèmes 2025-2026 de la réforme de l'assiette, contrôlés sur un avis réel de gérant : retraite de base à 17,87 % jusqu'au PASS (0,72 % sur la seule fraction au-delà), formation professionnelle non régularisée. ${S.profil === 'kine' ? 'Kinésithérapeute : vérifiez sur l\'avis la part maladie à charge et la prise en charge des allocations familiales. ' : ''}${S.profil === 'pharma' ? 'CAVP : capitalisation selon la classe (2 906 € à 17 436 € en 2026). ' : ''}Montants des caisses 2026 appliqués aussi à 2025.</p>`;
}

function onTnsChange(t) {
  const st = tnsState();
  const k = t.dataset.tns;
  if (k === 'dossier') {
    if (t.value) tnsSelectClient(t.value);
    else st.clientId = '';
  } else {
    st.S[k] = t.value;
    tnsSave();
  }
  // Champ suivant gardé actif après le nouveau dessin de la page
  setTimeout(() => {
    const a = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.tns : '';
    refresh();
    if (a) { const n = document.querySelector(`[data-tns="${a}"]`); if (n) n.focus(); }
  }, 0);
}
function tnsProfil(p) {
  const st = tnsState();
  if (!TNS_PROFILES[p]) return;
  st.S.profil = p;
  tnsSave();
  refresh();
}
function tnsClear() {
  const st = tnsState();
  const c = clientById(st.clientId);
  st.S = Object.assign(tnsDef(), { client: c ? c.nom || '' : '' });
  if (c) { delete c.tns; persist(); }
  refresh();
}

// Rapport : revenus, contrôle de l'avis, situation à la clôture, écritures et détail des cotisations (imprimer ou
// enregistrer en PDF depuis la fenêtre d'impression)
function tnsPrint() {
  const S = tnsState().S, r = tnsCompute(S), p = TNS_PROFILES[S.profil], N = r.N;
  const multi = r.res.length > 1;
  const tbl = (head, rows) => `<table class="note-table"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((rw) => `<tr${rw.cls ? ` class="${rw.cls}"` : ''}>${rw.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const row = (l, k) => [l, ...r.res.map((o) => tnsEur(o[k]))];
  const cols = r.res.map((o) => o.nom);
  const situ = TNS_SITU(r).map(([l, k]) => [l, ...r.res.map((o) => tnsEur(o[k])), ...(multi ? [tnsEur(tnsSum(r, k))] : [])]);
  const last = ['Reste dû (+) ou trop-versé (−) à la clôture', ...r.res.map((o) => tnsEur(o.total)), ...(multi ? [tnsEur(r.tot)] : [])];
  last.cls = 'tns-tot';
  const ent = tnsEntries(S, r).map((e) => [e[0], e[1], e[2], tnsEur2(e[3])]);
  const det = (c, title) => {
    if (!c) return '';
    const rows = [];
    const add = (L, nom, tt) => {
      if (p.caisse) { const h = [nom, '', '', '']; h.cls = 'tns-sec'; rows.push(h); }
      L.forEach((l) => rows.push([l[0], l[1] == null ? '—' : tnsEur(l[1]), l[2], tnsEur(l[3])]));
      const tr = [`Total ${nom}`, '', '', tnsEur(tt)]; tr.cls = 'tns-tot'; rows.push(tr);
    };
    add(c.U, 'Urssaf', c.tU);
    if (p.caisse) add(c.C, p.caisse, c.tC);
    return `<h2>${esc(title)}</h2>${tbl(['Cotisation', 'Assiette', 'Taux', 'Montant'], rows)}<p class="note-foot">CSG déductible : ${tnsEur(c.csgDed)} – CSG-CRDS non déductible : ${tnsEur(c.csgND)}</p>`;
  };
  printHtml(`<article class="note tns-print">
    <h1>Régularisation des cotisations sociales TNS</h1>
    <p>${esc(S.client || 'Client non renseigné')} – ${esc(p.nom)} – clôture au ${r.fin}<br>Édité le ${fmtDate(todayStr())}${S.prepare ? ` par ${esc(S.prepare)}` : ''}</p>
    <h2>1. Revenus et assiettes</h2>
    ${tbl(['Élément', 'Montant'], [[`Revenu brut ${N - 1}`, r.a1 ? tnsEur(r.a1.R) : '—'], [`Abattement forfaitaire ${N - 1}`, r.a1 ? tnsEur(r.a1.abatt) : '—'], [`Assiette ${N - 1}`, r.a1 ? tnsEur(r.a1.A) : '—'], [`Assiette ${N} retenue${r.src ? ` (${r.src})` : ''}`, tnsEur(r.AN)]])}
    <h2>2. Avis de cotisations et contrôle</h2>
    ${tbl(['Élément', ...cols], [row(`Définitives ${N - 1} (avis)`, 'defN1'), row(`Définitives ${N - 1} recalculées`, 'calcN1'), [`Contrôle des définitives ${N - 1}`, ...r.res.map((o) => tnsControl(o.ecartN1))],
      row(`Provisionnelles ${N - 1} appelées`, 'provN1'), row(`Régularisation ${N - 1}`, 'regul'), row(`Provisionnelles ${N} (avis)`, 'provN'), row(`Provisionnelles ${N} recalculées`, 'calcN'), row(`Provisionnelles ${N} restant à payer après le ${r.fin}`, 'provReste')])}
    <h2>3. Situation au ${r.fin}</h2>
    ${tbl(['Élément', ...cols, ...(multi ? ['Total'] : [])], [...situ, last])}
    <h2>4. Écritures proposées</h2>
    ${tbl(['Débit', 'Crédit', 'Libellé', 'Montant'], ent.length ? ent : [['', '', r.tot == null ? 'Données incomplètes' : 'Aucune écriture', '']])}
    ${det(r.c1, `5. Définitives ${N - 1} recalculées`)}
    ${det(r.cN, `6. Définitives ${N} estimées`)}
    <p class="note-foot">Calcul établi avec les barèmes 2025-2026 de la réforme de l'assiette des indépendants, à rapprocher des avis des organismes. Document de travail interne couvert par le secret professionnel.</p>
  </article>`);
}
