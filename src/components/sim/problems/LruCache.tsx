import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { LinkedListView, type LLNode, type LLPointer } from '../views/LinkedListView'
import { LegendItem } from '../views/Legend'
import type { Frame } from '../core/types'

const CODE = `class Node:
    def __init__(self, key, val):
        self.key, self.val = key, val
        self.prev = self.next = None

class LRUCache:
    def __init__(self, capacity):
        self.cap = capacity
        self.map = {}                      # key -> Node
        self.head = Node(0, 0)             # 番兵。head の次が最近使ったもの
        self.tail = Node(0, 0)             # 番兵。tail の前が最も古いもの
        self.head.next = self.tail
        self.tail.prev = self.head

    def _remove(self, node):
        node.prev.next = node.next
        node.next.prev = node.prev

    def _add_front(self, node):
        node.next = self.head.next
        node.prev = self.head
        self.head.next.prev = node
        self.head.next = node

    def get(self, key):
        if key not in self.map:
            return -1
        node = self.map[key]
        self._remove(node)
        self._add_front(node)              # 使ったので先頭へ移す
        return node.val

    def put(self, key, value):
        if key in self.map:
            self._remove(self.map[key])
        node = Node(key, value)
        self.map[key] = node
        self._add_front(node)
        if len(self.map) > self.cap:
            lru = self.tail.prev           # 一番古いもの
            self._remove(lru)
            del self.map[lru.key]`

type Op = ['put', number, number] | ['get', number]
type Case = { cap: number; ops: Op[] }
type View = { nodes: LLNode[]; pointers: LLPointer[]; keys: string; op: string; result: string }

function trace({ cap, ops }: Case): Frame<View>[] {
  // 先頭が最近使ったもの、末尾が一番古いもの
  const list: { key: number; val: number }[] = []
  const frames: Frame<View>[] = []

  const snap = (
    line: number | number[],
    note: string,
    opts: { op?: string; hit?: number; evict?: number; result?: string; finished?: boolean } = {},
  ) => {
    const nodes: LLNode[] = list.map((e, i) => ({
      id: String(e.key),
      value: `${e.key}:${e.val}`,
      nextId: i + 1 < list.length ? String(list[i + 1]!.key) : null,
      state:
        e.key === opts.evict ? 'bad' : e.key === opts.hit ? 'good' : i === list.length - 1 ? 'window' : 'idle',
    }))
    const pointers: LLPointer[] = []
    if (list.length > 0) {
      pointers.push({ name: '新しい', targetId: String(list[0]!.key), tone: 'accent' })
      pointers.push({ name: '古い', targetId: String(list[list.length - 1]!.key), tone: 'warn' })
    }
    frames.push({
      line,
      note,
      vars: {
        capacity: cap,
        件数: list.length,
        操作: opts.op ?? '−',
        戻り値: opts.result ?? '−',
      },
      view: {
        nodes,
        pointers,
        keys: list.map((e) => e.key).join(', ') || '（空）',
        op: opts.op ?? '',
        result: opts.result ?? '',
      },
      done: opts.finished,
    })
  }

  snap([10, 11], `容量 ${cap} のキャッシュ。双方向連結リストで「新しい順」に並べ、辞書で key からノードを直接引けるようにする`, {
    op: `LRUCache(${cap})`,
  })

  for (const op of ops) {
    if (op[0] === 'get') {
      const key = op[1]
      const idx = list.findIndex((e) => e.key === key)
      if (idx === -1) {
        snap([26, 27], `get(${key})。辞書に無いので −1`, { op: `get(${key})`, result: '-1' })
        continue
      }
      const [entry] = list.splice(idx, 1)
      list.unshift(entry!)
      snap([29, 30, 31], `get(${key})。見つかったので値 ${entry!.val} を返し、使ったぶん先頭へ移す`, {
        op: `get(${key})`,
        hit: key,
        result: String(entry!.val),
      })
    } else {
      const [, key, value] = op
      const idx = list.findIndex((e) => e.key === key)
      if (idx !== -1) {
        list.splice(idx, 1)
        snap([34, 35], `put(${key}, ${value})。すでにある key なので、いったんリストから外す`, {
          op: `put(${key}, ${value})`,
        })
      }
      list.unshift({ key, val: value })
      snap([36, 37, 38], `${key} を先頭に置く。先頭が「最近使ったもの」`, {
        op: `put(${key}, ${value})`,
        hit: key,
      })
      if (list.length > cap) {
        const lru = list[list.length - 1]!
        snap([39, 40, 41, 42], `件数が容量 ${cap} を超えた。末尾の ${lru.key} が一番長く使われていないので追い出す`, {
          op: `put(${key}, ${value})`,
          evict: lru.key,
        })
        list.pop()
      }
    }
  }
  snap(42, `完了。キャッシュの中身は [${list.map((e) => `${e.key}:${e.val}`).join(', ')}]`, { finished: true })
  return frames
}

const CASES: { name: string; value: Case }[] = [
  {
    name: 'LC146の例',
    value: {
      cap: 2,
      ops: [['put', 1, 1], ['put', 2, 2], ['get', 1], ['put', 3, 3], ['get', 2], ['put', 4, 4], ['get', 1], ['get', 3], ['get', 4]],
    },
  },
  {
    name: '同じ key を上書き',
    value: { cap: 2, ops: [['put', 1, 1], ['put', 2, 2], ['put', 1, 9], ['put', 3, 3], ['get', 2]] },
  },
  {
    name: '容量3',
    value: {
      cap: 3,
      ops: [['put', 1, 1], ['put', 2, 2], ['put', 3, 3], ['get', 1], ['put', 4, 4], ['get', 2]],
    },
  },
]

export default function LruCache() {
  const [c, setC] = useState<Case>(CASES[0]!.value)
  const frames = useMemo(() => trace(c), [c])

  return (
    <SimShell
      title="LRU Cache（辞書 + 双方向連結リスト）"
      subtitle="辞書で位置を一発で引き、連結リストで順番を O(1) で入れ替える。両方を同時に満たすための組み合わせ"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="操作列" presets={CASES} onPick={setC} />}
      legend={
        <>
          <LegendItem state="good">いま使った / 入れた</LegendItem>
          <LegendItem state="window">一番古い（次に追い出される）</LegendItem>
          <LegendItem state="bad">追い出す</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-2">
          <p className="m-0 font-mono text-xs">
            <span style={{ color: 'var(--accent)' }}>{f.view.op}</span>
            {f.view.result && (
              <span style={{ color: 'var(--ok)' }}> → {f.view.result}</span>
            )}
          </p>
          {f.view.nodes.length === 0 ? (
            <p className="m-0 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
              （空）
            </p>
          ) : (
            <div style={{ maxWidth: f.view.nodes.length * 92 + 60 }}>
              <LinkedListView nodes={f.view.nodes} pointers={f.view.pointers} gap={92} />
            </div>
          )}
          <p className="m-0 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            map のキー: {f.view.keys}
          </p>
        </div>
      )}
    </SimShell>
  )
}
