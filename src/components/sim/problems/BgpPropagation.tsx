import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { LegendItem } from '../views/Legend'
import type { Frame } from '../core/types'

const CODE = `def on_update(me, frm, prefix, as_path):
    if me.asn in as_path:                  # 自分の AS 番号が入っていたら捨てる
        return
    if me.rov and rpki_invalid(prefix, as_path[-1]):
        return
    me.adj_rib_in[prefix][frm] = as_path
    best = max(me.adj_rib_in[prefix].items(),
               key=lambda kv: (me.local_pref(kv[0]),  # 1. LOCAL_PREF が高い
                               -len(kv[1]),           # 2. AS_PATH が短い
                               -kv[0]))               # 3. 隣の AS 番号が小さい
    if best != me.best.get(prefix):
        me.best[prefix] = best
        for peer in me.peers:
            if peer != best[0]:
                path = [me.asn] * me.prepend(peer) + [me.asn] + best[1]
                send_update(peer, prefix, path)

def forward(me, dst_ip):
    prefix = longest_match(me.best, dst_ip)   # 最も長く一致する経路
    return me.best[prefix][0]                 # その経路をくれた隣へ渡す`

type Asn = 65001 | 65002 | 65003 | 65004 | 65066

const POS: Record<Asn, { x: number; y: number }> = {
  65001: { x: 70, y: 120 },
  65002: { x: 230, y: 50 },
  65003: { x: 230, y: 190 },
  65004: { x: 390, y: 120 },
  65066: { x: 390, y: 30 },
}
const LINKS: [Asn, Asn][] = [
  [65001, 65002],
  [65001, 65003],
  [65002, 65004],
  [65003, 65004],
  [65066, 65002],
]
const ORIGIN = 65001
const ATTACKER = 65066
const VICTIM = '198.51.100.0/24'
const DST = '198.51.100.10'

type Case = {
  /** 受け取り側が、どの隣から来た経路に LOCAL_PREF を付けるか */
  localPref: Partial<Record<Asn, Partial<Record<Asn, number>>>>
  /** 送り側が、どの隣へ自分の AS 番号を余分に何回重ねるか */
  prepend: Partial<Record<Asn, Partial<Record<Asn, number>>>>
  /** 攻撃者が広告するプレフィックス */
  hijack: string[]
  /** 起源の検証で Invalid を捨てる AS */
  rov: Asn[]
}

type Msg = { from: Asn; to: Asn; prefix: string; path: Asn[] }
type View = {
  msg?: Msg
  verdict?: 'loop' | 'invalid' | 'best' | 'kept'
  best: Record<Asn, { prefix: string; via: Asn | null; path: Asn[] }[]>
  route?: Asn[]
}

const peersOf = (a: Asn) => LINKS.flatMap(([x, y]) => (x === a ? [y] : y === a ? [x] : []))
const prefixLen = (p: string) => Number(p.split('/')[1])

function covers(prefix: string, ip: string) {
  const [net, len] = prefix.split('/')
  const toInt = (s: string) => s.split('.').reduce((n, o) => n * 256 + Number(o), 0)
  const mask = Number(len) === 0 ? 0 : 2 ** 32 - 2 ** (32 - Number(len))
  return (toInt(ip) & mask) >>> 0 === (toInt(net!) & mask) >>> 0
}

/** ROA は 198.51.100.0/24、起源 65001、最大長 24 の 1 件だけ */
const rpkiInvalid = (prefix: string, origin: Asn) =>
  covers(VICTIM, prefix.split('/')[0]!) && prefixLen(prefix) >= 24 && (origin !== ORIGIN || prefixLen(prefix) > 24)

function trace(c: Case): Frame<View>[] {
  const ases: Asn[] = [65001, 65002, 65003, 65004, 65066]
  const ribIn = new Map<Asn, Map<string, Map<Asn, Asn[]>>>(ases.map((a) => [a, new Map()]))
  const best = new Map<Asn, Map<string, { via: Asn | null; path: Asn[] }>>(ases.map((a) => [a, new Map()]))
  const frames: Frame<View>[] = []
  const queue: Msg[] = []

  const snapBest = () =>
    Object.fromEntries(
      ases.map((a) => [
        a,
        [...best.get(a)!.entries()]
          .sort(([p], [q]) => p.localeCompare(q))
          .map(([prefix, r]) => ({ prefix, via: r.via, path: r.path })),
      ]),
    ) as View['best']

  const lp = (me: Asn, from: Asn) => c.localPref[me]?.[from] ?? 100

  const advertise = (me: Asn, prefix: string, path: Asn[], except: Asn | null) => {
    for (const peer of peersOf(me)) {
      if (peer === except) continue
      const extra = c.prepend[me]?.[peer] ?? 0
      queue.push({ from: me, to: peer, prefix, path: [...Array(extra + 1).fill(me), ...path] })
    }
  }

  const originate = (me: Asn, prefix: string) => {
    best.get(me)!.set(prefix, { via: null, path: [] })
    frames.push({
      line: [15, 16],
      note: `AS${me} が ${prefix} を自分の経路として広告する。隣の AS へ、AS_PATH に自分の番号だけを入れた UPDATE を送る`,
      vars: { 送り元: `AS${me}`, プレフィックス: prefix },
      view: { best: snapBest() },
    })
    advertise(me, prefix, [], null)
  }

  originate(ORIGIN, VICTIM)
  let steps = 0
  const drain = () => {
    while (queue.length > 0 && steps < 60) {
      steps++
      const m = queue.shift()!
      const me = m.to
      const vars = { 受け手: `AS${me}`, 送り元: `AS${m.from}`, プレフィックス: m.prefix, AS_PATH: m.path.join(' ') }
      if (m.path.includes(me)) {
        frames.push({
          line: [2, 3],
          note: `AS${m.from} から AS${me} へ ${m.prefix}（AS_PATH ${m.path.join(' ')}）。自分の番号 ${me} が入っているので捨てる。これで経路がループしない`,
          vars,
          view: { msg: m, verdict: 'loop', best: snapBest() },
        })
        continue
      }
      if (c.rov.includes(me) && rpkiInvalid(m.prefix, m.path[m.path.length - 1]!)) {
        frames.push({
          line: [4, 5],
          note: `AS${me} は起源を検証する。${m.prefix} の起源 AS${m.path[m.path.length - 1]} は ROA（198.51.100.0/24、AS65001、最大長 24）に合わないので Invalid として捨てる`,
          vars,
          view: { msg: m, verdict: 'invalid', best: snapBest() },
        })
        continue
      }
      const table = ribIn.get(me)!
      if (!table.has(m.prefix)) table.set(m.prefix, new Map())
      table.get(m.prefix)!.set(m.from, m.path)
      const mine = best.get(me)!.get(m.prefix)
      if (mine && mine.via === null) {
        frames.push({ line: 6, note: `AS${me} は ${m.prefix} を自分で広告しているので、受け取った経路は使わない`, vars, view: { msg: m, verdict: 'kept', best: snapBest() } })
        continue
      }
      const cands = [...table.get(m.prefix)!.entries()].sort(
        ([fa, pa], [fb, pb]) => lp(me, fb) - lp(me, fa) || pa.length - pb.length || fa - fb,
      )
      const [via, path] = cands[0]!
      const changed = !mine || mine.via !== via || mine.path.join() !== path.join()
      if (changed) {
        best.get(me)!.set(m.prefix, { via, path })
        const why =
          cands.length === 1
            ? 'まだ経路がこれしかないので最良'
            : lp(me, via) !== lp(me, cands[1]![0])
              ? `LOCAL_PREF ${lp(me, via)} が高いので最良`
              : path.length !== cands[1]![1].length
                ? `AS_PATH が ${path.length} 個で短いので最良`
                : '同点なので隣の AS 番号が小さい方を最良'
        frames.push({
          line: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
          note: `AS${m.from} → AS${me}：${m.prefix}（AS_PATH ${m.path.join(' ')}）。${why}。最良が変わったので、ほかの隣へ広告し直す`,
          vars: { ...vars, LOCAL_PREF: lp(me, via) },
          view: { msg: m, verdict: 'best', best: snapBest() },
        })
        advertise(me, m.prefix, path, via)
      } else {
        frames.push({
          line: [7, 8, 9, 10, 11],
          note: `AS${m.from} → AS${me}：${m.prefix}（AS_PATH ${m.path.join(' ')}）。いまの最良（AS${mine!.via} 経由、${mine!.path.length} 個）より良くないので、表に残すだけ`,
          vars: { ...vars, LOCAL_PREF: lp(me, m.from) },
          view: { msg: m, verdict: 'kept', best: snapBest() },
        })
      }
    }
  }
  drain()
  if (c.hijack.length > 0) {
    for (const p of c.hijack) {
      best.get(ATTACKER)!.set(p, { via: null, path: [] })
      advertise(ATTACKER, p, [], null)
    }
    frames.push({
      line: [15, 16],
      note: `経路が落ち着いたところで、AS${ATTACKER} が自分のものではない ${c.hijack.join(' と ')} を広告し始める`,
      vars: { 送り元: `AS${ATTACKER}`, プレフィックス: c.hijack.join(', ') },
      view: { best: snapBest() },
    })
    drain()
  }

  const route: Asn[] = [65004]
  let at: Asn = 65004
  while (route.length < 8) {
    const match: [string, { via: Asn | null; path: Asn[] }] | undefined = [...best.get(at)!.entries()]
      .filter(([p]) => covers(p, DST))
      .sort(([p], [q]) => prefixLen(q) - prefixLen(p))[0]
    if (!match || match[1].via === null) break
    at = match[1].via
    route.push(at)
  }
  const end = route[route.length - 1]!
  frames.push({
    line: [18, 19, 20],
    note: `AS65004 から ${DST} 宛てに送ると、各 AS が最も長く一致する経路をたどって ${route.map((a) => `AS${a}`).join(' → ')} に届く。${end === ORIGIN ? '正しい持ち主に届いた' : '持ち主ではない AS に吸い込まれた'}`,
    vars: { 宛先: DST, 届いた先: `AS${end}` },
    view: { best: snapBest(), route },
    done: true,
  })
  return frames
}

const CASES: { name: string; value: Case }[] = [
  { name: '普通に広告する', value: { localPref: {}, prepend: {}, hijack: [], rov: [] } },
  { name: 'AS_PATH を水増し', value: { localPref: {}, prepend: { 65001: { 65002: 2 } }, hijack: [], rov: [] } },
  { name: 'LOCAL_PREF で選ぶ', value: { localPref: { 65004: { 65003: 200 } }, prepend: { 65001: { 65003: 2 } }, hijack: [], rov: [] } },
  { name: '同じ /24 を横取り', value: { localPref: { 65002: { 65066: 200 } }, prepend: {}, hijack: [VICTIM], rov: [] } },
  { name: 'より長い /25 で横取り', value: { localPref: {}, prepend: {}, hijack: ['198.51.100.0/25', '198.51.100.128/25'], rov: [] } },
  { name: '/25 を起源の検証で捨てる', value: { localPref: {}, prepend: {}, hijack: ['198.51.100.0/25', '198.51.100.128/25'], rov: [65002, 65003, 65004] } },
]

const VERDICT = {
  loop: { color: 'var(--fg-muted)', label: 'ループなので捨てる' },
  invalid: { color: 'var(--danger)', label: 'Invalid なので捨てる' },
  best: { color: 'var(--ok)', label: '最良に採用' },
  kept: { color: 'var(--warn)', label: '表に残すだけ' },
} as const

function Topology({ view }: { view: View }) {
  const R = 20
  const onRoute = (a: Asn, b: Asn) => {
    const r = view.route ?? []
    return r.some((x, i) => i > 0 && ((r[i - 1] === a && x === b) || (r[i - 1] === b && x === a)))
  }
  return (
    <svg viewBox="0 0 460 230" style={{ maxWidth: '100%', height: 'auto' }} role="img">
      {LINKS.map(([a, b]) => {
        const active = view.msg && ((view.msg.from === a && view.msg.to === b) || (view.msg.from === b && view.msg.to === a))
        const routed = onRoute(a, b)
        return (
          <line
            key={`${a}-${b}`}
            x1={POS[a].x}
            y1={POS[a].y}
            x2={POS[b].x}
            y2={POS[b].y}
            stroke={routed ? 'var(--ok)' : active ? 'var(--accent)' : 'var(--border)'}
            strokeWidth={routed || active ? 3 : 1.5}
          />
        )
      })}
      {view.msg && (() => {
        const a = POS[view.msg.from]
        const b = POS[view.msg.to]
        const x = a.x + (b.x - a.x) * 0.62
        const y = a.y + (b.y - a.y) * 0.62
        return <circle cx={x} cy={y} r={6} fill={VERDICT[view.verdict!].color} />
      })()}
      {(Object.keys(POS) as unknown as Asn[]).map((k) => {
        const a = Number(k) as Asn
        const p = POS[a]
        const isMe = view.msg?.to === a
        const stroke = a === ATTACKER ? 'var(--danger)' : a === ORIGIN ? 'var(--ok)' : isMe ? 'var(--accent)' : 'var(--border)'
        return (
          <g key={a}>
            <circle cx={p.x} cy={p.y} r={R} fill="var(--bg)" stroke={stroke} strokeWidth={isMe ? 3 : 2} />
            <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="700" fontFamily="ui-monospace, monospace" fill="var(--fg)">
              {a}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default function BgpPropagation() {
  const [c, setC] = useState<Case>(CASES[0]!.value)
  const frames = useMemo(() => trace(c), [c])

  return (
    <SimShell
      title="BGP の経路が伝わる（UPDATE と最良経路の選択）"
      subtitle="5 つの AS が 198.51.100.0/24 の広告を受け渡す。LOCAL_PREF、AS_PATH の長さ、隣の AS 番号の順に比べる簡略版"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="状況" presets={CASES} onPick={setC} />}
      legend={
        <>
          <LegendItem state="good">正しい持ち主 AS65001 / 届いた経路</LegendItem>
          <LegendItem state="bad">横取りする AS65066</LegendItem>
          <LegendItem state="active">いま UPDATE を受け取る AS</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-2">
          <Topology view={f.view} />
          {f.view.verdict && (
            <p className="m-0 font-mono text-xs" style={{ color: VERDICT[f.view.verdict].color }}>
              {VERDICT[f.view.verdict].label}
            </p>
          )}
          <table className="w-full border-collapse font-mono text-[11px]">
            <thead>
              <tr style={{ color: 'var(--fg-muted)' }}>
                <th className="border-b px-1 py-0.5 text-left" style={{ borderColor: 'var(--border)' }}>AS</th>
                <th className="border-b px-1 py-0.5 text-left" style={{ borderColor: 'var(--border)' }}>最良経路（プレフィックス ← 隣　AS_PATH）</th>
              </tr>
            </thead>
            <tbody>
              {([65001, 65002, 65003, 65004, 65066] as Asn[]).map((a) => (
                <tr key={a} style={{ background: f.view.msg?.to === a ? 'var(--accent-soft)' : undefined }}>
                  <td className="px-1 py-0.5 align-top">{a}</td>
                  <td className="px-1 py-0.5">
                    {f.view.best[a].length === 0
                      ? '−'
                      : f.view.best[a].map((r) => (
                          <div key={r.prefix}>
                            {r.prefix} ← {r.via === null ? '自分で広告' : `${r.via}　${r.path.join(' ')}`}
                          </div>
                        ))}
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
