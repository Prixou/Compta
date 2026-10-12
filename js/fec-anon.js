/*
 * Anonymisation d'un Fichier des Écritures Comptables (FEC), pour l'envoyer à un tiers (support, mise au point de
 * l'application sur de vrais fichiers) sans donnée permettant d'identifier le client ni ses propres clients.
 *
 * Exécuté dans un Web Worker : le fichier est lu et transformé sur l'appareil, sans jamais être envoyé ni conservé.
 * Reçoit { buffer, fileName, opts } ; renvoie { type: 'done', bytes, text, fileName, report } ou { type: 'error', message }.
 *
 * Deux modes (opts.mode) :
 *  - « clients » (par défaut) : seuls les noms des clients (factures de vente, encaissements, comptes 41), des personnes
 *    (salariés, associés, gérant : comptes 42, 455…, salaires, notes de frais) et du dossier lui-même sont remplacés ;
 *    les fournisseurs et le reste des libellés sont conservés ;
 *  - « tout » : tout mot absent du dictionnaire comptable est remplacé, fournisseurs compris.
 * Dans les deux cas : remplacement cohérent dans tout le fichier (un même nom devient partout le même pseudonyme),
 * IBAN, téléphones, e-mails, sites, SIREN / SIRET et numéros longs masqués, SIREN du nom de fichier remplacé, montants
 * modifiés en option (coefficient aléatoire unique, chaque écriture restant équilibrée). Structure, encodage, séparateur et
 * fins de ligne d'origine conservés. La correspondance n'est jamais enregistrée : l'opération n'est pas réversible.
 */
'use strict';

self.onmessage = (e) => {
  try {
    const r = anonymizeFec(e.data.buffer, e.data.fileName || '', e.data.opts || {});
    self.postMessage(Object.assign({ type: 'done' }, r), [r.bytes.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || String(err) });
  }
};

// ---------- Dictionnaire : mots conservés (majuscules, sans accents) ----------
// Vocabulaire du plan comptable, des libellés bancaires et de la paie, mois, formes juridiques, organismes, enseignes
// nationales (fournisseurs courants, utiles à l'analyse : carburant, hôtels, dépenses personnelles…). Mots de 3 lettres
// et plus : les mots plus courts sont toujours conservés. Pas de mot qui soit aussi un nom de famille courant (Leclerc,
// Picard, Boulanger, Petit…) : un client de ce nom resterait visible.
const KEEP = new Set(`
CAPITAL SOCIAL RESERVE RESERVES LEGALE STATUTAIRES REGLEMENTEES AUTRE AUTRES REPORT NOUVEAU NOUVEAUX NOUVELLE RESULTAT RESULTATS
EXERCICE EXERCICES BENEFICE BENEFICES PERTE PERTES SUBVENTION SUBVENTIONS INVESTISSEMENT INVESTISSEMENTS PROVISION PROVISIONS
RISQUE RISQUES CHARGE CHARGES EMPRUNT EMPRUNTS DETTE DETTES ETABLISSEMENT ETABLISSEMENTS CREDIT CREDITS DEPOT DEPOTS
CAUTIONNEMENT CAUTIONNEMENTS RECU RECUS RECUE VERSE VERSES VERSEE VERSEMENT VERSEMENTS COMPTE COMPTES COURANT COURANTS
ASSOCIE ASSOCIES ASSOCIEE GROUPE IMMOBILISATION IMMOBILISATIONS INCORPORELLE INCORPORELLES CORPORELLE CORPORELLES FINANCIERE
FINANCIERES FINANCIER FINANCIERS FRAIS RECHERCHE DEVELOPPEMENT CONCESSION CONCESSIONS BREVET BREVETS LICENCE LICENCES MARQUE
MARQUES LOGICIEL LOGICIELS FONDS COMMERCIAL COMMERCIALE DROIT DROITS BAIL BAUX TERRAIN TERRAINS CONSTRUCTION CONSTRUCTIONS
BATIMENT BATIMENTS INSTALLATION INSTALLATIONS TECHNIQUE TECHNIQUES MATERIEL MATERIELS OUTILLAGE OUTILLAGES INDUSTRIEL
INDUSTRIELS INDUSTRIELLE TRANSPORT TRANSPORTS BUREAU BUREAUX INFORMATIQUE MOBILIER AGENCEMENT AGENCEMENTS AMENAGEMENT
AMENAGEMENTS DIVERS DIVERSE DIVERSES COURS AVANCE AVANCES ACOMPTE ACOMPTES ACCOMPTE PARTICIPATION PARTICIPATIONS TITRE TITRES
IMMOBILISES PRET PRETS CREANCE CREANCES RATTACHEES AMORTISSEMENT AMORTISSEMENTS AMORT DEPRECIATION DEPRECIATIONS STOCK STOCKS
STOCKE STOCKES STOCKEE STOCKEES MATIERE MATIERES PREMIERE PREMIERES FOURNITURE FOURNITURES CONSOMMABLE CONSOMMABLES PRODUIT
PRODUITS INTERMEDIAIRE INTERMEDIAIRES FINIS MARCHANDISE MARCHANDISES EMBALLAGE EMBALLAGES PERDUS RECUPERABLES FOURNISSEUR
FOURNISSEURS FOURN FRS CLIENT CLIENTS CLIENTELE DOUTEUX LITIGIEUX EFFET EFFETS PAYER RECEVOIR FACTURE FACTURES FACTURATION
PARVENUE PARVENUES NON ETABLIR PERSONNEL REMUNERATION REMUNERATIONS DUES CONGE CONGES PAYES ORGANISME ORGANISMES SOCIAUX
SOCIALE SOCIALES SECURITE ETAT IMPOT IMPOTS TAXE TAXES SOCIETE SOCIETES TVA VALEUR VALEURS AJOUTEE DECAISSER DECAISSEMENT
DECAISSEMENTS COLLECTEE COLLECTEES COLLECTE DEDUCTIBLE DEDUCTIBLES SUR BIEN BIENS SERVICE SERVICES ENCAISSEMENT ENCAISSEMENTS
DEBIT DEBITS INTRACOMMUNAUTAIRE INTRACOMMUNAUTAIRES AUTOLIQUIDEE AUTOLIQUIDATION REGULARISER REGULARISATION REGULARISATIONS
REPORTER REMBOURSEMENT REMBOURSEMENTS REMB DEMANDE DEMANDER CHIFFRE AFFAIRES ATTENTE IMPUTER TRANSITOIRE TRANSITOIRES
DEBITEUR DEBITEURS CREDITEUR CREDITEURS CONSTATEE CONSTATEES CONSTATES MOBILIERE MOBILIERES IMMOBILIERE IMMOBILIERES PLACEMENT
PLACEMENTS ACTION ACTIONS OBLIGATION OBLIGATIONS BANQUE BANQUES CAISSE CAISSES VIREMENT VIREMENTS INTERNE INTERNES REMISE REMISES
CHEQUE CHEQUES ENCAISSER REGIE REGIES ACHAT ACHATS VENTE VENTES VARIATION VARIATIONS SOUS TRAITANCE GENERALE GENERAL GENERALES
LOCATION LOCATIONS LOCATIVE LOCATIVES COPROPRIETE ENTRETIEN REPARATION REPARATIONS MAINTENANCE PRIME PRIMES ASSURANCE ASSURANCES
MULTIRISQUE MULTIRISQUES ETUDE ETUDES DOCUMENTATION SEMINAIRE SEMINAIRES CONFERENCE CONFERENCES EXTERIEUR INTERIMAIRE INTERIM
DETACHE HONORAIRE HONORAIRES COMMISSION COMMISSIONS COURTAGE COURTAGES ACTES CONTENTIEUX PUBLICITE PUBLICATION PUBLICATIONS
RELATION RELATIONS PUBLIQUE PUBLIQUES ANNONCE ANNONCES INSERTION INSERTIONS ECHANTILLONS FOIRE FOIRES EXPOSITION EXPOSITIONS
CATALOGUE CATALOGUES IMPRIMES CADEAU CADEAUX POURBOIRES DONS MECENAT COLLECTIFS DEPLACEMENT DEPLACEMENTS MISSION MISSIONS
RECEPTION RECEPTIONS VOYAGE VOYAGES POSTAUX TELECOMMUNICATIONS TELECOM TELECOMS TELEPHONE TELEPHONIE INTERNET BANCAIRE BANCAIRES
ASSIMILE ASSIMILES ASSIMILEE ASSIMILEES COTISATION COTISATIONS COTIS CONCOURS APPRENTISSAGE APPRENTI APPRENTIS FORMATION
FORMATIONS PROFESSIONNEL PROFESSIONNELLE PROFESSIONNELS PROFESSIONNELLES PROFESSIO PRO CONTINUE FONCIERE FONCIERES CONTRIBUTION
CONTRIBUTIONS ECONOMIQUE TERRITORIALE VEHICULE VEHICULES CARTE CARTES GRISE GRISES SALAIRE SALAIRES APPOINTEMENTS INDEMNITE
INDEMNITES AVANTAGE AVANTAGES NATURE SUPPLEMENT FAMILIAL URSSAF MUTUELLE MUTUELLES PREVOYANCE RETRAITE RETRAITES COMPLEMENTAIRE
COMPLEMENTAIRES CHOMAGE POLE EMPLOI MEDECINE TRAVAIL TRAVAUX PHARMACIE OEUVRES EXPLOITANT EXPLOITATION GESTION REDEVANCE
REDEVANCES PENALITE PENALITES AMENDE AMENDES IRRECOUVRABLE IRRECOUVRABLES INTERET INTERETS ESCOMPTE ESCOMPTES ACCORDE ACCORDES
OBTENU OBTENUS CHANGE DIFFERENCE DIFFERENCES POSITIVE POSITIVES NEGATIVE NEGATIVES CESSION CESSIONS ELEMENT ELEMENTS ACTIF ACTIFS
PASSIF CEDES CEDE EXCEPTIONNEL EXCEPTIONNELS EXCEPTIONNELLE EXCEPTIONNELLES DOTATION DOTATIONS REPRISE REPRISES TRANSFERT
TRANSFERTS PRODUCTION IMMOBILISEE PRESTATION PRESTATIONS RABAIS RISTOURNE RISTOURNES PORT ACCESSOIRE ACCESSOIRES ANNEXE ANNEXES
ACTIVITE ACTIVITES MANDAT MANDATS TROP PERCU PERCUS DEBOURS REFACTURATION REFACTURE AIDE AIDES OPERATION OPERATIONS COMMUN
COMMUNE COMMUNES QUOTE PART PARTS SALARIE SALARIES SALARIAL SALARIALE PATRONAL PATRONALE PATRONALES DIRIGEANT DIRIGEANTS GERANT
GERANTS GERANCE PRESIDENT EXPLOITANTS CONJOINT PRELEVEMENT PRELEVEMENTS PERSONNELS PERSONNELLE PERSONNELLES
FACT FAC FCT AVOIR AVOIRS AVO AVR REGLEMENT REGLEMENTS REGLT RGLT REG RGL PAIEMENT PAIEMENTS PAYE PAYEE PAYES PRLV PRELEV PREL
PRL VIR VRT INST INSTANTANE INSTANTANES SEPA EMIS EMISE RECUE CARTE WEB RETRAIT RETRAITS DAB ESPECE ESPECES CHQ ABONNEMENT
ABONNEMENTS ABO ECHEANCE ECHEANCES ECHEANCIER MENSUALITE MENSUALITES TERME TERMES DOSSIER DOSSIERS TENUE OFFRE FORFAIT FORFAITS
PACK AGIOS DECOUVERT TPE LOYER LOYERS SOLDE SOLDES TOTAL PARTIEL PARTIELLE DEVIS COMMANDE COMMANDES CDE BON BONS LIVRAISON
LIVRAISONS NOTE NOTES REF REFERENCE REFERENCES NUMERO NUM CONTRAT CONTRATS POLICE ICS RUM LCC NBE NPY NBU IBE CPY CBE MMO LIB
EUR EURO EUROS TTC DONT TAUX MONTANT MONTANTS DATE DATES DES LES AUX POUR PAR AVEC SANS DANS ENTRE VERS CHEZ EST QUI QUE PLUS
MOINS TOUS TOUTES TOUT ANNEE ANNEES ANNUEL ANNUELLE ANNUELS MENSUEL MENSUELLE MENSUELS TRIMESTRE TRIMESTRES TRIMESTRIEL
TRIMESTRIELLE SEMESTRE SEMESTRIEL PERIODE PERIODES EXTOURNE EXTOURNES EXTOURNEE CCA PCA FNP FAE CAP AAR AAE CORRECTION ERREUR
ERREURS ANNULATION ANNULE ANNULEE DOUBLON RETOUR RETOURS INDEMNISATION SINISTRE FRANCHISE COMPTABLE COMPTABLES COMPTABILITE
EXPERT EXPERTISE COMMISSAIRE JURIDIQUE FISCAL FISCALE PAIE PAIES BULLETIN BULLETINS NET NETS NETTE BRUT BRUTS BRUTE KILOMETRIQUE
KILOMETRIQUES CARBURANT CARBURANTS CARBU GASOIL GAZOLE ESSENCE PEAGE PEAGES PARKING PARKINGS STATIONNEMENT TAXI TRAIN BILLET
BILLETS AVION HOTEL HOTELS RESTAURANT RESTAURANTS RESTAU RESTO REPAS BOULANGERIE TRAITEUR CAFE BAR BRASSERIE SUPERMARCHE
HYPERMARCHE MAGASIN BOUTIQUE STATION GARAGE AUTO AUTOS AUTOMOBILE PNEUS PNEUMATIQUES LAVAGE MOBILE BOX FIBRE ELECTRICITE GAZ
EAU EAUX ENERGIE ENERGIES ASSAINISSEMENT ORDURES MENAGERES POSTE COURRIER AFFRANCHISSEMENT COLIS RECOMMANDE TIMBRES PAPETERIE
LICENCE MATERIAU MATERIAUX OUTIL OUTILS QUINCAILLERIE BRICOLAGE NETTOYAGE ALARME TELESURVEILLANCE CONTROLE VISITE ADHESION
SYNDICAT CHAMBRE COMMERCE METIERS ARTISANAT GREFFE TRIBUNAL KBIS INPI JOURNAL JOURNAUX LEGALE LEGALES TRESOR PUBLIC FINANCES
DIRECTION SIE SIP DOUANE DOUANES SOURCE PAS DSN TICPE CSG CRDS MSA CPAM CAF CARSAT AGIRC ARRCO IRCANTEC CIPAV CARPIMKO CARMF
CARCDSF CAVP CNAVPL RSI SSI CNBF APEC OPCO FAF FAFCEA AGEFICE UNEDIC ASSEDIC DGFIP TVS CFE CVAE TAXES ACCISE ACCISES
JANVIER FEVRIER MARS AVRIL MAI JUIN JUILLET AOUT SEPTEMBRE OCTOBRE NOVEMBRE DECEMBRE JAN JANV FEV FEVR MAR AVR JUIL AOU SEP
SEPT OCT NOV DEC LUNDI MARDI MERCREDI JEUDI VENDREDI SAMEDI DIMANCHE JOUR JOURS MOIS SEMAINE SEMAINES
SARL SAS SASU EURL SCI SNC SCM SCP SELARL SELAS SELAFA SELCA SCEA GAEC EARL GIE SEL SPFPL SCOP SCA STE ETS ENTREPRISE ENTREPRISES
CIE COMPAGNIE CABINET ASSOCIATION FONDATION SYNDIC HOLDING
TRESORERIE OPERATIONS RECUPERATION INVENTAIRE CLOTURE OUVERTURE SITUATION SITUATIONS ODS BQE BQ CAI ACH VTE ANOUVEAU
OFFICINE TIERS PAYANT AMO AMC ROSP DISPENSATION GROSSISTE GROSSISTES REPARTITEUR LABORATOIRE LABORATOIRES LABO LABOS MEDICAMENT
MEDICAMENTS REMBOURSABLES PARAPHARMACIE ORDONNANCE ORDONNANCES PATIENT PATIENTS NOEMIE SPECIALITES GENERIQUES SANTE
MONSIEUR MADAME MADEMOISELLE MME MLLE MESSIEURS DOCTEUR MAITRE
UNE UNS CES CETTE CET LEUR LEURS NOTRE VOTRE NOS VOS DEUX TROIS QUATRE CINQ SIX HUIT NEUF DIX ONZE DOUZE VINGT CENT CENTS MILLE
DERNIER DERNIERE ANCIEN ANCIENNE GRANDE PETITE CENTRE NORD SUD EST OUEST RUE AVENUE BOULEVARD PLACE CHEMIN ROUTE
ZONE PARC QUAI ALLEE IMPASSE BIS TER DIRECT DIRECTE DIRECTS INTERNATIONAL INTERNATIONALE NATIONAL NATIONALE FRANCE FRANCAISE
EUROPE EUROPEENNE EXPORT IMPORT AUTRE PIECE PIECES ARTICLE ARTICLES SUITE DEBUT ACCORD COMPLEMENT COMPLEMENTS RAPPEL RAPPELS
ECART ECARTS ARRONDI ARRONDIS DIFFERENCE AJUSTEMENT AJUSTEMENTS PROVISOIRE DEFINITIF DEFINITIVE ESTIMATION FORFAITAIRE
ORANGE SFR BOUYGUES FREE SOSH EDF ENGIE ENEDIS GRDF VEOLIA SUEZ TOTALENERGIES ESSO SHELL AVIA AGIP DYNEFF CARREFOUR 
AUCHAN INTERMARCHE LIDL ALDI MONOPRIX FRANPRIX CASINO NETTO SUPER HYPER CASTORAMA BRICOMARCHE BRICO DEPOT WURTH MANUTAN RAJA
FNAC DARTY AMAZON PRIME CDISCOUNT GOOGLE MICROSOFT APPLE ADOBE OVH IONOS GANDI NETFLIX SPOTIFY DEEZER DISNEY CANAL
PAYPAL STRIPE SUMUP LYDIA QONTO SHINE REVOLUT BOURSORAMA SNCF RATP OUIGO TRANSAVIA EASYJET RYANAIR UBER BOLT BLABLACAR IBIS
NOVOTEL MERCURE ACCOR CAMPANILE KYRIAD BOOKING AIRBNB LOGIS MCDONALD MCDO KFC BURGER KING SUBWAY STARBUCKS AXA ALLIANZ GENERALI
MAAF MACIF MATMUT MAIF GMF GROUPAMA PACIFICA SWISSLIFE AVIVA ABEILLE COVEA HISCOX MALAKOFF HUMANIS HARMONIE APRIL KLESIA PROBTP
BTP CIBTP AGRICOLE CRCAM MUTUEL CIC LCL BNP PARIBAS EPARGNE POPULAIRE BRED POSTALE HSBC DIAC GRENKE LEASECOM CETELEM COFIDIS
SOFINCO FRANFINANCE DKV ULYS SANEF APRR VINCI AUTOROUTES AUTOROUTE ESCOTA COFIROUTE INDIGO EFFIA CHRONOPOST COLISSIMO DHL UPS
FEDEX GEODIS PLAYSTATION NINTENDO STEAM SEPHORA ZARA KIABI DECATHLON IKEA BIJOUTERIE COIFFEUR COIFFURE PARFUMERIE VETERINAIRE
CRECHE CINEMA UGC PATHE JOUET JOUETS CLUB MED CAMPING GOLF FITNESS BASIC FIT SALLE SPORT ESTHETIQUE PMU FDJ JEUX LOTO
CERP OCP ALLIANCE HEALTHCARE PHOENIX ASTERA GIPHAR GIROPHARM LEADER BIOGARAN SANDOZ TEVA ARROW MYLAN VIATRIS SANOFI PFIZER
ZENTIVA BOIRON AMENDE CONTRAVENTION ANTAI VERBAL PROCES MAJORATION RETARD HEBERGEMENT NUITEE NUITEES VOITURE VOITURES LEASING
LLD LOA FIOUL GPL STOCKABLE STOCKABLES ETC INV INVOICE CREDIT NOTE TRANSFER PAYMENT FEES SIRET SIREN TEL FAX PORTABLE EMAIL MAIL
COURRIEL CONTACT WWW HTTP HTTPS VIE IARD DECES INCENDIE ACCIDENT ACCIDENTS RESPONSABILITE CIVILE DECENNALE FLOTTE RCUR FRST OOFF
FNAL CORE MOTIF IBAN BIC EMETTEUR BENEFICIAIRE DONNEUR ORDRE OBJET LIBELLE COMMUNICATION APPORT APPORTS REMARQUE REMARQUES COMMENTAIRE
COMMENTAIRES OBSERVATION RECTIF RECTIFICATIF BRUT CONSULTATION CONSULTATIONS ACTE SOINS SOIN SEANCE SEANCES CHANTIER CHANTIERS
PLOMBERIE MENUISERIE MACONNERIE PEINTURE CHAUFFAGE CARRELAGE TOITURE TOITURES COUVERTURE ZINGUERIE CHARPENTE SERRURERIE VITRERIE
JARDINAGE PAYSAGE BOUCHERIE CHARCUTERIE PATISSERIE FLEURISTE IMPRIMERIE CONSEIL AUDIT ARCHITECTE NOTAIRE AVOCAT HUISSIER
GEOMETRE DIAGNOSTIC AMBULANCE ECOLE ELECTRICIEN PLOMBIER MENUISIER MACON PEINTRE COUVREUR COIFFEUR TRANSPORTS DEMENAGEMENT
LOCATAIRE PROPRIETAIRE FAMILLE SUCCESSION INDIVISION EPOUX CONSORTS VEUVE
PRIMAIRE MUTUALITE REGIME OBLIGATOIRE SECU CNMSS CAMIEG ENIM CAVIMAC CNAM NATIONALE MALADIE COMPLEMENTAIRE VIAMEDIS ALMERYS
SANTECLAIR ISANTE MGEN APICIL SWISS MNH CETIP ACTIL SEVEANE KALIVIA ITELIS UNEO MNT MFP PARTICULIER PARTICULIERS ARDOISE COMPTOIR
`.split(/\s+/).filter(Boolean));

// ---------- Utilitaires ----------

// Texte et encodage d'origine (UTF-8, avec ou sans BOM, ou ISO-8859-15), pour réécrire le fichier dans le même encodage.
function decode(buffer) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
    return { text: text.replace(/^﻿/, ''), encoding: 'UTF-8', bom: text.charCodeAt(0) === 0xfeff };
  } catch (e) {
    return { text: new TextDecoder('iso-8859-15').decode(buffer), encoding: 'ISO-8859-15', bom: false };
  }
}
// ISO-8859-15 : Latin-1, sauf huit positions (€, Š, š, Ž, ž, Œ, œ, Ÿ).
const LATIN9 = { 0x20ac: 0xa4, 0x160: 0xa6, 0x161: 0xa8, 0x17d: 0xb4, 0x17e: 0xb8, 0x152: 0xbc, 0x153: 0xbd, 0x178: 0xbe };
const LATIN9_OUT = (() => {
  const t = new Int16Array(65536).fill(0x3f);
  for (let c = 0; c < 256; c++) t[c] = c;
  [0xa4, 0xa6, 0xa8, 0xb4, 0xb8, 0xbc, 0xbd, 0xbe].forEach((c) => { t[c] = 0x3f; });
  Object.entries(LATIN9).forEach(([u, b]) => { t[Number(u)] = b; });
  return t;
})();
function encode(text, encoding, bom) {
  if (encoding !== 'ISO-8859-15') return new TextEncoder().encode((bom ? '\ufeff' : '') + text);
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = LATIN9_OUT[text.charCodeAt(i)];
  return out;
}
// Clé d'un mot (majuscules, sans accents) ; les mots reviennent des milliers de fois : résultat mis en cache.
const KEY_CACHE = new Map();
function keyOf(w) {
  let k = KEY_CACHE.get(w);
  if (k === undefined) {
    k = /^[\x00-\x7f]*$/.test(w) ? w.toUpperCase() : w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (KEY_CACHE.size > 300000) KEY_CACHE.clear();
    KEY_CACHE.set(w, k);
  }
  return k;
}

// Générateur pseudo-aléatoire initialisé par une graine (mulberry32) : mêmes pseudonymes pour une même graine.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Comptes de personnes physiques : compte de l'exploitant (108), personnel (421 à 427), associés et groupe (455 à 458),
// débiteurs et créditeurs divers (467).
const RE_PERSON_ACC = /^(108|42[1-7]|45[5-8]|467)/;
// Libellés de comptes ou d'écritures qui désignent une personne : gérant, associé, salaire, note de frais, indemnités kilométriques…
const RE_PERSON_LIB = /\b(GERANT|GERANTE|ASSOCIE|ASSOCIEE|DIRIGEANT|PRESIDENT|PRESIDENTE|SALARIE|SALARIEE|EXPLOITANT|SALAIRE|SALAIRES|PAIE|NDF|NOTES? DE FRAIS|IK|INDEMNITES? KILOMETRIQUES?|REMBOURSEMENT FRAIS|REMUNERATIONS?|STAGIAIRE|GRATIFICATION)\b/;
// Comptes nommés d'après un salarié (« MUTUELLE - DUPONT JEAN »)
const RE_PERSON_CLIB = /\bMUTUELLE\b/;
const REASONS = { client: 'client', vente: 'vente', encaissement: 'encaissement', personne: 'personne', prenom: 'personne (prénom ou civilité)', dossier: 'dossier', manuel: 'ajouté', autre: 'hors dictionnaire', strict: 'colonne ou ligne non standard' };
// Mots de deux lettres toujours conservés ; les autres (« LI », « NG »…) sont protégés dans un nom de client ou de personne.
const SHORT_KEEP = new Set('DE DU LA LE LES EN ET AU UN SA SC SE SL SN ST OU ON NO NR MR ME MM DR CB HT TT BD AV RD CH CE CI IL CA CR DB EI AN IK SS VS PC PJ RE TP TV VO VP VU AR BP BQ CP CV EP FA FC FV GE KM LD MS NB PB PV PS RC RT SG SP TC TR VT VE OD AC HA'.split(' '));
// Prénoms courants : un prénom désigne une personne ; il est remplacé avec les mots voisins qui ne sont pas du vocabulaire
// (« VIR INST DE M STEPHANE DURAND » : STEPHANE et DURAND).
const FIRST_NAMES = new Set(`
JEAN PIERRE MICHEL ANDRE PHILIPPE RENE LOUIS ALAIN JACQUES BERNARD MARCEL DANIEL ROGER ROBERT PAUL CLAUDE CHRISTIAN HENRI
GEORGES NICOLAS FRANCOIS PATRICK GERARD CHRISTOPHE JOSEPH JULIEN MAURICE LAURENT FREDERIC ERIC DAVID STEPHANE PASCAL SEBASTIEN
ALEXANDRE THIERRY OLIVIER THOMAS ANTOINE RAYMOND GUY DOMINIQUE YVES VINCENT MARC CHARLES FRANCK GUILLAUME JEROME DIDIER BRUNO
SERGE MAXIME LUCAS HUGO ROMAIN GILLES ANTHONY CEDRIC LUC FABRICE EMMANUEL FABIEN QUENTIN KEVIN MATHIEU MATTHIEU BENJAMIN
JONATHAN CYRIL LUDOVIC ARNAUD ALBERT LEON EMILE LUCIEN GABRIEL RAPHAEL ARTHUR JULES ADAM ETHAN NATHAN NOAH LEO TOM THEO MAEL
SACHA ENZO MATHIS TIMEO NOLAN EVAN AXEL ALEXIS CLEMENT CORENTIN DYLAN FLORIAN GAETAN JORDAN LOIC MICKAEL MIKAEL MICHAEL REMI
SIMON VICTOR VALENTIN XAVIER YANN YANNICK HERVE GREGORY JEREMY JOHAN KARIM MEHDI MOHAMED MOHAMMED AHMED ALI YOUSSEF RACHID
SAMIR KAMEL NABIL OMAR HAMID FARID SOFIANE BILAL AYOUB ABDEL ABDELKADER MUSTAPHA GILBERT ROLAND BAPTISTE TRISTAN BASTIEN
DAMIEN ADRIEN AURELIEN BENOIT BORIS CHRISTOPHER ERWAN GAEL JEREMIE JOEL JOHNNY LIONEL MANUEL MARTIAL NOEL OLIVER PATRICE
RODOLPHE STEVEN SYLVAIN TONY WILLIAM GABIN MARIUS AUGUSTIN LOUKA ROBIN ANDY ARMAND EDOUARD EMILIEN ETIENNE FERNAND GASTON
MARIE NATHALIE ISABELLE SYLVIE CATHERINE FRANCOISE MARTINE CHRISTINE MONIQUE NICOLE VALERIE SANDRINE STEPHANIE SOPHIE CELINE
VERONIQUE CHANTAL NADINE PATRICIA AURELIE JULIE CAROLINE CORINNE LAURENCE EMILIE ELODIE CLAIRE ANNE SUZANNE JEANNE JACQUELINE
DENISE MICHELE COLETTE BRIGITTE DANIELLE GHISLAINE JOSIANE EVELYNE ANNIE ODILE PASCALE AGNES BEATRICE FLORENCE HELENE LAETITIA
AUDREY MELANIE SEVERINE VIRGINIE KARINE MAGALI CHARLOTTE CAMILLE MANON LEA CHLOE EMMA INES JADE LOUISE ALICE LINA ANNA MIA
AMBRE JULIA ZOE LOLA MAEVA OCEANE MARGAUX CLARA LUCIE PAULINE MATHILDE MORGANE ANAIS LAURA SARAH ELISE ELISA ELENA ADELE
AGATHE ALINE AMELIE ANGELIQUE ARIANE BERNADETTE CAROLE CECILE CLAUDINE DELPHINE ESTELLE FANNY GAELLE GENEVIEVE GERALDINE
HELOISE JOELLE JOSETTE JUSTINE LILIANE LYDIE MADELEINE MARCELLE MARIANNE MARION MARYSE MAUD MICHELINE MIREILLE MURIEL MYRIAM
NOEMIE ODETTE PAULETTE PERRINE RAYMONDE REGINE SABINE SANDRA SIMONE SOLENE SYLVIANE THERESE VANESSA YVETTE YVONNE FATIMA AICHA
KHADIJA NADIA SAMIA LEILA YASMINE SONIA KARIMA MALIKA CLAUDETTE GISELE HUGUETTE LUCIENNE GERMAINE ANDREE RENEE ELISABETH
ELIZABETH ANNABEL ANNABELLE CARMEN FRANCETTE FRANCINE BEATRIX LOUISETTE ALEXANDRA ANGELE AUDE CINDY CORALIE ELSA EMELINE EVA
FLAVIE GABRIELLE IRENE JESSICA JOCELYNE KATIA LAURE LOUNA LUNA MAELYS NOLWENN OPHELIE ROSALIE SALOME SEGOLENE TIPHAINE VIOLETTE
`.split(/\s+/).filter((w) => w && !KEEP.has(w)));
const isAlpha = (t) => /^\p{L}+$/u.test(t);
// Mots qui annoncent une personne ou un client : civilité, chantier, client, patient… Les mots suivants hors vocabulaire
// (jusqu'à trois) sont protégés (« M. DUPONT », « MME ROUSSEAU HELENE », « chantier VALMONT », « SCI DUPONT »).
const ARTICLES = new Set('D L DE DU DES LA LE LES AU AUX ET'.split(' '));
const TITLES = new Set('M MR MME MLLE MM MONSIEUR MADAME MADEMOISELLE DR DOCTEUR ME MAITRE PR EI SCI CHANTIER CHANTIERS CLIENT CLIENTE PATIENT PATIENTE LOCATAIRE PROPRIETAIRE FAMILLE SUCCESSION INDIVISION EPOUX CONSORTS VEUVE VVE'.split(' '));

function anonymizeFec(buffer, fileName, opts) {
  const seed = opts.seed !== undefined ? opts.seed : (self.crypto ? self.crypto.getRandomValues(new Uint32Array(1))[0] : Date.now());
  const rnd = prng(seed);
  const pick = (s) => s[Math.floor(rnd() * s.length)];
  const all = opts.mode === 'all';
  const persons = opts.persons !== false;
  const force = new Set((opts.force || []).map(keyOf));
  const keepUser = new Set((opts.keep || []).map(keyOf));
  const { text, encoding, bom } = decode(buffer);
  const eol = /\r\n/.test(text.slice(0, 5000)) ? '\r\n' : '\n';
  const finalEol = /\n$/.test(text);
  const lines = text.split(/\r?\n/);
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  if (!lines.length) throw new Error('Fichier vide.');

  // En-tête et séparateur
  const headerLine = lines[0];
  const counts = { '\t': headerLine.split('\t').length - 1, '|': headerLine.split('|').length - 1, ';': headerLine.split(';').length - 1 };
  const sep = counts['\t'] ? '\t' : counts['|'] ? '|' : counts[';'] ? ';' : null;
  if (!sep) throw new Error("Impossible de lire l'en-tête : le fichier ne semble pas être un FEC (séparateur tabulation ou « | » attendu).");
  const header = headerLine.split(sep).map((h) => h.trim().replace(/^"(.*)"$/, '$1'));
  const col = (name) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const C = {};
  ['JournalCode', 'JournalLib', 'EcritureNum', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef', 'EcritureLib', 'Debit', 'Credit',
    'Montant', 'Sens', 'Montantdevise', 'Idevise', 'ModeRglt', 'NatOp', 'IdClient'].forEach((k) => { C[k] = col(k); });
  if (C.CompteNum < 0 || C.EcritureLib < 0) throw new Error("Colonnes CompteNum ou EcritureLib absentes : ce fichier n'est pas un FEC.");
  // Colonnes : codes (journal, comptes), données sans texte libre (dates, n°, montants, lettrage, devise) conservées telles
  // quelles, texte réglementaire (libellés) ; toute autre colonne (ajoutée par le logiciel) est traitée strictement.
  const NUMERIC = new Set(['ecriturenum', 'ecrituredate', 'piecedate', 'debit', 'credit', 'montant', 'sens', 'ecriturelet', 'datelet', 'validdate', 'montantdevise', 'idevise', 'daterglt']);
  const KNOWN_TEXT = new Set(['journallib', 'comptelib', 'compauxlib', 'pieceref', 'ecriturelib', 'modereglt', 'natop', 'idclient']);
  const CODE = ['JournalCode', 'CompteNum', 'CompAuxNum'].map((k) => C[k]).filter((i) => i >= 0);
  const TEXT = [], STRICT = [];
  header.forEach((h, i) => {
    const k = h.toLowerCase();
    if (CODE.includes(i) || NUMERIC.has(k)) return;
    (KNOWN_TEXT.has(k) ? TEXT : STRICT).push(i);
  });
  const RE_WORD = /\p{L}+/gu;

  // SIREN du dossier (nom du fichier) : remplacé partout, y compris dans les SIRET cités dans les libellés
  const nm = fileName.match(/(\d{9})FEC(\d{8})/i);
  const siren = nm ? nm[1] : '';
  const fakeSiren = '9' + Array.from({ length: 8 }, () => Math.floor(rnd() * 10)).join('');
  const outName = `${fakeSiren}FEC${nm ? nm[2] : '00000000'}.txt`;

  // ---------- Lecture : lignes, montants en centimes, écritures ----------
  const montantSens = C.Debit < 0 && C.Montant >= 0 && C.Sens >= 0;
  const parseAmt = (s) => {
    const v = parseFloat(String(s || '').replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(v) ? v : null;
  };
  const rows = [];
  const entries = new Map(); // écriture → { rows: [index], d, c, od, oc, big, bigAmt }
  const seen = new Set(); // tous les mots du fichier : un pseudonyme n'en reprend jamais un
  let misaligned = 0;
  const seenStr = new Set();
  const gather = (t) => {
    if (!t || seenStr.has(t)) return;
    seenStr.add(t);
    const ws = t.match(RE_WORD);
    if (ws) for (const w of ws) if (w.length >= 2) seen.add(keyOf(w));
  };
  const WORDCOLS = TEXT.concat(CODE, STRICT);
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split(sep);
    rows.push(f);
    if (!lines[i]) continue;
    // Ligne au nombre de zones différent de l'en-tête (séparateur dans un libellé…) : traitée strictement, zone par zone
    if (f.length !== header.length) { f._strict = true; misaligned++; f.forEach(gather); continue; }
    for (const c of WORDCOLS) gather(f[c]);
    let d, c;
    if (montantSens) {
      const v = parseAmt(f[C.Montant]) || 0;
      const isD = /^d/i.test((f[C.Sens] || '').trim()) || (f[C.Sens] || '').trim() === '+1';
      d = isD ? v : 0; c = isD ? 0 : v;
    } else { d = parseAmt(f[C.Debit]) || 0; c = parseAmt(f[C.Credit]) || 0; }
    f._d = Math.round(d * 100);
    f._c = Math.round(c * 100);
    const ek = (f[C.JournalCode] || '') + '\u0001' + (f[C.EcritureNum] || '');
    let e = entries.get(ek);
    if (!e) entries.set(ek, (e = { rows: [], d: 0, c: 0, od: 0, oc: 0, big: -1, bigAmt: -1 }));
    e.rows.push(rows.length - 1);
  }

  // ---------- Mots à protéger (noms des clients, des personnes, du dossier) ----------
  const protect = new Map(); // clé → motif
  // `short` : mots de deux lettres protégés aussi (nom de client ou de personne) ; `alpha` : seulement les mots entiers
  // (n° de pièce : « FACT DUPONT » oui, référence aléatoire « 7NLQCMCRNE » non).
  const added = new Set(); // (motif, options, texte) déjà traités : les libellés reviennent sur plusieurs lignes
  const addWords = (s, why, o) => {
    if (!s) return;
    const ak = why + (o ? (o.short ? 's' : '') + (o.alpha ? 'a' : '') : '') + '\u0001' + s;
    if (added.has(ak)) return;
    added.add(ak);
    const toks = o && o.alpha ? s.split(/[\s\-_/.,;:()'"]+/).filter(isAlpha) : s.match(RE_WORD);
    if (toks) for (const w of toks) {
      const k = keyOf(w);
      if ((k.length >= 3 || (o && o.short && k.length === 2 && !SHORT_KEEP.has(k))) && !KEEP.has(k) && !protect.has(k)) protect.set(k, why);
    }
  };
  const acc = (f) => f[C.CompteNum] || '';
  const lib = (f) => f[C.EcritureLib] || '';
  const valid = rows.filter((f) => !f._strict && !(f.length === 1 && !f[0]));
  const plCache = new Map();
  const personLib = (l) => { let v = plCache.get(l); if (v === undefined) { v = RE_PERSON_LIB.test(keyOf(l)); plCache.set(l, v); } return v; };
  // 1. Comptes de clients et de personnes : n° et nom du compte, du compte auxiliaire, libellé des lignes ; client BNC (IdClient)
  valid.forEach((f) => {
    const a = acc(f);
    const why = /^41/.test(a) ? 'client' : RE_PERSON_ACC.test(a) ? 'personne' : '';
    if (why) {
      [C.CompteNum, C.CompAuxNum, C.EcritureLib].forEach((i) => { if (i >= 0) addWords(f[i], why); });
      [C.CompteLib, C.CompAuxLib].forEach((i) => { if (i >= 0) addWords(f[i], why, { short: true }); });
    } else if (C.CompAuxLib >= 0 && f[C.CompAuxLib] && /^4/.test(a) && !/^40/.test(a)) addWords(f[C.CompAuxLib], 'client', { short: true }); // autre compte de tiers avec auxiliaire
    if (C.IdClient >= 0) addWords(f[C.IdClient], 'client', { short: true });
    // Comptes de produits nommés d'après un client (« 706DUPONT », « Ventes mairie de … »)
    if (/^70/.test(a)) { addWords(a, 'vente'); addWords(f[C.CompteLib], 'vente'); }
    // TVA collectée et produits constatés d'avance : libellés des ventes et des règlements clients (Pennylane : virement de
    // la TVA sur encaissements au libellé du règlement), y compris dans les à-nouveaux ; encaissements en attente (crédit 47)
    if (/^(4457|487)/.test(a) || (/^47/.test(a) && f._c > 0)) addWords(lib(f), /^47/.test(a) ? 'encaissement' : 'vente');
    // Compte ou libellé qui désigne une personne (« IK GERANT - … », « SALAIRE … », « NOTE DE FRAIS … », « MUTUELLE - … »)
    const cl = keyOf(f[C.CompteLib] || '');
    if (C.CompteLib >= 0 && (RE_PERSON_LIB.test(cl) || RE_PERSON_CLIB.test(cl))) addWords(f[C.CompteLib], 'personne', { short: true });
    if (personLib(lib(f))) addWords(lib(f), 'personne');
  });
  // 2. Écritures de vente (produits) : tous les libellés et n° de pièce. Encaissement (banque débitée en contrepartie d'un
  //    client, d'un compte d'attente, d'un produit) et personne : seules les lignes concernées et celles qui portent le même
  //    libellé (la ligne de banque), pour ne pas protéger les paiements aux fournisseurs d'un relevé saisi en une écriture (ACD).
  entries.forEach((e) => {
    const fs = e.rows.map((i) => rows[i]);
    const accs = fs.map(acc);
    if (accs.some((a) => /^70/.test(a)) || (accs.some((a) => /^41/.test(a)) && accs.some((a) => /^7/.test(a)))) {
      fs.forEach((f) => { addWords(lib(f), 'vente'); if (C.PieceRef >= 0) addWords(f[C.PieceRef], 'vente', { alpha: true }); });
      return;
    }
    const bankIn = fs.some((f) => /^5[1-3]/.test(acc(f)) && f._d > 0);
    const hit = new Map(); // libellé → motif
    fs.forEach((f) => {
      const a = acc(f);
      if (RE_PERSON_ACC.test(a)) hit.set(lib(f), 'personne');
      else if (bankIn && f._c > 0 && /^(41|47|7)/.test(a)) hit.set(lib(f), 'encaissement');
    });
    if (hit.size) fs.forEach((f) => { const w = hit.get(lib(f)); if (w) addWords(lib(f), w); });
  });
  // 3. Personnes repérées par un prénom, n'importe où (fournisseurs indépendants, chantiers, virements…) : le prénom et
  //    les mots voisins hors vocabulaire (le nom de famille).
  const firstNames = new Map(); // prénom → [occurrences, exemple]
  if (persons) {
    const scanned = new Set();
    const scan = (s) => {
      if (!s || scanned.has(s)) return;
      scanned.add(s);
      const toks = s.split(/[^\p{L}]+/u).filter(Boolean);
      toks.forEach((t, i) => {
        const k = keyOf(t);
        if (!FIRST_NAMES.has(k)) return;
        const x = firstNames.get(k) || [0, s.slice(0, 90)];
        x[0]++;
        firstNames.set(k, x);
        if (!protect.has(k)) protect.set(k, 'prenom');
        [toks[i - 1], toks[i + 1]].forEach((n) => {
          if (!n) return;
          const nk = keyOf(n);
          if (nk.length >= 2 && !KEEP.has(nk) && !SHORT_KEEP.has(nk) && !TITLES.has(nk) && !protect.has(nk)) protect.set(nk, 'prenom');
        });
      });
      // Après une civilité ou un mot qui annonce une personne : les mots hors vocabulaire qui suivent (jusqu'à trois)
      const words = s.split(/[\s,;:()'"/]+/).filter(Boolean);
      words.forEach((t, i) => {
        if (!TITLES.has(keyOf(t.replace(/\.$/, '')))) return;
        for (let j = i + 1, n = 0; j < words.length && n < 3; j++) {
          const w = words[j].replace(/\.$/, '');
          const k = keyOf(w);
          if (TITLES.has(k) || SHORT_KEEP.has(k) || ARTICLES.has(k)) continue;
          if (!/^\p{L}+(?:-\p{L}+)*$/u.test(w) || KEEP.has(k)) break;
          w.split('-').forEach((x) => { const xk = keyOf(x); if (xk.length >= 2 && !KEEP.has(xk) && !protect.has(xk)) protect.set(xk, 'prenom'); });
          n++;
        }
      });
    };
    valid.forEach((f) => { TEXT.forEach((i) => scan(f[i])); });
  }
  // 4. Le dossier lui-même : nom de la fiche (transmis par la page) et, dans les libellés bancaires détaillés (Pennylane),
  //    le donneur d'ordre ou bénéficiaire le plus fréquent (NBE / NPY), qui est le dossier.
  (opts.own || []).forEach((s) => addWords(s, 'dossier', { short: true }));
  const tags = new Map();
  let nTags = 0;
  valid.forEach((f) => {
    const l = lib(f);
    if (!l || l.indexOf(' - N') < 0) return;
    const re = / - N(?:BE|PY): ([^]*?)(?= - [A-Z][A-Z0-9]{2}:|$)/g;
    let m;
    while ((m = re.exec(l))) {
      const v = keyOf(m[1]).replace(/[^A-Z0-9 ]+/g, ' ').replace(/\b(SARL|SAS|SASU|EURL|SA|STE|SOCIETE)\b/g, ' ').replace(/\s+/g, ' ').trim();
      if (v) { tags.set(v, (tags.get(v) || 0) + 1); nTags++; }
    }
  });
  const topTag = Array.from(tags.entries()).sort((a, b) => b[1] - a[1])[0];
  const dossierTag = topTag && topTag[1] >= 5 && topTag[1] >= nTags * 0.15 ? topTag[0] : '';
  if (dossierTag) addWords(dossierTag, 'dossier');
  force.forEach((k) => { if (!protect.has(k)) protect.set(k, 'manuel'); });
  // Clients et personnes dont le nom n'est fait que de mots courants (« CAFE DU PORT ») : rien n'y est remplacé, à signaler
  const generic = new Map(); // nom → occurrences
  valid.forEach((f) => {
    const a = acc(f);
    if (!/^41/.test(a) && !RE_PERSON_ACC.test(a)) return;
    const name = (C.CompAuxLib >= 0 && f[C.CompAuxLib]) || '';
    if (!name) return;
    const ks = (name.match(RE_WORD) || []).map(keyOf).filter((k) => k.length >= 2);
    if (ks.length && !ks.some((k) => protect.has(k) || force.has(k))) generic.set(name, (generic.get(name) || 0) + 1);
  });

  // ---------- Pseudonymes ----------
  const CONS = 'BCDFGJKLMNPRSTVZ', VOW = 'AEIOU';
  const pseudo = new Map(); // mot (clé) → pseudonyme
  const used = new Set();
  const replaced = new Map(); // clé → occurrences
  const keptOther = new Map(); // mots hors dictionnaire conservés (fournisseurs, lieux… en mode « clients »)
  const keptDict = new Map(); // vocabulaire du dictionnaire conservé
  const strictWords = new Set(); // mots remplacés parce que leur colonne ou leur ligne n'est pas standard
  const shape = (src, p) => (src === src.toUpperCase() ? p : src === src.toLowerCase() ? p.toLowerCase()
    : src[0] === src[0].toUpperCase() && src.slice(1) === src.slice(1).toLowerCase() ? p[0] + p.slice(1).toLowerCase() : p);
  const newPseudo = (len) => {
    for (let tries = 0; tries < 50; tries++) {
      let s = '';
      const startVowel = rnd() < 0.3;
      for (let i = 0; i < len; i++) s += (i % 2 === (startVowel ? 0 : 1)) ? pick(VOW) : pick(CONS);
      if (!used.has(s) && !KEEP.has(s) && !seen.has(s) && !FIRST_NAMES.has(s) && !SHORT_KEEP.has(s) && !TITLES.has(s)) return s;
    }
    let s = '';
    for (let i = 0; i < len; i++) s += pick(CONS);
    return s;
  };
  const why = (k) => protect.get(k) || (strictWords.has(k) ? 'strict' : 'autre');
  let strict = false; // zone ou ligne non standard en cours : tout mot hors dictionnaire est remplacé
  // Un même texte revient sur des milliers de lignes : il est traité une fois, et ses compteurs sont rejoués ensuite.
  let rec = null;
  const bump = (m, k) => { m.set(k, (m.get(k) || 0) + 1); if (rec) rec.push(m, k); };
  const memo = new Map();
  const cached = (kind, fn, t) => {
    const mk = kind + (strict ? '!' : ':') + t;
    let hit = memo.get(mk);
    if (hit) {
      for (let i = 0; i < hit.ev.length; i += 2) { const m = hit.ev[i], k = hit.ev[i + 1]; if (m === stats) stats[k]++; else m.set(k, (m.get(k) || 0) + 1); }
      return hit.out;
    }
    const prev = rec;
    rec = [];
    const out = fn(t);
    hit = { out, ev: rec };
    rec = prev;
    if (memo.size > 200000) memo.clear();
    memo.set(mk, hit);
    return out;
  };
  const wordOut = (w) => {
    const k = keyOf(w);
    if (k.length < 2 || (k.length === 2 && !protect.has(k) && !force.has(k))) return w;
    const hide = force.has(k) || (!keepUser.has(k) && (protect.has(k) || ((all || strict) && !KEEP.has(k) && k.length >= 3)));
    if (!hide) {
      if (k.length >= 3) bump(KEEP.has(k) ? keptDict : keptOther, k);
      return w;
    }
    if (strict && !protect.has(k) && !force.has(k)) strictWords.add(k);
    let p = pseudo.get(k);
    if (!p) {
      p = newPseudo(k.length);
      pseudo.set(k, p);
      used.add(p);
    }
    bump(replaced, k);
    return shape(w, p);
  };
  // Chiffres et lettres remplacés au hasard, de façon cohérente (même valeur → même remplacement) : IBAN, n° longs…
  const masks = new Map();
  const mask = (s, keepPrefix) => {
    let m = masks.get(s);
    if (!m) {
      m = s.slice(0, keepPrefix || 0) + s.slice(keepPrefix || 0).replace(/[0-9]/g, () => String(Math.floor(rnd() * 10))).replace(/[A-Z]/g, () => pick(CONS)).replace(/[a-z]/g, () => pick(CONS).toLowerCase());
      masks.set(s, m);
    }
    return m;
  };
  const stats = { iban: 0, phone: 0, email: 0, url: 0, siren: 0, longnum: 0, card: 0, nir: 0, plate: 0 };
  const RE_EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
  const RE_URL = /\b(?:https?:\/\/|www\.)[^\s|]+/gi;
  // IBAN compact (« FR7613506… ») ou par groupes de quatre (« FR76 1350 6100 … »), majuscules ou minuscules
  const RE_IBAN = /\b[A-Z]{2}\d{2}(?:[A-Z0-9]{11,30}|(?: [A-Z0-9]{4}){2,7}(?: [A-Z0-9]{1,4})?)\b/gi;
  // N° de carte par groupes de quatre ; n° de sécurité sociale (avec ou sans espaces) ; plaque d'immatriculation
  const RE_CARD = /\b\d{4}(?:[ -]\d{4}){3}\b/g;
  const RE_NIR = /\b[12] ?\d{2} ?(?:0[1-9]|1[0-2]|[2-9]\d) ?(?:\d{2}|2[AB]) ?\d{3} ?\d{3}(?: ?\d{2})?\b/g;
  const RE_PLATE = /\b[A-Z]{2}-\d{3}-[A-Z]{2}\b|\b[A-Z]{2}\d{3}[A-Z]{2}\b/g;
  // Téléphone : 10 chiffres d'un bloc ou 5 paires séparées (« 06 12 34 56 78 », « 06.12.34.56.78 ») ; international (+32…)
  const RE_PHONE = /(?:\+33 ?[1-9]|\b0[1-9])(?:\d{8}|(?:[ .-]\d{2}){4})(?!\d)|\+\d{2,3}(?:[ .-]?\d){8,11}(?!\d)/g;
  const RE_LONGNUM = /\d{11,}/g;
  // SIREN, SIRET, RCS, n° de TVA intracommunautaire cités dans un libellé (avec ou sans espaces)
  const RE_SIRET = /\b(SIRE[NT]|RCS(?: [A-Z][A-Z-]+)?|N° ?TVA|TVA INTRA(?:COM(?:MUNAUTAIRE)?)?)(\s*:?\s*)((?:[A-Z]{2} ?)?\d[\d ]{7,16}\d)/gi;

  // E-mails et sites : remplacés par une adresse fictive, mise à l'abri le temps de traiter les mots (\u0001 / \u0002)
  const SAFE = ['contact@exemple.fr', 'www.exemple.fr'];
  const stat = (k) => { stats[k]++; if (rec) rec.push(stats, k); };
  const anonTextRaw = (s) => {
    let t = s;
    if (siren && t.includes(siren)) { t = t.split(siren).join(fakeSiren); stat('siren'); }
    if (t.includes('@')) t = t.replace(RE_EMAIL, () => { stat('email'); return '\u00010\u0002'; });
    if (/www\.|https?:/i.test(t)) t = t.replace(RE_URL, () => { stat('url'); return '\u00011\u0002'; });
    // Expressions des numéros : seulement si le texte contient assez de chiffres
    let nd = 0;
    for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); if (c >= 48 && c <= 57) nd++; }
    if (nd >= 7 && /SIRE|RCS|TVA/i.test(t)) t = t.replace(RE_SIRET, (m, a, b, n) => { stat('siren'); const x = n.replace(/ /g, ''); return a + b + mask(x, /^[A-Z]{2}/i.test(x) ? 2 : 0); });
    if (nd >= 8) t = t.replace(RE_IBAN, (m) => { stat('iban'); return mask(m.replace(/ /g, ''), 2); });
    if (nd >= 16) t = t.replace(RE_CARD, (m) => { stat('card'); return mask(m); });
    if (nd >= 13) t = t.replace(RE_NIR, (m) => { stat('nir'); return mask(m); });
    if (nd >= 3) t = t.replace(RE_PLATE, (m) => { stat('plate'); return mask(m); });
    if (nd >= 9) t = t.replace(RE_PHONE, (m) => { stat('phone'); return mask(m.replace(/[ .-]/g, ''), m[0] === '+' ? 3 : 2); });
    if (nd >= 11) t = t.replace(RE_LONGNUM, (m) => { stat('longnum'); return mask(m); });
    t = t.replace(RE_WORD, wordOut);
    return t.includes('\u0001') ? t.replace(/\u0001(\d)\u0002/g, (m, i) => SAFE[i]) : t;
  };
  const anonText = (s) => (s ? cached('t', anonTextRaw, s) : s);
  // N° de compte et code journal : chiffres conservés (sauf n° longs et SIREN), lettres traitées comme des mots
  // (« 411DUPONT » → « 411BAKERI » si DUPONT est un client).
  // Un nom protégé collé à un préfixe d'une ou deux lettres (« 401FDUPONT », « 411CDUPONT ») est remplacé aussi.
  const hidden = (k) => force.has(k) || (protect.has(k) && !keepUser.has(k));
  const codeOut = (w) => {
    const k = keyOf(w);
    if (!hidden(k)) for (const n of [1, 2]) if (k.length - n >= 3 && hidden(k.slice(n))) return w.slice(0, n) + wordOut(w.slice(n));
    return wordOut(w);
  };
  const anonCode = (s) => (s ? cached('c', (x) => {
    const t = siren && x.includes(siren) ? x.split(siren).join(fakeSiren) : x;
    return t.replace(RE_LONGNUM, (m) => mask(m)).replace(RE_WORD, codeOut);
  }, s) : s);

  // ---------- Montants ----------
  // Coefficient unique (0,6 à 1,4) ; chaque écriture reste équilibrée : l'arrondi est reporté sur sa plus grosse ligne.
  const scale = !!opts.scale;
  const factor = scale ? Math.round((0.6 + rnd() * 0.8) * 10000) / 10000 : 1;
  const fmtAmt = (cents, like) => {
    const comma = /,/.test(like) || !/\./.test(like);
    const dec = (like.split(/[.,]/)[1] || '').length;
    const neg = cents < 0;
    let s = (Math.abs(cents) / 100).toFixed(2);
    if (dec === 1 && s.endsWith('0')) s = s.slice(0, -1); // style « 110,0 » (Pennylane)
    if (dec === 0 && s.endsWith('.00')) s = s.slice(0, -3);
    return (neg ? '-' : '') + (comma ? s.replace('.', ',') : s);
  };
  if (scale) {
    entries.forEach((e) => {
      e.rows.forEach((i) => {
        const f = rows[i];
        const nd = Math.round(f._d * factor), nc = Math.round(f._c * factor);
        f._amt = [f._d, f._c, nd, nc];
        e.d += nd; e.c += nc; e.od += f._d; e.oc += f._c;
        if (Math.abs(f._d) + Math.abs(f._c) > e.bigAmt) { e.bigAmt = Math.abs(f._d) + Math.abs(f._c); e.big = i; }
      });
      const want = Math.round((e.od - e.oc) * factor); // déséquilibre d'origine éventuel, à la même échelle
      const diff = e.d - e.c - want;
      if (!diff || e.big < 0) return;
      const a = rows[e.big]._amt;
      if (a[2]) a[2] -= diff; else a[3] += diff;
    });
  }

  // ---------- Réécriture des lignes ----------
  const out = [headerLine];
  for (const f of rows) {
    if (f.length === 1 && !f[0]) { out.push(''); continue; }
    if (f._strict) {
      // Ligne non standard : chaque zone traitée comme du texte, en remplaçant tout mot hors dictionnaire
      strict = true;
      for (let i = 0; i < f.length; i++) f[i] = anonText(f[i]);
      strict = false;
      out.push(f.join(sep));
      continue;
    }
    TEXT.forEach((i) => { if (f[i]) f[i] = anonText(f[i]); });
    CODE.forEach((i) => { if (f[i]) f[i] = anonCode(f[i]); });
    strict = true;
    STRICT.forEach((i) => { if (f[i]) f[i] = anonText(f[i]); });
    strict = false;
    if (scale && f._amt) {
      const [od, oc, nd, nc] = f._amt;
      if (montantSens) f[C.Montant] = fmtAmt(od ? nd : nc, f[C.Montant] || '0,00');
      else {
        if (C.Debit >= 0) f[C.Debit] = f[C.Debit] === '' && !nd ? '' : fmtAmt(nd, f[C.Debit] || '0,00');
        if (C.Credit >= 0) f[C.Credit] = f[C.Credit] === '' && !nc ? '' : fmtAmt(nc, f[C.Credit] || '0,00');
      }
      if (C.Montantdevise >= 0 && f[C.Montantdevise]) {
        const v = parseAmt(f[C.Montantdevise]);
        // Montant en devise = solde de la ligne (Pennylane, EUR) : recalculé ; sinon même coefficient
        if (v !== null) f[C.Montantdevise] = fmtAmt(Math.round(v * 100) === od - oc ? nd - nc : Math.round(v * 100 * factor), f[C.Montantdevise]);
      }
    }
    out.push(f.join(sep));
  }

  // ---------- Rapport (affiché sur l'appareil seulement) ----------
  const top = (m, n) => Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, n);
  // Aperçu du fichier produit : premières lignes, puis quelques lignes de chaque journal et des comptes de tiers
  const SHOW = ['JournalCode', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef', 'EcritureLib', 'Debit', 'Credit', 'Montant', 'Sens'].filter((k) => col(k) >= 0);
  const pv = new Set();
  const perJ = {};
  let aux = 0;
  for (let i = 1; i < out.length && pv.size < 60; i++) {
    const f = out[i].split(sep);
    const j = f[C.JournalCode] || '';
    if (i <= 12) pv.add(i);
    else if ((perJ[j] || 0) < 4) { pv.add(i); perJ[j] = (perJ[j] || 0) + 1; }
    else if (C.CompAuxLib >= 0 && f[C.CompAuxLib] && aux < 8) { pv.add(i); aux++; }
  }
  const preview = { cols: SHOW, rows: Array.from(pv).sort((a, b) => a - b).map((i) => { const f = out[i].split(sep); return SHOW.map((k) => f[col(k)] || ''); }) };
  const byWhy = {};
  replaced.forEach((n, k) => { const w = why(k); byWhy[w] = (byWhy[w] || 0) + 1; });
  const outText = out.join(eol) + (finalEol ? eol : '');
  return {
    text: outText,
    bytes: encode(outText, encoding, bom),
    fileName: outName,
    report: {
      mode: all ? 'all' : 'clients', persons, lines: rows.length, columns: header.length, sep: sep === '\t' ? 'tabulation' : sep, eol: eol === '\r\n' ? 'CRLF' : 'LF',
      encoding: encoding + (bom ? ' avec BOM' : ''), siren: !!siren, fakeSiren, scale, factor: scale ? factor : 1, entries: entries.size,
      replacedCount: Array.from(replaced.values()).reduce((t, n) => t + n, 0), replacedDistinct: replaced.size, byWhy,
      replaced: top(replaced, 3000).map(([k, n]) => [k, pseudo.get(k), n, REASONS[why(k)] || why(k)]),
      keptOther: top(keptOther, 3000), keptOtherDistinct: keptOther.size, kept: top(keptDict, 1000), stats, seed, preview,
      firstNames: top(new Map(Array.from(firstNames.entries()).map(([k, x]) => [k, x[0]])), 300).map(([k, n]) => [k, pseudo.get(k) || '', n, firstNames.get(k)[1]]),
      misaligned, strictCols: STRICT.map((i) => header[i]),
      generic: Array.from(generic.keys()).filter((n) => !(n.match(RE_WORD) || []).some((w) => { const k = keyOf(w); return protect.has(k) || force.has(k); })).slice(0, 200),
      dossier: dossierTag,
    },
  };
}
