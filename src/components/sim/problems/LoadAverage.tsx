import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import type { Frame } from '../core/types'

const CODE = `#define FSHIFT   11
#define FIXED_1  (1<<FSHIFT)    // 1.0 を 2048 で表す固定小数点
#define EXP_1    1884           // 2048 / exp(5秒/1分)
#define EXP_5    2014           // 2048 / exp(5秒/5分)
#define EXP_15   2037           // 2048 / exp(5秒/15分)

// 約 5 秒ごとに 1 回呼ばれる
void calc_global_load(void) {
    long active = nr_running + nr_uninterruptible;   // R と D の数
    active = active * FIXED_1;
    avenrun[0] = calc_load(avenrun[0], EXP_1,  active);
    avenrun[1] = calc_load(avenrun[1], EXP_5,  active);
    avenrun[2] = calc_load(avenrun[2], EXP_15, active);
}

unsigned long calc_load(unsigned long load, unsigned long exp, unsigned long active) {
    unsigned long newload = load * exp + active * (FIXED_1 - exp);
    if (active >= load)
        newload += FIXED_1 - 1;                      // 上がるときは切り上げ
    return newload / FIXED_1;
}`

const FIXED_1 = 2048
const EXPS = [1884, 2014, 2037] as const
const TICKS_SHOWN = 72

type Tick = { r: number; d: number }
type Input = { cores: number; ticks: Tick[] }
type View = {
  history: { active: number; avg: [number, number, number] }[]
  cores: number
  tick: Tick
  avg: [number, number, number]
}

function calcLoad(load: number, exp: number, active: number): number {
  let n = load * exp + active * (FIXED_1 - exp)
  if (active >= load) n += FIXED_1 - 1
  return Math.floor(n / FIXED_1)
}

// fs/proc/loadavg.c と同じく FIXED_1/200（= 0.005）を足してから小数 2 桁を切り捨てる
const show = (raw: number) => {
  const fixed = raw + Math.floor(FIXED_1 / 200)
  const whole = Math.floor(fixed / FIXED_1)
  const frac = Math.floor(((fixed % FIXED_1) * 100) / FIXED_1)
  return `${whole}.${String(frac).padStart(2, '0')}`
}

function trace({ cores, ticks }: Input): Frame<View>[] {
  const frames: Frame<View>[] = []
  const avenrun: [number, number, number] = [0, 0, 0]
  const history: View['history'] = []

  const push = (line: number | number[], note: string, tick: Tick, done = false) => {
    frames.push({
      line,
      note,
      vars: {
        経過: `${history.length * 5} 秒`,
        'R（実行中＋待ち）': tick.r,
        'D（割り込み不可）': tick.d,
        active: tick.r + tick.d,
        '1 分': show(avenrun[0]),
        '5 分': show(avenrun[1]),
        '15 分': show(avenrun[2]),
      },
      view: {
        history: history.slice(),
        cores,
        tick,
        avg: [avenrun[0] / FIXED_1, avenrun[1] / FIXED_1, avenrun[2] / FIXED_1],
      },
      done,
    })
  }

  push([1, 2, 3, 4, 5], `CPU ${cores} 個の機械。ロードアベレージは 0 から始まる。係数は「5 秒で前の値をどれだけ残すか」を 2048 分率で表したもの`, ticks[0] ?? { r: 0, d: 0 })

  ticks.forEach((t, i) => {
    const active = (t.r + t.d) * FIXED_1
    const before = show(avenrun[0])
    avenrun[0] = calcLoad(avenrun[0], EXPS[0], active)
    avenrun[1] = calcLoad(avenrun[1], EXPS[1], active)
    avenrun[2] = calcLoad(avenrun[2], EXPS[2], active)
    history.push({ active: t.r + t.d, avg: [avenrun[0] / FIXED_1, avenrun[1] / FIXED_1, avenrun[2] / FIXED_1] })
    const prev = ticks[i - 1]
    const changed = !prev || prev.r !== t.r || prev.d !== t.d
    const note = changed
      ? `${history.length * 5} 秒: R が ${t.r}、D が ${t.d} になった。数えるのは合計の ${t.r + t.d}。1 分平均は ${before} から ${show(avenrun[0])} へ。前の値の 1884/2048 ≈ 92% を残し、残り 8% だけ新しい数に寄せる`
      : `${history.length * 5} 秒: active は ${t.r + t.d} のまま。1 分平均 ${show(avenrun[0])}、5 分 ${show(avenrun[1])}、15 分 ${show(avenrun[2])}。長い窓ほど動きが鈍い`
    push([8, 9, 10, 11, 12, 16, 17, 18, 19], note, t, i === ticks.length - 1)
  })
  return frames
}

const repeat = (n: number, t: Tick): Tick[] => Array.from({ length: n }, () => t)

const PRESETS: { name: string; value: Input }[] = [
  {
    name: 'CPU バウンド 4 本を 3 分',
    value: { cores: 8, ticks: [...repeat(36, { r: 4, d: 0 }), ...repeat(24, { r: 0, d: 0 })] },
  },
  {
    name: '30 秒だけ 16 本',
    value: { cores: 8, ticks: [...repeat(6, { r: 16, d: 0 }), ...repeat(48, { r: 0, d: 0 })] },
  },
  {
    name: 'D 状態の山（CPU は暇）',
    value: {
      cores: 8,
      ticks: [...repeat(6, { r: 1, d: 0 }), ...repeat(24, { r: 0, d: 12 }), ...repeat(30, { r: 1, d: 0 })],
    },
  },
]

const COLORS = ['var(--accent)', 'var(--warn)', 'var(--ok)'] as const
const LABELS = ['1 分', '5 分', '15 分'] as const

function Chart({ view }: { view: View }) {
  const w = 560
  const h = 180
  const pad = 28
  const all = view.history.flatMap((p) => [p.active, ...p.avg])
  const top = Math.max(view.cores, ...all, 1) * 1.1
  const x = (i: number) => pad + (i / (TICKS_SHOWN - 1)) * (w - pad - 8)
  const y = (v: number) => h - pad - (v / top) * (h - pad - 8)
  const path = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const pts = view.history

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="active とロードアベレージの推移">
      <line x1={pad} y1={h - pad} x2={w - 8} y2={h - pad} stroke="var(--border)" />
      <line x1={pad} y1={8} x2={pad} y2={h - pad} stroke="var(--border)" />
      <line x1={pad} y1={y(view.cores)} x2={w - 8} y2={y(view.cores)} stroke="var(--danger)" strokeDasharray="4 4" />
      <text x={w - 10} y={y(view.cores) - 4} textAnchor="end" fontSize="10" fill="var(--danger)">
        CPU 数 {view.cores}
      </text>
      <text x={pad - 4} y={y(0) + 3} textAnchor="end" fontSize="10" fill="var(--fg-muted)">0</text>
      <text x={pad - 4} y={y(Math.round(top / 1.1)) + 3} textAnchor="end" fontSize="10" fill="var(--fg-muted)">
        {Math.round(top / 1.1)}
      </text>
      <text x={x(TICKS_SHOWN - 1)} y={h - 10} textAnchor="end" fontSize="10" fill="var(--fg-muted)">
        {(TICKS_SHOWN - 1) * 5} 秒
      </text>
      {pts.length > 0 && (
        <path
          d={pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.active).toFixed(1)}`).join(' ')}
          fill="none"
          stroke="var(--fg-muted)"
          strokeDasharray="2 3"
        />
      )}
      {[0, 1, 2].map((k) =>
        pts.length > 0 ? (
          <path key={k} d={path(pts.map((p) => p.avg[k]!))} fill="none" stroke={COLORS[k]} strokeWidth={2} />
        ) : null,
      )}
    </svg>
  )
}

export default function LoadAverage() {
  const [input, setInput] = useState<Input>(PRESETS[0]!.value)
  const frames = useMemo(() => trace(input), [input])

  return (
    <SimShell
      title="ロードアベレージの更新（kernel/sched/loadavg.c）"
      subtitle="5 秒ごとに R と D の数を数え、3 本の指数移動平均に混ぜる。15 分平均は、15 分前の値を均等に平均したものではない"
      code={CODE}
      lang="ts"
      frames={frames}
      controls={<PresetControl label="負荷" presets={PRESETS} onPick={setInput} />}
    >
      {(f) => (
        <div className="space-y-2">
          <Chart view={f.view} />
          <div className="flex flex-wrap gap-4 font-mono text-xs">
            <span style={{ color: 'var(--fg-muted)' }}>┄ active（R + D）</span>
            {LABELS.map((l, k) => (
              <span key={l} style={{ color: COLORS[k] }}>
                ― {l} {f.view.avg[k]!.toFixed(2)}
              </span>
            ))}
          </div>
        </div>
      )}
    </SimShell>
  )
}
