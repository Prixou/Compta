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
