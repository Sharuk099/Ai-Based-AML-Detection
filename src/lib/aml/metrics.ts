// @ts-nocheck -- strict index checks relaxed for numeric ML code
export interface Metrics {
  n: number;
  accuracy: number;
  balanced_accuracy: number | null;
  precision_macro: number;
  recall_macro: number;
  macro_f1: number;
  weighted_f1: number;
  roc_auc: number | null;
  pr_auc: number | null;
  brier: number | null;
  labels: string[];
  confusion: number[][];
  perClass: Record<
    string,
    { precision: number; recall: number; f1: number; fpr: number | null; support: number }
  >;
  warnings: string[];
}

function auc(scores: number[], pos: boolean[]) {
  const P = pos.filter(Boolean).length,
    N = pos.length - P;
  if (!P || !N) return null;
  const idx = scores.map((s, i) => [s, i] as const).sort((a, b) => a[0] - b[0]);
  let rankSum = 0,
    i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (pos[idx[k][1]]) rankSum += r;
    i = j + 1;
  }
  return (rankSum - (P * (P + 1)) / 2) / (P * N);
}
function avgPrecision(scores: number[], pos: boolean[]) {
  const P = pos.filter(Boolean).length;
  if (!P) return null;
  const o = scores.map((s, i) => [s, pos[i]] as const).sort((a, b) => b[0] - a[0]);
  let tp = 0,
    ap = 0;
  o.forEach(([, p], i) => {
    if (p) {
      tp++;
      ap += tp / (i + 1);
    }
  });
  return ap / P;
}

export function evaluate(
  yTrue: number[],
  yPred: number[],
  proba: number[][] | null,
  labels: string[],
): Metrics {
  const K = labels.length,
    n = yTrue.length;
  const cm = Array.from({ length: K }, () => new Array(K).fill(0));
  yTrue.forEach((t, i) => cm[t][yPred[i]]++);
  const perClass: Metrics["perClass"] = {};
  let pS = 0,
    rS = 0,
    fS = 0,
    wf = 0,
    presentR = 0,
    presentN = 0;
  labels.forEach((c, k) => {
    const tp = cm[k][k],
      fp = cm.reduce((s, r, i) => s + (i !== k ? r[k] : 0), 0),
      fn = cm[k].reduce((s, v, j) => s + (j !== k ? v : 0), 0);
    const support = tp + fn,
      tn = n - tp - fp - fn;
    const precision = tp + fp ? tp / (tp + fp) : 0,
      recall = support ? tp / support : 0,
      f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    perClass[c] = { precision, recall, f1, fpr: fp + tn ? fp / (fp + tn) : null, support };
    pS += precision;
    rS += recall;
    fS += f1;
    wf += f1 * support;
    if (support) {
      presentR += recall;
      presentN++;
    }
  });
  const m: Metrics = {
    n,
    accuracy: yTrue.filter((t, i) => t === yPred[i]).length / Math.max(n, 1),
    balanced_accuracy: presentN > 1 ? presentR / presentN : null,
    precision_macro: pS / K,
    recall_macro: rS / K,
    macro_f1: fS / K,
    weighted_f1: wf / Math.max(n, 1),
    roc_auc: null,
    pr_auc: null,
    brier: null,
    labels,
    confusion: cm,
    perClass,
    warnings: [],
  };
  if (proba && presentN > 1) {
    if (K === 2) {
      const s = proba.map((p) => p[1]),
        pos = yTrue.map((t) => t === 1);
      m.roc_auc = auc(s, pos);
      m.pr_auc = avgPrecision(s, pos);
      m.brier = s.reduce((a, p, i) => a + (p - (pos[i] ? 1 : 0)) ** 2, 0) / n;
    } else {
      const aucs = labels.map((_, k) =>
        auc(
          proba.map((p) => p[k]),
          yTrue.map((t) => t === k),
        ),
      );
      const aps = labels.map((_, k) =>
        avgPrecision(
          proba.map((p) => p[k]),
          yTrue.map((t) => t === k),
        ),
      );
      if (aucs.every((a) => a !== null)) m.roc_auc = aucs.reduce((a, b) => a! + b!, 0)! / K;
      const v = aps.filter((a) => a !== null) as number[];
      m.pr_auc = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    }
  }
  if (new Set(yPred).size === 1)
    m.warnings.push(
      `The model predicts only one class ("${labels[yPred[0]]}") — it has not learned to separate the classes.`,
    );
  const low = labels.filter((c) => perClass[c].support > 0 && perClass[c].recall < 0.5);
  if (m.accuracy > 0.9 && low.length)
    m.warnings.push(
      `High accuracy but recall below 0.5 for: ${low.join(", ")}. Accuracy is misleading with imbalanced classes — check macro-F1 and per-class recall.`,
    );
  if (presentN < 2)
    m.warnings.push("This partition contains a single class; several metrics are undefined.");
  return m;
}
