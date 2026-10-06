/*
 * Suivi Dossiers — Fragments d'interface, écrans de verrouillage, structure et navigation.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------------------------------------------------------------------------
// Fragments d'interface
// ---------------------------------------------------------------------------

function statusBadge(s) {
  return `<span class="badge st-${s}">${esc(STATUTS[s])}</span>`;
}

function bar(p) {
  return `<div class="bar" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"><span data-w="${p}"></span></div>`;
}

function dueBadge(m) {
  if (!m.echeance) return '<span class="due muted">Sans échéance</span>';
  if (!isOpen(m)) return `<span class="due muted">${fmtDate(m.echeance)}</span>`;
  const d = daysUntil(m.echeance);
  if (d < 0) return `<span class="due late" title="${fmtDate(m.echeance)}">Retard ${-d} j</span>`;
  if (d === 0) return `<span class="due soon" title="${fmtDate(m.echeance)}">Aujourd'hui</span>`;
  if (d <= 7) return `<span class="due soon" title="${fmtDate(m.echeance)}">Dans ${d} j</span>`;
  return `<span class="due">${fmtDate(m.echeance)}</span>`;
}

function missionRow(m, showClient) {
  const p = progress(m);
  const done = m.etapes.filter((e) => e.done).length;
  return `
    <div class="mrow${isOpen(m) ? '' : ' closed'}" data-action="open-mission" data-id="${m.id}" tabindex="0" role="button">
      <div class="mrow-main">
        ${showClient ? `<div class="mrow-client">${esc(clientLabel(clientById(m.clientId)))}</div>` : ''}
        <div class="mrow-title">${m.priorite === 'haute' ? '<span class="prio" title="Priorité haute">!</span>' : ''}${esc(m.titre)}</div>
        <div class="mrow-meta">${statusBadge(m.statut)}${m.responsable ? `<span class="muted">${esc(m.responsable)}</span>` : ''}${m.etapes.length ? `<span class="muted">${done}/${m.etapes.length} étapes</span>` : ''}</div>
      </div>
      <div class="mrow-side">${dueBadge(m)}<div class="prog">${bar(p)}<span class="pct">${p} %</span></div></div>
    </div>`;
}

function emptyState(text, actionHtml) {
  return `<div class="empty"><p>${text}</p>${actionHtml || ''}</div>`;
}

function options(list, selected, withEmpty) {
  const entries = Array.isArray(list) ? list.map((v) => [v, v]) : Object.entries(list);
  // Conserve une valeur absente de la liste (ex. issue d'un import).
  if (selected && !entries.some(([v]) => v === selected)) entries.push([selected, selected]);
  return (withEmpty ? `<option value="">${esc(withEmpty === true ? '—' : withEmpty)}</option>` : '') +
    entries.map(([v, l]) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(l)}</option>`).join('');
}

function collaborateursDatalist() {
  return `<datalist id="collabs">${data.settings.collaborateurs.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`;
}

// ---------------------------------------------------------------------------
// Écrans de verrouillage / création
// ---------------------------------------------------------------------------

let failedAttempts = 0;
let noPassword = false; // ouverture sans mot de passe activée sur cet appareil

function renderSetup() {
  $('#app').innerHTML = `
    <div class="lock-screen">
      <div class="lock-card">
        <div class="lock-logo">${icon('shield')}</div>
        <h1>Suivi Dossiers</h1>
        <p class="muted">Suivi confidentiel de vos dossiers clients.</p>
        <div class="info-box">
          <strong>Vos données restent sur cet appareil.</strong>
          Elles sont chiffrées (AES-256) avec un mot de passe maître que vous seul connaissez.
          Aucun serveur, aucun compte, aucun traceur.
        </div>
        <form data-form="setup" autocomplete="off">
          <label>Mot de passe maître
            <input type="password" name="p1" required minlength="10" autocomplete="new-password" spellcheck="false" autofocus>
          </label>
          <div class="strength"><span data-strength></span></div>
          <label>Confirmer le mot de passe
            <input type="password" name="p2" required minlength="10" autocomplete="new-password" spellcheck="false">
          </label>
          <label class="check">
            <input type="checkbox" name="ack" required>
            <span>J'ai compris qu'en cas d'oubli de ce mot de passe, <strong>les données ne pourront pas être récupérées</strong>.</span>
          </label>
          <label class="check">
            <input type="checkbox" name="device">
            <span>Ne plus demander le mot de passe sur cet appareil (il protégera seulement les sauvegardes). À réserver à un appareil personnel, lui-même protégé par un code.</span>
          </label>
          <p class="form-error" data-error></p>
          <button class="btn primary block" type="submit">Créer mon coffre sécurisé</button>
        </form>
        <div class="sep"><span>ou</span></div>
        <button class="btn block" data-action="restore-setup">Restaurer une sauvegarde (.json)</button>
        <p class="muted small">Au moins 10 caractères. Privilégiez une phrase de passe longue.</p>
      </div>
    </div>`;
}

function renderLock(message) {
  $('#app').innerHTML = `
    <div class="lock-screen">
      <div class="lock-card">
        <div class="lock-logo">${icon('lock')}</div>
        <h1>Suivi Dossiers</h1>
        <p class="muted">${message ? esc(message) : 'Application verrouillée.'}</p>
        ${noPassword ? `<button class="btn primary block" data-action="open-device">Ouvrir</button><div class="sep"><span>ou avec le mot de passe</span></div>` : ''}
        <form data-form="unlock" autocomplete="off">
          <label>Mot de passe maître
            <input type="password" name="password" required autocomplete="current-password" spellcheck="false" autofocus>
          </label>
          <p class="form-error" data-error></p>
          <button class="btn ${noPassword ? '' : 'primary '}block" type="submit">Déverrouiller</button>
        </form>
        <button class="link-btn danger small" data-action="reset-all">Mot de passe oublié ? Réinitialiser l'application</button>
      </div>
    </div>`;
  const input = $('input[name=password]');
  if (input && !noPassword) input.focus();
}

// ---------------------------------------------------------------------------
// Structure principale et navigation
// ---------------------------------------------------------------------------

const fecHref = () => '#/fec';

function renderShell() {
  const discret = data.settings.discret;
  $('#app').innerHTML = `
    <div class="layout${discret ? ' discret' : ''}">
      <aside class="sidebar">
        <div class="brand">
          ${icon('shield')}
          <div><strong>Suivi Dossiers</strong><small>${esc(data.settings.cabinet || 'Cabinet')}</small></div>
        </div>
        <nav class="nav">
          <a href="#/tableau" data-nav="tableau">${icon('home')}<span>Tableau de bord</span></a>
          <a href="#/dossiers" data-nav="dossiers">${icon('folder')}<span>Dossiers</span></a>
          <a href="#/missions" data-nav="missions">${icon('list')}<span>Missions</span></a>
          <a href="#/grille" data-nav="grille">${icon('grid')}<span>Suivi mensuel</span></a>
          <a href="${fecHref()}" data-nav="fec">${icon('chart')}<span>Analyse FEC</span></a>
          <a href="#/parametres" data-nav="parametres">${icon('gear')}<span>Paramètres</span></a>
        </nav>
        <div class="side-actions">
          <a class="btn ghost block" href="#/aide" data-nav="aide">${icon('help')}<span>Aide</span></a>
          <button class="btn ghost block" data-action="toggle-discret">${icon(discret ? 'eyeOff' : 'eye')}<span>${discret ? 'Mode discret activé' : 'Mode discret'}</span></button>
          <button class="btn ghost block" data-action="lock">${icon('lock')}<span>Verrouiller</span></button>
        </div>
      </aside>
      <header class="topbar">
        <div class="brand">${icon('shield')}<strong>Suivi Dossiers</strong></div>
        <div class="top-actions">
          <a class="icon-btn" href="#/aide" title="Aide" aria-label="Aide">${icon('help')}</a>
          <button class="icon-btn" data-action="toggle-discret" title="Mode discret" aria-label="Mode discret">${icon(discret ? 'eyeOff' : 'eye')}</button>
          <button class="icon-btn" data-action="lock" title="Verrouiller" aria-label="Verrouiller">${icon('lock')}</button>
        </div>
      </header>
      <main id="main" tabindex="-1"></main>
    </div>`;
}

const ui = {
  qDossiers: '',
  showArchived: false,
  mf: { q: '', statut: 'ouvertes', resp: '', periode: 'toutes', type: '' },
  grille: { annee: new Date().getFullYear(), type: 'tva', resp: '', regime: '' },
  imp: null,
  fecState: null,
};
// ui.fec : l'analyse FEC ouverte. Son profil (structure classique ou officine) vient du dossier, sinon du contenu du FEC.
Object.defineProperty(ui, 'fec', {
  get() { return this.fecState; },
  set(v) { this.fecState = v; },
});
Object.defineProperty(ui, 'fecProfile', {
  get() { return (this.fecState && this.fecState.profile) || 'classique'; },
});

function route() {
  if (!data) return;
  if (!$('.layout')) renderShell();
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const view = parts[0] || 'tableau';
  const main = $('#main');
  // Anciennes adresses : analyseur pharmacie (le profil vient désormais du dossier) et portefeuille.
  if (view === 'fec' && parts[1] === 'lot') { location.replace('#/portefeuille'); return; }
  const navOf = { dossier: 'dossiers', portefeuille: 'dossiers' };
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === (navOf[view] || view)));
  switch (view) {
    case 'dossiers': main.innerHTML = viewDossiers(); renderDossierList(); break;
    case 'dossier': main.innerHTML = viewDossier(parts[1]); break;
    case 'missions': main.innerHTML = viewMissions(); renderMissionList(); break;
    case 'grille': main.innerHTML = viewGrille(); scrollGrilleToMonth(); break;
    case 'aide': main.innerHTML = viewAide(); break;
    case 'fec': main.innerHTML = viewFec(); break;
    case 'portefeuille': main.innerHTML = viewBatch(); break;
    case 'parametres': main.innerHTML = viewSettings(); break;
    default: main.innerHTML = viewDashboard();
  }
  applyWidths(main);
}

function refresh() {
  const scroll = window.scrollY;
  route();
  window.scrollTo(0, scroll);
  if ($('#modal').open && modalRefresh) modalRefresh();
}
