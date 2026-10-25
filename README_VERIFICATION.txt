NYSOA ERP — correction de test (25/10/2026)

Base: nysoa-erp-dark-huptech-fixe.zip, puis correctif préliminaire.

Correction supplémentaire :
- Lorsqu’un compte Firebase authentifié provoque une erreur de démarrage, l’ERP affiche un diagnostic au lieu de masquer l’application / déconnecter silencieusement.
- Correction du chemin du logo et de l’icône manifest vers le SVG fourni.
- Versionnage des assets et du cache Service Worker afin de limiter les anciennes versions sur GitHub Pages.
- Les modules métiers sont conservés; aucune donnée Firestore n’a été modifiée.
- Le mode Démo n’est pas réintroduit; connexion réelle Firebase seulement.

LIMITES: examen statique et test syntaxique JavaScript, sans test E2E ni connexion Firebase.
Installation: publier le CONTENU du dossier www à la racine du dépôt GitHub Pages (si la branche est configurée à la racine), pas le dossier www lui-même. Faire une sauvegarde GitHub et vérifier les règles Firestore avant toute utilisation réelle.
Après publication: recharger avec Cmd+Shift+R, contrôler Firebase Authentication, rôles, puis valider les modules sur des données de test.
