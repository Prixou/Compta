# Tests de bout en bout

Les suites pilotent l'application dans Chromium (Playwright) avec des **données entièrement fictives** :
FEC générés, relevés bancaires, archives de justificatifs et tableau de suivi inventés. Aucune donnée de client
ne doit être ajoutée à ce dossier : le dépôt est public.

```
npm i -g playwright            # une fois (ou NODE_PATH vers une installation existante)
node tests/run.js              # toutes les suites (≈ 4 min)
node tests/run.js tva imput    # seulement les suites dont le nom contient « tva » ou « imput »
```

- `fixtures/` : fichiers d'entrée. Le gros FEC de 300 000 lignes (`FEC-gros-volume.txt`) est généré au premier lancement (Python 3).
- `gen/` : générateurs des FEC et du tableau de suivi (`gen_suivi.py` demande `openpyxl`), pour les recréer ou en faire varier.
- `suites/` : une suite par fonction (analyse FEC, cycles, TVA, pièces, portefeuille, suivi mensuel, sécurité…).
- `out/` : captures d'écran, fichiers exportés et journal de chaque suite (non versionné).

Une suite échoue si elle s'arrête sur une erreur, si la page lève une erreur JavaScript, si elle affiche une liste
`erreurs` non vide, ou si le check-up signale un contrôle `KO`. À lancer avant chaque publication.
