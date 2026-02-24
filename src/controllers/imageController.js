const { fal } = require("../config/fal");
const { validateText } = require("../middleware/validate");

/**
 * POST /api/image/generate
 * Génère une image via FAL.ai (Flux Schnell).
 */
async function generateImageHF(req, res, next) {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt manquant" });
    validateText(prompt, "Prompt");

    const enhancedPrompt = `${prompt}, ultra detailed, professional food photography, 8K resolution, perfect lighting, award winning composition`;

    const result = await fal.subscribe("fal-ai/flux/schnell", {
      input: {
        prompt: enhancedPrompt,
        image_size: "landscape_16_9",
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: false,
        output_format: "jpeg",
        seed: Math.floor(Math.random() * 1000000),
      },
    });

    return res.json({ imageUrl: result.images[0].url });
  } catch (error) {
    console.error("❌ Erreur FAL:", error.message);
    next(error);
  }
}

module.exports = { generateImageHF };
