const { VertexAI, SchemaType } = require("@google-cloud/vertexai");

const vertexAI = new VertexAI({
  project: process.env.GCLOUD_PROJECT || "frigovision-71924",
  location: "europe-west1",
});

module.exports = { vertexAI, SchemaType };
