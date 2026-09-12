import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { GraphView, type GEdge, type GNode } from '../views/GraphView'
import { LegendItem } from '../views/Legend'
import type { Frame } from '../core/types'

const CODE = `def pagerank(graph, n, d=0.85, iters=20):
    rank = [1 / n] * n                      # 最初は全員同じ値
    out = [len(graph[i]) for i in range(n)]
    for _ in range(iters):
        nxt = [(1 - d) / n] * n             # どこからでも飛んでくる分
        for u in range(n):
            if out[u] == 0:
                continue
            share = d * rank[u] / out[u]    # 自分の値を出リンクに等分する
            for v in graph[u]:
                nxt[v] += share
        rank = nxt
    return rank`

type Case = { graph: number[][]; pos: [number, number][]; label: string }
type View = { nodes: GNode[]; edges: GEdge[]; rank: number[]; iter: number; ranking: string }

const D = 0.85

function trace(c: Case): Frame<View>[] {
  const { graph, pos } = c
  const n = graph.length
  const out = graph.map((g) => g.length)
  let rank = Array<number>(n).fill(1 / n)
  const frames: Frame<View>[] = []

  const snap = (
    line: number | number[],
    note: string,
    opts: { iter: number; from?: number; shown?: number[]; finished?: boolean },
  ) => {
    const shown = opts.shown ?? rank
    const max = Math.max(...shown)
    const nodes: GNode[] = graph.map((_, i) => ({
      id: i,
      label: String(i),
      x: pos[i]![0],
      y: pos[i]![1],
      badge: shown[i]!.toFixed(2),
      state: i === opts.from ? 'active' : shown[i] === max ? 'good' : 'idle',
    }))
    const edges: GEdge[] = []
    graph.forEach((tos, u) => {
      for (const v of tos) edges.push({ from: u, to: v, state: u === opts.from ? 'active' : 'idle' })
    })
    const ranking = shown
      .map((v, i) => ({ i, v }))
      .sort((a, b) => b.v - a.v)
      .map((r) => `${r.i}(${r.v.toFixed(3)})`)
      .join(' > ')
    frames.push({
      line,
      note,
      vars: { 反復: opts.iter, d: D, 合計: shown.reduce((s, v) => s + v, 0).toFixed(3) },
      view: { nodes, edges, rank: [...shown], iter: opts.iter, ranking },
      done: opts.finished,
    })
  }

  snap([2, 3], `最初は全員に同じ値 ${(1 / n).toFixed(2)} を配る。各ノードは自分の値を、出ていくリンクに等分して渡す`, {
    iter: 0,
  })

  for (let it = 1; it <= 12; it++) {
    const nxt = Array<number>(n).fill((1 - D) / n)
    for (let u = 0; u < n; u++) {
      if (out[u] === 0) continue
      const share = (D * rank[u]!) / out[u]!
      for (const v of graph[u]!) nxt[v]! += share
      if (it === 1) {
        snap([9, 10, 11], `ノード ${u} は自分の値 ${rank[u]!.toFixed(3)} の ${D} 倍を、${out[u]} 本の出リンクに等分して渡す（1本あたり ${share.toFixed(3)}）`, {
          iter: it,
          from: u,
          shown: nxt,
        })
      }
    }
    rank = nxt
    snap(12, `${it} 回目の反復が終わった。値は ${rank.map((r) => r.toFixed(3)).join(', ')}`, { iter: it })
  }

  snap(13, `値がほとんど動かなくなった（定常分布）。順位は ${rank
    .map((v, i) => ({ i, v }))
    .sort((a, b) => b.v - a.v)
    .map((r) => `${r.i}`)
    .join(' > ')}`, { iter: 12, finished: true })
  return frames
}

const CASES: { name: string; value: Case }[] = [
  {
    name: '1点に集まる',
    value: {
      label: '',
      graph: [[1, 2], [2], [0], [2]],
      pos: [[80, 70], [240, 70], [240, 190], [400, 130]],
    },
  },
  {
    name: '相互リンク',
    value: {
      label: '',
      graph: [[1], [0], [0, 1], [1]],
      pos: [[100, 130], [260, 70], [260, 190], [410, 130]],
    },
  },
  {
    name: '一方通行の鎖',
    value: {
      label: '',
      graph: [[1], [2], [3], []],
      pos: [[70, 130], [190, 130], [310, 130], [420, 130]],
    },
  },
]

export default function PageRank() {
  const [c, setC] = useState<Case>(CASES[0]!.value)
  const frames = useMemo(() => trace(c), [c])

  return (
    <SimShell
      title="PageRank（リンクで重要度を配り合う）"
      subtitle="自分の値を出リンクに等分して渡す。それを繰り返すと、値は動かなくなる"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="グラフ" presets={CASES} onPick={setC} />}
      legend={
        <>
          <LegendItem state="active">いま値を配っているノード</LegendItem>
          <LegendItem state="good">現時点で最も値が大きい</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-2">
          <GraphView nodes={f.view.nodes} edges={f.view.edges} width={470} height={250} />
          <p className="m-0 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            順位: <span style={{ color: 'var(--ok)' }}>{f.view.ranking}</span>
          </p>
        </div>
      )}
    </SimShell>
  )
}
