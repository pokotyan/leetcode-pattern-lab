import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `from math import gcd

def count_divisible(n, a, b, c):
    def lcm(x, y):
        return x // gcd(x, y) * y

    return (n // a + n // b + n // c
            - n // lcm(a, b) - n // lcm(b, c) - n // lcm(a, c)
            + n // lcm(lcm(a, b), c))`

type Input = { n: number; a: number; b: number; c: number }
type View = { cells: Cell[]; terms: string[]; running: number; truth: number }

const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y))
const lcm = (x: number, y: number) => (x / gcd(x, y)) * y

function trace({ n, a, b, c }: Input): Frame<View>[] {
  const frames: Frame<View>[] = []
  const terms: string[] = []
  let running = 0
  const truth = Array.from({ length: n }, (_, i) => i + 1).filter(
    (v) => v % a === 0 || v % b === 0 || v % c === 0,
  ).length

  const snap = (
    line: number | number[],
    note: string,
    opts: { mark?: number; sign?: 1 | -1; finished?: boolean } = {},
  ) => {
    const cells: Cell[] = Array.from({ length: n }, (_, i) => {
      const v = i + 1
      const hit = opts.mark !== undefined && v % opts.mark === 0
      const any = v % a === 0 || v % b === 0 || v % c === 0
      let state: Cell['state'] = any ? 'window' : 'idle'
      if (hit) state = opts.sign === -1 ? 'bad' : 'good'
      if (opts.finished) state = any ? 'good' : 'idle'
      return { value: v, state }
    })
    frames.push({
      line,
      note,
      vars: { n, 'a/b/c': `${a}/${b}/${c}`, 集計中: running, 実際の個数: truth },
      view: { cells, terms: [...terms], running, truth },
      done: opts.finished,
    })
  }

  snap(3, `1 から ${n} までのうち、${a} か ${b} か ${c} の倍数がいくつあるかを数える。1つずつ確かめずに、式だけで出したい`)

  const add = (m: number, sign: 1 | -1, label: string, note: string) => {
    const cnt = Math.floor(n / m)
    running += sign * cnt
    terms.push(`${sign === 1 ? '+' : '−'} ${label} = ${cnt}`)
    snap([6, 7, 8], note, { mark: m, sign })
  }

  add(a, 1, `n // ${a}`, `${a} の倍数は ${Math.floor(n / a)} 個。まず素直に足す`)
  add(b, 1, `n // ${b}`, `${b} の倍数は ${Math.floor(n / b)} 個。ここで、${a} と ${b} の両方の倍数を二重に数えてしまっている`)
  add(c, 1, `n // ${c}`, `${c} の倍数は ${Math.floor(n / c)} 個。二重に数えた分がさらに増えた`)
  add(lcm(a, b), -1, `n // lcm(${a},${b})`, `${a} と ${b} の共通の倍数（${lcm(a, b)} の倍数）は2回数えているので、1回ぶん引く`)
  add(lcm(b, c), -1, `n // lcm(${b},${c})`, `${b} と ${c} の共通の倍数（${lcm(b, c)} の倍数）も同じく引く`)
  add(lcm(a, c), -1, `n // lcm(${a},${c})`, `${a} と ${c} の共通の倍数（${lcm(a, c)} の倍数）も引く`)
  add(lcm(lcm(a, b), c), 1, `n // lcm(${a},${b},${c})`, `3つすべての倍数は、3回足して3回引いたので 0 回ぶんになってしまった。1回ぶん足し戻す`)

  snap(8, `合計 ${running}。実際に1つずつ数えた結果 ${truth} と${running === truth ? '一致している' : '一致していない'}`, {
    finished: true,
  })
  return frames
}

const PRESETS: { name: string; value: Input }[] = [
  { name: 'n=30, 2/3/5', value: { n: 30, a: 2, b: 3, c: 5 } },
  { name: 'n=24, 2/4/6', value: { n: 24, a: 2, b: 4, c: 6 } },
  { name: 'n=20, 3/5/7', value: { n: 20, a: 3, b: 5, c: 7 } },
]

export default function InclusionExclusion() {
  const [input, setInput] = useState<Input>(PRESETS[0]!.value)
  const frames = useMemo(() => trace(input), [input])

  return (
    <SimShell
      title="包除原理（足しすぎた分を引き、引きすぎた分を足す）"
      subtitle="「どれか1つでも満たす」個数を、重なりを補正しながら式だけで数える"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="入力" presets={PRESETS} onPick={setInput} />}
      legend={
        <>
          <LegendItem state="good">この項で足した数</LegendItem>
          <LegendItem state="bad">この項で引いた数</LegendItem>
          <LegendItem state="window">どれかの倍数</LegendItem>
          <LegendItem state="idle">どれの倍数でもない</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <ArrayView cells={f.view.cells} showIndex={false} size={32} />
          <ul className="m-0 list-none space-y-0.5 p-0 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
            {f.view.terms.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
          <p className="m-0 font-mono text-xs">
            <span style={{ color: 'var(--fg-muted)' }}>集計 = </span>
            <span style={{ color: 'var(--accent)' }}>{f.view.running}</span>
            <span style={{ color: 'var(--fg-muted)' }}>　実際 = </span>
            <span style={{ color: 'var(--ok)' }}>{f.view.truth}</span>
          </p>
        </div>
      )}
    </SimShell>
  )
}
