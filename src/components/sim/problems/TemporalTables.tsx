import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { LegendItem } from '../views/Legend'
import { RowTable, type RowTableData } from '../views/RowTable'
import type { CellState, Frame } from '../core/types'

type Scheme = 'overwrite' | 'soft' | 'scd2'
type Value = string | number | boolean | null

const CODE: Record<Scheme, string> = {
  overwrite: `-- 2024-01-01 登録
INSERT INTO customer VALUES (1, '東京');
-- 2025-04-01 引っ越し: 古い値の上に書く
UPDATE customer SET address = '大阪' WHERE id = 1;
-- 2026-03-01 退会: 行ごと消す
DELETE FROM customer WHERE id = 1;
-- 2024-12-31 時点の住所は？
SELECT address FROM customer WHERE id = 1;`,
  soft: `-- 2024-01-01 登録
INSERT INTO customer VALUES (1, '東京', NULL);
-- 2025-04-01 引っ越し: 住所は上書き
UPDATE customer SET address = '大阪' WHERE id = 1;
-- 2026-03-01 退会: 消さずに印を付ける
UPDATE customer SET deleted_at = '2026-03-01' WHERE id = 1;
-- 2024-12-31 時点の住所は？
SELECT address FROM customer WHERE id = 1;
-- いまの顧客（全部の問い合わせに条件が要る）
SELECT * FROM customer WHERE deleted_at IS NULL;`,
  scd2: `-- 2024-01-01 登録
INSERT INTO customer_hist (id, address, valid_from) VALUES (1, '東京', '2024-01-01');
-- 2025-04-01 引っ越し: 今の行を閉じて、新しい行を足す
UPDATE customer_hist SET valid_to = '2025-04-01', is_current = false
WHERE id = 1 AND is_current;
INSERT INTO customer_hist (id, address, valid_from) VALUES (1, '大阪', '2025-04-01');
-- 2026-03-01 退会: 今の行を閉じるだけ
UPDATE customer_hist SET valid_to = '2026-03-01', is_current = false
WHERE id = 1 AND is_current;
-- 2024-12-31 時点の住所は？
SELECT address FROM customer_hist
WHERE id = 1 AND valid_from <= '2024-12-31' AND '2024-12-31' < valid_to;`,
}

type R = { key: string; cells: Value[]; state?: CellState }
const table = (scheme: Scheme, rows: R[]): RowTableData => ({
  title: scheme === 'scd2' ? 'customer_hist' : 'customer',
  columns: scheme === 'overwrite' ? ['id', 'address'] : scheme === 'soft' ? ['id', 'address', 'deleted_at'] : ['id', 'address', 'valid_from', 'valid_to', 'is_current'],
  rows: rows.map((r) => ({ key: r.key, cells: r.cells.map((c) => (typeof c === 'boolean' ? String(c) : c)), state: r.state })),
})

function trace(s: Scheme): Frame<RowTableData>[] {
  const frames: Frame<RowTableData>[] = []
  const snap = (line: number | number[], note: string, rows: R[], vars: Frame<RowTableData>['vars'] = {}, done = false) =>
    frames.push({ line, note, view: table(s, rows), vars, done })

  if (s === 'overwrite') {
    snap([1, 2], `登録。行は「いまの状態」を 1 つだけ持つ`, [{ key: '1', cells: [1, '東京'], state: 'good' }], { 行数: 1 })
    snap([3, 4], `引っ越し。'東京' は上書きされて消えた。いつ引っ越したかも残らない`, [{ key: '1', cells: [1, '大阪'], state: 'active' }], { 行数: 1 })
    snap([5, 6], `退会。行ごと消えたので、この顧客がいたこと自体が分からなくなる。注文などから外部キーで参照されていれば、そもそも消せない`, [{ key: '1', cells: [1, '大阪'], state: 'bad' }], { 行数: 0 })
    snap([7, 8], `過去の時点の住所は答えられない。表がいまの状態だけを持つ設計（データウェアハウスの用語では SCD Type 1）の限界`, [], { 答え: 'なし' }, true)
    return frames
  }
  if (s === 'soft') {
    snap([1, 2], `登録。deleted_at が NULL の行が「生きている」行`, [{ key: '1', cells: [1, '東京', null], state: 'good' }], { 行数: 1 })
    snap([3, 4], `引っ越し。住所は上書きなので、論理削除を入れても変更の履歴は残らない`, [{ key: '1', cells: [1, '大阪', null], state: 'active' }], { 行数: 1 })
    snap([5, 6], `退会。行は残り、印だけが付く。外部キーは印を知らないので、退会済みの顧客に新しい注文を付けることも DB は止めない`, [{ key: '1', cells: [1, '大阪', '2026-03-01'], state: 'window' }], { 行数: 1 })
    snap([7, 8], `過去の住所は答えられない（大阪が返る）。論理削除が残すのは「消えた」という事実だけ`, [{ key: '1', cells: [1, '大阪', '2026-03-01'], state: 'bad' }], { 答え: '大阪（誤り）' })
    snap([9, 10], `いまの顧客を数える問い合わせには、すべて deleted_at IS NULL を書き足す。書き忘れると退会者が混ざる。メールアドレスの一意制約も、生きている行だけに絞った部分一意索引に直す必要がある`, [{ key: '1', cells: [1, '大阪', '2026-03-01'], state: 'dim' }], { 答え: '0 件' }, true)
    return frames
  }
  const tokyo = (to: Value, cur: boolean, st?: CellState): R => ({ key: 't', cells: [1, '東京', '2024-01-01', to, cur], state: st })
  const osaka = (to: Value, cur: boolean, st?: CellState): R => ({ key: 'o', cells: [1, '大阪', '2025-04-01', to, cur], state: st })
  snap([1, 2], `登録。valid_to は「まだ終わっていない」を表す infinity、is_current が true`, [tokyo('infinity', true, 'good')], { 行数: 1 })
  snap([3, 4, 5], `引っ越し。いまの行の valid_to を引っ越し日にして閉じる`, [tokyo('2025-04-01', false, 'active')], { 行数: 1 })
  snap(6, `新しい行を足す。書き換えではなく追加なので、東京にいた期間がそのまま残る`, [tokyo('2025-04-01', false), osaka('infinity', true, 'good')], { 行数: 2 })
  snap([7, 8, 9], `退会。いまの行を閉じるだけで、行は消さない。is_current が true の行がなくなる`, [tokyo('2025-04-01', false), osaka('2026-03-01', false, 'active')], { 行数: 2 })
  snap([10, 11, 12], `2024-12-31 を期間に含む行を探すと、東京の行が 1 つ当たる。閉じ忘れや期間の重なりを防ぐには、is_current の部分一意索引や、期間の重なりを禁じる制約（PostgreSQL 18 の WITHOUT OVERLAPS など）を使う`, [tokyo('2025-04-01', false, 'good'), osaka('2026-03-01', false, 'dim')], { 答え: '東京' }, true)
  return frames
}

const PRESETS: { name: string; value: Scheme }[] = [
  { name: '上書きと物理削除', value: 'overwrite' },
  { name: '論理削除', value: 'soft' },
  { name: '履歴の行を足す（SCD Type 2）', value: 'scd2' },
]

export default function TemporalTables() {
  const [s, setS] = useState<Scheme>('overwrite')
  const frames = useMemo(() => trace(s), [s])
  return (
    <SimShell
      title="変わる値をどう残すか"
      subtitle="登録 → 引っ越し → 退会、の 3 つの出来事を 3 つの方式で記録し、「2024 年末の住所は？」と問う"
      code={CODE[s]}
      frames={frames}
      controls={<PresetControl label="方式" presets={PRESETS} onPick={setS} />}
      legend={
        <>
          <LegendItem state="good">足した行・答えの行</LegendItem>
          <LegendItem state="active">書き換えた行</LegendItem>
          <LegendItem state="window">印を付けた行</LegendItem>
          <LegendItem state="bad">失われた・誤った情報</LegendItem>
        </>
      }
    >
      {(f) => <RowTable {...f.view} />}
    </SimShell>
  )
}
