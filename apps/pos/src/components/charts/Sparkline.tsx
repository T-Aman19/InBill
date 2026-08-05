import { useId } from "react"
import { smoothPath, type Point } from "./chartMath"

const W = 120
const H = 34
const PAD = 4

export function Sparkline({ values, color }: { values: number[]; color: string }) {
  const uid = useId().replace(/[^a-z0-9]/gi, "")
  if (values.length === 0) return null

  const max = Math.max(...values, 0) * 1.12 || 1
  const min = Math.min(0, ...values)
  const stepX = values.length > 1 ? (W - PAD * 2) / (values.length - 1) : 0
  const coords: Point[] = values.map((v, i) => [
    PAD + i * stepX,
    PAD + (H - PAD * 2) - ((v - min) / (max - min || 1)) * (H - PAD * 2),
  ])
  const linePath = smoothPath(coords)
  const last = coords[coords.length - 1]!
  const first = coords[0]!

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", width: "100%", height: "100%" }} aria-hidden="true">
      <defs>
        <linearGradient id={`sp-grad-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={`${linePath} L ${last[0].toFixed(2)} ${H - PAD} L ${first[0].toFixed(2)} ${H - PAD} Z`} fill={`url(#sp-grad-${uid})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.6} fill={color} />
    </svg>
  )
}
