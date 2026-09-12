import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl } from '../core/Controls'
import { GridView } from '../views/GridView'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def mat_mul(A, B, mod):
    n = len(A)
    C = [[0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            for k in range(n):
                C[i][j] = (C[i][j] + A[i][k] * B[k][j]) % mod
    return C

def mat_pow(A, e, mod):
    n = len(A)
    result = [[1 if i == j else 0 for j in range(n)] for i in range(n)]  # 単位行列
    while e > 0:
        if e & 1:
            result = mat_mul(result, A, mod)   # この桁を使う
        A = mat_mul(A, A, mod)                 # A を2乗して桁を1つ上げる
        e >>= 1
    return result

def fib(n, mod=10**9 + 7):
    if n == 0:
        return 0
    return mat_pow([[1, 1], [1, 0]], n - 1, mod)[0][0]`

const MOD = 1000000007

type Mat = number[][]
type View = { result: Cell[][]; base: Cell[][]; bits: Cell[]; pointers: Pointer[]; answer: string }

const mul = (A: Mat, B: Mat): Mat => {
  const C: Mat = [
    [0, 0],
    [0, 0],
  ]
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++)
      for (let k = 0; k < 2; k++) C[i]![j] = (C[i]![j]! + A[i]![k]! * B[k]![j]!) % MOD
  return C
}

const toCells = (m: Mat, highlight: boolean): Cell[][] =>
  m.map((row) => row.map((v): Cell => ({ value: v, state: highlight ? 'good' : 'window' })))

function trace(n: number): Frame<View>[] {
  const frames: Frame<View>[] = []
  let result: Mat = [
    [1, 0],
    [0, 1],
  ]
  let A: Mat = [
    [1, 1],
    [1, 0],
  ]
  const e0 = Math.max(n - 1, 0)
  const width = Math.max(e0.toString(2).length, 1)
  const bitsAll = e0.toString(2).padStart(width, '0').split('').reverse()
  let e = e0
  let pos = 0
  const used: number[] = []

  const snap = (
    line: number | number[],
    note: string,
    opts: { useResult?: boolean; useBase?: boolean; finished?: boolean } = {},
  ) => {
    const bits: Cell[] = bitsAll.map((b, i) => ({
      value: b,
      note: `2^${i}`,
      state: used.includes(i) ? 'good' : i === pos ? 'active' : i < pos ? 'dim' : 'idle',
    }))
    frames.push({
      line,
      note,
      vars: { n, 残りの指数: e, 見ている桁: pos, 'F(n)': result[0]![0]! },
      view: {
        result: toCells(result, opts.useResult ?? false),
        base: toCells(A, opts.useBase ?? false),
        bits,
        pointers: pos < bitsAll.length ? [{ name: 'いま', index: pos, tone: 'accent' }] : [],
        answer: '',
      },
      done: opts.finished,
    })
  }

  snap([12], `F(n) を求めるには、行列 [[1,1],[1,0]] を n−1 = ${e0} 乗して左上を読めばよい。result は単位行列から始める`)

  while (e > 0) {
    if (e & 1) {
      used.push(pos)
      result = mul(result, A)
      snap([14, 15], `${pos} 桁目のビットが 1。いまの A は元の行列の 2^${pos} 乗なので、result に掛ける`, {
        useResult: true,
      })
    } else {
      snap(14, `${pos} 桁目のビットは 0。この桁は使わないので result はそのまま`)
    }
    A = mul(A, A)
    e >>= 1
    pos += 1
    if (e > 0) snap([16, 17], `A を2乗して、元の行列の 2^${pos} 乗にする。残りの指数は ${e}`, { useBase: true })
  }

  snap(23, `完了。result の左上が F(${n}) = ${result[0]![0]}。掛け算は ${bitsAll.length} 桁ぶんしか行っていない`, {
    useResult: true,
    finished: true,
  })
  return frames
}

const PRESETS = [
  { name: 'F(10)', value: 10 },
  { name: 'F(13)', value: 13 },
  { name: 'F(30)', value: 30 },
  { name: 'F(90)', value: 90 },
]

export default function MatrixPower() {
  const [n, setN] = useState(10)
  const nn = Math.min(Math.max(Math.trunc(n), 1), 200)
  const frames = useMemo(() => trace(nn), [nn])

  return (
    <SimShell
      title="行列累乗（フィボナッチを O(log N) で）"
      subtitle="漸化式を行列の掛け算1回に置き換え、繰り返し二乗法をそのまま適用する"
      code={CODE}
      frames={frames}
      controls={
        <>
          <NumberControl label="n =" value={n} onChange={setN} min={1} max={200} />
          <PresetControl presets={PRESETS} onPick={setN} />
        </>
      }
      legend={
        <>
          <LegendItem state="good">この手で更新した行列</LegendItem>
          <LegendItem state="window">いまの値</LegendItem>
          <LegendItem state="active">見ている桁</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-4">
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              n−1 のビット（左が 2^0）
            </p>
            <ArrayView cells={f.view.bits} pointers={f.view.pointers} showIndex={false} size={44} />
          </div>
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                result（答えを積み上げる）
              </p>
              <GridView grid={f.view.result} cellSize={56} />
            </div>
            <div>
              <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                A（2乗を繰り返す）
              </p>
              <GridView grid={f.view.base} cellSize={56} />
            </div>
          </div>
        </div>
      )}
    </SimShell>
  )
}
