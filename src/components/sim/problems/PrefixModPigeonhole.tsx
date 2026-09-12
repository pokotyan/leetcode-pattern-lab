import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl, TextControl, parseNums } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def check_subarray_sum(nums, k):
    seen = {0: -1}                 # 余り -> それが最初に出た位置
    total = 0
    for i, x in enumerate(nums):
        total = (total + x) % k    # 余りは k 通りしかない
        if total in seen:
            if i - seen[total] >= 2:
                return True        # 同じ余りが2回 = その間の和が k の倍数
        else:
            seen[total] = i
    return False`

type View = { cells: Cell[]; pointers: Pointer[]; slots: Cell[]; k: number; verdict: string }

function trace(nums: number[], k: number): Frame<View>[] {
  const frames: Frame<View>[] = []
  const seen = new Map<number, number>([[0, -1]])
  let total = 0

  const snap = (
    line: number | number[],
    note: string,
    opts: { i?: number; rem?: number; hitFrom?: number; verdict?: string; finished?: boolean } = {},
  ) => {
    const cells: Cell[] = nums.map((v, j) => {
      let state: Cell['state'] = 'idle'
      if (opts.i !== undefined && j < opts.i) state = 'dim'
      if (opts.hitFrom !== undefined && opts.i !== undefined && j > opts.hitFrom && j <= opts.i)
        state = 'good'
      if (j === opts.i) state = opts.verdict ? 'good' : 'active'
      return { value: v, state }
    })
    const slots: Cell[] = Array.from({ length: k }, (_, r) => {
      const at = seen.get(r)
      let state: Cell['state'] = at === undefined ? 'idle' : 'window'
      if (r === opts.rem) state = opts.hitFrom !== undefined ? 'good' : 'active'
      return {
        value: at === undefined ? '·' : at,
        state,
        note: `余り${r}`,
      }
    })
    const pointers: Pointer[] =
      opts.i !== undefined ? [{ name: 'i', index: opts.i, tone: 'accent' }] : []
    frames.push({
      line,
      note,
      vars: { k, 余りの種類: k, 埋まった箱: seen.size, いまの余り: opts.rem ?? '−' },
      view: { cells, pointers, slots, k, verdict: opts.verdict ?? '' },
      done: opts.finished,
    })
  }

  snap(2, `余りは 0 から ${k - 1} までの ${k} 通りしかない。累積和の余りを、この ${k} 個の箱のどれかに入れていく。箱より多く入れれば、必ずどこかが重なる`)

  for (let i = 0; i < nums.length; i++) {
    total = (((total + nums[i]!) % k) + k) % k
    if (seen.has(total)) {
      const from = seen.get(total)!
      if (i - from >= 2) {
        snap([6, 7, 8], `余り ${total} は位置 ${from} でも出ていた。同じ余りが2回出たということは、その間の和が ${k} の倍数。長さ ${i - from} の部分配列が見つかった`, {
          i,
          rem: total,
          hitFrom: from,
          verdict: 'True',
          finished: true,
        })
        return frames
      }
      snap([6, 7], `余り ${total} は位置 ${from} でも出ているが、間が ${i - from} 個しかない。長さ2以上という条件を満たさないので採用しない`, {
        i,
        rem: total,
      })
    } else {
      seen.set(total, i)
      snap([5, 10], `位置 ${i} までの累積和を ${k} で割った余りは ${total}。この箱は空だったので、位置 ${i} を記録する`, {
        i,
        rem: total,
      })
    }
  }
  snap(11, `最後まで同じ余りの組が見つからなかった`, { verdict: 'False', finished: true })
  return frames
}

const PRESETS = [
  { name: '[23,2,4,6,7] k=6', value: { nums: '23, 2, 4, 6, 7', k: 6 } },
  { name: '[23,2,6,4,7] k=13', value: { nums: '23, 2, 6, 4, 7', k: 13 } },
  { name: '見つからない', value: { nums: '1, 2, 3', k: 7 } },
]

export default function PrefixModPigeonhole() {
  const [raw, setRaw] = useState('23, 2, 4, 6, 7')
  const [k, setK] = useState(6)
  const nums = useMemo(() => parseNums(raw, [23, 2, 4, 6, 7]).slice(0, 8), [raw])
  const kk = Math.min(Math.max(Math.trunc(k), 2), 14)
  const frames = useMemo(() => trace(nums, kk), [nums, kk])

  return (
    <SimShell
      title="鳩の巣原理で「必ず存在する」を保証する"
      subtitle="累積和の余りは k 通りしかない。k+1 個入れればどこかが必ず重なり、その間の和は k の倍数"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="nums =" value={raw} onChange={setRaw} width={180} />
          <NumberControl label="k =" value={k} onChange={setK} min={2} max={14} />
          <PresetControl
            presets={PRESETS}
            onPick={(v) => {
              setRaw(v.nums)
              setK(v.k)
            }}
          />
        </>
      }
      legend={
        <>
          <LegendItem state="active">いま見ている要素 / いまの余り</LegendItem>
          <LegendItem state="window">すでに埋まっている箱</LegendItem>
          <LegendItem state="good">条件を満たす部分配列</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-4">
          <ArrayView cells={f.view.cells} pointers={f.view.pointers} size={44} />
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              余りの箱（中の数字は、その余りが最初に出た位置）
            </p>
            <ArrayView cells={f.view.slots} showIndex={false} size={44} />
          </div>
          {f.view.verdict && (
            <p className="m-0 font-mono text-sm" style={{ color: f.view.verdict === 'True' ? 'var(--ok)' : 'var(--danger)' }}>
              {f.view.verdict}
            </p>
          )}
        </div>
      )}
    </SimShell>
  )
}
