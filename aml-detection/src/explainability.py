import numpy as np
import pandas as pd
from typing import Dict, Any, List

def calculate_local_attribution(model_data: Dict[str, Any], record: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Computes local feature attribution vs baseline reference medians.
    Shows the delta shift in predicted class confidence for each attribute.
    """
    pipe = model_data["pipeline"]
    feature_cols = model_data["feature_cols"]
    medians = model_data["reference_medians"]
    
    # Base observation
    obs_df = pd.DataFrame([{col: record.get(col, medians.get(col, 0)) for col in feature_cols}])
    base_probs = pipe.predict_proba(obs_df)[0]
    pred_idx = np.argmax(base_probs)
    base_target_prob = base_probs[pred_idx]
    
    attributions = []
    for col in feature_cols:
        # Counterfactual: reset this column to reference baseline median
        cf_df = obs_df.copy()
        cf_df[col] = medians.get(col, 0)
        cf_probs = pipe.predict_proba(cf_df)[0]
        cf_target_prob = cf_probs[pred_idx]
        
        delta = float(base_target_prob - cf_target_prob)
        attributions.append({
            "feature": col,
            "value": str(record.get(col, "—")),
            "baseline": str(medians.get(col, 0)),
            "contribution_delta": round(delta, 4)
        })
        
    return sorted(attributions, key=lambda x: abs(x["contribution_delta"]), reverse=True)
