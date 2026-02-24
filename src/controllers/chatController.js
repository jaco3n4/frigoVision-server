const { vertexAI } = require("../config/vertexai");
const { validateText, validateArray } = require("../middleware/validate");

/**
 * POST /api/chat
 * Chat interactif avec le Chef IA pendant la préparation.
 */
async function chatWithChef(req, res, next) {
  try {
    const { message, history, recipeContext } = req.body;
    validateText(message, "Message");
    validateText(recipeContext, "Contexte recette");
    validateArray(history, "Historique");

    const systemPrompt = `
Tu es un Chef cuisinier expert, bienveillant et pédagogue.
Tu assistes l'utilisateur dans la préparation de cette recette.

CONTEXTE DE LA RECETTE :
${recipeContext}

RÈGLES DE RÉPONSE (CRITIQUE) :
1. **Format Mobile** : Réponds en 2-3 phrases maximum (format "mains sales", écran mobile).
2. **Précision** : Donne des instructions précises et actionnables (températures, durées, gestes techniques).
3. **Bienveillance** : Ton encourageant et positif. Utilise des émojis pertinents avec modération (1 par message max).
4. **Pertinence** : Si la question est hors sujet de la recette, redirige gentiment vers la recette.
5. **Expertise** : Partage des astuces de chef quand pertinent.`.trim();

    const model = vertexAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 200,
      },
    });

    const chat = model.startChat({
      history: (history || []).map((h) => ({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.content }],
      })),
    });

    const result = await chat.sendMessage(message);
    const reply = result.response.candidates[0].content.parts[0].text;

    return res.json({ reply });
  } catch (error) {
    console.error("❌ Erreur chatWithChef:", error.message);
    next(error);
  }
}

module.exports = { chatWithChef };
