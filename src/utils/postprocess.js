const { ingredientsById } = require("../config/minisearch");
const { normalizeIngName, matchIngredientId } = require("./ingredients");

/**
 * Post-process les ingrédients retournés par Gemini :
 * - Vérifie que les IDs existent dans la DB
 * - Tente un matching par nom pour les ingrédients sans ID
 * - Normalise le format { ingredient_id, name, quantity, unit }
 */
function postProcessIngredients(ingredients, label = "") {
  if (!Array.isArray(ingredients))
    return { ingredients: [], unmatched: [], fuzzy: [], exact: [] };
  let matchedCount = 0;
  const unmatchedItems = [];
  const fuzzyItems = [];
  const exactItems = [];
  const result = ingredients.map((ing) => {
    let ingredientId = (ing.ingredient_id || "").trim();
    const name = (ing.name || "").trim();
    const quantity =
      typeof ing.quantity === "number"
        ? ing.quantity
        : parseFloat(ing.quantity) || 0;
    const unit = (ing.unit || "").trim();

    let matchedName = name;

    if (ingredientId) {
      if (!ingredientsById.has(ingredientId)) {
        const match = matchIngredientId(name);
        ingredientId = match.id || "";
        matchedName = match.name;
      } else {
        matchedName = ingredientsById.get(ingredientId).name;
      }
    } else {
      const match = matchIngredientId(name);
      ingredientId = match.id || "";
      matchedName = match.name;
    }

    if (ingredientId) {
      matchedCount++;
      if (normalizeIngName(name) !== normalizeIngName(matchedName)) {
        fuzzyItems.push({
          geminiName: name,
          canonicalName: matchedName,
          ingredientId,
          context: label,
        });
        console.log(
          `  🔀 FUZZY: "${name}" → "${matchedName}" (${ingredientId})`,
        );
      } else {
        exactItems.push({
          name: matchedName,
          ingredientId,
          context: label,
        });
      }
    } else {
      unmatchedItems.push({ name, quantity, unit, context: label });
      console.log(`  ⚠️ NO MATCH: "${name}"`);
    }

    return {
      ingredient_id: ingredientId || "",
      name,
      quantity,
      unit,
    };
  });
  console.log(
    `🔗 postProcess${label ? ` [${label}]` : ""}: ${matchedCount}/${ingredients.length} IDs matchés (${exactItems.length} exact, ${fuzzyItems.length} fuzzy), ${unmatchedItems.length} sans ID`,
  );
  return {
    ingredients: result,
    unmatched: unmatchedItems,
    fuzzy: fuzzyItems,
    exact: exactItems,
  };
}

module.exports = { postProcessIngredients };
