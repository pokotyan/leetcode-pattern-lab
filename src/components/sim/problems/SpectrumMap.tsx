import { useMemo, useState } from 'react'
import { Slider, VizShell } from '../viz/VizShell'

type Cat = 'broadcast' | 'mobile' | 'wlan' | 'sat' | 'radar' | 'other'

type Band = { name: string; lo: number; hi: number; cat: Cat; note: string }

// 値はすべて MHz。総務省「周波数割当計画」（令和 8 年 4 月 1 日現在）の周波数割当表・別表、
// 電波法施行規則第 6 条第 4 項、総務省「無線LANの屋外利用／上空利用について」で確かめたもの
const BANDS: Band[] = [
  { name: '中波放送（AM）', lo: 0.5265, hi: 1.6065, cat: 'broadcast', note: '国内分配は放送。割当表 第 1 表' },
  { name: 'アマチュア（28MHz 帯）', lo: 28, hi: 29.7, cat: 'other', note: 'アマチュア・アマチュア衛星' },
  { name: '超短波放送（FM）', lo: 76, hi: 90, cat: 'broadcast', note: '国内分配は放送' },
  { name: '超短波放送（FM）', lo: 90, hi: 108, cat: 'broadcast', note: '国内分配は放送' },
  { name: '地上デジタルテレビ', lo: 470, hi: 710, cat: 'broadcast', note: '国内分配の 470-710MHz は放送ほか' },
  { name: '携帯（700MHz 上り）', lo: 715, hi: 748, cat: 'mobile', note: '別表 10-2：陸上移動局用（端末の送信）' },
  { name: '携帯（700MHz 下り）', lo: 770, hi: 803, cat: 'mobile', note: '別表 10-2：基地局用' },
  { name: '携帯（800MHz 上り）', lo: 815, hi: 845, cat: 'mobile', note: '別表 10-2：陸上移動局用' },
  { name: '携帯（800MHz 下り）', lo: 860, hi: 890, cat: 'mobile', note: '別表 10-2：基地局用' },
  { name: '携帯（900MHz 上り）', lo: 900, hi: 915, cat: 'mobile', note: '別表 10-2：陸上移動局用' },
  { name: 'テレメーター・データ伝送ほか（920MHz 帯）', lo: 915, hi: 930, cat: 'other', note: '小電力業務用・移動体識別用など' },
  { name: '携帯（900MHz 下り）', lo: 945, hi: 960, cat: 'mobile', note: '別表 10-2：基地局用' },
  { name: '携帯（1.5GHz 上り）', lo: 1427.9, hi: 1462.9, cat: 'mobile', note: '別表 10-2：陸上移動局用' },
  { name: '携帯（1.5GHz 下り）', lo: 1475.9, hi: 1510.9, cat: 'mobile', note: '別表 10-2：基地局用' },
  { name: '衛星測位（GPS など）', lo: 1559, hi: 1610, cat: 'sat', note: '無線航行衛星（宇宙から地球）' },
  { name: '携帯（1.7GHz 上り）', lo: 1710, hi: 1785, cat: 'mobile', note: '別表 10-2：陸上移動局用' },
  { name: '携帯（1.7GHz 下り）', lo: 1805, hi: 1880, cat: 'mobile', note: '別表 10-2：基地局用' },
  { name: '携帯（2GHz 上り）', lo: 1920, hi: 1980, cat: 'mobile', note: '別表 10-2：陸上移動局用' },
  { name: '携帯（2GHz TDD）', lo: 2010, hi: 2025, cat: 'mobile', note: '別表 10-3：一周波方式' },
  { name: '携帯（2GHz 下り）', lo: 2110, hi: 2170, cat: 'mobile', note: '別表 10-2：基地局用' },
  { name: '携帯（2.3GHz TDD）', lo: 2330, hi: 2370, cat: 'mobile', note: '別表 10-3。同じ帯に放送事業用も載っている' },
  { name: '無線 LAN・Bluetooth（2.4GHz、ISM）', lo: 2400, hi: 2483.5, cat: 'wlan', note: '小電力データ通信システム。ISM の指定（RR 5.150）があり、電子レンジなどの混信を容認する' },
  { name: '無線 LAN（2.4GHz、追加分）', lo: 2471, hi: 2497, cat: 'wlan', note: '施行規則第 6 条第 4 項第 4 号（2）' },
  { name: '空港監視レーダー', lo: 2700, hi: 2900, cat: 'radar', note: '航空無線航行。ASR 用' },
  { name: '携帯（3.4〜4.1GHz TDD）', lo: 3400, hi: 4100, cat: 'mobile', note: '別表 10-3' },
  { name: '携帯（4.5GHz TDD）', lo: 4500, hi: 4600, cat: 'mobile', note: '別表 10-3' },
  { name: '携帯（4.9GHz TDD）', lo: 4900, hi: 5000, cat: 'mobile', note: '別表 10-3' },
  { name: '無線 LAN 5.2GHz', lo: 5150, hi: 5250, cat: 'wlan', note: '衛星へのフィーダリンク（地球から宇宙）と共用' },
  { name: '衛星フィーダリンク（上り）', lo: 5150, hi: 5250, cat: 'sat', note: '固定衛星（地球から宇宙）' },
  { name: '無線 LAN 5.3GHz（DFS 必須）', lo: 5250, hi: 5350, cat: 'wlan', note: '屋内のみ。同じ帯に無線標定（気象レーダー）' },
  { name: '気象レーダー（5.3GHz 帯）', lo: 5250, hi: 5350, cat: 'radar', note: '無線標定 公共業務用' },
  { name: '無線 LAN 5.6GHz（DFS 必須）', lo: 5470, hi: 5730, cat: 'wlan', note: '屋外も可。海上無線航行（船舶レーダー）・無線標定と共用' },
  { name: 'ETC など（狭域通信）', lo: 5770, hi: 5850, cat: 'other', note: '狭域通信システム' },
  { name: '無線 LAN 6GHz', lo: 5925, hi: 6425, cat: 'wlan', note: '令和 4 年 9 月から。屋外は VLP（EIRP 25mW 以下）のみ' },
  { name: '固定通信・衛星上り（6GHz 帯）', lo: 5925, hi: 6425, cat: 'sat', note: '固定（電気通信業務用）と固定衛星（地球から宇宙）' },
  { name: '船舶レーダー', lo: 9300, hi: 9500, cat: 'radar', note: '海上無線航行' },
  { name: '衛星放送（BS）', lo: 11700, hi: 12200, cat: 'broadcast', note: '放送衛星。別表 1-2' },
  { name: '携帯（28GHz 帯 TDD）', lo: 27000, hi: 28200, cat: 'mobile', note: '別表 10-3' },
  { name: '携帯（29GHz 帯 TDD）', lo: 29100, hi: 29500, cat: 'mobile', note: '別表 10-3' },
  { name: '無線 LAN 60GHz', lo: 57000, hi: 66000, cat: 'wlan', note: '施行規則第 6 条第 4 項第 4 号（6）' },
]

const CATS: { id: Cat; label: string; color: string }[] = [
  { id: 'broadcast', label: '放送', color: 'var(--warn)' },
  { id: 'mobile', label: '携帯電話', color: 'var(--accent)' },
  { id: 'wlan', label: '無線 LAN など', color: 'var(--ok)' },
  { id: 'sat', label: '衛星・固定', color: 'var(--fg-muted)' },
  { id: 'radar', label: 'レーダー', color: 'var(--danger)' },
  { id: 'other', label: 'その他', color: 'var(--fg)' },
]

const PRESETS: { name: string; center: number; span: number }[] = [
  { name: '全体', center: Math.log10(300), span: 5.6 },
  { name: '携帯の帯', center: Math.log10(1700), span: 1.4 },
  { name: '2〜7GHz', center: Math.log10(4000), span: 0.6 },
  { name: '5GHz 帯の拡大', center: Math.log10(5500), span: 0.12 },
]

const W = 760
const LANE_H = 30
const AXIS_H = 26

function fmt(mhz: number): string {
  if (mhz >= 1000) return `${+(mhz / 1000).toPrecision(4)}GHz`
  if (mhz >= 1) return `${+mhz.toPrecision(4)}MHz`
  return `${+(mhz * 1000).toPrecision(4)}kHz`
}

function ticks(lo: number, hi: number): number[] {
  const out: number[] = []
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** e
      if (v >= lo && v <= hi) out.push(v)
    }
  }
  if (out.length < 4) {
    const step = 10 ** Math.floor(Math.log10(hi - lo))
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v)
  }
  return [...new Set(out)].sort((a, b) => a - b)
}

export default function SpectrumMap() {
  const [center, setCenter] = useState(PRESETS[0]!.center)
  const [span, setSpan] = useState(PRESETS[0]!.span)
  const [shown, setShown] = useState<Set<Cat>>(new Set(CATS.map((c) => c.id)))
  const [picked, setPicked] = useState<Band | null>(null)

  const lo = 10 ** (center - span / 2)
  const hi = 10 ** (center + span / 2)
  const x = (f: number) => ((Math.log10(f) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * W

  const lanes = CATS.filter((c) => shown.has(c.id))
  const visible = useMemo(
    () => BANDS.filter((b) => shown.has(b.cat) && b.hi > lo && b.lo < hi),
    [shown, lo, hi],
  )
  const H = AXIS_H + lanes.length * LANE_H + 8

  const toggle = (c: Cat) =>
    setShown((s) => {
      const n = new Set(s)
      if (n.has(c)) n.delete(c)
      else n.add(c)
      return n
    })

  return (
    <VizShell
      title="日本の電波の割り当て（抜粋）"
      subtitle="横軸は対数の周波数。帯をクリックすると、何に割り当てられているかが出る"
      controls={
        <>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  setCenter(p.center)
                  setSpan(p.span)
                }}
                className="rounded border px-2 py-1"
                style={{ borderColor: 'var(--border)', color: 'var(--fg)', background: 'var(--bg)' }}
              >
                {p.name}
              </button>
            ))}
          </div>
          <Slider label="中心" value={center} min={-0.5} max={4.8} step={0.01} onChange={setCenter} format={(v) => fmt(10 ** v)} />
          <Slider label="表示幅" value={span} min={0.05} max={6} step={0.01} onChange={setSpan} format={(v) => `${v.toFixed(2)} 桁`} />
          <div className="flex flex-wrap gap-1.5">
            {CATS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                className="rounded border px-2 py-1"
                style={{
                  borderColor: c.color,
                  color: shown.has(c.id) ? 'var(--bg)' : c.color,
                  background: shown.has(c.id) ? c.color : 'transparent',
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </>
      }
      readout={
        picked ? (
          <>
            <span style={{ color: 'var(--fg)' }}>{picked.name}</span>：{fmt(picked.lo)} 〜 {fmt(picked.hi)}（幅{' '}
            {fmt(picked.hi - picked.lo)}）。{picked.note}
          </>
        ) : (
          <>表示中 {fmt(lo)} 〜 {fmt(hi)}。帯をクリックすると詳細を表示します</>
        )
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 560, display: 'block' }} role="img" aria-label="周波数の割り当て図">
        {ticks(lo, hi).map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={AXIS_H - 6} y2={H} stroke="var(--border)" strokeWidth={1} />
            <text x={x(t)} y={AXIS_H - 10} textAnchor="middle" fontSize={10} fill="var(--fg-muted)">
              {fmt(t)}
            </text>
          </g>
        ))}
        {lanes.map((c, i) => (
          <text key={c.id} x={4} y={AXIS_H + i * LANE_H + 19} fontSize={10} fill={c.color} opacity={0.7}>
            {c.label}
          </text>
        ))}
        {visible.map((b) => {
          const lane = lanes.findIndex((c) => c.id === b.cat)
          const color = CATS.find((c) => c.id === b.cat)!.color
          const x0 = Math.max(0, x(b.lo))
          const x1 = Math.min(W, x(b.hi))
          const w = Math.max(2, x1 - x0)
          const y = AXIS_H + lane * LANE_H + 4
          const active = picked === b
          return (
            <g key={`${b.name}-${b.lo}`} onClick={() => setPicked(b)} style={{ cursor: 'pointer' }}>
              <rect
                x={x0}
                y={y}
                width={w}
                height={LANE_H - 8}
                rx={3}
                fill={color}
                fillOpacity={active ? 0.9 : 0.45}
                stroke={color}
                strokeWidth={active ? 2 : 1}
              />
              {w > 70 && (
                <text x={x0 + 4} y={y + 15} fontSize={10} fill="var(--fg)">
                  {b.name.length > w / 10 ? `${b.name.slice(0, Math.floor(w / 10))}…` : b.name}
                </text>
              )}
              <title>{`${b.name} ${fmt(b.lo)}〜${fmt(b.hi)}`}</title>
            </g>
          )
        })}
      </svg>
    </VizShell>
  )
}
