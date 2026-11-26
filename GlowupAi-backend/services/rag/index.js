// Retrieval-Augmented Generation (RAG) retriever.
//
// This is a self-contained, dependency-free vector retriever: each knowledge
// chunk is embedded as a TF-IDF vector over the vocabulary, the query is
// embedded the same way, and chunks are ranked by cosine similarity. The
// top-k chunks are injected into the chat system prompt so the model answers
// from verified dermatological information and can cite sources.
//
// The interface (retrieveContext, needsEscalation, SAFETY_ESCALATION_NOTE) is
// intentionally simple so the Node retriever can be swapped for a Python
// sentence-transformers + ChromaDB microservice later without touching chat.js.

const KNOWLEDGE = require('./knowledge')

const TOP_K = 3
const MIN_SCORE = 0.04 // below this, retrieval is treated as "no good match"

// --- Tokenization ---------------------------------------------------------
const STOPWORDS = new Set(
  ('a an the and or but if then of to for in on at by with from into about as is are ' +
    'was were be been being do does did my your you i we it this that these those can ' +
    'could should would will what which how why when who whom me use using used help ' +
    'get got have has had more most some any all not no yes please tell give show')
    .split(' ')
)

const tokenize = (text) =>
  (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))

// --- Build the TF-IDF index once at module load ---------------------------
const buildIndex = () => {
  const docs = KNOWLEDGE.map((chunk) => {
    const tokens = tokenize(`${chunk.title} ${chunk.text}`)
    const tf = {}
    tokens.forEach((t) => (tf[t] = (tf[t] || 0) + 1))
    return { chunk, tokens, tf }
  })

  // Document frequency for each term
  const df = {}
  docs.forEach(({ tf }) => {
    Object.keys(tf).forEach((term) => (df[term] = (df[term] || 0) + 1))
  })

  const N = docs.length
  const idf = {}
  Object.keys(df).forEach((term) => {
    idf[term] = Math.log((N + 1) / (df[term] + 1)) + 1
  })

  // Pre-compute each document's TF-IDF vector and its norm
  docs.forEach((doc) => {
    doc.vec = {}
    Object.entries(doc.tf).forEach(([term, count]) => {
      doc.vec[term] = count * (idf[term] || 0)
    })
    doc.norm = Math.sqrt(
      Object.values(doc.vec).reduce((s, v) => s + v * v, 0)
    )
  })

  return { docs, idf }
}

const INDEX = buildIndex()

// --- Query embedding + cosine similarity ----------------------------------
const embedQuery = (query) => {
  const tokens = tokenize(query)
  const tf = {}
  tokens.forEach((t) => (tf[t] = (tf[t] || 0) + 1))
  const vec = {}
  Object.entries(tf).forEach(([term, count]) => {
    if (INDEX.idf[term]) vec[term] = count * INDEX.idf[term]
  })
  const norm = Math.sqrt(Object.values(vec).reduce((s, v) => s + v * v, 0))
  return { vec, norm }
}

const cosine = (qVec, qNorm, doc) => {
  if (qNorm === 0 || doc.norm === 0) return 0
  let dot = 0
  // iterate over the smaller vector
  const [small, large] =
    Object.keys(qVec).length < Object.keys(doc.vec).length
      ? [qVec, doc.vec]
      : [doc.vec, qVec]
  Object.entries(small).forEach(([term, v]) => {
    if (large[term]) dot += v * large[term]
  })
  return dot / (qNorm * doc.norm)
}

/**
 * Retrieve the most relevant knowledge chunks for a query.
 * @param {string} query
 * @returns {{ context: string, chunks: Array<{source:string,title:string,score:number}> }}
 */
const retrieveContext = (query) => {
  const q = embedQuery(query)
  if (q.norm === 0) return { context: '', chunks: [] }

  const scored = INDEX.docs
    .map((doc) => ({ doc, score: cosine(q.vec, q.norm, doc) }))
    .filter((s) => s.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K)

  const chunks = scored.map((s) => ({
    source: s.doc.chunk.source,
    title: s.doc.chunk.title,
    id: s.doc.chunk.id,
    score: Number(s.score.toFixed(3)),
  }))

  const context = scored
    .map((s) => `[${s.doc.chunk.source} — ${s.doc.chunk.title}] ${s.doc.chunk.text}`)
    .join('\n\n')

  return { context, chunks }
}

// --- Safety escalation layer ---------------------------------------------
const SAFETY_ESCALATION_NOTE =
  'SAFETY: The user may be describing a condition beyond cosmetic skincare scope. ' +
  'Gently recommend that they consult a dermatologist or doctor for proper evaluation. ' +
  'Do NOT attempt to diagnose. Remind them this app provides general cosmetic guidance only, not medical diagnosis.'

// Terms that suggest the question is outside cosmetic guidance and should be
// escalated to a medical professional.
const ESCALATION_TERMS = [
  'bleeding', 'pus', 'infected', 'infection', 'fever', 'painful', 'severe pain',
  'mole', 'melanoma', 'cancer', 'growing spot', 'changing mole', 'lump',
  'cystic', 'cysts', 'boil', 'abscess', 'rash spreading', 'spreading rash',
  'allergic reaction', 'swelling', 'swollen', 'hives', 'blister', 'blisters',
  'eczema', 'psoriasis', 'rosacea', 'shingles', 'impetigo', 'cellulitis',
  'does not heal', "won't heal", 'not healing', 'open wound', 'ulcer',
  'prescription', 'accutane', 'isotretinoin', 'antibiotic',
]

const needsEscalation = (message) => {
  const text = (message || '').toLowerCase()
  return ESCALATION_TERMS.some((term) => text.includes(term))
}

module.exports = { retrieveContext, needsEscalation, SAFETY_ESCALATION_NOTE, KNOWLEDGE }
