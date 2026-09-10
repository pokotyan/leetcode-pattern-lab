import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl, TextControl, parseNums } from '../core/Controls'
import { LinkedListView, type LLNode, type LLPointer } from '../views/LinkedListView'
import { LegendItem } from '../views/Legend'
import type { Frame, CellState } from '../core/types'

const CODE = `def has_cycle(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next        # 1歩ずつ進む
        fast = fast.next.next   # 2歩ずつ進む
        if slow is fast:
            return True         # 追いついた = 輪っかがある
    return False                 # fast が None に着いた = 輪っかは無い`

type View = { nodes: LLNode[]; pointers: LLPointer[] }

/** cyclePos が -1 なら輪っかなし。それ以外なら、末尾が cyclePos 番目のノードへ戻る */
function trace(values: number[], cyclePos: number): Frame<View>[] {
  const ids = values.map((_, i) => `n${i}`)
  const n = ids.length
  const nextIdx = (i: number): number | null => (i + 1 < n ? i + 1 : cyclePos >= 0 && cyclePos < n ? cyclePos : null)

  const buildNodes = (): LLNode[] =>
    ids.map((id, i) => ({ id, value: values[i]!, nextId: nextIdx(i) !== null ? ids[nextIdx(i)!]! : null }))

  const frames: Frame<View>[] = []
  const snap = (
    line: number | number[],
    note: string,
    slow: number | null,
    fast: number | null,
    finished = false,
  ) => {
    const nodes: LLNode[] = buildNodes().map((nd, i) => {
      const state: CellState = i === slow && i === fast ? 'active' : i === slow ? 'good' : i === fast ? 'window' : 'idle'
      return { ...nd, state }
    })
    const pointers: LLPointer[] = [
      { name: 'slow', targetId: slow !== null ? ids[slow]! : null, tone: 'ok' },
      { name: 'fast', targetId: fast !== null ? ids[fast]! : null, tone: 'warn' },
    ]
    frames.push({
      line,
      note,
      vars: { slow: slow !== null ? values[slow] : 'None', fast: fast !== null ? values[fast] : 'None' },
      view: { nodes, pointers },
      done: finished,
    })
  }

  if (n === 0) {
    snap([2], 'リストが空。輪っかは無い', null, null, true)
    return frames
  }

  let slow: number | null = 0
  let fast: number | null = 0
  snap([2], 'slow と fast、両方とも head から出発する', slow, fast)

  let guard = 0
  while (fast !== null && nextIdx(fast) !== null && guard++ < 40) {
    const fastNext1 = nextIdx(fast)!
    const fastNext2 = nextIdx(fastNext1)
    slow = nextIdx(slow!)
    fast = fastNext2
    snap([4, 5], `slow は1歩、fast は2歩進む`, slow, fast)
    if (slow === fast) {
      snap([6, 7], `slow と fast が同じノードに来た。追いついたということは、輪っかの中をぐるぐる回っていた証拠。True`, slow, fast, true)
      return frames
    }
  }
  snap(8, `fast が None（またはその手前）に着いた。追いつかれずに端まで行けたということは、輪っかは無い。False`, slow, fast, true)
  return frames
}

const PRESETS = [
  { name: '輪っかなし', value: { a: '3, 2, 0, -4', c: -1 } },
  { name: '末尾が1番目に戻る', value: { a: '3, 2, 0, -4', c: 1 } },
  { name: '末尾が先頭に戻る', value: { a: '1, 2', c: 0 } },
]

export default function LinkedListCycle() {
  const [raw, setRaw] = useState('3, 2, 0, -4')
  const [cyclePos, setCyclePos] = useState(1)
  const values = useMemo(() => parseNums(raw, [3, 2, 0, -4]).slice(0, 8), [raw])
  const frames = useMemo(() => trace(values, Math.min(cyclePos, values.length - 1)), [values, cyclePos])

  return (
    <SimShell
      title="Linked List Cycle（Slow / Fast Pointers）"
      subtitle="速さの違う2人が同じ輪っかを走れば、遅いほうは必ず追いつかれる"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="list =" value={raw} onChange={setRaw} width={170} />
          <NumberControl label="pos（-1で輪っかなし） =" value={cyclePos} onChange={setCyclePos} min={-1} />
          <PresetControl
            presets={PRESETS}
            onPick={(v) => {
              setRaw(v.a)
              setCyclePos(v.c)
            }}
          />
        </>
      }
      legend={
        <>
          <LegendItem state="good">slow</LegendItem>
          <LegendItem state="window">fast</LegendItem>
          <LegendItem state="active">2つが重なっている</LegendItem>
        </>
      }
    >
      {(f) => <LinkedListView nodes={f.view.nodes} pointers={f.view.pointers} />}
    </SimShell>
  )
}
