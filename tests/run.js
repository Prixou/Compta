#!/usr/bin/env node
/*
 * Lance les suites de tests de bout en bout (navigateur Chromium piloté par Playwright).
 *   node tests/run.js            → toutes les suites
 *   node tests/run.js tva imput  → seulement les suites dont le nom contient « tva » ou « imput »
 * Prérequis : Node 18+, Playwright (`npm i -g playwright` ou NODE_PATH vers son installation), Python 3 pour générer le gros FEC.
 * Les données de test sont entièrement fictives (tests/fixtures). Les résultats (captures, fichiers exportés, journaux) vont dans tests/out.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures');
const OUT = path.join(__dirname, 'out');
const PORT = Number(process.env.PORT || 8765);
fs.mkdirSync(OUT, { recursive: true });

// Gros FEC (300 000 lignes) : généré au premier lancement, jamais versionné.
const big = path.join(FIX, 'FEC-gros-volume.txt');
if (!fs.existsSync(big)) {
  console.log('Génération du gros FEC de test…');
  const r = spawnSync('python3', [path.join(__dirname, 'gen', 'genfec_y.py'), '350', big], { stdio: 'inherit' });
  if (r.status) { console.error('Impossible de générer le gros FEC (Python 3 requis).'); process.exit(1); }
}

// Serveur statique minimal (même rôle que « python3 -m http.server »).
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const filters = process.argv.slice(2);
const suites = fs.readdirSync(path.join(__dirname, 'suites')).filter((f) => f.endsWith('.js') && f !== 'lib.js').sort()
  .filter((f) => !filters.length || filters.some((x) => f.includes(x)));

function runSuite(file) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [path.join(__dirname, 'suites', file)], { env: Object.assign({}, process.env, { BASE: `http://localhost:${PORT}/` }) });
    let log = '';
    child.stdout.on('data', (d) => { log += d; });
    child.stderr.on('data', (d) => { log += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 10 * 60000);
    child.on('close', (code) => {
      clearTimeout(timer);
      fs.writeFileSync(path.join(OUT, file.replace(/\.js$/, '.log')), log);
      // Échec : code de sortie, erreur JavaScript de la page, liste d'erreurs non vide, ou contrôle « KO » du check-up.
      const problems = [];
      if (code) problems.push(`code de sortie ${code}`);
      if (/PAGEERROR/.test(log)) problems.push('erreur JavaScript dans la page');
      if (/^erreurs\s*:?\s*\[\s*['"`]/m.test(log)) problems.push('erreurs signalées');
      if (/^KO\s/m.test(log)) problems.push('contrôle KO');
      resolve({ file, ok: !problems.length, problems, ms: Date.now() - t0, log });
    });
  });
}

server.listen(PORT, async () => {
  console.log(`${suites.length} suite(s), serveur sur http://localhost:${PORT}/\n`);
  const results = [];
  for (const f of suites) {
    const r = await runSuite(f);
    results.push(r);
    console.log(`${r.ok ? 'OK  ' : 'ÉCHEC'} ${f.padEnd(28)} ${(r.ms / 1000).toFixed(1).padStart(6)} s${r.ok ? '' : '  — ' + r.problems.join(', ')}`);
    if (!r.ok) console.log(r.log.split('\n').slice(-15).map((l) => '      ' + l).join('\n'));
  }
  server.close();
  const ko = results.filter((r) => !r.ok);
  console.log(`\n${results.length - ko.length} / ${results.length} suite(s) réussie(s). Journaux : tests/out/*.log`);
  process.exit(ko.length ? 1 : 0);
});
