import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl } from '../core/Controls'
import { LegendItem } from '../views/Legend'
import type { Frame } from '../core/types'

const CODE = `def ext_gcd(a, b):
    if b == 0:
        return a, 1, 0               # a×1 + 0×0 = a
    g, x1, y1 = ext_gcd(b, a % b)
    x = y1
    y = x1 - (a // b) * y1           # 係数を1段ぶん戻す
    return g, x, y`

type Row = { a: number; b: number; x: number | null; y: number | null; g: number | null; depth: number }
type View = { rows: Row[]; phase: '降りる' | '戻る' | '完了'; check: string }

function trace(a0: number, b0: number): Frame<View>[] {
  const frames: Frame<View>[] = []
  const rows: Row[] = []

  const snap = (
    line: number | number[],
    note: string,
    opts: { phase: View['phase']; active?: number; check?: string; finished?: boolean },
  ) => {
    frames.push({
      line,
      note,
      vars: {
        段階: opts.phase,
        深さ: opts.active ?? '−',
      },
      view: { rows: rows.map((r) => ({ ...r })), phase: opts.phase, check: opts.check ?? '' },
      done: opts.finished,
    })
  }

  // 降りる
  let a = a0
  let b = b0
  let depth = 0
  while (b !== 0) {
    rows.push({ a, b, x: null, y: null, g: null, depth })
    snap(4, `ext_gcd(${a}, ${b}) を呼ぶ。中で ext_gcd(${b}, ${a % b}) を呼んで、答えを待つ`, {
      phase: '降りる',
      active: depth,
    })
    const na = b
    const nb = a % b
    a = na
    b = nb
    depth += 1
  }
  rows.push({ a, b, x: 1, y: 0, g: a, depth })
  snap([2, 3], `b が 0 になった。${a} × 1 + 0 × 0 = ${a} なので、g = ${a}、x = 1、y = 0 を返す。ここから戻りながら係数を作り直す`, {
    phase: '戻る',
    active: depth,
  })

  // 戻る
  let g = a
  let x = 1
  let y = 0
  for (let i = rows.length - 2; i >= 0; i--) {
    const r = rows[i]!
    const q = Math.floor(r.a / r.b)
    const nx = y
    const ny = x - q * y
    x = nx
    y = ny
    r.x = x
    r.y = y
    r.g = g
    snap([5, 6, 7], `ext_gcd(${r.a}, ${r.b}) の答えを作る。商は ${r.a} // ${r.b} = ${q} なので、x = ${x}、y = ${y}。検算: ${r.a} × ${x} + ${r.b} × ${y} = ${r.a * x + r.b * y}`, {
      phase: '戻る',
      active: i,
      check: `${r.a} × ${x} + ${r.b} × ${y} = ${r.a * x + r.b * y}`,
    })
  }

  snap(7, `完了。gcd(${a0}, ${b0}) = ${g} で、${a0} × ${x} + ${b0} × ${y} = ${g} を満たす係数が求まった`, {
    phase: '完了',
    check: `${a0} × ${x} + ${b0} × ${y} = ${a0 * x + b0 * y}`,
    finished: true,
  })
  return frames
}

const PRESETS = [
  { name: '240 と 46', value: { a: 240, b: 46 } },
  { name: '35 と 15', value: { a: 35, b: 15 } },
  { name: '互いに素 (17, 5)', value: { a: 17, b: 5 } },
]

export default function ExtGcd() {
  const [a, setA] = useState(240)
  const [b, setB] = useState(46)
  const aa = Math.min(Math.max(Math.trunc(a), 1), 2000)
  const bb = Math.min(Math.max(Math.trunc(b), 1), 2000)
  const frames = useMemo(() => trace(aa, bb), [aa, bb])

  return (
    <SimShell
      title="拡張ユークリッドの互除法（係数まで求める）"
      subtitle="互除法で降りていき、戻りながら ax + by = gcd(a, b) を満たす x, y を組み立てる"
      code={CODE}
      frames={frames}
      controls={
        <>
          <NumberControl label="a =" value={a} onChange={setA} min={1} max={2000} />
          <NumberControl label="b =" value={b} onChange={setB} min={1} max={2000} />
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
          <LegendItem state="active">いま計算している段</LegendItem>
          <LegendItem state="good">係数が確定した段</LegendItem>
          <LegendItem state="idle">まだ係数が決まっていない段</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <p className="m-0 font-mono text-[11px]" style={{ color: 'var(--accent)' }}>
            {f.view.phase}
          </p>
          <table
            className="m-0 border-collapse font-mono text-xs"
            style={{ display: 'table', width: 'auto' }}
          >
            <thead>
              <tr style={{ color: 'var(--fg-muted)' }}>
                <th className="px-2 py-1 text-left">a</th>
                <th className="px-2 py-1 text-left">b</th>
                <th className="px-2 py-1 text-left">x</th>
                <th className="px-2 py-1 text-left">y</th>
                <th className="px-2 py-1 text-left">ax + by</th>
              </tr>
            </thead>
            <tbody>
              {f.view.rows.map((r, i) => (
                <tr
                  key={i}
                  style={{
                    color: r.x === null ? 'var(--fg-muted)' : 'var(--ok)',
                    background: r.x === null ? 'transparent' : 'var(--ok-soft)',
                  }}
                >
                  <td className="px-2 py-1">{r.a}</td>
                  <td className="px-2 py-1">{r.b}</td>
                  <td className="px-2 py-1">{r.x ?? '·'}</td>
                  <td className="px-2 py-1">{r.y ?? '·'}</td>
                  <td className="px-2 py-1">
                    {r.x === null ? '·' : r.a * r.x + r.b * (r.y ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {f.view.check && (
            <p className="m-0 font-mono text-xs" style={{ color: 'var(--ok)' }}>
              {f.view.check}
            </p>
          )}
        </div>
      )}
    </SimShell>
  )
}
