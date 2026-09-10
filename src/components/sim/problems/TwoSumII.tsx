import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl, TextControl, parseNums } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def two_sum(numbers, target):
    left, right = 0, len(numbers) - 1
    while left < right:
        s = numbers[left] + numbers[right]
        if s == target:
            return [left + 1, right + 1]
        if s < target:
            left += 1     # 和を大きくしたい
        else:
            right -= 1    # 和を小さくしたい
    return []`

type View = { cells: Cell[]; pointers: Pointer[] }

function trace(nums: number[], target: number): Frame<View>[] {
  const frames: Frame<View>[] = []
  const snap = (
    left: number,
    right: number,
    line: number | number[],
    note: string,
    opts: { sum?: number; hit?: boolean; finished?: boolean } = {},
  ) => {
    const cells: Cell[] = nums.map((v, i) => {
      let state: Cell['state'] = 'idle'
      if (i < left || i > right) state = 'dim'
      if (i === left || i === right) state = opts.hit ? 'good' : 'active'
      return { value: v, state }
    })
    frames.push({
      line,
      note,
      vars: {
        left,
        right,
        target,
        sum: opts.sum ?? '−',
        判定: opts.sum === undefined ? '−' : opts.sum === target ? '=' : opts.sum < target ? '<' : '>',
      },
      view: {
        cells,
        pointers: [
          { name: 'left', index: left, tone: 'accent' },
          { name: 'right', index: right, side: 'bottom', tone: 'warn' },
        ],
      },
      done: opts.finished,
    })
  }

  let left = 0
  let right = nums.length - 1
  snap(left, right, 2, `昇順ソート済みが前提。両端にポインタを置く`)

  let guard = 0
  while (left < right && guard++ < 200) {
    const sum = nums[left]! + nums[right]!
    snap(left, right, [3, 4], `sum = ${nums[left]} + ${nums[right]} = ${sum}`, { sum })
    if (sum === target) {
      snap(left, right, [5, 6], `sum == target。答えは 1-indexed で [${left + 1}, ${right + 1}]`, {
        sum,
        hit: true,
        finished: true,
      })
      return frames
    }
    if (sum < target) {
      snap(left, right, [7, 8], `sum(${sum}) < target(${target})。右端を縮めても和は減るだけ。left を右へ`, { sum })
      left += 1
    } else {
      snap(left, right, [9, 10], `sum(${sum}) > target(${target})。左端を進めても和は増えるだけ。right を左へ`, { sum })
      right -= 1
    }
  }
  snap(left, right, 11, '交差した。条件を満たすペアは無い', { finished: true })
  return frames
}

const PRESETS = [
  { name: '[2,7,11,15] t=9', value: { a: '2, 7, 11, 15', t: 9 } },
  { name: '[1,3,4,5,7,11] t=9', value: { a: '1, 3, 4, 5, 7, 11', t: 9 } },
  { name: '[2,3,4] t=6', value: { a: '2, 3, 4', t: 6 } },
  { name: '解なし', value: { a: '1, 2, 3, 4', t: 100 } },
]

export default function TwoSumII() {
  const [raw, setRaw] = useState('1, 3, 4, 5, 7, 11')
  const [target, setTarget] = useState(9)
  const nums = useMemo(() => parseNums(raw, [1, 3, 4, 5, 7, 11]).slice(0, 12).sort((a, b) => a - b), [raw])
  const frames = useMemo(() => trace(nums, target), [nums, target])

  return (
    <SimShell
      title="Two Sum II（ソート済み配列・逆方向 Two Pointers）"
      subtitle="和が目標より小さければ left を進め、大きければ right を戻す。O(N)"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="numbers =" value={raw} onChange={setRaw} width={190} />
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
          <LegendItem state="active">注目中</LegendItem>
          <LegendItem state="dim">探索範囲外</LegendItem>
          <LegendItem state="good">答え</LegendItem>
        </>
      }
    >
      {(f) => <ArrayView cells={f.view.cells} pointers={f.view.pointers} />}
    </SimShell>
  )
}
