#!/usr/bin/env python3
"""Train, evaluate, save and reload-verify the AML models from the bundled labeled CSV."""
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import EVALUATION_REPORT_PATH, TARGET_COL, TRAINING_DATA_PATH  # noqa: E402
from src.train_models import train_and_select_models  # noqa: E402


def main(path: str = None):
    data = Path(path) if path else TRAINING_DATA_PATH
    print("=" * 70)
    print("AML DETECTION - MODEL TRAINING")
    print("=" * 70)
    if not data.exists():
        print(f"Training file not found: {data}")
        sys.exit(1)
    df = pd.read_csv(data)
    print(f"Dataset: {data.name} ({len(df)} rows)")
    s = train_and_select_models(df, target_col=TARGET_COL, dataset_name=data.name)
    print(f"Classes: {s['class_distribution']}  Split: {s['train_size']}/{s['val_size']}/{s['test_size']}")
    print("\nLeaderboard (validation macro-F1 | held-out test macro-F1):")
    for m in s["leaderboard"]:
        if m["status"] == "completed":
            print(f"  {m['model']:<22} val {m['validation_macro_f1']:.3f} | test {m['test_macro_f1']:.3f}")
        else:
            print(f"  {m['model']:<22} not trained ({m['documentation']})")
    print(f"\nChampion: {s['champion_model']}  test balanced acc {s['test_balanced_accuracy']}  PR-AUC {s['test_pr_auc']}")
    print(f"Reload verified: {s['reload_verified']}")
    for lim in s["limitations"]:
        print(f"  ! {lim}")
    print(f"\nReport: {EVALUATION_REPORT_PATH}\nRun `python app.py` to start the server on http://localhost:5000")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
