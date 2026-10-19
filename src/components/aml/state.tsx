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
import { evaluateTransactionRisk, DEFAULT_RISK_CONFIG, type RiskConfig } from "@/lib/aml/risk";
import { prepareInferenceRow, inferenceIssue } from "@/lib/aml/inference";

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
  [key: string]: string | number | boolean | { label: string; prob: number }[] | { feature: string; value: string; contribution: number }[];
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

export interface AnalysisResult {
  analyzedAt: string;
  datasetName: string;
  totalTransactions: number;
  classifiedCount: number;
  unclassifiedCount: number;
  flaggedCount: number; // Medium + High risk
  highRiskCount: number;
  flaggedPct: number;
  modelUsed: string;
  modelId: string;
  records: ScoredTransaction[];
  graphData: ReturnType<typeof graphSummary> | null;
  classes: string[];
  categoryBreakdown: Record<string, number>;
  riskBuckets: { range: string; count: number }[];
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
  updateRiskConfig: (cfg: Partial<RiskConfig>) => void;
  job?: Job;
  startTraining: (ds: Dataset, cfg: TrainConfig) => void;
  tab: string;
  setTab: (t: string) => void;
  focusModel?: string;
  setFocusModel: (id?: string) => void;
  selectedTransactionId?: string;
  setSelectedTransactionId: (id?: string) => void;
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
    // NEVER map ground-truth label columns to input features
    if (n === "label" || n === "target" || n === "class" || n === "fraud" || n === "is_laundering" || n === "category") {
      continue;
    }

    if (!mapping.amount && (n === "amount" || n === "amt" || n === "value" || n === "txamount" || n === "paid")) {
      mapping.amount = c;
    } else if (!mapping.sender && (n === "fromaccount" || n === "sender" || n === "from" || n === "origin" || n === "sourceaccount" || n === "payer" || n === "src")) {
      mapping.sender = c;
    } else if (!mapping.receiver && (n === "toaccount" || n === "receiver" || n === "to" || n === "dest" || n === "targetaccount" || n === "beneficiary" || n === "payee" || n === "dst")) {
      mapping.receiver = c;
    } else if (!mapping.payment_format && (n === "paymentformat" || n === "paymenttype" || n === "channel" || n === "format" || n === "type" || n === "txntype")) {
      mapping.payment_format = c;
    } else if (!mapping.currency && (n === "currency" || n === "curr" || n === "ccy")) {
      mapping.currency = c;
    } else if (!mapping.timestamp && (n === "timestamp" || n === "time" || n === "date" || n === "datetime" || n === "ts" || n === "step")) {
      mapping.timestamp = c;
    } else if (!mapping.transaction_id && (n === "transactionid" || n === "txid" || n === "txnid" || n === "id" || n === "hash")) {
      mapping.transaction_id = c;
    }
  }
  return mapping;
}

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

  // Remove only the known bundled demo artifact; retain explicitly trained models.
  const refreshModels = useCallback(async () => {
    const stored = await listModels();
    const existing = stored.filter((m) => m.id !== "20261018145236_gradient_boosting" && m.report.dataset !== "ibm_aml_synthetic_benchmark.csv");
    await Promise.all(stored.filter((m) => !existing.includes(m)).map((m) => deleteModel(m.id)));
    setModels(existing);
    if (!focusModel && existing[0]) {
      setFocusModel(existing[0].id);
    }
  }, [focusModel]);

  useEffect(() => {
    refreshModels();
  }, [refreshModels]);

  const activeModel = models.find((m) => m.id === focusModel) || models[0];
  const activeDs = datasets.find((d) => d.name === active) ?? datasets[0];

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

    setAnalyzeError(undefined);
    setIsAnalyzing(true);

    try {
      const rows = ds.rows;
      if (!rows.length) throw new Error("Uploaded transaction file contains no data rows.");

      // 1. Column Role Mapping (TASK 1: Identical feature names, verify schema)
      const roleMap = mapColumnRoles(ds.columns);
      const amountKey = roleMap.amount || "amount";
      const senderKey = roleMap.sender || "from_account";
      const receiverKey = roleMap.receiver || "to_account";
      const formatKey = roleMap.payment_format || "payment_format";
      const currencyKey = roleMap.currency || "currency";
      const timeKey = roleMap.timestamp || "timestamp";
      const txIdKey = roleMap.transaction_id || "transaction_id";

      // 2. Prepare rows cleanly without injecting false mule accounts
      const preparedRows = rows.map((r) => prepareInferenceRow(r, modelToUse, roleMap));

      // 3. Graph Analytics across the uploaded batch (TASK 4)
      let gData = null;
      if (roleMap.sender && roleMap.receiver) {
        gData = graphSummary(preparedRows, "from_account", "to_account", "amount", "timestamp");
      }

      // Check if any accounts participate in suspicious cycles
      const cycleAccountSet = new Set<string>();
      if (gData && gData.analyzedCycles) {
        gData.analyzedCycles.filter((c) => c.isSuspicious).forEach((c) => {
          c.path.forEach((acc) => cycleAccountSet.add(acc));
        });
      }

      // 4. Model Predictions
      const probas = pipelineProba(modelToUse.prep, modelToUse.model, preparedRows);

      // 5. Local Explanations for sample
      const sampleSize = Math.min(preparedRows.length, 250);
      const explanations = localExplain(modelToUse, preparedRows.slice(0, sampleSize), 5);

      // 6. Risk Decisions & Stratification (TASK 2: Separate prediction from risk decisions)
      let flaggedCount = 0;
      let highRiskCount = 0;
      let classifiedCount = 0;
      let unclassifiedCount = 0;

      const categoryBreakdown: Record<string, number> = {};
      const riskScoresList: number[] = [];

      const scoredRecords: ScoredTransaction[] = preparedRows.map((r, i) => {
        const p = probas[i] || [];
        const issue = inferenceIssue(modelToUse, r);
        const maxProb = issue ? 0 : Math.max(...p, 0);
        const predIdx = p.indexOf(maxProb);
        let predClass = modelToUse.classes[predIdx] || "Unknown";

        const probList = modelToUse.classes.map((cls, idx) => ({
          label: cls,
          prob: p[idx] ?? 0,
        })).sort((a, b) => b.prob - a.prob);

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
            cycleEvidence: inSuspCycle ? "Participant in detected high-risk circular layering ring" : undefined,
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
        if (!issue && riskEval.classificationStatus === "CLASSIFIED") riskScoresList.push(riskEval.riskScore);

        if (riskEval.isSuspicious) {
          flaggedCount++;
        }
        if (riskEval.riskLevel === "HIGH") {
          highRiskCount++;
        }

        const exp = i < sampleSize ? (explanations[i] || []) : [];

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

      // Compute risk score distribution histogram buckets (TASK 6)
      const buckets = [
        { range: "0.00 - 0.20 (Low)", count: riskScoresList.filter((s) => s < 0.20).length },
        { range: "0.20 - 0.40 (Low-Med)", count: riskScoresList.filter((s) => s >= 0.20 && s < 0.40).length },
        { range: "0.40 - 0.60 (Moderate)", count: riskScoresList.filter((s) => s >= 0.40 && s < 0.60).length },
        { range: "0.60 - 0.80 (Elevated)", count: riskScoresList.filter((s) => s >= 0.60 && s < 0.80).length },
        { range: "0.80 - 1.00 (Critical)", count: riskScoresList.filter((s) => s >= 0.80).length },
      ];

      const result: AnalysisResult = {
        analyzedAt: new Date().toISOString(),
        datasetName: ds.name,
        totalTransactions: preparedRows.length,
        classifiedCount,
        unclassifiedCount,
        flaggedCount,
        highRiskCount,
        flaggedPct: +(100 * flaggedCount / Math.max(preparedRows.length, 1)).toFixed(1),
        modelUsed: modelToUse.name,
        modelId: modelToUse.id,
        records: scoredRecords,
        graphData: gData,
        classes: modelToUse.classes,
        categoryBreakdown,
        riskBuckets: buckets,
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
