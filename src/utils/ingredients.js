const {
  ingredientSearch,
  ingredientsById,
  frenchTokenize,
  frenchProcessTerm,
} = require("../config/minisearch");

// --- Normalisation de nom ---

const normalizeIngName = (name) =>
  (name || "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/(?<=\w{4})[sx]\b/g, "")
    .trim();

// --- Parsing de string ingrédient ---

function parseIngredientString(str) {
  if (!str || typeof str !== "string")
    return { amount: 0, unit: "", name: str || "" };
  const match = str.match(
    /^(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|cl|piece|pièce)?\s*(.+)$/i,
  );
  if (match) {
    let amount = parseFloat(match[1].replace(",", "."));
    let unit = (match[2] || "").toLowerCase().replace("pièce", "piece");
    if (unit === "kg") { amount *= 1000; unit = "g"; }
    if (unit === "l") { amount *= 1000; unit = "ml"; }
    if (unit === "cl") { amount *= 10; unit = "ml"; }
    return { amount, unit, name: match[3].trim() };
  }
  const countMatch = str.match(/^(\d+)\s+(.+)$/);
  if (countMatch) {
    return {
      amount: parseInt(countMatch[1]),
      unit: "piece",
      name: countMatch[2].trim(),
    };
  }
  return { amount: 0, unit: "", name: str.trim() };
}

// --- Parsing de quantité inventaire ---

function parseInventoryQuantity(qtyStr) {
  if (!qtyStr) return { amount: 0, unit: "" };
  const parts = qtyStr.split("+").map((p) => p.trim());
  let totalG = 0;
  let lastUnit = "";
  for (const part of parts) {
    const m = part.match(/^(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|cl|piece|pièce)?/i);
    if (m) {
      let amount = parseFloat(m[1].replace(",", "."));
      let unit = (m[2] || "").toLowerCase().replace("pièce", "piece");
      if (unit === "kg") { amount *= 1000; unit = "g"; }
      if (unit === "l") { amount *= 1000; unit = "ml"; }
      if (unit === "cl") { amount *= 10; unit = "ml"; }
      totalG += amount;
      lastUnit = unit || lastUnit;
    }
  }
  return { amount: totalG, unit: lastUnit || "piece" };
}

// --- Strip qualifiers (halal, bio, surgelé…) avant matching ---

const TRAILING_QUALIFIERS = [
  /\s+halal$/i,
  /\s+casher$/i,
  /\s+bio$/i,
  /\s+vegan$/i,
  /\s+en conserve$/i,
  /\s+en bo[iî]te$/i,
  /\s+en bocal$/i,
  /\s+en sachet$/i,
  /\s+en barquette$/i,
  /\s+surgel[eé][eé]?s?$/i,
  /\s+congel[eé][eé]?s?$/i,
  /\s+frais$/i,
  /\s+fra[iî]che$/i,
  /\s+r[aâ]p[eé][eé]?s?$/i,
  /\s+grill[eé][eé]?s?$/i,
  /\s+cru[eé]?s?$/i,
  /\s+cuit[eé]?s?$/i,
  /\s+s[eé]ch[eé][eé]?s?$/i,
  /\s+fum[eé][eé]?s?$/i,
  /\s+marin[eé][eé]?s?$/i,
];

function stripQualifiers(name) {
  // 1. Strip parenthesized content
  let result = name.replace(/\s*\([^)]*\)/g, "");
  // 2. Strip trailing qualifiers (loop for chained: "halal surgelé")
  let prev = "";
  while (prev !== result) {
    prev = result;
    for (const pattern of TRAILING_QUALIFIERS) {
      result = result.replace(pattern, "");
    }
  }
  return result.replace(/\s+/g, " ").trim();
}

// --- Scoring et matching ---

function scoreResult(r, normQuery) {
  let score = r.score * (1 + (r.popularity_score || 0) / 50);
  const normName = normalizeIngName(r.name);
  if (normName === normQuery) score *= 5;
  else if (normName.startsWith(normQuery + " ")) score *= 2;
  return score;
}

function pickBest(results, normQuery) {
  let best = results[0];
  let bestScore = scoreResult(results[0], normQuery);
  for (let i = 1; i < Math.min(results.length, 10); i++) {
    const adjusted = scoreResult(results[i], normQuery);
    if (adjusted > bestScore) {
      best = results[i];
      bestScore = adjusted;
    }
  }
  return { id: best.id, name: best.name };
}

/**
 * Match un nom d'ingrédient vers un ID de ingredients.json.
 * Stratégie en 3 passes : AND → Per-word → OR.
 */
function matchIngredientId(rawName) {
  if (!rawName || !rawName.trim()) return { id: null, name: rawName };

  const cleaned = stripQualifiers(rawName.trim());
  const query = cleaned || rawName.trim();
  const normQuery = normalizeIngName(query);

  let globalBest = null;
  let globalBestScore = 0;

  // 1. AND — multi-word match (most reliable)
  const andResults = ingredientSearch.search(query, { combineWith: "AND" });
  for (let i = 0; i < Math.min(andResults.length, 10); i++) {
    const adjusted = scoreResult(andResults[i], normQuery);
    if (adjusted > globalBestScore) {
      globalBest = andResults[i];
      globalBestScore = adjusted;
    }
  }

  // 2. Per-word — ONLY if AND found nothing (single-word matches
  //    should not override a multi-word AND match)
  if (!globalBest) {
    const words = frenchTokenize(query).filter(
      (w) => frenchProcessTerm(w) !== false,
    );
    if (words.length > 1) {
      for (const word of words) {
        const wordResults = ingredientSearch.search(word);
        if (wordResults.length === 0) continue;
        const normWord = normalizeIngName(word);
        for (let i = 0; i < Math.min(wordResults.length, 5); i++) {
          const adjusted = scoreResult(wordResults[i], normWord);
          if (adjusted > globalBestScore) {
            globalBest = wordResults[i];
            globalBestScore = adjusted;
          }
        }
      }
    }
  }

  if (globalBest) return { id: globalBest.id, name: globalBest.name };

  // 3. OR fallback
  const orResults = ingredientSearch.search(query, { combineWith: "OR" });
  if (orResults.length === 0) return { id: null, name: rawName };
  return pickBest(orResults, normQuery);
}

module.exports = {
  normalizeIngName,
  parseIngredientString,
  parseInventoryQuantity,
  scoreResult,
  pickBest,
  matchIngredientId,
};
