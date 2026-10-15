import type { CellState } from '../core/types'
import { cellStyle } from './style'

type Value = string | number | null

export type Row = {
  key: string
  cells: Value[]
  state?: CellState
  /** 書き換え前の値。同じ位置の値と違えば「前→後」で出す */
  prev?: Value[]
}

export type RowTableData = { title?: string; columns: string[]; rows: Row[] }

const show = (v: Value | undefined) => (v === null || v === undefined ? 'NULL' : String(v))

/** DB の表を 1 行ずつ状態つきで描く */
export function RowTable({ title, columns, rows }: RowTableData) {
  return (
    <div className="min-w-0">
      {title && (
        <p className="m-0 mb-1 font-mono text-[11px] font-bold" style={{ color: 'var(--fg-muted)' }}>
          {title}
          <span className="ml-2 font-normal">{rows.length} 行</span>
        </p>
      )}
      <table className="m-0 w-full border-collapse font-mono text-[11.5px]">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                className="border px-1.5 py-0.5 text-left font-bold"
                style={{ borderColor: 'var(--border)', color: 'var(--fg-muted)' }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = cellStyle[r.state ?? 'idle']
            return (
              <tr key={r.key} style={{ background: s.background, color: s.color, opacity: r.state === 'dim' ? 0.55 : 1 }}>
                {r.cells.map((v, i) => {
                  const before = r.prev?.[i]
                  const changed = r.prev !== undefined && before !== v
                  return (
                    <td
                      key={i}
                      className="whitespace-nowrap border px-1.5 py-0.5"
                      style={{
                        borderColor: r.state && r.state !== 'idle' && r.state !== 'dim' ? s.borderColor : 'var(--border)',
                        fontStyle: v === null ? 'italic' : undefined,
                        opacity: v === null ? 0.6 : 1,
                      }}
                    >
                      {changed ? (
                        <>
                          <span style={{ opacity: 0.6, textDecoration: 'line-through' }}>{show(before)}</span>
                          {' → '}
                          <b>{show(v)}</b>
                        </>
                      ) : (
                        show(v)
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
