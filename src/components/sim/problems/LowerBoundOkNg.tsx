import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl, TextControl, parseNums } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def lower_bound(nums, x):
    # 条件 P(i): nums[i] >= x
    # ok = 必ず条件を満たす番兵 / ng = 必ず満たさない番兵
    ok, ng = len(nums), -1
    while abs(ok - ng) > 1:
        mid = (ok + ng) // 2
        if nums[mid] >= x:
            ok = mid        # mid は条件を満たす側へ
        else:
            ng = mid        # mid は満たさない側へ
    return ok               # 条件を満たす最小の index`

type View = { cells: Cell[]; pointers: Pointer[] }

/** 番兵を含めて描くため index を +1 ずらす */
function trace(nums: number[], x: number): Frame<View>[] {
  const frames: Frame<View>[] = []
  const n = nums.length

  const snap = (
    ok: number,
    ng: number,
    mid: number | null,
    line: number | number[],
    note: string,
    finished = false,
  ) => {
    const cells: Cell[] = [
      { value: '−∞', state: 'bad' },
      ...nums.map<Cell>((v, i) => {
        let state: Cell['state'] = 'idle'
        // ng より左は「満たさない」確定、ok 以上は「満たす」確定
        if (i <= ng) state = 'bad'
        else if (i >= ok) state = 'good'
        else state = 'idle'
        if (i === mid) state = 'active'
        return { value: v, state, note: `${i}·${v >= x ? 'T' : 'F'}` }
      }),
      { value: '+∞', state: 'good' },
    ]
    const pointers: Pointer[] = [
      { name: 'ng', index: ng + 1, tone: 'danger' },
      { name: 'ok', index: ok + 1, tone: 'ok' },
    ]
    if (mid !== null) pointers.push({ name: 'mid', index: mid + 1, side: 'bottom', tone: 'accent' })
    frames.push({
      line,
      note,
      vars: { x, ok, ng, mid: mid ?? '−', '|ok-ng|': Math.abs(ok - ng) },
      view: { cells, pointers },
      done: finished,
    })
  }

  let ok = n
  let ng = -1
  snap(ok, ng, null, 4, `ok=${n}（範囲外だが必ず条件を満たす扱い）、ng=-1（必ず満たさない）で初期化`)

  while (Math.abs(ok - ng) > 1) {
    const mid = Math.floor((ok + ng) / 2)
    snap(ok, ng, mid, [5, 6], `mid = (${ok} + ${ng}) // 2 = ${mid}`)
    if (nums[mid]! >= x) {
      snap(ok, ng, mid, [7, 8], `nums[${mid}]=${nums[mid]} >= ${x} なので条件を満たす。ok = ${mid}`)
      ok = mid
    } else {
      snap(ok, ng, mid, [9, 10], `nums[${mid}]=${nums[mid]} < ${x} なので満たさない。ng = ${mid}`)
      ng = mid
    }
  }
  const found = ok < n && nums[ok] === x
  snap(
    ok,
    ng,
    null,
    11,
    `ok と ng が隣り合った。答え = ${ok}` +
      (ok === n ? '（配列末尾より後ろ = x 以上の要素は無い）' : `（nums[${ok}]=${nums[ok]}）`) +
      (found ? ` / x=${x} は index ${ok} に存在` : ` / x=${x} 自体は存在しない`),
    true,
  )
  return frames
}

const PRESETS = [
  { name: '[1,3,3,4,4,4,4,19] x=4', value: { a: '1, 3, 3, 4, 4, 4, 4, 19', x: 4 } },
  { name: '存在しない値', value: { a: '1, 3, 5, 7, 9', x: 6 } },
  { name: '全部より大きい', value: { a: '1, 2, 3', x: 99 } },
  { name: '全部より小さい', value: { a: '5, 6, 7', x: 1 } },
]

export default function LowerBoundOkNg() {
  const [raw, setRaw] = useState('1, 3, 3, 4, 4, 4, 4, 19')
  const [x, setX] = useState(4)
  const nums = useMemo(
    () => parseNums(raw, [1, 3, 3, 4, 4, 4, 4, 19]).slice(0, 12).sort((a, b) => a - b),
    [raw],
  )
  const frames = useMemo(() => trace(nums, x), [nums, x])

  return (
    <SimShell
      title="Lower Bound（ok / ng 方式の二分探索）"
      subtitle="「条件を満たす限界」を探す形に統一すると境界バグが消える。セル上の T/F が条件 nums[i] >= x"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="nums =" value={raw} onChange={setRaw} width={200} />
          <NumberControl label="x =" value={x} onChange={setX} />
          <PresetControl
            presets={PRESETS}
            onPick={(v) => {
              setRaw(v.a)
              setX(v.x)
            }}
          />
        </>
      }
      legend={
        <>
          <LegendItem state="bad">満たさない側 (ng 以下)</LegendItem>
          <LegendItem state="good">満たす側 (ok 以上)</LegendItem>
          <LegendItem state="active">mid</LegendItem>
        </>
      }
    >
      {(f) => <ArrayView cells={f.view.cells} pointers={f.view.pointers} showIndex={false} />}
    </SimShell>
  )
}
