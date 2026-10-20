import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import type { Frame } from '../core/types'

const CODE = `Q = H @ W_q          # 語ごとの「問い」（ここでは値を直接与える）
K = H @ W_k          # 語ごとの「名札」
V = H @ W_v          # 語ごとの「渡す中身」
S = Q @ K.T          # 行 i・列 j = 語 i の問いと語 j の名札の内積
S = S / np.sqrt(d_k)
S[i < j] = -np.inf   # 復号器だけ: 自分より後ろの語を見ない
A = np.exp(S - S.max(axis=1, keepdims=True))
A = A / A.sum(axis=1, keepdims=True)   # 行ごとに softmax
out = A @ V          # 重み付きの和`

const WORDS = ['猫', 'が', '鳴く']
// 本文の手計算と同じ値。d_k = 2
const Q = [
  [1, 0],
  [0, 2],
  [2, 1],
]
const K = [
  [2, 0],
  [0, 1],
  [1, 1],
]
const V = [
  [1, 0],
  [0, 1],
  [1, 1],
]
const DK = 2

type Case = { mask: boolean; scale: boolean }
type Grid = (number | null)[][]
type View = {
  scores: Grid
  weights: Grid
  out: (number[] | null)[]
  row: number | null
  stage: 'qkv' | 'score' | 'scale' | 'mask' | 'softmax' | 'out' | 'done'
}

const r2 = (v: number) => Math.round(v * 100) / 100
const r3 = (v: number) => Math.round(v * 1000) / 1000
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0)
const empty = (): Grid => WORDS.map(() => WORDS.map(() => null))

function trace({ mask, scale }: Case): Frame<View>[] {
  const frames: Frame<View>[] = []
  const scores = empty()
  const weights = empty()
  const out: (number[] | null)[] = WORDS.map(() => null)
  const snap = (line: number | number[], note: string, row: number | null, stage: View['stage'], vars = {}) =>
    frames.push({
      line,
      note,
      vars,
      view: { scores: scores.map((r) => [...r]), weights: weights.map((r) => [...r]), out: [...out], row, stage },
      done: stage === 'done',
    })

  snap(
    [1, 2, 3],
    '3 つの語が、それぞれ問い q・名札 k・中身 v の 3 本のベクトルを持つ。本物のモデルでは、語の埋め込みに 3 枚の重み行列を掛けて作る',
    null,
    'qkv',
  )

  for (let i = 0; i < WORDS.length; i++) {
    const w = WORDS[i]!
    for (let j = 0; j < WORDS.length; j++) scores[i]![j] = dot(Q[i]!, K[j]!)
    snap(
      4,
      `「${w}」の問い q=(${Q[i]!.join(', ')}) と、全員の名札との内積を取る: ${WORDS.map((u, j) => `${u} ${scores[i]![j]}`).join('、')}。値が大きいほど「よく合う」`,
      i,
      'score',
    )
    if (scale) {
      for (let j = 0; j < WORDS.length; j++) scores[i]![j] = r3(scores[i]![j]! / Math.sqrt(DK))
      snap(5, `√d_k = √2 ≈ 1.414 で割る: ${scores[i]!.map((s) => r2(s!)).join('、')}。次元が大きいと内積が大きくなりすぎるのを抑える`, i, 'scale')
    }
    if (mask) {
      const hidden = WORDS.slice(i + 1)
      for (let j = i + 1; j < WORDS.length; j++) scores[i]![j] = -Infinity
      snap(
        6,
        hidden.length > 0
          ? `復号器なので、「${w}」より後ろの ${hidden.map((u) => `「${u}」`).join('')} のスコアを −∞ にする。softmax の後で重みが 0 になる`
          : `「${w}」は最後の語なので、隠す相手はいない`,
        i,
        'mask',
      )
    }
    const row = scores[i]!.map((s) => s!)
    const mx = Math.max(...row)
    const ex = row.map((s) => (s === -Infinity ? 0 : Math.exp(s - mx)))
    const sum = ex.reduce((a, b) => a + b, 0)
    for (let j = 0; j < WORDS.length; j++) weights[i]![j] = r3(ex[j]! / sum)
    snap(
      [7, 8],
      `行ごとに softmax で、足して 1 になる重みにする: ${WORDS.map((u, j) => `${u} ${weights[i]![j]}`).join('、')}`,
      i,
      'softmax',
      { 合計: r3(weights[i]!.reduce((a, b) => a! + b!, 0)!) },
    )
    out[i] = [0, 1].map((d) => r3(weights[i]!.reduce((s, a, j) => s! + a! * V[j]![d]!, 0)!))
    snap(
      9,
      `重みで中身 v を混ぜる: ${WORDS.map((u, j) => `${weights[i]![j]}×(${V[j]!.join(',')})`).join(' + ')} = (${out[i]!.join(', ')})。これが「${w}」の新しい表現`,
      i,
      'out',
    )
  }
  snap(9, mask ? '完了。どの語も、自分と自分より前の語だけを混ぜた' : '完了。どの語も、文全体を見て自分の表現を作り直した。3 行の計算は互いに独立なので同時にできる', null, 'done')
  return frames
}

const CASES: { name: string; value: Case }[] = [
  { name: '符号化器（マスクなし）', value: { mask: false, scale: true } },
  { name: '復号器（マスクあり）', value: { mask: true, scale: true } },
  { name: '√d_k で割らない', value: { mask: false, scale: false } },
]

const fmt = (v: number | null) => (v === null ? '' : v === -Infinity ? '−∞' : String(r2(v)))

function Matrix({ title, rows, cols, data, hl }: { title: string; rows: string[]; cols: string[]; data: (number | null)[][]; hl?: number | null }) {
  return (
    <div>
      <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
        {title}
      </p>
      <table className="border-collapse font-mono text-[11px]">
        <thead>
          <tr>
            <th />
            {cols.map((c) => (
              <th key={c} className="px-1.5 font-normal" style={{ color: 'var(--fg-muted)' }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r} style={i === hl ? { background: 'var(--accent-soft)' } : undefined}>
              <th className="pr-1.5 text-right font-normal" style={{ color: 'var(--fg-muted)' }}>
                {r}
              </th>
              {data[i]!.map((v, j) => (
                <td key={j} className="border px-1.5 py-0.5 text-right" style={{ borderColor: 'var(--border)', minWidth: 34 }}>
                  {fmt(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Heat({ weights, row }: { weights: Grid; row: number | null }) {
  const cell = 46
  const left = 40
  const top = 18
  return (
    <svg width={left + cell * 3 + 4} height={top + cell * 3 + 4} role="img" aria-label="注意の重みのヒートマップ">
      {WORDS.map((w, j) => (
        <text key={`c${j}`} x={left + cell * j + cell / 2} y={12} textAnchor="middle" fontSize={11} fill="var(--fg-muted)">
          {w}
        </text>
      ))}
      {WORDS.map((w, i) => (
        <g key={`r${i}`}>
          <text x={left - 6} y={top + cell * i + cell / 2 + 4} textAnchor="end" fontSize={11} fill="var(--fg-muted)">
            {w}
          </text>
          {WORDS.map((_, j) => {
            const a = weights[i]![j]
            return (
              <g key={j}>
                <rect
                  x={left + cell * j}
                  y={top + cell * i}
                  width={cell - 2}
                  height={cell - 2}
                  rx={4}
                  fill={a === null ? 'var(--bg)' : 'var(--accent)'}
                  fillOpacity={a === null ? 1 : 0.06 + 0.94 * a}
                  stroke={i === row ? 'var(--warn)' : 'var(--border)'}
                  strokeWidth={i === row ? 2 : 1}
                />
                {a !== null && (
                  <text
                    x={left + cell * j + cell / 2 - 1}
                    y={top + cell * i + cell / 2 + 3}
                    textAnchor="middle"
                    fontSize={11}
                    fontFamily="monospace"
                    fill={a > 0.5 ? 'var(--bg)' : 'var(--fg)'}
                  >
                    {r2(a)}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      ))}
    </svg>
  )
}

export default function SelfAttention() {
  const [c, setC] = useState<Case>(CASES[0]!.value)
  const frames = useMemo(() => trace(c), [c])

  return (
    <SimShell
      key={JSON.stringify(c)}
      title="自己注意（scaled dot-product attention）"
      subtitle="3 語の文で、スコア表 → 割る → （隠す）→ softmax → 重み付きの和 を 1 行ずつ計算する"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="場面" presets={CASES} onPick={setC} />}
    >
      {(f) => (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-4">
            <Matrix title="Q（問い）" rows={WORDS} cols={['1', '2']} data={Q} hl={f.view.row} />
            <Matrix title="K（名札）" rows={WORDS} cols={['1', '2']} data={K} />
            <Matrix title="V（中身）" rows={WORDS} cols={['1', '2']} data={V} />
          </div>
          <div className="flex flex-wrap items-start gap-4">
            <Matrix
              title={c.scale ? 'スコア QKᵀ/√d_k（行 = 問う語、列 = 見られる語）' : 'スコア QKᵀ（行 = 問う語、列 = 見られる語）'}
              rows={WORDS}
              cols={WORDS}
              data={f.view.scores}
              hl={f.view.row}
            />
            <div>
              <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                重み A（softmax の後）
              </p>
              <Heat weights={f.view.weights} row={f.view.row} />
            </div>
            <Matrix
              title="出力 A·V"
              rows={WORDS}
              cols={['1', '2']}
              data={f.view.out.map((o) => (o ? o : [null, null]))}
              hl={f.view.row}
            />
          </div>
        </div>
      )}
    </SimShell>
  )
}
