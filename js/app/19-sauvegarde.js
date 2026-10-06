/*
 * Suivi Dossiers — Sauvegarde automatique et export vers l’agenda.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------------------------------------------------------------------------
// Sauvegarde automatique dans un fichier (Chrome / Edge sur ordinateur)
// ---------------------------------------------------------------------------

const AUTO_BACKUP_DELAY = 20000;
let autoBackupTimer = null;
let autoBackupHandle = null;
const autoBackupSupported = () => typeof window.showSaveFilePicker === 'function';

function scheduleAutoBackup() {
  if (!autoBackupHandle || !ui.autoBackup || !ui.autoBackup.active) return;
  clearTimeout(autoBackupTimer);
  autoBackupTimer = setTimeout(writeAutoBackup, AUTO_BACKUP_DELAY);
}

// Écrit la sauvegarde chiffrée dans le fichier choisi (même format que l'export manuel).
async function writeAutoBackup() {
  clearTimeout(autoBackupTimer);
  autoBackupTimer = null;
  if (!autoBackupHandle || !data) return false;
  try {
    data.settings.lastBackup = nowIso();
    await persist({ noAutoBackup: true });
    const text = await Vault.exportBackup(data);
    const writable = await autoBackupHandle.createWritable();
    await writable.write(text);
    await writable.close();
    ui.autoBackup = { active: true, name: autoBackupHandle.name, last: nowIso() };
    return true;
  } catch (e) {
    ui.autoBackup = { active: false, needsPermission: true, name: autoBackupHandle.name };
    return false;
  }
}

async function initAutoBackup() {
  ui.autoBackup = null;
  autoBackupHandle = null;
  if (!autoBackupSupported()) return;
  try {
    const handle = await Vault.getMeta('autoBackup');
    if (!handle) return;
    autoBackupHandle = handle;
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      ui.autoBackup = { active: true, name: handle.name };
      writeAutoBackup();
    } else {
      ui.autoBackup = { active: false, needsPermission: true, name: handle.name };
    }
  } catch (e) {
    ui.autoBackup = null;
  }
}

async function chooseAutoBackup() {
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: 'suivi-dossiers-sauvegarde-auto.json',
      types: [{ description: 'Sauvegarde chiffrée', accept: { 'application/json': ['.json'] } }],
    });
    autoBackupHandle = handle;
    await Vault.setMeta('autoBackup', handle);
    ui.autoBackup = { active: true, name: handle.name };
    if (await writeAutoBackup()) toast('Sauvegarde automatique activée.');
    refresh();
  } catch (e) {
    if (e.name !== 'AbortError') toast(e.message, true);
  }
}

async function resumeAutoBackup() {
  if (!autoBackupHandle) return;
  try {
    if ((await autoBackupHandle.requestPermission({ mode: 'readwrite' })) === 'granted' && (await writeAutoBackup())) {
      toast('Sauvegarde automatique réactivée.');
    }
  } catch (e) {
    toast(e.message, true);
  }
  refresh();
}

async function stopAutoBackup() {
  clearTimeout(autoBackupTimer);
  autoBackupHandle = null;
  ui.autoBackup = null;
  await Vault.setMeta('autoBackup', undefined);
  toast('Sauvegarde automatique désactivée.');
  refresh();
}

function autoBackupCard() {
  const ab = ui.autoBackup;
  let body;
  if (!autoBackupSupported()) {
    body = `<p class="muted small">Disponible sur <strong>ordinateur</strong> avec Chrome ou Edge. Sur cet appareil, utilisez « Exporter une sauvegarde chiffrée » régulièrement.</p>`;
  } else if (ab && ab.active) {
    body = `<p>✓ Active — fichier <strong>${esc(ab.name)}</strong>${ab.last ? `, mis à jour le ${fmtDateTime(ab.last)}` : ''}.</p>
      <p class="muted small">Le fichier chiffré est réécrit 20 secondes après chaque modification et à chaque ouverture.</p>
      <div class="stack"><button class="btn block" data-action="autobackup-choose">Changer de fichier</button><button class="btn block" data-action="autobackup-stop">Désactiver</button></div>`;
  } else if (ab && ab.needsPermission) {
    body = `<p>Le navigateur demande une nouvelle autorisation pour écrire dans <strong>${esc(ab.name)}</strong>.</p>
      <div class="stack"><button class="btn primary block" data-action="autobackup-resume">Réactiver</button><button class="btn block" data-action="autobackup-stop">Désactiver</button></div>`;
  } else {
    body = `<p class="muted small">Choisissez un fichier, par exemple sur le serveur du cabinet ou dans un dossier synchronisé : l'application y écrit automatiquement une sauvegarde <strong>chiffrée</strong> après chaque modification. Vous n'avez plus à y penser.</p>
      <button class="btn primary block" data-action="autobackup-choose">Choisir le fichier de sauvegarde</button>`;
  }
  return `<section class="card"><h2>Sauvegarde automatique</h2>${body}</section>`;
}

// ---------------------------------------------------------------------------
// Export vers l'agenda (.ics)
// ---------------------------------------------------------------------------

function icsEscape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Replie les lignes à 75 octets comme l'exige le format iCalendar.
function icsFold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > 74) {
      out.push(cur);
      cur = ' ' + ch;
      bytes = 1 + b;
    } else {
      cur += ch;
      bytes += b;
    }
  }
  out.push(cur);
  return out.join('\r\n');
}

function buildIcs({ months, names, reminder, resp }) {
  const today = todayStr();
  const end = addMonths(today, months);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const list = data.missions
    .filter((m) => isOpen(m) && m.echeance && m.echeance >= today && m.echeance <= end)
    .filter((m) => {
      const c = clientById(m.clientId);
      return c && !c.archive && missionInPortfolio(m, resp);
    })
    .sort(byDue);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Suivi Dossiers//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Échéances du cabinet'];
  list.forEach((m) => {
    const c = clientById(m.clientId);
    const who = names ? c.nom : c.code || '••••';
    lines.push(
      'BEGIN:VEVENT',
      `UID:${m.id}@suivi-dossiers`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${m.echeance.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${addDays(m.echeance, 1).replace(/-/g, '')}`,
      `SUMMARY:${icsEscape(`${m.titre} — ${who}`)}`,
      `DESCRIPTION:${icsEscape(`Statut : ${STATUTS[m.statut]}${m.responsable ? `\nResponsable : ${m.responsable}` : ''}\nDétails dans l'application Suivi Dossiers.`)}`,
      'TRANSP:TRANSPARENT'
    );
    if (reminder > 0) {
      // Rappel à 9 h, `reminder` jour(s) avant l'échéance.
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(`Échéance : ${m.titre} — ${who}`)}`, `TRIGGER:-P${reminder > 1 ? reminder - 1 + 'D' : ''}T15H`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return { text: lines.map(icsFold).join('\r\n') + '\r\n', count: list.length };
}

function icsForm() {
  const s = data.settings;
  const resps = allResps();
  modalRefresh = null;
  openModal(`
    <form data-form="ics" autocomplete="off">
      <header class="modal-head"><h2>Échéances dans mon agenda</h2><button type="button" class="icon-btn" data-action="close-modal" aria-label="Fermer">✕</button></header>
      <div class="modal-body">
        <p class="muted small">Crée un fichier <strong>.ics</strong> à ouvrir avec votre agenda (Outlook, Google Agenda, Calendrier de l'iPhone…) pour recevoir des rappels, même application fermée. Réimportez-le après chaque mise à jour : les événements existants sont remplacés.</p>
        <div class="form-grid">
          <label>Période<select name="months">${options({ 1: '1 mois', 3: '3 mois', 6: '6 mois', 12: '12 mois' }, '3')}</select></label>
          <label>Rappel<select name="reminder">${options({ 0: 'Aucun', 1: 'La veille à 9 h', 2: '2 jours avant à 9 h', 7: '1 semaine avant à 9 h' }, '2')}</select></label>
          <label>Dossiers<select name="resp">${options(resps, s.dashResp, 'Tous les dossiers')}</select></label>
          <label>Libellé des événements<select name="names">${options({ codes: 'N° de dossier uniquement (recommandé)', noms: 'Nom du client' }, 'codes')}</select></label>
        </div>
        <div class="info-box small">Les agendas en ligne (Google, iCloud, Outlook.com) stockent les événements chez leur éditeur : conservez le libellé « N° de dossier uniquement » pour qu'aucun nom de client n'y figure.</div>
        <p class="form-error" data-error></p>
      </div>
      <footer class="modal-foot"><button type="button" class="btn" data-action="close-modal">Annuler</button><button class="btn primary" type="submit">Télécharger le fichier agenda</button></footer>
    </form>`);
}
