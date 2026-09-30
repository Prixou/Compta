/*
 * Suivi Dossiers — application de suivi des dossiers pour cabinet comptable.
 * 100 % locale : aucune donnée n'est transmise à un serveur.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Référentiels
  // ---------------------------------------------------------------------------

  const STATUTS = {
    a_faire: 'À faire',
    en_cours: 'En cours',
    attente_client: 'Attente client',
    a_valider: 'À valider',
    termine: 'Terminé',
  };

  const RECURRENCES = {
    aucune: 'Aucune',
    mensuelle: 'Mensuelle',
    trimestrielle: 'Trimestrielle',
    annuelle: 'Annuelle',
  };
  const RECURRENCE_MOIS = { mensuelle: 1, trimestrielle: 3, annuelle: 12 };

  const FORMES = ['EI', 'Micro-entreprise', 'EURL', 'SARL', 'SAS', 'SASU', 'SA', 'SNC', 'SCI', 'SCM', 'SELARL', 'SELAS', 'EARL', 'GAEC', 'Association', 'Particulier', 'Autre'];
  const REGIMES_FISCAUX = ['IS', 'IR – BIC', 'IR – BNC', 'IR – BA', 'Revenus fonciers', 'Micro', 'Non applicable'];
  const REGIMES_TVA = ['Réel normal (mensuel)', 'Réel normal (trimestriel)', 'Réel simplifié', 'Franchise en base', 'Non assujetti'];
  const VIGILANCE = { simplifiee: 'Simplifiée', standard: 'Standard', renforcee: 'Renforcée' };

  const DEFAULT_TEMPLATES = [
    {
      id: 'bilan', nom: 'Bilan annuel', recurrence: 'annuelle',
      etapes: [
        'Lettre de mission à jour',
        'Pièces comptables reçues',
        'Relevés bancaires reçus',
        'Saisie / intégration des pièces',
        'Rapprochements bancaires',
        'Révision des comptes',
        "Écritures d'inventaire (stocks, amortissements, provisions)",
        'Comptes annuels établis',
        'Liasse fiscale télétransmise',
        'Présentation au client',
        'Approbation des comptes (AG)',
        'Dépôt au greffe',
      ],
    },
    {
      id: 'tva', nom: 'Déclaration de TVA', recurrence: 'mensuelle',
      etapes: ['Pièces reçues', 'Saisie ventes / achats', 'Contrôle et calcul de la TVA', 'Validation', 'Télédéclaration', 'Télépaiement'],
    },
    {
      id: 'paie', nom: 'Paie', recurrence: 'mensuelle',
      etapes: ['Variables de paie reçues', 'Bulletins établis', 'Contrôle / validation', 'Bulletins transmis au client', 'DSN déposée'],
    },
    {
      id: 'juridique', nom: 'Juridique annuel', recurrence: 'annuelle',
      etapes: ['Rapport de gestion', 'Convocation / consultation des associés', "Procès-verbal d'AG", 'Dépôt des comptes au greffe', 'Registre des décisions à jour'],
    },
    {
      id: 'ir', nom: 'Déclaration de revenus', recurrence: 'annuelle',
      etapes: ['Documents reçus', 'Déclaration préparée', 'Validation par le client', 'Déclaration transmise', "Avis d'imposition contrôlé"],
    },
    {
      id: 'situation', nom: 'Situation intermédiaire', recurrence: 'aucune',
      etapes: ['Pièces reçues', 'Saisie à jour', 'Révision', 'Situation établie', 'Présentation au client'],
    },
    {
      id: 'creation', nom: "Création d'entreprise", recurrence: 'aucune',
      etapes: ['Lettre de mission signée', 'Identification du client (LCB-FT)', 'Statuts rédigés', 'Dépôt du capital', 'Annonce légale', 'Immatriculation (guichet unique)', 'Options fiscales et sociales'],
    },
    { id: 'libre', nom: 'Mission libre', recurrence: 'aucune', etapes: [] },
  ];

  const ICONS = {
    home: '<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    grid: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>',
  };

  function icon(name, cls) {
    return `<svg class="ico ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  }

  // ---------------------------------------------------------------------------
  // Utilitaires
  // ---------------------------------------------------------------------------

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function uid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const nowIso = () => new Date().toISOString();
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = () => ymd(new Date());

  function parseYmd(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  // Date au jour `day` du mois `month` (0-11, débordement accepté), bornée à la fin du mois.
  function dayOfMonth(year, month, day) {
    const last = new Date(year, month + 1, 0).getDate();
    return ymd(new Date(year, month, Math.min(Number(day), last)));
  }

  function daysUntil(s) {
    return Math.round((parseYmd(s) - parseYmd(todayStr())) / 86400000);
  }

  function fmtDate(s) {
    if (!s) return '—';
    return parseYmd(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function addMonths(s, n) {
    const d = parseYmd(s);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return ymd(d);
  }

  // Décale un libellé de période (« 2025 », « 08/2026 », « T3 2026 ») de n mois.
  function shiftLabel(label, months) {
    if (!label) return label;
    let m = label.match(/^(\d{4})$/);
    if (m) return months % 12 === 0 ? String(Number(m[1]) + months / 12) : label;
    m = label.match(/^(\d{1,2})\/(\d{4})$/);
    if (m) {
      const idx = Number(m[2]) * 12 + Number(m[1]) - 1 + months;
      return `${pad((idx % 12) + 1)}/${Math.floor(idx / 12)}`;
    }
    m = label.match(/^T([1-4])\s*(\d{4})$/i);
    if (m && months % 3 === 0) {
      const idx = Number(m[2]) * 4 + Number(m[1]) - 1 + months / 3;
      return `T${(idx % 4) + 1} ${Math.floor(idx / 4)}`;
    }
    return label;
  }

  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  let toastTimer = null;
  function toast(msg, isError) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = ''), isError ? 6000 : 3000);
  }

  function applyWidths(root) {
    $$('[data-w]', root).forEach((el) => (el.style.width = el.dataset.w + '%'));
  }

  function passwordScore(p) {
    let s = 0;
    if (p.length >= 10) s++;
    if (p.length >= 14) s++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
    if (/\d/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return Math.min(s, 4);
  }

  // ---------------------------------------------------------------------------
  // Données
  // ---------------------------------------------------------------------------

  let data = null;
  let saving = Promise.resolve();

  function emptyData() {
    return {
      version: 1,
      createdAt: nowIso(),
      settings: {
        cabinet: '',
        utilisateur: '',
        collaborateurs: [],
        autoLockMin: 5,
        lockOnHide: false,
        discret: false,
        kycMois: 12,
        lastBackup: null,
      },
      templates: clone(DEFAULT_TEMPLATES),
      clients: [],
      missions: [],
      journal: [],
    };
  }

  // Complète les données issues d'une version antérieure ou d'une sauvegarde.
  function migrate(d) {
    const base = emptyData();
    d = d && typeof d === 'object' ? d : base;
    d.settings = Object.assign(base.settings, d.settings || {});
    d.templates = Array.isArray(d.templates) ? d.templates : base.templates;
    d.clients = Array.isArray(d.clients) ? d.clients : [];
    d.missions = Array.isArray(d.missions) ? d.missions : [];
    d.journal = Array.isArray(d.journal) ? d.journal : [];
    d.missions.forEach((m) => {
      m.etapes = Array.isArray(m.etapes) ? m.etapes : [];
      m.statut = STATUTS[m.statut] ? m.statut : 'a_faire';
    });
    d.version = 1;
    return d;
  }

  function persist() {
    data.updatedAt = nowIso();
    const snapshot = data;
    saving = saving
      .then(() => Vault.save(snapshot))
      .catch((err) => toast("Erreur d'enregistrement : " + err.message, true));
    return saving;
  }

  const clientById = (id) => data.clients.find((c) => c.id === id);
  const missionById = (id) => data.missions.find((m) => m.id === id);
  const templateById = (id) => data.templates.find((t) => t.id === id);
  const isOpen = (m) => m.statut !== 'termine';
  const isLate = (m) => isOpen(m) && !!m.echeance && daysUntil(m.echeance) < 0;
  const byDue = (a, b) => (a.echeance || '9999').localeCompare(b.echeance || '9999');

  function progress(m) {
    if (m.statut === 'termine') return 100;
    if (!m.etapes.length) return 0;
    return Math.round((m.etapes.filter((e) => e.done).length * 100) / m.etapes.length);
  }

  function clientLabel(c) {
    if (!c) return 'Dossier supprimé';
    return data.settings.discret ? c.code || '••••' : c.nom;
  }

  function genCode(nom, exceptId) {
    const base = (norm(nom).replace(/[^a-z]/g, '').toUpperCase() + 'XXX').slice(0, 3);
    let i = 1;
    const taken = (code) => data.clients.some((c) => c.code === code && c.id !== exceptId);
    while (taken(base + String(i).padStart(3, '0'))) i++;
    return base + String(i).padStart(3, '0');
  }

  // Dernier exercice clos d'un dossier (année de clôture), selon sa date de clôture « JJ/MM ».
  function lastClosedYear(c) {
    const now = new Date();
    const m = c && c.cloture && c.cloture.match(/^(\d{2})\/(\d{2})$/);
    if (!m) return String(now.getFullYear() - 1);
    const closing = new Date(now.getFullYear(), Number(m[2]) - 1, Number(m[1]));
    return String(closing <= now ? now.getFullYear() : now.getFullYear() - 1);
  }

  function addCollaborateurs(names) {
    names.forEach((n) => {
      if (n && !data.settings.collaborateurs.includes(n)) data.settings.collaborateurs.push(n);
    });
  }

  function log(clientId, texte, auto) {
    data.journal.push({ id: uid(), clientId, date: nowIso(), texte, auto: !!auto });
  }

  function setStatus(m, statut) {
    const prev = m.statut;
    if (prev === statut) return;
    m.statut = statut;
    m.updatedAt = nowIso();
    if (statut === 'termine') {
      m.termineLe = todayStr();
      log(m.clientId, `Mission « ${m.titre} » terminée.`, true);
      createNextOccurrence(m);
    } else if (prev === 'termine') {
      m.termineLe = null;
      log(m.clientId, `Mission « ${m.titre} » rouverte.`, true);
    }
  }

  function createNextOccurrence(m) {
    const months = RECURRENCE_MOIS[m.recurrence];
    if (!months || m.suiteCreee) return;
    const exercice = shiftLabel(m.exercice, months);
    const next = Object.assign(clone(m), {
      id: uid(),
      statut: 'a_faire',
      termineLe: null,
      suiteCreee: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      exercice,
      echeance: m.echeance ? addMonths(m.echeance, months) : '',
      etapes: m.etapes.map((e) => ({ id: uid(), label: e.label, done: false, doneAt: null })),
    });
    if (m.exercice && exercice !== m.exercice && m.titre.includes(m.exercice)) {
      next.titre = m.titre.replace(m.exercice, exercice);
    }
    m.suiteCreee = true;
    // Déjà présente (ex. créée par un import) : on ne la duplique pas.
    if (data.missions.some((x) => x.clientId === m.clientId && x.id !== m.id && x.titre === next.titre)) return;
    data.missions.push(next);
    toast(`Occurrence suivante créée${next.echeance ? ' — échéance ' + fmtDate(next.echeance) : ''}.`);
  }

  function toggleStep(m, stepId, done) {
    const step = m.etapes.find((e) => e.id === stepId);
    if (!step) return;
    step.done = done;
    step.doneAt = done ? nowIso() : null;
    const all = m.etapes.every((e) => e.done);
    if (all && m.statut !== 'termine') setStatus(m, 'termine');
    else if (!all && m.statut === 'termine') setStatus(m, 'en_cours');
    else if (done && m.statut === 'a_faire') setStatus(m, 'en_cours');
    m.updatedAt = nowIso();
    persist();
  }

  // Alertes déontologiques : lettre de mission et identification LCB-FT.
  function complianceIssues(c) {
    const issues = [];
    if (!c.lettreMission) issues.push('Lettre de mission non renseignée');
    if (!c.kycDate) issues.push('Identification LCB-FT non renseignée');
    else {
      const months = c.vigilance === 'renforcee' ? Math.min(12, data.settings.kycMois) : data.settings.kycMois;
      if (addMonths(c.kycDate, months) < todayStr()) issues.push('Revue LCB-FT à renouveler');
    }
    return issues;
  }

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
          <form data-form="unlock" autocomplete="off">
            <label>Mot de passe maître
              <input type="password" name="password" required autocomplete="current-password" spellcheck="false" autofocus>
            </label>
            <p class="form-error" data-error></p>
            <button class="btn primary block" type="submit">Déverrouiller</button>
          </form>
          <button class="link-btn danger small" data-action="reset-all">Mot de passe oublié ? Réinitialiser l'application</button>
        </div>
      </div>`;
    const input = $('input[name=password]');
    if (input) input.focus();
  }

  // ---------------------------------------------------------------------------
  // Structure principale et navigation
  // ---------------------------------------------------------------------------

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
            <a href="#/parametres" data-nav="parametres">${icon('gear')}<span>Paramètres</span></a>
          </nav>
          <div class="side-actions">
            <button class="btn ghost block" data-action="toggle-discret">${icon(discret ? 'eyeOff' : 'eye')}<span>${discret ? 'Mode discret activé' : 'Mode discret'}</span></button>
            <button class="btn ghost block" data-action="lock">${icon('lock')}<span>Verrouiller</span></button>
          </div>
        </aside>
        <header class="topbar">
          <div class="brand">${icon('shield')}<strong>Suivi Dossiers</strong></div>
          <div class="top-actions">
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
  };

  function route() {
    if (!data) return;
    if (!$('.layout')) renderShell();
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const view = parts[0] || 'tableau';
    const main = $('#main');
    $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === (view === 'dossier' ? 'dossiers' : view)));
    switch (view) {
      case 'dossiers': main.innerHTML = viewDossiers(); renderDossierList(); break;
      case 'dossier': main.innerHTML = viewDossier(parts[1]); break;
      case 'missions': main.innerHTML = viewMissions(); renderMissionList(); break;
      case 'grille': main.innerHTML = viewGrille(); scrollGrilleToMonth(); break;
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

  // ---------------------------------------------------------------------------
  // Tableau de bord
  // ---------------------------------------------------------------------------

  function viewDashboard() {
    const s = data.settings;
    const active = data.clients.filter((c) => !c.archive);
    const open = data.missions.filter((m) => isOpen(m) && clientById(m.clientId) && !clientById(m.clientId).archive);
    const late = open.filter(isLate).sort(byDue);
    const soon = open.filter((m) => m.echeance && daysUntil(m.echeance) >= 0 && daysUntil(m.echeance) <= 14).sort(byDue);
    const wait = open.filter((m) => m.statut === 'attente_client').sort(byDue);
    const review = open.filter((m) => m.statut === 'a_valider').sort(byDue);
    const compliance = active.map((c) => ({ c, issues: complianceIssues(c) })).filter((x) => x.issues.length);

    const hour = new Date().getHours();
    const hello = (hour < 18 ? 'Bonjour' : 'Bonsoir') + (s.utilisateur ? ' ' + s.utilisateur : '');

    let backupBanner = '';
    if (data.clients.length) {
      const days = s.lastBackup ? Math.floor((Date.now() - new Date(s.lastBackup)) / 86400000) : null;
      if (days === null || days >= 7) {
        backupBanner = `<div class="banner warn">
          <span>${days === null ? "Aucune sauvegarde n'a encore été faite." : `Dernière sauvegarde il y a ${days} jours.`}
          Les données n'existent que sur cet appareil : pensez à exporter une sauvegarde chiffrée.</span>
          <button class="btn small" data-action="export-backup">Sauvegarder</button></div>`;
      }
    }

    if (!data.clients.length) {
      return `<h1>${esc(hello)}</h1>${emptyState('Commencez par créer votre premier dossier client, ou importez votre tableau de suivi Excel.', `<div class="head-actions center"><button class="btn primary" data-action="new-client">${icon('plus')}Nouveau dossier</button><button class="btn" data-action="import-sheet">Importer un fichier Excel / CSV</button></div>`)}`;
    }

    // Campagnes : missions d'un même modèle et d'une même période (ex. « Bilan annuel 2025 »).
    const groups = {};
    data.missions.forEach((m) => {
      if (!m.exercice) return;
      const tpl = templateById(m.type);
      const key = (tpl ? tpl.nom : m.type || 'Mission') + ' ' + m.exercice;
      (groups[key] = groups[key] || { key, total: 0, done: 0 }).total++;
      if (!isOpen(m)) groups[key].done++;
    });
    const campaigns = Object.values(groups).filter((g) => g.total >= 2 && g.done < g.total).sort((a, b) => a.key.localeCompare(b.key, 'fr'));

    const section = (title, list, emptyText) => `
      <section class="card">
        <h2>${title} <span class="count">${list.length}</span></h2>
        ${list.length ? `<div class="mlist">${list.slice(0, 12).map((m) => missionRow(m, true)).join('')}</div>${list.length > 12 ? `<a class="more" href="#/missions">Voir tout</a>` : ''}` : `<p class="muted">${emptyText}</p>`}
      </section>`;

    return `
      <div class="page-head"><h1>${esc(hello)}</h1>
        <div class="head-actions">
          <button class="btn" data-action="new-client">${icon('plus')}Dossier</button>
          <button class="btn primary" data-action="new-mission">${icon('plus')}Mission</button>
        </div>
      </div>
      ${backupBanner}
      <div class="kpis">
        <a class="kpi" href="#/dossiers"><strong>${active.length}</strong><span>Dossiers actifs</span></a>
        <a class="kpi" href="#/missions" data-action="filter-missions" data-periode="toutes"><strong>${open.length}</strong><span>Missions en cours</span></a>
        <a class="kpi ${late.length ? 'kpi-late' : ''}" href="#/missions" data-action="filter-missions" data-periode="retard"><strong>${late.length}</strong><span>En retard</span></a>
        <a class="kpi ${wait.length ? 'kpi-wait' : ''}" href="#/missions" data-action="filter-missions" data-statut="attente_client"><strong>${wait.length}</strong><span>Attente client</span></a>
      </div>
      ${campaigns.length ? `<section class="card"><h2>Avancement des campagnes</h2><div class="campaigns">${campaigns.map((g) => {
        const p = Math.round((g.done * 100) / g.total);
        return `<div class="campaign"><div class="campaign-head"><span>${esc(g.key)}</span><span class="muted">${g.done}/${g.total} terminées</span></div>${bar(p)}</div>`;
      }).join('')}</div></section>` : ''}
      <div class="grid2">
        ${section('En retard', late, 'Aucune mission en retard. 👍')}
        ${section('Échéances des 14 prochains jours', soon, 'Rien de prévu dans les 14 prochains jours.')}
        ${section('En attente du client', wait, 'Aucune mission en attente du client.')}
        ${section('À valider', review, 'Aucune mission à valider.')}
      </div>
      ${compliance.length ? `<section class="card"><h2>Conformité (lettre de mission, LCB-FT) <span class="count">${compliance.length}</span></h2>
        <div class="clist">${compliance.map(({ c, issues }) => `
          <a class="crow" href="#/dossier/${c.id}"><span class="crow-name">${esc(clientLabel(c))}</span><span class="crow-issues">${issues.map((i) => `<span class="badge warn">${esc(i)}</span>`).join('')}</span></a>`).join('')}
        </div></section>` : ''}`;
  }

  // ---------------------------------------------------------------------------
  // Dossiers
  // ---------------------------------------------------------------------------

  function viewDossiers() {
    const table = data.settings.dossierView === 'tableau';
    return `
      <div class="page-head"><h1>Dossiers</h1>
        <div class="head-actions">
          <button class="btn" data-action="import-sheet">Importer (Excel / CSV)</button>
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
          const open = data.missions.filter((m) => m.clientId === c.id && isOpen(m));
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
      const ms = data.missions.filter((m) => m.clientId === c.id);
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
    const ms = data.missions.filter((m) => m.clientId === c.id);
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

  // ---------------------------------------------------------------------------
  // Missions
  // ---------------------------------------------------------------------------

  function viewMissions() {
    const f = ui.mf;
    const resps = Array.from(new Set(data.settings.collaborateurs.concat(data.missions.map((m) => m.responsable)).filter(Boolean))).sort();
    return `
      <div class="page-head"><h1>Missions</h1>
        <div class="head-actions"><button class="btn primary" data-action="new-mission">${icon('plus')}Nouvelle mission</button></div>
      </div>
      <div class="filters">
        <input type="search" placeholder="Rechercher…" data-filter="mf.q" value="${esc(f.q)}" spellcheck="false" autocomplete="off">
        <select data-filter="mf.statut" aria-label="Statut">${options(Object.assign({ ouvertes: 'Non terminées', toutes: 'Tous statuts' }, STATUTS), f.statut)}</select>
        <select data-filter="mf.periode" aria-label="Échéance">${options({ toutes: 'Toutes échéances', retard: 'En retard', '7': '7 prochains jours', '30': '30 prochains jours', mois: 'Ce mois-ci' }, f.periode)}</select>
        <select data-filter="mf.type" aria-label="Type">${options(Object.fromEntries(data.templates.map((t) => [t.id, t.nom])), f.type, 'Tous types')}</select>
        <select data-filter="mf.resp" aria-label="Responsable">${options(resps, f.resp, 'Tous responsables')}</select>
      </div>
      <div id="mission-list"></div>`;
  }

  function renderMissionList() {
    const el = $('#mission-list');
    if (!el) return;
    const f = ui.mf;
    const q = norm(f.q);
    const month = todayStr().slice(0, 7);
    const list = data.missions.filter((m) => {
      const c = clientById(m.clientId);
      if (!c) return false;
      if (f.statut === 'ouvertes' ? !isOpen(m) : f.statut !== 'toutes' && m.statut !== f.statut) return false;
      if (f.type && m.type !== f.type) return false;
      if (f.resp && m.responsable !== f.resp) return false;
      if (f.periode === 'retard' && !isLate(m)) return false;
      if ((f.periode === '7' || f.periode === '30') && !(m.echeance && daysUntil(m.echeance) >= 0 && daysUntil(m.echeance) <= Number(f.periode))) return false;
      if (f.periode === 'mois' && !(m.echeance || '').startsWith(month)) return false;
      if (q && !norm([m.titre, m.exercice, clientLabel(c), c.code, m.responsable].join(' ')).includes(q)) return false;
      return true;
    }).sort(byDue);
    el.innerHTML = list.length
      ? `<p class="muted small">${list.length} mission${list.length > 1 ? 's' : ''}</p><div class="mlist card flush">${list.map((m) => missionRow(m, true)).join('')}</div>`
      : emptyState(data.clients.length ? 'Aucune mission ne correspond aux filtres.' : "Créez d'abord un dossier pour pouvoir y rattacher des missions.");
    applyWidths(el);
  }

  let modalRefresh = null;

  function missionSheet(id) {
    const m = missionById(id);
    if (!m) return;
    const c = clientById(m.clientId);
    const p = progress(m);
    openModal(`
      <div class="sheet">
        <header class="modal-head">
          <div><div class="muted small">${esc(clientLabel(c))}${m.exercice ? ' · ' + esc(m.exercice) : ''}</div><h2>${esc(m.titre)}</h2></div>
          <button type="button" class="icon-btn" data-action="close-modal" aria-label="Fermer">✕</button>
        </header>
        <div class="modal-body">
          <div class="sheet-top">
            <label>Statut<select data-action-change="mission-status" data-id="${m.id}">${options(STATUTS, m.statut)}</select></label>
            <div><div class="muted small">Échéance</div>${dueBadge(m)}${m.echeance && isOpen(m) && daysUntil(m.echeance) <= 7 ? `<div class="muted small">${fmtDate(m.echeance)}</div>` : ''}</div>
            <div><div class="muted small">Responsable</div>${esc(m.responsable || '—')}</div>
            <div><div class="muted small">Récurrence</div>${esc(RECURRENCES[m.recurrence] || 'Aucune')}</div>
          </div>
          <div class="prog big">${bar(p)}<span class="pct">${p} %</span></div>
          ${m.etapes.length ? `<ul class="steps">${m.etapes.map((e) => `
            <li><label class="check"><input type="checkbox" data-action="toggle-step" data-mission="${m.id}" data-step="${e.id}"${e.done ? ' checked' : ''}>
              <span>${esc(e.label)}${e.done && e.doneAt ? `<small class="muted"> — ${fmtDateTime(e.doneAt)}</small>` : ''}</span></label></li>`).join('')}</ul>`
            : '<p class="muted">Aucune étape définie. Utilisez le statut pour suivre l\'avancement, ou ajoutez des étapes via « Modifier ».</p>'}
          ${m.notes ? `<h3>Notes</h3><div class="notes">${data.settings.discret ? '<span class="masked">Masqué</span>' : esc(m.notes)}</div>` : ''}
        </div>
        <footer class="modal-foot">
          <button class="btn danger" data-action="delete-mission" data-id="${m.id}">Supprimer</button>
          <span class="spacer"></span>
          ${c ? `<a class="btn" href="#/dossier/${c.id}" data-action="close-modal">Voir le dossier</a>` : ''}
          <button class="btn" data-action="edit-mission" data-id="${m.id}">Modifier</button>
          ${isOpen(m) ? `<button class="btn primary" data-action="complete-mission" data-id="${m.id}">✓ Terminée</button>` : ''}
        </footer>
      </div>`);
    modalRefresh = () => missionSheet(id);
  }

  function missionForm(m, presetClient) {
    const isNew = !m;
    const clients = data.clients.filter((c) => !c.archive || (m && c.id === m.clientId)).sort((a, b) => clientLabel(a).localeCompare(clientLabel(b), 'fr'));
    if (!clients.length) {
      toast("Créez d'abord un dossier.", true);
      return clientForm();
    }
    const tpl = data.templates[0];
    const clientId = m ? m.clientId : presetClient || '';
    m = m || {
      type: tpl.id,
      titre: '',
      exercice: '',
      echeance: '',
      statut: 'a_faire',
      priorite: 'normale',
      responsable: (clientById(clientId) || {}).responsable || data.settings.utilisateur,
      recurrence: tpl.recurrence,
      etapes: tpl.etapes.map((label) => ({ label })),
      notes: '',
    };
    if (isNew) {
      m.exercice = tpl.recurrence === 'annuelle' ? lastClosedYear(clientById(clientId)) : '';
      m.titre = `${tpl.nom}${m.exercice ? ' ' + m.exercice : ''}`;
    }
    modalRefresh = null;
    openModal(`
      <form data-form="mission" data-id="${m.id || ''}" autocomplete="off" spellcheck="false">
        <header class="modal-head"><h2>${isNew ? 'Nouvelle mission' : 'Modifier la mission'}</h2><button type="button" class="icon-btn" data-action="close-modal" aria-label="Fermer">✕</button></header>
        <div class="modal-body">
          <div class="form-grid">
            <label class="span2">Dossier *<select name="clientId" required>${clients.length > 1 && !clientId ? '<option value="">— Choisir —</option>' : ''}${clients.map((c) => `<option value="${c.id}"${c.id === clientId ? ' selected' : ''}>${esc(clientLabel(c))}</option>`).join('')}</select></label>
            ${isNew ? `<label class="span2">Modèle<select name="type">${options(Object.fromEntries(data.templates.map((t) => [t.id, t.nom])), m.type)}</select></label>` : ''}
            <label class="span2">Intitulé *<input name="titre" required value="${esc(m.titre)}"></label>
            <label>Exercice / période<input name="exercice" value="${esc(m.exercice)}" placeholder="2025, 08/2026, T3 2026…"></label>
            <label>Échéance<input type="date" name="echeance" value="${esc(m.echeance)}"></label>
            <label>Statut<select name="statut">${options(STATUTS, m.statut)}</select></label>
            <label>Priorité<select name="priorite">${options({ normale: 'Normale', haute: 'Haute' }, m.priorite)}</select></label>
            <label>Responsable<input name="responsable" list="collabs" value="${esc(m.responsable)}"></label>
            <label>Récurrence<select name="recurrence">${options(RECURRENCES, m.recurrence || 'aucune')}</select></label>
          </div>
          <label>Étapes (une par ligne)<textarea name="etapes" rows="8">${esc(m.etapes.map((e) => e.label).join('\n'))}</textarea></label>
          <p class="muted small">Récurrence : lorsque la mission est terminée, l'occurrence suivante est créée automatiquement (échéance décalée).</p>
          <label>Notes<textarea name="notes" rows="3">${esc(m.notes)}</textarea></label>
          ${collaborateursDatalist()}
        </div>
        <footer class="modal-foot"><button type="button" class="btn" data-action="close-modal">Annuler</button><button class="btn primary" type="submit">Enregistrer</button></footer>
      </form>`);
  }

  // ---------------------------------------------------------------------------
  // Suivi mensuel (grille type tableur)
  // ---------------------------------------------------------------------------

  const MOIS_COURTS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
  const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  function tvaShort(regime) {
    const r = norm(regime);
    if (!r) return '';
    if (r.includes('mensuel')) return 'M';
    if (r.includes('trimestriel')) return 'T';
    if (r.includes('simplifie')) return 'CA12';
    if (r.includes('franchise')) return 'F';
    if (r.includes('non assujetti')) return '—';
    return regime;
  }

  const REGIME_FILTRES = { '': 'Tous régimes', M: 'TVA mensuelle', T: 'TVA trimestrielle', CA12: 'TVA annuelle (CA12)', autre: 'Autres régimes' };

  function regimeGroup(c) {
    const r = tvaShort(c.regimeTva);
    return ['M', 'T', 'CA12'].includes(r) ? r : 'autre';
  }

  // Colonne d'une période pour l'année donnée : 1-12 pour « MM/AAAA » ou « Tn AAAA », 13 pour l'exercice « AAAA ».
  function periodColumn(exercice, year) {
    if ((exercice || '').trim() === String(year)) return 13;
    let m = (exercice || '').match(/^(\d{1,2})\/(\d{4})$/);
    if (m && Number(m[2]) === year) return Number(m[1]);
    m = (exercice || '').match(/^T([1-4])\s*(\d{4})$/i);
    if (m && Number(m[2]) === year) return Number(m[1]) * 3;
    return 0;
  }

  // Sur petit écran, fait défiler la grille jusqu'au mois précédent (période en cours de déclaration).
  function scrollGrilleToMonth() {
    const wrap = $('.grid-wrap');
    if (!wrap || Number(ui.grille.annee) !== new Date().getFullYear()) return;
    const ths = $$('.grille thead th', wrap);
    const target = ths[4 + Math.max(0, new Date().getMonth() - 2)];
    const name = $('.grille thead .g-name', wrap);
    if (target && name) wrap.scrollLeft = target.offsetLeft - name.offsetWidth - name.offsetLeft;
  }

  function viewGrille() {
    const g = ui.grille;
    const year = Number(g.annee);
    const grid = new Map();
    const years = new Set([new Date().getFullYear()]);
    data.missions.forEach((m) => {
      if (m.type !== g.type) return;
      const ym = (m.exercice || '').match(/(\d{4})$/);
      if (ym) years.add(Number(ym[1]));
      const col = periodColumn(m.exercice, year);
      if (!col) return;
      if (!grid.has(m.clientId)) grid.set(m.clientId, {});
      grid.get(m.clientId)[col] = m;
    });
    const base = data.clients
      .filter((c) => grid.has(c.id) && !c.archive)
      .filter((c) => !g.resp || [c.responsable, c.collaborateur, c.superviseur].includes(g.resp));
    const counts = base.reduce((acc, c) => {
      acc[regimeGroup(c)] = (acc[regimeGroup(c)] || 0) + 1;
      return acc;
    }, {});
    const regimeOptions = Object.fromEntries(Object.entries(REGIME_FILTRES)
      .filter(([k]) => !k || counts[k] || k === g.regime)
      .map(([k, l]) => [k, `${l} (${k ? counts[k] || 0 : base.length})`]));
    const clients = base
      .filter((c) => !g.regime || regimeGroup(c) === g.regime)
      .sort((a, b) => (a.code || '').localeCompare(b.code || '', 'fr', { numeric: true }) || a.nom.localeCompare(b.nom, 'fr'));
    const resps = Array.from(new Set(data.clients.flatMap((c) => [c.responsable, c.collaborateur, c.superviseur]).filter(Boolean))).sort();
    // Colonne « Année » affichée seulement s'il existe des missions annuelles (ex. CA12 « 2026 »).
    const cols = clients.some((c) => grid.get(c.id)[13]) ? 13 : 12;
    const totals = Array.from({ length: cols }, () => ({ done: 0, all: 0 }));

    const cell = (m, col) => {
      if (!m) return '<td class="g-none"></td>';
      totals[col - 1].all++;
      let cls = 'g-todo';
      let txt = '·';
      if (!isOpen(m)) { cls = 'g-ok'; txt = 'OK'; totals[col - 1].done++; }
      else if (isLate(m)) { cls = 'g-late'; txt = '!'; }
      else if (m.statut === 'attente_client') { cls = 'g-wait'; txt = 'Att.'; }
      else if (m.statut !== 'a_faire') { cls = 'g-progress'; txt = progress(m) + '%'; }
      return `<td class="${cls}" data-action="open-mission" data-id="${m.id}" role="button" tabindex="0" title="${esc(m.titre)} — ${esc(STATUTS[m.statut])}${m.echeance ? ' — échéance ' + fmtDate(m.echeance) : ''}">${txt}</td>`;
    };

    const body = clients.map((c) => {
      const row = grid.get(c.id);
      return `<tr>
        <td class="g-code">${esc(c.code)}</td>
        <th class="g-name" scope="row"><a href="#/dossier/${c.id}">${esc(clientLabel(c))}</a></th>
        <td class="g-meta">${esc(tvaShort(c.regimeTva))}</td>
        <td class="g-meta">${esc(c.jourTva)}</td>
        ${Array.from({ length: cols }, (_, i) => cell(row[i + 1], i + 1)).join('')}
      </tr>`;
    }).join('');

    return `
      <div class="page-head"><h1>Suivi mensuel</h1>
        <div class="head-actions"><button class="btn" data-action="import-sheet">Importer (Excel / CSV)</button></div>
      </div>
      <div class="filters">
        <select data-grille="type" aria-label="Type de mission">${options(Object.fromEntries(data.templates.map((t) => [t.id, t.nom])), g.type)}</select>
        <select data-grille="annee" aria-label="Année">${options(Array.from(years).sort().map(String), String(year))}</select>
        <select data-grille="regime" aria-label="Régime de TVA">${options(regimeOptions, g.regime)}</select>
        <select data-grille="resp" aria-label="Responsable">${options(resps, g.resp, 'Tous responsables')}</select>
        <span class="legend"><span class="g-ok">OK</span> terminée <span class="g-late">!</span> en retard <span class="g-wait">Att.</span> attente client <span class="g-todo">·</span> à faire</span>
      </div>
      ${clients.length ? `
      <div class="grid-wrap card flush">
        <table class="grille">
          <thead><tr><th>N°</th><th class="g-name">Dossier</th><th title="Régime de TVA">TVA</th><th title="Jour limite de dépôt">Jour</th>${MOIS_COURTS.map((m) => `<th>${m}</th>`).join('')}${cols === 13 ? '<th title="Déclaration annuelle de l\'exercice">Année</th>' : ''}</tr></thead>
          <tbody>${body}</tbody>
          <tfoot><tr><td class="g-code"></td><th class="g-name">Terminées</th><td class="g-meta"></td><td class="g-meta"></td>${totals.map((t) => `<td>${t.all ? `${t.done}/${t.all}` : ''}</td>`).join('')}</tr></tfoot>
        </table>
      </div>
      <p class="muted small">${clients.length} dossier${clients.length > 1 ? 's' : ''}. Cliquez sur une case pour ouvrir la mission et la marquer comme terminée. Les missions mensuelles (« MM/AAAA »), trimestrielles (« T1 AAAA ») et annuelles (« AAAA ») de l'année choisie apparaissent ici.</p>`
      : base.length
        ? emptyState(`Aucun dossier « ${esc(REGIME_FILTRES[g.regime])} » pour ces critères.`, '<button class="btn" data-action="grille-reset">Afficher tous les régimes</button>')
        : emptyState(`Aucune mission « ${esc((templateById(g.type) || {}).nom || '')} » pour ${year}.`, `<button class="btn primary" data-action="import-sheet">Importer mon tableau Excel</button>`)}`;
  }

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
      [/^(n|no|num|numero)\s*(de\s*)?dossier|^code|^ref/, 'code'],
      [/siren|siret/, 'siren'],
      [/mail/, 'email'],
      [/jour.*tva|tva.*jour|date.*tva|limite.*tva/, 'jourTva'],
      [/tva/, 'regimeTva'],
      [/^is\s*\/?\s*ir|cloture|exercice/, 'cloture'],
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
    if (/non assuj|exoner|^na$|^exo$/.test(r)) return 'Non assujetti';
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
    imp.mapping = Array.from({ length: width }, (_, i) => {
      const f = guessField((header[i] || {}).text || '', used);
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
        code: get('code').toUpperCase(),
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
        const m = data.missions.find((x) => x.clientId === c.id && x.titre === titre);
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

  async function startImport() {
    const file = await pickFile('.xlsx,.xlsm,.csv,.txt,.xls', true);
    if (!file) return;
    let book;
    try {
      book = await SheetReader.read(file);
    } catch (e) {
      toast(e.message, true);
      return;
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
            <button class="btn primary" type="submit">Enregistrer</button>
          </form>
        </section>
        <section class="card">
          <h2>Sécurité et confidentialité</h2>
          <label>Verrouillage automatique après inactivité
            <select data-setting="autoLockMin">${options({ 1: '1 minute', 2: '2 minutes', 5: '5 minutes', 10: '10 minutes', 15: '15 minutes', 30: '30 minutes' }, String(s.autoLockMin))}</select>
          </label>
          <label class="check"><input type="checkbox" data-setting="lockOnHide"${s.lockOnHide ? ' checked' : ''}><span>Verrouiller dès que l'application passe en arrière-plan</span></label>
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
          <p class="muted small">Les modifications s'appliquent aux nouvelles missions uniquement.</p>
        </div>
        <footer class="modal-foot">
          ${!isNew && data.templates.length > 1 ? `<button type="button" class="btn danger" data-action="delete-template" data-id="${t.id}">Supprimer</button>` : ''}
          <span class="spacer"></span>
          <button type="button" class="btn" data-action="close-modal">Annuler</button><button class="btn primary" type="submit">Enregistrer</button>
        </footer>
      </form>`);
  }

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
            ${input ? `<input type="${input}" name="value" required spellcheck="false" autocomplete="off">` : ''}
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

  async function lock(message) {
    if (!data) return;
    await saving;
    Vault.lock();
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
    if (data && data.settings.autoLockMin > 0 && Date.now() - lastActivity > data.settings.autoLockMin * 60000) {
      lock('Verrouillée automatiquement après inactivité.');
    }
  }
  setInterval(checkIdle, 10000);

  document.addEventListener('visibilitychange', () => {
    if (!data) return;
    if (document.hidden && data.settings.lockOnHide) lock();
    else if (!document.hidden) checkIdle();
  });

  async function afterUnlock() {
    lastActivity = Date.now();
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

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const actions = {
    'lock': () => lock(),
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
    'filter-missions': (el) => {
      ui.mf = { q: '', statut: el.dataset.statut || 'ouvertes', resp: '', periode: el.dataset.periode || 'toutes', type: '' };
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
      await Vault.destroy();
      data = null;
      closeModal();
      location.hash = '';
      renderSetup();
    },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || !actions[el.dataset.action]) return;
    if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') e.preventDefault();
    actions[el.dataset.action](el, e);
  });

  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button][data-action]')) {
      e.preventDefault();
      e.target.click();
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!data) return;
    if (t.dataset.imp && ui.imp) {
      onImportChange(t);
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

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.filter && data) {
      const path = t.dataset.filter.split('.');
      const value = t.type === 'checkbox' ? t.checked : t.value;
      if (path.length === 2) ui[path[0]][path[1]] = value;
      else ui[path[0]] = value;
      if (path[0] === 'mf') renderMissionList();
      else renderDossierList();
    }
    if (t.name === 'p1' && t.form) {
      const bar = $('[data-strength]', t.form);
      if (bar) bar.dataset.score = t.value ? passwordScore(t.value) : '';
    }
  });

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
      const fields = ['nom', 'code', 'forme', 'siren', 'cloture', 'regimeFiscal', 'regimeTva', 'jourTva', 'responsable', 'collaborateur', 'superviseur', 'contact', 'email', 'tel', 'lettreMission', 'vigilance', 'kycDate', 'notes'];
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

    async template(form) {
      const id = form.dataset.id;
      const values = {
        nom: val(form, 'nom'),
        recurrence: val(form, 'recurrence'),
        etapes: form.etapes.value.split('\n').map((s) => s.trim()).filter(Boolean),
      };
      if (id) Object.assign(templateById(id), values);
      else data.templates.push(Object.assign({ id: uid() }, values));
      await persist();
      closeModal();
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
      (await Vault.exists()) ? renderLock() : renderSetup();
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
})();
