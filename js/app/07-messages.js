/*
 * Suivi Dossiers — Messages et relances clients.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

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
