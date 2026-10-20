import { useState } from "react";
import {
  Play,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ShieldAlert,
  Cpu,
  Network,
  FileSpreadsheet,
  AlertTriangle,
} from "lucide-react";
import { useAml } from "../state";
import { Button } from "@/components/ui/button";
import { Panel, Stat, Note, Chip } from "../ui";

export function AnalyzePage() {
  const { activeDs, activeModel, isAnalyzing, analyzeError, runAnalysis, analysisResult, setTab } =
    useAml();
  const [completedSteps, setCompletedSteps] = useState<number>(analysisResult ? 6 : 0);

  const handleStartAnalysis = async () => {
    if (!activeDs) return;
    setCompletedSteps(1);
    const success = await runAnalysis();
    if (success) {
      setCompletedSteps(6);
    }
  };

  if (!activeDs) {
    return (
      <div className="space-y-4">
        <Panel title="Analyze Transactions">
          <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
            <FileSpreadsheet className="h-12 w-12 text-muted-foreground/40" />
            <h3 className="text-base font-semibold text-foreground">
              No Transaction Dataset Loaded
            </h3>
            <p className="max-w-md text-xs text-muted-foreground">
              Please upload a transaction CSV file before running analysis.
            </p>
            <Button
              onClick={() => setTab("upload")}
              className="mt-2 bg-primary text-primary-foreground"
            >
              Go to Upload Transactions
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  const steps = [
    {
      title: "Input Schema & Column Mapping Validation",
      desc: `Inspecting ${activeDs.columns.length} columns against model requirements`,
    },
    {
      title: "Load Saved Trained Pipeline",
      desc: `Loaded ${activeModel?.name || "No model selected"}`,
    },
    {
      title: "Multi-Class Predictive Inference",
      desc: `Scoring ${activeDs.rows.length.toLocaleString()} rows into AML typology classes`,
    },
    {
      title: "Directed Graph Topology & Typology Mining",
      desc: "Evaluating counterparty degree, smurfing, pass-through mules, and circular loops",
    },
    {
      title: "Local Explainable AI Attributions",
      desc: "Calculating feature contribution deltas vs training reference baseline",
    },
    {
      title: "Compliance Alert & Risk Stratification",
      desc: "Generating high/medium risk flags and exportable investigation dossier",
    },
  ];

  return (
    <div className="space-y-6">
      {!activeModel && (
        <Note>
          No trained model is available. Upload labeled transactions and open Train Models first.
        </Note>
      )}
      {/* Execution Hero Card */}
      <Panel
        title="One-Click Anti-Money Laundering Analysis"
        right={
          <span className="text-xs font-mono text-muted-foreground">
            Target File: <b className="text-foreground">{activeDs.name}</b>
          </span>
        }
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-2">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-foreground">Execute AML Review Pipeline</h2>
            <p className="text-xs text-muted-foreground max-w-xl">
              Applies the trained machine learning pipeline and graph analytics directly to your
              uploaded data without requiring any manual model re-training.
            </p>
          </div>

          <Button
            size="lg"
            onClick={handleStartAnalysis}
            disabled={isAnalyzing || !activeModel}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold px-8 shadow-lg shadow-primary/20 text-sm tracking-wide"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing {activeDs.rows.length.toLocaleString()} Records...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4 fill-current" />
                ANALYZE TRANSACTIONS
              </>
            )}
          </Button>
        </div>

        {analyzeError && (
          <div className="mt-4">
            <Note kind="err">{analyzeError}</Note>
          </div>
        )}
      </Panel>

      {/* Verified Pipeline Steps Checklist */}
      <Panel title="Verification & Pipeline Execution Flow">
        <div className="space-y-3">
          {steps.map((st, i) => {
            const isDone = analysisResult ? true : isAnalyzing ? i < 3 : false;
            return (
              <div
                key={i}
                className={`flex items-start gap-3 rounded border p-3 transition-colors ${
                  isDone
                    ? "border-success/40 bg-success/5 text-foreground"
                    : isAnalyzing && i === 2
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border/60 bg-muted/10 text-muted-foreground"
                }`}
              >
                <div className="mt-0.5">
                  {isDone ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : isAnalyzing && i === 2 ? (
                    <Loader2 className="h-4 w-4 text-primary animate-spin" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border border-border flex items-center justify-center text-[10px] font-mono">
                      {i + 1}
                    </div>
                  )}
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold">{st.title}</div>
                  <div className="text-[11px] opacity-80 font-mono">{st.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Analysis Output Banner when complete */}
      {analysisResult && (
        <Panel
          title={
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-4 w-4" />
              <span>
                Analysis Complete · {analysisResult.totalTransactions.toLocaleString()} Transactions
                Scored
              </span>
            </div>
          }
          right={
            <Button
              onClick={() => setTab("results")}
              className="bg-primary text-primary-foreground text-xs font-bold"
            >
              View Detailed Results <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          }
        >
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Total Scored" value={analysisResult.totalTransactions.toLocaleString()} />
            <Stat
              label="Suspicious Alerts"
              value={analysisResult.flaggedCount.toLocaleString()}
              tone={analysisResult.flaggedCount > 0 ? "bad" : "ok"}
            />
            <Stat
              label="Alert Rate"
              value={`${analysisResult.flaggedPct}%`}
              tone={analysisResult.flaggedPct > 10 ? "bad" : undefined}
            />
            <Stat
              label="Circular Loops"
              value={analysisResult.graphData?.cycles.length ?? 0}
              tone={undefined}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2 pt-2 border-t border-border/60">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTab("results")}
              className="text-xs"
            >
              Open Predictions Table
            </Button>
            <Button size="sm" variant="outline" onClick={() => setTab("graph")} className="text-xs">
              Inspect Transaction Graph
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTab("explain")}
              className="text-xs"
            >
              Explainable AI Waterfall
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTab("report")}
              className="text-xs"
            >
              Generate Investigation Report
            </Button>
          </div>
        </Panel>
      )}
    </div>
  );
}
