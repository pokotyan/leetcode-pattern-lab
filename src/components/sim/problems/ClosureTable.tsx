import type { CellState } from '../core/types'
import type { Row } from '../views/RowTable'
import { HierarchySim, Recorder, paint, type Args, type HView, type Model, type Op } from '../hierarchy/HierarchySim'
import { NEW_NODE, SAMPLE, addLeaf, moveTo, nameOf, pathTo, removeSubtree, subtree, wouldCycle, type Tree } from '../hierarchy/tree'

type Link = { a: number; d: number; depth: number }
const keyOf = (x: Link) => `${x.a}-${x.d}`

/** 先祖と子孫のすべての組。自分自身との組（深さ 0）も持つ */
function closure(t: Tree): Link[] {
  return t.flatMap((n) => {
    const p = pathTo(t, n.id)
    return p.map((a, i) => ({ a, d: n.id, depth: p.length - 1 - i }))
  })
}

const CODE: Record<Op, (a: Args) => string> = {
  desc: ({ target }) => `SELECT c.* FROM category_tree t
JOIN category c ON c.id = t.descendant
WHERE t.ancestor = ${target};          -- 主キー (ancestor, descendant) の範囲`,
  anc: ({ target }) => `SELECT c.* FROM category_tree t
JOIN category c ON c.id = t.ancestor
WHERE t.descendant = ${target};        -- descendant 側の索引で引く`,
  add: ({ target }) => `INSERT INTO category (id, name) VALUES (${NEW_NODE.id}, '${NEW_NODE.name}');
INSERT INTO category_tree (ancestor, descendant, depth)
SELECT ancestor, ${NEW_NODE.id}, depth + 1
FROM category_tree WHERE descendant = ${target}   -- 親の先祖はみな自分の先祖
UNION ALL SELECT ${NEW_NODE.id}, ${NEW_NODE.id}, 0;`,
  move: ({ target, dest }) => `-- 1. 部分木の外にいる先祖とのつながりを切る
DELETE FROM category_tree
WHERE descendant IN (SELECT descendant FROM category_tree WHERE ancestor = ${target})
  AND ancestor NOT IN (SELECT descendant FROM category_tree WHERE ancestor = ${target});
-- 2. 移動先の先祖 × 部分木の全ノードでつなぎ直す
INSERT INTO category_tree (ancestor, descendant, depth)
SELECT sup.ancestor, sub.descendant, sup.depth + sub.depth + 1
FROM category_tree sup CROSS JOIN category_tree sub
WHERE sup.descendant = ${dest} AND sub.ancestor = ${target};`,
  del: ({ target }) => `DELETE FROM category_tree
WHERE descendant IN (SELECT descendant FROM category_tree WHERE ancestor = ${target});
DELETE FROM category
WHERE id IN (...);   -- 上で消した子孫の id`,
}

function view(tree: Tree, links: Link[], nodes: Record<number, CellState>, rowState: Map<string, CellState> = new Map()): HView {
  const rows: Row[] = [...links]
    .sort((x, y) => x.a - y.a || x.d - y.d)
    .map((x) => ({ key: keyOf(x), cells: [x.a, x.d, x.depth], state: rowState.get(keyOf(x)) }))
  return {
    tree,
    nodes,
    tables: [{ title: 'category_tree（主キー順）', columns: ['ancestor', 'descendant', 'depth'], rows }],
  }
}

const mark = (links: Link[], state: CellState, base = new Map<string, CellState>()) => {
  const m = new Map(base)
  for (const x of links) m.set(keyOf(x), state)
  return m
}

export function trace(op: Op, { target, dest }: Args) {
  const r = new Recorder()
  const t = SAMPLE
  const links = closure(t)

  if (op === 'desc') {
    const hit = links.filter((x) => x.a === target)
    r.snap(1, `${t.length} ノードに対して ${links.length} 行。先祖と子孫のすべての組を、自分自身との組も含めて前もって持っている`, view(t, links, paint([target], 'active')))
    r.stmts = 1
    r.read = hit.length
    r.snap([1, 2, 3], `ancestor = ${target} の行が主キーの上で連続して並んでいる。そこを読むだけで子孫 ${hit.length} 件がそろう。depth を見れば「ちょうど 1 段下（子）」だけにも絞れる`, view(t, links, paint(hit.map((x) => x.d), 'good'), mark(hit, 'good')), true)
    return r.frames
  }

  if (op === 'anc') {
    const hit = links.filter((x) => x.d === target)
    r.stmts = 1
    r.read = hit.length
    r.snap(1, `${nameOf(t, target)} の先祖を探す`, view(t, links, paint([target], 'active')))
    r.snap([1, 2, 3], `descendant = ${target} の ${hit.length} 行。主キーの順では散らばっているが、descendant 側の索引があれば直接引ける`, view(t, links, paint(hit.map((x) => x.a), 'good'), mark(hit, 'good')), true)
    return r.frames
  }

  if (op === 'add') {
    const parentLinks = links.filter((x) => x.d === target)
    const added: Link[] = [...parentLinks.map((x) => ({ a: x.a, d: NEW_NODE.id, depth: x.depth + 1 })), { a: NEW_NODE.id, d: NEW_NODE.id, depth: 0 }]
    r.stmts = 1
    r.written = 1
    r.snap(1, `ノードそのものを category に 1 行入れる`, view(t, links, paint([target], 'window')))
    r.stmts = 2
    r.read = parentLinks.length
    r.snap([2, 3, 4], `親 ${target} の先祖の行（descendant = ${target}）を ${parentLinks.length} 行読む。親の先祖は、そのまま新しい葉の先祖になる`, view(t, links, paint(pathTo(t, target), 'window'), mark(parentLinks, 'window')))
    r.written = 1 + added.length
    r.snap([2, 3, 4, 5], `深さを 1 足した ${parentLinks.length} 行と、自分自身との 1 行を足す。書く行数は「新しい葉の深さ + 1」で、木の大きさには関係しない`, view(addLeaf(t, target), [...links, ...added], paint([NEW_NODE.id], 'good'), mark(added, 'good')), true)
    return r.frames
  }

  if (op === 'move') {
    const sub = subtree(t, target)
    if (wouldCycle(t, target, dest)) {
      r.snap(1, `移動先 ${dest} は ${target} の子孫（ancestor = ${target}, descendant = ${dest} の行がある）。この行の有無を先に確かめて弾く`, view(t, links, paint([target], 'active', paint(sub, 'bad')), mark(links.filter((x) => x.a === target && x.d === dest), 'bad')), true)
      return r.frames
    }
    const inSub = new Set(sub)
    const cut = links.filter((x) => inSub.has(x.d) && !inSub.has(x.a))
    r.snap(1, `${nameOf(t, target)} の部分木（${sub.length} ノード）を ${nameOf(t, dest)} の下へ移す`, view(t, links, paint(sub, 'window', paint([dest], 'good')), mark(links.filter((x) => x.a === target), 'window')))
    r.stmts = 1
    r.read = sub.length
    r.written = cut.length
    r.snap([1, 2, 3, 4], `部分木の中の行と、部分木の外の先祖との組 ${cut.length} 行を消す。部分木の中どうしの組は残す`, view(t, links, paint(sub, 'window'), mark(cut, 'bad')))
    const kept = links.filter((x) => !(inSub.has(x.d) && !inSub.has(x.a)))
    const sup = links.filter((x) => x.d === dest)
    const subL = links.filter((x) => x.a === target)
    const added = sup.flatMap((p) => subL.map((s) => ({ a: p.a, d: s.d, depth: p.depth + s.depth + 1 })))
    r.stmts = 2
    r.read += sup.length + subL.length
    r.written += added.length
    r.snap([5, 6, 7, 8, 9], `移動先の先祖 ${sup.length} 行 × 部分木 ${subL.length} 行の直積 ${added.length} 行を入れる。移す部分木が大きく、移動先が深いほど行数が掛け算で増える`, view(moveTo(t, target, dest), [...kept, ...added], paint(sub, 'active'), mark(added, 'good')), true)
    return r.frames
  }

  const sub = subtree(t, target)
  const inSub = new Set(sub)
  const gone = links.filter((x) => inSub.has(x.d))
  r.stmts = 1
  r.read = sub.length
  r.written = gone.length
  r.snap([1, 2], `部分木のノードを descendant に持つ行をすべて消す。${gone.length} 行。部分木の各ノードについて「深さ + 1」行ずつある`, view(t, links, paint(sub, 'bad'), mark(gone, 'bad')))
  r.stmts = 2
  r.written += sub.length
  const rest = removeSubtree(t, target)
  r.snap([3, 4], `ノード本体の ${sub.length} 行も消す。閉包テーブルの 2 列に外部キーを張っておけば、片方だけ消えて食い違うことはない`, view(rest, closure(rest), {}), true)
  return r.frames
}

const MODEL: Model = {
  title: '閉包テーブル（先祖と子孫の組をすべて持つ）',
  subtitle: '木の形を別の表に「すべての先祖・子孫の組」として展開しておく。読むのは 1 回の索引、書くのは深さに比例',
  code: (op, a) => CODE[op](a),
  trace,
}

export default function ClosureTable() {
  return <HierarchySim model={MODEL} />
}

