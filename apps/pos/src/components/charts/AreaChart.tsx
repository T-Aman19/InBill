import { useId, useMemo, useRef, useState } from "react"
import { formatCurrencyCompact, formatCurrencyInt } from "@/lib/utils"
import { smoothPath, type Point } from "./chartMath"

export type AreaChartPoint = { date: string; value: number; label?: string }

const W = 640
const PAD_L = 46
const PAD_R = 4
const PAD_TOP = 14
const PAD_BOT = 24

export function AreaChart({ points, color = "var(--color-accent)", height = 200, formatX }: {
  points: AreaChartPoint[]
  color?: string
  height?: number
  formatX?: (date: string) => string
}) {
  const uid = useId().replace(/[^a-z0-9]/gi, "")
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const innerW = W - PAD_L - PAD_R
  const innerH = height - PAD_TOP - PAD_BOT
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0

  const { coords, max } = useMemo(() => {
    const max = Math.max(...points.map((p) => p.value), 0) * 1.18 || 1
    const coords: Point[] = points.map((p, i) => [PAD_L + i * stepX, PAD_TOP + innerH - (p.value / max) * innerH])
    return { coords, max }
  }, [points, innerH, stepX])

  if (points.length === 0) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink-3)", fontSize: 13 }}>
        No data for this range
      </div>
    )
  }

  const linePath = smoothPath(coords)
  const last = coords[coords.length - 1]!
  const first = coords[0]!
  const areaPath = `${linePath} L ${last[0].toFixed(2)} ${PAD_TOP + innerH} L ${first[0].toFixed(2)} ${PAD_TOP + innerH} Z`

  const tickIdxs = points.length <= 8
    ? points.map((_, i) => i)
    : Array.from(new Set([0, Math.round((points.length - 1) * 0.25), Math.round((points.length - 1) * 0.5), Math.round((points.length - 1) * 0.75), points.length - 1]))

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current!.getBoundingClientRect()
    const xFrac = (e.clientX - rect.left) / rect.width
    const idx = Math.max(0, Math.min(points.length - 1, Math.round((xFrac * W - PAD_L) / (stepX || 1))))
    setHoverIdx(idx)
  }

  const hoverPoint = hoverIdx !== null ? points[hoverIdx] : undefined
  const hoverCoord = hoverIdx !== null ? coords[hoverIdx] : undefined

  return (
    <div style={{ position: "relative", width: "100%" }} onMouseLeave={() => setHoverIdx(null)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        style={{ display: "block", width: "100%", height: "auto", overflow: "visible" }}
        onMouseMove={handleMove}
        role="img"
        aria-label="Revenue trend"
      >
        <defs>
          <linearGradient id={`ac-grad-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((f) => {
          const y = PAD_TOP + innerH * f
          return (
            <g key={f}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="var(--color-line)" strokeWidth={1} />
              <text x={PAD_L - 8} y={y + 3} textAnchor="end" fontFamily="var(--font-mono)" fontSize={10} fill="var(--color-ink-3)">
                {formatCurrencyCompact(max * (1 - f))}
              </text>
            </g>
          )
        })}

        {tickIdxs.map((i) => {
          const p = points[i]!
          return (
            <text
              key={i}
              x={coords[i]![0]}
              y={height - 4}
              textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
              fontFamily="var(--font-mono)"
              fontSize={10}
              fill="var(--color-ink-3)"
            >
              {formatX ? formatX(p.date) : p.label ?? p.date}
            </text>
          )
        })}

        <path d={areaPath} fill={`url(#ac-grad-${uid})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        <circle cx={last[0]} cy={last[1]} r={5} fill={color} className="animate-chart-pulse" />
        <circle cx={last[0]} cy={last[1]} r={4} fill={color} stroke="var(--color-surface)" strokeWidth={2} />

        {hoverCoord && (
          <>
            <line x1={hoverCoord[0]} x2={hoverCoord[0]} y1={PAD_TOP} y2={PAD_TOP + innerH} stroke="var(--color-ink-4)" strokeWidth={1} strokeDasharray="2 3" />
            <circle cx={hoverCoord[0]} cy={hoverCoord[1]} r={4.5} fill={color} stroke="var(--color-surface)" strokeWidth={2} />
          </>
        )}
      </svg>

      {hoverPoint && hoverCoord && (
        <div
          style={{
            position: "absolute", pointerEvents: "none", zIndex: 5,
            left: `${(hoverCoord[0] / W) * 100}%`, top: `${(hoverCoord[1] / height) * 100}%`,
            transform: "translate(-50%, calc(-100% - 10px))",
            background: "var(--color-ink)", color: "var(--color-bg)", borderRadius: 8,
            padding: "7px 10px", fontSize: 11.5, lineHeight: 1.4, boxShadow: "var(--shadow-2)", whiteSpace: "nowrap",
          }}
        >
          <div style={{ color: "var(--color-ink-4)", fontSize: 10.5, marginBottom: 2 }}>
            {formatX ? formatX(hoverPoint.date) : hoverPoint.label ?? hoverPoint.date}
          </div>
          <b style={{ fontFamily: "var(--font-mono)" }}>{formatCurrencyInt(hoverPoint.value)}</b>
        </div>
      )}
    </div>
  )
}
