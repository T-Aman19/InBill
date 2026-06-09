const BASE = "/api";
class ApiError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
async function request(path, init) {
    const token = localStorage.getItem("inbill_host_token");
    const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...init?.headers,
        },
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new ApiError(res.status, body.error ?? res.statusText);
    }
    if (res.status === 204)
        return undefined;
    return res.json();
}
const get = (path) => request(path, { method: "GET" });
const post = (path, body) => request(path, { method: "POST", body: JSON.stringify(body) });
const patch = (path, body) => request(path, { method: "PATCH", body: JSON.stringify(body) });
export const api = {
    auth: {
        login: (pin, outletId) => post("/auth/login", { pin, outletId }),
        resolveSetupCode: (code) => get(`/auth/outlet-setup/${encodeURIComponent(code)}`),
    },
    tables: {
        getAll: () => get("/tables"),
    },
    queue: {
        list: (status) => get(`/queue${status ? `?status=${status}` : ""}`),
        addWalkIn: (body) => post("/queue", body),
        seat: (id, tableId) => patch(`/queue/${id}/seat`, { tableId }),
        cancel: (id, status) => patch(`/queue/${id}/cancel`, { status }),
    },
    outlet: {
        get: () => get("/outlet"),
    },
};
export { ApiError };
