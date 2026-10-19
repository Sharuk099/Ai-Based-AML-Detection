// @ts-nocheck -- strict index checks relaxed for numeric ML code
import type { Roles, Row } from "./types";
import { isMissing, isNumericColumn, toNum } from "./audit";
import { accountStats, GRAPH_COLS, type AccountStat } from "./graph";

export type FeatureSet = "tabular" | "graph" | "combined";

/** Fitted preprocessing state — learned ONLY from training rows and saved with the model. */
export interface Prep {
  featureSet: FeatureSet;
  inputColumns: string[];
  numeric: { col: string; median: number; mean: number; std: number }[];
  categorical: { col: string; cats: string[] }[];
  time?: { col: string };
  graph?: { sender: string; receiver: string; stats: Record<string, AccountStat> };
  outNames: string[];
  outMean: number[];
  outStd: number[];
}

export function fitPrep(
  rows: Row[],
  features: string[],
  roles: Roles,
  featureSet: FeatureSet,
): Prep {
  const useTab = featureSet !== "graph";
  const tabular = useTab ? features.filter((f) => f !== roles.timestamp) : [];
  const numeric: Prep["numeric"] = [],
    categorical: Prep["categorical"] = [];
  for (const c of tabular) {
    if (isNumericColumn(rows, c)) {
      const v = rows
        .map((r) => toNum(r[c]))
        .filter((x) => !Number.isNaN(x))
        .sort((a, b) => a - b);
      const median = v.length ? v[Math.floor(v.length / 2)] : 0;
      numeric.push({ col: c, median, mean: 0, std: 1 });
    } else {
      const m = new Map<string, number>();
      rows.forEach((r) => {
        const k = isMissing(r[c]) ? "__missing__" : r[c];
        m.set(k, (m.get(k) || 0) + 1);
      });
      const cats = [...m.entries()]
        .filter(([, n]) => n >= 5)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([k]) => k);
      categorical.push({ col: c, cats });
    }
  }
  const prep: Prep = {
    featureSet,
    inputColumns: [],
    numeric,
    categorical,
    outNames: [],
    outMean: [],
    outStd: [],
  };
  if (useTab && roles.timestamp && features.includes(roles.timestamp))
    prep.time = { col: roles.timestamp };
  if (featureSet !== "tabular" && roles.sender && roles.receiver)
    prep.graph = {
      sender: roles.sender,
      receiver: roles.receiver,
      stats: accountStats(rows, roles.sender, roles.receiver, roles.amount),
    };
  prep.inputColumns = [
    ...new Set([
      ...tabular,
      ...(prep.time ? [prep.time.col] : []),
      ...(prep.graph
        ? [prep.graph.sender, prep.graph.receiver, ...(roles.amount ? [roles.amount] : [])]
        : []),
    ]),
  ];
  prep.outNames = [
    ...numeric.map((n) => n.col),
    ...categorical.flatMap((c) => [...c.cats.map((k) => `${c.col}=${k}`), `${c.col}=other`]),
    ...(prep.time ? ["ts_hour", "ts_weekday"] : []),
    ...(prep.graph
      ? ["sender", "receiver"].flatMap((s) => GRAPH_COLS.map((g) => `${s}_${g}`))
      : []),
  ];
  // fit scaling on training rows
  const raw = rows.map((r) => rawVector(prep, r));
  const d = prep.outNames.length;
  prep.outMean = new Array(d).fill(0);
  prep.outStd = new Array(d).fill(0);
  raw.forEach((v) => v.forEach((x, j) => (prep.outMean[j] += x / raw.length)));
  raw.forEach((v) =>
    v.forEach((x, j) => (prep.outStd[j] += (x - prep.outMean[j]) ** 2 / raw.length)),
  );
  prep.outStd = prep.outStd.map((s) => Math.sqrt(s) || 1);
  return prep;
}

export function rawVector(p: Prep, r: Row, dynamicStats?: Record<string, AccountStat>): number[] {
  const v: number[] = [];
  for (const n of p.numeric) {
    const x = toNum(r[n.col]);
    v.push(Number.isNaN(x) ? n.median : x);
  }
  for (const c of p.categorical) {
    const k = isMissing(r[c.col]) ? "__missing__" : r[c.col];
    const idx = c.cats.indexOf(k);
    c.cats.forEach((_, i) => v.push(i === idx ? 1 : 0));
    v.push(idx === -1 ? 1 : 0);
  }
  if (p.time) {
    const t = new Date(r[p.time.col]);
    const ok = !Number.isNaN(t.getTime());
    v.push(ok ? t.getUTCHours() : -1, ok ? t.getUTCDay() : -1);
  }
  if (p.graph) {
    const statsMap = dynamicStats || p.graph.stats;
    for (const side of [p.graph.sender, p.graph.receiver]) {
      const st = statsMap ? statsMap[r[side]] : undefined;
      for (const g of GRAPH_COLS) v.push(st ? st[g] : 0); // unknown accounts -> 0
    }
  }
  return v;
}

export function transform(p: Prep, rows: Row[], dynamicStats?: Record<string, AccountStat>): number[][] {
  const stats = dynamicStats ?? p.graph?.stats;
  return rows.map((r) => rawVector(p, r, stats).map((x, j) => (x - p.outMean[j]) / p.outStd[j]));
}

export function splitData(
  rows: Row[],
  target: string,
  strategy: string,
  timestamp?: string,
  group?: string,
  seed = 42,
) {
  const rnd = mulberry(seed);
  const n = rows.length;
  if (strategy === "chronological" && timestamp) {
    const s = [...rows].sort((a, b) => Date.parse(a[timestamp]) - Date.parse(b[timestamp]));
    const a = Math.floor(n * 0.7),
      b = Math.floor(n * 0.85);
    return { train: s.slice(0, a), val: s.slice(a, b), test: s.slice(b), used: "chronological" };
  }
  if (strategy === "group" && group) {
    const groups = [...new Set(rows.map((r) => r[group]))];
    shuffle(groups, rnd);
    const ga = new Set(groups.slice(0, Math.floor(groups.length * 0.7))),
      gb = new Set(groups.slice(Math.floor(groups.length * 0.7), Math.floor(groups.length * 0.85)));
    return {
      train: rows.filter((r) => ga.has(r[group])),
      val: rows.filter((r) => gb.has(r[group])),
      test: rows.filter((r) => !ga.has(r[group]) && !gb.has(r[group])),
      used: "group (by sender account)",
    };
  }
  const by = new Map<string, Row[]>();
  rows.forEach((r) => {
    const k = r[target];
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(r);
  });
  const train: Row[] = [],
    val: Row[] = [],
    test: Row[] = [];
  for (const g of by.values()) {
    shuffle(g, rnd);
    const t = Math.max(1, Math.round(g.length * 0.15)),
      v = Math.max(1, Math.round(g.length * 0.15));
    test.push(...g.slice(0, t));
    val.push(...g.slice(t, t + v));
    train.push(...g.slice(t + v));
  }
  return { train, val, test, used: "stratified" };
}

export function mulberry(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(a: T[], rnd: () => number) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
