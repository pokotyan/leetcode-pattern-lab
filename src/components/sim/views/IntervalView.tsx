import type { CellState } from '../core/types'
import { cellStyle } from './style'

export type Bar = {
  start: number
  end: number
  label?: string
  state?: CellState
  /** 何段目に描くか。省略すると配列の並び順 */
  row?: number
}

/**
 * 数直線の上に区間を横棒として並べる。
 * 区間の重なり・隣接・掃過線の位置を目で確かめるための描画。
 */
export function IntervalView({
  bars,
  min,
  max,
  sweep,
  width = 460,
  rowHeight = 26,
  label,
}: {
  bars: Bar[]
  min: number
  max: number
  /** 掃過線（いま処理している座標）を縦線で出す */
  sweep?: number | null
  width?: number
  rowHeight?: number
  label?: string
}) {
  const padX = 26
  const axisY = 18
  const span = Math.max(max - min, 1)
  const x = (v: number) => padX + ((v - min) / span) * (width - padX * 2)
  const rows = bars.map((b, i) => b.row ?? i)
  const height = axisY + 14 + (Math.max(...rows, 0) + 1) * rowHeight

  const step = Math.max(1, Math.ceil(span / 10))
  const ticks: number[] = []
  for (let v = min; v <= max; v += step) ticks.push(v)

  return (
    <div style={{ width: '100%', maxWidth: width }}>
      {label && (
        <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
          {label}
        </p>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
      >
        <line x1={padX} y1={axisY} x2={width - padX} y2={axisY} stroke="var(--border)" strokeWidth={1} />
        {ticks.map((v) => (
          <g key={v}>
            <line x1={x(v)} y1={axisY - 4} x2={x(v)} y2={axisY} stroke="var(--border)" strokeWidth={1} />
            <text
              x={x(v)}
              y={axisY - 8}
              textAnchor="middle"
              fontSize="10"
              fontFamily="ui-monospace, monospace"
              fill="var(--fg-muted)"
            >
              {v}
            </text>
          </g>
        ))}

        {sweep !== null && sweep !== undefined && (
          <line
            x1={x(sweep)}
            y1={axisY}
            x2={x(sweep)}
            y2={height}
            stroke="var(--warn)"
            strokeWidth={2}
            strokeDasharray="4 3"
          />
        )}

        {bars.map((b, i) => {
          const s = cellStyle[b.state ?? 'idle']
          const y = axisY + 12 + (b.row ?? i) * rowHeight
          const x1 = x(b.start)
          const x2 = x(b.end)
          return (
            <g key={i}>
              <rect
                x={x1}
                y={y}
                width={Math.max(x2 - x1, 3)}
                height={rowHeight - 10}
                rx={4}
                fill={s.background}
                stroke={s.borderColor}
                strokeWidth={2}
              />
              <text
                x={(x1 + x2) / 2}
                y={y + (rowHeight - 10) / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="10"
                fontWeight="700"
                fontFamily="ui-monospace, monospace"
                fill={s.color}
              >
                {b.label ?? `${b.start},${b.end}`}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
