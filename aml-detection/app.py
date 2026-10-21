#!/usr/bin/env python3
"""Flask AML Detection server: HTML portal + JSON REST API (used by the React app).

Run `python setup_models.py` once, then `python app.py` (http://localhost:5000).
"""
import io
import json
import os

import pandas as pd
from flask import Flask, jsonify, redirect, render_template, request, url_for

try:
    from flask_cors import CORS
except ImportError:  # optional dependency
    CORS = None

from config import EVALUATION_REPORT_PATH, MODEL_ARTIFACT_PATH, TARGET_COL, TRAINING_DATA_PATH
from src.explainability import calculate_local_attribution
from src.graph_analysis import compute_graph_features, describe_cycles, find_circular_cycles
from src.inference import analyze_uploaded_transactions, check_compatibility, load_champion_model
from src.reporting import generate_compliance_dossier

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("AML_SECRET_KEY", "change-me-in-production")
app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024
if CORS:
    CORS(app, resources={r"/api/*": {"origins": os.environ.get("AML_CORS_ORIGINS", "*")}})

CURRENT_SESSION = {"uploaded_df": None, "filename": None, "analysis_result": None}


def _read_eval_report():
    if EVALUATION_REPORT_PATH.exists():
        with open(EVALUATION_REPORT_PATH) as f:
            return json.load(f)
    return None


def _df_from_request():
    """Accept multipart `file`, JSON {rows:[...]} or raw CSV body."""
    if "file" in request.files:
        f = request.files["file"]
        return pd.read_csv(f), f.filename
    payload = request.get_json(silent=True)
    if payload and isinstance(payload.get("rows"), list):
        return pd.DataFrame(payload["rows"]), payload.get("filename", "api_upload.csv")
    body = request.get_data(as_text=True)
    if body.strip():
        return pd.read_csv(io.StringIO(body)), "api_upload.csv"
    return None, None


def _graph_payload(df):
    if df is None or not {"from_account", "to_account"}.issubset(df.columns):
        return None
    amount_col = "amount" if "amount" in df.columns else ("representative_tx_amount" if "representative_tx_amount" in df.columns else None)
    work = df.copy()
    if amount_col is None:
        work["__amt"] = 1.0
        amount_col = "__amt"
    _, G, stats = compute_graph_features(work, "from_account", "to_account", amount_col)
    cycles = find_circular_cycles(G)
    top = sorted(stats.items(), key=lambda kv: kv[1]["in_degree"] + kv[1]["out_degree"], reverse=True)[:20]
    return {
        "total_nodes": G.number_of_nodes(),
        "total_edges": G.number_of_edges(),
        "cycles": cycles,
        "cycle_evidence": describe_cycles(G, cycles),
        "stats": top,
        "nodes_represent": "accounts",
        "edges_represent": "aggregated transfers (from_account -> to_account)",
    }


# ---------------- HTML portal ----------------
@app.route("/")
def dashboard():
    return render_template("dashboard.html", active_tab="dashboard", has_model=MODEL_ARTIFACT_PATH.exists(), session=CURRENT_SESSION)


@app.route("/upload", methods=["GET", "POST"])
def upload():
    if request.method == "POST":
        file = request.files.get("file")
        if not file or not file.filename.lower().endswith(".csv"):
            return render_template("upload.html", active_tab="upload", error="Please upload a valid .csv file.", session=CURRENT_SESSION)
        try:
            CURRENT_SESSION.update(uploaded_df=pd.read_csv(file), filename=file.filename, analysis_result=None)
            return redirect(url_for("analyze_view"))
        except Exception as e:
            return render_template("upload.html", active_tab="upload", error=f"Failed to read CSV: {e}", session=CURRENT_SESSION)
    return render_template("upload.html", active_tab="upload", session=CURRENT_SESSION)


@app.route("/analyze", methods=["GET", "POST"])
def analyze_view():
    if request.method == "POST":
        df = CURRENT_SESSION.get("uploaded_df")
        if df is None:
            return redirect(url_for("upload"))
        try:
            CURRENT_SESSION["analysis_result"] = analyze_uploaded_transactions(df)
            return redirect(url_for("results_view"))
        except Exception as e:
            return render_template("analyze.html", active_tab="analyze", error=str(e), session=CURRENT_SESSION)
    return render_template("analyze.html", active_tab="analyze", session=CURRENT_SESSION)


@app.route("/results")
def results_view():
    return render_template("results.html", active_tab="results", session=CURRENT_SESSION)


@app.route("/graph")
def graph_view():
    return render_template("graph.html", active_tab="graph", graph_data=_graph_payload(CURRENT_SESSION.get("uploaded_df")), session=CURRENT_SESSION)


@app.route("/explain")
def explain_view():
    record_id = request.args.get("id")
    res = CURRENT_SESSION.get("analysis_result")
    explanations, selected = None, None
    if res and res.get("records"):
        recs = res["records"]
        selected = next((r for r in recs if str(r.get("transaction_id")) == record_id), recs[0]) if record_id else recs[0]
        explanations = calculate_local_attribution(load_champion_model(), selected)
    return render_template("explain.html", active_tab="explain", selected=selected, explanations=explanations, session=CURRENT_SESSION)


@app.route("/report")
def report_view():
    res = CURRENT_SESSION.get("analysis_result")
    dossier = generate_compliance_dossier(res, CURRENT_SESSION["filename"]) if res and CURRENT_SESSION.get("filename") else None
    return render_template("report.html", active_tab="report", dossier=dossier, session=CURRENT_SESSION)


@app.route("/model-info")
def model_info():
    return render_template("model_info.html", active_tab="model_info", report=_read_eval_report())


# ---------------- JSON REST API ----------------
@app.get("/api/health")
def api_health():
    return jsonify({"status": "ok", "model_ready": MODEL_ARTIFACT_PATH.exists()})


@app.get("/api/models")
def api_models():
    report = _read_eval_report()
    if not report:
        return jsonify({"error": "No trained model. Run setup_models.py or POST /api/train."}), 404
    return jsonify(report)


@app.post("/api/upload")
def api_upload():
    df, name = _df_from_request()
    if df is None:
        return jsonify({"error": "No CSV provided"}), 400
    CURRENT_SESSION.update(uploaded_df=df, filename=name, analysis_result=None)
    compat = check_compatibility(df, load_champion_model()) if MODEL_ARTIFACT_PATH.exists() else None
    return jsonify({"filename": name, "rows": len(df), "columns": list(df.columns), "compatibility": compat})


@app.post("/api/analyze")
def api_analyze():
    df, name = _df_from_request()
    if df is None:
        df, name = CURRENT_SESSION.get("uploaded_df"), CURRENT_SESSION.get("filename")
    if df is None:
        return jsonify({"error": "No dataset provided"}), 400
    payload = request.get_json(silent=True) or {}
    try:
        res = analyze_uploaded_transactions(df, payload.get("risk_config"))
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 503
    except ValueError as e:
        return jsonify({"error": str(e)}), 422
    res["graph"] = _graph_payload(df)
    CURRENT_SESSION.update(uploaded_df=df, filename=name, analysis_result=res)
    return jsonify(res)


@app.post("/api/graph")
def api_graph():
    df, _ = _df_from_request()
    df = df if df is not None else CURRENT_SESSION.get("uploaded_df")
    g = _graph_payload(df)
    if g is None:
        return jsonify({"error": "Graph needs from_account and to_account columns"}), 422
    return jsonify(g)


@app.post("/api/explain")
def api_explain():
    payload = request.get_json(silent=True) or {}
    record = payload.get("record")
    if not record:
        return jsonify({"error": "Provide {record: {...}}"}), 400
    attr = calculate_local_attribution(load_champion_model(), record)
    if not attr:
        return jsonify({"error": "Record is missing required model features; cannot explain."}), 422
    return jsonify({"method": "reference perturbation (training median/mode)", "attributions": attr})


@app.post("/api/train")
def api_train():
    from src.train_models import train_and_select_models
    df, name = _df_from_request()
    if df is None:
        df, name = pd.read_csv(TRAINING_DATA_PATH), TRAINING_DATA_PATH.name
    target = request.args.get("target", TARGET_COL)
    try:
        return jsonify(train_and_select_models(df, target_col=target, dataset_name=name))
    except ValueError as e:
        return jsonify({"error": str(e)}), 422


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=os.environ.get("FLASK_DEBUG") == "1")
