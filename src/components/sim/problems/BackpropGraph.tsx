import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { Slider } from '../viz/VizShell'
import type { Frame } from '../core/types'

const CODE = `# 順方向: 箱ごとに値を計算する
m = w * x
a = m + b
d = a - y
L = d ** 2

# 逆方向: 出力から順に「L をこの値で微分したもの」を配る
L_grad = 1.0
d_grad = 2 * d * L_grad      # 2 乗の箱: 2d を掛ける
a_grad = d_grad              # 引き算の箱: a へはそのまま
y_grad = -d_grad             #             y へは符号を反転
m_grad = a_grad              # 足し算の箱: そのまま配る
b_grad = a_grad
w_grad = x * m_grad          # 掛け算の箱: 相手の値を掛ける
x_grad = w * m_grad

# 重みを勾配の逆向きに少し動かす
w = w - lr * w_grad
b = b - lr * b_grad`

type NodeId = 'w' | 'x' | 'b' | 'y' | 'm' | 'a' | 'd' | 'L'
type Phase = 'forward' | 'backward' | 'update'
type View = {
  value: Partial<Record<NodeId, number>>
  grad: Partial<Record<NodeId, number>>
  focus: NodeId[]
  phase: Phase
  updated?: { w: number; b: number; L: number }
}
type Input = { w: number; x: number; b: number; y: number; lr: number }

const NODES: { id: NodeId; label: string; x: number; y: number; leaf?: boolean }[] = [
  { id: 'w', label: 'w', x: 40, y: 40, leaf: true },
  { id: 'x', label: 'x', x: 40, y: 120, leaf: true },
  { id: 'b', label: 'b', x: 170, y: 200, leaf: true },
  { id: 'y', label: 'y', x: 300, y: 200, leaf: true },
  { id: 'm', label: '×', x: 170, y: 80 },
  { id: 'a', label: '+', x: 300, y: 110 },
  { id: 'd', label: '−', x: 430, y: 140 },
  { id: 'L', label: '²', x: 560, y: 140 },
]
const EDGES: [NodeId, NodeId][] = [
  ['w', 'm'],
  ['x', 'm'],
  ['m', 'a'],
  ['b', 'a'],
  ['a', 'd'],
  ['y', 'd'],
  ['d', 'L'],
]
const NAME: Record<NodeId, string> = { w: 'w', x: 'x', b: 'b', y: 'y', m: 'm', a: 'a', d: 'd', L: 'L' }

const r3 = (v: number) => Math.round(v * 1000) / 1000

function trace({ w, x, b, y, lr }: Input): Frame<View>[] {
  const value: View['value'] = { w, x, b, y }
  const grad: View['grad'] = {}
  const frames: Frame<View>[] = []
  const snap = (line: number | number[], note: string, focus: NodeId[], phase: Phase, extra: Partial<View> = {}, done = false) =>
    frames.push({
      line,
      note,
      view: { value: { ...value }, grad: { ...grad }, focus, phase, ...extra },
      vars: Object.fromEntries(
        (Object.keys(NAME) as NodeId[])
          .filter((k) => grad[k] !== undefined)
          .map((k) => [`∂L/∂${k}`, r3(grad[k]!)]),
      ),
      done,
    })

  snap(1, `入力は w=${w}, x=${x}, b=${b}, 正解 y=${y}。まだどの箱も計算していない`, ['w', 'x', 'b', 'y'], 'forward')
  const m = w * x
  value.m = m
  snap(2, `掛け算の箱: m = w × x = ${w} × ${x} = ${r3(m)}`, ['m'], 'forward')
  const a = m + b
  value.a = a
  snap(3, `足し算の箱: a = m + b = ${r3(m)} + ${b} = ${r3(a)}。これがモデルの予測`, ['a'], 'forward')
  const d = a - y
  value.d = d
  snap(4, `引き算の箱: d = a − y = ${r3(a)} − ${y} = ${r3(d)}。予測と正解のずれ`, ['d'], 'forward')
  const L = d * d
  value.L = L
  snap(5, `2 乗の箱: L = d² = ${r3(L)}。これを小さくしたい。順方向はここまで`, ['L'], 'forward')

  grad.L = 1
  snap(8, '逆方向の出発点。L を L 自身で微分すると 1', ['L'], 'backward')
  grad.d = 2 * d
  snap(9, `2 乗の箱の局所的な傾きは 2d = ${r3(2 * d)}。受け取った 1 にこれを掛けて d へ渡す`, ['d'], 'backward')
  grad.a = grad.d
  grad.y = -grad.d
  snap([10, 11], `引き算の箱: a へは ${r3(grad.d)} をそのまま、y へは符号を反転した ${r3(-grad.d)} を渡す`, ['a', 'y'], 'backward')
  grad.m = grad.a
  grad.b = grad.a
  snap([12, 13], `足し算の箱: 受け取った ${r3(grad.a)} を、m と b の両方へそのまま配る`, ['m', 'b'], 'backward')
  grad.w = x * grad.m
  grad.x = w * grad.m
  snap(
    [14, 15],
    `掛け算の箱: w へは相手の x=${x} を掛けた ${r3(grad.w)}、x へは相手の w=${w} を掛けた ${r3(grad.x)} を渡す。1 往復ですべての勾配がそろった`,
    ['w', 'x'],
    'backward',
  )

  const w2 = w - lr * grad.w
  const b2 = b - lr * grad.b
  const L2 = (w2 * x + b2 - y) ** 2
  snap(
    [18, 19],
    `学習率 ${lr} で w と b を勾配の逆向きに動かす: w ${w} → ${r3(w2)}、b ${b} → ${r3(b2)}。同じ入力で計算し直すと L は ${r3(L)} → ${r3(L2)}`,
    ['w', 'b'],
    'update',
    { updated: { w: r3(w2), b: r3(b2), L: r3(L2) } },
    true,
  )
  return frames
}

const R = 24

function Graph({ view }: { view: View }) {
  const pos = new Map(NODES.map((n) => [n.id, n]))
  return (
    <svg viewBox="0 0 610 250" className="w-full" style={{ minWidth: 480 }} role="img" aria-label="計算グラフ">
      <defs>
        <marker id="bp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--fg-muted)" />
        </marker>
      </defs>
      {EDGES.map(([from, to]) => {
        const a = pos.get(from)!
        const b = pos.get(to)!
        const dx = b.x - a.x
        const dy = b.y - a.y
        const len = Math.hypot(dx, dy)
        return (
          <line
            key={`${from}-${to}`}
            x1={a.x + (dx / len) * R}
            y1={a.y + (dy / len) * R}
            x2={b.x - (dx / len) * (R + 4)}
            y2={b.y - (dy / len) * (R + 4)}
            stroke="var(--border)"
            strokeWidth={2}
            markerEnd="url(#bp-arrow)"
          />
        )
      })}
      {NODES.map((n) => {
        const focused = view.focus.includes(n.id)
        const v = view.value[n.id]
        const g = view.grad[n.id]
        const stroke = focused ? (view.phase === 'forward' ? 'var(--accent)' : 'var(--warn)') : 'var(--border)'
        return (
          <g key={n.id}>
            <circle
              cx={n.x}
              cy={n.y}
              r={R}
              fill={n.leaf ? 'var(--bg)' : 'var(--bg-soft)'}
              stroke={stroke}
              strokeWidth={focused ? 3 : 1.5}
            />
            <text x={n.x} y={n.y + 5} textAnchor="middle" fontSize={15} fontWeight={700} fill="var(--fg)">
              {n.label}
            </text>
            {!n.leaf && (
              <text x={n.x} y={n.y - R - 20} textAnchor="middle" fontSize={11} fill="var(--fg-muted)">
                {NAME[n.id]}
              </text>
            )}
            <text x={n.x} y={n.y - R - 6} textAnchor="middle" fontSize={12} fontFamily="monospace" fill="var(--accent)">
              {v === undefined ? '' : r3(v)}
            </text>
            <text x={n.x} y={n.y + R + 15} textAnchor="middle" fontSize={12} fontFamily="monospace" fill="var(--warn)">
              {g === undefined ? '' : `∂ ${r3(g)}`}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default function BackpropGraph() {
  const [input, setInput] = useState<Input>({ w: 0.5, x: 2, b: 0.1, y: 2, lr: 0.05 })
  const frames = useMemo(() => trace(input), [input])
  const set = (k: keyof Input) => (v: number) => setInput((p) => ({ ...p, [k]: v }))
  const fmt1 = (v: number) => v.toFixed(1)

  return (
    <SimShell
      key={JSON.stringify(input)}
      title="計算グラフの順方向と逆方向"
      subtitle="L = (w·x + b − y)² を箱に分け、値を前から、勾配を後ろから埋める"
      code={CODE}
      frames={frames}
      controls={
        <>
          <Slider label="w" value={input.w} min={-2} max={2} step={0.1} onChange={set('w')} format={fmt1} />
          <Slider label="x" value={input.x} min={-2} max={3} step={0.1} onChange={set('x')} format={fmt1} />
          <Slider label="b" value={input.b} min={-2} max={2} step={0.1} onChange={set('b')} format={fmt1} />
          <Slider label="正解 y" value={input.y} min={-2} max={4} step={0.1} onChange={set('y')} format={fmt1} />
          <Slider label="学習率" value={input.lr} min={0.01} max={0.3} step={0.01} onChange={set('lr')} />
        </>
      }
      legend={
        <>
          <span style={{ color: 'var(--accent)' }}>上の数字: 順方向の値</span>
          <span style={{ color: 'var(--warn)' }}>下の ∂: L をその値で微分したもの</span>
        </>
      }
    >
      {(f) => (
        <div className="space-y-2">
          <Graph view={f.view} />
          {f.view.updated && (
            <p className="m-0 font-mono text-xs" style={{ color: 'var(--ok)' }}>
              更新後: w = {f.view.updated.w}, b = {f.view.updated.b}, L = {f.view.updated.L}
            </p>
          )}
        </div>
      )}
    </SimShell>
  )
}
