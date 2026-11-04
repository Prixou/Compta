# Consignes pour les sessions Claude Code

Trois personnes font évoluer l'application, chacune avec sa session Claude, sur la même branche. Toutes les sessions
lisent ce fichier.

## Messages de commit

Chacun doit pouvoir lire l'historique (`git log --oneline`) comme un journal des nouveautés, sans ouvrir le code.

### Titre

```
v<version> · <Zone> · <Nature> : <ce qui change pour l'utilisateur>
```

- **version** : le numéro publié par ce commit (celui de `sw.js` après la montée de version). Pour un commit sans
  montée de version (tests ou documentation seuls), on retire le préfixe `v<version> · `.
- **Zone** : l'endroit de l'application où l'on voit le changement, avec le nom affiché à l'écran. Par exemple :
  - pages du menu : Tableau de bord, Dossiers, Missions, Suivi mensuel, Notes, Calendrier fiscal ;
  - onglets de l'Espace FEC : Synthèse, Officine, Révision, Doublons, Pièces à demander, Revue N/N-1, Mois, Banque,
    Lettrage, Écritures LCR, Paie, Immobilisations, TVA, Consultation ;
  - outils sans FEC : Calcul TVA, Cotisations TNS, Relevés PDF, Ratios sectoriels ;
  - autres zones : Paramètres, Aide, Sécurité, Menu, Tests.

  Pour un changement qui touche toute l'application, on écrit `Général`.
- **Nature** : un seul mot parmi
  - `Nouveau` : une fonction qui n'existait pas ;
  - `Amélioration` : une fonction existante qui fait mieux ou plus ;
  - `Correction` : un résultat faux ou un écran cassé, réparé ;
  - `Technique` : aucun effet visible (tests, documentation, réorganisation du code, version).
- **Ce qui change** : une phrase en français courant, du point de vue de l'utilisateur. On écrit ce qu'il verra, pas le
  nom des fonctions ou des fichiers. 90 caractères au plus pour tout le titre si possible.

Exemples :

```
v108 · Doublons · Correction : le n° de pièce passe avant le n° lu dans le libellé
v92 · Écritures LCR · Nouveau : les comptes fournisseurs peuvent venir d'un FEC
v91 · Tableau de bord · Amélioration : colonne « Reprendre » avec les derniers dossiers ouverts
Tests · Technique : suite LCR alimentée par un FEC fictif
```

À éviter : « corrections diverses », « mise à jour », « fix », un titre en anglais, un titre qui ne dit pas où regarder.

### Corps

Après une ligne vide, quelques puces disent ce que l'utilisateur doit savoir :

- le comportement avant et après ;
- les cas particuliers traités ;
- ce qu'il faut vérifier sur un vrai dossier.

Le détail technique n'y va que s'il aide un collègue à reprendre le travail. Les lignes ajoutées automatiquement en fin
de message (`Co-Authored-By`, `Claude-Session`) restent : la seconde permet de retrouver la session d'origine.

### Fusions

Quand la branche a avancé pendant qu'on travaillait (`git fetch` puis `git merge`), le commit de fusion porte un titre
lisible au lieu du message par défaut de git :

```
git merge origin/claude/accounting-file-tracking-app-x56tcn -m "v109 · Général · Technique : fusion du travail publié (Doublons v102 à v108)"
```

On indique entre parenthèses ce qui arrive avec la fusion.

## Rappels pour un commit

- Toujours `git fetch`, puis avancer ou fusionner avant de pousser. On ne réécrit jamais l'historique et on ne force
  jamais un push : les autres sessions travaillent sur la même branche.
- La version monte après chaque changement publié. Elle s'écrit à trois endroits :
  - les `?v=N` de `index.html` ;
  - `const VERSION` dans `sw.js` ;
  - `ASSET_VERSION` dans `js/app/10-fec.js`.
- Aucune donnée réelle de client dans le dépôt, qui est public : ni dans le code, ni dans les commentaires, ni dans les
  messages de commit. Les exemples et les fichiers de test sont fictifs.
