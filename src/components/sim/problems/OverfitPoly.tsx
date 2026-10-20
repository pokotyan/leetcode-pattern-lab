import { useMemo, useState } from 'react'
import { Slider, VizShell } from '../viz/VizShell'

// 記事の実測（scratchpad の poly.py）と同じ設定：真の関数 sin(πx)、x は -1〜1 の一様、雑音の標準偏差 0.25
const NOISE = 0.25
const MAX_TRAIN = 80
const N_VAL = 300
const MAX_DEG = 15
const W = 560
const H = 300
const Y_RANGE = 2

const truth = (x: number) => Math.sin(Math.PI * x)

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeData(seed: number, n: number) {
  const rnd = mulberry32(seed)
  const gauss = () => {
    const u = 1 - rnd()
    const v = rnd()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  return Array.from({ length: n }, () => {
    const x = rnd() * 2 - 1
    return { x, y: truth(x) + NOISE * gauss() }
  })
}

// スライダーで点の数を増やしたとき、前の点が入れ替わらず足されていくように、同じ並びの先頭から取る
const TRAIN = makeData(7, MAX_TRAIN)
const VAL = makeData(1234, N_VAL)

/** (XᵀX + λI) w = Xᵀy を部分ピボット付きの消去法で解く */
function fit(pts: { x: number; y: number }[], deg: number, lam: number) {
  const k = deg + 1
  const a = Array.from({ length: k }, () => new Array<number>(k + 1).fill(0))
  for (const { x, y } of pts) {
    const pw = [1]
    for (let i = 1; i < k; i++) pw.push(pw[i - 1]! * x)
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) a[i]![j]! += pw[i]! * pw[j]!
      a[i]![k]! += pw[i]! * y
    }
  }
  for (let i = 0; i < k; i++) a[i]![i]! += lam
  for (let c = 0; c < k; c++) {
    let p = c
    for (let r = c + 1; r < k; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[p]![c]!)) p = r
    ;[a[c], a[p]] = [a[p]!, a[c]!]
    const piv = a[c]![c]!
    if (Math.abs(piv) < 1e-300) continue
    for (let r = 0; r < k; r++) {
      if (r === c) continue
      const f = a[r]![c]! / piv
      if (f === 0) continue
      for (let j = c; j <= k; j++) a[r]![j]! -= f * a[c]![j]!
    }
  }
  return a.map((row, i) => (Math.abs(row[i]!) < 1e-300 ? 0 : row[k]! / row[i]!))
}

const evalPoly = (w: number[], x: number) => w.reduceRight((acc, c) => acc * x + c, 0)
const mse = (w: number[], pts: { x: number; y: number }[]) =>
  pts.reduce((s, p) => s + (evalPoly(w, p.x) - p.y) ** 2, 0) / pts.length

const sx = (x: number) => ((x + 1) / 2) * W
const sy = (y: number) => H / 2 - (Math.max(-Y_RANGE, Math.min(Y_RANGE, y)) / Y_RANGE) * (H / 2)

function curvePath(f: (x: number) => number) {
  const steps = 240
  let d = ''
  for (let i = 0; i <= steps; i++) {
    const x = -1 + (2 * i) / steps
    d += `${i === 0 ? 'M' : 'L'}${sx(x).toFixed(1)},${sy(f(x)).toFixed(1)}`
  }
  return d
}

const fmt = (v: number) => (v >= 1000 ? v.toExponential(1) : v >= 1 ? v.toFixed(2) : v.toFixed(4))

export default function OverfitPoly() {
  const [deg, setDeg] = useState(3)
  const [n, setN] = useState(16)
  const [logLam, setLogLam] = useState(-10)
  const lam = 10 ** logLam
  const train = TRAIN.slice(0, n)

  const w = useMemo(() => fit(train, deg, lam), [n, deg, lam])
  const curve = useMemo(
    () =>
      Array.from({ length: MAX_DEG }, (_, i) => {
        const wi = fit(train, i + 1, lam)
        return { deg: i + 1, train: mse(wi, train), val: mse(wi, VAL) }
      }),
    [n, lam],
  )
  const trainErr = mse(w, train)
  const valErr = mse(w, VAL)
  const maxW = Math.max(...w.map(Math.abs))

  // 誤差の折れ線は桁が大きく変わるので対数で描く。下端は雑音の分散のすぐ下
  const CW = 560
  const CH = 150
  const lo = Math.log10(1e-4)
  const hi = Math.log10(1e3)
  const cx = (d: number) => 30 + ((d - 1) / (MAX_DEG - 1)) * (CW - 50)
  const cy = (v: number) => CH - 20 - ((Math.log10(Math.max(v, 1e-4)) - lo) / (hi - lo)) * (CH - 30)
  const line = (key: 'train' | 'val') =>
    curve.map((c, i) => `${i === 0 ? 'M' : 'L'}${cx(c.deg).toFixed(1)},${cy(Math.min(c[key], 1e3)).toFixed(1)}`).join('')

  return (
    <VizShell
      title="多項式の当てはめと過学習"
      subtitle="灰色の点（検証用）は学習に使わない。次数を上げると訓練の点は全部通るようになるが、検証の点からは外れていく"
      controls={
        <>
          <Slider label="次数" value={deg} min={1} max={MAX_DEG} step={1} onChange={setDeg} format={(v) => String(v)} />
          <Slider label="訓練の点の数" value={n} min={8} max={MAX_TRAIN} step={1} onChange={setN} format={(v) => String(v)} />
          <Slider
            label="正則化 λ"
            value={logLam}
            min={-10}
            max={1}
            step={0.5}
            onChange={setLogLam}
            format={(v) => (v <= -10 ? '≈0' : `1e${v}`)}
          />
        </>
      }
      readout={
        <>
          訓練誤差 {fmt(trainErr)}　検証誤差 {fmt(valErr)}　（雑音そのものの分散は {(NOISE ** 2).toFixed(4)}。平均的にはこれより下がらない）
          <br />
          係数の絶対値の最大 {fmt(maxW)}
        </>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ maxWidth: W }} role="img" aria-label="点と当てはめた曲線">
        <line x1={0} x2={W} y1={sy(0)} y2={sy(0)} stroke="var(--border)" />
        {VAL.map((p, i) => (
          <circle key={`v${i}`} cx={sx(p.x)} cy={sy(p.y)} r={1.8} fill="var(--fg-muted)" opacity={0.35} />
        ))}
        <path d={curvePath(truth)} fill="none" stroke="var(--ok)" strokeWidth={1.5} strokeDasharray="5 4" />
        <path d={curvePath((x) => evalPoly(w, x))} fill="none" stroke="var(--accent)" strokeWidth={2} />
        {train.map((p, i) => (
          <circle key={`t${i}`} cx={sx(p.x)} cy={sy(p.y)} r={3.5} fill="var(--accent)" stroke="var(--bg-soft)" />
        ))}
        <text x={8} y={16} fontSize={11} fill="var(--ok)">
          点線：本当の関数 sin(πx)
        </text>
        <text x={8} y={30} fontSize={11} fill="var(--accent)">
          実線：当てはめた {deg} 次の多項式
        </text>
      </svg>

      <p className="mt-4 mb-1 text-xs" style={{ color: 'var(--fg-muted)' }}>
        いまの点の数と λ のまま、次数だけを 1〜15 に変えたときの誤差（縦軸は対数、1000 で頭打ち）
      </p>
      <svg viewBox={`0 0 ${CW} ${CH}`} className="block w-full" style={{ maxWidth: CW }} role="img" aria-label="次数ごとの訓練誤差と検証誤差">
        {[1e-3, 1e-2, 1e-1, 1, 10, 100].map((v) => (
          <g key={v}>
            <line x1={30} x2={CW - 20} y1={cy(v)} y2={cy(v)} stroke="var(--border)" />
            <text x={2} y={cy(v) + 3} fontSize={9} fill="var(--fg-muted)">
              {v >= 1 ? v : v.toExponential(0)}
            </text>
          </g>
        ))}
        <line x1={30} x2={CW - 20} y1={cy(NOISE ** 2)} y2={cy(NOISE ** 2)} stroke="var(--ok)" strokeDasharray="3 3" />
        <path d={line('train')} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
        <path d={line('val')} fill="none" stroke="var(--danger)" strokeWidth={1.5} />
        {curve.map((c) => (
          <g key={c.deg}>
            <circle cx={cx(c.deg)} cy={cy(Math.min(c.val, 1e3))} r={c.deg === deg ? 4.5 : 2.5} fill="var(--danger)" />
            <circle cx={cx(c.deg)} cy={cy(Math.min(c.train, 1e3))} r={c.deg === deg ? 4.5 : 2.5} fill="var(--accent)" />
            <text x={cx(c.deg) - 3} y={CH - 4} fontSize={9} fill={c.deg === deg ? 'var(--fg)' : 'var(--fg-muted)'}>
              {c.deg}
            </text>
          </g>
        ))}
        <text x={CW - 150} y={14} fontSize={10} fill="var(--accent)">
          ● 訓練誤差
        </text>
        <text x={CW - 80} y={14} fontSize={10} fill="var(--danger)">
          ● 検証誤差
        </text>
      </svg>
    </VizShell>
  )
}
