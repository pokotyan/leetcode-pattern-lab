import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { Field, PresetControl } from '../core/Controls'
import { LegendItem } from '../views/Legend'
import { RowTable, type RowTableData } from '../views/RowTable'
import type { CellState, Frame } from '../core/types'

type Scheme = 'sti' | 'cti' | 'concrete'
type Op = 'list' | 'one' | 'broken' | 'newkind'
type Kind = 'card' | 'bank' | 'konbini' | 'wallet'
type Payment = { id: number; kind: Kind; amount: number; extra: string | null }

const COL: Record<Kind, string> = { card: 'last4', bank: 'bank_code', konbini: 'konbini_code', wallet: 'wallet_id' }
const BASE: Payment[] = [
  { id: 1, kind: 'card', amount: 1000, extra: '4242' },
  { id: 2, kind: 'bank', amount: 2000, extra: '0001' },
  { id: 3, kind: 'konbini', amount: 300, extra: 'K-77' },
  { id: 4, kind: 'card', amount: 500, extra: '1111' },
]
const KINDS: Kind[] = ['card', 'bank', 'konbini']

type St = Record<string, CellState>
const k = (table: string, id: number) => `${table}:${id}`

/** 方式ごとに、同じ支払いの集合を表に落とす */
function tables(s: Scheme, ps: Payment[], kinds: Kind[], st: St = {}): RowTableData[] {
  if (s === 'sti') {
    return [
      {
        title: 'payment',
        columns: ['id', 'kind', 'amount', ...kinds.map((x) => COL[x])],
        rows: ps.map((p) => ({
          key: String(p.id),
          cells: [p.id, p.kind, p.amount, ...kinds.map((x) => (x === p.kind ? p.extra : null))],
          state: st[k('payment', p.id)],
        })),
      },
    ]
  }
  if (s === 'cti') {
    return [
      {
        title: 'payment（共通の親）',
        columns: ['id', 'kind', 'amount'],
        rows: ps.map((p) => ({ key: String(p.id), cells: [p.id, p.kind, p.amount], state: st[k('payment', p.id)] })),
      },
      ...kinds.map((x) => ({
        title: `payment_${x}`,
        columns: ['id', COL[x]],
        rows: ps.filter((p) => p.kind === x && p.extra !== null).map((p) => ({ key: String(p.id), cells: [p.id, p.extra], state: st[k(x, p.id)] })),
      })),
    ]
  }
  return kinds.map((x) => ({
    title: `payment_${x}`,
    columns: ['id', 'amount', COL[x]],
    rows: ps.filter((p) => p.kind === x).map((p) => ({ key: String(p.id), cells: [p.id, p.amount, p.extra], state: st[k(x, p.id)] })),
  }))
}

const CODE: Record<Scheme, Record<Op, string>> = {
  sti: {
    list: `SELECT id, kind, amount FROM payment;`,
    one: `SELECT id, amount, last4 FROM payment WHERE kind = 'card';`,
    broken: `INSERT INTO payment (id, kind, amount) VALUES (5, 'card', 800);
-- last4 は bank の行では NULL なので、列に NOT NULL を付けられない
-- 防ぐには種類ごとの CHECK を書く
--   CHECK ((kind = 'card') = (last4 IS NOT NULL))`,
    newkind: `ALTER TABLE payment ADD COLUMN wallet_id text;
INSERT INTO payment (id, kind, amount, wallet_id)
VALUES (5, 'wallet', 700, 'W-9');`,
  },
  cti: {
    list: `SELECT id, kind, amount FROM payment;   -- 共通の列は親にある`,
    one: `SELECT p.id, p.amount, c.last4
FROM payment p JOIN payment_card c USING (id);`,
    broken: `INSERT INTO payment VALUES (5, 'card', 800);
INSERT INTO payment_card (id, last4) VALUES (5, NULL);
-- payment_card.last4 は NOT NULL。子の側で拒否される
-- ただし「親だけあって子がない」行は外部キーでは防げない`,
    newkind: `CREATE TABLE payment_wallet (
  id int PRIMARY KEY REFERENCES payment(id),
  wallet_id text NOT NULL);
INSERT INTO payment VALUES (5, 'wallet', 700);
INSERT INTO payment_wallet VALUES (5, 'W-9');`,
  },
  concrete: {
    list: `SELECT 'card' AS kind, id, amount FROM payment_card
UNION ALL SELECT 'bank', id, amount FROM payment_bank
UNION ALL SELECT 'konbini', id, amount FROM payment_konbini;`,
    one: `SELECT id, amount, last4 FROM payment_card;`,
    broken: `INSERT INTO payment_card (id, amount, last4) VALUES (5, 800, NULL);
-- 種類ごとの表なので last4 に NOT NULL を付けられる`,
    newkind: `CREATE TABLE payment_wallet (
  id int PRIMARY KEY, amount int NOT NULL, wallet_id text NOT NULL);
-- 全種類を読む問い合わせ（UNION ALL）をすべて書き換える`,
  },
}

function trace(s: Scheme, op: Op): Frame<RowTableData[]>[] {
  const frames: Frame<RowTableData[]>[] = []
  const snap = (line: number | number[], note: string, view: RowTableData[], vars: Frame<RowTableData[]>['vars'] = {}, done = false) =>
    frames.push({ line, note, view, vars, done })
  const ps = BASE
  const all = (table: (p: Payment) => string, state: CellState, only?: (p: Payment) => boolean): St =>
    Object.fromEntries(ps.filter(only ?? (() => true)).map((p) => [k(table(p), p.id), state]))
  const names = { sti: '単一テーブル継承', cti: 'クラステーブル継承', concrete: '具象テーブル継承' }[s]
  const count = tables(s, ps, KINDS).length
  snap(1, `${names}。支払い ${ps.length} 件（カード 2、振込 1、コンビニ 1）を ${count} 枚の表で持っている`, tables(s, ps, KINDS), { 表の数: count })

  if (op === 'list') {
    if (s === 'sti') snap(1, `1 枚の表を読むだけ。種類を問わない一覧は単一テーブル継承がいちばん素直`, tables(s, ps, KINDS, all(() => 'payment', 'good')), { 読んだ表: 1 }, true)
    if (s === 'cti') snap(1, `共通の列は親の payment にあるので、一覧は親を読むだけで済む。種類ごとの列まで要るなら子の表を LEFT JOIN する`, tables(s, ps, KINDS, all(() => 'payment', 'good')), { 読んだ表: 1 }, true)
    if (s === 'concrete') snap([1, 2, 3], `「全部の支払い」という表がない。種類の数だけ表を UNION ALL する。id も表ごとの連番なので、種類をまたぐと重複しうる`, tables(s, ps, KINDS, all((p) => p.kind, 'good')), { 読んだ表: 3 }, true)
    return frames
  }

  if (op === 'one') {
    const card = (p: Payment) => p.kind === 'card'
    if (s === 'sti') snap(1, `kind で絞る。ほかの種類の行も同じ表にあるので、索引がなければ全行を読む`, tables(s, ps, KINDS, { ...all(() => 'payment', 'dim'), ...all(() => 'payment', 'good', card) }), { 読んだ表: 1 }, true)
    if (s === 'cti') snap([1, 2], `親と子を id で結合する。amount は親、last4 は子にあるため`, tables(s, ps, KINDS, { ...all(() => 'payment', 'good', card), ...all(() => 'card', 'good', card) }), { 読んだ表: 2 }, true)
    if (s === 'concrete') snap(1, `カードの表を読むだけ。1 種類だけを扱う処理は具象テーブル継承がいちばん速い`, tables(s, ps, KINDS, all(() => 'card', 'good', card)), { 読んだ表: 1 }, true)
    return frames
  }

  if (op === 'broken') {
    const bad: Payment = { id: 5, kind: 'card', amount: 800, extra: null }
    if (s === 'sti') {
      snap(1, `last4 のないカード払いを入れてみる。列ごとの NOT NULL では止められない（振込の行では last4 が NULL であるべきだから）`, tables(s, [...ps, bad], KINDS, { [k('payment', 5)]: 'bad' }), { 入った: 'はい' })
      snap([2, 3, 4], `種類と列の対応を CHECK 制約で書けば DB が拒否する。種類が増えるたびに CHECK も増える。実験では kind = 'card' で last4 が NULL の行、bank_code まで埋めた行の両方が CHECK 違反になった`, tables(s, ps, KINDS), { 入った: 'CHECK があれば拒否' }, true)
    }
    if (s === 'cti') {
      snap(1, `親の行は入る`, tables(s, [...ps, bad], KINDS, { [k('payment', 5)]: 'active' }))
      snap([2, 3], `子の last4 は NOT NULL なので拒否される。種類固有の列に普通の制約を付けられるのが利点`, tables(s, [...ps, bad], KINDS, { [k('payment', 5)]: 'bad' }), { 入った: '子で拒否' })
      snap(4, `ただし親の行だけが残る（子のない card）ことは、外部キーの向きでは防げない。同じトランザクションで両方を入れる、遅延制約やトリガで検査する、といった手当てが要る`, tables(s, [...ps, bad], KINDS, { [k('payment', 5)]: 'bad' }), { 入った: '親だけ残りうる' }, true)
    }
    if (s === 'concrete') snap([1, 2], `種類ごとの表なので last4 に NOT NULL を付けられ、DB が拒否する`, tables(s, ps, KINDS), { 入った: '拒否' }, true)
    return frames
  }

  const w: Payment = { id: 5, kind: 'wallet', amount: 700, extra: 'W-9' }
  const kinds: Kind[] = [...KINDS, 'wallet']
  if (s === 'sti') {
    snap(1, `電子マネーを足す。表に列を 1 本足すと、既存の全行にその列（NULL）ができる。種類が増えるほど NULL だらけの横に広い表になる`, tables(s, ps, kinds, all(() => 'payment', 'window')), { 変えた表: 1 })
    snap([2, 3], `行を入れる`, tables(s, [...ps, w], kinds, { [k('payment', 5)]: 'good' }), { 変えた表: 1 }, true)
  }
  if (s === 'cti') snap([1, 2, 3, 4, 5], `子の表を 1 枚足す。既存の表には触らない。一覧の問い合わせも、親を読む限り変わらない`, tables(s, [...ps, w], kinds, { [k('payment', 5)]: 'good', [k('wallet', 5)]: 'good' }), { 変えた表: 0, 足した表: 1 }, true)
  if (s === 'concrete') snap([1, 2, 3], `表を 1 枚足すのは簡単だが、「全種類を読む」問い合わせを探して UNION ALL を 1 本ずつ足して回る必要がある。共通の列（amount）の型を変えるときも全部の表を直す`, tables(s, [...ps, w], kinds, { [k('wallet', 5)]: 'good' }), { 変えた表: 0, 直す問い合わせ: '全部' }, true)
  return frames
}

const OPS: { name: string; value: Op }[] = [
  { name: '全種類の一覧', value: 'list' },
  { name: 'カードだけ', value: 'one' },
  { name: '必須の値が欠けた行', value: 'broken' },
  { name: '種類を足す', value: 'newkind' },
]
const SCHEMES: { label: string; value: Scheme }[] = [
  { label: '単一テーブル継承', value: 'sti' },
  { label: 'クラステーブル継承', value: 'cti' },
  { label: '具象テーブル継承', value: 'concrete' },
]

export default function InheritanceTables() {
  const [scheme, setScheme] = useState<Scheme>('sti')
  const [op, setOp] = useState<Op>('list')
  const frames = useMemo(() => trace(scheme, op), [scheme, op])
  return (
    <SimShell
      title="継承を表に載せる 3 つの方式"
      subtitle="カード・振込・コンビニの 3 種類の支払いを、1 枚の表／親と子の表／種類ごとの表で持つ"
      code={CODE[scheme][op]}
      frames={frames}
      controls={
        <>
          <Field label="方式">
            <select
              value={scheme}
              onChange={(e) => setScheme(e.target.value as Scheme)}
              className="rounded border px-1.5 py-1 font-mono text-xs"
              style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--fg)' }}
            >
              {SCHEMES.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          </Field>
          <PresetControl label="操作" presets={OPS} onPick={setOp} />
        </>
      }
      legend={
        <>
          <LegendItem state="good">読んだ・入った行</LegendItem>
          <LegendItem state="window">形が変わった行</LegendItem>
          <LegendItem state="bad">壊れた行・拒否された行</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="grid gap-3 sm:grid-cols-2">
          {f.view.map((t) => (
            <RowTable key={t.title} {...t} />
          ))}
        </div>
      )}
    </SimShell>
  )
}
