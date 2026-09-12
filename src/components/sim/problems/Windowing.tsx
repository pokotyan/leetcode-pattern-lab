import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { IntervalView, type Bar } from '../views/IntervalView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `def tumbling(events, size):
    out = {}
    for t, v in events:
        w = (t // size) * size            # 属する区間は1つだけ
        out[w] = out.get(w, 0) + v
    return out

def sliding(events, size, step):
    out = {}
    for t, v in events:
        start = (t // step) * step
        while start > t - size:           # 1つのイベントが複数の窓に入る
            out[start] = out.get(start, 0) + v
            start -= step
    return out`

const T = 12

type Input = { events: [number, number][]; size: number; step: number }
type View = { cells: Cell[]; bars: Bar[]; tumbling: string; sliding: string; mode: string }

function trace({ events, size, step }: Input): Frame<View>[] {
  const frames: Frame<View>[] = []
  const tum = new Map<number, number>()
  const sli = new Map<number, number>()

  const fmt = (m: Map<number, number>) =>
    [...m.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([w, v]) => `[${w},${w + size}) = ${v}`)
      .join('  ')

  const snap = (
    line: number | number[],
    note: string,
    opts: { cur?: number; windows?: number[]; mode: string; finished?: boolean },
  ) => {
    const cells: Cell[] = Array.from({ length: T }, (_, t) => {
      const e = events.find((x) => x[0] === t)
      return {
        value: e ? e[1] : '',
        state: t === opts.cur ? 'active' : e ? 'window' : 'idle',
        note: String(t),
      }
    })
    const bars: Bar[] = (opts.windows ?? []).map((w, i) => ({
      start: w,
      end: w + size,
      row: i,
      label: `[${w},${w + size})`,
      state: 'good',
    }))
    frames.push({
      line,
      note,
      vars: { 窓幅: size, ずらし幅: opts.mode === 'tumbling' ? size : step },
      view: { cells, bars, tumbling: fmt(tum), sliding: fmt(sli), mode: opts.mode },
      done: opts.finished,
    })
  }

  snap(1, `イベントが時刻つきで流れてくる。これを時間で区切って集計したい。区切り方に2通りある`, {
    mode: 'tumbling',
  })

  for (const [t, v] of events) {
    const w = Math.floor(t / size) * size
    tum.set(w, (tum.get(w) ?? 0) + v)
    snap([4, 5], `時刻 ${t} の ${v} は、区間 [${w}, ${w + size}) に入る。tumbling では区間が重ならないので、行き先は必ず1つ`, {
      cur: t,
      windows: [w],
      mode: 'tumbling',
    })
  }
  snap(6, `tumbling の結果: ${fmt(tum)}。すべてのイベントがちょうど1回ずつ数えられている`, {
    mode: 'tumbling',
  })

  for (const [t, v] of events) {
    const ws: number[] = []
    let start = Math.floor(t / step) * step
    while (start > t - size) {
      if (start >= 0) {
        sli.set(start, (sli.get(start) ?? 0) + v)
        ws.push(start)
      }
      start -= step
    }
    snap([10, 11, 12, 13], `時刻 ${t} の ${v} は、${ws.length} 個の窓 ${ws.map((w) => `[${w},${w + size})`).join(' ')} に入る。sliding では窓が重なるので、同じイベントが何度も数えられる`, {
      cur: t,
      windows: ws,
      mode: 'sliding',
    })
  }
  snap(14, `sliding の結果: ${fmt(sli)}。合計はイベントの総和より大きくなる。これは誤りではなく、そういう指標`, {
    mode: 'sliding',
    finished: true,
  })
  return frames
}

const PRESETS: { name: string; value: Input }[] = [
  { name: '窓4・ずらし2', value: { events: [[1, 3], [2, 1], [5, 4], [6, 2], [9, 5]], size: 4, step: 2 } },
  { name: '窓3・ずらし1', value: { events: [[0, 1], [1, 2], [3, 3], [4, 1]], size: 3, step: 1 } },
  { name: '窓2・ずらし2', value: { events: [[0, 5], [1, 5], [2, 5], [3, 5]], size: 2, step: 2 } },
]

export default function Windowing() {
  const [input, setInput] = useState<Input>(PRESETS[0]!.value)
  const frames = useMemo(() => trace(input), [input])

  return (
    <SimShell
      title="ストリームを時間で区切る（tumbling と sliding）"
      subtitle="重ならない窓なら各イベントは1回だけ数えられ、重なる窓なら複数回数えられる"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="設定" presets={PRESETS} onPick={setInput} />}
      legend={
        <>
          <LegendItem state="active">いま処理しているイベント</LegendItem>
          <LegendItem state="window">イベントがある時刻</LegendItem>
          <LegendItem state="good">このイベントが入る窓</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <p className="m-0 font-mono text-[11px]" style={{ color: 'var(--accent)' }}>
            {f.view.mode}
          </p>
          <ArrayView cells={f.view.cells} showIndex={false} size={32} />
          {f.view.bars.length > 0 && (
            <IntervalView bars={f.view.bars} min={0} max={T} width={400} rowHeight={26} />
          )}
          <div className="space-y-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            <p className="m-0">tumbling: {f.view.tumbling || '（まだ無い）'}</p>
            <p className="m-0">sliding: {f.view.sliding || '（まだ無い）'}</p>
          </div>
        </div>
      )}
    </SimShell>
  )
}
