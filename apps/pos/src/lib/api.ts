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

async function ownerRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("inbill_owner_token")
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

const oget  = <T>(path: string) => ownerRequest<T>(path, { method: "GET" })
const opost = <T>(path: string, body: unknown) => ownerRequest<T>(path, { method: "POST", body: JSON.stringify(body) })
const opatch = <T>(path: string, body: unknown) => ownerRequest<T>(path, { method: "PATCH", body: JSON.stringify(body) })

export const api = {
  auth: {
    login: (pin: string, outletId: string) => post<{ token: string; user: { id: string; name: string; role: string } }>("/auth/login", { pin, outletId }),
    me: () => get<{ userId: string; outletId: string; role: string }>("/auth/me"),
    resolveSetupCode: (code: string) => get<{ id: string; name: string }>(`/auth/outlet-setup/${encodeURIComponent(code)}`),
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
    getCounter: () => get<unknown[]>("/orders/counter"),
    get: (id: string) => get<unknown>(`/orders/${id}`),
    create: (body: unknown) => post<unknown>("/orders", body),
    addItem: (orderId: string, body: unknown) => post<unknown>(`/orders/${orderId}/items`, body),
    decrementItem: (orderId: string, itemId: string) => patch(`/orders/${orderId}/items/${itemId}/decrement`, {}),
    voidItem: (orderId: string, itemId: string) => del(`/orders/${orderId}/items/${itemId}`),
    linkCustomer: (orderId: string, customerId: string) => patch<unknown>(`/orders/${orderId}/customer`, { customerId }),
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
    foodCost: (from: string, to: string) => get<unknown>(`/reports/food-cost?from=${from}&to=${to}`),
    voids: (from: string, to: string) => get<unknown[]>(`/reports/voids?from=${from}&to=${to}`),
    staffPerformance: (from: string, to: string) => get<unknown[]>(`/reports/staff-performance?from=${from}&to=${to}`),
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
    exportGstr1: async (from: string, to: string) => {
      const data = await get<{ from: string; to: string; summary: unknown[]; totalBills: number }>(`/reports/gstr1?from=${from}&to=${to}`)
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = `gstr1-${from}-to-${to}.json`; a.click()
      URL.revokeObjectURL(url)
    },
  },
  cashEntries: {
    list: (from: string, to: string) => get<unknown[]>(`/shifts/cash-entries?from=${from}&to=${to}`),
    create: (body: unknown) => post<unknown>("/shifts/cash-entries", body),
    delete: (id: string) => del(`/shifts/cash-entries/${id}`),
  },
  outlet: {
    get: () => get<{ id: string; name: string; address: string; phone: string; gstin?: string; fssaiNumber?: string; timezone: string; currency: string; upiVpa?: string; razorpayKeyId?: string; setupCode: string; settings?: { deliveryEnabled?: boolean } }>("/outlet"),
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
    exportMovementsCsv: async (from?: string, to?: string) => {
      const token = localStorage.getItem("inbill_token")
      const params = new URLSearchParams()
      if (from) params.set("from", from)
      if (to) params.set("to", to)
      const res = await fetch(`${BASE}/inventory/movements/export?${params}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      if (!res.ok) throw new ApiError(res.status, "Export failed")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = from && to ? `movements-${from}-to-${to}.csv` : "movements.csv"
      a.click()
      URL.revokeObjectURL(url)
    },
  },
  vendors: {
    list: () => get<unknown[]>("/vendors"),
    create: (body: unknown) => post<unknown>("/vendors", body),
    update: (id: string, body: unknown) => patch<unknown>(`/vendors/${id}`, body),
    delete: (id: string) => del<unknown>(`/vendors/${id}`),
  },
  purchaseOrders: {
    list: (params?: { vendorId?: string; status?: string }) => {
      const q = new URLSearchParams()
      if (params?.vendorId) q.set("vendorId", params.vendorId)
      if (params?.status) q.set("status", params.status)
      return get<unknown[]>(`/purchase-orders${q.toString() ? `?${q}` : ""}`)
    },
    get: (id: string) => get<unknown>(`/purchase-orders/${id}`),
    create: (body: unknown) => post<unknown>("/purchase-orders", body),
    update: (id: string, body: unknown) => patch<unknown>(`/purchase-orders/${id}`, body),
    markOrdered: (id: string) => post<unknown>(`/purchase-orders/${id}/order`, {}),
    receive: (id: string, body: unknown) => post<unknown>(`/purchase-orders/${id}/receive`, body),
  },
  ai: {
    menuDescription: (body: { name: string; category?: string; dietaryType?: "veg" | "non-veg" }) =>
      post<{ description: string }>("/ai/menu-description", body),
    reportsQuery: (body: { question: string; from?: string; to?: string }) =>
      post<{ answer: string }>("/ai/reports-query", body),
  },
  queue: {
    list: (status?: string) => get<unknown[]>(`/queue${status ? `?status=${status}` : ""}`),
    addWalkIn: (body: { customerName: string; customerPhone?: string | null; partySize: number }) => post<unknown>("/queue", body),
    seat: (id: string, tableId: string) => patch<unknown>(`/queue/${id}/seat`, { tableId }),
    cancel: (id: string, status: "cancelled" | "no_show") => patch<unknown>(`/queue/${id}/cancel`, { status }),
    listReservations: (date?: string) => get<unknown[]>(`/queue/reservations${date ? `?date=${date}` : ""}`),
    createReservation: (body: unknown) => post<unknown>("/queue/reservations", body),
    updateReservation: (id: string, body: unknown) => patch<unknown>(`/queue/reservations/${id}`, body),
    deleteReservation: (id: string) => del<unknown>(`/queue/reservations/${id}`),
  },
  loyalty: {
    getConfig: () => get<{ id: string; pointsPerRupee: string; redeemRate: string; minRedeemPoints: number; isActive: boolean } | null>("/loyalty/config"),
    saveConfig: (body: { pointsPerRupee?: number; redeemRate?: number; minRedeemPoints?: number; isActive?: boolean }) => post<unknown>("/loyalty/config", body),
    getBillInfo: (billId: string) => get<{ customer: { id: string; name?: string | null; phone: string }; totalPoints: number; lifetimePoints: number; tier: string; pointsToEarn: number; redeemValue: number; program: { minRedeemPoints: number; redeemRate: string } } | null>(`/loyalty/bill/${billId}`),
    getCustomerByPhone: (phone: string) => get<{ customer: { id: string; name?: string | null; phone: string }; totalPoints: number; lifetimePoints: number; tier: string }>(`/loyalty/customers/${phone}`),
    redeem: (body: { customerId: string; points: number; billId: string }) => post<{ ok: boolean; pointsDeducted: number; discountApplied: number; newBalance: number; discountLineId: string }>("/loyalty/redeem", body),
    topCustomers: (limit = 20) => get<{ id: string; customerId: string; totalPoints: number; lifetimePoints: number; tier: string; customer: { id: string; name?: string | null; phone: string } | null }[]>(`/loyalty/top-customers?limit=${limit}`),
  },
  owner: {
    register: (body: unknown) => post<{ token: string; owner: { id: string; name: string; email: string } }>("/auth/owner/register", body),
    login: (email: string, password: string) => post<{ token: string; owner: { id: string; name: string; email: string } }>("/auth/owner/login", { email, password }),
    forgotPassword: (email: string) => post<{ ok: boolean }>("/auth/owner/forgot-password", { email }),
    resetPassword: (token: string, newPassword: string) => post<{ ok: boolean }>("/auth/owner/reset-password", { token, newPassword }),
    changePassword: (currentPassword: string, newPassword: string) => ownerRequest<{ ok: boolean }>("/auth/owner/change-password", { method: "PATCH", body: JSON.stringify({ currentPassword, newPassword }) }),
    me: () => oget<{ id: string; name: string; email: string; phone: string }>("/owner/me"),
    outlets: (from?: string, to?: string) => {
      const q = from && to ? `?from=${from}&to=${to}` : ""
      return oget<{ id: string; name: string; address: string; gstin?: string; revenue: number; billCount: number; byPaymentMode: Record<string, number>; openOrderCount: number; razorpayConfigured: boolean; upiVpa?: string; tableCount: number; menuItemCount: number; staffCount: number }[]>(`/owner/outlets${q}`)
    },
    createOutlet: (body: unknown) => opost<unknown>("/owner/outlets", body),
    updateOutlet: (id: string, body: unknown) => opatch<unknown>(`/owner/outlets/${id}`, body),
    outletSummary: (id: string, from: string, to: string) => oget<unknown>(`/owner/outlets/${id}/summary?from=${from}&to=${to}`),
    switchOutlet: (id: string) => opost<{ token: string; user: { id: string; name: string; role: string }; outlet: { id: string; name: string } }>(`/owner/outlets/${id}/switch`, {}),
  },
  public: {
    lanUrl: () => get<{ urls: string[]; port: string }>("/public/lan-url"),
  },
}

export { ApiError }
