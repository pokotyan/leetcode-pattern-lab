import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import type { Frame } from '../core/types'

const GROVER_CODE = `import numpy as np

def grover(n, marked, iters):
    psi = np.full(n, 1 / np.sqrt(n))     # 全部の候補に同じ振幅
    for _ in range(iters):
        psi[marked] *= -1                # オラクル: 正解の符号だけ反転
        psi = 2 * psi.mean() - psi       # 平均の周りで折り返す
    return psi[marked] ** 2              # 測ったとき正解が出る確率`

const SHOR_CODE = `from math import gcd

def factor(n, a):
    # 量子コンピュータが速く求めるのはこの周期 r だけ
    x, r = a % n, 1
    while x != 1:
        x, r = x * a % n, r + 1
    if r % 2 == 1:
        return None                      # a を選び直す
    h = pow(a, r // 2, n)
    if h == n - 1:
        return None                      # a を選び直す
    return gcd(h - 1, n), gcd(h + 1, n)`

type GroverCase = { kind: 'grover'; n: number; marked: number; iters: number }
type ShorCase = { kind: 'shor'; n: number; a: number }
type Case = GroverCase | ShorCase

type GroverView = { kind: 'grover'; amps: number[]; marked: number; mean: number | null; flipped: boolean }
type ShorView = { kind: 'shor'; n: number; a: number; rows: number[]; period: number | null; half: number | null }
type View = GroverView | ShorView

function traceGrover({ n, marked, iters }: GroverCase): Frame<View>[] {
  const theta = Math.asin(1 / Math.sqrt(n))
  const best = Math.floor((Math.PI / 4) * Math.sqrt(n))
  let psi = Array.from({ length: n }, () => 1 / Math.sqrt(n))
  const frames: Frame<View>[] = []
  const vars = (k: number) => ({
    N: n,
    反復: k,
    正解の確率: (psi[marked]! ** 2).toFixed(4),
    'sin²((2k+1)θ)': (Math.sin((2 * k + 1) * theta) ** 2).toFixed(4),
    最適の目安: best,
  })
  const push = (line: number | number[], note: string, k: number, mean: number | null, flipped: boolean, done = false) =>
    frames.push({
      line,
      note,
      vars: vars(k),
      view: { kind: 'grover', amps: [...psi], marked, mean, flipped },
      done,
    })

  push(4, `${n} 個の候補すべてに同じ振幅 1/√${n} を置く。いま測ると、正解が出る確率は 1/${n}`, 0, null, false)
  for (let k = 1; k <= iters; k++) {
    psi[marked] = -psi[marked]!
    push(6, `${k} 回目のオラクル。正解の振幅だけ符号を反転する。確率は振幅の 2 乗なので、この時点では確率は変わらない`, k - 1, null, true)
    const mean = psi.reduce((s, v) => s + v, 0) / n
    psi = psi.map((v) => 2 * mean - v)
    const p = psi[marked]! ** 2
    const note =
      k === best
        ? `平均（点線）の周りで全員を折り返す。正解だけが平均の反対側にいたので大きく伸び、確率は ${p.toFixed(3)}。ここが最も高い`
        : k > best
          ? `折り返しを続けると、正解の振幅は回りすぎて縮み始める。確率は ${p.toFixed(3)}。回数を決め打ちしないといけない理由`
          : `平均（点線）の周りで全員を折り返す。正解だけが平均の反対側にいたので伸び、確率は ${p.toFixed(3)}`
    push(7, note, k, mean, false, k === iters)
  }
  return frames
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

function traceShor({ n, a }: ShorCase): Frame<View>[] {
  const frames: Frame<View>[] = []
  const rows = [1]
  const push = (line: number | number[], note: string, period: number | null, half: number | null, extra = {}, done = false) =>
    frames.push({
      line,
      note,
      vars: { N: n, a, r: period ?? '−', ...extra },
      view: { kind: 'shor', n, a, rows: [...rows], period, half },
      done,
    })

  push(5, `${a} を何乗かしたものを ${n} で割った余りを並べる。x = 0 では 1`, null, null)
  let x = a % n
  while (x !== 1) {
    rows.push(x)
    push([6, 7], `${a}^${rows.length - 1} mod ${n} = ${x}`, null, null)
    x = (x * a) % n
  }
  rows.push(1)
  const r = rows.length - 1
  push([6, 7], `${a}^${r} mod ${n} = 1。最初の 1 に戻ったので、周期 r = ${r}。ここまでを古典計算機で総当たりすると、N の桁数に対して指数的に時間がかかる`, r, null)
  if (r % 2 === 1) {
    push([8, 9], `r = ${r} は奇数なので半分にできない。別の a を選び直す`, r, null, {}, true)
    return frames
  }
  const h = Number(BigInt(a) ** BigInt(r / 2) % BigInt(n))
  if (h === n - 1) {
    push([10, 11, 12], `${a}^${r / 2} mod ${n} = ${h} = N − 1 になり、gcd が自明な値しか出さない。別の a を選び直す`, r, h, {}, true)
    return frames
  }
  const p = gcd(h - 1, n)
  const q = gcd(h + 1, n)
  push(
    [10, 13],
    `h = ${a}^${r / 2} mod ${n} = ${h}。h² ≡ 1 なので (h−1)(h+1) は ${n} の倍数。gcd(${h - 1}, ${n}) = ${p}、gcd(${h + 1}, ${n}) = ${q} で、${n} = ${p} × ${q}`,
    r,
    h,
    { 因数: `${p} × ${q}` },
    true,
  )
  return frames
}

const CASES: { name: string; value: Case }[] = [
  { name: 'Grover N=16', value: { kind: 'grover', n: 16, marked: 5, iters: 6 } },
  { name: 'Grover N=64', value: { kind: 'grover', n: 64, marked: 20, iters: 9 } },
  { name: 'Shor N=15, a=7', value: { kind: 'shor', n: 15, a: 7 } },
  { name: 'Shor N=21, a=2', value: { kind: 'shor', n: 21, a: 2 } },
  { name: 'Shor N=21, a=4', value: { kind: 'shor', n: 21, a: 4 } },
]

function GroverBars({ v }: { v: GroverView }) {
  const w = 520
  const h = 180
  const mid = h / 2
  const scale = (mid - 8) / Math.max(...v.amps.map(Math.abs), 1e-9)
  const bw = w / v.amps.length
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxWidth: w }} role="img" aria-label="振幅の棒グラフ">
      <line x1={0} x2={w} y1={mid} y2={mid} stroke="var(--border)" />
      {v.amps.map((amp, i) => {
        const len = amp * scale
        const isMarked = i === v.marked
        return (
          <rect
            key={i}
            x={i * bw + bw * 0.15}
            width={bw * 0.7}
            y={len >= 0 ? mid - len : mid}
            height={Math.abs(len)}
            fill={isMarked ? (v.flipped ? 'var(--warn)' : 'var(--ok)') : 'var(--accent)'}
            opacity={isMarked ? 1 : 0.55}
          />
        )
      })}
      {v.mean !== null && (
        <line
          x1={0}
          x2={w}
          y1={mid - v.mean * scale}
          y2={mid - v.mean * scale}
          stroke="var(--danger)"
          strokeDasharray="4 3"
        />
      )}
    </svg>
  )
}

function ShorTable({ v }: { v: ShorView }) {
  return (
    <div className="space-y-2">
      <p className="m-0 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
        x と {v.a}^x mod {v.n}
      </p>
      <div className="flex flex-wrap gap-1">
        {v.rows.map((val, x) => {
          const isHalf = v.period !== null && v.period % 2 === 0 && x === v.period / 2
          const isEnd = v.period !== null && x === v.period
          return (
            <div
              key={x}
              className="rounded border px-2 py-1 text-center font-mono text-xs"
              style={{
                borderColor: isEnd ? 'var(--ok)' : isHalf ? 'var(--warn)' : 'var(--border)',
                background: isEnd ? 'var(--ok-soft)' : isHalf ? 'var(--warn-soft)' : 'var(--bg)',
              }}
            >
              <div style={{ color: 'var(--fg-muted)' }}>{x}</div>
              <div className="font-bold">{val}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function GroverAmplitude() {
  const [c, setC] = useState<Case>(CASES[0]!.value)
  const frames = useMemo(() => (c.kind === 'grover' ? traceGrover(c) : traceShor(c)), [c])

  return (
    <SimShell
      title={c.kind === 'grover' ? 'Grover の振幅増幅' : 'Shor の古典部分：周期から因数へ'}
      subtitle={
        c.kind === 'grover'
          ? '符号の反転と平均の周りの折り返しを繰り返し、正解の振幅だけを育てる'
          : '周期 r さえ分かれば、残りは gcd だけで因数が出る'
      }
      code={c.kind === 'grover' ? GROVER_CODE : SHOR_CODE}
      frames={frames}
      controls={<PresetControl label="例" presets={CASES} onPick={setC} />}
      legend={
        c.kind === 'grover' ? (
          <>
            <span style={{ color: 'var(--ok)' }}>■ 正解の振幅</span>
            <span style={{ color: 'var(--warn)' }}>■ 符号を反転した直後</span>
            <span style={{ color: 'var(--accent)' }}>■ ほかの候補</span>
            <span style={{ color: 'var(--danger)' }}>┅ 振幅の平均</span>
          </>
        ) : (
          <>
            <span style={{ color: 'var(--warn)' }}>■ x = r/2</span>
            <span style={{ color: 'var(--ok)' }}>■ x = r（1 に戻った）</span>
          </>
        )
      }
    >
      {(f) => (f.view.kind === 'grover' ? <GroverBars v={f.view} /> : <ShorTable v={f.view} />)}
    </SimShell>
  )
}
