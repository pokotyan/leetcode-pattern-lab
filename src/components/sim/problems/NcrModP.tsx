import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `MOD = 1_000_000_007

def prepare(n):
    fact = [1] * (n + 1)
    for i in range(1, n + 1):
        fact[i] = fact[i-1] * i % MOD          # 階乗を前計算
    inv_fact = [1] * (n + 1)
    inv_fact[n] = pow(fact[n], MOD - 2, MOD)   # 末尾ぶんだけ逆元を求める
    for i in range(n, 0, -1):
        inv_fact[i-1] = inv_fact[i] * i % MOD  # 1つずつ戻す
    return fact, inv_fact

def ncr(n, r, fact, inv_fact):
    if r < 0 or r > n:
        return 0
    return fact[n] * inv_fact[r] % MOD * inv_fact[n-r] % MOD`

const MOD = 1000000007n

function modpow(a: bigint, b: bigint, m: bigint): bigint {
  let result = 1n
  let base = a % m
  let e = b
  while (e > 0n) {
    if (e & 1n) result = (result * base) % m
    base = (base * base) % m
    e >>= 1n
  }
  return result
}

type View = { fact: Cell[]; inv: Cell[]; factPtr: Pointer[]; invPtr: Pointer[]; answer: string }

function trace(n: number, r: number): Frame<View>[] {
  const fact = Array<bigint>(n + 1).fill(1n)
  const inv = Array<bigint | null>(n + 1).fill(null)
  const frames: Frame<View>[] = []
  let answer = ''

  const snap = (
    line: number | number[],
    note: string,
    opts: { fi?: number; ii?: number; pick?: number[]; finished?: boolean } = {},
  ) => {
    const pick = new Set(opts.pick ?? [])
    const factCells: Cell[] = fact.map((v, i) => ({
      value: v.toString(),
      state: i === opts.fi ? 'active' : pick.has(i) ? 'good' : 'window',
    }))
    const invCells: Cell[] = inv.map((v, i) => ({
      value: v === null ? '·' : v.toString(),
      state: v === null ? 'idle' : i === opts.ii ? 'active' : 'window',
    }))
    frames.push({
      line,
      note,
      vars: { n, r, 答え: answer || '−' },
      view: {
        fact: factCells,
        inv: invCells,
        factPtr: opts.fi !== undefined ? [{ name: 'i', index: opts.fi, tone: 'accent' }] : [],
        invPtr: opts.ii !== undefined ? [{ name: 'i', index: opts.ii, tone: 'warn' }] : [],
        answer,
      },
      done: opts.finished,
    })
  }

  snap(4, `まず 0! から ${n}! までを、毎回 MOD で畳みながら前計算する`)
  for (let i = 1; i <= n; i++) {
    fact[i] = (fact[i - 1]! * BigInt(i)) % MOD
    snap([5, 6], `fact[${i}] = fact[${i - 1}] × ${i} % MOD = ${fact[i]}`, { fi: i })
  }

  inv[n] = modpow(fact[n]!, MOD - 2n, MOD)
  snap([7, 8], `末尾の逆元だけを、繰り返し二乗法で求める。inv_fact[${n}] = fact[${n}]^(MOD-2) = ${inv[n]}。逆元を求めるのはここ1回だけ`, {
    ii: n,
  })

  for (let i = n; i >= 1; i--) {
    inv[i - 1] = (inv[i]! * BigInt(i)) % MOD
    snap([9, 10], `inv_fact[${i - 1}] = inv_fact[${i}] × ${i} % MOD = ${inv[i - 1]}。(1/${i}!) × ${i} = 1/${i - 1}! なので、1つずつ戻せる`, {
      ii: i - 1,
    })
  }

  const val = ((fact[n]! * inv[r]!) % MOD * inv[n - r]!) % MOD
  answer = val.toString()
  snap([16], `C(${n}, ${r}) = fact[${n}] × inv_fact[${r}] × inv_fact[${n - r}] % MOD = ${answer}`, {
    pick: [n],
    finished: true,
  })
  return frames
}

const PRESETS = [
  { name: 'C(10, 3)', value: { n: 10, r: 3 } },
  { name: 'C(6, 2)', value: { n: 6, r: 2 } },
  { name: 'C(12, 6)', value: { n: 12, r: 6 } },
]

export default function NcrModP() {
  const [n, setN] = useState(10)
  const [r, setR] = useState(3)
  const nn = Math.min(Math.max(Math.trunc(n), 1), 14)
  const rr = Math.min(Math.max(Math.trunc(r), 0), nn)
  const frames = useMemo(() => trace(nn, rr), [nn, rr])

  return (
    <SimShell
      title="二項係数を余りの世界で求める（階乗と逆元）"
      subtitle="階乗を前計算し、割り算は逆元の掛け算に置き換える。逆元を求めるのは1回だけで済む"
      code={CODE}
      frames={frames}
      controls={
        <>
          <NumberControl label="n =" value={n} onChange={setN} min={1} max={14} />
          <NumberControl label="r =" value={r} onChange={setR} min={0} max={14} />
          <PresetControl
            presets={PRESETS}
            onPick={(v) => {
              setN(v.n)
              setR(v.r)
            }}
          />
        </>
      }
      legend={
        <>
          <LegendItem state="active">いま計算したマス</LegendItem>
          <LegendItem state="window">計算済み</LegendItem>
          <LegendItem state="idle">まだ求めていない</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-4">
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              fact（i! を MOD で割った余り）
            </p>
            <ArrayView cells={f.view.fact} pointers={f.view.factPtr} size={76} />
          </div>
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              inv_fact（i! の逆元）
            </p>
            <ArrayView cells={f.view.inv} pointers={f.view.invPtr} showIndex={false} size={76} />
          </div>
          {f.view.answer && (
            <p className="m-0 font-mono text-sm" style={{ color: 'var(--ok)' }}>
              答え = {f.view.answer}
            </p>
          )}
        </div>
      )}
    </SimShell>
  )
}
