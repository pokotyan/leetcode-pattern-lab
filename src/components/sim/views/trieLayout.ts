import type { GEdge, GNode } from './GraphView'
import type { CellState } from '../core/types'

export type TrieNode = {
  id: number
  char: string
  children: Map<string, TrieNode>
  word: boolean
}

let nextId = 0
export function newTrie(char = ''): TrieNode {
  return { id: nextId++, char, children: new Map(), word: false }
}

export function insertWord(root: TrieNode, word: string): TrieNode[] {
  let node = root
  const path = [root]
  for (const ch of word) {
    let child = node.children.get(ch)
    if (!child) {
      child = newTrie(ch)
      node.children.set(ch, child)
    }
    node = child
    path.push(node)
  }
  node.word = true
  return path
}

/**
 * トライを GraphView に渡せる形へ変換する。
 * 葉を左から順に並べ、内側のノードは子の中央に置く。
 * layoutTree は二分木の left/right 専用なので、子が何本でも扱えるこちらを使う。
 */
export function layoutTrie(
  root: TrieNode,
  states: Map<number, CellState> = new Map(),
  opts: { hGap?: number; vGap?: number; top?: number } = {},
): { nodes: GNode[]; edges: GEdge[]; width: number; height: number } {
  const hGap = opts.hGap ?? 52
  const vGap = opts.vGap ?? 58
  const top = opts.top ?? 30

  const nodes: GNode[] = []
  const edges: GEdge[] = []
  let slot = 0
  let maxDepth = 0

  const visit = (node: TrieNode, depth: number): number => {
    maxDepth = Math.max(maxDepth, depth)
    const kids = [...node.children.values()]
    let x: number
    if (kids.length === 0) {
      x = slot * hGap + hGap / 2
      slot += 1
    } else {
      const xs = kids.map((k) => visit(k, depth + 1))
      x = (xs[0]! + xs[xs.length - 1]!) / 2
    }
    nodes.push({
      id: node.id,
      label: node.char || '·',
      x,
      y: depth * vGap + top,
      state: states.get(node.id) ?? 'idle',
      badge: node.word ? '終' : undefined,
    })
    for (const k of kids) edges.push({ from: node.id, to: k.id, state: 'idle' })
    return x
  }
  visit(root, 0)

  return {
    nodes,
    edges,
    width: Math.max(slot * hGap, hGap) + hGap / 2,
    height: maxDepth * vGap + top + 34,
  }
}
