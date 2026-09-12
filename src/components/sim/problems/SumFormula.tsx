import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `total = 0
for i in range(1, n + 1):
    total += i                # 1つずつ足すと O(N)

total = n * (n + 1) // 2      # 両端から組にすると O(1)`

type View = { cells: Cell[]; pointers: Pointer[]; pairs: string[]; total: number }

function trace(n: number): Frame<View>[] {
  const frames: Frame<View>[] = []
  const pairs: string[] = []
  let total = 0

  const snap = (
    line: number | number[],
    note: string,
    opts: { l?: number; r?: number; done?: boolean } = {},
  ) => {
    const cells: Cell[] = Array.from({ length: n }, (_, i) => {
      const v = i + 1
      let state: Cell['state'] = 'idle'
      if (opts.l !== undefined && (v < opts.l || (opts.r !== undefined && v > opts.r))) state = 'good'
      if (v === opts.l || v === opts.r) state = 'active'
      if (opts.done) state = 'good'
      return { value: v, state }
    })
    const pointers: Pointer[] = []
    if (opts.l !== undefined && opts.l <= n) pointers.push({ name: 'L', index: opts.l - 1, tone: 'accent' })
    if (opts.r !== undefined && opts.r >= 1)
      pointers.push({ name: 'R', index: opts.r - 1, side: 'bottom', tone: 'warn' })
    frames.push({
      line,
      note,
      vars: { n, 組の数: pairs.length, 合計: total },
      view: { cells, pointers, pairs: [...pairs], total },
      done: opts.done,
    })
  }

  snap(5, `1 から ${n} までを足す。1つずつ足すと ${n} 回かかるので、両端から組にしていく`)

  let l = 1
  let r = n
  while (l < r) {
    pairs.push(`${l} + ${r} = ${l + r}`)
    total += l + r
    snap(5, `両端の ${l} と ${r} を組にすると ${l + r}。次の組は ${l + 1} と ${r - 1} で、これも ${l + r}。どの組も同じ値になる`, {
      l,
      r,
    })
    l += 1
    r -= 1
  }
  if (l === r) {
    total += l
    pairs.push(`${l}（相方なし）`)
    snap(5, `${n} が奇数なので真ん中の ${l} が余る。これは (n+1)/2 にあたる`, { l, r })
  }
  snap(5, `合計は ${total}。組は ${Math.floor(n / 2)} 個あって、どれも ${n + 1}。だから n × (n+1) / 2 = ${(n * (n + 1)) / 2}`, {
    done: true,
  })
  return frames
}

const PRESETS = [
  { name: 'n = 10', value: 10 },
  { name: 'n = 7（奇数）', value: 7 },
  { name: 'n = 16', value: 16 },
]

export default function SumFormula() {
  const [n, setN] = useState(10)
  const nn = Math.min(Math.max(Math.trunc(n), 2), 20)
  const frames = useMemo(() => trace(nn), [nn])

  return (
    <SimShell
      title="1 から N までの和が N(N+1)/2 になる理由"
      subtitle="両端から組にすると、どの組も同じ値になる。二重ループの回数を見積もる土台"
      code={CODE}
      frames={frames}
      controls={
        <>
          <NumberControl label="n =" value={n} onChange={setN} min={2} max={20} />
          <PresetControl presets={PRESETS} onPick={setN} />
        </>
      }
      legend={
        <>
          <LegendItem state="active">いま組にした2つ</LegendItem>
          <LegendItem state="good">組にし終えた数</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <ArrayView cells={f.view.cells} showIndex={false} size={36} />
          <ul className="m-0 list-none space-y-0.5 p-0 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
            {f.view.pairs.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
          <p className="m-0 font-mono text-xs">
            <span style={{ color: 'var(--fg-muted)' }}>合計 = </span>
            <span style={{ color: 'var(--ok)' }}>{f.view.total}</span>
          </p>
        </div>
      )}
    </SimShell>
  )
}
