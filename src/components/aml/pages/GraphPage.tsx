import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Network,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  AlertCircle,
  Share2,
  Layers,
  Repeat,
  Zap,
  Search,
  Filter,
  ArrowRight,
  ShieldAlert,
  Info,
  CheckCircle2,
  Move,
  List,
  Eye,
  Sliders,
  Sparkles,
  Download,
  Copy,
  Check,
  Crosshair,
} from "lucide-react";
import { useAml } from "../state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, Stat, Chip, Note, selectCls } from "../ui";
import { graphSummary } from "@/lib/aml/graph";
import { INDICATORS } from "@/lib/aml/types";

interface NodePos {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  pinned?: boolean;
}

export function GraphPage() {
  const { activeDs, analysisResult, setTab } = useAml();

  // Active View Tab: Interactive Graph vs All Connections Table vs Account Dossier
  const [activeView, setActiveView] = useState<"graph" | "connections" | "accounts">("graph");

  // Filters & Density
  const [densityMode, setDensityMode] = useState<string>("all");
  const [filterTypology, setFilterTypology] = useState<string>("all");
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<{
    source: string;
    target: string;
    weight: number;
    txCount?: number;
  } | null>(null);
  const [highlightLoops, setHighlightLoops] = useState(true);
  const [highlightMules, setHighlightMules] = useState(true);
  const [isolateNeighbors, setIsolateNeighbors] = useState(false);
  const [showEdgeLabels, setShowEdgeLabels] = useState(false);
  const [layoutMode, setLayoutMode] = useState<"force" | "radial" | "flow" | "communities">(
    "force",
  );
  const [searchAccount, setSearchAccount] = useState("");
  const [minAmountFilter, setMinAmountFilter] = useState<number>(0);
  const [copiedAccount, setCopiedAccount] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Transform / Canvas Viewport State (Zoom & Pan)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const initialPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Node Dragging State & Layout Simulation
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState<Map<string, NodePos>>(new Map());
  const [isSimulating, setIsSimulating] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastTouchDistRef = useRef<number | null>(null);

  // Currency detection (Indian Rupee or USD/EUR)
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

  // All directed edges from the summary
  const rawEdges = useMemo(() => {
    if (!summary) return [];
    return summary.allEdges || summary.subEdges || [];
  }, [summary]);

  // Filtered accounts based on density & typologies
  const visibleAccounts = useMemo(() => {
    if (!summary) return [];
    let list = [...summary.accounts];

    // Typology filter
    if (filterTypology === "suspicious") {
      const flaggedSet = new Set(summary.indicators.map((i) => i.account));
      list = list.filter((a) => flaggedSet.has(a.account) || suspiciousLoopAccounts.has(a.account));
    } else if (filterTypology === "mule") {
      list = list.filter((a) => muleAccounts.has(a.account));
    } else if (filterTypology === "cycle") {
      list = list.filter((a) => suspiciousLoopAccounts.has(a.account));
    } else if (filterTypology === "fan_out") {
      list = list.filter((a) => a.fan_out);
    } else if (filterTypology === "fan_in") {
      list = list.filter((a) => a.fan_in);
    } else if (filterTypology === "high_volume") {
      list = list.filter((a) => (a.totalVolume || a.in_total + a.out_total) >= 20000);
    }

    // Min Amount Filter on accounts
    if (minAmountFilter > 0) {
      list = list.filter((a) => (a.totalVolume || a.in_total + a.out_total) >= minAmountFilter);
    }

    // Density Limit
    if (densityMode === "top25") {
      list = list.slice(0, 25);
    } else if (densityMode === "top50") {
      list = list.slice(0, 50);
    } else if (densityMode === "top100") {
      list = list.slice(0, 100);
    } else if (densityMode === "top250") {
      list = list.slice(0, 250);
    }
    // "all" keeps all accounts

    // If an account is explicitly selected or searched, ensure it's in the list
    if (selectedAccount && !list.some((a) => a.account === selectedAccount)) {
      const sel = summary.accounts.find((a) => a.account === selectedAccount);
      if (sel) list = [sel, ...list];
    }

    // If isolating neighbors of selected account
    if (isolateNeighbors && selectedAccount) {
      const neighborSet = new Set<string>([selectedAccount]);
      rawEdges.forEach((e) => {
        if (e.source === selectedAccount) neighborSet.add(e.target);
        if (e.target === selectedAccount) neighborSet.add(e.source);
      });
      list = list.filter((a) => neighborSet.has(a.account));
    }

    return list;
  }, [
    summary,
    filterTypology,
    densityMode,
    selectedAccount,
    isolateNeighbors,
    minAmountFilter,
    rawEdges,
    suspiciousLoopAccounts,
    muleAccounts,
  ]);

  // Filtered edges connecting visible accounts
  const visibleEdges = useMemo(() => {
    if (!summary || !visibleAccounts.length) return [];
    const accSet = new Set(visibleAccounts.map((a) => a.account));

    return rawEdges.filter((e) => {
      if (!accSet.has(e.source) || !accSet.has(e.target)) return false;
      if (minAmountFilter > 0 && e.weight < minAmountFilter) return false;
      return true;
    });
  }, [summary, visibleAccounts, rawEdges, minAmountFilter]);

  // Layout calculation (Force, Radial, Flow, or Communities)
  useEffect(() => {
    if (!visibleAccounts.length) return;
    const width = 1000;
    const height = 650;
    const centerX = width / 2;
    const centerY = height / 2;

    const newPositions = new Map<string, NodePos>();
    const count = visibleAccounts.length;

    if (layoutMode === "radial") {
      const radius = Math.min(width, height) * 0.4;
      visibleAccounts.forEach((acc, i) => {
        const angle = (2 * Math.PI * i) / count - Math.PI / 2;
        newPositions.set(acc.account, {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        });
      });
    } else if (layoutMode === "flow") {
      // Left-to-right flow: Senders (col 0) -> Intermediaries / Mules (col 1) -> Sinks (col 2)
      visibleAccounts.forEach((acc, i) => {
        const ratio = acc.passthrough;
        let col = 1;
        if (acc.out_count > 0 && acc.in_count === 0) col = 0;
        else if (acc.in_count > 0 && acc.out_count === 0) col = 2;
        else if (ratio >= 0.85 && ratio <= 1.15) col = 1;
        else if (acc.out_count > acc.in_count) col = 0.5;
        else col = 1.5;

        const x = 120 + (col / 2) * (width - 240);
        const y = 80 + ((i % 18) / 18) * (height - 160) + (i % 3) * 12;
        newPositions.set(acc.account, { x, y });
      });
    } else if (layoutMode === "communities") {
      // High-risk & cycle members in inner circle, standard in outer orbit
      const innerRadius = 140;
      const outerRadius = 280;
      let innerCount = 0;
      let outerCount = 0;

      visibleAccounts.forEach((acc) => {
        const isCore = suspiciousLoopAccounts.has(acc.account) || muleAccounts.has(acc.account);
        if (isCore) innerCount++;
        else outerCount++;
      });

      let innerIdx = 0;
      let outerIdx = 0;
      visibleAccounts.forEach((acc) => {
        const isCore = suspiciousLoopAccounts.has(acc.account) || muleAccounts.has(acc.account);
        if (isCore) {
          const angle = (2 * Math.PI * innerIdx) / Math.max(innerCount, 1);
          newPositions.set(acc.account, {
            x: centerX + innerRadius * Math.cos(angle),
            y: centerY + innerRadius * Math.sin(angle),
          });
          innerIdx++;
        } else {
          const angle = (2 * Math.PI * outerIdx) / Math.max(outerCount, 1);
          newPositions.set(acc.account, {
            x: centerX + outerRadius * Math.cos(angle),
            y: centerY + outerRadius * Math.sin(angle),
          });
          outerIdx++;
        }
      });
    } else {
      // Force-directed layout placement with repulsion and edge attraction relaxation
      visibleAccounts.forEach((acc, i) => {
        const angle = (2 * Math.PI * i) / count;
        const dist = 90 + (i % 4) * 60;
        newPositions.set(acc.account, {
          x: centerX + dist * Math.cos(angle),
          y: centerY + dist * Math.sin(angle),
        });
      });

      // Relaxation passes
      const posArr = Array.from(newPositions.entries());
      const edgePairs = visibleEdges
        .map((e) => ({
          s: newPositions.get(e.source),
          t: newPositions.get(e.target),
        }))
        .filter((pair) => pair.s && pair.t) as { s: NodePos; t: NodePos }[];

      for (let step = 0; step < 35; step++) {
        // Node repulsion
        for (let i = 0; i < posArr.length; i++) {
          for (let j = i + 1; j < posArr.length; j++) {
            const p1 = posArr[i]?.[1];
            const p2 = posArr[j]?.[1];
            if (!p1 || !p2) continue;
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.hypot(dx, dy) || 1;
            const minDist = count > 100 ? 55 : 95;
            if (dist < minDist) {
              const force = ((minDist - dist) / dist) * 0.35;
              p1.x -= dx * force;
              p1.y -= dy * force;
              p2.x += dx * force;
              p2.y += dy * force;
            }
          }
        }
        // Edge attraction
        for (const { s, t } of edgePairs) {
          const dx = t.x - s.x;
          const dy = t.y - s.y;
          const dist = Math.hypot(dx, dy) || 1;
          const targetDist = count > 100 ? 80 : 130;
          if (dist > targetDist) {
            const force = ((dist - targetDist) / dist) * 0.08;
            s.x += dx * force;
            s.y += dy * force;
            t.x -= dx * force;
            t.y -= dy * force;
          }
        }
      }
    }

    setNodePositions(newPositions);
  }, [visibleAccounts, layoutMode, visibleEdges, suspiciousLoopAccounts, muleAccounts]);

  // Zoom and Pan Controls
  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.3, 4.0));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.3, 0.2));
  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedAccount(null);
    setSelectedEdge(null);
  };

  // Fit all nodes into screen view
  const handleFitToScreen = () => {
    if (!nodePositions.size) return;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    nodePositions.forEach((pos) => {
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y);
    });

    const graphW = Math.max(maxX - minX + 120, 300);
    const graphH = Math.max(maxY - minY + 120, 300);
    const svgW = 1000;
    const svgH = 650;

    const scale = Math.min(svgW / graphW, svgH / graphH, 1.8);
    const targetZoom = Math.max(0.35, scale * 0.85);

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    setZoom(targetZoom);
    setPan({
      x: svgW / 2 - midX * targetZoom,
      y: svgH / 2 - midY * targetZoom,
    });
  };

  // Center on a specific account
  const centerOnAccount = (accountName: string) => {
    const pos = nodePositions.get(accountName);
    if (!pos) return;
    const svgW = 1000;
    const svgH = 650;
    const targetZoom = Math.max(zoom, 1.4);
    setZoom(targetZoom);
    setPan({
      x: svgW / 2 - pos.x * targetZoom,
      y: svgH / 2 - pos.y * targetZoom,
    });
    setSelectedAccount(accountName);
  };

  // Mouse Wheel Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    setZoom((z) => Math.max(0.2, Math.min(4.5, z * zoomFactor)));
  };

  // Canvas Pan (Mouse)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (
      e.target !== svgRef.current &&
      (e.target as HTMLElement).tagName !== "svg" &&
      (e.target as HTMLElement).tagName !== "rect"
    ) {
      return;
    }
    setIsPanning(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    initialPanRef.current = { ...pan };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggedNode) {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const svgX = (e.clientX - rect.left - pan.x) / zoom;
      const svgY = (e.clientY - rect.top - pan.y) / zoom;
      setNodePositions((prev) => {
        const next = new Map(prev);
        next.set(draggedNode, { x: svgX, y: svgY, pinned: true });
        return next;
      });
      return;
    }

    if (isPanning) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPan({
        x: initialPanRef.current.x + dx,
        y: initialPanRef.current.y + dy,
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggedNode(null);
  };

  // Touch Support (Mobile / Tablet Pinch & Pan)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && e.touches[0]) {
      setIsPanning(true);
      dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      initialPanRef.current = { ...pan };
      lastTouchDistRef.current = null;
    } else if (e.touches.length === 2 && e.touches[0] && e.touches[1]) {
      setIsPanning(false);
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      lastTouchDistRef.current = dist;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isPanning && e.touches[0]) {
      const dx = e.touches[0].clientX - dragStartRef.current.x;
      const dy = e.touches[0].clientY - dragStartRef.current.y;
      setPan({
        x: initialPanRef.current.x + dx,
        y: initialPanRef.current.y + dy,
      });
    } else if (e.touches.length === 2 && lastTouchDistRef.current && e.touches[0] && e.touches[1]) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const ratio = dist / lastTouchDistRef.current;
      setZoom((z) => Math.max(0.2, Math.min(4.5, z * ratio)));
      lastTouchDistRef.current = dist;
    }
  };

  const handleTouchEnd = () => {
    setIsPanning(false);
    lastTouchDistRef.current = null;
    setDraggedNode(null);
  };

  // Copy helper
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAccount(text);
    setTimeout(() => setCopiedAccount(null), 2000);
  };

  if (!activeDs) {
    return (
      <div className="space-y-4">
        <Panel title="Transaction Network & Graph Intelligence">
          <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
            <Network className="h-12 w-12 text-muted-foreground/40" />
            <h3 className="text-base font-semibold text-foreground">No Dataset Selected</h3>
            <p className="max-w-md text-xs text-muted-foreground">
              Please upload or load a transaction dataset first to compute account relationships,
              circular layering rings, and transfer networks.
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
        <Panel title="Transaction Network & Graph Intelligence">
          <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
            <AlertCircle className="h-12 w-12 text-warning" />
            <h3 className="text-base font-semibold text-foreground">
              Sender & Receiver Columns Needed
            </h3>
            <p className="max-w-md text-xs text-muted-foreground">
              Graph intelligence requires transaction sender and receiver identifiers (from_account
              and to_account) to construct directed flow networks.
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

  // All Inbound and Outbound transfers across the entire dataset for this account
  const allInboundForSelected = selectedAccount
    ? rawEdges.filter((e) => e.target === selectedAccount)
    : [];
  const allOutboundForSelected = selectedAccount
    ? rawEdges.filter((e) => e.source === selectedAccount)
    : [];

  // Search filtered accounts
  const searchedAccounts = searchAccount.trim()
    ? summary.accounts.filter((a) =>
        a.account.toLowerCase().includes(searchAccount.toLowerCase().trim()),
      )
    : [];

  return (
    <div className="space-y-6">
      {/* Top Navigation & Operational View Switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Network className="h-5 w-5 text-primary" />
              <span>Counterparty Network & Graph Intelligence</span>
            </h1>
            <span className="rounded bg-primary/10 border border-primary/30 px-2 py-0.5 text-[10px] font-mono text-primary font-bold">
              {summary.nodes.toLocaleString()} Accounts · {summary.edges.toLocaleString()} Edges
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Full-scale topological inspection across all counterparty connections, mule conduits,
            and circular layering rings.
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
            <Network className="mr-1.5 h-3.5 w-3.5" /> Interactive Graph
          </Button>
          <Button
            size="sm"
            variant={activeView === "connections" ? "default" : "ghost"}
            onClick={() => setActiveView("connections")}
            className={`h-7 px-3 text-xs ${activeView === "connections" ? "bg-primary text-primary-foreground font-bold" : ""}`}
          >
            <List className="mr-1.5 h-3.5 w-3.5" /> All Edges ({rawEdges.length})
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
        <Stat label="Total Connections" value={summary.edges.toLocaleString()} />
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

      {/* VIEW 1: INTERACTIVE GRAPH CANVAS */}
      {activeView === "graph" && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Visualizer */}
          <div className="lg:col-span-2 space-y-3">
            <Panel
              title={
                <div className="flex items-center gap-2">
                  <Network className="h-4 w-4 text-primary" />
                  <span>
                    Topology Graph: Viewing {visibleAccounts.length} Accounts &{" "}
                    {visibleEdges.length} Connections
                  </span>
                </div>
              }
              right={
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {/* Account Density Selector - Including ALL ACCOUNTS */}
                  <select
                    className={selectCls + " h-7 text-xs font-mono font-semibold"}
                    value={densityMode}
                    onChange={(e) => setDensityMode(e.target.value)}
                    title="Control how many accounts are displayed"
                  >
                    <option value="all">⚡ All Accounts ({summary.nodes})</option>
                    <option value="top250">Top 250 Accounts</option>
                    <option value="top100">Top 100 Accounts</option>
                    <option value="top50">Top 50 Accounts</option>
                    <option value="top25">Top 25 Accounts</option>
                  </select>

                  {/* Layout Mode */}
                  <select
                    className={selectCls + " h-7 text-xs font-mono"}
                    value={layoutMode}
                    onChange={(e) =>
                      setLayoutMode(e.target.value as "force" | "radial" | "flow" | "communities")
                    }
                  >
                    <option value="force">Force Physics</option>
                    <option value="communities">Risk Communities</option>
                    <option value="flow">Conduit Flow</option>
                    <option value="radial">Radial Ring</option>
                  </select>
                </div>
              }
            >
              {/* Secondary Controls Bar: Typology Filters & Search */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3 mb-3 text-xs">
                {/* Typology Filter */}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className={selectCls + " h-7 text-xs font-mono"}
                    value={filterTypology}
                    onChange={(e) => setFilterTypology(e.target.value)}
                  >
                    <option value="all">All Typologies</option>
                    <option value="suspicious">Flagged Entities Only</option>
                    <option value="mule">Pass-Through Mules</option>
                    <option value="cycle">Circular Ring Members</option>
                    <option value="fan_out">Fan-Out Smurfing</option>
                    <option value="fan_in">Fan-In Aggregators</option>
                    <option value="high_volume">High Volume (&ge; 20k)</option>
                  </select>

                  {/* Highlight Loop Ring Toggle */}
                  <Button
                    size="sm"
                    variant={highlightLoops ? "default" : "outline"}
                    onClick={() => setHighlightLoops(!highlightLoops)}
                    className={`h-7 text-xs font-mono ${
                      highlightLoops
                        ? "bg-destructive text-destructive-foreground font-bold shadow-sm"
                        : ""
                    }`}
                  >
                    <Repeat className="mr-1 h-3.5 w-3.5" />
                    {highlightLoops ? "Rings Highlighted" : "Trace Rings"}
                  </Button>

                  {/* Highlight Mule Toggle */}
                  <Button
                    size="sm"
                    variant={highlightMules ? "default" : "outline"}
                    onClick={() => setHighlightMules(!highlightMules)}
                    className={`h-7 text-xs font-mono ${
                      highlightMules ? "bg-amber-500 text-black font-bold shadow-sm" : ""
                    }`}
                  >
                    <Zap className="mr-1 h-3.5 w-3.5" />
                    {highlightMules ? "Mules Highlighted" : "Highlight Mules"}
                  </Button>

                  {/* Edge Labels Toggle */}
                  <Button
                    size="sm"
                    variant={showEdgeLabels ? "default" : "outline"}
                    onClick={() => setShowEdgeLabels(!showEdgeLabels)}
                    className="h-7 text-xs font-mono"
                  >
                    {showEdgeLabels ? "Hide Amounts" : "Show Amounts"}
                  </Button>
                </div>

                {/* Pan & Zoom Toolbar */}
                <div className="flex items-center gap-1 bg-muted/40 p-1 rounded border border-border/60">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleZoomIn}
                    className="h-6 w-6"
                    title="Zoom In (+)"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-[10px] font-mono w-10 text-center font-bold">
                    {(zoom * 100).toFixed(0)}%
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleZoomOut}
                    className="h-6 w-6"
                    title="Zoom Out (-)"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </Button>
                  <div className="h-3 w-[1px] bg-border mx-0.5" />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleFitToScreen}
                    className="h-6 w-6 text-primary"
                    title="Fit to Screen"
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleReset}
                    className="h-6 w-6"
                    title="Reset View"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Account Quick-Search & Jump Bar */}
              <div className="flex items-center gap-2 mb-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search account, UPI VPA (e.g. acc_mule, @upi, HDFC)..."
                    value={searchAccount}
                    onChange={(e) => setSearchAccount(e.target.value)}
                    className="pl-8 text-xs font-mono h-8 bg-background"
                  />
                </div>
                {searchAccount && searchedAccounts.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => searchedAccounts[0] && centerOnAccount(searchedAccounts[0].account)}
                    className="h-8 text-xs font-mono font-bold bg-primary/10 text-primary border-primary/40"
                  >
                    <Eye className="mr-1 h-3.5 w-3.5" /> Jump to {searchedAccounts[0]?.account}
                  </Button>
                )}
                {selectedAccount && (
                  <Button
                    size="sm"
                    variant={isolateNeighbors ? "default" : "outline"}
                    onClick={() => setIsolateNeighbors(!isolateNeighbors)}
                    className={`h-8 text-xs font-mono ${isolateNeighbors ? "bg-primary font-bold" : ""}`}
                  >
                    {isolateNeighbors ? "Show All Accounts" : "Isolate 1-Hop Neighbors"}
                  </Button>
                )}
              </div>

              {/* Canvas Surface with Wheel, Pan, Touch & Drag Gestures */}
              <div
                ref={containerRef}
                className="relative w-full h-[580px] overflow-hidden rounded-md bg-[#0a0d14] border border-border/80 select-none cursor-grab active:cursor-grabbing"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onWheel={handleWheel}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {/* Floating Touch & Gesture Legend */}
                <div className="absolute top-2.5 left-2.5 z-10 pointer-events-none flex flex-wrap items-center gap-2 rounded bg-black/80 px-2.5 py-1 text-[10px] font-mono text-muted-foreground border border-white/10 backdrop-blur-md">
                  <Move className="h-3 w-3 text-primary" />
                  <span>
                    Pan: Drag background · Zoom: Scroll / Pinch · Drag any node to reposition
                  </span>
                </div>

                {/* Floating Selection Badge */}
                {selectedAccount && (
                  <div className="absolute bottom-2.5 left-2.5 z-10 flex items-center gap-2 rounded bg-black/85 px-3 py-1.5 text-xs font-mono border border-primary/40 backdrop-blur-md shadow-lg">
                    <span className="text-muted-foreground">Focus:</span>
                    <span className="text-foreground font-bold">{selectedAccount}</span>
                    <button
                      onClick={() => setSelectedAccount(null)}
                      className="ml-2 text-muted-foreground hover:text-foreground text-[10px]"
                    >
                      ✕ Clear
                    </button>
                  </div>
                )}

                <svg
                  ref={svgRef}
                  width="100%"
                  height="100%"
                  viewBox="0 0 1000 650"
                  className="w-full h-full"
                >
                  <defs>
                    {/* Standard Direction Arrow */}
                    <marker
                      id="arrow-default"
                      markerWidth="9"
                      markerHeight="9"
                      refX="17"
                      refY="3.5"
                      orient="auto"
                    >
                      <polygon points="0 0, 9 3.5, 0 7" fill="rgba(255, 255, 255, 0.35)" />
                    </marker>
                    {/* Selected / Connected Arrow */}
                    <marker
                      id="arrow-selected"
                      markerWidth="10"
                      markerHeight="10"
                      refX="19"
                      refY="3.5"
                      orient="auto"
                    >
                      <polygon points="0 0, 10 3.5, 0 7" fill="var(--primary)" />
                    </marker>
                    {/* Cycle Ring Warning Arrow */}
                    <marker
                      id="arrow-cycle"
                      markerWidth="10"
                      markerHeight="10"
                      refX="19"
                      refY="3.5"
                      orient="auto"
                    >
                      <polygon points="0 0, 10 3.5, 0 7" fill="oklch(0.63 0.21 25)" />
                    </marker>
                    {/* Mule Warning Arrow */}
                    <marker
                      id="arrow-mule"
                      markerWidth="10"
                      markerHeight="10"
                      refX="19"
                      refY="3.5"
                      orient="auto"
                    >
                      <polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b" />
                    </marker>
                  </defs>

                  {/* Scaled & Panned Group */}
                  <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                    {/* 1. All Directed Transfer Edges */}
                    {visibleEdges.map((e, idx) => {
                      const s = nodePositions.get(e.source);
                      const t = nodePositions.get(e.target);
                      if (!s || !t) return null;

                      const isConnected =
                        selectedAccount &&
                        (e.source === selectedAccount || e.target === selectedAccount);
                      const isCycleEdge =
                        highlightLoops &&
                        suspiciousLoopAccounts.has(e.source) &&
                        suspiciousLoopAccounts.has(e.target);
                      const isMuleEdge =
                        highlightMules &&
                        (muleAccounts.has(e.source) || muleAccounts.has(e.target));
                      const isEdgeSelected =
                        selectedEdge &&
                        selectedEdge.source === e.source &&
                        selectedEdge.target === e.target;

                      let strokeColor = "rgba(255, 255, 255, 0.16)";
                      let strokeWidth = Math.max(1, Math.min(5, 1 + Math.log10(e.weight || 1)));
                      let marker = "url(#arrow-default)";
                      let opacity = selectedAccount ? (isConnected ? 1 : 0.15) : 0.8;

                      if (isCycleEdge) {
                        strokeColor = "oklch(0.63 0.21 25)";
                        strokeWidth = Math.max(strokeWidth, 2.5);
                        marker = "url(#arrow-cycle)";
                        opacity = 1;
                      } else if (isConnected || isEdgeSelected) {
                        strokeColor = e.source === selectedAccount ? "#f59e0b" : "var(--primary)";
                        strokeWidth = Math.max(strokeWidth, 2.8);
                        marker = "url(#arrow-selected)";
                        opacity = 1;
                      } else if (isMuleEdge) {
                        strokeColor = "rgba(245, 158, 11, 0.4)";
                        marker = "url(#arrow-mule)";
                      }

                      // Midpoint for edge label if enabled
                      const midX = (s.x + t.x) / 2;
                      const midY = (s.y + t.y) / 2;

                      return (
                        <g
                          key={`edge-${e.source}-${e.target}-${idx}`}
                          className="cursor-pointer group"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setSelectedEdge(e);
                          }}
                        >
                          <line
                            x1={s.x}
                            y1={s.y}
                            x2={t.x}
                            y2={t.y}
                            stroke={strokeColor}
                            strokeWidth={strokeWidth}
                            strokeOpacity={opacity}
                            strokeDasharray={isCycleEdge ? "5 3" : undefined}
                            markerEnd={marker}
                            className="transition-all"
                          />
                          {/* Hover highlight line */}
                          <line
                            x1={s.x}
                            y1={s.y}
                            x2={t.x}
                            y2={t.y}
                            stroke="transparent"
                            strokeWidth={14}
                          />

                          {/* Edge Amount Label */}
                          {(showEdgeLabels || isConnected || isEdgeSelected) && (
                            <text
                              x={midX}
                              y={midY - 4}
                              textAnchor="middle"
                              className="font-mono text-[8px] fill-foreground/80 font-bold bg-black select-none pointer-events-none drop-shadow"
                            >
                              {formatMoney(e.weight)}
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {/* 2. All Account Nodes */}
                    {visibleAccounts.map((node) => {
                      const pos = nodePositions.get(node.account);
                      if (!pos) return null;

                      const isFlagged = summary.indicators.some(
                        (ind) => ind.account === node.account,
                      );
                      const isSelected = selectedAccount === node.account;
                      const inLoop = highlightLoops && suspiciousLoopAccounts.has(node.account);
                      const isMule = highlightMules && muleAccounts.has(node.account);
                      const isSearched =
                        searchAccount.trim() &&
                        node.account.toLowerCase().includes(searchAccount.toLowerCase().trim());

                      // Node colors
                      let fill = "#38bdf8"; // cyan / normal
                      if (inLoop)
                        fill = "oklch(0.63 0.21 25)"; // red for circular cycle
                      else if (isMule)
                        fill = "#f59e0b"; // amber for mule
                      else if (isFlagged) fill = "#f97316"; // orange for other indicators

                      const radius = isSelected ? 18 : inLoop || isMule || isFlagged ? 13 : 10;
                      const nodeOpacity = selectedAccount
                        ? isSelected ||
                          visibleEdges.some(
                            (e) =>
                              (e.source === selectedAccount && e.target === node.account) ||
                              (e.target === selectedAccount && e.source === node.account),
                          )
                          ? 1
                          : 0.25
                        : 0.95;

                      return (
                        <g
                          key={node.account}
                          transform={`translate(${pos.x}, ${pos.y})`}
                          className="cursor-pointer group"
                          opacity={nodeOpacity}
                          onMouseDown={(ev) => {
                            ev.stopPropagation();
                            setDraggedNode(node.account);
                            setSelectedAccount(node.account);
                          }}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setSelectedAccount(isSelected ? null : node.account);
                          }}
                        >
                          {/* Pulsing Aura if Selected, Cycle Ring, or Searched */}
                          {(isSelected || inLoop || isSearched) && (
                            <circle
                              r={radius + 7}
                              fill={
                                inLoop
                                  ? "oklch(0.63 0.21 25)"
                                  : isSearched
                                    ? "#a855f7"
                                    : "var(--primary)"
                              }
                              fillOpacity={0.3}
                              className="animate-pulse"
                            />
                          )}

                          {/* Node Circle */}
                          <circle
                            r={radius}
                            fill={fill}
                            stroke={isSelected ? "#ffffff" : "rgba(255,255,255,0.45)"}
                            strokeWidth={isSelected ? 3 : 1.5}
                          />

                          {/* Account Identifier Label */}
                          <text
                            y={radius + 12}
                            textAnchor="middle"
                            className="font-mono text-[9px] fill-white/95 font-bold select-none drop-shadow pointer-events-none"
                          >
                            {node.account.length > 15
                              ? `${node.account.slice(0, 13)}…`
                              : node.account}
                          </text>

                          {/* Degree Badge inside node */}
                          <text
                            y={3}
                            textAnchor="middle"
                            className="font-mono text-[8px] fill-black font-extrabold select-none pointer-events-none"
                          >
                            {node.degree}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                </svg>
              </div>

              {/* Edge Dossier Strip when clicked */}
              {selectedEdge && (
                <div className="flex flex-wrap items-center justify-between panel p-3 bg-primary/10 border-primary/40 text-xs font-mono mt-3 rounded">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground">{selectedEdge.source}</span>
                    <ArrowRight className="h-4 w-4 text-primary" />
                    <span className="font-bold text-foreground">{selectedEdge.target}</span>
                    <Chip tone="ok">Direct Transfer</Chip>
                  </div>
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-muted-foreground mr-1">Transferred:</span>
                      <span className="text-foreground font-bold">
                        {formatMoney(selectedEdge.weight)}
                      </span>
                    </div>
                    {selectedEdge.txCount && (
                      <div>
                        <span className="text-muted-foreground mr-1">Count:</span>
                        <span className="text-foreground font-bold">
                          {selectedEdge.txCount} txns
                        </span>
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedEdge(null)}
                      className="h-6 text-[10px] text-muted-foreground"
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              )}
            </Panel>
          </div>

          {/* Right Column: Account Node Dossier & Cycle Rings */}
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
                      <div className="label-mono">Account Identifier</div>
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
                          <Chip tone="bad">Unvalidated Graph Cycle</Chip>
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
                      <span className="text-muted-foreground">Total Net Volume:</span>
                      <span className="text-foreground font-bold">
                        {formatMoney(selectedStats.in_total + selectedStats.out_total)}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-border/40 py-1">
                      <span className="text-muted-foreground">Conduit Turnover (Out/In):</span>
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

                  {/* Complete Connected Counterparties List */}
                  <div className="border-t border-border pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="label-mono">Connected Transfers</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {allInboundForSelected.length + allOutboundForSelected.length} connections
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {allInboundForSelected.map((e, idx) => (
                        <div
                          key={`in-${idx}`}
                          onClick={() => centerOnAccount(e.source)}
                          className="cursor-pointer flex items-center justify-between rounded p-2 bg-muted/20 hover:bg-muted/40 text-[11px] font-mono transition-all border border-transparent hover:border-primary/40"
                          title="Click to jump to this sender"
                        >
                          <span className="text-primary truncate max-w-[140px]">← {e.source}</span>
                          <span className="text-foreground font-bold">{formatMoney(e.weight)}</span>
                        </div>
                      ))}
                      {allOutboundForSelected.map((e, idx) => (
                        <div
                          key={`out-${idx}`}
                          onClick={() => centerOnAccount(e.target)}
                          className="cursor-pointer flex items-center justify-between rounded p-2 bg-muted/20 hover:bg-muted/40 text-[11px] font-mono transition-all border border-transparent hover:border-amber-500/40"
                          title="Click to jump to this receiver"
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
                    Click any node or transaction edge to inspect counterparty balance flows,
                    conduit turnover, and crime typologies.
                  </p>
                </div>
              )}
            </Panel>

            {/* Detected Unvalidated Graph Cycles List */}
            {summary.cycles.length > 0 && (
              <Panel
                title={
                  <div className="flex items-center gap-2">
                    <Repeat className="h-4 w-4 text-destructive" />
                    <span>Unvalidated Graph Cycles ({summary.cycles.length})</span>
                  </div>
                }
              >
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1 text-xs font-mono">
                  {summary.cycles.slice(0, 15).map((cycle, i) => (
                    <div
                      key={i}
                      onClick={() => {
                        setHighlightLoops(true);
                        if (cycle[0]) centerOnAccount(cycle[0]);
                      }}
                      className="cursor-pointer rounded border border-destructive/30 bg-destructive/10 p-2.5 hover:bg-destructive/20 transition-all"
                      title="Click to focus this circular ring in graph"
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

      {/* VIEW 2: ALL CONNECTIONS LEDGER (FULL DATASET TABLE) */}
      {activeView === "connections" && (
        <Panel
          title={
            <div className="flex items-center gap-2">
              <List className="h-4 w-4 text-primary" />
              <span>Full Transaction Connection Ledger ({rawEdges.length} Directed Edges)</span>
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
                    <th className="px-3 py-2 label-mono">Sender Account (From)</th>
                    <th className="px-3 py-2 label-mono"></th>
                    <th className="px-3 py-2 label-mono">Beneficiary Account (To)</th>
                    <th className="px-3 py-2 label-mono">Transferred Volume</th>
                    <th className="px-3 py-2 label-mono">Tx Count</th>
                    <th className="px-3 py-2 label-mono">Connection Typology</th>
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
                          key={`${e.source}-${e.target}-${idx}`}
                          className={`border-b border-border/40 hover:bg-muted/30 ${
                            isCycle ? "bg-destructive/10" : isMule ? "bg-warning/5" : ""
                          }`}
                        >
                          <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                          <td className="px-3 py-2 font-bold text-foreground">{e.source}</td>
                          <td className="px-1 py-2 text-muted-foreground text-center">
                            <ArrowRight className="h-3 w-3 inline text-primary" />
                          </td>
                          <td className="px-3 py-2 font-bold text-foreground">{e.target}</td>
                          <td className="px-3 py-2 font-bold text-foreground">
                            {formatMoney(e.weight)}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {e.txCount || 1} transfers
                          </td>
                          <td className="px-3 py-2">
                            {isCycle ? (
                              <Chip tone="bad">Unvalidated Graph Cycle</Chip>
                            ) : isMule ? (
                              <Chip>Unvalidated Pass-Through Flow</Chip>
                            ) : (
                              <Chip tone="ok">Direct Counterparty</Chip>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setActiveView("graph");
                                centerOnAccount(e.source);
                                setSelectedEdge(e);
                              }}
                              className="h-7 text-xs text-primary"
                            >
                              View in Graph <ArrowRight className="ml-1 h-3 w-3" />
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

      {/* VIEW 3: ACCOUNT DOSSIERS TABLE */}
      {activeView === "accounts" && (
        <Panel
          title={
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              <span>All Account Network Entities ({summary.nodes} Accounts)</span>
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
                    <th className="px-3 py-2 label-mono">Total Net Volume</th>
                    <th className="px-3 py-2 label-mono">Turnover (Out/In)</th>
                    <th className="px-3 py-2 label-mono">Degree</th>
                    <th className="px-3 py-2 label-mono">Risk Status</th>
                    <th className="px-3 py-2 label-mono text-right">Action</th>
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
                              setActiveView("graph");
                              centerOnAccount(acc.account);
                            }}
                            className="h-7 text-xs text-primary"
                          >
                            Inspect <Eye className="ml-1 h-3 w-3" />
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
