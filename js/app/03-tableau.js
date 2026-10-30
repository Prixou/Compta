/*
 * Suivi Dossiers — Tableau de bord.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

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
  const soon = open.filter((m) => m.echeance && daysToDue(m) >= 0 && daysToDue(m) <= 14).sort(byDue);
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
      backupBanner = `<div class="banner warn dash-backup">
        <span>${days === null ? 'Aucune sauvegarde encore faite' : `Dernière sauvegarde il y a ${days} jours`} : les données n'existent que sur cet appareil.</span>
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
    else if (m.echeance && effDue(m.echeance) < g.due) g.due = effDue(m.echeance);
  });
  const campaigns = Object.values(groups)
    .filter((g) => g.total >= 2 && g.done < g.total && g.due <= horizon)
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 9);

  const section = (title, list, emptyText, max = 12, extra = '') => `
    <section class="card">
      <h2>${title} <span class="count">${list.length}</span></h2>${extra}
      ${list.length ? `<div class="mlist">${list.slice(0, max).map((m) => missionRow(m, true)).join('')}</div>${list.length > max ? `<a class="more" href="#/missions">Voir tout</a>` : ''}` : `<p class="muted">${emptyText}</p>`}
    </section>`;
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const watch = new Set([...late, ...soon, ...wait]).size;

  return `
    <div class="page-head"><div><h1>${esc(hello)}</h1><p class="muted dash-sub">${esc(today.charAt(0).toUpperCase() + today.slice(1))} · ${watch ? `${watch} mission${watch > 1 ? 's' : ''} à surveiller` : 'rien d\'urgent'}</p></div>
      <div class="head-actions">
        <select data-dash="resp" aria-label="Portefeuille">${options(Object.fromEntries([['', 'Tous les dossiers du cabinet']].concat(resps.map((x) => [x, x === s.utilisateur ? `Mes dossiers (${x})` : `Portefeuille de ${x}`]))), r)}</select>
        <button class="btn" data-action="open-cal">${icon('calendar')}Calendrier fiscal</button>
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
    <div class="dash-cols">
      ${section('En retard', late, 'Aucune mission en retard.', 6)}
      ${section('À venir (14 jours)', soon, 'Rien de prévu dans les 14 prochains jours.', 6)}
      ${section('En attente du client', wait, 'Aucune mission en attente du client.', 6, relances.length ? `<p class="late small">${relances.length} sans nouvelles depuis ${s.relanceJours} jours ou plus : à relancer.</p>` : '')}
    </div>
    <div class="grid2">
      ${dashResume()}
      <div>
        ${relances.length ? section(`À relancer <span class="muted small">(sans nouvelles depuis ${s.relanceJours} j ou plus)</span>`, relances, '', 6) : ''}
        ${section('À valider', review, 'Aucune mission à valider.', 6)}
      </div>
    </div>
    ${campaigns.length ? `<section class="card"><h2>Avancement des campagnes</h2><div class="campaigns">${campaigns.map((g) => {
      const p = Math.round((g.done * 100) / g.total);
      return `<div class="campaign"><div class="campaign-head"><span>${esc(g.key)}</span><span class="muted">${g.done}/${g.total}</span></div>${bar(p)}<div class="muted small">${g.due < '9999' ? (g.due < todayStr() ? '<span class="late">échéance dépassée</span>' : 'prochaine échéance ' + fmtDate(g.due)) : ''}</div></div>`;
    }).join('')}</div></section>` : ''}
    ${compliance.length ? `<section class="card"><details${compliance.length <= 3 ? ' open' : ''}><summary><h2>Conformité (lettre de mission, LCB-FT) <span class="count">${compliance.length}</span></h2></summary>
      <p class="muted small">Dossiers dont la lettre de mission ou l'identification LCB-FT n'est pas renseignée ou doit être revue. Complétez-les depuis la fiche du dossier (bouton « Modifier »).</p>
      <div class="clist">${compliance.map(({ c, issues }) => `
        <a class="crow" href="#/dossier/${c.id}"><span class="crow-name">${esc(clientLabel(c))}</span><span class="crow-issues">${issues.map((i) => `<span class="badge warn">${esc(i)}</span>`).join('')}</span></a>`).join('')}
      </div></details></section>` : ''}`;
}

// « Reprendre » : derniers dossiers et outils ouverts (data.settings.recent, mis à jour par route())
const RECENT_TOOLS = { fec: 'Espace FEC', lettrage: 'Lettrage (grand livre)', lcr: 'Écritures LCR', tns: 'Cotisations TNS', calcul: 'Calcul TVA', releves: 'Relevés PDF → Excel',
  ratios: 'Ratios sectoriels', comparer: 'Comparer deux FEC', portefeuille: 'Plusieurs dossiers', anonymiser: 'Anonymiser un FEC', grille: 'Suivi mensuel' };
function noteRecent(view, id) {
  const k = view === 'dossier' ? `d:${id}` : RECENT_TOOLS[view] ? `t:${view}` : '';
  if (!k || !data) return;
  const rec = data.settings.recent || [];
  // Déjà en tête aujourd'hui : rien à enregistrer
  if (rec[0] && rec[0].k === k && rec[0].at.slice(0, 10) === todayStr()) return;
  data.settings.recent = [{ k, at: nowIso() }].concat(rec.filter((x) => x.k !== k)).slice(0, 12);
  persist({ noAutoBackup: true });
}
function dashResume() {
  const when = (iso) => {
    const d = Math.floor((new Date(todayStr()) - new Date(iso.slice(0, 10))) / 86400000);
    return d <= 0 ? 'aujourd\'hui' : d === 1 ? 'hier' : `il y a ${d} jours`;
  };
  const rec = data.settings.recent || [];
  const dossiers = rec.filter((x) => x.k.startsWith('d:')).map((x) => ({ c: clientById(x.k.slice(2)), at: x.at })).filter((x) => x.c && !x.c.archive).slice(0, 5);
  const tools = rec.filter((x) => x.k.startsWith('t:') && RECENT_TOOLS[x.k.slice(2)]).slice(0, 5);
  const row = (href, label, at) => `<a class="dash-rec" href="${href}"><span>${esc(label)}</span><span class="muted small">${when(at)}</span></a>`;
  return `<section class="card dash-resume"><h2>Reprendre</h2>
    ${dossiers.length || tools.length ? `<div class="dash-rec-cols">
      <div><h3>Dossiers</h3>${dossiers.map((x) => row(`#/dossier/${x.c.id}`, clientLabel(x.c), x.at)).join('') || '<p class="muted small">Aucun dossier ouvert récemment.</p>'}</div>
      <div><h3>Outils</h3>${tools.map((x) => row(`#/${x.k.slice(2)}`, RECENT_TOOLS[x.k.slice(2)], x.at)).join('') || '<p class="muted small">Aucun outil ouvert récemment.</p>'}</div>
    </div>` : '<p class="muted">Les dossiers et les outils ouverts récemment apparaîtront ici.</p>'}</section>`;
}
