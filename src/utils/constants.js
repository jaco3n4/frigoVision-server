const DIET_MAP = {
  halal: "Halal (pas de porc, pas d'alcool en cuisson)",
  vegetarien: "Végétarien (pas de viande ni poisson)",
  vegan: "Végan (aucun produit animal)",
};

const ALLERGY_MAP = {
  gluten: "Gluten",
  lactose: "Lactose",
  arachide: "Arachides/Fruits à coque",
  fruitsmer: "Fruits de mer/Crustacés",
};

const EQUIPMENT_NAMES = {
  plaques: "Plaques",
  four: "Four",
  microondes: "Micro-ondes",
  airfryer: "AirFryer",
  robot: "Robot culinaire",
  blender: "Blender",
  batteur: "Batteur",
  cafetiere: "Cafetière",
  bouilloire: "Bouilloire",
  grillepain: "Grille-pain",
};

const DAY_KEYS = [
  "monday", "tuesday", "wednesday", "thursday",
  "friday", "saturday", "sunday",
];

module.exports = { DIET_MAP, ALLERGY_MAP, EQUIPMENT_NAMES, DAY_KEYS };
