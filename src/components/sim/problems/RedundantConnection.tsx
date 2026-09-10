import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { GraphView, type GEdge, type GNode } from '../views/GraphView'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `def find_redundant_connection(edges):
    n = len(edges)
    root = list(range(n + 1))

    def find(x):
        while root[x] != x:
            root[x] = root[root[x]]   # 経路圧縮（簡易版）
            x = root[x]
        return x

    for a, b in edges:
        ra, rb = find(a), find(b)
        if ra == rb:
            return [a, b]              # すでに繋がっていた辺が冗長
        root[ra] = rb
    return []`

type Case = { n: number; edges: [number, number][]; pos: [number, number][] }

const CASES: { name: string; value: Case }[] = [
  {
    name: '木 + 1本余分',
    value: {
      n: 5,
      edges: [
        [1, 2],
        [1, 3],
        [2, 4],
        [4, 5],
        [3, 5],
      ],
      pos: [
        [70, 60],
        [200, 60],
        [70, 200],
        [200, 200],
        [340, 130],
      ],
    },
  },
  {
    name: '一直線 + 輪っか',
    value: {
      n: 4,
      edges: [
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 1],
      ],
      pos: [
        [70, 70],
        [280, 70],
        [280, 220],
        [70, 220],
      ],
    },
  },
]

type View = { nodes: GNode[]; edges: GEdge[]; roots: Cell[] }

function trace(c: Case): Frame<View>[] {
  const { n, edges, pos } = c
  const root = Array.from({ length: n + 1 }, (_, i) => i)
  const frames: Frame<View>[] = []
  const doneEdges: [number, number][] = []
  let answer: [number, number] | null = null

  const find = (x: number): number => {
    while (root[x] !== x) {
      root[x] = root[root[x]!]!
      x = root[x]!
    }
    return x
  }

  const snap = (
    line: number | number[],
    note: string,
    opts: { activeEdge?: [number, number]; finished?: boolean } = {},
  ) => {
    const nodes: GNode[] = Array.from({ length: n }, (_, i) => {
      const id = i + 1
      return { id, label: String(id), x: pos[i]![0], y: pos[i]![1], badge: undefined, state: 'idle' }
    })
    const gedges: GEdge[] = edges.map(([a, b]) => {
      const isAnswer = answer && answer[0] === a && answer[1] === b
      const isDone = doneEdges.some(([x, y]) => x === a && y === b)
      const isActive = opts.activeEdge && opts.activeEdge[0] === a && opts.activeEdge[1] === b
      return {
        from: a,
        to: b,
        state: isAnswer ? 'bad' : isActive ? 'active' : isDone ? 'good' : 'idle',
      }
    })
    const roots: Cell[] = root.slice(1).map((r, i) => ({ value: r, note: `[${i + 1}]` }))
    frames.push({ line, note, vars: {}, view: { nodes, edges: gedges, roots }, done: opts.finished })
  }

  snap([2, 3], `n=${n} 個のノード。root[i] = i で、はじめは全員が「自分自身を親とする」バラバラの状態`)

  for (const [a, b] of edges) {
    const ra = find(a)
    const rb = find(b)
    snap([10], `辺 (${a}, ${b}) を見る。${a} の属するグループの代表は ${ra}、${b} の代表は ${rb}`, {
      activeEdge: [a, b],
    })
    if (ra === rb) {
      answer = [a, b]
      snap([11, 12], `代表が同じ（${ra}）ということは、すでに ${a} と ${b} は繋がっている。この辺 (${a}, ${b}) が余分`, {
        activeEdge: [a, b],
        finished: true,
      })
      return frames
    }
    root[ra] = rb
    doneEdges.push([a, b])
    snap([13], `代表が違うので、まだ繋がっていなかった。root[${ra}] = ${rb} として、2つのグループを繋げる`, {
      activeEdge: [a, b],
    })
  }
  snap(14, '全ての辺を見終えたが、余分な辺は見つからなかった', { finished: true })
  return frames
}

export default function RedundantConnection() {
  const [c, setC] = useState<Case>(CASES[0]!.value)
  const frames = useMemo(() => trace(c), [c])

  return (
    <SimShell
      title="Redundant Connection（Union-Find で閉路を検出）"
      subtitle="辺を1本ずつ繋げていき、両端がすでに同じグループなら、その辺が輪っかを作る余分な1本"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="グラフ" presets={CASES} onPick={setC} />}
      legend={
        <>
          <LegendItem state="active">今見ている辺</LegendItem>
          <LegendItem state="good">繋げた辺</LegendItem>
          <LegendItem state="bad">余分な辺（答え）</LegendItem>
        </>
      }
    >
      {(f) => (
        <div>
          <GraphView nodes={f.view.nodes} edges={f.view.edges} directed={false} width={420} height={260} />
          <div className="mt-2">
            <p className="mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              root（各ノードの代表）
            </p>
            <ArrayView cells={f.view.roots} showIndex={false} size={34} />
          </div>
        </div>
      )}
    </SimShell>
  )
}
