import type { Cell } from '../core/types'
import { cellStyle } from './style'

type Props = {
  grid: Cell[][]
  /** いま注目しているセル [row, col] */
  cursor?: [number, number] | null
  cellSize?: number
}

export function GridView({ grid, cursor, cellSize = 34 }: Props) {
  return (
    <div className="inline-block">
      <div className="flex flex-col gap-1">
        {grid.map((row, r) => (
          <div key={r} className="flex gap-1">
            {row.map((c, q) => {
              const isCursor = cursor?.[0] === r && cursor?.[1] === q
              const s = cellStyle[c.state ?? 'idle']
              return (
                <div
                  key={q}
                  className="flex items-center justify-center rounded border-2 font-mono text-xs font-bold transition-colors"
                  style={{
                    width: cellSize,
                    height: cellSize,
                    ...s,
                    outline: isCursor ? '3px solid var(--warn)' : undefined,
                    outlineOffset: isCursor ? '1px' : undefined,
                  }}
                  title={`(${r}, ${q})`}
                >
                  {c.value}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
