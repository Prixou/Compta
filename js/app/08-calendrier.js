/*
 * Suivi Dossiers — Calendrier fiscal.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

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
