const MiniSearch = require("minisearch");
const path = require("path");

// --- NLP Français ---

function removeDiacriticsSearch(str) {
  return str
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const FRENCH_STOP_WORDS = new Set([
  "de", "du", "des", "le", "la", "les", "un", "une", "et", "ou",
  "au", "aux", "en", "par", "pour", "sur", "avec", "dans",
  "son", "sa", "ses", "ce", "cette",
]);

function normalizeFrenchPlural(term) {
  if (term.endsWith("eaux") && term.length > 4)
    return term.slice(0, -4) + "eau";
  if (term.endsWith("aux") && term.length > 4) return term.slice(0, -3) + "al";
  if (term.endsWith("x") && term.length > 4) return term.slice(0, -1);
  if (term.endsWith("s") && term.length > 3) return term.slice(0, -1);
  return term;
}

function frenchTokenize(text) {
  return text
    .split(/[\s,;.!?()[\]{}"'«»'/\\-]+/)
    .filter((token) => token.length > 0);
}

function frenchProcessTerm(term) {
  const lower = removeDiacriticsSearch(term.toLowerCase());
  if (lower.length <= 1) return false;
  if (FRENCH_STOP_WORDS.has(lower)) return false;
  return normalizeFrenchPlural(lower);
}

// --- Chargement de la base ingrédients (cold-start) ---

const ingredientsDB = require(path.join(__dirname, "../../data/ingredients.json"));
const ingredientsById = new Map();

const ingredientSearch = new MiniSearch({
  idField: "id",
  fields: ["name", "search_terms", "description"],
  storeFields: ["id", "name", "popularity_score"],
  tokenize: frenchTokenize,
  processTerm: frenchProcessTerm,
  searchOptions: {
    fuzzy: 0.25,
    prefix: true,
    boost: { name: 3, search_terms: 1, description: 0.5 },
    combineWith: "OR",
  },
});

for (const ing of ingredientsDB) {
  ingredientsById.set(ing.id, ing);
}
ingredientSearch.addAll(ingredientsDB);

console.log(`✅ MiniSearch initialisé — ${ingredientsDB.length} ingrédients indexés`);

module.exports = {
  ingredientSearch,
  ingredientsById,
  ingredientsDB,
  frenchTokenize,
  frenchProcessTerm,
  normalizeFrenchPlural,
  removeDiacriticsSearch,
  FRENCH_STOP_WORDS,
};
