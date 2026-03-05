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
  // 0. Strip leading quantity prefixes (ex: "Pc poivron", "2 carottes", "150g poulet")
  let result = name.replace(/^(?:\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l|cl|pc|pcs|pi[eè]ces?)?\s+|(?:pc|pcs)\s+)/i, "");
  // 1. Strip parenthesized content
  result = result.replace(/\s*\([^)]*\)/g, "");
  // 2. Strip "sans X" patterns (ex: "naan sans œuf" → "naan")
  result = result.replace(/\s+sans\s+.+$/i, "");
  // 3. Strip trailing qualifiers (loop for chained: "halal surgelé")
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
  let score = r.score;
  const normName = normalizeIngName(r.name);
  // Boost fort pour match exact ou préfixe
  if (normName === normQuery) score *= 5;
  else if (normName.startsWith(normQuery + " ") || normQuery.startsWith(normName + " ")) score *= 2;
  // Popularité : boost modéré (plafonné) pour ne pas écraser la pertinence textuelle
  score *= (1 + Math.min(r.popularity_score || 0, 30) / 100);
  return score;
}

/**
 * Vérifie la pertinence d'un match MiniSearch.
 * - Vérifie le overlap par rapport au NOM du résultat (pas la description)
 * - Accepte aussi les alias directs via search_terms (ex: "badiane" → "Anis étoilé")
 */
function hasWordOverlap(normQuery, result) {
  const queryTokens = frenchTokenize(normQuery)
    .map((t) => frenchProcessTerm(t))
    .filter(Boolean);
  if (queryTokens.length === 0) return false;

  const resultName = typeof result === "string" ? result : result.name;
  const nameTokens = frenchTokenize(normalizeIngName(resultName))
    .map((t) => frenchProcessTerm(t))
    .filter(Boolean);
  if (nameTokens.length === 0) return false;

  const tokenMatch = (a, b) =>
    a === b || (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)));

  // 1. Vérifier overlap avec le NOM : un des 2 premiers tokens significatifs doit matcher
  const primaryTokens = queryTokens.slice(0, 2);
  for (const qt of primaryTokens) {
    for (const nt of nameTokens) {
      if (tokenMatch(qt, nt)) return true;
    }
  }

  // 2. Alias direct : la requête normalisée apparaît comme alias dans les search_terms
  if (typeof result !== "string") {
    const meta = ingredientsById.get(result.id);
    if (meta && meta.search_terms) {
      const aliases = meta.search_terms.split(",").map((a) => normalizeIngName(a.trim()));
      for (const alias of aliases) {
        if (alias === normQuery) return true;
        const aliasTokens = frenchTokenize(alias).map((t) => frenchProcessTerm(t)).filter(Boolean);
        // L'alias entier doit correspondre (pas un mot aléatoire dans une phrase longue)
        if (aliasTokens.length <= 2) {
          for (const qt of queryTokens) {
            for (const at of aliasTokens) {
              if (tokenMatch(qt, at)) return true;
            }
          }
        }
      }
    }
  }

  // 3. Multi-mots : si 2+ tokens de la requête matchent le nom → accepter
  if (queryTokens.length >= 2) {
    let matchCount = 0;
    for (const qt of queryTokens) {
      for (const nt of nameTokens) {
        if (tokenMatch(qt, nt)) { matchCount++; break; }
      }
    }
    if (matchCount >= 2) return true;
  }

  return false;
}

function pickBest(results, normQuery) {
  let best = null;
  let bestScore = 0;
  for (let i = 0; i < Math.min(results.length, 10); i++) {
    if (!hasWordOverlap(normQuery, results[i])) continue;
    const adjusted = scoreResult(results[i], normQuery);
    if (adjusted > bestScore) {
      best = results[i];
      bestScore = adjusted;
    }
  }
  if (!best) return null;
  return { id: best.id, name: best.name };
}

/**
 * Match un nom d'ingrédient vers un ID de ingredients.json.
 * Stratégie en 3 passes : AND → Per-word → OR.
 * Retourne { id: null } si aucun match fiable (mieux vaut unmatched que faux match).
 */
function matchIngredientId(rawName) {
  if (!rawName || !rawName.trim()) return { id: null, name: rawName };

  const cleaned = stripQualifiers(rawName.trim());
  const query = cleaned || rawName.trim();
  const normQuery = normalizeIngName(query);

  // 1. AND — multi-word match (most reliable)
  const andResults = ingredientSearch.search(query, { combineWith: "AND" });
  if (andResults.length > 0) {
    const best = pickBest(andResults, normQuery);
    if (best) return best;
  }

  // 2. Per-word — ONLY if AND found nothing
  const words = frenchTokenize(query).filter(
    (w) => frenchProcessTerm(w) !== false,
  );
  if (words.length > 1) {
    // Search each word, but validate against the FULL query (not just the word)
    let bestResult = null;
    let bestScore = 0;
    for (const word of words) {
      const wordResults = ingredientSearch.search(word);
      if (wordResults.length === 0) continue;
      for (let i = 0; i < Math.min(wordResults.length, 5); i++) {
        if (!hasWordOverlap(normQuery, wordResults[i])) continue;
        const adjusted = scoreResult(wordResults[i], normalizeIngName(word));
        if (adjusted > bestScore) {
          bestResult = wordResults[i];
          bestScore = adjusted;
        }
      }
    }
    if (bestResult) return { id: bestResult.id, name: bestResult.name };
  }

  // 3. OR fallback
  const orResults = ingredientSearch.search(query, { combineWith: "OR" });
  if (orResults.length === 0) return { id: null, name: rawName };
  const orBest = pickBest(orResults, normQuery);
  return orBest || { id: null, name: rawName };
}

module.exports = {
  normalizeIngName,
  parseIngredientString,
  parseInventoryQuantity,
  scoreResult,
  pickBest,
  matchIngredientId,
};
