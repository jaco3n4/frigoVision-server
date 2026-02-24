const { vertexAI } = require("../config/vertexai");
const { validateBase64 } = require("../middleware/validate");
const { cleanAndParseJSON } = require("../utils/json");

/**
 * POST /api/fridge/analyze
 * Analyse photo du frigo — détection d'ingrédients via Gemini Vision.
 */
async function analyzeFridgeImage(req, res, next) {
  try {
    const { image } = req.body;
    if (!image || typeof image !== "string") {
      return res.status(400).json({ error: "Image manquante ou invalide" });
    }
    validateBase64(image, "Image");

    const systemPrompt = `
      Expert inventaire alimentaire.
      Liste STRICTEMENT les ingrédients visibles.
      Ignorer les images sur emballages.
      Format JSON : ["Item1", "Item2"]
    `;

    const model = vertexAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: { parts: [{ text: systemPrompt }] },
    });

    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { text: "Scan l'image." },
            { inlineData: { mimeType: "image/jpeg", data: base64Data } },
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json" },
    });

    const parsed = cleanAndParseJSON(
      result.response.candidates[0].content.parts[0].text,
    );

    let finalIngredients = Array.isArray(parsed)
      ? parsed
      : parsed.ingredients || [];
    finalIngredients = [...new Set(finalIngredients)].filter(
      (i) => i && i.length > 1,
    );

    return res.json({ ingredients: finalIngredients });
  } catch (error) {
    console.error("❌ Erreur analyzeFridgeImage:", error.message);
    return res.json({ ingredients: [] });
  }
}

module.exports = { analyzeFridgeImage };
