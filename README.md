# NYSOA — contrat joint, factures et encaissements liés (29/09/2026)

Ce paquet reprend le correctif d'encaissement direct précédent et ajoute les demandes du 29/09. Il est construit sur la version publique `app.js` de GitHub `main` constatée ce jour-là (SHA-256 de base `3985e3caeadb10189b5bd76896504dbe80742525206a9f7e9b2188f7d121ba56`). Aucune donnée Cloud n'est effacée et ce paquet n'est pas déployé automatiquement.

## Fonctions

- **Contrat** : depuis *Gestion des chantiers*, cliquer sur le nom du chantier. L'Admin peut joindre un PDF/PNG/JPEG de 10 Mo au plus, stocké dans Firebase Storage sous `contrats/<id chantier>/`. Le nom et le chemin sont conservés dans la fiche chantier Firestore. Les utilisateurs autorisés à voir ce chantier voient le bouton *Voir*. L'application ne modifie pas le document joint.
- **Module unifié** : menu Admin *Factures & encaissements*, avec accès aux deux listes depuis ce module. Le Gestionnaire saisit un paiement à soumettre à l'Admin. La facture imprimable est créée à la validation. L'Admin saisissant une avance voit immédiatement une facture imprimable liée. Le numéro de reçu reste automatique.
- **Facture directe** : lorsqu'un Admin crée une nouvelle facture depuis un devis accepté ou un budget direct de chantier, un encaissement validé du même montant et même client/chantier est créé en même temps. Les deux enregistrements portent chacun l'identifiant de l'autre. Les totaux de paiement ne comptent que l'encaissement, les totaux facturés ne comptent que la facture.
- **Factures déjà existantes** : elles ne sont pas converties automatiquement en paiements. Pour enregistrer un paiement de l'une d'elles, la choisir dans le formulaire d'encaissement. Cela évite de réécrire l'historique.
- Si un contrat est déjà totalement facturé, un nouveau paiement doit être affecté à la facture existante. Les montants encaissés et facturés ne peuvent pas dépasser le contrat; les factures liées à un paiement validé ne peuvent pas être supprimées ni changer de montant sans correction comptable.

## Installation

1. Faire la *Sauvegarde complète Admin* puis conserver les anciens `app.js` et `index.html`.
2. Vérifier si les fichiers GitHub ont changé depuis la base ci-dessus ou depuis le patch `encaissement direct` précédent. Fusionner les modifications si oui; ne pas écraser des changements plus récents.
3. Déposer `app.js` et `index.html` à la racine du dépôt, puis publier GitHub Pages. Les fichiers de test et cette notice restent hors dépôt.
4. **Configurer et tester les règles Firebase Storage** du bucket `erp-nysoa.firebasestorage.app` pour le dossier `contrats/`: écriture Admin seulement, lecture des utilisateurs autorisés, types PDF/PNG/JPEG et taille maximale 10 Mo. Vérifier aussi que la fiche `projects` est inscriptible par l'Admin. Le code frontend seul ne peut pas accorder ces droits. Sans autorisation Storage, l'upload affiche une erreur; ne pas ouvrir l'accès à tout Internet.
5. Sur Mac et téléphone, forcer le rechargement, joindre un petit contrat de test, ouvrir le chantier sur l'autre appareil, puis vérifier une facture/avance de test sur un chantier de test avant utilisation réelle.

## Vérification locale

`node --check app.js` et `node audit_encaissement_direct.cjs` ont réussi : budget direct 20 000 000 Ar et avance 10 525 000 Ar → 52,625 % et reste 9 475 000 Ar; création d'une facture liée sans double comptage. Une facture directe de 3 000 000 Ar sur 10 000 000 Ar produit un encaissement unique et reste 7 000 000 Ar. L'upload Storage et la synchronisation entre appareils nécessitent un essai réel sur le projet Firebase; ils ne sont pas validés par le test local.

## Ajouts : brouillons et fiche CLIENTS

- Lorsqu'un formulaire ou l'éditeur DEVIS/PRÉVISION MATÉRIAUX est ouvert, un passage par un autre module conserve **les champs, les lignes du devis, la sélection et les gestionnaires d'événements**, puis restitue l'écran tel quel au retour. Ceci couvre la navigation **dans la même session et sur le même appareil**; ce n'est pas un enregistrement Cloud et un rechargement/fermeture du navigateur perd encore le brouillon. Après validation, l'enregistrement normal continue de s'appliquer. Déconnexion : brouillons en mémoire effacés.
- CLIENTS conserve les trois champs historiques dans leur ordre (nom, téléphone, adresse) et ajoute personne de contact, e-mail et chantier indicatif modifiable. Les anciens clients gardent leurs coordonnées; les champs complémentaires sont vides. Le chantier indicatif n'est **pas** un chantier opérationnel et n'entre dans aucun budget, devis ou encaissement. Le module CLIENTS n'affiche aucun montant ni pourcentage; le statut technique n'est plus montré dans la fiche.
- Contrôles locaux additionnels : `node audit_brouillons_clients.cjs` vérifie le retour d'un DEVIS après saisie dans CLIENTS et l'absence de changement du calcul financier.
