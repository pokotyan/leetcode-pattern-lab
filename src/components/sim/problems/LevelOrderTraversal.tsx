import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl, TextControl } from '../core/Controls'
import { parseTreeInput } from '../core/treeInput'
import { GraphView } from '../views/GraphView'
import { layoutTree, type TreeNode } from '../views/treeLayout'
import { LegendItem } from '../views/Legend'
import type { CellState, Frame } from '../core/types'

const CODE = `from collections import deque

def level_order(root):
    if not root:
        return []
    result = []
    queue = deque([root])
    while queue:
        level_size = len(queue)      # 「今の階層」に何個あるか、先に数えておく
        level = []
        for _ in range(level_size):
            node = queue.popleft()
            level.append(node.val)
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
        result.append(level)          # 1階層ぶんをまとめて追加
    return result`

type View = {
  states: Map<number, CellState>
  queueLabels: string[]
  result: (number | string)[][]
  currentLevel: (number | string)[]
}

function trace(root: TreeNode | null): Frame<View>[] {
  const frames: Frame<View>[] = []
  const states = new Map<number, CellState>()
  const result: (number | string)[][] = []

  const snap = (
    line: number | number[],
    note: string,
    queue: TreeNode[],
    currentLevel: (number | string)[],
    finished = false,
  ) => {
    frames.push({
      line,
      note,
      vars: { 'queueの長さ': queue.length, 階層数: result.length },
      view: {
        states: new Map(states),
        queueLabels: queue.map((n) => String(n.val)),
        result: result.map((r) => [...r]),
        currentLevel: [...currentLevel],
      },
      done: finished,
    })
  }

  if (!root) {
    snap([4, 5], 'root が無い。空の結果を返す', [], [], true)
    return frames
  }

  const queue: TreeNode[] = [root]
  states.set(root.id, 'window')
  snap([7], 'root だけをキューに入れてスタート', queue, [])

  while (queue.length > 0) {
    const levelSize = queue.length
    snap([9], `この階層には ${levelSize} 個のノードがある。これを先に数えておくのがポイント`, queue, [])
    const level: (number | string)[] = []
    for (let k = 0; k < levelSize; k++) {
      const node = queue.shift()!
      states.set(node.id, 'active')
      level.push(node.val)
      snap([12, 13], `node(${node.val}) を取り出して、この階層の記録に加える`, queue, level)
      if (node.left) {
        queue.push(node.left)
        states.set(node.left.id, 'window')
        snap([14, 15], `node(${node.val}) の左の子 ${node.left.val} をキューへ（次の階層になる）`, queue, level)
      }
      if (node.right) {
        queue.push(node.right)
        states.set(node.right.id, 'window')
        snap([16, 17], `node(${node.val}) の右の子 ${node.right.val} をキューへ`, queue, level)
      }
      states.set(node.id, 'good')
    }
    result.push(level)
    snap([18], `この階層 [${level.join(', ')}] を結果に追加`, queue, [])
  }
  snap(19, `キューが空になった。全 ${result.length} 階層を取得済み`, [], [], true)
  return frames
}

const PRESETS = [
  { name: '[3,9,20,null,null,15,7]', value: '3,9,20,null,null,15,7' },
  { name: 'バランス済み', value: '1,2,3,4,5,6,7' },
  { name: '一直線（左だけ）', value: '1,2,null,3,null,4' },
]

export default function LevelOrderTraversal() {
  const [raw, setRaw] = useState('3,9,20,null,null,15,7')
  const root = useMemo(() => parseTreeInput(raw), [raw])
  const layout = useMemo(() => layoutTree(root), [root])
  const frames = useMemo(() => trace(root), [root])

  return (
    <SimShell
      title="Binary Tree Level Order Traversal（BFS で階層ごとに処理）"
      subtitle="キューに入れる前に「今の階層のサイズ」を数えておくと、階層の境目がわかる"
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
          <LegendItem state="window">キューの中</LegendItem>
          <LegendItem state="active">今取り出した</LegendItem>
          <LegendItem state="good">処理済み</LegendItem>
        </>
      }
    >
      {(f) => (
        <div>
          <GraphView
            nodes={layout.nodes.map((n) => ({ ...n, state: f.view.states.get(n.id) ?? 'idle' }))}
            edges={layout.edges}
            directed={false}
            width={layout.width}
            height={layout.height}
          />
          <div className="mt-2 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            queue: [{f.view.queueLabels.join(', ')}]
          </div>
          <div className="mt-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            result = [
            {f.view.result.map((r, i) => (
              <span key={i} style={{ color: 'var(--ok)' }}>
                {i > 0 && ', '}[{r.join(',')}]
              </span>
            ))}
            {f.view.currentLevel.length > 0 && (
              <span style={{ color: 'var(--accent)' }}>
                {f.view.result.length > 0 && ', '}
                [{f.view.currentLevel.join(',')}…]
              </span>
            )}
            ]
          </div>
        </div>
      )}
    </SimShell>
  )
}
