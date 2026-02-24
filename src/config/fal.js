const fal = require("@fal-ai/serverless-client");

function initFal() {
  fal.config({ credentials: process.env.FAL_KEY });
}

module.exports = { fal, initFal };
