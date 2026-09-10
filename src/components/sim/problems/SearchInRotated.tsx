import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl, TextControl, parseNums } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[lo] <= nums[mid]:               # 左半分がソート済み
            if nums[lo] <= target < nums[mid]:
                hi = mid - 1                    # 答えは左半分
            else:
                lo = mid + 1
        else:                                   # 右半分がソート済み
            if nums[mid] < target <= nums[hi]:
                lo = mid + 1                    # 答えは右半分
            else:
                hi = mid - 1
    return -1`

type View = { cells: Cell[]; pointers: Pointer[] }

function trace(nums: number[], target: number): Frame<View>[] {
  const frames: Frame<View>[] = []

  const snap = (
    lo: number,
    hi: number,
    mid: number | null,
    line: number | number[],
    note: string,
    opts: { sortedHalf?: [number, number]; hit?: boolean; finished?: boolean } = {},
  ) => {
    const cells: Cell[] = nums.map((v, i) => {
      let state: Cell['state'] = 'idle'
      if (i < lo || i > hi) state = 'dim'
      if (opts.sortedHalf && i >= opts.sortedHalf[0] && i <= opts.sortedHalf[1]) state = 'window'
      if (i === mid) state = opts.hit ? 'good' : 'active'
      return { value: v, state }
    })
    const pointers: Pointer[] = [
      { name: 'lo', index: lo, tone: 'accent' },
      { name: 'hi', index: hi, tone: 'warn' },
    ]
    if (mid !== null) pointers.push({ name: 'mid', index: mid, side: 'bottom', tone: 'ok' })
    frames.push({
      line,
      note,
      vars: {
        target,
        lo,
        hi,
        mid: mid ?? '−',
        'nums[mid]': mid === null ? '−' : nums[mid]!,
      },
      view: { cells, pointers },
      done: opts.finished,
    })
  }

  let lo = 0
  let hi = nums.length - 1
  snap(lo, hi, null, 2, '全体を探索範囲にする。回転していても「どちらか半分は必ずソート済み」が使える')

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    snap(lo, hi, mid, [3, 4], `mid = (${lo} + ${hi}) // 2 = ${mid}、nums[mid] = ${nums[mid]}`)
    if (nums[mid] === target) {
      snap(lo, hi, mid, [5, 6], `nums[${mid}] == target。index ${mid} が答え`, { hit: true, finished: true })
      return frames
    }
    if (nums[lo]! <= nums[mid]!) {
      snap(lo, hi, mid, 7, `nums[lo]=${nums[lo]} <= nums[mid]=${nums[mid]} なので【左半分 [${lo}, ${mid}] がソート済み】`, {
        sortedHalf: [lo, mid],
      })
      if (nums[lo]! <= target && target < nums[mid]!) {
        snap(lo, hi, mid, [8, 9], `target=${target} はソート済みの左半分の範囲内。右を捨てる`, {
          sortedHalf: [lo, mid],
        })
        hi = mid - 1
      } else {
        snap(lo, hi, mid, [10, 11], `target=${target} は左半分の範囲外。左を捨てる`, {
          sortedHalf: [lo, mid],
        })
        lo = mid + 1
      }
    } else {
      snap(lo, hi, mid, 12, `nums[lo]=${nums[lo]} > nums[mid]=${nums[mid]} なので【右半分 [${mid}, ${hi}] がソート済み】`, {
        sortedHalf: [mid, hi],
      })
      if (nums[mid]! < target && target <= nums[hi]!) {
        snap(lo, hi, mid, [13, 14], `target=${target} はソート済みの右半分の範囲内。左を捨てる`, {
          sortedHalf: [mid, hi],
        })
        lo = mid + 1
      } else {
        snap(lo, hi, mid, [15, 16], `target=${target} は右半分の範囲外。右を捨てる`, {
          sortedHalf: [mid, hi],
        })
        hi = mid - 1
      }
    }
  }
  snap(Math.max(lo, 0), Math.max(hi, 0), null, 17, `lo > hi。target=${target} は存在しない。-1 を返す`, {
    finished: true,
  })
  return frames
}

const PRESETS = [
  { name: '[4,5,6,7,0,1,2] t=0', value: { a: '4, 5, 6, 7, 0, 1, 2', t: 0 } },
  { name: 't=5（左半分）', value: { a: '4, 5, 6, 7, 0, 1, 2', t: 5 } },
  { name: '回転なし', value: { a: '1, 2, 3, 4, 5, 6, 7', t: 6 } },
  { name: '見つからない', value: { a: '4, 5, 6, 7, 0, 1, 2', t: 3 } },
]

export default function SearchInRotated() {
  const [raw, setRaw] = useState('4, 5, 6, 7, 0, 1, 2')
  const [target, setTarget] = useState(0)
  const nums = useMemo(() => parseNums(raw, [4, 5, 6, 7, 0, 1, 2]).slice(0, 12), [raw])
  const frames = useMemo(() => trace(nums, target), [nums, target])

  return (
    <SimShell
      title="Search in Rotated Sorted Array（回転配列の二分探索）"
      subtitle="mid で切ると必ず片側はソート済み。そこに target が入るかで捨てる側を決める"
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
          <LegendItem state="window">ソート済みと判明した半分</LegendItem>
          <LegendItem state="active">mid</LegendItem>
          <LegendItem state="dim">捨てた範囲</LegendItem>
          <LegendItem state="good">答え</LegendItem>
        </>
      }
    >
      {(f) => <ArrayView cells={f.view.cells} pointers={f.view.pointers} />}
    </SimShell>
  )
}
