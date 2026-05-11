// Tauri embedded (tauri: protocol) and Vite dev (port 5173) both need to reach
// the Bun server explicitly. LAN browsers load from port 3000 so relative URLs work.
const SERVER_ORIGIN = window.location.protocol === "tauri:" || window.location.port === "5173"
    ? "http://localhost:3000"
    : "";
const BASE = `${SERVER_ORIGIN}/api`;
class ApiError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
async function request(path, init) {
    const token = localStorage.getItem("inbill_token");
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
const put = (path, body) => request(path, { method: "PUT", body: JSON.stringify(body) });
const del = (path) => request(path, { method: "DELETE" });
export const api = {
    auth: {
        login: (pin, outletId) => post("/auth/login", { pin, outletId }),
        me: () => get("/auth/me"),
    },
    menu: {
        getAll: () => get("/menu"),
        // Items
        createItem: (body) => post("/menu/items", body),
        updateItem: (id, body) => patch(`/menu/items/${id}`, body),
        toggleAvailability: (id, isAvailable) => patch(`/menu/items/${id}/availability`, { isAvailable }),
        deleteItem: (id) => del(`/menu/items/${id}`),
        // Categories
        createCategory: (body) => post("/menu/categories", body),
        updateCategory: (id, body) => patch(`/menu/categories/${id}`, body),
        deleteCategory: (id) => del(`/menu/categories/${id}`),
        // Variants
        createVariant: (itemId, body) => post(`/menu/items/${itemId}/variants`, body),
        updateVariant: (id, body) => patch(`/menu/variants/${id}`, body),
        deleteVariant: (id) => del(`/menu/variants/${id}`),
        // Modifier groups
        createModifierGroup: (body) => post("/menu/modifier-groups", body),
        updateModifierGroup: (id, body) => patch(`/menu/modifier-groups/${id}`, body),
        deleteModifierGroup: (id) => del(`/menu/modifier-groups/${id}`),
        addModifier: (groupId, body) => post(`/menu/modifier-groups/${groupId}/modifiers`, body),
        updateModifier: (id, body) => patch(`/menu/modifiers/${id}`, body),
        deleteModifier: (id) => del(`/menu/modifiers/${id}`),
        // Item ↔ modifier group links
        linkModifierGroup: (itemId, groupId) => post(`/menu/items/${itemId}/modifier-groups`, { groupId }),
        unlinkModifierGroup: (itemId, groupId) => del(`/menu/items/${itemId}/modifier-groups/${groupId}`),
        // Tax
        getTax: () => get("/menu/tax"),
        saveTax: (body) => put("/menu/tax", body),
    },
    tables: {
        getAll: () => get("/tables"),
        // Floors
        createFloor: (body) => post("/tables/floors", body),
        updateFloor: (id, body) => patch(`/tables/floors/${id}`, body),
        deleteFloor: (id) => del(`/tables/floors/${id}`),
        // Tables
        createTable: (body) => post("/tables", body),
        updateTable: (id, body) => patch(`/tables/${id}`, body),
        deleteTable: (id) => del(`/tables/${id}`),
    },
    orders: {
        getOpen: () => get("/orders"),
        get: (id) => get(`/orders/${id}`),
        create: (body) => post("/orders", body),
        addItem: (orderId, body) => post(`/orders/${orderId}/items`, body),
        decrementItem: (orderId, itemId) => patch(`/orders/${orderId}/items/${itemId}/decrement`, {}),
        voidItem: (orderId, itemId) => del(`/orders/${orderId}/items/${itemId}`),
        transfer: (orderId, newTableId) => patch(`/orders/${orderId}/transfer`, { newTableId }),
        merge: (targetOrderId, sourceOrderId) => post(`/orders/${targetOrderId}/merge`, { sourceOrderId }),
    },
    kots: {
        getActive: () => get("/kots"),
        generate: (orderId) => post(`/orders/${orderId}/kot`, {}),
        acknowledge: (kotId) => patch(`/kots/${kotId}/acknowledge`, {}),
        done: (kotId) => patch(`/kots/${kotId}/done`, {}),
    },
    bills: {
        create: (body) => post("/bills", body),
        get: (id) => get(`/bills/${id}`),
        addPayment: (billId, body) => post(`/bills/${billId}/payments`, body),
    },
    shifts: {
        getActive: () => get("/shifts/active"),
        open: (openingCash) => post("/shifts/open", { openingCash }),
        close: (closingCash) => post("/shifts/close", { closingCash }),
    },
    users: {
        getAll: () => get("/users"),
        create: (body) => post("/users", body),
        update: (id, body) => patch(`/users/${id}`, body),
        disable: (id) => del(`/users/${id}`),
        changeSelfPin: (currentPin, newPin) => patch("/users/me/pin", { currentPin, newPin }),
    },
    customers: {
        search: (q) => get(`/customers?search=${encodeURIComponent(q)}`),
        upsert: (body) => post("/customers", body),
        get: (id) => get(`/customers/${id}`),
        update: (id, body) => patch(`/customers/${id}`, body),
        addLoyalty: (id, delta, note) => post(`/customers/${id}/loyalty`, { delta, note }),
    },
    reports: {
        summary: (from, to) => get(`/reports/summary?from=${from}&to=${to}`),
        items: (from, to) => get(`/reports/items?from=${from}&to=${to}`),
        categories: (from, to) => get(`/reports/categories?from=${from}&to=${to}`),
        hourly: (date) => get(`/reports/hourly?date=${date}`),
    },
    cashEntries: {
        list: (from, to) => get(`/shifts/cash-entries?from=${from}&to=${to}`),
        create: (body) => post("/shifts/cash-entries", body),
        delete: (id) => del(`/shifts/cash-entries/${id}`),
    },
    outlet: {
        get: () => get("/outlet"),
        update: (body) => patch("/outlet", body),
    },
};
export { ApiError };
