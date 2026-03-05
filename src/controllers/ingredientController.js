const {
  ingredientSearch,
  ingredientsById,
  removeDiacriticsSearch,
  normalizeFrenchPlural,
} = require("../config/minisearch");

// --- Synonymes (miroir du mobile IngredientSearchService.ts) ---

const BIDIRECTIONAL_SYNONYMS = [
  ["yaourt", "yogourt", "yoghourt"],
  ["pomme de terre", "patate"],
  ["maizena", "fecule de mais"],
  ["creme fraiche", "creme fraiche"],
  ["coriandre", "cilantro"],
];

const ONE_WAY_SYNONYMS = {
  viande: ["boeuf", "poulet", "porc", "agneau", "veau"],
  steak: ["steak hache", "entrecote", "bavette"],
  salade: ["laitue", "roquette", "mache"],
  poisson: ["saumon", "cabillaud", "thon", "truite", "colin"],
  legume: ["courgette", "carotte", "poireau", "haricot vert", "tomate"],
  fruit: ["pomme", "banane", "orange", "fraise", "poire"],
  fromage: ["gruyere", "camembert", "emmental", "comte", "brie"],
  gousse: ["ail"],
};

// Build bidirectional index once at cold-start
const bidirectionalIndex = new Map();
for (const group of BIDIRECTIONAL_SYNONYMS) {
  const normalized = group.map((s) =>
    removeDiacriticsSearch(s.toLowerCase()),
  );
  for (const term of normalized) {
    const others = normalized.filter((t) => t !== term);
    const existing = bidirectionalIndex.get(term) || [];
    bidirectionalIndex.set(term, [...existing, ...others]);
  }
}

/**
 * Expand query with synonyms (bidirectional + one-way).
 * Returns array of queries to execute (original first).
 */
function expandWithSynonyms(query) {
  const normalizedQuery = removeDiacriticsSearch(query.toLowerCase().trim());
  const queries = [query];

  // One-way synonyms
  const oneWayMatch = ONE_WAY_SYNONYMS[normalizedQuery];
  if (oneWayMatch) queries.push(...oneWayMatch);

  // Bidirectional synonyms
  const biMatch = bidirectionalIndex.get(normalizedQuery);
  if (biMatch) queries.push(...biMatch);

  // Single word: also check depluralized form
  const words = normalizedQuery.split(/\s+/);
  if (words.length === 1) {
    const deplural = normalizeFrenchPlural(normalizedQuery);
    if (deplural !== normalizedQuery) {
      const oneWayDeplural = ONE_WAY_SYNONYMS[deplural];
      if (oneWayDeplural) queries.push(...oneWayDeplural);
      const biDeplural = bidirectionalIndex.get(deplural);
      if (biDeplural) queries.push(...biDeplural);
    }
  }

  return queries;
}

// --- Search with fallbacks (mirrors mobile searchWithFallbacks) ---

function searchWithFallbacks(query) {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Step 1: Direct search + synonym expansion (always)
  let results = ingredientSearch.search(trimmed);
  const expanded = expandWithSynonyms(trimmed);
  if (expanded.length > 1) {
    for (const synQuery of expanded.slice(1)) {
      const synResults = ingredientSearch.search(synQuery);
      results.push(...synResults);
    }
  }
  if (results.length > 0) return results;

  // Step 2: removeWordsIfNoResults — drop last word
  const words = trimmed.split(/\s+/);
  if (words.length > 1) {
    const withoutLast = words.slice(0, -1).join(" ");
    results = ingredientSearch.search(withoutLast);
    if (results.length > 0) return results;
  }

  // Step 3: OR fallback
  results = ingredientSearch.search(trimmed, { combineWith: "OR" });
  return results;
}

// --- Dedup by name (keeps best score) ---

function deduplicateByName(results) {
  const seen = new Map();
  for (const r of results) {
    const name = r.name.toLowerCase();
    const existing = seen.get(name);
    if (!existing || r.score > existing.score) {
      seen.set(name, r);
    }
  }
  return [...seen.values()];
}

// --- Rank results (popularity + prefix boost, mirrors mobile) ---

function rankResults(results, query) {
  const queryNorm = removeDiacriticsSearch(query.toLowerCase().trim());
  const isShortQuery = queryNorm.length <= 3;
  const popDivisor = isShortQuery ? 20 : 50;

  return results
    .map((r) => {
      const nameNorm = removeDiacriticsSearch(r.name.toLowerCase());
      const nameStartsWithQuery =
        queryNorm.length >= 1 && nameNorm.startsWith(queryNorm);
      const popularityBoost = 1 + (r.popularity_score ?? 0) / popDivisor;
      const prefixBonus = nameStartsWithQuery ? 2.0 : 1;

      return {
        ...r,
        _finalScore: r.score * popularityBoost * prefixBonus,
      };
    })
    .sort((a, b) => b._finalScore - a._finalScore);
}

// --- Map to SearchSuggestion format ---

function mapToSuggestions(results, limit) {
  limit = limit || 15;
  return results.slice(0, limit).map((hit) => {
    const meta = ingredientsById.get(hit.id);
    return {
      label: hit.name,
      value: hit.name,
      emoji: (meta && meta.emoji) || "\uD83E\uDD58",
      category: (meta && meta.category) || undefined,
      default_unit: (meta && meta.default_unit) || undefined,
      default_quantity: (meta && meta.default_quantity) || undefined,
      default_expiry_days: (meta && meta.default_expiry_days) || undefined,
    };
  });
}

// --- Controller ---

async function searchIngredients(req, res, next) {
  try {
    const q = req.query.q;
    if (!q || !q.trim()) {
      return res.json({ results: [] });
    }

    const raw = searchWithFallbacks(q);
    const deduplicated = deduplicateByName(raw);
    const ranked = rankResults(deduplicated, q);
    const results = mapToSuggestions(ranked, 15);

    return res.json({ results });
  } catch (err) {
    next(err);
  }
}

module.exports = { searchIngredients };
