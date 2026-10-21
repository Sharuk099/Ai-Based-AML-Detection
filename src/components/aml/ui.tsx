// @ts-nocheck -- strict index checks relaxed for numeric ML code
import type { ReactNode } from "react";
import type { Metrics } from "@/lib/aml/metrics";
import { cn } from "@/lib/utils";

export const fmt = (v: unknown, d = 3) =>
  v === null || v === undefined || (typeof v === "number" && Number.isNaN(v))
    ? "n/a"
    : typeof v === "number"
      ? v.toFixed(d)
      : String(v);

export function Panel({
  title,
  children,
  right,
  className,
}: {
  title?: ReactNode;
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel p-5 min-w-0 overflow-hidden", className)}>
      {title && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 min-w-0">
          <div className="label-mono text-accent-foreground min-w-0 flex-1 truncate">{title}</div>
          {right && <div className="shrink-0 flex items-center gap-2">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
export function Stat({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  tone?: "ok" | "bad" | "warn" | undefined;
  className?: string;
}) {
  const isString = typeof value === "string";
  const isLong = isString && value.length > 16;
  const isVeryLong = isString && value.length > 28;

  return (
    <div
      className={cn(
        "panel min-w-0 overflow-hidden px-4 py-3 flex flex-col justify-between",
        className,
      )}
    >
      <div
        title={isString ? value : undefined}
        className={cn(
          "font-mono font-semibold tabular-nums tracking-tight",
          isVeryLong
            ? "text-xs font-mono break-all line-clamp-2 leading-snug"
            : isLong
              ? "text-sm font-mono truncate"
              : "text-xl",
          tone === "ok" && "text-success",
          tone === "bad" && "text-destructive",
          tone === "warn" && "text-warning",
        )}
      >
        {value}
      </div>
      <div className="label-mono mt-1 truncate" title={label}>
        {label}
      </div>
    </div>
  );
}
export function Note({
  kind = "warn",
  children,
}: {
  kind?: "warn" | "err" | "ok" | "info";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded border px-3 py-2 text-sm",
        kind === "warn" && "border-warning/50 bg-warning/10 text-warning",
        kind === "err" && "border-destructive/50 bg-destructive/10 text-destructive",
        kind === "ok" && "border-success/50 bg-success/10 text-success",
        kind === "info" && "border-border bg-muted text-muted-foreground",
      )}
    >
      {children}
    </div>
  );
}
export function DataTable({
  head,
  rows,
  mono = true,
}: {
  head: ReactNode[];
  rows: ReactNode[][];
  mono?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-left text-xs", mono && "font-mono")}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                className="label-mono whitespace-nowrap border-b border-border px-2 py-2 font-normal"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-muted/50">
              {r.map((c, j) => (
                <td key={j} className="whitespace-nowrap border-b border-border/60 px-2 py-1.5">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Chip({ children, tone }: { children: ReactNode; tone?: "ok" | "bad" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs",
        tone === "ok"
          ? "border-success/60 text-success"
          : tone === "bad"
            ? "border-destructive/60 text-destructive"
            : "border-border text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function MetricsView({ m, title }: { m: Metrics; title: string }) {
  const max = Math.max(...m.confusion.flat(), 1);
  return (
    <Panel title={title}>
      <div className="space-y-2">
        {m.warnings.map((w) => (
          <Note key={w}>{w}</Note>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        {(
          [
            "accuracy",
            "balanced_accuracy",
            "macro_f1",
            "weighted_f1",
            "precision_macro",
            "recall_macro",
            "roc_auc",
            "pr_auc",
          ] as const
        ).map((k) => (
          <Stat key={k} label={k.replace(/_/g, " ")} value={fmt(m[k])} />
        ))}
      </div>
      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <DataTable
          head={["class", "precision", "recall", "F1", "FPR", "support"]}
          rows={Object.entries(m.perClass).map(([c, v]) => [
            c,
            fmt(v.precision),
            fmt(v.recall),
            fmt(v.f1),
            fmt(v.fpr),
            v.support,
          ])}
        />
        <div>
          <div className="label-mono mb-2">
            Confusion matrix · n={m.n} · rows=true, cols=predicted
          </div>
          <div className="overflow-x-auto">
            <table className="font-mono text-xs">
              <tbody>
                <tr>
                  <td />
                  {m.labels.map((l) => (
                    <td
                      key={l}
                      className="max-w-24 truncate px-2 py-1 text-muted-foreground"
                      title={l}
                    >
                      {l}
                    </td>
                  ))}
                </tr>
                {m.confusion.map((r, i) => (
                  <tr key={i}>
                    <td
                      className="max-w-32 truncate pr-2 text-muted-foreground"
                      title={m.labels[i]}
                    >
                      {m.labels[i]}
                    </td>
                    {r.map((v, j) => (
                      <td
                        key={j}
                        className="border border-border px-3 py-2 text-center"
                        style={{
                          backgroundColor: `color-mix(in oklab, var(--primary) ${Math.round((v / max) * 70)}%, transparent)`,
                        }}
                      >
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {m.brier !== null && (
            <p className="mt-2 text-xs text-muted-foreground">
              Brier score (calibration): {fmt(m.brier)}
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}
export const selectCls =
  "h-9 rounded border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring";
