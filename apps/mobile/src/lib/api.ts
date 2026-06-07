// Dev (port 5174) hits the proxy; prod/LAN uses relative paths from same origin.
const BASE = "/api"

export class ApiError extends Error {
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
    throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

const get   = <T>(path: string) => request<T>(path, { method: "GET" })
const post  = <T>(path: string, body: unknown) => request<T>(path, { method: "POST",  body: JSON.stringify(body) })
const patch = <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) })

export type AuthUser = { id: string; name: string; role: string }

export const api = {
  auth: {
    login: (pin: string, outletId: string) =>
      post<{ token: string; user: AuthUser }>("/auth/login", { pin, outletId }),
    resolveSetupCode: (code: string) =>
      get<{ id: string; name: string }>(`/auth/outlet-setup/${encodeURIComponent(code)}`),
  },
  tables: {
    getAll: () => get<{ floors: Floor[]; tables: Table[] }>("/tables"),
  },
  menu: {
    getAll: () =>
      get<{
        categories: Category[]
        items: MenuItem[]
        variants: ItemVariant[]
        modifierGroups: ModifierGroup[]
        modifiers: Modifier[]
        itemModifierGroups: ItemModLink[]
      }>("/menu"),
  },
  orders: {
    get: (id: string) => get<Order>(`/orders/${id}`),
    create: (body: { type: string; tableId?: string }) => post<Order>("/orders", body),
    addItem: (orderId: string, body: AddItemBody) => post<unknown>(`/orders/${orderId}/items`, body),
    decrementItem: (orderId: string, itemId: string) =>
      patch<unknown>(`/orders/${orderId}/items/${itemId}/decrement`, {}),
  },
  kots: {
    generate: (orderId: string) => post<unknown>(`/orders/${orderId}/kot`, {}),
  },
}

// ─── Domain types ────────────────────────────────────────────────────────────

export type Floor        = { id: string; name: string; sortOrder: number }
export type Table        = {
  id: string; name: string; capacity: number
  status: "available" | "occupied" | "reserved" | "billed"
  currentOrderId: string | null; floorId: string
  openedAt?: string; total?: number; items?: number
}
export type Category     = { id: string; name: string; sortOrder: number }
export type MenuItem     = { id: string; categoryId: string; name: string; basePrice: string; isVeg: boolean; isAvailable: boolean }
export type ItemVariant  = { id: string; itemId: string; name: string; price: string; isActive: boolean }
export type ModifierGroup = { id: string; name: string; required: boolean; multiSelect: boolean }
export type Modifier     = { id: string; groupId: string; name: string; price: string; isActive: boolean }
export type ItemModLink  = { itemId: string; groupId: string }

export type OrderItem = {
  id: string; menuItemId: string
  variantId?: string | null; variantName?: string | null
  name: string; unitPrice: string; quantity: number
  isVoided: boolean; kotId: string | null
  kotStatus?: string | null
  modifiers: { name: string; price: string }[]
}
export type Order = {
  id: string; type: string; status: string
  tableId?: string | null; tableName?: string; billId?: string | null
  items: OrderItem[]
}
export type AddItemBody = {
  menuItemId: string; quantity: number
  variantId?: string; modifiers?: string[]
}
