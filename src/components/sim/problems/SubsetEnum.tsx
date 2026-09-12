import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `def subsets(mask):
    res = []
    sub = mask
    while True:
        res.append(sub)
        if sub == 0:
            break
        sub = (sub - 1) & mask   # 1つ前の部分集合へ飛ぶ
    return res`

type View = { maskBits: Cell[]; subBits: Cell[]; found: string[]; width: number }

function trace(mask: number, width: number): Frame<View>[] {
  const frames: Frame<View>[] = []
  const found: string[] = []
  let sub = mask

  const bitsOf = (v: number, base: number, highlight: boolean): Cell[] =>
    Array.from({ length: width }, (_, i) => {
      const idx = width - 1 - i
      const on = (v >> idx) & 1
      const inMask = (base >> idx) & 1
      let state: Cell['state'] = 'idle'
      if (!inMask) state = 'dim'
      else if (on) state = highlight ? 'good' : 'window'
      return { value: on, state, note: `2^${idx}` }
    })

  const snap = (line: number | number[], note: string, opts: { finished?: boolean } = {}) => {
    frames.push({
      line,
      note,
      vars: {
        mask: (mask >>> 0).toString(2).padStart(width, '0'),
        sub: (sub >>> 0).toString(2).padStart(width, '0'),
        見つけた数: found.length,
      },
      view: {
        maskBits: bitsOf(mask, mask, false),
        subBits: bitsOf(sub, mask, true),
        found: [...found],
        width,
      },
      done: opts.finished,
    })
  }

  snap(3, `mask = ${(mask >>> 0).toString(2).padStart(width, '0')} の部分集合を、大きいほうから順に列挙する。sub は mask そのものから始める`)

  let guard = 0
  while (guard++ < 300) {
    found.push((sub >>> 0).toString(2).padStart(width, '0'))
    snap(5, `sub = ${(sub >>> 0).toString(2).padStart(width, '0')} を採用。mask の中で立っているビットだけを使っている`)
    if (sub === 0) break
    const before = sub
    sub = (sub - 1) & mask
    snap(8, `(${before} − 1) & mask = ${sub}。1 を引くと最下位の 1 が落ちてその下が全部 1 になり、& mask で mask の外のビットを捨てる。これで「1つ前の部分集合」へちょうど飛べる`)
  }
  snap(9, `完了。部分集合は ${found.length} 個。mask の立っているビットが k 個なら 2^k 個になる`, {
    finished: true,
  })
  return frames
}

const PRESETS = [
  { name: '1011', value: { mask: 0b1011, width: 4 } },
  { name: '1101', value: { mask: 0b1101, width: 4 } },
  { name: '0111', value: { mask: 0b0111, width: 4 } },
  { name: '10101', value: { mask: 0b10101, width: 5 } },
]

export default function SubsetEnum() {
  const [c, setC] = useState(PRESETS[0]!.value)
  const frames = useMemo(() => trace(c.mask, c.width), [c])

  return (
    <SimShell
      title="部分集合の列挙（(sub - 1) & mask）"
      subtitle="mask の中に立っているビットだけを使う部分集合を、もれなく重複なく1つずつ下っていく"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="mask" presets={PRESETS} onPick={setC} />}
      legend={
        <>
          <LegendItem state="good">sub で立っているビット</LegendItem>
          <LegendItem state="window">mask で立っているビット</LegendItem>
          <LegendItem state="dim">mask の外（使えない桁）</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-4">
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              mask
            </p>
            <ArrayView cells={f.view.maskBits} showIndex={false} size={40} />
          </div>
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              sub（いまの部分集合）
            </p>
            <ArrayView cells={f.view.subBits} showIndex={false} size={40} />
          </div>
          <p className="m-0 break-all font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            列挙済み: <span style={{ color: 'var(--ok)' }}>{f.view.found.join(', ')}</span>
          </p>
        </div>
      )}
    </SimShell>
  )
}
