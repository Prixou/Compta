/*
 * Suivi Dossiers — Analyse FEC, espace « Mois » : choix du mois, chiffres du mois et contrôles de la saisie.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- Espace « Mois » : gestion courante d'un dossier, mois par mois ----------

const inMonth = (iso, ym) => !!iso && iso.slice(0, 7) === ym;

// ---------- Affectations suggérées d'après le FEC ----------
// Une opération dont le libellé (deux premiers mots significatifs) a déjà été affectée dans le FEC — compte de tiers lettré,
// ou compte de charge ou de produit — reçoit la même affectation en suggestion.
function labelSug(r, lib, credit) {
  const inv = credit && invSugApp(r, lib);
  if (inv) return inv;
  const idx = r.labelIdx;
  if (!idx || !lib) return null;
  const stop = idx._stop || Object.defineProperty(idx, '_stop', { value: new Set(idx.stop) })._stop;
  const words = norm(lib).replace(/[^a-z ]+/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !stop.has(w));
  return idx.map[words.slice(0, 2).join(' ') || '?'] || null;
}
// Encaissement dont le libellé cite le n° d'une facture client (« VIR X · F260012 ») : même calcul de clé que le moteur.
function invSugApp(r, lib) {
  const idx = r.invIdx;
  if (!idx || !lib) return null;
  const re = /(?:^|[^A-Z0-9])([A-Z]{1,4})[\s\-_/.]{0,2}0*(\d{4,9})(?!\d)/g;
  const t = String(lib).toUpperCase();
  let m;
  while ((m = re.exec(t))) {
    const x = idx[m[1] + m[2]];
    if (x) return [x[0], x[1], x[2], 0, 0, 0, x[4], `${x[3]} du ${fmtDate(x[4])}, ${eur(x[5])} € TTC${x[6] ? ', déjà lettrée' : ''}`];
  }
  return null;
}
// « 401 F07 ORANGE BUSINESS (10 fois, lettré) » ; « 411 C12 MARTIN — facture F-260012 du 15/03/2026, 1 200,00 € TTC »
const sugTxt = (sg) => (sg[7] ? `${sg[0]}${sg[1] ? ' ' + sg[1] : ''} ${sg[2]} — facture ${sg[7]}`
  : `${sg[0]}${sg[1] ? ' ' + sg[1] : ''} ${sg[2]} (${sg[3]} fois${sg[5] > sg[3] ? ` sur ${sg[5]}` : ''}${sg[4] ? `, lettré${sg[4] < sg[3] ? ` ${sg[4]} fois` : ''}` : ''})`);
const attenteEx = (l) => `${fmtDate(l.date)} · ${l.compte} · « ${l.lib} » · ${eur(l.d || l.c)} € au ${l.d ? 'débit' : 'crédit'}${l.sug ? ` → affectation suggérée : ${sugTxt(l.sug)}` : ''}`;

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
  const key = [ym, ui.fecProfile, ui.fec.clientId || '', Object.keys(wpMemo()).length, JSON.stringify(ventesSeriesStore())].join('|');
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
    // Lignes encore ouvertes (le moteur écarte les lignes lettrées, reclassées ou d'un compte soldé)
    const ouv = p.attente || [];
    const att = ouv.filter((l) => inMonth(l.date, ym));
    // Lignes des mois précédents : décompte du moteur avant troncature (fichier volumineux)
    const mois = p.attenteMois;
    const avant = mois ? Object.keys(mois).filter((m) => m < ym).reduce((t, m) => t + mois[m], 0) : ouv.filter((l) => l.date < `${ym}-01`).length;
    const nBq = att.filter((l) => l.bank && !(l.sug && l.sug[7])).length;
    const nSug = att.filter((l) => l.sug).length;
    // Au-delà de 3 000 lignes ouvertes, seules les plus récentes sont transmises
    const cut = p.trunc && p.trunc.att;
    if (att.length) o.add('warn', "Opérations restées en compte d'attente", `${att.length} ligne(s) du mois sur les comptes 471 à 478 encore ouverte(s) (ni lettrée(s), ni reclassée(s)), dont ${nBq} opération(s) de banque ou de caisse à justifier par le client (« Pièces manquantes ») : à identifier puis à reclasser.${avant ? ` ${avant} autre(s) ligne(s) des mois précédents de l'exercice toujours ouverte(s).` : ''}${nSug ? ` ${nSug} affectation(s) suggérée(s) d'après les opérations au même libellé déjà affectées dans le FEC ou le n° de facture cité dans le libellé ; l'écriture de reclassement est proposée dans Révision → Écritures.` : ''}`, att.map(attenteEx), { full: !cut || ym > cut.slice(0, 7) });
    else if (cut && ym <= cut.slice(0, 7)) o.add('info', "Comptes d'attente", `Plus de 3 000 lignes encore ouvertes sur les comptes 471 à 478 : seules celles depuis le ${fmtDate(cut)} sont détaillées.`);
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
  numberingChecks(r, ym, o);
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

// Numérotation des factures de vente du mois : toutes les écritures de produits (70, 75, 77), factures et avoirs,
// par série (journal et préfixe du n° de pièce). Trous, doublons et ordre chronologique, sur la suite de l'exercice.
function numberingChecks(r, ym, o) {
  const cl = r.cycles && r.cycles.clients;
  if (!cl || !cl.numbering) return;
  const mois = moisNom(`${ym}-01`);
  const series = cl.numbering.filter((g) => !g.sparse && g.seq && serieOn(g));
  const missing = [], dups = [], inv = [], ok = [];
  let nMissing = 0;
  series.forEach((g) => {
    const ref = serieRef(g);
    const inM = g.seq.filter(([, d]) => inMonth(d, ym)).map(([n]) => n);
    if (!inM.length) return;
    const tag = series.length > 1 ? ` (série ${g.label})` : '';
    // Un trou est rattaché au mois des factures qui l'encadrent
    // (chaque numéro manquant sur sa propre ligne, pour en suivre la justification un par un)
    const mi = missingInvoices(g, ([, , da, db]) => inMonth(da, ym) || inMonth(db, ym), tag);
    nMissing += mi.n;
    missing.push(...mi.list);
    (g.dupL || []).filter(([, list]) => list.some(([d]) => inMonth(d, ym))).forEach(([p, list]) => dups.push(`${p} : ${list.map(([d, v]) => `${fmtDate(d)} (${eur(v)} € HT)`).join(' et ')}${tag}`));
    (g.invL || []).filter(([, da, , db]) => inMonth(da, ym) || inMonth(db, ym)).forEach(([pa, da, pb, db]) => inv.push(`${pa} du ${fmtDate(da)} puis ${pb} du ${fmtDate(db)}`));
    ok.push(`${g.label} : ${inM.length} ${g.src === 'mmaa' ? 'n°' : 'pièce(s)'} du mois, de ${ref(Math.min(...inM))} à ${ref(Math.max(...inM))}`);
    // N° « 51080126 » lus seulement dans un encaissement : la vente n'est pas identifiable par son n°
    if (g.src === 'mmaa') {
      const only = (g.onlyEnc || []).filter(([, d]) => inMonth(d, ym));
      if (only.length) o.add('info', 'N° de facture cités seulement dans les encaissements', `${only.length} n° de facture du mois apparaissent dans un encaissement mais dans aucune écriture de vente : vérifiez que la vente correspondante est bien saisie (son libellé ne reprend pas le n° de facture).`, only.slice(0, 60).map(([n, d]) => `${ref(n)} (encaissement, facture de ${moisNom(d)})`), { full: only.length <= 60 });
    }
  });
  if (missing.length) o.add('warn', 'Factures de vente manquantes dans la numérotation', `${nMissing} numéro(s) absent(s) autour de ${mois} : facture annulée (garder l'original), non saisie, ou saisie sur un autre mois ou un autre compte ? La numérotation doit être continue (art. 242 nonies A de l'annexe II du CGI).`, missing, { full: missing.length >= nMissing });
  if (dups.length) o.add('warn', 'Numéros de facture de vente utilisés plusieurs fois', `${dups.length} numéro(s) : facture saisie deux fois, ou même n° donné à deux factures ?`, dups, { full: true });
  if (inv.length) o.add('info', 'Factures de vente hors ordre chronologique', 'Un numéro plus élevé porte une date antérieure : erreur de date ou de numéro, ou facture antidatée ?', inv, { full: true });
  if (ok.length && !missing.length && !dups.length) o.add('ok', 'Numérotation des factures de vente continue', ok.join(' ; ') + '.');
  // Ventes du mois dont le n° de facture n'est pas exploitable
  const noNum = (cl.noNum || []).filter(([d]) => inMonth(d, ym));
  const notSeq = cl.numbering.filter((g) => g.sparse && g.seq && g.seq.some(([, d]) => inMonth(d, ym)));
  if (!ok.length && notSeq.length) o.add('info', 'Numérotation des factures de vente non contrôlable', `Les n° de pièce des ventes du mois (${notSeq.map((g) => g.label).join(', ')}) ${notSeq.some((g) => g.ecriture) ? 'sont les n° d\'écriture' : 'ne forment pas une suite'} : le n° de facture n'est pas repris dans le FEC. À contrôler dans l'outil de facturation ou de caisse.`);
  if (noNum.length) o.add('info', 'Écritures de vente sans n° de facture', `${noNum.length} écriture(s) de produits du mois dont la pièce ne se termine pas par un numéro : n° de facture à reporter dans la saisie.`, noNum.slice(0, 30).map(([d, jc, num, piece, amt, lib]) => `${fmtDate(d)} · ${jc} ${num} · « ${lib} » · ${eur(amt)} € HT${piece ? ` (pièce « ${piece} »)` : ''}`), { full: noNum.length <= 30 });
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

// Onglet « Factures de vente » : contrôles de numérotation du mois (mêmes statuts que les contrôles de saisie) et liste des ventes.
const RE_NUM_CHECK = /numérotation|n° de facture|numéros de facture|hors ordre chronologique|sans n° de facture/i;
const ventesChecks = (r, ym) => saisieChecks(r, ym).filter((x) => RE_NUM_CHECK.test(x.label));
const ventesLeft = (r, ym) => wpProgress(`saisie-${ym}`, ventesChecks(r, ym)).left;
function viewVentes() {
  const r = ui.fec.result;
  const ym = fecMonth();
  const list = ventesChecks(r, ym);
  return `<section class="card"><h2>Numérotation des factures de vente — ${esc(moisNom(`${ym}-01`))}</h2>
    <p class="muted small">La numérotation des factures doit être continue et chronologique (art. 242 nonies A de l'annexe II du CGI). Un trou est rattaché au mois des factures qui l'encadrent.</p>
    ${list.length ? wpCheckList(list, `saisie-${ym}`) : '<p class="muted">Aucune écriture de vente ce mois-ci.</p>'}
  </section>
  ${salesCard(r, ym)}`;
}

// Factures de vente du mois : séries de numérotation et liste de toutes les écritures de produits examinées.
function salesCard(r, ym) {
  const cl = r.cycles && r.cycles.clients;
  if (!cl || !cl.numbering) return '';
  const docs = (cl.docs7L || []).filter(([d]) => inMonth(d, ym));
  const rows = cl.numbering.map((g) => {
    const ref = serieRef(g);
    const inM = (g.seq || []).filter(([, d]) => inMonth(d, ym)).map(([n]) => n);
    if (!inM.length) return null;
    const on = serieOn(g);
    const miss = g.sparse ? null : (g.gaps || []).filter(([, , da, db]) => inMonth(da, ym) || inMonth(db, ym)).reduce((t, [a, b]) => t + b - a - 1, 0);
    const dups = (g.dupL || []).filter(([, l]) => l.some(([d]) => inMonth(d, ym))).length;
    const box = g.sparse ? '' : `<label class="check inline"><input type="checkbox" data-ventes-serie="${esc(g.label)}"${on ? ' checked' : ''}><span class="sr-only">Contrôler la série ${esc(g.label)}</span></label>`;
    return `<tr class="${on ? '' : 'muted'}"><td>${box}</td><td>${esc(g.label)}</td><td>${inM.length}</td><td>${esc(ref(Math.min(...inM)))}</td><td>${esc(ref(Math.max(...inM)))}</td><td class="${miss && on ? 'cred' : ''}">${g.sparse ? `<span class="muted small">${g.ecriture ? "n° d'écriture" : 'pas une suite'}</span>` : miss}</td><td class="${dups && on ? 'cred' : ''}">${g.sparse ? '' : dups || 0}</td></tr>`;
  }).filter(Boolean);
  const sfx = cl.numbering.find((g) => g.src === 'mmaa');
  return `<section class="card"><h2>Factures de vente du mois <span class="count">${docs.length}</span></h2>
    <p class="muted small">Toutes les écritures du mois sur les comptes de produits 70, 75 et 77 (factures et avoirs, hors OD de TVA et régularisations). Le n° de facture est lu dans le n° de pièce, ou dans le libellé quand la pièce porte le n° d'écriture ; les séries sont formées par journal et préfixe.</p>
    ${rows.length ? `<div class="grid-wrap"><table class="dtable num ventes-series"><thead><tr><th title="Série contrôlée">Contrôler</th><th>Série</th><th>Pièces du mois</th><th>Du n°</th><th>Au n°</th><th>Manquants</th><th>Doublons</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
      <p class="muted small">Décochez une série qui n'est pas la numérotation des factures (n° de pièce interne, de réservation…) : elle n'est plus contrôlée pour ce dossier, ni demandée au client.</p>` : '<p class="muted">Aucune série de numéros exploitable ce mois-ci (moins de trois numéros, ou pièces sans numéro).</p>'}
    ${sfx ? `<p class="small">Série <strong>${esc(sfx.label)}</strong> : numérotation « n° + mois et année » (51080126 = facture 5108 de janvier 2026), lue dans tous les libellés, avec ou sans F, y compris les listes d'encaissement (« 5101-5102-51040126 », « F5113+5114+… ») ; un n° manquant est affiché avec le mois et l'année des factures voisines, ou les deux possibilités quand elles changent de mois ; ${sfx.count} n° de ${esc(sfx.first)} à ${esc(sfx.last)} sur l'exercice, dont ${sfx.vente} dans une écriture de vente et ${sfx.enc} dans un encaissement. Un n° absent de toutes les écritures est signalé comme manquant.${sfx.outliers && sfx.outliers.length ? ` N° hors de la suite (faute de frappe ?) : ${sfx.outliers.map(([n, d, raw]) => `${raw || n} (${fmtDate(d)})`).join(', ')}.` : ''}</p>` : ''}
    ${docs.length ? `<details class="viz-table"><summary>Voir les ${docs.length} écriture(s) de vente du mois</summary>
      <div class="grid-wrap"><table class="dtable num l3 l4"><thead><tr><th>Date</th><th>Écriture</th><th>Pièce</th><th>Libellé</th><th>Montant HT</th></tr></thead>
      <tbody>${docs.slice(0, 1000).map(([d, jc, num, piece, amt, lib]) => `<tr><td>${fmtDate(d)}</td><td>${esc(jc)} ${esc(num)}</td><td>${esc(piece)}</td><td>${esc(lib)}</td><td class="${amt < 0 ? 'cred' : ''}">${eur(amt)}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
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
