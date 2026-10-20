import type { ReactNode } from 'react'

/**
 * 連続量をスライダーで動かす図の枠。ステップ実行の SimShell と見た目を揃え、
 * 再生ではなく「値を動かすと形が変わる」ことを見せる。
 */
export function VizShell({
  title,
  subtitle,
  controls,
  readout,
  children,
}: {
  title: string
  subtitle?: string
  controls?: ReactNode
  /** 図の下に出す、いまの値の読み取り */
  readout?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      className="not-prose my-8 rounded-xl border lg:-mx-10"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-soft)' }}
    >
      <header
        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-4 py-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <h4 className="m-0 text-sm font-bold tracking-wide">
          <span style={{ color: 'var(--accent)' }}>VIZ</span> {title}
        </h4>
        {subtitle && (
          <p className="m-0 text-xs" style={{ color: 'var(--fg-muted)' }}>
            {subtitle}
          </p>
        )}
      </header>
      {controls && (
        <div
          className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b px-4 py-3 text-xs"
          style={{ borderColor: 'var(--border)' }}
        >
          {controls}
        </div>
      )}
      <div className="overflow-x-auto px-4 py-4">{children}</div>
      {readout && (
        <div
          className="border-t px-4 py-3 font-mono text-xs leading-relaxed"
          style={{ borderColor: 'var(--border)', color: 'var(--fg-muted)' }}
        >
          {readout}
        </div>
      )}
    </section>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  format = (v) => v.toFixed(2),
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  return (
    <label className="flex items-center gap-2">
      <span style={{ color: 'var(--fg-muted)' }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ accentColor: 'var(--accent)', width: 140 }}
      />
      <span className="w-14 font-mono" style={{ color: 'var(--fg)' }}>
        {format(value)}
      </span>
    </label>
  )
}
