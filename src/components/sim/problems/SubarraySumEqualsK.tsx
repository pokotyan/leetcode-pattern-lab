import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl, TextControl, parseNums } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def subarray_sum(nums, k):
    count = 0
    cur = 0
    seen = {0: 1}          # 累積和 -> 出現回数（まだ何も足してない=0 が1回）
    for num in nums:
        cur += num
        # cur - k がこれまでに出ていれば、そこから今までが合計kの部分配列
        count += seen.get(cur - k, 0)
        seen[cur] = seen.get(cur, 0) + 1
    return count`

type View = { cells: Cell[]; pointers: Pointer[]; seen: [number, number][] }

function trace(nums: number[], k: number): Frame<View>[] {
  const frames: Frame<View>[] = []
  const seen = new Map<number, number>([[0, 1]])
  let cur = 0
  let count = 0

  const snap = (
    right: number,
    line: number | number[],
    note: string,
    opts: { hitFrom?: number; finished?: boolean } = {},
  ) => {
    const cells: Cell[] = nums.map((v, i) => {
      let state: Cell['state'] = 'idle'
      if (i <= right) state = 'window'
      if (i === right) state = 'active'
      if (opts.hitFrom !== undefined && i > opts.hitFrom && i <= right) state = 'good'
      return { value: v, state }
    })
    frames.push({
      line,
      note,
      vars: { k, cur, 'cur - k': cur - k, count },
      view: {
        cells,
        pointers: right >= 0 ? [{ name: 'i', index: right, tone: 'accent' }] : [],
        seen: [...seen.entries()].sort((a, b) => a[0] - b[0]),
      },
      done: opts.finished,
    })
  }

  snap(-1, 3, `cur = 0（まだ何も足していない）。seen = {0: 1} で初期化しておく。これが後で「先頭からの部分配列」も数えられる理由になる`)

  for (let i = 0; i < nums.length; i++) {
    cur += nums[i]!
    snap(i, [5, 6], `nums[${i}]=${nums[i]} を足して cur = ${cur}`)
    const need = cur - k
    const hits = seen.get(need) ?? 0
    if (hits > 0) {
      snap(i, [7, 8], `cur - k = ${need} は過去に ${hits} 回出現している。そこから今までの部分配列が k になる。count += ${hits}`, {
        hitFrom: undefined,
      })
      count += hits
    } else {
      snap(i, [7, 8], `cur - k = ${need} はまだ一度も出ていない。今回は加算なし`)
    }
    seen.set(cur, (seen.get(cur) ?? 0) + 1)
    snap(i, 9, `cur = ${cur} の出現回数を記録しておく（seen[${cur}] = ${seen.get(cur)}）`)
  }
  snap(nums.length - 1, 10, `全部見終わった。合計が ${k} になる部分配列は ${count} 個`, { finished: true })
  return frames
}

const PRESETS = [
  { name: '[1,1,1] k=2', value: { a: '1, 1, 1', k: 2 } },
  { name: '[1,2,3] k=3', value: { a: '1, 2, 3', k: 3 } },
  { name: '負の数を含む', value: { a: '3, 4, -7, 1, 3, 3, 1, -4', k: 7 } },
]

export default function SubarraySumEqualsK() {
  const [raw, setRaw] = useState('1, 2, 3')
  const [k, setK] = useState(3)
  const nums = useMemo(() => parseNums(raw, [1, 2, 3]).slice(0, 10), [raw])
  const frames = useMemo(() => trace(nums, k), [nums, k])

  return (
    <SimShell
      title="Subarray Sum Equals K（累積和 + ハッシュテーブル）"
      subtitle="Sliding Window が使えない場面（負の数あり）で、累積和とハッシュテーブルを組み合わせる"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="nums =" value={raw} onChange={setRaw} width={190} />
          <NumberControl label="k =" value={k} onChange={setK} />
          <PresetControl
            presets={PRESETS}
            onPick={(v) => {
              setRaw(v.a)
              setK(v.k)
            }}
          />
        </>
      }
      legend={
        <>
          <LegendItem state="window">これまで見た範囲</LegendItem>
          <LegendItem state="active">今見ている要素</LegendItem>
        </>
      }
    >
      {(f) => (
        <div>
          <ArrayView cells={f.view.cells} pointers={f.view.pointers} />
          <div className="mt-3 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            seen = {'{'}
            {f.view.seen.map(([k2, v], i) => (
              <span key={k2}>
                {i > 0 && ', '}
                {k2}: {v}
              </span>
            ))}
            {'}'}
          </div>
        </div>
      )}
    </SimShell>
  )
}
