CORRECTION CONNEXION GESTIONNAIRE — ERP NYSOA

Erreur observée : « can't access property 'textContent', $(...) is null ».
Le code d'ouverture de session tentait d'écrire dans un élément HTML absent. Cela peut notamment arriver si index.html et app.js sont issus de versions différentes, ou si l'ancien app.js reste en cache.

Installation sur le dépôt GitHub Pages nysoa-erp :
1. Conserver une copie de index.html et app.js actuels.
2. Remplacer ensemble index.html et app.js à la racine du dépôt par ceux de ce ZIP.
3. Ne pas remplacer les autres fichiers du dépôt, en particulier les dossiers assets/ et les données.
4. Attendre la mise en ligne, puis faire une actualisation forcée (Ctrl+F5 sur PC, ou ouvrir une fenêtre privée).
5. Tester la connexion Gestionnaire. Si un message différent apparaît, le recopier : un profil Firestore absent, désactivé ou sans rôle GESTIONNAIRE exige une correction du compte par l'administrateur.

Ce correctif ne modifie aucun compte Firebase, mot de passe, document Firestore ou donnée ERP. Le test automatique inclus dans le ZIP source nécessite le logo du dépôt d'origine, absent de ce ZIP partiel.
