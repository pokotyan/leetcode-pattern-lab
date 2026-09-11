import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { GraphView, type GEdge, type GNode } from '../views/GraphView'
import { LegendItem } from '../views/Legend'
import type { Frame } from '../core/types'

const CODE = `def min_cost_connect_points(points):
    n = len(points)
    edges = []
    for i in range(n):
        for j in range(i + 1, n):
            d = abs(points[i][0] - points[j][0]) + abs(points[i][1] - points[j][1])
            edges.append((d, i, j))
    edges.sort()                      # 短い辺から順に見る

    parent = list(range(n))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    total = used = 0
    for d, u, v in edges:
        ru, rv = find(u), find(v)
        if ru == rv:
            continue                  # 同じグループ = 閉路になるので捨てる
        parent[ru] = rv
        total += d
        used += 1
        if used == n - 1:             # 辺が n-1 本そろえば全体がつながる
            break
    return total`

type Point = [number, number]
type View = { nodes: GNode[]; edges: GEdge[]; groups: string; total: number }

/** 座標をそのまま描画位置にすると潰れるので、キャンバスに収まるよう伸ばす */
function layout(points: Point[], w = 420, h = 210): [number, number][] {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const pad = 34
  return points.map(([x, y]) => [
    pad + ((x - minX) / Math.max(maxX - minX, 1)) * (w - pad * 2),
    pad + ((y - minY) / Math.max(maxY - minY, 1)) * (h - pad * 2),
  ])
}

function trace(points: Point[]): Frame<View>[] {
  const n = points.length
  const pos = layout(points)
  const edges: [number, number, number][] = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = Math.abs(points[i]![0] - points[j]![0]) + Math.abs(points[i]![1] - points[j]![1])
      edges.push([d, i, j])
    }
  }
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])

  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!
      x = parent[x]!
    }
    return x
  }

  const frames: Frame<View>[] = []
  const chosen = new Set<number>()
  const rejected = new Set<number>()
  let total = 0
  let used = 0

  const groupLabel = () => {
    const g = new Map<number, number[]>()
    for (let i = 0; i < n; i++) {
      const r = find(i)
      if (!g.has(r)) g.set(r, [])
      g.get(r)!.push(i)
    }
    return [...g.values()].map((xs) => `{${xs.join(',')}}`).join(' ')
  }

  const snap = (
    line: number | number[],
    note: string,
    opts: { cur?: number; finished?: boolean } = {},
  ) => {
    const nodes: GNode[] = points.map((_, i) => ({
      id: i,
      label: String(i),
      x: pos[i]![0],
      y: pos[i]![1],
      state: opts.cur !== undefined && (edges[opts.cur]![1] === i || edges[opts.cur]![2] === i) ? 'active' : 'idle',
    }))
    const gedges: GEdge[] = edges.map(([d, u, v], k) => ({
      from: u,
      to: v,
      label: d,
      state: chosen.has(k) ? 'good' : rejected.has(k) ? 'bad' : k === opts.cur ? 'active' : 'dim',
    }))
    frames.push({
      line,
      note,
      vars: { 合計: total, 使った辺: `${used}/${n - 1}` },
      view: { nodes, edges: gedges, groups: groupLabel(), total },
      done: opts.finished,
    })
  }

  snap(8, `全ての点の組について距離を出し、短い順に並べる。辺は ${edges.length} 本。ここから短いものを順に採用していく`)

  for (let k = 0; k < edges.length; k++) {
    const [d, u, v] = edges[k]!
    const ru = find(u)
    const rv = find(v)
    snap([18, 19], `辺 ${u}–${v}（距離 ${d}）を見る。${u} の代表は ${ru}、${v} の代表は ${rv}`, { cur: k })
    if (ru === rv) {
      rejected.add(k)
      snap([20, 21], `${u} と ${v} はすでに同じグループ。この辺を足すと閉路ができるだけなので捨てる`, { cur: k })
      continue
    }
    parent[ru] = rv
    chosen.add(k)
    total += d
    used += 1
    snap([22, 23, 24], `別のグループなので採用。2つのグループが1つにつながり、合計は ${total}`, { cur: k })
    if (used === n - 1) {
      snap([25, 26], `辺が ${n - 1} 本そろった。これ以上足すと必ず閉路になるので打ち切る`, { cur: k })
      break
    }
  }
  snap(27, `完了。全点をつなぐ最小の合計コストは ${total}`, { finished: true })
  return frames
}

const PRESETS: { name: string; value: Point[] }[] = [
  { name: 'LC1584の例', value: [[0, 0], [2, 2], [3, 10], [5, 2], [7, 0]] },
  { name: '正方形', value: [[0, 0], [0, 4], [4, 0], [4, 4]] },
  { name: '一直線', value: [[0, 0], [1, 0], [3, 0], [6, 0]] },
]

export default function KruskalMst() {
  const [points, setPoints] = useState<Point[]>(PRESETS[0]!.value)
  const frames = useMemo(() => trace(points), [points])

  return (
    <SimShell
      title="Kruskal 法（短い辺から採用し、閉路だけ捨てる）"
      subtitle="辺を短い順に見て、両端が別グループならつなぐ。同じグループなら閉路なので捨てる"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="points" presets={PRESETS} onPick={setPoints} />}
      legend={
        <>
          <LegendItem state="good">採用した辺</LegendItem>
          <LegendItem state="bad">閉路になるので捨てた辺</LegendItem>
          <LegendItem state="active">いま見ている辺</LegendItem>
          <LegendItem state="dim">まだ見ていない辺</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-2">
          <GraphView nodes={f.view.nodes} edges={f.view.edges} directed={false} width={420} height={210} />
          <p className="m-0 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            グループ: {f.view.groups} / 合計 = <span style={{ color: 'var(--ok)' }}>{f.view.total}</span>
          </p>
        </div>
      )}
    </SimShell>
  )
}
