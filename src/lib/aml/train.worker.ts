/// <reference lib="webworker" />
import { trainAll } from "./train";

self.onmessage = (e: MessageEvent) => {
  const { rows, columns, config } = e.data;
  try {
    const saved = trainAll(rows, columns, config, (ev) => self.postMessage({ type: "progress", ev }));
    self.postMessage({ type: "done", saved });
  } catch (err) {
    self.postMessage({ type: "error", error: (err as Error).message });
  }
};
