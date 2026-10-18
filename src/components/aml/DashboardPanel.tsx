import {
  ShieldAlert,
  Database,
  Cpu,
  Network,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  FileText,
  Binary,
} from "lucide-react";
import { useAml } from "./state";
import { Button } from "@/components/ui/button";
import { Panel, Stat } from "./ui";
import { INTENDED_CATEGORIES } from "@/lib/aml/types";
import { syntheticCsv } from "./synthetic";
import Papa from "papaparse";
import { audit, fingerprint } from "@/lib/aml/audit";
import type { Row } from "@/lib/aml/types";
import { useState } from "react";

export function DashboardPanel() {
  const { datasets, addDataset, activeDs, models, setTab, setFocusModel } = useAml();
  const [loadingDemo, setLoadingDemo] = useState(false);

  const loadDemo = async () => {
    setLoadingDemo(true);
    try {
      const csv = syntheticCsv(2500);
      const res = Papa.parse<Row>(csv, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
      });
      const columns = (res.meta.fields || []).filter(Boolean);
      addDataset({
        name: "synthetic_demo.csv",
        rows: res.data,
        columns,
        audit: audit(res.data, columns, "synthetic_demo.csv"),
        fingerprint: await fingerprint(csv.slice(0, 5_000_000)),
        provenance: "SYNTHETIC demo generated in-browser — for trying the software only",
        license: "Public Domain / CC0",
      });
      setTab("datasets");
    } finally {
      setLoadingDemo(false);
    }
  };

  const latestModel = models[0];

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="panel relative overflow-hidden border-primary/30 bg-gradient-to-br from-card via-card to-primary/10 p-6 md:p-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 font-mono text-xs text-primary">
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>Full-Stack AML Detection Engine</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              Anti-Money Laundering Detection & Graph Intelligence
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Trains real Machine Learning models (Gradient Boosting, Stacking, Random Forest,
              Logistic Regression) directly in your browser. Evaluates transaction typologies,
              detects money-mule rings, and explains risk scores with local feature attribution.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {datasets.length === 0 ? (
              <Button
                onClick={loadDemo}
                disabled={loadingDemo}
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {loadingDemo ? "Generating Demo..." : "Load Demo Dataset"}
              </Button>
            ) : (
              <Button
                onClick={() => setTab("train")}
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
              >
                <Cpu className="mr-2 h-4 w-4" />
                Train AML Models
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setTab("datasets")}
              className="border-border text-foreground hover:bg-accent"
            >
              <Database className="mr-2 h-4 w-4" />
              Manage Datasets
            </Button>
          </div>
        </div>

        {/* Quick system indicators */}
        <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-border/50 pt-4 text-xs text-muted-foreground font-mono">
          <span className="flex items-center gap-1.5 text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> Client-side sandbox (No data leaves browser)
          </span>
          <span className="flex items-center gap-1.5 text-foreground/80">
            <Binary className="h-3.5 w-3.5" /> Web Worker multithreading
          </span>
          <span className="flex items-center gap-1.5 text-foreground/80">
            <FileText className="h-3.5 w-3.5" /> IndexedDB model persistence
          </span>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat
          label="Loaded Datasets"
          value={datasets.length}
          tone={datasets.length > 0 ? "ok" : undefined}
        />
        <Stat
          label="Active Rows"
          value={activeDs ? activeDs.rows.length.toLocaleString() : "None"}
          tone={activeDs ? "ok" : undefined}
        />
        <Stat
          label="Saved Models"
          value={models.length}
          tone={models.length > 0 ? "ok" : undefined}
        />
        <Stat
          label="Best Macro F1"
          value={
            latestModel?.report.test.macro_f1 != null
              ? (latestModel.report.test.macro_f1 * 100).toFixed(1) + "%"
              : "N/A"
          }
          tone={latestModel ? "ok" : undefined}
        />
      </div>

      {/* Workflow Navigation Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div
          onClick={() => setTab("datasets")}
          className="group panel cursor-pointer p-5 transition-all hover:border-primary/60 hover:bg-muted/30"
        >
          <div className="flex items-center justify-between">
            <div className="rounded bg-primary/10 p-2 text-primary">
              <Database className="h-5 w-5" />
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
          </div>
          <h3 className="mt-4 font-semibold text-foreground">1. Datasets & Audit</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload transaction CSV, inspect column roles, evaluate 12 category coverage, and check
            data hygiene.
          </p>
        </div>

        <div
          onClick={() => setTab("train")}
          className="group panel cursor-pointer p-5 transition-all hover:border-primary/60 hover:bg-muted/30"
        >
          <div className="flex items-center justify-between">
            <div className="rounded bg-primary/10 p-2 text-primary">
              <Cpu className="h-5 w-5" />
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
          </div>
          <h3 className="mt-4 font-semibold text-foreground">2. Train & Compare</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Train Gradient Boosting, Stacking, Random Forest & Logistic Regression with tabular,
            graph, and combined features.
          </p>
        </div>

        <div
          onClick={() => setTab("models")}
          className="group panel cursor-pointer p-5 transition-all hover:border-primary/60 hover:bg-muted/30"
        >
          <div className="flex items-center justify-between">
            <div className="rounded bg-primary/10 p-2 text-primary">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
          </div>
          <h3 className="mt-4 font-semibold text-foreground">3. Models & Inspection</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Review test confusion matrices, calibration curves, permutation importance, and verify
            model persistence.
          </p>
        </div>

        <div
          onClick={() => setTab("network")}
          className="group panel cursor-pointer p-5 transition-all hover:border-primary/60 hover:bg-muted/30"
        >
          <div className="flex items-center justify-between">
            <div className="rounded bg-primary/10 p-2 text-primary">
              <Network className="h-5 w-5" />
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
          </div>
          <h3 className="mt-4 font-semibold text-foreground">4. Network & Typologies</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Detect fan-in collection, fan-out smurfing, pass-through laundering mules, and circular
            transaction loops.
          </p>
        </div>
      </div>

      {/* Active Model Spotlight or Getting Started */}
      {latestModel ? (
        <Panel
          title="Active Champion Model"
          right={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFocusModel(latestModel.id);
                setTab("models");
              }}
            >
              View Full Report
            </Button>
          }
        >
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <div className="label-mono">Model Configuration</div>
              <div className="font-semibold text-foreground">{latestModel.name}</div>
              <div className="text-xs text-muted-foreground">
                Trained on {latestModel.report.dataset} ·{" "}
                {new Date(latestModel.report.trainedAt).toLocaleDateString()}
              </div>
            </div>
            <div className="space-y-1">
              <div className="label-mono">Held-Back Test Score</div>
              <div className="font-mono text-lg font-bold text-success">
                F1:{" "}
                {latestModel.report.test.macro_f1 != null
                  ? (latestModel.report.test.macro_f1 * 100).toFixed(1) + "%"
                  : "N/A"}
              </div>
              <div className="text-xs text-muted-foreground">
                Balanced Acc:{" "}
                {latestModel.report.test.balanced_accuracy != null
                  ? (latestModel.report.test.balanced_accuracy * 100).toFixed(1) + "%"
                  : "N/A"}
              </div>
            </div>
            <div className="space-y-1">
              <div className="label-mono">Audit Status</div>
              <div className="flex items-center gap-1.5 text-xs text-success">
                <CheckCircle2 className="h-4 w-4" /> Reload verified from IndexedDB
              </div>
              <div className="text-xs text-muted-foreground">
                {latestModel.report.records.toLocaleString()} records processed in{" "}
                {latestModel.report.totalSeconds}s
              </div>
            </div>
          </div>
        </Panel>
      ) : null}

      {/* 12 Target AML Categories Reference */}
      <Panel title="12 Standard AML Typology Categories">
        <p className="mb-4 text-xs text-muted-foreground">
          The pipeline audits all imported labels against these 12 internationally recognized
          financial crime & entity categories:
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {INTENDED_CATEGORIES.map((cat) => (
            <div
              key={cat}
              className="flex items-center gap-2 rounded border border-border/60 bg-muted/20 px-3 py-2 text-xs"
            >
              <div className="h-2 w-2 rounded-full bg-primary/70" />
              <span className="font-medium text-foreground">{cat}</span>
            </div>
          ))}
        </div>
      </Panel>

      {/* Disclaimers & Ethics */}
      <div className="flex items-start gap-3 rounded border border-border/80 bg-card/60 p-4 text-xs text-muted-foreground">
        <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
        <div className="space-y-1 leading-relaxed">
          <strong className="text-foreground">Compliance & Demonstration Notice:</strong>
          <p>
            This system runs purely inside your browser client using Web Workers and local memory.
            Synthetic transaction data generated in the browser is for testing software
            functionality and algorithm verification only. It does not constitute evidence of
            real-world crime detection or production banking compliance without proper validation on
            institutional telemetry.
          </p>
        </div>
      </div>
    </div>
  );
}
