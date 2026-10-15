export type TNode = { id: number; name: string; parent: number | null }
export type Tree = TNode[]

export const SAMPLE: Tree = [
  { id: 1, name: '商品', parent: null },
  { id: 2, name: '家電', parent: 1 },
  { id: 3, name: '食品', parent: 1 },
  { id: 4, name: 'PC', parent: 2 },
  { id: 5, name: 'カメラ', parent: 2 },
  { id: 6, name: '飲料', parent: 3 },
  { id: 7, name: 'ノート', parent: 4 },
  { id: 8, name: 'デスク', parent: 4 },
  { id: 9, name: 'お茶', parent: 6 },
  { id: 10, name: '水', parent: 6 },
]

/** 追加操作で入れるノード */
export const NEW_NODE = { id: 11, name: 'スマホ' }

export const byId = (t: Tree) => new Map(t.map((n) => [n.id, n]))

export const childrenOf = (t: Tree, id: number) => t.filter((n) => n.parent === id)

export const root = (t: Tree) => t.find((n) => n.parent === null)!

/** 自分を含む部分木を行きがけ順で返す */
export function subtree(t: Tree, id: number): number[] {
  const out: number[] = []
  const visit = (x: number) => {
    out.push(x)
    for (const c of childrenOf(t, x)) visit(c.id)
  }
  visit(id)
  return out
}

/** 根から自分までの経路（自分を含む） */
export function pathTo(t: Tree, id: number): number[] {
  const m = byId(t)
  const out: number[] = []
  for (let cur = m.get(id); cur; cur = cur.parent === null ? undefined : m.get(cur.parent)) out.unshift(cur.id)
  return out
}

export const depthOf = (t: Tree, id: number) => pathTo(t, id).length - 1

export const preorder = (t: Tree) => subtree(t, root(t).id)

export const nameOf = (t: Tree, id: number) => byId(t).get(id)?.name ?? String(id)

/** 葉を左から等間隔に並べ、親は子の中央に置く */
export function layout(t: Tree, opts: { hGap?: number; vGap?: number; top?: number } = {}) {
  const hGap = opts.hGap ?? 62
  const vGap = opts.vGap ?? 58
  const top = opts.top ?? 26
  const pos = new Map<number, { x: number; y: number }>()
  let leaf = 0
  const place = (id: number, depth: number): number => {
    const kids = childrenOf(t, id)
    const x =
      kids.length === 0
        ? leaf++ * hGap + hGap / 2
        : kids.map((k) => place(k.id, depth + 1)).reduce((a, b) => a + b, 0) / kids.length
    pos.set(id, { x, y: depth * vGap + top })
    return x
  }
  place(root(t).id, 0)
  const maxDepth = Math.max(...t.map((n) => depthOf(t, n.id)))
  return { pos, width: Math.max(leaf, 1) * hGap, height: maxDepth * vGap + top + 26 }
}

export const addLeaf = (t: Tree, parent: number): Tree => [...t, { ...NEW_NODE, parent }]

export const moveTo = (t: Tree, id: number, dest: number): Tree =>
  t.map((n) => (n.id === id ? { ...n, parent: dest } : n))

export function removeSubtree(t: Tree, id: number): Tree {
  const gone = new Set(subtree(t, id))
  return t.filter((n) => !gone.has(n.id))
}

/** dest が id の部分木の中にあるか。隣接リストではこの移動で循環ができる */
export const wouldCycle = (t: Tree, id: number, dest: number) => subtree(t, id).includes(dest)
