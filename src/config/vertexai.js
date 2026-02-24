const { GoogleGenAI } = require("@google/genai");

const project = process.env.GCLOUD_PROJECT || "frigovision-71924";

const ai = new GoogleGenAI({
  vertexai: true,
  project,
  location: "europe-west1",
});

const aiGlobal = new GoogleGenAI({
  vertexai: true,
  project,
  location: "global",
});

module.exports = { ai, aiGlobal };
