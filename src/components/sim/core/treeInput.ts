import type { TreeNode } from '../views/treeLayout'

/**
 * LeetCode 形式（レベル順、null で欠損を表す）の文字列から二分木を作る。
 * 例: "3,9,20,null,null,15,7"
 */
export function parseTreeInput(raw: string): TreeNode | null {
  const tokens = raw
    .replace(/[[\]\s]/g, '')
    .split(',')
    .filter((t) => t.length > 0)
  if (tokens.length === 0 || tokens[0] === 'null') return null

  let idCounter = 0
  const makeNode = (val: number): TreeNode => ({ id: idCounter++, val, left: null, right: null })

  const root = makeNode(Number(tokens[0]))
  const queue: TreeNode[] = [root]
  let i = 1
  while (queue.length > 0 && i < tokens.length) {
    const node = queue.shift()!
    if (i < tokens.length) {
      const lt = tokens[i++]
      if (lt !== undefined && lt !== 'null') {
        node.left = makeNode(Number(lt))
        queue.push(node.left)
      }
    }
    if (i < tokens.length) {
      const rt = tokens[i++]
      if (rt !== undefined && rt !== 'null') {
        node.right = makeNode(Number(rt))
        queue.push(node.right)
      }
    }
  }
  return root
}

/** 二分探索木の性質を満たすように、ソート済みの値から左右対称に木を作る */
export function buildBstFromSorted(values: number[]): TreeNode | null {
  let idCounter = 0
  const build = (lo: number, hi: number): TreeNode | null => {
    if (lo > hi) return null
    const mid = Math.floor((lo + hi) / 2)
    const node: TreeNode = { id: idCounter++, val: values[mid]!, left: null, right: null }
    node.left = build(lo, mid - 1)
    node.right = build(mid + 1, hi)
    return node
  }
  return build(0, values.length - 1)
}
