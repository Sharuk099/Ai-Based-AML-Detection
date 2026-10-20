import { useState, useEffect } from "react";
import {
  Cpu,
  Play,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Award,
  BarChart3,
  Clock,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { useAml } from "./state";
import { Button } from "@/components/ui/button";
import { Panel, Note, Chip, DataTable, Stat, fmt, selectCls } from "./ui";
import { assessFeatures, valueCounts } from "@/lib/aml/audit";
import type {
  ModelName,
  Roles,
  SelectionMetric,
  SplitStrategy,
  TrainConfig,
} from "@/lib/aml/types";
import { INTENDED_CATEGORIES } from "@/lib/aml/types";

const ALL_MODELS: ModelName[] = [
  "Gradient Boosting",
  "Stacking",
  "Logistic Regression",
  "Random Forest",
  "CNN",
];

export function TrainPanel() {
  const { activeDs, datasets, setTab, job, startTraining, models, setFocusModel } = useAml();

  const [target, setTarget] = useState<string>("");
  const [roles, setRoles] = useState<Roles>({});
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<ModelName[]>([
    "Gradient Boosting",
    "Stacking",
    "Logistic Regression",
    "Random Forest",
    "CNN",
  ]);
  const [split, setSplit] = useState<SplitStrategy>("stratified");
  const [metric, setMetric] = useState<SelectionMetric>("macro_f1");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [configError, setConfigError] = useState<string>();

  // Synchronize when activeDs changes
  useEffect(() => {
    if (!activeDs) return;
    const initialRoles = { ...activeDs.audit.roles };
    setRoles(initialRoles);

    const defaultTarget =
      initialRoles.label ||
      activeDs.columns.find((c) => /label|class|fraud|target|is_laundering/i.test(c)) ||
      "";
    setTarget(defaultTarget);

    const assessment = assessFeatures(activeDs.rows, activeDs.columns, defaultTarget, initialRoles);
    setSelectedFeatures(assessment.eligible);
    setMapping({});
    setConfigError(undefined);
  }, [activeDs]);

  // Recalculate feature eligibility when target or roles change
  const assessment =
    activeDs && target
      ? assessFeatures(activeDs.rows, activeDs.columns, target, roles)
      : { eligible: [], excluded: {} };

  const handleTargetChange = (newTarget: string) => {
    setTarget(newTarget);
    if (activeDs) {
      const ass = assessFeatures(activeDs.rows, activeDs.columns, newTarget, roles);
      setSelectedFeatures(ass.eligible);
    }
  };

  const handleRoleChange = (roleKey: keyof Roles, column: string) => {
    const updated = { ...roles, [roleKey]: column || undefined };
    if (!column) delete updated[roleKey];
    setRoles(updated);
    if (activeDs && target) {
      const ass = assessFeatures(activeDs.rows, activeDs.columns, target, updated);
      setSelectedFeatures(ass.eligible);
    }
  };

  const toggleFeature = (f: string) => {
    setSelectedFeatures((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  const toggleModel = (m: ModelName) => {
    setSelectedModels((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  };

  const handleLaunch = () => {
    if (!activeDs) return setConfigError("No dataset loaded. Upload or generate a dataset first.");
    if (!target) return setConfigError("Select a target column to predict.");
    if (selectedFeatures.length === 0)
      return setConfigError("Select at least one feature column for training.");
    if (selectedModels.length === 0)
      return setConfigError("Select at least one model architecture.");

    setConfigError(undefined);
    const cfg: TrainConfig = {
      datasetName: activeDs.name,
      fingerprint: activeDs.fingerprint,
      target,
      roles,
      features: selectedFeatures,
      mapping,
      split,
      metric,
      models: selectedModels,
    };

    startTraining(activeDs, cfg);
  };

  if (!activeDs) {
    return (
      <div className="space-y-4">
        <Panel title="Train AML Models">
          <div className="flex flex-col items-center justify-center p-8 text-center space-y-3">
            <Cpu className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="text-base font-semibold text-foreground">No Dataset Selected</h3>
            <p className="max-w-md text-xs text-muted-foreground">
              Please load or upload a transaction dataset on the Upload Transactions tab before
              launching model training experiments.
            </p>
            <Button
              onClick={() => setTab("upload")}
              className="mt-2 bg-primary text-primary-foreground"
            >
              Upload Labeled Transactions
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  const counts = target ? valueCounts(activeDs.rows, target, mapping) : [];
  const latestCompletedModel = job?.modelId ? models.find((m) => m.id === job.modelId) : models[0];

  return (
    <div className="space-y-6">
      {/* Configuration Header Panel */}
      <Panel
        title="Training Configuration & Feature Mapping"
        right={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Dataset: <b className="text-foreground">{activeDs.name}</b>
            </span>
            <Button
              disabled={job?.status === "running"}
              onClick={handleLaunch}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {job?.status === "running" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Training in Progress...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4 fill-current" />
                  Train Models
                </>
              )}
            </Button>
          </div>
        }
      >
        {configError && (
          <div className="mb-4">
            <Note kind="err">{configError}</Note>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-3">
          {/* Column 1: Target & Split */}
          <div className="space-y-4">
            <div>
              <label className="label-mono block mb-1">Target Column (Label to Predict)</label>
              <select
                className={selectCls + " w-full font-mono text-xs"}
                value={target}
                onChange={(e) => handleTargetChange(e.target.value)}
              >
                <option value="">Select a ground-truth label column</option>
                {activeDs.columns.map((c) => (
                  <option key={c} value={c}>
                    {c} {c === roles.label ? " [detected label]" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label-mono block mb-1">Validation Split Strategy</label>
              <select
                className={selectCls + " w-full font-mono text-xs"}
                value={split}
                onChange={(e) => setSplit(e.target.value as SplitStrategy)}
              >
                <option value="stratified">
                  Stratified (Preserves class proportions 70/15/15)
                </option>
                <option value="chronological">Chronological (Temporal time-based split)</option>
                <option value="group">Group Split (Sender account groups)</option>
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Stratified ensures rare AML categories exist in validation and test partitions.
              </p>
            </div>

            <div>
              <label className="label-mono block mb-1">Model Selection Metric</label>
              <select
                className={selectCls + " w-full font-mono text-xs"}
                value={metric}
                onChange={(e) => setMetric(e.target.value as SelectionMetric)}
              >
                <option value="macro_f1">Macro F1 Score (Equally weights rare classes)</option>
                <option value="balanced_accuracy">Balanced Accuracy</option>
                <option value="recall_macro">Macro Recall</option>
                <option value="roc_auc">ROC AUC (Multi-class One-vs-Rest)</option>
              </select>
            </div>

            {/* Target Class Distribution */}
            {counts.length > 0 && (
              <div className="rounded border border-border/70 bg-muted/20 p-3">
                <div className="label-mono mb-1.5 flex items-center justify-between">
                  <span>Class Balance ({counts.length} classes)</span>
                  <span className="text-[10px] text-muted-foreground">min 5 required</span>
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1 text-xs font-mono">
                  {counts.map(([cls, cnt]) => (
                    <div key={cls} className="flex items-center justify-between">
                      <span className="truncate pr-2 text-foreground/90">{cls}</span>
                      <span
                        className={cnt < 5 ? "text-destructive font-bold" : "text-muted-foreground"}
                      >
                        {cnt.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Column 2: Graph Roles & Models */}
          <div className="space-y-4">
            <div>
              <label className="label-mono block mb-1">Account & Network Roles</label>
              <div className="space-y-2 text-xs">
                {(["transaction_id", "sender", "receiver", "amount", "timestamp"] as const).map(
                  (rKey) => (
                    <div key={rKey} className="flex items-center justify-between gap-2">
                      <span className="font-mono text-muted-foreground">{rKey}:</span>
                      <select
                        className={selectCls + " h-7 text-xs font-mono flex-1"}
                        value={roles[rKey] || ""}
                        onChange={(e) => handleRoleChange(rKey, e.target.value)}
                      >
                        <option value="">-- None --</option>
                        <option value="">Select a ground-truth label column</option>
                        {activeDs.columns.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  ),
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Sender & Receiver enable graph feature extraction (fan-in, fan-out, passthrough).
              </p>
            </div>

            <div>
              <label className="label-mono block mb-1">Model Architectures</label>
              <div className="space-y-1.5">
                {ALL_MODELS.map((m) => {
                  const isChecked = selectedModels.includes(m);
                  return (
                    <label
                      key={m}
                      className="flex items-center gap-2 rounded border border-border/50 bg-card/60 px-2.5 py-1.5 text-xs text-foreground cursor-pointer hover:bg-muted/40"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleModel(m)}
                        className="rounded border-input text-primary focus:ring-primary"
                      />
                      <span className="font-medium">{m}</span>
                      {m === "CNN" && (
                        <span className="ml-auto text-[10px] text-warning font-mono">
                          [Tabular Unsupported]
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Column 3: Features */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="label-mono">
                Selected Input Features ({selectedFeatures.length})
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedFeatures(assessment.eligible)}
                  className="text-[11px] text-primary hover:underline"
                >
                  Select All Eligible
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFeatures([])}
                  className="text-[11px] text-muted-foreground hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1 rounded border border-border/70 p-2 text-xs">
              {assessment.eligible.map((f) => (
                <label
                  key={f}
                  className="flex items-center gap-2 p-1 hover:bg-muted/30 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedFeatures.includes(f)}
                    onChange={() => toggleFeature(f)}
                    className="rounded border-input text-primary focus:ring-primary"
                  />
                  <span className="font-mono text-foreground">{f}</span>
                </label>
              ))}
              {assessment.eligible.length === 0 && (
                <div className="p-2 text-xs text-muted-foreground">
                  No eligible feature columns found.
                </div>
              )}
            </div>

            {/* Excluded columns reasons */}
            {Object.keys(assessment.excluded).length > 0 && (
              <div className="space-y-1 text-[11px] text-muted-foreground">
                <span className="label-mono block text-[10px]">
                  Excluded Columns (Leakage / ID Protection):
                </span>
                {Object.entries(assessment.excluded)
                  .slice(0, 4)
                  .map(([col, reason]) => (
                    <div key={col} className="truncate">
                      <b className="font-mono text-foreground/80">{col}</b>: {reason}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </Panel>

      {/* Live Job Progress Console */}
      {job && (
        <Panel
          title={
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>Training Worker Console</span>
              {job.status === "running" && <Chip tone="ok">RUNNING</Chip>}
              {job.status === "completed" && <Chip tone="ok">COMPLETED</Chip>}
              {job.status === "failed" && <Chip tone="bad">FAILED</Chip>}
            </div>
          }
          right={
            job.status === "completed" && job.modelId ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setFocusModel(job.modelId);
                  setTab("model_info");
                }}
              >
                Inspect Saved Model <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            ) : null
          }
        >
          {job.error && (
            <div className="mb-3">
              <Note kind="err">{job.error}</Note>
            </div>
          )}

          {job.status === "running" && (
            <div className="mb-4 flex items-center gap-3 rounded bg-primary/10 p-3 text-sm text-primary">
              <Loader2 className="h-5 w-5 animate-spin" />
              <div>
                <span className="font-semibold">Training active:</span>{" "}
                {job.current
                  ? `Fitting ${job.current}...`
                  : "Evaluating partitions and extracting features..."}
              </div>
            </div>
          )}

          {/* Events Log Stream */}
          <div className="max-h-48 overflow-y-auto rounded bg-black/50 p-3 font-mono text-xs text-foreground/90 space-y-1">
            {job.events.map((ev, i) => (
              <div key={i} className="flex gap-2 text-muted-foreground">
                <span className="w-12 text-foreground/60">{ev.t.toFixed(1)}s</span>
                <span className="text-primary font-medium">{ev.event}</span>
                {ev.model && (
                  <span className="text-accent-foreground font-semibold">[{ev.model}]</span>
                )}
                {ev.detail && <span className="text-foreground/80">{ev.detail}</span>}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Leaderboard and Validation Evaluation Results */}
      {latestCompletedModel && (
        <div className="space-y-6">
          <Panel
            title={
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4 text-primary" />
                <span>Validation Leaderboard · {latestCompletedModel.report.dataset}</span>
              </div>
            }
            right={
              <div className="text-xs text-muted-foreground font-mono">
                Selected Champion:{" "}
                <b className="text-success">{latestCompletedModel.report.selected}</b>
              </div>
            }
          >
            {latestCompletedModel.report.notes.map((note, i) => (
              <div key={i} className="mb-3">
                <Note kind="info">{note}</Note>
              </div>
            ))}

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 label-mono">Status</th>
                    <th className="px-3 py-2 label-mono">Model Architecture</th>
                    <th className="px-3 py-2 label-mono">Feature Set</th>
                    <th className="px-3 py-2 label-mono">Validation F1</th>
                    <th className="px-3 py-2 label-mono">Balanced Acc</th>
                    <th className="px-3 py-2 label-mono">Precision</th>
                    <th className="px-3 py-2 label-mono">Recall</th>
                    <th className="px-3 py-2 label-mono">Train Time</th>
                    <th className="px-3 py-2 label-mono">Infer ms/row</th>
                  </tr>
                </thead>
                <tbody>
                  {latestCompletedModel.report.leaderboard.map((row) => {
                    const isSelected = row.selected;
                    const v = row.val;
                    return (
                      <tr
                        key={row.key}
                        className={`border-b border-border/50 hover:bg-muted/40 ${
                          isSelected ? "bg-primary/10 font-semibold" : ""
                        }`}
                      >
                        <td className="px-3 py-2">
                          {isSelected ? (
                            <span className="inline-flex items-center gap-1 text-success">
                              <Award className="h-3.5 w-3.5" /> Best
                            </span>
                          ) : row.status === "completed" ? (
                            <span className="text-muted-foreground">ok</span>
                          ) : row.status === "unsupported" ? (
                            <span className="text-warning">unsupported</span>
                          ) : (
                            <span className="text-destructive">failed</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-foreground font-medium">{row.model}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.featureSet}</td>
                        <td className="px-3 py-2 text-foreground">{v ? fmt(v.macro_f1) : "—"}</td>
                        <td className="px-3 py-2 text-foreground">
                          {v ? fmt(v.balanced_accuracy) : "—"}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {v ? fmt(v.precision_macro) : "—"}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {v ? fmt(v.recall_macro) : "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {row.seconds != null ? `${row.seconds}s` : "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {row.msPerRow != null ? fmt(row.msPerRow, 4) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Held-back Test Set Score */}
            <div className="mt-6 border-t border-border pt-4">
              <div className="label-mono mb-2 text-accent-foreground">
                Held-Back Unseen Test Set Performance (n={latestCompletedModel.report.testSize})
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat
                  label="Test Macro F1"
                  value={fmt(latestCompletedModel.report.test.macro_f1)}
                  tone="ok"
                />
                <Stat
                  label="Test Balanced Acc"
                  value={fmt(latestCompletedModel.report.test.balanced_accuracy)}
                  tone="ok"
                />
                <Stat
                  label="Test Precision"
                  value={fmt(latestCompletedModel.report.test.precision_macro)}
                />
                <Stat
                  label="Test Recall"
                  value={fmt(latestCompletedModel.report.test.recall_macro)}
                />
              </div>
            </div>

            {/* Permutation Feature Importance */}
            {latestCompletedModel.report.importance.length > 0 && (
              <div className="mt-6 border-t border-border pt-4">
                <div className="label-mono mb-3 text-accent-foreground">
                  Permutation Feature Importance (Macro-F1 Degradation)
                </div>
                <div className="space-y-2">
                  {latestCompletedModel.report.importance.slice(0, 8).map((imp) => {
                    const maxImp = Math.max(
                      ...latestCompletedModel.report.importance.map((x) => x.importance),
                      0.01,
                    );
                    const pct = Math.max(
                      0,
                      Math.min(100, Math.round((imp.importance / maxImp) * 100)),
                    );
                    return (
                      <div key={imp.feature} className="space-y-1 font-mono text-xs">
                        <div className="flex justify-between">
                          <span className="text-foreground">{imp.feature}</span>
                          <span className="text-muted-foreground">
                            Δ F1: {imp.importance > 0 ? "+" : ""}
                            {imp.importance.toFixed(4)}
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded bg-muted overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
