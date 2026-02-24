require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { initFal } = require("./config/fal");
const { errorHandler } = require("./middleware/errorHandler");
const routes = require("./routes");

// --- Initialisation MiniSearch (cold-start, gardé en mémoire) ---
// L'import déclenche l'indexation au démarrage du serveur
require("./config/minisearch");

// --- Initialisation FAL.ai ---
initFal();

const app = express();
const PORT = process.env.PORT || 8080;

// --- Middleware globaux ---
app.use(cors());
app.use(express.json({ limit: "15mb" }));

// --- Routes ---
app.use(routes);

// --- Error handler global (doit être après les routes) ---
app.use(errorHandler);

// --- Démarrage ---
app.listen(PORT, () => {
  console.log(`🚀 Frigovision API démarrée sur le port ${PORT}`);
  console.log(`📍 Health check : http://localhost:${PORT}/health`);
});
