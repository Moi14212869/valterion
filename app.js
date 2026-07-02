import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, getDocs, doc, getDoc, setDoc, updateDoc, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";
import { RARITIES, RARITY_ORDER, rollRarity } from "./rarities.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const DAILY_PACKS = 5;
const PACK_SIZE = 5;
const DUPLICATES_PER_TRADE = 10;

let currentUser = null;
let userData = null;      // { lastClaimDate, packsRemaining, collection }
let allCards = [];        // [{id, title, description, imageUrl, rarity}]
let cardsByRarity = {};   // { commune: [...], rare: [...], ... }
let activeFilter = "all";

const el = {
  uidChip: document.getElementById("uid-chip"),
  pack: document.getElementById("pack"),
  packSub: document.getElementById("pack-sub"),
  packCount: document.getElementById("pack-count"),
  packDots: document.getElementById("pack-dots"),
  dupCount: document.getElementById("dup-count"),
  dupFill: document.getElementById("dup-fill"),
  tradeBtn: document.getElementById("trade-btn"),
  grid: document.getElementById("collection-grid"),
  meta: document.getElementById("collection-meta"),
  filters: document.getElementById("filters"),
  revealOverlay: document.getElementById("reveal-overlay"),
  revealCards: document.getElementById("reveal-cards"),
  revealClose: document.getElementById("reveal-close"),
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------------- Auth & user doc ----------------

signInAnonymously(auth).catch((err) => {
  console.error("Erreur d'authentification :", err);
  el.uidChip.textContent = "erreur de connexion";
});

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  currentUser = user;
  el.uidChip.textContent = `joueur · ${user.uid.slice(0, 6)}`;
  await loadCards();
  await loadOrCreateUser();
  render();
});

async function loadOrCreateUser() {
  const ref = doc(db, "users", currentUser.uid);
  const snap = await getDoc(ref);
  const today = todayStr();

  if (!snap.exists()) {
    userData = { lastClaimDate: today, packsRemaining: DAILY_PACKS, collection: {} };
    await setDoc(ref, userData);
    return;
  }

  userData = snap.data();
  if (!userData.collection) userData.collection = {};

  if (userData.lastClaimDate !== today) {
    userData.lastClaimDate = today;
    userData.packsRemaining = DAILY_PACKS;
    await updateDoc(ref, { lastClaimDate: today, packsRemaining: DAILY_PACKS });
  }
}

// ---------------- Cards ----------------

async function loadCards() {
  const snap = await getDocs(collection(db, "cards"));
  allCards = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  cardsByRarity = {};
  for (const key of RARITY_ORDER) cardsByRarity[key] = [];
  for (const card of allCards) {
    if (cardsByRarity[card.rarity]) cardsByRarity[card.rarity].push(card);
  }
}

function pickCardForRarity(rarity) {
  // Si aucune carte n'existe pour la rareté tirée, on retombe sur une rareté voisine disponible
  let pool = cardsByRarity[rarity];
  if (!pool || pool.length === 0) {
    const fallbackOrder = [...RARITY_ORDER].sort(
      (a, b) => Math.abs(RARITY_ORDER.indexOf(a) - RARITY_ORDER.indexOf(rarity)) -
                Math.abs(RARITY_ORDER.indexOf(b) - RARITY_ORDER.indexOf(rarity))
    );
    for (const key of fallbackOrder) {
      if (cardsByRarity[key] && cardsByRarity[key].length > 0) { pool = cardsByRarity[key]; break; }
    }
  }
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---------------- Pack opening ----------------

function drawPackCards() {
  const drawn = [];
  for (let i = 0; i < PACK_SIZE; i++) {
    const rarity = rollRarity();
    const card = pickCardForRarity(rarity);
    if (card) drawn.push(card);
  }
  return drawn;
}

el.pack.addEventListener("click", async () => {
  if (!userData || userData.packsRemaining <= 0) return;
  if (allCards.length === 0) {
    alert("Aucune carte n'a encore été ajoutée. Rends-toi sur la page \"Gestion des cartes\" pour en créer.");
    return;
  }

  el.pack.classList.add("opening");
  el.pack.style.pointerEvents = "none";

  setTimeout(async () => {
    const drawn = drawPackCards();

    userData.packsRemaining -= 1;
    const isNew = {};
    const collectionUpdates = {};
    for (const card of drawn) {
      isNew[card.id] = !userData.collection[card.id];
      userData.collection[card.id] = (userData.collection[card.id] || 0) + 1;
      collectionUpdates[`collection.${card.id}`] = increment(1);
    }

    const ref = doc(db, "users", currentUser.uid);
    await updateDoc(ref, { packsRemaining: userData.packsRemaining, ...collectionUpdates });

    el.pack.classList.remove("opening");
    el.pack.style.pointerEvents = "";
    showReveal(drawn, isNew);
    render();
  }, 480);
});

// ---------------- Trade duplicates for a pack ----------------

function getDuplicateCount() {
  let total = 0;
  for (const id of Object.keys(userData.collection || {})) {
    const count = userData.collection[id];
    if (count > 1) total += count - 1;
  }
  return total;
}

// Choisit quels doublons dépenser : on pioche d'abord dans les raretés
// les plus communes pour préserver les doublons rares le plus longtemps possible.
function pickDuplicatesToSpend(amount) {
  const toSpend = {};
  let remaining = amount;
  const sorted = [...allCards].sort(
    (a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity)
  );
  for (const card of sorted) {
    if (remaining <= 0) break;
    const owned = userData.collection[card.id] || 0;
    const surplus = owned - 1;
    if (surplus <= 0) continue;
    const take = Math.min(surplus, remaining);
    toSpend[card.id] = take;
    remaining -= take;
  }
  return remaining === 0 ? toSpend : null;
}

el.tradeBtn.addEventListener("click", async () => {
  if (!userData) return;
  if (allCards.length === 0) return;
  if (el.tradeBtn.disabled) return;

  const toSpend = pickDuplicatesToSpend(DUPLICATES_PER_TRADE);
  if (!toSpend) return; // pas assez de doublons, le bouton devrait déjà être désactivé

  el.tradeBtn.disabled = true;
  el.tradeBtn.textContent = "Échange en cours…";

  setTimeout(async () => {
    const drawn = drawPackCards();

    // On combine les mouvements (doublons dépensés en négatif, cartes tirées en positif)
    // en un delta net par carte, pour n'envoyer qu'une seule mise à jour par champ Firestore.
    const netDelta = {};
    for (const [id, amount] of Object.entries(toSpend)) {
      netDelta[id] = (netDelta[id] || 0) - amount;
    }

    const isNew = {};
    for (const card of drawn) {
      isNew[card.id] = !userData.collection[card.id];
      netDelta[card.id] = (netDelta[card.id] || 0) + 1;
    }

    const collectionUpdates = {};
    for (const [id, delta] of Object.entries(netDelta)) {
      if (delta === 0) continue;
      userData.collection[id] = (userData.collection[id] || 0) + delta;
      if (userData.collection[id] <= 0) delete userData.collection[id];
      collectionUpdates[`collection.${id}`] = increment(delta);
    }

    const ref = doc(db, "users", currentUser.uid);
    await updateDoc(ref, collectionUpdates);

    el.tradeBtn.disabled = false;
    el.tradeBtn.textContent = `Échanger ${DUPLICATES_PER_TRADE} doublons contre un pack`;
    showReveal(drawn, isNew);
    render();
  }, 300);
});

function showReveal(cards, isNew) {
  el.revealCards.innerHTML = "";
  cards.forEach((card, i) => {
    const node = buildCardElement(card, { isNew: isNew[card.id], delay: i * 0.12 });
    el.revealCards.appendChild(node);
  });
  el.revealOverlay.classList.add("active");
}

el.revealClose.addEventListener("click", () => {
  el.revealOverlay.classList.remove("active");
});

// ---------------- Rendering ----------------

function buildCardElement(card, opts = {}) {
  const rarity = RARITIES[card.rarity] || RARITIES.commune;
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.dataset.rarity = card.rarity;
  wrap.style.setProperty(`--${card.rarity}-glow`, rarity.glow);
  if (opts.delay) wrap.style.animationDelay = `${opts.delay}s`;

  wrap.innerHTML = `
    <div class="card-art" style="background-image:url('${card.imageUrl || ""}')">
      ${opts.isNew ? '<div class="card-new-badge">Nouveau</div>' : ""}
      <div class="card-rarity-tag" style="--tag-color:${rarity.color}">${rarity.label}</div>
    </div>
    <div class="card-body">
      <div class="card-title">${escapeHtml(card.title)}</div>
      <div class="card-desc">${escapeHtml(card.description || "")}</div>
    </div>
  `;
  return wrap;
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

function render() {
  if (!userData) return;

  el.packCount.textContent = userData.packsRemaining;
  el.packDots.innerHTML = "";
  for (let i = 0; i < DAILY_PACKS; i++) {
    const dot = document.createElement("div");
    dot.className = "pack-dot" + (i < userData.packsRemaining ? " filled" : "");
    el.packDots.appendChild(dot);
  }

  const canOpen = userData.packsRemaining > 0;
  el.pack.classList.toggle("disabled", !canOpen);
  el.pack.title = canOpen ? "Cliquer pour ouvrir un pack" : "Reviens demain pour tes prochains packs";
  el.packSub.textContent = canOpen ? "cliquer pour ouvrir" : "revenez demain";

  renderTradePanel();
  renderCollection();
}

function renderTradePanel() {
  const dupCount = getDuplicateCount();
  const capped = Math.min(dupCount, DUPLICATES_PER_TRADE);
  el.dupCount.textContent = dupCount;
  el.dupFill.style.width = `${(capped / DUPLICATES_PER_TRADE) * 100}%`;

  const canTrade = dupCount >= DUPLICATES_PER_TRADE;
  el.tradeBtn.disabled = !canTrade;
  el.tradeBtn.textContent = canTrade
    ? `Échanger ${DUPLICATES_PER_TRADE} doublons contre un pack`
    : `Échanger ${DUPLICATES_PER_TRADE} doublons contre un pack (${dupCount}/${DUPLICATES_PER_TRADE})`;
}

function renderCollection() {
  const owned = Object.keys(userData.collection || {}).length;
  el.meta.textContent = `${owned} / ${allCards.length} cartes découvertes`;

  const filtered = activeFilter === "all"
    ? allCards
    : allCards.filter((c) => c.rarity === activeFilter);

  el.grid.innerHTML = "";

  if (allCards.length === 0) {
    el.grid.innerHTML = `<div class="empty-state">Aucune carte n'existe encore. Ajoute-en depuis la page "Gestion des cartes".</div>`;
    return;
  }

  for (const card of filtered) {
    const count = userData.collection[card.id] || 0;
    const locked = count === 0;
    const rarity = RARITIES[card.rarity] || RARITIES.commune;

    const node = document.createElement("div");
    node.className = "card small" + (locked ? " locked" : "");
    node.dataset.rarity = card.rarity;
    node.innerHTML = `
      <div class="card-art" style="background-image:url('${locked ? "" : card.imageUrl || ""}')">
        <div class="card-rarity-tag" style="--tag-color:${rarity.color}">${rarity.label}</div>
        ${!locked ? `<div class="card-count">×${count}</div>` : ""}
      </div>
      <div class="card-body">
        <div class="card-title">${locked ? "???" : escapeHtml(card.title)}</div>
        <div class="card-desc">${locked ? "Carte non découverte" : escapeHtml(card.description || "")}</div>
      </div>
    `;
    el.grid.appendChild(node);
  }
}

el.filters.addEventListener("click", (e) => {
  const btn = e.target.closest(".filter-chip");
  if (!btn) return;
  el.filters.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("active"));
  btn.classList.add("active");
  activeFilter = btn.dataset.filter;
  renderCollection();
});
