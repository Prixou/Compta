/*
 * Suivi Dossiers — Analyse FEC, espace « Mois » : choix du mois, chiffres du mois et contrôles de la saisie.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- Espace « Mois » : gestion courante d'un dossier, mois par mois ----------

const inMonth = (iso, ym) => !!iso && iso.slice(0, 7) === ym;

// Change le mois affiché ; le contrôle de TVA suit (mois, ou trimestre qui le contient).
function setFecMonth(ym) {
  const f = ui.fec;
  if (!f || !f.result || !/^\d{4}-\d{2}$/.test(ym)) return;
  f.month = ym;
  const T = f.result.cycles && f.result.cycles.tva;
  const st = T && f.tvaCtl;
  if (st && T.months[ym]) st.key = st.kind === 'quarter' ? quarterOf(ym) : ym;
}

// Après un changement de période dans le contrôle de TVA : le mois affiché suit (dernier mois saisi de la période).
function monthFromTva() {
  const f = ui.fec;
  const st = f.tvaCtl;
  if (!st) return;
  const months = tvaPeriod(st.key).months.filter((ym) => f.result.cycles.tva.months[ym]);
  if (months.length) f.month = months[months.length - 1];
}

// Contrôles de la saisie du mois : imputations sur le mauvais tiers, doublons, comptes d'attente,
// soldes anormaux des fournisseurs et des clients à la fin du mois.
function saisieChecks(r, ym) {
  const key = [ym, ui.fecProfile, ui.fec.clientId || '', Object.keys(wpMemo()).length].join('|');
  if (r._saisie && r._saisie.key === key) return r._saisie.list;
  const out = [];
  const pharma = ui.fecProfile === 'pharmacie';
  // Contrôles communs avec la révision : un élément justifié (« ne plus signaler ») dans le cycle l'est aussi ici.
  const fromCycle = (cycle, fn) => { const o = checksList(); fn(o); applyMemo(o, cycle).forEach((x) => out.push(x)); };
  if (r.misposted) {
    ['401', '411'].forEach((racine) => fromCycle(racine === '401' ? 'achats' : pharma ? 'treso' : 'clients', (o) => {
      const who = racine === '401' ? 'fournisseur' : pharma ? 'organisme ou patient' : 'client';
      const list = (r.misposted[racine] || []).filter((x) => inMonth(x.date, ym));
      if (list.length) o.add('warn', MISPOST[racine].replace(/client$/, who), `${list.length} écriture(s) du mois, ${eur(list.reduce((t, x) => t + x.amt, 0))} € : à reclasser avant de lettrer et de relancer (écriture de reclassement proposée dans l'espace Révision, onglet Écritures).`, list.map(mispostEx), { full: true, beta: true });
      else o.add('ok', `Imputation des ${racine === '401' ? 'factures et règlements fournisseurs' : 'factures et encaissements clients'}`, `Aucune écriture du mois dont le libellé ou le montant désigne un autre ${who}.`, [], { beta: true });
    }));
  }
  const a = r.cycles && r.cycles.achats;
  if (a) {
    fromCycle('achats', (o) => {
      const idx = a.dupStrong.items.map((x, i) => i).filter((i) => inMonth(a.dupStrong.items[i].date, ym));
      if (idx.length) o.add('warn', 'Factures fournisseurs en double', `${idx.length} facture(s) du mois saisie(s) deux fois (même fournisseur, même montant, même n° de pièce, à moins de 15 jours d'écart) : ${eur(idx.reduce((t, i) => t + a.dupStrong.items[i].ttc, 0))} € de charges et de TVA déductible en trop ?`, idx.map((i) => a.dupStrong.ex[i]), { full: a.dupStrong.items.length >= a.dupStrong.n });
      else o.add('ok', 'Aucune facture fournisseur en double', 'Factures du mois contrôlées (fournisseur, montant et n° de pièce).');
    });
  }
  const o = checksList();
  const p = r.pieces;
  if (p) {
    const att = (p.attente || []).filter((l) => inMonth(l.date, ym) && !l.lettre && Math.abs(l.soldeCompte) >= 0.01);
    if (att.length) o.add('warn', "Opérations restées en compte d'attente", `${att.length} ligne(s) du mois sur les comptes 471 à 478, non lettrées : à identifier (question au client dans « Pièces du mois ») puis à reclasser.`, att.map((l) => `${fmtDate(l.date)} · ${l.compte} · « ${l.lib} » · ${eur(l.d || l.c)} € au ${l.d ? 'débit' : 'crédit'}`), { full: p.attente.length < 400 });
    else o.add('ok', "Comptes d'attente", "Aucune opération du mois restée en compte d'attente.");
    // Solde de chaque compte de tiers à la fin du mois (à-nouveau compris)
    const end = (t) => round2(Object.keys(t.m).reduce((s, m) => (m <= ym ? s + t.m[m][0] - t.m[m][1] : s), t.an));
    const abn = (racine, sign) => (p.tiersMonths || []).filter((t) => t.racine === racine)
      .map((t) => ({ t, s: end(t) })).filter((x) => x.s * sign >= 1).sort((x, y) => Math.abs(y.s) - Math.abs(x.s));
    const ex = (list) => list.slice(0, 30).map((x) => `${x.t.lib} (${x.t.num}) : ${eur(Math.abs(x.s))} €`);
    const fd = abn('401', 1);
    if (fd.length) o.add('warn', 'Fournisseurs débiteurs en fin de mois', `${fd.length} compte(s), ${eur(fd.reduce((t, x) => t + x.s, 0))} € : facture non saisie, règlement en double ou passé sur le mauvais fournisseur, avoir à recevoir, ou acompte versé à classer en 4091 ?`, ex(fd), { full: fd.length <= 30 });
    else o.add('ok', 'Aucun fournisseur débiteur', 'Comptes fournisseurs créditeurs ou soldés à la fin du mois.');
    const cc = abn('411', -1);
    const lab = pharma ? 'Organismes ou patients créditeurs en fin de mois' : 'Clients créditeurs en fin de mois';
    if (cc.length) o.add(pharma ? 'info' : 'warn', lab, `${cc.length} compte(s), ${eur(-cc.reduce((t, x) => t + x.s, 0))} € : facture non saisie, encaissement en double ou passé sur le mauvais ${pharma ? 'organisme' : 'client'}, avoir à rembourser, ou acompte reçu à classer en 4191 ?`, ex(cc), { full: cc.length <= 30 });
    else o.add('ok', pharma ? 'Aucun organisme ni patient créditeur' : 'Aucun client créditeur', 'Comptes clients débiteurs ou soldés à la fin du mois.');
  }
  const list = applyMemo(out.concat(o), `saisie-${ym}`);
  r._saisie = { key, list };
  return list;
}

// Mois marqué comme revu : l'étape de contrôle de la mission « Saisie » du mois est cochée, si le modèle en comporte une.
function saisieSigned(cycle) {
  const m = /^saisie-(\d{4})-(\d{2})$/.exec(cycle || '');
  const c = m && clientById(ui.fec.clientId);
  if (!c) return;
  const done = autoStep(c.id, ['saisie'], [`${m[2]}/${m[1]}`], /contr[ôo]le/i, "saisie du mois revue dans l'analyse du FEC");
  if (done) setTimeout(() => toast(`Saisie revue — ${done}.`), 0);
}

const saisieLeft = (r, ym) => wpProgress(`saisie-${ym}`, saisieChecks(r, ym)).left;

function viewSaisie() {
  const r = ui.fec.result;
  const ym = fecMonth();
  const cycle = `saisie-${ym}`;
  const list = saisieChecks(r, ym);
  return `<section class="card"><h2>Contrôles de la saisie — ${esc(moisNom(`${ym}-01`))}</h2>
    <p class="muted small">À corriger dans la comptabilité du mois avant de lettrer, de relancer et de déclarer la TVA. Le statut et le commentaire de chaque point sont conservés, chiffrés, dans le dossier ; « Ne plus signaler » vaut pour les mois suivants.</p>
    ${wpCycleBar(cycle, list, 'Marquer le mois comme revu')}
    ${wpCheckList(list, cycle)}
  </section>`;
}

// En-tête de l'espace « Mois » : choix du mois (commun aux pièces, aux contrôles de saisie et à la TVA) et chiffres du mois.
function moisHeader(r, t) {
  const ym = fecMonth();
  const months = r.monthly.map((x) => x.mois);
  const i = months.indexOf(ym);
  const x = r.monthly[i] || {};
  const maxOp = r.pieces && r.pieces.maxOp;
  const partial = maxOp && maxOp >= `${ym}-01` && maxOp < addDays(endOfMonth(`${ym}-01`), -5);
  const tvaOk = t && t.per.months.includes(ym);
  return `<section class="card mois-head">
    <div class="mois-nav">
      <button class="btn small" data-action="fec-month" data-step="-1" aria-label="Mois précédent"${i > 0 ? '' : ' disabled'}>‹</button>
      <label class="inline-label">Mois <input type="month" data-fec="month" value="${esc(ym)}" min="${esc(months[0] || '')}" max="${esc(months[months.length - 1] || '')}"></label>
      <button class="btn small" data-action="fec-month" data-step="1" aria-label="Mois suivant"${i >= 0 && i < months.length - 1 ? '' : ' disabled'}>›</button>
      <strong class="mois-name">${esc(moisNom(`${ym}-01`).replace(/^./, (c) => c.toUpperCase()))}</strong>
    </div>
    ${partial ? `<div class="banner warn"><span>Les écritures s'arrêtent au ${fmtDate(maxOp)} : seule la partie saisie du mois est analysée.</span></div>` : ''}
    <div class="kpis fec-kpis">
      ${kpiTile("Chiffre d'affaires du mois", eurK(x.ca || 0))}
      ${kpiTile('Charges du mois', eurK(x.charges || 0))}
      ${kpiTile('Trésorerie en fin de mois', eurK(x.tresorerie || 0), x.tresorerie < 0 ? 'kpi-late' : '')}
      ${tvaOk ? kpiTile(`${t.draft.net >= 0 ? 'TVA nette à payer' : 'Crédit de TVA'}${t.per.months.length > 1 ? ' (trimestre)' : ''} · bêta`, `${eur(Math.abs(t.draft.net), 0)} €`, t.draft.net < 0 ? 'kpi-wait' : '') : ''}
    </div>
  </section>`;
}
