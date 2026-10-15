import { useHierarchyControls, type Args, type HView, type Op } from '../hierarchy/HierarchySim'
import type { Frame } from '../core/types'
import { trace as adjacency } from './AdjacencyList'
import { trace as path } from './PathEnumeration'
import { trace as nested } from './NestedSet'
import { trace as closure } from './ClosureTable'

const MODELS: { name: string; trace: (op: Op, a: Args) => Frame<HView>[] }[] = [
  { name: '隣接リスト', trace: adjacency },
  { name: '経路列挙', trace: path },
  { name: '入れ子集合', trace: nested },
  { name: '閉包テーブル', trace: closure },
]

const METRICS = ['発行した文', '読んだ行', '書いた行'] as const

export default function HierarchyCompare() {
  const { op, args, controls } = useHierarchyControls()
  const results = MODELS.map((m) => {
    const frames = m.trace(op, args)
    const first = frames[0]!
    const last = frames[frames.length - 1]!
    return {
      name: m.name,
      vars: last.vars ?? {},
      stored: first.view.tables.reduce((n, t) => n + t.rows.length, 0),
      note: last.note,
    }
  })
  const max = Object.fromEntries(
    METRICS.map((k) => [k, Math.max(1, ...results.map((r) => Number(r.vars[k] ?? 0)))]),
  ) as Record<(typeof METRICS)[number], number>

  return (
    <section
      className="not-prose my-8 rounded-xl border lg:-mx-10"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-soft)' }}
    >
      <header className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
        <h4 className="m-0 text-sm font-bold tracking-wide">
          <span style={{ color: 'var(--accent)' }}>CMP</span> 同じ操作を 4 つの方式で
        </h4>
        <p className="m-0 text-xs" style={{ color: 'var(--fg-muted)' }}>
          10 ノードの木で、選んだ操作に何文・何行かかるか。各方式の回でステップ実行できる
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 text-xs" style={{ borderColor: 'var(--border)' }}>
        {controls}
      </div>
      <div className="overflow-x-auto p-4">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr style={{ color: 'var(--fg-muted)' }}>
              <th className="py-1 pr-3 text-left font-bold">方式</th>
              <th className="py-1 pr-3 text-right font-bold">木を表す行</th>
              {METRICS.map((k) => (
                <th key={k} className="py-1 pr-3 text-left font-bold">
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.name} className="border-t" style={{ borderColor: 'var(--border)' }}>
                <td className="py-1.5 pr-3 font-bold">{r.name}</td>
                <td className="py-1.5 pr-3 text-right font-mono">{r.stored}</td>
                {METRICS.map((k) => {
                  const v = Number(r.vars[k] ?? 0)
                  return (
                    <td key={k} className="py-1.5 pr-3">
                      <span className="flex items-center gap-2">
                        <span className="w-6 text-right font-mono font-bold">{v}</span>
                        <span
                          className="inline-block h-2 rounded-sm"
                          style={{
                            width: `${(v / max[k]) * 90}px`,
                            background: k === '書いた行' ? 'var(--warn)' : 'var(--accent)',
                          }}
                        />
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="m-0 mt-3 list-none space-y-1 p-0 text-[12px]" style={{ color: 'var(--fg-muted)' }}>
          {results.map((r) => (
            <li key={r.name}>
              <b style={{ color: 'var(--fg)' }}>{r.name}</b>：{r.note}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
