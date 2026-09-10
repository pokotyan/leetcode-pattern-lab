import type { ReactNode } from 'react'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span style={{ color: 'var(--fg-muted)' }}>{label}</span>
      {children}
    </label>
  )
}

const inputCls = 'rounded border px-2 py-1 font-mono text-xs'
const inputStyle = {
  borderColor: 'var(--border)',
  background: 'var(--bg)',
  color: 'var(--fg)',
} as const

export function TextControl({
  label,
  value,
  onChange,
  width = 200,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  width?: number
  placeholder?: string
}) {
  return (
    <Field label={label}>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
        style={{ ...inputStyle, width }}
      />
    </Field>
  )
}

export function NumberControl({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className={inputCls}
        style={{ ...inputStyle, width: 70 }}
      />
    </Field>
  )
}

export function PresetControl<T>({
  label = '例',
  presets,
  onPick,
}: {
  label?: string
  presets: { name: string; value: T }[]
  onPick: (v: T) => void
}) {
  return (
    <Field label={label}>
      <span className="flex flex-wrap gap-1">
        {presets.map((p) => (
          <button
            key={p.name}
            onClick={() => onPick(p.value)}
            className="rounded border px-2 py-1 font-mono text-[11px] transition-opacity hover:opacity-70"
            style={inputStyle}
          >
            {p.name}
          </button>
        ))}
      </span>
    </Field>
  )
}

/** "1, 2, 3" / "[1,2,3]" どちらでも数値配列にする */
export function parseNums(s: string, fallback: number[] = []): number[] {
  const xs = s
    .replace(/[[\]]/g, '')
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number)
  return xs.length > 0 && xs.every((n) => Number.isFinite(n)) ? xs : fallback
}
