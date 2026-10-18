#!/usr/bin/env python3
"""
setup_models.py - Automated Model Preparation & Verification Pipeline

Executes the automated first-time initialization:
1. Obtains/generates the benchmark training dataset
2. Verifies schema, license, and 12-category coverage
3. Fits Gradient Boosting, Stacking, Random Forest, and Logistic Regression
4. Evaluates on held-out test data
5. Saves fitted pipelines to models/
6. Reloads and verifies inference parity
7. Generates machine-readable evaluation reports
"""

import sys
import os
import json
import pandas as pd
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import RAW_DATA_DIR, MODEL_ARTIFACT_PATH, EVALUATION_REPORT_PATH
from src.dataset_loader import generate_benchmark_dataset
from src.data_audit import audit_dataset
from src.train_models import train_and_select_models

def main():
    print("=" * 70)
    print("AI ANTI-MONEY LAUNDERING DETECTION - AUTOMATED MODEL SETUP")
    print("=" * 70)
    
    # Step 1: Obtain Dataset
    print("\n[Step 1/6] Preparing documented benchmark transaction dataset...")
    data_file = RAW_DATA_DIR / "benchmark_transactions.csv"
    if not data_file.exists():
        print(f"Generating benchmark transaction stream into {data_file}...")
        generate_benchmark_dataset(n_samples=3000, output_filename="benchmark_transactions.csv")
    print(f"Dataset ready at: {data_file}")
    
    # Step 2: Audit Schema & Labels
    print("\n[Step 2/6] Auditing dataset schema and 12 intended AML categories...")
    df = pd.read_csv(data_file)
    audit = audit_dataset(df)
    print(f"Total Records: {audit['total_records']:,}")
    print(f"Detected Roles: {audit['roles']}")
    print(f"Supported Categories in data: {audit['supported_12_categories']}")
    print(f"Unsupported Categories (data unavailable): {len(audit['unsupported_12_categories'])} categories")
    print(f"Graph Analytics Supported: {audit['graph_supported']}")
    
    # Step 3: Train & Select Models
    print("\n[Step 3/6] Training Candidate Models (Gradient Boosting, Stacking, Random Forest)...")
    summary = train_and_select_models(df, target_col="label")
    
    # Step 4: Leaderboard & Selection
    print("\n[Step 4/6] Validation Leaderboard Results:")
    for entry in summary["leaderboard"]:
        if entry["status"] == "completed":
            print(f"  • {entry['model']:<25} | Val Macro-F1: {entry['validation_macro_f1']} | Train Time: {entry['training_duration_seconds']}s")
        else:
            print(f"  • {entry['model']:<25} | Status: UNSUPPORTED (Tabular transaction data unsuitable for spatial CNN)")
            
    print(f"\nChampion Model Selected: {summary['champion_model']}")
    print(f"Held-Out Test Macro-F1:  {summary['test_macro_f1']}")
    print(f"Held-Out Balanced Acc:   {summary['test_balanced_accuracy']}")
    
    # Step 5: Reload Verification
    print("\n[Step 5/6] Verifying Saved Artifact Reload Parity...")
    if summary["reload_verified"]:
        print("✓ Reload Verification Passed: Serialized artifact yields identical predictions.")
    else:
        print("✗ Verification Failed!")
        sys.exit(1)
        
    # Step 6: Finalize
    print("\n[Step 6/6] Saved Artifacts:")
    print(f"  • Model Pipeline:   {summary['artifact_path']}")
    print(f"  • Evaluation Audit: {EVALUATION_REPORT_PATH}")
    
    print("\n" + "=" * 70)
    print("SUCCESS: PRETRAINED MODELS READY FOR PRODUCTION INFERENCE")
    print("Run `python app.py` to start the Flask web application.")
    print("=" * 70)

if __name__ == "__main__":
    main()
