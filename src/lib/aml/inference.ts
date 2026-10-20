import type { SavedModel } from "./pipeline";
import type { Row } from "./types";
import { FORBIDDEN_SYNTHETIC_FEATURES } from "./audit";

export interface ModelCompatibilityResult {
  compatible: boolean;
  reasons: string[];
  missingFeatures: string[];
  isAccountLevelDataset: boolean;
  isTransactionModel: boolean;
  modelExpectedTarget: string;
  datasetTarget?: string | undefined;
  modelClasses: string[];
}

/**
 * Check whether a saved model's expected feature schema and label mapping
 * match the uploaded dataset. Do not silently use an incompatible model.
 */
export function checkModelCompatibility(
  model: SavedModel | undefined,
  datasetColumns: string[],
  detectedRoles: Record<string, string | undefined> = {},
): ModelCompatibilityResult {
  if (!model) {
    return {
      compatible: false,
      reasons: ["No model has been trained or selected."],
      missingFeatures: [],
      isAccountLevelDataset: false,
      isTransactionModel: false,
      modelExpectedTarget: "",
      modelClasses: [],
    };
  }

  const colsLower = new Set(datasetColumns.map((c) => c.toLowerCase()));

  // Available features include dataset columns and any columns mapped via detected roles
  const availableFeatures = new Set<string>();
  datasetColumns.forEach((c) => availableFeatures.add(c.toLowerCase()));
  for (const [role, trainingCol] of Object.entries(model.roles)) {
    if (trainingCol && detectedRoles[role]) {
      availableFeatures.add(trainingCol.toLowerCase());
    }
  }

  const missingFeatures: string[] = [];
  for (const feat of model.prep.inputColumns) {
    if (!availableFeatures.has(feat.toLowerCase())) {
      missingFeatures.push(feat);
    }
  }

  // Account-level vs transaction-level heuristics
  const isAccountLevelDataset =
    colsLower.has("risk_label_synthetic") ||
    colsLower.has("avg_balance") ||
    colsLower.has("monthly_inflow") ||
    colsLower.has("account_age_months") ||
    colsLower.has("account_id") ||
    colsLower.has("in_out_ratio") ||
    (datasetColumns.some((c) => /account/i.test(c)) &&
      !datasetColumns.some((c) => /to_account|receiver/i.test(c)));

  const isTransactionModel =
    model.prep.inputColumns.some((f) =>
      ["payment_format", "currency", "from_account", "to_account"].includes(f),
    ) ||
    model.classes.some((c) =>
      ["Circular Layering", "Mule Pass-Through", "Structuring & Smurfing"].includes(c),
    );

  const reasons: string[] = [];

  if (isAccountLevelDataset && isTransactionModel && missingFeatures.length > 0) {
    reasons.push(
      `Schema mismatch: Model "${model.name}" is a transaction-level model requiring features [${model.prep.inputColumns.join(", ")}], but uploaded dataset contains account-level records.`,
    );
  }

  if (missingFeatures.length > 0) {
    reasons.push(
      `Dataset is missing ${missingFeatures.length} required model features: ${missingFeatures.join(", ")}.`,
    );
  }

  if (colsLower.has("risk_label_synthetic") && model.target !== "risk_label_synthetic") {
    reasons.push(
      `Label target mismatch: Dataset target is "risk_label_synthetic" (risk vs normal), but model was trained on target "${model.target}" with classes [${model.classes.join(", ")}].`,
    );
  }

  return {
    compatible: reasons.length === 0 && missingFeatures.length === 0,
    reasons,
    missingFeatures,
    isAccountLevelDataset,
    isTransactionModel,
    modelExpectedTarget: model.target,
    datasetTarget: colsLower.has("risk_label_synthetic")
      ? "risk_label_synthetic"
      : detectedRoles['label'],
    modelClasses: model.classes,
  };
}

/** Keep original feature names; aliases only bridge roles recorded during training. */
export function prepareInferenceRow(
  row: Row,
  model: SavedModel,
  detected: Record<string, string | undefined>,
): Row {
  const prepared = { ...row };
  for (const [role, trainingColumn] of Object.entries(model.roles)) {
    const inputColumn = detected[role];
    if (trainingColumn && inputColumn && prepared[trainingColumn] === undefined) {
      prepared[trainingColumn] = row[inputColumn] ?? "";
    }
  }
  const aliases: Record<string, string> = {
    amount: "amount",
    sender: "from_account",
    receiver: "to_account",
    timestamp: "timestamp",
    currency: "currency",
    payment_format: "payment_format",
    transaction_id: "transaction_id",
  };
  for (const [role, canonical] of Object.entries(aliases)) {
    const key = detected[role];
    if (key && prepared[canonical] === undefined) {
      prepared[canonical] = row[key] ?? "";
    }
  }

  // Never use ground-truth or synthetic metadata as predictive features
  delete prepared[model.target];
  for (const forbidden of FORBIDDEN_SYNTHETIC_FEATURES) {
    delete prepared[forbidden];
  }
  return prepared;
}

export function inferenceIssue(model: SavedModel, row: Row): string | undefined {
  if (!model.report.reloadVerified) return "Model reload has not been verified.";
  for (const key of model.prep.inputColumns) {
    if (row[key] === undefined || row[key]?.trim() === "")
      return `Missing required model feature: ${key}`;
  }
  for (const feature of model.prep.numeric) {
    if (!Number.isFinite(Number(String(row[feature.col]).replace(/,/g, ""))))
      return `Invalid numeric feature: ${feature.col}`;
  }
  for (const feature of model.prep.categorical) {
    const rawVal = (row[feature.col] ?? "").trim();
    const hasMatch = feature.cats.includes(rawVal);
    if (!hasMatch)
      return `Unseen category for ${feature.col} ("${rawVal}"); reliability not established.`;
  }
  if (model.prep.time && !Number.isFinite(Date.parse(row[model.prep.time.col] ?? "")))
    return "Invalid transaction timestamp.";
  return undefined;
}

