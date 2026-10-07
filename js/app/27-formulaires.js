/*
 * Suivi Dossiers — Formulaires et démarrage.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------------------------------------------------------------------------
// Formulaires
// ---------------------------------------------------------------------------

function formError(form, msg) {
  const el = $('[data-error]', form);
  if (el) el.textContent = msg || '';
}

const val = (form, name) => (form.elements[name] ? form.elements[name].value.trim() : '');

const forms = {
  async setup(form) {
    const p1 = form.p1.value;
    if (p1.length < 10) return formError(form, 'Le mot de passe doit contenir au moins 10 caractères.');
    if (p1 !== form.p2.value) return formError(form, 'Les mots de passe ne correspondent pas.');
    if (passwordScore(p1) < 2) return formError(form, 'Mot de passe trop faible : allongez-le ou mélangez lettres, chiffres et symboles.');
    form.querySelector('button[type=submit]').disabled = true;
    data = emptyData();
    await Vault.create(p1, data);
    if (form.device.checked) {
      await Vault.rememberDevice();
      noPassword = true;
    }
    afterUnlock();
  },

  async unlock(form) {
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Déchiffrement…';
    try {
      data = migrate(await Vault.unlock(form.password.value));
      failedAttempts = 0;
      afterUnlock();
    } catch (e) {
      failedAttempts++;
      form.password.value = '';
      const wait = Math.min(30, 2 ** Math.max(0, failedAttempts - 2));
      formError(form, e.message + (failedAttempts > 2 ? ` Patientez ${wait} s.` : ''));
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = 'Déverrouiller';
        form.password.focus();
      }, failedAttempts > 2 ? wait * 1000 : 0);
    }
  },

  async client(form) {
    const id = form.dataset.id;
    const fields = ['nom', 'code', 'forme', 'siren', 'cloture', 'regimeFiscal', 'regimeTva', 'activite', 'jourTva', 'responsable', 'collaborateur', 'superviseur', 'contact', 'email', 'tel', 'lettreMission', 'vigilance', 'kycDate', 'notes'];
    const values = Object.fromEntries(fields.map((f) => [f, val(form, f)]));
    values.code = values.code.toUpperCase() || genCode(values.nom, id);
    if (data.clients.some((c) => c.code === values.code && c.id !== id)) {
      form.code.setCustomValidity('Ce code est déjà utilisé.');
      form.code.reportValidity();
      form.code.addEventListener('input', () => form.code.setCustomValidity(''), { once: true });
      return;
    }
    let c;
    if (id) {
      c = Object.assign(clientById(id), values, { updatedAt: nowIso() });
    } else {
      c = Object.assign({ id: uid(), archive: false, createdAt: nowIso(), updatedAt: nowIso() }, values);
      data.clients.push(c);
      log(c.id, 'Dossier créé.', true);
    }
    addCollaborateurs([values.responsable, values.collaborateur, values.superviseur]);
    await persist();
    closeModal();
    if (!id) location.hash = '#/dossier/' + c.id;
    else refresh();
    toast(id ? 'Dossier mis à jour.' : 'Dossier créé.');
  },

  async mission(form) {
    const id = form.dataset.id;
    const labels = form.etapes.value.split('\n').map((s) => s.trim()).filter(Boolean);
    const existing = id ? missionById(id) : null;
    const pool = existing ? existing.etapes.slice() : [];
    const etapes = labels.map((label) => {
      const i = pool.findIndex((e) => e.label === label);
      if (i >= 0) return pool.splice(i, 1)[0];
      return { id: uid(), label, done: false, doneAt: null };
    });
    const values = {
      clientId: val(form, 'clientId'),
      titre: val(form, 'titre'),
      exercice: val(form, 'exercice'),
      echeance: val(form, 'echeance'),
      priorite: val(form, 'priorite'),
      responsable: val(form, 'responsable'),
      recurrence: val(form, 'recurrence'),
      notes: val(form, 'notes'),
      etapes,
    };
    const statut = val(form, 'statut');
    let m;
    if (existing) {
      if (existing.clientId !== values.clientId) resetMissionIdx();
      m = Object.assign(existing, values, { updatedAt: nowIso() });
    } else {
      m = Object.assign({ id: uid(), type: val(form, 'type'), statut: 'a_faire', createdAt: nowIso(), updatedAt: nowIso() }, values);
      data.missions.push(m);
      log(m.clientId, `Mission « ${m.titre} » créée.`, true);
    }
    setStatus(m, statut);
    addCollaborateurs([values.responsable]);
    await persist();
    closeModal();
    refresh();
    toast(existing ? 'Mission mise à jour.' : 'Mission créée.');
  },

  async journal(form) {
    const texte = form.texte.value.trim();
    if (!texte) return;
    log(form.dataset.client, texte, false);
    await persist();
    refresh();
  },

  async settings(form) {
    const s = data.settings;
    s.cabinet = val(form, 'cabinet');
    s.utilisateur = val(form, 'utilisateur');
    s.collaborateurs = Array.from(new Set(form.collaborateurs.value.split('\n').map((x) => x.trim()).filter(Boolean)));
    s.kycMois = Math.max(1, Number(val(form, 'kycMois')) || 12);
    s.relanceJours = Math.max(1, Number(val(form, 'relanceJours')) || 7);
    s.signature = form.signature.value.trim();
    s.piecesIgnore = Array.from(new Set(form.piecesIgnore.value.split('\n').map((x) => x.trim()).filter(Boolean)));
    await persist();
    renderShell();
    route();
    toast('Paramètres enregistrés.');
  },

  async password(form) {
    const p1 = form.p1.value;
    if (p1 !== form.p2.value) return formError(form, 'Les mots de passe ne correspondent pas.');
    if (passwordScore(p1) < 2) return formError(form, 'Nouveau mot de passe trop faible.');
    try {
      await saving;
      await Vault.changePassword(form.old.value, p1, data);
      form.reset();
      formError(form, '');
      toast('Mot de passe modifié. Pensez à refaire une sauvegarde : les anciennes restent protégées par l\'ancien mot de passe.');
    } catch (e) {
      formError(form, e.message);
    }
  },

  ics(form) {
    const { text, count } = buildIcs({
      months: Number(form.months.value),
      reminder: Number(form.reminder.value),
      resp: form.resp.value,
      names: form.names.value === 'noms',
    });
    if (!count) return formError(form, 'Aucune échéance à venir sur cette période.');
    download(`echeances-cabinet-${todayStr()}.ics`, text, 'text/calendar;charset=utf-8');
    closeModal();
    toast(`${count} échéance(s) exportée(s). Ouvrez le fichier avec votre agenda.`);
  },

  async template(form) {
    const id = form.dataset.id;
    const values = {
      nom: val(form, 'nom'),
      recurrence: val(form, 'recurrence'),
      etapes: form.etapes.value.split('\n').map((s) => s.trim()).filter(Boolean),
    };
    const before = id ? templateById(id).etapes.slice() : null;
    if (id) Object.assign(templateById(id), values);
    else data.templates.push(Object.assign({ id: uid() }, values));
    closeModal();
    // Étapes modifiées : proposées aux missions en cours de ce modèle restées conformes à l'ancien modèle.
    if (before && before.join('\n') !== values.etapes.join('\n')) {
      const same = (m) => m.etapes.map((e) => e.label).join('\n') === before.join('\n');
      const open = data.missions.filter((m) => m.type === id && isOpen(m));
      const list = open.filter(same);
      if (list.length && await ask({
        title: 'Mettre à jour les missions en cours ?',
        message: `<strong>${list.length} mission(s) en cours</strong> du modèle « ${esc(values.nom)} » ont encore les anciennes étapes. Leur appliquer les nouvelles ? Les étapes déjà cochées le restent.${open.length > list.length ? ` ${open.length - list.length} mission(s) aux étapes personnalisées ne seront pas modifiées.` : ''}`,
        okLabel: 'Mettre à jour',
      })) {
        list.forEach((m) => {
          const pool = m.etapes.slice();
          m.etapes = values.etapes.map((label) => {
            const i = pool.findIndex((e) => e.label === label);
            return i >= 0 ? pool.splice(i, 1)[0] : { id: uid(), label, done: false, doneAt: null };
          });
          m.updatedAt = nowIso();
        });
        toast(`${list.length} mission(s) mise(s) à jour avec les nouvelles étapes.`);
      }
    }
    await persist();
    refresh();
  },
};

document.addEventListener('submit', (e) => {
  const form = e.target;
  const name = form.dataset.form;
  if (!name || !forms[name]) return;
  e.preventDefault();
  formError(form, '');
  Promise.resolve(forms[name](form)).catch((err) => {
    formError(form, err.message);
    toast(err.message, true);
  });
});

window.addEventListener('hashchange', () => {
  closeGrillePop();
  if ($('#modal').open) closeModal();
  route();
  window.scrollTo(0, 0);
});

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

async function start() {
  if (!window.isSecureContext || !window.crypto || !crypto.subtle || !window.indexedDB) {
    $('#app').innerHTML = `<div class="lock-screen"><div class="lock-card"><h1>Suivi Dossiers</h1>
      <p>Cette application doit être ouverte via <strong>https://</strong> (ou http://localhost) dans un navigateur récent, afin de pouvoir chiffrer les données.</p></div></div>`;
    return;
  }
  try {
    if (!(await Vault.exists())) renderSetup();
    else {
      noPassword = await Vault.hasDevice();
      const opened = noPassword ? await Vault.unlockDevice() : null;
      if (opened) {
        data = migrate(opened);
        afterUnlock();
      } else renderLock(noPassword ? "L'ouverture sans mot de passe n'a pas fonctionné : saisissez le mot de passe." : '');
    }
  } catch (e) {
    $('#app').innerHTML = `<div class="lock-screen"><div class="lock-card"><h1>Suivi Dossiers</h1>
      <p>Le stockage local est indisponible (navigation privée ?). ${esc(e.message)}</p></div></div>`;
  }
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || local)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

start();
