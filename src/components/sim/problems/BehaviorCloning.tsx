import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import type { Frame } from '../core/types'

const CODE = `def expert(s):                       # お手本: ずれと向きの差を打ち消す
    return -(KP * err(s) + KD * dheading(s))

D = [(s, expert(s)) for s in demos]  # お手本の実演で集めた組
policy = knn(D)
for i in range(n_dagger):
    states = rollout(policy)         # 学んだ方策で走らせる
    D += [(s, expert(s)) for s in states]  # 訪れた所にお手本の答えを付ける
    policy = knn(D)
s = start()
for t in range(T):
    u = policy(s) + noise()
    s = move(s, u)`

// 本文の実験（imitation.py）と同じ設定。経路は y = A sin x、速さ一定で向きだけを操作する
const V = 1
const DT = 0.1
const T = 120
const A = 1.5
const U_MAX = 2
const NOISE = 0.4
const KP = 2
const KD = 2.5
const K = 5
const FAIL = 0.6
const FRAME_EVERY = 6
const ROLLOUTS = 3

type State = [number, number, number]
type Case = { label: string; mode: 'expert' | 'bc'; dagger: number }
type View = {
  demo: [number, number][]
  added: [number, number][]
  trail: [number, number][]
  pos: State | null
  failedAt: number | null
}

const CASES: { name: string; value: Case }[] = [
  { name: 'お手本（PD 制御）', value: { label: 'お手本', mode: 'expert', dagger: 0 } },
  { name: '行動クローニング', value: { label: '行動クローニング', mode: 'bc', dagger: 0 } },
  { name: 'DAgger 1 回', value: { label: 'DAgger 1 回', mode: 'bc', dagger: 1 } },
  { name: 'DAgger 3 回', value: { label: 'DAgger 3 回', mode: 'bc', dagger: 3 } },
]

function rng(seed: number) {
  let a = seed >>> 0
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return () => {
    const u = Math.max(uniform(), 1e-12)
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * uniform())
  }
}

const pathY = (x: number) => A * Math.sin(x)
const pathHeading = (x: number) => Math.atan(A * Math.cos(x))
const err = (s: State) => s[1] - pathY(s[0])
const dheading = (s: State) => {
  const d = s[2] - pathHeading(s[0])
  return Math.atan2(Math.sin(d), Math.cos(d))
}
const clip = (u: number) => Math.max(-U_MAX, Math.min(U_MAX, u))
const expert = (s: State) => clip(-(KP * err(s) + KD * dheading(s)))

function move(s: State, u: number): State {
  const th = s[2] + u * DT
  return [s[0] + V * Math.cos(th) * DT, s[1] + V * Math.sin(th) * DT, th]
}

function start(noise: () => number): State {
  return [0, 0.05 * noise(), pathHeading(0) + 0.05 * noise()]
}

type Data = { X: State[]; U: number[] }

function knn(D: Data) {
  return (s: State) => {
    const d = D.X.map((x, i) => [(x[0] - s[0]) ** 2 + (x[1] - s[1]) ** 2 + (x[2] - s[2]) ** 2, i] as const)
    d.sort((p, q) => p[0] - q[0])
    let sum = 0
    for (let j = 0; j < K; j++) sum += D.U[d[j]![1]]!
    return sum / K
  }
}

function rollout(policy: (s: State) => number, noise: () => number): State[] {
  let s = start(noise)
  const out: State[] = []
  for (let t = 0; t < T; t++) {
    out.push(s)
    s = move(s, policy(s) + NOISE * noise())
  }
  return out
}

function trace(c: Case): Frame<View>[] {
  const frames: Frame<View>[] = []
  const demoNoise = rng(2)
  const D: Data = { X: [], U: [] }
  for (let k = 0; k < 4; k++) {
    let s = start(demoNoise)
    for (let t = 0; t < T; t++) {
      const u = expert(s)
      D.X.push(s)
      D.U.push(u)
      s = move(s, u)
    }
  }
  const demo = D.X.map((s) => [s[0], s[1]] as [number, number])
  const added: [number, number][] = []
  const view = (trail: [number, number][], pos: State | null, failedAt: number | null): View => ({
    demo,
    added: [...added],
    trail,
    pos,
    failedAt,
  })

  if (c.mode === 'bc') {
    frames.push({
      line: [4, 5],
      note: `お手本を雑音なしで 4 回走らせ、${D.X.length} 組の「状態と操作」を集めた。お手本は経路の上しか走らないので、データはすべて経路の近く（灰色の点）にある`,
      vars: { データ: D.X.length },
      view: view([], null, null),
    })
  }

  let policy = c.mode === 'expert' ? expert : knn(D)
  const daggerNoise = rng(3)
  for (let i = 1; i <= c.dagger; i++) {
    const states = Array.from({ length: ROLLOUTS }, () => rollout(policy, daggerNoise)).flat()
    for (const s of states) {
      D.X.push(s)
      D.U.push(expert(s))
      added.push([s[0], s[1]])
    }
    policy = knn(D)
    frames.push({
      line: [6, 7, 8, 9],
      note: `DAgger ${i} 回目：いまの方策で ${ROLLOUTS} 回走らせて、経路から外れた所も含めて訪れた状態を集め、そこでお手本ならどう操作するかを付けて足した（橙の点）。データは ${D.X.length} 組`,
      vars: { 反復: i, データ: D.X.length },
      view: view([], null, null),
    })
  }

  const testNoise = rng(7)
  let s = start(testNoise)
  const trail: [number, number][] = [[s[0], s[1]]]
  let failedAt: number | null = null
  let maxErr = 0
  frames.push({
    line: 10,
    note: `${c.label}で走らせる。操作量には毎回、標準偏差 ${NOISE} の雑音が乗る（モーターや路面のばらつきの代わり）`,
    vars: { 時刻: '0.0 s', ずれ: err(s).toFixed(3), データ: c.mode === 'expert' ? '−' : D.X.length },
    view: view([...trail], s, null),
  })
  for (let t = 1; t <= T; t++) {
    const u = policy(s)
    s = move(s, u + NOISE * testNoise())
    trail.push([s[0], s[1]])
    const e = Math.abs(err(s))
    maxErr = Math.max(maxErr, e)
    if (failedAt === null && e >= FAIL) failedAt = trail.length - 1
    if (t % FRAME_EVERY === 0 || t === T) {
      const near = e < 0.2 ? '経路の近くを走っている' : e < FAIL ? '経路から離れ始めた' : '経路から大きく外れた'
      let why = ''
      if (c.mode === 'bc' && c.dagger === 0 && e >= 0.2) {
        why = '。この辺りのデータは無いので、近くの「経路の上の点」の操作を真似るだけで、戻る操作を知らない'
      }
      frames.push({
        line: [11, 12, 13],
        note: `${(t * DT).toFixed(1)} 秒：${near}（ずれ ${e.toFixed(2)}）${why}`,
        vars: { 時刻: `${(t * DT).toFixed(1)} s`, ずれ: e.toFixed(3), 最大のずれ: maxErr.toFixed(3), 操作量: u.toFixed(2) },
        view: view([...trail], s, failedAt),
      })
    }
  }
  const last = frames[frames.length - 1]!
  last.note += maxErr < FAIL ? `。走りきった。最大のずれは ${maxErr.toFixed(2)}` : `。最大のずれ ${maxErr.toFixed(2)} で、失敗の判定（${FAIL}）を超えた`
  last.done = true
  return frames
}

const W = 520
const H = 220
const X0 = -0.2
const X1 = 12.2
const Y0 = -3
const Y1 = 3
const sx = (x: number) => ((x - X0) / (X1 - X0)) * W
const sy = (y: number) => H - ((y - Y0) / (Y1 - Y0)) * H

function Plane({ view }: { view: View }) {
  const path = Array.from({ length: 200 }, (_, i) => {
    const x = (i / 199) * 12
    return `${i === 0 ? 'M' : 'L'}${sx(x).toFixed(1)},${sy(pathY(x)).toFixed(1)}`
  }).join(' ')
  const band = (sign: number) =>
    Array.from({ length: 200 }, (_, i) => {
      const x = (i / 199) * 12
      return `${i === 0 ? 'M' : 'L'}${sx(x).toFixed(1)},${sy(pathY(x) + sign * FAIL).toFixed(1)}`
    }).join(' ')
  const trail = view.trail.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: 'block' }} role="img" aria-label="経路と走った軌跡">
      <path d={band(1)} fill="none" stroke="var(--border)" strokeDasharray="3 3" />
      <path d={band(-1)} fill="none" stroke="var(--border)" strokeDasharray="3 3" />
      <path d={path} fill="none" stroke="var(--fg-muted)" strokeWidth={1.5} />
      {view.demo.map((p, i) => (i % 2 === 0 ? <circle key={`d${i}`} cx={sx(p[0])} cy={sy(p[1])} r={1.6} fill="var(--fg-muted)" opacity={0.6} /> : null))}
      {view.added.map((p, i) => (
        <circle key={`a${i}`} cx={sx(p[0])} cy={sy(p[1])} r={1.8} fill="var(--warn)" opacity={0.7} />
      ))}
      {trail && <path d={trail} fill="none" stroke="var(--accent)" strokeWidth={2} />}
      {view.failedAt !== null && view.trail[view.failedAt] && (
        <circle cx={sx(view.trail[view.failedAt]![0])} cy={sy(view.trail[view.failedAt]![1])} r={6} fill="none" stroke="var(--danger)" strokeWidth={2} />
      )}
      {view.pos && (
        <g transform={`translate(${sx(view.pos[0])},${sy(view.pos[1])}) rotate(${(-view.pos[2] * 180) / Math.PI})`}>
          <polygon points="8,0 -5,-4 -5,4" fill="var(--accent)" />
        </g>
      )}
    </svg>
  )
}

export default function BehaviorCloning() {
  const [c, setC] = useState<Case>(CASES[1]!.value)
  const frames = useMemo(() => trace(c), [c])
  return (
    <SimShell
      key={c.label}
      title="行動クローニングと DAgger（経路をなぞる）"
      subtitle="お手本の操作を真似るだけの方策は、一度外れると戻り方を知らない。外れた所でお手本の答えを足すと、戻れるようになる"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="方策" presets={CASES} onPick={setC} />}
      legend={
        <>
          <span style={{ color: 'var(--fg-muted)' }}>― 経路（点線は失敗の境目 ±{FAIL}）</span>
          <span style={{ color: 'var(--fg-muted)' }}>● お手本の実演で集めた状態</span>
          <span style={{ color: 'var(--warn)' }}>● DAgger で足した状態</span>
          <span style={{ color: 'var(--accent)' }}>― 走った軌跡</span>
          <span style={{ color: 'var(--danger)' }}>○ 初めて境目を越えた所</span>
        </>
      }
    >
      {(f) => <Plane view={f.view} />}
    </SimShell>
  )
}
