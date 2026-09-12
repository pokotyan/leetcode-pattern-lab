import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { GraphView, type GEdge, type GNode } from '../views/GraphView'
import { LegendItem } from '../views/Legend'
import type { Frame } from '../core/types'

const CODE = `def cross(o, a, b):
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

def convex_hull(points):
    points = sorted(set(points))          # x の昇順、同じなら y の昇順
    if len(points) <= 2:
        return points

    def build(pts):
        hull = []
        for p in pts:
            while len(hull) >= 2 and cross(hull[-2], hull[-1], p) <= 0:
                hull.pop()                # 左に曲がっていないなら、へこむので戻す
            hull.append(p)
        return hull

    lower = build(points)                 # 下側の境界
    upper = build(points[::-1])           # 逆順に走ると上側の境界
    return lower[:-1] + upper[:-1]`

type Pt = [number, number]
type View = { nodes: GNode[]; edges: GEdge[]; hull: string; phase: string }

const SIZE = 10

function toCanvas([x, y]: Pt): [number, number] {
  const pad = 34
  const w = 420
  const h = 240
  return [pad + (x / SIZE) * (w - pad * 2), h - pad - (y / SIZE) * (h - pad * 2)]
}

const cross = (o: Pt, a: Pt, b: Pt) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

function trace(raw: Pt[]): Frame<View>[] {
  const key = (p: Pt) => `${p[0]},${p[1]}`
  const points = [...new Map(raw.map((p) => [key(p), p])).values()].sort(
    (a, b) => a[0] - b[0] || a[1] - b[1],
  )
  const frames: Frame<View>[] = []
  const idOf = new Map(points.map((p, i) => [key(p), i]))

  const snap = (
    line: number | number[],
    note: string,
    opts: {
      hull: Pt[]
      cur?: Pt
      popped?: Pt
      done?: Pt[]
      phase: string
      finished?: boolean
    },
  ) => {
    const inHull = new Set(opts.hull.map(key))
    const inDone = new Set((opts.done ?? []).map(key))
    const nodes: GNode[] = points.map((p, i) => {
      let state: GNode['state'] = 'idle'
      if (inDone.has(key(p))) state = 'good'
      if (inHull.has(key(p))) state = 'window'
      if (opts.popped && key(opts.popped) === key(p)) state = 'bad'
      if (opts.cur && key(opts.cur) === key(p)) state = 'active'
      const [x, y] = toCanvas(p)
      return { id: i, label: `${p[0]},${p[1]}`, x, y, state }
    })
    const edges: GEdge[] = []
    const chain = [...(opts.done ?? []), ...opts.hull]
    for (let i = 0; i + 1 < opts.hull.length; i++) {
      edges.push({
        from: idOf.get(key(opts.hull[i]!))!,
        to: idOf.get(key(opts.hull[i + 1]!))!,
        state: 'active',
      })
    }
    const done = opts.done ?? []
    for (let i = 0; i + 1 < done.length; i++) {
      edges.push({ from: idOf.get(key(done[i]!))!, to: idOf.get(key(done[i + 1]!))!, state: 'good' })
    }
    frames.push({
      line,
      note,
      vars: { 段階: opts.phase, 頂点数: chain.length },
      view: {
        nodes,
        edges,
        hull: opts.hull.map((p) => `(${p[0]},${p[1]})`).join(' → '),
        phase: opts.phase,
      },
      done: opts.finished,
    })
  }

  snap(5, `x の昇順に並べ替える: ${points.map((p) => `(${p[0]},${p[1]})`).join(' ')}。左から順に見て、外側だけを残していく`, {
    hull: [],
    phase: '準備',
  })

  const build = (pts: Pt[], phase: string, done: Pt[]): Pt[] => {
    const hull: Pt[] = []
    for (const p of pts) {
      while (hull.length >= 2 && cross(hull[hull.length - 2]!, hull[hull.length - 1]!, p) <= 0) {
        const popped = hull[hull.length - 1]!
        snap([10, 11], `(${hull[hull.length - 2]![0]},${hull[hull.length - 2]![1]}) → (${popped[0]},${popped[1]}) → (${p[0]},${p[1]}) は左に曲がっていない。(${popped[0]},${popped[1]}) は内側に入ってしまうので外す`, {
          hull: [...hull],
          cur: p,
          popped,
          done,
          phase,
        })
        hull.pop()
      }
      hull.push(p)
      snap(12, `(${p[0]},${p[1]}) を追加。ここまでの境界は ${hull.map((q) => `(${q[0]},${q[1]})`).join(' → ')}`, {
        hull: [...hull],
        cur: p,
        done,
        phase,
      })
    }
    return hull
  }

  const lower = build(points, '下側の境界', [])
  snap(15, `下側の境界が決まった。今度は同じ手順を逆順に走らせて、上側の境界を作る`, {
    hull: [],
    done: lower,
    phase: '下側 完了',
  })
  const upper = build([...points].reverse(), '上側の境界', lower)

  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)]
  snap(16, `完了。凸包の頂点は ${hull.length} 個: ${hull.map((p) => `(${p[0]},${p[1]})`).join(' → ')}`, {
    hull: [],
    done: [...hull, hull[0]!],
    phase: '完了',
    finished: true,
  })
  return frames
}

const PRESETS: { name: string; value: Pt[] }[] = [
  { name: '7点', value: [[1, 1], [2, 5], [3, 3], [5, 1], [6, 6], [8, 3], [4, 8]] },
  { name: '内側に点', value: [[1, 1], [9, 1], [9, 9], [1, 9], [5, 5], [4, 6]] },
  { name: '一直線を含む', value: [[1, 1], [3, 1], [5, 1], [3, 5]] },
]

export default function ConvexHull() {
  const [pts, setPts] = useState<Pt[]>(PRESETS[0]!.value)
  const frames = useMemo(() => trace(pts), [pts])

  return (
    <SimShell
      title="凸包（外側の点だけを残す）"
      subtitle="x 順に並べて左から見ていき、「左に曲がっていない」点を外す。外積の符号だけで判定できる"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="points" presets={PRESETS} onPick={setPts} />}
      legend={
        <>
          <LegendItem state="active">いま見ている点 / 作りかけの境界</LegendItem>
          <LegendItem state="bad">内側なので外した点</LegendItem>
          <LegendItem state="window">境界の候補</LegendItem>
          <LegendItem state="good">確定した境界</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-2">
          <p className="m-0 font-mono text-[11px]" style={{ color: 'var(--accent)' }}>
            {f.view.phase}
          </p>
          <GraphView nodes={f.view.nodes} edges={f.view.edges} directed={false} width={420} height={240} />
          <p className="m-0 break-all font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            作りかけ: {f.view.hull || '（空）'}
          </p>
        </div>
      )}
    </SimShell>
  )
}
