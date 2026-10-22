# AI-Based Anti-Money Laundering (AML) Detection

An investigator workbench for screening banking accounts and transactions for money-laundering risk. It combines machine-learning classifiers, transaction-graph analysis, explainable AI and AI-written investigation reports, all in one browser app. A standalone Python/Flask version is included.

> **Important:** This tool screens records and prioritises them for review. It does **not** prove a crime. Every flag needs a qualified AML investigator to review it before any regulatory filing (SAR/STR). The bundled models were trained on **synthetic** data, so their test scores do not show how well they work on real bank data.

---

## 1. What the app does

| Capability | Description |
|---|---|
| CSV upload & schema audit | Checks columns, missing values, types and leakage risks before analysis |
| Transaction → account aggregation | Turns raw transaction logs into account-level features automatically |
| ML classification | Gradient Boosted Trees, Random Forest, Logistic Regression and Stacking, run together for consensus |
| Risk stratification | Separate review policy: model probability **plus** corroborating indicators → LOW / MEDIUM / HIGH |
| "Unable to classify" | Rows with missing, invalid or never-seen inputs are refused. Values are never invented |
| Graph analytics | Accounts = nodes, transactions = edges; fan-in/fan-out, pass-through, circular flows shown in 2D/3D |
| Explainable AI (XAI) | Per-feature contributions and plain-language reasons for every score |
| AI investigation | AI-written narrative: what the problem is, which accounts need investigation and why |
| Overall crime risk | Dashboard summary across all data: overall level, % flagged, high-priority count, amount under review |
| Reports | Print / save as PDF, download HTML, JSON, CSV, Markdown; save dossiers to a local archive |
| Model information | Read-only details: algorithms, held-out metrics, confusion matrix, limitations |

## 2. Benefits

- **Faster triage:** investigators start with the highest-priority accounts instead of reading every row.
- **Explainable decisions:** every flag comes with its reasons, which supports audit trails and regulator questions.
- **Fewer false alarms:** a flag needs model evidence *and* behavioural indicators, not just one signal.
- **Network insight:** shows mule chains, fan-in/fan-out patterns and circular flows that row-by-row review misses.
- **Honest output:** no demo or fake results. Unreliable rows are marked "Unable to classify".
- **Ready-made reports:** downloadable investigation dossiers save hours of manual write-up.

## 3. Applications

- Bank and fintech compliance teams (transaction monitoring, alert triage)
- Payment processors and wallets (mule-account detection)
- Auditors and forensic accountants (network and flow investigations)
- Regulators and FIUs (reviewing submitted data)
- Training and education (teaching AML typologies with synthetic data)
- Research (benchmarking tabular and graph AML methods)

## 4. User guide

### Step 1: Upload
Open **Upload Transactions**, then drag and drop a CSV. You can download the template from the same page. Two formats are accepted:

**Account profile format** (model features):
`customer_type, account_age_months, avg_balance, monthly_inflow, monthly_outflow, in_out_ratio, txn_count_monthly, cash_deposit_ratio, international_tx_ratio, night_activity_ratio`

**Raw transaction format** (aggregated automatically):
`transaction_id, from_account, to_account, amount, currency, payment_format, timestamp`

### Step 2: Analyze
Open **Analyze Transactions** and click **Analyze Transactions**. The app runs six stages: schema validation, model loading, prediction, graph topology, explanations and risk stratification.

### Step 3: Review
- **Dashboard:** totals, classified / flagged / unable counts, and the overall crime risk assessment.
- **Prediction Results:** a per-record table with risk level and reasons. Click a row's AI button for an explanation of that transaction.
- **3D Transaction Graph:** explore the account network and unvalidated circular flows.
- **Explainable AI:** see which features drove each score.
- **SAR Investigation & AI:** accounts under investigation, the AI narrative, and custom questions.
- **Model Information:** algorithms, validation metrics and limitations.

### Step 4: Report
From the report page, print or save as PDF, download HTML, JSON, CSV or Markdown, or save the dossier to the archive.

### How to read results
- **LOW:** no review needed under the current policy.
- **MEDIUM:** review recommended.
- **HIGH:** priority review.
- **Unable to classify:** the input was incomplete or not supported. Fix the data and run the analysis again.
- **Circular flow:** a circular flow is not evidence of laundering on its own. It needs other evidence to back it up.

## 5. Models and algorithms

- **Classifiers:** Gradient Boosted Decision Trees, Random Forest, multinomial Logistic Regression, Stacking ensemble.
- **Training:** stratified 70/15/15 train/validation/test split. Preprocessing and graph statistics are fitted on training rows only.
- **Metrics:** precision, recall, F1, balanced accuracy, PR-AUC and a confusion matrix, all on held-out data.
- **Graph:** directed weighted graph, bounded simple-cycle search, flow ratios, fan-in/fan-out.
- **Explanations:** permutation importance and local reference-perturbation attributions.
- **Not used:** CNNs and GNNs, which suit images and large graphs rather than this tabular setup.

## 6. Running the web app

```sh
npm install      # or: bun install
npm run dev      # http://localhost:8080
npx vitest run   # tests
```

Optional AI narratives use the `GEMINI_API_KEY` server secret. Without it, the app falls back to rule-based reports.

## 7. Running the Python / Flask version

```sh
cd aml-detection
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python setup_models.py        # trains and saves models to models/
python app.py                 # http://localhost:5000
python -m unittest discover -s tests
```

REST endpoints: `/api/health`, `/api/models`, `/api/upload`, `/api/analyze`, `/api/graph`, `/api/explain`, `/api/train`.

## 8. Project structure

```text
src/routes/            App pages (TanStack Start)
src/components/aml/    Dashboard, upload, results, graph, XAI, report, AI panels
src/lib/aml/           Preprocessing, models, inference, risk, graph, metrics
src/server/            AI investigation endpoint
aml-detection/         Standalone Python + Flask project (models, tests, templates)
public/                Sample synthetic CSVs and template
```

## 9. Limitations

- Bundled models are trained on synthetic accounts. Retrain them on labelled institutional data before production use.
- Data comes in as CSV batches only. There is no live core-banking connection.
- No sanctions, PEP or watch-list screening is included.
- Risk thresholds and indicator rules are policy settings, not calibrated crime probabilities.
- Saved dossiers stay in the browser's local storage.

## 10. Technology

React 19, TanStack Start, Vite, Tailwind CSS v4, Three.js (3D graph), TypeScript ML engine, Python (scikit-learn, pandas, NetworkX, Flask).

Built with [Lovable](https://lovable.dev).
