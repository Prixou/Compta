/*
 * Suivi Dossiers — Feuille de travail de révision et mémoire du dossier.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- Feuille de travail de révision (statuts, commentaires, mémoire du dossier) ----------

const WP_ST = { '': 'À traiter', justifie: 'Justifié', corrige: 'Corrigé', piece: 'Pièce demandée', na: 'Sans objet' };
const WP_DONE = ['justifie', 'corrige', 'na'];
const wpKey = (cycle, label) => `${cycle}:${norm(label).replace(/[\d\s.,€%:()'’-]+/g, ' ').trim()}`;
// Mémoire du dossier commune à toutes les périodes d'un même contrôle (TVA de chaque mois → « tva », saisie de chaque mois → « saisie »).
const memoBase = (cycle) => (cycle.startsWith('tva-') ? 'tva' : cycle.startsWith('saisie-') ? 'saisie' : cycle);
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
        <span class="fec-check-text"><span><strong>${esc(c.label)}</strong>${c.beta ? ' <span class="badge beta" title="Contrôle récent, pas encore validé sur de vrais dossiers : vérifiez son résultat">bêta</span>' : ''}${c.linked ? ' <span class="muted small">(point général)</span>' : ''}${ec ? ` <span class="wp-count${ec.done === ec.total ? ' ok' : ''}">${ec.done} / ${ec.total} élément(s) traité(s)${ec.wait ? ` · ${ec.wait} pièce(s) demandée(s)` : ''}</span>` : ''}</span>${c.detail ? `<span class="muted small">${esc(c.detail)}</span>` : ''}</span>
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

function wpCycleBar(cycle, list, doneLabel) {
  const pg = wpProgress(cycle, list);
  const rev = wpStore().cycles[cycle];
  return `<div class="wp-bar">
    <span class="wp-progress"><span class="wp-track"><i data-w="${pg.total ? Math.round((pg.done / pg.total) * 100) : 100}"></i></span>${pg.done} / ${pg.total} point(s) traité(s)${pg.wait ? ` · ${pg.wait} en attente de pièce` : ''}</span>
    ${rev ? `<span class="lvl lvl-ok"><b aria-hidden="true">✓</b>Revu${rev.by ? ` par ${esc(rev.by)}` : ''} le ${fmtDate(rev.at.slice(0, 10))}</span><button class="link-btn" data-action="wp-review" data-cycle="${cycle}" data-undo="1">Annuler</button>`
      : `<button class="btn small" data-action="wp-review" data-cycle="${cycle}">${esc(doneLabel || 'Marquer le cycle comme revu')}</button>`}
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
