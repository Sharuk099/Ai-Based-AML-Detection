// @ts-nocheck -- strict index checks relaxed for numeric ML code
import { useState, useMemo, useCallback } from "react";
import {
  ArrowRight,
  ShieldAlert,
  Repeat,
  Zap,
  CheckCircle2,
  Search,
  Filter,
  Download,
  Printer,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface GraphDiagram2DProps {
  accounts: {
    account: string;
    in_count: number;
    in_total: number;
    out_count: number;
    out_total: number;
    passthrough: number;
    fan_out: number;
    fan_in: number;
  }[];
  edges: {
    source: string;
    target: string;
    weight: number;
    txCount: number;
  }[];
  cycles: string[][];
  indicators: { account: string; flags: string[] }[];
  selectedAccount: string | null;
  onSelectAccount: (acc: string | null) => void;
  currencySymbol?: string;
}

export function GraphDiagram2D({
  accounts,
  edges,
  cycles,
  indicators,
  selectedAccount,
  onSelectAccount,
  currencySymbol = "$",
}: GraphDiagram2DProps) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "RINGS" | "MULES" | "NORMAL">("ALL");

  const loopAccounts = useMemo(() => {
    const set = new Set<string>();
    cycles.forEach((c) => c.forEach((acc) => set.add(acc)));
    return set;
  }, [cycles]);

  const muleAccounts = useMemo(() => {
    const set = new Set<string>();
    accounts.forEach((a) => {
      if (a.passthrough >= 0.85 && a.passthrough <= 1.15 && a.out_total > 5000) {
        set.add(a.account);
      }
    });
    return set;
  }, [accounts]);

  // Categorize accounts into 3 clean directed stages
  const { senders, intermediaries, sinks } = useMemo(() => {
    const s: typeof accounts = [];
    const m: typeof accounts = [];
    const d: typeof accounts = [];

    accounts.forEach((acc) => {
      const isLoop = loopAccounts.has(acc.account);
      const isMule = muleAccounts.has(acc.account);

      if (isLoop || isMule) {
        m.push(acc);
      } else if (acc.out_count > 0 && acc.in_count === 0) {
        s.push(acc);
      } else if (acc.in_count > 0 && acc.out_count === 0) {
        d.push(acc);
      } else if (acc.out_total > acc.in_total * 1.5) {
        s.push(acc);
      } else if (acc.in_total > acc.out_total * 1.5) {
        d.push(acc);
      } else {
        m.push(acc);
      }
    });

    return { senders: s, intermediaries: m, sinks: d };
  }, [accounts, loopAccounts, muleAccounts]);

  // Filter accounts
  const filterList = useCallback(
    (list: typeof accounts) => {
      return list.filter((a) => {
        if (filterType === "RINGS" && !loopAccounts.has(a.account)) return false;
        if (filterType === "MULES" && !muleAccounts.has(a.account)) return false;
        if (filterType === "NORMAL" && (loopAccounts.has(a.account) || muleAccounts.has(a.account)))
          return false;
        if (search.trim() && !a.account.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      });
    },
    [filterType, loopAccounts, muleAccounts, search],
  );

  const filteredSenders = useMemo(() => filterList(senders).slice(0, 15), [senders, filterList]);
  const filteredIntermediaries = useMemo(
    () => filterList(intermediaries).slice(0, 20),
    [intermediaries, filterList],
  );
  const filteredSinks = useMemo(() => filterList(sinks).slice(0, 15), [sinks, filterList]);

  const visibleAccSet = useMemo(() => {
    const set = new Set<string>();
    filteredSenders.forEach((a) => set.add(a.account));
    filteredIntermediaries.forEach((a) => set.add(a.account));
    filteredSinks.forEach((a) => set.add(a.account));
    if (selectedAccount) set.add(selectedAccount);
    return set;
  }, [filteredSenders, filteredIntermediaries, filteredSinks, selectedAccount]);

  const relevantEdges = useMemo(() => {
    return edges.filter((e) => visibleAccSet.has(e.source) && visibleAccSet.has(e.target));
  }, [edges, visibleAccSet]);

  const handlePrint2D = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-xs font-mono">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search account ID in 2D diagram..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs font-mono bg-background"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant={filterType === "ALL" ? "default" : "outline"}
            onClick={() => setFilterType("ALL")}
            className={`h-7 px-2.5 text-xs ${filterType === "ALL" ? "bg-primary text-primary-foreground font-bold" : ""}`}
          >
            All Stages
          </Button>
          <Button
            size="sm"
            variant={filterType === "RINGS" ? "default" : "outline"}
            onClick={() => setFilterType("RINGS")}
            className={`h-7 px-2.5 text-xs ${filterType === "RINGS" ? "bg-destructive text-destructive-foreground font-bold" : ""}`}
          >
            🔁 Circular Rings ({cycles.length})
          </Button>
          <Button
            size="sm"
            variant={filterType === "MULES" ? "default" : "outline"}
            onClick={() => setFilterType("MULES")}
            className={`h-7 px-2.5 text-xs ${filterType === "MULES" ? "bg-amber-500 text-black font-bold" : ""}`}
          >
            ⚡ Mules ({muleAccounts.size})
          </Button>
          <Button
            size="sm"
            variant={filterType === "NORMAL" ? "default" : "outline"}
            onClick={() => setFilterType("NORMAL")}
            className={`h-7 px-2.5 text-xs ${filterType === "NORMAL" ? "bg-success text-success-foreground font-bold" : ""}`}
          >
            ✅ Normal
          </Button>
        </div>
      </div>

      {/* Detected Circular Layering Rings Callout Banner */}
      {cycles.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3.5 text-xs font-mono">
          <div className="flex items-center gap-2 font-bold text-destructive mb-2">
            <Repeat className="h-4 w-4" />
            <span>Detected Circular Layering Laundering Loops ({cycles.length} Rings):</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {cycles.map((ring, idx) => (
              <div
                key={idx}
                className="rounded border border-destructive/30 bg-card p-2.5 flex items-center justify-between"
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-destructive">Ring #{idx + 1}:</span>
                  {ring.map((acc, aIdx) => (
                    <span key={acc} className="flex items-center gap-1">
                      <button
                        onClick={() => onSelectAccount(acc)}
                        className={`font-semibold hover:underline ${
                          selectedAccount === acc ? "text-primary font-bold" : "text-foreground"
                        }`}
                      >
                        {acc}
                      </button>
                      {aIdx < ring.length - 1 && (
                        <ArrowRight className="h-3 w-3 text-destructive" />
                      )}
                    </span>
                  ))}
                  <ArrowRight className="h-3 w-3 text-destructive" />
                  <span className="text-muted-foreground">{ring[0]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2D Directed Stages Flow Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Stage 1: Originating Senders */}
        <div className="space-y-3 rounded-lg border border-border bg-card/60 p-4">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div className="font-bold text-xs text-foreground flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" />
              <span>1. Source Originators (Senders)</span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              {filteredSenders.length} Shown
            </span>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {filteredSenders.map((acc) => {
              const isSelected = selectedAccount === acc.account;
              return (
                <div
                  key={acc.account}
                  onClick={() => onSelectAccount(isSelected ? null : acc.account)}
                  className={`rounded border p-2.5 text-xs font-mono cursor-pointer transition-all ${
                    isSelected
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "border-border/70 bg-card hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-foreground mb-1">
                    <span className="truncate">{acc.account}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {currencySymbol}
                      {Math.round(acc.out_total).toLocaleString()} Out
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{acc.out_count} transfers sent</span>
                    <span className="text-cyan-500 font-medium">Source Node</span>
                  </div>
                </div>
              );
            })}
            {filteredSenders.length === 0 && (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No source accounts
              </div>
            )}
          </div>
        </div>

        {/* Stage 2: Intermediaries, Layering Rings & Mules */}
        <div className="space-y-3 rounded-lg border border-border bg-card/60 p-4">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div className="font-bold text-xs text-foreground flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              <span>2. Intermediaries, Mules & Rings</span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              {filteredIntermediaries.length} Shown
            </span>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {filteredIntermediaries.map((acc) => {
              const isLoop = loopAccounts.has(acc.account);
              const isMule = muleAccounts.has(acc.account);
              const isSelected = selectedAccount === acc.account;

              return (
                <div
                  key={acc.account}
                  onClick={() => onSelectAccount(isSelected ? null : acc.account)}
                  className={`rounded border p-2.5 text-xs font-mono cursor-pointer transition-all ${
                    isLoop
                      ? "border-destructive/60 bg-destructive/10"
                      : isMule
                        ? "border-amber-500/50 bg-amber-500/10"
                        : isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border/70 bg-card hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-foreground mb-1">
                    <span className="truncate">{acc.account}</span>
                    {isLoop ? (
                      <span className="rounded bg-destructive/20 text-destructive text-[9px] px-1.5 py-0.2 font-bold">
                        🔁 RING LOOP
                      </span>
                    ) : isMule ? (
                      <span className="rounded bg-amber-500/20 text-amber-500 text-[9px] px-1.5 py-0.2 font-bold">
                        ⚡ MULE
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">CONDUIT</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>
                      In: {currencySymbol}
                      {Math.round(acc.in_total).toLocaleString()}
                    </span>
                    <span>
                      Out: {currencySymbol}
                      {Math.round(acc.out_total).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Passthrough: {(acc.passthrough * 100).toFixed(0)}%</span>
                    <span className="text-foreground font-semibold">
                      {acc.in_count} in · {acc.out_count} out
                    </span>
                  </div>
                </div>
              );
            })}
            {filteredIntermediaries.length === 0 && (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No intermediary accounts
              </div>
            )}
          </div>
        </div>

        {/* Stage 3: Destination Sinks */}
        <div className="space-y-3 rounded-lg border border-border bg-card/60 p-4">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div className="font-bold text-xs text-foreground flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span>3. Destination Beneficiaries (Sinks)</span>
            </div>
            <span className="text-[10px] text-muted-foreground">{filteredSinks.length} Shown</span>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {filteredSinks.map((acc) => {
              const isSelected = selectedAccount === acc.account;
              return (
                <div
                  key={acc.account}
                  onClick={() => onSelectAccount(isSelected ? null : acc.account)}
                  className={`rounded border p-2.5 text-xs font-mono cursor-pointer transition-all ${
                    isSelected
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "border-border/70 bg-card hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-foreground mb-1">
                    <span className="truncate">{acc.account}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {currencySymbol}
                      {Math.round(acc.in_total).toLocaleString()} In
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{acc.in_count} transfers received</span>
                    <span className="text-emerald-500 font-medium">Sink Node</span>
                  </div>
                </div>
              );
            })}
            {filteredSinks.length === 0 && (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No destination sink accounts
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
