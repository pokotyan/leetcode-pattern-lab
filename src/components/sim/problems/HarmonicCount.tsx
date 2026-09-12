import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `count = 0
for p in range(1, n + 1):
    for q in range(p, n + 1, p):   # p の倍数だけを見る
        count += 1                 # 内側は n // p 回まわる
# 合計 = n//1 + n//2 + ... + n//n ≈ n ln n`

type View = { cells: Cell[]; pointers: Pointer[]; count: number; naive: number; estimate: number }

function trace(n: number): Frame<View>[] {
  const frames: Frame<View>[] = []
  let count = 0

  const snap = (
    line: number | number[],
    note: string,
    opts: { p?: number; finished?: boolean } = {},
  ) => {
    const cells: Cell[] = Array.from({ length: n }, (_, i) => {
      const p = i + 1
      const times = Math.floor(n / p)
      let state: Cell['state'] = 'idle'
      if (opts.p !== undefined && p < opts.p) state = 'window'
      if (p === opts.p) state = 'active'
      if (opts.finished) state = 'window'
      return { value: times, state, note: `p=${p}` }
    })
    frames.push({
      line,
      note,
      vars: {
        n,
        まわった回数: count,
        '素直な二重ループ': n * n,
        'n ln n の目安': Math.round(n * Math.log(n)),
      },
      view: {
        cells,
        pointers: opts.p !== undefined ? [{ name: 'p', index: opts.p - 1, tone: 'accent' }] : [],
        count,
        naive: n * n,
        estimate: Math.round(n * Math.log(n)),
      },
      done: opts.finished,
    })
  }

  snap(2, `p を 1 から ${n} まで動かし、それぞれ「p の倍数」だけを見る。セルの数字は、その p で内側が何回まわるか（= n // p）`)

  for (let p = 1; p <= n; p++) {
    const times = Math.floor(n / p)
    count += times
    snap([3, 4], `p = ${p} のとき、${n} 以下の倍数は ${times} 個。累計 ${count} 回。p が大きくなるほど内側は急に短くなる`, {
      p,
    })
  }
  snap(5, `合計 ${count} 回。素直な二重ループなら ${n * n} 回なので、およそ ${((n * n) / count).toFixed(1)} 分の1で済んでいる。この合計は n ln n（約 ${Math.round(n * Math.log(n))}）に近づく`, {
    finished: true,
  })
  return frames
}

const PRESETS = [
  { name: 'n = 12', value: 12 },
  { name: 'n = 20', value: 20 },
  { name: 'n = 30', value: 30 },
]

export default function HarmonicCount() {
  const [n, setN] = useState(12)
  const nn = Math.min(Math.max(Math.trunc(n), 2), 30)
  const frames = useMemo(() => trace(nn), [nn])

  return (
    <SimShell
      title="「倍数だけを見る」二重ループが N log N になる理由"
      subtitle="内側の回数は n//1, n//2, n//3 … と減っていく。その合計は n ln n に収まる"
      code={CODE}
      frames={frames}
      controls={
        <>
          <NumberControl label="n =" value={n} onChange={setN} min={2} max={30} />
          <PresetControl presets={PRESETS} onPick={setN} />
        </>
      }
      legend={
        <>
          <LegendItem state="active">いまの p</LegendItem>
          <LegendItem state="window">数え終わった p</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              各 p で内側がまわる回数（n // p）
            </p>
            <ArrayView cells={f.view.cells} pointers={f.view.pointers} showIndex={false} size={38} />
          </div>
          <div className="flex flex-wrap gap-4 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
            <span>
              合計 <span style={{ color: 'var(--ok)' }}>{f.view.count}</span>
            </span>
            <span>
              素直な二重ループ <span style={{ color: 'var(--danger)' }}>{f.view.naive}</span>
            </span>
            <span>
              n ln n の目安 <span style={{ color: 'var(--accent)' }}>{f.view.estimate}</span>
            </span>
          </div>
        </div>
      )}
    </SimShell>
  )
}
