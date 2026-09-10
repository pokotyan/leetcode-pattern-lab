import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl, TextControl, parseNums } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { StackView } from '../views/StackView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def daily_temperatures(temps):
    n = len(temps)
    ans = [0] * n
    stack = []                 # index を積む。下から上へ気温が減る順に保つ
    for i, t in enumerate(temps):
        while stack and temps[stack[-1]] < t:
            j = stack.pop()     # 今日より寒かった日が見つかった
            ans[j] = i - j      # その日から今日までの日数
        stack.append(i)
    return ans`

type View = { cells: Cell[]; pointers: Pointer[]; stack: Cell[]; ans: Cell[] }

function trace(temps: number[]): Frame<View>[] {
  const n = temps.length
  const ans = Array<number>(n).fill(-1)
  const stack: number[] = []
  const frames: Frame<View>[] = []

  const snap = (
    i: number,
    line: number | number[],
    note: string,
    opts: { resolved?: number; finished?: boolean } = {},
  ) => {
    const cells: Cell[] = temps.map((v, k) => ({
      value: v,
      state: k === i ? 'active' : stack.includes(k) ? 'window' : k < i ? 'dim' : 'idle',
    }))
    const ansCells: Cell[] = ans.map((v) => ({
      value: v === -1 ? '?' : v,
      state: v === -1 ? 'idle' : 'good',
    }))
    frames.push({
      line,
      note,
      vars: { i, t: temps[i] ?? '−', stack: `[${stack.join(',')}]` },
      view: {
        cells,
        pointers: i >= 0 ? [{ name: 'i', index: i, tone: 'accent' }] : [],
        stack: stack.map((idx) => ({ value: `${idx}:${temps[idx]}` })),
        ans: ansCells,
      },
      done: opts.finished,
    })
  }

  snap(-1, 4, 'stack は「まだ答えが決まっていない日」の index を、気温が下から上へ減る順で持つ')
  for (let i = 0; i < n; i++) {
    const t = temps[i]!
    snap(i, 5, `i=${i} 日目、気温 ${t} を見る`)
    while (stack.length > 0 && temps[stack[stack.length - 1]!]! < t) {
      const j = stack.pop()!
      ans[j] = i - j
      snap(i, [6, 7, 8], `スタックの一番上は ${j} 日目（気温${temps[j]}）で、今日(${t})より寒かった。ans[${j}] = ${i} - ${j} = ${i - j} 日と確定`, {
        resolved: j,
      })
    }
    stack.push(i)
    snap(i, 9, `${i} 日目は、まだ答えが決まらないのでスタックに積んでおく`)
  }
  snap(n - 1, 10, `スタックに残った日は、この先ずっと気温が上がらない。ans は 0 のまま`, { finished: true })
  return frames
}

const PRESETS = [
  { name: '[73,74,75,71,69,72,76,73]', value: '73, 74, 75, 71, 69, 72, 76, 73' },
  { name: '単調増加', value: '30, 40, 50, 60' },
  { name: '単調減少', value: '60, 50, 40, 30' },
]

export default function DailyTemperatures() {
  const [raw, setRaw] = useState('73, 74, 75, 71, 69, 72, 76, 73')
  const nums = useMemo(() => parseNums(raw, [73, 74, 75, 71, 69, 72, 76, 73]).slice(0, 10), [raw])
  const frames = useMemo(() => trace(nums), [nums])

  return (
    <SimShell
      title="Daily Temperatures（単調スタック）"
      subtitle="スタックに積んだままの日は、答えが決まるまで待っている「寒い順の待ち行列」"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="temperatures =" value={raw} onChange={setRaw} width={220} />
          <PresetControl presets={PRESETS} onPick={setRaw} />
        </>
      }
      legend={
        <>
          <LegendItem state="active">今見ている日</LegendItem>
          <LegendItem state="window">スタックに積まれている日</LegendItem>
          <LegendItem state="good">答えが確定した日</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-8">
            <ArrayView cells={f.view.cells} pointers={f.view.pointers} size={38} />
            <StackView items={f.view.stack} width={72} label="待機中" />
          </div>
          <div>
            <p className="mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              ans（何日後に暖かくなるか）
            </p>
            <ArrayView cells={f.view.ans} size={38} />
          </div>
        </div>
      )}
    </SimShell>
  )
}
