import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def power(a, b, mod):
    result = 1
    a %= mod
    while b > 0:
        if b & 1:                 # b の一番下のビットが 1 なら
            result = result * a % mod
        a = a * a % mod           # a を2乗して、担当する桁を1つ上げる
        b >>= 1                   # b を1ビット右へ送る
    return result`

type Input = { a: number; b: number; mod: number; label: string }
type View = { bits: Cell[]; pointers: Pointer[]; result: number; a: number; taken: number[] }

function trace({ a: a0, b: b0, mod }: Input): Frame<View>[] {
  const frames: Frame<View>[] = []
  const width = Math.max(b0.toString(2).length, 1)
  const allBits = b0.toString(2).padStart(width, '0').split('').reverse() // 右端が最下位
  const taken: number[] = []
  let result = 1
  let a = a0 % mod
  let b = b0
  let pos = 0

  const snap = (
    line: number | number[],
    note: string,
    opts: { use?: boolean; finished?: boolean } = {},
  ) => {
    const bits: Cell[] = allBits.map((bit, i) => {
      let state: Cell['state'] = 'idle'
      if (taken.includes(i)) state = 'good'
      if (i < pos && !taken.includes(i)) state = 'dim'
      if (i === pos) state = opts.use ? 'good' : 'active'
      return { value: bit, state, note: `2^${i}` }
    })
    frames.push({
      line,
      note,
      vars: { result, a, 残りのb: b, 見ている桁: pos },
      view: {
        bits,
        pointers: pos < allBits.length ? [{ name: 'いま', index: pos, tone: 'accent' }] : [],
        result,
        a,
        taken: [...taken],
      },
      done: opts.finished,
    })
  }

  snap([2, 3], `b = ${b0} を2進法で書くと ${b0.toString(2)}。指数を桁ごとに分けて、a の 2^k 乗を順に用意していく`)

  while (b > 0) {
    if (b & 1) {
      taken.push(pos)
      const before = result
      result = (result * a) % mod
      snap([5, 6], `${pos} 桁目のビットが 1。いまの a は a^(2^${pos}) にあたるので、result に掛ける。${before} × ${a} % ${mod} = ${result}`, {
        use: true,
      })
    } else {
      snap(5, `${pos} 桁目のビットは 0。この桁は使わないので、result はそのまま`)
    }
    a = (a * a) % mod
    b >>= 1
    pos += 1
    if (b > 0) {
      snap([7, 8], `a を2乗して a^(2^${pos}) にし、b を1ビット右へ送る。a = ${a}、残りの b = ${b}`)
    }
  }
  snap(9, `完了。${a0}^${b0} mod ${mod} = ${result}。掛け算の回数は ${b0.toString(2).length} 回ぶんで済んでいる`, {
    finished: true,
  })
  return frames
}

const PRESETS: { name: string; value: Input }[] = [
  { name: '3^13 mod 1000', value: { a: 3, b: 13, mod: 1000, label: '' } },
  { name: '2^10 mod 1000', value: { a: 2, b: 10, mod: 1000, label: '' } },
  { name: '逆元 3^5 mod 7', value: { a: 3, b: 5, mod: 7, label: '' } },
  { name: '5^23 mod 101', value: { a: 5, b: 23, mod: 101, label: '' } },
]

export default function FastPow() {
  const [a, setA] = useState(3)
  const [b, setB] = useState(13)
  const [mod, setMod] = useState(1000)
  const input = useMemo<Input>(
    () => ({
      a: Math.max(1, Math.trunc(a)),
      b: Math.min(Math.max(1, Math.trunc(b)), 255),
      mod: Math.max(2, Math.trunc(mod)),
      label: '',
    }),
    [a, b, mod],
  )
  const frames = useMemo(() => trace(input), [input])

  return (
    <SimShell
      title="繰り返し二乗法（べき乗を O(log b) で）"
      subtitle="指数を2進法で分解し、a を2乗しながら「立っている桁」だけ掛け合わせる"
      code={CODE}
      frames={frames}
      controls={
        <>
          <NumberControl label="a =" value={a} onChange={setA} min={1} max={999} />
          <NumberControl label="b =" value={b} onChange={setB} min={1} max={255} />
          <NumberControl label="mod =" value={mod} onChange={setMod} min={2} max={100000} />
          <PresetControl
            presets={PRESETS}
            onPick={(v) => {
              setA(v.a)
              setB(v.b)
              setMod(v.mod)
            }}
          />
        </>
      }
      legend={
        <>
          <LegendItem state="active">いま見ている桁</LegendItem>
          <LegendItem state="good">1 が立っていて、result に掛けた桁</LegendItem>
          <LegendItem state="dim">0 だったので使わなかった桁</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-4">
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              b のビット（左が 2^0。下の表記が担当する指数）
            </p>
            <ArrayView cells={f.view.bits} pointers={f.view.pointers} showIndex={false} size={46} />
          </div>
          <div className="flex flex-wrap gap-4 font-mono text-xs">
            <span style={{ color: 'var(--fg-muted)' }}>
              result = <span style={{ color: 'var(--ok)' }}>{f.view.result}</span>
            </span>
            <span style={{ color: 'var(--fg-muted)' }}>
              いまの a = <span style={{ color: 'var(--accent)' }}>{f.view.a}</span>
            </span>
          </div>
        </div>
      )}
    </SimShell>
  )
}
