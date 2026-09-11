import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { IntervalView, type Bar } from '../views/IntervalView'
import { LegendItem } from '../views/Legend'
import type { Frame } from '../core/types'

const CODE = `def merge(intervals):
    intervals.sort()                          # 開始時刻の早い順に並べる
    merged = []
    for start, end in intervals:
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)   # 重なるので伸ばす
        else:
            merged.append([start, end])               # 離れているので新しい区間
    return merged`

type Iv = [number, number]

type View = { input: Bar[]; merged: Bar[]; sweep: number | null }

function trace(raw: Iv[]): Frame<View>[] {
  const intervals = [...raw].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const merged: Iv[] = []
  const frames: Frame<View>[] = []
  const snap = (
    line: number | number[],
    note: string,
    opts: { cur?: number; hit?: boolean; sweep?: number | null; finished?: boolean } = {},
  ) => {
    const input: Bar[] = intervals.map((iv, i) => ({
      start: iv[0],
      end: iv[1],
      row: i,
      state: opts.cur === i ? 'active' : opts.cur !== undefined && i < opts.cur ? 'dim' : 'idle',
    }))
    const mergedBars: Bar[] = merged.map((iv, i) => ({
      start: iv[0],
      end: iv[1],
      row: 0,
      state: opts.hit && i === merged.length - 1 ? 'window' : 'good',
    }))
    frames.push({
      line,
      note,
      vars: {
        見た区間: opts.cur !== undefined ? `${opts.cur + 1}/${intervals.length}` : '−',
        確定数: merged.length,
        直前の終端: merged.length ? merged[merged.length - 1]![1] : '−',
      },
      view: { input, merged: mergedBars, sweep: opts.sweep ?? null },
      done: opts.finished,
    })
  }

  snap(2, `開始時刻の早い順に並べ替える。[${intervals.map((i) => `[${i}]`).join(', ')}]。こう並べておくと、重なりは必ず「直前に確定した区間」との間にだけ起きる`)

  intervals.forEach(([start, end], i) => {
    const last = merged[merged.length - 1]
    if (last && start <= last[1]) {
      snap([5], `${start} は直前の終端 ${last[1]} 以下。重なっているので、新しく作らずに伸ばす`, {
        cur: i,
        sweep: start,
        hit: true,
      })
      const before = last[1]
      last[1] = Math.max(before, end)
      snap([6], `終端を max(${before}, ${end}) = ${last[1]} に更新。すでに内側に収まっている区間なら、ここで伸びない`, {
        cur: i,
        sweep: start,
        hit: true,
      })
    } else {
      snap([5, 7], last
        ? `${start} は直前の終端 ${last[1]} より大きい。離れているので、ここから新しい区間を始める`
        : `最初の区間。そのまま確定リストに入れる`, { cur: i, sweep: start })
      merged.push([start, end])
      snap(8, `[${start}, ${end}] を確定リストに追加`, { cur: i, sweep: start, hit: true })
    }
  })

  snap(9, `完了。答えは ${merged.map((m) => `[${m[0]},${m[1]}]`).join(', ')}（${merged.length} 区間）`, {
    finished: true,
  })
  return frames
}

const PRESETS: { name: string; value: Iv[] }[] = [
  { name: 'LC56の例', value: [[1, 3], [2, 6], [8, 10], [15, 18]] },
  { name: '端が接する', value: [[1, 4], [4, 5]] },
  { name: '内側に入る', value: [[1, 10], [2, 3], [4, 5]] },
  { name: '順番がばらばら', value: [[8, 10], [1, 3], [15, 18], [2, 6]] },
  { name: '全部離れている', value: [[1, 2], [4, 5], [7, 8]] },
]

export default function MergeIntervals() {
  const [ivs, setIvs] = useState<Iv[]>(PRESETS[0]!.value)
  const frames = useMemo(() => trace(ivs), [ivs])
  const min = Math.min(...ivs.map((i) => i[0]))
  const max = Math.max(...ivs.map((i) => i[1]))

  return (
    <SimShell
      title="Merge Intervals（開始順に並べて、直前の区間と比べる）"
      subtitle="ソートさえしてしまえば、比べる相手は常に直前の1つだけで済む。O(N log N)"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="intervals" presets={PRESETS} onPick={setIvs} />}
      legend={
        <>
          <LegendItem state="active">いま見ている区間</LegendItem>
          <LegendItem state="dim">処理済み</LegendItem>
          <LegendItem state="good">確定した区間</LegendItem>
          <LegendItem state="window">いま伸ばした区間</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <IntervalView bars={f.view.input} min={min} max={max} sweep={f.view.sweep} label="入力（開始順にソート済み）" />
          <IntervalView bars={f.view.merged} min={min} max={max} label="merged（確定した区間）" />
        </div>
      )}
    </SimShell>
  )
}
