import { LegendItem } from '../views/Legend'
import { Steps, TablesSim, table, type Scenario } from '../views/TablesSim'
import type { RowTableData } from '../views/RowTable'

type V = string | number | null
type Kind = '注文' | '支払' | '出荷' | 'キャンセル'
type Ev = { at: string; order: string; kind: Kind }
const EVENTS: Ev[] = [
  { at: '01-01 10:00', order: 'O1', kind: '注文' },
  { at: '01-01 11:00', order: 'O2', kind: '注文' },
  { at: '01-02 09:00', order: 'O1', kind: '支払' },
  { at: '01-02 15:00', order: 'O2', kind: 'キャンセル' },
  { at: '01-03 08:00', order: 'O1', kind: '出荷' },
]
const AMOUNT: Record<string, number> = { O1: 5000, O2: 3000 }
const STATUS: Record<Kind, string> = { 注文: 'ordered', 支払: 'paid', 出荷: 'shipped', キャンセル: 'cancelled' }
const COL: Record<Kind, string> = { 注文: '注文日時', 支払: '支払日時', 出荷: '出荷日時', キャンセル: '取消日時' }
const TABLE: Record<Kind, string> = { 注文: '注文', 支払: '支払', 出荷: '出荷', キャンセル: '注文取消' }

/** 更新する設計: 注文 1 件 1 行。状態と更新日時を上書きする */
function mutable(upTo: number, hot?: string, prev?: Map<string, V[]>): RowTableData {
  const rows = new Map<string, V[]>()
  for (const e of EVENTS.slice(0, upTo)) {
    const cur = rows.get(e.order)
    rows.set(e.order, [e.order, AMOUNT[e.order]!, STATUS[e.kind], cur ? cur[3]! : e.at, e.at])
  }
  return table('orders（更新する設計）', ['order_id', 'amount', 'status', 'created_at', 'updated_at'], [...rows.values()], (r) => (r[0] === hot ? 'active' : undefined), (r) => (r[0] === hot ? prev?.get(r[0] as string) : undefined))
}

/** 更新しない設計: 出来事ごとに表を分け、日時を 1 つだけ持つ行を足す */
function immutable(upTo: number, hot?: Ev, asOf?: string): RowTableData[] {
  const seen = EVENTS.slice(0, upTo)
  return (['注文', '支払', '出荷', 'キャンセル'] as Kind[]).map((k) =>
    table(
      TABLE[k],
      k === '注文' ? ['order_id', 'amount', COL[k]] : ['order_id', COL[k]],
      seen.filter((e) => e.kind === k).map((e) => (k === '注文' ? [e.order, AMOUNT[e.order]!, e.at] : [e.order, e.at])),
      (r) => {
        const at = r[r.length - 1] as string
        if (hot && hot.kind === k && hot.order === r[0]) return 'good'
        if (asOf) return at <= asOf ? 'good' : 'dim'
        return undefined
      },
    ),
  )
}

function stateAt(asOf: string) {
  const seen = EVENTS.filter((e) => e.at <= asOf)
  return [...new Set(seen.map((e) => e.order))].map((o) => {
    const last = seen.filter((e) => e.order === o).pop()!
    return [o, STATUS[last.kind]]
  })
}

const SCENARIOS: Scenario[] = [
  {
    name: '出来事を記録する',
    code: `-- 更新する設計
UPDATE orders SET status = :新しい状態, updated_at = :日時
WHERE order_id = :注文;
-- （最初の注文だけは INSERT）

-- 更新しない設計: 出来事ごとの表に 1 行足す
INSERT INTO :出来事の表 (order_id, :日時の列) VALUES (:注文, :日時);`,
    frames: () => {
      const s = new Steps()
      let prev = new Map<string, V[]>()
      EVENTS.forEach((e, i) => {
        const m = mutable(i + 1, e.order, prev)
        s.push(
          e.kind === '注文' ? [4, 7] : [2, 3, 7],
          `${e.at} ${e.order} の${e.kind}。左は${e.kind === '注文' ? '行を足す' : `状態を ${STATUS[e.kind]} に上書きし、前の状態と日時は消える`}。右は「${TABLE[e.kind]}」の表に、日時を 1 つだけ持つ行を足す。足した行は二度と書き換えない`,
          [m, ...immutable(i + 1, e)],
          { 上書きした回数: EVENTS.slice(1, i + 1).filter((x) => x.kind !== '注文').length, 足した行: i + 1 },
        )
        prev = new Map(m.rows.map((r) => [r.cells[0] as string, r.cells]))
      })
      return s.done()
    },
  },
  {
    name: 'いまの状態を出す',
    code: `-- 更新しない設計では、状態は出来事の有無から導く
SELECT o.order_id,
  CASE WHEN EXISTS (SELECT 1 FROM 注文取消 c WHERE c.order_id = o.order_id) THEN 'cancelled'
       WHEN EXISTS (SELECT 1 FROM 出荷 s WHERE s.order_id = o.order_id) THEN 'shipped'
       WHEN EXISTS (SELECT 1 FROM 支払 p WHERE p.order_id = o.order_id) THEN 'paid'
       ELSE 'ordered' END AS status
FROM 注文 o;`,
    frames: () => {
      const s = new Steps()
      const n = EVENTS.length
      s.push(1, `更新する設計は status 列を読むだけ。更新しない設計には status 列がない`, [mutable(n), ...immutable(n)])
      s.push([2, 3, 4, 5, 6, 7], `出来事の表に行があるかどうかで状態を決める。読むのは少し手間になるが、状態の遷移の規則が SQL の 1 か所に集まる。よく読むなら、この結果をビューや別の表として持つ`, [table('導いた状態', ['order_id', 'status'], stateAt('99'), () => 'good'), ...immutable(n)])
      return s.done()
    },
  },
  {
    name: '過去の時点の状態を出す',
    code: `-- 01-02 12:00 の時点で、各注文はどうなっていたか
-- 更新する設計: 答えられない（updated_at は最後の変更しか持たない）
-- 更新しない設計: 日時で絞ってから同じ導き方をする
... WHERE EXISTS (SELECT 1 FROM 支払 p
                  WHERE p.order_id = o.order_id AND p.支払日時 <= '01-02 12:00') ...`,
    frames: () => {
      const s = new Steps()
      const n = EVENTS.length
      const asOf = '01-02 12:00'
      s.push([1, 2], `更新する設計の表には、いまの状態しかない。O2 が 01-02 12:00 の時点でまだ取り消されていなかったことは、どこにも残っていない`, [mutable(n)])
      s.push([3, 4, 5], `更新しない設計では、各行の日時で絞るだけで、その時点の出来事の集まりが得られる。O1 は支払済み、O2 は注文済み（取消はまだ）`, [table(`${asOf} の状態`, ['order_id', 'status'], stateAt(asOf), () => 'good'), ...immutable(n, undefined, asOf)])
      return s.done()
    },
  },
]

export default function ImmutableModel() {
  return (
    <TablesSim
      title="状態を上書きする設計と、出来事を足していく設計"
      subtitle="注文 → 支払 → 取消 → 出荷を、orders の status 列の更新で記録する場合と、出来事ごとの表に行を足す場合"
      scenarios={SCENARIOS}
      columns={2}
      legend={
        <>
          <LegendItem state="active">上書きした行</LegendItem>
          <LegendItem state="good">足した行・その時点で有効な行</LegendItem>
          <LegendItem state="dim">その時点ではまだ無い行</LegendItem>
        </>
      }
    />
  )
}
