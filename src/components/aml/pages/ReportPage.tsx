// @ts-nocheck -- strict index checks relaxed for numeric ML code
import { useState } from "react";
import {
  Printer,
  Download,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Calendar,
  Copy,
  Check,
  FileCode,
  Layers,
} from "lucide-react";
import { useAml } from "../state";
import { Button } from "@/components/ui/button";
import { Panel, Stat, DataTable, Chip } from "../ui";
import { toast } from "sonner";
import { AiInvestigationPanel } from "../AiInvestigationPanel";

export function ReportPage() {
  const { analysisResult, activeModel, setTab } = useAml();
  const [copied, setCopied] = useState(false);

  if (!analysisResult) {
    return (
      <div className="space-y-4">
        <Panel title="Investigation Report">
          <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
            <FileText className="h-12 w-12 text-muted-foreground/40" />
            <h3 className="text-base font-semibold text-foreground">
              No Active Investigation Dossier
            </h3>
            <p className="max-w-md text-xs text-muted-foreground">
              Run transaction analysis to generate an automated executive investigation report,
              typology findings, and audit trail.
            </p>
            <Button
              onClick={() => setTab("analyze")}
              className="mt-2 bg-primary text-primary-foreground font-bold"
            >
              Analyze Transactions
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  const multiReport = analysisResult.multiModelReport;
  const highRiskRecords = analysisResult.records.filter((r) => r._risk_level === "HIGH");

  const formatAmount = (rec: any) => {
    const amt = Number(rec["amount"] || 0);
    const ccy = String(rec["currency"] || "USD").toUpperCase();
    const symbol = ccy === "INR" ? "₹" : ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$";
    return `${symbol}${amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Build a self-contained, official, pristine printable HTML report document
  const generatePrintableHtml = () => {
    const cycles = analysisResult.graphData?.cycles || [];
    const cyclesListHtml =
      cycles.length > 0
        ? cycles
            .slice(0, 10)
            .map(
              (c, i) =>
                `<div style="padding:8px 12px;margin:4px 0;background:#fef2f2;border-left:4px solid #ef4444;font-family:monospace;font-size:12px;"><b>Ring #${i + 1}:</b> ${c.join(" &rarr; ")} &rarr; ${c[0]}</div>`,
            )
            .join("")
        : "<div style='color:#64748b;font-size:12px;'>No circular layering rings identified in this transaction batch.</div>";

    const typologyRowsHtml = Object.entries(analysisResult.categoryBreakdown)
      .map(([cat, count]) => {
        const pct = ((count / analysisResult.totalTransactions) * 100).toFixed(1);
        const isRisk =
          /laundering|fraud|darknet|blackmail|blacklist|ponzi|tumbler|structuring|mule|circular|velocity/i.test(
            cat,
          );
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:${isRisk ? "bold" : "normal"};color:${isRisk ? "#b91c1c" : "#0f172a"};">${cat}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${count.toLocaleString()}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${pct}%</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">
            <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;background:${isRisk ? "#fee2e2" : "#dcfce7"};color:${isRisk ? "#991b1b" : "#166534"};">
              ${isRisk ? "ELEVATED / SUSPICIOUS" : "NORMAL / CLEARED"}
            </span>
          </td>
        </tr>`;
      })
      .join("");

    const topRecordsHtml = highRiskRecords
      .slice(0, 15)
      .map((r) => {
        return `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-weight:bold;">${r._row_id}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${r["from_account"] || "—"}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${r["to_account"] || "—"}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold;">${formatAmount(r)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#b91c1c;font-weight:bold;">${r._crime_typology || r._predicted_class}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">${((Number(r._risk_score) || 0) * 100).toFixed(0)}%</td>
        </tr>`;
      })
      .join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Anti-Money Laundering Investigation Report (SAR) - ${analysisResult.datasetName}</title>
  <style>
    @page { size: letter; margin: 15mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; line-height: 1.45; margin: 0; padding: 24px; }
    .header-box { border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
    h1 { margin: 0 0 4px 0; font-size: 20px; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; }
    .confidential-tag { display: inline-block; background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-top: 4px; }
    .meta-table { font-family: monospace; font-size: 11px; color: #475569; text-align: right; }
    .meta-table td { padding: 2px 4px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; }
    .kpi-val { font-size: 20px; font-weight: bold; color: #0f172a; margin-top: 4px; font-family: monospace; }
    .kpi-lbl { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; }
    .section-title { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin: 20px 0 10px 0; color: #1e293b; }
    table { width: 100%; border-collapse: collapse; font-family: monospace; font-size: 11px; margin-bottom: 16px; }
    th { background: #f1f5f9; padding: 8px 10px; border-bottom: 2px solid #cbd5e1; font-weight: bold; text-align: left; }
    .audit-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; font-size: 11px; color: #475569; margin-top: 24px; }
    .sign-row { display: flex; justify-content: space-between; margin-top: 36px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 11px; font-family: monospace; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
      .page-break { page-break-before: always; }
    }
  </style>
</head>
<body>
  <!-- Print Controls Banner (Hidden when printed) -->
  <div class="no-print" style="background:#0284c7;color:white;padding:12px 20px;border-radius:8px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
    <div>
      <b style="font-size:14px;">AML Compliance Investigation Report (SAR) Ready</b>
      <div style="font-size:12px;opacity:0.9;">Click Print to save directly as PDF or send to your physical printer.</div>
    </div>
    <div style="display:flex;gap:8px;">
      <button onclick="window.print()" style="background:white;color:#0284c7;border:none;padding:8px 18px;border-radius:4px;font-weight:bold;cursor:pointer;font-size:12px;">🖨️ Print / Save as PDF</button>
      <button onclick="window.close()" style="background:rgba(255,255,255,0.2);color:white;border:none;padding:8px 14px;border-radius:4px;cursor:pointer;font-size:12px;">Close</button>
    </div>
  </div>

  <!-- Header -->
  <div class="header-box">
    <div>
      <h1>Anti-Money Laundering Investigation Report (SAR)</h1>
      <div style="font-size:12px;color:#475569;font-weight:600;">Financial Crime Compliance & Regulatory Intelligence Unit</div>
      <div class="confidential-tag">STRICTLY CONFIDENTIAL · OFFICIAL COMPLIANCE USE ONLY</div>
    </div>
    <table class="meta-table" style="width:auto;margin:0;">
      <tr><td>Case File ID:</td><td><b>SAR-${Date.now().toString().slice(-8)}</b></td></tr>
      <tr><td>Batch Name:</td><td><b>${analysisResult.datasetName}</b></td></tr>
      <tr><td>Generated Date:</td><td><b>${new Date(analysisResult.analyzedAt).toLocaleDateString()}</b></td></tr>
      <tr><td>Regulatory Standard:</td><td><b>RBI PMLA / FIU-IND & FATF</b></td></tr>
    </table>
  </div>

  <!-- 1. Executive Summary -->
  <div class="section-title">1. Executive Summary & Audit Findings</div>
  <p style="font-size:12px;color:#334155;margin-bottom:16px;">
    Automated machine learning and graph topology screening was executed on transaction batch <b>${analysisResult.datasetName}</b>.
    The consensus engine evaluated all <b>${analysisResult.totalTransactions.toLocaleString()}</b> financial transactions simultaneously across 5 distinct algorithms:
    <b>Explainable AI (XAI)</b>, <b>Stacking Classifier</b>, <b>Convolutional Neural Network (CNN)</b>, <b>Gradient Boosting (GBDT)</b>, and <b>Random Forest</b>.
    The system raised <b>${analysisResult.flaggedCount.toLocaleString()}</b> suspicious anomaly flags (<b>${analysisResult.flaggedPct}%</b> of the batch),
    with <b>${analysisResult.highRiskCount.toLocaleString()}</b> classified at High Risk priority, and confirmed <b>${multiReport ? multiReport.normalCount.toLocaleString() : analysisResult.normalPredictionsCount.toLocaleString()}</b> verified normal transactions.
  </p>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-lbl">Total Audited</div>
      <div class="kpi-val">${analysisResult.totalTransactions.toLocaleString()}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-lbl">Flagged Crimes</div>
      <div class="kpi-val" style="color:#b91c1c;">${analysisResult.flaggedCount.toLocaleString()}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-lbl">Verified Normal</div>
      <div class="kpi-val" style="color:#15803d;">${multiReport ? multiReport.normalCount.toLocaleString() : analysisResult.normalPredictionsCount.toLocaleString()}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-lbl">Circular Loops</div>
      <div class="kpi-val" style="color:#b91c1c;">${analysisResult.graphData?.cycles.length ?? 0}</div>
    </div>
  </div>

  <!-- 2. Detected Typologies Table -->
  <div class="section-title">2. Detected AML Crime Typologies & Breakdown</div>
  <table>
    <thead>
      <tr>
        <th>Predicted AML Typology / Pattern</th>
        <th style="text-align:right;">Transaction Count</th>
        <th style="text-align:right;">% of Batch</th>
        <th style="text-align:center;">Compliance Stratification</th>
      </tr>
    </thead>
    <tbody>
      ${typologyRowsHtml}
    </tbody>
  </table>

  <!-- 3. Network Graph Intelligence -->
  <div class="section-title">3. Counterparty Network Graph & Circular Layering Rings</div>
  <p style="font-size:12px;color:#334155;margin-bottom:8px;">
    Graph topology reconstruction identified <b>${analysisResult.graphData?.nodes ?? 0}</b> accounts and <b>${analysisResult.graphData?.edges ?? 0}</b> directed fund links.
  </p>
  ${cyclesListHtml}

  <!-- 4. High Risk Transactions -->
  <div class="section-title page-break">4. Priority High-Risk Transactions (Immediate Investigator Action Required)</div>
  <table>
    <thead>
      <tr>
        <th>Tx ID</th>
        <th>Source Account</th>
        <th>Beneficiary Account</th>
        <th style="text-align:right;">Amount</th>
        <th>Classification</th>
        <th style="text-align:right;">Risk Score</th>
      </tr>
    </thead>
    <tbody>
      ${topRecordsHtml}
    </tbody>
  </table>

  <!-- 5. Audit Trail & Signoff -->
  <div class="audit-box">
    <b>Regulatory Mandate:</b> This automated detection record was compiled in accordance with Anti-Money Laundering and Counter-Financing of Terrorism (AML/CFT) guidelines.
    Output from artificial intelligence and machine learning pipelines must be corroborated with human review prior to Suspicious Activity Report (SAR) filing with national FIU authorities.
  </div>

  <div class="sign-row">
    <div>
      <div><b>Senior Compliance Reviewer:</b> ___________________________</div>
      <div style="margin-top:4px;color:#64748b;">Financial Crime Investigation Division</div>
    </div>
    <div>
      <div><b>Date of Human Determination:</b> ___________________________</div>
      <div style="margin-top:4px;color:#64748b;">Status: [ ] FILED SAR &nbsp; [ ] CLEARED &nbsp; [ ] ENHANCED DD</div>
    </div>
  </div>

  <script>
    // Trigger print automatically when document loads
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 400);
    };
  </script>
</body>
</html>`;
  };

  // 1. PRINT HANDLER (Robust Multi-Method: Hidden Iframe + Direct Download Fallback)
  const handlePrint = () => {
    try {
      const htmlContent = generatePrintableHtml();

      // Method A: Hidden Iframe print (works without popup blockers)
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(htmlContent);
        doc.close();
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            toast.success("Print dialog opened!");
          } catch (err) {
            console.warn("Iframe print blocked, falling back to download", err);
            handleDownloadHtml();
          } finally {
            setTimeout(() => {
              if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
              }
            }, 4000);
          }
        }, 300);
        return;
      }
    } catch (e) {
      console.warn("Print execution error, falling back to download:", e);
      handleDownloadHtml();
    }
  };

  // 2. SAVE AS PRINTABLE HTML / PDF (Direct Clean File Download)
  const handleDownloadHtml = () => {
    try {
      const htmlContent = generatePrintableHtml();
      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `AML_Investigation_SAR_Report_${Date.now()}.html`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(
        "Printable SAR Report downloaded! Open in any browser to print or save as PDF.",
      );
    } catch (err: any) {
      toast.error("Failed to save report: " + err.message);
    }
  };

  // 3. EXPORT DOSSIER JSON
  const handleDownloadDossier = () => {
    try {
      const dossier = {
        reportType: "AML_COMPLIANCE_INVESTIGATION_DOSSIER",
        generatedAt: new Date().toISOString(),
        dataset: analysisResult.datasetName,
        modelUsed: analysisResult.modelUsed,
        modelId: analysisResult.modelId,
        executiveSummary: {
          totalAudited: analysisResult.totalTransactions,
          flaggedAlerts: analysisResult.flaggedCount,
          flaggedPercentage: analysisResult.flaggedPct,
          highRiskCritical: analysisResult.highRiskCount,
          categoryBreakdown: analysisResult.categoryBreakdown,
          multiModelSummary: multiReport,
        },
        graphTypologies: {
          totalAccounts: analysisResult.graphData?.nodes ?? 0,
          totalEdges: analysisResult.graphData?.edges ?? 0,
          circularLayeringRings: analysisResult.graphData?.cycles ?? [],
          suspiciousIndicators: analysisResult.graphData?.indicators ?? [],
        },
        topHighRiskRecords: highRiskRecords.slice(0, 50),
        humanReviewRequirement:
          "MANDATORY - Machine learning output requires corroborating human investigation prior to SAR filing.",
      };

      const blob = new Blob([JSON.stringify(dossier, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `aml_investigation_dossier_${Date.now()}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Investigation dossier exported as JSON!");
    } catch (err: any) {
      toast.error("Export failed: " + err.message);
    }
  };

  // 4. DOWNLOAD SAR (MARKDOWN)
  const handleDownloadMarkdown = () => {
    try {
      const cycles = analysisResult.graphData?.cycles || [];
      const markdown = `# ANTI-MONEY LAUNDERING INVESTIGATION REPORT (SAR)
**Confidential Regulatory Compliance Dossier**

- **Case ID**: SAR-${Date.now().toString().slice(-8)}
- **Batch Name**: ${analysisResult.datasetName}
- **Generated**: ${new Date(analysisResult.analyzedAt).toLocaleString()}
- **Framework**: RBI PMLA / FIU-IND & FATF
- **Total Transactions Audited**: ${analysisResult.totalTransactions.toLocaleString()}
- **Flagged Suspicious Transactions**: ${analysisResult.flaggedCount.toLocaleString()} (${analysisResult.flaggedPct}%)
- **High Risk Priority**: ${analysisResult.highRiskCount.toLocaleString()}
- **Verified Normal**: ${multiReport ? multiReport.normalCount.toLocaleString() : analysisResult.normalPredictionsCount.toLocaleString()}
- **Circular Layering Loops**: ${cycles.length}

---

## 1. Executive Threat Summary & Findings
Automated machine learning and graph topology screening was executed on batch file **${analysisResult.datasetName}**.
The multi-model consensus engine screened all transactions across 5 distinct algorithms: **Explainable AI (XAI)**, **Stacking Classifier**, **Convolutional Neural Network (CNN)**, **Gradient Boosting (GBDT)**, and **Random Forest**.

The system identified **${analysisResult.flaggedCount}** anomalous transactions requiring formal compliance determination.

${cycles.length > 0 ? `### Circular Layering Rings Identified:\n` + cycles.map((c, i) => `${i + 1}. ${c.join(" -> ")} -> ${c[0]}`).join("\n") : "No circular layering rings identified in this transaction batch."}

---

## 2. Detected AML Typology Distribution
${Object.entries(analysisResult.categoryBreakdown)
  .map(
    ([cat, count]) =>
      `- **${cat}**: ${count.toLocaleString()} transactions (${((count / analysisResult.totalTransactions) * 100).toFixed(1)}%)`,
  )
  .join("\n")}

---

## 3. High Risk Critical Transactions Sample
${highRiskRecords
  .slice(0, 20)
  .map(
    (r, i) =>
      `${i + 1}. **TxID ${r._row_id}**: ${r["from_account"] || "—"} -> ${r["to_account"] || "—"} | ${formatAmount(r)} | Typology: ${r._crime_typology || r._predicted_class} | Risk Score: ${((Number(r._risk_score) || 0) * 100).toFixed(0)}%`,
  )
  .join("\n")}

---

## 4. Compliance Officer Sign-off & Audit Trail
- **Senior Compliance Officer**: ___________________________
- **Date**: ___________________________
- **Determination**: [ ] FILED SAR   [ ] CLEARED   [ ] ENHANCED DUE DILIGENCE
`;

      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `AML_Investigation_SAR_${Date.now()}.md`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("SAR Dossier (.md) downloaded!");
    } catch (err: any) {
      toast.error("Markdown export failed: " + err.message);
    }
  };

  // 5. DOWNLOAD CSV (FLAGGED ALERTS)
  const handleDownloadCsv = () => {
    try {
      const flagged = analysisResult.records.filter(
        (r) => r._risk_level === "HIGH" || r._risk_level === "MEDIUM",
      );
      if (!flagged.length) {
        toast.info("No flagged transactions to export.");
        return;
      }

      const headers = [
        "transaction_id",
        "from_account",
        "to_account",
        "amount",
        "currency",
        "payment_format",
        "risk_level",
        "risk_score",
        "predicted_typology",
        "timestamp",
      ];
      const rows = flagged.map((r) => [
        String(r._row_id || r["transaction_id"] || ""),
        String(r["from_account"] || ""),
        String(r["to_account"] || ""),
        String(r["amount"] || 0),
        String(r["currency"] || "USD"),
        String(r["payment_format"] || r["channel"] || "Electronic"),
        String(r._risk_level || "HIGH"),
        String(Number(r._risk_score || 0).toFixed(4)),
        String(r._crime_typology || r._predicted_class || ""),
        String(r["timestamp"] || ""),
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map((row) => row.map((val) => `"${val}"`).join(",")),
      ].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `AML_Flagged_Alerts_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Flagged alerts CSV downloaded!");
    } catch (err: any) {
      toast.error("CSV export failed: " + err.message);
    }
  };

  // 6. COPY TEXT SUMMARY TO CLIPBOARD
  const handleCopySummary = () => {
    try {
      const summaryText = `ANTI-MONEY LAUNDERING INVESTIGATION SUMMARY
Batch: ${analysisResult.datasetName}
Date: ${new Date(analysisResult.analyzedAt).toLocaleString()}
Total Audited: ${analysisResult.totalTransactions}
Flagged Crimes: ${analysisResult.flaggedCount} (${analysisResult.flaggedPct}%)
High Risk Critical: ${analysisResult.highRiskCount}
Circular Rings Detected: ${analysisResult.graphData?.cycles.length ?? 0}
Normal / Cleared: ${multiReport ? multiReport.normalCount : analysisResult.normalPredictionsCount}
Framework: RBI PMLA / FIU-IND & FATF
Status: Requires Human Review Before SAR Filing`;

      navigator.clipboard.writeText(summaryText);
      setCopied(true);
      toast.success("Executive summary copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Action Bar (hidden on print) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 panel p-4 bg-card print:hidden shadow-sm">
        <div>
          <h2 className="font-semibold text-foreground text-sm flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            <span>Formal AML Compliance Dossier & SAR Generator</span>
          </h2>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            Generated on {new Date(analysisResult.analyzedAt).toLocaleString()} ·{" "}
            {analysisResult.datasetName} ({analysisResult.totalTransactions} records)
          </p>
        </div>

        {/* Working Print & Save Options */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={handlePrint}
            className="bg-primary text-primary-foreground text-xs font-bold shadow-md shadow-primary/20"
            title="Print or Save as PDF"
          >
            <Printer className="mr-1.5 h-3.5 w-3.5" /> Print / Save PDF
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleDownloadHtml}
            className="text-xs font-mono font-bold text-foreground hover:bg-muted"
            title="Download formatted printable report HTML"
          >
            <FileCode className="mr-1.5 h-3.5 w-3.5 text-primary" /> Save HTML Report
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleDownloadMarkdown}
            className="text-xs font-mono font-bold text-foreground hover:bg-muted"
            title="Download SAR as Markdown (.md)"
          >
            <FileText className="mr-1.5 h-3.5 w-3.5 text-primary" /> SAR (.MD)
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleDownloadDossier}
            className="text-xs font-mono"
            title="Download full JSON dataset"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export JSON
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleDownloadCsv}
            className="text-xs font-mono"
            title="Download flagged alerts as CSV"
          >
            <Layers className="mr-1.5 h-3.5 w-3.5 text-primary" /> Alerts (.CSV)
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleCopySummary}
            className="text-xs font-mono"
            title="Copy summary text"
          >
            {copied ? (
              <Check className="mr-1.5 h-3.5 w-3.5 text-success" />
            ) : (
              <Copy className="mr-1.5 h-3.5 w-3.5" />
            )}
            {copied ? "Copied" : "Copy Brief"}
          </Button>
        </div>
      </div>

      {/* AI Forensic Investigator Panel */}
      <AiInvestigationPanel analysisResult={analysisResult} />

      {/* Printable Formal Dossier Sheet */}
      <div className="panel p-8 bg-card space-y-8 border-border/80 shadow-md">
        {/* Document Header */}
        <div className="border-b border-border pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="AI AML Detection System"
              className="h-12 w-12 shrink-0 object-contain rounded-lg border border-border/80 p-0.5 bg-black/80 shadow-sm ring-1 ring-primary/20"
            />
            <div className="space-y-0.5">
              <span className="text-xl font-bold tracking-tight text-foreground block">
                ANTI-MONEY LAUNDERING INVESTIGATION REPORT (SAR)
              </span>
              <p className="text-xs font-mono text-muted-foreground">
                CONFIDENTIAL · FINANCIAL CRIME COMPLIANCE DIVISION · STRICT AUDIT ACCESS
              </p>
            </div>
          </div>
          <div className="text-right text-xs font-mono text-muted-foreground space-y-0.5">
            <div>
              Case ID: <b className="text-foreground">SAR-{Date.now().toString().slice(-8)}</b>
            </div>
            <div>
              Date:{" "}
              <b className="text-foreground">
                {new Date(analysisResult.analyzedAt).toLocaleDateString()}
              </b>
            </div>
            <div>
              Framework: <b className="text-foreground">RBI PMLA / FIU-IND & FATF</b>
            </div>
          </div>
        </div>

        {/* Executive Summary */}
        <div className="space-y-3">
          <h3 className="label-mono text-foreground font-bold">
            1. Executive Summary & Audit Findings
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Automated machine learning and graph topology screening was executed on batch file{" "}
            <b>{analysisResult.datasetName}</b> containing{" "}
            <b>{analysisResult.totalTransactions.toLocaleString()}</b> financial transactions. The
            screening engine raised <b>{analysisResult.flaggedCount.toLocaleString()}</b> anomaly
            flags (<b>{analysisResult.flaggedPct}%</b> of audited transactions), including{" "}
            <b>{analysisResult.highRiskCount.toLocaleString()}</b> classified at High Risk Critical
            priority, and verified{" "}
            <b>
              {multiReport
                ? multiReport.normalCount.toLocaleString()
                : analysisResult.normalPredictionsCount.toLocaleString()}
            </b>{" "}
            normal benign transactions.
          </p>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 pt-2">
            <Stat
              label="Audited Transactions"
              value={analysisResult.totalTransactions.toLocaleString()}
            />
            <Stat
              label="Flagged Anomalies"
              value={analysisResult.flaggedCount.toLocaleString()}
              tone={analysisResult.flaggedCount > 0 ? "bad" : "ok"}
            />
            <Stat
              label="High Risk Critical"
              value={analysisResult.highRiskCount.toLocaleString()}
              tone={analysisResult.highRiskCount > 0 ? "bad" : "ok"}
            />
            <Stat
              label="Circular Layering Loops"
              value={analysisResult.graphData?.cycles.length ?? 0}
              tone={(analysisResult.graphData?.cycles.length ?? 0) > 0 ? "bad" : "ok"}
            />
          </div>
        </div>

        {/* Classification Distribution */}
        <div className="space-y-3 border-t border-border pt-6">
          <h3 className="label-mono text-foreground font-bold">
            2. Detected AML Typology Distribution
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 label-mono">Predicted AML Typology</th>
                  <th className="px-3 py-2 label-mono">Transaction Count</th>
                  <th className="px-3 py-2 label-mono">Percentage of Total</th>
                  <th className="px-3 py-2 label-mono">Risk Stratification</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(analysisResult.categoryBreakdown).map(([cat, count]) => {
                  const pct = ((count / analysisResult.totalTransactions) * 100).toFixed(1);
                  const isRisk =
                    /laundering|fraud|darknet|blackmail|blacklist|ponzi|tumbler|structuring|mule|circular|velocity/i.test(
                      cat,
                    );
                  return (
                    <tr key={cat} className="border-b border-border/50">
                      <td className="px-3 py-2 font-semibold text-foreground">{cat}</td>
                      <td className="px-3 py-2">{count.toLocaleString()}</td>
                      <td className="px-3 py-2">{pct}%</td>
                      <td className="px-3 py-2">
                        <Chip tone={isRisk ? "bad" : "ok"}>
                          {isRisk ? "SUSPICIOUS / ELEVATED" : "STANDARD / NORMAL"}
                        </Chip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Graph Typologies & Loops */}
        {analysisResult.graphData && (
          <div className="space-y-3 border-t border-border pt-6">
            <h3 className="label-mono text-foreground font-bold">
              3. Network Graph Typology Evidence
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Network counterparty analysis identified{" "}
              <b>{analysisResult.graphData.nodes.toLocaleString()}</b> distinct entities across{" "}
              <b>{analysisResult.graphData.edges.toLocaleString()}</b> transaction links.
            </p>

            {analysisResult.graphData.cycles.length > 0 && (
              <div className="space-y-2 mt-2">
                <div className="label-mono text-destructive">
                  Identified Circular Layering Rings:
                </div>
                {analysisResult.graphData.cycles.slice(0, 5).map((cyc, idx) => (
                  <div
                    key={idx}
                    className="rounded border border-destructive/40 bg-destructive/5 p-2 font-mono text-xs text-foreground"
                  >
                    <b>Ring #{idx + 1}:</b> {cyc.join(" ➔ ")} ➔ {cyc[0]}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* High Risk Flagged Transactions Sample */}
        <div className="space-y-3 border-t border-border pt-6">
          <h3 className="label-mono text-foreground font-bold">
            4. Priority High-Risk Transaction Alerts (Top 10)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 label-mono">Tx ID</th>
                  <th className="px-3 py-2 label-mono">Sender</th>
                  <th className="px-3 py-2 label-mono">Receiver</th>
                  <th className="px-3 py-2 label-mono">Amount</th>
                  <th className="px-3 py-2 label-mono">Classification</th>
                  <th className="px-3 py-2 label-mono">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {highRiskRecords.slice(0, 10).map((r) => (
                  <tr key={r._row_id} className="border-b border-border/50">
                    <td className="px-3 py-2 font-bold text-foreground">{r._row_id}</td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[140px]">
                      {String(r["from_account"] || "—")}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[140px]">
                      {String(r["to_account"] || "—")}
                    </td>
                    <td className="px-3 py-2 font-semibold text-foreground">{formatAmount(r)}</td>
                    <td className="px-3 py-2 text-destructive font-bold">{r._predicted_class}</td>
                    <td className="px-3 py-2">
                      {((Number(r._confidence) || 0) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
                {highRiskRecords.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">
                      No High Risk critical alerts detected in this dataset.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Regulatory Audit Trail */}
        <div className="border-t border-border pt-6 text-xs text-muted-foreground space-y-2 font-mono">
          <div className="font-bold text-foreground">
            5. Mandatory Regulatory Audit Declarations
          </div>
          <p>
            • All inferences and graph topological analyses were calculated in this browser sandbox.
          </p>
          <p>
            • Machine learning risk scores represent statistical indicators and must be confirmed
            via customer due diligence (CDD/EDD) before freezing accounts or submitting SAR
            disclosures.
          </p>
        </div>
      </div>
    </div>
  );
}
