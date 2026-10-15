import { LegendItem } from '../views/Legend'
import { Steps, TablesSim, table, type Scenario } from '../views/TablesSim'

type V = string | number | null
type Ev = { day: string; order: string; kind: '注文' | '支払' | '出荷' | '到着'; amount: number }
const EVENTS: Ev[] = [
  { day: '01-01', order: 'O1', kind: '注文', amount: 5000 },
  { day: '01-02', order: 'O1', kind: '支払', amount: 5000 },
  { day: '01-02', order: 'O2', kind: '注文', amount: 3000 },
  { day: '01-03', order: 'O1', kind: '出荷', amount: 5000 },
  { day: '01-04', order: 'O2', kind: '支払', amount: 3000 },
  { day: '01-05', order: 'O1', kind: '到着', amount: 5000 },
]
const DAYS = [...new Set(EVENTS.map((e) => e.day))]
const MILESTONE = ['注文', '支払', '出荷', '到着'] as const

function state(upTo: string) {
  const seen = EVENTS.filter((e) => e.day <= upTo)
  const tx = seen.map((e) => [e.day, e.order, e.kind, e.amount] as V[])
  const orders = [...new Set(seen.map((e) => e.order))]
  const acc = orders.map((o) => {
    const amt = seen.find((e) => e.order === o)!.amount
    return [o, ...MILESTONE.map((k) => seen.find((e) => e.order === o && e.kind === k)?.day ?? null), amt] as V[]
  })
  const snap = DAYS.filter((d) => d <= upTo).map((d) => {
    const open = [...new Set(EVENTS.filter((e) => e.day <= d && e.kind === '注文').map((e) => e.order))].filter(
      (o) => !EVENTS.some((e) => e.day <= d && e.order === o && e.kind === '出荷'),
    )
    const amt = open.reduce((a, o) => a + EVENTS.find((e) => e.order === o)!.amount, 0)
    return [d, open.length, amt] as V[]
  })
  return { tx, acc, snap }
}

const SCENARIOS: Scenario[] = [
  {
    name: '1 日ずつ記録する',
    code: `-- トランザクション: 出来事ごとに 1 行足す（書いた行は変えない）
INSERT INTO fct_order_events VALUES (:day, :order, :event, :amount);
-- 定期スナップショット: 毎日の終わりに、その日の状態を 1 行足す
INSERT INTO fct_backlog_daily
SELECT :day, count(*), sum(amount) FROM 未出荷の注文;
-- 累積スナップショット: 注文ごとに 1 行。節目の日付を埋めていく
UPDATE fct_order_progress SET 出荷日 = :day WHERE order_id = :order;`,
    frames: () => {
      const s = new Steps()
      const prev = new Map<string, V[]>()
      for (const d of DAYS) {
        const { tx, acc, snap } = state(d)
        const today = EVENTS.filter((e) => e.day === d)
        s.push(
          [2, 4, 5, 7],
          `${d}: ${today.map((e) => `${e.order} の${e.kind}`).join('、')}。トランザクションの表には出来事が 1 行ずつ増える。定期スナップショットには ${d} の行が 1 つ増える。累積スナップショットは、注文の行の日付の欄を埋める（UPDATE する）`,
          [
            table('トランザクション fct_order_events（1 行 = 出来事 1 つ）', ['day', 'order', 'event', 'amount'], tx, (r) => (r[0] === d ? 'good' : undefined)),
            table('定期スナップショット fct_backlog_daily（1 行 = 1 日）', ['day', '未出荷の件数', '未出荷の金額'], snap, (r) => (r[0] === d ? 'good' : undefined)),
            table('累積スナップショット fct_order_progress（1 行 = 注文 1 件）', ['order', ...MILESTONE.map((m) => `${m}日`), 'amount'], acc, (r) => (today.some((e) => e.order === r[0]) ? 'active' : undefined), (r) => prev.get(r[0] as string)),
          ],
          { 出来事: tx.length, スナップショット: snap.length, 注文: acc.length },
        )
        for (const r of acc) prev.set(r[0] as string, r)
      }
      return s.done()
    },
  },
  {
    name: '足してよい値・いけない値',
    code: `-- 加法的: どの軸で足してもよい
SELECT sum(amount) FROM fct_order_events WHERE event = '注文';
-- 準加法的: 日付の方向には足せない（残高・在庫・件数の状態）
SELECT sum(未出荷の金額) FROM fct_backlog_daily;      -- 意味がない
SELECT avg(未出荷の金額) FROM fct_backlog_daily;      -- 期間の平均なら意味がある`,
    frames: () => {
      const s = new Steps()
      const { tx, snap } = state(DAYS[DAYS.length - 1]!)
      const ordered = tx.filter((r) => r[2] === '注文')
      const total = ordered.reduce((a, r) => a + (r[3] as number), 0)
      s.push([1, 2], `注文の金額は出来事の測定値なので、日をまたいで足してよい。5 日間の注文額は ${total}。このように、どの軸で足しても意味が通る値を加法的（additive）という`, [table('fct_order_events', ['day', 'order', 'event', 'amount'], tx, (r) => (r[2] === '注文' ? 'good' : 'dim'))], { 注文額: total })
      const bad = snap.reduce((a, r) => a + (r[2] as number), 0)
      s.push([3, 4], `未出荷の金額は「その日の終わりの状態」。5 日分を足した ${bad} は、どの日にも存在しなかった金額になる。店舗をまたいで足すのはよいが、日付の方向には足せない。こういう値を準加法的（semi-additive）という`, [table('fct_backlog_daily', ['day', '未出荷の件数', '未出荷の金額'], snap, () => 'bad')], { 足した値: bad })
      const avg = Math.round(bad / snap.length)
      s.push(5, `日付の方向には、平均や期末の値（最後の日）を使う。平均 ${avg}、期末 ${snap[snap.length - 1]![2]}。比率や単価のように、どの方向にも足せない値は非加法的（non-additive）と呼び、分子と分母を別々に持って最後に割る`, [table('fct_backlog_daily', ['day', '未出荷の件数', '未出荷の金額'], snap, () => 'good')], { 平均: avg })
      return s.done()
    },
  },
]

export default function FactTypes() {
  return (
    <TablesSim
      title="ファクトテーブルの 3 つの型"
      subtitle="2 件の注文が、注文 → 支払 → 出荷 → 到着と進む 5 日間を、3 つの型の表で記録する"
      scenarios={SCENARIOS}
      legend={
        <>
          <LegendItem state="good">足した行・足してよい値</LegendItem>
          <LegendItem state="active">書き換えた行</LegendItem>
          <LegendItem state="bad">足すと意味を失う値</LegendItem>
        </>
      }
    />
  )
}
