import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { LegendItem } from '../views/Legend'
import type { Frame } from '../core/types'

const CODE = `def map_phase(docs):
    pairs = []
    for doc_id, text in docs:
        for word in text.split():
            pairs.append((word, 1))       # (キー, 値) を吐き出すだけ
    return pairs

def shuffle(pairs):
    groups = {}
    for key, value in pairs:
        groups.setdefault(key, []).append(value)   # 同じキーを1か所に集める
    return groups

def reduce_phase(groups):
    return {key: sum(values) for key, values in groups.items()}`

type Input = { docs: string[] }
type View = {
  docs: { text: string; active: boolean }[]
  pairs: { key: string; from: number; fresh: boolean }[]
  groups: { key: string; vals: number; active: boolean }[]
  results: { key: string; n: number }[]
  phase: string
}

function trace({ docs }: Input): Frame<View>[] {
  const frames: Frame<View>[] = []
  const pairs: { key: string; from: number; fresh: boolean }[] = []
  const groups = new Map<string, number>()
  const results: { key: string; n: number }[] = []

  const snap = (
    line: number | number[],
    note: string,
    opts: { phase: string; doc?: number; key?: string; finished?: boolean },
  ) => {
    frames.push({
      line,
      note,
      vars: {
        段階: opts.phase,
        中間ペア: pairs.length,
        キーの種類: groups.size,
      },
      view: {
        docs: docs.map((t, i) => ({ text: t, active: i === opts.doc })),
        pairs: pairs.map((p) => ({ ...p })),
        groups: [...groups.entries()].map(([key, vals]) => ({
          key,
          vals,
          active: key === opts.key,
        })),
        results: [...results],
        phase: opts.phase,
      },
      done: opts.finished,
    })
  }

  snap(1, `${docs.length} 台のマシンが、それぞれ手元の文書だけを処理する。文書は互いに関係ないので、並列に走らせられる`, {
    phase: 'map',
  })

  docs.forEach((text, i) => {
    for (const w of text.split(/\s+/).filter(Boolean)) {
      pairs.forEach((p) => (p.fresh = false))
      pairs.push({ key: w, from: i, fresh: true })
    }
    snap([4, 5], `マシン ${i} が "${text}" を処理し、単語ごとに (単語, 1) を吐き出す。数え上げはせず、ただ並べるだけ`, {
      phase: 'map',
      doc: i,
    })
  })

  snap(8, `map が終わった。中間データは ${pairs.length} 組。ここから「同じ単語を同じマシンに集める」のが shuffle`, {
    phase: 'shuffle',
  })

  for (const p of pairs) {
    groups.set(p.key, (groups.get(p.key) ?? 0) + 1)
    snap([10, 11], `"${p.key}" を担当マシンへ送る。ハッシュで送り先を決めるので、同じ単語は必ず同じマシンに集まる`, {
      phase: 'shuffle',
      key: p.key,
    })
  }

  snap(14, `shuffle が終わった。ここからは、各マシンが自分の担当キーだけを見て集計できる`, { phase: 'reduce' })

  for (const [key, n] of [...groups.entries()].sort()) {
    results.push({ key, n })
    snap(15, `"${key}" を担当するマシンが、集まった ${n} 個の 1 を足して ${n} と確定する`, {
      phase: 'reduce',
      key,
    })
  }

  snap(15, `完了。${results.map((r) => `${r.key}:${r.n}`).join(', ')}`, { phase: '完了', finished: true })
  return frames
}

const PRESETS: { name: string; value: Input }[] = [
  { name: '3台で単語数', value: { docs: ['cat dog', 'dog bird cat', 'cat'] } },
  { name: '偏りがある', value: { docs: ['a a a', 'a b', 'a c'] } },
  { name: '重なりなし', value: { docs: ['x y', 'z w'] } },
]

export default function MapReduceCount() {
  const [input, setInput] = useState<Input>(PRESETS[0]!.value)
  const frames = useMemo(() => trace(input), [input])

  return (
    <SimShell
      title="MapReduce（吐き出して、集めて、畳む）"
      subtitle="map は手元だけを見て (キー, 値) を吐く。shuffle が同じキーを集め、reduce が畳む"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="入力" presets={PRESETS} onPick={setInput} />}
      legend={
        <>
          <LegendItem state="active">いま処理しているもの</LegendItem>
          <LegendItem state="good">確定した集計結果</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3 text-xs">
          <p className="m-0 font-mono" style={{ color: 'var(--accent)' }}>
            {f.view.phase}
          </p>
          <div className="flex flex-wrap gap-5">
            <div>
              <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                入力（マシンごと）
              </p>
              <ul className="m-0 list-none space-y-1 p-0 font-mono">
                {f.view.docs.map((d, i) => (
                  <li
                    key={i}
                    className="rounded px-2 py-1"
                    style={{
                      background: d.active ? 'var(--accent-soft)' : 'var(--bg)',
                      color: d.active ? 'var(--accent)' : 'var(--fg-muted)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    m{i}: {d.text}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                中間データ (キー, 1)
              </p>
              <p className="m-0 max-w-[16rem] break-all font-mono" style={{ color: 'var(--fg-muted)' }}>
                {f.view.pairs.map((p, i) => (
                  <span key={i} style={{ color: p.fresh ? 'var(--accent)' : undefined }}>
                    ({p.key},1){' '}
                  </span>
                ))}
              </p>
            </div>
            <div>
              <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                集めた結果
              </p>
              <ul className="m-0 list-none space-y-1 p-0 font-mono">
                {f.view.groups.map((g) => (
                  <li
                    key={g.key}
                    className="rounded px-2 py-1"
                    style={{
                      background: g.active ? 'var(--accent-soft)' : 'var(--bg)',
                      color: g.active ? 'var(--accent)' : 'var(--fg-muted)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {g.key}: {'1 '.repeat(g.vals).trim()}
                  </li>
                ))}
              </ul>
            </div>
            {f.view.results.length > 0 && (
              <div>
                <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                  最終結果
                </p>
                <ul className="m-0 list-none space-y-1 p-0 font-mono" style={{ color: 'var(--ok)' }}>
                  {f.view.results.map((r) => (
                    <li key={r.key}>
                      {r.key}: {r.n}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </SimShell>
  )
}
