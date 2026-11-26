// Skin photo analysis routes (Computer Vision module, Feature 1).
//
// The Express backend receives the uploaded photo from the frontend and
// forwards it to the Python CV microservice (analyzer), then persists the
// structured scores so the user can track progress over time.

const express = require('express')
const router = express.Router()
const db = require('../database')
const auth = require('../middleware/auth')

const CV_SERVICE_URL = process.env.CV_SERVICE_URL || 'http://localhost:8000'

// POST /api/skin-analysis/analyze  { image_base64 }
router.post('/analyze', auth, async (req, res) => {
  const { image_base64 } = req.body
  if (!image_base64) return res.status(400).json({ error: 'image_base64 is required' })

  let result
  try {
    const response = await fetch(`${CV_SERVICE_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64 }),
    })
    if (!response.ok) {
      const detail = await response.text()
      throw new Error(`CV service ${response.status}: ${detail}`)
    }
    result = await response.json()
  } catch (error) {
    console.error('skin-analysis error:', error.message)
    return res.status(503).json({
      error: 'Skin analysis service is unavailable. Make sure the CV microservice is running.',
    })
  }

  // Persist (note: we store scores, not the photo — privacy by design)
  const m = result.metrics || {}
  const score = (k) => (m[k] && typeof m[k].score === 'number' ? m[k].score : null)
  const info = db.prepare(`
    INSERT INTO skin_analyses
      (user_id, overall_score, acne, redness, dark_spots, texture, hydration, mode, confidence, face_detected, result_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id,
    result.overall_score ?? null,
    score('acne'), score('redness'), score('dark_spots'), score('texture'), score('hydration'),
    result.mode || null,
    result.confidence ?? null,
    result.face_detected ? 1 : 0,
    JSON.stringify(result)
  )

  res.status(201).json({ id: info.lastInsertRowid, ...result })
})

// GET /api/skin-analysis  — history (most recent first)
router.get('/', auth, (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM skin_analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(req.user.id)
  res.json(rows.map((r) => ({ ...r, result: r.result_json ? JSON.parse(r.result_json) : null })))
})

// GET /api/skin-analysis/compare — first vs latest, with per-dimension deltas
router.get('/compare', auth, (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM skin_analyses WHERE user_id = ? ORDER BY created_at ASC'
  ).all(req.user.id)

  if (rows.length < 2) {
    return res.json({ enough_data: false, count: rows.length })
  }

  const first = rows[0]
  const latest = rows[rows.length - 1]
  const dims = ['acne', 'redness', 'dark_spots', 'texture', 'hydration']
  const higherIsWorse = new Set(['acne', 'redness', 'dark_spots'])

  const deltas = dims.map((d) => {
    const change = (latest[d] ?? 0) - (first[d] ?? 0)
    const improved = higherIsWorse.has(d) ? change < 0 : change > 0
    return { dimension: d, from: first[d], to: latest[d], change: Number(change.toFixed(1)), improved }
  })

  res.json({
    enough_data: true,
    count: rows.length,
    first_date: first.created_at,
    latest_date: latest.created_at,
    overall_change: Number(((latest.overall_score ?? 0) - (first.overall_score ?? 0)).toFixed(1)),
    deltas,
  })
})

// DELETE /api/skin-analysis/:id
router.delete('/:id', auth, (req, res) => {
  const row = db.prepare('SELECT id FROM skin_analyses WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
  if (!row) return res.status(404).json({ error: 'Analysis not found' })
  db.prepare('DELETE FROM skin_analyses WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

module.exports = router
