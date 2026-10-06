# Code de l'application

L'application est découpée en scripts classiques chargés **dans l'ordre** par `index.html` (et mis en cache par `sw.js`).
Ils partagent la même portée globale : une fonction ou une constante déclarée dans un fichier est utilisable dans les
suivants (et, pour les fonctions, n'importe où une fois la page chargée). Pas de bundler ni de dépendance : la politique
de sécurité (CSP) n'autorise que les scripts du site.

| Fichier | Rôle |
|---|---|
| `01-core.js` | Référentiels (statuts, modèles), utilitaires, données, index, portefeuilles, étapes cochées automatiquement |
| `02-ui.js` | Fragments d'interface, écrans de verrouillage, structure, navigation (`route`, `refresh`) |
| `03-tableau.js` … `09-import.js` | Tableau de bord, dossiers, missions, suivi mensuel, messages, calendrier fiscal, import Excel |
| `10-fec.js` | Analyse FEC : lancement du moteur (`fec-worker.js`), profil (classique ou officine), espaces Mois / Révision / Consultation, graphiques, écran principal |
| `11-fec-pieces.js` | Pièces à demander (client, mois, fournisseurs) |
| `12-fec-revue.js` | Revue N / N-1, note de synthèse, rapprochement bancaire |
| `13-fec-pharmacie.js` | Officine : tiers payant, CA et TVA par taux |
| `14-fec-cycles.js` | Cycles de révision, imputations sur un autre tiers, justificatifs d'archive |
| `15-fec-tva.js` | Contrôle de la TVA (bêta) |
| `16-fec-mois.js` | Espace Mois : choix du mois, chiffres du mois, contrôles de la saisie |
| `17-portefeuille.js` | Portefeuille : analyse de plusieurs FEC |
| `18-revision.js` | Feuille de travail, mémoire du dossier, liens avec les missions |
| `19-fec-ecritures.js` | Écritures proposées et exports de l'analyse |
| `20-sauvegarde.js` … `24-modales.js` | Sauvegarde automatique, agenda, aide, import du classeur cabinet, paramètres, fenêtres, verrouillage |
| `25-actions.js`, `26-formulaires.js` | Actions et événements, formulaires, démarrage (toujours en dernier) |

Règles : un fichier ne doit pas exécuter au chargement une fonction déclarée dans un fichier suivant (les appels depuis
des événements ou d'autres fonctions sont libres) ; deux fichiers ne doivent pas déclarer le même nom ; les noms ne doivent
pas masquer une propriété de `window` (`open`, `print`, `close`…). Après toute modification : `node tests/run.js`.
