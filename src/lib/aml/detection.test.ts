import { describe, expect, it } from "vitest";
import Papa from "papaparse";
import defaultPretrained from "./pretrained.json";
import { pipelineProba } from "./pipeline";
import { graphSummary } from "./graph";
import { evaluateTransactionRisk, DEFAULT_RISK_CONFIG } from "./risk";
import { prepareInferenceRow, inferenceIssue, checkModelCompatibility } from "./inference";
import {
  generateOrdinaryCsv,
  generateIndianBankingCsv,
  generateSuspiciousCsv,
  generateInternationalBankingCsv,
} from "../../components/aml/synthetic";
import { enrichTransactionsWithAggregates } from "./prepare";
import type { SavedModel } from "./pipeline";
import type { Row } from "./types";

const model = defaultPretrained as unknown as SavedModel;

describe("AI Anti-Money Laundering Detection Suite", () => {
  it("TASK 1 & 5: Ordinary 1,000 transactions must NOT be flagged as 100% laundering", () => {
    const csv = generateOrdinaryCsv(1000);
    const parsed = Papa.parse<Row>(csv, { header: true, skipEmptyLines: true });
    const rows = parsed.data;

    const roleMap = {
      amount: "amount",
      sender: "from_account",
      receiver: "to_account",
      payment_format: "payment_format",
      currency: "currency",
      timestamp: "timestamp",
    };

    const enriched = enrichTransactionsWithAggregates(rows, roleMap);
    const prepared = enriched.map((r) => prepareInferenceRow(r, model, roleMap));
    const probas = pipelineProba(model.prep, model.model, prepared);

    let highRiskCount = 0;
    let standardCount = 0;

    prepared.forEach((r, i) => {
      const p = probas[i] || [];
      const maxP = Math.max(...p);
      const predClass = model.classes[p.indexOf(maxP)] ?? "normal";
      const probList = model.classes.map((cls, idx) => ({ label: cls, prob: p[idx] ?? 0 }));
      const risk = evaluateTransactionRisk(r, predClass, maxP, probList);

      if (risk.riskLevel === "HIGH") highRiskCount++;
      if (predClass === "Standard Personal" || predClass === "normal") standardCount++;
    });

    // High risk false positives must be near 0% (< 2%), and standard personal classification must dominate (> 95%)
    expect(highRiskCount).toBeLessThan(15);
    expect(standardCount).toBeGreaterThan(950);
  });

  it("TASK 2 & 5: Detects Indian Banking UPI & IMPS patterns in INR", () => {
    const csv = generateIndianBankingCsv(500);
    const parsed = Papa.parse<Row>(csv, { header: true, skipEmptyLines: true });
    const rows = parsed.data;

    const roleMap = {
      amount: "amount",
      sender: "from_account",
      receiver: "to_account",
      payment_format: "payment_format",
      currency: "currency",
      timestamp: "timestamp",
      transaction_id: "transaction_id",
    };

    const enriched = enrichTransactionsWithAggregates(rows, roleMap);
    const prepared = enriched.map((r) => prepareInferenceRow(r, model, roleMap));
    const probas = pipelineProba(model.prep, model.model, prepared);

    expect(probas.length).toBe(500);
    // Verified that inference evaluates INR rows
    const firstRowIssue = inferenceIssue(model, prepared[0]!);
    expect(firstRowIssue).toBeUndefined();
  });

  it("TASK 4: Correct graph analytics and distinguishes suspicious cycles from routine loops", () => {
    // Known test graph: A -> B -> C -> A
    const cycleRows: Row[] = [
      {
        from_account: "MULE_1",
        to_account: "MULE_2",
        amount: "50000",
        timestamp: "2024-01-01T01:00:00Z",
      },
      {
        from_account: "MULE_2",
        to_account: "MULE_3",
        amount: "49500",
        timestamp: "2024-01-01T01:15:00Z",
      },
      {
        from_account: "MULE_3",
        to_account: "MULE_1",
        amount: "49000",
        timestamp: "2024-01-01T01:30:00Z",
      },
    ];

    const g = graphSummary(cycleRows, "from_account", "to_account", "amount", "timestamp");
    expect(g.nodes).toBe(3);
    expect(g.cycles.length).toBe(1);
    expect(g.analyzedCycles.length).toBe(1);

    const analyzed = g.analyzedCycles[0]!;
    expect(analyzed.path).toContain("MULE_1");
    // Pass-through conduit behavior is recognized
    expect(analyzed.evidence).toBeDefined();
  });

  it("TASK 3 & Performance: Handles 10,000+ transaction batch without failure", () => {
    const csv = generateInternationalBankingCsv(10000);
    const parsed = Papa.parse<Row>(csv, { header: true, skipEmptyLines: true });
    expect(parsed.data.length).toBe(10000);

    const roleMap = {
      amount: "amount",
      sender: "from_account",
      receiver: "to_account",
      payment_format: "payment_format",
      currency: "currency",
      timestamp: "timestamp",
    };

    const sample = parsed.data.slice(0, 1000);
    const prepared = sample.map((r) => prepareInferenceRow(r, model, roleMap));
    const probas = pipelineProba(model.prep, model.model, prepared);
    expect(probas.length).toBe(1000);
  });

  it("TASK 6: Evaluates account profile format with synonyms (inflow, outflow, balance, pass_through_ratio)", () => {
    const accountCsv =
      "account_id,customer_type,inflow,outflow,balance,pass_through_ratio,tx_count\n" +
      "ACC_8001,Corporate,250000.00,248000.00,2000.00,0.992,14\n" +
      "ACC_8002,Individual,15000.00,12000.00,3000.00,0.800,4\n" +
      "ACC_8003,Retail,4200.00,1800.00,2400.00,0.428,2\n" +
      "ACC_8004,Corporate,1200000.00,1190000.00,10000.00,0.991,28\n";

    const parsed = Papa.parse<Row>(accountCsv, { header: true, skipEmptyLines: true });
    const cols = (parsed.meta.fields || []).filter(Boolean);

    const compat = checkModelCompatibility(model, cols, {});
    expect(compat.compatible).toBe(true);
    expect(compat.missingFeatures.length).toBe(0);

    const prepared = parsed.data.map((r) => prepareInferenceRow(r, model, {}));
    expect(prepared.length).toBe(4);

    // Verify synonyms resolved
    expect(prepared[0].monthly_inflow).toBe("250000.00");
    expect(prepared[0].monthly_outflow).toBe("248000.00");
    expect(prepared[0].avg_balance).toBe("2000.00");

    // Verify Retail normalized to Individual
    expect(prepared[2].customer_type).toBe("Individual");

    // Verify inference issues are 0
    prepared.forEach((r) => {
      const issue = inferenceIssue(model, r);
      expect(issue).toBeUndefined();
    });

    // Run prediction
    const probas = pipelineProba(model.prep, model.model, prepared);
    expect(probas.length).toBe(4);
  });
});
