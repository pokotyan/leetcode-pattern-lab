import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { LegendItem } from '../views/Legend'
import { cellStyle } from '../views/style'
import type { CellState, Frame } from '../core/types'

const CODE = `def lookup(table, dst):
    best = None
    for r in table:
        mask = (0xFFFFFFFF << (32 - r.len)) & 0xFFFFFFFF
        if dst & mask == r.prefix & mask:
            if best is None or r.len > best.len:
                best = r
    return best

def forward(router, pkt):
    r = lookup(router.table, pkt.ip.dst)
    if r is None:
        return send_icmp(pkt.ip.src, "Destination Net Unreachable")
    if pkt.ip.ttl <= 1:
        return send_icmp(pkt.ip.src, "Time to live exceeded")
    pkt.ip.ttl -= 1
    pkt.ip.checksum = update(pkt.ip.checksum)
    nexthop = r.via or pkt.ip.dst
    pkt.eth.src = r.dev.mac
    pkt.eth.dst = router.arp[nexthop]
    r.dev.send(pkt)`

type Route = { cidr: string; via: string | null; dev: string }
type Hop = { link: string; ethSrc: string; ethDst: string; ipSrc: string; ipDst: string; ttl: number; sum: string }
type Case = { dst: string; table: Route[]; ttl: number; walk?: boolean }

type RowView = { route: Route; bits: string; len: number; state: CellState; mark: string }
type View = { dst: string; dstBits: string; rows: RowView[]; hops: Hop[]; hopFocus: number | null }

const toInt = (ip: string) => ip.split('.').reduce((a, o) => a * 256 + Number(o), 0)
const bits32 = (n: number) => n.toString(2).padStart(32, '0')
const parse = (cidr: string) => {
  const [p, l] = cidr.split('/')
  return { prefix: toInt(p!), len: Number(l) }
}
const grouped = (b: string) => b.match(/.{8}/g)!.join(' ')
const matches = (dst: number, prefix: number, len: number) => len === 0 || bits32(dst).slice(0, len) === bits32(prefix).slice(0, len)

// 実験で使った h1 — r1 — r2 — h2 の構成。MAC は実験と同じく固定値
const MAC: Record<string, string> = {
  h1: '02:00:00:00:01:10',
  'r1-eth0': '02:00:00:00:01:01',
  'r1-eth1': '02:00:00:00:12:01',
  'r2-eth0': '02:00:00:00:12:02',
  'r2-eth1': '02:00:00:00:02:01',
  h2: '02:00:00:00:02:10',
}
// 実測した echo request の IP ヘッダのチェックサム（TTL 64 → 63 → 62）。他の TTL では値が違うので出さない
const SUMS = ['0x2e05', '0x2f05', '0x3005']

function trace(c: Case): Frame<View>[] {
  const frames: Frame<View>[] = []
  const dst = toInt(c.dst)
  const rows: RowView[] = c.table.map((route) => {
    const { prefix, len } = parse(route.cidr)
    return { route, bits: bits32(prefix), len, state: 'idle', mark: '' }
  })
  const hops: Hop[] = []
  const snap = (line: number | number[], note: string, vars: Frame<View>['vars'], hopFocus: number | null = null, done = false) =>
    frames.push({
      line,
      note,
      vars,
      view: { dst: c.dst, dstBits: bits32(dst), rows: rows.map((r) => ({ ...r })), hops: hops.map((h) => ({ ...h })), hopFocus },
      done,
    })

  snap([1, 2], `r1 の経路表で、宛先 ${c.dst} を引く。2 進で書くと ${grouped(bits32(dst))}`, { 宛先: c.dst, best: '−' })

  let best: RowView | null = null
  for (const row of rows) {
    const { prefix } = parse(row.route.cidr)
    row.state = 'active'
    const hit = matches(dst, prefix, row.len)
    snap([3, 4, 5], `${row.route.cidr}: 上位 ${row.len} ビットを比べる。${hit ? '一致する' : '一致しない'}`, {
      宛先: c.dst,
      比べる長さ: row.len,
      best: best ? best.route.cidr : '−',
    })
    if (!hit) {
      row.state = 'bad'
      row.mark = '不一致'
      continue
    }
    if (!best || row.len > best.len) {
      if (best) {
        best.state = 'dim'
        best.mark = `一致（/${best.len} は短い）`
      }
      best = row
      row.state = 'good'
      row.mark = '最長の候補'
      snap([6, 7], `一致した中で今いちばん長い（/${row.len}）ので、best をこれに置き換える`, {
        宛先: c.dst,
        比べる長さ: row.len,
        best: row.route.cidr,
      })
    } else {
      row.state = 'dim'
      row.mark = `一致（/${row.len} は短い）`
      snap([6], `一致はするが、best の /${best.len} より短いので採らない`, {
        宛先: c.dst,
        比べる長さ: row.len,
        best: best.route.cidr,
      })
    }
  }

  if (!best) {
    snap([8, 11, 12, 13], `一致する経路が 1 本もない。既定経路（0.0.0.0/0）も無いので、送信元へ Destination Net Unreachable を返して捨てる`, { best: 'None' }, null, true)
    return frames
  }
  const via = best.route.via ?? '直結'
  snap(8, `最長一致は ${best.route.cidr}。次ホップは ${via}、出口は ${best.route.dev}。表の並び順は関係しない`, {
    宛先: c.dst,
    best: best.route.cidr,
    次ホップ: via,
  }, null, !c.walk)
  if (!c.walk) return frames

  let ttl = c.ttl
  const sum = (i: number) => (c.ttl === 64 ? SUMS[i]! : '−')
  const ip = { ipSrc: '10.0.1.10', ipDst: c.dst }
  hops.push({ link: 'h1 → r1', ethSrc: MAC.h1!, ethDst: MAC['r1-eth0']!, ...ip, ttl, sum: sum(0) })
  snap([10], `h1 が送ったパケット。宛先 MAC は r1（デフォルトゲートウェイ）、宛先 IP は h2。TTL ${ttl}`, { TTL: ttl, いる場所: 'h1–r1 の線' }, 0)

  const legs = [
    { router: 'r1', out: 'r1-eth1', next: 'r2-eth0', link: 'r1 → r2', nh: '10.0.12.2' },
    { router: 'r2', out: 'r2-eth1', next: 'h2', link: 'r2 → h2', nh: `${c.dst}（直結）` },
  ]
  for (const [i, leg] of legs.entries()) {
    if (ttl <= 1) {
      snap([14, 15], `${leg.router} に着いた時点で TTL が ${ttl}。これ以上は渡せないので捨て、送信元へ Time to live exceeded を返す。traceroute はこれを使って途中のルーターを 1 台ずつ知る`, { TTL: ttl, いる場所: leg.router }, null, true)
      return frames
    }
    snap([10, 11], `${leg.router} が受け取る。宛先 IP ${c.dst} で経路表を引き直す。前のホップの判断は引き継がない`, { TTL: ttl, いる場所: leg.router }, i)
    ttl -= 1
    hops.push({ link: leg.link, ethSrc: MAC[leg.out]!, ethDst: MAC[leg.next]!, ...ip, ttl, sum: sum(i + 1) })
    snap([16, 17], `TTL を 1 減らして ${ttl}。TTL はヘッダのチェックサムの計算に含まれるので、チェックサムも書き換える${c.ttl === 64 ? `（実測では ${SUMS[i]} から ${SUMS[i + 1]}）` : ''}`, { TTL: ttl, いる場所: leg.router }, i + 1)
    snap([18, 19, 20, 21], `次ホップ ${leg.nh} の MAC を ARP の表から引き、イーサネットの送信元と宛先を書き換えて ${leg.out} から送る。IP の送信元と宛先はそのまま`, { TTL: ttl, いる場所: leg.link }, i + 1)
  }
  snap(21, `h2 に届いた。線ごとに MAC は 3 組とも違い、IP は 3 組とも同じ。TTL は通ったルーターの数だけ減った`, { TTL: ttl, いる場所: 'h2' }, null, true)
  return frames
}

const R1: Route[] = [
  { cidr: '10.0.1.0/24', via: null, dev: 'r1-eth0' },
  { cidr: '10.0.2.0/24', via: '10.0.12.2', dev: 'r1-eth1' },
  { cidr: '10.0.2.128/25', via: '10.0.1.10', dev: 'r1-eth0' },
  { cidr: '10.0.12.0/24', via: null, dev: 'r1-eth1' },
]
const DEFAULT: Route = { cidr: '0.0.0.0/0', via: '10.0.12.2', dev: 'r1-eth1' }

const CASES: { name: string; value: Case }[] = [
  { name: '/24 と /25 が重なる（.200）', value: { dst: '10.0.2.200', table: [DEFAULT, ...R1], ttl: 64 } },
  { name: '同じ表で .10', value: { dst: '10.0.2.10', table: [DEFAULT, ...R1], ttl: 64 } },
  { name: '既定経路だけに一致', value: { dst: '8.8.8.8', table: [DEFAULT, ...R1], ttl: 64 } },
  { name: '既定経路が無い', value: { dst: '8.8.8.8', table: R1, ttl: 64 } },
  {
    name: 'RFC 1812 の例',
    value: {
      dst: '10.144.2.5',
      table: [
        { cidr: '10.0.0.0/8', via: '192.0.2.1', dev: 'eth0' },
        { cidr: '10.144.0.0/16', via: '192.0.2.2', dev: 'eth0' },
        { cidr: '10.144.2.0/24', via: '192.0.2.3', dev: 'eth1' },
        { cidr: '128.12.0.0/16', via: '192.0.2.4', dev: 'eth1' },
      ],
      ttl: 64,
    },
  },
  {
    name: 'h2 まで運ぶ（MAC と TTL）',
    value: {
      dst: '10.0.2.10',
      table: [
        { cidr: '10.0.1.0/24', via: null, dev: 'r1-eth0' },
        { cidr: '10.0.2.0/24', via: '10.0.12.2', dev: 'r1-eth1' },
        { cidr: '10.0.12.0/24', via: null, dev: 'r1-eth1' },
      ],
      ttl: 64,
      walk: true,
    },
  },
  {
    name: 'TTL 2 で送る',
    value: {
      dst: '10.0.2.10',
      table: [
        { cidr: '10.0.1.0/24', via: null, dev: 'r1-eth0' },
        { cidr: '10.0.2.0/24', via: '10.0.12.2', dev: 'r1-eth1' },
        { cidr: '10.0.12.0/24', via: null, dev: 'r1-eth1' },
      ],
      ttl: 2,
      walk: true,
    },
  },
]

function Bits({ bits, len, state }: { bits: string; len: number; state: CellState }) {
  const s = cellStyle[state]
  return (
    <span className="font-mono text-[11px]">
      {bits.split('').map((b, i) => (
        <span key={i}>
          {i > 0 && i % 8 === 0 ? ' ' : ''}
          <span style={i < len ? { color: s.color, fontWeight: 700 } : { color: 'var(--fg-muted)', opacity: 0.45 }}>{b}</span>
        </span>
      ))}
    </span>
  )
}

export default function LongestPrefix() {
  const [pick, setPick] = useState(CASES[0]!)
  const frames = useMemo(() => trace(pick.value), [pick])

  return (
    <SimShell
      key={pick.name}
      title="最長一致で経路を選び、ホップごとに書き換える"
      subtitle="経路表の各行と宛先を上位ビットで比べ、一致した中で最も長いものを選ぶ。選んだ後はイーサネットの宛先だけを次ホップに書き換えて渡す"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="例" presets={CASES.map((c) => ({ name: c.name, value: c }))} onPick={setPick} />}
      legend={
        <>
          <LegendItem state="active">いま比べている</LegendItem>
          <LegendItem state="good">最長の一致</LegendItem>
          <LegendItem state="dim">一致するが短い</LegendItem>
          <LegendItem state="bad">不一致</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr style={{ color: 'var(--fg-muted)' }}>
                  <th className="px-2 py-1 text-left font-normal">宛先 / 経路</th>
                  <th className="px-2 py-1 text-left font-normal">2 進（比べる部分を濃く）</th>
                  <th className="px-2 py-1 text-left font-normal">次ホップ</th>
                  <th className="px-2 py-1 text-left font-normal" />
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-2 py-1 font-mono font-bold" style={{ color: 'var(--accent)' }}>{f.view.dst}</td>
                  <td className="px-2 py-1">
                    <Bits bits={f.view.dstBits} len={32} state="window" />
                  </td>
                  <td />
                  <td />
                </tr>
                {f.view.rows.map((r) => {
                  const s = cellStyle[r.state]
                  return (
                    <tr key={r.route.cidr} style={{ background: r.state === 'idle' ? undefined : s.background }}>
                      <td className="px-2 py-1 font-mono" style={{ color: r.state === 'idle' ? 'var(--fg)' : s.color }}>{r.route.cidr}</td>
                      <td className="px-2 py-1">
                        <Bits bits={r.bits} len={r.len} state={r.state === 'idle' ? 'window' : r.state} />
                      </td>
                      <td className="px-2 py-1 font-mono">{r.route.via ?? '直結'} <span style={{ color: 'var(--fg-muted)' }}>{r.route.dev}</span></td>
                      <td className="px-2 py-1 whitespace-nowrap" style={{ color: s.color }}>{r.mark}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {f.view.hops.length > 0 && (
            <table className="w-full border-collapse font-mono text-[11px]">
              <thead>
                <tr style={{ color: 'var(--fg-muted)' }}>
                  <th className="px-2 py-1 text-left font-normal">線</th>
                  <th className="px-2 py-1 text-left font-normal">MAC 送信元 → 宛先</th>
                  <th className="px-2 py-1 text-left font-normal">IP 送信元 → 宛先</th>
                  <th className="px-2 py-1 text-left font-normal">TTL</th>
                  <th className="px-2 py-1 text-left font-normal">checksum</th>
                </tr>
              </thead>
              <tbody>
                {f.view.hops.map((h, i) => (
                  <tr
                    key={h.link}
                    style={i === f.view.hopFocus ? { background: 'var(--accent-soft)' } : { borderTop: '1px solid var(--border)' }}
                  >
                    <td className="px-2 py-1 whitespace-nowrap">{h.link}</td>
                    <td className="px-2 py-1" style={{ color: 'var(--warn)' }}>{h.ethSrc} → {h.ethDst}</td>
                    <td className="px-2 py-1">{h.ipSrc} → {h.ipDst}</td>
                    <td className="px-2 py-1 font-bold">{h.ttl}</td>
                    <td className="px-2 py-1">{h.sum}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </SimShell>
  )
}

