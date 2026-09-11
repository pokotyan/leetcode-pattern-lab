import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl, TextControl, parseNums } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `from collections import deque

def max_sliding_window(nums, k):
    dq = deque()                      # index を入れる。値は単調減少に保つ
    res = []
    for i, x in enumerate(nums):
        while dq and nums[dq[-1]] <= x:
            dq.pop()                  # 自分より小さい値は、もう最大になれない
        dq.append(i)
        if dq[0] <= i - k:
            dq.popleft()              # 窓から出た index を捨てる
        if i >= k - 1:
            res.append(nums[dq[0]])   # 先頭がこの窓の最大値
    return res`

type View = { cells: Cell[]; pointers: Pointer[]; deque: Cell[]; res: number[] }

function trace(nums: number[], k: number): Frame<View>[] {
  const dq: number[] = []
  const res: number[] = []
  const frames: Frame<View>[] = []

  const snap = (
    line: number | number[],
    note: string,
    opts: { i?: number; kick?: number; take?: boolean; finished?: boolean } = {},
  ) => {
    const i = opts.i ?? -1
    const lo = i - k + 1
    const cells: Cell[] = nums.map((v, j) => {
      let state: Cell['state'] = 'idle'
      if (j > i) state = 'idle'
      else if (j < lo) state = 'dim'
      else state = 'window'
      if (j === opts.kick) state = 'bad'
      else if (j === i) state = 'active'
      else if (opts.take && j === dq[0]) state = 'good'
      return { value: v, state }
    })
    const pointers: Pointer[] = []
    if (i >= 0) pointers.push({ name: 'i', index: i, tone: 'accent' })
    if (i >= 0 && lo >= 0) pointers.push({ name: '窓の左端', index: lo, side: 'bottom', tone: 'warn' })
    const dqCells: Cell[] = dq.map((idx, p) => ({
      value: nums[idx]!,
      note: `i=${idx}`,
      state: p === 0 ? (opts.take ? 'good' : 'active') : 'window',
    }))
    frames.push({
      line,
      note,
      vars: {
        i: i < 0 ? '−' : i,
        k,
        dq: `[${dq.join(',')}]`,
        窓の最大: dq.length ? nums[dq[0]!]! : '−',
      },
      view: { cells, pointers, deque: dqCells, res: [...res] },
      done: opts.finished,
    })
  }

  snap([4, 5], `dq には「値」ではなく「index」を入れる。窓から出たかどうかを index で判定したいため。値が単調減少に並ぶように保つのが約束`)

  for (let i = 0; i < nums.length; i++) {
    const x = nums[i]!
    snap(6, `i = ${i}、値は ${x}`, { i })
    while (dq.length > 0 && nums[dq[dq.length - 1]!]! <= x) {
      const out = dq[dq.length - 1]!
      snap([7, 8], `dq の末尾は nums[${out}] = ${nums[out]} で、いま来た ${x} 以下。${out} は今後どの窓でも最大になれないので捨てる`, {
        i,
        kick: out,
      })
      dq.pop()
    }
    dq.push(i)
    snap(9, `i = ${i} を dq の末尾に追加。dq の値は [${dq.map((d) => nums[d]!).join(', ')}] で減少順を保っている`, { i })

    if (dq[0]! <= i - k) {
      const out = dq[0]!
      snap([10, 11], `dq の先頭 index ${out} は窓の左端 ${i - k + 1} より手前。窓から出たので捨てる`, {
        i,
        kick: out,
      })
      dq.shift()
    }

    if (i >= k - 1) {
      res.push(nums[dq[0]!]!)
      snap([12, 13], `窓 [${i - k + 1}, ${i}] が揃った。dq の先頭 nums[${dq[0]}] = ${nums[dq[0]!]} がこの窓の最大値`, {
        i,
        take: true,
      })
    } else {
      snap(12, `まだ窓の幅が ${i + 1} 件しかない（k = ${k}）。答えは記録しない`, { i })
    }
  }
  snap(14, `完了。答えは [${res.join(', ')}]`, { i: nums.length - 1, finished: true })
  return frames
}

const PRESETS = [
  { name: 'LC239の例', value: '1, 3, -1, -3, 5, 3, 6, 7' },
  { name: '単調増加', value: '1, 2, 3, 4, 5, 6' },
  { name: '単調減少', value: '6, 5, 4, 3, 2, 1' },
  { name: '同じ値が続く', value: '4, 4, 4, 2, 4' },
]

export default function SlidingWindowMaximum() {
  const [raw, setRaw] = useState('1, 3, -1, -3, 5, 3, 6, 7')
  const [k, setK] = useState(3)
  const nums = useMemo(() => parseNums(raw, [1, 3, -1, -3, 5, 3, 6, 7]).slice(0, 10), [raw])
  const kk = Math.min(Math.max(k, 1), nums.length)
  const frames = useMemo(() => trace(nums, kk), [nums, kk])

  return (
    <SimShell
      title="Sliding Window Maximum（単調キュー）"
      subtitle="窓ごとに最大値を取り直さず、最大になりうる候補だけを減少順に持ち続ける。全体で O(N)"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="nums =" value={raw} onChange={setRaw} width={220} />
          <NumberControl label="k =" value={k} onChange={setK} min={1} max={10} />
          <PresetControl presets={PRESETS} onPick={setRaw} />
        </>
      }
      legend={
        <>
          <LegendItem state="window">いまの窓</LegendItem>
          <LegendItem state="active">いま見ている要素 / dq の先頭</LegendItem>
          <LegendItem state="bad">捨てる要素</LegendItem>
          <LegendItem state="good">この窓の最大値</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-4">
          <ArrayView cells={f.view.cells} pointers={f.view.pointers} />
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              dq（左が先頭。値は減少順。下の注記が index）
            </p>
            <ArrayView cells={f.view.deque} showIndex={false} size={44} />
          </div>
          <p className="m-0 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
            res = [<span style={{ color: 'var(--ok)' }}>{f.view.res.join(', ')}</span>]
          </p>
        </div>
      )}
    </SimShell>
  )
}
