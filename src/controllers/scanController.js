const { ai } = require("../config/vertexai");
const { validateArray } = require("../middleware/validate");
const { cleanAndParseJSON } = require("../utils/json");

/**
 * POST /api/scan/products
 * Normalise et enrichit une liste de produits scannés.
 */
async function analyzeScannedProducts(req, res, next) {
  try {
    const { products } = req.body;
    validateArray(products, "Produits");

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: "Liste de produits manquante ou vide" });
    }

    const systemPrompt = `
      Tu es un assistant expert en gestion de stock alimentaire.
      OBJECTIF : Enrichir et normaliser une liste de produits scannés.

      === 1. RÈGLES STRICTES POUR LES UNITÉS ===
      - "kg", "g", "L", "cl", "pièce"

      === 2. INTELLIGENCE DES UNITÉS PAR DÉFAUT ===
      - VIANDES / POISSONS / VRAC -> "kg"
      - LIQUIDES -> "L"
      - FRUITS / LÉGUMES / PRODUITS UNITAIRES -> "pièce"
      - Si quantity contient déjà une unité, extrais-la

      === 3. EXTRACTION INTELLIGENTE DE LA QUANTITÉ ===
      Si le produit a déjà une quantité : Extrait le nombre ET l'unité.
      Sinon, mets quantity: "1" avec l'unité appropriée.

      === 4. DÉTECTION DES DOUBLONS ===
      Si plusieurs produits ont le même nom normalisé, fusionne-les.

      === 5. ESTIMATION PÉREMPTION (shelfLifeInDays) ===
      - Viandes/Poissons crus : 3 jours
      - Plats préparés : 4 jours
      - Laitages / Légumes fragiles : 7-10 jours
      - Légumes racines / Fruits : 15-20 jours
      - Surgelés / Conserves / Sec : 365 jours

      === FORMAT DE SORTIE (JSON) ===
      {
        "ingredients": [
          {
            "name": "Nom normalisé",
            "quantity": "Nombre",
            "unit": "Unité normalisée",
            "emoji": "Emoji",
            "shelfLifeInDays": NombreEntier,
            "brand": "Marque (optionnel)",
            "category": "Catégorie normalisée"
          }
        ]
      }
    `;

    const productsText = products
      .map(
        (p, i) =>
          `${i + 1}. ${p.name}${p.brand ? ` (${p.brand})` : ""}${p.quantity ? ` - ${p.quantity}` : ""}${p.category ? ` [${p.category}]` : ""}`,
      )
      .join("\n");

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Enrichis et normalise ces produits scannés :\n\n${productsText}\n\nDétecte les doublons, normalise les quantités, ajoute les durées de vie et émojis manquants.`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        temperature: 0.3,
      },
    });

    return res.json(cleanAndParseJSON(result.text));
  } catch (error) {
    console.error("❌ Erreur analyzeScannedProducts:", error.message);
    next(error);
  }
}

module.exports = { analyzeScannedProducts };
