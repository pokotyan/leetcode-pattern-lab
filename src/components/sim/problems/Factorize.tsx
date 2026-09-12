import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `def factorize(n):
    factors = []
    d = 2
    while d * d <= n:
        while n % d == 0:        # 割れる限り割り続ける
            factors.append(d)
            n //= d
        d += 1
    if n > 1:
        factors.append(n)        # 残ったものは素数
    return factors`

type View = { factors: Cell[]; n: number; d: number; original: number; hit: boolean }

function trace(n0: number): Frame<View>[] {
  const frames: Frame<View>[] = []
  const factors: number[] = []
  let n = n0
  let d = 2

  const snap = (
    line: number | number[],
    note: string,
    opts: { hit?: boolean; finished?: boolean } = {},
  ) => {
    frames.push({
      line,
      note,
      vars: { 残り: n, d, 'd*d': d * d },
      view: {
        factors: factors.map((v): Cell => ({ value: v, state: 'good' })),
        n,
        d,
        original: n0,
        hit: opts.hit ?? false,
      },
      done: opts.finished,
    })
  }

  snap([2, 3], `${n0} を素因数に分解する。2 から順に「割り切れるか」を試す`)

  while (d * d <= n) {
    if (n % d === 0) {
      while (n % d === 0) {
        factors.push(d)
        n = n / d
        snap([5, 6, 7], `${d} で割り切れた。素因数に ${d} を1つ加え、残りは ${n} になる`, { hit: true })
      }
    } else {
      snap([4, 5], `${d} では割り切れない。次へ`)
    }
    d += 1
  }
  if (n > 1) {
    factors.push(n)
    snap([9, 10], `d × d が残り ${n} を超えた。ここまで割り切れなかったので、残った ${n} 自身が素数`, {
      hit: true,
    })
  }
  snap(11, `完了。${n0} = ${factors.join(' × ')}`, { finished: true })
  return frames
}

const PRESETS = [
  { name: '360', value: 360 },
  { name: '97（素数）', value: 97 },
  { name: '1024', value: 1024 },
  { name: '9991', value: 9991 },
]

export default function Factorize() {
  const [n, setN] = useState(360)
  const nn = Math.min(Math.max(Math.trunc(n), 2), 100000)
  const frames = useMemo(() => trace(nn), [nn])

  return (
    <SimShell
      title="試し割りによる素因数分解"
      subtitle="2 から順に割り切れる限り割る。d × d が残りを超えたら、残ったものは素数"
      code={CODE}
      frames={frames}
      controls={
        <>
          <NumberControl label="n =" value={n} onChange={setN} min={2} max={100000} />
          <PresetControl presets={PRESETS} onPick={setN} />
        </>
      }
      legend={<LegendItem state="good">取り出した素因数</LegendItem>}
    >
      {(f) => (
        <div className="space-y-3">
          <p className="m-0 font-mono text-sm">
            <span style={{ color: 'var(--fg-muted)' }}>残り n = </span>
            <span style={{ color: f.view.hit ? 'var(--ok)' : 'var(--accent)' }}>{f.view.n}</span>
            <span style={{ color: 'var(--fg-muted)' }}>　試している d = </span>
            <span style={{ color: 'var(--warn)' }}>{f.view.d}</span>
          </p>
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              factors（取り出した素因数）
            </p>
            {f.view.factors.length === 0 ? (
              <p className="m-0 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
                （まだ無い）
              </p>
            ) : (
              <ArrayView cells={f.view.factors} showIndex={false} size={44} />
            )}
          </div>
        </div>
      )}
    </SimShell>
  )
}
