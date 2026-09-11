import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { IntervalView, type Bar } from '../views/IntervalView'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `import heapq

def min_meeting_rooms(intervals):
    intervals.sort()                  # 開始時刻の早い順
    heap = []                         # 使用中の部屋の「終了時刻」
    for start, end in intervals:
        if heap and heap[0] <= start:
            heapq.heappop(heap)       # 一番早く空く部屋が、この会議の前に空いた
        heapq.heappush(heap, end)     # この会議で部屋を1つ使う
    return len(heap)`

type Iv = [number, number]
type View = { bars: Bar[]; heap: Cell[]; sweep: number | null }

function trace(raw: Iv[]): Frame<View>[] {
  const intervals = [...raw].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const heap: number[] = [] // 昇順に保つ。先頭が「一番早く空く部屋」
  const frames: Frame<View>[] = []
  const assigned = new Map<number, number>() // 区間index -> 何段目に描くか
  const rowEnd: number[] = [] // 各段に最後に置いた会議の終了時刻。同じ段＝同じ部屋

  const snap = (
    line: number | number[],
    note: string,
    opts: { cur?: number; pop?: boolean; push?: boolean; sweep?: number | null; finished?: boolean } = {},
  ) => {
    const bars: Bar[] = intervals.map((iv, i) => ({
      start: iv[0],
      end: iv[1],
      row: assigned.get(i) ?? rowEnd.length,
      label: `${iv[0]}-${iv[1]}`,
      state:
        opts.cur === i
          ? opts.push
            ? 'good'
            : 'active'
          : opts.cur !== undefined && i < opts.cur
            ? 'window'
            : 'idle',
    }))
    const heapCells: Cell[] = heap.map((v, i) => ({
      value: v,
      state: i === 0 ? (opts.pop ? 'bad' : 'active') : 'window',
    }))
    frames.push({
      line,
      note,
      vars: {
        使用中の部屋: heap.length,
        一番早い終了: heap.length ? heap[0]! : '−',
        見た会議: opts.cur !== undefined ? `${opts.cur + 1}/${intervals.length}` : '−',
      },
      view: { bars, heap: heapCells, sweep: opts.sweep ?? null },
      done: opts.finished,
    })
  }

  snap([4, 5], `開始時刻の早い順に並べる。heap には「いま使っている部屋が空く時刻」だけを入れておく`)

  intervals.forEach(([start, end], i) => {
    snap(6, `${i + 1} 件目の会議 [${start}, ${end}) を見る。開始は ${start}`, { cur: i, sweep: start })
    if (heap.length > 0 && heap[0]! <= start) {
      snap(7, `一番早く空く部屋は ${heap[0]} に空く。${start} までに空いているので、その部屋を使い回せる`, {
        cur: i,
        sweep: start,
        pop: true,
      })
      heap.shift()
      snap(8, `その部屋を heap から取り出す。部屋数は増えない`, { cur: i, sweep: start })
    } else if (heap.length > 0) {
      snap(7, `一番早く空く部屋でも ${heap[0]} まで空かない。${start} に始まるこの会議は、新しい部屋が要る`, {
        cur: i,
        sweep: start,
      })
    }
    const reuse = rowEnd.findIndex((e) => e <= start)
    const row = reuse === -1 ? rowEnd.length : reuse
    rowEnd[row] = end
    assigned.set(i, row)
    heap.push(end)
    heap.sort((a, b) => a - b)
    snap(9, `この会議の終了時刻 ${end} を heap に入れる。同時に使っている部屋は ${heap.length} 室`, {
      cur: i,
      sweep: start,
      push: true,
    })
  })

  snap(10, `完了。heap に残った ${heap.length} が、同時に必要だった部屋数の最大値`, { finished: true })
  return frames
}

const PRESETS: { name: string; value: Iv[] }[] = [
  { name: 'LC253の例', value: [[0, 30], [5, 10], [15, 20]] },
  { name: '重ならない', value: [[7, 10], [2, 4]] },
  { name: '端が接する', value: [[1, 5], [5, 9]] },
  { name: '4室必要', value: [[1, 10], [2, 7], [3, 19], [8, 12], [10, 20], [11, 30]] },
]

export default function MeetingRoomsII() {
  const [ivs, setIvs] = useState<Iv[]>(PRESETS[0]!.value)
  const frames = useMemo(() => trace(ivs), [ivs])
  const min = Math.min(...ivs.map((i) => i[0]))
  const max = Math.max(...ivs.map((i) => i[1]))

  return (
    <SimShell
      title="Meeting Rooms II（終了時刻をヒープで持つ）"
      subtitle="開始順に見ていき、一番早く空く部屋が間に合えば使い回す。ヒープの大きさがそのまま必要な部屋数"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="intervals" presets={PRESETS} onPick={setIvs} />}
      legend={
        <>
          <LegendItem state="active">いま見ている会議 / 一番早く空く部屋</LegendItem>
          <LegendItem state="good">部屋を割り当てた</LegendItem>
          <LegendItem state="bad">空いたので取り出す</LegendItem>
          <LegendItem state="window">処理済み / 使用中の部屋</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <IntervalView bars={f.view.bars} min={min} max={max} sweep={f.view.sweep} label="会議（同じ段＝同じ部屋）" />
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              heap（使用中の部屋が空く時刻。先頭が最小）
            </p>
            <ArrayView cells={f.view.heap} showIndex={false} size={40} />
          </div>
        </div>
      )}
    </SimShell>
  )
}
