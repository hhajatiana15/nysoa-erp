# Page indépendante de scan de présence

Adresse une fois les fichiers publiés dans la branche GitHub Pages :
`https://hhajatiana15.github.io/nysoa-erp/scan.html`

Le téléphone de l'agent ouvre cette page, choisit un chantier et scanne les badges des employés. La page utilise les collections Firebase `projects`, `employees`, `attendanceQR` et `attendanceWeekly` de l'ERP. Elle écrit aussi dans `attendanceScanState` pour empêcher deux scans simultanés ou répétés à moins de 30 secondes d'intervalle. Les scans sont enregistrés directement en ligne ; une erreur réseau ou de droits est affichée et **aucune réussite n'est annoncée** si l'écriture échoue.

## Mise en service

1. Publier `scan.html`, `scan.css` et `scan.js` à la racine du dépôt `hhajatiana15/nysoa-erp`, sur la branche actuellement utilisée par GitHub Pages.
2. Dans **Firebase Authentication**, créer un utilisateur distinct pour chaque agent scanner (e-mail et mot de passe). Ne pas transmettre un identifiant ERP à l'agent.
3. Dans **Cloud Firestore**, créer `users/{uid}` avec au minimum `active: true`, `role: "SCANNER"`, `displayName: "Nom de l'agent"`, `assignedProjects: ["ID_DU_CHANTIER"]`. Le `uid` doit être celui du compte créé dans Authentication. Si `assignedProjects` est vide, la page présente tous les chantiers autorisés par les règles Firestore.
4. Vérifier les **règles Firestore existantes**, qui ne figurent pas dans ce dépôt. Autoriser à ce rôle la lecture de son propre profil, la lecture des chantiers permis, la lecture d'un employé par ID de badge, et la lecture des scans du jour et du pointage de la semaine. Autoriser seulement les écritures nécessaires dans `attendanceQR`, `attendanceWeekly` et `attendanceScanState`. Interdire les autres écritures et garder les règles des autres rôles. La vérification du rôle côté navigateur ne remplace pas ces règles. Faire valider ces droits avant utilisation : le document employé actuel contient aussi des données qui ne concernent pas le scan.
5. Ouvrir le lien sur le téléphone en HTTPS, autoriser la caméra, puis tester un badge avec un compte SCANNER. Vérifier une entrée dans l'ERP et ensuite une sortie ; tester aussi deux scans espacés de moins de 30 secondes et un badge invalide.

La page n'est pas le module ERP. Les comptes `SCANNER` ne sont pas acceptés par l'interface `index.html`, dont les rôles autorisés restent ADMIN, GESTIONNAIRE, CONTROLE et TECHNICIEN. La connexion du scanner est conservée par Firebase sur le téléphone jusqu'à la déconnexion.

**Limite actuelle :** la page utilise la date UTC comme le module QR existant de l'ERP. Aux alentours de minuit à Madagascar, la journée affichée dans l'ERP peut suivre cette convention UTC. Une modification coordonnée des deux écrans est nécessaire pour utiliser le jour local.
