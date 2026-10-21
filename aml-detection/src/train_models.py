"""Train and evaluate the four candidate classifiers on labeled account profiles.

Train / validation / test partitions are disjoint (stratified 70/15/15). The champion is
chosen on validation macro-F1 only; held-out test metrics are reported once for it and for
every candidate. Preprocessing is fit on training rows only (inside the Pipeline).
"""
import json
import time
from typing import Any, Dict

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier, StackingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    balanced_accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.pipeline import Pipeline

from config import (
    CATEGORICAL_FEATURES,
    EVALUATION_REPORT_PATH,
    EXCLUDED_COLUMNS,
    FEATURE_COLS,
    MODEL_ARTIFACT_PATH,
    MODELS_DIR,
    NUMERIC_FEATURES,
    POSITIVE_CLASS,
    TARGET_COL,
)
from src.preprocessing import build_preprocessor, split_partitions


def _candidates() -> Dict[str, Any]:
    return {
        "Gradient Boosting": GradientBoostingClassifier(n_estimators=150, learning_rate=0.05, max_depth=3, random_state=42),
        "Random Forest": RandomForestClassifier(n_estimators=200, class_weight="balanced", random_state=42),
        "Logistic Regression": LogisticRegression(max_iter=2000, class_weight="balanced", random_state=42),
        "Stacking": StackingClassifier(
            estimators=[
                ("rf", RandomForestClassifier(n_estimators=100, random_state=42)),
                ("gb", GradientBoostingClassifier(n_estimators=100, max_depth=3, random_state=42)),
            ],
            final_estimator=LogisticRegression(max_iter=1000),
            cv=3,
        ),
    }


def _evaluate(pipe: Pipeline, X: pd.DataFrame, y: pd.Series, classes) -> Dict[str, Any]:
    preds = pipe.predict(X)
    out: Dict[str, Any] = {
        "accuracy": round(float(accuracy_score(y, preds)), 4),
        "balanced_accuracy": round(float(balanced_accuracy_score(y, preds)), 4),
        "macro_f1": round(float(f1_score(y, preds, average="macro")), 4),
        "confusion_matrix": {"labels": list(classes), "matrix": confusion_matrix(y, preds, labels=classes).tolist()},
        "per_class": classification_report(y, preds, labels=classes, output_dict=True, zero_division=0),
        "pr_auc": None,
    }
    if hasattr(pipe, "predict_proba") and POSITIVE_CLASS in classes:
        idx = list(pipe.classes_).index(POSITIVE_CLASS)
        proba = pipe.predict_proba(X)[:, idx]
        out["pr_auc"] = round(float(average_precision_score((y == POSITIVE_CLASS).astype(int), proba)), 4)
    return out


def train_and_select_models(df: pd.DataFrame, target_col: str = TARGET_COL, dataset_name: str = "uploaded.csv") -> Dict[str, Any]:
    start = time.time()
    missing = [c for c in FEATURE_COLS + [target_col] if c not in df.columns]
    if missing:
        raise ValueError(f"Training data is missing required columns: {missing}")

    df = df.dropna(subset=FEATURE_COLS + [target_col]).copy()
    df[target_col] = df[target_col].astype(str).str.strip().str.lower()
    counts = df[target_col].value_counts().to_dict()
    if len(counts) < 2 or min(counts.values()) < 7:
        raise ValueError(f"Need at least 2 classes with 7+ rows each for a 70/15/15 split. Got {counts}")

    train_df, val_df, test_df = split_partitions(df, target_col)
    X_tr, y_tr = train_df[FEATURE_COLS], train_df[target_col]
    X_va, y_va = val_df[FEATURE_COLS], val_df[target_col]
    X_te, y_te = test_df[FEATURE_COLS], test_df[target_col]
    classes = sorted(y_tr.unique().tolist())

    leaderboard, fitted = [], {}
    for name, clf in _candidates().items():
        t0 = time.time()
        pipe = Pipeline([("preprocessor", build_preprocessor(NUMERIC_FEATURES, CATEGORICAL_FEATURES)), ("classifier", clf)])
        pipe.fit(X_tr, y_tr)
        val = _evaluate(pipe, X_va, y_va, classes)
        test = _evaluate(pipe, X_te, y_te, classes)
        fitted[name] = pipe
        joblib.dump(pipe, MODELS_DIR / f"{name.lower().replace(' ', '_')}.joblib")
        leaderboard.append({
            "model": name,
            "status": "completed",
            "validation_macro_f1": val["macro_f1"],
            "validation_balanced_accuracy": val["balanced_accuracy"],
            "test_macro_f1": test["macro_f1"],
            "test_balanced_accuracy": test["balanced_accuracy"],
            "test_pr_auc": test["pr_auc"],
            "training_duration_seconds": round(time.time() - t0, 3),
        })

    leaderboard.append({
        "model": "Convolutional Neural Network (CNN)",
        "status": "unsupported",
        "validation_macro_f1": None,
        "documentation": "Not trained: account profiles are unordered tabular features with no spatial structure.",
    })

    done = [m for m in leaderboard if m["status"] == "completed"]
    champion_name = max(done, key=lambda m: (m["validation_macro_f1"], m["validation_balanced_accuracy"]))["model"]
    champion = fitted[champion_name]
    test_metrics = _evaluate(champion, X_te, y_te, classes)
    train_metrics = _evaluate(champion, X_tr, y_tr, classes)

    artifact = {
        "champion_name": champion_name,
        "pipeline": champion,
        "feature_cols": FEATURE_COLS,
        "num_cols": NUMERIC_FEATURES,
        "cat_cols": CATEGORICAL_FEATURES,
        "known_categories": {c: sorted(train_df[c].astype(str).unique().tolist()) for c in CATEGORICAL_FEATURES},
        "classes": classes,
        "reference_medians": {c: float(train_df[c].median()) for c in NUMERIC_FEATURES},
        "reference_mode": {c: str(train_df[c].mode().iloc[0]) for c in CATEGORICAL_FEATURES},
        "target_col": target_col,
        "trained_at": pd.Timestamp.utcnow().isoformat(),
        "dataset": dataset_name,
    }
    joblib.dump(artifact, MODEL_ARTIFACT_PATH)

    reloaded = joblib.load(MODEL_ARTIFACT_PATH)
    reload_ok = bool(np.array_equal(champion.predict(X_te), reloaded["pipeline"].predict(X_te)))
    if not reload_ok:
        raise RuntimeError("Reload verification failed: saved model predictions diverged.")

    summary = {
        "champion_model": champion_name,
        "dataset": dataset_name,
        "dataset_records": int(len(df)),
        "class_distribution": {k: int(v) for k, v in counts.items()},
        "train_size": len(train_df),
        "val_size": len(val_df),
        "test_size": len(test_df),
        "features": FEATURE_COLS,
        "excluded_columns": [c for c in EXCLUDED_COLUMNS if c in df.columns],
        "test_macro_f1": test_metrics["macro_f1"],
        "test_balanced_accuracy": test_metrics["balanced_accuracy"],
        "test_accuracy": test_metrics["accuracy"],
        "test_pr_auc": test_metrics["pr_auc"],
        "test_confusion_matrix": test_metrics["confusion_matrix"],
        "classification_report": test_metrics["per_class"],
        "train_macro_f1_for_reference_only": train_metrics["macro_f1"],
        "leaderboard": leaderboard,
        "reload_verified": reload_ok,
        "trained_at": artifact["trained_at"],
        "total_elapsed_seconds": round(time.time() - start, 2),
        "artifact_path": str(MODEL_ARTIFACT_PATH),
        "limitations": [
            f"Held-out test set has only {len(test_df)} rows; metrics have wide uncertainty.",
            "Labels are synthetic. These scores do not verify real-world banking AML performance.",
            "The model scores account profiles, not individual raw transactions.",
        ],
    }
    with open(EVALUATION_REPORT_PATH, "w") as f:
        json.dump(summary, f, indent=2)
    return summary
