import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Audit } from "@/lib/aml/audit";
import type { Row, TrainConfig } from "@/lib/aml/types";
import type { SavedModel } from "@/lib/aml/pipeline";
import { listModels, saveModel, deleteModel } from "@/lib/aml/store";

export interface Dataset { name: string; rows: Row[]; columns: string[]; audit: Audit; fingerprint: string; provenance: string; license: string }
export interface JobEvent { t: number; event: string; model?: string; detail?: string }
export interface Job { status: "running" | "completed" | "failed"; started: number; ended?: number; events: JobEvent[]; current?: string; info?: Record<string, any>; error?: string; modelId?: string; config: TrainConfig }

interface Ctx {
  datasets: Dataset[]; addDataset: (d: Dataset) => void; activeDs?: Dataset; setActiveDs: (name: string) => void;
  models: SavedModel[]; refreshModels: () => Promise<void>; removeModel: (id: string) => Promise<void>;
  job?: Job; startTraining: (ds: Dataset, cfg: TrainConfig) => void;
  tab: string; setTab: (t: string) => void; focusModel?: string; setFocusModel: (id?: string) => void;
}
const C = createContext<Ctx | null>(null);
export const useAml = () => { const c = useContext(C); if (!c) throw new Error("AmlProvider missing"); return c; };

export function AmlProvider({ children }: { children: ReactNode }) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [active, setActive] = useState<string>();
  const [models, setModels] = useState<SavedModel[]>([]);
  const [job, setJob] = useState<Job>();
  const [tab, setTab] = useState("dashboard");
  const [focusModel, setFocusModel] = useState<string>();
  const worker = useRef<Worker | null>(null);

  const refreshModels = useCallback(async () => setModels(await listModels()), []);
  useEffect(() => { refreshModels(); }, [refreshModels]);

  const startTraining = (ds: Dataset, cfg: TrainConfig) => {
    worker.current?.terminate();
    const w = new Worker(new URL("../../lib/aml/train.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    const started = Date.now();
    setJob({ status: "running", started, events: [], config: cfg });
    w.onmessage = async (e) => {
      const m = e.data;
      if (m.type === "progress") {
        setJob((j) => j && ({ ...j, events: [...j.events, { t: (Date.now() - started) / 1000, ...m.ev }], current: m.ev.event === "model_start" ? m.ev.model : j.current, info: m.ev.info ?? j.info }));
      } else if (m.type === "done") {
        try {
          await saveModel(m.saved); await refreshModels();
          setJob((j) => j && ({ ...j, status: "completed", ended: Date.now(), current: undefined, modelId: m.saved.id, events: [...j.events, { t: (Date.now() - started) / 1000, event: "saved", detail: "stored in this browser" }] }));
        } catch (err) { setJob((j) => j && ({ ...j, status: "failed", ended: Date.now(), error: (err as Error).message })); }
        w.terminate();
      } else if (m.type === "error") {
        setJob((j) => j && ({ ...j, status: "failed", ended: Date.now(), current: undefined, error: m.error })); w.terminate();
      }
    };
    w.onerror = (e) => setJob((j) => j && ({ ...j, status: "failed", ended: Date.now(), error: e.message || "Worker crashed" }));
    w.postMessage({ rows: ds.rows, columns: ds.columns, config: cfg });
  };

  return (
    <C.Provider value={{
      datasets, addDataset: (d) => { setDatasets((x) => [d, ...x.filter((y) => y.name !== d.name)]); setActive(d.name); },
      activeDs: datasets.find((d) => d.name === active) ?? datasets[0], setActiveDs: setActive,
      models, refreshModels, removeModel: async (id) => { await deleteModel(id); await refreshModels(); },
      job, startTraining, tab, setTab, focusModel, setFocusModel,
    }}>{children}</C.Provider>
  );
}
