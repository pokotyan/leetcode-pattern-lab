import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl, TextControl, parseNums } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `def build_prefix(nums):
    prefix = [0]
    for x in nums:
        prefix.append(prefix[-1] + x)
    return prefix

def range_sum(prefix, l, r):
    # nums[l] から nums[r] までの合計
    return prefix[r + 1] - prefix[l]`

type View = { nums: Cell[]; prefix: Cell[]; formula: string }

function trace(nums: number[], l: number, r: number): Frame<View>[] {
  const frames: Frame<View>[] = []
  const prefix: number[] = [0]

  const snap = (
    line: number | number[],
    note: string,
    opts: { buildIdx?: number; queryL?: number; queryR?: number; finished?: boolean } = {},
  ) => {
    const numsCells: Cell[] = nums.map((v, i) => ({
      value: v,
      state: i === opts.buildIdx ? 'active' : opts.queryL !== undefined && i >= opts.queryL! && i <= opts.queryR! ? 'window' : 'idle',
    }))
    const prefixCells: Cell[] = Array.from({ length: nums.length + 1 }, (_, i) => {
      let state: Cell['state'] = 'idle'
      if (i >= prefix.length) state = 'dim'
      else if (i === opts.buildIdx! + 1) state = 'active'
      if (opts.queryL !== undefined && i === opts.queryR! + 1) state = 'good'
      if (opts.queryL !== undefined && i === opts.queryL) state = 'good'
      return { value: i < prefix.length ? prefix[i]! : '?', state, note: `[${i}]` }
    })
    frames.push({
      line,
      note,
      vars: { 'prefix.length': prefix.length },
      view: { nums: numsCells, prefix: prefixCells, formula: '' },
      done: opts.finished,
    })
  }

  snap([2, 3], `prefix[0] = 0 から始める。「まだ何も足していない状態の合計」を表す番兵`)
  for (let i = 0; i < nums.length; i++) {
    prefix.push(prefix[prefix.length - 1]! + nums[i]!)
    snap([4], `prefix[${i + 1}] = prefix[${i}] + nums[${i}] = ${prefix[i]} + ${nums[i]} = ${prefix[i + 1]}`, {
      buildIdx: i,
    })
  }
  snap(6, `配列作りが完了。prefix の長さは nums より 1 大きい ${prefix.length}`)

  const ll = Math.max(0, Math.min(l, nums.length - 1))
  const rr = Math.max(ll, Math.min(r, nums.length - 1))
  snap([9, 10], `続けて nums[${ll}..${rr}] の合計を求めてみる`, { queryL: ll, queryR: rr })
  const ans = prefix[rr + 1]! - prefix[ll]!
  snap(
    [9, 10],
    `prefix[${rr + 1}] − prefix[${ll}] = ${prefix[rr + 1]} − ${prefix[ll]} = ${ans}。区間を1つずつ足さなくても O(1) で求まった`,
    { queryL: ll, queryR: rr, finished: true },
  )
  return frames
}

const PRESETS = [
  { name: '[3,1,4,1,5,9] l=1,r=4', value: { a: '3, 1, 4, 1, 5, 9', l: 1, r: 4 } },
  { name: '区間が1個だけ', value: { a: '2, -1, 3, 5', l: 2, r: 2 } },
  { name: '全区間', value: { a: '1, 2, 3, 4, 5', l: 0, r: 4 } },
]

export default function PrefixSumBuild() {
  const [raw, setRaw] = useState('3, 1, 4, 1, 5, 9')
  const [l, setL] = useState(1)
  const [r, setR] = useState(4)
  const nums = useMemo(() => parseNums(raw, [3, 1, 4, 1, 5, 9]).slice(0, 10), [raw])
  const frames = useMemo(() => trace(nums, l, r), [nums, l, r])

  return (
    <SimShell
      title="累積和の構築とクエリ"
      subtitle="長さ N+1 の配列を作っておくだけで、どんな区間の和も O(1) で求まる"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="nums =" value={raw} onChange={setRaw} width={190} />
          <NumberControl label="l =" value={l} onChange={setL} min={0} />
          <NumberControl label="r =" value={r} onChange={setR} min={0} />
          <PresetControl
            presets={PRESETS}
            onPick={(v) => {
              setRaw(v.a)
              setL(v.l)
              setR(v.r)
            }}
          />
        </>
      }
      legend={
        <>
          <LegendItem state="active">今計算した要素</LegendItem>
          <LegendItem state="window">クエリの区間</LegendItem>
          <LegendItem state="good">引き算に使う2点</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <div>
            <p className="mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              nums
            </p>
            <ArrayView cells={f.view.nums} size={38} />
          </div>
          <div>
            <p className="mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              prefix（nums より1つ長い）
            </p>
            <ArrayView cells={f.view.prefix} showIndex={false} size={38} />
          </div>
        </div>
      )}
    </SimShell>
  )
}
