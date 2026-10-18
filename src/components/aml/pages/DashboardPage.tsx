import { useState } from "react";
import { ShieldAlert, Play, Upload, CheckCircle2, AlertTriangle, ArrowRight, Database, FileText, Network, HelpCircle, Layers, Sparkles, Sliders, Check, XCircle } from "lucide-react";
import { useAml } from "../state";
import { Button } from "@/components/ui/button";
import { Panel, Stat, Chip } from "../ui";
import { syntheticCsv, generateOrdinaryCsv, generateSuspiciousCsv } from "../synthetic";
import Papa from "papaparse";
import { audit, fingerprint } from "@/lib/aml/audit";
import type { Row } from "@/lib/aml/types";

export function DashboardPage() {
  const { activeDs, activeModel, addDataset, analysisResult, isAnalyzing, runAnalysis, setTab, riskConfig, updateRiskConfig } = useAml();
  const [loadingType, setLoadingType] = useState<string | null>(null);

  const loadDataset = async (type: "ordinary" | "suspicious" | "mixed") => {
    setLoadingType(type);
    try {
      let csv = "";
      let name = "";
      let prov = "";
      if (type === "ordinary") {
        csv = generateOrdinaryCsv(1000);
        name = "1000_ordinary_transactions.csv";
        prov = "1,000 synthetic ordinary transactions (Card/ACH, consumer amounts, no laundering)";
      } else if (type === "suspicious") {
        csv = generateSuspiciousCsv(200);
        name = "200_suspicious_patterns.csv";
        prov = "200 synthetic suspicious transactions (structuring $9,000-$9,900, layering mules, loops)";
      } else {
        csv = syntheticCsv(2500);
        name = "mixed_aml_benchmark.csv";
        prov = "2,500 mixed benchmark records (75% individual wallet, 15% exchange, 10% AML)";
      }

      const res = Papa.parse<Row>(csv, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
      const columns = (res.meta.fields || []).filter(Boolean);
      const ds = {
        name,
        rows: res.data,
        columns,
        audit: audit(res.data, columns, name),
        fingerprint: await fingerprint(csv.slice(0, 5_000_000)),
        provenance: prov,
        license: "Public Domain / CC0",
      };
      addDataset(ds);
    } finally {
      setLoadingType(null);
    }
  };

  const handleAnalyzeClick = async () => {
    if (!activeDs) {
      setTab("upload");
      return;
    }
    const ok = await runAnalysis();
    if (ok) {
      setTab("results");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Status & Quick Action */}
      <div className="panel relative overflow-hidden border-primary/40 bg-gradient-to-br from-card via-card to-primary/10 p-6 md:p-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 font-mono text-xs text-primary">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              <span>Pretrained Production Model · Verified</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              AI Anti-Money Laundering Detection System
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Separates machine-learning class predictions from multi-factor risk scoring. Incorporates transaction structuring detection, counterparty graph analysis, and SHAP-style local explainability with zero client-side training requirement.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              size="lg"
              onClick={handleAnalyzeClick}
              disabled={isAnalyzing}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold px-6 shadow-lg shadow-primary/20 text-sm tracking-wide"
            >
              <Play className="mr-2 h-4 w-4 fill-current" />
              {isAnalyzing ? "Analyzing Transactions..." : "ANALYZE TRANSACTIONS"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => setTab("upload")}
              className="border-border text-foreground hover:bg-muted text-sm font-medium"
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload CSV
            </Button>
          </div>
        </div>

        {/* Quick Benchmark Loaders (TASK 5) */}
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border/50 pt-4 text-xs font-mono">
          <span className="text-muted-foreground flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Test Benchmarks:
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={loadingType !== null}
            onClick={() => loadDataset("ordinary")}
            className="text-xs h-7 border-border hover:bg-card"
          >
            {loadingType === "ordinary" ? "Loading..." : "1,000 Ordinary Transactions"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={loadingType !== null}
            onClick={() => loadDataset("suspicious")}
            className="text-xs h-7 border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            {loadingType === "suspicious" ? "Loading..." : "200 Known Suspicious Patterns"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={loadingType !== null}
            onClick={() => loadDataset("mixed")}
            className="text-xs h-7 border-border hover:bg-card"
          >
            {loadingType === "mixed" ? "Loading..." : "2,500 Mixed Benchmark"}
          </Button>
        </div>
      </div>

      {/* Main Operational Metrics (TASK 6) */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat
          label="Total Analyzed"
          value={analysisResult ? analysisResult.totalTransactions.toLocaleString() : activeDs ? activeDs.rows.length.toLocaleString() : "0"}
        />
        <Stat
          label="Successfully Classified"
          value={analysisResult ? analysisResult.classifiedCount.toLocaleString() : "—"}
          tone={analysisResult ? "ok" : undefined}
        />
        <Stat
          label="Flagged for Review"
          value={analysisResult ? analysisResult.flaggedCount.toLocaleString() : "—"}
          tone={analysisResult && analysisResult.flaggedCount > 0 ? "warn" : "ok"}
        />
        <Stat
          label="High Risk Critical"
          value={analysisResult ? analysisResult.highRiskCount.toLocaleString() : "—"}
          tone={analysisResult && analysisResult.highRiskCount > 0 ? "bad" : "ok"}
        />
        <Stat
          label="Insufficient Evidence"
          value={analysisResult ? analysisResult.unclassifiedCount.toLocaleString() : "0"}
          tone={analysisResult && analysisResult.unclassifiedCount > 0 ? "warn" : undefined}
        />
      </div>

      {/* Configurable Risk Thresholds Bar (TASK 2) */}
      <Panel
        title={
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-primary" />
            <span>Configurable Risk Decision Thresholds</span>
          </div>
        }
        right={
          <span className="text-xs font-mono text-muted-foreground">
            Low: <b>&lt; {(riskConfig.lowThreshold * 100).toFixed(0)}%</b> · Med: <b>{(riskConfig.lowThreshold * 100).toFixed(0)}%-{(riskConfig.highThreshold * 100).toFixed(0)}%</b> · High: <b>&ge; {(riskConfig.highThreshold * 100).toFixed(0)}%</b>
          </span>
        }
      >
        <div className="grid gap-4 md:grid-cols-2 text-xs font-mono">
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Review Flag Threshold (Medium Risk):</span>
              <span className="text-foreground font-bold">{(riskConfig.lowThreshold * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.10"
              max="0.50"
              step="0.05"
              value={riskConfig.lowThreshold}
              onChange={(e) => updateRiskConfig({ lowThreshold: parseFloat(e.target.value) })}
              className="w-full cursor-pointer accent-primary"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Critical Alert Threshold (High Risk):</span>
              <span className="text-foreground font-bold">{(riskConfig.highThreshold * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.55"
              max="0.90"
              step="0.05"
              value={riskConfig.highThreshold}
              onChange={(e) => updateRiskConfig({ highThreshold: parseFloat(e.target.value) })}
              className="w-full cursor-pointer accent-destructive"
            />
          </div>
        </div>
      </Panel>

      {/* Analysis Results Spotlight if already executed */}
      {analysisResult ? (
        <div className="space-y-6">
          <Panel
            title={
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-primary" />
                <span>Screening Breakdown · {analysisResult.datasetName}</span>
              </div>
            }
            right={
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setTab("results")} className="text-xs bg-primary text-primary-foreground font-bold">
                  View Scored Table <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => setTab("report")} className="text-xs">
                  Investigation Report
                </Button>
              </div>
            }
          >
            {/* Predicted Class Distribution (TASK 6) */}
            <div className="mb-6">
              <div className="label-mono mb-2">Predicted Classification Distribution:</div>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 font-mono text-xs">
                {Object.entries(analysisResult.categoryBreakdown).map(([cat, count]) => {
                  const pct = ((count / analysisResult.totalTransactions) * 100).toFixed(1);
                  const isRisk = /laundering|fraud|darknet|blackmail|blacklist|ponzi|tumbler/i.test(cat);
                  const isUnclassified = cat.toLowerCase().includes("unable");
                  return (
                    <div
                      key={cat}
                      className={`panel p-3 ${
                        isRisk
                          ? "border-destructive/40 bg-destructive/10 text-destructive"
                          : isUnclassified
                          ? "border-warning/40 bg-warning/10 text-warning"
                          : "border-border bg-card text-foreground"
                      }`}
                    >
                      <div className="text-[11px] text-muted-foreground truncate">{cat}</div>
                      <div className="text-lg font-bold mt-1">{count.toLocaleString()}</div>
                      <div className="text-[10px] opacity-80">{pct}% of batch</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Risk Score Distribution Histogram (TASK 6) */}
            <div className="border-t border-border pt-4">
              <div className="label-mono mb-2">Risk Score Distribution (0.0 to 1.0):</div>
              <div className="space-y-2 font-mono text-xs">
                {analysisResult.riskBuckets.map((b) => {
                  const pct = ((b.count / analysisResult.totalTransactions) * 100).toFixed(1);
                  const barWidth = Math.min(100, (b.count / Math.max(analysisResult.totalTransactions, 1)) * 100);
                  const isHighBucket = b.range.includes("Critical") || b.range.includes("Elevated");
                  return (
                    <div key={b.range} className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground">{b.range}</span>
                        <span className="text-foreground font-bold">{b.count.toLocaleString()} ({pct}%)</span>
                      </div>
                      <div className="h-2 w-full rounded bg-muted/40 overflow-hidden flex">
                        <div
                          className={`h-full ${isHighBucket ? "bg-destructive" : "bg-primary"}`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Panel>
        </div>
      ) : null}

      {/* Disclaimers & Regulatory Warning */}
      <div className="flex items-start gap-3 rounded border border-border/80 bg-card/60 p-4 text-xs text-muted-foreground">
        <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
        <div className="space-y-1 leading-relaxed">
          <strong className="text-foreground">Compliance & Decision Policy:</strong>
          <p>
            Statistical models generate anomaly scores and predictive indicators. Automated alerts do NOT constitute a criminal accusation or definitive legal determination. Regulatory compliance protocols require qualified human compliance analysts to review evidence before initiating formal Suspicious Activity Reports (SAR).
          </p>
        </div>
      </div>
    </div>
  );
}
