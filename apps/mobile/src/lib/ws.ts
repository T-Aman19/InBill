import { WS_PROTOCOL } from "@inbill/shared"

type WsEvent  = { type: string; payload: unknown }
type Listener = (event: WsEvent) => void

class WsClient {
  private ws: WebSocket | null = null
  private listeners = new Map<string, Set<Listener>>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldConnect = false

  // outletId arg kept for call-site compatibility; the server now derives the
  // outlet from the authenticated token, so the client no longer sends it.
  connect(_outletId?: string) {
    this.shouldConnect = true
    this._connect()
  }

  private _connect() {
    // Authenticate the handshake: the server derives the outlet from this token.
    const token = localStorage.getItem("inbill_token")
    if (!token) return
    // Always on the same origin — served by the Hono server in all environments
    const proto  = location.protocol === "https:" ? "wss" : "ws"
    const host   = location.host
    this.ws = new WebSocket(`${proto}://${host}/ws`, [WS_PROTOCOL, token])

    this.ws.onopen = () => {
      this.ws?.send(JSON.stringify({ action: "subscribe", room: "outlet" }))
    }

    this.ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data as string) as WsEvent
        this.listeners.get(event.type)?.forEach((fn) => fn(event))
        this.listeners.get("*")?.forEach((fn) => fn(event))
      } catch { /* ignore */ }
    }

    this.ws.onclose = () => {
      if (!this.shouldConnect) return
      this.reconnectTimer = setTimeout(() => this._connect(), 3000)
    }
  }

  disconnect() {
    this.shouldConnect = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }

  on(type: string, fn: Listener): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(fn)
    return () => { this.listeners.get(type)?.delete(fn) }
  }
}

export const ws = new WsClient()
