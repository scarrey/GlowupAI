"""
GlowupAI Computer Vision microservice (FastAPI).

Exposes a single /analyze endpoint that the Node/Express backend calls when a
user uploads a face photo. Runs locally — no third-party image APIs — so user
photos never leave the deployment (a privacy requirement from the proposal).

Run:
    uvicorn app:app --host 0.0.0.0 --port 8000
"""

import base64
import io

import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import analyzer

app = FastAPI(title="GlowupAI CV Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ImagePayload(BaseModel):
    image_base64: str  # data URL or raw base64


def _decode_bgr(raw_bytes: bytes):
    arr = np.frombuffer(raw_bytes, dtype=np.uint8)
    bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if bgr is None:
        raise HTTPException(status_code=400, detail="Could not decode image")
    # Downscale very large uploads for speed
    h, w = bgr.shape[:2]
    if max(h, w) > 1024:
        scale = 1024 / max(h, w)
        bgr = cv2.resize(bgr, (int(w * scale), int(h * scale)))
    return bgr


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": analyzer._try_load_model() is not None}


@app.post("/analyze")
def analyze_json(payload: ImagePayload):
    data = payload.image_base64
    if "," in data and data.strip().startswith("data:"):
        data = data.split(",", 1)[1]
    try:
        raw = base64.b64decode(data)
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid base64 image")
    bgr = _decode_bgr(raw)
    return analyzer.analyze(bgr)


@app.post("/analyze-file")
async def analyze_file(file: UploadFile = File(...)):
    raw = await file.read()
    bgr = _decode_bgr(raw)
    return analyzer.analyze(bgr)
