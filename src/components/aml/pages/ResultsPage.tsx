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
} from "lucide-react";
import Papa from "papaparse";
import { useAml } from "../state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, Stat, DataTable, Chip, selectCls } from "../ui";

export function ResultsPage() {
  const { analysisResult, setSelectedTransactionId, setTab } = useAml();

  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  const [pageSize, setPageSize] = useState<number>(50);
  const [page, setPage] = useState<number>(1);
  const [sortBy, setSortBy] = useState<"risk" | "amount" | "id">("risk");

  const filteredRecords = useMemo(() => {
    if (!analysisResult) return [];
    const res = analysisResult.records.filter((rec) => {
      if (riskFilter !== "ALL" && rec._risk_level !== riskFilter) return false;
      if (categoryFilter !== "ALL" && rec._predicted_class !== categoryFilter) return false;
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
        return matchesId || matchesFrom || matchesTo || matchesClass;
      }
      return true;
    });

    if (sortBy === "risk") {
      res.sort((a, b) => Number(b._risk_score || 0) - Number(a._risk_score || 0));
    } else if (sortBy === "amount") {
      res.sort((a, b) => Number(b["amount"] || 0) - Number(a["amount"] || 0));
    }
    return res;
  }, [analysisResult, search, riskFilter, categoryFilter, sortBy]);

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
              Run transaction analysis to populate model predictions, confidence scores, and alert
              flags.
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
          label="High Risk Critical"
          value={analysisResult.highRiskCount.toLocaleString()}
          tone={analysisResult.highRiskCount > 0 ? "bad" : "ok"}
        />
      </div>

      {/* Independent Ground-Truth Target Label Evaluation Card */}
      {analysisResult.evaluationVsGroundTruth && (
        <Panel
          title={
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span>
                Independent Model Evaluation vs Target Label (
                <code className="text-primary font-mono text-xs">
                  {analysisResult.evaluationVsGroundTruth.targetColumn}
                </code>
                )
              </span>
            </div>
          }
          right={
            <span className="text-xs font-mono text-muted-foreground">
              Evaluated on {analysisResult.evaluationVsGroundTruth.n} Records
            </span>
          }
        >
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Model predictions were generated independently without knowledge of the target label
              or synthetic metadata. Ground-truth labels were compared only after predictions were
              produced to verify true classification performance.
            </p>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label="Accuracy"
                value={`${(analysisResult.evaluationVsGroundTruth.accuracy * 100).toFixed(1)}%`}
                tone="ok"
              />
              <Stat
                label="Precision (Risk)"
                value={`${(analysisResult.evaluationVsGroundTruth.precision * 100).toFixed(1)}%`}
                tone="ok"
              />
              <Stat
                label="Recall (Risk)"
                value={`${(analysisResult.evaluationVsGroundTruth.recall * 100).toFixed(1)}%`}
                tone="ok"
              />
              <Stat
                label="F1-Score (Risk)"
                value={`${(analysisResult.evaluationVsGroundTruth.f1 * 100).toFixed(1)}%`}
                tone="ok"
              />
            </div>

            {/* Confusion Matrix Table */}
            <div className="border-t border-border/60 pt-3">
              <div className="label-mono mb-2 text-xs font-semibold text-foreground">
                Confusion Matrix (Model Output vs Ground-Truth):
              </div>
              <div className="overflow-x-auto">
                <table className="w-full max-w-lg text-xs font-mono border border-border">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border">
                      <th className="p-2.5 border-r border-border text-muted-foreground text-left">
                        Actual \ Predicted
                      </th>
                      <th className="p-2.5 border-r border-border text-center text-destructive font-bold">
                        Predicted Risk
                      </th>
                      <th className="p-2.5 text-center text-success font-bold">Predicted Normal</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border">
                      <td className="p-2.5 border-r border-border font-bold text-muted-foreground">
                        Actual Risk
                      </td>
                      <td className="p-2.5 border-r border-border text-center bg-destructive/10 font-bold text-foreground">
                        {analysisResult.evaluationVsGroundTruth.confusionMatrix.trueRisk} (True
                        Risk)
                      </td>
                      <td className="p-2.5 text-center bg-muted/20 font-bold text-foreground">
                        {analysisResult.evaluationVsGroundTruth.confusionMatrix.falseNormal} (False
                        Normal)
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2.5 border-r border-border font-bold text-muted-foreground">
                        Actual Normal
                      </td>
                      <td className="p-2.5 border-r border-border text-center bg-muted/20 font-bold text-foreground">
                        {analysisResult.evaluationVsGroundTruth.confusionMatrix.falseRisk} (False
                        Risk)
                      </td>
                      <td className="p-2.5 text-center bg-success/10 font-bold text-foreground">
                        {analysisResult.evaluationVsGroundTruth.confusionMatrix.trueNormal} (True
                        Normal)
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* Filter and Search Bar */}
      <Panel
        title={`Transactions Table (${filteredRecords.length.toLocaleString()} of ${analysisResult.totalTransactions.toLocaleString()})`}
        right={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={exportCsv} className="text-xs">
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
            </Button>
            <Button size="sm" variant="outline" onClick={exportJson} className="text-xs">
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export JSON
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by ID, Account, or Category..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-8 text-xs font-mono h-9"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Risk:</span>
            <select
              className={selectCls + " h-9 text-xs font-mono"}
              value={riskFilter}
              onChange={(e) => {
                setRiskFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">All Risk Levels</option>
              <option value="HIGH">High Risk Only</option>
              <option value="MEDIUM">Medium Risk Only</option>
              <option value="LOW">Low / Normal Only</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Category:</span>
            <select
              className={selectCls + " h-9 text-xs font-mono"}
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">All Categories</option>
              {analysisResult.classes.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
            </select>
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
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={500}>500</option>
            </select>
          </div>
        </div>

        {/* Results Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="px-3 py-2 label-mono">Transaction ID</th>
                <th className="px-3 py-2 label-mono">Sender Account</th>
                <th className="px-3 py-2 label-mono">Receiver Account</th>
                <th className="px-3 py-2 label-mono">Amount</th>
                <th className="px-3 py-2 label-mono">Channel / Mode</th>
                <th className="px-3 py-2 label-mono">Predicted AML Typology</th>
                <th className="px-3 py-2 label-mono">Risk Score</th>
                <th className="px-3 py-2 label-mono">Risk Tier</th>
                <th className="px-3 py-2 label-mono text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRecords.map((r) => {
                const isHigh = r._risk_level === "HIGH";
                const isMed = r._risk_level === "MEDIUM";
                return (
                  <tr
                    key={r._row_id}
                    className={`border-b border-border/50 hover:bg-muted/40 ${
                      isHigh ? "bg-destructive/10" : isMed ? "bg-warning/5" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-bold text-foreground">{r._row_id}</td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[150px]">
                      {String(r["from_account"] || "—")}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[150px]">
                      {String(r["to_account"] || "—")}
                    </td>
                    <td className="px-3 py-2 text-foreground font-semibold">{formatAmount(r)}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-mono">
                        {String(r["payment_format"] || r["channel"] || "—")}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          isHigh
                            ? "text-destructive font-bold"
                            : isMed
                              ? "text-warning font-semibold"
                              : "text-foreground font-medium"
                        }
                      >
                        {r._predicted_class}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-bold text-foreground">
                      {((Number(r._risk_score) || 0) * 100).toFixed(0)}%
                    </td>
                    <td className="px-3 py-2">
                      <Chip tone={isHigh ? "bad" : isMed ? "bad" : "ok"}>{r._risk_level}</Chip>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleInspect(r._row_id)}
                        className="h-7 text-xs text-primary hover:text-primary hover:bg-primary/10"
                      >
                        Explain <ArrowRight className="ml-1 h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Navigation Controls */}
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
            <span className="text-foreground font-bold px-2">
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
