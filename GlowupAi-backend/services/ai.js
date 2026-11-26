// Centralized AI service.
// Houses the single OpenRouter call used by every AI feature, plus a reusable
// helper that gathers a user's tracked data into a context string. Keeping this
// in one place means chat, daily tips, weekly reports and product
// recommendations all share the exact same, consistent personalization context.

const db = require('../database')

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const MODEL = process.env.AI_MODEL || 'google/gemini-2.0-flash-lite-001'

/**
 * Low-level call to the OpenRouter chat-completions API.
 * @param {Array<{role:string, content:string}>} messages
 * @param {{ temperature?: number, maxTokens?: number }} [opts]
 * @returns {Promise<string>} assistant message content
 */
const callAI = async (messages, opts = {}) => {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set. Add it to GlowupAi-backend/.env')
  }

  const body = {
    model: MODEL,
    messages,
  }
  if (typeof opts.temperature === 'number') body.temperature = opts.temperature
  if (typeof opts.maxTokens === 'number') body.max_tokens = opts.maxTokens

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify(body),
  })

  const data = await response.json()
  if (!data.choices || !data.choices[0]) {
    throw new Error(data.error?.message || 'AI request failed')
  }
  return data.choices[0].message.content
}

/**
 * Strip markdown code fences and parse JSON from an AI response.
 * LLMs frequently wrap JSON in ```json ... ``` even when told not to.
 */
const parseAIJson = (raw) => {
  let cleaned = (raw || '').trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }
  // Grab the outermost JSON object/array if there is surrounding prose.
  const firstBrace = cleaned.search(/[[{]/)
  const lastBrace = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'))
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1)
  }
  return JSON.parse(cleaned)
}

/**
 * Pull a user's tracked data from the database.
 * Returns the raw rows so callers (insights, reports) can run their own
 * analysis, plus parsed helpers.
 */
const getUserData = (userId, { diaryLimit = 7, wellnessLimit = 14, progressLimit = 8 } = {}) => {
  const profile = db
    .prepare('SELECT * FROM skin_profiles WHERE user_id = ?')
    .get(userId)

  const wellnessLogs = db
    .prepare('SELECT * FROM wellness_logs WHERE user_id = ? ORDER BY log_date DESC LIMIT ?')
    .all(userId, wellnessLimit)

  const diaryEntries = db
    .prepare('SELECT * FROM skin_diary WHERE user_id = ? ORDER BY entry_date DESC LIMIT ?')
    .all(userId, diaryLimit)

  const routines = db
    .prepare('SELECT * FROM routines WHERE user_id = ?')
    .all(userId)

  const progress = db
    .prepare('SELECT * FROM glow_progress WHERE user_id = ? ORDER BY week_date DESC LIMIT ?')
    .all(userId, progressLimit)

  // Recent routine-adherence from the daily checklist (last 7 days)
  const checklist = db
    .prepare('SELECT * FROM daily_checklists WHERE user_id = ? ORDER BY date DESC LIMIT 7')
    .all(userId)

  return { profile, wellnessLogs, diaryEntries, routines, progress, checklist }
}

/**
 * Build a human-readable personalization block describing the user, for
 * injection into a system prompt. Deterministic and compact.
 */
const buildContextString = (data) => {
  const { profile, wellnessLogs, diaryEntries, routines, progress } = data
  let ctx = ''

  if (profile) {
    const concerns = profile.skin_concerns
      ? JSON.parse(profile.skin_concerns).join(', ')
      : 'none'
    ctx += `\nUser's skin profile:\n- Skin type: ${profile.skin_type || 'unknown'}\n- Concerns: ${concerns}\n- Water intake: ${profile.water_intake || 'unknown'}\n- Sleep hours: ${profile.sleep_hours || 'unknown'}\n- Diet: ${profile.diet_type || 'unknown'}\n- Beauty goal: ${profile.beauty_goal || 'unknown'}`
  }

  if (wellnessLogs && wellnessLogs.length > 0) {
    const latest = wellnessLogs[0]
    const avgWater = (
      wellnessLogs.reduce((a, l) => a + (l.water_glasses || 0), 0) / wellnessLogs.length
    ).toFixed(1)
    const avgSleep = (
      wellnessLogs.reduce((a, l) => a + (l.sleep_hours || 0), 0) / wellnessLogs.length
    ).toFixed(1)
    ctx += `\n\nWellness (last ${wellnessLogs.length} days): avg water ${avgWater} glasses/day (latest ${latest.water_glasses}), avg sleep ${avgSleep} hrs/night (latest ${latest.sleep_hours}, quality ${latest.sleep_quality}).`
  }

  if (diaryEntries && diaryEntries.length > 0) {
    const d = diaryEntries[0]
    ctx += `\n\nLatest diary (${d.entry_date}): mood ${d.mood}; skin notes: ${d.skin_notes || 'none'}; lifestyle: ${d.lifestyle_notes || 'none'}.`
  }

  if (progress && progress.length >= 2) {
    const latest = progress[0]
    const prev = progress[1]
    const dims = ['acne_level', 'hydration', 'glow', 'redness', 'texture', 'dark_spots']
    const deltas = dims
      .map((k) => `${k.replace('_', ' ')}: ${prev[k] ?? '?'}→${latest[k] ?? '?'}`)
      .join(', ')
    ctx += `\n\nProgress check-ins (1-10, last two weeks) — ${deltas}.`
  }

  if (routines && routines.length > 0) {
    const summary = routines
      .map((r) => {
        const steps = JSON.parse(r.steps || '[]')
        const names = steps
          .map((s) => s.product_name || s.name || s.product_type || 'step')
          .join(', ')
        return `${r.routine_type.toUpperCase()}: ${names}`
      })
      .join(' | ')
    ctx += `\n\nCurrent routine: ${summary}`
  }

  return ctx
}

module.exports = { callAI, parseAIJson, getUserData, buildContextString, MODEL }
