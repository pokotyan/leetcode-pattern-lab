import { useState } from 'react'
import { Slider, VizShell } from '../viz/VizShell'

type Fn = {
  id: string
  label: string
  f: (x: number) => number
  /** null は「その点で傾きが 1 つに定まらない」 */
  df: (x: number) => number | null
  dfLabel: string
  yRange: [number, number]
  dyRange: [number, number]
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

const FNS: Fn[] = [
  {
    id: 'square',
    label: 'x²',
    f: (x) => x * x,
    df: (x) => 2 * x,
    dfLabel: "f'(x) = 2x",
    yRange: [-1, 10],
    dyRange: [-7, 7],
  },
  {
    id: 'sin',
    label: 'sin x',
    f: Math.sin,
    df: Math.cos,
    dfLabel: "f'(x) = cos x",
    yRange: [-1.6, 1.6],
    dyRange: [-1.6, 1.6],
  },
  {
    id: 'sigmoid',
    label: 'シグモイド',
    f: sigmoid,
    df: (x) => sigmoid(x) * (1 - sigmoid(x)),
    dfLabel: "f'(x) = f(x)(1 − f(x))",
    yRange: [-0.2, 1.2],
    dyRange: [-0.05, 0.3],
  },
  {
    id: 'relu',
    label: 'ReLU',
    f: (x) => Math.max(0, x),
    df: (x) => (x > 0 ? 1 : x < 0 ? 0 : null),
    dfLabel: "f'(x) = 0（x < 0）, 1（x > 0）",
    yRange: [-0.5, 3.5],
    dyRange: [-0.3, 1.3],
  },
]

const X_MIN = -3.5
const X_MAX = 3.5
const W = 560
const H = 220
const PAD = 28

function scale(range: [number, number], from: number, to: number) {
  const [a, b] = range
  return (v: number) => from + ((v - a) / (b - a)) * (to - from)
}

function curve(f: (x: number) => number | null, sx: (v: number) => number, sy: (v: number) => number) {
  const parts: string[] = []
  let pen = false
  for (let i = 0; i <= 280; i++) {
    const x = X_MIN + ((X_MAX - X_MIN) * i) / 280
    const y = f(x)
    if (y === null || !Number.isFinite(y)) {
      pen = false
      continue
    }
    parts.push(`${pen ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`)
    pen = true
  }
  return parts.join(' ')
}

function Axes({ sx, sy, label }: { sx: (v: number) => number; sy: (v: number) => number; label: string }) {
  return (
    <g>
      <line x1={sx(X_MIN)} x2={sx(X_MAX)} y1={sy(0)} y2={sy(0)} stroke="var(--border)" />
      <line x1={sx(0)} x2={sx(0)} y1={PAD / 2} y2={H - PAD / 2} stroke="var(--border)" />
      {[-3, -2, -1, 1, 2, 3].map((t) => (
        <text key={t} x={sx(t)} y={sy(0) + 14} fontSize={10} textAnchor="middle" fill="var(--fg-muted)">
          {t}
        </text>
      ))}
      <text x={PAD} y={PAD / 2 + 4} fontSize={11} fill="var(--fg-muted)">
        {label}
      </text>
    </g>
  )
}

export default function TangentSlope() {
  const [fnId, setFnId] = useState('square')
  const [x, setX] = useState(1)
  const [h, setH] = useState(1)
  const fn = FNS.find((f) => f.id === fnId)!

  const sx = scale([X_MIN, X_MAX], PAD, W - PAD)
  const sy = scale(fn.yRange, H - PAD / 2, PAD / 2)
  const sdy = scale(fn.dyRange, H - PAD / 2, PAD / 2)

  const fx = fn.f(x)
  const fxh = fn.f(x + h)
  const secant = (fxh - fx) / h
  const tangent = fn.df(x)

  const line = (slope: number) => {
    const y = (t: number) => fx + slope * (t - x)
    return { x1: sx(X_MIN), y1: sy(y(X_MIN)), x2: sx(X_MAX), y2: sy(y(X_MAX)) }
  }

  return (
    <VizShell
      title="割線が接線に近づく"
      subtitle="2 点を結ぶ直線（割線）の傾きは、幅 h を縮めると、その点での接線の傾き（微分）に近づく"
      controls={
        <>
          <span className="flex flex-wrap gap-1">
            {FNS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFnId(f.id)}
                className="rounded border px-2 py-1"
                style={{
                  borderColor: f.id === fnId ? 'var(--accent)' : 'var(--border)',
                  color: f.id === fnId ? 'var(--accent)' : 'var(--fg-muted)',
                }}
              >
                {f.label}
              </button>
            ))}
          </span>
          <Slider label="点 x" value={x} min={-3} max={3} step={0.05} onChange={setX} />
          <Slider label="幅 h" value={h} min={0.01} max={2} step={0.01} onChange={setH} />
        </>
      }
      readout={
        <>
          <div>
            割線の傾き (f(x+h) − f(x)) / h = ({fxh.toFixed(4)} − {fx.toFixed(4)}) / {h.toFixed(2)} ={' '}
            <span style={{ color: 'var(--accent)' }}>{secant.toFixed(4)}</span>
          </div>
          <div>
            接線の傾き {fn.dfLabel} ={' '}
            <span style={{ color: 'var(--ok)' }}>
              {tangent === null ? '（x = 0 では左右で傾きが違い、1 つに定まらない）' : tangent.toFixed(4)}
            </span>
            {tangent !== null && <> 　差 {Math.abs(secant - tangent).toExponential(2)}</>}
          </div>
        </>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ maxWidth: W }} role="img" aria-label="関数のグラフと割線と接線">
        <Axes sx={sx} sy={sy} label={`f(x) = ${fn.label}`} />
        <path d={curve(fn.f, sx, sy)} fill="none" stroke="var(--fg)" strokeWidth={2} />
        {tangent !== null && <line {...line(tangent)} stroke="var(--ok)" strokeWidth={1.5} />}
        <line {...line(secant)} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="5 4" />
        <line x1={sx(x + h)} x2={sx(x + h)} y1={sy(fx)} y2={sy(fxh)} stroke="var(--warn)" strokeDasharray="2 3" />
        <line x1={sx(x)} x2={sx(x + h)} y1={sy(fx)} y2={sy(fx)} stroke="var(--warn)" strokeDasharray="2 3" />
        <circle cx={sx(x)} cy={sy(fx)} r={4.5} fill="var(--ok)" />
        <circle cx={sx(x + h)} cy={sy(fxh)} r={4.5} fill="var(--accent)" />
      </svg>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 block w-full" style={{ maxWidth: W }} role="img" aria-label="導関数のグラフ">
        <Axes sx={sx} sy={sdy} label="導関数 f'(x)：各点での接線の傾きを並べたもの" />
        <path d={curve(fn.df, sx, sdy)} fill="none" stroke="var(--ok)" strokeWidth={2} />
        {tangent !== null && <circle cx={sx(x)} cy={sdy(tangent)} r={4.5} fill="var(--ok)" />}
        <circle cx={sx(x)} cy={sdy(secant)} r={4} fill="none" stroke="var(--accent)" strokeWidth={2} />
      </svg>
      <p className="m-0 mt-2 text-xs" style={{ color: 'var(--fg-muted)' }}>
        細い実線が接線、破線が割線。下のグラフの塗りつぶした点が接線の傾き、白抜きの点が割線の傾き。h を小さくすると 2 つの点が重なる
      </p>
    </VizShell>
  )
}
