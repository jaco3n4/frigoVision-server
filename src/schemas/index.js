// Unités autorisées pour les ingrédients
const ALLOWED_UNITS = ["kg", "g", "l", "cl", "ml", "piece"];

// --- Schema : Repas avec ingrédients ---
const weeklyMealsSchema = {
  type: "OBJECT",
  properties: {
    meals: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          day: { type: "STRING" },
          slot: { type: "STRING" },
          title: { type: "STRING" },
          calories: { type: "INTEGER" },
          ingredients: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                ingredient_id: { type: "STRING" },
                name: { type: "STRING" },
                quantity: { type: "NUMBER" },
                unit: { type: "STRING", enum: ALLOWED_UNITS },
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
  type: "OBJECT",
  properties: {
    meals: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          day: { type: "STRING" },
          slot: { type: "STRING" },
          title: { type: "STRING" },
          description: { type: "STRING" },
          calories: { type: "INTEGER" },
        },
        required: ["day", "slot", "title", "description", "calories"],
      },
    },
  },
  required: ["meals"],
};

// --- Schema : Single meal ---
const singleMealSchema = {
  type: "OBJECT",
  properties: {
    meal: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        description: { type: "STRING" },
        calories: { type: "INTEGER" },
        protein: { type: "INTEGER" },
        carbs: { type: "INTEGER" },
        fat: { type: "INTEGER" },
        ingredients: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              ingredient_id: { type: "STRING" },
              name: { type: "STRING" },
              quantity: { type: "NUMBER" },
              unit: { type: "STRING", enum: ALLOWED_UNITS },
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
  type: "OBJECT",
  properties: {
    suggestions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          type: { type: "STRING" },
          title: { type: "STRING" },
          subtitle: { type: "STRING" },
          calories: { type: "STRING" },
          time: { type: "STRING" },
          match_score: { type: "INTEGER" },
          used_ingredients: {
            type: "ARRAY",
            items: { type: "STRING" },
          },
          missing_ingredients: {
            type: "ARRAY",
            items: { type: "STRING" },
          },
          upgrade_reason: { type: "STRING" },
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
  type: "OBJECT",
  properties: {
    suggestions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          type: { type: "STRING", description: "IMMEDIATE ou OBJECTIVE" },
          title: { type: "STRING" },
          subtitle: { type: "STRING" },
          calories: { type: "STRING" },
          time: { type: "STRING" },
          match_score: { type: "INTEGER" },
          used_ingredients: {
            type: "ARRAY",
            items: { type: "STRING" },
          },
          missing_ingredients: {
            type: "ARRAY",
            items: { type: "STRING" },
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
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    description: { type: "STRING" },
    prep_time: { type: "STRING" },
    cook_time: { type: "STRING" },
    servings: { type: "INTEGER" },
    difficulty: { type: "STRING" },
    calories_per_serving: { type: "INTEGER" },
    ingredients: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
    steps: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          step_number: { type: "INTEGER" },
          instruction: { type: "STRING" },
          timer_seconds: { type: "INTEGER", nullable: true },
        },
        required: ["step_number", "instruction"],
      },
    },
    chef_tip: { type: "STRING" },
    image_prompt: {
      type: "STRING",
      description: "Prompt en ANGLAIS pour générer la photo via FAL.AI",
    },
  },
  required: ["title", "ingredients", "steps", "image_prompt"],
};

// --- Schema : Product cooking guide cards ---
const cardsPreviewSchema = {
  type: "OBJECT",
  properties: {
    product_vibe: { type: "STRING" },
    cooking_info: {
      type: "OBJECT",
      properties: {
        method: { type: "STRING" },
        time: { type: "STRING" },
        details: { type: "STRING" },
      },
      required: ["method", "time", "details"],
    },
    cards: {
      type: "OBJECT",
      properties: {
        immediate: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            subtitle: { type: "STRING" },
            time: { type: "STRING" },
            calories: { type: "STRING" },
            badge: { type: "STRING" },
            equipment_used: { type: "STRING" },
          },
          required: ["title", "subtitle", "time", "calories", "badge", "equipment_used"],
        },
        objective: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            subtitle: { type: "STRING" },
            macros: { type: "STRING" },
            calories: { type: "STRING" },
            badge: { type: "STRING" },
            missing_ingredient: { type: "STRING" },
            equipment_used: { type: "STRING" },
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
