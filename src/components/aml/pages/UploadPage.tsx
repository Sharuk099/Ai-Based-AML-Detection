import { useRef, useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowRight, Sparkles, Database, FileText } from "lucide-react";
import Papa from "papaparse";
import { useAml } from "../state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, Note, Chip, DataTable, Stat } from "../ui";
import { audit, fingerprint } from "@/lib/aml/audit";
import type { Row } from "@/lib/aml/types";


export function UploadPage() {
  const { addDataset, activeDs, setTab, runAnalysis } = useAml();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
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
            Upload your transactions table. The application will automatically inspect the columns, validate compatibility with the selected trained model, and prepare the dataset for one-click analysis.
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
                {activeDs.rows.length.toLocaleString()} rows · {activeDs.columns.length} columns · {activeDs.provenance}
              </p>
            </div>
            <Button
              onClick={handleProceedToAnalyze}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
            >
              Analyze Transactions <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Total Records" value={activeDs.rows.length.toLocaleString()} />
            <Stat label="Total Columns" value={activeDs.columns.length} />
            <Stat label="Graph Support" value={activeDs.audit.graphSupported ? "Available" : "No Endpoints"} tone={activeDs.audit.graphSupported ? "ok" : undefined} />
            <Stat label="Missing Values" value={activeDs.audit.totalMissing} tone={activeDs.audit.totalMissing > 0 ? "warn" : "ok"} />
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
              The pipeline automatically maps <b>from_account</b> / <b>to_account</b> for graph analytics, <b>amount</b> / <b>timestamp</b> for velocity and cash flow modeling.
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
