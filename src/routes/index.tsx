import { createFileRoute } from "@tanstack/react-router";
import {
  ShieldAlert,
  Upload,
  Play,
  FileSpreadsheet,
  Network,
  HelpCircle,
  FileText,
  Info,
  LayoutDashboard,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { AmlProvider, useAml } from "@/components/aml/state";
import { DashboardPage } from "@/components/aml/pages/DashboardPage";
import { UploadPage } from "@/components/aml/pages/UploadPage";
import { AnalyzePage } from "@/components/aml/pages/AnalyzePage";
import { ResultsPage } from "@/components/aml/pages/ResultsPage";
import { GraphPage } from "@/components/aml/pages/GraphPage";
import { ExplainPage } from "@/components/aml/pages/ExplainPage";
import { ReportPage } from "@/components/aml/pages/ReportPage";
import { ModelInfoPage } from "@/components/aml/pages/ModelInfoPage";
import { TrainPanel } from "@/components/aml/TrainPanel";
import { ModelsPanel } from "@/components/aml/ModelsPanel";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AML Intelligence | Transaction Review & Model Validation" },
      {
        name: "description",
        content:
          "Review uploaded transactions, train and independently evaluate AML models, and investigate evidence-backed alerts.",
      },
      { property: "og:title", content: "AML Intelligence | Transaction Review" },
      {
        property: "og:description",
        content: "Transaction screening with transparent model validation and graph evidence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IndexPage,
});

function MainApp() {
  const { tab, setTab, activeDs, analysisResult, activeModel, isAnalyzing } = useAml();

  const navItems: {
    id: string;
    label: string;
    icon: LucideIcon;
    badge?: string | number | undefined;
    badgeTone?: string;
  }[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    {
      id: "upload",
      label: "Upload Transactions",
      icon: Upload,
      badge: activeDs ? "ready" : undefined,
    },
    {
      id: "analyze",
      label: "Analyze Transactions",
      icon: Play,
      badge: isAnalyzing ? "running" : undefined,
      badgeTone: "primary",
    },
    {
      id: "results",
      label: "Prediction Results",
      icon: FileSpreadsheet,
      badge: analysisResult ? analysisResult.totalTransactions : undefined,
    },
    { id: "graph", label: "Transaction Graph", icon: Network },
    { id: "explain", label: "Explainable AI", icon: HelpCircle },
    {
      id: "report",
      label: "Investigation Report",
      icon: FileText,
      badge:
        analysisResult && analysisResult.flaggedCount > 0
          ? `${analysisResult.flaggedCount} alerts`
          : undefined,
      badgeTone: "danger",
    },
    { id: "model_info", label: "Model Information", icon: Info },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* Top Application Header */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          {/* Logo & Platform Info */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded border border-primary/40 bg-primary/10 text-primary shadow-sm">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-tight text-foreground">
                  AI Anti-Money Laundering Detection
                </span>
                <span className="rounded bg-success/20 px-1.5 py-0.2 text-[10px] font-mono text-success font-medium flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> {activeModel ? "Trained" : "No model"}
                </span>
              </div>
              <p className="text-[10px] font-mono text-muted-foreground hidden sm:block">
                Transaction screening · Validation required
              </p>
            </div>
          </div>

          {/* Quick Active Status & 1-Click Action */}
          <div className="flex items-center gap-3">
            {activeDs && (
              <div className="hidden md:flex items-center gap-2 rounded border border-border/70 bg-card px-3 py-1 text-xs font-mono">
                <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                <span className="text-foreground font-semibold truncate max-w-[150px]">
                  {activeDs.name}
                </span>
                <span className="text-muted-foreground">
                  ({activeDs.rows.length.toLocaleString()} rows)
                </span>
              </div>
            )}

            <Button
              size="sm"
              onClick={() => {
                if (!activeDs) setTab("upload");
                else setTab("analyze");
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold shadow-md shadow-primary/20"
            >
              <Play className="mr-1.5 h-3.5 w-3.5 fill-current" />
              {activeDs ? "Analyze Transactions" : "Upload File"}
            </Button>
          </div>
        </div>

        {/* Tab Navigation Menu (8 Required Pages) */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <nav className="flex space-x-1 overflow-x-auto py-1 scrollbar-none">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = tab === item.id;
              return (
                <Button
                  variant="ghost"
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`flex items-center gap-2 whitespace-nowrap rounded px-3 py-2 text-xs font-medium transition-all ${
                    isActive
                      ? "bg-card text-foreground border-b-2 border-primary font-bold shadow-sm"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`}
                  />
                  <span>{item.label}</span>
                  {item.badge !== undefined && (
                    <span
                      className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-mono font-bold ${
                        item.badgeTone === "primary"
                          ? "bg-primary text-primary-foreground animate-pulse"
                          : item.badgeTone === "danger"
                            ? "bg-destructive text-destructive-foreground"
                            : "bg-muted-foreground/20 text-muted-foreground"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        {tab === "dashboard" && <DashboardPage />}
        {tab === "upload" && <UploadPage />}
        {tab === "analyze" && <AnalyzePage />}
        {tab === "results" && <ResultsPage />}
        {tab === "graph" && <GraphPage />}
        {tab === "explain" && <ExplainPage />}
        {tab === "report" && <ReportPage />}
        {tab === "train" && <TrainPanel />}
        {tab === "model_info" && (
          <>
            <ModelInfoPage />
            <ModelsPanel />
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 bg-card/40 py-4 text-xs font-mono text-muted-foreground">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <span>AI Anti-Money Laundering Detection</span>
            <span>·</span>
            <span>{activeModel?.name || "Awaiting labeled training data"}</span>
          </div>
          <div className="text-[11px] text-muted-foreground/80">
            Human review required · Transactions stay in this browser
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
