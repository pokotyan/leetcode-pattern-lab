import { LegendItem } from '../views/Legend'
import { Steps, TablesSim, table, type Scenario } from '../views/TablesSim'

type V = string | number | null
// 業務システムから毎時取り込んだ注文。同じ注文が 2 回届くことがある
const RAW: V[][] = [
  ['A-001', 'C01', '1,200', '2', '2025-01-05 10:00', '2025-01-05 11:00'],
  ['A-002', 'C02', '800', '1', '2025-01-05 10:30', '2025-01-05 11:00'],
  ['A-001', 'C01', '1,200', '3', '2025-01-05 13:00', '2025-01-05 14:00'],
  ['A-003', 'C01', '3,000', '9', '2025-01-06 09:00', '2025-01-06 10:00'],
]
const RAW_COLS = ['ORD_NO', 'CUST_CD', 'AMT', 'STS', 'UPD_DT', '_loaded_at']
const CUST: V[][] = [
  ['C01', '山田', '東京'],
  ['C02', '佐藤', '大阪'],
]
const STATUS: Record<string, string> = { '1': 'placed', '2': 'paid', '3': 'shipped', '9': 'cancelled' }

const stg = RAW.map((r) => [r[0]!, r[1]!, Number(String(r[2]).replace(',', '')), STATUS[r[3] as string]!, r[4]!, r[5]!])
const STG_COLS = ['order_id', 'customer_id', 'amount', 'status', 'updated_at', 'loaded_at']
const latest = stg.filter((r) => !stg.some((x) => x[0] === r[0] && (x[4] as string) > (r[4] as string)))
const INT = latest.map((r) => {
  const c = CUST.find((x) => x[0] === r[1])!
  return [r[0]!, r[1]!, c[2]!, r[2]!, r[3]!]
})
const MART = INT.filter((r) => r[4] !== 'cancelled').map((r) => [r[0]!, r[2]!, r[3]!])

const SCENARIOS: Scenario[] = [
  {
    name: '生データから集計用の表まで',
    code: `-- 1. raw: 取り込んだまま。上書きも削除もしない
-- 2. staging: 1 対 1 で、名前・型・コード値だけを直す（結合・集約はしない）
SELECT ORD_NO AS order_id, CUST_CD AS customer_id,
       CAST(REPLACE(AMT, ',', '') AS INT64) AS amount,
       CASE STS WHEN '1' THEN 'placed' WHEN '2' THEN 'paid'
                WHEN '3' THEN 'shipped' WHEN '9' THEN 'cancelled' END AS status,
       UPD_DT AS updated_at, _loaded_at AS loaded_at
FROM raw_orders;
-- 3. intermediate: 重複を除き、ほかの表と結合する
SELECT * FROM stg_orders
QUALIFY ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at DESC) = 1;
-- 4. marts: 業務の言葉で、使う人の粒度に整える
SELECT order_id, region, amount FROM int_orders WHERE status <> 'cancelled';`,
    frames: () => {
      const s = new Steps()
      s.push(1, `raw（生データ）。業務システムの列名・文字列の金額・コード値のまま。A-001 は状態が変わったので 2 回届いている。この層は手を加えずに残し、下の層で誤りが見つかったら、ここから作り直す`, [table('raw_orders', RAW_COLS, RAW, () => 'window')], { 行数: RAW.length })
      s.push([2, 3, 4, 5, 6, 7, 8], `staging。1 行に 1 行を対応させたまま、列名を業務の言葉にし、金額を数値に、状態のコードを名前にする。行を減らしたり結合したりはしない。粒度を変えると、後で元の行に戻れなくなるため`, [table('stg_orders', STG_COLS, stg, () => 'good')], { 行数: stg.length })
      s.push([9, 10, 11], `intermediate。同じ注文の重複を、更新日時が最新の 1 行に絞り、顧客の表と結合して地域を付ける。どの処理をどの層で行うかを決めておくと、数字が合わないときにどこを見ればよいかが分かる`, [table('int_orders', ['order_id', 'customer_id', 'region', 'amount', 'status'], INT, () => 'good'), table('stg_customers', ['customer_id', 'name', 'region'], CUST)], { 行数: INT.length })
      s.push([12, 13], `marts。分析する人が使う形と粒度にする。取り消しを除いた注文。ここで初めて「売上」と呼べる表になる`, [table('fct_orders', ['order_id', 'region', 'amount'], MART, () => 'good')], { 行数: MART.length })
      return s.done()
    },
  },
]

export default function LayerPipeline() {
  return (
    <TablesSim
      title="層を分けて加工する"
      subtitle="raw → staging → intermediate → marts。各層で何をして、何をしないか"
      scenarios={SCENARIOS}
      label="例"
      legend={
        <>
          <LegendItem state="window">取り込んだままの行</LegendItem>
          <LegendItem state="good">その層で作った行</LegendItem>
        </>
      }
    />
  )
}
