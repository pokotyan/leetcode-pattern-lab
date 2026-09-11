import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def car_pooling(trips, capacity):
    diff = [0] * 1001
    for num, start, end in trips:
        diff[start] += num        # start で num 人乗る
        diff[end] -= num          # end で num 人降りる
    cur = 0
    for x in diff:
        cur += x                  # その地点にいる人数
        if cur > capacity:
            return False
    return True`

type Trip = [number, number, number]
type Input = { trips: Trip[]; capacity: number }

type View = { diff: Cell[]; cur: Cell[]; pointers: Pointer[] }

function trace({ trips, capacity }: Input): Frame<View>[] {
  const last = Math.max(...trips.map((t) => t[2])) + 1
  const diff = Array<number>(last + 1).fill(0)
  const running: (number | '·')[] = Array<number | '·'>(last + 1).fill('·')
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
      over?: boolean
      finished?: boolean
    } = {},
  ) => {
    const diffCells: Cell[] = diff.map((v, i) => {
      let state: Cell['state'] = 'idle'
      if (i === opts.plus) state = 'good'
      else if (i === opts.minus) state = 'bad'
      else if (i === opts.scan) state = opts.over ? 'bad' : 'active'
      else if (opts.scan !== undefined && i < opts.scan) state = 'dim'
      return { value: v, state }
    })
    const curCells: Cell[] = running.map((v, i) => {
      let state: Cell['state'] = 'idle'
      if (v !== '·') state = i === opts.scan && opts.over ? 'bad' : i === opts.scan ? 'active' : 'good'
      return { value: v, state }
    })
    const pointers: Pointer[] = []
    if (opts.plus !== undefined) pointers.push({ name: '乗車', index: opts.plus, tone: 'ok' })
    if (opts.minus !== undefined) pointers.push({ name: '降車', index: opts.minus, tone: 'danger' })
    if (opts.scan !== undefined) pointers.push({ name: 'i', index: opts.scan, tone: 'accent' })
    frames.push({
      line,
      note,
      vars: {
        capacity,
        cur: opts.cur ?? '−',
        便: opts.trip !== undefined ? `${opts.trip + 1}/${trips.length}` : '−',
      },
      view: { diff: diffCells, cur: curCells, pointers },
      done: opts.finished,
    })
  }

  snap(2, `地点ごとの「人数の変化」を入れる diff を用意する。地点の番号は問題の制約で 1000 までなので、固定長 1001 で足りる`)

  trips.forEach(([num, start, end], t) => {
    diff[start]! += num
    snap(4, `${t + 1}件目: 地点 ${start} で ${num} 人乗る。diff[${start}] に +${num}`, {
      plus: start,
      trip: t,
    })
    diff[end]! -= num
    snap(5, `地点 ${end} で ${num} 人降りる。diff[${end}] に −${num}。乗っているのは [${start}, ${end}) の間だけ`, {
      plus: start,
      minus: end,
      trip: t,
    })
  })

  snap(6, `全便を書き終えた。ここから地点 0 に向かって順に足し上げ、車内の人数を復元する`)

  let cur = 0
  for (let i = 0; i < diff.length; i++) {
    cur += diff[i]!
    running[i] = cur
    if (cur > capacity) {
      snap([8, 9, 10], `地点 ${i} で車内は ${cur} 人。capacity ${capacity} を超えたので False を返して終了`, {
        scan: i,
        cur,
        over: true,
        finished: true,
      })
      return frames
    }
    snap([8, 9], `地点 ${i} の車内は ${cur} 人。capacity ${capacity} 以内なので続行`, { scan: i, cur })
  }
  snap(11, `最後まで capacity ${capacity} を超えなかったので True`, { cur, finished: true })
  return frames
}

const PRESETS: { name: string; value: Input }[] = [
  { name: 'capacity=4（乗り切れない）', value: { trips: [[2, 1, 5], [3, 3, 7]], capacity: 4 } },
  { name: 'capacity=5（乗り切れる）', value: { trips: [[2, 1, 5], [3, 3, 7]], capacity: 5 } },
  { name: '降車と乗車が同じ地点', value: { trips: [[2, 1, 5], [3, 5, 7]], capacity: 3 } },
  { name: '3便が重なる', value: { trips: [[2, 1, 5], [3, 3, 7], [4, 2, 4]], capacity: 8 } },
]

export default function CarPooling() {
  const [input, setInput] = useState<Input>(PRESETS[0]!.value)
  const frames = useMemo(() => trace(input), [input])

  return (
    <SimShell
      title="Car Pooling（差分配列で定員を判定する）"
      subtitle="乗車・降車を「その地点での人数の変化」として記録し、累積で車内人数を復元する"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="入力" presets={PRESETS} onPick={setInput} />}
      legend={
        <>
          <LegendItem state="good">乗車 (+)</LegendItem>
          <LegendItem state="bad">降車 (−) / 定員超過</LegendItem>
          <LegendItem state="active">積み上げ中</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-4">
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              diff（地点ごとの人数の変化。使う範囲だけ表示）
            </p>
            <ArrayView cells={f.view.diff} pointers={f.view.pointers} size={38} />
          </div>
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              cur（累積 = その地点の車内人数）
            </p>
            <ArrayView cells={f.view.cur} showIndex={false} size={38} />
          </div>
        </div>
      )}
    </SimShell>
  )
}
