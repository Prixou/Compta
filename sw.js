/*
 * Service worker : met l'application en cache pour un fonctionnement hors ligne.
 * Il ne manipule jamais les données des dossiers (stockées chiffrées dans IndexedDB)
 * et n'effectue aucune requête vers un autre domaine.
 */
// À garder identique aux ?v= de index.html et à ASSET_VERSION dans js/app/10-fec.js.
const VERSION = '25';
const CACHE = 'suivi-dossiers-v' + VERSION;
const ASSETS = [
  './',
  'index.html',
  'css/styles.css?v=' + VERSION,
  'js/vault.js?v=' + VERSION,
  'js/sheet-reader.js?v=' + VERSION,
  'js/xlsx-writer.js?v=' + VERSION,
  'js/fec-worker.js?v=' + VERSION,
  'js/bank-reader.js?v=' + VERSION,
  'js/archive-reader.js?v=' + VERSION,
  'js/app/01-core.js?v=' + VERSION,
  'js/app/02-ui.js?v=' + VERSION,
  'js/app/03-tableau.js?v=' + VERSION,
  'js/app/04-dossiers.js?v=' + VERSION,
  'js/app/05-missions.js?v=' + VERSION,
  'js/app/06-grille.js?v=' + VERSION,
  'js/app/07-messages.js?v=' + VERSION,
  'js/app/08-calendrier.js?v=' + VERSION,
  'js/app/09-import.js?v=' + VERSION,
  'js/app/10-fec.js?v=' + VERSION,
  'js/app/11-fec-pieces.js?v=' + VERSION,
  'js/app/12-fec-revue.js?v=' + VERSION,
  'js/app/13-fec-pharmacie.js?v=' + VERSION,
  'js/app/14-fec-cycles.js?v=' + VERSION,
  'js/app/15-fec-tva.js?v=' + VERSION,
  'js/app/16-portefeuille.js?v=' + VERSION,
  'js/app/17-revision.js?v=' + VERSION,
  'js/app/18-fec-ecritures.js?v=' + VERSION,
  'js/app/19-sauvegarde.js?v=' + VERSION,
  'js/app/20-aide.js?v=' + VERSION,
  'js/app/21-import-cabinet.js?v=' + VERSION,
  'js/app/22-parametres.js?v=' + VERSION,
  'js/app/23-modales.js?v=' + VERSION,
  'js/app/24-actions.js?v=' + VERSION,
  'js/app/25-formulaires.js?v=' + VERSION,
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Réseau d'abord, en revalidant toujours auprès du serveur (pas de version périmée
// tirée du cache HTTP), puis cache en secours pour le fonctionnement hors ligne.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
