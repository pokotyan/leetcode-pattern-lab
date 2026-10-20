import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import type { Frame } from '../core/types'

const MAPE_CODE = `def map_e(end_user, rule_v6, rule_v4, ea_len, a=6):
    p = 32 - rule_v4.prefixlen        # IPv4 アドレスのうち、EA ビットから取る部分
    k = ea_len - p                    # PSID のビット数。2^k 人で 1 つの IPv4 を分ける
    ea = bits(end_user, start=rule_v6.prefixlen, length=ea_len)
    v4 = rule_v4.network | (ea >> k)
    psid = ea & (2**k - 1)
    m = 16 - a - k                    # 1 つの範囲に並ぶポートの数は 2^m
    ports = [(A << (16 - a)) | (psid << m) | j
             for A in range(1, 2**a)  # A = 0 は 0〜1023 を含むので使わない
             for j in range(2**m)]
    return v4, psid, ports`

const PATH_CODE = `def send_ipv4(packet, mode):
    if mode == 'PPPoE':
        frame = Ethernet(PPPoE(session_id, PPP(packet)))
        send(frame)                   # 網終端装置まで 1 本のセッション
    else:  # IPoE + MAP-E
        packet = napt(packet, port_set=my_ports)
        send(IPv6(src=my_ce_addr, dst=br_addr) / packet)

def at_nte(frame):                    # PPPoE の網終端装置
    packet = unwrap_ppp(frame)        # セッションをここで終える
    forward_to_isp(packet)

def at_br(v6_packet):                 # MAP-E の境界ルータ
    packet = decapsulate(v6_packet)
    check_port_in_set(packet, v6_packet.src)
    forward_to_ipv4_internet(packet)`

type MapeCase = {
  kind: 'mape'
  endUser: string
  endUserLen: number
  ruleV6Len: number
  ruleV4: string
  ruleV4Len: number
  eaLen: number
  offset: number
}
type PathCase = { kind: 'path'; mode: 'PPPoE' | 'IPoE' }
type Case = MapeCase | PathCase

type Seg = { label: string; bits: string; tone?: 'accent' | 'ok' | 'warn' | 'dim' }
type MapeView = {
  kind: 'mape'
  prefix: Seg[]
  port?: Seg[]
  v4?: string
  ranges?: string
  ce?: string
}
type Hop = { name: string; state: 'idle' | 'here' | 'past' }
type PathView = { kind: 'path'; hops: Hop[]; headers: string[] }
type View = MapeView | PathView

function v6ToBig(addr: string): bigint {
  const [head, tail] = addr.split('::')
  const h = head ? head.split(':') : []
  const t = tail !== undefined && tail !== '' ? tail.split(':') : []
  const groups = [...h, ...Array(8 - h.length - t.length).fill('0'), ...t]
  return groups.reduce((acc, g) => (acc << 16n) | BigInt(parseInt(g || '0', 16)), 0n)
}

function bigToV6(n: bigint): string {
  const groups: string[] = []
  for (let i = 7; i >= 0; i--) groups.push(((n >> BigInt(i * 16)) & 0xffffn).toString(16))
  return groups.join(':')
}

const v4ToNum = (s: string) => s.split('.').reduce((acc, o) => acc * 256 + Number(o), 0)
const numToV4 = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.')
const bin = (n: number | bigint, width: number) => n.toString(2).padStart(width, '0')

function traceMape(c: MapeCase): Frame<View>[] {
  const frames: Frame<View>[] = []
  const prefix = v6ToBig(c.endUser)
  const p = 32 - c.ruleV4Len
  const k = c.eaLen - p
  const shift = BigInt(128 - c.ruleV6Len - c.eaLen)
  const ea = Number((prefix >> shift) & ((1n << BigInt(c.eaLen)) - 1n))
  const suffix = ea >> k
  const psid = ea & ((1 << k) - 1)
  const v4 = numToV4(v4ToNum(c.ruleV4) + suffix)
  const m = 16 - c.offset - k

  const ruleBits = bin(prefix >> BigInt(128 - c.ruleV6Len), c.ruleV6Len)
  const restLen = c.endUserLen - c.ruleV6Len - c.eaLen
  const restBits = restLen > 0 ? bin((prefix >> BigInt(128 - c.endUserLen)) & ((1n << BigInt(restLen)) - 1n), restLen) : ''
  const groupBits = (s: string) => s.replace(/(.{8})/g, '$1 ').trim()

  const prefixSegs = (stage: number): Seg[] => {
    const segs: Seg[] = [{ label: `Rule IPv6 プレフィックス /${c.ruleV6Len}`, bits: groupBits(ruleBits), tone: 'dim' }]
    if (stage < 1) {
      segs.push({ label: `EA ビット ${c.eaLen} bit`, bits: bin(ea, c.eaLen), tone: 'accent' })
    } else {
      segs.push({ label: `IPv4 の後ろ ${p} bit`, bits: bin(suffix, p), tone: stage === 1 ? 'accent' : 'ok' })
      segs.push({ label: `PSID ${k} bit`, bits: bin(psid, k), tone: stage === 2 ? 'accent' : 'warn' })
    }
    if (restLen > 0) segs.push({ label: `利用者のサブネット ${restLen} bit`, bits: restBits, tone: 'dim' })
    return segs
  }
  const portSegs = (): Seg[] => [
    { label: `A ${c.offset} bit（0 以外）`, bits: 'x'.repeat(c.offset), tone: 'dim' },
    { label: `PSID ${k} bit`, bits: bin(psid, k), tone: 'warn' },
    { label: `j ${m} bit`, bits: 'y'.repeat(m), tone: 'dim' },
  ]

  const snap = (line: number | number[], note: string, view: Omit<MapeView, 'kind'>, done = false) =>
    frames.push({
      line,
      note,
      vars: { p, k: k, 'EA ビット': `0x${ea.toString(16)}`, PSID: `0x${psid.toString(16)}`, m },
      view: { kind: 'mape', ...view },
      done,
    })

  snap(1, `受け取ったのは利用者の IPv6 プレフィックス ${c.endUser}/${c.endUserLen} と、BMR（Rule IPv6 /${c.ruleV6Len}、Rule IPv4 ${c.ruleV4}/${c.ruleV4Len}、EA ビット長 ${c.eaLen}）`, {
    prefix: [{ label: `${c.endUser}/${c.endUserLen} の先頭 ${c.endUserLen} bit`, bits: groupBits(bin(prefix >> BigInt(128 - c.endUserLen), c.endUserLen)) }],
  })
  snap(2, `IPv4 アドレスは /${c.ruleV4Len} まで BMR で決まっている。残り p = 32 − ${c.ruleV4Len} = ${p} bit を EA ビットから取る`, { prefix: prefixSegs(0) })
  snap(3, `EA ビットの残り k = ${c.eaLen} − ${p} = ${k} bit が PSID。1 つの IPv4 アドレスを 2^${k} = ${2 ** k} 人で分ける`, { prefix: prefixSegs(0) })
  snap(4, `Rule IPv6 プレフィックスの直後 ${c.eaLen} bit が EA ビット = 0x${ea.toString(16)}`, { prefix: prefixSegs(0) })
  snap(5, `前の ${p} bit = 0x${suffix.toString(16)} を ${c.ruleV4} に足して、IPv4 アドレスは ${v4}`, { prefix: prefixSegs(1), v4 })
  snap(6, `後ろの ${k} bit = 0x${psid.toString(16)} が PSID。同じ ${v4} を使うほかの利用者とは、この値で分かれる`, { prefix: prefixSegs(2), v4 })
  snap(7, `ポート番号 16 bit を A ${c.offset} bit | PSID ${k} bit | j ${m} bit に割る。PSID の位置は全員同じなので、範囲は重ならない`, {
    prefix: prefixSegs(2),
    v4,
    port: portSegs(),
  })
  const ranges: [number, number][] = []
  for (let A = 1; A < 2 ** c.offset; A++) {
    const s = (A << (16 - c.offset)) | (psid << m)
    ranges.push([s, s + 2 ** m - 1])
  }
  const shown = ranges.slice(0, 3).map(([s, e]) => `${s}-${e}`).join(', ')
  const last = ranges[ranges.length - 1]!
  snap([8, 9, 10], `A は 1〜${2 ** c.offset - 1} の ${ranges.length} 通り、j は ${2 ** m} 通り。使えるポートは ${ranges.length} × ${2 ** m} = ${ranges.length * 2 ** m} 個`, {
    prefix: prefixSegs(2),
    v4,
    port: portSegs(),
    ranges: `${shown}, …, ${last[0]}-${last[1]}（${ranges.length} 範囲）`,
  })
  const iid = (BigInt(v4ToNum(v4)) << 16n) | BigInt(psid)
  const ce = bigToV6(((prefix >> BigInt(128 - c.endUserLen)) << BigInt(128 - c.endUserLen)) | iid)
  snap(11, `CE 自身の IPv6 アドレスは、プレフィックスの後ろに IPv4 アドレスと PSID を埋めたもの: ${ce}`, {
    prefix: prefixSegs(2),
    v4,
    port: portSegs(),
    ranges: `${shown}, …, ${last[0]}-${last[1]}（${ranges.length} 範囲）`,
    ce,
  }, true)
  return frames
}

function tracePath(c: PathCase): Frame<View>[] {
  const frames: Frame<View>[] = []
  const names =
    c.mode === 'PPPoE'
      ? ['端末', 'ホームゲートウェイ', '収容ルータ（NGN）', '網終端装置', 'ISP', 'IPv4 のインターネット']
      : ['端末', 'ホームゲートウェイ（MAP-E の CE）', '収容ルータ（NGN）', 'ゲートウェイルータ', 'VNE の境界ルータ（BR）', 'IPv4 のインターネット']
  const hops = (at: number): Hop[] => names.map((name, i) => ({ name, state: i === at ? 'here' : i < at ? 'past' : 'idle' }))
  const snap = (line: number | number[], at: number, headers: string[], note: string, done = false) =>
    frames.push({ line, note, vars: { 方式: c.mode, 位置: names[at] }, view: { kind: 'path', hops: hops(at), headers }, done })

  snap(1, 0, ['IPv4', 'TCP', 'データ'], '端末が IPv4 の宛先へ送る。端末から見ると、どちらの方式でも普通の IPv4 パケット')
  if (c.mode === 'PPPoE') {
    snap([2, 3, 4], 1, ['Ethernet', 'PPPoE', 'PPP', 'IPv4', 'TCP', 'データ'], 'ホームゲートウェイが PPP で包み、PPPoE のセッション番号を付けて Ethernet に載せる。ヘッダが 8 バイト増えるので MTU は 1492')
    snap(4, 2, ['Ethernet', 'PPPoE', 'PPP', 'IPv4', 'TCP', 'データ'], 'NGN の中では PPPoE のフレームのまま運ばれる。行き先は、接続時に認証を通した網終端装置だけ')
    snap([9, 10, 11], 3, ['IPv4', 'TCP', 'データ'], '網終端装置で PPP のセッションを終え、IPv4 パケットを取り出して ISP へ渡す。全利用者のセッションがここを通るので、装置の処理能力が上限になる')
    snap(11, 4, ['IPv4', 'TCP', 'データ'], 'ISP の網から先は普通の IPv4 のルーティング')
    snap(11, 5, ['IPv4', 'TCP', 'データ'], '宛先に届く。送信元は ISP が PPP で割り当てた IPv4 アドレス', true)
  } else {
    snap(6, 1, ['IPv4（送信元ポートを書き換え済み）', 'TCP', 'データ'], 'ホームゲートウェイが NAPT で送信元ポートを書き換える。選べるのは自分のポートセットの中だけ')
    snap(7, 1, ['IPv6（CE → BR）', 'IPv4', 'TCP', 'データ'], 'IPv6 で包む。送信元は自分の CE アドレス、宛先は境界ルータ。NGN から見ると普通の IPv6 パケット')
    snap(7, 2, ['IPv6（CE → BR）', 'IPv4', 'TCP', 'データ'], 'PPP のセッションも認証もない。IPv6 のまま経路表に従って運ばれる')
    snap(7, 3, ['IPv6（CE → BR）', 'IPv4', 'TCP', 'データ'], 'NGN の出口は、IPv6 のアドレスを預けた事業者（VNE）のゲートウェイルータ。網終端装置は通らない')
    snap([13, 14, 15], 4, ['IPv4', 'TCP', 'データ'], '境界ルータで IPv6 の外側を外す。送信元ポートが、送信元 IPv6 アドレスから計算したポートセットに入っているかを確かめる')
    snap(16, 5, ['IPv4', 'TCP', 'データ'], '宛先に届く。送信元の IPv4 アドレスはほかの利用者と共有で、ポートの範囲だけが自分のもの', true)
  }
  return frames
}

const CASES: { name: string; value: Case }[] = [
  {
    name: 'RFC 7597 の例（256 人で共有）',
    value: { kind: 'mape', endUser: '2001:db8:12:3400::', endUserLen: 56, ruleV6Len: 40, ruleV4: '192.0.2.0', ruleV4Len: 24, eaLen: 16, offset: 6 },
  },
  {
    name: '64 人で共有',
    value: { kind: 'mape', endUser: '2001:db8:12:3400::', endUserLen: 56, ruleV6Len: 40, ruleV4: '192.0.2.0', ruleV4Len: 24, eaLen: 14, offset: 6 },
  },
  {
    name: '16 人で共有',
    value: { kind: 'mape', endUser: '2001:db8:12:3400::', endUserLen: 56, ruleV6Len: 40, ruleV4: '192.0.2.0', ruleV4Len: 24, eaLen: 12, offset: 6 },
  },
  { name: '経路: PPPoE', value: { kind: 'path', mode: 'PPPoE' } },
  { name: '経路: IPoE + MAP-E', value: { kind: 'path', mode: 'IPoE' } },
]

const TONE: Record<NonNullable<Seg['tone']>, string> = {
  accent: 'var(--accent)',
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  dim: 'var(--fg-muted)',
}

function SegRow({ segs }: { segs: Seg[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {segs.map((s, i) => (
        <div
          key={i}
          className="rounded border px-2 py-1"
          style={{ borderColor: s.tone ? TONE[s.tone] : 'var(--border)', color: s.tone ? TONE[s.tone] : 'var(--fg)' }}
        >
          <div className="text-[10px]">{s.label}</div>
          <div className="font-mono text-[11px] break-all">{s.bits}</div>
        </div>
      ))}
    </div>
  )
}

export default function MapePorts() {
  const [c, setC] = useState<Case>(CASES[0]!.value)
  const frames = useMemo(() => (c.kind === 'mape' ? traceMape(c) : tracePath(c)), [c])

  return (
    <SimShell
      title="MAP-E のポートセットと、PPPoE / IPoE の経路"
      subtitle="IPv6 プレフィックスに埋め込まれた EA ビットから、共有する IPv4 アドレスと使えるポートの範囲が決まる"
      code={c.kind === 'mape' ? MAPE_CODE : PATH_CODE}
      frames={frames}
      controls={<PresetControl label="例" presets={CASES} onPick={setC} />}
    >
      {(f) =>
        f.view.kind === 'mape' ? (
          <div className="space-y-3 text-xs">
            <div>
              <p className="m-0 mb-1" style={{ color: 'var(--fg-muted)' }}>利用者の IPv6 プレフィックス</p>
              <SegRow segs={f.view.prefix} />
            </div>
            {f.view.v4 && (
              <p className="m-0 font-mono">
                共有する IPv4 アドレス: <span style={{ color: 'var(--ok)' }}>{f.view.v4}</span>
              </p>
            )}
            {f.view.port && (
              <div>
                <p className="m-0 mb-1" style={{ color: 'var(--fg-muted)' }}>ポート番号 16 bit の割り方</p>
                <SegRow segs={f.view.port} />
              </div>
            )}
            {f.view.ranges && <p className="m-0 font-mono text-[11px]">使えるポート: {f.view.ranges}</p>}
            {f.view.ce && (
              <p className="m-0 font-mono text-[11px]">
                CE の IPv6 アドレス: <span style={{ color: 'var(--accent)' }}>{f.view.ce}</span>
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3 text-xs">
            <ol className="m-0 flex list-none flex-wrap items-center gap-1 p-0">
              {f.view.hops.map((h, i, all) => (
                <li key={i} className="flex items-center gap-1">
                  <span
                    className="rounded border px-2 py-1"
                    style={{
                      borderColor: h.state === 'here' ? 'var(--accent)' : 'var(--border)',
                      color: h.state === 'idle' ? 'var(--fg-muted)' : 'var(--fg)',
                      background: h.state === 'here' ? 'var(--accent-soft)' : 'transparent',
                    }}
                  >
                    {h.name}
                  </span>
                  {i < all.length - 1 && <span style={{ color: 'var(--fg-muted)' }}>→</span>}
                </li>
              ))}
            </ol>
            <div>
              <p className="m-0 mb-1" style={{ color: 'var(--fg-muted)' }}>この区間を流れるもの（外側から）</p>
              <div className="flex flex-wrap gap-1 font-mono text-[11px]">
                {f.view.headers.map((h, i) => (
                  <span key={i} className="rounded border px-2 py-1" style={{ borderColor: 'var(--border)' }}>
                    {h}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )
      }
    </SimShell>
  )
}
