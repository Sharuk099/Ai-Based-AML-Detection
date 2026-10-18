import { INDICATORS, type Row } from "./types";
import { toNum } from "./audit";

export interface AccountStat { out_count: number; out_total: number; out_unique: number; in_count: number; in_total: number; in_unique: number; passthrough: number; fan_out: number; fan_in: number }
export const GRAPH_COLS: (keyof AccountStat)[] = ["out_count", "out_total", "out_unique", "in_count", "in_total", "in_unique", "passthrough", "fan_out", "fan_in"];

export function accountStats(rows: Row[], s: string, r: string, amount?: string) {
  const outs = new Map<string, { c: number; t: number; u: Set<string> }>();
  const ins = new Map<string, { c: number; t: number; u: Set<string> }>();
  for (const row of rows) {
    const a = amount ? toNum(row[amount]) || 0 : 1;
    const S = row[s], R = row[r];
    const o = outs.get(S) || { c: 0, t: 0, u: new Set() }; o.c++; o.t += a; o.u.add(R); outs.set(S, o);
    const i = ins.get(R) || { c: 0, t: 0, u: new Set() }; i.c++; i.t += a; i.u.add(S); ins.set(R, i);
  }
  const stats: Record<string, AccountStat> = {};
  for (const acc of new Set([...outs.keys(), ...ins.keys()])) {
    const o = outs.get(acc), i = ins.get(acc);
    const st: AccountStat = {
      out_count: o?.c || 0, out_total: o?.t || 0, out_unique: o?.u.size || 0,
      in_count: i?.c || 0, in_total: i?.t || 0, in_unique: i?.u.size || 0, passthrough: 0, fan_out: 0, fan_in: 0,
    };
    st.passthrough = st.in_total > 0 ? Math.min(st.out_total / st.in_total, 10) : 0;
    st.fan_out = st.out_unique >= INDICATORS.fanThreshold ? 1 : 0;
    st.fan_in = st.in_unique >= INDICATORS.fanThreshold ? 1 : 0;
    stats[acc] = st;
  }
  return stats;
}

export function findCycles(adj: Map<string, Set<string>>, maxLen = INDICATORS.maxCycleLen, limit = INDICATORS.maxCycles) {
  const cycles: string[][] = [];
  const nodes = [...adj.keys()].sort();
  const rank = new Map(nodes.map((n, i) => [n, i]));
  let steps = 0;
  for (const start of nodes) {
    const stack: string[] = [start];
    const dfs = (u: string) => {
      if (cycles.length >= limit || ++steps > 2_000_000) return;
      for (const v of adj.get(u) || []) {
        if (v === start && stack.length >= 2) { cycles.push([...stack]); if (cycles.length >= limit) return; }
        else if ((rank.get(v) ?? -1) > rank.get(start)! && !stack.includes(v) && stack.length < maxLen) { stack.push(v); dfs(v); stack.pop(); }
      }
    };
    dfs(start);
    if (cycles.length >= limit) break;
  }
  return cycles;
}

export function graphSummary(rows: Row[], s: string, r: string, amount?: string, timestamp?: string) {
  const stats = accountStats(rows, s, r, amount);
  const adj = new Map<string, Set<string>>();
  const edgeW = new Map<string, number>();
  for (const row of rows) {
    if (!adj.has(row[s])) adj.set(row[s], new Set());
    adj.get(row[s])!.add(row[r]);
    const k = row[s] + "\u0001" + row[r];
    edgeW.set(k, (edgeW.get(k) || 0) + (amount ? toNum(row[amount]) || 0 : 1));
  }
  const accounts = Object.entries(stats).map(([account, st]) => ({ account, ...st, degree: st.in_unique + st.out_unique }));
  const top = [...accounts].sort((a, b) => b.degree - a.degree).slice(0, 15);
  const indicators = accounts.map((a) => {
    const f: string[] = [];
    if (a.fan_in) f.push("fan-in"); if (a.fan_out) f.push("fan-out");
    if (a.in_total > 0 && a.out_total > 0 && a.passthrough >= INDICATORS.passthroughRatio && a.passthrough <= 1.1) f.push("pass-through");
    return { account: a.account, flags: f };
  }).filter((x) => x.flags.length);
  const cycles = findCycles(adj);
  let velocity: [string, number][] | null = null;
  if (timestamp) {
    const ts = rows.map((x) => Date.parse(x[timestamp])).filter((t) => !Number.isNaN(t));
    if (ts.length > rows.length / 2) {
      const days = Math.max((Math.max(...ts) - Math.min(...ts)) / 864e5, 1);
      velocity = accounts.map((a) => [a.account, +(a.out_count / days).toFixed(2)] as [string, number])
        .filter(([, v]) => v >= INDICATORS.velocityPerDay).sort((a, b) => b[1] - a[1]).slice(0, 15);
    }
  }
  const topSet = new Set(top.map((t) => t.account));
  const edges = [...edgeW.entries()].map(([k, w]) => { const [a, b] = k.split("\u0001"); return { source: a, target: b, weight: w }; })
    .filter((e) => topSet.has(e.source) && topSet.has(e.target));
  return { nodes: accounts.length, edges: edgeW.size, top, indicators, cycles, velocity, subEdges: edges };
}
