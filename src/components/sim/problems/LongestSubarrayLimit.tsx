import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl, TextControl, parseNums } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `from collections import deque

def longest_subarray(nums, limit):
    max_dq, min_dq = deque(), deque()   # max_dq は減少順、min_dq は増加順
    left = 0
    best = 0
    for right, x in enumerate(nums):
        while max_dq and max_dq[-1] < x:
            max_dq.pop()
        max_dq.append(x)
        while min_dq and min_dq[-1] > x:
            min_dq.pop()
        min_dq.append(x)
        while max_dq[0] - min_dq[0] > limit:
            if max_dq[0] == nums[left]:
                max_dq.popleft()
            if min_dq[0] == nums[left]:
                min_dq.popleft()
            left += 1                   # 条件を満たすまで左を縮める
        best = max(best, right - left + 1)
    return best`

type View = { cells: Cell[]; pointers: Pointer[]; maxDq: Cell[]; minDq: Cell[]; best: number }

function trace(nums: number[], limit: number): Frame<View>[] {
  const maxDq: number[] = []
  const minDq: number[] = []
  const frames: Frame<View>[] = []
  let left = 0
  let best = 0

  const snap = (
    line: number | number[],
    note: string,
    opts: { right?: number; kick?: 'max' | 'min' | 'both'; hit?: boolean; finished?: boolean } = {},
  ) => {
    const right = opts.right ?? -1
    const cells: Cell[] = nums.map((v, j) => {
      let state: Cell['state'] = 'idle'
      if (j > right) state = 'idle'
      else if (j < left) state = 'dim'
      else state = opts.hit ? 'good' : 'window'
      if (j === right && right >= 0) state = 'active'
      return { value: v, state }
    })
    const pointers: Pointer[] = []
    if (right >= 0) {
      pointers.push({ name: 'right', index: right, tone: 'accent' })
      pointers.push({ name: 'left', index: left, side: 'bottom', tone: 'warn' })
    }
    const dqCells = (dq: number[], kicked: boolean): Cell[] =>
      dq.map((v, p) => ({
        value: v,
        state: p === 0 ? (kicked ? 'bad' : 'active') : 'window',
      }))
    frames.push({
      line,
      note,
      vars: {
        left,
        right: right < 0 ? '−' : right,
        最大: maxDq.length ? maxDq[0]! : '−',
        最小: minDq.length ? minDq[0]! : '−',
        差: maxDq.length ? maxDq[0]! - minDq[0]! : '−',
        best,
      },
      view: {
        cells,
        pointers,
        maxDq: dqCells(maxDq, opts.kick === 'max' || opts.kick === 'both'),
        minDq: dqCells(minDq, opts.kick === 'min' || opts.kick === 'both'),
        best,
      },
      done: opts.finished,
    })
  }

  snap([4, 5, 6], `窓の中の最大値を取り出す max_dq と、最小値を取り出す min_dq を2本持つ。窓の「最大 − 最小」が limit = ${limit} 以下である限り、窓を伸ばせる`)

  for (let right = 0; right < nums.length; right++) {
    const x = nums[right]!
    snap(7, `right = ${right}、値は ${x}。まず2本のキューに入れる`, { right })

    while (maxDq.length > 0 && maxDq[maxDq.length - 1]! < x) {
      snap([8, 9], `max_dq の末尾 ${maxDq[maxDq.length - 1]} は ${x} より小さい。これから先の窓では最大になれないので捨てる`, { right })
      maxDq.pop()
    }
    maxDq.push(x)
    while (minDq.length > 0 && minDq[minDq.length - 1]! > x) {
      snap([11, 12], `min_dq の末尾 ${minDq[minDq.length - 1]} は ${x} より大きい。これから先の窓では最小になれないので捨てる`, { right })
      minDq.pop()
    }
    minDq.push(x)
    snap([10, 13], `max_dq = [${maxDq.join(', ')}] / min_dq = [${minDq.join(', ')}]。窓の最大は ${maxDq[0]}、最小は ${minDq[0]}`, { right })

    while (maxDq[0]! - minDq[0]! > limit) {
      const l = nums[left]!
      const kickMax = maxDq[0] === l
      const kickMin = minDq[0] === l
      snap([14, 15, 17], `最大 ${maxDq[0]} − 最小 ${minDq[0]} = ${maxDq[0]! - minDq[0]!} が limit ${limit} を超えた。左端 nums[${left}] = ${l} を窓から外す`, {
        right,
        kick: kickMax && kickMin ? 'both' : kickMax ? 'max' : kickMin ? 'min' : undefined,
      })
      if (kickMax) maxDq.shift()
      if (kickMin) minDq.shift()
      left++
      snap(19, `left = ${left}。外した値がキューの先頭だったときだけ、キューからも取り除く`, { right })
    }

    const len = right - left + 1
    if (len > best) {
      best = len
      snap(20, `窓 [${left}, ${right}] は条件を満たしていて長さ ${len}。best を更新`, { right, hit: true })
    } else {
      snap(20, `窓 [${left}, ${right}] の長さは ${len}。best = ${best} は更新しない`, { right })
    }
  }
  snap(21, `完了。条件を満たす最長の窓の長さは ${best}`, { right: nums.length - 1, finished: true })
  return frames
}

const PRESETS = [
  { name: 'LC1438の例', value: '8, 2, 4, 7' },
  { name: '長く伸びる', value: '10, 1, 2, 4, 7, 2' },
  { name: '同じ値が続く', value: '4, 2, 2, 2, 4, 4, 2, 2' },
]

export default function LongestSubarrayLimit() {
  const [raw, setRaw] = useState('8, 2, 4, 7')
  const [limit, setLimit] = useState(4)
  const nums = useMemo(() => parseNums(raw, [8, 2, 4, 7]).slice(0, 9), [raw])
  const frames = useMemo(() => trace(nums, limit), [nums, limit])

  return (
    <SimShell
      title="Longest Subarray with Limit（単調キュー2本 + 可変長ウィンドウ）"
      subtitle="窓の最大と最小を O(1) で引けるようにして、Sliding Window の伸縮をそのまま回す"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="nums =" value={raw} onChange={setRaw} width={200} />
          <NumberControl label="limit =" value={limit} onChange={setLimit} min={0} max={20} />
          <PresetControl presets={PRESETS} onPick={setRaw} />
        </>
      }
      legend={
        <>
          <LegendItem state="window">いまの窓</LegendItem>
          <LegendItem state="active">right / キューの先頭</LegendItem>
          <LegendItem state="bad">先頭を取り除く</LegendItem>
          <LegendItem state="good">best を更新した窓</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-4">
          <ArrayView cells={f.view.cells} pointers={f.view.pointers} />
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                max_dq（減少順。先頭が窓の最大）
              </p>
              <ArrayView cells={f.view.maxDq} showIndex={false} size={40} />
            </div>
            <div>
              <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                min_dq（増加順。先頭が窓の最小）
              </p>
              <ArrayView cells={f.view.minDq} showIndex={false} size={40} />
            </div>
          </div>
        </div>
      )}
    </SimShell>
  )
}
