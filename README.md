# Glow-Up Advisor — Your AI Skincare Companion

An AI-powered skincare web app that builds personalized routines, tracks your
skin over time, and gives advice grounded in dermatological knowledge.

## Architecture

The system has three parts:

| Service | Tech | Purpose |
|---|---|---|
| **Frontend** | React (Vite), Tailwind, shadcn/ui | Single-page web app |
| **Backend** | Node.js, Express, SQLite, JWT | REST API, auth, data, AI orchestration, RAG chatbot |
| **CV service** (`cv-service/`) | Python, FastAPI, OpenCV / MobileNetV2 | Photo skin analysis |

## AI features

1. **Photo skin analysis** — CV microservice scores acne, redness, dark spots,
   texture and hydration from an uploaded photo; progress is tracked over time.
2. **Multi-turn chatbot** — remembers the recent conversation, grounded with
   **RAG** (retrieval from a curated dermatology knowledge base) with source
   citations and a safety-escalation layer.
3. **AI daily tips** — generated from your actual tracked data.
4. **Weekly AI skin report** — summarizes the past 7 days.
5. **AI product recommendations** — personalized, with ingredient-conflict flags.
6. **Ingredient conflict detection** — warns about combos like retinol + AHA.
7. **Insights engine** — Pearson correlation of wellness vs. skin scores.

## Getting started

### 1. Backend
```bash
cd GlowupAi-backend
npm install
cp .env.example .env     # then set JWT_SECRET and OPENROUTER_API_KEY
npm run dev              # http://localhost:3001
```

### 2. Frontend
```bash
npm install
# create .env.local with: VITE_API_URL=http://localhost:3001
npm run dev
```

### 3. CV service (for photo analysis)
```bash
cd cv-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --port 8000
```
See `cv-service/README.md` for training the MobileNetV2 model on Colab/Kaggle.

## Notes
- AI text features need an `OPENROUTER_API_KEY`; without one they fall back to
  sensible deterministic responses so the app still runs.
- The CV service runs in heuristic mode until a trained model is added, so photo
  analysis works end-to-end immediately.
- Tests: `cd GlowupAi-backend && npm test` (252 tests).
