NYSOA ERP — STABLE BASELINE
Date: 25/07/2026

ÉTAT VALIDÉ
- Admin: connexion validée
- Gestionnaire: connexion validée
- Technicien / Contrôle: connexion validée
- Firebase Authentication: opérationnel
- Firestore: opérationnel
- Collection profils: /users/{UID}
- Rôles attendus:
  ADMIN
  GESTIONNAIRE
  CONTROLE
- Hotfix totalAppDisplayed inclus

RÈGLES DE STABILITÉ
1. Ne pas supprimer la collection /users.
2. Ne pas déplacer les profils utilisateurs vers /projects.
3. Le Document ID de chaque profil /users doit être exactement le UID Firebase Authentication.
4. Garder:
   active = true
   displayName = nom affiché
   role = ADMIN / GESTIONNAIRE / CONTROLE
5. Ne pas remplacer app.js sans sauvegarde.
6. Avant toute évolution: créer un nouveau numéro de version et conserver cette archive intacte.
7. Pour revenir à l'état stable, redéployer les fichiers de cette archive sur GitHub Pages.

IMPORTANT
Cette archive est une copie de sauvegarde de la version Hotfix actuellement utilisée comme base stable.
Elle ne modifie pas Firebase à elle seule.
