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
    {
      id: 'acompte_is', nom: "Acompte d'IS", recurrence: 'trimestrielle',
      etapes: ["Calcul de l'acompte", 'Validation', 'Télépaiement (relevé 2571)'],
    },
    {
      id: 'solde_is', nom: "Solde d'IS", recurrence: 'annuelle',
      etapes: ["Calcul de l'IS définitif", 'Relevé de solde 2572 télétransmis', 'Paiement du solde'],
    },
    {
      id: 'cfe', nom: 'CFE', recurrence: 'annuelle',
      etapes: ["Avis d'imposition consulté", 'Montant contrôlé', 'Paiement / prélèvement vérifié'],
    },
    {
      id: 'ca12', nom: 'TVA annuelle (CA12)', recurrence: 'annuelle',
      etapes: ['Pièces reçues', 'Calcul de la TVA annuelle', 'Validation', 'Télédéclaration CA12', 'Télépaiement'],
    },
    {
      id: 'acompte_ca12', nom: 'Acompte de TVA (CA12)', recurrence: 'aucune',
      etapes: ["Calcul de l'acompte", 'Télépaiement'],
    },
    { id: 'libre', nom: 'Mission libre', recurrence: 'aucune', etapes: [] },
  ];
  // Version des modèles par défaut : les modèles ajoutés depuis sont proposés aux coffres existants.
  const TEMPLATES_VERSION = 2;

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
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01"/>',
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
        tplVersion: TEMPLATES_VERSION,
        relanceJours: 7,
        signature: '',
        dashResp: '',
        dossierView: 'cartes',
        pointage: false,
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
    const tplVersion = (d.settings && d.settings.tplVersion) || (d === base ? TEMPLATES_VERSION : 1);
    d.settings = Object.assign(base.settings, d.settings || {});
    d.templates = Array.isArray(d.templates) ? d.templates : base.templates;
    d.clients = Array.isArray(d.clients) ? d.clients : [];
    d.missions = Array.isArray(d.missions) ? d.missions : [];
    d.journal = Array.isArray(d.journal) ? d.journal : [];
    if (tplVersion < TEMPLATES_VERSION) {
      const libre = d.templates.findIndex((t) => t.id === 'libre');
      const missing = DEFAULT_TEMPLATES.filter((t) => t.id !== 'libre' && !d.templates.some((x) => x.id === t.id));
      d.templates.splice(libre >= 0 ? libre : d.templates.length, 0, ...clone(missing));
      d.settings.tplVersion = TEMPLATES_VERSION;
    }
    d.missions.forEach((m) => {
      m.etapes = Array.isArray(m.etapes) ? m.etapes : [];
      m.statut = STATUTS[m.statut] ? m.statut : 'a_faire';
    });
    d.version = 1;
    return d;
  }

  function persist(opts) {
    data.updatedAt = nowIso();
    const snapshot = data;
    saving = saving
      .then(() => Vault.save(snapshot))
      .catch((err) => toast("Erreur d'enregistrement : " + err.message, true));
    if (!(opts && opts.noAutoBackup)) scheduleAutoBackup();
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
    if (statut === 'attente_client') m.attenteDepuis = todayStr();
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
      case 'aide': main.innerHTML = viewAide(); break;
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
    const r = s.dashResp;
    const clientInScope = (c) => !r || [c.responsable, c.collaborateur, c.superviseur].includes(r);
    const inScope = (m) => {
      const c = clientById(m.clientId);
      return c && !c.archive && (!r || m.responsable === r || clientInScope(c));
    };
    const active = data.clients.filter((c) => !c.archive && clientInScope(c));
    const open = data.missions.filter((m) => isOpen(m) && inScope(m));
    const late = open.filter(isLate).sort(byDue);
    const soon = open.filter((m) => m.echeance && daysUntil(m.echeance) >= 0 && daysUntil(m.echeance) <= 14).sort(byDue);
    const wait = open.filter((m) => m.statut === 'attente_client').sort(byDue);
    const relances = wait.filter(relanceDue);
    const review = open.filter((m) => m.statut === 'a_valider').sort(byDue);
    const compliance = active.map((c) => ({ c, issues: complianceIssues(c) })).filter((x) => x.issues.length);
    const resps = Array.from(new Set(s.collaborateurs.concat(data.clients.flatMap((c) => [c.responsable, c.collaborateur, c.superviseur])).filter(Boolean))).sort();

    const hour = new Date().getHours();
    const hello = (hour < 18 ? 'Bonjour' : 'Bonsoir') + (s.utilisateur ? ' ' + s.utilisateur : '');

    let backupBanner = '';
    if (ui.autoBackup && ui.autoBackup.needsPermission) {
      backupBanner = `<div class="banner warn"><span>La sauvegarde automatique vers <strong>${esc(ui.autoBackup.name)}</strong> doit être réactivée (autorisation du navigateur).</span>
        <button class="btn small" data-action="autobackup-resume">Réactiver</button></div>`;
    } else if (data.clients.length && !(ui.autoBackup && ui.autoBackup.active)) {
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

    // Campagnes : missions d'un même modèle et d'une même période (ex. « Bilan annuel 2025 »),
    // limitées à celles dont une échéance est dépassée ou proche.
    const groups = {};
    const horizon = addDays(todayStr(), 45);
    data.missions.forEach((m) => {
      if (!m.exercice || !inScope(m)) return;
      const key = tplName(m.type) + ' ' + m.exercice;
      const g = (groups[key] = groups[key] || { key, total: 0, done: 0, due: '9999' });
      g.total++;
      if (!isOpen(m)) g.done++;
      else if (m.echeance && m.echeance < g.due) g.due = m.echeance;
    });
    const campaigns = Object.values(groups)
      .filter((g) => g.total >= 2 && g.done < g.total && g.due <= horizon)
      .sort((a, b) => a.due.localeCompare(b.due))
      .slice(0, 9);

    const section = (title, list, emptyText) => `
      <section class="card">
        <h2>${title} <span class="count">${list.length}</span></h2>
        ${list.length ? `<div class="mlist">${list.slice(0, 12).map((m) => missionRow(m, true)).join('')}</div>${list.length > 12 ? `<a class="more" href="#/missions">Voir tout</a>` : ''}` : `<p class="muted">${emptyText}</p>`}
      </section>`;

    return `
      <div class="page-head"><h1>${esc(hello)}</h1>
        <div class="head-actions">
          <button class="btn" data-action="open-cal">${icon('calendar')}Calendrier fiscal</button>
          <button class="btn" data-action="new-client">${icon('plus')}Dossier</button>
          <button class="btn primary" data-action="new-mission">${icon('plus')}Mission</button>
        </div>
      </div>
      <div class="filters">
        <select data-dash="resp" aria-label="Portefeuille">${options(Object.fromEntries([['', 'Tous les dossiers du cabinet']].concat(resps.map((x) => [x, x === s.utilisateur ? `Mes dossiers (${x})` : `Portefeuille de ${x}`]))), r)}</select>
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
        return `<div class="campaign"><div class="campaign-head"><span>${esc(g.key)}</span><span class="muted">${g.done}/${g.total}</span></div>${bar(p)}<div class="muted small">${g.due < '9999' ? (g.due < todayStr() ? '<span class="late">échéance dépassée</span>' : 'prochaine échéance ' + fmtDate(g.due)) : ''}</div></div>`;
      }).join('')}</div></section>` : ''}
      <div class="grid2">
        ${section('En retard', late, 'Aucune mission en retard. 👍')}
        ${section('Échéances des 14 prochains jours', soon, 'Rien de prévu dans les 14 prochains jours.')}
        ${relances.length ? section(`À relancer <span class="muted small">(sans nouvelles depuis ${s.relanceJours} j ou plus)</span>`, relances, '') : ''}
        ${section('En attente du client', wait, 'Aucune mission en attente du client.')}
        ${section('À valider', review, 'Aucune mission à valider.')}
      </div>
      ${compliance.length ? `<section class="card"><details${compliance.length <= 5 ? ' open' : ''}><summary><h2>Conformité (lettre de mission, LCB-FT) <span class="count">${compliance.length}</span></h2></summary>
        <p class="muted small">Dossiers dont la lettre de mission ou l'identification LCB-FT n'est pas renseignée ou doit être revue. Complétez-les depuis la fiche du dossier (bouton « Modifier »).</p>
        <div class="clist">${compliance.map(({ c, issues }) => `
          <a class="crow" href="#/dossier/${c.id}"><span class="crow-name">${esc(clientLabel(c))}</span><span class="crow-issues">${issues.map((i) => `<span class="badge warn">${esc(i)}</span>`).join('')}</span></a>`).join('')}
        </div></details></section>` : ''}`;
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
        <div class="head-actions"><button class="btn" data-action="open-cal">${icon('calendar')}Calendrier fiscal</button><button class="btn primary" data-action="new-mission">${icon('plus')}Nouvelle mission</button></div>
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
          ${m.relances && m.relances.length ? `<p class="muted small">Client relancé ${m.relances.length} fois, dernière fois le ${fmtDate(lastRelance(m).slice(0, 10))}.${relanceDue(m) ? ' <strong class="late">Nouvelle relance conseillée.</strong>' : ''}</p>` : m.statut === 'attente_client' && m.attenteDepuis ? `<p class="muted small">En attente du client depuis le ${fmtDate(m.attenteDepuis)}.</p>` : ''}
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
          ${c && isOpen(m) ? `<button class="btn" data-action="open-msg" data-client="${c.id}" data-mission="${m.id}">${icon('mail')}Écrire au client</button>` : ''}
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

  // Données de la grille : dossiers affichés et missions indexées par colonne (1-12, 13 = année).
  function grilleModel() {
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
    return { g, year, grid, years, base, clients, resps, regimeOptions, cols };
  }

  function grilleCellState(m) {
    if (!m) return 'none';
    if (!isOpen(m)) return 'ok';
    if (isLate(m)) return 'late';
    if (m.statut === 'attente_client') return 'wait';
    return m.statut === 'a_faire' ? 'todo' : 'progress';
  }

  async function exportGrille() {
    const { year, grid, clients, cols } = grilleModel();
    const ok = await ask({
      title: 'Export Excel non chiffré',
      message: "Le fichier Excel n'est <strong>pas chiffré</strong> et contient des informations couvertes par le secret professionnel. Enregistrez-le uniquement sur un support sécurisé. Il peut être réimporté dans l'application.",
      okLabel: 'Exporter',
    });
    if (!ok) return;
    const STYLE = { ok: 3, late: 4, none: 5, todo: 6, progress: 6, wait: 7 };
    const head = ['N°DOSSIER', 'STATUT', 'DOSSIERS', 'RESPONSABLE', 'COLLABORATEUR', 'SUPERVISEUR', 'SIREN', 'TVA', 'JOUR TVA', 'IS/IR']
      .concat(Array.from({ length: 12 }, (_, i) => i + 1), cols === 13 ? ['ANNÉE'] : []);
    const rows = [head.map((v) => ({ v, s: 1 }))];
    clients.forEach((c) => {
      const row = grid.get(c.id);
      const text = (v) => ({ v: v || '', s: 2 });
      const cells = [c.code, c.forme, c.nom, c.responsable, c.collaborateur, c.superviseur, c.siren, tvaShort(c.regimeTva)].map(text);
      cells.push({ v: c.jourTva ? Number(c.jourTva) : '', s: 6 }, text(c.cloture ? `${c.cloture}/${year}` : ''));
      for (let i = 1; i <= cols; i++) {
        const state = grilleCellState(row[i]);
        cells.push({ v: state === 'ok' ? 'OK' : state === 'wait' ? 'ATT' : '', s: STYLE[state] });
      }
      rows.push(cells);
    });
    const blob = XlsxWriter.build({
      sheetName: `Suivi ${tplName(ui.grille.type)} ${year}`,
      rows,
      widths: [11, 9, 44, 13, 15, 13, 17, 7, 9, 12].concat(Array(cols).fill(6)),
      freeze: { row: 1, col: 3 },
    });
    download(`suivi-${norm(tplName(ui.grille.type)).replace(/[^a-z0-9]+/g, '-')}-${year}.xlsx`, blob, blob.type);
  }

  function viewGrille() {
    const { g, year, grid, years, base, clients, resps, regimeOptions, cols } = grilleModel();
    const pointage = !!data.settings.pointage;
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
      return `<td class="${cls}" data-action="${pointage ? 'grille-toggle' : 'open-mission'}" data-id="${m.id}" role="button" tabindex="0" title="${esc(m.titre)} — ${esc(STATUTS[m.statut])}${m.echeance ? ' — échéance ' + fmtDate(m.echeance) : ''}${pointage ? ' — cliquer pour ' + (isOpen(m) ? 'pointer OK' : 'annuler') : ''}">${txt}</td>`;
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
        <div class="head-actions">
          <button class="btn" data-action="open-cal">${icon('calendar')}Calendrier fiscal</button>
          <button class="btn" data-action="import-sheet">Importer</button>
          <button class="btn" data-action="export-grille"${clients.length ? '' : ' disabled'}>Exporter en Excel</button>
        </div>
      </div>
      <div class="filters">
        <select data-grille="type" aria-label="Type de mission">${options(Object.fromEntries(data.templates.map((t) => [t.id, t.nom])), g.type)}</select>
        <select data-grille="annee" aria-label="Année">${options(Array.from(years).sort().map(String), String(year))}</select>
        <select data-grille="regime" aria-label="Régime de TVA">${options(regimeOptions, g.regime)}</select>
        <select data-grille="resp" aria-label="Responsable">${options(resps, g.resp, 'Tous responsables')}</select>
        <div class="seg" role="group" aria-label="Mode de clic">
          <button class="${pointage ? '' : 'on'}" data-action="grille-mode" data-mode="fiche" title="Un clic ouvre la mission">Ouvrir</button>
          <button class="${pointage ? 'on' : ''}" data-action="grille-mode" data-mode="pointage" title="Un clic pointe la case OK">Pointage rapide</button>
        </div>
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
      <p class="muted small">${clients.length} dossier${clients.length > 1 ? 's' : ''}. ${pointage ? '<strong>Pointage rapide :</strong> un clic sur une case la passe à OK, un second clic annule.' : 'Cliquez sur une case pour ouvrir la mission, ou activez le « Pointage rapide » pour cocher les cases comme dans Excel.'} Les missions mensuelles (« MM/AAAA »), trimestrielles (« T1 AAAA ») et annuelles (« AAAA ») de l'année choisie apparaissent ici.</p>`
      : base.length
        ? emptyState(`Aucun dossier « ${esc(REGIME_FILTRES[g.regime])} » pour ces critères.`, '<button class="btn" data-action="grille-reset">Afficher tous les régimes</button>')
        : emptyState(`Aucune mission « ${esc((templateById(g.type) || {}).nom || '')} » pour ${year}.`, `<button class="btn primary" data-action="import-sheet">Importer mon tableau Excel</button>`)}`;
  }

  // ---------------------------------------------------------------------------
  // Messages et relances clients
  // ---------------------------------------------------------------------------

  const MODELES_MESSAGE = { pieces: 'Demande de documents', relance: 'Relance', validation: 'Envoi pour validation' };
  const PIECE_RE = /re[çc]u|pi[èe]ce|relev|document|variable|justificatif|lettre de mission|avis|facture/i;

  // Étapes non cochées qui correspondent à des documents attendus du client.
  function piecesManquantes(m) {
    const periode = m.exercice ? ` de la période ${m.exercice}` : '';
    return m.etapes
      .filter((e) => !e.done && PIECE_RE.test(e.label))
      .map((e) => {
        const label = e.label.replace(/\s+re[çc]u(e|s|es)?$/i, '').replace(/\s+à jour$/i, '');
        if (/^(pi[èe]ces|documents)$/i.test(label)) return `Pièces${periode} (factures d'achats et de ventes, relevés bancaires, justificatifs)`;
        if (/^pi[èe]ces comptables$/i.test(label)) return `Pièces comptables${periode} (factures, notes de frais, justificatifs)`;
        return label + (/relev|variable/i.test(label) ? periode : '');
      });
  }

  const lastRelance = (m) => (m.relances && m.relances.length ? m.relances[m.relances.length - 1] : null);

  // Mission en attente du client sans relance depuis le délai choisi dans les paramètres.
  function relanceDue(m) {
    if (m.statut !== 'attente_client') return false;
    const since = lastRelance(m) ? lastRelance(m).slice(0, 10) : m.attenteDepuis || (m.updatedAt || '').slice(0, 10);
    return !since || -daysUntil(since) >= (data.settings.relanceJours || 7);
  }

  function buildMessage(c, missions, modele) {
    const s = data.settings;
    const salut = c.contact ? `Bonjour ${c.contact},` : 'Bonjour,';
    const signature = s.signature || [s.utilisateur, s.cabinet].filter(Boolean).join('\n');
    const titres = missions.map((m) => `« ${m.titre} »`).join(', ');
    const nextDue = missions.map((m) => m.echeance).filter(Boolean).sort()[0];
    const pieces = [];
    missions.forEach((m) => piecesManquantes(m).forEach((p) => {
      const line = missions.length > 1 ? `${p} (${m.titre})` : p;
      if (!pieces.includes(line)) pieces.push(line);
    }));
    if (!pieces.length) pieces.push("les pièces comptables de la période (factures d'achats et de ventes, relevés bancaires, justificatifs)");
    const list = pieces.map((p) => `- ${p}`);
    const ending = ['', 'Nous restons à votre disposition pour toute question.', '', 'Cordialement,', signature];
    let subject;
    let body;
    if (modele === 'relance') {
      const last = missions.map(lastRelance).filter(Boolean).sort().pop();
      subject = `Relance — ${c.nom} : documents en attente`;
      body = [salut, '',
        `Sauf erreur de notre part, nous n'avons pas encore reçu les éléments ${last ? `demandés le ${fmtDate(last.slice(0, 10))} ` : 'nécessaires '}pour ${titres} :`,
        ...list, '',
        nextDue
          ? daysUntil(nextDue) < 0
            ? `L'échéance du ${fmtDate(nextDue)} est dépassée : merci de nous transmettre ces documents dans les meilleurs délais.`
            : `L'échéance est fixée au ${fmtDate(nextDue)} : sans ces documents, nous ne pourrons pas la respecter.`
          : 'Merci de nous les transmettre dans les meilleurs délais.',
        ...ending];
    } else if (modele === 'validation') {
      const limit = nextDue ? addDays(nextDue, -3) : null;
      subject = `${c.nom} — ${missions.map((m) => m.titre).join(', ')} : pour validation`;
      body = [salut, '',
        `Vous trouverez ci-joint ${titres} concernant ${c.nom}.`,
        limit && limit >= todayStr()
          ? `Merci de nous faire part de votre validation avant le ${fmtDate(limit)}, afin que nous puissions procéder au dépôt dans les délais (échéance du ${fmtDate(nextDue)}).`
          : 'Merci de nous faire part de votre validation dans les meilleurs délais, afin que nous puissions procéder au dépôt.',
        ...ending];
    } else {
      const limit = nextDue ? addDays(nextDue, -7) : null;
      subject = `${c.nom} — documents nécessaires : ${missions.map((m) => m.titre).join(', ')}`;
      body = [salut, '',
        `Afin de mener à bien ${titres} pour ${c.nom}, nous avons besoin des éléments suivants :`,
        ...list, '',
        limit && limit > todayStr()
          ? `Nous vous remercions de nous les transmettre au plus tard le ${fmtDate(limit)}, afin de respecter l'échéance du ${fmtDate(nextDue)}.`
          : 'Nous vous remercions de nous les transmettre dès que possible.',
        ...ending];
    }
    return { subject, body: body.join('\n') };
  }

  function openMessage(clientId, missionId) {
    const c = clientById(clientId);
    if (!c) return;
    const open = data.missions.filter((m) => m.clientId === c.id && isOpen(m)).sort(byDue);
    let selected = missionId ? [missionId] : open.filter((m) => m.statut === 'attente_client').map((m) => m.id);
    if (!selected.length && open.length) selected = [open[0].id];
    const first = missionById(selected[0]);
    ui.msg = {
      clientId, selected: new Set(selected),
      modele: first && first.statut === 'attente_client' && lastRelance(first) ? 'relance' : first && first.statut === 'a_valider' ? 'validation' : 'pieces',
    };
    renderMessage();
  }

  function renderMessage() {
    const st = ui.msg;
    const c = clientById(st.clientId);
    const open = data.missions.filter((m) => m.clientId === c.id && isOpen(m)).sort(byDue);
    const missions = open.filter((m) => st.selected.has(m.id));
    const msg = buildMessage(c, missions.length ? missions : open.slice(0, 1), st.modele);
    modalRefresh = null;
    openModal(`
      <div class="sheet">
        <header class="modal-head"><div><div class="muted small">${esc(c.nom)}${c.email ? ' · ' + esc(c.email) : ''}</div><h2>Écrire au client</h2></div><button type="button" class="icon-btn" data-action="close-modal" aria-label="Fermer">✕</button></header>
        <div class="modal-body">
          <div class="seg msg-models" role="group" aria-label="Modèle">${Object.entries(MODELES_MESSAGE).map(([k, l]) => `<button class="${k === st.modele ? 'on' : ''}" data-action="msg-model" data-model="${k}">${l}</button>`).join('')}</div>
          ${open.length > 1 ? `<div class="msg-missions">${open.map((m) => `<label class="check"><input type="checkbox" data-msg="mission" value="${m.id}"${st.selected.has(m.id) ? ' checked' : ''}><span>${esc(m.titre)} <span class="muted small">${m.echeance ? fmtDate(m.echeance) : ''} · ${esc(STATUTS[m.statut])}${lastRelance(m) ? ` · relancé le ${fmtDate(lastRelance(m).slice(0, 10))}` : ''}</span></span></label>`).join('')}</div>` : ''}
          <label>Objet<input id="msg-subject" value="${esc(msg.subject)}" spellcheck="false"></label>
          <label>Message<textarea id="msg-body" rows="14" spellcheck="false">${esc(msg.body)}</textarea></label>
          <p class="muted small">Le message est préparé ici puis envoyé par <strong>votre propre messagerie</strong> : l'application n'envoie rien elle-même. La liste des documents reprend les étapes non cochées de la mission. Relisez et ajustez avant l'envoi.${c.email ? '' : ' Ajoutez l\'e-mail du client dans sa fiche pour ouvrir directement votre messagerie.'}</p>
        </div>
        <footer class="modal-foot">
          <button type="button" class="btn" data-action="close-modal">Fermer</button>
          <span class="spacer"></span>
          <button class="btn" data-action="msg-copy">Copier le message</button>
          <button class="btn primary" data-action="msg-mail"${c.email ? '' : ' disabled'}>${icon('mail')}Ouvrir dans ma messagerie</button>
        </footer>
      </div>`, true);
  }

  // Trace l'envoi : date de relance, statut « attente client », journal du dossier.
  function recordMessage() {
    const st = ui.msg;
    const c = clientById(st.clientId);
    const missions = data.missions.filter((m) => st.selected.has(m.id) && isOpen(m));
    missions.forEach((m) => {
      m.relances = (m.relances || []).concat(nowIso());
      if (st.modele !== 'validation' && ['a_faire', 'en_cours'].includes(m.statut)) setStatus(m, 'attente_client');
      m.updatedAt = nowIso();
    });
    log(c.id, `${MODELES_MESSAGE[st.modele]} envoyée${missions.length ? ' : ' + missions.map((m) => m.titre).join(', ') : ''}.`, false);
    persist();
  }

  // ---------------------------------------------------------------------------
  // Calendrier fiscal : génération automatique des échéances
  // ---------------------------------------------------------------------------

  const FERIES_FIXES = ['01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25'];

  function easterSunday(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
  }

  // Jour ouvré : ni samedi, ni dimanche, ni jour férié (fixes, lundi de Pâques, Ascension, lundi de Pentecôte).
  function isWorkingDay(d) {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) return false;
    if (FERIES_FIXES.includes(ymd(d).slice(5))) return false;
    const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - easterSunday(d.getFullYear())) / 86400000);
    return ![1, 39, 50].includes(diff);
  }

  function nextWorkingDay(s) {
    const d = parseYmd(s);
    while (!isWorkingDay(d)) d.setDate(d.getDate() + 1);
    return ymd(d);
  }

  function nthWorkingDayAfter(s, n) {
    const d = parseYmd(s);
    for (let k = 0; k < n;) {
      d.setDate(d.getDate() + 1);
      if (isWorkingDay(d)) k++;
    }
    return ymd(d);
  }

  function addDays(s, n) {
    const d = parseYmd(s);
    d.setDate(d.getDate() + n);
    return ymd(d);
  }

  function endOfMonth(s) {
    const d = parseYmd(s);
    return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }

  function closingDate(c, year) {
    const m = (c.cloture || '31/12').match(/^(\d{2})\/(\d{2})$/) || [0, '31', '12'];
    return dayOfMonth(year, Number(m[2]) - 1, Number(m[1]));
  }

  const isDecClosing = (closing) => closing.slice(5) === '12-31';
  const nextYear = (closing) => Number(closing.slice(0, 4)) + 1;

  // Liasse : 2e jour ouvré après le 1er mai (clôture au 31/12) ou 3 mois après la clôture, + 15 jours en télétransmission.
  function liasseDate(closing) {
    const base = isDecClosing(closing) ? nthWorkingDayAfter(`${nextYear(closing)}-05-01`, 2) : endOfMonth(addMonths(closing, 3));
    return nextWorkingDay(addDays(base, 15));
  }

  function ca12Date(closing) {
    return isDecClosing(closing) ? nthWorkingDayAfter(`${nextYear(closing)}-05-01`, 2) : nextWorkingDay(endOfMonth(addMonths(closing, 3)));
  }

  // Solde d'IS : 15 mai (clôture au 31/12), sinon le 15 du 4e mois suivant la clôture.
  function soldeIsDate(closing) {
    if (isDecClosing(closing)) return nextWorkingDay(`${nextYear(closing)}-05-15`);
    const d = parseYmd(closing);
    return nextWorkingDay(dayOfMonth(d.getFullYear(), d.getMonth() + 4, 15));
  }

  const SOCIETES = ['EURL', 'SARL', 'SAS', 'SASU', 'SA', 'SNC', 'SC', 'SCI', 'SCM', 'SMC', 'SCCV', 'SCP', 'SPFPL', 'SELARL', 'SELAS', 'SELAFA', 'SELCA', 'EARL', 'GAEC'];
  const IS_PAR_DEFAUT = ['SAS', 'SASU', 'SA', 'SELAS', 'SARL', 'SELARL'];
  const formeOf = (c) => (c.forme || '').toUpperCase();

  // Sans régime fiscal renseigné, l'IS est présumé pour les formes qui y sont soumises par défaut.
  function presumedIS(c) {
    const r = norm(c.regimeFiscal);
    return r ? r === 'is' : IS_PAR_DEFAUT.includes(formeOf(c));
  }

  const tplName = (id) => (templateById(id) || DEFAULT_TEMPLATES.find((t) => t.id === id) || { nom: id }).nom;

  const OBLIGATIONS = [
    {
      id: 'tva', label: 'TVA mensuelle / trimestrielle',
      rule: 'Au jour limite TVA du dossier, le mois qui suit la période.',
      applies: (c) => ['M', 'T'].includes(tvaShort(c.regimeTva)),
      plan: (c, Y) => {
        const quarterly = tvaShort(c.regimeTva) === 'T';
        const out = [];
        for (let n = 1; n <= 12; n++) {
          if (quarterly && n % 3) continue;
          const label = quarterly ? `T${n / 3} ${Y}` : `${pad(n)}/${Y}`;
          out.push({
            tpl: 'tva', titre: `TVA ${label}`, exercice: label, recurrence: quarterly ? 'trimestrielle' : 'mensuelle',
            echeance: c.jourTva ? nextWorkingDay(dayOfMonth(Y, n, c.jourTva)) : '',
            ref: dayOfMonth(Y, n, c.jourTva || 24),
          });
        }
        return out;
      },
    },
    {
      id: 'ca12', label: 'TVA annuelle CA12 et acomptes',
      rule: 'CA12 : 2e jour ouvré après le 1er mai (clôture au 31/12) ou 3 mois après la clôture. Acomptes : juillet et décembre (15 du mois).',
      applies: (c) => tvaShort(c.regimeTva) === 'CA12',
      plan: (c, Y) => [
        { tpl: 'ca12', titre: `TVA CA12 ${Y}`, exercice: String(Y), echeance: ca12Date(closingDate(c, Y)), recurrence: 'annuelle' },
        { tpl: 'acompte_ca12', titre: `Acompte CA12 07/${Y}`, exercice: `07/${Y}`, echeance: nextWorkingDay(`${Y}-07-15`), recurrence: 'aucune' },
        { tpl: 'acompte_ca12', titre: `Acompte CA12 12/${Y}`, exercice: `12/${Y}`, echeance: nextWorkingDay(`${Y}-12-15`), recurrence: 'aucune' },
      ],
    },
    {
      id: 'acompte_is', label: "Acomptes d'IS",
      rule: "15 mars, 15 juin, 15 septembre, 15 décembre (dossiers à l'IS).",
      applies: presumedIS,
      plan: (c, Y) => [3, 6, 9, 12].map((n) => ({
        tpl: 'acompte_is', titre: `Acompte IS ${pad(n)}/${Y}`, exercice: `${pad(n)}/${Y}`, echeance: nextWorkingDay(`${Y}-${pad(n)}-15`), recurrence: 'trimestrielle',
      })),
    },
    {
      id: 'solde_is', label: "Solde d'IS (2572)",
      rule: '15 mai (clôture au 31/12) ou le 15 du 4e mois suivant la clôture.',
      applies: presumedIS,
      plan: (c, Y) => [{ tpl: 'solde_is', titre: `Solde IS ${Y}`, exercice: String(Y), echeance: soldeIsDate(closingDate(c, Y)), recurrence: 'annuelle' }],
    },
    {
      id: 'bilan', label: 'Bilan et liasse fiscale',
      rule: 'Exercice clos dans l\'année : 2e jour ouvré après le 1er mai (clôture au 31/12) ou 3 mois après la clôture, + 15 jours de télétransmission.',
      applies: (c) => norm(c.forme) !== 'particulier',
      plan: (c, Y) => [{ tpl: 'bilan', titre: `${tplName('bilan')} ${Y}`, exercice: String(Y), echeance: liasseDate(closingDate(c, Y)), recurrence: 'annuelle' }],
    },
    {
      id: 'juridique', label: 'Approbation des comptes et dépôt au greffe',
      rule: 'Assemblée dans les 6 mois suivant la clôture (sociétés).',
      applies: (c) => SOCIETES.includes(formeOf(c)),
      plan: (c, Y) => [{ tpl: 'juridique', titre: `${tplName('juridique')} ${Y}`, exercice: String(Y), echeance: nextWorkingDay(endOfMonth(addMonths(closingDate(c, Y), 6))), recurrence: 'annuelle' }],
    },
    {
      id: 'cfe', label: 'CFE',
      rule: '15 décembre (hors particuliers et SCI).',
      applies: (c) => norm(c.forme) !== 'particulier' && formeOf(c) !== 'SCI',
      plan: (c, Y) => [{ tpl: 'cfe', titre: `CFE ${Y}`, exercice: String(Y), echeance: nextWorkingDay(`${Y}-12-15`), recurrence: 'annuelle' }],
    },
  ];

  function calClients() {
    const cal = ui.cal;
    return data.clients
      .filter((c) => !c.archive)
      .filter((c) => !cal.only || c.id === cal.only)
      .filter((c) => !cal.resp || [c.responsable, c.collaborateur, c.superviseur].includes(cal.resp))
      .sort((a, b) => (a.code || '').localeCompare(b.code || '', 'fr', { numeric: true }));
  }

  function calPlan() {
    const cal = ui.cal;
    const today = todayStr();
    const res = { items: [], existing: 0, past: 0, byOb: {}, clients: new Set() };
    calClients().forEach((c) => {
      if (cal.excluded.has(c.id)) return;
      OBLIGATIONS.forEach((ob) => {
        if (!cal.obligations.has(ob.id) || !ob.applies(c)) return;
        ob.plan(c, cal.year).forEach((p) => {
          if (data.missions.some((m) => m.clientId === c.id && m.titre === p.titre)) { res.existing++; return; }
          if (cal.skipPast && (p.echeance || p.ref) < today) { res.past++; return; }
          res.items.push(Object.assign({ c }, p));
          res.byOb[ob.id] = (res.byOb[ob.id] || 0) + 1;
          res.clients.add(c.id);
        });
      });
    });
    return res;
  }

  function applyCal() {
    const res = calPlan();
    const stamp = nowIso();
    const perClient = {};
    res.items.forEach((p) => {
      let tpl = templateById(p.tpl);
      if (!tpl) {
        tpl = clone(DEFAULT_TEMPLATES.find((t) => t.id === p.tpl));
        data.templates.push(tpl);
      }
      data.missions.push({
        id: uid(), clientId: p.c.id, type: tpl.id, titre: p.titre, exercice: p.exercice, echeance: p.echeance,
        statut: 'a_faire', priorite: 'normale', responsable: p.c.responsable || p.c.collaborateur || '',
        recurrence: p.recurrence, notes: '', suiteCreee: false, termineLe: null, createdAt: stamp, updatedAt: stamp,
        etapes: tpl.etapes.map((label) => ({ id: uid(), label, done: false, doneAt: null })),
      });
      perClient[p.c.id] = (perClient[p.c.id] || 0) + 1;
    });
    Object.entries(perClient).forEach(([id, n]) => log(id, `Calendrier fiscal ${ui.cal.year} : ${n} échéance(s) créée(s).`, true));
    return res;
  }

  function openCalendar(onlyClient) {
    const prev = ui.cal;
    ui.cal = {
      year: prev ? prev.year : new Date().getFullYear(),
      skipPast: true,
      obligations: prev ? prev.obligations : new Set(OBLIGATIONS.map((o) => o.id)),
      resp: '',
      excluded: new Set(),
      only: onlyClient || '',
    };
    renderCalendar();
  }

  function renderCalendar() {
    const cal = ui.cal;
    const res = calPlan();
    const clients = calClients();
    const resps = Array.from(new Set(data.clients.flatMap((c) => [c.responsable, c.collaborateur, c.superviseur]).filter(Boolean))).sort();
    const only = cal.only && clientById(cal.only);
    modalRefresh = null;
    openModal(`
      <div class="sheet">
        <header class="modal-head"><div><div class="muted small">${only ? esc(clientLabel(only)) : 'Assistant'}</div><h2>Calendrier fiscal</h2></div><button type="button" class="icon-btn" data-action="close-modal" aria-label="Fermer">✕</button></header>
        <div class="modal-body">
          <p class="muted small">Crée en une fois les échéances de l'année pour vos dossiers, selon leur forme, leur régime de TVA, leur régime fiscal et leur date de clôture. Les échéances déjà présentes ne sont jamais dupliquées.</p>
          <div class="form-grid">
            <label>Année<input type="number" min="2000" max="2100" data-cal="year" value="${cal.year}"></label>
            ${only ? '' : `<label>Responsable<select data-cal="resp">${options(resps, cal.resp, 'Tous les dossiers')}</select></label>`}
          </div>
          <label class="check"><input type="checkbox" data-cal="skipPast"${cal.skipPast ? ' checked' : ''}><span>Ne pas créer les échéances déjà passées</span></label>
          <h3>Obligations</h3>
          <div class="cal-obs">${OBLIGATIONS.map((ob) => {
            const n = clients.filter((c) => ob.applies(c)).length;
            return `<label class="check cal-ob"><input type="checkbox" data-cal="ob" value="${ob.id}"${cal.obligations.has(ob.id) ? ' checked' : ''}>
              <span><strong>${esc(ob.label)}</strong> <span class="badge">${n} dossier${n > 1 ? 's' : ''}</span>${res.byOb[ob.id] ? ` <span class="badge st-en_cours">+${res.byOb[ob.id]}</span>` : ''}<br><span class="muted small">${esc(ob.rule)}</span></span></label>`;
          }).join('')}</div>
          ${only ? '' : `
          <details class="cal-clients"><summary>Dossiers concernés : ${clients.length - cal.excluded.size} / ${clients.length} <span class="muted small">(décocher pour exclure)</span></summary>
            <div class="cal-list">${clients.map((c) => `<label class="check"><input type="checkbox" data-cal="client" value="${c.id}"${cal.excluded.has(c.id) ? '' : ' checked'}><span>${esc(c.code)} — ${esc(clientLabel(c))} <span class="muted small">${esc([c.forme, tvaShort(c.regimeTva), c.cloture].filter(Boolean).join(' · '))}</span></span></label>`).join('')}</div>
          </details>`}
          <div class="imp-summary ${res.items.length ? '' : 'warn'}">
            <strong>${res.items.length}</strong> échéance(s) à créer pour ${res.clients.size} dossier(s)${res.existing ? ` · ${res.existing} déjà présente(s)` : ''}${res.past ? ` · ${res.past} déjà passée(s), ignorée(s)` : ''}
          </div>
          <p class="muted small">Dates <strong>indicatives</strong>, calculées selon les règles générales et reportées au jour ouvré suivant. Vérifiez-les avec le calendrier fiscal officiel et la situation de chaque dossier. L'IS est présumé pour les SARL, SAS, SASU, SA, SELARL et SELAS dont le régime fiscal n'est pas renseigné.</p>
        </div>
        <footer class="modal-foot"><button type="button" class="btn" data-action="close-modal">Annuler</button><button class="btn primary" data-action="apply-cal"${res.items.length ? '' : ' disabled'}>Créer ${res.items.length} échéance(s)</button></footer>
      </div>`, true);
  }

  function onCalChange(t) {
    const cal = ui.cal;
    const k = t.dataset.cal;
    if (k === 'year') cal.year = Number(t.value) || cal.year;
    else if (k === 'resp') cal.resp = t.value;
    else if (k === 'skipPast') cal.skipPast = t.checked;
    else if (k === 'ob') t.checked ? cal.obligations.add(t.value) : cal.obligations.delete(t.value);
    else if (k === 'client') t.checked ? cal.excluded.delete(t.value) : cal.excluded.add(t.value);
    const body = $('#modal .modal-body');
    const scroll = body ? body.scrollTop : 0;
    const open = !!$('#modal details[open]');
    renderCalendar();
    if (open && $('#modal details')) $('#modal details').open = true;
    if ($('#modal .modal-body')) $('#modal .modal-body').scrollTop = scroll;
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
    return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
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
        return c && !c.archive && (!resp || m.responsable === resp || [c.responsable, c.collaborateur, c.superviseur].includes(resp));
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
    const resps = Array.from(new Set(s.collaborateurs.concat(data.clients.flatMap((c) => [c.responsable, c.collaborateur])).filter(Boolean))).sort();
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

  // ---------------------------------------------------------------------------
  // Aide
  // ---------------------------------------------------------------------------

  function viewAide() {
    const item = (title, html, open) => `<details class="card help"${open ? ' open' : ''}><summary><h2>${title}</h2></summary><div class="help-body">${html}</div></details>`;
    return `
      <div class="page-head"><h1>Aide</h1></div>
      ${item('Premiers pas', `<ol>
        <li><strong>Paramètres</strong> : renseignez le nom du cabinet, votre prénom, vos collaborateurs et votre signature.</li>
        <li><strong>Dossiers → Importer</strong> : importez votre tableau Excel de suivi (ou créez les dossiers un par un).</li>
        <li><strong>Calendrier fiscal</strong> : créez en un clic les échéances de l'année de tous vos dossiers.</li>
        <li><strong>Sauvegarde</strong> : activez la sauvegarde automatique (sur ordinateur) ou exportez une sauvegarde chiffrée chaque semaine.</li>
      </ol>`, true)}
      ${item('Au quotidien', `<ul>
        <li>Le <strong>tableau de bord</strong> liste ce qui est en retard, les échéances des 14 prochains jours, les clients à relancer et les missions à valider. Choisissez « Mes dossiers » pour ne voir que votre portefeuille.</li>
        <li>Cliquez sur une mission pour cocher ses étapes : elle passe « en cours » à la première étape cochée, et « terminée » à la dernière. Le bouton <strong>✓ Terminée</strong> valide tout d'un coup.</li>
        <li>Les missions récurrentes (TVA, paie, acomptes…) créent automatiquement l'occurrence suivante lorsqu'elles sont terminées.</li>
      </ul>`)}
      ${item('Suivi mensuel (grille)', `<ul>
        <li>Reproduit votre tableau Excel : un dossier par ligne, un mois par colonne. Filtrez par type de mission, régime de TVA (mensuel, trimestriel, CA12) et responsable.</li>
        <li><strong>Pointage rapide</strong> : un clic sur une case la passe à OK, un second clic annule, comme dans Excel.</li>
        <li><strong>Exporter en Excel</strong> produit un fichier réimportable (attention : non chiffré).</li>
      </ul>`)}
      ${item('Calendrier fiscal', `<p>Le bouton <strong>Calendrier fiscal</strong> (tableau de bord, missions, suivi mensuel ou fiche dossier) crée les échéances de l'année selon la forme, le régime de TVA, le régime fiscal et la date de clôture de chaque dossier : TVA, CA12 et acomptes, acomptes et solde d'IS, bilan et liasse, approbation des comptes, CFE. Les dates sont reportées au jour ouvré suivant.</p>
        <p class="muted">Les dates sont <strong>indicatives</strong> : vérifiez-les avec le calendrier fiscal officiel. Renseignez le régime fiscal des dossiers pour affiner (l'IS est présumé pour les SARL, SAS, SASU, SA, SELARL, SELAS).</p>`)}
      ${item('Relancer un client', `<ul>
        <li>Depuis une mission ou un dossier, <strong>Écrire au client</strong> prépare un message : demande de documents, relance ou envoi pour validation.</li>
        <li>La liste des documents reprend les étapes non cochées de la mission (« Pièces reçues », « Relevés bancaires reçus »…).</li>
        <li>« Copier le message » ou « Ouvrir dans ma messagerie » : l'envoi est noté dans le journal du dossier et la mission passe « en attente du client ».</li>
        <li>Sans réponse après le délai choisi dans les paramètres (7 jours par défaut), la mission apparaît dans <strong>À relancer</strong>.</li>
      </ul>`)}
      ${item('Rappels dans votre agenda', `<p>Paramètres → <strong>Échéances dans mon agenda</strong> : téléchargez un fichier .ics et ouvrez-le avec votre agenda pour être prévenu même application fermée. Par défaut, seuls les numéros de dossier apparaissent dans l'agenda.</p>`)}
      ${item('PC et téléphone', `<p>Chaque appareil possède son propre coffre chiffré ; il n'y a volontairement aucun serveur. Pour retrouver vos données sur un autre appareil : exportez une sauvegarde chiffrée, puis <strong>Restaurer une sauvegarde</strong> sur l'autre appareil avec le même mot de passe. La sauvegarde automatique placée dans un dossier synchronisé du cabinet facilite ce transfert.</p>`)}
      ${item('Sécurité et secret professionnel', `<ul>
        <li>Les données sont chiffrées (AES-256) et ne quittent jamais l'appareil. Aucun compte, aucun serveur, aucun traceur.</li>
        <li>Le <strong>mode discret</strong> (icône œil) remplace les noms par les numéros de dossier : utile en rendez-vous ou en déplacement.</li>
        <li>L'application se verrouille seule après quelques minutes d'inactivité. Sans le mot de passe, <strong>personne</strong> ne peut lire les données, pas même vous : notez-le en lieu sûr.</li>
        <li>Les exports Excel et CSV ne sont pas chiffrés : supprimez-les après usage.</li>
      </ul>`)}`;
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
            <label>Relancer un client sans réponse après (jours)<input type="number" name="relanceJours" min="1" max="60" value="${esc(s.relanceJours)}"></label>
            <label>Signature des messages<textarea name="signature" rows="3" placeholder="${esc([s.utilisateur, s.cabinet].filter(Boolean).join('\n') || 'Prénom Nom\nCabinet')}">${esc(s.signature)}</textarea></label>
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
    if (autoBackupTimer) await writeAutoBackup();
    await saving;
    Vault.lock();
    clearTimeout(autoBackupTimer);
    autoBackupHandle = null;
    ui.autoBackup = null;
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
    'open-cal': (el) => openCalendar(el.dataset.client),
    'open-msg': (el) => openMessage(el.dataset.client, el.dataset.mission),
    'msg-model': (el) => {
      ui.msg.modele = el.dataset.model;
      renderMessage();
    },
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
      data.settings.pointage = el.dataset.mode === 'pointage';
      persist();
      refresh();
    },
    'grille-toggle': (el) => {
      const m = missionById(el.dataset.id);
      if (!m) return;
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
      refresh();
      const again = $(`.grille td[data-id="${m.id}"]`);
      if (again) again.focus({ preventScroll: true });
    },
    'export-grille': () => exportGrille(),
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
    } else if (t.dataset.cal && ui.cal) {
      onCalChange(t);
    } else if (t.dataset.msg === 'mission' && ui.msg) {
      t.checked ? ui.msg.selected.add(t.value) : ui.msg.selected.delete(t.value);
      renderMessage();
    } else if (t.dataset.dash) {
      data.settings.dashResp = t.value;
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
      s.relanceJours = Math.max(1, Number(val(form, 'relanceJours')) || 7);
      s.signature = form.signature.value.trim();
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
