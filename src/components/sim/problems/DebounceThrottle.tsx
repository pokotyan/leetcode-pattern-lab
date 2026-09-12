import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `def debounce(events, wait):
    fired = []
    for i, t in enumerate(events):
        nxt = events[i + 1] if i + 1 < len(events) else None
        if nxt is None or nxt - t >= wait:
            fired.append(t + wait)        # 静かになってから実行
    return fired

def throttle(events, interval):
    fired = []
    last = None
    for t in events:
        if last is None or t - last >= interval:
            fired.append(t)               # 前回から interval 空いていれば実行
            last = t
    return fired`

const T = 20

type Input = { events: number[]; wait: number }
type View = { cells: Cell[]; debounce: number[]; throttle: number[]; mode: string }

function trace({ events, wait }: Input): Frame<View>[] {
  const frames: Frame<View>[] = []
  const deb: number[] = []
  const thr: number[] = []

  const snap = (
    line: number | number[],
    note: string,
    opts: { cur?: number; mode: string; fireAt?: number; finished?: boolean },
  ) => {
    const cells: Cell[] = Array.from({ length: T }, (_, t) => {
      const isEvent = events.includes(t)
      let state: Cell['state'] = isEvent ? 'window' : 'idle'
      if (deb.includes(t) || thr.includes(t)) state = 'good'
      if (t === opts.cur) state = 'active'
      if (t === opts.fireAt) state = 'good'
      return { value: isEvent ? '●' : deb.includes(t) || thr.includes(t) ? '▲' : '', state, note: String(t) }
    })
    frames.push({
      line,
      note,
      vars: {
        待ち時間: wait,
        イベント数: events.length,
        debounce: deb.length,
        throttle: thr.length,
      },
      view: { cells, debounce: [...deb], throttle: [...thr], mode: opts.mode },
      done: opts.finished,
    })
  }

  snap(1, `${events.length} 件のイベントが立て続けに届く。そのまま全部処理すると重いので、間引きたい。間引き方に2通りある`, {
    mode: '入力',
  })

  events.forEach((t, i) => {
    const nxt = events[i + 1]
    if (nxt === undefined || nxt - t >= wait) {
      deb.push(t + wait)
      snap([4, 5, 6], `時刻 ${t} のあと ${wait} だけ静かだった（次は ${nxt ?? 'なし'}）。静止を確認したので、時刻 ${t + wait} に1回だけ実行する`, {
        cur: t,
        mode: 'debounce',
        fireAt: t + wait,
      })
    } else {
      snap([4, 5], `時刻 ${t} のイベント。${wait} 経たないうちに次（${nxt}）が来るので、実行を先送りする`, {
        cur: t,
        mode: 'debounce',
      })
    }
  })
  snap(7, `debounce の結果: ${deb.length} 回だけ実行。最後の入力から静かになったときにまとめて1回`, {
    mode: 'debounce',
  })

  let last: number | null = null
  for (const t of events) {
    if (last === null || t - last >= wait) {
      thr.push(t)
      last = t
      snap([13, 14, 15], `時刻 ${t}: 前回の実行から ${wait} 以上空いているので、すぐ実行する`, {
        cur: t,
        mode: 'throttle',
        fireAt: t,
      })
    } else {
      snap(13, `時刻 ${t}: 前回の実行（${last}）から ${t - last} しか経っていないので捨てる`, {
        cur: t,
        mode: 'throttle',
      })
    }
  }
  snap(16, `throttle の結果: ${thr.length} 回。一定間隔で実行されるので、途中経過も反映される`, {
    mode: 'throttle',
    finished: true,
  })
  return frames
}

const PRESETS: { name: string; value: Input }[] = [
  { name: '連打してから止まる', value: { events: [1, 2, 3, 4, 5, 12], wait: 3 } },
  { name: 'ずっと連打', value: { events: [0, 1, 2, 3, 4, 5, 6, 7, 8], wait: 3 } },
  { name: 'ぽつぽつ', value: { events: [0, 5, 10, 15], wait: 3 } },
]

export default function DebounceThrottle() {
  const [input, setInput] = useState<Input>(PRESETS[0]!.value)
  const [wait, setWait] = useState(3)
  const eff = useMemo<Input>(() => ({ ...input, wait }), [input, wait])
  const frames = useMemo(() => trace(eff), [eff])

  return (
    <SimShell
      title="debounce と throttle（同じ入力、違う間引き方）"
      subtitle="debounce は静かになるまで待って1回。throttle は一定間隔で実行する"
      code={CODE}
      frames={frames}
      controls={
        <>
          <NumberControl label="wait =" value={wait} onChange={setWait} min={1} max={6} />
          <PresetControl
            label="入力"
            presets={PRESETS}
            onPick={(v) => {
              setInput(v)
              setWait(v.wait)
            }}
          />
        </>
      }
      legend={
        <>
          <LegendItem state="window">イベントの到着（●）</LegendItem>
          <LegendItem state="active">いま見ているイベント</LegendItem>
          <LegendItem state="good">実際に実行される（▲）</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <p className="m-0 font-mono text-[11px]" style={{ color: 'var(--accent)' }}>
            {f.view.mode}
          </p>
          <ArrayView cells={f.view.cells} showIndex={false} size={28} />
          <div className="space-y-1 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
            <p className="m-0">
              debounce の実行時刻 = [
              <span style={{ color: 'var(--ok)' }}>{f.view.debounce.join(', ')}</span>]
            </p>
            <p className="m-0">
              throttle の実行時刻 = [
              <span style={{ color: 'var(--ok)' }}>{f.view.throttle.join(', ')}</span>]
            </p>
          </div>
        </div>
      )}
    </SimShell>
  )
}
