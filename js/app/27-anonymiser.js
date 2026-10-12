/*
 * Suivi Dossiers — Anonymisation d'un FEC avant de l'envoyer à un tiers (support, mise au point de l'application).
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- Anonymiser un FEC ----------
// Le moteur (js/fec-anon.js) tourne dans un Web Worker. L'état (fichier, listes de mots, résultat) reste en mémoire,
// n'est jamais enregistré et est effacé au verrouillage : la correspondance entre noms et pseudonymes n'est pas conservée.

const ANON_MODES = {
  clients: { label: 'Clients, personnes et données sensibles', hint: 'Noms des clients (factures de vente, encaissements), des salariés, associés et dirigeants, et du dossier ; fournisseurs conservés. Pour la mise au point de l\'application sur de vrais FEC.' },
  all: { label: 'Tout, fournisseurs compris', hint: 'Tout mot absent du vocabulaire comptable est remplacé : fournisseurs, lieux, activité… Fichier moins lisible.' },
};
const anonState = () => (ui.anon = ui.anon || { mode: 'clients', scale: false, keep: new Set(), force: new Set(), extra: '', status: 'idle', runId: 0 });

function anonStart(file) {
  if (!file) return;
  const st = anonState();
  Object.assign(st, { file, srcName: file.name, seed: crypto.getRandomValues(new Uint32Array(1))[0], keep: new Set(), force: new Set(), extra: '', ok: false, res: null, dirty: false });
  anonRun();
}

// Mots saisis à la main : séparés par des virgules, points-virgules, retours à la ligne ou espaces.
const anonExtra = (st) => st.extra.split(/[\s,;]+/).map((w) => w.trim()).filter((w) => w.length >= 2);

function anonRun() {
  const st = anonState();
  if (!st.file) return;
  const run = ++st.runId;
  Object.assign(st, { status: 'running', ok: false, dirty: false, extraApplied: st.extra });
  if (location.hash.startsWith('#/anonymiser')) refresh();
  const fail = (message) => {
    if (run !== st.runId || ui.anon !== st) return;
    Object.assign(st, { status: 'error', message });
    refresh();
  };
  fecSource(st.file).then(({ buffer, name }) => {
    // Nom du dossier (fiche retrouvée par le SIREN du nom de fichier) : masqué partout
    const m = name.match(/(\d{9})FEC/i);
    const c = m && clientBySiren(m[1]);
    st.dossier = c ? c.nom : '';
    const own = c ? [c.nom, c.code || ''].filter(Boolean) : [];
    const w = new Worker('js/fec-anon.js?v=' + ASSET_VERSION);
    w.onmessage = (e) => {
      w.terminate();
      if (run !== st.runId || ui.anon !== st) return;
      if (e.data.type !== 'done') return fail(e.data.message);
      Object.assign(st, { status: 'done', res: { bytes: e.data.bytes, fileName: e.data.fileName, report: e.data.report } });
      if (location.hash.startsWith('#/anonymiser')) refresh();
      else toast('FEC anonymisé : relisez le résultat avant de le télécharger.');
    };
    w.onerror = (err) => { w.terminate(); fail(err.message || "Erreur pendant l'anonymisation."); };
    w.postMessage({ buffer, fileName: name, opts: { seed: st.seed, mode: st.mode, scale: st.scale, own, keep: Array.from(st.keep), force: Array.from(st.force).concat(anonExtra(st)) } }, [buffer]);
  }, (err) => fail(err.message));
}

// Nom de client fait de mots courants (« CAFE DU PORT ») : tous ses mots sont à remplacer.
function anonForceName(name) {
  const st = anonState();
  (name.match(/\p{L}+/gu) || []).filter((w) => w.length >= 2 && !/^(DE|DU|DES|LA|LE|LES|AU|AUX|ET|D|L)$/i.test(w))
    .forEach((w) => { const k = w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); st.force.add(k); st.keep.delete(k); });
  st.dirty = true;
  st.ok = false;
  refresh();
}

// Un clic sur un mot : conservé → à remplacer, remplacé → à conserver (appliqué avec « Appliquer les modifications »).
function anonToggle(k, mode) {
  const st = anonState();
  if (mode === 'force') {
    if (st.force.has(k)) st.force.delete(k); else { st.force.add(k); st.keep.delete(k); }
  } else if (st.force.has(k)) st.force.delete(k);
  else if (st.keep.has(k)) st.keep.delete(k);
  else st.keep.add(k);
  st.dirty = true;
  st.ok = false;
  refresh();
}

async function anonDownload() {
  const st = anonState();
  if (!st.res || !st.ok || st.dirty || st.extra !== (st.extraApplied || '')) return;
  const ok = await ask({ title: 'Fichier non chiffré', message: `Le FEC anonymisé « ${esc(st.res.fileName)} » est enregistré <strong>non chiffré</strong> sur cet appareil. Envoyez-le, puis supprimez-le.`, okLabel: 'Télécharger' });
  if (ok) download(st.res.fileName, st.res.bytes, /ISO/.test(st.res.report.encoding) ? 'text/plain;charset=iso-8859-15' : 'text/plain;charset=utf-8');
}

function viewAnon() {
  const st = ui.anon;
  const head = `<div class="page-head"><h1>Anonymiser un FEC</h1>
    <div class="head-actions"><a class="btn" href="#/fec">${icon('chart')}Analyse FEC</a>
      ${st && st.file ? '<button class="btn" data-action="anon-clear">Effacer</button>' : ''}
      <button class="btn primary" data-action="anon-pick">${st && st.file ? 'Choisir un autre FEC' : 'Choisir un FEC'}</button></div></div>`;
  const about = `<section class="card"><h2>${icon('shield')} Ce que fait l'anonymisation</h2>
      <p>Pour envoyer un FEC (support, mise au point de l'application sur de vrais fichiers) sans donnée permettant d'identifier le client ni ses propres clients. Le fichier est transformé <strong>sur cet appareil uniquement</strong> : il n'est ni envoyé ni conservé, et la correspondance entre les noms et les pseudonymes n'est jamais enregistrée (l'opération n'est pas réversible).</p>
      <ul>
        <li><strong>Remplacé</strong> : les noms des clients (comptes 41, factures de vente, encaissements, TVA collectée), des salariés, associés, dirigeants et exploitant (comptes 108, 42, 455, salaires, notes de frais), de toute personne repérée par un prénom ou une civilité (« M. », « Mme », « chantier », « SCI »…), et du dossier lui-même (nom de sa fiche, donneur d'ordre des virements Pennylane) ; toujours par le même pseudonyme, dans les libellés comme dans les n° de comptes. Une colonne ajoutée par le logiciel ou une ligne décalée est traitée strictement (tout mot hors vocabulaire comptable).</li>
        <li><strong>Toujours masqué</strong> : IBAN, n° de carte, de sécurité sociale, plaques d'immatriculation, téléphones, e-mails, sites, SIREN / SIRET / RCS / n° de TVA intracommunautaire et numéros longs, SIREN du nom de fichier.</li>
        <li><strong>Conservé</strong> : la structure (colonnes, journaux, n° et dates des écritures, comptes, lettrage, n° de pièces et de factures), l'encodage, le séparateur et les fins de ligne, les noms des fournisseurs, et les montants (modifiables en option par un coefficient aléatoire, chaque écriture restant équilibrée).</li>
      </ul>
      <p class="muted small">Les libellés de paiement par carte citent souvent la ville du commerçant : avec l'activité, elle peut situer le dossier. Relisez la liste des mots conservés avant de télécharger et cliquez sur ceux à remplacer.</p>
    </section>`;
  const drop = `<div class="fec-drop card" data-action="anon-pick" role="button" tabindex="0">
      ${icon('eyeOff', 'fec-drop-ico')}
      <p><strong>Déposez le FEC à anonymiser ici</strong> ou cliquez pour le choisir</p>
      <p class="muted small">Fichier .txt ou .csv (tabulation ou « | »), ou archive .zip Pennylane « FEC + justificatifs » (seul le FEC est repris).</p>
    </div>`;
  if (!st || !st.file) return head + drop + about;
  if (st.status === 'running') return `${head}<section class="card fec-loading"><p><strong>${esc(st.srcName)}</strong></p><p class="muted">Anonymisation en cours…</p></section>`;
  if (st.status === 'error') return `${head}<div class="banner warn"><span><strong>${esc(st.srcName)}</strong> : ${esc(st.message)}</span></div>${drop}`;
  const R = st.res.report;
  const masked = Object.values(R.stats).reduce((t, n) => t + n, 0);
  const n = (x) => x.toLocaleString('fr-FR');
  const chip = (k, txt, cnt, mode, cls, tag) => `<button class="anon-chip${cls ? ' ' + cls : ''}" data-action="anon-word" data-k="${esc(k)}" data-mode="${mode}">${txt} <span>${n(cnt)}${tag ? ` · ${esc(tag)}` : ''}</span></button>`;
  const keptCls = (k) => (st.force.has(k) ? 'pending' : st.keep.has(k) ? 'user' : '');
  const otherChips = R.keptOther.map(([k, c]) => chip(k, esc(k), c, 'force', keptCls(k)));
  const dictChips = R.kept.map(([k, c]) => chip(k, esc(k), c, 'force', keptCls(k)));
  const replChips = R.replaced.map(([k, p, c, why]) => chip(k, `${esc(k)} → ${esc(p)}`, c, 'keep', st.keep.has(k) ? 'pending' : st.force.has(k) ? 'user' : '', why));
  const pending = st.dirty || st.extra !== (st.extraApplied || '');
  const pv = R.preview;
  const whyTxt = Object.entries(R.byWhy).map(([k, c]) => `${c} ${k === 'autre' ? 'hors dictionnaire' : k === 'manuel' ? 'ajouté(s)' : k}`).join(', ');
  return `${head}
    <section class="card">
      <div class="card-head"><h2>${esc(st.srcName)} → ${esc(st.res.fileName)}</h2></div>
      <div class="anon-modes">${Object.entries(ANON_MODES).map(([k, x]) => `<label class="check"><input type="radio" name="anon-mode" data-anon="mode" value="${k}"${st.mode === k ? ' checked' : ''}><span><strong>${esc(x.label)}</strong><br><span class="muted small">${esc(x.hint)}</span></span></label>`).join('')}</div>
      <label class="check"><input type="checkbox" data-anon="scale"${st.scale ? ' checked' : ''}><span>Modifier aussi les montants (coefficient aléatoire, écritures toujours équilibrées) — à éviter pour la mise au point : seuils, doublons et centimes de TVA seraient faussés</span></label>
      <div class="kpis">
        ${kpiTile('Lignes', n(R.lines))}
        ${kpiTile('Mots remplacés (distincts)', n(R.replacedDistinct))}
        ${kpiTile('Remplacements', n(R.replacedCount))}
        ${kpiTile('Numéros masqués', n(masked))}
      </div>
      <p class="muted small">${whyTxt ? `Mots remplacés : ${esc(whyTxt)}. ` : ''}IBAN : ${R.stats.iban} · téléphones : ${R.stats.phone} · e-mails : ${R.stats.email} · sites : ${R.stats.url} · SIREN / SIRET : ${R.stats.siren} · numéros longs : ${R.stats.longnum}. ${R.siren ? `SIREN du nom de fichier remplacé par ${esc(R.fakeSiren)}.` : 'Nom de fichier sans SIREN : un SIREN fictif est utilisé.'} ${R.scale ? 'Montants multipliés par un coefficient aléatoire (non enregistré).' : 'Montants inchangés.'} Encodage ${esc(R.encoding)}, séparateur ${esc(R.sep)}, fins de ligne ${esc(R.eol)} (conservés).</p>
      ${R.misaligned || R.strictCols.length ? `<p class="small">${R.misaligned ? `${n(R.misaligned)} ligne(s) au nombre de zones différent de l'en-tête` : ''}${R.misaligned && R.strictCols.length ? ' et ' : ''}${R.strictCols.length ? `colonne(s) hors norme (${esc(R.strictCols.join(', '))})` : ''} : traitées strictement, tout mot hors vocabulaire comptable remplacé.</p>` : ''}
      <p class="small">${st.dossier ? `Nom du dossier masqué d'après sa fiche : <strong>${esc(st.dossier)}</strong>. ` : 'Aucune fiche de dossier pour ce SIREN : ajoutez son nom (et son nom commercial) dans « Autres mots à remplacer ». '}${R.dossier ? `Donneur d'ordre des virements reconnu comme le dossier : <strong>${esc(R.dossier)}</strong>.` : ''}</p>
    </section>
    <section class="card">
      <h2>Mots remplacés <span class="count">${R.replacedDistinct}</span></h2>
      <p class="muted small">Avec leur pseudonyme et le motif (client, vente, encaissement, personne, dossier…). Cliquez sur un mot sans risque pour le conserver tel quel.${R.replaced.length < R.replacedDistinct ? ` Les ${R.replaced.length} plus fréquents sont affichés.` : ''}</p>
      <div class="anon-chips">${replChips.join('') || '<span class="muted">Aucun.</span>'}</div>
    </section>
    <section class="card">
      <h2>Mots conservés à vérifier <span class="count">${R.keptOtherDistinct}</span></h2>
      <p class="muted small">Mots hors vocabulaire comptable laissés tels quels : fournisseurs, villes, références… <strong>Cliquez sur tout mot qui désigne un client, une personne de l'entreprise, le dossier ou sa ville</strong> pour le remplacer.${R.keptOther.length < R.keptOtherDistinct ? ` Les ${R.keptOther.length} plus fréquents sont affichés.` : ''}</p>
      ${R.generic.length ? `<div class="banner warn anon-generic"><span><strong>${R.generic.length} client(s) ou personne(s) au nom fait de mots courants</strong>, laissé tel quel : cliquez sur un nom pour en remplacer tous les mots.</span></div>
        <div class="anon-chips">${R.generic.map((g) => `<button class="anon-chip" data-action="anon-name" data-name="${esc(g)}">${esc(g)}</button>`).join('')}</div>` : ''}
      <div class="anon-chips">${otherChips.join('') || '<span class="muted">Aucun.</span>'}</div>
      <div class="anon-extra"><label>Autres mots à remplacer (séparés par des virgules)
        <input type="text" data-anon="extra" value="${esc(st.extra)}" placeholder="ex. : nom commercial, ville du dossier" spellcheck="false" autocomplete="off"></label>
        <button class="btn" data-action="anon-run">Remplacer ces mots</button></div>
      <details class="viz-table"><summary>Vocabulaire comptable conservé (${R.kept.length} mots)</summary>
        <div class="anon-chips">${dictChips.join('') || '<span class="muted">Aucun.</span>'}</div></details>
    </section>
    ${pending ? `<div class="banner warn"><span>Modifications en attente : appliquez-les pour mettre à jour le fichier.</span><button class="btn primary" data-action="anon-run">Appliquer les modifications</button></div>` : ''}
    <section class="card">
      <h2>Aperçu du fichier anonymisé</h2>
      <p class="muted small">Premières lignes, puis quelques lignes de chaque journal et de comptes de tiers.</p>
      <div class="grid-wrap"><table class="dtable anon-preview"><thead><tr>${pv.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${pv.rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    </section>
    <section class="card">
      <h2>${icon('shield')} Télécharger</h2>
      <label class="check"><input type="checkbox" data-anon="ok"${st.ok ? ' checked' : ''}${pending ? ' disabled' : ''}><span>J'ai relu l'aperçu et les mots conservés : le fichier ne permet d'identifier ni le dossier, ni ses clients, ni les personnes de l'entreprise.</span></label>
      <p><button class="btn primary" data-action="anon-download"${st.ok && !pending ? '' : ' disabled'}>Télécharger le FEC anonymisé</button></p>
      <p class="muted small">Le fichier téléchargé n'est pas chiffré : envoyez-le, puis supprimez-le. « Effacer » retire de la mémoire le fichier d'origine et la liste des noms remplacés (le verrouillage le fait aussi).</p>
    </section>`;
}

function onAnonChange(t) {
  const st = anonState();
  const k = t.dataset.anon;
  if (k === 'scale') { st.scale = t.checked; anonRun(); }
  else if (k === 'mode') { if (ANON_MODES[t.value]) { st.mode = t.value; anonRun(); } }
  else if (k === 'ok') { st.ok = t.checked; refresh(); }
  else if (k === 'extra') {
    // Pas de nouvel affichage ici (le clic sur « Remplacer ces mots » serait perdu) : le téléchargement attend l'application.
    st.extra = t.value;
    st.ok = false;
    const cb = $('input[data-anon=ok]');
    if (cb) cb.checked = false;
    const b = $('[data-action=anon-download]');
    if (b) b.disabled = true;
  }
}
