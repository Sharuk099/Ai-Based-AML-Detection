import { useState } from "react";
import {
  ShieldCheck,
  Download,
  Trash2,
  CheckCircle2,
  PlayCircle,
  Eye,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useAml } from "./state";
import { Button } from "@/components/ui/button";
import { Panel, Stat, DataTable, MetricsView, Note, fmt } from "./ui";
import type { SavedModel } from "@/lib/aml/pipeline";

export function ModelsPanel() {
  const { models, removeModel, refreshModels, focusModel, setFocusModel, setTab } = useAml();
  const [selectedId, setSelectedId] = useState<string | undefined>(focusModel || models[0]?.id);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const activeModel = models.find((m) => m.id === (selectedId || focusModel)) || models[0];

  const exportModelJson = (m: SavedModel) => {
    const dataStr =
      "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(m, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${m.id}_model.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await removeModel(id);
      if (selectedId === id) setSelectedId(undefined);
    } finally {
      setDeletingId(null);
    }
  };

  if (models.length === 0) {
    return (
      <div className="space-y-4">
        <Panel title="Saved AML Detection Models">
          <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
            <ShieldCheck className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="text-base font-semibold text-foreground">No Models Stored Yet</h3>
            <p className="max-w-md text-xs text-muted-foreground">
              Trained models are automatically verified, serialized, and persisted in your browser's
              local IndexedDB. Launch a training job on the Train tab to generate your first model.
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

  const r = activeModel?.report;

  return (
    <div className="space-y-6">
      {/* Model Selector Card */}
      <Panel
        title={`Saved Models (${models.length})`}
        right={
          <Button variant="outline" size="sm" onClick={() => refreshModels()} className="text-xs">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh List
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {models.map((m) => {
            const isSelected = activeModel?.id === m.id;
            return (
              <div
                key={m.id}
                onClick={() => {
                  setSelectedId(m.id);
                  setFocusModel(m.id);
                }}
                className={`panel cursor-pointer p-4 transition-all hover:border-primary/60 ${
                  isSelected ? "border-primary bg-primary/5 ring-1 ring-primary/40" : "bg-card/70"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="font-semibold text-foreground text-sm block truncate max-w-[200px]">
                      {m.name}
                    </span>
                    <span className="label-mono block text-[10px]">
                      {new Date(m.report.trainedAt).toLocaleString()}
                    </span>
                  </div>
                  {m.report.reloadVerified && (
                    <span className="inline-flex items-center text-success" title="Reload verified">
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2 text-xs font-mono">
                  <span className="text-muted-foreground">Test F1:</span>
                  <span className="font-bold text-success">
                    {m.report.test.macro_f1 != null
                      ? (m.report.test.macro_f1 * 100).toFixed(1) + "%"
                      : "N/A"}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-end gap-1.5 pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      exportModelJson(m);
                    }}
                    title="Export JSON"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                    disabled={deletingId === m.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(m.id);
                    }}
                    title="Delete Model"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Model Deep Dive Report */}
      {activeModel && r && (
        <div className="space-y-6">
          <Panel
            title={
              <div className="flex items-center gap-2">
                <span>Model Inspection:</span>
                <b className="text-foreground">{activeModel.name}</b>
                <span className="font-mono text-xs text-muted-foreground">({activeModel.id})</span>
              </div>
            }
            right={
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setFocusModel(activeModel.id);
                    setTab("predict");
                  }}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
                >
                  <PlayCircle className="mr-1.5 h-3.5 w-3.5" /> Predict with This Model
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => exportModelJson(activeModel)}
                  className="text-xs"
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Export Artifact
                </Button>
              </div>
            }
          >
            {/* Meta summary stats */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-6">
              <Stat label="Training Records" value={r.records.toLocaleString()} />
              <Stat label="Input Features" value={r.features.length} />
              <Stat label="Training Time" value={`${r.totalSeconds}s`} />
              <Stat
                label="Reload Verified"
                value={r.reloadVerified ? "Passed" : "Unverified"}
                tone={r.reloadVerified ? "ok" : "warn"}
              />
            </div>

            {/* Test evaluation metrics view */}
            <MetricsView m={r.test} title="Held-Back Test Partition Metrics (Unseen Evaluation)" />

            {/* Permutation Importance */}
            {r.importance.length > 0 && (
              <div className="mt-6 border-t border-border pt-4">
                <div className="label-mono mb-3 text-accent-foreground">
                  Global Permutation Feature Importance
                </div>
                <DataTable
                  head={["Feature", "Importance (Macro-F1 Drop)", "Impact"]}
                  rows={r.importance.map((imp) => [
                    imp.feature,
                    imp.importance.toFixed(4),
                    imp.importance > 0.05
                      ? "High"
                      : imp.importance > 0.01
                        ? "Medium"
                        : "Low / Neutral",
                  ])}
                />
              </div>
            )}

            {/* Preprocessing info */}
            <div className="mt-6 border-t border-border pt-4">
              <div className="label-mono mb-2 text-accent-foreground">
                Preprocessing & Feature Transformations
              </div>
              <div className="grid gap-3 sm:grid-cols-2 text-xs font-mono">
                <div className="rounded border border-border/70 p-3 bg-muted/20">
                  <div className="label-mono mb-1">Standardized Numeric Features:</div>
                  <div className="text-foreground/90">
                    {activeModel.prep.numeric.map((f) => f.col).join(", ") || "None"}
                  </div>
                </div>
                <div className="rounded border border-border/70 p-3 bg-muted/20">
                  <div className="label-mono mb-1">One-Hot Categorical Features:</div>
                  <div className="text-foreground/90">
                    {activeModel.prep.categorical.map((f) => f.col).join(", ") || "None"}
                  </div>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
