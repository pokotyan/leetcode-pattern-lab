import type { CellState } from '../core/types'
import { cellStyle } from './style'

export type GNode = {
  id: number
  label: string
  x: number
  y: number
  state?: CellState
  /** ノード横に出す小さな数値（入次数など） */
  badge?: string | number
}

export type GEdge = {
  from: number
  to: number
  state?: 'idle' | 'active' | 'dim' | 'good'
}

const EDGE_COLOR = {
  idle: 'var(--border)',
  active: 'var(--accent)',
  dim: 'var(--border)',
  good: 'var(--ok)',
} as const

const R = 20

export function GraphView({
  nodes,
  edges,
  directed = true,
  width = 460,
  height = 260,
}: {
  nodes: GNode[]
  edges: GEdge[]
  directed?: boolean
  width?: number
  height?: number
}) {
  const byId = new Map(nodes.map((n) => [n.id, n]))

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ maxWidth: '100%', height: 'auto' }}
      role="img"
    >
      <defs>
        {(['idle', 'active', 'dim', 'good'] as const).map((k) => (
          <marker
            key={k}
            id={`arrow-${k}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={EDGE_COLOR[k]} />
          </marker>
        ))}
      </defs>

      {edges.map((e, i) => {
        const a = byId.get(e.from)
        const b = byId.get(e.to)
        if (!a || !b) return null
        const dx = b.x - a.x
        const dy = b.y - a.y
        const len = Math.hypot(dx, dy) || 1
        const ux = dx / len
        const uy = dy / len
        const k = e.state ?? 'idle'
        return (
          <line
            key={i}
            x1={a.x + ux * R}
            y1={a.y + uy * R}
            x2={b.x - ux * (R + 4)}
            y2={b.y - uy * (R + 4)}
            stroke={EDGE_COLOR[k]}
            strokeWidth={k === 'active' || k === 'good' ? 2.5 : 1.5}
            strokeDasharray={k === 'dim' ? '4 4' : undefined}
            opacity={k === 'dim' ? 0.4 : 1}
            markerEnd={directed ? `url(#arrow-${k})` : undefined}
          />
        )
      })}

      {nodes.map((n) => {
        const s = cellStyle[n.state ?? 'idle']
        return (
          <g key={n.id}>
            <circle
              cx={n.x}
              cy={n.y}
              r={R}
              fill={s.background}
              stroke={s.borderColor}
              strokeWidth={2}
            />
            <text
              x={n.x}
              y={n.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="13"
              fontWeight="700"
              fontFamily="ui-monospace, monospace"
              fill={s.color}
            >
              {n.label}
            </text>
            {n.badge !== undefined && (
              <>
                <circle cx={n.x + R - 2} cy={n.y - R + 2} r={9} fill="var(--warn)" />
                <text
                  x={n.x + R - 2}
                  y={n.y - R + 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="10"
                  fontWeight="700"
                  fontFamily="ui-monospace, monospace"
                  fill="#fff"
                >
                  {n.badge}
                </text>
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}
