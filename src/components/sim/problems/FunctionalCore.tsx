import { LegendItem } from '../views/Legend'
import { Steps, TablesSim, table, type Scenario } from '../views/TablesSim'

type V = string | number
type Op = [number, string, '入出力' | '計算']
const MIXED: Op[] = [
  [3, 'db.findSubscription(userId)', '入出力'],
  [4, 'new Date()', '入出力'],
  [5, '期限切れか判定', '計算'],
  [6, 'payment.charge(…)', '入出力'],
  [7, '次の期限を計算', '計算'],
  [8, 'db.update(…)', '入出力'],
  [9, 'mailer.send(…)', '入出力'],
]

const SCENARIOS: Scenario[] = [
  {
    name: '入出力と計算が混ざった関数',
    code: `// 定期購読の更新処理
async function renew(userId: string) {
  const sub = await db.findSubscription(userId)
  const now = new Date()
  if (sub.expiresAt > now) return
  await payment.charge(sub.cardId, sub.plan.price)
  const next = addMonths(sub.expiresAt, 1)
  await db.update(userId, { expiresAt: next })
  await mailer.send(sub.email, '更新しました')
}`,
    frames: () => {
      const s = new Steps()
      const rows = (upTo: number) => MIXED.slice(0, upTo).map((o) => [o[0], o[1], o[2]] as V[])
      const paint = (r: V[]) => (r[2] === '入出力' ? 'window' : 'good') as 'window' | 'good'
      for (let i = 1; i <= MIXED.length; i++) {
        s.push(MIXED[i - 1]![0], i === MIXED.length ? `判断（計算）は 2 か所だけで、残りの 5 か所は DB・時計・決済・メールとのやり取り。それらが 1 つの関数の中に交互に並んでいる` : `${MIXED[i - 1]![1]}（${MIXED[i - 1]![2]}）`, [table('この関数がすること', ['行', '処理', '種類'], rows(i), paint)], { 入出力: rows(i).filter((r) => r[2] === '入出力').length, 計算: rows(i).filter((r) => r[2] === '計算').length })
      }
      s.push([2], `「期限前なら何もしない」という規則 1 つを試すのにも、DB・決済・メールの偽物を 3 つ用意し、時計も止める必要がある。規則が入出力の手順に埋もれているため`, [table('テストに要る偽物', ['相手', '理由'], [['db', '購読を返す・更新を受ける'], ['payment', '課金を受ける'], ['mailer', '送信を受ける'], ['時計', 'now を固定する']], () => 'bad')], { テストに要る偽物: 4 })
      return s.done()
    },
  },
  {
    name: '計算を芯に、入出力を外側に',
    code: `// 芯: 入出力をしない。値を受け取り、何をすべきかを値で返す
type Decision =
  | { kind: 'skip' }
  | { kind: 'renew'; charge: number; nextExpiresAt: Date }

function decideRenewal(sub: Subscription, now: Date): Decision {
  if (sub.expiresAt > now) return { kind: 'skip' }
  return { kind: 'renew', charge: sub.plan.price, nextExpiresAt: addMonths(sub.expiresAt, 1) }
}

// 殻: 読む → 芯に決めさせる → 決まったことを実行する
async function renew(userId: string) {
  const d = decideRenewal(await db.findSubscription(userId), new Date())
  if (d.kind === 'skip') return
  await payment.charge(…, d.charge); await db.update(…); await mailer.send(…)
}`,
    frames: () => {
      const s = new Steps()
      s.push([2, 3, 4, 6, 7, 8, 9], `判断だけを取り出し、入力（購読と現在時刻）から「何をすべきか」を値で返す純粋な関数にする。この関数は DB にもネットワークにも触れない`, [table('芯（decideRenewal）', ['入力', '出力'], [['期限が未来', "{ kind: 'skip' }"], ['期限が過去', "{ kind: 'renew', charge, nextExpiresAt }"]], () => 'good')], { 芯の入出力: 0 })
      s.push([12, 13, 14, 15, 16], `殻（renew）は、読む・芯を呼ぶ・結果に従って書く、を並べるだけ。分岐はほとんど持たない。殻は結合テストで 1〜2 本、芯は入力と出力の表で何本でも速く試せる`, [table('テストの分担', ['対象', '要るもの', '数'], [['decideRenewal', 'なし（値だけ）', '多い'], ['renew', 'DB・決済・メールの偽物', '少ない']], (r) => (r[0] === 'decideRenewal' ? 'good' : 'window'))], { テストに要る偽物: '芯は 0' })
      return s.done()
    },
  },
]

export default function FunctionalCore() {
  return (
    <TablesSim
      title="計算の芯と、入出力の殻"
      subtitle="定期購読の更新処理を、入出力と判断が混ざった形と、判断だけを純粋な関数に取り出した形で比べる"
      scenarios={SCENARIOS}
      lang="ts"
      legend={
        <>
          <LegendItem state="window">入出力（DB・時計・外部サービス）</LegendItem>
          <LegendItem state="good">計算（値から値）</LegendItem>
          <LegendItem state="bad">テストのために用意するもの</LegendItem>
        </>
      }
    />
  )
}
