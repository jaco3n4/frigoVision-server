const { ai } = require("../config/vertexai");
const { cleanAndParseJSON } = require("../utils/json");

/**
 * POST /api/profile/summary
 * Génère un résumé de confirmation du profil culinaire.
 */
async function generateCulinaryProfileSummary(req, res) {
  try {
    const { diet, allergies, dislikes, goal } = req.body;

    const systemPrompt = `
      Tu es un Chef personnel bienveillant et professionnel.
      Ton client vient de mettre à jour son profil culinaire.

      Données du client :
      - Régime : ${diet}
      - Allergies/Intolérances : ${allergies && allergies.length > 0 ? allergies.join(", ") : "Aucune"}
      - Ingrédients détestés : ${dislikes && dislikes.length > 0 ? dislikes.join(", ") : "Aucun"}
      - Objectif : ${goal}

      Tâche :
      Rédige une courte phrase de confirmation (max 20 mots) qui montre que tu as bien compris ses contraintes et que tu vas t'adapter. Sois positif.
      Ne répète pas bêtement la liste, fais une synthèse naturelle.

      Format de réponse attendu (JSON) :
      { "summary": "Ta phrase ici." }
    `;

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { role: "user", parts: [{ text: "Génère le résumé du profil." }] },
      ],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        temperature: 0.7,
      },
    });

    return res.json(cleanAndParseJSON(result.text));
  } catch (error) {
    console.error("❌ Erreur generateCulinaryProfileSummary:", error.message);
    return res.json({
      summary: "Profil mis à jour ! Je m'adapterai à toutes vos préférences.",
    });
  }
}

module.exports = { generateCulinaryProfileSummary };
