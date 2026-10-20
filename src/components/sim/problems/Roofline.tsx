import { useState } from 'react'
import { Field } from '../core/Controls'
import { Slider, VizShell } from '../viz/VizShell'

const W = 560
const H = 340
const PAD = { l: 64, r: 16, t: 16, b: 44 }
const X_MIN = -1
const X_MAX = 4
const Y_MIN = 0
const Y_MAX = 7

const sx = (ai: number) => PAD.l + ((Math.log10(ai) - X_MIN) / (X_MAX - X_MIN)) * (W - PAD.l - PAD.r)
const sy = (gflops: number) => H - PAD.b - ((Math.log10(gflops) - Y_MIN) / (Y_MAX - Y_MIN)) * (H - PAD.t - PAD.b)
const clampY = (g: number) => Math.min(Math.max(g, 10 ** Y_MIN), 10 ** Y_MAX)

// 1 語生成の点で使う重み行列の一辺。層 1 枚ぶんの d×d の行列を代表として扱う
const D_MODEL = 4096

const PRECISIONS = [
  { name: 'FP32（4 バイト）', bytes: 4 },
  { name: 'FP16 / BF16（2 バイト）', bytes: 2 },
  { name: 'FP8 / INT8（1 バイト）', bytes: 1 },
]

const fmtNum = (v: number) =>
  v >= 1e6 ? `${(v / 1e6).toFixed(1)}P` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}T` : v >= 1 ? `${v.toFixed(1)}G` : `${(v * 1e3).toFixed(0)}M`

export default function Roofline() {
  const [bwExp, setBwExp] = useState(Math.log10(200))
  const [peakExp, setPeakExp] = useState(Math.log10(5000))
  const [nExp, setNExp] = useState(10)
  const [bExp, setBExp] = useState(0)
  const [bytes, setBytes] = useState(4)

  const bw = 10 ** bwExp
  const peak = 10 ** peakExp
  const n = 2 ** Math.round(nExp)
  const batch = 2 ** Math.round(bExp)
  const ridge = peak / bw

  const points = [
    {
      name: `行列積 n=${n}`,
      ai: (2 * n ** 3) / (3 * n * n * bytes),
      color: 'var(--accent)',
    },
    {
      name: '行列×ベクトル',
      ai: (2 * D_MODEL * D_MODEL) / ((D_MODEL * D_MODEL + 2 * D_MODEL) * bytes),
      color: 'var(--warn)',
    },
    {
      name: `1 語生成 B=${batch}`,
      ai: (2 * D_MODEL * D_MODEL * batch) / ((D_MODEL * D_MODEL + 2 * D_MODEL * batch) * bytes),
      color: 'var(--ok)',
    },
  ].map((p) => {
    const attainable = Math.min(peak, bw * p.ai)
    return { ...p, attainable, bound: bw * p.ai < peak ? 'メモリ帯域で頭打ち' : '演算性能で頭打ち' }
  })

  const roof: [number, number][] = [
    [10 ** X_MIN, bw * 10 ** X_MIN],
    [ridge, peak],
    [10 ** X_MAX, peak],
  ]
  const roofPath = roof.map(([a, g], i) => `${i === 0 ? 'M' : 'L'}${sx(a)},${sy(clampY(g))}`).join(' ')

  return (
    <VizShell
      title="ルーフライン"
      subtitle="横軸は 1 バイト読むあたりの演算回数、縦軸は出せる速さ。どちらも対数。屋根より上には行けない"
      controls={
        <>
          <Slider label="メモリ帯域" value={bwExp} min={1} max={4} onChange={setBwExp} format={(v) => `${Math.round(10 ** v)} GB/s`} />
          <Slider
            label="演算性能の上限"
            value={peakExp}
            min={2}
            max={6.3}
            onChange={setPeakExp}
            format={(v) => `${fmtNum(10 ** v)}FLOP/s`}
          />
          <Slider label="行列の一辺 n" value={nExp} min={6} max={14} step={1} onChange={setNExp} format={(v) => String(2 ** Math.round(v))} />
          <Slider label="同時に生成する本数 B" value={bExp} min={0} max={9} step={1} onChange={setBExp} format={(v) => String(2 ** Math.round(v))} />
          <Field label="1 要素の大きさ">
            <span className="flex flex-wrap gap-1">
              {PRECISIONS.map((p) => (
                <button
                  key={p.bytes}
                  onClick={() => setBytes(p.bytes)}
                  className="rounded border px-2 py-1 font-mono text-[11px]"
                  style={{
                    borderColor: p.bytes === bytes ? 'var(--accent)' : 'var(--border)',
                    color: p.bytes === bytes ? 'var(--accent)' : 'var(--fg)',
                    background: 'var(--bg)',
                  }}
                >
                  {p.name}
                </button>
              ))}
            </span>
          </Field>
        </>
      }
      readout={
        <>
          <div>
            屋根の折れ目（リッジ）: {ridge.toFixed(1)} FLOP/バイト。これより左の仕事は、演算器がどれだけ速くてもメモリが追いつかない
          </div>
          {points.map((p) => (
            <div key={p.name}>
              <span style={{ color: p.color }}>●</span> {p.name}: 演算強度 {p.ai.toFixed(2)} FLOP/バイト → 最大{' '}
              {fmtNum(p.attainable)}FLOP/s（{p.bound}）
            </div>
          ))}
        </>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ maxWidth: W }} role="img" aria-label="ルーフライン図">
        {Array.from({ length: X_MAX - X_MIN + 1 }, (_, i) => X_MIN + i).map((e) => (
          <g key={`x${e}`}>
            <line x1={sx(10 ** e)} x2={sx(10 ** e)} y1={PAD.t} y2={H - PAD.b} stroke="var(--border)" />
            <text x={sx(10 ** e)} y={H - PAD.b + 16} textAnchor="middle" fontSize={11} fill="var(--fg-muted)">
              {10 ** e < 1 ? (10 ** e).toFixed(1) : 10 ** e}
            </text>
          </g>
        ))}
        {Array.from({ length: Y_MAX - Y_MIN + 1 }, (_, i) => Y_MIN + i).map((e) => (
          <g key={`y${e}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(10 ** e)} y2={sy(10 ** e)} stroke="var(--border)" />
            <text x={PAD.l - 6} y={sy(10 ** e) + 4} textAnchor="end" fontSize={11} fill="var(--fg-muted)">
              {fmtNum(10 ** e)}
            </text>
          </g>
        ))}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--fg-muted)">
          演算強度（FLOP / バイト）
        </text>
        <text
          x={14}
          y={(PAD.t + H - PAD.b) / 2}
          textAnchor="middle"
          fontSize={11}
          fill="var(--fg-muted)"
          transform={`rotate(-90 14 ${(PAD.t + H - PAD.b) / 2})`}
        >
          出せる速さ（FLOP/s）
        </text>
        {ridge >= 10 ** X_MIN && ridge <= 10 ** X_MAX && (
          <line x1={sx(ridge)} x2={sx(ridge)} y1={sy(clampY(peak))} y2={H - PAD.b} stroke="var(--fg-muted)" strokeDasharray="4 4" />
        )}
        <path d={roofPath} fill="none" stroke="var(--fg)" strokeWidth={2.5} />
        {points.map((p) =>
          p.ai >= 10 ** X_MIN && p.ai <= 10 ** X_MAX ? (
            <g key={p.name}>
              <circle cx={sx(p.ai)} cy={sy(clampY(p.attainable))} r={6} fill={p.color} />
              <text x={sx(p.ai) + 9} y={sy(clampY(p.attainable)) + 14} fontSize={11} fill={p.color}>
                {p.name}
              </text>
            </g>
          ) : null,
        )}
      </svg>
    </VizShell>
  )
}
