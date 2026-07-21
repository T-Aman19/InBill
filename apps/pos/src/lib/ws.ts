import { WS_PROTOCOL } from "@inbill/shared"

type WsEvent = { type: string; payload: unknown }
type Listener = (event: WsEvent) => void

class WsClient {
  private ws: WebSocket | null = null
  private listeners = new Map<string, Set<Listener>>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldConnect = false
  private outletId = ""

  connect(outletId?: string) {
    const changedOutlet = outletId !== undefined && outletId !== this.outletId
    if (outletId) this.outletId = outletId
    this.shouldConnect = true
    // Reuse an existing socket unless the outlet changed — avoids stacking
    // duplicate connections (and duplicate event delivery) on repeated connect() calls.
    if (this.ws && !changedOutlet && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return
    if (changedOutlet && this.ws) { this.ws.onclose = null; this.ws.close(); this.ws = null }
    this._connect()
  }

  private _connect() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    // Authenticate the handshake: the server derives the outlet from this token.
    // Without it the upgrade is rejected, so don't even open the socket.
    const token = localStorage.getItem("inbill_token")
    if (!token) return
    const isEmbedded =
      location.protocol === "tauri:" || location.port === "5173"
    const wsHost = isEmbedded ? "localhost:3000" : location.host
    const proto = location.protocol === "https:" ? "wss" : "ws"
    this.ws = new WebSocket(`${proto}://${wsHost}/ws`, [WS_PROTOCOL, token])

    this.ws.onopen = () => {
      console.log("[WS] connected")
      // Subscribe to outlet-wide events
      this.ws?.send(JSON.stringify({ action: "subscribe", room: "outlet" }))
      this.ws?.send(JSON.stringify({ action: "subscribe", room: "kitchen" }))
    }

    this.ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data as string) as WsEvent
        this.listeners.get(event.type)?.forEach((fn) => fn(event))
        this.listeners.get("*")?.forEach((fn) => fn(event))
      } catch {
        // ignore
      }
    }

    this.ws.onclose = () => {
      if (!this.shouldConnect) return
      console.log("[WS] disconnected, retrying in 3s")
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
