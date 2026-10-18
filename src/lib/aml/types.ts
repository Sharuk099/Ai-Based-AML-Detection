export type Row = Record<string, string>;
export type Roles = Partial<Record<"transaction_id" | "sender" | "receiver" | "amount" | "timestamp" | "label", string>>;
export const INTENDED_CATEGORIES = [
  "Blackmail", "Cyber-Security Service", "Darknet Market", "Centralized Exchange", "P2P Financial Services", "Gambling",
  "Government Criminal Blacklist", "Money Laundering", "Ponzi Scheme", "Mining Pool", "Tumbler", "Individual Wallet",
];
export const INDICATORS = { fanThreshold: 10, passthroughRatio: 0.9, velocityPerDay: 20, maxCycleLen: 4, maxCycles: 200 };
export const MIN_CLASS_COUNT = 5;
export const MAX_TRAIN_ROWS = 20000;
export const MAX_STACK_ROWS = 8000;
export type SelectionMetric = "macro_f1" | "balanced_accuracy" | "recall_macro" | "roc_auc";
export type SplitStrategy = "stratified" | "chronological" | "group";
export type ModelName = "Gradient Boosting" | "Stacking" | "Logistic Regression" | "Random Forest" | "CNN";
export interface TrainConfig {
  datasetName: string; fingerprint: string; target: string; roles: Roles; features: string[];
  mapping: Record<string, string>; split: SplitStrategy; metric: SelectionMetric; models: ModelName[];
}
