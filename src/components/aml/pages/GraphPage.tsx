import { useState, useMemo } from "react";
import { Network, RefreshCw, AlertCircle, Share2, Layers, Repeat, Zap, Eye, Filter } from "lucide-react";
import { useAml } from "../state";
import { Button } from "@/components/ui/button";
import { Panel, Stat, DataTable, Chip, Note, selectCls } from "../ui";
import { graphSummary } from "@/lib/aml/graph";
import { INDICATORS } from "@/lib/aml/types";

export function GraphPage() {
  const { activeDs, analysisResult, setTab } = useAml();

  const [filterTypology, setFilterTypology] = useState<string>("all");
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);

  const summary = useMemo(() => {
    if (analysisResult?.graphData) return analysisResult.graphData;
    if (!activeDs) return null;
    const roles = activeDs.audit.roles;
    const sender = roles.sender || (activeDs.columns.includes("from_account") ? "from_account" : undefined);
    const receiver = roles.receiver || (activeDs.columns.includes("to_account") ? "to_account" : undefined);
    const amount = roles.amount || (activeDs.columns.includes("amount") ? "amount" : undefined);
    const time = roles.timestamp || (activeDs.columns.includes("timestamp") ? "timestamp" : undefined);
    if (!sender || !receiver) return null;
    return graphSummary(activeDs.rows, sender, receiver, amount, time);
  }, [analysisResult, activeDs]);

  if (!activeDs) {
    return (
      <div className="space-y-4">
        <Panel title="Transaction Graph Analytics">
          <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
            <Network className="h-12 w-12 text-muted-foreground/40" />
            <h3 className="text-base font-semibold text-foreground">No Dataset Selected</h3>
            <p className="max-w-md text-xs text-muted-foreground">
              Please upload or load a transaction dataset first to compute account relationships and typology graphs.
            </p>
            <Button onClick={() => setTab("upload")} className="mt-2 bg-primary text-primary-foreground">
              Go to Upload
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="space-y-4">
        <Panel title="Transaction Graph Analytics">
          <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
            <AlertCircle className="h-12 w-12 text-warning" />
            <h3 className="text-base font-semibold text-foreground">Sender & Receiver Columns Needed</h3>
            <p className="max-w-md text-xs text-muted-foreground">
              Graph intelligence requires transaction endpoints (from_account and to_account) to construct directed counterparty transfer graphs.
            </p>
          </div>
        </Panel>
      </div>
    );
  }

  const filteredTop = summary.top.filter((acc) => {
    if (filterTypology === "all") return true;
    const item = summary.indicators.find((ind) => ind.account === acc.account);
    if (!item) return false;
    return item.flags.includes(filterTypology);
  });

  const nodeCount = summary.top.length;
  const radius = 170;
  const centerX = 260;
  const centerY = 210;

  const nodePositions = new Map<string, { x: number; y: number }>();
  summary.top.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / Math.max(nodeCount, 1);
    nodePositions.set(node.account, {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    });
  });

  const selectedStats = selectedAccount ? summary.top.find((a) => a.account === selectedAccount) : null;
  const selectedFlags = selectedAccount ? summary.indicators.find((i) => i.account === selectedAccount)?.flags || [] : [];

  return (
    <div className="space-y-6">
      {/* KPI Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Total Accounts" value={summary.nodes.toLocaleString()} />
        <Stat label="Transaction Edges" value={summary.edges.toLocaleString()} />
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
          label="High Velocity"
          value={summary.velocity?.length ?? 0}
          tone={(summary.velocity?.length ?? 0) > 0 ? "warn" : "ok"}
        />
      </div>

      {/* Typology Reference Cards */}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <div className="panel p-3 bg-muted/20 border-border/80 text-xs">
          <div className="flex items-center gap-2 font-semibold text-foreground mb-1">
            <Share2 className="h-4 w-4 text-warning" /> Fan-Out (Smurfing)
          </div>
          <p className="text-muted-foreground text-[11px]">
            Sending to &ge; {INDICATORS.fanThreshold} distinct counterparties to split large illicit deposits into non-reportable amounts.
          </p>
        </div>

        <div className="panel p-3 bg-muted/20 border-border/80 text-xs">
          <div className="flex items-center gap-2 font-semibold text-foreground mb-1">
            <Layers className="h-4 w-4 text-primary" /> Fan-In (Collection)
          </div>
          <p className="text-muted-foreground text-[11px]">
            Receiving from &ge; {INDICATORS.fanThreshold} distinct senders. Pooling distributed funds prior to off-ramping.
          </p>
        </div>

        <div className="panel p-3 bg-muted/20 border-border/80 text-xs">
          <div className="flex items-center gap-2 font-semibold text-foreground mb-1">
            <Zap className="h-4 w-4 text-destructive" /> Pass-Through Mule
          </div>
          <p className="text-muted-foreground text-[11px]">
            Immediate outflow (0.9 &le; Out/In &le; 1.1) acting as a conduit to obscure true beneficial ownership.
          </p>
        </div>

        <div className="panel p-3 bg-muted/20 border-border/80 text-xs">
          <div className="flex items-center gap-2 font-semibold text-foreground mb-1">
            <Repeat className="h-4 w-4 text-destructive" /> Circular Loops
          </div>
          <p className="text-muted-foreground text-[11px]">
            Layering cycles (A &rarr; B &rarr; C &rarr; A) routing funds through intermediate nodes to forge artificial trade volume.
          </p>
        </div>
      </div>

      {/* SVG Visualization & Account Inspector */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel
            title="Directed Transaction Graph Topology"
            right={
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Filter:</span>
                <select
                  className={selectCls + " h-7 text-xs font-mono"}
                  value={filterTypology}
                  onChange={(e) => setFilterTypology(e.target.value)}
                >
                  <option value="all">All Top Accounts</option>
                  <option value="fan-in">Fan-In (Aggregation)</option>
                  <option value="fan-out">Fan-Out (Smurfing)</option>
                  <option value="pass-through">Pass-Through Mules</option>
                </select>
              </div>
            }
          >
            <div className="flex items-center justify-center overflow-hidden rounded bg-black/40 p-2">
              <svg width="520" height="420" viewBox="0 0 520 420" className="w-full max-w-[520px] select-none">
                <defs>
                  <marker
                    id="graphArrow"
                    markerWidth="6"
                    markerHeight="6"
                    refX="14"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 6 3, 0 6" fill="rgba(255, 255, 255, 0.4)" />
                  </marker>
                </defs>

                {summary.subEdges.map((e, idx) => {
                  const s = nodePositions.get(e.source);
                  const t = nodePositions.get(e.target);
                  if (!s || !t) return null;
                  const isHighlighted = selectedAccount && (e.source === selectedAccount || e.target === selectedAccount);
                  return (
                    <line
                      key={idx}
                      x1={s.x}
                      y1={s.y}
                      x2={t.x}
                      y2={t.y}
                      stroke={isHighlighted ? "var(--primary)" : "rgba(255, 255, 255, 0.15)"}
                      strokeWidth={isHighlighted ? 2.5 : 1}
                      markerEnd="url(#graphArrow)"
                    />
                  );
                })}

                {summary.top.map((node) => {
                  const pos = nodePositions.get(node.account);
                  if (!pos) return null;
                  const isFlagged = summary.indicators.some((ind) => ind.account === node.account);
                  const isSelected = selectedAccount === node.account;
                  const circleColor = isFlagged ? "oklch(0.63 0.21 25)" : "oklch(0.8 0.15 80)";

                  return (
                    <g
                      key={node.account}
                      transform={`translate(${pos.x}, ${pos.y})`}
                      className="cursor-pointer"
                      onClick={() => setSelectedAccount(isSelected ? null : node.account)}
                    >
                      <circle
                        r={isSelected ? 16 : 12}
                        fill={circleColor}
                        fillOpacity={isSelected ? 0.9 : 0.6}
                        stroke={isSelected ? "#fff" : circleColor}
                        strokeWidth={isSelected ? 2.5 : 1}
                      />
                      <text
                        y={22}
                        textAnchor="middle"
                        fill="currentColor"
                        className="font-mono text-[9px] fill-foreground/90 font-medium"
                      >
                        {node.account}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground font-mono">
              Click any account node to inspect inward/outward telemetry and counterparty degree.
            </p>
          </Panel>
        </div>

        {/* Selected Account Inspector */}
        <div>
          <Panel title="Account Node Inspector">
            {selectedStats ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div>
                    <div className="label-mono">Account Identifier</div>
                    <div className="font-mono text-base font-bold text-foreground">{selectedStats.account}</div>
                  </div>
                  {selectedFlags.length > 0 ? (
                    <Chip tone="bad">RISK FLAGGED</Chip>
                  ) : (
                    <Chip tone="ok">STANDARD</Chip>
                  )}
                </div>

                {selectedFlags.length > 0 && (
                  <div>
                    <div className="label-mono mb-1">Flagged Typologies:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedFlags.map((fl) => (
                        <Chip key={fl} tone="bad">{fl}</Chip>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between border-b border-border/40 py-1">
                    <span className="text-muted-foreground">Inbound Transactions:</span>
                    <span className="text-foreground">{selectedStats.in_count} ({selectedStats.in_unique} senders)</span>
                  </div>
                  <div className="flex justify-between border-b border-border/40 py-1">
                    <span className="text-muted-foreground">Inbound Amount:</span>
                    <span className="text-foreground">${selectedStats.in_total.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/40 py-1">
                    <span className="text-muted-foreground">Outbound Transactions:</span>
                    <span className="text-foreground">{selectedStats.out_count} ({selectedStats.out_unique} receivers)</span>
                  </div>
                  <div className="flex justify-between border-b border-border/40 py-1">
                    <span className="text-muted-foreground">Outbound Amount:</span>
                    <span className="text-foreground">${selectedStats.out_total.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/40 py-1">
                    <span className="text-muted-foreground">Passthrough Flow:</span>
                    <span className={`font-bold ${selectedStats.passthrough >= 0.9 && selectedStats.passthrough <= 1.1 ? "text-destructive" : "text-foreground"}`}>
                      {(selectedStats.passthrough * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-muted-foreground space-y-2">
                <Eye className="h-8 w-8 text-muted-foreground/40" />
                <p>Click any node in the circular graph or an account row below to inspect its transaction graph telemetry.</p>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* Circular Loops Inspector */}
      {summary.cycles.length > 0 && (
        <Panel title={`Circular Layering Rings (${summary.cycles.length} detected)`}>
          <div className="max-h-48 overflow-y-auto space-y-2">
            {summary.cycles.map((cyc, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-mono text-foreground"
              >
                <Repeat className="h-4 w-4 text-destructive shrink-0" />
                <span className="text-destructive font-bold">Ring #{idx + 1}:</span>
                <span className="truncate">
                  {cyc.join(" → ")} → {cyc[0]}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Accounts Table */}
      <Panel title="Highest Degree Counterparty Accounts">
        <DataTable
          head={["Account", "Degree", "Out Txs", "In Txs", "Out Amount", "In Amount", "Passthrough", "Typologies"]}
          rows={filteredTop.map((acc) => {
            const ind = summary.indicators.find((i) => i.account === acc.account);
            return [
              <span
                key={acc.account}
                onClick={() => setSelectedAccount(acc.account)}
                className="cursor-pointer text-primary hover:underline font-bold"
              >
                {acc.account}
              </span>,
              acc.degree,
              acc.out_count,
              acc.in_count,
              `$${Math.round(acc.out_total).toLocaleString()}`,
              `$${Math.round(acc.in_total).toLocaleString()}`,
              `${(acc.passthrough * 100).toFixed(0)}%`,
              ind ? (
                <div key={acc.account} className="flex gap-1 flex-wrap">
                  {ind.flags.map((fl) => (
                    <Chip key={fl} tone="bad">{fl}</Chip>
                  ))}
                </div>
              ) : (
                <span key={acc.account} className="text-muted-foreground">None</span>
              ),
            ];
          })}
        />
      </Panel>
    </div>
  );
}
