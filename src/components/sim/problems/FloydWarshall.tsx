import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { GridView } from '../views/GridView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `def floyd_warshall(n, edges):
    INF = float('inf')
    dist = [[0 if i == j else INF for j in range(n)] for i in range(n)]
    for u, v, w in edges:
        dist[u][v] = min(dist[u][v], w)
        dist[v][u] = min(dist[v][u], w)      # 無向グラフなら両方向
    for k in range(n):                       # 中継してよい点を1つずつ増やす
        for i in range(n):
            for j in range(n):
                if dist[i][k] + dist[k][j] < dist[i][j]:
                    dist[i][j] = dist[i][k] + dist[k][j]
    return dist`

type Edge = [number, number, number]
type Case = { n: number; edges: Edge[] }

const INF = Infinity
const fmt = (v: number) => (v === INF ? '∞' : String(v))

type View = { grid: Cell[][]; k: number | null; note: string }

function trace({ n, edges }: Case): Frame<View>[] {
  const dist: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 0 : INF)),
  )
  for (const [u, v, w] of edges) {
    dist[u]![v] = Math.min(dist[u]![v]!, w)
    dist[v]![u] = Math.min(dist[v]![u]!, w)
  }
  const frames: Frame<View>[] = []

  const snap = (
    line: number | number[],
    note: string,
    opts: { k?: number; cell?: [number, number]; via?: boolean; finished?: boolean } = {},
  ) => {
    // 先頭に見出しの行と列を足して、i / j が読めるようにする
    const grid: Cell[][] = [
      [{ value: 'i\\j', state: 'dim' }, ...Array.from({ length: n }, (_, j): Cell => ({
        value: j,
        state: j === opts.k ? 'window' : 'dim',
      }))],
      ...dist.map((row, i) => [
        { value: i, state: (i === opts.k ? 'window' : 'dim') as Cell['state'] },
        ...row.map((v, j): Cell => {
          let state: Cell['state'] = v === INF ? 'idle' : 'window'
          if (opts.via && (j === opts.k || i === opts.k)) state = 'active'
          if (opts.cell && opts.cell[0] === i && opts.cell[1] === j) state = 'good'
          return { value: fmt(v), state }
        }),
      ]),
    ]
    frames.push({
      line,
      note,
      vars: { 中継点: opts.k ?? '−', n },
      view: { grid, k: opts.k ?? null, note },
      done: opts.finished,
    })
  }

  snap([3, 4, 5, 6], `まず辺をそのまま表に書く。自分自身は 0、辺が無いところは ∞。dist[i][j] は「i から j への今わかっている最短距離」`)

  for (let k = 0; k < n; k++) {
    snap(7, `中継点として ${k} を使ってよいことにする。すべての (i, j) について「${k} を経由したほうが短いか」を確かめる`, {
      k,
      via: true,
    })
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const through = dist[i]![k]! + dist[k]![j]!
        if (through < dist[i]![j]!) {
          const before = dist[i]![j]!
          dist[i]![j] = through
          snap([10, 11], `dist[${i}][${j}] は ${fmt(before)} だったが、${k} を経由すると ${fmt(dist[i]![k]!)} + ${fmt(dist[k]![j]!)} = ${through}。更新する`, {
            k,
            cell: [i, j],
          })
        }
      }
    }
  }
  snap(12, `完了。すべての組の最短距離が埋まった`, { finished: true })
  return frames
}

const CASES: { name: string; value: Case }[] = [
  { name: '4点', value: { n: 4, edges: [[0, 1, 3], [1, 2, 1], [2, 3, 4], [0, 3, 10]] } },
  { name: '3点', value: { n: 3, edges: [[0, 1, 1], [1, 2, 1]] } },
  { name: '孤立点あり', value: { n: 4, edges: [[0, 1, 2], [1, 2, 2]] } },
]

export default function FloydWarshall() {
  const [c, setC] = useState<Case>(CASES[0]!.value)
  const frames = useMemo(() => trace(c), [c])

  return (
    <SimShell
      title="Floyd-Warshall（全点間の最短距離）"
      subtitle="「中継してよい点」を1つずつ増やしていく DP。3重ループで O(V³)、実装は10行"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="グラフ" presets={CASES} onPick={setC} />}
      legend={
        <>
          <LegendItem state="active">中継点 k の行と列</LegendItem>
          <LegendItem state="good">更新したマス</LegendItem>
          <LegendItem state="window">到達できる</LegendItem>
          <LegendItem state="idle">まだ ∞</LegendItem>
        </>
      }
    >
      {(f) => <GridView grid={f.view.grid} cellSize={40} />}
    </SimShell>
  )
}
