"""Inference with strict input validation and a separate, documented review policy.

Model output (predicted class + probability) is reported as-is. Whether a record is
*flagged for review* is a separate decision that needs both:
  1. model P(risk) >= review_threshold, and
  2. at least `min_indicators` corroborating behavioural indicators.
Rows with missing / non-numeric / unseen-category features are "Unable to classify";
no values are imputed.
"""
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
import pandas as pd

from config import DEFAULT_RISK_CONFIG, MODEL_ARTIFACT_PATH, POSITIVE_CLASS

UNABLE = "Unable to classify"


def load_champion_model() -> Dict[str, Any]:
    if not MODEL_ARTIFACT_PATH.exists():
        raise FileNotFoundError(f"Model artifact not found at {MODEL_ARTIFACT_PATH}. Run `python setup_models.py` first.")
    return joblib.load(MODEL_ARTIFACT_PATH)


def check_compatibility(df: pd.DataFrame, model_data: Dict[str, Any]) -> Dict[str, Any]:
    missing = [c for c in model_data["feature_cols"] if c not in df.columns]
    return {"compatible": not missing, "missing_features": missing, "required_features": model_data["feature_cols"]}


def _row_problems(row: pd.Series, model_data: Dict[str, Any]) -> List[str]:
    problems = []
    for c in model_data["num_cols"]:
        v = pd.to_numeric(row.get(c), errors="coerce")
        if pd.isna(v):
            problems.append(f"{c} is missing or not numeric")
    for c in model_data["cat_cols"]:
        v = row.get(c)
        if v is None or (isinstance(v, float) and np.isnan(v)) or str(v).strip() == "":
            problems.append(f"{c} is missing")
        elif str(v).strip() not in model_data.get("known_categories", {}).get(c, []):
            problems.append(f"{c}='{v}' was never seen in training")
    return problems


def risk_indicators(row: Dict[str, Any], cfg: Dict[str, Any]) -> List[str]:
    def num(k):
        v = pd.to_numeric(row.get(k), errors="coerce")
        return None if pd.isna(v) else float(v)

    out = []
    cash, intl, night = num("cash_deposit_ratio"), num("international_tx_ratio"), num("night_activity_ratio")
    ratio, age = num("in_out_ratio"), num("account_age_months")
    if cash is not None and cash >= cfg["cash_ratio"]:
        out.append(f"High cash deposit ratio ({cash:.2f} >= {cfg['cash_ratio']})")
    if intl is not None and intl >= cfg["international_ratio"]:
        out.append(f"High international transfer ratio ({intl:.2f} >= {cfg['international_ratio']})")
    if night is not None and night >= cfg["night_ratio"]:
        out.append(f"High night-time activity ({night:.2f} >= {cfg['night_ratio']})")
    if ratio is not None and cfg["passthrough_min"] <= ratio <= cfg["passthrough_max"] and age is not None and age <= cfg["young_account_months"]:
        out.append(f"Pass-through flow (in/out {ratio:.2f}) on a young account ({int(age)} months)")
    return out


def analyze_uploaded_transactions(df: pd.DataFrame, risk_config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    cfg = {**DEFAULT_RISK_CONFIG, **(risk_config or {})}
    model_data = load_champion_model()
    compat = check_compatibility(df, model_data)
    if not compat["compatible"]:
        raise ValueError(
            "Uploaded file is not compatible with the trained model. Missing required columns: "
            + ", ".join(compat["missing_features"])
        )

    pipe = model_data["pipeline"]
    feats = model_data["feature_cols"]
    pos_idx = list(pipe.classes_).index(POSITIVE_CLASS) if POSITIVE_CLASS in pipe.classes_ else None

    records, class_dist = [], {}
    flagged = high = unable = 0
    buckets = {"0.0-0.2": 0, "0.2-0.4": 0, "0.4-0.6": 0, "0.6-0.8": 0, "0.8-1.0": 0}

    valid_mask = []
    problems_all = []
    for _, row in df.iterrows():
        p = _row_problems(row, model_data)
        problems_all.append(p)
        valid_mask.append(not p)

    X = df.loc[valid_mask, feats].copy()
    for c in model_data["num_cols"]:
        X[c] = pd.to_numeric(X[c])
    for c in model_data["cat_cols"]:
        X[c] = X[c].astype(str).str.strip()
    preds = pipe.predict(X) if len(X) else []
    probas = pipe.predict_proba(X) if len(X) else []

    j = 0
    for i, (_, row) in enumerate(df.iterrows()):
        rec = {k: (None if (isinstance(v, float) and np.isnan(v)) else v) for k, v in row.to_dict().items()}
        rec.setdefault("transaction_id", rec.get("account_id", f"ROW_{i + 1}"))
        if rec.get("amount") is None and rec.get("representative_tx_amount") is not None:
            rec["amount"] = rec["representative_tx_amount"]
        if not valid_mask[i]:
            unable += 1
            rec.update(predicted_class=UNABLE, confidence=None, risk_score=None, risk_level="UNABLE",
                       flagged=False, reasons=problems_all[i])
            class_dist[UNABLE] = class_dist.get(UNABLE, 0) + 1
            records.append(rec)
            continue

        pred = str(preds[j])
        prob_vec = probas[j]
        p_risk = float(prob_vec[pos_idx]) if pos_idx is not None else 0.0
        j += 1
        indicators = risk_indicators(rec, cfg)
        is_flag = p_risk >= cfg["review_threshold"] and len(indicators) >= cfg["min_indicators"]
        level = "HIGH" if is_flag and p_risk >= cfg["high_threshold"] else ("MEDIUM" if is_flag else "LOW")
        reasons = [f"Model P(risk) = {p_risk:.3f}"] + indicators
        if p_risk >= cfg["review_threshold"] and not is_flag:
            reasons.append("Model leans risk but corroborating indicators are insufficient — not flagged.")
        flagged += int(is_flag)
        high += int(level == "HIGH")
        class_dist[pred] = class_dist.get(pred, 0) + 1
        b = min(int(p_risk * 5), 4)
        buckets[list(buckets)[b]] += 1
        rec.update(predicted_class=pred, confidence=round(float(np.max(prob_vec)), 4), risk_score=round(p_risk, 4),
                   risk_level=level, flagged=is_flag, reasons=reasons,
                   probabilities={str(c): round(float(p), 4) for c, p in zip(pipe.classes_, prob_vec)})
        records.append(rec)

    n = len(df)
    return {
        "model": model_data["champion_name"],
        "model_trained_at": model_data.get("trained_at"),
        "total_transactions": n,
        "classified": n - unable,
        "unable_to_classify": unable,
        "flagged_alerts": flagged,
        "high_risk_critical": high,
        "flagged_percentage": round(100 * flagged / max(n, 1), 2),
        "class_distribution": class_dist,
        "risk_score_distribution": buckets,
        "risk_config": cfg,
        "records": records,
        "classes": model_data["classes"],
    }
