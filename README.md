# NYSOA — patch cumulatif 4.9.10 (29/09/2026)

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
2. Déposer **ensemble** `app.js`, `index.html` et `quote-pdf.js` à la racine du dépôt `nysoa-erp`. Conserver tous les autres fichiers existants (`styles.css`, bibliothèques, images, etc.). Si ces trois fichiers ont été modifiés indépendamment depuis le dernier patch, fusionner ces changements plutôt que les écraser.
3. Publier GitHub Pages puis recharger la page sur Mac et téléphone. Le paramètre `app.js?v=4.9.10-devis-paiements` force le renouvellement du cache du script.
4. Tester avec un chantier d'essai dans une session Admin : accepter un devis et vérifier le budget ; ouvrir les encaissements avant puis après validation d'une avance ; facture seule, encaissement seul, paiement affecté à une facture, impression du reçu ; visiter DEVIS → Facturation → Précédent → Suivant en saisissant un brouillon DEVIS. Vérifier les soldes sur les deux appareils. L'accès Firebase authentifié, la synchronisation Cloud et l'impression physique n'ont pas été vérifiés depuis cet environnement.

## Contrôles locaux réalisés

`node --check app.js`, `node --check quote-pdf.js`, `node audit_devis_paiement.cjs`, `node audit_encaissement_direct.cjs`, `node audit_navigation_erp.cjs`, `node audit_devis_navigation.cjs`, `node audit_chantier_devis.cjs`, `node audit_brouillons_clients.cjs` : réussite. Les tests emploient un DOM simulé et les fonctions financières du projet ; ils ne remplacent pas un essai complet dans le site authentifié.
