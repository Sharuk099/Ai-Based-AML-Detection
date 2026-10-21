"""Local reference-perturbation attribution (not SHAP).

For each feature, replace the record's value with the training-set reference (median for
numbers, mode for categories) and measure the change in P(predicted class).
"""
from typing import Any, Dict, List

import numpy as np
import pandas as pd


def calculate_local_attribution(model_data: Dict[str, Any], record: Dict[str, Any]) -> List[Dict[str, Any]]:
    pipe = model_data["pipeline"]
    feats = model_data["feature_cols"]
    ref = {**model_data.get("reference_medians", {}), **model_data.get("reference_mode", {})}
    missing = [c for c in feats if record.get(c) is None or str(record.get(c)).strip() == ""]
    if missing:
        return []
    obs = pd.DataFrame([{c: record[c] for c in feats}])
    for c in model_data["num_cols"]:
        obs[c] = pd.to_numeric(obs[c], errors="coerce")
    if obs[model_data["num_cols"]].isna().any(axis=None):
        return []
    base = pipe.predict_proba(obs)[0]
    idx = int(np.argmax(base))
    out = []
    for c in feats:
        cf = obs.copy()
        cf[c] = ref.get(c)
        delta = float(base[idx] - pipe.predict_proba(cf)[0][idx])
        out.append({"feature": c, "value": str(record.get(c)), "baseline": str(ref.get(c)),
                    "contribution_delta": round(delta, 4)})
    return sorted(out, key=lambda x: abs(x["contribution_delta"]), reverse=True)
