import { useMemo, useState, type ReactNode } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import type { CellState, Frame } from '../core/types'
import { RowTable, type RowTableData } from './RowTable'

export type TablesFrame = Frame<RowTableData[]>

export type Scenario = {
  name: string
  code: string
  frames: () => TablesFrame[]
}

/** フレームを積む。vars は前のフレームから引き継ぎ、渡したものだけ上書きする */
export class Steps {
  frames: TablesFrame[] = []
  vars: TablesFrame['vars'] = {}
  push(line: number | number[], note: string, tables: RowTableData[], vars: TablesFrame['vars'] = {}) {
    this.vars = { ...this.vars, ...vars }
    this.frames.push({ line, note, view: tables, vars: this.vars })
    return this
  }
  done() {
    const last = this.frames[this.frames.length - 1]
    if (last) last.done = true
    return this.frames
  }
}

type Value = string | number | null

/** 行の配列から表を作る。state は行ごとの色、prev は書き換え前の行 */
export function table<R extends Value[]>(
  title: string,
  columns: string[],
  rows: R[],
  state?: (row: R, index: number) => CellState | undefined,
  prev?: (row: R, index: number) => Value[] | undefined,
): RowTableData {
  return {
    title,
    columns,
    rows: rows.map((r, k) => ({ key: `${k}-${r[0]}`, cells: r, state: state?.(r, k), prev: prev?.(r, k) })),
  }
}

/** 何枚かの表が 1 手ずつ変わっていく様子を見せる。シナリオを切り替えて比べる */
export function TablesSim({
  title,
  subtitle,
  scenarios,
  legend,
  label = '操作',
  columns = 1,
}: {
  title: string
  subtitle: string
  scenarios: Scenario[]
  legend?: ReactNode
  label?: string
  /** 表を何列に並べるか（広い画面のとき） */
  columns?: 1 | 2
}) {
  const [i, setI] = useState(0)
  const s = scenarios[i]!
  const frames = useMemo(() => s.frames(), [s])
  return (
    <SimShell
      title={title}
      subtitle={subtitle}
      code={s.code}
      frames={frames}
      controls={<PresetControl label={label} presets={scenarios.map((x, k) => ({ name: x.name, value: k }))} onPick={setI} />}
      legend={legend}
    >
      {(f) => (
        <div className={columns === 2 ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3'}>
          {f.view.map((t, k) => (
            <RowTable key={`${k}-${t.title}`} {...t} />
          ))}
        </div>
      )}
    </SimShell>
  )
}
