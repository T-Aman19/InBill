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
async function ownerRequest(path, init) {
    const token = localStorage.getItem("inbill_owner_token");
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
const oget = (path) => ownerRequest(path, { method: "GET" });
const opost = (path, body) => ownerRequest(path, { method: "POST", body: JSON.stringify(body) });
const opatch = (path, body) => ownerRequest(path, { method: "PATCH", body: JSON.stringify(body) });
export const api = {
    auth: {
        login: (pin, outletId) => post("/auth/login", { pin, outletId }),
        me: () => get("/auth/me"),
        resolveSetupCode: (code) => get(`/auth/outlet-setup/${encodeURIComponent(code)}`),
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
        linkCustomer: (orderId, customerId) => patch(`/orders/${orderId}/customer`, { customerId }),
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
        applyDiscount: (billId, body) => patch(`/bills/${billId}/discount`, body),
        removeDiscount: (billId, lineId) => del(`/bills/${billId}/discount/${lineId}`),
        initiateUpi: (billId) => post(`/bills/${billId}/payments/upi`, {}),
        upiStatus: (billId, paymentId) => get(`/bills/${billId}/payments/${paymentId}/status`),
        simulateUpi: (billId, paymentId) => patch(`/bills/${billId}/payments/${paymentId}/simulate`, {}),
        cancelUpi: (billId, paymentId) => del(`/bills/${billId}/payments/${paymentId}`),
    },
    discounts: {
        list: () => get("/discounts"),
        create: (body) => post("/discounts", body),
        update: (id, body) => patch(`/discounts/${id}`, body),
        delete: (id) => del(`/discounts/${id}`),
        validate: (code, orderTotal) => post("/discounts/validate", { code, orderTotal }),
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
        gstr1: (from, to) => get(`/reports/gstr1?from=${from}&to=${to}`),
        foodCost: (from, to) => get(`/reports/food-cost?from=${from}&to=${to}`),
        voids: (from, to) => get(`/reports/voids?from=${from}&to=${to}`),
        staffPerformance: (from, to) => get(`/reports/staff-performance?from=${from}&to=${to}`),
        exportBillsCsv: async (from, to) => {
            const token = localStorage.getItem("inbill_token");
            const res = await fetch(`${BASE}/reports/bills/export?from=${from}&to=${to}`, {
                headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            });
            if (!res.ok)
                throw new ApiError(res.status, "Export failed");
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `bills-${from}-to-${to}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        },
        exportGstr1: async (from, to) => {
            const data = await get(`/reports/gstr1?from=${from}&to=${to}`);
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `gstr1-${from}-to-${to}.json`;
            a.click();
            URL.revokeObjectURL(url);
        },
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
    inventory: {
        // Ingredients
        listIngredients: () => get("/inventory/ingredients"),
        createIngredient: (body) => post("/inventory/ingredients", body),
        updateIngredient: (id, body) => patch(`/inventory/ingredients/${id}`, body),
        deleteIngredient: (id) => del(`/inventory/ingredients/${id}`),
        // Recipes
        listRecipes: () => get("/inventory/recipes"),
        createRecipe: (body) => post("/inventory/recipes", body),
        updateRecipe: (id, body) => patch(`/inventory/recipes/${id}`, body),
        deleteRecipe: (id) => del(`/inventory/recipes/${id}`),
        addRecipeIngredient: (recipeId, body) => post(`/inventory/recipes/${recipeId}/ingredients`, body),
        updateRecipeIngredient: (recipeId, riId, body) => patch(`/inventory/recipes/${recipeId}/ingredients/${riId}`, body),
        deleteRecipeIngredient: (recipeId, riId) => del(`/inventory/recipes/${recipeId}/ingredients/${riId}`),
        // Movements & adjustments
        listMovements: (limit) => get(`/inventory/movements${limit ? `?limit=${limit}` : ""}`),
        createAdjustment: (body) => post("/inventory/adjustments", body),
        // Reports
        valuation: () => get("/inventory/valuation"),
        lowStockCount: () => get("/inventory/low-stock-count"),
        exportMovementsCsv: async (from, to) => {
            const token = localStorage.getItem("inbill_token");
            const params = new URLSearchParams();
            if (from)
                params.set("from", from);
            if (to)
                params.set("to", to);
            const res = await fetch(`${BASE}/inventory/movements/export?${params}`, {
                headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            });
            if (!res.ok)
                throw new ApiError(res.status, "Export failed");
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = from && to ? `movements-${from}-to-${to}.csv` : "movements.csv";
            a.click();
            URL.revokeObjectURL(url);
        },
    },
    vendors: {
        list: () => get("/vendors"),
        create: (body) => post("/vendors", body),
        update: (id, body) => patch(`/vendors/${id}`, body),
        delete: (id) => del(`/vendors/${id}`),
    },
    purchaseOrders: {
        list: (params) => {
            const q = new URLSearchParams();
            if (params?.vendorId)
                q.set("vendorId", params.vendorId);
            if (params?.status)
                q.set("status", params.status);
            return get(`/purchase-orders${q.toString() ? `?${q}` : ""}`);
        },
        get: (id) => get(`/purchase-orders/${id}`),
        create: (body) => post("/purchase-orders", body),
        update: (id, body) => patch(`/purchase-orders/${id}`, body),
        markOrdered: (id) => post(`/purchase-orders/${id}/order`, {}),
        receive: (id, body) => post(`/purchase-orders/${id}/receive`, body),
    },
    ai: {
        menuDescription: (body) => post("/ai/menu-description", body),
        reportsQuery: (body) => post("/ai/reports-query", body),
    },
    loyalty: {
        getConfig: () => get("/loyalty/config"),
        saveConfig: (body) => post("/loyalty/config", body),
        getBillInfo: (billId) => get(`/loyalty/bill/${billId}`),
        getCustomerByPhone: (phone) => get(`/loyalty/customers/${phone}`),
        redeem: (body) => post("/loyalty/redeem", body),
        topCustomers: (limit = 20) => get(`/loyalty/top-customers?limit=${limit}`),
    },
    owner: {
        register: (body) => post("/auth/owner/register", body),
        login: (email, password) => post("/auth/owner/login", { email, password }),
        me: () => oget("/owner/me"),
        outlets: (from, to) => {
            const q = from && to ? `?from=${from}&to=${to}` : "";
            return oget(`/owner/outlets${q}`);
        },
        createOutlet: (body) => opost("/owner/outlets", body),
        updateOutlet: (id, body) => opatch(`/owner/outlets/${id}`, body),
        outletSummary: (id, from, to) => oget(`/owner/outlets/${id}/summary?from=${from}&to=${to}`),
        switchOutlet: (id) => opost(`/owner/outlets/${id}/switch`, {}),
    },
    public: {
        lanUrl: () => get("/public/lan-url"),
    },
};
export { ApiError };
