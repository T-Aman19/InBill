import { useState, useEffect, useRef } from "react"
import { useParams } from "@tanstack/react-router"

const SERVER_ORIGIN =
  window.location.protocol === "tauri:" || window.location.port === "5173"
    ? "http://localhost:3000"
    : ""
const PUBLIC_BASE = `${SERVER_ORIGIN}/api/public`

type Modifier    = { id: string; name: string; price: string }
type ModGroup    = { id: string; name: string; required: boolean; multiSelect: boolean; modifiers: Modifier[] }
type Variant     = { id: string; name: string; price: string }
type MenuItem    = { id: string; categoryId: string; name: string; description?: string | null; basePrice: string; isVeg: boolean; imageUrl?: string | null; variants: Variant[]; modifierGroups: ModGroup[] }
type Category    = { id: string; name: string }
type OutletInfo  = { id: string; name: string; address?: string }
type CartEntry   = { menuItemId: string; name: string; variantId?: string; variantName?: string; unitPrice: number; quantity: number; modifierIds: string[]; modifierNames: string[]; notes?: string }
type SentItem    = { id: string; name: string; variantName: string | null; quantity: number; unitPrice: string; modifiers?: { name: string; price: string }[] }

function fmt(n: number | string) {
  return `₹${Number(n).toFixed(0)}`
}

function VegDot({ isVeg }: { isVeg: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, border: `2px solid ${isVeg ? "#1a7a1a" : "#b91c1c"}`, borderRadius: 2, flexShrink: 0 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: isVeg ? "#1a7a1a" : "#b91c1c" }} />
    </span>
  )
}

function ModifierModal({ item, onConfirm, onClose }: {
  item: MenuItem
  onConfirm: (variantId: string | undefined, variantName: string | undefined, price: number, modifierIds: string[], modifierNames: string[]) => void
  onClose: () => void
}) {
  const hasVariants = item.variants.length > 0
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(item.variants[0]?.id)
  const [selectedMods, setSelectedMods] = useState<Record<string, string[]>>({})

  const selectedVariant = item.variants.find((v) => v.id === selectedVariantId)
  const basePrice = selectedVariant ? Number(selectedVariant.price) : Number(item.basePrice)
  const modCost = Object.values(selectedMods).flat().reduce((s, mid) => {
    const mod = item.modifierGroups.flatMap((g) => g.modifiers).find((m) => m.id === mid)
    return s + (mod ? Number(mod.price) : 0)
  }, 0)
  const total = basePrice + modCost

  function toggleMod(groupId: string, modId: string, multiSelect: boolean) {
    setSelectedMods((prev) => {
      const cur = prev[groupId] ?? []
      if (cur.includes(modId)) return { ...prev, [groupId]: cur.filter((id) => id !== modId) }
      return { ...prev, [groupId]: multiSelect ? [...cur, modId] : [modId] }
    })
  }

  function handleConfirm() {
    const allModIds = Object.values(selectedMods).flat()
    const allModNames = allModIds.map((mid) => item.modifierGroups.flatMap((g) => g.modifiers).find((m) => m.id === mid)?.name ?? "")
    onConfirm(selectedVariantId, selectedVariant?.name, total, allModIds, allModNames)
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 200, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div style={{ width: "100%", maxHeight: "80vh", background: "#fff", borderRadius: "20px 20px 0 0", overflowY: "auto", padding: "24px 20px 36px" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <VegDot isVeg={item.isVeg} />
          <span style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>{item.name}</span>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer", color: "#666", lineHeight: 1 }}>×</button>
        </div>

        {hasVariants && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".06em" }}>Size</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {item.variants.map((v) => (
                <label key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", border: `1.5px solid ${selectedVariantId === v.id ? "#111" : "#e5e5e5"}`, borderRadius: 10, cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input type="radio" name="variant" checked={selectedVariantId === v.id} onChange={() => setSelectedVariantId(v.id)} style={{ accentColor: "#111" }} />
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{v.name}</span>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{fmt(v.price)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {item.modifierGroups.map((group) => (
          <div key={group.id} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 10, display: "flex", alignItems: "center", gap: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>
              {group.name}
              {group.required && <span style={{ fontSize: 10, background: "#fee2e2", color: "#b91c1c", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>Required</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {group.modifiers.map((mod) => {
                const checked = (selectedMods[group.id] ?? []).includes(mod.id)
                return (
                  <label key={mod.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", border: `1.5px solid ${checked ? "#111" : "#e5e5e5"}`, borderRadius: 10, cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input type={group.multiSelect ? "checkbox" : "radio"} name={`group-${group.id}`} checked={checked} onChange={() => toggleMod(group.id, mod.id, group.multiSelect)} style={{ accentColor: "#111" }} />
                      <span style={{ fontSize: 14 }}>{mod.name}</span>
                    </div>
                    {Number(mod.price) > 0 && <span style={{ fontSize: 13, color: "#555" }}>+{fmt(mod.price)}</span>}
                  </label>
                )
              })}
            </div>
          </div>
        ))}

        <button onClick={handleConfirm} style={{ width: "100%", padding: "16px", background: "#111", color: "#fff", border: "none", borderRadius: 14, fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
          Add to cart — {fmt(total)}
        </button>
      </div>
    </div>
  )
}

export default function QrMenuPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { outletId, tableId } = useParams({ strict: false }) as any as { outletId: string; tableId: string }

  const [outlet, setOutlet] = useState<OutletInfo | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [cart, setCart] = useState<CartEntry[]>([])
  const [modifierTarget, setModifierTarget] = useState<MenuItem | null>(null)
  const [showCart, setShowCart] = useState(false)
  const [placing, setPlacing] = useState(false)

  // Existing order state — populated on mount if table is already occupied
  const [orderId, setOrderId] = useState<string | null>(null)
  const [sentItems, setSentItems] = useState<SentItem[]>([])
  const [showSentItems, setShowSentItems] = useState(false)

  // Success toast
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load menu
  useEffect(() => {
    fetch(`${PUBLIC_BASE}/menu/${outletId}`)
      .then((r) => r.json())
      .then((data: { outlet: OutletInfo; categories: Category[]; items: MenuItem[] }) => {
        setOutlet(data.outlet)
        setCategories(data.categories)
        setItems(data.items)
        setActiveCategoryId(data.categories[0]?.id ?? null)
      })
      .catch(() => setError("Could not load menu. Please try again."))
      .finally(() => setLoading(false))
  }, [outletId])

  // Check if table already has an active order
  useEffect(() => {
    fetch(`${PUBLIC_BASE}/table/${tableId}?outletId=${outletId}`)
      .then((r) => r.json())
      .then((data: { status: string; orderId: string | null; items: SentItem[] }) => {
        if (data.orderId) {
          setOrderId(data.orderId)
          setSentItems(data.items ?? [])
        }
      })
      .catch(() => { /* silent — don't block menu */ })
  }, [tableId, outletId])

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  function addToCart(item: MenuItem, variantId?: string, variantName?: string, price?: number, modifierIds?: string[], modifierNames?: string[]) {
    const unitPrice = price ?? Number(item.basePrice)
    setCart((prev) => {
      const key = `${item.id}:${variantId ?? ""}:${(modifierIds ?? []).join(",")}`
      const existing = prev.find((e) => `${e.menuItemId}:${e.variantId ?? ""}:${e.modifierIds.join(",")}` === key)
      if (existing) return prev.map((e) => (`${e.menuItemId}:${e.variantId ?? ""}:${e.modifierIds.join(",")}` === key ? { ...e, quantity: e.quantity + 1 } : e))
      return [...prev, { menuItemId: item.id, name: item.name, variantId, variantName, unitPrice, quantity: 1, modifierIds: modifierIds ?? [], modifierNames: modifierNames ?? [] }]
    })
  }

  function changeQty(idx: number, delta: number) {
    setCart((prev) => {
      const next = [...prev]
      const entry = next[idx]!
      if (entry.quantity + delta <= 0) return next.filter((_, i) => i !== idx)
      next[idx] = { ...entry, quantity: entry.quantity + delta }
      return next
    })
  }

  function handleItemTap(item: MenuItem) {
    if (item.variants.length > 0 || item.modifierGroups.length > 0) {
      setModifierTarget(item)
    } else {
      addToCart(item)
    }
  }

  async function placeOrder() {
    if (cart.length === 0 || placing) return
    setPlacing(true)
    try {
      const res = await fetch(`${PUBLIC_BASE}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outletId,
          tableId,
          items: cart.map((e) => ({
            menuItemId: e.menuItemId,
            variantId: e.variantId,
            quantity: e.quantity,
            modifierIds: e.modifierIds,
          })),
        }),
      })
      const data = await res.json() as { orderId?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Order failed")

      // Persist order id for future appends
      if (data.orderId) setOrderId(data.orderId)

      // Optimistically add cart entries to the "sent" list
      setSentItems((prev) => [
        ...prev,
        ...cart.map((e) => ({
          id: `opt-${Date.now()}-${e.menuItemId}`,
          name: e.name,
          variantName: e.variantName ?? null,
          quantity: e.quantity,
          unitPrice: String(e.unitPrice),
          modifiers: e.modifierNames.map((n) => ({ name: n, price: "0" })),
        })),
      ])

      setCart([])
      setShowCart(false)
      showToast("Order sent to kitchen! Feel free to add more items.")
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not place order")
    } finally {
      setPlacing(false)
    }
  }

  const cartTotal    = cart.reduce((s, e) => s + e.unitPrice * e.quantity, 0)
  const cartCount    = cart.reduce((s, e) => s + e.quantity, 0)
  const sentTotal    = sentItems.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0)
  const visibleItems = items.filter((i) => i.categoryId === activeCategoryId)

  if (loading) return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #e5e5e5", borderTopColor: "#111", animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 32, fontFamily: "system-ui, sans-serif", textAlign: "center", color: "#b91c1c" }}>{error}</div>
  )

  return (
    <div style={{ minHeight: "100dvh", background: "#fafaf9", fontFamily: "system-ui, sans-serif", paddingBottom: cart.length > 0 ? 100 : 32 }}>

      {/* Success toast */}
      {toast && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 500, background: "#111", color: "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", boxShadow: "0 4px 20px rgba(0,0,0,.25)" }}>
          ✓ {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ background: "#111", color: "#fff", padding: "20px 20px 16px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{outlet?.name}</div>
        {outlet?.address && <div style={{ fontSize: 12, opacity: .65, marginTop: 3 }}>{outlet.address}</div>}
      </div>

      {/* "Your order so far" collapsible — shown once items have been sent */}
      {sentItems.length > 0 && (
        <div style={{ background: "#fff", borderBottom: "1px solid #f0f0f0" }}>
          <button
            onClick={() => setShowSentItems((v) => !v)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", border: "none", background: "none", cursor: "pointer", fontFamily: "inherit" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1a7a1a" }}>✓ Ordered so far</span>
              <span style={{ fontSize: 12, color: "#888" }}>{sentItems.reduce((s, i) => s + i.quantity, 0)} items · {fmt(sentTotal)}</span>
            </div>
            <span style={{ fontSize: 18, color: "#555", transform: showSentItems ? "rotate(180deg)" : "none", transition: "transform .2s" }}>›</span>
          </button>
          {showSentItems && (
            <div style={{ padding: "0 16px 16px" }}>
              {sentItems.map((item, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderTop: "1px solid #f5f5f5" }}>
                  <div>
                    <span style={{ fontSize: 14 }}>{item.name}{item.variantName ? ` (${item.variantName})` : ""}</span>
                    {item.modifiers && item.modifiers.length > 0 && (
                      <div style={{ fontSize: 12, color: "#888" }}>{item.modifiers.map((m) => m.name).join(", ")}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 13, color: "#888" }}>×{item.quantity}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{fmt(Number(item.unitPrice) * item.quantity)}</span>
                  </div>
                </div>
              ))}
              {orderId && (
                <div style={{ marginTop: 10, fontSize: 11, color: "#aaa", textAlign: "right" }}>Order #{orderId.slice(-8).toUpperCase()}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Category tabs */}
      <div style={{ display: "flex", gap: 8, padding: "14px 16px", overflowX: "auto", background: "#fff", borderBottom: "1px solid #f0f0f0", scrollbarWidth: "none" }}>
        {categories.map((cat) => (
          <button key={cat.id} onClick={() => setActiveCategoryId(cat.id)} style={{ flexShrink: 0, padding: "8px 16px", borderRadius: 20, border: "1.5px solid " + (activeCategoryId === cat.id ? "#111" : "#e5e5e5"), background: activeCategoryId === cat.id ? "#111" : "#fff", color: activeCategoryId === cat.id ? "#fff" : "#555", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            {cat.name}
          </button>
        ))}
      </div>

      {/* Items */}
      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 2 }}>
        {visibleItems.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 0", color: "#aaa", fontSize: 15 }}>No items in this category</div>
        )}
        {visibleItems.map((item) => {
          const cartQty = cart.filter((e) => e.menuItemId === item.id).reduce((s, e) => s + e.quantity, 0)
          const minPrice = item.variants.length > 0 ? Math.min(...item.variants.map((v) => Number(v.price))) : Number(item.basePrice)
          const hasOptions = item.variants.length > 0 || item.modifierGroups.length > 0
          return (
            <div key={item.id} style={{ display: "flex", gap: 14, padding: "16px 0", borderBottom: "1px solid #f0f0f0", alignItems: "flex-start" }}>
              {item.imageUrl && (
                <img src={item.imageUrl} alt={item.name} style={{ width: 80, height: 80, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                  <VegDot isVeg={item.isVeg} />
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#111" }}>{item.name}</span>
                </div>
                {item.description && <div style={{ fontSize: 12, color: "#888", lineHeight: 1.4, marginBottom: 6 }}>{item.description}</div>}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{hasOptions ? `from ${fmt(minPrice)}` : fmt(minPrice)}</span>
                  {cartQty > 0 && !hasOptions ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 0, border: "1.5px solid #111", borderRadius: 8, overflow: "hidden" }}>
                      <button onClick={() => { const idx = cart.findIndex((e) => e.menuItemId === item.id); changeQty(idx, -1) }} style={{ width: 36, height: 36, border: "none", background: "#111", color: "#fff", fontSize: 18, cursor: "pointer" }}>−</button>
                      <span style={{ width: 28, textAlign: "center", fontSize: 14, fontWeight: 700 }}>{cartQty}</span>
                      <button onClick={() => handleItemTap(item)} style={{ width: 36, height: 36, border: "none", background: "#111", color: "#fff", fontSize: 18, cursor: "pointer" }}>+</button>
                    </div>
                  ) : (
                    <button onClick={() => handleItemTap(item)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 16px", background: cartQty > 0 ? "#111" : "#fff", color: cartQty > 0 ? "#fff" : "#111", border: "1.5px solid #111", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                      {cartQty > 0 ? `+Add (${cartQty})` : hasOptions ? "Customise" : "+ Add"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modifier modal */}
      {modifierTarget && (
        <ModifierModal
          item={modifierTarget}
          onConfirm={(variantId, variantName, price, modifierIds, modifierNames) => {
            addToCart(modifierTarget, variantId, variantName, price, modifierIds, modifierNames)
            setModifierTarget(null)
          }}
          onClose={() => setModifierTarget(null)}
        />
      )}

      {/* Cart drawer */}
      {showCart && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 100 }} onClick={() => setShowCart(false)}>
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderRadius: "20px 20px 0 0", padding: "24px 20px 40px", maxHeight: "80vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Your cart</div>
            {cart.map((entry, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid #f0f0f0" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{entry.name}{entry.variantName ? ` (${entry.variantName})` : ""}</div>
                  {entry.modifierNames.length > 0 && <div style={{ fontSize: 12, color: "#888" }}>{entry.modifierNames.join(", ")}</div>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={() => changeQty(idx, -1)} style={{ width: 28, height: 28, borderRadius: "50%", border: "1.5px solid #ddd", background: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                  <span style={{ fontSize: 14, fontWeight: 700, minWidth: 20, textAlign: "center" }}>{entry.quantity}</span>
                  <button onClick={() => changeQty(idx, 1)} style={{ width: 28, height: 28, borderRadius: "50%", border: "1.5px solid #ddd", background: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, minWidth: 56, textAlign: "right" }}>{fmt(entry.unitPrice * entry.quantity)}</div>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 0", fontWeight: 700, fontSize: 16 }}>
              <span>Total</span><span>{fmt(cartTotal)}</span>
            </div>
            {sentItems.length > 0 && (
              <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>
                Items already ordered ({sentItems.reduce((s, i) => s + i.quantity, 0)}) will stay in the kitchen regardless.
              </div>
            )}
            <button onClick={() => void placeOrder()} disabled={placing} style={{ width: "100%", padding: "16px", background: "#111", color: "#fff", border: "none", borderRadius: 14, fontSize: 16, fontWeight: 700, cursor: "pointer", opacity: placing ? .6 : 1 }}>
              {placing ? "Sending to kitchen…" : sentItems.length > 0 ? "Add more items" : "Place order"}
            </button>
          </div>
        </div>
      )}

      {/* Sticky cart bar */}
      {cart.length > 0 && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 16px 20px", background: "#fff", borderTop: "1px solid #f0f0f0", zIndex: 50 }}>
          <button onClick={() => setShowCart(true)} style={{ width: "100%", padding: "16px 20px", background: "#111", color: "#fff", border: "none", borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "inherit" }}>
            <span style={{ background: "#fff", color: "#111", borderRadius: 20, fontSize: 12, fontWeight: 700, padding: "2px 10px" }}>{cartCount}</span>
            <span>View Cart</span>
            <span>{fmt(cartTotal)}</span>
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
