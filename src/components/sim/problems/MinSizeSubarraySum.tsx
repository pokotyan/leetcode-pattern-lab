import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl, TextControl, parseNums } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def min_sub_array_len(target, nums):
    left = 0
    cur = 0
    best = float("inf")
    for right in range(len(nums)):
        cur += nums[right]          # 右を伸ばす
        while cur >= target:        # 条件を満たす間だけ
            best = min(best, right - left + 1)
            cur -= nums[left]       # 左を縮める
            left += 1
    return 0 if best == float("inf") else best`

type View = { cells: Cell[]; pointers: Pointer[]; bestRange: [number, number] | null }

function trace(nums: number[], target: number): Frame<View>[] {
  const frames: Frame<View>[] = []
  let left = 0
  let cur = 0
  let best = Infinity
  let bestRange: [number, number] | null = null

  const snap = (
    right: number,
    line: number | number[],
    note: string,
    opts: { shrink?: number; finished?: boolean } = {},
  ) => {
    const cells: Cell[] = nums.map((v, i) => {
      let state: Cell['state'] = 'idle'
      if (i < left) state = 'dim'
      else if (i <= right) state = 'window'
      if (i === right) state = 'active'
      if (i === opts.shrink) state = 'bad'
      if (opts.finished && bestRange && i >= bestRange[0] && i <= bestRange[1]) state = 'good'
      return { value: v, state }
    })
    frames.push({
      line,
      note,
      vars: {
        target,
        left,
        right,
        cur,
        幅: right >= left ? right - left + 1 : 0,
        best: best === Infinity ? '∞' : best,
      },
      view: {
        cells,
        pointers: [
          { name: 'L', index: left, tone: 'accent' },
          { name: 'R', index: right, side: 'bottom', tone: 'warn' },
        ],
        bestRange,
      },
      done: opts.finished,
    })
  }

  for (let right = 0; right < nums.length; right++) {
    cur += nums[right]!
    snap(right, [5, 6], `右端 nums[${right}]=${nums[right]} を足す。cur = ${cur}`)
    while (cur >= target) {
      const width = right - left + 1
      const prevBest = best
      if (width < best) {
        best = width
        bestRange = [left, right]
      }
      snap(
        right,
        [7, 8],
        `cur(${cur}) >= target(${target})。幅 ${width}。` +
          (width < prevBest ? `best を ${prevBest === Infinity ? '∞' : prevBest} → ${best} に更新` : `best(${best}) は更新なし`),
      )
      snap(right, [9, 10], `左端 nums[${left}]=${nums[left]} を捨てて縮める。cur = ${cur - nums[left]!}`, {
        shrink: left,
      })
      cur -= nums[left]!
      left += 1
    }
    if (nums.length > 0) snap(right, 7, `cur(${cur}) < target(${target})。これ以上縮められない。right を進める`)
  }
  snap(nums.length - 1, 11, best === Infinity ? '条件を満たす部分配列は無い。0 を返す' : `最短の長さは ${best}`, {
    finished: true,
  })
  return frames
}

const PRESETS = [
  { name: '[2,3,1,2,4,3] t=7', value: { a: '2, 3, 1, 2, 4, 3', t: 7 } },
  { name: '[1,4,4] t=4', value: { a: '1, 4, 4', t: 4 } },
  { name: '解なし', value: { a: '1, 1, 1, 1', t: 11 } },
]

export default function MinSizeSubarraySum() {
  const [raw, setRaw] = useState('2, 3, 1, 2, 4, 3')
  const [target, setTarget] = useState(7)
  const nums = useMemo(() => parseNums(raw, [2, 3, 1, 2, 4, 3]).slice(0, 12), [raw])
  const frames = useMemo(() => trace(nums, target), [nums, target])

  return (
    <SimShell
      title="Minimum Size Subarray Sum（可変長 Sliding Window）"
      subtitle="伸ばして条件を満たしたら、満たす限り縮める。L も R も戻らないので O(N)"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="nums =" value={raw} onChange={setRaw} width={190} />
          <NumberControl label="target =" value={target} onChange={setTarget} />
          <PresetControl
            presets={PRESETS}
            onPick={(v) => {
              setRaw(v.a)
              setTarget(v.t)
            }}
          />
        </>
      }
      legend={
        <>
          <LegendItem state="window">ウィンドウ内</LegendItem>
          <LegendItem state="active">今足した要素</LegendItem>
          <LegendItem state="bad">今捨てる要素</LegendItem>
          <LegendItem state="good">最短の答え</LegendItem>
        </>
      }
    >
      {(f) => <ArrayView cells={f.view.cells} pointers={f.view.pointers} />}
    </SimShell>
  )
}
