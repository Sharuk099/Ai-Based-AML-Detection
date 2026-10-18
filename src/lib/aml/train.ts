// @ts-nocheck -- strict index checks relaxed for numeric ML code
import { MAX_STACK_ROWS, MAX_TRAIN_ROWS, MIN_CLASS_COUNT, type ModelName, type Row, type TrainConfig } from "./types";
import { assessFeatures, validateTarget } from "./audit";
import { fitPrep, mulberry, shuffle, splitData, transform, type FeatureSet } from "./preprocess";
import { argmax, predictProba, trainGB, trainLogReg, trainRF, trainStacking, type Model } from "./models";
import { evaluate } from "./metrics";
import { permutationImportance, pipelineProba, referenceValues, type LeaderRow, type SavedModel } from "./pipeline";

export type Progress = (e: { event: string; model?: string; detail?: string; info?: Record<string, unknown> }) => void;

export function trainAll(allRows: Row[], columns: string[], cfg: TrainConfig, log: Progress): SavedModel {
  const t0 = performance.now();
  const { target, mapping } = cfg;
  let rows = allRows.filter((r) => r[target] !== undefined && String(r[target]).trim() !== "").map((r) => (mapping[r[target]] ? { ...r, [target]: mapping[r[target]] } : r));
  const v = validateTarget(rows, target, {}, MIN_CLASS_COUNT);
  const warnings = [...v.warnings];
  if (v.rare.length) rows = rows.filter((r) => !v.rare.includes(r[target]));
  if (new Set(rows.map((r) => r[target])).size < 2) throw new Error("Fewer than two classes remain after excluding rare classes.");
  if (rows.length > MAX_TRAIN_ROWS) {
    rows = shuffle([...rows], mulberry(42)).slice(0, MAX_TRAIN_ROWS);
    warnings.push(`Dataset randomly downsampled to ${MAX_TRAIN_ROWS.toLocaleString()} rows for in-browser training. Use the Python version for full-size training.`);
  }
  const assess = assessFeatures(rows, columns, target, cfg.roles);
  const features = cfg.features.filter((f) => columns.includes(f) && f !== target);
  if (!features.length) throw new Error("No eligible feature columns selected.");
  const roles = { ...cfg.roles };
  const graphOk = !!(roles.sender && roles.receiver);
  const sp = splitData(rows, target, cfg.split, features.includes(roles.timestamp || "") ? roles.timestamp : undefined, cfg.split === "group" ? roles.sender : undefined);
  const classes = [...new Set(sp.train.map((r) => r[target]))].sort();
  const enc = (rs: Row[]) => rs.map((r) => classes.indexOf(r[target]));
  const keep = (rs: Row[]) => rs.filter((r) => classes.includes(r[target]));
  const train = sp.train, val = keep(sp.val), test = keep(sp.test);
  if (!val.length || !test.length) throw new Error("Validation or test partition is empty — the dataset is too small for a reliable split.");
  const ytr = enc(train), yva = enc(val), yte = enc(test);
  const K = classes.length;
  const info = { dataset: cfg.datasetName, target, records: rows.length, nFeatures: features.length, nClasses: K, classes, trainSize: train.length, valSize: val.length, testSize: test.length, split: sp.used, graphSupported: graphOk, warnings };
  log({ event: "info", info });

  const mainSet: FeatureSet = graphOk ? "combined" : "tabular";
  const makers: Partial<Record<ModelName, (X: number[][], y: number[], tag: string) => Model>> = {
    "Gradient Boosting": (X, y, tag) => trainGB(X, y, K, { onRound: (r) => r % 10 === 9 && log({ event: "progress", model: tag, detail: `round ${r + 1}/80` }) }),
    "Logistic Regression": (X, y) => trainLogReg(X, y, K),
    "Random Forest": (X, y) => trainRF(X, y, K),
    Stacking: (X, y, tag) => trainStacking(X, y, K, (d) => log({ event: "progress", model: tag, detail: d })),
  };
  const experiments: [ModelName, FeatureSet][] = cfg.models.filter((m) => makers[m]).map((m) => [m, mainSet]);
  if (graphOk && cfg.models.includes("Gradient Boosting")) experiments.push(["Gradient Boosting", "tabular"], ["Gradient Boosting", "graph"]);

  const board: LeaderRow[] = []; const fitted = new Map<string, { prep: ReturnType<typeof fitPrep>; model: Model }>();
  for (const [name, fs] of experiments) {
    const key = `${name} [${fs}]`; log({ event: "model_start", model: key });
    const st = performance.now();
    try {
      let trRows = train, y = ytr;
      if (name === "Stacking" && train.length > MAX_STACK_ROWS) { const idx = shuffle(train.map((_, i) => i), mulberry(9)).slice(0, MAX_STACK_ROWS); trRows = idx.map((i) => train[i]); y = idx.map((i) => ytr[i]); }
      const prep = fitPrep(trRows, features, roles, fs);
      if (!prep.outNames.length) throw new Error("No usable features for this feature set.");
      const model = makers[name]!(transform(prep, trRows), y, key);
      const seconds = (performance.now() - st) / 1000;
      const ti = performance.now(); const P = pipelineProba(prep, model, val); const ms = (performance.now() - ti) / val.length;
      const m = evaluate(yva, P.map(argmax), P, classes);
      board.push({ key, model: name, featureSet: fs, status: "completed", seconds: +seconds.toFixed(2), msPerRow: +ms.toFixed(4), val: m });
      fitted.set(key, { prep, model });
      log({ event: "model_done", model: key, detail: `${seconds.toFixed(1)}s · val ${cfg.metric} ${fmt(m[cfg.metric])}` });
    } catch (e) {
      board.push({ key, model: name, featureSet: fs, status: "failed", error: (e as Error).message, seconds: +((performance.now() - st) / 1000).toFixed(2) });
      log({ event: "model_failed", model: key, detail: (e as Error).message });
    }
  }
  if (cfg.models.includes("CNN"))
    board.push({ key: "CNN", model: "CNN", featureSet: "—", status: "unsupported", reason: "Unsupported: data is tabular (one row per transaction, unordered columns). Reshaping rows into artificial images would not be a valid CNN application, so no result is reported." });
  const ok = board.filter((b) => b.status === "completed");
  if (!ok.length) throw new Error("All model experiments failed: " + board.map((b) => b.error).filter(Boolean).join("; "));
  const score = (b: LeaderRow) => (b.val![cfg.metric] ?? -1) as number;
  const best = ok.reduce((a, b) => (score(b) > score(a) ? b : a));
  best.selected = true;
  const notes: string[] = [];
  const stk = ok.find((b) => b.model === "Stacking");
  if (stk) { const others = ok.filter((b) => b !== stk && b.featureSet === stk.featureSet).map(score); if (others.length && score(stk) <= Math.max(...others)) notes.push("Stacking did not improve over the best individual model on validation data."); }

  log({ event: "testing", model: best.key });
  const { prep, model } = fitted.get(best.key)!;
  const Pt = pipelineProba(prep, model, test);
  const testM = evaluate(yte, Pt.map(argmax), Pt, classes);
  log({ event: "explaining" });
  const valSample = val.slice(0, 1000);
  const importance = permutationImportance(prep, model, valSample, yva.slice(0, 1000), (yp) => evaluate(yva.slice(0, 1000), yp, null, classes).macro_f1);
  const id = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14) + "_" + best.model.toLowerCase().replace(/ /g, "_");
  const saved: SavedModel = {
    id, name: best.key, target, classes, prep, model, reference: referenceValues(train, prep.inputColumns), mapping, roles,
    report: {
      id, selected: best.key, selectionMetric: cfg.metric, dataset: cfg.datasetName, fingerprint: cfg.fingerprint, trainedAt: new Date().toISOString(),
      split: sp.used, trainSize: train.length, valSize: val.length, testSize: test.length, records: rows.length, features, excluded: assess.excluded,
      classes, leaderboard: board, test: testM, importance, notes, warnings, totalSeconds: +((performance.now() - t0) / 1000).toFixed(2), reloadVerified: false, mapping,
    },
  };
  // serialise -> reload -> verify identical predictions before declaring success
  const reloaded: SavedModel = JSON.parse(JSON.stringify(saved));
  const a = predictProba(model, transform(prep, test.slice(0, 50))).map(argmax);
  const b = pipelineProba(reloaded.prep, reloaded.model, test.slice(0, 50)).map(argmax);
  if (a.some((x, i) => x !== b[i])) throw new Error("Reloaded model produced different predictions; artifact rejected.");
  saved.report.reloadVerified = true;
  log({ event: "verified" });
  return saved;
}
const fmt = (v: unknown) => (typeof v === "number" ? v.toFixed(3) : "n/a");
