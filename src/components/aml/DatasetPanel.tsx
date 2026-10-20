// @ts-nocheck -- strict index checks relaxed for numeric ML code
import { useRef, useState } from "react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { audit, fingerprint } from "@/lib/aml/audit";
import type { Row } from "@/lib/aml/types";
import { useAml } from "./state";
import { Chip, DataTable, Note, Panel, Stat, selectCls } from "./ui";
import { syntheticCsv, generateSyntheticBankingAccounts100Csv } from "./synthetic";

export function DatasetPanel() {
  const { datasets, addDataset, activeDs, setActiveDs } = useAml();
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [prov, setProv] = useState("");
  const [lic, setLic] = useState("");

  const ingest = async (text: string, name: string, provenance: string) => {
    setErr(undefined);
    setBusy(true);
    try {
      if (!name.toLowerCase().endsWith(".csv")) throw new Error(`"${name}" is not a .csv file.`);
      if (!text.trim()) throw new Error("The file is empty.");
      const res = Papa.parse<Row>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
      });
      const columns = (res.meta.fields || []).filter(Boolean);
      if (columns.length < 2) throw new Error("CSV must contain at least two columns.");
      if (new Set(columns).size !== columns.length)
        throw new Error("CSV contains duplicate column names.");
      if (!res.data.length) throw new Error("CSV has a header but no rows.");
      if (res.errors.length > res.data.length * 0.05)
        throw new Error(
          `CSV could not be parsed reliably: ${res.errors[0].message} (row ${res.errors[0].row}).`,
        );
      addDataset({
        name,
        rows: res.data,
        columns,
        audit: audit(res.data, columns, name),
        fingerprint: await fingerprint(text.slice(0, 5_000_000)),
        provenance: provenance || "user upload",
        license: lic || "unknown",
      });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const a = activeDs?.audit;
  return (
    <div className="space-y-5">
      <Panel title="Upload CSV">
        <div className="flex flex-wrap items-end gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="text-sm file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground"
          />
          <Input
            className="w-56"
            placeholder="Source / provenance"
            value={prov}
            onChange={(e) => setProv(e.target.value)}
          />
          <Input
            className="w-44"
            placeholder="License"
            value={lic}
            onChange={(e) => setLic(e.target.value)}
          />
          <Button
            disabled={busy}
            onClick={async () => {
              const f = fileRef.current?.files?.[0];
              if (!f) return setErr("Choose a CSV file first.");
              ingest(await f.text(), f.name, prov);
            }}
          >
            {busy ? "Reading…" : "Upload & audit"}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              ingest(
                syntheticCsv(2000),
                "synthetic_demo.csv",
                "SYNTHETIC demo generated in-browser — for trying the software only",
              )
            }
          >
            Load synthetic demo
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              ingest(
                generateSyntheticBankingAccounts100Csv(),
                "synthetic_banking_accounts_100_50_risk_50_normal.csv",
                "Benchmark Banking Accounts Dataset (100 Accounts: 50 Risk / 50 Normal)",
              )
            }
          >
            Load 100 Banking Accounts (50 Risk / 50 Normal)
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Files stay in your browser. Public synthetic sources:{" "}
          <a
            className="text-primary underline"
            href="https://github.com/IBM/AML-Data"
            target="_blank"
            rel="noreferrer"
          >
            IBM AML-Data
          </a>{" "}
          (binary <code>Is Laundering</code> label) and{" "}
          <a
            className="text-primary underline"
            href="https://github.com/IBM/AMLSim"
            target="_blank"
            rel="noreferrer"
          >
            IBM AMLSim
          </a>{" "}
          (<code>IS_SAR</code>). Neither contains the 12 intended categories. The demo dataset is
          synthetic and is not evidence of real detection performance.
        </p>
        {err && (
          <div className="mt-3">
            <Note kind="err">{err}</Note>
          </div>
        )}
      </Panel>

      {datasets.length > 0 && (
        <Panel
          title="Datasets in this session"
          right={
            <select
              className={selectCls}
              value={activeDs?.name}
              onChange={(e) => setActiveDs(e.target.value)}
            >
              {datasets.map((d) => (
                <option key={d.name}>{d.name}</option>
              ))}
            </select>
          }
        >
          <DataTable
            head={["name", "rows", "columns", "graph", "fingerprint", "provenance"]}
            rows={datasets.map((d) => [
              d.name,
              d.audit.rows.toLocaleString(),
              d.audit.columns,
              d.audit.graphSupported ? "yes" : "no",
              d.fingerprint,
              d.provenance,
            ])}
          />
        </Panel>
      )}

      {a && activeDs && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="rows" value={a.rows.toLocaleString()} />
            <Stat label="columns" value={a.columns} />
            <Stat
              label="duplicate rows"
              value={a.duplicates}
              tone={a.duplicates ? "warn" : undefined}
            />
            <Stat
              label="missing cells"
              value={a.totalMissing}
              tone={a.totalMissing ? "warn" : undefined}
            />
            <Stat
              label="graph analytics"
              value={a.graphSupported ? "available" : "unavailable"}
              tone={a.graphSupported ? "ok" : "bad"}
            />
          </div>
          <Panel title="Detected column roles">
            <div className="flex flex-wrap gap-2">
              {Object.entries(a.roles).length ? (
                Object.entries(a.roles).map(([k, v]) => (
                  <Chip key={k}>
                    {k}: <b className="ml-1 text-foreground">{v}</b>
                  </Chip>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">
                  None detected — map them on the Train tab.
                </span>
              )}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              <b>transaction_id</b> unique row id (kept for investigation, never a feature) ·{" "}
              <b>sender / receiver</b> accounts — graph nodes · <b>amount</b> value moved ·{" "}
              <b>timestamp</b> when it happened · <b>label</b> what the model learns to predict.
            </p>
          </Panel>
          {a.label ? (
            <Panel title={`Labels in "${a.label.column}"`}>
              <Note kind={a.label.comparison.supports12 ? "ok" : "warn"}>
                {a.label.comparison.message}
              </Note>
              <div className="mt-3 flex flex-wrap gap-2">
                {a.label.comparison.covered.map((c) => (
                  <Chip key={c} tone="ok">
                    {c}
                  </Chip>
                ))}
                {a.label.comparison.missing.map((c) => (
                  <Chip key={c} tone="bad">
                    {c}
                  </Chip>
                ))}
              </div>
              <div className="mt-4 max-w-md">
                <DataTable
                  head={["value", "count"]}
                  rows={a.label.distribution.slice(0, 40).map(([k, v]) => [k, v])}
                />
              </div>
            </Panel>
          ) : (
            <Note>
              No label column detected. Supervised training needs a labelled target — pick one
              manually on the Train tab if it exists, or use Graph analytics for unsupervised
              indicators.
            </Note>
          )}
          <Panel title="Columns">
            <DataTable
              head={["name", "kind", "missing", "missing %", "unique", "sample"]}
              rows={a.columnInfo.map((c) => [
                c.name,
                c.kind,
                c.missing,
                c.missingPct,
                c.unique,
                c.sample.join(", "),
              ])}
            />
          </Panel>
          <Panel title="Preview · first 15 rows">
            <DataTable
              head={activeDs.columns}
              rows={activeDs.rows.slice(0, 15).map((r) => activeDs.columns.map((c) => r[c]))}
            />
          </Panel>
        </>
      )}
    </div>
  );
}
