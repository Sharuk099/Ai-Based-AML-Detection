import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert, Database, Cpu, ShieldCheck, PlayCircle, Network, LayoutDashboard, Sparkles, Binary } from "lucide-react";
import { AmlProvider, useAml } from "@/components/aml/state";
import { DashboardPanel } from "@/components/aml/DashboardPanel";
import { DatasetPanel } from "@/components/aml/DatasetPanel";
import { TrainPanel } from "@/components/aml/TrainPanel";
import { ModelsPanel } from "@/components/aml/ModelsPanel";
import { PredictPanel } from "@/components/aml/PredictPanel";
import { NetworkPanel } from "@/components/aml/NetworkPanel";
import { syntheticCsv } from "@/components/aml/synthetic";
import Papa from "papaparse";
import { audit, fingerprint } from "@/lib/aml/audit";
import type { Row } from "@/lib/aml/types";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function MainApp() {
  const { tab, setTab, datasets, addDataset, activeDs, models, job } = useAml();

  const handleQuickDemo = async () => {
    const csv = syntheticCsv(2500);
    const res = Papa.parse<Row>(csv, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
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
  };

  const navItems = [
    { id: "dashboard", label: "Overview", icon: LayoutDashboard },
    { id: "datasets", label: "Datasets", icon: Database, badge: datasets.length > 0 ? datasets.length : undefined },
    { id: "train", label: "Train & Compare", icon: Cpu, badge: job?.status === "running" ? "active" : undefined, badgeTone: "primary" },
    { id: "models", label: "Models & Audit", icon: ShieldCheck, badge: models.length > 0 ? models.length : undefined },
    { id: "predict", label: "Predict & Explain", icon: PlayCircle },
    { id: "network", label: "Network Graph", icon: Network },
  ] as const;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 sm:px-6">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded border border-primary/40 bg-primary/10 text-primary">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-tight text-foreground">AML Intelligence</span>
                <span className="rounded bg-primary/20 px-1.5 py-0.2 text-[10px] font-mono text-primary font-medium">v1.0</span>
              </div>
              <p className="text-[10px] font-mono text-muted-foreground hidden sm:block">AI-Based Anti-Money Laundering Detection</p>
            </div>
          </div>

          {/* Quick Active Dataset Badge & Demo Button */}
          <div className="flex items-center gap-3">
            {activeDs ? (
              <div className="hidden md:flex items-center gap-2 rounded border border-border/60 bg-muted/40 px-2.5 py-1 text-xs font-mono">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                <span className="text-muted-foreground truncate max-w-[140px]">{activeDs.name}</span>
                <span className="text-muted-foreground">({activeDs.rows.length.toLocaleString()} rows)</span>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={handleQuickDemo}
                className="hidden sm:inline-flex text-xs border-primary/40 text-primary hover:bg-primary/10"
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Load Synthetic Demo
              </Button>
            )}

            <div className="hidden lg:flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
              <Binary className="h-3.5 w-3.5 text-primary" />
              <span>Client ML</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation Menu */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <nav className="flex space-x-1 overflow-x-auto py-1 scrollbar-none">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = tab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`flex items-center gap-2 whitespace-nowrap rounded px-3 py-2 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-muted text-foreground border-b-2 border-primary font-semibold"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  <span>{item.label}</span>
                  {item.badge !== undefined && (
                    <span
                      className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-mono font-bold ${
                        item.badgeTone === "primary"
                          ? "bg-primary text-primary-foreground animate-pulse"
                          : "bg-muted-foreground/20 text-muted-foreground"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        {tab === "dashboard" && <DashboardPanel />}
        {tab === "datasets" && <DatasetPanel />}
        {tab === "train" && <TrainPanel />}
        {tab === "models" && <ModelsPanel />}
        {tab === "predict" && <PredictPanel />}
        {tab === "network" && <NetworkPanel />}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 bg-card/40 py-4 text-xs font-mono text-muted-foreground">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <span>AML Detection Engine</span>
            <span>·</span>
            <span>In-browser Web Worker inference & training</span>
          </div>
          <div className="text-[11px] text-muted-foreground/80">
            Compliant with IBM AML-Data & AMLSim benchmarking benchmarks · Zero server upload
          </div>
        </div>
      </footer>
    </div>
  );
}

function IndexPage() {
  return (
    <AmlProvider>
      <MainApp />
    </AmlProvider>
  );
}
