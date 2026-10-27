import { useSyncExternalStore } from "react";

export type SaveState = { state: "idle" | "saving" | "saved" | "error"; message?: string };
let current: SaveState = { state: "idle" };
let pending = 0;
const subs = new Set<() => void>();
const set = (s: SaveState) => {
  current = s;
  subs.forEach((f) => f());
};

/** Wrap every write so the header reflects real save outcomes. */
export async function persist<T>(fn: () => Promise<T>): Promise<T> {
  pending++;
  set({ state: "saving" });
  try {
    const r = await fn();
    pending--;
    if (pending === 0 && current.state !== "error") set({ state: "saved" });
    return r;
  } catch (e) {
    pending--;
    const quota = e instanceof Error && /quota/i.test(e.name + e.message);
    set({
      state: "error",
      message: quota ? "Storage is full — free space or export a backup." : "Couldn't save changes.",
    });
    throw e;
  }
}

export function useSaveState() {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => current,
    () => current,
  );
}
