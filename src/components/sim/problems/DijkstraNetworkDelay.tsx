import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { GraphView, type GEdge, type GNode } from '../views/GraphView'
import { LegendItem } from '../views/Legend'
import type { Frame } from '../core/types'

const CODE = `import heapq

def network_delay_time(times, n, k):
    graph = [[] for _ in range(n + 1)]
    for u, v, w in times:
        graph[u].append((v, w))
    dist = [float("inf")] * (n + 1)
    dist[k] = 0
    heap = [(0, k)]                    # (距離, ノード)
    while heap:
        d, u = heapq.heappop(heap)      # 未確定の中で最も近いものを取り出す
        if d > dist[u]:
            continue                     # 既にもっと良い記録がある。古い情報は無視
        for v, w in graph[u]:
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd             # 緩和：もっと近い道が見つかった
                heapq.heappush(heap, (nd, v))
    m = max(dist[1:])
    return m if m < float("inf") else -1`

type Case = { n: number; k: number; edges: [number, number, number][]; pos: [number, number][] }

const CASES: { name: string; value: Case }[] = [
  {
    name: '[2,1,1],[2,3,1],[3,4,1] k=2',
    value: {
      n: 4,
      k: 2,
      edges: [
        [2, 1, 1],
        [2, 3, 1],
        [3, 4, 1],
      ],
      pos: [
        [70, 130],
        [200, 60],
        [200, 200],
        [340, 130],
      ],
    },
  },
  {
    name: '遠回りが最短になる',
    value: {
      n: 4,
      k: 1,
      edges: [
        [1, 2, 4],
        [1, 3, 1],
        [3, 2, 1],
        [2, 4, 1],
      ],
      pos: [
        [60, 130],
        [340, 60],
        [200, 200],
        [340, 200],
      ],
    },
  },
  {
    name: '到達できないノードあり',
    value: {
      n: 3,
      k: 1,
      edges: [[1, 2, 3]],
      pos: [
        [70, 130],
        [220, 130],
        [370, 130],
      ],
    },
  },
]

type View = { nodes: GNode[]; edges: GEdge[]; heap: string[] }

function trace(c: Case): Frame<View>[] {
  const { n, k, edges, pos } = c
  const graph: [number, number][][] = Array.from({ length: n + 1 }, () => [])
  for (const [u, v, w] of edges) graph[u]!.push([v, w])
  const dist = Array<number>(n + 1).fill(Infinity)
  dist[k] = 0
  const heap: [number, number][] = [[0, k]]
  const frames: Frame<View>[] = []
  const decided = new Set<number>()

  const snap = (
    line: number | number[],
    note: string,
    opts: { cur?: number; activeEdge?: [number, number]; finished?: boolean } = {},
  ) => {
    const nodes: GNode[] = Array.from({ length: n }, (_, i) => {
      const id = i + 1
      return {
        id,
        label: String(id),
        x: pos[i]![0],
        y: pos[i]![1],
        badge: dist[id] === Infinity ? '∞' : dist[id],
        state: opts.cur === id ? 'active' : decided.has(id) ? 'good' : 'idle',
      }
    })
    const gedges: GEdge[] = edges.map(([a, b, w]) => ({
      from: a,
      to: b,
      label: w,
      state: opts.activeEdge && opts.activeEdge[0] === a && opts.activeEdge[1] === b ? 'active' : decided.has(a) ? 'dim' : 'idle',
    }))
    frames.push({
      line,
      note,
      vars: { k },
      view: {
        nodes,
        edges: gedges,
        heap: [...heap].sort((a, b) => a[0] - b[0]).map(([d, node]) => `(${d},${node})`),
      },
      done: opts.finished,
    })
  }

  snap([7, 8], `始点 k=${k} の距離を 0 にして、heap に (0, ${k}) を入れる`)

  let guard = 0
  while (heap.length && guard++ < 100) {
    heap.sort((a, b) => a[0] - b[0])
    const [d, u] = heap.shift()!
    snap([10], `heap から最小の (${d}, ${u}) を取り出す`, { cur: u })
    if (d > dist[u]!) {
      snap([11, 12], `もっと良い記録が既にある（${dist[u]}）。この古い記録は無視`, { cur: u })
      continue
    }
    decided.add(u)
    snap([10], `ノード ${u} の最短距離 ${d} が確定`, { cur: u })
    for (const [v, w] of graph[u]!) {
      const nd = d + w
      snap([13, 14], `${u} → ${v}（重み${w}）を試す。${d} + ${w} = ${nd}`, { cur: u, activeEdge: [u, v] })
      if (nd < dist[v]!) {
        const prev = dist[v] === Infinity ? '∞' : dist[v]
        dist[v] = nd
        heap.push([nd, v])
        snap([15, 16], `${nd} < ${prev}（今までの記録）。dist[${v}] を更新して heap に積む`, { cur: u, activeEdge: [u, v] })
      } else {
        snap([15], `${nd} >= ${dist[v]}。今までの記録のほうが良いので更新しない`, { cur: u, activeEdge: [u, v] })
      }
    }
  }
  const reachable = dist.slice(1).filter((d) => d < Infinity)
  const m = Math.max(...dist.slice(1))
  snap(
    17,
    m < Infinity
      ? `全ノードに到達できた。一番時間がかかったのは ${m}。これが答え`
      : `到達できないノードがある（${reachable.length}/${n} 個のみ到達）。-1 を返す`,
    { finished: true },
  )
  return frames
}

export default function DijkstraNetworkDelay() {
  const [c, setC] = useState<Case>(CASES[0]!.value)
  const frames = useMemo(() => trace(c), [c])

  return (
    <SimShell
      title="Network Delay Time（ダイクストラ法）"
      subtitle="ヒープから「まだ確定していない中で一番近いもの」を取り出し、確定させながら広げていく"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="グラフ" presets={CASES} onPick={setC} />}
      legend={
        <>
          <LegendItem state="active">今確定させたノード</LegendItem>
          <LegendItem state="good">確定済み</LegendItem>
          <LegendItem state="idle">未確定（バッジが現在の最短距離）</LegendItem>
        </>
      }
    >
      {(f) => (
        <div>
          <GraphView nodes={f.view.nodes} edges={f.view.edges} width={420} height={250} />
          <div className="mt-2 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            heap（距離順）: [{f.view.heap.join(', ')}]
          </div>
        </div>
      )}
    </SimShell>
  )
}
