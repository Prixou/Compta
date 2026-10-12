/*
 * Suivi Dossiers — Anonymisation d'un FEC avant de l'envoyer à un tiers (support, mise au point de l'application).
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- Anonymiser un FEC ----------
// Le moteur (js/fec-anon.js) tourne dans un Web Worker. L'état (fichier, listes de mots, résultat) reste en mémoire,
// n'est jamais enregistré et est effacé au verrouillage : la correspondance entre noms et pseudonymes n'est pas conservée.

const anonState = () => (ui.anon = ui.anon || { scale: true, keep: new Set(), force: new Set(), extra: '', status: 'idle', runId: 0 });

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
    const w = new Worker('js/fec-anon.js?v=' + ASSET_VERSION);
    w.onmessage = (e) => {
      w.terminate();
      if (run !== st.runId || ui.anon !== st) return;
      if (e.data.type !== 'done') return fail(e.data.message);
      Object.assign(st, { status: 'done', res: { text: e.data.text, fileName: e.data.fileName, report: e.data.report } });
      if (location.hash.startsWith('#/anonymiser')) refresh();
      else toast('FEC anonymisé : relisez le résultat avant de le télécharger.');
    };
    w.onerror = (err) => { w.terminate(); fail(err.message || "Erreur pendant l'anonymisation."); };
    w.postMessage({ buffer, fileName: name, opts: { seed: st.seed, scale: st.scale, keep: Array.from(st.keep), force: Array.from(st.force).concat(anonExtra(st)) } }, [buffer]);
  }, (err) => fail(err.message));
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
  if (ok) download(st.res.fileName, st.res.text, 'text/plain;charset=utf-8');
}

function viewAnon() {
  const st = ui.anon;
  const head = `<div class="page-head"><h1>Anonymiser un FEC</h1>
    <div class="head-actions"><a class="btn" href="#/fec">${icon('chart')}Analyse FEC</a>
      ${st && st.file ? '<button class="btn" data-action="anon-clear">Effacer</button>' : ''}
      <button class="btn primary" data-action="anon-pick">${st && st.file ? 'Choisir un autre FEC' : 'Choisir un FEC'}</button></div></div>`;
  const about = `<section class="card"><h2>${icon('shield')} Ce que fait l'anonymisation</h2>
      <p>Pour envoyer un FEC (support, mise au point de l'application) sans donnée du client. Le fichier est transformé <strong>sur cet appareil uniquement</strong> : il n'est ni envoyé ni conservé, et la correspondance entre les noms et les pseudonymes n'est jamais enregistrée (l'opération n'est pas réversible).</p>
      <ul>
        <li><strong>Conservé</strong> : la structure du fichier (colonnes, journaux, n° et dates des écritures, comptes généraux, lettrage, n° de pièce et de facture) et le vocabulaire comptable, bancaire et social, ainsi que les grandes enseignes (carburant, télécoms, banques…).</li>
        <li><strong>Remplacé</strong> : les noms de clients, fournisseurs, salariés, associés et lieux, toujours par le même pseudonyme (un tiers garde le même nom de remplacement dans les libellés et dans son n° de compte auxiliaire) ; les IBAN, téléphones, e-mails, sites, SIREN / SIRET et numéros longs ; le SIREN du nom de fichier.</li>
        <li><strong>Montants</strong> (option) : multipliés par un même coefficient aléatoire, chaque écriture restant équilibrée ; des écarts d'arrondi d'un centime sont possibles sur les lettrages.</li>
      </ul>
      <p class="muted small">Relisez la liste des mots conservés avant de télécharger : un nom fait de mots courants (« Boulangerie du Port ») peut y figurer. Cliquez dessus pour le remplacer.</p>
    </section>`;
  const drop = `<div class="fec-drop card" data-action="anon-pick" role="button" tabindex="0">
      ${icon('eyeOff', 'fec-drop-ico')}
      <p><strong>Déposez le FEC à anonymiser ici</strong> ou cliquez pour le choisir</p>
      <p class="muted small">Fichier .txt ou .csv (tabulation ou « | »), ou archive .zip Pennylane « FEC + justificatifs » (seul le FEC est repris).</p>
    </div>`;
  if (!st || !st.file) return head + drop + about;
  const scaleOpt = `<label class="check"><input type="checkbox" data-anon="scale"${st.scale ? ' checked' : ''}><span>Modifier les montants (coefficient aléatoire, écritures toujours équilibrées)</span></label>`;
  if (st.status === 'running') return `${head}<section class="card fec-loading"><p><strong>${esc(st.srcName)}</strong></p><p class="muted">Anonymisation en cours…</p></section>`;
  if (st.status === 'error') return `${head}<div class="banner warn"><span><strong>${esc(st.srcName)}</strong> : ${esc(st.message)}</span></div>${drop}`;
  const R = st.res.report;
  const masked = Object.values(R.stats).reduce((t, n) => t + n, 0);
  const chip = (k, txt, n, mode, cls) => `<button class="anon-chip${cls ? ' ' + cls : ''}" data-action="anon-word" data-k="${esc(k)}" data-mode="${mode}">${txt} <span>${n.toLocaleString('fr-FR')}</span></button>`;
  const keptChips = R.kept.map(([k, n]) => chip(k, esc(k), n, 'force', st.force.has(k) ? 'pending' : st.keep.has(k) ? 'user' : ''));
  const replChips = R.replaced.map(([k, p, n]) => chip(k, `${esc(k)} → ${esc(p)}`, n, 'keep', st.keep.has(k) ? 'pending' : st.force.has(k) ? 'user' : ''));
  const pending = st.dirty || st.extra !== (st.extraApplied || '');
  const pv = R.preview;
  return `${head}
    <section class="card">
      <div class="card-head"><h2>${esc(st.srcName)} → ${esc(st.res.fileName)}</h2></div>
      <div class="kpis">
        ${kpiTile('Lignes', R.lines.toLocaleString('fr-FR'))}
        ${kpiTile('Mots remplacés (distincts)', R.replacedDistinct.toLocaleString('fr-FR'))}
        ${kpiTile('Remplacements', R.replacedCount.toLocaleString('fr-FR'))}
        ${kpiTile('Numéros masqués', masked.toLocaleString('fr-FR'))}
      </div>
      <p class="muted small">IBAN : ${R.stats.iban} · téléphones : ${R.stats.phone} · e-mails : ${R.stats.email} · sites : ${R.stats.url} · SIREN / SIRET : ${R.stats.siren} · numéros longs : ${R.stats.longnum}. ${R.siren ? `SIREN du nom de fichier remplacé par ${esc(R.fakeSiren)}.` : 'Nom de fichier sans SIREN : un SIREN fictif est utilisé.'} ${R.scale ? 'Montants multipliés par un coefficient aléatoire (non enregistré).' : 'Montants inchangés.'} Séparateur : ${esc(R.sep)}, fins de ligne ${esc(R.eol)}.</p>
      ${scaleOpt}
    </section>
    <section class="card">
      <h2>Mots conservés <span class="count">${R.kept.length}</span></h2>
      <p class="muted small">Vocabulaire comptable et bancaire, mois, formes juridiques, organismes et grandes enseignes, du plus fréquent au plus rare. <strong>Cliquez sur un mot qui pourrait identifier le client ou un tiers</strong> pour le remplacer.</p>
      <div class="anon-chips">${keptChips.join('') || '<span class="muted">Aucun.</span>'}</div>
      <div class="anon-extra"><label>Autres mots à remplacer (séparés par des virgules)
        <input type="text" data-anon="extra" value="${esc(st.extra)}" placeholder="ex. : nom commercial, enseigne locale, ville" spellcheck="false" autocomplete="off"></label>
        <button class="btn" data-action="anon-run">Remplacer ces mots</button></div>
    </section>
    <section class="card">
      <h2>Mots remplacés <span class="count">${R.replacedDistinct}</span></h2>
      <p class="muted small">Noms de tiers, de personnes, de lieux, références aléatoires… avec leur pseudonyme. Vous pouvez conserver tel quel un mot sans risque (une activité, un mot courant) pour garder le fichier lisible : cliquez dessus.${R.replaced.length < R.replacedDistinct ? ` Les ${R.replaced.length} plus fréquents sont affichés.` : ''}</p>
      <div class="anon-chips">${replChips.join('') || '<span class="muted">Aucun.</span>'}</div>
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
      <label class="check"><input type="checkbox" data-anon="ok"${st.ok ? ' checked' : ''}${pending ? ' disabled' : ''}><span>J'ai relu l'aperçu et les mots conservés : le fichier ne permet d'identifier ni le client ni ses tiers.</span></label>
      <p><button class="btn primary" data-action="anon-download"${st.ok && !pending ? '' : ' disabled'}>Télécharger le FEC anonymisé</button></p>
      <p class="muted small">Le fichier téléchargé n'est pas chiffré : envoyez-le, puis supprimez-le. « Effacer » retire de la mémoire le fichier d'origine et la liste des noms remplacés (le verrouillage le fait aussi).</p>
    </section>`;
}

function onAnonChange(t) {
  const st = anonState();
  const k = t.dataset.anon;
  if (k === 'scale') { st.scale = t.checked; anonRun(); }
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
