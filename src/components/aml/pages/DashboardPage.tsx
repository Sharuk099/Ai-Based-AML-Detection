import { useState } from "react";
import {
  ShieldAlert,
  Play,
  Upload,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Database,
  FileText,
  Network,
  HelpCircle,
  Layers,
  Sparkles,
  Sliders,
  Check,
  XCircle,
  RotateCcw,
  Info,
} from "lucide-react";
import { useAml } from "../state";
import { Button } from "@/components/ui/button";
import { Panel, Stat, Chip } from "../ui";

import Papa from "papaparse";
import { audit, fingerprint } from "@/lib/aml/audit";
import type { Row } from "@/lib/aml/types";

export function DashboardPage() {
  const {
    activeDs,
    activeModel,
    addDataset,
    analysisResult,
    isAnalyzing,
    runAnalysis,
    setTab,
    riskConfig,
    updateRiskConfig,
    loadPresetDataset,
  } = useAml();

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
              <span>
                {activeModel
                  ? `${activeModel.name} · Synthetic Held-out Macro F1 ${(activeModel.report.test.macro_f1 * 100).toFixed(1)}%`
                  : "Loading model"}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              AI Anti-Money Laundering Detection System
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Multi-model classification trained offline on synthetic banking accounts covering
              structuring, velocity bursts, dormant activation, mule conduits, circular layering,
              and offshore corridors. Real-world AML accuracy is unverified.
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

        {/* Dataset Status Strip */}
        <div className="mt-6 border-t border-border/60 pt-4 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Database className="h-3.5 w-3.5 text-primary" />
            <span>
              Active Dataset:{" "}
              {activeDs ? (
                <b className="text-foreground">
                  {activeDs.name} ({activeDs.rows.length.toLocaleString()} rows)
                </b>
              ) : (
                <span className="text-warning font-bold">No dataset uploaded yet</span>
              )}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTab("upload")}
              className="text-xs h-8 font-mono font-bold text-primary border-primary/40 hover:bg-primary/10"
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload Transactions (.csv)
            </Button>
          </div>
        </div>
      </div>

      {/* Main Operational Metrics (TASK 6) */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat
          label="Total Analyzed"
          value={analysisResult ? analysisResult.totalTransactions.toLocaleString() : "—"}
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
          value={analysisResult ? analysisResult.unclassifiedCount.toLocaleString() : "—"}
          tone={analysisResult && analysisResult.unclassifiedCount > 0 ? "warn" : undefined}
        />
      </div>

      {/* Calibrated Risk Decision Thresholds (TASK 2) */}
      {(() => {
        const isOptimal =
          Math.abs(riskConfig.lowThreshold - 0.3) < 0.01 &&
          Math.abs(riskConfig.highThreshold - 0.7) < 0.01;
        return (
          <Panel
            title={
              <div className="flex flex-wrap items-center gap-2">
                <Sliders className="h-4 w-4 text-primary" />
                <span className="font-semibold">Calibrated Risk Decision Thresholds</span>
                {isOptimal ? (
                  <Chip tone="ok">✓ Optimal F1 Calibration (30% / 70%)</Chip>
                ) : (
                  <Chip tone="warn">
                    Custom Cutoffs ({(riskConfig.lowThreshold * 100).toFixed(0)}% /{" "}
                    {(riskConfig.highThreshold * 100).toFixed(0)}%)
                  </Chip>
                )}
              </div>
            }
            right={
              <span className="text-xs font-mono text-muted-foreground hidden sm:inline">
                Low: <b>&lt; {(riskConfig.lowThreshold * 100).toFixed(0)}%</b> · Med:{" "}
                <b>
                  {(riskConfig.lowThreshold * 100).toFixed(0)}%-
                  {(riskConfig.highThreshold * 100).toFixed(0)}%
                </b>{" "}
                · High: <b>&ge; {(riskConfig.highThreshold * 100).toFixed(0)}%</b>
              </span>
            }
          >
            <div className="space-y-4">
              {/* Presets and Reset Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/60 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono">Presets:</span>
                  <Button
                    size="sm"
                    variant={isOptimal ? "default" : "outline"}
                    onClick={() => updateRiskConfig({ lowThreshold: 0.3, highThreshold: 0.7 })}
                    className={`h-7 text-xs font-mono ${
                      isOptimal ? "bg-primary text-primary-foreground font-bold shadow-sm" : ""
                    }`}
                  >
                    <Sparkles className="h-3 w-3 mr-1 text-warning" /> Optimal Balanced (30% / 70%)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateRiskConfig({ lowThreshold: 0.2, highThreshold: 0.6 })}
                    className="h-7 text-xs font-mono"
                  >
                    High Sensitivity (20% / 60%)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateRiskConfig({ lowThreshold: 0.4, highThreshold: 0.8 })}
                    className="h-7 text-xs font-mono"
                  >
                    High Specificity (40% / 80%)
                  </Button>
                </div>
                {!isOptimal && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => updateRiskConfig({ lowThreshold: 0.3, highThreshold: 0.7 })}
                    className="h-7 text-xs font-mono text-primary hover:bg-primary/10"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" /> Reset to Recommended Defaults
                  </Button>
                )}
              </div>

              {/* Sliders */}
              <div className="grid gap-5 md:grid-cols-2 text-xs font-mono">
                <div className="space-y-1.5 p-3 rounded-lg border border-border/60 bg-card/40">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground font-semibold">
                      Review Flag Threshold (Medium Risk):
                    </span>
                    <span className="text-warning font-bold text-sm">
                      {(riskConfig.lowThreshold * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.10"
                    max="0.50"
                    step="0.05"
                    value={riskConfig.lowThreshold}
                    onChange={(e) => updateRiskConfig({ lowThreshold: parseFloat(e.target.value) })}
                    className="w-full cursor-pointer accent-warning"
                  />
                  <p className="text-[11px] text-muted-foreground font-sans leading-normal">
                    Transactions scoring &ge; {(riskConfig.lowThreshold * 100).toFixed(0)}% enter
                    the compliance review queue for investigator enhanced due diligence.{" "}
                    <span className="text-foreground font-medium font-mono">(Optimal: 30%)</span>
                  </p>
                </div>

                <div className="space-y-1.5 p-3 rounded-lg border border-border/60 bg-card/40">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground font-semibold">
                      Critical Alert Threshold (High Risk):
                    </span>
                    <span className="text-destructive font-bold text-sm">
                      {(riskConfig.highThreshold * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.55"
                    max="0.90"
                    step="0.05"
                    value={riskConfig.highThreshold}
                    onChange={(e) =>
                      updateRiskConfig({ highThreshold: parseFloat(e.target.value) })
                    }
                    className="w-full cursor-pointer accent-destructive"
                  />
                  <p className="text-[11px] text-muted-foreground font-sans leading-normal">
                    Transactions scoring &ge; {(riskConfig.highThreshold * 100).toFixed(0)}% trigger
                    critical alerts for urgent SAR filing and account freezing consideration.{" "}
                    <span className="text-foreground font-medium font-mono">(Optimal: 70%)</span>
                  </p>
                </div>
              </div>

              {/* Educational Explanation Box: Why this exists */}
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3.5 text-xs text-muted-foreground flex items-start gap-3">
                <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-semibold text-foreground">
                    Why Decision Thresholds Exist &amp; How They Maximize Detection Performance:
                  </span>
                  <p className="text-[11px] leading-relaxed">
                    Statistical and gradient-boosted ML models output a continuous anomaly score
                    from 0% to 100%. These thresholds set the cutoff boundaries between routine
                    normal activity, items flagged for review, and critical regulatory alerts.
                    Setting thresholds too high (e.g. 50% / 90%) results in missed suspicious
                    patterns and false negatives. The default{" "}
                    <b className="text-foreground">30% / 70%</b> calibration was statistically
                    validated on held-out test data to maximize true positive discovery and the
                    macro F1 score while preventing compliance alert fatigue.
                  </p>
                </div>
              </div>
            </div>
          </Panel>
        );
      })()}

      {analysisResult &&
        (() => {
          const a = analysisResult;
          const base = Math.max(a.classifiedCount, 1);
          const flagPct = (a.flaggedCount / base) * 100;
          const highPct = (a.highRiskCount / base) * 100;
          const level =
            highPct >= 10 || flagPct >= 25
              ? "HIGH"
              : highPct > 0 || flagPct >= 5
                ? "ELEVATED"
                : flagPct > 0
                  ? "LOW"
                  : "MINIMAL";
          const tone =
            level === "HIGH"
              ? "text-destructive"
              : level === "ELEVATED"
                ? "text-warning"
                : "text-success";
          const cycles = a.graphData?.cycles?.length ?? 0;
          const totalAmt = a.records.reduce(
            (s, r) => s + (Number(String(r["amount"] ?? "").replace(/,/g, "")) || 0),
            0,
          );
          const flaggedAmt = a.records
            .filter((r) => r["_risk_level"] === "HIGH" || r["_risk_level"] === "MEDIUM")
            .reduce((s, r) => s + (Number(String(r["amount"] ?? "").replace(/,/g, "")) || 0), 0);
          return (
            <Panel title="Overall Crime Risk Assessment · All Data">
              <div className="grid gap-4 sm:grid-cols-4">
                <div>
                  <div className="label-mono">Overall level</div>
                  <div className={`text-2xl font-bold ${tone}`}>{level}</div>
                </div>
                <div>
                  <div className="label-mono">Flagged for review</div>
                  <div className="text-xl font-semibold">{flagPct.toFixed(1)}%</div>
                  <div className="text-xs text-muted-foreground">
                    {a.flaggedCount} of {a.classifiedCount} classified
                  </div>
                </div>
                <div>
                  <div className="label-mono">High priority</div>
                  <div className="text-xl font-semibold">{a.highRiskCount}</div>
                  <div className="text-xs text-muted-foreground">
                    {highPct.toFixed(1)}% of classified
                  </div>
                </div>
                <div>
                  <div className="label-mono">Amount under review</div>
                  <div className="text-xl font-semibold">
                    {flaggedAmt.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {totalAmt > 0 ? ((flaggedAmt / totalAmt) * 100).toFixed(1) : "0.0"}% of total ·{" "}
                    {cycles} unvalidated cycles
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Summary across every analyzed record ({a.totalTransactions} total,{" "}
                {a.unclassifiedCount} unable to classify). This is a screening priority, not proof
                of crime; investigator review is required.
              </p>
            </Panel>
          );
        })()}

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
                <Button
                  size="sm"
                  onClick={() => setTab("results")}
                  className="text-xs bg-primary text-primary-foreground font-bold"
                >
                  View Scored Table <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTab("report")}
                  className="text-xs"
                >
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
                  const isRisk =
                    /^(risk|high_risk)$/i.test(cat.trim()) ||
                    /laundering|fraud|darknet|blackmail|blacklist|ponzi|tumbler/i.test(cat);
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
                  const barWidth = Math.min(
                    100,
                    (b.count / Math.max(analysisResult.totalTransactions, 1)) * 100,
                  );
                  const isHighBucket = b.range.includes("Critical") || b.range.includes("Elevated");
                  return (
                    <div key={b.range} className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground">{b.range}</span>
                        <span className="text-foreground font-bold">
                          {b.count.toLocaleString()} ({pct}%)
                        </span>
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
            Statistical models generate anomaly scores and predictive indicators. Automated alerts
            do NOT constitute a criminal accusation or definitive legal determination. Regulatory
            compliance protocols require qualified human compliance analysts to review evidence
            before initiating formal Suspicious Activity Reports (SAR).
          </p>
        </div>
      </div>
    </div>
  );
}
