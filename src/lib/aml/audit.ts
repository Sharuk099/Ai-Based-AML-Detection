import { INTENDED_CATEGORIES, type Roles, type Row } from "./types";

const PATTERNS: Record<keyof Roles, RegExp[]> = {
  transaction_id: [/^(tx|txn|transaction)[_ ]?id$/i, /^id$/i, /txid/i, /hash/i],
  sender: [/from[_ ]?(account|acct|addr|address)?$/i, /sender/i, /orig/i, /source/i, /^from/i, /^account$/i],
  receiver: [/to[_ ]?(account|acct|addr|address)?$/i, /receiver/i, /beneficiary/i, /dest/i, /^to/i, /^account\.1$/i],
  amount: [/amount/i, /value/i, /^amt/i, /paid/i],
  timestamp: [/time/i, /date/i, /^ts$/i, /^step$/i],
  label: [/label/i, /^class$/i, /category/i, /is_?\s?laundering/i, /fraud/i, /target/i, /is_sar/i],
};

export const isMissing = (v: unknown) => v === undefined || v === null || String(v).trim() === "";
export const toNum = (v: string) => (isMissing(v) ? NaN : Number(String(v).replace(/,/g, "")));

export function detectRoles(columns: string[]): Roles {
  const roles: Roles = {};
  const used = new Set<string>();
  (Object.keys(PATTERNS) as (keyof Roles)[]).forEach((role) => {
    const c = columns.find((col) => !used.has(col) && PATTERNS[role].some((p) => p.test(col.trim())));
    if (c) { roles[role] = c; used.add(c); }
  });
  return roles;
}

export function isNumericColumn(rows: Row[], col: string) {
  let n = 0, ok = 0;
  for (let i = 0; i < rows.length && n < 2000; i++) {
    const v = rows[i][col];
    if (isMissing(v)) continue;
    n++; if (!Number.isNaN(toNum(v))) ok++;
  }
  return n > 0 && ok / n > 0.95;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function compareLabels(values: string[], mapping: Record<string, string> = {}) {
  const intended = new Map(INTENDED_CATEGORIES.map((c) => [norm(c), c]));
  const matched: Record<string, string> = {};
  const unmatched: string[] = [];
  values.forEach((v) => {
    const t = mapping[v] || intended.get(norm(v));
    if (t && INTENDED_CATEGORIES.includes(t)) matched[v] = t; else unmatched.push(v);
  });
  const covered = [...new Set(Object.values(matched))].sort();
  const missing = INTENDED_CATEGORIES.filter((c) => !covered.includes(c));
  return {
    matched, unmatched, covered, missing, supports12: missing.length === 0,
    message: missing.length === 0 ? "All 12 intended categories are present."
      : `This dataset supports ${covered.length} of the 12 intended categories. Missing: ${missing.join(", ")}. These cannot be trained from this data — train on the labels it genuinely contains.`,
  };
}

export interface ColumnInfo { name: string; kind: "numeric" | "categorical"; missing: number; missingPct: number; unique: number; sample: string[] }
export interface Audit {
  name: string; rows: number; columns: number; duplicates: number; totalMissing: number; columnInfo: ColumnInfo[];
  roles: Roles; graphSupported: boolean; label?: { column: string; distribution: [string, number][]; comparison: ReturnType<typeof compareLabels> };
}

export function valueCounts(rows: Row[], col: string, mapping: Record<string, string> = {}) {
  const m = new Map<string, number>();
  rows.forEach((r) => { const v = r[col]; if (isMissing(v)) return; const k = mapping[v] || v; m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function audit(rows: Row[], columns: string[], name: string): Audit {
  const roles = detectRoles(columns);
  const seen = new Set<string>(); let dup = 0;
  rows.forEach((r) => { const k = columns.map((c) => r[c]).join("\u0001"); if (seen.has(k)) dup++; else seen.add(k); });
  let total = 0;
  const columnInfo: ColumnInfo[] = columns.map((c) => {
    let missing = 0; const u = new Set<string>(); const sample: string[] = [];
    rows.forEach((r) => { const v = r[c]; if (isMissing(v)) missing++; else { u.add(v); if (sample.length < 3) sample.push(v); } });
    total += missing;
    return { name: c, kind: isNumericColumn(rows, c) ? "numeric" : "categorical", missing, missingPct: +(100 * missing / Math.max(rows.length, 1)).toFixed(2), unique: u.size, sample };
  });
  const a: Audit = { name, rows: rows.length, columns: columns.length, duplicates: dup, totalMissing: total, columnInfo, roles, graphSupported: !!(roles.sender && roles.receiver) };
  if (roles.label) {
    const d = valueCounts(rows, roles.label);
    a.label = { column: roles.label, distribution: d, comparison: compareLabels(d.map((x) => x[0])) };
  }
  return a;
}

export function validateTarget(rows: Row[], target: string, mapping: Record<string, string>, minCount: number) {
  const d = valueCounts(rows, target, mapping);
  if (!d.length) throw new Error(`Target "${target}" has no labels. Supervised training is impossible; use the Graph tab for unsupervised indicators.`);
  if (d.length < 2) throw new Error(`Target "${target}" has only one class (${d[0][0]}); a classifier cannot be trained.`);
  if (d.length > Math.max(50, rows.length * 0.5)) throw new Error(`Target "${target}" has ${d.length} distinct values — this looks like an identifier, not a label.`);
  const rare = d.filter(([, n]) => n < minCount).map(([k]) => k);
  return { distribution: d, rare, warnings: rare.map((k) => `Class "${k}" has fewer than ${minCount} rows and is excluded.`) };
}

const LEAK = /(label|class|category|launder|fraud|target|is_?sar|alert)/i;
const ID = /(^id$|_id$|^id_|hash|txid|uuid)/i;

export function assessFeatures(rows: Row[], columns: string[], target: string, roles: Roles) {
  const eligible: string[] = []; const excluded: Record<string, string> = {};
  const n = rows.length;
  for (const c of columns) {
    if (c === target) continue;
    const u = new Set<string>(); let miss = 0;
    rows.forEach((r) => (isMissing(r[c]) ? miss++ : u.add(r[c])));
    const numeric = isNumericColumn(rows, c);
    if (c === roles.sender || c === roles.receiver) excluded[c] = "account identifier (used only via graph features)";
    else if (c === roles.transaction_id || ID.test(c)) excluded[c] = "identifier — kept for investigation, never a feature";
    else if (LEAK.test(c)) excluded[c] = "label-like name — potential target leakage";
    else if (u.size <= 1) excluded[c] = "constant column";
    else if (miss / n > 0.9) excluded[c] = "more than 90% missing";
    else if (!numeric && u.size > 0.5 * n && c !== roles.timestamp) excluded[c] = "high-cardinality text (identifier-like)";
    else {
      // perfectly determines target with few values -> leakage
      if (n > 20 && u.size < n * 0.5) {
        const map = new Map<string, string>(); let pure = true;
        for (const r of rows) { const p = map.get(r[c]); if (p === undefined) map.set(r[c], r[target]); else if (p !== r[target]) { pure = false; break; } }
        if (pure) { excluded[c] = "perfectly determines the target — likely leakage"; continue; }
      }
      eligible.push(c);
    }
  }
  return { eligible, excluded };
}

export async function fingerprint(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}
