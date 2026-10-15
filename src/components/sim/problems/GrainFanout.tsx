import { LegendItem } from '../views/Legend'
import { Steps, TablesSim, table, type Scenario } from '../views/TablesSim'

type V = string | number
const ORDERS: V[][] = [
  [1, 'A', 500],
  [2, 'B', 800],
]
const ITEMS: V[][] = [
  [1, 'シャツ', 3000],
  [1, '靴下', 500],
  [1, '帽子', 2000],
  [2, '靴', 8000],
]
const orders = (paint?: (r: V[]) => 'good' | 'window' | 'bad' | undefined) => table('orders（1 行 = 注文 1 件）', ['order_id', 'customer', 'shipping_fee'], ORDERS, paint)
const items = (paint?: (r: V[]) => 'good' | 'window' | 'bad' | undefined) => table('order_items（1 行 = 明細 1 行）', ['order_id', 'product', 'amount'], ITEMS, paint)
const truth = ORDERS.reduce((s, r) => s + (r[2] as number), 0)

const joined = ITEMS.map((it) => {
  const o = ORDERS.find((x) => x[0] === it[0])!
  return [it[0]!, it[1]!, it[2]!, o[2]!]
})

const SCENARIOS: Scenario[] = [
  {
    name: '送料を明細に結合して合計',
    code: `SELECT sum(i.amount)       AS 商品売上,
       sum(o.shipping_fee) AS 送料
FROM order_items i
JOIN orders o USING (order_id);`,
    frames: () => {
      const s = new Steps()
      s.push(1, `送料は注文 1 件につき 1 つ。明細は注文 1 件に何行もある。2 つの表は「1 行が何を表すか（粒度）」が違う`, [orders(), items()], { 本当の送料: truth })
      const fee = joined.reduce((a, r) => a + (r[3] as number), 0)
      s.push([3, 4], `明細の粒度で結合すると、注文 1 の送料 500 が明細 3 行それぞれに付く`, [table('結合した結果（1 行 = 明細）', ['order_id', 'product', 'amount', 'shipping_fee'], joined, (r) => (r[0] === 1 ? 'bad' : undefined))], { 本当の送料: truth })
      s.push([1, 2], `送料を足すと ${fee}。本当は ${truth}。SQL に誤りはないのに、粒度の違う値を同じ行に並べたせいで、注文 1 の送料が 3 倍に数えられた`, [table('結果', ['商品売上', '送料'], [[ITEMS.reduce((a, r) => a + (r[2] as number), 0), fee]], () => 'bad')], { 本当の送料: truth, 出た送料: fee })
      return s.done()
    },
  },
  {
    name: '粒度ごとに集計してから合わせる',
    code: `WITH item_sum AS (
  SELECT order_id, sum(amount) AS amount
  FROM order_items GROUP BY order_id      -- 明細 → 注文の粒度へ
)
SELECT sum(i.amount) AS 商品売上, sum(o.shipping_fee) AS 送料
FROM orders o JOIN item_sum i USING (order_id);`,
    frames: () => {
      const s = new Steps()
      const per = ORDERS.map((o) => [o[0]!, ITEMS.filter((i) => i[0] === o[0]).reduce((a, i) => a + (i[2] as number), 0)])
      s.push([1, 2, 3, 4], `先に明細を注文ごとにまとめ、注文の粒度にそろえる`, [items((r) => (r[0] === 1 ? 'window' : undefined)), table('item_sum（1 行 = 注文 1 件）', ['order_id', 'amount'], per, () => 'good')])
      s.push([5, 6], `粒度がそろった 2 つを結合する。注文 1 件につき 1 行なので、送料は 1 回ずつしか数えられない。送料 ${truth}`, [table('結果', ['商品売上', '送料'], [[per.reduce((a, r) => a + (r[1] as number), 0), truth]], () => 'good')], { 出た送料: truth })
      return s.done()
    },
  },
  {
    name: '送料を明細へ配賦する',
    code: `-- 注文の送料を、明細の金額の割合で各行へ割り振る
SELECT i.order_id, i.product, i.amount,
  round(o.shipping_fee * i.amount
        / sum(i.amount) OVER (PARTITION BY i.order_id)) AS shipping_alloc
FROM order_items i JOIN orders o USING (order_id);`,
    frames: () => {
      const s = new Steps()
      const alloc = ITEMS.map((it) => {
        const o = ORDERS.find((x) => x[0] === it[0])!
        const total = ITEMS.filter((x) => x[0] === it[0]).reduce((a, x) => a + (x[2] as number), 0)
        return [it[0]!, it[1]!, it[2]!, Math.round(((o[2] as number) * (it[2] as number)) / total)]
      })
      s.push([1, 2, 3, 4, 5], `明細の粒度のまま送料を持ちたいなら、注文の送料を明細へ割り振る。これを配賦（allocation）と呼ぶ。シャツ 3000 / 5500 × 500 ≒ ${alloc[0]![3]}`, [table('明細の粒度の送料', ['order_id', 'product', 'amount', 'shipping_alloc'], alloc, () => 'good')])
      const sum = alloc.reduce((a, r) => a + (r[3] as number), 0)
      s.push([1, 2, 3, 4, 5], `割り振った列は明細の粒度の値なので、そのまま足してよい。合計 ${sum}。端数の丸めで 1 円ずれることがあるので、最後の行で差を吸収するなどの約束を決めておく`, [table('結果', ['送料'], [[sum]], () => 'good')], { 出た送料: sum })
      return s.done()
    },
  },
]

export default function GrainFanout() {
  return (
    <TablesSim
      title="粒度の違う値を混ぜると、合計が膨らむ"
      subtitle="注文ごとの送料と、明細ごとの金額。1 行が何を表すかをそろえないまま結合すると何が起きるか"
      scenarios={SCENARIOS}
      columns={2}
      legend={
        <>
          <LegendItem state="window">まとめる元の行</LegendItem>
          <LegendItem state="good">正しく数えた行</LegendItem>
          <LegendItem state="bad">重複して数えた行</LegendItem>
        </>
      }
    />
  )
}
