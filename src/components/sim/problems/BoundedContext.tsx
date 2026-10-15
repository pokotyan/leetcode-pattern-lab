import { LegendItem } from '../views/Legend'
import { Steps, TablesSim, table, type Scenario } from '../views/TablesSim'

type V = string | number | null
const BIG: V[][] = [['P1', 'マグカップ', '陶器の…', 1200, 35, 'A-3-2', 320, '60サイズ']]
const BIG_COLS = ['id', 'name', 'description', 'price', 'stock', 'location', 'weight_g', 'box']

const SCENARIOS: Scenario[] = [
  {
    name: '1 つの「商品」にまとめる',
    code: `type Product = {
  id: string
  name: string; description: string; price: number      // 販売の関心
  stock: number; location: string                        // 在庫の関心
  weightG: number; box: string                           // 配送の関心
}`,
    frames: () => {
      const s = new Steps()
      s.push([1, 2, 3, 4, 5], `販売・在庫・配送のチームが、同じ Product という 1 つの型と表を使う`, [table('product', BIG_COLS, BIG)])
      s.push(4, `在庫チームが「同じ商品を複数の倉庫に置く」ようにしたい。stock と location は 1 つずつしか持てないので、型と表の形を変える。その変更は Product を使う販売や配送のコードにも及ぶ。誰の都合で項目が増えたのかも、時間とともに分からなくなる`, [table('product', BIG_COLS, BIG, () => 'bad')], { 影響するチーム: 3 })
      return s.done()
    },
  },
  {
    name: '文脈ごとに分ける',
    code: `// 販売の文脈
type CatalogItem = { productId: string; name: string; description: string; price: number }
// 在庫の文脈: 「商品」ではなく「在庫の単位」として扱う
type StockItem = { productId: string; warehouse: string; location: string; quantity: number }
// 配送の文脈
type Parcel = { productId: string; weightG: number; box: string }`,
    frames: () => {
      const s = new Steps()
      const cat = table('販売: catalog_item', ['product_id', 'name', 'description', 'price'], [['P1', 'マグカップ', '陶器の…', 1200]])
      const stock = (rows: V[][], hot = false) => table('在庫: stock_item', ['product_id', 'warehouse', 'location', 'quantity'], rows, () => (hot ? 'good' : undefined))
      const parcel = table('配送: parcel', ['product_id', 'weight_g', 'box'], [['P1', 320, '60サイズ']])
      s.push([1, 2, 3, 4, 5, 6], `同じ P1 を、文脈ごとに別のモデルで持つ。共有するのは ID だけ。「商品」という言葉が、販売では売る物、在庫では棚に置く単位、配送では箱に入れる荷物を指す`, [cat, stock([['P1', '東京', 'A-3-2', 35]]), parcel])
      s.push([3, 4], `複数の倉庫に置くように変えても、変わるのは在庫の文脈の中だけ。販売と配送のモデルには触れない`, [cat, stock([['P1', '東京', 'A-3-2', 20], ['P1', '大阪', 'B-1-7', 15]], true), parcel], { 影響するチーム: 1 })
      return s.done()
    },
  },
  {
    name: '外のシステムの言葉を翻訳する',
    code: `// 配送会社の API が返す形（相手の都合で決まっている）
type CarrierStatus = { cd: '01' | '02' | '09'; ts: string }

// 腐敗防止層: 外の言葉を、自分の文脈の言葉に訳してから中へ入れる
function toShipment(s: CarrierStatus): ShipmentEvent {
  switch (s.cd) {
    case '01': return { kind: 'pickedUp', at: new Date(s.ts) }
    case '02': return { kind: 'delivered', at: new Date(s.ts) }
    case '09': return { kind: 'returned', at: new Date(s.ts) }
  }
}`,
    frames: () => {
      const s = new Steps()
      const raw: V[][] = [['01', '2025-01-05T10:00'], ['02', '2025-01-06T14:30']]
      s.push([1, 2], `配送会社から届く状態は、コード値 cd と時刻の文字列。これをそのまま中で使うと、'02' が何を意味するかの知識が、コードのあちこちに広がる`, [table('配送会社の API の返り値', ['cd', 'ts'], raw, () => 'window')])
      s.push([4, 5, 6, 7, 8, 9], `境界に置いた関数 1 か所で、自分の文脈の言葉（pickedUp・delivered）と型に訳す。配送会社がコード体系を変えても、直すのはこの関数だけ`, [table('配送の文脈に入る出来事', ['kind', 'at'], [['pickedUp', '2025-01-05 10:00'], ['delivered', '2025-01-06 14:30']], () => 'good')])
      return s.done()
    },
  },
]

export default function BoundedContext() {
  return (
    <TablesSim
      title="境界づけられたコンテキスト"
      subtitle="同じ「商品」でも、販売・在庫・配送で関心が違う。1 つのモデルにまとめる場合と、文脈ごとに分ける場合"
      scenarios={SCENARIOS}
      columns={2}
      lang="ts"
      legend={
        <>
          <LegendItem state="window">外から届いた形のまま</LegendItem>
          <LegendItem state="good">変更が収まった範囲・訳した結果</LegendItem>
          <LegendItem state="bad">変更が広く及ぶ所</LegendItem>
        </>
      }
    />
  )
}
