const { Router } = require("express");
const { requireAuth } = require("../middleware/auth");

// --- Controllers ---
const { generateImageHF } = require("../controllers/imageController");
const { chatWithChef } = require("../controllers/chatController");
const { analyzeFridgeImage } = require("../controllers/fridgeController");
const {
  generateWeeklyPlan,
  streamWeeklyPlan,
  generateWeeklyPlanSkeleton,
  processMealIngredients,
  regenerateSingleMeal,
} = require("../controllers/planningController");
const { classifyShoppingItem } = require("../controllers/shoppingController");
const {
  generateRecipesAI,
  getRecipeDetails,
  detectIngredientEmoji,
  suggestRecipesQuick,
  enrichRecipeSuggestions,
  suggestRecipes,
  generateFullRecipe,
} = require("../controllers/recipeController");
const { checkProductCompliance, getProductCookingGuide } = require("../controllers/productController");
const { generateCulinaryProfileSummary } = require("../controllers/profileController");
const { analyzeVoiceList } = require("../controllers/voiceController");
const { analyzeScannedProducts } = require("../controllers/scanController");
const { shareRecipe, shareRedirect } = require("../controllers/shareController");
const { analyzeReceiptImage } = require("../controllers/receiptController");

const router = Router();

// =====================================================================
// HEALTH CHECK
// =====================================================================
router.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// =====================================================================
// IMAGE GENERATION
// =====================================================================
router.post("/api/image/generate", requireAuth, generateImageHF);

// =====================================================================
// RECIPES
// =====================================================================
router.post("/api/recipes/generate", requireAuth, generateRecipesAI);
router.post("/api/recipes/details", requireAuth, getRecipeDetails);
router.post("/api/recipes/full", requireAuth, generateFullRecipe);
router.post("/api/recipes/suggest", requireAuth, suggestRecipes);
router.post("/api/recipes/suggest-quick", requireAuth, suggestRecipesQuick);
router.post("/api/recipes/enrich", requireAuth, enrichRecipeSuggestions);

// =====================================================================
// CHAT
// =====================================================================
router.post("/api/chat", requireAuth, chatWithChef);

// =====================================================================
// FRIDGE
// =====================================================================
router.post("/api/fridge/analyze", requireAuth, analyzeFridgeImage);

// =====================================================================
// PLANNING
// =====================================================================
router.post("/api/planning/generate", requireAuth, generateWeeklyPlan);
router.post("/api/planning/stream", requireAuth, streamWeeklyPlan);
router.post("/api/planning/skeleton", requireAuth, generateWeeklyPlanSkeleton);
router.post("/api/planning/regenerate-meal", requireAuth, regenerateSingleMeal);

// =====================================================================
// SHOPPING
// =====================================================================
router.post("/api/shopping/classify", requireAuth, classifyShoppingItem);

// =====================================================================
// INGREDIENTS
// =====================================================================
router.post("/api/ingredients/emoji", requireAuth, detectIngredientEmoji);

// =====================================================================
// PRODUCTS (Coach + Cooking Guide)
// =====================================================================
router.post("/api/products/compliance", requireAuth, checkProductCompliance);
router.post("/api/products/cooking-guide", requireAuth, getProductCookingGuide);

// =====================================================================
// PROFILE
// =====================================================================
router.post("/api/profile/summary", requireAuth, generateCulinaryProfileSummary);

// =====================================================================
// VOICE
// =====================================================================
router.post("/api/voice/analyze", requireAuth, analyzeVoiceList);

// =====================================================================
// SCAN
// =====================================================================
router.post("/api/scan/products", requireAuth, analyzeScannedProducts);

// =====================================================================
// SHARE (shareRecipe requiert auth, shareRedirect est public)
// =====================================================================
router.post("/api/share/recipe", requireAuth, shareRecipe);
router.get("/api/share/redirect", shareRedirect);

// =====================================================================
// RECEIPT
// =====================================================================
router.post("/api/receipt/analyze", requireAuth, analyzeReceiptImage);

// =====================================================================
// INTERNAL (Pub/Sub → HTTP push, pas d'auth Firebase utilisateur)
// =====================================================================
router.post("/api/internal/processMealIngredients", processMealIngredients);

module.exports = router;
