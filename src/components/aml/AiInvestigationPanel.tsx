import { useState, useEffect } from "react";
import {
  Sparkles,
  ShieldAlert,
  Download,
  Printer,
  Save,
  Copy,
  Check,
  RefreshCw,
  Search,
  AlertTriangle,
  FileText,
  Bookmark,
  ChevronDown,
  ChevronUp,
  FileCode,
  Layers,
  ArrowRight,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, Note, Chip, Stat } from "./ui";
import { toast } from "sonner";
import type { AnalysisResult } from "./state";
import { AccountsUnderInvestigation } from "./AccountsUnderInvestigation";

interface SavedDossier {
  id: string;
  timestamp: string;
  datasetName: string;
  flaggedCount: number;
  highRiskCount: number;
  reportMarkdown: string;
}

export function AiInvestigationPanel({
  analysisResult,
  selectedTransactionId,
}: {
  analysisResult: AnalysisResult;
  selectedTransactionId?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [aiReport, setAiReport] = useState<string>("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [copied, setCopied] = useState(false);
  const [savedDossiers, setSavedDossiers] = useState<SavedDossier[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Load saved dossiers from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("aml_saved_investigations");
      if (stored) {
        setSavedDossiers(JSON.parse(stored));
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const runInvestigation = async (overridePrompt?: string) => {
    setLoading(true);
    const query = overridePrompt ?? customPrompt;
    try {
      // Extract top typologies
      const topTypologies = Object.entries(analysisResult.categoryBreakdown || {}).map(
        ([category, count]) => ({ category, count }),
      );

      // Extract flagged accounts from records & graph
      const accountMap = new Map<
        string,
        {
          accountId: string;
          riskScore: number;
          typology: string;
          inflow: number;
          outflow: number;
          counterparties: Set<string>;
        }
      >();

      for (const r of analysisResult.records) {
        const fromAcc = String(r["from_account"] || r["account_id"] || "");
        const toAcc = String(r["to_account"] || "");
        const amt = Number(r["amount"] || 0);
        const score = Number(r._risk_score || 0);
        const typo = String(r._crime_typology || r._predicted_class || "Suspicious");

        if (fromAcc) {
          if (!accountMap.has(fromAcc)) {
            accountMap.set(fromAcc, {
              accountId: fromAcc,
              riskScore: score,
              typology: typo,
              inflow: 0,
              outflow: 0,
              counterparties: new Set(),
            });
          }
          const acc = accountMap.get(fromAcc)!;
          const directInflow = Number(r["monthly_inflow"] || r["inflow"] || 0);
          const directOutflow = Number(r["monthly_outflow"] || r["outflow"] || 0);
          if (directInflow > 0 || directOutflow > 0) {
            acc.inflow = Math.max(acc.inflow, directInflow);
            acc.outflow = Math.max(acc.outflow, directOutflow);
          } else {
            acc.outflow += amt;
          }
          if (score > acc.riskScore) {
            acc.riskScore = score;
            acc.typology = typo;
          }
          if (toAcc) acc.counterparties.add(toAcc);
        }

        if (toAcc) {
          if (!accountMap.has(toAcc)) {
            accountMap.set(toAcc, {
              accountId: toAcc,
              riskScore: score,
              typology: typo,
              inflow: 0,
              outflow: 0,
              counterparties: new Set(),
            });
          }
          const acc = accountMap.get(toAcc)!;
          acc.inflow += amt;
          if (fromAcc) acc.counterparties.add(fromAcc);
        }
      }

      const flaggedAccounts = Array.from(accountMap.values())
        .filter((a) => a.riskScore > 0.4 || a.typology !== "Normal")
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, 15)
        .map((a) => ({
          accountId: a.accountId,
          riskScore: a.riskScore,
          typology: a.typology,
          inflow: Math.round(a.inflow),
          outflow: Math.round(a.outflow),
          turnoverRatio: a.inflow > 0 ? Number((a.outflow / a.inflow).toFixed(2)) : undefined,
          counterparties: Array.from(a.counterparties).slice(0, 5),
        }));

      // Extract high risk transactions
      const flaggedTransactions = analysisResult.records
        .filter((r) => r._risk_level === "HIGH" || r._risk_score > 0.6)
        .slice(0, 12)
        .map((r) => ({
          txId: String(r._row_id || r["transaction_id"] || "TXN"),
          from: String(r["from_account"] || "Unknown"),
          to: String(r["to_account"] || "Unknown"),
          amount: Number(r["amount"] || 0),
          currency: String(r["currency"] || "USD"),
          channel: String(r["payment_format"] || r["channel"] || "Standard"),
          timestamp: String(r["timestamp"] || ""),
          typology: String(r._crime_typology || r._predicted_class || "Suspicious"),
        }));

      const payload = {
        datasetName: analysisResult.datasetName,
        totalTransactions: analysisResult.totalTransactions,
        flaggedCount: analysisResult.flaggedCount,
        highRiskCount: analysisResult.highRiskCount,
        normalCount: analysisResult.normalPredictionsCount,
        circularLoopsCount: analysisResult.graphData?.cycles?.length || 0,
        topTypologies,
        flaggedAccounts,
        flaggedTransactions,
        customQuery: query || undefined,
      };

      const res = await fetch("/api/gemini/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Investigation generation failed (${res.status})`);
      }

      const data = await res.json();
      if (data.report) {
        setAiReport(data.report);
        toast.success("AI Forensic Investigation generated successfully!");
      } else {
        throw new Error(data.error || "Empty response from AI investigator.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error generating AI report";
      console.error(err);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const saveToArchive = () => {
    if (!aiReport) return;
    try {
      const newDossier: SavedDossier = {
        id: `SAR-${Date.now().toString().slice(-6)}`,
        timestamp: new Date().toLocaleString(),
        datasetName: analysisResult.datasetName,
        flaggedCount: analysisResult.flaggedCount,
        highRiskCount: analysisResult.highRiskCount,
        reportMarkdown: aiReport,
      };
      const updated = [newDossier, ...savedDossiers.slice(0, 19)];
      setSavedDossiers(updated);
      localStorage.setItem("aml_saved_investigations", JSON.stringify(updated));
      toast.success(`Dossier ${newDossier.id} saved to Investigation Archive!`);
    } catch {
      toast.error("Failed to save dossier to local archive.");
    }
  };

  const deleteFromArchive = (id: string, ev: React.MouseEvent) => {
    ev.stopPropagation();
    try {
      const updated = savedDossiers.filter((d) => d.id !== id);
      setSavedDossiers(updated);
      localStorage.setItem("aml_saved_investigations", JSON.stringify(updated));
      toast.success(`Dossier ${id} removed from archive`);
    } catch {
      toast.error("Failed to update archive");
    }
  };

  const copyToClipboard = () => {
    if (!aiReport) return;
    navigator.clipboard.writeText(aiReport);
    setCopied(true);
    toast.success("AI Investigation Narrative copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadMarkdown = () => {
    if (!aiReport) return;
    const blob = new Blob([aiReport], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `AML_AI_Investigation_Dossier_${analysisResult.datasetName.replace(/[^a-zA-Z0-9]/g, "_")}.md`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Investigation report (.md) downloaded!");
  };

  const downloadJson = () => {
    const fullData = {
      caseId: `AML-CASE-${Date.now()}`,
      datasetName: analysisResult.datasetName,
      generatedAt: new Date().toISOString(),
      summary: {
        totalTransactions: analysisResult.totalTransactions,
        flaggedTransactions: analysisResult.flaggedCount,
        highRiskTransactions: analysisResult.highRiskCount,
        normalTransactions: analysisResult.normalPredictionsCount,
        circularLoops: analysisResult.graphData?.cycles?.length || 0,
      },
      typologies: analysisResult.categoryBreakdown,
      aiInvestigationNarrative: aiReport || "Not yet generated",
      highRiskRecords: analysisResult.records.filter((r) => r._risk_level === "HIGH").slice(0, 50),
    };

    const blob = new Blob([JSON.stringify(fullData, null, 2)], {
      type: "application/json;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `AML_Audit_Dossier_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Full investigation JSON dossier downloaded!");
  };

  const downloadCsv = () => {
    const flagged = analysisResult.records.filter(
      (r) => r._risk_level === "HIGH" || r._risk_level === "MEDIUM",
    );
    if (!flagged.length) {
      toast.info("No flagged transactions to export.");
      return;
    }

    const headers = [
      "transaction_id",
      "from_account",
      "to_account",
      "amount",
      "currency",
      "payment_format",
      "risk_level",
      "risk_score",
      "predicted_typology",
    ];
    const rows = flagged.map((r) => [
      String(r._row_id || r["transaction_id"] || ""),
      String(r["from_account"] || ""),
      String(r["to_account"] || ""),
      String(r["amount"] || 0),
      String(r["currency"] || "USD"),
      String(r["payment_format"] || r["channel"] || "Wire"),
      String(r._risk_level || "HIGH"),
      String(Number(r._risk_score || 0).toFixed(4)),
      String(r._crime_typology || r._predicted_class || ""),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((val) => `"${val}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `AML_Flagged_Transactions_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Flagged transactions CSV downloaded!");
  };

  const triggerPrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Main AI Forensic Controller */}
      <Panel
        title={
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary animate-pulse" />
            <span>AI Forensic Investigator & Explainability Engine</span>
          </div>
        }
        right={
          <div className="flex items-center gap-2">
            {savedDossiers.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHistory(!showHistory)}
                className="text-xs h-8 border-border text-foreground hover:bg-muted font-mono"
              >
                <Bookmark className="mr-1.5 h-3.5 w-3.5 text-primary" />
                Archive ({savedDossiers.length})
                {showHistory ? (
                  <ChevronUp className="ml-1 h-3 w-3" />
                ) : (
                  <ChevronDown className="ml-1 h-3 w-3" />
                )}
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => runInvestigation()}
              disabled={loading}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-xs h-8 shadow"
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Analyzing..." : "Generate AI Investigation"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Powered by <b>Gemini AI (Google DeepMind)</b>. Examines multi-model confidence scores,
            counterparty network topology, transaction structuring, and velocity bursts to explain{" "}
            <b>what the problem was</b>, <b>which accounts need urgent investigation</b>, and{" "}
            <b>recommended regulatory actions</b>.
          </p>

          {/* Quick Prompts Bar */}
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="text-[11px] font-mono text-muted-foreground self-center mr-1">
              Quick Focus:
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() =>
                runInvestigation(
                  "Identify all accounts exhibiting structuring or smurfing below regulatory reporting thresholds, and explain their exact transaction velocity.",
                )
              }
              className="text-xs h-7 border-border hover:border-primary/60 hover:bg-muted/60"
            >
              🚨 Structuring & Smurfing
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() =>
                runInvestigation(
                  "Which accounts are functioning as pass-through money mule conduits? Detail their turnover ratios and connected sender/receiver pairs.",
                )
              }
              className="text-xs h-7 border-border hover:border-primary/60 hover:bg-muted/60"
            >
              ⚡ Pass-Through Mules
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() =>
                runInvestigation(
                  "Analyze circular fund recycling rings and isolate which counterparties are looping funds back to originators.",
                )
              }
              className="text-xs h-7 border-border hover:border-primary/60 hover:bg-muted/60"
            >
              🔄 Circular Layering Loops
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() =>
                runInvestigation(
                  "Draft an official, regulatory-compliant Suspicious Activity Report (SAR / STR) narrative ready for compliance submission.",
                )
              }
              className="text-xs h-7 border-border hover:border-primary/60 hover:bg-muted/60"
            >
              📝 Draft Official SAR Narrative
            </Button>
          </div>

          {/* Custom Investigator Query Input */}
          <div className="flex gap-2 pt-2">
            <Input
              placeholder="Ask the AI Investigator (e.g. 'Explain why account ACC-1002 was flagged' or 'Draft a freeze request')..."
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loading) runInvestigation();
              }}
              className="h-9 text-xs"
            />
            <Button
              size="sm"
              onClick={() => runInvestigation()}
              disabled={loading}
              className="bg-primary text-primary-foreground font-semibold px-4 h-9 shrink-0 text-xs"
            >
              <Search className="mr-1.5 h-3.5 w-3.5" /> Ask AI
            </Button>
          </div>

          {/* Saved Investigation Archive Dropdown */}
          {showHistory && savedDossiers.length > 0 && (
            <div className="rounded-lg border border-border/80 bg-card p-3 space-y-2 mt-3">
              <div className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Saved Investigation Dossiers ({savedDossiers.length})</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  Stored in local compliance archive
                </span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {savedDossiers.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => {
                      setAiReport(d.reportMarkdown);
                      setShowHistory(false);
                      toast.info(`Loaded dossier ${d.id}`);
                    }}
                    className="p-2.5 rounded border border-border/60 hover:border-primary/60 bg-muted/30 hover:bg-muted/70 cursor-pointer flex items-center justify-between transition-all"
                  >
                    <div>
                      <div className="font-mono text-xs font-bold text-foreground">{d.id}</div>
                      <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                        {d.datasetName} · {d.flaggedCount} flagged · {d.timestamp}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(ev) => deleteFromArchive(d.id, ev)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="Delete from archive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-primary font-bold"
                      >
                        Open <ArrowRight className="ml-1 h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Panel>

      {/* Visual Accounts Under Investigation Section */}
      <AccountsUnderInvestigation analysisResult={analysisResult} />

      {/* AI Report Output Panel */}
      {aiReport && (
        <Panel
          title={
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span>Forensic Investigation Intelligence & Case Dossier</span>
            </div>
          }
          right={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={saveToArchive}
                className="text-xs h-8 border-border text-foreground hover:bg-muted font-mono"
              >
                <Save className="mr-1.5 h-3.5 w-3.5 text-primary" /> Save
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={copyToClipboard}
                className="text-xs h-8 border-border text-foreground hover:bg-muted font-mono"
              >
                {copied ? (
                  <Check className="mr-1.5 h-3.5 w-3.5 text-success" />
                ) : (
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={downloadMarkdown}
                className="text-xs h-8 border-border text-foreground hover:bg-muted font-mono"
              >
                <Download className="mr-1.5 h-3.5 w-3.5 text-primary" /> .MD
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={downloadJson}
                className="text-xs h-8 border-border text-foreground hover:bg-muted font-mono"
              >
                <FileCode className="mr-1.5 h-3.5 w-3.5 text-primary" /> .JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={downloadCsv}
                className="text-xs h-8 border-border text-foreground hover:bg-muted font-mono"
              >
                <Layers className="mr-1.5 h-3.5 w-3.5 text-primary" /> .CSV
              </Button>
              <Button
                size="sm"
                onClick={triggerPrint}
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-xs h-8 font-mono shadow"
              >
                <Printer className="mr-1.5 h-3.5 w-3.5" /> Print / PDF
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Quick Status Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs font-mono">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-destructive" />
                <span className="font-bold text-foreground">
                  Official AML Case Dossier Generated
                </span>
                <Chip tone="bad">{analysisResult.highRiskCount} High Risk Priority</Chip>
              </div>
              <div className="text-muted-foreground text-[11px]">
                Target: <b>{analysisResult.datasetName}</b> · Status:{" "}
                <b className="text-warning">Action Required</b>
              </div>
            </div>

            {/* Formatted Markdown Output */}
            <div className="prose prose-invert max-w-none text-xs leading-relaxed space-y-4 p-4 rounded-lg bg-card/60 border border-border/80 font-sans break-words whitespace-pre-wrap">
              {aiReport}
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
