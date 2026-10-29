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
| `14-fec-cycles.js` | Dossier de révision : rangement des comptes en cycles A à K, contrôles, comptes et pièces de chaque cycle ; imputations sur un autre tiers, justificatifs d'archive |
| `15-fec-tva.js` | Contrôle de la TVA (bêta) |
| `16-fec-mois.js` | Espace Mois : choix du mois, chiffres du mois, contrôles de la saisie |
| `17-portefeuille.js` | Portefeuille : analyse de plusieurs FEC |
| `18-revision.js` | Feuille de travail (contrôles, comptes justifiés, pièces des cycles), dossier de travail imprimable, mémoire du dossier, liens avec les missions |
| `19-fec-ecritures.js` | Écritures proposées et exports de l'analyse |
| `20-sauvegarde.js` … `24-modales.js` | Sauvegarde automatique, agenda, aide, import du classeur cabinet, paramètres, fenêtres, verrouillage |
| `25-actions.js` | Actions et événements |
| `26-calcul-tva.js` | Calcul de TVA : HT, TVA, TTC aux quatre taux, ventilation par taux |
| `27-anonymiser.js` | Anonymisation d'un FEC (moteur `fec-anon.js`) avant de l'envoyer à un tiers |
| `28-releves.js` | Relevés bancaires PDF (édition ACD) → Excel pour l'import de transactions (lecture : `pdf-reader.js`, `releve-pdf.js`) |
| `29-notes.js` | Notes : procédures, particularités de dossier, listes d'étapes à cocher (rattachées à un dossier ou non, classées par groupe) |
| `30-comparer.js` | Comparaison de deux FEC du même exercice (moteur `fec-compare.js`, qui reprend la lecture de `fec-worker.js`) |
| `31-rapprochement.js` | Rapprocher un relevé bancaire et le FEC du journal de banque (appariement de `12-fec-revue.js`) : écarts, état de rapprochement, écritures à passer |
| `32-tva-revue.js` | Contrôle de la TVA de l'exercice (onglet « Contrôle TVA » de l'espace Révision) : récapitulatif des déclarations, TVA collectée, TVA déductible, soldes après OD, export Excel |
| `33-lettrage.js` | Lettrage proposé des comptes de tiers d'après le grand livre non lettré (PDF, texte) ou un FEC : factures consécutives et peu espacées, relevés, avoirs, règlements en plusieurs fois ; hypothèses, doublons, compte d'attente, mail des factures manquantes, comptes fermés ; copie et export Excel |
| `34-lcr.js` | Écritures LCR pour ACD : relevés LCR en PDF (Crédit Agricole, CIC) rapprochés du listing fournisseurs (correspondances, listing et réglages retenus par dossier), une OD par relevé, fichier d'import ACD et tableau de contrôle |
| `35-ratios.js` | Ratios sectoriels INSEE (Ésane 2023) par code NAF, comparés aux chiffres du dossier saisis ou repris de l'analyse FEC (données : `js/ratios-insee.js`, chargé à la demande) |
| `36-formulaires.js` | Formulaires, démarrage (toujours en dernier) |

Règles : un fichier ne doit pas exécuter au chargement une fonction déclarée dans un fichier suivant (les appels depuis
des événements ou d'autres fonctions sont libres) ; deux fichiers ne doivent pas déclarer le même nom ; les noms ne doivent
pas masquer une propriété de `window` (`open`, `print`, `close`…). Après toute modification : `node tests/run.js`.
