import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { LegendItem } from '../views/Legend'
import { cellStyle } from '../views/style'
import type { CellState, Frame } from '../core/types'

const CODE = `const rowCache = new Map()

class ListView {
  constructor() {
    this.root = document.createElement('section')
    const row = document.createElement('div')
    row.textContent = 'item 0'
    this.root.appendChild(row)
    rowCache.set('0-0', row)
    this.payload = new Array(20000).fill(0)
    this.onResize = () => { this.root.dataset.w = String(innerWidth) }
    window.addEventListener('resize', this.onResize)
  }
  close() {
    this.root.remove()
    window.removeEventListener('resize', this.onResize)
    rowCache.delete('0-0')
  }
}

let view = new ListView()
app.appendChild(view.root)
view.close()
view = null`

type NodeId =
  | 'roots'
  | 'window'
  | 'cache'
  | 'document'
  | 'listeners'
  | 'app'
  | 'closure'
  | 'view'
  | 'payload'
  | 'section'
  | 'div'
  | 'text'

type Node = { id: NodeId; label: string; x: number; y: number; size: number; dom?: boolean }
type Edge = { from: NodeId; to: NodeId; label: string; domChild?: boolean }

// 大きさは Chrome 155 のスナップショットで実際に見えた値に近づけてある（payload は配列の本体を含めた値）
const NODES: Node[] = [
  { id: 'roots', label: '(GC roots)', x: 50, y: 175, size: 0 },
  { id: 'window', label: 'window', x: 165, y: 35, size: 920 },
  { id: 'listeners', label: 'resize のリスナ', x: 285, y: 35, size: 120 },
  { id: 'closure', label: 'onResize', x: 405, y: 35, size: 28 },
  { id: 'view', label: 'ListView', x: 285, y: 105, size: 24 },
  { id: 'payload', label: 'payload', x: 405, y: 105, size: 80024 },
  { id: 'cache', label: 'rowCache', x: 165, y: 175, size: 56 },
  { id: 'section', label: '<section>', x: 285, y: 245, size: 104, dom: true },
  { id: 'div', label: '<div>', x: 405, y: 245, size: 104, dom: true },
  { id: 'document', label: 'document', x: 50, y: 315, size: 3456, dom: true },
  { id: 'app', label: '<main>', x: 165, y: 315, size: 104, dom: true },
  { id: 'text', label: 'Text', x: 405, y: 315, size: 80, dom: true },
]
const nodeById = new Map(NODES.map((n) => [n.id, n]))

const INITIAL_EDGES: Edge[] = [
  { from: 'roots', to: 'window', label: 'global' },
  { from: 'roots', to: 'cache', label: '' },
  { from: 'roots', to: 'view', label: 'view' },
  { from: 'window', to: 'document', label: 'document' },
  { from: 'window', to: 'listeners', label: '' },
  { from: 'listeners', to: 'closure', label: '' },
  { from: 'closure', to: 'view', label: 'this' },
  { from: 'view', to: 'closure', label: 'onResize' },
  { from: 'view', to: 'payload', label: 'payload' },
  { from: 'view', to: 'section', label: 'root' },
  { from: 'cache', to: 'div', label: "'0-0'" },
  { from: 'document', to: 'app', label: '', domChild: true },
  { from: 'app', to: 'section', label: '', domChild: true },
  { from: 'section', to: 'app', label: '' },
  { from: 'section', to: 'div', label: '', domChild: true },
  { from: 'div', to: 'section', label: '' },
  { from: 'div', to: 'text', label: '', domChild: true },
]

type Case = { removeListener: boolean; deleteCache: boolean }
type Row = { id: NodeId; label: string; shallow: number; retained: number; state: 'live' | 'detached' | 'garbage' }
type View = { edges: Edge[]; rows: Row[]; collected: boolean }

function reachable(edges: Edge[], from: NodeId, skip?: NodeId, domOnly = false): Set<NodeId> {
  const seen = new Set<NodeId>([from])
  const stack = [from]
  while (stack.length > 0) {
    const v = stack.pop()!
    for (const e of edges) {
      if (e.from !== v || e.to === skip || seen.has(e.to)) continue
      if (domOnly && !e.domChild) continue
      seen.add(e.to)
      stack.push(e.to)
    }
  }
  return seen
}

function analyze(edges: Edge[]): Row[] {
  const live = reachable(edges, 'roots')
  const inTree = reachable(edges, 'document', undefined, true)
  return NODES.filter((n) => n.id !== 'roots').map((n) => {
    // n を消したときに roots から届かなくなるものの合計が retained size
    const without = reachable(edges, 'roots', n.id)
    const retained = live.has(n.id)
      ? NODES.filter((m) => live.has(m.id) && !without.has(m.id)).reduce((s, m) => s + m.size, 0)
      : 0
    const state = !live.has(n.id) ? 'garbage' : n.dom && !inTree.has(n.id) ? 'detached' : 'live'
    return { id: n.id, label: n.label, shallow: n.size, retained, state }
  })
}

function trace({ removeListener, deleteCache }: Case): Frame<View>[] {
  let edges = [...INITIAL_EDGES]
  const frames: Frame<View>[] = []
  const drop = (pred: (e: Edge) => boolean) => {
    edges = edges.filter((e) => !pred(e))
  }
  const snap = (line: number | number[], note: string, collected = false, done = false) => {
    const rows = analyze(edges)
    const garbage = rows.filter((r) => r.state === 'garbage')
    frames.push({
      line,
      note,
      vars: {
        Detached: rows.filter((r) => r.state === 'detached').length,
        '回収できる量': `${garbage.reduce((s, r) => s + r.shallow, 0).toLocaleString()} B`,
        'ListView の retained': `${rows.find((r) => r.id === 'view')!.retained.toLocaleString()} B`,
      },
      view: { edges: [...edges], rows, collected },
      done,
    })
  }

  snap([21, 22], '画面を開いた。section は document の木の中にあり、ListView・リスナ・rowCache の 3 方向からも指されている')
  drop((e) => (e.from === 'app' && e.to === 'section') || (e.from === 'section' && e.to === 'app'))
  snap(
    [15],
    'root.remove() で section を木から外した。DOM の木からはもう辿れないが、JavaScript からはまだ届くので Detached になる。div は parentNode で親の section を指したまま',
  )
  if (removeListener) {
    drop((e) => e.from === 'listeners' && e.to === 'closure')
    snap(16, 'removeEventListener で、window → リスナ → onResize → ListView の経路が切れた')
  }
  if (deleteCache) {
    drop((e) => e.from === 'cache' && e.to === 'div')
    snap(17, "rowCache から '0-0' を消した。div への唯一の外からの参照が消えた")
  }
  drop((e) => e.from === 'roots' && e.to === 'view')
  const rows = analyze(edges)
  const left = rows.filter((r) => r.state !== 'garbage' && ['view', 'section', 'div', 'payload'].includes(r.id))
  snap(
    24,
    left.length === 0
      ? 'view = null。画面の部品はもうどこからも届かない'
      : `view = null。それでも ${left.map((r) => r.label).join('、')} が GC ルートから届く`,
  )
  const freed = rows.filter((r) => r.state === 'garbage').reduce((s, r) => s + r.shallow, 0)
  snap(
    24,
    freed === 0
      ? 'GC が走ったが、何も回収できない。画面を開いて閉じるたびに、この塊が 1 つずつ増えていく'
      : left.length === 0
        ? `GC が走り、画面の部品はすべて回収された（${freed.toLocaleString()} バイト）`
        : `GC が走り、届かないもの（${freed.toLocaleString()} バイト）は消えた。残った ${left.map((r) => r.label).join('、')} がリーク`,
    true,
    true,
  )
  return frames
}

const CASES: { name: string; value: Case }[] = [
  { name: '何も外さない', value: { removeListener: false, deleteCache: false } },
  { name: 'リスナだけ外す', value: { removeListener: true, deleteCache: false } },
  { name: 'キャッシュだけ消す', value: { removeListener: false, deleteCache: true } },
  { name: '両方外す', value: { removeListener: true, deleteCache: true } },
]

const STATE_CELL: Record<Row['state'], CellState> = { live: 'idle', detached: 'bad', garbage: 'dim' }
const STATE_LABEL: Record<Row['state'], string> = { live: '到達できる', detached: 'Detached', garbage: 'GC 対象' }

function Graph({ view }: { view: View }) {
  const state = new Map(view.rows.map((r) => [r.id, r.state]))
  const hidden = (id: NodeId) => view.collected && state.get(id) === 'garbage'
  return (
    <svg viewBox="0 0 460 345" className="mx-auto block w-full" style={{ maxWidth: 560 }}>
      <defs>
        <marker id="heap-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--fg-muted)" />
        </marker>
      </defs>
      {view.edges.map((e) => {
        if (hidden(e.from) || hidden(e.to)) return null
        const a = nodeById.get(e.from)!
        const b = nodeById.get(e.to)!
        const back = view.edges.some((x) => x.from === e.to && x.to === e.from)
        // 往復の辺は少しずらして 2 本に見せる
        const off = back ? (e.from < e.to ? 5 : -5) : 0
        const dx = b.x - a.x
        const dy = b.y - a.y
        const len = Math.hypot(dx, dy)
        const ux = dx / len
        const uy = dy / len
        // 矩形の縁で線を止める（半幅 46・半高 14 に 2 の余白）
        const r = Math.min(48 / Math.max(Math.abs(ux), 1e-6), 16 / Math.max(Math.abs(uy), 1e-6))
        const x1 = a.x + ux * r - uy * off
        const y1 = a.y + uy * r + ux * off
        const x2 = b.x - ux * r - uy * off
        const y2 = b.y - uy * r + ux * off
        return (
          <g key={`${e.from}-${e.to}`}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={e.domChild ? 'var(--ok)' : 'var(--fg-muted)'}
              strokeWidth={1.2}
              markerEnd="url(#heap-arrow)"
            />
            {e.label && (
              <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 4} fontSize={10} textAnchor="middle" fill="var(--fg-muted)">
                {e.label}
              </text>
            )}
          </g>
        )
      })}
      {NODES.map((n) => {
        if (hidden(n.id)) return null
        const s = cellStyle[n.id === 'roots' ? 'active' : STATE_CELL[state.get(n.id) ?? 'live']]
        return (
          <g key={n.id}>
            <rect
              x={n.x - 46}
              y={n.y - 14}
              width={92}
              height={28}
              rx={6}
              fill={s.background}
              stroke={s.borderColor}
              strokeDasharray={state.get(n.id) === 'garbage' ? '4 3' : undefined}
            />
            <text x={n.x} y={n.y + 4} fontSize={10} textAnchor="middle" fill={s.color} fontFamily="ui-monospace, monospace">
              {n.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default function HeapRetainers() {
  const [c, setC] = useState<Case>(CASES[0]!.value)
  const frames = useMemo(() => trace(c), [c])

  return (
    <SimShell
      title="Retainers と Retained size"
      subtitle="GC ルートから辿れるものだけが生き残る。retained size は「それを消したら一緒に消えるもの」の合計"
      code={CODE}
      lang="ts"
      frames={frames}
      controls={<PresetControl label="close() で外すもの" presets={CASES} onPick={setC} />}
      legend={
        <>
          <LegendItem state="idle">到達できる</LegendItem>
          <LegendItem state="bad">Detached（木の外にあるのに届く DOM）</LegendItem>
          <LegendItem state="dim">GC 対象</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <Graph view={f.view} />
          <table className="w-full border-collapse font-mono text-[11px]">
            <thead>
              <tr style={{ color: 'var(--fg-muted)' }}>
                <th className="py-1 text-left font-normal">オブジェクト</th>
                <th className="py-1 text-right font-normal">Shallow</th>
                <th className="py-1 text-right font-normal">Retained</th>
                <th className="py-1 pl-3 text-left font-normal">状態</th>
              </tr>
            </thead>
            <tbody>
              {f.view.rows
                .filter((r) => ['view', 'closure', 'payload', 'section', 'div', 'cache'].includes(r.id))
                .map((r) => (
                  <tr key={r.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-1">{r.label}</td>
                    <td className="py-1 text-right">{r.shallow.toLocaleString()}</td>
                    <td className="py-1 text-right">{r.state === 'garbage' ? '−' : r.retained.toLocaleString()}</td>
                    <td
                      className="py-1 pl-3"
                      style={{ color: r.state === 'detached' ? 'var(--danger)' : 'var(--fg-muted)' }}
                    >
                      {STATE_LABEL[r.state]}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </SimShell>
  )
}
