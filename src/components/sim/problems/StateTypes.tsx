import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { LegendItem } from '../views/Legend'
import { cellStyle } from '../views/style'
import type { CellState, Frame } from '../core/types'

type Flags = { isPaid: boolean; isShipped: boolean; isCancelled: boolean; tracking: boolean }
const ALL: Flags[] = []
for (const isPaid of [false, true])
  for (const isShipped of [false, true])
    for (const isCancelled of [false, true])
      for (const tracking of [false, true]) ALL.push({ isPaid, isShipped, isCancelled, tracking })

/** 業務として意味のある組み合わせなら、その名前を返す */
function meaning(f: Flags): string | null {
  if (!f.isPaid && !f.isShipped && !f.isCancelled && !f.tracking) return '注文済み'
  if (f.isPaid && !f.isShipped && !f.isCancelled && !f.tracking) return '支払済み'
  if (f.isPaid && f.isShipped && !f.isCancelled && f.tracking) return '出荷済み'
  if (!f.isShipped && f.isCancelled && !f.tracking) return f.isPaid ? '取消（返金あり）' : '取消'
  return null
}

const VARIANTS = [
  { kind: 'placed', fields: 'id', name: '注文済み' },
  { kind: 'paid', fields: 'id, paidAt', name: '支払済み' },
  { kind: 'shipped', fields: 'id, paidAt, trackingNo', name: '出荷済み' },
  { kind: 'cancelled', fields: 'id, refund', name: '取消' },
]

type Op = 'flags' | 'union' | 'transition' | 'exhaustive'
type View =
  | { mode: 'grid'; marks: CellState[]; showMeaning: boolean }
  | { mode: 'variants'; hot?: string; added?: boolean; error?: string }

const CODE: Record<Op, string> = {
  flags: `type Order = {
  id: string
  isPaid: boolean
  isShipped: boolean
  isCancelled: boolean
  trackingNo: string | null
}`,
  union: `type Order =
  | { kind: 'placed';    id: string }
  | { kind: 'paid';      id: string; paidAt: Date }
  | { kind: 'shipped';   id: string; paidAt: Date; trackingNo: string }
  | { kind: 'cancelled'; id: string; refund: number }

const bad: Order = { kind: 'shipped', id: 'O2', paidAt: new Date() }`,
  transition: `type Paid = Extract<Order, { kind: 'paid' }>
type Shipped = Extract<Order, { kind: 'shipped' }>

// 出荷できるのは支払済みの注文だけ、を引数の型で言う
function ship(order: Paid, trackingNo: string): Shipped {
  return { ...order, kind: 'shipped', trackingNo }
}

const placed: Order = { kind: 'placed', id: 'O1' }
ship(placed, 'T-1')`,
  exhaustive: `function label(o: Order): string {
  switch (o.kind) {
    case 'placed':  return '注文済み'
    case 'paid':    return '支払済み'
    case 'shipped': return '出荷済み'
    default: {
      const never: never = o   // ここに来る種類が残っていれば型エラー
      return never
    }
  }
}`,
}

function trace(op: Op): Frame<View>[] {
  const frames: Frame<View>[] = []
  const valid = ALL.map((f) => meaning(f) !== null)
  const nValid = valid.filter(Boolean).length
  if (op === 'flags') {
    frames.push({ line: [1, 2, 3, 4, 5, 6, 7], note: `状態を真偽値 3 つと「追跡番号があるか」で持つ。型が許す組み合わせは 2 × 2 × 2 × 2 = ${ALL.length} 通り`, view: { mode: 'grid', marks: ALL.map(() => 'idle'), showMeaning: false }, vars: { 型が許す状態: ALL.length } })
    frames.push({ line: [3, 4, 5, 6], note: `そのうち業務として意味があるのは ${nValid} 通りだけ。「出荷済みなのに未払い」「取消なのに追跡番号がある」などの ${ALL.length - nValid} 通りも、型の上では正しい値として作れてしまう。どこかの if 文がそれを防ぐ役を負う`, view: { mode: 'grid', marks: valid.map((v) => (v ? 'good' : 'bad')), showMeaning: true }, vars: { 型が許す状態: ALL.length, 意味のある状態: nValid }, done: true })
    return frames
  }
  if (op === 'union') {
    frames.push({ line: [1, 2, 3, 4, 5], note: `状態ごとに別の形を書き、kind で見分ける（判別できる直和型）。それぞれの状態は、その状態で意味のある項目だけを持つ。型が許すのは ${VARIANTS.length} 通りの形だけになる`, view: { mode: 'variants' }, vars: { 型が許す形: VARIANTS.length } })
    frames.push({ line: 7, note: `追跡番号のない「出荷済み」を作ろうとすると、コンパイラが止める。不正な状態を、そもそも表せないようにする`, view: { mode: 'variants', hot: 'shipped', error: `error TS2322: Type '{ kind: "shipped"; id: string; paidAt: Date; }' is not assignable to type 'Order'.\n  Property 'trackingNo' is missing in type ...` }, vars: { 型が許す形: VARIANTS.length }, done: true })
    return frames
  }
  if (op === 'transition') {
    frames.push({ line: [1, 2, 4, 5, 6, 7], note: `遷移を関数にし、引数と戻り値の型で「どの状態からどの状態へ」を書く。ship は支払済み（Paid）を受け取り、出荷済み（Shipped）を返す`, view: { mode: 'variants', hot: 'paid' } })
    frames.push({ line: [9, 10], note: `注文済みのまま ship に渡すと型エラー。「支払う前に出荷しない」という規則を、実行する前に検査できる`, view: { mode: 'variants', hot: 'placed', error: `error TS2345: Argument of type '{ kind: "placed"; id: string; }' is not assignable to parameter of type '{ kind: "paid"; id: string; paidAt: Date; }'.\n  Property 'paidAt' is missing ...` }, done: true })
    return frames
  }
  frames.push({ line: [2, 3, 4, 5], note: `kind で分岐して表示名を返す。cancelled の case を書き忘れている`, view: { mode: 'variants' } })
  frames.push({ line: [6, 7, 8], note: `default に来る値を never 型に入れると、書き忘れた種類がある限り型エラーになる。状態を 1 つ足したときも、扱っていない分岐をコンパイラが全部挙げてくれる`, view: { mode: 'variants', hot: 'cancelled', error: `error TS2322: Type '{ kind: "cancelled"; id: string; refund: number; }' is not assignable to type 'never'.` }, done: true })
  return frames
}

function Grid({ marks, showMeaning }: { marks: CellState[]; showMeaning: boolean }) {
  return (
    <table className="m-0 w-full border-collapse font-mono text-[11px]">
      <thead>
        <tr style={{ color: 'var(--fg-muted)' }}>
          {['isPaid', 'isShipped', 'isCancelled', 'trackingNo', '意味'].map((h) => (
            <th key={h} className="border px-1.5 py-0.5 text-left" style={{ borderColor: 'var(--border)' }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ALL.map((f, i) => {
          const s = cellStyle[marks[i] ?? 'idle']
          return (
            <tr key={i} style={{ background: s.background, color: s.color }}>
              {[f.isPaid, f.isShipped, f.isCancelled].map((b, k) => (
                <td key={k} className="border px-1.5 py-0.5" style={{ borderColor: 'var(--border)' }}>
                  {String(b)}
                </td>
              ))}
              <td className="border px-1.5 py-0.5" style={{ borderColor: 'var(--border)' }}>
                {f.tracking ? "'T-1'" : 'null'}
              </td>
              <td className="border px-1.5 py-0.5" style={{ borderColor: 'var(--border)' }}>
                {showMeaning ? (meaning(f) ?? 'あり得ない') : ''}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Variants({ hot, error }: { hot?: string; error?: string }) {
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {VARIANTS.map((v) => {
          const s = cellStyle[v.kind === hot ? (error ? 'bad' : 'active') : 'good']
          return (
            <div key={v.kind} className="rounded border px-2 py-1.5 font-mono text-[11.5px]" style={{ background: s.background, color: s.color, borderColor: s.borderColor }}>
              <b>{v.kind}</b>（{v.name}）
              <div className="opacity-80">{v.fields}</div>
            </div>
          )
        })}
      </div>
      {error && (
        <pre className="m-0 whitespace-pre-wrap rounded border px-2 py-1.5 text-[11px]" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', background: 'var(--danger-soft)' }}>
          {error}
        </pre>
      )}
    </div>
  )
}

const PRESETS: { name: string; value: Op }[] = [
  { name: '真偽値の組み合わせ', value: 'flags' },
  { name: '直和型にする', value: 'union' },
  { name: '遷移を型で縛る', value: 'transition' },
  { name: '分岐の書き忘れ', value: 'exhaustive' },
]

export default function StateTypes() {
  const [op, setOp] = useState<Op>('flags')
  const frames = useMemo(() => trace(op), [op])
  return (
    <SimShell
      title="状態を型の形で表す"
      subtitle="注文の状態を、真偽値の組み合わせで持つ場合と、状態ごとの形の直和で持つ場合。型エラーは TypeScript 5.9.3 の実際の出力"
      code={CODE[op]}
      lang="ts"
      frames={frames}
      controls={<PresetControl label="例" presets={PRESETS} onPick={setOp} />}
      legend={
        <>
          <LegendItem state="good">意味のある状態</LegendItem>
          <LegendItem state="bad">あり得ない状態・型エラー</LegendItem>
          <LegendItem state="active">いま注目している状態</LegendItem>
        </>
      }
    >
      {(f) => (f.view.mode === 'grid' ? <Grid marks={f.view.marks} showMeaning={f.view.showMeaning} /> : <Variants hot={f.view.hot} error={f.view.error} />)}
    </SimShell>
  )
}
