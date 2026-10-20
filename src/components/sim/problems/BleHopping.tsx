import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import type { Frame } from '../core/types'

const CODE = `def prn_e(counter, ch_id):
    u = counter ^ ch_id
    for _ in range(3):
        u = mam(perm(u), ch_id)
    return u ^ ch_id

def channel(counter, ch_id, used):
    p = prn_e(counter, ch_id)
    unmapped = p % 37
    if unmapped in used:
        return unmapped
    table = sorted(used)
    return table[len(used) * p >> 16]

def advertise():
    for idx in (37, 38, 39):
        send(ADV_IND, idx)
    sleep(adv_interval + random(0, 10))`

// Core 6.1 Vol 6 Part C 3 章のサンプルと同じ Access Address 0x8E89BED6 から求めた値
const CH_ID = 0x305f

const WIFI = [
  { ch: 1, center: 2412 },
  { ch: 6, center: 2437 },
  { ch: 11, center: 2462 },
]

function freqOf(idx: number): number {
  if (idx === 37) return 2402
  if (idx === 38) return 2426
  if (idx === 39) return 2480
  return idx <= 10 ? 2404 + 2 * idx : 2428 + 2 * (idx - 11)
}

/** BLE は 2 MHz 幅、Wi-Fi は 20 MHz 幅として重なりを判定する */
function overlapsWifi(idx: number, wifiCh: number): boolean {
  const f = freqOf(idx)
  const c = WIFI.find((w) => w.ch === wifiCh)!.center
  return f + 1 > c - 10 && f - 1 < c + 10
}

function perm(x: number): number {
  const rev = (b: number) => {
    let r = 0
    for (let i = 0; i < 8; i++) r |= ((b >> i) & 1) << (7 - i)
    return r
  }
  return (rev(x >> 8) << 8) | rev(x & 0xff)
}

const mam = (a: number, b: number) => (17 * a + b) & 0xffff

function prnE(counter: number): number {
  let u = counter ^ CH_ID
  for (let i = 0; i < 3; i++) u = mam(perm(u), CH_ID)
  return u ^ CH_ID
}

type Mode = 'adv' | 'conn'
type Case = { mode: Mode; busyWifi: number[]; events: number }
type Hit = { idx: number; remapped: boolean }
type View = { busyWifi: number[]; used: number[]; current: Hit | null; history: Hit[]; mode: Mode }

function trace({ mode, busyWifi, events }: Case): Frame<View>[] {
  const used = Array.from({ length: 37 }, (_, i) => i).filter((i) => !busyWifi.some((w) => overlapsWifi(i, w)))
  const frames: Frame<View>[] = []
  const history: Hit[] = []
  const push = (line: number | number[], note: string, current: Hit | null, vars: Frame<View>['vars'], done = false) =>
    frames.push({ line, note, vars, view: { busyWifi, used, current, history: [...history], mode }, done })

  if (mode === 'adv') {
    push(15, '広告する側は、3 本の広告用チャネルに同じ PDU を順に送る。どれか 1 本を聞いている相手に届けばよい', null, {
      advInterval: '100 ms',
    })
    for (let e = 0; e < events; e++) {
      for (const idx of [37, 38, 39]) {
        const hit = { idx, remapped: false }
        history.push(hit)
        push([16, 17], `広告イベント ${e + 1}: チャネル ${idx}（${freqOf(idx)} MHz）に ADV_IND を送る`, hit, {
          イベント: e + 1,
          チャネル: idx,
          周波数: `${freqOf(idx)} MHz`,
        })
      }
      push(18, `次のイベントまで advInterval に 0〜10 ms の乱数を足して待つ。ほかの広告と毎回ぶつかり続けないようにずらす`, null, {
        イベント: e + 1,
      })
    }
    push(18, '広告は 3 本だけを使う。接続した後は、残りの 37 本の汎用チャネルを飛び回る', null, {}, true)
    return frames
  }

  push(7, `汎用チャネル 37 本のうち、${busyWifi.length ? `Wi-Fi ${busyWifi.join('・')} と重なるものを外した ` : ''}${used.length} 本を使う`, null, {
    使用チャネル数: used.length,
    channelIdentifier: '0x305F',
  })
  for (let counter = 0; counter < events; counter++) {
    const p = prnE(counter)
    const unmapped = p % 37
    const inUse = used.includes(unmapped)
    const idx = inUse ? unmapped : used[(used.length * p) >> 16]!
    const hit = { idx, remapped: !inUse }
    history.push(hit)
    push(
      inUse ? [8, 9, 10, 11] : [8, 9, 12, 13],
      inUse
        ? `イベント ${counter}: prn_e = ${p}、37 で割った余り ${unmapped} は使えるチャネルなので、そのまま使う`
        : `イベント ${counter}: prn_e = ${p}、余り ${unmapped} は外したチャネル。${used.length} 本の表の ${(used.length * p) >> 16} 番目、チャネル ${idx} に写す`,
      hit,
      {
        connEventCounter: counter,
        prn_e: p,
        unmappedChannel: unmapped,
        使うチャネル: idx,
        周波数: `${freqOf(idx)} MHz`,
      },
    )
  }
  const remapped = history.filter((h) => h.remapped).length
  push(
    13,
    busyWifi.length
      ? `${events} イベントのうち ${remapped} 回は、外したチャネルを引いて写し直した。どのイベントも Wi-Fi と重ならない ${used.length} 本の中に収まる`
      : `37 本すべてを使うので写し直しは起きない。並びは乱数のように見えるが、カウンタとアクセスアドレスから決まるので、両端は同じ順に飛べる`,
    null,
    {},
    true,
  )
  return frames
}

const CASES: { name: string; value: Case }[] = [
  { name: '広告（37・38・39）', value: { mode: 'adv', busyWifi: [], events: 3 } },
  { name: '接続: 37 本すべて', value: { mode: 'conn', busyWifi: [], events: 12 } },
  { name: '接続: Wi-Fi 1 を避ける', value: { mode: 'conn', busyWifi: [1], events: 12 } },
  { name: '接続: Wi-Fi 1・6・11 を避ける', value: { mode: 'conn', busyWifi: [1, 6, 11], events: 12 } },
]

const W = 640
const X0 = 24
const X1 = W - 16
const x = (mhz: number) => X0 + ((mhz - 2400) / 84) * (X1 - X0)

function Spectrum({ v }: { v: View }) {
  const rows = v.history.slice(-12)
  const height = 112 + rows.length * 12
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ minWidth: 520 }} role="img" aria-label="2.4 GHz 帯のチャネルと選ばれたチャネルの履歴">
      {WIFI.map((w) => {
        const busy = v.busyWifi.includes(w.ch)
        return (
          <g key={w.ch}>
            <rect
              x={x(w.center - 10)}
              y={8}
              width={x(w.center + 10) - x(w.center - 10)}
              height={30}
              rx={4}
              fill={busy ? 'var(--warn-soft)' : 'none'}
              stroke={busy ? 'var(--warn)' : 'var(--border)'}
              strokeDasharray={busy ? undefined : '4 3'}
            />
            <text x={x(w.center)} y={27} textAnchor="middle" fontSize={11} fill={busy ? 'var(--warn)' : 'var(--fg-muted)'}>
              Wi-Fi {w.ch}
              {busy ? '（使用中）' : ''}
            </text>
          </g>
        )
      })}
      {Array.from({ length: 40 }, (_, idx) => {
        const f = freqOf(idx)
        const adv = idx >= 37
        const inUse = adv || v.used.includes(idx)
        const isCur = v.current?.idx === idx
        const fill = isCur
          ? 'var(--accent)'
          : adv
            ? v.mode === 'adv'
              ? 'var(--accent-soft)'
              : 'var(--bg)'
            : v.mode === 'conn' && inUse
              ? 'var(--ok-soft)'
              : 'var(--bg)'
        return (
          <g key={idx}>
            <rect
              x={x(f - 1) + 0.5}
              y={48}
              width={x(f + 1) - x(f - 1) - 1}
              height={22}
              fill={fill}
              stroke={adv ? 'var(--accent)' : inUse ? 'var(--ok)' : 'var(--border)'}
              strokeWidth={isCur ? 2 : 1}
            />
            {(adv || idx % 6 === 0 || isCur) && (
              <text x={x(f)} y={84} textAnchor="middle" fontSize={9} fill={isCur ? 'var(--accent)' : 'var(--fg-muted)'}>
                {idx}
              </text>
            )}
          </g>
        )
      })}
      {[2400, 2420, 2440, 2460, 2480].map((m) => (
        <text key={m} x={x(m)} y={100} textAnchor="middle" fontSize={9} fill="var(--fg-muted)">
          {m}
        </text>
      ))}
      {rows.map((h, i) => (
        <g key={i}>
          <line x1={X0} x2={X1} y1={114 + i * 12} y2={114 + i * 12} stroke="var(--border)" strokeWidth={0.5} />
          <circle
            cx={x(freqOf(h.idx))}
            cy={114 + i * 12}
            r={4}
            fill={h.remapped ? 'var(--warn)' : 'var(--accent)'}
            opacity={i === rows.length - 1 ? 1 : 0.55}
          />
        </g>
      ))}
    </svg>
  )
}

export default function BleHopping() {
  const [c, setC] = useState<Case>(CASES[2]!.value)
  const frames = useMemo(() => trace(c), [c])

  return (
    <SimShell
      title="BLE のチャネルの選び方（広告と CSA #2）"
      subtitle="上段は 2.4 GHz 帯の Wi-Fi 1・6・11、中段は BLE の 40 本、下段は選ばれたチャネルの履歴（新しいものが下）"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="場面" presets={CASES} onPick={setC} />}
      legend={
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          <span style={{ color: 'var(--accent)' }}>● そのまま使ったチャネル / 広告用チャネル</span>
          <span style={{ color: 'var(--warn)' }}>● 外したチャネルを引き、写し直したもの</span>
          <span style={{ color: 'var(--ok)' }}>□ 使う汎用チャネル</span>
        </span>
      }
    >
      {(f) => <Spectrum v={f.view} />}
    </SimShell>
  )
}
