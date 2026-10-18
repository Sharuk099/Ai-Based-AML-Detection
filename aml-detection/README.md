# AI Anti-Money Laundering (AML) Detection System

A production-ready Anti-Money Laundering Detection application with automated model preparation and pre-trained pipelines.

## Key Design Principles
- **Ready-to-Use Inference**: Users do **NOT** need to operate a training dashboard or retrain models for every transaction file.
- **One-Click Analysis Workflow**: Upload transaction CSV ➔ Click **ANALYZE TRANSACTIONS** ➔ Inspect risk alerts, graph typologies, local SHAP-style explanations, and downloadable investigation dossiers.
- **Pretrained & Reload-Verified**: Trained on documented IBM AML benchmark data (comparing Gradient Boosting, Stacking, Random Forest, and Logistic Regression with combined tabular and graph features).
- **Network Graph Intelligence**: Identifies suspicious transaction typologies: fan-in (pooling), fan-out (smurfing), pass-through mules, and circular layering loops.
- **Explainable AI (XAI)**: Local feature attributions explaining the probability shift vs reference training baseline.

---

## Project Structure
```
aml-detection/
├── app.py                      # Production Flask web application (serves all 8 pages)
├── setup_models.py             # Automatic model training, evaluation & verification script
├── config.py                   # Configuration paths and thresholds
├── requirements.txt            # Python dependencies
├── data/
│   ├── raw/                    # Raw benchmark transaction files
│   └── processed/              # Preprocessed data partitions
├── models/
│   ├── champion_aml_pipeline.joblib   # Saved fitted production pipeline
│   └── model_metadata.json            # Model parameters & schema mapping
├── reports/
│   └── evaluation_report.json  # Held-out test evaluation metrics
├── src/
│   ├── dataset_loader.py       # Obtains/generates benchmark transaction streams
│   ├── data_audit.py           # 12-category label coverage and schema auditing
│   ├── preprocessing.py        # Leakage-free scalers & stratified splitting
│   ├── feature_engineering.py  # Graph degree & tabular features
│   ├── graph_analysis.py       # NetworkX directed graph & cycle mining
│   ├── train_models.py         # Gradient Boosting, Stacking, RF & CNN experiment
│   ├── evaluation.py           # Held-out test metrics & classification reports
│   ├── explainability.py       # Local feature attribution delta calculator
│   ├── inference.py            # Pretrained inference engine
│   └── reporting.py            # Compliance investigation dossier builder
├── templates/                  # Jinja2 HTML templates for all 8 application pages
└── tests/
    └── test_pipeline.py        # Automated unit and integration tests
```

---

## Quickstart & Local Setup

### 1. Install Dependencies
```bash
cd aml-detection
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Automatic Model Setup & Verification
Run the automated initialization script once:
```bash
python setup_models.py
```
This script will:
1. Obtain the documented benchmark dataset.
2. Audit the schema and 12 intended AML categories.
3. Train Gradient Boosting, Stacking Classifier (with 5-fold out-of-fold predictions), and Random Forest.
4. Document the CNN experiment (unsupported for unordered tabular transactions).
5. Score models on a held-out test partition (Macro-F1 selection metric).
6. Verify reload parity of the saved `.joblib` artifact.
7. Save the evaluation report to `reports/evaluation_report.json`.

### 3. Start the Web Application
```bash
python app.py
```
Open [http://localhost:5000](http://localhost:5000) in your web browser.

---

## Standard User Workflow
1. Open the application dashboard.
2. Go to **Upload Transactions** and submit your CSV file (or use the built-in sample).
3. Click the prominent **ANALYZE TRANSACTIONS** button.
4. View:
   - **Prediction Results**: Scored transactions with confidence probabilities and risk alerts.
   - **Transaction Graph**: Counterparty visualization and circular layering loops.
   - **Explainable AI**: Local feature attribution waterfall showing why the transaction was flagged.
   - **Investigation Report**: Audit-ready executive dossier with regulatory notices.

---

## 12 Target AML Categories & Transparent Audit
The application monitors the 12 standard AML typologies:
1. Blackmail
2. Cyber-Security Service
3. Darknet Market
4. Centralized Exchange
5. P2P Financial Services
6. Gambling
7. Government Criminal Blacklist
8. Money Laundering
9. Ponzi Scheme
10. Mining Pool
11. Tumbler
12. Individual Wallet

Categories present in the training corpus are actively predicted with calibrated probabilities. Categories unsupported due to absence in public transaction records are clearly flagged in the Model Information registry rather than fabricated.
