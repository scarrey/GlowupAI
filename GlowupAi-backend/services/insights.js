// Personalized insights engine.
//
// Runs statistical analysis on each user's OWN tracked data to surface
// patterns, e.g. "your hydration is higher on weeks you sleep 7+ hours".
// Uses Pearson correlation between weekly wellness averages and the weekly
// skin-progress check-ins, plus simple trend detection.

const db = require('../database')

// --- Statistics helpers ---------------------------------------------------

/** Pearson correlation coefficient between two equal-length numeric arrays. */
const pearson = (xs, ys) => {
  const n = xs.length
  if (n < 2) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx
    const b = ys[i] - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  if (dx === 0 || dy === 0) return null
  return num / Math.sqrt(dx * dy)
}

const strengthLabel = (r) => {
  const a = Math.abs(r)
  if (a >= 0.7) return 'strong'
  if (a >= 0.5) return 'moderate'
  if (a >= 0.3) return 'mild'
  return 'weak'
}

// Within a given week (starting week_date), average the user's wellness logs.
const weekAverage = (logs, weekDate) => {
  const start = new Date(weekDate)
  if (isNaN(start)) return null
  const end = new Date(start)
  end.setDate(end.getDate() + 6)

  const inWeek = logs.filter((l) => {
    const d = new Date(l.log_date)
    return !isNaN(d) && d >= start && d <= end
  })
  if (inWeek.length === 0) return null

  const avg = (key) =>
    inWeek.reduce((a, l) => a + (Number(l[key]) || 0), 0) / inWeek.length
  return { sleep: avg('sleep_hours'), water: avg('water_glasses'), n: inWeek.length }
}

// Skin dimensions where a HIGHER number is better vs worse, for phrasing.
const DIMENSIONS = [
  { key: 'hydration', label: 'hydration', higherIsBetter: true },
  { key: 'glow', label: 'glow', higherIsBetter: true },
  { key: 'texture', label: 'skin texture', higherIsBetter: true },
  { key: 'acne_level', label: 'acne', higherIsBetter: false },
  { key: 'redness', label: 'redness', higherIsBetter: false },
  { key: 'dark_spots', label: 'dark spots', higherIsBetter: false },
]

const DRIVERS = [
  { key: 'sleep', label: 'sleep', unit: 'hours' },
  { key: 'water', label: 'water intake', unit: 'glasses' },
]

/**
 * Compute insights for a user.
 * @returns {{ insights: Array, correlations: Array, meta: object }}
 */
const computeInsights = (userId) => {
  const wellness = db
    .prepare('SELECT * FROM wellness_logs WHERE user_id = ? ORDER BY log_date ASC')
    .all(userId)
  const progress = db
    .prepare('SELECT * FROM glow_progress WHERE user_id = ? ORDER BY week_date ASC')
    .all(userId)
  const diary = db
    .prepare('SELECT * FROM skin_diary WHERE user_id = ? ORDER BY entry_date DESC LIMIT 30')
    .all(userId)

  const insights = []
  const correlations = []

  // Build paired weekly samples: {sleep, water} vs each skin dimension
  const paired = progress
    .map((p) => {
      const wk = weekAverage(wellness, p.week_date)
      return wk ? { progress: p, wellness: wk } : null
    })
    .filter(Boolean)

  if (paired.length >= 3) {
    for (const driver of DRIVERS) {
      for (const dim of DIMENSIONS) {
        const xs = paired.map((p) => p.wellness[driver.key])
        const ys = paired.map((p) => Number(p.progress[dim.key])).filter((v) => !isNaN(v))
        if (ys.length !== xs.length) continue
        const r = pearson(xs, ys)
        if (r === null) continue

        correlations.push({ driver: driver.key, dimension: dim.key, r: Number(r.toFixed(2)), n: paired.length })

        if (Math.abs(r) >= 0.5) {
          // For "higher is worse" dimensions (acne, redness), a positive r
          // with a good-habit driver is actually bad; phrase by direction.
          const positive = r > 0
          const better = dim.higherIsBetter ? positive : !positive
          const direction = better ? 'better' : 'worse'
          const moreOrLess = positive ? 'more' : 'less'
          insights.push({
            type: 'correlation',
            strength: strengthLabel(r),
            r: Number(r.toFixed(2)),
            text: `Your ${dim.label} tends to be ${direction} on weeks with ${moreOrLess} ${driver.label} (${strengthLabel(r)} correlation, based on ${paired.length} weeks of your data).`,
          })
        }
      }
    }
  }

  // Trend insight: compare the two most recent progress check-ins
  if (progress.length >= 2) {
    const latest = progress[progress.length - 1]
    const prev = progress[progress.length - 2]
    for (const dim of DIMENSIONS) {
      const now = Number(latest[dim.key])
      const before = Number(prev[dim.key])
      if (isNaN(now) || isNaN(before) || now === before) continue
      const rose = now > before
      const improved = dim.higherIsBetter ? rose : !rose
      insights.push({
        type: 'trend',
        strength: Math.abs(now - before) >= 2 ? 'notable' : 'slight',
        text: `Your ${dim.label} ${improved ? 'improved' : 'declined'} from ${before} to ${now} in your latest check-in.`,
      })
    }
  }

  // Stress pattern from diary (keyword-based)
  const stressDays = diary.filter((d) =>
    /stress|anxious|anxiety|tired|exhausted|poor sleep|breakout|breaking out/i.test(
      `${d.lifestyle_notes || ''} ${d.skin_notes || ''} ${d.mood || ''}`
    )
  )
  if (stressDays.length >= 3) {
    insights.push({
      type: 'pattern',
      strength: 'observed',
      text: `You've logged stress or fatigue on ${stressDays.length} recent days. Stress can trigger breakouts — prioritizing sleep and a calming routine may help.`,
    })
  }

  // Keep the most meaningful insights first and cap the list
  const ranked = insights
    .sort((a, b) => (Math.abs(b.r || 0) - Math.abs(a.r || 0)))
    .slice(0, 6)

  return {
    insights: ranked,
    correlations,
    meta: {
      weeks_paired: paired.length,
      progress_entries: progress.length,
      wellness_entries: wellness.length,
      enough_data: paired.length >= 3,
    },
  }
}

module.exports = { computeInsights, pearson }
