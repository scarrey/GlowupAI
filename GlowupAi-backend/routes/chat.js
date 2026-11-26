const express = require('express')
const router = express.Router()
const db = require('../database')
const auth = require('../middleware/auth')
const { callAI, parseAIJson, getUserData, buildContextString } = require('../services/ai')
const { retrieveContext, SAFETY_ESCALATION_NOTE, needsEscalation } = require('../services/rag')

// How many of the most recent messages to replay to the model so the
// conversation has real multi-turn memory (Feature 2 in the proposal).
const HISTORY_LIMIT = 14

// GET all chat sessions for current user
router.get('/sessions', auth, (req, res) => {
  const sessions = db.prepare(`
    SELECT * FROM chat_sessions
    WHERE user_id = ?
    ORDER BY updated_at DESC
  `).all(req.user.id)
  res.json(sessions)
})

// CREATE new chat session
router.post('/sessions', auth, (req, res) => {
  const { title } = req.body
  const result = db.prepare(`
    INSERT INTO chat_sessions (user_id, title)
    VALUES (?, ?)
  `).run(req.user.id, title || 'New Chat')

  res.status(201).json({ id: result.lastInsertRowid })
})

// GET all messages for a specific session
// Critical: checks user_id on the session so user can only read their own sessions
router.get('/sessions/:sessionId/messages', auth, (req, res) => {
  const session = db.prepare(
    'SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?'
  ).get(req.params.sessionId, req.user.id)

  if (!session) return res.status(404).json({ error: 'Session not found' })

  const messages = db.prepare(`
    SELECT * FROM chat_messages
    WHERE session_id = ?
    ORDER BY created_at ASC
  `).all(req.params.sessionId)

  res.json(messages)
})

// ADD message to session
router.post('/sessions/:sessionId/messages', auth, (req, res) => {
  const { role, message_text } = req.body

  const session = db.prepare(
    'SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?'
  ).get(req.params.sessionId, req.user.id)

  if (!session) return res.status(404).json({ error: 'Session not found' })

  const result = db.prepare(`
    INSERT INTO chat_messages (session_id, user_id, role, message_text)
    VALUES (?, ?, ?, ?)
  `).run(req.params.sessionId, req.user.id, role, message_text)

  // Update session's last_message_preview
  db.prepare(`
    UPDATE chat_sessions SET
      last_message_preview = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(message_text.slice(0, 60), req.params.sessionId)

  res.status(201).json({ id: result.lastInsertRowid })
})

// UPDATE session (e.g. last_message_preview)
router.put('/sessions/:sessionId', auth, (req, res) => {
  const session = db.prepare(
    'SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?'
  ).get(req.params.sessionId, req.user.id)

  if (!session) return res.status(404).json({ error: 'Session not found' })

  const { last_message_preview, title } = req.body
  db.prepare(`
    UPDATE chat_sessions SET
      title = CASE
        WHEN lower(trim(title)) = 'new chat' THEN COALESCE(?, title)
        ELSE title
      END,
      last_message_preview = COALESCE(?, last_message_preview),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(title || null, last_message_preview || null, req.params.sessionId)

  res.json({ success: true })
})

// Fetch the last N messages of a session as model-ready {role, content} pairs.
// chat_messages stores role as 'user' | 'ai'; the LLM API expects
// 'user' | 'assistant'.
const getConversationHistory = (sessionId, userId) => {
  const session = db.prepare(
    'SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?'
  ).get(sessionId, userId)
  if (!session) return []

  const rows = db.prepare(`
    SELECT role, message_text FROM chat_messages
    WHERE session_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(sessionId, HISTORY_LIMIT)

  // rows are newest-first; reverse to chronological order
  return rows.reverse().map((m) => ({
    role: m.role === 'ai' ? 'assistant' : 'user',
    content: m.message_text,
  }))
}

// AI RESPONSE — generates an AI reply using the user's full data as context,
// retrieval-augmented knowledge, and real multi-turn conversation memory.
router.post('/ai-response', auth, async (req, res) => {
  try {
    const { message, skin_context, session_id } = req.body

    if (!message) return res.status(400).json({ error: 'message is required' })

    // Personalization context from the user's tracked data
    const data = getUserData(req.user.id)
    let systemPrompt =
      'You are Glow-Up Advisor, a friendly and knowledgeable AI skincare companion. ' +
      'Give personalized, practical advice. Keep responses concise but helpful. Use emojis sparingly.'

    const ctx = buildContextString(data)
    if (ctx) {
      systemPrompt += `\n${ctx}`
      systemPrompt +=
        '\n\nIMPORTANT: Reference the user\'s specific skin type, concerns and goals so the advice is clearly personalized, not generic.'
    }

    // --- Retrieval-Augmented Generation (Feature: RAG) ---
    // Pull grounded dermatological knowledge relevant to the question and
    // inject it so the model answers from verified information, with citations.
    const retrieved = retrieveContext(message)
    if (retrieved.context) {
      systemPrompt +=
        `\n\nUse ONLY the following verified knowledge to answer skincare-science questions. ` +
        `Cite the source in square brackets like [${retrieved.chunks[0].source}] when you use a fact.\n\n` +
        `===== VERIFIED KNOWLEDGE BASE =====\n${retrieved.context}\n===== END KNOWLEDGE BASE =====`
    }

    // --- Safety escalation layer ---
    // If the message suggests something beyond cosmetic guidance, instruct the
    // model to recommend seeing a dermatologist.
    if (needsEscalation(message)) {
      systemPrompt += `\n\n${SAFETY_ESCALATION_NOTE}`
    }

    if (skin_context) {
      systemPrompt += `\n\nAdditional context: ${skin_context}`
    }

    // --- Multi-turn memory (Feature 2) ---
    // The frontend saves the user's message before calling this endpoint, so
    // the history already ends with the current message when session_id is sent.
    let history = session_id ? getConversationHistory(session_id, req.user.id) : []
    const lastUser = [...history].reverse().find((m) => m.role === 'user')
    if (!lastUser || lastUser.content !== message) {
      history = [...history, { role: 'user', content: message }]
    }

    const aiMessage = await callAI([
      { role: 'system', content: systemPrompt },
      ...history,
    ])

    res.json({
      message: aiMessage,
      sources: retrieved.chunks.map((c) => c.source),
    })
  } catch (error) {
    console.error('AI response error:', error.message)
    res.status(500).json({ error: 'Failed to generate AI response' })
  }
})

// GENERATE ROUTINE — creates AM/PM routine based on skin profile
router.post('/generate-routine', auth, async (req, res) => {
  try {
    const { skin_type, concerns, goal } = req.body

    const profile = db.prepare(
      'SELECT * FROM skin_profiles WHERE user_id = ?'
    ).get(req.user.id)

    const effectiveType = skin_type || profile?.skin_type || 'normal'
    const effectiveConcerns = concerns || (profile?.skin_concerns ? JSON.parse(profile.skin_concerns) : [])
    const effectiveGoal = goal || profile?.beauty_goal || 'healthy skin'

    const prompt = `Generate a personalized skincare routine for this user:
- Skin type: ${effectiveType}
- Concerns: ${effectiveConcerns.join(', ') || 'none'}
- Goal: ${effectiveGoal}

Return ONLY valid JSON (no markdown, no code fences) with this exact structure:
{
  "am": [
    {"product_type": "Cleanser", "product_name": "Gentle Hydrating Cleanser", "instruction": "Massage onto damp skin for 60 seconds, then rinse with lukewarm water."}
  ],
  "pm": [
    {"product_type": "Cleanser", "product_name": "Micellar Water", "instruction": "Apply on cotton pad and sweep across face to remove makeup."}
  ]
}

Each routine should have 4-6 steps ordered from cleanser to final product.
- product_type: the category (Cleanser, Toner, Serum, Moisturizer, Sunscreen, etc.)
- product_name: a specific product recommendation suited to the user's ${effectiveType} skin type targeting ${effectiveConcerns.join(', ') || 'general health'}
- instruction: a short how-to-use tip specific to their skin type and concerns
Be specific to the user's skin type and concerns.`

    const aiMessage = await callAI([
      { role: 'system', content: 'You are a skincare expert. Return only valid JSON, no markdown fences, no extra text.' },
      { role: 'user', content: prompt },
    ])

    const routine = parseAIJson(aiMessage)
    res.json(routine)
  } catch (error) {
    console.error('Generate routine error:', error.message)
    res.status(500).json({ error: 'Failed to generate routine' })
  }
})

// DELETE a chat session and all its messages
router.delete('/sessions/:sessionId', auth, (req, res) => {
  const session = db.prepare(
    'SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?'
  ).get(req.params.sessionId, req.user.id)

  if (!session) return res.status(404).json({ error: 'Session not found' })

  // Messages are deleted automatically because of ON DELETE CASCADE
  db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(req.params.sessionId)
  res.json({ success: true })
})

module.exports = router
