# ERP-Nysoa Construct — Module Redressement Financier, Devis & Contrôle Budget

Ce package est prêt à être déployé directement par **Glisser-Déposer (Drag & Drop) sur Netlify** ou poussé sur un dépôt **GitHub**.

## Fonctionnalités incluses
1. **Suivi des Budgets Chantiers & Alertes de Plafond (Temps Réel) :**
   - Barre de progression par chantier comparant les **Dépenses réelles (Matériaux + Pointage Main-d'œuvre)** au **Plafond autorisé**.
   - **Alerte Orange automatique** dès que le chantier atteint **80%** de son budget.
   - **Alerte Rouge + Blocage de sécurité (Confirmation requise)** si une dépense ou un pointage fait dépasser **100%** du plafond.
   - Suivi des **Acomptes clients** et du **Reste à recouvrer**.
2. **Workflow de Validation de Devis en 3 étapes :**
   - *Étape 1 :* Devis créé et envoyé au client.
   - *Étape 2 :* Négociation commerciale & Réduction (en Ariary ou en %) avec alerte si la marge nette descend sous **15%**. Le plafond de dépenses chantier reste protégé.
   - *Étape 3 :* Validation finale qui transforme automatiquement le Devis en **Budget Chantier Actif**.
3. **Saisie de Budget Manuel (Mode Sans Devis) :**
   - Pour les dépannages urgents ou travaux au forfait ne passant pas par un devis formel.

## Comment mettre en ligne sur Netlify (en 30 secondes)
1. Décompressez ce fichier ZIP (ou glissez directement le dossier sur [https://app.netlify.com/drop](https://app.netlify.com/drop)).
2. Votre application est immédiatement fonctionnelle !

## Comment connecter votre base Firebase existante
Ouvrez `firebase-service.js` et remplacez l'objet `firebaseConfig` par les identifiants de votre projet Firebase **ERP-Nysoa**.
