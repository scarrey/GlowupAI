# GlowupAI — Computer Vision Microservice

Python microservice that analyzes an uploaded face photo and scores five
visible skin concerns from the proposal: **acne, redness, dark spots, texture,
hydration**. The Express backend calls this service on photo upload; results
are stored so users can track progress over time.

All processing is local — photos are never sent to a third-party image API
(a privacy requirement from the proposal).

## Two modes

1. **Heuristic mode (default)** — a classical OpenCV analyzer (face detection,
   lighting normalization, skin-region segmentation, blob/colour analysis).
   Runs with the light `requirements.txt` and works immediately, so the whole
   feature is demoable without a trained model.
2. **CNN mode** — if a trained Keras model exists at `model/skin_model.h5`, it
   is loaded and used instead. This is the MobileNetV2 transfer-learning model
   described in the proposal.

The service auto-detects which mode to use at startup.

## Run the service

```bash
cd cv-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

Then point the backend at it:

```bash
# in GlowupAi-backend/.env
CV_SERVICE_URL=http://localhost:8000
```

### Endpoints
- `GET  /health` — status + whether a CNN model is loaded
- `POST /analyze` — JSON `{ "image_base64": "<data url or base64>" }`
- `POST /analyze-file` — multipart file upload

## Train the CNN model (Colab / Kaggle)

Training is done on free GPU (Colab/Kaggle), **not** inside the web app.

1. Arrange a Kaggle acne-severity dataset as:
   ```
   data/train/<class>/*.jpg
   data/val/<class>/*.jpg
   ```
2. `pip install -r requirements-train.txt`
3. `python train.py --data_dir data --epochs 15`
4. Copy the produced `skin_model.h5` into `cv-service/model/`.

`train.py` prints accuracy, a classification report, and a confusion matrix
(the M4 evaluation deliverables), fine-tunes MobileNetV2, and uses brightness
augmentation to improve robustness across lighting and skin tones.
