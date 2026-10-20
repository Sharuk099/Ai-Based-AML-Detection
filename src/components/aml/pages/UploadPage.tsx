import { useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Database,
  FileText,
  Trash2,
} from "lucide-react";
import Papa from "papaparse";
import { useAml } from "../state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, Note, Chip, DataTable, Stat } from "../ui";
import { audit, fingerprint } from "@/lib/aml/audit";
import type { Row } from "@/lib/aml/types";

export function UploadPage() {
  const { addDataset, clearActiveDataset, activeDs, setTab, runAnalysis, loadPresetDataset } =
    useAml();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [provenance, setProvenance] = useState("");
  const [license, setLicense] = useState("");

  const ingestPreset = async (type: "indian" | "international" | "ordinary" | "suspicious") => {
    setError(undefined);
    setBusy(true);
    try {
      await loadPresetDataset(type);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

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
        provenance: prov || "User manual upload",
        license: lic || "Not specified",
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

  const handleProceedToAnalyze = async () => {
    if (!activeDs) return;
    setTab("analyze");
  };

  return (
    <div className="space-y-6">
      {/* Upload Dropzone & Controls */}
      <Panel title="Upload Transaction CSV File">
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Upload your transactions table. The application will automatically inspect the columns,
            validate compatibility with the selected trained model, and prepare the dataset for
            one-click analysis.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="text-xs file:mr-3 file:rounded file:border-0 file:bg-primary file:px-4 file:py-2 file:text-xs file:font-semibold file:text-primary-foreground cursor-pointer"
            />
            <Input
              placeholder="Source provenance (e.g. Core Banking Wire Feed)"
              className="w-64 h-9 text-xs"
              value={provenance}
              onChange={(e) => setProvenance(e.target.value)}
            />
            <Input
              placeholder="License (optional)"
              className="w-40 h-9 text-xs"
              value={license}
              onChange={(e) => setLicense(e.target.value)}
            />
          </div>

          {error && (
            <div className="mt-3">
              <Note kind="err">{error}</Note>
            </div>
          )}

          {/* Quick Preset Benchmark Datasets */}
          <div className="border-t border-border/60 pt-4 mt-4">
            <div className="label-mono mb-2 flex items-center gap-1.5 text-xs text-foreground font-semibold">
              <Database className="h-3.5 w-3.5 text-primary" />
              <span>Or Load Built-in Verified Banking Benchmarks:</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div
                onClick={() => ingestPreset("banking_accounts_100")}
                className="cursor-pointer rounded border border-primary/60 bg-primary/5 p-3 hover:border-primary hover:bg-primary/10 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="font-bold text-xs text-foreground flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      <span>🏦 100 Banking Accounts</span>
                    </span>
                    <Chip tone="ok">50 Risk / 50 Normal</Chip>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Benchmark dataset (synthetic_banking_accounts_100_50_risk_50_normal.csv). 100 account profiles with 1 representative transaction each (0 circular loops).
                  </p>
                </div>
                <div className="mt-2 text-[10px] text-primary font-mono font-bold">
                  Click to Load Benchmark →
                </div>
              </div>

              <div
                onClick={() => ingestPreset("indian")}
                className="cursor-pointer rounded border border-border/80 bg-card p-3 hover:border-primary/60 hover:bg-muted/40 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="font-bold text-xs text-foreground flex items-center justify-between">
                    <span>🇮🇳 Indian Banking Feed</span>
                    <Chip tone="ok">5,000 Txns</Chip>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    UPI, IMPS, NEFT, RTGS, Cash in INR. Real Indian VPAs, IFSCs, and UPI layering
                    loops.
                  </p>
                </div>
                <div className="mt-2 text-[10px] text-primary font-mono font-medium">
                  Click to Load →
                </div>
              </div>

              <div
                onClick={() => ingestPreset("international")}
                className="cursor-pointer rounded border border-border/80 bg-card p-3 hover:border-primary/60 hover:bg-muted/40 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="font-bold text-xs text-foreground flex items-center justify-between">
                    <span>🌐 Global High-Volume</span>
                    <Chip tone="ok">10,000+ Txns</Chip>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    SWIFT, Wire, ACH, Card in USD/EUR. Corporate liquidity, international mules, and
                    mixer hops.
                  </p>
                </div>
                <div className="mt-2 text-[10px] text-primary font-mono font-medium">
                  Click to Load →
                </div>
              </div>

              <div
                onClick={() => ingestPreset("ordinary")}
                className="cursor-pointer rounded border border-border/80 bg-card p-3 hover:border-primary/60 hover:bg-muted/40 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="font-bold text-xs text-foreground flex items-center justify-between">
                    <span>✅ Benign Ordinary Feed</span>
                    <Chip>1,000 Txns</Chip>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    100% ordinary consumer transactions. Used to verify zero false-positives under
                    ordinary banking flow.
                  </p>
                </div>
                <div className="mt-2 text-[10px] text-primary font-mono font-medium">
                  Click to Load →
                </div>
              </div>

              <div
                onClick={() => ingestPreset("suspicious")}
                className="cursor-pointer rounded border border-border/80 bg-card p-3 hover:border-primary/60 hover:bg-muted/40 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="font-bold text-xs text-foreground flex items-center justify-between">
                    <span>🚨 Suspicious Mule Rings</span>
                    <Chip tone="bad">500 Txns</Chip>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Structuring ($9,200-$9,950), rapid pass-through conduits, and circular layering
                    loops.
                  </p>
                </div>
                <div className="mt-2 text-[10px] text-primary font-mono font-medium">
                  Click to Load →
                </div>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {/* Active Dataset Inspection Preview */}
      {activeDs && (
        <div className="space-y-6">
          <div className="flex items-center justify-between panel p-4 bg-primary/5 border-primary/40">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span className="font-semibold text-foreground text-sm">{activeDs.name}</span>
                <Chip tone="ok">Ready for Analysis</Chip>
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
                onClick={handleProceedToAnalyze}
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
              >
                Analyze Transactions <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Total Records" value={activeDs.rows.length.toLocaleString()} />
            <Stat label="Total Columns" value={activeDs.columns.length} />
            <Stat
              label="Graph Support"
              value={activeDs.audit.graphSupported ? "Available" : "No Endpoints"}
              tone={activeDs.audit.graphSupported ? "ok" : undefined}
            />
            <Stat
              label="Missing Values"
              value={activeDs.audit.totalMissing}
              tone={activeDs.audit.totalMissing > 0 ? "warn" : "ok"}
            />
          </div>

          {/* Detected column roles */}
          <Panel title="Detected Transaction Schema Roles">
            <div className="flex flex-wrap gap-2">
              {Object.entries(activeDs.audit.roles).map(([k, v]) => (
                <Chip key={k}>
                  {k}: <b className="ml-1 text-foreground">{v}</b>
                </Chip>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground font-mono">
              The pipeline automatically maps <b>from_account</b> / <b>to_account</b> for graph
              analytics, <b>amount</b> / <b>timestamp</b> for velocity and cash flow modeling.
            </p>
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
