const { ai } = require("../config/vertexai");
const { validateBase64 } = require("../middleware/validate");
const { cleanAndParseJSON } = require("../utils/json");

/**
 * POST /api/voice/analyze
 * Analyse une liste de courses vocale (audio m4a).
 */
async function analyzeVoiceList(req, res, next) {
  try {
    const { audioData } = req.body;
    if (!audioData || typeof audioData !== "string") {
      return res.status(400).json({ error: "Audio manquant" });
    }
    validateBase64(audioData, "Audio");

    const systemPrompt = `
      Tu es un assistant expert en gestion de stock alimentaire.
      OBJECTIF : Analyser l'audio pour extraire une liste d'ingrédients structurée.

      === 1. UNITÉS AUTORISÉES (strictement) ===
      - "kg", "g", "L", "cl", "pièce"
      Si l'utilisateur dit "pot", "paquet", "boite", "sachet", "tube"... -> unit: "pièce".

      === 2. QUANTITÉ & UNITÉ PAR DÉFAUT ===
      Si l'utilisateur précise une quantité/unité -> la retourner.
      Si l'utilisateur dit juste le nom :
      - VIANDES / POISSONS / VRAC -> quantity: "1", unit: "kg"
      - LIQUIDES -> quantity: "1", unit: "L"
      - FRUITS / LÉGUMES / OBJETS -> quantity: "1", unit: "pièce"

      === 3. CATÉGORIES AUTORISÉES ===
      - "Fruits & Légumes"
      - "Boucherie & Charcuterie"
      - "Poissons & Fruits de mer"
      - "Frais & Crémerie"
      - "Boulangerie & Pains"
      - "Épicerie & Condiments"
      - "Divers & Boissons"

      === 4. PÉREMPTION (shelfLifeInDays) ===
      - Viandes/Poissons crus : 3 jours
      - Plats préparés : 4 jours
      - Laitages / Légumes fragiles : 7-10 jours
      - Légumes racines / Fruits : 15-20 jours
      - Surgelés / Conserves / Sec : 365 jours

      === FORMAT JSON ===
      {
        "ingredients": [
          {
            "name": "Nom normalisé (singulier, majuscule)",
            "quantity": "Nombre",
            "unit": "Unité",
            "emoji": "Emoji",
            "shelfLifeInDays": NombreEntier,
            "category": "Catégorie exacte parmi la liste"
          }
        ]
      }
    `;

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: "Analyse cette liste de courses :" },
            { inlineData: { mimeType: "audio/m4a", data: audioData } },
          ],
        },
      ],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
      },
    });

    return res.json(cleanAndParseJSON(result.text));
  } catch (error) {
    console.error("❌ Erreur analyzeVoiceList:", error.message);
    next(error);
  }
}

module.exports = { analyzeVoiceList };
