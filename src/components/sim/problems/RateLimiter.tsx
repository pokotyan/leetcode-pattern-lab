import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `from collections import deque

def allow(timestamps, now, limit, window):
    while timestamps and timestamps[0] <= now - window:
        timestamps.popleft()          # 窓から出た記録を捨てる
    if len(timestamps) < limit:
        timestamps.append(now)
        return True                   # 窓の中がまだ limit 未満
    return False                      # 超えているので断る`

const T = 16

type Input = { arrivals: number[]; limit: number; window: number }
type View = { slots: Cell[]; pointers: Pointer[]; kept: number[]; verdict: string; allowed: number; denied: number }

function trace({ arrivals, limit, window }: Input): Frame<View>[] {
  const frames: Frame<View>[] = []
  const kept: number[] = []
  const accepted = new Set<number>()
  const rejected = new Set<number>()

  const snap = (
    line: number | number[],
    note: string,
    opts: { now?: number; verdict?: string; dropping?: number; finished?: boolean } = {},
  ) => {
    const now = opts.now ?? -1
    const lo = now - window + 1
    const slots: Cell[] = Array.from({ length: T }, (_, t) => {
      const isArrival = arrivals.includes(t)
      let state: Cell['state'] = 'idle'
      if (now >= 0 && t >= lo && t <= now) state = 'window'
      if (accepted.has(t)) state = 'good'
      if (rejected.has(t)) state = 'bad'
      if (t === opts.dropping) state = 'dim'
      return { value: isArrival ? '●' : '', state, note: String(t) }
    })
    const pointers: Pointer[] = []
    if (now >= 0) {
      pointers.push({ name: 'now', index: now, tone: 'accent' })
      if (lo >= 0) pointers.push({ name: '窓の左端', index: lo, side: 'bottom', tone: 'warn' })
    }
    frames.push({
      line,
      note,
      vars: {
        limit,
        window,
        窓の中: kept.length,
        許可: accepted.size,
        拒否: rejected.size,
      },
      view: {
        slots,
        pointers,
        kept: [...kept],
        verdict: opts.verdict ?? '',
        allowed: accepted.size,
        denied: rejected.size,
      },
      done: opts.finished,
    })
  }

  snap(3, `直近 ${window} 単位時間に ${limit} 件まで、という制限。記録しておくのは「許可した時刻」だけ`)

  for (const now of arrivals) {
    snap(3, `時刻 ${now} にリクエストが来た。まず、窓から出た古い記録を捨てる`, { now })
    while (kept.length > 0 && kept[0]! <= now - window) {
      const out = kept.shift()!
      snap([4, 5], `記録 ${out} は窓の左端（${now - window + 1}）より前なので捨てる`, { now, dropping: out })
    }
    if (kept.length < limit) {
      kept.push(now)
      accepted.add(now)
      snap([6, 7, 8], `窓の中の記録は ${kept.length - 1} 件で、上限 ${limit} 未満。許可して、時刻 ${now} を記録する`, {
        now,
        verdict: '許可',
      })
    } else {
      rejected.add(now)
      snap(9, `窓の中にすでに ${kept.length} 件あり、上限 ${limit} に達している。このリクエストは断る`, {
        now,
        verdict: '拒否',
      })
    }
  }
  snap(9, `完了。${arrivals.length} 件のうち ${accepted.size} 件を許可、${rejected.size} 件を拒否した`, {
    finished: true,
  })
  return frames
}

const PRESETS: { name: string; value: Input }[] = [
  { name: '一気に来る', value: { arrivals: [1, 2, 3, 4, 5, 9, 10, 11], limit: 3, window: 5 } },
  { name: 'ゆっくり来る', value: { arrivals: [0, 3, 6, 9, 12, 15], limit: 3, window: 5 } },
  { name: '境界をまたぐ', value: { arrivals: [4, 5, 6, 7, 8, 9], limit: 2, window: 4 } },
]

export default function RateLimiter() {
  const [input, setInput] = useState<Input>(PRESETS[0]!.value)
  const [limit, setLimit] = useState(3)
  const eff = useMemo<Input>(() => ({ ...input, limit }), [input, limit])
  const frames = useMemo(() => trace(eff), [eff])

  return (
    <SimShell
      title="レート制限（動く窓で数える）"
      subtitle="直近の一定時間に何件通したかを数える。窓から出た記録を捨てる形は Sliding Window そのもの"
      code={CODE}
      frames={frames}
      controls={
        <>
          <NumberControl label="limit =" value={limit} onChange={setLimit} min={1} max={6} />
          <PresetControl
            label="到着"
            presets={PRESETS}
            onPick={(v) => {
              setInput(v)
              setLimit(v.limit)
            }}
          />
        </>
      }
      legend={
        <>
          <LegendItem state="window">いまの窓</LegendItem>
          <LegendItem state="good">許可した</LegendItem>
          <LegendItem state="bad">断った</LegendItem>
          <LegendItem state="dim">窓から出て捨てた記録</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <ArrayView cells={f.view.slots} pointers={f.view.pointers} showIndex={false} size={30} />
          <p className="m-0 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
            窓の中の記録 = [<span style={{ color: 'var(--accent)' }}>{f.view.kept.join(', ')}</span>]
            {f.view.verdict && (
              <span style={{ color: f.view.verdict === '許可' ? 'var(--ok)' : 'var(--danger)' }}>
                {'　'}
                {f.view.verdict}
              </span>
            )}
          </p>
        </div>
      )}
    </SimShell>
  )
}
