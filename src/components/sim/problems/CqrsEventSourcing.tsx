import { LegendItem } from '../views/Legend'
import { Steps, TablesSim, table, type Scenario } from '../views/TablesSim'

type V = string | number
type Ev = [number, string, string, string, number]
// seq, stream, type, at, amount
const EVENTS: Ev[] = [
  [1, 'O1', 'OrderPlaced', '01-01', 5000],
  [2, 'O2', 'OrderPlaced', '01-01', 3000],
  [3, 'O1', 'OrderPaid', '01-02', 5000],
  [4, 'O2', 'OrderCancelled', '01-02', 0],
  [5, 'O3', 'OrderPlaced', '01-03', 7000],
  [6, 'O3', 'OrderPaid', '01-03', 7000],
]
const STATUS: Record<string, string> = { OrderPlaced: 'placed', OrderPaid: 'paid', OrderCancelled: 'cancelled' }

function orderList(evs: Ev[]): V[][] {
  const m = new Map<string, V[]>()
  for (const e of evs) {
    const cur = m.get(e[1])
    m.set(e[1], [e[1], STATUS[e[2]]!, cur ? cur[2]! : e[4]])
  }
  return [...m.values()]
}
function dailySales(evs: Ev[]): V[][] {
  const m = new Map<string, number>()
  for (const e of evs) if (e[2] === 'OrderPaid') m.set(e[3], (m.get(e[3]) ?? 0) + e[4])
  return [...m].map(([d, a]) => [d, a])
}
const store = (evs: Ev[], hot?: number) => table('イベントストア（追記のみ）', ['seq', 'order', 'type', 'at', 'amount'], evs, (r) => (r[0] === hot ? 'good' : undefined))

const SCENARIOS: Scenario[] = [
  {
    name: 'コマンドを処理する',
    code: `// 書き込み側: コマンドを受け、規則を確かめ、出来事を追記する
function handle(cmd: PayOrder, history: OrderEvent[]): OrderEvent[] {
  const order = history.reduce(apply, initial)        // 過去の出来事から今の状態を復元
  if (order.status !== 'placed') throw new Error('支払えない状態')
  return [{ type: 'OrderPaid', orderId: cmd.orderId, amount: order.total }]
}
// 読み取り側: 出来事を購読し、画面ごとの表を更新する
on('OrderPaid', (e) => db.upsert('daily_sales', e.at, (s) => s + e.amount))`,
    frames: () => {
      const s = new Steps()
      for (let i = 1; i <= EVENTS.length; i++) {
        const e = EVENTS[i - 1]!
        s.push(
          e[2] === 'OrderPaid' ? [2, 3, 4, 5, 8] : [2, 3, 4, 5],
          `${e[3]} ${e[1]} の ${e[2]}。書き込み側はイベントストアに 1 行追記するだけで、既存の行は変えない。読み取り側の 2 つの表は、その出来事を受けてそれぞれの都合で更新される`,
          [store(EVENTS.slice(0, i), e[0]), table('読み取り: order_list（一覧画面用）', ['order', 'status', 'total'], orderList(EVENTS.slice(0, i)), (r) => (r[0] === e[1] ? 'active' : undefined)), table('読み取り: daily_sales（売上の画面用）', ['day', 'paid'], dailySales(EVENTS.slice(0, i)), (r) => (e[2] === 'OrderPaid' && r[0] === e[3] ? 'active' : undefined))],
          { 出来事: i },
        )
      }
      return s.done()
    },
  },
  {
    name: '読み取りの表を作り直す',
    code: `// 読み取りの表は捨ててよい。出来事を最初から流し直せば同じものができる
db.truncate('order_list')
for (const e of eventStore.readAll()) project(e)`,
    frames: () => {
      const s = new Steps()
      s.push(2, `order_list に不具合が見つかったので空にする。正しい記録はイベントストアの側にあるので、読み取りの表は失ってもよい`, [store(EVENTS), table('order_list', ['order', 'status', 'total'], [])])
      for (let i = 1; i <= EVENTS.length; i++) s.push(3, `seq ${i} を流し直す`, [store(EVENTS, i), table('order_list', ['order', 'status', 'total'], orderList(EVENTS.slice(0, i)), () => 'good')], { 流し直した出来事: i })
      return s.done()
    },
  },
  {
    name: '後から新しい見方を足す',
    code: `// 「取り消された注文の数」を見たい、と後から言われた
on('OrderCancelled', (e) => db.increment('cancel_count', e.at))
// 新しい表は、過去の出来事を全部流して作る。過去の分も最初から揃う`,
    frames: () => {
      const s = new Steps()
      const cancels = EVENTS.filter((e) => e[2] === 'OrderCancelled')
      s.push([1, 2, 3], `状態だけを上書きで持つ設計なら、取り消しが「いつ」起きたかは残っておらず、今日から数え始めるしかない。出来事を全部持っていれば、新しい読み取りの表を過去の分まで作れる`, [store(EVENTS), table('読み取り: cancel_count（新設）', ['day', 'count'], cancels.map((e) => [e[3], 1]), () => 'good')], { 取り消し: cancels.length })
      return s.done()
    },
  },
]

export default function CqrsEventSourcing() {
  return (
    <TablesSim
      title="CQRS と Event Sourcing"
      subtitle="書き込みは出来事の追記だけ、読み取りは画面ごとに作った表。両者を出来事でつなぐ"
      scenarios={SCENARIOS}
      lang="ts"
      legend={
        <>
          <LegendItem state="good">足した出来事・作り直した行</LegendItem>
          <LegendItem state="active">出来事を受けて更新した行</LegendItem>
        </>
      }
    />
  )
}
