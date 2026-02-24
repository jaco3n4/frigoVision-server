const { vertexAI } = require("../config/vertexai");
const { cleanAndParseJSON } = require("../utils/json");

/**
 * POST /api/shopping/classify
 */
async function classifyShoppingItem(req, res, next) {
  try {
    const { itemName } = req.body;

    if (!itemName || typeof itemName !== "string") {
      return res.json({ name: "Inconnu", amount: null, unit: null, emoji: "🛒" });
    }

    const systemPrompt = `
      Tu es une API d'extraction de données pour liste de courses.
      Tu ne réponds QUE du JSON strict.

      RÈGLES D'EXTRACTION :
      1. name : Le nom de l'ingrédient normalisé (Singulier, Première lettre majuscule).
      2. amount : La quantité numérique (Number) ou null.
      3. unit : L'unité (String: "kg", "g", "L", "boite", etc.) ou null.
      4. emoji : Un emoji pertinent.

      EXEMPLES (Few-Shot) :
      - "2 kg de pommes" -> {"name": "Pomme", "amount": 2, "unit": "kg", "emoji": "🍎"}
      - "du lait" -> {"name": "Lait", "amount": null, "unit": null, "emoji": "🥛"}
      - "6 oeufs" -> {"name": "Oeuf", "amount": 6, "unit": "pièce", "emoji": "🥚"}
      - "Sucre" -> {"name": "Sucre", "amount": null, "unit": null, "emoji": "🧂"}
    `;

    const model = vertexAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: { parts: [{ text: systemPrompt }] },
    });

    const result = await model.generateContent({
      contents: [
        { role: "user", parts: [{ text: `Analyse : "${itemName}"` }] },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,
      },
    });

    return res.json(
      cleanAndParseJSON(result.response.candidates[0].content.parts[0].text),
    );
  } catch (error) {
    console.error("❌ Erreur classifyShoppingItem:", error.message);
    return res.json({ name: req.body.itemName || "Inconnu", amount: null, unit: null, emoji: "🛒" });
  }
}

module.exports = { classifyShoppingItem };
