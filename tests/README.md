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
  `genpennylane_ref.py` produit le **FEC de référence Pennylane** (`900000009FEC20270831.txt` et les montants attendus
  `900000009-attendu.json`) : même structure qu'un export Pennylane réel (journaux AN, BQ, HA, VT, RT, OD, comptes suffixés
  par taux, TVA sur les encaissements, opérations en attente 4716 / 4717, ValidDate vide), données inventées. Toute
  fonction destinée aux dossiers Pennylane se teste sur ce fichier (`suites/pennylane-test.js`).
  `genreleve_pdf.py` produit les **relevés bancaires PDF** de test (`releve-acd.pdf` : mise en page de l'édition
  « Relevé bancaire » d'ACD, un caractère par opérateur, sur deux pages ; `releve-banque.pdf` : colonnes Date / Valeur /
  Libellé / Débit / Crédit) et les opérations attendues (`releve-attendu.json`), données inventées (`suites/releves-test.js`).
  `gencompare.py` produit deux FEC du même exercice (`fixtures/compare/`), l'un présenté comme ACD, l'autre comme Pennylane,
  avec des différences connues (`compare-attendu.json`), pour le comparateur de FEC (`suites/compare-test.js`).
  `genrappro.py` produit un FEC limité au journal de banque d'octobre et le relevé du même mois (CSV et OFX), avec des
  écarts connus (`fixtures/rappro/`), pour « Rapprocher un relevé » (`suites/brap-test.js`).
  `genfactmmaa.py` produit un FEC dont les factures sont numérotées « n° + mois et année » (F51080126), citées surtout
  dans les encaissements et en listes (`800000008FEC20261231.txt`), pour `suites/factmmaa-test.js`.
  `gentvarevue.py` produit un FEC d'hôtel au réel mensuel (`600000006FEC20261231.txt`) avec ses OD de TVA, un crédit, une
  TVA erronée et un loyer non réglé, et les montants attendus (`600000006-attendu.json`), pour l'onglet « Contrôle TVA »
  (`suites/tvarevue-test.js`). `genca3_pdf.py` produit les CA3 de ce dossier en PDF (`fixtures/ca3/` : janvier ; février et
  mars dans un même fichier, deux mises en page) ; `fixtures/factures-non-reglees.csv` est une liste de factures non réglées
  telle qu'exportée d'un logiciel de facturation (données inventées).
  `genlettrage.py` produit un grand livre fournisseurs non lettré (`fixtures/lettrage/` : PDF de l'édition « Grands-livres »
  sur trois pages et son texte ; relevé saisi en plus, avoirs, hypothèse entre deux comptes, compte d'attente LCR, doublons,
  compte BNC ignoré) et les résultats attendus, pour la page « Lettrage » (`suites/lettrage-test.js`).
- `suites/` : une suite par fonction (analyse FEC, cycles, TVA, pièces, portefeuille, suivi mensuel, sécurité…) ; `suites/lib.js` regroupe les aides de navigation (onglets et espaces Mois / Révision / Consultation de l'analyse FEC, choix du mois).
- `out/` : captures d'écran, fichiers exportés et journal de chaque suite (non versionné).

Une suite échoue si elle s'arrête sur une erreur, si la page lève une erreur JavaScript, si elle affiche une liste
`erreurs` non vide, ou si le check-up signale un contrôle `KO`. À lancer avant chaque publication.
