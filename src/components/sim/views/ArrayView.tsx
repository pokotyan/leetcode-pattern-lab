import type { Cell, Pointer } from '../core/types'
import { cellStyle, toneColor } from './style'

type Props = {
  cells: Cell[]
  pointers?: Pointer[]
  showIndex?: boolean
  /** セルの最小幅(px)。文字列1文字なら小さく、数値なら広めに */
  size?: number
}

export function ArrayView({ cells, pointers = [], showIndex = true, size = 44 }: Props) {
  const top = pointers.filter((p) => p.side !== 'bottom')
  const bottom = pointers.filter((p) => p.side === 'bottom')

  return (
    <div className="inline-block min-w-full">
      <div className="flex gap-1">
        {cells.map((c, i) => (
          <div key={i} className="flex flex-col items-center" style={{ minWidth: size }}>
            <PointerRow pointers={top} index={i} dir="down" />
            <div
              className="flex h-10 w-full items-center justify-center rounded-md border-2 font-mono text-sm font-bold transition-colors"
              style={cellStyle[c.state ?? 'idle']}
            >
              {c.value}
            </div>
            {c.note !== undefined && (
              <div className="mt-0.5 font-mono text-[10px]" style={{ color: 'var(--fg-muted)' }}>
                {c.note}
              </div>
            )}
            {showIndex && (
              <div className="mt-0.5 font-mono text-[10px]" style={{ color: 'var(--fg-muted)' }}>
                {i}
              </div>
            )}
            <PointerRow pointers={bottom} index={i} dir="up" />
          </div>
        ))}
      </div>
    </div>
  )
}

function PointerRow({
  pointers,
  index,
  dir,
}: {
  pointers: Pointer[]
  index: number
  dir: 'up' | 'down'
}) {
  const hit = pointers.filter((p) => p.index === index)
  if (pointers.length === 0) return null
  return (
    <div className="flex h-9 flex-col items-center justify-end gap-0.5 leading-none">
      {dir === 'down' ? (
        <>
          <Labels hit={hit} />
          <span style={{ color: hit[0] ? toneColor[hit[0].tone ?? 'accent'] : 'transparent' }}>▼</span>
        </>
      ) : (
        <>
          <span style={{ color: hit[0] ? toneColor[hit[0].tone ?? 'accent'] : 'transparent' }}>▲</span>
          <Labels hit={hit} />
        </>
      )}
    </div>
  )
}

function Labels({ hit }: { hit: Pointer[] }) {
  if (hit.length === 0) return <span className="text-[10px]">&nbsp;</span>
  return (
    <span className="whitespace-nowrap font-mono text-[10px] font-bold">
      {hit.map((p, i) => (
        <span key={p.name} style={{ color: toneColor[p.tone ?? 'accent'] }}>
          {i > 0 && <span style={{ color: 'var(--fg-muted)' }}>,</span>}
          {p.name}
        </span>
      ))}
    </span>
  )
}
