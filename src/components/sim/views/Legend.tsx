import type { CellState } from '../core/types'
import { cellStyle } from './style'

export function LegendItem({ state, children }: { state: CellState; children: string }) {
  const s = cellStyle[state]
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-3 rounded-sm border"
        style={{ background: s.background, borderColor: s.borderColor }}
      />
      {children}
    </span>
  )
}
