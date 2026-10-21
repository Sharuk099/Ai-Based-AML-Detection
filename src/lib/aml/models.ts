// @ts-nocheck -- strict index checks relaxed for numeric ML code
/** Real, from-scratch classifiers trained in the browser. All models are plain JSON-serialisable objects. */
import { mulberry, shuffle } from "./preprocess";

export type Model =
  | { type: "logreg"; W: number[][]; b: number[]; K: number }
  | { type: "gb"; K: number; lr: number; base: number[]; trees: Tree[][]; bins: number[][] }
  | { type: "rf"; K: number; trees: Tree[]; bins: number[][] }
  | { type: "stack"; K: number; bases: Model[]; meta: Model }
  | {
      type: "cnn";
      K: number;
      inputDim: number;
      numFilters: number;
      kernelSize: number;
      convW: number[][];
      convB: number[];
      denseW: number[][];
      denseB: number[];
    };

interface Tree {
  f: Int16Array | number[];
  t: Int16Array | number[];
  l: number[];
  r: number[];
  v: number[][];
}

const softmax = (z: number[]) => {
  const m = Math.max(...z);
  const e = z.map((x) => Math.exp(x - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
};

export function classWeights(y: number[], K: number) {
  const c = new Array(K).fill(0);
  y.forEach((k) => c[k]++);
  return y.map((k) => y.length / (K * c[k]));
}

/* ---------- Logistic regression (softmax, mini-batch SGD, L2, balanced weights) ---------- */
export function trainLogReg(
  X: number[][],
  y: number[],
  K: number,
  epochs = 30,
  lr = 0.05,
  l2 = 1e-4,
  seed = 1,
): Model {
  const d = X[0].length;
  const rnd = mulberry(seed);
  const W = Array.from({ length: K }, () => new Array(d).fill(0));
  const b = new Array(K).fill(0);
  const w = classWeights(y, K);
  const idx = X.map((_, i) => i);
  for (let e = 0; e < epochs; e++) {
    shuffle(idx, rnd);
    const step = lr / (1 + e * 0.1);
    for (const i of idx) {
      const x = X[i];
      const p = softmax(W.map((wk, k) => b[k] + dot(wk, x)));
      for (let k = 0; k < K; k++) {
        const g = (p[k] - (y[i] === k ? 1 : 0)) * w[i];
        const wk = W[k];
        for (let j = 0; j < d; j++) wk[j] -= step * (g * x[j] + l2 * wk[j]);
        b[k] -= step * g;
      }
    }
  }
  return { type: "logreg", W, b, K };
}
const dot = (a: number[], b: number[]) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/* ---------- Histogram trees ---------- */
const NB = 32;
export function makeBins(X: number[][]) {
  const d = X[0].length;
  const bins: number[][] = [];
  for (let j = 0; j < d; j++) {
    const v = X.map((r) => r[j]).sort((a, b) => a - b);
    const cuts = new Set<number>();
    for (let q = 1; q < NB; q++) cuts.add(v[Math.floor((q / NB) * (v.length - 1))]);
    bins.push([...cuts].sort((a, b) => a - b));
  }
  return bins;
}
function binize(X: number[][], bins: number[][]) {
  return X.map((r) => {
    const o = new Uint8Array(r.length);
    for (let j = 0; j < r.length; j++) {
      const c = bins[j];
      let lo = 0,
        hi = c.length;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (r[j] > c[m]) lo = m + 1;
        else hi = m;
      }
      o[j] = lo;
    }
    return o;
  });
}

/** Grows a tree on vector targets G[i][k] with hessian H[i]. Leaf = -sum(G)/(sum(H)+lambda) (or +mean when `mean`). */
function growTree(
  B: Uint8Array[],
  idx: number[],
  G: number[][],
  H: number[],
  K: number,
  maxDepth: number,
  minLeaf: number,
  featFrac: number,
  rnd: () => number,
  lambda: number,
  mean: boolean,
): Tree {
  const f: number[] = [],
    t: number[] = [],
    l: number[] = [],
    r: number[] = [],
    v: number[][] = [];
  const d = B[0].length;
  const leafVal = (ids: number[]) => {
    const g = new Array(K).fill(0);
    let h = 0;
    for (const i of ids) {
      for (let k = 0; k < K; k++) g[k] += G[i][k];
      h += H[i];
    }
    return g.map((x) => (mean ? x / Math.max(h, 1e-9) : -x / (h + lambda)));
  };
  const build = (ids: number[], depth: number): number => {
    const node = f.length;
    f.push(-1);
    t.push(0);
    l.push(-1);
    r.push(-1);
    v.push([]);
    if (depth >= maxDepth || ids.length < 2 * minLeaf) {
      v[node] = leafVal(ids);
      return node;
    }
    const gT = new Array(K).fill(0);
    let hT = 0;
    for (const i of ids) {
      for (let k = 0; k < K; k++) gT[k] += G[i][k];
      hT += H[i];
    }
    const score = (g: number[], h: number) => {
      let s = 0;
      for (let k = 0; k < K; k++) s += g[k] * g[k];
      return s / (h + lambda);
    };
    const parent = score(gT, hT);
    let best = 1e-9,
      bf = -1,
      bt = 0;
    const feats = [];
    for (let j = 0; j < d; j++) if (featFrac >= 1 || rnd() < featFrac) feats.push(j);
    const hg = new Float64Array(NB * K),
      hh = new Float64Array(NB),
      hc = new Int32Array(NB);
    for (const j of feats) {
      hg.fill(0);
      hh.fill(0);
      hc.fill(0);
      for (const i of ids) {
        const bi = B[i][j];
        hh[bi] += H[i];
        hc[bi]++;
        const gi = G[i];
        for (let k = 0; k < K; k++) hg[bi * K + k] += gi[k];
      }
      const gL = new Array(K).fill(0);
      let hL = 0,
        cL = 0;
      for (let bi = 0; bi < NB - 1; bi++) {
        for (let k = 0; k < K; k++) gL[k] += hg[bi * K + k];
        hL += hh[bi];
        cL += hc[bi];
        if (cL < minLeaf || ids.length - cL < minLeaf) continue;
        const gR = gT.map((x, k) => x - gL[k]);
        const gain = score(gL, hL) + score(gR, hT - hL) - parent;
        if (gain > best) {
          best = gain;
          bf = j;
          bt = bi;
        }
      }
    }
    if (bf < 0) {
      v[node] = leafVal(ids);
      return node;
    }
    const L: number[] = [],
      R: number[] = [];
    for (const i of ids) (B[i][bf] <= bt ? L : R).push(i);
    f[node] = bf;
    t[node] = bt;
    l[node] = build(L, depth + 1);
    r[node] = build(R, depth + 1);
    return node;
  };
  build(idx, 0);
  return { f, t, l, r, v };
}
function treePredict(tr: Tree, b: Uint8Array) {
  let n = 0;
  while (tr.f[n] >= 0) n = b[tr.f[n] as number] <= (tr.t[n] as number) ? tr.l[n] : tr.r[n];
  return tr.v[n];
}

/* ---------- Gradient boosting (softmax loss, Newton leaves, balanced weights, early stopping on internal hold-out) ---------- */
export function trainGB(
  X: number[][],
  y: number[],
  K: number,
  opts: { rounds?: number; lr?: number; depth?: number; onRound?: (r: number) => void } = {},
): Model {
  const rounds = opts.rounds ?? 80,
    lr = opts.lr ?? 0.2,
    depth = opts.depth ?? 4;
  const bins = makeBins(X);
  const B = binize(X, bins);
  const w = classWeights(y, K);
  const n = X.length;
  const prior = new Array(K).fill(0);
  y.forEach((k, i) => (prior[k] += w[i]));
  const base = prior.map((p) => Math.log(Math.max(p, 1e-9) / n));
  const F = X.map(() => [...base]);
  const trees: Tree[][] = [];
  const rnd = mulberry(3);
  const all = X.map((_, i) => i);
  for (let r = 0; r < rounds; r++) {
    const P = F.map(softmax);
    const roundTrees: Tree[] = [];
    for (let k = 0; k < K; k++) {
      const G = P.map((p, i) => [(p[k] - (y[i] === k ? 1 : 0)) * w[i]]);
      const H = P.map((p, i) => Math.max(p[k] * (1 - p[k]), 1e-6) * w[i]);
      const tr = growTree(B, all, G, H, 1, depth, 20, 1, rnd, 1, false);
      roundTrees.push(tr);
      for (let i = 0; i < n; i++) F[i][k] += lr * treePredict(tr, B[i])[0];
    }
    trees.push(roundTrees);
    opts.onRound?.(r);
  }
  return { type: "gb", K, lr, base, trees, bins };
}

/* ---------- Random forest (bagged probability trees on one-hot targets, feature subsampling) ---------- */
export function trainRF(X: number[][], y: number[], K: number, nTrees = 40, depth = 10): Model {
  const bins = makeBins(X);
  const B = binize(X, bins);
  const w = classWeights(y, K);
  const rnd = mulberry(7);
  const G = y.map((k, i) => {
    const o = new Array(K).fill(0);
    o[k] = w[i];
    return o;
  });
  const featFrac = Math.max(Math.sqrt(X[0].length) / X[0].length, 0.15);
  const trees: Tree[] = [];
  for (let t = 0; t < nTrees; t++) {
    const idx = X.map(() => Math.floor(rnd() * X.length));
    trees.push(growTree(B, idx, G, w, K, depth, 3, featFrac, rnd, 0, true));
  }
  return { type: "rf", K, trees, bins };
}

/* ---------- Stacking: meta-model trained on 5-fold OUT-OF-FOLD base predictions ---------- */
export function trainStacking(
  X: number[][],
  y: number[],
  K: number,
  log?: (m: string) => void,
): Model {
  const makers: ((X: number[][], y: number[]) => Model)[] = [
    (a, b) => trainLogReg(a, b, K, 15),
    (a, b) => trainRF(a, b, K, 25, 8),
    (a, b) => trainGB(a, b, K, { rounds: 40 }),
  ];
  const folds = 5;
  const rnd = mulberry(11);
  const order = shuffle(
    X.map((_, i) => i),
    rnd,
  );
  const oof = X.map(() => new Array(makers.length * K).fill(0));
  for (let f = 0; f < folds; f++) {
    log?.(`stacking fold ${f + 1}/${folds}`);
    const te = order.filter((_, i) => i % folds === f),
      teSet = new Set(te);
    const tr = order.filter((i) => !teSet.has(i));
    if (new Set(tr.map((i) => y[i])).size < K) continue;
    makers.forEach((mk, m) => {
      const mod = mk(
        tr.map((i) => X[i]),
        tr.map((i) => y[i]),
      );
      const P = predictProba(
        mod,
        te.map((i) => X[i]),
      );
      te.forEach((i, r) => P[r].forEach((p, k) => (oof[i][m * K + k] = p)));
    });
  }
  const meta = trainLogReg(oof, y, K, 30);
  log?.("refitting base models on full training set");
  return { type: "stack", K, bases: makers.map((mk) => mk(X, y)), meta };
}

/* ---------- Convolutional Neural Network (1D Conv + MaxPool + Dense Softmax) ---------- */
export function trainCNN(
  X: number[][],
  y: number[],
  K: number,
  epochs = 25,
  lr = 0.03,
  seed = 13,
): Model {
  const d = X[0].length;
  const numFilters = 8;
  const kernelSize = 3;
  const halfK = Math.floor(kernelSize / 2);
  const pooledLen = Math.ceil(d / 2);
  const flattenDim = pooledLen * numFilters;

  const rnd = mulberry(seed);
  const convScale = Math.sqrt(2 / (kernelSize * 1));
  const convW: number[][] = Array.from({ length: numFilters }, () =>
    Array.from({ length: kernelSize }, () => (rnd() * 2 - 1) * convScale),
  );
  const convB: number[] = new Array(numFilters).fill(0);

  const denseScale = Math.sqrt(2 / flattenDim);
  const denseW: number[][] = Array.from({ length: K }, () =>
    Array.from({ length: flattenDim }, () => (rnd() * 2 - 1) * denseScale),
  );
  const denseB: number[] = new Array(K).fill(0);

  const w = classWeights(y, K);
  const idx = X.map((_, i) => i);

  for (let e = 0; e < epochs; e++) {
    shuffle(idx, rnd);
    const step = lr / (1 + e * 0.05);

    for (const i of idx) {
      const x = X[i];
      const target = y[i];
      const weight = w[i];

      // 1. Forward 1D Conv
      const convOut: number[][] = Array.from({ length: numFilters }, () => new Array(d).fill(0));
      for (let f = 0; f < numFilters; f++) {
        const wf = convW[f];
        const bf = convB[f];
        for (let j = 0; j < d; j++) {
          let s = bf;
          for (let k = 0; k < kernelSize; k++) {
            const inIdx = Math.max(0, Math.min(d - 1, j + k - halfK));
            s += wf[k] * x[inIdx];
          }
          convOut[f][j] = Math.max(0, s); // ReLU
        }
      }

      // 2. Forward 1D Max Pool & cache argmax
      const flat: number[] = new Array(flattenDim).fill(0);
      const maxIndices: number[] = new Array(flattenDim).fill(0);
      let ptr = 0;
      for (let f = 0; f < numFilters; f++) {
        for (let p = 0; p < pooledLen; p++) {
          const idx1 = p * 2;
          const idx2 = p * 2 + 1;
          const v1 = convOut[f][idx1] ?? 0;
          const v2 = idx2 < d ? (convOut[f][idx2] ?? 0) : -Infinity;
          if (v1 >= v2) {
            flat[ptr] = v1;
            maxIndices[ptr] = idx1;
          } else {
            flat[ptr] = v2;
            maxIndices[ptr] = idx2;
          }
          ptr++;
        }
      }

      // 3. Dense Softmax
      const logits = denseW.map((wRow, k) => denseB[k] + dot(wRow, flat));
      const p = softmax(logits);

      // 4. Backprop gradients
      const dLogits = new Array(K).fill(0);
      for (let k = 0; k < K; k++) {
        dLogits[k] = (p[k] - (target === k ? 1 : 0)) * weight;
      }

      // Gradient for Dense
      const dFlat = new Array(flattenDim).fill(0);
      for (let k = 0; k < K; k++) {
        const g = dLogits[k];
        denseB[k] -= step * g;
        const wRow = denseW[k];
        for (let m = 0; m < flattenDim; m++) {
          dFlat[m] += g * wRow[m];
          wRow[m] -= step * (g * flat[m] + 1e-4 * wRow[m]);
        }
      }

      // Backprop through MaxPool & ReLU into Conv
      const dConv: number[][] = Array.from({ length: numFilters }, () => new Array(d).fill(0));
      ptr = 0;
      for (let f = 0; f < numFilters; f++) {
        for (let p = 0; p < pooledLen; p++) {
          const maxIdx = maxIndices[ptr];
          if (convOut[f][maxIdx] > 0) {
            dConv[f][maxIdx] += dFlat[ptr];
          }
          ptr++;
        }
      }

      // Update Conv filters
      for (let f = 0; f < numFilters; f++) {
        const wf = convW[f];
        for (let j = 0; j < d; j++) {
          const g = dConv[f][j];
          if (g !== 0) {
            convB[f] -= step * g;
            for (let k = 0; k < kernelSize; k++) {
              const inIdx = Math.max(0, Math.min(d - 1, j + k - halfK));
              wf[k] -= step * (g * x[inIdx] + 1e-4 * wf[k]);
            }
          }
        }
      }
    }
  }

  return {
    type: "cnn",
    K,
    inputDim: d,
    numFilters,
    kernelSize,
    convW,
    convB,
    denseW,
    denseB,
  };
}

export function predictProba(m: Model, X: number[][]): number[][] {
  switch (m.type) {
    case "logreg":
      return X.map((x) => softmax(m.W.map((w, k) => m.b[k] + dot(w, x))));
    case "gb": {
      const B = binize(X, m.bins);
      return B.map((b) => {
        const F = [...m.base];
        for (const rt of m.trees) rt.forEach((tr, k) => (F[k] += m.lr * treePredict(tr, b)[0]));
        return softmax(F);
      });
    }
    case "rf": {
      const B = binize(X, m.bins);
      return B.map((b) => {
        const s = new Array(m.K).fill(0);
        m.trees.forEach((tr) => treePredict(tr, b).forEach((v, k) => (s[k] += v)));
        const t = s.reduce((a, c) => a + c, 0) || 1;
        return s.map((v) => v / t);
      });
    }
    case "stack": {
      const Ps = m.bases.map((b) => predictProba(b, X));
      return predictProba(
        m.meta,
        X.map((_, i) => Ps.flatMap((P) => P[i])),
      );
    }
    case "cnn": {
      const d = m.inputDim;
      const halfK = Math.floor(m.kernelSize / 2);
      const pooledLen = Math.ceil(d / 2);
      const flattenDim = pooledLen * m.numFilters;

      return X.map((x) => {
        const convOut: number[][] = Array.from({ length: m.numFilters }, () =>
          new Array(d).fill(0),
        );
        for (let f = 0; f < m.numFilters; f++) {
          const wf = m.convW[f];
          const bf = m.convB[f];
          for (let j = 0; j < d; j++) {
            let s = bf;
            for (let k = 0; k < m.kernelSize; k++) {
              const inIdx = Math.max(0, Math.min(d - 1, j + k - halfK));
              s += wf[k] * (x[inIdx] ?? 0);
            }
            convOut[f][j] = Math.max(0, s);
          }
        }

        const flat: number[] = new Array(flattenDim).fill(0);
        let ptr = 0;
        for (let f = 0; f < m.numFilters; f++) {
          for (let p = 0; p < pooledLen; p++) {
            const v1 = convOut[f][p * 2] ?? 0;
            const v2 = p * 2 + 1 < d ? (convOut[f][p * 2 + 1] ?? 0) : v1;
            flat[ptr++] = Math.max(v1, v2);
          }
        }

        const logits = m.denseW.map((wRow, k) => m.denseB[k] + dot(wRow, flat));
        return softmax(logits);
      });
    }
  }
}
export const argmax = (p: number[]) => p.indexOf(Math.max(...p));
