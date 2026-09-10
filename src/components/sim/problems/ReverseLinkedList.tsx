import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl, TextControl, parseNums } from '../core/Controls'
import { LinkedListView, type LLNode, type LLPointer } from '../views/LinkedListView'
import { LegendItem } from '../views/Legend'
import type { Frame, CellState } from '../core/types'

const CODE = `def reverse_list(head):
    prev = None
    cur = head
    while cur:
        next_node = cur.next   # 次のノードを先に退避しておく
        cur.next = prev        # 今のノードの矢印を、前のノードへ向け直す
        prev = cur              # prev を1つ進める
        cur = next_node          # cur も1つ進める（退避しておいた next へ）
    return prev                  # 最後に prev が新しい先頭`

type View = { nodes: LLNode[]; pointers: LLPointer[] }

function trace(values: number[]): Frame<View>[] {
  const ids = values.map((_, i) => `n${i}`)
  const nextOf = new Map<string, string | null>()
  for (let i = 0; i < ids.length; i++) nextOf.set(ids[i]!, i + 1 < ids.length ? ids[i + 1]! : null)

  const frames: Frame<View>[] = []
  const buildNodes = (): LLNode[] =>
    ids.map((id, i) => ({ id, value: values[i]!, nextId: nextOf.get(id) ?? null }))

  const snap = (
    line: number | number[],
    note: string,
    prev: string | null,
    cur: string | null,
    nextNode: string | null,
    finished = false,
  ) => {
    const nodes: LLNode[] = buildNodes().map((n) => {
      const state: CellState = n.id === cur ? 'active' : n.id === prev ? 'good' : 'idle'
      return { ...n, state }
    })
    const pointers: LLPointer[] = [
      { name: 'prev', targetId: prev, tone: 'ok' },
      { name: 'cur', targetId: cur, tone: 'accent' },
    ]
    if (nextNode) pointers.push({ name: 'next_node', targetId: nextNode, tone: 'warn' })
    frames.push({
      line,
      note,
      vars: { prev: prev ?? 'None', cur: cur ?? 'None' },
      view: { nodes, pointers },
      done: finished,
    })
  }

  if (ids.length === 0) {
    snap([2], 'リストが空。prev=None のまま終わる', null, null, null, true)
    return frames
  }

  let prev: string | null = null
  let cur: string | null = ids[0]!
  snap([2, 3], 'prev=None、cur=head からスタート', prev, cur, null)

  while (cur) {
    const nextNode: string | null = nextOf.get(cur) ?? null
    snap([5], `next_node に、cur の次（${nextNode ?? 'None'}）を先に退避しておく`, prev, cur, nextNode)
    nextOf.set(cur, prev)
    snap([6], `cur の矢印を prev（${prev ?? 'None'}）へ向け直す`, prev, cur, nextNode)
    prev = cur
    cur = nextNode
    snap([7, 8], `prev と cur を、両方とも1つ先へ進める`, prev, cur, null)
  }
  snap(9, 'cur が None になった。prev が新しい先頭', prev, cur, null, true)
  return frames
}

const PRESETS = [
  { name: '[1,2,3,4,5]', value: '1, 2, 3, 4, 5' },
  { name: '要素が1個', value: '7' },
  { name: '要素が2個', value: '1, 2' },
]

export default function ReverseLinkedList() {
  const [raw, setRaw] = useState('1, 2, 3, 4, 5')
  const values = useMemo(() => parseNums(raw, [1, 2, 3, 4, 5]).slice(0, 7), [raw])
  const frames = useMemo(() => trace(values), [values])

  return (
    <SimShell
      title="Reverse Linked List（矢印の向きを1つずつ付け替える）"
      subtitle="next を先に退避してから付け替える。順番を間違えるとリストが千切れる"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="list =" value={raw} onChange={setRaw} width={170} />
          <PresetControl presets={PRESETS} onPick={setRaw} />
        </>
      }
      legend={
        <>
          <LegendItem state="active">cur</LegendItem>
          <LegendItem state="good">反転済み（prev 側）</LegendItem>
        </>
      }
    >
      {(f) => <LinkedListView nodes={f.view.nodes} pointers={f.view.pointers} />}
    </SimShell>
  )
}
