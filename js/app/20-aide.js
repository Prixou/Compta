/*
 * Suivi Dossiers — Aide.
 * Scripts chargés dans l'ordre par index.html ; ils partagent la portée globale (voir js/app/README.md).
 */
'use strict';

// ---------------------------------------------------------------------------
// Aide
// ---------------------------------------------------------------------------

function viewAide() {
  const item = (title, html, open) => `<details class="card help"${open ? ' open' : ''}><summary><h2>${title}</h2></summary><div class="help-body">${html}</div></details>`;
  return `
    <div class="page-head"><h1>Aide</h1></div>
    ${item('Premiers pas', `<ol>
      <li><strong>Paramètres</strong> : renseignez le nom du cabinet, votre prénom, vos collaborateurs et votre signature.</li>
      <li><strong>Dossiers → Importer</strong> : importez votre tableau Excel de suivi (ou créez les dossiers un par un).</li>
      <li><strong>Calendrier fiscal</strong> : créez en un clic les échéances de l'année de tous vos dossiers.</li>
      <li><strong>Sauvegarde</strong> : activez la sauvegarde automatique (sur ordinateur) ou exportez une sauvegarde chiffrée chaque semaine.</li>
    </ol>`, true)}
    ${item('Au quotidien', `<ul>
      <li>Le <strong>tableau de bord</strong> liste ce qui est en retard, les échéances des 14 prochains jours, les clients à relancer et les missions à valider. Choisissez « Mes dossiers » pour ne voir que votre portefeuille : ce choix s'applique aussi aux missions, au suivi mensuel et au calendrier fiscal.</li>
      <li>Cliquez sur une mission pour cocher ses étapes : elle passe « en cours » à la première étape cochée, et « terminée » à la dernière. Le bouton <strong>✓ Terminée</strong> valide tout d'un coup.</li>
      <li>Les missions récurrentes (TVA, paie, acomptes…) créent automatiquement l'occurrence suivante lorsqu'elles sont terminées.</li>
      <li><strong>Étapes cochées automatiquement</strong> (signalées « automatique » dans la mission et notées au journal du dossier) : quand une demande de pièces issue du FEC est entièrement reçue, l'étape « Pièces reçues » de la TVA ou de la saisie du mois, de la situation ou du bilan est cochée ; quand les quatre cycles sont marqués « revus » dans la feuille de travail, l'étape « Révision des comptes » du bilan (ou de la situation) l'est aussi ; la mission « Revue FEC » suit les points traités dans la feuille de travail.</li>
      <li>Paramètres → <strong>Modèles de missions</strong> : si vous modifiez les étapes d'un modèle, l'application propose de mettre à jour les missions en cours qui ont encore les anciennes étapes (les étapes cochées le restent).</li>
    </ul>`)}
    ${item('Importer le classeur du cabinet', `<p>Dossiers → <strong>Importer</strong>, puis choisissez votre classeur de suivi. S'il contient les onglets INFO DOSSIER, SUIVI TVA, SUIVI RÉVISION, SUIVI SITUATION, SUIVI DÉCLARATION ou SUIVI SAISIE, ils sont tous repris en une fois :</p>
      <ul>
        <li>filtre sur une colonne (ex. <strong>CJ = ABC</strong>), proposé automatiquement si votre prénom ou trigramme figure dans le fichier ;</li>
        <li>les bilans reprennent vos propres étapes de révision (saisie, pointages… envoi EDI, BAT, FN), et une étape cochée coche les précédentes ;</li>
        <li>OK ou montant = fait ; case hachurée, N/A, DISP ou EUX = non applicable ;</li>
        <li>les onglets contenant des identifiants et mots de passe (DGFIP, URSSAF, EBICS) ne sont jamais lus ;</li>
        <li>réimportez le classeur quand vous voulez : rien n'est dupliqué, et aucune case cochée dans l'application n'est décochée.</li>
      </ul>`)}
    ${item('Suivi mensuel (grille)', `<ul>
      <li>Reproduit votre tableau Excel : un dossier par ligne, un mois par colonne. Filtrez par type de mission, régime de TVA (mensuel, trimestriel, CA12) et responsable.</li>
      <li><strong>Tri</strong> : cliquez sur un titre de colonne (N°, Dossier, TVA, Jour) ou choisissez « Trier par » (clôture, responsable, retards et avancement) ; un second clic inverse l'ordre. Le tri est conservé.</li>
      <li><strong>Étapes</strong> (mode par défaut) : un clic sur une case affiche les étapes de la mission ; cliquez sur une étape faite pour la cocher (les précédentes le sont aussi), recliquez pour la décocher. Pour la TVA, <strong>banque importée</strong>, <strong>banque affectée</strong>, <strong>saisie des ventes</strong> et <strong>saisie des achats</strong> se cochent séparément, dans l'ordre où vous les faites (« Banque affectée » coche aussi « Banque importée »). La case indique la dernière étape faite (« Bq import », « Bq affect », « Ventes », « Achats », puis « Saisie » quand les quatre sont faites), et la dernière étape termine la mission. La fenêtre des étapes reste ouverte pour en cocher plusieurs d'affilée (✕, Échap ou un clic à côté pour la fermer). Survolez une case pour voir toutes les étapes.</li>
      <li>Si une <strong>demande de pièces du mois</strong> (analyse FEC mensuelle) est en cours, la fenêtre des étapes l'indique avec le nombre de pièces encore attendues.</li>
      <li><strong>Pointage rapide</strong> : un clic sur une case la passe à OK, un second clic annule, comme dans Excel.</li>
      <li><strong>Exporter en Excel</strong> produit un fichier réimportable (attention : non chiffré).</li>
    </ul>`)}
    ${item('Calendrier fiscal', `<p>Le bouton <strong>Calendrier fiscal</strong> (tableau de bord, missions, suivi mensuel ou fiche dossier) crée les échéances de l'année selon la forme, le régime de TVA, le régime fiscal et la date de clôture de chaque dossier : TVA, CA12 et acomptes, acomptes et solde d'IS, bilan et liasse, approbation des comptes, CFE. Les dates sont reportées au jour ouvré suivant.</p>
      <p class="muted">Les dates sont <strong>indicatives</strong> : vérifiez-les avec le calendrier fiscal officiel. Renseignez le régime fiscal des dossiers pour affiner (l'IS est présumé pour les SARL, SAS, SASU, SA, SELARL, SELAS).</p>`)}
    ${item('Relancer un client', `<ul>
      <li>Depuis une mission ou un dossier, <strong>Écrire au client</strong> prépare un message : demande de documents, relance ou envoi pour validation.</li>
      <li>La liste des documents reprend les étapes non cochées de la mission (« Pièces reçues », « Relevés bancaires reçus »…).</li>
      <li>« Copier le message » ou « Ouvrir dans ma messagerie » : l'envoi est noté dans le journal du dossier et la mission passe « en attente du client ».</li>
      <li>Sans réponse après le délai choisi dans les paramètres (7 jours par défaut), la mission apparaît dans <strong>À relancer</strong>.</li>
    </ul>`)}
    ${item('Analyse FEC', `<ul>
      <li>Menu <strong>Analyse FEC</strong> : déposez le fichier des écritures comptables (.txt) d'un dossier. Il est analysé sur l'appareil, sans envoi ni conservation.</li>
      <li><strong>Archive Pennylane (.zip FEC + justificatifs)</strong> : déposez directement l'archive exportée. Le FEC est extrait et seuls les <em>noms</em> des justificatifs sont lus (les fichiers ne sont pas ouverts) : les écritures sans justificatif sont listées exactement dans la synthèse, et les pièces à demander (client, mensuel, mails fournisseurs) citent ces factures précises au lieu d'estimations. Si les noms de fichiers ne reprennent pas les n° de pièce, l'application le signale et revient aux estimations.</li>
      <li><strong>Conformité</strong> : les contrôles de l'article A47 A-1 du LPF (colonnes, dates, équilibre, numérotation…), avec des exemples de lignes en cause.</li>
      <li><strong>Points de révision</strong> : caisse créditrice, comptes d'attente, clients créditeurs, fournisseurs débiteurs, compte courant d'associé débiteur, doublons, dimanches et jours fériés, loi de Benford.</li>
      <li>SIG, bilan simplifié, balance, graphiques mensuels, journaux et tiers ; export Excel complet.</li>
      <li><strong>Imputation sur le bon compte de tiers</strong> (onglets Achats et Clients, Trésorerie pour une pharmacie) : factures et règlements passés sur un autre fournisseur ou client que le leur, repérés par le libellé (il désigne un autre tiers et ne ressemble pas aux libellés habituels du compte) ou par le montant (règlement sans facture de ce montant sur son compte, mais du montant exact d'une facture d'un autre tiers, non réglée). Chaque cas se traite un par un, et l'écriture de reclassement entre les deux comptes est proposée dans l'onglet Écritures.</li>
      <li><strong>Contrôle de la TVA</strong> (onglet TVA), pour le mois ou le trimestre choisi :
        <ul>
          <li><strong>brouillon de déclaration CA3</strong> reconstitué depuis les écritures : ventes par taux (taux lu sur les comptes de TVA, sinon déduit de chaque écriture, écritures à plusieurs taux ventilées), exportations, livraisons intracommunautaires, autoliquidation (lignes 2A, 03, 17), TVA déductible sur immobilisations et autres biens et services, crédit reporté, TVA nette ou crédit ;</li>
          <li><strong>comptes de TVA de la période</strong> (solde d'ouverture, mouvements des opérations, liquidation, paiement, solde de fin) à comparer avec la balance de votre logiciel, et export Excel de toutes les lignes de TVA pour retrouver un écart ; la TVA restée en compte des mois précédents est reprise en reliquat, comme dans une déclaration établie sur les soldes ;</li>
          <li><strong>rapprochement</strong> avec l'écriture de liquidation comptabilisée et le paiement à la DGFiP : TVA restée en compte après la déclaration (factures saisies après le dépôt), paiement différent du montant dû, crédit de TVA ;</li>
          <li><strong>contrôles</strong> : taux non identifiés ou différents du compte de vente, ventes sans TVA à justifier, autoliquidation non déduite, TVA déduite sur véhicules de tourisme, hébergement, cadeaux, dépenses personnelles, carburants (80 %), TVA sur immobilisations mal ventilée, factures sans TVA, TVA sur les encaissements pour les prestations de services, crédit remboursable ;</li>
          <li>saisissez les <strong>montants télédéclarés</strong> pour les comparer à la comptabilité ; le tableau de <strong>concordance</strong> récapitule chaque période de l'exercice (calculé, liquidé, déclaré) ;</li>
          <li><strong>Valider le contrôle</strong> le note au journal du dossier et coche l'étape « Contrôle et calcul de la TVA » de la mission TVA du mois. Les points se traitent un par un comme dans les cycles ; « Ne plus signaler » vaut pour tous les mois du dossier. Export Excel et impression PDF.</li>
        </ul></li>
      <li><strong>Cycles de révision</strong> (onglets Achats, Charges externes, Clients, Trésorerie) : chaque cycle a ses indicateurs (comparés à N-1 si le FEC précédent est chargé), ses contrôles et ses tableaux.
        <ul>
          <li><strong>Achats</strong> : factures en double, dettes échues, délais de paiement réels (lettrage, ou règlements imputés sur les factures les plus anciennes), TVA déductible anormale ou absente, autoliquidation, pièces hors exercice, factures non parvenues, nouveaux fournisseurs.</li>
          <li><strong>Charges externes</strong> : tableau par compte avec les mois mouvementés, charges récurrentes manquantes, charges constatées d'avance probables, bénéficiaires DAS2, dépenses personnelles possibles, amendes, cadeaux, notes de frais.</li>
          <li><strong>Clients</strong> : trous et doublons dans la numérotation des factures, créances échues et dépréciation, délais d'encaissement, factures sans TVA, facturation de fin d'exercice, factures à établir et produits constatés d'avance de N-1 non extournés.</li>
          <li><strong>Trésorerie</strong> : découverts, espèces de 1 000 € ou plus, caisse, virements internes non soldés, comptes dormants, flux par nature et mouvements importants.</li>
          <li>Les tableaux des délais de paiement de l'article D441-6 du code de commerce sont calculés pour les clients et les fournisseurs (échéance réglable).</li>
        </ul></li>
      <li><strong>Feuille de travail</strong> : chaque point de contrôle reçoit un statut (justifié, corrigé, pièce demandée, sans objet) et un commentaire ; « Marquer le cycle comme revu » signe la revue. Tout est conservé, chiffré, dans le dossier, et une nouvelle analyse du même exercice reprend où vous en étiez. « Dossier de travail (PDF) » imprime l'ensemble.</li>
      <li><strong>Élément par élément</strong> : dépliez un contrôle pour traiter chaque facture, dépense ou opération (statut et commentaire), ou tous ceux encore à traiter en une fois ; « Masquer les éléments traités » allège la liste. Un élément justifié ou sans objet écarte l'écriture proposée correspondante, et un élément en « pièce demandée » s'ajoute aux pièces à demander.</li>
      <li><strong>Mémoire du dossier</strong> : « Justifié » sur un élément (ex. un abonnement validé) ou « Ne plus signaler » sur un contrôle : il ne sera plus remonté lors des analyses suivantes de ce dossier, y compris l'année prochaine. La liste se gère depuis la fiche du dossier (Mémoire de révision).</li>
      <li><strong>Écritures</strong> : les écritures de clôture sont proposées à partir des contrôles (charges et produits constatés d'avance, extournes oubliées de l'exercice précédent, dépréciation des créances échues, annulation des factures en double, reclassement des amendes, TVA sur cadeaux, autoliquidation, impôt sur les sociétés estimé, et pour une situation les charges annuelles au prorata). Ajustez les montants et les contreparties, puis exportez le fichier pour <strong>ACD</strong> ou <strong>Pennylane</strong> (format FEC, Excel ou CSV). Faites un premier import sur un dossier test.</li>
      <li><strong>Situation</strong> : avec le FEC N-1, la situation est comparée à la <strong>même période</strong> de l'exercice précédent, et une projection du résultat de fin d'exercice est calculée, avec les charges annuelles absentes de la situation.</li>
      <li><strong>Portefeuille</strong> : sélectionnez les FEC de plusieurs dossiers en une fois ; ils sont analysés l'un après l'autre, rattachés par SIREN et classés par charge de révision (anomalies, points à traiter, pièces, écritures).</li>
      <li><strong>Demande mensuelle</strong> : Pièces à demander → « Mois », choisissez le mois. L'application liste, pour les achats et les ventes, les factures des fournisseurs et clients habituels absentes, les règlements et encaissements sans facture, les dépenses payées directement, les numéros de facture manquants et les opérations à identifier. Envoyez la demande dès la saisie du mois : la situation et le bilan seront prêts plus vite. Le Portefeuille indique ce nombre pour chaque dossier.</li>
      <li><strong>Demandes directes aux fournisseurs</strong> (sous les pièces à demander) : pour chaque laboratoire, grossiste ou fournisseur dont des factures manquent, un mail avec le n° de compte client du dossier chez lui, la dénomination et la période, qui demande le duplicata des factures et un relevé de compte. Le n° client et l'e-mail sont conservés dans le dossier. Le FEC ne contient pas les pièces jointes : seules les écritures sont analysées.</li>
      <li><strong>Pièces à demander</strong> : choisissez « Situation » ou « Bilan » et la date d'arrêté ; l'application liste les relevés bancaires manquants, les factures récurrentes absentes, les paiements sans facture, les opérations à identifier (471), les acquisitions d'immobilisations, les mois de paie manquants et, pour un bilan, les documents de clôture et les questions sur les créances et dettes anciennes. « Créer la demande » prépare le mail et une mission dont chaque étape est une pièce : cochez-les à réception, la relance ne reprendra que ce qui manque.</li>
      <li><strong>Revue N / N-1</strong> : chargez aussi le FEC de l'exercice précédent. Les postes et les comptes sont comparés, et les variations au-delà du seuil de signification sont listées pour que vous les justifiez. Contrôles de cohérence automatiques : TVA / CA, charges sociales / salaires, amortissements, intérêts, capitaux propres, points fiscaux. La <strong>note de synthèse</strong> s'imprime ou s'enregistre en PDF pour le rendez-vous bilan.</li>
      <li><strong>Rapprochement</strong> : importez le relevé bancaire (CFONB / EBICS, OFX, CAMT.053, CSV ou Excel de la banque). L'application affiche les opérations non comptabilisées, les écritures absentes du relevé et l'état de rapprochement. Les opérations non comptabilisées s'ajoutent aux pièces à demander.</li>
      <li><strong>Deux analyseurs</strong> : « Structure classique » et « Pharmacie », chacun avec son propre FEC en cours (passer de l'un à l'autre ne perd rien). Si un FEC d'officine est déposé dans l'analyseur classique, l'application propose de basculer.</li>
      <li><strong>Pharmacie</strong> : onglet <strong>Tiers payant</strong> (encours AMO, AMC et patients, ancienneté, rejets probables : précis si les comptes 411 sont lettrés, estimés d'après les délais normaux de paiement sinon), onglet <strong>CA et TVA</strong> par taux (2,1 %, 5,5 %, 10 %, 20 %), taux de marque, remises fournisseurs, écarts de caisse. Les comptes 511 (CB, chèques à encaisser) sont traités comme des comptes de transit, et les alertes inadaptées à une officine (Benford, clients créditeurs, ouverture le dimanche) sont retirées. Les pièces à demander ajoutent l'inventaire du LGO, les relevés de tiers payant et de rejets, les RFA et la ROSP.</li>
      <li>Rattachez l'analyse au dossier (reconnu par son SIREN) pour en garder la synthèse, et créez en un clic une <strong>mission de revue</strong> dont les étapes sont les points relevés.</li>
    </ul>`)}
    ${item('Rappels dans votre agenda', `<p>Paramètres → <strong>Échéances dans mon agenda</strong> : téléchargez un fichier .ics et ouvrez-le avec votre agenda pour être prévenu même application fermée. Par défaut, seuls les numéros de dossier apparaissent dans l'agenda.</p>`)}
    ${item('PC et téléphone', `<p>Chaque appareil possède son propre coffre chiffré ; il n'y a volontairement aucun serveur. Pour retrouver vos données sur un autre appareil : exportez une sauvegarde chiffrée, puis <strong>Restaurer une sauvegarde</strong> sur l'autre appareil avec le même mot de passe. La sauvegarde automatique placée dans un dossier synchronisé du cabinet facilite ce transfert.</p>`)}
    ${item('Sécurité et secret professionnel', `<ul>
      <li>Les données sont chiffrées (AES-256) et ne quittent jamais l'appareil. Aucun compte, aucun serveur, aucun traceur.</li>
      <li>Le <strong>mode discret</strong> (icône œil) remplace les noms par les numéros de dossier : utile en rendez-vous ou en déplacement.</li>
      <li>L'application se verrouille seule après quelques minutes d'inactivité. Sans le mot de passe, <strong>personne</strong> ne peut lire les données, pas même vous : notez-le en lieu sûr.</li>
      <li>Sur un appareil personnel protégé par un code, Paramètres → <strong>Ne plus demander le mot de passe sur cet appareil</strong> ouvre l'application directement. Les données restent chiffrées sur le disque, mais quiconque accède à votre session peut les lire. Le mot de passe reste nécessaire pour restaurer une sauvegarde.</li>
      <li>Les exports Excel et CSV ne sont pas chiffrés : supprimez-les après usage.</li>
    </ul>`)}`;
}
