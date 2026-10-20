import { useMemo, useState } from 'react'
import { Slider, VizShell } from '../viz/VizShell'
import { PresetControl } from '../core/Controls'

type Fit = { e: number; a: number; b: number; alpha: number; beta: number }

// L(N, D) = E + A/N^α + B/D^β の係数。損失は 1 トークンあたりの nats
const FITS: { name: string; value: Fit }[] = [
  // Hoffmann et al. 2022 の本文の式 (10)（丸めた値）
  { name: '論文の本文の値', value: { e: 1.69, a: 406.4, b: 410.7, alpha: 0.34, beta: 0.28 } },
  // 同じ論文の TeX ソースのコメントにある丸める前の値（Besiroglu et al. 2024 の式 (4) で確認）
  { name: '丸める前の値', value: { e: 1.6934, a: 406.4, b: 410.7, alpha: 0.3392, beta: 0.2849 } },
  // Besiroglu et al. 2024 が図から読み取ったデータに当てはめ直した値（式 (3)）
  { name: '再現研究の値', value: { e: 1.8172, a: 482.01, b: 2085.43, alpha: 0.3478, beta: 0.3658 } },
]

const lossOf = (f: Fit, n: number, d: number) => f.e + f.a / n ** f.alpha + f.b / d ** f.beta

// 学習の計算量は C ≈ 6ND（Kaplan et al. 2020 の近似。Hoffmann et al. 2022 も同じものを使う）
const flops = (n: number, d: number) => 6 * n * d

/** C を固定したとき損失を最小にする N。A·N^-α + B·(C/6N)^-β を N で微分して 0 と置いた解 */
function optimalN(f: Fit, c: number) {
  const g = ((f.alpha * f.a) / (f.beta * f.b)) ** (1 / (f.alpha + f.beta))
  return g * (c / 6) ** (f.beta / (f.alpha + f.beta))
}

const LOG_N = [7, 12] as const
const LOG_D = [9, 13.5] as const
const W = 560
const H = 300
const PAD = { l: 48, r: 12, t: 10, b: 34 }
const CW = 560
const CH = 150

// Hoffmann et al. 2022 の Table 1 にあるパラメータ数と学習トークン数
const MODELS = [
  { name: 'GPT-3', n: 175e9, d: 300e9 },
  { name: 'Gopher', n: 280e9, d: 300e9 },
  { name: 'Chinchilla', n: 70e9, d: 1.4e12 },
]

const PRESETS = [
  { name: 'GPT-3 と同じ', value: { ln: Math.log10(175e9), ld: Math.log10(300e9) } },
  { name: 'Chinchilla と同じ', value: { ln: Math.log10(70e9), ld: Math.log10(1.4e12) } },
  { name: '小さく長く', value: { ln: 9, ld: 12.5 } },
  { name: '大きく短く', value: { ln: 11.5, ld: 10 } },
]

const fmt = (x: number) => {
  const units: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
  ]
  for (const [u, s] of units) if (x >= u) return `${(x / u).toPrecision(3)}${s}`
  return x.toPrecision(3)
}

const sx = (v: number) => PAD.l + ((v - LOG_N[0]) / (LOG_N[1] - LOG_N[0])) * (W - PAD.l - PAD.r)
const sy = (v: number) => H - PAD.b - ((v - LOG_D[0]) / (LOG_D[1] - LOG_D[0])) * (H - PAD.t - PAD.b)
const cx = (v: number) => PAD.l + ((v - LOG_N[0]) / (LOG_N[1] - LOG_N[0])) * (CW - PAD.l - PAD.r)

// 塗りは 24×18 の格子。細かくするとページに出力される SVG の要素が増えすぎる
const NX = 24
const NY = 18

function cellsOf(f: Fit) {
  // 塗りの濃さの基準。図の左下（最も小さく短い）の損失を 0、下限 E を 1 とする
  const far = lossOf(f, 10 ** LOG_N[0], 10 ** LOG_D[0])
  const out: { x: number; y: number; w: number; h: number; o: number }[] = []
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NY; j++) {
      const a = LOG_N[0] + ((i + 0.5) / NX) * (LOG_N[1] - LOG_N[0])
      const b = LOG_D[0] + ((j + 0.5) / NY) * (LOG_D[1] - LOG_D[0])
      const l = lossOf(f, 10 ** a, 10 ** b)
      out.push({
        x: sx(LOG_N[0] + (i / NX) * (LOG_N[1] - LOG_N[0])),
        y: sy(LOG_D[0] + ((j + 1) / NY) * (LOG_D[1] - LOG_D[0])),
        w: (W - PAD.l - PAD.r) / NX + 0.5,
        h: (H - PAD.t - PAD.b) / NY + 0.5,
        o: 0.06 + 0.5 * Math.max(0, Math.min(1, (far - l) / (far - f.e))),
      })
    }
  }
  return out
}

export default function ScalingLaw() {
  const [ln, setLn] = useState(Math.log10(175e9))
  const [ld, setLd] = useState(Math.log10(300e9))
  const [fit, setFit] = useState<Fit>(FITS[0]!.value)
  const cells = useMemo(() => cellsOf(fit), [fit])


  const n = 10 ** ln
  const d = 10 ** ld
  const c = flops(n, d)
  const L = lossOf(fit, n, d)
  const nOpt = optimalN(fit, c)
  const dOpt = c / (6 * nOpt)
  const lOpt = lossOf(fit, nOpt, dOpt)

  // 同じ計算量の線：log D = log(C/6) − log N
  const isoD = (a: number) => Math.log10(c / 6) - a
  const isoPts = [LOG_N[0], LOG_N[1]].map((a) => [a, isoD(a)] as const)

  // 下の図：同じ計算量のまま N を動かしたときの損失
  const curve = useMemo(() => {
    const pts: [number, number][] = []
    for (let i = 0; i <= 120; i++) {
      const a = LOG_N[0] + (i / 120) * (LOG_N[1] - LOG_N[0])
      const dd = c / (6 * 10 ** a)
      if (dd < 1) continue
      pts.push([a, lossOf(fit, 10 ** a, dd)])
    }
    return pts
  }, [c, fit])
  const lMin = Math.min(...curve.map((p) => p[1]))
  const lTop = Math.min(lMin + 1.2, Math.max(...curve.map((p) => p[1])))
  const cy = (v: number) => CH - 24 - ((Math.min(v, lTop) - lMin) / (lTop - lMin || 1)) * (CH - 34)

  return (
    <VizShell
      title="スケーリング則：同じ計算量を、パラメータとデータにどう配るか"
      subtitle="L(N, D) = E + A/N^α + B/D^β で予測される損失を、パラメータ数とトークン数の平面に塗る。係数は 3 通りから選べる"
      controls={
        <>
          <Slider label="パラメータ数 N" value={ln} min={LOG_N[0]} max={LOG_N[1]} step={0.01} onChange={setLn} format={(v) => fmt(10 ** v)} />
          <Slider label="学習トークン数 D" value={ld} min={LOG_D[0]} max={LOG_D[1]} step={0.01} onChange={setLd} format={(v) => fmt(10 ** v)} />
          <PresetControl label="係数" presets={FITS} onPick={setFit} />
          <PresetControl
            label="例"
            presets={PRESETS}
            onPick={(p) => {
              setLn(p.ln)
              setLd(p.ld)
            }}
          />
        </>
      }
      readout={
        <>
          <div>
            いまの点: N = {fmt(n)}、D = {fmt(d)}（1 パラメータあたり {(d / n).toFixed(1)} トークン）、計算量 C = 6ND ={' '}
            {c.toExponential(2)} FLOP、予測損失 L = {L.toFixed(3)}
          </div>
          <div>
            同じ C での最適: N* = {fmt(nOpt)}、D* = {fmt(dOpt)}（1 パラメータあたり {(dOpt / nOpt).toFixed(1)} トークン）、L* ={' '}
            {lOpt.toFixed(3)}（いまの点との差 {(L - lOpt).toFixed(3)}）
          </div>
          <div>
            係数: E = {fit.e}、A = {fit.a}、B = {fit.b}、α = {fit.alpha}、β = {fit.beta}
          </div>
        </>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: 'block' }} role="img" aria-label="パラメータ数と学習トークン数に対する予測損失">
        {cells.map((k, i) => (
          <rect
            key={i}
            x={k.x}
            y={k.y}
            width={k.w}
            height={k.h}
            fill="var(--accent)"
            opacity={k.o}
          />
        ))}
        {[7, 8, 9, 10, 11, 12].map((v) => (
          <g key={`x${v}`}>
            <line x1={sx(v)} x2={sx(v)} y1={PAD.t} y2={H - PAD.b} stroke="var(--border)" strokeWidth={0.5} />
            <text x={sx(v)} y={H - PAD.b + 14} fontSize={10} textAnchor="middle" fill="var(--fg-muted)">
              {fmt(10 ** v)}
            </text>
          </g>
        ))}
        {[9, 10, 11, 12, 13].map((v) => (
          <g key={`y${v}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(v)} y2={sy(v)} stroke="var(--border)" strokeWidth={0.5} />
            <text x={PAD.l - 4} y={sy(v) + 3} fontSize={10} textAnchor="end" fill="var(--fg-muted)">
              {fmt(10 ** v)}
            </text>
          </g>
        ))}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 4} fontSize={10} textAnchor="middle" fill="var(--fg-muted)">
          パラメータ数 N（対数）
        </text>
        <text x={10} y={(PAD.t + H - PAD.b) / 2} fontSize={10} textAnchor="middle" fill="var(--fg-muted)" transform={`rotate(-90 10 ${(PAD.t + H - PAD.b) / 2})`}>
          学習トークン数 D（対数）
        </text>
        <defs>
          <clipPath id="sl-plot">
            <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} />
          </clipPath>
        </defs>
        <g clipPath="url(#sl-plot)">
          <line
            x1={sx(LOG_N[0])}
            y1={sy(LOG_N[0] + Math.log10(20))}
            x2={sx(LOG_N[1])}
            y2={sy(LOG_N[1] + Math.log10(20))}
            stroke="var(--ok)"
            strokeDasharray="4 3"
            strokeWidth={1.2}
          />
          <line x1={sx(isoPts[0]![0])} y1={sy(isoPts[0]![1])} x2={sx(isoPts[1]![0])} y2={sy(isoPts[1]![1])} stroke="var(--warn)" strokeWidth={1.5} />
          {MODELS.map((m) => (
            <g key={m.name}>
              <circle cx={sx(Math.log10(m.n))} cy={sy(Math.log10(m.d))} r={3} fill="var(--fg-muted)" />
              <text x={sx(Math.log10(m.n)) + 5} y={sy(Math.log10(m.d)) - 4} fontSize={9} fill="var(--fg-muted)">
                {m.name}
              </text>
            </g>
          ))}
          <circle cx={sx(Math.log10(nOpt))} cy={sy(Math.log10(dOpt))} r={5} fill="none" stroke="var(--ok)" strokeWidth={2} />
          <circle cx={sx(ln)} cy={sy(ld)} r={5} fill="var(--danger)" />
        </g>
        <text x={W - PAD.r - 4} y={PAD.t + 12} fontSize={9} textAnchor="end" fill="var(--ok)">
          破線: D = 20N　○: 同じ計算量での最適
        </text>
        <text x={W - PAD.r - 4} y={PAD.t + 24} fontSize={9} textAnchor="end" fill="var(--warn)">
          実線: いまの点と同じ計算量
        </text>
      </svg>
      <p className="m-0 mt-3 text-[11px]" style={{ color: 'var(--fg-muted)' }}>
        同じ計算量のまま N を動かしたときの予測損失（縦軸は最小値から 1.2 の幅）
      </p>
      <svg viewBox={`0 0 ${CW} ${CH}`} width="100%" style={{ maxWidth: CW, display: 'block' }} role="img" aria-label="同じ計算量での損失の曲線">
        <line x1={PAD.l} x2={CW - PAD.r} y1={CH - 24} y2={CH - 24} stroke="var(--border)" />
        {[7, 8, 9, 10, 11, 12].map((v) => (
          <text key={v} x={cx(v)} y={CH - 10} fontSize={10} textAnchor="middle" fill="var(--fg-muted)">
            {fmt(10 ** v)}
          </text>
        ))}
        <text x={PAD.l - 4} y={cy(lMin) + 3} fontSize={10} textAnchor="end" fill="var(--fg-muted)">
          {lMin.toFixed(2)}
        </text>
        <text x={PAD.l - 4} y={cy(lTop) + 3} fontSize={10} textAnchor="end" fill="var(--fg-muted)">
          {lTop.toFixed(2)}
        </text>
        <polyline points={curve.map(([a, l]) => `${cx(a)},${cy(l)}`).join(' ')} fill="none" stroke="var(--warn)" strokeWidth={1.5} />
        <circle cx={cx(Math.log10(nOpt))} cy={cy(lOpt)} r={4} fill="none" stroke="var(--ok)" strokeWidth={2} />
        <circle cx={cx(ln)} cy={cy(L)} r={4} fill="var(--danger)" />
      </svg>
    </VizShell>
  )
}
