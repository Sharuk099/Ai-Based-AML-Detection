// @ts-nocheck -- strict index checks relaxed for numeric ML code
import { useState, useMemo, useCallback } from "react";
import {
  Network,
  List,
  Info,
  ShieldAlert,
  Repeat,
  Zap,
  Share2,
  Layers,
  Search,
  Check,
  Copy,
  Eye,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { useAml } from "../state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, Stat, Chip } from "../ui";
import { graphSummary } from "@/lib/aml/graph";
import { ThreeGraph3D } from "../ThreeGraph3D";
import { GraphDiagram2D } from "../GraphDiagram2D";

export function GraphPage() {
  const { activeDs, analysisResult, setTab } = useAml();

  // Active View Tab: 3D Interactive Graph vs 2D Flow Diagram vs All Connections vs Account Dossiers
  const [activeView, setActiveView] = useState<"graph" | "diagram2d" | "connections" | "accounts">(
    "graph",
  );
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [searchAccount, setSearchAccount] = useState("");
  const [minAmountFilter, setMinAmountFilter] = useState<number>(0);
  const [copiedAccount, setCopiedAccount] = useState<string | null>(null);

  // Currency detection (INR or USD/EUR)
  const currencySymbol = useMemo(() => {
    const firstCurr = activeDs?.rows.find((r) => r["currency"])?.["currency"]?.toUpperCase();
    if (firstCurr === "INR") return "₹";
    if (firstCurr === "EUR") return "€";
    if (firstCurr === "GBP") return "£";
    return "$";
  }, [activeDs]);

  const formatMoney = useCallback(
    (amount: number) => {
      if (currencySymbol === "₹") {
        if (amount >= 1e7) return `₹${(amount / 1e7).toFixed(2)} Cr`;
        if (amount >= 1e5) return `₹${(amount / 1e5).toFixed(2)} Lakh`;
        return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
      }
      if (amount >= 1e6) return `${currencySymbol}${(amount / 1e6).toFixed(2)}M`;
      if (amount >= 1e3) return `${currencySymbol}${(amount / 1e3).toFixed(1)}k`;
      return `${currencySymbol}${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    },
    [currencySymbol],
  );

  // Compute graph data from active dataset or analysis result
  const summary = useMemo(() => {
    if (analysisResult?.graphData) return analysisResult.graphData;
    if (!activeDs) return null;
    const roles = activeDs.audit.roles;
    const sender =
      roles.sender || (activeDs.columns.includes("from_account") ? "from_account" : undefined);
    const receiver =
      roles.receiver || (activeDs.columns.includes("to_account") ? "to_account" : undefined);
    const amount = roles.amount || (activeDs.columns.includes("amount") ? "amount" : undefined);
    const time =
      roles.timestamp || (activeDs.columns.includes("timestamp") ? "timestamp" : undefined);
    if (!sender || !receiver) return null;
    return graphSummary(activeDs.rows, sender, receiver, amount, time);
  }, [analysisResult, activeDs]);

  // Suspicious loop paths for highlighting
  const suspiciousLoopAccounts = useMemo(() => {
    if (!summary) return new Set<string>();
    const set = new Set<string>();
    summary.cycles.forEach((c) => c.forEach((acc) => set.add(acc)));
    return set;
  }, [summary]);

  // Suspicious mule accounts
  const muleAccounts = useMemo(() => {
    if (!summary) return new Set<string>();
    const set = new Set<string>();
    summary.accounts.forEach((acc) => {
      if (acc.passthrough >= 0.85 && acc.passthrough <= 1.15 && acc.out_total > 5000) {
        set.add(acc.account);
      }
    });
    return set;
  }, [summary]);

  const rawEdges = useMemo(() => {
    if (!summary) return [];
    return summary.allEdges || summary.subEdges || [];
  }, [summary]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAccount(text);
    setTimeout(() => setCopiedAccount(null), 2000);
  };

  if (!activeDs) {
    return (
      <div className="space-y-4">
        <Panel title="Transaction Network & 3D Graph Intelligence">
          <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
            <Network className="h-12 w-12 text-muted-foreground/40" />
            <h3 className="text-base font-semibold text-foreground">No Dataset Selected</h3>
            <p className="max-w-md text-xs text-muted-foreground">
              Please upload or load a transaction dataset first to compute 3D account networks,
              circular layering rings, and transfer conduit topologies.
            </p>
            <Button
              onClick={() => setTab("upload")}
              className="mt-2 bg-primary text-primary-foreground font-bold"
            >
              Upload Transactions
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="space-y-4">
        <Panel title="Transaction Network & 3D Graph Intelligence">
          <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
            <AlertCircle className="h-12 w-12 text-warning" />
            <h3 className="text-base font-semibold text-foreground">
              Sender & Receiver Columns Needed
            </h3>
            <p className="max-w-md text-xs text-muted-foreground">
              Graph intelligence requires transaction sender and receiver identifiers (from_account
              and to_account) to construct 3D directed flow networks.
            </p>
          </div>
        </Panel>
      </div>
    );
  }

  // Active inspected account details
  const selectedStats = selectedAccount
    ? summary.accounts.find((a) => a.account === selectedAccount)
    : null;
  const selectedFlags = selectedAccount
    ? summary.indicators.find((i) => i.account === selectedAccount)?.flags || []
    : [];

  const allInboundForSelected = selectedAccount
    ? rawEdges.filter((e) => e.target === selectedAccount)
    : [];
  const allOutboundForSelected = selectedAccount
    ? rawEdges.filter((e) => e.source === selectedAccount)
    : [];

  return (
    <div className="space-y-6">
      {/* Top Header & View Switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Network className="h-5 w-5 text-primary" />
              <span>3D Counterparty Network & Topology Intelligence</span>
            </h1>
            <span className="rounded bg-primary/10 border border-primary/30 px-2 py-0.5 text-[10px] font-mono text-primary font-bold">
              {summary.nodes.toLocaleString()} Accounts · {summary.edges.toLocaleString()} Links
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Interactive, uncluttered 3D WebGL network graph featuring concentric risk shells,
            animated flow particles, and circular layering ring traces.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1 bg-card border border-border p-1 rounded-md text-xs font-mono">
          <Button
            size="sm"
            variant={activeView === "graph" ? "default" : "ghost"}
            onClick={() => setActiveView("graph")}
            className={`h-7 px-3 text-xs ${activeView === "graph" ? "bg-primary text-primary-foreground font-bold" : ""}`}
          >
            <Network className="mr-1.5 h-3.5 w-3.5" /> 3D Flow Board
          </Button>
          <Button
            size="sm"
            variant={activeView === "diagram2d" ? "default" : "ghost"}
            onClick={() => setActiveView("diagram2d")}
            className={`h-7 px-3 text-xs ${activeView === "diagram2d" ? "bg-primary text-primary-foreground font-bold" : ""}`}
          >
            <Layers className="mr-1.5 h-3.5 w-3.5" /> 2D Flow Diagram
          </Button>
          <Button
            size="sm"
            variant={activeView === "connections" ? "default" : "ghost"}
            onClick={() => setActiveView("connections")}
            className={`h-7 px-3 text-xs ${activeView === "connections" ? "bg-primary text-primary-foreground font-bold" : ""}`}
          >
            <List className="mr-1.5 h-3.5 w-3.5" /> All Links ({rawEdges.length})
          </Button>
          <Button
            size="sm"
            variant={activeView === "accounts" ? "default" : "ghost"}
            onClick={() => setActiveView("accounts")}
            className={`h-7 px-3 text-xs ${activeView === "accounts" ? "bg-primary text-primary-foreground font-bold" : ""}`}
          >
            <Info className="mr-1.5 h-3.5 w-3.5" /> Account Dossiers ({summary.nodes})
          </Button>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Total Accounts" value={summary.nodes.toLocaleString()} />
        <Stat label="Transaction Links" value={summary.edges.toLocaleString()} />
        <Stat
          label="Flagged Entities"
          value={summary.indicators.length}
          tone={summary.indicators.length > 0 ? "bad" : "ok"}
        />
        <Stat
          label="Circular Loops"
          value={summary.cycles.length}
          tone={summary.cycles.length > 0 ? "bad" : "ok"}
        />
        <Stat
          label="High Velocity Flows"
          value={summary.velocity?.length ?? 0}
          tone={(summary.velocity?.length ?? 0) > 0 ? "warn" : "ok"}
        />
      </div>

      {/* VIEW 1: 3D INTERACTIVE GRAPH (Three.js) */}
      {activeView === "graph" && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main 3D Visualizer (Left 2 cols) */}
          <div className="lg:col-span-2 space-y-3">
            <Panel
              title={
                <div className="flex items-center gap-2">
                  <Network className="h-4 w-4 text-primary" />
                  <span>
                    3D Transaction Network: {summary.nodes.toLocaleString()} Accounts &{" "}
                    {summary.edges.toLocaleString()} Links
                  </span>
                </div>
              }
              right={
                <span className="rounded bg-primary/10 border border-primary/30 px-2 py-0.5 text-[10px] font-mono text-primary font-bold">
                  Three.js WebGL 3D Active
                </span>
              }
            >
              <ThreeGraph3D
                nodes={summary.accounts.map((a) => {
                  const flags =
                    summary.indicators.find((i) => i.account === a.account)?.flags || [];
                  const inLoop = suspiciousLoopAccounts.has(a.account);
                  const isMule = muleAccounts.has(a.account);
                  return {
                    ...a,
                    typologyFlags: flags,
                    isCrime: flags.length > 0 || inLoop,
                    isMule,
                    isLoop: inLoop,
                    isNormal: flags.length === 0 && !inLoop && !isMule,
                  };
                })}
                edges={summary.allEdges || summary.subEdges || []}
                cycles={summary.cycles}
                selectedAccount={selectedAccount}
                onSelectAccount={setSelectedAccount}
                currencySymbol={currencySymbol}
              />
            </Panel>
          </div>

          {/* Right Column: Account Dossier & Loop Rings */}
          <div className="space-y-4">
            <Panel
              title={
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-primary" />
                    <span>Account Node Dossier</span>
                  </div>
                  {selectedAccount && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleCopy(selectedAccount)}
                      className="h-6 w-6 text-muted-foreground"
                      title="Copy Account ID"
                    >
                      {copiedAccount === selectedAccount ? (
                        <Check className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              }
            >
              {selectedStats ? (
                <div className="space-y-4">
                  {/* Account Header */}
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="overflow-hidden">
                      <div className="label-mono">Account ID</div>
                      <div className="font-mono text-sm font-bold text-foreground break-all">
                        {selectedStats.account}
                      </div>
                    </div>
                    {selectedFlags.length > 0 ||
                    suspiciousLoopAccounts.has(selectedStats.account) ? (
                      <Chip tone="bad">SUSPICIOUS</Chip>
                    ) : (
                      <Chip tone="ok">STANDARD</Chip>
                    )}
                  </div>

                  {/* Flagged Typology Badges */}
                  {(selectedFlags.length > 0 ||
                    suspiciousLoopAccounts.has(selectedStats.account) ||
                    muleAccounts.has(selectedStats.account)) && (
                    <div>
                      <div className="label-mono mb-1.5">Detected AML Typologies:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {suspiciousLoopAccounts.has(selectedStats.account) && (
                          <Chip tone="bad">Circular Ring Loop</Chip>
                        )}
                        {muleAccounts.has(selectedStats.account) && (
                          <Chip tone="bad">Pass-Through Mule</Chip>
                        )}
                        {selectedFlags.map((fl) => (
                          <Chip key={fl} tone="bad">
                            {fl}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Account Telemetry Metrics */}
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between border-b border-border/40 py-1">
                      <span className="text-muted-foreground">Inbound Transfers:</span>
                      <span className="text-foreground font-bold">
                        {selectedStats.in_count} ({selectedStats.in_unique} senders)
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-border/40 py-1">
                      <span className="text-muted-foreground">Total Inbound:</span>
                      <span className="text-foreground font-bold">
                        {formatMoney(selectedStats.in_total)}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-border/40 py-1">
                      <span className="text-muted-foreground">Outbound Transfers:</span>
                      <span className="text-foreground font-bold">
                        {selectedStats.out_count} ({selectedStats.out_unique} receivers)
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-border/40 py-1">
                      <span className="text-muted-foreground">Total Outbound:</span>
                      <span className="text-foreground font-bold">
                        {formatMoney(selectedStats.out_total)}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-border/40 py-1">
                      <span className="text-muted-foreground">Passthrough Turnover:</span>
                      <span
                        className={`font-bold ${
                          selectedStats.passthrough >= 0.85 && selectedStats.passthrough <= 1.15
                            ? "text-destructive font-extrabold"
                            : "text-foreground"
                        }`}
                      >
                        {(selectedStats.passthrough * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {/* Connected Transfers List */}
                  <div className="border-t border-border pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="label-mono">Connected Transfers</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {allInboundForSelected.length + allOutboundForSelected.length} links
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                      {allInboundForSelected.map((e, idx) => (
                        <div
                          key={`in-${idx}`}
                          onClick={() => setSelectedAccount(e.source)}
                          className="cursor-pointer flex items-center justify-between rounded p-2 bg-muted/20 hover:bg-muted/40 text-[11px] font-mono transition-all border border-transparent hover:border-primary/40"
                          title="Click to focus sender"
                        >
                          <span className="text-primary truncate max-w-[140px]">← {e.source}</span>
                          <span className="text-foreground font-bold">{formatMoney(e.weight)}</span>
                        </div>
                      ))}
                      {allOutboundForSelected.map((e, idx) => (
                        <div
                          key={`out-${idx}`}
                          onClick={() => setSelectedAccount(e.target)}
                          className="cursor-pointer flex items-center justify-between rounded p-2 bg-muted/20 hover:bg-muted/40 text-[11px] font-mono transition-all border border-transparent hover:border-amber-500/40"
                          title="Click to focus receiver"
                        >
                          <span className="text-amber-500 truncate max-w-[140px]">
                            → {e.target}
                          </span>
                          <span className="text-foreground font-bold">{formatMoney(e.weight)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-muted-foreground space-y-2">
                  <Network className="h-8 w-8 mx-auto text-muted-foreground/40" />
                  <p>
                    Click any 3D node in the graph to inspect counterparty telemetry, passthrough
                    ratio, and risk indicators.
                  </p>
                </div>
              )}
            </Panel>

            {/* Circular Loops Ring Panel */}
            {summary.cycles.length > 0 && (
              <Panel
                title={
                  <div className="flex items-center gap-2">
                    <Repeat className="h-4 w-4 text-destructive" />
                    <span>Circular Loops ({summary.cycles.length})</span>
                  </div>
                }
              >
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1 text-xs font-mono">
                  {summary.cycles.slice(0, 15).map((cycle, i) => (
                    <div
                      key={i}
                      onClick={() => {
                        if (cycle[0]) setSelectedAccount(cycle[0]);
                      }}
                      className="cursor-pointer rounded border border-destructive/30 bg-destructive/10 p-2.5 hover:bg-destructive/20 transition-all"
                      title="Click to focus circular loop ring in 3D"
                    >
                      <div className="flex items-center justify-between font-bold text-destructive text-[11px] mb-1">
                        <span className="flex items-center gap-1">
                          <Repeat className="h-3 w-3" /> Ring #{i + 1}
                        </span>
                        <span>{cycle.length} Accounts</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground break-all">
                        {cycle.join(" → ")} → {cycle[0]}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: 2D DIRECTED FLOW DIAGRAM */}
      {activeView === "diagram2d" && (
        <Panel
          title={
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <span>2D Financial Pipeline & Laundering Loop Diagram</span>
            </div>
          }
          right={
            <span className="rounded bg-primary/10 border border-primary/30 px-2 py-0.5 text-[10px] font-mono text-primary font-bold">
              Structured 2D Directed Stages
            </span>
          }
        >
          <GraphDiagram2D
            accounts={summary.accounts}
            edges={summary.allEdges || summary.subEdges || []}
            cycles={summary.cycles}
            indicators={summary.indicators}
            selectedAccount={selectedAccount}
            onSelectAccount={setSelectedAccount}
            currencySymbol={currencySymbol}
          />
        </Panel>
      )}

      {/* VIEW 3: ALL CONNECTIONS LEDGER */}
      {activeView === "connections" && (
        <Panel
          title={
            <div className="flex items-center gap-2">
              <List className="h-4 w-4 text-primary" />
              <span>Full Transaction Connection Ledger ({rawEdges.length} Directed Links)</span>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Filter edges by sender or receiver account..."
                  value={searchAccount}
                  onChange={(e) => setSearchAccount(e.target.value)}
                  className="pl-8 text-xs font-mono h-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Min Amount:</span>
                <Input
                  type="number"
                  placeholder="0"
                  value={minAmountFilter || ""}
                  onChange={(e) => setMinAmountFilter(Number(e.target.value) || 0)}
                  className="w-28 text-xs font-mono h-9"
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-2 label-mono">#</th>
                    <th className="px-3 py-2 label-mono">Sender (From)</th>
                    <th className="px-3 py-2 label-mono"></th>
                    <th className="px-3 py-2 label-mono">Beneficiary (To)</th>
                    <th className="px-3 py-2 label-mono">Volume</th>
                    <th className="px-3 py-2 label-mono">Tx Count</th>
                    <th className="px-3 py-2 label-mono">Typology</th>
                    <th className="px-3 py-2 label-mono text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody>
                  {rawEdges
                    .filter((e) => {
                      if (searchAccount.trim()) {
                        const s = searchAccount.toLowerCase().trim();
                        if (
                          !e.source.toLowerCase().includes(s) &&
                          !e.target.toLowerCase().includes(s)
                        )
                          return false;
                      }
                      if (minAmountFilter > 0 && e.weight < minAmountFilter) return false;
                      return true;
                    })
                    .slice(0, 300)
                    .map((e, idx) => {
                      const isCycle =
                        suspiciousLoopAccounts.has(e.source) &&
                        suspiciousLoopAccounts.has(e.target);
                      const isMule = muleAccounts.has(e.source) || muleAccounts.has(e.target);

                      return (
                        <tr
                          key={idx}
                          className={`border-b border-border/40 hover:bg-muted/30 ${
                            isCycle ? "bg-destructive/10" : isMule ? "bg-warning/5" : ""
                          }`}
                        >
                          <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                          <td className="px-3 py-2 font-bold text-foreground">{e.source}</td>
                          <td className="px-3 py-2 text-muted-foreground">→</td>
                          <td className="px-3 py-2 font-bold text-foreground">{e.target}</td>
                          <td className="px-3 py-2 text-foreground font-semibold">
                            {formatMoney(e.weight)}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{e.txCount} txns</td>
                          <td className="px-3 py-2">
                            {isCycle ? (
                              <Chip tone="bad">Circular Ring</Chip>
                            ) : isMule ? (
                              <Chip tone="bad">Mule Conduit</Chip>
                            ) : (
                              <Chip tone="ok">Direct Transfer</Chip>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedAccount(e.source);
                                setActiveView("graph");
                              }}
                              className="h-7 text-xs text-primary"
                            >
                              View in 3D <ArrowRight className="ml-1 h-3 w-3" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </Panel>
      )}

      {/* VIEW 3: ACCOUNT DOSSIERS */}
      {activeView === "accounts" && (
        <Panel
          title={
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              <span>All Counterparty Account Profiles ({summary.accounts.length})</span>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-2 label-mono">Account Identifier</th>
                    <th className="px-3 py-2 label-mono">Inbound Volume</th>
                    <th className="px-3 py-2 label-mono">Outbound Volume</th>
                    <th className="px-3 py-2 label-mono">Net Flow</th>
                    <th className="px-3 py-2 label-mono">Passthrough</th>
                    <th className="px-3 py-2 label-mono">Degree</th>
                    <th className="px-3 py-2 label-mono">Risk Status</th>
                    <th className="px-3 py-2 label-mono text-right">Inspect in 3D</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.accounts.slice(0, 300).map((acc) => {
                    const isCycle = suspiciousLoopAccounts.has(acc.account);
                    const isMule = muleAccounts.has(acc.account);
                    const isFlagged = summary.indicators.some((i) => i.account === acc.account);

                    return (
                      <tr
                        key={acc.account}
                        className={`border-b border-border/40 hover:bg-muted/30 ${
                          isCycle ? "bg-destructive/10" : isMule ? "bg-warning/5" : ""
                        }`}
                      >
                        <td className="px-3 py-2 font-bold text-foreground">{acc.account}</td>
                        <td className="px-3 py-2 text-foreground font-semibold">
                          {formatMoney(acc.in_total)} ({acc.in_count} txns)
                        </td>
                        <td className="px-3 py-2 text-foreground font-semibold">
                          {formatMoney(acc.out_total)} ({acc.out_count} txns)
                        </td>
                        <td className="px-3 py-2 text-foreground font-bold">
                          {formatMoney(acc.in_total + acc.out_total)}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              acc.passthrough >= 0.85 && acc.passthrough <= 1.15
                                ? "text-destructive font-bold"
                                : "text-muted-foreground"
                            }
                          >
                            {(acc.passthrough * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{acc.degree}</td>
                        <td className="px-3 py-2">
                          {isCycle ? (
                            <Chip tone="bad">Loop Member</Chip>
                          ) : isMule ? (
                            <Chip tone="bad">Pass-Through Mule</Chip>
                          ) : isFlagged ? (
                            <Chip tone="bad">Flagged</Chip>
                          ) : (
                            <Chip tone="ok">Normal</Chip>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedAccount(acc.account);
                              setActiveView("graph");
                            }}
                            className="h-7 text-xs text-primary"
                          >
                            View in 3D <Eye className="ml-1 h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
