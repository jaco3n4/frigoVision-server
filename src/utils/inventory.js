const { parseInventoryQuantity, matchIngredientId, normalizeIngName } = require("./ingredients");

/**
 * Construit l'inventaire structuré à partir des items du pantry.
 */
function buildInventory(pantryItems) {
  return pantryItems.map((item) => {
    const qty = parseInventoryQuantity(item.quantity);
    const matched = matchIngredientId(item.name);
    return {
      name: item.name,
      amount: qty.amount,
      unit: qty.unit,
      ingredientId: matched.id,
    };
  });
}

/**
 * Construit la string d'inventaire pour injection dans les prompts.
 */
function buildInventoryString(inventory, { includeIds = true } = {}) {
  if (inventory.length === 0)
    return "Frigo vide — propose des recettes avec des ingrédients courants.";
  return inventory
    .map((i) => {
      const idTag =
        includeIds && i.ingredientId ? `[ID:${i.ingredientId}]` : "";
      if (i.amount > 0 && i.unit && i.unit !== "piece")
        return `${idTag}${i.name} (${i.amount}${i.unit})`;
      if (i.amount > 0) return `${idTag}${i.name} (${i.amount})`;
      return `${idTag}${i.name}`;
    })
    .join(", ");
}

/**
 * Soustrait les ingrédients utilisés de l'inventaire.
 */
function subtractUsedIngredients(inventory, meals) {
  const updated = inventory.map((item) => ({ ...item }));

  for (const meal of meals) {
    for (const ing of meal.ingredients || []) {
      if (!ing || typeof ing !== "object" || !ing.quantity) continue;

      let match;
      if (ing.ingredient_id) {
        match = updated.find((inv) => inv.ingredientId === ing.ingredient_id);
      }
      if (!match) {
        const normName = normalizeIngName(ing.name);
        match = updated.find((inv) => normalizeIngName(inv.name) === normName);
      }

      if (match) {
        let amountToSubtract = ing.quantity;
        const ingUnit = (ing.unit || "").toLowerCase();
        const invUnit = (match.unit || "").toLowerCase();
        if (ingUnit === "kg" && invUnit === "g") amountToSubtract *= 1000;
        if (ingUnit === "g" && invUnit === "kg") amountToSubtract /= 1000;
        if (ingUnit === "l" && invUnit === "ml") amountToSubtract *= 1000;
        if (ingUnit === "ml" && invUnit === "l") amountToSubtract /= 1000;

        match.amount = Math.max(0, match.amount - amountToSubtract);
      }
    }
  }

  return updated.filter((item) => item.amount > 0);
}

module.exports = { buildInventory, buildInventoryString, subtractUsedIngredients };
