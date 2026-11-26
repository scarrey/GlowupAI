// Curated dermatological knowledge base for the RAG chatbot.
// Each entry is a retrievable "chunk". Sources are open-access dermatology
// references (American Academy of Dermatology guidance, DermNet NZ, and
// published ingredient-interaction literature) as listed in the proposal.
//
// To scale this up: add more chunks here, or swap the Node retriever for the
// Python sentence-transformers + ChromaDB service (see services/rag/README.md).

module.exports = [
  {
    id: 'skin-types-overview',
    source: 'DermNet NZ',
    title: 'Skin types',
    text: 'Skin is commonly classified as normal, dry, oily, combination, or sensitive. Oily skin overproduces sebum and is prone to enlarged pores and acne. Dry skin lacks oil, feels tight, and may flake. Combination skin is oily in the T-zone (forehead, nose, chin) and normal to dry elsewhere. Sensitive skin reacts easily with redness, stinging, or burning. Identifying skin type guides product and ingredient choices.',
  },
  {
    id: 'cleanser-basics',
    source: 'AAD',
    title: 'Cleansing',
    text: 'Wash the face twice daily and after sweating with a gentle, non-abrasive, alcohol-free cleanser. Use lukewarm water and apply with fingertips, not a washcloth or sponge which can irritate. Over-washing or scrubbing can strip the skin barrier and worsen dryness or acne. Rinse thoroughly and pat dry.',
  },
  {
    id: 'moisturizer-basics',
    source: 'AAD',
    title: 'Moisturizing',
    text: 'Moisturizer traps water in the skin and supports the skin barrier. Apply it while the skin is still damp after cleansing. Humectants such as glycerin and hyaluronic acid draw in water; occlusives such as petrolatum and ceramides seal it in. Even oily and acne-prone skin benefits from a lightweight, non-comedogenic moisturizer.',
  },
  {
    id: 'sunscreen-basics',
    source: 'AAD',
    title: 'Sunscreen',
    text: 'Apply a broad-spectrum sunscreen with SPF 30 or higher every day, even when cloudy or indoors near windows. Reapply every two hours outdoors and after swimming or sweating. Daily sunscreen is the single most effective anti-aging step and prevents dark spots from worsening. UV exposure is a leading cause of premature aging and hyperpigmentation.',
  },
  {
    id: 'retinol-usage',
    source: 'AAD',
    title: 'Retinoids',
    text: 'Retinoids (retinol, retinaldehyde, tretinoin) increase cell turnover and treat acne, fine lines, and uneven texture. Use them at night only, because they degrade in sunlight and increase photosensitivity. Start two to three nights per week and build up slowly to avoid irritation, dryness, and peeling. Always pair with daily sunscreen. Avoid during pregnancy.',
  },
  {
    id: 'vitamin-c-usage',
    source: 'DermNet NZ',
    title: 'Vitamin C',
    text: 'Vitamin C (L-ascorbic acid) is an antioxidant serum that brightens skin, fades dark spots, and boosts sun protection when layered under sunscreen. Use it in the morning. It can be unstable and may cause tingling on sensitive skin. Introduce gradually and store away from light and air.',
  },
  {
    id: 'niacinamide-usage',
    source: 'DermNet NZ',
    title: 'Niacinamide',
    text: 'Niacinamide (vitamin B3) regulates oil, reduces the appearance of pores, strengthens the skin barrier, and calms redness. It is well tolerated by most skin types including sensitive skin, and pairs well with most other ingredients. It can be used morning or night.',
  },
  {
    id: 'aha-bha-usage',
    source: 'DermNet NZ',
    title: 'Chemical exfoliants (AHA/BHA)',
    text: 'Alpha hydroxy acids (glycolic, lactic) exfoliate the skin surface and improve texture and tone. Beta hydroxy acid (salicylic acid) is oil-soluble and penetrates pores to treat acne and blackheads. Limit chemical exfoliation to two or three times per week. Overuse causes irritation and barrier damage. Always use sunscreen, as acids increase sun sensitivity.',
  },
  {
    id: 'conflict-retinol-aha',
    source: 'Published ingredient-interaction literature',
    title: 'Conflict: retinoids + AHA/BHA',
    text: 'Combining retinoids with AHA or BHA exfoliants in the same routine often causes excessive irritation, redness, and peeling because both increase cell turnover and can compromise the skin barrier. Best practice is to separate them: use acids on some nights and retinoid on others, or acids in the morning and retinoid at night. Do not layer them together.',
  },
  {
    id: 'conflict-vitc-benzoyl',
    source: 'Published ingredient-interaction literature',
    title: 'Conflict: vitamin C + benzoyl peroxide',
    text: 'Benzoyl peroxide can oxidize vitamin C (L-ascorbic acid), reducing the effectiveness of both when applied together. If using both, apply them at different times of day — for example vitamin C in the morning and benzoyl peroxide at night.',
  },
  {
    id: 'conflict-retinol-benzoyl',
    source: 'Published ingredient-interaction literature',
    title: 'Conflict: retinol + benzoyl peroxide',
    text: 'Plain retinol and benzoyl peroxide can deactivate each other and together increase dryness and irritation. Use them at separate times (benzoyl peroxide in the morning, retinol at night) unless using a formulation specifically stabilized to combine them.',
  },
  {
    id: 'conflict-niacinamide-vitc',
    source: 'Published ingredient-interaction literature',
    title: 'Niacinamide + vitamin C',
    text: 'Older claims that niacinamide and vitamin C cannot be combined are largely outdated for modern stabilized formulations; most people tolerate them well together. Very sensitive skin may occasionally experience mild flushing. They can generally be layered or used in separate routines.',
  },
  {
    id: 'acne-management',
    source: 'AAD',
    title: 'Acne',
    text: 'Acne is caused by clogged pores, excess oil, bacteria, and inflammation. Effective ingredients include benzoyl peroxide, salicylic acid, and topical retinoids. Improvement usually takes six to eight weeks of consistent use, so avoid switching products too quickly. Do not pick or squeeze lesions, as this causes scarring and dark marks. Non-comedogenic products are preferred.',
  },
  {
    id: 'hyperpigmentation',
    source: 'DermNet NZ',
    title: 'Dark spots and hyperpigmentation',
    text: 'Post-inflammatory hyperpigmentation and dark spots can be improved with vitamin C, niacinamide, azelaic acid, alpha arbutin, and retinoids, combined with strict daily sunscreen. Results are gradual, often taking two to three months. Without sun protection, pigmentation treatments are far less effective.',
  },
  {
    id: 'sensitive-skin',
    source: 'DermNet NZ',
    title: 'Sensitive skin care',
    text: 'For sensitive skin, use fragrance-free, minimal-ingredient products and introduce one new product at a time. Patch test new products on the inner forearm for a few days before applying to the face. Soothing ingredients include ceramides, panthenol, centella asiatica, and colloidal oatmeal. Avoid high concentrations of acids, physical scrubs, and alcohol-heavy formulas.',
  },
  {
    id: 'skin-barrier',
    source: 'DermNet NZ',
    title: 'Skin barrier repair',
    text: 'A damaged skin barrier shows as tightness, stinging, redness, and flaking, often from over-exfoliating or using too many actives. To repair it, pause all actives (acids, retinoids, vitamin C) and focus on a gentle cleanser, a ceramide moisturizer, and sunscreen for one to two weeks before slowly reintroducing products.',
  },
  {
    id: 'hydration-lifestyle',
    source: 'AAD',
    title: 'Hydration and lifestyle',
    text: 'Skin health is supported by adequate water intake, sufficient sleep, a balanced diet, and stress management. Poor sleep and high stress can increase inflammation and trigger breakouts. While drinking water alone will not cure skin conditions, overall hydration and lifestyle habits meaningfully influence skin appearance over time.',
  },
  {
    id: 'routine-order',
    source: 'DermNet NZ',
    title: 'Routine layering order',
    text: 'Apply products from thinnest to thickest. A typical order: cleanser, toner, water-based serum (e.g. vitamin C or niacinamide), treatment, moisturizer, then sunscreen last in the morning. At night, finish with moisturizer or facial oil. Allow each layer to absorb before the next.',
  },
  {
    id: 'patch-testing',
    source: 'AAD',
    title: 'Patch testing',
    text: 'Before using a new active product, patch test it: apply a small amount to the inner forearm or behind the ear once daily for several days and watch for redness, itching, or swelling. This reduces the risk of a full-face reaction, especially for sensitive skin or strong actives like retinoids and acids.',
  },
  {
    id: 'when-to-see-derm',
    source: 'AAD',
    title: 'When to see a dermatologist',
    text: 'See a dermatologist for severe or cystic acne, a mole or spot that changes in size, shape, or color, persistent or spreading rashes, signs of infection (pus, warmth, fever), suspected rosacea or eczema, or any condition that does not improve with over-the-counter care. A skincare app provides general cosmetic guidance only and is not a substitute for medical diagnosis.',
  },
]
