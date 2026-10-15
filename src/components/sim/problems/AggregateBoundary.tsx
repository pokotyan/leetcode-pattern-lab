import { LegendItem } from '../views/Legend'
import { Steps, TablesSim, table, type Scenario } from '../views/TablesSim'

type V = string | number | null
const ORDER: V[] = ['O1', 'placed', 9000, 1]
const LINES: V[][] = [
  ['O1', 1, 'シャツ', 3000],
  ['O1', 2, '靴', 6000],
]
const orderT = (row: V[], st?: 'good' | 'bad' | 'active', prev?: V[]) => table('orders（集約の根）', ['id', 'status', 'total', 'version'], [row], () => st, () => prev)
const linesT = (rows: V[][], hot?: number, st: 'good' | 'bad' | 'active' = 'good') => table('order_lines（集約の内側）', ['order_id', 'line_no', 'product', 'amount'], rows, (r) => (r[1] === hot ? st : undefined))

const SCENARIOS: Scenario[] = [
  {
    name: '根を通して明細を足す',
    code: `class Order {
  addLine(product: string, amount: number): Result<void, OrderError> {
    if (this.status !== 'placed') return err('確定後は変更できない')
    if (this.total + amount > 10000) return err('1 件の注文は 1 万円まで')
    this.lines.push({ product, amount })
    this.total += amount
    return ok()
  }
}
// 呼ぶ側: 読み込み → 根のメソッドを呼ぶ → まとめて保存
const order = await repo.find('O1')
order.addLine('帽子', 2000)
await repo.save(order)`,
    frames: () => {
      const s = new Steps()
      s.push([11], `注文 O1 と、その明細を 1 つのまとまり（集約）として読み込む。外から触ってよいのは根の Order だけ`, [orderT(ORDER), linesT(LINES)], { 合計: 9000 })
      s.push([2, 4, 12], `帽子 2000 円を足そうとする。根の addLine が「1 件 1 万円まで」を確かめる。9000 + 2000 = 11000 なので拒否`, [orderT(ORDER, 'bad'), linesT(LINES)], { 合計: 9000, 結果: '拒否' })
      const lines2 = [...LINES, ['O1', 3, '靴下', 500]]
      s.push([2, 4, 5, 6, 7, 13], `靴下 500 円なら通る。明細を足し、合計も同じ操作の中で直す。保存は集約ごと 1 つのトランザクションで行うので、明細と合計が食い違った状態は外から見えない`, [orderT(['O1', 'placed', 9500, 2], 'active', ORDER), linesT(lines2, 3)], { 合計: 9500, 結果: '追加' })
      return s.done()
    },
  },
  {
    name: '明細の表へ直接書き込む',
    code: `// 別の機能が、集約を通さずに明細だけを足した
INSERT INTO order_lines (order_id, line_no, product, amount)
VALUES ('O1', 3, '帽子', 2000);`,
    frames: () => {
      const s = new Steps()
      s.push(1, `集約を通さずに明細の表へ直接書き込む処理があったとする`, [orderT(ORDER), linesT(LINES)], { 合計: 9000 })
      const lines2 = [...LINES, ['O1', 3, '帽子', 2000]]
      const sum = lines2.reduce((a, r) => a + (r[3] as number), 0)
      s.push([2, 3], `書き込みは成功する。明細の合計は ${sum} 円で 1 万円を超え、orders.total（9000）とも食い違う。規則を守る場所が根の 1 か所に決まっていれば、こうした抜け道を作らないように約束できる`, [orderT(ORDER, 'bad'), linesT(lines2, 3, 'bad')], { 明細の合計: sum, 'orders.total': 9000 })
      return s.done()
    },
  },
  {
    name: '2 人が同時に明細を足す',
    code: `-- A と B が同じ O1（version 1）を読み、それぞれ 800 円の明細を足す
UPDATE orders SET total = :new_total, version = version + 1
WHERE id = 'O1' AND version = 1;     -- 読んだときの版と一致するときだけ`,
    frames: () => {
      const s = new Steps()
      s.push(1, `A と B が同時に O1 を読む。どちらも合計 9000、version 1 を見ている。どちらの 800 円も、それだけなら 1 万円以内に収まる`, [orderT(ORDER), linesT(LINES)], { A: '読んだ', B: '読んだ' })
      s.push([2, 3], `A が先に保存する。version が 1 のままなので更新でき、2 になる`, [orderT(['O1', 'placed', 9800, 2], 'active', ORDER), linesT([...LINES, ['O1', 3, 'A の品', 800]], 3)], { A: '保存', B: '読んだ' })
      s.push([2, 3], `B も保存しようとするが、version はもう 2。WHERE version = 1 に当たる行がなく 0 行の更新になり、B は失敗を受け取る。B が読み直せば 9800 + 800 = 10600 で、規則に反すると分かる。集約を「同時に変更してはいけない範囲」として、版で守る`, [orderT(['O1', 'placed', 9800, 2], 'bad'), linesT([...LINES, ['O1', 3, 'A の品', 800]])], { A: '保存', B: '0 行・やり直し' })
      return s.done()
    },
  },
]

export default function AggregateBoundary() {
  return (
    <TablesSim
      title="集約（一緒に守る範囲）"
      subtitle="「1 件の注文は 1 万円まで」という規則を、注文と明細のまとまりの根で守る"
      scenarios={SCENARIOS}
      lang="ts"
      legend={
        <>
          <LegendItem state="active">書き換えた行</LegendItem>
          <LegendItem state="good">足した行</LegendItem>
          <LegendItem state="bad">規則に反した・拒否された</LegendItem>
        </>
      }
    />
  )
}
