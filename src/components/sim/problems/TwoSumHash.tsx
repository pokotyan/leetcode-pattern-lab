import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl, TextControl, parseNums } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def two_sum(nums, target):
    seen = {}                      # 値 -> index
    for i, num in enumerate(nums):
        need = target - num
        if need in seen:
            return [seen[need], i]  # 探していた相手が過去に見つかっていた
        seen[num] = i               # 今の値も、将来の相手のために記録しておく
    return []`

type View = { cells: Cell[]; pointers: Pointer[]; seen: [number, number][] }

function trace(nums: number[], target: number): Frame<View>[] {
  const frames: Frame<View>[] = []
  const seen = new Map<number, number>()

  const snap = (
    i: number,
    line: number | number[],
    note: string,
    opts: { hitIdx?: number; finished?: boolean } = {},
  ) => {
    const cells: Cell[] = nums.map((v, k) => {
      let state: Cell['state'] = 'idle'
      if (k < i) state = 'dim'
      if (k === i) state = 'active'
      if (opts.hitIdx !== undefined && (k === opts.hitIdx || k === i)) state = 'good'
      return { value: v, state }
    })
    frames.push({
      line,
      note,
      vars: { target, i, num: nums[i] ?? '−', need: nums[i] !== undefined ? target - nums[i]! : '−' },
      view: {
        cells,
        pointers: i >= 0 ? [{ name: 'i', index: i, tone: 'accent' }] : [],
        seen: [...seen.entries()],
      },
      done: opts.finished,
    })
  }

  snap(-1, 2, `seen という辞書を用意する。「この値はもう見た」を覚えておくための場所`)
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i]!
    snap(i, [3, 4], `i=${i}: nums[${i}]=${nums[i]}。あと ${need} があれば target=${target} になる`)
    if (seen.has(need)) {
      const j = seen.get(need)!
      snap(i, [5, 6], `need=${need} は index ${j} で見たことがある。[${j}, ${i}] が答え`, {
        hitIdx: j,
        finished: true,
      })
      return frames
    }
    snap(i, [5, 6], `need=${need} はまだ見ていない`)
    seen.set(nums[i]!, i)
    snap(i, 7, `今の値 nums[${i}]=${nums[i]} を、将来のペアのために記録しておく`)
  }
  snap(nums.length - 1, 8, `見つからなかった`, { finished: true })
  return frames
}

const PRESETS = [
  { name: '[2,7,11,15] t=9', value: { a: '2, 7, 11, 15', t: 9 } },
  { name: '同じ値のペア', value: { a: '3, 2, 4', t: 6 } },
  { name: '[3,3] t=6', value: { a: '3, 3', t: 6 } },
]

export default function TwoSumHash() {
  const [raw, setRaw] = useState('2, 7, 11, 15')
  const [target, setTarget] = useState(9)
  const nums = useMemo(() => parseNums(raw, [2, 7, 11, 15]).slice(0, 12), [raw])
  const frames = useMemo(() => trace(nums, target), [nums, target])

  return (
    <SimShell
      title="Two Sum（ハッシュテーブルで1パス）"
      subtitle="ソートされていなくても、探しながら覚えていけば O(N) で解ける"
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
          <LegendItem state="active">今見ている要素</LegendItem>
          <LegendItem state="dim">通り過ぎた要素</LegendItem>
          <LegendItem state="good">答えのペア</LegendItem>
        </>
      }
    >
      {(f) => (
        <div>
          <ArrayView cells={f.view.cells} pointers={f.view.pointers} />
          <div className="mt-3 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            seen = {'{'}
            {f.view.seen.map(([k, v], i) => (
              <span key={k}>
                {i > 0 && ', '}
                {k}: {v}
              </span>
            ))}
            {'}'}
          </div>
        </div>
      )}
    </SimShell>
  )
}
