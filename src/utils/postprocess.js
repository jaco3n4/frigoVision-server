const { ingredientsById } = require("../config/minisearch");
const { normalizeIngName, matchIngredientId } = require("./ingredients");

const SOLID_UNITS = new Set(["g", "kg"]);
const LIQUID_UNITS = new Set(["ml", "cl", "l"]);

/**
 * Valide et corrige l'unité d'un ingrédient en fonction de sa forme (solide/liquide)
 * et de ses métadonnées DB (default_unit, piece_weight, default_quantity).
 * Retourne { unit, quantity } corrigés.
 */
function validateUnit(ingredientId, unit, quantity) {
  const meta = ingredientsById.get(ingredientId);
  if (!meta || !meta.form || !meta.default_unit) return { unit, quantity };

  const form = meta.form; // "solide" | "liquide"
  const defaultUnit = meta.default_unit; // "g" | "ml" | "piece"
  const pieceWeight = meta.piece_weight; // number | null

  // Cas 1 : solide avec unité liquide (ex: "Oeufs 200ml")
  if (form === "solide" && LIQUID_UNITS.has(unit)) {
    if (defaultUnit === "piece" && pieceWeight > 0) {
      // Convertir : 200ml → interpréter comme poids en g → diviser par piece_weight
      const mlToG = unit === "l" ? quantity * 1000 : unit === "cl" ? quantity * 10 : quantity;
      const pieces = Math.max(1, Math.round(mlToG / pieceWeight));
      console.log(`  🔧 UNIT FIX: "${meta.name}" ${quantity}${unit} → ${pieces} piece (solide, piece_weight=${pieceWeight}g)`);
      return { unit: "piece", quantity: pieces };
    }
    if (defaultUnit === "g" || defaultUnit === "kg") {
      // Convertir ml→g en 1:1 (approximation densité ~1)
      const grams = unit === "l" ? quantity * 1000 : unit === "cl" ? quantity * 10 : quantity;
      const finalQty = defaultUnit === "kg" ? grams / 1000 : grams;
      console.log(`  🔧 UNIT FIX: "${meta.name}" ${quantity}${unit} → ${finalQty}${defaultUnit} (solide)`);
      return { unit: defaultUnit, quantity: finalQty };
    }
  }

  // Cas 2 : liquide avec unité solide poids (ex: "Lait 500g")
  if (form === "liquide" && SOLID_UNITS.has(unit)) {
    if (LIQUID_UNITS.has(defaultUnit)) {
      // Convertir g→ml en 1:1 (approximation densité ~1)
      const ml = unit === "kg" ? quantity * 1000 : quantity;
      let finalQty = ml;
      let finalUnit = defaultUnit;
      if (defaultUnit === "l") finalQty = ml / 1000;
      else if (defaultUnit === "cl") finalQty = ml / 10;
      else finalUnit = "ml";
      console.log(`  🔧 UNIT FIX: "${meta.name}" ${quantity}${unit} → ${finalQty}${finalUnit} (liquide)`);
      return { unit: finalUnit, quantity: finalQty };
    }
  }

  // Cas 3 : ingrédient comptable en pièces, mais Gemini a donné du poids
  if (defaultUnit === "piece" && (SOLID_UNITS.has(unit) || LIQUID_UNITS.has(unit)) && pieceWeight > 0) {
    let grams = quantity;
    if (unit === "kg") grams = quantity * 1000;
    else if (unit === "l") grams = quantity * 1000;
    else if (unit === "cl") grams = quantity * 10;
    // ml et g restent tels quels
    const pieces = Math.max(1, Math.round(grams / pieceWeight));
    console.log(`  🔧 UNIT FIX: "${meta.name}" ${quantity}${unit} → ${pieces} piece (default=piece, piece_weight=${pieceWeight}g)`);
    return { unit: "piece", quantity: pieces };
  }

  return { unit, quantity };
}

/**
 * Post-process les ingrédients retournés par Gemini :
 * - Vérifie que les IDs existent dans la DB
 * - Tente un matching par nom pour les ingrédients sans ID
 * - Valide et corrige les unités selon la forme de l'ingrédient
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
    let quantity =
      typeof ing.quantity === "number"
        ? ing.quantity
        : parseFloat(ing.quantity) || 0;
    let unit = (ing.unit || "").trim();

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

    // Valider et corriger l'unité si on a un match DB
    if (ingredientId) {
      const fixed = validateUnit(ingredientId, unit, quantity);
      unit = fixed.unit;
      quantity = fixed.quantity;
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
