const { aiGlobal: ai } = require("../config/vertexai");
const { db, admin } = require("../config/firebase");
const { cleanAndParseJSON } = require("../utils/json");
const {
  buildProfileSection,
  buildEquipmentConstraint,
  readUserProfile,
} = require("../utils/profile");
const {
  buildInventory,
  buildInventoryString,
  subtractUsedIngredients,
} = require("../utils/inventory");
const {
  parseInventoryQuantity,
  matchIngredientId,
  normalizeIngName,
} = require("../utils/ingredients");
const { postProcessIngredients } = require("../utils/postprocess");
const {
  DIET_MAP,
  ALLERGY_MAP,
  EQUIPMENT_NAMES,
  DAY_KEYS,
} = require("../utils/constants");
const {
  weeklyMealsSchema,
  weeklySkeletonSchema,
  singleMealSchema,
} = require("../schemas");

// =====================================================================
// generateWeeklyPlan — V1 (cascade séquentielle)
// =====================================================================

async function generateWeeklyPlan(req, res, next) {
  const uid = req.user.uid;
  const { diet, calories } = req.body;
  const t0 = Date.now();
  console.log(
    "🟢 generateWeeklyPlan START — uid:",
    uid,
    "diet:",
    diet,
    "calories:",
    calories,
  );

  let pantryItems = [];
  let culinary = {};
  let equipment = [];
  try {
    const userDoc = await db.doc(`users/${uid}`).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      pantryItems = data.pantry || [];
      culinary = data.culinaryProfile || {};
      equipment = data.equipment || [];
    }
    console.log(
      "📦 Profil chargé en",
      Date.now() - t0,
      "ms — pantry:",
      pantryItems.length,
      "items",
    );
  } catch (err) {
    console.warn("⚠️ Impossible de lire le profil utilisateur:", err.message);
  }

  const { profileSection, dietLabel } = buildProfileSection(
    culinary,
    diet,
    equipment,
  );

  const inventory = pantryItems.map((item) => {
    const qty = parseInventoryQuantity(item.quantity);
    const matched = matchIngredientId(item.name);
    return {
      name: item.name,
      amount: qty.amount,
      unit: qty.unit,
      ingredientId: matched.id,
    };
  });

  const kcalTarget = calories || 2000;
  const kcalPerMeal = Math.round(kcalTarget / 2);
  const equipmentConstraint = buildEquipmentConstraint(equipment);

  const buildPrompt = (days, inventoryStr, isSecondHalf, previousMeals) => {
    const daysList = days.join(", ");
    const updateNote = isSecondHalf
      ? "\nATTENTION : L'inventaire ci-dessous est MIS À JOUR après les repas de Lundi-Mercredi. Les quantités restantes sont exactes."
      : "";

    const priorityNote = isSecondHalf
      ? `\n=== PRIORITÉ JEUDI-DIMANCHE ===
Tu peux être plus LIBRE avec les courses. Appuie-toi sur des ingrédients à acheter pour maintenir variété, équilibre nutritionnel et plaisir. Le frigo restant est un bonus, pas une contrainte.`
      : `\n=== PRIORITÉ LUNDI-MERCREDI (Zéro Gâchis) ===
Objectif : utiliser le MAXIMUM d'ingrédients FRAIS du frigo avant qu'ils ne périment. Les produits frais (viande, poisson, légumes fragiles, produits laitiers) doivent être consommés en priorité ces 3 jours.`;

    let alreadyPlannedSection = "";
    if (previousMeals && previousMeals.length > 0) {
      const mealList = previousMeals
        .map((m) => `- ${m.day} ${m.slot}: ${m.title}`)
        .join("\n");
      alreadyPlannedSection = `\n=== REPAS DÉJÀ PLANIFIÉS (Lundi-Mercredi) — INTERDIT de les répéter ou de proposer quelque chose de similaire ===
${mealList}
Tu DOIS proposer des plats COMPLÈTEMENT DIFFÉRENTS en termes de protéine principale, technique de cuisson et style culinaire.\n`;
    }

    return `Tu es un chef nutritionniste créatif et ingénieux.
${profileSection}${equipmentConstraint}
=== PLACARD DE BASE (toujours disponible, NE PAS lister dans les ingrédients) ===
Sel, poivre, huile d'olive, huile neutre, vinaigre, farine, sucre, ail, oignon, épices sèches communes (cumin, paprika, curry, herbes de Provence, thym, laurier).

=== INVENTAIRE FRIGO ===${updateNote}
${inventoryStr}
${priorityNote}
${alreadyPlannedSection}
=== MISSION ===
Génère les repas pour ${daysList}, Midi (lunch) et Soir (dinner).
Cible stricte : ~${kcalPerMeal} kcal PAR REPAS. Régime : ${dietLabel || "Équilibré"}.

=== RÈGLE DE DIVERSITÉ (ANTI-RÉPÉTITION) ===
Si l'inventaire du frigo est limité, tu as l'INTERDICTION de proposer deux recettes avec la même structure technique la même semaine. Tu DOIS varier les plaisirs en utilisant 3 leviers :
- La TECHNIQUE : Alterne entre sauté, gratiné, vapeur, mijoté, rôti, cru, poêlé, braisé.
- La DÉCOUPE : Varie la présentation (en dés, râpé, en lamelles, entier, émincé, haché).
- Le PIVOT CRÉATIF : Si le frigo est trop pauvre pour garantir de la variété, tu DOIS proposer l'achat de 1 ou 2 ingrédients "pivots".

=== COHÉRENCE CALORIQUE ===
Pour atteindre la cible de ~${kcalPerMeal} kcal, NE GONFLE PAS artificiellement la taille d'un plat léger (ex: pas d'omelette géante). Tu DOIS imaginer des accompagnements denses en énergie (fromage, pain, riz, avocat, oléagineux) et les inclure obligatoirement dans la description.

=== RÈGLES GÉNÉRALES ===
1. Utilise EN PRIORITÉ les ingrédients du frigo.
2. Les ingrédients du placard de base n'ont PAS besoin d'être listés dans les ingrédients.
3. Si le frigo ne suffit pas, ajoute des ingrédients à acheter.
4. Chaque repas : titre court (2-4 mots), calories estimées (~${kcalPerMeal} kcal), liste d'ingrédients.
5. Pour "day" utilise : monday, tuesday, wednesday, thursday, friday, saturday, sunday.
6. Pour "slot" utilise : lunch ou dinner.
7. FORMAT INGRÉDIENTS — chaque ingrédient est un OBJET avec 4 champs :
   - "ingredient_id" : pour les ingrédients du FRIGO qui ont un [ID:xxx], RECOPIE cet ID exactement. Pour les ingrédients à ACHETER (pas dans le frigo), mets "".
   - "name" : nom de l'ingrédient (ex: "Poulet", "Feta").
   - "quantity" : nombre (ex: 150, 2, 0.5). Jamais 0.
   - "unit" : unité STRICTEMENT parmi "kg", "g", "l", "cl", "ml" ou "piece". Pas d'autre valeur.
8. VIGILANCE ALLERGIES (SÉCURITÉ ABSOLUE) : Si le profil indique des allergies, tu as l'INTERDICTION d'utiliser des produits transformés, de boulangerie ou des sauces classiques qui contiennent traditionnellement cet allergène en ingrédient caché (ex: si allergie aux œufs = pas de pain brioché, pas de béchamel, pas de mayonnaise, pas de pâtes fraîches ; si allergie au lait = pas de beurre, pas de crème). Privilégie des associations 100% brutes et sûres.`;
  };

  try {
    const modelConfig = {
      responseMimeType: "application/json",
      responseSchema: weeklyMealsSchema,
      maxOutputTokens: 4096,
      temperature: 0.8,
      thinkingConfig: { thinkingBudget: 1024 },
    };

    const parseMeals = (result, label) => {
      const candidate = result.candidates?.[0];
      if (!candidate) {
        console.error(`⚠️ ${label} — Aucun candidate retourné`);
        return [];
      }
      const finishReason = candidate.finishReason;
      if (finishReason && finishReason !== "STOP") {
        console.warn(`⚠️ ${label} — finishReason: ${finishReason}`);
      }
      const raw = result.text;
      if (!raw) {
        console.error(`⚠️ ${label} — Pas de texte dans la réponse`);
        return [];
      }
      console.log(
        `📦 ${label} — raw length: ${raw.length} chars, finishReason: ${finishReason}`,
      );
      try {
        return JSON.parse(raw).meals || [];
      } catch {
        console.warn(
          `⚠️ ${label} — JSON.parse échoué, tentative cleanAndParseJSON...`,
        );
        return cleanAndParseJSON(raw).meals || [];
      }
    };

    const planDocRef = db.doc(`users/${uid}/planning/current_week`);

    const fillMeals = (plan, meals) => {
      for (const m of meals) {
        const dk = (m.day || "").toLowerCase();
        const slot = (m.slot || "").toLowerCase();
        if (plan[dk] && (slot === "lunch" || slot === "dinner")) {
          plan[dk][slot] = {
            title: m.title,
            calories: m.calories,
            ingredients: postProcessIngredients(m.ingredients).ingredients,
          };
        }
      }
    };

    const plan = {};
    for (const dk of DAY_KEYS) {
      plan[dk] = { lunch: null, dinner: null };
    }

    // CALL 1 : Lun-Mer
    const prompt1 = buildPrompt(
      ["Monday (Lundi)", "Tuesday (Mardi)", "Wednesday (Mercredi)"],
      buildInventoryString(inventory),
      false,
      null,
    );
    console.log(
      JSON.stringify({
        event: "AI_REQUEST",
        fn: "generateWeeklyPlan",
        call: "1_LunMer",
        inventoryCount: inventory.length,
        prompt: prompt1,
      }),
    );
    const t1 = Date.now();
    const result1 = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt1,
      config: modelConfig,
    });
    const raw1 = result1.text || "";
    const meals1 = parseMeals(result1, "CALL 1 (Lun-Mer)");
    console.log(
      JSON.stringify({
        event: "AI_RESPONSE",
        fn: "generateWeeklyPlan",
        call: "1_LunMer",
        durationMs: Date.now() - t1,
        mealsCount: meals1.length,
        response: raw1,
      }),
    );

    fillMeals(plan, meals1);
    await planDocRef.set({ ...plan, isGenerating: true });

    const updatedInventory = subtractUsedIngredients(inventory, meals1);

    // CALL 2 : Jeu-Dim
    const prompt2 = buildPrompt(
      [
        "Thursday (Jeudi)",
        "Friday (Vendredi)",
        "Saturday (Samedi)",
        "Sunday (Dimanche)",
      ],
      buildInventoryString(updatedInventory),
      true,
      meals1,
    );
    console.log(
      JSON.stringify({
        event: "AI_REQUEST",
        fn: "generateWeeklyPlan",
        call: "2_JeuDim",
        inventoryCount: updatedInventory.length,
        prompt: prompt2,
      }),
    );
    const t2 = Date.now();
    const result2 = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt2,
      config: modelConfig,
    });
    const raw2 = result2.text || "";
    const meals2 = parseMeals(result2, "CALL 2 (Jeu-Dim)");
    console.log(
      JSON.stringify({
        event: "AI_RESPONSE",
        fn: "generateWeeklyPlan",
        call: "2_JeuDim",
        durationMs: Date.now() - t2,
        mealsCount: meals2.length,
        response: raw2,
      }),
    );

    fillMeals(plan, meals2);
    await planDocRef.set({ ...plan, isGenerating: false });

    console.log("🏁 generateWeeklyPlan DONE en", Date.now() - t0, "ms total");
    return res.json({ plan });
  } catch (error) {
    console.error("❌ Erreur generateWeeklyPlan:", error.message, error.stack);
    next(error);
  }
}

// =====================================================================
// streamWeeklyPlan — SSE endpoint
// =====================================================================

async function streamWeeklyPlan(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth déjà gérée par le middleware requireAuth
  const uid = req.user.uid;
  const { diet, calories, nutrition, mood, servings, lockedMeals, excludeMeals } = req.body;
  const numServings = Math.min(Math.max(Number(servings) || 2, 1), 12);
  const t0 = Date.now();
  console.log("🟢 streamWeeklyPlan SSE START — uid:", uid, "diet:", diet, "servings:", numServings);

  // SSE headers
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const planDocRef = db.doc(`users/${uid}/planning/current_week`);

  try {
    const { pantryItems, culinary, equipment } = await readUserProfile(uid);
    const { profileSection, dietLabel } = buildProfileSection(
      culinary,
      diet,
      equipment,
    );
    const inventory = buildInventory(pantryItems);
    const inventoryStr = buildInventoryString(inventory, { includeIds: false });
    const kcalTarget = calories || nutrition?.kcal || 2000;
    const kcalPerMeal = Math.round(kcalTarget / 2);
    const equipmentConstraint = buildEquipmentConstraint(equipment);

    console.log(
      "📦 Profil chargé en",
      Date.now() - t0,
      "ms — pantry:",
      pantryItems.length,
      "items",
    );

    // Correction 2 — Lire l'historique des plats récents
    const historyDoc = await db.doc(`users/${uid}/planning/history`).get();
    const recentTitles = historyDoc.exists ? (historyDoc.data().recentMealTitles || []) : [];

    const historySection = recentTitles.length > 0
      ? `\n=== MÉMOIRE — Plats générés récemment (${recentTitles.length} plats) — ÉVITER ===\n${recentTitles.join(', ')}\nVarie au maximum par rapport à cette liste.\n`
      : '';

    // Correction 1 — Section d'exclusion des plats actuels
    const excludeSection = Array.isArray(excludeMeals) && excludeMeals.length > 0
      ? `\n=== REPAS PRÉCÉDENTS — INTERDIT de les reproposer ===\n${excludeMeals.map(t => `- ${t}`).join('\n')}\nTu DOIS proposer des plats COMPLÈTEMENT DIFFÉRENTS de cette liste (titre, protéine principale et technique de cuisson différents).\n`
      : '';

    const emptyPlan = {};
    for (const dk of DAY_KEYS) {
      emptyPlan[dk] = { lunch: null, dinner: null };
    }
    await planDocRef.set({ ...emptyPlan, isGenerating: true });

    // Construire la section plats verrouilles
    const lockedSection = Array.isArray(lockedMeals) && lockedMeals.length > 0
      ? `\n=== REPAS VERROUILLÉS (NE PAS REMPLACER) ===\n${lockedMeals.map((m) => `- ${m.day} ${m.slot}: ${m.title} (${m.description || ""})`).join("\n")}\nTu DOIS conserver ces repas tels quels. Ne génère QUE les repas non verrouillés.\n`
      : "";
    const numMealsToGenerate = 14 - (Array.isArray(lockedMeals) ? lockedMeals.length : 0);

    const prompt = `Tu es un chef nutritionniste créatif et ingénieux. Tu conçois des menus exceptionnels.
${profileSection}${equipmentConstraint}
=== NOMBRE DE CONVIVES ===
Adapte les quantités pour ${numServings} personne${numServings > 1 ? "s" : ""}.
Les calories ci-dessous sont PAR PERSONNE.

=== INVENTAIRE FRIGO (pour contexte — les ingrédients seront calculés séparément) ===
${inventoryStr}

=== RÈGLE ANTI-GASPI ===
Tu DOIS concevoir tes repas de manière à utiliser au moins 80% des ingrédients listés dans le frigo au moins une fois dans la semaine.
${lockedSection}${excludeSection}${historySection}
=== MISSION ===
Conçois un menu de ${numMealsToGenerate} repas pour la semaine (Lundi-Dimanche, Midi et Soir).
Chaque repas DOIT contenir entre ${Math.round(kcalPerMeal * 0.8)} et ${Math.round(kcalPerMeal * 1.2)} kcal PAR PERSONNE.
Cible idéale : ${kcalPerMeal} kcal. NE DÉPASSE JAMAIS ${Math.round(kcalPerMeal * 1.2)} kcal.
Adapte le TYPE de plat à la cible calorique :
- Si < 400 kcal/repas : salades, poké bowls, soupes, plats vapeur légers.
- Si 400-600 kcal/repas : plats équilibrés classiques, woks, grillades avec légumes.
- Si 600-800 kcal/repas : plats complets avec féculents, gratins, plats mijotés.
- Si > 800 kcal/repas : plats riches, burgers, plats en sauce, pâtes généreuses.
Si tu ne peux pas faire tenir la recette dans cette fourchette calorique, change de recette.
Régime : ${dietLabel || "Équilibré"}.
NE LISTE AUCUN INGRÉDIENT. Donne uniquement les titres et descriptions.

=== RÈGLES ===
1. Titre court et appétissant (2-4 mots max).
2. Description : 1 phrase évocatrice et gourmande (max 15 mots).
3. Calories estimées par repas PAR PERSONNE (~${kcalPerMeal} kcal).
4. COHÉRENCE CALORIQUE : Pour atteindre la cible de ~${kcalPerMeal} kcal, NE GONFLE PAS artificiellement la taille d'un plat léger (ex: pas d'omelette géante). Tu DOIS imaginer des accompagnements denses en énergie (fromage, pain, riz, avocat, oléagineux) et les inclure obligatoirement dans la description.
5. VARIÉTÉ ABSOLUE : chaque repas doit avoir une protéine, une technique de cuisson et un style culinaire différents.
6. Alterne les cuisines du monde : française, italienne, asiatique, méditerranéenne, mexicaine, indienne, etc.
7. Pour "day" utilise : monday, tuesday, wednesday, thursday, friday, saturday, sunday.
8. Pour "slot" utilise : lunch ou dinner.
9. VIGILANCE ALLERGIES (SÉCURITÉ ABSOLUE) : Si le profil indique des allergies, tu as l'INTERDICTION d'utiliser des produits transformés, de boulangerie ou des sauces classiques qui contiennent traditionnellement cet allergène en ingrédient caché (ex: si allergie aux œufs = pas de pain brioché, pas de béchamel, pas de mayonnaise, pas de pâtes fraîches ; si allergie au lait = pas de beurre, pas de crème). Privilégie des associations 100% brutes et sûres.`;

    console.log(
      JSON.stringify({ event: "AI_REQUEST", fn: "streamWeeklyPlan", prompt }),
    );

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: weeklySkeletonSchema,
        maxOutputTokens: 8192,
        temperature: 0.8,
        thinkingConfig: { thinkingBudget: 1024 },
      },
    });
    let fullText = "";

    for await (const chunk of stream) {
      if (chunk.text) {
        fullText += chunk.text;
        res.write(`data: ${JSON.stringify({ chunk: chunk.text })}\n\n`);
      }
    }

    console.log(
      JSON.stringify({
        event: "AI_RESPONSE",
        fn: "streamWeeklyPlan",
        length: fullText.length,
        response: fullText,
      }),
    );

    let meals;
    try {
      meals = JSON.parse(fullText).meals || [];
    } catch {
      try {
        meals = cleanAndParseJSON(fullText).meals || [];
      } catch {
        console.error(
          "❌ Échec total parsing streaming:",
          fullText.slice(0, 500),
        );
        throw new Error("Format JSON invalide généré par l'IA.");
      }
    }

    console.log(
      "✅ Stream parsé:",
      meals.length,
      "repas en",
      Date.now() - t0,
      "ms",
    );

    // Correction 4 — Validation post-génération des calories
    const kcalMin = Math.round(kcalPerMeal * 0.7);
    const kcalMax = Math.round(kcalPerMeal * 1.3);
    for (const m of meals) {
      if (m.calories < kcalMin || m.calories > kcalMax) {
        console.warn(`⚠️ Calorie hors range: ${m.title} = ${m.calories} kcal (cible: ${kcalPerMeal}, range: ${kcalMin}-${kcalMax})`);
        m.calories = Math.max(kcalMin, Math.min(kcalMax, m.calories));
      }
    }

    // Correction 2 — Sauvegarder l'historique des titres récents (tâche de fond, non bloquant)
    const newTitles = meals.map(m => m.title).filter(Boolean);
    const oldTitles = historyDoc.exists ? (historyDoc.data().recentMealTitles || []) : [];
    const updatedTitles = [...newTitles, ...oldTitles].slice(0, 42);
    db.doc(`users/${uid}/planning/history`).set({ recentMealTitles: updatedTitles, updatedAt: new Date() })
      .catch(err => console.warn('⚠️ Erreur sauvegarde historique:', err.message));

    const plan = {};
    for (const dk of DAY_KEYS) {
      plan[dk] = { lunch: null, dinner: null };
    }
    for (const m of meals) {
      const dk = (m.day || "").toLowerCase();
      const slot = (m.slot || "").toLowerCase();
      if (plan[dk] && (slot === "lunch" || slot === "dinner")) {
        plan[dk][slot] = {
          title: m.title || "",
          description: m.description || "",
          calories: m.calories || 0,
          ingredients: [],
        };
      }
    }
    // Re-injecter les plats verrouilles dans le plan
    if (Array.isArray(lockedMeals) && lockedMeals.length > 0) {
      const existingDoc = await planDocRef.get();
      const existingPlan = existingDoc.exists ? existingDoc.data() : {};
      for (const lm of lockedMeals) {
        const dk = (lm.day || "").toLowerCase();
        const slot = (lm.slot || "").toLowerCase();
        if (plan[dk] && (slot === "lunch" || slot === "dinner") && existingPlan[dk]?.[slot]) {
          plan[dk][slot] = existingPlan[dk][slot];
        }
      }
    }
    await planDocRef.set({ ...plan, isGenerating: true });

    res.write(`data: ${JSON.stringify({ event: "complete" })}\n\n`);
    console.log(
      "🏁 streamWeeklyPlan Phase A DONE en",
      Date.now() - t0,
      "ms —",
      meals.length,
      "repas",
    );

    // Phase B — await avant res.end() pour garder le CPU Cloud Run alloué
    // Le client a déjà reçu l'event "complete", le XHR reste ouvert silencieusement
    if (meals.length > 0) {
      console.log("🚀 Phase B déclenchée (direct, même requête)");
      await runPhaseB({
        uid,
        meals: meals.map((m) => ({
          day: (m.day || "").toLowerCase(),
          slot: (m.slot || "").toLowerCase(),
          title: m.title || "",
          description: m.description || "",
          calories: m.calories || 0,
        })),
        inventory: inventory.map((i) => ({
          name: i.name,
          amount: i.amount,
          unit: i.unit,
          ingredientId: i.ingredientId,
        })),
        profileSection,
        dietLabel,
        kcalTarget: Number(kcalTarget),
        equipmentConstraint,
        servings: numServings,
      });
    }

    res.end();
  } catch (error) {
    console.error("❌ streamWeeklyPlan ERROR:", error.message, error.stack);
    res.write(
      `data: ${JSON.stringify({ event: "error", message: error.message })}\n\n`,
    );
    try {
      await planDocRef.set(
        { isGenerating: false, generationError: error.message },
        { merge: true },
      );
    } catch {
      /* silent */
    }
    res.end();
  }
}

// =====================================================================
// generateWeeklyPlanSkeleton — Deprecated (conservé pour rollback)
// =====================================================================

async function generateWeeklyPlanSkeleton(req, res, next) {
  const uid = req.user.uid;
  const { diet, calories, nutrition, mood } = req.body;
  const t0 = Date.now();
  console.log("🟢 generateWeeklyPlanSkeleton START — uid:", uid, "diet:", diet);

  const { pantryItems, culinary, equipment } = await readUserProfile(uid);
  const { profileSection, dietLabel } = buildProfileSection(
    culinary,
    diet,
    equipment,
  );
  const inventory = buildInventory(pantryItems);
  const inventoryStr = buildInventoryString(inventory, { includeIds: false });
  const kcalTarget = calories || nutrition?.kcal || 2000;
  const kcalPerMeal = Math.round(kcalTarget / 2);
  const equipmentConstraint = buildEquipmentConstraint(equipment);

  const skeletonPrompt = `Tu es un chef nutritionniste créatif et ingénieux. Tu conçois des menus exceptionnels.
${profileSection}${equipmentConstraint}
=== INVENTAIRE FRIGO (pour contexte — les ingrédients seront calculés séparément) ===
${inventoryStr}

=== RÈGLE ANTI-GASPI ===
Tu DOIS concevoir tes 14 repas de manière à utiliser au moins 80% des ingrédients listés dans le frigo au moins une fois dans la semaine.

=== MISSION ===
Conçois un menu de 14 repas pour la semaine (Lundi-Dimanche, Midi et Soir).
Cible stricte : ~${kcalPerMeal} kcal PAR REPAS. Régime : ${dietLabel || "Équilibré"}.
NE LISTE AUCUN INGRÉDIENT. Donne uniquement les titres et descriptions.

=== RÈGLES ===
1. Titre court et appétissant (2-4 mots max).
2. Description : 1 phrase évocatrice et gourmande (max 15 mots).
3. Calories estimées par repas (~${kcalPerMeal} kcal).
4. COHÉRENCE CALORIQUE : Pour atteindre la cible de ~${kcalPerMeal} kcal, NE GONFLE PAS artificiellement la taille d'un plat léger (ex: pas d'omelette géante). Tu DOIS imaginer des accompagnements denses en énergie (fromage, pain, riz, avocat, oléagineux) et les inclure obligatoirement dans la description.
5. VARIÉTÉ ABSOLUE : chaque repas doit avoir une protéine, une technique de cuisson et un style culinaire différents.
6. Alterne les cuisines du monde.
7. Pour "day" utilise : monday, tuesday, wednesday, thursday, friday, saturday, sunday.
8. Pour "slot" utilise : lunch ou dinner.
9. VIGILANCE ALLERGIES (SÉCURITÉ ABSOLUE) : Si le profil indique des allergies, tu as l'INTERDICTION d'utiliser des produits transformés, de boulangerie ou des sauces classiques qui contiennent traditionnellement cet allergène en ingrédient caché (ex: si allergie aux œufs = pas de pain brioché, pas de béchamel, pas de mayonnaise, pas de pâtes fraîches ; si allergie au lait = pas de beurre, pas de crème). Privilégie des associations 100% brutes et sûres.`;

  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: skeletonPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: weeklySkeletonSchema,
        maxOutputTokens: 8192,
        temperature: 0.9,
        thinkingConfig: { thinkingBudget: 1024 },
      },
    });
    const raw = result.text;
    if (!raw) throw new Error("Gemini n'a retourné aucun contenu");

    let meals;
    try {
      meals = JSON.parse(raw).meals || [];
    } catch {
      meals = cleanAndParseJSON(raw).meals || [];
    }

    console.log(
      "✅ Skeleton Gemini en",
      Date.now() - t0,
      "ms —",
      meals.length,
      "repas",
    );

    const plan = {};
    for (const dk of DAY_KEYS) {
      plan[dk] = { lunch: null, dinner: null };
    }
    for (const m of meals) {
      const dk = (m.day || "").toLowerCase();
      const slot = (m.slot || "").toLowerCase();
      if (plan[dk] && (slot === "lunch" || slot === "dinner")) {
        plan[dk][slot] = {
          title: m.title || "",
          description: m.description || "",
          calories: m.calories || 0,
          ingredients: [],
        };
      }
    }

    const planDocRef = db.doc(`users/${uid}/planning/current_week`);
    await planDocRef.set({ ...plan, isGenerating: true });

    console.log("🏁 generateWeeklyPlanSkeleton DONE en", Date.now() - t0, "ms");

    // Phase B — fire-and-forget
    runPhaseB({
      uid,
      meals: meals.map((m) => ({
        day: (m.day || "").toLowerCase(),
        slot: (m.slot || "").toLowerCase(),
        title: m.title || "",
        description: m.description || "",
        calories: m.calories || 0,
      })),
      inventory: inventory.map((i) => ({
        name: i.name,
        amount: i.amount,
        unit: i.unit,
        ingredientId: i.ingredientId,
      })),
      profileSection,
      dietLabel,
      kcalTarget: Number(kcalTarget),
      equipmentConstraint,
    }).catch((err) => console.error("❌ Phase B fire-and-forget error:", err.message));

    return res.json({ status: "skeleton_ready" });
  } catch (error) {
    console.error("❌ Erreur generateWeeklyPlanSkeleton:", error.message);
    try {
      await db
        .doc(`users/${uid}/planning/current_week`)
        .set(
          { isGenerating: false, generationError: error.message },
          { merge: true },
        );
    } catch {
      /* silent */
    }
    next(error);
  }
}

// =====================================================================
// writeAnalyticsBatches — Écriture analytics fire-and-forget
// =====================================================================

function writeAnalyticsBatches(allUnmatched, allFuzzy, allExact) {
  if (allUnmatched.length > 0) {
    const batch = db.batch();
    const grouped = new Map();
    for (const item of allUnmatched) {
      const key = normalizeIngName(item.name);
      if (!key) continue;
      if (!grouped.has(key))
        grouped.set(key, { name: item.name, variants: new Set(), contexts: new Set() });
      const g = grouped.get(key);
      g.variants.add(item.name);
      if (item.context) g.contexts.add(item.context);
    }
    for (const [key, g] of grouped) {
      batch.set(db.collection("unmatched_ingredients").doc(key), {
        name: g.name,
        variants: admin.firestore.FieldValue.arrayUnion(...g.variants),
        contexts: admin.firestore.FieldValue.arrayUnion(...[...g.contexts].slice(0, 5)),
        count: admin.firestore.FieldValue.increment(1),
        lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    batch.commit()
      .then(() => console.log(`📦 ${grouped.size} ingrédients non-matchés enregistrés`))
      .catch((e) => console.warn("⚠️ Erreur écriture unmatched:", e.message));
  }

  if (allFuzzy.length > 0) {
    const batch = db.batch();
    const grouped = new Map();
    for (const item of allFuzzy) {
      const key = normalizeIngName(item.geminiName);
      if (!key) continue;
      if (!grouped.has(key))
        grouped.set(key, { geminiName: item.geminiName, canonicalName: item.canonicalName, ingredientId: item.ingredientId, variants: new Set(), contexts: new Set() });
      const g = grouped.get(key);
      g.variants.add(item.geminiName);
      if (item.context) g.contexts.add(item.context);
    }
    for (const [key, g] of grouped) {
      batch.set(db.collection("fuzzy_matched_ingredients").doc(key), {
        geminiName: g.geminiName, canonicalName: g.canonicalName, ingredientId: g.ingredientId,
        variants: admin.firestore.FieldValue.arrayUnion(...g.variants),
        contexts: admin.firestore.FieldValue.arrayUnion(...[...g.contexts].slice(0, 5)),
        count: admin.firestore.FieldValue.increment(1),
        lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    batch.commit()
      .then(() => console.log(`🔀 ${grouped.size} fuzzy matches enregistrés`))
      .catch((e) => console.warn("⚠️ Erreur écriture fuzzy:", e.message));
  }

  if (allExact.length > 0) {
    const batch = db.batch();
    const grouped = new Map();
    for (const item of allExact) {
      const key = normalizeIngName(item.name);
      if (!key) continue;
      if (!grouped.has(key))
        grouped.set(key, { name: item.name, ingredientId: item.ingredientId, contexts: new Set() });
      const g = grouped.get(key);
      if (item.context) g.contexts.add(item.context);
    }
    for (const [key, g] of grouped) {
      batch.set(db.collection("exact_matched_ingredients").doc(key), {
        name: g.name, ingredientId: g.ingredientId,
        contexts: admin.firestore.FieldValue.arrayUnion(...[...g.contexts].slice(0, 5)),
        count: admin.firestore.FieldValue.increment(1),
        lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    batch.commit()
      .then(() => console.log(`✅ ${grouped.size} exact matches enregistrés`))
      .catch((e) => console.warn("⚠️ Erreur écriture exact:", e.message));
  }
}

// =====================================================================
// runPhaseB — Génération des ingrédients (appelé directement, sans Pub/Sub)
// =====================================================================

async function runPhaseB({ uid, meals, inventory, profileSection, dietLabel, kcalTarget, equipmentConstraint, servings: payloadServings }) {
  const numServings = Math.min(Math.max(Number(payloadServings) || 2, 1), 12);
  const t0 = Date.now();
  const planDocRef = db.doc(`users/${uid}/planning/current_week`);
  console.log(
    "🟢 runPhaseB START — uid:",
    uid,
    "meals:",
    meals.length,
  );

  try {
    const kcalPerMeal = Math.round((kcalTarget || 2000) / 2);

    const ingredientModelConfig = {
      responseMimeType: "application/json",
      responseSchema: weeklyMealsSchema,
      maxOutputTokens: 8192,
      temperature: 0.2,
      thinkingConfig: { thinkingBudget: 0 },
    };

    const buildIngredientPrompt = (skeletonMeals, inv) => {
      const inventoryStr = buildInventoryString(inv);
      const mealsToProcess = skeletonMeals
        .map(
          (m) =>
            `- ${m.day} ${m.slot}: "${m.title}" (${m.description}) ~${m.calories} kcal`,
        )
        .join("\n");

      return `Tu es un chef nutritionniste.
${profileSection}${equipmentConstraint || ""}
=== NOMBRE DE CONVIVES ===
Adapte les quantités d'ingrédients pour ${numServings} personne${numServings > 1 ? "s" : ""}.

=== PLACARD DE BASE (toujours disponible, NE PAS lister dans les ingrédients) ===
Sel, poivre, huile d'olive, huile neutre, vinaigre, farine, sucre, ail, oignon, épices sèches communes (cumin, paprika, curry, herbes de Provence, thym, laurier).

=== INVENTAIRE FRIGO ===
${inventoryStr}

=== REPAS À COMPLÉTER (titres FIXES — NE PAS les modifier) ===
${mealsToProcess}

=== MISSION ===
Pour chaque repas listé ci-dessus, génère la liste exacte des ingrédients nécessaires pour ${numServings} personne${numServings > 1 ? "s" : ""}.
Tu DOIS conserver EXACTEMENT les mêmes titres. Tu ajoutes UNIQUEMENT les ingrédients.
Pour chaque repas, les calories cibles sont celles indiquées entre parenthèses (~X kcal). Adapte les quantités d'ingrédients pour atteindre EXACTEMENT ces calories, pas la cible générique.
Chaque repas DOIT contenir entre ${Math.round(kcalPerMeal * 0.8)} et ${Math.round(kcalPerMeal * 1.2)} kcal PAR PERSONNE.
Cible idéale : ${kcalPerMeal} kcal. NE DÉPASSE JAMAIS ${Math.round(kcalPerMeal * 1.2)} kcal.
Adapte le TYPE de plat à la cible calorique :
- Si < 400 kcal/repas : salades, poké bowls, soupes, plats vapeur légers.
- Si 400-600 kcal/repas : plats équilibrés classiques, woks, grillades avec légumes.
- Si 600-800 kcal/repas : plats complets avec féculents, gratins, plats mijotés.
- Si > 800 kcal/repas : plats riches, burgers, plats en sauce, pâtes généreuses.
Si tu ne peux pas faire tenir la recette dans cette fourchette calorique, change de recette.
Régime : ${dietLabel || "Équilibré"}.

=== RÈGLE ANTI-GASPI ===
Utilise en priorité l'inventaire du frigo pour composer la recette.

=== ACCOMPAGNEMENTS ===
Attention : si des accompagnements ont été générés pour atteindre les calories (riz, pain, fromage, etc.), ils DOIVENT figurer dans la liste d'ingrédients avec leur quantité exacte.

=== FORMAT INGRÉDIENTS ===
Chaque ingrédient est un OBJET avec 4 champs :
- "ingredient_id" : pour les ingrédients du FRIGO qui ont un [ID:xxx], RECOPIE cet ID exactement. Pour les ingrédients à ACHETER, mets "".
- "name" : nom GÉNÉRIQUE de l'ingrédient, SANS qualifier alimentaire (halal, casher, bio, vegan, fermier, label rouge…). Exemple : "Escalope de poulet", JAMAIS "Escalope de poulet halal". Le régime de l'utilisateur est déjà pris en compte.
- "quantity" : nombre (ex: 150, 2, 0.5). Jamais 0.
- "unit" : unité STRICTEMENT parmi "kg", "g", "l", "cl", "ml" ou "piece". Pas d'autre valeur.`;
    };

    const firstHalfMeals = meals.filter((m) =>
      ["monday", "tuesday", "wednesday"].includes(m.day),
    );
    const secondHalfMeals = meals.filter((m) =>
      ["thursday", "friday", "saturday", "sunday"].includes(m.day),
    );
    console.log(
      "🔵 INGREDIENTS — Lun-Mer:",
      firstHalfMeals.length,
      "repas | Jeu-Dim:",
      secondHalfMeals.length,
      "repas",
    );

    const inventoryForPrompt = (inventory || []).map((i) => ({
      name: i.name,
      amount: i.amount,
      unit: i.unit,
      ingredientId: i.ingredientId,
    }));

    const ingredientPrompt1 = buildIngredientPrompt(
      firstHalfMeals,
      inventoryForPrompt,
    );
    const ingredientPrompt2 = buildIngredientPrompt(
      secondHalfMeals,
      inventoryForPrompt,
    );
    console.log(
      JSON.stringify({
        event: "AI_REQUEST",
        fn: "processMealIngredients",
        call: "1_LunMer",
        prompt: ingredientPrompt1,
      }),
    );
    console.log(
      JSON.stringify({
        event: "AI_REQUEST",
        fn: "processMealIngredients",
        call: "2_JeuDim",
        prompt: ingredientPrompt2,
      }),
    );

    const [result1, result2] = await Promise.all([
      ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: ingredientPrompt1,
        config: ingredientModelConfig,
      }),
      ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: ingredientPrompt2,
        config: ingredientModelConfig,
      }),
    ]);

    const rawIngredients1 = result1.text || "";
    const rawIngredients2 = result2.text || "";
    console.log(
      JSON.stringify({
        event: "AI_RESPONSE",
        fn: "processMealIngredients",
        call: "1_LunMer",
        response: rawIngredients1,
      }),
    );
    console.log(
      JSON.stringify({
        event: "AI_RESPONSE",
        fn: "processMealIngredients",
        call: "2_JeuDim",
        response: rawIngredients2,
      }),
    );

    const parseParts = (result, label) => {
      const raw = result.text;
      if (!raw) {
        console.error(`❌ ${label} : aucun contenu`);
        return [];
      }
      try {
        return JSON.parse(raw).meals || [];
      } catch {
        return cleanAndParseJSON(raw).meals || [];
      }
    };

    const meals1 = parseParts(result1, "CALL 1 (Lun-Mer)");
    const meals2 = parseParts(result2, "CALL 2 (Jeu-Dim)");
    console.log(
      "✅ Les 2 calls — Call1:",
      meals1.length,
      "repas | Call2:",
      meals2.length,
      "repas",
    );

    const updateAll = {};
    const allUnmatched = [];
    const allFuzzy = [];
    const allExact = [];
    for (const m of [...meals1, ...meals2]) {
      const dk = (m.day || "").toLowerCase();
      const slot = (m.slot || "").toLowerCase();
      if (slot === "lunch" || slot === "dinner") {
        const {
          ingredients: processed,
          unmatched,
          fuzzy,
          exact,
        } = postProcessIngredients(m.ingredients, `${dk}.${slot} — ${m.title}`);
        updateAll[`${dk}.${slot}.ingredients`] = processed;
        if (m.calories) updateAll[`${dk}.${slot}.calories`] = m.calories;
        allUnmatched.push(...unmatched);
        allFuzzy.push(...fuzzy);
        allExact.push(...exact);
      }
    }
    updateAll.isGenerating = false;
    await planDocRef.update(updateAll);
    console.log(
      "📝 Firestore update — tous les ingrédients écrits, isGenerating: false",
    );

    // Analytics writes — fire-and-forget (non-bloquant pour l'UX)
    writeAnalyticsBatches(allUnmatched, allFuzzy, allExact);

    console.log(
      "🏁 runPhaseB DONE en",
      Date.now() - t0,
      "ms total",
    );
  } catch (error) {
    console.error(
      "❌ runPhaseB ERROR:",
      error.message,
      error.stack,
    );
  } finally {
    try {
      const doc = await planDocRef.get();
      if (doc.exists && doc.data().isGenerating === true) {
        await planDocRef.update({ isGenerating: false });
        console.log("🔓 isGenerating forcé à false dans finally");
      }
    } catch (e) {
      console.error("⚠️ Impossible de reset isGenerating:", e.message);
    }
  }
}

// =====================================================================
// regenerateSingleMeal
// =====================================================================

async function regenerateSingleMeal(req, res, next) {
  const uid = req.user.uid;
  const { day, type, currentMeals, preferences, servings } = req.body;

  // Validation
  const validDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  if (!day || !validDays.includes(day)) {
    return res.status(400).json({ error: `Invalid day: ${day}. Must be one of ${validDays.join(", ")}` });
  }
  if (!type || (type !== "lunch" && type !== "dinner")) {
    return res.status(400).json({ error: `Invalid type: ${type}. Must be "lunch" or "dinner"` });
  }

  const rawServings = Number(servings) || Number(preferences?.servings) || 2;
  const numServings = Math.min(Math.max(rawServings, 1), 12);
  const t0 = Date.now();
  console.log("🔄 regenerateSingleMeal START —", day, type, "servings:", numServings);

  let pantryItems = [];
  let culinary = {};
  let equipment = [];
  try {
    const userDoc = await db.doc(`users/${uid}`).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      pantryItems = data.pantry || [];
      culinary = data.culinaryProfile || {};
      equipment = data.equipment || [];
    }
  } catch (err) {
    console.warn("⚠️ Profil read error:", err.message);
  }

  const { profileSection, dietLabel } = buildProfileSection(
    culinary,
    preferences?.diet,
    equipment,
  );
  const equipmentConstraint = buildEquipmentConstraint(equipment);

  const inventoryStr =
    pantryItems.length > 0
      ? pantryItems
          .map((item) => {
            const qty = parseInventoryQuantity(item.quantity);
            const matched = matchIngredientId(item.name);
            const idTag = matched.id ? `[ID:${matched.id}]` : "";
            if (qty.amount > 0 && qty.unit && qty.unit !== "piece")
              return `${idTag}${item.name} (${qty.amount}${qty.unit})`;
            if (qty.amount > 0) return `${idTag}${item.name} (${qty.amount})`;
            return `${idTag}${item.name}`;
          })
          .join(", ")
      : "Frigo vide — propose une recette avec des ingrédients courants.";

  const existingMeals = currentMeals || [];
  const exclusionList = existingMeals
    .map((m) => `- ${m.day} ${m.slot}: ${m.title} (${m.description || ""})`)
    .join("\n");
  const kcalTarget = preferences?.kcal || preferences?.nutrition?.kcal || 2000;
  const kcalPerMeal = Math.round(kcalTarget / 2);

  const prompt = `Tu es un chef nutritionniste créatif et ingénieux.
${profileSection}${equipmentConstraint}
=== NOMBRE DE CONVIVES ===
Adapte les quantités pour ${numServings} personne${numServings > 1 ? "s" : ""}.
Les calories ci-dessous sont PAR PERSONNE.

=== PLACARD DE BASE (toujours disponible, NE PAS lister dans les ingrédients) ===
Sel, poivre, huile d'olive, huile neutre, vinaigre, farine, sucre, ail, oignon, épices sèches communes.

=== INVENTAIRE FRIGO ===
${inventoryStr}

=== REPAS DÉJÀ DANS LE PLANNING — INTERDIT de répéter ===
${exclusionList || "(aucun)"}

=== MISSION ===
Génère UN SEUL repas alternatif pour ${day} ${type === "lunch" ? "Midi" : "Soir"}.
Chaque repas DOIT contenir entre ${Math.round(kcalPerMeal * 0.8)} et ${Math.round(kcalPerMeal * 1.2)} kcal PAR PERSONNE.
Cible idéale : ${kcalPerMeal} kcal. NE DÉPASSE JAMAIS ${Math.round(kcalPerMeal * 1.2)} kcal.
Adapte le TYPE de plat à la cible calorique :
- Si < 400 kcal/repas : salades, poké bowls, soupes, plats vapeur légers.
- Si 400-600 kcal/repas : plats équilibrés classiques, woks, grillades avec légumes.
- Si 600-800 kcal/repas : plats complets avec féculents, gratins, plats mijotés.
- Si > 800 kcal/repas : plats riches, burgers, plats en sauce, pâtes généreuses.
Si tu ne peux pas faire tenir la recette dans cette fourchette calorique, change de recette.
Régime : ${dietLabel || "Équilibré"}.
Les quantités d'ingrédients doivent être adaptées pour ${numServings} convive${numServings > 1 ? "s" : ""}.

=== RÈGLES ===
1. Le plat DOIT être COMPLÈTEMENT DIFFÉRENT de tous les repas listés ci-dessus.
2. Utilise en priorité les ingrédients du frigo.
3. Titre court (2-4 mots), description (1 phrase appétissante).
4. COHÉRENCE CALORIQUE : Pour atteindre la cible de ~${kcalPerMeal} kcal, NE GONFLE PAS artificiellement la taille d'un plat léger (ex: pas d'omelette géante). Tu DOIS imaginer des accompagnements denses en énergie (fromage, pain, riz, avocat, oléagineux) et les inclure obligatoirement dans la description.
5. FORMAT INGRÉDIENTS — chaque ingrédient est un OBJET avec 4 champs :
   - "ingredient_id" : pour les ingrédients du FRIGO qui ont un [ID:xxx], RECOPIE cet ID exactement. Pour les ingrédients à ACHETER, mets "".
   - "name" : nom GÉNÉRIQUE de l'ingrédient UNIQUEMENT, SANS quantité, SANS unité, SANS qualifier alimentaire (halal, casher, bio, vegan, fermier…). Exemple : "Poivron rouge", JAMAIS "pc poivron" ou "2 poivrons" ou "150g poulet". Le régime de l'utilisateur est déjà pris en compte.
   - "quantity" : nombre uniquement (ex: 150, 2, 0.5). Jamais 0.
   - "unit" : unité STRICTEMENT parmi "kg", "g", "l", "cl", "ml" ou "piece". Pas d'autre valeur.
6. VIGILANCE ALLERGIES (SÉCURITÉ ABSOLUE) : Si le profil indique des allergies, tu as l'INTERDICTION d'utiliser des produits transformés, de boulangerie ou des sauces classiques qui contiennent traditionnellement cet allergène en ingrédient caché (ex: si allergie aux œufs = pas de pain brioché, pas de béchamel, pas de mayonnaise, pas de pâtes fraîches ; si allergie au lait = pas de beurre, pas de crème). Privilégie des associations 100% brutes et sûres.`;

  try {
    console.log(
      JSON.stringify({
        event: "AI_REQUEST",
        fn: "regenerateSingleMeal",
        prompt,
      }),
    );

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: singleMealSchema,
        maxOutputTokens: 2048,
        temperature: 0.9,
        thinkingConfig: { thinkingBudget: 1024 },
      },
    });
    const text = result.text;
    if (!text) {
      throw new Error("Gemini n'a retourné aucun contenu pour le repas.");
    }
    console.log(
      JSON.stringify({
        event: "AI_RESPONSE",
        fn: "regenerateSingleMeal",
        response: text,
      }),
    );

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = cleanAndParseJSON(text);
    }
    const m = parsed?.meal;
    if (!m || !m.title) {
      throw new Error("Format de repas invalide retourné par l'IA.");
    }

    console.log(
      "✅ regenerateSingleMeal DONE en",
      Date.now() - t0,
      "ms —",
      m.title,
    );

    return res.json({
      meal: {
        title: m.title,
        description: m.description || "",
        calories: m.calories || 0,
        ingredients: postProcessIngredients(m.ingredients).ingredients,
        macros: {
          protein: m.protein || 0,
          carbs: m.carbs || 0,
          fat: m.fat || 0,
        },
      },
    });
  } catch (error) {
    console.error("❌ regenerateSingleMeal ERROR:", error.message);
    next(error);
  }
}

module.exports = {
  generateWeeklyPlan,
  streamWeeklyPlan,
  generateWeeklyPlanSkeleton,
  regenerateSingleMeal,
};
