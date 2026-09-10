import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl, TextControl, parseNums } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `def longest_consecutive(nums):
    num_set = set(nums)
    best = 0
    for x in num_set:
        if x - 1 in num_set:
            continue          # x は列の途中。起点は他にある
        # x が列の先頭のときだけ、ここから伸ばす
        length = 1
        while x + length in num_set:
            length += 1
        best = max(best, length)
    return best`

type View = { cells: Cell[] }

function trace(input: number[]): Frame<View>[] {
  const uniq = [...new Set(input)]
  const set = new Set(uniq)
  const frames: Frame<View>[] = []
  let best = 0

  const snap = (
    line: number | number[],
    note: string,
    opts: { focus?: number; running?: number[]; skip?: number; finished?: boolean } = {},
  ) => {
    const cells: Cell[] = uniq
      .slice()
      .sort((a, b) => a - b)
      .map((v) => {
        let state: Cell['state'] = 'idle'
        if (opts.running?.includes(v)) state = 'window'
        if (v === opts.focus) state = 'active'
        if (v === opts.skip) state = 'bad'
        return { value: v, state }
      })
    frames.push({ line, note, vars: { best }, view: { cells }, done: opts.finished })
  }

  snap([2], `重複を消すために set にする。要素が「集合の中にあるかどうか」を O(1) で調べられるのがポイント`)

  for (const x of uniq) {
    if (set.has(x - 1)) {
      snap([4, 5], `x=${x} は x-1=${x - 1} も集合にある。つまり列の途中の値なので、ここを起点にはしない`, {
        skip: x,
      })
      continue
    }
    let length = 1
    const running = [x]
    snap([6, 7, 8], `x=${x} は x-1 が集合に無い。**列の先頭**なので、ここから伸ばしていく`, { focus: x, running })
    while (set.has(x + length)) {
      running.push(x + length)
      length += 1
      snap([9, 10], `x+${length - 1}=${x + length - 1} も集合にあるので伸ばす。現在の長さ ${length}`, {
        focus: x,
        running,
      })
    }
    const prev = best
    best = Math.max(best, length)
    snap(11, best > prev ? `列 [${running.join(',')}] の長さは ${length}。best を ${prev} → ${best} に更新` : `長さ ${length}。best は更新なし`, {
      focus: x,
      running,
    })
  }
  snap(12, `全ての起点を調べ終わった。最長の連続列は ${best}`, { finished: true })
  return frames
}

const PRESETS = [
  { name: '[100,4,200,1,3,2]', value: '100, 4, 200, 1, 3, 2' },
  { name: '重複あり', value: '0, 3, 7, 2, 5, 8, 4, 6, 0, 1' },
  { name: 'バラバラ', value: '9, 1, 4, 7, 3, -1, 0, 5, 8, -1, 6' },
]

export default function LongestConsecutiveSequence() {
  const [raw, setRaw] = useState('100, 4, 200, 1, 3, 2')
  const nums = useMemo(() => parseNums(raw, [100, 4, 200, 1, 3, 2]).slice(0, 14), [raw])
  const frames = useMemo(() => trace(nums), [nums])

  return (
    <SimShell
      title="Longest Consecutive Sequence（集合 + 起点判定）"
      subtitle="ソートせずに O(N)。「列の先頭からだけ伸ばす」という工夫が肝"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="nums =" value={raw} onChange={setRaw} width={220} />
          <PresetControl presets={PRESETS} onPick={setRaw} />
        </>
      }
      legend={
        <>
          <LegendItem state="active">起点として調べている値</LegendItem>
          <LegendItem state="window">現在伸ばしている列</LegendItem>
          <LegendItem state="bad">列の途中なので起点にしない</LegendItem>
        </>
      }
    >
      {(f) => <ArrayView cells={f.view.cells} size={38} />}
    </SimShell>
  )
}
