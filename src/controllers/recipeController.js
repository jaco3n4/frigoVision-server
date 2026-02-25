const { ai } = require("../config/vertexai");
const { cleanAndParseJSON } = require("../utils/json");
const { validateText, validateArray } = require("../middleware/validate");
const { shuffleArray } = require("../utils/helpers");
const { DIET_MAP, ALLERGY_MAP, EQUIPMENT_NAMES } = require("../utils/constants");
const { quickRecipeSuggestionsSchema, fullRecipeSchema } = require("../schemas");
const { readUserProfile, buildProfileSection, buildEquipmentConstraint } = require("../utils/profile");

// =====================================================================
// generateRecipesAI
// =====================================================================

async function generateRecipesAI(req, res, next) {
  try {
    const { ingredients, mood, nutrition } = req.body;
    validateArray(ingredients, "Ingrédients");

    // Lire le profil complet depuis Firestore
    const { culinary, equipment } = await readUserProfile(req.user.uid);
    const { profileSection } = buildProfileSection(culinary, culinary.diet, equipment);
    const equipmentConstraint = buildEquipmentConstraint(equipment);

    let nutritionPrompt = "";
    if (nutrition) {
      if (nutrition.kcal) nutritionPrompt += ` - Cible: ${nutrition.kcal} kcal/pers.`;
      if (nutrition.protein) nutritionPrompt += ` - Protéines: ${nutrition.protein}g.`;
    }

    const systemPrompt = `
      Tu es un Chef Français étoilé ANTI-GASPI.
      Crée 2 recettes avec STRICTEMENT les ingrédients fournis + Fonds de placard (Sel, Poivre, Huile, Vinaigre, Eau).

      CONTRAINTES :
      - Ambiance : ${mood}
      ${nutritionPrompt}
      ${profileSection}${equipmentConstraint}
      Structure JSON attendue :
      { "recipes": [{ "title", "time", "difficulty", "calories", "ingredients_list", "steps", "chef_tip" }] }
    `;

    const userMessage = `Ingrédients : ${ingredients.join(", ")}`;
    console.log(JSON.stringify({ event: "AI_REQUEST", fn: "generateRecipesAI", systemPrompt, userMessage }));

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { role: "user", parts: [{ text: userMessage }] },
      ],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
      },
    });

    const rawResponse = result.text;
    console.log(JSON.stringify({ event: "AI_RESPONSE", fn: "generateRecipesAI", response: rawResponse }));

    return res.json(cleanAndParseJSON(rawResponse));
  } catch (error) {
    console.error("❌ Erreur generateRecipesAI:", error.message);
    next(error);
  }
}

// =====================================================================
// getRecipeDetails
// =====================================================================

async function getRecipeDetails(req, res, next) {
  try {
    const { dishTitle, ingredients } = req.body;
    validateText(dishTitle, "Titre du plat");
    validateArray(ingredients, "Ingrédients");
    const systemPrompt = `Recette étape par étape pour "${dishTitle}". JSON: { "steps": [], "chef_tip": "" }`;

    const userMessage = `Ingrédients dispos: ${ingredients?.join(", ")}`;
    console.log(JSON.stringify({ event: "AI_REQUEST", fn: "getRecipeDetails", systemPrompt, userMessage }));

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { role: "user", parts: [{ text: userMessage }] },
      ],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
      },
    });

    const rawResponse = result.text;
    console.log(JSON.stringify({ event: "AI_RESPONSE", fn: "getRecipeDetails", response: rawResponse }));

    return res.json(cleanAndParseJSON(rawResponse));
  } catch (error) {
    console.error("❌ Erreur getRecipeDetails:", error.message);
    next(error);
  }
}

// =====================================================================
// detectIngredientEmoji
// =====================================================================

async function detectIngredientEmoji(req, res) {
  try {
    const { text } = req.body;
    validateText(text, "Texte");
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Donne juste l'emoji pour : ${text}`,
    });
    return res.json({ emoji: result.text.trim() });
  } catch (error) {
    return res.json({ emoji: "" });
  }
}

// =====================================================================
// suggestRecipesQuick
// =====================================================================

async function suggestRecipesQuick(req, res, next) {
  try {
    const { userProfile, pantryItems, priorityIngredient } = req.body;
    validateArray(pantryItems, "Pantry items");

    let ingredientsList;
    if (priorityIngredient) {
      const others = (pantryItems || []).filter((i) => i.name !== priorityIngredient);
      ingredientsList = [priorityIngredient, ...shuffleArray(others).slice(0, 11).map((i) => i.name)];
    } else {
      ingredientsList = shuffleArray(pantryItems || []).slice(0, 12).map((i) => i.name);
    }
    const topIngredients = ingredientsList.join(", ") || "Basiques";

    const goal = userProfile?.context || "équilibré";
    const dietLabel = userProfile?.diet || "";
    const allergies = userProfile?.allergies || [];
    const dislikes = userProfile?.dislikes || [];
    const equipment = userProfile?.equipment || [];

    const dietRule = DIET_MAP[dietLabel]
      ? `\n- RÉGIME : ${DIET_MAP[dietLabel]}. INTERDIT de proposer des ingrédients incompatibles.`
      : "";
    const allergyRule = allergies.length > 0
      ? `\n- ALLERGIES : ${allergies.map((a) => ALLERGY_MAP[a] || a).join(", ")}. AUCUN ingrédient contenant ces allergènes.`
      : "";
    const dislikeRule = dislikes.length > 0
      ? `\n- DÉTESTE : ${dislikes.join(", ")}. NE JAMAIS utiliser ces ingrédients.`
      : "";
    const equipmentRule = equipment.length > 0
      ? `\n- ÉQUIPEMENT DISPONIBLE : ${equipment.map((e) => EQUIPMENT_NAMES[e] || e).join(", ")}. Adapte les recettes.`
      : "";
    const profileSection = (dietRule || allergyRule || dislikeRule || equipmentRule)
      ? `\n=== PROFIL UTILISATEUR (OBLIGATOIRE) ===${dietRule}${allergyRule}${dislikeRule}${equipmentRule}\n`
      : "";

    const priorityRule = priorityIngredient
      ? `\n=== ANTI-GASPI (PRIORITAIRE) ===\nL'ingrédient "${priorityIngredient}" EXPIRE BIENTÔT. Les 2 recettes DOIVENT OBLIGATOIREMENT l'utiliser comme ingrédient principal.\n`
      : "";

    const prompt = `Tu es un Chef cuisinier.
Ton but : Proposer 2 plats appétissants à partir de cet inventaire en vrac : ${topIngredients}
${profileSection}${priorityRule}
=== RÈGLES DE BON SENS (CRUCIAL) ===
1. TRI SÉMANTIQUE : L'inventaire contient des erreurs (suppléments sportifs, objets, produits non-comestibles). IGNORE-LES TOUS.
2. COHÉRENCE : Ne mélange jamais de la confiserie avec de la viande.
3. SI RIEN NE VA ENSEMBLE : Propose une recette très basique.
4. NOMS GÉNÉRIQUES : Les noms d'ingrédients doivent être GÉNÉRIQUES, SANS qualifier alimentaire (halal, casher, bio, vegan, fermier…). Ex: "Escalope de poulet", JAMAIS "Escalope de poulet halal".

=== TES 2 SUGGESTIONS ===
Recette 1 (IMMEDIATE - La Débrouille) :
- Titre : 2-4 mots. Utilise UNIQUEMENT des ingrédients de la liste.
- missing_ingredients DOIT être un tableau vide [].
- Temps : 15-20 min.

Recette 2 (OBJECTIVE - L'Optimisée - ${goal}) :
- Titre : 2-4 mots. Optimisée pour : ${goal}.
- DOIT inclure exactement 1 ou 2 ingrédients ABSENTS.
- missing_ingredients DOIT contenir ces 1-2 ingrédients. JAMAIS vide.
- upgrade_reason : 1 phrase.
- Temps : 25-40 min.

Réponds EXACTEMENT dans ce format JSON :
{
  "suggestions": [
    { "id": "1", "type": "IMMEDIATE", "title": "...", "subtitle": "...", "calories": "...", "time": "...", "match_score": 100, "used_ingredients": [...], "missing_ingredients": [], "upgrade_reason": "" },
    { "id": "2", "type": "OBJECTIVE", "title": "...", "subtitle": "...", "calories": "...", "time": "...", "match_score": 90, "used_ingredients": [...], "missing_ingredients": [...], "upgrade_reason": "..." }
  ]
}`;

    console.log(JSON.stringify({ event: "AI_REQUEST", fn: "suggestRecipesQuick", prompt }));

    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash-001",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: quickRecipeSuggestionsSchema,
        maxOutputTokens: 1536,
        temperature: 0.4,
      },
    });

    const rawText = result.text;
    console.log(JSON.stringify({ event: "AI_RESPONSE", fn: "suggestRecipesQuick", response: rawText }));

    let parsed;
    try { parsed = JSON.parse(rawText); }
    catch { parsed = cleanAndParseJSON(rawText); }

    if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
      throw new Error("Format invalide reçu de l'IA");
    }

    return res.json(parsed);
  } catch (error) {
    console.error("❌ Erreur suggestRecipesQuick:", error.message);
    next(error);
  }
}

// =====================================================================
// enrichRecipeSuggestions
// =====================================================================

async function enrichRecipeSuggestions(req, res) {
  try {
    const { suggestions, pantryItems } = req.body;
    validateArray(suggestions, "Suggestions");
    validateArray(pantryItems, "Pantry items");

    const ingredientsList = pantryItems?.map((i) => i.name).join(", ") || "";

    const prompt = `Pour ces 2 recettes, liste les ingrédients utilisés et manquants.

Recette 1: ${suggestions[0].title}
Recette 2: ${suggestions[1].title}

Ingrédients disponibles: ${ingredientsList}

JSON:
{
  "enriched": [
    { "id": "1", "used_ingredients": [...], "missing_ingredients": [] },
    { "id": "2", "used_ingredients": [...], "missing_ingredients": [...] }
  ]
}`;

    console.log(JSON.stringify({ event: "AI_REQUEST", fn: "enrichRecipeSuggestions", prompt }));

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 1024,
        temperature: 0.4,
      },
    });

    const rawResponse = result.text;
    console.log(JSON.stringify({ event: "AI_RESPONSE", fn: "enrichRecipeSuggestions", response: rawResponse }));
    const parsed = JSON.parse(rawResponse);

    const enrichedSuggestions = suggestions.map((sug, idx) => ({
      ...sug,
      used_ingredients: parsed.enriched[idx]?.used_ingredients || [],
      missing_ingredients: parsed.enriched[idx]?.missing_ingredients || [],
    }));

    return res.json({ suggestions: enrichedSuggestions });
  } catch (error) {
    console.error("❌ Erreur enrichRecipeSuggestions:", error.message);
    const { suggestions } = req.body;
    return res.json({
      suggestions: (suggestions || []).map((s) => ({
        ...s, used_ingredients: [], missing_ingredients: [],
      })),
    });
  }
}

// =====================================================================
// suggestRecipes (legacy)
// =====================================================================

async function suggestRecipes(req, res, next) {
  try {
    const { pantryItems } = req.body;
    validateArray(pantryItems, "Pantry items");

    // Lire le profil complet depuis Firestore
    const { culinary, equipment } = await readUserProfile(req.user.uid);
    const { profileSection } = buildProfileSection(culinary, culinary.diet, equipment);
    const equipmentConstraint = buildEquipmentConstraint(equipment);
    const goal = culinary.goal || "Manger sainement";

    const ingredientsList = pantryItems?.map((i) => i.name).join(", ") || "Rien (Fonds de placard seulement)";

    const prompt = `2 recettes rapides basées sur: ${ingredientsList}
${profileSection}${equipmentConstraint}
Règles:
- Recette 1 (IMMEDIATE): 100% dispo, rapide
- Recette 2 (OBJECTIVE): DOIT avoir 1-2 ingrédients manquants, ${goal}
- Titres: 3-4 mots max
- Subtitles: 1 phrase courte

JSON:
{
  "suggestions": [
    { "id": "1", "type": "IMMEDIATE", "title": "...", "subtitle": "...", "calories": "...", "time": "...", "match_score": 100, "used_ingredients": [...], "missing_ingredients": [] },
    { "id": "2", "type": "OBJECTIVE", "title": "...", "subtitle": "...", "calories": "...", "time": "...", "match_score": 90, "used_ingredients": [...], "missing_ingredients": [...] }
  ]
}`;

    console.log(JSON.stringify({ event: "AI_REQUEST", fn: "suggestRecipes", prompt }));

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 2048,
        temperature: 0.5,
      },
    });

    const rawResponse = result.text;
    console.log(JSON.stringify({ event: "AI_RESPONSE", fn: "suggestRecipes", response: rawResponse }));

    return res.json(cleanAndParseJSON(rawResponse));
  } catch (error) {
    console.error("❌ Erreur suggestRecipes:", error.message);
    next(error);
  }
}

// =====================================================================
// generateFullRecipe
// =====================================================================

async function generateFullRecipe(req, res, next) {
  try {
    const { selectedRecipeTitle, pantryItems, missingIngredients } = req.body;
    validateText(selectedRecipeTitle, "Titre recette");
    validateArray(pantryItems, "Pantry items");
    validateArray(missingIngredients, "Ingrédients manquants");

    // Lire le profil complet depuis Firestore
    const { culinary, equipment } = await readUserProfile(req.user.uid);
    const { profileSection } = buildProfileSection(culinary, culinary.diet, equipment);
    const equipmentConstraint = buildEquipmentConstraint(equipment);

    const inventoryWithQty = (pantryItems || [])
      .map((i) => (i.quantity ? `${i.name} (${i.quantity})` : i.name))
      .join(", ");
    const shoppingList = missingIngredients?.length > 0
      ? `Ingrédients à acheter: ${missingIngredients.join(", ")}`
      : "Aucun achat nécessaire.";

    const prompt = `
Recette choisie : "${selectedRecipeTitle}".
Génère le guide complet de préparation.

CONTEXTE: Frigo: ${inventoryWithQty}.
${shoppingList}
${profileSection}${equipmentConstraint}
RÈGLES DE GÉNÉRATION :
1. UNITÉS DES INGRÉDIENTS (CRUCIAL) : Pour chaque ingrédient du frigo, utilise EXACTEMENT la même unité.
2. NOMS GÉNÉRIQUES : SANS qualifier alimentaire (halal, casher, bio, vegan, fermier…). Ex: "Escalope de poulet", JAMAIS "Escalope de poulet halal".
3. Quantités précises pour TOUS les ingrédients.
3. Instructions claires et pédagogiques (4-6 étapes max).
4. prep_time et cook_time: Format "XX min".
5. difficulty: "Facile", "Moyen" ou "Difficile".
6. servings: Nombre entier.
7. calories_per_serving: Nombre entier.
8. IMAGE PROMPT : Génère un prompt en ANGLAIS pour une IA photo-réaliste (FAL/Flux).
   - Style obligatoire : "Professional food photography, Michelin star plating, 8K resolution, natural lighting, overhead shot, marble background, fresh ingredients, shallow depth of field, award-winning composition"
   - Ne mentionne JAMAIS : people, hands, text, watermark
9. chef_tip: Un conseil pratique du chef (1-2 phrases max).`;

    console.log(JSON.stringify({ event: "AI_REQUEST", fn: "generateFullRecipe", prompt }));

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: fullRecipeSchema,
        maxOutputTokens: 4096,
        temperature: 0.7,
      },
    });

    const rawResponse = result.text;
    console.log(JSON.stringify({ event: "AI_RESPONSE", fn: "generateFullRecipe", response: rawResponse }));

    const parsed = JSON.parse(rawResponse);
    return res.json(parsed);
  } catch (error) {
    console.error("❌ Erreur generateFullRecipe:", error.message);
    next(error);
  }
}

module.exports = {
  generateRecipesAI,
  getRecipeDetails,
  detectIngredientEmoji,
  suggestRecipesQuick,
  enrichRecipeSuggestions,
  suggestRecipes,
  generateFullRecipe,
};
