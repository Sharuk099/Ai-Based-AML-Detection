import { useAml } from "../state";
import { Panel, Stat, Note, DataTable, MetricsView } from "../ui";
import { INTENDED_CATEGORIES } from "@/lib/aml/types";

export function ModelInfoPage() {
  const { activeModel } = useAml();
  if (!activeModel)
    return (
      <Panel title="Model Information">
        <Note>
          No trained model is available. Accuracy cannot be verified until labeled training data is
          supplied and evaluated independently.
        </Note>
      </Panel>
    );
  const report = activeModel.report;
  return (
    <div className="space-y-6">
      <Panel title="Active Model & Training Dataset">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Model" value={activeModel.name} />
          <Stat label="Version" value={activeModel.id} />
          <Stat label="Training Dataset" value={report.dataset} />
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
      <Panel title="Evaluation Protocol">
        <DataTable
          head={["Split", "Training", "Validation", "Test", "Trained at", "Data fingerprint"]}
          rows={[
            [
              report.split,
              report.trainSize,
              report.valSize,
              report.testSize,
              report.trainedAt,
              report.fingerprint,
            ],
          ]}
        />
      </Panel>
      <MetricsView m={report.test} title="Held-Out Test Metrics · PR-AUC is average precision" />
      <Panel title="Class Coverage">
        <p className="text-xs text-foreground">
          Supported labels: {activeModel.classes.join(", ")}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Intended categories absent from training:{" "}
          {INTENDED_CATEGORIES.filter((c) => !activeModel.classes.includes(c)).join(", ") || "None"}
        </p>
      </Panel>
    </div>
  );
}
