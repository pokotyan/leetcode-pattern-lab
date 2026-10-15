import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { LegendItem } from '../views/Legend'
import { RowTable, type Row, type RowTableData } from '../views/RowTable'
import type { CellState, Frame } from '../core/types'

type Value = string | number | null
type Product = { id: number; name: string; attrs: Record<string, number | string> }

const ATTRS = ['色', 'サイズ', '重さ', '容量'] as const

const PRODUCTS: Product[] = [
  { id: 1, name: 'Tシャツ', attrs: { 色: '赤', サイズ: 'L', 重さ: 180 } },
  { id: 2, name: 'パーカー', attrs: { 色: '黒', サイズ: 'M', 重さ: 600 } },
  { id: 3, name: 'マグ', attrs: { 色: '白', 容量: 350 } },
  { id: 4, name: 'リュック', attrs: { 色: '赤', サイズ: 'L', 重さ: 1200, 容量: 20 } },
]

type Op = 'pivot' | 'unpivot' | 'add' | 'search' | 'numeric'
type View = { wide: RowTableData; long: RowTableData }

const CODE: Record<Op, string> = {
  pivot: `-- 縦持ち → 横持ち（PIVOT）
SELECT id,
  MAX(value) FILTER (WHERE attr = '色')     AS 色,
  MAX(value) FILTER (WHERE attr = 'サイズ') AS サイズ,
  MAX(value) FILTER (WHERE attr = '重さ')   AS 重さ,
  MAX(value) FILTER (WHERE attr = '容量')   AS 容量
FROM product_attr
GROUP BY id;`,
  unpivot: `-- 横持ち → 縦持ち（UNPIVOT）
SELECT p.id, v.attr, v.value
FROM product p
CROSS JOIN LATERAL (VALUES
  ('色', p.色), ('サイズ', p.サイズ),
  ('重さ', p.重さ::text), ('容量', p.容量::text)
) AS v(attr, value)
WHERE v.value IS NOT NULL;`,
  add: `-- 属性「保証」をパーカーだけに足す
-- 横持ち: 列を増やす（全行に NULL の列ができる）
ALTER TABLE product ADD COLUMN 保証 int;
UPDATE product SET 保証 = 2 WHERE id = 2;

-- 縦持ち: 行を 1 つ足すだけ。表の形は変わらない
INSERT INTO product_attr VALUES (2, '保証', '2');`,
  search: `-- 色が赤で、サイズが L の商品
-- 横持ち: 1 行の中で 2 つの列を見る
SELECT id FROM product WHERE 色 = '赤' AND サイズ = 'L';

-- 縦持ち: 条件ごとに行が分かれるので、自分自身と結合する
SELECT c.id FROM product_attr c
JOIN product_attr s ON s.id = c.id
WHERE c.attr = '色' AND c.value = '赤'
  AND s.attr = 'サイズ' AND s.value = 'L';`,
  numeric: `-- 重さ 500 以上
-- 横持ち: 重さ は int の列。数として比べる
SELECT id FROM product WHERE 重さ >= 500;

-- 縦持ち: value はどの属性も入る text の列
SELECT id FROM product_attr
WHERE attr = '重さ' AND value >= '500';   -- 文字列として比べてしまう`,
}

const longRows = (ps: Product[], extra: [number, string, string][] = []) =>
  [...ps.flatMap((p) => Object.entries(p.attrs).map(([a, v]) => [p.id, a, String(v)] as [number, string, string])), ...extra]

function wideTable(ps: Product[], states: Record<number, CellState> = {}, cols: string[] = [...ATTRS], extra: Record<number, Record<string, Value>> = {}, only?: number[]): RowTableData {
  return {
    title: 'product（横持ち）',
    columns: ['id', '名前', ...cols],
    rows: ps
      .filter((p) => !only || only.includes(p.id))
      .map((p) => ({
        key: String(p.id),
        cells: [p.id, p.name, ...cols.map((c) => (extra[p.id]?.[c] ?? p.attrs[c] ?? null) as Value)],
        state: states[p.id],
      })),
  }
}

function longTable(rows: [number, string, string][], states: (r: [number, string, string]) => CellState | undefined = () => undefined): RowTableData {
  return {
    title: 'product_attr（縦持ち・EAV）',
    columns: ['id', 'attr', 'value'],
    rows: rows.map((r): Row => ({ key: `${r[0]}-${r[1]}`, cells: r, state: states(r) })),
  }
}

function trace(op: Op): Frame<View>[] {
  const frames: Frame<View>[] = []
  const snap = (line: number | number[], note: string, view: View, vars: Frame<View>['vars'] = {}, done = false) =>
    frames.push({ line, note, view, vars, done })
  const L = longRows(PRODUCTS)
  const nulls = PRODUCTS.reduce((n, p) => n + ATTRS.filter((a) => p.attrs[a] === undefined).length, 0)

  if (op === 'pivot') {
    const built: number[] = []
    snap(1, `縦持ちは「1 行 = 1 つの属性値」。${PRODUCTS.length} 商品の属性が ${L.length} 行に分かれている`, { wide: wideTable(PRODUCTS, {}, [...ATTRS], {}, []), long: longTable(L) }, { 縦の行: L.length, 横の行: 0 })
    for (const p of PRODUCTS) {
      built.push(p.id)
      snap(
        [2, 3, 4, 5, 6, 7, 8],
        `id = ${p.id} の ${Object.keys(p.attrs).length} 行を 1 つのグループにまとめ、attr ごとに列へ振り分ける。持っていない属性は NULL になる`,
        { wide: wideTable(PRODUCTS, { [p.id]: 'good' }, [...ATTRS], {}, built), long: longTable(L, (r) => (r[0] === p.id ? 'window' : built.includes(r[0]) ? 'dim' : undefined)) },
        { 縦の行: L.length, 横の行: built.length },
      )
    }
    snap(8, `横持ちは ${PRODUCTS.length} 行。代わりに NULL のセルが ${nulls} 個できた。列の名前と数は、問い合わせを書く時点で決めておく必要がある`, { wide: wideTable(PRODUCTS), long: longTable(L) }, { 縦の行: L.length, 横の行: PRODUCTS.length, NULL: nulls }, true)
    return frames
  }

  if (op === 'unpivot') {
    const emitted: [number, string, string][] = []
    snap(1, `横持ちは「1 行 = 1 商品」。列が属性を表す`, { wide: wideTable(PRODUCTS), long: longTable([]) }, { 横の行: PRODUCTS.length, 縦の行: 0 })
    for (const p of PRODUCTS) {
      const add = longRows([p])
      emitted.push(...add)
      const skipped = ATTRS.filter((a) => p.attrs[a] === undefined)
      snap(
        [2, 3, 4, 5, 6, 7, 8, 9],
        `id = ${p.id} の 1 行を、列ごとの (attr, value) に展開する。${skipped.length > 0 ? `NULL の ${skipped.join('・')} は行にしない。` : ''}数の列も text にそろえる`,
        { wide: wideTable(PRODUCTS, { [p.id]: 'window' }), long: longTable(emitted, (r) => (r[0] === p.id ? 'good' : undefined)) },
        { 横の行: PRODUCTS.length, 縦の行: emitted.length },
      )
    }
    snap(9, `縦持ちは ${emitted.length} 行。NULL は消えたが、値はすべて text になり、型の情報は失われた`, { wide: wideTable(PRODUCTS), long: longTable(emitted) }, { 横の行: PRODUCTS.length, 縦の行: emitted.length }, true)
    return frames
  }

  if (op === 'add') {
    const cols = [...ATTRS, '保証']
    snap(1, `パーカーにだけ「保証 2 年」という属性が増えた`, { wide: wideTable(PRODUCTS), long: longTable(L) })
    snap(3, `横持ちは表の形（スキーマ）を変える。全 ${PRODUCTS.length} 行に 保証 列ができ、パーカー以外は NULL。本番の大きな表では、この ALTER がロックや書き直しを伴うことがある`, { wide: wideTable(PRODUCTS, Object.fromEntries(PRODUCTS.map((p) => [p.id, 'window' as CellState])), cols), long: longTable(L) }, { 変えた表の形: 1 })
    snap(4, `値を入れる`, { wide: wideTable(PRODUCTS, { 2: 'active' }, cols, { 2: { 保証: 2 } }), long: longTable(L) }, { 変えた表の形: 1, 書いた行: 1 })
    const L2 = [...L, [2, '保証', '2'] as [number, string, string]]
    snap(7, `縦持ちは 1 行 INSERT するだけ。表の形は変わらないので、アプリの改修なしに属性を増やせる。これが EAV が選ばれる理由`, { wide: wideTable(PRODUCTS, {}, cols, { 2: { 保証: 2 } }), long: longTable(L2, (r) => (r[1] === '保証' ? 'good' : undefined)) }, { 変えた表の形: 1, 書いた行: 2 }, true)
    return frames
  }

  if (op === 'search') {
    const hitW = PRODUCTS.filter((p) => p.attrs.色 === '赤' && p.attrs.サイズ === 'L').map((p) => p.id)
    snap(3, `横持ちでは、1 行の中に色もサイズもある。行ごとに 2 つの列を見るだけで ${hitW.join(', ')} が見つかる`, { wide: wideTable(PRODUCTS, Object.fromEntries(PRODUCTS.map((p) => [p.id, (hitW.includes(p.id) ? 'good' : 'dim') as CellState]))), long: longTable(L) }, { 結合: 0 })
    const red = L.filter((r) => r[1] === '色' && r[2] === '赤').map((r) => r[0])
    snap([6, 8], `縦持ちでは「色 = 赤」は 1 行、「サイズ = L」は別の行にある。1 行の WHERE では両方を同時に満たせない。まず色 = 赤の行 → id ${red.join(', ')}`, { wide: wideTable(PRODUCTS), long: longTable(L, (r) => (r[1] === '色' && r[2] === '赤' ? 'window' : undefined)) }, { 結合: 0 })
    const size = L.filter((r) => r[1] === 'サイズ' && r[2] === 'L').map((r) => r[0])
    snap([7, 9], `同じ表をもう 1 度読み、サイズ = L の行 → id ${size.join(', ')}。id で突き合わせて両方にあるものが答え。条件が 1 つ増えるごとに自己結合が 1 つ増える`, { wide: wideTable(PRODUCTS), long: longTable(L, (r) => (r[1] === '色' && r[2] === '赤' ? 'window' : r[1] === 'サイズ' && r[2] === 'L' ? (red.includes(r[0]) ? 'good' : 'window') : undefined)) }, { 結合: 1 })
    snap([6, 7, 8, 9], `答えは同じ ${hitW.join(', ')}。10 万商品の実験では、横持ち + 複合索引 0.45 ms に対して、縦持ちの自己結合は 36.7 ms だった`, { wide: wideTable(PRODUCTS, Object.fromEntries(hitW.map((id) => [id, 'good' as CellState]))), long: longTable(L, (r) => (hitW.includes(r[0]) && (r[1] === '色' || r[1] === 'サイズ') ? 'good' : undefined)) }, { 結合: 1 }, true)
    return frames
  }

  const okW = PRODUCTS.filter((p) => typeof p.attrs.重さ === 'number' && (p.attrs.重さ as number) >= 500).map((p) => p.id)
  snap(3, `横持ちの 重さ は int 型の列。数として比べるので ${okW.join(', ')} が正しく返る`, { wide: wideTable(PRODUCTS, Object.fromEntries(PRODUCTS.map((p) => [p.id, (okW.includes(p.id) ? 'good' : 'dim') as CellState]))), long: longTable(L) })
  const weights = L.filter((r) => r[1] === '重さ')
  const textHit = weights.filter((r) => r[2] >= '500').map((r) => r[0])
  const missed = okW.filter((id) => !textHit.includes(id))
  snap([6, 7], `縦持ちの value は text。'1200' >= '500' は先頭の文字 '1' < '5' で偽になる。返るのは ${textHit.join(', ')} だけで、id ${missed.join(', ')} を取りこぼす`, { wide: wideTable(PRODUCTS), long: longTable(L, (r) => (r[1] !== '重さ' ? undefined : textHit.includes(r[0]) ? 'good' : missed.includes(r[0]) ? 'bad' : 'window')) })
  snap([6, 7], `value::int >= 500 と書けば直るが、その属性の値がすべて数として読めることを DB は保証しない。型・NOT NULL・外部キーといった制約を、属性ごとには付けられないのが縦持ちの代償`, { wide: wideTable(PRODUCTS), long: longTable(L, (r) => (r[1] === '重さ' ? 'window' : undefined)) }, {}, true)
  return frames
}

const PRESETS: { name: string; value: Op }[] = [
  { name: '縦 → 横', value: 'pivot' },
  { name: '横 → 縦', value: 'unpivot' },
  { name: '属性を足す', value: 'add' },
  { name: '2 条件で探す', value: 'search' },
  { name: '数で比べる', value: 'numeric' },
]

export default function WideLong() {
  const [op, setOp] = useState<Op>('pivot')
  const frames = useMemo(() => trace(op), [op])
  return (
    <SimShell
      title="横持ちと縦持ち（列に持つか、行に持つか）"
      subtitle="同じ商品の属性を、列として持つ表と (id, attr, value) の行として持つ表で比べる"
      code={CODE[op]}
      frames={frames}
      controls={<PresetControl label="操作" presets={PRESETS} onPick={setOp} />}
      legend={
        <>
          <LegendItem state="window">読んでいる行</LegendItem>
          <LegendItem state="good">結果・作った行</LegendItem>
          <LegendItem state="active">書き換えた行</LegendItem>
          <LegendItem state="bad">取りこぼした行</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="grid gap-4">
          <RowTable {...f.view.wide} />
          <RowTable {...f.view.long} />
        </div>
      )}
    </SimShell>
  )
}
