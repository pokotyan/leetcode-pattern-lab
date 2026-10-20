import { useMemo, useState } from 'react'
import { Slider, VizShell } from '../viz/VizShell'

const WORDS = ['猫', '犬', '人', '王', '車']
const INITIAL = [3, 2, 1, 0.5, -1]

const PRESETS: { name: string; logits: number[] }[] = [
  { name: '本文の例', logits: INITIAL },
  { name: '迷っている', logits: [1, 0.9, 0.8, 0.7, 0.6] },
  { name: '自信満々', logits: [6, 0, 0, 0, 0] },
  { name: '大きな点数', logits: [1000, 999, 998.1, 990, 980] },
]

const W = 420
const H = 200
const BAR_W = 52
const GAP = (W - BAR_W * WORDS.length) / (WORDS.length + 1)

function softmax(z: number[], t: number) {
  const s = z.map((v) => v / t)
  // 最大値を引いてから exp を取る。引かないと e^1000 が Infinity になり、Infinity / Infinity = NaN になる
  const m = Math.max(...s)
  const e = s.map((v) => Math.exp(v - m))
  const sum = e.reduce((a, b) => a + b, 0)
  return e.map((v) => v / sum)
}

const fmt = (v: number) => (v >= 0.0001 || v === 0 ? v.toFixed(4) : v.toExponential(1))

export default function SoftmaxTemperature() {
  const [z, setZ] = useState<number[]>(INITIAL)
  const [t, setT] = useState(1)
  const [answer, setAnswer] = useState(0)

  const p = useMemo(() => softmax(z, t), [z, t])
  const entropy = -p.reduce((s, v) => s + (v > 0 ? v * Math.log2(v) : 0), 0)
  const ce = -Math.log(p[answer]!)
  const grad = p.map((v, i) => v - (i === answer ? 1 : 0))
  const big = Math.max(...z.map(Math.abs)) > 50

  const btn = (active: boolean) => ({
    borderColor: active ? 'var(--accent)' : 'var(--border)',
    background: active ? 'var(--accent-soft)' : 'var(--bg)',
    color: active ? 'var(--accent)' : 'var(--fg)',
  })

  return (
    <VizShell
      title="softmax と温度、交差エントロピー"
      subtitle="「吾輩は ___ である」の空欄に入る語の点数を動かすと、確率・エントロピー・外れ方の大きさが一緒に動く"
      controls={
        <>
          <span className="flex flex-wrap items-center gap-1">
            <span style={{ color: 'var(--fg-muted)' }}>点数の組</span>
            {PRESETS.map((pr) => (
              <button
                key={pr.name}
                onClick={() => setZ(pr.logits)}
                className="rounded border px-2 py-1 text-[11px]"
                style={btn(pr.logits.every((v, i) => v === z[i]))}
              >
                {pr.name}
              </button>
            ))}
          </span>
          {!big &&
            WORDS.map((w, i) => (
              <Slider
                key={w}
                label={`点数 ${w}`}
                value={z[i]!}
                min={-5}
                max={8}
                step={0.1}
                onChange={(v) => setZ(z.map((x, j) => (j === i ? v : x)))}
                format={(v) => v.toFixed(1)}
              />
            ))}
          <Slider label="温度 T" value={t} min={0.1} max={5} step={0.05} onChange={setT} format={(v) => v.toFixed(2)} />
          <span className="flex flex-wrap items-center gap-1">
            <span style={{ color: 'var(--fg-muted)' }}>正解</span>
            {WORDS.map((w, i) => (
              <button
                key={w}
                onClick={() => setAnswer(i)}
                className="rounded border px-2 py-1 text-[11px]"
                style={btn(answer === i)}
              >
                {w}
              </button>
            ))}
          </span>
        </>
      }
      readout={
        <>
          <div>
            点数 z = [{z.map((v) => v.toFixed(1)).join(', ')}]、温度 T = {t.toFixed(2)}
            {big && '（点数が大きいので、最大値を引いてから e の何乗かを取っている）'}
          </div>
          <div>
            エントロピー H = −Σ p log₂ p ={' '}
            <span style={{ color: 'var(--accent)' }}>{entropy.toFixed(3)} ビット</span>（5 つが同じ確率なら最大の{' '}
            {Math.log2(WORDS.length).toFixed(3)}）
          </div>
          <div>
            正解「{WORDS[answer]}」の交差エントロピー −log p ={' '}
            <span style={{ color: ce > 2 ? 'var(--danger)' : 'var(--ok)' }}>{ce.toFixed(3)}</span>（自然対数。p ={' '}
            {fmt(p[answer]!)}）
          </div>
          <div>
            点数を動かす向き（勾配 p − y）= [{grad.map((v) => (v >= 0 ? '+' : '') + v.toFixed(3)).join(', ')}]
          </div>
        </>
      }
    >
      <svg viewBox={`0 0 ${W} ${H + 40}`} width={W} height={H + 40} role="img" aria-label="各語の確率の棒グラフ">
        <rect x={0} y={0} width={W} height={H} fill="var(--bg)" stroke="var(--border)" />
        {[0.25, 0.5, 0.75].map((g) => (
          <g key={g}>
            <line x1={0} x2={W} y1={H - g * (H - 20)} y2={H - g * (H - 20)} stroke="var(--border)" strokeDasharray="2 3" />
            <text x={4} y={H - g * (H - 20) - 3} fontSize={9} fill="var(--fg-muted)">
              {g}
            </text>
          </g>
        ))}
        {WORDS.map((w, i) => {
          const x = GAP + i * (BAR_W + GAP)
          const h = p[i]! * (H - 20)
          return (
            <g key={w}>
              <rect
                x={x}
                y={H - h}
                width={BAR_W}
                height={h}
                fill={i === answer ? 'var(--ok)' : 'var(--accent)'}
                fillOpacity={i === answer ? 0.85 : 0.55}
              />
              <text x={x + BAR_W / 2} y={Math.max(12, H - h - 4)} textAnchor="middle" fontSize={10} fill="var(--fg)">
                {fmt(p[i]!)}
              </text>
              <text x={x + BAR_W / 2} y={H + 16} textAnchor="middle" fontSize={12} fill="var(--fg)">
                {w}
              </text>
              <text x={x + BAR_W / 2} y={H + 32} textAnchor="middle" fontSize={9} fill="var(--fg-muted)">
                z={z[i]!.toFixed(1)}
              </text>
            </g>
          )
        })}
      </svg>
    </VizShell>
  )
}
