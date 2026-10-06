/*
 * Suivi Dossiers — Paramètres.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------------------------------------------------------------------------
// Paramètres
// ---------------------------------------------------------------------------

function viewSettings() {
  const s = data.settings;
  const persisted = ui.persisted === true ? 'Oui — le navigateur ne supprimera pas les données automatiquement.' : ui.persisted === false ? 'Non garanti — exportez régulièrement une sauvegarde.' : '…';
  return `
    <div class="page-head"><h1>Paramètres</h1></div>
    <div class="grid2">
      <section class="card">
        <h2>Cabinet</h2>
        <form data-form="settings" autocomplete="off" spellcheck="false">
          <label>Nom du cabinet<input name="cabinet" value="${esc(s.cabinet)}"></label>
          <label>Votre prénom<input name="utilisateur" value="${esc(s.utilisateur)}"></label>
          <label>Collaborateurs (un par ligne)<textarea name="collaborateurs" rows="3">${esc(s.collaborateurs.join('\n'))}</textarea></label>
          <label>Revue LCB-FT tous les (mois)<input type="number" name="kycMois" min="1" max="60" value="${esc(s.kycMois)}"></label>
          <label>Relancer un client sans réponse après (jours)<input type="number" name="relanceJours" min="1" max="60" value="${esc(s.relanceJours)}"></label>
          <label>Signature des messages<textarea name="signature" rows="3" placeholder="${esc([s.utilisateur, s.cabinet].filter(Boolean).join('\n') || 'Prénom Nom\nCabinet')}">${esc(s.signature)}</textarea></label>
          <label>Ne jamais demander de pièces pour ces fournisseurs<textarea name="piecesIgnore" rows="3" placeholder="Nom de votre cabinet">${esc((s.piecesIgnore || []).join('\n'))}</textarea></label>
          <p class="muted small">Un nom par ligne (par exemple votre propre cabinet, dont vous récupérez les factures vous-même). Toute demande qui mentionne ce nom est retirée des pièces à demander.</p>
          <button class="btn primary" type="submit">Enregistrer</button>
        </form>
      </section>
      <section class="card">
        <h2>Sécurité et confidentialité</h2>
        <label class="check"><input type="checkbox" data-device${noPassword ? ' checked' : ''}><span><strong>Ne plus demander le mot de passe sur cet appareil</strong></span></label>
        <p class="muted small">${noPassword
          ? "Activé : l'application s'ouvre directement. Les données restent chiffrées sur le disque, mais toute personne ayant accès à votre session (ordinateur ou téléphone déverrouillé) peut les consulter : protégez l'appareil par un code et verrouillez-le en vous absentant. Le mot de passe reste nécessaire pour restaurer une sauvegarde : ne l'oubliez pas."
          : "Le mot de passe est demandé à chaque ouverture. Vous pouvez le supprimer sur un appareil personnel, protégé par un code : les données resteront chiffrées sur le disque et les sauvegardes protégées par le mot de passe."}</p>
        ${noPassword ? '' : `<label>Verrouillage automatique après inactivité
          <select data-setting="autoLockMin">${options({ 1: '1 minute', 2: '2 minutes', 5: '5 minutes', 10: '10 minutes', 15: '15 minutes', 30: '30 minutes', 60: '1 heure', 0: 'Jamais' }, String(s.autoLockMin))}</select>
        </label>
        <label class="check"><input type="checkbox" data-setting="lockOnHide"${s.lockOnHide ? ' checked' : ''}><span>Verrouiller dès que l'application passe en arrière-plan</span></label>`}
        <label class="check"><input type="checkbox" data-setting="discret"${s.discret ? ' checked' : ''}><span>Mode discret : afficher les codes dossiers au lieu des noms et masquer les coordonnées (utile en rendez-vous ou dans les transports)</span></label>
        <h3>Changer le mot de passe maître</h3>
        <form data-form="password" autocomplete="off">
          <label>Mot de passe actuel<input type="password" name="old" required autocomplete="current-password"></label>
          <label>Nouveau mot de passe<input type="password" name="p1" required minlength="10" autocomplete="new-password"></label>
          <div class="strength"><span data-strength></span></div>
          <label>Confirmer<input type="password" name="p2" required minlength="10" autocomplete="new-password"></label>
          <p class="form-error" data-error></p>
          <button class="btn" type="submit">Changer le mot de passe</button>
        </form>
      </section>
      <section class="card">
        <h2>Modèles de missions</h2>
        <ul class="tpl-list">${data.templates.map((t) => `
          <li><div><strong>${esc(t.nom)}</strong><div class="muted small">${t.etapes.length} étape${t.etapes.length > 1 ? 's' : ''} · ${esc(RECURRENCES[t.recurrence] || 'Aucune')}</div></div>
          <button class="btn small" data-action="edit-template" data-id="${t.id}">Modifier</button></li>`).join('')}
        </ul>
        <button class="btn" data-action="new-template">${icon('plus')}Nouveau modèle</button>
      </section>
      <section class="card">
        <h2>Sauvegarde et transfert</h2>
        <p>Dernière sauvegarde : <strong>${s.lastBackup ? fmtDateTime(s.lastBackup) : 'jamais'}</strong></p>
        <p class="muted small">La sauvegarde est un fichier <strong>chiffré</strong> avec votre mot de passe maître. Elle permet de restaurer vos données ou de les transférer vers un autre appareil (PC ↔ téléphone). Conservez-la sur un support maîtrisé par le cabinet.</p>
        <div class="stack">
          <button class="btn primary block" data-action="export-backup">Exporter une sauvegarde chiffrée</button>
          <button class="btn block" data-action="import-backup">Restaurer une sauvegarde…</button>
          <button class="btn block" data-action="import-sheet">Importer des dossiers (Excel / CSV)</button>
          <button class="btn block" data-action="export-csv">Exporter les missions en CSV (non chiffré)</button>
        </div>
        <p class="muted small">Stockage persistant : ${persisted}</p>
      </section>
      ${autoBackupCard()}
      <section class="card">
        <h2>Agenda et aide</h2>
        <p class="muted small">Recevez les rappels d'échéances dans votre agenda habituel, même lorsque l'application est fermée.</p>
        <div class="stack">
          <button class="btn block" data-action="open-ics">${icon('calendar')}Échéances dans mon agenda (.ics)</button>
          <a class="btn block" href="#/aide">${icon('help')}Guide d'utilisation</a>
        </div>
      </section>
      <section class="card">
        <h2>${icon('shield')} Engagements de confidentialité</h2>
        <ul class="bullets">
          <li><strong>Aucune transmission</strong> : l'application fonctionne hors ligne, sans serveur, sans compte, sans publicité ni statistiques. Une politique de sécurité (CSP) interdit toute connexion vers un domaine tiers.</li>
          <li><strong>Chiffrement</strong> : AES-GCM 256 bits, clé dérivée du mot de passe (PBKDF2-SHA-256, 600 000 itérations). Rien n'est lisible sans le mot de passe.</li>
          <li><strong>Verrouillage automatique</strong> et mode discret pour limiter les regards indiscrets.</li>
          <li><strong>RGPD</strong> : minimisation des données, suppression définitive d'un dossier possible (droit à l'effacement), export des données (portabilité).</li>
          <li><strong>Secret professionnel</strong> : protégez aussi l'appareil lui-même (code de verrouillage, chiffrement du disque, session personnelle).</li>
        </ul>
      </section>
      <section class="card danger-zone">
        <h2>Zone de danger</h2>
        <p class="muted small">Efface définitivement le coffre de cet appareil. Exportez une sauvegarde avant si nécessaire.</p>
        <button class="btn danger" data-action="reset-all">Effacer toutes les données</button>
      </section>
    </div>`;
}

function templateForm(t) {
  const isNew = !t;
  t = t || { nom: '', recurrence: 'aucune', etapes: [] };
  modalRefresh = null;
  openModal(`
    <form data-form="template" data-id="${t.id || ''}" autocomplete="off" spellcheck="false">
      <header class="modal-head"><h2>${isNew ? 'Nouveau modèle' : 'Modifier le modèle'}</h2><button type="button" class="icon-btn" data-action="close-modal" aria-label="Fermer">✕</button></header>
      <div class="modal-body">
        <label>Nom *<input name="nom" required value="${esc(t.nom)}"></label>
        <label>Récurrence par défaut<select name="recurrence">${options(RECURRENCES, t.recurrence)}</select></label>
        <label>Étapes (une par ligne)<textarea name="etapes" rows="10">${esc(t.etapes.join('\n'))}</textarea></label>
        <p class="muted small">Les nouvelles missions reprennent ces étapes. Si vous les modifiez, l'application propose de mettre aussi à jour les missions en cours de ce modèle.</p>
      </div>
      <footer class="modal-foot">
        ${!isNew && data.templates.length > 1 ? `<button type="button" class="btn danger" data-action="delete-template" data-id="${t.id}">Supprimer</button>` : ''}
        <span class="spacer"></span>
        <button type="button" class="btn" data-action="close-modal">Annuler</button><button class="btn primary" type="submit">Enregistrer</button>
      </footer>
    </form>`);
}
