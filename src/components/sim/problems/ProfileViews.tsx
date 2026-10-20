import { useMemo, useState, type ReactElement } from 'react'
import { SimShell } from '../core/SimShell'
import { Field, PresetControl } from '../core/Controls'
import type { Frame } from '../core/types'

const CODE = `samples = []
while running:
    sleep(0.010)                # 100 Hz
    stack = read_stack(target)  # 根から葉への列
    samples.append(stack)

def fold(samples):              # 木にまとめる
    root = Node("all")
    for stack in samples:
        node = root
        for fn in stack:
            node = node.child(fn)  # 同じ経路は同じ箱
            node.total += 1
        node.self += 1          # 葉だけが self
    return root

def by_function(samples):       # 関数ごとに数える
    self_, total = Counter(), Counter()
    for stack in samples:
        self_[stack[-1]] += 1
        for fn in set(stack):   # 再帰を二重に数えない
            total[fn] += 1
    return self_, total`

type Stack = string[]
type ViewMode = 'flamegraph' | 'flamechart' | 'calltree' | 'bottomup'
type View = { count: number; latest: Stack | null }

const P: Stack = ['main', 'handle', 'parseJSON']
const T: Stack = ['main', 'handle', 'render', 'template']
const Et: Stack = ['main', 'handle', 'render', 'template', 'escapeHTML']
const El: Stack = ['main', 'handle', 'logLine', 'escapeHTML']

// 本文の Go の実測（parseJSON 28%、template 自身 8%、template 経由の escapeHTML 35%、logLine 経由 27%）を 20 件に丸めた
const PRESETS: { name: string; value: Stack[] }[] = [
  {
    name: 'リクエストごとに交互',
    value: [P, P, P, T, Et, Et, Et, El, El, P, P, P, T, Et, Et, Et, Et, El, El, El],
  },
  {
    name: '段階ごとにまとめて',
    value: [P, P, P, P, P, P, T, Et, Et, Et, Et, T, Et, Et, Et, El, El, El, El, El],
  },
]

const MODES: { id: ViewMode; label: string }[] = [
  { id: 'flamegraph', label: 'フレームグラフ' },
  { id: 'flamechart', label: 'フレームチャート' },
  { id: 'calltree', label: 'コールツリー' },
  { id: 'bottomup', label: 'ボトムアップ' },
]

type Node = { name: string; total: number; self: number; children: Map<string, Node> }

function fold(samples: Stack[]): Node {
  const root: Node = { name: 'all', total: 0, self: 0, children: new Map() }
  for (const stack of samples) {
    root.total++
    let node = root
    for (const fn of stack) {
      let next = node.children.get(fn)
      if (!next) {
        next = { name: fn, total: 0, self: 0, children: new Map() }
        node.children.set(fn, next)
      }
      next.total++
      node = next
    }
    node.self++
  }
  return root
}

function byFunction(samples: Stack[]) {
  const self = new Map<string, number>()
  const total = new Map<string, number>()
  const callers = new Map<string, Map<string, number>>()
  for (const stack of samples) {
    const leaf = stack[stack.length - 1]!
    self.set(leaf, (self.get(leaf) ?? 0) + 1)
    const caller = stack[stack.length - 2] ?? '(根)'
    const m = callers.get(leaf) ?? new Map<string, number>()
    m.set(caller, (m.get(caller) ?? 0) + 1)
    callers.set(leaf, m)
    for (const fn of new Set(stack)) total.set(fn, (total.get(fn) ?? 0) + 1)
  }
  return { self, total, callers }
}

function hotspotOf(samples: Stack[]): string | null {
  const { self } = byFunction(samples)
  let best: string | null = null
  for (const [fn, n] of self) if (best === null || n > self.get(best)!) best = fn
  return best
}

function trace(samples: Stack[]): Frame<View>[] {
  const frames: Frame<View>[] = []
  frames.push({
    line: [1, 2],
    note: '10 ms ごとに対象を止めずに覗き、その瞬間のスタック（根から葉への関数名の列）を 1 件記録する。下の表示はすべて、この記録だけから作られる',
    vars: { サンプル数: 0 },
    view: { count: 0, latest: null },
  })
  samples.forEach((stack, i) => {
    const k = i + 1
    const leaf = stack[stack.length - 1]
    frames.push({
      line: k === 1 ? [3, 4, 5] : [9, 10, 11, 12, 13, 14],
      note:
        `${k} 件目: ${stack.join(' → ')}。` +
        `箱を根から順にたどって total を 1 ずつ足し、葉の ${leaf} だけ self を 1 足す`,
      vars: { サンプル数: k, 葉: leaf, 深さ: stack.length },
      view: { count: k, latest: stack },
    })
  })
  const { self, total } = byFunction(samples)
  const hot = hotspotOf(samples)!
  frames.push({
    line: [17, 18, 19, 20, 21, 22, 23],
    note:
      `${samples.length} 件そろった。self が最も大きいのは ${hot}（self ${self.get(hot)} 件、total ${total.get(hot)} 件）。` +
      'フレームグラフでは呼び出し元ごとに箱が分かれて細く見えるが、関数ごとに集めるボトムアップでは 1 行にまとまって先頭に来る',
    vars: { サンプル数: samples.length, ホットスポット: hot, self: self.get(hot), total: total.get(hot) },
    view: { count: samples.length, latest: null },
    done: true,
  })
  return frames
}

const W = 400
const ROW = 22

function boxStyle(name: string, hot: string | null, onPath: boolean) {
  const isHot = name === hot
  return {
    fill: isHot ? 'var(--warn-soft)' : 'var(--accent-soft)',
    stroke: onPath ? 'var(--accent)' : isHot ? 'var(--warn)' : 'var(--border)',
    strokeWidth: onPath ? 2 : 1,
  }
}

function Label({ x, y, w, text }: { x: number; y: number; w: number; text: string }) {
  const max = Math.floor((w - 6) / 6.6)
  if (max < 2) return null
  const t = text.length > max ? text.slice(0, max - 1) + '…' : text
  return (
    <text x={x + 4} y={y + 15} fontSize={11} fontFamily="var(--font-mono)" fill="var(--fg)">
      {t}
    </text>
  )
}

function FlameGraph({ samples, latest, hot }: { samples: Stack[]; latest: Stack | null; hot: string | null }) {
  const root = fold(samples)
  const depth = Math.max(1, ...samples.map((s) => s.length)) + 1
  const H = depth * ROW
  const boxes: ReactElement[] = []
  const walk = (node: Node, x: number, d: number, path: string[]) => {
    const w = (node.total / root.total) * W
    const onPath = latest !== null && path.length <= latest.length && path.every((p, i) => latest[i] === p)
    boxes.push(
      <g key={path.join('/') || 'all'}>
        <rect x={x} y={H - (d + 1) * ROW} width={Math.max(w - 1, 0.5)} height={ROW - 2} rx={2} style={boxStyle(node.name, hot, onPath && path.length > 0)}>
          <title>{`${node.name}: total ${node.total} / self ${node.self}`}</title>
        </rect>
        <Label x={x} y={H - (d + 1) * ROW} w={w} text={`${node.name} ${node.total}`} />
      </g>,
    )
    let cx = x
    // フレームグラフは時刻ではなく名前で並べる。これで同じ経路が隣り合って併合される
    for (const child of [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      walk(child, cx, d + 1, [...path, child.name])
      cx += (child.total / root.total) * W
    }
  }
  walk(root, 0, 0, [])
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }} role="img" aria-label="フレームグラフ">
      {boxes}
    </svg>
  )
}

function FlameChart({ samples, total, latest, hot }: { samples: Stack[]; total: number; latest: Stack | null; hot: string | null }) {
  const depth = Math.max(1, ...samples.map((s) => s.length))
  const H = depth * ROW + 18
  const slot = W / total
  const boxes: ReactElement[] = []
  for (let d = 0; d < depth; d++) {
    let start = 0
    for (let i = 1; i <= samples.length; i++) {
      const prev = samples[i - 1]!
      const cur = samples[i]
      const same = cur && cur.length > d && prev.length > d && cur.slice(0, d + 1).join('/') === prev.slice(0, d + 1).join('/')
      if (same) continue
      if (prev.length > d) {
        const name = prev[d]!
        const x = start * slot
        const w = (i - start) * slot
        const onPath = latest !== null && i === samples.length
        boxes.push(
          <g key={`${d}-${start}`}>
            <rect x={x} y={d * ROW} width={Math.max(w - 1, 0.5)} height={ROW - 2} rx={2} style={boxStyle(name, hot, onPath)}>
              <title>{`${name}: ${i - start} 件連続`}</title>
            </rect>
            <Label x={x} y={d * ROW} w={w} text={name} />
          </g>,
        )
      }
      start = i
    }
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }} role="img" aria-label="フレームチャート">
      {boxes}
      <line x1={0} x2={W} y1={H - 12} y2={H - 12} stroke="var(--border)" />
      <text x={0} y={H - 1} fontSize={10} fill="var(--fg-muted)">
        時刻 →（1 マス = 1 サンプル = 10 ms）
      </text>
    </svg>
  )
}

const cell = 'px-2 py-0.5 text-right tabular-nums'

function CallTree({ samples, hot }: { samples: Stack[]; hot: string | null }) {
  const root = fold(samples)
  const rows: { name: string; depth: number; total: number; self: number; key: string }[] = []
  const walk = (node: Node, d: number, key: string) => {
    for (const c of [...node.children.values()].sort((a, b) => b.total - a.total)) {
      rows.push({ name: c.name, depth: d, total: c.total, self: c.self, key: `${key}/${c.name}` })
      walk(c, d + 1, `${key}/${c.name}`)
    }
  }
  walk(root, 0, '')
  return (
    <table className="w-full font-mono text-[12px]" style={{ maxWidth: W }}>
      <thead style={{ color: 'var(--fg-muted)' }}>
        <tr>
          <th className="px-2 text-left font-normal">関数（呼び出し経路順）</th>
          <th className={`${cell} font-normal`}>total</th>
          <th className={`${cell} font-normal`}>self</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} style={r.name === hot ? { background: 'var(--warn-soft)' } : undefined}>
            <td className="px-2 py-0.5" style={{ paddingLeft: 8 + r.depth * 14 }}>
              {r.name}
            </td>
            <td className={cell}>{pct(r.total, root.total)}</td>
            <td className={cell}>{pct(r.self, root.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function BottomUp({ samples, hot }: { samples: Stack[]; hot: string | null }) {
  const { self, total, callers } = byFunction(samples)
  const n = samples.length
  const fns = [...total.keys()].sort((a, b) => (self.get(b) ?? 0) - (self.get(a) ?? 0) || total.get(b)! - total.get(a)!)
  return (
    <table className="w-full font-mono text-[12px]" style={{ maxWidth: W }}>
      <thead style={{ color: 'var(--fg-muted)' }}>
        <tr>
          <th className="px-2 text-left font-normal">関数（self の大きい順）</th>
          <th className={`${cell} font-normal`}>self</th>
          <th className={`${cell} font-normal`}>total</th>
        </tr>
      </thead>
      <tbody>
        {fns.flatMap((fn) => {
          const rows = [
            <tr key={fn} style={fn === hot ? { background: 'var(--warn-soft)' } : undefined}>
              <td className="px-2 py-0.5">{fn}</td>
              <td className={cell}>{pct(self.get(fn) ?? 0, n)}</td>
              <td className={cell}>{pct(total.get(fn)!, n)}</td>
            </tr>,
          ]
          if (fn === hot) {
            for (const [caller, c] of [...(callers.get(fn) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1])) {
              rows.push(
                <tr key={`${fn}<${caller}`} style={{ color: 'var(--fg-muted)' }}>
                  <td className="px-2 py-0.5" style={{ paddingLeft: 22 }}>
                    ← {caller} から
                  </td>
                  <td className={cell}>{pct(c, n)}</td>
                  <td className={cell} />
                </tr>,
              )
            }
          }
          return rows
        })}
      </tbody>
    </table>
  )
}

function pct(k: number, n: number) {
  return n === 0 ? '−' : `${k}（${Math.round((k / n) * 100)}%）`
}

export default function ProfileViews() {
  const [samples, setSamples] = useState<Stack[]>(PRESETS[0]!.value)
  const [mode, setMode] = useState<ViewMode>('flamegraph')
  const frames = useMemo(() => trace(samples), [samples])

  return (
    <SimShell
      title="同じサンプルから 4 つの表示を作る"
      subtitle="スタックを 1 件ずつ集計し、フレームグラフ・フレームチャート・コールツリー・ボトムアップを切り替えて見比べる"
      code={CODE}
      frames={frames}
      controls={
        <>
          <PresetControl label="サンプル列" presets={PRESETS} onPick={setSamples} />
          <Field label="表示">
            <span className="flex flex-wrap gap-1">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className="rounded border px-2 py-1 font-mono text-[11px]"
                  style={{
                    borderColor: mode === m.id ? 'var(--accent)' : 'var(--border)',
                    background: mode === m.id ? 'var(--accent-soft)' : 'var(--bg)',
                    color: 'var(--fg)',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </span>
          </Field>
        </>
      }
      legend={
        <>
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)' }} />
            self が最大の関数（ホットスポット）
          </span>
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ border: '2px solid var(--accent)' }} />
            いま足したサンプルの経路
          </span>
        </>
      }
    >
      {(f) => {
        const seen = samples.slice(0, f.view.count)
        if (seen.length === 0) {
          return (
            <p className="m-0 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
              （まだサンプルがない）
            </p>
          )
        }
        const hot = hotspotOf(seen)
        if (mode === 'flamegraph') return <FlameGraph samples={seen} latest={f.view.latest} hot={hot} />
        if (mode === 'flamechart') return <FlameChart samples={seen} total={samples.length} latest={f.view.latest} hot={hot} />
        if (mode === 'calltree') return <CallTree samples={seen} hot={hot} />
        return <BottomUp samples={seen} hot={hot} />
      }}
    </SimShell>
  )
}
