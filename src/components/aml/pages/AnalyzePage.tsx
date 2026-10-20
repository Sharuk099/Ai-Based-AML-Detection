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
  const {
    activeDs,
    activeModel,
    isAnalyzing,
    analyzeError,
    runAnalysis,
    analysisResult,
    setTab,
    modelCompatibility,
    trainCompatibleModel,
  } = useAml();
  const [completedSteps, setCompletedSteps] = useState<number>(analysisResult ? 6 : 0);
  const [isTraining, setIsTraining] = useState(false);
  const [trainError, setTrainError] = useState<string>();
  const [trainSuccess, setTrainSuccess] = useState<string>();

  const handleStartAnalysis = async () => {
    if (!activeDs) return;
    setCompletedSteps(1);
    const success = await runAnalysis();
    if (success) {
      setCompletedSteps(6);
    }
  };

  const handleTrainCompatible = async () => {
    if (!activeDs) return;
    setIsTraining(true);
    setTrainError(undefined);
    setTrainSuccess(undefined);
    try {
      const model = await trainCompatibleModel(activeDs);
      setTrainSuccess(
        `Compatible AML model "${model.name}" trained and independently evaluated on a stratified test partition! Held-out Test Macro F1: ${(model.report.test.macro_f1 * 100).toFixed(1)}%, Accuracy: ${(model.report.test.accuracy * 100).toFixed(1)}%.`,
      );
    } catch (e) {
      setTrainError((e as Error).message);
    } finally {
      setIsTraining(false);
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
              className="mt-2 bg-primary text-primary-foreground font-bold"
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
      title: "Predictive Inference & Classification",
      desc: `Scoring ${activeDs.rows.length.toLocaleString()} rows into AML classes`,
    },
    {
      title: "Directed Graph Topology & Typology Mining",
      desc: "Evaluating counterparty degree, smurfing, pass-through mules, and circular loops (no artificial loops)",
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
          No trained model is available. Upload labeled transactions and train a model first.
        </Note>
      )}

      {/* Model Incompatibility Alert and One-Click Training Action */}
      {modelCompatibility && !modelCompatibility.compatible && (
        <Panel
          title={
            <div className="flex items-center gap-2 text-warning font-bold">
              <AlertTriangle className="h-4 w-4" />
              <span>Model Incompatibility Detected (Do Not Silently Use Incompatible Model)</span>
            </div>
          }
        >
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              The currently selected model <b className="text-foreground">{activeModel?.name}</b> is
              incompatible with the active dataset <b className="text-foreground">{activeDs.name}</b>.
              {modelCompatibility.isAccountLevelDataset && (
                <span>
                  {" "}The dataset contains <b>account-level profile records</b> with 1 representative transaction per account, whereas the default model is a transaction-level model trained on a 6-class typology.
                </span>
              )}
            </p>

            <div className="rounded border border-warning/30 bg-warning/5 p-3 space-y-1.5 text-xs font-mono">
              <div className="font-bold text-warning mb-1">Incompatibility Reasons:</div>
              {modelCompatibility.reasons.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-muted-foreground">
                  <span className="text-warning font-bold">•</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <Button
                onClick={handleTrainCompatible}
                disabled={isTraining}
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-xs shadow-md"
              >
                {isTraining ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Training & Evaluating Model (Stratified Split)...
                  </>
                ) : (
                  <>
                    <Cpu className="mr-2 h-3.5 w-3.5" />
                    Train & Evaluate Compatible Model (Stratified Split)
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setTab("model_info")}
                className="text-xs"
              >
                Inspect Model Info
              </Button>
            </div>

            {trainError && <Note kind="err">{trainError}</Note>}
            {trainSuccess && <Note kind="ok">{trainSuccess}</Note>}
          </div>
        </Panel>
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
              Applies the compatible machine learning pipeline and graph analytics directly to your
              uploaded data. Model predictions are generated independently without ground-truth labels.
            </p>
          </div>

          <Button
            size="lg"
            onClick={handleStartAnalysis}
            disabled={isAnalyzing || !activeModel || (modelCompatibility && !modelCompatibility.compatible)}
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
                Analysis Complete · {analysisResult.totalTransactions.toLocaleString()} Records
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
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <Stat label="Total Scored" value={analysisResult.totalTransactions.toLocaleString()} />
            <Stat
              label="Model Risk Predictions"
              value={analysisResult.riskPredictionsCount.toLocaleString()}
              tone={analysisResult.riskPredictionsCount > 0 ? "bad" : "ok"}
            />
            <Stat
              label="Model Normal Predictions"
              value={analysisResult.normalPredictionsCount.toLocaleString()}
              tone="ok"
            />
            <Stat
              label="Flagged for Review"
              value={analysisResult.flaggedCount.toLocaleString()}
              tone={analysisResult.flaggedCount > 0 ? "warn" : "ok"}
            />
            <Stat
              label="Circular Loops"
              value={analysisResult.graphData?.cycles.length ?? 0}
              tone={undefined}
            />
          </div>

          {analysisResult.evaluationVsGroundTruth && (
            <div className="mt-4 rounded border border-success/30 bg-success/5 p-3 text-xs font-mono">
              <div className="flex items-center gap-1.5 font-bold text-success mb-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>
                  Independent Evaluation vs Ground-Truth Target Label (
                  {analysisResult.evaluationVsGroundTruth.targetColumn}):
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 mb-2">
                Predictions were generated independently without ground-truth labels. Evaluated across {analysisResult.evaluationVsGroundTruth.n} records.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-foreground">
                <div>Accuracy: <b>{(analysisResult.evaluationVsGroundTruth.accuracy * 100).toFixed(1)}%</b></div>
                <div>Precision: <b>{(analysisResult.evaluationVsGroundTruth.precision * 100).toFixed(1)}%</b></div>
                <div>Recall: <b>{(analysisResult.evaluationVsGroundTruth.recall * 100).toFixed(1)}%</b></div>
                <div>F1-Score: <b>{(analysisResult.evaluationVsGroundTruth.f1 * 100).toFixed(1)}%</b></div>
              </div>
            </div>
          )}

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
              Inspect Transaction Graph (0 loops)
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
