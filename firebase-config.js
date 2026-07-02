// ============================================================
// CONFIGURATION FIREBASE
// ============================================================
// 1. Va sur https://console.firebase.google.com
// 2. Crée un projet (ou utilise un projet existant)
// 3. Ajoute une "application web" et copie la config qu'on te donne ici
// 4. Active dans la console :
//      - Authentication > Sign-in method > "Anonyme"
//      - Firestore Database > Créer une base (mode production)
//      - Storage > Commencer
// 5. Colle tes clés ci-dessous
// ============================================================

const firebaseConfig = {
  apiKey: "VOTRE_API_KEY",
  authDomain: "VOTRE_PROJET.firebaseapp.com",
  projectId: "VOTRE_PROJET",
  storageBucket: "VOTRE_PROJET.appspot.com",
  messagingSenderId: "VOTRE_SENDER_ID",
  appId: "VOTRE_APP_ID"
};

// Import Firebase (SDK modulaire v10, via CDN, utilisé dans app.js / admin.js)
export { firebaseConfig };
