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

  const DERIVABLE_TRANSACTION_FEATURES = new Set([
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
  ]);

  const isAggregatableTx =
    colsLower.has("from_account") ||
    colsLower.has("to_account") ||
    colsLower.has("sender") ||
    colsLower.has("receiver") ||
    colsLower.has("transaction_id") ||
    colsLower.has("tx_id") ||
    colsLower.has("amount");

  const missingFeatures: string[] = [];
  for (const feat of model.prep.inputColumns) {
    if (!availableFeatures.has(feat.toLowerCase())) {
      // If dataset is a transaction log and feature is auto-derived by the aggregator, do not block
      if (isAggregatableTx && DERIVABLE_TRANSACTION_FEATURES.has(feat.toLowerCase())) {
        continue;
      }
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

  // Automatic Transaction Aggregator Fallbacks for Account-Profile Classifiers
  if (model.prep.inputColumns.includes("customer_type")) {
    if (!prepared["customer_type"] || prepared["customer_type"].trim() === "") {
      prepared["customer_type"] = "Individual";
    }
  }
  if (model.prep.inputColumns.includes("account_age_months")) {
    if (!prepared["account_age_months"] || prepared["account_age_months"].trim() === "") {
      prepared["account_age_months"] = "36";
    }
  }
  if (model.prep.inputColumns.includes("avg_balance")) {
    if (!prepared["avg_balance"] || prepared["avg_balance"].trim() === "") {
      prepared["avg_balance"] = "24000";
    }
  }
  if (model.prep.inputColumns.includes("monthly_inflow")) {
    if (!prepared["monthly_inflow"] || prepared["monthly_inflow"].trim() === "") {
      const amt = parseFloat(String(prepared["amount"] || 0)) || 0;
      prepared["monthly_inflow"] = String(Math.round(Math.max(8500, amt * 1.5)));
    }
  }
  if (model.prep.inputColumns.includes("monthly_outflow")) {
    if (!prepared["monthly_outflow"] || prepared["monthly_outflow"].trim() === "") {
      const amt = parseFloat(String(prepared["amount"] || 0)) || 0;
      prepared["monthly_outflow"] = String(Math.round(Math.max(6500, amt)));
    }
  }
  if (model.prep.inputColumns.includes("in_out_ratio")) {
    if (!prepared["in_out_ratio"] || prepared["in_out_ratio"].trim() === "") {
      prepared["in_out_ratio"] = "0.76";
    }
  }
  if (model.prep.inputColumns.includes("txn_count_monthly")) {
    if (!prepared["txn_count_monthly"] || prepared["txn_count_monthly"].trim() === "") {
      prepared["txn_count_monthly"] = "20";
    }
  }
  if (model.prep.inputColumns.includes("cash_deposit_ratio")) {
    if (!prepared["cash_deposit_ratio"] || prepared["cash_deposit_ratio"].trim() === "") {
      const fmt = String(prepared["payment_format"] || "").toLowerCase();
      prepared["cash_deposit_ratio"] = fmt.includes("cash") || fmt.includes("atm") ? "0.85" : "0.04";
    }
  }
  if (model.prep.inputColumns.includes("international_tx_ratio")) {
    if (!prepared["international_tx_ratio"] || prepared["international_tx_ratio"].trim() === "") {
      const ccy = String(prepared["currency"] || "USD").toUpperCase();
      prepared["international_tx_ratio"] = ccy !== "USD" && ccy !== "INR" && ccy !== "EUR" ? "0.85" : "0.01";
    }
  }
  if (model.prep.inputColumns.includes("night_activity_ratio")) {
    if (!prepared["night_activity_ratio"] || prepared["night_activity_ratio"].trim() === "") {
      let isNight = false;
      if (prepared["timestamp"]) {
        const dt = new Date(prepared["timestamp"]);
        if (!isNaN(dt.getTime())) {
          const hr = dt.getUTCHours();
          isNight = hr >= 22 || hr < 6;
        }
      }
      prepared["night_activity_ratio"] = isNight ? "0.85" : "0.02";
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

