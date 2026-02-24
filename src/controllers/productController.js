const { ai } = require("../config/vertexai");
const { cleanAndParseJSON } = require("../utils/json");
const { cardsPreviewSchema } = require("../schemas");

// =====================================================================
// checkProductCompliance (Le Coach)
// =====================================================================

async function checkProductCompliance(req, res, next) {
  try {
    const { productInfo, userProfile } = req.body;

    let activeAllergies = "AUCUNE";
    if (userProfile.allergies) {
      const detected = Object.entries(userProfile.allergies)
        .filter(([_, isActive]) => isActive)
        .map(([key]) => key.toUpperCase());
      if (detected.length > 0) activeAllergies = detected.join(", ");
    }

    const systemPrompt = `
      Tu es le "Coach Nutritionnel".

      === RÈGLES ===
      1. SÉCURITÉ (PHASE 1) :
         - Halal : Porc, Alcool, Gelatine animale INTERDITS.
         - Allergies : Vérifie UNIQUEMENT la liste [${activeAllergies}].

      2. QUALITÉ (PHASE 2) :
         - Si Nutriscore D/E ou Sucre élevé -> WARNING (Orange).

      === OUTPUT JSON ===
      {
        "raisonnement_securite": "...",
        "raisonnement_nutrition": "...",
        "status": "compatible" | "warning" | "danger",
        "title": "Titre",
        "message": "Message",
        "coach_advice": "Conseil",
        "coach_color": "green" | "orange" | "red"
      }
    `;

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { role: "user", parts: [{ text: `PRODUIT: ${JSON.stringify(productInfo)}` }] },
      ],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        temperature: 0,
      },
    });

    return res.json(cleanAndParseJSON(result.text));
  } catch (error) {
    console.error("❌ Erreur checkProductCompliance:", error.message);
    return res.json({
      status: "warning",
      coach_color: "orange",
      coach_advice: "Analyse indisponible (Erreur IA : " + error.message + ")",
    });
  }
}

// =====================================================================
// getProductCookingGuide
// =====================================================================

async function getProductCookingGuide(req, res) {
  const FALLBACK_DATA = {
    product_vibe: "unknown",
    cooking_info: { method: "SCAN", time: "-", details: "Info indisponible" },
    cards: { immediate: null, objective: null },
  };

  try {
    const {
      productName, ingredients, nutriments, categories,
      pantryItems, userProfile, kitchenEquipment,
    } = req.body;

    const pantryText = pantryItems?.map((i) => i.name).join(", ") || "Basiques";
    const userGoal = userProfile?.context || "Équilibré";
    const equipmentText = kitchenEquipment?.length > 0 ? kitchenEquipment.join(", ") : "Standard";

    const kcal = nutriments?.["energy-kcal_100g"] ? Math.round(nutriments["energy-kcal_100g"]) : "?";
    const prot = nutriments?.proteins_100g || "?";
    const macroInfo = `${kcal}kcal, ${prot}g prot`;

    const prompt = `
        Tu es un Chef IA.
        CONTEXTE: Produit="${productName}", Categorie="${categories}".
        Nutri (100g): ${macroInfo}.
        User: Objectif="${userGoal}", Frigo=[${pantryText}], Matériel=[${equipmentText}].

        RÈGLES:
        1. "cooking_info":
           - Si produit brut -> method=équipement (ex: POÊLE).
           - Si prêt-à-manger -> method="CONSEIL", time="DÉGUSTATION".
        2. "cards":
           - immediate: Recette faisable MAINTENANT.
           - objective: Recette idéale pour l'objectif.
           - Titres courts et percutants.
      `;

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: cardsPreviewSchema,
        maxOutputTokens: 8192,
        temperature: 0.4,
      },
    });

    const data = JSON.parse(result.text);
    return res.json(data);
  } catch (error) {
    console.error("❌ Erreur getProductCookingGuide:", error.message);
    return res.json(FALLBACK_DATA);
  }
}

module.exports = { checkProductCompliance, getProductCookingGuide };
