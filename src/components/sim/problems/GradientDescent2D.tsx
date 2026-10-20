import { useMemo, useState } from 'react'
import { Slider, VizShell } from '../viz/VizShell'

type Surface = {
  id: string
  name: string
  note: string
  f: (x: number, y: number) => number
  g: (x: number, y: number) => [number, number]
  start: [number, number]
  eta: number
}

const SURFACES: Surface[] = [
  {
    id: 'bowl',
    name: '丸いお椀',
    note: 'L = x² + y²。どこから見ても谷底がまっすぐ下にあり、勾配の逆向きがそのまま最短の道になる',
    f: (x, y) => x * x + y * y,
    g: (x, y) => [2 * x, 2 * y],
    start: [-2.5, 2],
    eta: 0.1,
  },
  {
    id: 'valley',
    name: '細長い谷',
    note: 'L = 0.5x² + 5y²。y 方向だけ急なので、学習率を上げると y 方向で先に振動し始め、x 方向はなかなか進まない',
    f: (x, y) => 0.5 * x * x + 5 * y * y,
    g: (x, y) => [x, 10 * y],
    start: [-2.8, 1.2],
    eta: 0.15,
  },
  {
    id: 'saddle',
    name: '鞍点',
    note: 'L = x² − y² + 0.25y⁴。原点は x 方向には谷底、y 方向には山頂。y を 0 から少しずらさないと、原点から抜け出せない',
    f: (x, y) => x * x - y * y + 0.25 * y ** 4,
    g: (x, y) => [2 * x, -2 * y + y ** 3],
    start: [2.5, 0.02],
    eta: 0.1,
  },
]

const STEPS = 60
const RANGE = 3
const SIZE = 300
const GRID = 50
// これを超えたら発散とみなして描画を止める。図の外へ飛んだ点を追い続けても情報が増えないため
const BLOWUP = 1e4

function run(s: Surface, x0: number, y0: number, eta: number, beta: number) {
  const path: [number, number][] = [[x0, y0]]
  const losses = [s.f(x0, y0)]
  let [x, y] = [x0, y0]
  let [vx, vy] = [0, 0]
  let diverged = false
  for (let k = 0; k < STEPS; k++) {
    const [gx, gy] = s.g(x, y)
    vx = beta * vx + gx
    vy = beta * vy + gy
    x -= eta * vx
    y -= eta * vy
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > BLOWUP || Math.abs(y) > BLOWUP) {
      diverged = true
      break
    }
    path.push([x, y])
    losses.push(s.f(x, y))
  }
  return { path, losses, diverged }
}

function bands(s: Surface) {
  const cell = (2 * RANGE) / GRID
  const vals: number[] = []
  for (let i = 0; i < GRID; i++)
    for (let j = 0; j < GRID; j++) vals.push(s.f(-RANGE + (j + 0.5) * cell, RANGE - (i + 0.5) * cell))
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  // 等高線の代わりに 10 段の帯で塗る。値の差が大きい面でも谷の形が見えるよう平方根で圧縮する
  return vals.map((v) => Math.floor(Math.sqrt((v - lo) / (hi - lo || 1)) * 9.999))
}

export default function GradientDescent2D() {
  const [sid, setSid] = useState('valley')
  const s = SURFACES.find((x) => x.id === sid)!
  const [x0, setX0] = useState(s.start[0])
  const [y0, setY0] = useState(s.start[1])
  const [eta, setEta] = useState(s.eta)
  const [beta, setBeta] = useState(0)

  const pick = (next: Surface) => {
    setSid(next.id)
    setX0(next.start[0])
    setY0(next.start[1])
    setEta(next.eta)
    setBeta(0)
  }

  const level = useMemo(() => bands(s), [s])
  const { path, losses, diverged } = useMemo(() => run(s, x0, y0, eta, beta), [s, x0, y0, eta, beta])
  const toPx = (v: number) => ((v + RANGE) / (2 * RANGE)) * SIZE
  const toPy = (v: number) => ((RANGE - v) / (2 * RANGE)) * SIZE
  const cellPx = SIZE / GRID
  const visible = path.filter(([x, y]) => Math.abs(x) <= RANGE * 1.2 && Math.abs(y) <= RANGE * 1.2)
  const last = path[path.length - 1]!
  const [gx0, gy0] = s.g(x0, y0)

  const CW = 300
  const CH = 120
  const lossMin = Math.min(...losses)
  const shift = lossMin <= 0 ? 1e-3 - lossMin : 0
  const logs = losses.map((l) => Math.log10(l + shift + 1e-6))
  const lmin = Math.min(...logs)
  const lmax = Math.max(...logs)
  const chart = logs
    .map((l, k) => `${(k / STEPS) * CW},${CH - 8 - ((l - lmin) / (lmax - lmin || 1)) * (CH - 16)}`)
    .join(' ')

  const btn = (active: boolean) => ({
    borderColor: active ? 'var(--accent)' : 'var(--border)',
    background: active ? 'var(--accent-soft)' : 'var(--bg)',
    color: active ? 'var(--accent)' : 'var(--fg)',
  })

  return (
    <VizShell
      title="勾配降下法の軌跡"
      subtitle="濃いほど損失が大きい。点は 1 回の更新ごとの位置で、勾配の逆向きへ「学習率 × 勾配」だけ進む"
      controls={
        <>
          <span className="flex flex-wrap items-center gap-1">
            {SURFACES.map((x) => (
              <button
                key={x.id}
                onClick={() => pick(x)}
                className="rounded border px-2 py-1 text-[11px]"
                style={btn(x.id === sid)}
              >
                {x.name}
              </button>
            ))}
          </span>
          <Slider label="学習率 η" value={eta} min={0.005} max={0.6} step={0.005} onChange={setEta} format={(v) => v.toFixed(3)} />
          <Slider label="勢い β" value={beta} min={0} max={0.95} step={0.05} onChange={setBeta} />
          <Slider label="開始 x" value={x0} min={-2.9} max={2.9} step={0.1} onChange={setX0} format={(v) => v.toFixed(1)} />
          <Slider label="開始 y" value={y0} min={-2.9} max={2.9} step={0.01} onChange={setY0} />
        </>
      }
      readout={
        <>
          <div>{s.note}</div>
          <div>
            開始点の勾配 ∇L = ({gx0.toFixed(2)}, {gy0.toFixed(2)})　→ 最初の 1 歩 = −η∇L = ({(-eta * gx0).toFixed(3)},{' '}
            {(-eta * gy0).toFixed(3)})
          </div>
          <div style={{ color: diverged ? 'var(--danger)' : 'var(--fg)' }}>
            {diverged
              ? `${path.length - 1} 回目で値が爆発した（発散）。学習率を下げると収まる`
              : `${STEPS} 回後の位置 (${last[0].toFixed(3)}, ${last[1].toFixed(3)})、損失 ${s.f(last[0], last[1]).toFixed(5)}`}
          </div>
        </>
      }
    >
      <div className="flex flex-wrap items-start gap-6">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="損失の等高線と軌跡">
          <rect width={SIZE} height={SIZE} fill="var(--bg)" />
          {level.map((lv, idx) => (
            <rect
              key={idx}
              x={(idx % GRID) * cellPx}
              y={Math.floor(idx / GRID) * cellPx}
              width={cellPx + 0.5}
              height={cellPx + 0.5}
              fill="var(--accent)"
              opacity={0.04 + lv * 0.05}
            />
          ))}
          <line x1={SIZE / 2} y1={0} x2={SIZE / 2} y2={SIZE} stroke="var(--border)" />
          <line x1={0} y1={SIZE / 2} x2={SIZE} y2={SIZE / 2} stroke="var(--border)" />
          <polyline
            points={visible.map(([x, y]) => `${toPx(x)},${toPy(y)}`).join(' ')}
            fill="none"
            stroke={diverged ? 'var(--danger)' : 'var(--warn)'}
            strokeWidth={1.5}
          />
          {visible.map(([x, y], k) => (
            <circle key={k} cx={toPx(x)} cy={toPy(y)} r={k === 0 ? 4 : 2} fill={k === 0 ? 'var(--fg)' : 'var(--warn)'} />
          ))}
          {!diverged && <circle cx={toPx(last[0])} cy={toPy(last[1])} r={4} fill="var(--ok)" />}
          <text x={4} y={12} fontSize={10} fill="var(--fg-muted)">
            y
          </text>
          <text x={SIZE - 10} y={SIZE / 2 - 4} fontSize={10} fill="var(--fg-muted)">
            x
          </text>
        </svg>
        <div>
          <p className="m-0 mb-1 text-xs" style={{ color: 'var(--fg-muted)' }}>
            損失の推移（縦軸は対数、横軸は更新の回数 0〜{STEPS}）
          </p>
          <svg width={CW} height={CH} viewBox={`0 0 ${CW} ${CH}`} role="img" aria-label="損失の推移">
            <rect width={CW} height={CH} fill="var(--bg)" stroke="var(--border)" />
            <polyline points={chart} fill="none" stroke={diverged ? 'var(--danger)' : 'var(--accent)'} strokeWidth={1.5} />
          </svg>
        </div>
      </div>
    </VizShell>
  )
}
