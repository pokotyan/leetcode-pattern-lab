import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { LegendItem } from '../views/Legend'
import { cellStyle } from '../views/style'
import type { CellState, Frame } from '../core/types'

type Mode = 'naive' | 'lock' | 'xfetch' | 'xfetchLock'

const CODE: Record<Mode, string> = {
  naive: `def get(key):
    v = cache.get(key)
    if v is not None:
        return v                       # 当たり
    v = db.query()                     # 外れた人は全員 DB へ行く
    cache.set(key, v, ttl=TTL)
    return v`,
  lock: `def get(key):
    while True:
        v = cache.get(key)
        if v is not None:
            return v
        if cache.set(key + ":lock", 1, nx=True, px=1000):
            v = cache.get(key)         # 取るまでに誰かが作り終えたかもしれない
            if v is None:
                v = db.query()
                cache.set(key, v, ttl=TTL)
            cache.delete(key + ":lock")
            return v
        sleep(0.02)                    # ロックが取れなければ、待って読み直す`,
  xfetch: `def get(key, beta=1.0):
    e = cache.get(key)                 # (値, 作り直しにかかった時間 delta, 期限)
    if e and now() - e.delta * beta * log(random()) < e.expiry:
        return e.value
    start = now()
    v = db.query()                     # 期限より少し前に、確率的に作り直す
    delta = now() - start
    cache.set(key, (v, delta, now() + TTL), ttl=TTL)
    return v`,
  xfetchLock: `def get(key, beta=1.0):
    e = cache.get(key)
    if e and now() - e.delta * beta * log(random()) < e.expiry:
        return e.value
    if e and not cache.set(key + ":lock", 1, nx=True, px=1000):
        return e.value                 # 作り直しは 1 人に任せ、まだ有効な値を返す
    if not e:
        return get_with_lock(key)      # 本当に無いときはロックの方式へ
    v = recompute_and_set(key)
    cache.delete(key + ":lock")
    return v`,
}

const TITLE: Record<Mode, string> = {
  naive: '対策なし',
  lock: 'ロック',
  xfetch: '確率的早期再計算（XFetch）',
  xfetchLock: 'XFetch + ロック',
}

// 1 刻み = 100ms。TTL 1.2 秒、作り直し 200ms、1 刻みに 3 件の要求が来る
const TICKS = 20
const TTL = 12
const RECOMPUTE = 2
const PER_TICK = 3
const BETA = 1

type Outcome = 'hit' | 'db' | 'early' | 'wait' | 'served' | 'stale'
type Req = { id: string; outcome: Outcome; note: string }
type View = {
  t: number
  cells: CellState[]
  reqs: Req[]
  inflight: number
  expiry: number | null
}

const OUTCOME_STATE: Record<Outcome, CellState> = {
  hit: 'good',
  served: 'good',
  stale: 'good',
  db: 'bad',
  early: 'window',
  wait: 'dim',
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  hit: '当たり',
  served: '待って受け取る',
  stale: '有効な値を返す',
  db: 'DB へ',
  early: '早めに作り直す',
  wait: '待つ',
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return (s + 1) / 4294967297
  }
}

function trace(mode: Mode): Frame<View>[] {
  const rand = rng(10)
  let expiry: number | null = TTL
  let dbCalls = 0
  let peak = 0
  let lockHeld = false
  let waiting: string[] = []
  let waitedTicks = 0
  const inflight: { owner: string; end: number; withLock: boolean }[] = []
  const history: CellState[] = []
  const frames: Frame<View>[] = []

  for (let t = 0; t < TICKS; t++) {
    const done = inflight.filter((c) => c.end === t)
    const reqs: Req[] = []
    for (const c of done) {
      inflight.splice(inflight.indexOf(c), 1)
      expiry = t + TTL
      if (c.withLock) lockHeld = false
    }
    if (done.length > 0 && waiting.length > 0) {
      for (const w of waiting) reqs.push({ id: w, outcome: 'served', note: '' })
      waiting = []
    }

    const valid = expiry !== null && t < expiry
    for (let k = 0; k < PER_TICK; k++) {
      const id = `${t}${'abc'[k]}`
      const has = expiry !== null && t < expiry
      if (mode === 'naive') {
        if (has) reqs.push({ id, outcome: 'hit', note: '' })
        else {
          inflight.push({ owner: id, end: t + RECOMPUTE, withLock: false })
          dbCalls++
          reqs.push({ id, outcome: 'db', note: '' })
        }
      } else if (mode === 'lock') {
        if (has) reqs.push({ id, outcome: 'hit', note: '' })
        else if (!lockHeld) {
          lockHeld = true
          inflight.push({ owner: id, end: t + RECOMPUTE, withLock: true })
          dbCalls++
          reqs.push({ id, outcome: 'db', note: '' })
        } else {
          waiting.push(id)
          reqs.push({ id, outcome: 'wait', note: '' })
        }
      } else {
        const gap = -RECOMPUTE * BETA * Math.log(rand())
        const early = has && t + gap >= expiry!
        if (has && !early) {
          reqs.push({ id, outcome: 'hit', note: '' })
        } else if (has && early) {
          if (mode === 'xfetchLock' && lockHeld) {
            reqs.push({ id, outcome: 'stale', note: `gap=${gap.toFixed(1)}` })
          } else {
            if (mode === 'xfetchLock') lockHeld = true
            inflight.push({ owner: id, end: t + RECOMPUTE, withLock: mode === 'xfetchLock' })
            dbCalls++
            reqs.push({ id, outcome: 'early', note: `gap=${gap.toFixed(1)}` })
          }
        } else if (!lockHeld || mode === 'xfetch') {
          if (mode === 'xfetchLock') lockHeld = true
          inflight.push({ owner: id, end: t + RECOMPUTE, withLock: mode === 'xfetchLock' })
          dbCalls++
          reqs.push({ id, outcome: 'db', note: '' })
        } else {
          waiting.push(id)
          reqs.push({ id, outcome: 'wait', note: '' })
        }
      }
    }
    waitedTicks += waiting.length
    peak = Math.max(peak, inflight.length)
    history.push(valid ? 'good' : 'bad')

    const started = reqs.filter((r) => r.outcome === 'db' || r.outcome === 'early').length
    const waits = reqs.filter((r) => r.outcome === 'wait').length
    const line = lineFor(mode, reqs)
    const parts: string[] = []
    if (done.length > 0) parts.push(`DB の作り直しが ${done.length} 本終わり、期限が ${expiry! * 100}ms に延びた`)
    if (reqs.some((r) => r.outcome === 'served')) parts.push('待っていた要求が新しい値を受け取る')
    if (!valid && mode === 'naive' && started > 0) parts.push(`期限切れ。来た ${started} 件が全員 DB へ行く`)
    else if (started > 0 && reqs.some((r) => r.outcome === 'early'))
      parts.push(`期限前だが、乱数で選ばれた ${started} 件が早めに作り直しを始める（ほかは当たり）`)
    else if (started > 0) parts.push(`期限切れ。最初の 1 件がロックを取って DB へ`)
    if (waits > 0) parts.push(`${waits} 件はロックが取れず待つ`)
    if (reqs.some((r) => r.outcome === 'stale')) parts.push('早めの作り直しは進行中なので、まだ有効な値をそのまま返す')
    if (parts.length === 0) parts.push(valid ? '期限内。全員キャッシュに当たる' : 'キャッシュが空のまま')

    frames.push({
      line,
      note: `t=${t * 100}ms: ${parts.join('。')}`,
      vars: {
        方式: TITLE[mode],
        期限: expiry === null ? '−' : `${expiry * 100}ms`,
        DB呼び出し累計: dbCalls,
        DB同時実行: inflight.length,
        同時実行の最大: peak,
        待ちの延べ刻み数: waitedTicks,
      },
      view: { t, cells: [...history], reqs, inflight: inflight.length, expiry },
      done: t === TICKS - 1,
    })
  }
  return frames
}

function lineFor(mode: Mode, reqs: Req[]): number | number[] {
  const has = (o: Outcome) => reqs.some((r) => r.outcome === o)
  switch (mode) {
    case 'naive':
      return has('db') ? [5, 6] : [3, 4]
    case 'lock':
      if (has('db')) return [6, 7, 8, 9, 10]
      if (has('wait')) return 13
      return [4, 5]
    case 'xfetch':
      if (has('early') || has('db')) return [5, 6, 7, 8]
      return [3, 4]
    case 'xfetchLock':
      if (has('stale')) return [5, 6]
      if (has('early')) return [9, 10]
      if (has('db') || has('wait')) return [7, 8]
      return [3, 4]
  }
}

const PRESETS: { name: string; value: Mode }[] = (Object.keys(TITLE) as Mode[]).map((m) => ({ name: TITLE[m], value: m }))

export default function CacheStampede() {
  const [mode, setMode] = useState<Mode>('naive')
  const frames = useMemo(() => trace(mode), [mode])

  return (
    <SimShell
      title={`人気キーの期限切れ（${TITLE[mode]}）`}
      subtitle="1 刻み 100ms、TTL 1.2 秒、作り直し 200ms、1 刻みに 3 件の要求。期限の前後で誰が DB へ行くかを比べる"
      code={CODE[mode]}
      frames={frames}
      controls={<PresetControl label="方式" presets={PRESETS} onPick={setMode} />}
      legend={
        <>
          <LegendItem state="good">キャッシュから返す</LegendItem>
          <LegendItem state="bad">外れて DB へ</LegendItem>
          <LegendItem state="window">期限前に作り直す</LegendItem>
          <LegendItem state="dim">待たされる</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              キャッシュに値があったか（1 マス 100ms）
            </p>
            <div className="flex flex-wrap gap-[3px]">
              {Array.from({ length: TICKS }, (_, i) => {
                const s = f.view.cells[i]
                const st = s ? cellStyle[s] : cellStyle.idle
                return (
                  <span
                    key={i}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-sm border font-mono text-[9px]"
                    style={{
                      background: s ? st.background : 'transparent',
                      borderColor: i === f.view.t ? 'var(--accent)' : st.borderColor,
                      borderWidth: i === f.view.t ? 2 : 1,
                      color: st.color,
                    }}
                  >
                    {i}
                  </span>
                )
              })}
            </div>
          </div>
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              この刻みの要求
            </p>
            <div className="flex flex-wrap gap-1.5">
              {f.view.reqs.map((r) => {
                const st = cellStyle[OUTCOME_STATE[r.outcome]]
                return (
                  <span
                    key={r.id + r.outcome}
                    className="rounded border px-2 py-1 font-mono text-[11px]"
                    style={{ background: st.background, borderColor: st.borderColor, color: st.color }}
                  >
                    {r.id} {OUTCOME_LABEL[r.outcome]}
                    {r.note && <span style={{ color: 'var(--fg-muted)' }}> {r.note}</span>}
                  </span>
                )
              })}
            </div>
          </div>
          <p className="m-0 font-mono text-xs">
            DB 同時実行:{' '}
            <span style={{ color: f.view.inflight > 1 ? 'var(--danger)' : 'var(--fg)' }}>
              {'■'.repeat(f.view.inflight) || '0'}
            </span>
          </p>
        </div>
      )}
    </SimShell>
  )
}
