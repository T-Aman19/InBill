// Order-line pricing — the single source of truth for "what does this line cost".
//
// `unitPrice` on an order line is the item/variant snapshot price ONLY (see the
// order_items schema); modifier prices live in the sibling order_item_modifiers
// table. So every consumer must compute unitPrice + Σ(modifier.price), then
// × quantity. This used to be reimplemented ad hoc at ~10 call sites and only
// billing got it right — hence this helper. Use it everywhere a line total,
// subtotal, or taxable amount is derived.
//
// Numeric DB columns arrive as strings (postgres `numeric`) but as numbers
// through the zod API layer, so both are accepted.

type PricedModifier = { price: number | string }

type PricedLine = {
  unitPrice: number | string
  quantity: number
  modifiers?: readonly PricedModifier[] | null
}

/** Sum of a line's add-on modifier prices, for a single unit. */
export function modifiersTotal(modifiers?: readonly PricedModifier[] | null): number {
  return (modifiers ?? []).reduce((sum, m) => sum + Number(m.price), 0)
}

/** Full price of an order line: (unitPrice + modifiers) × quantity. */
export function lineTotal(line: PricedLine): number {
  return (Number(line.unitPrice) + modifiersTotal(line.modifiers)) * line.quantity
}
