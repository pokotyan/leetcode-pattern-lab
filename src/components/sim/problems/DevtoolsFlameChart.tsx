import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import type { Frame } from '../core/types'

const CODE_THRASH = `window.addEventListener('message', (e) => {
  if (e.data === 'block') busy(150)
})

function relayout() {
  const rows = list.children
  for (let i = 0; i < rows.length; i++) {
    rows[i].style.width = \`\${50 + (i % 50)}%\`  // 書く
    rows[i].dataset.h = rows[i].offsetHeight      // 読む: レイアウトを強制
  }
}

btn.addEventListener('click', () => {
  relayout()
  busy(60)
})`

const CODE_BATCH = `window.addEventListener('message', (e) => {
  if (e.data === 'block') busy(150)
})

function relayout() {
  const rows = list.children
  for (let i = 0; i < rows.length; i++) rows[i].style.width = \`\${50 + (i % 50)}%\`
  for (let i = 0; i < rows.length; i++) rows[i].dataset.h = rows[i].offsetHeight
  // 書き終えてから読むので、レイアウトは最初の読みで 1 回だけ
}

btn.addEventListener('click', () => {
  relayout()
  busy(60)
})`

const CODE_YIELD = `window.addEventListener('message', async (e) => {
  if (e.data !== 'block') return
  for (let done = 0; done < 150; done += 10) {
    busy(10)
    await scheduler.yield()   // 10ms ごとにメインスレッドを手放す
  }
})

function relayout() { /* 元のページと同じ（書いて読むを 400 回） */ }

btn.addEventListener('click', () => {
  relayout()
  busy(60)
})`

type Kind = 'task' | 'script' | 'render' | 'paint'
type Bar = { row: number; start: number; end: number; label: string; kind: Kind; count?: number }

type Scenario = {
  code: string
  /** ブロックの書き方。'whole' は 150ms を 1 つのタスクで、'sliced' は 10ms ずつ */
  block: 'whole' | 'sliced'
  clickAt: number
  procStart: number
  forced: { end: number; layouts: number; layoutMs: number }
  procEnd: number
  nextPaint: number
  lines: { block: number[]; relayout: number[]; busy: number[] }
}

// 数値は Chrome 155 のトレースを DevTools と同じトレースエンジンで読んだ実測値（本文の表）を丸めたもの
const SCENARIOS: { name: string; value: Scenario }[] = [
  {
    name: '元のページ（実測）',
    value: {
      code: CODE_THRASH,
      block: 'whole',
      clickAt: 20.5,
      procStart: 150,
      forced: { end: 191.3, layouts: 400, layoutMs: 35.6 },
      procEnd: 251.3,
      nextPaint: 288.9,
      lines: { block: [1, 2, 3], relayout: [5, 6, 7, 8, 9, 10, 11], busy: [15] },
    },
  },
  {
    name: '書いてから読む（実測）',
    value: {
      code: CODE_BATCH,
      block: 'whole',
      clickAt: 22.7,
      procStart: 150,
      forced: { end: 154.4, layouts: 1, layoutMs: 2.1 },
      procEnd: 214.9,
      nextPaint: 253.6,
      lines: { block: [1, 2, 3], relayout: [5, 6, 7, 8, 9, 10], busy: [14] },
    },
  },
  {
    name: '塞ぐ処理を刻む（実測）',
    value: {
      code: CODE_YIELD,
      block: 'sliced',
      clickAt: 21,
      procStart: 30,
      forced: { end: 70.5, layouts: 400, layoutMs: 35.2 },
      procEnd: 131,
      nextPaint: 169,
      lines: { block: [1, 2, 3, 4, 5, 6, 7], relayout: [9], busy: [13] },
    },
  },
]

type View = {
  bars: Bar[]
  clickAt?: number
  inp?: { input: [number, number]; proc?: [number, number]; pres?: [number, number] }
  longTasks: { start: number; end: number }[]
}

const LONG = 50

function trace(s: Scenario): Frame<View>[] {
  const frames: Frame<View>[] = []
  const bars: Bar[] = []
  const longTasks: View['longTasks'] = []
  let inp: View['inp']
  let clickAt: number | undefined

  const snap = (line: number | number[], note: string, vars: Frame<View>['vars'] = {}, done = false) => {
    frames.push({
      line,
      note,
      vars,
      view: { bars: [...bars], clickAt, inp: inp && { ...inp }, longTasks: [...longTasks] },
      done,
    })
  }

  if (s.block === 'whole') {
    bars.push({ row: 0, start: 0, end: 150, label: 'Task', kind: 'task' })
    bars.push({ row: 1, start: 0, end: 150, label: 'Function call（message）', kind: 'script' })
    snap(s.lines.block, 'メインスレッドで 150ms の処理が始まる。Main トラックでは灰色の Task の下に、それを起こした Function call が積まれる', {
      時刻: '0 ms',
    })
  } else {
    for (let t = 0; t < s.procStart; t += 10) {
      bars.push({ row: 0, start: t, end: t + 9, label: '', kind: 'task' })
      bars.push({ row: 1, start: t, end: t + 9, label: '', kind: 'script' })
    }
    snap(s.lines.block, '同じ 150ms の仕事を、10ms ずつ別のタスクに刻んで実行する。タスクの切れ目でブラウザは入力を拾える', {
      時刻: '0 ms',
    })
  }

  clickAt = s.clickAt
  inp = { input: [s.clickAt, s.procStart] }
  snap(s.lines.block, `${s.clickAt} ms にクリックが届く。メインスレッドは塞がっているので、ハンドラは動けない。ここから入力の遅れが始まる`, {
    時刻: `${s.clickAt} ms`,
  })

  if (s.block === 'whole') {
    longTasks.push({ start: 0, end: 150 })
    snap(s.lines.block, '150ms のタスクが終わる。50ms を超えたので長いタスクとして赤い三角が付き、50ms を超えた部分が赤く塗られる', {
      時刻: '150 ms',
      入力の遅れ: `${(s.procStart - s.clickAt).toFixed(1)} ms`,
    })
  } else {
    snap(s.lines.block, `刻んだ 1 片が ${s.procStart} ms で終わったところで、ブラウザはクリックを先に処理する。どの片も 50ms 未満なので長いタスクにならない`, {
      時刻: `${s.procStart} ms`,
      入力の遅れ: `${(s.procStart - s.clickAt).toFixed(1)} ms`,
    })
  }

  const taskStart = s.procStart
  bars.push({ row: 0, start: taskStart, end: s.procEnd + 1, label: 'Task', kind: 'task' })
  bars.push({ row: 1, start: taskStart + 0.5, end: s.procEnd, label: 'Event: click', kind: 'script' })
  bars.push({ row: 2, start: taskStart + 0.6, end: s.procEnd, label: 'Function call', kind: 'script' })
  bars.push({ row: 3, start: taskStart + 0.6, end: s.forced.end, label: 'relayout', kind: 'script' })
  inp = { input: [s.clickAt, s.procStart], proc: [s.procStart, s.procStart] }
  snap(s.lines.relayout, '新しいタスクで pointerdown から click までのイベントがまとめて配られ、ハンドラの Function call → relayout が積まれる', {
    時刻: `${taskStart} ms`,
  })

  bars.push({
    row: 4,
    start: taskStart + 0.6,
    end: s.forced.end,
    label: `Recalculate style + Layout ×${s.forced.layouts}`,
    kind: 'render',
    count: s.forced.layouts,
  })
  snap(
    s.lines.relayout,
    s.forced.layouts > 1
      ? `書いた直後に offsetHeight を読むたびに、スタイル再計算とレイアウトがその場で走る。relayout の下に Recalculate style と Layout が ${s.forced.layouts} 組並ぶ（合計 ${s.forced.layoutMs} ms）。これが強制同期レイアウト`
      : `すべて書き終えてから読むので、スタイル再計算とレイアウトは最初の読みで 1 回だけ（合計 ${s.forced.layoutMs} ms）`,
    { 'Layout の数': s.forced.layouts },
  )

  bars.push({ row: 3, start: s.forced.end, end: s.procEnd, label: 'busy', kind: 'script' })
  inp = { input: [s.clickAt, s.procStart], proc: [s.procStart, s.procEnd] }
  const taskLen = s.procEnd + 1 - taskStart
  if (taskLen > LONG) longTasks.push({ start: taskStart, end: s.procEnd + 1 })
  snap(s.lines.busy, `残りの 60ms の計算が終わり、ハンドラが戻る。このタスクも ${taskLen.toFixed(0)}ms で、長いタスクになる`, {
    時刻: `${s.procEnd} ms`,
    処理: `${(s.procEnd - s.procStart).toFixed(1)} ms`,
  })

  bars.push({ row: 0, start: s.nextPaint - 2, end: s.nextPaint - 0.5, label: '', kind: 'task' })
  bars.push({ row: 1, start: s.nextPaint - 2, end: s.nextPaint - 1.2, label: 'Paint', kind: 'paint' })
  bars.push({ row: 2, start: s.nextPaint - 1.2, end: s.nextPaint - 0.5, label: 'Commit', kind: 'paint' })
  inp = { input: [s.clickAt, s.procStart], proc: [s.procStart, s.procEnd], pres: [s.procEnd, s.nextPaint] }
  const total = s.nextPaint - s.clickAt
  snap(
    s.lines.busy,
    `次のフレームが描かれた ${s.nextPaint} ms で、この操作は終わる。INP の候補は ${total.toFixed(1)} ms = 入力の遅れ + 処理 + 表示の遅れ`,
    {
      入力の遅れ: `${(s.procStart - s.clickAt).toFixed(1)} ms`,
      処理: `${(s.procEnd - s.procStart).toFixed(1)} ms`,
      表示の遅れ: `${(s.nextPaint - s.procEnd).toFixed(1)} ms`,
      合計: `${total.toFixed(1)} ms`,
    },
    true,
  )

  if (s.block === 'sliced') {
    for (let t = Math.ceil(s.nextPaint / 10) * 10; t < 300; t += 10) {
      bars.push({ row: 0, start: t, end: t + 9, label: '', kind: 'task' })
      bars.push({ row: 1, start: t, end: t + 9, label: '', kind: 'script' })
    }
    frames[frames.length - 1]!.view.bars = [...bars]
  }
  return frames
}

const FILL: Record<Kind, string> = {
  task: 'var(--border)',
  script: 'var(--warn-soft)',
  render: 'var(--accent-soft)',
  paint: 'var(--ok-soft)',
}
const STROKE: Record<Kind, string> = {
  task: 'var(--fg-muted)',
  script: 'var(--warn)',
  render: 'var(--accent)',
  paint: 'var(--ok)',
}

const W = 720
const PAD_L = 8
const SPAN = 300
const ROW_H = 20
const TOP = 46
const x = (ms: number) => PAD_L + (ms / SPAN) * (W - PAD_L * 2)

function Chart({ view }: { view: View }) {
  const h = TOP + ROW_H * 5 + 24
  const segs: { r: [number, number]; label: string; color: string }[] = []
  if (view.inp) {
    segs.push({ r: view.inp.input, label: '入力の遅れ', color: 'var(--danger)' })
    if (view.inp.proc && view.inp.proc[1] > view.inp.proc[0]) segs.push({ r: view.inp.proc, label: '処理', color: 'var(--warn)' })
    if (view.inp.pres) segs.push({ r: view.inp.pres, label: '表示の遅れ', color: 'var(--accent)' })
  }
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="w-full" role="img" aria-label="メインスレッドのフレームチャート">
      <text x={PAD_L} y={12} fontSize="10" fill="var(--fg-muted)">Interactions</text>
      {segs.map((s) => (
        <g key={s.label}>
          <line x1={x(s.r[0])} x2={x(s.r[1])} y1={26} y2={26} stroke={s.color} strokeWidth={s.label === '処理' ? 8 : 2} />
          <line x1={x(s.r[0])} x2={x(s.r[0])} y1={20} y2={32} stroke={s.color} />
          <line x1={x(s.r[1])} x2={x(s.r[1])} y1={20} y2={32} stroke={s.color} />
          <text x={(x(s.r[0]) + x(s.r[1])) / 2} y={42} fontSize="9" textAnchor="middle" fill={s.color}>
            {s.label}
          </text>
        </g>
      ))}
      {view.clickAt !== undefined && (
        <g>
          <line x1={x(view.clickAt)} x2={x(view.clickAt)} y1={14} y2={TOP + ROW_H * 5} stroke="var(--danger)" strokeDasharray="3 3" />
          <text x={x(view.clickAt) + 3} y={12} fontSize="9" fill="var(--danger)">クリック</text>
        </g>
      )}
      <text x={PAD_L} y={TOP - 2} fontSize="10" fill="var(--fg-muted)">Main</text>
      {view.bars.map((b, i) => {
        const bx = x(b.start)
        const bw = Math.max(1, x(b.end) - x(b.start))
        const by = TOP + b.row * ROW_H + 2
        return (
          <g key={i}>
            <rect x={bx} y={by} width={bw} height={ROW_H - 4} fill={FILL[b.kind]} stroke={STROKE[b.kind]} strokeWidth={0.6} />
            {b.count !== undefined && b.count > 1 &&
              Array.from({ length: 24 }, (_, k) => (
                <line
                  key={k}
                  x1={bx + ((k + 0.5) * bw) / 24}
                  x2={bx + ((k + 0.5) * bw) / 24}
                  y1={by}
                  y2={by + ROW_H - 4}
                  stroke="var(--accent)"
                  strokeWidth={0.6}
                />
              ))}
            {b.label && bw > 30 && (
              <text x={bx + 3} y={by + 11} fontSize="9" fill="var(--fg)">
                {b.label}
              </text>
            )}
          </g>
        )
      })}
      {view.longTasks.map((t, i) => (
        <g key={`l${i}`}>
          <rect
            x={x(t.start + LONG)}
            y={TOP + 2}
            width={Math.max(0, x(t.end) - x(t.start + LONG))}
            height={ROW_H - 4}
            fill="var(--danger-soft)"
            stroke="var(--danger)"
            strokeWidth={0.6}
          />
          <polygon
            points={`${x(t.end) - 7},${TOP + 2} ${x(t.end)},${TOP + 2} ${x(t.end)},${TOP + 9}`}
            fill="var(--danger)"
          />
        </g>
      ))}
      {[0, 50, 100, 150, 200, 250, 300].map((t) => (
        <text key={t} x={x(t)} y={h - 6} fontSize="9" textAnchor="middle" fill="var(--fg-muted)">
          {t}
        </text>
      ))}
    </svg>
  )
}

export default function DevtoolsFlameChart() {
  const [s, setS] = useState<Scenario>(SCENARIOS[0]!.value)
  const frames = useMemo(() => trace(s), [s])

  return (
    <SimShell
      title="Main トラックのフレームチャート"
      subtitle="塞がったメインスレッドの上でクリックし、ハンドラが強制レイアウトを起こし、次のフレームが描かれるまでを 1 手ずつ積む。時刻の単位は ms"
      code={s.code}
      lang="ts"
      frames={frames}
      controls={<PresetControl label="ページ" presets={SCENARIOS} onPick={setS} />}
      legend={
        <span className="flex flex-wrap gap-3 text-[11px]" style={{ color: 'var(--fg-muted)' }}>
          <span><span style={{ color: 'var(--warn)' }}>■</span> Scripting</span>
          <span><span style={{ color: 'var(--accent)' }}>■</span> Rendering</span>
          <span><span style={{ color: 'var(--ok)' }}>■</span> Painting</span>
          <span><span style={{ color: 'var(--danger)' }}>▲</span> 長いタスク（50ms を超えた部分を赤く塗る）</span>
        </span>
      }
    >
      {(f) => <Chart view={f.view} />}
    </SimShell>
  )
}
