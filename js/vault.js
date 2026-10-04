/*
 * Coffre-fort local chiffré.
 *
 * - Les données ne quittent jamais l'appareil : elles sont stockées dans
 *   IndexedDB, uniquement sous forme chiffrée (AES-GCM 256 bits).
 * - La clé est dérivée du mot de passe maître (PBKDF2-SHA-256, 600 000
 *   itérations, sel aléatoire de 16 octets). Elle n'est jamais stockée et
 *   reste en mémoire sous forme non extractible tant que l'application est
 *   déverrouillée.
 * - Chaque sauvegarde utilise un vecteur d'initialisation (IV) neuf.
 * - Option « ouverture sans mot de passe sur cet appareil » : la clé de session,
 *   non extractible, est conservée dans IndexedDB. Les données restent chiffrées
 *   sur le disque, mais toute personne ayant accès à la session du navigateur peut
 *   les ouvrir. Les sauvegardes exportées restent protégées par le mot de passe.
 */
(function () {
  'use strict';

  const DB_NAME = 'compta-suivi';
  const STORE = 'vault';
  const KEY = 'main';
  const ITERATIONS = 600000;
  const FORMAT = 'compta-suivi/v1';
  const DEVICE = 'meta:deviceKey';

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function b64(buf) {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }

  function unb64(str) {
    const s = atob(str);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idb(mode, fn) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req && req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }

  async function deriveKey(password, salt, iterations) {
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function seal(key, salt, iterations, data) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const aad = enc.encode(FORMAT);
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad },
      key,
      enc.encode(JSON.stringify(data))
    );
    return { format: FORMAT, kdf: 'PBKDF2-SHA256', iterations, salt: b64(salt), iv: b64(iv), data: b64(ct) };
  }

  async function open(key, envelope) {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(envelope.iv), additionalData: enc.encode(FORMAT) },
      key,
      unb64(envelope.data)
    );
    return JSON.parse(dec.decode(pt));
  }

  function checkEnvelope(env) {
    if (!env || env.format !== FORMAT || !env.salt || !env.iv || !env.data) {
      throw new Error('Format de fichier non reconnu.');
    }
  }

  // État en mémoire uniquement.
  let session = null; // { key, salt, iterations }

  const Vault = {
    async exists() {
      return !!(await idb('readonly', (s) => s.get(KEY)));
    },

    isOpen() {
      return !!session;
    },

    async create(password, data) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await deriveKey(password, salt, ITERATIONS);
      session = { key, salt, iterations: ITERATIONS };
      await Vault.save(data);
    },

    async unlock(password) {
      const env = await idb('readonly', (s) => s.get(KEY));
      checkEnvelope(env);
      const salt = unb64(env.salt);
      const key = await deriveKey(password, salt, env.iterations);
      let data;
      try {
        data = await open(key, env);
      } catch (e) {
        throw new Error('Mot de passe incorrect.');
      }
      session = { key, salt, iterations: env.iterations };
      return data;
    },

    async save(data) {
      if (!session) throw new Error('Coffre verrouillé.');
      const env = await seal(session.key, session.salt, session.iterations, data);
      await idb('readwrite', (s) => s.put(env, KEY));
    },

    // Change le mot de passe : nouveau sel, nouvelle clé, rechiffrement.
    async changePassword(oldPassword, newPassword, data) {
      const env = await idb('readonly', (s) => s.get(KEY));
      const oldKey = await deriveKey(oldPassword, unb64(env.salt), env.iterations);
      try {
        await open(oldKey, env);
      } catch (e) {
        throw new Error('Mot de passe actuel incorrect.');
      }
      const salt = crypto.getRandomValues(new Uint8Array(16));
      session = { key: await deriveKey(newPassword, salt, ITERATIONS), salt, iterations: ITERATIONS };
      await Vault.save(data);
      if (await Vault.hasDevice()) await Vault.rememberDevice();
    },

    // Ouverture sans mot de passe sur cet appareil (clé non extractible conservée par le navigateur).
    async rememberDevice() {
      if (!session) throw new Error('Coffre verrouillé.');
      await idb('readwrite', (s) => s.put({ key: session.key }, DEVICE));
    },

    async forgetDevice() {
      await idb('readwrite', (s) => s.delete(DEVICE));
    },

    async hasDevice() {
      const d = await idb('readonly', (s) => s.get(DEVICE));
      return !!(d && d.key);
    },

    // Ouvre le coffre avec la clé conservée sur l'appareil ; null si absente ou devenue invalide.
    async unlockDevice() {
      const d = await idb('readonly', (s) => s.get(DEVICE));
      const env = await idb('readonly', (s) => s.get(KEY));
      if (!d || !d.key || !env) return null;
      checkEnvelope(env);
      let data;
      try {
        data = await open(d.key, env);
      } catch (e) {
        return null;
      }
      session = { key: d.key, salt: unb64(env.salt), iterations: env.iterations };
      return data;
    },

    // Sauvegarde exportable : même format, chiffrée avec la clé courante.
    async exportBackup(data) {
      if (!session) throw new Error('Coffre verrouillé.');
      const env = await seal(session.key, session.salt, session.iterations, data);
      env.exportedAt = new Date().toISOString();
      return JSON.stringify(env);
    },

    // Déchiffre un fichier de sauvegarde avec le mot de passe qui l'a protégé.
    async readBackup(text, password) {
      let env;
      try {
        env = JSON.parse(text);
      } catch (e) {
        throw new Error('Fichier illisible.');
      }
      checkEnvelope(env);
      const key = await deriveKey(password, unb64(env.salt), env.iterations);
      try {
        return await open(key, env);
      } catch (e) {
        throw new Error('Mot de passe de la sauvegarde incorrect ou fichier altéré.');
      }
    },

    lock() {
      session = null;
    },

    async destroy() {
      session = null;
      await idb('readwrite', (s) => s.clear());
    },

    // Réglages techniques non sensibles (ex. référence du fichier de sauvegarde automatique).
    async getMeta(name) {
      return idb('readonly', (s) => s.get('meta:' + name));
    },

    async setMeta(name, value) {
      await idb('readwrite', (s) => (value === undefined ? s.delete('meta:' + name) : s.put(value, 'meta:' + name)));
    },
  };

  window.Vault = Vault;
})();
