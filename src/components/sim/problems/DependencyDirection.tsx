import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { Field, PresetControl } from '../core/Controls'
import { LegendItem } from '../views/Legend'
import { cellStyle } from '../views/style'
import type { CellState, Frame } from '../core/types'

type Mod = { id: string; label: string; x: number; y: number; db?: boolean }
type Arch = { mods: Mod[]; deps: [string, string][]; code: Record<Op, string> }
type Op = 'db' | 'rule' | 'test'
type Scheme = 'layered' | 'clean'

const W = 150
const H = 40

const LAYERED: Arch = {
  mods: [
    { id: 'controller', label: 'OrderController', x: 160, y: 20 },
    { id: 'service', label: 'OrderService', x: 160, y: 95 },
    { id: 'repo', label: 'OrderRepository', x: 160, y: 170 },
    { id: 'pg', label: 'pg（ドライバ）', x: 160, y: 245, db: true },
  ],
  deps: [
    ['controller', 'service'],
    ['service', 'repo'],
    ['repo', 'pg'],
  ],
  code: {
    db: `// service.ts
import { OrderRepository, OrderRow } from './repository'  // 具体的な実装を直接 import
export class OrderService {
  constructor(private repo = new OrderRepository()) {}       // 自分で作る
  async place(input: PlaceInput) {
    const row: OrderRow = await this.repo.insert(input)      // DB の行の型が漏れてくる
    return row
  }
}`,
    rule: `// service.ts
export class OrderService {
  async place(input: PlaceInput) {
    if (input.total > 10000) throw new Error('与信枠を超えています')  // 規則はここ
    return this.repo.insert(input)
  }
}`,
    test: `// service.test.ts
// OrderService は new OrderRepository() を自分で作り、それが pg に接続する
// 規則 1 つを確かめるのに、テスト用の DB を立てる必要がある
test('与信枠を超えたら拒否', async () => {
  const s = new OrderService()
  await expect(s.place({ total: 20000 })).rejects.toThrow()
})`,
  },
}

const CLEAN: Arch = {
  mods: [
    { id: 'controller', label: 'OrderController', x: 20, y: 20 },
    { id: 'main', label: 'main（組み立て）', x: 380, y: 20 },
    { id: 'usecase', label: 'PlaceOrder', x: 20, y: 95 },
    { id: 'port', label: 'OrderRepository（型）', x: 200, y: 95 },
    { id: 'domain', label: 'Order（規則）', x: 20, y: 170 },
    { id: 'pgrepo', label: 'PgOrderRepository', x: 380, y: 170 },
    { id: 'pg', label: 'pg（ドライバ）', x: 380, y: 245, db: true },
  ],
  deps: [
    ['controller', 'usecase'],
    ['usecase', 'domain'],
    ['usecase', 'port'],
    ['port', 'domain'],
    ['pgrepo', 'port'],
    ['pgrepo', 'domain'],
    ['pgrepo', 'pg'],
    ['main', 'controller'],
    ['main', 'usecase'],
    ['main', 'pgrepo'],
  ],
  code: {
    db: `// application/ports.ts（内側が決める型）
export interface OrderRepository { save(order: Order): Promise<void> }

// infrastructure/pg-order-repository.ts（外側が内側に合わせる）
export class PgOrderRepository implements OrderRepository { /* SQL */ }

// main.ts（ここだけが具体的な実装を知っている）
const useCase = new PlaceOrder(new PgOrderRepository(pool))`,
    rule: `// domain/order.ts
export function placeOrder(input: PlaceInput): Result<Order, OrderError> {
  if (input.total > 10000) return err('与信枠を超えています')   // 規則はここ
  return ok({ ...input, status: 'placed' })
}`,
    test: `// place-order.test.ts
const saved: Order[] = []
const fake: OrderRepository = { save: async (o) => { saved.push(o) } }

test('与信枠を超えたら拒否', async () => {
  const r = await new PlaceOrder(fake).run({ total: 20000 })
  expect(r.ok).toBe(false)          // DB なしで、規則だけを確かめる
})`,
  },
}

type View = { arch: Arch; state: Record<string, CellState> }

/** changed を import しているモジュールを、依存をさかのぼってすべて集める */
function dependents(a: Arch, changed: string[]): string[] {
  const out = new Set(changed)
  let grew = true
  while (grew) {
    grew = false
    for (const [from, to] of a.deps) if (out.has(to) && !out.has(from)) (out.add(from), (grew = true))
  }
  return [...out]
}

function trace(s: Scheme, op: Op): Frame<View>[] {
  const a = s === 'layered' ? LAYERED : CLEAN
  const frames: Frame<View>[] = []
  const snap = (line: number | number[], note: string, state: Record<string, CellState>, vars: Frame<View>['vars'], done = false) =>
    frames.push({ line, note, view: { arch: a, state }, vars, done })
  const paint = (ids: string[], st: CellState, base: Record<string, CellState> = {}) => ({ ...base, ...Object.fromEntries(ids.map((i) => [i, st])) })
  const name = s === 'layered' ? '層を上から下へ積む形' : '依存を内側へ向ける形'
  snap(1, `${name}。矢印は「import している」向き。矢印の先が変わると、矢印の元も影響を受けうる`, {}, {})

  if (op === 'db') {
    const changed = s === 'layered' ? ['repo', 'pg'] : ['pgrepo', 'pg']
    // 層の形では、リポジトリが返す DB の行の型をサービスがそのまま使っている
    const hit = s === 'layered' ? dependents(a, ['repo']) : ['pgrepo', 'main']
    snap(1, `DB を PostgreSQL から別のものへ替える。直接変えるのは ${changed.map((c) => a.mods.find((m) => m.id === c)!.label).join(' と ')}`, paint(changed, 'active'), { 直すモジュール: changed.length })
    snap(
      s === 'layered' ? [2, 6] : [1, 2, 4, 5, 7, 8],
      s === 'layered'
        ? `OrderService はリポジトリを import し、DB の行の型（OrderRow）まで使っている。依存をさかのぼると Controller まで影響が届く。下の層の都合が、上の層に漏れている`
        : `内側の PlaceOrder と Order は、自分で決めた OrderRepository という型しか知らない。PgOrderRepository は内側を import する側（矢印が内向き）なので、差し替えても内側は変わらない。具体的な実装を選ぶのは main だけ`,
      paint(changed, 'active', paint(hit, 'bad')),
      { 直すモジュール: changed.length, 影響が届くモジュール: hit.length },
      true,
    )
    return frames
  }
  if (op === 'rule') {
    const where = s === 'layered' ? 'service' : 'domain'
    const hit = dependents(a, [where])
    const ruleLine = s === 'layered' ? 4 : 3
    snap(ruleLine, `「与信枠 1 万円まで」という業務の規則を変える。規則が書いてあるのは ${a.mods.find((m) => m.id === where)!.label}`, paint([where], 'active'), { 直すモジュール: 1 })
    snap(
      ruleLine,
      s === 'layered'
        ? `規則はサービスの中で、DB を呼ぶ処理と同じ関数に混ざっている。規則だけを読む・変える・試すことが難しい`
        : `規則は最も内側の Order にあり、何も import していない。規則を読む・試すのに DB もフレームワークも要らない。ただし内側を変えると、それを使う側すべてに影響が届きうる。だから内側には変わりにくい業務の概念を置き、変わりやすい技術の詳細を外側に置く`,
      paint(hit.filter((x) => x !== where), 'window', paint([where], 'active')),
      { 直すモジュール: 1, 影響を受けうるモジュール: hit.length - 1 },
      true,
    )
    return frames
  }
  const needed = s === 'layered' ? ['service', 'repo', 'pg'] : ['usecase', 'domain', 'port']
  snap(1, `規則を確かめる単体テストを書く。テストから呼ぶのは ${s === 'layered' ? 'OrderService' : 'PlaceOrder'}`, paint([s === 'layered' ? 'service' : 'usecase'], 'active'), {})
  snap(
    s === 'layered' ? [2, 3, 4, 5, 6] : [2, 3, 5, 6, 7],
    s === 'layered'
      ? `OrderService は自分で OrderRepository を作り、それが pg につながる。テストを動かすには DB が要る`
      : `PlaceOrder は OrderRepository という型を受け取るだけ。テストでは配列に溜めるだけの偽物を渡せばよく、DB もネットワークも要らない。外から渡すこと（依存性の注入）と、型を内側に置くこと（依存性の逆転）の組み合わせ`,
    paint(needed, s === 'layered' ? 'bad' : 'good'),
    { テストに要るもの: s === 'layered' ? 'DB' : 'なし' },
    true,
  )
  return frames
}

function Diagram({ v }: { v: View }) {
  const by = new Map(v.arch.mods.map((m) => [m.id, m]))
  const width = Math.max(...v.arch.mods.map((m) => m.x)) + W + 20
  const height = Math.max(...v.arch.mods.map((m) => m.y)) + H + 20
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} style={{ maxWidth: '100%', height: 'auto' }} role="img">
      <defs>
        <marker id="dep-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--fg-muted)" />
        </marker>
      </defs>
      {v.arch.deps.map(([f, t], i) => {
        const a = by.get(f)!
        const b = by.get(t)!
        const ax = a.x + W / 2
        const ay = a.y + H / 2
        const bx = b.x + W / 2
        const by2 = b.y + H / 2
        // 箱の縁で止める
        const dx = bx - ax
        const dy = by2 - ay
        const k = Math.min(Math.abs((W / 2) / (dx || 1e-9)), Math.abs((H / 2) / (dy || 1e-9)))
        return (
          <line
            key={i}
            x1={ax + dx * k}
            y1={ay + dy * k}
            x2={bx - dx * k * 1.08}
            y2={by2 - dy * k * 1.08}
            stroke="var(--fg-muted)"
            strokeWidth={1.4}
            markerEnd="url(#dep-arrow)"
          />
        )
      })}
      {v.arch.mods.map((m) => {
        const s = cellStyle[v.state[m.id] ?? 'idle']
        return (
          <g key={m.id}>
            <rect x={m.x} y={m.y} width={W} height={H} rx={m.db ? 14 : 6} fill={s.background} stroke={s.borderColor} strokeWidth={1.5} strokeDasharray={m.db ? '4 3' : undefined} />
            <text x={m.x + W / 2} y={m.y + H / 2} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="700" fill={s.color}>
              {m.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

const OPS: { name: string; value: Op }[] = [
  { name: 'DB を替える', value: 'db' },
  { name: '業務の規則を変える', value: 'rule' },
  { name: '規則を単体テストする', value: 'test' },
]

export default function DependencyDirection() {
  const [scheme, setScheme] = useState<Scheme>('layered')
  const [op, setOp] = useState<Op>('db')
  const frames = useMemo(() => trace(scheme, op), [scheme, op])
  const arch = scheme === 'layered' ? LAYERED : CLEAN
  return (
    <SimShell
      title="依存の向きと、変更が届く範囲"
      subtitle="同じ注文の処理を、上から下へ依存する形と、内側へ依存する形で組む。何かを変えたとき、どこまで直す必要があるか"
      code={arch.code[op]}
      lang="ts"
      frames={frames}
      controls={
        <>
          <Field label="形">
            <select
              value={scheme}
              onChange={(e) => setScheme(e.target.value as Scheme)}
              className="rounded border px-1.5 py-1 font-mono text-xs"
              style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--fg)' }}
            >
              <option value="layered">層を上から下へ</option>
              <option value="clean">依存を内側へ（ヘキサゴナル・クリーン）</option>
            </select>
          </Field>
          <PresetControl label="操作" presets={OPS} onPick={setOp} />
        </>
      }
      legend={
        <>
          <LegendItem state="active">直接変えるもの</LegendItem>
          <LegendItem state="bad">巻き込まれるもの</LegendItem>
          <LegendItem state="window">影響を受けうるもの</LegendItem>
          <LegendItem state="good">テストに要るものだけ</LegendItem>
        </>
      }
    >
      {(f) => <Diagram v={f.view} />}
    </SimShell>
  )
}
