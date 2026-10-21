import { useState } from "react";
import {
  HelpCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ShieldAlert,
  Cpu,
} from "lucide-react";
import { useAml } from "../state";
import { Button } from "@/components/ui/button";
import { Panel, Stat, DataTable, Chip, Note, selectCls } from "../ui";

export function ExplainPage() {
  const { analysisResult, activeModel, selectedTransactionId, setSelectedTransactionId, setTab } =
    useAml();

  const selectedRecord =
    analysisResult?.records.find((r) => r._row_id === selectedTransactionId) ||
    analysisResult?.records[0];

  if (!analysisResult) {
    return (
      <div className="space-y-4">
        <Panel title="Explainable AI (XAI)">
          <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
            <HelpCircle className="h-12 w-12 text-muted-foreground/40" />
            <h3 className="text-base font-semibold text-foreground">
              No Transactions Analyzed Yet
            </h3>
            <p className="max-w-md text-xs text-muted-foreground">
              To inspect individual prediction explanations and local feature contributions, run the
              transaction analysis first.
            </p>
            <Button
              onClick={() => setTab("analyze")}
              className="mt-2 bg-primary text-primary-foreground"
            >
              Go to Analyze Transactions
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  const isRisk =
    selectedRecord &&
    (selectedRecord._risk_level === "HIGH" || selectedRecord._risk_level === "MEDIUM");

  const formatAmount = (rec: any) => {
    if (!rec) return "";
    const amt = Number(rec["amount"] || 0);
    const ccy = String(rec["currency"] || "USD").toUpperCase();
    const symbol = ccy === "INR" ? "₹" : ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$";
    return `${symbol}${amt.toLocaleString()}`;
  };

  return (
    <div className="space-y-6">
      {/* Transaction Selector */}
      <Panel
        title="Transaction Local Explanation Inspector"
        right={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Select Transaction:</span>
            <select
              className={selectCls + " text-xs font-mono h-8"}
              value={selectedRecord?._row_id}
              onChange={(e) => setSelectedTransactionId(e.target.value)}
            >
              {analysisResult.records.slice(0, 100).map((r) => (
                <option key={r._row_id} value={r._row_id}>
                  {r._row_id} · {r._predicted_class} ({r._risk_level}) · {formatAmount(r)}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {selectedRecord && (
          <div className="space-y-6">
            {/* Transaction Header Info */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat label="Transaction ID" value={selectedRecord._row_id} />
              <Stat
                label="Predicted Class"
                value={selectedRecord._predicted_class}
                tone={isRisk ? "bad" : "ok"}
              />
              <Stat
                label="Model Confidence"
                value={`${(selectedRecord._confidence * 100).toFixed(1)}%`}
              />
              <Stat
                label="Risk Tier"
                value={selectedRecord._risk_level}
                tone={
                  selectedRecord._risk_level === "HIGH"
                    ? "bad"
                    : selectedRecord._risk_level === "MEDIUM"
                      ? "bad"
                      : "ok"
                }
              />
            </div>

            {/* Transaction Parameters Summary */}
            <div className="rounded border border-border/80 bg-muted/20 p-3 font-mono text-xs">
              <div className="label-mono mb-2">Transaction Attributes:</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  From:{" "}
                  <b className="text-foreground">{String(selectedRecord["from_account"] || "—")}</b>
                </div>
                <div>
                  To:{" "}
                  <b className="text-foreground">{String(selectedRecord["to_account"] || "—")}</b>
                </div>
                <div>
                  Amount: <b className="text-foreground">{formatAmount(selectedRecord)}</b>
                </div>
                <div>
                  Channel:{" "}
                  <b className="text-foreground">
                    {String(selectedRecord["payment_format"] || selectedRecord["channel"] || "—")}
                  </b>
                </div>
              </div>
            </div>

            {/* Local Feature Attribution Waterfall */}
            <div>
              <div className="label-mono mb-2 flex items-center justify-between">
                <span>Local Reference Perturbation Attributions</span>
                <span className="text-[10px] text-muted-foreground">
                  Impact on {selectedRecord._predicted_class} probability vs baseline
                </span>
              </div>

              {selectedRecord._explanations && selectedRecord._explanations.length > 0 ? (
                <div className="space-y-3">
                  <DataTable
                    head={[
                      "Feature",
                      "Observed Transaction Value",
                      "Baseline Reference Value",
                      "Probability Contribution Δ",
                    ]}
                    rows={selectedRecord._explanations.map((exp) => [
                      exp.feature,
                      exp.value,
                      activeModel?.reference[exp.feature] || "0",
                      <span
                        key={exp.feature}
                        className={
                          exp.contribution > 0
                            ? "text-success font-bold"
                            : "text-destructive font-bold"
                        }
                      >
                        {exp.contribution > 0 ? "+" : ""}
                        {(exp.contribution * 100).toFixed(2)}%
                      </span>,
                    ])}
                  />

                  {/* Visual attribution bar waterfall */}
                  <div className="space-y-2 mt-4 pt-4 border-t border-border">
                    <div className="label-mono text-[11px]">Feature Contribution Magnitude:</div>
                    {selectedRecord._explanations.map((exp) => {
                      const widthPct = Math.min(100, Math.round(Math.abs(exp.contribution) * 200));
                      const isPositive = exp.contribution >= 0;
                      return (
                        <div key={exp.feature} className="space-y-0.5 font-mono text-xs">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-foreground">
                              {exp.feature} ({exp.value})
                            </span>
                            <span className={isPositive ? "text-success" : "text-destructive"}>
                              {isPositive ? "+" : ""}
                              {(exp.contribution * 100).toFixed(2)}%
                            </span>
                          </div>
                          <div className="h-2 w-full rounded bg-muted overflow-hidden flex">
                            <div
                              className={`h-full ${isPositive ? "bg-success" : "bg-destructive"}`}
                              style={{ width: `${Math.max(widthPct, 4)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-4 text-center text-xs text-muted-foreground border border-border rounded">
                  Explanations are computed for top sampled transactions. Select another record
                  above to view attribution.
                </div>
              )}
            </div>

            {/* Probability Breakdown */}
            <div>
              <div className="label-mono mb-2">Class Probability Distribution:</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {selectedRecord._probabilities.map((p) => (
                  <div key={p.label} className="panel p-2.5 bg-muted/20 text-xs font-mono">
                    <div className="flex justify-between mb-1">
                      <span className="truncate max-w-[200px] text-foreground font-medium">
                        {p.label}
                      </span>
                      <span className="text-muted-foreground">{(p.prob * 100).toFixed(1)}%</span>
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
          </div>
        )}
      </Panel>

      {/* Global Feature Importance of the Pretrained Model */}
      {activeModel && activeModel.report.importance.length > 0 && (
        <Panel title="Global Model Feature Importance (Permutation F1-Drop)">
          <p className="text-xs text-muted-foreground mb-3">
            Across the entire validation partition, permuting these features caused the largest drop
            in macro F1 score:
          </p>
          <DataTable
            head={["Rank", "Feature", "Permutation F1 Degradation", "Global Relative Weight"]}
            rows={activeModel.report.importance.map((imp, idx) => {
              const maxImp = Math.max(
                ...activeModel.report.importance.map((x) => x.importance),
                0.001,
              );
              const pct = (imp.importance / maxImp) * 100;
              return [
                `#${idx + 1}`,
                imp.feature,
                imp.importance.toFixed(4),
                `${Math.max(0, Math.min(100, Math.round(pct)))}%`,
              ];
            })}
          />
        </Panel>
      )}

      {/* Regulatory Limitation Notice */}
      <div className="flex items-start gap-3 rounded border border-border/80 bg-card/60 p-4 text-xs text-muted-foreground">
        <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
        <div className="space-y-1 leading-relaxed">
          <strong className="text-foreground">XAI Compliance Disclaimer:</strong>
          <p>
            Local explanations illustrate mathematical attributions relative to reference values in
            the training baseline. They do not constitute forensic proof of criminality or establish
            real-world legal causation. Compliance officers must perform holistic corroboration
            against source documentation.
          </p>
        </div>
      </div>
    </div>
  );
}
