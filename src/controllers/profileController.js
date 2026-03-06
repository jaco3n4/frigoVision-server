const { ai } = require("../config/vertexai");
const { cleanAndParseJSON } = require("../utils/json");

/**
 * POST /api/profile/summary
 * Génère un résumé de confirmation du profil culinaire.
 */
async function generateCulinaryProfileSummary(req, res) {
  try {
    const { diet, allergies, dislikes, goal, spiceLevel, cookingLevel, cookingTime, worldCuisines } = req.body;

    const spiceLabels = { doux: "Doux", moyen: "Moyen", releve: "Relevé" };
    const levelLabels = { debutant: "Débutant", intermediaire: "Intermédiaire", confirme: "Confirmé" };
    const timeLabels = { "15": "15 min", "30": "30 min", "45": "45 min", "60": "1h+" };

    const systemPrompt = `
      Tu es un Chef personnel bienveillant et professionnel.
      Ton client vient de mettre à jour son profil culinaire.

      Données du client :
      - Régime : ${diet}
      - Allergies/Intolérances : ${allergies && allergies.length > 0 ? allergies.join(", ") : "Aucune"}
      - Ingrédients détestés : ${dislikes && dislikes.length > 0 ? dislikes.join(", ") : "Aucun"}
      - Objectif : ${goal}
      - Niveau d'épices : ${spiceLabels[spiceLevel] || spiceLevel || "Non précisé"}
      - Niveau en cuisine : ${levelLabels[cookingLevel] || cookingLevel || "Non précisé"}
      - Temps disponible : ${timeLabels[cookingTime] || cookingTime || "Non précisé"}
      - Cuisines du monde préférées : ${worldCuisines && worldCuisines.length > 0 ? worldCuisines.join(", ") : "Aucune en particulier"}

      Tâche :
      Rédige une courte phrase de confirmation (max 25 mots) qui montre que tu as bien compris ses goûts et contraintes. Sois positif et chaleureux.
      Ne répète pas bêtement la liste, fais une synthèse naturelle qui capture l'essentiel de son profil.

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
