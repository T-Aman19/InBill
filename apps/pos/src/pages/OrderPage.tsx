import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { useNavigate, useParams, useSearch } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import { ws } from "@/lib/ws"
import { formatCurrency } from "@/lib/utils"
import { TopBar } from "@/components/ui/TopBar"
import { useAuthStore } from "@/stores/auth"

type Category         = { id: string; name: string; sortOrder: number }
type MenuItem         = { id: string; categoryId: string; name: string; basePrice: string; isVeg: boolean; isAvailable: boolean }
type ItemVariant      = { id: string; itemId: string; name: string; price: string; isActive: boolean }
type ModifierGroup    = { id: string; name: string; required: boolean; multiSelect: boolean }
type Modifier         = { id: string; groupId: string; name: string; price: string; isActive: boolean }
type ItemModLink      = { itemId: string; groupId: string }
type OrderItem        = { id: string; menuItemId: string; variantId?: string | null; variantName?: string | null; name: string; unitPrice: string; quantity: number; isVoided: boolean; kotId: string | null; kotStatus?: string | null; modifiers: { name: string; price: string }[] }
type Order            = { id: string; type: string; status: string; tableId?: string | null; tableName?: string; billId?: string | null; items: OrderItem[] }
type TableRow         = { id: string; name: string; status: string; currentOrderId?: string | null }
type OpenOrder        = { id: string; tableId?: string | null; type: string; status: string; items: { isVoided: boolean; quantity: number }[] }

const TAX_RATE = 0.10

export default function OrderPage() {
  const { orderId: routeOrderId } = useParams({ from: "/order/$orderId" })
  const { tableId }               = useSearch({ from: "/order/$orderId" })
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
      if (!oid) {
        const newOrder = await api.orders.create({ type: "dine_in", tableId }) as { id: string }
        oid = newOrder.id
        setCurrentOrderId(oid)
        orderIdRef.current = oid
      }
      return { oid, item: await api.orders.addItem(oid, { menuItemId: params.menuItemId, variantId: params.variantId, quantity: 1, modifiers: params.modifiers ?? [] }) }
    },
    onSuccess: ({ oid }) => {
      qc.invalidateQueries({ queryKey: ["order", oid] })
      if (isNew) navigate({ to: "/order/$orderId", params: { orderId: oid }, search: { tableId: undefined }, replace: true })
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
  const subtotal       = activeItems.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0)
  const tax            = subtotal * TAX_RATE
  const total          = subtotal + tax
  const categories     = menu?.categories ?? []
  const menuItemsFiltered = (menu?.items ?? []).filter(
    (i) => i.categoryId === activeCat && i.isAvailable &&
           (search === "" || i.name.toLowerCase().includes(search.toLowerCase()))
  )

  const pendingItemVariants = pendingItem ? (menu?.variants ?? []).filter((v) => v.itemId === pendingItem.id && v.isActive) : []
  const pendingGroupIds     = pendingItem ? (menu?.itemModifierGroups ?? []).filter((l) => l.itemId === pendingItem.id).map((l) => l.groupId) : []
  const pendingGroups       = (menu?.modifierGroups ?? []).filter((g) => pendingGroupIds.includes(g.id))

  const availableTables = (tablesData?.tables ?? []).filter((t) => t.status === "available" && t.id !== order?.tableId)
  const mergeableOrders = (openOrders ?? []).filter((o) => o.id !== currentOrderId)

  const canManage  = userRole === "manager" || userRole === "owner" || userRole === "cashier"
  const orderActive = order && order.status !== "billed" && order.status !== "cancelled"

  async function handleBill() {
    if (!currentOrderId) return
    const bill = await api.bills.create({ orderId: currentOrderId }) as { id: string }
    navigate({ to: "/billing/$billId", params: { billId: bill.id } })
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-bg)", position: "relative" }}>
      <TopBar current="floor" />

      {/* Sub-header */}
      <div style={{ height: 56, flexShrink: 0, background: "var(--color-surface)", borderBottom: "1px solid var(--color-line)", display: "flex", alignItems: "center", padding: "0 20px", gap: 12 }}>
        <button onClick={() => navigate({ to: "/floor" })} style={{ background: "transparent", border: "none", color: "var(--color-ink-2)", padding: 8, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface-2)"}
          onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>

        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            {order?.tableName ?? (isNew ? "New Order" : (order?.type === "takeaway" ? "Takeaway" : "Order"))}
          </h2>
          <span style={{ fontSize: 12, color: "var(--color-ink-3)", textTransform: "capitalize" }}>
            {isNew ? "dine in · add items to open" : order?.type?.replace("_", " ")}
          </span>
        </div>

        {canManage && !isNew && orderActive && order?.type === "dine_in" && (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setShowTransfer(true)} style={{ fontSize: 12, padding: "5px 10px", border: "1px solid var(--color-line)", borderRadius: 8, background: "transparent", cursor: "pointer", color: "var(--color-ink-2)", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}
              onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface-2)"}
              onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3"/></svg>
              Transfer
            </button>
            <button onClick={() => setShowMerge(true)} style={{ fontSize: 12, padding: "5px 10px", border: "1px solid var(--color-line)", borderRadius: 8, background: "transparent", cursor: "pointer", color: "var(--color-ink-2)", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}
              onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface-2)"}
              onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3m10 0h3a2 2 0 002-2v-3"/></svg>
              Merge
            </button>
          </div>
        )}

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", alignItems: "center", background: "var(--color-surface-2)", border: "1px solid var(--color-line)", borderRadius: 10, padding: "6px 12px", gap: 8, width: 220 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-ink-3)", flexShrink: 0 }}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search menu"
            style={{ border: "none", background: "transparent", outline: "none", fontSize: 13, flex: 1, color: "var(--color-ink)" }} />
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 380px", overflow: "hidden" }}>
        {/* Left: menu */}
        <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid var(--color-line)", overflow: "hidden" }}>
          <div className="scroll" style={{ display: "flex", gap: 4, padding: "12px 20px", borderBottom: "1px solid var(--color-line)", overflowX: "auto", overflowY: "hidden", flexShrink: 0 }}>
            {categories.map((cat) => (
              <button key={cat.id} onClick={() => setActiveCat(cat.id)} style={{
                background: activeCat === cat.id ? "var(--color-ink)" : "transparent",
                color: activeCat === cat.id ? "var(--color-bg)" : "var(--color-ink-2)",
                border: "1px solid " + (activeCat === cat.id ? "var(--color-ink)" : "var(--color-line)"),
                padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 500,
                cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, transition: "all .1s",
              }}>
                {cat.name}
                <span style={{ marginLeft: 7, opacity: .5, fontFamily: "var(--font-mono)", fontSize: 11 }}>
                  {(menu?.items ?? []).filter((m) => m.categoryId === cat.id).length}
                </span>
              </button>
            ))}
          </div>

          <div className="scroll" style={{ flex: 1, padding: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
              {menuItemsFiltered.map((item) => {
                const inCart     = activeItems.find((l) => l.menuItemId === item.id && !l.kotId)
                const hasVariants = (menu?.variants ?? []).some((v) => v.itemId === item.id && v.isActive)
                return (
                  <button key={item.id} onClick={() => handleMenuItemClick(item)} style={{
                    background: "var(--color-surface)", border: "1px solid " + (inCart ? "var(--color-ink)" : "var(--color-line)"),
                    borderRadius: 12, padding: "14px", cursor: "pointer", textAlign: "left",
                    display: "flex", flexDirection: "column", gap: 8, minHeight: 88, position: "relative",
                    transition: "all .1s", boxShadow: "var(--shadow-1)",
                  }}
                    onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface-2)"}
                    onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface)"}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                        <span className={`veg-dot ${item.isVeg ? "veg" : "nonveg"}`} />
                        <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.25, color: "var(--color-ink)" }}>{item.name}</span>
                      </div>
                      {inCart && (
                        <span style={{ background: "var(--color-ink)", color: "var(--color-bg)", fontSize: 11, fontWeight: 600, minWidth: 20, height: 20, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", flexShrink: 0, padding: "0 6px" }}>{inCart.quantity}</span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--color-ink-2)", fontWeight: 500 }}>{formatCurrency(item.basePrice)}</span>
                      {hasVariants && <span style={{ fontSize: 10, color: "var(--color-ink-3)", border: "1px solid var(--color-line)", borderRadius: 4, padding: "1px 5px" }}>variants</span>}
                    </div>
                  </button>
                )
              })}
            </div>
            {menuItemsFiltered.length === 0 && search && (
              <div style={{ textAlign: "center", padding: 60, color: "var(--color-ink-3)" }}>No items match "{search}"</div>
            )}
          </div>
        </div>

        {/* Right: order panel */}
        <div style={{ display: "flex", flexDirection: "column", background: "var(--color-surface)", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Current Order</div>
              <div style={{ fontSize: 11, color: "var(--color-ink-3)" }}>
                {activeItems.length === 0 ? "No items" : `${activeItems.reduce((s, i) => s + i.quantity, 0)} items`}
              </div>
            </div>
          </div>

          <div className="scroll" style={{ flex: 1, padding: "8px" }}>
            {activeItems.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: "var(--color-ink-3)", fontSize: 13 }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--color-surface-2)", margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink-4)" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h9l4 4v13a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z"/><path d="M14 3v5h5M8 13h8M8 17h6"/></svg>
                </div>
                Tap menu items to add
              </div>
            )}
            {activeItems.map((line, i) => {
              const sent = !!line.kotId
              return (
                <div key={line.id} style={{ padding: "10px 12px", borderRadius: 10, display: "flex", alignItems: "flex-start", gap: 10, opacity: sent && line.kotStatus !== "done" ? .65 : 1, borderBottom: i < activeItems.length - 1 ? "1px solid var(--color-line)" : "none" }}>
                  <span className="veg-dot veg" style={{ flexShrink: 0, marginTop: 4 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-ink)", lineHeight: 1.2 }}>
                      {line.name}
                      {line.variantName && <span style={{ fontSize: 11, color: "var(--color-ink-3)", marginLeft: 5 }}>({line.variantName})</span>}
                    </div>
                    {line.modifiers && line.modifiers.length > 0 && (
                      <div style={{ marginTop: 3, display: "flex", flexWrap: "wrap", gap: 3 }}>
                        {line.modifiers.map((m, mi) => (
                          <span key={mi} style={{ fontSize: 10, color: "var(--color-ink-3)", background: "var(--color-surface-2)", borderRadius: 4, padding: "1px 5px" }}>+{m.name}</span>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "var(--color-ink-3)", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontFamily: "var(--font-mono)" }}>{formatCurrency(line.unitPrice)}</span>
                      {sent && line.kotStatus === "done" && <span style={{ color: "var(--color-green)", fontSize: 10, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" }}>· Ready</span>}
                      {sent && line.kotStatus !== "done" && <span style={{ color: "var(--color-amber)", fontSize: 10, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" }}>· In kitchen</span>}
                    </div>
                  </div>
                  {!sent ? (
                    <>
                      <div style={{ display: "flex", alignItems: "center", background: "var(--color-bg)", borderRadius: 8, border: "1px solid var(--color-line)" }}>
                        <button onClick={() => decrementMutation.mutate(line.id)} style={{ width: 28, height: 28, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-ink-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/></svg>
                        </button>
                        <span style={{ minWidth: 22, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600 }}>{line.quantity}</span>
                        <button onClick={() => addItemMutation.mutate({ menuItemId: line.menuItemId, variantId: line.variantId ?? undefined })} style={{ width: 28, height: 28, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-ink-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                        </button>
                      </div>
                      <button onClick={() => voidItemMutation.mutate(line.id)} style={{ width: 28, height: 28, border: "none", background: "transparent", cursor: "pointer", color: "var(--color-ink-3)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-red-soft)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--color-red)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "var(--color-ink-3)"; }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13"/></svg>
                      </button>
                    </>
                  ) : (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600 }}>×{line.quantity}</span>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ padding: "12px 20px 16px", borderTop: "1px solid var(--color-line)", background: "var(--color-surface-2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--color-ink-2)" }}>
              <span>Subtotal</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>{formatCurrency(subtotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--color-ink-3)", marginTop: 4 }}>
              <span>+ Tax (5% CGST + 5% SGST)</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>{formatCurrency(tax)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 600, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--color-line)" }}>
              <span>Total</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>{formatCurrency(total)}</span>
            </div>

            {order?.status === "billed" && order.billId ? (
              <button onClick={() => navigate({ to: "/billing/$billId", params: { billId: order.billId! } })} style={{ width: "100%", height: 52, marginTop: 14, borderRadius: 12, background: "var(--color-green)", border: "1px solid oklch(58% 0.13 150)", color: "white", fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="11" rx="1.5"/><circle cx="12" cy="12.5" r="2.5"/><path d="M5 10v.01M19 15v.01"/></svg>
                Collect Payment
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button onClick={() => kotMutation.mutate()} disabled={unsentCount === 0 || kotMutation.isPending} style={{ flex: 1, height: 48, borderRadius: 12, background: "var(--color-amber)", border: "1px solid oklch(70% 0.15 70)", color: "oklch(20% 0.05 70)", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: unsentCount > 0 ? "pointer" : "not-allowed", opacity: unsentCount > 0 ? 1 : .4, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h9l4 4v13a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z"/><path d="M14 3v5h5M8 13h8M8 17h6"/></svg>
                  Send KOT
                  {unsentCount > 0 && <span style={{ background: "rgba(0,0,0,.15)", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 700 }}>{unsentCount}</span>}
                </button>
                {userRole !== "captain" && (() => {
                  const billBlocked = subtotal === 0 ? "No items" : unsentItems.length > 0 ? "Send KOT first" : inKitchenItems.length > 0 ? "Items in kitchen" : null
                  return (
                    <button onClick={handleBill} disabled={!!billBlocked} title={billBlocked ?? undefined} style={{ flex: 1, height: 48, borderRadius: 12, background: "var(--color-green)", border: "1px solid oklch(58% 0.13 150)", color: "white", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: !billBlocked ? "pointer" : "not-allowed", opacity: !billBlocked ? 1 : .4, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="11" rx="1.5"/><circle cx="12" cy="12.5" r="2.5"/><path d="M5 10v.01M19 15v.01"/></svg>
                      {billBlocked ?? "Bill"}
                    </button>
                  )
                })()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Variant Picker ───────────────────────────────────────────────────── */}
      {showVariants && pendingItem && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "var(--color-surface)", borderRadius: 16, width: 400, maxHeight: "70vh", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-3)" }}>
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--color-line)" }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{pendingItem.name}</div>
              <div style={{ fontSize: 13, color: "var(--color-ink-3)", marginTop: 2 }}>Choose a variant</div>
            </div>
            <div className="scroll" style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              {pendingItemVariants.map((v) => (
                <button key={v.id} onClick={() => handleVariantChosen(v.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--color-bg)", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                  onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface-2)"}
                  onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg)"}>
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

      {/* ── Modifier Picker ──────────────────────────────────────────────────── */}
      {showModifiers && pendingItem && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "var(--color-surface)", borderRadius: 16, width: 440, maxHeight: "76vh", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-3)" }}>
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
                          }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 8, border: `1px solid ${checked ? "var(--color-ink)" : "var(--color-line)"}`, background: checked ? "var(--color-surface-2)" : "var(--color-bg)", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
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
              <button onClick={handleModifiersConfirm} style={{ flex: 2, height: 40, borderRadius: 10, border: "none", background: "var(--color-ink)", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "var(--color-bg)", fontFamily: "inherit" }}>Add to Order</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Transfer Table ───────────────────────────────────────────────────── */}
      {showTransfer && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "var(--color-surface)", borderRadius: 16, width: 460, maxHeight: "70vh", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-3)" }}>
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
                    <button key={t.id} onClick={() => transferMutation.mutate(t.id)} disabled={transferMutation.isPending} style={{ padding: "16px 8px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--color-bg)", cursor: "pointer", textAlign: "center", fontSize: 13, fontWeight: 500, color: "var(--color-ink)", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
                      onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface-2)"}
                      onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg)"}>
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

      {/* ── Merge Table ──────────────────────────────────────────────────────── */}
      {showMerge && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "var(--color-surface)", borderRadius: 16, width: 460, maxHeight: "70vh", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-3)" }}>
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--color-line)" }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Merge Table</div>
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
                  <button key={o.id} onClick={() => mergeMutation.mutate(o.id)} disabled={mergeMutation.isPending} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderRadius: 10, border: "1px solid var(--color-line)", background: "var(--color-bg)", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                    onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface-2)"}
                    onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg)"}>
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
