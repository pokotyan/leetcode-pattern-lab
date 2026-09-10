import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl, TextControl, parseNums } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def min_eating_speed(piles, h):
    def hours(k):          # 速度 k での所要時間
        return sum((p + k - 1) // k for p in piles)

    # 条件 P(k): hours(k) <= h   （k が大きいほど成立）
    ok, ng = max(piles), 0   # ok は必ず成立 / ng は不成立
    while abs(ok - ng) > 1:
        mid = (ok + ng) // 2
        if hours(mid) <= h:
            ok = mid
        else:
            ng = mid
    return ok`

type View = { cells: Cell[]; pointers: Pointer[] }

const hoursFor = (piles: number[], k: number) =>
  piles.reduce((a, p) => a + Math.ceil(p / k), 0)

function trace(piles: number[], h: number): Frame<View>[] {
  const frames: Frame<View>[] = []
  const maxK = Math.max(...piles)
  // 候補の速度 1..maxK を「探索空間」として描く
  const speeds = Array.from({ length: maxK }, (_, i) => i + 1)

  const snap = (
    ok: number,
    ng: number,
    mid: number | null,
    line: number | number[],
    note: string,
    finished = false,
  ) => {
    const cells: Cell[] = speeds.map((k) => {
      let state: Cell['state'] = 'idle'
      if (k <= ng) state = 'bad'
      else if (k >= ok) state = 'good'
      if (k === mid) state = 'active'
      return { value: k, state, note: `${hoursFor(piles, k)}h` }
    })
    const pointers: Pointer[] = [
      { name: 'ng', index: ng - 1, tone: 'danger' },
      { name: 'ok', index: ok - 1, tone: 'ok' },
    ]
    if (mid !== null) pointers.push({ name: 'mid', index: mid - 1, side: 'bottom', tone: 'accent' })
    frames.push({
      line,
      note,
      vars: {
        h,
        ok,
        ng,
        mid: mid ?? '−',
        'hours(mid)': mid === null ? '−' : hoursFor(piles, mid),
      },
      view: { cells, pointers },
      done: finished,
    })
  }

  let ok = maxK
  let ng = 0
  snap(
    ok,
    ng,
    null,
    6,
    `答えそのものを二分探索する。速度 ${maxK}（最大の山）なら必ず間に合う=ok、速度 0 は不可能=ng`,
  )

  while (Math.abs(ok - ng) > 1) {
    const mid = Math.floor((ok + ng) / 2)
    const hv = hoursFor(piles, mid)
    snap(ok, ng, mid, [7, 8], `mid = (${ok} + ${ng}) // 2 = ${mid}。この速度を試す`)
    if (hv <= h) {
      snap(ok, ng, mid, [9, 10], `hours(${mid}) = ${hv} <= ${h}。間に合うので ok = ${mid}（もっと遅くできるか探す）`)
      ok = mid
    } else {
      snap(ok, ng, mid, [11, 12], `hours(${mid}) = ${hv} > ${h}。間に合わないので ng = ${mid}（もっと速くする）`)
      ng = mid
    }
  }
  snap(ok, ng, null, 13, `隣り合った。間に合う最小の速度は ${ok}（hours=${hoursFor(piles, ok)}）`, true)
  return frames
}

const PRESETS = [
  { name: '[3,6,7,11] h=8', value: { a: '3, 6, 7, 11', h: 8 } },
  { name: '[3,6,7,11] h=4', value: { a: '3, 6, 7, 11', h: 4 } },
  { name: '[10,10,10] h=10', value: { a: '10, 10, 10', h: 10 } },
]

export default function KokoEatingBananas() {
  const [raw, setRaw] = useState('3, 6, 7, 11')
  const [h, setH] = useState(8)
  const piles = useMemo(() => {
    const xs = parseNums(raw, [3, 6, 7, 11])
      .map((v) => Math.max(1, Math.min(14, Math.round(v))))
      .slice(0, 6)
    return xs.length ? xs : [3, 6, 7, 11]
  }, [raw])
  const hh = Math.max(piles.length, h)
  const frames = useMemo(() => trace(piles, hh), [piles, hh])

  return (
    <SimShell
      title="Koko Eating Bananas（答えの決めうち二分探索）"
      subtitle="配列ではなく「答えの候補」を並べて二分探索する。セル下の数字は hours(k)"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="piles =" value={raw} onChange={setRaw} width={160} />
          <NumberControl label="h =" value={h} onChange={setH} min={1} />
          <PresetControl
            presets={PRESETS}
            onPick={(v) => {
              setRaw(v.a)
              setH(v.h)
            }}
          />
          <span style={{ color: 'var(--fg-muted)' }}>※ 描画のため各山は 1〜14 に丸めます</span>
        </>
      }
      legend={
        <>
          <LegendItem state="bad">間に合わない速度</LegendItem>
          <LegendItem state="good">間に合う速度</LegendItem>
          <LegendItem state="active">検証中の mid</LegendItem>
        </>
      }
    >
      {(f) => (
        <div>
          <p className="mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            速度 k の候補（横軸 = 1 時間に食べるバナナ数）
          </p>
          <ArrayView cells={f.view.cells} pointers={f.view.pointers} showIndex={false} size={40} />
        </div>
      )}
    </SimShell>
  )
}
