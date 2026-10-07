/*
 * Suivi Dossiers — Suivi mensuel (grille type tableur).
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------------------------------------------------------------------------
// Suivi mensuel (grille type tableur)
// ---------------------------------------------------------------------------

const MOIS_COURTS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function tvaShort(regime) {
  const r = norm(regime);
  if (!r) return '';
  if (r.includes('mensuel')) return 'M';
  if (r.includes('trimestriel')) return 'T';
  if (r.includes('simplifie')) return 'CA12';
  if (r.includes('franchise')) return 'F';
  if (r.includes('non assujetti')) return '—';
  return regime;
}

const REGIME_FILTRES = { '': 'Tous régimes', M: 'TVA mensuelle', T: 'TVA trimestrielle', CA12: 'TVA annuelle (CA12)', autre: 'Autres régimes' };

function regimeGroup(c) {
  const r = tvaShort(c.regimeTva);
  return ['M', 'T', 'CA12'].includes(r) ? r : 'autre';
}

// Colonne d'une période pour l'année donnée : 1-12 pour « MM/AAAA » ou « Tn AAAA », 13 pour l'exercice « AAAA ».
function periodColumn(exercice, year) {
  if ((exercice || '').trim() === String(year)) return 13;
  let m = (exercice || '').match(/^(\d{1,2})\/(\d{4})$/);
  if (m && Number(m[2]) === year) return Number(m[1]);
  m = (exercice || '').match(/^T([1-4])\s*(\d{4})$/i);
  if (m && Number(m[2]) === year) return Number(m[1]) * 3;
  return 0;
}

// Sur petit écran, fait défiler la grille jusqu'au mois précédent (période en cours de déclaration).
function scrollGrilleToMonth() {
  const wrap = $('.grid-wrap');
  if (!wrap || Number(ui.grille.annee) !== new Date().getFullYear()) return;
  const ths = $$('.grille thead th', wrap);
  const target = ths[4 + Math.max(0, new Date().getMonth() - 2)];
  const name = $('.grille thead .g-name', wrap);
  if (target && name) wrap.scrollLeft = target.offsetLeft - name.offsetWidth - name.offsetLeft;
}

// Données de la grille : dossiers affichés et missions indexées par colonne (1-12, 13 = année).
function grilleModel() {
  const g = ui.grille;
  const year = Number(g.annee);
  const grid = new Map();
  const years = new Set([new Date().getFullYear()]);
  data.missions.forEach((m) => {
    if (m.type !== g.type) return;
    const ym = (m.exercice || '').match(/(\d{4})$/);
    if (ym) years.add(Number(ym[1]));
    const col = periodColumn(m.exercice, year);
    if (!col) return;
    if (!grid.has(m.clientId)) grid.set(m.clientId, {});
    grid.get(m.clientId)[col] = m;
  });
  const base = data.clients
    .filter((c) => grid.has(c.id) && !c.archive)
    .filter((c) => inPortfolio(c, g.resp));
  const counts = base.reduce((acc, c) => {
    acc[regimeGroup(c)] = (acc[regimeGroup(c)] || 0) + 1;
    return acc;
  }, {});
  const regimeOptions = Object.fromEntries(Object.entries(REGIME_FILTRES)
    .filter(([k]) => !k || counts[k] || k === g.regime)
    .map(([k, l]) => [k, `${l} (${k ? counts[k] || 0 : base.length})`]));
  const sort = grilleSort();
  const clients = base
    .filter((c) => !g.regime || regimeGroup(c) === g.regime)
    .sort((a, b) => sort.dir * grilleCompare(sort.key, a, b, grid) || (a.code || '').localeCompare(b.code || '', 'fr', { numeric: true }) || a.nom.localeCompare(b.nom, 'fr'));
  const resps = allResps();
  // Colonne « Année » affichée seulement s'il existe des missions annuelles (ex. CA12 « 2026 »).
  const cols = clients.some((c) => grid.get(c.id)[13]) ? 13 : 12;
  return { g, year, grid, years, base, clients, resps, regimeOptions, cols, sort };
}

const GRILLE_TRIS = { code: 'N° de dossier', nom: 'Nom du dossier', tva: 'Régime de TVA', jour: 'Jour de dépôt TVA', cloture: 'Date de clôture', resp: 'Responsable', retard: 'Retards et avancement' };
const grilleSort = () => Object.assign({ key: 'code', dir: 1 }, data.settings.grilleSort || {});
const TVA_ORDRE = { M: 1, T: 2, A: 3 };

// Comparaison de deux dossiers selon la colonne de tri choisie (sens croissant).
function grilleCompare(key, a, b, grid) {
  const str = (x, y) => (x || '').localeCompare(y || '', 'fr', { numeric: true, sensitivity: 'base' });
  const num = (x, y) => (x === y ? 0 : x === null ? 1 : y === null ? -1 : x - y);
  if (key === 'nom') return str(clientLabel(a), clientLabel(b));
  if (key === 'tva') return num(TVA_ORDRE[tvaShort(a.regimeTva)] || 9, TVA_ORDRE[tvaShort(b.regimeTva)] || 9);
  if (key === 'jour') return num(a.jourTva ? Number(a.jourTva) : null, b.jourTva ? Number(b.jourTva) : null);
  if (key === 'cloture') {
    const v = (c) => { const m = (c.cloture || '').match(/^(\d{2})\/(\d{2})$/); return m ? Number(m[2]) * 100 + Number(m[1]) : null; };
    return num(v(a), v(b));
  }
  if (key === 'resp') return str(a.responsable || a.collaborateur, b.responsable || b.collaborateur);
  if (key === 'retard') {
    // Dossiers les plus en retard d'abord, puis ceux qui ont le moins avancé.
    const score = (c) => Object.values(grid.get(c.id) || {}).reduce((t, m) => t + (isOpen(m) ? (isLate(m) ? 1000 : 0) + (100 - progress(m)) : 0), 0);
    return score(b) - score(a);
  }
  return str(a.code, b.code);
}

// Libellé court d'une étape, affiché dans la case (« Saisie », « Contrôle », « Télédécl. »).
function stepShort(label) {
  const bq = String(label || '').match(/^banque\s+(\S+)/i);
  if (bq) return 'Bq ' + bq[1].replace(/ée?s?$/i, '').slice(0, 6);
  const sv = String(label || '').match(/^saisie\s+(?:des?\s+|du\s+|de\s+la\s+)?(\S+)/i);
  if (sv && !/^[/(]/.test(sv[1])) { const w2 = sv[1].charAt(0).toUpperCase() + sv[1].slice(1); return w2.length > 9 ? w2.slice(0, 8) + '.' : w2; }
  const w = String(label || '').replace(/^(la|le|les|l'|de|des|du)\s+/i, '').split(/[\s/(,–-]+/)[0] || String(label || '');
  return w.length > 10 ? w.slice(0, 9) + '.' : w;
}
const lastDoneIndex = (m) => m.etapes.reduce((k, e, i) => (e.done ? i : k), -1);

// Étapes faisables dans n'importe quel ordre : saisies consécutives (ventes, achats…). Renvoie [début, fin] du groupe.
function stepGroup(etapes, i) {
  const isS = (k) => k >= 0 && k < etapes.length && /^(saisie|banque)\b/i.test(etapes[k].label || '');
  if (!isS(i)) return [i, i];
  let a = i, b = i;
  while (isS(a - 1)) a--;
  while (isS(b + 1)) b++;
  return [a, b];
}
// Dans un groupe, une étape dépend des précédentes de même premier mot (« Banque affectée » suppose « Banque importée ») ;
// les saisies (ventes, achats) restent indépendantes entre elles.
const firstWord = (e) => norm(e.label || '').split(/\s+/)[0];
const sameKind = (etapes, j, i) => firstWord(etapes[i]) !== 'saisie' && firstWord(etapes[j]) === firstWord(etapes[i]);

// Libellé de l'étape atteinte : « Saisie » quand tout le groupe (banque, ventes, achats) est fait,
// sinon la dernière étape du groupe cochée (dans l'ordre où elles ont été faites).
function stepReached(m) {
  const last = lastDoneIndex(m);
  if (last < 0) return '';
  const [a, b] = stepGroup(m.etapes, last);
  if (a === b) return stepShort(m.etapes[last].label);
  const grp = m.etapes.slice(a, b + 1);
  if (grp.every((e) => e.done)) return 'Saisie';
  // Faite le plus récemment ; à égalité (cochées du même clic), la plus avancée dans la liste.
  const recent = grp.map((e, k) => [e, k]).filter(([e]) => e.done).sort((x, y) => (y[0].doneAt || '').localeCompare(x[0].doneAt || '') || y[1] - x[1])[0][0];
  return stepShort(recent.label);
}

function grilleCellState(m) {
  if (!m) return 'none';
  if (!isOpen(m)) return 'ok';
  if (isLate(m)) return 'late';
  if (m.statut === 'attente_client') return 'wait';
  return m.statut === 'a_faire' ? 'todo' : 'progress';
}

async function exportGrille() {
  const { year, grid, clients, cols } = grilleModel();
  const ok = await ask({
    title: 'Export Excel non chiffré',
    message: "Le fichier Excel n'est <strong>pas chiffré</strong> et contient des informations couvertes par le secret professionnel. Enregistrez-le uniquement sur un support sécurisé. Il peut être réimporté dans l'application.",
    okLabel: 'Exporter',
  });
  if (!ok) return;
  const STYLE = { ok: 3, late: 4, none: 5, todo: 6, progress: 6, wait: 7 };
  const head = ['N°DOSSIER', 'STATUT', 'DOSSIERS', 'RESPONSABLE', 'COLLABORATEUR', 'SUPERVISEUR', 'SIREN', 'TVA', 'JOUR TVA', 'IS/IR']
    .concat(Array.from({ length: 12 }, (_, i) => i + 1), cols === 13 ? ['ANNÉE'] : []);
  const rows = [head.map((v) => ({ v, s: 1 }))];
  clients.forEach((c) => {
    const row = grid.get(c.id);
    const text = (v) => ({ v: v || '', s: 2 });
    const cells = [c.code, c.forme, c.nom, c.responsable, c.collaborateur, c.superviseur, c.siren, tvaShort(c.regimeTva)].map(text);
    cells.push({ v: c.jourTva ? Number(c.jourTva) : '', s: 6 }, text(c.cloture ? `${c.cloture}/${year}` : ''));
    for (let i = 1; i <= cols; i++) {
      const state = grilleCellState(row[i]);
      cells.push({ v: state === 'ok' ? 'OK' : state === 'wait' ? 'ATT' : '', s: STYLE[state] });
    }
    rows.push(cells);
  });
  const sheets = [{ name: `Suivi ${tplName(ui.grille.type)} ${year}`, rows, widths: [11, 9, 44, 13, 15, 13, 17, 7, 9, 12].concat(Array(cols).fill(6)), freeze: { row: 1, col: 3 } }];
  // Montants déclarés (TVA) : positif à payer, négatif crédit, 0 néant.
  const withAmt = clients.filter((c) => Object.values(grid.get(c.id)).some((m) => hasTvaAmount(m) && tvaNetSet(m)));
  if (withAmt.length) {
    const arows = [[{ v: `Montants de TVA déclarés ${year} — positif : à payer, négatif : crédit, 0 : néant`, s: 10 }], [],
      ['N°DOSSIER', 'DOSSIERS', 'TVA'].concat(Array.from({ length: cols }, (_, i) => (i < 12 ? MOIS_COURTS[i] : 'ANNÉE')), ['TOTAL']).map((v) => ({ v, s: 1 }))];
    withAmt.forEach((c) => {
      const row = grid.get(c.id);
      const vals = Array.from({ length: cols }, (_, i) => { const m = row[i + 1]; return hasTvaAmount(m) && tvaNetSet(m) ? m.tvaNet : null; });
      arows.push([{ v: c.code || '', s: 2 }, { v: c.nom || '', s: 2 }, { v: tvaShort(c.regimeTva), s: 2 }]
        .concat(vals.map((v) => ({ v: v === null ? '' : v, s: v === null ? 2 : 8 })), [{ v: Math.round(vals.reduce((t, v) => t + (v || 0), 0) * 100) / 100, s: 9 }]));
    });
    sheets.push({ name: 'Montants TVA', rows: arows, widths: [11, 44, 7].concat(Array(cols).fill(12), [13]), freeze: { row: 3, col: 2 } });
  }
  const blob = XlsxWriter.build({ sheets });
  download(`suivi-${norm(tplName(ui.grille.type)).replace(/[^a-z0-9]+/g, '-')}-${year}.xlsx`, blob, blob.type);
}

// Case de la grille : OK, ou l'étape atteinte (« Saisie 2/6 »), avec la liste des étapes en info-bulle.
function grilleCellView(m, mode) {
  let cls = 'g-todo', html = '·';
  const n = m.etapes.length;
  const done = m.etapes.filter((e) => e.done).length;
  if (!isOpen(m)) { cls = 'g-ok'; html = 'OK'; }
  else {
    cls = isLate(m) ? 'g-late' : m.statut === 'attente_client' ? 'g-wait' : done || m.statut !== 'a_faire' ? 'g-progress' : 'g-todo';
    if (done && n) html = `<span class="g-step">${esc(stepReached(m))}</span><span class="g-frac">${done}/${n}</span>`;
    else html = isLate(m) ? '!' : m.statut === 'attente_client' ? 'Att.' : m.statut !== 'a_faire' ? 'En cours' : '·';
  }
  const amt = hasTvaAmount(m) && tvaNetSet(m);
  if (amt) html += `<span class="g-amt${m.tvaNet < 0 ? ' cred' : ''}">${esc(tvaNetLabel(m, true))}</span>`;
  const hint = mode === 'pointage' ? `Cliquer pour ${isOpen(m) ? 'pointer OK' : 'annuler'}` : mode === 'etapes' ? 'Cliquer pour choisir l\'étape atteinte' : 'Cliquer pour ouvrir la mission';
  const title = [`${m.titre} — ${STATUTS[m.statut]}${m.echeance ? ' — échéance ' + fmtDate(m.echeance) : ''}`]
    .concat(amt ? [`Montant déclaré — ${tvaNetLabel(m)}`] : [], m.etapes.map((e) => `${e.done ? '✓' : '○'} ${e.label}`), [hint]).join('\n');
  return { cls, html, title };
}
const grilleMode = () => data.settings.grilleMode || (data.settings.pointage ? 'pointage' : 'etapes');
const GRILLE_ACTIONS = { etapes: 'grille-steps', pointage: 'grille-toggle', fiche: 'open-mission' };

// Pointage : mise à jour de la seule case et du total de sa colonne, sans redessiner la grille.
function updateGrilleCell(m) {
  const td = $(`.grille td[data-id="${m.id}"]`);
  if (!td) return refresh();
  const v = grilleCellView(m, grilleMode());
  td.className = v.cls + (hasTvaAmount(m) && tvaNetSet(m) ? ' g-has-amt' : '');
  td.innerHTML = v.html;
  td.title = v.title;
  const col = td.dataset.col;
  const cells = $$(`.grille tbody td[data-col="${col}"]`);
  const foot = $$('.grille tfoot td')[Number(col) + 2];
  if (foot) foot.textContent = `${cells.filter((c) => c.classList.contains('g-ok')).length}/${cells.length}`;
}

// Choix de l'étape atteinte, sous la case cliquée.
function closeGrillePop() {
  const pop = $('#grille-pop');
  if (pop) pop.remove();
}

function openGrillePop(td, m, focusI) {
  closeGrillePop();
  if (!m) return;
  const c = clientById(m.clientId);
  const k = lastDoneIndex(m) + 1;
  const pop = document.createElement('div');
  pop.id = 'grille-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', `Étapes — ${m.titre}`);
  pop.dataset.id = m.id;
  const n = m.etapes.length, nd = m.etapes.filter((e) => e.done).length;
  // Demande de pièces du même mois en cours (issue de l'analyse FEC mensuelle).
  const per = (m.exercice || '').match(/^(\d{2})\/(\d{4})$/);
  const req = per && missionsOf(m.clientId).find((x) => isOpen(x) && x.demandePieces && x.demandePieces.mode === 'mois' && x.demandePieces.arrete.slice(0, 7) === `${per[2]}-${per[1]}`);
  const reqLeft = req ? req.etapes.filter((e) => !e.done).length : 0;
  pop.innerHTML = `<div class="gp-head"><div><strong>${esc(c ? clientLabel(c) : '')}</strong><span class="muted small">${esc(m.titre)}${m.echeance ? ` · échéance ${fmtDate(m.echeance)}` : ''}</span>
      <span class="gp-state ${isOpen(m) ? '' : 'ok'}">${isOpen(m) ? `${nd} / ${n} étape(s) faite(s)` : 'Terminée'}</span></div>
      <button class="icon-btn gp-close" data-action="grille-pop-close" title="Fermer (Échap)" aria-label="Fermer">✕</button></div>
    ${m.etapes.length ? `<ol class="gp-steps">${m.etapes.map((e, i) => { const [ga, gb] = stepGroup(m.etapes, i); return `<li class="${ga !== gb ? 'gp-par' : ''}"><button class="${e.done ? 'done' : ''}${i + 1 === k ? ' current' : ''}" data-action="grille-step" data-id="${m.id}" data-i="${i}" aria-pressed="${e.done}"><span aria-hidden="true">${e.done ? '✓' : i + 1}</span>${esc(e.label)}</button></li>`; }).join('')}</ol>
      <p class="muted small">Un clic coche l'étape et celles qui la précèdent ; un second clic la décoche. Banque, ventes et achats (repère bleu) se cochent indépendamment, dans l'ordre où vous les faites ; « Banque affectée » coche aussi « Banque importée ». La dernière étape termine la mission. La fenêtre reste ouverte : fermez-la avec ✕, Échap ou un clic à côté.</p>`
      : `<div class="gp-foot"><button class="btn small primary" data-action="grille-step" data-id="${m.id}" data-i="all">Marquer terminée</button></div>`}
    ${req ? `<p class="gp-req small">Demande de pièces en cours : <strong>${reqLeft} pièce(s) attendue(s)</strong>${lastRelance(req) ? `, demandée(s) le ${fmtDate(lastRelance(req).slice(0, 10))}` : ''}. <button class="link-btn" data-action="open-mission" data-id="${req.id}">Voir la demande</button></p>` : ''}
    ${tvaAmountField(m)}
    <div class="gp-foot">
      <button class="btn small" data-action="grille-step" data-id="${m.id}" data-i="-1">Remettre à faire</button>
      <button class="btn small" data-action="open-mission" data-id="${m.id}">Ouvrir la mission</button>
    </div>`;
  document.body.appendChild(pop);
  const r = td.getBoundingClientRect();
  const w = pop.offsetWidth;
  pop.style.left = Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - w - 8)) + 'px';
  const below = r.bottom + pop.offsetHeight + 8 <= window.innerHeight;
  pop.style.top = (below ? r.bottom + window.scrollY + 4 : Math.max(window.scrollY + 8, r.top + window.scrollY - pop.offsetHeight - 4)) + 'px';
  const first = (focusI !== undefined && $(`.gp-steps button[data-i="${focusI}"]`, pop)) || $('.gp-steps button.current', pop) || $('.gp-steps button', pop) || $('button', pop);
  if (first) first.focus();
}

// Clic sur l'étape i : cochée avec les étapes qui la précèdent (hors saisies parallèles), ou décochée avec celles qui suivent.
// i = -1 : tout décocher ; i = 'all' : mission sans étapes à terminer. Statut ajusté (à faire, en cours, terminée).
function setGrilleStep(m, i) {
  if (!m) return;
  const et = m.etapes;
  const count = data.missions.length;
  const check = (e) => { if (!e.done) Object.assign(e, { done: true, doneAt: nowIso() }); };
  const uncheck = (e) => { if (e.done) { Object.assign(e, { done: false, doneAt: null }); delete e.auto; } };
  let msg;
  if (i === -1) { et.forEach(uncheck); msg = 'à faire'; }
  else if (i === 'all' || !et[i]) { et.forEach(check); msg = 'terminée'; }
  else {
    const [ga, gb] = stepGroup(et, i);
    const before = (j) => j < ga || (j >= ga && j < i && sameKind(et, j, i)); // prérequis de l'étape i
    const after = (j) => j > gb || (j > i && j <= gb && sameKind(et, j, i)); // étapes qui dépendent de l'étape i
    if (!isOpen(m)) {
      // Mission terminée : on revient à l'étape choisie (elle et ses prérequis restent cochés, le reste est décoché).
      et.forEach((e, j) => (j === i || before(j) ? check(e) : uncheck(e)));
      msg = `revenue à « ${et[i].label} »`;
    } else if (et[i].done) {
      et.forEach((e, j) => { if (j === i || after(j)) uncheck(e); });
      msg = `${et[i].label} décochée`;
    } else {
      et.forEach((e, j) => { if (j === i || before(j)) check(e); });
      msg = `${et[i].label} faite`;
    }
  }
  const done = et.filter((e) => e.done).length;
  const target = (et.length ? done === et.length : i === 'all') ? 'termine' : done === 0 ? 'a_faire' : 'en_cours';
  setStatus(m, target);
  m.updatedAt = nowIso();
  persist();
  const c = clientById(m.clientId);
  toast(`${clientLabel(c)} — ${m.titre} : ${target === 'termine' ? 'terminée' : `${msg}${et.length ? ` (${done}/${et.length})` : ''}`}`);
  if (data.missions.length !== count) refresh();
  else updateGrilleCell(m);
  // Fenêtre conservée, mise à jour sur la case (redessinée si la grille a changé).
  const td = $(`.grille td[data-id="${m.id}"]`);
  if (td) openGrillePop(td, m, i === 'all' ? undefined : i);
  else closeGrillePop();
}

function viewGrille() {
  const { g, year, grid, years, base, clients, resps, regimeOptions, cols, sort } = grilleModel();
  const mode = grilleMode();
  const totals = Array.from({ length: cols }, () => ({ done: 0, all: 0 }));

  const cell = (m, col) => {
    if (!m) return '<td class="g-none"></td>';
    totals[col - 1].all++;
    if (!isOpen(m)) totals[col - 1].done++;
    const v = grilleCellView(m, mode);
    return `<td class="${v.cls}${hasTvaAmount(m) && tvaNetSet(m) ? ' g-has-amt' : ''}" data-action="${GRILLE_ACTIONS[mode]}" data-id="${m.id}" data-col="${col}" role="button" tabindex="0" title="${esc(v.title)}">${v.html}</td>`;
  };

  const body = clients.map((c) => {
    const row = grid.get(c.id);
    return `<tr>
      <td class="g-code">${esc(c.code)}</td>
      <th class="g-name" scope="row"><a href="#/dossier/${c.id}">${esc(clientLabel(c))}</a></th>
      <td class="g-meta">${esc(tvaShort(c.regimeTva))}</td>
      <td class="g-meta">${esc(c.jourTva)}</td>
      ${Array.from({ length: cols }, (_, i) => cell(row[i + 1], i + 1)).join('')}
    </tr>`;
  }).join('');

  return `
    <div class="page-head"><h1>Suivi mensuel</h1>
      <div class="head-actions">
        <button class="btn" data-action="open-cal">${icon('calendar')}Calendrier fiscal</button>
        <button class="btn" data-action="import-sheet">Importer</button>
        <button class="btn" data-action="export-grille"${clients.length ? '' : ' disabled'}>Exporter en Excel</button>
      </div>
    </div>
    <div class="filters">
      <select data-grille="type" aria-label="Type de mission">${options(Object.fromEntries(data.templates.map((t) => [t.id, t.nom])), g.type)}</select>
      <select data-grille="annee" aria-label="Année">${options(Array.from(years).sort().map(String), String(year))}</select>
      <select data-grille="regime" aria-label="Régime de TVA">${options(regimeOptions, g.regime)}</select>
      <select data-grille="resp" aria-label="Portefeuille">${options(resps, g.resp, 'Tous les portefeuilles')}</select>
      <label class="inline-label">Trier par <select data-grille-sort aria-label="Trier les dossiers">${options(GRILLE_TRIS, sort.key)}</select></label>
      <button class="btn small" data-action="grille-sort" data-key="${sort.key}" title="Inverser l'ordre">${sort.dir > 0 ? '↑ Croissant' : '↓ Décroissant'}</button>
      <div class="seg" role="group" aria-label="Mode de clic">
        <button class="${mode === 'etapes' ? 'on' : ''}" data-action="grille-mode" data-mode="etapes" title="Un clic affiche les étapes : choisissez celle qui est atteinte">Étapes</button>
        <button class="${mode === 'pointage' ? 'on' : ''}" data-action="grille-mode" data-mode="pointage" title="Un clic pointe la case OK">Pointage rapide</button>
        <button class="${mode === 'fiche' ? 'on' : ''}" data-action="grille-mode" data-mode="fiche" title="Un clic ouvre la mission">Ouvrir</button>
      </div>
      <span class="legend"><span class="g-ok">OK</span> terminée <span class="g-progress g-leg"><span class="g-step">Ventes</span><span class="g-frac">4/9</span></span> étape atteinte <span class="g-late">!</span> en retard <span class="g-wait">Att.</span> attente client <span class="g-todo">·</span> à faire</span>
    </div>
    ${clients.length ? `
    <div class="grid-wrap card flush">
      <table class="grille">
        <thead><tr>${[['code', 'N°', '', 'N° de dossier'], ['nom', 'Dossier', 'g-name', 'Nom du dossier'], ['tva', 'TVA', '', 'Régime de TVA'], ['jour', 'Jour', '', 'Jour limite de dépôt']].map(([k, l, cls, t]) => `<th class="${cls} g-sort${sort.key === k ? ' on' : ''}" data-action="grille-sort" data-key="${k}" role="button" tabindex="0" title="Trier par ${t.toLowerCase()}" aria-sort="${sort.key === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}">${l}${sort.key === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}${MOIS_COURTS.map((m) => `<th>${m}</th>`).join('')}${cols === 13 ? '<th title="Déclaration annuelle de l\'exercice">Année</th>' : ''}</tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td class="g-code"></td><th class="g-name">Terminées</th><td class="g-meta"></td><td class="g-meta"></td>${totals.map((t) => `<td>${t.all ? `${t.done}/${t.all}` : ''}</td>`).join('')}</tr></tfoot>
      </table>
    </div>
    <p class="muted small">${clients.length} dossier${clients.length > 1 ? 's' : ''}, triés par ${esc(GRILLE_TRIS[sort.key].toLowerCase())}${sort.dir > 0 ? '' : ' (ordre inverse)'} — cliquez sur un titre de colonne pour trier. ${mode === 'pointage' ? '<strong>Pointage rapide :</strong> un clic sur une case la passe à OK, un second clic annule.' : mode === 'etapes' ? '<strong>Étapes :</strong> un clic sur une case affiche les étapes de la mission ; cochez celle qui est faite (les précédentes le sont aussi ; banque importée, banque affectée, saisie des ventes et saisie des achats se cochent séparément ; la dernière étape termine la mission).' : 'Cliquez sur une case pour ouvrir la mission.'} Les missions mensuelles (« MM/AAAA »), trimestrielles (« T1 AAAA ») et annuelles (« AAAA ») de l'année choisie apparaissent ici.</p>`
    : base.length
      ? emptyState(`Aucun dossier « ${esc(REGIME_FILTRES[g.regime])} » pour ces critères.`, '<button class="btn" data-action="grille-reset">Afficher tous les régimes</button>')
      : emptyState(`Aucune mission « ${esc((templateById(g.type) || {}).nom || '')} » pour ${year}.`, `<button class="btn primary" data-action="import-sheet">Importer mon tableau Excel</button>`)}`;
}
