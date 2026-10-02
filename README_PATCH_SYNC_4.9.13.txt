NYSOA CONSTRUCT — PATCH 4.9.13 SYNC / MUTATION
Date : 02/10/2026

BUT
- Toute mutation métier autorisée (ADMIN / GESTIONNAIRE / CONTROLE / TECHNICIEN) tente une écriture Firestore immédiatement.
- Si Internet/Firebase est indisponible : la donnée reste locale ET est placée dans une file persistante.
- La file est renvoyée automatiquement à la reconnexion, au retour de l'application au premier plan, et par le fallback périodique.
- Les snapshots Firestore deviennent une baseline locale afin d'éviter de réexpédier une modification distante comme si elle était locale.
- Les mutations qui oubliaient updatedAt sont estampillées automatiquement.
- Suppression/validation de contrôle chantier reçoivent updatedAt/updatedBy.
- Les suppressions définitives hors-ligne sont mises en attente.

IMPORTANT
Ce fichier .patch a été construit contre la structure synchronisation de l'app.js NYSOA disponible dans le projet. Il ne faut PAS remplacer votre app.js récent par le fichier de référence app_patched_reference.js si votre dépôt contient une version plus récente. Appliquer le .patch sur l'app.js actuel est plus sûr.

APPLICATION AVEC GIT
1. Faire une sauvegarde du dépôt.
2. Copier NYSOA_sync_mutation_4.9.13.patch à la racine du dépôt.
3. Tester sans modifier :
   git apply --check NYSOA_sync_mutation_4.9.13.patch
4. Si aucun message d'erreur :
   git apply NYSOA_sync_mutation_4.9.13.patch
5. Vérifier la syntaxe :
   node --check app.js
6. Vérifier les éléments du patch :
   node audit_sync_patch.cjs app.js

CACHE GITHUB PAGES / TELEPHONE
Après publication, modifier la référence à app.js dans index.html pour forcer les appareils à prendre la nouvelle version, par exemple :
   app.js?v=4.9.13-sync
Puis publier index.html + app.js ensemble.

TEST REEL A FAIRE APRES PUBLICATION
A. Mac Admin : créer une petite donnée test autorisée -> elle doit apparaître sur le téléphone sans bouton Synchroniser.
B. Téléphone Gestionnaire : créer/modifier une donnée autorisée -> elle doit apparaître sur le Mac.
C. Téléphone CONTROLE/TECHNICIEN : enregistrer un contrôle/pointage/rapport autorisé -> apparition côté Admin.
D. Couper Internet -> créer une donnée -> le statut doit indiquer synchronisation en attente.
E. Remettre Internet -> la donnée doit partir automatiquement.
F. Fermer/minimiser le navigateur du téléphone puis revenir -> flush automatique au retour écran.
G. Tester validation et suppression -> l'autre appareil doit se mettre à jour.

FIRESTORE RULES
Le code ne peut pas contourner les Security Rules Firebase. Si un rôle reçoit permission-denied, la donnée est conservée dans la file d'attente, mais il faut publier des rules qui autorisent réellement cette mutation pour ce rôle. Vérifier que les rules publiées correspondent à la version du dépôt.

FICHIERS
- NYSOA_sync_mutation_4.9.13.patch : patch à appliquer sur app.js actuel.
- audit_sync_patch.cjs : contrôle statique après application.
- app_patched_reference.js : référence de validation uniquement, ne pas utiliser pour écraser une version plus récente.
