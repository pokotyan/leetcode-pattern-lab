import type { CellState } from '../core/types'
import { HierarchySim, Recorder, paint, type Args, type HView, type Model, type Op } from '../hierarchy/HierarchySim'
import {
  NEW_NODE,
  SAMPLE,
  addLeaf,
  childrenOf,
  moveTo,
  nameOf,
  pathTo,
  removeSubtree,
  subtree,
  wouldCycle,
  type Tree,
} from '../hierarchy/tree'

const CODE: Record<Op, (a: Args) => string> = {
  desc: ({ target }) => `WITH RECURSIVE sub AS (
  SELECT id, name FROM category
  WHERE id = ${target}                  -- 起点
  UNION ALL
  SELECT c.id, c.name FROM category c
  JOIN sub ON c.parent_id = sub.id   -- 1 段下へ
)
SELECT * FROM sub;`,
  anc: ({ target }) => `WITH RECURSIVE up AS (
  SELECT id, parent_id, name FROM category
  WHERE id = ${target}                  -- 起点
  UNION ALL
  SELECT c.id, c.parent_id, c.name FROM category c
  JOIN up ON c.id = up.parent_id     -- 1 段上へ
)
SELECT * FROM up;`,
  add: ({ target }) => `INSERT INTO category (id, parent_id, name)
VALUES (${NEW_NODE.id}, ${target}, '${NEW_NODE.name}');`,
  move: ({ target, dest }) => `UPDATE category
SET parent_id = ${dest}
WHERE id = ${target};
-- 移動先が自分の子孫かどうかは、DB は調べない`,
  del: ({ target }) => `DELETE FROM category WHERE id = ${target};
-- 子が残っていれば外部キーが拒否する

WITH RECURSIVE sub AS (
  SELECT id FROM category WHERE id = ${target}
  UNION ALL
  SELECT c.id FROM category c JOIN sub ON c.parent_id = sub.id
)
DELETE FROM category WHERE id IN (SELECT id FROM sub);`,
}

/** prev に入っている id は、表の上だけ parent_id を next の値に差し替える（循環した木は描けないため） */
function view(tree: Tree, nodes: Record<number, CellState>, prev?: Map<number, number | null>, next?: Map<number, number>): HView {
  return {
    tree,
    nodes,
    tables: [
      {
        title: 'category',
        columns: ['id', 'parent_id', 'name'],
        rows: [...tree]
          .sort((a, b) => a.id - b.id)
          .map((n) => ({
            key: String(n.id),
            cells: [n.id, next?.get(n.id) ?? n.parent, n.name],
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

  if (op === 'desc') {
    r.snap(1, `各行は親の id だけを持つ。「${nameOf(t, target)} より下の全部」を 1 回の索引の範囲で取る手段はないので、1 段ずつ下りる`, view(t, {}))
    r.stmts = 1
    r.read = 1
    let found = [target]
    let frontier = [target]
    r.snap([2, 3], `起点の ${target}（${nameOf(t, target)}）を主キーで引く。これが作業表（working table）の最初の中身`, view(t, paint(found, 'active')))
    let level = 1
    while (frontier.length > 0) {
      const next = frontier.flatMap((id) => childrenOf(t, id).map((c) => c.id))
      // parent_id の索引を、作業表の行の数だけ引く
      r.read += next.length
      if (next.length === 0) {
        r.snap([5, 6], `作業表の ${frontier.join(', ')} を親に持つ行を parent_id の索引で探す。1 行もないので作業表が空になり、再帰が止まる`, view(t, paint(found, 'good')))
        break
      }
      found = [...found, ...next]
      r.snap(
        [5, 6],
        `${level} 段目。作業表の ${frontier.join(', ')} を parent_id に持つ行を索引で引く → ${next.join(', ')}。見つかった行が次の作業表になる`,
        view(t, paint(next, 'window', paint(found, 'good'))),
      )
      frontier = next
      level++
    }
    r.snap(8, `${found.length} 行。木の深さだけ繰り返した。深い木ほど往復（再帰の段数）が増えるが、1 文で済むのは WITH RECURSIVE のおかげ`, view(t, paint(found, 'good')), true)
    return r.frames
  }

  if (op === 'anc') {
    const path = pathTo(t, target).reverse()
    r.stmts = 1
    r.read = 1
    r.snap([2, 3], `起点の ${target}（${nameOf(t, target)}）を引く。この行の parent_id が次に引く行`, view(t, paint([target], 'active')))
    for (let i = 1; i < path.length; i++) {
      r.read++
      r.snap([5, 6], `parent_id = ${path[i]} を主キーで引く（${nameOf(t, path[i]!)}）。先祖は 1 本道なので、段数ぶんの主キー検索で済む`, view(t, paint(path.slice(0, i + 1), 'good')))
    }
    r.snap(8, `根に着いた（parent_id が NULL）。${path.length} 行。先祖をたどるのは隣接リストでも安い`, view(t, paint(path, 'good')), true)
    return r.frames
  }

  if (op === 'add') {
    const after = addLeaf(t, target)
    r.snap(1, `${nameOf(t, target)} の下に ${NEW_NODE.name} を足す。必要なのは親の id だけ`, view(t, paint([target], 'window')))
    r.stmts = 1
    r.written = 1
    r.snap([1, 2], `1 行 INSERT して終わり。ほかの行には一切触らない`, view(after, paint([NEW_NODE.id], 'good')), true)
    return r.frames
  }

  if (op === 'move') {
    const sub = subtree(t, target)
    r.snap(1, `${nameOf(t, target)} の部分木（${sub.length} ノード）を ${nameOf(t, dest)} の下へ移す`, view(t, paint(sub, 'window', paint([dest], 'good'))))
    r.stmts = 1
    r.read = 1
    r.written = 1
    if (wouldCycle(t, target, dest)) {
      const loop = pathTo(t, dest).slice(pathTo(t, target).length - 1)
      r.snap(
        [1, 2, 3, 4],
        `1 行の UPDATE は成功してしまう。だが移動先 ${dest} は ${target} の子孫なので、${loop.join(' → ')} → ${target} という循環ができ、この部分木は根からたどれなくなる。再帰問い合わせは CYCLE 句か段数の上限がないと止まらない`,
        view(t, paint([target], 'active', paint(sub, 'bad')), new Map([[target, t.find((n) => n.id === target)!.parent]]), new Map([[target, dest]])),
        true,
      )
      return r.frames
    }
    const before = t.find((n) => n.id === target)!.parent
    const after = moveTo(t, target, dest)
    r.snap([1, 2, 3], `書き換えるのは ${target} の parent_id 1 か所だけ。子孫の行は「親が誰か」しか持っていないので、そのままついてくる`, view(after, paint(sub, 'window', paint([target], 'active')), new Map([[target, before]])), true)
    return r.frames
  }

  const sub = subtree(t, target)
  r.stmts = 1
  if (sub.length > 1) {
    r.snap([1, 2], `${target} だけを消そうとすると、子の行が parent_id = ${target} で参照しているため外部キー制約が拒否する。孤児が生まれないことを DB が保証している`, view(t, paint(childrenOf(t, target).map((c) => c.id), 'bad', paint([target], 'active'))))
    r.stmts = 2
  }
  r.read = sub.length
  r.snap([4, 5, 6, 7, 8], `部分木を再帰で集める（${sub.join(', ')}）。子孫を取る操作と同じく段数ぶん繰り返す`, view(t, paint(sub, 'window')))
  r.written = sub.length
  r.snap(9, `集めた ${sub.length} 行を消す。外部キーに ON DELETE CASCADE を付けておけば、根の 1 行を消すだけで DB が同じことをする`, view(t, paint(sub, 'bad')))
  r.snap(9, `削除後の木。部分木を集めるのに再帰が要るが、消すのは ${sub.length} 行だけで、ほかの行は変わらない`, view(removeSubtree(t, target), {}), true)
  return r.frames
}

const MODEL: Model = {
  title: '隣接リスト（親の id を持つ）',
  subtitle: '各行が親を 1 つ指すだけ。書き込みは 1 行で済むが、部分木は 1 段ずつ再帰で下りる',
  code: (op, a) => CODE[op](a),
  trace,
}

export default function AdjacencyList() {
  return <HierarchySim model={MODEL} />
}
