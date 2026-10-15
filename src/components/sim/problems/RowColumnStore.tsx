import { useMemo, useState, type ReactNode } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { LegendItem } from '../views/Legend'
import { cellStyle } from '../views/style'
import type { CellState, Frame } from '../core/types'

type Value = string | number
const COLS = ['id', 'date', 'customer', 'amount', 'status'] as const
const ROWS: Value[][] = [
  [1, '01-03', 'A', 1200, 'paid'],
  [2, '01-03', 'B', 800, 'paid'],
  [3, '01-04', 'A', 3000, 'shipped'],
  [4, '01-05', 'C', 450, 'shipped'],
  [5, '01-05', 'B', 2200, 'shipped'],
  [6, '01-06', 'D', 980, 'shipped'],
  [7, '01-07', 'A', 1500, 'cancelled'],
  [8, '01-08', 'C', 640, 'paid'],
]
const PER_PAGE = 3
const NEW: Value[] = [9, '01-09', 'D', 700, 'paid']

type Op = 'sum' | 'filter' | 'point' | 'insert'
/** 行 r・列 c のセルの色。ページ（ブロック）単位の読みは blocks で持つ */
type View = { rows: Value[][]; cell: Record<string, CellState>; rowBlocks: Set<number>; colBlocks: Set<number> }

const key = (r: number, c: number) => `${r}:${c}`

const CODE: Record<Op, string> = {
  sum: `SELECT sum(amount) FROM orders;`,
  filter: `SELECT count(*) FROM orders
WHERE status = 'shipped';`,
  point: `SELECT * FROM orders WHERE id = 5;`,
  insert: `INSERT INTO orders VALUES (9, '01-09', 'D', 700, 'paid');`,
}

function trace(op: Op): Frame<View>[] {
  const frames: Frame<View>[] = []
  const snap = (line: number | number[], note: string, v: Partial<View> & { rows?: Value[][] }, vars: Frame<View>['vars'], done = false) =>
    frames.push({
      line,
      note,
      view: { rows: v.rows ?? ROWS, cell: v.cell ?? {}, rowBlocks: v.rowBlocks ?? new Set(), colBlocks: v.colBlocks ?? new Set() },
      vars,
      done,
    })
  const pages = Math.ceil(ROWS.length / PER_PAGE)
  const all = (c: number, state: CellState, rows = ROWS) => Object.fromEntries(rows.map((_, r) => [key(r, c), state]))

  snap(1, `同じ 8 行・5 列の表を、左は行ごとにページへ詰め（行指向）、右は列ごとにまとめて置く（列指向）。ディスクから読む単位はどちらも「ブロック」`, {}, { 行指向で読むブロック: 0, 列指向で読むブロック: 0 })

  if (op === 'sum') {
    const a = COLS.indexOf('amount')
    snap(1, `amount の合計。行指向では amount が全ページに散らばっているので、${pages} ページすべてを読む。読んだ中の 4/5 は使わない列`, { cell: all(a, 'good'), rowBlocks: new Set(Array.from({ length: pages }, (_, i) => i)) }, { 行指向で読むブロック: pages, 列指向で読むブロック: '…' })
    snap(1, `列指向では amount の塊 1 つだけを読めばよい。値が同じ型で並ぶので、まとめて足し算する処理（ベクトル化）にも向く`, { cell: all(a, 'good'), rowBlocks: new Set(Array.from({ length: pages }, (_, i) => i)), colBlocks: new Set([a]) }, { 行指向で読むブロック: pages, 列指向で読むブロック: 1 }, true)
    return frames
  }
  if (op === 'filter') {
    const s = COLS.indexOf('status')
    const cell = Object.fromEntries(ROWS.map((r, i) => [key(i, s), (r[s] === 'shipped' ? 'good' : 'window') as CellState]))
    snap([1, 2], `status だけを見る問い合わせ。行指向は全ページ`, { cell, rowBlocks: new Set(Array.from({ length: pages }, (_, i) => i)) }, { 行指向で読むブロック: pages, 列指向で読むブロック: '…' })
    snap([1, 2], `列指向は status の塊だけ。しかも status は値の種類が少なく、同じ値が連続している（paid paid shipped shipped …）。辞書（値に番号を振る）や連長圧縮（「shipped が 4 個」と書く）で小さく持てるので、読むバイト数がさらに減る`, { cell, rowBlocks: new Set(Array.from({ length: pages }, (_, i) => i)), colBlocks: new Set([s]) }, { 行指向で読むブロック: pages, 列指向で読むブロック: 1 }, true)
    return frames
  }
  if (op === 'point') {
    const r = 4
    const cell = Object.fromEntries(COLS.map((_, c) => [key(r, c), 'good' as CellState]))
    snap(1, `id = 5 の 1 行を丸ごと取る。行指向では索引で場所を引けば、その行が入った 1 ページを読むだけ。5 つの列の値が隣り合っている`, { cell, rowBlocks: new Set([Math.floor(r / PER_PAGE)]) }, { 行指向で読むブロック: 1, 列指向で読むブロック: '…' })
    snap(1, `列指向では 5 つの値が 5 つの塊に分かれている。1 行を組み立てるのに ${COLS.length} 個の塊へ行く必要がある。業務システムが「この注文を表示する」たびにこれを払う`, { cell, rowBlocks: new Set([Math.floor(r / PER_PAGE)]), colBlocks: new Set(COLS.map((_, c) => c)) }, { 行指向で読むブロック: 1, 列指向で読むブロック: COLS.length }, true)
    return frames
  }
  const rows = [...ROWS, NEW]
  const cell = Object.fromEntries(COLS.map((_, c) => [key(ROWS.length, c), 'good' as CellState]))
  const last = Math.floor(ROWS.length / PER_PAGE)
  snap(1, `1 行を足す。行指向では末尾のページに 1 行書くだけ`, { rows, cell, rowBlocks: new Set([last]) }, { 行指向で書くブロック: 1, 列指向で書くブロック: '…' })
  snap(1, `列指向では ${COLS.length} 個の塊それぞれの末尾に値を足す。圧縮された塊を少しずつ書き換えるのは高くつくので、列指向のエンジンは小さな書き込みを溜めてからまとめて書く。1 行ずつの INSERT を 1 万回繰り返すと、DuckDB は 1.7 秒、PostgreSQL は 25 ms だった`, { rows, cell, rowBlocks: new Set([last]), colBlocks: new Set(COLS.map((_, c) => c)) }, { 行指向で書くブロック: 1, 列指向で書くブロック: COLS.length }, true)
  return frames
}

function Block({ label, state, children }: { label: string; state?: CellState; children: ReactNode }) {
  const s = cellStyle[state ?? 'idle']
  return (
    <div className="rounded border p-1" style={{ borderColor: state ? s.borderColor : 'var(--border)', background: state ? 'var(--accent-soft)' : 'var(--bg)' }}>
      <p className="m-0 mb-1 font-mono text-[10px]" style={{ color: 'var(--fg-muted)' }}>
        {label}
      </p>
      {children}
    </div>
  )
}

function Cell({ v, state }: { v: Value; state?: CellState }) {
  const s = cellStyle[state ?? 'idle']
  return (
    <span className="inline-block min-w-[2.6em] whitespace-nowrap rounded-sm border px-1 text-center font-mono text-[10.5px]" style={{ background: s.background, color: s.color, borderColor: s.borderColor }}>
      {v}
    </span>
  )
}

function Layout({ v }: { v: View }) {
  const pages: number[][] = []
  for (let i = 0; i < v.rows.length; i += PER_PAGE) pages.push(Array.from({ length: Math.min(PER_PAGE, v.rows.length - i) }, (_, k) => i + k))
  return (
    <div className="grid gap-4">
      <div>
        <p className="m-0 mb-1 text-[11px] font-bold">行指向（1 ページに 3 行）</p>
        <div className="grid gap-1.5">
          {pages.map((rs, p) => (
            <Block key={p} label={`ページ ${p}`} state={v.rowBlocks.has(p) ? 'window' : undefined}>
              {rs.map((r) => (
                <div key={r} className="flex gap-0.5">
                  {v.rows[r]!.map((x, c) => (
                    <Cell key={c} v={x} state={v.cell[key(r, c)]} />
                  ))}
                </div>
              ))}
            </Block>
          ))}
        </div>
      </div>
      <div>
        <p className="m-0 mb-1 text-[11px] font-bold">列指向（1 列が 1 つの塊）</p>
        <div className="grid gap-1.5">
          {COLS.map((name, c) => (
            <Block key={name} label={name} state={v.colBlocks.has(c) ? 'window' : undefined}>
              <div className="flex flex-wrap gap-0.5">
                {v.rows.map((row, r) => (
                  <Cell key={r} v={row[c]!} state={v.cell[key(r, c)]} />
                ))}
              </div>
            </Block>
          ))}
        </div>
      </div>
    </div>
  )
}

const PRESETS: { name: string; value: Op }[] = [
  { name: '1 列を合計', value: 'sum' },
  { name: '1 列で絞って数える', value: 'filter' },
  { name: '1 行を丸ごと取る', value: 'point' },
  { name: '1 行を足す', value: 'insert' },
]

export default function RowColumnStore() {
  const [op, setOp] = useState<Op>('sum')
  const frames = useMemo(() => trace(op), [op])
  return (
    <SimShell
      title="行指向と列指向（同じ表を、どう並べてディスクに置くか）"
      subtitle="読む・書くたびに、どのブロックに触るかを数える"
      code={CODE[op]}
      frames={frames}
      controls={<PresetControl label="操作" presets={PRESETS} onPick={setOp} />}
      legend={
        <>
          <LegendItem state="window">読む・書くブロック</LegendItem>
          <LegendItem state="good">使う値</LegendItem>
        </>
      }
    >
      {(f) => <Layout v={f.view} />}
    </SimShell>
  )
}
