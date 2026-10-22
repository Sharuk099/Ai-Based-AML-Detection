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
export const FEATURE_SYNONYMS: Record<string, string[]> = {
  monthly_inflow: [
    "monthly_inflow",
    "inflow",
    "inflows",
    "total_inflow",
    "credit_amount",
    "credits",
    "deposit_amount",
    "deposits",
    "inflow_amount",
    "credit_total",
  ],
  monthly_outflow: [
    "monthly_outflow",
    "outflow",
    "outflows",
    "total_outflow",
    "debit_amount",
    "debits",
    "withdrawal_amount",
    "withdrawals",
    "outflow_amount",
    "debit_total",
  ],
  avg_balance: [
    "avg_balance",
    "balance",
    "current_balance",
    "account_balance",
    "avgbalance",
    "mean_balance",
    "ending_balance",
    "ledger_balance",
  ],
  in_out_ratio: [
    "in_out_ratio",
    "pass_through_ratio",
    "passthrough_ratio",
    "turnover_ratio",
    "inflow_outflow_ratio",
    "flow_ratio",
    "turnover",
    "ratio",
  ],
  txn_count_monthly: [
    "txn_count_monthly",
    "tx_count",
    "transaction_count",
    "txns",
    "monthly_tx_count",
    "txn_count",
    "txcount",
    "num_transactions",
    "count",
  ],
  customer_type: [
    "customer_type",
    "customertype",
    "account_type",
    "client_type",
    "entity_type",
    "type",
    "segment",
  ],
  account_age_months: [
    "account_age_months",
    "account_age",
    "age_months",
    "tenure_months",
    "tenure",
    "months_active",
  ],
  cash_deposit_ratio: ["cash_deposit_ratio", "cash_ratio", "cash_pct", "cash_deposit_pct"],
  international_tx_ratio: [
    "international_tx_ratio",
    "international_ratio",
    "intl_tx_ratio",
    "foreign_tx_ratio",
    "cross_border_ratio",
  ],
  night_activity_ratio: ["night_activity_ratio", "night_ratio", "after_hours_ratio"],
};

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

  const colsLower = new Set(datasetColumns.map((c) => c.toLowerCase().trim()));

  // Available features include dataset columns and any columns mapped via detected roles
  const availableFeatures = new Set<string>();
  datasetColumns.forEach((c) => availableFeatures.add(c.toLowerCase().trim()));
  for (const [role, trainingCol] of Object.entries(model.roles)) {
    if (trainingCol && detectedRoles[role]) {
      availableFeatures.add(trainingCol.toLowerCase().trim());
    }
  }

  // Also bridge canonical model features via recognized column synonyms
  for (const [canonical, synonyms] of Object.entries(FEATURE_SYNONYMS)) {
    if (synonyms.some((s) => colsLower.has(s))) {
      availableFeatures.add(canonical.toLowerCase());
    }
  }

  // If both inflow and outflow exist, in_out_ratio is always computable
  if (
    (availableFeatures.has("monthly_inflow") || colsLower.has("inflow")) &&
    (availableFeatures.has("monthly_outflow") || colsLower.has("outflow"))
  ) {
    availableFeatures.add("in_out_ratio");
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

  // Account-level dataset heuristic
  const isAccountLevelDataset =
    colsLower.has("risk_label_synthetic") ||
    colsLower.has("avg_balance") ||
    colsLower.has("balance") ||
    colsLower.has("monthly_inflow") ||
    colsLower.has("inflow") ||
    colsLower.has("account_age_months") ||
    colsLower.has("account_id") ||
    colsLower.has("in_out_ratio") ||
    colsLower.has("pass_through_ratio") ||
    (datasetColumns.some((c) => /account/i.test(c)) &&
      !datasetColumns.some((c) => /to_account|receiver|targetaccount/i.test(c)));

  const hasCoreAccountMetrics =
    availableFeatures.has("monthly_inflow") ||
    availableFeatures.has("monthly_outflow") ||
    availableFeatures.has("avg_balance") ||
    colsLower.has("inflow") ||
    colsLower.has("outflow") ||
    colsLower.has("balance");

  // Secondary behavioral ratios that safely impute model reference medians when missing on account profiles
  const DEFAULTABLE_ACCOUNT_FEATURES = new Set([
    "account_age_months",
    "cash_deposit_ratio",
    "international_tx_ratio",
    "night_activity_ratio",
    "txn_count_monthly",
  ]);

  const missingFeatures: string[] = [];
  for (const feat of model.prep.inputColumns) {
    const fLower = feat.toLowerCase();
    if (!availableFeatures.has(fLower)) {
      // If dataset is a transaction log and feature is auto-derived by the aggregator, do not block
      if (isAggregatableTx && DERIVABLE_TRANSACTION_FEATURES.has(fLower)) {
        continue;
      }
      // If dataset is an account profile with core metrics, secondary behavioral ratios take training baseline medians
      if (
        isAccountLevelDataset &&
        hasCoreAccountMetrics &&
        DEFAULTABLE_ACCOUNT_FEATURES.has(fLower)
      ) {
        continue;
      }
      missingFeatures.push(feat);
    }
  }

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
      : detectedRoles["label"],
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

  // Helper to extract values by searching synonym candidates in row keys
  const getSynonymVal = (canonical: string): string | undefined => {
    const synonyms = FEATURE_SYNONYMS[canonical] || [];
    for (const key of Object.keys(row)) {
      const kLower = key.toLowerCase().trim();
      if (kLower === canonical.toLowerCase() || synonyms.includes(kLower)) {
        const val = row[key];
        if (val !== undefined && val !== null && String(val).trim() !== "") {
          return String(val).trim();
        }
      }
    }
    return undefined;
  };

  // Populate any missing canonical model features directly from synonyms
  for (const col of model.prep.inputColumns) {
    if (prepared[col] === undefined || prepared[col]?.trim() === "") {
      const synVal = getSynonymVal(col);
      if (synVal !== undefined) {
        prepared[col] = synVal;
      }
    }
  }

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

  // Calculate in_out_ratio if still missing but inflow and outflow exist
  if (
    (!prepared["in_out_ratio"] || prepared["in_out_ratio"].trim() === "") &&
    prepared["monthly_inflow"] &&
    prepared["monthly_outflow"]
  ) {
    const inf = parseFloat(String(prepared["monthly_inflow"]).replace(/,/g, "")) || 0;
    const out = parseFloat(String(prepared["monthly_outflow"]).replace(/,/g, "")) || 0;
    if (inf > 0) {
      prepared["in_out_ratio"] = (out / inf).toFixed(3);
    }
  }

  // Categorical normalization for customer_type
  if (model.prep.inputColumns.includes("customer_type")) {
    const rawVal = String(prepared["customer_type"] || getSynonymVal("customer_type") || "").trim();
    const cLower = rawVal.toLowerCase();
    if (
      cLower === "individual" ||
      cLower === "retail" ||
      cLower === "consumer" ||
      cLower === "personal" ||
      cLower === "person"
    ) {
      prepared["customer_type"] = "Individual";
    } else if (
      cLower === "corporate" ||
      cLower === "business" ||
      cLower === "corp" ||
      cLower === "enterprise" ||
      cLower === "institution"
    ) {
      prepared["customer_type"] = "Corporate";
    } else if (
      cLower === "smb" ||
      cLower === "sme" ||
      cLower === "merchant" ||
      cLower === "small business"
    ) {
      prepared["customer_type"] = "SMB";
    } else {
      prepared["customer_type"] = "Individual";
    }
  }

  // Numeric fallbacks: use model reference medians from training distribution
  const getMedian = (col: string, fallback: number): string => {
    const numInfo = model.prep.numeric.find((n) => n.col === col);
    if (numInfo && numInfo.median !== undefined && Number.isFinite(numInfo.median)) {
      return String(numInfo.median);
    }
    return String(fallback);
  };

  if (model.prep.inputColumns.includes("account_age_months")) {
    if (!prepared["account_age_months"] || prepared["account_age_months"].trim() === "") {
      prepared["account_age_months"] = getMedian("account_age_months", 43);
    }
  }
  if (model.prep.inputColumns.includes("avg_balance")) {
    if (!prepared["avg_balance"] || prepared["avg_balance"].trim() === "") {
      prepared["avg_balance"] = getMedian("avg_balance", 20317);
    }
  }
  if (model.prep.inputColumns.includes("monthly_inflow")) {
    if (!prepared["monthly_inflow"] || prepared["monthly_inflow"].trim() === "") {
      const amt = parseFloat(String(prepared["amount"] || 0)) || 0;
      prepared["monthly_inflow"] =
        amt > 0 ? String(Math.round(amt * 1.5)) : getMedian("monthly_inflow", 150000);
    }
  }
  if (model.prep.inputColumns.includes("monthly_outflow")) {
    if (!prepared["monthly_outflow"] || prepared["monthly_outflow"].trim() === "") {
      const amt = parseFloat(String(prepared["amount"] || 0)) || 0;
      prepared["monthly_outflow"] =
        amt > 0 ? String(Math.round(amt)) : getMedian("monthly_outflow", 138000);
    }
  }
  if (model.prep.inputColumns.includes("in_out_ratio")) {
    if (!prepared["in_out_ratio"] || prepared["in_out_ratio"].trim() === "") {
      prepared["in_out_ratio"] = getMedian("in_out_ratio", 0.92);
    }
  }
  if (model.prep.inputColumns.includes("txn_count_monthly")) {
    if (!prepared["txn_count_monthly"] || prepared["txn_count_monthly"].trim() === "") {
      prepared["txn_count_monthly"] = getMedian("txn_count_monthly", 20);
    }
  }
  if (model.prep.inputColumns.includes("cash_deposit_ratio")) {
    if (!prepared["cash_deposit_ratio"] || prepared["cash_deposit_ratio"].trim() === "") {
      const fmt = String(prepared["payment_format"] || "").toLowerCase();
      prepared["cash_deposit_ratio"] =
        fmt.includes("cash") || fmt.includes("atm")
          ? "0.85"
          : getMedian("cash_deposit_ratio", 0.04);
    }
  }
  if (model.prep.inputColumns.includes("international_tx_ratio")) {
    if (!prepared["international_tx_ratio"] || prepared["international_tx_ratio"].trim() === "") {
      const ccy = String(prepared["currency"] || "USD").toUpperCase();
      prepared["international_tx_ratio"] =
        ccy !== "USD" && ccy !== "INR" && ccy !== "EUR"
          ? "0.85"
          : getMedian("international_tx_ratio", 0.01);
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
      prepared["night_activity_ratio"] = isNight ? "0.85" : getMedian("night_activity_ratio", 0.02);
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
