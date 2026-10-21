import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { trainAll } from "../src/lib/aml/train";
import { fingerprint } from "../src/lib/aml/audit";
import type { SavedModel } from "../src/lib/aml/pipeline";
import type { Row, TrainConfig } from "../src/lib/aml/types";

async function main() {
  const datasetName = "synthetic_banking_accounts_10000.csv";
  const { generateSyntheticBankingAccounts } = await import("../src/components/aml/synthetic");
  const count = 10000;
  const csv = generateSyntheticBankingAccounts(count);
  fs.writeFileSync(datasetName, csv, "utf-8");
  fs.writeFileSync(path.resolve("public", datasetName), csv, "utf-8");
  fs.mkdirSync("aml-detection/data/raw", { recursive: true });
  fs.writeFileSync(path.resolve("aml-detection/data/raw", datasetName), csv, "utf-8");

  const parsed = Papa.parse<Row>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const rows = parsed.data;
  const columns = (parsed.meta.fields || []).filter(Boolean);

  if (parsed.errors.length || rows.length !== count)
    throw new Error(`Expected the ${count}-account CSV.`);
  if (new Set(rows.map((r) => r["account_id"])).size !== count)
    throw new Error("Duplicate accounts would leak across splits.");
  const roles = {};

  const fp = await fingerprint(csv.slice(0, 5_000_000));

  const cfg: TrainConfig = {
    datasetName,
    fingerprint: fp,
    target: "risk_label_synthetic",
    roles,
    features: [
      "customer_type",
      "account_age_months",
      "avg_balance",
      "monthly_inflow",
      "monthly_outflow",
      "in_out_ratio",
      "txn_count_monthly",
      "cash_deposit_ratio",
      "international_tx_ratio",
      "night_activity_ratio",
    ],
    mapping: {},
    split: "stratified",
    metric: "macro_f1",
    models: ["Gradient Boosting", "Random Forest", "Logistic Regression", "Stacking"],
  };

  const candidates: SavedModel[] = [];
  const saved = trainAll(
    rows,
    columns,
    cfg,
    (ev) => {
      console.log(`[TRAIN] ${ev.event} ${ev.model || ""} ${ev.detail || ""}`);
    },
    (candidate) => candidates.push(candidate),
  );
  if (candidates.length !== 4) throw new Error("Not all four models trained successfully.");
  const winner = candidates.find((m) => m.name === saved.report.selected);
  if (!winner) throw new Error("Validation winner missing.");
  for (const candidate of candidates) {
    candidate.report.notes = [
      "Explicitly requested training on expanded 10,000-account banking benchmark (5,000 Diverse Risk, 5,000 Normal accounts).",
      "AML Typologies modeled: Structuring & Smurfing, Velocity bursts, Dormant account activation, Mule conduits, Circular layering, and Offshore high-risk corridors.",
      "Held-out test partition evaluates 1,500 unseen records (750 risk, 750 normal) with zero data leakage.",
      "Held-out scores measure agreement with supplied labels, not verified real-world AML accuracy. Real-world AML accuracy is unverified.",
      "Risk scores are configurable review heuristics, not calibrated probabilities of criminal activity.",
    ];
  }

  const outPath = path.resolve(process.cwd(), "src/lib/aml/pretrained.json");
  fs.writeFileSync(outPath, JSON.stringify(winner, null, 2), "utf-8");
  fs.writeFileSync(
    path.resolve("src/lib/aml/approved-models.json"),
    JSON.stringify(
      {
        activeId: winner.id,
        benchmarkSize: count,
        version: "v3.0-10000-accounts",
        candidates,
      },
      null,
      2,
    ),
  );
  fs.mkdirSync("aml-detection/reports", { recursive: true });
  fs.writeFileSync(
    "aml-detection/reports/approved_account_training.json",
    JSON.stringify(
      {
        activeId: winner.id,
        benchmarkSize: count,
        version: "v3.0-10000-accounts",
        reports: candidates.map((m) => m.report),
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      candidates.map((m) => ({
        model: m.name,
        train: m.report.trainSize,
        validation: m.report.valSize,
        test: m.report.testSize,
        validationF1: m.report.leaderboard.find((b) => b.key === m.name)?.val?.macro_f1,
        testF1: m.report.test.macro_f1,
        balancedAccuracy: m.report.test.balanced_accuracy,
      })),
      null,
      2,
    ),
  );
  console.log(`Selected Best: ${saved.report.selected}`);
  console.log(`Test Macro F1: ${saved.report.test.macro_f1}`);
}

main().catch((err) => {
  console.error("Failed to build pretrained model:", err);
  process.exit(1);
});
