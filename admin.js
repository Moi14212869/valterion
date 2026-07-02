import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";
import { RARITIES, RARITY_ORDER } from "./rarities.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Dossier du dépôt GitHub où sont déposées les images des cartes.
// Chemin relatif : fonctionne aussi bien en local, sur Firebase Hosting
// que sur GitHub Pages (même dans un sous-dossier /nom-du-repo/).
const IMAGE_FOLDER = "image/";

const el = {
  uidChip: document.getElementById("uid-chip"),

  loginScreen: document.getElementById("login-screen"),
  loginForm: document.getElementById("login-form"),
  loginEmail: document.getElementById("login-email"),
  loginPassword: document.getElementById("login-password"),
  loginBtn: document.getElementById("login-btn"),
  loginStatus: document.getElementById("login-status"),

  adminContent: document.getElementById("admin-content"),
  logoutBtn: document.getElementById("logout-btn"),

  form: document.getElementById("card-form"),
  title: document.getElementById("title"),
  description: document.getElementById("description"),
  imageName: document.getElementById("image-name"),
  filePreview: document.getElementById("file-preview"),
  rarityGrid: document.getElementById("rarity-grid"),
  rarityInput: document.getElementById("rarity"),
  submitBtn: document.getElementById("submit-btn"),
  statusMsg: document.getElementById("status-msg"),
  adminList: document.getElementById("admin-list"),
  adminCount: document.getElementById("admin-count"),
};

// ---------------- Auth state ----------------

onAuthStateChanged(auth, (user) => {
  if (user) {
    el.uidChip.textContent = `admin · ${user.email || user.uid.slice(0, 6)}`;
    el.loginScreen.style.display = "none";
    el.adminContent.style.display = "block";
    loadCardList();
  } else {
    el.uidChip.textContent = "non connecté";
    el.loginScreen.style.display = "block";
    el.adminContent.style.display = "none";
  }
});

el.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideLoginStatus();
  el.loginBtn.disabled = true;
  el.loginBtn.textContent = "Connexion…";

  try {
    await signInWithEmailAndPassword(auth, el.loginEmail.value.trim(), el.loginPassword.value);
    el.loginForm.reset();
  } catch (err) {
    showLoginStatus(loginErrorMessage(err), "error");
  } finally {
    el.loginBtn.disabled = false;
    el.loginBtn.textContent = "Se connecter";
  }
});

el.logoutBtn.addEventListener("click", () => signOut(auth));

function loginErrorMessage(err) {
  switch (err.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "E-mail ou mot de passe incorrect.";
    case "auth/too-many-requests":
      return "Trop de tentatives. Réessaie dans quelques minutes.";
    case "auth/invalid-email":
      return "Adresse e-mail invalide.";
    default:
      return "Connexion impossible : " + err.message;
  }
}

function showLoginStatus(msg, type) {
  el.loginStatus.textContent = msg;
  el.loginStatus.className = `status-msg ${type}`;
}
function hideLoginStatus() {
  el.loginStatus.className = "status-msg";
}

// ---------------- Rarity picker ----------------

RARITY_ORDER.forEach((key, i) => {
  const rarity = RARITIES[key];
  const btn = document.createElement("div");
  btn.className = "rarity-option" + (i === 0 ? " active" : "");
  btn.style.setProperty("--opt-color", rarity.color);
  btn.textContent = rarity.label;
  btn.dataset.key = key;
  btn.addEventListener("click", () => {
    el.rarityGrid.querySelectorAll(".rarity-option").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    el.rarityInput.value = key;
  });
  el.rarityGrid.appendChild(btn);
});
el.rarityInput.value = RARITY_ORDER[0];

// ---------------- Image preview (fichier déjà présent dans image/ sur GitHub) ----------------

el.imageName.addEventListener("input", () => {
  const name = el.imageName.value.trim();
  if (!name) {
    el.filePreview.style.display = "none";
    el.filePreview.removeAttribute("src");
    return;
  }
  el.filePreview.src = IMAGE_FOLDER + name;
  el.filePreview.style.display = "block";
});

el.filePreview.addEventListener("error", () => {
  if (el.filePreview.getAttribute("src")) {
    el.filePreview.style.display = "none";
  }
});

// ---------------- Submit ----------------

el.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideStatus();

  if (!auth.currentUser) {
    showStatus("Tu dois être connecté pour ajouter une carte.", "error");
    return;
  }

  const fileName = el.imageName.value.trim();
  if (!fileName) {
    showStatus("Indique le nom du fichier image.", "error");
    return;
  }

  el.submitBtn.disabled = true;
  el.submitBtn.textContent = "Ajout en cours…";

  try {
    await addDoc(collection(db, "cards"), {
      title: el.title.value.trim(),
      description: el.description.value.trim(),
      imageFile: fileName,
      imageUrl: IMAGE_FOLDER + fileName,
      rarity: el.rarityInput.value,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.uid,
    });

    showStatus("Carte ajoutée avec succès.", "success");
    resetForm();
    await loadCardList();
  } catch (err) {
    console.error(err);
    showStatus("Erreur lors de l'ajout : " + err.message, "error");
  } finally {
    el.submitBtn.disabled = false;
    el.submitBtn.textContent = "Ajouter la carte";
  }
});

function resetForm() {
  el.form.reset();
  el.filePreview.style.display = "none";
  el.filePreview.removeAttribute("src");
  el.rarityGrid.querySelectorAll(".rarity-option").forEach((b, i) => b.classList.toggle("active", i === 0));
  el.rarityInput.value = RARITY_ORDER[0];
}

function showStatus(msg, type) {
  el.statusMsg.textContent = msg;
  el.statusMsg.className = `status-msg ${type}`;
}
function hideStatus() {
  el.statusMsg.className = "status-msg";
}

// ---------------- List & delete ----------------

async function loadCardList() {
  el.adminList.innerHTML = `<div class="loader"></div>`;
  const q = query(collection(db, "cards"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  const cards = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  el.adminCount.textContent = `${cards.length} carte${cards.length > 1 ? "s" : ""}`;

  if (cards.length === 0) {
    el.adminList.innerHTML = `<div class="empty-state">Aucune carte pour l'instant. Ajoute la première avec le formulaire.</div>`;
    return;
  }

  el.adminList.innerHTML = "";
  for (const card of cards) {
    const rarity = RARITIES[card.rarity] || RARITIES.commune;
    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML = `
      <img src="${card.imageUrl || ""}" alt="" onerror="this.style.visibility='hidden'">
      <div class="admin-row-info">
        <div class="admin-row-title">${escapeHtml(card.title)}</div>
        <div class="admin-row-desc">${escapeHtml(card.imageFile || card.description || "")}</div>
      </div>
      <div class="admin-row-rarity" style="color:${rarity.color}">${rarity.label}</div>
      <button class="icon-btn" title="Supprimer" data-id="${card.id}">✕</button>
    `;
    el.adminList.appendChild(row);
  }

  el.adminList.querySelectorAll(".icon-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteCard(btn.dataset.id));
  });
}

async function deleteCard(id) {
  if (!confirm("Supprimer définitivement cette carte ? Les joueurs qui la possèdent déjà la garderont dans leur historique. (L'image reste dans le dossier image/ du dépôt, à supprimer manuellement si besoin.)")) return;
  try {
    await deleteDoc(doc(db, "cards", id));
    await loadCardList();
  } catch (err) {
    alert("Erreur lors de la suppression : " + err.message);
  }
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}
