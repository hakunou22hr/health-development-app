import { parseBackup } from "../shared/domain.mjs";
import type { Store } from "./types";
export const STORE_KEY = "health-notebook-v1";
export const emptyStore = (): Store => ({
  version: 1,
  meals: [],
  activityLogs: [],
});
export function loadStore(): { store: Store; error: string } {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return {
      store: raw ? (parseBackup(JSON.parse(raw)) as Store) : emptyStore(),
      error: "",
    };
  } catch {
    return {
      store: emptyStore(),
      error:
        "保存済みの記録を読み取れませんでした。上書きを止めています。設定から元データをバックアップしてください。",
    };
  }
}
export function saveStore(store: Store) {
  localStorage.setItem(STORE_KEY, JSON.stringify(parseBackup(store)));
}
export function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
