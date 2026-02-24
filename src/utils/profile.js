const { db } = require("../config/firebase");
const { DIET_MAP, ALLERGY_MAP, EQUIPMENT_NAMES } = require("./constants");

/**
 * Construit la section profil utilisateur pour les prompts Gemini.
 */
function buildProfileSection(culinary, diet, equipment) {
  const dietLabel = culinary.diet || diet || "";
  const allergies = culinary.allergies || [];
  const dislikes = culinary.dislikes || [];

  const dietRule = DIET_MAP[dietLabel]
    ? `\n- RÉGIME : ${DIET_MAP[dietLabel]}. INTERDIT de proposer des ingrédients incompatibles.`
    : "";
  const allergyRule =
    allergies.length > 0
      ? `\n- ALLERGIES : ${allergies.map((a) => ALLERGY_MAP[a] || a).join(", ")}. AUCUN ingrédient contenant ces allergènes.`
      : "";
  const dislikeRule =
    dislikes.length > 0
      ? `\n- DÉTESTE : ${dislikes.join(", ")}. NE JAMAIS utiliser.`
      : "";
  const equipmentRule =
    equipment.length > 0
      ? `\n- ÉQUIPEMENT : ${equipment.map((e) => EQUIPMENT_NAMES[e] || e).join(", ")}. Adapte les recettes.`
      : "";

  const section =
    dietRule || allergyRule || dislikeRule || equipmentRule
      ? `\n=== PROFIL UTILISATEUR (OBLIGATOIRE) ===${dietRule}${allergyRule}${dislikeRule}${equipmentRule}\n`
      : "";

  return { profileSection: section, dietLabel };
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

module.exports = { buildProfileSection, readUserProfile };
