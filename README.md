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
- **Montant de chaque déclaration de TVA** (à payer, crédit ou néant) noté dans le suivi mensuel ou la fiche de la mission : affiché sous la case, dans la liste des missions et exporté en Excel (feuille « Montants TVA »).
- **Messages aux clients** : demande de documents, relance ou envoi pour validation, pré-rédigés avec la liste des pièces manquantes (tirée des étapes non cochées). Le message est copié ou ouvert dans votre messagerie, puis l'envoi est noté dans le journal. Les clients sans réponse depuis 7 jours apparaissent dans **À relancer**.
- **Rappels dans votre agenda** : export `.ics` (Outlook, Google Agenda, iPhone) avec rappel à 9 h, les N° de dossier seuls remplaçant les noms par défaut.
- **Filtre « Mes dossiers »** sur le tableau de bord, pour chaque collaborateur.
- **Sauvegarde automatique** (ordinateur, Chrome ou Edge) : la sauvegarde chiffrée est écrite dans le fichier de votre choix après chaque modification.
- **Analyse de FEC**, faite localement dans un processus isolé : le FEC n'est ni envoyé ni conservé, et 300 000 lignes sont traitées en quelques secondes. Un même FEC s'ouvre dans **trois espaces** selon la question du moment :
  - **Mois** (gestion courante) : choix du mois, chiffres du mois, pièces du mois à demander, **contrôles de la saisie** (imputations sur le mauvais tiers, doublons, comptes d'attente, fournisseurs débiteurs et clients créditeurs en fin de mois) et contrôle de la TVA (bêta) ;
  - **Révision** (situation et bilan) : synthèse, cycles, écritures proposées, pièces à demander, revue N / N-1, rapprochement bancaire ;
  - **Consultation** : SIG et bilan, balance, journaux et tiers, conformité du fichier.
  L'espace utilisé en dernier est repris au FEC suivant. Elle comprend :
  - les **contrôles de conformité** de l'article A47 A-1 du LPF : colonnes, zones obligatoires, dates, montants, équilibre des écritures et de la balance, numérotation, dates hors exercice… ;
  - les **points de révision** : caisse créditrice, comptes d'attente, clients créditeurs, fournisseurs débiteurs, compte courant d'associé débiteur, doublons, écritures du dimanche ou d'un jour férié, loi de Benford ;
  - les **chiffres** : SIG, bilan simplifié, balance, graphiques mensuels du CA, des charges et de la trésorerie, journaux, principaux tiers. Le tout s'exporte en Excel.
- **Cycles de révision** dans l'analyse FEC, avec indicateurs, contrôles et comparaison N-1 :
  - **Achats et fournisseurs** : factures en double, dettes échues, délais de paiement réels (lettrage ou imputation des règlements), TVA déductible anormale ou absente, autoliquidation incomplète, pièces hors exercice, factures non parvenues (et leur extourne), dépendance et nouveaux fournisseurs ;
  - **Charges externes** : détail par compte et par mois, charges récurrentes manquantes, charges constatées d'avance probables, DAS2, dépenses personnelles possibles, amendes, cadeaux, notes de frais, paiements sans facture ;
  - **Ventes et clients** : continuité et doublons de la numérotation des factures, créances échues et dépréciation, délais d'encaissement, TVA, facturation de fin d'exercice, régularisations N-1 non extournées, dépendance client ;
  - **Trésorerie** : découverts et jours débiteurs, espèces de 1 000 € ou plus, caisse, virements internes, comptes dormants, flux par nature de contrepartie, mouvements importants ;
  - tableaux des **délais de paiement (art. D441-6 C. com.)** clients et fournisseurs. Les anomalies alimentent la mission de revue, les pièces à demander et l'export Excel.
- **Écritures de clôture proposées**, prêtes à importer dans **ACD** ou **Pennylane** (format FEC, Excel ou CSV) : charges et produits constatés d'avance, extournes oubliées de N-1, dépréciation des créances échues, annulation des doublons, reclassement des amendes, TVA sur cadeaux, autoliquidation, IS estimé, charges annuelles au prorata pour une situation. Montants et contreparties modifiables, extourne facultative.
- **Feuille de travail de révision** : statut et commentaire par contrôle, cycle signé « revu par / le », reprise du travail lors d'une nouvelle analyse, dossier de travail imprimable, et **mémoire du dossier** (éléments justifiés qui ne sont plus signalés les années suivantes).
- **Demande de pièces mensuelle** (achats et ventes) : factures des fournisseurs et clients habituels absentes du mois, règlements et encaissements sans facture, dépenses payées directement, numéros de facture manquants, opérations à identifier ; mail, mission et relance comme pour une situation. Colonne « pièces du mois » dans l'analyse du portefeuille.
- **Traitement élément par élément** dans la feuille de travail : statut et commentaire par facture ou opération, action groupée, éléments traités masquables ; liens avec les écritures proposées et les pièces à demander.
- **Situation à période égale** : comparaison avec la même période de l'exercice précédent (le FEC N-1 est coupé à la même date), projection du résultat de fin d'exercice et charges annuelles à étaler.
- **Portefeuille FEC** (bouton sur la page Dossiers et dans l'analyse) : plusieurs FEC en une fois, rattachés par SIREN, classés par charge de révision, ouverture directe sur la demande de pièces du mois, synthèses enregistrées en un clic, export Excel.
- **Officines (pharmacies)** : l'activité est une caractéristique du dossier (fiche du dossier, « Activité (analyse FEC) »), à défaut détectée sur le contenu du FEC ; un écart entre la fiche et le FEC est signalé. Le profil officine gère le tiers payant (encours AMO / AMC / patients par ancienneté, rejets exacts si les 411 sont lettrés, estimés sinon), le CA et la TVA par taux (2,1 %, 5,5 %, 10 %, 20 %), le taux de marque, les remises fournisseurs, les écarts de caisse, traite les 511 comme des comptes de transit et ajoute les pièces propres à l'officine (inventaire LGO, relevés de tiers payant, RFA, ROSP).
- **Imputation sur le bon compte de tiers** (bêta) : factures et règlements passés sur un autre fournisseur ou client (libellé désignant un autre tiers, ou règlement du montant exact d'une facture non réglée d'un autre tiers), avec écriture de reclassement proposée.
- **Contrôle de la TVA du mois ou du trimestre** depuis le FEC (bêta, à valider sur vos dossiers) : brouillon de déclaration CA3 (bases et TVA par taux, exportations, livraisons intracommunautaires, autoliquidation, TVA déductible, crédit), rapprochement avec l'écriture de liquidation et le paiement (TVA restée en compte après la déclaration, paiement différent), contrôles (taux, ventes sans TVA, autoliquidation non déduite, véhicules de tourisme, hébergement, cadeaux, carburants, TVA sur encaissements…), comparaison avec les montants télédéclarés, concordance sur l'exercice, validation qui coche l'étape de la mission TVA du mois.
- **Travail relié au suivi** : une demande de pièces soldée coche « Pièces reçues » dans la TVA ou la saisie du mois, la situation ou le bilan ; les cycles revus dans la feuille de travail cochent « Révision des comptes » du bilan ; la mission « Revue FEC » suit les points traités. Le portefeuille choisi au tableau de bord (« Mes dossiers ») s'applique aux missions, au suivi mensuel et au calendrier. Un modèle de mission modifié peut être appliqué aux missions en cours.
- **Archive Pennylane FEC + justificatifs** (.zip) : déposée telle quelle dans l'analyse FEC ou le portefeuille, elle est lue localement par morceaux. Seuls les noms des justificatifs sont lus pour retrouver, par n° de pièce, les écritures sans justificatif : la synthèse les liste par nature (achats, ventes, paiements directs) et les demandes au client et aux fournisseurs citent les factures exactes. Si les noms des fichiers ne permettent pas le rapprochement, l'application l'indique et conserve les estimations.
- **Pièces à demander** (depuis le FEC, pour une situation ou un bilan) : relevés manquants, factures récurrentes absentes, paiements sans facture, opérations en 471, immobilisations, paie, check-list de clôture et questions au client. Un clic prépare le mail et crée une mission dont chaque étape est une pièce ; la relance ne liste que ce qui manque encore.
- **Revue analytique N / N-1** : comparaison de deux FEC par poste et par compte, variations significatives à justifier (vos commentaires sont conservés dans le dossier), contrôles de cohérence (TVA / CA, social, amortissements, intérêts, capitaux propres inférieurs à la moitié du capital, points fiscaux). Une **note de synthèse** s'imprime ou s'enregistre en PDF pour le rendez-vous bilan.
- **Rapprochement bancaire** : import du relevé (CFONB 120 / EBICS, OFX, CAMT.053, CSV ou Excel), puis appariement automatique avec le compte de banque du FEC (dates proches, regroupements), état de rapprochement et opérations non comptabilisées ajoutées aux pièces à demander.
- **Import du classeur du cabinet** : INFO DOSSIER, SUIVI TVA, SUIVI RÉVISION (vos étapes de bilan), SUIVI SITUATION, SUIVI DÉCLARATION et SUIVI SAISIE en une fois, avec un filtre (ex. CJ = ABC). Les onglets d'identifiants ne sont jamais lus, et le réimport ne crée aucun doublon.
- **Aide intégrée** dans l'application. Les fonctions marquées **bêta** n'ont pas encore été validées sur de vrais dossiers : leurs résultats sont à contrôler.
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
js/archive-reader.js  lecture locale des archives .zip FEC + justificatifs (noms des fichiers uniquement)
js/bank-reader.js     lecture locale des relevés bancaires (CFONB 120, OFX, CAMT.053, CSV, Excel)
js/app/               application, en modules chargés dans l'ordre (voir js/app/README.md)
tests/                tests de bout en bout sur données fictives (voir tests/README.md)
sw.js                 service worker (fonctionnement hors ligne)
manifest.webmanifest  installation comme application
```

- Aucune bibliothèque tierce, aucun appel réseau hors du domaine de l'application.
- Les données déchiffrées n'existent qu'en mémoire, et sont effacées au verrouillage.
- Chaque enregistrement est rechiffré avec un vecteur d'initialisation neuf ; l'intégrité est garantie par AES-GCM.
- Les exports CSV sont protégés contre l'injection de formules dans les tableurs.
