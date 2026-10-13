/*
 * Suivi Dossiers — Notes : procédures, particularités de dossier, listes d'étapes à cocher.
 * Une note est rattachée à un dossier ou non (note générale) et rangée dans un groupe libre.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

const NOTES_TRIS = { groupe: 'Groupe', dossier: 'Dossier', date: 'Date' };
const notesTri = () => (NOTES_TRIS[data.settings.notesTri] ? data.settings.notesTri : 'groupe');
ui.notes = { q: '', groupe: '', dossier: '' };

const noteById = (id) => data.notes.find((n) => n.id === id);
const noteGroups = () => Array.from(new Set(data.notes.map((n) => n.groupe).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
// Épinglées d'abord, puis par titre.
const noteOrder = (a, b) => (b.epingle ? 1 : 0) - (a.epingle ? 1 : 0) || (a.titre || '').localeCompare(b.titre || '', 'fr', { numeric: true });
const clientNotes = (clientId) => data.notes.filter((n) => n.clientId === clientId).sort(noteOrder);

function noteProgress(n) {
  const done = n.etapes.filter((e) => e.done).length;
  return { done, total: n.etapes.length, p: n.etapes.length ? Math.round((done * 100) / n.etapes.length) : 0 };
}

// Options d'une liste déroulante à partir de paires [valeur, libellé] (ordre conservé).
const noteOptions = (pairs, selected) => pairs.map(([v, l]) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(l)}</option>`).join('');

function viewNotes() {
  const f = ui.notes;
  const tri = notesTri();
  const groups = noteGroups();
  if (f.groupe && f.groupe !== '__none' && !groups.includes(f.groupe)) f.groupe = '';
  const withNotes = data.clients.filter((c) => data.notes.some((n) => n.clientId === c.id)).sort((a, b) => clientLabel(a).localeCompare(clientLabel(b), 'fr'));
  if (f.dossier && f.dossier !== '__none' && !withNotes.some((c) => c.id === f.dossier)) f.dossier = '';
  return `
    <div class="page-head"><h1>Notes</h1>
      <div class="head-actions">
        <button class="btn primary" data-action="note-new">${icon('plus')}Nouvelle note</button>
      </div>
    </div>
    <div class="filters">
      <input type="search" placeholder="Rechercher (titre, texte, étapes, dossier…)" data-notes="q" value="${esc(f.q)}" spellcheck="false" autocomplete="off">
      <select data-notes="groupe" aria-label="Groupe">${noteOptions([['', 'Tous les groupes']].concat(groups.map((g) => [g, g]), [['__none', 'Sans groupe']]), f.groupe)}</select>
      <select data-notes="dossier" aria-label="Dossier">${noteOptions([['', 'Tous les dossiers'], ['__none', 'Notes générales (hors dossier)']].concat(withNotes.map((c) => [c.id, clientLabel(c)])), f.dossier)}</select>
      <span class="inline-label">Classer par
        <span class="seg" role="group" aria-label="Classer les notes">${Object.entries(NOTES_TRIS).map(([k, l]) => `<button class="${tri === k ? 'on' : ''}" data-action="notes-tri" data-tri="${k}" aria-pressed="${tri === k}">${l}</button>`).join('')}</span>
      </span>
    </div>
    <div id="note-list"></div>`;
}

function renderNoteList() {
  const el = $('#note-list');
  if (!el) return;
  if (!data.notes.length) {
    el.innerHTML = emptyState('Aucune note pour le moment. Notez une particularité de dossier, une procédure (clôture, import d\'un logiciel à un autre…) ou une liste d\'étapes à suivre pour ne rien oublier.',
      `<button class="btn primary" data-action="note-new">${icon('plus')}Nouvelle note</button>`);
    return;
  }
  const f = ui.notes;
  const q = norm(f.q);
  const tri = notesTri();
  const list = data.notes
    .filter((n) => !f.groupe || (f.groupe === '__none' ? !n.groupe : n.groupe === f.groupe))
    .filter((n) => !f.dossier || (f.dossier === '__none' ? !n.clientId : n.clientId === f.dossier))
    .filter((n) => {
      if (!q) return true;
      const c = n.clientId ? clientById(n.clientId) : null;
      return norm([n.titre, n.texte, n.groupe, c ? c.nom : '', c ? c.code : ''].concat(n.etapes.map((e) => e.label)).join(' ')).includes(q);
    });
  if (!list.length) {
    el.innerHTML = emptyState('Aucune note ne correspond à ces critères.', '<button class="btn" data-action="notes-reset">Afficher toutes les notes</button>');
    return;
  }
  if (tri === 'date') {
    list.sort((a, b) => (b.epingle ? 1 : 0) - (a.epingle ? 1 : 0) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    el.innerHTML = `<div class="cards">${list.map((n) => noteCard(n, true, true)).join('')}</div>`;
    applyWidths(el);
    return;
  }
  // Une section par groupe (« Sans groupe » en dernier) ou par dossier (notes générales en premier).
  const byDossier = tri === 'dossier';
  const sections = new Map();
  list.forEach((n) => {
    const k = (byDossier ? n.clientId : n.groupe) || '';
    if (!sections.has(k)) sections.set(k, []);
    sections.get(k).push(n);
  });
  const label = (k) => (byDossier ? (k ? clientLabel(clientById(k)) : 'Notes générales (hors dossier)') : k || 'Sans groupe');
  const keys = Array.from(sections.keys()).sort((a, b) => (byDossier ? (a ? 1 : 0) - (b ? 1 : 0) : (a ? 0 : 1) - (b ? 0 : 1)) || label(a).localeCompare(label(b), 'fr', { numeric: true }));
  el.innerHTML = keys.map((k) => `
    <section class="note-group">
      <h2>${esc(label(k))} <span class="count">${sections.get(k).length}</span>${byDossier && k && clientById(k) ? ` <a class="link-btn small" href="#/dossier/${k}">Voir le dossier</a>` : ''}</h2>
      <div class="cards">${sections.get(k).sort(noteOrder).map((n) => noteCard(n, !byDossier, byDossier)).join('')}</div>
    </section>`).join('');
  applyWidths(el);
}

// Carte d'une note : titre, dossier et groupe (selon le classement), début du texte, avancement des étapes.
function noteCard(n, showClient, showGroup) {
  const c = n.clientId ? clientById(n.clientId) : null;
  const { done, total, p } = noteProgress(n);
  const extrait = data.settings.discret ? '<span class="masked">Masqué</span>' : esc(n.texte || n.etapes.map((e) => e.label).join(' · '));
  const meta = [
    showClient ? `<span class="ncard-client">${esc(c ? clientLabel(c) : 'Note générale')}</span>` : '',
    showGroup && n.groupe ? `<span class="badge">${esc(n.groupe)}</span>` : '',
    n.epingle ? '<span class="badge pin">Épinglée</span>' : '',
  ].filter(Boolean).join('');
  return `
    <div class="ncard" data-action="note-open" data-id="${n.id}" role="button" tabindex="0">
      <strong class="ncard-title">${esc(n.titre)}</strong>
      ${meta ? `<div class="ncard-meta">${meta}</div>` : ''}
      ${extrait ? `<div class="ncard-text">${extrait}</div>` : ''}
      ${total ? `<div class="prog">${bar(p)}<span class="pct">${done}/${total}</span></div>` : ''}
      <div class="muted small">Modifiée le ${fmtDate((n.updatedAt || n.createdAt || '').slice(0, 10))}</div>
    </div>`;
}

// Section « Notes » de la fiche dossier.
function dossierNotes(c) {
  const list = clientNotes(c.id);
  return `
    <section class="card">
      <h2>Notes <span class="count">${list.length}</span><span class="spacer"></span><button class="btn small" data-action="note-new" data-client="${c.id}">${icon('plus')}Note</button></h2>
      ${list.length ? `<div class="mlist">${list.map((n) => {
        const { done, total } = noteProgress(n);
        return `<div class="mrow" data-action="note-open" data-id="${n.id}" role="button" tabindex="0">
          <div class="mrow-main"><div class="mrow-title">${esc(n.titre)}</div>
            <div class="mrow-meta">${n.groupe ? `<span class="badge">${esc(n.groupe)}</span>` : ''}${n.epingle ? '<span class="badge pin">Épinglée</span>' : ''}${total ? `<span class="muted">${done}/${total} étapes</span>` : ''}</div></div>
        </div>`;
      }).join('')}</div>` : '<p class="muted">Aucune note. Notez ici les particularités du dossier ou les étapes à suivre pour ne rien oublier.</p>'}
    </section>`;
}

function noteSheet(id) {
  const n = noteById(id);
  if (!n) return closeModal();
  const c = n.clientId ? clientById(n.clientId) : null;
  const { done, total, p } = noteProgress(n);
  const discret = data.settings.discret;
  openModal(`
    <div class="sheet">
      <header class="modal-head">
        <div><div class="muted small">${esc([c ? clientLabel(c) : 'Note générale', n.groupe].filter(Boolean).join(' · '))}</div><h2>${esc(n.titre)}</h2></div>
        <button type="button" class="icon-btn" data-action="close-modal" aria-label="Fermer">✕</button>
      </header>
      <div class="modal-body">
        ${n.texte ? `<div class="notes note-text">${discret ? '<span class="masked">Masqué</span>' : esc(n.texte)}</div>` : ''}
        ${total ? `<div class="prog big">${bar(p)}<span class="pct">${done}/${total}</span></div>
        <ul class="steps">${n.etapes.map((e) => `
          <li><label class="check"><input type="checkbox" data-action="note-step" data-note="${n.id}" data-step="${e.id}"${e.done ? ' checked' : ''}>
            <span>${esc(e.label)}${e.done && e.doneAt ? `<small class="muted"> — ${fmtDateTime(e.doneAt)}</small>` : ''}</span></label></li>`).join('')}</ul>` : ''}
        ${!n.texte && !total ? '<p class="muted">Note vide : cliquez sur « Modifier » pour la compléter.</p>' : ''}
        <p class="muted small">Créée le ${fmtDateTime(n.createdAt)}${n.updatedAt && n.updatedAt !== n.createdAt ? ` · modifiée le ${fmtDateTime(n.updatedAt)}` : ''}</p>
      </div>
      <footer class="modal-foot">
        <button class="btn danger" data-action="note-delete" data-id="${n.id}">Supprimer</button>
        <span class="spacer"></span>
        ${done ? `<button class="btn" data-action="note-reset" data-id="${n.id}" title="Décocher toutes les étapes pour réutiliser la liste">Tout décocher</button>` : ''}
        <button class="btn" data-action="note-copy" data-id="${n.id}" title="Nouvelle note reprenant celle-ci (pour un autre dossier, un autre exercice…)">Dupliquer</button>
        ${c ? `<a class="btn" href="#/dossier/${c.id}" data-action="close-modal">Voir le dossier</a>` : ''}
        <button class="btn primary" data-action="note-edit" data-id="${n.id}">Modifier</button>
      </footer>
    </div>`);
  modalRefresh = () => noteSheet(id);
}

// Cadre d'une étape dans le formulaire. L'identifiant conserve la coche quand le libellé est modifié (pas pour une copie).
function noteStepRow(e, copy) {
  return `<li class="step-row">
    <input name="etape" value="${esc(e.label || '')}" maxlength="300" placeholder="Décrire l'étape (ex. Importer le fichier Excel des factures)" aria-label="Étape"${e.id && !copy ? ` data-step-id="${e.id}"` : ''}>
    <button type="button" class="icon-btn" data-action="note-step-move" data-dir="-1" title="Monter l'étape" aria-label="Monter l'étape">↑</button>
    <button type="button" class="icon-btn" data-action="note-step-move" data-dir="1" title="Descendre l'étape" aria-label="Descendre l'étape">↓</button>
    <button type="button" class="icon-btn" data-action="note-step-del" title="Supprimer l'étape" aria-label="Supprimer l'étape">✕</button>
  </li>`;
}

// Ajoute un cadre d'étape (après `after`, sinon à la fin) et y place le curseur.
function addNoteStep(list, after) {
  const tpl = document.createElement('template');
  tpl.innerHTML = noteStepRow({}).trim();
  const li = tpl.content.firstChild;
  if (after) after.after(li);
  else list.appendChild(li);
  $('input', li).focus();
}

// Création (n absent), modification, ou copie d'une note existante (copy : nouvelle note aux étapes décochées).
function noteForm(n, presetClient, copy) {
  const isNew = !n || copy;
  const src = n || { titre: '', texte: '', groupe: ui.notes.groupe && ui.notes.groupe !== '__none' ? ui.notes.groupe : '', clientId: presetClient || '', etapes: [], epingle: false };
  const clients = data.clients.filter((c) => !c.archive || c.id === src.clientId).sort((a, b) => clientLabel(a).localeCompare(clientLabel(b), 'fr'));
  modalRefresh = null;
  openModal(`
    <form data-form="note" data-id="${isNew ? '' : n.id}" autocomplete="off" spellcheck="false">
      <header class="modal-head"><h2>${copy ? 'Dupliquer la note' : isNew ? 'Nouvelle note' : 'Modifier la note'}</h2><button type="button" class="icon-btn" data-action="close-modal" aria-label="Fermer">✕</button></header>
      <div class="modal-body">
        <div class="form-grid">
          <label class="span2">Titre *<input name="titre" required maxlength="200" value="${esc(copy ? `${src.titre} (copie)` : src.titre)}" placeholder="ex. Clôture — étapes à suivre"></label>
          <label>Dossier<select name="clientId"><option value="">— Aucun (note générale) —</option>${clients.map((c) => `<option value="${c.id}"${c.id === src.clientId ? ' selected' : ''}>${esc(clientLabel(c))}</option>`).join('')}</select></label>
          <label>Groupe<input name="groupe" list="note-groups" maxlength="80" value="${esc(src.groupe)}" placeholder="ex. Procédures, Clôtures, Imports…"></label>
        </div>
        <label>Texte<textarea name="texte" rows="6" placeholder="Particularités, explications, rappels…">${esc(src.texte)}</textarea></label>
        <fieldset class="step-edit">
          <legend>Étapes à cocher <span class="muted small">(facultatif)</span></legend>
          <ol data-step-list>${(src.etapes.length ? src.etapes : [{}]).map((e) => noteStepRow(e, copy)).join('')}</ol>
          <button type="button" class="btn small" data-action="note-step-add">${icon('plus')}Ajouter une étape</button>
          <p class="muted small">Entrée dans une étape en ajoute une nouvelle juste en dessous. Les étapes laissées vides sont ignorées.</p>
        </fieldset>
        <label class="check"><input type="checkbox" name="epingle"${src.epingle ? ' checked' : ''}><span>Épingler la note (affichée en premier dans son groupe et sur la fiche du dossier)</span></label>
        <p class="muted small">Le groupe sert à classer les notes : choisissez un groupe existant ou tapez un nouveau nom. Une note sans dossier est une note générale.</p>
        <datalist id="note-groups">${noteGroups().map((g) => `<option value="${esc(g)}">`).join('')}</datalist>
      </div>
      <footer class="modal-foot"><button type="button" class="btn" data-action="close-modal">Annuler</button><button class="btn primary" type="submit">Enregistrer</button></footer>
    </form>`);
}
