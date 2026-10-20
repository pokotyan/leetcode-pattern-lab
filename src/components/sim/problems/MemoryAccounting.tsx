import { useMemo } from 'react'
import { SimShell } from '../core/SimShell'
import type { Frame } from '../core/types'

const CODE = `# 物理メモリ 16 GiB、スワップなし。1 マス = 1 GiB
# 起動時点で、カーネルと他のプロセスが 2 GiB 使っている
A: cat big.log > /dev/null        # 6 GiB のファイルを読む
A: p = malloc(4 GiB)
A: memset(p, 1, 4 GiB)
A: fork()  →  B
B: p[0 .. 1 GiB) に書く
C: q = malloc(5 GiB); memset(q, 1, 5 GiB)
C: r = malloc(5 GiB); memset(r, 1, 5 GiB)
カーネル: OOM killer が 1 つ選んで殺す`

type Owner = 'kernel' | 'free' | 'cache' | 'anon'
type Page = { owner: Owner; procs: string[]; mark?: 'new' | 'gone' }
type Proc = { name: string; vsz: number }
type Row = { name: string; vsz: number; rss: number; pss: number; score: number }
type View = { pages: Page[]; rows: Row[]; oom?: string }

const TOTAL = 16

function trace(): Frame<View>[] {
  const pages: Page[] = Array.from({ length: TOTAL }, (_, i) => ({ owner: i < 2 ? 'kernel' : 'free', procs: [] }))
  const procs: Proc[] = []
  const frames: Frame<View>[] = []

  const proc = (name: string) => procs.find((p) => p.name === name)!
  const rows = (): Row[] =>
    procs.map((p) => {
      const mine = pages.filter((pg) => pg.owner === 'anon' && pg.procs.includes(p.name))
      const rss = mine.length
      return {
        name: p.name,
        vsz: p.vsz,
        rss,
        pss: mine.reduce((s, pg) => s + 1 / pg.procs.length, 0),
        score: Math.round((rss * 1000) / TOTAL),
      }
    })

  const snap = (line: number | number[], note: string, oom?: string, done?: boolean) => {
    const free = pages.filter((p) => p.owner === 'free').length
    const cache = pages.filter((p) => p.owner === 'cache').length
    const available = free + cache
    frames.push({
      line,
      note,
      vars: {
        total: `${TOTAL} GiB`,
        used: `${TOTAL - available} GiB`,
        free: `${free} GiB`,
        'buff/cache': `${cache} GiB`,
        available: `${available} GiB`,
        'VSZ の合計': `${procs.reduce((s, p) => s + p.vsz, 0)} GiB`,
      },
      view: { pages: pages.map((p) => ({ ...p, procs: [...p.procs] })), rows: rows(), oom },
      done,
    })
    for (const p of pages) {
      if (p.mark === 'gone') {
        p.owner = 'free'
        p.procs = []
      }
      p.mark = undefined
    }
  }

  const take = (owner: Owner, procNames: string[], n: number) => {
    let got = 0
    for (const p of pages) {
      if (got === n) break
      if (p.owner === 'free' && !p.mark) {
        p.owner = owner
        p.procs = [...procNames]
        p.mark = 'new'
        got++
      }
    }
    return got
  }

  const reclaimCache = (n: number) => {
    let got = 0
    for (const p of pages) {
      if (got === n) break
      if (p.owner === 'cache' && !p.mark) {
        p.mark = 'gone'
        got++
      }
    }
    return got
  }

  snap([1, 2], '16 GiB のうち 2 GiB をカーネルと他のプロセスが使っている。残り 14 GiB は free')

  procs.push({ name: 'A', vsz: 0 })
  take('cache', [], 6)
  snap(3, 'A がファイルを read() で読むと、内容はページキャッシュに残る。free は 6 GiB 減るが、いつでも捨てられるので available は減らない。read() で読んだだけなので A の RSS にも入らない')

  proc('A').vsz += 4
  snap(4, 'malloc はアドレス空間を予約するだけ（第 24 回）。VSZ と Committed_AS は 4 GiB 増えるが、物理ページは 1 枚も使っていない')

  take('anon', ['A'], 4)
  snap(5, '書き込んだ瞬間に物理ページが割り当てられ、A の RSS が 4 GiB になる。ここで初めて available が減る')

  procs.push({ name: 'B', vsz: 4 })
  for (const p of pages) if (p.owner === 'anon' && p.procs.includes('A')) p.procs.push('B')
  snap(6, 'fork 直後の B は A のページをそのまま共有する（コピーオンライト）。RSS は A も B も 4 GiB で、足すと 8 GiB。実際の消費は 4 GiB のままで、PSS（共有を頭割り）を足すと 4 GiB に合う')

  const shared = pages.find((p) => p.owner === 'anon' && p.procs.length === 2)!
  shared.procs = ['A']
  take('anon', ['B'], 1)
  snap(7, 'B が 1 GiB に書くと、その部分だけ複製される。used が 1 GiB 増え、A と B の PSS はそれぞれ 1 + 3/2 = 2.5 GiB になる')

  procs.push({ name: 'C', vsz: 5 })
  const fromFree = take('anon', ['C'], 5)
  const need = 5 - fromFree
  reclaimCache(need)
  snap(8, `C が 5 GiB 書く。free は ${fromFree} GiB しか無いので、カーネルはページキャッシュを ${need} GiB 捨てて空ける。ファイルの中身はディスクにあるので、捨てても失うものは無い`)
  take('anon', ['C'], need)
  snap(8, `捨てた ${need} GiB を C に渡した。free は 0 だが、まだ捨てられるキャッシュがあるので available は 0 ではない`)

  proc('C').vsz += 5
  const rest = pages.filter((p) => p.owner === 'cache').length
  reclaimCache(rest)
  snap(9, `C がさらに 5 GiB 書く。キャッシュを残り ${rest} GiB ぜんぶ捨てても 1 GiB 足りない。スワップも無いので、回収できるものが尽きた`)
  take('anon', ['C'], rest)
  const r = rows()
  const victim = r.reduce((a, b) => (b.score > a.score ? b : a))
  snap(
    10,
    `OOM killer が各プロセスの点数（RSS + スワップ + ページテーブルを、使える量に対する割合にしたもの）を比べ、最も高い ${victim.name} を SIGKILL で殺す。共有ページも RSS として数えるので、A と B はどちらも 4 GiB ぶんで比べられる`,
    victim.name,
  )

  for (const p of pages) {
    if (p.owner === 'anon' && p.procs.includes(victim.name)) {
      p.procs = p.procs.filter((n) => n !== victim.name)
      if (p.procs.length === 0) p.mark = 'gone'
    }
  }
  procs.splice(procs.indexOf(proc(victim.name)), 1)
  snap(10, `${victim.name} のページが解放された。ページキャッシュは捨てたまま空なので、A がもう一度ファイルを読むとディスクから読み直しになる`)
  snap(10, '完了。free が少ないことは問題ではない。見るべきは available と、それが 0 に近づいたときに誰が殺されるか', undefined, true)
  return frames
}

const OWNER_STYLE: Record<string, { background: string; color: string; borderColor: string }> = {
  kernel: { background: 'var(--bg-soft)', color: 'var(--fg-muted)', borderColor: 'var(--border)' },
  free: { background: 'var(--bg)', color: 'var(--fg-muted)', borderColor: 'var(--border)' },
  cache: { background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent)' },
  A: { background: 'var(--ok-soft)', color: 'var(--ok)', borderColor: 'var(--ok)' },
  B: { background: 'var(--warn-soft)', color: 'var(--warn)', borderColor: 'var(--warn)' },
  AB: { background: 'var(--ok-soft)', color: 'var(--warn)', borderColor: 'var(--warn)' },
  C: { background: 'var(--danger-soft)', color: 'var(--danger)', borderColor: 'var(--danger)' },
}

function pageKey(p: Page) {
  if (p.owner !== 'anon') return p.owner
  return p.procs.join('')
}

function pageLabel(p: Page) {
  if (p.owner === 'kernel') return '他'
  if (p.owner === 'free') return ''
  if (p.owner === 'cache') return 'cache'
  return p.procs.join('+')
}

function PageCell({ page }: { page: Page }) {
  const s = OWNER_STYLE[pageKey(page)] ?? OWNER_STYLE.free!
  return (
    <div
      className="flex h-10 items-center justify-center rounded border font-mono text-[11px]"
      style={{
        ...s,
        borderStyle: page.mark === 'gone' ? 'dashed' : 'solid',
        borderWidth: page.mark ? 2 : 1,
        opacity: page.mark === 'gone' ? 0.5 : 1,
      }}
    >
      {pageLabel(page)}
    </div>
  )
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

export default function MemoryAccounting() {
  const frames = useMemo(() => trace(), [])

  return (
    <SimShell
      title="物理メモリの使われ方と、free・RSS・PSS・OOM"
      subtitle="1 マス 1 GiB。ファイルの読み込み、malloc、書き込み、fork、別プロセスの確保で、free の各列とプロセスごとの数字がどう動くか"
      code={CODE}
      frames={frames}
      legend={
        <>
          {[
            ['cache', 'ページキャッシュ（捨てられる）'],
            ['A', 'A だけのページ'],
            ['AB', 'A と B が共有'],
            ['B', 'B だけのページ'],
            ['C', 'C のページ'],
            ['kernel', 'カーネル・他'],
          ].map(([k, label]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-sm border"
                style={{ background: OWNER_STYLE[k!]!.background, borderColor: OWNER_STYLE[k!]!.borderColor }}
              />
              {label}
            </span>
          ))}
          <span>太枠 = この手で割り当て / 点線 = この手で解放</span>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <div className="grid grid-cols-8 gap-1">
            {f.view.pages.map((p, i) => (
              <PageCell key={i} page={p} />
            ))}
          </div>
          <table className="w-full border-collapse font-mono text-[11px]">
            <thead>
              <tr style={{ color: 'var(--fg-muted)' }}>
                <th className="py-1 text-left font-normal">プロセス</th>
                <th className="py-1 text-right font-normal">VSZ</th>
                <th className="py-1 text-right font-normal">RSS</th>
                <th className="py-1 text-right font-normal">PSS</th>
                <th className="py-1 text-right font-normal">OOM の点数</th>
              </tr>
            </thead>
            <tbody>
              {f.view.rows.map((r) => (
                <tr
                  key={r.name}
                  style={{
                    borderTop: '1px solid var(--border)',
                    color: f.view.oom === r.name ? 'var(--danger)' : 'var(--fg)',
                    fontWeight: f.view.oom === r.name ? 700 : 400,
                  }}
                >
                  <td className="py-1">
                    {r.name}
                    {f.view.oom === r.name && ' ← SIGKILL'}
                  </td>
                  <td className="py-1 text-right">{r.vsz} GiB</td>
                  <td className="py-1 text-right">{r.rss} GiB</td>
                  <td className="py-1 text-right">{fmt(r.pss)} GiB</td>
                  <td className="py-1 text-right">{r.score}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '1px solid var(--border)', color: 'var(--fg-muted)' }}>
                <td className="py-1">合計</td>
                <td className="py-1 text-right">{f.view.rows.reduce((s, r) => s + r.vsz, 0)} GiB</td>
                <td className="py-1 text-right">{f.view.rows.reduce((s, r) => s + r.rss, 0)} GiB</td>
                <td className="py-1 text-right">{fmt(f.view.rows.reduce((s, r) => s + r.pss, 0))} GiB</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </SimShell>
  )
}
