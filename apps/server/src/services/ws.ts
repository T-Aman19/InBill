import type { ServerWebSocket } from "bun"
import type { WsEvent } from "@inbill/shared"

type WsData = { outletId: string; rooms: Set<string> }

const sockets = new Map<string, Set<ServerWebSocket<WsData>>>()

function getRoomKey(outletId: string, room: string) {
  return `${outletId}:${room}`
}

export const wsHandlers = {
  open(ws: ServerWebSocket<WsData>) {
    const key = getRoomKey(ws.data.outletId, "outlet")
    if (!sockets.has(key)) sockets.set(key, new Set())
    sockets.get(key)!.add(ws)
  },

  message(ws: ServerWebSocket<WsData>, raw: string | Buffer) {
    try {
      const msg = JSON.parse(raw.toString()) as { action: "subscribe"; room: string }
      if (msg.action === "subscribe") {
        const key = getRoomKey(ws.data.outletId, msg.room)
        ws.data.rooms.add(key)
        if (!sockets.has(key)) sockets.set(key, new Set())
        sockets.get(key)!.add(ws)
      }
    } catch {
      // ignore malformed messages
    }
  },

  close(ws: ServerWebSocket<WsData>) {
    for (const key of ws.data.rooms) {
      sockets.get(key)?.delete(ws)
    }
    sockets.get(getRoomKey(ws.data.outletId, "outlet"))?.delete(ws)
  },
}

export function broadcast(outletId: string, room: string, event: WsEvent) {
  const key = getRoomKey(outletId, room)
  const payload = JSON.stringify(event)
  sockets.get(key)?.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload)
  })
}

export function broadcastOutlet(outletId: string, event: WsEvent) {
  broadcast(outletId, "outlet", event)
}
