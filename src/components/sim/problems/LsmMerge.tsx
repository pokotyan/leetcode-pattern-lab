import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `import heapq

def merge_runs(runs):
    heap = []
    for i, run in enumerate(runs):
        if run:
            heapq.heappush(heap, (run[0], i, 0))     # (キー, どの列か, 何番目か)
    out = []
    while heap:
        key, i, j = heapq.heappop(heap)              # 全体で最小のキー
        if not out or out[-1] != key:
            out.append(key)                          # 同じキーは新しいほうだけ残す
        if j + 1 < len(runs[i]):
            heapq.heappush(heap, (runs[i][j + 1], i, j + 1))
    return out`

type Input = { runs: number[][]; labels: string[] }
type View = { runs: { label: string; cells: Cell[] }[]; heap: Cell[]; out: number[] }

function trace({ runs, labels }: Input): Frame<View>[] {
  const frames: Frame<View>[] = []
  const heap: { key: number; i: number; j: number }[] = []
  const out: number[] = []
  const consumed = runs.map(() => -1)

  const sortHeap = () => heap.sort((a, b) => a.key - b.key || a.i - b.i)

  const snap = (
    line: number | number[],
    note: string,
    opts: { cur?: [number, number]; dup?: boolean; finished?: boolean } = {},
  ) => {
    const view = runs.map((run, i) => ({
      label: labels[i]!,
      cells: run.map((v, j): Cell => {
        let state: Cell['state'] = 'idle'
        if (j <= consumed[i]!) state = 'dim'
        if (heap.some((h) => h.i === i && h.j === j)) state = 'window'
        if (opts.cur && opts.cur[0] === i && opts.cur[1] === j) state = opts.dup ? 'bad' : 'active'
        return { value: v, state }
      }),
    }))
    const heapCells: Cell[] = [...heap]
      .sort((a, b) => a.key - b.key || a.i - b.i)
      .map((h, idx) => ({
        value: h.key,
        note: labels[h.i]!,
        state: idx === 0 ? 'active' : 'window',
      }))
    frames.push({
      line,
      note,
      vars: { 列の数: runs.length, ヒープ: heap.length, 出力済み: out.length },
      view: { runs: view, heap: heapCells, out: [...out] },
      done: opts.finished,
    })
  }

  runs.forEach((run, i) => {
    if (run.length > 0) heap.push({ key: run[0]!, i, j: 0 })
  })
  sortHeap()
  snap([5, 6, 7], `${runs.length} 本のソート済みの列を1本にまとめる。まず各列の先頭だけをヒープに入れる。ヒープの中身は常に「各列の未処理の先頭」だけ`)

  let guard = 0
  while (heap.length > 0 && guard++ < 200) {
    sortHeap()
    const top = heap.shift()!
    consumed[top.i] = top.j
    const dup = out.length > 0 && out[out.length - 1] === top.key
    if (!dup) {
      out.push(top.key)
      snap([10, 11, 12], `ヒープの先頭は ${labels[top.i]} の ${top.key}。これが全体で最小なので出力に確定`, {
        cur: [top.i, top.j],
      })
    } else {
      snap([10, 11], `${labels[top.i]} の ${top.key} は直前と同じキー。新しい列の値をすでに採用済みなので、こちらは捨てる`, {
        cur: [top.i, top.j],
        dup: true,
      })
    }
    if (top.j + 1 < runs[top.i]!.length) {
      heap.push({ key: runs[top.i]![top.j + 1]!, i: top.i, j: top.j + 1 })
      sortHeap()
      snap(14, `${labels[top.i]} の次の値 ${runs[top.i]![top.j + 1]} をヒープへ補充する`, {})
    }
  }
  snap(15, `完了。出力は [${out.join(', ')}]。ヒープの大きさは常に列の数だけなので、列が長くてもメモリは増えない`, {
    finished: true,
  })
  return frames
}

const PRESETS: { name: string; value: Input }[] = [
  {
    name: '3本をまとめる',
    value: { runs: [[1, 5, 9], [3, 5, 7], [2, 8]], labels: ['新', '中', '旧'] },
  },
  {
    name: '重複が多い',
    value: { runs: [[1, 2, 3], [1, 2, 3], [2, 3, 4]], labels: ['新', '中', '旧'] },
  },
  {
    name: '長さがばらばら',
    value: { runs: [[10], [1, 2, 3, 4, 5], [6, 7]], labels: ['新', '中', '旧'] },
  },
]

export default function LsmMerge() {
  const [input, setInput] = useState<Input>(PRESETS[0]!.value)
  const frames = useMemo(() => trace(input), [input])

  return (
    <SimShell
      title="複数のソート済みファイルを1本にまとめる（k-way merge）"
      subtitle="各列の先頭だけをヒープに置く。取り出すたびに、その列から次の1個を補充する"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="入力" presets={PRESETS} onPick={setInput} />}
      legend={
        <>
          <LegendItem state="active">いま取り出した値</LegendItem>
          <LegendItem state="window">ヒープに入っている（各列の先頭）</LegendItem>
          <LegendItem state="bad">古いほうなので捨てる</LegendItem>
          <LegendItem state="dim">処理済み</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          {f.view.runs.map((r) => (
            <div key={r.label}>
              <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                {r.label}しいファイル
              </p>
              <ArrayView cells={r.cells} showIndex={false} size={38} />
            </div>
          ))}
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              ヒープ（先頭が最小。下がどのファイルか）
            </p>
            {f.view.heap.length === 0 ? (
              <p className="m-0 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
                （空）
              </p>
            ) : (
              <ArrayView cells={f.view.heap} showIndex={false} size={40} />
            )}
          </div>
          <p className="m-0 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
            出力 = [<span style={{ color: 'var(--ok)' }}>{f.view.out.join(', ')}</span>]
          </p>
        </div>
      )}
    </SimShell>
  )
}
