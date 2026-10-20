import { useMemo, useState } from 'react'
import { Slider, VizShell } from '../viz/VizShell'

const SCHEMES = [
  { name: 'BPSK', m: 2 },
  { name: 'QPSK', m: 4 },
  { name: '16-QAM', m: 16 },
  { name: '64-QAM', m: 64 },
  { name: '256-QAM', m: 256 },
  { name: '1024-QAM', m: 1024 },
] as const

const BANDWIDTHS = [20, 40, 80, 160, 320]
// 描く受信点の数。誤り率が 1e-3 を下回ると 1 件も出ないことが多いので、件数ではなく理論値も並べて出す
const SAMPLES = 800
const SIZE = 300

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function erfc(x: number) {
  // Numerical Recipes の erfcc。相対誤差 1.2e-7 以下で、ここでの表示には十分
  const z = Math.abs(x)
  const t = 1 / (1 + 0.5 * z)
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    )
  return x >= 0 ? r : 2 - r
}

const q = (x: number) => 0.5 * erfc(x / Math.SQRT2)

function theoryBer(m: number, snr: number) {
  if (m === 2) return q(Math.sqrt(2 * snr))
  const k = Math.log2(m)
  return Math.min(0.5, (4 / k) * (1 - 1 / Math.sqrt(m)) * q(Math.sqrt((3 * snr) / (m - 1))))
}

type Point = { ix: number; iq: number; x: number; y: number; ok: boolean }

/** 平均電力 1 に正規化した各軸の振幅（BPSK は I 軸だけ） */
function axisLevels(m: number) {
  if (m === 2) return { side: 2, lv: [-1, 1], q: false }
  const side = Math.round(Math.sqrt(m))
  const raw = Array.from({ length: side }, (_, i) => 2 * i - (side - 1))
  const es = (2 * raw.reduce((s, v) => s + v * v, 0)) / side
  return { side, lv: raw.map((v) => v / Math.sqrt(es)), q: true }
}

function receive(m: number, snrDb: number): Point[] {
  const { side, lv, q: hasQ } = axisLevels(m)
  const snr = 10 ** (snrDb / 10)
  const sigma = Math.sqrt(1 / (2 * snr))
  const rnd = mulberry32(m * 7919 + 1)
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd())
  const nearest = (v: number) => {
    let best = 0
    for (let j = 1; j < side; j++) if (Math.abs(lv[j]! - v) < Math.abs(lv[best]! - v)) best = j
    return best
  }
  const pts: Point[] = []
  for (let n = 0; n < SAMPLES; n++) {
    const ix = Math.floor(rnd() * side)
    const iq = hasQ ? Math.floor(rnd() * side) : 0
    const x = lv[ix]! + gauss() * sigma
    const y = (hasQ ? lv[iq]! : 0) + gauss() * sigma
    const ok = nearest(x) === ix && (!hasQ || nearest(y) === iq)
    pts.push({ ix, iq, x, y, ok })
  }
  return pts
}

function fmtBer(v: number) {
  if (v < 1e-12) return '1e-12 未満'
  return v.toExponential(1)
}

export default function QamConstellation() {
  const [m, setM] = useState<number>(16)
  const [snrDb, setSnrDb] = useState(18)
  const [bw, setBw] = useState(80)

  const pts = useMemo(() => receive(m, snrDb), [m, snrDb])
  const { side, lv, q: hasQ } = axisLevels(m)
  const errs = pts.filter((p) => !p.ok).length
  const bits = Math.log2(m)
  const snr = 10 ** (snrDb / 10)
  const ber = theoryBer(m, snr)
  const capacity = bw * Math.log2(1 + snr)
  const span = Math.max(1.6, (lv[side - 1] ?? 1) * 1.45)
  const toPx = (v: number) => SIZE / 2 + (v / span) * (SIZE / 2)
  const bounds = lv.slice(0, -1).map((v, i) => (v + lv[i + 1]!) / 2)

  const btn = (active: boolean) => ({
    borderColor: active ? 'var(--accent)' : 'var(--border)',
    background: active ? 'var(--accent-soft)' : 'var(--bg)',
    color: active ? 'var(--accent)' : 'var(--fg)',
  })

  return (
    <VizShell
      title="変調方式と雑音"
      subtitle="1 つの記号に詰めるビットを増やすほど点の間隔が詰まり、同じ雑音でも隣の点と見分けられなくなる"
      controls={
        <>
          <span className="flex flex-wrap items-center gap-1">
            <span style={{ color: 'var(--fg-muted)' }}>変調</span>
            {SCHEMES.map((s) => (
              <button
                key={s.name}
                onClick={() => setM(s.m)}
                className="rounded border px-2 py-1 font-mono text-[11px]"
                style={btn(m === s.m)}
              >
                {s.name}
              </button>
            ))}
          </span>
          <Slider label="SNR" value={snrDb} min={0} max={40} step={1} onChange={setSnrDb} format={(v) => `${v} dB`} />
          <span className="flex flex-wrap items-center gap-1">
            <span style={{ color: 'var(--fg-muted)' }}>帯域幅</span>
            {BANDWIDTHS.map((b) => (
              <button
                key={b}
                onClick={() => setBw(b)}
                className="rounded border px-2 py-1 font-mono text-[11px]"
                style={btn(bw === b)}
              >
                {b}MHz
              </button>
            ))}
          </span>
        </>
      }
      readout={
        <>
          <div>
            {bits} ビット / 記号。描いた {SAMPLES} 個のうち、隣の点と取り違えた記号は{' '}
            <span style={{ color: errs > 0 ? 'var(--danger)' : 'var(--ok)' }}>{errs} 個</span>
          </div>
          <div>ビット誤り率（理論値、誤り訂正なし）: {fmtBer(ber)}</div>
          <div>
            シャノンの限界 {bw}MHz × log2(1 + {snr.toFixed(snr < 10 ? 1 : 0)}) ={' '}
            <span style={{ color: 'var(--accent)' }}>{capacity.toFixed(0)} Mbit/s</span>（アンテナ 1 組あたり）
          </div>
        </>
      }
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label="コンスタレーション図">
        <rect x={0} y={0} width={SIZE} height={SIZE} fill="var(--bg)" stroke="var(--border)" />
        <line x1={0} x2={SIZE} y1={SIZE / 2} y2={SIZE / 2} stroke="var(--border)" />
        <line y1={0} y2={SIZE} x1={SIZE / 2} x2={SIZE / 2} stroke="var(--border)" />
        {bounds.map((b) => (
          <g key={b}>
            <line x1={toPx(b)} x2={toPx(b)} y1={0} y2={SIZE} stroke="var(--fg-muted)" strokeOpacity={0.25} strokeDasharray="2 3" />
            {hasQ && (
              <line y1={toPx(-b)} y2={toPx(-b)} x1={0} x2={SIZE} stroke="var(--fg-muted)" strokeOpacity={0.25} strokeDasharray="2 3" />
            )}
          </g>
        ))}
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={toPx(p.x)}
            cy={toPx(-p.y)}
            r={side > 16 ? 1.2 : 1.8}
            fill={p.ok ? 'var(--accent)' : 'var(--danger)'}
            fillOpacity={p.ok ? 0.45 : 0.95}
          />
        ))}
        {lv.flatMap((x) =>
          (hasQ ? lv : [0]).map((y) => (
            <circle key={`${x}-${y}`} cx={toPx(x)} cy={toPx(-y)} r={side > 16 ? 1.4 : 3} fill="var(--fg)" />
          )),
        )}
        <text x={SIZE - 6} y={SIZE / 2 - 6} textAnchor="end" fontSize={10} fill="var(--fg-muted)">
          I（同相）
        </text>
        <text x={SIZE / 2 + 6} y={12} fontSize={10} fill="var(--fg-muted)">
          Q（直交）
        </text>
      </svg>
    </VizShell>
  )
}
