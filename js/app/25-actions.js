/*
 * Suivi Dossiers — Actions et événements.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const actions = {
  'lock': () => lock(),
  'open-device': async () => {
    const opened = await Vault.unlockDevice();
    if (!opened) return renderLock("L'ouverture sans mot de passe n'a pas fonctionné : saisissez le mot de passe.");
    data = migrate(opened);
    afterUnlock();
  },
  'toggle-discret': () => {
    data.settings.discret = !data.settings.discret;
    persist();
    renderShell();
    refresh();
  },
  'new-client': () => clientForm(),
  'edit-client': (el) => clientForm(clientById(el.dataset.id)),
  'archive-client': (el) => {
    const c = clientById(el.dataset.id);
    c.archive = !c.archive;
    c.archiveLe = c.archive ? todayStr() : null;
    log(c.id, c.archive ? 'Dossier archivé.' : 'Dossier réactivé.', true);
    persist();
    refresh();
  },
  'delete-client': async (el) => {
    const c = clientById(el.dataset.id);
    const ok = await ask({
      title: 'Supprimer le dossier',
      message: `Le dossier <strong>${esc(clientLabel(c))}</strong>, ses missions et son journal seront <strong>définitivement effacés</strong>. Pour la fin d'une mission, préférez l'archivage.`,
      okLabel: 'Supprimer définitivement',
      danger: true,
      confirmText: 'SUPPRIMER',
    });
    if (!ok) return;
    data.clients = data.clients.filter((x) => x.id !== c.id);
    data.missions = data.missions.filter((m) => m.clientId !== c.id);
    data.journal = data.journal.filter((j) => j.clientId !== c.id);
    await persist();
    toast('Dossier supprimé.');
    location.hash = '#/dossiers';
  },
  'new-mission': (el) => missionForm(null, el.dataset.client),
  'open-mission': (el) => missionSheet(el.dataset.id),
  'edit-mission': (el) => missionForm(missionById(el.dataset.id)),
  'delete-mission': async (el) => {
    const m = missionById(el.dataset.id);
    const ok = await ask({ title: 'Supprimer la mission', message: `Supprimer définitivement « ${esc(m.titre)} » ?`, okLabel: 'Supprimer', danger: true });
    if (!ok) return;
    data.missions = data.missions.filter((x) => x.id !== m.id);
    await persist();
    closeModal();
    refresh();
  },
  'complete-mission': (el) => {
    const m = missionById(el.dataset.id);
    m.etapes.forEach((e) => {
      if (!e.done) Object.assign(e, { done: true, doneAt: nowIso() });
    });
    toast(`« ${m.titre} » terminée.`);
    setStatus(m, 'termine');
    persist();
    closeModal();
    refresh();
  },
  'toggle-step': (el) => {
    const m = missionById(el.dataset.mission);
    toggleStep(m, el.dataset.step, el.checked);
    refresh();
  },
  'delete-note': async (el) => {
    const ok = await ask({ title: 'Supprimer la note', message: 'Supprimer définitivement cette note du journal ?', okLabel: 'Supprimer', danger: true });
    if (!ok) return;
    data.journal = data.journal.filter((j) => j.id !== el.dataset.id);
    persist();
    refresh();
  },
  'missions-more': () => {
    ui.mfLimit = (ui.mfLimit || 300) + 300;
    renderMissionList();
  },
  'filter-missions': (el) => {
    ui.mf = { q: '', statut: el.dataset.statut || 'ouvertes', resp: data.settings.dashResp || '', periode: el.dataset.periode || 'toutes', type: '' };
  },
  'close-modal': () => closeModal(),
  'new-template': () => templateForm(),
  'edit-template': (el) => templateForm(templateById(el.dataset.id)),
  'delete-template': async (el) => {
    const t = templateById(el.dataset.id);
    const ok = await ask({ title: 'Supprimer le modèle', message: `Supprimer le modèle « ${esc(t.nom)} » ? Les missions existantes ne sont pas modifiées.`, okLabel: 'Supprimer', danger: true });
    if (!ok) return;
    data.templates = data.templates.filter((x) => x.id !== t.id);
    persist();
    closeModal();
    refresh();
  },
  'import-sheet': () => startImport(),
  'cab-apply': async () => {
    const res = applyCabinet();
    await persist();
    closeModal();
    ui.cab = null;
    toast(`Classeur importé : ${res.clientsNew} dossier(s) créé(s), ${res.clientsUpd} mis à jour, ${res.created} mission(s) créée(s), ${res.updated} mise(s) à jour.`);
    if (location.hash === '#/dossiers') refresh();
    else location.hash = '#/dossiers';
  },
  'cab-classic': () => {
    const { book, fileName } = ui.cab;
    ui.cab = null;
    startImport({ book, file: { name: fileName }, classic: true });
  },
  'open-cal': (el) => openCalendar(el.dataset.client),
  'open-msg': (el) => openMessage(el.dataset.client, el.dataset.mission),
  'msg-model': (el) => {
    ui.msg.modele = el.dataset.model;
    renderMessage();
  },
  'supp-mail': (el) => supplierSend(el.dataset.k, false),
  'supp-copy': (el) => supplierSend(el.dataset.k, true),
  'msg-copy': async () => {
    const text = $('#msg-body').value;
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      $('#msg-body').select();
      document.execCommand('copy');
    }
    recordMessage();
    refresh();
    toast('Message copié : collez-le dans votre messagerie. Envoi noté dans le journal.');
  },
  'msg-mail': () => {
    const c = clientById(ui.msg.clientId);
    const url = `mailto:${encodeURIComponent(c.email).replace(/%40/g, '@')}?subject=${encodeURIComponent($('#msg-subject').value)}&body=${encodeURIComponent($('#msg-body').value)}`;
    recordMessage();
    closeModal();
    refresh();
    window.location.href = url;
    toast('Messagerie ouverte. Envoi noté dans le journal.');
  },
  'apply-cal': async () => {
    const res = applyCal();
    await persist();
    closeModal();
    toast(`${res.items.length} échéance(s) créée(s) pour ${res.clients.size} dossier(s).`);
    refresh();
  },
  'grille-mode': (el) => {
    data.settings.grilleMode = el.dataset.mode;
    data.settings.pointage = el.dataset.mode === 'pointage';
    persist();
    refresh();
  },
  'grille-sort': (el) => {
    const cur = grilleSort();
    data.settings.grilleSort = { key: el.dataset.key, dir: cur.key === el.dataset.key ? -cur.dir : 1 };
    persist();
    refresh();
  },
  'grille-steps': (el) => openGrillePop(el, missionById(el.dataset.id)),
  'grille-pop-close': () => {
    const pop = $('#grille-pop');
    const id = pop && pop.dataset.id;
    closeGrillePop();
    const td = id && $(`.grille td[data-id="${id}"]`);
    if (td) td.focus();
  },
  'grille-step': (el) => setGrilleStep(missionById(el.dataset.id), el.dataset.i === 'all' ? 'all' : Number(el.dataset.i)),
  'grille-toggle': (el) => {
    const m = missionById(el.dataset.id);
    if (!m) return;
    const count = data.missions.length;
    if (isOpen(m)) {
      m.etapes.forEach((e) => { if (!e.done) Object.assign(e, { done: true, doneAt: nowIso() }); });
      toast(`${m.titre} — ${clientLabel(clientById(m.clientId))} : OK`);
      setStatus(m, 'termine');
    } else {
      m.etapes.forEach((e) => Object.assign(e, { done: false, doneAt: null }));
      setStatus(m, 'a_faire');
      toast(`${m.titre} — ${clientLabel(clientById(m.clientId))} : annulé`);
    }
    persist();
    // Occurrence suivante créée : la grille change de forme, on la redessine.
    if (data.missions.length !== count) refresh();
    else updateGrilleCell(m);
  },
  'export-grille': () => exportGrille(),
  'batch-pick': async () => batchRun(await pickFiles('.txt,.csv,.tsv,.zip,text/plain,application/zip')),
  'batch-open': (el) => {
    const it = ui.batch && ui.batch.items[Number(el.dataset.i)];
    if (!it || !it.st) return;
    if (el.dataset.mois) Object.assign(it.st, { space: 'mois', section: 'mois-pieces', month: ymOf(it.sum.moisArrete) });
    ui.fecState = it.st;
    location.hash = '#/fec';
  },
  'batch-save': () => {
    const list = (ui.batch ? ui.batch.items : []).filter((it) => it.st && it.st.clientId);
    list.forEach((it) => withFec(it.st, it.profile, () => fecSave()));
    toast(`Synthèse enregistrée dans ${list.length} dossier(s).`);
  },
  'batch-xlsx': async () => {
    const ok = await ask({ title: 'Export Excel non chiffré', message: 'Le fichier liste les dossiers et leurs chiffres clés, <strong>non chiffrés</strong>. Supprimez-le après usage.', okLabel: 'Exporter' });
    if (ok) batchExport();
  },
  'fec-pick': async (el) => {
    // Depuis l'accueil de l'analyse : l'espace choisi s'ouvrira à l'arrivée du FEC.
    if (el.dataset.space && FEC_SPACES[el.dataset.space] && data.settings.fecSpace !== el.dataset.space) { data.settings.fecSpace = el.dataset.space; persist(); }
    startFec(await pickFile('.txt,.csv,.tsv,.zip,text/plain,application/zip', true));
  },
  'fec-tab': (el) => {
    ui.fec.section = el.dataset.tab;
    refresh();
  },
  'fec-space': (el) => {
    const f = ui.fec;
    if (!f || !FEC_SPACES[el.dataset.space]) return;
    Object.assign(f, { space: el.dataset.space, section: null });
    // L'espace choisi est repris à l'ouverture du FEC suivant.
    if (data.settings.fecSpace !== f.space) { data.settings.fecSpace = f.space; persist(); }
    refresh();
  },
  'fec-month': (el) => {
    const months = ui.fec.result.monthly.map((x) => x.mois);
    const ym = months[months.indexOf(fecMonth()) + Number(el.dataset.step)];
    if (ym) setFecMonth(ym);
    refresh();
  },
  'fec-profile': (el) => setFecProfile(el.dataset.to),
  'fec-export': async () => {
    const ok = await ask({ title: 'Export Excel non chiffré', message: "Le fichier contient la balance et l'analyse du dossier, <strong>non chiffrées</strong>. Enregistrez-le sur un support sécurisé et supprimez-le après usage.", okLabel: 'Exporter' });
    if (ok) fecExport();
  },
  'fec-save': () => fecSave(),
  'ecr-fec': () => ecrExport('fec'),
  'wp-memo': (el) => wpMemoAdd(el.dataset.k, el.dataset.sig, el.dataset.label),
  'wp-review': (el) => {
    const cy = wpStore().cycles;
    if (el.dataset.undo) delete cy[el.dataset.cycle];
    else cy[el.dataset.cycle] = { by: data.settings.utilisateur || '', at: nowIso() };
    if (!el.dataset.undo) { revisionSigned(); saisieSigned(el.dataset.cycle); }
    wpSave();
    refresh();
  },
  'wp-print': () => printHtml(workpaperHtml()),
  'tva-kind': (el) => {
    const st = tvaState();
    const ym = st.kind === 'quarter' ? tvaPeriod(st.key).months.filter((k) => ui.fec.result.cycles.tva.months[k]).pop() : st.key;
    st.kind = el.dataset.kind;
    st.key = st.kind === 'quarter' ? quarterOf(ym) : ym;
    refresh();
  },
  'tva-goto': (el) => {
    tvaState().key = el.dataset.key;
    monthFromTva();
    window.scrollTo(0, 0);
    refresh();
  },
  'tva-validate': (el) => tvaValidate(!!el.dataset.undo),
  'tva-print': () => printHtml(tvaHtml()),
  'tva-lines': async () => {
    const ok = await ask({ title: 'Export Excel non chiffré', message: 'Le fichier liste les écritures de TVA de la période, <strong>non chiffrées</strong>. Supprimez-le après usage.', okLabel: 'Exporter' });
    if (ok) tvaExport(true);
  },
  'tva-xlsx': async () => {
    const ok = await ask({ title: 'Export Excel non chiffré', message: 'Le fichier contient les montants de TVA du dossier, <strong>non chiffrés</strong>. Supprimez-le après usage.', okLabel: 'Exporter' });
    if (ok) tvaExport();
  },
  'memo-del': (el) => {
    const c = clientById(el.dataset.id);
    if (!c || !c.revisionMemo) return;
    delete c.revisionMemo[el.dataset.k];
    persist();
    refresh();
  },
  'ecr-xlsx': () => ecrExport('xlsx'),
  'ecr-csv': () => ecrExport('csv'),
  'fec-prev': async () => startFec(await pickFile('.txt,.csv,.tsv,.zip,text/plain,application/zip', true), 'prev'),
  'fec-note': () => openNote(),
  'prev-mode': (el) => {
    ui.fec.prevMode = el.dataset.mode;
    refresh();
  },
  'rappro-import': () => importStatement(),
  'rappro-reset': () => {
    ui.fec.rappro = null;
    refresh();
  },
  'rappro-xlsx': () => exportRappro(),
  'note-print': () => printNote(),
  'pieces-mode': (el) => {
    const st = piecesState();
    st.mode = el.dataset.mode;
    st.arrete = defaultArrete(ui.fec.result, st.mode);
    refresh();
  },
  'pieces-demande': () => createPiecesRequest(),
  'pieces-copy': async () => {
    const text = piecesText(selectedPieces());
    try { await navigator.clipboard.writeText(text); toast('Liste copiée.'); } catch (e) { toast('Copie impossible sur ce navigateur.', true); }
  },
  'pieces-xlsx': () => exportPiecesXlsx(),
  'fec-mission': () => fecMission(),
  'open-ics': () => icsForm(),
  'autobackup-choose': () => chooseAutoBackup(),
  'autobackup-resume': () => resumeAutoBackup(),
  'autobackup-stop': () => stopAutoBackup(),
  'grille-reset': () => {
    ui.grille.regime = '';
    refresh();
  },
  'apply-import': async () => {
    const res = applyImport();
    await persist();
    closeModal();
    ui.imp = null;
    toast(`Import terminé : ${res.created} dossier(s) créé(s), ${res.updated} mis à jour` +
      (res.newMissions ? `, ${res.newMissions} mission(s) créée(s)` : '') +
      (res.closedMissions ? `, ${res.closedMissions} mission(s) passée(s) à « terminé »` : '') + '.');
    if (location.hash === '#/dossiers') refresh();
    else location.hash = '#/dossiers';
  },
  'dossier-view': (el) => {
    data.settings.dossierView = el.dataset.view;
    persist();
    refresh();
  },
  'go': (el) => {
    location.hash = el.dataset.href;
  },
  'export-backup': () => exportBackup(),
  'import-backup': () => importBackup(),
  'export-csv': () => exportCsv(),
  'restore-setup': async () => {
    const res = await readBackupInteractive();
    if (!res) return;
    await Vault.create(res.password, res.data);
    data = res.data;
    toast('Sauvegarde restaurée. Utilisez le mot de passe de la sauvegarde pour déverrouiller.');
    afterUnlock();
  },
  'reset-all': async () => {
    const ok = await ask({
      title: 'Effacer toutes les données',
      message: 'Toutes les données de cet appareil seront <strong>définitivement effacées</strong>. Cette action est irréversible.',
      okLabel: 'Tout effacer',
      danger: true,
      confirmText: 'EFFACER',
    });
    if (!ok) return;
    await saving;
    clearTimeout(autoBackupTimer);
    autoBackupHandle = null;
    ui.autoBackup = null;
    await Vault.destroy();
    if (fecWorker) fecWorker.terminate();
    fecWorker = null;
    forgetSession();
    data = null;
    closeModal();
    location.hash = '';
    renderSetup();
  },
};

document.addEventListener('click', (e) => {
  const pop = $('#grille-pop');
  if (pop && !pop.contains(e.target) && !e.target.closest('[data-action="grille-steps"]')) closeGrillePop();
  const el = e.target.closest('[data-action]');
  if (!el || !actions[el.dataset.action]) return;
  if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') e.preventDefault();
  const fromPop = pop && pop.contains(el);
  actions[el.dataset.action](el, e);
  // La fenêtre des étapes reste ouverte pour cocher plusieurs étapes d'affilée.
  if (fromPop && !['grille-step', 'grille-pop-close'].includes(el.dataset.action)) closeGrillePop();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('#grille-pop')) {
    const id = $('#grille-pop').dataset.id;
    closeGrillePop();
    const td = $(`.grille td[data-id="${id}"]`);
    if (td) td.focus();
    return;
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button][data-action]')) {
    e.preventDefault();
    e.target.click();
  }
});

// Mémorise les contrôles dépliés de la feuille de travail pour les garder ouverts après une mise à jour.
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (!d.dataset || !d.dataset.wpk || !ui.fec) return;
  ui.fec.wpOpen = ui.fec.wpOpen || new Set();
  d.open ? ui.fec.wpOpen.add(d.dataset.wpk) : ui.fec.wpOpen.delete(d.dataset.wpk);
}, true);

document.addEventListener('change', (e) => {
  const t = e.target;
  if (!data) return;
  if (t.dataset.imp && ui.imp) {
    onImportChange(t);
  } else if (t.dataset.cab && ui.cab) {
    onCabChange(t);
  } else if (t.dataset.cal && ui.cal) {
    onCalChange(t);
  } else if (t.dataset.msg === 'mission' && ui.msg) {
    t.checked ? ui.msg.selected.add(t.value) : ui.msg.selected.delete(t.value);
    renderMessage();
  } else if (t.dataset.rappro && ui.fec) {
    const st = rapproState();
    const k = t.dataset.rappro;
    if (k === 'tol') st.tol = Math.max(0, Math.min(31, Number(t.value) || 0));
    else if (k === 'include') st.include = t.checked;
    else st[k] = t.value;
    refresh();
  } else if (t.dataset.comment !== undefined && ui.fec) {
    const store = revueComments();
    store.comments[t.dataset.comment] = t.value.trim();
    if (clientById(ui.fec.clientId)) persist();
  } else if (t.dataset.revue === 'seuil' && ui.fec) {
    ui.fec.seuil = Math.max(0, Number(t.value) || 0);
    refresh();
  } else if (t.dataset.revue === 'note' && ui.fec) {
    revueComments().note = t.value.trim();
    if (clientById(ui.fec.clientId)) persist();
    $('#modal .note-preview').innerHTML = noteHtml();
  } else if (t.dataset.device !== undefined && t.type === 'checkbox') {
    setDeviceMode(t);
  } else if (t.dataset.supp && ui.fec && ui.fec.result) {
    const c = clientById(ui.fec.clientId);
    if (!c) return;
    c.fournisseurs = c.fournisseurs || {};
    const it = (c.fournisseurs[t.dataset.k] = c.fournisseurs[t.dataset.k] || {});
    it.lib = t.dataset.lib;
    it[t.dataset.supp] = t.value.trim();
    persist();
  } else if (t.dataset.wp && ui.fec && ui.fec.result) {
    const w = t.dataset.wp;
    if (w === 'st') { wpSetItem(t.dataset.k, { st: t.value }); refresh(); }
    else if (w === 'note') wpSetItem(t.dataset.k, { note: t.value.trim() });
    else if (w === 'el-st') { wpSetEl(t.dataset.k, t.dataset.e, { st: t.value }, t.dataset.label, t.dataset.check); refresh(); }
    else if (w === 'el-note') wpSetEl(t.dataset.k, t.dataset.e, { note: t.value.trim() }, t.dataset.label, t.dataset.check);
    else if (w === 'hide') { ui.fec.wpHide = t.checked; refresh(); }
    else if (w === 'bulk' && t.value !== '-') {
      const li = t.closest('details');
      $$('select[data-wp="el-st"]', li).filter((sel) => !sel.value).forEach((sel) => wpSetEl(sel.dataset.k, sel.dataset.e, { st: t.value }, sel.dataset.label, sel.dataset.check));
      refresh();
    }
  } else if ((t.dataset.ecr || t.dataset.ecrSel || t.dataset.ecrAmt || t.dataset.ecrCpte) && ui.fec && ui.fec.result) {
    const st = ecrState();
    if (t.dataset.ecrSel) {
      if (t.checked) { st.off.delete(t.dataset.ecrSel); st.forceOn.add(t.dataset.ecrSel); }
      else { st.off.add(t.dataset.ecrSel); st.forceOn.delete(t.dataset.ecrSel); }
    }
    else if (t.dataset.ecrAmt) { const v = parseFloat(String(t.value).replace(',', '.')); if (Number.isFinite(v) && v >= 0) st.amounts[t.dataset.ecrAmt] = v; }
    else if (t.dataset.ecrCpte) { const v = t.value.trim().toUpperCase(); if (/^[1-7][0-9A-Z]{2,19}$/.test(v)) st.cptes[t.dataset.ecrCpte] = v; else toast('Numéro de compte invalide.', true); }
    else if (t.dataset.ecr === 'journal') st.journal = (t.value.trim().toUpperCase() || 'OD').slice(0, 6);
    else if (t.dataset.ecr === 'date') { if (t.value) st.date = t.value; }
    else if (t.dataset.ecr === 'extourne') st.extourne = t.checked;
    else if (t.dataset.ecr === 'taux') { const v = Number(t.value); if (v >= 0 && v <= 100) { st.taux = v; Object.keys(st.amounts).filter((k) => k.startsWith('dep:')).forEach((k) => delete st.amounts[k]); } }
    refresh();
  } else if (t.dataset.tva === 'key' && ui.fec && ui.fec.result) {
    tvaState().key = t.value;
    monthFromTva();
    refresh();
  } else if (t.dataset.tvaNet) {
    // Montant déclaré d'une mission TVA (fiche de la mission ou fenêtre du suivi mensuel)
    const box = t.closest('.tva-amt');
    const m = box && missionById(box.dataset.id);
    if (!m) return;
    const sens = $('[data-tva-net=sens]', box).value;
    const input = $('[data-tva-net=montant]', box);
    input.disabled = sens === 'neant';
    if (!setTvaNet(m, sens, input.value)) return;
    input.value = tvaNetSet(m) && m.tvaNet ? eur(Math.abs(m.tvaNet)) : '';
    if (tvaNetSet(m) && m.tvaNet < 0 && sens !== 'credit') $('[data-tva-net=sens]', box).value = 'credit';
    const src = $('.muted', box);
    if (src) src.remove();
    // Page derrière : seule la case de la grille est mise à jour, sinon la page est redessinée (fenêtre ouverte conservée).
    if ($(`.grille td[data-id="${m.id}"]`)) updateGrilleCell(m);
    else if (!box.closest('#grille-pop')) { const y = window.scrollY; route(); window.scrollTo(0, y); }
  } else if (t.dataset.tvaDecl && ui.fec && ui.fec.result) {
    const key = tvaState().key;
    const store = tvaDeclStore();
    const d = (store[key] = store[key] || {});
    const v = String(t.value).replace(',', '.').trim();
    d[t.dataset.tvaDecl] = v === '' || !Number.isFinite(Number(v)) ? '' : Number(v);
    if (Object.values(d).every((x) => x === '')) delete store[key];
    // Le net déclaré est aussi le montant de la mission TVA de la période (suivi mensuel).
    const mt = t.dataset.tvaDecl === 'net' && tvaMissionOf(ui.fec.clientId, tvaPeriod(key).exercice);
    if (mt) setTvaNet(mt, d.net < 0 ? 'credit' : d.net === 0 ? 'neant' : 'payer', d.net === '' ? '' : String(Math.abs(d.net)));
    if (clientById(ui.fec.clientId)) persist();
    refresh();
  } else if (t.dataset.piece && ui.fec) {
    const st = piecesState();
    t.checked ? st.excluded.delete(t.dataset.piece) : st.excluded.add(t.dataset.piece);
    refresh();
  } else if (t.dataset.pieces === 'arrete' && ui.fec) {
    if (t.value) piecesState().arrete = t.value;
    refresh();
  } else if (t.dataset.fec && ui.fec) {
    if (t.dataset.fec === 'q') return;
    if (t.dataset.fec === 'profile') return setFecProfile(t.value);
    if (t.dataset.fec === 'month') setFecMonth(t.value);
    else if (t.dataset.fec === 'client') {
      ui.fec.clientId = t.value;
      // Dossier dont l'activité est connue : elle fixe le profil d'analyse.
      const c = clientById(t.value);
      if (c && c.activite) Object.assign(ui.fec, { profile: c.activite, profileAuto: false });
    } else ui.fec[t.dataset.fec] = t.value;
    refresh();
  } else if (t.dataset.dash) {
    data.settings.dashResp = t.value;
    ui.mf.resp = t.value;
    ui.grille.resp = t.value;
    persist();
    refresh();
  } else if (t.dataset.grilleSort !== undefined && t.tagName === 'SELECT') {
    data.settings.grilleSort = { key: t.value, dir: 1 };
    persist();
    refresh();
  } else if (t.dataset.grille) {
    ui.grille[t.dataset.grille] = t.value;
    refresh();
  } else if (t.dataset.actionChange === 'mission-status') {
    setStatus(missionById(t.dataset.id), t.value);
    persist();
    refresh();
  } else if (t.dataset.setting) {
    const key = t.dataset.setting;
    data.settings[key] = t.type === 'checkbox' ? t.checked : Number(t.value);
    persist();
    if (key === 'discret') renderShell();
    refresh();
    toast('Paramètre enregistré.');
  } else if (t.name === 'type' && t.form && t.form.dataset.form === 'mission') {
    applyTemplateToForm(t.form);
  } else if (t.name === 'clientId' && t.form && t.form.dataset.form === 'mission' && !t.form.dataset.id) {
    const c = clientById(t.value);
    if (c && c.responsable) t.form.responsable.value = c.responsable;
    applyTemplateToForm(t.form, true);
  }
});

// Pré-remplit le formulaire de mission à partir du modèle choisi.
function applyTemplateToForm(form, keepSteps) {
  const tpl = templateById(form.type.value);
  if (!tpl) return;
  const c = clientById(form.clientId.value);
  let exercice = tpl.recurrence === 'annuelle' ? lastClosedYear(c) : '';
  // TVA mensuelle : période du mois précédent, échéance au jour limite du dossier.
  if (tpl.id === 'tva' && tpl.recurrence === 'mensuelle') {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    exercice = `${pad(prev.getMonth() + 1)}/${prev.getFullYear()}`;
    if (c && c.jourTva && !form.echeance.value) form.echeance.value = dayOfMonth(now.getFullYear(), now.getMonth(), c.jourTva);
  }
  const autoTitles = data.templates.map((t) => t.nom);
  const currentTitle = form.titre.value.trim();
  if (!currentTitle || autoTitles.some((n) => currentTitle === n || currentTitle.startsWith(n + ' '))) {
    form.titre.value = tpl.nom + (exercice ? ' ' + exercice : '');
  }
  form.exercice.value = exercice;
  if (!keepSteps) {
    form.recurrence.value = tpl.recurrence;
    form.etapes.value = tpl.etapes.join('\n');
  }
}

// Recherche : la liste est redessinée une fois la frappe terminée (pas à chaque lettre sur un gros portefeuille).
let filterTimer = null;
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.filter && data) {
    const path = t.dataset.filter.split('.');
    const value = t.type === 'checkbox' ? t.checked : t.value;
    if (path.length === 2) ui[path[0]][path[1]] = value;
    else ui[path[0]] = value;
    const render = () => {
      if (path[0] === 'mf') { ui.mfLimit = 300; renderMissionList(); }
      else renderDossierList();
    };
    clearTimeout(filterTimer);
    if (t.type === 'search' && data.clients.length > 150) filterTimer = setTimeout(render, 150);
    else render();
  }
  if (t.dataset.fec === 'q' && ui.fec) {
    ui.fec.q = t.value;
    const pos = t.selectionStart;
    refresh();
    const again = $('input[data-fec="q"]');
    if (again) { again.focus(); again.setSelectionRange(pos, pos); }
  }
  if (t.name === 'p1' && t.form) {
    const bar = $('[data-strength]', t.form);
    if (bar) bar.dataset.score = t.value ? passwordScore(t.value) : '';
  }
});
