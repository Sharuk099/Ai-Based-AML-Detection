import { useState, useRef, useEffect } from "react";
import {
  Play,
  Upload,
  Download,
  AlertTriangle,
  ShieldCheck,
  HelpCircle,
  FileSpreadsheet,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import Papa from "papaparse";
import { useAml } from "./state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, Stat, DataTable, Chip, Note, fmt, selectCls } from "./ui";
import { pipelineProba, localExplain } from "@/lib/aml/pipeline";
import { evaluateTransactionRisk } from "@/lib/aml/risk";
import { inferenceIssue } from "@/lib/aml/inference";
import type { Row } from "@/lib/aml/types";

export function PredictPanel() {
  const { models, focusModel, setFocusModel, setTab } = useAml();
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>(
    focusModel || models[0]?.id,
  );
  const activeModel = models.find((m) => m.id === (selectedModelId || focusModel)) || models[0];

  // Single inference state
  const [singleInputs, setSingleInputs] = useState<Record<string, string>>({});
  const [singleResult, setSingleResult] = useState<{
    prediction: string;
    probabilities: { label: string; prob: number }[];
    explanations: { feature: string; value: string; contribution: number }[];
  } | null>(null);

  // Batch inference state
  const [batchRows, setBatchRows] = useState<Row[]>([]);
  const [batchResults, setBatchResults] = useState<{
    rows: Record<string, string | number>[];
    summary: { total: number; flagged: number; flaggedPct: number };
  } | null>(null);
  const [batchError, setBatchError] = useState<string>();
  const [isScoringBatch, setIsScoringBatch] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-fill singleInputs from activeModel reference values
  useEffect(() => {
    if (activeModel) {
      setSingleInputs(Object.fromEntries(activeModel.prep.inputColumns.map((c) => [c, ""])));
      setSingleResult(null);
    }
  }, [activeModel]);

  const handleScoreSingle = () => {
    if (!activeModel) return;
    const probas = pipelineProba(activeModel.prep, activeModel.model, [singleInputs])[0];
    if (!probas) return;

    const maxProb = Math.max(...probas);
    const predIdx = probas.indexOf(maxProb);
    const issue = inferenceIssue(activeModel, singleInputs);
    const predClass = issue
      ? "Unable to classify"
      : activeModel.classes[predIdx] || "Unable to classify";

    const probList = activeModel.classes
      .map((cls, idx) => ({
        label: cls,
        prob: probas[idx] ?? 0,
      }))
      .sort((a, b) => b.prob - a.prob);

    const explains = localExplain(activeModel, [singleInputs], 5)[0] || [];

    setSingleResult({
      prediction: predClass,
      probabilities: issue ? [] : probList,
      explanations: issue ? [] : explains,
    });
  };

  const handleBatchUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBatchError(undefined);
    setIsScoringBatch(true);

    try {
      const text = await file.text();
      const parsed = Papa.parse<Row>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
      });
      if (!parsed.data.length) throw new Error("CSV contains no data rows.");
      if (!activeModel) throw new Error("No model selected.");

      const rows = parsed.data;
      const probas = pipelineProba(activeModel.prep, activeModel.model, rows);

      let flaggedCount = 0;
      const scoredRows = rows.map((r, i) => {
        const p = probas[i] || [];
        const maxP = Math.max(...p, 0);
        const idx = p.indexOf(maxP);
        const cls = activeModel.classes[idx] || "Unknown";
        const issue = inferenceIssue(activeModel, r);
        const evaluation = evaluateTransactionRisk(
          r,
          cls,
          issue ? 0 : maxP,
          activeModel.classes.map((label, j) => ({ label, prob: p[j] ?? 0 })),
        );
        if (evaluation.isSuspicious) flaggedCount++;
        const risk = evaluation.riskLevel;

        return {
          ...r,
          _predicted_class:
            evaluation.classificationStatus === "CLASSIFIED" ? cls : "Unable to classify",
          _confidence: issue ? 0 : maxP,
          _risk_level: risk,
        };
      });

      setBatchResults({
        rows: scoredRows,
        summary: {
          total: rows.length,
          flagged: flaggedCount,
          flaggedPct: +((100 * flaggedCount) / rows.length).toFixed(1),
        },
      });
    } catch (err) {
      setBatchError((err as Error).message);
    } finally {
      setIsScoringBatch(false);
    }
  };

  const exportBatchCsv = () => {
    if (!batchResults) return;
    const csv = Papa.unparse(batchResults.rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `aml_predictions_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const exportBatchJson = () => {
    if (!batchResults) return;
    const blob = new Blob([JSON.stringify(batchResults.rows, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `aml_predictions_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  if (models.length === 0) {
    return (
      <div className="space-y-4">
        <Panel title="Transaction Scoring & Prediction">
          <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
            <ShieldCheck className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="text-base font-semibold text-foreground">No Trained Model Available</h3>
            <p className="max-w-md text-xs text-muted-foreground">
              In order to score transactions or explain decisions, you must train a model first. You
              can train one in seconds using our browser ML engine.
            </p>
            <Button
              onClick={() => setTab("train")}
              className="mt-2 bg-primary text-primary-foreground"
            >
              Go to Train Tab
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  const isRisk =
    singleResult &&
    /laundering|fraud|darknet|blackmail|blacklist|ponzi|tumbler/i.test(singleResult.prediction);

  return (
    <div className="space-y-6">
      {/* Model Selector Banner */}
      <Panel
        title="Active Inference Model"
        right={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Select Model:</span>
            <select
              className={selectCls + " text-xs font-mono"}
              value={activeModel?.id}
              onChange={(e) => {
                setSelectedModelId(e.target.value);
                setFocusModel(e.target.value);
              }}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.id}) · F1:{" "}
                  {m.report.test.macro_f1 != null
                    ? (m.report.test.macro_f1 * 100).toFixed(0) + "%"
                    : "N/A"}
                </option>
              ))}
            </select>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-muted-foreground">
          <span>
            Target: <b className="text-foreground">{activeModel?.target}</b>
          </span>
          <span>
            Classes: <b className="text-foreground">{activeModel?.classes.length}</b>
          </span>
          <span>
            Features: <b className="text-foreground">{activeModel?.prep.inputColumns.length}</b>
          </span>
          <span>
            Test Score:{" "}
            <b className="text-success">
              {activeModel?.report.test.macro_f1 != null
                ? (activeModel.report.test.macro_f1 * 100).toFixed(1) + "%"
                : "N/A"}
            </b>
          </span>
        </div>
      </Panel>

      {/* Two-Column Interface: Single Form and Batch Upload */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Single Transaction Tester */}
        <div className="space-y-4">
          <Panel
            title="Single Transaction Scoring & Explanation"
            right={
              <Button
                size="sm"
                onClick={handleScoreSingle}
                className="bg-primary text-primary-foreground"
              >
                <Play className="mr-1.5 h-3.5 w-3.5 fill-current" /> Score Transaction
              </Button>
            }
          >
            <p className="mb-4 text-xs text-muted-foreground">
              Modify the transaction parameters below to evaluate model inference and observe local
              feature attribution:
            </p>

            <div className="grid grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
              {activeModel?.prep.inputColumns.map((col) => (
                <div key={col} className="space-y-1">
                  <label className="label-mono block truncate" title={col}>
                    {col}
                  </label>
                  <Input
                    className="h-8 font-mono text-xs"
                    value={singleInputs[col] ?? ""}
                    onChange={(e) =>
                      setSingleInputs((prev) => ({ ...prev, [col]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>

            {/* Inference Result */}
            {singleResult && (
              <div className="mt-6 border-t border-border pt-4 space-y-4">
                <div className="flex items-center justify-between rounded border border-border p-3 bg-muted/20">
                  <div>
                    <div className="label-mono">Predicted AML Classification</div>
                    <div className="font-mono text-lg font-bold text-foreground flex items-center gap-2">
                      {singleResult.prediction}
                      {isRisk ? <Chip tone="bad">SUSPICIOUS</Chip> : <Chip tone="ok">NORMAL</Chip>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="label-mono">Top Confidence</div>
                    <div className="font-mono text-lg font-bold text-primary">
                      {((singleResult.probabilities[0]?.prob ?? 0) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* Probability Distribution */}
                <div>
                  <div className="label-mono mb-2">Class Probability Distribution</div>
                  <div className="space-y-1.5 font-mono text-xs">
                    {singleResult.probabilities.slice(0, 5).map((p) => (
                      <div key={p.label} className="space-y-0.5">
                        <div className="flex justify-between text-[11px]">
                          <span className="truncate max-w-[200px] text-foreground">{p.label}</span>
                          <span className="text-muted-foreground">
                            {(p.prob * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded bg-muted overflow-hidden">
                          <div
                            className={`h-full ${/laundering|fraud|darknet|blackmail|blacklist|ponzi|tumbler/i.test(p.label) ? "bg-destructive" : "bg-primary"}`}
                            style={{ width: `${(p.prob * 100).toFixed(1)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Local Feature Attribution */}
                <div>
                  <div className="label-mono mb-2 flex items-center justify-between">
                    <span>Local Feature Attribution (Why this prediction?)</span>
                    <span className="text-[10px] text-muted-foreground">vs reference baseline</span>
                  </div>
                  <DataTable
                    head={["Feature", "Observed Value", "Attribution Δ"]}
                    rows={singleResult.explanations.map((exp) => [
                      exp.feature,
                      exp.value,
                      <span
                        key={exp.feature}
                        className={
                          exp.contribution > 0
                            ? "text-success font-bold"
                            : "text-destructive font-bold"
                        }
                      >
                        {exp.contribution > 0 ? "+" : ""}
                        {(exp.contribution * 100).toFixed(1)}%
                      </span>,
                    ])}
                  />
                </div>
              </div>
            )}
          </Panel>
        </div>

        {/* Right: Batch CSV Scoring */}
        <div className="space-y-4">
          <Panel title="Batch File Scoring & Alerting">
            <p className="mb-4 text-xs text-muted-foreground">
              Score hundreds or thousands of transactions in a single batch. Upload any CSV matching
              or including the model's feature headers:
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleBatchUpload}
                className="text-xs file:mr-2 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:text-primary-foreground cursor-pointer"
              />
              {isScoringBatch && (
                <span className="text-xs text-muted-foreground font-mono">
                  Scoring in memory...
                </span>
              )}
            </div>

            {batchError && (
              <div className="mt-3">
                <Note kind="err">{batchError}</Note>
              </div>
            )}

            {/* Batch Results Overview */}
            {batchResults && (
              <div className="mt-5 space-y-4 border-t border-border pt-4">
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Total Scored" value={batchResults.summary.total.toLocaleString()} />
                  <Stat
                    label="Flagged AML"
                    value={batchResults.summary.flagged.toLocaleString()}
                    tone={batchResults.summary.flagged > 0 ? "bad" : "ok"}
                  />
                  <Stat
                    label="Flagged Rate"
                    value={`${batchResults.summary.flaggedPct}%`}
                    tone={batchResults.summary.flaggedPct > 10 ? "bad" : undefined}
                  />
                </div>

                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={exportBatchCsv} className="text-xs">
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Export Scored CSV
                  </Button>
                  <Button size="sm" variant="outline" onClick={exportBatchJson} className="text-xs">
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Export Scored JSON
                  </Button>
                </div>

                {/* Scored Preview Table */}
                <div>
                  <div className="label-mono mb-2">First 10 Batch Predictions</div>
                  <DataTable
                    head={["Row", "Predicted Class", "Confidence", "Alert Level"]}
                    rows={batchResults.rows.slice(0, 10).map((r, i) => [
                      `#${i + 1}`,
                      r._predicted_class,
                      `${(r._confidence * 100).toFixed(1)}%`,
                      <Chip
                        key={i}
                        tone={
                          r._risk_level === "HIGH"
                            ? "bad"
                            : r._risk_level === "MEDIUM"
                              ? "bad"
                              : "ok"
                        }
                      >
                        {r._risk_level}
                      </Chip>,
                    ])}
                  />
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
