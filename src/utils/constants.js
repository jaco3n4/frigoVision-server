const DIET_MAP = {
  omni: "Omnivore (mange de tout)",
  halal: "Halal (pas de porc, pas d'alcool en cuisson)",
  vege: "Végétarien (pas de viande ni poisson)",
  vegan: "Végan (aucun produit animal)",
};

const ALLERGY_MAP = {
  gluten: "Gluten",
  lactose: "Lactose",
  arachide: "Arachides",
  fruitsmer: "Fruits de mer/Crustacés",
  oeufs: "Œufs",
  soja: "Soja",
  sesame: "Sésame",
  fruitsacoque: "Fruits à coque",
  celeri: "Céleri",
  moutarde: "Moutarde",
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
