import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl, TextControl } from '../core/Controls'
import { parseTreeInput } from '../core/treeInput'
import { GraphView } from '../views/GraphView'
import { layoutTree, type TreeNode } from '../views/treeLayout'
import { LegendItem } from '../views/Legend'
import type { CellState, Frame } from '../core/types'

const CODE = `def is_valid_bst(root):
    def dfs(node, lo, hi):
        if not node:
            return True
        if not (lo < node.val < hi):
            return False              # 許される範囲からはみ出した
        # 左の部分木は (lo, node.val)、右の部分木は (node.val, hi) の範囲で
        return dfs(node.left, lo, node.val) and dfs(node.right, node.val, hi)
    return dfs(root, float("-inf"), float("inf"))`

type View = { states: Map<number, CellState> }

const fmt = (v: number) => (v === -Infinity ? '−∞' : v === Infinity ? '∞' : String(v))

function trace(root: TreeNode | null): Frame<View>[] {
  const frames: Frame<View>[] = []
  const states = new Map<number, CellState>()

  const snap = (
    line: number | number[],
    note: string,
    vars: Record<string, string | number>,
    finished = false,
  ) => {
    frames.push({ line, note, vars, view: { states: new Map(states) }, done: finished })
  }

  const dfs = (node: TreeNode | null, lo: number, hi: number): boolean => {
    if (!node) {
      snap([3, 4], 'None に着いた。ここは常に True', { lo: fmt(lo), hi: fmt(hi) })
      return true
    }
    states.set(node.id, 'active')
    snap([6], `node(${node.val}) は範囲 (${fmt(lo)}, ${fmt(hi)}) の中にいる必要がある`, {
      node: node.val as number,
      lo: fmt(lo),
      hi: fmt(hi),
    })
    if (!(lo < (node.val as number) && (node.val as number) < hi)) {
      states.set(node.id, 'bad')
      snap([7], `node(${node.val}) は範囲 (${fmt(lo)}, ${fmt(hi)}) からはみ出している。False 確定`, {
        node: node.val as number,
        lo: fmt(lo),
        hi: fmt(hi),
      }, true)
      return false
    }
    snap([9], `node(${node.val}) は範囲内。左は (${fmt(lo)}, ${node.val}) 、右は (${node.val}, ${fmt(hi)}) の範囲で調べる`, {
      node: node.val as number,
    })
    const leftOk = dfs(node.left, lo, node.val as number)
    if (!leftOk) return false
    const rightOk = dfs(node.right, node.val as number, hi)
    states.set(node.id, rightOk ? 'good' : 'bad')
    snap([9], `node(${node.val}) の左右とも確認できた`, { node: node.val as number })
    return rightOk
  }

  const ok = dfs(root, -Infinity, Infinity)
  snap(10, ok ? 'すべてのノードが範囲内。これは正しい二分探索木' : '途中で範囲外のノードが見つかった', {}, true)
  return frames
}

const PRESETS = [
  { name: '正しいBST [5,3,8,1,4,7,9]', value: '5,3,8,1,4,7,9' },
  { name: '一見それらしいが無効 [5,3,8,1,7,7,9]', value: '5,3,8,1,7,7,9' },
  { name: '左右逆 [5,8,3]', value: '5,8,3' },
]

export default function ValidateBST() {
  const [raw, setRaw] = useState('5,3,8,1,4,7,9')
  const root = useMemo(() => parseTreeInput(raw), [raw])
  const layout = useMemo(() => layoutTree(root), [root])
  const frames = useMemo(() => trace(root), [root])

  return (
    <SimShell
      title="Validate Binary Search Tree（範囲を渡す DFS）"
      subtitle="「左の子より大きい」だけでは不十分。部分木全体が範囲に収まっているかを渡しながら確認する"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="tree =" value={raw} onChange={setRaw} width={220} />
          <PresetControl presets={PRESETS} onPick={setRaw} />
        </>
      }
      legend={
        <>
          <LegendItem state="active">確認中</LegendItem>
          <LegendItem state="good">範囲内で確定</LegendItem>
          <LegendItem state="bad">範囲外</LegendItem>
        </>
      }
    >
      {(f) => (
        <GraphView
          nodes={layout.nodes.map((n) => ({ ...n, state: f.view.states.get(n.id) ?? 'idle' }))}
          edges={layout.edges}
          directed={false}
          width={layout.width}
          height={layout.height}
        />
      )}
    </SimShell>
  )
}
