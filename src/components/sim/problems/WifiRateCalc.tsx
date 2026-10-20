import { useMemo, useState } from 'react'
import { Slider, VizShell } from '../viz/VizShell'

type Std = {
  id: string
  label: string
  /** 帯域幅（MHz）→ データ用サブキャリア数 */
  nsd: Record<number, number>
  /** ガードインターバルを除いた OFDM シンボルの長さ（µs） */
  symbol: number
  gis: number[]
  maxMcs: number
  maxNss: number
}

const STDS: Std[] = [
  { id: 'n', label: '802.11n（Wi-Fi 4）', nsd: { 20: 52, 40: 108 }, symbol: 3.2, gis: [0.8, 0.4], maxMcs: 7, maxNss: 4 },
  { id: 'ac', label: '802.11ac（Wi-Fi 5）', nsd: { 20: 52, 40: 108, 80: 234, 160: 468 }, symbol: 3.2, gis: [0.8, 0.4], maxMcs: 9, maxNss: 8 },
  { id: 'ax', label: '802.11ax（Wi-Fi 6/6E）', nsd: { 20: 234, 40: 468, 80: 980, 160: 1960 }, symbol: 12.8, gis: [0.8, 1.6, 3.2], maxMcs: 11, maxNss: 8 },
  { id: 'be', label: '802.11be（Wi-Fi 7）', nsd: { 20: 234, 40: 468, 80: 980, 160: 1960, 320: 3920 }, symbol: 12.8, gis: [0.8, 1.6, 3.2], maxMcs: 13, maxNss: 8 },
]

// MCS 番号 → [1 サブキャリアあたりのビット数, 符号化率, 名前]。0〜9 は 11n 以降で共通（11n は 7 まで）
const MCS: [number, number, string][] = [
  [1, 1 / 2, 'BPSK 1/2'], [2, 1 / 2, 'QPSK 1/2'], [2, 3 / 4, 'QPSK 3/4'], [4, 1 / 2, '16-QAM 1/2'],
  [4, 3 / 4, '16-QAM 3/4'], [6, 2 / 3, '64-QAM 2/3'], [6, 3 / 4, '64-QAM 3/4'], [6, 5 / 6, '64-QAM 5/6'],
  [8, 3 / 4, '256-QAM 3/4'], [8, 5 / 6, '256-QAM 5/6'], [10, 3 / 4, '1024-QAM 3/4'], [10, 5 / 6, '1024-QAM 5/6'],
  [12, 3 / 4, '4096-QAM 3/4'], [12, 5 / 6, '4096-QAM 5/6'],
]

// 5 GHz の OFDM の時間の定数（本文の出典を参照）。プリアンブルと Block Ack は概算
const SLOT = 9
const SIFS = 16
const AIFS = SIFS + 3 * SLOT
const CW_MIN = 15
const CW_MAX = 1023
const PREAMBLE = 48
const BLOCK_ACK = 52
const MPDU_BYTES = 1538

function phyRate(std: Std, bw: number, mcs: number, nss: number, gi: number) {
  const [bits, r] = MCS[mcs]!
  return (std.nsd[bw]! * bits * r * nss) / (std.symbol + gi)
}

type Ev = { t: number; backoff: number[]; winners: number[]; dur: number }
type Airtime = { wait: number; preamble: number; data: number; ack: number; collision: number }

/** 飽和した n 台の CSMA/CA を、種を固定した乱数で txops 回ぶん回す */
function simulate(n: number, rate: number, agg: number, txops = 4000) {
  let seed = 12345
  const rand = (k: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed % (k + 1)
  }
  const cw = Array.from({ length: n }, () => CW_MIN)
  let bo = cw.map((c) => rand(c))
  const air: Airtime = { wait: 0, preamble: 0, data: 0, ack: 0, collision: 0 }
  const events: Ev[] = []
  const payload = (agg * MPDU_BYTES * 8) / rate
  let t = 0
  let bytes = 0
  for (let k = 0; k < txops; k++) {
    const m = Math.min(...bo)
    const winners = bo.flatMap((b, i) => (b === m ? [i] : []))
    if (events.length < 12) events.push({ t, backoff: [...bo], winners, dur: AIFS + m * SLOT })
    air.wait += AIFS + m * SLOT
    t += AIFS + m * SLOT
    bo = bo.map((b) => b - m)
    const dur = PREAMBLE + payload + SIFS + BLOCK_ACK
    if (winners.length === 1) {
      const w = winners[0]!
      air.preamble += PREAMBLE
      air.data += payload
      air.ack += SIFS + BLOCK_ACK
      bytes += agg * MPDU_BYTES
      cw[w] = CW_MIN
      bo[w] = rand(cw[w]!)
    } else {
      air.collision += dur
      for (const w of winners) {
        cw[w] = Math.min(2 * (cw[w]! + 1) - 1, CW_MAX)
        bo[w] = rand(cw[w]!)
      }
    }
    t += dur
  }
  return { goodput: (bytes * 8) / t, air, total: t, events }
}

const PARTS: { key: keyof Airtime; label: string; color: string }[] = [
  { key: 'data', label: 'データ', color: 'var(--ok)' },
  { key: 'wait', label: 'AIFS と待ち', color: 'var(--accent)' },
  { key: 'preamble', label: 'プリアンブル', color: 'var(--warn)' },
  { key: 'ack', label: 'SIFS と Block Ack', color: 'var(--fg-muted)' },
  { key: 'collision', label: '衝突', color: 'var(--danger)' },
]

const PRESETS = [
  { name: '手元の Mac（11ax 80MHz 2SS MCS4）', std: 'ax', bw: 80, nss: 2, mcs: 4, gi: 0.8 },
  { name: 'Wi-Fi 6 の看板の数字', std: 'ax', bw: 160, nss: 2, mcs: 11, gi: 0.8 },
  { name: 'Wi-Fi 7 320MHz 2SS', std: 'be', bw: 320, nss: 2, mcs: 13, gi: 0.8 },
  { name: 'Wi-Fi 4 の 2.4GHz 20MHz', std: 'n', bw: 20, nss: 2, mcs: 7, gi: 0.8 },
]

const selectStyle = { background: 'var(--bg)', color: 'var(--fg)', borderColor: 'var(--border)' }

export default function WifiRateCalc() {
  const [stdId, setStdId] = useState('ax')
  const [bw, setBw] = useState(80)
  const [nss, setNss] = useState(2)
  const [mcs, setMcs] = useState(4)
  const [gi, setGi] = useState(0.8)
  const [agg, setAgg] = useState(64)
  const [stations, setStations] = useState(1)
  const [ev, setEv] = useState(0)

  const std = STDS.find((s) => s.id === stdId)!
  const bws = Object.keys(std.nsd).map(Number)
  const bwOk = bws.includes(bw) ? bw : bws[bws.length - 1]!
  const mcsOk = Math.min(mcs, std.maxMcs)
  const nssOk = Math.min(nss, std.maxNss)
  const giOk = std.gis.includes(gi) ? gi : std.gis[0]!
  const rate = phyRate(std, bwOk, mcsOk, nssOk, giOk)
  const sim = useMemo(() => simulate(stations, rate, agg), [stations, rate, agg])
  const evOk = Math.min(ev, sim.events.length - 1)
  const e = sim.events[evOk]!

  const apply = (p: (typeof PRESETS)[number]) => {
    setStdId(p.std)
    setBw(p.bw)
    setNss(p.nss)
    setMcs(p.mcs)
    setGi(p.gi)
  }

  const maxBar = Math.max(rate, 1)
  return (
    <VizShell
      title="Wi-Fi の速度：規格上の値から、空中で失う時間まで"
      subtitle="PHY レート = データ用サブキャリア数 × ビット数 × 符号化率 × ストリーム数 ÷ シンボル長。その下で、CSMA/CA の待ちとヘッダと衝突が時間を食う"
      controls={
        <>
          <label className="flex items-center gap-2">
            <span style={{ color: 'var(--fg-muted)' }}>例</span>
            <select
              className="rounded border px-1 py-0.5"
              style={selectStyle}
              onChange={(x) => apply(PRESETS[Number(x.target.value)]!)}
              defaultValue={0}
            >
              {PRESETS.map((p, i) => (
                <option key={p.name} value={i}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span style={{ color: 'var(--fg-muted)' }}>規格</span>
            <select className="rounded border px-1 py-0.5" style={selectStyle} value={stdId} onChange={(x) => setStdId(x.target.value)}>
              {STDS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span style={{ color: 'var(--fg-muted)' }}>帯域幅</span>
            <select className="rounded border px-1 py-0.5" style={selectStyle} value={bwOk} onChange={(x) => setBw(Number(x.target.value))}>
              {bws.map((b) => (
                <option key={b} value={b}>
                  {b} MHz
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span style={{ color: 'var(--fg-muted)' }}>GI</span>
            <select className="rounded border px-1 py-0.5" style={selectStyle} value={giOk} onChange={(x) => setGi(Number(x.target.value))}>
              {std.gis.map((g) => (
                <option key={g} value={g}>
                  {g} µs
                </option>
              ))}
            </select>
          </label>
          <Slider label="ストリーム数" value={nssOk} min={1} max={std.maxNss} step={1} onChange={setNss} format={(v) => String(v)} />
          <Slider
            label="MCS"
            value={mcsOk}
            min={0}
            max={std.maxMcs}
            step={1}
            onChange={setMcs}
            format={(v) => String(v)}
          />
          <Slider label="1 回に束ねる数" value={agg} min={1} max={64} step={1} onChange={setAgg} format={(v) => String(v)} />
          <Slider
            label="同じチャネルの送信者"
            value={stations}
            min={1}
            max={20}
            step={1}
            onChange={(v) => {
              setStations(v)
              setEv(0)
            }}
            format={(v) => `${v} 台`}
          />
        </>
      }
      readout={
        <>
          <div>
            PHY: {std.nsd[bwOk]} × {MCS[mcsOk]![0]} ビット × {MCS[mcsOk]![1].toFixed(3)}（{MCS[mcsOk]![2]}）× {nssOk} ÷ ({std.symbol} + {giOk}) µs ={' '}
            <span style={{ color: 'var(--fg)' }}>{rate.toFixed(1)} Mbps</span>
          </div>
          <div>
            空中の時間の内訳から見た合計の実効値:{' '}
            <span style={{ color: 'var(--ok)' }}>
              {sim.goodput.toFixed(1)} Mbps（PHY の {((sim.goodput / rate) * 100).toFixed(1)}%）
            </span>
            。{stations > 1 ? `これを ${stations} 台で分け合う（1 台あたり約 ${(sim.goodput / stations).toFixed(1)} Mbps）` : '送信者は 1 台だけ'}
          </div>
          <div>
            MPDU は {MPDU_BYTES} バイト（MAC ヘッダ込み）。TCP の ACK、再送、他のネットワーク、電波の弱さは含まない
          </div>
        </>
      }
    >
      <svg viewBox="0 0 640 220" width="100%" style={{ minWidth: 520, maxWidth: 760 }} role="img" aria-label="PHY レートと実効スループットの比較">
        <text x={0} y={18} fontSize={12} fill="var(--fg-muted)">
          PHY レート
        </text>
        <rect x={120} y={6} width={(rate / maxBar) * 500} height={18} rx={3} fill="var(--accent)" opacity={0.35} />
        <text x={126} y={19} fontSize={12} fill="var(--fg)">
          {rate.toFixed(0)} Mbps
        </text>

        <text x={0} y={54} fontSize={12} fill="var(--fg-muted)">
          空中の時間
        </text>
        {(() => {
          let x = 120
          return PARTS.map((p) => {
            const w = (sim.air[p.key] / sim.total) * 500
            const r = (
              <rect key={p.key} x={x} y={42} width={Math.max(w, 0)} height={18} fill={p.color} opacity={p.key === 'data' ? 0.9 : 0.6} />
            )
            x += w
            return r
          })
        })()}
        {PARTS.map((p, i) => (
          <g key={p.key} transform={`translate(${120 + (i % 3) * 170}, ${76 + Math.floor(i / 3) * 16})`}>
            <rect width={10} height={10} fill={p.color} opacity={0.8} />
            <text x={14} y={9} fontSize={11} fill="var(--fg-muted)">
              {p.label} {((sim.air[p.key] / sim.total) * 100).toFixed(1)}%
            </text>
          </g>
        ))}

        <text x={0} y={128} fontSize={12} fill="var(--fg-muted)">
          実効
        </text>
        <rect x={120} y={116} width={(sim.goodput / maxBar) * 500} height={18} rx={3} fill="var(--ok)" opacity={0.8} />
        <text x={126} y={129} fontSize={12} fill="var(--bg)">
          {sim.goodput.toFixed(0)} Mbps
        </text>

        <text x={0} y={164} fontSize={12} fill="var(--fg-muted)">
          待ちの数え下げ
        </text>
        <text x={120} y={164} fontSize={11} fill="var(--fg-muted)">
          {evOk + 1} 回目の取り合い: 各台の残りスロット
        </text>
        {e.backoff.slice(0, 10).map((b, i) => {
          const win = e.winners.includes(i)
          return (
            <g key={i} transform={`translate(${120 + i * 50}, 172)`}>
              <rect
                width={44}
                height={24}
                rx={4}
                fill={win ? (e.winners.length > 1 ? 'var(--danger)' : 'var(--ok)') : 'var(--bg)'}
                opacity={win ? 0.75 : 1}
                stroke="var(--border)"
              />
              <text x={22} y={16} fontSize={11} textAnchor="middle" fill={win ? 'var(--bg)' : 'var(--fg)'}>
                {i + 1}: {b}
              </text>
            </g>
          )
        })}
        <text x={120} y={214} fontSize={11} fill="var(--fg-muted)">
          {e.winners.length > 1
            ? `${e.winners.map((w) => w + 1).join(' と ')} 台目が同時に 0 になり衝突。両方とも待ちの上限を倍にして引き直す`
            : `${e.winners[0]! + 1} 台目の数が最小なので先に 0 になり送る。ほかの台は減った分だけ数を残して次を待つ`}
          {stations > 10 ? '（11 台目以降は省略）' : ''}
        </text>
      </svg>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <button
          type="button"
          className="rounded border px-2 py-0.5"
          style={{ borderColor: 'var(--border)', color: 'var(--fg)' }}
          onClick={() => setEv(Math.max(0, evOk - 1))}
        >
          ← 前の取り合い
        </button>
        <button
          type="button"
          className="rounded border px-2 py-0.5"
          style={{ borderColor: 'var(--border)', color: 'var(--fg)' }}
          onClick={() => setEv(Math.min(sim.events.length - 1, evOk + 1))}
        >
          次の取り合い →
        </button>
        <span style={{ color: 'var(--fg-muted)' }}>送信者を 2 台以上にすると、待ちの数え下げと衝突が見える</span>
      </div>
    </VizShell>
  )
}
