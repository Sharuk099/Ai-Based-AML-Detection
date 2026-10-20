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
 * Uncalibrated, configurable multi-factor review policy separating classification from risk.
 * A transaction is not automatically labeled suspicious simply because of a predicted label.
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
  const rawAmt = parseFloat(String(row["amount"] || "").replace(/,/g, ""));
  const isAmtValid = Number.isFinite(rawAmt) && rawAmt >= 0;

  // 1. Reliability Gate:
  // If required attributes are missing or model confidence is too low (< 0.35):
  if (!isAmtValid || confidence < 0.35) {
    return {
      riskScore: 0,
      riskLevel: "LOW",
      isSuspicious: false,
      classificationStatus: "UNABLE_TO_CLASSIFY",
      reasons: [
        !isAmtValid
          ? "Missing or invalid transaction amount"
          : "Low model confidence / ambiguous profile",
      ],
      reliability: "INSUFFICIENT_EVIDENCE",
      evidenceNotes: "Transaction features insufficient for reliable AML risk assessment.",
    };
  }

  // 2. Suspicious AML Class Probability Factor:
  let suspicionProb = 0;
  for (const p of probabilities) {
    if (config.suspiciousClasses.includes(p.label)) {
      suspicionProb += p.prob;
    }
  }

  if (suspicionProb > 0.4) {
    reasons.push(
      `Model assigned ${(suspicionProb * 100).toFixed(1)}% suspicion probability to illicit crime typologies (top: ${predictedClass})`,
    );
  }

  // 3. Amount & Structuring Anomaly Factor:
  const ccy = String(row["currency"] || "USD").toUpperCase();
  const fmt = String(row["payment_format"] || "").toLowerCase();
  let amountRisk = 0;

  if (
    (ccy === "USD" || ccy === "EUR" || ccy === "GBP") &&
    rawAmt >= config.structuringMin &&
    rawAmt <= config.structuringMax
  ) {
    amountRisk += 0.35;
    reasons.push(
      `Structuring indicator: ${ccy} ${rawAmt.toLocaleString()} is just below the 10,000 regulatory reporting threshold`,
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
        `Pass-through mule account pattern (Out/In flow ratio ${(sStat.passthrough * 100).toFixed(0)}%)`,
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
  // Weighted combination: 45% model prediction, 30% amount structuring anomaly, 25% network evidence
  const composite = Math.min(
    1.0,
    0.45 * suspicionProb +
      0.3 * Math.min(1, amountRisk / 0.35) +
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

  const isSuspicious =
    riskLevel !== "LOW" && (amountRisk > 0 || networkRisk > 0 || suspicionProb > 0.45);
  if (!isSuspicious && riskLevel !== "LOW") riskLevel = "LOW";

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
