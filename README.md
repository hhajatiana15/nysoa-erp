# NYSOA — patch cumulatif 4.9.12, synchronisation par rôle (29/09/2026)

## Correction Firebase par rôle

Ce patch remplace l'écoute aveugle des 34 collections par des listes adaptées aux rôles ADMIN, GESTIONNAIRE, CONTROLE et TECHNICIEN. Les rapports journaliers et demandes de correction des non-Admin sont interrogés avec leur UID dans la requête, conformément aux règles Firestore (« rules are not filters »). Les envois non autorisés ne sont pas tentés en boucle ; ils restent signalés et les données locales ne sont pas effacées. Les règles proposées sont dans `firestore.rules` et couvrent également les collections de présence, activité, mini-profils techniciens, notifications et audit réellement utilisées par `app.js`. La règle de refus par défaut reste en place.

**Limite de confidentialité à traiter séparément :** les documents `projects` contiennent encore des champs financiers dans la même fiche que les champs chantier. Comme les rôles terrain doivent lire ces documents, leurs budgets ne sont pas protégés contre une lecture directe via Firebase, même si l'interface les masque. Une séparation des données financières dans des documents Admin uniquement, avec migration prudente des fiches existantes, reste nécessaire avant de considérer le budget strictement confidentiel. De même, la limite de modification de 24 h est contrôlée dans l'interface mais pas intégralement par ces règles pour tous les anciens documents.

## Synchronisation Opera ↔ Chrome ↔ téléphone

- Une saisie nouvellement enregistrée est marquée comme **en attente** sur cet appareil jusqu'à son envoi au Cloud. La liste des envois en attente est conservée dans le navigateur après rechargement ou coupure Internet, puis réessayée lorsque Firebase répond. Les données locales ne sont pas effacées après un échec.
- L'indicateur Cloud ne dit **« Synchronisé »** qu'après chargement des collections Firebase et résolution des envois en attente. Il distingue « Hors ligne », « Chargement Cloud… », « donnée(s) en attente de sync », « donnée(s) locales à vérifier » et les erreurs de lecture ou d'envoi. Survoler l'état Cloud sur ordinateur pour voir le détail technique des erreurs.
- Des enregistrements anciens présents seulement dans Opera et jamais envoyés au Cloud sont détectés. L'Admin peut cliquer **« Vérifier / synchroniser »** : l'écran donne les quantités par module et demande confirmation avant l'import, pour éviter de recréer automatiquement des données supprimées auparavant. Faire d'abord une **Sauvegarde complète Admin**.
- Si une même fiche a été modifiée différemment dans deux navigateurs, la version locale en attente est préservée et le conflit est signalé. Aucun écrasement automatique de ce conflit n'est garanti. Les règles d'accès Firebase doivent autoriser lecture et écriture sur les collections métiers pour que tous les appareils aient les mêmes données.

Pour récupérer les données déjà saisies dans Opera : ouvrir l'ERP dans Opera avec le même compte ERP, attendre le chargement, faire une sauvegarde, cliquer « Vérifier / synchroniser », examiner les données locales proposées et confirmer celles à envoyer. Attendre **« Synchronisé »**. Dans Chrome, ouvrir l'ERP avec le même compte ERP et recharger la page. Un brouillon de formulaire non enregistré reste local au navigateur et n'est pas encore une donnée Cloud.

## Devis accepté et encaissement

- À l'enregistrement d'un devis **Accepté**, son montant final après remise et TVA alimente immédiatement le budget du chantier, y compris si ce chantier avait auparavant un budget saisi directement. L'ancien montant direct est conservé pour un éventuel retour au mode direct si tous les devis acceptés sont retirés sans facture ni encaissement associé.
- La liste des devis et la fiche d'un devis accepté montrent les **paiements validés** du client sur ce chantier, le montant en attente de validation et le reste à payer. Le bouton « Voir les encaissements » ouvre le module sur ce chantier.
- L'acceptation ne crée ni encaissement ni facture. Une facture émise ne prouve pas un paiement. Les montants affichés regroupent le client et le chantier ; plusieurs devis acceptés pour le même client y sont additionnés. Une conversion du budget est bloquée si son nouveau montant serait inférieur aux factures ou aux encaissements déjà enregistrés.

## Finances

- Une **nouvelle facture** ne crée plus d'encaissement Validé. Le montant facturé est distinct du montant réellement reçu. Un encaissement peut ensuite être affecté à cette facture dans le module Factures & encaissements.
- Un **nouvel encaissement** sans facture est une avance / un paiement global non affecté ; il ne crée plus de facture. Sa référence de reçu est automatique. Une fois validé, le reçu d'encaissement peut être ouvert et imprimé ; il est explicitement identifié comme reçu et non comme facture.
- Le tableau de bord montre séparément **Facturation émise (TTC)**, **Encaissements clients** et **Marge provisoire**. L'indicateur de facturation reflète les factures émises et ne constitue pas à lui seul un chiffre d'affaires comptable définitivement acquis. Le reste à payer sur le contrat se fonde sur les encaissements validés, tandis que le reste sur une facture dépend des paiements affectés à cette facture.
- Les **factures et encaissements historiques** générés ensemble ne sont pas modifiés ni supprimés par ce patch. Leur lien et leurs soldes restent consultables. Les nouvelles règles s'appliquent aux nouvelles saisies.

Exemple vérifié en test local : contrat 10 000 000 Ar, facture de 3 000 000 Ar non payée → facturé 3 000 000 Ar, encaissé 0 Ar, reste à payer contrat 10 000 000 Ar. Paiement ultérieur de 2 000 000 Ar affecté à cette facture → encaissé 2 000 000 Ar, reste facture 1 000 000 Ar, reste contrat 8 000 000 Ar. Autre test : avance de 10 525 000 Ar sur un contrat direct de 20 000 000 Ar → 52,625 % payé, reste 9 475 000 Ar, aucune facture générée.

## Navigation et saisies

Les boutons **← Précédent** et **Suivant →** se trouvent avant le choix du chantier dans la barre supérieure. Ils parcourent les modules visités pendant la session, se désactivent aux extrémités, et une nouvelle navigation efface la branche « Suivant ». Lorsqu'un formulaire ou un DEVIS non enregistré est ouvert, son contenu est conservé au retour dans son module sur ce même appareil. Le brouillon DEVIS est de plus stocké localement par compte et peut être repris depuis sa liste après rechargement du navigateur. Les boutons suivent les modules ERP ; ils ne représentent pas l'historique des onglets du navigateur ni chaque écran de détail ouvert à l'intérieur d'un module.

## Correctifs cumulatifs conservés

- DEVIS sans champ « Validité » sur l'écran et dans le PDF. Nouveau chantier saisissable depuis le sélecteur du DEVIS et ajouté à la liste, lié au client choisi. Son budget est de 0 Ar jusqu'à acceptation du devis ; les dates et le projet/travaux peuvent être complétés dans Gestion des chantiers.
- Contrat PDF/image joint et consultable depuis la fiche chantier selon les règles Firebase Storage existantes ; fiche CLIENTS limitée aux coordonnées et chantier indicatif ; correctifs de brouillon, PDF et saisie du budget direct précédents.

## Installation

1. Faire une **Sauvegarde complète Admin** et conserver une copie des fichiers actuels du dépôt GitHub. Ne pas effacer de données Firebase.
2. Dans Firebase Console → **Firestore Database → Règles**, conserver d'abord une copie des règles actuellement publiées. Remplacer le contenu **entier** par `firestore.rules`, puis cliquer **Publier**. Ne pas utiliser la règle générale `allow read, write: if true`.
3. Déposer **ensemble** `app.js`, `index.html` et `quote-pdf.js` à la racine du dépôt `nysoa-erp`. `firestore.rules` n'est pas à téléverser sur GitHub pour activer les droits. Conserver les autres fichiers existants. Si les trois fichiers web ont été modifiés indépendamment depuis le dernier patch, fusionner ces changements plutôt que les écraser.
4. Attendre la publication des règles **et** de GitHub Pages, puis recharger la page sur chaque appareil. Le paramètre `app.js?v=4.9.12-role-cloud` force le renouvellement du cache du script. Une seule moitié du déploiement peut encore montrer « permission denied ».
5. Tester un compte de chaque rôle, puis avec un chantier d'essai : devis accepté → budget, encaissement validé, facture seule, rapport journalier propre au rôle, présence QR et rapport technique. Vérifier l'état Cloud et les soldes dans Opera et Chrome. L'accès Firebase authentifié, les règles effectivement publiées et l'impression physique n'ont pas été vérifiés depuis cet environnement.

## Contrôles locaux réalisés

`node --check app.js`, `node --check quote-pdf.js`, `node audit_roles_cloud.cjs` et tous les `audit_*.cjs` : réussite. Les tests emploient un faux Cloud et un DOM simulé ; ils ne remplacent pas un essai complet dans le site authentifié avec les règles Firebase réelles ni le simulateur de règles Firebase.
