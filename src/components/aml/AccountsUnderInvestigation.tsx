import { useState, useMemo } from "react";
import {
  ShieldAlert,
  User,
  Building2,
  Filter,
  Network,
  Repeat,
  Zap,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  LayoutGrid,
  Table as TableIcon,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, Chip } from "./ui";
import { useAml } from "./state";
import type { AnalysisResult } from "@/lib/aml/types";

export interface InvestigatedAccount {
  accountId: string;
  customerType: "Individual" | "Corporate / Business" | "Shell Entity / High-Risk";
  riskScore: number;
  riskLevel: "HIGH" | "MEDIUM" | "LOW";
  typologyTags: string[];
  inflow: number;
  outflow: number;
  turnoverRatio: number;
  counterparties: string[];
  totalTransactions: number;
  maxTxAmount: number;
  currency: string;
}

export function AccountsUnderInvestigation({ analysisResult }: { analysisResult: AnalysisResult }) {
  const { setSelectedAccountId, setTab } = useAml();
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "HIGH" | "LOOPS" | "MULES">("ALL");

  // Currency detection
  const currencySymbol = useMemo(() => {
    const firstCcy = analysisResult.records.find((r) => r["currency"])?.["currency"]?.toUpperCase();
    if (firstCcy === "INR") return "₹";
    if (firstCcy === "EUR") return "€";
    if (firstCcy === "GBP") return "£";
    return "$";
  }, [analysisResult]);

  const formatCurrency = (amount: number) => {
    if (currencySymbol === "₹") {
      if (amount >= 1e7) return `₹${(amount / 1e7).toFixed(2)} Cr`;
      if (amount >= 1e5) return `₹${(amount / 1e5).toFixed(2)} L`;
      return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
    }
    if (amount >= 1e6) return `${currencySymbol}${(amount / 1e6).toFixed(2)}M`;
    if (amount >= 1e3) return `${currencySymbol}${(amount / 1e3).toFixed(1)}k`;
    return `${currencySymbol}${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  // Compile accounts from records, graph data, and cycles
  const accounts: InvestigatedAccount[] = useMemo(() => {
    const map = new Map<
      string,
      {
        accountId: string;
        customerType?: string;
        riskScore: number;
        typologyTags: Set<string>;
        inflow: number;
        outflow: number;
        counterparties: Set<string>;
        totalTxns: number;
        maxAmount: number;
        currency: string;
      }
    >();

    const cycles = analysisResult.graphData?.cycles || [];
    const accountsInCycles = new Set<string>();
    cycles.forEach((c) => c.forEach((acc) => accountsInCycles.add(acc)));

    for (const r of analysisResult.records) {
      const fromAcc = String(r["from_account"] || r["account_id"] || "").trim();
      const toAcc = String(r["to_account"] || "").trim();
      const amt = Number(r["amount"] || 0);
      const score = Number(r._risk_score || 0);
      const typology = String(r._crime_typology || r._predicted_class || "");
      const ccy = String(r["currency"] || "USD").toUpperCase();
      const rawCustType = String(r["customer_type"] || "");

      if (fromAcc) {
        if (!map.has(fromAcc)) {
          map.set(fromAcc, {
            accountId: fromAcc,
            customerType: rawCustType,
            riskScore: 0,
            typologyTags: new Set(),
            inflow: 0,
            outflow: 0,
            counterparties: new Set(),
            totalTxns: 0,
            maxAmount: 0,
            currency: ccy,
          });
        }
        const acc = map.get(fromAcc)!;
        acc.outflow += amt;
        acc.totalTxns += 1;
        if (amt > acc.maxAmount) acc.maxAmount = amt;
        if (score > acc.riskScore) acc.riskScore = score;
        if (toAcc) acc.counterparties.add(toAcc);
        if (typology && typology !== "Normal" && typology !== "Standard Retail") {
          acc.typologyTags.add(typology);
        }
      }

      if (toAcc) {
        if (!map.has(toAcc)) {
          map.set(toAcc, {
            accountId: toAcc,
            customerType: rawCustType,
            riskScore: 0,
            typologyTags: new Set(),
            inflow: 0,
            outflow: 0,
            counterparties: new Set(),
            totalTxns: 0,
            maxAmount: 0,
            currency: ccy,
          });
        }
        const acc = map.get(toAcc)!;
        acc.inflow += amt;
        acc.totalTxns += 1;
        if (amt > acc.maxAmount) acc.maxAmount = amt;
        if (score > acc.riskScore) acc.riskScore = score;
        if (fromAcc) acc.counterparties.add(fromAcc);
        if (typology && typology !== "Normal" && typology !== "Standard Retail") {
          acc.typologyTags.add(typology);
        }
      }
    }

    const list: InvestigatedAccount[] = [];

    map.forEach((data, accId) => {
      // Calculate turnover ratio
      const turnoverRatio =
        data.inflow > 0 ? Number(((data.outflow / data.inflow) * 100).toFixed(1)) : 0;

      // Identify typologies
      const tags = Array.from(data.typologyTags);
      if (accountsInCycles.has(accId)) {
        if (!tags.includes("Circular Layering Ring")) tags.unshift("Circular Layering Ring");
      }
      if (
        data.inflow > 5000 &&
        turnoverRatio >= 85 &&
        turnoverRatio <= 115 &&
        data.counterparties.size >= 2
      ) {
        if (!tags.includes("Mule Rapid Pass-Through")) tags.unshift("Mule Rapid Pass-Through");
      }
      if (
        (data.riskScore > 0.65 || tags.length > 0) &&
        data.totalTxns >= 3 &&
        data.maxAmount < 50000 &&
        data.maxAmount > 8000
      ) {
        if (!tags.includes("Structuring")) tags.push("Structuring");
      }
      if (data.totalTxns >= 8 || data.riskScore > 0.75) {
        if (!tags.includes("Velocity Anomaly")) tags.push("Velocity Anomaly");
      }
      if (tags.length === 0) {
        if (data.riskScore >= 0.5) tags.push("Statistical Risk Outlier");
        else tags.push("Standard Activity");
      }

      // Infer customer type
      let customerType: "Individual" | "Corporate / Business" | "Shell Entity / High-Risk" =
        "Individual";
      const accUpper = accId.toUpperCase();
      if (
        data.customerType?.toLowerCase().includes("corporate") ||
        data.customerType?.toLowerCase().includes("business") ||
        accUpper.includes("CORP") ||
        accUpper.includes("LLC") ||
        accUpper.includes("BIZ") ||
        accUpper.includes("INC") ||
        data.inflow > 100000 ||
        data.outflow > 100000
      ) {
        customerType = "Corporate / Business";
      }
      if (
        accountsInCycles.has(accId) ||
        (data.riskScore > 0.8 && turnoverRatio >= 95 && turnoverRatio <= 105)
      ) {
        customerType = "Shell Entity / High-Risk";
      }

      let riskLevel: "HIGH" | "MEDIUM" | "LOW" = "LOW";
      if (data.riskScore >= 0.6 || accountsInCycles.has(accId)) {
        riskLevel = "HIGH";
      } else if (data.riskScore >= 0.35) {
        riskLevel = "MEDIUM";
      }

      list.push({
        accountId: accId,
        customerType,
        riskScore: data.riskScore,
        riskLevel,
        typologyTags: tags.slice(0, 4),
        inflow: Math.round(data.inflow),
        outflow: Math.round(data.outflow),
        turnoverRatio,
        counterparties: Array.from(data.counterparties),
        totalTransactions: data.totalTxns,
        maxTxAmount: data.maxAmount,
        currency: data.currency,
      });
    });

    // Sort by riskScore descending, then by volume
    return list.sort((a, b) => {
      if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
      return b.inflow + b.outflow - (a.inflow + a.outflow);
    });
  }, [analysisResult]);

  // Filter accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      if (filterType === "HIGH" && acc.riskLevel !== "HIGH") return false;
      if (
        filterType === "LOOPS" &&
        !acc.typologyTags.some(
          (t) => t.toLowerCase().includes("circular") || t.toLowerCase().includes("loop"),
        )
      )
        return false;
      if (
        filterType === "MULES" &&
        !acc.typologyTags.some(
          (t) => t.toLowerCase().includes("mule") || t.toLowerCase().includes("pass-through"),
        )
      )
        return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesId = acc.accountId.toLowerCase().includes(q);
        const matchesType = acc.customerType.toLowerCase().includes(q);
        const matchesTag = acc.typologyTags.some((t) => t.toLowerCase().includes(q));
        const matchesCp = acc.counterparties.some((cp) => cp.toLowerCase().includes(q));
        return matchesId || matchesType || matchesTag || matchesCp;
      }
      return true;
    });
  }, [accounts, filterType, search]);

  const handleFilterTransactions = (accountId: string) => {
    setSelectedAccountId(accountId);
    setTab("results");
  };

  const handleViewIn3DGraph = (accountId: string) => {
    setSelectedAccountId(accountId);
    setTab("graph");
  };

  return (
    <Panel
      title={
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-destructive" />
          <span>High-Risk Entities & Accounts Under Investigation</span>
          <span className="rounded bg-destructive/15 px-2 py-0.5 text-[10px] font-mono font-bold text-destructive">
            {accounts.filter((a) => a.riskLevel === "HIGH").length} Critical Targets
          </span>
        </div>
      }
      right={
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded border border-border/80 bg-muted/40 p-0.5">
            <Button
              size="sm"
              variant={viewMode === "cards" ? "default" : "ghost"}
              onClick={() => setViewMode("cards")}
              className={`h-7 px-2 text-xs font-mono ${viewMode === "cards" ? "bg-card text-foreground shadow-sm" : ""}`}
              title="Cards View"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant={viewMode === "table" ? "default" : "ghost"}
              onClick={() => setViewMode("table")}
              className={`h-7 px-2 text-xs font-mono ${viewMode === "table" ? "bg-card text-foreground shadow-sm" : ""}`}
              title="Table View"
            >
              <TableIcon className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Controls Bar: Search & Typology Quick Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search account ID, typology, or counterparty..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs font-mono h-8 bg-background"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant={filterType === "ALL" ? "default" : "outline"}
              onClick={() => setFilterType("ALL")}
              className={`h-7 px-2.5 text-xs font-mono ${filterType === "ALL" ? "bg-primary text-primary-foreground font-bold" : ""}`}
            >
              All ({accounts.length})
            </Button>
            <Button
              size="sm"
              variant={filterType === "HIGH" ? "default" : "outline"}
              onClick={() => setFilterType("HIGH")}
              className={`h-7 px-2.5 text-xs font-mono ${filterType === "HIGH" ? "bg-destructive text-destructive-foreground font-bold" : ""}`}
            >
              🚨 High Risk ({accounts.filter((a) => a.riskLevel === "HIGH").length})
            </Button>
            <Button
              size="sm"
              variant={filterType === "LOOPS" ? "default" : "outline"}
              onClick={() => setFilterType("LOOPS")}
              className={`h-7 px-2.5 text-xs font-mono ${filterType === "LOOPS" ? "bg-destructive/80 text-white font-bold" : ""}`}
            >
              🔁 Loops (
              {accounts.filter((a) => a.typologyTags.some((t) => t.includes("Circular"))).length})
            </Button>
            <Button
              size="sm"
              variant={filterType === "MULES" ? "default" : "outline"}
              onClick={() => setFilterType("MULES")}
              className={`h-7 px-2.5 text-xs font-mono ${filterType === "MULES" ? "bg-amber-500 text-black font-bold" : ""}`}
            >
              ⚡ Mules (
              {accounts.filter((a) => a.typologyTags.some((t) => t.includes("Mule"))).length})
            </Button>
          </div>
        </div>

        {/* View 1: Visual Cards View */}
        {viewMode === "cards" && (
          <div className="grid gap-3.5 md:grid-cols-2 lg:grid-cols-3">
            {filteredAccounts.slice(0, 18).map((acc) => {
              const isHigh = acc.riskLevel === "HIGH";
              const isMedium = acc.riskLevel === "MEDIUM";

              return (
                <div
                  key={acc.accountId}
                  className={`rounded-lg border p-4 transition-all space-y-3 bg-card shadow-sm ${
                    isHigh
                      ? "border-destructive/40 hover:border-destructive/70 bg-destructive/[0.02]"
                      : isMedium
                        ? "border-amber-500/40 hover:border-amber-500/70"
                        : "border-border/80 hover:border-border"
                  }`}
                >
                  {/* Card Header: Account ID, Customer Type & Risk Score */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold ${
                          isHigh
                            ? "bg-destructive/15 text-destructive"
                            : isMedium
                              ? "bg-amber-500/15 text-amber-500"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {acc.customerType === "Corporate / Business" ? (
                          <Building2 className="h-4 w-4" />
                        ) : (
                          <User className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-foreground truncate">
                            {acc.accountId}
                          </span>
                        </div>
                        <span
                          className={`inline-block text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                            acc.customerType === "Shell Entity / High-Risk"
                              ? "bg-destructive/20 text-destructive"
                              : acc.customerType === "Corporate / Business"
                                ? "bg-primary/15 text-primary"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {acc.customerType}
                        </span>
                      </div>
                    </div>

                    {/* Calculated AML Risk Score Badge */}
                    <div className="shrink-0 text-right">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-mono font-bold border ${
                          isHigh
                            ? "bg-destructive/20 text-destructive border-destructive/40"
                            : isMedium
                              ? "bg-amber-500/20 text-amber-500 border-amber-500/40"
                              : "bg-success/20 text-success border-success/40"
                        }`}
                      >
                        {isHigh && <ShieldAlert className="h-3 w-3" />}
                        {(acc.riskScore * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {/* Detected Typology Badges */}
                  <div className="flex flex-wrap gap-1">
                    {acc.typologyTags.map((tag) => (
                      <span
                        key={tag}
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold ${
                          tag.includes("Circular")
                            ? "bg-destructive/20 text-destructive border border-destructive/30"
                            : tag.includes("Mule")
                              ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                              : tag.includes("Structuring")
                                ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                                : tag.includes("Velocity")
                                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                                  : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {tag.includes("Circular") && <Repeat className="h-2.5 w-2.5" />}
                        {tag.includes("Mule") && <Zap className="h-2.5 w-2.5" />}
                        {tag.includes("Structuring") && <Layers className="h-2.5 w-2.5" />}
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Financial Flow: Inflow vs Outflow & Turnover */}
                  <div className="grid grid-cols-3 gap-2 rounded bg-muted/30 p-2 text-xs font-mono">
                    <div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <ArrowDownLeft className="h-2.5 w-2.5 text-success" /> Inflow
                      </div>
                      <div className="font-bold text-foreground text-[11px] truncate mt-0.5">
                        {formatCurrency(acc.inflow)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <ArrowUpRight className="h-2.5 w-2.5 text-destructive" /> Outflow
                      </div>
                      <div className="font-bold text-foreground text-[11px] truncate mt-0.5">
                        {formatCurrency(acc.outflow)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <TrendingUp className="h-2.5 w-2.5 text-warning" /> Turnover
                      </div>
                      <div
                        className={`font-bold text-[11px] mt-0.5 ${
                          acc.turnoverRatio >= 85 && acc.turnoverRatio <= 115
                            ? "text-amber-500"
                            : "text-foreground"
                        }`}
                      >
                        {acc.turnoverRatio}%
                      </div>
                    </div>
                  </div>

                  {/* Counterparties & Direct Neighbors */}
                  <div className="text-[11px] font-mono text-muted-foreground space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span>{acc.counterparties.length} Connected Counterparties:</span>
                      <span className="text-muted-foreground">
                        {acc.totalTransactions} transactions
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 max-h-12 overflow-hidden">
                      {acc.counterparties.slice(0, 4).map((cp) => (
                        <span
                          key={cp}
                          onClick={() => handleFilterTransactions(cp)}
                          className="rounded bg-card border border-border/80 px-1 py-0.2 text-[10px] text-foreground hover:border-primary cursor-pointer transition-colors"
                          title="Click to filter by this counterparty"
                        >
                          {cp}
                        </span>
                      ))}
                      {acc.counterparties.length > 4 && (
                        <span className="text-[10px] text-muted-foreground self-center">
                          +{acc.counterparties.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quick Actions: Filter Transactions & View in 3D Graph */}
                  <div className="flex items-center gap-2 pt-2 border-t border-border/60">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleFilterTransactions(acc.accountId)}
                      className="flex-1 h-7 text-xs font-mono text-foreground hover:bg-muted font-semibold"
                    >
                      <Filter className="mr-1 h-3 w-3 text-primary" /> Filter Txns
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleViewIn3DGraph(acc.accountId)}
                      className="flex-1 h-7 text-xs font-mono bg-primary text-primary-foreground font-semibold shadow-sm"
                    >
                      <Network className="mr-1 h-3 w-3" /> 3D Graph
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* View 2: Compact Dense Table View */}
        {viewMode === "table" && (
          <div className="overflow-x-auto rounded border border-border/80">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-2.5 label-mono">Account ID</th>
                  <th className="px-3 py-2.5 label-mono">Customer Type</th>
                  <th className="px-3 py-2.5 label-mono">AML Risk Score</th>
                  <th className="px-3 py-2.5 label-mono">Typologies</th>
                  <th className="px-3 py-2.5 label-mono text-right">Inflow</th>
                  <th className="px-3 py-2.5 label-mono text-right">Outflow</th>
                  <th className="px-3 py-2.5 label-mono text-right">Turnover</th>
                  <th className="px-3 py-2.5 label-mono">Counterparties</th>
                  <th className="px-3 py-2.5 label-mono text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map((acc) => {
                  const isHigh = acc.riskLevel === "HIGH";
                  return (
                    <tr
                      key={acc.accountId}
                      className={`border-b border-border/50 hover:bg-muted/40 transition-colors ${
                        isHigh ? "bg-destructive/5" : "bg-card"
                      }`}
                    >
                      <td className="px-3 py-2.5 font-bold text-foreground">{acc.accountId}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        <span className="text-[11px]">{acc.customerType}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            isHigh
                              ? "bg-destructive/20 text-destructive"
                              : acc.riskLevel === "MEDIUM"
                                ? "bg-amber-500/20 text-amber-500"
                                : "bg-success/20 text-success"
                          }`}
                        >
                          {(acc.riskScore * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {acc.typologyTags.slice(0, 2).map((t) => (
                            <span
                              key={t}
                              className="rounded bg-muted px-1 py-0.2 text-[10px] text-foreground truncate"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-foreground">
                        {formatCurrency(acc.inflow)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-foreground">
                        {formatCurrency(acc.outflow)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-foreground">
                        {acc.turnoverRatio}%
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground text-[11px]">
                        {acc.counterparties.slice(0, 2).join(", ")}
                        {acc.counterparties.length > 2 && ` +${acc.counterparties.length - 2}`}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleFilterTransactions(acc.accountId)}
                            className="h-6 px-2 text-[11px] text-foreground hover:bg-muted"
                            title="Filter Transactions"
                          >
                            Filter
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleViewIn3DGraph(acc.accountId)}
                            className="h-6 px-2 text-[11px] bg-primary text-primary-foreground font-bold"
                            title="View in 3D Graph"
                          >
                            Graph
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filteredAccounts.length === 0 && (
          <div className="p-8 text-center text-xs font-mono text-muted-foreground">
            No accounts match your current filter criteria.
          </div>
        )}
      </div>
    </Panel>
  );
}
