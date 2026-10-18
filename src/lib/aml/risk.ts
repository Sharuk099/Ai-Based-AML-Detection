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
  lowThreshold: 0.30,
  highThreshold: 0.70,
  structuringMin: 9000,
  structuringMax: 9999,
  suspiciousClasses: [
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
 * Validated, multi-factor risk scoring engine separating classification from risk.
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
  const isAmtValid = !Number.isNaN(rawAmt) && rawAmt >= 0;

  // 1. Reliability Gate:
  // If required attributes are missing or model confidence is too low (< 0.40):
  if (!isAmtValid || confidence < 0.38) {
    return {
      riskScore: 0.10,
      riskLevel: "LOW",
      isSuspicious: false,
      classificationStatus: "UNABLE_TO_CLASSIFY",
      reasons: [!isAmtValid ? "Missing or invalid transaction amount" : "Low model confidence / ambiguous profile"],
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

  if (suspicionProb > 0.45) {
    reasons.push(`Model identified ${(suspicionProb * 100).toFixed(1)}% probability of ${predictedClass}`);
  }

  // 3. Amount & Structuring Anomaly Factor:
  let amountRisk = 0;
  if (rawAmt >= config.structuringMin && rawAmt <= config.structuringMax) {
    amountRisk += 0.35;
    reasons.push(`Structuring indicator: $${rawAmt.toLocaleString()} is just below the $10,000 regulatory threshold`);
  } else if (rawAmt > 50000 && String(row["payment_format"]).toLowerCase() === "cash") {
    amountRisk += 0.25;
    reasons.push(`High cash deposit volume ($${rawAmt.toLocaleString()})`);
  }

  // 4. Behavioral & Graph Topology Factor:
  let networkRisk = 0;
  if (graphContext) {
    const sStat = graphContext.senderStat;
    const rStat = graphContext.receiverStat;

    if (sStat && sStat.passthrough >= 0.90 && sStat.passthrough <= 1.10 && sStat.out_total > 5000) {
      networkRisk += 0.25;
      reasons.push(`Sender account acts as a pass-through mule (Out/In flow ${(sStat.passthrough * 100).toFixed(0)}%)`);
    }

    if (sStat && sStat.fan_out) {
      networkRisk += 0.15;
      reasons.push(`Smurfing indicator: Sender disperses funds to ≥10 unique receivers`);
    }

    if (rStat && rStat.fan_in) {
      networkRisk += 0.15;
      reasons.push(`Aggregation indicator: Receiver pools deposits from ≥10 unique senders`);
    }

    if (graphContext.inSuspiciousCycle) {
      networkRisk += 0.25;
      reasons.push(graphContext.cycleEvidence || "Participates in rapid circular transfer loop");
    }
  }

  // 5. Composite Risk Score:
  // Weighted combination: 50% model prediction, 25% amount anomaly, 25% network evidence
  const composite = Math.min(
    1.0,
    0.50 * suspicionProb + 0.25 * amountRisk + 0.25 * networkRisk
  );

  const roundedScore = Math.round(composite * 1000) / 1000;

  // 6. Tier Stratification:
  let riskLevel: "HIGH" | "MEDIUM" | "LOW" = "LOW";
  if (roundedScore >= config.highThreshold) {
    riskLevel = "HIGH";
  } else if (roundedScore >= config.lowThreshold) {
    riskLevel = "MEDIUM";
  }

  const isSuspicious = riskLevel !== "LOW";

  if (!isSuspicious && reasons.length === 0) {
    reasons.push("Standard transaction: ordinary commercial activity with no structural risk flags.");
  }

  return {
    riskScore: roundedScore,
    riskLevel,
    isSuspicious,
    classificationStatus: "CLASSIFIED",
    reasons,
    reliability: confidence > 0.70 ? "HIGH" : "MEDIUM",
    evidenceNotes: reasons.join("; "),
  };
}
