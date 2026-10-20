import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import type { Frame } from '../core/types'

const CODE = `AGEING = 300                     # 秒。Linux bridge の既定値

def on_frame(port, f, now):
    table[f.src] = (port, now)       # 送信元を学習する
    if is_group(f.dst):              # ブロードキャスト / マルチキャスト
        flood(f, except_port=port)
    elif f.dst in table:
        out, _ = table[f.dst]
        if out == port:
            drop(f)                  # 宛先は来た側にいる
        else:
            send(out, f)             # 知っているポートだけへ
    else:
        flood(f, except_port=port)   # 知らない宛先は全ポートへ

def age(now):
    for mac, (port, seen) in list(table.items()):
        if now - seen > AGEING:
            del table[mac]`

type Host = 'A' | 'B' | 'C' | 'D' | 'E'
const HOSTS: Host[] = ['A', 'B', 'C', 'D', 'E']
// E は D と同じハブの先にいて、スイッチからはどちらもポート 4 に見える
const PORT_OF: Record<Host, number> = { A: 1, B: 2, C: 3, D: 4, E: 4 }
const MAC: Record<Host, string> = {
  A: '02:…:0a',
  B: '02:…:0b',
  C: '02:…:0c',
  D: '02:…:0d',
  E: '02:…:0e',
}
const BCAST = 'ff:ff:ff:ff:ff:ff'
const AGEING = 300

type Ev =
  | { kind: 'frame'; src: Host; dst: Host | 'all'; label: string }
  | { kind: 'wait'; sec: number }

type Entry = { mac: Host; port: number; seen: number }
type View = {
  now: number
  table: Entry[]
  inPort: number | null
  outPorts: number[]
  mode: 'none' | 'arrive' | 'forward' | 'flood' | 'drop'
  /** 実際にフレームを受け取った端末（宛先でない端末も含む） */
  receivers: Host[]
  newEntry: Host | null
  expired: Host[]
  label: string
  sender: Host | null
}

function trace(events: Ev[]): Frame<View>[] {
  const table = new Map<Host, Entry>()
  const frames: Frame<View>[] = []
  let now = 0

  const snap = (line: number | number[], note: string, v: Partial<View> = {}, done = false) => {
    frames.push({
      line,
      note,
      vars: { 時刻: `${now} 秒`, 学習済み: table.size, AGEING: `${AGEING} 秒` },
      view: {
        now,
        table: [...table.values()].sort((a, b) => a.mac.localeCompare(b.mac)),
        inPort: null,
        outPorts: [],
        mode: 'none',
        receivers: [],
        newEntry: null,
        expired: [],
        label: '',
        sender: null,
        ...v,
      },
      done,
    })
  }

  snap(1, 'スイッチの MAC アドレステーブルは空。どのポートの先に誰がいるのか、まだ何も知らない')

  for (const ev of events) {
    if (ev.kind === 'wait') {
      now += ev.sec
      const expired = [...table.values()].filter((e) => now - e.seen > AGEING).map((e) => e.mac)
      for (const m of expired) table.delete(m)
      snap(
        [17, 18, 19, 20],
        expired.length > 0
          ? `${ev.sec} 秒間、誰も何も送らなかった。最後に見てから ${AGEING} 秒を超えた ${expired.join('・')} の項目を消す`
          : `${ev.sec} 秒が過ぎた。まだ ${AGEING} 秒を超えた項目はない`,
        { expired },
      )
      continue
    }

    now += 1
    const inPort = PORT_OF[ev.src]
    const sender = ev.src
    const dstMac = ev.dst === 'all' ? BCAST : MAC[ev.dst]
    snap(3, `${ev.label}: ${ev.src}（${MAC[ev.src]}）が宛先 ${dstMac} のフレームを送り、ポート ${inPort} に届く`, {
      inPort,
      mode: 'arrive',
      label: ev.label, sender,
    })

    const known = table.has(ev.src)
    table.set(ev.src, { mac: ev.src, port: inPort, seen: now })
    snap(
      4,
      known
        ? `送信元 ${ev.src} はもう知っている。最後に見た時刻だけ ${now} 秒に更新する`
        : `送信元 ${ev.src} はポート ${inPort} の先にいる、と覚える。スイッチが学習に使うのは送信元アドレスだけ`,
      { inPort, mode: 'arrive', newEntry: known ? null : ev.src, label: ev.label, sender },
    )

    const others = [1, 2, 3, 4].filter((p) => p !== inPort)
    const onPorts = (ports: number[]) => HOSTS.filter((h) => h !== ev.src && ports.includes(PORT_OF[h]))
    // ハブは来たフレームを全員に配るので、同じポートの先にいる端末には必ず届く
    const sameSegment = HOSTS.filter((h) => h !== ev.src && PORT_OF[h] === inPort)

    if (ev.dst === 'all') {
      snap([5, 6], `宛先がブロードキャスト。来たポート ${inPort} 以外の全ポート（${others.join('・')}）へ複製して送る`, {
        inPort,
        outPorts: others,
        mode: 'flood',
        receivers: [...sameSegment, ...onPorts(others)],
        label: ev.label, sender,
      })
      continue
    }

    const hit = table.get(ev.dst)
    if (hit && hit.port === inPort) {
      snap([7, 8, 9, 10], `宛先 ${ev.dst} もポート ${inPort} の先にいる。スイッチは何も送らずに捨てる（届けるのはハブ側）`, {
        inPort,
        mode: 'drop',
        receivers: sameSegment,
        label: ev.label, sender,
      })
    } else if (hit) {
      const shared = HOSTS.filter((h) => h !== ev.dst && h !== ev.src && PORT_OF[h] === hit.port)
      const tail = shared.length > 0 ? `ただしポート ${hit.port} の先はハブなので、${shared.join('・')} にも届く` : 'ほかの端末には届かない'
      snap([7, 8, 11, 12], `宛先 ${ev.dst} はポート ${hit.port} の先にいると知っている。そのポートだけへ送る。${tail}`, {
        inPort,
        outPorts: [hit.port],
        mode: 'forward',
        receivers: [...sameSegment, ...onPorts([hit.port])],
        label: ev.label, sender,
      })
    } else {
      snap([13, 14], `宛先 ${ev.dst} がどこにいるか知らない。全ポートへ流す（フラッディング）。${ev.dst} 以外の端末も受け取り、自分宛てでないので捨てる`, {
        inPort,
        outPorts: others,
        mode: 'flood',
        receivers: [...sameSegment, ...onPorts(others)],
        label: ev.label, sender,
      })
    }
  }

  snap(1, `完了。テーブルに残っているのは ${[...table.keys()].join('・') || 'なし'}`, {}, true)
  return frames
}

const f = (src: Host, dst: Host | 'all', label: string): Ev => ({ kind: 'frame', src, dst, label })

const CASES: { name: string; value: Ev[] }[] = [
  {
    name: '知らない宛先',
    value: [f('A', 'B', 'A→B'), f('B', 'A', 'B→A（返事）'), f('A', 'B', 'A→B（2 回目）')],
  },
  {
    name: 'ARP から始める',
    value: [
      f('A', 'all', 'ARP 要求「10.0.0.2 は誰？」'),
      f('B', 'A', 'ARP 応答「10.0.0.2 は 02:…:0b」'),
      f('A', 'B', 'ping 要求'),
      f('B', 'A', 'ping 応答'),
    ],
  },
  {
    name: 'エージング',
    value: [f('A', 'B', 'A→B'), f('B', 'A', 'B→A'), { kind: 'wait', sec: 310 }, f('A', 'B', 'A→B（久しぶり）')],
  },
  {
    name: 'ハブの先',
    value: [f('D', 'E', 'D→E'), f('E', 'D', 'E→D'), f('D', 'E', 'D→E（2 回目）'), f('A', 'E', 'A→E')],
  },
]

const W = 460
const H = 250
const SW = { x: 160, y: 95, w: 140, h: 60 }
const PORT_XY: Record<number, [number, number]> = {
  1: [SW.x + 20, SW.y],
  2: [SW.x + SW.w - 20, SW.y],
  3: [SW.x + 20, SW.y + SW.h],
  4: [SW.x + SW.w - 20, SW.y + SW.h],
}
const HUB: [number, number] = [SW.x + SW.w + 55, SW.y + SW.h + 55]
const HOST_XY: Record<Host, [number, number]> = {
  A: [60, 35],
  B: [400, 35],
  C: [60, 215],
  D: [355, 225],
  E: [430, 180],
}

function Diagram({ v }: { v: View }) {
  const portColor = (p: number) => {
    if (p === v.inPort) return 'var(--accent)'
    if (v.outPorts.includes(p)) return v.mode === 'flood' ? 'var(--warn)' : 'var(--ok)'
    return 'var(--border)'
  }
  const hostTarget = (h: Host): [number, number] => (PORT_OF[h] === 4 ? HUB : PORT_XY[PORT_OF[h]]!)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }} role="img" aria-label="スイッチと端末">
      {HOSTS.map((h) => {
        const [x, y] = HOST_XY[h]
        const [tx, ty] = hostTarget(h)
        return <line key={h} x1={x} y1={y} x2={tx} y2={ty} stroke="var(--border)" strokeWidth={2} />
      })}
      <line x1={PORT_XY[4]![0]} y1={PORT_XY[4]![1]} x2={HUB[0]} y2={HUB[1]} stroke={portColor(4)} strokeWidth={2} />
      {[1, 2, 3].map((p) => {
        const h = HOSTS.find((x) => PORT_OF[x] === p)!
        const [x, y] = HOST_XY[h]
        const [px, py] = PORT_XY[p]!
        return <line key={p} x1={x} y1={y} x2={px} y2={py} stroke={portColor(p)} strokeWidth={p === v.inPort || v.outPorts.includes(p) ? 4 : 2} />
      })}

      <rect x={SW.x} y={SW.y} width={SW.w} height={SW.h} rx={8} fill="var(--bg)" stroke="var(--fg-muted)" />
      <text x={SW.x + SW.w / 2} y={SW.y + SW.h / 2 + 4} textAnchor="middle" fontSize={12} fill="var(--fg)">
        スイッチ
      </text>
      {[1, 2, 3, 4].map((p) => {
        const [x, y] = PORT_XY[p]!
        return (
          <g key={p}>
            <rect x={x - 9} y={y - 7} width={18} height={14} rx={2} fill={portColor(p)} stroke="var(--fg-muted)" />
            <text x={x} y={y + 4} textAnchor="middle" fontSize={10} fill="var(--fg)">
              {p}
            </text>
          </g>
        )
      })}

      <rect x={HUB[0] - 16} y={HUB[1] - 10} width={32} height={20} rx={4} fill="var(--bg-soft)" stroke="var(--fg-muted)" />
      <text x={HUB[0]} y={HUB[1] + 4} textAnchor="middle" fontSize={9} fill="var(--fg-muted)">
        ハブ
      </text>

      {HOSTS.map((h) => {
        const [x, y] = HOST_XY[h]
        const isSender = v.sender === h
        const got = v.receivers.includes(h)
        const fill = got ? (v.mode === 'flood' ? 'var(--warn-soft)' : 'var(--ok-soft)') : isSender ? 'var(--accent-soft)' : 'var(--bg)'
        const stroke = got ? (v.mode === 'flood' ? 'var(--warn)' : 'var(--ok)') : isSender ? 'var(--accent)' : 'var(--fg-muted)'
        return (
          <g key={h}>
            <rect x={x - 26} y={y - 16} width={52} height={32} rx={6} fill={fill} stroke={stroke} strokeWidth={got || isSender ? 2 : 1} />
            <text x={x} y={y - 1} textAnchor="middle" fontSize={12} fontWeight="bold" fill="var(--fg)">
              {h}
            </text>
            <text x={x} y={y + 11} textAnchor="middle" fontSize={8} fill="var(--fg-muted)">
              {MAC[h]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default function SwitchLearning() {
  const [events, setEvents] = useState<Ev[]>(CASES[0]!.value)
  const frames = useMemo(() => trace(events), [events])

  return (
    <SimShell
      title="スイッチの MAC アドレス学習"
      subtitle="送信元で覚え、宛先で選ぶ。知らない宛先とブロードキャストは全ポートへ。E は D と同じハブの先にいる"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="操作列" presets={CASES} onPick={setEvents} />}
      legend={
        <>
          <span style={{ color: 'var(--accent)' }}>■ 受信したポート / 送信元</span>
          <span style={{ color: 'var(--ok)' }}>■ そのポートだけへ転送</span>
          <span style={{ color: 'var(--warn)' }}>■ 全ポートへ複製（フラッディング）</span>
        </>
      }
    >
      {(fr) => (
        <div className="space-y-2">
          <Diagram v={fr.view} />
          <table className="w-full border-collapse font-mono text-[11px]" style={{ maxWidth: 320 }}>
            <thead>
              <tr style={{ color: 'var(--fg-muted)' }}>
                <th className="border px-2 py-1 text-left" style={{ borderColor: 'var(--border)' }}>MAC</th>
                <th className="border px-2 py-1 text-left" style={{ borderColor: 'var(--border)' }}>ポート</th>
                <th className="border px-2 py-1 text-left" style={{ borderColor: 'var(--border)' }}>最後に見た時刻</th>
              </tr>
            </thead>
            <tbody>
              {fr.view.table.length === 0 && (
                <tr>
                  <td colSpan={3} className="border px-2 py-1" style={{ borderColor: 'var(--border)', color: 'var(--fg-muted)' }}>
                    （空）
                  </td>
                </tr>
              )}
              {fr.view.table.map((e) => (
                <tr
                  key={e.mac}
                  style={
                    e.mac === fr.view.newEntry
                      ? { background: 'var(--accent-soft)' }
                      : undefined
                  }
                >
                  <td className="border px-2 py-1" style={{ borderColor: 'var(--border)' }}>
                    {MAC[e.mac]}（{e.mac}）
                  </td>
                  <td className="border px-2 py-1" style={{ borderColor: 'var(--border)' }}>{e.port}</td>
                  <td className="border px-2 py-1" style={{ borderColor: 'var(--border)' }}>{e.seen} 秒</td>
                </tr>
              ))}
              {fr.view.expired.map((m) => (
                <tr key={`x-${m}`} style={{ color: 'var(--danger)', textDecoration: 'line-through' }}>
                  <td className="border px-2 py-1" style={{ borderColor: 'var(--border)' }}>
                    {MAC[m]}（{m}）
                  </td>
                  <td colSpan={2} className="border px-2 py-1" style={{ borderColor: 'var(--border)' }}>
                    期限切れで削除
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SimShell>
  )
}
