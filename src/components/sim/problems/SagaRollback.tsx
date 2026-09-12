import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `def run_saga(steps, ctx):
    done = []
    for step in steps:
        try:
            step.action(ctx)          # 進める
            done.append(step)
        except Exception:
            for s in reversed(done):  # 成功した分だけ、逆順に取り消す
                s.compensate(ctx)
            return 'failed'
    return 'committed'`

const STEPS = [
  { name: '注文作成', undo: '注文を取消' },
  { name: '在庫確保', undo: '在庫を戻す' },
  { name: '決済', undo: '返金' },
  { name: '配送手配', undo: '配送を取消' },
]

type State = 'pending' | 'done' | 'failed' | 'compensated'
type View = { cells: Cell[]; log: string[]; phase: string; result: string }

function trace(failAt: number): Frame<View>[] {
  const frames: Frame<View>[] = []
  const states: State[] = STEPS.map(() => 'pending')
  const log: string[] = []

  const snap = (
    line: number | number[],
    note: string,
    opts: { cur?: number; phase: string; result?: string; finished?: boolean },
  ) => {
    const cells: Cell[] = STEPS.map((s, i) => {
      const st = states[i]!
      const state: Cell['state'] =
        st === 'done' ? 'good' : st === 'failed' ? 'bad' : st === 'compensated' ? 'window' : 'idle'
      return {
        value: s.name,
        state: i === opts.cur && st === 'pending' ? 'active' : state,
        note: st === 'compensated' ? '取消済' : st === 'done' ? '成功' : st === 'failed' ? '失敗' : '',
      }
    })
    frames.push({
      line,
      note,
      vars: {
        段階: opts.phase,
        成功済み: states.filter((s) => s === 'done').length,
        取消済み: states.filter((s) => s === 'compensated').length,
      },
      view: { cells, log: [...log], phase: opts.phase, result: opts.result ?? '' },
      done: opts.finished,
    })
  }

  snap(2, `${STEPS.length} 段階の処理を、それぞれ別のサービスが担当する。全体を1つのトランザクションで囲むことはできない`, {
    phase: '開始',
  })

  const done: number[] = []
  for (let i = 0; i < STEPS.length; i++) {
    if (i === failAt) {
      states[i] = 'failed'
      log.push(`${STEPS[i]!.name} が失敗`)
      snap([4, 7], `${STEPS[i]!.name} が失敗した。ここまでの ${done.length} 段階は、すでにそれぞれのサービスで確定してしまっている`, {
        cur: i,
        phase: '失敗',
      })
      for (const j of [...done].reverse()) {
        states[j] = 'compensated'
        log.push(`${STEPS[j]!.undo}`)
        snap([8, 9], `${STEPS[j]!.name} を打ち消すために「${STEPS[j]!.undo}」を実行する。元に戻すのではなく、逆向きの操作を新しく行う`, {
          phase: '補償',
        })
      }
      snap(10, `すべて取り消した。ただし「注文が作られて取り消された」という履歴は残る。なかったことにはならない`, {
        phase: '完了',
        result: 'failed',
        finished: true,
      })
      return frames
    }
    states[i] = 'done'
    done.push(i)
    log.push(`${STEPS[i]!.name} が成功`)
    snap([5, 6], `${STEPS[i]!.name} が成功。この時点で、このサービスの変更は確定する（あとで取り消せるように、打ち消す手段を用意しておく）`, {
      cur: i,
      phase: '前進',
    })
  }
  snap(11, `すべて成功した`, { phase: '完了', result: 'committed', finished: true })
  return frames
}

const PRESETS = [
  { name: '決済で失敗', value: 2 },
  { name: '在庫確保で失敗', value: 1 },
  { name: '配送手配で失敗', value: 3 },
  { name: '全部成功', value: -1 },
]

export default function SagaRollback() {
  const [failAt, setFailAt] = useState(2)
  const frames = useMemo(() => trace(failAt), [failAt])

  return (
    <SimShell
      title="Saga（失敗したら、逆順に打ち消していく）"
      subtitle="全体を1つのトランザクションにできないとき、成功した分を逆順に補償する"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="どこで失敗するか" presets={PRESETS} onPick={setFailAt} />}
      legend={
        <>
          <LegendItem state="active">実行中</LegendItem>
          <LegendItem state="good">成功して確定した</LegendItem>
          <LegendItem state="bad">失敗した段階</LegendItem>
          <LegendItem state="window">補償で打ち消した</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <p className="m-0 font-mono text-[11px]" style={{ color: 'var(--accent)' }}>
            {f.view.phase}
            {f.view.result && (
              <span style={{ color: f.view.result === 'committed' ? 'var(--ok)' : 'var(--danger)' }}>
                {'　'}
                {f.view.result}
              </span>
            )}
          </p>
          <ArrayView cells={f.view.cells} showIndex={false} size={88} />
          <ul className="m-0 list-none space-y-0.5 p-0 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            {f.view.log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}
    </SimShell>
  )
}
