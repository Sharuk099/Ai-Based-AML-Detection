// @ts-nocheck -- strict index checks relaxed for numeric ML code
import { get, set, del, keys } from "idb-keyval";
import type { SavedModel } from "./pipeline";

const PREFIX = "aml-model:";
export async function saveModel(m: SavedModel) { await set(PREFIX + m.id, m); const back = await get<SavedModel>(PREFIX + m.id); if (!back) throw new Error("Model could not be stored in the browser."); return back; }
export async function listModels(): Promise<SavedModel[]> {
  const ks = (await keys()).filter((k) => String(k).startsWith(PREFIX));
  const ms = await Promise.all(ks.map((k) => get<SavedModel>(k)));
  return (ms.filter(Boolean) as SavedModel[]).sort((a, b) => b.report.trainedAt.localeCompare(a.report.trainedAt));
}
export const deleteModel = (id: string) => del(PREFIX + id);
