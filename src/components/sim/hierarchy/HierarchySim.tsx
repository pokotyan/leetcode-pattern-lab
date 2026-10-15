import { useMemo, useState, type ReactNode } from 'react'
import { SimShell } from '../core/SimShell'
import { Field } from '../core/Controls'
import { GraphView, type GEdge, type GNode } from '../views/GraphView'
import { LegendItem } from '../views/Legend'
import { RowTable, type RowTableData } from '../views/RowTable'
import type { CellState, Frame } from '../core/types'
import { SAMPLE, layout, preorder, root, type Tree } from './tree'

export type Op = 'desc' | 'anc' | 'add' | 'move' | 'del'
export type Args = { target: number; dest: number }

export type HView = {
  tree: Tree
  nodes: Record<number, CellState>
  tables: RowTableData[]
}

export type Model = {
  title: string
  subtitle: string
  code: (op: Op, args: Args) => string
  trace: (op: Op, args: Args) => Frame<HView>[]
  /** 表の上に足す図（入れ子集合の区間など） */
  extra?: (v: HView) => ReactNode
}

export const OPS: { op: Op; label: string }[] = [
  { op: 'desc', label: '子孫を取る' },
  { op: 'anc', label: '先祖を取る' },
  { op: 'add', label: '葉を追加' },
  { op: 'move', label: '部分木を移動' },
  { op: 'del', label: '部分木を削除' },
]

/** 読んだ行・書いた行・文の数を数えながらフレームを積む */
export class Recorder {
  frames: Frame<HView>[] = []
  read = 0
  written = 0
  stmts = 0
  snap(line: number | number[], note: string, view: HView, done = false) {
    this.frames.push({
      line,
      note,
      vars: { 発行した文: this.stmts, 読んだ行: this.read, 書いた行: this.written },
      view,
      done,
    })
  }
}

/** 「子孫・先祖」の結果を木の上で塗る */
export function paint(ids: number[], state: CellState, base: Record<number, CellState> = {}) {
  const out = { ...base }
  for (const id of ids) out[id] = state
  return out
}

const DEFAULT_ARGS: Record<Op, Args> = {
  desc: { target: 2, dest: 3 },
  anc: { target: 7, dest: 3 },
  add: { target: 4, dest: 3 },
  move: { target: 4, dest: 6 },
  del: { target: 4, dest: 3 },
}

function TreeView({ v }: { v: HView }) {
  const { pos, width, height } = layout(v.tree)
  const nodes: GNode[] = v.tree.map((n) => ({
    id: n.id,
    label: n.name,
    x: pos.get(n.id)!.x,
    y: pos.get(n.id)!.y,
    state: v.nodes[n.id],
    badge: n.id,
  }))
  const edges: GEdge[] = v.tree
    .filter((n) => n.parent !== null)
    .map((n) => {
      const s = v.nodes[n.id]
      return { from: n.parent!, to: n.id, state: s === 'bad' ? 'bad' : s === 'active' ? 'active' : 'idle' }
    })
  // 小さな木を横幅いっぱいに引き伸ばさない
  return (
    <div className="mx-auto" style={{ maxWidth: width }}>
      <GraphView nodes={nodes} edges={edges} directed={false} width={width} height={height} />
    </div>
  )
}

const selectStyle = {
  borderColor: 'var(--border)',
  background: 'var(--bg)',
  color: 'var(--fg)',
} as const

function NodeSelect({ label, value, ids, onChange }: { label: string; value: number; ids: number[]; onChange: (n: number) => void }) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded border px-1.5 py-1 font-mono text-xs"
        style={selectStyle}
      >
        {ids.map((id) => (
          <option key={id} value={id}>
            {id}: {SAMPLE.find((n) => n.id === id)!.name}
          </option>
        ))}
      </select>
    </Field>
  )
}

/** 操作と対象ノードを選ぶ。比較パネルと共用 */
export function useHierarchyControls() {
  const [op, setOp] = useState<Op>('desc')
  const [args, setArgs] = useState<Args>(DEFAULT_ARGS.desc)

  const all = preorder(SAMPLE)
  const rootId = root(SAMPLE).id
  const targets = op === 'move' || op === 'del' ? all.filter((id) => id !== rootId) : all
  // 移動先に自分の部分木を選べるようにしておく。隣接リストで循環ができる様子を見せるため
  const dests = all.filter((id) => id !== args.target && id !== SAMPLE.find((n) => n.id === args.target)?.parent)

  const controls = (
    <>
      <Field label="操作">
        <span className="flex flex-wrap gap-1">
          {OPS.map((o) => (
            <button
              key={o.op}
              onClick={() => {
                setOp(o.op)
                setArgs(DEFAULT_ARGS[o.op])
              }}
              className="rounded border px-2 py-1 font-mono text-[11px]"
              style={
                o.op === op
                  ? { borderColor: 'var(--accent)', background: 'var(--accent)', color: '#fff' }
                  : selectStyle
              }
            >
              {o.label}
            </button>
          ))}
        </span>
      </Field>
      <NodeSelect
        label={op === 'add' ? '親' : '対象'}
        value={args.target}
        ids={targets}
        onChange={(target) => {
          const parent = SAMPLE.find((n) => n.id === target)?.parent
          const dest =
            args.dest === target || args.dest === parent
              ? all.find((id) => id !== target && id !== parent)!
              : args.dest
          setArgs({ target, dest })
        }}
      />
      {op === 'move' && (
        <NodeSelect label="移動先の親" value={args.dest} ids={dests} onChange={(dest) => setArgs({ ...args, dest })} />
      )}
    </>
  )
  return { op, args, controls }
}

export function HierarchySim({ model }: { model: Model }) {
  const { op, args, controls } = useHierarchyControls()
  const frames = useMemo(() => model.trace(op, args), [model, op, args])

  return (
    <SimShell
      title={model.title}
      subtitle={model.subtitle}
      code={model.code(op, args)}
      frames={frames}
      controls={controls}
      legend={
        <>
          <LegendItem state="active">対象・書き換えた行</LegendItem>
          <LegendItem state="window">読んだ行</LegendItem>
          <LegendItem state="good">結果・追加した行</LegendItem>
          <LegendItem state="bad">消した行・壊れた所</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <TreeView v={f.view} />
          {model.extra?.(f.view)}
          <div className="grid gap-3">
            {f.view.tables.map((t, i) => (
              <RowTable key={i} {...t} />
            ))}
          </div>
        </div>
      )}
    </SimShell>
  )
}
