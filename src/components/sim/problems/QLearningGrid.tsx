import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import type { Frame } from '../core/types'

const CODE = `Q = {(s, a): 0 for s in states for a in actions}
for episode in range(EPISODES):
    s = start
    while True:
        if random() < eps:
            a = random_action()          # 探索: でたらめに選ぶ
        else:
            a = argmax(Q[s, b] for b)    # 活用: いちばん良さそうな手
        s2, r, done = env.step(s, a)
        target = r if done else r + gamma * max(Q[s2, b] for b)
        Q[s, a] += alpha * (target - Q[s, a])
        s = s2
        if done:
            break`

const ACTIONS: [number, number][] = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
]
const ARROW = ['↑', '→', '↓', '←']
const GAMMA = 0.9
const STEP_REWARD = -0.04
const MAX_STEPS = 60

type World = { map: string[]; terminal: Record<string, number> }
type Case = { label: string; world: World; eps: number; alpha: number; episodes: number }

const MAZE: World = {
  map: ['...G', '.#.X', '....', 'S...'],
  terminal: { '0,3': 1, '1,3': -1 },
}
const LURE: World = {
  map: ['...G', '....', 'g...', 'S...'],
  terminal: { '0,3': 1, '2,0': 0.3 },
}

const CASES: { name: string; value: Case }[] = [
  { name: 'ε=0.1, α=0.5', value: { label: '迷路', world: MAZE, eps: 0.1, alpha: 0.5, episodes: 40 } },
  { name: 'ε=0.1, α=0.1', value: { label: '迷路', world: MAZE, eps: 0.1, alpha: 0.1, episodes: 40 } },
  { name: 'ε=1.0（全部でたらめ）', value: { label: '迷路', world: MAZE, eps: 1.0, alpha: 0.5, episodes: 200 } },
  { name: '近くの小さな報酬 ε=0.1', value: { label: '誘惑', world: LURE, eps: 0.1, alpha: 0.5, episodes: 60 } },
  { name: '近くの小さな報酬 ε=1.0', value: { label: '誘惑', world: LURE, eps: 1.0, alpha: 0.5, episodes: 200 } },
]

// 最初の数エピソードだけ 1 歩ずつ見せ、その後はエピソードの終わりだけを見せる
const DETAILED_EPISODES = 3

type View = {
  q: number[][][]
  agent: [number, number]
  action: number | null
  explored: boolean
}

/** 乱数の種を固定し、ビルド時とブラウザで同じ動きにする（mulberry32） */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const fmt = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(3)

function trace(c: Case): Frame<View>[] {
  const { map, terminal } = c.world
  const H = map.length
  const W = map[0]!.length
  const start = (() => {
    for (let r = 0; r < H; r++) for (let col = 0; col < W; col++) if (map[r]![col] === 'S') return [r, col] as [number, number]
    return [H - 1, 0] as [number, number]
  })()
  const q = Array.from({ length: H }, () => Array.from({ length: W }, () => [0, 0, 0, 0]))
  const rand = rng(7)
  const frames: Frame<View>[] = []
  const copyQ = () => q.map((row) => row.map((cell) => [...cell]))
  const snap = (line: number | number[], note: string, agent: [number, number], action: number | null, explored: boolean, vars: Record<string, string | number>, done = false) =>
    frames.push({ line, note, vars, view: { q: copyQ(), agent, action, explored }, done })

  const step = ([r, col]: [number, number], a: number): { ns: [number, number]; reward: number; done: boolean } => {
    const [dr, dc] = ACTIONS[a]!
    let nr = r + dr
    let nc = col + dc
    if (nr < 0 || nr >= H || nc < 0 || nc >= W || map[nr]![nc] === '#') {
      nr = r
      nc = col
    }
    const key = `${nr},${nc}`
    if (key in terminal) return { ns: [nr, nc], reward: terminal[key]!, done: true }
    return { ns: [nr, nc], reward: STEP_REWARD, done: false }
  }

  snap([1], `Q 値はすべて 0 から始める。ε = ${c.eps}、α = ${c.alpha}、γ = ${GAMMA}、1 歩ごとに ${STEP_REWARD} の小さな罰`, start, null, false, { episode: 0 })

  for (let ep = 1; ep <= c.episodes; ep++) {
    let s = start
    let total = 0
    let n = 0
    const detailed = ep <= DETAILED_EPISODES
    for (; n < MAX_STEPS; ) {
      const qs = q[s[0]]![s[1]]!
      const explored = rand() < c.eps
      let a: number
      if (explored) {
        a = Math.floor(rand() * 4)
      } else {
        const best = Math.max(...qs)
        const ties = qs.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0)
        a = ties[Math.floor(rand() * ties.length)]!
      }
      const { ns, reward, done } = step(s, a)
      const target = done ? reward : reward + GAMMA * Math.max(...q[ns[0]]![ns[1]]!)
      const before = qs[a]!
      qs[a] = before + c.alpha * (target - before)
      total += reward
      n++
      if (detailed) {
        snap(
          explored ? [5, 6, 9, 10, 11] : [7, 8, 9, 10, 11],
          `エピソード ${ep}、${n} 歩目：(${s[0]},${s[1]}) で ${ARROW[a]} を${explored ? 'でたらめに選んだ（探索）' : 'いちばん良さそうな手として選んだ（活用）'}。報酬 ${fmt(reward)}${done ? '。終点に着いた' : ''}。目標値 ${fmt(target)} に向けて Q を ${fmt(before)} → ${fmt(qs[a]!)} へ動かす`,
          ns,
          a,
          explored,
          { episode: ep, 歩: n, r: fmt(reward), target: fmt(target), 'Q(s,a)': fmt(qs[a]!) },
        )
      }
      s = ns
      if (done) break
    }
    if (!detailed) {
      snap([2, 13, 14], `エピソード ${ep} が ${n} 歩で終わった。合計の報酬は ${fmt(total)}`, s, null, false, { episode: ep, 歩: n, 合計報酬: fmt(total) })
    } else {
      snap([13, 14], `エピソード ${ep} は ${n} 歩、合計の報酬 ${fmt(total)}。スタートに戻って次のエピソードへ`, s, null, false, { episode: ep, 歩: n, 合計報酬: fmt(total) })
    }
  }
  const sq = q[start[0]]![start[1]]!
  snap(
    [2],
    `${c.episodes} エピソード終了。スタートでいちばん良い手は ${ARROW[sq.indexOf(Math.max(...sq))]}、その Q 値は ${fmt(Math.max(...sq))}`,
    start,
    null,
    false,
    { episode: c.episodes },
    true,
  )
  return frames
}

const CELL = 64

function Grid({ world, view }: { world: World; view: View }) {
  const { map, terminal } = world
  const H = map.length
  const W = map[0]!.length
  const tri = (r: number, c: number, a: number) => {
    const x = c * CELL
    const y = r * CELL
    const cx = x + CELL / 2
    const cy = y + CELL / 2
    const pts: [number, number][][] = [
      [[x, y], [x + CELL, y], [cx, cy]],
      [[x + CELL, y], [x + CELL, y + CELL], [cx, cy]],
      [[x + CELL, y + CELL], [x, y + CELL], [cx, cy]],
      [[x, y + CELL], [x, y], [cx, cy]],
    ]
    return pts[a]!.map((p) => p.join(',')).join(' ')
  }
  return (
    <svg viewBox={`-2 -2 ${W * CELL + 4} ${H * CELL + 4}`} style={{ width: '100%', maxWidth: 320 }} role="img" aria-label="格子の各マスの Q 値">
      {map.map((row, r) =>
        [...row].map((ch, c) => {
          const key = `${r},${c}`
          if (ch === '#') {
            return <rect key={key} x={c * CELL} y={r * CELL} width={CELL} height={CELL} fill="var(--fg-muted)" opacity={0.5} />
          }
          if (key in terminal) {
            const v = terminal[key]!
            return (
              <g key={key}>
                <rect x={c * CELL} y={r * CELL} width={CELL} height={CELL} fill={v > 0 ? 'var(--ok)' : 'var(--danger)'} opacity={0.35} />
                <text x={c * CELL + CELL / 2} y={r * CELL + CELL / 2 + 5} textAnchor="middle" fontSize={14} fill="var(--fg)">
                  {ch} {v > 0 ? '+' : ''}
                  {v}
                </text>
              </g>
            )
          }
          const qs = view.q[r]![c]!
          const best = Math.max(...qs)
          const touched = qs.some((v) => v !== 0)
          return (
            <g key={key}>
              {qs.map((v, a) => (
                <polygon
                  key={a}
                  points={tri(r, c, a)}
                  fill={v >= 0 ? 'var(--ok)' : 'var(--danger)'}
                  opacity={Math.min(0.85, Math.abs(v) * 0.9)}
                  stroke="var(--border)"
                  strokeWidth={0.5}
                />
              ))}
              {touched && (
                <text x={c * CELL + CELL / 2} y={r * CELL + CELL / 2 + 6} textAnchor="middle" fontSize={18} fill="var(--fg)">
                  {ARROW[qs.indexOf(best)]}
                </text>
              )}
              {ch === 'S' && (
                <text x={c * CELL + 4} y={r * CELL + 12} fontSize={10} fill="var(--fg-muted)">
                  S
                </text>
              )}
            </g>
          )
        }),
      )}
      <circle
        cx={view.agent[1] * CELL + CELL / 2}
        cy={view.agent[0] * CELL + CELL / 2}
        r={9}
        fill="none"
        stroke={view.explored ? 'var(--warn)' : 'var(--accent)'}
        strokeWidth={3}
      />
      <rect x={0} y={0} width={W * CELL} height={H * CELL} fill="none" stroke="var(--border)" />
    </svg>
  )
}

export default function QLearningGrid() {
  const [c, setC] = useState<Case>(CASES[0]!.value)
  const frames = useMemo(() => trace(c), [c])
  return (
    <SimShell
      key={`${c.label}-${c.eps}-${c.alpha}`}
      title="Q 学習（格子の迷路）"
      subtitle="1 歩ごとに、もらった報酬と次のマスの最良の Q 値から目標値を作り、いま選んだ手の Q 値をその方へ α だけ近づける"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="設定" presets={CASES} onPick={setC} />}
      legend={
        <>
          <span>マスの 4 つの三角＝上・右・下・左の Q 値</span>
          <span style={{ color: 'var(--ok)' }}>緑＝正</span>
          <span style={{ color: 'var(--danger)' }}>赤＝負（濃いほど大きい）</span>
          <span>矢印＝いちばん Q 値の大きい手</span>
          <span style={{ color: 'var(--accent)' }}>○ 活用で動いた</span>
          <span style={{ color: 'var(--warn)' }}>○ 探索で動いた</span>
        </>
      }
    >
      {(f) => <Grid world={c.world} view={f.view} />}
    </SimShell>
  )
}
