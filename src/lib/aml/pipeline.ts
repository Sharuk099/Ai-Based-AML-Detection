// @ts-nocheck -- strict index checks relaxed for numeric ML code
import type { Row } from "./types";
import { transform, type Prep } from "./preprocess";
import { predictProba, type Model } from "./models";
import { isMissing, isNumericColumn, toNum } from "./audit";

export interface SavedModel {
  id: string;
  name: string;
  target: string;
  classes: string[];
  prep: Prep;
  model: Model;
  reference: Record<string, string>;
  mapping: Record<string, string>;
  roles: Record<string, string | undefined>;
  report: TrainReport;
}
export interface TrainReport {
  id: string;
  selected: string;
  selectionMetric: string;
  dataset: string;
  fingerprint: string;
  trainedAt: string;
  split: string;
  trainSize: number;
  valSize: number;
  testSize: number;
  records: number;
  features: string[];
  excluded: Record<string, string>;
  classes: string[];
  leaderboard: LeaderRow[];
  test: import("./metrics").Metrics;
  importance: { feature: string; importance: number }[];
  notes: string[];
  warnings: string[];
  totalSeconds: number;
  reloadVerified: boolean;
  mapping: Record<string, string>;
}
export interface LeaderRow {
  key: string;
  model: string;
  featureSet: string;
  status: "completed" | "failed" | "unsupported";
  seconds?: number;
  msPerRow?: number;
  val?: import("./metrics").Metrics;
  error?: string;
  reason?: string;
  selected?: boolean;
}

export const pipelineProba = (prep: Prep, model: Model, rows: Row[]) =>
  predictProba(model, transform(prep, rows));

export function referenceValues(rows: Row[], cols: string[]) {
  const ref: Record<string, string> = {};
  for (const c of cols) {
    if (isNumericColumn(rows, c)) {
      const v = rows
        .map((r) => toNum(r[c]))
        .filter((x) => !Number.isNaN(x))
        .sort((a, b) => a - b);
      ref[c] = String(v[Math.floor(v.length / 2)] ?? 0);
    } else {
      const m = new Map<string, number>();
      rows.forEach((r) => !isMissing(r[c]) && m.set(r[c], (m.get(r[c]) || 0) + 1));
      ref[c] = [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    }
  }
  return ref;
}

/** Permutation importance on raw input columns (validation data, macro-F1 drop). */
export function permutationImportance(
  prep: Prep,
  model: Model,
  rows: Row[],
  y: number[],
  score: (yp: number[]) => number,
  seed = 5,
) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pred = (rs: Row[]) => pipelineProba(prep, model, rs).map((p) => p.indexOf(Math.max(...p)));
  const base = score(pred(rows));
  return prep.inputColumns
    .map((c) => {
      const vals = rows.map((r) => r[c]);
      for (let i = vals.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [vals[i], vals[j]] = [vals[j], vals[i]];
      }
      const perm = rows.map((r, i) => ({ ...r, [c]: vals[i] }));
      return { feature: c, importance: base - score(pred(perm)) };
    })
    .sort((a, b) => b.importance - a.importance);
}

/** Local explanation: change in predicted-class probability when one input column is set to its training reference. */
export function localExplain(m: SavedModel, rows: Row[], topK = 3) {
  const base = pipelineProba(m.prep, m.model, rows);
  const pi = base.map((p) => p.indexOf(Math.max(...p)));
  const contrib = rows.map(() => [] as { feature: string; value: string; contribution: number }[]);
  for (const c of m.prep.inputColumns) {
    const P = pipelineProba(
      m.prep,
      m.model,
      rows.map((r) => ({ ...r, [c]: m.reference[c] })),
    );
    rows.forEach((r, i) =>
      contrib[i].push({ feature: c, value: r[c], contribution: base[i][pi[i]] - P[i][pi[i]] }),
    );
  }
  return contrib.map((cs) =>
    cs.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, topK),
  );
}
