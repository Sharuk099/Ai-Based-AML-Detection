import { useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Database,
  Cpu,
  Network,
  Scale,
  HelpCircle,
  FileSpreadsheet,
  Layers,
  ArrowRight,
  ShieldAlert,
  Info,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Panel, Note, Chip, DataTable } from "./ui";

export function WorkflowGuideModal() {
  const [open, setOpen] = useState(false);

  const workflowSteps = [
    {
      step: 1,
      title: "Upload Transaction CSV",
      icon: Upload,
      desc: "Investigator uploads real banking transaction ledgers or pre-aggregated account profiles.",
      details: [
        "Transaction IDs, source & destination accounts, amounts, currencies, timestamps, payment instruments.",
        "Zero-cloud security: All CSV data stays strictly inside the local browser sandbox; no external uploads.",
        "Cryptographic SHA-256 integrity hash is computed immediately upon ingestion.",
      ],
    },
    {
      step: 2,
      title: "Validate & Clean Data",
      icon: Database,
      desc: "Automated schema inspection, duplicate detection, and missing value verification.",
      details: [
        "Checks for duplicated transactions or duplicate account entities across splits.",
        "Validates numeric amounts, positive balances, ISO timestamps, and currency consistency.",
        "Refuses fabricated defaults: If required features are absent, records are marked INSUFFICIENT_EVIDENCE rather than generating misleading predictions.",
      ],
    },
    {
      step: 3,
      title: "Prepare Model Features",
      icon: Layers,
      desc: "Computes behavioral metrics and account summaries from transaction logs.",
      details: [
        "Transaction frequency (txn_count_monthly) and turnover (monthly_inflow, monthly_outflow, in_out_ratio).",
        "Payment-channel ratios: Cash deposit proportion, international transaction ratio, and night/off-hours activity ratio.",
        "Preprocessing uses frozen training statistics (medians/scalers) so batch size cannot alter feature weights.",
      ],
    },
    {
      step: 4,
      title: "Dual-Engine Analysis (4A & 4B)",
      icon: Cpu,
      desc: "Simultaneous machine learning classification and directed graph network traversal.",
      details: [
        "4A. ML Screening: Pre-trained Gradient Boosting & Stacking classifiers estimate baseline anomaly probability.",
        "4B. Graph & Rules Engine: Detects structural topologies including circular fund loops (A→B→C→A), rapid pass-through conduit accounts, high-velocity bursts, and fan-in/fan-out hubs.",
      ],
    },
    {
      step: 5,
      title: "Combine Evidence",
      icon: Scale,
      desc: "Multi-source evidence synthesis without double-counting identical indicators.",
      details: [
        "Fuses ML anomaly score, amount structuring rules ($9k-$9.9k USD CTR / ₹45k-₹49.9k INR PAN limits), and graph indicators.",
        "Applies configurable decision thresholds (Low < 30%, Medium 30-70%, High ≥ 70%) to prioritize investigator caseloads.",
      ],
    },
    {
      step: 6,
      title: "Explain the Result",
      icon: HelpCircle,
      desc: "Local feature attribution, transaction citations, and clear plain-English reasons.",
      details: [
        "Feature contribution waterfalls: Shows exact mathematical factors driving the score up or down.",
        "Cited evidence: Displays involved transaction IDs, counterparties, timestamps, and statutory limits.",
      ],
    },
    {
      step: 7,
      title: "Results & Investigation",
      icon: FileSpreadsheet,
      desc: "Investigator triaging, interactive graph drill-down, and compliance reporting.",
      details: [
        "Interactive decision logging: Investigators mark cases as 'Dismiss (False Positive)', 'Under Review', or 'Escalate to SAR'.",
        "Downloadable audit artifacts: Export structured compliance investigation reports in JSON or CSV.",
      ],
    },
  ];

  const dataFields = [
    {
      name: "transaction_id",
      purpose: "Trace and cite each specific transaction in audit reports",
    },
    {
      name: "timestamp",
      purpose: "Detect rapid velocity transfers, dormant spikes, and unusual timing",
    },
    {
      name: "from_account",
      purpose: "Identify sender account for directed graph edge construction",
    },
    {
      name: "to_account",
      purpose: "Identify receiver account for directed graph edge construction",
    },
    { name: "amount", purpose: "Analyze money flow sizes and regulatory structuring thresholds" },
    { name: "currency", purpose: "Interpret statutory CTR thresholds (USD vs INR vs EUR)" },
    {
      name: "payment_format",
      purpose: "Assess channel risk (Cash, Crypto, Wire, UPI, IMPS, RTGS)",
    },
    { name: "customer_type", purpose: "Individual, SMB, or Corporate baseline activity profiling" },
    {
      name: "account_age_months",
      purpose: "Measure account tenure to flag dormant account awakenings",
    },
    { name: "avg_balance", purpose: "Compare transaction turnover relative to historical capital" },
    { name: "monthly_inflow", purpose: "Measure incoming velocity and aggregation hubs" },
    { name: "monthly_outflow", purpose: "Measure outgoing disbursement and conduit pass-through" },
    { name: "in_out_ratio", purpose: "Flag high-conduit pass-through accounts (turnover ~ 1.0)" },
    { name: "txn_count_monthly", purpose: "Identify high-frequency transaction surges" },
    {
      name: "cash_deposit_ratio",
      purpose: "Detect cash smurfing and physical structuring behavior",
    },
    {
      name: "international_tx_ratio",
      purpose: "Analyze cross-border and offshore shell jurisdiction flow",
    },
    {
      name: "night_activity_ratio",
      purpose: "Detect off-hours automated bot or laundering velocity",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-8 font-mono border-primary/40 text-primary hover:bg-primary/10 gap-1.5 shadow-sm"
        >
          <BookOpen className="h-3.5 w-3.5" />
          <span>Workflow Guide</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto p-6 font-sans">
        <DialogHeader className="border-b border-border/80 pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10 text-primary border border-primary/30">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                AI Anti-Money Laundering Detection System · Architecture & Workflow Guide
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                Complete 7-stage screening pipeline, data schemas, and compliance investigation
                methodology
              </p>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="workflow" className="mt-4">
          <TabsList className="grid grid-cols-4 w-full bg-muted/60 p-1 font-mono text-xs">
            <TabsTrigger value="workflow">1. Complete Workflow</TabsTrigger>
            <TabsTrigger value="evidence">2. 3-Pillar Evidence</TabsTrigger>
            <TabsTrigger value="data">3. Data & Schema</TabsTrigger>
            <TabsTrigger value="categories">4. 12 Categories Policy</TabsTrigger>
          </TabsList>

          {/* TAB 1: 7-STEP COMPLETE WORKFLOW */}
          <TabsContent value="workflow" className="space-y-4 pt-3">
            <div className="bg-primary/5 border border-primary/30 rounded-lg p-3 text-xs leading-relaxed text-muted-foreground">
              <strong className="text-foreground block mb-1">Investigation Objective:</strong>
              The objective of this application is not to label every unusual transaction as money
              laundering. It is to identify potentially suspicious activity accurately, minimize
              false alerts, and provide transparent, explainable evidence so human compliance
              investigators can make defensible SAR determinations.
            </div>

            <div className="grid gap-3">
              {workflowSteps.map((s) => {
                const Icon = s.icon;
                return (
                  <div
                    key={s.step}
                    className="panel p-3.5 flex items-start gap-3 border-border/80 bg-card/60 transition-all hover:border-primary/50"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-primary/10 text-primary font-mono font-bold text-xs border border-primary/30">
                      {s.step}
                    </div>
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary" />
                        <span className="font-bold text-xs text-foreground">{s.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{s.desc}</p>
                      <ul className="list-disc list-inside text-[11px] text-muted-foreground/90 space-y-0.5">
                        {s.details.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* TAB 2: 3-PILLAR EVIDENCE ENGINE */}
          <TabsContent value="evidence" className="space-y-4 pt-3">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="panel p-4 space-y-2 border-border bg-card/60">
                <div className="flex items-center gap-2 text-primary font-bold text-xs">
                  <Cpu className="h-4 w-4" />
                  <span>1. Machine Learning Prediction</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Trained Gradient Boosting and Stacking models estimate anomaly probability based
                  on account profiles. Models are trained offline to preserve inference isolation;
                  uploaded investigator data cannot alter feature weights.
                </p>
                <div className="text-[11px] font-mono text-muted-foreground border-t border-border/60 pt-2">
                  Validation gate: Stacking is deployed only when it objectively outperforms
                  individual models on unseen held-out validation.
                </div>
              </div>

              <div className="panel p-4 space-y-2 border-border bg-card/60">
                <div className="flex items-center gap-2 text-primary font-bold text-xs">
                  <Network className="h-4 w-4" />
                  <span>2. Transaction Graph Analytics</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Constructs directed counterparty networks to identify multi-hop circular fund
                  layering (A→B→C→A), fan-in consolidation hubs, fan-out distribution conduits, and
                  rapid pass-through velocity.
                </p>
                <div className="text-[11px] font-mono text-muted-foreground border-t border-border/60 pt-2">
                  Structural isolation: Flags circular flow loops only when complete verified
                  counterparty hops are mathematically confirmed.
                </div>
              </div>

              <div className="panel p-4 space-y-2 border-border bg-card/60">
                <div className="flex items-center gap-2 text-primary font-bold text-xs">
                  <Scale className="h-4 w-4" />
                  <span>3. Explainability & Risk Policy</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Combines model output with statutory cash structuring limits ($10k CTR / ₹50k PAN)
                  without double-counting. Assigns review priority and displays contributing
                  features for every transaction.
                </p>
                <div className="text-[11px] font-mono text-muted-foreground border-t border-border/60 pt-2">
                  Investigator discretion: High-risk scores represent review priority heuristics,
                  not verified criminal accusations.
                </div>
              </div>
            </div>

            <Note kind="warn">
              <strong>Anti-Double Counting Rule:</strong> A transaction flagged for structuring in
              cash ratio is not penalized twice for amount threshold triggers. Evidence weights are
              calibrated to prevent false alert inflation.
            </Note>
          </TabsContent>

          {/* TAB 3: DATA & SCHEMA REQUIREMENTS */}
          <TabsContent value="data" className="space-y-4 pt-3">
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-foreground">
                Standard 18-Column Banking Schema
              </h4>
              <p className="text-xs text-muted-foreground">
                The application supports transaction ledgers (Format A) and pre-aggregated account
                profiles (Format B). Columns are automatically verified upon upload.
              </p>
            </div>

            <div className="overflow-x-auto max-h-[380px] border border-border/80 rounded-lg">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-muted/80 sticky top-0 border-b border-border">
                  <tr>
                    <th className="p-2.5 font-bold text-foreground">Field Name</th>
                    <th className="p-2.5 font-bold text-foreground">Investigative Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {dataFields.map((f) => (
                    <tr key={f.name} className="hover:bg-muted/30">
                      <td className="p-2.5 font-semibold text-primary">{f.name}</td>
                      <td className="p-2.5 text-muted-foreground">{f.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Note kind="info">
              <strong>Handling Incompatible Schemas:</strong> If an uploaded CSV does not supply the
              minimum required counterparty identifiers or financial values, the app clearly marks
              records as <code>UNABLE_TO_CLASSIFY</code> rather than fabricating unsupported default
              values.
            </Note>
          </TabsContent>

          {/* TAB 4: 12 CATEGORIES POLICY */}
          <TabsContent value="categories" className="space-y-4 pt-3">
            <div className="panel p-4 space-y-3 bg-card/60 border-border">
              <h4 className="text-xs font-bold text-foreground flex items-center gap-2">
                <Scale className="h-4 w-4 text-primary" />
                <span>Entity Classification vs. Suspicious Activity Screening</span>
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                A critical compliance principle is that entity types and criminal offenses represent
                fundamentally different categories:
              </p>
              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div className="p-3 rounded border border-border bg-card/40 space-y-1">
                  <span className="font-semibold text-foreground block">Entity Classification</span>
                  <p className="text-muted-foreground text-[11px]">
                    Categories such as <em>"Centralized Exchange"</em>, <em>"Individual Wallet"</em>
                    , or <em>"Gambling"</em> describe the legal nature of the account holder or
                    merchant service.
                  </p>
                </div>
                <div className="p-3 rounded border border-border bg-card/40 space-y-1">
                  <span className="font-semibold text-destructive block">
                    Suspicious Activity Screening
                  </span>
                  <p className="text-muted-foreground text-[11px]">
                    Labels such as <em>"Money Laundering"</em>, <em>"Structuring"</em>, or{" "}
                    <em>"Mule Pass-Through"</em> describe suspected illegal transactional behavior.
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>Policy Enforcement:</strong> The system does not force benign transactions
                into one of the 12 categories if the underlying data only supports binary normal vs.
                suspicious screening. Supported classifications are explicitly disclosed.
              </p>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-border/80 bg-muted/30 text-xs font-mono">
              <span className="text-muted-foreground">
                Supported Supervised Target in Active Model:
              </span>
              <Chip tone="ok">risk_label_synthetic (normal / risk)</Chip>
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-4 pt-3 border-t border-border/80 flex items-center justify-between text-xs font-mono text-muted-foreground">
          <span>Human-in-the-Loop Protocol Enforced</span>
          <Button size="sm" onClick={() => setOpen(false)} className="text-xs">
            Close Guide
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
