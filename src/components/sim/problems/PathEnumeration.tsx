import type { CellState } from '../core/types'
import { HierarchySim, Recorder, paint, type Args, type HView, type Model, type Op } from '../hierarchy/HierarchySim'
import { NEW_NODE, SAMPLE, addLeaf, moveTo, nameOf, pathTo, removeSubtree, subtree, wouldCycle, type Tree } from '../hierarchy/tree'

const pathOf = (t: Tree, id: number) => '/' + pathTo(t, id).join('/') + '/'

const CODE: Record<Op, (a: Args) => string> = {
  desc: ({ target }) => `-- path の索引は text_pattern_ops（バイト順）で作っておく
SELECT * FROM category
WHERE path LIKE '${pathOf(SAMPLE, target)}%';   -- 前方一致は索引の範囲走査になる`,
  anc: ({ target }) => `-- 先祖の id は、自分の path にすべて書いてある
SELECT * FROM category
WHERE id IN (${pathTo(SAMPLE, target).join(', ')});   -- '${pathOf(SAMPLE, target)}' を / で分けたもの`,
  add: ({ target }) => `INSERT INTO category (id, path, name)
SELECT ${NEW_NODE.id}, path || '${NEW_NODE.id}/', '${NEW_NODE.name}'
FROM category WHERE id = ${target};   -- 親の path の後ろに自分の id を足す`,
  move: ({ target, dest }) => {
    const from = pathOf(SAMPLE, SAMPLE.find((n) => n.id === target)!.parent!)
    return `-- 部分木の全行で、先頭の '${from}' を移動先の path に付け替える
UPDATE category
SET path = '${pathOf(SAMPLE, dest)}' || substr(path, ${from.length + 1})
WHERE path LIKE '${pathOf(SAMPLE, target)}%';`
  },
  del: ({ target }) => `DELETE FROM category WHERE id = ${target};
-- これだけだと子の行が残る。外部キーで止める手段がない

DELETE FROM category
WHERE path LIKE '${pathOf(SAMPLE, target)}%';`,
}

function view(tree: Tree, nodes: Record<number, CellState>, prev?: Map<number, string>, orphans: Tree = []): HView {
  const all = [...tree, ...orphans]
  const paths = new Map(tree.map((n) => [n.id, pathOf(tree, n.id)]))
  for (const o of orphans) paths.set(o.id, pathOf(SAMPLE, o.id))
  return {
    tree,
    nodes,
    tables: [
      {
        title: 'category（path の索引順に並べたもの）',
        columns: ['id', 'path', 'name'],
        rows: all
          .map((n) => ({ n, p: paths.get(n.id)! }))
          .sort((a, b) => (a.p < b.p ? -1 : a.p > b.p ? 1 : 0))
          .map(({ n, p }) => ({
            key: String(n.id),
            cells: [n.id, p, n.name],
            state: nodes[n.id],
            prev: prev?.has(n.id) ? [n.id, prev.get(n.id)!, n.name] : undefined,
          })),
      },
    ],
  }
}

export function trace(op: Op, { target, dest }: Args) {
  const r = new Recorder()
  const t = SAMPLE
  const prefix = pathOf(t, target)

  if (op === 'desc') {
    const sub = subtree(t, target)
    r.snap(1, `各行は根から自分までの経路を文字列で持つ。子孫の path は必ず '${prefix}' で始まるので、索引の上では連続した区間に並ぶ`, view(t, paint([target], 'active')))
    r.stmts = 1
    r.read = sub.length + 1
    r.snap([2, 3], `索引で '${prefix}' の位置へ飛び、そこから前方一致しなくなるまで読み進める。${sub.length} 行が並んでいて、その次の 1 行で止まる。再帰は要らない`, view(t, paint(sub, 'good')), true)
    return r.frames
  }

  if (op === 'anc') {
    const path = pathTo(t, target)
    r.snap(1, `${target} の path は '${prefix}'。先祖が誰かは、この文字列を読むだけで分かる`, view(t, paint([target], 'active')))
    r.stmts = 1
    r.read = 1 + path.length
    r.snap([2, 3], `/ で分けた ${path.join(', ')} を主キーで引くだけ。木をたどる必要はない`, view(t, paint(path, 'good')), true)
    return r.frames
  }

  if (op === 'add') {
    const after = addLeaf(t, target)
    r.stmts = 1
    r.read = 1
    r.snap([1, 2, 3], `親 ${target} の path '${prefix}' を読む`, view(t, paint([target], 'window')))
    r.written = 1
    r.snap([1, 2, 3], `その後ろに ${NEW_NODE.id}/ を足した '${prefix}${NEW_NODE.id}/' で 1 行入れる。ほかの行は変わらない`, view(after, paint([NEW_NODE.id], 'good')), true)
    return r.frames
  }

  if (op === 'move') {
    const sub = subtree(t, target)
    if (wouldCycle(t, target, dest)) {
      r.snap(1, `移動先 ${dest} は ${target} の子孫。この UPDATE は自分の path の中に自分を入れる文字列を作り、木として意味をなさない。DB はそれを止めないので、移動先が '${prefix}' で始まっていないかをアプリ側で確かめる必要がある`, view(t, paint([target], 'active', paint(sub, 'bad'))), true)
      return r.frames
    }
    r.snap(1, `${nameOf(t, target)} の部分木（${sub.length} 行）は全員 '${prefix}' で始まる path を持っている`, view(t, paint(sub, 'window', paint([dest], 'good'))))
    const before = new Map(sub.map((id) => [id, pathOf(t, id)]))
    const after = moveTo(t, target, dest)
    r.stmts = 1
    r.read = sub.length
    r.written = sub.length
    r.snap([2, 3, 4], `部分木の ${sub.length} 行すべての path を書き換える。経路を値として各行にコピーしているので、途中が変わると子孫全員に響く`, view(after, paint(sub, 'active'), before), true)
    return r.frames
  }

  const sub = subtree(t, target)
  if (sub.length > 1) {
    const orphans = t.filter((n) => sub.includes(n.id) && n.id !== target)
    r.stmts = 1
    r.written = 1
    r.snap([1, 2], `${target} の行だけを消すと、DB はそのまま受け付ける。子孫 ${orphans.length} 行の path には消えた '${target}' が残り、親のいない行になる`, view(removeSubtree(t, target), paint(orphans.map((n) => n.id), 'bad'), undefined, orphans))
  }
  // ここからは正しいやり方を別に数え直す
  r.stmts = 1
  r.read = sub.length + 1
  r.written = sub.length
  r.snap([4, 5], `数え直す。正しくは前方一致で部分木をまとめて消す。子孫の取得と同じく、索引の連続した区間 ${sub.length} 行`, view(t, paint(sub, 'bad')))
  r.snap([4, 5], `削除後の木。前方一致の 1 文で ${sub.length} 行。ほかの行の path は変わらない`, view(removeSubtree(t, target), {}), true)
  return r.frames
}

const MODEL: Model = {
  title: '経路列挙（根からの道のりを文字列で持つ）',
  subtitle: "'/1/2/4/' のような経路を各行に書く。子孫は前方一致、先祖は文字列を分けるだけ",
  code: (op, a) => CODE[op](a),
  trace,
}

export default function PathEnumeration() {
  return <HierarchySim model={MODEL} />
}
