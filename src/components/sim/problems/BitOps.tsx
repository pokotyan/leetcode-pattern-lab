import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `x | (1 << i)      # i 番目のビットを立てる
x & ~(1 << i)     # i 番目のビットを落とす
x ^ (1 << i)      # i 番目のビットを反転する
x & (1 << i)      # i 番目が立っていれば 0 以外
x & -x            # 一番下の立っているビットだけを残す
x & (x - 1)       # 一番下の立っているビットだけを落とす
bin(x).count('1') # 立っているビットの数`

const W = 8

type Step = {
  line: number
  label: string
  apply: (x: number) => number
  note: (x: number, y: number) => string
  /** false なら x を書き換えず、結果だけを別の行に出す（値を壊さずに見せるため） */
  assign: boolean
}

const STEPS: Step[] = [
  {
    line: 1,
    label: 'x | (1 << 2)',
    apply: (x) => x | (1 << 2),
    note: (x, y) => `2 番目のビットを立てる。もともと立っていたら何も変わらない（${x} → ${y}）`,
    assign: true,
  },
  {
    line: 2,
    label: 'x & ~(1 << 0)',
    apply: (x) => x & ~(1 << 0),
    note: (x, y) => `0 番目のビットを落とす。~(1 << 0) は 0 番目だけが 0 のビット列なので、そこだけ消える（${x} → ${y}）`,
    assign: true,
  },
  {
    line: 3,
    label: 'x ^ (1 << 3)',
    apply: (x) => x ^ (1 << 3),
    note: (x, y) => `3 番目のビットを反転する。XOR は「違えば 1」なので、1 と重ねた桁だけが裏返る（${x} → ${y}）`,
    assign: true,
  },
  {
    line: 5,
    label: 'x & -x',
    apply: (x) => x & -x,
    note: (x, y) => `一番下の立っているビットだけが残る。-x は 2 の補数、つまり「反転して 1 を足した値」なので、最下位の 1 より上がすべて食い違う（${x} の lowbit は ${y}）`,
    assign: false,
  },
  {
    line: 6,
    label: 'x & (x - 1)',
    apply: (x) => x & (x - 1),
    note: (x, y) => `一番下の立っているビットだけが落ちる。これを 0 になるまで繰り返した回数が、立っているビットの数（${x} なら ${y}）`,
    assign: false,
  },
]

type View = { bits: Cell[]; value: number; label: string; popcount: number; derived: string | null }

function trace(start: number): Frame<View>[] {
  const frames: Frame<View>[] = []
  let x = start

  const snap = (
    line: number,
    label: string,
    note: string,
    changed: number[] = [],
    finished = false,
    derived: number | null = null,
  ) => {
    const shown = derived ?? x
    const bits: Cell[] = Array.from({ length: W }, (_, i) => {
      const idx = W - 1 - i // 左が上位ビット
      const on = (shown >> idx) & 1
      let state: Cell['state'] = on ? 'good' : 'idle'
      if (changed.includes(idx)) state = 'active'
      return { value: on, state, note: `2^${idx}` }
    })
    frames.push({
      line,
      note,
      vars: { x, '2進法': (x >>> 0).toString(2).padStart(W, '0'), 立っている数: popcount(x) },
      view: {
        bits,
        value: x,
        label,
        popcount: popcount(x),
        derived: derived === null ? null : `${derived}（${(derived >>> 0).toString(2).padStart(W, '0')}）`,
      },
      done: finished,
    })
  }

  snap(1, '開始', `x = ${start}。2進法で ${(start >>> 0).toString(2).padStart(W, '0')}。左が上位ビット`)

  for (const s of STEPS) {
    const before = x
    const after = s.apply(x)
    const diff: number[] = []
    for (let i = 0; i < W; i++) if (((before >> i) & 1) !== ((after >> i) & 1)) diff.push(i)
    if (s.assign) {
      x = after
      snap(s.line, s.label, s.note(before, after), diff)
    } else {
      // x は変えずに、演算の結果だけを見せる
      snap(s.line, s.label, s.note(before, after), [], false, after)
    }
  }
  snap(7, 'popcount', `いまの x = ${x}。立っているビットの数は ${popcount(x)}`, [], true)
  return frames
}

function popcount(x: number): number {
  let c = 0
  let v = x
  while (v) {
    v &= v - 1
    c += 1
  }
  return c
}

const PRESETS = [
  { name: 'x = 22', value: 22 },
  { name: 'x = 255', value: 255 },
  { name: 'x = 40', value: 40 },
]

export default function BitOps() {
  const [x, setX] = useState(22)
  const xx = Math.min(Math.max(Math.trunc(x), 0), 255)
  const frames = useMemo(() => trace(xx), [xx])

  return (
    <SimShell
      title="ビット演算の基本操作"
      subtitle="集合を整数で持つときの、立てる・落とす・反転する・取り出す。どれも1行で書ける"
      code={CODE}
      frames={frames}
      controls={
        <>
          <NumberControl label="x =" value={x} onChange={setX} min={0} max={255} />
          <PresetControl presets={PRESETS} onPick={setX} />
        </>
      }
      legend={
        <>
          <LegendItem state="good">立っているビット</LegendItem>
          <LegendItem state="active">この操作で変わったビット</LegendItem>
          <LegendItem state="idle">0 のビット</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <p className="m-0 font-mono text-sm" style={{ color: 'var(--accent)' }}>
            {f.view.label}
          </p>
          <ArrayView cells={f.view.bits} showIndex={false} size={40} />
          {f.view.derived && (
            <p className="m-0 font-mono text-xs" style={{ color: 'var(--warn)' }}>
              演算の結果 = {f.view.derived}（x 自体は書き換えていない）
            </p>
          )}
          <p className="m-0 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
            x = <span style={{ color: 'var(--ok)' }}>{f.view.value}</span> / 立っているビット ={' '}
            {f.view.popcount}
          </p>
        </div>
      )}
    </SimShell>
  )
}
