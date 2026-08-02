import { create } from "zustand";
// Drives the single <UpgradeSheet/> mounted at the app root. Opened either
// proactively (clicking a locked feature) or reactively (a 402 from the server).
export const useUpgradeStore = create((set) => ({
    gate: null,
    open: (gate) => set({ gate }),
    close: () => set({ gate: null }),
}));
/**
 * Turn an ApiError into an upgrade prompt. Use in a mutation's onError:
 *   onError: (e) => { if (!promptUpgradeFromError(e)) toast(e.message) }
 * Returns true when the error was a gate (and the sheet was opened).
 */
export function promptUpgradeFromError(err) {
    const gate = err?.gate;
    if (gate) {
        useUpgradeStore.getState().open(gate);
        return true;
    }
    return false;
}
