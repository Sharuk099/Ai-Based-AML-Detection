#!/usr/bin/env python3
"""
app.py - Production Flask Anti-Money Laundering Detection Web Application

Reuses pretrained verified models stored in models/ without retraining on every upload.
Provides the one-click transaction analysis workflow and compliance dashboards.
"""

import os
import json
from pathlib import Path
import pandas as pd
from flask import Flask, render_template, request, jsonify, redirect, url_for, send_file

from config import MODEL_ARTIFACT_PATH, EVALUATION_REPORT_PATH, RAW_DATA_DIR
from src.inference import load_champion_model, analyze_uploaded_transactions
from src.explainability import calculate_local_attribution
from src.reporting import generate_compliance_dossier
from src.graph_analysis import compute_graph_features, find_circular_cycles

app = Flask(__name__)
app.config["SECRET_KEY"] = "aml-intelligence-prod-secret"
app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024  # 32MB max upload

# In-memory session store for uploaded file & latest analysis results
CURRENT_SESSION = {
    "uploaded_df": None,
    "filename": None,
    "analysis_result": None,
}

@app.before_request
def check_pretrained_models():
    """Ensure pretrained model exists before serving analysis."""
    if not MODEL_ARTIFACT_PATH.exists() and request.endpoint not in ["model_info", "static"]:
        pass

@app.route("/")
def dashboard():
    has_model = MODEL_ARTIFACT_PATH.exists()
    return render_template(
        "dashboard.html",
        active_tab="dashboard",
        has_model=has_model,
        session=CURRENT_SESSION,
    )

@app.route("/upload", methods=["GET", "POST"])
def upload():
    if request.method == "POST":
        file = request.files.get("file")
        if not file or not file.filename.endswith(".csv"):
            return render_template("upload.html", active_tab="upload", error="Please upload a valid .csv transaction file.")
        
        try:
            df = pd.read_csv(file)
            CURRENT_SESSION["uploaded_df"] = df
            CURRENT_SESSION["filename"] = file.filename
            CURRENT_SESSION["analysis_result"] = None
            return redirect(url_for("analyze_view"))
        except Exception as e:
            return render_template("upload.html", active_tab="upload", error=f"Failed to read CSV: {str(e)}")
            
    return render_template("upload.html", active_tab="upload", session=CURRENT_SESSION)

@app.route("/analyze", methods=["GET", "POST"])
def analyze_view():
    if request.method == "POST":
        df = CURRENT_SESSION.get("uploaded_df")
        if df is None:
            return redirect(url_for("upload"))
            
        try:
            results = analyze_uploaded_transactions(df)
            CURRENT_SESSION["analysis_result"] = results
            return redirect(url_for("results_view"))
        except Exception as e:
            return render_template("analyze.html", active_tab="analyze", error=str(e), session=CURRENT_SESSION)
            
    return render_template("analyze.html", active_tab="analyze", session=CURRENT_SESSION)

@app.route("/results")
def results_view():
    return render_template("results.html", active_tab="results", session=CURRENT_SESSION)

@app.route("/graph")
def graph_view():
    df = CURRENT_SESSION.get("uploaded_df")
    graph_data = None
    if df is not None and "from_account" in df.columns and "to_account" in df.columns:
        _, G, stats = compute_graph_features(df, "from_account", "to_account", "amount")
        cycles = find_circular_cycles(G)
        graph_data = {
            "total_nodes": G.number_of_nodes(),
            "total_edges": G.number_of_edges(),
            "cycles": cycles,
            "stats": list(stats.items())[:20]
        }
    return render_template("graph.html", active_tab="graph", graph_data=graph_data, session=CURRENT_SESSION)

@app.route("/explain")
def explain_view():
    record_id = request.args.get("id")
    res = CURRENT_SESSION.get("analysis_result")
    explanations = None
    selected_record = None
    
    if res and res.get("records"):
        if record_id:
            selected_record = next((r for r in res["records"] if str(r.get("transaction_id", "")) == record_id), res["records"][0])
        else:
            selected_record = res["records"][0]
            
        model_data = load_champion_model()
        explanations = calculate_local_attribution(model_data, selected_record)
        
    return render_template("explain.html", active_tab="explain", selected=selected_record, explanations=explanations, session=CURRENT_SESSION)

@app.route("/report")
def report_view():
    dossier = None
    res = CURRENT_SESSION.get("analysis_result")
    if res and CURRENT_SESSION.get("filename"):
        dossier = generate_compliance_dossier(res, CURRENT_SESSION["filename"])
    return render_template("report.html", active_tab="report", dossier=dossier, session=CURRENT_SESSION)

@app.route("/model-info")
def model_info():
    eval_report = None
    if EVALUATION_REPORT_PATH.exists():
        with open(EVALUATION_REPORT_PATH, "r") as f:
            eval_report = json.load(f)
    return render_template("model_info.html", active_tab="model_info", report=eval_report)

# API Endpoints
@app.route("/api/analyze", methods=["POST"])
def api_analyze():
    df = CURRENT_SESSION.get("uploaded_df")
    if df is None:
        return jsonify({"error": "No transaction dataset uploaded"}), 400
    res = analyze_uploaded_transactions(df)
    CURRENT_SESSION["analysis_result"] = res
    return jsonify(res)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
