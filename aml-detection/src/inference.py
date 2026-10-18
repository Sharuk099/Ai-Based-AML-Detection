import joblib
import pandas as pd
import numpy as np
from typing import Dict, Any, List
from config import MODEL_ARTIFACT_PATH
from src.graph_analysis import compute_graph_features

def load_champion_model() -> Dict[str, Any]:
    """
    Loads verified saved champion model pipeline and metadata from disk.
    """
    if not MODEL_ARTIFACT_PATH.exists():
        raise FileNotFoundError(f"Model artifact not found at {MODEL_ARTIFACT_PATH}. Run setup_models.py first.")
    return joblib.load(MODEL_ARTIFACT_PATH)

def analyze_uploaded_transactions(df: pd.DataFrame) -> Dict[str, Any]:
    """
    One-click analysis engine:
    1. Validates columns
    2. Builds graph features if sender/receiver exist
    3. Runs inference on pretrained model
    4. Computes probability distributions and risk stratification
    """
    model_data = load_champion_model()
    pipe = model_data["pipeline"]
    feature_cols = model_data["feature_cols"]
    classes = model_data["classes"]
    
    sender_col = "from_account" if "from_account" in df.columns else None
    receiver_col = "to_account" if "to_account" in df.columns else None
    amount_col = "amount" if "amount" in df.columns else None
    
    graph_stats = None
    if sender_col and receiver_col and amount_col:
        df_feat, G, graph_stats = compute_graph_features(df, sender_col, receiver_col, amount_col)
    else:
        df_feat = df.copy()
        
    # Impute missing feature columns with reference medians or defaults
    for col in feature_cols:
        if col not in df_feat.columns:
            df_feat[col] = model_data["reference_medians"].get(col, 0)
            
    X = df_feat[feature_cols]
    
    preds = pipe.predict(X)
    probas = pipe.predict_proba(X) if hasattr(pipe, "predict_proba") else None
    
    scored_records = []
    flagged_count = 0
    high_risk_count = 0
    
    for i in range(len(df)):
        row = df.iloc[i].to_dict()
        pred_cls = str(preds[i])
        max_prob = float(np.max(probas[i])) if probas is not None else 1.0
        
        is_risk = any(k in pred_cls.lower() for k in ["laundering", "fraud", "darknet", "tumbler", "ponzi", "blacklist"])
        if is_risk:
            flagged_count += 1
            risk_level = "HIGH" if max_prob > 0.65 else "MEDIUM"
        else:
            risk_level = "LOW"
            
        if risk_level == "HIGH":
            high_risk_count += 1
            
        row["predicted_class"] = pred_cls
        row["confidence"] = round(max_prob, 4)
        row["risk_level"] = risk_level
        
        scored_records.append(row)
        
    return {
        "total_transactions": len(df),
        "flagged_alerts": flagged_count,
        "high_risk_critical": high_risk_count,
        "flagged_percentage": round(100 * flagged_count / max(len(df), 1), 2),
        "records": scored_records,
        "classes": classes,
        "has_graph": bool(graph_stats is not None),
    }
