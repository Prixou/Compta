/*
 * Suivi Dossiers — Référentiels, utilitaires, données et règles communes (missions, portefeuilles, étapes automatiques).
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
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
      piecesIgnore: [], // fournisseurs dont on ne demande jamais les pièces (ex. le cabinet lui-même)
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
