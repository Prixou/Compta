/*
 * Suivi Dossiers — Dossiers : liste, fiche, formulaire.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------------------------------------------------------------------------
// Dossiers
// ---------------------------------------------------------------------------

// Activité du dossier : fixe le profil de l'analyse FEC (sinon déduit du contenu du fichier).
const ACTIVITES = { classique: 'Structure classique', pharmacie: 'Officine (pharmacie)' };

function viewDossiers() {
  const table = data.settings.dossierView === 'tableau';
  return `
    <div class="page-head"><h1>Dossiers</h1>
      <div class="head-actions">
        <button class="btn" data-action="import-sheet">Importer (Excel / CSV)</button>
        <a class="btn" href="#/portefeuille" title="Analyser en une fois les FEC de plusieurs dossiers">${icon('chart')}Portefeuille FEC</a>
        <button class="btn primary" data-action="new-client">${icon('plus')}Nouveau dossier</button>
      </div>
    </div>
    <div class="filters">
      <input type="search" placeholder="Rechercher (nom, code, SIREN, responsable…)" data-filter="qDossiers" value="${esc(ui.qDossiers)}" spellcheck="false" autocomplete="off">
      <label class="check inline"><input type="checkbox" data-filter="showArchived"${ui.showArchived ? ' checked' : ''}><span>Afficher les archivés</span></label>
      <div class="seg" role="group" aria-label="Affichage">
        <button class="${table ? '' : 'on'}" data-action="dossier-view" data-view="cartes">Cartes</button>
        <button class="${table ? 'on' : ''}" data-action="dossier-view" data-view="tableau">Tableau</button>
      </div>
    </div>
    <div id="dossier-list" class="${table ? '' : 'cards'}"></div>`;
}

function renderDossierList() {
  const el = $('#dossier-list');
  if (!el) return;
  const q = norm(ui.qDossiers);
  const list = data.clients
    .filter((c) => ui.showArchived || !c.archive)
    .filter((c) => !q || norm([c.nom, c.code, c.siren, c.responsable, c.collaborateur, c.superviseur, c.forme].join(' ')).includes(q))
    .sort((a, b) => data.settings.dossierView === 'tableau'
      ? (a.code || '').localeCompare(b.code || '', 'fr', { numeric: true })
      : clientLabel(a).localeCompare(clientLabel(b), 'fr'));
  if (!list.length) {
    el.innerHTML = emptyState(data.clients.length ? 'Aucun dossier ne correspond à la recherche.' : 'Aucun dossier pour le moment.',
      data.clients.length ? '' : `<button class="btn primary" data-action="new-client">${icon('plus')}Nouveau dossier</button>`);
    return;
  }
  if (data.settings.dossierView === 'tableau') {
    el.innerHTML = `<div class="grid-wrap card flush"><table class="dtable">
      <thead><tr><th>N°</th><th>Forme</th><th>Dossier</th><th>TVA</th><th>Clôture</th><th>Responsable</th><th>En cours</th><th>Retard</th><th>Avancement</th></tr></thead>
      <tbody>${list.map((c) => {
        const open = missionsOf(c.id).filter(isOpen);
        const late = open.filter(isLate).length;
        const p = open.length ? Math.round(open.reduce((s, m) => s + progress(m), 0) / open.length) : 100;
        return `<tr data-action="go" data-href="#/dossier/${c.id}" role="button" tabindex="0" class="${c.archive ? 'archived' : ''}">
          <td>${esc(c.code)}</td><td>${esc(c.forme)}</td><td class="strong">${esc(clientLabel(c))}</td><td>${esc(tvaShort(c.regimeTva))}</td>
          <td>${esc(c.cloture)}</td><td>${esc([c.responsable, c.collaborateur].filter(Boolean).join(' / '))}</td>
          <td>${open.length}</td><td>${late ? `<span class="late">${late}</span>` : ''}</td>
          <td>${open.length ? `<div class="prog">${bar(p)}<span class="pct">${p} %</span></div>` : '<span class="uptodate">À jour ✓</span>'}</td></tr>`;
      }).join('')}</tbody></table></div>`;
    applyWidths(el);
    return;
  }
  el.innerHTML = list.map((c) => {
    const ms = missionsOf(c.id);
    const open = ms.filter(isOpen);
    const late = open.filter(isLate).length;
    const next = open.filter((m) => m.echeance).sort(byDue)[0];
    const p = open.length ? Math.round(open.reduce((s, m) => s + progress(m), 0) / open.length) : 100;
    const issues = complianceIssues(c).length;
    return `
      <a class="dcard${c.archive ? ' archived' : ''}" href="#/dossier/${c.id}">
        <div class="dcard-head">
          <strong class="dcard-name">${esc(clientLabel(c))}</strong>
          ${c.archive ? '<span class="badge">Archivé</span>' : ''}
        </div>
        <div class="muted small">${[c.forme, data.settings.discret ? '' : c.code, c.responsable].filter(Boolean).map(esc).join(' · ') || '&nbsp;'}</div>
        <div class="dcard-stats">
          <span>${open.length} en cours</span>
          ${late ? `<span class="late">${late} en retard</span>` : ''}
          ${issues ? '<span class="badge warn" title="Conformité à vérifier">Conformité</span>' : ''}
        </div>
        ${open.length ? `<div class="prog">${bar(p)}<span class="pct">${p} %</span></div>` : '<div class="uptodate">À jour ✓</div>'}
        <div class="muted small">${next ? 'Prochaine échéance : ' + fmtDate(next.echeance) : '&nbsp;'}</div>
      </a>`;
  }).join('');
  applyWidths(el);
}

function viewDossier(id) {
  const c = clientById(id);
  if (!c) return emptyState('Ce dossier n\'existe pas ou a été supprimé.', '<a class="btn" href="#/dossiers">Retour aux dossiers</a>');
  const discret = data.settings.discret;
  const ms = missionsOf(c.id);
  const open = ms.filter(isOpen).sort(byDue);
  const closed = ms.filter((m) => !isOpen(m)).sort((a, b) => (b.termineLe || '').localeCompare(a.termineLe || ''));
  const journal = data.journal.filter((j) => j.clientId === c.id).sort((a, b) => b.date.localeCompare(a.date));
  const issues = complianceIssues(c);
  const hidden = '<span class="masked">Masqué</span>';
  const field = (label, value, sensitive) => `<div class="field"><dt>${label}</dt><dd>${sensitive && discret ? hidden : value ? esc(value) : '<span class="muted">—</span>'}</dd></div>`;

  return `
    <a class="back" href="#/dossiers">${icon('back')}Dossiers</a>
    <div class="page-head">
      <div><h1>${esc(clientLabel(c))}</h1>
        <div class="muted">${[c.forme, discret ? '' : c.code].filter(Boolean).map(esc).join(' · ')}${c.archive ? ' · <span class="badge">Archivé</span>' : ''}</div>
      </div>
      <div class="head-actions">
        <button class="btn" data-action="edit-client" data-id="${c.id}">Modifier</button>
        ${open.length ? `<button class="btn" data-action="open-msg" data-client="${c.id}">${icon('mail')}Écrire au client</button>` : ''}
        <button class="btn" data-action="open-cal" data-client="${c.id}">${icon('calendar')}Échéances de l'année</button>
        <button class="btn primary" data-action="new-mission" data-client="${c.id}">${icon('plus')}Mission</button>
      </div>
    </div>
    ${issues.length ? `<div class="banner warn"><span><strong>Conformité :</strong> ${issues.map(esc).join(' · ')}</span><button class="btn small" data-action="edit-client" data-id="${c.id}">Compléter</button></div>` : ''}
    <div class="grid-detail">
      <div>
        <section class="card">
          <h2>Missions en cours <span class="count">${open.length}</span></h2>
          ${open.length ? `<div class="mlist">${open.map((m) => missionRow(m, false)).join('')}</div>` : '<p class="muted">Aucune mission en cours.</p>'}
        </section>
        ${closed.length ? `<section class="card"><details><summary><h2>Missions terminées <span class="count">${closed.length}</span></h2></summary><div class="mlist">${closed.map((m) => missionRow(m, false)).join('')}</div></details></section>` : ''}
        <section class="card">
          <h2>Journal du dossier</h2>
          ${discret ? '<p class="muted">Journal masqué en mode discret.</p>' : `
          <form data-form="journal" data-client="${c.id}" class="journal-form" autocomplete="off">
            <textarea name="texte" rows="2" placeholder="Ajouter une note (appel, relance, pièce reçue…)" required spellcheck="false"></textarea>
            <button class="btn" type="submit">Ajouter</button>
          </form>
          <ul class="journal">${journal.map((j) => `
            <li class="${j.auto ? 'auto' : ''}"><div class="j-date">${fmtDateTime(j.date)}</div><div class="j-text">${esc(j.texte)}</div>
            ${j.auto ? '' : `<button class="link-btn small" data-action="delete-note" data-id="${j.id}" aria-label="Supprimer la note">Supprimer</button>`}</li>`).join('') || '<li class="muted">Aucune entrée.</li>'}
          </ul>`}
        </section>
      </div>
      <div>
        <section class="card">
          <h2>Informations</h2>
          <dl class="fields">
            ${field('Nom', c.nom, true)}
            ${field('SIREN / SIRET', c.siren, true)}
            ${field('Régime fiscal', c.regimeFiscal)}
            ${field('Régime de TVA', c.regimeTva)}
            ${field('Activité (analyse FEC)', c.activite ? ACTIVITES[c.activite] : 'Détectée sur le FEC')}
            ${field('Jour limite TVA', c.jourTva)}
            ${field('Clôture', c.cloture)}
            ${field('Responsable', c.responsable)}
            ${field('Collaborateur', c.collaborateur)}
            ${field('Superviseur / associé', c.superviseur)}
            ${field('Contact', c.contact, true)}
            ${field('E-mail', c.email, true)}
            ${field('Téléphone', c.tel, true)}
          </dl>
        </section>
        <section class="card">
          <h2>Déontologie</h2>
          <dl class="fields">
            ${field('Lettre de mission signée le', c.lettreMission ? fmtDate(c.lettreMission) : '')}
            ${field('Vigilance LCB-FT', VIGILANCE[c.vigilance] || '')}
            ${field('Dernière identification / revue', c.kycDate ? fmtDate(c.kycDate) : '')}
          </dl>
        </section>
        ${c.fec && c.fec.length ? `<section class="card"><h2>Analyses FEC</h2>
          <ul class="fec-hist">${c.fec.slice().reverse().map((x) => `<li>
            <div><strong>${x.closing ? 'Clôture ' + fmtDate(x.closing) : esc(x.fileName)}</strong> <span class="muted small">analysé le ${fmtDate(x.date.slice(0, 10))}</span></div>
            <div class="small">${x.errors ? `<span class="lvl lvl-error"><b aria-hidden="true">✕</b>${x.errors} anomalie(s)</span>` : '<span class="lvl lvl-ok"><b aria-hidden="true">✓</b>Aucune anomalie</span>'} ${x.warnings ? `<span class="lvl lvl-warn"><b aria-hidden="true">!</b>${x.warnings} à vérifier</span>` : ''}</div>
            <div class="muted small">CA ${eur(x.kpi.ca, 0)} € · Résultat ${eur(x.kpi.resultat, 0)} € · EBE ${eur(x.kpi.ebe, 0)} € · Trésorerie ${eur(x.kpi.tresorerie, 0)} €</div>
          </li>`).join('')}</ul>
          <a class="btn small" href="#/fec">Nouvelle analyse</a></section>` : ''}
        ${c.revisionMemo && Object.keys(c.revisionMemo).length ? `<section class="card"><h2>Mémoire de révision <span class="count">${Object.keys(c.revisionMemo).length}</span></h2>
          <p class="muted small">Éléments justifiés lors d'une revue, qui ne sont plus signalés par l'analyse FEC de ce dossier.</p>
          <ul class="memo-list">${Object.entries(c.revisionMemo).map(([k, m]) => `<li><div><strong>${discret ? hidden : esc(m.label)}</strong>${m.note ? `<div class="muted small">${discret ? '' : esc(m.note)}</div>` : ''}<div class="muted small">${esc(m.by || '')} ${m.at ? fmtDate(m.at.slice(0, 10)) : ''}</div></div>
            <button class="link-btn danger" data-action="memo-del" data-id="${c.id}" data-k="${esc(k)}">Signaler à nouveau</button></li>`).join('')}</ul></section>` : ''}
        ${c.notes ? `<section class="card"><h2>Notes</h2><div class="notes">${discret ? hidden : esc(c.notes)}</div></section>` : ''}
        <section class="card">
          <h2>Gestion du dossier</h2>
          <div class="stack">
            <button class="btn block" data-action="archive-client" data-id="${c.id}">${c.archive ? 'Réactiver le dossier' : 'Archiver le dossier (fin de mission)'}</button>
            <button class="btn danger block" data-action="delete-client" data-id="${c.id}">Supprimer définitivement</button>
          </div>
        </section>
      </div>
    </div>`;
}

function clientForm(c) {
  const isNew = !c;
  c = c || { vigilance: 'standard' };
  openModal(`
    <form data-form="client" data-id="${c.id || ''}" autocomplete="off" spellcheck="false">
      <header class="modal-head"><h2>${isNew ? 'Nouveau dossier' : 'Modifier le dossier'}</h2><button type="button" class="icon-btn" data-action="close-modal" aria-label="Fermer">✕</button></header>
      <div class="modal-body">
        <div class="form-grid">
          <label class="span2">Nom / raison sociale *<input name="nom" required value="${esc(c.nom)}"></label>
          <label>Code dossier<input name="code" value="${esc(c.code)}" placeholder="Généré automatiquement" maxlength="12"></label>
          <label>Forme juridique<select name="forme">${options(FORMES, c.forme, true)}</select></label>
          <label>SIREN / SIRET<input name="siren" value="${esc(c.siren)}" inputmode="numeric" maxlength="17" pattern="[0-9 ]*"></label>
          <label>Clôture (JJ/MM)<input name="cloture" value="${esc(c.cloture || (isNew ? '31/12' : ''))}" placeholder="31/12" pattern="\\d{2}/\\d{2}" maxlength="5"></label>
          <label>Régime fiscal<select name="regimeFiscal">${options(REGIMES_FISCAUX, c.regimeFiscal, true)}</select></label>
          <label>Régime de TVA<select name="regimeTva">${options(REGIMES_TVA, c.regimeTva, true)}</select></label>
          <label>Activité (analyse FEC)<select name="activite">${options(ACTIVITES, c.activite, 'Détectée sur le FEC')}</select></label>
          <label>Jour limite de dépôt TVA<input type="number" name="jourTva" min="1" max="31" value="${esc(c.jourTva)}" placeholder="ex. 21"></label>
          <label>Responsable<input name="responsable" list="collabs" value="${esc(c.responsable || (isNew ? data.settings.utilisateur : ''))}"></label>
          <label>Collaborateur<input name="collaborateur" list="collabs" value="${esc(c.collaborateur)}"></label>
          <label>Superviseur / associé<input name="superviseur" list="collabs" value="${esc(c.superviseur)}"></label>
          <label>Contact<input name="contact" value="${esc(c.contact)}"></label>
          <label>E-mail<input name="email" type="email" value="${esc(c.email)}"></label>
          <label>Téléphone<input name="tel" type="tel" value="${esc(c.tel)}"></label>
        </div>
        <fieldset>
          <legend>Déontologie et LCB-FT</legend>
          <div class="form-grid">
            <label>Lettre de mission signée le<input type="date" name="lettreMission" value="${esc(c.lettreMission)}"></label>
            <label>Niveau de vigilance<select name="vigilance">${options(VIGILANCE, c.vigilance)}</select></label>
            <label>Dernière identification / revue<input type="date" name="kycDate" value="${esc(c.kycDate)}"></label>
          </div>
        </fieldset>
        <label>Notes<textarea name="notes" rows="3">${esc(c.notes)}</textarea></label>
        <p class="muted small">Minimisation des données : ne saisissez que ce qui est utile au suivi. Les pièces des clients restent dans votre logiciel de production.</p>
        ${collaborateursDatalist()}
      </div>
      <footer class="modal-foot"><button type="button" class="btn" data-action="close-modal">Annuler</button><button class="btn primary" type="submit">Enregistrer</button></footer>
    </form>`);
}
