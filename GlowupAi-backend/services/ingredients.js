// Ingredient conflict detection (Feature 6).
//
// Deterministic engine: normalizes free-text ingredient / product names to a
// set of known active ingredients, then checks a curated interaction database
// for known conflicts. Returns structured warnings with timing guidance.
//
// Conflict data is drawn from published dermatological ingredient-interaction
// guidance. The structure is designed so new rules can be added easily.

// Canonical active ingredients and the aliases / keywords that map to them.
// Keys are canonical ids; values are substrings to look for (lowercased).
const INGREDIENT_ALIASES = {
  retinoid: ['retinol', 'retinoid', 'retinal', 'retinaldehyde', 'tretinoin', 'adapalene', 'retinyl'],
  aha: ['aha', 'glycolic', 'lactic acid', 'mandelic', 'alpha hydroxy'],
  bha: ['bha', 'salicylic', 'beta hydroxy'],
  benzoyl_peroxide: ['benzoyl peroxide', 'benzoyl', 'bpo'],
  vitamin_c: ['vitamin c', 'ascorbic', 'ascorbate', 'l-ascorbic'],
  niacinamide: ['niacinamide', 'vitamin b3', 'nicotinamide'],
  azelaic_acid: ['azelaic'],
  vitamin_a: [], // reserved
}

// Human-readable labels for canonical ids
const LABELS = {
  retinoid: 'Retinoids (retinol/tretinoin)',
  aha: 'AHA (glycolic/lactic acid)',
  bha: 'BHA (salicylic acid)',
  benzoyl_peroxide: 'Benzoyl peroxide',
  vitamin_c: 'Vitamin C',
  niacinamide: 'Niacinamide',
  azelaic_acid: 'Azelaic acid',
}

// Curated conflict database. Each rule names the two canonical ingredients,
// a severity, an explanation, and timing guidance.
const CONFLICTS = [
  {
    pair: ['retinoid', 'aha'],
    severity: 'high',
    reason:
      'Using retinoids with AHA exfoliants together often causes excessive irritation, redness and peeling, and can damage the skin barrier.',
    timing: 'Alternate nights, or use the acid in the morning and retinoid at night — do not layer them together.',
  },
  {
    pair: ['retinoid', 'bha'],
    severity: 'high',
    reason:
      'Retinoids combined with salicylic acid (BHA) in the same routine can over-exfoliate and irritate the skin.',
    timing: 'Separate them — alternate days, or acid in the AM and retinoid in the PM.',
  },
  {
    pair: ['retinoid', 'benzoyl_peroxide'],
    severity: 'high',
    reason:
      'Plain retinol and benzoyl peroxide can deactivate each other and together increase dryness and irritation.',
    timing: 'Use benzoyl peroxide in the morning and retinol at night, unless the product is specially formulated to combine them.',
  },
  {
    pair: ['vitamin_c', 'benzoyl_peroxide'],
    severity: 'medium',
    reason:
      'Benzoyl peroxide can oxidize vitamin C, reducing the effectiveness of both when applied together.',
    timing: 'Apply at different times of day — e.g. vitamin C in the morning, benzoyl peroxide at night.',
  },
  {
    pair: ['aha', 'bha'],
    severity: 'medium',
    reason:
      'Stacking AHA and BHA exfoliants in the same routine increases the risk of over-exfoliation and barrier damage.',
    timing: 'Limit total exfoliation to 2–3 times per week and avoid using both strong acids at once.',
  },
  {
    pair: ['vitamin_c', 'aha'],
    severity: 'low',
    reason:
      'Layering vitamin C with AHAs can cause tingling or irritation on sensitive skin due to combined low pH.',
    timing: 'If sensitive, use them in separate routines (vitamin C AM, acids PM).',
  },
]

/**
 * Normalize an array of free-text strings (product names, ingredient lists)
 * into a Set of canonical active-ingredient ids that are present.
 * @param {string[]} texts
 * @returns {Set<string>}
 */
const extractIngredients = (texts) => {
  const haystack = (Array.isArray(texts) ? texts : [texts])
    .filter(Boolean)
    .join(' | ')
    .toLowerCase()

  const found = new Set()
  for (const [canonical, aliases] of Object.entries(INGREDIENT_ALIASES)) {
    if (aliases.some((alias) => alias && haystack.includes(alias))) {
      found.add(canonical)
    }
  }
  return found
}

/**
 * Given a set/array of canonical ingredient ids (or free text), return all
 * conflicts between them.
 * @param {string[]|Set<string>} ingredients  canonical ids OR free-text strings
 * @returns {Array<{ingredients:string[], labels:string[], severity:string, reason:string, timing:string}>}
 */
const checkConflicts = (ingredients) => {
  let present
  if (ingredients instanceof Set) {
    present = ingredients
  } else {
    // Could be canonical ids already, or free text. Try both:
    const asText = extractIngredients(ingredients)
    const canonicalKnown = new Set(
      (Array.isArray(ingredients) ? ingredients : [])
        .map((i) => String(i).toLowerCase())
        .filter((i) => INGREDIENT_ALIASES[i])
    )
    present = new Set([...asText, ...canonicalKnown])
  }

  const results = []
  for (const rule of CONFLICTS) {
    const [a, b] = rule.pair
    if (present.has(a) && present.has(b)) {
      results.push({
        ingredients: rule.pair,
        labels: [LABELS[a], LABELS[b]],
        severity: rule.severity,
        reason: rule.reason,
        timing: rule.timing,
      })
    }
  }
  return results
}

/**
 * Check an entire routine (array of step objects) for ingredient conflicts.
 * Steps may carry product_name, name, product_type, and/or key_ingredients.
 */
const checkRoutineConflicts = (steps) => {
  const texts = []
  for (const s of steps || []) {
    if (!s) continue
    if (s.product_name) texts.push(s.product_name)
    if (s.name) texts.push(s.name)
    if (s.product_type) texts.push(s.product_type)
    if (Array.isArray(s.key_ingredients)) texts.push(s.key_ingredients.join(' '))
    if (typeof s.key_ingredients === 'string') texts.push(s.key_ingredients)
    if (s.instruction) texts.push(s.instruction)
  }
  return checkConflicts(extractIngredients(texts))
}

module.exports = {
  extractIngredients,
  checkConflicts,
  checkRoutineConflicts,
  CONFLICTS,
  LABELS,
  INGREDIENT_ALIASES,
}
