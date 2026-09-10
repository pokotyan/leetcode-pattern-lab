import type { ReactNode } from 'react'
import type { Frame } from './types'
import { useStepper } from './useStepper'
import { CodePanel } from './CodePanel'

type Props<V> = {
  title: string
  subtitle?: string
  /** 疑似コード（Python）。行番号は Frame.line と対応させる */
  code: string
  frames: Frame<V>[]
  /** 入力を変えるUI。ここを操作したら frames を作り直す */
  controls?: ReactNode
  legend?: ReactNode
  children: (frame: Frame<V>, index: number) => ReactNode
}

const SPEEDS = [
  { label: '0.5x', ms: 1200 },
  { label: '1x', ms: 650 },
  { label: '2x', ms: 320 },
  { label: '4x', ms: 150 },
]

export function SimShell<V>({
  title,
  subtitle,
  code,
  frames,
  controls,
  legend,
  children,
}: Props<V>) {
  const st = useStepper(frames.length)
  const frame = frames[st.index] ?? frames[0]
  if (!frame) return null

  return (
    <section
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); st.next() }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); st.prev() }
        else if (e.key === ' ') { e.preventDefault(); st.toggle() }
        else if (e.key === 'Home') { e.preventDefault(); st.go(0) }
        else if (e.key === 'End') { e.preventDefault(); st.go(frames.length - 1) }
      }}
      className="not-prose my-8 rounded-xl border outline-none focus-visible:ring-2 lg:-mx-10"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--bg-soft)',
        // @ts-expect-error CSS 変数
        '--tw-ring-color': 'var(--accent)',
      }}
    >
      <header
        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-4 py-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <h4 className="m-0 text-sm font-bold tracking-wide">
          <span style={{ color: 'var(--accent)' }}>SIM</span> {title}
        </h4>
        {subtitle && (
          <p className="m-0 text-xs" style={{ color: 'var(--fg-muted)' }}>
            {subtitle}
          </p>
        )}
      </header>

      {controls && (
        <div
          className="flex flex-wrap items-center gap-3 border-b px-4 py-3 text-xs"
          style={{ borderColor: 'var(--border)' }}
        >
          {controls}
        </div>
      )}

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_1fr]">
        <div className="min-w-0">
          <div className="overflow-x-auto">{children(frame, st.index)}</div>
          {legend && (
            <div className="mt-3 flex flex-wrap gap-3 text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              {legend}
            </div>
          )}
          <p
            className="mt-3 min-h-[3.5em] rounded-lg border px-3 py-2 text-[13px] leading-relaxed"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--bg)',
            }}
          >
            <span
              className="mr-2 rounded px-1.5 py-0.5 font-mono text-[11px]"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              {st.index + 1}/{frames.length}
            </span>
            {frame.note}
          </p>
        </div>

        <div className="min-w-0">
          <CodePanel code={code} active={frame.line} />
          {frame.vars && Object.keys(frame.vars).length > 0 && (
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px] sm:grid-cols-3">
              {Object.entries(frame.vars).map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-baseline justify-between gap-2 rounded border px-2 py-1"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
                >
                  <dt className="font-mono" style={{ color: 'var(--fg-muted)' }}>
                    {k}
                  </dt>
                  <dd className="m-0 truncate font-mono font-bold">{fmt(v)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      <footer
        className="flex flex-wrap items-center gap-2 border-t px-4 py-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <Btn onClick={st.reset} label="最初へ" disabled={st.atStart}>⏮</Btn>
        <Btn onClick={st.prev} label="1つ戻る" disabled={st.atStart}>◀</Btn>
        <button
          onClick={st.toggle}
          className="rounded-md px-4 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-85"
          style={{ background: 'var(--accent)' }}
        >
          {st.playing ? '⏸ 一時停止' : '▶ 再生'}
        </button>
        <Btn onClick={st.next} label="1つ進む" disabled={st.atEnd}>▶</Btn>
        <Btn onClick={() => st.go(frames.length - 1)} label="最後へ" disabled={st.atEnd}>⏭</Btn>

        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={st.index}
          onChange={(e) => st.go(Number(e.target.value))}
          aria-label="ステップ位置"
          className="mx-1 h-1 min-w-[8rem] flex-1 cursor-pointer accent-[var(--accent)]"
        />

        <select
          value={st.speed}
          onChange={(e) => st.setSpeed(Number(e.target.value))}
          aria-label="再生速度"
          className="rounded-md border px-2 py-1 text-xs"
          style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--fg)' }}
        >
          {SPEEDS.map((s) => (
            <option key={s.ms} value={s.ms}>
              {s.label}
            </option>
          ))}
        </select>
        <span className="hidden text-[11px] sm:inline" style={{ color: 'var(--fg-muted)' }}>
          ← → で1手、Space で再生
        </span>
      </footer>
    </section>
  )
}

function Btn({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void
  label: string
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="rounded-md border px-2.5 py-1.5 text-xs transition-opacity disabled:opacity-35"
      style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--fg)' }}
    >
      {children}
    </button>
  )
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '−'
  if (typeof v === 'boolean') return v ? 'True' : 'False'
  return String(v)
}
