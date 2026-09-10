import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl, TextControl, parseNums } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `import heapq

def find_kth_largest(nums, k):
    heap = []
    for num in nums:
        heapq.heappush(heap, num)
        if len(heap) > k:
            heapq.heappop(heap)     # 一番小さいものを追い出す
    return heap[0]                  # heap のトップが k 番目に大きい`

type View = { cells: Cell[]; pointers: Pointer[]; input: Cell[] }

function trace(nums: number[], k: number): Frame<View>[] {
  const frames: Frame<View>[] = []
  const heap: number[] = []

  const snap = (
    i: number,
    line: number | number[],
    note: string,
    opts: { popped?: number; finished?: boolean } = {},
  ) => {
    const sorted = [...heap].sort((a, b) => a - b)
    const cells: Cell[] = sorted.map((v, idx) => ({
      value: v,
      state: idx === 0 && sorted.length === k ? 'window' : 'idle',
    }))
    const inputCells: Cell[] = nums.map((v, idx) => ({
      value: v,
      state: idx === i ? 'active' : idx < i ? 'dim' : 'idle',
    }))
    frames.push({
      line,
      note,
      vars: { k, 'len(heap)': heap.length, popped: opts.popped ?? '−' },
      view: { cells, pointers: [], input: inputCells },
      done: opts.finished,
    })
  }

  snap(-1, 4, `サイズが k=${k} を超えたら一番小さいものを追い出す、という「size-k の最小ヒープ」を使う`)
  for (let i = 0; i < nums.length; i++) {
    heap.push(nums[i]!)
    snap(i, [5, 6], `${nums[i]} を追加。現在 ${heap.length} 個`)
    if (heap.length > k) {
      const minV = Math.min(...heap)
      heap.splice(heap.indexOf(minV), 1)
      snap(i, [7, 8], `k=${k} を超えたので、一番小さい ${minV} を追い出す。これで「上位 k 個」だけが残り続ける`, {
        popped: minV,
      })
    }
  }
  const ans = Math.min(...heap)
  snap(nums.length - 1, 9, `全部見終わった。残った ${k} 個のうち一番小さいもの（= ヒープのトップ）が、k 番目に大きい値。答えは ${ans}`, {
    finished: true,
  })
  return frames
}

const PRESETS = [
  { name: '[3,2,1,5,6,4] k=2', value: { a: '3, 2, 1, 5, 6, 4', k: 2 } },
  { name: '[3,2,3,1,2,4,5,5,6] k=4', value: { a: '3, 2, 3, 1, 2, 4, 5, 5, 6', k: 4 } },
  { name: 'k=1（単純に最大値）', value: { a: '9, 3, 7, 1', k: 1 } },
]

export default function KthLargestHeap() {
  const [raw, setRaw] = useState('3, 2, 1, 5, 6, 4')
  const [k, setK] = useState(2)
  const nums = useMemo(() => parseNums(raw, [3, 2, 1, 5, 6, 4]).slice(0, 12), [raw])
  const kk = Math.max(1, Math.min(k, nums.length))
  const frames = useMemo(() => trace(nums, kk), [nums, kk])

  return (
    <SimShell
      title="Kth Largest Element in an Array（サイズ k のヒープ）"
      subtitle="全部ソートせず、「上位 k 個だけ」を常に保つ。表示は分かりやすいよう昇順に並べ替えている"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="nums =" value={raw} onChange={setRaw} width={220} />
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
          <LegendItem state="active">今追加した値</LegendItem>
          <LegendItem state="window">ヒープの先頭（次に追い出される候補）</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <div>
            <p className="mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              入力を左から見ていく
            </p>
            <ArrayView cells={f.view.input} showIndex={false} size={34} />
          </div>
          <div>
            <p className="mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              heap（サイズ上限 k、昇順に表示）
            </p>
            <ArrayView cells={f.view.cells} showIndex={false} size={38} />
          </div>
        </div>
      )}
    </SimShell>
  )
}
