/*
 * Suivi Dossiers — Revue N / N-1, note de synthèse, rapprochement bancaire.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- Revue analytique N / N-1 et contrôles de cohérence ----------

const RUBRIQUES = {
  10: 'Capital et réserves', 11: 'Report à nouveau', 12: 'Résultat', 13: "Subventions d'investissement", 14: 'Provisions réglementées',
  15: 'Provisions pour risques et charges', 16: 'Emprunts et dettes assimilées', 17: 'Dettes rattachées à des participations',
  20: 'Immobilisations incorporelles', 21: 'Immobilisations corporelles', 23: 'Immobilisations en cours', 26: 'Participations',
  27: 'Autres immobilisations financières', 28: 'Amortissements des immobilisations', 29: 'Dépréciations des immobilisations',
  31: 'Matières premières', 33: 'En-cours de production', 35: 'Stocks de produits', 37: 'Stocks de marchandises', 39: 'Dépréciations des stocks',
  40: 'Fournisseurs', 41: 'Clients', 42: 'Personnel', 43: 'Organismes sociaux', 44: 'État et collectivités', 45: 'Groupe et associés',
  46: 'Débiteurs et créditeurs divers', 47: "Comptes d'attente et de régularisation", 48: 'Comptes de régularisation', 49: 'Dépréciations des comptes de tiers',
  50: 'Valeurs mobilières de placement', 51: 'Banques', 53: 'Caisse', 58: 'Virements internes',
  60: 'Achats', 61: 'Services extérieurs', 62: 'Autres services extérieurs', 63: 'Impôts et taxes', 64: 'Charges de personnel',
  65: 'Autres charges de gestion courante', 66: 'Charges financières', 67: 'Charges exceptionnelles', 68: 'Dotations aux amortissements et provisions',
  69: 'Participation et impôt sur les bénéfices', 70: "Chiffre d'affaires", 71: 'Production stockée', 72: 'Production immobilisée',
  74: "Subventions d'exploitation", 75: 'Autres produits de gestion courante', 76: 'Produits financiers', 77: 'Produits exceptionnels',
  78: 'Reprises sur amortissements et provisions', 79: 'Transferts de charges',
};

// Valeur « naturelle » d'un compte : charges au débit, produits au crédit, bilan en solde débiteur (+) / créditeur (-).
const acctValue = (b) => (b.compte[0] === '7' ? -b.s : b.s);

function revueData(r, prev, seuil, seuilPct) {
  const byAcc = new Map();
  r.balance.forEach((b) => byAcc.set(b.compte, { compte: b.compte, lib: b.lib, n: acctValue(b), n1: 0 }));
  if (prev) prev.balance.forEach((b) => {
    const x = byAcc.get(b.compte) || { compte: b.compte, lib: b.lib, n: 0, n1: 0 };
    x.n1 = acctValue(b);
    byAcc.set(b.compte, x);
  });
  const accounts = Array.from(byAcc.values()).map((x) => {
    const delta = Math.round((x.n - x.n1) * 100) / 100;
    const pct = x.n1 ? delta / Math.abs(x.n1) : null;
    const flagged = !!prev && Math.abs(delta) >= seuil && (pct === null || Math.abs(pct) >= seuilPct);
    return Object.assign(x, { delta, pct, flagged, rub: x.compte.slice(0, 2) });
  }).sort((a, b) => a.compte.localeCompare(b.compte));
  const rubs = new Map();
  accounts.forEach((a) => {
    if (!RUBRIQUES[a.rub]) return;
    const g = rubs.get(a.rub) || { code: a.rub, label: RUBRIQUES[a.rub], n: 0, n1: 0, accounts: [] };
    g.n += a.n;
    g.n1 += a.n1;
    g.accounts.push(a);
    rubs.set(a.rub, g);
  });
  const rubriques = Array.from(rubs.values()).map((g) => {
    const delta = g.n - g.n1;
    return Object.assign(g, { delta, pct: g.n1 ? delta / Math.abs(g.n1) : null, flagged: g.accounts.some((a) => a.flagged) });
  }).sort((a, b) => a.code.localeCompare(b.code));
  return { accounts, rubriques, flagged: accounts.filter((a) => a.flagged).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)) };
}

function defaultSeuil(r) {
  const base = Math.max(r.kpi.ca, 0) || r.balance.filter((b) => b.compte[0] === '6').reduce((t, b) => t + Math.max(b.s, 0), 0);
  return Math.max(500, Math.round((base * 0.01) / 100) * 100);
}

// Sommes par préfixes de compte : mouvements de l'exercice (hors à-nouveaux) ou solde de fin.
function sums(r) {
  const match = (b, pref, excl) => pref.some((p) => b.compte.startsWith(p)) && !(excl || []).some((p) => b.compte.startsWith(p));
  return {
    mv: (pref, excl) => r.balance.reduce((t, b) => (match(b, pref, excl) ? t + (b.dm - b.cm) : t), 0),
    solde: (pref, excl) => r.balance.reduce((t, b) => (match(b, pref, excl) ? t + b.s : t), 0),
    opening: (pref, excl) => r.balance.reduce((t, b) => (match(b, pref, excl) ? t + b.an : t), 0),
  };
}

function ratios(r) {
  const { mv, solde } = sums(r);
  const ca = r.kpi.ca;
  const achatsTTC = (mv(['60', '61', '62']) || 0) * 1.2;
  const cp = r.bilan.passif[0][1];
  const dettesFin = r.bilan.passif[2][1];
  const ventesMarch = -mv(['707', '7097']);
  return {
    // Taux de marge seulement si la vente de marchandises est une activité significative.
    tauxMarge: ventesMarch > 0 && ventesMarch >= ca * 0.1 ? r.kpi.marge / ventesMarch : null,
    ebeCa: ca > 0 ? r.kpi.ebe / ca : null,
    resCa: ca > 0 ? r.kpi.resultat / ca : null,
    dso: ca > 0 ? (Math.max(solde(['411']), 0) / (ca * 1.2)) * 365 : null,
    dpo: achatsTTC > 0 ? (Math.max(-solde(['401']), 0) / achatsTTC) * 365 : null,
    endettement: cp > 0 ? dettesFin / cp : null,
    cp, dettesFin,
  };
}

function coherenceChecks(r, prev, client) {
  const out = [];
  const add = (level, label, detail) => out.push({ level, label, detail, examples: [], count: 0 });
  const { mv, solde } = sums(r);
  const pctTxt = (x) => (x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %';
  const ca = r.kpi.ca;

  // TVA
  const collectee = -mv(['4457']);
  const deductible = mv(['4456']);
  const franchise = client && /franchise|non assujetti/i.test(client.regimeTva || '');
  if (ca > 1000 && !franchise && ui.fecProfile !== 'pharmacie') {
    const taux = collectee / ca;
    if (collectee <= 0) add('warn', 'Aucune TVA collectée', `CA de ${eur(ca, 0)} € sans TVA collectée (4457) : activité exonérée, autoliquidation, ou TVA non comptabilisée ?`);
    else if (taux < 0.04 || taux > 0.205) add('warn', 'Taux apparent de TVA collectée atypique', `TVA collectée ${eur(collectee, 0)} € pour un CA de ${eur(ca, 0)} € (${pctTxt(taux)}) : vérifier les taux appliqués et les opérations exonérées.`);
    else add('ok', 'Taux apparent de TVA collectée cohérent', `${pctTxt(taux)} du chiffre d'affaires.`);
  }
  const reste4457 = -solde(['4457']);
  if (collectee > 0 && reste4457 > collectee * 0.35) add('warn', 'TVA collectée non reversée', `Solde de ${eur(reste4457, 0)} € en 4457 en fin de période, soit plus de 4 mois de TVA : déclarations manquantes ou écritures de liquidation non passées ?`);
  const reste4456 = solde(['4456']);
  if (deductible > 0 && reste4456 > deductible * 0.35) add('warn', 'TVA déductible non récupérée', `Solde de ${eur(reste4456, 0)} € en 4456 en fin de période, soit plus de 4 mois de TVA déductible.`);

  // Social
  const salaires = mv(['641', '644']);
  const charges = mv(['645', '646', '647']);
  if (salaires > 0) {
    const tx = charges / salaires;
    if (charges <= 0) add('warn', 'Salaires sans charges sociales', `${eur(salaires, 0)} € de rémunérations sans charges sociales comptabilisées (645).`);
    else if (tx < 0.2 || tx > 0.65) add('warn', 'Ratio charges sociales / salaires atypique', `${pctTxt(tx)} (habituellement 25 à 50 %) : vérifier les écritures de paie et les exonérations.`);
    else add('ok', 'Charges sociales cohérentes avec les salaires', `${pctTxt(tx)} des rémunérations.`);
    const du421 = -solde(['421']);
    if (du421 > (salaires / 12) * 1.5) add('warn', 'Salaires restant dus', `${eur(du421, 0)} € au crédit du 421 : plus d'un mois de salaires non versés ?`);
  }

  // Amortissements
  const immoAmort = solde(['21']);
  const dotations = mv(['6811', '6812']);
  if (immoAmort > 0 && dotations <= 0) add('warn', 'Pas de dotation aux amortissements', `Immobilisations corporelles de ${eur(immoAmort, 0)} € sans dotation (6811) : amortissements à comptabiliser à la clôture.`);
  else if (immoAmort > 0) add('ok', 'Dotations aux amortissements comptabilisées', `${eur(dotations, 0)} €, soit ${pctTxt(dotations / immoAmort)} des immobilisations corporelles brutes.`);

  // Emprunts
  const emprunts = -solde(['164', '165', '166', '167', '168']);
  const empruntsDebut = -sums(r).opening(['164', '165', '166', '167', '168']);
  const interets = mv(['6611', '6616']);
  if (emprunts > 0 || empruntsDebut > 0) {
    const moyen = (emprunts + empruntsDebut) / 2 || emprunts;
    if (interets <= 0) add('warn', "Emprunts sans intérêts comptabilisés", `Emprunts de ${eur(Math.max(emprunts, empruntsDebut), 0)} € sans intérêts en 6611 : échéances non ventilées capital / intérêts ?`);
    else if (moyen > 0 && interets / moyen > 0.1) add('warn', "Taux d'intérêt apparent élevé", `${pctTxt(interets / moyen)} de l'encours moyen : vérifier la ventilation des échéances.`);
    else if (moyen > 0) add('ok', 'Intérêts cohérents avec les emprunts', `Taux apparent ${pctTxt(interets / moyen)}.`);
  }

  // Capitaux propres
  const capital = -solde(['101', '108']);
  const cp = r.bilan.passif[0][1];
  if (r.meta.hasAN && capital > 0 && cp < capital / 2) {
    add('error', 'Capitaux propres inférieurs à la moitié du capital social', `Capitaux propres ${eur(cp, 0)} € pour un capital de ${eur(capital, 0)} € : consultation des associés dans les 4 mois de l'approbation des comptes (art. L223-42 / L225-248 C. com.).`);
  } else if (r.meta.hasAN && cp < 0) add('error', 'Capitaux propres négatifs', `${eur(cp, 0)} €.`);

  // Impôt sur les sociétés
  const is = mv(['695', '696', '697', '698', '699']);
  if (r.kpi.resultat > 0 && is <= 0 && client && norm(client.regimeFiscal) === 'is') add('info', "Impôt sur les sociétés non comptabilisé", "Résultat bénéficiaire sans IS en 695 : à calculer et comptabiliser à la clôture.");

  // Mois sans chiffre d'affaires
  const period = r.monthly.filter((m) => !r.meta.closing || m.mois <= r.meta.closing.slice(0, 7));
  const sansCa = period.filter((m) => m.ca <= 0).map((m) => m.mois);
  if (ca > 0 && sansCa.length && sansCa.length < period.length) add('info', "Mois sans chiffre d'affaires", `${fmtMonths(sansCa)} : activité saisonnière ou factures non saisies ?`);

  // Points fiscaux
  const fisc = [
    [['6712', '6711'], 'Pénalités et amendes', 'non déductibles : à réintégrer sur la 2058-A'],
    [['6234'], 'Cadeaux à la clientèle', 'TVA récupérable seulement si ≤ 73 € TTC par bénéficiaire et par an ; relevé des frais généraux si seuil dépassé'],
    [['6238', '6713'], 'Dons', 'réduction d\'impôt mécénat possible (2069-RCI), non déductibles du résultat'],
    [['6226', '6227', '6228', '622'], 'Honoraires', 'DAS2 à déposer pour chaque bénéficiaire ayant reçu plus de 1 200 €'],
    [['6615'], 'Intérêts des comptes courants', 'vérifier le taux maximal déductible et la libération du capital'],
    [['6354'], 'Taxes sur les véhicules', 'non déductibles (taxes annuelles sur les véhicules de tourisme)'],
  ];
  fisc.forEach(([pref, label, detail]) => {
    const v = mv(pref);
    if (v > (label === 'Honoraires' ? 1200 : 0)) add('info', `${label} : ${eur(v, 0)} €`, detail);
  });

  // Comparaison N-1
  if (prev) {
    const d = (a, b) => (b ? (a - b) / Math.abs(b) : null);
    const vCa = d(r.kpi.ca, prev.kpi.ca);
    if (vCa !== null && Math.abs(vCa) >= 0.2) add('info', `Chiffre d'affaires ${vCa > 0 ? 'en hausse' : 'en baisse'} de ${pctTxt(Math.abs(vCa))}`, `${eur(prev.kpi.ca, 0)} € → ${eur(r.kpi.ca, 0)} €`);
    const rn = ratios(r), rp = ratios(prev);
    if (rn.tauxMarge !== null && rp.tauxMarge !== null && Math.abs(rn.tauxMarge - rp.tauxMarge) >= 0.05) add('warn', 'Taux de marge commerciale en forte variation', `${pctTxt(rp.tauxMarge)} → ${pctTxt(rn.tauxMarge)} : stock, prix d'achat, ou achats non rattachés à l'exercice ?`);
    if (rn.dso !== null && rp.dso !== null && rn.dso - rp.dso > 20) add('info', 'Délai de paiement clients allongé', `${Math.round(rp.dso)} j → ${Math.round(rn.dso)} j : créances à surveiller (dépréciation ?).`);
    if (prev.meta.closing && r.meta.closing) {
      const gap = daysUntilFrom(prev.meta.closing, r.meta.closing);
      if (gap < 330 || gap > 400) add('warn', 'Exercices non consécutifs', `Clôtures du ${fmtDate(prev.meta.closing)} et du ${fmtDate(r.meta.closing)} : vérifier que le FEC N-1 est le bon.`);
    }
    if (prev.meta.siren && r.meta.siren && prev.meta.siren !== r.meta.siren) add('error', 'SIREN différents', `Le FEC N-1 (${prev.meta.siren}) ne correspond pas au même dossier (${r.meta.siren}).`);
  }
  return out;
}

function revueComments() {
  const f = ui.fec;
  const c = clientById(f.clientId);
  const key = f.result.meta.closing || f.result.meta.fileName;
  if (c) {
    c.revue = c.revue || {};
    c.revue[key] = c.revue[key] || { comments: {}, note: '' };
    return c.revue[key];
  }
  f.revueLocal = f.revueLocal || { comments: {}, note: '' };
  return f.revueLocal;
}

function pctCell(p) {
  if (p === null || p === undefined) return '<td class="muted">—</td>';
  return `<td class="${p > 0 ? 'up' : p < 0 ? 'down' : ''}">${p > 0 ? '+' : ''}${(p * 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} %</td>`;
}

// Situation : projection de fin d'exercice (reste à courir N-1) et charges annuelles absentes à étaler.
function projection(r) {
  const f = ui.fec;
  if (!isSituation(r) || !f.prev || !f.prevSame || !r.meta.start) return null;
  const full = f.prev, same = f.prevSame;
  const val = (res) => {
    const m = new Map();
    res.balance.forEach((b) => { if (/^[67]/.test(b.compte)) m.set(b.compte, { lib: b.lib, v: acctValue(b) }); });
    return m;
  };
  const N = val(r), F = val(full), S = val(same);
  const rub = {};
  const addR = (map, k) => map.forEach((x, c) => {
    const code = c.slice(0, 2);
    (rub[code] = rub[code] || { code, label: RUBRIQUES[code] || '', n: 0, s: 0, f: 0 })[k] += x.v;
  });
  addR(N, 'n'); addR(S, 's'); addR(F, 'f');
  const rows = Object.values(rub).sort((a, b) => a.code.localeCompare(b.code)).map((x) => Object.assign(x, { reste: x.f - x.s, proj: x.n + x.f - x.s }));
  const span = daysUntilFrom(r.meta.start, r.meta.closing) + 1;
  const ratio = Math.min(1, Math.max(0, (daysUntilFrom(r.meta.start, r.pieces.maxOp) + 1) / span));
  const totalCh = Array.from(F.entries()).filter(([c]) => c[0] === '6').reduce((t, [, x]) => t + Math.max(0, x.v), 0);
  const annual = [];
  F.forEach((x, c) => {
    if (c[0] !== '6' || /^69/.test(c) || x.v < Math.max(500, totalCh * 0.005)) return;
    const sv = (S.get(c) || {}).v || 0, nv = (N.get(c) || {}).v || 0;
    if (sv <= x.v * 0.1 && nv <= x.v * 0.1) annual.push({ compte: c, lib: x.lib, full: round2(x.v), n: round2(nv), prorata: round2(x.v * ratio - nv) });
  });
  annual.sort((a, b) => b.full - a.full);
  const proj = r.kpi.resultat + full.kpi.resultat - same.kpi.resultat;
  return { rows, annual: annual.filter((a) => a.prorata >= 1), ratio, until: f.prevUntil, full, same, proj, apresProrata: r.kpi.resultat - annual.reduce((t, a) => t + Math.max(0, a.prorata), 0) };
}

function projectionCard(r) {
  const pj = projection(r);
  if (!pj) return '';
  const yN = (r.meta.closing || '').slice(0, 4), yP = (pj.full.meta.closing || '').slice(0, 4);
  return `<section class="card"><h2>Projection de fin d'exercice</h2>
    <p class="muted small">Situation au ${fmtDate(r.pieces.maxOp)} (${Math.round(pj.ratio * 100)} % de l'exercice). Projection = situation + ce que l'exercice ${yP} a enregistré entre le ${fmtDate(addDays(pj.until, 1))} et la clôture (reste à courir N-1). Indicatif : à corriger des événements connus de l'exercice.</p>
    <div class="kpis fec-kpis">
      ${kpiTile('Résultat de la situation', eurK(r.kpi.resultat), r.kpi.resultat < 0 ? 'kpi-late' : '', eurK(pj.same.kpi.resultat))}
      ${kpiTile('Après charges annuelles au prorata', eurK(pj.apresProrata), pj.apresProrata < 0 ? 'kpi-late' : '')}
      ${kpiTile(`Résultat ${yN} projeté`, eurK(pj.proj), pj.proj < 0 ? 'kpi-late' : '', eurK(pj.full.kpi.resultat))}
    </div>
    <div class="grid-wrap"><table class="dtable num revue"><thead><tr><th>Poste</th><th>Libellé</th><th>Situation ${yN}</th><th>${yP} même période</th><th>${yP} complet</th><th>Reste à courir ${yP}</th><th>Projection ${yN}</th></tr></thead>
      <tbody>${pj.rows.map((x) => `<tr><td>${x.code}</td><td>${esc(x.label)}</td><td>${eur(x.n, 0)}</td><td>${eur(x.s, 0)}</td><td>${eur(x.f, 0)}</td><td>${eur(x.reste, 0)}</td><td>${eur(x.proj, 0)}</td></tr>`).join('')}</tbody></table></div>
    ${pj.annual.length ? `<h3>Charges annuelles absentes de la situation</h3>
      <p class="muted small">Comptabilisées en ${yP} après le ${fmtDate(pj.until)} (dotations, impôts et taxes, assurances, primes…) : à étaler dans la situation. Les écritures au prorata sont proposées dans l'onglet Écritures.</p>
      <div class="grid-wrap"><table class="dtable num"><thead><tr><th>Compte</th><th>Libellé</th><th>${yP} complet</th><th>Déjà en ${yN}</th><th>Prorata à passer</th></tr></thead>
      <tbody>${pj.annual.map((a) => `<tr><td>${esc(a.compte)}</td><td>${esc(a.lib)}</td><td>${eur(a.full, 0)}</td><td>${eur(a.n, 0)}</td><td>${eur(a.prorata, 0)}</td></tr>`).join('')}</tbody></table></div>` : ''}
  </section>`;
}

function viewRevue() {
  const f = ui.fec;
  const r = f.result;
  const prev = cmpPrev();
  f.seuil = f.seuil || defaultSeuil(r);
  const rd = revueData(r, prev, f.seuil, 0.2);
  const checks = coherenceChecks(r, prev, clientById(f.clientId));
  const store = revueComments();
  const yearN = (r.meta.closing || r.meta.maxDate || '').slice(0, 4);
  const yearP = prev ? (prev.meta.closing || prev.meta.maxDate || '').slice(0, 4) : '';
  const loadCard = `
    <div class="revue-load">
      ${prev ? `<span>Comparé à <strong>${esc(f.prevName)}</strong> (${prev.meta.lines.toLocaleString('fr-FR')} lignes)</span><button class="btn small" data-action="fec-prev">Changer le FEC N-1</button>`
        : f.prevStatus === 'loading' ? `<span class="muted">Analyse du FEC N-1 en cours…</span>`
        : `<span>${f.prevStatus === 'error' ? `<span class="late">${esc(f.prevError)}</span> ` : ''}Ajoutez le FEC de l'exercice précédent pour comparer les comptes et repérer les variations à justifier.</span><button class="btn primary small" data-action="fec-prev">Charger le FEC N-1</button>`}
      <button class="btn small" data-action="fec-note">Note de synthèse</button>
    </div>
    ${f.prev && isSituation(r) ? `<div class="filters revue-mode">
      <div class="seg" role="group" aria-label="Période de comparaison">
        <button class="${f.prevMode !== 'full' ? 'on' : ''}" data-action="prev-mode" data-mode="same"${f.prevSame ? '' : ' disabled'}>Même période N-1${f.prevUntil ? ` (au ${fmtDate(f.prevUntil)})` : ''}</button>
        <button class="${f.prevMode === 'full' ? 'on' : ''}" data-action="prev-mode" data-mode="full">Exercice N-1 complet</button>
      </div>
      <span class="muted small">${f.prevSameStatus === 'loading' ? 'Analyse du FEC N-1 à la même date en cours…' : f.prevSameStatus === 'error' ? 'Analyse à la même date impossible.' : `Situation au ${fmtDate(r.pieces.maxOp)} : comparée ${f.prevMode === 'full' ? "à l'exercice précédent entier" : 'à la même période de l\'exercice précédent'}.`}</span>
    </div>` : ''}`;
  const sigRows = r.sig.filter((x) => x.strong || x.label === 'Chiffre d\'affaires net').map((x) => {
    const p = prev && prev.sig.find((y) => y.label === x.label);
    const v1 = p ? p.value : null;
    return `<tr class="${x.strong ? 'strong' : ''}"><td>${esc(x.label)}</td><td>${eur(x.value, 0)}</td>${prev ? `<td>${eur(v1, 0)}</td><td>${eur(x.value - v1, 0)}</td>${pctCell(v1 ? (x.value - v1) / Math.abs(v1) : null)}` : ''}</tr>`;
  }).join('');
  return `
    <section class="card">${loadCard}</section>
    ${projectionCard(r)}
    <section class="card"><h2>Contrôles de cohérence</h2>${checkList(checks, true)}</section>
    <section class="card"><h2>Chiffres clés ${prev ? `${yearN} / ${yearP}` : yearN}</h2>
      <div class="grid-wrap"><table class="dtable num sig"><thead><tr><th>Solde</th><th>${yearN}</th>${prev ? `<th>${yearP}</th><th>Variation</th><th>%</th>` : ''}</tr></thead><tbody>${sigRows}</tbody></table></div>
    </section>
    ${prev ? `
    <section class="card">
      <h2>Variations significatives à justifier <span class="count">${rd.flagged.length}</span></h2>
      <div class="filters">
        <label class="inline-label">Seuil de signification <input type="number" min="0" step="100" data-revue="seuil" value="${f.seuil}"> €</label>
        <span class="muted small">et variation d'au moins 20 %. Vos commentaires sont enregistrés${clientById(f.clientId) ? ' dans le dossier' : ' (rattachez un dossier pour les conserver)'} et repris dans la note de synthèse.</span>
      </div>
      ${rd.flagged.length ? `<div class="grid-wrap"><table class="dtable num revue"><thead><tr><th>Compte</th><th>Libellé</th><th>${yearN}</th><th>${yearP}</th><th>Variation</th><th>%</th><th>Justification</th></tr></thead>
        <tbody>${rd.flagged.map((a) => `<tr><td>${esc(a.compte)}</td><td>${esc(a.lib)}</td><td>${eur(a.n, 0)}</td><td>${eur(a.n1, 0)}</td><td>${eur(a.delta, 0)}</td>${pctCell(a.pct)}
          <td class="comment"><input data-comment="${esc(a.compte)}" value="${esc(store.comments[a.compte] || '')}" placeholder="Explication…" spellcheck="false" autocomplete="off"></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted">Aucune variation significative au regard du seuil choisi.</p>'}
    </section>
    <section class="card"><h2>Comparatif par poste</h2>
      <div class="grid-wrap"><table class="dtable num revue"><thead><tr><th>Poste</th><th>Libellé</th><th>${yearN}</th><th>${yearP}</th><th>Variation</th><th>%</th></tr></thead>
        <tbody>${rd.rubriques.map((g) => `<tr class="${g.flagged ? 'flag' : ''}"><td>${g.code}</td><td>${esc(g.label)}${g.flagged ? ' <span class="lvl lvl-warn"><b aria-hidden="true">!</b>À justifier</span>' : ''}</td><td>${eur(g.n, 0)}</td><td>${eur(g.n1, 0)}</td><td>${eur(g.delta, 0)}</td>${pctCell(g.pct)}</tr>`).join('')}</tbody></table></div>
      <p class="muted small">Charges au débit, produits au crédit ; comptes de bilan : solde débiteur positif, créditeur négatif.</p>
    </section>` : ''}`;
}

// ---------- Note de synthèse (impression / PDF) ----------

function noteHtml() {
  const f = ui.fec;
  const r = f.result;
  const prev = cmpPrev();
  const c = clientById(f.clientId);
  const s = data.settings;
  const store = revueComments();
  const yearN = r.meta.closing ? `clos le ${fmtDate(r.meta.closing)}` : '';
  const rn = ratios(r), rp = prev ? ratios(prev) : null;
  const pct = (x) => (x === null || x === undefined ? '—' : (x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %');
  const days = (x) => (x === null || x === undefined ? '—' : Math.round(x) + ' j');
  const line = (label, n, p, fmt) => `<tr><td>${esc(label)}</td><td>${fmt ? fmt(n) : eur(n, 0) + ' €'}</td>${prev ? `<td>${fmt ? fmt(p) : eur(p, 0) + ' €'}</td><td>${fmt ? '' : (p ? ((n - p) / Math.abs(p) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' %' : '—')}</td>` : ''}</tr>`;
  const k = r.kpi, kp = prev ? prev.kpi : {};
  const facts = [];
  if (prev) {
    const v = (a, b) => (b ? (a - b) / Math.abs(b) : null);
    const vc = v(k.ca, kp.ca);
    if (vc !== null) facts.push(`Le chiffre d'affaires s'établit à ${eur(k.ca, 0)} €, ${Math.abs(vc) < 0.02 ? 'stable' : `${vc > 0 ? 'en hausse' : 'en baisse'} de ${pct(Math.abs(vc))}`} par rapport à l'exercice précédent.`);
    const vr = k.resultat - kp.resultat;
    facts.push(`Le résultat ${k.resultat >= 0 ? 'bénéficiaire' : 'déficitaire'} de ${eur(Math.abs(k.resultat), 0)} € ${vr >= 0 ? 'progresse' : 'recule'} de ${eur(Math.abs(vr), 0)} €.`);
    const vt = k.tresorerie - kp.tresorerie;
    facts.push(`La trésorerie ${vt >= 0 ? 'augmente' : 'diminue'} de ${eur(Math.abs(vt), 0)} € pour atteindre ${eur(k.tresorerie, 0)} €.`);
  } else {
    facts.push(`Le chiffre d'affaires s'établit à ${eur(k.ca, 0)} € et le résultat à ${eur(k.resultat, 0)} €.`);
  }
  const rd = prev ? revueData(r, prev, f.seuil || defaultSeuil(r), 0.2) : null;
  const justified = rd ? rd.flagged.filter((a) => store.comments[a.compte]).slice(0, 8) : [];
  const attention = coherenceChecks(r, prev, c).concat(fecPoints(r)).filter((x) => x.level === 'error' || x.level === 'warn');
  return `
    <article class="note">
      <header class="note-head">
        <div><div class="note-cab">${esc(s.cabinet || '')}</div><h1>Note de synthèse</h1>
        <div class="note-sub">${esc(c ? c.nom : r.meta.fileName)} — exercice ${esc(yearN)}</div></div>
        <div class="note-date">${fmtDate(todayStr())}</div>
      </header>
      <h2>Chiffres clés</h2>
      <table class="note-table"><thead><tr><th></th><th>Exercice</th>${prev ? '<th>Précédent</th><th>Variation</th>' : ''}</tr></thead><tbody>
        ${line("Chiffre d'affaires", k.ca, kp.ca)}${rn.tauxMarge !== null ? line('Marge commerciale', k.marge, kp.marge) : ''}${line('Valeur ajoutée', k.va, kp.va)}
        ${line("Excédent brut d'exploitation", k.ebe, kp.ebe)}${line("Résultat d'exploitation", k.rex, kp.rex)}${line('Résultat net', k.resultat, kp.resultat)}
        ${line('Capitaux propres', rn.cp, rp && rp.cp)}${line('Dettes financières', rn.dettesFin, rp && rp.dettesFin)}${line('Trésorerie', k.tresorerie, kp.tresorerie)}
      </tbody></table>
      <h2>Indicateurs</h2>
      <table class="note-table"><tbody>
        ${rn.tauxMarge !== null ? line('Taux de marge commerciale', rn.tauxMarge, rp && rp.tauxMarge, pct) : ''}
        ${line("EBE / chiffre d'affaires", rn.ebeCa, rp && rp.ebeCa, pct)}${line("Résultat / chiffre d'affaires", rn.resCa, rp && rp.resCa, pct)}
        ${line('Délai moyen de paiement clients', rn.dso, rp && rp.dso, days)}${line('Délai moyen de paiement fournisseurs', rn.dpo, rp && rp.dpo, days)}
        ${line('Dettes financières / capitaux propres', rn.endettement, rp && rp.endettement, pct)}
      </tbody></table>
      <h2>Faits marquants</h2>
      <ul>${facts.map((x) => `<li>${esc(x)}</li>`).join('')}${justified.map((a) => `<li>${esc(a.lib)} : ${a.delta >= 0 ? '+' : ''}${eur(a.delta, 0)} € — ${esc(store.comments[a.compte])}</li>`).join('')}</ul>
      ${attention.length ? `<h2>Points d'attention</h2><ul>${attention.map((x) => `<li><strong>${esc(x.label)}</strong>${x.detail ? ' — ' + esc(x.detail) : ''}</li>`).join('')}</ul>` : ''}
      ${store.note ? `<h2>Commentaires du cabinet</h2><p class="note-free">${esc(store.note)}</p>` : ''}
      <footer class="note-foot">Document établi à partir du fichier des écritures comptables, avant écritures d'inventaire éventuelles. Chiffres indicatifs.</footer>
    </article>`;
}

function openNote() {
  const store = revueComments();
  modalRefresh = null;
  openModal(`
    <div class="sheet">
      <header class="modal-head"><h2>Note de synthèse</h2><button type="button" class="icon-btn" data-action="close-modal" aria-label="Fermer">✕</button></header>
      <div class="modal-body">
        <label>Commentaires du cabinet (repris dans la note)<textarea data-revue="note" rows="3" spellcheck="false">${esc(store.note || '')}</textarea></label>
        <div class="note-preview">${noteHtml()}</div>
      </div>
      <footer class="modal-foot"><button type="button" class="btn" data-action="close-modal">Fermer</button><button class="btn primary" data-action="note-print">Imprimer / PDF</button></footer>
    </div>`, true);
}

function printNote() {
  printHtml(noteHtml());
}

// ---------- Rapprochement bancaire ----------

// Apparie les opérations du relevé et les lignes du compte de banque du FEC (montant identique, date proche),
// puis tente des regroupements (remise de chèques, total de cartes bancaires…).
function reconcile(ops, lines, tol, opening) {
  const cents = (x) => Math.round(x * 100);
  const days = (a, b) => Math.abs(daysUntilFrom(a, b));
  const start = ops.reduce((m, o) => (o.date < m ? o.date : m), '9999');
  const end = ops.reduce((m, o) => (o.date > m ? o.date : m), '0000');
  const bank = ops.map((o, i) => ({ i, ...o, match: null }));
  const book = lines.map(([date, amount, label, piece, ref], i) => ({ i, date, amount, label, piece, ref, match: null }))
    .filter((l) => l.date >= addDays(start, -tol - 31) && l.date <= addDays(end, tol));
  const byAmount = new Map();
  book.forEach((l) => {
    const k = cents(l.amount);
    if (!byAmount.has(k)) byAmount.set(k, []);
    byAmount.get(k).push(l);
  });
  // 1. Une opération = une écriture (même montant, date la plus proche dans la tolérance).
  bank.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((o) => {
    const cands = (byAmount.get(cents(o.amount)) || []).filter((l) => !l.match && days(l.date, o.date) <= tol);
    if (!cands.length) return;
    cands.sort((a, b) => days(a.date, o.date) - days(b.date, o.date));
    o.match = [cands[0]];
    cands[0].match = [o];
  });
  // 2. Regroupements : plusieurs lignes d'un côté pour une ligne de l'autre (jusqu'à 4, dates proches).
  const subsetSum = (target, pool) => {
    const items = pool.slice(0, 12);
    const t = cents(target);
    const rec = (k, from, acc, chosen) => {
      if (chosen.length >= 2 && acc === t) return chosen;
      if (chosen.length >= 4) return null;
      for (let j = from; j < items.length; j++) {
        const res = rec(k, j + 1, acc + cents(items[j].amount), chosen.concat(items[j]));
        if (res) return res;
      }
      return null;
    };
    return rec(0, 0, 0, []);
  };
  const group = (singles, pool) => {
    singles.filter((x) => !x.match).forEach((x) => {
      const cand = pool.filter((y) => !y.match && Math.sign(y.amount) === Math.sign(x.amount) && Math.abs(y.amount) < Math.abs(x.amount) && days(y.date, x.date) <= Math.max(tol, 3));
      const found = cand.length >= 2 ? subsetSum(x.amount, cand) : null;
      if (found) {
        x.match = found;
        found.forEach((y) => { y.match = [x]; });
      }
    });
  };
  group(bank, book);
  group(book, bank);
  const inPeriod = (d) => d >= start && d <= end;
  const bankOnly = bank.filter((o) => !o.match);
  const bookOnly = book.filter((l) => !l.match && inPeriod(l.date));
  const matched = bank.filter((o) => o.match).length;
  // Solde comptable à une date (à-nouveaux + mouvements jusqu'à cette date).
  const balanceAt = (date) => Math.round((opening + lines.filter(([d]) => d <= date).reduce((t, l) => t + l[1], 0)) * 100) / 100;
  return { start, end, bank, bankOnly, bookOnly, matched, balanceAt };
}

function rapproState() {
  const f = ui.fec;
  if (!f.rappro) {
    const accounts = Object.keys(f.result.bankLines || {}).sort();
    f.rappro = { compte: accounts.find((a) => a.startsWith('512')) || accounts[0] || '', files: [], ops: [], opening: null, closing: null, tol: 5, include: true };
  }
  return f.rappro;
}

async function importStatement() {
  const file = await pickFile('.txt,.csv,.xlsx,.ofx,.qfx,.xml,.cfonb,.dat,.120', true);
  if (!file) return;
  const st = rapproState();
  try {
    const res = await BankReader.read(file);
    const key = (o) => `${o.date}|${o.amount}|${o.label}`;
    const known = new Set(st.ops.map(key));
    const added = res.operations.filter((o) => !known.has(key(o)));
    st.ops = st.ops.concat(added).sort((a, b) => a.date.localeCompare(b.date));
    st.files.push(`${file.name} (${res.format}, ${res.operations.length} op.)`);
    if (res.opening && (!st.opening || res.opening.date < st.opening.date)) st.opening = res.opening;
    if (res.closing && (!st.closing || res.closing.date > st.closing.date)) st.closing = res.closing;
    toast(`${added.length} opération(s) importée(s)${added.length < res.operations.length ? ` (${res.operations.length - added.length} déjà présentes)` : ''}.`);
  } catch (e) {
    toast(e.message, true);
  }
  refresh();
}

function rapproResult() {
  const f = ui.fec;
  const st = rapproState();
  if (!st.ops.length || !st.compte) return null;
  const bal = f.result.balance.find((b) => b.compte === st.compte);
  return reconcile(st.ops, f.result.bankLines[st.compte] || [], st.tol, bal ? bal.an : 0);
}

function viewRappro() {
  const f = ui.fec;
  const st = rapproState();
  const accounts = Object.keys(f.result.bankLines || {}).sort();
  const libOf = (c) => (f.result.balance.find((b) => b.compte === c) || {}).lib || c;
  const head = `
    <section class="card">
      <h2>Rapprochement bancaire</h2>
      <p class="muted small">Importez le relevé de la banque (CFONB 120 / EBICS, OFX, CAMT.053, ou export CSV / Excel de la banque en ligne). Chaque opération est recherchée dans le compte de banque du FEC ; plusieurs relevés peuvent être ajoutés à la suite.</p>
      ${accounts.length ? `<div class="filters">
        <select data-rappro="compte" aria-label="Compte de banque">${options(Object.fromEntries(accounts.map((a) => [a, `${a} — ${libOf(a)}`])), st.compte)}</select>
        <label class="inline-label">Tolérance <input type="number" min="0" max="31" data-rappro="tol" value="${st.tol}"> jours</label>
        <button class="btn primary" data-action="rappro-import">${st.ops.length ? 'Ajouter un relevé' : 'Importer le relevé'}</button>
        ${st.ops.length ? '<button class="btn" data-action="rappro-reset">Recommencer</button>' : ''}
      </div>
      ${st.files.length ? `<p class="muted small">Relevés : ${st.files.map(esc).join(' · ')}</p>` : ''}` : '<p class="muted">Aucun compte de banque (51) dans ce FEC.</p>'}
    </section>`;
  const res = rapproResult();
  if (!res) return head;
  // Date de référence : solde de fin fourni par le relevé, sinon dernière opération.
  const stmt = st.closing && st.closing.date >= res.start ? st.closing : null;
  const ref = stmt ? stmt.date : res.end;
  const upTo = (list) => list.filter((x) => x.date <= ref);
  const sum = (list) => list.reduce((t, x) => t + x.amount, 0);
  const nonCompta = sum(upTo(res.bankOnly)), nonReleve = sum(upTo(res.bookOnly));
  const bookBalance = res.balanceAt(ref);
  const theorique = bookBalance + nonCompta - nonReleve;
  const ecart = stmt ? Math.round((stmt.amount - theorique) * 100) / 100 : null;
  const tile = (label, value, cls) => `<div class="kpi ${cls || ''}"><strong>${value}</strong><span>${label}</span></div>`;
  const opRow = (o) => `<tr><td>${fmtDate(o.date)}</td><td>${esc(o.label)}</td><td class="${o.amount < 0 ? 'cred' : ''}">${eur(o.amount)}</td></tr>`;
  return `${head}
    <div class="kpis fec-kpis">
      ${tile('Opérations du relevé', res.bank.length)}
      ${tile('Rapprochées', `${Math.round((res.matched * 100) / res.bank.length)} %`, res.matched === res.bank.length ? '' : '')}
      ${tile('Non comptabilisées', res.bankOnly.length, res.bankOnly.length ? 'kpi-late' : '')}
      ${tile('Absentes du relevé', res.bookOnly.length, res.bookOnly.length ? 'kpi-wait' : '')}
    </div>
    <section class="card"><h2>État de rapprochement au ${fmtDate(ref)}</h2>
      <table class="dtable num sig"><tbody>
        <tr><td>Solde comptable (${esc(st.compte)}) au ${fmtDate(ref)}</td><td>${eur(bookBalance)}</td></tr>
        <tr><td>+ Opérations du relevé non comptabilisées (${upTo(res.bankOnly).length})</td><td>${eur(nonCompta)}</td></tr>
        <tr><td>− Écritures non encore passées en banque (${upTo(res.bookOnly).length})</td><td>${eur(-nonReleve)}</td></tr>
        <tr class="strong"><td>= Solde bancaire théorique</td><td>${eur(theorique)}</td></tr>
        ${stmt ? `<tr><td>Solde du relevé au ${fmtDate(stmt.date)}</td><td>${eur(stmt.amount)}</td></tr>
        <tr class="strong"><td>Écart inexpliqué</td><td class="${Math.abs(ecart) >= 0.01 ? 'cred' : ''}">${eur(ecart)}</td></tr>` : '<tr><td colspan="2" class="muted">Solde de fin non fourni par le relevé : comparez le solde théorique au relevé papier.</td></tr>'}
      </tbody></table>
      ${stmt && Math.abs(ecart) >= 0.01 ? '<p class="muted small">Un écart peut venir d\'à-nouveaux différents du solde bancaire d\'ouverture, ou d\'opérations antérieures au premier relevé importé.</p>' : ''}
    </section>
    <div class="grid2">
      <section class="card"><h2>Opérations bancaires non comptabilisées <span class="count">${res.bankOnly.length}</span></h2>
        ${res.bankOnly.length ? `<label class="check"><input type="checkbox" data-rappro="include"${st.include ? ' checked' : ''}><span>Les ajouter aux pièces à demander au client</span></label>
        <div class="grid-wrap"><table class="dtable num"><thead><tr><th>Date</th><th>Libellé</th><th>Montant</th></tr></thead><tbody>${res.bankOnly.map(opRow).join('')}</tbody></table></div>` : '<p class="muted">Toutes les opérations du relevé sont comptabilisées. 👍</p>'}
      </section>
      <section class="card"><h2>Écritures absentes du relevé <span class="count">${res.bookOnly.length}</span></h2>
        <p class="muted small">Chèques émis non encaissés, remises en cours, ou erreurs de saisie à corriger.</p>
        ${res.bookOnly.length ? `<div class="grid-wrap"><table class="dtable num"><thead><tr><th>Date</th><th>Libellé</th><th>Montant</th></tr></thead><tbody>${res.bookOnly.map(opRow).join('')}</tbody></table></div>` : '<p class="muted">Aucune.</p>'}
      </section>
    </div>
    <div class="pieces-actions"><button class="btn" data-action="rappro-xlsx">Exporter l'état de rapprochement (Excel)</button></div>`;
}

function exportRappro() {
  const st = rapproState();
  const res = rapproResult();
  if (!res) return;
  const t = (v, s) => ({ v, s: s === undefined ? 2 : s });
  const n = (v, s) => ({ v: Number(v) || 0, s: s || 8 });
  const opRows = (list) => list.map((o) => [t(fmtDate(o.date)), t(o.label || ''), n(o.amount)]);
  const stmt = st.closing && st.closing.date >= res.start ? st.closing : null;
  const ref = stmt ? stmt.date : res.end;
  const upTo = (list) => list.filter((x) => x.date <= ref);
  const nonCompta = upTo(res.bankOnly).reduce((a, o) => a + o.amount, 0), nonReleve = upTo(res.bookOnly).reduce((a, o) => a + o.amount, 0);
  const book = res.balanceAt(ref);
  const rows = [[{ v: `État de rapprochement — compte ${st.compte} au ${fmtDate(ref)}`, s: 10 }], [],
    [t('Solde comptable', 1), n(book)], [t('+ Opérations du relevé non comptabilisées', 1), n(nonCompta)],
    [t('− Écritures non passées en banque', 1), n(-nonReleve)], [t('= Solde bancaire théorique', 1), n(book + nonCompta - nonReleve, 9)],
    ...(stmt ? [[t(`Solde du relevé au ${fmtDate(stmt.date)}`, 1), n(stmt.amount, 9)], [t('Écart inexpliqué', 1), n(stmt.amount - (book + nonCompta - nonReleve), 9)]] : [])];
  const blob = XlsxWriter.build({ sheets: [
    { name: 'État de rapprochement', rows, widths: [50, 18], filter: false },
    { name: 'Non comptabilisées', rows: [[t('Date', 1), t('Libellé', 1), t('Montant', 1)]].concat(opRows(res.bankOnly)), widths: [12, 60, 16], freeze: { row: 1 } },
    { name: 'Absentes du relevé', rows: [[t('Date', 1), t('Libellé', 1), t('Montant', 1)]].concat(opRows(res.bookOnly)), widths: [12, 60, 16], freeze: { row: 1 } },
  ] });
  download(`rapprochement-${st.compte}-${ref}.xlsx`, blob, blob.type);
}
