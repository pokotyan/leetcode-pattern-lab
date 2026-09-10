import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl, TextControl } from '../core/Controls'
import { parseTreeInput } from '../core/treeInput'
import { GraphView } from '../views/GraphView'
import { layoutTree, type TreeNode } from '../views/treeLayout'
import { LegendItem } from '../views/Legend'
import type { CellState, Frame } from '../core/types'

const CODE = `def max_depth(root):
    if not root:
        return 0
    left = max_depth(root.left)    # 左の部分木の深さ
    right = max_depth(root.right)  # 右の部分木の深さ
    return max(left, right) + 1    # 自分を含めた深さを返す`

type View = { nodeIds: number[]; states: Map<number, CellState>; badges: Map<number, number>; stack: string[] }

function trace(root: TreeNode | null): Frame<View>[] {
  const frames: Frame<View>[] = []
  const states = new Map<number, CellState>()
  const badges = new Map<number, number>()
  const stack: number[] = []

  const snap = (line: number | number[], note: string, finished = false) => {
    frames.push({
      line,
      note,
      vars: { 再帰の深さ: stack.length },
      view: {
        nodeIds: [],
        states: new Map(states),
        badges: new Map(badges),
        stack: stack.map((v) => `node(${v})`),
      },
      done: finished,
    })
  }

  const dfs = (node: TreeNode | null): number => {
    if (!node) {
      snap([2, 3], 'None に着いた。深さ 0 を返す')
      return 0
    }
    stack.push(node.val as number)
    states.set(node.id, 'active')
    snap([4], `node(${node.val}) の左の部分木を先に調べにいく`)
    const left = dfs(node.left)
    snap([5], `node(${node.val}) に戻ってきた。左の深さは ${left}。次は右の部分木`)
    const right = dfs(node.right)
    const depth = Math.max(left, right) + 1
    badges.set(node.id, depth)
    states.set(node.id, 'good')
    stack.pop()
    snap([6], `node(${node.val}) の深さ = max(左${left}, 右${right}) + 1 = ${depth}`)
    return depth
  }

  const result = dfs(root)
  snap(6, `根まで戻ってきた。木全体の深さは ${result}`, true)
  return frames
}

const PRESETS = [
  { name: '[3,9,20,null,null,15,7]', value: '3,9,20,null,null,15,7' },
  { name: '一直線（右だけ）', value: '1,null,2,null,3,null,4' },
  { name: 'バランス済み', value: '1,2,3,4,5,6,7' },
  { name: '根だけ', value: '1' },
]

export default function MaxDepthBinaryTree() {
  const [raw, setRaw] = useState('3,9,20,null,null,15,7')
  const root = useMemo(() => parseTreeInput(raw), [raw])
  const layout = useMemo(() => layoutTree(root), [root])
  const frames = useMemo(() => trace(root), [root])

  return (
    <SimShell
      title="Maximum Depth of Binary Tree（帰りがけで集約する DFS）"
      subtitle="子の答えが先に決まってから、自分の答えを計算する。これが「帰りがけ」の意味"
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
          <LegendItem state="active">今、再帰の中にいる</LegendItem>
          <LegendItem state="good">深さが確定した</LegendItem>
        </>
      }
    >
      {(f) => (
        <div>
          <GraphView
            nodes={layout.nodes.map((n) => ({
              ...n,
              state: f.view.states.get(n.id) ?? 'idle',
              badge: f.view.badges.get(n.id),
            }))}
            edges={layout.edges}
            directed={false}
            width={layout.width}
            height={layout.height}
          />
          <div className="mt-2 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            call stack: {f.view.stack.length ? f.view.stack.join(' → ') : '(空)'}
          </div>
        </div>
      )}
    </SimShell>
  )
}
