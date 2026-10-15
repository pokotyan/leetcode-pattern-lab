import { LegendItem } from '../views/Legend'
import { Steps, TablesSim, table, type Scenario } from '../views/TablesSim'
import type { CellState } from '../core/types'

type V = string | number
// customer, days_ago, amount
const ORDERS: [string, number, number][] = [
  ['c1', 3, 12000], ['c1', 20, 8000], ['c1', 45, 15000], ['c1', 80, 5000],
  ['c2', 200, 3000],
  ['c3', 10, 2000], ['c3', 30, 2500],
  ['c4', 60, 40000], ['c4', 150, 35000],
  ['c5', 5, 1500], ['c5', 12, 1800], ['c5', 25, 1200], ['c5', 40, 900], ['c5', 70, 1100],
  ['c6', 300, 9000],
  ['c7', 15, 6000],
  ['c8', 90, 2000], ['c8', 120, 2200],
  ['c9', 7, 22000], ['c9', 35, 18000], ['c9', 65, 25000],
  ['c10', 250, 500],
]

/** n 個を値の大きい順に k 段へ等分する（NTILE と同じ割り方: 端数は上の段から 1 つずつ多く持つ） */
function ntile<T>(xs: T[], k: number, by: (x: T) => number): Map<T, number> {
  const sorted = [...xs].sort((a, b) => by(b) - by(a))
  const out = new Map<T, number>()
  const base = Math.floor(sorted.length / k)
  const extra = sorted.length % k
  let i = 0
  for (let t = 1; t <= k; t++) {
    const size = base + (t <= extra ? 1 : 0)
    for (let j = 0; j < size; j++) out.set(sorted[i++]!, t)
  }
  return out
}

const CUSTOMERS = [...new Set(ORDERS.map((o) => o[0]))]
const AGG = CUSTOMERS.map((c) => {
  const os = ORDERS.filter((o) => o[0] === c)
  return { c, r: Math.min(...os.map((o) => o[1])), f: os.length, m: os.reduce((a, o) => a + o[2], 0) }
})
type Agg = (typeof AGG)[number]

const SCENARIOS: Scenario[] = [
  {
    name: 'デシル分析',
    code: `SELECT customer_id, sum(amount) AS m,
  NTILE(10) OVER (ORDER BY sum(amount) DESC) AS decile
FROM fct_orders
WHERE order_date >= current_date - 365
GROUP BY customer_id;`,
    frames: () => {
      const s = new Steps()
      s.push(4, `直近 1 年の注文 ${ORDERS.length} 行。1 行 = 注文 1 件`, [table('fct_orders', ['customer_id', '何日前', 'amount'], ORDERS, () => 'window')])
      s.push([1, 5], `顧客ごとに購入額を合計する（粒度を注文から顧客へ粗くする）`, [table('顧客ごとの合計', ['customer_id', 'm'], AGG.map((a) => [a.c, a.m]), () => 'good')])
      const dec = ntile(AGG, 10, (a) => a.m)
      const rows = [...AGG].sort((a, b) => b.m - a.m).map((a) => [a.c, a.m, dec.get(a)!])
      const top = rows.slice(0, 2).reduce((x, r) => x + (r[1] as number), 0)
      const all = rows.reduce((x, r) => x + (r[1] as number), 0)
      s.push([2, 3], `購入額の多い順に 10 等分して番号を振る。顧客 10 人なので 1 人ずつ。上位 2 人で売上の ${Math.round((top / all) * 100)}% を占める。売上が一部の顧客に偏っているかを、この表から読む`, [table('デシル', ['customer_id', 'm', 'decile'], rows, (r) => ((r[2] as number) <= 2 ? 'good' : undefined))], { 上位2割の売上比: `${Math.round((top / all) * 100)}%` })
      return s.done()
    },
  },
  {
    name: 'RFM 分析',
    code: `WITH c AS (
  SELECT customer_id,
    min(current_date - order_date) AS r,   -- 最後に買ってから何日
    count(*)                       AS f,   -- 何回買ったか
    sum(amount)                    AS m    -- いくら買ったか
  FROM fct_orders GROUP BY customer_id
)
SELECT customer_id,                           -- 5 が最もよい
  6 - NTILE(5) OVER (ORDER BY r ASC)  AS r_score,
  6 - NTILE(5) OVER (ORDER BY f DESC) AS f_score,
  6 - NTILE(5) OVER (ORDER BY m DESC) AS m_score
FROM c;`,
    frames: () => {
      const s = new Steps()
      s.push([1, 2, 3, 4, 5, 6, 7], `顧客ごとに 3 つの値を作る。R（最後の購入から何日）、F（回数）、M（金額）`, [table('顧客ごとの R・F・M', ['customer_id', 'r（日）', 'f（回）', 'm（円）'], AGG.map((a) => [a.c, a.r, a.f, a.m]), () => 'good')])
      const score = (t: Map<Agg, number>, a: Agg) => 6 - t.get(a)!
      const R = ntile(AGG, 5, (a) => -a.r)
      const F = ntile(AGG, 5, (a) => a.f)
      const M = ntile(AGG, 5, (a) => a.m)
      const rows: V[][] = AGG.map((a) => [a.c, score(R, a), score(F, a), score(M, a)])
      const seg = (r: V[]): string => {
        const [rs, fs, ms] = [r[1] as number, r[2] as number, r[3] as number]
        if (rs >= 4 && fs >= 4) return '優良'
        if (rs <= 2 && (fs >= 3 || ms >= 4)) return '離反の恐れ'
        if (rs >= 4 && fs <= 2) return '新規・浅い'
        if (rs <= 2) return '休眠'
        return '中間'
      }
      const paint = (r: V[]): CellState | undefined => (seg(r) === '優良' ? 'good' : seg(r) === '離反の恐れ' ? 'bad' : undefined)
      s.push([9, 10, 11, 12, 13], `それぞれを 5 段に分けて点にする（5 が最もよい）。順位で分けるので、金額の単位や外れ値に左右されにくい`, [table('R・F・M の点', ['customer_id', 'R', 'F', 'M'], rows)])
      s.push([9, 10, 11, 12, 13], `点の組み合わせで顧客を分ける。最近よく買う人（R・F が高い）は「優良」、以前はよく買ったが最近来ない人（R が低く F か M が高い）は「離反の恐れ」。分け方の境目は業務で決めるもので、決まった正解はない`, [table('区分', ['customer_id', 'R', 'F', 'M', '区分'], rows.map((r) => [...r, seg(r)]), paint)])
      return s.done()
    },
  },
]

export default function RfmDecile() {
  return (
    <TablesSim
      title="デシル分析と RFM 分析"
      subtitle="注文のファクトから、顧客を購入額や買い方で段に分ける"
      scenarios={SCENARIOS}
      legend={
        <>
          <LegendItem state="window">元の行</LegendItem>
          <LegendItem state="good">注目する顧客</LegendItem>
          <LegendItem state="bad">手を打ちたい顧客</LegendItem>
        </>
      }
    />
  )
}
