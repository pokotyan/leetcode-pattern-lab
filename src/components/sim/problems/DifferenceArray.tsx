import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def corp_flight_bookings(bookings, n):
    diff = [0] * (n + 1)
    for first, last, seats in bookings:
        diff[first - 1] += seats      # ここから seats 人増える
        diff[last] -= seats           # ここで元に戻す
    ans = []
    cur = 0
    for i in range(n):
        cur += diff[i]                # 差分を積み上げると実際の値になる
        ans.append(cur)
    return ans`

type Booking = [number, number, number]
type Input = { bookings: Booking[]; n: number }

type View = { diff: Cell[]; ans: Cell[]; diffPointers: Pointer[] }

function trace({ bookings, n }: Input): Frame<View>[] {
  const diff = Array<number>(n + 1).fill(0)
  const ans: number[] = []
  const frames: Frame<View>[] = []

  const snap = (
    line: number | number[],
    note: string,
    opts: {
      plus?: number
      minus?: number
      scan?: number
      trip?: number
      cur?: number
      finished?: boolean
    } = {},
  ) => {
    const diffCells: Cell[] = diff.map((v, i) => {
      let state: Cell['state'] = 'idle'
      if (i === opts.plus) state = 'good'
      else if (i === opts.minus) state = 'bad'
      else if (i === opts.scan) state = 'active'
      else if (opts.scan !== undefined && i < opts.scan) state = 'dim'
      return { value: v, state, note: i === n ? '番兵' : undefined }
    })
    const ansCells: Cell[] = Array.from({ length: n }, (_, i) => {
      const filled = i < ans.length
      let state: Cell['state'] = 'idle'
      if (filled) state = i === ans.length - 1 && opts.scan === i ? 'active' : 'good'
      return { value: filled ? ans[i]! : '·', state }
    })
    const diffPointers: Pointer[] = []
    if (opts.plus !== undefined) diffPointers.push({ name: '+', index: opts.plus, tone: 'ok' })
    if (opts.minus !== undefined) diffPointers.push({ name: '−', index: opts.minus, tone: 'danger' })
    if (opts.scan !== undefined) diffPointers.push({ name: 'i', index: opts.scan, tone: 'accent' })
    frames.push({
      line,
      note,
      vars: {
        予約: opts.trip !== undefined ? `${opts.trip + 1}/${bookings.length}` : '−',
        cur: opts.cur ?? '−',
        n,
      },
      view: { diff: diffCells, ans: ansCells, diffPointers },
      done: opts.finished,
    })
  }

  snap(2, `長さ n+1 = ${n + 1} の diff を 0 で作る。末尾の1マスは「区間の終わりの外側」を書ける場所として余分に確保しておく`)

  bookings.forEach(([first, last, seats], t) => {
    diff[first - 1]! += seats
    snap(4, `予約 [${first}, ${last}] に ${seats} 人。座席 ${first} から増えるので diff[${first - 1}] に +${seats}`, {
      plus: first - 1,
      trip: t,
    })
    diff[last]! -= seats
    snap(5, `座席 ${last} を過ぎたら元に戻るので diff[${last}] に −${seats}。この2マスだけで区間 [${first}, ${last}] 全体を表現できている`, {
      plus: first - 1,
      minus: last,
      trip: t,
    })
  })

  snap([6, 7], `全予約を書き終えた。ここまでで触ったのは ${bookings.length * 2} マスだけ。あとは diff を頭から足し上げていく`)

  let cur = 0
  for (let i = 0; i < n; i++) {
    cur += diff[i]!
    ans.push(cur)
    snap([9, 10], `cur += diff[${i}] (${diff[i]}) → ${cur}。座席 ${i + 1} の予約人数が確定`, {
      scan: i,
      cur,
    })
  }
  snap(11, `完了。答えは [${ans.join(', ')}]`, { cur, finished: true })
  return frames
}

const PRESETS: { name: string; value: Input }[] = [
  { name: 'LC1109の例', value: { bookings: [[1, 2, 10], [2, 3, 20], [2, 5, 25]], n: 5 } },
  { name: '重ならない2件', value: { bookings: [[1, 1, 5], [3, 4, 7]], n: 5 } },
  { name: '全区間に1件', value: { bookings: [[1, 5, 3]], n: 5 } },
  { name: '同じ区間に3件', value: { bookings: [[2, 4, 1], [2, 4, 2], [2, 4, 3]], n: 5 } },
]

export default function DifferenceArray() {
  const [input, setInput] = useState<Input>(PRESETS[0]!.value)
  const frames = useMemo(() => trace(input), [input])

  return (
    <SimShell
      title="Corporate Flight Bookings（差分配列）"
      subtitle="区間の加算を「両端の2マス」だけで記録し、最後に累積和で復元する。O(M + N)"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="入力" presets={PRESETS} onPick={setInput} />}
      legend={
        <>
          <LegendItem state="good">加算した位置 (+)</LegendItem>
          <LegendItem state="bad">打ち消す位置 (−)</LegendItem>
          <LegendItem state="active">積み上げ中</LegendItem>
          <LegendItem state="dim">積み上げ済み</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-4">
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              diff（差分。長さ n+1）
            </p>
            <ArrayView cells={f.view.diff} pointers={f.view.diffPointers} />
          </div>
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              ans（diff の累積和 = 実際の予約人数）
            </p>
            <ArrayView cells={f.view.ans} showIndex={false} />
          </div>
        </div>
      )}
    </SimShell>
  )
}
