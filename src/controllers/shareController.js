const { db } = require("../config/firebase");
const { generateShareId } = require("../utils/helpers");

/**
 * POST /api/share/recipe
 * Crée un lien de partage pour une recette.
 */
async function shareRecipe(req, res, next) {
  try {
    const { recipe, imageUrl } = req.body;
    if (!recipe || !recipe.title || !recipe.ingredients) {
      return res.status(400).json({ error: "Données de recette manquantes." });
    }

    const shareId = generateShareId();
    const sharedRecipe = {
      shareId,
      sharedBy: req.user.uid,
      sharedAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      title: recipe.title,
      description: recipe.description || "",
      prep_time: recipe.prep_time || "",
      cook_time: recipe.cook_time || "",
      servings: recipe.servings || 2,
      difficulty: recipe.difficulty || "",
      calories_per_serving: recipe.calories_per_serving || 0,
      ingredients: recipe.ingredients || [],
      steps: recipe.steps || [],
      chef_tip: recipe.chef_tip || "",
      image_prompt: recipe.image_prompt || "",
      image_url: imageUrl || null,
      protein: recipe.protein || null,
      carbs: recipe.carbs || null,
      fat: recipe.fat || null,
    };

    await db.collection("shared_recipes").doc(shareId).set(sharedRecipe);

    // NOTE: L'URL devra être mise à jour avec le domaine Cloud Run
    const shareUrl = `https://europe-west1-frigovision-71924.cloudfunctions.net/shareRedirect?id=${shareId}`;
    console.log(`🔗 Recette partagée: ${shareId}`);

    return res.json({ shareUrl, shareId });
  } catch (error) {
    console.error("❌ Erreur shareRecipe:", error.message);
    next(error);
  }
}

/**
 * GET /api/share/redirect?id=xxx
 * Page de redirection Open Graph + deep link (pas d'auth requise).
 */
async function shareRedirect(req, res) {
  const shareId = req.query.id;
  if (!shareId) {
    return res.status(400).send("Lien invalide.");
  }

  let recipe = null;
  try {
    const docSnap = await db.collection("shared_recipes").doc(shareId).get();
    if (docSnap.exists) {
      recipe = docSnap.data();
    }
  } catch (e) {
    console.error("❌ Erreur fetch shared recipe:", e.message);
  }

  const title = recipe ? recipe.title : "Recette Frigovision";
  const description = recipe
    ? recipe.description || `${recipe.difficulty} | ${recipe.prep_time} | ${recipe.calories_per_serving} kcal`
    : "Decouvrez cette recette sur Frigovision !";
  const imageUrl = recipe?.image_url || "";

  const appSchemeUrl = `frigovisionmobile://recipe/${shareId}`;
  const expoGoSchemeUrl = `exp+frigovisionmobile://recipe/${shareId}`;
  const iosStoreUrl = "https://apps.apple.com/app/frigovision/id6739498942";
  const androidStoreUrl = "https://play.google.com/store/apps/details?id=com.jaco3n4.frigovision";

  const ingredientPreview = recipe?.ingredients
    ? recipe.ingredients.slice(0, 5).join(" · ") + (recipe.ingredients.length > 5 ? " ..." : "")
    : "";

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Frigovision</title>
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  ${imageUrl ? `<meta property="og:image" content="${imageUrl}" />` : ""}
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Frigovision" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #FDFCFB; color: #1e293b; min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 40px 20px; }
    .card { background: white; border-radius: 28px; padding: 32px 24px; max-width: 400px; width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,0.08); text-align: center; border: 1px solid #f1f5f9; }
    .logo { font-size: 48px; margin-bottom: 12px; }
    h1 { font-size: 22px; font-weight: 900; margin-bottom: 8px; text-transform: uppercase; }
    .meta { color: #64748b; font-size: 14px; margin-bottom: 16px; }
    .desc { color: #475569; font-size: 15px; line-height: 1.5; margin-bottom: 20px; }
    .ingredients { background: #f8fafc; border-radius: 16px; padding: 12px 16px; margin-bottom: 24px; font-size: 13px; color: #64748b; }
    .btn { display: inline-block; background: #F97316; color: white; padding: 16px 40px; border-radius: 50px; text-decoration: none; font-weight: 800; font-size: 16px; transition: transform 0.2s; }
    .btn:active { transform: scale(0.97); }
    .store { margin-top: 20px; font-size: 13px; color: #94a3b8; }
    .store a { color: #F97316; text-decoration: none; font-weight: 600; }
    .brand { margin-top: 32px; font-size: 12px; color: #cbd5e1; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🍳</div>
    <h1>${title}</h1>
    <div class="meta">${recipe ? `${recipe.difficulty} · ${recipe.prep_time} · ${recipe.calories_per_serving} kcal` : ""}</div>
    ${recipe?.description ? `<div class="desc">${recipe.description}</div>` : ""}
    ${ingredientPreview ? `<div class="ingredients">${ingredientPreview}</div>` : ""}
    <a class="btn" id="openApp" href="${expoGoSchemeUrl}">Voir la recette</a>
    <div class="store">
      <p>Pas encore l'app ?</p>
      <p><a id="storeLink" href="#">Telecharger Frigovision</a></p>
    </div>
  </div>
  <div class="brand">Frigovision</div>
  <script>
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    var storeUrl = isIOS ? "${iosStoreUrl}" : "${androidStoreUrl}";
    document.getElementById("storeLink").href = storeUrl;

    var schemes = ["${appSchemeUrl}", "${expoGoSchemeUrl}"];
    var idx = 0;

    function tryScheme() {
      if (idx < schemes.length) {
        window.location.href = schemes[idx];
        idx++;
        setTimeout(function() {
          if (!document.hidden && !document.webkitHidden) tryScheme();
        }, 1200);
      } else {
        if (!document.hidden && !document.webkitHidden) {
          window.location.href = storeUrl;
        }
      }
    }
    tryScheme();
  </script>
</body>
</html>`;

  res.status(200).send(html);
}

module.exports = { shareRecipe, shareRedirect };
