// Tests for the new AI-feature building blocks: ingredient conflict
// detection, the RAG retriever + safety escalation, and the insights engine.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecret'

const { checkConflicts, checkRoutineConflicts, extractIngredients } = require('../services/ingredients')
const { retrieveContext, needsEscalation } = require('../services/rag')
const { pearson } = require('../services/insights')

describe('Ingredient conflict detection', () => {
  test('flags retinoid + AHA as a high-severity conflict', () => {
    const conflicts = checkConflicts(extractIngredients(['Retinol Cream', 'Glycolic Acid Toner']))
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].severity).toBe('high')
    expect(conflicts[0].ingredients).toEqual(expect.arrayContaining(['retinoid', 'aha']))
  })

  test('flags vitamin C + benzoyl peroxide', () => {
    const conflicts = checkConflicts(extractIngredients(['Vitamin C Serum', 'Benzoyl Peroxide Gel']))
    expect(conflicts.some((c) => c.ingredients.includes('vitamin_c') && c.ingredients.includes('benzoyl_peroxide'))).toBe(true)
  })

  test('returns no conflict for a safe combination', () => {
    const conflicts = checkConflicts(extractIngredients(['Niacinamide Serum', 'Hyaluronic Acid Moisturizer']))
    expect(conflicts).toHaveLength(0)
  })

  test('detects conflicts across routine steps', () => {
    const steps = [
      { product_type: 'Cleanser', product_name: 'Salicylic Acid Cleanser' },
      { product_type: 'Treatment', product_name: 'Retinol Night Cream' },
    ]
    const conflicts = checkRoutineConflicts(steps)
    expect(conflicts.some((c) => c.ingredients.includes('retinoid') && c.ingredients.includes('bha'))).toBe(true)
  })
})

describe('RAG retriever', () => {
  test('retrieves relevant chunks for an ingredient question', () => {
    const { chunks, context } = retrieveContext('can I use retinol with glycolic acid?')
    expect(chunks.length).toBeGreaterThan(0)
    expect(context.length).toBeGreaterThan(0)
    expect(chunks[0]).toHaveProperty('source')
  })

  test('returns no chunks for an empty / off-topic query', () => {
    const { chunks } = retrieveContext('zzz qqq')
    expect(chunks).toHaveLength(0)
  })
})

describe('Safety escalation layer', () => {
  test('escalates medical-sounding messages', () => {
    expect(needsEscalation('I have a mole that is bleeding and changing')).toBe(true)
    expect(needsEscalation('my face has a spreading rash with pus')).toBe(true)
  })

  test('does not escalate ordinary cosmetic questions', () => {
    expect(needsEscalation('what moisturizer is good for dry skin?')).toBe(false)
  })
})

describe('Insights: Pearson correlation', () => {
  test('computes perfect positive correlation', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 5)
  })
  test('computes perfect negative correlation', () => {
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 5)
  })
  test('returns null for constant input', () => {
    expect(pearson([1, 1, 1], [2, 3, 4])).toBeNull()
  })
})
