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

INTENDED_CATEGORIES = [
    "Blackmail",
    "Cyber-Security Service",
    "Darknet Market",
    "Centralized Exchange",
    "P2P Financial Services",
    "Gambling",
    "Government Criminal Blacklist",
    "Money Laundering",
    "Ponzi Scheme",
    "Mining Pool",
    "Tumbler",
    "Individual Wallet",
]

INDICATORS = {
    "fan_threshold": 10,
    "passthrough_min": 0.9,
    "passthrough_max": 1.1,
    "max_cycle_length": 4,
}
