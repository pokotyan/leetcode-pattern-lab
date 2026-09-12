import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `import random

def pick(stream):
    chosen = None
    for i, x in enumerate(stream, start=1):
        if random.randrange(i) == 0:     # 確率 1/i で今の要素に置き換える
            chosen = x
    return chosen`

type View = { cells: Cell[]; pointers: Pointer[]; seen: number; formula: string }

function trace(n: number): Frame<View>[] {
  const frames: Frame<View>[] = []

  const snap = (
    line: number | number[],
    note: string,
    opts: { i?: number; seen: number; formula: string; finished?: boolean },
  ) => {
    const cells: Cell[] = Array.from({ length: n }, (_, k) => {
      const idx = k + 1
      if (idx > opts.seen) return { value: `x${idx}`, state: 'idle' as Cell['state'], note: '未到着' }
      return {
        value: `x${idx}`,
        state: idx === opts.i ? 'active' : 'good',
        note: `1/${opts.seen}`,
      }
    })
    frames.push({
      line,
      note,
      vars: { 見た個数: opts.seen, 各要素の確率: `1/${opts.seen}` },
      view: {
        cells,
        pointers: opts.i !== undefined ? [{ name: 'いま', index: opts.i - 1, tone: 'accent' }] : [],
        seen: opts.seen,
        formula: opts.formula,
      },
      done: opts.finished,
    })
  }

  snap(4, `流れてくる要素は全部で ${n} 個あるが、アルゴリズムはその数を知らない。選んだものを1つだけ覚えておく`, {
    seen: 0,
    formula: '',
  })

  for (let i = 1; i <= n; i++) {
    snap([5, 6], `${i} 番目の x${i} が来た。確率 1/${i} で「いま持っているもの」を x${i} に置き換える`, {
      i,
      seen: i,
      formula:
        i === 1
          ? 'x1 が残る確率 = 1'
          : `x1 が残る確率 = ${Array.from({ length: i - 1 }, (_, k) => `${k + 1}/${k + 2}`).join(' × ')} = 1/${i}`,
    })
  }
  snap(8, `${n} 個すべてを見終えた。どの要素も残っている確率はちょうど 1/${n}。掛け算の途中が次々に打ち消し合うので、この形になる`, {
    seen: n,
    formula: `1/2 × 2/3 × 3/4 × … × ${n - 1}/${n} = 1/${n}`,
    finished: true,
  })
  return frames
}

const PRESETS = [
  { name: 'n = 5', value: 5 },
  { name: 'n = 4', value: 4 },
  { name: 'n = 7', value: 7 },
]

export default function ReservoirSampling() {
  const [n, setN] = useState(5)
  const nn = Math.min(Math.max(Math.trunc(n), 2), 8)
  const frames = useMemo(() => trace(nn), [nn])

  return (
    <SimShell
      title="リザーバーサンプリング（長さを知らずに等確率で1つ選ぶ）"
      subtitle="i 番目を確率 1/i で採用する。最後にはどの要素も確率 1/n で残る"
      code={CODE}
      frames={frames}
      controls={
        <>
          <NumberControl label="n =" value={n} onChange={setN} min={2} max={8} />
          <PresetControl presets={PRESETS} onPick={setN} />
        </>
      }
      legend={
        <>
          <LegendItem state="active">いま来た要素</LegendItem>
          <LegendItem state="good">到着済み（下が、いま選ばれている確率）</LegendItem>
          <LegendItem state="idle">まだ来ていない</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <ArrayView cells={f.view.cells} pointers={f.view.pointers} showIndex={false} size={54} />
          {f.view.formula && (
            <p className="m-0 break-all font-mono text-xs" style={{ color: 'var(--ok)' }}>
              {f.view.formula}
            </p>
          )}
        </div>
      )}
    </SimShell>
  )
}
