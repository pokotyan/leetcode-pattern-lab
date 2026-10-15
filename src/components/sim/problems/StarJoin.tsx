import { LegendItem } from '../views/Legend'
import { Steps, TablesSim, table, type Scenario } from '../views/TablesSim'
import type { CellState } from '../core/types'

type V = string | number
const DATE: V[][] = [
  [20250105, '2025-01-05', '2025-01'],
  [20250120, '2025-01-20', '2025-01'],
  [20250203, '2025-02-03', '2025-02'],
]
const PRODUCT: V[][] = [
  [1, 'シャツ', '衣料'],
  [2, '靴', '衣料'],
  [3, 'コーヒー', '食品'],
]
const STORE: V[][] = [
  [1, '渋谷店', '東京'],
  [2, '梅田店', '大阪'],
]
// date_key, product_key, store_key, quantity, amount
const FACT: V[][] = [
  [20250105, 1, 1, 2, 6000],
  [20250105, 3, 2, 3, 1500],
  [20250120, 2, 1, 1, 9000],
  [20250120, 1, 2, 1, 3000],
  [20250203, 3, 1, 4, 2000],
  [20250203, 2, 1, 1, 8000],
  [20250203, 1, 2, 2, 6000],
]
const fact = (paint?: (r: V[]) => CellState | undefined) => table('fact_sales（1 行 = 1 回の販売の 1 商品）', ['date_key', 'product_key', 'store_key', 'quantity', 'amount'], FACT, paint)
const dim = (name: string, cols: string[], rows: V[][], paint?: (r: V[]) => CellState | undefined) => table(name, cols, rows, paint)
const product = (p?: (r: V[]) => CellState | undefined) => dim('dim_product', ['product_key', 'name', 'category'], PRODUCT, p)
const date = (p?: (r: V[]) => CellState | undefined) => dim('dim_date', ['date_key', 'date', 'month'], DATE, p)
const store = (p?: (r: V[]) => CellState | undefined) => dim('dim_store', ['store_key', 'store', 'region'], STORE, p)

const cat = (k: V) => PRODUCT.find((p) => p[0] === k)![2]!
const month = (k: V) => DATE.find((d) => d[0] === k)![2]!
const region = (k: V) => STORE.find((s) => s[0] === k)![2]!

const SCENARIOS: Scenario[] = [
  {
    name: '月 × カテゴリの売上',
    code: `SELECT d.month, p.category, sum(f.amount) AS amount
FROM fact_sales f
JOIN dim_date d    ON d.date_key = f.date_key
JOIN dim_product p ON p.product_key = f.product_key
GROUP BY d.month, p.category;`,
    frames: () => {
      const s = new Steps()
      s.push(2, `真ん中に出来事（販売）の表、周りにその出来事を説明する表。ファクトは数値とキーだけを持ち、名前や分類はディメンションにある`, [fact(), date(), product(), store()])
      const withNames = FACT.map((r) => [month(r[0]!), cat(r[1]!), r[4]!])
      s.push([3, 4], `ファクトの各行から、日付と商品のディメンションをキーで 1 回ずつ引き、月とカテゴリを付ける。ディメンションは小さいので、引くのは安い`, [table('結合した結果', ['month', 'category', 'amount'], withNames, () => 'window'), date(() => 'window'), product(() => 'window')], { 結合: 2 })
      const g = new Map<string, number>()
      for (const [m, c, a] of withNames) g.set(`${m}|${c}`, (g.get(`${m}|${c}`) ?? 0) + (a as number))
      const out = [...g].map(([k, v]) => [...k.split('|'), v])
      s.push([1, 5], `月とカテゴリでまとめる。分析の軸を変えたいとき（地域別にしたい、など）は、ディメンションを差し替えるだけで済む`, [table('結果', ['month', 'category', 'amount'], out, () => 'good')], { 結果の行: out.length })
      return s.done()
    },
  },
  {
    name: '2 月・東京・衣料に絞る',
    code: `SELECT sum(f.amount)
FROM fact_sales f
JOIN dim_date d    ON d.date_key = f.date_key
JOIN dim_product p ON p.product_key = f.product_key
JOIN dim_store s   ON s.store_key = f.store_key
WHERE d.month = '2025-02' AND p.category = '衣料'
  AND s.region = '東京';`,
    frames: () => {
      const s = new Steps()
      const dk = DATE.filter((d) => d[2] === '2025-02').map((d) => d[0])
      const pk = PRODUCT.filter((p) => p[2] === '衣料').map((p) => p[0])
      const sk = STORE.filter((x) => x[2] === '東京').map((x) => x[0])
      const pick = (keys: V[]) => (r: V[]) => (keys.includes(r[0]!) ? 'good' : 'dim') as CellState
      s.push([6, 7], `条件はすべてディメンションの側にかかる。まず小さなディメンションを絞り、当てはまるキーの集合を作る：日付 ${dk.join(', ')}、商品 ${pk.join(', ')}、店舗 ${sk.join(', ')}`, [date(pick(dk)), product(pick(pk)), store(pick(sk))])
      const hit = FACT.filter((r) => dk.includes(r[0]!) && pk.includes(r[1]!) && sk.includes(r[2]!))
      s.push([2, 3, 4, 5], `ファクトからは、3 つのキーがすべて集合に入る行だけを拾う。大きなファクトを先に結合せず、キーの集合で絞るのがスタースキーマの問い合わせの定石（スター結合）`, [fact((r) => (hit.includes(r) ? 'good' : 'dim'))], { 拾った行: hit.length })
      s.push(1, `合計 ${hit.reduce((a, r) => a + (r[4] as number), 0)}（${region(hit[0]![2]!)}・${month(hit[0]![0]!)}・${cat(hit[0]![1]!)}）`, [table('結果', ['sum'], [[hit.reduce((a, r) => a + (r[4] as number), 0)]], () => 'good')])
      return s.done()
    },
  },
]

export default function StarJoin() {
  return (
    <TablesSim
      title="スタースキーマで集計する"
      subtitle="販売のファクトを、日付・商品・店舗のディメンションで切る"
      scenarios={SCENARIOS}
      columns={2}
      legend={
        <>
          <LegendItem state="window">結合で引いた行</LegendItem>
          <LegendItem state="good">条件に合う・結果の行</LegendItem>
          <LegendItem state="dim">外れた行</LegendItem>
        </>
      }
    />
  )
}
