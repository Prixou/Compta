# Suivi Dossiers — application de suivi pour cabinet comptable

Application pour suivre vos dossiers clients et leur avancement, sur **PC, tablette et téléphone**.
Elle a été conçue pour respecter le **secret professionnel** et la **déontologie** de l'expertise comptable :

| Exigence | Comment l'application y répond |
|---|---|
| Secret professionnel | Aucune donnée ne quitte l'appareil : pas de serveur, pas de compte, pas de cloud, pas de statistiques. Une politique de sécurité (CSP) bloque toute connexion vers un domaine tiers. |
| Confidentialité des données | Tout est chiffré sur l'appareil (AES-GCM 256 bits). La clé est dérivée du mot de passe maître (PBKDF2-SHA-256, 600 000 itérations) et n'est jamais enregistrée. |
| Regards indiscrets | Verrouillage automatique après inactivité (1 à 30 min), verrouillage optionnel dès que l'application passe en arrière-plan, **mode discret** qui affiche les codes dossiers au lieu des noms et masque les coordonnées. |
| Lettre de mission / LCB-FT | Chaque dossier contient la date de la lettre de mission, le niveau de vigilance et la date de la dernière identification. Le tableau de bord signale les dossiers à régulariser. |
| RGPD | Minimisation (seules les informations utiles au suivi), suppression définitive d'un dossier (droit à l'effacement), export des données (portabilité), archivage en fin de mission. |

## Fonctionnalités

- **Tableau de bord** : missions en retard, échéances des 14 prochains jours, missions en attente du client ou à valider, avancement des campagnes (ex. « Bilan annuel 2025 : 12/40 terminés »), alertes de conformité.
- **Dossiers** : forme juridique, SIREN, régimes fiscal et TVA, date de clôture, responsable, contact, notes, journal horodaté (appels, relances, pièces reçues…).
- **Missions** avec étapes à cocher et pourcentage d'avancement, à partir de modèles modifiables : bilan annuel, TVA, paie, juridique annuel, déclaration de revenus, situation intermédiaire, création d'entreprise, mission libre.
- **Récurrence** : quand une TVA mensuelle, une paie ou un bilan est terminé, l'occurrence suivante est créée automatiquement avec l'échéance décalée.
- **Statuts** : à faire, en cours, attente client, à valider, terminé. Filtres par statut, échéance, type et collaborateur.
- **Import Excel / CSV** de votre tableau de suivi existant (voir ci-dessous), réimportable à chaque mise à jour sans créer de doublons.
- **Suivi mensuel** : une grille façon tableur (dossiers × mois) qui montre d'un coup d'œil les déclarations terminées, en retard, en attente du client ou à faire. Un clic sur une case ouvre la mission.
- **Vue tableau** des dossiers, triée par numéro de dossier.
- **Calendrier fiscal automatique** : en un clic, les échéances de l'année pour tous les dossiers selon leur forme, leur régime de TVA, leur régime fiscal et leur date de clôture : TVA mensuelle et trimestrielle, CA12 et acomptes, acomptes et solde d'IS, bilan et liasse, approbation des comptes et dépôt au greffe, CFE. Les dates tombant un week-end ou un jour férié sont reportées au jour ouvré suivant. Elles sont **indicatives** et restent à vérifier avec le calendrier fiscal officiel.
- **Pointage rapide** dans le suivi mensuel : un clic passe la case à OK, comme dans Excel. La grille s'exporte en Excel, et le fichier obtenu est réimportable.
- **Messages aux clients** : demande de documents, relance ou envoi pour validation, pré-rédigés avec la liste des pièces manquantes (tirée des étapes non cochées). Le message est copié ou ouvert dans votre messagerie, puis l'envoi est noté dans le journal. Les clients sans réponse depuis 7 jours apparaissent dans **À relancer**.
- **Rappels dans votre agenda** : export `.ics` (Outlook, Google Agenda, iPhone) avec rappel à 9 h, les N° de dossier seuls remplaçant les noms par défaut.
- **Filtre « Mes dossiers »** sur le tableau de bord, pour chaque collaborateur.
- **Sauvegarde automatique** (ordinateur, Chrome ou Edge) : la sauvegarde chiffrée est écrite dans le fichier de votre choix après chaque modification.
- **Analyse de FEC**, faite localement dans un processus isolé : le FEC n'est ni envoyé ni conservé, et 300 000 lignes sont traitées en quelques secondes. Elle comprend :
  - les **contrôles de conformité** de l'article A47 A-1 du LPF : colonnes, zones obligatoires, dates, montants, équilibre des écritures et de la balance, numérotation, dates hors exercice… ;
  - les **points de révision** : caisse créditrice, comptes d'attente, clients créditeurs, fournisseurs débiteurs, compte courant d'associé débiteur, doublons, écritures du dimanche ou d'un jour férié, loi de Benford ;
  - les **chiffres** : SIG, bilan simplifié, balance, graphiques mensuels du CA, des charges et de la trésorerie, journaux, principaux tiers. Le tout s'exporte en Excel.
- **Deux analyseurs FEC** : « Structure classique » et « Pharmacie », chacun gardant son FEC en cours. L'analyseur pharmacie gère le tiers payant (encours AMO / AMC / patients par ancienneté, rejets exacts si les 411 sont lettrés, estimés sinon), le CA et la TVA par taux (2,1 %, 5,5 %, 10 %, 20 %), le taux de marque, les remises fournisseurs, les écarts de caisse, traite les 511 comme des comptes de transit et ajoute les pièces propres à l'officine (inventaire LGO, relevés de tiers payant, RFA, ROSP). Un FEC d'officine déposé dans l'analyseur classique est détecté et le basculement est proposé.
- **Pièces à demander** (depuis le FEC, pour une situation ou un bilan) : relevés manquants, factures récurrentes absentes, paiements sans facture, opérations en 471, immobilisations, paie, check-list de clôture et questions au client. Un clic prépare le mail et crée une mission dont chaque étape est une pièce ; la relance ne liste que ce qui manque encore.
- **Revue analytique N / N-1** : comparaison de deux FEC par poste et par compte, variations significatives à justifier (vos commentaires sont conservés dans le dossier), contrôles de cohérence (TVA / CA, social, amortissements, intérêts, capitaux propres inférieurs à la moitié du capital, points fiscaux). Une **note de synthèse** s'imprime ou s'enregistre en PDF pour le rendez-vous bilan.
- **Rapprochement bancaire** : import du relevé (CFONB 120 / EBICS, OFX, CAMT.053, CSV ou Excel), puis appariement automatique avec le compte de banque du FEC (dates proches, regroupements), état de rapprochement et opérations non comptabilisées ajoutées aux pièces à demander.
- **Import du classeur du cabinet** : INFO DOSSIER, SUIVI TVA, SUIVI RÉVISION (vos étapes de bilan), SUIVI SITUATION, SUIVI DÉCLARATION et SUIVI SAISIE en une fois, avec un filtre (ex. CJ = QUME). Les onglets d'identifiants ne sont jamais lus, et le réimport ne crée aucun doublon.
- **Aide intégrée** dans l'application.
- **Sauvegarde chiffrée** exportable, pour se prémunir d'une perte de l'appareil et **transférer les données entre PC et téléphone**. Export CSV possible (non chiffré, avec avertissement).
- **Hors ligne** et installable comme une application (PWA), en mode clair ou sombre selon l'appareil.

## Installation

L'application est un ensemble de fichiers statiques (HTML, CSS, JavaScript, sans dépendance externe).
Elle doit être servie en **https** (ou sur `localhost`) pour que le chiffrement fonctionne.

### Option 1 — GitHub Pages (recommandé pour l'utiliser sur téléphone)

1. Dans le dépôt GitHub : **Settings → Pages → Build and deployment** → *Deploy from a branch*, choisir la branche et le dossier `/ (root)`.
2. Ouvrir l'adresse fournie (ex. `https://<compte>.github.io/compta/`).
3. Installer l'application :
   - **Android / Chrome** : menu ⋮ → *Installer l'application* (ou *Ajouter à l'écran d'accueil*).
   - **iPhone / Safari** : bouton Partager → *Sur l'écran d'accueil*.
   - **PC (Chrome / Edge)** : icône d'installation dans la barre d'adresse.

Seul le code de l'application est publié : **vos données restent sur chacun de vos appareils** et ne transitent jamais par GitHub.

### Option 2 — Sur un PC uniquement, sans rien publier

```bash
cd compta
python3 -m http.server 8080
```

Puis ouvrir <http://localhost:8080> et l'installer depuis le navigateur.

## Premier démarrage

1. Choisissez un **mot de passe maître** (10 caractères minimum, une phrase de passe est idéale).
   **Il n'existe aucun moyen de le récupérer** : sans lui, les données sont illisibles, y compris par vous.
2. Dans *Paramètres*, renseignez le nom du cabinet, votre prénom et vos collaborateurs.
3. Créez vos dossiers, puis leurs missions.
4. Exportez régulièrement une **sauvegarde chiffrée** (un rappel s'affiche au bout de 7 jours).

### Utiliser le même suivi sur PC et téléphone

Chaque appareil a son propre coffre chiffré. Pour transférer : *Paramètres → Exporter une sauvegarde chiffrée* sur l'appareil source,
puis sur l'autre appareil *Restaurer une sauvegarde* (à l'écran de création ou dans les paramètres) avec le mot de passe de cette sauvegarde.
Transmettez le fichier par un moyen maîtrisé par le cabinet (câble, clé USB chiffrée, espace de stockage du cabinet) : même chiffré, il ne doit pas circuler n'importe où.

## Importer votre tableau Excel

*Dossiers → Importer (Excel / CSV)*, puis choisissez votre fichier `.xlsx` (ou `.csv`). Le fichier est lu **uniquement sur l'appareil**, sans bibliothèque ni serveur externe.

1. Les colonnes sont reconnues automatiquement : `N° DOSSIER`, `STATUT` (forme juridique), `DOSSIERS` (nom), `SIREN`, `TVA` (`M` = mensuel, `T` = trimestriel, `CA12` = réel simplifié), `JOUR TVA`, `IS/IR` (date de clôture), et les colonnes `1` à `12` (suivi mensuel).
2. Associez vous-même les colonnes à l'intitulé ambigu (par ex. `M`, `C`) au *responsable*, au *collaborateur* ou au *superviseur / associé*.
3. Colonnes de suivi mensuel : « OK », « X » ou une date = mission terminée ; case **hachurée** ou « - » = non applicable ; case vide = à faire si la déclaration est due et que son échéance est passée ou dans le mois. L'échéance est calculée au jour limite TVA du mois suivant la période.
4. Les numéros de dossier servent de clé : réimporter le tableau met à jour les dossiers existants et passe à « terminé » les nouvelles cases « OK », sans rien dupliquer.

Une fois l'import fait, supprimez les copies du fichier Excel dont vous n'avez plus besoin : elles ne sont pas chiffrées.

## Bonnes pratiques de sécurité

- Protégez aussi l'appareil : code de verrouillage, chiffrement du disque (BitLocker, FileVault — activé par défaut sur les téléphones récents), session Windows/macOS personnelle.
- N'utilisez pas l'application en navigation privée : les données y seraient effacées à la fermeture.
- Ne saisissez pas de données inutiles au suivi : les pièces et la comptabilité des clients restent dans votre logiciel de production.
- Effacer les données du site dans le navigateur supprime le coffre : gardez une sauvegarde récente.

## Aspects techniques

```
index.html            page unique + politique de sécurité (CSP)
css/styles.css        interface responsive (PC / mobile, clair / sombre)
js/vault.js           coffre chiffré : WebCrypto (PBKDF2 + AES-GCM) et IndexedDB
js/sheet-reader.js    lecture locale des fichiers .xlsx (zip + XML) et .csv, sans dépendance
js/xlsx-writer.js     écriture locale de fichiers .xlsx (exports), sans dépendance
js/fec-worker.js      analyse du FEC dans un Web Worker (contrôles, balance, SIG, pièces manquantes)
js/bank-reader.js     lecture locale des relevés bancaires (CFONB 120, OFX, CAMT.053, CSV, Excel)
js/app.js             application (dossiers, missions, tableau de bord, paramètres)
sw.js                 service worker (fonctionnement hors ligne)
manifest.webmanifest  installation comme application
```

- Aucune bibliothèque tierce, aucun appel réseau hors du domaine de l'application.
- Les données déchiffrées n'existent qu'en mémoire, et sont effacées au verrouillage.
- Chaque enregistrement est rechiffré avec un vecteur d'initialisation neuf ; l'intégrité est garantie par AES-GCM.
- Les exports CSV sont protégés contre l'injection de formules dans les tableurs.
