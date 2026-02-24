/**
 * Middleware global de gestion des erreurs Express.
 * Remplace les throw new HttpsError(...) de Firebase.
 */
function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Erreur interne du serveur.";

  console.error(`❌ [${req.method} ${req.path}] ${statusCode} — ${message}`);
  if (statusCode === 500) {
    console.error(err.stack);
  }

  res.status(statusCode).json({ error: message });
}

module.exports = { errorHandler };
