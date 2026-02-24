const { vertexAI } = require("../config/vertexai");
const { validateBase64 } = require("../middleware/validate");
const { cleanAndParseJSON } = require("../utils/json");

/**
 * POST /api/receipt/analyze
 * Analyse une photo de ticket de caisse.
 */
async function analyzeReceiptImage(req, res, next) {
  try {
    const { image } = req.body;
    if (!image || typeof image !== "string") {
      return res.status(400).json({ error: "Image manquante ou invalide" });
    }
    validateBase64(image, "Image ticket");

    const systemPrompt = `
      Tu es un expert en analyse de tickets de caisse (OCR + extraction).

      === OBJECTIF ===
      Extraire TOUS les produits alimentaires achetés avec leurs quantités si disponibles.

      === RÈGLES D'EXTRACTION ===
      1. Ignorer : Les totaux, les lignes de TVA, les moyens de paiement, les lignes non-alimentaires
      2. Pour chaque produit alimentaire :
         - name : Nom du produit (normalisé, singulier, première lettre majuscule)
         - quantity : Quantité extraite si présente, sinon "1"
         - price : Prix unitaire si disponible (nombre en euros)
         - category : Catégorie estimée

      3. Normalisation intelligente :
         - "POMME DE TERRE 1KG" -> { name: "Pomme de terre", quantity: "1kg", category: "fruits-legumes" }
         - "LAIT ENTIER x2" -> { name: "Lait entier", quantity: "2", category: "produits-laitiers" }

      4. Gestion des lignes multiples : Regroupe intelligemment les informations

      === FORMAT DE SORTIE (JSON) ===
      {
        "store_name": "Nom du magasin si détectable",
        "date": "Date du ticket si détectable (YYYY-MM-DD)",
        "total": "Total en euros (nombre)",
        "products": [
          {
            "name": "Nom normalisé",
            "quantity": "Quantité avec unité",
            "price": "Prix en euros (nombre)",
            "category": "Catégorie"
          }
        ]
      }

      === IMPORTANT ===
      - Si un produit apparaît plusieurs fois, garde les occurrences séparées
      - Concentre-toi sur les produits alimentaires uniquement
      - Si le ticket est illisible, retourne products: []
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
            { text: "Analyse ce ticket de caisse et extrais tous les produits alimentaires." },
            { inlineData: { mimeType: "image/jpeg", data: base64Data } },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const parsed = cleanAndParseJSON(
      result.response.candidates[0].content.parts[0].text,
    );

    if (!parsed.products || !Array.isArray(parsed.products)) {
      return res.json({
        store_name: parsed.store_name || null,
        date: parsed.date || null,
        total: parsed.total || null,
        products: [],
      });
    }

    const validProducts = parsed.products.filter(
      (p) => p.name && typeof p.name === "string" && p.name.length > 1,
    );

    return res.json({
      store_name: parsed.store_name || null,
      date: parsed.date || null,
      total: parsed.total || null,
      products: validProducts,
    });
  } catch (error) {
    console.error("❌ Erreur analyzeReceiptImage:", error.message);
    next(error);
  }
}

module.exports = { analyzeReceiptImage };
