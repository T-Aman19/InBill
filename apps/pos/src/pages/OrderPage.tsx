import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { useNavigate, useParams, useSearch } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import { ws } from "@/lib/ws"
import { formatCurrency } from "@/lib/utils"
import { useAuthStore } from "@/stores/auth"

type Category         = { id: string; name: string; sortOrder: number }
type MenuItem         = { id: string; categoryId: string; name: string; basePrice: string; isVeg: boolean; isAvailable: boolean }
type ItemVariant      = { id: string; itemId: string; name: string; price: string; isActive: boolean }
type ModifierGroup    = { id: string; name: string; required: boolean; multiSelect: boolean }
type Modifier         = { id: string; groupId: string; name: string; price: string; isActive: boolean }
type ItemModLink      = { itemId: string; groupId: string }
type OrderItem        = { id: string; menuItemId: string; variantId?: string | null; variantName?: string | null; name: string; unitPrice: string; quantity: number; isVoided: boolean; kotId: string | null; kotStatus?: string | null; modifiers: { name: string; price: string }[] }
type Order            = { id: string; type: string; status: string; tableId?: string | null; tableName?: string; billId?: string | null; billIsPaid?: boolean | null; items: OrderItem[] }
type TableRow         = { id: string; name: string; status: string; currentOrderId?: string | null }
type OpenOrder        = { id: string; tableId?: string | null; type: string; status: string; items: { isVoided: boolean; quantity: number }[] }

const TAX_RATE = 0.10

/** Deterministic warm color from item name for thumbnail placeholder */
function itemThumbColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  const hues = [28, 42, 56, 90, 148, 195]
  const l    = [78, 82, 80, 84, 78, 76]
  const idx  = Math.abs(h) % hues.length
  return `oklch(${l[idx]}% 0.1 ${hues[idx]})`
}

export default function OrderPage() {
  const { orderId: routeOrderId } = useParams({ from: "/order/$orderId" })
  const { tableId, customerId }   = useSearch({ from: "/order/$orderId" })
  const navigate                  = useNavigate()
  const qc                        = useQueryClient()
  const userRole                  = useAuthStore((s) => s.user?.role)

  const [activeCat, setActiveCat] = useState<string | null>(null)
  const [search, setSearch]       = useState("")

  // Variant / modifier picker state
  const [pendingItem, setPendingItem]           = useState<MenuItem | null>(null)
  const [pendingVariantId, setPendingVariantId] = useState<string | null>(null)
  const [showVariants, setShowVariants]         = useState(false)
  const [showModifiers, setShowModifiers]       = useState(false)
  const [selectedMods, setSelectedMods]         = useState<string[]>([])

  // Transfer / merge modal state
  const [showTransfer, setShowTransfer] = useState(false)
  const [showMerge, setShowMerge]       = useState(false)
  const [showOverflow, setShowOverflow] = useState(false)

  const isNew = routeOrderId === "new"
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(isNew ? null : routeOrderId)
  const orderIdRef = useRef(currentOrderId)
  useEffect(() => { orderIdRef.current = currentOrderId }, [currentOrderId])

  const { data: menu } = useQuery({
    queryKey: ["menu"],
    queryFn: () => api.menu.getAll() as Promise<{
      categories: Category[]; items: MenuItem[]
      variants: ItemVariant[]; modifierGroups: ModifierGroup[]
      modifiers: Modifier[]; itemModifierGroups: ItemModLink[]
    }>,
  })

  const { data: order } = useQuery({
    queryKey: ["order", currentOrderId],
    queryFn: () => api.orders.get(currentOrderId!) as Promise<Order>,
    enabled: !!currentOrderId,
  })

  const { data: tablesData } = useQuery({
    queryKey: ["tables"],
    queryFn: () => api.tables.getAll() as Promise<{ floors: unknown[]; tables: TableRow[] }>,
    enabled: showTransfer || showMerge,
  })

  const { data: openOrders } = useQuery({
    queryKey: ["orders"],
    queryFn: () => api.orders.getOpen() as Promise<OpenOrder[]>,
    enabled: showMerge,
  })

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (menu?.categories?.[0] && !activeCat) setActiveCat(menu.categories[0].id)
  }, [menu])

  useEffect(() => {
    if (!currentOrderId) return
    const unsub = ws.on("order.updated", (e) => {
      const updated = e.payload as Order
      if (updated.id === currentOrderId) qc.setQueryData(["order", currentOrderId], updated)
    })
    return unsub
  }, [currentOrderId, qc])

  const addItemMutation = useMutation({
    mutationFn: async (params: { menuItemId: string; variantId?: string; modifiers?: string[] }) => {
      let oid = orderIdRef.current
      // Recover table/type from cancelled order — URL search params are gone after first navigate
      let effectiveTableId: string | undefined = tableId
      let effectiveType: "dine_in" | "takeaway" | "delivery" = "dine_in"

      // If the existing order was auto-cancelled (all items voided), start a fresh one
      if (oid) {
        const cached = qc.getQueryData<Order>(["order", oid])
        if (cached?.status === "cancelled") {
          if (cached.tableId) effectiveTableId = cached.tableId
          if (cached.type) effectiveType = cached.type as typeof effectiveType
          oid = null
          setCurrentOrderId(null)
          orderIdRef.current = null
        }
      }
      if (!oid) {
        const newOrder = await api.orders.create({ type: effectiveType, tableId: effectiveTableId, customerId }) as { id: string }
        oid = newOrder.id
        setCurrentOrderId(oid)
        orderIdRef.current = oid
      }
      return { oid, item: await api.orders.addItem(oid, { menuItemId: params.menuItemId, variantId: params.variantId, quantity: 1, modifiers: params.modifiers ?? [] }) }
    },
    onSuccess: ({ oid }) => {
      qc.invalidateQueries({ queryKey: ["order", oid] })
      if (isNew || oid !== routeOrderId) navigate({ to: "/order/$orderId", params: { orderId: oid }, search: { tableId: undefined, customerId: undefined }, replace: true })
    },
  })

  const transferMutation = useMutation({
    mutationFn: (newTableId: string) => api.orders.transfer(currentOrderId!, newTableId),
    onSuccess: () => {
      setShowTransfer(false)
      qc.invalidateQueries({ queryKey: ["order", currentOrderId] })
      qc.invalidateQueries({ queryKey: ["tables"] })
    },
  })

  const mergeMutation = useMutation({
    mutationFn: (sourceOrderId: string) => api.orders.merge(currentOrderId!, sourceOrderId),
    onSuccess: () => {
      setShowMerge(false)
      qc.invalidateQueries({ queryKey: ["order", currentOrderId] })
      qc.invalidateQueries({ queryKey: ["orders"] })
      qc.invalidateQueries({ queryKey: ["tables"] })
    },
  })

  const kotMutation = useMutation({
    mutationFn: () => api.kots.generate(currentOrderId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["order", currentOrderId] }),
  })

  const decrementMutation = useMutation({
    mutationFn: (itemId: string) => api.orders.decrementItem(currentOrderId!, itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["order", currentOrderId] }),
  })

  const voidItemMutation = useMutation({
    mutationFn: (itemId: string) => api.orders.voidItem(currentOrderId!, itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["order", currentOrderId] }),
  })

  function handleMenuItemClick(item: MenuItem) {
    const itemVariants   = (menu?.variants ?? []).filter((v) => v.itemId === item.id && v.isActive)
    const linkedGroupIds = (menu?.itemModifierGroups ?? []).filter((l) => l.itemId === item.id).map((l) => l.groupId)
    const hasModifiers   = linkedGroupIds.length > 0 &&
      (menu?.modifiers ?? []).some((m) => linkedGroupIds.includes(m.groupId) && m.isActive)

    if (itemVariants.length > 0 || hasModifiers) {
      setPendingItem(item)
      setPendingVariantId(null)
      setSelectedMods([])
      if (itemVariants.length > 0) setShowVariants(true)
      else setShowModifiers(true)
    } else {
      addItemMutation.mutate({ menuItemId: item.id })
    }
  }

  function handleVariantChosen(variantId: string) {
    setPendingVariantId(variantId)
    setShowVariants(false)
    if (!pendingItem) return
    const linkedGroupIds = (menu?.itemModifierGroups ?? []).filter((l) => l.itemId === pendingItem.id).map((l) => l.groupId)
    const hasModifiers   = linkedGroupIds.length > 0 &&
      (menu?.modifiers ?? []).some((m) => linkedGroupIds.includes(m.groupId) && m.isActive)
    if (hasModifiers) {
      setShowModifiers(true)
    } else {
      addItemMutation.mutate({ menuItemId: pendingItem.id, variantId })
      setPendingItem(null)
    }
  }

  function handleModifiersConfirm() {
    if (!pendingItem) return
    setShowModifiers(false)
    addItemMutation.mutate({ menuItemId: pendingItem.id, variantId: pendingVariantId ?? undefined, modifiers: selectedMods })
    setPendingItem(null)
    setPendingVariantId(null)
    setSelectedMods([])
  }

  function cancelPicker() {
    setShowVariants(false)
    setShowModifiers(false)
    setPendingItem(null)
    setPendingVariantId(null)
    setSelectedMods([])
  }

  const activeItems    = order?.items.filter((i) => !i.isVoided) ?? []
  const unsentItems    = activeItems.filter((i) => !i.kotId)
  const unsentCount    = unsentItems.reduce((s, i) => s + i.quantity, 0)
  const inKitchenItems = activeItems.filter((i) => i.kotId && i.kotStatus !== "done")
  const doneItems      = activeItems.filter((i) => i.kotId && i.kotStatus === "done")
  const subtotal       = activeItems.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0)
  const tax            = subtotal * TAX_RATE
  const total          = subtotal + tax
  const categories     = menu?.categories ?? []
  const menuItemById   = new Map((menu?.items ?? []).map((m) => [m.id, m]))

  const menuItemsFiltered = (menu?.items ?? []).filter(
    (i) => i.categoryId === activeCat && i.isAvailable &&
           (search === "" || i.name.toLowerCase().includes(search.toLowerCase()))
  )
  const searchResults = search !== "" ? (menu?.items ?? []).filter(
    (i) => i.isAvailable && i.name.toLowerCase().includes(search.toLowerCase())
  ) : []

  const pendingItemVariants = pendingItem ? (menu?.variants ?? []).filter((v) => v.itemId === pendingItem.id && v.isActive) : []
  const pendingGroupIds     = pendingItem ? (menu?.itemModifierGroups ?? []).filter((l) => l.itemId === pendingItem.id).map((l) => l.groupId) : []
  const pendingGroups       = (menu?.modifierGroups ?? []).filter((g) => pendingGroupIds.includes(g.id))

  const availableTables = (tablesData?.tables ?? []).filter((t) => t.status === "available" && t.id !== order?.tableId)
  const mergeableOrders = (openOrders ?? []).filter((o) => o.id !== currentOrderId)

  const canManage   = userRole === "manager" || userRole === "owner" || userRole === "cashier"
  const orderActive = order && order.status !== "billed" && order.status !== "cancelled"
  const isCounter   = order?.type === "takeaway" || order?.type === "delivery"

  const tableLabel = order?.tableName ?? (isNew ? "New Order" : (isCounter ? (order?.type === "takeaway" ? "Takeaway" : "Delivery") : "Order"))

  // Display items in the menu grid (search overrides category)
  const displayItems = search !== "" ? searchResults : menuItemsFiltered

  async function handleBill() {
    if (!currentOrderId) return
    const bill = await api.bills.create({ orderId: currentOrderId }) as { id: string }
    navigate({ to: "/billing/$billId", params: { billId: bill.id } })
  }

  const billBlocked = subtotal === 0
    ? "No items"
    : isCounter
      ? null
      : unsentItems.length > 0
        ? "Send KOT first"
        : inKitchenItems.length > 0
          ? "Items in kitchen"
          : null

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-bg)", position: "relative" }}>

      {/* ── Integrated top bar ─────────────────────────────────────────────── */}
      <div style={{ height: 56, flexShrink: 0, background: "var(--color-surface)", borderBottom: "1px solid var(--color-line)", display: "flex", alignItems: "center", padding: "0 16px", gap: 12 }}>
        <button onClick={() => navigate({ to: "/floor" })} style={{ width: 36, height: 36, borderRadius: 9, border: "1px solid var(--color-line)", background: "transparent", cursor: "pointer", color: "var(--color-ink-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>

        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span className="display" style={{ fontSize: 20, fontWeight: 600 }}>{tableLabel}</span>
          {order && (
            <span style={{ fontSize: 12, color: "var(--color-ink-3)" }}>
              {order.type?.replace("_", " ")}
            </span>
          )}
          {isNew && <span style={{ fontSize: 12, color: "var(--color-ink-3)" }}>dine in</span>}
          {isCounter && !isNew && (
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", background: "rgba(251,146,60,.12)", color: "var(--color-amber)", border: "1px solid rgba(251,146,60,.25)", borderRadius: 6, padding: "2px 7px" }}>
              Pay first
            </span>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Search */}
        <div style={{ display: "flex", alignItems: "center", background: "var(--color-bg)", border: "1px solid var(--color-line)", borderRadius: 10, padding: "0 12px", height: 36, width: 260, gap: 8 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-ink-4)", flexShrink: 0 }}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/></svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${(menu?.items ?? []).length > 0 ? `${(menu?.items ?? []).length} items` : "menu"}…`}
            style={{ border: "none", background: "transparent", outline: "none", fontSize: 13, flex: 1, color: "var(--color-ink)", fontFamily: "inherit" }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ border: "none", background: "transparent", color: "var(--color-ink-4)", cursor: "pointer", padding: 0, lineHeight: 1, fontSize: 16 }}>×</button>
          )}
        </div>

        {/* Overflow (transfer / merge) */}
        {canManage && !isNew && orderActive && order?.type === "dine_in" && (
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowOverflow((v) => !v)} style={{ width: 36, height: 36, borderRadius: 9, border: "1px solid var(--color-line)", background: "transparent", cursor: "pointer", color: "var(--color-ink-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
            </button>
            {showOverflow && (
              <>
                <div onClick={() => setShowOverflow(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                <div style={{ position: "absolute", top: 42, right: 0, background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, padding: 6, boxShadow: "0 8px 24px rgba(0,0,0,.1)", zIndex: 50, minWidth: 180 }}>
                  <button onClick={() => { setShowTransfer(true); setShowOverflow(false) }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "var(--color-ink)", textAlign: "left" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    Transfer table
                  </button>
                  <button onClick={() => { setShowMerge(true); setShowOverflow(false) }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "var(--color-ink)", textAlign: "left" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3m10 0h3a2 2 0 002-2v-3"/></svg>
                    Merge order
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 400px", overflow: "hidden" }}>

        {/* ── Left: menu ──────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid var(--color-line)", overflow: "hidden" }}>

          {/* Category pills — hidden during search */}
          {!search && (
            <div className="scroll" style={{ display: "flex", gap: 6, padding: "10px 16px", background: "var(--color-surface)", borderBottom: "1px solid var(--color-line)", overflowX: "auto", overflowY: "hidden", flexShrink: 0 }}>
              {categories.map((cat) => {
                const active = activeCat === cat.id
                return (
                  <button key={cat.id} onClick={() => setActiveCat(cat.id)} style={{
                    padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 500,
                    background: active ? "var(--color-ink)" : "var(--color-surface)",
                    color: active ? "var(--color-surface)" : "var(--color-ink-2)",
                    border: active ? "1px solid var(--color-ink)" : "1px solid var(--color-line)",
                    cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, transition: "all .1s",
                  }}>
                    {cat.name}
                    <span style={{ marginLeft: 6, fontFamily: "var(--font-mono)", opacity: .5, fontSize: 11 }}>
                      {(menu?.items ?? []).filter((m) => m.categoryId === cat.id).length}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Search header when searching */}
          {search && (
            <div style={{ padding: "10px 16px", background: "var(--color-surface)", borderBottom: "1px solid var(--color-line)", display: "flex", alignItems: "center", gap: 8 }}>
              <span className="eyebrow">Results for "{search}"</span>
              <span style={{ fontSize: 12, color: "var(--color-ink-3)" }}>· {searchResults.length} items</span>
            </div>
          )}

          {/* Items grid */}
          <div className="scroll" style={{ flex: 1, padding: 16, overflowY: "auto" }}>
            {displayItems.length === 0 && search ? (
              <div style={{ textAlign: "center", padding: 60, color: "var(--color-ink-3)", fontSize: 13 }}>
                No items match "{search}"
              </div>
            ) : displayItems.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, color: "var(--color-ink-3)", fontSize: 13 }}>
                No items in this category
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
                {displayItems.map((item) => {
                  const inCart     = activeItems.find((l) => l.menuItemId === item.id && !l.kotId)
                  const hasVariants = (menu?.variants ?? []).some((v) => v.itemId === item.id && v.isActive)
                  const thumbColor = itemThumbColor(item.name)
                  return (
                    <button key={item.id} onClick={() => handleMenuItemClick(item)} style={{
                      appearance: "none", textAlign: "left",
                      background: "var(--color-surface)",
                      border: "1px solid " + (inCart ? "var(--color-ink)" : "var(--color-line)"),
                      borderRadius: 12, padding: 12, cursor: "pointer",
                      display: "flex", gap: 12, alignItems: "flex-start",
                      position: "relative", transition: "all .1s",
                      boxShadow: inCart ? "0 0 0 2px var(--color-ink)" : "0 1px 3px rgba(0,0,0,.04)",
                    }}>
                      {/* Thumbnail */}
                      <div style={{ width: 48, height: 48, borderRadius: 8, background: thumbColor, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                          <span className={`veg-dot ${item.isVeg ? "veg" : "nonveg"}`} />
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3, color: "var(--color-ink)" }}>{item.name}</div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 5 }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-ink-2)", fontWeight: 500 }}>{formatCurrency(item.basePrice)}</span>
                          {hasVariants && <span style={{ fontSize: 10, color: "var(--color-ink-3)", border: "1px solid var(--color-line)", borderRadius: 4, padding: "1px 5px" }}>variants</span>}
                        </div>
                      </div>
                      {inCart && (
                        <span style={{ position: "absolute", top: 8, right: 8, background: "var(--color-ink)", color: "var(--color-surface)", fontSize: 11, fontWeight: 700, minWidth: 20, height: 20, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", padding: "0 5px" }}>
                          {inCart.quantity}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: cart panel ───────────────────────────────────────────────── */}
        <div style={{ background: "var(--color-surface)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Empty state */}
          {activeItems.length === 0 && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "var(--color-ink-3)", padding: 40 }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h9l4 4v13a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z"/><path d="M14 3v5h5M8 13h8M8 17h6"/></svg>
              </div>
              <div style={{ fontSize: 13 }}>Tap menu items to add</div>
            </div>
          )}

          {/* In-kitchen section */}
          {inKitchenItems.length > 0 && (
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--color-line)", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-amber)", display: "inline-block" }} />
                  In kitchen · {inKitchenItems.reduce((s, i) => s + i.quantity, 0)} items
                </div>
              </div>
              <div className="scroll" style={{ maxHeight: 130, overflowY: "auto" }}>
                {inKitchenItems.map((line) => (
                  <div key={line.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12, color: "var(--color-ink-3)" }}>
                    <span style={{ minWidth: 22, fontFamily: "var(--font-mono)", flexShrink: 0 }}>{line.quantity}×</span>
                    <span style={{ flex: 1, lineHeight: 1.2 }}>{line.name}{line.variantName ? ` (${line.variantName})` : ""}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{formatCurrency(String(Number(line.unitPrice) * line.quantity))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Done (ready) items — collapsible hint row */}
          {doneItems.length > 0 && (
            <div style={{ padding: "8px 18px", borderBottom: "1px solid var(--color-line)", background: "var(--color-green-soft)", flexShrink: 0 }}>
              <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--color-green)" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                {doneItems.reduce((s, i) => s + i.quantity, 0)} items ready
              </div>
            </div>
          )}

          {/* To-send section */}
          {unsentItems.length > 0 && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: "14px 18px 8px", flexShrink: 0 }}>
                <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-accent)", display: "inline-block" }} />
                  To send · {unsentItems.length} item{unsentItems.length > 1 ? "s" : ""}
                </div>
              </div>
              <div className="scroll" style={{ flex: 1, padding: "0 18px", overflowY: "auto" }}>
                {unsentItems.map((line, i) => (
                  <div key={line.id} style={{ padding: "10px 0", borderBottom: i < unsentItems.length - 1 ? "1px solid var(--color-line)" : "none" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <span className={`veg-dot ${menuItemById.get(line.menuItemId)?.isVeg ? "veg" : "nonveg"}`} style={{ marginTop: 4, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-ink)", lineHeight: 1.2 }}>
                          {line.name}
                          {line.variantName && <span style={{ fontSize: 11, color: "var(--color-ink-3)", marginLeft: 5 }}>({line.variantName})</span>}
                        </div>
                        {line.modifiers && line.modifiers.length > 0 && (
                          <div style={{ marginTop: 3, display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {line.modifiers.map((m, mi) => (
                              <span key={mi} style={{ fontSize: 10, color: "var(--color-accent-ink)", background: "var(--color-accent-soft)", borderRadius: 4, padding: "1px 5px", fontWeight: 500 }}>+{m.name}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", background: "var(--color-bg)", borderRadius: 8, border: "1px solid var(--color-line)", flexShrink: 0 }}>
                        <button onClick={() => decrementMutation.mutate(line.id)} style={{ width: 28, height: 28, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-ink-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/></svg>
                        </button>
                        <span style={{ minWidth: 22, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600 }}>{line.quantity}</span>
                        <button onClick={() => addItemMutation.mutate({ menuItemId: line.menuItemId, variantId: line.variantId ?? undefined })} style={{ width: 28, height: 28, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-ink-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                        </button>
                      </div>
                      <button onClick={() => voidItemMutation.mutate(line.id)} style={{ width: 28, height: 28, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-ink-4)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* If no unsent items but has in-kitchen, show flex spacer */}
          {unsentItems.length === 0 && activeItems.length > 0 && <div style={{ flex: 1 }} />}

          {/* ── Totals + actions ──────────────────────────────────────────── */}
          {activeItems.length > 0 && (
            <div style={{ padding: "14px 18px 18px", background: "var(--color-bg)", borderTop: "1px solid var(--color-line)", flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-ink-3)" }}>
                <span>Subtotal · {activeItems.reduce((s, i) => s + i.quantity, 0)} items</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>{formatCurrency(subtotal)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--color-ink-4)", marginTop: 3 }}>
                <span>CGST 5% + SGST 5%</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>{formatCurrency(tax)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 700, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--color-line)" }}>
                <span>Total</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>{formatCurrency(total)}</span>
              </div>

              {/* Already billed */}
              {order?.status === "billed" && order.billId ? (
                <button onClick={() => navigate({ to: "/billing/$billId", params: { billId: order.billId! } })} style={{ width: "100%", height: 50, marginTop: 14, borderRadius: 12, background: order.billIsPaid ? "var(--color-bg)" : "var(--color-green)", border: order.billIsPaid ? "1px solid var(--color-line)" : "1px solid oklch(42% 0.1 150)", color: order.billIsPaid ? "var(--color-ink-2)" : "white", fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
                  {order.billIsPaid ? "View Receipt" : "Collect Payment"}
                </button>
              ) : isCounter ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
                  {userRole !== "captain" && (
                    <button onClick={handleBill} disabled={subtotal === 0} style={{ width: "100%", height: 50, borderRadius: 12, background: "var(--color-green)", border: "1px solid oklch(42% 0.1 150)", color: "white", fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: subtotal > 0 ? "pointer" : "not-allowed", opacity: subtotal > 0 ? 1 : .4 }}>
                      Charge{unsentCount > 0 && <span style={{ fontSize: 11, opacity: .75, fontWeight: 400, marginLeft: 6 }}>· KOT auto-sent</span>}
                    </button>
                  )}
                  {unsentCount > 0 && (
                    <button onClick={() => kotMutation.mutate()} disabled={kotMutation.isPending} style={{ width: "100%", height: 36, borderRadius: 10, background: "transparent", border: "1px dashed var(--color-line-strong)", color: "var(--color-ink-3)", fontSize: 12, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}>
                      Send KOT early
                    </button>
                  )}
                </div>
              ) : (
                /* Dine-in */
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button onClick={() => kotMutation.mutate()} disabled={unsentCount === 0 || kotMutation.isPending} style={{ flex: 2, height: 50, borderRadius: 12, background: "var(--color-accent)", border: "1px solid oklch(64% 0.17 55)", color: "var(--color-accent-ink)", fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: unsentCount > 0 ? "pointer" : "not-allowed", opacity: unsentCount > 0 ? 1 : .4, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    Send KOT
                    {unsentCount > 0 && (
                      <span style={{ background: "rgba(0,0,0,.18)", borderRadius: 999, padding: "2px 9px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700 }}>{unsentCount}</span>
                    )}
                  </button>
                  {userRole !== "captain" && (
                    <button onClick={handleBill} disabled={!!billBlocked} title={billBlocked ?? undefined} style={{ flex: 1, height: 50, borderRadius: 12, background: billBlocked ? "var(--color-bg)" : "var(--color-ink)", border: billBlocked ? "1px solid var(--color-line)" : "1px solid var(--color-ink)", color: billBlocked ? "var(--color-ink-3)" : "var(--color-surface)", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: !billBlocked ? "pointer" : "not-allowed", opacity: billBlocked ? .45 : 1 }}>
                      Bill
                    </button>
                  )}
                </div>
              )}
              {!isCounter && unsentItems.length > 0 && (
                <div style={{ fontSize: 11, color: "var(--color-ink-4)", marginTop: 7, textAlign: "center" }}>
                  Bill enables when nothing is pending
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Variant Picker ─────────────────────────────────────────────────── */}
      {showVariants && pendingItem && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "var(--color-surface)", borderRadius: 16, width: 400, maxHeight: "70vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--color-line)" }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{pendingItem.name}</div>
              <div style={{ fontSize: 13, color: "var(--color-ink-3)", marginTop: 2 }}>Choose a variant</div>
            </div>
            <div className="scroll" style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              {pendingItemVariants.map((v) => (
                <button key={v.id} onClick={() => handleVariantChosen(v.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--color-bg)", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-ink)" }}>{v.name}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--color-ink-2)" }}>{formatCurrency(v.price)}</span>
                </button>
              ))}
            </div>
            <div style={{ padding: "12px 16px 16px", borderTop: "1px solid var(--color-line)" }}>
              <button onClick={cancelPicker} style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--color-line)", background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--color-ink-2)", fontFamily: "inherit" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modifier Picker ────────────────────────────────────────────────── */}
      {showModifiers && pendingItem && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "var(--color-surface)", borderRadius: 16, width: 440, maxHeight: "76vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--color-line)" }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{pendingItem.name}</div>
              <div style={{ fontSize: 13, color: "var(--color-ink-3)", marginTop: 2 }}>Customise your order</div>
            </div>
            <div className="scroll" style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
              {pendingGroups.map((group) => {
                const groupMods = (menu?.modifiers ?? []).filter((m) => m.groupId === group.id && m.isActive)
                return (
                  <div key={group.id}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-ink)" }}>{group.name}</span>
                      {group.required
                        ? <span style={{ fontSize: 10, background: "var(--color-red-soft)", color: "var(--color-red)", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>Required</span>
                        : <span style={{ fontSize: 10, color: "var(--color-ink-3)" }}>Optional · {group.multiSelect ? "multi-select" : "pick one"}</span>
                      }
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {groupMods.map((m) => {
                        const checked = selectedMods.includes(m.id)
                        return (
                          <button key={m.id} onClick={() => {
                            if (!group.multiSelect) {
                              const siblings = groupMods.map((gm) => gm.id)
                              setSelectedMods((prev) => [...prev.filter((id) => !siblings.includes(id)), ...(checked ? [] : [m.id])])
                            } else {
                              setSelectedMods((prev) => checked ? prev.filter((id) => id !== m.id) : [...prev, m.id])
                            }
                          }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 8, border: `1px solid ${checked ? "var(--color-ink)" : "var(--color-line)"}`, background: checked ? "var(--color-bg)" : "var(--color-bg)", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ width: 16, height: 16, borderRadius: group.multiSelect ? 3 : "50%", border: `2px solid ${checked ? "var(--color-ink)" : "var(--color-line)"}`, background: checked ? "var(--color-ink)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                {checked && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>}
                              </div>
                              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-ink)" }}>{m.name}</span>
                            </div>
                            {Number(m.price) > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--color-ink-2)" }}>+{formatCurrency(m.price)}</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ padding: "12px 16px 16px", borderTop: "1px solid var(--color-line)", display: "flex", gap: 8 }}>
              <button onClick={cancelPicker} style={{ flex: 1, height: 40, borderRadius: 10, border: "1px solid var(--color-line)", background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--color-ink-2)", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={handleModifiersConfirm} style={{ flex: 2, height: 40, borderRadius: 10, border: "none", background: "var(--color-ink)", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "var(--color-surface)", fontFamily: "inherit" }}>Add to Order</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Transfer Table ─────────────────────────────────────────────────── */}
      {showTransfer && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "var(--color-surface)", borderRadius: 16, width: 460, maxHeight: "70vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--color-line)" }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Transfer Table</div>
              <div style={{ fontSize: 13, color: "var(--color-ink-3)", marginTop: 2 }}>Move this order to another available table</div>
            </div>
            <div className="scroll" style={{ padding: 16, overflowY: "auto" }}>
              {availableTables.length === 0 ? (
                <div style={{ textAlign: "center", padding: 40, color: "var(--color-ink-3)" }}>No available tables</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }}>
                  {availableTables.map((t) => (
                    <button key={t.id} onClick={() => transferMutation.mutate(t.id)} disabled={transferMutation.isPending} style={{ padding: "16px 8px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--color-bg)", cursor: "pointer", textAlign: "center", fontSize: 13, fontWeight: 500, color: "var(--color-ink)", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-green)" }}><rect x="3" y="8" width="18" height="10" rx="1.5"/><path d="M1 14h22M7 8V6a2 2 0 012-2h6a2 2 0 012 2v2"/></svg>
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: "12px 16px 16px", borderTop: "1px solid var(--color-line)" }}>
              <button onClick={() => setShowTransfer(false)} style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--color-line)", background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--color-ink-2)", fontFamily: "inherit" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Merge Table ────────────────────────────────────────────────────── */}
      {showMerge && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "var(--color-surface)", borderRadius: 16, width: 460, maxHeight: "70vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,.18)" }}>
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--color-line)" }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Merge Order</div>
              <div style={{ fontSize: 13, color: "var(--color-ink-3)", marginTop: 2 }}>Pull another order's items into this one</div>
            </div>
            <div className="scroll" style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              {mergeableOrders.length === 0 ? (
                <div style={{ textAlign: "center", padding: 40, color: "var(--color-ink-3)" }}>No other open orders</div>
              ) : mergeableOrders.map((o) => {
                const tableEntry = (tablesData?.tables ?? []).find((t) => t.id === o.tableId)
                const label      = tableEntry?.name ?? (o.type === "takeaway" ? "Takeaway" : "Order")
                const qty        = o.items.filter((i) => !i.isVoided).reduce((s, i) => s + i.quantity, 0)
                return (
                  <button key={o.id} onClick={() => mergeMutation.mutate(o.id)} disabled={mergeMutation.isPending} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--color-bg)", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink)" }}>{label}</div>
                      <div style={{ fontSize: 12, color: "var(--color-ink-3)", marginTop: 2 }}>{qty} items · {o.type.replace("_", " ")}</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-ink-3)" }}><path d="M9 18l6-6-6-6"/></svg>
                  </button>
                )
              })}
            </div>
            <div style={{ padding: "12px 16px 16px", borderTop: "1px solid var(--color-line)" }}>
              <button onClick={() => setShowMerge(false)} style={{ width: "100%", height: 40, borderRadius: 10, border: "1px solid var(--color-line)", background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--color-ink-2)", fontFamily: "inherit" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

