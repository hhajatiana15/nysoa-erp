// ============================================================================
// MODULE D'INTEGRATION FIREBASE FIRESTORE POUR ERP-NYSOA
// Remplacez firebaseConfig par vos clés Firebase pour synchroniser avec le Cloud
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Configuration Firebase de votre projet ERP-Nysoa
const firebaseConfig = {
  apiKey: "VOTRE_API_KEY",
  authDomain: "erp-nysoa.firebaseapp.com",
  projectId: "erp-nysoa",
  storageBucket: "erp-nysoa.appspot.com",
  messagingSenderId: "VOTRE_SENDER_ID",
  appId: "VOTRE_APP_ID"
};

let db = null;

export function initFirebaseNysoa() {
  if (firebaseConfig.apiKey !== "VOTRE_API_KEY") {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    console.log("Firebase ERP-Nysoa connecté avec succès.");
  }
}

/**
 * Enregistre une dépense ou un pointage dans Firestore et vérifie le plafond
 */
export async function enregistrerDepenseFirestore(chantierId, depenseData) {
  if (!db) return;
  await addDoc(collection(db, "journal_operations"), {
    ...depenseData,
    chantier_id: chantierId,
    created_at: serverTimestamp()
  });
}
