import { create } from "zustand";
import { persist } from "zustand/middleware";
export const useAuthStore = create()(persist((set, get) => ({
    token: null,
    user: null,
    outletId: null,
    outletName: null,
    login: (token, user, outletId, outletName) => {
        localStorage.setItem("inbill_token", token);
        set({ token, user, outletId, outletName });
        // Reconnect WS with correct outletId now that we know it
        import("../lib/ws").then(({ ws }) => ws.connect(outletId));
    },
    logout: () => {
        localStorage.removeItem("inbill_token");
        set({ token: null, user: null, outletId: null, outletName: null });
    },
    isLoggedIn: () => !!get().token,
}), { name: "inbill_auth" }));
