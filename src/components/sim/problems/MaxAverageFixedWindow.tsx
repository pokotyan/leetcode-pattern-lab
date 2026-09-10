import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl, TextControl, parseNums } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def find_max_average(nums, k):
    cur = sum(nums[:k])        # 最初のウィンドウ
    best = cur
    for i in range(k, len(nums)):
        cur += nums[i]         # 右端を入れる
        cur -= nums[i - k]     # 左端を出す
        best = max(best, cur)
    return best / k`

type View = { cells: Cell[]; pointers: Pointer[] }

function trace(nums: number[], k: number): Frame<View>[] {
  const frames: Frame<View>[] = []
  const snap = (
    l: number,
    r: number,
    line: number | number[],
    note: string,
    cur: number,
    best: number,
    opts: { enter?: number; leave?: number; finished?: boolean } = {},
  ) => {
    const cells: Cell[] = nums.map((v, i) => {
      let state: Cell['state'] = 'idle'
      if (i >= l && i <= r) state = 'window'
      if (i === opts.enter) state = 'active'
      if (i === opts.leave) state = 'bad'
      return { value: v, state }
    })
    frames.push({
      line,
      note,
      vars: { k, window: `[${l}, ${r}]`, cur, best, avg: (best / k).toFixed(2) },
      view: {
        cells,
        pointers: [
          { name: 'L', index: l, tone: 'accent' },
          { name: 'R', index: r, side: 'bottom', tone: 'warn' },
        ],
      },
      done: opts.finished,
    })
  }

  let cur = nums.slice(0, k).reduce((a, b) => a + b, 0)
  let best = cur
  snap(0, k - 1, [2, 3], `最初の k=${k} 個の和を作る。cur = ${cur}`, cur, best)

  for (let i = k; i < nums.length; i++) {
    cur += nums[i]!
    snap(i - k, i, 5, `右端 nums[${i}]=${nums[i]} を足す → cur = ${cur}（一時的に幅 k+1）`, cur, best, {
      enter: i,
    })
    cur -= nums[i - k]!
    snap(i - k + 1, i, 6, `左端 nums[${i - k}]=${nums[i - k]} を引く → cur = ${cur}。幅が k に戻った`, cur, best, {
      leave: i - k,
    })
    const prev = best
    best = Math.max(best, cur)
    snap(
      i - k + 1,
      i,
      7,
      best > prev ? `best 更新: ${prev} → ${best}` : `cur(${cur}) は best(${best}) 以下。更新なし`,
      cur,
      best,
    )
  }
  snap(nums.length - k, nums.length - 1, 8, `最大和 ${best}、平均 ${(best / k).toFixed(4)}`, cur, best, {
    finished: true,
  })
  return frames
}

const PRESETS = [
  { name: '[1,12,-5,-6,50,3] k=4', value: { a: '1, 12, -5, -6, 50, 3', k: 4 } },
  { name: '[7,1,5,9,6,4] k=3', value: { a: '7, 1, 5, 9, 6, 4', k: 3 } },
  { name: 'k=1', value: { a: '5, -3, 8, 2', k: 1 } },
]

export default function MaxAverageFixedWindow() {
  const [raw, setRaw] = useState('7, 1, 5, 9, 6, 4')
  const [k, setK] = useState(3)
  const nums = useMemo(() => parseNums(raw, [7, 1, 5, 9, 6, 4]).slice(0, 12), [raw])
  const kk = Math.max(1, Math.min(k, nums.length))
  const frames = useMemo(() => trace(nums, kk), [nums, kk])

  return (
    <SimShell
      title="Maximum Average Subarray I（固定長 Sliding Window）"
      subtitle="1つ入れて1つ出す。毎回 k 個を足し直さないので O(N)"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="nums =" value={raw} onChange={setRaw} width={190} />
          <NumberControl label="k =" value={k} onChange={setK} min={1} />
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
          <LegendItem state="window">ウィンドウ内</LegendItem>
          <LegendItem state="active">今入れた要素</LegendItem>
          <LegendItem state="bad">今出した要素</LegendItem>
        </>
      }
    >
      {(f) => <ArrayView cells={f.view.cells} pointers={f.view.pointers} />}
    </SimShell>
  )
}
