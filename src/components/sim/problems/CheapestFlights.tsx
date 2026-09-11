import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { GraphView, type GEdge, type GNode } from '../views/GraphView'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `def find_cheapest_price(n, flights, src, dst, k):
    INF = float('inf')
    dist = [INF] * n
    dist[src] = 0
    for _ in range(k + 1):            # 経由地 k 個 = 辺 k+1 本まで
        nxt = dist[:]                 # 1ラウンド前の値だけを使う
        for u, v, w in flights:
            if dist[u] + w < nxt[v]:
                nxt[v] = dist[u] + w
        dist = nxt
    return -1 if dist[dst] == INF else dist[dst]`

type Flight = [number, number, number]
type Case = {
  n: number
  flights: Flight[]
  pos: [number, number][]
  src: number
  dst: number
  k: number
}

const INF = Infinity
const fmt = (v: number) => (v === INF ? '∞' : String(v))

type View = { nodes: GNode[]; edges: GEdge[]; dist: Cell[]; round: string }

function trace(c: Case): Frame<View>[] {
  const { n, flights, pos, src, dst, k } = c
  let dist = Array<number>(n).fill(INF)
  dist[src] = 0
  const frames: Frame<View>[] = []

  const snap = (
    line: number | number[],
    note: string,
    opts: {
      shown?: number[]
      edge?: [number, number]
      updated?: number
      round?: number
      finished?: boolean
    } = {},
  ) => {
    const shown = opts.shown ?? dist
    const nodes: GNode[] = Array.from({ length: n }, (_, i) => ({
      id: i,
      label: String(i),
      x: pos[i]![0],
      y: pos[i]![1],
      badge: fmt(shown[i]!),
      state:
        i === opts.updated
          ? 'good'
          : i === src
            ? 'window'
            : i === dst
              ? 'active'
              : shown[i] === INF
                ? 'idle'
                : 'window',
    }))
    const gedges: GEdge[] = flights.map(([u, v, w]) => ({
      from: u,
      to: v,
      label: w,
      state: opts.edge && opts.edge[0] === u && opts.edge[1] === v ? 'active' : 'idle',
    }))
    const cells: Cell[] = shown.map((v, i) => ({
      value: fmt(v),
      state: i === opts.updated ? 'good' : i === dst ? 'active' : v === INF ? 'idle' : 'window',
    }))
    frames.push({
      line,
      note,
      vars: {
        ラウンド: opts.round !== undefined ? `${opts.round}/${k + 1}` : '−',
        src,
        dst,
        k,
      },
      view: { nodes, edges: gedges, dist: cells, round: opts.round !== undefined ? `${opts.round} 本目まで` : '準備' },
      done: opts.finished,
    })
  }

  snap([3, 4], `出発地 ${src} だけ 0、他は ∞ から始める。経由地は ${k} 個までなので、使える辺は ${k + 1} 本まで`)

  for (let round = 1; round <= k + 1; round++) {
    const nxt = [...dist]
    snap(6, `${round} 本目の辺を使うラウンド。更新先は nxt に書き、参照するのは「1ラウンド前の dist」だけにする`, {
      shown: dist,
      round,
    })
    for (const [u, v, w] of flights) {
      if (dist[u]! + w < nxt[v]!) {
        nxt[v] = dist[u]! + w
        snap([8, 9], `辺 ${u} → ${v}（運賃 ${w}）。${u} までが ${fmt(dist[u]!)} なので ${v} は ${fmt(nxt[v]!)} に更新`, {
          shown: nxt,
          edge: [u, v],
          updated: v,
          round,
        })
      }
    }
    dist = nxt
    snap(10, `${round} ラウンド終了。dist = [${dist.map(fmt).join(', ')}]`, { shown: dist, round })
  }
  snap(11, dist[dst] === INF
    ? `${dst} には ${k} 回以内の乗り継ぎで到達できない。−1 を返す`
    : `${src} から ${dst} まで、経由地 ${k} 個以内で最安 ${dist[dst]}`, { finished: true })
  return frames
}

const CASES: { name: string; value: Case }[] = [
  {
    name: 'LC787の例（k=1）',
    value: {
      n: 4,
      flights: [[0, 1, 100], [1, 2, 100], [2, 0, 100], [1, 3, 600], [2, 3, 200]],
      pos: [[70, 70], [230, 70], [230, 190], [390, 130]],
      src: 0,
      dst: 3,
      k: 1,
    },
  },
  {
    name: '乗り継ぎ可（k=1）',
    value: {
      n: 3,
      flights: [[0, 1, 100], [1, 2, 100], [0, 2, 500]],
      pos: [[70, 130], [230, 60], [390, 130]],
      src: 0,
      dst: 2,
      k: 1,
    },
  },
  {
    name: '直行のみ（k=0）',
    value: {
      n: 3,
      flights: [[0, 1, 100], [1, 2, 100], [0, 2, 500]],
      pos: [[70, 130], [230, 60], [390, 130]],
      src: 0,
      dst: 2,
      k: 0,
    },
  },
]

export default function CheapestFlights() {
  const [c, setC] = useState<Case>(CASES[0]!.value)
  const frames = useMemo(() => trace(c), [c])

  return (
    <SimShell
      title="Cheapest Flights Within K Stops（Bellman-Ford）"
      subtitle="辺を何本使ったかでラウンドを区切る。1ラウンド前の値だけを見るので、同じラウンド内で連鎖しない"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="入力" presets={CASES} onPick={setC} />}
      legend={
        <>
          <LegendItem state="good">このラウンドで更新した</LegendItem>
          <LegendItem state="window">到達済み</LegendItem>
          <LegendItem state="active">目的地</LegendItem>
          <LegendItem state="idle">まだ ∞</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <GraphView nodes={f.view.nodes} edges={f.view.edges} width={460} height={250} />
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              dist（{f.view.round}）
            </p>
            <ArrayView cells={f.view.dist} size={44} />
          </div>
        </div>
      )}
    </SimShell>
  )
}
