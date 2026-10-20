import type { Row } from "./types";
import type { AccountStat } from "./graph";

export interface RiskConfig {
  lowThreshold: number; // default: 0.30
  highThreshold: number; // default: 0.70
  structuringMin: number; // default: 9000
  structuringMax: number; // default: 9999
  suspiciousClasses: string[];
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  lowThreshold: 0.3,
  highThreshold: 0.7,
  structuringMin: 9000,
  structuringMax: 9999,
  suspiciousClasses: [
    "risk",
    "Risk",
    "high_risk",
    "High Risk",
    "Structuring & Smurfing",
    "Mule Pass-Through",
    "Circular Layering",
    "Rapid High-Velocity",
    "Money Laundering",
    "Tumbler",
    "Darknet Market",
    "Blackmail",
    "Ponzi Scheme",
    "Government Criminal Blacklist",
  ],
};

export function isSuspiciousClass(
  label: string,
  config: RiskConfig = DEFAULT_RISK_CONFIG,
): boolean {
  const norm = label.toLowerCase().trim();
  if (
    norm === "normal" ||
    norm === "benign" ||
    norm === "standard" ||
    norm === "standard personal" ||
    norm === "commercial & merchant"
  ) {
    return false;
  }
  if (
    norm === "risk" ||
    norm === "high_risk" ||
    norm === "suspicious" ||
    norm === "fraud" ||
    norm === "laundering" ||
    norm === "1"
  ) {
    return true;
  }
  return config.suspiciousClasses.some((c) => c.toLowerCase() === norm);
}

export interface RiskEvaluation {
  riskScore: number; // 0.0 to 1.0
  riskLevel: "HIGH" | "MEDIUM" | "LOW";
  isSuspicious: boolean;
  classificationStatus: "CLASSIFIED" | "UNABLE_TO_CLASSIFY";
  reasons: string[];
  reliability: "HIGH" | "MEDIUM" | "INSUFFICIENT_EVIDENCE";
  evidenceNotes: string;
}

/**
 * Uncalibrated review policy. Weights are policy settings, not validated crime probabilities.
 * Flags require all three evidence families and complete transaction provenance.
 */
export function evaluateTransactionRisk(
  row: Row,
  predictedClass: string,
  confidence: number,
  probabilities: { label: string; prob: number }[],
  graphContext?: {
    senderStat?: AccountStat;
    receiverStat?: AccountStat;
    inSuspiciousCycle?: boolean;
    cycleEvidence?: string;
  },
  config: RiskConfig = DEFAULT_RISK_CONFIG,
): RiskEvaluation {
  const reasons: string[] = [];
  const rawAmtStr = String(row["amount"] ?? "").replace(/,/g, "");
  const rawAmt = rawAmtStr.trim() ? Number(rawAmtStr) : NaN;
  const isAmtValid = Number.isFinite(rawAmt) && rawAmt >= 0;

  // 1. Reliability Gate:
  if (confidence < 0.35) {
    return {
      riskScore: 0,
      riskLevel: "LOW",
      isSuspicious: false,
      classificationStatus: "UNABLE_TO_CLASSIFY",
      reasons: ["Low model confidence / ambiguous profile (< 35%)"],
      reliability: "INSUFFICIENT_EVIDENCE",
      evidenceNotes: "Transaction features insufficient for reliable AML risk assessment.",
    };
  }

  // 2. Suspicious AML Class Probability Factor:
  let suspicionProb = 0;
  for (const p of probabilities) {
    if (isSuspiciousClass(p.label, config)) {
      suspicionProb += p.prob;
    }
  }

  const isPredictedRisk = isSuspiciousClass(predictedClass, config);

  if (suspicionProb >= 0.4 || isPredictedRisk) {
    reasons.push(
      `Model assigned ${(suspicionProb * 100).toFixed(1)}% total score to configured review classes (predicted: ${predictedClass}); not a calibrated crime probability`,
    );
  }

  // 3. Amount & Structuring Anomaly Factor:
  const ccy = String(row["currency"] || "").toUpperCase();
  const fmt = String(row["payment_format"] || "").toLowerCase();
  let amountRisk = 0;

  if (
    isAmtValid && ccy === "USD" &&
    rawAmt >= config.structuringMin &&
    rawAmt <= config.structuringMax
  ) {
    amountRisk += 0.35;
    reasons.push(
      `Amount-band policy: ${ccy} ${rawAmt.toLocaleString()} lies in configured range ${config.structuringMin}–${config.structuringMax}; not proof of structuring`,
    );
  } else if (
    ccy === "INR" &&
    ((rawAmt >= 45000 && rawAmt <= 49999) || (rawAmt >= 900000 && rawAmt <= 999999))
  ) {
    amountRisk += 0.35;
    reasons.push(
      `Structuring indicator: ₹${rawAmt.toLocaleString()} is just below Indian regulatory threshold (₹50k PAN / ₹10L CTR)`,
    );
  } else if (
    fmt === "cash" &&
    ((ccy === "INR" && rawAmt > 50000) || (ccy !== "INR" && rawAmt > 10000))
  ) {
    amountRisk += 0.25;
    reasons.push(`High cash transaction volume (${ccy} ${rawAmt.toLocaleString()})`);
  }

  // 4. Behavioral & Graph Topology Factor:
  let networkRisk = 0;
  if (graphContext) {
    const sStat = graphContext.senderStat;
    const rStat = graphContext.receiverStat;

    if (sStat && sStat.passthrough >= 0.85 && sStat.passthrough <= 1.15 && sStat.out_total > 5000) {
      networkRisk += 0.25;
      reasons.push(
        `Unvalidated pass-through pattern (Out/In flow ratio ${(sStat.passthrough * 100).toFixed(0)}%)`,
      );
    }

    if (sStat && sStat.fan_out) {
      networkRisk += 0.15;
      reasons.push(
        `Fan-out indicator: Sender disperses funds to ≥10 unique counterparties (smurfing risk)`,
      );
    }

    if (rStat && rStat.fan_in) {
      networkRisk += 0.15;
      reasons.push(`Fan-in indicator: Receiver pools deposits from ≥10 unique counterparties`);
    }

    if (graphContext.inSuspiciousCycle) {
      networkRisk += 0.3;
      reasons.push(graphContext.cycleEvidence || "Participates in rapid circular layering loop");
    }
  }

  // 5. Composite Risk Score:
  // Incorporates model prediction probability and external structuring/graph indicators
  const composite = Math.min(
    1.0,
    0.5 * suspicionProb +
        0.25 * Math.min(1, amountRisk / 0.35) +
        0.25 * Math.min(1, networkRisk / 0.7),
  );

  const roundedScore = Math.round(composite * 1000) / 1000;

  // 6. Tier Stratification:
  let riskLevel: "HIGH" | "MEDIUM" | "LOW" = "LOW";
  if (roundedScore >= config.highThreshold) {
    riskLevel = "HIGH";
  } else if (roundedScore >= config.lowThreshold) {
    riskLevel = "MEDIUM";
  }

  const completeEvidence = !!(row['transaction_id'] && row['from_account'] && row['to_account'] &&
    row['currency'] && isAmtValid && Number.isFinite(Date.parse(row['timestamp'] ?? '')));
  const isSuspicious = completeEvidence && suspicionProb >= 0.4 && amountRisk > 0 &&
    networkRisk > 0 && riskLevel !== "LOW";
  if (!isSuspicious) riskLevel = "LOW";
  if (isSuspicious) reasons.push(
    `Review policy: model + amount + network evidence; transaction ${row['transaction_id']}, ` +
    `${row['from_account']} → ${row['to_account']}, ${ccy} ${rawAmt}, ${row['timestamp']}`,
  );
  else reasons.push("Not flagged: corroborating model, amount and network evidence with complete transaction details is required. Low review tier does not establish safety.");

  if (!isSuspicious && reasons.length === 0) {
    reasons.push(
      "Standard transaction: ordinary commercial activity with no structural risk flags.",
    );
  }

  return {
    riskScore: roundedScore,
    riskLevel,
    isSuspicious,
    classificationStatus: "CLASSIFIED",
    reasons,
    reliability: confidence > 0.7 ? "HIGH" : "MEDIUM",
    evidenceNotes: reasons.join("; "),
  };
}
