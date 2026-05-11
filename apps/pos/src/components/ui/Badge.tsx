import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

type Variant = "available" | "occupied" | "billed" | "reserved" | "default" | "primary"

const styles: Record<Variant, string> = {
  available: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  occupied:  "bg-amber-400/15  text-amber-400  border-amber-400/20",
  billed:    "bg-red-500/15    text-red-400    border-red-500/20",
  reserved:  "bg-violet-500/15 text-violet-400 border-violet-500/20",
  default:   "bg-white/5       text-[var(--color-text-2)] border-white/10",
  primary:   "bg-indigo-500/15 text-indigo-400 border-indigo-500/20",
}

export function Badge({ children, variant = "default", className }: { children: ReactNode; variant?: Variant; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border", styles[variant], className)}>
      {children}
    </span>
  )
}
