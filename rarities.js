// ============================================================
// DÉFINITION DES RARETÉS
// Modifie les probabilités ici si tu veux rééquilibrer les packs.
// La somme des "weight" n'a pas besoin de faire 100, ce sont des poids relatifs.
// ============================================================

export const RARITIES = {
  commune: {
    label: "Commune",
    weight: 60,
    color: "#9CA3AF",
    glow: "rgba(156, 163, 175, 0.35)"
  },
  rare: {
    label: "Rare",
    weight: 25,
    color: "#38BDF8",
    glow: "rgba(56, 189, 248, 0.45)"
  },
  epique: {
    label: "Épique",
    weight: 11,
    color: "#A855F7",
    glow: "rgba(168, 85, 247, 0.55)"
  },
  legendaire: {
    label: "Légendaire",
    weight: 4,
    color: "#FBBF24",
    glow: "rgba(251, 191, 36, 0.7)"
  }
};

export const RARITY_ORDER = ["commune", "rare", "epique", "legendaire"];

// Tire une rareté au hasard selon les poids définis ci-dessus
export function rollRarity() {
  const total = RARITY_ORDER.reduce((sum, key) => sum + RARITIES[key].weight, 0);
  let roll = Math.random() * total;
  for (const key of RARITY_ORDER) {
    roll -= RARITIES[key].weight;
    if (roll <= 0) return key;
  }
  return RARITY_ORDER[0];
}
