import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { GraphView, type GEdge, type GNode } from '../views/GraphView'
import { LegendItem } from '../views/Legend'
import type { Frame } from '../core/types'

const CODE = `import heapq, math

def top_k_similar(query, docs, k):
    heap = []                                  # (類似度, id) の最小ヒープ
    for i, v in enumerate(docs):
        dot = sum(a * b for a, b in zip(query, v))
        norm = math.sqrt(sum(a * a for a in query)) * math.sqrt(sum(b * b for b in v))
        cos = dot / norm                       # 長さで割るので、向きだけが効く
        if len(heap) < k:
            heapq.heappush(heap, (cos, i))
        elif cos > heap[0][0]:
            heapq.heapreplace(heap, (cos, i))  # いまの最下位を追い出す
    return sorted(heap, reverse=True)`

type Vec = [number, number]
type Input = { query: Vec; docs: { name: string; v: Vec }[]; k: number }
type View = { nodes: GNode[]; edges: GEdge[]; rows: { name: string; cos: number; inHeap: boolean }[]; heap: string }

const SIZE = 10
function toCanvas([x, y]: Vec): [number, number] {
  const pad = 30
  const w = 300
  const h = 240
  return [pad + (x / SIZE) * (w - pad * 2), h - pad - (y / SIZE) * (h - pad * 2)]
}

const cosine = (a: Vec, b: Vec) =>
  (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(a[0], a[1]) * Math.hypot(b[0], b[1]))

function trace({ query, docs, k }: Input): Frame<View>[] {
  const frames: Frame<View>[] = []
  const heap: { cos: number; i: number }[] = [] // 小さい順に保つ

  const snap = (
    line: number | number[],
    note: string,
    opts: { cur?: number; kicked?: number; finished?: boolean } = {},
  ) => {
    const inHeap = new Set(heap.map((h) => h.i))
    const nodes: GNode[] = [
      { id: -1, label: 'O', x: toCanvas([0, 0])[0], y: toCanvas([0, 0])[1], state: 'dim' },
      {
        id: 999,
        label: 'Q',
        x: toCanvas(query)[0],
        y: toCanvas(query)[1],
        state: 'window',
      },
      ...docs.map((d, i) => {
        const [x, y] = toCanvas(d.v)
        return {
          id: i,
          label: d.name,
          x,
          y,
          state: (i === opts.cur
            ? 'active'
            : i === opts.kicked
              ? 'bad'
              : inHeap.has(i)
                ? 'good'
                : 'idle') as GNode['state'],
        }
      }),
    ]
    const edges: GEdge[] = [
      { from: -1, to: 999, state: 'active' },
      ...docs.map((_, i) => ({
        from: -1,
        to: i,
        state: (inHeap.has(i) ? 'good' : i === opts.cur ? 'active' : 'dim') as GEdge['state'],
      })),
    ]
    const rows = docs.map((d, i) => ({
      name: d.name,
      cos: cosine(query, d.v),
      inHeap: inHeap.has(i),
    }))
    frames.push({
      line,
      note,
      vars: {
        k,
        ヒープの大きさ: heap.length,
        最下位: heap.length ? heap[0]!.cos.toFixed(3) : '−',
      },
      view: {
        nodes,
        edges,
        rows,
        heap: heap
          .map((h) => `${docs[h.i]!.name}(${h.cos.toFixed(3)})`)
          .join(', '),
      },
      done: opts.finished,
    })
  }

  snap(4, `検索したいベクトル Q と、候補のベクトルたち。長さではなく「向きがどれだけ近いか」で比べたいので、内積を長さで割る（コサイン類似度）`)

  for (let i = 0; i < docs.length; i++) {
    const cos = cosine(query, docs[i]!.v)
    snap([6, 7, 8], `${docs[i]!.name} との内積を、両方の長さで割ると ${cos.toFixed(3)}。1 に近いほど同じ向き`, {
      cur: i,
    })
    if (heap.length < k) {
      heap.push({ cos, i })
      heap.sort((a, b) => a.cos - b.cos)
      snap([9, 10], `まだ ${k} 件に満たないので、そのまま採用`, { cur: i })
    } else if (cos > heap[0]!.cos) {
      const kicked = heap[0]!.i
      heap[0] = { cos, i }
      heap.sort((a, b) => a.cos - b.cos)
      snap([11, 12], `いまの最下位 ${docs[kicked]!.name}（${cosine(query, docs[kicked]!.v).toFixed(3)}）より近い。入れ替える`, {
        cur: i,
        kicked,
      })
    } else {
      snap(11, `いまの最下位 ${heap[0]!.cos.toFixed(3)} に届かないので、採用しない`, { cur: i })
    }
  }

  const best = [...heap].sort((a, b) => b.cos - a.cos)
  snap(13, `完了。上位 ${k} 件は ${best.map((h) => `${docs[h.i]!.name}(${h.cos.toFixed(3)})`).join(' > ')}。全件を並べ替えず、大きさ ${k} のヒープだけで済んでいる`, {
    finished: true,
  })
  return frames
}

const PRESETS: { name: string; value: Input }[] = [
  {
    name: '長さより向き',
    value: {
      query: [8, 4],
      docs: [
        { name: 'A', v: [2, 1] },
        { name: 'B', v: [9, 9] },
        { name: 'C', v: [1, 8] },
        { name: 'D', v: [7, 2] },
      ],
      k: 2,
    },
  },
  {
    name: '直交を含む',
    value: {
      query: [9, 1],
      docs: [
        { name: 'A', v: [1, 9] },
        { name: 'B', v: [8, 2] },
        { name: 'C', v: [5, 5] },
        { name: 'D', v: [9, 2] },
      ],
      k: 2,
    },
  },
]

export default function CosineTopK() {
  const [input, setInput] = useState<Input>(PRESETS[0]!.value)
  const frames = useMemo(() => trace(input), [input])

  return (
    <SimShell
      title="コサイン類似度で上位 k 件を取る"
      subtitle="内積を長さで割ると、向きの近さだけが残る。上位 k 件は size-k のヒープで足りる"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="入力" presets={PRESETS} onPick={setInput} />}
      legend={
        <>
          <LegendItem state="window">検索ベクトル Q</LegendItem>
          <LegendItem state="active">いま比べている候補</LegendItem>
          <LegendItem state="good">上位 k 件に入っている</LegendItem>
          <LegendItem state="bad">追い出された</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <GraphView nodes={f.view.nodes} edges={f.view.edges} directed width={300} height={240} />
          <table
            className="m-0 border-collapse font-mono text-xs"
            style={{ display: 'table', width: 'auto' }}
          >
            <thead>
              <tr style={{ color: 'var(--fg-muted)' }}>
                <th className="px-2 py-1 text-left">候補</th>
                <th className="px-2 py-1 text-right">コサイン</th>
                <th className="px-2 py-1 text-left">上位k</th>
              </tr>
            </thead>
            <tbody>
              {f.view.rows.map((r) => (
                <tr key={r.name} style={{ color: r.inHeap ? 'var(--ok)' : 'var(--fg-muted)' }}>
                  <td className="px-2 py-1">{r.name}</td>
                  <td className="px-2 py-1 text-right">{r.cos.toFixed(3)}</td>
                  <td className="px-2 py-1">{r.inHeap ? '●' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SimShell>
  )
}
