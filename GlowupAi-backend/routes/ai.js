// AI feature routes: daily tips, weekly report, insights, product
// recommendations, and ingredient conflict checks.
// Each AI-powered endpoint has a deterministic fallback so the app still
// returns something useful if the LLM key is missing or the call fails.

const express = require('express')
const router = express.Router()
const db = require('../database')
const auth = require('../middleware/auth')
const { callAI, parseAIJson, getUserData, buildContextString } = require('../services/ai')
const { computeInsights } = require('../services/insights')
const { checkConflicts, checkRoutineConflicts, extractIngredients } = require('../services/ingredients')

// ---------------------------------------------------------------------------
// Feature 3: AI-generated personalized daily tip
// ---------------------------------------------------------------------------

// Deterministic fallback tip derived from the user's actual data.
const fallbackTip = (data) => {
  const { profile, wellnessLogs, progress } = data
  if (wellnessLogs && wellnessLogs.length > 0) {
    const avgWater =
      wellnessLogs.reduce((a, l) => a + (l.water_glasses || 0), 0) / wellnessLogs.length
    if (avgWater < 4) {
      return 'Your water intake has been low this week — aim for a few more glasses today to support skin hydration. 💧'
    }
    const avgSleep =
      wellnessLogs.reduce((a, l) => a + (l.sleep_hours || 0), 0) / wellnessLogs.length
    if (avgSleep && avgSleep < 6) {
      return 'You\'ve been averaging under 6 hours of sleep — your skin repairs overnight, so try an earlier night tonight. 🌙'
    }
  }
  if (progress && progress.length > 0 && progress[0].hydration && progress[0].hydration <= 4) {
    return 'Your latest hydration score was low. Layer a hydrating serum under your moisturizer today for a plumper glow. ✨'
  }
  if (profile && profile.skin_type) {
    return `Consistency matters for ${profile.skin_type} skin — don\'t skip sunscreen today, even indoors. ☀️`
  }
  return 'Never skip sunscreen, even on cloudy days — daily SPF is the most effective anti-aging step. ☀️'
}

router.get('/daily-tip', auth, async (req, res) => {
  const data = getUserData(req.user.id)
  try {
    const ctx = buildContextString(data)
    const prompt =
      'Based on this user\'s tracked skincare data, write ONE short, specific, encouraging daily tip ' +
      '(max 2 sentences). Reference a real pattern from their data (sleep, water, hydration, concerns, routine). ' +
      'Do not greet or add a title. Return only the tip text.' +
      (ctx ? `\n\nUser data:${ctx}` : '')

    const tip = await callAI(
      [
        { role: 'system', content: 'You are a concise, warm skincare coach.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.7, maxTokens: 120 }
    )
    res.json({ tip: tip.trim().replace(/^"|"$/g, ''), source: 'ai' })
  } catch (error) {
    console.error('daily-tip error:', error.message)
    res.json({ tip: fallbackTip(data), source: 'fallback' })
  }
})

// ---------------------------------------------------------------------------
// Insights engine (correlation analysis) — deterministic, no LLM needed
// ---------------------------------------------------------------------------
router.get('/insights', auth, (req, res) => {
  try {
    res.json(computeInsights(req.user.id))
  } catch (error) {
    console.error('insights error:', error.message)
    res.status(500).json({ error: 'Failed to compute insights' })
  }
})

// ---------------------------------------------------------------------------
// Feature 4: Weekly AI skin report
// ---------------------------------------------------------------------------
const fallbackReport = (data, insights) => {
  const improved = insights.insights.filter((i) => i.type === 'trend' && /improved/.test(i.text)).map((i) => i.text)
  const declined = insights.insights.filter((i) => i.type === 'trend' && /declined/.test(i.text)).map((i) => i.text)
  const patterns = insights.insights.filter((i) => i.type === 'correlation' || i.type === 'pattern').map((i) => i.text)
  return {
    summary:
      'Here is a summary of your week based on the data you logged. Keep tracking consistently for sharper insights.',
    improved: improved.length ? improved : ['Not enough check-in data to detect improvements yet.'],
    declined: declined.length ? declined : ['No declines detected.'],
    patterns: patterns.length ? patterns : ['Log more wellness and progress entries to reveal patterns.'],
    recommendations: [
      'Keep your AM/PM routine consistent.',
      'Log water, sleep and a quick skin check-in daily.',
      'Apply sunscreen every morning.',
    ],
    source: 'fallback',
  }
}

router.post('/weekly-report', auth, async (req, res) => {
  const data = getUserData(req.user.id, { diaryLimit: 7, wellnessLimit: 7, progressLimit: 4 })
  const insights = computeInsights(req.user.id)
  try {
    const ctx = buildContextString(data)
    const insightText = insights.insights.map((i) => `- ${i.text}`).join('\n') || '- (no statistical insights yet)'
    const prompt = `Analyze this user's past week of skincare data and produce a weekly skin report.
User data:${ctx}

Statistical insights already computed from their data:
${insightText}

Return ONLY valid JSON (no markdown) with this structure:
{
  "summary": "2-3 sentence overview of the week",
  "improved": ["what got better"],
  "declined": ["what got worse"],
  "patterns": ["notable patterns, e.g. skin vs sleep"],
  "recommendations": ["3-5 specific, actionable tips for next week"]
}
Be specific to their data. Do not invent data they didn't log.`

    const raw = await callAI(
      [
        { role: 'system', content: 'You are a dermatology-informed skincare analyst. Return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.5, maxTokens: 700 }
    )
    const report = parseAIJson(raw)
    report.source = 'ai'
    res.json(report)
  } catch (error) {
    console.error('weekly-report error:', error.message)
    res.json(fallbackReport(data, insights))
  }
})

// ---------------------------------------------------------------------------
// Feature 5: AI-powered product recommendations
// ---------------------------------------------------------------------------
const parseProduct = (p) => ({
  ...p,
  skin_types: JSON.parse(p.skin_types || '[]'),
  concerns: JSON.parse(p.concerns || '[]'),
  key_ingredients: JSON.parse(p.key_ingredients || '[]'),
})

// Deterministic catalog filter used as fallback and to validate AI picks.
const matchProducts = (products, profile) => {
  if (!profile) return products.slice(0, 4)
  const concerns = profile.skin_concerns ? JSON.parse(profile.skin_concerns).map((c) => c.toLowerCase()) : []
  const skinType = (profile.skin_type || '').toLowerCase()
  const scored = products.map((p) => {
    let score = 0
    if (p.skin_types.map((s) => s.toLowerCase()).includes(skinType) || p.skin_types.includes('all')) score += 2
    const pc = p.concerns.map((c) => c.toLowerCase())
    score += concerns.filter((c) => pc.some((x) => x.includes(c) || c.includes(x))).length
    return { p, score }
  })
  return scored.sort((a, b) => b.score - a.score).slice(0, 5).map((s) => s.p)
}

router.get('/product-recommendations', auth, async (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY name').all().map(parseProduct)
  const data = getUserData(req.user.id)
  const profile = data.profile

  // Current routine ingredients, to flag conflicts in recommendations
  const routineIngredients = extractIngredients(
    data.routines.flatMap((r) => {
      const steps = JSON.parse(r.steps || '[]')
      return steps.map((s) => `${s.product_name || ''} ${s.product_type || ''}`)
    })
  )

  const buildResult = (recs) =>
    recs.map((r) => {
      const prodIngredients = extractIngredients(r.key_ingredients || [])
      const combined = new Set([...routineIngredients, ...prodIngredients])
      // Only surface conflicts this product would INTRODUCE against the
      // existing routine — i.e. at least one side of the conflict is a new
      // ingredient from this product. Pre-existing routine conflicts are not
      // attributed to the recommendation.
      const conflicts = checkConflicts(combined).filter((c) =>
        c.ingredients.some((ing) => prodIngredients.has(ing))
      )
      return { ...r, conflicts }
    })

  try {
    const ctx = buildContextString(data)
    const catalog = products
      .map((p) => `#${p.id} ${p.name} [${p.category}] — for ${p.skin_types.join('/')}; targets ${p.concerns.join(', ')}; key: ${p.key_ingredients.join(', ')}`)
      .join('\n')

    const prompt = `Recommend the 3-4 best products for this user from the catalog below.
User:${ctx}

Catalog:
${catalog}

Return ONLY valid JSON (no markdown): an array of objects:
[{"id": 2, "reason": "one specific sentence on why this suits THIS user"}]
Only use ids from the catalog. Pick products that match their skin type and concerns.`

    const raw = await callAI(
      [
        { role: 'system', content: 'You are a skincare product advisor. Return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.4, maxTokens: 500 }
    )
    const picks = parseAIJson(raw)
    const recs = picks
      .map((pick) => {
        const product = products.find((p) => p.id === pick.id)
        return product ? { ...product, reason: pick.reason } : null
      })
      .filter(Boolean)

    if (recs.length === 0) throw new Error('No valid product ids returned')
    res.json({ recommendations: buildResult(recs, 'ai'), source: 'ai' })
  } catch (error) {
    console.error('product-recommendations error:', error.message)
    const recs = matchProducts(products, profile).map((p) => ({
      ...p,
      reason: profile
        ? `Matches your ${profile.skin_type || ''} skin and your tracked concerns.`
        : 'A well-rounded pick for most skin types.',
    }))
    res.json({ recommendations: buildResult(recs, 'fallback'), source: 'fallback' })
  }
})

// ---------------------------------------------------------------------------
// Feature 6: Ingredient conflict detection
// ---------------------------------------------------------------------------

// Check an arbitrary set of ingredients or routine steps.
// body: { ingredients: ["retinol", ...] }  OR  { steps: [{product_name,...}] }
router.post('/ingredient-check', auth, (req, res) => {
  const { ingredients, steps } = req.body
  let conflicts = []
  if (Array.isArray(steps)) {
    conflicts = checkRoutineConflicts(steps)
  } else if (Array.isArray(ingredients)) {
    conflicts = checkConflicts(extractIngredients(ingredients))
  } else {
    return res.status(400).json({ error: 'Provide ingredients[] or steps[]' })
  }
  res.json({ conflicts, has_conflicts: conflicts.length > 0 })
})

// Check the user's currently saved AM + PM routines for conflicts.
router.get('/routine-conflicts', auth, (req, res) => {
  const routines = db.prepare('SELECT * FROM routines WHERE user_id = ?').all(req.user.id)
  const allSteps = routines.flatMap((r) => JSON.parse(r.steps || '[]'))
  const conflicts = checkRoutineConflicts(allSteps)
  res.json({ conflicts, has_conflicts: conflicts.length > 0 })
})

module.exports = router
