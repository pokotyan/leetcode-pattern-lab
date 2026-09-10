import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl, TextControl, parseNums } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def three_sum(nums):
    nums.sort()
    res = []
    for i in range(len(nums)):
        if i > 0 and nums[i] == nums[i - 1]:
            continue                       # i の重複をスキップ
        left, right = i + 1, len(nums) - 1
        while left < right:
            s = nums[i] + nums[left] + nums[right]
            if s < 0:
                left += 1
            elif s > 0:
                right -= 1
            else:
                res.append([nums[i], nums[left], nums[right]])
                left += 1
                while left < right and nums[left] == nums[left - 1]:
                    left += 1              # left の重複をスキップ
    return res`

type View = { cells: Cell[]; pointers: Pointer[]; res: number[][] }

function trace(input: number[]): Frame<View>[] {
  const nums = [...input].sort((a, b) => a - b)
  const frames: Frame<View>[] = []
  const res: number[][] = []

  const snap = (
    i: number,
    left: number,
    right: number,
    line: number | number[],
    note: string,
    opts: { sum?: number; hit?: boolean; skip?: boolean; finished?: boolean } = {},
  ) => {
    const cells: Cell[] = nums.map((v, k) => {
      let state: Cell['state'] = 'idle'
      if (k < i) state = 'dim'
      if (k === i) state = opts.skip ? 'bad' : 'window'
      if (i >= 0 && k > i && (k < left || k > right)) state = 'dim'
      if (k === left || k === right) state = opts.hit ? 'good' : 'active'
      return { value: v, state }
    })
    const pointers: Pointer[] = []
    if (i >= 0) pointers.push({ name: 'i', index: i, tone: 'ok' })
    if (left >= 0) pointers.push({ name: 'L', index: left, tone: 'accent' })
    if (right >= 0) pointers.push({ name: 'R', index: right, side: 'bottom', tone: 'warn' })
    frames.push({
      line,
      note,
      vars: {
        i,
        left: left < 0 ? '−' : left,
        right: right < 0 ? '−' : right,
        sum: opts.sum ?? '−',
        found: res.length,
      },
      view: { cells, pointers, res: res.map((r) => [...r]) },
      done: opts.finished,
    })
  }

  snap(-1, -1, -1, 2, `まずソート。[${nums.join(', ')}]。ソートで「和が足りない/多い」の向きが確定する`)

  for (let i = 0; i < nums.length; i++) {
    if (i > 0 && nums[i] === nums[i - 1]) {
      snap(i, -1, -1, [5, 6], `nums[${i}]=${nums[i]} は直前と同じ値。同じ三つ組を二重に数えるのでスキップ`, {
        skip: true,
      })
      continue
    }
    let left = i + 1
    let right = nums.length - 1
    snap(i, left, right, [4, 7], `i=${i} (値 ${nums[i]}) に固定。残りを Two Pointers で探す`)

    while (left < right) {
      const sum = nums[i]! + nums[left]! + nums[right]!
      snap(i, left, right, [8, 9], `s = ${nums[i]} + ${nums[left]} + ${nums[right]} = ${sum}`, { sum })
      if (sum < 0) {
        snap(i, left, right, [10, 11], `s < 0。和を増やしたいので left を右へ`, { sum })
        left++
      } else if (sum > 0) {
        snap(i, left, right, [12, 13], `s > 0。和を減らしたいので right を左へ`, { sum })
        right--
      } else {
        res.push([nums[i]!, nums[left]!, nums[right]!])
        snap(i, left, right, [14, 15], `s == 0。[${nums[i]}, ${nums[left]}, ${nums[right]}] を採用`, {
          sum,
          hit: true,
        })
        left++
        while (left < right && nums[left] === nums[left - 1]) {
          snap(i, left, right, [17, 18], `nums[${left}] は直前と同じ値。重複する三つ組になるので left を進める`, {
            sum,
          })
          left++
        }
        snap(i, left, right, 16, `次の候補へ。left=${left}, right=${right}`)
      }
    }
  }
  snap(-1, -1, -1, 19, `完了。答えは ${res.length} 個: ${res.map((r) => `[${r}]`).join(', ') || 'なし'}`, {
    finished: true,
  })
  return frames
}

const PRESETS = [
  { name: '[-1,0,1,2,-1,-4]', value: '-1, 0, 1, 2, -1, -4' },
  { name: '重複多め', value: '-2, 0, 0, 2, 2' },
  { name: '全部0', value: '0, 0, 0, 0' },
  { name: '解なし', value: '1, 2, 3, 4' },
]

export default function ThreeSum() {
  const [raw, setRaw] = useState('-1, 0, 1, 2, -1, -4')
  const nums = useMemo(() => parseNums(raw, [-1, 0, 1, 2, -1, -4]).slice(0, 10), [raw])
  const frames = useMemo(() => trace(nums), [nums])

  return (
    <SimShell
      title="3Sum（ソート + 逆方向 Two Pointers）"
      subtitle="1つ固定して残りを Two Pointers に落とす。重複スキップが肝。O(N²)"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="nums =" value={raw} onChange={setRaw} width={210} />
          <PresetControl presets={PRESETS} onPick={setRaw} />
        </>
      }
      legend={
        <>
          <LegendItem state="window">固定した i</LegendItem>
          <LegendItem state="active">L / R</LegendItem>
          <LegendItem state="good">採用</LegendItem>
          <LegendItem state="bad">重複スキップ</LegendItem>
        </>
      }
    >
      {(f) => (
        <div>
          <ArrayView cells={f.view.cells} pointers={f.view.pointers} />
          <div className="mt-3 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
            res = [
            {f.view.res.map((r, i) => (
              <span key={i} style={{ color: 'var(--ok)' }}>
                {i > 0 && ', '}[{r.join(',')}]
              </span>
            ))}
            ]
          </div>
        </div>
      )}
    </SimShell>
  )
}
