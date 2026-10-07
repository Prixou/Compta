/*
 * Suivi Dossiers — Calcul de TVA : HT, TVA et TTC aux taux de 20 %, 10 %, 5,5 % et 2,1 %.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------- Calcul de TVA ----------

const TAUX_TVA = [20, 10, 5.5, 2.1];
const tauxFr = (t) => `${String(t).replace('.', ',')} %`;
// Montant saisi : « 1 234,56 », « 1234.56 », « 1 234,56 € » ; null si vide ou invalide.
function parseMontant(txt) {
  const s = String(txt || '').replace(/[\s  €]/g, '').replace(',', '.');
  if (s === '' || !/^-?\d*\.?\d*$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}
// HT, TVA et TTC à partir d'un montant HT, TVA ou TTC (TVA arrondie au centime, TTC = HT + TVA).
function calcTva(src, v, taux) {
  const r = taux / 100;
  const r2 = (n) => Math.round(n * 100) / 100;
  if (v === null) return { ht: null, tva: null, ttc: null };
  let ht, tva;
  if (src === 'ht') { ht = r2(v); tva = r2(ht * r); }
  else if (src === 'tva') { tva = r2(v); ht = r2(tva / r); }
  else { const ttc = r2(v); ht = r2(ttc / (1 + r)); tva = r2(ttc - ht); }
  return { ht, tva, ttc: r2(ht + tva) };
}

function calcState() {
  ui.calc = ui.calc || { taux: 20, src: 'ht', val: null, ventMode: 'ttc', vent: {} };
  return ui.calc;
}

const calcCell = (v, cls) => `<button type="button" class="calc-val${cls ? ' ' + cls : ''}" data-action="calc-copy" data-v="${v === null ? '' : v}" title="Copier"${v === null ? ' disabled' : ''}>${v === null ? '—' : eur(v)}</button>`;

function viewCalc() {
  const st = calcState();
  const res = calcTva(st.src, st.val, st.taux);
  const field = (k, label) => `<label class="calc-field${st.src === k ? ' src' : ''}">${label}
    <span class="calc-input"><input type="text" inputmode="decimal" data-calc="${k}" value="${res[k] === null ? '' : esc(st.src === k && st.raw !== undefined ? st.raw : eur(res[k]))}" placeholder="0,00" autocomplete="off" spellcheck="false"><span aria-hidden="true">€</span>
    <button type="button" class="link-btn" data-action="calc-copy" data-from="${k}">Copier</button></span></label>`;
  return `
    <div class="page-head"><h1>Calcul de TVA</h1>
      <div class="head-actions"><button class="btn" data-action="calc-reset">Effacer</button></div></div>
    <section class="card calc-main">
      <div class="calc-rates">
        <span class="muted small">Taux</span>
        <div class="seg" role="group" aria-label="Taux de TVA">${TAUX_TVA.map((t) => `<button class="${st.taux === t ? 'on' : ''}" data-action="calc-rate" data-taux="${t}" aria-pressed="${st.taux === t}">${tauxFr(t)}</button>`).join('')}</div>
      </div>
      <div class="calc-fields">${field('ht', 'Montant HT')}${field('tva', 'TVA')}${field('ttc', 'Montant TTC')}</div>
      <p class="muted small">Saisissez le montant connu dans l'une des trois cases : les deux autres se calculent. TVA arrondie au centime ; TTC = HT × ${String(1 + st.taux / 100).replace('.', ',')}, HT = TTC ÷ ${String(1 + st.taux / 100).replace('.', ',')}. Un clic sur un résultat le copie (format Excel).</p>
    </section>
    <section class="card"><h2>Le même montant aux quatre taux</h2>
      <p class="muted small calc-all-head">${st.val === null ? 'Saisissez un montant ci-dessus.' : `Pour ${st.src === 'ht' ? 'un montant HT' : st.src === 'tva' ? 'une TVA' : 'un montant TTC'} de <strong>${eur(st.val)} €</strong> :`}</p>
      <div class="grid-wrap"><table class="dtable num calc-all"><thead><tr><th>Taux</th><th>HT</th><th>TVA</th><th>TTC</th></tr></thead>
        <tbody>${TAUX_TVA.map((t) => { const x = calcTva(st.src, st.val, t); return `<tr class="${t === st.taux ? 'strong' : ''}"><td>${tauxFr(t)}</td><td>${calcCell(x.ht)}</td><td>${calcCell(x.tva)}</td><td>${calcCell(x.ttc)}</td></tr>`; }).join('')}</tbody></table></div>
    </section>
    <section class="card"><h2>Ventilation par taux</h2>
      <p class="muted small">Ticket, facture ou Z de caisse à plusieurs taux (officine : 2,1 %, 5,5 %, 10 %, 20 %) : saisissez le montant de chaque taux, en TTC ou en HT.</p>
      <div class="filters">
        <div class="seg" role="group" aria-label="Montants saisis">
          <button class="${st.ventMode === 'ttc' ? 'on' : ''}" data-action="calc-vent-mode" data-mode="ttc">Saisie en TTC</button>
          <button class="${st.ventMode === 'ht' ? 'on' : ''}" data-action="calc-vent-mode" data-mode="ht">Saisie en HT</button>
        </div>
        <button class="btn small" data-action="calc-vent-copy">Copier le tableau</button>
        <button class="btn small" data-action="calc-vent-reset">Effacer</button>
      </div>
      <div class="grid-wrap"><table class="dtable num calc-vent"><thead><tr><th>Taux</th><th>${st.ventMode === 'ttc' ? 'TTC saisi' : 'HT saisi'}</th><th>HT</th><th>TVA</th><th>TTC</th></tr></thead>
        <tbody>${TAUX_TVA.map((t) => `<tr data-taux="${t}"><td>${tauxFr(t)}</td><td><input type="text" inputmode="decimal" data-calc-vent="${t}" value="${esc(st.vent[t] || '')}" placeholder="0,00" aria-label="Montant ${st.ventMode === 'ttc' ? 'TTC' : 'HT'} à ${tauxFr(t)}" autocomplete="off"></td><td class="v-ht"></td><td class="v-tva"></td><td class="v-ttc"></td></tr>`).join('')}</tbody>
        <tfoot><tr><th>Total</th><th></th><td class="v-ht"></td><td class="v-tva"></td><td class="v-ttc"></td></tr></tfoot></table></div>
    </section>`;
}

// Lignes de la ventilation et total.
function ventRows() {
  const st = calcState();
  const rows = TAUX_TVA.map((t) => Object.assign({ taux: t }, calcTva(st.ventMode, parseMontant(st.vent[t]), t)));
  const sum = (k) => Math.round(rows.reduce((s, x) => s + (x[k] || 0), 0) * 100) / 100;
  return { rows, total: rows.some((x) => x.ht !== null) ? { ht: sum('ht'), tva: sum('tva'), ttc: sum('ttc') } : { ht: null, tva: null, ttc: null } };
}

// Mise à jour sans redessiner la page (la saisie en cours garde le curseur).
function calcUpdate(input) {
  const st = calcState();
  const main = $('#main');
  if (input && input.dataset.calc) {
    st.src = input.dataset.calc;
    st.raw = input.value;
    st.val = parseMontant(input.value);
    const res = calcTva(st.src, st.val, st.taux);
    $$('[data-calc]', main).forEach((el) => {
      if (el !== input) el.value = res[el.dataset.calc] === null ? '' : eur(res[el.dataset.calc]);
      el.closest('.calc-field').classList.toggle('src', el === input);
    });
    const tbody = $('.calc-all tbody', main);
    if (tbody) tbody.innerHTML = TAUX_TVA.map((t) => { const x = calcTva(st.src, st.val, t); return `<tr class="${t === st.taux ? 'strong' : ''}"><td>${tauxFr(t)}</td><td>${calcCell(x.ht)}</td><td>${calcCell(x.tva)}</td><td>${calcCell(x.ttc)}</td></tr>`; }).join('');
    const head = $('.calc-all-head', main);
    if (head) head.innerHTML = st.val === null ? 'Saisissez un montant ci-dessus.' : `Pour ${st.src === 'ht' ? 'un montant HT' : st.src === 'tva' ? 'une TVA' : 'un montant TTC'} de <strong>${eur(st.val)} €</strong> :`;
  }
  if (input && input.dataset.calcVent) st.vent[input.dataset.calcVent] = input.value;
  const { rows, total } = ventRows();
  const put = (tr, x) => ['ht', 'tva', 'ttc'].forEach((k) => { const td = $(`.v-${k}`, tr); if (td) td.innerHTML = x[k] === null ? '' : calcCell(x[k]); });
  rows.forEach((x) => { const tr = $(`.calc-vent tr[data-taux="${x.taux}"]`, main); if (tr) put(tr, x); });
  const foot = $('.calc-vent tfoot tr', main);
  if (foot) put(foot, total);
}

function calcCopy(v) {
  if (v === '' || v === undefined) return;
  const text = String(v).replace('.', ',');
  navigator.clipboard.writeText(text).then(() => toast(`${eur(Number(v))} copié.`), () => toast('Copie impossible sur ce navigateur.', true));
}

function calcVentCopy() {
  const { rows, total } = ventRows();
  const f = (n) => (n === null ? '' : String(n).replace('.', ','));
  const lines = [['Taux', 'HT', 'TVA', 'TTC']].concat(rows.filter((x) => x.ht !== null).map((x) => [tauxFr(x.taux), f(x.ht), f(x.tva), f(x.ttc)]), [['Total', f(total.ht), f(total.tva), f(total.ttc)]]);
  if (total.ht === null) return toast('Saisissez au moins un montant.', true);
  navigator.clipboard.writeText(lines.map((l) => l.join('\t')).join('\n')).then(() => toast('Tableau copié : collez-le dans Excel.'), () => toast('Copie impossible sur ce navigateur.', true));
}
