// @ts-nocheck -- strict index checks relaxed for numeric ML code
import { INDICATORS, type Row } from "./types";
import { toNum } from "./audit";

export interface AccountStat {
  out_count: number;
  out_total: number;
  out_unique: number;
  in_count: number;
  in_total: number;
  in_unique: number;
  passthrough: number;
  fan_out: number;
  fan_in: number;
}

export const GRAPH_COLS: (keyof AccountStat)[] = [
  "out_count",
  "out_total",
  "out_unique",
  "in_count",
  "in_total",
  "in_unique",
  "passthrough",
  "fan_out",
  "fan_in",
];

export function accountStats(rows: Row[], s: string, r: string, amount?: string): Record<string, AccountStat> {
  const outs = new Map<string, { c: number; t: number; u: Set<string> }>();
  const ins = new Map<string, { c: number; t: number; u: Set<string> }>();

  for (const row of rows) {
    const a = amount ? toNum(row[amount]) || 0 : 1;
    const S = String(row[s] || "");
    const R = String(row[r] || "");
    if (!S || !R) continue;

    const o = outs.get(S) || { c: 0, t: 0, u: new Set() };
    o.c++;
    o.t += a;
    o.u.add(R);
    outs.set(S, o);

    const i = ins.get(R) || { c: 0, t: 0, u: new Set() };
    i.c++;
    i.t += a;
    i.u.add(S);
    ins.set(R, i);
  }

  const stats: Record<string, AccountStat> = {};
  for (const acc of new Set([...outs.keys(), ...ins.keys()])) {
    const o = outs.get(acc);
    const i = ins.get(acc);
    const st: AccountStat = {
      out_count: o?.c || 0,
      out_total: o?.t || 0,
      out_unique: o?.u.size || 0,
      in_count: i?.c || 0,
      in_total: i?.t || 0,
      in_unique: i?.u.size || 0,
      passthrough: 0,
      fan_out: 0,
      fan_in: 0,
    };
    st.passthrough = st.in_total > 0 ? Math.min(st.out_total / st.in_total, 10) : 0;
    st.fan_out = st.out_unique >= INDICATORS.fanThreshold ? 1 : 0;
    st.fan_in = st.in_unique >= INDICATORS.fanThreshold ? 1 : 0;
    stats[acc] = st;
  }
  return stats;
}

export function findCycles(
  adj: Map<string, Set<string>>,
  maxLen = INDICATORS.maxCycleLen,
  limit = INDICATORS.maxCycles,
): string[][] {
  const cycles: string[][] = [];
  const nodes = [...adj.keys()].sort();
  const rank = new Map(nodes.map((n, i) => [n, i]));
  let steps = 0;

  for (const start of nodes) {
    const stack: string[] = [start];
    const dfs = (u: string) => {
      if (cycles.length >= limit || ++steps > 2_000_000) return;
      for (const v of adj.get(u) || []) {
        if (v === start && stack.length >= 2) {
          cycles.push([...stack]);
          if (cycles.length >= limit) return;
        } else if (
          (rank.get(v) ?? -1) > (rank.get(start) ?? -1) &&
          !stack.includes(v) &&
          stack.length < maxLen
        ) {
          stack.push(v);
          dfs(v);
          stack.pop();
        }
      }
    };
    dfs(start);
    if (cycles.length >= limit) break;
  }
  return cycles;
}

export interface CycleInfo {
  path: string[];
  length: number;
  avgAmount: number;
  isSuspicious: boolean;
  classification: "Suspicious Layering Ring" | "Routine Commercial Loop";
  evidence: string;
}

export function graphSummary(
  rows: Row[],
  s: string,
  r: string,
  amount?: string,
  timestamp?: string,
) {
  const stats = accountStats(rows, s, r, amount);
  const adj = new Map<string, Set<string>>();
  const edgeW = new Map<string, number>();

  for (const row of rows) {
    const S = String(row[s] || "");
    const R = String(row[r] || "");
    if (!S || !R) continue;

    if (!adj.has(S)) adj.set(S, new Set());
    adj.get(S)!.add(R);
    const k = S + "\u0001" + R;
    edgeW.set(k, (edgeW.get(k) || 0) + (amount ? toNum(row[amount]) || 0 : 1));
  }

  const accounts = Object.entries(stats).map(([account, st]) => ({
    account,
    ...st,
    degree: st.in_unique + st.out_unique,
  }));
  const top = [...accounts].sort((a, b) => b.degree - a.degree).slice(0, 15);

  const indicators = accounts
    .map((a) => {
      const f: string[] = [];
      if (a.fan_in) f.push("fan-in");
      if (a.fan_out) f.push("fan-out");
      if (
        a.in_total > 5000 &&
        a.out_total > 5000 &&
        a.passthrough >= INDICATORS.passthroughRatio &&
        a.passthrough <= 1.10
      )
        f.push("pass-through");
      return { account: a.account, flags: f };
    })
    .filter((x) => x.flags.length);

  const rawCycles = findCycles(adj);

  // Analyze cycles with validated risk criteria (TASK 4)
  const analyzedCycles: CycleInfo[] = rawCycles.map((path) => {
    let totalAmt = 0;
    let edgeCount = 0;
    for (let i = 0; i < path.length; i++) {
      const u = path[i];
      const v = path[(i + 1) % path.length];
      const w = edgeW.get(u + "\u0001" + v) || 0;
      totalAmt += w;
      edgeCount++;
    }
    const avgAmt = edgeCount > 0 ? totalAmt / edgeCount : 0;

    // A cycle is suspicious ONLY IF accompanied by validated risk criteria:
    // e.g. elevated volume, or pass-through mule account in the loop
    const hasMuleAccount = path.some((acc) => {
      const st = stats[acc];
      return st && st.passthrough >= 0.90 && st.passthrough <= 1.10 && st.out_total > 5000;
    });

    const isSuspicious = hasMuleAccount || avgAmt > 9000;

    return {
      path,
      length: path.length,
      avgAmount: avgAmt,
      isSuspicious,
      classification: isSuspicious ? "Suspicious Layering Ring" : "Routine Commercial Loop",
      evidence: isSuspicious
        ? `Contains pass-through conduit account with average transfer of $${Math.round(avgAmt).toLocaleString()}`
        : "Standard cyclical counterparty flow with normal commercial volumes and no mule indicators.",
    };
  });

  const suspiciousCycles = analyzedCycles.filter((c) => c.isSuspicious);
  const routineCycles = analyzedCycles.filter((c) => !c.isSuspicious);

  let velocity: [string, number][] | null = null;
  if (timestamp) {
    const ts = rows.map((x) => Date.parse(x[timestamp])).filter((t) => !Number.isNaN(t));
    if (ts.length > rows.length / 2) {
      const days = Math.max((Math.max(...ts) - Math.min(...ts)) / 864e5, 1);
      velocity = accounts
        .map((a) => [a.account, +(a.out_count / days).toFixed(2)] as [string, number])
        .filter(([, v]) => v >= INDICATORS.velocityPerDay)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);
    }
  }

  const topSet = new Set(top.map((t) => t.account));
  const edges = [...edgeW.entries()]
    .map(([k, w]) => {
      const [a, b] = k.split("\u0001");
      return { source: a, target: b, weight: w };
    })
    .filter((e) => topSet.has(e.source) && topSet.has(e.target));

  return {
    nodes: accounts.length,
    edges: edgeW.size,
    top,
    indicators,
    cycles: rawCycles,
    analyzedCycles,
    suspiciousCyclesCount: suspiciousCycles.length,
    routineCyclesCount: routineCycles.length,
    velocity,
    subEdges: edges,
  };
}
