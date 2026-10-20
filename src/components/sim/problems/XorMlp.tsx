import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import type { Frame } from '../core/types'

const CODE = `X = [[0,0], [0,1], [1,0], [1,1]]
T = [0, 1, 1, 0]                  # XOR

for epoch in range(EPOCHS):
    H = sigmoid(X @ W1 + b1)      # 隠れ層 2 個
    Y = sigmoid(H @ W2 + b2)      # 出力 1 個
    loss = 0.5 * sum((Y - T)**2)

    dY = (Y - T) * Y * (1 - Y)    # 出力の側の誤差
    dH = (dY @ W2.T) * H * (1 - H)  # 隠れ層へ配り直す
    W2 -= lr * H.T @ dY;  b2 -= lr * sum(dY)
    W1 -= lr * X.T @ dH;  b1 -= lr * sum(dH)`

const X = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
] as const
const T = [0, 1, 1, 0] as const
const LR = 0.5
// 本文の実測と同じく「4 点すべてで誤差 0.1 未満」を成功とみなす
const TOL = 0.1

type Params = { W1: number[][]; b1: number[]; W2: number[]; b2: number }
type Case = { init: Params; epochs: number; every: number }
type View = { p: Params; outputs: number[]; hidden: number[][]; losses: number[] }

const sig = (z: number) => 1 / (1 + Math.exp(-z))

function forward(p: Params, x: readonly number[]) {
  const h = [0, 1].map((j) => sig(x[0]! * p.W1[0]![j]! + x[1]! * p.W1[1]![j]! + p.b1[j]!))
  const y = sig(h[0]! * p.W2[0]! + h[1]! * p.W2[1]! + p.b2)
  return { h, y }
}

function step(p: Params): Params {
  const W1 = p.W1.map((r) => [...r])
  const b1 = [...p.b1]
  const W2 = [...p.W2]
  let b2 = p.b2
  const gW1 = [
    [0, 0],
    [0, 0],
  ]
  const gb1 = [0, 0]
  const gW2 = [0, 0]
  let gb2 = 0
  X.forEach((x, n) => {
    const { h, y } = forward(p, x)
    const dY = (y - T[n]!) * y * (1 - y)
    for (let j = 0; j < 2; j++) {
      gW2[j]! += h[j]! * dY
      const dH = dY * p.W2[j]! * h[j]! * (1 - h[j]!)
      gW1[0]![j]! += x[0] * dH
      gW1[1]![j]! += x[1] * dH
      gb1[j]! += dH
    }
    gb2 += dY
  })
  for (let j = 0; j < 2; j++) {
    W2[j]! -= LR * gW2[j]!
    b1[j]! -= LR * gb1[j]!
    W1[0]![j]! -= LR * gW1[0]![j]!
    W1[1]![j]! -= LR * gW1[1]![j]!
  }
  b2 -= LR * gb2
  return { W1, b1, W2, b2 }
}

function trace({ init, epochs, every }: Case): Frame<View>[] {
  const frames: Frame<View>[] = []
  const losses: number[] = []
  let p = init
  let solvedAt: number | null = null

  const snap = (epoch: number, note: string, line: number | number[], done = false) => {
    const res = X.map((x) => forward(p, x))
    const outputs = res.map((r) => r.y)
    const loss = 0.5 * outputs.reduce((s, y, n) => s + (y - T[n]!) ** 2, 0)
    losses.push(loss)
    frames.push({
      line,
      note,
      vars: {
        epoch,
        二乗誤差: loss.toFixed(4),
        '出力 00/01/10/11': outputs.map((y) => y.toFixed(2)).join(' '),
      },
      view: { p, outputs, hidden: res.map((r) => r.h), losses: [...losses] },
      done,
    })
    return { outputs, loss }
  }

  snap(0, '学習前。重みは小さな乱数なので、出力は 4 点ともほぼ 0.5 で、塗り分けもほとんど一様', [5, 6, 7])
  for (let e = 1; e <= epochs; e++) {
    p = step(p)
    if (solvedAt === null) {
      const ok = X.every((x, n) => Math.abs(forward(p, x).y - T[n]!) < TOL)
      if (ok) solvedAt = e
    }
    if (e < epochs && (e % every === 0 || e === solvedAt)) {
      snap(
        e,
        e === solvedAt
          ? `${e} エポック目で 4 点すべての誤差が 0.1 を切った。隠れ層の 2 本の直線が、それぞれ 01 と 10 を他の 3 点から切り分ける位置に来ている`
          : describe(X.map((x) => forward(p, x).y)),
        [9, 10, 11, 12],
      )
    }
  }
  const last = X.map((x) => forward(p, x).y)
  snap(
    epochs,
    solvedAt !== null
      ? `${epochs} エポックで止めた。${solvedAt} エポック目で解けており、その後は誤差が少しずつ小さくなるだけ`
      : `${epochs} エポック回しても解けない。出力 ${last.map((y) => y.toFixed(2)).join(' / ')}。2 つの入力の隠れ層の値が重なってしまい、出力はその 2 点を 0.5 で妥協するしかない（局所解）`,
    [7],
    true,
  )
  return frames
}

function describe(outputs: number[]): string {
  const wrong = outputs.filter((y, n) => Math.abs(y - T[n]!) >= 0.45).length
  if (outputs.every((y) => Math.abs(y - 0.5) < 0.05)) {
    return '誤差はほとんど減らない。勾配が小さい平らな場所をゆっくり進んでいる'
  }
  return wrong === 0
    ? 'すべての点が正しい側（0.5 の上か下か）に来た。あとは 0 と 1 に近づけていく'
    : `まだ ${wrong} 点が 0.5 付近か反対の側にある。隠れ層の直線が動いて、入力の見え方を作り直している`
}

const CASES: { name: string; value: Case }[] = [
  {
    name: '解ける初期値（種 3）',
    value: {
      init: {
        W1: [
          [-0.8287, -0.5264],
          [0.6025, 0.1643],
        ],
        b1: [-0.8117, -0.1337],
        W2: [-0.0419, -0.6805],
        b2: 0.4692,
      },
      epochs: 2000,
      every: 100,
    },
  },
  {
    name: '局所解に捕まる初期値（種 0）',
    value: {
      init: {
        W1: [
          [0.2739, -0.4604],
          [-0.9181, -0.9669],
        ],
        b1: [0.6265, 0.8255],
        W2: [0.2133, 0.459],
        b2: 0.0872,
      },
      epochs: 6000,
      every: 300,
    },
  },
]

const SIZE = 220
const GRID = 22

function Plane({ p, title }: { p: Params; title: string }) {
  const cell = SIZE / GRID
  const toPx = (v: number) => 10 + v * (SIZE - 20)
  // 隠れ層 j の境界 w0·x + w1·y + b = 0 を、正方形 [-0.1, 1.1]² の範囲で切り出す
  const line = (j: number) => {
    const a = p.W1[0]![j]!
    const b = p.W1[1]![j]!
    const c = p.b1[j]!
    const pts: [number, number][] = []
    const lo = -0.05
    const hi = 1.05
    for (const x of [lo, hi]) {
      if (Math.abs(b) > 1e-9) {
        const y = -(a * x + c) / b
        if (y >= lo && y <= hi) pts.push([x, y])
      }
    }
    for (const y of [lo, hi]) {
      if (Math.abs(a) > 1e-9) {
        const x = -(b * y + c) / a
        if (x >= lo && x <= hi) pts.push([x, y])
      }
    }
    return pts.length >= 2 ? pts.slice(0, 2) : null
  }
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label={title}>
        {Array.from({ length: GRID * GRID }, (_, k) => {
          const gx = k % GRID
          const gy = Math.floor(k / GRID)
          const x = gx / (GRID - 1)
          const y = 1 - gy / (GRID - 1)
          const out = forward(p, [x, y]).y
          return (
            <rect
              key={k}
              x={gx * cell}
              y={gy * cell}
              width={cell + 0.5}
              height={cell + 0.5}
              fill="var(--accent)"
              opacity={out * 0.55}
            />
          )
        })}
        {[0, 1].map((j) => {
          const seg = line(j)
          if (!seg) return null
          return (
            <line
              key={j}
              x1={toPx(seg[0]![0])}
              y1={toPx(1 - seg[0]![1])}
              x2={toPx(seg[1]![0])}
              y2={toPx(1 - seg[1]![1])}
              stroke={j === 0 ? 'var(--warn)' : 'var(--ok)'}
              strokeWidth={2}
              strokeDasharray={j === 0 ? undefined : '5 3'}
            />
          )
        })}
        {X.map((x, n) => (
          <g key={n}>
            <circle
              cx={toPx(x[0])}
              cy={toPx(1 - x[1])}
              r={9}
              fill={T[n] ? 'var(--accent)' : 'var(--bg)'}
              stroke="var(--fg)"
              strokeWidth={1.5}
            />
            <text
              x={toPx(x[0]) + (x[0] ? -14 : 14)}
              y={toPx(1 - x[1]) + (x[1] ? 18 : -12)}
              fontSize={10}
              fill="var(--fg-muted)"
              textAnchor="middle"
              fontFamily="monospace"
            >
              {`${x[0]}${x[1]}`}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="text-[11px]" style={{ color: 'var(--fg-muted)' }}>
        {title}
      </figcaption>
    </figure>
  )
}

function LossCurve({ losses }: { losses: number[] }) {
  const w = 220
  const h = 90
  const max = 0.55
  const pts = losses
    .map((l, i) => `${(i / Math.max(1, losses.length - 1)) * (w - 10) + 5},${h - 5 - (Math.min(l, max) / max) * (h - 15)}`)
    .join(' ')
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label="二乗誤差の推移">
        <line x1={5} y1={h - 5} x2={w - 5} y2={h - 5} stroke="var(--border)" />
        <line
          x1={5}
          y1={h - 5 - (0.25 / max) * (h - 15)}
          x2={w - 5}
          y2={h - 5 - (0.25 / max) * (h - 15)}
          stroke="var(--border)"
          strokeDasharray="3 3"
        />
        <text x={w - 6} y={h - 8 - (0.25 / max) * (h - 15)} fontSize={9} textAnchor="end" fill="var(--fg-muted)">
          0.25
        </text>
        <polyline points={pts} fill="none" stroke="var(--danger)" strokeWidth={2} />
      </svg>
      <figcaption className="text-[11px]" style={{ color: 'var(--fg-muted)' }}>
        二乗誤差の推移（点線の 0.25 は 2 点を 0.5 で妥協したときの値）
      </figcaption>
    </figure>
  )
}

export default function XorMlp() {
  const [c, setC] = useState<Case>(CASES[0]!.value)
  const frames = useMemo(() => trace(c), [c])

  return (
    <SimShell
      key={CASES.findIndex((x) => x.value === c)}
      title="2-2-1 のネットワークで XOR を学ぶ"
      subtitle="隠れ層の 2 個のニューロンがそれぞれ 1 本の直線を引き、出力はその 2 本の組み合わせで塗り分ける"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="初期値" presets={CASES} onPick={setC} />}
      legend={
        <>
          <span>塗りの濃さ = 出力の値（濃いほど 1）</span>
          <span style={{ color: 'var(--warn)' }}>━ 隠れ 1 の境界</span>
          <span style={{ color: 'var(--ok)' }}>╍ 隠れ 2 の境界</span>
          <span>● 正解 1　○ 正解 0</span>
        </>
      }
    >
      {(f) => (
        <div className="flex flex-wrap items-start gap-4">
          <Plane p={f.view.p} title="入力の平面と、出力の塗り分け" />
          <div className="space-y-3">
            <LossCurve losses={f.view.losses} />
            <table className="m-0 border-collapse font-mono text-[11px]">
              <thead>
                <tr style={{ color: 'var(--fg-muted)' }}>
                  <th className="px-1.5 text-left font-normal">入力</th>
                  <th className="px-1.5 font-normal">隠れ 1</th>
                  <th className="px-1.5 font-normal">隠れ 2</th>
                  <th className="px-1.5 font-normal">出力</th>
                  <th className="px-1.5 font-normal">正解</th>
                </tr>
              </thead>
              <tbody>
                {X.map((x, n) => {
                  const bad = Math.abs(f.view.outputs[n]! - T[n]!) >= TOL
                  return (
                    <tr key={n}>
                      <td className="px-1.5">{`${x[0]}${x[1]}`}</td>
                      <td className="px-1.5 text-right">{f.view.hidden[n]![0]!.toFixed(2)}</td>
                      <td className="px-1.5 text-right">{f.view.hidden[n]![1]!.toFixed(2)}</td>
                      <td
                        className="px-1.5 text-right font-bold"
                        style={{ color: bad ? 'var(--danger)' : 'var(--ok)' }}
                      >
                        {f.view.outputs[n]!.toFixed(2)}
                      </td>
                      <td className="px-1.5 text-right">{T[n]}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SimShell>
  )
}

