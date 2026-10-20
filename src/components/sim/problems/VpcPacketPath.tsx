import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { LegendItem } from '../views/Legend'
import { cellStyle } from '../views/style'
import type { CellState, Frame } from '../core/types'

const CODE = `def send(pkt):
    sg_out(pkt)                       # 状態を持つ: 通したら接続を記録する
    nacl_out(pkt.subnet, pkt)         # 状態を持たない: 規則を番号順に照合
    hop = route_table(pkt.subnet).lookup(pkt.dst)   # 最長一致
    hop.forward(pkt)

def nat_gateway(pkt):
    pkt.src = (NAT_PRIVATE_IP, new_port())   # 対応を表に残す
    forward_by_route_table(pkt)

def internet_gateway(pkt):
    pkt.src = public_ip_of(pkt.src)   # 1 対 1 の変換
    to_internet(pkt)

def receive(pkt):
    pkt = undo_translation(pkt)       # IGW と NAT GW が宛先を戻す
    nacl_in(pkt.subnet, pkt)          # 戻りも、改めて番号順に照合
    if conntrack.has(reverse(pkt)):   # SG: 自分が出した接続の戻りは通す
        return deliver(pkt)
    sg_in(pkt)`

type Scenario = 'ok' | 'naclNoEphemeral' | 'noRoute' | 'publicSubnet'
type HopId = 'inst' | 'sgOut' | 'naclOut' | 'rtPriv' | 'natgw' | 'rtPub' | 'igw' | 'net' | 'naclIn' | 'sgIn'
type Hop = { id: HopId; name: string }
type Pkt = { src: string; dst: string }
type View = {
  hops: Hop[]
  states: Partial<Record<HopId, CellState>>
  pkt: Pkt | null
  dir: '行き' | '戻り'
  rules: { title: string; rows: { text: string; hit?: boolean }[] } | null
  outcome: 'running' | 'ok' | 'dropped'
}

const INST = '10.0.2.15'
const NAT_PRIV = '10.0.1.7'
const NAT_EIP = '198.51.100.20'
const INST_PUB = '198.51.100.31'
const SERVER = '203.0.113.10:443'
const EPH = 51432
const NAT_PORT = 61009

const HOPS: Record<HopId, string> = {
  inst: 'インスタンス',
  sgOut: 'SG（出）',
  naclOut: 'NACL（出）',
  rtPriv: 'ルートテーブル',
  natgw: 'NAT GW',
  rtPub: 'ルートテーブル（public）',
  igw: 'IGW',
  net: 'インターネット',
  naclIn: 'NACL（入）',
  sgIn: 'SG（入）',
}

const PRESETS: { name: string; value: Scenario }[] = [
  { name: 'private サブネットから NAT GW 経由', value: 'ok' },
  { name: 'NACL の入りに一時ポートが無い', value: 'naclNoEphemeral' },
  { name: '0.0.0.0/0 の経路が無い', value: 'noRoute' },
  { name: 'public サブネットから IGW へ直接', value: 'publicSubnet' },
]

function trace(s: Scenario): Frame<View>[] {
  const viaNat = s !== 'publicSubnet'
  const subnet = viaNat ? 'private 10.0.2.0/24' : 'public 10.0.1.0/24'
  const src = viaNat ? INST : '10.0.1.15'
  const hopIds: HopId[] = viaNat
    ? ['inst', 'sgOut', 'naclOut', 'rtPriv', 'natgw', 'rtPub', 'igw', 'net']
    : ['inst', 'sgOut', 'naclOut', 'rtPub', 'igw', 'net']
  const hops = hopIds.map((id) => ({ id, name: HOPS[id] }))
  const backHops: Hop[] = [
    { id: 'naclIn', name: HOPS.naclIn },
    { id: 'sgIn', name: HOPS.sgIn },
  ]
  const states: Partial<Record<HopId, CellState>> = {}
  const frames: Frame<View>[] = []
  let dir: View['dir'] = '行き'

  const snap = (
    at: HopId | null,
    line: number | number[],
    note: string,
    pkt: Pkt | null,
    rules: View['rules'] = null,
    outcome: View['outcome'] = 'running',
  ) => {
    if (at) {
      for (const k of Object.keys(states) as HopId[]) if (states[k] === 'active') states[k] = 'good'
      if (outcome !== 'dropped') states[at] = 'active'
      else states[at] = 'bad'
    }
    frames.push({
      line,
      note,
      vars: { 向き: dir, サブネット: subnet, 送信元: pkt?.src ?? '−', 宛先: pkt?.dst ?? '−' },
      view: { hops: [...hops, ...backHops], states: { ...states }, pkt, dir, rules, outcome },
      done: outcome !== 'running',
    })
  }

  const p0 = { src: `${src}:${EPH}`, dst: SERVER }
  snap('inst', 1, `${subnet} のインスタンスが ${SERVER} へ接続を始める。送信元ポート ${EPH} は OS が選んだ一時ポート`, p0)
  snap('sgOut', 2, 'SG の出の規則に照らす。許可されたので、この接続を記録する（戻りはこの記録で通る）', p0, {
    title: 'SG（出）',
    rows: [{ text: 'tcp 443 → 0.0.0.0/0 を許可', hit: true }],
  })
  snap('naclOut', 3, 'サブネットの NACL（出）を番号の小さい順に照合する。記録は何も残らない', p0, {
    title: 'NACL（出）',
    rows: [{ text: '100: すべて許可', hit: true }, { text: '*: すべて拒否' }],
  })

  const rt = viaNat ? 'rtPriv' : 'rtPub'
  if (s === 'noRoute') {
    snap(rt, 4, '宛先 203.0.113.10 に合う経路が local（10.0.0.0/16）しか無い。どこへも送れず捨てられる', p0, {
      title: 'ルートテーブル（private）',
      rows: [{ text: '10.0.0.0/16 → local' }, { text: '（0.0.0.0/0 の経路が無い）', hit: true }],
    }, 'dropped')
    return frames
  }
  snap(rt, 4, '最長一致で 0.0.0.0/0 が選ばれる。private では NAT GW、public では IGW が次の行き先', p0, {
    title: viaNat ? 'ルートテーブル（private）' : 'ルートテーブル（public）',
    rows: [
      { text: '10.0.0.0/16 → local' },
      { text: viaNat ? '0.0.0.0/0 → nat-gw' : '0.0.0.0/0 → igw', hit: true },
    ],
  })

  let pOut = p0
  if (viaNat) {
    pOut = { src: `${NAT_PRIV}:${NAT_PORT}`, dst: SERVER }
    snap('natgw', [6, 7], `NAT GW が送信元を自分の private アドレスとポート ${NAT_PORT} に書き換え、対応を表に残す`, pOut, {
      title: 'NAT GW の変換表',
      rows: [{ text: `${INST}:${EPH} ⇔ ${NAT_PRIV}:${NAT_PORT}`, hit: true }],
    })
    snap('rtPub', [4, 8], 'NAT GW は public サブネットにいる。その経路表で 0.0.0.0/0 → igw', pOut, {
      title: 'ルートテーブル（public）',
      rows: [{ text: '10.0.0.0/16 → local' }, { text: '0.0.0.0/0 → igw', hit: true }],
    })
  }
  const pub = viaNat ? NAT_EIP : INST_PUB
  const pNet = { src: `${pub}:${viaNat ? NAT_PORT : EPH}`, dst: SERVER }
  snap('igw', [10, 11], `IGW が送信元の private アドレスを、対応する public アドレス ${pub} に 1 対 1 で書き換える`, pNet, {
    title: 'IGW の対応',
    rows: [{ text: `${viaNat ? NAT_PRIV : '10.0.1.15'} ⇔ ${pub}`, hit: true }],
  })
  snap('net', 12, 'インターネット上のサーバに届く。サーバから見た相手は public アドレスだけ', pNet)

  dir = '戻り'
  const pBackNet = { src: SERVER, dst: pNet.src }
  snap('net', 14, 'サーバの応答。宛先は public アドレスと、行きの送信元ポート', pBackNet)
  const pBack = { src: SERVER, dst: `${src}:${EPH}` }
  snap(viaNat ? 'natgw' : 'igw', 15, viaNat
    ? `IGW が宛先を ${NAT_PRIV} に戻し、NAT GW が表を引いて ${src}:${EPH} に戻す`
    : `IGW が宛先を ${src} に戻す`, pBack)

  if (s === 'naclNoEphemeral') {
    snap('naclIn', 16, `戻りの宛先ポートは ${EPH}。NACL（入）は 443 番しか許可しておらず、状態も持たないので、行きを通したことを知らない。拒否`, pBack, {
      title: 'NACL（入）',
      rows: [{ text: '100: tcp 443 を許可' }, { text: '*: すべて拒否', hit: true }],
    }, 'dropped')
    return frames
  }
  snap('naclIn', 16, `戻りの宛先ポートは ${EPH}。NACL（入）に一時ポートの範囲を許可する規則があるので通る`, pBack, {
    title: 'NACL（入）',
    rows: [{ text: '100: tcp 443 を許可' }, { text: '110: tcp 1024-65535 を許可', hit: true }, { text: '*: すべて拒否' }],
  })
  snap('sgIn', [17, 18], 'SG の入りの規則は空。それでも、行きで記録した接続の戻りなので通る', pBack, {
    title: 'SG（入）',
    rows: [{ text: '（規則なし）' }, { text: `記録: ${src}:${EPH} ⇔ ${SERVER}`, hit: true }],
  })
  snap('inst', 18, 'インスタンスに応答が届く。インスタンスは自分の private アドレスしか知らない', pBack, null, 'ok')
  return frames
}

function Box({ name, state }: { name: string; state: CellState }) {
  const cs = cellStyle[state]
  return (
    <span
      className="rounded border px-2 py-1 text-center font-mono text-[11px]"
      style={{ background: cs.background, color: cs.color, borderColor: cs.borderColor }}
    >
      {name}
    </span>
  )
}

export default function VpcPacketPath() {
  const [s, setS] = useState<Scenario>('ok')
  const frames = useMemo(() => trace(s), [s])
  return (
    <SimShell
      title="VPC の中のパケットの道のり"
      subtitle="SG・NACL・ルートテーブル・NAT GW・IGW を 1 つずつ通し、戻りがどこで判定されるかを見る"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="構成" presets={PRESETS} onPick={setS} />}
      legend={
        <>
          <LegendItem state="active">いま判定している</LegendItem>
          <LegendItem state="good">通った</LegendItem>
          <LegendItem state="bad">ここで捨てられた</LegendItem>
        </>
      }
    >
      {(f) => {
        const v = f.view
        const forward = v.hops.filter((h) => h.id !== 'naclIn' && h.id !== 'sgIn')
        const back = v.hops.filter((h) => h.id === 'naclIn' || h.id === 'sgIn')
        const st = (id: HopId): CellState => v.states[id] ?? 'idle'
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-8 text-[11px]" style={{ color: 'var(--fg-muted)' }}>行き</span>
              {forward.map((h, i) => (
                <span key={h.id} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden style={{ color: 'var(--fg-muted)' }}>→</span>}
                  <Box name={h.name} state={st(h.id)} />
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-8 text-[11px]" style={{ color: 'var(--fg-muted)' }}>戻り</span>
              <span className="font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                インターネット → IGW{forward.some((h) => h.id === 'natgw') ? ' → NAT GW' : ''} →
              </span>
              {back.map((h, i) => (
                <span key={h.id} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden style={{ color: 'var(--fg-muted)' }}>→</span>}
                  <Box name={h.name} state={st(h.id)} />
                </span>
              ))}
              <span className="font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>→ インスタンス</span>
            </div>
            {v.pkt && (
              <p className="m-0 font-mono text-xs">
                <span style={{ color: 'var(--fg-muted)' }}>{v.dir}のパケット: </span>
                <span style={{ color: 'var(--accent)' }}>{v.pkt.src}</span>
                <span style={{ color: 'var(--fg-muted)' }}> → </span>
                <span style={{ color: 'var(--accent)' }}>{v.pkt.dst}</span>
              </p>
            )}
            {v.rules && (
              <div className="rounded border px-2 py-1.5" style={{ borderColor: 'var(--border)' }}>
                <p className="m-0 mb-1 text-[11px] font-bold" style={{ color: 'var(--fg-muted)' }}>{v.rules.title}</p>
                <ul className="m-0 list-none space-y-0.5 p-0">
                  {v.rules.rows.map((r, i) => (
                    <li
                      key={i}
                      className="font-mono text-[11px]"
                      style={{ color: r.hit ? (v.outcome === 'dropped' ? 'var(--danger)' : 'var(--ok)') : 'var(--fg-muted)' }}
                    >
                      {r.hit ? '▶ ' : '　 '}
                      {r.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {v.outcome !== 'running' && (
              <p
                className="m-0 inline-block rounded border px-2 py-0.5 font-mono text-[11px]"
                style={{
                  background: cellStyle[v.outcome === 'ok' ? 'good' : 'bad'].background,
                  color: cellStyle[v.outcome === 'ok' ? 'good' : 'bad'].color,
                  borderColor: cellStyle[v.outcome === 'ok' ? 'good' : 'bad'].borderColor,
                }}
              >
                {v.outcome === 'ok' ? '応答が届いた' : '捨てられた（送信側には何も返らず、時間切れを待つ）'}
              </p>
            )}
          </div>
        )
      }}
    </SimShell>
  )
}
