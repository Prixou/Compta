/*
 * Suivi Dossiers — Missions : liste, fiche, formulaire.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

function viewMissions() {
  const f = ui.mf;
  const resps = allResps();
  return `
    <div class="page-head"><h1>Missions</h1>
      <div class="head-actions"><button class="btn" data-action="open-cal">${icon('calendar')}Calendrier fiscal</button><button class="btn primary" data-action="new-mission">${icon('plus')}Nouvelle mission</button></div>
    </div>
    <div class="filters">
      <input type="search" placeholder="Rechercher…" data-filter="mf.q" value="${esc(f.q)}" spellcheck="false" autocomplete="off">
      <select data-filter="mf.statut" aria-label="Statut">${options(Object.assign({ ouvertes: 'Non terminées', toutes: 'Tous statuts' }, STATUTS), f.statut)}</select>
      <select data-filter="mf.periode" aria-label="Échéance">${options({ toutes: 'Toutes échéances', retard: 'En retard', '7': '7 prochains jours', '30': '30 prochains jours', mois: 'Ce mois-ci' }, f.periode)}</select>
      <select data-filter="mf.type" aria-label="Type">${options(Object.fromEntries(data.templates.map((t) => [t.id, t.nom])), f.type, 'Tous types')}</select>
      <select data-filter="mf.resp" aria-label="Portefeuille">${options(resps, f.resp, 'Tous les portefeuilles')}</select>
    </div>
    <div id="mission-list"></div>`;
}

function renderMissionList() {
  const el = $('#mission-list');
  if (!el) return;
  const f = ui.mf;
  const q = norm(f.q);
  const month = todayStr().slice(0, 7);
  const list = data.missions.filter((m) => {
    const c = clientById(m.clientId);
    if (!c) return false;
    if (f.statut === 'ouvertes' ? !isOpen(m) : f.statut !== 'toutes' && m.statut !== f.statut) return false;
    if (f.type && m.type !== f.type) return false;
    if (f.resp && !missionInPortfolio(m, f.resp)) return false;
    if (f.periode === 'retard' && !isLate(m)) return false;
    if ((f.periode === '7' || f.periode === '30') && !(m.echeance && daysUntil(m.echeance) >= 0 && daysUntil(m.echeance) <= Number(f.periode))) return false;
    if (f.periode === 'mois' && !(m.echeance || '').startsWith(month)) return false;
    if (q && !norm([m.titre, m.exercice, clientLabel(c), c.code, m.responsable].join(' ')).includes(q)) return false;
    return true;
  }).sort(byDue);
  const limit = ui.mfLimit || 300;
  el.innerHTML = list.length
    ? `<p class="muted small">${list.length} mission${list.length > 1 ? 's' : ''}</p><div class="mlist card flush">${list.slice(0, limit).map((m) => missionRow(m, true)).join('')}</div>
      ${list.length > limit ? `<button class="btn block more-btn" data-action="missions-more">Afficher ${Math.min(300, list.length - limit)} mission(s) de plus (${list.length - limit} restante(s))</button>` : ''}`
    : emptyState(data.clients.length ? 'Aucune mission ne correspond aux filtres.' : "Créez d'abord un dossier pour pouvoir y rattacher des missions.");
  applyWidths(el);
}

let modalRefresh = null;

function missionSheet(id) {
  const m = missionById(id);
  if (!m) return;
  const c = clientById(m.clientId);
  const p = progress(m);
  openModal(`
    <div class="sheet">
      <header class="modal-head">
        <div><div class="muted small">${esc(clientLabel(c))}${m.exercice ? ' · ' + esc(m.exercice) : ''}</div><h2>${esc(m.titre)}</h2></div>
        <button type="button" class="icon-btn" data-action="close-modal" aria-label="Fermer">✕</button>
      </header>
      <div class="modal-body">
        <div class="sheet-top">
          <label>Statut<select data-action-change="mission-status" data-id="${m.id}">${options(STATUTS, m.statut)}</select></label>
          <div><div class="muted small">Échéance</div>${dueBadge(m)}${m.echeance && isOpen(m) && daysUntil(m.echeance) <= 7 ? `<div class="muted small">${fmtDate(m.echeance)}</div>` : ''}</div>
          <div><div class="muted small">Responsable</div>${esc(m.responsable || '—')}</div>
          <div><div class="muted small">Récurrence</div>${esc(RECURRENCES[m.recurrence] || 'Aucune')}</div>
        </div>
        ${m.relances && m.relances.length ? `<p class="muted small">Client relancé ${m.relances.length} fois, dernière fois le ${fmtDate(lastRelance(m).slice(0, 10))}.${relanceDue(m) ? ' <strong class="late">Nouvelle relance conseillée.</strong>' : ''}</p>` : m.statut === 'attente_client' && m.attenteDepuis ? `<p class="muted small">En attente du client depuis le ${fmtDate(m.attenteDepuis)}.</p>` : ''}
        <div class="prog big">${bar(p)}<span class="pct">${p} %</span></div>
        ${m.etapes.length ? `<ul class="steps">${m.etapes.map((e) => `
          <li><label class="check"><input type="checkbox" data-action="toggle-step" data-mission="${m.id}" data-step="${e.id}"${e.done ? ' checked' : ''}>
            <span>${esc(e.label)}${e.done && e.doneAt ? `<small class="muted"> — ${fmtDateTime(e.doneAt)}${e.auto ? ` · automatique (${esc(e.auto)})` : ''}</small>` : ''}</span></label></li>`).join('')}</ul>`
          : '<p class="muted">Aucune étape définie. Utilisez le statut pour suivre l\'avancement, ou ajoutez des étapes via « Modifier ».</p>'}
        ${m.notes ? `<h3>Notes</h3><div class="notes">${data.settings.discret ? '<span class="masked">Masqué</span>' : esc(m.notes)}</div>` : ''}
      </div>
      <footer class="modal-foot">
        <button class="btn danger" data-action="delete-mission" data-id="${m.id}">Supprimer</button>
        <span class="spacer"></span>
        ${c && isOpen(m) ? `<button class="btn" data-action="open-msg" data-client="${c.id}" data-mission="${m.id}">${icon('mail')}Écrire au client</button>` : ''}
        ${c ? `<a class="btn" href="#/dossier/${c.id}" data-action="close-modal">Voir le dossier</a>` : ''}
        <button class="btn" data-action="edit-mission" data-id="${m.id}">Modifier</button>
        ${isOpen(m) ? `<button class="btn primary" data-action="complete-mission" data-id="${m.id}">✓ Terminée</button>` : ''}
      </footer>
    </div>`);
  modalRefresh = () => missionSheet(id);
}

function missionForm(m, presetClient) {
  const isNew = !m;
  const clients = data.clients.filter((c) => !c.archive || (m && c.id === m.clientId)).sort((a, b) => clientLabel(a).localeCompare(clientLabel(b), 'fr'));
  if (!clients.length) {
    toast("Créez d'abord un dossier.", true);
    return clientForm();
  }
  const tpl = data.templates[0];
  const clientId = m ? m.clientId : presetClient || '';
  m = m || {
    type: tpl.id,
    titre: '',
    exercice: '',
    echeance: '',
    statut: 'a_faire',
    priorite: 'normale',
    responsable: (clientById(clientId) || {}).responsable || data.settings.utilisateur,
    recurrence: tpl.recurrence,
    etapes: tpl.etapes.map((label) => ({ label })),
    notes: '',
  };
  if (isNew) {
    m.exercice = tpl.recurrence === 'annuelle' ? lastClosedYear(clientById(clientId)) : '';
    m.titre = `${tpl.nom}${m.exercice ? ' ' + m.exercice : ''}`;
  }
  modalRefresh = null;
  openModal(`
    <form data-form="mission" data-id="${m.id || ''}" autocomplete="off" spellcheck="false">
      <header class="modal-head"><h2>${isNew ? 'Nouvelle mission' : 'Modifier la mission'}</h2><button type="button" class="icon-btn" data-action="close-modal" aria-label="Fermer">✕</button></header>
      <div class="modal-body">
        <div class="form-grid">
          <label class="span2">Dossier *<select name="clientId" required>${clients.length > 1 && !clientId ? '<option value="">— Choisir —</option>' : ''}${clients.map((c) => `<option value="${c.id}"${c.id === clientId ? ' selected' : ''}>${esc(clientLabel(c))}</option>`).join('')}</select></label>
          ${isNew ? `<label class="span2">Modèle<select name="type">${options(Object.fromEntries(data.templates.map((t) => [t.id, t.nom])), m.type)}</select></label>` : ''}
          <label class="span2">Intitulé *<input name="titre" required value="${esc(m.titre)}"></label>
          <label>Exercice / période<input name="exercice" value="${esc(m.exercice)}" placeholder="2025, 08/2026, T3 2026…"></label>
          <label>Échéance<input type="date" name="echeance" value="${esc(m.echeance)}"></label>
          <label>Statut<select name="statut">${options(STATUTS, m.statut)}</select></label>
          <label>Priorité<select name="priorite">${options({ normale: 'Normale', haute: 'Haute' }, m.priorite)}</select></label>
          <label>Responsable<input name="responsable" list="collabs" value="${esc(m.responsable)}"></label>
          <label>Récurrence<select name="recurrence">${options(RECURRENCES, m.recurrence || 'aucune')}</select></label>
        </div>
        <label>Étapes (une par ligne)<textarea name="etapes" rows="8">${esc(m.etapes.map((e) => e.label).join('\n'))}</textarea></label>
        <p class="muted small">Récurrence : lorsque la mission est terminée, l'occurrence suivante est créée automatiquement (échéance décalée).</p>
        <label>Notes<textarea name="notes" rows="3">${esc(m.notes)}</textarea></label>
        ${collaborateursDatalist()}
      </div>
      <footer class="modal-foot"><button type="button" class="btn" data-action="close-modal">Annuler</button><button class="btn primary" type="submit">Enregistrer</button></footer>
    </form>`);
}
