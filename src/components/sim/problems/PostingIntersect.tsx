import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def intersect(a, b):
    res = []
    i = j = 0
    while i < len(a) and j < len(b):
        if a[i] == b[j]:
            res.append(a[i])        # 両方に出てくる文書
            i += 1
            j += 1
        elif a[i] < b[j]:
            i += 1                  # 小さいほうだけ進める
        else:
            j += 1
    return res`

type Input = { a: number[]; b: number[]; wa: string; wb: string }
type View = { a: Cell[]; b: Cell[]; pa: Pointer[]; pb: Pointer[]; res: number[] }

function trace({ a, b }: Input): Frame<View>[] {
  const frames: Frame<View>[] = []
  const res: number[] = []
  let i = 0
  let j = 0

  const snap = (
    line: number | number[],
    note: string,
    opts: { hit?: boolean; finished?: boolean } = {},
  ) => {
    const mk = (arr: number[], idx: number): Cell[] =>
      arr.map((v, k) => ({
        value: v,
        state: k === idx ? (opts.hit ? 'good' : 'active') : k < idx ? 'dim' : 'idle',
      }))
    frames.push({
      line,
      note,
      vars: { i, j, 見つけた数: res.length },
      view: {
        a: mk(a, i),
        b: mk(b, j),
        pa: i < a.length ? [{ name: 'i', index: i, tone: 'accent' }] : [],
        pb: j < b.length ? [{ name: 'j', index: j, tone: 'warn' }] : [],
        res: [...res],
      },
      done: opts.finished,
    })
  }

  snap([2, 3], `2つの posting list はどちらも文書 ID の昇順。だから先頭から突き合わせるだけで共通部分が取れる`)

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      res.push(a[i]!)
      snap([5, 6, 7, 8], `どちらも文書 ${a[i]}。両方の語を含むので採用し、2つとも進める`, { hit: true })
      i += 1
      j += 1
    } else if (a[i]! < b[j]!) {
      snap([9, 10], `${a[i]} < ${b[j]}。文書 ${a[i]} は右側に出てこないので、左だけ進める`)
      i += 1
    } else {
      snap([11, 12], `${a[i]} > ${b[j]}。文書 ${b[j]} は左側に出てこないので、右だけ進める`)
      j += 1
    }
  }
  snap(13, `どちらかが尽きたので終了。両方を含む文書は [${res.join(', ')}]。走査はそれぞれ1回ずつで O(len(a) + len(b))`, {
    finished: true,
  })
  return frames
}

const PRESETS: { name: string; value: Input }[] = [
  { name: '"検索" と "エンジン"', value: { a: [1, 4, 7, 9, 12], b: [2, 4, 9, 14], wa: '検索', wb: 'エンジン' } },
  { name: '共通なし', value: { a: [1, 3, 5], b: [2, 4, 6], wa: 'A', wb: 'B' } },
  { name: '片方が短い', value: { a: [1, 2, 3, 4, 5, 6], b: [3, 6], wa: 'A', wb: 'B' } },
]

export default function PostingIntersect() {
  const [input, setInput] = useState<Input>(PRESETS[0]!.value)
  const frames = useMemo(() => trace(input), [input])

  return (
    <SimShell
      title="posting list の突き合わせ（AND 検索）"
      subtitle="文書 ID 順に並べてあるので、Two Pointers で交差が取れる。全組み合わせを見る必要がない"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="入力" presets={PRESETS} onPick={setInput} />}
      legend={
        <>
          <LegendItem state="active">いま見ている文書 ID</LegendItem>
          <LegendItem state="good">両方に出てきた</LegendItem>
          <LegendItem state="dim">通過済み</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-4">
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              語A の posting list（この語を含む文書 ID）
            </p>
            <ArrayView cells={f.view.a} pointers={f.view.pa} showIndex={false} size={42} />
          </div>
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              語B の posting list
            </p>
            <ArrayView cells={f.view.b} pointers={f.view.pb} showIndex={false} size={42} />
          </div>
          <p className="m-0 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
            両方を含む文書 = [<span style={{ color: 'var(--ok)' }}>{f.view.res.join(', ')}</span>]
          </p>
        </div>
      )}
    </SimShell>
  )
}
