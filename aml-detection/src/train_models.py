import time
import joblib
import pandas as pd
import numpy as np
from typing import Dict, Any, Tuple
from sklearn.ensemble import GradientBoostingClassifier, StackingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.metrics import f1_score, balanced_accuracy_score, classification_report, accuracy_score

from config import MODEL_ARTIFACT_PATH, METADATA_PATH, EVALUATION_REPORT_PATH
from src.preprocessing import build_preprocessor, split_partitions
from src.graph_analysis import compute_graph_features

def train_and_select_models(df: pd.DataFrame, target_col: str = "label") -> Dict[str, Any]:
    """
    Trains Gradient Boosting, Stacking, Random Forest, and Logistic Regression models.
    Selects the champion on validation partition, scores on held-out test data,
    verifies reload parity, and saves artifacts.
    """
    start_time = time.time()
    
    # 1. Feature Engineering (Tabular + Graph)
    sender_col = "from_account" if "from_account" in df.columns else None
    receiver_col = "to_account" if "to_account" in df.columns else None
    amount_col = "amount" if "amount" in df.columns else None
    
    if sender_col and receiver_col and amount_col:
        df_feat, _, _ = compute_graph_features(df, sender_col, receiver_col, amount_col)
    else:
        df_feat = df.copy()
        
    num_cols = ["amount"]
    for gc in ["sender_out_degree", "sender_passthrough", "receiver_in_degree", "receiver_passthrough"]:
        if gc in df_feat.columns:
            num_cols.append(gc)
            
    cat_cols = [c for c in ["currency", "payment_format"] if c in df_feat.columns]
    
    # 2. Split partitions
    train_df, val_df, test_df = split_partitions(df_feat, target_col)
    
    feature_cols = num_cols + cat_cols
    X_train, y_train = train_df[feature_cols], train_df[target_col]
    X_val, y_val = val_df[feature_cols], val_df[target_col]
    X_test, y_test = test_df[feature_cols], test_df[target_col]
    
    classes = sorted(list(y_train.unique()))
    
    # Preprocessor
    preprocessor = build_preprocessor(num_cols, cat_cols)
    
    # Define candidates
    candidates = {
        "Gradient Boosting": GradientBoostingClassifier(n_estimators=100, learning_rate=0.1, max_depth=4, random_state=42),
        "Stacking": StackingClassifier(
            estimators=[
                ("rf", RandomForestClassifier(n_estimators=50, random_state=42)),
                ("lr", LogisticRegression(max_iter=500, random_state=42)),
            ],
            final_estimator=LogisticRegression(max_iter=500),
            cv=5,
        ),
        "Random Forest": RandomForestClassifier(n_estimators=100, random_state=42),
        "Logistic Regression": LogisticRegression(max_iter=1000, random_state=42),
    }
    
    leaderboard = []
    fitted_pipelines = {}
    
    for name, clf in candidates.items():
        t0 = time.time()
        pipe = Pipeline([
            ("preprocessor", preprocessor),
            ("classifier", clf)
        ])
        pipe.fit(X_train, y_train)
        duration = round(time.time() - t0, 2)
        
        val_preds = pipe.predict(X_val)
        val_f1 = f1_score(y_val, val_preds, average="macro")
        val_bal_acc = balanced_accuracy_score(y_val, val_preds)
        
        fitted_pipelines[name] = pipe
        leaderboard.append({
            "model": name,
            "validation_macro_f1": round(val_f1, 4),
            "validation_balanced_accuracy": round(val_bal_acc, 4),
            "training_duration_seconds": duration,
            "status": "completed"
        })
        
    # CNN documented experiment
    leaderboard.append({
        "model": "Convolutional Neural Network (CNN)",
        "validation_macro_f1": None,
        "validation_balanced_accuracy": None,
        "training_duration_seconds": None,
        "status": "unsupported",
        "documentation": "Unsupported: Financial transactions are tabular records without spatial 2D locality. Applying spatial convolutions produces artificial bias."
    })
    
    # Select champion on validation Macro-F1
    completed = [m for m in leaderboard if m["status"] == "completed"]
    best_entry = max(completed, key=lambda x: x["validation_macro_f1"])
    champion_name = best_entry["model"]
    champion_pipeline = fitted_pipelines[champion_name]
    
    # 3. Held-out test evaluation
    test_preds = champion_pipeline.predict(X_test)
    test_proba = champion_pipeline.predict_proba(X_test) if hasattr(champion_pipeline, "predict_proba") else None
    
    test_f1 = round(f1_score(y_test, test_preds, average="macro"), 4)
    test_bal_acc = round(balanced_accuracy_score(y_test, test_preds), 4)
    test_acc = round(accuracy_score(y_test, test_preds), 4)
    report_dict = classification_report(y_test, test_preds, output_dict=True)
    
    # 4. Save model artifact
    artifact_payload = {
        "champion_name": champion_name,
        "pipeline": champion_pipeline,
        "feature_cols": feature_cols,
        "num_cols": num_cols,
        "cat_cols": cat_cols,
        "classes": classes,
        "reference_medians": {c: float(train_df[c].median()) for c in num_cols if c in train_df},
        "target_col": target_col,
    }
    joblib.dump(artifact_payload, MODEL_ARTIFACT_PATH)
    
    # 5. Reload verification
    reloaded = joblib.load(MODEL_ARTIFACT_PATH)
    sample_test = X_test.iloc[:20]
    p1 = champion_pipeline.predict(sample_test)
    p2 = reloaded["pipeline"].predict(sample_test)
    assert np.array_equal(p1, p2), "Model reload verification failed: predictions diverged!"
    
    total_time = round(time.time() - start_time, 2)
    
    summary = {
        "champion_model": champion_name,
        "dataset_records": len(df),
        "train_size": len(train_df),
        "val_size": len(val_df),
        "test_size": len(test_df),
        "test_macro_f1": test_f1,
        "test_balanced_accuracy": test_bal_acc,
        "test_accuracy": test_acc,
        "leaderboard": leaderboard,
        "classification_report": report_dict,
        "reload_verified": True,
        "total_elapsed_seconds": total_time,
        "artifact_path": str(MODEL_ARTIFACT_PATH),
    }
    
    import json
    with open(EVALUATION_REPORT_PATH, "w") as f:
        json.dump(summary, f, indent=2)
        
    return summary
