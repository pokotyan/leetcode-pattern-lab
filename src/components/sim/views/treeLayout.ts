import type { GEdge, GNode } from './GraphView'
import type { CellState } from '../core/types'

export type TreeNode = {
  id: number
  val: number | string
  left: TreeNode | null
  right: TreeNode | null
}

/**
 * 二分木を GraphView に渡せる形へ変換する。
 * x はノードの in-order 順（左から右への横位置）、y は深さで決める。
 * これだけで、それらしい二分木のレイアウトになる。
 */
export function layoutTree(
  root: TreeNode | null | undefined,
  opts: { width?: number; hGap?: number; vGap?: number; top?: number } = {},
): { nodes: GNode[]; edges: GEdge[]; width: number; height: number } {
  const hGap = opts.hGap ?? 56
  const vGap = opts.vGap ?? 64
  const top = opts.top ?? 34

  const nodes: GNode[] = []
  const edges: GEdge[] = []
  let xCounter = 0

  const visit = (node: TreeNode | null | undefined, depth: number) => {
    if (!node) return
    visit(node.left, depth + 1)
    const x = xCounter * hGap + hGap / 2
    xCounter += 1
    const y = depth * vGap + top
    nodes.push({ id: node.id, label: String(node.val), x, y })
    if (node.left) edges.push({ from: node.id, to: node.left.id })
    if (node.right) edges.push({ from: node.id, to: node.right.id })
    visit(node.right, depth + 1)
  }
  visit(root, 0)

  const width = Math.max(xCounter * hGap, hGap)
  let maxDepth = 0
  const depthOf = (node: TreeNode | null | undefined, d: number): void => {
    if (!node) return
    maxDepth = Math.max(maxDepth, d)
    depthOf(node.left, d + 1)
    depthOf(node.right, d + 1)
  }
  depthOf(root, 0)
  const height = maxDepth * vGap + top + 30

  return { nodes, edges, width: opts.width ?? width, height }
}

/** 状態マップを適用したノード配列を作る（層ごとの色分けなどに使う） */
export function withNodeStates(
  nodes: GNode[],
  states: Map<number, CellState>,
  badges?: Map<number, string | number>,
): GNode[] {
  return nodes.map((n) => ({
    ...n,
    state: states.get(n.id) ?? n.state,
    badge: badges?.get(n.id) ?? n.badge,
  }))
}
