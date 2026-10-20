import { useState } from 'react'
import { PresetControl } from '../core/Controls'
import { Slider, VizShell } from '../viz/VizShell'

const SIZE = 320
const UNIT = 36
const O = SIZE / 2
const RAD = Math.PI / 180

type State = { angA: number; lenA: number; angB: number; lenB: number }

const PRESETS: { name: string; value: State }[] = [
  // (3,1) と (1,2)。本文で手計算する組
  { name: '本文の例', value: { angA: Math.atan2(1, 3) / RAD, lenA: Math.hypot(3, 1), angB: Math.atan2(2, 1) / RAD, lenB: Math.hypot(1, 2) } },
  { name: '同じ向き', value: { angA: 30, lenA: 3, angB: 30, lenB: 2 } },
  { name: '直角', value: { angA: 20, lenA: 3, angB: 110, lenB: 2.5 } },
  { name: '逆向き', value: { angA: 30, lenA: 3, angB: 210, lenB: 2 } },
  { name: '長さだけ違う', value: { angA: 40, lenA: 1, angB: 55, lenB: 4 } },
]

const px = (x: number) => O + x * UNIT
const py = (y: number) => O - y * UNIT
const f2 = (v: number) => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2)

function Arrow({ x, y, color, label }: { x: number; y: number; color: string; label: string }) {
  const len = Math.hypot(x, y)
  const ux = len === 0 ? 0 : x / len
  const uy = len === 0 ? 0 : y / len
  const hx = px(x)
  const hy = py(y)
  const back = 10 / UNIT
  const wing = 5 / UNIT
  const bx = x - ux * back
  const by = y - uy * back
  const head = `${hx},${hy} ${px(bx - uy * wing)},${py(by + ux * wing)} ${px(bx + uy * wing)},${py(by - ux * wing)}`
  return (
    <g>
      <line x1={O} y1={O} x2={px(bx)} y2={py(by)} stroke={color} strokeWidth={2.5} />
      <polygon points={head} fill={color} />
      <text x={hx + ux * 12} y={hy - uy * 12} fill={color} fontSize={13} fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
        {label}
      </text>
    </g>
  )
}

export default function VectorDot() {
  const [s, setS] = useState<State>(PRESETS[0]!.value)
  const set = (k: keyof State) => (v: number) => setS((p) => ({ ...p, [k]: v }))

  const ax = s.lenA * Math.cos(s.angA * RAD)
  const ay = s.lenA * Math.sin(s.angA * RAD)
  const bx = s.lenB * Math.cos(s.angB * RAD)
  const by = s.lenB * Math.sin(s.angB * RAD)
  const dot = ax * bx + ay * by
  const cos = dot / (s.lenA * s.lenB)
  const theta = Math.acos(Math.max(-1, Math.min(1, cos))) / RAD
  // b を a の向きの直線へ落とした足。影の長さは |b|cosθ で、負なら a と逆側に伸びる
  const k = dot / (s.lenA * s.lenA)
  const fx = ax * k
  const fy = ay * k
  const shadow = s.lenB * cos

  const arcR = 0.8
  let d = ((s.angB - s.angA) % 360 + 360) % 360
  const sweep = d <= 180 ? 1 : 0
  if (d > 180) d = 360 - d
  const arcEnd = s.angA + (sweep ? d : -d)
  const arc = `M ${px(arcR * Math.cos(s.angA * RAD))} ${py(arcR * Math.sin(s.angA * RAD))} A ${arcR * UNIT} ${arcR * UNIT} 0 0 ${sweep ? 0 : 1} ${px(arcR * Math.cos(arcEnd * RAD))} ${py(arcR * Math.sin(arcEnd * RAD))}`

  const grid = []
  for (let i = -4; i <= 4; i++) {
    grid.push(<line key={`v${i}`} x1={px(i)} y1={0} x2={px(i)} y2={SIZE} stroke="var(--border)" strokeWidth={i === 0 ? 1.5 : 0.5} />)
    grid.push(<line key={`h${i}`} x1={0} y1={py(i)} x2={SIZE} y2={py(i)} stroke="var(--border)" strokeWidth={i === 0 ? 1.5 : 0.5} />)
  }

  return (
    <VizShell
      title="2 本のベクトルの内積"
      subtitle="向きと長さを動かすと、成分・長さ・内積・コサイン類似度が一緒に変わる。黄色の太線は b を a の向きへ落とした影"
      controls={
        <>
          <PresetControl label="例" presets={PRESETS} onPick={setS} />
          <Slider label="a の向き" value={s.angA} min={0} max={360} step={1} onChange={set('angA')} format={(v) => `${v.toFixed(0)}°`} />
          <Slider label="a の長さ" value={s.lenA} min={0.5} max={4} step={0.05} onChange={set('lenA')} />
          <Slider label="b の向き" value={s.angB} min={0} max={360} step={1} onChange={set('angB')} format={(v) => `${v.toFixed(0)}°`} />
          <Slider label="b の長さ" value={s.lenB} min={0.5} max={4} step={0.05} onChange={set('lenB')} />
        </>
      }
      readout={
        <>
          <div>
            a = ({f2(ax)}, {f2(ay)})　|a| = {f2(s.lenA)}　　b = ({f2(bx)}, {f2(by)})　|b| = {f2(s.lenB)}
          </div>
          <div>
            成分で：a·b = {f2(ax)}×{f2(bx)} + {f2(ay)}×{f2(by)} ={' '}
            <span style={{ color: 'var(--fg)' }}>{f2(dot)}</span>
          </div>
          <div>
            長さと角度で：|a|×|b|×cosθ = {f2(s.lenA)}×{f2(s.lenB)}×{f2(cos)} ={' '}
            <span style={{ color: 'var(--fg)' }}>{f2(s.lenA * s.lenB * cos)}</span>
          </div>
          <div>
            θ = {theta.toFixed(1)}°　コサイン類似度 cosθ ={' '}
            <span style={{ color: cos > 0.05 ? 'var(--ok)' : cos < -0.05 ? 'var(--danger)' : 'var(--fg)' }}>{f2(cos)}</span>
            　影の長さ |b|cosθ = {f2(shadow)}（a·b = |a| × 影）
          </div>
        </>
      }
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" style={{ maxWidth: SIZE, display: 'block', margin: '0 auto' }}>
        {grid}
        <line
          x1={px(-ax * 10)}
          y1={py(-ay * 10)}
          x2={px(ax * 10)}
          y2={py(ay * 10)}
          stroke="var(--accent)"
          strokeOpacity={0.25}
          strokeDasharray="3 4"
        />
        <line x1={px(bx)} y1={py(by)} x2={px(fx)} y2={py(fy)} stroke="var(--fg-muted)" strokeDasharray="4 3" />
        <line x1={O} y1={O} x2={px(fx)} y2={py(fy)} stroke="var(--warn)" strokeWidth={6} strokeOpacity={0.7} strokeLinecap="round" />
        <path d={arc} fill="none" stroke="var(--fg-muted)" />
        <Arrow x={ax} y={ay} color="var(--accent)" label="a" />
        <Arrow x={bx} y={by} color="var(--ok)" label="b" />
      </svg>
    </VizShell>
  )
}
