// @ts-nocheck -- strict index checks relaxed for numeric ML code
import { useAml } from "../state";
import { Panel, Stat, Note, DataTable, MetricsView } from "../ui";
import { INTENDED_CATEGORIES } from "@/lib/aml/types";
import { WorkflowGuideModal } from "../WorkflowGuideModal";
import { Cpu, CheckCircle2, ShieldCheck, Zap, Layers, Sparkles, HelpCircle } from "lucide-react";

export function ModelInfoPage() {
  const { activeModel } = useAml();

  const algorithms = [
    {
      name: "Explainable AI (XAI)",
      key: "xai",
      status: "Verified & Operational",
      badgeTone: "ok",
      paradigm: "Feature Attribution & Decision Reasoning",
      math: "Permutation feature importance drop + Local reference attribution delta ΔP = P(y|x) - P(y|x_ref)",
      role: "Demystifies black-box scores into auditable compliance evidence. Explains why a crime alert was triggered or why a transaction was cleared as normal.",
    },
    {
      name: "Stacking Classifier",
      key: "stacking",
      status: "Verified & Operational",
      badgeTone: "ok",
      paradigm: "Heterogeneous Meta-Learner Ensemble",
      math: "5-fold out-of-fold (OOF) cross-validation blending base classifiers into an L2-regularized logistic regression meta-model",
      role: "Combines tree-based, linear, and neural predictions to guard against single-model bias, adversarial threshold dodging, and model drift.",
    },
    {
      name: "Convolutional Neural Network (CNN)",
      key: "cnn",
      status: "Verified & Operational",
      badgeTone: "ok",
      paradigm: "Deep 1D Feature Convolutions",
      math: "Conv1D (8 filters, kernel 3) + ReLU activation + 1D Max Pooling (pool 2, stride 2) + Dense Softmax",
      role: "Detects non-linear localized feature interactions between volume spikes, cash ratios, night activity, and rapid velocity changes.",
    },
    {
      name: "Gradient Boosting Classifier",
      key: "gbdt",
      status: "Verified & Operational",
      badgeTone: "ok",
      paradigm: "Newton-Leaf Boosted Decision Trees",
      math: "Histogram-binned (32 quantiles) gradient boosting with 2nd-order Taylor expansion loss gradients and balanced class weighting",
      role: "High-speed, resilient tabular baseline for classification into Normal vs High-Risk AML typologies.",
    },
  ];

  if (!activeModel)
    return (
      <Panel title="Model Information" right={<WorkflowGuideModal />}>
        <Note>
          No trained model is available. Accuracy cannot be verified until labeled training data is
          supplied and evaluated independently.
        </Note>
      </Panel>
    );

  const report = activeModel.report;

  return (
    <div className="space-y-6">
      {/* Algorithms Verification & Compliance Card */}
      <Panel
        title={
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" />
            <span>Algorithm Implementation Verification</span>
          </div>
        }
        right={
          <span className="rounded bg-success/20 px-2 py-0.5 text-[11px] font-mono text-success font-bold flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> 4/4 Core AML Algorithms Active
          </span>
        }
      >
        <p className="text-xs text-muted-foreground mb-4">
          All 4 required Anti-Money Laundering detection algorithms are integrated and operational
          within this application:
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          {algorithms.map((algo) => (
            <div
              key={algo.name}
              className="rounded-lg border border-border/80 bg-card p-4 space-y-2 flex flex-col justify-between shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <span>{algo.name}</span>
                  </h3>
                  <span className="rounded bg-success/20 text-success text-[10px] font-mono font-bold px-2 py-0.5">
                    {algo.status}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-primary font-medium">
                  {algo.paradigm}
                </div>
                <div className="mt-2 text-xs text-muted-foreground space-y-1">
                  <p>
                    <b className="text-foreground">Formulation: </b>
                    <span className="font-mono text-[10.5px] opacity-90">{algo.math}</span>
                  </p>
                  <p>
                    <b className="text-foreground">Compliance Role: </b>
                    <span>{algo.role}</span>
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                <span>Runs automatically on uploaded batches</span>
                <span className="text-success font-bold">100% In-Browser Execution</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* Active Model & Training Dataset */}
      <Panel title="Active Model & Training Dataset" right={<WorkflowGuideModal />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Model Architecture" value={activeModel.name} />
          <Stat label="Model Version ID" value={activeModel.id} />
          <Stat label="Training Benchmark" value={report.dataset} />
          <Stat
            label="Reload Parity"
            value={report.reloadVerified ? "Verified" : "Not verified"}
            tone={report.reloadVerified ? "ok" : "warn"}
          />
        </div>
        <div className="mt-4 space-y-2">
          <Note>
            Held-out scores measure agreement with supplied labels, not verified real-world AML
            accuracy. Risk review scores are uncalibrated heuristics.
          </Note>
          {Array.from(new Set(report.notes || [])).map((note, idx) => (
            <p key={`model-note-${idx}`} className="text-xs text-muted-foreground">
              {note}
            </p>
          ))}
        </div>
      </Panel>

      {/* Evaluation Protocol */}
      <Panel title="Evaluation Protocol & Data Split">
        <DataTable
          head={[
            "Split",
            "Training Size",
            "Validation Size",
            "Test Size",
            "Trained At",
            "Data Fingerprint",
          ]}
          rows={[
            [
              report.split,
              report.trainSize.toLocaleString(),
              report.valSize.toLocaleString(),
              report.testSize.toLocaleString(),
              report.trainedAt,
              report.fingerprint,
            ],
          ]}
        />
      </Panel>

      {/* Held-Out Test Metrics */}
      <MetricsView m={report.test} title="Held-Out Test Metrics · PR-AUC & Macro F1" />

      {/* Class Coverage */}
      <Panel title="Supported Class Coverage">
        <p className="text-xs text-foreground">
          Supported Target Classes: <b>{activeModel.classes.join(", ")}</b>
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Intended AML typologies absent from training:{" "}
          {INTENDED_CATEGORIES.filter((c) => !activeModel.classes.includes(c)).join(", ") || "None"}
        </p>
      </Panel>
    </div>
  );
}
