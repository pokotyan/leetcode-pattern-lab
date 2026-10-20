import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { LegendItem } from '../views/Legend'
import type { Frame } from '../core/types'

const CODE = `# 下り: OLT は全員に同じ光を送る。読めるのは宛先の ONU だけ
for frame in downstream:
    for onu in splitter.outputs:          # スプリッタは光を分けるだけ
        if frame.dest == onu.id:
            onu.deliver(decrypt(frame, onu.key))
        else:
            onu.drop(frame)               # 鍵が違うので中身は読めない

# 上り: 125 µs ごとに、OLT が送ってよい時間を配る
while True:
    reports = {onu.id: onu.queued for onu in onus}    # 前の周期の申告
    talkers = [i for i, q in reports.items() if q > 0]
    payload = CYCLE_BITS - OVERHEAD_BITS * len(talkers)
    grants = fair_share(reports, payload)             # 少ない申告から満たす
    for i in talkers:
        onus[i].send_burst(grants[i])                 # 割り当てた時間だけ光る
    sleep(125e-6)`

// GPON の上り 1 244.16 Mbit/s と 125 µs 周期（G.984.2 / G.984.3）
const LINE_MBPS = 1244.16
const CYCLE_US = 125
const CYCLE_BITS = LINE_MBPS * CYCLE_US
// 1 244.16 Mbit/s の上りバーストの物理層の前置きの合計（G.984.2 付録 I。内訳の例はガード 32 + プリアンブル 44 + デリミタ 20）
const OVERHEAD_BITS = 96
const DRAWN = 8

type Input = {
  split: number
  /** 下りで流すフレームの宛先（ONU の番号） */
  down: number[]
  /** 各 ONU が上りで送りたい速さ（Mbit/s）。split 個ぶん */
  wantMbps: number[]
}

type Mark = 'idle' | 'deliver' | 'drop' | 'talk'
type Slot = { onu: number; bits: number; overhead: number }
type View = {
  split: number
  phase: 'down' | 'up'
  frameDest: number | null
  marks: Mark[]
  slots: Slot[]
  rates: (number | null)[]
}

function fairShare(demands: number[], capacity: number): number[] {
  const grant = demands.map(() => 0)
  let left = capacity
  let pending = demands.map((d, i) => (d > 0 ? i : -1)).filter((i) => i >= 0)
  while (pending.length > 0 && left > 1e-9) {
    const share = left / pending.length
    for (const i of pending) {
      const g = Math.min(share, demands[i]! - grant[i]!)
      grant[i]! += g
      left -= g
    }
    pending = pending.filter((i) => demands[i]! - grant[i]! > 1e-9)
  }
  return grant
}

const label = (i: number) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : '')

function trace({ split, down, wantMbps }: Input): Frame<View>[] {
  const frames: Frame<View>[] = []
  const idle = (): Mark[] => Array.from({ length: split }, () => 'idle')
  const base = { split, slots: [] as Slot[], rates: Array.from({ length: split }, () => null) as (number | null)[] }

  frames.push({
    line: [1, 2],
    note: `局側の OLT から 1 本の光ファイバが出て、光スプリッタで ${split} 本に分かれる。スプリッタは電源を持たず、光の強さを分けるだけ`,
    vars: { 分岐数: split, 上りの公称速度: `${LINE_MBPS} Mbit/s` },
    view: { ...base, phase: 'down', frameDest: null, marks: idle() },
  })

  for (const dest of down) {
    const marks = idle().map((_, i): Mark => (i === dest ? 'deliver' : 'drop'))
    frames.push({
      line: [3, 4, 5, 6, 7],
      note: `下りのフレームは ONU ${label(dest)} 宛て。スプリッタの先の ${split} 台すべてに同じ光が届くが、${label(dest)} 以外は宛先が違うので捨てる。中身は ONU ごとの鍵で暗号化されているので、捨てる側は読めない`,
      vars: { 宛先: `ONU ${label(dest)}`, 届いた台数: split, 読めた台数: 1 },
      view: { ...base, phase: 'down', frameDest: dest, marks },
    })
  }

  const demands = wantMbps.map((m) => m * CYCLE_US)
  const talkers = demands.map((d, i) => (d > 0 ? i : -1)).filter((i) => i >= 0)
  const reportMarks = idle().map((_, i): Mark => (demands[i]! > 0 ? 'talk' : 'idle'))
  frames.push({
    line: [10, 11, 12],
    note: `上りは全員が同じ 1 本に光を入れるので、同時に光るとぶつかる。OLT は 125 µs ごとに各 ONU の「待っている量」の申告を集める。送りたいのは ${talkers.length} 台`,
    vars: { 申告した台数: talkers.length, '1 周期のビット数': Math.round(CYCLE_BITS) },
    view: { ...base, phase: 'up', frameDest: null, marks: reportMarks },
  })

  const payload = Math.max(CYCLE_BITS - OVERHEAD_BITS * talkers.length, 0)
  frames.push({
    line: 13,
    note: `送る ONU が替わるたびに、光の立ち上がりを待つガードタイムと、受信側が同期をとるためのプリアンブルが要る。1 回 ${OVERHEAD_BITS} ビット × ${talkers.length} 台で、データに使えるのは ${Math.round(payload)} ビット（${((payload / CYCLE_BITS) * 100).toFixed(1)}%）`,
    vars: { 前置きの合計: OVERHEAD_BITS * talkers.length, データに使える: Math.round(payload) },
    view: { ...base, phase: 'up', frameDest: null, marks: reportMarks },
  })

  const grants = fairShare(demands, payload)
  const slots: Slot[] = talkers.map((i) => ({ onu: i, bits: grants[i]!, overhead: OVERHEAD_BITS }))
  const rates = grants.map((g, i) => (demands[i]! > 0 ? g / CYCLE_US : null))
  frames.push({
    line: [14, 15, 16],
    note: `少ない申告から先に満たし、残りを均等に分ける（max-min 公平）。各 ONU は割り当てられた時間だけ光る。125 µs ごとに繰り返すので、1 宅の速さは「1 周期の割り当て ÷ 125 µs」`,
    vars: Object.fromEntries(
      talkers.slice(0, 6).map((i) => [`ONU ${label(i)}`, `${(grants[i]! / CYCLE_US).toFixed(1)} Mbit/s（希望 ${wantMbps[i]}）`]),
    ),
    view: { ...base, phase: 'up', frameDest: null, marks: reportMarks, slots, rates },
  })

  const total = grants.reduce((a, b) => a + b, 0) / CYCLE_US
  const cut = talkers.filter((i) => grants[i]! < demands[i]! - 1e-6)
  const cutRate = cut.length > 0 ? grants[cut[0]!]! / CYCLE_US : 0
  frames.push({
    line: 17,
    note:
      cut.length === 0
        ? `合計 ${total.toFixed(1)} Mbit/s。${talkers.length} 台とも希望どおりに通った。空いていれば、分岐数が多くても 1 宅で上限近くまで使える`
        : `合計 ${total.toFixed(1)} Mbit/s を ${talkers.length} 台で分けた。希望どおり通ったのは ${talkers.length - cut.length} 台、削られた ${cut.length} 台はそれぞれ ${cutRate.toFixed(1)} Mbit/s。「最大 1 Gbit/s」は、この共有された 1 本の上限のこと`,
    vars: { 合計: `${total.toFixed(1)} Mbit/s`, 削られた台数: cut.length },
    view: { ...base, phase: 'up', frameDest: null, marks: reportMarks, slots, rates },
    done: true,
  })
  return frames
}

const fill = (n: number, wants: Record<number, number>) => Array.from({ length: n }, (_, i) => wants[i] ?? 0)

const PRESETS: { name: string; value: Input }[] = [
  { name: '8 分岐・2 宅が上り', value: { split: 8, down: [0, 3], wantMbps: fill(8, { 0: 1000, 3: 50 }) } },
  { name: '8 分岐・全宅が全力', value: { split: 8, down: [2], wantMbps: fill(8, Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i, 1000]))) } },
  {
    name: '32 分岐・16 宅が全力',
    value: { split: 32, down: [5], wantMbps: fill(32, Object.fromEntries(Array.from({ length: 16 }, (_, i) => [i * 2, 1000]))) },
  },
  {
    name: '32 分岐・混在',
    value: { split: 32, down: [1], wantMbps: fill(32, { 0: 1000, 1: 1000, 2: 20, 3: 5, 4: 300, 9: 1000, 20: 80 }) },
  },
]

const MARK_STYLE: Record<Mark, { stroke: string; fill: string; text: string }> = {
  idle: { stroke: 'var(--border)', fill: 'var(--bg-soft)', text: 'var(--fg-muted)' },
  deliver: { stroke: 'var(--ok)', fill: 'var(--ok-soft)', text: 'var(--ok)' },
  drop: { stroke: 'var(--border)', fill: 'var(--bg-soft)', text: 'var(--fg-muted)' },
  talk: { stroke: 'var(--accent)', fill: 'var(--accent-soft)', text: 'var(--accent)' },
}

function Topology({ v }: { v: View }) {
  const w = 560
  const shown = Math.min(v.split, DRAWN)
  const rowH = 30
  const h = shown * rowH + 20
  const sx = 230
  const ox = 400
  const y = (i: number) => 18 + i * rowH
  const mid = h / 2
  const lit = v.phase === 'down' && v.frameDest !== null
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="OLT から光スプリッタを経て ONU へ">
      <rect x={10} y={mid - 18} width={70} height={36} rx={6} fill="var(--bg-soft)" stroke="var(--fg-muted)" />
      <text x={45} y={mid + 4} textAnchor="middle" fontSize="12" fill="var(--fg)">OLT</text>
      <line x1={80} y1={mid} x2={sx - 14} y2={mid} stroke={lit ? 'var(--warn)' : 'var(--fg-muted)'} strokeWidth={lit ? 3 : 2} />
      <polygon points={`${sx - 14},${mid - 12} ${sx + 6},${mid} ${sx - 14},${mid + 12}`} fill="var(--bg-soft)" stroke="var(--fg-muted)" />
      <text x={sx - 4} y={mid + 26} textAnchor="middle" fontSize="10" fill="var(--fg-muted)">1:{v.split}</text>
      {Array.from({ length: shown }, (_, i) => {
        const isRest = v.split > DRAWN && i === shown - 1
        const m = isRest ? 'idle' : v.marks[i]!
        const st = MARK_STYLE[m]
        const rate = isRest ? null : v.rates[i]
        return (
          <g key={i}>
            <line x1={sx + 6} y1={mid} x2={ox} y2={y(i) + 10} stroke={lit ? 'var(--warn)' : 'var(--border)'} strokeWidth={lit ? 1.5 : 1} />
            <rect x={ox} y={y(i)} width={56} height={20} rx={4} fill={st.fill} stroke={st.stroke} />
            <text x={ox + 28} y={y(i) + 14} textAnchor="middle" fontSize="11" fill={st.text}>
              {isRest ? `他 ${v.split - DRAWN + 1}` : `ONU ${label(i)}`}
            </text>
            <text x={ox + 64} y={y(i) + 14} fontSize="10" fill={st.text}>
              {m === 'deliver' ? '復号して受け取る' : m === 'drop' ? '捨てる' : rate != null ? `${rate.toFixed(1)} Mbit/s` : m === 'talk' ? '送りたい' : ''}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function CycleBar({ v }: { v: View }) {
  if (v.slots.length === 0) return null
  const w = 560
  const scale = (w - 20) / CYCLE_BITS
  let x = 10
  return (
    <svg viewBox={`0 0 ${w} 46`} className="w-full" role="img" aria-label="125 µs の上りの割り当て">
      <rect x={10} y={8} width={w - 20} height={20} fill="none" stroke="var(--border)" />
      {v.slots.map((s) => {
        const gx = x
        const gw = s.overhead * scale
        const dx = gx + gw
        const dw = s.bits * scale
        x = dx + dw
        return (
          <g key={s.onu}>
            <rect x={gx} y={8} width={gw} height={20} fill="var(--danger-soft)" />
            <rect x={dx} y={8} width={dw} height={20} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth={0.5} />
            {dw > 18 && (
              <text x={dx + dw / 2} y={22} textAnchor="middle" fontSize="10" fill="var(--accent)">
                {label(s.onu)}
              </text>
            )}
          </g>
        )
      })}
      <text x={10} y={42} fontSize="10" fill="var(--fg-muted)">0 µs</text>
      <text x={w - 10} y={42} textAnchor="end" fontSize="10" fill="var(--fg-muted)">125 µs</text>
    </svg>
  )
}

export default function PonSplit() {
  const [input, setInput] = useState<Input>(PRESETS[0]!.value)
  const frames = useMemo(() => trace(input), [input])

  return (
    <SimShell
      title="PON：下りは全員に配り、上りは時間で分ける"
      subtitle="1 本の光を分岐して共有する。下りは宛先だけが復号し、上りは OLT が 125 µs ごとに送る時間を配る"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="条件" presets={PRESETS} onPick={setInput} />}
      legend={
        <>
          <LegendItem state="good">宛先（復号する）</LegendItem>
          <LegendItem state="active">上りで送りたい</LegendItem>
          <LegendItem state="bad">前置き（ガード・プリアンブル）</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-2">
          <Topology v={f.view} />
          <CycleBar v={f.view} />
        </div>
      )}
    </SimShell>
  )
}
