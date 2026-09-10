import type { CellState } from '../core/types'
import { cellStyle, toneColor } from './style'

export type LLNode = {
  id: string
  value: string | number
  state?: CellState
  /** 矢印の先の id（null なら None）。x座標の大小で矢印の向きを自動判定する */
  nextId?: string | null
}

export type LLPointer = {
  name: string
  /** 指しているノードの id。null を指すこともある */
  targetId: string | null
  tone?: 'accent' | 'ok' | 'warn' | 'danger'
}

/**
 * 連結リストをノードの配列（x座標つき）として描画する。
 * ノードは呼び出し側が横一列に並ぶよう nodes 配列の順で並べればよい。
 * 矢印は各ノードの nextId を見て自動的に引く。
 */
export function LinkedListView({
  nodes,
  pointers = [],
  gap = 84,
  nodeSize = 46,
}: {
  nodes: LLNode[]
  pointers?: LLPointer[]
  gap?: number
  nodeSize?: number
}) {
  const posById = new Map(nodes.map((n, i) => [n.id, i * gap + nodeSize / 2 + 8]))
  const width = nodes.length * gap + 60
  const height = 140

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: '100%', height: 'auto' }} role="img">
      <defs>
        <marker id="ll-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--fg-muted)" />
        </marker>
      </defs>

      {nodes.map((n) => {
        const x = posById.get(n.id)!
        const nextX = n.nextId ? posById.get(n.nextId) : undefined
        if (n.nextId === undefined || nextX === undefined) return null
        // x座標の大小から矢印の向きを判定する（reverseArrow の手動指定は不要）
        const pointsRight = nextX > x
        const fromX = pointsRight ? x + nodeSize / 2 + 4 : x - nodeSize / 2 - 4
        const toX = pointsRight ? nextX - nodeSize / 2 - 4 : nextX + nodeSize / 2 + 4
        const y = 62
        return (
          <path
            key={`edge-${n.id}`}
            d={`M ${fromX} ${y - 14} Q ${(fromX + toX) / 2} ${y - 32} ${toX} ${y - 14}`}
            fill="none"
            stroke="var(--fg-muted)"
            strokeWidth={2}
            markerEnd="url(#ll-arrow)"
          />
        )
      })}

      {nodes.map((n) => {
        const x = posById.get(n.id)!
        const s = cellStyle[n.state ?? 'idle']
        const y = 62
        const pts = pointers.filter((p) => p.targetId === n.id)
        return (
          <g key={n.id}>
            <rect
              x={x - nodeSize / 2}
              y={y - nodeSize / 2}
              width={nodeSize}
              height={nodeSize}
              rx={8}
              fill={s.background}
              stroke={s.borderColor}
              strokeWidth={2}
            />
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="14"
              fontWeight="700"
              fontFamily="ui-monospace, monospace"
              fill={s.color}
            >
              {n.value}
            </text>
            {n.nextId === null && (
              <text
                x={x + nodeSize / 2 + 16}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="10"
                fontFamily="ui-monospace, monospace"
                fill="var(--fg-muted)"
              >
                None
              </text>
            )}
            {pts.length > 0 && (
              <>
                <text
                  x={x}
                  y={y + nodeSize / 2 + 14}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="700"
                  fontFamily="ui-monospace, monospace"
                >
                  {pts.map((p, i) => (
                    <tspan key={p.name} fill={toneColor[p.tone ?? 'accent']} dx={i > 0 ? 4 : 0}>
                      {p.name}
                    </tspan>
                  ))}
                </text>
                <text
                  x={x}
                  y={y + nodeSize / 2 + 2}
                  textAnchor="middle"
                  fontSize="11"
                  fill={toneColor[pts[0]!.tone ?? 'accent']}
                >
                  ▲
                </text>
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}
