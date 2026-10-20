import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { trainAll } from "../src/lib/aml/train";
import { fingerprint } from "../src/lib/aml/audit";
import type { SavedModel } from "../src/lib/aml/pipeline";
import type { Row, TrainConfig } from "../src/lib/aml/types";

async function main() {
  const datasetName = "synthetic_banking_accounts_100_50_risk_50_normal.csv";
  const csv = fs.readFileSync(datasetName, "utf-8");
  const parsed = Papa.parse<Row>(csv, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
  const rows = parsed.data;
  const columns = (parsed.meta.fields || []).filter(Boolean);

  if (parsed.errors.length || rows.length !== 100) throw new Error("Expected the approved 100-account CSV.");
  if (new Set(rows.map((r) => r['account_id'])).size !== 100) throw new Error("Duplicate accounts would leak across splits.");
  const roles = {};

  const fp = await fingerprint(csv.slice(0, 5_000_000));

  const cfg: TrainConfig = {
    datasetName,
    fingerprint: fp,
    target: "risk_label_synthetic",
    roles,
    features: ["customer_type", "account_age_months", "avg_balance", "monthly_inflow", "monthly_outflow", "in_out_ratio", "txn_count_monthly", "cash_deposit_ratio", "international_tx_ratio", "night_activity_ratio"],
    mapping: {},
    split: "stratified",
    metric: "macro_f1",
    models: ["Gradient Boosting", "Random Forest", "Logistic Regression", "Stacking"],
  };

  const candidates: SavedModel[] = [];
  const saved = trainAll(rows, columns, cfg, (ev) => {
    console.log(`[TRAIN] ${ev.event} ${ev.model || ""} ${ev.detail || ""}`);
  }, (candidate) => candidates.push(candidate));
  if (candidates.length !== 4) throw new Error("Not all four models trained successfully.");
  const winner = candidates.find((m) => m.name === saved.report.selected);
  if (!winner) throw new Error("Validation winner missing.");
  for (const candidate of candidates) {
    candidate.report.notes.push(
      "Explicitly requested synthetic account-profile training; 50 risk and 50 normal accounts. Labels are generated, not confirmed AML outcomes.",
      "Account identifiers, representative transaction data, timestamps and synthetic pattern indicators are excluded. No transaction-level or 12-category validity is claimed.",
      "Training-source uploads are not independent validation. Only the saved 15-account held-out partition provides synthetic test metrics.",
    );
  }

  const outPath = path.resolve(process.cwd(), "src/lib/aml/pretrained.json");
  fs.writeFileSync(outPath, JSON.stringify(winner, null, 2), "utf-8");
  fs.writeFileSync(path.resolve("src/lib/aml/approved-models.json"), JSON.stringify({
    activeId: winner.id, candidates,
  }, null, 2));
  fs.mkdirSync("aml-detection/reports", { recursive: true });
  fs.writeFileSync("aml-detection/reports/approved_account_training.json", JSON.stringify({
    activeId: winner.id, reports: candidates.map((m) => m.report),
  }, null, 2));
  console.log(JSON.stringify(candidates.map((m) => ({ model: m.name, train: m.report.trainSize,
    validation: m.report.valSize, test: m.report.testSize, validationF1: m.report.leaderboard.find((b) => b.key === m.name)?.val?.macro_f1,
    testF1: m.report.test.macro_f1, balancedAccuracy: m.report.test.balanced_accuracy })), null, 2));
  console.log(`Selected Best: ${saved.report.selected}`);
  console.log(`Test Macro F1: ${saved.report.test.macro_f1}`);
}

main().catch((err) => {
  console.error("Failed to build pretrained model:", err);
  process.exit(1);
});
