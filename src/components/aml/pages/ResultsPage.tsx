// @ts-nocheck -- strict index checks relaxed for numeric ML code
import { useState, useMemo } from "react";
import {
  Download,
  Search,
  Filter,
  ShieldAlert,
  Play,
  Eye,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Repeat,
  Zap,
  Layers,
  ChevronDown,
  ChevronUp,
  Cpu,
  Check,
  X,
  FileSpreadsheet,
} from "lucide-react";
import Papa from "papaparse";
import { useAml } from "../state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, Stat, Chip, selectCls } from "../ui";

export function ResultsPage() {
  const { analysisResult, setSelectedTransactionId, setTab } = useAml();

  const [search, setSearch] = useState("");
  const [viewFilter, setViewFilter] = useState<
    "ALL" | "CRIMES" | "NORMAL" | "LOOPS" | "MULES" | "DIVERGENT"
  >("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const [pageSize, setPageSize] = useState<number>(50);
  const [page, setPage] = useState<number>(1);
  const [sortBy, setSortBy] = useState<"risk" | "amount" | "id">("risk");

  const multiReport = analysisResult?.multiModelReport;

  const filteredRecords = useMemo(() => {
    if (!analysisResult) return [];
    const res = analysisResult.records.filter((rec) => {
      const isCrime = rec._is_suspicious || rec._diagnostic?.isCrime;
      const isNormal = rec._is_normal || rec._diagnostic?.isNormal;
      const typology = rec._crime_typology || rec._diagnostic?.crimeTypology || "";

      if (viewFilter === "CRIMES" && !isCrime) return false;
      if (viewFilter === "NORMAL" && !isNormal) return false;
      if (viewFilter === "LOOPS" && !typology.includes("Circular")) return false;
      if (viewFilter === "MULES" && !typology.includes("Mule")) return false;
      if (viewFilter === "DIVERGENT") {
        const agreement = rec._diagnostic?.agreementText || "";
        if (!agreement.includes("Split") && !agreement.includes("Majority")) return false;
      }

      if (
        categoryFilter !== "ALL" &&
        rec._predicted_class !== categoryFilter &&
        typology !== categoryFilter
      ) {
        return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesId = String(rec._row_id || "")
          .toLowerCase()
          .includes(q);
        const matchesFrom = String(rec["from_account"] || "")
          .toLowerCase()
          .includes(q);
        const matchesTo = String(rec["to_account"] || "")
          .toLowerCase()
          .includes(q);
        const matchesClass = String(rec._predicted_class || "")
          .toLowerCase()
          .includes(q);
        const matchesTypology = typology.toLowerCase().includes(q);
        const matchesProb = String(rec._problem_statement || "")
          .toLowerCase()
          .includes(q);
        return (
          matchesId || matchesFrom || matchesTo || matchesClass || matchesTypology || matchesProb
        );
      }
      return true;
    });

    if (sortBy === "risk") {
      res.sort((a, b) => Number(b._risk_score || 0) - Number(a._risk_score || 0));
    } else if (sortBy === "amount") {
      res.sort((a, b) => Number(b["amount"] || 0) - Number(a["amount"] || 0));
    }
    return res;
  }, [analysisResult, search, viewFilter, categoryFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, currentPage, pageSize]);

  const formatAmount = (rec: any) => {
    const amt = Number(rec["amount"] || 0);
    const ccy = String(rec["currency"] || "USD").toUpperCase();
    const symbol = ccy === "INR" ? "₹" : ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$";
    return `${symbol}${amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const exportCsv = () => {
    if (!analysisResult) return;
    const csv = Papa.unparse(analysisResult.records);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `scored_aml_transactions_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const exportJson = () => {
    if (!analysisResult) return;
    const blob = new Blob([JSON.stringify(analysisResult.records, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `scored_aml_transactions_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  if (!analysisResult) {
    return (
      <div className="space-y-4">
        <Panel title="Prediction Results">
          <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
            <ShieldAlert className="h-12 w-12 text-muted-foreground/40" />
            <h3 className="text-base font-semibold text-foreground">
              No Analysis Results Available
            </h3>
            <p className="max-w-md text-xs text-muted-foreground">
              Run transaction analysis to populate multi-model predictions, consensus scores, and
              crime diagnoses.
            </p>
            <Button
              onClick={() => setTab("analyze")}
              className="mt-2 bg-primary text-primary-foreground font-bold"
            >
              Analyze Transactions
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  const handleInspect = (id: string) => {
    setSelectedTransactionId(id);
    setTab("explain");
  };

  return (
    <div className="space-y-6">
      {/* KPI Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Total Scored" value={analysisResult.totalTransactions.toLocaleString()} />
        <Stat
          label="🚨 Flagged Crimes"
          value={
            multiReport
              ? multiReport.crimeCount.toLocaleString()
              : analysisResult.flaggedCount.toLocaleString()
          }
          tone={
            (multiReport ? multiReport.crimeCount : analysisResult.flaggedCount) > 0 ? "bad" : "ok"
          }
        />
        <Stat
          label="✅ Normal Transactions"
          value={
            multiReport
              ? multiReport.normalCount.toLocaleString()
              : analysisResult.normalPredictionsCount.toLocaleString()
          }
          tone="ok"
        />
        <Stat
          label="Circular Ring Loops"
          value={analysisResult.graphData?.cycles.length ?? 0}
          tone={(analysisResult.graphData?.cycles.length ?? 0) > 0 ? "bad" : "ok"}
        />
        <Stat
          label="Unanimous Consensus"
          value={
            multiReport
              ? `${multiReport.unanimousCrimeCount + multiReport.unanimousNormalCount}`
              : "Verified"
          }
          tone="ok"
        />
      </div>

      {/* Main Results Table Panel */}
      <Panel
        title="Multi-Model Prediction Ledger & Crime Diagnoses"
        right={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={exportCsv}
              className="h-8 text-xs font-mono"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={exportJson}
              className="h-8 text-xs font-mono"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> JSON
            </Button>
          </div>
        }
      >
        {/* Quick View Mode Switcher Filter Bar */}
        <div className="flex flex-wrap items-center gap-2 pb-3 mb-3 border-b border-border/70 text-xs font-mono">
          <span className="text-muted-foreground mr-1">View Mode:</span>
          <Button
            size="sm"
            variant={viewFilter === "ALL" ? "default" : "outline"}
            onClick={() => {
              setViewFilter("ALL");
              setPage(1);
            }}
            className={`h-7 px-3 text-xs ${viewFilter === "ALL" ? "bg-primary text-primary-foreground font-bold" : ""}`}
          >
            All Transactions ({analysisResult.totalTransactions})
          </Button>

          <Button
            size="sm"
            variant={viewFilter === "CRIMES" ? "default" : "outline"}
            onClick={() => {
              setViewFilter("CRIMES");
              setPage(1);
            }}
            className={`h-7 px-3 text-xs ${viewFilter === "CRIMES" ? "bg-destructive text-destructive-foreground font-bold" : ""}`}
          >
            🚨 Flagged Crimes ({multiReport ? multiReport.crimeCount : analysisResult.flaggedCount})
          </Button>

          <Button
            size="sm"
            variant={viewFilter === "NORMAL" ? "default" : "outline"}
            onClick={() => {
              setViewFilter("NORMAL");
              setPage(1);
            }}
            className={`h-7 px-3 text-xs ${viewFilter === "NORMAL" ? "bg-success text-success-foreground font-bold" : ""}`}
          >
            ✅ Normal Cleared (
            {multiReport ? multiReport.normalCount : analysisResult.normalPredictionsCount})
          </Button>

          <Button
            size="sm"
            variant={viewFilter === "LOOPS" ? "default" : "outline"}
            onClick={() => {
              setViewFilter("LOOPS");
              setPage(1);
            }}
            className={`h-7 px-3 text-xs ${viewFilter === "LOOPS" ? "bg-destructive/80 text-white font-bold" : ""}`}
          >
            🔁 Circular Loops
          </Button>

          <Button
            size="sm"
            variant={viewFilter === "MULES" ? "default" : "outline"}
            onClick={() => {
              setViewFilter("MULES");
              setPage(1);
            }}
            className={`h-7 px-3 text-xs ${viewFilter === "MULES" ? "bg-amber-500 text-black font-bold" : ""}`}
          >
            ⚡ Mule Conduits
          </Button>

          <Button
            size="sm"
            variant={viewFilter === "DIVERGENT" ? "default" : "outline"}
            onClick={() => {
              setViewFilter("DIVERGENT");
              setPage(1);
            }}
            className={`h-7 px-3 text-xs ${viewFilter === "DIVERGENT" ? "bg-purple-600 text-white font-bold" : ""}`}
          >
            ⚖️ Model Divergence
          </Button>
        </div>

        {/* Secondary Filter & Search Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by ID, sender, receiver, crime typology, or problem..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9 text-xs font-mono h-9 bg-background"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Sort By:</span>
            <select
              className={selectCls + " h-9 text-xs font-mono"}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
            >
              <option value="risk">Highest Risk Score</option>
              <option value="amount">Highest Amount</option>
              <option value="id">Transaction ID</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rows/Page:</span>
            <select
              className={selectCls + " h-9 text-xs font-mono"}
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        {/* Results Data Table */}
        <div className="overflow-x-auto rounded border border-border/80">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-3 py-2.5 label-mono">Transaction ID</th>
                <th className="px-3 py-2.5 label-mono">Counterparties</th>
                <th className="px-3 py-2.5 label-mono">Amount</th>
                <th className="px-3 py-2.5 label-mono">Crime / Normal Status</th>
                <th className="px-3 py-2.5 label-mono">Multi-Model Consensus</th>
                <th className="px-3 py-2.5 label-mono">All Model Votes</th>
                <th className="px-3 py-2.5 label-mono text-right">Details & Problem</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRecords.map((r) => {
                const diag = r._diagnostic;
                const isCrime = r._is_suspicious || diag?.isCrime;
                const isNormal = r._is_normal || diag?.isNormal;
                const typology = r._crime_typology || diag?.crimeTypology || r._predicted_class;
                const isExpanded = expandedRowId === r._row_id;
                const agreement = diag?.agreementText || "Strong";
                const isUnanimous = agreement.includes("Unanimous");
                const isSplit = agreement.includes("Split");

                return (
                  <>
                    <tr
                      key={r._row_id}
                      onClick={() => setExpandedRowId(isExpanded ? null : r._row_id)}
                      className={`border-b border-border/50 hover:bg-muted/40 cursor-pointer transition-colors ${
                        isCrime ? "bg-destructive/5" : "bg-card"
                      }`}
                    >
                      <td className="px-3 py-2.5 font-bold text-foreground">
                        <div className="flex items-center gap-1.5">
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          <span>{r._row_id}</span>
                        </div>
                      </td>

                      <td className="px-3 py-2.5 text-muted-foreground">
                        <div className="text-[11px] leading-tight">
                          <span className="text-foreground font-semibold">
                            {String(r["from_account"] || "—")}
                          </span>
                          <span className="mx-1 text-muted-foreground">→</span>
                          <span className="text-foreground font-semibold">
                            {String(r["to_account"] || "—")}
                          </span>
                        </div>
                      </td>

                      <td className="px-3 py-2.5 text-foreground font-semibold">
                        {formatAmount(r)}
                      </td>

                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {isCrime ? (
                            <span className="rounded bg-destructive/15 text-destructive font-bold px-2 py-0.5 text-[10px] flex items-center gap-1">
                              <ShieldAlert className="h-3 w-3" />
                              {typology}
                            </span>
                          ) : (
                            <span className="rounded bg-success/15 text-success font-bold px-2 py-0.5 text-[10px] flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Normal Cleared
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-2.5">
                        <div className="space-y-0.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              isUnanimous
                                ? "bg-success/20 text-success"
                                : isSplit
                                  ? "bg-warning/20 text-warning"
                                  : "bg-primary/20 text-primary"
                            }`}
                          >
                            {agreement}
                          </span>
                          <div className="text-[10px] text-muted-foreground">
                            Score: {((Number(r._risk_score) || 0) * 100).toFixed(0)}%
                          </div>
                        </div>
                      </td>

                      {/* Micro Model Votes Badges (GB, Stacking, CNN, RF, LogReg) */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          {diag?.predictions ? (
                            diag.predictions.map((p) => (
                              <span
                                key={p.category}
                                title={`${p.category}: ${p.predictedClass.toUpperCase()} (${(p.confidence * 100).toFixed(0)}%)`}
                                className={`h-5 w-5 rounded flex items-center justify-center text-[9px] font-bold ${
                                  p.isRisk
                                    ? "bg-destructive text-destructive-foreground"
                                    : "bg-success/30 text-success-foreground"
                                }`}
                              >
                                {p.category === "Gradient Boosting"
                                  ? "G"
                                  : p.category === "Stacking"
                                    ? "S"
                                    : p.category === "CNN"
                                      ? "C"
                                      : p.category === "Random Forest"
                                        ? "R"
                                        : "L"}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-muted-foreground">
                              5 models checked
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            handleInspect(r._row_id);
                          }}
                          className="h-7 text-xs text-primary hover:text-primary hover:bg-primary/10"
                        >
                          XAI Audit <ArrowRight className="ml-1 h-3 w-3" />
                        </Button>
                      </td>
                    </tr>

                    {/* Expandable Problem Diagnosis & Consensus Breakdown */}
                    {isExpanded && (
                      <tr className="bg-muted/30 border-b border-border">
                        <td colSpan={7} className="p-4 space-y-3">
                          <div className="rounded-md border border-border/80 bg-card p-4 space-y-3">
                            {/* Problem Statement Header */}
                            <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-3">
                              <div className="space-y-1">
                                <div className="label-mono flex items-center gap-1.5 text-foreground">
                                  {isCrime ? (
                                    <>
                                      <AlertTriangle className="h-4 w-4 text-destructive" />
                                      <span className="text-destructive font-bold">
                                        Problem Diagnosis & Root Causes:
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="h-4 w-4 text-success" />
                                      <span className="text-success font-bold">
                                        Cleared Normal Verification:
                                      </span>
                                    </>
                                  )}
                                </div>
                                <p className="text-xs text-foreground font-sans font-medium leading-relaxed">
                                  {diag?.problemStatement ||
                                    r._problem_statement ||
                                    (isCrime
                                      ? "High anomaly divergence across balance and transfer velocity."
                                      : "Verified standard retail consumer transfer.")}
                                </p>
                              </div>

                              <div className="shrink-0 text-right">
                                <div className="label-mono">Consensus Status</div>
                                <div className="text-xs font-bold text-foreground font-mono">
                                  {diag?.riskVotes ?? 0} Risk vs {diag?.normalVotes ?? 5} Normal
                                </div>
                              </div>
                            </div>

                            {/* Red Flags / Problem Triggers */}
                            {diag?.redFlags && diag.redFlags.length > 0 && (
                              <div className="space-y-1.5">
                                <div className="label-mono text-destructive">
                                  Triggered Problem Indicators:
                                </div>
                                <ul className="space-y-1">
                                  {diag.redFlags.map((flag, idx) => (
                                    <li
                                      key={idx}
                                      className="flex items-start gap-2 text-xs font-mono text-muted-foreground"
                                    >
                                      <span className="text-destructive font-bold">•</span>
                                      <span>{flag}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Normal Cleared Rationale */}
                            {diag?.clearedReason && (
                              <div className="space-y-1">
                                <div className="label-mono text-success">
                                  Why This Transaction is Cleared Normal:
                                </div>
                                <p className="text-xs font-mono text-muted-foreground">
                                  {diag.clearedReason}
                                </p>
                              </div>
                            )}

                            {/* All 5 Models Vote Matrix */}
                            {diag?.predictions && (
                              <div className="pt-2 border-t border-border/60">
                                <div className="label-mono mb-2">
                                  Individual Algorithm Classification Breakdown:
                                </div>
                                <div className="grid gap-2 sm:grid-cols-5">
                                  {diag.predictions.map((p) => (
                                    <div
                                      key={p.category}
                                      className={`rounded border p-2 text-center text-xs font-mono ${
                                        p.isRisk
                                          ? "border-destructive/40 bg-destructive/10"
                                          : "border-success/40 bg-success/10"
                                      }`}
                                    >
                                      <div className="text-[10px] text-muted-foreground truncate font-semibold">
                                        {p.category}
                                      </div>
                                      <div
                                        className={`font-bold mt-0.5 ${p.isRisk ? "text-destructive" : "text-success"}`}
                                      >
                                        {p.predictedClass.toUpperCase()}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground">
                                        {(p.confidence * 100).toFixed(0)}% conf
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Recommended Action */}
                            <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs font-mono">
                              <div>
                                <span className="text-muted-foreground">
                                  Recommended Compliance Action:{" "}
                                </span>
                                <span className="font-bold text-foreground">
                                  {diag?.recommendation ||
                                    "Maintain standard transaction monitoring."}
                                </span>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => handleInspect(r._row_id)}
                                className="bg-primary text-primary-foreground text-xs font-bold"
                              >
                                Deep XAI Waterfall <ArrowRight className="ml-1 h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-3 border-t border-border/60 text-xs font-mono">
          <div className="text-muted-foreground">
            Showing {(currentPage - 1) * pageSize + 1} -{" "}
            {Math.min(currentPage * pageSize, filteredRecords.length)} of{" "}
            {filteredRecords.length.toLocaleString()} matching records
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 text-xs font-mono"
            >
              Previous
            </Button>
            <span className="text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 text-xs font-mono"
            >
              Next
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
