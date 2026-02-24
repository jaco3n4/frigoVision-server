/**
 * Nettoie et parse du JSON potentiellement enveloppé de markdown ou de texte parasite.
 */
function cleanAndParseJSON(rawContent) {
  try {
    if (typeof rawContent === "object") return rawContent;
    let cleaned = rawContent
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const firstIndex = cleaned.search(/[{[]/);
    if (firstIndex !== -1) {
      const startChar = cleaned[firstIndex];
      const endChar = startChar === "{" ? "}" : "]";
      const lastIndex = cleaned.lastIndexOf(endChar);
      if (lastIndex !== -1) {
        cleaned = cleaned.substring(firstIndex, lastIndex + 1);
      }
    }
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Échec parsing JSON");
    throw new Error("Format invalide généré par l'IA.");
  }
}

module.exports = { cleanAndParseJSON };
