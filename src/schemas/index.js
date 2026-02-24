const { SchemaType } = require("../config/vertexai");

// --- Schema : Repas avec ingrédients ---
const weeklyMealsSchema = {
  type: SchemaType.OBJECT,
  properties: {
    meals: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          day: { type: SchemaType.STRING },
          slot: { type: SchemaType.STRING },
          title: { type: SchemaType.STRING },
          calories: { type: SchemaType.INTEGER },
          ingredients: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                ingredient_id: { type: SchemaType.STRING },
                name: { type: SchemaType.STRING },
                quantity: { type: SchemaType.NUMBER },
                unit: { type: SchemaType.STRING },
              },
              required: ["ingredient_id", "name", "quantity", "unit"],
            },
          },
        },
        required: ["day", "slot", "title", "calories", "ingredients"],
      },
    },
  },
  required: ["meals"],
};

// --- Schema : Skeleton (titres + descriptions, PAS d'ingredients) ---
const weeklySkeletonSchema = {
  type: SchemaType.OBJECT,
  properties: {
    meals: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          day: { type: SchemaType.STRING },
          slot: { type: SchemaType.STRING },
          title: { type: SchemaType.STRING },
          description: { type: SchemaType.STRING },
          calories: { type: SchemaType.INTEGER },
        },
        required: ["day", "slot", "title", "description", "calories"],
      },
    },
  },
  required: ["meals"],
};

// --- Schema : Single meal ---
const singleMealSchema = {
  type: SchemaType.OBJECT,
  properties: {
    meal: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING },
        description: { type: SchemaType.STRING },
        calories: { type: SchemaType.INTEGER },
        protein: { type: SchemaType.INTEGER },
        carbs: { type: SchemaType.INTEGER },
        fat: { type: SchemaType.INTEGER },
        ingredients: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              ingredient_id: { type: SchemaType.STRING },
              name: { type: SchemaType.STRING },
              quantity: { type: SchemaType.NUMBER },
              unit: { type: SchemaType.STRING },
            },
            required: ["ingredient_id", "name", "quantity", "unit"],
          },
        },
      },
      required: ["title", "description", "calories", "protein", "carbs", "fat", "ingredients"],
    },
  },
  required: ["meal"],
};

// --- Schema : Quick recipe suggestions ---
const quickRecipeSuggestionsSchema = {
  type: SchemaType.OBJECT,
  properties: {
    suggestions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          id: { type: SchemaType.STRING },
          type: { type: SchemaType.STRING },
          title: { type: SchemaType.STRING },
          subtitle: { type: SchemaType.STRING },
          calories: { type: SchemaType.STRING },
          time: { type: SchemaType.STRING },
          match_score: { type: SchemaType.INTEGER },
          used_ingredients: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          missing_ingredients: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          upgrade_reason: { type: SchemaType.STRING },
        },
        required: [
          "type", "title", "subtitle", "calories", "time",
          "match_score", "used_ingredients", "missing_ingredients",
        ],
      },
    },
  },
  required: ["suggestions"],
};

// --- Schema : Full recipe suggestions (legacy) ---
const recipeSuggestionsSchema = {
  type: SchemaType.OBJECT,
  properties: {
    suggestions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          id: { type: SchemaType.STRING },
          type: { type: SchemaType.STRING, description: "IMMEDIATE ou OBJECTIVE" },
          title: { type: SchemaType.STRING },
          subtitle: { type: SchemaType.STRING },
          calories: { type: SchemaType.STRING },
          time: { type: SchemaType.STRING },
          match_score: { type: SchemaType.INTEGER },
          used_ingredients: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          missing_ingredients: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
        },
        required: [
          "type", "title", "subtitle", "calories", "time",
          "match_score", "used_ingredients", "missing_ingredients",
        ],
      },
    },
  },
  required: ["suggestions"],
};

// --- Schema : Full recipe ---
const fullRecipeSchema = {
  type: SchemaType.OBJECT,
  properties: {
    title: { type: SchemaType.STRING },
    description: { type: SchemaType.STRING },
    prep_time: { type: SchemaType.STRING },
    cook_time: { type: SchemaType.STRING },
    servings: { type: SchemaType.INTEGER },
    difficulty: { type: SchemaType.STRING },
    calories_per_serving: { type: SchemaType.INTEGER },
    ingredients: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    steps: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          step_number: { type: SchemaType.INTEGER },
          instruction: { type: SchemaType.STRING },
          timer_seconds: { type: SchemaType.INTEGER, nullable: true },
        },
        required: ["step_number", "instruction"],
      },
    },
    chef_tip: { type: SchemaType.STRING },
    image_prompt: {
      type: SchemaType.STRING,
      description: "Prompt en ANGLAIS pour générer la photo via FAL.AI",
    },
  },
  required: ["title", "ingredients", "steps", "image_prompt"],
};

// --- Schema : Product cooking guide cards ---
const cardsPreviewSchema = {
  type: SchemaType.OBJECT,
  properties: {
    product_vibe: { type: SchemaType.STRING },
    cooking_info: {
      type: SchemaType.OBJECT,
      properties: {
        method: { type: SchemaType.STRING },
        time: { type: SchemaType.STRING },
        details: { type: SchemaType.STRING },
      },
      required: ["method", "time", "details"],
    },
    cards: {
      type: SchemaType.OBJECT,
      properties: {
        immediate: {
          type: SchemaType.OBJECT,
          properties: {
            title: { type: SchemaType.STRING },
            subtitle: { type: SchemaType.STRING },
            time: { type: SchemaType.STRING },
            calories: { type: SchemaType.STRING },
            badge: { type: SchemaType.STRING },
            equipment_used: { type: SchemaType.STRING },
          },
          required: ["title", "subtitle", "time", "calories", "badge", "equipment_used"],
        },
        objective: {
          type: SchemaType.OBJECT,
          properties: {
            title: { type: SchemaType.STRING },
            subtitle: { type: SchemaType.STRING },
            macros: { type: SchemaType.STRING },
            calories: { type: SchemaType.STRING },
            badge: { type: SchemaType.STRING },
            missing_ingredient: { type: SchemaType.STRING },
            equipment_used: { type: SchemaType.STRING },
          },
          required: ["title", "subtitle", "macros", "calories", "badge", "missing_ingredient", "equipment_used"],
        },
      },
      required: ["immediate", "objective"],
    },
  },
  required: ["product_vibe", "cooking_info", "cards"],
};

module.exports = {
  weeklyMealsSchema,
  weeklySkeletonSchema,
  singleMealSchema,
  quickRecipeSuggestionsSchema,
  recipeSuggestionsSchema,
  fullRecipeSchema,
  cardsPreviewSchema,
};
