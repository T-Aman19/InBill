const BASE = "/api"

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("inbill_host_token")
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

const get  = <T>(path: string) => request<T>(path, { method: "GET" })
const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) })
const patch = <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) })

export type TableStatus = "available" | "occupied" | "reserved" | "billed"
export type Table = {
  id: string
  name: string
  capacity: number
  status: TableStatus
  currentOrderId: string | null
  floorId: string
  openedAt?: string
}
export type Floor = { id: string; name: string; sortOrder: number }
export type QueueEntry = {
  id: string
  customerName: string
  customerPhone: string | null
  partySize: number
  token: string
  status: string
  tableId: string | null
  joinedAt: string
  seatedAt: string | null
  cancelledAt: string | null
}

export const api = {
  auth: {
    login: (pin: string, outletId: string) =>
      post<{ token: string; user: { id: string; name: string; role: string } }>("/auth/login", { pin, outletId }),
    resolveSetupCode: (code: string) =>
      get<{ id: string; name: string }>(`/auth/outlet-setup/${encodeURIComponent(code)}`),
  },
  tables: {
    getAll: () => get<{ floors: Floor[]; tables: Table[] }>("/tables"),
  },
  queue: {
    list: (status?: string) => get<QueueEntry[]>(`/queue${status ? `?status=${status}` : ""}`),
    addWalkIn: (body: { customerName: string; customerPhone?: string | null; partySize: number }) =>
      post<QueueEntry>("/queue", body),
    seat: (id: string, tableId: string) => patch<{ customerId?: string | null }>(`/queue/${id}/seat`, { tableId }),
    cancel: (id: string, status: "cancelled" | "no_show") => patch<unknown>(`/queue/${id}/cancel`, { status }),
  },
  outlet: {
    get: () => get<{ id: string; name: string }>("/outlet"),
  },
}

export { ApiError }
