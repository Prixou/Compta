/*
 * Suivi Dossiers — Fenêtres modales, sauvegardes et exports, verrouillage.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------------------------------------------------------------------------
// Fenêtres modales
// ---------------------------------------------------------------------------

function openModal(html, wide) {
  const modal = $('#modal');
  modal.classList.toggle('wide', !!wide);
  modal.innerHTML = html;
  applyWidths(modal);
  if (!modal.open) modal.showModal();
  const first = $('input:not([type=checkbox]):not([type=hidden]), textarea', modal);
  if (first && modal.querySelector('form')) first.focus();
}

function closeModal() {
  const modal = $('#modal');
  modalRefresh = null;
  if (modal.open) modal.close();
  modal.innerHTML = '';
}

// Boîte de dialogue de confirmation / saisie. Renvoie la valeur saisie, true, ou null si annulé.
function ask({ title, message, input, okLabel, danger, confirmText }) {
  return new Promise((resolve) => {
    const dlg = $('#ask');
    dlg.innerHTML = `
      <form autocomplete="off">
        <header class="modal-head"><h2>${esc(title)}</h2></header>
        <div class="modal-body">
          <p>${message}</p>
          ${input ? `<input type="${typeof input === 'object' ? input.type || 'text' : input}" name="value"${typeof input === 'object' && input.optional !== false ? '' : ' required'} placeholder="${esc((typeof input === 'object' && input.placeholder) || '')}" spellcheck="false" autocomplete="off">` : ''}
          ${confirmText ? `<label>Tapez <strong>${esc(confirmText)}</strong> pour confirmer<input name="confirm" required spellcheck="false" autocomplete="off"></label>` : ''}
        </div>
        <footer class="modal-foot"><button type="button" class="btn" data-ask="cancel">Annuler</button><button type="submit" class="btn ${danger ? 'danger' : 'primary'}">${esc(okLabel || 'Confirmer')}</button></footer>
      </form>`;
    const form = $('form', dlg);
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      if (dlg.open) dlg.close();
      dlg.innerHTML = '';
      resolve(v);
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (confirmText && form.confirm.value.trim() !== confirmText) {
        form.confirm.setCustomValidity('Texte incorrect');
        form.confirm.reportValidity();
        return;
      }
      finish(input ? form.value.value : true);
    });
    if (confirmText) form.confirm.addEventListener('input', () => form.confirm.setCustomValidity(''));
    $('[data-ask=cancel]', dlg).addEventListener('click', () => finish(null));
    dlg.addEventListener('close', () => finish(null), { once: true });
    dlg.showModal();
    const f = $('input', dlg);
    if (f) f.focus();
  });
}

// ---------------------------------------------------------------------------
// Sauvegardes et exports
// ---------------------------------------------------------------------------

// Renvoie le texte du fichier choisi, ou l'objet File si `asFile`.
function pickFile(accept, asFile) {
  return new Promise((resolve) => {
    const input = $('#file-input');
    input.value = '';
    input.multiple = false;
    input.accept = accept || '.json,application/json';
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return resolve(null);
      if (asFile) return resolve(file);
      file.text().then(resolve, () => resolve(null));
    };
    input.click();
  });
}

async function exportBackup() {
  data.settings.lastBackup = nowIso();
  await persist();
  const text = await Vault.exportBackup(data);
  download(`suivi-dossiers-sauvegarde-${todayStr()}.json`, text, 'application/json');
  toast('Sauvegarde chiffrée exportée.');
  refresh();
}

async function readBackupInteractive() {
  const text = await pickFile();
  if (!text) return null;
  const password = await ask({ title: 'Mot de passe de la sauvegarde', message: 'Saisissez le mot de passe maître utilisé lors de la création de cette sauvegarde.', input: 'password', okLabel: 'Déchiffrer' });
  if (!password) return null;
  try {
    return { data: migrate(await Vault.readBackup(text, password)), password };
  } catch (e) {
    toast(e.message, true);
    return null;
  }
}

async function importBackup() {
  const res = await readBackupInteractive();
  if (!res) return;
  const ok = await ask({
    title: 'Remplacer les données ?',
    message: `La sauvegarde contient <strong>${res.data.clients.length} dossier(s)</strong> et <strong>${res.data.missions.length} mission(s)</strong>. Elle remplacera entièrement les données actuelles de cet appareil.`,
    okLabel: 'Remplacer',
    danger: true,
  });
  if (!ok) return;
  data = res.data;
  await persist();
  toast('Sauvegarde restaurée. Le mot de passe actuel de cet appareil est conservé.');
  renderShell();
  route();
}

function csvCell(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // protection contre l'injection de formules
  return '"' + s.replace(/"/g, '""') + '"';
}

async function exportCsv() {
  const ok = await ask({
    title: 'Export non chiffré',
    message: "Le fichier CSV n'est <strong>pas chiffré</strong> et contient des informations couvertes par le secret professionnel. Enregistrez-le uniquement sur un support sécurisé et supprimez-le après usage.",
    okLabel: 'Exporter',
  });
  if (!ok) return;
  const head = ['Code', 'Dossier', 'Mission', 'Exercice', 'Statut', 'Échéance', 'Avancement (%)', 'Responsable', 'Priorité', 'Terminée le'];
  const rows = data.missions.slice().sort(byDue).map((m) => {
    const c = clientById(m.clientId) || {};
    return [c.code, c.nom, m.titre, m.exercice, STATUTS[m.statut], m.echeance ? fmtDate(m.echeance) : '', progress(m), m.responsable, m.priorite, m.termineLe ? fmtDate(m.termineLe) : ''];
  });
  const csv = '﻿' + [head].concat(rows).map((r) => r.map(csvCell).join(';')).join('\r\n');
  download(`suivi-dossiers-missions-${todayStr()}.csv`, csv, 'text/csv;charset=utf-8');
}

// ---------------------------------------------------------------------------
// Verrouillage
// ---------------------------------------------------------------------------

let lastActivity = Date.now();

// Efface de la mémoire et de l'écran tout ce qui concerne les dossiers (verrouillage, réinitialisation).
function forgetSession() {
  ui.fecStates = { classique: null, pharmacie: null };
  ui.batch = null;
  closeGrillePop();
  ui.imp = null;
  ui.cab = null;
  ui.cal = null;
  ui.msg = null;
  modalRefresh = null;
  const t = $('#toast');
  if (t) { t.textContent = ''; t.className = ''; }
  const area = $('#print-area');
  if (area) area.innerHTML = '';
  const tip = $('#viz-tip');
  if (tip) { tip.textContent = ''; tip.style.display = 'none'; }
}

async function setDeviceMode(input) {
  if (input.checked) {
    const ok = await ask({
      title: 'Ouvrir sans mot de passe',
      message: "L'application s'ouvrira directement sur cet appareil. Toute personne ayant accès à votre session Windows, Mac ou à votre téléphone déverrouillé pourra lire les dossiers clients. À réserver à un appareil personnel protégé par un code.<br><br>Le mot de passe reste indispensable pour restaurer une sauvegarde.",
      okLabel: 'Ne plus demander le mot de passe', danger: true,
    });
    if (!ok) { input.checked = false; return; }
    await Vault.rememberDevice();
    noPassword = true;
    toast('Le mot de passe ne sera plus demandé sur cet appareil.');
  } else {
    await Vault.forgetDevice();
    noPassword = false;
    toast('Le mot de passe sera de nouveau demandé à chaque ouverture.');
  }
  refresh();
}

async function lock(message) {
  if (!data) return;
  if (autoBackupTimer) await writeAutoBackup();
  await saving;
  Vault.lock();
  clearTimeout(autoBackupTimer);
  autoBackupHandle = null;
  ui.autoBackup = null;
  if (fecWorker) fecWorker.terminate();
  fecWorker = null;
  forgetSession();
  data = null;
  closeModal();
  const ask = $('#ask');
  if (ask.open) ask.close();
  ask.innerHTML = '';
  renderLock(message);
}

['pointerdown', 'keydown', 'wheel', 'touchstart', 'input'].forEach((ev) =>
  document.addEventListener(ev, () => (lastActivity = Date.now()), { passive: true, capture: true })
);

function checkIdle() {
  if (data && !noPassword && data.settings.autoLockMin > 0 && Date.now() - lastActivity > data.settings.autoLockMin * 60000) {
    lock('Verrouillée automatiquement après inactivité.');
  }
}
setInterval(checkIdle, 10000);

document.addEventListener('visibilitychange', () => {
  if (!data) return;
  if (document.hidden && data.settings.lockOnHide && !noPassword) lock();
  else if (!document.hidden) checkIdle();
});

async function afterUnlock() {
  lastActivity = Date.now();
  // Le portefeuille choisi au tableau de bord (« Mes dossiers ») s'applique aussi aux missions et au suivi mensuel.
  ui.mf.resp = data.settings.dashResp || '';
  ui.grille.resp = data.settings.dashResp || '';
  await initAutoBackup();
  if (navigator.storage && navigator.storage.persist) {
    try {
      ui.persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
    } catch (e) {
      ui.persisted = false;
    }
  }
  renderShell();
  route();
}
