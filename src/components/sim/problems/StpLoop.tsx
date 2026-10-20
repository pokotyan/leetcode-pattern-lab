import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { LegendItem } from '../views/Legend'
import type { CellState, Frame } from '../core/types'

const CODE = `def choose_root(bridge, bpdus):
    best = (bridge.id, 0, bridge.id)        # 最初は自分が root だと名乗る
    for port, b in bpdus:
        cand = (b.root_id, b.cost + port.cost, b.sender_id)
        if cand < best:                     # 小さいほど優先
            best, bridge.root_port = cand, port
    bridge.root_id, bridge.root_cost = best[0], best[1]

def port_role(bridge, port, neighbor):
    mine = (bridge.root_id, bridge.root_cost, bridge.id)
    if port is bridge.root_port:
        return 'root'                       # root へいちばん近い口
    if neighbor is None or mine < neighbor:
        return 'designated'                 # この線の代表として転送する
    return 'blocking'                       # どちらでもなければ閉じる

def forward(bridge, frame, in_port):
    vid = frame.vid if frame.tagged else in_port.pvid
    bridge.mac_table[(vid, frame.src)] = in_port
    for p in bridge.ports:
        if p is in_port or p.state != 'forwarding' or vid not in p.vlans:
            continue
        out = frame.tag(vid) if p.trunk else frame.untag()
        p.send(out)                         # 全員宛ては条件に合う全ポートへ`

type Scenario = 'loop' | 'stp' | 'vlan'

type VNode = { id: string; label: string; x: number; y: number; kind: 'sw' | 'host'; sub?: string; state?: CellState }
/** blocked はその端のポートが閉じていることを表す */
type VLink = { a: string; b: string; label?: string; state?: 'idle' | 'good' | 'bad'; blocked?: 'a' | 'b' }
/** on: 載っている線の添字、from: 送り出した側のノード */
type VFrame = { on: number; from: string; label: string; tone: 'accent' | 'danger' | 'ok' }
type View = { nodes: VNode[]; links: VLink[]; frames: VFrame[]; table: string }

const TRI_NODES: VNode[] = [
  { id: 'S1', label: 'S1', x: 230, y: 60, kind: 'sw' },
  { id: 'S2', label: 'S2', x: 110, y: 200, kind: 'sw' },
  { id: 'S3', label: 'S3', x: 350, y: 200, kind: 'sw' },
  { id: 'H', label: 'H', x: 230, y: 14, kind: 'host' },
  { id: 'H2', label: 'H2', x: 40, y: 250, kind: 'host' },
  { id: 'H3', label: 'H3', x: 420, y: 250, kind: 'host' },
]
const TRI_LINKS: VLink[] = [
  { a: 'S1', b: 'S2' },
  { a: 'S2', b: 'S3' },
  { a: 'S1', b: 'S3' },
  { a: 'H', b: 'S1' },
  { a: 'H2', b: 'S2' },
  { a: 'H3', b: 'S3' },
]

function linkIndex(links: VLink[], x: string, y: string): number {
  return links.findIndex((l) => (l.a === x && l.b === y) || (l.a === y && l.b === x))
}

function neighbors(links: VLink[], id: string): string[] {
  return links.flatMap((l) => (l.a === id ? [l.b] : l.b === id ? [l.a] : []))
}

function cloneNodes(nodes: VNode[]): VNode[] {
  return nodes.map((n) => ({ ...n }))
}

function traceLoop(): Frame<View>[] {
  const frames: Frame<View>[] = []
  const links = TRI_LINKS.map((l) => ({ ...l }))
  const received: Record<string, number> = { H2: 0, H3: 0, H: 0 }
  // S1 の MAC 表で、H の MAC アドレスがどのポート（どの隣）に載っているか
  let s1Entry = '（空）'
  let inFlight: VFrame[] = [{ on: linkIndex(links, 'H', 'S1'), from: 'H', label: 'ARP', tone: 'accent' }]

  const snap = (line: number | number[], note: string, done = false) => {
    frames.push({
      line,
      note,
      vars: {
        スイッチ間を回る写し: inFlight.filter((f) => to(f).startsWith('S')).length,
        'H2 が受け取った回数': received.H2,
        'H3 が受け取った回数': received.H3,
        'H 自身に戻った回数': received.H,
      },
      view: { nodes: cloneNodes(TRI_NODES), links, frames: inFlight, table: `S1 の MAC 表: H → ${s1Entry}` },
      done,
    })
  }
  const to = (f: VFrame) => {
    const l = links[f.on]!
    return l.a === f.from ? l.b : l.a
  }

  snap([17, 18], 'STP なし。H が全員宛て（ブロードキャスト）の ARP 要求を 1 発だけ送る。宛先 ff:ff:ff:ff:ff:ff は学習できないので、スイッチは受けた口以外の全ポートへ流す')
  for (let step = 1; step <= 9; step++) {
    const next: VFrame[] = []
    for (const f of inFlight) {
      const at = to(f)
      if (!at.startsWith('S')) continue
      if (at === 'S1') s1Entry = f.from === 'H' ? 'H の口' : `${f.from} へ向かう口`
      for (const nb of neighbors(links, at)) {
        if (nb === f.from) continue
        // 端末へ送った写しはその場で受け取られたものとして数え、図には線の途中に描くだけにする
        if (!nb.startsWith('S')) received[nb] = (received[nb] ?? 0) + 1
        next.push({ on: linkIndex(links, at, nb), from: at, label: 'ARP', tone: nb.startsWith('S') && step > 2 ? 'danger' : 'accent' })
      }
    }
    inFlight = next
    const note =
      step === 1
        ? 'S1 は H から受けたので、S2 と S3 へ 1 つずつ写しを送る。MAC 表には「H は H の口の先」と正しく載る'
        : step === 2
          ? 'S2 は S1 から受けた写しを H2 と S3 へ、S3 は H3 と S2 へ送る。H2 と H3 はここで 1 回目を受け取る'
          : step === 3
            ? 'S3 から来た写しを S2 は S1 と H2 へ、S2 から来た写しを S3 は S1 と H3 へ。H2 と H3 に同じフレームの 2 回目が届く'
            : step === 4
              ? `S1 に写しが戻ってきた。送信元は H なので、S1 は「H は ${s1Entry}」と学習し直してしまう。本当の H の口から外れる`
              : step === 9
                ? '写しは 2 つのまま、三角形を逆向きに回り続ける。フレームには TTL のような寿命が無いので、線を外すか STP で口を閉じるまで止まらない'
                : `同じ 2 つの写しが回り続ける。S1 の MAC 表は ${s1Entry} を指したまま、H 宛てのフレームが H に届かなくなる`
    snap(step === 4 ? [18, 19] : [20, 21, 22, 23, 24], note, step === 9)
  }
  return frames
}

function traceStp(): Frame<View>[] {
  const frames: Frame<View>[] = []
  const links = TRI_LINKS.map((l) => ({ ...l }))
  const nodes = cloneNodes(TRI_NODES)
  const ids: Record<string, string> = { S1: '32768.aa', S2: '32768.bb', S3: '32768.cc' }
  const root: Record<string, string> = { S1: 'S1', S2: 'S2', S3: 'S3' }
  const cost: Record<string, number> = { S1: 0, S2: 0, S3: 0 }
  let inFlight: VFrame[] = []
  let table = 'ブリッジ ID = 優先度.MAC。優先度はどれも既定の 32768'

  const setSub = () => {
    for (const n of nodes) if (n.kind === 'sw') n.sub = `${ids[n.id]} root=${root[n.id]} cost=${cost[n.id]}`
  }
  const snap = (line: number | number[], note: string, done = false) => {
    setSub()
    frames.push({
      line,
      note,
      vars: { 'S1 の root': root.S1, 'S2 の root': root.S2, 'S3 の root': root.S3 },
      view: { nodes: cloneNodes(nodes), links: links.map((l) => ({ ...l })), frames: inFlight, table },
      done,
    })
  }

  inFlight = (['S1', 'S2', 'S3'] as const).flatMap((s) =>
    neighbors(links, s)
      .filter((nb) => nb.startsWith('S'))
      .map((nb) => ({ on: linkIndex(links, s, nb), from: s, label: `BPDU root=${s}`, tone: 'accent' as const })),
  )
  snap([1, 2], '電源を入れた直後、どのスイッチも「自分が root」と名乗る BPDU を 2 秒ごとに隣へ送る（Hello Time の既定値）')

  root.S2 = 'S1'
  cost.S2 = 4
  root.S3 = 'S1'
  cost.S3 = 4
  nodes.find((n) => n.id === 'S1')!.state = 'good'
  inFlight = []
  snap([3, 4, 5, 6, 7], 'S2 と S3 は S1 からの BPDU（root=32768.aa）を、自分の ID より小さいと判断して採用する。優先度が同じなので MAC アドレスの小さい S1 が root。S1 へ直接つながる口が root ポート（コスト 4）')

  links[0]!.state = 'good'
  links[2]!.state = 'good'
  table = 'S1 の口はすべて designated。S2・S3 の S1 側の口は root ポート'
  snap([9, 10, 11, 12], 'root ブリッジ S1 の口はすべて designated（転送する側）。S2 と S3 で S1 につながる口は root ポートとして転送状態へ')

  inFlight = [
    { on: 1, from: 'S2', label: 'root=S1 cost=4 id=bb', tone: 'accent' },
    { on: 1, from: 'S3', label: 'root=S1 cost=4 id=cc', tone: 'accent' },
  ]
  snap([10, 13], 'S2–S3 の線では、両側とも「root=S1、コスト 4」で並ぶ。同点なので送り手の ID で比べる')

  links[1]!.blocked = 'b'
  links[1]!.state = 'bad'
  inFlight = []
  table = 'S2–S3 の線: S2 側 designated、S3 側 blocking'
  snap([13, 14, 15], 'ID の小さい S2 の口がこの線の designated になり、負けた S3 の口は blocking。三角形の 1 辺がデータを通さなくなり、ループの無い木ができた')

  inFlight = [{ on: linkIndex(links, 'H', 'S1'), from: 'H', label: 'ARP', tone: 'accent' }]
  snap([17, 18], 'ここで H がブロードキャストを 1 発送る')
  inFlight = [
    { on: 0, from: 'S1', label: 'ARP', tone: 'accent' },
    { on: 2, from: 'S1', label: 'ARP', tone: 'accent' },
  ]
  snap([20, 21, 22, 23, 24], 'S1 は S2 と S3 へ写しを送る（どちらの口も forwarding）')
  inFlight = [
    { on: linkIndex(links, 'S2', 'H2'), from: 'S2', label: 'ARP', tone: 'ok' },
    { on: 1, from: 'S2', label: 'ARP', tone: 'accent' },
    { on: linkIndex(links, 'S3', 'H3'), from: 'S3', label: 'ARP', tone: 'ok' },
  ]
  snap([20, 21, 22, 23, 24], 'S2 は H2 と S3 へ送る。S3 は H3 へ送るが、blocking の口（S2 側）へは送らない')
  inFlight = []
  snap([21, 22], 'S2 から来た写しは S3 の blocking の口で捨てられる（BPDU 以外は受け取らない）。H2 と H3 はちょうど 1 回ずつ受け取り、フレームは消える', true)
  return frames
}

function traceVlan(): Frame<View>[] {
  const frames: Frame<View>[] = []
  const nodes: VNode[] = [
    { id: 'S1', label: 'S1', x: 150, y: 130, kind: 'sw' },
    { id: 'S2', label: 'S2', x: 330, y: 130, kind: 'sw' },
    { id: 'H1', label: 'H1', x: 50, y: 60, kind: 'host', sub: 'VLAN 10' },
    { id: 'H2', label: 'H2', x: 50, y: 210, kind: 'host', sub: 'VLAN 20' },
    { id: 'H3', label: 'H3', x: 430, y: 60, kind: 'host', sub: 'VLAN 10' },
    { id: 'H4', label: 'H4', x: 430, y: 210, kind: 'host', sub: 'VLAN 20' },
  ]
  const links: VLink[] = [
    { a: 'S1', b: 'S2', label: 'トランク 10,20' },
    { a: 'H1', b: 'S1', label: 'access 10' },
    { a: 'H2', b: 'S1', label: 'access 20' },
    { a: 'H3', b: 'S2', label: 'access 10' },
    { a: 'H4', b: 'S2', label: 'access 20' },
  ]
  let inFlight: VFrame[] = []
  let table = ''
  const snap = (line: number | number[], note: string, vars: Record<string, string>, done = false) =>
    frames.push({ line, note, vars, view: { nodes, links, frames: inFlight, table }, done })

  inFlight = [{ on: 1, from: 'H1', label: 'タグなし', tone: 'accent' }]
  snap([17, 18], 'H1 がタグの無いブロードキャストを送る。端末は VLAN を知らない', { 'フレームの VLAN': '−' })
  table = 'S1 の MAC 表: (10, H1) → H1 の口'
  snap([18, 19], 'S1 は受けた口の PVID（10）をこのフレームの VLAN とみなし、(VLAN 10, H1 の MAC) を学習する', { 'フレームの VLAN': '10' })
  inFlight = [{ on: 0, from: 'S1', label: 'タグ 10', tone: 'accent' }]
  snap([20, 21, 22, 23, 24], 'H2 の口は VLAN 20 なので候補から外れる。トランクは 10 を通すので、タグ 10 を付けて送る（0x8100 の後ろに VID 10）', { 'フレームの VLAN': '10' })
  inFlight = [{ on: 3, from: 'S2', label: 'タグなし', tone: 'ok' }]
  snap([20, 21, 22, 23, 24], 'S2 はタグから VLAN 10 と読み、VLAN 10 の H3 の口へタグを外して送る。H4（VLAN 20）には届かない', { 'フレームの VLAN': '10' })
  inFlight = []
  snap(24, '同じスイッチ、同じサブネットの IP を振っていても、H1 のブロードキャストは H2 と H4 に届かない。ARP が届かないので、H1 から H2 へは IP でも通じない', { 'フレームの VLAN': '10' }, true)
  return frames
}

const CASES: { name: string; value: Scenario }[] = [
  { name: 'STP なしの三角形', value: 'loop' },
  { name: 'STP あり', value: 'stp' },
  { name: 'VLAN のタグ', value: 'vlan' },
]

const TONE = { accent: 'var(--accent)', danger: 'var(--danger)', ok: 'var(--ok)' } as const
const LINK_COLOR = { idle: 'var(--border)', good: 'var(--ok)', bad: 'var(--danger)' } as const

function Topology({ view }: { view: View }) {
  const byId = new Map(view.nodes.map((n) => [n.id, n]))
  return (
    <svg viewBox="0 0 470 280" style={{ maxWidth: 520, width: '100%', height: 'auto' }} role="img">
      {view.links.map((l, i) => {
        const a = byId.get(l.a)!
        const b = byId.get(l.b)!
        const end = l.blocked === 'a' ? a : l.blocked === 'b' ? b : null
        const other = l.blocked === 'a' ? b : a
        return (
          <g key={i}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={LINK_COLOR[l.state ?? 'idle']}
              strokeWidth={a.kind === 'sw' && b.kind === 'sw' ? 3 : 1.5}
            />
            {l.label && (
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} textAnchor="middle" fontSize="10" fill="var(--fg-muted)">
                {l.label}
              </text>
            )}
            {end && (
              <text
                x={end.x + (other.x - end.x) * 0.22}
                y={end.y + (other.y - end.y) * 0.22 + 4}
                textAnchor="middle"
                fontSize="14"
                fontWeight="bold"
                fill="var(--danger)"
              >
                ✕
              </text>
            )}
          </g>
        )
      })}
      {view.frames.map((f, i) => {
        const l = view.links[f.on]!
        const from = byId.get(f.from)!
        const toNode = byId.get(l.a === f.from ? l.b : l.a)!
        const t = 0.55
        const x = from.x + (toNode.x - from.x) * t
        const y = from.y + (toNode.y - from.y) * t
        return (
          <g key={`f${i}`}>
            <circle cx={x} cy={y} r={6} fill={TONE[f.tone]} />
            <text x={x} y={y + 18} textAnchor="middle" fontSize="9" fill={TONE[f.tone]}>
              {f.label}
            </text>
          </g>
        )
      })}
      {view.nodes.map((n) => {
        const st = n.state === 'good'
        return (
          <g key={n.id}>
            {n.kind === 'sw' ? (
              <rect
                x={n.x - 22}
                y={n.y - 14}
                width={44}
                height={28}
                rx={5}
                fill={st ? 'var(--ok-soft)' : 'var(--bg)'}
                stroke={st ? 'var(--ok)' : 'var(--fg-muted)'}
              />
            ) : (
              <circle cx={n.x} cy={n.y} r={12} fill="var(--bg)" stroke="var(--border)" />
            )}
            <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="11" fontWeight="bold" fill="var(--fg)">
              {n.label}
            </text>
            {n.sub && (
              <text
                x={n.x}
                y={n.kind === 'sw' ? n.y + 28 : n.y + 25}
                textAnchor="middle"
                fontSize="9"
                fill="var(--fg-muted)"
              >
                {n.sub}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export default function StpLoop() {
  const [s, setS] = useState<Scenario>('loop')
  const frames = useMemo(() => (s === 'loop' ? traceLoop() : s === 'stp' ? traceStp() : traceVlan()), [s])
  return (
    <SimShell
      title="ループと STP、VLAN のタグ"
      subtitle="全員宛てのフレームは、受けた口以外の全ポートへ流れる。ループがあれば止まらず、STP は 1 辺を閉じて木にする。VLAN は流す先をタグで絞る"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="場面" presets={CASES} onPick={setS} />}
      legend={
        <>
          <LegendItem state="active">流れているフレーム</LegendItem>
          <LegendItem state="bad">回り続ける写し／閉じた口</LegendItem>
          <LegendItem state="good">root ブリッジ／転送する線</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-2">
          <Topology view={f.view} />
          {f.view.table && (
            <p className="m-0 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              {f.view.table}
            </p>
          )}
        </div>
      )}
    </SimShell>
  )
}
