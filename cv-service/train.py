"""
MobileNetV2 transfer-learning trainer for skin concern scoring.

This is written to run on Google Colab or Kaggle (free GPU), exactly as the
proposal specifies. It trains an acne-severity classifier on a Kaggle
dermatology dataset and saves a Keras model that the CV microservice
(analyzer.py) will automatically pick up at model/skin_model.h5.

HOW TO USE (Colab):
  1. Upload / mount a Kaggle "Acne Severity Grading" style dataset arranged as:
        data/train/<class_name>/*.jpg
        data/val/<class_name>/*.jpg
     (classes e.g. clear, mild, moderate, severe)
  2. pip install tensorflow
  3. python train.py --data_dir data --epochs 15
  4. Download the produced skin_model.h5 into cv-service/model/

Note: training is intentionally NOT run inside the web app / container; the app
only performs inference. See cv-service/README.md.
"""

import argparse
import os


def build_model(num_classes, img_size=224):
    import tensorflow as tf
    base = tf.keras.applications.MobileNetV2(
        input_shape=(img_size, img_size, 3),
        include_top=False,
        weights="imagenet",
    )
    base.trainable = False  # feature extraction first
    model = tf.keras.Sequential([
        base,
        tf.keras.layers.GlobalAveragePooling2D(),
        tf.keras.layers.Dropout(0.3),
        tf.keras.layers.Dense(128, activation="relu"),
        tf.keras.layers.Dropout(0.2),
        tf.keras.layers.Dense(num_classes, activation="softmax"),
    ])
    model.compile(
        optimizer=tf.keras.optimizers.Adam(1e-3),
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def main():
    import tensorflow as tf
    ap = argparse.ArgumentParser()
    ap.add_argument("--data_dir", default="data")
    ap.add_argument("--epochs", type=int, default=15)
    ap.add_argument("--img_size", type=int, default=224)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--out", default=os.path.join("model", "skin_model.h5"))
    args = ap.parse_args()

    train_dir = os.path.join(args.data_dir, "train")
    val_dir = os.path.join(args.data_dir, "val")

    aug = tf.keras.preprocessing.image.ImageDataGenerator(
        rescale=1 / 255.0,
        rotation_range=15,
        width_shift_range=0.1,
        height_shift_range=0.1,
        zoom_range=0.1,
        horizontal_flip=True,
        brightness_range=(0.8, 1.2),  # helps robustness across lighting/skin tones
    )
    val_gen_src = tf.keras.preprocessing.image.ImageDataGenerator(rescale=1 / 255.0)

    train_gen = aug.flow_from_directory(
        train_dir, target_size=(args.img_size, args.img_size),
        batch_size=args.batch, class_mode="categorical",
    )
    val_gen = val_gen_src.flow_from_directory(
        val_dir, target_size=(args.img_size, args.img_size),
        batch_size=args.batch, class_mode="categorical",
    )

    num_classes = train_gen.num_classes
    model = build_model(num_classes, args.img_size)

    callbacks = [
        tf.keras.callbacks.EarlyStopping(patience=4, restore_best_weights=True),
        tf.keras.callbacks.ReduceLROnPlateau(patience=2, factor=0.3),
    ]

    model.fit(train_gen, validation_data=val_gen, epochs=args.epochs, callbacks=callbacks)

    # Fine-tune the top of the base network
    model.layers[0].trainable = True
    for layer in model.layers[0].layers[:-30]:
        layer.trainable = False
    model.compile(
        optimizer=tf.keras.optimizers.Adam(1e-5),
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )
    model.fit(train_gen, validation_data=val_gen, epochs=5, callbacks=callbacks)

    # Evaluation metrics (accuracy, F1, confusion matrix) — proposal M4 deliverable
    try:
        import numpy as np
        from sklearn.metrics import classification_report, confusion_matrix
        val_gen.reset()
        y_true = val_gen.classes
        y_prob = model.predict(val_gen)
        y_pred = np.argmax(y_prob, axis=1)
        print("Confusion matrix:\n", confusion_matrix(y_true, y_pred))
        print(classification_report(y_true, y_pred, target_names=list(val_gen.class_indices.keys())))
    except Exception as e:  # noqa: BLE001
        print("Skipped detailed metrics:", e)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    model.save(args.out)
    print(f"Saved model to {args.out}")


if __name__ == "__main__":
    main()
