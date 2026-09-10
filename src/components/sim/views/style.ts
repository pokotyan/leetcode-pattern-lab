import type { CellState, Pointer } from '../core/types'

export const cellStyle: Record<CellState, { background: string; color: string; borderColor: string }> = {
  idle: { background: 'var(--bg)', color: 'var(--fg)', borderColor: 'var(--border)' },
  active: { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' },
  window: { background: 'var(--accent-soft)', color: 'var(--fg)', borderColor: 'var(--accent)' },
  good: { background: 'var(--ok-soft)', color: 'var(--ok)', borderColor: 'var(--ok)' },
  bad: { background: 'var(--danger-soft)', color: 'var(--danger)', borderColor: 'var(--danger)' },
  dim: { background: 'var(--bg-soft)', color: 'var(--fg-muted)', borderColor: 'var(--border)' },
}

export const toneColor: Record<NonNullable<Pointer['tone']>, string> = {
  accent: 'var(--accent)',
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  danger: 'var(--danger)',
}
