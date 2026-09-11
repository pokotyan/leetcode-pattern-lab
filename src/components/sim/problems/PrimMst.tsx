import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { GraphView, type GEdge, type GNode } from '../views/GraphView'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `import heapq

def min_cost_connect_points(points):
    n = len(points)
    visited = [False] * n
    heap = [(0, 0)]                   # (その点に届くコスト, 点)
    total = count = 0
    while count < n:
        d, u = heapq.heappop(heap)
        if visited[u]:
            continue                  # すでに木に入っている点は飛ばす
        visited[u] = True
        total += d
        count += 1
        for v in range(n):            # 木に入っていない点への辺を全部入れる
            if not visited[v]:
                w = abs(points[u][0] - points[v][0]) + abs(points[u][1] - points[v][1])
                heapq.heappush(heap, (w, v))
    return total`

type Point = [number, number]
type View = { nodes: GNode[]; edges: GEdge[]; heap: Cell[]; total: number }

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

const dist = (a: Point, b: Point) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])

function trace(points: Point[]): Frame<View>[] {
  const n = points.length
  const pos = layout(points)
  const visited = Array<boolean>(n).fill(false)
  const heap: [number, number, number][] = [[0, 0, -1]] // (コスト, 点, どこから)
  const treeEdges: [number, number][] = []
  const frames: Frame<View>[] = []
  let total = 0
  let count = 0

  const sortHeap = () => heap.sort((a, b) => a[0] - b[0] || a[1] - b[1])

  const snap = (
    line: number | number[],
    note: string,
    opts: { cur?: number; from?: number; skip?: boolean; finished?: boolean } = {},
  ) => {
    const nodes: GNode[] = points.map((_, i) => ({
      id: i,
      label: String(i),
      x: pos[i]![0],
      y: pos[i]![1],
      state: i === opts.cur ? (opts.skip ? 'bad' : 'active') : visited[i] ? 'good' : 'idle',
    }))
    const gedges: GEdge[] = []
    for (const [u, v] of treeEdges) {
      gedges.push({ from: u, to: v, label: dist(points[u]!, points[v]!), state: 'good' })
    }
    if (opts.cur !== undefined && opts.from !== undefined && opts.from >= 0 && !opts.skip) {
      gedges.push({
        from: opts.from,
        to: opts.cur,
        label: dist(points[opts.from]!, points[opts.cur]!),
        state: 'active',
      })
    }
    const heapCells: Cell[] = heap
      .slice(0, 10)
      .map(([d, v], i) => ({ value: d, note: `→${v}`, state: i === 0 ? 'active' : 'window' }))
    frames.push({
      line,
      note,
      vars: { 合計: total, 木に入れた点: `${count}/${n}`, heapの大きさ: heap.length },
      view: { nodes, edges: gedges, heap: heapCells, total },
      done: opts.finished,
    })
  }

  snap([5, 6], `点 0 からコスト 0 で始める。heap には「まだ木に入っていない点へ届くコスト」を入れていく`)

  while (count < n) {
    sortHeap()
    const [d, u, from] = heap.shift()!
    if (visited[u]) {
      snap([9, 10, 11], `heap から (コスト ${d}, 点 ${u}) を取り出したが、${u} はもう木の中にある。捨てて次へ`, {
        cur: u,
        skip: true,
      })
      continue
    }
    visited[u] = true
    total += d
    count += 1
    if (from >= 0) treeEdges.push([from, u])
    snap([12, 13, 14], `点 ${u} を木に入れる。コストは ${d}、合計は ${total}`, { cur: u, from })

    for (let v = 0; v < n; v++) {
      if (!visited[v]) heap.push([dist(points[u]!, points[v]!), v, u])
    }
    sortHeap()
    snap([15, 16, 17, 18], `${u} から、まだ木に入っていない点への辺を heap に入れる。次に取り出されるのは一番近い点`, {
      cur: u,
    })
  }
  snap(19, `完了。全点をつなぐ最小の合計コストは ${total}`, { finished: true })
  return frames
}

const PRESETS: { name: string; value: Point[] }[] = [
  { name: 'LC1584の例', value: [[0, 0], [2, 2], [3, 10], [5, 2], [7, 0]] },
  { name: '正方形', value: [[0, 0], [0, 4], [4, 0], [4, 4]] },
  { name: '一直線', value: [[0, 0], [1, 0], [3, 0], [6, 0]] },
]

export default function PrimMst() {
  const [points, setPoints] = useState<Point[]>(PRESETS[0]!.value)
  const frames = useMemo(() => trace(points), [points])

  return (
    <SimShell
      title="Prim 法（木を1点ずつ育てる）"
      subtitle="すでに木に入っている点から一番近い点を、ヒープで取り出して取り込む"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="points" presets={PRESETS} onPick={setPoints} />}
      legend={
        <>
          <LegendItem state="good">木に入った点・辺</LegendItem>
          <LegendItem state="active">いま取り込む点</LegendItem>
          <LegendItem state="bad">すでに木の中なので捨てる</LegendItem>
          <LegendItem state="idle">まだ木の外</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <GraphView nodes={f.view.nodes} edges={f.view.edges} directed={false} width={420} height={210} />
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              heap（先頭が最小。下の注記が行き先の点）
            </p>
            <ArrayView cells={f.view.heap} showIndex={false} size={40} />
          </div>
        </div>
      )}
    </SimShell>
  )
}
