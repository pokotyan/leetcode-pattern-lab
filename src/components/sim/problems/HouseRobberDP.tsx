import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl, TextControl, parseNums } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def rob(nums):
    n = len(nums)
    dp = [0] * n          # dp[i]: i番目の家まで見たときの、盗める最大額
    for i in range(n):
        if i == 0:
            dp[i] = nums[0]
        elif i == 1:
            dp[i] = max(nums[0], nums[1])
        else:
            # i番目を "盗まない" なら dp[i-1] のまま
            # i番目を "盗む" なら、i-1番目は盗めないので dp[i-2] + nums[i]
            dp[i] = max(dp[i - 1], dp[i - 2] + nums[i])
    return dp[-1] if n else 0`

type View = { nums: Cell[]; dp: Cell[]; pointers: Pointer[] }

function trace(nums: number[]): Frame<View>[] {
  const n = nums.length
  const dp = Array<number>(n).fill(-1)
  const frames: Frame<View>[] = []

  const snap = (
    i: number,
    line: number | number[],
    note: string,
    opts: { finished?: boolean } = {},
  ) => {
    const numsCells: Cell[] = nums.map((v, k) => ({ value: v, state: k === i ? 'active' : k < i ? 'dim' : 'idle' }))
    const dpCells: Cell[] = dp.map((v) => ({ value: v === -1 ? '?' : v, state: v === -1 ? 'idle' : 'good' }))
    frames.push({
      line,
      note,
      vars: { i, 'nums[i]': nums[i] ?? '−' },
      view: { nums: numsCells, dp: dpCells, pointers: i >= 0 ? [{ name: 'i', index: i, tone: 'accent' }] : [] },
      done: opts.finished,
    })
  }

  if (n === 0) {
    snap(-1, 9, '家が無い。0を返す', { finished: true })
    return frames
  }

  snap(-1, 3, `dp[i] を「i番目の家まで見たとき、盗める最大額」と定義する`)
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      dp[i] = nums[0]!
      snap(i, [5, 6], `dp[0] = nums[0] = ${dp[0]}。家が1軒だけならそれを盗むしかない`)
    } else if (i === 1) {
      dp[i] = Math.max(nums[0]!, nums[1]!)
      snap(i, [7, 8], `隣同士は盗めないので、dp[1] = max(nums[0], nums[1]) = max(${nums[0]}, ${nums[1]}) = ${dp[1]}`)
    } else {
      const skip = dp[i - 1]!
      const take = dp[i - 2]! + nums[i]!
      dp[i] = Math.max(skip, take)
      snap(
        i,
        [11, 12, 13],
        `${i}番目を「盗まない」なら dp[${i - 1}]=${skip}。「盗む」なら隣の${i - 1}番目は諦めて dp[${i - 2}]+nums[${i}]=${dp[i - 2]}+${nums[i]}=${take}。大きい方の ${dp[i]} を採用`,
      )
    }
  }
  snap(n - 1, 14, `dp[${n - 1}] = ${dp[n - 1]} が、盗める最大額`, { finished: true })
  return frames
}

const PRESETS = [
  { name: '[2,7,9,3,1]', value: '2, 7, 9, 3, 1' },
  { name: '[1,2,3,1]', value: '1, 2, 3, 1' },
  { name: '家1軒だけ', value: '5' },
  { name: '全部同じ額', value: '4, 4, 4, 4, 4' },
]

export default function HouseRobberDP() {
  const [raw, setRaw] = useState('2, 7, 9, 3, 1')
  const nums = useMemo(() => parseNums(raw, [2, 7, 9, 3, 1]).slice(0, 10), [raw])
  const frames = useMemo(() => trace(nums), [nums])

  return (
    <SimShell
      title="House Robber（1次元 DP：i番目「まで」を状態にする）"
      subtitle="dp[i] を求めるのに必要なのは、直前の2つの答えだけ"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="nums =" value={raw} onChange={setRaw} width={200} />
          <PresetControl presets={PRESETS} onPick={setRaw} />
        </>
      }
      legend={
        <>
          <LegendItem state="active">今計算している家</LegendItem>
          <LegendItem state="good">dp が確定済み</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <div>
            <p className="mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              nums（各家の金額）
            </p>
            <ArrayView cells={f.view.nums} pointers={f.view.pointers} size={38} />
          </div>
          <div>
            <p className="mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              dp（i番目まで見たときの最大額）
            </p>
            <ArrayView cells={f.view.dp} size={38} />
          </div>
        </div>
      )}
    </SimShell>
  )
}
