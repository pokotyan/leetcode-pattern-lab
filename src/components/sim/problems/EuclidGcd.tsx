import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl } from '../core/Controls'
import { IntervalView, type Bar } from '../views/IntervalView'
import { LegendItem } from '../views/Legend'
import type { Frame } from '../core/types'

const CODE = `def gcd(a, b):
    while b:
        a, b = b, a % b          # 大きいほうを「余り」で置き換える
    return a

def lcm(a, b):
    return a // gcd(a, b) * b    # 先に割ってから掛ける（あふれ対策）`

type View = { bars: Bar[]; steps: string[]; a: number; b: number; max: number }

function trace(a0: number, b0: number): Frame<View>[] {
  const frames: Frame<View>[] = []
  const steps: string[] = []
  const max = Math.max(a0, b0)
  let a = a0
  let b = b0

  const snap = (
    line: number | number[],
    note: string,
    opts: { hit?: boolean; finished?: boolean } = {},
  ) => {
    const bars: Bar[] = [
      { start: 0, end: a, row: 0, label: `a = ${a}`, state: opts.hit ? 'good' : 'window' },
    ]
    if (b > 0) bars.push({ start: 0, end: b, row: 1, label: `b = ${b}`, state: 'active' })
    frames.push({
      line,
      note,
      vars: { a, b, 'a % b': b > 0 ? a % b : '−' },
      view: { bars, steps: [...steps], a, b, max },
      done: opts.finished,
    })
  }

  snap(1, `gcd(${a0}, ${b0}) を求める。棒の長さが、そのときの a と b`)

  let guard = 0
  while (b > 0 && guard++ < 60) {
    const r = a % b
    steps.push(`gcd(${a}, ${b}) = gcd(${b}, ${r})`)
    snap([2, 3], `${a} を ${b} で割った余りは ${r}。${a} と ${b} の公約数は、${b} と ${r} の公約数と完全に同じなので、この組に置き換えてよい`)
    a = b
    b = r
  }
  snap(4, `b が 0 になった。残った a = ${a} が最大公約数。ここまで ${steps.length} 回の割り算で到達した`, {
    hit: true,
    finished: true,
  })
  return frames
}

const PRESETS = [
  { name: '48 と 18', value: { a: 48, b: 18 } },
  { name: '1071 と 462', value: { a: 1071, b: 462 } },
  { name: '互いに素', value: { a: 35, b: 64 } },
  { name: '倍数関係', value: { a: 100, b: 25 } },
]

export default function EuclidGcd() {
  const [a, setA] = useState(48)
  const [b, setB] = useState(18)
  const aa = Math.min(Math.max(Math.trunc(a), 1), 5000)
  const bb = Math.min(Math.max(Math.trunc(b), 1), 5000)
  const frames = useMemo(() => trace(aa, bb), [aa, bb])
  const g = (() => {
    let x = aa
    let y = bb
    while (y > 0) {
      const t = x % y
      x = y
      y = t
    }
    return x
  })()

  return (
    <SimShell
      title="ユークリッドの互除法（余りで置き換え続ける）"
      subtitle="gcd(a, b) = gcd(b, a % b)。この置き換えを繰り返すと、数は一気に小さくなる"
      code={CODE}
      frames={frames}
      controls={
        <>
          <NumberControl label="a =" value={a} onChange={setA} min={1} max={5000} />
          <NumberControl label="b =" value={b} onChange={setB} min={1} max={5000} />
          <PresetControl
            presets={PRESETS}
            onPick={(v) => {
              setA(v.a)
              setB(v.b)
            }}
          />
        </>
      }
      legend={
        <>
          <LegendItem state="window">a</LegendItem>
          <LegendItem state="active">b</LegendItem>
          <LegendItem state="good">確定した最大公約数</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <IntervalView bars={f.view.bars} min={0} max={f.view.max} width={440} rowHeight={30} />
          <ul className="m-0 list-none space-y-1 p-0 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
            {f.view.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <p className="m-0 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
            gcd = <span style={{ color: 'var(--ok)' }}>{g}</span> / lcm ={' '}
            <span style={{ color: 'var(--accent)' }}>{(aa / g) * bb}</span>
          </p>
        </div>
      )}
    </SimShell>
  )
}
