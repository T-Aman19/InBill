class WsClient {
    ws = null;
    listeners = new Map();
    reconnectTimer = null;
    shouldConnect = false;
    outletId = "";
    connect(outletId) {
        if (outletId)
            this.outletId = outletId;
        this.shouldConnect = true;
        this._connect();
    }
    _connect() {
        const isEmbedded = location.protocol === "tauri:" || location.port === "5173";
        const wsHost = isEmbedded ? "localhost:3000" : location.host;
        const proto = location.protocol === "https:" ? "wss" : "ws";
        const params = this.outletId ? `?outletId=${this.outletId}` : "";
        this.ws = new WebSocket(`${proto}://${wsHost}/ws${params}`);
        this.ws.onopen = () => {
            console.log("[WS] connected");
            // Subscribe to outlet-wide events
            this.ws?.send(JSON.stringify({ action: "subscribe", room: "outlet" }));
            this.ws?.send(JSON.stringify({ action: "subscribe", room: "kitchen" }));
        };
        this.ws.onmessage = (e) => {
            try {
                const event = JSON.parse(e.data);
                this.listeners.get(event.type)?.forEach((fn) => fn(event));
                this.listeners.get("*")?.forEach((fn) => fn(event));
            }
            catch {
                // ignore
            }
        };
        this.ws.onclose = () => {
            if (!this.shouldConnect)
                return;
            console.log("[WS] disconnected, retrying in 3s");
            this.reconnectTimer = setTimeout(() => this._connect(), 3000);
        };
    }
    disconnect() {
        this.shouldConnect = false;
        if (this.reconnectTimer)
            clearTimeout(this.reconnectTimer);
        this.ws?.close();
        this.ws = null;
    }
    on(type, fn) {
        if (!this.listeners.has(type))
            this.listeners.set(type, new Set());
        this.listeners.get(type).add(fn);
        return () => { this.listeners.get(type)?.delete(fn); };
    }
}
export const ws = new WsClient();
