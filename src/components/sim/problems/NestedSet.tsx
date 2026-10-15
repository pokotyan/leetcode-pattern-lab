import type { CellState } from '../core/types'
import { cellStyle } from '../views/style'
import { HierarchySim, Recorder, paint, type Args, type HView, type Model, type Op } from '../hierarchy/HierarchySim'
import { NEW_NODE, SAMPLE, addLeaf, childrenOf, depthOf, nameOf, pathTo, root, subtree, wouldCycle, type Tree } from '../hierarchy/tree'

type LR = { l: number; r: number }
type Nums = Map<number, LR>

/** 深さ優先で、入るときに lft、出るときに rgt を振る */
function number(t: Tree): Nums {
  const out: Nums = new Map()
  let c = 0
  const visit = (id: number) => {
    const l = ++c
    for (const k of childrenOf(t, id)) visit(k.id)
    out.set(id, { l, r: ++c })
  }
  visit(root(t).id)
  return out
}

/** 子の並びは配列順なので、末尾へ回せば「最後の子」になる */
function moveLast(t: Tree, id: number, dest: number): Tree {
  const sub = new Set(subtree(t, id))
  const rest = t.filter((n) => !sub.has(n.id))
  const moved = t.filter((n) => sub.has(n.id)).map((n) => (n.id === id ? { ...n, parent: dest } : n))
  return [...rest, ...moved]
}

const CODE: Record<Op, (a: Args) => string> = {
  desc: ({ target }) => `SELECT c.* FROM category p
JOIN category c
  ON c.lft BETWEEN p.lft AND p.rgt   -- 親の区間に入る行
WHERE p.id = ${target};`,
  anc: ({ target }) => `SELECT a.* FROM category c
JOIN category a
  ON c.lft BETWEEN a.lft AND a.rgt   -- 自分を区間に含む行
WHERE c.id = ${target};`,
  add: ({ target }) => {
    const R = number(SAMPLE).get(target)!.r
    return `-- 親 ${target} の rgt = ${R} の位置に、幅 2 の隙間を開ける
UPDATE category SET rgt = rgt + 2 WHERE rgt >= ${R};
UPDATE category SET lft = lft + 2 WHERE lft >  ${R};
INSERT INTO category (id, lft, rgt, name)
VALUES (${NEW_NODE.id}, ${R}, ${R + 1}, '${NEW_NODE.name}');`
  },
  move: ({ target }) => {
    const { l, r } = number(SAMPLE).get(target)!
    const w = r - l + 1
    return `-- 部分木 ${target} は [${l}, ${r}]、幅 w = ${w}
-- 1. 部分木を負の番号へ退避する
UPDATE category SET lft = -lft, rgt = -rgt
WHERE lft BETWEEN ${l} AND ${r};
-- 2. 抜けた穴を詰める
UPDATE category SET lft = lft - ${w} WHERE lft > ${r};
UPDATE category SET rgt = rgt - ${w} WHERE rgt > ${r};
-- 3. 移動先の親の rgt（= T）に穴を開ける
UPDATE category SET lft = lft + ${w} WHERE lft >= T;
UPDATE category SET rgt = rgt + ${w} WHERE rgt >= T;
-- 4. 退避した部分木を穴へ戻す
UPDATE category
SET lft = -lft + (T - ${l}), rgt = -rgt + (T - ${l})
WHERE lft < 0;`
  },
  del: ({ target }) => {
    const { l, r } = number(SAMPLE).get(target)!
    return `DELETE FROM category WHERE lft BETWEEN ${l} AND ${r};
-- 番号の穴を詰める（詰めなくても木としては正しい）
UPDATE category SET lft = lft - ${r - l + 1} WHERE lft > ${r};
UPDATE category SET rgt = rgt - ${r - l + 1} WHERE rgt > ${r};`
  },
}

function view(tree: Tree, nums: Nums, nodes: Record<number, CellState>, prev?: Nums): HView {
  return {
    tree,
    nodes,
    tables: [
      {
        title: 'category（lft の順）',
        columns: ['id', 'lft', 'rgt', 'name'],
        rows: tree
          .filter((n) => nums.has(n.id))
          .sort((a, b) => nums.get(a.id)!.l - nums.get(b.id)!.l)
          .map((n) => {
            const v = nums.get(n.id)!
            const p = prev?.get(n.id)
            return {
              key: String(n.id),
              cells: [n.id, v.l, v.r, n.name],
              state: nodes[n.id],
              prev: p ? [n.id, p.l, p.r, n.name] : undefined,
            }
          }),
      },
    ],
  }
}

/** 番号の数直線の上に、各ノードの区間 [lft, rgt] を深さごとに積む。退避中（負の番号）の行は描かない */
function Intervals({ v }: { v: HView }) {
  const bars = v.tables[0]!.rows
    .map((row) => {
      const [id, l, r, name] = row.cells as [number, number, number, string]
      return { id, l, r, name, d: depthOf(v.tree, id) }
    })
    .filter((b) => b.l > 0)
  const max = Math.max(...bars.map((b) => b.r))
  const unit = 22
  const rowH = 20
  const maxDepth = Math.max(...bars.map((b) => b.d))
  const width = (max + 1) * unit
  const height = (maxDepth + 1) * rowH + 22
  const x = (n: number) => n * unit
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} style={{ maxWidth: '100%', height: 'auto' }} role="img">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <text key={n} x={x(n)} y={height - 6} textAnchor="middle" fontSize="9" fontFamily="ui-monospace, monospace" fill="var(--fg-muted)">
          {n}
        </text>
      ))}
      {bars.map((b) => {
        const s = cellStyle[v.nodes[b.id] ?? 'idle']
        return (
          <g key={b.id}>
            <rect x={x(b.l) - 7} y={b.d * rowH + 2} width={x(b.r) - x(b.l) + 14} height={rowH - 4} rx={4} fill={s.background} stroke={s.borderColor} />
            <text x={x(b.l) - 3} y={b.d * rowH + rowH / 2 + 1} dominantBaseline="central" fontSize="10" fontWeight="700" fill={s.color}>
              {b.name}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function trace(op: Op, { target, dest }: Args) {
  const r = new Recorder()
  const t = SAMPLE
  const nums = number(t)
  const me = nums.get(target)!

  if (op === 'desc') {
    const sub = subtree(t, target)
    r.snap(1, `深さ優先でたどり、入るときに lft、出るときに rgt を振ってある。${nameOf(t, target)} の区間は [${me.l}, ${me.r}]。子孫は全員この区間の内側に lft を持つ`, view(t, nums, paint([target], 'active')))
    r.stmts = 1
    r.read = 1 + sub.length
    r.snap([1, 2, 3, 4], `lft の索引で ${me.l} から ${me.r} までを範囲走査する。${sub.length} 行。再帰は要らない`, view(t, nums, paint(sub, 'good')), true)
    return r.frames
  }

  if (op === 'anc') {
    const path = pathTo(t, target)
    const scanned = t.filter((n) => nums.get(n.id)!.l <= me.l).map((n) => n.id)
    r.snap(1, `${nameOf(t, target)} は [${me.l}, ${me.r}]。先祖は「自分の lft を区間に含む行」`, view(t, nums, paint([target], 'active')))
    r.stmts = 1
    r.read = 1 + scanned.length
    r.snap([1, 2, 3, 4], `lft の索引で使えるのは「lft ≤ ${me.l}」の側だけ。その ${scanned.length} 行を読んで rgt ≥ ${me.l} で絞る。右寄りのノードほど読む行が増える`, view(t, nums, paint(path, 'good', paint(scanned, 'window'))))
    r.snap(4, `先祖は ${path.join(', ')}。11 万ノードの実験では、右端の葉の先祖 6 行を得るために 111,105 行を読んで捨てた`, view(t, nums, paint(path, 'good')), true)
    return r.frames
  }

  if (op === 'add') {
    const R = me.r
    r.snap(1, `${nameOf(t, target)} の最後の子として入れる。新しい葉は [${R}, ${R + 1}] を使うので、${R} 以降の番号をすべて 2 ずつ右へずらす`, view(t, nums, paint([target], 'window')))
    r.stmts = 3
    const step1: Nums = new Map([...nums].map(([id, x]) => [id, { l: x.l, r: x.r >= R ? x.r + 2 : x.r }]))
    const changed1 = [...nums.keys()].filter((id) => nums.get(id)!.r !== step1.get(id)!.r)
    const step2: Nums = new Map([...step1].map(([id, x]) => [id, { l: x.l > R ? x.l + 2 : x.l, r: x.r }]))
    const changed = [...nums.keys()].filter((id) => nums.get(id)!.l !== step2.get(id)!.l || nums.get(id)!.r !== step2.get(id)!.r)
    r.read = nums.size
    r.written = changed1.length
    r.snap(2, `rgt ≥ ${R} の ${changed1.length} 行の rgt を +2。親と、その先祖と、右側にあるすべてのノードが対象`, view(t, step1, paint(changed1, 'active'), nums))
    r.written = changed.length
    r.snap(3, `lft > ${R} の行の lft も +2。ここまでで ${changed.length} 行を書き換えた。木の左寄りに足すほど、右側の全行が動く`, view(t, step2, paint(changed, 'active'), nums))
    const after = addLeaf(t, target)
    const fin = number(after)
    r.written = changed.length + 1
    r.snap([4, 5], `空いた [${R}, ${R + 1}] に 1 行入れる。書き換えた行は、追加した 1 行に対して ${changed.length} 行`, view(after, fin, paint(changed, 'active', paint([NEW_NODE.id], 'good'))), true)
    return r.frames
  }

  if (op === 'move') {
    const sub = subtree(t, target)
    if (wouldCycle(t, target, dest)) {
      r.snap(1, `移動先 ${dest} は ${target} の区間 [${me.l}, ${me.r}] の内側にある。自分の中へは移せないので、移動先の lft がこの区間に入らないことを先に確かめる`, view(t, nums, paint([target], 'active', paint(sub, 'bad'))), true)
      return r.frames
    }
    const { l, r: R } = me
    const w = R - l + 1
    const cur: Nums = new Map([...nums].map(([id, x]) => [id, { ...x }]))
    const touched = new Set<number>()
    const apply = (f: (id: number, x: LR) => LR | null) => {
      for (const [id, x] of cur) {
        const y = f(id, x)
        if (y && (y.l !== x.l || y.r !== x.r)) {
          cur.set(id, y)
          touched.add(id)
        }
      }
    }
    const show = () => new Map([...cur].map(([id, x]) => [id, { ...x }]))
    r.snap([1], `${nameOf(t, target)} の部分木 [${l}, ${R}]（${sub.length} ノード、幅 ${w}）を ${nameOf(t, dest)} の最後の子へ移す`, view(t, nums, paint(sub, 'window', paint([dest], 'good'))))
    apply((_, x) => (x.l >= l && x.l <= R ? { l: -x.l, r: -x.r } : null))
    r.stmts = 1
    r.written = touched.size
    r.snap([2, 3, 4], `部分木の番号を負にして、いったん数直線の外へ出す`, view(t, show(), paint(sub, 'active'), nums))
    apply((_, x) => (x.l > R ? { l: x.l - w, r: x.r } : null))
    apply((_, x) => (x.r > R ? { l: x.l, r: x.r - w } : null))
    r.stmts = 3
    r.written = touched.size
    r.snap([5, 6, 7], `抜けた幅 ${w} の穴を詰める。右側の番号がすべて左へ寄る`, view(t, show(), paint([...touched], 'active'), nums))
    const T = cur.get(dest)!.r
    apply((_, x) => (x.l >= T ? { l: x.l + w, r: x.r } : null))
    apply((_, x) => (x.r >= T ? { l: x.l, r: x.r + w } : null))
    r.stmts = 5
    r.written = touched.size
    r.snap([8, 9, 10], `移動先の rgt（T = ${T}）の位置に、幅 ${w} の穴を開ける。今度はそこより右の番号がすべて右へずれる`, view(t, show(), paint([...touched], 'active'), nums))
    apply((_, x) => (x.l < 0 ? { l: -x.l + (T - l), r: -x.r + (T - l) } : null))
    r.stmts = 6
    r.written = touched.size
    const after = moveLast(t, target, dest)
    r.snap([11, 12, 13, 14], `退避した部分木を穴へ戻す。6 文で ${touched.size} 行を書き換えた（全 ${nums.size} 行）。隣接リストなら 1 行で済む操作`, view(after, show(), paint([...touched], 'active', paint(sub, 'good')), nums), true)
    return r.frames
  }

  const sub = subtree(t, target)
  const { l, r: R } = me
  const w = R - l + 1
  r.stmts = 1
  r.read = sub.length
  r.written = sub.length
  r.snap(1, `区間 [${l}, ${R}] に lft がある ${sub.length} 行を消す。部分木は連続した区間なので 1 文で済む`, view(t, nums, paint(sub, 'bad')))
  const rest = t.filter((n) => !sub.includes(n.id))
  const gap: Nums = new Map(rest.map((n) => [n.id, nums.get(n.id)!]))
  const closed: Nums = new Map(
    [...gap].map(([id, x]) => [id, { l: x.l > R ? x.l - w : x.l, r: x.r > R ? x.r - w : x.r }]),
  )
  const moved = [...gap.keys()].filter((id) => gap.get(id)!.l !== closed.get(id)!.l || gap.get(id)!.r !== closed.get(id)!.r)
  r.stmts = 3
  r.written = sub.length + moved.length
  r.snap([2, 3, 4], `番号に幅 ${w} の穴が残る。詰めると右側と先祖の ${moved.length} 行を書き換えることになる。詰めずに放っておいても包含関係は崩れない`, view(rest, closed, paint(moved, 'active'), gap), true)
  return r.frames
}

const MODEL: Model = {
  title: '入れ子集合（区間で包含を表す）',
  subtitle: '各ノードが番号の区間 [lft, rgt] を持ち、子孫の区間は必ず先祖の区間に収まる。読むのは速いが、番号の付け直しが重い',
  code: (op, a) => CODE[op](a),
  trace,
  extra: (v) => <Intervals v={v} />,
}

export default function NestedSet() {
  return <HierarchySim model={MODEL} />
}
