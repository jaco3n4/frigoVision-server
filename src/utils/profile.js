const { db } = require("../config/firebase");
const { DIET_MAP, ALLERGY_MAP, EQUIPMENT_NAMES } = require("./constants");

const SPICE_MAP = {
  doux: "Doux (pas de piment, épices légères)",
  moyen: "Moyen (épicé modéré)",
  releve: "Relevé (aime le piquant et les saveurs fortes)",
};

const LEVEL_MAP = {
  debutant: "Débutant (recettes simples, peu d'étapes)",
  intermediaire: "Intermédiaire",
  confirme: "Confirmé (techniques avancées bienvenues)",
};

const BUDGET_MAP = {
  econome: "Économe (ingrédients accessibles)",
  equilibre: "Équilibré",
  gourmet: "Gourmet (ingrédients premium acceptés)",
};

const GOAL_MAP = {
  leger: "Léger (portions légères, peu calorique)",
  equilibre: "Équilibré",
  proteine: "Protéiné (riche en protéines)",
};

/**
 * Construit la section profil utilisateur pour les prompts Gemini.
 */
function buildProfileSection(culinary, diet, equipment) {
  const dietLabel = culinary.diet || diet || "";
  const allergies = culinary.allergies || [];
  const dislikes = culinary.dislikes || [];
  const spiceLevel = culinary.spiceLevel || "";
  const cookingLevel = culinary.cookingLevel || "";
  const cookingTime = culinary.cookingTime || "";
  const worldCuisines = culinary.worldCuisines || [];
  const budget = culinary.budget || "";
  const goal = culinary.goal || "";

  const rules = [];

  if (DIET_MAP[dietLabel]) {
    rules.push(`- RÉGIME : ${DIET_MAP[dietLabel]}. INTERDIT de proposer des ingrédients incompatibles.`);
  }
  if (allergies.length > 0) {
    rules.push(`- ALLERGIES : ${allergies.map((a) => ALLERGY_MAP[a] || a).join(", ")}. AUCUN ingrédient contenant ces allergènes.`);
  }
  if (dislikes.length > 0) {
    rules.push(`- INGRÉDIENTS INTERDITS : ${dislikes.join(", ")}. NE JAMAIS utiliser.`);
  }
  if (equipment.length > 0) {
    rules.push(`- ÉQUIPEMENT : ${equipment.map((e) => EQUIPMENT_NAMES[e] || e).join(", ")}. Adapte les recettes.`);
  }
  if (SPICE_MAP[spiceLevel]) {
    rules.push(`- ÉPICES : ${SPICE_MAP[spiceLevel]}.`);
  }
  if (LEVEL_MAP[cookingLevel]) {
    rules.push(`- NIVEAU CUISINE : ${LEVEL_MAP[cookingLevel]}.`);
  }
  if (cookingTime) {
    rules.push(`- TEMPS MAX PAR RECETTE : ${cookingTime} min.`);
  }
  if (worldCuisines.length > 0) {
    rules.push(`- CUISINES PRÉFÉRÉES : ${worldCuisines.join(", ")}. Privilégie ces styles.`);
  }
  if (BUDGET_MAP[budget]) {
    rules.push(`- BUDGET : ${BUDGET_MAP[budget]}.`);
  }
  if (GOAL_MAP[goal]) {
    rules.push(`- OBJECTIF : ${GOAL_MAP[goal]}.`);
  }

  const section = rules.length > 0
    ? `\n=== PROFIL UTILISATEUR (OBLIGATOIRE) ===\n${rules.join("\n")}\n`
    : "";

  return { profileSection: section, dietLabel };
}

/**
 * Construit la contrainte matériel stricte (conditionnelle).
 * Retourne un bloc prompt uniquement si l'utilisateur n'a PAS de four.
 */
function buildEquipmentConstraint(equipment) {
  const hasOven = Array.isArray(equipment) && equipment.includes("four");
  if (hasOven) return "";
  return `\n=== CONTRAINTE MATÉRIEL STRICTE ===\nL'utilisateur ne possède PAS de four. INTERDICTION ABSOLUE de proposer des plats "gratinés", "rôtis" ou cuits au four. Adapte pour cuisson à la poêle, casserole ou micro-ondes.\n`;
}

/**
 * Lit le profil utilisateur depuis Firestore.
 */
async function readUserProfile(uid) {
  let pantryItems = [];
  let culinary = {};
  let equipment = [];
  try {
    const userDoc = await db.doc(`users/${uid}`).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      pantryItems = data.pantry || [];
      culinary = data.culinaryProfile || {};
      equipment = data.equipment || [];
    }
  } catch (err) {
    console.warn("⚠️ Impossible de lire le profil utilisateur:", err.message);
  }
  return { pantryItems, culinary, equipment };
}

module.exports = { buildProfileSection, buildEquipmentConstraint, readUserProfile };
