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
      etapes: ['Pièces reçues', 'Banque importée', 'Banque affectée', 'Saisie des ventes', 'Saisie des achats', 'Contrôle et calcul de la TVA', 'Validation', 'Télédéclaration', 'Télépaiement'],
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
    {
      id: 'saisie', nom: 'Saisie comptable', recurrence: 'mensuelle',
      etapes: ['Pièces reçues', 'Relevés bancaires reçus', 'Saisie', 'Rapprochement bancaire'],
    },
    {
      id: 'declaration', nom: 'Déclaration fiscale', recurrence: 'annuelle',
      etapes: ['Préparation', 'Contrôle', 'Dépôt / paiement'],
    },
    { id: 'libre', nom: 'Mission libre', recurrence: 'aucune', etapes: [] },
  ];
  // Version des modèles par défaut : les modèles ajoutés depuis sont proposés aux coffres existants.
  const TEMPLATES_VERSION = 3;

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
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
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

  // JJ/MM/AAAA à partir de AAAA-MM-JJ (plus rapide que toLocaleDateString sur de grands volumes).
  function fmtDate(s) {
    if (!s) return '—';
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : s;
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
  let saveQueued = false;

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
        piecesIgnore: ['RSM'], // fournisseurs dont on ne demande jamais les pièces (ex. le cabinet lui-même)
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
    // Saisie des ventes et saisie des achats suivies séparément (elles se font dans n'importe quel ordre).
    const SAISIE_VA = /^saisie\s+ventes\s*\/\s*achats$/i;
    d.templates.forEach((t) => {
      const i = (t.etapes || []).findIndex((e) => SAISIE_VA.test(String(e).trim()));
      if (i >= 0) t.etapes.splice(i, 1, 'Saisie des ventes', 'Saisie des achats');
    });
    d.missions.forEach((m) => {
      const i = m.etapes.findIndex((e) => SAISIE_VA.test(String(e.label || '').trim()));
      if (i < 0) return;
      const e = m.etapes[i];
      m.etapes.splice(i, 1, Object.assign({}, e, { id: uid(), label: 'Saisie des ventes' }), Object.assign({}, e, { id: uid(), label: 'Saisie des achats' }));
    });
    // Étapes bancaires (relevés importés, opérations affectées) ajoutées avant les saisies de la TVA.
    const hasBank = (labels) => labels.some((l) => /^banque\s+import/i.test(l));
    d.templates.forEach((t) => {
      if (t.id !== 'tva' || hasBank(t.etapes || [])) return;
      const i = t.etapes.findIndex((e) => /^saisie des ventes$/i.test(e));
      if (i >= 0) t.etapes.splice(i, 0, 'Banque importée', 'Banque affectée');
    });
    d.missions.forEach((m) => {
      if (m.type !== 'tva' || hasBank(m.etapes.map((e) => e.label || ''))) return;
      const i = m.etapes.findIndex((e) => /^saisie des ventes$/i.test(e.label || ''));
      if (i < 0) return;
      // Déjà faites si la mission est terminée ou si une étape après les saisies (contrôle…) est cochée.
      const after = m.etapes.slice(i).filter((e) => !/^saisie\b/i.test(e.label || ''));
      const done = m.statut === 'termine' || after.some((e) => e.done);
      const at = done ? (after.find((e) => e.done) || {}).doneAt || m.termineLe || null : null;
      m.etapes.splice(i, 0, { id: uid(), label: 'Banque importée', done, doneAt: at }, { id: uid(), label: 'Banque affectée', done, doneAt: at });
    });
    d.version = 1;
    return d;
  }

  // Enregistrement chiffré. Les modifications rapprochées (étapes cochées d'affilée…) sont regroupées :
  // une seule écriture couvre toutes celles faites pendant l'enregistrement précédent.
  function persist(opts) {
    data.updatedAt = nowIso();
    if (!saveQueued) {
      saveQueued = true;
      saving = saving
        .then(() => {
          saveQueued = false;
          return data ? Vault.save(data) : null;
        })
        .catch((err) => toast("Erreur d'enregistrement : " + err.message, true));
    }
    if (!(opts && opts.noAutoBackup)) scheduleAutoBackup();
    return saving;
  }

  // Index reconstruits quand la liste change (ajout, suppression, import, restauration).
  let clientIdx = null, clientIdxOf = null, clientIdxLen = -1;
  function clientById(id) {
    if (clientIdxOf !== data.clients || clientIdxLen !== data.clients.length) {
      clientIdx = new Map(data.clients.map((c) => [c.id, c]));
      clientIdxOf = data.clients;
      clientIdxLen = data.clients.length;
    }
    return clientIdx.get(id);
  }
  // Index des missions par dossier : complété au fil des ajouts, reconstruit si la liste est remplacée.
  let missionIdx = null, missionIdxOf = null, missionIdxLen = -1;
  const resetMissionIdx = () => { missionIdxOf = null; };
  function missionsOf(clientId) {
    const list = data.missions;
    if (missionIdxOf !== list || list.length < missionIdxLen) {
      missionIdx = new Map();
      missionIdxLen = 0;
      missionIdxOf = list;
    }
    for (let i = missionIdxLen; i < list.length; i++) {
      const m = list[i];
      if (!missionIdx.has(m.clientId)) missionIdx.set(m.clientId, []);
      missionIdx.get(m.clientId).push(m);
    }
    missionIdxLen = list.length;
    return missionIdx.get(clientId) || [];
  }
  const missionById = (id) => data.missions.find((m) => m.id === id);
  // Dossier d'un SIREN (nom du FEC), de préférence parmi les dossiers actifs.
  function clientBySiren(siren) {
    if (!siren) return null;
    const list = data.clients.filter((c) => (c.siren || '').replace(/\s/g, '').slice(0, 9) === siren);
    return list.find((c) => !c.archive) || list[0] || null;
  }
  const templateById = (id) => data.templates.find((t) => t.id === id);
  const isOpen = (m) => m.statut !== 'termine';
  const isLate = (m) => isOpen(m) && !!m.echeance && daysUntil(m.echeance) < 0;
  const byDue = (a, b) => (a.echeance || '9999').localeCompare(b.echeance || '9999');

  function progress(m) {
    if (m.statut === 'termine') return 100;
    if (!m.etapes.length) return 0;
    return Math.round((m.etapes.filter((e) => e.done).length * 100) / m.etapes.length);
  }

  // Portefeuille d'un intervenant : dossiers dont il est responsable, collaborateur ou superviseur, et missions dont il a la charge.
  const inPortfolio = (c, r) => !r || [c.responsable, c.collaborateur, c.superviseur].includes(r);
  function missionInPortfolio(m, r) {
    if (!r || m.responsable === r) return true;
    const c = clientById(m.clientId);
    return !!c && inPortfolio(c, r);
  }
  // Intervenants connus : collaborateurs déclarés, intervenants des dossiers et responsables des missions.
  function allResps() {
    const set = new Set(data.settings.collaborateurs);
    data.clients.forEach((c) => [c.responsable, c.collaborateur, c.superviseur].forEach((x) => x && set.add(x)));
    data.missions.forEach((m) => m.responsable && set.add(m.responsable));
    set.delete('');
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
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
      if (m.demandePieces) piecesReceived(m);
    } else if (prev === 'termine') {
      m.termineLe = null;
      log(m.clientId, `Mission « ${m.titre} » rouverte.`, true);
    }
  }

  // Coche l'étape d'une mission du dossier quand le travail correspondant est fait ailleurs dans l'application
  // (demande de pièces soldée, révision signée). `periods` : exercices acceptés (« 2025 », « 08/2025 », '' pour une mission sans période).
  function autoStep(clientId, types, periods, re, why) {
    const m = missionsOf(clientId).find((x) => isOpen(x) && types.includes(x.type) && periods.includes(x.exercice || '') && x.etapes.some((e) => !e.done && re.test(e.label)));
    if (!m) return '';
    const e = m.etapes.find((x) => !x.done && re.test(x.label));
    Object.assign(e, { done: true, doneAt: nowIso(), auto: why });
    m.updatedAt = nowIso();
    if (m.etapes.every((x) => x.done)) setStatus(m, 'termine');
    else if (m.statut === 'a_faire') setStatus(m, 'en_cours');
    log(clientId, `Étape « ${e.label} » de « ${m.titre} » cochée automatiquement : ${why}.`, true);
    return `${m.titre} : « ${e.label} » cochée`;
  }

  // Demande de pièces entièrement reçue : étape « Pièces reçues » de la mission du mois (TVA, saisie), de la situation ou du bilan.
  function piecesReceived(m) {
    const dp = m.demandePieces;
    const year = (dp.arrete || '').slice(0, 4);
    const why = `toutes les pièces de « ${m.titre} » sont reçues`;
    let done = '';
    if (dp.mode === 'mois') done = autoStep(m.clientId, ['tva', 'saisie'], [`${dp.arrete.slice(5, 7)}/${year}`], /^pi[eè]ces/i, why);
    else if (dp.mode === 'situation') done = autoStep(m.clientId, ['situation'], [year, ''], /^pi[eè]ces/i, why);
    else done = autoStep(m.clientId, ['bilan'], [year], /^pi[eè]ces/i, why);
    if (done) toast(`Pièces reçues — ${done}.`);
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
    if (missionsOf(m.clientId).some((x) => x.id !== m.id && x.titre === next.titre)) return;
    data.missions.push(next);
    toast(`Occurrence suivante créée${next.echeance ? ' — échéance ' + fmtDate(next.echeance) : ''}.`);
  }

  function toggleStep(m, stepId, done) {
    const step = m.etapes.find((e) => e.id === stepId);
    if (!step) return;
    step.done = done;
    step.doneAt = done ? nowIso() : null;
    delete step.auto;
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

  const fecHref = () => (data && data.settings.fecProfile === 'pharmacie' ? '#/fec/pharma' : '#/fec');

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
    fecProfile: 'classique',
    fecStates: { classique: null, pharmacie: null },
  };
  // ui.fec désigne l'analyse de l'analyseur affiché (classique ou pharmacie).
  Object.defineProperty(ui, 'fec', {
    get() { return this.fecStates[this.fecProfile]; },
    set(v) { this.fecStates[this.fecProfile] = v; },
  });

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
      case 'fec':
        if (parts[1] === 'lot') {
          main.innerHTML = viewBatch();
          break;
        }
        ui.fecProfile = parts[1] === 'pharma' ? 'pharmacie' : 'classique';
        if (data.settings.fecProfile !== ui.fecProfile) {
          data.settings.fecProfile = ui.fecProfile;
          const link = $('a[data-nav="fec"]');
          if (link) link.setAttribute('href', fecHref());
        }
        main.innerHTML = viewFec();
        break;
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
    const inScope = (m) => {
      const c = clientById(m.clientId);
      return c && !c.archive && missionInPortfolio(m, r);
    };
    const active = data.clients.filter((c) => !c.archive && inPortfolio(c, r));
    const open = data.missions.filter((m) => isOpen(m) && inScope(m));
    const late = open.filter(isLate).sort(byDue);
    const soon = open.filter((m) => m.echeance && daysUntil(m.echeance) >= 0 && daysUntil(m.echeance) <= 14).sort(byDue);
    const wait = open.filter((m) => m.statut === 'attente_client').sort(byDue);
    const relances = wait.filter(relanceDue);
    const review = open.filter((m) => m.statut === 'a_valider').sort(byDue);
    const compliance = active.map((c) => ({ c, issues: complianceIssues(c) })).filter((x) => x.issues.length);
    const resps = allResps();

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
          const open = missionsOf(c.id).filter(isOpen);
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
      const ms = missionsOf(c.id);
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
    const ms = missionsOf(c.id);
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
          ${c.fec && c.fec.length ? `<section class="card"><h2>Analyses FEC</h2>
            <ul class="fec-hist">${c.fec.slice().reverse().map((x) => `<li>
              <div><strong>${x.closing ? 'Clôture ' + fmtDate(x.closing) : esc(x.fileName)}</strong> <span class="muted small">analysé le ${fmtDate(x.date.slice(0, 10))}</span></div>
              <div class="small">${x.errors ? `<span class="lvl lvl-error"><b aria-hidden="true">✕</b>${x.errors} anomalie(s)</span>` : '<span class="lvl lvl-ok"><b aria-hidden="true">✓</b>Aucune anomalie</span>'} ${x.warnings ? `<span class="lvl lvl-warn"><b aria-hidden="true">!</b>${x.warnings} à vérifier</span>` : ''}</div>
              <div class="muted small">CA ${eur(x.kpi.ca, 0)} € · Résultat ${eur(x.kpi.resultat, 0)} € · EBE ${eur(x.kpi.ebe, 0)} € · Trésorerie ${eur(x.kpi.tresorerie, 0)} €</div>
            </li>`).join('')}</ul>
            <a class="btn small" href="${c.fec[c.fec.length - 1].profil === 'pharmacie' ? '#/fec/pharma' : '#/fec'}">Nouvelle analyse</a></section>` : ''}
          ${c.revisionMemo && Object.keys(c.revisionMemo).length ? `<section class="card"><h2>Mémoire de révision <span class="count">${Object.keys(c.revisionMemo).length}</span></h2>
            <p class="muted small">Éléments justifiés lors d'une revue, qui ne sont plus signalés par l'analyse FEC de ce dossier.</p>
            <ul class="memo-list">${Object.entries(c.revisionMemo).map(([k, m]) => `<li><div><strong>${discret ? hidden : esc(m.label)}</strong>${m.note ? `<div class="muted small">${discret ? '' : esc(m.note)}</div>` : ''}<div class="muted small">${esc(m.by || '')} ${m.at ? fmtDate(m.at.slice(0, 10)) : ''}</div></div>
              <button class="link-btn danger" data-action="memo-del" data-id="${c.id}" data-k="${esc(k)}">Signaler à nouveau</button></li>`).join('')}</ul></section>` : ''}
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
    const resps = allResps();
    return `
      <div class="page-head"><h1>Missions</h1>
        <div class="head-actions"><button class="btn" data-action="open-cal">${icon('calendar')}Calendrier fiscal</button><button class="btn primary" data-action="new-mission">${icon('plus')}Nouvelle mission</button></div>
      </div>
      <div class="filters">
        <input type="search" placeholder="Rechercher…" data-filter="mf.q" value="${esc(f.q)}" spellcheck="false" autocomplete="off">
        <select data-filter="mf.statut" aria-label="Statut">${options(Object.assign({ ouvertes: 'Non terminées', toutes: 'Tous statuts' }, STATUTS), f.statut)}</select>
        <select data-filter="mf.periode" aria-label="Échéance">${options({ toutes: 'Toutes échéances', retard: 'En retard', '7': '7 prochains jours', '30': '30 prochains jours', mois: 'Ce mois-ci' }, f.periode)}</select>
        <select data-filter="mf.type" aria-label="Type">${options(Object.fromEntries(data.templates.map((t) => [t.id, t.nom])), f.type, 'Tous types')}</select>
        <select data-filter="mf.resp" aria-label="Portefeuille">${options(resps, f.resp, 'Tous les portefeuilles')}</select>
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
      if (f.resp && !missionInPortfolio(m, f.resp)) return false;
      if (f.periode === 'retard' && !isLate(m)) return false;
      if ((f.periode === '7' || f.periode === '30') && !(m.echeance && daysUntil(m.echeance) >= 0 && daysUntil(m.echeance) <= Number(f.periode))) return false;
      if (f.periode === 'mois' && !(m.echeance || '').startsWith(month)) return false;
      if (q && !norm([m.titre, m.exercice, clientLabel(c), c.code, m.responsable].join(' ')).includes(q)) return false;
      return true;
    }).sort(byDue);
    const limit = ui.mfLimit || 300;
    el.innerHTML = list.length
      ? `<p class="muted small">${list.length} mission${list.length > 1 ? 's' : ''}</p><div class="mlist card flush">${list.slice(0, limit).map((m) => missionRow(m, true)).join('')}</div>
        ${list.length > limit ? `<button class="btn block more-btn" data-action="missions-more">Afficher ${Math.min(300, list.length - limit)} mission(s) de plus (${list.length - limit} restante(s))</button>` : ''}`
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
              <span>${esc(e.label)}${e.done && e.doneAt ? `<small class="muted"> — ${fmtDateTime(e.doneAt)}${e.auto ? ` · automatique (${esc(e.auto)})` : ''}</small>` : ''}</span></label></li>`).join('')}</ul>`
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
      .filter((c) => inPortfolio(c, g.resp));
    const counts = base.reduce((acc, c) => {
      acc[regimeGroup(c)] = (acc[regimeGroup(c)] || 0) + 1;
      return acc;
    }, {});
    const regimeOptions = Object.fromEntries(Object.entries(REGIME_FILTRES)
      .filter(([k]) => !k || counts[k] || k === g.regime)
      .map(([k, l]) => [k, `${l} (${k ? counts[k] || 0 : base.length})`]));
    const sort = grilleSort();
    const clients = base
      .filter((c) => !g.regime || regimeGroup(c) === g.regime)
      .sort((a, b) => sort.dir * grilleCompare(sort.key, a, b, grid) || (a.code || '').localeCompare(b.code || '', 'fr', { numeric: true }) || a.nom.localeCompare(b.nom, 'fr'));
    const resps = allResps();
    // Colonne « Année » affichée seulement s'il existe des missions annuelles (ex. CA12 « 2026 »).
    const cols = clients.some((c) => grid.get(c.id)[13]) ? 13 : 12;
    return { g, year, grid, years, base, clients, resps, regimeOptions, cols, sort };
  }

  const GRILLE_TRIS = { code: 'N° de dossier', nom: 'Nom du dossier', tva: 'Régime de TVA', jour: 'Jour de dépôt TVA', cloture: 'Date de clôture', resp: 'Responsable', retard: 'Retards et avancement' };
  const grilleSort = () => Object.assign({ key: 'code', dir: 1 }, data.settings.grilleSort || {});
  const TVA_ORDRE = { M: 1, T: 2, A: 3 };

  // Comparaison de deux dossiers selon la colonne de tri choisie (sens croissant).
  function grilleCompare(key, a, b, grid) {
    const str = (x, y) => (x || '').localeCompare(y || '', 'fr', { numeric: true, sensitivity: 'base' });
    const num = (x, y) => (x === y ? 0 : x === null ? 1 : y === null ? -1 : x - y);
    if (key === 'nom') return str(clientLabel(a), clientLabel(b));
    if (key === 'tva') return num(TVA_ORDRE[tvaShort(a.regimeTva)] || 9, TVA_ORDRE[tvaShort(b.regimeTva)] || 9);
    if (key === 'jour') return num(a.jourTva ? Number(a.jourTva) : null, b.jourTva ? Number(b.jourTva) : null);
    if (key === 'cloture') {
      const v = (c) => { const m = (c.cloture || '').match(/^(\d{2})\/(\d{2})$/); return m ? Number(m[2]) * 100 + Number(m[1]) : null; };
      return num(v(a), v(b));
    }
    if (key === 'resp') return str(a.responsable || a.collaborateur, b.responsable || b.collaborateur);
    if (key === 'retard') {
      // Dossiers les plus en retard d'abord, puis ceux qui ont le moins avancé.
      const score = (c) => Object.values(grid.get(c.id) || {}).reduce((t, m) => t + (isOpen(m) ? (isLate(m) ? 1000 : 0) + (100 - progress(m)) : 0), 0);
      return score(b) - score(a);
    }
    return str(a.code, b.code);
  }

  // Libellé court d'une étape, affiché dans la case (« Saisie », « Contrôle », « Télédécl. »).
  function stepShort(label) {
    const bq = String(label || '').match(/^banque\s+(\S+)/i);
    if (bq) return 'Bq ' + bq[1].replace(/ée?s?$/i, '').slice(0, 6);
    const sv = String(label || '').match(/^saisie\s+(?:des?\s+|du\s+|de\s+la\s+)?(\S+)/i);
    if (sv && !/^[/(]/.test(sv[1])) { const w2 = sv[1].charAt(0).toUpperCase() + sv[1].slice(1); return w2.length > 9 ? w2.slice(0, 8) + '.' : w2; }
    const w = String(label || '').replace(/^(la|le|les|l'|de|des|du)\s+/i, '').split(/[\s/(,–-]+/)[0] || String(label || '');
    return w.length > 10 ? w.slice(0, 9) + '.' : w;
  }
  const lastDoneIndex = (m) => m.etapes.reduce((k, e, i) => (e.done ? i : k), -1);

  // Étapes faisables dans n'importe quel ordre : saisies consécutives (ventes, achats…). Renvoie [début, fin] du groupe.
  function stepGroup(etapes, i) {
    const isS = (k) => k >= 0 && k < etapes.length && /^(saisie|banque)\b/i.test(etapes[k].label || '');
    if (!isS(i)) return [i, i];
    let a = i, b = i;
    while (isS(a - 1)) a--;
    while (isS(b + 1)) b++;
    return [a, b];
  }
  // Dans un groupe, une étape dépend des précédentes de même premier mot (« Banque affectée » suppose « Banque importée ») ;
  // les saisies (ventes, achats) restent indépendantes entre elles.
  const firstWord = (e) => norm(e.label || '').split(/\s+/)[0];
  const sameKind = (etapes, j, i) => firstWord(etapes[i]) !== 'saisie' && firstWord(etapes[j]) === firstWord(etapes[i]);

  // Libellé de l'étape atteinte : « Saisie » quand tout le groupe (banque, ventes, achats) est fait,
  // sinon la dernière étape du groupe cochée (dans l'ordre où elles ont été faites).
  function stepReached(m) {
    const last = lastDoneIndex(m);
    if (last < 0) return '';
    const [a, b] = stepGroup(m.etapes, last);
    if (a === b) return stepShort(m.etapes[last].label);
    const grp = m.etapes.slice(a, b + 1);
    if (grp.every((e) => e.done)) return 'Saisie';
    // Faite le plus récemment ; à égalité (cochées du même clic), la plus avancée dans la liste.
    const recent = grp.map((e, k) => [e, k]).filter(([e]) => e.done).sort((x, y) => (y[0].doneAt || '').localeCompare(x[0].doneAt || '') || y[1] - x[1])[0][0];
    return stepShort(recent.label);
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

  // Case de la grille : OK, ou l'étape atteinte (« Saisie 2/6 »), avec la liste des étapes en info-bulle.
  function grilleCellView(m, mode) {
    let cls = 'g-todo', html = '·';
    const n = m.etapes.length;
    const done = m.etapes.filter((e) => e.done).length;
    if (!isOpen(m)) { cls = 'g-ok'; html = 'OK'; }
    else {
      cls = isLate(m) ? 'g-late' : m.statut === 'attente_client' ? 'g-wait' : done || m.statut !== 'a_faire' ? 'g-progress' : 'g-todo';
      if (done && n) html = `<span class="g-step">${esc(stepReached(m))}</span><span class="g-frac">${done}/${n}</span>`;
      else html = isLate(m) ? '!' : m.statut === 'attente_client' ? 'Att.' : m.statut !== 'a_faire' ? 'En cours' : '·';
    }
    const hint = mode === 'pointage' ? `Cliquer pour ${isOpen(m) ? 'pointer OK' : 'annuler'}` : mode === 'etapes' ? 'Cliquer pour choisir l\'étape atteinte' : 'Cliquer pour ouvrir la mission';
    const title = [`${m.titre} — ${STATUTS[m.statut]}${m.echeance ? ' — échéance ' + fmtDate(m.echeance) : ''}`]
      .concat(m.etapes.map((e) => `${e.done ? '✓' : '○'} ${e.label}`), [hint]).join('\n');
    return { cls, html, title };
  }
  const grilleMode = () => data.settings.grilleMode || (data.settings.pointage ? 'pointage' : 'etapes');
  const GRILLE_ACTIONS = { etapes: 'grille-steps', pointage: 'grille-toggle', fiche: 'open-mission' };

  // Pointage : mise à jour de la seule case et du total de sa colonne, sans redessiner la grille.
  function updateGrilleCell(m) {
    const td = $(`.grille td[data-id="${m.id}"]`);
    if (!td) return refresh();
    const v = grilleCellView(m, grilleMode());
    td.className = v.cls;
    td.innerHTML = v.html;
    td.title = v.title;
    const col = td.dataset.col;
    const cells = $$(`.grille tbody td[data-col="${col}"]`);
    const foot = $$('.grille tfoot td')[Number(col) + 2];
    if (foot) foot.textContent = `${cells.filter((c) => c.classList.contains('g-ok')).length}/${cells.length}`;
  }

  // Choix de l'étape atteinte, sous la case cliquée.
  function closeGrillePop() {
    const pop = $('#grille-pop');
    if (pop) pop.remove();
  }

  function openGrillePop(td, m, focusI) {
    closeGrillePop();
    if (!m) return;
    const c = clientById(m.clientId);
    const k = lastDoneIndex(m) + 1;
    const pop = document.createElement('div');
    pop.id = 'grille-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', `Étapes — ${m.titre}`);
    pop.dataset.id = m.id;
    const n = m.etapes.length, nd = m.etapes.filter((e) => e.done).length;
    // Demande de pièces du même mois en cours (issue de l'analyse FEC mensuelle).
    const per = (m.exercice || '').match(/^(\d{2})\/(\d{4})$/);
    const req = per && missionsOf(m.clientId).find((x) => isOpen(x) && x.demandePieces && x.demandePieces.mode === 'mois' && x.demandePieces.arrete.slice(0, 7) === `${per[2]}-${per[1]}`);
    const reqLeft = req ? req.etapes.filter((e) => !e.done).length : 0;
    pop.innerHTML = `<div class="gp-head"><div><strong>${esc(c ? clientLabel(c) : '')}</strong><span class="muted small">${esc(m.titre)}${m.echeance ? ` · échéance ${fmtDate(m.echeance)}` : ''}</span>
        <span class="gp-state ${isOpen(m) ? '' : 'ok'}">${isOpen(m) ? `${nd} / ${n} étape(s) faite(s)` : 'Terminée'}</span></div>
        <button class="icon-btn gp-close" data-action="grille-pop-close" title="Fermer (Échap)" aria-label="Fermer">✕</button></div>
      ${m.etapes.length ? `<ol class="gp-steps">${m.etapes.map((e, i) => { const [ga, gb] = stepGroup(m.etapes, i); return `<li class="${ga !== gb ? 'gp-par' : ''}"><button class="${e.done ? 'done' : ''}${i + 1 === k ? ' current' : ''}" data-action="grille-step" data-id="${m.id}" data-i="${i}" aria-pressed="${e.done}"><span aria-hidden="true">${e.done ? '✓' : i + 1}</span>${esc(e.label)}</button></li>`; }).join('')}</ol>
        <p class="muted small">Un clic coche l'étape et celles qui la précèdent ; un second clic la décoche. Banque, ventes et achats (repère bleu) se cochent indépendamment, dans l'ordre où vous les faites ; « Banque affectée » coche aussi « Banque importée ». La dernière étape termine la mission. La fenêtre reste ouverte : fermez-la avec ✕, Échap ou un clic à côté.</p>`
        : `<div class="gp-foot"><button class="btn small primary" data-action="grille-step" data-id="${m.id}" data-i="all">Marquer terminée</button></div>`}
      ${req ? `<p class="gp-req small">Demande de pièces en cours : <strong>${reqLeft} pièce(s) attendue(s)</strong>${lastRelance(req) ? `, demandée(s) le ${fmtDate(lastRelance(req).slice(0, 10))}` : ''}. <button class="link-btn" data-action="open-mission" data-id="${req.id}">Voir la demande</button></p>` : ''}
      <div class="gp-foot">
        <button class="btn small" data-action="grille-step" data-id="${m.id}" data-i="-1">Remettre à faire</button>
        <button class="btn small" data-action="open-mission" data-id="${m.id}">Ouvrir la mission</button>
      </div>`;
    document.body.appendChild(pop);
    const r = td.getBoundingClientRect();
    const w = pop.offsetWidth;
    pop.style.left = Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - w - 8)) + 'px';
    const below = r.bottom + pop.offsetHeight + 8 <= window.innerHeight;
    pop.style.top = (below ? r.bottom + window.scrollY + 4 : Math.max(window.scrollY + 8, r.top + window.scrollY - pop.offsetHeight - 4)) + 'px';
    const first = (focusI !== undefined && $(`.gp-steps button[data-i="${focusI}"]`, pop)) || $('.gp-steps button.current', pop) || $('.gp-steps button', pop) || $('button', pop);
    if (first) first.focus();
  }

  // Clic sur l'étape i : cochée avec les étapes qui la précèdent (hors saisies parallèles), ou décochée avec celles qui suivent.
  // i = -1 : tout décocher ; i = 'all' : mission sans étapes à terminer. Statut ajusté (à faire, en cours, terminée).
  function setGrilleStep(m, i) {
    if (!m) return;
    const et = m.etapes;
    const count = data.missions.length;
    const check = (e) => { if (!e.done) Object.assign(e, { done: true, doneAt: nowIso() }); };
    const uncheck = (e) => { if (e.done) { Object.assign(e, { done: false, doneAt: null }); delete e.auto; } };
    let msg;
    if (i === -1) { et.forEach(uncheck); msg = 'à faire'; }
    else if (i === 'all' || !et[i]) { et.forEach(check); msg = 'terminée'; }
    else {
      const [ga, gb] = stepGroup(et, i);
      const before = (j) => j < ga || (j >= ga && j < i && sameKind(et, j, i)); // prérequis de l'étape i
      const after = (j) => j > gb || (j > i && j <= gb && sameKind(et, j, i)); // étapes qui dépendent de l'étape i
      if (!isOpen(m)) {
        // Mission terminée : on revient à l'étape choisie (elle et ses prérequis restent cochés, le reste est décoché).
        et.forEach((e, j) => (j === i || before(j) ? check(e) : uncheck(e)));
        msg = `revenue à « ${et[i].label} »`;
      } else if (et[i].done) {
        et.forEach((e, j) => { if (j === i || after(j)) uncheck(e); });
        msg = `${et[i].label} décochée`;
      } else {
        et.forEach((e, j) => { if (j === i || before(j)) check(e); });
        msg = `${et[i].label} faite`;
      }
    }
    const done = et.filter((e) => e.done).length;
    const target = (et.length ? done === et.length : i === 'all') ? 'termine' : done === 0 ? 'a_faire' : 'en_cours';
    setStatus(m, target);
    m.updatedAt = nowIso();
    persist();
    const c = clientById(m.clientId);
    toast(`${clientLabel(c)} — ${m.titre} : ${target === 'termine' ? 'terminée' : `${msg}${et.length ? ` (${done}/${et.length})` : ''}`}`);
    if (data.missions.length !== count) refresh();
    else updateGrilleCell(m);
    // Fenêtre conservée, mise à jour sur la case (redessinée si la grille a changé).
    const td = $(`.grille td[data-id="${m.id}"]`);
    if (td) openGrillePop(td, m, i === 'all' ? undefined : i);
    else closeGrillePop();
  }

  function viewGrille() {
    const { g, year, grid, years, base, clients, resps, regimeOptions, cols, sort } = grilleModel();
    const mode = grilleMode();
    const totals = Array.from({ length: cols }, () => ({ done: 0, all: 0 }));

    const cell = (m, col) => {
      if (!m) return '<td class="g-none"></td>';
      totals[col - 1].all++;
      if (!isOpen(m)) totals[col - 1].done++;
      const v = grilleCellView(m, mode);
      return `<td class="${v.cls}" data-action="${GRILLE_ACTIONS[mode]}" data-id="${m.id}" data-col="${col}" role="button" tabindex="0" title="${esc(v.title)}">${v.html}</td>`;
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
        <select data-grille="resp" aria-label="Portefeuille">${options(resps, g.resp, 'Tous les portefeuilles')}</select>
        <label class="inline-label">Trier par <select data-grille-sort aria-label="Trier les dossiers">${options(GRILLE_TRIS, sort.key)}</select></label>
        <button class="btn small" data-action="grille-sort" data-key="${sort.key}" title="Inverser l'ordre">${sort.dir > 0 ? '↑ Croissant' : '↓ Décroissant'}</button>
        <div class="seg" role="group" aria-label="Mode de clic">
          <button class="${mode === 'etapes' ? 'on' : ''}" data-action="grille-mode" data-mode="etapes" title="Un clic affiche les étapes : choisissez celle qui est atteinte">Étapes</button>
          <button class="${mode === 'pointage' ? 'on' : ''}" data-action="grille-mode" data-mode="pointage" title="Un clic pointe la case OK">Pointage rapide</button>
          <button class="${mode === 'fiche' ? 'on' : ''}" data-action="grille-mode" data-mode="fiche" title="Un clic ouvre la mission">Ouvrir</button>
        </div>
        <span class="legend"><span class="g-ok">OK</span> terminée <span class="g-progress g-leg"><span class="g-step">Ventes</span><span class="g-frac">4/9</span></span> étape atteinte <span class="g-late">!</span> en retard <span class="g-wait">Att.</span> attente client <span class="g-todo">·</span> à faire</span>
      </div>
      ${clients.length ? `
      <div class="grid-wrap card flush">
        <table class="grille">
          <thead><tr>${[['code', 'N°', '', 'N° de dossier'], ['nom', 'Dossier', 'g-name', 'Nom du dossier'], ['tva', 'TVA', '', 'Régime de TVA'], ['jour', 'Jour', '', 'Jour limite de dépôt']].map(([k, l, cls, t]) => `<th class="${cls} g-sort${sort.key === k ? ' on' : ''}" data-action="grille-sort" data-key="${k}" role="button" tabindex="0" title="Trier par ${t.toLowerCase()}" aria-sort="${sort.key === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}">${l}${sort.key === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}${MOIS_COURTS.map((m) => `<th>${m}</th>`).join('')}${cols === 13 ? '<th title="Déclaration annuelle de l\'exercice">Année</th>' : ''}</tr></thead>
          <tbody>${body}</tbody>
          <tfoot><tr><td class="g-code"></td><th class="g-name">Terminées</th><td class="g-meta"></td><td class="g-meta"></td>${totals.map((t) => `<td>${t.all ? `${t.done}/${t.all}` : ''}</td>`).join('')}</tr></tfoot>
        </table>
      </div>
      <p class="muted small">${clients.length} dossier${clients.length > 1 ? 's' : ''}, triés par ${esc(GRILLE_TRIS[sort.key].toLowerCase())}${sort.dir > 0 ? '' : ' (ordre inverse)'} — cliquez sur un titre de colonne pour trier. ${mode === 'pointage' ? '<strong>Pointage rapide :</strong> un clic sur une case la passe à OK, un second clic annule.' : mode === 'etapes' ? '<strong>Étapes :</strong> un clic sur une case affiche les étapes de la mission ; cochez celle qui est faite (les précédentes le sont aussi ; banque importée, banque affectée, saisie des ventes et saisie des achats se cochent séparément ; la dernière étape termine la mission).' : 'Cliquez sur une case pour ouvrir la mission.'} Les missions mensuelles (« MM/AAAA »), trimestrielles (« T1 AAAA ») et annuelles (« AAAA ») de l'année choisie apparaissent ici.</p>`
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
    if (m.demandePieces) return m.etapes.filter((e) => !e.done).map((e) => e.label);
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
    const demande = missions.find((m) => m.demandePieces);
    if (demande) return buildPiecesMessage(c, demande, modele, salut, signature);
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

  // Message d'une demande de pièces issue du FEC : éléments non encore reçus, groupés par catégorie.
  function buildPiecesMessage(c, m, modele, salut, signature) {
    const objet = m.demandePieces.mode === 'mois' ? `la comptabilité de ${moisNom(m.demandePieces.arrete)}` : `${m.demandePieces.mode === 'bilan' ? 'votre bilan' : 'votre situation'} au ${fmtDate(m.demandePieces.arrete)}`;
    const groups = {};
    m.etapes.filter((e) => !e.done).forEach((e) => (groups[e.cat || 'Autres'] = groups[e.cat || 'Autres'] || []).push(e.label));
    const list = Object.entries(groups).map(([cat, l]) => `${cat} :\n${l.map((x) => `- ${x}`).join('\n')}`).join('\n\n');
    const limit = m.echeance && m.echeance > todayStr() ? fmtDate(m.echeance) : null;
    const last = lastRelance(m);
    const body = modele === 'relance'
      ? [salut, '', `Sauf erreur de notre part, il nous manque encore les éléments suivants${last ? `, demandés le ${fmtDate(last.slice(0, 10))},` : ''} pour établir ${objet} :`, '', list, '',
        'Merci de nous les transmettre dans les meilleurs délais afin que nous puissions finaliser nos travaux.', '', 'Cordialement,', signature]
      : [salut, '', `Afin d'établir ${objet}, nous avons besoin des éléments suivants :`, '', list, '',
        limit ? `Nous vous remercions de nous les transmettre avant le ${limit}. Vous pouvez nous les envoyer au fur et à mesure.` : 'Nous vous remercions de nous les transmettre dès que possible.',
        '', 'Pour les questions, une réponse rapide par retour de mail nous suffit.', '', 'Nous restons à votre disposition.', '', 'Cordialement,', signature];
    return {
      subject: `${c.nom} — ${modele === 'relance' ? 'relance : ' : ''}pièces nécessaires pour ${objet}`,
      body: body.join('\n'),
    };
  }

  function openMessage(clientId, missionId) {
    const c = clientById(clientId);
    if (!c) return;
    const open = missionsOf(c.id).filter(isOpen).sort(byDue);
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
    const open = missionsOf(c.id).filter(isOpen).sort(byDue);
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
      .filter((c) => inPortfolio(c, cal.resp))
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
          if (missionsOf(c.id).some((m) => m.titre === p.titre)) { res.existing++; return; }
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
      resp: data.settings.dashResp || '',
      excluded: new Set(),
      only: onlyClient || '',
    };
    renderCalendar();
  }

  function renderCalendar() {
    const cal = ui.cal;
    const res = calPlan();
    const clients = calClients();
    const resps = allResps();
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

  // ---------------------------------------------------------------------------
  // Analyse de FEC
  // ---------------------------------------------------------------------------

  const ASSET_VERSION = '23';
  let fecWorker = null;

  const eur = (n, dec) => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: dec === 0 ? 0 : 2, maximumFractionDigits: dec === 0 ? 0 : 2 });
  const eurK = (n) => {
    const a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M€';
    if (a >= 1e3) return (n / 1e3).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' k€';
    return eur(n, 0) + ' €';
  };
  const LEVEL = {
    ok: { icon: '✓', label: 'Conforme' },
    info: { icon: 'i', label: 'Information' },
    warn: { icon: '!', label: 'À vérifier' },
    error: { icon: '✕', label: 'Anomalie' },
  };

  // Libellé « problème » de chaque contrôle, utilisé pour les étapes de la mission de revue.
  const FEC_FAIL = {
    nom: 'Nom de fichier non conforme', sep: 'Séparateur non conforme', cols: 'Colonnes non conformes',
    equil: 'Écritures déséquilibrées', balance: 'Balance générale déséquilibrée', nbcol: 'Lignes au nombre de zones incorrect',
    oblig: 'Zones obligatoires non renseignées', date: 'Dates invalides', datefmt: 'Dates hors format AAAAMMJJ',
    montant: 'Montants non numériques', numdate: 'Écritures portant plusieurs dates', apresclo: 'Écritures postérieures à la clôture',
    avantex: "Écritures antérieures au début de l'exercice", chrono: 'Numérotation non chronologique', compte: 'Numéros de compte non conformes',
    classe: 'Comptes hors classes 1 à 7', libcompte: 'Libellés de compte multiples', aux: 'Comptes auxiliaires incomplets',
    lettrage: 'Lettrage incomplet', devise: 'Devise incomplète', negatif: 'Montants négatifs', debcred: 'Lignes au débit et au crédit',
  };

  // Points de révision du profil affiché (officine : alertes adaptées + contrôles spécifiques).
  function fecPoints(r) {
    return ui.fecProfile === 'pharmacie' ? fecAlerts(r).concat(pharmaChecks(r).filter((x) => x.level !== 'ok')) : r.alerts;
  }

  // Points généraux après application de la mémoire du dossier (éléments déjà justifiés).
  const genPoints = (r) => applyMemo(fecPoints(r), 'gen');

  function fecCounts(r) {
    const all = r.checks.concat(genPoints(r), cyclePoints(r));
    return { errors: all.filter((c) => c.level === 'error').length, warnings: all.filter((c) => c.level === 'warn').length };
  }

  // Analyse d'un FEC : principal (target 'main') ou exercice précédent pour la revue analytique ('prev').
  // Chaque analyseur (classique, pharmacie) garde son propre état : le résultat revient toujours à l'analyseur qui l'a lancé.
  function startFec(file, target) {
    if (!file) return;
    if (fecWorker) fecWorker.terminate();
    if (target === 'prev') {
      const st = ui.fec;
      Object.assign(st, { prevStatus: 'loading', prevName: file.name, prev: null, prevError: '', prevSame: null, prevSameStatus: '' });
      refresh();
      return runFecWorker(file, st, (res, err) => {
        Object.assign(st, err ? { prevStatus: 'error', prevError: err } : { prevStatus: 'done', prev: res });
        if (!err) startSamePeriod(file, st, res);
        refresh();
      });
    }
    ui.fec = { status: 'loading', pct: 0, fileName: file.name, section: 'synthese', q: '', classe: '' };
    refresh();
    runFecWorker(file, ui.fec, null);
  }

  // Situation intermédiaire : dernière écriture à plus de 20 jours de la clôture.
  const isSituation = (r) => !!(r && r.meta.closing && r.pieces && r.pieces.maxOp && r.pieces.maxOp < addDays(r.meta.closing, -20));

  // Pour une situation, le FEC N-1 est aussi analysé jusqu'à la même date, pour comparer des périodes identiques.
  function startSamePeriod(file, st, full) {
    const r = st.result;
    if (!isSituation(r)) return;
    const shift = full.meta.closing && r.meta.closing ? daysUntilFrom(full.meta.closing, r.meta.closing) : 365;
    st.prevUntil = addDays(r.pieces.maxOp, -shift);
    st.prevSameStatus = 'loading';
    runFecWorker(file, st, (res, err) => {
      Object.assign(st, err ? { prevSameStatus: 'error' } : { prevSameStatus: 'done', prevSame: res });
      if (!st.prevMode) st.prevMode = 'same';
      refresh();
    }, st.prevUntil);
  }

  // FEC N-1 utilisé pour les comparaisons : même période pour une situation (si disponible), sinon exercice complet.
  function cmpPrev() {
    const f = ui.fec;
    if (!f || !f.prev) return null;
    return f.prevMode !== 'full' && f.prevSame ? f.prevSame : f.prev;
  }

  const fecAlive = (st) => !!data && (ui.fecStates.classique === st || ui.fecStates.pharmacie === st);

  // Contenu à analyser : le FEC lui-même, ou celui d'une archive .zip « FEC + justificatifs » (seuls les noms des justificatifs sont lus).
  const isZip = (file) => /\.zip$/i.test(file.name || '') || /zip/.test(file.type || '');
  async function fecSource(file) {
    if (!isZip(file)) return { buffer: await file.arrayBuffer(), name: file.name, docs: null };
    const a = await ArchiveReader.read(file);
    return { buffer: a.fec.buffer, name: a.fec.name, docs: a.docs.map((d) => ({ base: d.base })), archive: file.name };
  }

  function runFecWorker(file, st, onDone, until) {
    fecSource(file).then(({ buffer, name, docs, archive }) => {
      fecWorker = new Worker('js/fec-worker.js?v=' + ASSET_VERSION);
      fecWorker.onmessage = (e) => {
        const m = e.data;
        if (!fecAlive(st)) return;
        if (m.type === 'progress') {
          st.pct = m.pct;
          if (ui.fec !== st) return;
          const bar = $('.fec-progress span');
          if (bar) bar.style.width = m.pct + '%';
          const label = $('.fec-progress-label');
          if (label) label.textContent = `Analyse en cours… ${m.pct} %`;
          return;
        }
        fecWorker.terminate();
        fecWorker = null;
        if (m.type === 'done' && archive) m.result.meta.archive = archive;
        if (onDone) return onDone(m.type === 'done' ? m.result : null, m.type === 'error' ? m.message : '');
        if (m.type === 'error') Object.assign(st, { status: 'error', message: m.message });
        else {
          const siren = m.result.meta.siren;
          const match = clientBySiren(siren);
          Object.assign(st, { status: 'done', result: m.result, clientId: match ? match.id : '' });
        }
        if (location.hash.startsWith('#/fec') && ui.fec === st) refresh();
        else toast(m.type === 'error' ? 'Analyse du FEC impossible.' : 'Analyse du FEC terminée.');
      };
      fecWorker.onerror = (err) => {
        if (!fecAlive(st)) return;
        if (onDone) return onDone(null, err.message || 'Erreur pendant l\'analyse.');
        Object.assign(st, { status: 'error', message: err.message || 'Erreur pendant l\'analyse.' });
        refresh();
      };
      fecWorker.postMessage({ buffer, fileName: name, until: until || '', docs }, [buffer]);
    }, (err) => {
      if (!fecAlive(st)) return;
      if (onDone) return onDone(null, err.message);
      Object.assign(st, { status: 'error', message: err.message });
      refresh();
    });
  }

  // ---------- Graphiques (SVG) ----------

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }

  const moisLabel = (ym) => MOIS_COURTS[Number(ym.slice(5, 7)) - 1] + (ym.slice(5, 7) === '01' ? ' ' + ym.slice(2, 4) : '');

  function roundedBar(x, y0, y1, w) {
    // Barre arrondie (4 px) côté valeur, ancrée sur la ligne de base.
    const top = Math.min(y0, y1), h = Math.abs(y1 - y0);
    if (h < 0.5) return '';
    const r = Math.min(4, w / 2, h);
    if (y1 < y0) return `M${x},${y0}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${y0}Z`;
    return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
  }

  function axisY(ticks, y, W, left, fmtFn) {
    return ticks.map((t) => `<line class="viz-grid" x1="${left}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/><text class="viz-axis" x="${left - 6}" y="${y(t) + 4}" text-anchor="end">${esc(fmtFn(t))}</text>`).join('');
  }

  // Barres groupées (même unité, un seul axe).
  function barChart(rows, series, opts) {
    const W = 720, H = 230, left = 58, right = 8, top = 10, bottom = 26;
    const vals = rows.flatMap((r) => series.map((s) => r[s.key]));
    const max = niceMax(Math.max(0, ...vals));
    const min = Math.min(0, ...vals) < 0 ? -niceMax(-Math.min(...vals)) : 0;
    const y = (v) => top + ((max - v) / (max - min)) * (H - top - bottom);
    const ticks = [min, min / 2, 0, max / 2, max].filter((v, i, a) => a.indexOf(v) === i && (v >= 0 || min < 0));
    const gw = (W - left - right) / rows.length;
    const bw = Math.max(3, Math.min(18, (gw - 8 - 2 * (series.length - 1)) / series.length));
    const every = rows.length > 14 ? 2 : 1;
    const marks = rows.map((r, i) => {
      const x0 = left + i * gw + (gw - (bw * series.length + 2 * (series.length - 1))) / 2;
      const bars = series.map((s, k) => `<path d="${roundedBar(x0 + k * (bw + 2), y(0), y(r[s.key]), bw)}" fill="var(${s.color})"/>`).join('');
      const tip = `${opts.tipTitle(r)}\n` + series.map((s) => `${s.label} : ${eur(r[s.key])} €`).join('\n');
      return `${bars}<rect class="viz-hit" x="${left + i * gw}" y="${top}" width="${gw}" height="${H - top - bottom}" data-tip="${esc(tip)}" tabindex="0"/>
        ${i % every === 0 ? `<text class="viz-axis" x="${left + i * gw + gw / 2}" y="${H - 8}" text-anchor="middle">${esc(opts.xLabel(r))}</text>` : ''}`;
    }).join('');
    return `<div class="viz-scroll"><svg class="viz" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria)}">${axisY(ticks, y, W - right, left, eurK)}<line class="viz-base" x1="${left}" x2="${W - right}" y1="${y(0)}" y2="${y(0)}"/>${marks}</svg></div>`;
  }

  function lineChart(rows, key, opts) {
    const W = 720, H = 200, left = 58, right = 8, top = 12, bottom = 26;
    const vals = rows.map((r) => r[key]);
    const max = Math.max(0, ...vals) > 0 ? niceMax(Math.max(...vals)) : 0;
    const min = Math.min(0, ...vals) < 0 ? -niceMax(-Math.min(...vals)) : 0;
    const span = max - min || 1;
    const y = (v) => top + ((max - v) / span) * (H - top - bottom);
    const gw = (W - left - right) / rows.length;
    const x = (i) => left + i * gw + gw / 2;
    const ticks = [min, (min + max) / 2, max].concat(min < 0 && max > 0 ? [0] : []).filter((v, i, a) => a.indexOf(v) === i);
    const every = rows.length > 14 ? 2 : 1;
    const path = rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r[key]).toFixed(1)}`).join('');
    return `<div class="viz-scroll"><svg class="viz" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria)}">${axisY(ticks, y, W - right, left, eurK)}
      <line class="viz-base" x1="${left}" x2="${W - right}" y1="${y(0)}" y2="${y(0)}"/>
      <path d="${path}" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round"/>
      ${rows.map((r, i) => `<circle cx="${x(i)}" cy="${y(r[key])}" r="4" fill="var(--series-1)" stroke="var(--surface)" stroke-width="2"/>
        <rect class="viz-hit" x="${left + i * gw}" y="${top}" width="${gw}" height="${H - top - bottom}" data-tip="${esc(`${opts.tipTitle(r)}\n${opts.label} : ${eur(r[key])} €`)}" tabindex="0"/>
        ${i % every === 0 ? `<text class="viz-axis" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(opts.xLabel(r))}</text>` : ''}`).join('')}
      ${rows.length ? `<text class="viz-label" x="${x(rows.length - 1) - 6}" y="${y(rows[rows.length - 1][key]) - 10}" text-anchor="end">${esc(eurK(rows[rows.length - 1][key]))}</text>` : ''}
    </svg></div>`;
  }

  function benfordChart(b) {
    const W = 720, H = 200, left = 44, right = 8, top = 10, bottom = 26;
    const max = niceMax(Math.max(...b.rows.map((r) => Math.max(r.observe, r.attendu))));
    const y = (v) => top + ((max - v) / max) * (H - top - bottom);
    const gw = (W - left - right) / 9;
    const pct = (v) => (v * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %';
    return `<div class="viz-scroll"><svg class="viz" viewBox="0 0 ${W} ${H}" role="img" aria-label="Répartition des premiers chiffres comparée à la loi de Benford">
      ${axisY([0, max / 2, max], y, W - right, left, pct)}<line class="viz-base" x1="${left}" x2="${W - right}" y1="${y(0)}" y2="${y(0)}"/>
      ${b.rows.map((r, i) => {
        const x0 = left + i * gw;
        return `<path d="${roundedBar(x0 + gw / 2 - 11, y(0), y(r.observe), 22)}" fill="var(--series-1)"/>
          <line x1="${x0 + gw / 2 - 16}" x2="${x0 + gw / 2 + 16}" y1="${y(r.attendu)}" y2="${y(r.attendu)}" stroke="var(--text)" stroke-width="2" stroke-linecap="round"/>
          <rect class="viz-hit" x="${x0}" y="${top}" width="${gw}" height="${H - top - bottom}" tabindex="0" data-tip="${esc(`Premier chiffre ${r.chiffre}\nObservé : ${pct(r.observe)} (${r.n.toLocaleString('fr-FR')})\nAttendu : ${pct(r.attendu)}`)}"/>
          <text class="viz-axis" x="${x0 + gw / 2}" y="${H - 8}" text-anchor="middle">${r.chiffre}</text>`;
      }).join('')}
    </svg></div>`;
  }

  const legend = (items) => `<div class="viz-legend">${items.map(([color, label, line]) => `<span><i class="${line ? 'key-line' : 'key-box'} key${color.replace('--', '-')}"></i>${esc(label)}</span>`).join('')}</div>`;

  // ---------- Écran ----------

  function levelBadge(level) {
    const l = LEVEL[level] || LEVEL.info;
    return `<span class="lvl lvl-${level}" title="${l.label}"><b aria-hidden="true">${l.icon}</b>${l.label}</span>`;
  }

  function checkList(items, showOk) {
    const list = showOk ? items : items.filter((c) => c.level !== 'ok');
    if (!list.length) return '<p class="muted">Aucun point relevé.</p>';
    const order = { error: 0, warn: 1, info: 2, ok: 3 };
    return `<ul class="fec-checks">${list.slice().sort((a, b) => order[a.level] - order[b.level]).map((c) => `
      <li class="fec-check">
        ${c.examples && c.examples.length ? '<details><summary>' : '<div class="fec-check-row">'}
          ${levelBadge(c.level)}
          <span class="fec-check-text"><span><strong>${esc(c.label)}</strong>${c.count && c.level !== 'ok' && c.count > 1 ? ` <span class="count">${c.count.toLocaleString('fr-FR')}</span>` : ''}</span>${c.detail ? `<span class="muted small">${esc(c.detail)}</span>` : ''}</span>
        ${c.examples && c.examples.length ? `</summary><ul class="fec-ex">${c.examples.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></details>` : '</div>'}
      </li>`).join('')}</ul>`;
  }

  function fecProfilesNav(active) {
    const a = (key, href, ico, label) => `<a role="tab" aria-selected="${active === key}" class="${active === key ? 'on' : ''}" href="${href}">${icon(ico)}${label}</a>`;
    return `<div class="seg fec-profiles" role="tablist" aria-label="Analyseur">
        ${a('classique', '#/fec', 'chart', 'Structure classique')}${a('pharma', '#/fec/pharma', 'shield', 'Pharmacie (officine)')}${a('lot', '#/fec/lot', 'grid', 'Portefeuille')}
      </div>`;
  }

  function viewFec() {
    const f = ui.fec;
    const pharma = ui.fecProfile === 'pharmacie';
    const profiles = fecProfilesNav(pharma ? 'pharma' : 'classique');
    const head = `<div class="page-head"><h1>Analyse FEC${pharma ? ' — Pharmacie' : ' — Structure classique'}</h1>
      <div class="head-actions">${f && f.status === 'done' ? `<button class="btn" data-action="fec-export">Exporter en Excel</button>` : ''}
        <button class="btn primary" data-action="fec-pick">${f ? 'Analyser un autre FEC' : 'Choisir un FEC'}</button></div></div>${profiles}`;
    if (!f) {
      return `${head}
        <div class="fec-drop card" data-action="fec-pick" role="button" tabindex="0">
          ${icon('chart', 'fec-drop-ico')}
          <p><strong>Déposez le FEC ${pharma ? 'd\'une pharmacie' : 'd\'une entreprise'} ici</strong> ou cliquez pour le choisir</p>
          <p class="muted small">Fichier .txt ou .csv au format de l'article A47 A-1 du LPF (tabulation ou « | », UTF-8 ou ISO-8859-15)${pharma ? '' : ', y compris BNC / BA'}, ou archive <strong>.zip « FEC + justificatifs »</strong> (export Pennylane) pour repérer les écritures sans pièce.</p>
        </div>
        <div class="grid2">
          <section class="card"><h2>Ce que l'analyse vérifie</h2><ul class="bullets">
            <li><strong>Conformité du fichier</strong> : nom, séparateur, 18 colonnes, zones obligatoires, dates, montants, équilibre de chaque écriture et de la balance, numérotation, dates hors exercice…</li>
            ${pharma ? `<li><strong>Tiers payant</strong> : balance âgée par organisme (régime obligatoire, complémentaires), rejets et impayés probables, trop-perçus, créances patients.</li>
            <li><strong>CA et TVA</strong> : contrôle de la TVA collectée taux par taux (2,1 %, 5,5 %, 10 %, 20 %), honoraires de dispensation, ROSP et rémunérations forfaitaires.</li>
            <li><strong>Officine</strong> : taux de marque, remises grossistes et laboratoires, comptes de transit CB et chèques, écarts et solde de caisse, pièces à demander propres à la pharmacie.</li>`
            : `<li><strong>Points de révision</strong> : caisse créditrice, comptes d'attente, clients créditeurs, fournisseurs débiteurs, compte courant d'associé débiteur, doublons, écritures du dimanche ou d'un jour férié, loi de Benford.</li>
            <li><strong>Chiffres</strong> : soldes intermédiaires de gestion, bilan simplifié, balance générale, CA et charges par mois, trésorerie, journaux, principaux clients et fournisseurs.</li>`}
          </ul></section>
          <section class="card"><h2>${icon('shield')} Confidentialité</h2>
            <p>Le FEC est analysé <strong>sur cet appareil uniquement</strong>, dans un processus isolé : il n'est ni envoyé, ni conservé. Seule la synthèse (chiffres clés et nombre d'anomalies) peut être enregistrée, chiffrée, dans le dossier si vous le demandez.</p>
            <p class="muted small">Les analyses sont indicatives et ne remplacent pas le contrôle du fichier par l'outil officiel Test Compta Demat de la DGFiP.</p>
          </section>
        </div>`;
    }
    if (f.status === 'loading') {
      return `${head}<section class="card fec-loading"><p><strong>${esc(f.fileName)}</strong></p>
        <div class="fec-progress"><span data-w="${f.pct}"></span></div><p class="muted fec-progress-label">Analyse en cours… ${f.pct} %</p>
        <p class="muted small">Le fichier est lu sur cet appareil. Pour un gros FEC, cela peut prendre quelques secondes.</p></section>`;
    }
    if (f.status === 'error') {
      return `${head}<div class="banner warn"><span><strong>${esc(f.fileName)}</strong> : ${esc(f.message)}</span></div>`;
    }
    const r = f.result;
    const m = r.meta;
    const { errors, warnings } = fecCounts(r);
    const dmy = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
    const clients = data.clients.filter((c) => !c.archive).sort((a, b) => clientLabel(a).localeCompare(clientLabel(b), 'fr'));
    const nbPieces = r.pieces ? computePieces(r, piecesState().mode, piecesState().arrete).length : 0;
    const cc = cycleChecks(r);
    const cyc = (k, label) => {
      const n = cc ? wpProgress(k, cc[k]).left : 0;
      return { [k]: `${label}${n ? ` (${n})` : ''}` };
    };
    const tabs = Object.assign({ synthese: 'Synthèse' }, pharma ? { tp: 'Tiers payant', catva: 'CA & TVA' } : {},
      cc ? Object.assign(cyc('achats', 'Achats'), cyc('charges', 'Charges externes'), pharma ? {} : cyc('clients', 'Clients'), cyc('treso', 'Trésorerie')) : {},
      r.cycles && r.cycles.tva && Object.keys(r.cycles.tva.months).length ? (() => { const t = tvaData(r); const n = wpProgress(t.cycle, t.checks).left; return { tva: `TVA${n ? ` (${n})` : ''}` }; })() : {},
      r.cycles ? (() => { const n = ecrProposals(r).filter((p) => p.on).length; return { ecritures: `Écritures${n ? ` (${n})` : ''}` }; })() : {},
      { pieces: `Pièces à demander${nbPieces ? ` (${nbPieces})` : ''}`, revue: 'Revue N / N-1', rappro: 'Rapprochement', conformite: `Conformité${errors ? ` (${errors})` : ''}`, sig: 'SIG et bilan', balance: 'Balance', details: 'Détails' });
    if (!tabs[f.section]) f.section = 'synthese';
    // Suggestion de l'autre analyseur selon le contenu du FEC.
    const isPh = looksLikePharmacy(r);
    const suggest = isPh && !pharma
      ? `<div class="banner info"><span>Ce FEC ressemble à celui d'une <strong>pharmacie</strong> (tiers payant, TVA à 2,1 %, honoraires) : l'analyseur Pharmacie est plus adapté.</span><button class="btn small" data-action="fec-switch" data-to="pharmacie">Analyser comme une pharmacie</button></div>`
      : !isPh && pharma ? `<div class="banner info"><span>Ce FEC ne ressemble pas à celui d'une pharmacie.</span><button class="btn small" data-action="fec-switch" data-to="classique">Utiliser l'analyseur classique</button></div>` : '';
    let body = '';

    if (f.section === 'synthese') {
      const k = r.kpi;
      const tile = (label, value, cls) => `<div class="kpi ${cls || ''}"><strong>${value}</strong><span>${label}</span></div>`;
      body = `
        ${nbPieces ? `<div class="banner info"><span><strong>${nbPieces} pièce(s) ou information(s)</strong> à demander au client pour ${piecesState().mode === 'mois' ? `le mois de ${moisNom(piecesState().arrete)}` : `${piecesState().mode === 'bilan' ? 'le bilan' : 'la situation'} au ${fmtDate(piecesState().arrete)}`}.</span><button class="btn small" data-action="fec-tab" data-tab="pieces">Voir la liste</button></div>` : ''}
        <div class="kpis fec-kpis">
          ${tile('Anomalies', errors, errors ? 'kpi-late' : '')}
          ${tile('Points à vérifier', warnings, warnings ? 'kpi-wait' : '')}
          ${tile('Chiffre d\'affaires', eurK(k.ca))}
          ${pharma ? (() => {
            const ph = pharmaData(r, pharmaRef(r));
            return `${tile('Taux de marque', ph.tauxMarque === null ? '—' : (ph.tauxMarque * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %')}
              ${tile('Encours tiers payant', eurK(ph.encoursAmo + ph.encoursAmc))}
              ${tile(`Rejets probables${ph.lettrage ? '' : ' (estim.)'}`, eurK(ph.rejets), ph.rejets > 0 ? 'kpi-late' : '')}`;
          })() : `${tile('Résultat', eurK(k.resultat), k.resultat < 0 ? 'kpi-late' : '')}
          ${tile('EBE', eurK(k.ebe))}
          ${tile('Trésorerie', eurK(k.tresorerie), k.tresorerie < 0 ? 'kpi-late' : '')}`}
        </div>
        ${cyclesCard(r)}
        ${justifCard(r)}
        ${r.monthly.length ? `
        <section class="card"><h2>Chiffre d'affaires et charges par mois</h2>
          ${legend([['--series-1', 'Chiffre d\'affaires (70)'], ['--series-2', 'Charges (classe 6)']])}
          ${barChart(r.monthly, [{ key: 'ca', label: 'Chiffre d\'affaires', color: '--series-1' }, { key: 'charges', label: 'Charges', color: '--series-2' }], { aria: 'Chiffre d\'affaires et charges par mois', xLabel: (x) => moisLabel(x.mois), tipTitle: (x) => moisLabel(x.mois).replace(/ \d+$/, '') + ' ' + x.mois.slice(0, 4) })}
        </section>
        <section class="card"><h2>Trésorerie en fin de mois <span class="muted small">(comptes 51 à 53, à-nouveaux compris)</span></h2>
          ${lineChart(r.monthly, 'tresorerie', { aria: 'Trésorerie en fin de mois', label: 'Trésorerie', xLabel: (x) => moisLabel(x.mois), tipTitle: (x) => 'Fin ' + moisLabel(x.mois).replace(/ \d+$/, '').toLowerCase() + ' ' + x.mois.slice(0, 4) })}
          <details class="viz-table"><summary>Voir les données mensuelles</summary>
            <div class="grid-wrap"><table class="dtable num"><thead><tr><th>Mois</th><th>CA</th><th>Charges</th><th>TVA collectée</th><th>TVA déductible</th><th>Trésorerie</th></tr></thead>
            <tbody>${r.monthly.map((x) => `<tr><td>${x.mois.slice(5)}/${x.mois.slice(0, 4)}</td><td>${eur(x.ca)}</td><td>${eur(x.charges)}</td><td>${eur(x.tvaCollectee)}</td><td>${eur(x.tvaDeductible)}</td><td>${eur(x.tresorerie)}</td></tr>`).join('')}</tbody></table></div>
          </details>
        </section>` : ''}
        <section class="card"><h2>Points de révision <span class="count">${genPoints(r).filter((x) => x.level !== 'ok').length}</span></h2>${wpCycleBar('gen', genPoints(r))}${wpCheckList(genPoints(r), 'gen')}</section>
        ${errors ? `<section class="card"><h2>Anomalies de conformité du fichier</h2>${checkList(r.checks.filter((c) => c.level === 'error'))}<button class="btn small" data-action="fec-tab" data-tab="conformite">Voir tous les contrôles</button></section>` : ''}`;
    } else if (f.section === 'ecritures') {
      body = viewEcritures();
    } else if (f.section === 'achats') {
      body = viewAchats();
    } else if (f.section === 'charges') {
      body = viewCharges();
    } else if (f.section === 'clients') {
      body = viewClients();
    } else if (f.section === 'treso') {
      body = viewTreso();
    } else if (f.section === 'tva') {
      body = viewTva();
    } else if (f.section === 'tp') {
      body = viewTiersPayant();
    } else if (f.section === 'catva') {
      body = viewCaTva();
    } else if (f.section === 'rappro') {
      body = viewRappro();
    } else if (f.section === 'revue') {
      body = viewRevue();
    } else if (f.section === 'pieces') {
      body = viewPieces();
    } else if (f.section === 'conformite') {
      body = `<section class="card"><h2>Contrôles de conformité du fichier</h2>
        <p class="muted small">Référence : article A47 A-1 du livre des procédures fiscales. Cliquez sur un contrôle pour voir des exemples de lignes concernées.</p>
        ${checkList(r.checks, true)}</section>`;
    } else if (f.section === 'sig') {
      const row = (label, v, strong) => `<tr class="${strong ? 'strong' : ''}"><td>${esc(label)}</td><td>${eur(v)}</td></tr>`;
      body = `<div class="grid2">
        <section class="card"><h2>Soldes intermédiaires de gestion</h2>
          <table class="dtable num sig"><tbody>${r.sig.map((s) => row(s.label, s.value, s.strong)).join('')}</tbody></table>
          <p class="muted small">Calculés à partir des comptes de classes 6 et 7 du FEC (hors écritures de clôture).</p></section>
        <section class="card"><h2>Bilan simplifié</h2>
          <table class="dtable num sig"><thead><tr><th>Actif</th><th></th></tr></thead><tbody>${r.bilan.actif.map(([l, v]) => row(l, v)).join('')}${row('Total actif', r.bilan.totalActif, true)}</tbody></table>
          <table class="dtable num sig"><thead><tr><th>Passif</th><th></th></tr></thead><tbody>${r.bilan.passif.map(([l, v]) => row(l, v)).join('')}${row('Total passif', r.bilan.totalPassif, true)}</tbody></table>
          <p class="muted small">${m.hasAN ? 'À-nouveaux inclus.' : '<strong>Sans à-nouveaux</strong> : les postes de bilan sont incomplets.'} Classement selon le sens du solde de chaque compte.</p></section>
      </div>`;
    } else if (f.section === 'balance') {
      const q = norm(f.q);
      const list = r.balance.filter((b) => (!f.classe || b.compte[0] === f.classe) && (!q || norm(b.compte + ' ' + b.lib).includes(q)));
      const tot = list.reduce((t, b) => ({ d: t.d + b.d, c: t.c + b.c }), { d: 0, c: 0 });
      body = `<section class="card">
        <div class="filters">
          <input type="search" placeholder="Compte ou libellé…" data-fec="q" value="${esc(f.q)}" spellcheck="false" autocomplete="off">
          <select data-fec="classe" aria-label="Classe">${options({ '': 'Toutes les classes', 1: '1 — Capitaux', 2: '2 — Immobilisations', 3: '3 — Stocks', 4: '4 — Tiers', 5: '5 — Financiers', 6: '6 — Charges', 7: '7 — Produits' }, f.classe)}</select>
        </div>
        <div class="grid-wrap"><table class="dtable num balance"><thead><tr><th>Compte</th><th>Libellé</th><th>Débit</th><th>Crédit</th><th>Solde</th></tr></thead>
          <tbody>${list.slice(0, 600).map((b) => `<tr><td>${esc(b.compte)}</td><td>${esc(b.lib)}</td><td>${eur(b.d)}</td><td>${eur(b.c)}</td><td class="${b.s < 0 ? 'cred' : ''}">${eur(Math.abs(b.s))} ${b.s < 0 ? 'C' : b.s > 0 ? 'D' : ''}</td></tr>`).join('')}</tbody>
          <tfoot><tr><th colspan="2">Total (${list.length} comptes)</th><th>${eur(tot.d)}</th><th>${eur(tot.c)}</th><th>${eur(Math.abs(tot.d - tot.c))} ${tot.d - tot.c < 0 ? 'C' : tot.d - tot.c > 0 ? 'D' : ''}</th></tr></tfoot></table></div>
        ${list.length > 600 ? `<p class="muted small">600 premiers comptes affichés : affinez la recherche ou exportez en Excel.</p>` : ''}
      </section>`;
    } else {
      const tiersTable = (list, col) => `<div class="grid-wrap"><table class="dtable num"><thead><tr><th>Compte</th><th>Nom</th><th>${col}</th><th>Solde</th></tr></thead><tbody>${list.map((t) => `<tr><td>${esc(t.num)}</td><td>${esc(t.lib)}</td><td>${eur(col === 'Facturé (débit)' ? t.d : t.c)}</td><td class="${t.s < 0 ? 'cred' : ''}">${eur(Math.abs(t.s))} ${t.s < 0 ? 'C' : t.s > 0 ? 'D' : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Aucun</td></tr>'}</tbody></table></div>`;
      body = `
        <div class="grid2">
          <section class="card"><h2>Principaux clients (411)</h2>${tiersTable(r.tiers.clients, 'Facturé (débit)')}</section>
          <section class="card"><h2>Principaux fournisseurs (401)</h2>${tiersTable(r.tiers.fournisseurs, 'Facturé (crédit)')}</section>
        </div>
        <section class="card"><h2>Journaux</h2><div class="grid-wrap"><table class="dtable num"><thead><tr><th>Code</th><th>Libellé</th><th>Écritures</th><th>Lignes</th><th>Débit</th><th>Crédit</th></tr></thead>
          <tbody>${r.journals.map((j) => `<tr><td>${esc(j.code)}</td><td>${esc(j.lib)}</td><td>${j.entries.toLocaleString('fr-FR')}</td><td>${j.lines.toLocaleString('fr-FR')}</td><td>${eur(j.d)}</td><td>${eur(j.c)}</td></tr>`).join('')}</tbody></table></div></section>
        <section class="card"><h2>Loi de Benford <span class="muted small">(${r.benford.n.toLocaleString('fr-FR')} montants ≥ 10 €)</span></h2>
          ${r.benford.level === 'n/a' ? '<p class="muted">Pas assez de montants pour un test significatif (500 minimum).</p>' : `
          ${legend([['--series-1', 'Fréquence observée'], ['--text', 'Fréquence attendue (Benford)', true]])}
          ${benfordChart(r.benford)}
          <p>Écart absolu moyen : <strong>${r.benford.mad.toFixed(4)}</strong> — ${levelBadge(r.benford.level === 'conforme' || r.benford.level === 'acceptable' ? 'ok' : 'info')} ${esc(r.benford.level)} <span class="muted small">(seuils de Nigrini : 0,006 / 0,012 / 0,015)</span></p>`}
        </section>`;
    }

    return `${head}
      <section class="card fec-meta">
        <div class="fec-meta-grid">
          <div><div class="muted small">Fichier</div><strong class="fec-file">${esc(m.fileName)}</strong></div>
          <div><div class="muted small">SIREN · clôture</div>${esc(m.siren || '—')} · ${dmy(m.closing)}</div>
          <div><div class="muted small">Période des écritures</div>${dmy(m.minDate)} → ${dmy(m.maxDate)}</div>
          <div><div class="muted small">Volume</div>${m.lines.toLocaleString('fr-FR')} lignes · ${m.entries.toLocaleString('fr-FR')} écritures · ${m.accounts.toLocaleString('fr-FR')} comptes</div>
          ${r.cycles && r.cycles.justif ? `<div><div class="muted small">Justificatifs${m.archive ? ` (${esc(m.archive)})` : ''}</div>${r.cycles.justif.docs.toLocaleString('fr-FR')} fichier(s) · ${r.cycles.justif.judged ? `${Math.round((r.cycles.justif.ok / r.cycles.justif.judged) * 100)} % des pièces retrouvées` : 'rapprochement impossible'}</div>` : ''}
        </div>
        <div class="fec-link">
          <label>Dossier<select data-fec="client">${options(Object.fromEntries(clients.map((c) => [c.id, `${c.code ? c.code + ' — ' : ''}${clientLabel(c)}`])), f.clientId, '— Rattacher à un dossier —')}</select></label>
          <button class="btn" data-action="fec-save"${f.clientId ? '' : ' disabled'}>Enregistrer la synthèse</button>
          <button class="btn" data-action="fec-mission"${f.clientId && (errors || warnings) ? '' : ' disabled'}>Créer une mission de revue</button>
        </div>
      </section>
      ${suggest}
      <div class="seg fec-tabs" role="tablist">${Object.entries(tabs).map(([k, l]) => `<button role="tab" aria-selected="${k === f.section}" class="${k === f.section ? 'on' : ''}" data-action="fec-tab" data-tab="${k}">${esc(l)}</button>`).join('')}</div>
      ${body}`;
  }

  // ---------- Pièces à demander au client ----------

  const PIECES_CATS = {
    banque: 'Relevés bancaires',
    achats: 'Factures fournisseurs',
    justif: 'Justificatifs de dépenses payées directement',
    ventes: 'Ventes et encaissements',
    tp: 'Tiers payant et patients',
    attente: 'Opérations à identifier',
    releve: 'Opérations bancaires non comptabilisées',
    immo: 'Immobilisations',
    social: 'Social',
    associe: "Compte courant d'associé",
    caisse: 'Caisse',
    cloture: 'Documents de clôture',
    questions: 'Questions',
  };

  const ymOf = (iso) => iso.slice(0, 7);
  function monthsBetween(a, b) {
    const out = [];
    if (!a || !b || a > b) return out;
    let [y, m] = a.split('-').map(Number);
    const [y2, m2] = b.split('-').map(Number);
    while (y < y2 || (y === y2 && m <= m2)) {
      out.push(`${y}-${pad(m)}`);
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return out;
  }

  // « janvier 2025 », « de mars à mai 2025 », « de novembre 2024 à janvier 2025 ».
  function fmtMonths(list) {
    const label = (ym, withYear) => MOIS_LONGS[Number(ym.slice(5, 7)) - 1] + (withYear ? ' ' + ym.slice(0, 4) : '');
    const sorted = list.slice().sort();
    const ranges = [];
    sorted.forEach((ym) => {
      const last = ranges[ranges.length - 1];
      if (last && monthsBetween(last[1], ym).length === 2) last[1] = ym;
      else ranges.push([ym, ym]);
    });
    const de = (w) => (/^[aeiou]/.test(w) ? `d'${w}` : `de ${w}`);
    return ranges.map(([a, b]) => {
      if (a === b) return label(a, true);
      const first = label(a, a.slice(0, 4) !== b.slice(0, 4));
      if (monthsBetween(a, b).length === 2) return `${first} et ${label(b, true)}`;
      return `${de(first)} à ${label(b, true)}`;
    }).join(', ');
  }

  function median(values) {
    const v = values.slice().sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : 0;
  }

  function defaultArrete(r, mode) {
    const m = r.meta;
    if (mode === 'bilan' && m.closing) return m.closing;
    const last = (r.pieces && r.pieces.maxOp) || m.maxDate;
    if (!last || last === '0000') return todayStr();
    const eom = endOfMonth(last);
    // Situation : fin du dernier mois complet saisi.
    return daysUntilFrom(last, eom) <= 5 ? eom : addDays(`${last.slice(0, 7)}-01`, -1);
  }

  function daysUntilFrom(a, b) {
    return Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
  }

  const moisNom = (iso) => `${MOIS_LONGS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
  const piecesLabel = (mode, arrete) => (mode === 'mois' ? `mois de ${moisNom(arrete)}` : `${mode === 'bilan' ? 'bilan' : 'situation'} au ${fmtDate(arrete)}`);

  // Mois dont un tiers est habituellement facturé : au moins 3 des 6 mois précédents, dont l'un des 2 derniers.
  function usuallyMonthly(months, ym) {
    const start = `${ym}-01`;
    const prior = monthsBetween(ymOf(addDays(start, -175)), ymOf(addDays(start, -1)));
    const seen = prior.filter((m) => Math.abs(months[m] || 0) >= 0.01);
    if (seen.length < 3 || !prior.slice(-2).some((m) => Math.abs(months[m] || 0) >= 0.01)) return null;
    return median(seen.map((m) => months[m]));
  }

  // Tiers « fourre-tout » (divers, occasionnels) : jamais d'estimation de facture récurrente.
  const RE_DIVERS = /\bdivers|diverse|occasionnel|ponctuel|autres? (fournisseurs?|clients?)|\bvarious\b|\bmisc/i;

  // Abonnement : facturé chaque mois pour un montant stable (écart de 20 % au plus autour du montant habituel).
  function stableMonthly(t, ym) {
    if (RE_DIVERS.test(t.lib || '')) return null;
    const med = usuallyMonthly(t.months, ym);
    if (med === null || med <= 0) return null;
    const start = `${ym}-01`;
    const prior = monthsBetween(ymOf(addDays(start, -175)), ymOf(addDays(start, -1))).map((m) => t.months[m]).filter((v) => Math.abs(v || 0) >= 0.01);
    return prior.every((v) => Math.abs(v - med) <= med * 0.2) ? med : null;
  }

  // Abonnement sur l'exercice : facturé au moins 3 mois et 60 % des mois depuis le premier, montant stable (20 % près).
  // Renvoie le montant mensuel habituel et les mois sans facture jusqu'à `endYm`, ou null.
  function subscriptionGaps(sp, endYm) {
    if (RE_DIVERS.test(sp.lib || '')) return null;
    const months = Object.keys(sp.months).filter((ym) => ym <= endYm).sort();
    if (months.length < 3) return null;
    const window = monthsBetween(months[0], endYm);
    if (months.length / window.length < 0.6) return null;
    const med = median(months.map((ym) => sp.months[ym]));
    if (med <= 0 || !months.every((ym) => Math.abs(sp.months[ym] - med) <= med * 0.2)) return null;
    return { med, missing: window.filter((ym) => !sp.months[ym]) };
  }

  // Règlements et encaissements non affectés à une facture, regroupés par tiers : une demande par tiers, chaque paiement daté.
  function unmatchedPieces(r, push, from, to, scope) {
    const pharma = ui.fecProfile === 'pharmacie';
    const d = fmtDate;
    const groups = new Map();
    (r.pieces.unmatched || []).filter((u) => u.date >= from && u.date <= to && (u.racine === '401' || !pharma)).forEach((u) => {
      const k = u.racine + '|' + u.num;
      (groups.get(k) || groups.set(k, []).get(k)).push(u);
    });
    groups.forEach((list) => {
      const u0 = list[0];
      const total = list.reduce((s2, u) => s2 + u.amt, 0);
      const det = list.slice(0, 8).map((u) => `du ${d(u.date)} (${eur(u.amt)} €)`).join(', ') + (list.length > 8 ? ` et ${list.length - 8} autre(s), total ${eur(total)} €` : '');
      if (u0.racine === '401') push('achats', `nf:${scope}:${u0.num}`, list.length === 1
        ? `Facture ${u0.lib} correspondant au paiement de ${eur(u0.amt)} € du ${d(u0.date)}`
        : `Factures ${u0.lib} correspondant aux paiements ${det}`);
      else push('ventes', `ne:${scope}:${u0.num}`, list.length === 1
        ? `Facture ou avoir ${u0.lib} correspondant à l'encaissement de ${eur(u0.amt)} € du ${d(u0.date)}`
        : `Factures ou avoirs ${u0.lib} correspondant aux encaissements ${det}`);
    });
    return groups;
  }

  // Demande mensuelle : pièces manquantes du mois pour les cycles achats et ventes.
  function monthPieces(r, arrete) {
    const items = [];
    const push = (cat, id, text) => items.push({ cat, id: `${cat}:${id}`, text });
    const p = r.pieces;
    const cy = r.cycles;
    const ym = ymOf(arrete);
    const start = `${ym}-01`, end = endOfMonth(start), mois = moisNom(start);
    const inM = (date) => date >= start && date <= end;
    const d = fmtDate;
    const pharma = ui.fecProfile === 'pharmacie';

    // Règlements fournisseurs et encaissements clients du mois non affectés à une facture (paiement par paiement)
    const asked = unmatchedPieces(r, push, start, end, ym);
    // Archive de justificatifs : écritures du mois sans pièce (exact), à la place de la liste des dépenses payées directement.
    // Les abonnements dont la facture n'est pas saisie du tout restent détectés : l'archive ne peut pas les voir.
    const exact = justifOk(r);
    justifPieces(r, push, start, end, ym);
    // Abonnements : fournisseurs facturés chaque mois pour un montant stable, sans facture ce mois-ci
    p.suppliers.forEach((sp) => {
      if (Math.abs(sp.months[ym] || 0) >= 0.01 || asked.has('401|' + sp.num)) return;
      const med = stableMonthly(sp, ym);
      if (med !== null) push('achats', 'rec:' + sp.num, `Facture ${sp.lib} de ${mois} (abonnement de ${eur(med)} € par mois)`);
    });
    // Dépenses payées directement (banque ou caisse → charge, sans facture fournisseur)
    const groups = new Map();
    (exact ? [] : p.directLines || []).filter((l) => inM(l[0])).forEach(([date, compte, clib, elib, amt]) => {
      const lib = String(elib).replace(/\S*\d\S*/g, '').replace(/\s+/g, ' ').trim() || elib;
      const k = compte + '|' + norm(lib);
      const g = groups.get(k) || groups.set(k, { lib, clib, n: 0, total: 0, date }).get(k);
      g.n++;
      g.total += amt;
    });
    const docName = (lib) => (/amende|antai|contravention|\bpv\b|penalit/i.test(lib) ? 'Avis de contravention' : 'Facture');
    Array.from(groups.values()).sort((a, b) => b.total - a.total).forEach((g, i) => push('justif', `m${ym}:${i}`, g.n === 1
      ? `${docName(g.lib)} « ${g.lib.slice(0, 45)} » du ${d(g.date)} (${eur(g.total)} €) — ${g.clib}`
      : `Factures « ${g.lib.slice(0, 45)} » : ${g.n} paiements en ${mois}, total ${eur(g.total)} € — ${g.clib}`));
    // Acquisitions d'immobilisations du mois
    p.immo.filter((l) => inM(l.date)).forEach((l, i) => push('immo', `m${ym}:${i}`, `Facture d'acquisition « ${l.lib} » du ${d(l.date)} (${eur(l.montant)} €, ${l.clib})`));
    // Opérations en attente du mois
    p.attente.filter((l) => inM(l.date) && !l.lettre).forEach((l, i) => push('attente', `m${ym}:${i}`, `Justificatif de l'opération « ${l.lib} » du ${d(l.date)} : ${l.c > 0 ? 'encaissement' : 'paiement'} de ${eur(l.c || l.d)} €`));

    if (!pharma && cy) {
      // Ventes : clients facturés chaque mois sans facture ce mois-ci
      cy.clients.customers.forEach((c) => {
        if (!c.months || Math.abs(c.months[ym] || 0) >= 0.01 || RE_DIVERS.test(c.lib || '') || asked.has('411|' + c.num)) return;
        const med = usuallyMonthly(c.months, ym);
        if (med !== null) push('ventes', 'mcli:' + c.num, `Factures de vente à ${c.lib} pour ${mois} (facturé habituellement chaque mois, environ ${eur(med, 0)} € TTC)`);
      });
      // Numéros de facture manquants dans la séquence du mois
      cy.clients.numbering.filter((g) => !g.sparse && g.seq).forEach((g) => {
        // Chaque trou de la numérotation est rattaché au mois de la facture qui le suit.
        const miss = [];
        for (let i = 1; i < g.seq.length && miss.length < 200; i++) {
          if (!inM(g.seq[i][1])) continue;
          for (let n = g.seq[i - 1][0] + 1; n < g.seq[i][0] && miss.length < 200; n++) miss.push(n);
        }
        if (!miss.length) return;
        const ref = (n) => g.prefix + String(n).padStart(g.w || 0, '0');
        const ranges = [];
        miss.forEach((n) => { const last = ranges[ranges.length - 1]; if (last && n === last[1] + 1) last[1] = n; else ranges.push([n, n]); });
        push('ventes', `num:${g.prefix}:${ym}`, `Factures de vente n° ${ranges.slice(0, 10).map(([a, b]) => (a === b ? ref(a) : `${ref(a)} à ${ref(b)}`)).join(', ')} (${mois}) : copies, ou confirmation de leur annulation`);
      });
      // Ventes sans TVA dont la nature n'est pas identifiable (contrôle de la TVA du mois)
      const tvM = cy.tva && cy.tva.months[ym];
      if (tvM && tvM.noVat.unknown.n) push('questions', `tvanv:${ym}`, `Ventes sans TVA de ${mois} (${tvM.noVat.unknown.n} facture(s), ${eur(tvM.noVat.unknown.base)} € HT) : nature des opérations (export, livraison intracommunautaire avec le n° de TVA du client, opération exonérée) ?`);
      // Encaissements enregistrés en ventes sans facture client (activité facturée)
      const facture = cy.clients.customers.reduce((s, c) => s + c.ht, 0);
      if (r.kpi.ca > 0 && facture >= r.kpi.ca * 0.5) (cy.clients.directSales || []).filter(([date]) => inM(date)).slice(0, 15).forEach(([date, amt, lib], i) => push('ventes', `enc:${ym}:${i}`, `Facture de vente correspondant à l'encaissement « ${lib} » du ${d(date)} (${eur(amt)} €)`));
    }
    return items;
  }

  // Noms à ne jamais solliciter (réglage « Ne jamais demander de pièces pour ces fournisseurs »), en mot entier.
  function ignoredRe() {
    const list = (data.settings.piecesIgnore || []).map((x) => norm(x).trim()).filter(Boolean);
    if (!list.length) return null;
    return new RegExp(`(^|[^a-z0-9])(${list.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})([^a-z0-9]|$)`);
  }

  function computePieces(r, mode, arrete) {
    const re = ignoredRe();
    const items = computePiecesRaw(r, mode, arrete);
    return re ? items.filter((i) => i.cat === 'cloture' || !re.test(norm(i.text))) : items;
  }

  function computePiecesRaw(r, mode, arrete) {
    if (mode === 'mois') return monthPieces(r, arrete);
    const p = r.pieces;
    const items = [];
    const push = (cat, id, text) => items.push({ cat, id: `${cat}:${id}`, text });
    const endYm = ymOf(arrete);
    const startYm = ymOf(r.meta.start && r.meta.start <= arrete ? r.meta.start : p.minOp || arrete);
    const period = monthsBetween(startYm, endYm);
    const d = (iso) => fmtDate(iso);
    const bilan = mode === 'bilan';

    // Relevés bancaires
    p.banks.forEach((b) => {
      const closed = Math.abs(b.solde) < 0.01 && b.last < addDays(arrete, -60);
      const expected = monthsBetween(ymOf(b.first) > startYm ? ymOf(b.first) : startYm, closed ? ymOf(b.last) : endYm);
      const missing = expected.filter((ym) => !b.months[ym]);
      if (missing.length) push('banque', b.compte, `Relevés du compte ${b.lib || b.compte} (${b.compte}) : ${fmtMonths(missing)}`);
      else if (!closed && b.last < addDays(arrete, -10)) push('banque', b.compte + ':fin', `Relevés du compte ${b.lib || b.compte} (${b.compte}) du ${d(addDays(b.last, 1))} au ${d(arrete)}`);
      if (bilan && !closed) push('banque', b.compte + ':solde', `Relevé du compte ${b.lib || b.compte} au ${d(arrete)} (ou attestation de solde bancaire)`);
    });

    // Règlements et encaissements non affectés à une facture, paiement par paiement (en officine, le tiers payant est traité à part)
    const pharma = ui.fecProfile === 'pharmacie';
    const asked = p.unmatched ? unmatchedPieces(r, push, '0000-00-00', arrete, 'per') : new Map();
    if (!p.unmatched) p.tiers.forEach((t) => {
      if (t.racine === '401' && t.s > 0) push('achats', 'deb:' + t.num, `Facture ${t.lib} correspondant au paiement de ${eur(t.s)} € (compte fournisseur débiteur : payé mais non facturé)`);
      if (t.racine === '411' && t.s < 0 && !pharma) push('ventes', 'cred:' + t.num, `Facture ou avoir ${t.lib} : règlement de ${eur(-t.s)} € reçu sans facture correspondante`);
    });

    // Archive de justificatifs : écritures sans pièce (exact), à la place de la liste des dépenses payées directement
    const exact = justifOk(r);
    justifPieces(r, push, r.meta.start || '0000-00-00', arrete, 'per');

    // Abonnements (montant mensuel stable) dont des factures manquent ; jamais d'estimation pour les dépenses ponctuelles
    p.suppliers.forEach((sp) => {
      const sub = !asked.has('401|' + sp.num) && subscriptionGaps(sp, endYm);
      if (sub && sub.missing.length) push('achats', sp.num, `Factures ${sp.lib} : ${fmtMonths(sub.missing)} (abonnement de ${eur(sub.med)} € par mois)`);
    });
    if (pharma && r.aging) pharmaPieces(r, mode, arrete, push);
    cyclePieces(r, mode, arrete, push);
    // Éléments marqués « pièce demandée » dans la feuille de travail
    if (ui.fec && ui.fec.result === r) Object.values(wpStore().items).forEach((it) => Object.entries(it.els || {}).forEach(([ek, el]) => {
      // Texte destiné au client : sans n° de compte ni référence d'écriture interne.
      const txt = String(el.label || '').split(' · ').filter((x) => !/^\d{4,}\b/.test(x) && !/^[A-Z0-9]{1,5} \d+$/.test(x)).join(' · ');
      if (el.st === 'piece') push('questions', 'el:' + ek.slice(0, 80), `Justificatif de l'opération : ${txt}${el.note ? ` — ${el.note}` : ''}`);
    }));

    // Dépenses payées directement (banque ou caisse → charge, sans compte fournisseur)
    (exact ? [] : p.direct).filter((g) => g.first <= arrete).forEach((g, i) => {
      const months = Object.keys(g.months).filter((ym) => ym <= endYm);
      const when = g.count === 1 ? `du ${d(g.first)}` : `: ${g.count} paiements (${fmtMonths(months)})`;
      const label = g.label.replace(/\S*\d\S*/g, '').replace(/\s+/g, ' ').trim() || g.label;
      push('justif', `${g.compte}:${i}`, `Factures « ${label.slice(0, 45)} » ${when}, total ${eur(g.total)} € — ${g.clib}`);
    });

    // Opérations en compte d'attente
    p.attente.filter((l) => l.date <= arrete && !l.lettre && Math.abs(l.soldeCompte) >= 0.01).forEach((l, i) => {
      push('attente', `${l.compte}:${i}`, `Justificatif de l'opération « ${l.lib} » du ${d(l.date)} : ${l.c > 0 ? 'encaissement' : 'paiement'} de ${eur(l.c || l.d)} €`);
    });

    // Immobilisations acquises
    p.immo.filter((l) => l.date <= arrete).forEach((l, i) => {
      push('immo', `${l.compte}:${i}`, `Facture d'acquisition « ${l.lib} » du ${d(l.date)} (${eur(l.montant)} €, ${l.clib})`);
    });

    // Paie
    const payMonths = Object.keys(p.payroll).filter((ym) => ym <= endYm).sort();
    if (payMonths.length >= 3) {
      const missing = monthsBetween(payMonths[0], endYm).filter((ym) => !p.payroll[ym]);
      if (missing.length) push('social', 'paie', `Bulletins et journal de paie : ${fmtMonths(missing)}`);
    }

    // Compte courant d'associé
    const cca = p.cca.filter((l) => l.date <= arrete);
    if (cca.length) {
      const out = cca.reduce((t, l) => t + l.d, 0), inn = cca.reduce((t, l) => t + l.c, 0);
      push('associe', 'mvts', `Justificatifs des ${cca.length} mouvement(s) du compte courant d'associé (retraits ${eur(out)} €, apports ${eur(inn)} €)`);
    }

    // Opérations du relevé bancaire non comptabilisées (rapprochement)
    const rappro = ui.fec && ui.fec.result === r && ui.fec.rappro && ui.fec.rappro.include ? rapproResult() : null;
    if (rappro) rappro.bankOnly.filter((o) => o.date <= arrete).forEach((o, i) => {
      push('releve', `${o.date}:${o.amount}:${i}`, `Justificatif de l'opération bancaire « ${o.label} » du ${d(o.date)} (${o.amount > 0 ? 'encaissement' : 'paiement'} de ${eur(Math.abs(o.amount))} €), non comptabilisée`);
    });

    // Caisse
    if (r.alerts.some((a) => a.label === 'Caisse créditrice')) push('caisse', 'neg', 'Brouillard de caisse et justificatifs des dépenses en espèces (la caisse devient négative à certaines dates)');

    if (bilan) {
      const f = p.flags;
      push('cloture', 'fnp', `Factures fournisseurs reçues après le ${d(arrete)} mais concernant l'exercice (factures non parvenues)`);
      if (!pharma) push('cloture', 'fae', `Prestations réalisées ou marchandises livrées avant le ${d(arrete)} et non encore facturées`);
      if (f.stock && !pharma) push('cloture', 'stock', `Inventaire des stocks et en-cours valorisé au ${d(arrete)}`);
      if (f.emprunt) push('cloture', 'emprunt', `Tableaux d'amortissement des emprunts (capital restant dû au ${d(arrete)})`);
      if (f.leasing) push('cloture', 'leasing', 'Contrats de crédit-bail ou de location financière en cours');
      if (f.salaires) push('cloture', 'cp', `Journal de paie annuel et état des congés payés acquis non pris au ${d(arrete)}`);
      if (f.caisse) push('cloture', 'caisse', `Procès-verbal de caisse (espèces en caisse au ${d(arrete)})`);
      if (f.cca) push('cloture', 'cca', "Relevé du compte courant d'associé et convention de compte courant éventuelle");
      if (f.vehicules) push('cloture', 'vehicules', 'Cartes grises des véhicules de la société');
      if (f.assurance) push('cloture', 'assurance', "Échéanciers des contrats d'assurance (charges constatées d'avance)");
      if (f.taxes) push('cloture', 'taxes', "Avis d'imposition de CFE et de taxe foncière de l'année");
      push('cloture', 'litiges', 'Litiges, contentieux ou événements importants à signaler (provisions éventuelles)');

      // Questions sur les créances et dettes anciennes
      const limit = addDays(arrete, -90);
      p.tiers.filter((t) => t.racine === '411' && !pharma && t.s >= 50 && (t.lastC || t.lastD || '0') < limit).sort((a, b) => b.s - a.s).slice(0, 15).forEach((t) => {
        push('questions', 'cli:' + t.num, `Créance ${t.lib} de ${eur(t.s)} € sans règlement depuis ${t.lastC ? 'le ' + d(t.lastC) : 'le début de l\'exercice'} : toujours recouvrable ?`);
      });
      p.tiers.filter((t) => t.racine === '401' && t.s <= -50 && (t.lastD || t.lastC || '0') < limit).sort((a, b) => a.s - b.s).slice(0, 15).forEach((t) => {
        push('questions', 'four:' + t.num, `Dette ${t.lib} de ${eur(-t.s)} € non réglée depuis ${t.lastD ? 'le ' + d(t.lastD) : 'le début de l\'exercice'} : toujours due (litige, avoir attendu) ?`);
      });
    }
    return items;
  }

  function piecesState() {
    const f = ui.fec;
    if (!f.pieces) f.pieces = { mode: 'bilan', arrete: defaultArrete(f.result, 'bilan'), excluded: new Set() };
    return f.pieces;
  }

  function selectedPieces() {
    const st = piecesState();
    return computePieces(ui.fec.result, st.mode, st.arrete).filter((i) => !st.excluded.has(i.id));
  }

  function piecesText(items) {
    const groups = {};
    items.forEach((i) => (groups[i.cat] = groups[i.cat] || []).push(i.text));
    return Object.keys(PIECES_CATS).filter((k) => groups[k]).map((k) => `${PIECES_CATS[k]} :\n${groups[k].map((t) => `- ${t}`).join('\n')}`).join('\n\n');
  }

  function viewPieces() {
    const f = ui.fec;
    const st = piecesState();
    const items = computePieces(f.result, st.mode, st.arrete);
    const kept = items.filter((i) => !st.excluded.has(i.id));
    const c = clientById(f.clientId);
    const groups = {};
    items.forEach((i) => (groups[i.cat] = groups[i.cat] || []).push(i));
    return `
      <section class="card">
        <h2>Pièces à demander au client</h2>
        <p class="muted small">${st.mode === 'mois'
          ? 'Demande du mois, cycles achats et ventes : factures des fournisseurs et clients habituels absentes, règlements et encaissements sans facture, dépenses payées directement, numéros de facture manquants, opérations à identifier. À envoyer dès la saisie du mois pour anticiper la situation ou le bilan.'
          : "Liste établie à partir des écritures : relevés manquants, factures récurrentes absentes, paiements sans facture, opérations à identifier… Décochez ce qui ne s'applique pas, puis créez la demande."}</p>
        ${st.mode === 'mois' && f.result.pieces.maxOp && f.result.pieces.maxOp < addDays(endOfMonth(`${ymOf(st.arrete)}-01`), -5) ? `<div class="banner warn"><span>Les écritures s'arrêtent au ${fmtDate(f.result.pieces.maxOp)} : seule la partie saisie du mois est analysée.</span></div>` : ''}
        <div class="filters pieces-opts">
          <div class="seg" role="group" aria-label="Travail à préparer">
            <button class="${st.mode === 'mois' ? 'on' : ''}" data-action="pieces-mode" data-mode="mois">Mois</button>
            <button class="${st.mode === 'situation' ? 'on' : ''}" data-action="pieces-mode" data-mode="situation">Situation</button>
            <button class="${st.mode === 'bilan' ? 'on' : ''}" data-action="pieces-mode" data-mode="bilan">Bilan</button>
          </div>
          ${st.mode === 'mois'
            ? `<label class="inline-label">Mois <input type="month" data-pieces="mois" value="${esc(ymOf(st.arrete))}"></label>`
            : `<label class="inline-label">Arrêté au <input type="date" data-pieces="arrete" value="${esc(st.arrete)}"></label>`}
          <span class="muted small">${kept.length} élément(s) retenu(s) sur ${items.length}</span>
        </div>
        ${items.length ? Object.keys(PIECES_CATS).filter((k) => groups[k]).map((k) => `
          <div class="pieces-group">
            <h3>${esc(PIECES_CATS[k])} <span class="count">${groups[k].length}</span></h3>
            ${groups[k].map((i) => `<label class="check piece"><input type="checkbox" data-piece="${esc(i.id)}"${st.excluded.has(i.id) ? '' : ' checked'}><span>${esc(i.text)}</span></label>`).join('')}
          </div>`).join('') : '<p class="muted">Aucun élément manquant détecté pour cette période. 👍</p>'}
        <div class="pieces-actions">
          <button class="btn primary" data-action="pieces-demande"${c && kept.length ? '' : ' disabled'}>${icon('mail')}Créer la demande et préparer le mail</button>
          <button class="btn" data-action="pieces-copy"${kept.length ? '' : ' disabled'}>Copier la liste</button>
          <button class="btn" data-action="pieces-xlsx"${kept.length ? '' : ' disabled'}>Liste Excel pour le client</button>
        </div>
        ${c ? '' : '<p class="muted small">Rattachez l\'analyse à un dossier (en haut de page) pour créer la demande : une mission dont chaque étape est une pièce, avec relance automatique de ce qui manque encore.</p>'}
      </section>
      ${supplierRequestsCard()}`;
  }

  // ---------- Demandes de factures directement aux fournisseurs (laboratoires, grossistes…) ----------

  // Période couverte par la demande : l'exercice jusqu'à la date d'arrêté, ou le mois en mode mensuel.
  function supplierPeriod(r) {
    const st = piecesState();
    if (st.mode === 'mois') return { from: `${ymOf(st.arrete)}-01`, to: endOfMonth(`${ymOf(st.arrete)}-01`) };
    return { from: r.meta.start || r.pieces.minOp || st.arrete, to: st.mode === 'bilan' ? r.meta.closing || st.arrete : st.arrete };
  }

  // Factures manquantes par fournisseur : paiements sans facture et mois d'abonnement absents, sur la période.
  function supplierRequests(r) {
    const { from, to } = supplierPeriod(r);
    const re = ignoredRe();
    const map = new Map();
    const get = (num, lib) => map.get(num) || map.set(num, { num, lib, pays: [], months: [], docs: [] }).get(num);
    (r.pieces.unmatched || []).filter((u) => u.racine === '401' && u.date >= from && u.date <= to).forEach((u) => get(u.num, u.lib).pays.push(u));
    const exact = justifOk(r);
    if (exact) r.cycles.justif.missing.filter((x) => x.kind === 'achat' && x.date >= from && x.date <= to).forEach((x) => get(x.num, x.tlib).docs.push(x));
    const endYm = ymOf(to), startYm = ymOf(from);
    r.pieces.suppliers.forEach((sp) => {
      const sub = subscriptionGaps(sp, endYm);
      const missing = sub ? sub.missing.filter((ym) => ym >= startYm) : [];
      if (missing.length) get(sp.num, sp.lib).months.push(...missing);
    });
    return Array.from(map.values()).filter((x) => !re || !re.test(norm(x.lib)))
      .map((x) => Object.assign(x, { total: x.pays.reduce((t, u) => t + u.amt, 0) }))
      .sort((a, b) => b.total - a.total || a.lib.localeCompare(b.lib, 'fr'));
  }

  // Coordonnées du dossier chez chaque fournisseur (n° de compte client, e-mail), conservées chiffrées dans le dossier.
  const supplierInfo = (c, num) => (c && c.fournisseurs && c.fournisseurs[num]) || {};

  function supplierMail(r, c, x) {
    const s = data.settings;
    const info = supplierInfo(c, x.num);
    const { from, to } = supplierPeriod(r);
    const nom = c ? c.nom : '';
    const periode = `du ${fmtDate(from)} au ${fmtDate(to)}`;
    const lines = [];
    if (x.docs.length) {
      lines.push('- le duplicata des factures suivantes :');
      x.docs.forEach((u) => lines.push(`    • ${u.avoir ? 'avoir' : 'facture'}${u.piece ? ` n° ${u.piece}` : ''} du ${fmtDate(u.date)} : ${eur(Math.abs(u.amt))} €`));
    }
    if (x.pays.length) {
      lines.push('- le duplicata des factures correspondant aux règlements suivants :');
      x.pays.forEach((u) => lines.push(`    • règlement du ${fmtDate(u.date)} : ${eur(u.amt)} €${u.label ? ` (${u.label})` : ''}`));
    }
    if (x.months.length) lines.push(`- les factures de ${fmtMonths(x.months)}`);
    lines.push(`- un relevé de compte (factures, avoirs et règlements) pour la période ${periode}`);
    const subject = `Demande de factures — ${nom}${info.numClient ? ` — compte client n° ${info.numClient}` : ''} — période ${periode}`;
    const body = ['Bonjour,', '',
      `Nous sommes l'expert-comptable de ${nom}${c && c.siren ? ` (SIREN ${c.siren})` : ''}${info.numClient ? `, votre client sous le n° ${info.numClient}` : ''}.`,
      `Afin d'établir ses comptes pour la période ${periode}, pourriez-vous nous adresser :`, '',
      ...lines, '',
      'Vous pouvez nous les transmettre en réponse à ce message.', '',
      'Avec nos remerciements,', s.signature || [s.utilisateur, s.cabinet].filter(Boolean).join('\n')].join('\n');
    return { subject, body, to: info.email || '' };
  }

  function supplierRequestsCard() {
    const f = ui.fec;
    const r = f.result;
    if (!r.pieces.unmatched) return '';
    const c = clientById(f.clientId);
    const list = supplierRequests(r);
    const { from, to } = supplierPeriod(r);
    return `<section class="card">
      <h2>Demandes directes aux fournisseurs <span class="count">${list.length}</span></h2>
      <p class="muted small">Pour les laboratoires, grossistes et autres fournisseurs dont des factures manquent du ${fmtDate(from)} au ${fmtDate(to)} : un mail par fournisseur, avec le n° de compte client du dossier chez lui, la dénomination et la période, demandant le duplicata des factures et un relevé de compte. Le n° client et l'e-mail saisis sont conservés, chiffrés, dans le dossier pour les prochaines demandes. À envoyer avec l'accord du client, dans le cadre de votre mission.</p>
      ${!c ? '<p class="banner info">Rattachez l\'analyse à un dossier (en haut de page) pour enregistrer les n° clients et préparer les mails.</p>' : ''}
      ${list.length ? `<div class="supp-list">${list.map((x) => {
        const info = supplierInfo(c, x.num);
        const what = [x.docs.length ? `${x.docs.length} facture(s) sans justificatif` : '', x.pays.length ? `${x.pays.length} règlement(s) sans facture, ${eur(x.total)} €` : '', x.months.length ? `factures de ${fmtMonths(x.months)}` : ''].filter(Boolean).join(' · ');
        return `<div class="supp-row">
          <div class="supp-name"><strong>${esc(x.lib)}</strong> <span class="muted small">${esc(x.num)}</span><div class="muted small">${esc(what)}${info.sentAt ? ` · demandé le ${fmtDate(info.sentAt.slice(0, 10))}` : ''}</div></div>
          <label class="inline-label">N° client <input type="text" data-supp="numClient" data-k="${esc(x.num)}" data-lib="${esc(x.lib)}" value="${esc(info.numClient || '')}" placeholder="chez ce fournisseur" spellcheck="false"${c ? '' : ' disabled'}></label>
          <label class="inline-label">E-mail <input type="email" data-supp="email" data-k="${esc(x.num)}" data-lib="${esc(x.lib)}" value="${esc(info.email || '')}" placeholder="comptabilite@…" spellcheck="false"${c ? '' : ' disabled'}></label>
          <span class="supp-actions">
            <button class="btn small primary" data-action="supp-mail" data-k="${esc(x.num)}"${c ? '' : ' disabled'}>${icon('mail')}Mail</button>
            <button class="btn small" data-action="supp-copy" data-k="${esc(x.num)}"${c ? '' : ' disabled'}>Copier</button>
          </span>
        </div>`;
      }).join('')}</div>` : '<p class="muted">Aucune facture fournisseur manquante sur la période.</p>'}
    </section>`;
  }

  function supplierSend(num, copy) {
    const f = ui.fec;
    const c = clientById(f.clientId);
    const x = supplierRequests(f.result).find((y) => y.num === num);
    if (!c || !x) return;
    const mail = supplierMail(f.result, c, x);
    c.fournisseurs = c.fournisseurs || {};
    c.fournisseurs[num] = Object.assign(c.fournisseurs[num] || {}, { lib: x.lib, sentAt: nowIso() });
    log(c.id, `Demande de factures adressée au fournisseur ${x.lib} (${x.docs.length} facture(s), ${x.pays.length} règlement(s), ${x.months.length} mois).`, true);
    persist();
    if (copy) {
      const text = `Objet : ${mail.subject}\n\n${mail.body}`;
      navigator.clipboard.writeText(text).then(() => toast(`Mail pour ${x.lib} copié : collez-le dans votre messagerie.`), () => toast('Copie impossible sur ce navigateur.', true));
      refresh();
      return;
    }
    refresh();
    window.location.href = `mailto:${encodeURIComponent(mail.to).replace(/%40/g, '@')}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`;
    toast(`Messagerie ouverte pour ${x.lib}. Demande notée dans le journal du dossier.`);
  }

  function createPiecesRequest() {
    const f = ui.fec;
    const c = clientById(f.clientId);
    const st = piecesState();
    const items = selectedPieces();
    if (!c || !items.length) return;
    const label = piecesLabel(st.mode, st.arrete);
    const titre = `Demande de pièces — ${label}`;
    const stamp = nowIso();
    let m = missionsOf(c.id).find((x) => x.titre === titre && isOpen(x));
    const steps = items.map((i) => ({ id: uid(), label: i.text, cat: PIECES_CATS[i.cat], done: false, doneAt: null }));
    if (m) {
      m.etapes = m.etapes.concat(steps.filter((e) => !m.etapes.some((x) => x.label === e.label)));
      m.updatedAt = stamp;
    } else {
      m = {
        id: uid(), clientId: c.id, type: 'libre', titre, exercice: st.arrete.slice(0, 4), echeance: addDays(todayStr(), 10),
        statut: 'a_faire', priorite: 'normale', responsable: c.responsable || c.collaborateur || data.settings.utilisateur,
        recurrence: 'aucune', notes: `Liste établie à partir du FEC ${f.result.meta.fileName} le ${fmtDate(todayStr())}. Cochez chaque pièce à sa réception.`,
        suiteCreee: false, termineLe: null, createdAt: stamp, updatedAt: stamp, etapes: steps,
        demandePieces: { mode: st.mode, arrete: st.arrete },
      };
      data.missions.push(m);
      log(c.id, `Demande de pièces préparée (${label}) : ${steps.length} élément(s).`, true);
    }
    persist();
    openMessage(c.id, m.id);
  }

  function exportPiecesXlsx() {
    const f = ui.fec;
    const st = piecesState();
    const items = selectedPieces();
    const c = clientById(f.clientId);
    const t = (v, s) => ({ v, s: s === undefined ? 2 : s });
    const rows = [[{ v: `Pièces à fournir — ${piecesLabel(st.mode, st.arrete)}${c ? ' — ' + c.nom : ''}`, s: 10 }], [],
      [t('Catégorie', 1), t('Élément demandé', 1), t('Fourni', 1), t('Commentaire', 1)]]
      .concat(items.map((i) => [t(PIECES_CATS[i.cat]), t(i.text), t(''), t('')]));
    const blob = XlsxWriter.build({ sheets: [{ name: 'Pièces à fournir', rows, widths: [30, 110, 10, 40], freeze: { row: 3 }, filter: { row: 3 } }] });
    download(`pieces-a-fournir-${st.arrete}.xlsx`, blob, blob.type);
  }

  // ---------- Revue analytique N / N-1 et contrôles de cohérence ----------

  const RUBRIQUES = {
    10: 'Capital et réserves', 11: 'Report à nouveau', 12: 'Résultat', 13: "Subventions d'investissement", 14: 'Provisions réglementées',
    15: 'Provisions pour risques et charges', 16: 'Emprunts et dettes assimilées', 17: 'Dettes rattachées à des participations',
    20: 'Immobilisations incorporelles', 21: 'Immobilisations corporelles', 23: 'Immobilisations en cours', 26: 'Participations',
    27: 'Autres immobilisations financières', 28: 'Amortissements des immobilisations', 29: 'Dépréciations des immobilisations',
    31: 'Matières premières', 33: 'En-cours de production', 35: 'Stocks de produits', 37: 'Stocks de marchandises', 39: 'Dépréciations des stocks',
    40: 'Fournisseurs', 41: 'Clients', 42: 'Personnel', 43: 'Organismes sociaux', 44: 'État et collectivités', 45: 'Groupe et associés',
    46: 'Débiteurs et créditeurs divers', 47: "Comptes d'attente et de régularisation", 48: 'Comptes de régularisation', 49: 'Dépréciations des comptes de tiers',
    50: 'Valeurs mobilières de placement', 51: 'Banques', 53: 'Caisse', 58: 'Virements internes',
    60: 'Achats', 61: 'Services extérieurs', 62: 'Autres services extérieurs', 63: 'Impôts et taxes', 64: 'Charges de personnel',
    65: 'Autres charges de gestion courante', 66: 'Charges financières', 67: 'Charges exceptionnelles', 68: 'Dotations aux amortissements et provisions',
    69: 'Participation et impôt sur les bénéfices', 70: "Chiffre d'affaires", 71: 'Production stockée', 72: 'Production immobilisée',
    74: "Subventions d'exploitation", 75: 'Autres produits de gestion courante', 76: 'Produits financiers', 77: 'Produits exceptionnels',
    78: 'Reprises sur amortissements et provisions', 79: 'Transferts de charges',
  };

  // Valeur « naturelle » d'un compte : charges au débit, produits au crédit, bilan en solde débiteur (+) / créditeur (-).
  const acctValue = (b) => (b.compte[0] === '7' ? -b.s : b.s);

  function revueData(r, prev, seuil, seuilPct) {
    const byAcc = new Map();
    r.balance.forEach((b) => byAcc.set(b.compte, { compte: b.compte, lib: b.lib, n: acctValue(b), n1: 0 }));
    if (prev) prev.balance.forEach((b) => {
      const x = byAcc.get(b.compte) || { compte: b.compte, lib: b.lib, n: 0, n1: 0 };
      x.n1 = acctValue(b);
      byAcc.set(b.compte, x);
    });
    const accounts = Array.from(byAcc.values()).map((x) => {
      const delta = Math.round((x.n - x.n1) * 100) / 100;
      const pct = x.n1 ? delta / Math.abs(x.n1) : null;
      const flagged = !!prev && Math.abs(delta) >= seuil && (pct === null || Math.abs(pct) >= seuilPct);
      return Object.assign(x, { delta, pct, flagged, rub: x.compte.slice(0, 2) });
    }).sort((a, b) => a.compte.localeCompare(b.compte));
    const rubs = new Map();
    accounts.forEach((a) => {
      if (!RUBRIQUES[a.rub]) return;
      const g = rubs.get(a.rub) || { code: a.rub, label: RUBRIQUES[a.rub], n: 0, n1: 0, accounts: [] };
      g.n += a.n;
      g.n1 += a.n1;
      g.accounts.push(a);
      rubs.set(a.rub, g);
    });
    const rubriques = Array.from(rubs.values()).map((g) => {
      const delta = g.n - g.n1;
      return Object.assign(g, { delta, pct: g.n1 ? delta / Math.abs(g.n1) : null, flagged: g.accounts.some((a) => a.flagged) });
    }).sort((a, b) => a.code.localeCompare(b.code));
    return { accounts, rubriques, flagged: accounts.filter((a) => a.flagged).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)) };
  }

  function defaultSeuil(r) {
    const base = Math.max(r.kpi.ca, 0) || r.balance.filter((b) => b.compte[0] === '6').reduce((t, b) => t + Math.max(b.s, 0), 0);
    return Math.max(500, Math.round((base * 0.01) / 100) * 100);
  }

  // Sommes par préfixes de compte : mouvements de l'exercice (hors à-nouveaux) ou solde de fin.
  function sums(r) {
    const match = (b, pref, excl) => pref.some((p) => b.compte.startsWith(p)) && !(excl || []).some((p) => b.compte.startsWith(p));
    return {
      mv: (pref, excl) => r.balance.reduce((t, b) => (match(b, pref, excl) ? t + (b.dm - b.cm) : t), 0),
      solde: (pref, excl) => r.balance.reduce((t, b) => (match(b, pref, excl) ? t + b.s : t), 0),
      opening: (pref, excl) => r.balance.reduce((t, b) => (match(b, pref, excl) ? t + b.an : t), 0),
    };
  }

  function ratios(r) {
    const { mv, solde } = sums(r);
    const ca = r.kpi.ca;
    const achatsTTC = (mv(['60', '61', '62']) || 0) * 1.2;
    const cp = r.bilan.passif[0][1];
    const dettesFin = r.bilan.passif[2][1];
    const ventesMarch = -mv(['707', '7097']);
    return {
      // Taux de marge seulement si la vente de marchandises est une activité significative.
      tauxMarge: ventesMarch > 0 && ventesMarch >= ca * 0.1 ? r.kpi.marge / ventesMarch : null,
      ebeCa: ca > 0 ? r.kpi.ebe / ca : null,
      resCa: ca > 0 ? r.kpi.resultat / ca : null,
      dso: ca > 0 ? (Math.max(solde(['411']), 0) / (ca * 1.2)) * 365 : null,
      dpo: achatsTTC > 0 ? (Math.max(-solde(['401']), 0) / achatsTTC) * 365 : null,
      endettement: cp > 0 ? dettesFin / cp : null,
      cp, dettesFin,
    };
  }

  function coherenceChecks(r, prev, client) {
    const out = [];
    const add = (level, label, detail) => out.push({ level, label, detail, examples: [], count: 0 });
    const { mv, solde } = sums(r);
    const pctTxt = (x) => (x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %';
    const ca = r.kpi.ca;

    // TVA
    const collectee = -mv(['4457']);
    const deductible = mv(['4456']);
    const franchise = client && /franchise|non assujetti/i.test(client.regimeTva || '');
    if (ca > 1000 && !franchise && ui.fecProfile !== 'pharmacie') {
      const taux = collectee / ca;
      if (collectee <= 0) add('warn', 'Aucune TVA collectée', `CA de ${eur(ca, 0)} € sans TVA collectée (4457) : activité exonérée, autoliquidation, ou TVA non comptabilisée ?`);
      else if (taux < 0.04 || taux > 0.205) add('warn', 'Taux apparent de TVA collectée atypique', `TVA collectée ${eur(collectee, 0)} € pour un CA de ${eur(ca, 0)} € (${pctTxt(taux)}) : vérifier les taux appliqués et les opérations exonérées.`);
      else add('ok', 'Taux apparent de TVA collectée cohérent', `${pctTxt(taux)} du chiffre d'affaires.`);
    }
    const reste4457 = -solde(['4457']);
    if (collectee > 0 && reste4457 > collectee * 0.35) add('warn', 'TVA collectée non reversée', `Solde de ${eur(reste4457, 0)} € en 4457 en fin de période, soit plus de 4 mois de TVA : déclarations manquantes ou écritures de liquidation non passées ?`);
    const reste4456 = solde(['4456']);
    if (deductible > 0 && reste4456 > deductible * 0.35) add('warn', 'TVA déductible non récupérée', `Solde de ${eur(reste4456, 0)} € en 4456 en fin de période, soit plus de 4 mois de TVA déductible.`);

    // Social
    const salaires = mv(['641', '644']);
    const charges = mv(['645', '646', '647']);
    if (salaires > 0) {
      const tx = charges / salaires;
      if (charges <= 0) add('warn', 'Salaires sans charges sociales', `${eur(salaires, 0)} € de rémunérations sans charges sociales comptabilisées (645).`);
      else if (tx < 0.2 || tx > 0.65) add('warn', 'Ratio charges sociales / salaires atypique', `${pctTxt(tx)} (habituellement 25 à 50 %) : vérifier les écritures de paie et les exonérations.`);
      else add('ok', 'Charges sociales cohérentes avec les salaires', `${pctTxt(tx)} des rémunérations.`);
      const du421 = -solde(['421']);
      if (du421 > (salaires / 12) * 1.5) add('warn', 'Salaires restant dus', `${eur(du421, 0)} € au crédit du 421 : plus d'un mois de salaires non versés ?`);
    }

    // Amortissements
    const immoAmort = solde(['21']);
    const dotations = mv(['6811', '6812']);
    if (immoAmort > 0 && dotations <= 0) add('warn', 'Pas de dotation aux amortissements', `Immobilisations corporelles de ${eur(immoAmort, 0)} € sans dotation (6811) : amortissements à comptabiliser à la clôture.`);
    else if (immoAmort > 0) add('ok', 'Dotations aux amortissements comptabilisées', `${eur(dotations, 0)} €, soit ${pctTxt(dotations / immoAmort)} des immobilisations corporelles brutes.`);

    // Emprunts
    const emprunts = -solde(['164', '165', '166', '167', '168']);
    const empruntsDebut = -sums(r).opening(['164', '165', '166', '167', '168']);
    const interets = mv(['6611', '6616']);
    if (emprunts > 0 || empruntsDebut > 0) {
      const moyen = (emprunts + empruntsDebut) / 2 || emprunts;
      if (interets <= 0) add('warn', "Emprunts sans intérêts comptabilisés", `Emprunts de ${eur(Math.max(emprunts, empruntsDebut), 0)} € sans intérêts en 6611 : échéances non ventilées capital / intérêts ?`);
      else if (moyen > 0 && interets / moyen > 0.1) add('warn', "Taux d'intérêt apparent élevé", `${pctTxt(interets / moyen)} de l'encours moyen : vérifier la ventilation des échéances.`);
      else if (moyen > 0) add('ok', 'Intérêts cohérents avec les emprunts', `Taux apparent ${pctTxt(interets / moyen)}.`);
    }

    // Capitaux propres
    const capital = -solde(['101', '108']);
    const cp = r.bilan.passif[0][1];
    if (r.meta.hasAN && capital > 0 && cp < capital / 2) {
      add('error', 'Capitaux propres inférieurs à la moitié du capital social', `Capitaux propres ${eur(cp, 0)} € pour un capital de ${eur(capital, 0)} € : consultation des associés dans les 4 mois de l'approbation des comptes (art. L223-42 / L225-248 C. com.).`);
    } else if (r.meta.hasAN && cp < 0) add('error', 'Capitaux propres négatifs', `${eur(cp, 0)} €.`);

    // Impôt sur les sociétés
    const is = mv(['695', '696', '697', '698', '699']);
    if (r.kpi.resultat > 0 && is <= 0 && client && norm(client.regimeFiscal) === 'is') add('info', "Impôt sur les sociétés non comptabilisé", "Résultat bénéficiaire sans IS en 695 : à calculer et comptabiliser à la clôture.");

    // Mois sans chiffre d'affaires
    const period = r.monthly.filter((m) => !r.meta.closing || m.mois <= r.meta.closing.slice(0, 7));
    const sansCa = period.filter((m) => m.ca <= 0).map((m) => m.mois);
    if (ca > 0 && sansCa.length && sansCa.length < period.length) add('info', "Mois sans chiffre d'affaires", `${fmtMonths(sansCa)} : activité saisonnière ou factures non saisies ?`);

    // Points fiscaux
    const fisc = [
      [['6712', '6711'], 'Pénalités et amendes', 'non déductibles : à réintégrer sur la 2058-A'],
      [['6234'], 'Cadeaux à la clientèle', 'TVA récupérable seulement si ≤ 73 € TTC par bénéficiaire et par an ; relevé des frais généraux si seuil dépassé'],
      [['6238', '6713'], 'Dons', 'réduction d\'impôt mécénat possible (2069-RCI), non déductibles du résultat'],
      [['6226', '6227', '6228', '622'], 'Honoraires', 'DAS2 à déposer pour chaque bénéficiaire ayant reçu plus de 1 200 €'],
      [['6615'], 'Intérêts des comptes courants', 'vérifier le taux maximal déductible et la libération du capital'],
      [['6354'], 'Taxes sur les véhicules', 'non déductibles (taxes annuelles sur les véhicules de tourisme)'],
    ];
    fisc.forEach(([pref, label, detail]) => {
      const v = mv(pref);
      if (v > (label === 'Honoraires' ? 1200 : 0)) add('info', `${label} : ${eur(v, 0)} €`, detail);
    });

    // Comparaison N-1
    if (prev) {
      const d = (a, b) => (b ? (a - b) / Math.abs(b) : null);
      const vCa = d(r.kpi.ca, prev.kpi.ca);
      if (vCa !== null && Math.abs(vCa) >= 0.2) add('info', `Chiffre d'affaires ${vCa > 0 ? 'en hausse' : 'en baisse'} de ${pctTxt(Math.abs(vCa))}`, `${eur(prev.kpi.ca, 0)} € → ${eur(r.kpi.ca, 0)} €`);
      const rn = ratios(r), rp = ratios(prev);
      if (rn.tauxMarge !== null && rp.tauxMarge !== null && Math.abs(rn.tauxMarge - rp.tauxMarge) >= 0.05) add('warn', 'Taux de marge commerciale en forte variation', `${pctTxt(rp.tauxMarge)} → ${pctTxt(rn.tauxMarge)} : stock, prix d'achat, ou achats non rattachés à l'exercice ?`);
      if (rn.dso !== null && rp.dso !== null && rn.dso - rp.dso > 20) add('info', 'Délai de paiement clients allongé', `${Math.round(rp.dso)} j → ${Math.round(rn.dso)} j : créances à surveiller (dépréciation ?).`);
      if (prev.meta.closing && r.meta.closing) {
        const gap = daysUntilFrom(prev.meta.closing, r.meta.closing);
        if (gap < 330 || gap > 400) add('warn', 'Exercices non consécutifs', `Clôtures du ${fmtDate(prev.meta.closing)} et du ${fmtDate(r.meta.closing)} : vérifier que le FEC N-1 est le bon.`);
      }
      if (prev.meta.siren && r.meta.siren && prev.meta.siren !== r.meta.siren) add('error', 'SIREN différents', `Le FEC N-1 (${prev.meta.siren}) ne correspond pas au même dossier (${r.meta.siren}).`);
    }
    return out;
  }

  function revueComments() {
    const f = ui.fec;
    const c = clientById(f.clientId);
    const key = f.result.meta.closing || f.result.meta.fileName;
    if (c) {
      c.revue = c.revue || {};
      c.revue[key] = c.revue[key] || { comments: {}, note: '' };
      return c.revue[key];
    }
    f.revueLocal = f.revueLocal || { comments: {}, note: '' };
    return f.revueLocal;
  }

  function pctCell(p) {
    if (p === null || p === undefined) return '<td class="muted">—</td>';
    return `<td class="${p > 0 ? 'up' : p < 0 ? 'down' : ''}">${p > 0 ? '+' : ''}${(p * 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} %</td>`;
  }

  // Situation : projection de fin d'exercice (reste à courir N-1) et charges annuelles absentes à étaler.
  function projection(r) {
    const f = ui.fec;
    if (!isSituation(r) || !f.prev || !f.prevSame || !r.meta.start) return null;
    const full = f.prev, same = f.prevSame;
    const val = (res) => {
      const m = new Map();
      res.balance.forEach((b) => { if (/^[67]/.test(b.compte)) m.set(b.compte, { lib: b.lib, v: acctValue(b) }); });
      return m;
    };
    const N = val(r), F = val(full), S = val(same);
    const rub = {};
    const addR = (map, k) => map.forEach((x, c) => {
      const code = c.slice(0, 2);
      (rub[code] = rub[code] || { code, label: RUBRIQUES[code] || '', n: 0, s: 0, f: 0 })[k] += x.v;
    });
    addR(N, 'n'); addR(S, 's'); addR(F, 'f');
    const rows = Object.values(rub).sort((a, b) => a.code.localeCompare(b.code)).map((x) => Object.assign(x, { reste: x.f - x.s, proj: x.n + x.f - x.s }));
    const span = daysUntilFrom(r.meta.start, r.meta.closing) + 1;
    const ratio = Math.min(1, Math.max(0, (daysUntilFrom(r.meta.start, r.pieces.maxOp) + 1) / span));
    const totalCh = Array.from(F.entries()).filter(([c]) => c[0] === '6').reduce((t, [, x]) => t + Math.max(0, x.v), 0);
    const annual = [];
    F.forEach((x, c) => {
      if (c[0] !== '6' || /^69/.test(c) || x.v < Math.max(500, totalCh * 0.005)) return;
      const sv = (S.get(c) || {}).v || 0, nv = (N.get(c) || {}).v || 0;
      if (sv <= x.v * 0.1 && nv <= x.v * 0.1) annual.push({ compte: c, lib: x.lib, full: round2(x.v), n: round2(nv), prorata: round2(x.v * ratio - nv) });
    });
    annual.sort((a, b) => b.full - a.full);
    const proj = r.kpi.resultat + full.kpi.resultat - same.kpi.resultat;
    return { rows, annual: annual.filter((a) => a.prorata >= 1), ratio, until: f.prevUntil, full, same, proj, apresProrata: r.kpi.resultat - annual.reduce((t, a) => t + Math.max(0, a.prorata), 0) };
  }

  function projectionCard(r) {
    const pj = projection(r);
    if (!pj) return '';
    const yN = (r.meta.closing || '').slice(0, 4), yP = (pj.full.meta.closing || '').slice(0, 4);
    return `<section class="card"><h2>Projection de fin d'exercice</h2>
      <p class="muted small">Situation au ${fmtDate(r.pieces.maxOp)} (${Math.round(pj.ratio * 100)} % de l'exercice). Projection = situation + ce que l'exercice ${yP} a enregistré entre le ${fmtDate(addDays(pj.until, 1))} et la clôture (reste à courir N-1). Indicatif : à corriger des événements connus de l'exercice.</p>
      <div class="kpis fec-kpis">
        ${kpiTile('Résultat de la situation', eurK(r.kpi.resultat), r.kpi.resultat < 0 ? 'kpi-late' : '', eurK(pj.same.kpi.resultat))}
        ${kpiTile('Après charges annuelles au prorata', eurK(pj.apresProrata), pj.apresProrata < 0 ? 'kpi-late' : '')}
        ${kpiTile(`Résultat ${yN} projeté`, eurK(pj.proj), pj.proj < 0 ? 'kpi-late' : '', eurK(pj.full.kpi.resultat))}
      </div>
      <div class="grid-wrap"><table class="dtable num revue"><thead><tr><th>Poste</th><th>Libellé</th><th>Situation ${yN}</th><th>${yP} même période</th><th>${yP} complet</th><th>Reste à courir ${yP}</th><th>Projection ${yN}</th></tr></thead>
        <tbody>${pj.rows.map((x) => `<tr><td>${x.code}</td><td>${esc(x.label)}</td><td>${eur(x.n, 0)}</td><td>${eur(x.s, 0)}</td><td>${eur(x.f, 0)}</td><td>${eur(x.reste, 0)}</td><td>${eur(x.proj, 0)}</td></tr>`).join('')}</tbody></table></div>
      ${pj.annual.length ? `<h3>Charges annuelles absentes de la situation</h3>
        <p class="muted small">Comptabilisées en ${yP} après le ${fmtDate(pj.until)} (dotations, impôts et taxes, assurances, primes…) : à étaler dans la situation. Les écritures au prorata sont proposées dans l'onglet Écritures.</p>
        <div class="grid-wrap"><table class="dtable num"><thead><tr><th>Compte</th><th>Libellé</th><th>${yP} complet</th><th>Déjà en ${yN}</th><th>Prorata à passer</th></tr></thead>
        <tbody>${pj.annual.map((a) => `<tr><td>${esc(a.compte)}</td><td>${esc(a.lib)}</td><td>${eur(a.full, 0)}</td><td>${eur(a.n, 0)}</td><td>${eur(a.prorata, 0)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    </section>`;
  }

  function viewRevue() {
    const f = ui.fec;
    const r = f.result;
    const prev = cmpPrev();
    f.seuil = f.seuil || defaultSeuil(r);
    const rd = revueData(r, prev, f.seuil, 0.2);
    const checks = coherenceChecks(r, prev, clientById(f.clientId));
    const store = revueComments();
    const yearN = (r.meta.closing || r.meta.maxDate || '').slice(0, 4);
    const yearP = prev ? (prev.meta.closing || prev.meta.maxDate || '').slice(0, 4) : '';
    const loadCard = `
      <div class="revue-load">
        ${prev ? `<span>Comparé à <strong>${esc(f.prevName)}</strong> (${prev.meta.lines.toLocaleString('fr-FR')} lignes)</span><button class="btn small" data-action="fec-prev">Changer le FEC N-1</button>`
          : f.prevStatus === 'loading' ? `<span class="muted">Analyse du FEC N-1 en cours…</span>`
          : `<span>${f.prevStatus === 'error' ? `<span class="late">${esc(f.prevError)}</span> ` : ''}Ajoutez le FEC de l'exercice précédent pour comparer les comptes et repérer les variations à justifier.</span><button class="btn primary small" data-action="fec-prev">Charger le FEC N-1</button>`}
        <button class="btn small" data-action="fec-note">Note de synthèse</button>
      </div>
      ${f.prev && isSituation(r) ? `<div class="filters revue-mode">
        <div class="seg" role="group" aria-label="Période de comparaison">
          <button class="${f.prevMode !== 'full' ? 'on' : ''}" data-action="prev-mode" data-mode="same"${f.prevSame ? '' : ' disabled'}>Même période N-1${f.prevUntil ? ` (au ${fmtDate(f.prevUntil)})` : ''}</button>
          <button class="${f.prevMode === 'full' ? 'on' : ''}" data-action="prev-mode" data-mode="full">Exercice N-1 complet</button>
        </div>
        <span class="muted small">${f.prevSameStatus === 'loading' ? 'Analyse du FEC N-1 à la même date en cours…' : f.prevSameStatus === 'error' ? 'Analyse à la même date impossible.' : `Situation au ${fmtDate(r.pieces.maxOp)} : comparée ${f.prevMode === 'full' ? "à l'exercice précédent entier" : 'à la même période de l\'exercice précédent'}.`}</span>
      </div>` : ''}`;
    const sigRows = r.sig.filter((x) => x.strong || x.label === 'Chiffre d\'affaires net').map((x) => {
      const p = prev && prev.sig.find((y) => y.label === x.label);
      const v1 = p ? p.value : null;
      return `<tr class="${x.strong ? 'strong' : ''}"><td>${esc(x.label)}</td><td>${eur(x.value, 0)}</td>${prev ? `<td>${eur(v1, 0)}</td><td>${eur(x.value - v1, 0)}</td>${pctCell(v1 ? (x.value - v1) / Math.abs(v1) : null)}` : ''}</tr>`;
    }).join('');
    return `
      <section class="card">${loadCard}</section>
      ${projectionCard(r)}
      <section class="card"><h2>Contrôles de cohérence</h2>${checkList(checks, true)}</section>
      <section class="card"><h2>Chiffres clés ${prev ? `${yearN} / ${yearP}` : yearN}</h2>
        <div class="grid-wrap"><table class="dtable num sig"><thead><tr><th>Solde</th><th>${yearN}</th>${prev ? `<th>${yearP}</th><th>Variation</th><th>%</th>` : ''}</tr></thead><tbody>${sigRows}</tbody></table></div>
      </section>
      ${prev ? `
      <section class="card">
        <h2>Variations significatives à justifier <span class="count">${rd.flagged.length}</span></h2>
        <div class="filters">
          <label class="inline-label">Seuil de signification <input type="number" min="0" step="100" data-revue="seuil" value="${f.seuil}"> €</label>
          <span class="muted small">et variation d'au moins 20 %. Vos commentaires sont enregistrés${clientById(f.clientId) ? ' dans le dossier' : ' (rattachez un dossier pour les conserver)'} et repris dans la note de synthèse.</span>
        </div>
        ${rd.flagged.length ? `<div class="grid-wrap"><table class="dtable num revue"><thead><tr><th>Compte</th><th>Libellé</th><th>${yearN}</th><th>${yearP}</th><th>Variation</th><th>%</th><th>Justification</th></tr></thead>
          <tbody>${rd.flagged.map((a) => `<tr><td>${esc(a.compte)}</td><td>${esc(a.lib)}</td><td>${eur(a.n, 0)}</td><td>${eur(a.n1, 0)}</td><td>${eur(a.delta, 0)}</td>${pctCell(a.pct)}
            <td class="comment"><input data-comment="${esc(a.compte)}" value="${esc(store.comments[a.compte] || '')}" placeholder="Explication…" spellcheck="false" autocomplete="off"></td></tr>`).join('')}</tbody></table></div>`
          : '<p class="muted">Aucune variation significative au regard du seuil choisi.</p>'}
      </section>
      <section class="card"><h2>Comparatif par poste</h2>
        <div class="grid-wrap"><table class="dtable num revue"><thead><tr><th>Poste</th><th>Libellé</th><th>${yearN}</th><th>${yearP}</th><th>Variation</th><th>%</th></tr></thead>
          <tbody>${rd.rubriques.map((g) => `<tr class="${g.flagged ? 'flag' : ''}"><td>${g.code}</td><td>${esc(g.label)}${g.flagged ? ' <span class="lvl lvl-warn"><b aria-hidden="true">!</b>À justifier</span>' : ''}</td><td>${eur(g.n, 0)}</td><td>${eur(g.n1, 0)}</td><td>${eur(g.delta, 0)}</td>${pctCell(g.pct)}</tr>`).join('')}</tbody></table></div>
        <p class="muted small">Charges au débit, produits au crédit ; comptes de bilan : solde débiteur positif, créditeur négatif.</p>
      </section>` : ''}`;
  }

  // ---------- Note de synthèse (impression / PDF) ----------

  function noteHtml() {
    const f = ui.fec;
    const r = f.result;
    const prev = cmpPrev();
    const c = clientById(f.clientId);
    const s = data.settings;
    const store = revueComments();
    const yearN = r.meta.closing ? `clos le ${fmtDate(r.meta.closing)}` : '';
    const rn = ratios(r), rp = prev ? ratios(prev) : null;
    const pct = (x) => (x === null || x === undefined ? '—' : (x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %');
    const days = (x) => (x === null || x === undefined ? '—' : Math.round(x) + ' j');
    const line = (label, n, p, fmt) => `<tr><td>${esc(label)}</td><td>${fmt ? fmt(n) : eur(n, 0) + ' €'}</td>${prev ? `<td>${fmt ? fmt(p) : eur(p, 0) + ' €'}</td><td>${fmt ? '' : (p ? ((n - p) / Math.abs(p) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' %' : '—')}</td>` : ''}</tr>`;
    const k = r.kpi, kp = prev ? prev.kpi : {};
    const facts = [];
    if (prev) {
      const v = (a, b) => (b ? (a - b) / Math.abs(b) : null);
      const vc = v(k.ca, kp.ca);
      if (vc !== null) facts.push(`Le chiffre d'affaires s'établit à ${eur(k.ca, 0)} €, ${Math.abs(vc) < 0.02 ? 'stable' : `${vc > 0 ? 'en hausse' : 'en baisse'} de ${pct(Math.abs(vc))}`} par rapport à l'exercice précédent.`);
      const vr = k.resultat - kp.resultat;
      facts.push(`Le résultat ${k.resultat >= 0 ? 'bénéficiaire' : 'déficitaire'} de ${eur(Math.abs(k.resultat), 0)} € ${vr >= 0 ? 'progresse' : 'recule'} de ${eur(Math.abs(vr), 0)} €.`);
      const vt = k.tresorerie - kp.tresorerie;
      facts.push(`La trésorerie ${vt >= 0 ? 'augmente' : 'diminue'} de ${eur(Math.abs(vt), 0)} € pour atteindre ${eur(k.tresorerie, 0)} €.`);
    } else {
      facts.push(`Le chiffre d'affaires s'établit à ${eur(k.ca, 0)} € et le résultat à ${eur(k.resultat, 0)} €.`);
    }
    const rd = prev ? revueData(r, prev, f.seuil || defaultSeuil(r), 0.2) : null;
    const justified = rd ? rd.flagged.filter((a) => store.comments[a.compte]).slice(0, 8) : [];
    const attention = coherenceChecks(r, prev, c).concat(fecPoints(r)).filter((x) => x.level === 'error' || x.level === 'warn');
    return `
      <article class="note">
        <header class="note-head">
          <div><div class="note-cab">${esc(s.cabinet || '')}</div><h1>Note de synthèse</h1>
          <div class="note-sub">${esc(c ? c.nom : r.meta.fileName)} — exercice ${esc(yearN)}</div></div>
          <div class="note-date">${fmtDate(todayStr())}</div>
        </header>
        <h2>Chiffres clés</h2>
        <table class="note-table"><thead><tr><th></th><th>Exercice</th>${prev ? '<th>Précédent</th><th>Variation</th>' : ''}</tr></thead><tbody>
          ${line("Chiffre d'affaires", k.ca, kp.ca)}${rn.tauxMarge !== null ? line('Marge commerciale', k.marge, kp.marge) : ''}${line('Valeur ajoutée', k.va, kp.va)}
          ${line("Excédent brut d'exploitation", k.ebe, kp.ebe)}${line("Résultat d'exploitation", k.rex, kp.rex)}${line('Résultat net', k.resultat, kp.resultat)}
          ${line('Capitaux propres', rn.cp, rp && rp.cp)}${line('Dettes financières', rn.dettesFin, rp && rp.dettesFin)}${line('Trésorerie', k.tresorerie, kp.tresorerie)}
        </tbody></table>
        <h2>Indicateurs</h2>
        <table class="note-table"><tbody>
          ${rn.tauxMarge !== null ? line('Taux de marge commerciale', rn.tauxMarge, rp && rp.tauxMarge, pct) : ''}
          ${line("EBE / chiffre d'affaires", rn.ebeCa, rp && rp.ebeCa, pct)}${line("Résultat / chiffre d'affaires", rn.resCa, rp && rp.resCa, pct)}
          ${line('Délai moyen de paiement clients', rn.dso, rp && rp.dso, days)}${line('Délai moyen de paiement fournisseurs', rn.dpo, rp && rp.dpo, days)}
          ${line('Dettes financières / capitaux propres', rn.endettement, rp && rp.endettement, pct)}
        </tbody></table>
        <h2>Faits marquants</h2>
        <ul>${facts.map((x) => `<li>${esc(x)}</li>`).join('')}${justified.map((a) => `<li>${esc(a.lib)} : ${a.delta >= 0 ? '+' : ''}${eur(a.delta, 0)} € — ${esc(store.comments[a.compte])}</li>`).join('')}</ul>
        ${attention.length ? `<h2>Points d'attention</h2><ul>${attention.map((x) => `<li><strong>${esc(x.label)}</strong>${x.detail ? ' — ' + esc(x.detail) : ''}</li>`).join('')}</ul>` : ''}
        ${store.note ? `<h2>Commentaires du cabinet</h2><p class="note-free">${esc(store.note)}</p>` : ''}
        <footer class="note-foot">Document établi à partir du fichier des écritures comptables, avant écritures d'inventaire éventuelles. Chiffres indicatifs.</footer>
      </article>`;
  }

  function openNote() {
    const store = revueComments();
    modalRefresh = null;
    openModal(`
      <div class="sheet">
        <header class="modal-head"><h2>Note de synthèse</h2><button type="button" class="icon-btn" data-action="close-modal" aria-label="Fermer">✕</button></header>
        <div class="modal-body">
          <label>Commentaires du cabinet (repris dans la note)<textarea data-revue="note" rows="3" spellcheck="false">${esc(store.note || '')}</textarea></label>
          <div class="note-preview">${noteHtml()}</div>
        </div>
        <footer class="modal-foot"><button type="button" class="btn" data-action="close-modal">Fermer</button><button class="btn primary" data-action="note-print">Imprimer / PDF</button></footer>
      </div>`, true);
  }

  function printNote() {
    printHtml(noteHtml());
  }

  // ---------- Rapprochement bancaire ----------

  // Apparie les opérations du relevé et les lignes du compte de banque du FEC (montant identique, date proche),
  // puis tente des regroupements (remise de chèques, total de cartes bancaires…).
  function reconcile(ops, lines, tol, opening) {
    const cents = (x) => Math.round(x * 100);
    const days = (a, b) => Math.abs(daysUntilFrom(a, b));
    const start = ops.reduce((m, o) => (o.date < m ? o.date : m), '9999');
    const end = ops.reduce((m, o) => (o.date > m ? o.date : m), '0000');
    const bank = ops.map((o, i) => ({ i, ...o, match: null }));
    const book = lines.map(([date, amount, label, piece, ref], i) => ({ i, date, amount, label, piece, ref, match: null }))
      .filter((l) => l.date >= addDays(start, -tol - 31) && l.date <= addDays(end, tol));
    const byAmount = new Map();
    book.forEach((l) => {
      const k = cents(l.amount);
      if (!byAmount.has(k)) byAmount.set(k, []);
      byAmount.get(k).push(l);
    });
    // 1. Une opération = une écriture (même montant, date la plus proche dans la tolérance).
    bank.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((o) => {
      const cands = (byAmount.get(cents(o.amount)) || []).filter((l) => !l.match && days(l.date, o.date) <= tol);
      if (!cands.length) return;
      cands.sort((a, b) => days(a.date, o.date) - days(b.date, o.date));
      o.match = [cands[0]];
      cands[0].match = [o];
    });
    // 2. Regroupements : plusieurs lignes d'un côté pour une ligne de l'autre (jusqu'à 4, dates proches).
    const subsetSum = (target, pool) => {
      const items = pool.slice(0, 12);
      const t = cents(target);
      const rec = (k, from, acc, chosen) => {
        if (chosen.length >= 2 && acc === t) return chosen;
        if (chosen.length >= 4) return null;
        for (let j = from; j < items.length; j++) {
          const res = rec(k, j + 1, acc + cents(items[j].amount), chosen.concat(items[j]));
          if (res) return res;
        }
        return null;
      };
      return rec(0, 0, 0, []);
    };
    const group = (singles, pool) => {
      singles.filter((x) => !x.match).forEach((x) => {
        const cand = pool.filter((y) => !y.match && Math.sign(y.amount) === Math.sign(x.amount) && Math.abs(y.amount) < Math.abs(x.amount) && days(y.date, x.date) <= Math.max(tol, 3));
        const found = cand.length >= 2 ? subsetSum(x.amount, cand) : null;
        if (found) {
          x.match = found;
          found.forEach((y) => { y.match = [x]; });
        }
      });
    };
    group(bank, book);
    group(book, bank);
    const inPeriod = (d) => d >= start && d <= end;
    const bankOnly = bank.filter((o) => !o.match);
    const bookOnly = book.filter((l) => !l.match && inPeriod(l.date));
    const matched = bank.filter((o) => o.match).length;
    // Solde comptable à une date (à-nouveaux + mouvements jusqu'à cette date).
    const balanceAt = (date) => Math.round((opening + lines.filter(([d]) => d <= date).reduce((t, l) => t + l[1], 0)) * 100) / 100;
    return { start, end, bank, bankOnly, bookOnly, matched, balanceAt };
  }

  function rapproState() {
    const f = ui.fec;
    if (!f.rappro) {
      const accounts = Object.keys(f.result.bankLines || {}).sort();
      f.rappro = { compte: accounts.find((a) => a.startsWith('512')) || accounts[0] || '', files: [], ops: [], opening: null, closing: null, tol: 5, include: true };
    }
    return f.rappro;
  }

  async function importStatement() {
    const file = await pickFile('.txt,.csv,.xlsx,.ofx,.qfx,.xml,.cfonb,.dat,.120', true);
    if (!file) return;
    const st = rapproState();
    try {
      const res = await BankReader.read(file);
      const key = (o) => `${o.date}|${o.amount}|${o.label}`;
      const known = new Set(st.ops.map(key));
      const added = res.operations.filter((o) => !known.has(key(o)));
      st.ops = st.ops.concat(added).sort((a, b) => a.date.localeCompare(b.date));
      st.files.push(`${file.name} (${res.format}, ${res.operations.length} op.)`);
      if (res.opening && (!st.opening || res.opening.date < st.opening.date)) st.opening = res.opening;
      if (res.closing && (!st.closing || res.closing.date > st.closing.date)) st.closing = res.closing;
      toast(`${added.length} opération(s) importée(s)${added.length < res.operations.length ? ` (${res.operations.length - added.length} déjà présentes)` : ''}.`);
    } catch (e) {
      toast(e.message, true);
    }
    refresh();
  }

  function rapproResult() {
    const f = ui.fec;
    const st = rapproState();
    if (!st.ops.length || !st.compte) return null;
    const bal = f.result.balance.find((b) => b.compte === st.compte);
    return reconcile(st.ops, f.result.bankLines[st.compte] || [], st.tol, bal ? bal.an : 0);
  }

  function viewRappro() {
    const f = ui.fec;
    const st = rapproState();
    const accounts = Object.keys(f.result.bankLines || {}).sort();
    const libOf = (c) => (f.result.balance.find((b) => b.compte === c) || {}).lib || c;
    const head = `
      <section class="card">
        <h2>Rapprochement bancaire</h2>
        <p class="muted small">Importez le relevé de la banque (CFONB 120 / EBICS, OFX, CAMT.053, ou export CSV / Excel de la banque en ligne). Chaque opération est recherchée dans le compte de banque du FEC ; plusieurs relevés peuvent être ajoutés à la suite.</p>
        ${accounts.length ? `<div class="filters">
          <select data-rappro="compte" aria-label="Compte de banque">${options(Object.fromEntries(accounts.map((a) => [a, `${a} — ${libOf(a)}`])), st.compte)}</select>
          <label class="inline-label">Tolérance <input type="number" min="0" max="31" data-rappro="tol" value="${st.tol}"> jours</label>
          <button class="btn primary" data-action="rappro-import">${st.ops.length ? 'Ajouter un relevé' : 'Importer le relevé'}</button>
          ${st.ops.length ? '<button class="btn" data-action="rappro-reset">Recommencer</button>' : ''}
        </div>
        ${st.files.length ? `<p class="muted small">Relevés : ${st.files.map(esc).join(' · ')}</p>` : ''}` : '<p class="muted">Aucun compte de banque (51) dans ce FEC.</p>'}
      </section>`;
    const res = rapproResult();
    if (!res) return head;
    // Date de référence : solde de fin fourni par le relevé, sinon dernière opération.
    const stmt = st.closing && st.closing.date >= res.start ? st.closing : null;
    const ref = stmt ? stmt.date : res.end;
    const upTo = (list) => list.filter((x) => x.date <= ref);
    const sum = (list) => list.reduce((t, x) => t + x.amount, 0);
    const nonCompta = sum(upTo(res.bankOnly)), nonReleve = sum(upTo(res.bookOnly));
    const bookBalance = res.balanceAt(ref);
    const theorique = bookBalance + nonCompta - nonReleve;
    const ecart = stmt ? Math.round((stmt.amount - theorique) * 100) / 100 : null;
    const tile = (label, value, cls) => `<div class="kpi ${cls || ''}"><strong>${value}</strong><span>${label}</span></div>`;
    const opRow = (o) => `<tr><td>${fmtDate(o.date)}</td><td>${esc(o.label)}</td><td class="${o.amount < 0 ? 'cred' : ''}">${eur(o.amount)}</td></tr>`;
    return `${head}
      <div class="kpis fec-kpis">
        ${tile('Opérations du relevé', res.bank.length)}
        ${tile('Rapprochées', `${Math.round((res.matched * 100) / res.bank.length)} %`, res.matched === res.bank.length ? '' : '')}
        ${tile('Non comptabilisées', res.bankOnly.length, res.bankOnly.length ? 'kpi-late' : '')}
        ${tile('Absentes du relevé', res.bookOnly.length, res.bookOnly.length ? 'kpi-wait' : '')}
      </div>
      <section class="card"><h2>État de rapprochement au ${fmtDate(ref)}</h2>
        <table class="dtable num sig"><tbody>
          <tr><td>Solde comptable (${esc(st.compte)}) au ${fmtDate(ref)}</td><td>${eur(bookBalance)}</td></tr>
          <tr><td>+ Opérations du relevé non comptabilisées (${upTo(res.bankOnly).length})</td><td>${eur(nonCompta)}</td></tr>
          <tr><td>− Écritures non encore passées en banque (${upTo(res.bookOnly).length})</td><td>${eur(-nonReleve)}</td></tr>
          <tr class="strong"><td>= Solde bancaire théorique</td><td>${eur(theorique)}</td></tr>
          ${stmt ? `<tr><td>Solde du relevé au ${fmtDate(stmt.date)}</td><td>${eur(stmt.amount)}</td></tr>
          <tr class="strong"><td>Écart inexpliqué</td><td class="${Math.abs(ecart) >= 0.01 ? 'cred' : ''}">${eur(ecart)}</td></tr>` : '<tr><td colspan="2" class="muted">Solde de fin non fourni par le relevé : comparez le solde théorique au relevé papier.</td></tr>'}
        </tbody></table>
        ${stmt && Math.abs(ecart) >= 0.01 ? '<p class="muted small">Un écart peut venir d\'à-nouveaux différents du solde bancaire d\'ouverture, ou d\'opérations antérieures au premier relevé importé.</p>' : ''}
      </section>
      <div class="grid2">
        <section class="card"><h2>Opérations bancaires non comptabilisées <span class="count">${res.bankOnly.length}</span></h2>
          ${res.bankOnly.length ? `<label class="check"><input type="checkbox" data-rappro="include"${st.include ? ' checked' : ''}><span>Les ajouter aux pièces à demander au client</span></label>
          <div class="grid-wrap"><table class="dtable num"><thead><tr><th>Date</th><th>Libellé</th><th>Montant</th></tr></thead><tbody>${res.bankOnly.map(opRow).join('')}</tbody></table></div>` : '<p class="muted">Toutes les opérations du relevé sont comptabilisées. 👍</p>'}
        </section>
        <section class="card"><h2>Écritures absentes du relevé <span class="count">${res.bookOnly.length}</span></h2>
          <p class="muted small">Chèques émis non encaissés, remises en cours, ou erreurs de saisie à corriger.</p>
          ${res.bookOnly.length ? `<div class="grid-wrap"><table class="dtable num"><thead><tr><th>Date</th><th>Libellé</th><th>Montant</th></tr></thead><tbody>${res.bookOnly.map(opRow).join('')}</tbody></table></div>` : '<p class="muted">Aucune.</p>'}
        </section>
      </div>
      <div class="pieces-actions"><button class="btn" data-action="rappro-xlsx">Exporter l'état de rapprochement (Excel)</button></div>`;
  }

  function exportRappro() {
    const st = rapproState();
    const res = rapproResult();
    if (!res) return;
    const t = (v, s) => ({ v, s: s === undefined ? 2 : s });
    const n = (v, s) => ({ v: Number(v) || 0, s: s || 8 });
    const opRows = (list) => list.map((o) => [t(fmtDate(o.date)), t(o.label || ''), n(o.amount)]);
    const stmt = st.closing && st.closing.date >= res.start ? st.closing : null;
    const ref = stmt ? stmt.date : res.end;
    const upTo = (list) => list.filter((x) => x.date <= ref);
    const nonCompta = upTo(res.bankOnly).reduce((a, o) => a + o.amount, 0), nonReleve = upTo(res.bookOnly).reduce((a, o) => a + o.amount, 0);
    const book = res.balanceAt(ref);
    const rows = [[{ v: `État de rapprochement — compte ${st.compte} au ${fmtDate(ref)}`, s: 10 }], [],
      [t('Solde comptable', 1), n(book)], [t('+ Opérations du relevé non comptabilisées', 1), n(nonCompta)],
      [t('− Écritures non passées en banque', 1), n(-nonReleve)], [t('= Solde bancaire théorique', 1), n(book + nonCompta - nonReleve, 9)],
      ...(stmt ? [[t(`Solde du relevé au ${fmtDate(stmt.date)}`, 1), n(stmt.amount, 9)], [t('Écart inexpliqué', 1), n(stmt.amount - (book + nonCompta - nonReleve), 9)]] : [])];
    const blob = XlsxWriter.build({ sheets: [
      { name: 'État de rapprochement', rows, widths: [50, 18], filter: false },
      { name: 'Non comptabilisées', rows: [[t('Date', 1), t('Libellé', 1), t('Montant', 1)]].concat(opRows(res.bankOnly)), widths: [12, 60, 16], freeze: { row: 1 } },
      { name: 'Absentes du relevé', rows: [[t('Date', 1), t('Libellé', 1), t('Montant', 1)]].concat(opRows(res.bookOnly)), widths: [12, 60, 16], freeze: { row: 1 } },
    ] });
    download(`rapprochement-${st.compte}-${ref}.xlsx`, blob, blob.type);
  }

  // ---------- Analyseur Pharmacie (officine) ----------

  const RE_AMO = /cpam|caisse prim|c\.?p\.?a\.?m|msa|mutualite sociale agricole|\bamo\b|regime oblig|securite sociale|\bsecu\b|cnmss|\bssi\b|\brsi\b|camieg|enim|cavimac|cnam|caisse nationale|sncf|ratp|banque de france|assurance maladie|\bro\b/;
  const RE_AMC = /mutuel|\bamc\b|complementaire|viamedis|almerys|santeclair|isante|sp ?sante|harmonie|mgen|malakoff|axa|allianz|ag2r|apicil|swiss ?life|generali|groupama|macif|maif|matmut|pro ?btp|klesia|humanis|\bmnh\b|cetip|actil|seveane|kalivia|itelis|carte blanche|noemie|tiers payant|\btp\b|\brc\b|alan\b|april\b|henner|gras savoye|unéo|uneo|mnt\b|mfp|mutuelle/;
  const RE_PATIENT = /patient|particulier|ardoise|compte client|clients? divers|clients? comptoir/;

  function tiersCat(t) {
    const txt = norm(`${t.lib} ${t.clib || ''} ${t.num}`);
    if (RE_PATIENT.test(norm(t.lib))) return 'patient';
    if (RE_AMO.test(txt)) return 'amo';
    if (RE_AMC.test(txt)) return 'amc';
    return 'patient';
  }
  const CAT_LABEL = { amo: 'Régime obligatoire', amc: 'Complémentaire', patient: 'Patient / autre' };
  const NORMAL_DAYS = { amo: 10, amc: 30 };

  // Indices qu'un FEC est celui d'une pharmacie.
  function looksLikePharmacy(r) {
    let score = 0;
    if (r.balance.some((b) => /^(70|4457)/.test(b.compte) && /2[,.]10?\b|2[,.]1 ?%/.test(b.lib))) score++;
    if ((r.aging || []).filter((t) => t.racine === '411' && ['amo', 'amc'].includes(tiersCat(t))).length >= 2) score++;
    if (r.balance.some((b) => /honoraires? de dispensation|dispensation|rosp|honoraire.*ordonnance/i.test(b.lib))) score++;
    const c = clientById(ui.fec && ui.fec.clientId);
    if (c && /pharmac/i.test(`${c.nom} ${c.notes || ''}`)) score++;
    return score >= 2;
  }

  function rateOf(lib) {
    const m = norm(lib).match(/(?:^|[^\d])(2[,.]10?|5[,.]50?|10|20|8[,.]50?|13|0)(?:[,.]0+)?\s*%?(?:[^\d]|$)/);
    if (!m) return null;
    const v = parseFloat(m[1].replace(',', '.'));
    return [2.1, 5.5, 10, 20, 8.5, 13, 0].includes(v) ? v : null;
  }

  function pharmaData(r, ref) {
    const days = Math.max(30, daysUntilFrom(r.meta.start && r.meta.start < ref ? r.meta.start : (r.pieces.minOp || ref), ref) + 1);
    const tiers = (r.aging || []).filter((t) => t.racine === '411').map((t) => {
      const cat = tiersCat(t);
      const open = t.open.filter((o) => o.date <= ref || o.an);
      const age = (o) => (o.an ? 999 : daysUntilFrom(o.date, ref));
      const bucket = (min, max) => open.filter((o) => o.amt > 0 && age(o) >= min && age(o) <= max).reduce((s, o) => s + o.amt, 0);
      const perDay = t.billed / days;
      const encoursJours = perDay > 0 ? Math.max(t.s, 0) / perDay : null;
      let rejets = 0, rejetsMode = '';
      if (cat !== 'patient' && t.s > 0) {
        if (t.method === 'lettrage') { rejets = bucket(61, 99999); rejetsMode = 'lettrage'; }
        else if (perDay > 0) { rejets = Math.max(0, t.s - perDay * NORMAL_DAYS[cat]); rejetsMode = 'estimation'; }
      }
      return {
        ...t, cat, perDay, encoursJours, rejets: Math.round(rejets * 100) / 100, rejetsMode,
        b30: bucket(0, 30), b60: bucket(31, 60), b90: bucket(61, 90), bOld: bucket(91, 99999),
        oldest: (open.find((o) => o.amt > 0) || {}).date || '',
        oldItems: open.filter((o) => o.amt > 0 && age(o) > 60),
      };
    }).sort((a, b) => b.s - a.s);
    const sumBy = (cat, key) => tiers.filter((t) => t.cat === cat).reduce((s, t) => s + (t[key] || 0), 0);
    // CA par taux de TVA (libellés des comptes 70 et 4457)
    const mv = (b) => b.cm - b.dm;
    const rates = {};
    r.balance.forEach((b) => {
      if (/^70/.test(b.compte) && !/^706/.test(b.compte)) {
        const rt = rateOf(b.lib);
        const k = rt === null ? '?' : rt;
        (rates[k] = rates[k] || { rate: rt, ht: 0, tva: 0, accounts: [] }).ht += mv(b);
        rates[k].accounts.push(b.compte);
      } else if (/^4457/.test(b.compte)) {
        const rt = rateOf(b.lib);
        const k = rt === null ? '?' : rt;
        (rates[k] = rates[k] || { rate: rt, ht: 0, tva: 0, accounts: [] }).tva += mv(b);
      }
    });
    const incomeLines = r.balance.filter((b) => /^7[0-5]/.test(b.compte) && (/^706/.test(b.compte) || /honorair|dispens|rosp|forfait|garde|astreinte|vaccin|entretien|bilan partage|trod|teleconsult|remuneration|prime|aide|subvention/.test(norm(b.lib))))
      .map((b) => ({ compte: b.compte, lib: b.lib, montant: mv(b) })).filter((x) => Math.abs(x.montant) >= 0.01);
    const tpBilled = tiers.filter((t) => t.cat !== 'patient').reduce((s, t) => s + t.billed, 0);
    const caTtc = r.kpi.ca + Object.values(rates).reduce((s, x) => s + x.tva, 0);
    const transit = r.balance.filter((b) => /^(511|517|58)/.test(b.compte) && Math.abs(b.s) >= 0.01)
      .map((b) => ({ compte: b.compte, lib: b.lib, s: b.s, perDay: (b.dm || 0) / days }));
    const ventesMarch = r.balance.filter((b) => /^707|^7097/.test(b.compte)).reduce((s, b) => s + mv(b), 0) || r.kpi.ca;
    const remises = r.balance.filter((b) => /^609/.test(b.compte)).reduce((s, b) => s + mv(b), 0);
    const achats = r.balance.filter((b) => /^607/.test(b.compte)).reduce((s, b) => s + (b.dm - b.cm), 0);
    const variationStock = r.balance.filter((b) => /^6037/.test(b.compte)).reduce((s, b) => s + (b.dm - b.cm), 0);
    const ecartsCaisse = r.balance.filter((b) => /^(658|758|6718|7718)/.test(b.compte) && /ecart|caisse/.test(norm(b.lib))).reduce((s, b) => s + (b.dm - b.cm), 0);
    return {
      days, tiers, rates, incomeLines, tpBilled, caTtc, transit, ventesMarch, remises, achats, variationStock, ecartsCaisse,
      partTp: caTtc > 0 ? tpBilled / caTtc : null,
      tauxMarque: ventesMarch > 0 ? r.kpi.marge / ventesMarch : null,
      encoursAmo: sumBy('amo', 's'), encoursAmc: sumBy('amc', 's'), encoursPatients: tiers.filter((t) => t.cat === 'patient' && t.s > 0).reduce((s, t) => s + t.s, 0),
      rejets: tiers.reduce((s, t) => s + t.rejets, 0),
      tropPercus: tiers.filter((t) => t.cat !== 'patient' && t.s < 0),
      lettrage: tiers.some((t) => t.method === 'lettrage'),
    };
  }

  function pharmaRef(r) {
    return (ui.fec.pieces && ui.fec.pieces.arrete) || r.meta.closing || (r.pieces && r.pieces.maxOp) || todayStr();
  }

  function pharmaChecks(r) {
    const ph = pharmaData(r, pharmaRef(r));
    const out = [];
    const add = (level, label, detail) => out.push({ level, label, detail, examples: [], count: 0 });
    const pct = (x) => (x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %';
    // TVA par taux
    const known = Object.values(ph.rates).filter((x) => x.rate !== null && (x.ht || x.tva));
    if (!known.length) add('info', 'Contrôle de la TVA par taux impossible', 'Les libellés des comptes 707 et 4457 n\'indiquent pas le taux (2,1 %, 5,5 %, 10 %, 20 %).');
    known.forEach((x) => {
      const theo = (x.ht * x.rate) / 100;
      const ecart = x.tva - theo;
      if (x.ht > 0 && Math.abs(ecart) > Math.max(50, Math.abs(theo) * 0.01)) add('warn', `TVA collectée à ${String(x.rate).replace('.', ',')} % incohérente`, `Ventes HT ${eur(x.ht, 0)} € → TVA théorique ${eur(theo, 0)} €, comptabilisée ${eur(x.tva, 0)} € (écart ${eur(ecart, 0)} €) : ventilation du LGO ou taux à vérifier.`);
      else if (x.ht > 0) add('ok', `TVA à ${String(x.rate).replace('.', ',')} % cohérente`, `${eur(x.tva, 0)} € pour ${eur(x.ht, 0)} € de ventes HT.`);
    });
    if (ph.rates['?'] && ph.rates['?'].ht > 1000) add('info', 'Ventes sans taux identifiable', `${eur(ph.rates['?'].ht, 0)} € sur des comptes dont le libellé ne précise pas le taux (${ph.rates['?'].accounts.slice(0, 4).join(', ')}).`);
    // Marge
    if (ph.tauxMarque !== null) {
      const lvl = ph.tauxMarque < 0.22 || ph.tauxMarque > 0.38 ? 'warn' : 'ok';
      add(lvl, `Taux de marque ${pct(ph.tauxMarque)}`, lvl === 'ok' ? 'Dans la fourchette habituelle d\'une officine (environ 22 à 38 % remises comprises).' : `Hors de la fourchette habituelle d'une officine (22 à 38 %)${ph.variationStock ? '' : ' — sans variation de stock (6037), le taux n\'est pas significatif en cours d\'exercice'}.`);
    }
    if (ph.achats > 0 && ph.remises <= 0) add('warn', 'Aucune remise fournisseur comptabilisée (609)', 'Remises grossistes et laboratoires, coopération commerciale : à comptabiliser ou à demander.');
    else if (ph.achats > 0) add('ok', 'Remises fournisseurs comptabilisées', `${eur(ph.remises, 0)} €, soit ${pct(ph.remises / ph.achats)} des achats.`);
    // Tiers payant
    if (ph.rejets > 0) add('warn', `Rejets et impayés de tiers payant : ${eur(ph.rejets, 0)} €${ph.lettrage ? '' : ' (estimation)'}`, ph.lettrage ? 'Factures non lettrées de plus de 60 jours (détail dans l\'onglet Tiers payant).' : 'Encours supérieur au délai normal de règlement (10 jours pour le régime obligatoire, 30 jours pour les complémentaires) : état des rejets à demander, provision éventuelle.');
    else if (ph.tiers.some((t) => t.cat !== 'patient')) add('ok', 'Encours de tiers payant cohérent', 'Pas d\'encours anormal au regard des délais de règlement habituels.');
    if (ph.tropPercus.length) add('info', 'Trop-perçus d\'organismes', `${ph.tropPercus.length} organisme(s) au solde créditeur (${eur(-ph.tropPercus.reduce((s, t) => s + t.s, 0), 0)} €) : paiements à affecter.`);
    if (ph.encoursPatients > 0) {
      const old = ph.tiers.filter((t) => t.cat === 'patient').reduce((s, t) => s + t.b90 + t.bOld, 0);
      add(old > 0 ? 'warn' : 'info', `Créances patients : ${eur(ph.encoursPatients, 0)} €`, old > 0 ? `dont ${eur(old, 0)} € de plus de 60 jours : relances ou dépréciation.` : 'Ardoises récentes.');
    }
    // Transit
    ph.transit.forEach((x) => {
      const jours = x.perDay > 0 ? x.s / x.perDay : null;
      if (x.s > 0 && (jours === null || jours > 4)) add('warn', `Compte de transit ${x.compte} non soldé`, `${x.lib} : ${eur(x.s, 0)} € en attente${jours ? ` (≈ ${Math.round(jours)} jours de remises)` : ''} : remises CB ou chèques non comptabilisées en banque ?`);
    });
    if (Math.abs(ph.ecartsCaisse) >= 1) add('info', `Écarts de caisse : ${eur(ph.ecartsCaisse, 0)} €`, 'Montant net des écarts de caisse comptabilisés.');
    if (!ph.incomeLines.some((x) => /honorair|dispens/.test(norm(x.lib)))) add('info', 'Honoraires de dispensation non identifiés', 'Aucun compte « honoraires » : vérifier la ventilation du chiffre d\'affaires transmise par le LGO.');
    return out;
  }

  // Points de révision génériques adaptés à l'officine.
  function fecAlerts(r) {
    if (ui.fecProfile !== 'pharmacie') return r.alerts;
    return r.alerts
      .filter((a) => !/Benford|Clients créditeurs/.test(a.label))
      .map((a) => (/dimanche/.test(a.label) ? { ...a, level: 'info', detail: `${a.detail} Habituel pour une pharmacie de garde.` } : a));
  }

  function viewTiersPayant() {
    const f = ui.fec;
    const r = f.result;
    const ref = pharmaRef(r);
    const ph = pharmaData(r, ref);
    const tile = (label, value, cls) => `<div class="kpi ${cls || ''}"><strong>${value}</strong><span>${label}</span></div>`;
    const jours = (t) => (t.encoursJours === null ? '—' : `${Math.round(t.encoursJours)} j`);
    return `
      <div class="kpis fec-kpis">
        ${tile('Encours régime obligatoire', eurK(ph.encoursAmo))}
        ${tile('Encours complémentaires', eurK(ph.encoursAmc))}
        ${tile(`Rejets probables${ph.lettrage ? '' : ' (estim.)'}`, eurK(ph.rejets), ph.rejets > 0 ? 'kpi-late' : '')}
        ${tile('Créances patients', eurK(ph.encoursPatients), ph.encoursPatients > 0 ? 'kpi-wait' : '')}
        ${tile('Part du tiers payant', ph.partTp === null ? '—' : `${Math.round(ph.partTp * 100)} %`)}
        ${tile('Trop-perçus', ph.tropPercus.length)}
      </div>
      <section class="card">
        <h2>Balance âgée du tiers payant au ${fmtDate(ref)}</h2>
        <p class="muted small">${ph.lettrage ? 'Calculée à partir du <strong>lettrage</strong> du FEC : chaque facture non lettrée est datée.' : 'Comptes 411 <strong>non lettrés</strong> : les règlements sont imputés sur les factures les plus anciennes, et les rejets sont <strong>estimés</strong> à partir de l\'encours au-delà du délai normal (10 jours pour le régime obligatoire, 30 jours pour les complémentaires). L\'état des rejets du LGO donnera le détail exact.'}</p>
        <div class="grid-wrap"><table class="dtable num tp"><thead><tr><th>Organisme</th><th>Type</th><th>Solde</th><th>≤ 30 j</th><th>31–60 j</th><th>61–90 j</th><th>&gt; 90 j</th><th>Encours</th><th>Rejets probables</th></tr></thead>
        <tbody>${ph.tiers.map((t) => `<tr class="${t.rejets > 0 ? 'flag' : ''}">
          <td>${esc(t.lib)} <span class="muted small">${esc(t.num)}</span></td><td>${CAT_LABEL[t.cat]}</td>
          <td class="${t.s < 0 ? 'cred' : ''}">${eur(t.s)}</td><td>${eur(t.b30, 0)}</td><td>${eur(t.b60, 0)}</td><td>${eur(t.b90, 0)}</td><td>${eur(t.bOld, 0)}</td>
          <td>${t.cat === 'patient' ? '—' : jours(t)}</td><td>${t.rejets > 0 ? eur(t.rejets, 0) + (t.rejetsMode === 'estimation' ? ' *' : '') : ''}</td></tr>`).join('')}</tbody></table></div>
        ${ph.lettrage ? '' : '<p class="muted small">* estimation</p>'}
      </section>
      ${ph.lettrage && ph.tiers.some((t) => t.oldItems.length) ? `<section class="card"><h2>Factures de tiers payant non réglées depuis plus de 60 jours</h2>
        ${ph.tiers.filter((t) => t.oldItems.length && t.cat !== 'patient').map((t) => `<details class="tp-detail"><summary><strong>${esc(t.lib)}</strong> — ${t.oldItems.length} facture(s), ${eur(t.oldItems.reduce((s, o) => s + o.amt, 0))} €</summary>
          <div class="grid-wrap"><table class="dtable num"><thead><tr><th>Date</th><th>Libellé</th><th>Montant</th></tr></thead><tbody>${t.oldItems.slice(0, 100).map((o) => `<tr><td>${o.an ? 'À-nouveau' : fmtDate(o.date)}</td><td>${esc(o.lib)}</td><td>${eur(o.amt)}</td></tr>`).join('')}</tbody></table></div></details>`).join('')}
      </section>` : ''}`;
  }

  function viewCaTva() {
    const r = ui.fec.result;
    const ph = pharmaData(r, pharmaRef(r));
    const rows = Object.values(ph.rates).filter((x) => x.ht || x.tva).sort((a, b) => (a.rate === null ? 99 : a.rate) - (b.rate === null ? 99 : b.rate));
    return `
      <section class="card"><h2>Chiffre d'affaires et TVA par taux</h2>
        <div class="grid-wrap"><table class="dtable num sig"><thead><tr><th>Taux</th><th>Ventes HT</th><th>Part</th><th>TVA théorique</th><th>TVA comptabilisée</th><th>Écart</th></tr></thead>
        <tbody>${rows.map((x) => {
          const theo = x.rate === null ? null : (x.ht * x.rate) / 100;
          const ecart = theo === null ? null : x.tva - theo;
          return `<tr><td>${x.rate === null ? 'Taux non identifié' : String(x.rate).replace('.', ',') + ' %'}</td><td>${eur(x.ht, 0)}</td><td>${r.kpi.ca > 0 ? Math.round((x.ht / r.kpi.ca) * 100) + ' %' : ''}</td>
            <td>${theo === null ? '—' : eur(theo, 0)}</td><td>${eur(x.tva, 0)}</td><td class="${ecart !== null && Math.abs(ecart) > Math.max(50, Math.abs(theo) * 0.01) ? 'cred' : ''}">${ecart === null ? '—' : eur(Math.round(ecart) || 0, 0)}</td></tr>`;
        }).join('')}</tbody></table></div>
        <p class="muted small">Le taux est lu dans le libellé des comptes 707 et 4457 (ex. « Ventes TVA 2,1 % »).</p>
      </section>
      <section class="card"><h2>Honoraires et autres rémunérations</h2>
        ${ph.incomeLines.length ? `<table class="dtable num sig"><tbody>${ph.incomeLines.map((x) => `<tr><td>${esc(x.compte)} — ${esc(x.lib)}</td><td>${eur(x.montant, 0)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aucun compte d\'honoraires, de ROSP ou de rémunération forfaitaire identifié.</p>'}
      </section>
      <section class="card"><h2>Marge et achats</h2>
        <table class="dtable num sig"><tbody>
          <tr><td>Ventes de marchandises</td><td>${eur(ph.ventesMarch, 0)}</td></tr>
          <tr><td>Achats de marchandises (607)</td><td>${eur(ph.achats, 0)}</td></tr>
          <tr><td>Remises obtenues (609)</td><td>${eur(ph.remises, 0)}</td></tr>
          <tr><td>Variation de stock (6037)</td><td>${eur(ph.variationStock, 0)}</td></tr>
          <tr class="strong"><td>Marge commerciale</td><td>${eur(r.kpi.marge, 0)}</td></tr>
          <tr class="strong"><td>Taux de marque</td><td>${ph.tauxMarque === null ? '—' : (ph.tauxMarque * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %'}</td></tr>
        </tbody></table>
      </section>`;
  }

  // Pièces à demander propres à l'officine.
  function pharmaPieces(r, mode, arrete, push) {
    const ph = pharmaData(r, arrete);
    const d = fmtDate;
    ph.tiers.forEach((t) => {
      if (t.cat === 'patient') return;
      if (t.rejets > 0) push('tp', 'rej:' + t.num, `État des rejets et impayés ${t.lib} : ${eur(t.rejets)} € ${t.rejetsMode === 'lettrage' ? `de factures de plus de 60 jours (la plus ancienne du ${d(t.oldItems[0].date)})` : `d'encours au-delà du délai normal (${Math.round(t.encoursJours)} jours de facturation en attente)`}`);
      if (t.s < 0) push('tp', 'trop:' + t.num, `Relevé de paiement ${t.lib} : trop-perçu ou règlement non affecté de ${eur(-t.s)} €`);
    });
    const patients = ph.tiers.filter((t) => t.cat === 'patient' && t.s > 0);
    const old = patients.reduce((s, t) => s + t.b90 + t.bOld, 0);
    if (patients.length) push('tp', 'patients', `Point sur les créances patients (ardoises) : ${eur(ph.encoursPatients)} € pour ${patients.length} patient(s)${old > 0 ? `, dont ${eur(old)} € de plus de 60 jours` : ''}`);
    ph.transit.forEach((x) => {
      const jours = x.perDay > 0 ? x.s / x.perDay : null;
      if (x.s > 0 && (jours === null || jours > 4)) push('banque', 'transit:' + x.compte, `Relevés de remises (${x.lib}) : ${eur(x.s)} € en attente de remise au ${d(arrete)}`);
    });
    if (mode === 'bilan') {
      push('cloture', 'ph-inv', `Inventaire valorisé des stocks édité par le LGO au ${d(arrete)} (prix d'achat, hors périmés)`);
      push('cloture', 'ph-rfa', 'Remises de fin d\'année, avoirs et coopération commerciale à recevoir des grossistes et laboratoires');
      push('cloture', 'ph-tp', `Balance âgée et état des rejets du tiers payant édités par le LGO au ${d(arrete)}`);
      push('cloture', 'ph-z', 'Récapitulatif annuel du chiffre d\'affaires par taux de TVA (LGO)');
      push('cloture', 'ph-rosp', 'Décomptes de l\'Assurance maladie : ROSP, rémunérations forfaitaires, gardes et astreintes');
    } else {
      push('cloture', 'ph-tp-sit', `Balance âgée du tiers payant éditée par le LGO au ${d(arrete)}`);
    }
  }

  // ---------- Cycles de révision : achats, charges externes, clients, trésorerie ----------

  const CYCLES = { achats: 'Achats et fournisseurs', charges: 'Charges externes', clients: 'Ventes et clients', treso: 'Trésorerie' };
  const pctFr = (x, dec) => (x * 100).toLocaleString('fr-FR', { maximumFractionDigits: dec === undefined ? 1 : dec }) + ' %';
  const fecTerme = () => Math.max(0, Math.min(180, Math.round(Number(ui.fec.terme) || 30)));
  const fecPrev = () => { const p = cmpPrev(); return p && p.cycles ? p : null; };
  const yearEnd = (r) => !!r.meta.closing && !!r.pieces.maxOp && r.pieces.maxOp >= addDays(r.meta.closing, -10);
  const RUB3 = {
    611: 'Sous-traitance générale', 612: 'Redevances de crédit-bail', 613: 'Locations', 614: 'Charges locatives et de copropriété',
    615: 'Entretien et réparations', 616: "Primes d'assurance", 617: 'Études et recherches', 618: 'Documentation, colloques et divers',
    619: 'Rabais, remises et ristournes obtenus', 621: 'Personnel extérieur', 622: "Honoraires et rémunérations d'intermédiaires",
    623: 'Publicité et relations publiques', 624: 'Transports', 625: 'Déplacements, missions et réceptions', 626: 'Frais postaux et télécommunications',
    627: 'Services bancaires', 628: 'Cotisations et divers', 629: 'Rabais, remises et ristournes obtenus',
  };

  function checksList() {
    const out = [];
    // `full` : la liste d'exemples est complète (sinon d'autres éléments existent au-delà de ceux affichés).
    out.add = (level, label, detail, examples, extra) => out.push(Object.assign({ level, label, detail: detail || '', examples: examples || [], count: 0, full: (examples || []).length < 10 }, extra || {}));
    return out;
  }

  // Points de révision généraux repris dans un cycle (non recomptés dans les totaux).
  function linkedAlerts(r, out, labels) {
    fecAlerts(r).filter((a) => labels.includes(a.label)).forEach((a) => out.push(Object.assign({}, a, { linked: true })));
  }

  // Régularisations de l'exercice précédent (à-nouveaux) qui doivent être extournées en début d'exercice.
  function regulCheck(r, out, prefixes, label) {
    const rows = r.balance.filter((b) => prefixes.some((p) => b.compte.startsWith(p)) && Math.abs(b.an) >= 1);
    if (!rows.length || !r.meta.hasAN) return;
    const open = rows.filter((b) => (b.an < 0 ? b.dm : b.cm) < Math.abs(b.an) - 1);
    if (open.length) out.add('warn', label, "Les régularisations de l'exercice précédent (à-nouveaux) doivent être extournées à l'ouverture : risque de charges ou de produits comptés deux fois.", open.map((b) => `${b.compte} ${b.lib} : à-nouveau ${eur(Math.abs(b.an))} €, extourné ${eur(b.an < 0 ? b.dm : b.cm)} €`));
    else out.add('ok', label.replace(/ non (extourné(?:e)?s)$/, ' $1'), `${rows.length} compte(s) repris en à-nouveau et soldé(s).`);
  }

  function cutCheck(out, cut, what) {
    if (cut.after.n) out.add('warn', `${what} : pièces datées après la clôture`, `${cut.after.n} ligne(s), ${eur(cut.after.total, 0)} € : pièces de l'exercice suivant comptabilisées dans l'exercice (séparation des exercices).`, cut.after.ex, { full: cut.after.ex.length >= cut.after.n });
    if (cut.before.n) out.add('info', `${what} : pièces de l'exercice précédent`, `${cut.before.n} ligne(s), ${eur(cut.before.total, 0)} € datées avant l'ouverture : auraient dû être rattachées à l'exercice précédent (charges à payer ou produits à recevoir) ?`, cut.before.ex, { full: cut.before.ex.length >= cut.before.n });
    if (!cut.after.n && !cut.before.n) out.add('ok', `${what} : séparation des exercices`, 'Aucune pièce datée hors de l\'exercice.');
  }

  // Factures non réglées à la date de référence, par tranche de retard après l'échéance (tableau de l'art. D441-6 du code de commerce).
  function overdue(r, racine, ref, terme) {
    const b = { b1: [0, 0], b31: [0, 0], b61: [0, 0], b91: [0, 0] };
    const tiers = [];
    const startAge = r.meta.start ? Math.max(0, daysUntilFrom(r.meta.start, ref)) : 999;
    (r.aging || []).filter((t) => t.racine === racine).forEach((t) => {
      const x = { num: t.num, lib: t.lib, late: 0, b91: 0, oldest: '' };
      t.open.forEach((o) => {
        if (o.amt <= 0 || (!o.an && o.date > ref)) return;
        const days = o.an ? startAge : daysUntilFrom(addDays(o.date, terme), ref);
        if (days < 1) return;
        const k = days <= 30 ? 'b1' : days <= 60 ? 'b31' : days <= 90 ? 'b61' : 'b91';
        b[k][0]++;
        b[k][1] += o.amt;
        x.late += o.amt;
        if (k === 'b91') x.b91 += o.amt;
        if (!x.oldest || (o.an ? '0' : o.date) < x.oldest) x.oldest = o.an ? '0' : o.date;
      });
      if (x.late > 0) tiers.push(x);
    });
    tiers.sort((p, q) => q.b91 - p.b91 || q.late - p.late);
    return Object.assign(b, { tiers, total: [b.b1[0] + b.b31[0] + b.b61[0] + b.b91[0], b.b1[1] + b.b31[1] + b.b61[1] + b.b91[1]] });
  }
  const oldestTxt = (t) => (t.oldest === '0' ? 'reprise en à-nouveau' : `la plus ancienne du ${fmtDate(t.oldest)}`);

  function chkAchats(r, ref, prev, terme) {
    const a = r.cycles.achats;
    const out = checksList();
    const { mv, solde } = sums(r);
    const pharma = ui.fecProfile === 'pharmacie';
    linkedAlerts(r, out, ['Fournisseurs débiteurs']);
    if (a.dupStrong.n) out.add('warn', 'Factures fournisseurs en double', `${a.dupStrong.n} facture(s) saisie(s) deux fois (même fournisseur, même montant, même n° de pièce, à moins de 15 jours d'écart) : ${eur(a.dupStrong.total)} € de charges et de TVA déductible en trop ?`, a.dupStrong.ex, { full: a.dupStrong.ex.length >= a.dupStrong.n });
    else if (a.invoices) out.add('ok', 'Aucune facture fournisseur en double', `${a.invoices.toLocaleString('fr-FR')} factures contrôlées (fournisseur, montant et n° de pièce)${a.recurringRefs ? ` ; ${a.recurringRefs} référence(s) d'échéancier mensuel (loyer, crédit-bail, abonnement) écartée(s)` : ''}.`);
    if (a.dupPossible.n) out.add('info', "Factures de même montant à quelques jours d'intervalle", `${a.dupPossible.n} cas chez un même fournisseur (3 jours au plus) : livraisons distinctes ou doublon ?`, a.dupPossible.ex, { full: a.dupPossible.ex.length >= a.dupPossible.n });
    const od = overdue(r, '401', ref, terme);
    if (od.b91[1] > 0) out.add('warn', 'Dettes fournisseurs échues depuis plus de 90 jours', `${eur(od.b91[1], 0)} € (${od.b91[0]} facture(s)) : litige, avoir attendu, ou facture déjà réglée par un autre moyen ?`, od.tiers.filter((t) => t.b91 > 0).slice(0, 10).map((t) => `${t.lib} : ${eur(t.b91)} € (${oldestTxt(t)})`));
    if (a.delay.lateN) out.add(a.delay.lateAmt > a.delay.paidAmt * 0.2 ? 'warn' : 'info', 'Factures fournisseurs réglées à plus de 60 jours', `${a.delay.lateN} facture(s), ${eur(a.delay.lateAmt, 0)} € : au-delà du délai légal maximal (art. L441-10 du code de commerce), amende administrative possible.`, a.suppliers.filter((s) => s.lateN).slice(0, 10).map((s) => `${s.lib} : ${s.lateN} facture(s), délai moyen ${s.delay} j`));
    else if (a.delay.paidN) out.add('ok', 'Délais de paiement fournisseurs', `Délai moyen constaté : ${a.delay.avg} jours, aucune facture réglée au-delà de 60 jours.`);
    if (a.overVat.n) out.add('warn', 'TVA déductible supérieure à 20 %', `${a.overVat.n} facture(s), ${eur(a.overVat.total, 0)} € de TVA : erreur de saisie ou TVA déduite en double ?`, a.overVat.ex, { full: a.overVat.ex.length >= a.overVat.n });
    if (a.autoliq.n) out.add('warn', 'Autoliquidation incomplète', `${a.autoliq.n} facture(s) : TVA autoliquidée (4452) non déduite en totalité (4456).`, a.autoliq.ex, { full: a.autoliq.ex.length >= a.autoliq.n });
    const nv = a.noVat.reduce((s, g) => s + g.total, 0);
    if (nv > 0) out.add('info', 'Factures sans TVA déductible', `${a.noVat.reduce((s, g) => s + g.n, 0)} facture(s) de plus de 150 € HT, ${eur(nv, 0)} € : fournisseur non assujetti, opération exonérée, ou TVA oubliée ?`, a.noVat.slice(0, 10).map((g) => `${g.compte} ${g.lib} : ${g.n} facture(s), ${eur(g.total, 0)} € — ex. ${g.ex[0]}`));
    else if (a.invoices && !a.overVat.n) out.add('ok', 'TVA déductible des factures', 'Chaque facture de plus de 150 € HT porte une TVA déductible cohérente (20 % au plus).');
    cutCheck(out, a.cut, 'Achats');
    regulCheck(r, out, ['408'], "Factures non parvenues de l'exercice précédent non extournées");
    const fnp = -solde(['408']);
    if (fnp > 0.01) out.add('ok', `Factures non parvenues comptabilisées : ${eur(fnp, 0)} €`, 'Compte 408 à la date de fin des écritures.');
    else if (yearEnd(r) && a.invoices >= 12) out.add('info', 'Aucune facture non parvenue à la clôture', "Compte 408 non utilisé : vérifier les factures reçues après la clôture qui concernent l'exercice.");
    if (!pharma && mv(['607']) > 10000 && Math.abs(mv(['609'])) < 0.01 && Math.abs(solde(['4098'])) < 0.01) out.add('info', 'Aucune remise ni ristourne fournisseur', "Remises de fin d'année à recevoir (4098) à demander aux principaux fournisseurs ?");
    const top = a.suppliers[0];
    if (top && top.share > 0.5 && a.nbSuppliers >= 3) out.add('info', `Dépendance fournisseur : ${top.lib}`, `${pctFr(top.share, 0)} des achats facturés de l'exercice.`);
    if (prev) {
      const known = new Set(prev.cycles.achats.suppliers.map((s) => norm(s.lib)));
      const news = a.suppliers.filter((s) => s.ttc >= Math.max(3000, a.ttc * 0.02) && !known.has(norm(s.lib)));
      if (news.length) out.add('info', 'Nouveaux fournisseurs significatifs', `${news.length} fournisseur(s) absent(s) de l'exercice précédent : existence et coordonnées bancaires à vérifier (fraude au faux fournisseur).`, news.slice(0, 10).map((s) => `${s.lib} : ${eur(s.ttc, 0)} € TTC`));
    }
    return out;
  }

  const ccaEx = (x) => `${fmtDate(x.date)} · ${x.compte} ${x.lib} · ${x.label} · ${eur(x.amt, 0)} € → ${eur(x.cca, 0)} € (période présumée de ${x.cover} mois)`;

  function chkCharges(r, ref, prev) {
    const ch = r.cycles.charges;
    const out = checksList();
    const { mv, solde } = sums(r);
    const last = [ref, r.pieces.maxOp || ref].sort()[0];
    const period = monthsBetween(ymOf(r.meta.start && r.meta.start <= last ? r.meta.start : r.pieces.minOp || last), ymOf(last));
    const has = (a, ym) => Math.abs(a.months[ym] || 0) >= 0.01;
    const miss = [];
    if (period.length >= 6) ch.accounts.forEach((a) => {
      const present = period.filter((ym) => has(a, ym));
      if (present.length < 6 || present.length / period.length < 0.6 || present.length === period.length) return;
      const med = median(present.map((ym) => a.months[ym]));
      if (med >= 30) miss.push(`${a.compte} ${a.lib} : ${fmtMonths(period.filter((ym) => !has(a, ym)))} (habituellement ${eur(med, 0)} € par mois)`);
    });
    if (miss.length) out.add('warn', 'Charges récurrentes incomplètes', `${miss.length} compte(s) habituellement mouvementés chaque mois présentent des mois sans charge : factures non saisies ?`, miss);
    else if (period.length >= 6) out.add('ok', 'Charges récurrentes complètes', 'Les comptes mouvementés chaque mois le sont sur toute la période.');
    if (r.meta.closing) {
      const est = ch.cca.reduce((s, x) => s + x.cca, 0);
      const cca = solde(['486']);
      if (ch.cca.length) out.add(cca < est * 0.5 ? 'warn' : 'info', `Charges constatées d'avance probables : ${eur(est, 0)} €`, `${ch.cca.length} paiement(s) annuels ou trimestriels couvrant une période postérieure au ${fmtDate(r.meta.closing)} (estimation à confirmer sur les factures) ; comptabilisé en 486 : ${eur(cca, 0)} €.`, ch.cca.slice(0, 12).map(ccaEx), { full: ch.cca.length <= 12 });
    }
    regulCheck(r, out, ['486'], "Charges constatées d'avance de l'exercice précédent non extournées");
    regulCheck(r, out, ['4286', '4386', '4486', '4686'], "Charges à payer de l'exercice précédent non extournées");
    if (ch.das2.length) out.add('info', `DAS2 : ${ch.das2.length} bénéficiaire(s) de plus de 1 200 €`, "Honoraires, commissions et droits d'auteur à déclarer (DAS2) avec la liasse ou au plus tard début mai ; montants TTC estimés.", ch.das2.slice(0, 15).map((b) => `${b.benef} : ${eur(b.total, 0)} € (${b.comptes.join(', ')})`));
    if (ch.perso.n) out.add('warn', 'Dépenses à caractère personnel possibles', `${ch.perso.n} dépense(s), ${eur(ch.perso.total, 0)} € (grandes surfaces, loisirs, abonnements…) : intérêt de l'entreprise à justifier, sinon réintégration et avantage en nature.`, ch.perso.ex, { full: ch.perso.ex.length >= ch.perso.n });
    if (ch.amendes.n) out.add('warn', 'Amendes et pénalités en charges déductibles', `${ch.amendes.n} dépense(s), ${eur(ch.amendes.total, 0)} € : non déductibles (art. 39-2 du CGI), à isoler en 6712 et à réintégrer ; désignation du conducteur pour les contraventions.`, ch.amendes.ex, { full: ch.amendes.ex.length >= ch.amendes.n });
    if (ch.weekend.n) out.add('info', 'Frais de réception ou de déplacement le week-end', `${ch.weekend.n} dépense(s), ${eur(ch.weekend.total, 0)} € : caractère professionnel à justifier.`, ch.weekend.ex, { full: ch.weekend.ex.length >= ch.weekend.n });
    if (ch.giftVat.n) out.add('warn', 'TVA déduite sur des cadeaux de plus de 73 €', `${ch.giftVat.n} écriture(s), ${eur(ch.giftVat.total, 0)} € de TVA : non récupérable au-delà de 73 € TTC par bénéficiaire et par an.`, ch.giftVat.ex, { full: ch.giftVat.ex.length >= ch.giftVat.n });
    else if (ch.gifts.n) out.add('info', `Cadeaux de plus de 73 € : ${eur(ch.gifts.total, 0)} €`, 'TVA non récupérable au-delà de 73 € TTC par bénéficiaire et par an ; relevé des frais généraux (2067) si le total dépasse 3 000 €.', ch.gifts.ex, { full: ch.gifts.ex.length >= ch.gifts.n });
    if (ch.notesFrais.n) out.add('info', "Dépenses avancées par l'associé", `${ch.notesFrais.n} écriture(s), ${eur(ch.notesFrais.total, 0)} € portées au crédit du compte courant : notes de frais et justificatifs à obtenir.`, ch.notesFrais.ex, { full: ch.notesFrais.ex.length >= ch.notesFrais.n });
    cutCheck(out, ch.cut, 'Charges externes');
    const ext = mv(['61', '62']);
    const direct = ch.accounts.reduce((s, a) => s + Math.max(0, a.direct), 0);
    if (direct > 2000 && direct > ext * 0.3) out.add('info', 'Charges externes payées sans facture fournisseur', `${eur(direct, 0)} € (${pctFr(direct / ext, 0)}) comptabilisés directement depuis la banque : les factures correspondantes doivent être au dossier.`);
    if (prev && r.kpi.ca > 0 && prev.kpi.ca > 0) {
      const n = ext / r.kpi.ca, p = sums(prev).mv(['61', '62']) / prev.kpi.ca;
      if (Math.abs(n - p) >= 0.05) out.add('info', `Charges externes : ${pctFr(p)} → ${pctFr(n)} du chiffre d'affaires`, 'Variation significative du poids des charges externes : voir les comptes en hausse ci-dessous.');
    }
    return out;
  }

  function chkClients(r, ref, prev, terme) {
    const cl = r.cycles.clients;
    const out = checksList();
    const { solde } = sums(r);
    linkedAlerts(r, out, ['Clients créditeurs']);
    const nb = cl.numbering.filter((g) => !g.sparse);
    if (!cl.numbering.length && cl.invoices >= 10) out.add('info', 'Numérotation des factures de vente non contrôlable', 'Les n° de pièce des factures de vente ne se terminent pas par un numéro.');
    else if (cl.numbering.length && !nb.length) out.add('info', 'Numérotation des factures non exploitable', `Les n° de pièce (${cl.numbering[0].first}…) semblent être des n° d'écriture : le n° de facture n'est pas repris dans le FEC.`);
    nb.forEach((g) => {
      const name = `${g.first} à ${g.last}`;
      if (g.missing) out.add('warn', `Factures de vente manquantes dans la numérotation (${name})`, `${g.missing} numéro(s) absent(s) : factures annulées (à justifier), non saisies ou émises par un autre outil ? La numérotation doit être continue (art. 242 nonies A de l'annexe II du CGI).`, g.ranges);
      else out.add('ok', 'Numérotation continue des factures de vente', `${g.count} factures, de ${name}.`);
      if (g.dups.length) out.add('warn', 'Numéros de facture utilisés plusieurs fois', `${g.dups.length} numéro(s) en double : facture saisie deux fois ou n° réattribué ?`, g.dups);
      if (g.inversions) out.add('info', 'Numérotation non chronologique', `${g.inversions} facture(s) portant un numéro supérieur à une facture datée plus tard.`, g.invEx);
    });
    const od = overdue(r, '411', ref, terme);
    const dep = -solde(['491']);
    if (od.b91[1] > 0) out.add(dep >= od.b91[1] * 0.5 ? 'info' : 'warn', 'Créances clients échues depuis plus de 90 jours', `${eur(od.b91[1], 0)} € (${od.b91[0]} facture(s)) ; dépréciation comptabilisée (491) : ${eur(dep, 0)} €. Recouvrabilité à apprécier client par client.`, od.tiers.filter((t) => t.b91 > 0).slice(0, 12).map((t) => `${t.lib} : ${eur(t.b91)} € (${oldestTxt(t)})`));
    else if (cl.invoices) out.add('ok', 'Pas de créance échue depuis plus de 90 jours', `Échéance calculée à ${terme} jours de la date de facture.`);
    const douteux = solde(['416']);
    if (douteux > 0.01 && dep < 0.01) out.add('warn', 'Clients douteux sans dépréciation', `${eur(douteux, 0)} € en 416 sans dépréciation (491).`);
    if (cl.delay.lateN) out.add('info', 'Factures clients réglées à plus de 60 jours', `${cl.delay.lateN} facture(s), ${eur(cl.delay.lateAmt, 0)} € : relances et pénalités de retard (art. L441-10 du code de commerce).`, cl.customers.filter((c) => c.lateN).slice(0, 10).map((c) => `${c.lib} : ${c.lateN} facture(s), délai moyen ${c.delay} j`));
    else if (cl.delay.paidN) out.add('ok', 'Délais de paiement clients', `Délai moyen d'encaissement constaté : ${cl.delay.avg} jours.`);
    if (cl.overVat.n) out.add('warn', 'TVA collectée supérieure à 20 %', `${cl.overVat.n} facture(s) : erreur de saisie ?`, cl.overVat.ex, { full: cl.overVat.ex.length >= cl.overVat.n });
    if (cl.noVat.n) out.add('info', 'Factures de vente sans TVA', `${cl.noVat.n} facture(s), ${eur(cl.noVat.total, 0)} € HT : export, livraison intracommunautaire, autoliquidation ou exonération ? La mention correspondante doit figurer sur la facture.`, cl.noVat.ex, { full: cl.noVat.ex.length >= cl.noVat.n });
    cutCheck(out, cl.cut, 'Ventes');
    if (cl.lastWeek >= 5000 && cl.avgWeek > 0 && cl.lastWeek > 2.5 * cl.avgWeek) out.add('info', "Facturation inhabituelle en fin d'exercice", `${eur(cl.lastWeek, 0)} € TTC facturés les 7 derniers jours, contre ${eur(cl.avgWeek, 0)} € par semaine en moyenne : prestations achevées et livraisons effectuées à la clôture ?`);
    regulCheck(r, out, ['418'], "Factures à établir de l'exercice précédent non extournées");
    regulCheck(r, out, ['487'], "Produits constatés d'avance de l'exercice précédent non extournés");
    const top = cl.customers[0];
    if (top && top.share > 0.3 && cl.nbCustomers >= 3) out.add('info', `Dépendance client : ${top.lib}`, `${pctFr(top.share, 0)} du chiffre d'affaires facturé.`);
    if (cl.avoirs > 1000 && cl.avoirs > cl.ttc * 0.05) out.add('info', `Avoirs émis : ${eur(cl.avoirs, 0)} € TTC`, `${pctFr(cl.avoirs / cl.ttc)} de la facturation : litiges, remises de fin d'année, erreurs de facturation ?`);
    const factHT = cl.customers.reduce((s, c) => s + c.ht, 0);
    const sansClient = r.kpi.ca - factHT;
    if (r.kpi.ca > 0 && sansClient > 2000 && sansClient > r.kpi.ca * 0.1) out.add('info', "Chiffre d'affaires comptabilisé sans compte client", `${eur(sansClient, 0)} € (${pctFr(sansClient / r.kpi.ca, 0)}) : ventes au comptant ou encaissées directement en banque — Z de caisse, relevés et factures à rapprocher.`);
    if (prev) {
      const p = prev.cycles.clients;
      const now = new Set(cl.customers.filter((c) => c.ttc > 0).map((c) => norm(c.lib)));
      const lost = p.customers.filter((c) => c.ttc >= p.ttc * 0.05 && !now.has(norm(c.lib)));
      if (lost.length) out.add('info', 'Clients importants non refacturés', `${lost.length} client(s) significatif(s) de l'exercice précédent sans facture cette année.`, lost.slice(0, 10).map((c) => `${c.lib} : ${eur(c.ttc, 0)} € TTC en N-1`));
    }
    return out;
  }

  function chkTreso(r, ref) {
    const t = r.cycles.treso;
    const out = checksList();
    const { mv } = sums(r);
    const pharma = ui.fecProfile === 'pharmacie';
    linkedAlerts(r, out, ['Caisse créditrice', 'Banque créditrice en fin de période']);
    const banks = t.accounts.filter((a) => /^51[2-9]/.test(a.compte));
    banks.filter((a) => a.negDays > 0).forEach((a) => out.add(a.negDays > 30 ? 'warn' : 'info', `Découvert : ${a.lib || a.compte}`, `${a.negDays} jour(s) à découvert en comptabilité, plus bas ${eur(a.min)} € le ${fmtDate(a.minDate)} : autorisation de découvert, agios et rapprochement à vérifier.`));
    if (banks.length && !banks.some((a) => a.negDays)) out.add('ok', 'Aucun découvert bancaire en comptabilité', `${banks.length} compte(s) bancaire(s) toujours créditeurs.`);
    if (t.cash.n) out.add('warn', 'Opérations en espèces de 1 000 € ou plus', `${t.cash.n} opération(s), ${eur(t.cash.total, 0)} € : paiement en espèces limité à 1 000 € entre professionnels et avec les particuliers résidents (art. L112-6 et D112-3 du code monétaire et financier), amende jusqu'à 5 % des sommes.`, t.cash.ex, { full: t.cash.ex.length >= t.cash.n });
    else if (t.accounts.some((a) => a.compte.startsWith('53'))) out.add('ok', 'Pas de paiement en espèces de 1 000 € ou plus', '');
    const caisses = t.accounts.filter((a) => a.compte.startsWith('53'));
    const totCaisse = caisses.reduce((s, a) => s + a.solde, 0);
    if (totCaisse > Math.max(3000, r.kpi.ca / 24)) out.add('info', `Solde de caisse élevé : ${eur(totCaisse, 0)} €`, "Plus de deux semaines de chiffre d'affaires en espèces : procès-verbal de caisse, remises en banque non comptabilisées ?");
    caisses.filter((a) => a.last && Math.abs(a.solde) >= 1 && daysUntilFrom(a.last, ref) > 60).forEach((a) => out.add('info', `Caisse sans mouvement depuis le ${fmtDate(a.last)}`, `${a.lib} : solde de ${eur(a.solde)} € inchangé : espèces réellement détenues ?`));
    const vi = t.accounts.filter((a) => a.compte.startsWith('58') && Math.abs(a.solde) >= 0.01);
    if (vi.length) out.add('warn', 'Virements internes non soldés', 'Le compte 58 doit être soldé : virement de compte à compte dont une seule moitié est comptabilisée.', vi.map((a) => `${a.compte} ${a.lib} : ${eur(a.solde)} €`));
    if (!pharma) {
      const ve = t.accounts.filter((a) => a.compte.startsWith('511') && Math.abs(a.solde) >= 0.01);
      if (ve.length) out.add('info', "Valeurs à l'encaissement non soldées", "Chèques ou remises de cartes en attente : vérifier leur crédit en banque après la date d'arrêté.", ve.map((a) => `${a.compte} ${a.lib} : ${eur(a.solde)} €`));
    }
    banks.filter((a) => Math.abs(a.solde) >= 1 && a.last && daysUntilFrom(a.last, ref) > 60).forEach((a) => out.add('info', `Compte bancaire sans mouvement depuis le ${fmtDate(a.last)}`, `${a.lib || a.compte} : solde de ${eur(a.solde)} € — relevé à la date d'arrêté, ou compte clôturé à solder.`));
    const agios = mv(['6615']);
    if (agios > 50 && banks.length && !banks.some((a) => a.negDays)) out.add('info', 'Agios sans découvert en comptabilité', `${eur(agios, 0)} € d'intérêts bancaires alors que les comptes ne sont jamais débiteurs en comptabilité : découverts en dates de valeur, ou écritures saisies en retard.`);
    const moves = (re) => t.big.filter((m) => re.test(m.cp)).slice(0, 10).map((m) => `${fmtDate(m.date)} · ${m.amt > 0 ? '+' : ''}${eur(m.amt)} € · ${m.cp} ${m.cplib} · ${m.lib}`);
    const as = t.flux.find((f) => f.cat === 'associes');
    if (as && as.enc + as.dec >= 1000) out.add('info', `Flux avec les associés : apports ${eur(as.enc, 0)} €, retraits ${eur(as.dec, 0)} €`, 'Justificatifs et convention de compte courant ; des retraits répétés constituent des avances au dirigeant à surveiller.', moves(/^45/));
    const dv = t.flux.find((f) => f.cat === 'divers');
    if (dv && dv.enc + dv.dec >= 500) out.add('info', "Mouvements bancaires sur des comptes d'attente ou divers", `Encaissements ${eur(dv.enc, 0)} €, décaissements ${eur(dv.dec, 0)} € : opérations à identifier avant la clôture.`, moves(/^4[67]/));
    if (r.kpi.tresorerie < 0) out.add('warn', 'Trésorerie nette négative', `${eur(r.kpi.tresorerie, 0)} € : continuité d'exploitation et financement à examiner.`);
    return out;
  }

  // Contrôles des quatre cycles (mis en cache par résultat et paramètres).
  function cycleChecks(r) {
    if (!r || !r.cycles) return null;
    const ref = pharmaRef(r);
    const prev = fecPrev();
    const terme = fecTerme();
    const key = [ref, ui.fecProfile, prev ? prev.meta.fileName : '', terme, r.alerts.length, ui.fec.clientId || '', Object.keys(wpMemo()).length].join('|');
    if (r._cc && r._cc.key === key) return r._cc.val;
    const val = {
      achats: applyMemo(chkAchats(r, ref, prev, terme), 'achats'),
      charges: applyMemo(chkCharges(r, ref, prev), 'charges'),
      clients: ui.fecProfile === 'pharmacie' ? [] : applyMemo(chkClients(r, ref, prev, terme), 'clients'),
      treso: applyMemo(chkTreso(r, ref), 'treso'),
    };
    Object.defineProperty(r, '_cc', { value: { key, val }, configurable: true, writable: true, enumerable: false });
    return val;
  }

  // Points propres aux cycles (hors points généraux déjà repris), avec le nom du cycle.
  function cyclePoints(r) {
    const cc = cycleChecks(r);
    if (!cc) return [];
    return Object.keys(cc).flatMap((k) => cc[k].filter((x) => !x.linked).map((x) => Object.assign({}, x, { cycle: k })));
  }

  const kpiTile = (label, value, cls, n1) => `<div class="kpi ${cls || ''}"><strong>${value}</strong><span>${label}</span>${n1 !== undefined && n1 !== null ? `<em>N-1 : ${n1}</em>` : ''}</div>`;
  const daysTxt = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${Math.round(v)} j`);

  function cycleHead(key, intro) {
    const list = cycleChecks(ui.fec.result)[key];
    const n = (lvl) => list.filter((x) => x.level === lvl).length;
    return `<section class="card"><h2>Contrôles — ${esc(CYCLES[key])} <span class="count">${wpProgress(key, list).left}</span></h2>
      <p class="muted small">${intro}</p>${wpCycleBar(key, list)}${wpCheckList(list, key)}</section>`;
  }

  function terminput() {
    return `<label class="inline-label">Échéance des factures <input type="number" min="0" max="180" step="1" data-fec="terme" value="${fecTerme()}" aria-label="Délai de paiement en jours"> jours après la date de facture</label>`;
  }

  // Tableau des factures non réglées dont le terme est échu (art. D441-6 du code de commerce).
  function overdueTable(od, base, baseLabel, title) {
    const cols = ['b1', 'b31', 'b61', 'b91'];
    const pc = (v) => (base > 0 ? pctFr(v / base) : '—');
    return `<h3>${esc(title)}</h3>
      <div class="grid-wrap"><table class="dtable num d441"><thead><tr><th>Retard après l'échéance</th><th>1 à 30 j</th><th>31 à 60 j</th><th>61 à 90 j</th><th>91 j et plus</th><th>Total</th></tr></thead>
      <tbody>
        <tr><td>Nombre de factures</td>${cols.map((k) => `<td>${od[k][0]}</td>`).join('')}<td>${od.total[0]}</td></tr>
        <tr><td>Montant TTC</td>${cols.map((k) => `<td>${eur(od[k][1], 0)}</td>`).join('')}<td>${eur(od.total[1], 0)}</td></tr>
        <tr><td>% ${esc(baseLabel)}</td>${cols.map((k) => `<td>${pc(od[k][1])}</td>`).join('')}<td>${pc(od.total[1])}</td></tr>
      </tbody></table></div>`;
  }

  function tiersTableHtml(list, prevList, kind) {
    const prevBy = new Map((prevList || []).map((x) => [norm(x.lib), x]));
    const rows = list.filter((x) => x.inv || Math.abs(x.s || 0) >= 0.01).slice(0, 30);
    if (!rows.length) return '<p class="muted">Aucune facture identifiée.</p>';
    return `<div class="grid-wrap"><table class="dtable num tiers-cyc"><thead><tr><th>${kind === 'clients' ? 'Client' : 'Fournisseur'}</th><th>Factures</th><th>TTC</th><th>Part</th>${prevList ? '<th>N-1</th>' : ''}<th>Avoirs</th><th>Solde</th><th>Délai moyen</th><th>&gt; 60 j</th></tr></thead>
      <tbody>${rows.map((x) => {
        const p = prevBy.get(norm(x.lib));
        const s = kind === 'clients' ? x.s : -x.s;
        return `<tr><td>${esc(x.lib)} <span class="muted small">${esc(x.num)}</span></td><td>${x.inv}</td><td>${eur(x.ttc, 0)}</td><td>${x.share ? pctFr(x.share, 0) : ''}</td>${prevList ? `<td>${p ? eur(p.ttc, 0) : '—'}</td>` : ''}
          <td>${x.avAmt ? eur(x.avAmt, 0) : ''}</td><td class="${s < 0 ? 'cred' : ''}">${eur(s || 0, 0)}</td><td>${daysTxt(x.delay)}</td><td>${x.lateN || ''}</td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="muted small">Délai moyen pondéré par les montants, entre la facture et son règlement (${(list.some((x) => x.paidN) ? 'lettrage du FEC, ou à défaut règlements imputés sur les factures les plus anciennes' : 'aucun règlement identifié')}). Solde positif = ${kind === 'clients' ? 'dû par le client' : 'dû au fournisseur'}.</p>`;
  }

  function viewAchats() {
    const f = ui.fec, r = f.result, a = r.cycles.achats, prev = fecPrev();
    const { mv, solde } = sums(r);
    const ps = prev ? sums(prev) : null;
    const ref = pharmaRef(r);
    const od = overdue(r, '401', ref, fecTerme());
    const rt = ratios(r);
    return `
      <div class="kpis fec-kpis">
        ${kpiTile('Achats consommés (60)', eurK(mv(['60'])), '', ps ? eurK(ps.mv(['60'])) : null)}
        ${kpiTile('Factures fournisseurs', a.invoices.toLocaleString('fr-FR'), '', prev ? prev.cycles.achats.invoices.toLocaleString('fr-FR') : null)}
        ${kpiTile('Fournisseurs actifs', a.nbSuppliers, '', prev ? prev.cycles.achats.nbSuppliers : null)}
        ${kpiTile('Dettes fournisseurs', eurK(Math.max(0, -solde(['40'], ['408', '409']))), '', ps ? eurK(Math.max(0, -ps.solde(['40'], ['408', '409']))) : null)}
        ${kpiTile('Délai de paiement réel', daysTxt(a.delay.avg), a.delay.avg > 60 ? 'kpi-late' : '', prev ? daysTxt(prev.cycles.achats.delay.avg) : null)}
        ${kpiTile('Crédit fournisseurs (bilan)', daysTxt(rt.dpo), '', prev ? daysTxt(ratios(prev).dpo) : null)}
      </div>
      ${cycleHead('achats', "Factures en double, dettes anciennes, délais de paiement, TVA déductible, séparation des exercices et factures non parvenues. Cliquez sur un point pour voir le détail.")}
      ${r.monthly.length ? `<section class="card"><h2>Achats et charges externes par mois</h2>
        ${legend([['--series-1', 'Achats (60)'], ['--series-2', 'Charges externes (61-62)']])}
        ${barChart(r.monthly, [{ key: 'achats', label: 'Achats', color: '--series-1' }, { key: 'ext', label: 'Charges externes', color: '--series-2' }], { aria: 'Achats et charges externes par mois', xLabel: (x) => moisLabel(x.mois), tipTitle: (x) => moisLabel(x.mois).replace(/ \d+$/, '') + ' ' + x.mois.slice(0, 4) })}
      </section>` : ''}
      <section class="card"><h2>Principaux fournisseurs</h2>${tiersTableHtml(a.suppliers, prev ? prev.cycles.achats.suppliers : null, 'fournisseurs')}</section>
      <section class="card"><h2>Factures reçues non réglées à échéance dépassée</h2>
        <div class="filters">${terminput()}<span class="muted small">au ${fmtDate(ref)}</span></div>
        ${overdueTable(od, a.ttc, 'des achats TTC de l\'exercice', 'Tableau des délais de paiement fournisseurs (art. D441-6 du code de commerce)')}
        ${od.tiers.length ? `<details class="viz-table"><summary>Détail par fournisseur (${od.tiers.length})</summary><div class="grid-wrap"><table class="dtable num"><thead><tr><th>Fournisseur</th><th>Échu</th><th>dont &gt; 90 j</th><th>Plus ancienne</th></tr></thead>
          <tbody>${od.tiers.slice(0, 60).map((t) => `<tr><td>${esc(t.lib)}</td><td>${eur(t.late, 0)}</td><td>${t.b91 ? eur(t.b91, 0) : ''}</td><td>${t.oldest === '0' ? 'À-nouveau' : fmtDate(t.oldest)}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
      </section>`;
  }

  function monthDots(a, period) {
    return `<span class="mdots" aria-label="${period.filter((ym) => Math.abs(a.months[ym] || 0) >= 0.01).length} mois sur ${period.length}">${period.map((ym) => `<i class="${Math.abs(a.months[ym] || 0) >= 0.01 ? 'on' : ''}" title="${esc(`${moisLabel(ym).replace(/ \d+$/, '')} ${ym.slice(0, 4)} : ${eur(a.months[ym] || 0, 0)} €`)}"></i>`).join('')}</span>`;
  }

  function viewCharges() {
    const f = ui.fec, r = f.result, ch = r.cycles.charges, prev = fecPrev();
    const { mv, solde } = sums(r);
    const ext = mv(['61', '62']);
    const ca = r.kpi.ca;
    const prevAcc = new Map(prev ? prev.cycles.charges.accounts.map((a) => [a.compte, a]) : []);
    const last = [pharmaRef(r), r.pieces.maxOp || pharmaRef(r)].sort()[0];
    const period = monthsBetween(ymOf(r.meta.start && r.meta.start <= last ? r.meta.start : r.pieces.minOp || last), ymOf(last)).slice(-15);
    const direct = ch.accounts.reduce((s, a) => s + Math.max(0, a.direct), 0);
    const est = ch.cca.reduce((s, x) => s + x.cca, 0);
    const groups = {};
    ch.accounts.filter((a) => Math.abs(a.total) >= 0.01 || prevAcc.has(a.compte)).forEach((a) => (groups[a.compte.slice(0, 3)] = groups[a.compte.slice(0, 3)] || []).push(a));
    prevAcc.forEach((p) => { if (!ch.accounts.some((a) => a.compte === p.compte) && Math.abs(p.total) >= 0.01) (groups[p.compte.slice(0, 3)] = groups[p.compte.slice(0, 3)] || []).push({ compte: p.compte, lib: p.lib, total: 0, months: {}, direct: 0 }); });
    const pc = (v) => (ca > 0 ? pctFr(v / ca) : '—');
    const varCell = (n, p) => (prev ? `<td>${eur(p, 0)}</td>${pctCell(p ? (n - p) / Math.abs(p) : null)}` : '');
    const rows = Object.keys(groups).sort().map((g) => {
      const list = groups[g].sort((x, y) => x.compte.localeCompare(y.compte));
      const tot = list.reduce((s, a) => s + a.total, 0);
      const totP = list.reduce((s, a) => s + ((prevAcc.get(a.compte) || {}).total || 0), 0);
      return `<tr class="strong"><td>${g}</td><td>${esc(RUB3[g] || '')}</td><td>${eur(tot, 0)}</td><td>${pc(tot)}</td>${varCell(tot, totP)}<td></td><td></td></tr>
        ${list.map((a) => `<tr><td>${esc(a.compte)}</td><td>${esc(a.lib)}</td><td>${eur(a.total, 0)}</td><td>${pc(a.total)}</td>${varCell(a.total, (prevAcc.get(a.compte) || {}).total || 0)}<td>${monthDots(a, period)}</td><td>${a.direct > 0.5 && a.total > 0 ? pctFr(Math.min(1, a.direct / a.total), 0) : ''}</td></tr>`).join('')}`;
    }).join('');
    return `
      <div class="kpis fec-kpis">
        ${kpiTile('Charges externes (61-62)', eurK(ext), '', prev ? eurK(sums(prev).mv(['61', '62'])) : null)}
        ${kpiTile("Part du chiffre d'affaires", ca > 0 ? pctFr(ext / ca) : '—', '', prev && prev.kpi.ca > 0 ? pctFr(sums(prev).mv(['61', '62']) / prev.kpi.ca) : null)}
        ${kpiTile('Payées sans facture fournisseur', eurK(direct))}
        ${kpiTile("Charges constatées d'avance estimées", eurK(est), est > solde(['486']) * 2 && est > 0 ? 'kpi-wait' : '')}
        ${kpiTile('Bénéficiaires DAS2', ch.das2.length)}
        ${kpiTile('Dépenses à justifier', ch.perso.n + ch.amendes.n, ch.perso.n + ch.amendes.n ? 'kpi-wait' : '')}
      </div>
      ${cycleHead('charges', "Charges récurrentes manquantes, charges constatées d'avance, honoraires (DAS2), dépenses personnelles, amendes, cadeaux, notes de frais et séparation des exercices.")}
      <section class="card"><h2>Charges externes par compte</h2>
        <div class="grid-wrap"><table class="dtable num cyc-ext"><thead><tr><th>Compte</th><th>Libellé</th><th>Montant</th><th>% CA</th>${prev ? '<th>N-1</th><th>Var.</th>' : ''}<th>Mois mouvementés</th><th>Payé direct</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="8" class="muted">Aucune charge externe.</td></tr>'}</tbody></table></div>
        <p class="muted small">Chaque point représente un mois de la période (plein : charge comptabilisée). « Payé direct » : part réglée depuis la banque sans compte fournisseur.</p>
      </section>
      ${ch.cca.length ? `<section class="card"><h2>Charges constatées d'avance probables au ${fmtDate(r.meta.closing)}</h2>
        <div class="grid-wrap"><table class="dtable num l3"><thead><tr><th>Date</th><th>Compte</th><th>Libellé</th><th>Montant</th><th>Période présumée</th><th>CCA estimée</th></tr></thead>
        <tbody>${ch.cca.map((x) => `<tr><td>${fmtDate(x.date)}</td><td>${esc(x.compte)}</td><td>${esc(x.label)}</td><td>${eur(x.amt, 0)}</td><td>${x.cover} mois</td><td>${eur(x.cca, 0)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th colspan="5">Total estimé (486 comptabilisé : ${eur(solde(['486']), 0)} €)</th><th>${eur(est, 0)}</th></tr></tfoot></table></div>
        <p class="muted small">Paiements isolés de plus de 300 € sur des comptes réglés une à quatre fois par an (assurances, loyers, maintenance, abonnements…) : la période couverte est présumée de 12 ou 3 mois à partir de la date de la pièce.</p></section>` : ''}
      ${ch.das2.length ? `<section class="card"><h2>Honoraires et commissions à déclarer (DAS2)</h2>
        <div class="grid-wrap"><table class="dtable num"><thead><tr><th>Bénéficiaire</th><th>Comptes</th><th>Montant TTC estimé</th></tr></thead>
        <tbody>${ch.das2.map((b) => `<tr><td>${esc(b.benef)}</td><td>${esc(b.comptes.join(', '))}</td><td>${eur(b.total, 0)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
  }

  function viewClients() {
    const f = ui.fec, r = f.result, cl = r.cycles.clients, prev = fecPrev();
    const { solde } = sums(r);
    const ps = prev ? sums(prev) : null;
    const ref = pharmaRef(r);
    const od = overdue(r, '411', ref, fecTerme());
    const rt = ratios(r);
    return `
      <div class="kpis fec-kpis">
        ${kpiTile("Chiffre d'affaires HT", eurK(r.kpi.ca), '', prev ? eurK(prev.kpi.ca) : null)}
        ${kpiTile('Factures émises', cl.invoices.toLocaleString('fr-FR'), '', prev ? prev.cycles.clients.invoices.toLocaleString('fr-FR') : null)}
        ${kpiTile('Créances clients', eurK(Math.max(0, solde(['41'], ['419']))), '', ps ? eurK(Math.max(0, ps.solde(['41'], ['419']))) : null)}
        ${kpiTile("Délai d'encaissement réel", daysTxt(cl.delay.avg), cl.delay.avg > 60 ? 'kpi-late' : '', prev ? daysTxt(prev.cycles.clients.delay.avg) : null)}
        ${kpiTile('Crédit clients (bilan)', daysTxt(rt.dso), '', prev ? daysTxt(ratios(prev).dso) : null)}
        ${kpiTile('Échu depuis plus de 90 j', eurK(od.b91[1]), od.b91[1] > 0 ? 'kpi-late' : '')}
      </div>
      ${cycleHead('clients', "Numérotation des factures, créances échues et dépréciations, délais d'encaissement, TVA collectée, séparation des exercices, factures à établir et produits constatés d'avance.")}
      <section class="card"><h2>Principaux clients</h2>${tiersTableHtml(cl.customers, prev ? prev.cycles.clients.customers : null, 'clients')}</section>
      <section class="card"><h2>Factures émises non réglées à échéance dépassée</h2>
        <div class="filters">${terminput()}<span class="muted small">au ${fmtDate(ref)}</span></div>
        ${overdueTable(od, cl.ttc, "du chiffre d'affaires TTC facturé", 'Tableau des délais de paiement clients (art. D441-6 du code de commerce)')}
        ${od.tiers.length ? `<details class="viz-table"><summary>Détail par client (${od.tiers.length})</summary><div class="grid-wrap"><table class="dtable num"><thead><tr><th>Client</th><th>Échu</th><th>dont &gt; 90 j</th><th>Plus ancienne</th></tr></thead>
          <tbody>${od.tiers.slice(0, 60).map((t) => `<tr><td>${esc(t.lib)}</td><td>${eur(t.late, 0)}</td><td>${t.b91 ? eur(t.b91, 0) : ''}</td><td>${t.oldest === '0' ? 'À-nouveau' : fmtDate(t.oldest)}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
      </section>
      ${cl.numbering.length ? `<section class="card"><h2>Numérotation des factures de vente</h2>
        <div class="grid-wrap"><table class="dtable num"><thead><tr><th>Série</th><th>Factures</th><th>Du n°</th><th>Au n°</th><th>Manquants</th><th>Doublons</th></tr></thead>
        <tbody>${cl.numbering.map((g) => `<tr><td>${esc(g.prefix || '(sans préfixe)')}${g.sparse ? ' <span class="muted small">n° d\'écriture ?</span>' : ''}</td><td>${g.count}</td><td>${g.first}</td><td>${g.last}</td><td>${g.sparse ? '—' : g.missing}</td><td>${g.dups.length || ''}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
  }

  function viewTreso() {
    const f = ui.fec, r = f.result, t = r.cycles.treso, prev = fecPrev();
    const { mv } = sums(r);
    const enc = r.monthly.reduce((s, m) => s + (m.enc || 0), 0);
    const dec = r.monthly.reduce((s, m) => s + (m.dec || 0), 0);
    const low = r.monthly.length ? r.monthly.reduce((m, x) => (x.tresorerie < m.tresorerie ? x : m)) : null;
    const neg = Math.max(0, ...t.accounts.filter((a) => /^51[2-9]/.test(a.compte)).map((a) => a.negDays));
    const bigOther = t.big;
    const totF = t.flux.reduce((s, x) => ({ enc: s.enc + x.enc, dec: s.dec + x.dec }), { enc: 0, dec: 0 });
    return `
      <div class="kpis fec-kpis">
        ${kpiTile('Trésorerie de fin', eurK(r.kpi.tresorerie), r.kpi.tresorerie < 0 ? 'kpi-late' : '', prev ? eurK(prev.kpi.tresorerie) : null)}
        ${kpiTile('Encaissements', eurK(enc))}
        ${kpiTile('Décaissements', eurK(dec))}
        ${kpiTile('Plus bas de fin de mois', low ? eurK(low.tresorerie) : '—', low && low.tresorerie < 0 ? 'kpi-late' : '')}
        ${kpiTile('Jours de découvert', neg, neg ? 'kpi-wait' : '')}
        ${kpiTile('Frais et agios bancaires', eurK(mv(['627', '6615'])), '', prev ? eurK(sums(prev).mv(['627', '6615'])) : null)}
      </div>
      ${cycleHead('treso', "Découverts, caisse, espèces de 1 000 € ou plus, virements internes, comptes dormants, flux avec les associés et comptes d'attente. Le rapprochement avec le relevé se fait dans l'onglet Rapprochement.")}
      ${r.monthly.length ? `<section class="card"><h2>Encaissements et décaissements par mois</h2>
        ${legend([['--series-1', 'Encaissements'], ['--series-2', 'Décaissements']])}
        ${barChart(r.monthly, [{ key: 'enc', label: 'Encaissements', color: '--series-1' }, { key: 'dec', label: 'Décaissements', color: '--series-2' }], { aria: 'Encaissements et décaissements par mois', xLabel: (x) => moisLabel(x.mois), tipTitle: (x) => moisLabel(x.mois).replace(/ \d+$/, '') + ' ' + x.mois.slice(0, 4) })}
        <p class="muted small">Banques (512 et suivants) et caisses (53), hors virements internes.</p>
      </section>` : ''}
      <section class="card"><h2>Comptes de trésorerie</h2>
        <div class="grid-wrap"><table class="dtable num"><thead><tr><th>Compte</th><th>Libellé</th><th>Ouverture</th><th>Encaissements</th><th>Décaissements</th><th>Solde</th><th>Plus bas</th><th>Jours débiteurs</th><th>Dernière opération</th></tr></thead>
        <tbody>${t.accounts.map((a) => `<tr><td>${esc(a.compte)}</td><td>${esc(a.lib)}</td><td>${eur(a.an, 0)}</td><td>${eur(a.enc, 0)}</td><td>${eur(a.dec, 0)}</td><td class="${a.solde < 0 ? 'cred' : ''}">${eur(a.solde, 0)}</td>
          <td class="${a.min < 0 ? 'cred' : ''}">${eur(a.min, 0)}${a.minDate && a.min < a.an - 0.005 ? ` <span class="muted small">${fmtDate(a.minDate)}</span>` : ''}</td><td>${a.negDays || ''}</td><td>${a.last ? fmtDate(a.last) : '—'}</td></tr>`).join('')}</tbody></table></div>
      </section>
      <section class="card"><h2>Origine et destination des flux</h2>
        <div class="grid-wrap"><table class="dtable num sig r2"><thead><tr><th>Nature (contrepartie)</th><th>Encaissements</th><th>Décaissements</th><th>Net</th></tr></thead>
        <tbody>${t.flux.map((x) => `<tr><td>${esc(x.label)}</td><td>${eur(x.enc, 0)}</td><td>${eur(x.dec, 0)}</td><td class="${x.enc - x.dec < 0 ? 'cred' : ''}">${eur(x.enc - x.dec, 0)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th>Total</th><th>${eur(totF.enc, 0)}</th><th>${eur(totF.dec, 0)}</th><th>${eur(totF.enc - totF.dec, 0)}</th></tr></tfoot></table></div>
        <p class="muted small">Chaque mouvement de banque ou de caisse est classé selon le compte de contrepartie de l'écriture.</p>
      </section>
      ${bigOther.length ? `<section class="card"><h2>Mouvements importants hors clients, fournisseurs et paie</h2>
        <div class="grid-wrap"><table class="dtable num l3 l4"><thead><tr><th>Date</th><th>Compte</th><th>Contrepartie</th><th>Libellé</th><th>Montant</th></tr></thead>
        <tbody>${bigOther.slice(0, 20).map((m) => `<tr><td>${fmtDate(m.date)}</td><td>${esc(m.compte)}</td><td>${esc(m.cp)} <span class="muted small">${esc(m.cplib)}</span></td><td>${esc(m.lib)}</td><td class="${m.amt < 0 ? 'cred' : ''}">${eur(m.amt, 0)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
  }

  // Carte de la synthèse : un accès par cycle avec le nombre de points.
  function cyclesCard(r) {
    const cc = cycleChecks(r);
    if (!cc) return '';
    const keys = Object.keys(CYCLES).filter((k) => k !== 'clients' || ui.fecProfile !== 'pharmacie');
    return `<section class="card"><div class="card-head"><h2>Cycles de révision</h2><button class="btn small" data-action="wp-print">Dossier de travail (PDF)</button></div><div class="kpis fec-kpis cycle-tiles">${keys.map((k) => {
      const pg = wpProgress(k, cc[k]);
      const rev = wpStore().cycles[k];
      return `<button class="kpi cycle-tile ${pg.left ? 'kpi-wait' : ''}" data-action="fec-tab" data-tab="${k}"><strong>${pg.left}</strong><span>${esc(CYCLES[k])}</span><em>${pg.total ? `${pg.done} / ${pg.total} traité(s)${pg.wait ? ` · ${pg.wait} en attente` : ''}` : 'rien à signaler'}${rev ? ` · revu ✓` : ''}</em></button>`;
    }).join('')}</div></section>`;
  }

  // ---------- Justificatifs (archive FEC + pièces) ----------

  const justifOk = (r) => !!(r.cycles && r.cycles.justif && r.cycles.justif.reliable);
  const JUSTIF_KINDS = { achat: 'Factures fournisseurs', vente: 'Factures de vente', direct: 'Dépenses payées directement' };

  function justifCard(r) {
    const j = r.cycles && r.cycles.justif;
    if (!j) return '';
    const pc = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—');
    return `<section class="card"><h2>Justificatifs de l'archive</h2>
      <p class="muted small">${j.docs.toLocaleString('fr-FR')} fichier(s) dans l'archive${j.attCol ? `, colonne « ${esc(j.attCol)} » du FEC utilisée` : ''}. Chaque écriture est rapprochée d'un justificatif par ${j.attCol ? 'le nom de pièce jointe indiqué dans le FEC' : 'son n° de pièce, retrouvé dans le nom du fichier'} ; seuls les noms des fichiers sont lus.</p>
      <div class="grid-wrap"><table class="dtable num"><thead><tr><th>Écritures</th><th></th><th>Total</th><th>Avec justificatif</th><th>Sans justificatif</th><th>Non rapprochables</th></tr></thead>
      <tbody>${Object.entries(JUSTIF_KINDS).map(([k, l]) => { const x = j.kinds[k]; return `<tr><td>${l}</td><td></td><td>${x.n}</td><td>${x.ok} <span class="muted small">${pc(x.ok, x.n - x.unk)}</span></td><td class="${x.n - x.unk - x.ok ? 'cred' : ''}">${x.n - x.unk - x.ok}</td><td>${x.unk || ''}</td></tr>`; }).join('')}</tbody></table></div>
      ${j.reliable ? `<p class="muted small">Les ${j.missingTotal} écriture(s) sans justificatif sont reprises une par une dans les <strong>pièces à demander</strong> (au client ou directement au fournisseur).</p>`
        : `<div class="banner warn"><span><strong>Rapprochement peu fiable</strong> : ${j.judged ? `seulement ${j.ok} pièce(s) sur ${j.judged} retrouvée(s)` : 'aucun n° de pièce exploitable'}. Les noms des fichiers ne semblent pas reprendre le n° de pièce des écritures, les pièces à demander restent donc établies sans l'archive. Exemples de fichiers : ${j.samples.docs.map((x) => `« ${esc(x)} »`).join(', ') || '—'} ; exemples de n° de pièce : ${j.samples.pieces.map((x) => `« ${esc(x)} »`).join(', ') || '—'}. Indiquez à votre interlocuteur comment Pennylane nomme les fichiers pour adapter le rapprochement.</span></div>`}
    </section>`;
  }

  // Écritures sans justificatif sur la période, regroupées par tiers.
  function justifPieces(r, push, from, to, scope) {
    if (!justifOk(r)) return;
    const d = fmtDate;
    const list = r.cycles.justif.missing.filter((x) => x.date >= from && x.date <= to);
    const desc = (x) => `${x.avoir ? 'avoir' : 'facture'}${x.piece ? ` n° ${x.piece}` : ''} du ${d(x.date)} (${eur(Math.abs(x.amt))} €)`;
    const groups = new Map();
    list.filter((x) => x.kind !== 'direct').forEach((x) => { const k = x.kind + '|' + x.num; (groups.get(k) || groups.set(k, []).get(k)).push(x); });
    groups.forEach((l) => {
      const x0 = l[0];
      const items = l.slice(0, 12).map(desc).join(', ') + (l.length > 12 ? ` et ${l.length - 12} autre(s)` : '');
      if (x0.kind === 'achat') push('achats', `jm:${scope}:${x0.num}`, `${l.length > 1 ? 'Factures' : 'Facture'} ${x0.tlib} : ${items}`);
      else push('ventes', `jv:${scope}:${x0.num}`, `${l.length > 1 ? 'Factures de vente' : 'Facture de vente'} à ${x0.tlib} : ${items}`);
    });
    list.filter((x) => x.kind === 'direct').slice(0, 60).forEach((x, i) => push('justif', `jd:${scope}:${i}`, `Justificatif « ${x.lib} » du ${d(x.date)} (${eur(x.amt)} €)`));
  }

  // Pièces et questions issues des cycles.
  function cyclePieces(r, mode, arrete, push) {
    if (!r.cycles) return;
    const cy = r.cycles;
    const d = fmtDate;
    const bilan = mode === 'bilan';
    if (ui.fecProfile !== 'pharmacie') cy.clients.numbering.filter((g) => !g.sparse && g.missing).forEach((g) => {
      push('ventes', 'num:' + g.prefix, g.missing <= 30
        ? `Factures de vente n° ${g.ranges.join(', ')} : copies, ou confirmation de leur annulation (absentes de la comptabilité)`
        : `Liste des factures de vente de la série ${g.prefix} (${g.missing} numéros absents de la comptabilité entre ${g.first} et ${g.last})`);
    });
    const item = (x) => `« ${x.lib} » du ${d(x.date)} (${eur(Math.abs(x.amt))} €)`;
    const OPS = 'Opérations en espèces de 1 000 € ou plus', PERSO = 'Dépenses à caractère personnel possibles';
    cy.treso.cash.items.filter((x) => x.date <= arrete && !memoHas('treso', OPS, x.lib)).slice(0, 10).forEach((x, i) => push('caisse', 'esp:' + i, `Justificatif de l'opération en espèces ${item(x)} : paiement en espèces limité à 1 000 €`));
    (cy.charges.perso.groups || []).filter((g) => g.first <= arrete && !memoHas('charges', PERSO, g.lib)).slice(0, 10).forEach((g, i) => push('questions', 'perso:' + i, g.n === 1
      ? `Caractère professionnel de la dépense « ${g.lib} » du ${d(g.first)} (${eur(g.total)} €)`
      : `Caractère professionnel des dépenses « ${g.lib} » : ${g.n} paiements du ${d(g.first)} au ${d(g.last)} (${eur(g.total)} €)`));
    if (cy.charges.amendes.n && !memoHas('charges', 'Amendes et pénalités en charges déductibles', '*')) push('questions', 'amendes', `Avis de contravention ou de pénalité réglés par l'entreprise (${cy.charges.amendes.n}, ${eur(cy.charges.amendes.total)} €) : nature et, pour les contraventions, désignation du conducteur`);
    if (cy.charges.notesFrais.n && !memoHas('charges', "Dépenses avancées par l'associé", '*')) push('justif', 'ndf', `Notes de frais et justificatifs des ${cy.charges.notesFrais.n} dépense(s) avancée(s) par l'associé (${eur(cy.charges.notesFrais.total)} €)`);
    if (bilan) {
      cy.charges.cca.slice(0, 8).forEach((x, i) => push('cloture', 'cca:' + i, `Facture « ${x.label} » du ${d(x.date)} (${eur(x.amt)} €) : période couverte, pour les charges constatées d'avance`));
      const re = ignoredRe();
      const das2 = cy.charges.das2.filter((b) => !re || !re.test(norm(b.benef)));
      if (das2.length && !memoHas('charges', 'DAS2 : 0 bénéficiaire(s) de plus de 1 200 €', '*')) push('questions', 'das2', `Pour la DAS2 : SIRET et adresse de ${das2.slice(0, 8).map((b) => b.benef).join(', ')}${das2.length > 8 ? '…' : ''}`);
    }
  }

  // ---------- Contrôle de la TVA du mois (ou du trimestre) ----------

  const QUARTER_NAMES = ['1er', '2e', '3e', '4e'];
  const rateTxt = (r) => `${String(r).replace('.', ',')} %`;
  // Ligne de la déclaration CA3 (formulaire 3310-CA3) pour chaque taux.
  const CA3_RATE_LINE = { 20: '08', 5.5: '09', 10: '9B', 8.5: '10', 2.1: '14', 13: '14', 0.9: '14', 1.05: '14', 19.6: '13', 7: '13' };

  // Période : « 2025-06 » (mois) ou « 2025-T2 » (trimestre).
  function tvaPeriod(key) {
    const q = key.match(/^(\d{4})-T([1-4])$/);
    if (q) {
      const y = q[1], n = Number(q[2]);
      const months = [1, 2, 3].map((k) => `${y}-${pad((n - 1) * 3 + k)}`);
      return { key, kind: 'quarter', months, label: `${QUARTER_NAMES[n - 1]} trimestre ${y}`, exercice: `T${n} ${y}`, start: `${months[0]}-01`, end: endOfMonth(`${months[2]}-01`) };
    }
    return { key, kind: 'month', months: [key], label: moisNom(`${key}-01`), exercice: `${key.slice(5)}/${key.slice(0, 4)}`, start: `${key}-01`, end: endOfMonth(`${key}-01`) };
  }
  const quarterOf = (ym) => `${ym.slice(0, 4)}-T${Math.ceil(Number(ym.slice(5, 7)) / 3)}`;
  const prevPeriodKey = (key) => {
    const q = key.match(/^(\d{4})-T([1-4])$/);
    if (q) return Number(q[2]) > 1 ? `${q[1]}-T${Number(q[2]) - 1}` : `${Number(q[1]) - 1}-T4`;
    return ymOf(addDays(`${key}-01`, -1));
  };

  function tvaRegime() {
    const c = clientById(ui.fec.clientId);
    return c ? tvaShort(c.regimeTva) : '';
  }

  function tvaState() {
    const f = ui.fec;
    const T = f.result.cycles && f.result.cycles.tva;
    if (!f.tvaCtl && T) {
      const months = Object.keys(T.months).sort();
      let ym = ymOf(defaultArrete(f.result, 'situation'));
      if (!T.months[ym]) ym = months[months.length - 1];
      const kind = tvaRegime() === 'T' ? 'quarter' : 'month';
      f.tvaCtl = { kind, key: kind === 'quarter' ? quarterOf(ym) : ym };
    }
    return f.tvaCtl;
  }

  // Grand livre de la TVA par période : totaux, écriture de liquidation rattachée, soldes restant en compte.
  // Une liquidation datée des derniers jours d'un mois concerne ce mois ; datée plus tôt, la période précédente
  // (déclaration passée à la date de dépôt). Des montants identiques à l'une des deux périodes l'emportent sur la date.
  function tvaLedger(r, kind) {
    if (r._tvaL && r._tvaL[kind]) return r._tvaL[kind];
    const T = r.cycles.tva;
    const months = Object.keys(T.months).sort();
    const keys = Array.from(new Set(months.map((ym) => (kind === 'quarter' ? quarterOf(ym) : ym))));
    const tot = {};
    keys.forEach((k) => {
      const t = (tot[k] = { coll: 0, ded: 0, auto: 0 });
      tvaPeriod(k).months.forEach((ym) => {
        const M = T.months[ym];
        if (!M) return;
        t.coll += M.coll; t.ded += M.dedAbs + M.dedImmo; t.auto += M.autoliq.biens.tva + M.autoliq.services.tva;
      });
    });
    const score = (l, k) => (tot[k] ? Math.abs(l.coll - tot[k].coll) + Math.abs(l.ded - tot[k].ded) + Math.abs(l.autoliq - tot[k].auto) : Infinity);
    const assigned = {}, extra = {};
    months.forEach((ym) => T.months[ym].liq.forEach((l) => {
      const k1 = kind === 'quarter' ? quarterOf(ym) : ym, k0 = prevPeriodKey(k1);
      const endOfM = l.date >= addDays(endOfMonth(l.date), -6);
      const firstOfQ = Number(ym.slice(5, 7)) % 3 === 1;
      const s1 = score(l, k1), s0 = score(l, k0);
      let pick = kind === 'quarter' ? (firstOfQ ? (s0 <= s1 ? k0 : k1) : k1) : endOfM ? k1 : k0;
      if (s0 < 1 && s1 >= 1) pick = k0;
      else if (s1 < 1 && s0 >= 1) pick = k1;
      if (!tot[pick]) pick = tot[k1] ? k1 : k0;
      if (!tot[pick]) return;
      const cur = assigned[pick];
      if (!cur) assigned[pick] = l;
      else (extra[pick] = extra[pick] || []).push(score(l, pick) < score(cur, pick) ? ((assigned[pick] = l), cur) : l);
    }));
    // Solde des comptes d'une nature à la fin d'un mois (débit positif).
    const bal = (kinds, ym) => Object.entries(T.meta).filter(([, m]) => kinds.includes(m.kind))
      .reduce((t, [c, m]) => t + m.an + months.filter((k) => k <= ym).reduce((x, k) => x + (T.months[k].mv[c] || 0), 0), 0);
    const out = {};
    let prevRes = null;
    keys.forEach((k) => {
      const per = tvaPeriod(k);
      const lastYm = per.months.filter((ym) => T.months[ym]).pop();
      const liq = assigned[k] || null;
      const after = !!liq && liq.date > per.end;
      const res = {
        coll: round2(-bal(['coll'], lastYm) - (after ? liq.coll : 0)),
        ded: round2(bal(['ded', 'ded-immo'], lastYm) - (after ? liq.ded : 0)),
        autoliq: round2(-bal(['autoliq'], lastYm) - (after ? liq.autoliq : 0)),
        att: round2(-bal(['coll-att'], lastYm)),
        credit: round2(Math.max(0, bal(['credit'], lastYm) - (after ? liq.credit - liq.creditUsed : 0))),
      };
      // Paiement : règlement de la TVA à décaisser dans les deux mois qui suivent, au montant le plus proche
      const pays = [];
      const m1 = ymOf(addDays(per.end, 1)), m2 = ymOf(addDays(`${m1}-01`, 40));
      [m1, m2].forEach((ym) => (T.months[ym] ? T.months[ym].pay : []).forEach((p) => pays.push(p)));
      const due = liq ? liq.due : 0;
      const pay = due > 0 ? pays.slice().sort((a, b) => Math.abs(a.amt - due) - Math.abs(b.amt - due))[0] || null : null;
      out[k] = { per, tot: tot[k], liq, liqOk: !!liq && score(liq, k) <= Math.max(5, (tot[k].coll + tot[k].ded) * 0.002), after, extra: extra[k] || [], res, prevRes, pay, due };
      prevRes = res;
    });
    Object.defineProperty(r, '_tvaL', { value: Object.assign(r._tvaL || {}, { [kind]: out }), configurable: true, writable: true, enumerable: false });
    return out;
  }

  // Agrégats de la période (bases, taux, contrôles) et écriture de liquidation rattachée.
  function tvaCore(r, per) {
    const T = r.cycles.tva;
    const A = {
      ca70: 0, serv: 0, rates: {}, other7: { base: 0, tva: 0, n: 0 }, unrated: { base: 0, tva: 0, n: 0 }, noVat: {}, coll: 0, collAtt: 0, collAcc: {}, collInv: 0,
      dedImmo: 0, dedAbs: 0, autoliq: { biens: { base: 0, tva: 0, n: 0, rates: {} }, services: { base: 0, tva: 0, n: 0, rates: {} } }, enc: { ttc: 0, tva: 0 }, chk: {}, months: 0,
    };
    per.months.forEach((ym) => {
      const M = T.months[ym];
      if (!M) return;
      A.months++;
      ['ca70', 'serv', 'coll', 'collAtt', 'collInv', 'dedImmo', 'dedAbs'].forEach((k) => { A[k] += M[k]; });
      Object.entries(M.rates).forEach(([rt, x]) => { const y = (A.rates[rt] = A.rates[rt] || { base: 0, tva: 0, n: 0 }); y.base += x.base; y.tva += x.tva; y.n += x.n; });
      ['other7', 'unrated', 'enc'].forEach((k) => Object.keys(M[k]).forEach((f) => { A[k][f] += M[k][f]; }));
      Object.entries(M.collAcc).forEach(([c, v]) => { A.collAcc[c] = (A.collAcc[c] || 0) + v; });
      Object.entries(M.noVat).forEach(([k, z]) => { const y = (A.noVat[k] = A.noVat[k] || { base: 0, n: 0, ex: [] }); y.base += z.base; y.n += z.n; y.ex = y.ex.concat(z.ex).slice(0, 30); });
      ['biens', 'services'].forEach((k) => {
        const a = A.autoliq[k], b = M.autoliq[k];
        a.base += b.base; a.tva += b.tva; a.n += b.n;
        Object.entries(b.rates).forEach(([rt, v]) => { a.rates[rt] = (a.rates[rt] || 0) + v; });
      });
      Object.entries(M.chk).forEach(([k, b]) => { const y = (A.chk[k] = A.chk[k] || { n: 0, total: 0, ex: [] }); y.n += b.n; y.total += b.total; y.ex = y.ex.concat(b.ex).slice(0, 30); });
    });
    A.autoliqTva = A.autoliq.biens.tva + A.autoliq.services.tva;
    A.ded = A.dedImmo + A.dedAbs;
    const L = tvaLedger(r, per.kind)[per.key] || { liq: null, liqOk: false, after: false, extra: [], res: { coll: 0, ded: 0, autoliq: 0, att: 0, credit: 0 }, prevRes: null, pay: null, due: 0 };
    // Report du crédit (ligne 22) : celui imputé par la liquidation, sinon le crédit disponible avant la déclaration à préparer.
    A.report = L.liq ? L.liq.creditUsed : L.res.credit;
    A.creditAvail = L.res.credit;
    return Object.assign({ A, hasAtt: Object.values(T.meta).some((m) => m.kind === 'coll-att') }, L);
  }

  // Brouillon de déclaration : lignes de la CA3, bases et TVA.
  function tvaDraft(A, meta) {
    const rows = [];
    const byRate = {};
    const add = (rt, base, tva, src) => { const x = (byRate[rt] = byRate[rt] || { base: 0, tva: 0, src }); x.base += base; x.tva += tva; };
    let otherColl = 0;
    if (A.collAtt || Object.keys(A.collAcc).some((c) => (meta[c] || {}).kind === 'coll-att')) {
      // TVA sur les encaissements tenue en comptabilité : la déclaration retient la TVA virée en compte exigible.
      Object.entries(A.collAcc).forEach(([c, v]) => { const rt = (meta[c] || {}).rate; if (rt) add(rt, (v * 100) / rt, v, 'derived'); else otherColl += v; });
    } else {
      Object.entries(A.rates).forEach(([rt, x]) => add(Number(rt), x.base, x.tva, 'factures'));
      otherColl = A.coll - Object.values(A.rates).reduce((t, x) => t + x.tva, 0) - A.unrated.tva - A.other7.tva;
    }
    ['biens', 'services'].forEach((k) => Object.entries(A.autoliq[k].rates).forEach(([rt, v]) => {
      if (rt === 'x') { otherColl += v; return; }
      const x = (byRate[rt] = byRate[rt] || { base: 0, tva: 0 });
      x.base += (v * 100) / Number(rt); x.tva += v; x.auto = (x.auto || 0) + v;
    }));
    const noVat = (k) => (A.noVat[k] ? A.noVat[k].base : 0);
    const taxable = Object.values(A.rates).reduce((t, x) => t + x.base, 0) + A.unrated.base;
    rows.push({ h: 'A. Montant des opérations réalisées' });
    rows.push({ line: '01', label: 'Ventes, prestations de services', base: taxable });
    if (A.other7.base) rows.push({ line: '02', label: 'Autres opérations imposables', base: A.other7.base });
    if (A.autoliq.services.base) rows.push({ line: '2A', label: 'Achats de prestations de services intracommunautaires (autoliquidation)', base: A.autoliq.services.base });
    if (A.autoliq.biens.base) rows.push({ line: '03', label: 'Acquisitions intracommunautaires (ou importations, ligne 2B)', base: A.autoliq.biens.base });
    if (noVat('export')) rows.push({ line: '04', label: 'Exportations hors Union européenne', base: noVat('export') });
    if (noVat('exo') + noVat('autoliq')) rows.push({ line: '05', label: 'Autres opérations non imposables (exonérées, sous-traitance autoliquidée…)', base: noVat('exo') + noVat('autoliq') });
    if (noVat('intra')) rows.push({ line: '06', label: 'Livraisons intracommunautaires', base: noVat('intra') });
    if (noVat('unknown')) rows.push({ line: '?', label: 'Ventes sans TVA à qualifier', base: noVat('unknown'), warn: true });
    rows.push({ h: 'B. TVA brute' });
    Object.keys(byRate).map(Number).sort((a, b) => b - a).forEach((rt) => {
      const x = byRate[rt];
      rows.push({ line: CA3_RATE_LINE[rt] || '14', label: `Taux ${rateTxt(rt)}${x.auto ? ` (dont autoliquidation ${eur(x.auto)} €)` : ''}${x.src === 'derived' ? ' — base reconstituée' : ''}`, base: x.base, tva: x.tva });
    });
    if (A.unrated.tva) rows.push({ line: '?', label: 'TVA collectée au taux non identifié', base: A.unrated.base, tva: A.unrated.tva, warn: true });
    if (A.other7.tva) rows.push({ line: '', label: 'TVA sur autres opérations imposables', base: A.other7.base, tva: A.other7.tva });
    if (Math.abs(otherColl) >= 0.01) rows.push({ line: '', label: 'Autre TVA collectée (acomptes, régularisations, virements)', tva: otherColl });
    const brute = A.coll + A.autoliqTva;
    rows.push({ line: '16', label: 'Total de la TVA brute due', tva: brute, strong: true });
    if (A.autoliq.biens.tva) rows.push({ line: '17', label: 'dont TVA sur acquisitions intracommunautaires', tva: A.autoliq.biens.tva });
    rows.push({ h: 'TVA déductible' });
    rows.push({ line: '19', label: 'Biens constituant des immobilisations', tva: A.dedImmo });
    rows.push({ line: '20', label: 'Autres biens et services', tva: A.dedAbs });
    if (A.report) rows.push({ line: '22', label: 'Report du crédit de la déclaration précédente', tva: A.report });
    const ded = A.ded + A.report;
    rows.push({ line: '23', label: 'Total de la TVA déductible', tva: ded, strong: true });
    const net = brute - ded;
    rows.push(net >= 0 ? { line: '28', label: 'TVA nette due', tva: net, strong: true } : { line: '25', label: 'Crédit de TVA', tva: -net, strong: true });
    return { rows, brute: round2(brute), ded: round2(ded), net: round2(net), taxable: round2(taxable), byRate };
  }

  // Montants télédéclarés saisis par l'utilisateur (conservés, chiffrés, dans le dossier).
  function tvaDeclStore() {
    const c = clientById(ui.fec.clientId);
    if (c) return (c.tvaDecl = c.tvaDecl || {});
    return (ui.fec.tvaDecl = ui.fec.tvaDecl || {});
  }

  function tvaChecks(r, per, core, draft) {
    const { A, liq, liqOk, liqAfter, res, pay, due } = core;
    const out = checksList();
    const ch = (k) => A.chk[k] || { n: 0, total: 0, ex: [] };
    const full = (b) => ({ full: b.ex.length >= b.n });
    const c = clientById(ui.fec.clientId);
    const reg = c ? norm(c.regimeTva) : '';
    const maxOp = r.pieces.maxOp || r.meta.maxDate;
    if (/franchise|non assujetti/.test(reg) && (A.coll > 0.01 || draft.taxable > 0.01)) out.add('error', 'TVA collectée alors que le dossier est en franchise ou non assujetti', `${eur(A.coll)} € de TVA collectée : régime du dossier à vérifier (dépassement des seuils de franchise ?).`);

    // Liquidation et soldes des comptes de TVA
    if (!liq) {
      if (maxOp && maxOp > addDays(per.end, 25)) out.add('warn', 'Aucune écriture de liquidation de la TVA', `La TVA de la période n'est pas soldée en comptabilité (pas d'écriture débitant la TVA collectée et créditant la TVA déductible et la TVA à décaisser) : déclaration non comptabilisée ?`);
      else out.add('info', 'Liquidation de la TVA non encore comptabilisée', 'Normal si la déclaration de la période n\'est pas encore déposée : le brouillon ci-dessus sert à la préparer.');
    } else {
      const diffs = [];
      const cmp = (label, a, b) => { if (Math.abs(a - b) >= 1) diffs.push(`${label} : calculé ${eur(a)} €, liquidé ${eur(b)} € (écart ${eur(a - b)} €)`); };
      cmp('TVA collectée', A.coll, liq.coll); cmp('TVA autoliquidée', A.autoliqTva, liq.autoliq); cmp('TVA déductible', A.ded, liq.ded);
      if (!liqOk || diffs.length) out.add('warn', `Écriture de liquidation du ${fmtDate(liq.date)} différente de la TVA de la période`, 'La déclaration comptabilisée ne reprend pas toute la TVA des écritures de la période : factures saisies après la déclaration, ou erreur de liquidation.', diffs);
      else out.add('ok', `Liquidation du ${fmtDate(liq.date)} conforme`, `TVA collectée ${eur(liq.coll)} €, déductible ${eur(liq.ded)} €${liq.due ? `, à payer ${eur(liq.due)} €` : ''}${liq.credit ? `, crédit ${eur(liq.credit)} €` : ''}.`);
      if (core.extra.length) out.add('info', 'Autres écritures de liquidation rattachées à la période', 'Écritures de TVA complémentaires ou rectificatives : vérifier qu\'elles ne font pas double emploi.', core.extra.map((l) => `${fmtDate(l.date)} · ${l.ref} · ${l.lib} : collectée ${eur(l.coll)} €, déductible ${eur(l.ded)} €, à payer ${eur(l.due)} €`));
      if (Math.abs(liq.other) >= 5) out.add('info', `Écart d'arrondi ou autre ligne dans la liquidation : ${eur(liq.other)} €`, "Montant passé en charges ou produits divers dans l'écriture de TVA : au-delà des arrondis à l'euro, à justifier.");
    }
    if (liq || (maxOp && maxOp > addDays(per.end, 25))) {
      const before = core.prevRes ? core.prevRes.coll : 0;
      if (res.coll >= 1) out.add('warn', `TVA collectée restée en compte : ${eur(res.coll)} €`, `Solde créditeur de la TVA collectée${liq ? ' après la liquidation' : ''}${Math.abs(before) >= 1 ? ` (dont ${eur(before)} € déjà présents à la fin de la période précédente)` : ''} : TVA comptabilisée mais non déclarée (factures saisies après la déclaration, avoirs, erreurs d'imputation). À régulariser sur la prochaine déclaration.`);
      else if (res.coll <= -1) out.add('warn', `TVA collectée liquidée en trop : ${eur(-res.coll)} €`, 'Solde débiteur de la TVA collectée après la liquidation : TVA déclarée deux fois ou facture supprimée après la déclaration ?');
      if (res.ded >= 1) out.add('info', `TVA déductible non récupérée : ${eur(res.ded)} €`, 'Solde débiteur de la TVA déductible après la liquidation : factures saisies après la déclaration (à récupérer sur la suivante), ou TVA sur prestations non encore payées.');
      else if (res.ded <= -1) out.add('warn', `TVA déductible récupérée en trop : ${eur(-res.ded)} €`, 'Solde créditeur de la TVA déductible après la liquidation : avoir fournisseur, doublon ou erreur de liquidation.');
      if (Math.abs(res.autoliq) >= 1) out.add('warn', `TVA autoliquidée non soldée : ${eur(res.autoliq)} €`, 'La TVA autoliquidée (4452) doit être reprise en TVA brute à chaque déclaration.');
    }
    if (liq && due > 0) {
      const late = maxOp && maxOp > addDays(per.end, 40);
      if (!pay) { if (late) out.add('warn', 'Paiement de la TVA non trouvé', `${eur(due)} € à payer selon la liquidation : aucun règlement de la TVA à décaisser dans les deux mois suivants.`); }
      else if (Math.abs(pay.amt - due) >= 1) out.add('warn', `Paiement de la TVA différent du montant dû : ${eur(pay.amt)} € pour ${eur(due)} €`, `Règlement du ${fmtDate(pay.date)} (${pay.lib}) : écart de ${eur(pay.amt - due)} €.`);
      else out.add('ok', `TVA payée le ${fmtDate(pay.date)}`, `${eur(pay.amt)} €.`);
    }

    // TVA collectée
    const rt = ch('rate'), mm = ch('mismatch');
    if (rt.n) out.add('warn', 'TVA collectée à un taux non identifié', `${rt.n} écriture(s) dont la TVA ne correspond à aucun taux légal (écart total ${eur(rt.total)} €) : erreur de saisie ou de paramétrage ?`, rt.ex, full(rt));
    if (mm.n) out.add('warn', 'Taux de TVA différent du taux du compte de vente', `${mm.n} écriture(s) : la TVA appliquée ne correspond pas au taux indiqué sur le compte de vente.`, mm.ex, full(mm));
    if (!rt.n && !mm.n && Object.keys(A.rates).length) out.add('ok', 'TVA collectée cohérente avec les bases', `Taux appliqués : ${Object.keys(A.rates).map(Number).sort((a, b) => b - a).map(rateTxt).join(', ')}.`);
    const nv = (k) => A.noVat[k] || { base: 0, n: 0, ex: [] };
    if (nv('unknown').n) out.add('warn', 'Ventes sans TVA à justifier', `${nv('unknown').n} facture(s), ${eur(nv('unknown').base)} € HT : export, livraison intracommunautaire, opération exonérée… ou TVA oubliée ?`, nv('unknown').ex, { full: nv('unknown').ex.length >= nv('unknown').n });
    if (nv('export').n) out.add('info', `Exportations : ${eur(nv('export').base)} € HT (ligne 04)`, "Justificatifs d'exportation (déclaration en douane) à conserver.", nv('export').ex);
    if (nv('intra').n) out.add('info', `Livraisons intracommunautaires : ${eur(nv('intra').base)} € HT (ligne 06)`, "N° de TVA intracommunautaire du client sur la facture ; état récapitulatif TVA (biens) ou déclaration européenne de services à déposer.", nv('intra').ex);
    if (nv('exo').n || nv('autoliq').n) out.add('info', `Opérations non imposables : ${eur(nv('exo').base + nv('autoliq').base)} € HT (ligne 05)`, 'Exonérations, débours, sous-traitance autoliquidée : mention correspondante sur la facture.', nv('exo').ex.concat(nv('autoliq').ex));
    if (A.collAtt || core.hasAtt) out.add('info', `TVA sur les encaissements en attente : ${eur(core.res.att)} €`, `TVA facturée non encore exigible (comptes d'attente) ; ${eur(A.collAtt)} € de mouvement net sur la période. Seule la TVA virée en TVA exigible est déclarée.`);
    else if (A.ca70 > 0 && A.serv >= A.ca70 * 0.3 && A.enc.tva > 0) out.add('info', 'Prestations de services : TVA exigible à l\'encaissement', `Sauf option pour les débits, la TVA des prestations est due à l'encaissement : TVA comprise dans les règlements clients de la période ≈ ${eur(A.enc.tva)} €, contre ${eur(A.collInv)} € de TVA facturée. Vérifiez l'option du dossier.`);

    // TVA déductible
    const b = (k) => ch(k);
    if (b('autoliqND').n) out.add('warn', 'TVA autoliquidée non déduite', `${b('autoliqND').n} facture(s), ${eur(b('autoliqND').total)} € : la TVA autoliquidée est en principe déductible en même temps (ligne 20 ou 19).`, b('autoliqND').ex, full(b('autoliqND')));
    if (A.autoliqTva) out.add('info', `Autoliquidation : ${eur(A.autoliqTva)} € de TVA`, `${A.autoliq.biens.tva ? `Biens ${eur(A.autoliq.biens.base)} € HT (ligne 03, TVA ligne 17)` : ''}${A.autoliq.biens.tva && A.autoliq.services.tva ? ' ; ' : ''}${A.autoliq.services.tva ? `services ${eur(A.autoliq.services.base)} € HT (ligne 2A)` : ''} : TVA reprise en TVA brute et déduite.`);
    if (b('vehicle').n) out.add('warn', 'TVA déduite sur des véhicules de tourisme', `${b('vehicle').n} écriture(s), ${eur(b('vehicle').total)} € : la TVA sur l'achat, la location, le crédit-bail et l'entretien des véhicules de tourisme n'est pas récupérable (sauf utilitaires et activités de transport, location ou auto-école).`, b('vehicle').ex, full(b('vehicle')));
    if (b('fuel').n) out.add('info', `TVA sur carburants : ${eur(b('fuel').total)} €`, `Véhicules de tourisme : 80 % récupérable (gazole et essence) ; utilitaires : 100 %. Part non récupérable si véhicules de tourisme : ${eur(b('fuel').total * 0.2)} €.`, b('fuel').ex, full(b('fuel')));
    if (b('lodging').n) out.add('warn', "TVA déduite sur de l'hébergement", `${b('lodging').n} écriture(s), ${eur(b('lodging').total)} € : non récupérable pour l'hébergement des dirigeants et du personnel (récupérable pour celui des clients ou de tiers).`, b('lodging').ex, full(b('lodging')));
    if (b('gift').n) out.add('warn', 'TVA déduite sur des cadeaux de plus de 73 € TTC', `${b('gift').n} écriture(s), ${eur(b('gift').total)} € : non récupérable au-delà de 73 € TTC par bénéficiaire et par an.`, b('gift').ex, full(b('gift')));
    if (b('perso').n) out.add('warn', 'TVA déduite sur des dépenses à caractère personnel possibles', `${b('perso').n} écriture(s), ${eur(b('perso').total)} € : déductible seulement si la dépense est engagée pour l'entreprise.`, b('perso').ex, full(b('perso')));
    if (b('overP').n) out.add('warn', 'TVA déductible supérieure à 20 % du HT', `${b('overP').n} écriture(s) : erreur de saisie ou TVA déduite deux fois ?`, b('overP').ex, full(b('overP')));
    if (b('immoAbs').n) out.add('info', 'TVA sur immobilisations comptabilisée en autres biens et services', `${eur(b('immoAbs').total)} € : à déclarer ligne 19 (immobilisations) et non ligne 20.`, b('immoAbs').ex, full(b('immoAbs')));
    if (b('absImmo').n) out.add('info', 'TVA sur charges comptabilisée en TVA sur immobilisations', `${eur(b('absImmo').total)} € : à déclarer ligne 20 et non ligne 19.`, b('absImmo').ex, full(b('absImmo')));
    if (b('noVatP').n) out.add('info', 'Factures fournisseurs sans TVA (150 € HT ou plus)', `${b('noVatP').n} facture(s), ${eur(b('noVatP').total)} € HT : fournisseur non assujetti, loyer non soumis, autoliquidation à passer, ou TVA oubliée ?`, b('noVatP').ex, full(b('noVatP')));

    // Crédit de TVA et cohérence avec les autres périodes
    if (draft.net <= -760) out.add('info', `Crédit de TVA de ${eur(-draft.net)} € : remboursement possible`, `Crédit d'au moins 760 € : remboursement demandable sur la déclaration (formulaire 3519), à défaut report sur la suivante.`);
    const T = r.cycles.tva;
    const others = Object.keys(T.months).filter((k) => !per.months.includes(k) && T.months[k].ca70 > 0);
    const ratio = (list) => { const ca = list.reduce((t, k) => t + T.months[k].ca70, 0); return ca > 0 ? list.reduce((t, k) => t + T.months[k].coll, 0) / ca : null; };
    const avg = ratio(others), cur = A.ca70 > 0 ? A.coll / A.ca70 : null;
    if (avg !== null && cur !== null && others.length >= 3 && Math.abs(cur - avg) >= 0.02) out.add('info', `TVA collectée : ${pctFr(cur)} du chiffre d'affaires contre ${pctFr(avg)} en moyenne`, 'Variation du taux apparent de TVA : changement de la répartition des ventes par taux, ventes sans TVA ou erreurs de saisie ?');
    const prev = fecPrev();
    const PT = prev && prev.cycles.tva;
    if (PT) {
      const ly = per.months.map((ym) => `${Number(ym.slice(0, 4)) - 1}${ym.slice(4)}`).filter((k) => PT.months[k]);
      const caP = ly.reduce((t, k) => t + PT.months[k].ca70, 0), tvP = ly.reduce((t, k) => t + PT.months[k].coll, 0);
      if (ly.length && caP > 0 && Math.abs(A.ca70 - caP) / caP >= 0.3) out.add('info', `Chiffre d'affaires ${A.ca70 > caP ? 'en hausse' : 'en baisse'} de ${pctFr(Math.abs(A.ca70 - caP) / caP, 0)} sur un an`, `${eur(caP, 0)} € → ${eur(A.ca70, 0)} € HT ; TVA collectée ${eur(tvP, 0)} € → ${eur(A.coll, 0)} €.`);
    }

    // Montants télédéclarés
    const d = tvaDeclStore()[per.key];
    if (d) {
      const diffs = [];
      const cmp = (label, decl, calc) => { if (decl !== '' && decl !== undefined && decl !== null && Math.abs(Number(decl) - calc) >= 1) diffs.push(`${label} : déclaré ${eur(decl)} €, comptabilité ${eur(calc)} € (écart ${eur(Number(decl) - calc)} €)`); };
      cmp('Ligne 01 (base des ventes)', d.b01, draft.taxable); cmp('Ligne 16 (TVA brute)', d.t16, draft.brute); cmp('Ligne 23 (TVA déductible)', d.t23, draft.ded); cmp('Net à payer (+) ou crédit (−)', d.net, draft.net);
      if (diffs.length) out.add('error', 'Déclaration déposée différente de la comptabilité', 'Écarts entre les montants télédéclarés et les écritures de la période : déclaration rectificative ou régularisation sur la suivante.', diffs);
      else if (['b01', 't16', 't23', 'net'].some((k) => d[k] !== '' && d[k] !== undefined)) out.add('ok', 'Déclaration déposée conforme à la comptabilité', 'Les montants télédéclarés saisis correspondent aux écritures de la période.');
    }
    return out;
  }

  function tvaData(r) {
    const st = tvaState();
    const per = tvaPeriod(st.key);
    const core = tvaCore(r, per);
    const draft = tvaDraft(core.A, r.cycles.tva.meta);
    const cycle = `tva-${per.key}`;
    const checks = applyMemo(tvaChecks(r, per, core, draft), cycle);
    return { st, per, core, draft, cycle, checks };
  }

  // Concordance sur l'exercice : TVA calculée, liquidée et déclarée, période par période.
  function tvaConcordance(r, kind) {
    const T = r.cycles.tva;
    const keys = Array.from(new Set(Object.keys(T.months).sort().map((ym) => (kind === 'quarter' ? quarterOf(ym) : ym))));
    const decl = tvaDeclStore();
    return keys.map((key) => {
      const per = tvaPeriod(key);
      const core = tvaCore(r, per);
      const draft = tvaDraft(core.A, T.meta);
      const d = decl[key];
      const declNet = d && d.net !== '' && d.net !== undefined ? Number(d.net) : null;
      const liqNet = core.liq ? round2(core.liq.due - core.liq.credit) : null;
      return { key, per, ca: core.A.ca70, taxable: draft.taxable, brute: draft.brute, ded: draft.ded, net: draft.net, liqNet, declNet, ok: (controlOf(key) || {}).at };
    });
  }

  const controlOf = (key) => { const c = clientById(ui.fec.clientId); return c && c.tvaControles ? c.tvaControles[key] : (ui.fec.tvaControles || {})[key]; };

  function viewTva() {
    const f = ui.fec;
    const r = f.result;
    if (!r.cycles || !r.cycles.tva || !Object.keys(r.cycles.tva.months).length) return '<section class="card"><p class="muted">Aucune écriture datée : contrôle de la TVA impossible.</p></section>';
    const { st, per, core, draft, cycle, checks } = tvaData(r);
    const { A, liq, liqOk, res, pay } = core;
    const T = r.cycles.tva;
    const months = Object.keys(T.months).sort();
    const keys = st.kind === 'quarter' ? Array.from(new Set(months.map(quarterOf))) : months;
    const reg = tvaRegime();
    const ctl = controlOf(per.key);
    const pg = wpProgress(cycle, checks);
    const c = clientById(f.clientId);
    const d = tvaDeclStore()[per.key] || {};
    const cell = (v) => (v === undefined || v === null ? '' : eur(v));
    const regTxt = { M: 'TVA mensuelle', T: 'TVA trimestrielle', CA12: 'régime simplifié (CA12 annuelle)', F: 'franchise en base' }[reg];
    const conc = tvaConcordance(r, st.kind);
    const sumRates = Object.entries(A.rates).sort((a, b) => Number(b[0]) - Number(a[0]));
    return `
      <section class="card">
        <div class="card-head"><h2>Contrôle de la TVA — ${esc(per.label)}</h2>
          <div class="head-actions">
            <button class="btn small" data-action="tva-xlsx">Excel</button>
            <button class="btn small" data-action="tva-print">Imprimer / PDF</button>
          </div></div>
        <div class="filters">
          <div class="seg" role="group" aria-label="Périodicité">
            <button class="${st.kind === 'month' ? 'on' : ''}" data-action="tva-kind" data-kind="month">Mois</button>
            <button class="${st.kind === 'quarter' ? 'on' : ''}" data-action="tva-kind" data-kind="quarter">Trimestre</button>
          </div>
          <select data-tva="key" aria-label="Période">${options(Object.fromEntries(keys.map((k) => [k, tvaPeriod(k).label.replace(/^./, (x) => x.toUpperCase())])), per.key)}</select>
          ${regTxt ? `<span class="muted small">Dossier : ${esc(regTxt)}${reg === 'T' && st.kind === 'month' ? ' — passez en « Trimestre »' : reg === 'M' && st.kind === 'quarter' ? ' — passez en « Mois »' : ''}</span>` : ''}
        </div>
        ${reg === 'CA12' ? '<div class="banner info"><span>Dossier au régime simplifié : ce contrôle mensuel sert à suivre la TVA en cours d\'année ; la déclaration annuelle CA12 reprend l\'exercice entier.</span></div>' : ''}
        ${A.months < per.months.length ? `<div class="banner warn"><span>Le FEC ne couvre que ${A.months} mois sur ${per.months.length} de la période.</span></div>` : ''}
        <div class="kpis fec-kpis">
          ${kpiTile('TVA brute (collectée et autoliquidée)', eurK(draft.brute))}
          ${kpiTile('TVA déductible', eurK(draft.ded))}
          ${kpiTile(draft.net >= 0 ? 'TVA nette à payer' : 'Crédit de TVA', `${eur(Math.abs(draft.net), 0)} €`, draft.net < 0 ? 'kpi-wait' : '')}
          ${kpiTile('Points à vérifier', pg.left, pg.left ? 'kpi-wait' : '')}
          ${kpiTile('Liquidation comptabilisée', liq ? (liqOk ? `✓ ${fmtDate(liq.date)}` : `≠ ${fmtDate(liq.date)}`) : '—', liq && !liqOk ? 'kpi-late' : '')}
        </div>
        <div class="tva-validate">
          ${ctl ? `<span class="lvl lvl-ok"><b aria-hidden="true">✓</b>Contrôle validé${ctl.by ? ` par ${esc(ctl.by)}` : ''} le ${fmtDate(ctl.at.slice(0, 10))}${ctl.net !== undefined ? ` (${ctl.net >= 0 ? 'à payer' : 'crédit'} ${eur(Math.abs(ctl.net))} €)` : ''}</span> <button class="link-btn" data-action="tva-validate" data-undo="1">Annuler</button>`
            : `<button class="btn primary" data-action="tva-validate">✓ Valider le contrôle de ${esc(per.label)}</button>
               <span class="muted small">${c ? `Coche l'étape « Contrôle et calcul de la TVA » de la mission ${esc(per.exercice)} du dossier et note le contrôle au journal.` : 'Rattachez l\'analyse à un dossier pour conserver le contrôle.'}</span>`}
        </div>
      </section>
      <div class="grid2">
        <section class="card"><h2>Brouillon de déclaration (CA3)</h2>
          <div class="grid-wrap"><table class="dtable num tva-draft"><thead><tr><th>Ligne</th><th>Libellé</th><th>Base HT</th><th>TVA</th></tr></thead>
          <tbody>${draft.rows.map((x) => x.h ? `<tr class="tva-h"><td colspan="4">${esc(x.h)}</td></tr>`
            : `<tr class="${x.strong ? 'strong' : ''}${x.warn ? ' flag' : ''}"><td>${esc(x.line)}</td><td>${esc(x.label)}</td><td>${cell(x.base)}</td><td>${cell(x.tva)}</td></tr>`).join('')}</tbody></table></div>
          <p class="muted small">Reconstitué à partir des écritures de la période (numéros de ligne du formulaire 3310-CA3). À comparer à la déclaration préparée dans votre logiciel : les taxes assimilées, les régularisations et les ventilations particulières (annexe 3310 A) restent à ajouter.</p>
        </section>
        <section class="card"><h2>Rapprochement avec la comptabilité</h2>
          <div class="grid-wrap"><table class="dtable num"><thead><tr><th></th><th>Écritures de la période</th><th>${liq ? `Liquidation du ${fmtDate(liq.date)}` : 'Liquidation'}</th><th>Écart</th></tr></thead>
          <tbody>${[['TVA collectée', A.coll, liq && liq.coll], ['TVA autoliquidée', A.autoliqTva, liq && liq.autoliq], ['TVA déductible', A.ded, liq && liq.ded], ['Crédit imputé', A.report, liq && liq.creditUsed], ['TVA à payer', Math.max(0, draft.net), liq && liq.due], ['Crédit à reporter', Math.max(0, -draft.net), liq && liq.credit]]
            .map(([l, a, b]) => `<tr><td>${l}</td><td>${eur(a)}</td><td>${liq ? eur(b) : '—'}</td><td class="${liq && Math.abs(a - b) >= 1 ? 'cred' : ''}">${liq ? eur(a - b) : ''}</td></tr>`).join('')}</tbody></table></div>
          <table class="dtable num sig"><tbody>
            <tr><td>TVA collectée restant en compte${liq ? ' après liquidation' : ''}</td><td class="${Math.abs(res.coll) >= 1 ? 'cred' : ''}">${eur(res.coll)}</td></tr>
            <tr><td>TVA déductible restant en compte${liq ? ' après liquidation' : ''}</td><td>${eur(res.ded)}</td></tr>
            ${core.hasAtt ? `<tr><td>TVA sur encaissements en attente</td><td>${eur(res.att)}</td></tr>` : ''}
            ${A.creditAvail ? `<tr><td>Crédit de TVA disponible (44567)</td><td>${eur(A.creditAvail)}</td></tr>` : ''}
            <tr><td>Paiement</td><td>${pay ? `${eur(pay.amt)} € le ${fmtDate(pay.date)}` : core.due > 0 ? 'non trouvé' : '—'}</td></tr>
          </tbody></table>
          <p class="muted small">Après chaque liquidation, les comptes de TVA collectée et déductible doivent être soldés : un reste signale de la TVA comptabilisée mais non déclarée.</p>
        </section>
      </div>
      <section class="card"><h2>TVA collectée par taux</h2>
        ${sumRates.length || A.unrated.n ? `<div class="grid-wrap"><table class="dtable num"><thead><tr><th>Taux</th><th>Écritures</th><th>Base HT</th><th>TVA comptabilisée</th><th>TVA théorique</th><th>Écart</th></tr></thead>
        <tbody>${sumRates.map(([rt, x]) => { const theo = (x.base * Number(rt)) / 100; return `<tr><td>${rateTxt(Number(rt))}</td><td>${x.n}</td><td>${eur(x.base)}</td><td>${eur(x.tva)}</td><td>${eur(theo)}</td><td class="${Math.abs(x.tva - theo) >= 1 ? 'cred' : ''}">${eur(x.tva - theo)}</td></tr>`; }).join('')}
          ${A.unrated.n ? `<tr class="flag"><td>Non identifié</td><td>${A.unrated.n}</td><td>${eur(A.unrated.base)}</td><td>${eur(A.unrated.tva)}</td><td>—</td><td></td></tr>` : ''}</tbody></table></div>
        <p class="muted small">Taux lu sur les comptes de TVA collectée (« TVA collectée 10 % »), sinon déduit du rapport TVA / base de chaque écriture ; les écritures à plusieurs taux sont ventilées entre les taux habituels du dossier. Chiffre d'affaires de la période (70) : ${eur(A.ca70)} € HT.</p>` : '<p class="muted">Aucune vente avec TVA sur la période.</p>'}
      </section>
      <section class="card"><h2>Contrôles <span class="count">${pg.left}</span></h2>
        <div class="wp-bar"><span class="wp-progress"><span class="wp-track"><i data-w="${pg.total ? Math.round((pg.done / pg.total) * 100) : 100}"></i></span>${pg.done} / ${pg.total} point(s) traité(s)${pg.wait ? ` · ${pg.wait} en attente de pièce` : ''}</span></div>
        ${wpCheckList(checks, cycle)}
      </section>
      <section class="card"><h2>Montants télédéclarés <span class="muted small">(facultatif)</span></h2>
        <p class="muted small">Saisissez les montants de la déclaration déposée pour la comparer aux écritures : un écart signale une déclaration à rectifier ou une régularisation à prévoir. Conservés${c ? ', chiffrés, dans le dossier' : ' pendant la session (rattachez un dossier pour les conserver)'}.</p>
        <div class="filters tva-decl">
          <label class="inline-label">Ligne 01 <input type="number" step="0.01" data-tva-decl="b01" value="${esc(d.b01 ?? '')}" placeholder="${eur(draft.taxable, 0)}"></label>
          <label class="inline-label">Ligne 16 <input type="number" step="0.01" data-tva-decl="t16" value="${esc(d.t16 ?? '')}" placeholder="${eur(draft.brute, 0)}"></label>
          <label class="inline-label">Ligne 23 <input type="number" step="0.01" data-tva-decl="t23" value="${esc(d.t23 ?? '')}" placeholder="${eur(draft.ded, 0)}"></label>
          <label class="inline-label">Net (à payer +, crédit −) <input type="number" step="0.01" data-tva-decl="net" value="${esc(d.net ?? '')}" placeholder="${eur(draft.net, 0)}"></label>
        </div>
      </section>
      <section class="card"><h2>Concordance de la TVA sur l'exercice</h2>
        <div class="grid-wrap"><table class="dtable num tva-conc"><thead><tr><th>Période</th><th>CA HT (70)</th><th>Base taxable</th><th>TVA brute</th><th>TVA déductible</th><th>Nette calculée</th><th>Liquidée</th><th>Déclarée</th><th>Écart</th><th>Contrôle</th></tr></thead>
        <tbody>${conc.map((x) => {
          const ref = x.declNet !== null ? x.declNet : x.liqNet;
          const gap = ref === null ? null : round2(x.net - ref);
          return `<tr class="${x.key === per.key ? 'strong' : ''}"><td><button class="link-btn" data-action="tva-goto" data-key="${x.key}">${esc(x.per.label)}</button></td><td>${eur(x.ca, 0)}</td><td>${eur(x.taxable, 0)}</td><td>${eur(x.brute, 0)}</td><td>${eur(x.ded, 0)}</td><td>${eur(x.net, 0)}</td>
            <td>${x.liqNet === null ? '—' : eur(x.liqNet, 0)}</td><td>${x.declNet === null ? '' : eur(x.declNet, 0)}</td><td class="${gap !== null && Math.abs(gap) >= 1 ? 'cred' : ''}">${gap === null ? '' : Math.abs(gap) < 1 ? '0' : eur(gap, 0)}</td><td>${x.ok ? '✓' : ''}</td></tr>`;
        }).join('')}</tbody>
        <tfoot><tr><th>Total</th><th>${eur(conc.reduce((t, x) => t + x.ca, 0), 0)}</th><th>${eur(conc.reduce((t, x) => t + x.taxable, 0), 0)}</th><th>${eur(conc.reduce((t, x) => t + x.brute, 0), 0)}</th><th>${eur(conc.reduce((t, x) => t + x.ded, 0), 0)}</th><th>${eur(conc.reduce((t, x) => t + x.net, 0), 0)}</th><th>${eur(conc.reduce((t, x) => t + (x.liqNet || 0), 0), 0)}</th><th></th><th></th><th></th></tr></tfoot></table></div>
        <p class="muted small">Nette calculée : TVA brute − TVA déductible (positive : à payer, négative : crédit). Écart : avec la déclaration saisie, à défaut avec la liquidation comptabilisée. Ce tableau sert aussi au contrôle de concordance du chiffre d'affaires et de la TVA à la clôture.</p>
      </section>`;
  }

  function tvaValidate(undo) {
    const f = ui.fec;
    const r = f.result;
    const { per, draft, core } = tvaData(r);
    const c = clientById(f.clientId);
    const store = c ? (c.tvaControles = c.tvaControles || {}) : (f.tvaControles = f.tvaControles || {});
    if (undo) {
      delete store[per.key];
      if (c) { log(c.id, `Contrôle de la TVA de ${per.label} annulé.`, true); persist(); }
      return refresh();
    }
    store[per.key] = { at: nowIso(), by: data.settings.utilisateur || '', net: draft.net, brute: draft.brute, ded: draft.ded, liq: core.liq ? core.liq.date : '' };
    if (c) {
      log(c.id, `Contrôle de la TVA de ${per.label} validé depuis le FEC : ${draft.net >= 0 ? `${eur(draft.net)} € à payer` : `crédit de ${eur(-draft.net)} €`}.`, true);
      const done = autoStep(c.id, ['tva'], [per.exercice], /^contr[ôo]le/i, 'contrôle de la TVA validé depuis l\'analyse du FEC');
      persist();
      toast(done ? `Contrôle validé — ${done}.` : 'Contrôle validé et noté au journal du dossier.');
    } else toast('Contrôle validé pour cette session : rattachez un dossier pour le conserver.');
    refresh();
  }

  function tvaHtml() {
    const r = ui.fec.result;
    const { per, core, draft, cycle, checks } = tvaData(r);
    const c = clientById(ui.fec.clientId);
    const ctl = controlOf(per.key);
    const st = wpStore();
    const row = (x) => {
      const it = st.items[wpKey(cycle, x.label)] || {};
      const state = x.level === 'ok' ? '' : checkState(cycle, x);
      return `<tr><td>${esc((LEVEL[x.level] || LEVEL.info).label)}</td><td><strong>${esc(x.label)}</strong><div class="note-sub">${esc(x.detail || '')}</div></td><td>${esc(x.level === 'ok' ? '—' : WP_ST[state || ''])}</td><td>${esc(it.note || '')}</td></tr>`;
    };
    return `<article class="note">
      <header class="note-head">
        <div><div class="note-cab">${esc(data.settings.cabinet || '')}</div><h1>Contrôle de la TVA — ${esc(per.label)}</h1>
        <div class="note-sub">${esc(c ? c.nom : r.meta.fileName)}${ctl ? ` — validé${ctl.by ? ` par ${esc(ctl.by)}` : ''} le ${fmtDate(ctl.at.slice(0, 10))}` : ''}</div></div>
        <div class="note-date">${fmtDate(todayStr())}</div>
      </header>
      <h2>Brouillon de déclaration</h2>
      <table class="note-table"><thead><tr><th>Ligne</th><th>Libellé</th><th>Base HT</th><th>TVA</th></tr></thead><tbody>
        ${draft.rows.map((x) => x.h ? `<tr><td colspan="4"><strong>${esc(x.h)}</strong></td></tr>` : `<tr><td>${esc(x.line)}</td><td>${esc(x.label)}</td><td>${x.base === undefined ? '' : eur(x.base) + ' €'}</td><td>${x.tva === undefined ? '' : eur(x.tva) + ' €'}</td></tr>`).join('')}
      </tbody></table>
      <h2>Rapprochement</h2>
      <p>${core.liq ? `Liquidation du ${fmtDate(core.liq.date)} : TVA collectée ${eur(core.liq.coll)} €, déductible ${eur(core.liq.ded)} €, à payer ${eur(core.liq.due)} €${core.liq.credit ? `, crédit ${eur(core.liq.credit)} €` : ''}.` : 'Liquidation non comptabilisée.'}
        TVA collectée restant en compte : ${eur(core.res.coll)} € ; TVA déductible restant en compte : ${eur(core.res.ded)} €.${core.pay ? ` Paiement de ${eur(core.pay.amt)} € le ${fmtDate(core.pay.date)}.` : ''}</p>
      <h2>Contrôles</h2>
      <table class="note-table wp-table"><thead><tr><th>Niveau</th><th>Contrôle</th><th>Statut</th><th>Commentaire</th></tr></thead><tbody>${checks.map(row).join('')}</tbody></table>
      <p class="note-foot">Établi à partir du FEC, sur l'appareil du cabinet. Document de travail interne couvert par le secret professionnel.</p>
    </article>`;
  }

  function tvaExport() {
    const r = ui.fec.result;
    const { per, draft, checks, st } = tvaData(r);
    const c = clientById(ui.fec.clientId);
    const t = (v, s) => ({ v, s: s === undefined ? 2 : s });
    const n = (v, s) => ({ v: Number(v) || 0, s: s || 8 });
    const lvl = (l) => (LEVEL[l] || LEVEL.info).label;
    const decl = [[{ v: `Contrôle de la TVA — ${per.label}${c ? ' — ' + c.nom : ''}`, s: 10 }], [], [t('Ligne', 1), t('Libellé', 1), t('Base HT', 1), t('TVA', 1)]]
      .concat(draft.rows.map((x) => (x.h ? [t(x.h, 1)] : [t(x.line), t(x.label), x.base === undefined ? t('') : n(x.base), x.tva === undefined ? t('') : n(x.tva, x.strong ? 9 : 8)])));
    const ctl = [[t('Niveau', 1), t('Contrôle', 1), t('Détail', 1), t('Éléments', 1)]].concat(checks.map((x) => [t(lvl(x.level)), t(x.label), t(x.detail || ''), t((x.examples || []).join('\n'))]));
    const conc = [[t('Période', 1), t('CA HT (70)', 1), t('Base taxable', 1), t('TVA brute', 1), t('TVA déductible', 1), t('Nette calculée', 1), t('Liquidée', 1), t('Déclarée', 1)]]
      .concat(tvaConcordance(r, st.kind).map((x) => [t(x.per.label), n(x.ca), n(x.taxable), n(x.brute), n(x.ded), n(x.net), x.liqNet === null ? t('') : n(x.liqNet), x.declNet === null ? t('') : n(x.declNet)]));
    const blob = XlsxWriter.build({ sheets: [
      { name: 'Déclaration', rows: decl, widths: [8, 70, 16, 16], filter: false },
      { name: 'Contrôles', rows: ctl, widths: [12, 55, 80, 90], freeze: { row: 1 } },
      { name: 'Concordance', rows: conc, widths: [22, 16, 16, 16, 16, 16, 16, 16], freeze: { row: 1 } },
    ] });
    download(`controle-tva-${r.meta.siren || 'dossier'}-${per.key}.xlsx`, blob, blob.type);
  }

  // ---------- Portefeuille : analyse de plusieurs FEC en une fois ----------

  // Exécute `fn` comme si l'analyse `st` était ouverte dans l'analyseur `profile`.
  function withFec(st, profile, fn) {
    const saveProfile = ui.fecProfile, saveState = ui.fecStates[profile];
    ui.fecProfile = profile;
    ui.fecStates[profile] = st;
    try {
      return fn();
    } finally {
      ui.fecProfile = saveProfile;
      ui.fecStates[profile] = saveState;
    }
  }

  // Analyse d'un fichier dans son propre Web Worker (indépendant de l'analyse affichée).
  function analyseFile(file) {
    return fecSource(file).then(({ buffer, name, docs, archive }) => new Promise((resolve) => {
      const w = new Worker('js/fec-worker.js?v=' + ASSET_VERSION);
      w.onmessage = (e) => {
        if (e.data.type === 'progress') return;
        w.terminate();
        if (e.data.type === 'done' && archive) e.data.result.meta.archive = archive;
        resolve(e.data.type === 'done' ? { result: e.data.result } : { error: e.data.message });
      };
      w.onerror = (err) => {
        w.terminate();
        resolve({ error: err.message || "Erreur pendant l'analyse." });
      };
      w.postMessage({ buffer, fileName: name, docs }, [buffer]);
    }), (err) => ({ error: err.message }));
  }

  function batchSummary(it) {
    return withFec(it.st, it.profile, () => {
      const r = it.st.result;
      const { errors, warnings } = fecCounts(r);
      const cc = cycleChecks(r);
      const left = {};
      Object.keys(cc).forEach((k) => { left[k] = wpProgress(k, cc[k]).left; });
      left.gen = wpProgress('gen', genPoints(r)).left;
      const mode = isSituation(r) ? 'situation' : 'bilan';
      const pieces = computePieces(r, mode, defaultArrete(r, mode)).length;
      const props = ecrProposals(r).filter((p) => p.on);
      const moisArrete = defaultArrete(r, 'mois');
      return {
        moisArrete, moisPieces: computePieces(r, 'mois', moisArrete).length,
        errors, warnings, left, total: Object.values(left).reduce((s, v) => s + v, 0), pieces, mode,
        ecr: props.length, impact: props.reduce((s, p) => s + ecrImpact(p.lines), 0),
        ca: r.kpi.ca, resultat: r.kpi.resultat, treso: r.kpi.tresorerie,
      };
    });
  }

  async function batchRun(files) {
    const list = files.filter((f) => /\.(txt|csv|tsv|zip)$/i.test(f.name));
    if (!list.length) return toast('Aucun fichier FEC (.txt, .csv) sélectionné.', true);
    const b = (ui.batch = { items: [], total: list.length, done: 0, running: true });
    refresh();
    for (const file of list) {
      if (ui.batch !== b) return; // verrouillage ou nouveau lot
      b.current = file.name;
      refresh();
      const res = await analyseFile(file);
      if (ui.batch !== b) return;
      const it = { fileName: file.name };
      if (res.error) Object.assign(it, { error: res.error });
      else {
        const r = res.result;
        const siren = r.meta.siren;
        const c = clientBySiren(siren);
        it.st = { status: 'done', result: r, clientId: c ? c.id : '', section: 'synthese', q: '', classe: '', fileName: file.name, pct: 100 };
        it.profile = withFec(it.st, 'classique', () => looksLikePharmacy(r)) ? 'pharmacie' : 'classique';
        it.sum = batchSummary(it);
      }
      b.items.push(it);
      b.done++;
    }
    b.running = false;
    b.current = '';
    refresh();
    toast(`${b.done} FEC analysé(s).`);
  }

  function batchItems() {
    const b = ui.batch;
    if (!b) return [];
    return b.items.map((it, i) => Object.assign({ i }, it)).sort((x, y) => (x.error ? 1 : 0) - (y.error ? 1 : 0) || (y.sum ? y.sum.errors * 3 + y.sum.total : 0) - (x.sum ? x.sum.errors * 3 + x.sum.total : 0));
  }

  function viewBatch() {
    const b = ui.batch;
    const head = `<div class="page-head"><h1>Analyse FEC — Portefeuille</h1>
      <div class="head-actions">${b && !b.running && b.items.length ? '<button class="btn" data-action="batch-xlsx">Exporter en Excel</button>' : ''}
        <button class="btn primary" data-action="batch-pick"${b && b.running ? ' disabled' : ''}>${b ? 'Analyser d\'autres FEC' : 'Choisir les FEC'}</button></div></div>${fecProfilesNav('lot')}`;
    if (!b) {
      return `${head}
        <div class="fec-drop card" data-action="batch-pick" role="button" tabindex="0">
          ${icon('chart', 'fec-drop-ico')}
          <p><strong>Sélectionnez ou déposez ici les FEC de plusieurs dossiers</strong> (par exemple tous les dossiers d'un collaborateur), ou leurs archives .zip</p>
          <p class="muted small">Chaque fichier est analysé sur cet appareil, l'un après l'autre, puis rattaché à son dossier par le SIREN du nom de fichier. Rien n'est envoyé ni conservé.</p>
        </div>
        <section class="card"><h2>À quoi ça sert</h2><ul class="bullets">
          <li>Voir d'un coup d'œil <strong>par quels dossiers commencer</strong> : anomalies, points à traiter par cycle, pièces à demander, écritures à passer.</li>
          <li>Ouvrir chaque dossier dans le bon analyseur (classique ou pharmacie, détecté automatiquement) pour la révision détaillée.</li>
          <li>Enregistrer en une fois la synthèse de chaque analyse dans son dossier.</li>
        </ul></section>`;
    }
    const items = batchItems();
    const ok = items.filter((x) => x.sum);
    const linked = ok.filter((x) => x.st.clientId);
    const tot = (k) => ok.reduce((s, x) => s + x.sum[k], 0);
    const name = (x) => {
      const c = x.st && clientById(x.st.clientId);
      return c ? `${c.code ? esc(c.code) + ' — ' : ''}${esc(clientLabel(c))}` : `<span class="muted">${esc(x.fileName)}</span>`;
    };
    const cyc = (x) => ['achats', 'charges', 'clients', 'treso'].filter((k) => x.sum.left[k]).map((k) => `${{ achats: 'Ach.', charges: 'Ch. ext.', clients: 'Cli.', treso: 'Tréso.' }[k]} ${x.sum.left[k]}`).join(' · ');
    return `${head}
      ${b.running ? `<section class="card fec-loading"><p><strong>Analyse ${b.done + 1} / ${b.total}</strong> : ${esc(b.current || '')}</p>
        <div class="fec-progress"><span data-w="${Math.round((b.done / b.total) * 100)}"></span></div></section>` : ''}
      <div class="kpis fec-kpis">
        ${kpiTile('FEC analysés', `${ok.length}${b.total ? ` / ${b.total}` : ''}`)}
        ${kpiTile('Rattachés à un dossier', linked.length, linked.length < ok.length ? 'kpi-wait' : '')}
        ${kpiTile('Anomalies', tot('errors'), tot('errors') ? 'kpi-late' : '')}
        ${kpiTile('Points à traiter', tot('total'), tot('total') ? 'kpi-wait' : '')}
        ${kpiTile('Pièces à demander', tot('pieces'))}
        ${kpiTile('Écritures proposées', tot('ecr'))}
      </div>
      <section class="card"><div class="card-head"><h2>Dossiers par charge de révision</h2>
        ${!b.running && linked.length ? `<button class="btn small" data-action="batch-save">Enregistrer les synthèses dans les dossiers (${linked.length})</button>` : ''}</div>
        <div class="grid-wrap"><table class="dtable num batch"><thead><tr><th>Dossier</th><th>Travail</th><th>Anomalies</th><th>À traiter</th><th>Détail par cycle</th><th>Pièces</th><th>Pièces du mois</th><th>Écritures</th><th>Impact résultat</th><th>CA</th><th>Résultat</th><th></th></tr></thead>
        <tbody>${items.map((x) => x.error ? `<tr><td>${esc(x.fileName)}</td><td colspan="10" class="late">${esc(x.error)}</td><td></td></tr>` : `<tr>
          <td>${name(x)}</td><td>${x.sum.mode === 'situation' ? 'Situation' : 'Bilan'}${x.profile === 'pharmacie' ? ' · officine' : ''}</td>
          <td class="${x.sum.errors ? 'late' : ''}">${x.sum.errors}</td><td>${x.sum.total}</td><td class="small">${cyc(x) || '—'}</td><td>${x.sum.pieces}</td><td>${x.sum.moisPieces ? `<button class="link-btn" data-action="batch-open" data-i="${x.i}" data-mois="1" title="Ouvrir la demande du mois">${x.sum.moisPieces} · ${esc(MOIS_COURTS[Number(x.sum.moisArrete.slice(5, 7)) - 1])}</button>` : '—'}</td><td>${x.sum.ecr}</td>
          <td class="${x.sum.impact < 0 ? 'cred' : ''}">${x.sum.ecr ? eur(x.sum.impact, 0) : ''}</td><td>${eurK(x.sum.ca)}</td><td class="${x.sum.resultat < 0 ? 'cred' : ''}">${eurK(x.sum.resultat)}</td>
          <td><button class="btn small" data-action="batch-open" data-i="${x.i}">Ouvrir</button></td></tr>`).join('')}</tbody></table></div>
        <p class="muted small">Classement : anomalies de conformité d'abord, puis nombre de points de révision restant à traiter. Les FEC sans dossier correspondant (SIREN) peuvent être ouverts et rattachés manuellement.</p>
      </section>`;
  }

  function batchExport() {
    const t = (v, s) => ({ v, s: s === undefined ? 2 : s });
    const n = (v, s) => ({ v: Number(v) || 0, s: s || 8 });
    const rows = [['Dossier', 'Fichier', 'Travail', 'Profil', 'Anomalies', 'Points à traiter', 'Achats', 'Charges externes', 'Clients', 'Trésorerie', 'Généraux', 'Pièces à demander', 'Pièces du mois', 'Écritures proposées', 'Impact résultat', 'CA', 'Résultat', 'Trésorerie fin'].map((c) => t(c, 1))]
      .concat(batchItems().filter((x) => x.sum).map((x) => {
        const c = clientById(x.st.clientId);
        return [t(c ? clientLabel(c) : ''), t(x.fileName), t(x.sum.mode === 'situation' ? 'Situation' : 'Bilan'), t(x.profile === 'pharmacie' ? 'Pharmacie' : 'Classique'),
          n(x.sum.errors, 2), n(x.sum.total, 2), n(x.sum.left.achats || 0, 2), n(x.sum.left.charges || 0, 2), n(x.sum.left.clients || 0, 2), n(x.sum.left.treso || 0, 2), n(x.sum.left.gen || 0, 2),
          n(x.sum.pieces, 2), n(x.sum.moisPieces, 2), n(x.sum.ecr, 2), n(x.sum.impact), n(x.sum.ca), n(x.sum.resultat), n(x.sum.treso)];
      }));
    const blob = XlsxWriter.build({ sheets: [{ name: 'Portefeuille', rows, widths: [34, 30, 11, 11, 11, 13, 9, 11, 9, 11, 10, 12, 12, 12, 14, 14, 14, 14], freeze: { row: 1 } }] });
    download(`portefeuille-fec-${todayStr()}.xlsx`, blob, blob.type);
  }

  function pickFiles(accept) {
    return new Promise((resolve) => {
      const input = $('#file-input');
      input.value = '';
      input.accept = accept;
      input.multiple = true;
      input.onchange = () => {
        const files = Array.from(input.files || []);
        input.multiple = false;
        resolve(files);
      };
      input.click();
    });
  }

  // ---------- Feuille de travail de révision (statuts, commentaires, mémoire du dossier) ----------

  const WP_ST = { '': 'À traiter', justifie: 'Justifié', corrige: 'Corrigé', piece: 'Pièce demandée', na: 'Sans objet' };
  const WP_DONE = ['justifie', 'corrige', 'na'];
  const wpKey = (cycle, label) => `${cycle}:${norm(label).replace(/[\d\s.,€%:()'’-]+/g, ' ').trim()}`;
  // Mémoire du dossier commune à toutes les périodes d'un même contrôle (TVA de chaque mois → « tva »).
  const memoBase = (cycle) => (cycle.startsWith('tva-') ? 'tva' : cycle);
  // Signature d'un exemple, sans dates ni montants : « CB NETFLIX.COM » reste reconnu d'une année sur l'autre.
  const exSig = (s) => norm(s).replace(/\d+/g, ' ').replace(/[^a-z]+/g, ' ').trim().slice(0, 120);

  // Feuille de l'exercice analysé : dans le dossier (chiffrée) si l'analyse y est rattachée, sinon en mémoire le temps de la session.
  function wpStore() {
    const f = ui.fec;
    const r = f.result;
    const c = clientById(f.clientId);
    const key = r.meta.closing || r.meta.fileName;
    if (c) {
      c.revision = c.revision || {};
      return (c.revision[key] = c.revision[key] || { items: {}, cycles: {}, fileName: r.meta.fileName });
    }
    return (f.wp = f.wp || { items: {}, cycles: {} });
  }
  function wpMemo() {
    const c = clientById(ui.fec.clientId);
    if (c) return (c.revisionMemo = c.revisionMemo || {});
    return (ui.fec.memo = ui.fec.memo || {});
  }
  function wpSave() {
    if (!clientById(ui.fec.clientId)) return;
    syncReviewMission();
    persist();
  }

  // Applique la mémoire du dossier : éléments et contrôles justifiés lors d'une revue précédente.
  function applyMemo(list, cycle) {
    const memo = wpMemo();
    return list.map((x) => {
      if (x.level === 'ok' || x.linked) return x;
      const k = wpKey(memoBase(cycle), x.label);
      if (memo[k + '|*']) {
        const m = memo[k + '|*'];
        return Object.assign({}, x, { level: 'ok', memo: true, examples: [], detail: `Justifié lors d'une revue précédente (${m.by || ''} ${m.at ? fmtDate(m.at.slice(0, 10)) : ''})${m.note ? ' : ' + m.note : ''}.` });
      }
      if (!x.examples || !x.examples.length) return x;
      const kept = x.examples.filter((e) => !memo[k + '|' + exSig(e)]);
      const hidden = x.examples.length - kept.length;
      if (!hidden) return x;
      if (!kept.length && x.full) return Object.assign({}, x, { level: 'ok', memo: true, examples: [], detail: `${hidden} élément(s) justifié(s) lors d'une revue précédente.` });
      return Object.assign({}, x, { examples: kept, hiddenEx: hidden, detail: `${x.detail} (${hidden} élément(s) déjà justifié(s) masqué(s).)` });
    });
  }

  // Le dossier a-t-il mémorisé ce contrôle (text = '*') ou un élément dont le libellé contient `text` ?
  function memoHas(cycle, label, text) {
    const memo = wpMemo();
    const k = wpKey(memoBase(cycle), label) + '|';
    if (memo[k + '*']) return true;
    if (text === '*') return false;
    const sig = exSig(text);
    return !!sig && Object.keys(memo).some((m) => m.startsWith(k) && m.slice(k.length).includes(sig));
  }

  function wpItem(cycle, x) {
    return wpStore().items[wpKey(cycle, x.label)] || {};
  }
  // Clé d'un élément (ligne d'exemple) : texte complet, dates et montants compris.
  const elKey = (e) => norm(e).replace(/\s+/g, ' ').trim().slice(0, 200);
  const elOf = (it, e) => (it.els && it.els[elKey(e)]) || {};

  // Statut d'un contrôle : son statut global, sinon celui qui découle de ses éléments traités un par un.
  function checkState(cycle, x) {
    const it = wpItem(cycle, x);
    if (it.st) return it.st;
    const ex = x.examples || [];
    if (!ex.length || !it.els) return '';
    const sts = ex.map((e) => elOf(it, e).st || '');
    if (!sts.every((v) => WP_DONE.includes(v) || v === 'piece')) return '';
    if (sts.includes('piece')) return 'piece';
    return x.full === false ? '' : 'justifie';
  }
  function elCounts(cycle, x) {
    const it = wpItem(cycle, x);
    const ex = x.examples || [];
    return { total: ex.length, done: ex.filter((e) => WP_DONE.includes(elOf(it, e).st || '')).length, wait: ex.filter((e) => elOf(it, e).st === 'piece').length };
  }
  function wpProgress(cycle, list) {
    const todo = list.filter((x) => (x.level === 'error' || x.level === 'warn') && !x.linked);
    const done = todo.filter((x) => WP_DONE.includes(checkState(cycle, x)));
    const wait = todo.filter((x) => checkState(cycle, x) === 'piece');
    return { total: todo.length, done: done.length, wait: wait.length, left: todo.length - done.length - wait.length };
  }

  // Écriture proposée écartée parce que l'élément qui la motive a été justifié, classé sans objet ou n'est plus signalé.
  function elDismissed(src) {
    if (!src || !ui.fec || !ui.fec.result) return false;
    const it = wpStore().items[wpKey(src.cycle, src.check)] || {};
    if (['justifie', 'na'].includes(it.st)) return true;
    if (['justifie', 'na'].includes(elOf(it, src.ex).st)) return true;
    return memoHas(src.cycle, src.check, src.ex);
  }

  // Liste de contrôles avec, pour chaque point, le statut de révision, un commentaire et la mémoire du dossier.
  // Les éléments détaillés (factures, dépenses, opérations…) se traitent aussi un par un.
  function wpCheckList(list, cycle) {
    const order = { error: 0, warn: 1, info: 2, ok: 3 };
    if (!list.length) return '<p class="muted">Aucun point relevé.</p>';
    const f = ui.fec;
    f.wpOpen = f.wpOpen || new Set();
    const opts = (cur, first) => Object.entries(WP_ST).map(([v, l]) => `<option value="${v}"${(cur || '') === v ? ' selected' : ''}>${v === '' && first ? first : l}</option>`).join('');
    return `<ul class="fec-checks wp">${list.slice().sort((a, b) => order[a.level] - order[b.level]).map((c) => {
      const k = wpKey(cycle, c.label);
      const mk = wpKey(memoBase(cycle), c.label);
      const it = wpStore().items[k] || {};
      const actionable = c.level !== 'ok' && !c.linked;
      const ex = c.examples && c.examples.length;
      const state = actionable ? checkState(cycle, c) : '';
      const ec = actionable && ex ? elCounts(cycle, c) : null;
      const shown = ex ? c.examples.filter((e) => !(f.wpHide && actionable && WP_DONE.includes(elOf(it, e).st || ''))) : [];
      const elRow = (e) => {
        const el = elOf(it, e);
        const ek = elKey(e);
        return `<li class="wp-el${WP_DONE.includes(el.st || '') ? ' done' : el.st === 'piece' ? ' wait' : ''}">
          <span class="wp-el-text">${esc(e)}</span>
          <span class="wp-el-ctl">
            <select data-wp="el-st" data-k="${esc(k)}" data-e="${esc(ek)}" data-label="${esc(e)}" data-check="${esc(c.label)}" aria-label="Statut de l'élément">${opts(el.st)}</select>
            <input type="text" data-wp="el-note" data-k="${esc(k)}" data-e="${esc(ek)}" data-label="${esc(e)}" data-check="${esc(c.label)}" value="${esc(el.note || '')}" placeholder="Commentaire" aria-label="Commentaire sur l'élément">
            <button class="link-btn" data-action="wp-memo" data-k="${esc(mk)}" data-sig="${esc(exSig(e))}" data-label="${esc(e.slice(0, 120))}" title="Ne plus signaler cet élément lors des prochaines analyses de ce dossier">Ne plus signaler</button>
          </span></li>`;
      };
      return `<li class="fec-check${WP_DONE.includes(state) ? ' wp-done' : ''}">
        ${ex ? `<details data-wpk="${esc(k)}"${f.wpOpen.has(k) ? ' open' : ''}><summary>` : '<div class="fec-check-row">'}
          ${levelBadge(c.level)}
          <span class="fec-check-text"><span><strong>${esc(c.label)}</strong>${c.linked ? ' <span class="muted small">(point général)</span>' : ''}${ec ? ` <span class="wp-count${ec.done === ec.total ? ' ok' : ''}">${ec.done} / ${ec.total} élément(s) traité(s)${ec.wait ? ` · ${ec.wait} pièce(s) demandée(s)` : ''}</span>` : ''}</span>${c.detail ? `<span class="muted small">${esc(c.detail)}</span>` : ''}</span>
        ${ex ? `</summary>
          ${actionable ? `<div class="wp-bulk">
            <label class="inline-label">Tous les éléments encore à traiter <select data-wp="bulk" data-k="${esc(k)}" data-check="${esc(c.label)}" aria-label="Statut de tous les éléments"><option value="-" selected>Choisir…</option>${opts('-', 'À traiter')}</select></label>
            <label class="check inline"><input type="checkbox" data-wp="hide"${f.wpHide ? ' checked' : ''}><span>Masquer les éléments traités</span></label>
          </div>` : ''}
          <ul class="fec-ex${actionable ? ' wp-els' : ''}">${actionable ? shown.map(elRow).join('') : c.examples.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
          ${actionable && shown.length < c.examples.length ? `<p class="muted small">${c.examples.length - shown.length} élément(s) traité(s) masqué(s).</p>` : ''}
          ${actionable && c.full === false ? '<p class="muted small">Liste limitée aux premiers éléments : le détail complet figure dans l\'export Excel.</p>' : ''}
        </details>` : '</div>'}
        ${actionable ? `<div class="wp-row">
          <select data-wp="st" data-k="${esc(k)}" aria-label="Statut du contrôle">${opts(it.st, ex ? 'Statut global : selon les éléments' : 'À traiter')}</select>
          <input type="text" data-wp="note" data-k="${esc(k)}" value="${esc(it.note || '')}" placeholder="Commentaire de révision" aria-label="Commentaire">
          ${it.by ? `<span class="muted small">${esc(it.by)}, ${fmtDate(it.at.slice(0, 10))}</span>` : ''}
          <button class="link-btn" data-action="wp-memo" data-k="${esc(mk)}" data-sig="*" data-label="${esc(c.label)}" title="Ne plus signaler ce contrôle pour ce dossier">Ne plus signaler</button>
        </div>` : ''}
      </li>`;
    }).join('')}</ul>`;
  }

  // Statut et commentaire d'un élément.
  function wpSetEl(k, ek, patch, label, check) {
    const items = wpStore().items;
    const it = items[k] || (items[k] = {});
    it.els = it.els || {};
    const el = Object.assign(it.els[ek] || {}, patch, { label, check, by: data.settings.utilisateur || '', at: nowIso() });
    if (!el.st && !el.note) delete it.els[ek];
    else it.els[ek] = el;
    if (!Object.keys(it.els).length) delete it.els;
    if (!it.st && !it.note && !it.els) delete items[k];
    wpSave();
  }

  function wpCycleBar(cycle, list) {
    const pg = wpProgress(cycle, list);
    const rev = wpStore().cycles[cycle];
    return `<div class="wp-bar">
      <span class="wp-progress"><span class="wp-track"><i data-w="${pg.total ? Math.round((pg.done / pg.total) * 100) : 100}"></i></span>${pg.done} / ${pg.total} point(s) traité(s)${pg.wait ? ` · ${pg.wait} en attente de pièce` : ''}</span>
      ${rev ? `<span class="lvl lvl-ok"><b aria-hidden="true">✓</b>Revu${rev.by ? ` par ${esc(rev.by)}` : ''} le ${fmtDate(rev.at.slice(0, 10))}</span><button class="link-btn" data-action="wp-review" data-cycle="${cycle}" data-undo="1">Annuler</button>`
        : `<button class="btn small" data-action="wp-review" data-cycle="${cycle}">Marquer le cycle comme revu</button>`}
    </div>`;
  }

  // Année de l'exercice analysé (titre de la mission de revue, rattachement au bilan).
  const fecYear = (r) => (r.meta.closing ? r.meta.closing.slice(0, 4) : (r.meta.maxDate || '').slice(0, 4));

  // Tous les cycles revus : étape « Révision des comptes » du bilan (ou de la situation) de l'exercice cochée.
  function revisionSigned() {
    const f = ui.fec;
    const r = f.result;
    const c = clientById(f.clientId);
    const cc = cycleChecks(r);
    if (!c || !cc) return;
    const keys = Object.keys(CYCLES).filter((k) => k !== 'clients' || ui.fecProfile !== 'pharmacie');
    if (!keys.every((k) => wpStore().cycles[k])) return;
    const year = fecYear(r);
    const why = 'tous les cycles sont marqués comme revus dans la feuille de travail';
    const done = isSituation(r) ? autoStep(c.id, ['situation'], [year, ''], /^r[ée]vision/i, why) : autoStep(c.id, ['bilan'], [year], /^r[ée]vision/i, why);
    if (done) setTimeout(() => toast(`Révision signée — ${done}.`), 0);
  }

  // Mission de revue du FEC : chaque étape liée à un point de la feuille de travail suit son statut (traité ou non).
  function syncReviewMission() {
    const f = ui.fec;
    const c = clientById(f.clientId);
    if (!c || !f.result) return;
    const r = f.result;
    const m = missionsOf(c.id).filter((x) => x.titre === `Revue FEC ${fecYear(r)}` && x.etapes.some((e) => e.key)).sort((a, b) => isOpen(b) - isOpen(a))[0];
    if (!m) return;
    const treated = new Map();
    const note = (cycle, x) => treated.set(wpKey(cycle, x.label), x.level === 'ok' || WP_DONE.includes(checkState(cycle, x)));
    genPoints(r).forEach((x) => note('gen', x));
    const cc = cycleChecks(r) || {};
    Object.keys(cc).forEach((k) => cc[k].forEach((x) => note(k, x)));
    let changed = 0;
    m.etapes.forEach((e) => {
      if (!e.key || !treated.has(e.key) || treated.get(e.key) === !!e.done) return;
      Object.assign(e, { done: treated.get(e.key), doneAt: treated.get(e.key) ? nowIso() : null });
      changed++;
    });
    if (!changed) return;
    const n = m.etapes.filter((e) => e.done).length;
    if (n === m.etapes.length) setStatus(m, 'termine');
    else if (!isOpen(m) || (n && m.statut === 'a_faire')) setStatus(m, 'en_cours');
    m.updatedAt = nowIso();
  }

  function wpSetItem(k, patch) {
    const items = wpStore().items;
    const it = Object.assign(items[k] || {}, patch, { by: data.settings.utilisateur || '', at: nowIso() });
    if (!it.st && !it.note && !it.els) delete items[k];
    else items[k] = it;
    wpSave();
  }

  async function wpMemoAdd(k, sig, label) {
    const note = await ask({ title: 'Ne plus signaler pour ce dossier', message: `« ${esc(label)} » ne sera plus signalé lors des prochaines analyses de ce dossier. Justification (facultatif) :`, input: { placeholder: 'ex. abonnement professionnel (veille), validé avec le dirigeant' }, okLabel: 'Ne plus signaler' });
    if (note === false || note === null || note === undefined) return;
    wpMemo()[`${k}|${sig}`] = { label, note: typeof note === 'string' ? note.trim() : '', by: data.settings.utilisateur || '', at: nowIso() };
    wpSave();
    if (!clientById(ui.fec.clientId)) toast('Rattachez l\'analyse à un dossier pour mémoriser ce choix d\'une année sur l\'autre.');
    refresh();
  }

  // Dossier de travail imprimable : chiffres clés, contrôles par cycle avec statut, commentaire et revue.
  function workpaperHtml() {
    const f = ui.fec;
    const r = f.result;
    const c = clientById(f.clientId);
    const cc = cycleChecks(r);
    const st = wpStore();
    const k = r.kpi;
    const sections = Object.keys(CYCLES).filter((key) => cc[key] && (key !== 'clients' || ui.fecProfile !== 'pharmacie'));
    const row = (cycle, x) => {
      const it = st.items[wpKey(cycle, x.label)] || {};
      const state = x.level === 'ok' ? '' : checkState(cycle, x);
      const els = x.level === 'ok' ? [] : (x.examples || []).filter((e) => elOf(it, e).st || elOf(it, e).note);
      return `<tr><td>${esc((LEVEL[x.level] || LEVEL.info).label)}</td><td><strong>${esc(x.label)}</strong><div class="note-sub">${esc(x.detail || '')}</div></td><td>${esc(x.level === 'ok' ? '—' : WP_ST[state || ''])}</td><td>${esc(it.note || '')}</td></tr>
        ${els.map((e) => `<tr class="wp-sub"><td></td><td>${esc(e)}</td><td>${esc(WP_ST[elOf(it, e).st || ''])}</td><td>${esc(elOf(it, e).note || '')}</td></tr>`).join('')}`;
    };
    const gen = applyMemo(fecPoints(r), 'gen');
    const block = (title, cycle, list) => {
      const rev = st.cycles[cycle];
      return `<h2>${esc(title)}</h2><p class="note-sub">${rev ? `Revu${rev.by ? ` par ${esc(rev.by)}` : ''} le ${fmtDate(rev.at.slice(0, 10))}` : 'Revue non signée'}</p>
        <table class="note-table wp-table"><thead><tr><th>Niveau</th><th>Contrôle</th><th>Statut</th><th>Commentaire</th></tr></thead><tbody>${list.filter((x) => !x.linked).map((x) => row(cycle, x)).join('') || '<tr><td colspan="4">Aucun point.</td></tr>'}</tbody></table>`;
    };
    const ecr = r.cycles ? ecrProposals(r).filter((p) => p.on) : [];
    return `<article class="note">
      <header class="note-head">
        <div><div class="note-cab">${esc(data.settings.cabinet || '')}</div><h1>Dossier de travail — révision</h1>
        <div class="note-sub">${esc(c ? c.nom : r.meta.fileName)}${r.meta.closing ? ` — exercice clos le ${fmtDate(r.meta.closing)}` : ''}</div></div>
        <div class="note-date">${fmtDate(todayStr())}${data.settings.utilisateur ? `<br>${esc(data.settings.utilisateur)}` : ''}</div>
      </header>
      <h2>Chiffres clés</h2>
      <table class="note-table"><tbody>
        <tr><td>Chiffre d'affaires</td><td>${eur(k.ca, 0)} €</td></tr><tr><td>Excédent brut d'exploitation</td><td>${eur(k.ebe, 0)} €</td></tr>
        <tr><td>Résultat net (avant écritures proposées)</td><td>${eur(k.resultat, 0)} €</td></tr><tr><td>Trésorerie</td><td>${eur(k.tresorerie, 0)} €</td></tr>
        <tr><td>Fichier analysé</td><td>${esc(r.meta.fileName)} (${r.meta.lines.toLocaleString('fr-FR')} lignes)</td></tr>
      </tbody></table>
      ${block('Points de révision généraux', 'gen', gen)}
      ${sections.map((key) => block(CYCLES[key], key, cc[key])).join('')}
      ${ecr.length ? `<h2>Écritures proposées retenues</h2><table class="note-table"><thead><tr><th>Écriture</th><th>Montant</th><th>Impact résultat</th></tr></thead><tbody>
        ${ecr.map((p) => `<tr><td>${esc(p.label)}</td><td>${eur(p.amount)} €</td><td>${eur(ecrImpact(p.lines))} €</td></tr>`).join('')}</tbody></table>` : ''}
      <p class="note-foot">Établi à partir du FEC, sur l'appareil du cabinet. Document de travail interne couvert par le secret professionnel.</p>
    </article>`;
  }

  function printHtml(html) {
    let area = $('#print-area');
    if (!area) {
      area = document.createElement('div');
      area.id = 'print-area';
      document.body.appendChild(area);
    }
    area.innerHTML = html;
    document.body.classList.add('printing');
    const done = () => {
      document.body.classList.remove('printing');
      area.innerHTML = '';
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  }

  // ---------- Écritures de clôture proposées (import ACD / Pennylane) ----------

  const round2 = (n) => Math.round(n * 100) / 100 || 0;

  // Longueur habituelle des comptes généraux du dossier (6, 8 chiffres…).
  function acctLen(r) {
    if (r._len) return r._len;
    const n = {};
    r.balance.forEach((b) => { if (/^[67]\d+$/.test(b.compte)) n[b.compte.length] = (n[b.compte.length] || 0) + 1; });
    const len = Number(Object.keys(n).sort((a, b) => n[b] - n[a])[0]) || 6;
    Object.defineProperty(r, '_len', { value: len, configurable: true });
    return len;
  }

  // Compte du dossier commençant par `prefix` (le plus mouvementé), sinon compte standard complété par des zéros.
  function acctOf(r, prefix) {
    const list = r.balance.filter((b) => b.compte.startsWith(prefix));
    if (list.length) return list.sort((a, b) => b.d + b.c - (a.d + a.c))[0].compte;
    return prefix.padEnd(acctLen(r), '0');
  }
  const STD_LIB = {
    486: "Charges constatées d'avance", 487: "Produits constatés d'avance", 416: 'Clients douteux ou litigieux', 491: 'Dépréciations des comptes clients',
    6817: 'Dotations aux dépréciations des actifs circulants', 6712: 'Pénalités et amendes', 695: 'Impôts sur les bénéfices', 444: 'État - impôt sur les bénéfices',
    4456: 'TVA déductible', 408: 'Fournisseurs - factures non parvenues', 418: 'Clients - factures à établir',
  };
  const acctLib = (r, compte) => {
    const b = r.balance.find((x) => x.compte === compte);
    if (b) return b.lib;
    const k = Object.keys(STD_LIB).sort((a, b) => b.length - a.length).find((p) => compte.startsWith(p));
    return k ? STD_LIB[k] : '';
  };

  // Contrepartie présumée pour l'extourne d'une régularisation de l'exercice précédent.
  function largest(r, prefixes) {
    const list = r.balance.filter((b) => prefixes.some((p) => b.compte.startsWith(p)));
    if (!list.length) return prefixes[0].padEnd(acctLen(r), '0');
    return list.sort((a, b) => Math.abs(b.dm - b.cm) - Math.abs(a.dm - a.cm))[0].compte;
  }
  const REGUL = [
    ['408', 'C', ['60', '61', '62'], "Extourne des factures non parvenues de l'exercice précédent"],
    ['418', 'D', ['70'], "Extourne des factures à établir de l'exercice précédent"],
    ['486', 'D', ['61', '62', '60'], "Extourne des charges constatées d'avance de l'exercice précédent"],
    ['487', 'C', ['70'], "Extourne des produits constatés d'avance de l'exercice précédent"],
    ['4286', 'C', ['641'], "Extourne des dettes de congés payés et charges à payer (personnel) de l'exercice précédent"],
    ['4386', 'C', ['645'], "Extourne des charges sociales à payer de l'exercice précédent"],
    ['4486', 'C', ['63'], "Extourne des impôts et taxes à payer de l'exercice précédent"],
    ['4686', 'C', ['62', '61'], "Extourne des charges à payer diverses de l'exercice précédent"],
    ['4198', 'C', ['709', '70'], "Extourne des avoirs à établir de l'exercice précédent"],
    ['4098', 'D', ['609', '60'], "Extourne des rabais et remises à obtenir de l'exercice précédent"],
  ];

  function ecrState() {
    const f = ui.fec;
    if (!f.ecr) f.ecr = { off: new Set(), forceOn: new Set(), amounts: {}, cptes: {}, journal: 'OD', date: '', extourne: false, taux: 50 };
    f.ecr.forceOn = f.ecr.forceOn || new Set();
    if (!f.ecr.date) f.ecr.date = isSituation(f.result) ? defaultArrete(f.result, 'situation') : f.result.meta.closing || pharmaRef(f.result);
    return f.ecr;
  }

  // Propositions : { id, group, label, why, amount, editable, cpte (contrepartie modifiable), extournable, make(amount, cpte) → lignes }.
  function ecrProposals(r) {
    if (!r.cycles) return [];
    const cy = r.cycles;
    const st = ecrState();
    const out = [];
    const L = (compte, lib, d, c, aux) => ({ compte, lib, d: round2(d), c: round2(c), aux: aux || null });
    const add = (p) => out.push(p);
    const dt = fmtDate;
    const closing = r.meta.closing;

    // 1. Charges constatées d'avance probables
    if (closing) cy.charges.cca.forEach((x, i) => add({
      src: { cycle: 'charges', check: "Charges constatées d'avance probables : 0 €", ex: ccaEx(x) },
      id: `cca:${x.compte}:${x.date}:${i}`, group: "Charges et produits constatés d'avance", extournable: true, editable: true, amount: x.cca,
      label: `CCA — ${x.label}`, why: `Paiement du ${dt(x.date)} de ${eur(x.amt)} € (${x.compte}), période présumée de ${x.cover} mois : montant à ajuster selon la facture.`,
      make: (a) => [L(acctOf(r, '486'), `CCA ${x.label}`, a, 0), L(x.compte, `CCA ${x.label}`, 0, a)],
    }));
    // 2. Pièces de l'exercice suivant comptabilisées dans l'exercice
    [...cy.achats.cut.after.items.map((x, i) => [x, 'Achats', cy.achats.cut.after.ex[i], 'achats']), ...cy.charges.cut.after.items.map((x, i) => [x, 'Charges externes', cy.charges.cut.after.ex[i], 'charges'])].forEach(([x, what, ex, cycle], i) => add({
      src: { cycle, check: `${what} : pièces datées après la clôture`, ex },
      id: `cutc:${x.compte}:${x.date}:${i}`, group: "Charges et produits constatés d'avance", extournable: true, editable: true, amount: x.amt,
      label: `Charge de l'exercice suivant — ${x.lib}`, why: `Pièce du ${dt(x.pdate)} saisie le ${dt(x.date)} sur ${x.compte} : neutralisée en charge constatée d'avance.`,
      make: (a) => [L(acctOf(r, '486'), `CCA ${x.lib}`, a, 0), L(x.compte, `CCA ${x.lib}`, 0, a)],
    }));
    if (ui.fecProfile !== 'pharmacie') cy.clients.cut.after.items.forEach((x, i) => add({
      src: { cycle: 'clients', check: 'Ventes : pièces datées après la clôture', ex: cy.clients.cut.after.ex[i] },
      id: `cutv:${x.compte}:${x.date}:${i}`, group: "Charges et produits constatés d'avance", extournable: true, editable: true, amount: x.amt,
      label: `Produit de l'exercice suivant — ${x.lib}`, why: `Facture du ${dt(x.pdate)} saisie le ${dt(x.date)} sur ${x.compte} : neutralisée en produit constaté d'avance.`,
      make: (a) => [L(x.compte, `PCA ${x.lib}`, a, 0), L(acctOf(r, '487'), `PCA ${x.lib}`, 0, a)],
    }));

    // 3. Régularisations de l'exercice précédent non extournées
    if (r.meta.hasAN) REGUL.forEach(([prefix, side, cp, label]) => {
      r.balance.filter((b) => b.compte.startsWith(prefix) && Math.abs(b.an) >= 1).forEach((b) => {
        const rest = round2(Math.abs(b.an) - (b.an < 0 ? b.dm : b.cm));
        if (rest < 1) return;
        const id = `regul:${b.compte}`;
        add({
          id, group: "Extournes de l'exercice précédent", extournable: false, editable: true, amount: rest, cpte: largest(r, cp),
          label: `${label} (${b.compte})`, why: `À-nouveau de ${eur(Math.abs(b.an))} €, dont ${eur(rest)} € non extournés. Contrepartie présumée : vérifiez le compte.`,
          make: (a, c) => (side === 'C' ? [L(b.compte, label, a, 0), L(c, label, 0, a)] : [L(c, label, a, 0), L(b.compte, label, 0, a)]),
        });
      });
    });

    // 4. Dépréciation des créances clients échues depuis plus de 90 jours
    if (ui.fecProfile !== 'pharmacie' && closing) {
      const od = overdue(r, '411', closing, fecTerme());
      const { mv, solde } = sums(r);
      const tx = r.kpi.ca > 0 ? Math.min(0.2, Math.max(0, -mv(['4457']) / r.kpi.ca)) : 0.2;
      const dep = -solde(['491']);
      if (dep < 0.01) od.tiers.filter((t) => t.b91 >= 50).forEach((t) => {
        const ht = round2(t.b91 / (1 + tx));
        add({
          id: `dep:${t.num}`, group: 'Dépréciation des créances', extournable: false, editable: true, amount: round2((ht * st.taux) / 100),
          label: `Dépréciation de la créance ${t.lib}`, why: `${eur(t.b91)} € TTC échus depuis plus de 90 jours (${oldestTxt(t)}), soit ${eur(ht)} € HT ; dotation proposée à ${st.taux} % du HT, à apprécier selon le risque.`,
          make: (a) => [
            L(acctOf(r, '416'), `Reclassement ${t.lib} en douteux`, t.b91, 0), L(acctOf(r, '411'), `Reclassement ${t.lib} en douteux`, 0, t.b91, { num: t.num, lib: t.lib }),
            L(acctOf(r, '6817'), `Dépréciation ${t.lib}`, a, 0), L(acctOf(r, '491'), `Dépréciation ${t.lib}`, 0, a),
          ],
        });
      });
      const douteux = solde(['416']);
      if (douteux > 0.01 && dep < 0.01) add({
        id: 'dep:416', group: 'Dépréciation des créances', extournable: false, editable: true, amount: round2((douteux / (1 + tx)) * st.taux / 100),
        label: 'Dépréciation des clients douteux (416)', why: `${eur(douteux)} € TTC en 416 sans dépréciation ; dotation proposée à ${st.taux} % du HT.`,
        make: (a) => [L(acctOf(r, '6817'), 'Dépréciation clients douteux', a, 0), L(acctOf(r, '491'), 'Dépréciation clients douteux', 0, a)],
      });
    }

    // 5. Corrections
    cy.achats.dupStrong.items.forEach((x, i) => add({
      src: { cycle: 'achats', check: 'Factures fournisseurs en double', ex: cy.achats.dupStrong.ex[i] },
      id: `dup:${x.sup}:${x.piece}:${i}`, group: 'Corrections', extournable: false, editable: false, amount: x.ttc,
      label: `Annulation de la facture en double ${x.piece} — ${x.supLib}`, why: `Facture de ${eur(x.ttc)} € TTC saisie deux fois (la seconde le ${dt(x.date)}) : à confirmer sur le relevé fournisseur.`,
      make: () => [L(acctOf(r, '401'), `Annulation doublon ${x.piece}`, x.ttc, 0, { num: x.sup, lib: x.supLib }), L(x.compte, `Annulation doublon ${x.piece}`, 0, x.ht)]
        .concat(x.tva > 0.005 ? [L(acctOf(r, '4456'), `Annulation doublon ${x.piece}`, 0, x.tva)] : []),
    }));
    const amendes = {};
    cy.charges.amendes.items.forEach((x) => { if (x.compte && !x.compte.startsWith('6712')) amendes[x.compte] = round2((amendes[x.compte] || 0) + x.amt); });
    Object.entries(amendes).forEach(([compte, amt]) => add({
      id: `amende:${compte}`, group: 'Corrections', extournable: false, editable: true, amount: amt,
      label: `Reclassement des amendes et pénalités (${compte})`, why: 'Non déductibles : isolées en 6712 pour être réintégrées sur la 2058-A.',
      make: (a) => [L(acctOf(r, '6712'), 'Reclassement amendes', a, 0), L(compte, 'Reclassement amendes', 0, a)],
    }));
    cy.charges.giftVat.items.forEach((x, i) => add({
      src: { cycle: 'charges', check: 'TVA déduite sur des cadeaux de plus de 73 €', ex: cy.charges.giftVat.ex[i] },
      id: `gift:${x.date}:${i}`, group: 'Corrections', extournable: false, editable: true, amount: x.amt,
      label: `TVA non récupérable sur cadeaux — ${x.lib}`, why: `TVA déduite le ${dt(x.date)} sur des cadeaux de plus de 73 € TTC.`,
      make: (a) => [L(x.compte, 'TVA non récupérable cadeaux', a, 0), L(acctOf(r, '4456'), 'TVA non récupérable cadeaux', 0, a)],
    }));
    cy.achats.autoliq.items.forEach((x, i) => add({
      src: { cycle: 'achats', check: 'Autoliquidation incomplète', ex: cy.achats.autoliq.ex[i] },
      id: `autoliq:${x.date}:${i}`, group: 'Corrections', extournable: false, editable: true, amount: x.amt,
      label: `Déduction de la TVA autoliquidée — ${x.sup}`, why: `Facture ${x.piece || ''} du ${dt(x.date)} : TVA autoliquidée non déduite (à vérifier : droit à déduction total ?).`,
      make: (a) => [L(acctOf(r, '4456'), 'TVA autoliquidée déductible', a, 0), L(x.compte, 'TVA autoliquidée déductible', 0, a)],
    }));

    const finish = (p) => {
      p.amount = round2(st.amounts[p.id] !== undefined ? st.amounts[p.id] : p.amount);
      p.cpteValue = p.cpte ? st.cptes[p.id] || p.cpte : null;
      p.lines = p.make(p.amount, p.cpteValue).filter((l) => l.d || l.c);
      p.dismissed = !!p.src && elDismissed(p.src);
      p.on = st.forceOn.has(p.id) || (!st.off.has(p.id) && !p.dismissed);
      return p;
    };
    out.forEach(finish);

    // 6. Situation : charges annuelles au prorata
    const pj = projection(r);
    if (pj) pj.annual.forEach((a) => {
      // Compte de contrepartie : celui du dossier (situation ou exercice précédent), sinon compte standard.
      const any = (prefix) => (r.balance.some((b) => b.compte.startsWith(prefix)) || !pj.full.balance.some((b) => b.compte.startsWith(prefix)) ? acctOf(r, prefix) : acctOf(pj.full, prefix));
      const cp = /^681/.test(a.compte) ? any('28') : /^63/.test(a.compte) ? any('4486') : /^641/.test(a.compte) ? any('4286') : /^64/.test(a.compte) ? any('4386') : any('4686');
      out.push(finish({
        id: `sit:${a.compte}`, group: 'Situation : charges annuelles au prorata', extournable: true, editable: true, amount: a.prorata, cpte: cp,
        label: `${a.lib} (${a.compte}) au prorata`, why: `${eur(a.full, 0)} € sur l'exercice précédent, comptabilisés après la date de situation : ${Math.round(pj.ratio * 100)} % à étaler. Contrepartie présumée à vérifier.`,
        make: (amt, c2) => [L(a.compte, `Situation ${a.lib}`, amt, 0), L(c2, `Situation ${a.lib}`, 0, amt)],
      }));
    });

    // 7. Impôt sur les sociétés estimé, après prise en compte des autres écritures retenues
    const c = clientById(ui.fec.clientId);
    const isCo = c ? presumedIS(c) : r.balance.some((b) => /^(695|444)/.test(b.compte));
    if (closing && yearEnd(r) && isCo) {
      const { mv } = sums(r);
      const isBooked = mv(['695']);
      const reint = mv(['6712']) + Object.values(amendes).reduce((s, v) => s + v, 0);
      const other = out.filter((p) => p.on).reduce((s, p) => s + ecrImpact(p.lines), 0);
      const base = r.kpi.resultat + isBooked + other + reint;
      if (base > 0) {
        const is = round2(Math.min(base, 42500) * 0.15 + Math.max(0, base - 42500) * 0.25 - isBooked);
        if (is >= 1) out.push(finish({
          id: 'is', group: 'Impôt sur les sociétés', extournable: false, editable: true, amount: is,
          label: 'Impôt sur les sociétés estimé', why: `Résultat avant impôt ${eur(r.kpi.resultat + isBooked, 0)} €${other ? `, écritures retenues ci-dessus ${other > 0 ? '+' : ''}${eur(other, 0)} €` : ''}, amendes réintégrées ${eur(reint, 0)} € : base ${eur(base, 0)} €. 15 % jusqu'à 42 500 € (taux réduit PME, sous conditions) puis 25 %, moins l'IS déjà comptabilisé (${eur(isBooked, 0)} €). Hors autres retraitements fiscaux.`,
          make: (a) => [L(acctOf(r, '695'), 'Impôt sur les sociétés', a, 0), L(acctOf(r, '444'), 'Impôt sur les sociétés', 0, a)],
        }));
      }
    }
    return out;
  }

  const ecrImpact = (lines) => lines.reduce((s, l) => s + (/^7/.test(l.compte) ? l.c - l.d : /^6/.test(l.compte) ? -(l.d - l.c) : 0), 0);

  // Écritures retenues, numérotées, avec leur extourne éventuelle au lendemain.
  function ecrEntries(r) {
    const st = ecrState();
    const list = ecrProposals(r).filter((p) => p.on && p.lines.length);
    const next = addDays(st.date, 1);
    const entries = [];
    list.forEach((p) => {
      entries.push({ date: st.date, label: p.label, lines: p.lines });
      if (st.extourne && p.extournable) entries.push({ date: next, label: `Extourne — ${p.label}`, lines: p.lines.map((l) => ({ ...l, d: l.c, c: l.d, lib: `Extourne ${l.lib}` })) });
    });
    entries.forEach((e, i) => { e.num = i + 1; e.piece = `REV${String(i + 1).padStart(3, '0')}`; });
    return entries;
  }

  function ecrFileBase(r) {
    return `ecritures-revision-${r.meta.siren || 'dossier'}-${(ecrState().date || '').replace(/-/g, '')}`;
  }

  // Format FEC (art. A47 A-1) : importable dans ACD (import FEC) et Pennylane.
  function exportEcrFec(r) {
    const st = ecrState();
    const amt = (v) => (v ? v.toFixed(2).replace('.', ',') : '0,00');
    const clean = (s) => String(s || '').replace(/[\t\r\n]+/g, ' ');
    const head = ['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise'];
    const rows = [head.join('\t')];
    ecrEntries(r).forEach((e) => {
      const d = e.date.replace(/-/g, '');
      e.lines.forEach((l) => rows.push([st.journal, 'Opérations diverses', e.num, d, l.compte, clean(acctLib(r, l.compte)), l.aux ? l.aux.num : '', l.aux ? clean(l.aux.lib) : '', e.piece, d, clean(l.lib), amt(l.d), amt(l.c), '', '', '', '', ''].join('\t')));
    });
    download(`${ecrFileBase(r)}.txt`, rows.join('\r\n') + '\r\n', 'text/plain;charset=utf-8');
  }

  // Tableur (Excel ou CSV) : une ligne par mouvement, pour l'import paramétrable d'ACD ou l'import d'écritures de Pennylane.
  function ecrRows(r) {
    const st = ecrState();
    const rows = [];
    ecrEntries(r).forEach((e) => e.lines.forEach((l) => rows.push({
      journal: st.journal, date: fmtDate(e.date), piece: e.piece, compte: l.compte, aux: l.aux ? l.aux.num : '', auxLib: l.aux ? l.aux.lib : '',
      clib: acctLib(r, l.compte), lib: l.lib, d: l.d, c: l.c,
    })));
    return rows;
  }
  const ECR_COLS = ['Journal', 'Date', 'N° de pièce', 'Compte', 'Compte auxiliaire', 'Libellé du compte auxiliaire', 'Libellé du compte', "Libellé de l'écriture", 'Débit', 'Crédit'];

  function exportEcrXlsx(r) {
    const t = (v, s) => ({ v, s: s === undefined ? 2 : s });
    const n = (v) => ({ v: Number(v) || 0, s: 8 });
    const rows = [ECR_COLS.map((c) => t(c, 1))].concat(ecrRows(r).map((x) => [t(x.journal), t(x.date), t(x.piece), t(x.compte), t(x.aux), t(x.auxLib), t(x.clib), t(x.lib), n(x.d), n(x.c)]));
    const blob = XlsxWriter.build({ sheets: [{ name: 'Écritures', rows, widths: [9, 12, 10, 12, 14, 26, 30, 50, 14, 14], freeze: { row: 1 } }] });
    download(`${ecrFileBase(r)}.xlsx`, blob, blob.type);
  }

  function exportEcrCsv(r) {
    const q = (v) => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const a = (v) => (v ? v.toFixed(2).replace('.', ',') : '');
    const lines = [ECR_COLS.join(';')].concat(ecrRows(r).map((x) => [x.journal, x.date, x.piece, x.compte, x.aux, x.auxLib, x.clib, x.lib, a(x.d), a(x.c)].map(q).join(';')));
    download(`${ecrFileBase(r)}.csv`, '﻿' + lines.join('\r\n') + '\r\n', 'text/csv;charset=utf-8');
  }

  async function ecrExport(kind) {
    const r = ui.fec.result;
    const ok = await ask({ title: 'Fichier non chiffré', message: "Le fichier d'écritures contient des montants et des noms de tiers <strong>non chiffrés</strong>. Importez-le dans votre logiciel puis supprimez-le.", okLabel: 'Exporter' });
    if (!ok) return;
    if (kind === 'fec') exportEcrFec(r);
    else if (kind === 'xlsx') exportEcrXlsx(r);
    else exportEcrCsv(r);
    const c = clientById(ui.fec.clientId);
    if (c) {
      log(c.id, `Écritures de révision exportées (${ecrEntries(r).length} écriture(s), format ${kind.toUpperCase()}).`, true);
      persist();
    }
  }

  function viewEcritures() {
    const r = ui.fec.result;
    const st = ecrState();
    const props = ecrProposals(r);
    const on = props.filter((p) => p.on);
    const impact = on.reduce((s, p) => s + ecrImpact(p.lines), 0);
    const groups = {};
    props.forEach((p) => (groups[p.group] = groups[p.group] || []).push(p));
    const lineTable = (p) => `<div class="grid-wrap"><table class="dtable num ecr-lines"><thead><tr><th>Compte</th><th>Libellé</th><th>Débit</th><th>Crédit</th></tr></thead>
      <tbody>${p.lines.map((l) => `<tr><td>${esc(l.compte)}${l.aux ? ` <span class="muted small">${esc(l.aux.num)}</span>` : ''}</td><td>${esc(l.lib)}</td><td>${l.d ? eur(l.d) : ''}</td><td>${l.c ? eur(l.c) : ''}</td></tr>`).join('')}</tbody></table></div>`;
    return `
      <section class="card">
        <h2>Écritures de clôture proposées</h2>
        <p class="muted small">Calculées à partir des contrôles des cycles. Décochez ce qui ne s'applique pas, ajustez les montants estimés, puis exportez le fichier à importer dans <strong>ACD</strong> ou <strong>Pennylane</strong>. Les écritures ne sont pas validées : elles restent modifiables dans votre logiciel après l'import.</p>
        <div class="filters ecr-opts">
          <label class="inline-label">Journal <input type="text" data-ecr="journal" value="${esc(st.journal)}" maxlength="6" spellcheck="false" aria-label="Code journal"></label>
          <label class="inline-label">Date <input type="date" data-ecr="date" value="${esc(st.date)}"></label>
          <label class="check inline"><input type="checkbox" data-ecr="extourne"${st.extourne ? ' checked' : ''}><span>Extourner les CCA / PCA au ${fmtDate(addDays(st.date, 1))}</span></label>
          <label class="inline-label">Dépréciation <input type="number" min="0" max="100" step="5" data-ecr="taux" value="${st.taux}" aria-label="Taux de dépréciation"> % du HT</label>
        </div>
        <div class="kpis fec-kpis">
          ${kpiTile('Écritures retenues', `${on.length} / ${props.length}`)}
          ${kpiTile('Impact sur le résultat', `${impact > 0 ? '+' : ''}${eurK(impact)}`, impact < 0 ? 'kpi-late' : '')}
          ${kpiTile('Résultat après écritures', eurK(r.kpi.resultat + impact))}
        </div>
        <div class="pieces-actions">
          <button class="btn primary" data-action="ecr-fec"${on.length ? '' : ' disabled'}>Fichier FEC (.txt) — ACD / Pennylane</button>
          <button class="btn" data-action="ecr-xlsx"${on.length ? '' : ' disabled'}>Excel</button>
          <button class="btn" data-action="ecr-csv"${on.length ? '' : ' disabled'}>CSV (point-virgule)</button>
        </div>
        <p class="muted small">ACD : import d'écritures au format FEC, ou import paramétrable du CSV. Pennylane : import d'écritures (FEC ou tableur). Faites un premier essai sur un dossier test pour valider la correspondance des comptes et du journal.</p>
      </section>
      ${props.length ? Object.keys(groups).map((g) => `<section class="card"><h2>${esc(g)} <span class="count">${groups[g].length}</span></h2>
        ${groups[g].map((p) => `<div class="ecr-prop${p.on ? '' : ' off'}">
          <label class="check"><input type="checkbox" data-ecr-sel="${esc(p.id)}"${p.on ? ' checked' : ''}><span><strong>${esc(p.label)}</strong><span class="muted small">${esc(p.why)}</span>${p.dismissed && !p.on ? '<span class="muted small">Écartée : élément justifié ou sans objet dans la feuille de travail.</span>' : ''}</span></label>
          <div class="ecr-edit">
            ${p.editable ? `<label class="inline-label">Montant <input type="number" step="0.01" min="0" data-ecr-amt="${esc(p.id)}" value="${p.amount}"> €</label>` : `<span class="muted small">${eur(p.amount)} €</span>`}
            ${p.cpte ? `<label class="inline-label">Contrepartie <input type="text" data-ecr-cpte="${esc(p.id)}" value="${esc(p.cpteValue)}" spellcheck="false" maxlength="20"></label>` : ''}
          </div>
          ${lineTable(p)}
        </div>`).join('')}</section>`).join('') : '<section class="card"><p class="muted">Aucune écriture à proposer pour ce FEC : rien à régulariser parmi les points détectés automatiquement.</p></section>'}`;
  }

  // Feuilles Excel des cycles : fournisseurs, clients, charges externes, trésorerie.
  function cycleSheets(r, t, n) {
    const cy = r.cycles;
    const h = (cols) => cols.map((c) => t(c, 1));
    const tiers = (list) => [h(['Compte', 'Nom', 'Factures', 'HT', 'TVA', 'TTC', 'Part', 'Avoirs', 'Règlements', 'Solde', 'Délai moyen (j)', 'Réglées > 60 j'])]
      .concat(list.map((x) => [t(x.num), t(x.lib), n(x.inv, 2), n(x.ht), n(x.tva), n(x.ttc), n(Math.round((x.share || 0) * 1000) / 10, 2), n(x.avAmt), n(x.payAmt), n(x.s || 0), x.delay === null ? t('') : n(x.delay, 2), n(x.lateN, 2)]));
    const sheets = [{ name: 'Fournisseurs', rows: tiers(cy.achats.suppliers), widths: [12, 34, 10, 14, 12, 14, 8, 12, 14, 14, 14, 14], freeze: { row: 1 } }];
    if (ui.fecProfile !== 'pharmacie') sheets.push({ name: 'Clients', rows: tiers(cy.clients.customers), widths: [12, 34, 10, 14, 12, 14, 8, 12, 14, 14, 14, 14], freeze: { row: 1 } });
    const months = Array.from(new Set(cy.charges.accounts.flatMap((a) => Object.keys(a.months)))).sort();
    sheets.push({
      name: 'Charges externes', freeze: { row: 1 }, widths: [12, 34, 14].concat(months.map(() => 11), [14]),
      rows: [h(['Compte', 'Libellé', 'Total'].concat(months.map((ym) => `${ym.slice(5)}/${ym.slice(0, 4)}`), ['Payé direct']))]
        .concat(cy.charges.accounts.map((a) => [t(a.compte), t(a.lib), n(a.total)].concat(months.map((ym) => n(a.months[ym] || 0)), [n(a.direct)]))),
    });
    sheets.push({
      name: 'Trésorerie', widths: [40, 16, 16, 16, 16, 16, 14, 14, 14], filter: false,
      rows: [h(['Compte', 'Ouverture', 'Encaissements', 'Décaissements', 'Solde', 'Plus bas', 'Date plus bas', 'Jours débiteurs', 'Dernière opération'])]
        .concat(cy.treso.accounts.map((a) => [t(`${a.compte} ${a.lib}`), n(a.an), n(a.enc), n(a.dec), n(a.solde), n(a.min), t(a.minDate ? fmtDate(a.minDate) : ''), n(a.negDays, 2), t(a.last ? fmtDate(a.last) : '')]))
        .concat([[], h(['Nature des flux', 'Encaissements', 'Décaissements', 'Net'])], cy.treso.flux.map((x) => [t(x.label), n(x.enc), n(x.dec), n(x.enc - x.dec)])),
    });
    return sheets;
  }

  function fecExport() {
    const r = ui.fec.result;
    const m = r.meta;
    const t = (v, s) => ({ v, s: s === undefined ? 2 : s });
    const n = (v, s) => ({ v: Number(v) || 0, s: s || 8 });
    const title = (v) => [{ v, s: 10 }];
    const synth = [title(`Analyse FEC — ${m.fileName}`), [], [t('SIREN', 1), t(m.siren || '')], [t('Clôture', 1), t(m.closing ? m.closing.split('-').reverse().join('/') : '')],
      [t('Lignes', 1), n(m.lines, 2)], [t('Écritures', 1), n(m.entries, 2)], [t('Total débit', 1), n(m.totalD)], [t('Total crédit', 1), n(m.totalC)], [],
      title('Soldes intermédiaires de gestion'), ...r.sig.map((s) => [t(s.label, s.strong ? 1 : 2), n(s.value, s.strong ? 9 : 8)]), [],
      title('Bilan simplifié'), [t('Actif', 1), t('', 1)], ...r.bilan.actif.map(([l, v]) => [t(l), n(v)]), [t('Total actif', 1), n(r.bilan.totalActif, 9)],
      [t('Passif', 1), t('', 1)], ...r.bilan.passif.map(([l, v]) => [t(l), n(v)]), [t('Total passif', 1), n(r.bilan.totalPassif, 9)]];
    const lvl = (l) => (LEVEL[l] || LEVEL.info).label;
    const controls = [[t('Type', 1), t('Statut', 1), t('Contrôle', 1), t('Nombre', 1), t('Détail', 1), t('Exemples', 1)]]
      .concat(r.checks.map((c) => [t('Conformité'), t(lvl(c.level)), t(c.label), n(c.count, 2), t(c.detail), t(c.examples.join('\n'))]))
      .concat(fecPoints(r).map((c) => [t('Révision'), t(lvl(c.level)), t(c.label), t(''), t(c.detail), t((c.examples || []).join('\n'))]))
      .concat(cyclePoints(r).map((c) => [t(CYCLES[c.cycle]), t(lvl(c.level)), t(c.label), t(''), t(c.detail), t((c.examples || []).join('\n'))]));
    const balance = [[t('Compte', 1), t('Libellé', 1), t('Débit', 1), t('Crédit', 1), t('Solde débiteur', 1), t('Solde créditeur', 1)]]
      .concat(r.balance.map((b) => [t(b.compte), t(b.lib), n(b.d), n(b.c), n(b.s > 0 ? b.s : 0), n(b.s < 0 ? -b.s : 0)]));
    const monthly = [[t('Mois', 1), t('Chiffre d\'affaires', 1), t('Produits', 1), t('Charges', 1), t('TVA collectée', 1), t('TVA déductible', 1), t('Trésorerie fin de mois', 1)]]
      .concat(r.monthly.map((x) => [t(`${x.mois.slice(5)}/${x.mois.slice(0, 4)}`), n(x.ca), n(x.produits), n(x.charges), n(x.tvaCollectee), n(x.tvaDeductible), n(x.tresorerie)]));
    const journals = [[t('Code', 1), t('Libellé', 1), t('Écritures', 1), t('Lignes', 1), t('Débit', 1), t('Crédit', 1)]]
      .concat(r.journals.map((j) => [t(j.code), t(j.lib), n(j.entries, 2), n(j.lines, 2), n(j.d), n(j.c)]));
    const blob = XlsxWriter.build({
      sheets: [
        { name: 'Synthèse', rows: synth, widths: [44, 18], filter: false },
        { name: 'Contrôles', rows: controls, widths: [22, 13, 52, 10, 60, 90], freeze: { row: 1 } },
        { name: 'Balance', rows: balance, widths: [12, 40, 16, 16, 16, 16], freeze: { row: 1 } },
        { name: 'Mensuel', rows: monthly, widths: [10, 18, 16, 16, 16, 16, 22], freeze: { row: 1 } },
        { name: 'Journaux', rows: journals, widths: [10, 30, 12, 12, 16, 16], freeze: { row: 1 } },
      ].concat(r.cycles ? cycleSheets(r, t, n) : [], ui.fecProfile === 'pharmacie' && r.aging ? [{
        name: 'Tiers payant', freeze: { row: 1 }, widths: [34, 14, 20, 14, 12, 12, 12, 12, 12, 16],
        rows: [[t('Organisme', 1), t('Compte', 1), t('Type', 1), t('Solde', 1), t('≤ 30 j', 1), t('31-60 j', 1), t('61-90 j', 1), t('> 90 j', 1), t('Encours (j)', 1), t('Rejets probables', 1)]]
          .concat(pharmaData(r, pharmaRef(r)).tiers.map((x) => [t(x.lib), t(x.num), t(CAT_LABEL[x.cat]), n(x.s), n(x.b30), n(x.b60), n(x.b90), n(x.bOld), n(x.encoursJours === null ? 0 : Math.round(x.encoursJours), 2), n(x.rejets)])),
      }] : []),
    });
    download(`analyse-${(m.fileName || 'fec').replace(/\.[^.]+$/, '')}.xlsx`, blob, blob.type);
  }

  function fecSave() {
    const f = ui.fec;
    const c = clientById(f.clientId);
    if (!c) return;
    const r = f.result;
    const { errors, warnings } = fecCounts(r);
    c.fec = (c.fec || []).filter((x) => x.fileName !== r.meta.fileName).concat({
      id: uid(), date: nowIso(), fileName: r.meta.fileName, closing: r.meta.closing, lines: r.meta.lines, entries: r.meta.entries,
      errors, warnings, kpi: r.kpi, points: genPoints(r).concat(cyclePoints(r).filter((a) => a.level === 'error' || a.level === 'warn')).filter((a) => a.level !== 'ok').map((a) => a.label), profil: ui.fecProfile,
    });
    log(c.id, `Analyse FEC ${r.meta.closing ? 'au ' + r.meta.closing.split('-').reverse().join('/') : r.meta.fileName} : ${errors} anomalie(s), ${warnings} point(s) à vérifier.`, true);
    persist();
    toast('Synthèse enregistrée dans le dossier (le FEC lui-même n\'est pas conservé).');
  }

  function fecMission() {
    const f = ui.fec;
    const c = clientById(f.clientId);
    if (!c) return;
    const r = f.result;
    const year = fecYear(r);
    // Chaque étape garde la clé du point de la feuille de travail : elle se coche quand le point y est traité.
    const gen = genPoints(r).map((x) => Object.assign({}, x, { key: wpKey('gen', x.label) }));
    const cyc = cyclePoints(r).map((x) => Object.assign({}, x, { key: wpKey(x.cycle, x.label) }));
    const items = r.checks.concat(gen, cyc).filter((x) => x.level === 'error' || x.level === 'warn')
      .sort((a, b) => (a.level === 'error' ? 0 : 1) - (b.level === 'error' ? 0 : 1))
      .map((x) => ({ key: x.key, label: `${x.cycle ? CYCLES[x.cycle] + ' — ' : ''}${FEC_FAIL[x.id] || x.label}${x.count ? ` (${x.count})` : ''}` }));
    const titre = `Revue FEC ${year}`;
    const existing = missionsOf(c.id).find((m) => m.titre === titre && isOpen(m));
    const stamp = nowIso();
    const etapes = items.map((x) => Object.assign({ id: uid(), label: x.label, done: false, doneAt: null }, x.key ? { key: x.key } : {}));
    if (existing) {
      existing.etapes.forEach((e) => { const x = !e.key && etapes.find((y) => y.label === e.label && y.key); if (x) e.key = x.key; });
      existing.etapes = existing.etapes.concat(etapes.filter((e) => !existing.etapes.some((x) => x.label === e.label)));
      existing.updatedAt = stamp;
    } else {
      data.missions.push({
        id: uid(), clientId: c.id, type: 'libre', titre, exercice: year, echeance: addDays(todayStr(), 14), statut: 'a_faire', priorite: items.length && r.checks.concat(genPoints(r), cyclePoints(r)).some((x) => x.level === 'error') ? 'haute' : 'normale',
        responsable: c.responsable || c.collaborateur || data.settings.utilisateur, recurrence: 'aucune', notes: `Points relevés par l'analyse du fichier ${r.meta.fileName} le ${fmtDate(todayStr())}.`,
        suiteCreee: false, termineLe: null, createdAt: stamp, updatedAt: stamp, etapes,
      });
      log(c.id, `Mission « ${titre} » créée depuis l'analyse du FEC (${items.length} point(s)).`, true);
    }
    syncReviewMission();
    persist();
    toast(`${existing ? 'Mission mise à jour' : 'Mission créée'} : ${items.length} point(s) à traiter, dans le dossier ${clientLabel(c)}.`);
  }

  // Info-bulles des graphiques (texte uniquement, jamais de HTML).
  function showTip(el) {
    let tip = $('#viz-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'viz-tip';
      tip.setAttribute('role', 'tooltip');
      document.body.appendChild(tip);
    }
    tip.textContent = '';
    el.dataset.tip.split('\n').forEach((line, i) => {
      const row = document.createElement('div');
      if (i === 0) row.className = 'tip-title';
      else {
        const [label, value] = line.split(' : ');
        const v = document.createElement('strong');
        v.textContent = value || '';
        row.appendChild(v);
        row.appendChild(document.createTextNode(' ' + label));
        tip.appendChild(row);
        return;
      }
      row.textContent = line;
      tip.appendChild(row);
    });
    const box = el.getBoundingClientRect();
    tip.style.display = 'block';
    const w = tip.offsetWidth;
    tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, box.left + box.width / 2 - w / 2)) + 'px';
    tip.style.top = Math.max(8, box.top + window.scrollY - tip.offsetHeight - 6) + 'px';
    el.classList.add('hover');
  }

  function hideTip(el) {
    const tip = $('#viz-tip');
    if (tip) tip.style.display = 'none';
    if (el) el.classList.remove('hover');
  }

  document.addEventListener('pointerover', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) showTip(el); });
  document.addEventListener('pointerout', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) hideTip(el); });
  document.addEventListener('focusin', (e) => { if (e.target.dataset && e.target.dataset.tip) showTip(e.target); });
  document.addEventListener('focusout', (e) => { if (e.target.dataset && e.target.dataset.tip) hideTip(e.target); });

  // Glisser-déposer d'un FEC sur la page d'analyse.
  document.addEventListener('dragover', (e) => {
    if (data && location.hash.startsWith('#/fec')) {
      e.preventDefault();
      const zone = $('.fec-drop');
      if (zone) zone.classList.add('over');
    }
  });
  document.addEventListener('dragleave', () => { const zone = $('.fec-drop'); if (zone) zone.classList.remove('over'); });
  document.addEventListener('drop', (e) => {
    if (data && location.hash.startsWith('#/fec')) {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files || []);
      if (location.hash.startsWith('#/fec/lot')) { if (files.length && !(ui.batch && ui.batch.running)) batchRun(files); }
      else if (files[0]) startFec(files[0]);
    }
  });

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
        <li>Le <strong>tableau de bord</strong> liste ce qui est en retard, les échéances des 14 prochains jours, les clients à relancer et les missions à valider. Choisissez « Mes dossiers » pour ne voir que votre portefeuille : ce choix s'applique aussi aux missions, au suivi mensuel et au calendrier fiscal.</li>
        <li>Cliquez sur une mission pour cocher ses étapes : elle passe « en cours » à la première étape cochée, et « terminée » à la dernière. Le bouton <strong>✓ Terminée</strong> valide tout d'un coup.</li>
        <li>Les missions récurrentes (TVA, paie, acomptes…) créent automatiquement l'occurrence suivante lorsqu'elles sont terminées.</li>
        <li><strong>Étapes cochées automatiquement</strong> (signalées « automatique » dans la mission et notées au journal du dossier) : quand une demande de pièces issue du FEC est entièrement reçue, l'étape « Pièces reçues » de la TVA ou de la saisie du mois, de la situation ou du bilan est cochée ; quand les quatre cycles sont marqués « revus » dans la feuille de travail, l'étape « Révision des comptes » du bilan (ou de la situation) l'est aussi ; la mission « Revue FEC » suit les points traités dans la feuille de travail.</li>
        <li>Paramètres → <strong>Modèles de missions</strong> : si vous modifiez les étapes d'un modèle, l'application propose de mettre à jour les missions en cours qui ont encore les anciennes étapes (les étapes cochées le restent).</li>
      </ul>`)}
      ${item('Importer le classeur du cabinet', `<p>Dossiers → <strong>Importer</strong>, puis choisissez votre classeur de suivi. S'il contient les onglets INFO DOSSIER, SUIVI TVA, SUIVI RÉVISION, SUIVI SITUATION, SUIVI DÉCLARATION ou SUIVI SAISIE, ils sont tous repris en une fois :</p>
        <ul>
          <li>filtre sur une colonne (ex. <strong>CJ = QUME</strong>), proposé automatiquement si votre prénom ou trigramme figure dans le fichier ;</li>
          <li>les bilans reprennent vos propres étapes de révision (saisie, pointages… envoi EDI, BAT, FN), et une étape cochée coche les précédentes ;</li>
          <li>OK ou montant = fait ; case hachurée, N/A, DISP ou EUX = non applicable ;</li>
          <li>les onglets contenant des identifiants et mots de passe (DGFIP, URSSAF, EBICS) ne sont jamais lus ;</li>
          <li>réimportez le classeur quand vous voulez : rien n'est dupliqué, et aucune case cochée dans l'application n'est décochée.</li>
        </ul>`)}
      ${item('Suivi mensuel (grille)', `<ul>
        <li>Reproduit votre tableau Excel : un dossier par ligne, un mois par colonne. Filtrez par type de mission, régime de TVA (mensuel, trimestriel, CA12) et responsable.</li>
        <li><strong>Tri</strong> : cliquez sur un titre de colonne (N°, Dossier, TVA, Jour) ou choisissez « Trier par » (clôture, responsable, retards et avancement) ; un second clic inverse l'ordre. Le tri est conservé.</li>
        <li><strong>Étapes</strong> (mode par défaut) : un clic sur une case affiche les étapes de la mission ; cliquez sur une étape faite pour la cocher (les précédentes le sont aussi), recliquez pour la décocher. Pour la TVA, <strong>banque importée</strong>, <strong>banque affectée</strong>, <strong>saisie des ventes</strong> et <strong>saisie des achats</strong> se cochent séparément, dans l'ordre où vous les faites (« Banque affectée » coche aussi « Banque importée »). La case indique la dernière étape faite (« Bq import », « Bq affect », « Ventes », « Achats », puis « Saisie » quand les quatre sont faites), et la dernière étape termine la mission. La fenêtre des étapes reste ouverte pour en cocher plusieurs d'affilée (✕, Échap ou un clic à côté pour la fermer). Survolez une case pour voir toutes les étapes.</li>
        <li>Si une <strong>demande de pièces du mois</strong> (analyse FEC mensuelle) est en cours, la fenêtre des étapes l'indique avec le nombre de pièces encore attendues.</li>
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
      ${item('Analyse FEC', `<ul>
        <li>Menu <strong>Analyse FEC</strong> : déposez le fichier des écritures comptables (.txt) d'un dossier. Il est analysé sur l'appareil, sans envoi ni conservation.</li>
        <li><strong>Archive Pennylane (.zip FEC + justificatifs)</strong> : déposez directement l'archive exportée. Le FEC est extrait et seuls les <em>noms</em> des justificatifs sont lus (les fichiers ne sont pas ouverts) : les écritures sans justificatif sont listées exactement dans la synthèse, et les pièces à demander (client, mensuel, mails fournisseurs) citent ces factures précises au lieu d'estimations. Si les noms de fichiers ne reprennent pas les n° de pièce, l'application le signale et revient aux estimations.</li>
        <li><strong>Conformité</strong> : les contrôles de l'article A47 A-1 du LPF (colonnes, dates, équilibre, numérotation…), avec des exemples de lignes en cause.</li>
        <li><strong>Points de révision</strong> : caisse créditrice, comptes d'attente, clients créditeurs, fournisseurs débiteurs, compte courant d'associé débiteur, doublons, dimanches et jours fériés, loi de Benford.</li>
        <li>SIG, bilan simplifié, balance, graphiques mensuels, journaux et tiers ; export Excel complet.</li>
        <li><strong>Contrôle de la TVA</strong> (onglet TVA), pour le mois ou le trimestre choisi :
          <ul>
            <li><strong>brouillon de déclaration CA3</strong> reconstitué depuis les écritures : ventes par taux (taux lu sur les comptes de TVA, sinon déduit de chaque écriture, écritures à plusieurs taux ventilées), exportations, livraisons intracommunautaires, autoliquidation (lignes 2A, 03, 17), TVA déductible sur immobilisations et autres biens et services, crédit reporté, TVA nette ou crédit ;</li>
            <li><strong>rapprochement</strong> avec l'écriture de liquidation comptabilisée et le paiement à la DGFiP : TVA restée en compte après la déclaration (factures saisies après le dépôt), paiement différent du montant dû, crédit de TVA ;</li>
            <li><strong>contrôles</strong> : taux non identifiés ou différents du compte de vente, ventes sans TVA à justifier, autoliquidation non déduite, TVA déduite sur véhicules de tourisme, hébergement, cadeaux, dépenses personnelles, carburants (80 %), TVA sur immobilisations mal ventilée, factures sans TVA, TVA sur les encaissements pour les prestations de services, crédit remboursable ;</li>
            <li>saisissez les <strong>montants télédéclarés</strong> pour les comparer à la comptabilité ; le tableau de <strong>concordance</strong> récapitule chaque période de l'exercice (calculé, liquidé, déclaré) ;</li>
            <li><strong>Valider le contrôle</strong> le note au journal du dossier et coche l'étape « Contrôle et calcul de la TVA » de la mission TVA du mois. Les points se traitent un par un comme dans les cycles ; « Ne plus signaler » vaut pour tous les mois du dossier. Export Excel et impression PDF.</li>
          </ul></li>
        <li><strong>Cycles de révision</strong> (onglets Achats, Charges externes, Clients, Trésorerie) : chaque cycle a ses indicateurs (comparés à N-1 si le FEC précédent est chargé), ses contrôles et ses tableaux.
          <ul>
            <li><strong>Achats</strong> : factures en double, dettes échues, délais de paiement réels (lettrage, ou règlements imputés sur les factures les plus anciennes), TVA déductible anormale ou absente, autoliquidation, pièces hors exercice, factures non parvenues, nouveaux fournisseurs.</li>
            <li><strong>Charges externes</strong> : tableau par compte avec les mois mouvementés, charges récurrentes manquantes, charges constatées d'avance probables, bénéficiaires DAS2, dépenses personnelles possibles, amendes, cadeaux, notes de frais.</li>
            <li><strong>Clients</strong> : trous et doublons dans la numérotation des factures, créances échues et dépréciation, délais d'encaissement, factures sans TVA, facturation de fin d'exercice, factures à établir et produits constatés d'avance de N-1 non extournés.</li>
            <li><strong>Trésorerie</strong> : découverts, espèces de 1 000 € ou plus, caisse, virements internes non soldés, comptes dormants, flux par nature et mouvements importants.</li>
            <li>Les tableaux des délais de paiement de l'article D441-6 du code de commerce sont calculés pour les clients et les fournisseurs (échéance réglable).</li>
          </ul></li>
        <li><strong>Feuille de travail</strong> : chaque point de contrôle reçoit un statut (justifié, corrigé, pièce demandée, sans objet) et un commentaire ; « Marquer le cycle comme revu » signe la revue. Tout est conservé, chiffré, dans le dossier, et une nouvelle analyse du même exercice reprend où vous en étiez. « Dossier de travail (PDF) » imprime l'ensemble.</li>
        <li><strong>Élément par élément</strong> : dépliez un contrôle pour traiter chaque facture, dépense ou opération (statut et commentaire), ou tous ceux encore à traiter en une fois ; « Masquer les éléments traités » allège la liste. Un élément justifié ou sans objet écarte l'écriture proposée correspondante, et un élément en « pièce demandée » s'ajoute aux pièces à demander.</li>
        <li><strong>Mémoire du dossier</strong> : « Justifié » sur un élément (ex. un abonnement validé) ou « Ne plus signaler » sur un contrôle : il ne sera plus remonté lors des analyses suivantes de ce dossier, y compris l'année prochaine. La liste se gère depuis la fiche du dossier (Mémoire de révision).</li>
        <li><strong>Écritures</strong> : les écritures de clôture sont proposées à partir des contrôles (charges et produits constatés d'avance, extournes oubliées de l'exercice précédent, dépréciation des créances échues, annulation des factures en double, reclassement des amendes, TVA sur cadeaux, autoliquidation, impôt sur les sociétés estimé, et pour une situation les charges annuelles au prorata). Ajustez les montants et les contreparties, puis exportez le fichier pour <strong>ACD</strong> ou <strong>Pennylane</strong> (format FEC, Excel ou CSV). Faites un premier import sur un dossier test.</li>
        <li><strong>Situation</strong> : avec le FEC N-1, la situation est comparée à la <strong>même période</strong> de l'exercice précédent, et une projection du résultat de fin d'exercice est calculée, avec les charges annuelles absentes de la situation.</li>
        <li><strong>Portefeuille</strong> : sélectionnez les FEC de plusieurs dossiers en une fois ; ils sont analysés l'un après l'autre, rattachés par SIREN et classés par charge de révision (anomalies, points à traiter, pièces, écritures).</li>
        <li><strong>Demande mensuelle</strong> : Pièces à demander → « Mois », choisissez le mois. L'application liste, pour les achats et les ventes, les factures des fournisseurs et clients habituels absentes, les règlements et encaissements sans facture, les dépenses payées directement, les numéros de facture manquants et les opérations à identifier. Envoyez la demande dès la saisie du mois : la situation et le bilan seront prêts plus vite. Le Portefeuille indique ce nombre pour chaque dossier.</li>
        <li><strong>Demandes directes aux fournisseurs</strong> (sous les pièces à demander) : pour chaque laboratoire, grossiste ou fournisseur dont des factures manquent, un mail avec le n° de compte client du dossier chez lui, la dénomination et la période, qui demande le duplicata des factures et un relevé de compte. Le n° client et l'e-mail sont conservés dans le dossier. Le FEC ne contient pas les pièces jointes : seules les écritures sont analysées.</li>
        <li><strong>Pièces à demander</strong> : choisissez « Situation » ou « Bilan » et la date d'arrêté ; l'application liste les relevés bancaires manquants, les factures récurrentes absentes, les paiements sans facture, les opérations à identifier (471), les acquisitions d'immobilisations, les mois de paie manquants et, pour un bilan, les documents de clôture et les questions sur les créances et dettes anciennes. « Créer la demande » prépare le mail et une mission dont chaque étape est une pièce : cochez-les à réception, la relance ne reprendra que ce qui manque.</li>
        <li><strong>Revue N / N-1</strong> : chargez aussi le FEC de l'exercice précédent. Les postes et les comptes sont comparés, et les variations au-delà du seuil de signification sont listées pour que vous les justifiez. Contrôles de cohérence automatiques : TVA / CA, charges sociales / salaires, amortissements, intérêts, capitaux propres, points fiscaux. La <strong>note de synthèse</strong> s'imprime ou s'enregistre en PDF pour le rendez-vous bilan.</li>
        <li><strong>Rapprochement</strong> : importez le relevé bancaire (CFONB / EBICS, OFX, CAMT.053, CSV ou Excel de la banque). L'application affiche les opérations non comptabilisées, les écritures absentes du relevé et l'état de rapprochement. Les opérations non comptabilisées s'ajoutent aux pièces à demander.</li>
        <li><strong>Deux analyseurs</strong> : « Structure classique » et « Pharmacie », chacun avec son propre FEC en cours (passer de l'un à l'autre ne perd rien). Si un FEC d'officine est déposé dans l'analyseur classique, l'application propose de basculer.</li>
        <li><strong>Pharmacie</strong> : onglet <strong>Tiers payant</strong> (encours AMO, AMC et patients, ancienneté, rejets probables : précis si les comptes 411 sont lettrés, estimés d'après les délais normaux de paiement sinon), onglet <strong>CA et TVA</strong> par taux (2,1 %, 5,5 %, 10 %, 20 %), taux de marque, remises fournisseurs, écarts de caisse. Les comptes 511 (CB, chèques à encaisser) sont traités comme des comptes de transit, et les alertes inadaptées à une officine (Benford, clients créditeurs, ouverture le dimanche) sont retirées. Les pièces à demander ajoutent l'inventaire du LGO, les relevés de tiers payant et de rejets, les RFA et la ROSP.</li>
        <li>Rattachez l'analyse au dossier (reconnu par son SIREN) pour en garder la synthèse, et créez en un clic une <strong>mission de revue</strong> dont les étapes sont les points relevés.</li>
      </ul>`)}
      ${item('Rappels dans votre agenda', `<p>Paramètres → <strong>Échéances dans mon agenda</strong> : téléchargez un fichier .ics et ouvrez-le avec votre agenda pour être prévenu même application fermée. Par défaut, seuls les numéros de dossier apparaissent dans l'agenda.</p>`)}
      ${item('PC et téléphone', `<p>Chaque appareil possède son propre coffre chiffré ; il n'y a volontairement aucun serveur. Pour retrouver vos données sur un autre appareil : exportez une sauvegarde chiffrée, puis <strong>Restaurer une sauvegarde</strong> sur l'autre appareil avec le même mot de passe. La sauvegarde automatique placée dans un dossier synchronisé du cabinet facilite ce transfert.</p>`)}
      ${item('Sécurité et secret professionnel', `<ul>
        <li>Les données sont chiffrées (AES-256) et ne quittent jamais l'appareil. Aucun compte, aucun serveur, aucun traceur.</li>
        <li>Le <strong>mode discret</strong> (icône œil) remplace les noms par les numéros de dossier : utile en rendez-vous ou en déplacement.</li>
        <li>L'application se verrouille seule après quelques minutes d'inactivité. Sans le mot de passe, <strong>personne</strong> ne peut lire les données, pas même vous : notez-le en lieu sûr.</li>
        <li>Sur un appareil personnel protégé par un code, Paramètres → <strong>Ne plus demander le mot de passe sur cet appareil</strong> ouvre l'application directement. Les données restent chiffrées sur le disque, mais quiconque accède à votre session peut les lire. Le mot de passe reste nécessaire pour restaurer une sauvegarde.</li>
        <li>Les exports Excel et CSV ne sont pas chiffrés : supprimez-les après usage.</li>
      </ul>`)}`;
  }

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
    // Filtre sur une colonne de INFO DOSSIER (ex. CJ = QUME).
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
            <label>Ne jamais demander de pièces pour ces fournisseurs<textarea name="piecesIgnore" rows="3" placeholder="RSM">${esc((s.piecesIgnore || []).join('\n'))}</textarea></label>
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
      if (el.dataset.mois) Object.assign(it.st, { section: 'pieces', pieces: { mode: 'mois', arrete: it.sum.moisArrete, excluded: new Set() } });
      ui.fecStates[it.profile] = it.st;
      location.hash = it.profile === 'pharmacie' ? '#/fec/pharma' : '#/fec';
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
    'fec-pick': async () => startFec(await pickFile('.txt,.csv,.tsv,.zip,text/plain,application/zip', true)),
    'fec-tab': (el) => {
      ui.fec.section = el.dataset.tab;
      refresh();
    },
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
      if (!el.dataset.undo) revisionSigned();
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
      window.scrollTo(0, 0);
      refresh();
    },
    'tva-validate': (el) => tvaValidate(!!el.dataset.undo),
    'tva-print': () => printHtml(tvaHtml()),
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
    'fec-switch': (el) => {
      // Le FEC déjà analysé passe dans l'autre analyseur, sans relecture du fichier.
      const st = ui.fec;
      ui.fecStates[el.dataset.to] = st;
      ui.fecStates[ui.fecProfile] = null;
      if (st) st.section = 'synthese';
      location.hash = el.dataset.to === 'pharmacie' ? '#/fec/pharma' : '#/fec';
    },
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
      refresh();
    } else if (t.dataset.tvaDecl && ui.fec && ui.fec.result) {
      const key = tvaState().key;
      const store = tvaDeclStore();
      const d = (store[key] = store[key] || {});
      const v = String(t.value).replace(',', '.').trim();
      d[t.dataset.tvaDecl] = v === '' || !Number.isFinite(Number(v)) ? '' : Number(v);
      if (Object.values(d).every((x) => x === '')) delete store[key];
      if (clientById(ui.fec.clientId)) persist();
      refresh();
    } else if (t.dataset.piece && ui.fec) {
      const st = piecesState();
      t.checked ? st.excluded.delete(t.dataset.piece) : st.excluded.add(t.dataset.piece);
      refresh();
    } else if (t.dataset.pieces === 'arrete' && ui.fec) {
      if (t.value) piecesState().arrete = t.value;
      refresh();
    } else if (t.dataset.pieces === 'mois' && ui.fec) {
      if (/^\d{4}-\d{2}$/.test(t.value)) piecesState().arrete = endOfMonth(`${t.value}-01`);
      refresh();
    } else if (t.dataset.fec && ui.fec) {
      if (t.dataset.fec === 'q') return;
      if (t.dataset.fec === 'client') ui.fec.clientId = t.value;
      else ui.fec[t.dataset.fec] = t.value;
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
})();
