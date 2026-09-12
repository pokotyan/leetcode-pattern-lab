import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def sieve(n):
    is_prime = [True] * (n + 1)
    is_prime[0] = is_prime[1] = False
    p = 2
    while p * p <= n:
        if is_prime[p]:
            for q in range(p * p, n + 1, p):   # p*p から始めてよい
                is_prime[q] = False
        p += 1
    return [i for i, v in enumerate(is_prime) if v]`

type View = { cells: Cell[]; pointers: Pointer[]; primes: number[] }

function trace(n: number): Frame<View>[] {
  const isPrime = Array<boolean>(n + 1).fill(true)
  isPrime[0] = false
  if (n >= 1) isPrime[1] = false
  const frames: Frame<View>[] = []
  let crossed = 0

  const snap = (
    line: number | number[],
    note: string,
    opts: { p?: number; q?: number; done?: boolean } = {},
  ) => {
    const cells: Cell[] = isPrime.map((v, i) => {
      let state: Cell['state'] = v ? 'idle' : 'dim'
      if (v && opts.p !== undefined && i < opts.p * opts.p) state = 'good'
      if (opts.done && v) state = 'good'
      if (i === opts.q) state = 'bad'
      if (i === opts.p) state = 'active'
      return { value: i, state }
    })
    const pointers: Pointer[] = []
    if (opts.p !== undefined) pointers.push({ name: 'p', index: opts.p, tone: 'accent' })
    if (opts.q !== undefined) pointers.push({ name: 'q', index: opts.q, side: 'bottom', tone: 'danger' })
    frames.push({
      line,
      note,
      vars: { n, p: opts.p ?? '−', 消した数: crossed },
      view: { cells, pointers, primes: isPrime.map((v, i) => (v ? i : -1)).filter((i) => i >= 0) },
      done: opts.done,
    })
  }

  snap([2, 3], `0 から ${n} までを「素数の候補」として並べる。0 と 1 は素数ではないので先に落としておく`)

  let p = 2
  while (p * p <= n) {
    if (isPrime[p]) {
      snap([5, 6], `p = ${p} はまだ候補として残っている。ここまで誰にも消されなかったということは、${p} は素数`, {
        p,
      })
      for (let q = p * p; q <= n; q += p) {
        isPrime[q] = false
        crossed += 1
        snap([7, 8], `${q} = ${p} × ${q / p} なので素数ではない。候補から外す`, { p, q })
      }
    } else {
      snap([5, 6], `p = ${p} はすでに消されている。${p} の倍数は、${p} を割り切る小さい素数の倍数として消し終わっている`, {
        p,
      })
    }
    p += 1
  }
  const primes = isPrime.map((v, i) => (v ? i : -1)).filter((i) => i >= 0)
  snap(10, `p × p が ${n} を超えたので終了。残った ${primes.length} 個が素数: ${primes.join(', ')}`, {
    done: true,
  })
  return frames
}

const PRESETS = [
  { name: 'n = 30', value: 30 },
  { name: 'n = 20', value: 20 },
  { name: 'n = 49', value: 49 },
]

export default function Sieve() {
  const [n, setN] = useState(30)
  const nn = Math.min(Math.max(Math.trunc(n), 2), 50)
  const frames = useMemo(() => trace(nn), [nn])

  return (
    <SimShell
      title="エラトステネスの篩（素数をまとめて求める）"
      subtitle="素数を見つけるたびに、その倍数を candidate から消す。全体で O(N log log N)"
      code={CODE}
      frames={frames}
      controls={
        <>
          <NumberControl label="n =" value={n} onChange={setN} min={2} max={50} />
          <PresetControl presets={PRESETS} onPick={setN} />
        </>
      }
      legend={
        <>
          <LegendItem state="active">いま見ている p</LegendItem>
          <LegendItem state="bad">いま消した数</LegendItem>
          <LegendItem state="dim">消された数（合成数）</LegendItem>
          <LegendItem state="good">素数と確定</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <ArrayView cells={f.view.cells} pointers={f.view.pointers} showIndex={false} size={32} />
          <p className="m-0 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
            残っている候補: <span style={{ color: 'var(--ok)' }}>{f.view.primes.join(', ')}</span>
          </p>
        </div>
      )}
    </SimShell>
  )
}
