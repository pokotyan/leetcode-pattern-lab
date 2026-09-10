import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl, TextControl } from '../core/Controls'
import { parseTreeInput } from '../core/treeInput'
import { GraphView, type GEdge, type GNode } from '../views/GraphView'
import { layoutTree, type TreeNode } from '../views/treeLayout'
import { LegendItem } from '../views/Legend'
import type { CellState, Frame } from '../core/types'

const CODE = `def insert_into_bst(root, val):
    if not root:
        return TreeNode(val)
    node = root
    while True:
        if val < node.val:
            if not node.left:
                node.left = TreeNode(val)   # 空いている場所を見つけた
                return root
            node = node.left                 # まだ先がある。潜る
        else:
            if not node.right:
                node.right = TreeNode(val)
                return root
            node = node.right`

type View = { extraNodes: GNode[]; extraEdges: GEdge[]; states: Map<number, CellState> }
const NEW_ID = -1

function trace(root: TreeNode | null, val: number): Frame<View>[] {
  const frames: Frame<View>[] = []
  const states = new Map<number, CellState>()
  const layout = layoutTree(root)
  const posById = new Map(layout.nodes.map((n) => [n.id, n]))

  const snap = (
    line: number | number[],
    note: string,
    vars: Record<string, string | number>,
    extra: { parentId: number; x: number; y: number } | null = null,
    finished = false,
  ) => {
    const extraNodes: GNode[] = extra ? [{ id: NEW_ID, label: String(val), x: extra.x, y: extra.y, state: 'good' }] : []
    const extraEdges: GEdge[] = extra ? [{ from: extra.parentId, to: NEW_ID, state: 'good' }] : []
    frames.push({ line, note, vars, view: { extraNodes, extraEdges, states: new Map(states) }, done: finished })
  }

  if (!root) {
    snap([2, 3], '木が空。val だけを持つノードが新しい根になる', { val }, { parentId: -2, x: 60, y: 40 }, true)
    return frames
  }

  let node: TreeNode = root
  snap([4], `根(${node.val})から探索を始める`, { val, node: node.val as number })

  while (true) {
    states.set(node.id, 'active')
    const p = posById.get(node.id)!
    if (val < (node.val as number)) {
      snap([6], `${val} < ${node.val} なので左へ`, { val, node: node.val as number })
      if (!node.left) {
        snap(
          [7, 8],
          `左の子が空いている。ここに ${val} を新しいノードとして挿入`,
          { val, node: node.val as number },
          { parentId: node.id, x: p.x - 30, y: p.y + 60 },
          true,
        )
        return frames
      }
      snap([9], `左の子(${node.left.val})へ潜る`, { val, node: node.val as number })
      states.set(node.id, 'good')
      node = node.left
    } else {
      snap([11], `${val} >= ${node.val} なので右へ`, { val, node: node.val as number })
      if (!node.right) {
        snap(
          [12, 13],
          `右の子が空いている。ここに ${val} を新しいノードとして挿入`,
          { val, node: node.val as number },
          { parentId: node.id, x: p.x + 30, y: p.y + 60 },
          true,
        )
        return frames
      }
      snap([14], `右の子(${node.right.val})へ潜る`, { val, node: node.val as number })
      states.set(node.id, 'good')
      node = node.right
    }
  }
}

const PRESETS = [
  { name: '[4,2,7,1,3] + 5', value: { t: '4,2,7,1,3', v: 5 } },
  { name: '[4,2,7,1,3] + 0', value: { t: '4,2,7,1,3', v: 0 } },
  { name: '空の木 + 10', value: { t: '', v: 10 } },
]

export default function InsertIntoBST() {
  const [raw, setRaw] = useState('4,2,7,1,3')
  const [val, setVal] = useState(5)
  const root = useMemo(() => parseTreeInput(raw), [raw])
  const layout = useMemo(() => layoutTree(root), [root])
  const frames = useMemo(() => trace(root, val), [root, val])

  return (
    <SimShell
      title="Insert into a Binary Search Tree（探索と同じ道で潜っていく）"
      subtitle="挿入したい値と、通り道の値を比べながら、空いている場所を見つけるだけ"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="tree =" value={raw} onChange={setRaw} width={190} placeholder="空なら空の木" />
          <NumberControl label="val =" value={val} onChange={setVal} />
          <PresetControl
            presets={PRESETS}
            onPick={(v) => {
              setRaw(v.t)
              setVal(v.v)
            }}
          />
        </>
      }
      legend={
        <>
          <LegendItem state="active">今いるノード</LegendItem>
          <LegendItem state="good">通り過ぎたノード / 新しいノード</LegendItem>
        </>
      }
    >
      {(f) => (
        <GraphView
          nodes={[...layout.nodes.map((n) => ({ ...n, state: f.view.states.get(n.id) ?? 'idle' })), ...f.view.extraNodes]}
          edges={[...layout.edges, ...f.view.extraEdges]}
          directed={false}
          width={layout.width + 40}
          height={layout.height + 40}
        />
      )}
    </SimShell>
  )
}
