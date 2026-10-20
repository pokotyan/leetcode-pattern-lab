import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import type { Frame } from '../core/types'

const CODE = `w = [0, 0]
b = 0
for epoch in range(EPOCHS):
    mistakes = 0
    for x, t in data:            # t は +1 か -1
        s = w[0]*x[0] + w[1]*x[1] + b
        y = 1 if s > 0 else -1
        if y != t:               # 間違えたときだけ直す
            w[0] += t * x[0]
            w[1] += t * x[1]
            b += t
            mistakes += 1
    if mistakes == 0:
        break`

type Pt = { x: [number, number]; t: 1 | -1 }
type Case = { name: string; data: Pt[] }
type View = { w: [number, number]; b: number; current: number | null; wrong: boolean }

const CORNERS: [number, number][] = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
]
const withLabels = (labels: (1 | -1)[]): Pt[] => CORNERS.map((x, i) => ({ x, t: labels[i]! }))

const CASES: { name: string; value: Case }[] = [
  { name: 'AND', value: { name: 'AND', data: withLabels([-1, -1, -1, 1]) } },
  { name: 'OR', value: { name: 'OR', data: withLabels([-1, 1, 1, 1]) } },
  { name: 'XOR', value: { name: 'XOR', data: withLabels([-1, 1, 1, -1]) } },
]

// XOR は止まらないので、重みの周期が見えたところで打ち切る
const MAX_EPOCHS = 8

function trace({ name, data }: Case): Frame<View>[] {
  const frames: Frame<View>[] = []
  const w: [number, number] = [0, 0]
  let b = 0
  const snap = (line: number | number[], note: string, current: number | null, wrong: boolean, extra: Record<string, string | number> = {}, done = false) =>
    frames.push({
      line,
      note,
      vars: { w0: w[0], w1: w[1], b, ...extra },
      view: { w: [w[0], w[1]], b, current, wrong },
      done,
    })

  snap([1, 2], `${name} を学ぶ。重みとバイアスは 0 から始める。境界線はまだ無く、すべての点を −1 と答える`, null, false)
  const seen = new Map<string, number>()
  for (let epoch = 1; epoch <= MAX_EPOCHS; epoch++) {
    let mistakes = 0
    for (let i = 0; i < data.length; i++) {
      const { x, t } = data[i]!
      const s = w[0] * x[0] + w[1] * x[1] + b
      const y = s > 0 ? 1 : -1
      const pos = `(${x[0]}, ${x[1]})`
      if (y === t) {
        snap([5, 6, 7, 8], `エポック ${epoch}：点 ${pos} は s = ${s} なので ${y > 0 ? '+1' : '−1'}。正解も ${t > 0 ? '+1' : '−1'} なので何もしない`, i, false, { epoch, s, y, t, mistakes })
        continue
      }
      w[0] += t * x[0]
      w[1] += t * x[1]
      b += t
      mistakes++
      snap(
        [8, 9, 10, 11, 12],
        `エポック ${epoch}：点 ${pos} は s = ${s} で ${y > 0 ? '+1' : '−1'} と答えたが、正解は ${t > 0 ? '+1' : '−1'}。入力に正解の符号を掛けて重みに足す（${t > 0 ? '足す' : '引く'}）。境界線が動く`,
        i,
        true,
        { epoch, s, y, t, mistakes },
      )
    }
    if (mistakes === 0) {
      snap([13, 14], `エポック ${epoch} は 1 回も間違えなかった。4 点すべてが境界線の正しい側にある。学習はここで終わる`, null, false, { epoch, mistakes }, true)
      return frames
    }
    const key = `${w[0]},${w[1]},${b}`
    const prev = seen.get(key)
    if (prev !== undefined) {
      snap(
        [3, 4],
        `エポック ${epoch} の終わりの重みは、エポック ${prev} の終わりとまったく同じ（w = [${w[0]}, ${w[1]}], b = ${b}）。ここから先は同じ動きを永遠に繰り返し、誤りは 0 にならない`,
        null,
        false,
        { epoch, mistakes },
        true,
      )
      return frames
    }
    seen.set(key, epoch)
    snap([3, 4], `エポック ${epoch} の誤りは ${mistakes} 回。もう一周する`, null, false, { epoch, mistakes })
  }
  snap(14, `${MAX_EPOCHS} エポックで打ち切った`, null, false, {}, true)
  return frames
}

const SIZE = 240
const LO = -0.5
const HI = 1.5
const px = (v: number) => ((v - LO) / (HI - LO)) * SIZE
const py = (v: number) => SIZE - px(v)

/** 四角形の表示範囲を、w·x + b > 0 の側だけに切り取る（凸多角形を 1 本の直線で切る） */
function positiveRegion(w: [number, number], b: number): [number, number][] {
  const box: [number, number][] = [
    [LO, LO],
    [HI, LO],
    [HI, HI],
    [LO, HI],
  ]
  const f = (p: [number, number]) => w[0] * p[0] + w[1] * p[1] + b
  const out: [number, number][] = []
  for (let i = 0; i < box.length; i++) {
    const a = box[i]!
    const c = box[(i + 1) % box.length]!
    const fa = f(a)
    const fc = f(c)
    if (fa > 0) out.push(a)
    if (fa > 0 !== fc > 0) {
      const r = fa / (fa - fc)
      out.push([a[0] + r * (c[0] - a[0]), a[1] + r * (c[1] - a[1])])
    }
  }
  return out
}

function boundary(w: [number, number], b: number): [[number, number], [number, number]] | null {
  if (w[0] === 0 && w[1] === 0) return null
  const pts: [number, number][] = []
  if (w[1] !== 0) {
    for (const x of [LO, HI]) {
      const y = -(w[0] * x + b) / w[1]
      if (y >= LO && y <= HI) pts.push([x, y])
    }
  }
  if (w[0] !== 0) {
    for (const y of [LO, HI]) {
      const x = -(w[1] * y + b) / w[0]
      if (x >= LO && x <= HI) pts.push([x, y])
    }
  }
  return pts.length >= 2 ? [pts[0]!, pts[1]!] : null
}

function Plane({ data, view }: { data: Pt[]; view: View }) {
  const region = positiveRegion(view.w, view.b)
  const line = boundary(view.w, view.b)
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label="入力の平面と境界線">
      <rect x={0} y={0} width={SIZE} height={SIZE} fill="var(--bg)" stroke="var(--border)" />
      {region.length >= 3 && (
        <polygon points={region.map(([x, y]) => `${px(x)},${py(y)}`).join(' ')} fill="var(--ok-soft)" />
      )}
      {[0, 1].map((v) => (
        <g key={v}>
          <line x1={px(v)} y1={0} x2={px(v)} y2={SIZE} stroke="var(--border)" strokeDasharray="2 3" />
          <line x1={0} y1={py(v)} x2={SIZE} y2={py(v)} stroke="var(--border)" strokeDasharray="2 3" />
          <text x={px(v) + 3} y={SIZE - 4} fontSize={10} fill="var(--fg-muted)">
            x0={v}
          </text>
          <text x={3} y={py(v) - 3} fontSize={10} fill="var(--fg-muted)">
            x1={v}
          </text>
        </g>
      ))}
      {line && (
        <line x1={px(line[0][0])} y1={py(line[0][1])} x2={px(line[1][0])} y2={py(line[1][1])} stroke="var(--accent)" strokeWidth={2} />
      )}
      {data.map((p, i) => {
        const cx = px(p.x[0])
        const cy = py(p.x[1])
        const color = p.t > 0 ? 'var(--ok)' : 'var(--danger)'
        return (
          <g key={i}>
            {view.current === i && (
              <circle cx={cx} cy={cy} r={16} fill="none" stroke={view.wrong ? 'var(--danger)' : 'var(--accent)'} strokeWidth={2} />
            )}
            {p.t > 0 ? (
              <circle cx={cx} cy={cy} r={9} fill={color} />
            ) : (
              <rect x={cx - 8} y={cy - 8} width={16} height={16} fill="var(--bg)" stroke={color} strokeWidth={2.5} />
            )}
          </g>
        )
      })}
    </svg>
  )
}

export default function PerceptronLearn() {
  const [c, setC] = useState<Case>(CASES[0]!.value)
  const frames = useMemo(() => trace(c), [c])

  return (
    <SimShell
      key={c.name}
      title="パーセプトロンの学習（1 点ずつ）"
      subtitle="間違えた点が出るたびに、その入力を重みに足すか引く。直線 1 本で分けられる AND と OR は止まり、XOR は同じ動きを繰り返す"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="学ばせる関数" presets={CASES} onPick={setC} />}
      legend={
        <>
          <span>● 正解 +1</span>
          <span>□ 正解 −1</span>
          <span style={{ color: 'var(--accent)' }}>― 境界線 w·x + b = 0</span>
          <span style={{ color: 'var(--ok)' }}>塗った側が +1 と答える領域</span>
        </>
      }
    >
      {(f) => <Plane data={c.data} view={f.view} />}
    </SimShell>
  )
}
