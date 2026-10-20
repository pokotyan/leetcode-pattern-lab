import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import type { Frame } from '../core/types'

const ATTN_CODE = `import numpy as np

def attend(s_prev, H):        # H: 入力の位置ごとの注釈 h_j を縦に並べた行列
    e = H @ s_prev            # 位置ごとのスコア e_ij（ここでは内積で測る）
    a = np.exp(e - e.max())
    a = a / a.sum()           # softmax で、足して 1 になる重み α_ij にする
    c = a @ H                 # 重み付きの和が、この時刻の文脈ベクトル c_i
    return a, c`

const RNN_CODE = `import numpy as np

def encode(xs, w, u):
    h, influence = 0.0, 1.0
    for t, x in enumerate(xs):
        h_new = np.tanh(w * h + u * x)
        if t > 0:
            influence *= w * (1 - h_new ** 2)   # ∂h_t/∂h_1 の掛け算を 1 つ進める
        h = h_new
    return h, influence       # 最後の状態と、最初の入力が残した影響の大きさ`

type Vec = [number, number, number]

type AttnCase = {
  kind: 'attn'
  src: string[]
  ann: Vec[]
  tgt: string[]
  dec: Vec[]
}
type RnnCase = { kind: 'rnn'; xs: number[]; w: number; u: number }
type Case = AttnCase | RnnCase

type AttnView = {
  kind: 'attn'
  src: string[]
  tgt: string[]
  rows: (number[] | null)[]
  current: number
  scores: number[] | null
  context: Vec | null
}
type RnnView = { kind: 'rnn'; xs: number[]; hs: number[]; influence: number[]; t: number }
type View = AttnView | RnnView

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const fmt = (v: number) => v.toFixed(2)
const fmtVec = (v: Vec) => `[${v.map(fmt).join(', ')}]`

function traceAttn(c: AttnCase): Frame<View>[] {
  const frames: Frame<View>[] = []
  const rows: (number[] | null)[] = c.tgt.map(() => null)
  const push = (
    line: number | number[],
    note: string,
    i: number,
    scores: number[] | null,
    context: Vec | null,
    vars: Record<string, string | number>,
    done = false,
  ) =>
    frames.push({
      line,
      note,
      vars,
      view: { kind: 'attn', src: c.src, tgt: c.tgt, rows: rows.map((r) => (r ? [...r] : null)), current: i, scores, context },
      done,
    })

  push(
    3,
    `入力の ${c.src.length} 語それぞれに、符号化器が注釈ベクトル h_j を 1 本ずつ作ってある。固定長の 1 本に押し込まず、${c.src.length} 本を全部残しておくのが attention の前提`,
    -1,
    null,
    null,
    { 入力: c.src.join(' '), 出力: c.tgt.join(' ') },
  )

  c.tgt.forEach((word, i) => {
    const s = c.dec[i]!
    const e = c.ann.map((h) => dot(h, s))
    push(
      4,
      `「${word}」を出す直前の復号器の状態 s = ${fmtVec(s)} と、各 h_j の内積でスコアを測る。大きいほど「その位置が今の訳語に関係する」`,
      i,
      e,
      null,
      { 時刻: i + 1, 's_{i-1}': fmtVec(s), スコア: e.map(fmt).join(' / ') },
    )
    const m = Math.max(...e)
    const ex = e.map((v) => Math.exp(v - m))
    const sum = ex.reduce((a, b) => a + b, 0)
    const a = ex.map((v) => v / sum)
    rows[i] = a
    const top = a.indexOf(Math.max(...a))
    push(
      [5, 6],
      `softmax で重みにする。足すと 1 で、いちばん重いのは「${c.src[top]}」（${(a[top]! * 100).toFixed(0)}%）。重みは 0 か 1 ではなく連続なので、微分でき、学習で育てられる`,
      i,
      e,
      null,
      { 時刻: i + 1, 'α_ij': a.map(fmt).join(' / '), 合計: fmt(a.reduce((x, y) => x + y, 0)) },
    )
    const ctx: Vec = [0, 1, 2].map((d) => a.reduce((acc, w, j) => acc + w * c.ann[j]![d]!, 0)) as Vec
    push(
      7,
      `重み付きの和 c_${i + 1} = Σ α_ij h_j = ${fmtVec(ctx)}。この時刻だけの文脈ベクトルで、これと s から「${word}」を出す`,
      i,
      e,
      ctx,
      { 時刻: i + 1, [`c_${i + 1}`]: fmtVec(ctx), 出力: word },
    )
  })

  push(
    8,
    `完了。行が出力の語、列が入力の語。語順が違う（「好き」は入力の最後、「like」は出力の 2 語目）ので、明るいマスは対角線に並ばない。並べ替えを、規則を書かずに重みとして学ぶ`,
    c.tgt.length,
    null,
    null,
    { 入力: c.src.join(' '), 出力: c.tgt.join(' ') },
    true,
  )
  return frames
}

function traceRnn(c: RnnCase): Frame<View>[] {
  const frames: Frame<View>[] = []
  const hs: number[] = []
  const influence: number[] = []
  let h = 0
  let inf = 1
  const push = (line: number | number[], note: string, t: number, done = false) =>
    frames.push({
      line,
      note,
      vars: { w: c.w, u: c.u, 時刻: t + 1, h: hs.length ? fmt(hs[hs.length - 1]!) : '0', '∂h_t/∂h_1': inf.toExponential(2) },
      view: { kind: 'rnn', xs: c.xs, hs: [...hs], influence: [...influence], t },
      done,
    })

  push(4, `入力 ${c.xs.length} 個を 1 つずつ読む。状態 h は 1 つの数だけ。前の h と今の入力を混ぜて新しい h を作る`, -1)
  c.xs.forEach((x, t) => {
    const hNew = Math.tanh(c.w * h + c.u * x)
    if (t > 0) inf *= c.w * (1 - hNew ** 2)
    h = hNew
    hs.push(h)
    influence.push(inf)
    push(
      t === 0 ? 6 : [6, 7, 8],
      t === 0
        ? `時刻 1：h = tanh(${c.w}·0 + ${c.u}·${x}) = ${fmt(h)}。最初の入力はここで h に入る`
        : `時刻 ${t + 1}：h = ${fmt(h)}。最初の入力が今の h に残す影響は、毎回 w·(1−h²) = ${fmt(c.w * (1 - hNew ** 2))} を掛けた積で、いま ${inf.toExponential(2)}`,
      t,
    )
  })
  push(
    10,
    `読み終えた。最初の入力の影響は ${inf.toExponential(2)} まで縮んだ。誤差を逆向きに流すときも同じ積を通るので、最初の語に届く勾配も同じだけ小さくなる（勾配消失）`,
    c.xs.length - 1,
    true,
  )
  return frames
}

const SRC = ['私', 'は', '猫', 'が', '好き']
const ANN: Vec[] = [
  [2, 0, 0],
  [0.3, 0.3, 0.3],
  [0, 2, 0],
  [0.2, 0.4, 0.2],
  [0, 0, 2],
]

const CASES: { name: string; value: Case }[] = [
  {
    name: 'attention で訳す',
    value: {
      kind: 'attn',
      src: SRC,
      ann: ANN,
      tgt: ['I', 'like', 'cats', '<eos>'],
      dec: [
        [1.5, 0, 0],
        [0, 0, 1.5],
        [0, 1.5, 0],
        [0.4, 0.4, 0.4],
      ],
    },
  },
  {
    name: '迷っている状態',
    value: {
      kind: 'attn',
      src: SRC,
      ann: ANN,
      tgt: ['I', 'like', 'cats', '<eos>'],
      dec: [
        [0.5, 0, 0],
        [0, 0.2, 0.5],
        [0, 0.5, 0.2],
        [0.2, 0.2, 0.2],
      ],
    },
  },
  { name: 'RNN の状態が薄れる（w=0.9）', value: { kind: 'rnn', xs: [1, 0.5, -0.3, 0.8, 0.1, -0.6, 0.4, 0.2, -0.1, 0.7, 0.3, -0.4], w: 0.9, u: 1 } },
  { name: 'w を大きく（w=2.0）：膨らんでから飽和する', value: { kind: 'rnn', xs: [1, 0.5, -0.3, 0.8, 0.1, -0.6, 0.4, 0.2, -0.1, 0.7, 0.3, -0.4], w: 2, u: 0.2 } },
]

function AttnHeat({ v }: { v: AttnView }) {
  const cw = 54
  const ch = 30
  const left = 60
  const top = 26
  const width = left + cw * v.src.length + 10
  const height = top + ch * v.tgt.length + 70
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', maxWidth: width }} role="img" aria-label="attention の重み">
      {v.src.map((w, j) => (
        <text key={w + j} x={left + cw * j + cw / 2} y={18} textAnchor="middle" fontSize={13} fill="var(--fg)">
          {w}
        </text>
      ))}
      {v.tgt.map((w, i) => (
        <g key={w + i}>
          <text
            x={left - 8}
            y={top + ch * i + ch / 2 + 4}
            textAnchor="end"
            fontSize={12}
            fill={i === v.current ? 'var(--accent)' : 'var(--fg)'}
            fontWeight={i === v.current ? 700 : 400}
          >
            {w}
          </text>
          {v.src.map((_, j) => {
            const a = v.rows[i]?.[j]
            return (
              <g key={j}>
                <rect
                  x={left + cw * j + 1}
                  y={top + ch * i + 1}
                  width={cw - 2}
                  height={ch - 2}
                  rx={4}
                  fill={a == null ? 'var(--bg)' : 'var(--accent)'}
                  fillOpacity={a == null ? 1 : 0.08 + 0.92 * a}
                  stroke={i === v.current ? 'var(--accent)' : 'var(--border)'}
                />
                {a != null && (
                  <text
                    x={left + cw * j + cw / 2}
                    y={top + ch * i + ch / 2 + 4}
                    textAnchor="middle"
                    fontSize={11}
                    fontFamily="monospace"
                    fill={a > 0.55 ? 'var(--bg)' : 'var(--fg)'}
                  >
                    {a.toFixed(2)}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      ))}
      {v.scores && (
        <g>
          <text x={left - 8} y={top + ch * v.tgt.length + 22} textAnchor="end" fontSize={11} fill="var(--fg-muted)">
            スコア e
          </text>
          {v.scores.map((e, j) => (
            <text
              key={j}
              x={left + cw * j + cw / 2}
              y={top + ch * v.tgt.length + 22}
              textAnchor="middle"
              fontSize={11}
              fontFamily="monospace"
              fill="var(--warn)"
            >
              {e.toFixed(2)}
            </text>
          ))}
        </g>
      )}
      {v.context && (
        <text x={left} y={top + ch * v.tgt.length + 48} fontSize={12} fontFamily="monospace" fill="var(--ok)">
          文脈ベクトル c = {fmtVec(v.context)}
        </text>
      )}
    </svg>
  )
}

function RnnDecay({ v }: { v: RnnView }) {
  const n = v.xs.length
  const bw = 38
  const left = 70
  const width = left + bw * n + 10
  const h1 = 60
  const h2 = 70
  const top2 = 30 + h1 + 30
  const height = top2 + h2 + 30
  const logMin = -8
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', maxWidth: width }} role="img" aria-label="RNN の状態と影響の減衰">
      <text x={left - 8} y={22} textAnchor="end" fontSize={11} fill="var(--fg-muted)">
        入力 x
      </text>
      {v.xs.map((x, t) => (
        <text
          key={t}
          x={left + bw * t + bw / 2}
          y={22}
          textAnchor="middle"
          fontSize={11}
          fontFamily="monospace"
          fill={t === v.t ? 'var(--accent)' : 'var(--fg)'}
        >
          {x}
        </text>
      ))}
      <text x={left - 8} y={30 + h1 / 2} textAnchor="end" fontSize={11} fill="var(--fg-muted)">
        状態 h
      </text>
      <line x1={left} x2={left + bw * n} y1={30 + h1 / 2} y2={30 + h1 / 2} stroke="var(--border)" />
      {v.hs.map((h, t) => {
        const y0 = 30 + h1 / 2
        const hh = (h * h1) / 2
        return (
          <rect
            key={t}
            x={left + bw * t + 6}
            y={hh >= 0 ? y0 - hh : y0}
            width={bw - 12}
            height={Math.abs(hh)}
            fill={t === v.t ? 'var(--accent)' : 'var(--fg-muted)'}
            opacity={0.8}
          />
        )
      })}
      <text x={left - 8} y={top2 + 12} textAnchor="end" fontSize={11} fill="var(--fg-muted)">
        最初の入力
      </text>
      <text x={left - 8} y={top2 + 26} textAnchor="end" fontSize={11} fill="var(--fg-muted)">
        の影響
      </text>
      <text x={left - 8} y={top2 + h2} textAnchor="end" fontSize={10} fill="var(--fg-muted)">
        1e{logMin}
      </text>
      {v.influence.map((inf, t) => {
        const lg = Math.max(logMin, Math.log10(Math.abs(inf) + 1e-300))
        const hgt = ((lg - logMin) / -logMin) * h2
        const tone = Math.abs(inf) > 1.5 ? 'var(--danger)' : Math.abs(inf) < 0.01 ? 'var(--warn)' : 'var(--ok)'
        return (
          <g key={t}>
            <rect x={left + bw * t + 6} y={top2 + h2 - Math.min(hgt, h2)} width={bw - 12} height={Math.min(hgt, h2)} fill={tone} opacity={0.85} />
            <text x={left + bw * t + bw / 2} y={top2 + h2 + 14} textAnchor="middle" fontSize={9} fontFamily="monospace" fill="var(--fg-muted)">
              {Math.abs(inf) >= 0.01 && Math.abs(inf) < 100 ? inf.toFixed(2) : inf.toExponential(0)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default function AttentionAlign() {
  const [c, setC] = useState<Case>(CASES[0]!.value)
  const frames = useMemo(() => (c.kind === 'attn' ? traceAttn(c) : traceRnn(c)), [c])

  return (
    <SimShell
      key={JSON.stringify(c)}
      title={c.kind === 'attn' ? 'attention：訳す語ごとに、入力のどこを見るか' : '1 本の状態に積み重ねると、最初の入力は薄れる'}
      subtitle={
        c.kind === 'attn'
          ? '注釈ベクトルと復号器の状態は説明用に手で置いた 3 次元の値。スコア → softmax → 重み付きの和を実際に計算している'
          : '1 次元の RNN。最初の入力が最後の状態に残す影響（∂h_t/∂h_1）を、時刻ごとに掛け算で追う'
      }
      code={c.kind === 'attn' ? ATTN_CODE : RNN_CODE}
      frames={frames}
      controls={<PresetControl label="例" presets={CASES} onPick={setC} />}
      legend={
        c.kind === 'attn' ? (
          <>
            <span style={{ color: 'var(--accent)' }}>■ 濃いほど重い α_ij</span>
            <span style={{ color: 'var(--warn)' }}>スコア e_ij</span>
            <span style={{ color: 'var(--ok)' }}>文脈ベクトル c_i</span>
          </>
        ) : (
          <>
            <span style={{ color: 'var(--ok)' }}>■ 影響が残っている</span>
            <span style={{ color: 'var(--warn)' }}>■ 0.01 未満まで縮んだ</span>
            <span style={{ color: 'var(--danger)' }}>■ 1.5 を超えて膨らんだ</span>
          </>
        )
      }
    >
      {(f) => (f.view.kind === 'attn' ? <AttnHeat v={f.view} /> : <RnnDecay v={f.view} />)}
    </SimShell>
  )
}
