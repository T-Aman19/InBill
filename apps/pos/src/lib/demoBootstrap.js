// Silently logs a fresh visitor into the seeded demo tenant so
// demo.tresiphi.com skips the login/setup screens entirely. Only meaningful
// on the demo deployment — POST /auth/demo-login 404s everywhere else, so
// this is a harmless no-op if this code ever ships to production.
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
const OUTLET_ID_KEY = "inbill_outlet_id";
const OUTLET_NAME_KEY = "inbill_outlet_name";
export async function bootstrapDemoSession() {
    const flavor = window.location.pathname.startsWith("/owner") ? "owner" : "floor";
    try {
        if (flavor === "owner") {
            if (localStorage.getItem("inbill_owner_token"))
                return;
            const res = await api.auth.demoLogin("owner");
            localStorage.setItem("inbill_owner_token", res.token);
            return;
        }
        if (localStorage.getItem("inbill_token"))
            return;
        const res = await api.auth.demoLogin("floor");
        if (!res.user || !res.outletId || !res.outletName)
            return;
        localStorage.setItem(OUTLET_ID_KEY, res.outletId);
        localStorage.setItem(OUTLET_NAME_KEY, res.outletName);
        useAuthStore.getState().login(res.token, res.user, res.outletId, res.outletName);
    }
    catch (e) {
        // Demo not seeded yet, or the endpoint 404'd (not a demo deployment) —
        // fall through to the normal login screens rather than blocking render.
        console.error("[demo] auto-login failed:", e);
    }
}
