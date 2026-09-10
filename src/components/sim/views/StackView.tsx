import type { Cell } from '../core/types'
import { cellStyle } from './style'

/**
 * スタックを、下から上に積み上がる縦向きの箱として描画する。
 * items[0] が一番下（最初に積んだ皿）、items の最後が一番上（トップ）。
 */
export function StackView({
  items,
  width = 96,
  label = 'top',
}: {
  items: Cell[]
  width?: number
  label?: string
}) {
  return (
    <div className="inline-flex flex-col-reverse items-center gap-1" style={{ minWidth: width }}>
      {items.length === 0 && (
        <div
          className="flex h-10 items-center justify-center rounded border border-dashed font-mono text-[11px]"
          style={{ width, borderColor: 'var(--border)', color: 'var(--fg-muted)' }}
        >
          空
        </div>
      )}
      {items.map((c, i) => (
        <div key={i} className="flex flex-col items-center">
          {i === items.length - 1 && (
            <div className="mb-0.5 font-mono text-[10px] font-bold" style={{ color: 'var(--accent)' }}>
              ▼ {label}
            </div>
          )}
          <div
            className="flex h-9 items-center justify-center rounded-md border-2 font-mono text-sm font-bold"
            style={{ width, ...cellStyle[c.state ?? 'idle'] }}
          >
            {c.value}
          </div>
        </div>
      ))}
    </div>
  )
}
