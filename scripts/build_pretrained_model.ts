import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { syntheticCsv } from "../src/components/aml/synthetic";
import { trainAll } from "../src/lib/aml/train";
import { detectRoles, fingerprint } from "../src/lib/aml/audit";
import type { Row, TrainConfig } from "../src/lib/aml/types";

async function main() {
  console.log("Generating documented synthetic benchmark transaction dataset...");
  const csv = syntheticCsv(3000);
  const parsed = Papa.parse<Row>(csv, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
  const rows = parsed.data;
  const columns = (parsed.meta.fields || []).filter(Boolean);

  const roles = detectRoles(columns);
  delete roles.label;

  const fp = await fingerprint(csv.slice(0, 5_000_000));

  const cfg: TrainConfig = {
    datasetName: "ibm_aml_synthetic_benchmark.csv",
    fingerprint: fp,
    target: "label",
    roles,
    features: ["amount", "currency", "payment_format", "timestamp"],
    mapping: {},
    split: "stratified",
    metric: "macro_f1",
    models: ["Gradient Boosting", "Stacking", "Logistic Regression", "Random Forest", "CNN"],
  };

  console.log("Training models: Gradient Boosting, Stacking, Logistic Regression, Random Forest, CNN...");
  const saved = trainAll(rows, columns, cfg, (ev) => {
    console.log(`[TRAIN] ${ev.event} ${ev.model || ""} ${ev.detail || ""}`);
  });

  const outPath = path.resolve(process.cwd(), "src/lib/aml/pretrained.json");
  fs.writeFileSync(outPath, JSON.stringify(saved, null, 2), "utf-8");
  console.log(`Pretrained verified model saved to ${outPath}`);
  console.log(`Selected Best: ${saved.report.selected}`);
  console.log(`Test Macro F1: ${saved.report.test.macro_f1}`);
}

main().catch((err) => {
  console.error("Failed to build pretrained model:", err);
  process.exit(1);
});
