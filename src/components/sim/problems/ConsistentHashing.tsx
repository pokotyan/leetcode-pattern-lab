import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `import bisect

class HashRing:
    def __init__(self, nodes, vnodes=1):
        self.ring = []                       # (位置, ノード名) を位置順に保つ
        for n in nodes:
            for i in range(vnodes):
                self.ring.append((hash_ring(f"{n}#{i}"), n))
        self.ring.sort()

    def node_for(self, key):
        pos = hash_ring(key)
        i = bisect.bisect_left(self.ring, (pos, ''))   # pos 以上で最初の点
        if i == len(self.ring):
            i = 0                            # 一周して先頭に戻る
        return self.ring[i][1]`

const M = 32

/**
 * FNV-1a に murmur3 の最終撹拌を足したもの。
 * 単純な積和だけだと "A" と "B" のように似た入力が近い位置に落ちてしまい、
 * リングが偏って Consistent Hashing の利点が出ない。
 */
const hashRing = (s: string) => {
  let h = 2166136261 >>> 0
  for (const c of s) {
    h ^= c.charCodeAt(0)
    h = Math.imul(h, 16777619) >>> 0
  }
  h ^= h >>> 16
  h = Math.imul(h, 2246822507) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 3266489909) >>> 0
  h ^= h >>> 16
  return (h >>> 0) % M
}

type Input = { nodes: string[]; added: string; keys: string[]; vnodes: number }
type Row = { key: string; pos: number; before: string; after: string | null }
type View = { ring: Cell[]; rows: Row[]; moved: number; modMoved: number; phase: string }

function assign(ring: { pos: number; node: string }[], key: string): string {
  const p = hashRing(key)
  const sorted = [...ring].sort((a, b) => a.pos - b.pos || a.node.localeCompare(b.node))
  for (const r of sorted) if (r.pos >= p) return r.node
  return sorted[0]!.node
}

function trace({ nodes, added, keys, vnodes }: Input): Frame<View>[] {
  const frames: Frame<View>[] = []
  const mkRing = (ns: string[]) =>
    ns.flatMap((n) =>
      Array.from({ length: vnodes }, (_, i) => ({ pos: hashRing(`${n}#${i}`), node: n })),
    )

  const before = mkRing(nodes)
  const after = mkRing([...nodes, added])
  const assignBefore = new Map(keys.map((k) => [k, assign(before, k)]))
  const assignAfter = new Map(keys.map((k) => [k, assign(after, k)]))

  // 比較用: ノード数で割った余りで決める素朴な方式
  const modBefore = new Map(keys.map((k) => [k, nodes[hashRing(k) % nodes.length]!]))
  const allNodes = [...nodes, added]
  const modAfter = new Map(keys.map((k) => [k, allNodes[hashRing(k) % allNodes.length]!]))
  const modMoved = keys.filter((k) => modBefore.get(k) !== modAfter.get(k)).length

  const snap = (
    line: number | number[],
    note: string,
    opts: {
      ring: { pos: number; node: string }[]
      rows: Row[]
      phase: string
      cur?: number
      moved?: number
      finished?: boolean
    },
  ) => {
    const byPos = new Map<number, string>()
    for (const r of opts.ring) byPos.set(r.pos, r.node)
    const keyPos = new Set(opts.rows.map((r) => r.pos))
    const movedPos = new Set(opts.rows.filter((r) => r.after && r.before !== r.after).map((r) => r.pos))
    const cells: Cell[] = Array.from({ length: M }, (_, i) => {
      const node = byPos.get(i)
      let state: Cell['state'] = 'idle'
      if (keyPos.has(i)) state = movedPos.has(i) ? 'bad' : 'window'
      if (node) state = 'good'
      if (i === opts.cur) state = 'active'
      return { value: node ?? (keyPos.has(i) ? '·' : ''), state, note: String(i) }
    })
    frames.push({
      line,
      note,
      vars: {
        ノード数: new Set(opts.ring.map((r) => r.node)).size,
        リング上の点: opts.ring.length,
        移動したキー: opts.moved ?? '−',
      },
      view: { ring: cells, rows: opts.rows, moved: opts.moved ?? 0, modMoved, phase: opts.phase },
      done: opts.finished,
    })
  }

  const rows0: Row[] = keys.map((k) => ({
    key: k,
    pos: hashRing(k),
    before: assignBefore.get(k)!,
    after: null,
  }))

  snap([5, 9], `${M} 個の位置を持つ円（リング）の上に、ノードをハッシュで配置する。${nodes.join(', ')} がそれぞれ ${vnodes} 点ずつ乗る`, {
    ring: before,
    rows: rows0,
    phase: '配置',
  })

  keys.forEach((k, i) => {
    snap([12, 13], `キー "${k}" の位置は ${hashRing(k)}。そこから時計回りに進んで最初に出会うノードが担当。→ ${assignBefore.get(k)}`, {
      ring: before,
      rows: rows0.slice(0, i + 1),
      phase: '割り当て',
      cur: hashRing(k),
    })
  })

  snap(16, `${keys.length} 個のキーが割り当てられた。ここでノード ${added} を追加してみる`, {
    ring: before,
    rows: rows0,
    phase: '割り当て完了',
  })

  const rows1: Row[] = keys.map((k) => ({
    key: k,
    pos: hashRing(k),
    before: assignBefore.get(k)!,
    after: assignAfter.get(k)!,
  }))
  const moved = rows1.filter((r) => r.before !== r.after).length

  snap([5, 9], `${added} をリング上に置いた。移動が必要なのは、${added} の直前の区間にいたキーだけ`, {
    ring: after,
    rows: rows1,
    phase: 'ノード追加',
    moved,
  })

  snap(16, `移動したキーは ${keys.length} 個中 ${moved} 個。ノード数で割る素朴な方式なら ${modMoved} 個が動いていた`, {
    ring: after,
    rows: rows1,
    phase: '完了',
    moved,
    finished: true,
  })
  return frames
}

const KEYS10 = Array.from({ length: 10 }, (_, i) => `key${i + 1}`)
const KEYS8 = Array.from({ length: 8 }, (_, i) => `key${i + 1}`)

const PRESETS: { name: string; value: Input }[] = [
  { name: '3ノードに追加', value: { nodes: ['A', 'B', 'C'], added: 'D', keys: KEYS10, vnodes: 1 } },
  { name: '仮想ノード3点', value: { nodes: ['A', 'B', 'C'], added: 'D', keys: KEYS10, vnodes: 3 } },
  { name: '2ノードに追加', value: { nodes: ['A', 'B'], added: 'C', keys: KEYS8, vnodes: 1 } },
]

export default function ConsistentHashing() {
  const [input, setInput] = useState<Input>(PRESETS[0]!.value)
  const frames = useMemo(() => trace(input), [input])

  return (
    <SimShell
      title="Consistent Hashing（ノードが増えても、動くキーは一部だけ）"
      subtitle="キーもノードも同じ円の上に置き、時計回りで最初に出会うノードが担当する"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="入力" presets={PRESETS} onPick={setInput} />}
      legend={
        <>
          <LegendItem state="good">ノードの位置</LegendItem>
          <LegendItem state="window">キーの位置</LegendItem>
          <LegendItem state="bad">担当が変わったキー</LegendItem>
          <LegendItem state="active">いま見ている位置</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <p className="m-0 font-mono text-[11px]" style={{ color: 'var(--accent)' }}>
            {f.view.phase}
          </p>
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              リング（0 から {M - 1}。右端の次は左端に戻る）
            </p>
            <ArrayView cells={f.view.ring} showIndex={false} size={30} />
          </div>
          <table
            className="m-0 border-collapse font-mono text-xs"
            style={{ display: 'table', width: 'auto' }}
          >
            <thead>
              <tr style={{ color: 'var(--fg-muted)' }}>
                <th className="px-2 py-1 text-left">キー</th>
                <th className="px-2 py-1 text-right">位置</th>
                <th className="px-2 py-1 text-left">担当</th>
                <th className="px-2 py-1 text-left">追加後</th>
              </tr>
            </thead>
            <tbody>
              {f.view.rows.map((r) => {
                const changed = r.after !== null && r.before !== r.after
                return (
                  <tr key={r.key} style={{ color: changed ? 'var(--danger)' : 'var(--fg-muted)' }}>
                    <td className="px-2 py-1">{r.key}</td>
                    <td className="px-2 py-1 text-right">{r.pos}</td>
                    <td className="px-2 py-1">{r.before}</td>
                    <td className="px-2 py-1">{r.after ?? '·'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {f.view.moved > 0 && (
            <p className="m-0 font-mono text-xs">
              <span style={{ color: 'var(--ok)' }}>この方式: {f.view.moved} 個が移動</span>
              <span style={{ color: 'var(--danger)' }}>　余りで決める方式: {f.view.modMoved} 個が移動</span>
            </p>
          )}
        </div>
      )}
    </SimShell>
  )
}
