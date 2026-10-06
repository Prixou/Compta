/*
 * Suivi Dossiers — Import de dossiers (Excel / CSV).
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------------------------------------------------------------------------
// Import de dossiers (Excel / CSV)
// ---------------------------------------------------------------------------

const IMPORT_FIELDS = Object.assign({
  '': '— Ignorer —',
  code: 'N° de dossier',
  nom: 'Nom du dossier *',
  forme: 'Forme juridique',
  siren: 'SIREN / SIRET',
  regimeTva: 'Régime de TVA',
  jourTva: 'Jour limite TVA',
  cloture: 'Date de clôture',
  regimeFiscal: 'Régime fiscal',
  responsable: 'Responsable',
  collaborateur: 'Collaborateur',
  superviseur: 'Superviseur / associé',
  contact: 'Contact',
  email: 'E-mail',
  tel: 'Téléphone',
  notes: 'Ajouter aux notes',
}, Object.fromEntries(MOIS_LONGS.map((m, i) => [`mois:${i + 1}`, `Suivi — ${m}`])));

const NA_VALUES = new Set(['-', '/', 'na', 'n/a', 'nd', 'so', 'sans objet', 'neant']);
const DONE_RE = /^(ok|x|v|oui|fait|faite|done|✓|✔|☑)$/i;

function guessField(header, used) {
  const h = norm(header).replace(/[°º.:_]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!h) return '';
  const month = h.match(/^(\d{1,2})$/);
  if (month && Number(month[1]) >= 1 && Number(month[1]) <= 12) return 'mois:' + Number(month[1]);
  const byName = h.match(/^(janv|fevr|mars|avr|mai|juin|juil|aout|sept|oct|nov|dec)[a-z]*$/);
  if (byName) return 'mois:' + (['janv', 'fevr', 'mars', 'avr', 'mai', 'juin', 'juil', 'aout', 'sept', 'oct', 'nov', 'dec'].indexOf(byName[1]) + 1);
  const rules = [
    [/^m$/, 'responsable'],
    [/^cs$/, 'collaborateur'],
    [/^cj$/, 'superviseur'],
    [/^(date\s*(de\s*)?)?cloture/, 'cloture'],
    [/^(n|no|num|numero)\s*(de\s*)?dossier|^code|^ref/, 'code'],
    [/siren|siret/, 'siren'],
    [/mail/, 'email'],
    [/jour.*tva|tva.*jour|date.*tva|limite.*tva/, 'jourTva'],
    [/tva/, 'regimeTva'],
    [/^i[rs]\s*\/?\s*i[rs]$/, 'regimeFiscal'],
    [/cloture|exercice/, 'cloture'],
    [/fiscal/, 'regimeFiscal'],
    [/statut|forme/, 'forme'],
    [/collab/, 'collaborateur'],
    [/chef|associe|expert|superv|signataire/, 'superviseur'],
    [/resp|manager|gestionnaire/, 'responsable'],
    [/tel|phone|portable/, 'tel'],
    [/contact|dirigeant|gerant/, 'contact'],
    [/dossier|nom|raison|client|societe|denomination/, 'nom'],
    [/note|comment|observ|remarque/, 'notes'],
  ];
  for (const [re, field] of rules) {
    if (re.test(h) && (field === 'notes' || !used.has(field))) return field;
  }
  return '';
}

function normRegimeTva(v) {
  const r = norm(v).trim();
  if (!r) return '';
  if (/^m$|mensuel|^rn\s*m/.test(r)) return 'Réel normal (mensuel)';
  if (/^t$|trimest/.test(r)) return 'Réel normal (trimestriel)';
  if (/ca\s*12|simplif|^rsi$|^rs$/.test(r)) return 'Réel simplifié';
  if (/franch|^fb$/.test(r)) return 'Franchise en base';
  if (/non assuj|exoner|^n\/?a$|^exo$/.test(r)) return 'Non assujetti';
  return v;
}

function normCloture(v) {
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}`;
  m = v.match(/^(\d{1,2})\/(\d{1,2})(\/\d{2,4})?$/);
  if (m) return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}`;
  return '';
}

function normForme(v) {
  const found = FORMES.find((f) => norm(f) === norm(v));
  return found || v.toUpperCase();
}

function detectHeaderRow(rows) {
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const used = new Set();
    const score = rows[i].reduce((s, c) => {
      const f = guessField(c.text, used);
      if (f) used.add(f);
      return s + (f ? 2 : c.text && isNaN(Number(c.text)) ? 0.5 : 0);
    }, 0);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

function setupMapping() {
  const imp = ui.imp;
  const rows = imp.book.sheets[imp.sheet].rows;
  const header = rows[imp.headerRow] || [];
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const used = new Set();
  const sample = (i) => rows.slice(imp.headerRow + 1, imp.headerRow + 30).map((r) => (r[i] ? r[i].text : '')).filter(Boolean);
  imp.mapping = Array.from({ length: width }, (_, i) => {
    let f = guessField((header[i] || {}).text || '', used);
    // Une colonne « IS/IR » remplie de dates est une date de clôture.
    if (f === 'regimeFiscal' && sample(i).some((v) => /^\d{4}-\d{2}-\d{2}$/.test(v))) f = used.has('cloture') ? '' : 'cloture';
    if (f) used.add(f);
    return f;
  });
}

function analyseImport() {
  const imp = ui.imp;
  const rows = imp.book.sheets[imp.sheet].rows;
  const header = rows[imp.headerRow] || [];
  const res = { items: [], skipped: 0, created: 0, updated: 0, unchanged: 0, missions: 0, missionsDone: 0 };
  const col = (field) => imp.mapping.indexOf(field);
  if (col('nom') < 0) return res;
  const today = todayStr();
  const horizon = addMonths(today, 1);
  const tpl = templateById(imp.type) || data.templates[0];
  const seen = new Set();

  rows.slice(imp.headerRow + 1).forEach((row) => {
    const get = (field) => {
      const i = col(field);
      return i >= 0 && row[i] ? row[i].text : '';
    };
    const nom = get('nom');
    if (!nom) {
      if (row.some((c) => c && c.text)) res.skipped++;
      return;
    }
    const v = {
      nom,
      code: /^0+$/.test(get('code')) ? '' : get('code').toUpperCase(),
      forme: get('forme') ? normForme(get('forme')) : '',
      siren: get('siren').replace(/\s+/g, ''),
      regimeTva: normRegimeTva(get('regimeTva')),
      jourTva: (() => { const n = parseInt(get('jourTva'), 10); return n >= 1 && n <= 31 ? String(n) : ''; })(),
      cloture: normCloture(get('cloture')),
      regimeFiscal: get('regimeFiscal'),
      responsable: get('responsable'),
      collaborateur: get('collaborateur'),
      superviseur: get('superviseur'),
      contact: get('contact'),
      email: get('email'),
      tel: get('tel'),
    };
    const notes = imp.mapping.map((f, i) => (f === 'notes' && row[i] && row[i].text ? `${(header[i] || {}).text || 'Note'} : ${row[i].text}` : '')).filter(Boolean);
    const key = v.code || v.siren || norm(nom);
    if (seen.has(key)) { res.skipped++; return; }
    seen.add(key);
    const existing = data.clients.find((c) => (v.code && c.code === v.code) || (!v.code && v.siren && c.siren === v.siren) || (!v.code && !v.siren && norm(c.nom) === norm(nom)));
    if (existing && !imp.update) res.unchanged++;
    else if (existing) res.updated++;
    else res.created++;

    // Colonnes de suivi mensuel → missions.
    const months = [];
    if (imp.missions && !(existing && !imp.update)) {
      const regime = norm(v.regimeTva || (existing && existing.regimeTva) || '');
      const monthly = regime.includes('mensuel');
      const quarterly = regime.includes('trimestriel');
      const jour = v.jourTva || (existing && existing.jourTva) || '';
      imp.mapping.forEach((f, i) => {
        if (!f.startsWith('mois:')) return;
        const n = Number(f.slice(5));
        const c = row[i] || { text: '', na: false };
        const text = c.text.trim();
        if (c.na || NA_VALUES.has(norm(text))) return;
        const done = !!text && (DONE_RE.test(text) || /^\d{4}-\d{2}-\d{2}$/.test(text));
        const quarter = quarterly && n % 3 === 0;
        const echeance = jour ? dayOfMonth(imp.year, n, jour) : '';
        if (!text) {
          // Case vide : à faire seulement si une déclaration est due et que l'échéance approche.
          if (!(monthly || quarter)) return;
          if (echeance ? echeance > horizon : dayOfMonth(imp.year, n, 1) > today) return;
        }
        const label = quarter ? `T${n / 3} ${imp.year}` : `${pad(n)}/${imp.year}`;
        months.push({ label, echeance, statut: done ? 'termine' : text ? 'en_cours' : 'a_faire', recurrence: quarter ? 'trimestrielle' : 'mensuelle' });
        res.missions++;
        if (done) res.missionsDone++;
      });
    }
    res.items.push({ v, notes, existing, months, tpl });
  });
  return res;
}

function applyImport() {
  const imp = ui.imp;
  const res = analyseImport();
  const stamp = nowIso();
  res.newMissions = 0;
  res.closedMissions = 0;
  res.items.forEach(({ v, notes, existing, months, tpl }) => {
    let c = existing;
    if (existing && !imp.update) return;
    if (existing) {
      Object.keys(v).forEach((k) => { if (v[k]) c[k] = v[k]; });
      const add = notes.filter((n) => !(c.notes || '').includes(n));
      if (add.length) c.notes = [c.notes, ...add].filter(Boolean).join('\n');
      c.updatedAt = stamp;
    } else {
      c = Object.assign({ id: uid(), archive: false, vigilance: 'standard', createdAt: stamp, updatedAt: stamp }, v, { notes: notes.join('\n') });
      if (!c.code) c.code = genCode(c.nom, c.id);
      data.clients.push(c);
      log(c.id, 'Dossier importé depuis un fichier.', true);
    }
    addCollaborateurs([c.responsable, c.collaborateur, c.superviseur]);
    months.forEach((p) => {
      const titre = `${imp.titre || tpl.nom} ${p.label}`.trim();
      const done = p.statut === 'termine';
      const m = missionsOf(c.id).find((x) => x.titre === titre);
      if (m) {
        if (done && isOpen(m)) {
          m.statut = 'termine';
          m.termineLe = p.echeance || todayStr();
          m.etapes.forEach((e) => { if (!e.done) Object.assign(e, { done: true, doneAt: stamp }); });
          m.updatedAt = stamp;
          res.closedMissions++;
        }
        return;
      }
      res.newMissions++;
      data.missions.push({
        id: uid(), clientId: c.id, type: tpl.id, titre, exercice: p.label, echeance: p.echeance,
        statut: p.statut, priorite: 'normale', responsable: c.responsable || c.collaborateur || '',
        recurrence: p.recurrence, notes: '', suiteCreee: false,
        etapes: tpl.etapes.map((label) => ({ id: uid(), label, done, doneAt: done ? stamp : null })),
        termineLe: done ? p.echeance || todayStr() : null, createdAt: stamp, updatedAt: stamp,
      });
    });
  });
  return res;
}

async function startImport(opts) {
  let file = opts && opts.file;
  let book = opts && opts.book;
  if (!book) {
    file = await pickFile('.xlsx,.xlsm,.csv,.txt,.xls', true);
    if (!file) return;
    try {
      book = await SheetReader.read(file);
    } catch (e) {
      toast(e.message, true);
      return;
    }
  }
  if (!opts || !opts.classic) {
    if (book.sheets.some((sh) => CAB_TABS[0].re.test(norm(sh.name))) && book.sheets.some((sh) => CAB_TABS.slice(1).some((t) => t.re.test(norm(sh.name))))) {
      return openCabinetImport(book, file.name);
    }
  }
  const sheet = Math.max(0, book.sheets.findIndex((s) => s.rows.length > 1));
  ui.imp = {
    fileName: file.name, book, sheet, headerRow: detectHeaderRow(book.sheets[sheet].rows), mapping: [],
    year: new Date().getFullYear(), missions: true, update: true, type: templateById('tva') ? 'tva' : data.templates[0].id, titre: 'TVA',
  };
  setupMapping();
  renderImport();
}

function renderImport() {
  const imp = ui.imp;
  const rows = imp.book.sheets[imp.sheet].rows;
  const header = rows[imp.headerRow] || [];
  const res = analyseImport();
  const hasMonths = imp.mapping.some((f) => f.startsWith('mois:'));
  const hasName = imp.mapping.includes('nom');
  const samples = (i) => rows.slice(imp.headerRow + 1).map((r) => (r[i] ? r[i].text : '')).filter(Boolean).slice(0, 3);
  const columns = imp.mapping.map((f, i) => ({ i, f, head: (header[i] || {}).text || '', ex: samples(i) })).filter((c) => c.head || c.ex.length);
  const letter = (i) => (i >= 26 ? String.fromCharCode(64 + Math.floor(i / 26)) : '') + String.fromCharCode(65 + (i % 26));

  modalRefresh = null;
  openModal(`
    <div class="sheet">
      <header class="modal-head"><div><div class="muted small">${esc(imp.fileName)}</div><h2>Importer des dossiers</h2></div><button type="button" class="icon-btn" data-action="close-modal" aria-label="Fermer">✕</button></header>
      <div class="modal-body">
        <div class="info-box small">Le fichier est lu <strong>uniquement sur cet appareil</strong> ; son contenu est ensuite chiffré dans votre coffre. Pensez à supprimer les copies non chiffrées inutiles.</div>
        <div class="form-grid imp-top">
          ${imp.book.sheets.length > 1 ? `<label>Feuille<select data-imp="sheet">${options(Object.fromEntries(imp.book.sheets.map((s, i) => [String(i), s.name])), String(imp.sheet))}</select></label>` : ''}
          <label>Ligne des en-têtes<input type="number" min="1" max="${rows.length}" data-imp="headerRow" value="${imp.headerRow + 1}"></label>
        </div>
        <h3>Correspondance des colonnes</h3>
        <p class="muted small">Vérifiez à quoi correspond chaque colonne. Les colonnes « M », « C »… peuvent être associées au responsable, au collaborateur ou au superviseur.</p>
        <div class="imp-cols">${columns.map((c) => `
          <div class="imp-col${c.f ? ' mapped' : ''}">
            <div class="imp-head"><span class="muted small">${letter(c.i)}</span> <strong>${esc(c.head || '(sans titre)')}</strong></div>
            <div class="imp-ex muted small">${c.ex.map(esc).join(' · ') || '—'}</div>
            <select data-imp="map" data-col="${c.i}" aria-label="Colonne ${esc(c.head)}">${options(IMPORT_FIELDS, c.f)}</select>
          </div>`).join('')}
        </div>
        ${hasMonths ? `
        <fieldset>
          <legend>Colonnes de suivi mensuel</legend>
          <label class="check"><input type="checkbox" data-imp="missions"${imp.missions ? ' checked' : ''}><span>Créer les missions correspondantes</span></label>
          <div class="form-grid">
            <label>Année<input type="number" min="2000" max="2100" data-imp="year" value="${imp.year}"></label>
            <label>Type de mission<select data-imp="type">${options(Object.fromEntries(data.templates.map((t) => [t.id, t.nom])), imp.type)}</select></label>
            <label class="span2">Intitulé<input data-imp="titre" value="${esc(imp.titre)}" spellcheck="false"></label>
          </div>
          <p class="muted small">« OK », « X » ou une date = terminée · case hachurée ou « - » = non applicable · case vide = à faire si la déclaration est due (chaque mois en régime mensuel, en mars, juin, septembre et décembre en trimestriel) et que son échéance est passée ou dans le mois. L'échéance est calculée avec le jour limite TVA, le mois suivant la période. Les mois suivants seront créés automatiquement au fil de l'eau.</p>
        </fieldset>` : ''}
        <label class="check"><input type="checkbox" data-imp="update"${imp.update ? ' checked' : ''}><span>Mettre à jour les dossiers déjà présents (même N° de dossier) : vous pouvez réimporter votre tableau à chaque mise à jour.</span></label>
        <div class="imp-summary ${hasName ? '' : 'warn'}">
          ${hasName ? `<strong>${res.created}</strong> nouveau(x) dossier(s) · <strong>${res.updated}</strong> mis à jour${res.unchanged ? ` · ${res.unchanged} inchangé(s)` : ''}${res.skipped ? ` · ${res.skipped} ligne(s) ignorée(s)` : ''}${imp.missions && hasMonths ? `<br><strong>${res.missions}</strong> mission(s) lue(s) dans le fichier, dont ${res.missionsDone} terminée(s) (celles déjà présentes ne sont pas dupliquées)` : ''}` : 'Associez au moins une colonne au <strong>nom du dossier</strong>.'}
        </div>
      </div>
      <footer class="modal-foot"><button type="button" class="btn" data-action="close-modal">Annuler</button><button class="btn primary" data-action="apply-import"${hasName && res.items.length ? '' : ' disabled'}>Importer</button></footer>
    </div>`, true);
}

function onImportChange(t) {
  const imp = ui.imp;
  const k = t.dataset.imp;
  if (k === 'map') imp.mapping[Number(t.dataset.col)] = t.value;
  else if (k === 'sheet') { imp.sheet = Number(t.value); imp.headerRow = detectHeaderRow(imp.book.sheets[imp.sheet].rows); setupMapping(); }
  else if (k === 'headerRow') { imp.headerRow = Math.max(0, Number(t.value) - 1); setupMapping(); }
  else if (k === 'year') imp.year = Number(t.value) || imp.year;
  else if (k === 'missions' || k === 'update') imp[k] = t.checked;
  else if (k === 'type') {
    imp.type = t.value;
    const tpl = templateById(t.value);
    if (tpl && t.value !== 'tva') imp.titre = tpl.nom;
    else if (t.value === 'tva') imp.titre = 'TVA';
  } else if (k === 'titre') imp.titre = t.value;
  const body = $('#modal .modal-body');
  const scroll = body ? body.scrollTop : 0;
  renderImport();
  const nb = $('#modal .modal-body');
  if (nb) nb.scrollTop = scroll;
}
