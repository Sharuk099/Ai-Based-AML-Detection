// @ts-nocheck -- strict index checks relaxed for numeric ML code
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Audit } from "@/lib/aml/audit";
import type { Row, TrainConfig } from "@/lib/aml/types";
import type { SavedModel } from "@/lib/aml/pipeline";
import { listModels, saveModel, deleteModel } from "@/lib/aml/store";
import { pipelineProba, localExplain } from "@/lib/aml/pipeline";
import { graphSummary } from "@/lib/aml/graph";
import {
  evaluateTransactionRisk,
  DEFAULT_RISK_CONFIG,
  isSuspiciousClass,
  type RiskConfig,
} from "@/lib/aml/risk";
import {
  prepareInferenceRow,
  inferenceIssue,
  checkModelCompatibility,
  type ModelCompatibilityResult,
} from "@/lib/aml/inference";
import approvedModels from "@/lib/aml/approved-models.json";
import {
  generateIndianBankingCsv,
  generateInternationalBankingCsv,
  generateOrdinaryCsv,
  generateSuspiciousCsv,
  generateSyntheticBankingAccounts100Csv,
} from "./synthetic";
import Papa from "papaparse";
import { audit, fingerprint, assessFeatures, FORBIDDEN_SYNTHETIC_FEATURES } from "@/lib/aml/audit";
import { trainAll } from "@/lib/aml/train";
import { argmax } from "@/lib/aml/models";

export interface Dataset {
  name: string;
  rows: Row[];
  columns: string[];
  audit: Audit;
  fingerprint: string;
  provenance: string;
  license: string;
}

export interface ScoredTransaction {
  [key: string]:
    | string
    | number
    | boolean
    | { label: string; prob: number }[]
    | { feature: string; value: string; contribution: number }[];
  _row_id: string;
  _predicted_class: string;
  _confidence: number;
  _risk_score: number;
  _risk_level: "HIGH" | "MEDIUM" | "LOW";
  _is_suspicious: boolean;
  _status: "CLASSIFIED" | "UNABLE_TO_CLASSIFY";
  _reliability: "HIGH" | "MEDIUM" | "INSUFFICIENT_EVIDENCE";
  _evidence_notes: string;
  _probabilities: { label: string; prob: number }[];
  _explanations: { feature: string; value: string; contribution: number }[];
}

export interface GroundTruthEvaluation {
  targetColumn: string;
  n: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  confusionMatrix: {
    trueRisk: number;
    falseRisk: number;
    trueNormal: number;
    falseNormal: number;
  };
}

export interface AnalysisResult {
  analyzedAt: string;
  datasetName: string;
  totalTransactions: number;
  classifiedCount: number;
  unclassifiedCount: number;
  flaggedCount: number; // Medium + High risk
  highRiskCount: number;
  flaggedPct: number;
  riskPredictionsCount: number;
  normalPredictionsCount: number;
  modelUsed: string;
  modelId: string;
  records: ScoredTransaction[];
  graphData: ReturnType<typeof graphSummary> | null;
  classes: string[];
  categoryBreakdown: Record<string, number>;
  riskBuckets: { range: string; count: number }[];
  evaluationVsGroundTruth?: GroundTruthEvaluation;
  compatibility?: ModelCompatibilityResult;
}

export interface JobEvent {
  t: number;
  event: string;
  model?: string;
  detail?: string;
}

export interface Job {
  status: "running" | "completed" | "failed";
  started: number;
  ended?: number;
  events: JobEvent[];
  current?: string;
  info?: Record<string, any>;
  error?: string;
  modelId?: string;
  config: TrainConfig;
}

interface Ctx {
  datasets: Dataset[];
  addDataset: (d: Dataset) => void;
  clearActiveDataset: () => void;
  activeDs?: Dataset;
  setActiveDs: (name: string) => void;
  models: SavedModel[];
  activeModel?: SavedModel;
  refreshModels: () => Promise<void>;
  removeModel: (id: string) => Promise<void>;
  analysisResult?: AnalysisResult;
  isAnalyzing: boolean;
  analyzeError?: string;
  runAnalysis: (targetDs?: Dataset) => Promise<boolean>;
  riskConfig: RiskConfig;
  loadPresetDataset: (
    type: "indian" | "international" | "ordinary" | "suspicious" | "banking_accounts_100",
  ) => Promise<Dataset>;
  updateRiskConfig: (cfg: Partial<RiskConfig>) => void;
  job?: Job;
  startTraining: (ds: Dataset, cfg: TrainConfig) => void;
  trainCompatibleModel: (targetDs?: Dataset) => Promise<SavedModel>;
  tab: string;
  setTab: (t: string) => void;
  focusModel?: string;
  setFocusModel: (id?: string) => void;
  selectedTransactionId?: string;
  setSelectedTransactionId: (id?: string) => void;
  modelCompatibility?: ModelCompatibilityResult;
}

const C = createContext<Ctx | null>(null);
export const useAml = () => {
  const c = useContext(C);
  if (!c) throw new Error("AmlProvider missing");
  return c;
};

// Helper: map common column name variations to canonical roles without leakage
export function mapColumnRoles(columns: string[]): Record<string, string> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const mapping: Record<string, string> = {};

  for (const c of columns) {
    const n = norm(c);
    // NEVER map ground-truth label or synthetic evaluation/origin columns to input features
    if (
      FORBIDDEN_SYNTHETIC_FEATURES.has(c.toLowerCase()) ||
      n === "risklabelsynthetic" ||
      n === "patterntypesynthetic" ||
      n === "circularflowindicatorsynthetic" ||
      n === "rapidpassthroughindicatorsynthetic" ||
      n === "dataorigin" ||
      n === "label" ||
      n === "target" ||
      n === "class" ||
      n === "fraud" ||
      n === "islaundering" ||
      n === "category"
    ) {
      if (c.toLowerCase() === "risk_label_synthetic" || n === "risklabelsynthetic") {
        mapping.label = c;
      }
      continue;
    }

    if (
      !mapping.amount &&
      (n === "amount" ||
        n === "amt" ||
        n === "value" ||
        n === "txamount" ||
        n === "paid" ||
        n === "inramount" ||
        n === "txnamount" ||
        n === "debitamount" ||
        n === "creditamount")
    ) {
      mapping.amount = c;
    } else if (
      !mapping.sender &&
      (n === "fromaccount" ||
        n === "sender" ||
        n === "from" ||
        n === "origin" ||
        n === "sourceaccount" ||
        n === "payer" ||
        n === "src" ||
        n === "remitter" ||
        n === "debitaccount" ||
        n === "payervpa" ||
        n === "fromupiid" ||
        n === "fromvpa")
    ) {
      mapping.sender = c;
    } else if (
      !mapping.receiver &&
      (n === "toaccount" ||
        n === "receiver" ||
        n === "to" ||
        n === "dest" ||
        n === "targetaccount" ||
        n === "beneficiary" ||
        n === "payee" ||
        n === "dst" ||
        n === "creditaccount" ||
        n === "payeevpa" ||
        n === "toupiid" ||
        n === "tovpa")
    ) {
      mapping.receiver = c;
    } else if (
      !mapping.payment_format &&
      (n === "paymentformat" ||
        n === "paymenttype" ||
        n === "channel" ||
        n === "format" ||
        n === "type" ||
        n === "txntype" ||
        n === "mode" ||
        n === "paymentmode" ||
        n === "instrument")
    ) {
      mapping.payment_format = c;
    } else if (
      !mapping.currency &&
      (n === "currency" || n === "curr" || n === "ccy" || n === "denom")
    ) {
      mapping.currency = c;
    } else if (
      !mapping.timestamp &&
      (n === "timestamp" ||
        n === "time" ||
        n === "date" ||
        n === "datetime" ||
        n === "ts" ||
        n === "step" ||
        n === "txndate" ||
        n === "valuedate" ||
        n === "createdat")
    ) {
      mapping.timestamp = c;
    } else if (
      !mapping.transaction_id &&
      (n === "transactionid" ||
        n === "txid" ||
        n === "txnid" ||
        n === "id" ||
        n === "hash" ||
        n === "utr" ||
        n === "refno" ||
        n === "referenceno" ||
        n === "txnref")
    ) {
      mapping.transaction_id = c;
    }
  }
  return mapping;
}

const approvedCandidates = approvedModels.candidates as unknown as SavedModel[];

export function AmlProvider({ children }: { children: ReactNode }) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [active, setActive] = useState<string>();
  const [models, setModels] = useState<SavedModel[]>([]);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult>();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string>();
  const [riskConfig, setRiskConfig] = useState<RiskConfig>(DEFAULT_RISK_CONFIG);
  const [job, setJob] = useState<Job>();
  const [tab, setTab] = useState("dashboard");
  const [focusModel, setFocusModel] = useState<string>();
  const [selectedTransactionId, setSelectedTransactionId] = useState<string>();
  const worker = useRef<Worker | null>(null);

  const updateRiskConfig = (cfg: Partial<RiskConfig>) => {
    setRiskConfig((prev) => ({ ...prev, ...cfg }));
  };

  const refreshModels = useCallback(async () => {
    const stored = await listModels();
    for (const candidate of approvedCandidates) {
      if (!stored.some((m) => m.id === candidate.id)) await saveModel(candidate);
    }
    const existing = stored.filter(
      (m) =>
        m.id !== "20261018145236_gradient_boosting" &&
        m.report.dataset !== "ibm_aml_synthetic_benchmark.csv",
    );
    const merged = [
      ...existing,
      ...approvedCandidates.filter((m) => !existing.some((s) => s.id === m.id)),
    ];
    setModels(merged);
    if (!focusModel) {
      setFocusModel(approvedModels.activeId);
    }
  }, [focusModel]);

  const loadPresetDataset = useCallback(
    async (
      type: "indian" | "international" | "ordinary" | "suspicious" | "banking_accounts_100",
    ) => {
      let csv = "";
      let name = "";
      let prov = "";
      if (type === "banking_accounts_100") {
        const response = await fetch("/synthetic_banking_accounts_100_50_risk_50_normal.csv");
        if (!response.ok) throw new Error("Approved account sample unavailable.");
        csv = await response.text();
        name = "synthetic_banking_accounts_100_50_risk_50_normal.csv";
        prov = "Synthetic training-source accounts; not independent validation";
      } else if (type === "indian") {
        csv = generateIndianBankingCsv(5000);
        name = "Indian_Core_Banking_5000_txns.csv";
        prov = "Core Indian Banking Feed (UPI / IMPS / NEFT / RTGS in INR)";
      } else if (type === "international") {
        csv = generateInternationalBankingCsv(10000);
        name = "Global_Banking_10000_txns.csv";
        prov = "International Banking Feed (SWIFT / Wire / ACH in USD/EUR)";
      } else if (type === "ordinary") {
        csv = generateOrdinaryCsv(1000);
        name = "Benign_Ordinary_1000_txns.csv";
        prov = "Everyday Consumer & Retail Feed (Zero laundering - safe validation)";
      } else {
        csv = generateSuspiciousCsv(500);
        name = "Synthetic_Crime_Patterns_500_txns.csv";
        prov = "Structured Multi-Hop & Pass-Through Mule Ring Feed";
      }

      const parsed = Papa.parse<Row>(csv, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
      });
      const columns = (parsed.meta.fields || []).filter(Boolean);
      const ds: Dataset = {
        name,
        rows: parsed.data,
        columns,
        audit: audit(parsed.data, columns, name),
        fingerprint: await fingerprint(csv.slice(0, 5_000_000)),
        provenance: prov,
        license: "Open Compliance Benchmark",
      };
      setDatasets((x) => [ds, ...x.filter((y) => y.name !== ds.name)]);
      setActive(ds.name);
      return ds;
    },
    [],
  );

  useEffect(() => {
    refreshModels();
  }, [refreshModels]);

  const clearActiveDataset = useCallback(() => {
    setDatasets([]);
    setActive(undefined);
    setAnalysisResult(undefined);
  }, []);

  const activeModel = models.find((m) => m.id === focusModel) || models[0];
  const activeDs = datasets.find((d) => d.name === active) ?? datasets[0];

  const modelCompatibility =
    activeModel && activeDs
      ? checkModelCompatibility(activeModel, activeDs.columns, mapColumnRoles(activeDs.columns))
      : undefined;

  // Direct in-browser synchronous training of a compatible model tailored for the active dataset
  const trainCompatibleModel = async (targetDs?: Dataset): Promise<SavedModel> => {
    const ds = targetDs || activeDs;
    if (!ds) throw new Error("No dataset loaded to train on.");

    const roles = { ...ds.audit.roles };
    const targetCol =
      ds.columns.find((c) => c.toLowerCase() === "risk_label_synthetic") ||
      roles.label ||
      ds.columns.find((c) => /label|class|fraud|target|is_laundering/i.test(c));

    if (!targetCol) {
      throw new Error("No target label found in dataset. Labeled column required for training.");
    }

    roles.label = targetCol;
    const assessment = assessFeatures(ds.rows, ds.columns, targetCol, roles);
    if (!assessment.eligible.length) {
      throw new Error("No eligible features available for training (all excluded or leaking).");
    }

    const cfg: TrainConfig = {
      datasetName: ds.name,
      fingerprint: ds.fingerprint,
      target: targetCol,
      roles,
      features: assessment.eligible,
      mapping: {},
      split: "stratified",
      metric: "macro_f1",
      models: ["Gradient Boosting", "Random Forest", "Logistic Regression"],
    };

    const saved = trainAll(ds.rows, ds.columns, cfg, () => {});
    await saveModel(saved);
    await refreshModels();
    setFocusModel(saved.id);
    return saved;
  };

  // ONE-CLICK ANALYSIS WORKFLOW
  const runAnalysis = async (targetDataset?: Dataset): Promise<boolean> => {
    const ds = targetDataset || activeDs;
    if (!ds) {
      setAnalyzeError("Please upload or load a transaction dataset first.");
      return false;
    }
    const modelToUse = activeModel;
    if (!modelToUse) {
      setAnalyzeError("No trained AML model is currently available.");
      return false;
    }

    // Step 1: Check compatibility. Do not silently use an incompatible model!
    const roleMap = mapColumnRoles(ds.columns);
    const compat = checkModelCompatibility(modelToUse, ds.columns, roleMap);
    if (!compat.compatible) {
      setAnalyzeError(compat.reasons.join(" "));
      return false;
    }

    setAnalyzeError(undefined);
    setIsAnalyzing(true);

    try {
      const rows = ds.rows;
      if (!rows.length) throw new Error("Uploaded transaction file contains no data rows.");

      // 2. Prepare rows cleanly without injecting false mule accounts or predictive leakage
      const preparedRows = rows.map((r) => prepareInferenceRow(r, modelToUse, roleMap));

      // 3. Graph Analytics across the uploaded batch (TASK 4 & Requirement 9: Do not invent circular transaction loops)
      let gData = null;
      if (
        roleMap.sender &&
        roleMap.receiver &&
        roleMap.amount &&
        roleMap.timestamp &&
        roleMap.transaction_id
      ) {
        gData = graphSummary(preparedRows, "from_account", "to_account", "amount", "timestamp");
      }

      // Check if any accounts participate in suspicious cycles
      const cycleAccountSet = new Set<string>();
      if (gData && gData.analyzedCycles) {
        gData.analyzedCycles
          .filter((c) => c.isSuspicious)
          .forEach((c) => {
            c.path.forEach((acc) => cycleAccountSet.add(acc));
          });
      }

      // 4. Model Predictions generated independently without ground-truth labels
      const probas = pipelineProba(modelToUse.prep, modelToUse.model, preparedRows);

      // 5. Local Explanations for sample
      const sampleSize = Math.min(preparedRows.length, 250);
      const explanations = localExplain(modelToUse, preparedRows.slice(0, sampleSize), 5);

      // 6. Risk Decisions & Stratification
      let flaggedCount = 0;
      let highRiskCount = 0;
      let classifiedCount = 0;
      let unclassifiedCount = 0;

      const categoryBreakdown: Record<string, number> = {};
      const riskScoresList: number[] = [];

      const scoredRecords: ScoredTransaction[] = preparedRows.map((r, i) => {
        const p = probas[i] || [];
        const issue = inferenceIssue(modelToUse, r);
        const predIdx = issue ? -1 : argmax(p);
        const maxProb = predIdx >= 0 ? (p[predIdx] ?? 0) : 0;
        let predClass =
          predIdx >= 0 ? modelToUse.classes[predIdx] || "Unknown" : "Unable to classify";

        const probList = modelToUse.classes
          .map((cls, idx) => ({
            label: cls,
            prob: p[idx] ?? 0,
          }))
          .sort((a, b) => b.prob - a.prob);

        // Graph context for this transaction
        const sAccount = r.from_account;
        const rAccount = r.to_account;
        const sStat = gData?.accounts.find((t) => t.account === sAccount);
        const rStat = gData?.accounts.find((t) => t.account === rAccount);
        const inSuspCycle = cycleAccountSet.has(sAccount) || cycleAccountSet.has(rAccount);

        const riskEval = evaluateTransactionRisk(
          r,
          predClass,
          maxProb,
          probList,
          {
            senderStat: sStat,
            receiverStat: rStat,
            inSuspiciousCycle: inSuspCycle,
            cycleEvidence: inSuspCycle
              ? "Participant in detected high-risk circular layering ring"
              : undefined,
          },
          riskConfig,
        );

        if (riskEval.classificationStatus === "UNABLE_TO_CLASSIFY") {
          predClass = "Unable to classify";
          unclassifiedCount++;
        } else {
          classifiedCount++;
        }

        categoryBreakdown[predClass] = (categoryBreakdown[predClass] || 0) + 1;
        if (!issue && riskEval.classificationStatus === "CLASSIFIED")
          riskScoresList.push(riskEval.riskScore);

        if (riskEval.isSuspicious) {
          flaggedCount++;
        }
        if (riskEval.riskLevel === "HIGH") {
          highRiskCount++;
        }

        const exp = i < sampleSize ? explanations[i] || [] : [];

        return {
          ...r,
          _row_id: r.transaction_id || `row_${i + 1}`,
          _predicted_class: predClass,
          _confidence: maxProb,
          _risk_score: riskEval.riskScore,
          _risk_level: riskEval.riskLevel,
          _is_suspicious: riskEval.isSuspicious,
          _status: riskEval.classificationStatus,
          _reliability: riskEval.reliability,
          _evidence_notes: issue || riskEval.evidenceNotes,
          _probabilities: issue ? [] : probList,
          _explanations: issue ? [] : exp,
        };
      });

      // 7. Count risk and normal predictions actually produced by the model (DO NOT FORCE 50)
      let riskPredictionsCount = 0;
      let normalPredictionsCount = 0;
      for (const rec of scoredRecords) {
        const clsLower = rec._predicted_class.toLowerCase().trim();
        if (
          clsLower === "risk" ||
          clsLower === "high_risk" ||
          isSuspiciousClass(rec._predicted_class, riskConfig)
        ) {
          riskPredictionsCount++;
        } else if (
          clsLower === "normal" ||
          clsLower === "benign" ||
          clsLower === "standard" ||
          clsLower === "standard personal" ||
          clsLower === "commercial & merchant"
        ) {
          normalPredictionsCount++;
        }
      }

      // 8. Compare predictions with synthetic labels ONLY AFTER predictions have been generated independently
      let evaluationVsGroundTruth: GroundTruthEvaluation | undefined = undefined;
      const groundTruthCol =
        ds.columns.find((c) => c.toLowerCase() === "risk_label_synthetic") ||
        (ds.audit.roles.label && ds.audit.roles.label !== modelToUse.target
          ? ds.audit.roles.label
          : undefined);

      if (groundTruthCol && ds.fingerprint !== modelToUse.report.fingerprint) {
        let tr = 0,
          fr = 0,
          tn = 0,
          fn = 0;
        let evaluatedCount = 0;
        rows.forEach((origRow, i) => {
          const trueVal = String(origRow[groundTruthCol] ?? "")
            .toLowerCase()
            .trim();
          const predVal = String(scoredRecords[i]._predicted_class ?? "")
            .toLowerCase()
            .trim();
          if (
            !trueVal ||
            scoredRecords[i]._status !== "CLASSIFIED" ||
            !modelToUse.classes.some((c) => c.toLowerCase() === trueVal)
          )
            return;
          evaluatedCount++;
          const isTrueRisk =
            trueVal === "risk" || trueVal === "1" || isSuspiciousClass(trueVal, riskConfig);
          const isPredRisk =
            predVal === "risk" || predVal === "1" || isSuspiciousClass(predVal, riskConfig);
          if (isTrueRisk && isPredRisk) tr++;
          else if (!isTrueRisk && isPredRisk) fr++;
          else if (!isTrueRisk && !isPredRisk) tn++;
          else if (isTrueRisk && !isPredRisk) fn++;
        });

        if (evaluatedCount > 0) {
          const acc = (tr + tn) / evaluatedCount;
          const prec = tr + fr > 0 ? tr / (tr + fr) : 0;
          const rec = tr + fn > 0 ? tr / (tr + fn) : 0;
          const f1 = prec + rec > 0 ? (2 * prec * rec) / (prec + rec) : 0;
          evaluationVsGroundTruth = {
            targetColumn: groundTruthCol,
            n: evaluatedCount,
            accuracy: +acc.toFixed(4),
            precision: +prec.toFixed(4),
            recall: +rec.toFixed(4),
            f1: +f1.toFixed(4),
            confusionMatrix: {
              trueRisk: tr,
              falseRisk: fr,
              trueNormal: tn,
              falseNormal: fn,
            },
          };
        }
      }

      // Compute risk score distribution histogram buckets (TASK 6)
      const buckets = [
        { range: "0.00 - 0.20 (Low)", count: riskScoresList.filter((s) => s < 0.2).length },
        {
          range: "0.20 - 0.40 (Low-Med)",
          count: riskScoresList.filter((s) => s >= 0.2 && s < 0.4).length,
        },
        {
          range: "0.40 - 0.60 (Moderate)",
          count: riskScoresList.filter((s) => s >= 0.4 && s < 0.6).length,
        },
        {
          range: "0.60 - 0.80 (Elevated)",
          count: riskScoresList.filter((s) => s >= 0.6 && s < 0.8).length,
        },
        { range: "0.80 - 1.00 (Critical)", count: riskScoresList.filter((s) => s >= 0.8).length },
      ];

      const result: AnalysisResult = {
        analyzedAt: new Date().toISOString(),
        datasetName: ds.name,
        totalTransactions: preparedRows.length,
        classifiedCount,
        unclassifiedCount,
        flaggedCount,
        highRiskCount,
        flaggedPct: +((100 * flaggedCount) / Math.max(preparedRows.length, 1)).toFixed(1),
        riskPredictionsCount,
        normalPredictionsCount,
        modelUsed: modelToUse.name,
        modelId: modelToUse.id,
        records: scoredRecords,
        graphData: gData,
        classes: modelToUse.classes,
        categoryBreakdown,
        riskBuckets: buckets,
        evaluationVsGroundTruth,
        compatibility: compat,
      };

      setAnalysisResult(result);
      if (scoredRecords[0]) {
        setSelectedTransactionId(scoredRecords[0]._row_id);
      }
      return true;
    } catch (err) {
      console.error("Analysis failed:", err);
      setAnalyzeError((err as Error).message);
      return false;
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Model training worker handler
  const startTraining = (ds: Dataset, cfg: TrainConfig) => {
    worker.current?.terminate();
    const w = new Worker(new URL("../../lib/aml/train.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    const started = Date.now();
    setJob({ status: "running", started, events: [], config: cfg });
    w.onmessage = async (e) => {
      const m = e.data;
      if (m.type === "progress") {
        setJob(
          (j) =>
            j && {
              ...j,
              events: [...j.events, { t: (Date.now() - started) / 1000, ...m.ev }],
              current: m.ev.event === "model_start" ? m.ev.model : j.current,
              info: m.ev.info ?? j.info,
            },
        );
      } else if (m.type === "done") {
        try {
          await saveModel(m.saved);
          await refreshModels();
          setFocusModel(m.saved.id);
          setJob(
            (j) =>
              j && {
                ...j,
                status: "completed",
                ended: Date.now(),
                current: undefined,
                modelId: m.saved.id,
                events: [
                  ...j.events,
                  {
                    t: (Date.now() - started) / 1000,
                    event: "saved",
                    detail: "stored in this browser",
                  },
                ],
              },
          );
        } catch (err) {
          setJob(
            (j) =>
              j && { ...j, status: "failed", ended: Date.now(), error: (err as Error).message },
          );
        }
        w.terminate();
      } else if (m.type === "error") {
        setJob(
          (j) =>
            j && { ...j, status: "failed", ended: Date.now(), current: undefined, error: m.error },
        );
        w.terminate();
      }
    };
    w.onerror = (e) =>
      setJob(
        (j) =>
          j && { ...j, status: "failed", ended: Date.now(), error: e.message || "Worker crashed" },
      );
    w.postMessage({ rows: ds.rows, columns: ds.columns, config: cfg });
  };

  return (
    <C.Provider
      value={{
        datasets,
        addDataset: (d) => {
          setDatasets((x) => [d, ...x.filter((y) => y.name !== d.name)]);
          setActive(d.name);
        },
        clearActiveDataset,
        activeDs,
        setActiveDs: setActive,
        models,
        activeModel,
        refreshModels,
        removeModel: async (id) => {
          await deleteModel(id);
          await refreshModels();
        },
        analysisResult,
        isAnalyzing,
        analyzeError,
        runAnalysis,
        riskConfig,
        loadPresetDataset,
        updateRiskConfig,
        job,
        startTraining,
        tab,
        setTab,
        focusModel,
        setFocusModel,
        selectedTransactionId,
        setSelectedTransactionId,
      }}
    >
      {children}
    </C.Provider>
  );
}
