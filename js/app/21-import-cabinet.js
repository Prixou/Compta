/*
 * Suivi Dossiers — Import du classeur de suivi du cabinet.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------------------------------------------------------------------------
// Import du classeur de suivi du cabinet (tous les onglets)
// ---------------------------------------------------------------------------

const CAB_TABS = [
  { key: 'info', re: /info\s*dossier/, label: 'INFO DOSSIER', desc: 'Fiches des dossiers' },
  { key: 'tva', re: /suivi\s*tva/, label: 'SUIVI TVA', desc: 'Déclarations de TVA (mois cochés OK)' },
  { key: 'revision', re: /suivi\s*revision/, label: 'SUIVI RÉVISION', desc: 'Bilans avec vos étapes de révision' },
  { key: 'situation', re: /suivi\s*situation/, label: 'SUIVI SITUATION', desc: 'Situations intermédiaires' },
  { key: 'declaration', re: /suivi\s*declaration/, label: 'SUIVI DÉCLARATION', desc: 'Acomptes et solde d\'IS, CA12, CFE, CVAE, DAS2…' },
  { key: 'saisie', re: /suivi\s*saisie/, label: 'SUIVI SAISIE', desc: 'Saisie mensuelle' },
];

const STAGE_LABELS = {
  'saisie': 'Saisie', 'pointages': 'Pointages', 'en cours de revision': 'En cours de révision', 'questions client envoyees': 'Questions client envoyées',
  'revise': 'Révisé', 'supervise': 'Supervisé', 'bilan image': 'Bilan image', 'rdv bilan': 'RDV bilan', 'fini / liasse faits': 'Fini / liasse faite',
  'envoi edi': 'Envoi EDI', 'envoi bat': 'Envoi BAT', 'envoi fn': 'Envoi FN',
};
const prettyStage = (t) => {
  const k = norm(t).replace(/\s+/g, ' ').trim();
  return STAGE_LABELS[k] || (k.charAt(0).toUpperCase() + k.slice(1));
};

const cabFindTab = (book, re) => book.sheets.find((s) => re.test(norm(s.name)));

// Ligne d'en-tête : la dernière des 10 premières lignes contenant « N° DOSSIER » et « DOSSIERS ».
function cabHeader(rows) {
  let idx = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const cells = rows[i].map((c) => norm(c.text));
    if (cells.some((c) => /^n\W*\s*dossier/.test(c)) && cells.includes('dossiers')) idx = i;
  }
  return idx;
}

function cabTable(sheet) {
  if (!sheet) return null;
  const h = cabHeader(sheet.rows);
  if (h < 0) return null;
  const header = sheet.rows[h].map((c) => c.text);
  const col = (re) => header.findIndex((t) => re.test(norm(t).replace(/\s+/g, ' ')));
  const iCode = col(/^n\W*\s*dossier/), iNom = col(/^dossiers$/);
  const rows = sheet.rows.slice(h + 1).filter((r) => r[iNom] && r[iNom].text).map((r) => {
    const code = r[iCode] ? r[iCode].text : '';
    return { cells: r, key: `${/^0+$/.test(code) ? '' : code.toUpperCase()}|${norm(r[iNom].text)}` };
  });
  return { sheet, h, header, col, rows, above: sheet.rows[h - 1] || [] };
}

const cellText = (r, i) => (i >= 0 && r.cells[i] ? r.cells[i].text.trim() : '');
const cellNa = (r, i) => i >= 0 && r.cells[i] && r.cells[i].na;

// État d'une case de suivi : 'done', 'todo' (vide), 'na' (hachurée ou non applicable) ou 'note' (autre texte).
function cabCell(r, i) {
  const t = cellText(r, i);
  if (!t) return { state: cellNa(r, i) ? 'na' : 'todo' };
  if (DONE_RE.test(t) || /^\d{4}-\d{2}-\d{2}$/.test(t)) return { state: 'done' };
  if (/^-?\d+([.,]\d+)?$/.test(t)) return { state: 'done', note: `montant ${eur(Number(t.replace(',', '.')), 0)} €` };
  if (NA_VALUES.has(norm(t)) || /^disp/i.test(t)) return { state: 'na', note: /^disp/i.test(t) ? 'dispensé' : '' };
  if (/^eux$/i.test(t)) return { state: 'na', note: 'fait par le client' };
  if (/\bok\b/i.test(t)) return { state: 'done', note: t };
  return { state: 'na', note: t };
}

// Étapes successives : une étape cochée implique que les précédentes sont faites.
function cascadeSteps(steps) {
  let last = -1;
  steps.forEach((s, i) => { if (s.done) last = i; });
  for (let i = 0; i < last; i++) steps[i].done = true;
}

function cabinetPlan() {
  const cab = ui.cab;
  const book = cab.book;
  const today = todayStr();
  const plan = { clients: [], missions: [], counts: {}, unknown: 0 };
  const info = cabTable(cabFindTab(book, CAB_TABS[0].re));
  // Filtre sur une colonne de INFO DOSSIER (ex. CJ = ABC).
  let keep = null;
  if (info && cab.filterCol >= 0 && cab.filterVal !== '') {
    keep = new Set(info.rows.filter((r) => cellText(r, cab.filterCol) === cab.filterVal).map((r) => r.key));
  }
  const allowed = (key) => !keep || keep.has(key);

  // Dossiers
  const infoByKey = new Map();
  if (info) {
    const used = new Set();
    const mapping = info.header.map((h) => {
      let f = guessField(h || '', used);
      if (f) used.add(f);
      else if (/associe|activite|logiciel|situation|comment/.test(norm(h))) f = 'notes';
      return f;
    });
    info.rows.filter((r) => allowed(r.key)).forEach((r) => {
      const get = (field) => { const i = mapping.indexOf(field); return cellText(r, i); };
      const v = {
        nom: get('nom'), code: /^0+$/.test(get('code')) ? '' : get('code').toUpperCase(),
        forme: get('forme') ? normForme(get('forme')) : '', siren: get('siren').replace(/\s+/g, ''),
        regimeTva: normRegimeTva(get('regimeTva')),
        jourTva: (() => { const n = parseInt(get('jourTva'), 10); return n >= 1 && n <= 31 ? String(n) : ''; })(),
        cloture: normCloture(get('cloture')), regimeFiscal: get('regimeFiscal'),
        responsable: get('responsable'), collaborateur: get('collaborateur'), superviseur: get('superviseur'),
      };
      const notes = mapping.map((f, i) => (f === 'notes' && cellText(r, i) ? `${info.header[i]} : ${/^\d{4}-\d{2}-\d{2}$/.test(cellText(r, i)) ? fmtDate(cellText(r, i)) : cellText(r, i)}` : '')).filter(Boolean);
      const jr = get('jourTva');
      if (jr && !/^\d{1,2}$/.test(jr)) notes.push(`Jour TVA : ${jr}`);
      infoByKey.set(r.key, v);
      if (cab.tabs.info) plan.clients.push({ key: r.key, v, notes });
    });
  }
  const existingFor = (key, v) => {
    const [code, nom] = key.split('|');
    return data.clients.find((c) => (code && c.code === code) || (!code && v && v.siren && c.siren === v.siren) || (!code && norm(c.nom) === nom));
  };
  plan.counts.clientsNew = plan.clients.filter((x) => !existingFor(x.key, x.v)).length;
  plan.counts.clientsUpd = plan.clients.length - plan.counts.clientsNew;
  const known = (key) => infoByKey.has(key) || !!existingFor(key);
  const addMission = (tabKey, key, spec) => {
    if (!allowed(key)) return;
    if (!known(key)) { plan.unknown++; return; }
    plan.missions.push({ tab: tabKey, key, spec });
    plan.counts[tabKey] = (plan.counts[tabKey] || 0) + 1;
    if (spec.done) plan.counts[tabKey + 'Done'] = (plan.counts[tabKey + 'Done'] || 0) + 1;
  };
  const infoOf = (key) => infoByKey.get(key) || existingFor(key) || {};
  const horizon = addMonths(today, 1);

  // SUIVI TVA
  const tva = cab.tabs.tva && cabTable(cabFindTab(book, CAB_TABS[1].re));
  if (tva) {
    const yearCell = tva.above.find((c) => c && /^\d{4}-\d{2}-\d{2}$/.test(c.text));
    const year = yearCell ? Number(yearCell.text.slice(0, 4)) : cab.year;
    const months = tva.header.map((t, i) => (/^\d{1,2}$/.test(String(t).trim()) && +t >= 1 && +t <= 12 ? [i, +t] : null)).filter(Boolean);
    tva.rows.forEach((r) => {
      const c = infoOf(r.key);
      const regime = norm(c.regimeTva || '');
      const monthly = regime.includes('mensuel'), quarterly = regime.includes('trimestriel');
      months.forEach(([i, n]) => {
        const cell = cabCell(r, i);
        if (cell.state === 'na') return;
        const quarter = quarterly && n % 3 === 0;
        const echeance = c.jourTva ? dayOfMonth(year, n, c.jourTva) : '';
        if (cell.state === 'todo') {
          if (!(monthly || quarter)) return;
          if (echeance ? echeance > horizon : dayOfMonth(year, n, 1) > today) return;
          if (!cab.pastTodo && echeance && echeance < today) return;
        }
        const label = quarter ? `T${n / 3} ${year}` : `${pad(n)}/${year}`;
        addMission('tva', r.key, { type: 'tva', titre: `TVA ${label}`, exercice: label, echeance, recurrence: quarter ? 'trimestrielle' : 'mensuelle', done: cell.state === 'done', notes: cell.note ? [cell.note] : [] });
      });
    });
  }

  // SUIVI RÉVISION : un bilan par dossier, avec les étapes du cabinet
  const rev = cab.tabs.revision && cabTable(cabFindTab(book, CAB_TABS[2].re));
  if (rev) {
    const iClo = rev.col(/cloture/);
    const stages = rev.header.map((t, i) => (i > iClo && t ? [i, prettyStage(t)] : null)).filter(Boolean);
    rev.rows.forEach((r) => {
      const c = infoOf(r.key);
      const cloText = cellText(r, iClo);
      const clo = normCloture(cloText) || c.cloture || '31/12';
      const year = Number(lastClosedYear({ cloture: clo }));
      const steps = [], notes = [];
      stages.forEach(([i, label]) => {
        const cell = cabCell(r, i);
        if (cell.note) notes.push(`${label} : ${cell.note}`);
        if (cell.state !== 'na') steps.push({ label, done: cell.state === 'done' });
      });
      if (!steps.length) return;
      cascadeSteps(steps);
      // Liasse envoyée : l'échéance suivante est le dépôt des comptes (7 mois après la clôture).
      const closing = closingDate({ cloture: clo }, year);
      const edi = steps.findIndex((s) => /edi|liasse/i.test(s.label) && s.done);
      addMission('revision', r.key, {
        type: 'bilan', titre: `${tplName('bilan')} ${year}`, exercice: String(year), recurrence: 'annuelle', replaceSteps: true,
        echeance: edi >= 0 ? nextWorkingDay(endOfMonth(addMonths(closing, 7))) : liasseDate(closing), steps, notes, done: steps.every((s) => s.done),
      });
    });
  }

  // SUIVI SITUATION
  const sit = cab.tabs.situation && cabTable(cabFindTab(book, CAB_TABS[3].re));
  if (sit) {
    const iDate = sit.col(/date situation/);
    const stages = sit.header.map((t, i) => (i > iDate && t ? [i, prettyStage(t)] : null)).filter(Boolean);
    sit.rows.forEach((r) => {
      const t = cellText(r, iDate);
      if (!t) return;
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : '';
      const steps = [], notes = [];
      stages.forEach(([i, label]) => {
        const cell = cabCell(r, i);
        if (cell.note) notes.push(`${label} : ${cell.note}`);
        if (cell.state !== 'na') steps.push({ label, done: cell.state === 'done' });
      });
      cascadeSteps(steps);
      addMission('situation', r.key, {
        type: 'situation', titre: iso ? `Situation au ${fmtDate(iso)}` : `Situation ${t}`, exercice: iso ? iso.slice(0, 4) : '', recurrence: 'aucune', replaceSteps: true,
        echeance: iso ? endOfMonth(addMonths(iso, 1)) : '', steps, notes, done: steps.length > 0 && steps.every((s) => s.done),
      });
    });
  }

  // SUIVI DÉCLARATION : une colonne par échéance (« 15/03/2026 ACPTE IS »)
  const decl = cab.tabs.declaration && cabTable(cabFindTab(book, CAB_TABS[4].re));
  if (decl) {
    const iClo = decl.col(/cloture/);
    const cols = decl.header.map((t, i) => {
      const m = String(t || '').match(/(\d{2})\/(\d{2})\/(\d{4})\s*([\s\S]*)/);
      return i > iClo && m ? { i, date: `${m[3]}-${m[2]}-${m[1]}`, raw: m[4].replace(/\s+/g, ' ').trim() } : null;
    }).filter(Boolean);
    decl.rows.forEach((r) => {
      const c = infoOf(r.key);
      const isIS = norm(c.regimeFiscal || '') === 'is';
      cols.forEach(({ i, date, raw }) => {
        const k = norm(raw);
        const y = date.slice(0, 4), mm = date.slice(5, 7);
        let spec;
        if (/^acpte is/.test(k)) spec = { type: 'acompte_is', titre: `Acompte IS ${mm}/${y}`, exercice: `${mm}/${y}`, applies: isIS };
        else if (/^solde is/.test(k)) spec = { type: 'solde_is', titre: `Solde IS ${y - 1}`, exercice: String(y - 1), applies: isIS };
        else if (/^ca12/.test(k)) spec = { type: 'ca12', titre: `TVA CA12 ${y - 1}`, exercice: String(y - 1), applies: /simplifi/i.test(c.regimeTva || '') };
        else if (/^cfe/.test(k)) spec = { type: 'cfe', titre: `CFE ${(raw.match(/\d{4}/) || [y])[0]}`, exercice: (raw.match(/\d{4}/) || [y])[0], applies: true };
        else {
          const nice = raw.replace(/^ACPTE /i, 'Acompte ').replace(/^DEC LOYER/i, 'Déclaration des loyers');
          const hasYear = /\d{4}/.test(nice);
          spec = { type: 'declaration', titre: hasYear ? nice : `${nice} ${mm}/${y}`, exercice: hasYear ? nice.match(/\d{4}/)[0] : `${mm}/${y}`, applies: false };
        }
        const cell = cabCell(r, i);
        if (cell.state === 'na') return;
        if (cell.state === 'todo' && (!spec.applies || (!cab.pastTodo && date < today))) return;
        addMission('declaration', r.key, Object.assign(spec, {
          echeance: nextWorkingDay(date), recurrence: 'aucune', done: cell.state === 'done', notes: cell.note ? [cell.note] : [],
        }));
      });
    });
  }

  // SUIVI SAISIE : une colonne par mois
  const sai = cab.tabs.saisie && cabTable(cabFindTab(book, CAB_TABS[5].re));
  if (sai) {
    const months = sai.header.map((t, i) => (/^\d{4}-\d{2}-\d{2}$/.test(String(t)) ? [i, t.slice(0, 7)] : null)).filter(Boolean);
    sai.rows.forEach((r) => months.forEach(([i, ym]) => {
      const t = cellText(r, i);
      if (!t) return;
      const cell = cabCell(r, i);
      if (cell.state === 'na' && !cell.note) return;
      const label = `${ym.slice(5)}/${ym.slice(0, 4)}`;
      addMission('saisie', r.key, { type: 'saisie', titre: `Saisie ${label}`, exercice: label, echeance: '', recurrence: 'aucune', done: cell.state === 'done', notes: cell.note && cell.state !== 'done' ? [cell.note] : [] });
    }));
  }
  return plan;
}

function upsertMission(c, spec, stamp, res) {
  const tpl = templateById(spec.type) || DEFAULT_TEMPLATES.find((t) => t.id === spec.type) || templateById('libre');
  if (!templateById(tpl.id)) data.templates.push(clone(tpl));
  const labels = spec.steps ? spec.steps : tpl.etapes.map((label) => ({ label, done: !!spec.done }));
  let m = missionsOf(c.id).find((x) => x.titre === spec.titre);
  if (!m) {
    m = {
      id: uid(), clientId: c.id, type: tpl.id, titre: spec.titre, exercice: spec.exercice, echeance: spec.echeance, statut: 'a_faire',
      priorite: 'normale', responsable: c.responsable || c.collaborateur || '', recurrence: spec.recurrence, notes: '', suiteCreee: false,
      termineLe: null, createdAt: stamp, updatedAt: stamp,
      etapes: labels.map((s) => ({ id: uid(), label: s.label, done: !!s.done, doneAt: s.done ? stamp : null })),
    };
    data.missions.push(m);
    res.created++;
  } else {
    // Étapes : le fichier ne fait qu'ajouter des étapes ou en cocher, jamais en décocher.
    if (spec.replaceSteps && !m.etapes.some((e) => e.done)) {
      m.etapes = labels.map((s) => ({ id: uid(), label: s.label, done: !!s.done, doneAt: s.done ? stamp : null }));
    } else {
      labels.forEach((s) => {
        const e = m.etapes.find((x) => x.label === s.label);
        if (!e) m.etapes.push({ id: uid(), label: s.label, done: !!s.done, doneAt: s.done ? stamp : null });
        else if (s.done && !e.done) Object.assign(e, { done: true, doneAt: stamp });
      });
    }
    if (!m.echeance && spec.echeance) m.echeance = spec.echeance;
    m.updatedAt = stamp;
    res.updated++;
  }
  const add = (spec.notes || []).filter((n) => !(m.notes || '').includes(n));
  if (add.length) m.notes = [m.notes, ...add].filter(Boolean).join('\n');
  const allDone = spec.done || (m.etapes.length > 0 && m.etapes.every((e) => e.done));
  if (allDone && isOpen(m)) {
    m.statut = 'termine';
    m.termineLe = spec.echeance && spec.echeance < todayStr() ? spec.echeance : todayStr();
    m.etapes.forEach((e) => { if (!e.done) Object.assign(e, { done: true, doneAt: stamp }); });
    res.done++;
  } else if (isOpen(m) && m.statut === 'a_faire' && m.etapes.some((e) => e.done)) m.statut = 'en_cours';
}

function applyCabinet() {
  const cab = ui.cab;
  const plan = cabinetPlan();
  const stamp = nowIso();
  const res = { clientsNew: 0, clientsUpd: 0, created: 0, updated: 0, done: 0 };
  const byKey = new Map();
  plan.clients.forEach(({ key, v, notes }) => {
    const [code, nom] = key.split('|');
    let c = data.clients.find((x) => (code && x.code === code) || (!code && v.siren && x.siren === v.siren) || (!code && norm(x.nom) === nom));
    if (c) {
      if (!cab.update) { byKey.set(key, c); return; }
      Object.keys(v).forEach((k) => { if (v[k]) c[k] = v[k]; });
      const add = notes.filter((n) => !(c.notes || '').includes(n));
      if (add.length) c.notes = [c.notes, ...add].filter(Boolean).join('\n');
      c.updatedAt = stamp;
      res.clientsUpd++;
    } else {
      c = Object.assign({ id: uid(), archive: false, vigilance: 'standard', createdAt: stamp, updatedAt: stamp }, v, { notes: notes.join('\n') });
      if (!c.code) c.code = genCode(c.nom, c.id);
      data.clients.push(c);
      log(c.id, 'Dossier importé depuis le classeur du cabinet.', true);
      res.clientsNew++;
    }
    addCollaborateurs([c.responsable, c.collaborateur, c.superviseur]);
    byKey.set(key, c);
  });
  plan.missions.forEach(({ key, spec }) => {
    const [code, nom] = key.split('|');
    const c = byKey.get(key) || data.clients.find((x) => (code && x.code === code) || (!code && norm(x.nom) === nom));
    if (c) upsertMission(c, spec, stamp, res);
  });
  return res;
}

function openCabinetImport(book, fileName) {
  const info = cabTable(cabFindTab(book, CAB_TABS[0].re));
  const tabs = {};
  CAB_TABS.forEach((t) => { tabs[t.key] = !!cabTable(cabFindTab(book, t.re)); });
  // Filtre proposé : la colonne où figure le prénom / trigramme de l'utilisateur.
  let filterCol = -1, filterVal = '';
  const me = (data.settings.utilisateur || '').trim().toUpperCase();
  if (info && me) {
    info.header.forEach((h, i) => {
      if (filterCol < 0 && /^(m|cs|cj|responsable|collaborateur)$/i.test(norm(h)) && info.rows.some((r) => cellText(r, i).toUpperCase() === me)) {
        filterCol = i;
        filterVal = info.rows.find((r) => cellText(r, i).toUpperCase() === me).cells[i].text.trim();
      }
    });
  }
  ui.cab = { book, fileName, tabs, filterCol, filterVal, update: true, pastTodo: false, year: new Date().getFullYear() };
  renderCabinetImport();
}

function renderCabinetImport() {
  const cab = ui.cab;
  const info = cabTable(cabFindTab(cab.book, CAB_TABS[0].re));
  const plan = cabinetPlan();
  const cols = info ? info.header.map((h, i) => [String(i), h]).filter(([, h]) => h) : [];
  const values = {};
  if (info && cab.filterCol >= 0) info.rows.forEach((r) => { const v = cellText(r, cab.filterCol); if (v) values[v] = (values[v] || 0) + 1; });
  const n = (k) => plan.counts[k] || 0;
  const line = {
    info: `${plan.clients.length} dossier(s) : ${n('clientsNew')} nouveau(x), ${n('clientsUpd')} déjà présent(s)`,
    tva: `${n('tva')} déclaration(s), dont ${n('tvaDone')} faite(s)`,
    revision: `${n('revision')} bilan(s), dont ${n('revisionDone')} terminé(s)`,
    situation: `${n('situation')} situation(s)`,
    declaration: `${n('declaration')} échéance(s), dont ${n('declarationDone')} faite(s)`,
    saisie: `${n('saisie')} mois de saisie`,
  };
  modalRefresh = null;
  openModal(`
    <div class="sheet">
      <header class="modal-head"><div><div class="muted small">${esc(cab.fileName)}</div><h2>Importer le classeur du cabinet</h2></div><button type="button" class="icon-btn" data-action="close-modal" aria-label="Fermer">✕</button></header>
      <div class="modal-body">
        <div class="info-box small">Le classeur est lu <strong>uniquement sur cet appareil</strong>. Les onglets DGFIP, URSSAF et EBICS (identifiants et mots de passe) ne sont <strong>jamais</strong> repris.</div>
        ${info ? `<h3>Dossiers à importer</h3>
        <div class="form-grid">
          <label>Filtrer sur la colonne<select data-cab="filterCol">${options(Object.fromEntries(cols), String(cab.filterCol), 'Tous les dossiers')}</select></label>
          ${cab.filterCol >= 0 ? `<label>Valeur<select data-cab="filterVal">${options(Object.fromEntries(Object.entries(values).sort().map(([v, k]) => [v, `${v} (${k})`])), cab.filterVal, '— Choisir —')}</select></label>` : ''}
        </div>` : '<p class="muted">Onglet INFO DOSSIER absent : les missions seront rattachées aux dossiers déjà présents.</p>'}
        <h3>Onglets</h3>
        <div class="cal-obs">${CAB_TABS.filter((t) => cabTable(cabFindTab(cab.book, t.re))).map((t) => `
          <label class="check cal-ob"><input type="checkbox" data-cab="tab" value="${t.key}"${cab.tabs[t.key] ? ' checked' : ''}>
            <span><strong>${esc(t.label)}</strong> <span class="muted small">— ${esc(t.desc)}</span><br><span class="small">${cab.tabs[t.key] ? esc(line[t.key]) : '<span class="muted">non importé</span>'}</span></span></label>`).join('')}
        </div>
        <label class="check"><input type="checkbox" data-cab="pastTodo"${cab.pastTodo ? ' checked' : ''}><span>Créer aussi les échéances <strong>passées</strong> non cochées (elles apparaîtront en retard)</span></label>
        <label class="check"><input type="checkbox" data-cab="update"${cab.update ? ' checked' : ''}><span>Mettre à jour les dossiers déjà présents</span></label>
        ${plan.unknown ? `<p class="muted small">${plan.unknown} ligne(s) de suivi ignorée(s) : dossier absent de l'application et de INFO DOSSIER.</p>` : ''}
        <p class="muted small">Le fichier ne fait que compléter : il ne décoche jamais une étape déjà cochée dans l'application et ne crée pas de doublon (réimport possible à tout moment). Cases hachurées, N/A, DISP et EUX = non applicable ; OK ou montant = fait.</p>
        <button class="link-btn small" data-action="cab-classic">Importer plutôt une seule feuille (assistant classique)</button>
      </div>
      <footer class="modal-foot"><button type="button" class="btn" data-action="close-modal">Annuler</button><button class="btn primary" data-action="cab-apply"${plan.clients.length || plan.missions.length ? '' : ' disabled'}>Importer</button></footer>
    </div>`, true);
}

function onCabChange(t) {
  const cab = ui.cab;
  const k = t.dataset.cab;
  if (k === 'filterCol') { cab.filterCol = t.value === '' ? -1 : Number(t.value); cab.filterVal = ''; }
  else if (k === 'filterVal') cab.filterVal = t.value;
  else if (k === 'tab') cab.tabs[t.value] = t.checked;
  else cab[k] = t.checked;
  const body = $('#modal .modal-body');
  const scroll = body ? body.scrollTop : 0;
  renderCabinetImport();
  if ($('#modal .modal-body')) $('#modal .modal-body').scrollTop = scroll;
}
