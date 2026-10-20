import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { LegendItem } from '../views/Legend'
import { cellStyle } from '../views/style'
import type { CellState, Frame } from '../core/types'

type Scenario = 'aside' | 'asideRace' | 'readThrough' | 'writeThrough' | 'writeBehind' | 'writeBehindCrash' | 'writeAround'
type Node = 'app' | 'cache' | 'db'
type Verdict = 'match' | 'miss' | 'stale' | 'pending' | 'lost'

type View = {
  app: string
  cache: string | null
  db: string
  dirty: boolean
  down: boolean
  focus: Node[]
  arrow: string
  verdict: Verdict
  trips: { cache: number; db: number }
}

const CODE: Record<Scenario, string> = {
  aside: `def read(key):
    v = cache.get(key)
    if v is None:                    # キャッシュにない
        v = db.select(key)
        cache.set(key, v, ttl=300)
    return v

def write(key, v):
    db.update(key, v)
    cache.delete(key)                # 次の読みで入れ直す`,
  asideRace: `def read(key):
    v = cache.get(key)
    if v is None:
        v = db.select(key)
        cache.set(key, v, ttl=300)
    return v

def write(key, v):
    db.update(key, v)
    cache.delete(key)`,
  readThrough: `# アプリはキャッシュにだけ話しかける
v = cache.get(key)

# ここから下はキャッシュの側（製品やライブラリ）が持つ
def get(key):
    if key not in store:
        store[key] = loader.load(key)   # DB を読むのはキャッシュ
    return store[key]`,
  writeThrough: `# アプリは書き込みもキャッシュに渡す
cache.put(key, v)
v = cache.get(key)

# キャッシュの側
def put(key, v):
    writer.store(key, v)    # DB に書けるまで戻らない
    store[key] = v`,
  writeBehind: `# アプリの書き込みはすぐ戻る
cache.put(key, v)

# キャッシュの側
def put(key, v):
    store[key] = v
    dirty.add(key)          # 未反映の印

def flush():                # 一定の間隔で
    for key in dirty:
        writer.store(key, store[key])
    dirty.clear()`,
  writeBehindCrash: `# アプリの書き込みはすぐ戻る
cache.put(key, v)

# キャッシュの側
def put(key, v):
    store[key] = v
    dirty.add(key)          # 未反映の印

def flush():                # 一定の間隔で
    for key in dirty:
        writer.store(key, store[key])
    dirty.clear()`,
  writeAround: `def write(key, v):
    db.insert(key, v)        # キャッシュには載せない
    cache.delete(key)        # 古い写しがあれば消す

def read(key):
    v = cache.get(key)
    if v is None:
        v = db.select(key)
        cache.set(key, v, ttl=300)
    return v`,
}

function trace(s: Scenario): Frame<View>[] {
  const frames: Frame<View>[] = []
  const st = { app: '−', cache: null as string | null, db: 'v1', dirty: false, down: false, trips: { cache: 0, db: 0 } }

  const verdictOf = (): Verdict => {
    if (st.down) return 'lost'
    if (st.cache === null) return 'miss'
    if (st.cache === st.db) return 'match'
    return st.dirty ? 'pending' : 'stale'
  }
  const snap = (line: number | number[], note: string, focus: Node[], arrow: string, opts: { done?: boolean; verdict?: Verdict } = {}) =>
    frames.push({
      line,
      note,
      vars: { 'キャッシュ命令': st.trips.cache, 'DB 問い合わせ': st.trips.db, '未反映の印': st.dirty ? 'あり' : 'なし' },
      view: { ...st, trips: { ...st.trips }, focus, arrow, verdict: opts.verdict ?? verdictOf() },
      done: opts.done,
    })
  const c = () => st.trips.cache++
  const d = () => st.trips.db++

  if (s === 'aside' || s === 'writeAround') {
    const base = s === 'aside' ? 0 : 4
    const w = s === 'aside' ? [8, 9, 10] : [1, 2, 3]
    if (s === 'writeAround') {
      st.db = '−'
      d(); st.db = 'log-42'
      snap([1, 2], `新しい記録を書く。DB にだけ書き、キャッシュには載せない。Write-Through ならここでキャッシュにも入り、読まれないまま場所を取る`, ['app', 'db'], 'アプリ → DB: INSERT')
      c()
      snap(3, `念のため古い写しを消す。もともと無いので何も起きない。書き側だけを見ると Cache-Aside の書き込みと同じ手順`, ['app', 'cache'], 'アプリ → キャッシュ: DEL')
    }
    c()
    snap(2 + base, `読む。まずキャッシュに聞く。無い（ミス）`, ['app', 'cache'], 'アプリ → キャッシュ: GET')
    d(); st.app = st.db
    snap([3 + base, 4 + base], `ミスなので、アプリが自分で DB を読む。キャッシュは DB の存在を知らない`, ['app', 'db'], 'アプリ → DB: SELECT')
    c(); st.cache = st.db
    snap(5 + base, `読んだ値をキャッシュに入れてから返す。ミス 1 回で 3 往復（GET・SELECT・SET）`, ['app', 'cache'], 'アプリ → キャッシュ: SET')
    if (s === 'writeAround') {
      snap(6 + base, `以後の読みはキャッシュで済む。書いたもののうち、実際に読まれたものだけがキャッシュに載る`, ['app'], '', { done: true })
      return frames
    }
    c(); st.app = st.cache!
    snap([2, 6], `もう一度読む。今度はキャッシュにある（ヒット）。DB には行かない`, ['app', 'cache'], 'アプリ → キャッシュ: GET')
    d(); st.db = 'v2'
    snap(w[1]!, `書く。先に DB を更新する。この瞬間、キャッシュは古い v1 を持っている`, ['app', 'db'], 'アプリ → DB: UPDATE')
    c(); st.cache = null
    snap(w[2]!, `キャッシュの写しを消す。上書きではなく削除なので、次に読まれるまでキャッシュには何もない`, ['app', 'cache'], 'アプリ → キャッシュ: DEL')
    c()
    snap(2, `読む。ミス`, ['app', 'cache'], 'アプリ → キャッシュ: GET')
    d(); st.app = st.db
    snap([3, 4], `DB から新しい v2 を読む`, ['app', 'db'], 'アプリ → DB: SELECT')
    c(); st.cache = st.db
    snap([5, 6], `入れ直して一致する。書いてから次に読まれるまでの間はミスになり、その読みは遅い`, ['app', 'cache'], 'アプリ → キャッシュ: SET', { done: true })
    return frames
  }

  if (s === 'asideRace') {
    c()
    snap(2, `読み手 R がキャッシュに聞く。無い`, ['app', 'cache'], 'R → キャッシュ: GET')
    d(); st.app = 'v1'
    snap(4, `R が DB から v1 を読む。R の手元に v1。ここで R が止まる（GC、スケジューリング、ネットワークの遅れ）`, ['app', 'db'], 'R → DB: SELECT')
    d(); st.db = 'v2'
    snap(9, `その間に書き手 W が DB を v2 に更新する`, ['db'], 'W → DB: UPDATE')
    c()
    snap(10, `W がキャッシュを消す。消すものはまだ無い`, ['cache'], 'W → キャッシュ: DEL')
    c(); st.cache = 'v1'
    snap(5, `R が再開し、手元の古い v1 をキャッシュに入れる。DB は v2。TTL の 300 秒が切れるまで、全員が v1 を読む`, ['app', 'cache'], 'R → キャッシュ: SET', { done: true })
    return frames
  }

  if (s === 'readThrough') {
    c()
    snap(2, `アプリはキャッシュに get するだけ。DB の場所も、読み方も知らない`, ['app', 'cache'], 'アプリ → キャッシュ: get')
    d(); st.cache = st.db
    snap([6, 7], `キャッシュに無いので、キャッシュ自身が loader を呼んで DB から読み、自分に入れる`, ['cache', 'db'], 'キャッシュ → DB: load')
    st.app = st.cache!
    snap(8, `値を返す。往復の数は Cache-Aside と同じだが、「ミスしたら DB を読む」コードがアプリから消え、キャッシュの側に移った`, ['app', 'cache'], 'キャッシュ → アプリ')
    c(); st.app = st.cache!
    snap(2, `2 回目はキャッシュだけで返る`, ['app', 'cache'], 'アプリ → キャッシュ: get', { done: true })
    return frames
  }

  if (s === 'writeThrough') {
    st.cache = 'v1'
    c()
    snap(2, `アプリが v2 を書く。相手は DB ではなくキャッシュ`, ['app', 'cache'], 'アプリ → キャッシュ: put')
    d(); st.db = 'v2'
    snap(7, `キャッシュが DB に書く。書けるまでアプリの put は戻らない。書き込みの遅さ = キャッシュ + DB`, ['cache', 'db'], 'キャッシュ → DB: store')
    st.cache = 'v2'
    snap(8, `自分の値も v2 にする。DB とキャッシュが同時に新しくなる`, ['cache'], '')
    c(); st.app = st.cache
    snap(3, `直後の読みは、ミスせずに新しい値を返す。Cache-Aside との違いはここ`, ['app', 'cache'], 'アプリ → キャッシュ: get', { done: true })
    return frames
  }

  // writeBehind / writeBehindCrash
  st.cache = 'v1'
  const puts = s === 'writeBehind' ? ['v2', 'v3', 'v4'] : ['v2', 'v3']
  for (const v of puts) {
    c(); st.cache = v; st.dirty = true
    snap([2, 6, 7], `アプリが ${v} を書く。キャッシュに入れて印を付けた時点で戻る。DB には触れていない`, ['app', 'cache'], 'アプリ → キャッシュ: put')
  }
  if (s === 'writeBehind') {
    d(); st.db = st.cache!
    snap([10, 11], `書き戻しの時刻。同じキーへの 3 回の書き込みは、最後の v4 だけを 1 回書けば済む（まとめ書き）`, ['cache', 'db'], 'キャッシュ → DB: store')
    st.dirty = false
    snap(12, `印を消す。ここで初めて DB が追いつく。それまでの間、DB だけを読む別のプログラム（集計や他のサービス）は古い v1 を見ていた`, ['cache'], '', { done: true })
    return frames
  }
  st.down = true; st.cache = null
  snap(9, `書き戻しの前にキャッシュのノードが落ちた。アプリには「書けた」と返したのに、v2 も v3 も DB に届いていない`, ['cache', 'db'], 'キャッシュ: 停止', { verdict: 'lost' })
  st.dirty = false
  snap(9, `新しいノードは空。DB は v1 のまま。Write-Behind では、書き戻すまでのあいだキャッシュが唯一の記録になる`, ['db'], '', { verdict: 'lost', done: true })
  return frames
}

const PRESETS: { name: string; value: Scenario }[] = [
  { name: 'Cache-Aside', value: 'aside' },
  { name: 'Cache-Aside の交差', value: 'asideRace' },
  { name: 'Read-Through', value: 'readThrough' },
  { name: 'Write-Through', value: 'writeThrough' },
  { name: 'Write-Behind', value: 'writeBehind' },
  { name: 'Write-Behind の障害', value: 'writeBehindCrash' },
  { name: 'Write-Around', value: 'writeAround' },
]

const VERDICT: Record<Verdict, { label: string; state: CellState }> = {
  match: { label: '一致', state: 'good' },
  miss: { label: 'キャッシュに無い', state: 'dim' },
  stale: { label: '食い違い（キャッシュが古い）', state: 'bad' },
  pending: { label: '食い違い（DB が古い・書き戻し待ち）', state: 'window' },
  lost: { label: '書き込みを失った', state: 'bad' },
}

function Box({ name, value, focus, sub, state }: { name: string; value: string; focus: boolean; sub?: string; state?: CellState }) {
  const s = cellStyle[state ?? (focus ? 'window' : 'idle')]
  return (
    <div
      className="min-w-[96px] flex-1 rounded-lg border px-3 py-2"
      style={{ background: s.background, borderColor: focus ? 'var(--accent)' : s.borderColor, borderWidth: focus ? 2 : 1 }}
    >
      <p className="m-0 text-[11px] font-bold" style={{ color: 'var(--fg-muted)' }}>{name}</p>
      <p className="m-0 font-mono text-sm" style={{ color: 'var(--fg)' }}>{value}</p>
      {sub && <p className="m-0 font-mono text-[10.5px]" style={{ color: 'var(--fg-muted)' }}>{sub}</p>}
    </div>
  )
}

export default function CachePatterns() {
  const [s, setS] = useState<Scenario>('aside')
  const frames = useMemo(() => trace(s), [s])
  return (
    <SimShell
      title="キャッシュをどこに挟むか"
      subtitle="同じ 1 つのキー user:1 を読み書きし、アプリ・キャッシュ・DB の値と、どちらが古いかを追う"
      code={CODE[s]}
      frames={frames}
      controls={<PresetControl label="経路" presets={PRESETS} onPick={setS} />}
      legend={
        <>
          <LegendItem state="good">一致</LegendItem>
          <LegendItem state="bad">キャッシュが古い / 失った</LegendItem>
          <LegendItem state="window">DB が古い（書き戻し待ち）</LegendItem>
        </>
      }
    >
      {(f) => {
        const v = VERDICT[f.view.verdict]
        const vs = cellStyle[v.state]
        return (
          <div className="space-y-2">
            <p className="m-0 min-h-[1.2em] font-mono text-xs" style={{ color: 'var(--accent)' }}>{f.view.arrow}</p>
            <div className="flex flex-wrap gap-2">
              <Box name="アプリの手元" value={f.view.app} focus={f.view.focus.includes('app')} />
              <Box
                name="キャッシュ"
                value={f.view.down ? '（停止）' : f.view.cache ?? '（なし）'}
                sub={f.view.dirty ? '未反映の印あり' : undefined}
                focus={f.view.focus.includes('cache')}
              />
              <Box name="DB" value={f.view.db} focus={f.view.focus.includes('db')} />
            </div>
            <p
              className="m-0 inline-block rounded border px-2 py-0.5 font-mono text-[11px]"
              style={{ background: vs.background, color: vs.color, borderColor: vs.borderColor }}
            >
              {v.label}
            </p>
          </div>
        )
      }}
    </SimShell>
  )
}
