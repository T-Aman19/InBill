import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

type Variant = "primary" | "secondary" | "success" | "warning" | "danger" | "ghost"
type Size = "sm" | "md" | "lg"

interface Props {
  children: ReactNode
  variant?: Variant
  size?: Size
  disabled?: boolean
  loading?: boolean
  className?: string
  onClick?: () => void
  type?: "button" | "submit"
  fullWidth?: boolean
}

const variants: Record<Variant, string> = {
  primary:   "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 border border-indigo-400/20",
  secondary: "bg-[var(--color-surface-3)] text-[var(--color-text-2)] border border-[var(--color-border-bright)] hover:text-[var(--color-text)] hover:border-[var(--color-border-bright)]",
  success:   "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 border border-emerald-400/20",
  warning:   "bg-gradient-to-br from-amber-400 to-orange-500 text-black shadow-lg shadow-amber-400/20 hover:shadow-amber-400/40 border border-amber-300/20",
  danger:    "bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-lg shadow-red-500/20 hover:shadow-red-500/40 border border-red-400/20",
  ghost:     "bg-transparent text-[var(--color-text-2)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] border border-transparent",
}

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5 rounded-lg",
  md: "px-4 py-2 text-sm gap-2 rounded-xl",
  lg: "px-6 py-3 text-base gap-2.5 rounded-xl",
}

export function Button({ children, variant = "primary", size = "md", disabled, loading, className, onClick, type = "button", fullWidth }: Props) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      whileTap={{ scale: disabled ? 1 : 0.96 }}
      whileHover={{ scale: disabled ? 1 : 1.01 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all duration-150 cursor-pointer select-none",
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className,
      )}
    >
      {loading ? (
        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
        </svg>
      ) : children}
    </motion.button>
  )
}
