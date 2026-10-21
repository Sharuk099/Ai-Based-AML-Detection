import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

DATA_DIR = BASE_DIR / "data"
RAW_DATA_DIR = DATA_DIR / "raw"
PROCESSED_DATA_DIR = DATA_DIR / "processed"

MODELS_DIR = BASE_DIR / "models"
REPORTS_DIR = BASE_DIR / "reports"

for d in [RAW_DATA_DIR, PROCESSED_DATA_DIR, MODELS_DIR, REPORTS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

MODEL_ARTIFACT_PATH = MODELS_DIR / "champion_aml_pipeline.joblib"
METADATA_PATH = MODELS_DIR / "model_metadata.json"
EVALUATION_REPORT_PATH = REPORTS_DIR / "evaluation_report.json"

# Labeled training source shipped with the project (synthetic account profiles).
TRAINING_DATA_PATH = RAW_DATA_DIR / "synthetic_banking_accounts_100_50_risk_50_normal.csv"
TARGET_COL = "risk_label_synthetic"

# Account-profile features the model is trained on. Uploads must contain all of them.
NUMERIC_FEATURES = [
    "account_age_months",
    "avg_balance",
    "monthly_inflow",
    "monthly_outflow",
    "in_out_ratio",
    "txn_count_monthly",
    "cash_deposit_ratio",
    "international_tx_ratio",
    "night_activity_ratio",
]
CATEGORICAL_FEATURES = ["customer_type"]
FEATURE_COLS = CATEGORICAL_FEATURES + NUMERIC_FEATURES

# Never used as features: identifiers, label and synthetic generator metadata (leakage).
EXCLUDED_COLUMNS = [
    "account_id",
    "from_account",
    "to_account",
    "representative_timestamp",
    "pattern_type_synthetic",
    "circular_flow_indicator_synthetic",
    "rapid_pass_through_indicator_synthetic",
    "data_origin",
    TARGET_COL,
]

POSITIVE_CLASS = "risk"

# Default review policy (configurable per request). Not calibrated crime probabilities.
DEFAULT_RISK_CONFIG = {
    "review_threshold": 0.5,   # model P(risk) needed before a flag is considered
    "high_threshold": 0.8,     # P(risk) for HIGH priority
    "min_indicators": 1,       # corroborating behavioural indicators required to flag
    "cash_ratio": 0.5,
    "international_ratio": 0.4,
    "night_ratio": 0.4,
    "passthrough_min": 0.9,
    "passthrough_max": 1.1,
    "young_account_months": 6,
}

INDICATORS = {
    "fan_threshold": 10,
    "max_cycle_length": 4,
}
