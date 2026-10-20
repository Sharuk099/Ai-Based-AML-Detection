import {
  Printer,
  Download,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Calendar,
} from "lucide-react";
import { useAml } from "../state";
import { Button } from "@/components/ui/button";
import { Panel, Stat, DataTable, Chip } from "../ui";

export function ReportPage() {
  const { analysisResult, activeModel, setTab } = useAml();

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadDossier = () => {
    if (!analysisResult) return;
    const dossier = {
      reportType: "AML_COMPLIANCE_INVESTIGATION_DOSSIER",
      generatedAt: new Date().toISOString(),
      dataset: analysisResult.datasetName,
      modelUsed: analysisResult.modelUsed,
      modelId: analysisResult.modelId,
      executiveSummary: {
        totalAudited: analysisResult.totalTransactions,
        flaggedAlerts: analysisResult.flaggedCount,
        flaggedPercentage: analysisResult.flaggedPct,
        highRiskCritical: analysisResult.highRiskCount,
        categoryBreakdown: analysisResult.categoryBreakdown,
      },
      graphTypologies: {
        totalAccounts: analysisResult.graphData?.nodes ?? 0,
        totalEdges: analysisResult.graphData?.edges ?? 0,
        circularLayeringRings: analysisResult.graphData?.cycles ?? [],
        suspiciousIndicators: analysisResult.graphData?.indicators ?? [],
      },
      topHighRiskRecords: analysisResult.records
        .filter((r) => r._risk_level === "HIGH")
        .slice(0, 50),
      humanReviewRequirement:
        "MANDATORY - Machine learning output requires corroborating human investigation prior to SAR filing.",
    };

    const blob = new Blob([JSON.stringify(dossier, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `aml_investigation_dossier_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  if (!analysisResult) {
    return (
      <div className="space-y-4">
        <Panel title="Investigation Report">
          <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
            <FileText className="h-12 w-12 text-muted-foreground/40" />
            <h3 className="text-base font-semibold text-foreground">
              No Active Investigation Dossier
            </h3>
            <p className="max-w-md text-xs text-muted-foreground">
              Run transaction analysis to generate an automated executive investigation report,
              typology findings, and audit trail.
            </p>
            <Button
              onClick={() => setTab("analyze")}
              className="mt-2 bg-primary text-primary-foreground"
            >
              Analyze Transactions
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  const highRiskRecords = analysisResult.records.filter((r) => r._risk_level === "HIGH");

  const formatAmount = (rec: any) => {
    const amt = Number(rec["amount"] || 0);
    const ccy = String(rec["currency"] || "USD").toUpperCase();
    const symbol = ccy === "INR" ? "₹" : ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$";
    return `${symbol}${amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Action Bar (hidden on print) */}
      <div className="flex items-center justify-between panel p-4 bg-card print:hidden">
        <div>
          <h2 className="font-semibold text-foreground text-sm">
            Formal AML Compliance Dossier & SAR Generator
          </h2>
          <p className="text-xs text-muted-foreground font-mono">
            Generated on {new Date(analysisResult.analyzedAt).toLocaleString()} ·{" "}
            {analysisResult.datasetName}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handlePrint}
            className="bg-primary text-primary-foreground text-xs font-bold"
          >
            <Printer className="mr-1.5 h-3.5 w-3.5" /> Print / Save PDF
          </Button>
          <Button size="sm" variant="outline" onClick={handleDownloadDossier} className="text-xs">
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export Dossier JSON
          </Button>
        </div>
      </div>

      {/* Printable Formal Dossier Sheet */}
      <div className="panel p-8 bg-card space-y-8 border-border/80 shadow-md">
        {/* Document Header */}
        <div className="border-b border-border pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold tracking-tight text-foreground">
                ANTI-MONEY LAUNDERING INVESTIGATION REPORT (SAR)
              </span>
            </div>
            <p className="text-xs font-mono text-muted-foreground">
              CONFIDENTIAL · FINANCIAL CRIME COMPLIANCE DIVISION · STRICT AUDIT ACCESS
            </p>
          </div>
          <div className="text-right text-xs font-mono text-muted-foreground space-y-0.5">
            <div>
              Case ID: <b className="text-foreground">SAR-{Date.now().toString().slice(-8)}</b>
            </div>
            <div>
              Date:{" "}
              <b className="text-foreground">
                {new Date(analysisResult.analyzedAt).toLocaleDateString()}
              </b>
            </div>
            <div>
              Framework: <b className="text-foreground">RBI PMLA / FIU-IND & FATF</b>
            </div>
          </div>
        </div>

        {/* Executive Summary */}
        <div className="space-y-3">
          <h3 className="label-mono text-foreground font-bold">
            1. Executive Summary & Audit Findings
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Automated machine learning and graph topology screening was executed on batch file{" "}
            <b>{analysisResult.datasetName}</b> containing{" "}
            <b>{analysisResult.totalTransactions.toLocaleString()}</b> financial transactions. The
            screening engine raised <b>{analysisResult.flaggedCount.toLocaleString()}</b> anomaly
            flags (<b>{analysisResult.flaggedPct}%</b> of audited transactions), including{" "}
            <b>{analysisResult.highRiskCount.toLocaleString()}</b> classified at High Risk Critical
            priority.
          </p>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 pt-2">
            <Stat
              label="Audited Transactions"
              value={analysisResult.totalTransactions.toLocaleString()}
            />
            <Stat
              label="Flagged Anomalies"
              value={analysisResult.flaggedCount.toLocaleString()}
              tone={analysisResult.flaggedCount > 0 ? "bad" : "ok"}
            />
            <Stat
              label="High Risk Critical"
              value={analysisResult.highRiskCount.toLocaleString()}
              tone={analysisResult.highRiskCount > 0 ? "bad" : "ok"}
            />
            <Stat
              label="Circular Layering Loops"
              value={analysisResult.graphData?.cycles.length ?? 0}
              tone={(analysisResult.graphData?.cycles.length ?? 0) > 0 ? "bad" : "ok"}
            />
          </div>
        </div>

        {/* Classification Distribution */}
        <div className="space-y-3 border-t border-border pt-6">
          <h3 className="label-mono text-foreground font-bold">
            2. Detected AML Typology Distribution
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 label-mono">Predicted AML Typology</th>
                  <th className="px-3 py-2 label-mono">Transaction Count</th>
                  <th className="px-3 py-2 label-mono">Percentage of Total</th>
                  <th className="px-3 py-2 label-mono">Risk Stratification</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(analysisResult.categoryBreakdown).map(([cat, count]) => {
                  const pct = ((count / analysisResult.totalTransactions) * 100).toFixed(1);
                  const isRisk =
                    /laundering|fraud|darknet|blackmail|blacklist|ponzi|tumbler|structuring|mule|circular|velocity/i.test(
                      cat,
                    );
                  return (
                    <tr key={cat} className="border-b border-border/50">
                      <td className="px-3 py-2 font-semibold text-foreground">{cat}</td>
                      <td className="px-3 py-2">{count.toLocaleString()}</td>
                      <td className="px-3 py-2">{pct}%</td>
                      <td className="px-3 py-2">
                        <Chip tone={isRisk ? "bad" : "ok"}>
                          {isRisk ? "SUSPICIOUS / ELEVATED" : "STANDARD / NORMAL"}
                        </Chip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Graph Typologies & Loops */}
        {analysisResult.graphData && (
          <div className="space-y-3 border-t border-border pt-6">
            <h3 className="label-mono text-foreground font-bold">
              3. Network Graph Typology Evidence
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Network counterparty analysis identified{" "}
              <b>{analysisResult.graphData.nodes.toLocaleString()}</b> distinct entities across{" "}
              <b>{analysisResult.graphData.edges.toLocaleString()}</b> transaction links.
            </p>

            {analysisResult.graphData.cycles.length > 0 && (
              <div className="space-y-2 mt-2">
                <div className="label-mono text-destructive">
                  Identified Circular Layering Rings:
                </div>
                {analysisResult.graphData.cycles.slice(0, 5).map((cyc, idx) => (
                  <div
                    key={idx}
                    className="rounded border border-destructive/40 bg-destructive/5 p-2 font-mono text-xs text-foreground"
                  >
                    <b>Ring #{idx + 1}:</b> {cyc.join(" ➔ ")} ➔ {cyc[0]}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* High Risk Flagged Transactions Sample */}
        <div className="space-y-3 border-t border-border pt-6">
          <h3 className="label-mono text-foreground font-bold">
            4. Priority High-Risk Transaction Alerts (Top 10)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 label-mono">Tx ID</th>
                  <th className="px-3 py-2 label-mono">Sender</th>
                  <th className="px-3 py-2 label-mono">Receiver</th>
                  <th className="px-3 py-2 label-mono">Amount</th>
                  <th className="px-3 py-2 label-mono">Classification</th>
                  <th className="px-3 py-2 label-mono">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {highRiskRecords.slice(0, 10).map((r) => (
                  <tr key={r._row_id} className="border-b border-border/50">
                    <td className="px-3 py-2 font-bold text-foreground">{r._row_id}</td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[140px]">
                      {String(r["from_account"] || "—")}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[140px]">
                      {String(r["to_account"] || "—")}
                    </td>
                    <td className="px-3 py-2 font-semibold text-foreground">{formatAmount(r)}</td>
                    <td className="px-3 py-2 text-destructive font-bold">{r._predicted_class}</td>
                    <td className="px-3 py-2">
                      {((Number(r._confidence) || 0) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
                {highRiskRecords.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">
                      No High Risk critical alerts detected in this dataset.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Regulatory Advisory & Sign-off Block */}
        <div className="border-t border-border pt-6 space-y-4">
          <div className="flex items-start gap-3 rounded border border-warning/50 bg-warning/10 p-4 text-xs text-foreground">
            <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
            <div className="space-y-1">
              <strong className="block text-warning font-bold">
                Mandatory Statutory & Compliance Review:
              </strong>
              <p className="text-muted-foreground leading-relaxed">
                In compliance with Reserve Bank of India (RBI Master Direction - KYC/AML Directions
                2016, PMLA 2002 / FIU-IND) and global FinCEN / FATF guidelines, automated machine
                learning and graph typologies serve as decision-support indicators. A formal
                Suspicious Activity Report (SAR / STR) must only be transmitted after corroborating
                verification by a designated compliance officer.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 pt-4 font-mono text-xs">
            <div className="border-t border-border pt-2 space-y-1">
              <span className="label-mono">Screening System Signature:</span>
              <div className="text-foreground">AI Studio AML Engine · v1.0 Production</div>
            </div>
            <div className="border-t border-border pt-2 space-y-1">
              <span className="label-mono">Compliance Officer Review & Approval:</span>
              <div className="text-muted-foreground italic">Signature / Review Date Pending</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
