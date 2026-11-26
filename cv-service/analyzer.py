"""
Skin photo analyzer.

Two modes:
  1. CNN mode  — if a trained Keras model is found at MODEL_PATH, it is used to
     score the image. This is the MobileNetV2 transfer-learning model described
     in the proposal (train it on Colab/Kaggle with train.py).
  2. Heuristic mode — a dependency-light classical computer-vision baseline
     (OpenCV) used when no trained model is present, so the feature works
     end-to-end immediately and can be swapped for the CNN later.

Both modes return the same structured output: scores (0-100) for the five
visible concerns from the proposal — acne, redness, dark_spots, texture,
hydration — plus a face-detection flag and a confidence value.
"""

import os
import numpy as np
import cv2

MODEL_PATH = os.environ.get("CV_MODEL_PATH", os.path.join(os.path.dirname(__file__), "model", "skin_model.h5"))

# Lazily-loaded Keras model (only if a trained model file exists)
_model = None
_model_tried = False

# Dimensions the proposal asks the CV module to score.
DIMENSIONS = ["acne", "redness", "dark_spots", "texture", "hydration"]

# For acne/redness/dark_spots a HIGHER score means MORE of the concern (worse).
# For texture/hydration a HIGHER score means BETTER skin.
HIGHER_IS_WORSE = {"acne", "redness", "dark_spots"}


def _try_load_model():
    global _model, _model_tried
    if _model_tried:
        return _model
    _model_tried = True
    if os.path.exists(MODEL_PATH):
        try:
            import tensorflow as tf  # imported lazily; only needed in CNN mode
            _model = tf.keras.models.load_model(MODEL_PATH)
            print(f"[analyzer] Loaded CNN model from {MODEL_PATH}")
        except Exception as e:  # noqa: BLE001
            print(f"[analyzer] Could not load model ({e}); using heuristic mode")
            _model = None
    else:
        print("[analyzer] No trained model found; using heuristic mode")
    return _model


# --- Face detection + preprocessing --------------------------------------
_face_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)


def preprocess(bgr):
    """Detect and crop the face, normalize lighting. Returns (crop, face_found)."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    faces = _face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))
    face_found = len(faces) > 0
    if face_found:
        # largest face
        x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
        pad = int(0.1 * w)
        x0, y0 = max(0, x - pad), max(0, y - pad)
        x1, y1 = min(bgr.shape[1], x + w + pad), min(bgr.shape[0], y + h + pad)
        crop = bgr[y0:y1, x0:x1]
    else:
        # center crop fallback
        h, w = bgr.shape[:2]
        s = int(min(h, w) * 0.8)
        cy, cx = h // 2, w // 2
        crop = bgr[max(0, cy - s // 2):cy + s // 2, max(0, cx - s // 2):cx + s // 2]

    # Lighting normalization via CLAHE on the L channel (LAB)
    lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    crop = cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)
    return crop, face_found


def _skin_mask(bgr):
    """Rough skin-region mask in YCrCb space."""
    ycrcb = cv2.cvtColor(bgr, cv2.COLOR_BGR2YCrCb)
    lower = np.array([0, 133, 77], dtype=np.uint8)
    upper = np.array([255, 173, 127], dtype=np.uint8)
    mask = cv2.inRange(ycrcb, lower, upper)
    return mask


def _clip(v, lo=0.0, hi=100.0):
    return float(max(lo, min(hi, v)))


# --- Heuristic scorer -----------------------------------------------------
def heuristic_scores(bgr):
    """Classical-CV baseline scoring. Returns dict of 0-100 scores."""
    mask = _skin_mask(bgr)
    skin_px = mask > 0
    total = max(1, int(skin_px.sum()))

    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    L, A, B = lab[:, :, 0], lab[:, :, 1], lab[:, :, 2]
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

    # Redness: elevated a* within skin region
    a_skin = A[skin_px]
    redness = _clip((np.mean(a_skin) - 128) * 4.0) if a_skin.size else 0.0

    # Texture: edge/roughness via Laplacian variance (normalized)
    lap_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    roughness = _clip(lap_var / 8.0)          # higher = rougher
    texture = _clip(100.0 - roughness)        # higher = smoother/better

    # Acne: local bright/red blobs — count spots that deviate from local mean
    blur = cv2.GaussianBlur(gray, (0, 0), sigmaX=7)
    diff = cv2.absdiff(gray, blur)
    spots = (diff > 18) & skin_px
    acne = _clip((int(spots.sum()) / total) * 600.0)

    # Dark spots: localized darker regions within skin
    l_skin_mean = np.mean(L[skin_px]) if skin_px.any() else np.mean(L)
    dark = (L < (l_skin_mean - 20)) & skin_px
    dark_spots = _clip((int(dark.sum()) / total) * 400.0)

    # Hydration: proxy — smoother, more even skin with soft specular glow.
    # Lower high-frequency variation + moderate brightness => more hydrated look.
    evenness = _clip(100.0 - (np.std(L[skin_px]) if skin_px.any() else np.std(L)) * 2.0)
    hydration = _clip(0.6 * evenness + 0.4 * texture)

    return {
        "acne": round(acne, 1),
        "redness": round(redness, 1),
        "dark_spots": round(dark_spots, 1),
        "texture": round(texture, 1),
        "hydration": round(hydration, 1),
    }


# --- CNN scorer -----------------------------------------------------------
def cnn_scores(model, bgr):
    """Run the trained model. Expected to output 5 values in [0,1] mapped to
    the DIMENSIONS order. Adjust here if your trained model differs."""
    img = cv2.resize(bgr, (224, 224))
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    pred = model.predict(np.expand_dims(img, 0), verbose=0)[0]
    pred = np.array(pred).flatten()
    # If the model is a single-label acne-severity classifier, map class→score.
    if pred.size != len(DIMENSIONS):
        # treat as severity probability distribution → acne score, heuristics for rest
        sev = float(np.dot(pred, np.linspace(0, 100, pred.size))) if pred.size > 1 else float(pred[0] * 100)
        base = heuristic_scores(bgr)
        base["acne"] = round(_clip(sev), 1)
        return base
    return {d: round(_clip(float(pred[i]) * 100.0), 1) for i, d in enumerate(DIMENSIONS)}


def label_for(dim, score):
    """Human-readable band for a score."""
    if dim in HIGHER_IS_WORSE:
        if score < 25:
            return "minimal"
        if score < 50:
            return "mild"
        if score < 75:
            return "moderate"
        return "significant"
    else:
        if score < 25:
            return "poor"
        if score < 50:
            return "fair"
        if score < 75:
            return "good"
        return "excellent"


def analyze(bgr):
    """Main entry point. Returns the full structured analysis."""
    crop, face_found = preprocess(bgr)
    model = _try_load_model()
    if model is not None:
        scores = cnn_scores(model, crop)
        mode = "cnn"
        confidence = 0.85 if face_found else 0.5
    else:
        scores = heuristic_scores(crop)
        mode = "heuristic"
        confidence = 0.6 if face_found else 0.35

    metrics = {
        d: {"score": scores[d], "label": label_for(d, scores[d]), "higher_is_better": d not in HIGHER_IS_WORSE}
        for d in DIMENSIONS
    }
    # Overall 0-100 "skin health" summary (invert the worse-is-higher dims)
    overall = np.mean([
        (100 - scores[d]) if d in HIGHER_IS_WORSE else scores[d]
        for d in DIMENSIONS
    ])

    return {
        "mode": mode,
        "face_detected": bool(face_found),
        "confidence": round(float(confidence), 2),
        "overall_score": round(float(overall), 1),
        "metrics": metrics,
        "disclaimer": "This is an automated cosmetic estimate, not a medical diagnosis.",
        "low_confidence": confidence < 0.4,
    }
