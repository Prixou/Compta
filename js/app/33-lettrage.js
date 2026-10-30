/*
 * Suivi Dossiers — Lettrage proposé des comptes de tiers (fournisseurs, clients) d'après le grand livre non lettré
 * (PDF ou texte de l'édition « Grands-livres ») ou d'après un FEC.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- Lettrage proposé ----------
// Compte par compte, chaque règlement (dans l'ordre des dates) solde des factures qui se suivent, toutes datées au plus
// tard de son jour et peu espacées (écart maximal réglable entre la première et la dernière), les plus anciennes
// d'abord ; un règlement qui n'a qu'une suite de factures possible passe avant les autres. Puis : relevé saisi en plus
// de ses factures (même total que le règlement), factures et avoirs réglés ensemble, avoir qui annule des factures,
// grosse facture (4 000 € et plus) réglée en plusieurs fois, 2 ou 3 factures non consécutives mais peu espacées quand la
// combinaison est la seule possible, 2 ou 3 factures qui se suivent réglées par 2 règlements postérieurs. Un avoir peut
// faire partie du lot partout : qui se suit avec les factures, ou arrivé un peu avant ou après elles (dans l'écart
// maximal), quand la combinaison est la seule possible. Un fournisseur
// « à échéance M+1 » (indiqué dans les réglages) est réglé le mois suivant : un règlement du mois M+1 ne solde que des
// factures du mois M.
// Ensuite, sur l'ensemble des comptes : règlement resté ouvert dont la facture est sur un autre compte du même tiers
// (hypothèse), doublons de factures, montants du compte d'attente (LCR…) rapprochés des factures ouvertes d'un
// fournisseur, et règlements sans facture (mail de demande des factures manquantes).
// Grand livre : « Compte <code> <nom> » ouvre chaque compte (répété en haut de page), puis une écriture par ligne (ou sur
// plusieurs lignes) : date, pièce, journal, libellé, montant et solde progressif ; le sens se déduit de la variation du
// solde. Un à-nouveau qui cite sa date et son journal d'origine (« 15/12/2025 -AC- ») les reprend. Seules les écritures
// des journaux d'achat et de règlement indiqués sont lettrées.
// FEC : lignes non lettrées des comptes 401 et 404 (ou 411) ; une écriture de banque ou de caisse est un règlement, une
// écriture de charges, de produits ou d'immobilisation une facture, quel que soit son journal.
// Un compte lettré de son côté se ferme : il quitte la liste et le mail (jusqu'à « Rouvrir » ou « Effacer »).
// Une hypothèse visée transfère le règlement sur le compte proposé, où il est lettré avec les factures. Mails de bilan ou
// de situation (demande d'extrait de compte aux fournisseurs dont le lettrage pose problème) et de révision mensuelle.
// Tout reste en mémoire (visas compris) : rien n'est enregistré, et le verrouillage efface l'écran ; seuls les réglages
// sont retenus.

const lettState = () => (ui.lett = ui.lett || { src: '', fileName: '', text: '', fec: null, accs: [], lcAccs: [], ignored: 0, hyp: [], dup: [], lcr: [], miss: [], msg: '', hide: true, q: '', tiers: 'frs', status: 'idle', runId: 0, mail: null, closed: new Set(), vis: new Set(), mx: null, mxEdit: {} });
const LETT_DEF = { ja: 'AC, AH, HA, VT, VE', jr: 'OD, BQ, LCR, CA, CE', md: '45', nc: '', m1: '', lc: 'LCR', ex: '', ign: 'BNC' };
function lettSettings() {
  const s = data.settings.lettrage || {};
  const out = {};
  Object.keys(LETT_DEF).forEach((k) => { out[k] = s[k] !== undefined ? s[k] : LETT_DEF[k]; });
  return out;
}
const lettList = (s) => String(s || '').toUpperCase().split(/[,;\s]+/).filter(Boolean);
const lettCents = (s) => Math.round(parseFloat(s.replace(/\s/g, '').replace(',', '.')) * 100);
const lettFmt = (c) => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lettKey = (x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : x.i - y.i);
const lettLetter = (n) => String.fromCharCode(65 + (Math.floor(n / 26) % 26)) + String.fromCharCode(65 + (n % 26));
const LETT_N = '(-?\\d{1,3}(?:\\s\\d{3})*,\\d{2})';
const LETT_END = new RegExp('(?<=\\s)' + LETT_N + '\\s+' + LETT_N + '\\s*$');
const LETT_NOISE = /Page - \d+|Grands-livres|Edition provisoire|^Du \d|^Date |^Pièce|^Débit|^Comp[ .]|^Total|^\d{6,8} - |^Let\./;
const LETT_AN = /(\d\d)\/(\d\d)\/(\d{4})\s+-([A-Z]{2,4})-/;

// Grand livre (texte) → comptes et écritures
function lettParseGl(text, JA, JR) {
  const accs = [];
  let cur = null, pend = null, prev = 0;
  const known = new Set([...JA, ...JR, 'AN', 'EI']);
  const fin = () => {
    const me = pend.t.match(LETT_END);
    if (!me) return false;
    const label = pend.t.slice(0, me.index).trim(), amt = lettCents(me[1]), bal = lettCents(me[2]), delta = bal - prev;
    prev = bal;
    let j = '?', d = pend.d;
    const mk = label.match(LETT_AN);
    if (mk) { j = mk[4]; d = `${mk[3]}-${mk[2]}-${mk[1]}`; }
    else j = label.split(/\s+/).find((t) => known.has(t)) || '?';
    const type = JA.includes(j) ? 'achat' : JR.includes(j) ? 'reglement' : 'autre';
    cur.lines.push({ d, date: fmtDate(pend.d), j, label: label.replace(/\s+/g, ' '), a: Math.abs(delta) || amt, side: delta > 0 ? 'D' : 'C', type, an: !!mk, i: cur.lines.length });
    return true;
  };
  for (const raw of String(text).split('\n')) {
    const l = raw.trim();
    if (!l) continue;
    const mc = l.match(/^Com\s?pte\s+(\S+)\s*(.*)$/);
    if (mc && cur && cur.code === mc[1]) { pend = null; continue; }
    if (mc) { cur = { code: mc[1], name: mc[2], lines: [] }; accs.push(cur); prev = 0; pend = null; continue; }
    if (LETT_NOISE.test(l)) { pend = null; continue; }
    if (!cur) continue;
    const md = l.match(/^(\d\d)\/(\d\d)\/(\d{4})\s+(.*)$/);
    if (md) pend = { d: `${md[3]}-${md[2]}-${md[1]}`, t: md[4] };
    else if (pend) pend.t += ' ' + l;
    else continue;
    if (fin()) pend = null;
  }
  return accs;
}

// FEC (lignes non lettrées des comptes de tiers, voir lettOpen dans le moteur) → comptes et écritures. Les à-nouveaux,
// sans date, sont placés la veille de l'ouverture de l'exercice.
function lettFromFec(fec, JA, JR, tiers) {
  const roots = tiers === 'cli' ? ['411'] : ['401', '404'];
  const anDay = fec.start ? new Date(Date.parse(fec.start) - 864e5).toISOString().slice(0, 10) : '1900-01-01';
  return fec.open.accs.filter((a) => roots.includes(a.racine)).map((a) => {
    const lines = a.lines.map(([date, amt, jc, lib, piece, kind], i) => {
      const side = amt > 0 ? 'D' : 'C';
      // Facture : crédit d'un fournisseur, débit d'un client
      const inv = (side === 'C') === (tiers !== 'cli');
      const type = JA.includes(jc) ? 'achat' : JR.includes(jc) ? 'reglement' : !date || jc === 'AN' ? (inv ? 'achat' : 'reglement')
        : kind === 'b' ? 'reglement' : kind === 'c' ? 'achat' : 'autre';
      return { d: date || anDay, date: date ? fmtDate(date) : 'à-nouveau', j: date ? jc : 'AN', label: [piece, lib].filter(Boolean).join(' '), a: Math.round(Math.abs(amt) * 100), side, type, an: !date, i };
    });
    return { code: a.num, name: a.lib, lines, invHint: tiers === 'cli' ? 'D' : 'C' };
  });
}

// Écritures consécutives au plus par lettrage (l'écart de dates entre la première et la dernière est la vraie limite)
const LETT_MAXLEN = 60;
// Premières écritures consécutives (au plus `maxLen`, peu espacées) dont la somme fait `target` ; montants positifs.
// Avec avoirs (`avs`, déduits) : d'abord sans avoir, puis moins un avoir proche des factures (dans l'écart maximal).
function lettWinAv(open, avs, target, maxDays) {
  const hit = lettWin(open, target, maxDays);
  if (hit || !avs.length) return hit;
  for (const v of avs) {
    for (let s = 0; s < open.length; s++) {
      let sum = 0;
      for (let e = s; e < open.length && e - s < LETT_MAXLEN; e++) {
        const lo = Math.min(open[s].n, v.n), hi = Math.max(open[e].n, v.n);
        if (hi - lo > maxDays) break;
        sum += open[e].a;
        if (sum === target + v.a) return [...open.slice(s, e + 1), v];
        if (sum > target + v.a) break;
      }
    }
  }
  return null;
}
function lettWin(open, target, maxDays, maxLen = LETT_MAXLEN) {
  for (let s = 0; s < open.length; s++) {
    let sum = 0;
    for (let e = s; e < open.length && e - s < maxLen; e++) {
      if (open[e].n - open[s].n > maxDays) break;
      sum += open[e].a;
      if (sum === target) return open.slice(s, e + 1);
      if (sum > target) break;
    }
  }
  return null;
}
// Écritures non consécutives (fournisseurs indiqués) : premier sous-ensemble trouvé de 2 à `maxLen` écritures parmi les
// 40 premières, recherche bornée.
function lettSubset(items, target, maxLen = 6) {
  const it = items.filter((x) => x.a <= target).slice(0, 40);
  let best = null, n = 0;
  const go = (i, sum, ch) => {
    if (best || n++ > 300000) return;
    if (sum === target && ch.length > 1) { best = ch.slice(); return; }
    if (sum >= target || ch.length >= maxLen) return;
    for (let k = i; k < it.length; k++) go(k + 1, sum + it[k].a, [...ch, it[k]]);
  };
  go(0, 0, []);
  return best;
}

// Facture (ou avoir) qu'un règlement peut solder : jamais postérieure au règlement ; pour un fournisseur à échéance
// M+1, du mois qui précède celui du règlement.
const lettMonth = (d) => +d.slice(0, 4) * 12 + +d.slice(5, 7);
const lettPays = (x, p, m1) => x.d <= p.d && (!m1 || lettMonth(p.d) === lettMonth(x.d) + 1);

// Lettrage d'un compte (factures du côté des écritures d'achat ou de vente : crédit d'un fournisseur, débit d'un client)
function lettRun(a, maxDays, nc) {
  const m1 = !!a.m1;
  const L = a.lines.filter((x) => x.type !== 'autre');
  L.forEach((x) => { x.n = Date.parse(x.d) / 864e5; x.used = 0; });
  const tot = { C: 0, D: 0 };
  L.forEach((x) => { if (x.type === 'achat') tot[x.side] += x.a; });
  const inv = (a.inv = tot.C || tot.D ? (tot.D > tot.C ? 'D' : 'C') : a.invHint || 'C');
  const C = L.filter((x) => x.side === inv).sort(lettKey);
  const P = L.filter((x) => x.side !== inv && x.type === 'reglement').sort(lettKey);
  const V = L.filter((x) => x.side !== inv && x.type === 'achat').sort(lettKey);
  const found = [];
  const take = (cs, ds, m) => { [...cs, ...ds].forEach((x) => { x.used = 1; }); found.push({ m, lines: [...cs, ...ds] }); return found[found.length - 1]; };
  const sg = (x) => (x.side === inv ? x.a : -x.a);
  const find = (open, target, need) => {
    for (let s = 0; s < open.length; s++) {
      let sum = 0;
      for (let e = s; e < open.length && e - s < LETT_MAXLEN; e++) {
        if (open[e].n - open[s].n > maxDays) break;
        sum += sg(open[e]);
        if (sum === target && (!need || open.slice(s, e + 1).some(need))) return open.slice(s, e + 1);
      }
    }
    return null;
  };
  // Toutes les suites de factures consécutives (montants positifs, peu espacées) qui font exactement `target`
  const wins = (open, target) => {
    const out = [];
    for (let s = 0; s < open.length; s++) {
      let sum = 0;
      for (let e = s; e < open.length && e - s < LETT_MAXLEN; e++) {
        if (open[e].n - open[s].n > maxDays) break;
        sum += open[e].a;
        if (sum === target) { out.push(open.slice(s, e + 1)); break; }
        if (sum > target) break;
      }
    }
    return out;
  };
  const pl = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
  // 0 : relevé saisi en plus des factures (même total que le règlement) : lettré à part, mis en évidence
  for (const p of P) {
    const open = C.filter((c) => !c.used && lettPays(c, p, m1));
    for (const r of open.filter((c) => c.a === p.a)) {
      const hit = find(open.filter((c) => c !== r), p.a);
      if (hit && hit.length > 1 && r.d >= hit[hit.length - 1].d) {
        take([...hit, r], [p], `relevé + ${pl(hit.length, 'facture')} ↔ 1 règlement (écart de ${lettFmt(p.a)} €)`).rel = r;
        break;
      }
    }
  }
  // 1 : un règlement solde des factures qui se suivent (toutes antérieures ou du jour), les plus anciennes d'abord ; les
  //     règlements qui n'ont qu'une suite possible passent avant les autres (elle ne peut pas leur être prise)
  const one = (hit) => `1 règlement ↔ ${pl(hit.length, 'facture')}`;
  for (let pass = 0, more = true; more && pass < 5; pass++) {
    more = false;
    for (const p of P) {
      if (p.used) continue;
      const w = wins(C.filter((c) => !c.used && lettPays(c, p, m1)), p.a);
      if (w.length === 1) { take(w[0], [p], one(w[0])); more = true; }
    }
  }
  for (const p of P) {
    if (p.used) continue;
    const op = C.filter((c) => !c.used && lettPays(c, p, m1));
    let hit = wins(op, p.a)[0], m = '';
    if (hit) m = one(hit);
    else if (nc) { hit = lettSubset(op, p.a); if (hit) m = `1 règlement ↔ ${pl(hit.length, 'facture')} non consécutives`; }
    if (hit) take(hit, [p], m);
  }
  // 2 : factures + avoir(s) qui se suivent = un règlement
  for (const p of P) {
    if (p.used) continue;
    const hit = find([...C, ...V].filter((c) => !c.used && lettPays(c, p, m1)).sort(lettKey), p.a, (x) => x.side !== inv);
    if (hit) take(hit, [p], `${pl(hit.filter((x) => x.side === inv).length, 'facture')} + ${pl(hit.filter((x) => x.side !== inv).length, 'avoir')} ↔ 1 règlement`);
  }
  // 2 bis : factures qui se suivent, moins un avoir qui ne les suit pas (arrivé avant ou après elles, daté au plus tard
  //     du règlement, dans l'écart maximal avec les factures) : seulement si la combinaison est la seule possible. Deux
  //     avoirs ou plus ne sont lettrés que s'ils se suivent avec les factures (étape 2) : au-delà, trop de hasard.
  const span = (lines) => { let lo = Infinity, hi = -Infinity; lines.forEach((x) => { lo = Math.min(lo, x.n); hi = Math.max(hi, x.n); }); return hi - lo; };
  for (const p of P) {
    if (p.used) continue;
    const avs = V.filter((v) => !v.used && lettPays(v, p, m1)).slice(-8);
    if (!avs.length) continue;
    const op = C.filter((c) => !c.used && lettPays(c, p, m1));
    const sols = [];
    for (const v of avs) {
      for (const w of wins(op, p.a + v.a)) if (span([...w, v]) <= maxDays) sols.push([...w, v]);
      if (sols.length > 1) break;
    }
    if (sols.length === 1) take(sols[0], [p], `${pl(sols[0].length - 1, 'facture')} + 1 avoir ↔ 1 règlement`);
  }
  // 3 : un avoir annule une ou plusieurs factures qui se suivent
  for (const v of V) {
    if (v.used) continue;
    const hit = find(C.filter((c) => !c.used && c.d <= v.d), v.a);
    if (hit) take(hit, [v], `1 avoir ↔ ${pl(hit.length, 'facture')}`);
  }
  // 4 : une facture réglée en plusieurs règlements qui se suivent (postérieurs), réservé aux factures de 4 000 € et plus
  for (const c of C) {
    if (c.used || c.a < 400000) continue;
    const open = P.filter((p) => !p.used && lettPays(c, p, m1));
    let hit = null;
    for (let s = 0; s < open.length && !hit; s++) {
      let sum = 0;
      for (let e = s; e < open.length && e - s < 5; e++) { sum += open[e].a; if (sum === c.a) { hit = open.slice(s, e + 1); break; } if (sum > c.a) break; }
    }
    if (hit && hit.length > 1) take([c], hit, `1 facture ↔ ${hit.length} règlements`);
  }
  // 5 : idem, mais les règlements ne se suivent pas forcément (2 ou 3 règlements dans les 90 jours) : à vérifier
  for (const c of C) {
    if (c.used || c.a < 400000) continue;
    const open = P.filter((p) => !p.used && lettPays(c, p, m1) && p.n - c.n <= 90 && p.a < c.a);
    let hit = null;
    for (let i = 0; i < open.length && !hit; i++) {
      for (let j = i + 1; j < open.length && !hit; j++) {
        if (open[i].a + open[j].a === c.a) hit = [open[i], open[j]];
        else for (let k = j + 1; k < open.length && !hit; k++) if (open[i].a + open[j].a + open[k].a === c.a) hit = [open[i], open[j], open[k]];
      }
    }
    if (hit) take([c], hit, `1 facture ↔ ${hit.length} règlements non consécutifs (à vérifier)`);
  }
  // 6 : un règlement solde 2 ou 3 factures non consécutives (parmi les 12 plus récentes), peu espacées, ou 2 factures
  //     moins un avoir proche : seulement si la combinaison est la seule possible (à vérifier). Au-delà, les sommes qui
  //     tombent juste par hasard se multiplient.
  for (const p of P) {
    if (p.used) continue;
    const sols = [];
    for (const v of [null, ...V.filter((x) => !x.used && lettPays(x, p, m1)).slice(-4)]) {
      const target = p.a + (v ? v.a : 0);
      const cand = C.filter((c) => !c.used && c.a < target && lettPays(c, p, m1)).slice(-12);
      const go = (i, sum, ch) => {
        if (sols.length > 1) return;
        if (sum === target && ch.length > 1) { if (!v || span([...ch, v]) <= maxDays) sols.push(v ? [...ch, v] : ch.slice()); return; }
        if (sum >= target || ch.length >= (v ? 2 : 3)) return;
        for (let k = i; k < cand.length; k++) {
          if (ch.length && cand[k].n - ch[0].n > maxDays) break;
          ch.push(cand[k]);
          go(k + 1, sum + cand[k].a, ch);
          ch.pop();
        }
      };
      go(0, 0, []);
      if (sols.length > 1) break;
    }
    if (sols.length === 1) {
      const n = sols[0].filter((x) => x.side === inv).length;
      take(sols[0], [p], `1 règlement ↔ ${pl(n, 'facture')} non consécutives${sols[0].length > n ? ' + 1 avoir' : ''} (à vérifier)`);
    }
  }
  // 7 : 2 ou 3 factures qui se suivent (peu espacées), moins éventuellement un avoir proche ↔ 2 règlements qui se
  //     suivent, tous deux postérieurs à la dernière facture (et à l'avoir) et dans l'écart maximal après elle
  const Cs = C.filter((c) => !c.used), Ps = P.filter((p) => !p.used), Vs = V.filter((v) => !v.used);
  for (let i = 0; i < Cs.length; i++) {
    if (Cs[i].used) continue;
    let tI = 0;
    for (let j = i; j < Cs.length && j - i < 3; j++) {
      if (Cs[j].used || Cs[j].n - Cs[i].n > maxDays) break;
      tI += Cs[j].a;
      if (j === i) continue;
      let hit = null, grp = null;
      for (const v of [null, ...Vs.filter((x) => !x.used && Math.max(Cs[j].n, x.n) - Math.min(Cs[i].n, x.n) <= maxDays)]) {
        const g = v ? [...Cs.slice(i, j + 1), v] : Cs.slice(i, j + 1), total = tI - (v ? v.a : 0);
        const last = g.reduce((m, x) => (x.d > m.d ? x : m), g[0]);
        let k0 = 0;
        while (k0 < Ps.length && Ps[k0].d < last.d) k0++;
        const ps = [];
        for (let k = k0; k < Ps.length && Ps[k].n - last.n <= maxDays; k++) if (!Ps[k].used && g.every((c) => lettPays(c, Ps[k], m1))) ps.push(Ps[k]);
        for (let k = 0; k < ps.length && !hit; k++) {
          let t = 0;
          for (let l = k; l < ps.length && l - k < 2; l++) { t += ps[l].a; if (t === total && l > k) { hit = ps.slice(k, l + 1); break; } if (t > total) break; }
        }
        if (hit) { grp = g; break; }
      }
      if (hit) { const n = grp.filter((x) => x.side === inv).length; take(grp, hit, `${pl(n, 'facture')}${grp.length > n ? ' + 1 avoir' : ''} ↔ ${hit.length} règlements`); break; }
    }
  }
  const first = (g) => g.lines.reduce((m, z) => (z.d < m ? z.d : m), g.lines[0].d);
  found.sort((x, y) => (first(x) < first(y) ? -1 : first(x) > first(y) ? 1 : 0));
  a.groups = found.map((g, n) => Object.assign(g, { l: lettLetter(n) }));
  a.rest = L.filter((x) => !x.used);
  a.bal = L.reduce((s, x) => s + (x.side === 'D' ? x.a : -x.a), 0);
  a.skipped = a.lines.filter((x) => x.type === 'autre').length;
  a.map = new Map();
  a.groups.forEach((g) => g.lines.forEach((x) => a.map.set(x, g)));
  return a;
}

// Mots qui désignent un tiers (4 lettres au moins), hors mots courants des noms et des libellés
const LETT_STOP = new Set(('SEPA PRLV FRANCE PHARMA PHARMACIE LABORATOIRES LABORATOIRE CARTE HEALTHCARE HEALTH CARE COMPAGNIE CENTRE SANTE '
  + 'NUTRITION CONSUMER GRAND PUBLIC DERMO COSMETIQUE COSMETIQUES MEDICAMENT FACTURE FACTURES LOYER SALAIRE REMBOURSEMENT COOPERATION '
  + 'INSTITUT DELA CLIENTELE RELEVE RETRO FOURNISSEUR FOURNISSEURS CLIENT CLIENTS VIREMENT CHEQUE REGLEMENT PAIEMENT AVOIR ACOMPTE '
  + 'SOLDE DIVERS SOCIETE GROUPE ECHEANCE REMISE PRELEVEMENT TRAITE').split(' '));
const lettToks = (s) => new Set((String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().match(/[A-Z]{4,}/g) || []).filter((t) => !LETT_STOP.has(t)));

// Hypothèses : règlement resté ouvert sur un compte, facture(s) de même montant sur un autre compte du même tiers (un
// mot du nom en commun) ; rien n'est lettré.
function lettHyp(accs, maxDays) {
  const out = [];
  const tok = new Map(accs.map((b) => [b, lettToks(b.name + ' ' + b.lines.filter((x) => x.type === 'achat').slice(0, 3).map((x) => x.label).join(' '))]));
  for (const a of accs) {
    for (const p of a.rest.filter((x) => x.side !== a.inv && x.type === 'reglement' && !x.hyp)) {
      const tp = new Set([...lettToks(a.name), ...lettToks(p.label)]);
      if (!tp.size) continue;
      for (const b of accs) {
        if (b === a || b.inv !== a.inv) continue;
        const tb = tok.get(b);
        if (![...tp].some((t) => tb.has(t))) continue;
        const hit = lettWinAv(b.rest.filter((c) => c.side === b.inv && !c.hyp && lettPays(c, p, b.m1)).sort(lettKey),
          b.rest.filter((c) => c.side !== b.inv && c.type === 'achat' && !c.hyp && lettPays(c, p, b.m1)), p.a, maxDays);
        if (hit) { p.hyp = 1; hit.forEach((x) => { x.hyp = 1; }); out.push({ a, b, p, inv: hit, key: `${p.d}|${p.a}|${a.code}|${b.code}` }); break; }
      }
    }
  }
  return out;
}

// Visa d'une hypothèse : le règlement est transféré sur le compte proposé et lettré avec les factures
function lettApplyVisa(hyp, vis) {
  const bal = (z) => z.lines.filter((x) => x.type !== 'autre').reduce((s, x) => s + (x.side === 'D' ? x.a : -x.a), 0);
  hyp.forEach((y) => {
    y.ok = vis.has(y.key);
    if (!y.ok) return;
    const { a, b, p, inv } = y;
    a.lines = a.lines.filter((x) => x !== p);
    a.rest = a.rest.filter((x) => x !== p);
    b.lines.push(p);
    p.moved = a.code;
    p.hyp = 0;
    inv.forEach((x) => { x.hyp = 0; });
    b.rest = b.rest.filter((x) => !inv.includes(x));
    const g = { m: `visa : règlement transféré de ${a.code}`, lines: [...inv, p], visa: 1, l: lettLetter(b.groups.length) };
    b.groups.push(g);
    g.lines.forEach((x) => b.map.set(x, g));
    a.bal = bal(a);
    b.bal = bal(b);
  });
}

// Doublons : niveau 1 = même n° de facture et même montant ; niveau 2 = même compte, même date et même montant, n°
// différent. Le n° est le dernier mot du libellé qui contient un chiffre (4 caractères au moins, hors dates et pièces).
function lettDups(accs) {
  const L = [], out = [];
  accs.forEach((a) => a.lines.filter((x) => x.type === 'achat' && !x.an).forEach((x) => {
    const t = x.label.split(/\s+/).filter((w) => /\d/.test(w) && w.length >= 4 && !/^B\d{9}$/.test(w) && !/^\d\d\/\d\d\/\d{4}$/.test(w));
    x.num = (t.pop() || '').toUpperCase();
    x.dup = 0;
    L.push([a, x]);
  }));
  const grp = (key, filt) => {
    const m = new Map();
    L.filter(filt).forEach(([a, x]) => { const k = key(a, x); (m.get(k) || m.set(k, []).get(k)).push([a, x]); });
    return [...m.values()].filter((g) => g.length > 1);
  };
  grp((a, x) => `${x.num}|${x.a}|${x.side}`, ([, x]) => x.num).forEach((g) => { g.forEach(([, x]) => { x.dup = 1; }); out.push({ l: 1, g }); });
  grp((a, x) => `${a.code}|${x.d}|${x.a}|${x.side}`, ([, x]) => !x.dup).forEach((g) => { g.forEach(([, x]) => { x.dup = 1; }); out.push({ l: 2, g }); });
  return out;
}

// Compte d'attente (LCR…) : pour chaque montant payé, factures ouvertes de même total chez un fournisseur ; une
// proposition unique réserve ses factures pour les montants suivants. Rien n'est lettré.
function lettLcr(lc, accs, maxDays, isNC) {
  const out = [], used = new Set();
  for (const a of lc) {
    for (const p of a.lines.filter((x) => x.side === 'D' && !x.an).sort(lettKey)) {
      const c = [];
      for (const b of accs) {
        if (b.inv !== 'C') continue;
        const open = b.rest.filter((x) => x.side === 'C' && x.type === 'achat' && !x.hyp && !used.has(x) && lettPays(x, p, b.m1)).sort(lettKey);
        let hit = lettWinAv(open, b.rest.filter((x) => x.side === 'D' && x.type === 'achat' && !x.an && !x.hyp && !used.has(x) && lettPays(x, p, b.m1)), p.a, maxDays);
        if (!hit && isNC(b)) hit = lettSubset(open, p.a);
        if (hit) c.push({ b, hit });
      }
      if (c.length === 1) c[0].hit.forEach((x) => used.add(x));
      out.push({ a, p, c });
    }
  }
  return out;
}

// Règlements fournisseurs sans facture (ni hypothèse ni à-nouveau), hors comptes exclus : lignes du mail
function lettMissing(accs, ex) {
  const EX = lettList(ex);
  const miss = [];
  accs.filter((a) => a.inv === 'C' && !EX.includes(String(a.code).toUpperCase())).forEach((a) => a.rest
    .filter((x) => x.side === 'D' && x.type === 'reglement' && !x.hyp && !x.an).forEach((x) => miss.push({ code: a.code, n: a.name || a.code, d: x.date, k: x.d, a: x.a })));
  return miss.sort((x, y) => (x.n < y.n ? -1 : x.n > y.n ? 1 : x.k < y.k ? -1 : x.k > y.k ? 1 : 0));
}
const lettMailText = (miss) => 'Bonjour,\n\nPour finaliser le lettrage de notre compte fournisseurs, merci de nous transmettre les factures manquantes ci-dessous (fournisseur - date du règlement - facture manquante) :\n\n'
  + miss.map((m) => `${m.n} - ${m.d} - facture manquante (règlement de ${lettFmt(m.a)} €)`).join('\n') + '\n\nMerci d\'avance.\n\nCordialement';

// Mails de bilan ou de situation (un par fournisseur dont le lettrage pose problème : règlement sans facture, avoir
// ouvert, doublon, hypothèse non visée) et de révision mensuelle (factures manquantes)
function lettMx(st) {
  if (!st.mx) {
    const t = new Date();
    st.mx = { type: '', rev: false, db: `${t.getFullYear()}-12-31`, dd: `${t.getFullYear()}-01-01`, ddT: false, sc: null, dr: ymd(new Date(t.getFullYear(), t.getMonth(), 0)) };
  }
  if (st.mx.sc === null) { const c = st.fec && clientBySiren(st.fec.siren); st.mx.sc = c ? c.nom : ''; }
  return st.mx;
}
function lettMxMails(st) {
  const mx = lettMx(st), EX = lettList(lettSettings().ex), out = { bil: [], rev: null };
  const fd = (s) => (s ? fmtDate(s) : '…');
  if (mx.type) {
    const kind = mx.type === 'bilan' ? 'Bilan' : 'Situation';
    out.bil = st.accs.filter((a) => a.inv === 'C' && !st.closed.has(a.code) && !EX.includes(String(a.code).toUpperCase()))
      .filter((a) => st.miss.some((m) => m.code === a.code) || a.rest.some((x) => x.side === 'D' && x.type === 'achat' && !x.an)
        || st.dup.some((d) => d.g.some(([b]) => b === a)) || st.hyp.some((y) => !y.ok && (y.a === a || y.b === a)))
      .map((a) => {
        const n = a.name || a.code;
        return { id: a.code, n, sub: `${kind} au ${fd(mx.db)} - demande d'extrait de compte - ${n}`,
          body: `Bonjour,\n\nNous sommes en pleine élaboration d'${mx.type === 'bilan' ? 'un bilan' : 'une situation'} à la date du ${fd(mx.db)} pour le compte de la société ${mx.sc || 'XXX'} dont le numéro client est le XXX.\n\nSerait-il possible de nous fournir un extrait de compte allant du ${fd(mx.dd)} au ${fd(mx.db)} ?\n\nVous remerciant pour votre collaboration,\n\nCordialement` };
      });
  }
  if (mx.rev) {
    out.rev = { id: '#rev', n: 'Révision mensuelle', sub: `Révision mensuelle au ${fd(mx.dr)} - pièces manquantes`,
      body: `Bonjour,\n\nDans le cadre de la révision mensuelle arrêtée au ${fd(mx.dr)}, ${st.miss.length ? `merci de nous transmettre les factures manquantes ci-dessous (fournisseur - date du règlement - facture manquante) :\n\n${st.miss.map((m) => `${m.n} - ${m.d} - facture manquante (règlement de ${lettFmt(m.a)} €)`).join('\n')}\n` : "nous n'avons relevé aucune pièce manquante.\n"}\nMerci d'avance.\n\nCordialement` };
  }
  return out;
}
// Texte affiché d'un mail : celui modifié à la main tant que le mail généré n'a pas changé
const lettMxText = (st, m) => (st.mxEdit[m.id] && st.mxEdit[m.id].gen === m.body ? st.mxEdit[m.id].txt : m.body);
function lettMxPanel(st) {
  const mx = lettMx(st), X = lettMxMails(st);
  const box = (f, on, label) => `<label class="check inline"><input type="checkbox" data-lett="mx" data-f="${f}"${on ? ' checked' : ''}> ${label}</label>`;
  const date = (f, label) => `<label>${label} <input type="date" data-lett="mx" data-f="${f}" value="${esc(mx[f])}"></label>`;
  const mail = (m) => `<div class="lett-mxm"><h3>${esc(m.n)}</h3><p class="small">Objet : ${esc(m.sub)}</p>
      <textarea data-lett="mxtxt" data-i="${esc(m.id)}" rows="${m.id === '#rev' ? 9 + st.miss.length : 10}">${esc(lettMxText(st, m))}</textarea>
      <button class="btn small" data-action="lett-mx-copy" data-i="${esc(m.id)}">Copier ce mail</button></div>`;
  return `<section class="card lett-panel lett-mx"><h2>Mails de situation et de révision</h2>
    <p class="muted small">${st.miss.length} règlement(s) sans facture. Cochez une option pour générer les mails.</p>
    <div class="lett-opts">${box('bilan', mx.type === 'bilan', 'Bilan')}${box('situation', mx.type === 'situation', 'Situation')}${date('db', 'Date de clôture')}
      ${box('rev', mx.rev, 'Révision mensuelle')}${date('dr', 'Révision arrêtée au')}</div>
    ${mx.type ? `<div class="lett-opts"><label>Société (nom du client) <input data-lett="mx" data-f="sc" value="${esc(mx.sc)}" placeholder="XXX"></label>${date('dd', 'Début d\'exercice')}</div>
    <div class="lett-mxg"><h3>${mx.type === 'bilan' ? 'Bilan' : 'Situation'} au ${esc(fmtDate(mx.db))} : ${X.bil.length} mail(s) aux fournisseurs dont le lettrage pose problème</h3>
      ${X.bil.length ? `<button class="btn" data-action="lett-mx-all">Copier tous les mails</button>${X.bil.map(mail).join('')}` : '<p class="muted small">Aucun fournisseur concerné.</p>'}</div>` : ''}
    ${X.rev ? `<div class="lett-mxg">${mail(X.rev)}</div>` : ''}</section>`;
}
function lettMxCopy(id) {
  const st = lettState(), X = lettMxMails(st);
  const area = (i) => [...document.querySelectorAll('textarea[data-lett=mxtxt]')].find((t) => t.dataset.i === i);
  if (id) { const el = area(id); return el && lettClip(el.value, 'Mail copié : collez-le dans votre messagerie.'); }
  return lettClip(X.bil.map((m) => `Objet : ${m.sub}\n\n${(area(m.id) || {}).value || lettMxText(st, m)}`).join('\n\n--------\n\n'), `${X.bil.length} mail(s) copié(s) : collez-les dans votre messagerie.`);
}
function lettGo(code) {
  const el = [...document.querySelectorAll('details.lett-acc')].find((d) => d.dataset.code === code);
  if (!el) return toast('Compte masqué : effacez la recherche ou rouvrez-le.', true);
  el.open = true;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.add('lett-flash');
  setTimeout(() => el.classList.remove('lett-flash'), 2500);
}

// Calcul d'après la source chargée (grand livre ou FEC) et les réglages
function lettCompute() {
  const st = lettState();
  const set = lettSettings();
  const JA = lettList(set.ja), JR = lettList(set.jr);
  const all = st.src === 'fec' && st.fec ? lettFromFec(st.fec, JA, JR, st.tiers) : st.src === 'gl' ? lettParseGl(st.text, JA, JR) : [];
  const IGN = lettList(set.ign);
  const names = (v) => String(v).split(',').map((x) => x.replace(/\s/g, '').toUpperCase()).filter(Boolean);
  const NCL = names(set.nc), M1L = names(set.m1);
  const isNC = (a) => NCL.some((t) => (a.code + a.name).replace(/\s/g, '').toUpperCase().includes(t));
  const isM1 = (a) => M1L.some((t) => (a.code + a.name).replace(/\s/g, '').toUpperCase().includes(t));
  const LT = String(set.lc).trim().toUpperCase();
  const isLC = (a) => !!LT && `${a.code} ${a.name}`.toUpperCase().includes(LT);
  const kept = all.filter((a) => !IGN.some((t) => `${a.code} ${a.name}`.toUpperCase().includes(t)));
  const md = Math.max(0, parseInt(set.md, 10) || 45);
  st.ignored = all.length - kept.length;
  st.lcAccs = kept.filter(isLC);
  st.accs = kept.filter((a) => !isLC(a)).map((a) => { a.m1 = isM1(a); return lettRun(a, md, isNC(a)); });
  st.hyp = lettHyp(st.accs, md);
  lettApplyVisa(st.hyp, st.vis);
  st.dup = lettDups(st.accs);
  st.lcr = lettLcr(st.lcAccs, st.accs, md, isNC);
  st.miss = lettMissing(st.accs.filter((a) => !st.closed.has(a.code)), set.ex);
  const nl = st.accs.reduce((t, a) => t + a.lines.length, 0);
  const extra = `${st.ignored ? ` (${st.ignored} compte(s) ignoré(s) : ${IGN.join(', ')})` : ''}${st.lcAccs.length ? `, compte d'attente ${st.lcAccs.map((a) => a.code).join(', ')}` : ''}`;
  if (st.src === 'gl') st.msg = st.accs.length ? `${st.accs.length} compte(s) lu(s)${extra}, ${nl} écriture(s).` : 'Aucun compte reconnu : le texte doit contenir les lignes « Compte … » et les écritures datées.';
  else if (st.src === 'fec') st.msg = `${st.accs.length} compte(s) ${st.tiers === 'cli' ? 'clients' : 'fournisseurs'} avec des écritures non lettrées${extra}, ${nl} écriture(s)${st.fec.open.truncated ? ' (FEC très volumineux : liste tronquée)' : ''}.`;
}
const lettRefresh = () => { if (/^#\/(lettrage|fec)/.test(location.hash)) refresh(); };

async function lettFile(file) {
  if (!file) return;
  const st = lettState();
  const run = ++st.runId;
  Object.assign(st, { fileName: file.name, status: 'running', msg: 'Lecture du fichier…', accs: [] });
  lettRefresh();
  try {
    if (/\.pdf$/i.test(file.name)) {
      const doc = await PdfReader.read(await file.arrayBuffer());
      const text = doc.pages.map((p) => PdfReader.lines(p).map((l) => l.text).join('\n')).join('\n');
      if (run !== st.runId) return;
      Object.assign(st, { src: 'gl', text, fec: null, status: 'done' });
      if (!text.trim()) { st.msg = 'Ce PDF ne contient pas de texte (document scanné) : collez le texte du grand livre dans la zone prévue.'; return lettRefresh(); }
    } else if (/\.zip$/i.test(file.name) || /journalcode/i.test(await file.slice(0, 400).text().catch(() => ''))) {
      st.msg = 'Analyse du FEC…';
      lettRefresh();
      const r = await lettFecResult(file);
      if (run !== st.runId) return;
      Object.assign(st, { src: 'fec', fec: { open: r.lettOpen, name: file.name, siren: r.meta.siren, start: r.meta.start }, text: '', status: 'done' });
    } else {
      const text = await file.text();
      if (run !== st.runId) return;
      Object.assign(st, { src: 'gl', text, fec: null, status: 'done' });
    }
    lettCompute();
  } catch (e) {
    if (run !== st.runId) return;
    Object.assign(st, { status: 'error', msg: `Lecture impossible (${e.message || e}). Copiez le texte du grand livre et collez-le dans la zone prévue.` });
  }
  lettRefresh();
}
function lettFecResult(file) {
  return fecSource(file).then(({ buffer, name }) => new Promise((resolve, reject) => {
    const w = new Worker('js/fec-worker.js?v=' + ASSET_VERSION);
    w.onmessage = (e) => {
      if (e.data.type === 'progress') return;
      w.terminate();
      if (e.data.type === 'done') resolve(e.data.result); else reject(new Error(e.data.message));
    };
    w.onerror = (err) => { w.terminate(); reject(new Error(err.message || "Erreur pendant l'analyse du FEC.")); };
    w.postMessage({ buffer, fileName: name }, [buffer]);
  }));
}
function lettBindFec(st) {
  const r = ui.fec && ui.fec.result;
  if (!r || !r.lettOpen) return false;
  st.runId++;
  Object.assign(st, { src: 'fec', fec: { open: r.lettOpen, name: r.meta.fileName, siren: r.meta.siren, start: r.meta.start }, text: '', fileName: r.meta.fileName, status: 'done' });
  lettCompute();
  return true;
}
function lettUseOpenFec() {
  if (lettBindFec(lettState())) lettRefresh();
}
function lettText(text) {
  const st = lettState();
  st.runId++;
  Object.assign(st, { src: 'gl', text: String(text || ''), fec: null, fileName: 'texte collé', status: 'done' });
  lettCompute();
  lettRefresh();
}

function lettTotals(accs) {
  let nl = 0, ng = 0, mt = 0, nr = 0;
  accs.forEach((a) => { a.groups.forEach((g) => { ng++; nl += g.lines.length; mt += g.lines.filter((x) => x.side === 'D').reduce((s, x) => s + x.a, 0); }); nr += a.rest.length; });
  return { nl, ng, mt, nr };
}
const lettInvTxt = (lines) => lines.map((x) => `${x.date} ${lettFmt(x.a)} €`).join(' + ');
const lettRelevés = (accs) => {
  const RL = [];
  accs.forEach((a) => a.groups.filter((g) => g.rel).forEach((g) => RL.push([a, g])));
  return RL;
};

// Encadrés : hypothèses, compte d'attente, relevés, doublons, mail des factures manquantes
function lettPanels(st) {
  const li = (s) => `<li>${s}</li>`;
  let h = '';
  if (st.hyp.length) {
    const nOk = st.hyp.filter((y) => y.ok).length;
    h += `<section class="card lett-panel lett-hyp"><h2>${st.hyp.length - nOk} hypothèse(s) à valider${nOk ? ` · ${nOk} validée(s)` : ''}</h2>
      <p class="muted small">Règlement resté ouvert sur un compte, facture de même montant trouvée sur un autre compte du même tiers : probable erreur d'affectation. Cochez le visa pour transférer le règlement sur le compte proposé et le lettrer avec les factures.</p>
      <ul class="lett-list">${st.hyp.map((y) => li(`<label class="check inline lett-visa"><input type="checkbox" data-lett="visa" data-k="${esc(y.key)}"${y.ok ? ' checked' : ''}> Visa</label> ${esc(y.p.date)} · <strong>${lettFmt(y.p.a)} €</strong> réglé sur <strong>${esc(y.a.code)}</strong> ↔ ${esc(lettInvTxt(y.inv))} sur <strong>${esc(y.b.code)}</strong> <span class="muted">${esc(y.b.name)}</span>${y.ok ? ` <button class="badge ok lett-go" data-action="lett-go" data-code="${esc(y.b.code)}">transféré vers ${esc(y.b.code)} et lettré →</button>` : ''}`)).join('')}</ul></section>`;
  }
  if (st.lcr.length) {
    h += `<section class="card lett-panel lett-lcr"><h2>Compte d'attente ${esc(st.lcAccs.map((a) => a.code).join(', '))} : ${st.lcr.length} montant(s) à affecter</h2>
      <p class="muted small">Pour chaque montant, l'outil cherche des factures ouvertes de même total chez un fournisseur. Ce sont des propositions à valider : rien n'est lettré automatiquement.</p>
      <ul class="lett-list">${st.lcr.map(({ p, c }) => li(`${esc(p.date)} · <strong>${lettFmt(p.a)} €</strong> → ${c.length ? c.map(({ b, hit }) => `<strong>${esc(b.code)}</strong> ${esc(b.name)} (${esc(lettInvTxt(hit))})`).join(' <em>ou</em> ') : '<span class="badge warn">aucun fournisseur trouvé</span>'}${c.length > 1 ? ' <span class="badge warn">plusieurs possibilités</span>' : c.length === 1 ? ' <span class="badge ok">unique</span>' : ''}`)).join('')}</ul></section>`;
  }
  const RL = lettRelevés(st.accs);
  if (RL.length) {
    h += `<section class="card lett-panel lett-relc"><h2>${RL.length} relevé(s) probable(s) saisi(s) en plus des factures</h2>
      <p class="small">Le relevé et les factures ont chacun le même total que le règlement. L'ensemble est lettré avec le règlement, mais ce lettrage n'est pas équilibré : le relevé est à annuler ou à supprimer avant de lettrer dans le logiciel.</p>
      <ul class="lett-list">${RL.map(([a, g]) => { const r = g.rel, p = g.lines.find((x) => x.side !== a.inv); return li(`<strong>${esc(a.code)}</strong> · lettre <strong>${esc(g.l)}</strong> · relevé ${esc(r.date)} (${lettFmt(r.a)} €) ⇄ ${esc(lettInvTxt(g.lines.filter((x) => x.side === a.inv && x !== r)))} · règlement ${esc(p ? p.date : '')}`); }).join('')}</ul></section>`;
  }
  if (st.dup.length) {
    h += `<section class="card lett-panel lett-dup"><h2>${st.dup.length} doublon(s) probable(s)</h2>
      <p class="muted small">Niveau 1 : même numéro de facture et même montant. Niveau 2 : même compte, même date et même montant avec un numéro différent (à vérifier).</p>
      <ul class="lett-list">${st.dup.map((d) => li(`<span class="badge warn">niveau ${d.l}</span> <strong>${esc([...new Set(d.g.map(([a]) => a.code))].join(' / '))}</strong> · ${d.g.map(([, x]) => `${d.l === 1 ? `n° ${esc(x.num)} · ` : ''}${esc(x.date)} · ${lettFmt(x.a)} €`).join(' ⇄ ')}`)).join('')}</ul></section>`;
  }
  if (st.accs.some((a) => a.inv === 'C')) {
    const gen = lettMailText(st.miss);
    st.mailGen = gen;
    const txt = st.mail && st.mail.gen === gen ? st.mail.txt : gen;
    h += st.miss.length ? `<section class="card lett-panel lett-mail"><h2>${st.miss.length} règlement(s) sans facture : mail à préparer</h2>
      <label for="lett-mail" class="small muted">Modifiable avant envoi</label>
      <textarea id="lett-mail" data-lett="mail" rows="9">${esc(txt)}</textarea>
      <button class="btn" data-action="lett-mail">Copier le mail</button></section>`
      : '<section class="card lett-panel lett-mail"><p>Tous les règlements ont une facture : aucun mail à envoyer.</p></section>';
    h += lettMxPanel(st);
  }
  return h;
}

// embedded : onglet « Lettrage » de l'Espace FEC, le FEC ouvert est repris d'office (un grand livre reste possible)
function viewLettrage(embedded) {
  const st = lettState();
  if (embedded && !st.src) lettBindFec(st);
  const set = lettSettings();
  const accs = st.accs;
  const T = lettTotals(accs);
  const q = norm(st.q || '');
  const closed = accs.filter((a) => st.closed.has(a.code));
  const shown = accs.filter((a) => a.lines.length && !st.closed.has(a.code) && (!st.hide || a.groups.length) && (!q || norm(`${a.code} ${a.name}`).includes(q)));
  const openFec = ui.fec && ui.fec.result && ui.fec.result.lettOpen ? ui.fec.result.meta.fileName : '';
  const kindOf = (x, g) => (g ? `<span class="lett-l${g.rel ? ' rel' : ''}" title="${esc(g.m)}">${esc(g.l)}</span>${/à vérifier|non consécutives/.test(g.m) ? ' <span class="muted small">à vérifier</span>' : ''}`
    : x.type === 'autre' ? '<span class="muted" title="Journal ni d\'achat ni de règlement : non lettré">—</span>' : `<span class="lett-open">${x.hyp ? 'hypothèse' : 'ouvert'}</span>`);
  const rowCls = (x, g) => (x.type === 'autre' ? 'muted' : g ? (g.rel ? (g.rel === x ? 'lett-rel lett-rel-r' : 'lett-rel') : '') : 'lett-o');
  const field = (k, label, extra = '') => `<label>${label} <input data-lett="${k}" value="${esc(set[k])}"${extra}></label>`;
  const actions = `${accs.some((a) => a.groups.length) ? '<button class="btn" data-action="lett-copy">Copier les lettrages (tableur)</button><button class="btn" data-action="lett-xlsx">Exporter en Excel</button>' : ''}${st.src ? '<button class="btn" data-action="lett-clear">Effacer</button>' : ''}`;
  const resume = `journaux ${set.ja || '—'} · règlements ${set.jr || '—'} · écart max ${set.md || '—'} j${set.lc ? ` · attente ${set.lc}` : ''}${set.m1 ? ' · échéances M+1' : ''}${set.nc ? ' · non consécutives' : ''}`;
  return `${toolHead(embedded ? '' : 'Lettrage des comptes de tiers', embedded ? 'Le FEC ouvert est repris : compte par compte, les factures soldées par chaque règlement et le mail des factures manquantes. Un grand livre PDF peut aussi être déposé.' : 'Compte par compte, les factures soldées par chaque règlement, et le mail des factures manquantes : à partir du grand livre non lettré (PDF ou texte) ou d\'un FEC.', actions,
    '<p>L\'outil propose les écritures à lettrer en réglant d\'abord les factures les plus anciennes. Un règlement n\'est jamais rapproché d\'une facture postérieure, et les factures d\'un même règlement sont peu espacées. Il signale aussi les relevés saisis en plus des factures, les règlements dont la facture est sur un autre compte, les doublons et les montants du compte d\'attente à affecter, et prépare le mail des factures manquantes. Rien n\'est envoyé ni conservé.</p>', 'lett')}
    <div class="fec-drop card" data-action="lett-pick" role="button" tabindex="0">
      ${icon('file', 'fec-drop-ico')}
      <p><strong>${st.fileName ? esc(st.fileName) : 'Sélectionnez ou déposez ici le grand livre (PDF, texte) ou un FEC'}</strong></p>
      <p class="muted small">${st.status === 'running' ? esc(st.msg) : 'Grand livre de l\'édition « Grands-livres » (ACD…) non lettré, ou FEC (.txt, .csv, .zip) : seules ses écritures non lettrées sont reprises.'}</p>
    </div>
    ${openFec && !(st.src === 'fec' && st.fec && st.fec.name === openFec) || st.src === 'fec' ? `<div class="tool-bar">
      ${st.src === 'fec' ? `<label>Comptes <select data-lett="tiers">${options({ frs: 'Fournisseurs (401, 404)', cli: 'Clients (411)' }, st.tiers)}</select></label>` : ''}
      ${openFec && !(st.src === 'fec' && st.fec && st.fec.name === openFec) ? `<button class="btn" data-action="lett-fec">Utiliser le FEC ouvert (${esc(openFec)})</button>` : ''}</div>` : ''}
    ${st.msg && st.status !== 'running' ? `<p class="${st.status === 'error' || !accs.length ? 'late' : 'muted'} small" role="status">${esc(st.msg)}</p>` : ''}
    <details class="card tool-set" data-keep="lett-set"${openIf('lett-set', false)}><summary><strong>Réglages</strong><span class="muted small">${esc(resume)}</span></summary>
      <div class="lett-opts">
        ${field('ja', 'Journaux d\'achat (ou de vente)')}
        ${field('jr', 'Journaux de règlement')}
        ${field('md', 'Écart max entre factures d\'un même règlement (jours)', ' inputmode="numeric"')}
        ${field('nc', 'Fournisseurs à factures non consécutives', ' placeholder="noms ou codes, séparés par des virgules"')}
        ${field('m1', 'Fournisseurs à échéance M+1', ' placeholder="noms ou codes, séparés par des virgules"')}
        ${field('lc', 'Compte d\'attente à affecter (code ou nom)')}
        ${field('ex', 'Comptes exclus du mail (codes)')}
        ${field('ign', 'Comptes ignorés (code ou nom contenant)')}
      </div>
      <p class="muted small">${st.src === 'fec' ? 'FEC : une écriture de banque ou de caisse est un règlement, une écriture de charges, de produits ou d\'immobilisation une facture ; les journaux indiqués priment.' : 'Grand livre : seules les écritures des journaux indiqués sont lettrées ; les autres restent affichées (« — »).'} Les réglages sont retenus pour la prochaine fois.</p>
    </details>
    <details class="lett-paste" data-keep="lett-paste"${openIf('lett-paste', false)}><summary>Ou coller le texte du grand livre</summary>
      <textarea id="lett-tx" rows="5" placeholder="Compte FDEMO FOURNISSEUR DEMO&#10;10/08/2026 B000000001 AC FOURNISSEUR DEMO F-101 1 250,00 -1 250,00">${st.src === 'gl' && st.fileName === 'texte collé' ? esc(st.text) : ''}</textarea>
      <button class="btn" data-action="lett-text">Analyser le texte</button></details>
    ${accs.length ? `<div class="kpis fec-kpis">
      ${kpiTile('Lettrages proposés', T.ng)}${kpiTile('Écritures à lettrer', T.nl)}${kpiTile('Montant lettrable', `${lettFmt(T.mt)} €`)}${kpiTile('Écritures restant ouvertes', T.nr, T.nr ? 'kpi-wait' : '')}
    </div>
    ${lettPanels(st)}
    <div class="lett-opts">
      <label class="check inline"><input type="checkbox" data-lett="hide"${st.hide ? ' checked' : ''}> Masquer les comptes sans lettrage possible</label>
      <label>Rechercher <input type="search" data-lett="q" value="${esc(st.q || '')}" placeholder="compte ou nom"></label>
    </div>
    ${shown.map((a) => {
      const ok = !a.rest.length && a.groups.length;
      const rows = a.lines.slice().sort(lettKey);
      return `<details class="card lett-acc" data-code="${esc(a.code)}"${ok ? '' : ' open'}><summary><strong>${esc(a.code)}</strong> <span class="muted">${esc(a.name)}${a.m1 ? ' · échéance M+1' : ''} · ${a.groups.length} lettrage(s) · ${a.rest.length} ouverte(s)</span> <span class="badge ${ok ? 'ok' : 'wait'}">${ok ? 'Soldé' : `Solde ouvert ${lettFmt(Math.abs(a.bal))} €`}</span></summary>
        <p class="lett-close"><button class="btn small" data-action="lett-close" data-code="${esc(a.code)}" title="Compte lettré dans le logiciel : il quitte la liste et le mail">Fermer ce compte (lettré)</button></p>
        <div class="grid-wrap"><table class="dtable lett-t"><thead><tr><th>Lettre</th><th>Date</th><th>Jnl</th><th>Libellé</th><th class="n">Débit</th><th class="n">Crédit</th></tr></thead><tbody>
        ${rows.map((x) => { const g = a.map.get(x); return `<tr class="${rowCls(x, g)}"><td>${kindOf(x, g)}</td><td>${esc(x.date)}</td><td>${esc(x.j)}</td><td class="lbl">${esc(x.label)}${x.moved ? ` <span class="badge ok">transféré de ${esc(x.moved)}</span>` : ''}${g && g.rel === x ? ' <span class="badge lett-relb">RELEVÉ</span>' : ''}${x.dup ? ' <span class="badge warn">doublon ?</span>' : ''}</td><td class="n">${x.side === 'D' ? lettFmt(x.a) : ''}</td><td class="n">${x.side === 'C' ? lettFmt(x.a) : ''}</td></tr>`; }).join('')}
        </tbody></table></div>${a.groups.length ? `<p class="muted small lett-leg">${a.groups.map((g) => `<span class="lett-l${g.rel ? ' rel' : ''}">${esc(g.l)}</span> ${esc(g.m)}`).join(' · ')}</p>` : ''}${a.skipped ? `<p class="muted small">${a.skipped} écriture(s) hors journaux d'achat et de règlement, non lettrée(s).</p>` : ''}</details>`;
    }).join('')}
    ${!accs.some((a) => a.groups.length) ? '<section class="card"><p class="muted">Aucun lettrage possible avec les journaux indiqués.</p></section>' : !shown.length ? '<p class="muted">Aucun compte ne correspond à la recherche.</p>' : ''}
    ${closed.length ? `<section class="card lett-closed"><h2>${closed.length} compte(s) fermé(s)</h2>
      <p class="muted small">Lettrés de votre côté : ils ne figurent plus dans la liste ni dans le mail.</p>
      <ul class="lett-list">${closed.map((a) => `<li><strong>${esc(a.code)}</strong> <span class="muted">${esc(a.name)}</span> <button class="btn small" data-action="lett-reopen" data-code="${esc(a.code)}">Rouvrir</button></li>`).join('')}</ul></section>` : ''}` : ''}`;
}

function onLettChange(t) {
  const st = lettState();
  const k = t.dataset.lett;
  if (k === 'mail') { st.mail = { gen: st.mailGen, txt: t.value }; return; }
  if (k === 'mxtxt') {
    const X = lettMxMails(st);
    const m = X.bil.concat(X.rev || []).find((x) => x.id === t.dataset.i);
    if (m) st.mxEdit[m.id] = { gen: m.body, txt: t.value };
    return;
  }
  if (k === 'visa') { if (t.checked) st.vis.add(t.dataset.k); else st.vis.delete(t.dataset.k); lettCompute(); return refresh(); }
  if (k === 'mx') {
    const mx = lettMx(st), f = t.dataset.f;
    if (f === 'bilan' || f === 'situation') mx.type = t.checked ? f : '';
    else if (f === 'rev') mx.rev = t.checked;
    else {
      mx[f] = t.value;
      if (f === 'dd') mx.ddT = true;
      if (f === 'db' && !mx.ddT && t.value) mx.dd = `${t.value.slice(0, 4)}-01-01`;
    }
    return refresh();
  }
  if (k in LETT_DEF) {
    data.settings.lettrage = Object.assign(lettSettings(), { [k]: t.value.trim() });
    persist();
    lettCompute();
  } else if (k === 'tiers') { st.tiers = t.value; lettCompute(); }
  else if (k === 'hide') st.hide = t.checked;
  else if (k === 'q') st.q = t.value;
  refresh();
}

// Fermer (lettré de son côté) ou rouvrir un compte
function lettClose(code, on) {
  const st = lettState();
  if (on) st.closed.add(code); else st.closed.delete(code);
  st.miss = lettMissing(st.accs.filter((a) => !st.closed.has(a.code)), lettSettings().ex);
  refresh();
}

function lettRows() {
  const out = [];
  lettState().accs.forEach((a) => a.groups.forEach((g) => g.lines.forEach((x) => out.push({ a, g, x }))));
  return out;
}
async function lettClip(text, done) {
  try { await navigator.clipboard.writeText(text); toast(done); } catch (e) { toast('Copie impossible sur ce navigateur.', true); }
}
function lettCopy() {
  const t = ['Compte\tLettre\tDate\tJournal\tLibellé\tDébit\tCrédit'];
  lettRows().forEach(({ a, g, x }) => t.push([a.code, g.l, x.date, x.j, x.label, x.side === 'D' ? lettFmt(x.a) : '', x.side === 'C' ? lettFmt(x.a) : ''].join('\t')));
  return lettClip(t.join('\n'), 'Lettrages copiés : collez-les dans Excel.');
}
function lettCopyMail() {
  const el = document.getElementById('lett-mail');
  if (el) return lettClip(el.value, 'Mail copié : collez-le dans votre messagerie.');
}
async function lettExport() {
  const ok = await ask({ title: 'Fichier non chiffré', message: 'Le classeur contient les écritures et les noms des tiers <strong>non chiffrés</strong>. Supprimez-le après usage.', okLabel: 'Exporter' });
  if (!ok) return;
  const st = lettState();
  const t = (v, s) => ({ v: v === undefined || v === null ? '' : v, s: s === undefined ? 2 : s });
  const n = (c) => ({ v: c / 100, s: 8 });
  const H = (cells) => cells.map((x) => t(x, 1));
  const amounts = (x) => [x.side === 'D' ? n(x.a) : t(''), x.side === 'C' ? n(x.a) : t('')];
  const lett = [H(['Compte', 'Nom', 'Lettre', 'Méthode', 'Date', 'Journal', 'Libellé', 'Débit', 'Crédit'])]
    .concat(lettRows().map(({ a, g, x }) => [t(a.code), t(a.name), t(g.l), t(g.rel === x ? `RELEVÉ — ${g.m}` : g.m), t(x.date), t(x.j), t(x.label)].concat(amounts(x))));
  const open = [H(['Compte', 'Nom', 'Date', 'Journal', 'Libellé', 'Débit', 'Crédit', 'Remarque'])];
  st.accs.forEach((a) => a.rest.slice().sort(lettKey).forEach((x) => open.push([t(a.code), t(a.name), t(x.date), t(x.j), t(x.label)].concat(amounts(x), [t([x.hyp ? 'hypothèse' : '', x.dup ? 'doublon ?' : ''].filter(Boolean).join(', '))]))));
  const syn = [H(['Compte', 'Nom', 'Lettrages', 'Écritures lettrées', 'Écritures ouvertes', 'Solde ouvert'])]
    .concat(st.accs.filter((a) => a.lines.length).map((a) => [t(a.code), t(a.name), { v: a.groups.length, s: 2 }, { v: a.groups.reduce((s, g) => s + g.lines.length, 0), s: 2 }, { v: a.rest.length, s: 2 }, n(a.bal)]));
  const sheets = [
    { name: 'Lettrages', rows: lett, widths: [14, 30, 8, 30, 12, 8, 50, 14, 14], freeze: { row: 1 } },
    { name: 'Écritures ouvertes', rows: open, widths: [14, 30, 12, 8, 50, 14, 14, 16], freeze: { row: 1 } },
    { name: 'Synthèse', rows: syn, widths: [14, 34, 10, 12, 12, 14], freeze: { row: 1 } },
  ];
  const add = (name, head, rows, widths) => { if (rows.length) sheets.push({ name, rows: [H(head)].concat(rows), widths, freeze: { row: 1 } }); };
  add('Hypothèses', ['Compte du règlement', 'Nom', 'Date', 'Montant', 'Compte des factures', 'Nom', 'Factures', 'Visa'],
    st.hyp.map((y) => [t(y.a.code), t(y.a.name), t(y.p.date), n(y.p.a), t(y.b.code), t(y.b.name), t(lettInvTxt(y.inv)), t(y.ok ? 'transféré et lettré' : 'à valider')]), [14, 30, 12, 14, 14, 30, 50, 18]);
  add('Compte d\'attente', ['Compte', 'Date', 'Montant', 'Proposition', 'Statut'],
    st.lcr.map(({ a, p, c }) => [t(a.code), t(p.date), n(p.a), t(c.map(({ b, hit }) => `${b.code} ${b.name} (${lettInvTxt(hit)})`).join(' ou ')), t(c.length === 1 ? 'unique' : c.length ? 'plusieurs possibilités' : 'aucun fournisseur trouvé')]), [14, 12, 14, 60, 22]);
  add('Relevés', ['Compte', 'Lettre', 'Date du relevé', 'Montant', 'Factures', 'Règlement'],
    lettRelevés(st.accs).map(([a, g]) => [t(a.code), t(g.l), t(g.rel.date), n(g.rel.a), t(lettInvTxt(g.lines.filter((x) => x.side === a.inv && x !== g.rel))), t((g.lines.find((x) => x.side !== a.inv) || {}).date)]), [14, 8, 14, 14, 50, 14]);
  const dupRows = [];
  st.dup.forEach((d, k) => d.g.forEach(([a, x]) => dupRows.push([{ v: k + 1, s: 2 }, { v: d.l, s: 2 }, t(a.code), t(x.num), t(x.date), n(x.a), t(x.side === 'D' ? 'Débit' : 'Crédit')])));
  add('Doublons', ['Groupe', 'Niveau', 'Compte', 'N° de facture', 'Date', 'Montant', 'Sens'], dupRows, [8, 8, 14, 18, 12, 14, 8]);
  add('Règlements sans facture', ['Compte', 'Fournisseur', 'Date du règlement', 'Montant'], st.miss.map((m) => [t(m.code), t(m.n), t(m.d), n(m.a)]), [14, 34, 14, 14]);
  const blob = XlsxWriter.build({ sheets });
  download(`lettrage-${(st.fec && st.fec.siren) || 'grand-livre'}-${todayStr()}.xlsx`, blob, blob.type);
}
