import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { GraphView, type GEdge, type GNode } from '../views/GraphView'
import { LegendItem } from '../views/Legend'
import type { Frame } from '../core/types'

const CODE = `def cross(o, a, b):
    # o から a へのベクトルと、o から b へのベクトルの外積
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

# cross > 0  : o → a → b は左に曲がる（反時計回り）
# cross < 0  : 右に曲がる（時計回り）
# cross == 0 : 3点は一直線`

type Pt = [number, number]
type Case = { o: Pt; a: Pt; b: Pt; name: string }
type View = { nodes: GNode[]; edges: GEdge[]; lines: string[]; verdict: string }

const SIZE = 8

function toCanvas([x, y]: Pt): [number, number] {
  const pad = 36
  const w = 400
  const h = 220
  return [pad + (x / SIZE) * (w - pad * 2), h - pad - (y / SIZE) * (h - pad * 2)]
}

function trace({ o, a, b }: Case): Frame<View>[] {
  const frames: Frame<View>[] = []
  const lines: string[] = []
  const dx1 = a[0] - o[0]
  const dy1 = a[1] - o[1]
  const dx2 = b[0] - o[0]
  const dy2 = b[1] - o[1]
  const cross = dx1 * dy2 - dy1 * dx2

  const snap = (
    line: number | number[],
    note: string,
    opts: { show?: ('a' | 'b')[]; verdict?: string; finished?: boolean } = {},
  ) => {
    const show = opts.show ?? []
    const nodes: GNode[] = [
      { id: 0, label: 'O', x: toCanvas(o)[0], y: toCanvas(o)[1], state: 'window' },
      { id: 1, label: 'A', x: toCanvas(a)[0], y: toCanvas(a)[1], state: show.includes('a') ? 'active' : 'idle' },
      { id: 2, label: 'B', x: toCanvas(b)[0], y: toCanvas(b)[1], state: show.includes('b') ? 'good' : 'idle' },
    ]
    const edges: GEdge[] = []
    if (show.includes('a')) edges.push({ from: 0, to: 1, state: 'active' })
    if (show.includes('b')) edges.push({ from: 0, to: 2, state: 'good' })
    frames.push({
      line,
      note,
      vars: { 'A−O': `(${dx1}, ${dy1})`, 'B−O': `(${dx2}, ${dy2})`, 外積: opts.verdict ? cross : '−' },
      view: { nodes, edges, lines: [...lines], verdict: opts.verdict ?? '' },
      done: opts.finished,
    })
  }

  snap(1, `基準の点 O = (${o[0]}, ${o[1]})、そこから見た A = (${a[0]}, ${a[1]}) と B = (${b[0]}, ${b[1]})`)
  lines.push(`A − O = (${dx1}, ${dy1})`)
  snap(3, `O から A へ向かうベクトルは (${dx1}, ${dy1})`, { show: ['a'] })
  lines.push(`B − O = (${dx2}, ${dy2})`)
  snap(3, `O から B へ向かうベクトルは (${dx2}, ${dy2})`, { show: ['a', 'b'] })
  lines.push(`${dx1} × ${dy2} − ${dy1} × ${dx2} = ${dx1 * dy2} − ${dy1 * dx2} = ${cross}`)
  const verdict = cross > 0 ? '左に曲がる（反時計回り）' : cross < 0 ? '右に曲がる（時計回り）' : '一直線'
  snap([5, 6, 7], `外積は ${cross}。${verdict}。O から A を見て、そこからさらに B がどちら側にあるかが、符号だけで分かる`, {
    show: ['a', 'b'],
    verdict,
    finished: true,
  })
  return frames
}

const CASES: { name: string; value: Case }[] = [
  { name: '左に曲がる', value: { o: [1, 1], a: [5, 2], b: [3, 6], name: '' } },
  { name: '右に曲がる', value: { o: [1, 6], a: [5, 5], b: [3, 1], name: '' } },
  { name: '一直線', value: { o: [1, 1], a: [3, 3], b: [6, 6], name: '' } },
  { name: '真上と真右', value: { o: [2, 2], a: [6, 2], b: [2, 6], name: '' } },
]

export default function CrossProduct() {
  const [c, setC] = useState<Case>(CASES[0]!.value)
  const frames = useMemo(() => trace(c), [c])

  return (
    <SimShell
      title="外積の符号で「どちらに曲がるか」を判定する"
      subtitle="角度も三角関数も使わず、掛け算2回と引き算1回。整数のままなので誤差が出ない"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="3点" presets={CASES} onPick={setC} />}
      legend={
        <>
          <LegendItem state="window">基準点 O</LegendItem>
          <LegendItem state="active">A</LegendItem>
          <LegendItem state="good">B</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <GraphView nodes={f.view.nodes} edges={f.view.edges} directed width={400} height={220} />
          <ul className="m-0 list-none space-y-0.5 p-0 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
            {f.view.lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
          {f.view.verdict && (
            <p className="m-0 font-mono text-sm" style={{ color: 'var(--ok)' }}>
              {f.view.verdict}
            </p>
          )}
        </div>
      )}
    </SimShell>
  )
}
