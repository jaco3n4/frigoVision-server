const { admin } = require("../config/firebase");

/**
 * Middleware Express : vérifie le token Firebase du header Authorization.
 * Injecte req.user (decodedToken) avec req.user.uid.
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Connexion requise." });
  }

  try {
    const idToken = authHeader.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("❌ Auth error:", error.message);
    return res.status(401).json({ error: "Token invalide." });
  }
}

module.exports = { requireAuth };
