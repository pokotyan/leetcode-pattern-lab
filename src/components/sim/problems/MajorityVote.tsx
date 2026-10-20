import { useMemo, useState } from 'react'
import { Slider, VizShell } from '../viz/VizShell'

const N_MAX = 63
const NS = Array.from({ length: (N_MAX + 1) / 2 }, (_, i) => 2 * i + 1)

const W = 460
const H = 220
const PAD = { l: 40, r: 12, t: 12, b: 28 }
const X = (n: number) => PAD.l + ((n - 1) / (N_MAX - 1)) * (W - PAD.l - PAD.r)
const Y = (v: number) => PAD.t + (1 - v) * (H - PAD.t - PAD.b)

const logFact = (() => {
  const t = [0]
  for (let i = 1; i <= N_MAX; i++) t.push(t[i - 1]! + Math.log(i))
  return t
})()
const invFact = logFact.map((v) => Math.exp(-v))

function binomPmf(n: number, j: number, p: number) {
  if (p <= 0) return j === 0 ? 1 : 0
  if (p >= 1) return j === n ? 1 : 0
  return Math.exp(logFact[n]! - logFact[j]! - logFact[n - j]! + j * Math.log(p) + (n - j) * Math.log(1 - p))
}

/**
 * 正解が c 票のとき、残り m 票を K 種類の誤答に等しい確率で散らして、どの誤答も c 票未満になる確率。
 * 同数は負けとして数える（正解が勝ち切る確率の下限）。
 */
function allBelow(m: number, k: number, c: number) {
  if (c === 0) return 0
  let f = new Array<number>(m + 1).fill(0)
  f[0] = 1
  for (let cat = 0; cat < k; cat++) {
    const g = new Array<number>(m + 1).fill(0)
    for (let s = 0; s <= m; s++) {
      if (f[s] === 0) continue
      for (let a = 0; a < c && s + a <= m; a++) g[s + a] += f[s]! * invFact[a]!
    }
    f = g
  }
  return f[m]! * Math.exp(logFact[m]! - m * Math.log(k))
}

export function majority(n: number, p: number, k: number) {
  let acc = 0
  for (let c = 1; c <= n; c++) acc += binomPmf(n, c, p) * allBelow(n - c, k, c)
  return acc
}

const erf = (x: number) => {
  // Abramowitz & Stegun 7.1.26。誤差 1.5e-7 以下で、曲線を描くには十分
  const s = Math.sign(x)
  const a = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * a)
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a)
  return s * y
}
const Phi = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2))
const phi = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)

/** 正しい解の点数が N(d,1)、誤った解が N(0,1) のとき、最高点が正しい解である確率 */
export function bestOfN(n: number, p: number, d: number) {
  const lo = -7
  const hi = d + 7
  const step = 0.025
  const xs: number[] = []
  for (let x = lo; x <= hi; x += step) xs.push(x)
  const pc = xs.map((x) => phi(x - d))
  const Fc = xs.map((x) => Phi(x - d))
  const Fw = xs.map((x) => Phi(x))
  let acc = 0
  for (let c = 1; c <= n; c++) {
    const w = binomPmf(n, c, p)
    if (w < 1e-12) continue
    const m = n - c
    let q = 1
    if (m > 0) {
      q = 0
      for (let i = 0; i < xs.length; i++) q += c * pc[i]! * Fc[i]! ** (c - 1) * Fw[i]! ** m * step
    }
    acc += w * Math.min(1, q)
  }
  return acc
}

const path = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${X(NS[i]!).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')

const SERIES = [
  { key: 'pass', label: 'N 回のうち 1 回でも正解（上限）', color: 'var(--fg-muted)', dash: '2 3' },
  { key: 'verify', label: '検証器で選ぶ（best-of-N）', color: 'var(--ok)', dash: '' },
  { key: 'major', label: '多数決', color: 'var(--accent)', dash: '' },
  { key: 'single', label: '1 回だけ', color: 'var(--warn)', dash: '6 4' },
] as const

export default function MajorityVote() {
  const [p, setP] = useState(0.6)
  const [k, setK] = useState(1)
  const [d, setD] = useState(2)
  const [n, setN] = useState(5)

  const curves = useMemo(() => {
    const major = NS.map((m) => majority(m, p, k))
    const verify = NS.map((m) => bestOfN(m, p, d))
    const pass = NS.map((m) => 1 - (1 - p) ** m)
    const single = NS.map(() => p)
    return { major, verify, pass, single }
  }, [p, k, d])

  const idx = NS.indexOf(n)

  return (
    <VizShell
      title="何回も解かせて、どう選ぶか"
      subtitle="1 回の正答率 p の解き手に N 回解かせる。多数決と検証器による選択で、正答率が N とともにどう変わるか"
      controls={
        <>
          <Slider label="1 回の正答率 p" value={p} min={0.05} max={0.95} step={0.01} onChange={setP} />
          <Slider label="誤答の種類 K" value={k} min={1} max={20} step={1} onChange={setK} format={(v) => String(v)} />
          <Slider label="検証器の見分け d" value={d} min={0} max={4} step={0.1} onChange={setD} format={(v) => v.toFixed(1)} />
          <Slider label="回数 N" value={n} min={1} max={N_MAX} step={2} onChange={setN} format={(v) => String(v)} />
        </>
      }
      readout={
        <>
          <div>
            N = {n} のとき: 1 回だけ {p.toFixed(3)} ／ 多数決{' '}
            <span style={{ color: 'var(--accent)' }}>{curves.major[idx]!.toFixed(3)}</span> ／ 検証器{' '}
            <span style={{ color: 'var(--ok)' }}>{curves.verify[idx]!.toFixed(3)}</span> ／ 上限{' '}
            {curves.pass[idx]!.toFixed(3)}
          </div>
          <div>
            K = 1 は「間違えるときはいつも同じ答え」。このとき多数決は p &gt; 0.5 でしか N とともに良くならない。K
            を増やすと誤答が散らばり、p &lt; 0.5 でも正解が最多票になりうる（同数は負けとして数えている）
          </div>
          <div>
            検証器は、正しい解に平均 d、誤った解に平均 0 の点数を、ばらつき 1 で付ける模型。d = 0 は当て推量で、選んでも 1
            回だけと変わらない
          </div>
        </>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="回数 N と正答率の関係のグラフ">
        <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} fill="var(--bg)" stroke="var(--border)" />
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={PAD.l} x2={W - PAD.r} y1={Y(g)} y2={Y(g)} stroke="var(--border)" strokeDasharray={g === 0.5 ? '' : '2 3'} />
            <text x={PAD.l - 6} y={Y(g) + 3} textAnchor="end" fontSize={10} fill="var(--fg-muted)">
              {g.toFixed(2)}
            </text>
          </g>
        ))}
        {[1, 15, 31, 47, 63].map((t) => (
          <text key={t} x={X(t)} y={H - PAD.b + 14} textAnchor="middle" fontSize={10} fill="var(--fg-muted)">
            {t}
          </text>
        ))}
        <text x={W - PAD.r} y={H - 4} textAnchor="end" fontSize={10} fill="var(--fg-muted)">
          回数 N
        </text>
        <line x1={X(n)} x2={X(n)} y1={PAD.t} y2={H - PAD.b} stroke="var(--fg-muted)" strokeOpacity={0.5} />
        {SERIES.map((s) => (
          <path key={s.key} d={path(curves[s.key])} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} />
        ))}
      </svg>
      <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[11px]">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <svg width={22} height={8} aria-hidden="true">
              <line x1={0} x2={22} y1={4} y2={4} stroke={s.color} strokeWidth={2} strokeDasharray={s.dash} />
            </svg>
            <span style={{ color: 'var(--fg-muted)' }}>{s.label}</span>
          </li>
        ))}
      </ul>
    </VizShell>
  )
}
