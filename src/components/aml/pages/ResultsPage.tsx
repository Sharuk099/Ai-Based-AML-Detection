import { useState, useMemo } from "react";
import { Download, Search, Filter, ShieldAlert, Play, Eye, ArrowRight, CheckCircle2 } from "lucide-react";
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

  const filteredRecords = useMemo(() => {
    if (!analysisResult) return [];
    return analysisResult.records.filter((rec) => {
      if (riskFilter !== "ALL" && rec._risk_level !== riskFilter) return false;
      if (categoryFilter !== "ALL" && rec._predicted_class !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesId = rec._row_id.toLowerCase().includes(q);
        const matchesFrom = String(rec["from_account"] || "").toLowerCase().includes(q);
        const matchesTo = String(rec["to_account"] || "").toLowerCase().includes(q);
        const matchesClass = rec._predicted_class.toLowerCase().includes(q);
        return matchesId || matchesFrom || matchesTo || matchesClass;
      }
      return true;
    });
  }, [analysisResult, search, riskFilter, categoryFilter]);

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
    const blob = new Blob([JSON.stringify(analysisResult.records, null, 2)], { type: "application/json" });
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
            <h3 className="text-base font-semibold text-foreground">No Analysis Results Available</h3>
            <p className="max-w-md text-xs text-muted-foreground">
              Run transaction analysis to populate model predictions, confidence scores, and alert flags.
            </p>
            <Button onClick={() => setTab("analyze")} className="mt-2 bg-primary text-primary-foreground">
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
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Total Scored" value={analysisResult.totalTransactions.toLocaleString()} />
        <Stat
          label="Flagged Alerts"
          value={analysisResult.flaggedCount.toLocaleString()}
          tone={analysisResult.flaggedCount > 0 ? "bad" : "ok"}
        />
        <Stat
          label="High Risk Critical"
          value={analysisResult.highRiskCount.toLocaleString()}
          tone={analysisResult.highRiskCount > 0 ? "bad" : "ok"}
        />
        <Stat
          label="Filtered Matches"
          value={filteredRecords.length.toLocaleString()}
        />
      </div>

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
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs font-mono h-9"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Risk:</span>
            <select
              className={selectCls + " h-9 text-xs font-mono"}
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
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
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="ALL">All Categories</option>
              {analysisResult.classes.map((cls) => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Results Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 label-mono">Transaction ID</th>
                <th className="px-3 py-2 label-mono">Sender</th>
                <th className="px-3 py-2 label-mono">Receiver</th>
                <th className="px-3 py-2 label-mono">Amount</th>
                <th className="px-3 py-2 label-mono">Channel</th>
                <th className="px-3 py-2 label-mono">Predicted AML Typology</th>
                <th className="px-3 py-2 label-mono">Confidence</th>
                <th className="px-3 py-2 label-mono">Risk Level</th>
                <th className="px-3 py-2 label-mono text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.slice(0, 50).map((r) => {
                const isRisk = r._risk_level === "HIGH" || r._risk_level === "MEDIUM";
                return (
                  <tr
                    key={r._row_id}
                    className={`border-b border-border/50 hover:bg-muted/40 ${
                      r._risk_level === "HIGH" ? "bg-destructive/5" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-bold text-foreground">{r._row_id}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r["from_account"] || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r["to_account"] || "—"}</td>
                    <td className="px-3 py-2 text-foreground font-medium">
                      ${Number(r["amount"] || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r["payment_format"] || r["channel"] || "—"}</td>
                    <td className="px-3 py-2">
                      <span className={isRisk ? "text-destructive font-bold" : "text-foreground font-medium"}>
                        {r._predicted_class}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-foreground">
                      {(r._confidence * 100).toFixed(1)}%
                    </td>
                    <td className="px-3 py-2">
                      <Chip tone={r._risk_level === "HIGH" ? "bad" : r._risk_level === "MEDIUM" ? "bad" : "ok"}>
                        {r._risk_level}
                      </Chip>
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

        {filteredRecords.length > 50 && (
          <div className="mt-3 text-center text-xs text-muted-foreground font-mono">
            Showing first 50 matching transactions of {filteredRecords.length.toLocaleString()}. Export CSV to inspect full record set.
          </div>
        )}
      </Panel>
    </div>
  );
}
