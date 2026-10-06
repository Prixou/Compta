/*
 * Suivi Dossiers — Officine : tiers payant, CA et TVA par taux, pièces propres.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- Analyseur Pharmacie (officine) ----------

const RE_AMO = /cpam|caisse prim|c\.?p\.?a\.?m|msa|mutualite sociale agricole|\bamo\b|regime oblig|securite sociale|\bsecu\b|cnmss|\bssi\b|\brsi\b|camieg|enim|cavimac|cnam|caisse nationale|sncf|ratp|banque de france|assurance maladie|\bro\b/;
const RE_AMC = /mutuel|\bamc\b|complementaire|viamedis|almerys|santeclair|isante|sp ?sante|harmonie|mgen|malakoff|axa|allianz|ag2r|apicil|swiss ?life|generali|groupama|macif|maif|matmut|pro ?btp|klesia|humanis|\bmnh\b|cetip|actil|seveane|kalivia|itelis|carte blanche|noemie|tiers payant|\btp\b|\brc\b|alan\b|april\b|henner|gras savoye|unéo|uneo|mnt\b|mfp|mutuelle/;
const RE_PATIENT = /patient|particulier|ardoise|compte client|clients? divers|clients? comptoir/;

function tiersCat(t) {
  const txt = norm(`${t.lib} ${t.clib || ''} ${t.num}`);
  if (RE_PATIENT.test(norm(t.lib))) return 'patient';
  if (RE_AMO.test(txt)) return 'amo';
  if (RE_AMC.test(txt)) return 'amc';
  return 'patient';
}
const CAT_LABEL = { amo: 'Régime obligatoire', amc: 'Complémentaire', patient: 'Patient / autre' };
const NORMAL_DAYS = { amo: 10, amc: 30 };

// Indices qu'un FEC est celui d'une pharmacie.
function looksLikePharmacy(r) {
  let score = 0;
  if (r.balance.some((b) => /^(70|4457)/.test(b.compte) && /2[,.]10?\b|2[,.]1 ?%/.test(b.lib))) score++;
  if ((r.aging || []).filter((t) => t.racine === '411' && ['amo', 'amc'].includes(tiersCat(t))).length >= 2) score++;
  if (r.balance.some((b) => /honoraires? de dispensation|dispensation|rosp|honoraire.*ordonnance/i.test(b.lib))) score++;
  const c = clientById(ui.fec && ui.fec.clientId);
  if (c && /pharmac/i.test(`${c.nom} ${c.notes || ''}`)) score++;
  return score >= 2;
}

function rateOf(lib) {
  const m = norm(lib).match(/(?:^|[^\d])(2[,.]10?|5[,.]50?|10|20|8[,.]50?|13|0)(?:[,.]0+)?\s*%?(?:[^\d]|$)/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  return [2.1, 5.5, 10, 20, 8.5, 13, 0].includes(v) ? v : null;
}

function pharmaData(r, ref) {
  const days = Math.max(30, daysUntilFrom(r.meta.start && r.meta.start < ref ? r.meta.start : (r.pieces.minOp || ref), ref) + 1);
  const tiers = (r.aging || []).filter((t) => t.racine === '411').map((t) => {
    const cat = tiersCat(t);
    const open = t.open.filter((o) => o.date <= ref || o.an);
    const age = (o) => (o.an ? 999 : daysUntilFrom(o.date, ref));
    const bucket = (min, max) => open.filter((o) => o.amt > 0 && age(o) >= min && age(o) <= max).reduce((s, o) => s + o.amt, 0);
    const perDay = t.billed / days;
    const encoursJours = perDay > 0 ? Math.max(t.s, 0) / perDay : null;
    let rejets = 0, rejetsMode = '';
    if (cat !== 'patient' && t.s > 0) {
      if (t.method === 'lettrage') { rejets = bucket(61, 99999); rejetsMode = 'lettrage'; }
      else if (perDay > 0) { rejets = Math.max(0, t.s - perDay * NORMAL_DAYS[cat]); rejetsMode = 'estimation'; }
    }
    return {
      ...t, cat, perDay, encoursJours, rejets: Math.round(rejets * 100) / 100, rejetsMode,
      b30: bucket(0, 30), b60: bucket(31, 60), b90: bucket(61, 90), bOld: bucket(91, 99999),
      oldest: (open.find((o) => o.amt > 0) || {}).date || '',
      oldItems: open.filter((o) => o.amt > 0 && age(o) > 60),
    };
  }).sort((a, b) => b.s - a.s);
  const sumBy = (cat, key) => tiers.filter((t) => t.cat === cat).reduce((s, t) => s + (t[key] || 0), 0);
  // CA par taux de TVA (libellés des comptes 70 et 4457)
  const mv = (b) => b.cm - b.dm;
  const rates = {};
  r.balance.forEach((b) => {
    if (/^70/.test(b.compte) && !/^706/.test(b.compte)) {
      const rt = rateOf(b.lib);
      const k = rt === null ? '?' : rt;
      (rates[k] = rates[k] || { rate: rt, ht: 0, tva: 0, accounts: [] }).ht += mv(b);
      rates[k].accounts.push(b.compte);
    } else if (/^4457/.test(b.compte)) {
      const rt = rateOf(b.lib);
      const k = rt === null ? '?' : rt;
      (rates[k] = rates[k] || { rate: rt, ht: 0, tva: 0, accounts: [] }).tva += mv(b);
    }
  });
  const incomeLines = r.balance.filter((b) => /^7[0-5]/.test(b.compte) && (/^706/.test(b.compte) || /honorair|dispens|rosp|forfait|garde|astreinte|vaccin|entretien|bilan partage|trod|teleconsult|remuneration|prime|aide|subvention/.test(norm(b.lib))))
    .map((b) => ({ compte: b.compte, lib: b.lib, montant: mv(b) })).filter((x) => Math.abs(x.montant) >= 0.01);
  const tpBilled = tiers.filter((t) => t.cat !== 'patient').reduce((s, t) => s + t.billed, 0);
  const caTtc = r.kpi.ca + Object.values(rates).reduce((s, x) => s + x.tva, 0);
  const transit = r.balance.filter((b) => /^(511|517|58)/.test(b.compte) && Math.abs(b.s) >= 0.01)
    .map((b) => ({ compte: b.compte, lib: b.lib, s: b.s, perDay: (b.dm || 0) / days }));
  const ventesMarch = r.balance.filter((b) => /^707|^7097/.test(b.compte)).reduce((s, b) => s + mv(b), 0) || r.kpi.ca;
  const remises = r.balance.filter((b) => /^609/.test(b.compte)).reduce((s, b) => s + mv(b), 0);
  const achats = r.balance.filter((b) => /^607/.test(b.compte)).reduce((s, b) => s + (b.dm - b.cm), 0);
  const variationStock = r.balance.filter((b) => /^6037/.test(b.compte)).reduce((s, b) => s + (b.dm - b.cm), 0);
  const ecartsCaisse = r.balance.filter((b) => /^(658|758|6718|7718)/.test(b.compte) && /ecart|caisse/.test(norm(b.lib))).reduce((s, b) => s + (b.dm - b.cm), 0);
  return {
    days, tiers, rates, incomeLines, tpBilled, caTtc, transit, ventesMarch, remises, achats, variationStock, ecartsCaisse,
    partTp: caTtc > 0 ? tpBilled / caTtc : null,
    tauxMarque: ventesMarch > 0 ? r.kpi.marge / ventesMarch : null,
    encoursAmo: sumBy('amo', 's'), encoursAmc: sumBy('amc', 's'), encoursPatients: tiers.filter((t) => t.cat === 'patient' && t.s > 0).reduce((s, t) => s + t.s, 0),
    rejets: tiers.reduce((s, t) => s + t.rejets, 0),
    tropPercus: tiers.filter((t) => t.cat !== 'patient' && t.s < 0),
    lettrage: tiers.some((t) => t.method === 'lettrage'),
  };
}

function pharmaRef(r) {
  return (ui.fec.pieces && ui.fec.pieces.arrete) || r.meta.closing || (r.pieces && r.pieces.maxOp) || todayStr();
}

function pharmaChecks(r) {
  const ph = pharmaData(r, pharmaRef(r));
  const out = [];
  const add = (level, label, detail) => out.push({ level, label, detail, examples: [], count: 0 });
  const pct = (x) => (x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %';
  // TVA par taux
  const known = Object.values(ph.rates).filter((x) => x.rate !== null && (x.ht || x.tva));
  if (!known.length) add('info', 'Contrôle de la TVA par taux impossible', 'Les libellés des comptes 707 et 4457 n\'indiquent pas le taux (2,1 %, 5,5 %, 10 %, 20 %).');
  known.forEach((x) => {
    const theo = (x.ht * x.rate) / 100;
    const ecart = x.tva - theo;
    if (x.ht > 0 && Math.abs(ecart) > Math.max(50, Math.abs(theo) * 0.01)) add('warn', `TVA collectée à ${String(x.rate).replace('.', ',')} % incohérente`, `Ventes HT ${eur(x.ht, 0)} € → TVA théorique ${eur(theo, 0)} €, comptabilisée ${eur(x.tva, 0)} € (écart ${eur(ecart, 0)} €) : ventilation du LGO ou taux à vérifier.`);
    else if (x.ht > 0) add('ok', `TVA à ${String(x.rate).replace('.', ',')} % cohérente`, `${eur(x.tva, 0)} € pour ${eur(x.ht, 0)} € de ventes HT.`);
  });
  if (ph.rates['?'] && ph.rates['?'].ht > 1000) add('info', 'Ventes sans taux identifiable', `${eur(ph.rates['?'].ht, 0)} € sur des comptes dont le libellé ne précise pas le taux (${ph.rates['?'].accounts.slice(0, 4).join(', ')}).`);
  // Marge
  if (ph.tauxMarque !== null) {
    const lvl = ph.tauxMarque < 0.22 || ph.tauxMarque > 0.38 ? 'warn' : 'ok';
    add(lvl, `Taux de marque ${pct(ph.tauxMarque)}`, lvl === 'ok' ? 'Dans la fourchette habituelle d\'une officine (environ 22 à 38 % remises comprises).' : `Hors de la fourchette habituelle d'une officine (22 à 38 %)${ph.variationStock ? '' : ' — sans variation de stock (6037), le taux n\'est pas significatif en cours d\'exercice'}.`);
  }
  if (ph.achats > 0 && ph.remises <= 0) add('warn', 'Aucune remise fournisseur comptabilisée (609)', 'Remises grossistes et laboratoires, coopération commerciale : à comptabiliser ou à demander.');
  else if (ph.achats > 0) add('ok', 'Remises fournisseurs comptabilisées', `${eur(ph.remises, 0)} €, soit ${pct(ph.remises / ph.achats)} des achats.`);
  // Tiers payant
  if (ph.rejets > 0) add('warn', `Rejets et impayés de tiers payant : ${eur(ph.rejets, 0)} €${ph.lettrage ? '' : ' (estimation)'}`, ph.lettrage ? 'Factures non lettrées de plus de 60 jours (détail dans l\'onglet Tiers payant).' : 'Encours supérieur au délai normal de règlement (10 jours pour le régime obligatoire, 30 jours pour les complémentaires) : état des rejets à demander, provision éventuelle.');
  else if (ph.tiers.some((t) => t.cat !== 'patient')) add('ok', 'Encours de tiers payant cohérent', 'Pas d\'encours anormal au regard des délais de règlement habituels.');
  if (ph.tropPercus.length) add('info', 'Trop-perçus d\'organismes', `${ph.tropPercus.length} organisme(s) au solde créditeur (${eur(-ph.tropPercus.reduce((s, t) => s + t.s, 0), 0)} €) : paiements à affecter.`);
  if (ph.encoursPatients > 0) {
    const old = ph.tiers.filter((t) => t.cat === 'patient').reduce((s, t) => s + t.b90 + t.bOld, 0);
    add(old > 0 ? 'warn' : 'info', `Créances patients : ${eur(ph.encoursPatients, 0)} €`, old > 0 ? `dont ${eur(old, 0)} € de plus de 60 jours : relances ou dépréciation.` : 'Ardoises récentes.');
  }
  // Transit
  ph.transit.forEach((x) => {
    const jours = x.perDay > 0 ? x.s / x.perDay : null;
    if (x.s > 0 && (jours === null || jours > 4)) add('warn', `Compte de transit ${x.compte} non soldé`, `${x.lib} : ${eur(x.s, 0)} € en attente${jours ? ` (≈ ${Math.round(jours)} jours de remises)` : ''} : remises CB ou chèques non comptabilisées en banque ?`);
  });
  if (Math.abs(ph.ecartsCaisse) >= 1) add('info', `Écarts de caisse : ${eur(ph.ecartsCaisse, 0)} €`, 'Montant net des écarts de caisse comptabilisés.');
  if (!ph.incomeLines.some((x) => /honorair|dispens/.test(norm(x.lib)))) add('info', 'Honoraires de dispensation non identifiés', 'Aucun compte « honoraires » : vérifier la ventilation du chiffre d\'affaires transmise par le LGO.');
  return out;
}

// Points de révision génériques adaptés à l'officine.
function fecAlerts(r) {
  if (ui.fecProfile !== 'pharmacie') return r.alerts;
  return r.alerts
    .filter((a) => !/Benford|Clients créditeurs/.test(a.label))
    .map((a) => (/dimanche/.test(a.label) ? { ...a, level: 'info', detail: `${a.detail} Habituel pour une pharmacie de garde.` } : a));
}

function viewTiersPayant() {
  const f = ui.fec;
  const r = f.result;
  const ref = pharmaRef(r);
  const ph = pharmaData(r, ref);
  const tile = (label, value, cls) => `<div class="kpi ${cls || ''}"><strong>${value}</strong><span>${label}</span></div>`;
  const jours = (t) => (t.encoursJours === null ? '—' : `${Math.round(t.encoursJours)} j`);
  return `
    <div class="kpis fec-kpis">
      ${tile('Encours régime obligatoire', eurK(ph.encoursAmo))}
      ${tile('Encours complémentaires', eurK(ph.encoursAmc))}
      ${tile(`Rejets probables${ph.lettrage ? '' : ' (estim.)'}`, eurK(ph.rejets), ph.rejets > 0 ? 'kpi-late' : '')}
      ${tile('Créances patients', eurK(ph.encoursPatients), ph.encoursPatients > 0 ? 'kpi-wait' : '')}
      ${tile('Part du tiers payant', ph.partTp === null ? '—' : `${Math.round(ph.partTp * 100)} %`)}
      ${tile('Trop-perçus', ph.tropPercus.length)}
    </div>
    <section class="card">
      <h2>Balance âgée du tiers payant au ${fmtDate(ref)}</h2>
      <p class="muted small">${ph.lettrage ? 'Calculée à partir du <strong>lettrage</strong> du FEC : chaque facture non lettrée est datée.' : 'Comptes 411 <strong>non lettrés</strong> : les règlements sont imputés sur les factures les plus anciennes, et les rejets sont <strong>estimés</strong> à partir de l\'encours au-delà du délai normal (10 jours pour le régime obligatoire, 30 jours pour les complémentaires). L\'état des rejets du LGO donnera le détail exact.'}</p>
      <div class="grid-wrap"><table class="dtable num tp"><thead><tr><th>Organisme</th><th>Type</th><th>Solde</th><th>≤ 30 j</th><th>31–60 j</th><th>61–90 j</th><th>&gt; 90 j</th><th>Encours</th><th>Rejets probables</th></tr></thead>
      <tbody>${ph.tiers.map((t) => `<tr class="${t.rejets > 0 ? 'flag' : ''}">
        <td>${esc(t.lib)} <span class="muted small">${esc(t.num)}</span></td><td>${CAT_LABEL[t.cat]}</td>
        <td class="${t.s < 0 ? 'cred' : ''}">${eur(t.s)}</td><td>${eur(t.b30, 0)}</td><td>${eur(t.b60, 0)}</td><td>${eur(t.b90, 0)}</td><td>${eur(t.bOld, 0)}</td>
        <td>${t.cat === 'patient' ? '—' : jours(t)}</td><td>${t.rejets > 0 ? eur(t.rejets, 0) + (t.rejetsMode === 'estimation' ? ' *' : '') : ''}</td></tr>`).join('')}</tbody></table></div>
      ${ph.lettrage ? '' : '<p class="muted small">* estimation</p>'}
    </section>
    ${ph.lettrage && ph.tiers.some((t) => t.oldItems.length) ? `<section class="card"><h2>Factures de tiers payant non réglées depuis plus de 60 jours</h2>
      ${ph.tiers.filter((t) => t.oldItems.length && t.cat !== 'patient').map((t) => `<details class="tp-detail"><summary><strong>${esc(t.lib)}</strong> — ${t.oldItems.length} facture(s), ${eur(t.oldItems.reduce((s, o) => s + o.amt, 0))} €</summary>
        <div class="grid-wrap"><table class="dtable num"><thead><tr><th>Date</th><th>Libellé</th><th>Montant</th></tr></thead><tbody>${t.oldItems.slice(0, 100).map((o) => `<tr><td>${o.an ? 'À-nouveau' : fmtDate(o.date)}</td><td>${esc(o.lib)}</td><td>${eur(o.amt)}</td></tr>`).join('')}</tbody></table></div></details>`).join('')}
    </section>` : ''}`;
}

function viewCaTva() {
  const r = ui.fec.result;
  const ph = pharmaData(r, pharmaRef(r));
  const rows = Object.values(ph.rates).filter((x) => x.ht || x.tva).sort((a, b) => (a.rate === null ? 99 : a.rate) - (b.rate === null ? 99 : b.rate));
  return `
    <section class="card"><h2>Chiffre d'affaires et TVA par taux</h2>
      <div class="grid-wrap"><table class="dtable num sig"><thead><tr><th>Taux</th><th>Ventes HT</th><th>Part</th><th>TVA théorique</th><th>TVA comptabilisée</th><th>Écart</th></tr></thead>
      <tbody>${rows.map((x) => {
        const theo = x.rate === null ? null : (x.ht * x.rate) / 100;
        const ecart = theo === null ? null : x.tva - theo;
        return `<tr><td>${x.rate === null ? 'Taux non identifié' : String(x.rate).replace('.', ',') + ' %'}</td><td>${eur(x.ht, 0)}</td><td>${r.kpi.ca > 0 ? Math.round((x.ht / r.kpi.ca) * 100) + ' %' : ''}</td>
          <td>${theo === null ? '—' : eur(theo, 0)}</td><td>${eur(x.tva, 0)}</td><td class="${ecart !== null && Math.abs(ecart) > Math.max(50, Math.abs(theo) * 0.01) ? 'cred' : ''}">${ecart === null ? '—' : eur(Math.round(ecart) || 0, 0)}</td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="muted small">Le taux est lu dans le libellé des comptes 707 et 4457 (ex. « Ventes TVA 2,1 % »).</p>
    </section>
    <section class="card"><h2>Honoraires et autres rémunérations</h2>
      ${ph.incomeLines.length ? `<table class="dtable num sig"><tbody>${ph.incomeLines.map((x) => `<tr><td>${esc(x.compte)} — ${esc(x.lib)}</td><td>${eur(x.montant, 0)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aucun compte d\'honoraires, de ROSP ou de rémunération forfaitaire identifié.</p>'}
    </section>
    <section class="card"><h2>Marge et achats</h2>
      <table class="dtable num sig"><tbody>
        <tr><td>Ventes de marchandises</td><td>${eur(ph.ventesMarch, 0)}</td></tr>
        <tr><td>Achats de marchandises (607)</td><td>${eur(ph.achats, 0)}</td></tr>
        <tr><td>Remises obtenues (609)</td><td>${eur(ph.remises, 0)}</td></tr>
        <tr><td>Variation de stock (6037)</td><td>${eur(ph.variationStock, 0)}</td></tr>
        <tr class="strong"><td>Marge commerciale</td><td>${eur(r.kpi.marge, 0)}</td></tr>
        <tr class="strong"><td>Taux de marque</td><td>${ph.tauxMarque === null ? '—' : (ph.tauxMarque * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %'}</td></tr>
      </tbody></table>
    </section>`;
}

// Pièces à demander propres à l'officine.
function pharmaPieces(r, mode, arrete, push) {
  const ph = pharmaData(r, arrete);
  const d = fmtDate;
  ph.tiers.forEach((t) => {
    if (t.cat === 'patient') return;
    if (t.rejets > 0) push('tp', 'rej:' + t.num, `État des rejets et impayés ${t.lib} : ${eur(t.rejets)} € ${t.rejetsMode === 'lettrage' ? `de factures de plus de 60 jours (la plus ancienne du ${d(t.oldItems[0].date)})` : `d'encours au-delà du délai normal (${Math.round(t.encoursJours)} jours de facturation en attente)`}`);
    if (t.s < 0) push('tp', 'trop:' + t.num, `Relevé de paiement ${t.lib} : trop-perçu ou règlement non affecté de ${eur(-t.s)} €`);
  });
  const patients = ph.tiers.filter((t) => t.cat === 'patient' && t.s > 0);
  const old = patients.reduce((s, t) => s + t.b90 + t.bOld, 0);
  if (patients.length) push('tp', 'patients', `Point sur les créances patients (ardoises) : ${eur(ph.encoursPatients)} € pour ${patients.length} patient(s)${old > 0 ? `, dont ${eur(old)} € de plus de 60 jours` : ''}`);
  ph.transit.forEach((x) => {
    const jours = x.perDay > 0 ? x.s / x.perDay : null;
    if (x.s > 0 && (jours === null || jours > 4)) push('banque', 'transit:' + x.compte, `Relevés de remises (${x.lib}) : ${eur(x.s)} € en attente de remise au ${d(arrete)}`);
  });
  if (mode === 'bilan') {
    push('cloture', 'ph-inv', `Inventaire valorisé des stocks édité par le LGO au ${d(arrete)} (prix d'achat, hors périmés)`);
    push('cloture', 'ph-rfa', 'Remises de fin d\'année, avoirs et coopération commerciale à recevoir des grossistes et laboratoires');
    push('cloture', 'ph-tp', `Balance âgée et état des rejets du tiers payant édités par le LGO au ${d(arrete)}`);
    push('cloture', 'ph-z', 'Récapitulatif annuel du chiffre d\'affaires par taux de TVA (LGO)');
    push('cloture', 'ph-rosp', 'Décomptes de l\'Assurance maladie : ROSP, rémunérations forfaitaires, gardes et astreintes');
  } else {
    push('cloture', 'ph-tp-sit', `Balance âgée du tiers payant éditée par le LGO au ${d(arrete)}`);
  }
}
