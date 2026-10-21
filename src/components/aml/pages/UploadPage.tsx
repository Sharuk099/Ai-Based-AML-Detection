import { useRef, useState, useMemo } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Database,
  FileText,
  Trash2,
  Download,
  Check,
  HelpCircle,
  Shield,
  Layers,
} from "lucide-react";
import Papa from "papaparse";
import { useAml } from "../state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, Note, Chip, DataTable, Stat } from "../ui";
import { audit, fingerprint } from "@/lib/aml/audit";
import type { Row } from "@/lib/aml/types";

export function UploadPage() {
  const { addDataset, clearActiveDataset, activeDs, setTab } = useAml();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [provenance, setProvenance] = useState("");
  const [license, setLicense] = useState("");

  const ingestFile = async (text: string, filename: string, prov: string, lic: string) => {
    setError(undefined);
    setBusy(true);
    try {
      if (!filename.toLowerCase().endsWith(".csv")) {
        throw new Error(`File "${filename}" must be a .csv file.`);
      }
      if (!text.trim()) {
        throw new Error("Uploaded file is empty.");
      }
      const parsed = Papa.parse<Row>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
      });
      if (parsed.errors.length) throw new Error(`Invalid CSV: ${parsed.errors[0]?.message}`);
      const columns = (parsed.meta.fields || []).filter(Boolean);
      if (columns.length < 2) {
        throw new Error("CSV must contain at least 2 columns.");
      }
      if (!parsed.data.length) {
        throw new Error("CSV has headers but no data rows.");
      }

      const ds = {
        name: filename,
        rows: parsed.data,
        columns,
        audit: audit(parsed.data, columns, filename),
        fingerprint: await fingerprint(text.slice(0, 5_000_000)),
        provenance: prov || "Investigator Upload",
        license: lic || "Internal Compliance Review",
      };

      addDataset(ds);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await ingestFile(text, file.name, provenance, license);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const text = await file.text();
    await ingestFile(text, file.name, provenance, license);
  };

  const downloadTemplate = (format: "transaction" | "account") => {
    let csvContent = "";
    let filename = "";
    if (format === "transaction") {
      filename = "aml_transaction_log_template.csv";
      csvContent =
        "transaction_id,from_account,to_account,amount,currency,payment_format,timestamp\n" +
        "TXN_1001,ACC_1001,ACC_1002,15000.00,USD,Wire,2026-03-01 10:15:00\n" +
        "TXN_1002,ACC_1002,ACC_1003,14800.00,USD,Wire,2026-03-01 10:45:00\n" +
        "TXN_1003,ACC_1004,ACC_1005,9500.00,USD,Cash,2026-03-01 11:20:00\n" +
        "TXN_1004,ACC_1004,ACC_1006,9800.00,USD,Cash,2026-03-01 11:35:00\n" +
        "TXN_1005,ACC_1007,ACC_1008,250.00,USD,ACH,2026-03-01 12:00:00\n";
    } else {
      filename = "aml_account_profile_template.csv";
      csvContent =
        "account_id,customer_type,inflow,outflow,balance,pass_through_ratio,tx_count\n" +
        "ACC_8001,Corporate,250000.00,248000.00,2000.00,0.992,14\n" +
        "ACC_8002,Individual,15000.00,12000.00,3000.00,0.800,4\n" +
        "ACC_8003,Retail,4200.00,1800.00,2400.00,0.428,2\n" +
        "ACC_8004,Corporate,1200000.00,1190000.00,10000.00,0.991,28\n";
    }
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const detectedFormat = useMemo(() => {
    if (!activeDs) return null;
    const cols = activeDs.columns.map((c) => c.toLowerCase());
    const hasSource = cols.some((c) => /from|sender|source|originator/i.test(c));
    const hasTarget = cols.some((c) => /to|receiver|dest|beneficiary/i.test(c));
    const hasAccountId = cols.some((c) => /account_id|accountid|acc_id|account/i.test(c));

    if (hasSource && hasTarget) {
      return {
        type: "transaction_log" as const,
        label: "Transaction Log Format",
        desc: "Individual peer-to-peer transaction stream. In-browser pipeline will dynamically aggregate counterparty velocity and construct graph topology.",
        badgeTone: "ok" as const,
      };
    } else if (hasAccountId) {
      return {
        type: "account_profile" as const,
        label: "Account Profile Format",
        desc: "Pre-aggregated account-level summaries. Direct evaluation against trained account behavioral models.",
        badgeTone: "ok" as const,
      };
    }
    return {
      type: "generic" as const,
      label: "Custom Tabular Format",
      desc: "Standard table. Columns will be automatically inferred based on header naming conventions.",
      badgeTone: "warn" as const,
    };
  }, [activeDs]);

  const uniqueCounterparties = useMemo(() => {
    if (!activeDs) return 0;
    const r = activeDs.audit.roles;
    const sCol = r.source;
    const tCol = r.target;
    if (!sCol || !tCol) return 0;
    const set = new Set<string>();
    for (const row of activeDs.rows) {
      if (row[sCol]) set.add(String(row[sCol]));
      if (row[tCol]) set.add(String(row[tCol]));
    }
    return set.size;
  }, [activeDs]);

  return (
    <div className="space-y-6">
      {/* Upload Dropzone & Controls */}
      <Panel title="Upload Real Banking Dataset (.csv)">
        <div className="space-y-5">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Drag and drop your production banking data or investigator transaction ledger. The
            system automatically verifies columns, performs cryptographic integrity hashing, detects
            schemas, and runs multi-model consensus inference.
          </p>

          {/* Large Clean Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 md:p-12 text-center cursor-pointer transition-all ${
              isDragging
                ? "border-primary bg-primary/10 shadow-lg shadow-primary/20 scale-[1.01]"
                : "border-border/80 hover:border-primary/60 hover:bg-card/60 bg-card/20"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="p-4 rounded-full bg-primary/10 text-primary border border-primary/20">
                <Upload className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  {busy
                    ? "Parsing and Validating CSV..."
                    : "Drop your banking .csv file here or browse"}
                </h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                  Supports transaction-level ledgers (10,000+ rows) and account-level profiles. Zero
                  data is sent to external servers; processing is fully local and secure.
                </p>
              </div>
              <div className="pt-2 flex flex-wrap justify-center gap-2">
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  className="font-mono text-xs border-primary/40 text-primary hover:bg-primary/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> Select .CSV File
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant="secondary"
                  className="font-mono text-xs hover:bg-secondary/80 border border-border"
                  onClick={async (e) => {
                    e.stopPropagation();
                    setBusy(true);
                    try {
                      const res = await fetch("/synthetic_banking_accounts_10000.csv");
                      if (res.ok) {
                        const txt = await res.text();
                        await ingestFile(
                          txt,
                          "synthetic_banking_accounts_10000.csv",
                          "10,000-Account Benchmark (5,000 Risk / 5,000 Normal)",
                          "Synthetic Banking Compliance Benchmark",
                        );
                      }
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Database className="mr-1.5 h-3.5 w-3.5 text-primary" /> Load 10,000-Account
                  Dataset
                </Button>
              </div>
            </div>
          </div>

          {/* Optional Metadata Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-[11px] font-mono text-muted-foreground block mb-1">
                Data Source / Provenance (optional)
              </label>
              <Input
                placeholder="e.g. Core Banking RTGS Wire Ledger 2026-Q1"
                className="h-9 text-xs"
                value={provenance}
                onChange={(e) => setProvenance(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] font-mono text-muted-foreground block mb-1">
                Compliance Classification / License (optional)
              </label>
              <Input
                placeholder="e.g. Confidential Internal AML Investigation"
                className="h-9 text-xs"
                value={license}
                onChange={(e) => setLicense(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="mt-3">
              <Note kind="err">{error}</Note>
            </div>
          )}

          {/* Supported Format Guidelines & Template Downloads */}
          <div className="border-t border-border/60 pt-4 mt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div className="label-mono flex items-center gap-1.5 text-xs text-foreground font-semibold">
                <Shield className="h-3.5 w-3.5 text-primary" />
                <span>Dual Supported Schema Formats:</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadTemplate("transaction");
                  }}
                  className="text-xs h-8 font-mono border-border text-foreground hover:bg-muted"
                >
                  <Download className="mr-1.5 h-3.5 w-3.5 text-primary" /> Transaction Log Template
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadTemplate("account");
                  }}
                  className="text-xs h-8 font-mono border-border text-foreground hover:bg-muted"
                >
                  <Download className="mr-1.5 h-3.5 w-3.5 text-primary" /> Account Profile Template
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-border/80 bg-card/60 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-primary" /> Format A: Transaction Log
                  </span>
                  <Chip tone="ok">Full Graph Support</Chip>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Requires <code>from_account</code>, <code>to_account</code>, <code>amount</code>,{" "}
                  <code>timestamp</code>, and payment instrument. Enables complete directed graph
                  traversal, rapid pass-through velocity calculation, and circular loop detection.
                </p>
              </div>

              <div className="rounded-lg border border-border/80 bg-card/60 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                    <Database className="h-3.5 w-3.5 text-primary" /> Format B: Account Profile
                  </span>
                  <Chip tone="ok">Direct Inference</Chip>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Requires <code>account_id</code>, <code>inflow</code>, <code>outflow</code>,{" "}
                  <code>balance</code>, and behavioral features. Directly classified against the
                  trained behavioral models.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {/* Active Dataset Inspection Preview & Schema Checklist */}
      {activeDs && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 panel p-4 bg-primary/5 border-primary/40">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span className="font-semibold text-foreground text-sm">{activeDs.name}</span>
                {detectedFormat && (
                  <Chip tone={detectedFormat.badgeTone}>{detectedFormat.label}</Chip>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                {activeDs.rows.length.toLocaleString()} rows · {activeDs.columns.length} columns ·{" "}
                {activeDs.provenance}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={clearActiveDataset}
                className="text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove Dataset
              </Button>
              <Button
                onClick={() => setTab("analyze")}
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
              >
                Analyze Transactions <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Total Rows" value={activeDs.rows.length.toLocaleString()} />
            <Stat label="Total Columns" value={activeDs.columns.length} />
            <Stat
              label="Network Counterparties"
              value={
                uniqueCounterparties > 0 ? uniqueCounterparties.toLocaleString() : "Account Level"
              }
              tone={uniqueCounterparties > 0 ? "ok" : undefined}
            />
            <Stat
              label="Missing Values"
              value={activeDs.audit.totalMissing}
              tone={activeDs.audit.totalMissing > 0 ? "warn" : "ok"}
            />
          </div>

          {/* Live Schema Inspection Checklist */}
          <Panel title="Live Schema Inspection & Preprocessing Plan">
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <div className="flex items-start gap-2 p-2.5 rounded border border-border/60 bg-card/40">
                  <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
                  <div className="text-xs">
                    <span className="font-semibold text-foreground">File Integrity Verified</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                      SHA-256: {activeDs.fingerprint.slice(0, 16)}...
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-2.5 rounded border border-border/60 bg-card/40">
                  <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
                  <div className="text-xs">
                    <span className="font-semibold text-foreground">Schema Classification</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {detectedFormat?.desc}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-2.5 rounded border border-border/60 bg-card/40">
                  <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
                  <div className="text-xs">
                    <span className="font-semibold text-foreground">Graph Connectivity</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {activeDs.audit.graphSupported
                        ? `Directed edges ready (${uniqueCounterparties} distinct endpoints)`
                        : "Account-centric without explicit counterparty endpoints"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Detected column roles */}
              <div className="pt-2">
                <div className="text-xs font-semibold text-foreground mb-2">
                  Detected Column Roles:
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(activeDs.audit.roles).map(([k, v]) => (
                    <Chip key={k}>
                      {k}: <b className="ml-1 text-foreground">{v}</b>
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          {/* First 10 Rows Preview */}
          <Panel title="Transaction Preview (First 10 Rows)">
            <DataTable
              head={activeDs.columns}
              rows={activeDs.rows.slice(0, 10).map((r) => activeDs.columns.map((c) => r[c]))}
            />
          </Panel>
        </div>
      )}
    </div>
  );
}
