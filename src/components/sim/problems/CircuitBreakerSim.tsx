import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `class CircuitBreaker:
    def __init__(self, threshold, cooldown):
        self.state = 'closed'
        self.failures = 0
        self.threshold = threshold
        self.opened_at = None
        self.cooldown = cooldown

    def call(self, now, fn):
        if self.state == 'open':
            if now - self.opened_at < self.cooldown:
                raise Rejected           # 呼ばずに、その場で失敗させる
            self.state = 'half-open'     # 1本だけ試してみる
        ok = fn()
        if ok:
            self.state = 'closed'        # 復活したので通常運転へ
            self.failures = 0
        else:
            self.failures += 1
            if self.state == 'half-open' or self.failures >= self.threshold:
                self.state = 'open'
                self.opened_at = now
        return ok`

type St = 'closed' | 'open' | 'half-open'
type Outcome = 'ok' | 'fail' | 'rejected'
type Input = { results: boolean[]; threshold: number; cooldown: number; label: string }
type View = { cells: Cell[]; state: St; failures: number; rejected: number; calls: number }

function trace({ results, threshold, cooldown }: Input): Frame<View>[] {
  const frames: Frame<View>[] = []
  let state: St = 'closed'
  let failures = 0
  let openedAt = -1
  const outcomes: Outcome[] = []
  let rejected = 0
  let calls = 0

  const snap = (line: number | number[], note: string, opts: { cur?: number; finished?: boolean } = {}) => {
    const cells: Cell[] = results.map((_, i) => {
      const o = outcomes[i]
      let s: Cell['state'] = 'idle'
      if (o === 'ok') s = 'good'
      else if (o === 'fail') s = 'bad'
      else if (o === 'rejected') s = 'dim'
      if (i === opts.cur) s = o === undefined ? 'active' : s
      return { value: o === 'ok' ? '○' : o === 'fail' ? '×' : o === 'rejected' ? '–' : '?', state: s, note: String(i) }
    })
    frames.push({
      line,
      note,
      vars: { 状態: state, 連続失敗: failures, 実際に呼んだ数: calls, 即座に断った数: rejected },
      view: { cells, state, failures, rejected, calls },
      done: opts.finished,
    })
  }

  snap(3, `しきい値 ${threshold} 回の連続失敗で回路を開き、${cooldown} 時間だけ呼び出しを止める設定。○が成功、×が失敗、−が呼ばずに断った回`)

  for (let now = 0; now < results.length; now++) {
    if (state === 'open') {
      if (now - openedAt < cooldown) {
        outcomes.push('rejected')
        rejected += 1
        snap([10, 11, 12], `時刻 ${now}: 回路は開いている。相手を呼ばずに、その場で失敗を返す。相手に負荷をかけず、こちらのスレッドも待たされない`, {
          cur: now,
        })
        continue
      }
      state = 'half-open'
      snap(13, `時刻 ${now}: 冷却時間が過ぎた。half-open にして、1本だけ試しに通してみる`, { cur: now })
    }
    const ok = results[now]!
    calls += 1
    if (ok) {
      const was = state
      state = 'closed'
      failures = 0
      outcomes.push('ok')
      snap([15, 16, 17], was === 'half-open'
        ? `時刻 ${now}: 試した1本が成功した。相手は復活したと判断して closed に戻す`
        : `時刻 ${now}: 成功。連続失敗の数を 0 に戻す`, { cur: now })
    } else {
      failures += 1
      outcomes.push('fail')
      if (state === 'half-open') {
        state = 'open'
        openedAt = now
        snap([19, 20, 21, 22], `時刻 ${now}: 試した1本も失敗。まだ直っていないので、もう一度回路を開いて冷却し直す`, {
          cur: now,
        })
      } else if (failures >= threshold) {
        state = 'open'
        openedAt = now
        snap([19, 20, 21, 22], `時刻 ${now}: 失敗。連続 ${failures} 回でしきい値に達したので、回路を開く。ここから ${cooldown} 時間は相手を呼ばない`, {
          cur: now,
        })
      } else {
        snap([19, 20], `時刻 ${now}: 失敗。連続 ${failures} 回目。しきい値 ${threshold} にはまだ届かないので、通常運転を続ける`, {
          cur: now,
        })
      }
    }
  }
  snap(23, `完了。実際に相手を呼んだのは ${calls} 回、呼ばずに断ったのが ${rejected} 回。障害中の無駄な呼び出しを減らせている`, {
    finished: true,
  })
  return frames
}

const PRESETS: { name: string; value: Input }[] = [
  {
    name: '障害が続く',
    value: { results: [true, false, false, false, false, false, false, false, false, false], threshold: 3, cooldown: 3, label: '' },
  },
  {
    name: '途中で復活',
    value: { results: [true, false, false, false, false, false, true, true, true, true], threshold: 3, cooldown: 3, label: '' },
  },
  {
    name: 'たまに失敗するだけ',
    value: { results: [true, false, true, true, false, true, true, false, true, true], threshold: 3, cooldown: 3, label: '' },
  },
]

export default function CircuitBreakerSim() {
  const [input, setInput] = useState<Input>(PRESETS[0]!.value)
  const frames = useMemo(() => trace(input), [input])

  return (
    <SimShell
      title="Circuit Breaker（壊れている相手を呼ばない）"
      subtitle="連続で失敗したら回路を開き、しばらく呼ばない。時間が経ったら1本だけ試す"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="相手の応答" presets={PRESETS} onPick={setInput} />}
      legend={
        <>
          <LegendItem state="good">成功（○）</LegendItem>
          <LegendItem state="bad">失敗（×）</LegendItem>
          <LegendItem state="dim">呼ばずに断った（−）</LegendItem>
          <LegendItem state="active">これから呼ぶ</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <p className="m-0 font-mono text-xs">
            <span style={{ color: 'var(--fg-muted)' }}>状態 = </span>
            <span
              style={{
                color:
                  f.view.state === 'closed'
                    ? 'var(--ok)'
                    : f.view.state === 'open'
                      ? 'var(--danger)'
                      : 'var(--warn)',
              }}
            >
              {f.view.state}
            </span>
          </p>
          <ArrayView cells={f.view.cells} showIndex={false} size={34} />
        </div>
      )}
    </SimShell>
  )
}
