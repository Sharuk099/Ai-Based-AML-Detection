import { describe, expect, it } from "vitest";
import { trainAll } from "./train";
import { compareLabels, assessFeatures, validateTarget, detectRoles } from "./audit";
import { evaluate } from "./metrics";
import { findCycles } from "./graph";
import { splitData } from "./preprocess";
import type { Row } from "./types";

function data(n = 400): Row[] {
  let s = 1;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const channels = ["wire", "card", "ach"] as const;
  return Array.from({ length: n }, (_, i) => {
    const amount = Math.round(r() * 3000);
    const channel = channels[Math.floor(r() * 3)] ?? "wire";
    return {
      tx_id: "T" + i,
      from_account: "A" + Math.floor(r() * 40),
      to_account: "A" + Math.floor(r() * 40),
      amount: String(amount),
      channel,
      timestamp: new Date(Date.UTC(2024, 0, 1, i)).toISOString(),
      label: amount > 1500 && channel === "wire" ? "Money Laundering" : "Individual Wallet",
    };
  });
}
const cols = ["tx_id", "from_account", "to_account", "amount", "channel", "timestamp", "label"];

describe("aml pipeline", () => {
  it("compares labels against the 12 categories without inventing any", () => {
    const c = compareLabels(["money laundering", "foo"]);
    expect(c.covered).toEqual(["Money Laundering"]);
    expect(c.missing).toHaveLength(11);
    expect(c.unmatched).toEqual(["foo"]);
  });
  it("rejects single-class and missing targets", () => {
    expect(() => validateTarget([{ y: "a" }, { y: "a" }], "y", {}, 5)).toThrow();
    expect(() => validateTarget([{ y: "" }], "y", {}, 5)).toThrow();
  });
  it("excludes identifiers and leakage columns", () => {
    const d: Row[] = data().map((r) => ({ ...r, is_fraud: r["label"] ?? "" }));
    const f = assessFeatures(d, [...cols, "is_fraud"], "label", detectRoles(cols));
    expect(f.excluded["tx_id"]).toBeDefined();
    expect(f.excluded["is_fraud"]).toBeDefined();
    expect(f.eligible).toContain("amount");
  });
  it("keeps train/val/test disjoint", () => {
    const d = data();
    const s = splitData(d, "label", "stratified");
    const t = new Set(s.test.map((r) => r["tx_id"]));
    expect(s.train.some((r) => t.has(r["tx_id"]))).toBe(false);
    expect(s.train.length + s.val.length + s.test.length).toBe(d.length);
  });
  it("allocates the requested 100 accounts into exactly 70/15/15", () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      account_id: String(i),
      risk_label_synthetic: i < 50 ? "risk" : "normal",
    }));
    const split = splitData(rows, "risk_label_synthetic", "stratified");
    expect([split.train.length, split.val.length, split.test.length]).toEqual([70, 15, 15]);
    expect(
      new Set([...split.train, ...split.val, ...split.test].map((r) => r["account_id"])).size,
    ).toBe(100);
  });
  it("flags single-class predictions", () => {
    expect(evaluate([0, 1, 0, 1], [0, 0, 0, 0], null, ["a", "b"]).warnings.join()).toMatch(
      /only one class/,
    );
  });
  it("finds a 3-cycle", () => {
    const adj = new Map([
      ["a", new Set(["b"])],
      ["b", new Set(["c"])],
      ["c", new Set(["a"])],
    ]);
    expect(findCycles(adj)).toHaveLength(1);
  });
  it("trains, selects on validation, tests and reload-verifies", () => {
    const d = data();
    const roles = detectRoles(cols);
    delete roles.label;
    const m = trainAll(
      d,
      cols,
      {
        datasetName: "t",
        fingerprint: "x",
        target: "label",
        roles,
        features: ["amount", "channel"],
        mapping: {},
        split: "stratified",
        metric: "macro_f1",
        models: ["Gradient Boosting", "Logistic Regression", "Random Forest", "CNN"],
      },
      () => {},
    );
    expect(m.report.reloadVerified).toBe(true);
    expect(m.report.leaderboard.filter((b) => b.selected)).toHaveLength(1);
    expect(m.report.leaderboard.find((b) => b.key === "CNN")?.status).toBe("unsupported");
    expect(m.report.test.n).toBe(m.report.testSize);
    expect(m.report.test.macro_f1).toBeGreaterThan(0.8);
  });
});
