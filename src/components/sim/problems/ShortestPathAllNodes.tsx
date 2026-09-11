import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { GraphView, type GEdge, type GNode } from '../views/GraphView'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `from collections import deque

def shortest_path_length(graph):
    n = len(graph)
    full = (1 << n) - 1
    q = deque((i, 1 << i, 0) for i in range(n))   # どこから出発してもよい
    seen = {(i, 1 << i) for i in range(n)}
    while q:
        u, mask, d = q.popleft()
        if mask == full:
            return d                              # 全部訪問できた
        for v in graph[u]:
            nmask = mask | (1 << v)
            if (v, nmask) not in seen:            # 状態は (いる場所, 訪問済み集合)
                seen.add((v, nmask))
                q.append((v, nmask, d + 1))
    return 0`

type Case = { graph: number[][]; pos: [number, number][] }
type View = { nodes: GNode[]; edges: GEdge[]; mask: Cell[]; queue: number; seen: number }

function trace({ graph, pos }: Case): Frame<View>[] {
  const n = graph.length
  const full = (1 << n) - 1
  const queue: [number, number, number][] = []
  const seen = new Set<string>()
  for (let i = 0; i < n; i++) {
    queue.push([i, 1 << i, 0])
    seen.add(`${i},${1 << i}`)
  }
  const frames: Frame<View>[] = []

  const edgeList: [number, number][] = []
  for (let u = 0; u < n; u++) for (const v of graph[u]!) if (u < v) edgeList.push([u, v])

  const snap = (
    line: number | number[],
    note: string,
    opts: { u?: number; mask?: number; d?: number; hit?: boolean; finished?: boolean } = {},
  ) => {
    const mask = opts.mask ?? 0
    const nodes: GNode[] = Array.from({ length: n }, (_, i) => ({
      id: i,
      label: String(i),
      x: pos[i]![0],
      y: pos[i]![1],
      state: i === opts.u ? (opts.hit ? 'good' : 'active') : (mask >> i) & 1 ? 'window' : 'idle',
    }))
    const edges: GEdge[] = edgeList.map(([u, v]) => ({ from: u, to: v, state: 'idle' }))
    const maskCells: Cell[] = Array.from({ length: n }, (_, i) => ({
      value: (mask >> i) & 1,
      note: `点${i}`,
      state: (mask >> i) & 1 ? 'good' : 'idle',
    }))
    frames.push({
      line,
      note,
      vars: {
        いる場所: opts.u ?? '−',
        訪問集合: mask.toString(2).padStart(n, '0'),
        歩数: opts.d ?? '−',
        状態数: seen.size,
      },
      view: { nodes, edges, mask: maskCells, queue: queue.length, seen: seen.size },
      done: opts.finished,
    })
  }

  snap([6, 7], `全部の点を出発点としてキューに入れる。状態は「いまいる点」と「訪問済みの集合（ビット列）」の組。同じ点でも、訪問済み集合が違えば別の状態として扱う`, {
    d: 0,
  })

  let guard = 0
  while (queue.length > 0 && guard++ < 400) {
    const [u, mask, d] = queue.shift()!
    if (mask === full) {
      snap([10, 11], `訪問集合が ${mask.toString(2)}（全ビットが1）になった。BFS なので、これが最短の歩数 ${d}`, {
        u,
        mask,
        d,
        hit: true,
        finished: true,
      })
      return frames
    }
    snap(9, `点 ${u} にいて、訪問済みは ${mask.toString(2).padStart(n, '0')}、ここまで ${d} 歩。この状態から隣へ進む`, {
      u,
      mask,
      d,
    })
    for (const v of graph[u]!) {
      const nmask = mask | (1 << v)
      const key = `${v},${nmask}`
      if (!seen.has(key)) {
        seen.add(key)
        queue.push([v, nmask, d + 1])
      }
    }
  }
  snap(17, `キューが空になった`, { finished: true })
  return frames
}

const CASES: { name: string; value: Case }[] = [
  {
    name: '星型（LC847の例）',
    value: {
      graph: [[1, 2, 3], [0], [0], [0]],
      pos: [[230, 125], [90, 60], [370, 60], [230, 215]],
    },
  },
  {
    name: '一直線',
    value: {
      graph: [[1], [0, 2], [1]],
      pos: [[80, 125], [230, 125], [380, 125]],
    },
  },
  {
    name: '輪',
    value: {
      graph: [[1, 3], [0, 2], [1, 3], [0, 2]],
      pos: [[150, 60], [310, 60], [310, 190], [150, 190]],
    },
  },
]

export default function ShortestPathAllNodes() {
  const [c, setC] = useState<Case>(CASES[0]!.value)
  const frames = useMemo(() => trace(c), [c])

  return (
    <SimShell
      title="Shortest Path Visiting All Nodes（訪問済み集合を整数で持つ BFS）"
      subtitle="状態を「いる点 × 訪問済み集合」に広げる。集合は n ビットの整数1つで表せる"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="グラフ" presets={CASES} onPick={setC} />}
      legend={
        <>
          <LegendItem state="active">いまいる点</LegendItem>
          <LegendItem state="window">訪問済みの点</LegendItem>
          <LegendItem state="good">全点訪問を達成</LegendItem>
          <LegendItem state="idle">まだ訪問していない</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <GraphView nodes={f.view.nodes} edges={f.view.edges} directed={false} width={460} height={250} />
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              mask（ビットが1なら訪問済み。左端が点0）
            </p>
            <ArrayView cells={f.view.mask} showIndex={false} size={44} />
          </div>
          <p className="m-0 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            キューの長さ = {f.view.queue} / 到達した状態 = {f.view.seen}
          </p>
        </div>
      )}
    </SimShell>
  )
}
