import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import type { Frame } from '../core/types'

const CODE = `MAX_PER_ORIGIN = 6     # HTTP/1.1 だけの上限

def pick_connection(req, conns, h2):
    if h2:
        return conns[0]     # 1 本に多重化
    idle = [c for c in conns if c.idle]
    if idle:
        return idle[0]      # 使い回す
    if len(conns) < MAX_PER_ORIGIN:
        c = open_connection()   # 新しく張る
        conns.append(c)
        return c
    return None             # Stalled

def fetch(req, conn):
    conn.send(req)          # 送る
    conn.wait_first_byte()  # TTFB
    conn.read_body()        # Download
    conn.idle = True        # 空いた`

const MAX_PER_ORIGIN = 6

type Phase = 'stall' | 'connect' | 'ssl' | 'ttfb' | 'download'
type Seg = { phase: Phase; from: number; to: number }
type Req = { name: string; conn: number; segs: Seg[]; end: number }
type Case = { h2: boolean; n: number; rtt: number; server: number; download: number }
type View = { reqs: Req[]; now: number; total: number }

const PHASE_STYLE: Record<Phase, { bg: string; border: string; label: string }> = {
  stall: { bg: 'var(--bg)', border: 'var(--fg-muted)', label: 'Stalled（接続待ち）' },
  connect: { bg: 'var(--warn-soft)', border: 'var(--warn)', label: 'Initial connection' },
  ssl: { bg: 'var(--danger-soft)', border: 'var(--danger)', label: 'SSL' },
  ttfb: { bg: 'var(--ok)', border: 'var(--ok)', label: 'Waiting (TTFB)' },
  download: { bg: 'var(--accent)', border: 'var(--accent)', label: 'Content Download' },
}

/** HTML を取った接続が 1 本だけ温まっている状態から、n 個の画像を同時に見つけたとして並べる */
function plan({ h2, n, rtt, server, download }: Case): Req[] {
  const conns: { freeAt: number }[] = [{ freeAt: 0 }]
  const reqs: Req[] = []
  for (let i = 0; i < n; i++) {
    const segs: Seg[] = []
    let conn = 0
    let sendAt = 0
    if (!h2) {
      const earliest = conns.reduce((best, c, k) => (c.freeAt < conns[best]!.freeAt ? k : best), 0)
      if (conns[earliest]!.freeAt > 0 && conns.length < MAX_PER_ORIGIN) {
        conn = conns.length
        conns.push({ freeAt: 2 * rtt })
        segs.push({ phase: 'connect', from: 0, to: rtt }, { phase: 'ssl', from: rtt, to: 2 * rtt })
        sendAt = 2 * rtt
      } else {
        conn = earliest
        sendAt = conns[earliest]!.freeAt
        if (sendAt > 0) segs.push({ phase: 'stall', from: 0, to: sendAt })
      }
    }
    const firstByte = sendAt + rtt + server
    const end = firstByte + download
    segs.push({ phase: 'ttfb', from: sendAt, to: firstByte }, { phase: 'download', from: firstByte, to: end })
    if (!h2) conns[conn]!.freeAt = end
    reqs.push({ name: `img/${i}`, conn, segs, end })
  }
  return reqs
}

function trace(c: Case): Frame<View>[] {
  const reqs = plan(c)
  const total = Math.max(...reqs.map((r) => r.end))
  const times = [...new Set(reqs.flatMap((r) => r.segs.flatMap((s) => [s.from, s.to])))].sort((a, b) => a - b)
  const conns = new Set(reqs.map((r) => r.conn)).size
  const frames: Frame<View>[] = []

  for (const t of times) {
    const starting = reqs.flatMap((r) => r.segs.filter((s) => s.from === t).map((s) => ({ r, s })))
    const finished = reqs.filter((r) => r.end === t)
    const parts: string[] = []
    const lines = new Set<number>()
    const byPhase = (p: Phase) => starting.filter((x) => x.s.phase === p).map((x) => x.r.name)
    const list = (xs: string[]) => (xs.length > 3 ? `${xs[0]} など ${xs.length} 件` : xs.join('、'))

    if (byPhase('connect').length) {
      parts.push(`${list(byPhase('connect'))} は空いた接続がないので、新しい接続を張る（TCP で 1 往復、TLS で 1 往復）`)
      ;[9, 10, 11, 12].forEach((l) => lines.add(l))
    }
    if (byPhase('stall').length) {
      parts.push(`${list(byPhase('stall'))} は接続が ${MAX_PER_ORIGIN} 本に達しているので、どれかが空くまで待つ`)
      lines.add(13)
    }
    if (byPhase('ttfb').length) {
      parts.push(`${list(byPhase('ttfb'))} の要求を送り、最初のバイトを待つ`)
      ;[16, 17].forEach((l) => lines.add(l))
      if (c.h2) lines.add(5)
    }
    if (byPhase('download').length) {
      parts.push(`${list(byPhase('download'))} の本文を受け取り始める`)
      lines.add(18)
    }
    if (finished.length) {
      parts.push(`${list(finished.map((r) => r.name))} が届き、接続が空く`)
      lines.add(19)
    }
    frames.push({
      line: lines.size ? [...lines] : 1,
      note: `t = ${t}ms: ${parts.join('。')}`.replace(/件 (は|の|が)/g, '件$1'),
      vars: {
        HTTP: c.h2 ? '2' : '1.1',
        往復: `${c.rtt}ms`,
        接続の数: c.h2 ? 1 : new Set(reqs.filter((r) => r.segs[0]!.from <= t).map((r) => r.conn)).size,
        届いた数: `${reqs.filter((r) => r.end <= t).length} / ${reqs.length}`,
      },
      view: { reqs, now: t, total },
      done: t === total,
    })
  }
  frames[frames.length - 1]!.note += `。すべて届くまで ${total}ms、使った接続は ${conns} 本`
  return frames
}

const CASES: { name: string; value: Case }[] = [
  { name: 'HTTP/1.1・画像 12 枚', value: { h2: false, n: 12, rtt: 50, server: 300, download: 40 } },
  { name: 'HTTP/2・画像 12 枚', value: { h2: true, n: 12, rtt: 50, server: 300, download: 40 } },
  { name: 'HTTP/1.1・画像 6 枚', value: { h2: false, n: 6, rtt: 50, server: 300, download: 40 } },
  { name: 'HTTP/1.1・遠いサーバ（往復 150ms）', value: { h2: false, n: 12, rtt: 150, server: 100, download: 40 } },
  { name: 'HTTP/2・遠いサーバ（往復 150ms）', value: { h2: true, n: 12, rtt: 150, server: 100, download: 40 } },
]

const W = 260
const ROW = 18

export default function NetworkWaterfall() {
  const [c, setC] = useState<Case>(CASES[0]!.value)
  const frames = useMemo(() => trace(c), [c])
  // 時間軸はプリセットの中で最も長いものに合わせ、切り替えても縮尺が変わらないようにする
  const scaleMax = useMemo(() => Math.max(...CASES.map((x) => Math.max(...plan(x.value).map((r) => r.end)))), [])
  const x = (ms: number) => (ms / scaleMax) * W

  return (
    <SimShell
      title="ウォーターフォールができるまで"
      subtitle="HTML を取った接続が 1 本ある状態で、画像を同時に見つけたとき、各要求の帯がどの区間で伸びるか。帯域は十分にある前提"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="条件" presets={CASES} onPick={setC} />}
      legend={
        <span className="flex flex-wrap gap-3">
          {(Object.keys(PHASE_STYLE) as Phase[]).map((p) => (
            <span key={p} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-4 rounded-sm border"
                style={{ background: PHASE_STYLE[p].bg, borderColor: PHASE_STYLE[p].border }}
              />
              {PHASE_STYLE[p].label}
            </span>
          ))}
        </span>
      }
    >
      {(f) => (
        <div className="overflow-x-auto">
          <svg
            width={W + 110}
            height={f.view.reqs.length * ROW + 28}
            className="font-mono"
            style={{ fontSize: 10, display: 'block' }}
          >
            {Array.from({ length: Math.floor(scaleMax / 200) + 1 }, (_, i) => (
              <g key={i}>
                <line x1={90 + x(i * 200)} x2={90 + x(i * 200)} y1={0} y2={f.view.reqs.length * ROW + 4} stroke="var(--border)" />
                <text x={90 + x(i * 200)} y={f.view.reqs.length * ROW + 18} textAnchor="middle" fill="var(--fg-muted)">
                  {i * 200}
                </text>
              </g>
            ))}
            {f.view.reqs.map((r, i) => (
              <g key={r.name} transform={`translate(0, ${i * ROW + 2})`}>
                <text x={0} y={11} fill="var(--fg-muted)">
                  {r.name}
                </text>
                <text x={56} y={11} fill="var(--fg-muted)">
                  #{r.conn}
                </text>
                {r.segs
                  .filter((s) => s.from < f.view.now || (s.from === 0 && f.view.now === 0))
                  .map((s) => {
                    const to = Math.min(s.to, f.view.now)
                    const st = PHASE_STYLE[s.phase]
                    return (
                      <rect
                        key={s.phase}
                        x={90 + x(s.from)}
                        y={2}
                        width={Math.max(1, x(to) - x(s.from))}
                        height={ROW - 6}
                        rx={2}
                        fill={st.bg}
                        stroke={st.border}
                        strokeDasharray={s.phase === 'stall' ? '3 2' : undefined}
                      />
                    )
                  })}
              </g>
            ))}
            <line
              x1={90 + x(f.view.now)}
              x2={90 + x(f.view.now)}
              y1={0}
              y2={f.view.reqs.length * ROW + 4}
              stroke="var(--danger)"
            />
          </svg>
          <p className="m-0 mt-1 text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            # は使った接続の番号で、#0 は HTML を取った接続。目盛りの単位は ms
          </p>
        </div>
      )}
    </SimShell>
  )
}
