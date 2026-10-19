import type { SavedModel } from "./pipeline";
import type { Row } from "./types";

/** Keep original feature names; aliases only bridge roles recorded during training. */
export function prepareInferenceRow(row: Row, model: SavedModel, detected: Record<string, string | undefined>): Row {
  const prepared = { ...row };
  for (const [role, trainingColumn] of Object.entries(model.roles)) {
    const inputColumn = detected[role];
    if (trainingColumn && inputColumn && prepared[trainingColumn] === undefined) {
      prepared[trainingColumn] = row[inputColumn] ?? "";
    }
  }
  const aliases: Record<string, string> = { amount: "amount", sender: "from_account", receiver: "to_account", timestamp: "timestamp", currency: "currency", payment_format: "payment_format", transaction_id: "transaction_id" };
  for (const [role, canonical] of Object.entries(aliases)) {
    const key = detected[role];
    if (key) prepared[canonical] = row[key] ?? "";
  }
  delete prepared[model.target];
  return prepared;
}

export function inferenceIssue(model: SavedModel, row: Row): string | undefined {
  if (!model.report.reloadVerified) return "Model reload has not been verified.";
  for (const key of model.prep.inputColumns) {
    if (row[key] === undefined || row[key]?.trim() === "") return `Missing required model feature: ${key}`;
  }
  for (const feature of model.prep.numeric) {
    if (!Number.isFinite(Number(String(row[feature.col]).replace(/,/g, "")))) return `Invalid numeric feature: ${feature.col}`;
  }
  for (const feature of model.prep.categorical) {
    if (!feature.cats.includes(row[feature.col] ?? "")) return `Unseen category for ${feature.col}; reliability not established.`;
  }
  if (model.prep.time && !Number.isFinite(Date.parse(row[model.prep.time.col] ?? ""))) return "Invalid transaction timestamp.";
  return undefined;
}