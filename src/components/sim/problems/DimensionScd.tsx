import { LegendItem } from '../views/Legend'
import { Steps, TablesSim, table, type Scenario } from '../views/TablesSim'

type V = string | number | null
const report = (rows: V[][], dim: V[][], keyIdx: number, regionIdx: number) => {
  const g = new Map<string, number>()
  for (const f of rows) {
    const d = dim.find((x) => x[keyIdx] === f[1])!
    g.set(d[regionIdx] as string, (g.get(d[regionIdx] as string) ?? 0) + (f[2] as number))
  }
  return [...g].sort().map(([k, v]) => [k, v])
}

const SCENARIOS: Scenario[] = [
  {
    name: 'Type 1（上書き）',
    code: `-- 顧客 A が 2/1 に東京から大阪へ転居した
UPDATE dim_customer SET region = '大阪' WHERE customer_id = 'A';

SELECT c.region, sum(f.amount)
FROM fct_sales f JOIN dim_customer c USING (customer_id)
GROUP BY c.region;`,
    frames: () => {
      const s = new Steps()
      const dim: V[][] = [['A', '東京'], ['B', '東京']]
      const fact: V[][] = [['01-10', 'A', 1000], ['01-15', 'B', 500], ['02-10', 'A', 2000]]
      const before = report(fact.slice(0, 2), dim, 0, 1)
      s.push([5, 6, 7], `1 月末の時点の地域別売上。東京 ${before[0]![1]}`, [table('dim_customer', ['customer_id', 'region'], dim), table('fct_sales', ['day', 'customer_id', 'amount'], fact.slice(0, 2)), table('地域別売上（1 月末に出したもの）', ['region', 'amount'], before, () => 'good')])
      const dim2: V[][] = [['A', '大阪'], ['B', '東京']]
      s.push([1, 2], `A の地域を上書きする。ディメンションの行は 1 つのまま`, [table('dim_customer', ['customer_id', 'region'], dim2, (r) => (r[0] === 'A' ? 'active' : undefined), (r) => (r[0] === 'A' ? ['A', '東京'] : undefined)), table('fct_sales', ['day', 'customer_id', 'amount'], fact)])
      const after = report(fact, dim2, 0, 1)
      s.push([4, 5, 6, 7], `同じ問い合わせを 2 月末に流すと、A が 1 月に東京で買った 1000 まで大阪に移る。1 月末に出した数字と、いま出す 1 月の数字が食い違う。現在の属性で過去を見たいなら、これが正しい答えになる`, [table('fct_sales', ['day', 'customer_id', 'amount'], fact, (r) => (r[1] === 'A' ? 'bad' : undefined)), table('地域別売上（2 月末）', ['region', 'amount'], after, () => 'bad')])
      return s.done()
    },
  },
  {
    name: 'Type 2（行を足す）',
    code: `-- 代理キー customer_key で版を区別する
UPDATE dim_customer SET valid_to = '02-01', is_current = false
WHERE customer_id = 'A' AND is_current;
INSERT INTO dim_customer VALUES (3, 'A', '大阪', '02-01', NULL, true);

-- ファクトは、売れた時点で有効だった版の customer_key を持つ
SELECT c.region, sum(f.amount)
FROM fct_sales f JOIN dim_customer c USING (customer_key)
GROUP BY c.region;`,
    frames: () => {
      const s = new Steps()
      const cols = ['customer_key', 'customer_id', 'region', 'valid_from', 'valid_to', 'is_current']
      const d1: V[][] = [[1, 'A', '東京', '01-01', null, 'true'], [2, 'B', '東京', '01-01', null, 'true']]
      s.push(1, `業務上の ID（customer_id）とは別に、版ごとの番号 customer_key（代理キー）を振る`, [table('dim_customer', cols, d1)])
      const d2: V[][] = [[1, 'A', '東京', '01-01', '02-01', 'false'], [2, 'B', '東京', '01-01', null, 'true'], [3, 'A', '大阪', '02-01', null, 'true']]
      s.push([2, 3, 4], `転居で、いまの版を閉じて新しい版を足す。A の行が 2 つになる`, [table('dim_customer', cols, d2, (r) => (r[0] === 1 ? 'active' : r[0] === 3 ? 'good' : undefined), (r) => (r[0] === 1 ? d1[0] : undefined))])
      const fact: V[][] = [['01-10', 1, 1000], ['01-15', 2, 500], ['02-10', 3, 2000]]
      s.push(6, `ファクトを読み込むときに、その日に有効だった版の customer_key を引いて入れる。1/10 の売上は 1、2/10 の売上は 3`, [table('fct_sales', ['day', 'customer_key', 'amount'], fact, (r) => (r[1] === 1 || r[1] === 3 ? 'good' : undefined)), table('dim_customer', cols, d2)])
      const out = report(fact, d2, 0, 2)
      s.push([7, 8, 9], `地域別売上は、売れた時点の地域で数えられる。1 月の数字は 2 月末に出しても変わらない。「いまの地域で過去を見たい」ときは customer_id で is_current の版に結合し直す`, [table('地域別売上（2 月末）', ['region', 'amount'], out, () => 'good')])
      return s.done()
    },
  },
]

export default function DimensionScd() {
  return (
    <TablesSim
      title="ディメンションの属性が変わったとき、過去の集計はどうなるか"
      subtitle="顧客 A が東京から大阪へ転居した。上書き（Type 1）と、版を足す（Type 2）で地域別売上を比べる"
      scenarios={SCENARIOS}
      label="方式"
      legend={
        <>
          <LegendItem state="active">書き換えた行</LegendItem>
          <LegendItem state="good">足した行・結果</LegendItem>
          <LegendItem state="bad">数字が変わってしまった所</LegendItem>
        </>
      }
    />
  )
}
