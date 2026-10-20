import { useState } from 'react'
import { Slider, VizShell } from '../viz/VizShell'

type M = [number, number, number, number]
type P = [number, number]

const SIZE = 320
const RANGE = 3.2
const toSvg = ([x, y]: P): P => [SIZE / 2 + (x / RANGE) * (SIZE / 2), SIZE / 2 - (y / RANGE) * (SIZE / 2)]
const apply = ([a, b, c, d]: M, [x, y]: P): P => [a * x + b * y, c * x + d * y]
const mul = ([a, b, c, d]: M, [e, f, g, h]: M): M => [a * e + b * g, a * f + b * h, c * e + d * g, c * f + d * h]
const det = ([a, b, c, d]: M) => a * d - b * c
const fmt = (v: number) => (Math.abs(v) < 0.005 ? '0.00' : v.toFixed(2))

const deg = (t: number) => (t * Math.PI) / 180
const PRESETS: { name: string; m: M }[] = [
  { name: '何もしない', m: [1, 0, 0, 1] },
  { name: '30° 回す', m: [Math.cos(deg(30)), -Math.sin(deg(30)), Math.sin(deg(30)), Math.cos(deg(30))] },
  { name: '横に 2 倍', m: [2, 0, 0, 1] },
  { name: 'せん断', m: [1, 1, 0, 1] },
  { name: '左右反転', m: [-1, 0, 0, 1] },
  { name: '線につぶす', m: [1, 2, 0.5, 1] },
]

// 向きと裏返しが見分けられるよう、左右非対称な「F」の形を使う
const SHAPE: P[] = [
  [0.2, 0.2],
  [0.2, 1.8],
  [1.2, 1.8],
  [1.2, 1.5],
  [0.5, 1.5],
  [0.5, 1.1],
  [1.0, 1.1],
  [1.0, 0.8],
  [0.5, 0.8],
  [0.5, 0.2],
]

function Plane({ m, label, id }: { m: M; label: string; id: string }) {
  const lines: [P, P][] = []
  for (let i = -6; i <= 6; i++) {
    lines.push([apply(m, [i, -6]), apply(m, [i, 6])])
    lines.push([apply(m, [-6, i]), apply(m, [6, i])])
  }
  const square = ([[0, 0], [1, 0], [1, 1], [0, 1]] as P[]).map((p) => toSvg(apply(m, p)).join(',')).join(' ')
  const shape = SHAPE.map((p) => toSvg(apply(m, p)).join(',')).join(' ')
  const o = toSvg([0, 0])
  const e1 = toSvg(apply(m, [1, 0]))
  const e2 = toSvg(apply(m, [0, 1]))
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label={label}>
        <defs>
          <clipPath id={`mt-clip-${id}`}>
            <rect width={SIZE} height={SIZE} />
          </clipPath>
        </defs>
        <rect width={SIZE} height={SIZE} fill="var(--bg)" stroke="var(--border)" />
        <g clipPath={`url(#mt-clip-${id})`}>
          {[-3, -2, -1, 0, 1, 2, 3].map((i) => (
            <g key={i} stroke="var(--border)" strokeWidth={i === 0 ? 1.2 : 0.6}>
              <line x1={toSvg([i, -4])[0]} y1={0} x2={toSvg([i, -4])[0]} y2={SIZE} />
              <line x1={0} y1={toSvg([0, i])[1]} x2={SIZE} y2={toSvg([0, i])[1]} />
            </g>
          ))}
          {lines.map(([p, q], i) => {
            const [x1, y1] = toSvg(p)
            const [x2, y2] = toSvg(q)
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--accent)" strokeOpacity={0.35} strokeWidth={0.8} />
          })}
          <polygon points={square} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth={1} />
          <polygon points={shape} fill="var(--warn-soft)" stroke="var(--warn)" strokeWidth={1.5} />
          <line x1={o[0]} y1={o[1]} x2={e1[0]} y2={e1[1]} stroke="var(--ok)" strokeWidth={3} />
          <circle cx={e1[0]} cy={e1[1]} r={4} fill="var(--ok)" />
          <line x1={o[0]} y1={o[1]} x2={e2[0]} y2={e2[1]} stroke="var(--danger)" strokeWidth={3} />
          <circle cx={e2[0]} cy={e2[1]} r={4} fill="var(--danger)" />
        </g>
      </svg>
      <figcaption className="mt-1 text-center font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
        {label}
      </figcaption>
    </figure>
  )
}

function MatrixText({ m }: { m: M }) {
  return (
    <span>
      [[{fmt(m[0])}, {fmt(m[1])}], [{fmt(m[2])}, {fmt(m[3])}]]
    </span>
  )
}

function Readout({ m }: { m: M }) {
  const d = det(m)
  const rank = Math.abs(d) > 1e-6 ? 2 : m.some((v) => Math.abs(v) > 1e-6) ? 1 : 0
  return (
    <>
      <div>
        行列 <MatrixText m={m} />
      </div>
      <div>
        <span style={{ color: 'var(--ok)' }}>(1, 0) → ({fmt(m[0])}, {fmt(m[2])})</span>
        <span style={{ color: 'var(--danger)' }}>(0, 1) → ({fmt(m[1])}, {fmt(m[3])})</span>　（行列の 1 列目と 2 列目）
      </div>
      <div>
        行列式 = {fmt(m[0])}×{fmt(m[3])} − {fmt(m[1])}×{fmt(m[2])} = {fmt(d)}　面積は {fmt(Math.abs(d))} 倍
        {d < -1e-6 && '、裏返る'}
        {rank < 2 && `、つぶれて ${rank === 1 ? '線' : '点'}になる（ランク ${rank}）`}
      </div>
    </>
  )
}

export default function MatrixTransform() {
  const [mode, setMode] = useState<'one' | 'two'>('one')
  const [m, setM] = useState<M>([1, 0.5, 0, 1])
  const [first, setFirst] = useState(1)
  const [second, setSecond] = useState(2)
  const [swap, setSwap] = useState(false)

  const set = (i: number) => (v: number) => setM((prev) => prev.map((x, j) => (j === i ? v : x)) as M)
  const btn = (active: boolean) => ({
    borderColor: active ? 'var(--accent)' : 'var(--border)',
    color: active ? 'var(--accent)' : 'var(--fg-muted)',
  })

  const A = PRESETS[first]!.m
  const B = PRESETS[second]!.m
  // 先に A、次に B を当てる合成は B·A。入れ替えると A·B
  const composite = swap ? mul(A, B) : mul(B, A)

  return (
    <VizShell
      title="行列で平面を変形する"
      subtitle="緑と赤の矢印の行き先が、そのまま行列の 1 列目と 2 列目になる。方眼全体がその 2 本に引きずられて動く"
      controls={
        <>
          <div className="flex gap-2">
            {(['one', 'two'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setMode(k)} className="rounded border px-2 py-1" style={btn(mode === k)}>
                {k === 'one' ? '1 枚の行列' : '2 枚を重ねる'}
              </button>
            ))}
          </div>
          {mode === 'one' ? (
            <>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button key={p.name} type="button" onClick={() => setM(p.m)} className="rounded border px-2 py-1" style={btn(false)}>
                    {p.name}
                  </button>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Slider label="a（左上）" value={m[0]} min={-2} max={2} onChange={set(0)} />
                <Slider label="b（右上）" value={m[1]} min={-2} max={2} onChange={set(1)} />
                <Slider label="c（左下）" value={m[2]} min={-2} max={2} onChange={set(2)} />
                <Slider label="d（右下）" value={m[3]} min={-2} max={2} onChange={set(3)} />
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2">
                <span style={{ color: 'var(--fg-muted)' }}>先に当てる A</span>
                <select value={first} onChange={(e) => setFirst(Number(e.target.value))} className="rounded border px-1 py-0.5" style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--fg)' }}>
                  {PRESETS.map((p, i) => (
                    <option key={p.name} value={i}>{p.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span style={{ color: 'var(--fg-muted)' }}>次に当てる B</span>
                <select value={second} onChange={(e) => setSecond(Number(e.target.value))} className="rounded border px-1 py-0.5" style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--fg)' }}>
                  {PRESETS.map((p, i) => (
                    <option key={p.name} value={i}>{p.name}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => setSwap((s) => !s)} className="rounded border px-2 py-1" style={btn(swap)}>
                順番を入れ替える
              </button>
            </div>
          )}
        </>
      }
      readout={
        mode === 'one' ? (
          <Readout m={m} />
        ) : (
          <>
            <div>
              {swap ? '先に B、次に A：A·B = ' : '先に A、次に B：B·A = '}
              <MatrixText m={composite} />
            </div>
            <Readout m={composite} />
            <div>
              入れ替えると {swap ? 'B·A' : 'A·B'} = <MatrixText m={swap ? mul(B, A) : mul(A, B)} />
            </div>
          </>
        )
      }
    >
      <div className="flex flex-wrap justify-center gap-4">
        {mode === 'one' ? (
          <Plane id="one" m={m} label="変形後" />
        ) : (
          <>
            <Plane id="first" m={swap ? B : A} label={swap ? '1 枚目 B だけ' : '1 枚目 A だけ'} />
            <Plane id="both" m={composite} label={swap ? '続けて A（= A·B）' : '続けて B（= B·A）'} />
          </>
        )}
      </div>
    </VizShell>
  )
}
