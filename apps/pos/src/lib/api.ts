// Tauri embedded (tauri: protocol) and Vite dev (port 5173) both need to reach
// the Bun server explicitly. LAN browsers load from port 3000 so relative URLs work.
const SERVER_ORIGIN =
  window.location.protocol === "tauri:" || window.location.port === "5173"
    ? "http://localhost:3000"
    : ""
const BASE = `${SERVER_ORIGIN}/api`

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("inbill_token")
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new ApiError(res.status, body.error ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

const get  = <T>(path: string) => request<T>(path, { method: "GET" })
const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) })
const patch = <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) })
const put  = <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) })
const del  = <T>(path: string) => request<T>(path, { method: "DELETE" })

export const api = {
  auth: {
    login: (pin: string, outletId: string) => post<{ token: string; user: { id: string; name: string; role: string } }>("/auth/login", { pin, outletId }),
    me: () => get<{ userId: string; outletId: string; role: string }>("/auth/me"),
  },
  menu: {
    getAll: () => get<{ categories: unknown[]; items: unknown[]; variants: unknown[]; modifierGroups: unknown[]; modifiers: unknown[]; itemModifierGroups: unknown[]; taxConfigs: unknown[] }>("/menu"),
    // Items
    createItem: (body: unknown) => post<unknown>("/menu/items", body),
    updateItem: (id: string, body: unknown) => patch<unknown>(`/menu/items/${id}`, body),
    toggleAvailability: (id: string, isAvailable: boolean) => patch(`/menu/items/${id}/availability`, { isAvailable }),
    deleteItem: (id: string) => del(`/menu/items/${id}`),
    // Categories
    createCategory: (body: unknown) => post<unknown>("/menu/categories", body),
    updateCategory: (id: string, body: unknown) => patch<unknown>(`/menu/categories/${id}`, body),
    deleteCategory: (id: string) => del(`/menu/categories/${id}`),
    // Variants
    createVariant: (itemId: string, body: unknown) => post<unknown>(`/menu/items/${itemId}/variants`, body),
    updateVariant: (id: string, body: unknown) => patch<unknown>(`/menu/variants/${id}`, body),
    deleteVariant: (id: string) => del(`/menu/variants/${id}`),
    // Modifier groups
    createModifierGroup: (body: unknown) => post<unknown>("/menu/modifier-groups", body),
    updateModifierGroup: (id: string, body: unknown) => patch<unknown>(`/menu/modifier-groups/${id}`, body),
    deleteModifierGroup: (id: string) => del(`/menu/modifier-groups/${id}`),
    addModifier: (groupId: string, body: unknown) => post<unknown>(`/menu/modifier-groups/${groupId}/modifiers`, body),
    updateModifier: (id: string, body: unknown) => patch<unknown>(`/menu/modifiers/${id}`, body),
    deleteModifier: (id: string) => del(`/menu/modifiers/${id}`),
    // Item ↔ modifier group links
    linkModifierGroup: (itemId: string, groupId: string) => post<unknown>(`/menu/items/${itemId}/modifier-groups`, { groupId }),
    unlinkModifierGroup: (itemId: string, groupId: string) => del(`/menu/items/${itemId}/modifier-groups/${groupId}`),
    // Tax
    getTax: () => get<unknown | null>("/menu/tax"),
    saveTax: (body: unknown) => put<unknown>("/menu/tax", body),
  },
  tables: {
    getAll: () => get<{ floors: unknown[]; tables: unknown[] }>("/tables"),
    // Floors
    createFloor: (body: unknown) => post<unknown>("/tables/floors", body),
    updateFloor: (id: string, body: unknown) => patch<unknown>(`/tables/floors/${id}`, body),
    deleteFloor: (id: string) => del(`/tables/floors/${id}`),
    // Tables
    createTable: (body: unknown) => post<unknown>("/tables", body),
    updateTable: (id: string, body: unknown) => patch<unknown>(`/tables/${id}`, body),
    deleteTable: (id: string) => del(`/tables/${id}`),
  },
  orders: {
    getOpen: () => get<unknown[]>("/orders"),
    get: (id: string) => get<unknown>(`/orders/${id}`),
    create: (body: unknown) => post<unknown>("/orders", body),
    addItem: (orderId: string, body: unknown) => post<unknown>(`/orders/${orderId}/items`, body),
    decrementItem: (orderId: string, itemId: string) => patch(`/orders/${orderId}/items/${itemId}/decrement`, {}),
    voidItem: (orderId: string, itemId: string) => del(`/orders/${orderId}/items/${itemId}`),
    transfer: (orderId: string, newTableId: string) => patch<unknown>(`/orders/${orderId}/transfer`, { newTableId }),
    merge: (targetOrderId: string, sourceOrderId: string) => post<unknown>(`/orders/${targetOrderId}/merge`, { sourceOrderId }),
  },
  kots: {
    getActive: () => get<unknown[]>("/kots"),
    generate: (orderId: string) => post<unknown>(`/orders/${orderId}/kot`, {}),
    acknowledge: (kotId: string) => patch(`/kots/${kotId}/acknowledge`, {}),
    done: (kotId: string) => patch(`/kots/${kotId}/done`, {}),
  },
  bills: {
    create: (body: unknown) => post<unknown>("/bills", body),
    get: (id: string) => get<unknown>(`/bills/${id}`),
    addPayment: (billId: string, body: unknown) => post<unknown>(`/bills/${billId}/payments`, body),
    applyDiscount: (billId: string, body: unknown) => patch<unknown>(`/bills/${billId}/discount`, body),
    removeDiscount: (billId: string, lineId: string) => del<unknown>(`/bills/${billId}/discount/${lineId}`),
    initiateUpi: (billId: string) => post<{ paymentId: string; qrData: string; amountDue: number; mode: string; expiresAt: string }>(`/bills/${billId}/payments/upi`, {}),
    upiStatus: (billId: string, paymentId: string) => get<{ status: string; isPaid: boolean }>(`/bills/${billId}/payments/${paymentId}/status`),
    simulateUpi: (billId: string, paymentId: string) => patch<{ ok: boolean; isPaid: boolean }>(`/bills/${billId}/payments/${paymentId}/simulate`, {}),
    cancelUpi: (billId: string, paymentId: string) => del<{ ok: boolean }>(`/bills/${billId}/payments/${paymentId}`),
  },
  discounts: {
    list: () => get<unknown[]>("/discounts"),
    create: (body: unknown) => post<unknown>("/discounts", body),
    update: (id: string, body: unknown) => patch<unknown>(`/discounts/${id}`, body),
    delete: (id: string) => del<unknown>(`/discounts/${id}`),
    validate: (code: string, orderTotal: number) => post<unknown>("/discounts/validate", { code, orderTotal }),
  },
  shifts: {
    getActive: () => get<unknown | null>("/shifts/active"),
    open: (openingCash: number) => post<unknown>("/shifts/open", { openingCash }),
    close: (closingCash: number) => post<unknown>("/shifts/close", { closingCash }),
  },
  users: {
    getAll: () => get<unknown[]>("/users"),
    create: (body: unknown) => post<unknown>("/users", body),
    update: (id: string, body: unknown) => patch(`/users/${id}`, body),
    disable: (id: string) => del(`/users/${id}`),
    changeSelfPin: (currentPin: string, newPin: string) => patch("/users/me/pin", { currentPin, newPin }),
  },
  customers: {
    search: (q: string) => get<unknown[]>(`/customers?search=${encodeURIComponent(q)}`),
    upsert: (body: unknown) => post<unknown>("/customers", body),
    get: (id: string) => get<unknown>(`/customers/${id}`),
    update: (id: string, body: unknown) => patch<unknown>(`/customers/${id}`, body),
    addLoyalty: (id: string, delta: number, note: string) => post<unknown>(`/customers/${id}/loyalty`, { delta, note }),
  },
  reports: {
    summary: (from: string, to: string) => get<unknown>(`/reports/summary?from=${from}&to=${to}`),
    items: (from: string, to: string) => get<unknown[]>(`/reports/items?from=${from}&to=${to}`),
    categories: (from: string, to: string) => get<unknown[]>(`/reports/categories?from=${from}&to=${to}`),
    hourly: (date: string) => get<unknown[]>(`/reports/hourly?date=${date}`),
    gstr1: (from: string, to: string) => get<unknown>(`/reports/gstr1?from=${from}&to=${to}`),
    exportBillsCsv: async (from: string, to: string) => {
      const token = localStorage.getItem("inbill_token")
      const res = await fetch(`${BASE}/reports/bills/export?from=${from}&to=${to}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      if (!res.ok) throw new ApiError(res.status, "Export failed")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = `bills-${from}-to-${to}.csv`; a.click()
      URL.revokeObjectURL(url)
    },
  },
  cashEntries: {
    list: (from: string, to: string) => get<unknown[]>(`/shifts/cash-entries?from=${from}&to=${to}`),
    create: (body: unknown) => post<unknown>("/shifts/cash-entries", body),
    delete: (id: string) => del(`/shifts/cash-entries/${id}`),
  },
  outlet: {
    get: () => get<{ id: string; name: string; address: string; phone: string; gstin?: string; timezone: string; currency: string; upiVpa?: string; razorpayKeyId?: string }>("/outlet"),
    update: (body: unknown) => patch<unknown>("/outlet", body),
  },
  inventory: {
    // Ingredients
    listIngredients: () => get<unknown[]>("/inventory/ingredients"),
    createIngredient: (body: unknown) => post<unknown>("/inventory/ingredients", body),
    updateIngredient: (id: string, body: unknown) => patch<unknown>(`/inventory/ingredients/${id}`, body),
    deleteIngredient: (id: string) => del<unknown>(`/inventory/ingredients/${id}`),
    // Recipes
    listRecipes: () => get<unknown[]>("/inventory/recipes"),
    createRecipe: (body: unknown) => post<unknown>("/inventory/recipes", body),
    updateRecipe: (id: string, body: unknown) => patch<unknown>(`/inventory/recipes/${id}`, body),
    deleteRecipe: (id: string) => del<unknown>(`/inventory/recipes/${id}`),
    addRecipeIngredient: (recipeId: string, body: unknown) => post<unknown>(`/inventory/recipes/${recipeId}/ingredients`, body),
    updateRecipeIngredient: (recipeId: string, riId: string, body: unknown) => patch<unknown>(`/inventory/recipes/${recipeId}/ingredients/${riId}`, body),
    deleteRecipeIngredient: (recipeId: string, riId: string) => del<unknown>(`/inventory/recipes/${recipeId}/ingredients/${riId}`),
    // Movements & adjustments
    listMovements: (limit?: number) => get<unknown[]>(`/inventory/movements${limit ? `?limit=${limit}` : ""}`),
    createAdjustment: (body: unknown) => post<unknown>("/inventory/adjustments", body),
    // Reports
    valuation: () => get<unknown>("/inventory/valuation"),
    lowStockCount: () => get<{ count: number }>("/inventory/low-stock-count"),
  },
  owner: {
    register: (body: unknown) => post<{ token: string; owner: { id: string; name: string; email: string } }>("/auth/owner/register", body),
    login: (email: string, password: string) => post<{ token: string; owner: { id: string; name: string; email: string } }>("/auth/owner/login", { email, password }),
    me: () => get<{ id: string; name: string; email: string; phone: string }>("/owner/me"),
    outlets: () => get<{ id: string; name: string; address: string; todayRevenue: number; todayBillCount: number; openOrderCount: number; razorpayConfigured: boolean; upiVpa?: string }[]>("/owner/outlets"),
    createOutlet: (body: unknown) => post<unknown>("/owner/outlets", body),
    updateOutlet: (id: string, body: unknown) => patch<unknown>(`/owner/outlets/${id}`, body),
    outletSummary: (id: string, from: string, to: string) => get<unknown>(`/owner/outlets/${id}/summary?from=${from}&to=${to}`),
    switchOutlet: (id: string) => post<{ token: string; outlet: { id: string; name: string } }>(`/owner/outlets/${id}/switch`, {}),
  },
}

export { ApiError }
