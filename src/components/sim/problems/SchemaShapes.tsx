import { LegendItem } from '../views/Legend'
import { Steps, TablesSim, table, type Scenario } from '../views/TablesSim'
import type { RowTableData } from '../views/RowTable'

type V = string | number
const CATS: V[][] = [
  [10, '衣料'],
  [20, '食品'],
]
const PRODS: V[][] = [
  [1, 'シャツ', 10],
  [2, '靴', 10],
  [3, 'コーヒー', 20],
]
const SALES: V[][] = [
  [101, 1, 6000],
  [102, 3, 1500],
  [103, 2, 9000],
  [104, 1, 3000],
  [105, 3, 2000],
]
const catName = (k: V, cats = CATS) => cats.find((c) => c[0] === k)![1]!
const prod = (k: V) => PRODS.find((p) => p[0] === k)!

type Paint = { cat?: (r: V[]) => 'good' | 'active' | 'window' | undefined; prod?: (r: V[]) => 'good' | 'active' | 'window' | undefined; fact?: (r: V[]) => 'good' | 'active' | 'window' | undefined }

function star(p: Paint = {}, cats = CATS): RowTableData[] {
  return [
    table('スター: fct_sales', ['sale_id', 'product_key', 'amount'], SALES, p.fact),
    table('スター: dim_product（分類名まで平らに持つ）', ['product_key', 'name', 'category'], PRODS.map((r) => [r[0]!, r[1]!, catName(r[2]!, cats)]), p.prod),
  ]
}
function snow(p: Paint = {}, cats = CATS): RowTableData[] {
  return [
    table('スノーフレーク: fct_sales', ['sale_id', 'product_key', 'amount'], SALES, p.fact),
    table('スノーフレーク: dim_product', ['product_key', 'name', 'category_key'], PRODS, p.prod),
    table('スノーフレーク: dim_category', ['category_key', 'category'], cats, p.cat),
  ]
}
function obt(p: Paint = {}, cats = CATS): RowTableData[] {
  return [table('1 枚の大きな表（One Big Table）', ['sale_id', 'product', 'category', 'amount'], SALES.map((s) => [s[0]!, prod(s[1]!)[1]!, catName(prod(s[1]!)[2]!, cats), s[2]!]), p.fact)]
}

const total = (cat: V) => SALES.filter((s) => prod(s[1]!)[2] === cat).reduce((a, s) => a + (s[2] as number), 0)
const result = () => table('結果', ['category', 'amount'], CATS.map((c) => [c[1]!, total(c[0]!)]), () => 'good')

const SCENARIOS: Scenario[] = [
  {
    name: 'カテゴリ別の売上',
    code: `-- スター: 結合 1 回
SELECT p.category, sum(f.amount) FROM fct_sales f
JOIN dim_product p USING (product_key) GROUP BY 1;
-- スノーフレーク: 結合 2 回
SELECT c.category, sum(f.amount) FROM fct_sales f
JOIN dim_product p USING (product_key)
JOIN dim_category c USING (category_key) GROUP BY 1;
-- One Big Table: 結合なし
SELECT category, sum(amount) FROM sales_wide GROUP BY 1;`,
    frames: () => {
      const s = new Steps()
      const w = () => 'window' as const
      s.push([1, 2, 3], `スター: ファクトから商品のディメンションを 1 回引けば、カテゴリ名がそこにある`, [...star({ fact: w, prod: w }), result()], { スターの結合: 1 })
      s.push([4, 5, 6, 7], `スノーフレーク: 商品の表はカテゴリの番号しか持たない。カテゴリ名を得るのにもう 1 回結合する。ディメンションを正規化した分、結合が増える`, [...snow({ fact: w, prod: w, cat: w }), result()], { スノーフレークの結合: 2 })
      s.push([8, 9], `One Big Table: 名前まで全部がファクトの行に入っている。結合はいらない。列指向の DB では、使わない列を読まずに済むので、横に広い表の不利が小さい`, [...obt({ fact: w }), result()], { 'OBT の結合': 0 })
      return s.done()
    },
  },
  {
    name: 'カテゴリ名を変える',
    code: `-- 「衣料」を「アパレル」に改名する
-- スター: その分類の商品の行すべて
UPDATE dim_product SET category = 'アパレル' WHERE category = '衣料';
-- スノーフレーク: 分類の行 1 つ
UPDATE dim_category SET category = 'アパレル' WHERE category_key = 10;
-- One Big Table: その分類の売上の行すべて（または表を作り直す）
UPDATE sales_wide SET category = 'アパレル' WHERE category = '衣料';`,
    frames: () => {
      const s = new Steps()
      const renamed: V[][] = [[10, 'アパレル'], [20, '食品']]
      const isCloth = (pk: V) => prod(pk)[2] === 10
      s.push([2, 3], `スター: 衣料の商品 ${PRODS.filter((p) => p[2] === 10).length} 行を書き換える。商品が何万あってもディメンションの大きさの範囲で済む`, star({ prod: (r) => (r[2] === 'アパレル' ? 'active' : undefined) }, renamed), { スターで書いた行: PRODS.filter((p) => p[2] === 10).length })
      s.push([4, 5], `スノーフレーク: 分類名は 1 か所にしかないので 1 行で済む。正規化の利点はここに出る`, snow({ cat: (r) => (r[0] === 10 ? 'active' : undefined) }, renamed), { スノーフレークで書いた行: 1 })
      const n = SALES.filter((x) => isCloth(x[1]!)).length
      s.push([6, 7], `One Big Table: 衣料の売上の行 ${n} 行すべてに名前が複製されている。実務では差分を UPDATE するより、上流の表から作り直すのが普通。作り直す仕組み（dbt のモデルなど）があることが、この形を選ぶ前提になる`, obt({ fact: (r) => (r[2] === 'アパレル' ? 'active' : undefined) }, renamed), { 'OBT で書いた行': n })
      return s.done()
    },
  },
]

export default function SchemaShapes() {
  return (
    <TablesSim
      title="スター、スノーフレーク、One Big Table"
      subtitle="同じ販売データを 3 つの形で持ち、集計と改名にかかる手間を比べる"
      scenarios={SCENARIOS}
      columns={2}
      legend={
        <>
          <LegendItem state="window">結合で読む表</LegendItem>
          <LegendItem state="active">書き換えた行</LegendItem>
          <LegendItem state="good">結果</LegendItem>
        </>
      }
    />
  )
}
