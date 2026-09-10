import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { GraphView, type GEdge, type GNode } from '../views/GraphView'
import { LegendItem } from '../views/Legend'
import type { Frame } from '../core/types'

const CODE = `from collections import deque

def can_finish(n, prerequisites):
    graph = [[] for _ in range(n)]
    indeg = [0] * n
    for a, b in prerequisites:        # a を終えないと b を取れない
        graph[a].append(b)
        indeg[b] += 1
    q = deque(i for i in range(n) if indeg[i] == 0)
    order = []
    while q:
        u = q.popleft()               # 依存先が無くなったものから確定
        order.append(u)
        for v in graph[u]:
            indeg[v] -= 1             # u を消したので依存が1つ減る
            if indeg[v] == 0:
                q.append(v)
    return len(order) == n            # 全部並べられたら閉路なし`

type Case = { n: number; edges: [number, number][]; pos: [number, number][]; label: string }

const CASES: { name: string; value: Case }[] = [
  {
    name: '受講可能',
    value: {
      label: '閉路なし',
      n: 6,
      edges: [
        [0, 1],
        [0, 3],
        [1, 3],
        [1, 4],
        [2, 1],
        [2, 5],
        [4, 3],
        [5, 4],
      ],
      pos: [
        [70, 60],
        [200, 60],
        [70, 190],
        [340, 60],
        [200, 190],
        [340, 190],
      ],
    },
  },
  {
    name: '閉路あり',
    value: {
      label: '閉路あり',
      n: 4,
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 1],
      ],
      pos: [
        [70, 130],
        [190, 130],
        [310, 70],
        [310, 190],
      ],
    },
  },
  {
    name: '一直線',
    value: {
      label: '鎖',
      n: 4,
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
      pos: [
        [60, 130],
        [170, 130],
        [280, 130],
        [390, 130],
      ],
    },
  },
]

type View = { nodes: GNode[]; edges: GEdge[]; queue: number[]; order: number[] }

function trace(c: Case): Frame<View>[] {
  const { n, edges, pos } = c
  const graph: number[][] = Array.from({ length: n }, () => [])
  const indeg = Array<number>(n).fill(0)
  for (const [a, b] of edges) {
    graph[a]!.push(b)
    indeg[b]! += 1
  }
  const frames: Frame<View>[] = []
  const order: number[] = []
  const queue: number[] = []
  const removed = new Set<number>()

  const snap = (
    line: number | number[],
    note: string,
    opts: { cur?: number; edge?: [number, number]; finished?: boolean } = {},
  ) => {
    const nodes: GNode[] = Array.from({ length: n }, (_, i) => ({
      id: i,
      label: String(i),
      x: pos[i]![0],
      y: pos[i]![1],
      badge: removed.has(i) ? undefined : indeg[i]!,
      state:
        opts.cur === i
          ? 'active'
          : removed.has(i)
            ? 'good'
            : queue.includes(i)
              ? 'window'
              : 'idle',
    }))
    const gedges: GEdge[] = edges.map(([a, b]) => ({
      from: a,
      to: b,
      state:
        opts.edge && opts.edge[0] === a && opts.edge[1] === b
          ? 'active'
          : removed.has(a)
            ? 'dim'
            : 'idle',
    }))
    frames.push({
      line,
      note,
      vars: { n, 確定数: order.length, queue: `[${queue.join(',')}]` },
      view: { nodes, edges: gedges, queue: [...queue], order: [...order] },
      done: opts.finished,
    })
  }

  snap([4, 5], 'グラフと入次数 indeg を作る。バッジの数字が「まだ残っている前提科目の数」')
  for (const [a, b] of edges) {
    snap([6, 7, 8], `辺 ${a} → ${b}。${b} の入次数を +1`, { edge: [a, b] })
  }
  for (let i = 0; i < n; i++) if (indeg[i] === 0) queue.push(i)
  snap(9, `入次数 0 のノード [${queue.join(', ')}] が出発点。前提が無いので今すぐ取れる`)

  let guard = 0
  while (queue.length && guard++ < 200) {
    const u = queue.shift()!
    order.push(u)
    removed.add(u)
    snap([11, 12, 13], `${u} を取り出して確定。order = [${order.join(', ')}]`, { cur: u })
    for (const v of graph[u]!) {
      indeg[v]! -= 1
      snap([14, 15], `${u} を消したので ${v} の入次数を ${indeg[v]! + 1} → ${indeg[v]} に減らす`, {
        cur: u,
        edge: [u, v],
      })
      if (indeg[v] === 0) {
        queue.push(v)
        snap([16, 17], `${v} の入次数が 0 になった。キューへ追加`, { cur: u, edge: [u, v] })
      }
    }
  }
  const ok = order.length === n
  snap(
    18,
    ok
      ? `全 ${n} 件を並べられた。閉路なし → 受講可能。順序: ${order.join(' → ')}`
      : `確定できたのは ${order.length}/${n} 件だけ。入次数が 0 にならないノードが残った = 閉路がある → 受講不可能`,
    { finished: true },
  )
  return frames
}

export default function CourseSchedule() {
  const [c, setC] = useState<Case>(CASES[0]!.value)
  const frames = useMemo(() => trace(c), [c])

  return (
    <SimShell
      title="Course Schedule（トポロジカルソート / Kahn のアルゴリズム）"
      subtitle="入次数 0 のノードから取り除いていく。最後まで全部取り除けなければ閉路がある"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="グラフ" presets={CASES} onPick={setC} />}
      legend={
        <>
          <LegendItem state="idle">未確定</LegendItem>
          <LegendItem state="window">キューの中（入次数0）</LegendItem>
          <LegendItem state="active">処理中</LegendItem>
          <LegendItem state="good">確定済み</LegendItem>
        </>
      }
    >
      {(f) => (
        <div>
          <GraphView nodes={f.view.nodes} edges={f.view.edges} width={460} height={250} />
          <div className="font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            queue = [{f.view.queue.join(', ')}] / order = [{f.view.order.join(', ')}]
          </div>
        </div>
      )}
    </SimShell>
  )
}
