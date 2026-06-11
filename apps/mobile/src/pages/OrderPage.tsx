import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams, useSearch } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import type { Category, MenuItem, ItemVariant, ModifierGroup, Modifier, ItemModLink, Order, OrderItem } from "@/lib/api"
import { ws } from "@/lib/ws"
import { formatCurrency } from "@/lib/utils"

// ─── KOT status chip ─────────────────────────────────────────────────────────
function KotChip({ status }: { status?: string | null }) {
  if (!status || status === "done") return null
  const map: Record<string, { label: string; tone: string }> = {
    pending:      { label: "In kitchen", tone: "amber" },
    acknowledged: { label: "Acknowledged", tone: "blue" },
  }
  const cfg = map[status]
  if (!cfg) return null
  return <span className={`badge ${cfg.tone}`}><span className={`dot ${cfg.tone}`} />{cfg.label}</span>
}

// ─── Order item row ───────────────────────────────────────────────────────────
function OrderItemRow({
  item,
  onDecrement,
  canEdit,
}: {
  item: OrderItem
  onDecrement: () => void
  canEdit: boolean
}) {
  if (item.isVoided) return null
  const isSent = !!item.kotId

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 0",
      borderBottom: "1px solid var(--color-line)",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
        {item.variantName && (
          <div style={{ fontSize: 12, color: "var(--color-ink-3)" }}>{item.variantName}</div>
        )}
        {item.modifiers.length > 0 && (
          <div style={{ fontSize: 11, color: "var(--color-ink-3)" }}>
            + {item.modifiers.map((m) => m.name).join(", ")}
          </div>
        )}
        <div style={{ marginTop: 4 }}>
          {isSent
            ? <KotChip status={item.kotStatus} />
            : <span className="badge"><span className="dot gray" />Unsent</span>
          }
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--color-ink-2)", textAlign: "right" }}>
          {formatCurrency(Number(item.unitPrice) * item.quantity)}
        </div>
        {canEdit && !isSent && (
          <button
            onClick={onDecrement}
            style={{
              width: 28, height: 28, borderRadius: 8,
              border: "1px solid var(--color-line)",
              background: "var(--color-surface-2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", flexShrink: 0,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        )}
        <div style={{ fontSize: 13, fontWeight: 600, width: 20, textAlign: "center" }}>
          ×{item.quantity}
        </div>
      </div>
    </div>
  )
}

// ─── Variant + modifier picker sheet ─────────────────────────────────────────
function PickerSheet({
  item,
  variants,
  modifierGroups,
  modifiers,
  itemModLinks,
  onConfirm,
  onCancel,
}: {
  item: MenuItem
  variants: ItemVariant[]
  modifierGroups: ModifierGroup[]
  modifiers: Modifier[]
  itemModLinks: ItemModLink[]
  onConfirm: (variantId?: string, mods?: string[]) => void
  onCancel: () => void
}) {
  const itemVariants = variants.filter((v) => v.itemId === item.id && v.isActive)
  const linkedGroupIds = itemModLinks.filter((l) => l.itemId === item.id).map((l) => l.groupId)
  const groups = modifierGroups.filter((g) => linkedGroupIds.includes(g.id))

  const [selectedVariant, setSelectedVariant] = useState<string | undefined>(
    itemVariants.length === 1 ? itemVariants[0]?.id : undefined,
  )
  const [selectedMods, setSelectedMods] = useState<string[]>([])

  const hasVariants  = itemVariants.length > 0
  const hasModifiers = groups.length > 0
  const canConfirm   = !hasVariants || !!selectedVariant

  function toggleMod(id: string, group: ModifierGroup) {
    setSelectedMods((prev) => {
      if (prev.includes(id)) return prev.filter((m) => m !== id)
      if (!group.multiSelect) {
        const groupModIds = modifiers.filter((m) => m.groupId === group.id).map((m) => m.id)
        return [...prev.filter((m) => !groupModIds.includes(m)), id]
      }
      return [...prev, id]
    })
  }

  const price = selectedVariant
    ? Number(itemVariants.find((v) => v.id === selectedVariant)?.price ?? item.basePrice)
    : Number(item.basePrice)
  const modTotal = selectedMods.reduce((s, id) => {
    const m = modifiers.find((x) => x.id === id)
    return s + Number(m?.price ?? 0)
  }, 0)

  return (
    <>
      {/* Overlay */}
      <div
        className="animate-overlay-in"
        onClick={onCancel}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 40,
        }}
      />
      {/* Sheet */}
      <div
        className="animate-slide-up"
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
          background: "var(--color-surface)",
          borderRadius: "20px 20px 0 0",
          paddingBottom: "calc(16px + var(--safe-bottom))",
          maxHeight: "80dvh",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--color-line-strong)" }} />
        </div>

        {/* Header */}
        <div style={{ padding: "12px 20px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 600 }}>{item.name}</div>
              <div style={{ fontSize: 13, color: "var(--color-ink-3)", marginTop: 2 }}>
                {formatCurrency(price + modTotal)}
              </div>
            </div>
            <button
              onClick={onCancel}
              style={{ background: "transparent", border: "none", padding: 4, cursor: "pointer", color: "var(--color-ink-3)" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <div className="scroll" style={{ flex: 1, padding: "0 20px" }}>
          {/* Variants */}
          {hasVariants && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--color-ink-3)", marginBottom: 10 }}>
                Size / Variant
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {itemVariants.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVariant(v.id)}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "12px 14px", borderRadius: 12,
                      border: `1.5px solid ${selectedVariant === v.id ? "var(--color-accent)" : "var(--color-line)"}`,
                      background: selectedVariant === v.id ? "var(--color-accent-soft)" : "var(--color-surface)",
                      cursor: "pointer", WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: selectedVariant === v.id ? 600 : 400 }}>{v.name}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{formatCurrency(v.price)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Modifiers */}
          {hasModifiers && groups.map((group) => (
            <div key={group.id} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--color-ink-3)", marginBottom: 2 }}>
                {group.name}
                {group.required && <span style={{ color: "var(--color-red)", marginLeft: 4 }}>*</span>}
              </div>
              <div style={{ fontSize: 11, color: "var(--color-ink-4)", marginBottom: 10 }}>
                {group.multiSelect ? "Select any" : "Select one"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {modifiers.filter((m) => m.groupId === group.id && m.isActive).map((m) => {
                  const active = selectedMods.includes(m.id)
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleMod(m.id, group)}
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "12px 14px", borderRadius: 12,
                        border: `1.5px solid ${active ? "var(--color-accent)" : "var(--color-line)"}`,
                        background: active ? "var(--color-accent-soft)" : "var(--color-surface)",
                        cursor: "pointer", WebkitTapHighlightColor: "transparent",
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: active ? 600 : 400 }}>{m.name}</span>
                      {Number(m.price) > 0 && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--color-ink-3)" }}>
                          +{formatCurrency(m.price)}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: "12px 20px 0" }}>
          <button
            className="btn primary full lg"
            disabled={!canConfirm}
            onClick={() => onConfirm(selectedVariant, selectedMods)}
          >
            Add to Order
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Order summary bottom sheet ───────────────────────────────────────────────
function OrderSheet({
  order,
  onDecrement,
  onKot,
  kotLoading,
  onClose,
}: {
  order: Order
  onDecrement: (itemId: string) => void
  onKot: () => void
  kotLoading: boolean
  onClose: () => void
}) {
  const activeItems = order.items.filter((i) => !i.isVoided)
  const unsentCount = activeItems.filter((i) => !i.kotId).length
  const total = activeItems.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0)
  const canKot = unsentCount > 0

  return (
    <>
      <div className="animate-overlay-in" onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.3)", zIndex: 40,
      }} />
      <div className="animate-slide-up" style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
        background: "var(--color-surface)",
        borderRadius: "20px 20px 0 0",
        paddingBottom: "calc(16px + var(--safe-bottom))",
        maxHeight: "70dvh",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--color-line-strong)" }} />
        </div>
        <div style={{ padding: "12px 20px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Order ({activeItems.length} items)</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 600 }}>{formatCurrency(total)}</div>
        </div>

        <div className="scroll" style={{ flex: 1, padding: "0 20px" }}>
          {activeItems.map((item) => (
            <OrderItemRow
              key={item.id}
              item={item}
              onDecrement={() => onDecrement(item.id)}
              canEdit={true}
            />
          ))}
        </div>

        <div style={{ padding: "12px 20px 0" }}>
          <button
            className={`btn full lg ${canKot ? "green" : ""}`}
            disabled={!canKot || kotLoading}
            onClick={onKot}
          >
            {kotLoading
              ? "Sending…"
              : canKot
                ? `Send ${unsentCount} item${unsentCount > 1 ? "s" : ""} to Kitchen`
                : "All items sent"
            }
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function OrderPage() {
  const { orderId: routeOrderId } = useParams({ from: "/order/$orderId" })
  const { tableId, customerId }   = useSearch({ from: "/order/$orderId" })
  const navigate                  = useNavigate()
  const qc                        = useQueryClient()

  const isNew = routeOrderId === "new"
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(isNew ? null : routeOrderId)
  const orderIdRef = useRef(currentOrderId)
  useEffect(() => { orderIdRef.current = currentOrderId }, [currentOrderId])

  const [activeCat,    setActiveCat]    = useState<string | null>(null)
  const [showSheet,    setShowSheet]    = useState(false)
  const [pickerItem,   setPickerItem]   = useState<MenuItem | null>(null)
  const [kotLoading,   setKotLoading]   = useState(false)
  const [addingItem,   setAddingItem]   = useState<string | null>(null)

  const { data: menu } = useQuery({
    queryKey: ["menu"],
    queryFn: () => api.menu.getAll(),
  })

  const { data: order } = useQuery({
    queryKey: ["order", currentOrderId],
    queryFn: () => api.orders.get(currentOrderId!),
    enabled: !!currentOrderId,
  })

  useEffect(() => {
    if (menu?.categories?.[0] && !activeCat) setActiveCat(menu.categories[0]?.id ?? null)
  }, [menu, activeCat])

  useEffect(() => {
    if (!currentOrderId) return
    const unsub = ws.on("order.updated", (e) => {
      const updated = e.payload as Order
      if (updated.id === currentOrderId) qc.setQueryData(["order", currentOrderId], updated)
    })
    return unsub
  }, [currentOrderId, qc])

  async function handleAddItem(item: MenuItem, variantId?: string, modifiers?: string[]) {
    setPickerItem(null)
    setAddingItem(item.id)
    try {
      let oid = orderIdRef.current
      if (!oid) {
        const newOrder = await api.orders.create({ type: "dine_in", tableId, customerId })
        oid = newOrder.id
        setCurrentOrderId(oid)
        orderIdRef.current = oid
      }
      await api.orders.addItem(oid, { menuItemId: item.id, quantity: 1, variantId, modifiers: modifiers ?? [] })
      qc.invalidateQueries({ queryKey: ["order", oid] })
      if (isNew) navigate({ to: "/order/$orderId", params: { orderId: oid }, search: { tableId: undefined, customerId: undefined }, replace: true })
    } finally {
      setAddingItem(null)
    }
  }

  function tapItem(item: MenuItem) {
    if (!item.isAvailable) return
    const variants  = menu?.variants.filter((v) => v.itemId === item.id && v.isActive) ?? []
    const hasGroups = (menu?.itemModifierGroups.filter((l) => l.itemId === item.id).length ?? 0) > 0
    if (variants.length > 0 || hasGroups) {
      setPickerItem(item)
    } else {
      void handleAddItem(item)
    }
  }

  async function handleDecrement(itemId: string) {
    if (!currentOrderId) return
    await api.orders.decrementItem(currentOrderId, itemId)
    qc.invalidateQueries({ queryKey: ["order", currentOrderId] })
  }

  async function handleKot() {
    if (!currentOrderId) return
    setKotLoading(true)
    try {
      await api.kots.generate(currentOrderId)
      qc.invalidateQueries({ queryKey: ["order", currentOrderId] })
      setShowSheet(false)
    } finally {
      setKotLoading(false)
    }
  }

  const categories: Category[] = menu?.categories ?? []
  const items: MenuItem[] = menu?.items ?? []

  const catItems = items.filter(
    (i) => i.categoryId === activeCat && i.isAvailable,
  )

  const activeItems  = order?.items.filter((i) => !i.isVoided) ?? []
  const unsentCount  = activeItems.filter((i) => !i.kotId).length
  const orderTotal   = activeItems.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0)

  const tableName = order?.tableName ?? (tableId ? `Table` : "Order")

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "var(--color-bg)" }}>
      {/* Top bar */}
      <div style={{
        paddingTop: "calc(12px + var(--safe-top))",
        paddingLeft: 16, paddingRight: 16, paddingBottom: 0,
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-line)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 12 }}>
          <button
            onClick={() => navigate({ to: "/floor" })}
            style={{
              background: "transparent", border: "none", padding: 4,
              cursor: "pointer", color: "var(--color-ink-2)",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{tableName}</div>
          </div>
          {activeItems.length > 0 && (
            <button
              onClick={() => setShowSheet(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: 10,
                background: "var(--color-accent-soft)",
                border: "1px solid var(--color-accent)",
                cursor: "pointer", WebkitTapHighlightColor: "transparent",
                color: "var(--color-accent-ink)",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>{activeItems.length} items</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{formatCurrency(orderTotal)}</span>
            </button>
          )}
        </div>

        {/* Category tabs */}
        <div style={{
          display: "flex", gap: 0, overflowX: "auto",
          scrollbarWidth: "none", marginLeft: -16, marginRight: -16,
          paddingLeft: 16,
        }}>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCat(cat.id)}
              style={{
                padding: "10px 16px",
                fontSize: 13, fontWeight: activeCat === cat.id ? 600 : 400,
                color: activeCat === cat.id ? "var(--color-accent-ink)" : "var(--color-ink-3)",
                background: "transparent", border: "none", cursor: "pointer",
                borderBottom: `2px solid ${activeCat === cat.id ? "var(--color-accent)" : "transparent"}`,
                whiteSpace: "nowrap",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Menu item grid */}
      <div className="scroll" style={{ flex: 1, padding: 12 }}>
        {catItems.length === 0 && (
          <div style={{ textAlign: "center", padding: 48, color: "var(--color-ink-3)" }}>
            No items in this category
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          {catItems.map((item) => {
            const isAdding = addingItem === item.id
            return (
              <button
                key={item.id}
                onClick={() => tapItem(item)}
                disabled={isAdding}
                style={{
                  textAlign: "left", width: "100%",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-line)",
                  borderRadius: 14, padding: "12px",
                  cursor: "pointer", opacity: isAdding ? .6 : 1,
                  boxShadow: "var(--shadow-1)",
                  display: "flex", flexDirection: "column",
                  WebkitTapHighlightColor: "transparent",
                  touchAction: "manipulation",
                  transition: "opacity .1s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <span className={`veg-dot ${item.isVeg ? "veg" : "nonveg"}`} />
                  {isAdding && (
                    <span style={{ fontSize: 11, color: "var(--color-accent-ink)", fontWeight: 600 }}>Adding…</span>
                  )}
                </div>
                <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.3, marginBottom: 6, flex: 1 }}>
                  {item.name}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--color-ink-2)" }}>
                  {formatCurrency(item.basePrice)}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Sticky bottom bar — KOT button */}
      {(currentOrderId || unsentCount > 0) && (
        <div style={{
          padding: `10px 16px calc(10px + var(--safe-bottom))`,
          background: "var(--color-surface)",
          borderTop: "1px solid var(--color-line)",
          flexShrink: 0,
        }}>
          <button
            className={`btn full lg ${unsentCount > 0 ? "green" : "ghost"}`}
            disabled={unsentCount === 0 || kotLoading}
            onClick={unsentCount > 0 ? handleKot : () => setShowSheet(true)}
          >
            {kotLoading
              ? "Sending to kitchen…"
              : unsentCount > 0
                ? `Send ${unsentCount} item${unsentCount > 1 ? "s" : ""} to Kitchen`
                : `View order (${activeItems.length})`
            }
          </button>
        </div>
      )}

      {/* Variant / modifier picker */}
      {pickerItem && menu && (
        <PickerSheet
          item={pickerItem}
          variants={menu.variants}
          modifierGroups={menu.modifierGroups}
          modifiers={menu.modifiers}
          itemModLinks={menu.itemModifierGroups}
          onConfirm={(variantId, mods) => void handleAddItem(pickerItem, variantId, mods)}
          onCancel={() => setPickerItem(null)}
        />
      )}

      {/* Order summary sheet */}
      {showSheet && order && (
        <OrderSheet
          order={order}
          onDecrement={(id) => void handleDecrement(id)}
          onKot={handleKot}
          kotLoading={kotLoading}
          onClose={() => setShowSheet(false)}
        />
      )}
    </div>
  )
}
