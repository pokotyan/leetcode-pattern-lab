import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { LegendItem } from '../views/Legend'
import type { Frame } from '../core/types'

const CODE = `import math

def bm25(docs, query, k1=1.5, b=0.75):
    N = len(docs)
    avgdl = sum(len(d) for d in docs) / N
    scores = [0.0] * N
    for term in query:
        n_q = sum(1 for d in docs if term in d)   # その語を含む文書数
        if n_q == 0:
            continue
        idf = math.log((N - n_q + 0.5) / (n_q + 0.5) + 1)
        for i, d in enumerate(docs):
            f = d.count(term)                     # 文書内の出現回数
            if f == 0:
                continue
            norm = f * (k1 + 1) / (f + k1 * (1 - b + b * len(d) / avgdl))
            scores[i] += idf * norm
    return scores`

type Input = { docs: string[][]; query: string[]; label: string }
type Row = { id: number; text: string; len: number; tf: number | null; add: number | null; score: number }
type View = { rows: Row[]; term: string; idf: number | null; nq: number | null; avgdl: number }

const K1 = 1.5
const B = 0.75

function trace({ docs, query }: Input): Frame<View>[] {
  const frames: Frame<View>[] = []
  const N = docs.length
  const avgdl = docs.reduce((s, d) => s + d.length, 0) / N
  const scores = Array<number>(N).fill(0)

  const snap = (
    line: number | number[],
    note: string,
    opts: {
      term?: string
      idf?: number
      nq?: number
      tf?: (number | null)[]
      add?: (number | null)[]
      cur?: number
      finished?: boolean
    } = {},
  ) => {
    const rows: Row[] = docs.map((d, i) => ({
      id: i,
      text: d.join(' '),
      len: d.length,
      tf: opts.tf?.[i] ?? null,
      add: opts.add?.[i] ?? null,
      score: scores[i]!,
    }))
    frames.push({
      line,
      note,
      vars: {
        語: opts.term ?? '−',
        含む文書数: opts.nq ?? '−',
        idf: opts.idf !== undefined ? opts.idf.toFixed(3) : '−',
        平均長: avgdl.toFixed(1),
      },
      view: { rows, term: opts.term ?? '', idf: opts.idf ?? null, nq: opts.nq ?? null, avgdl },
      done: opts.finished,
    })
  }

  snap([5, 6], `文書は ${N} 件、平均の長さは ${avgdl.toFixed(1)} 語。検索語は「${query.join(' ')}」。語ごとにスコアを足し込んでいく`)

  for (const term of query) {
    const nq = docs.filter((d) => d.includes(term)).length
    if (nq === 0) {
      snap([8, 9, 10], `「${term}」はどの文書にも出てこない。スコアに影響しない`, { term, nq })
      continue
    }
    const idf = Math.log((N - nq + 0.5) / (nq + 0.5) + 1)
    snap([8, 11], `「${term}」を含む文書は ${nq}/${N} 件。idf = log((${N} − ${nq} + 0.5)/(${nq} + 0.5) + 1) = ${idf.toFixed(3)}。珍しい語ほどこの値が大きくなる`, {
      term,
      nq,
      idf,
    })

    const tf: (number | null)[] = []
    const add: (number | null)[] = []
    for (let i = 0; i < N; i++) {
      const d = docs[i]!
      const f = d.filter((w) => w === term).length
      tf.push(f || null)
      if (f === 0) {
        add.push(null)
        continue
      }
      const norm = (f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.length) / avgdl))
      add.push(idf * norm)
    }
    for (let i = 0; i < N; i++) {
      if (add[i] !== null) scores[i]! += add[i]!
    }
    snap([13, 16, 17], `各文書の出現回数 tf からスコアの増分を出して足す。同じ tf でも、長い文書ほど増分が小さくなる（b = ${B} の効果）`, {
      term,
      nq,
      idf,
      tf,
      add,
    })
  }

  const ranked = scores
    .map((s, i) => ({ i, s }))
    .sort((a, b) => b.s - a.s)
    .map((r) => `文書${r.i}(${r.s.toFixed(2)})`)
  snap(18, `完了。スコア順に並べると ${ranked.join(' > ')}`, { finished: true })
  return frames
}

const PRESETS: { name: string; value: Input }[] = [
  {
    name: '短い文書が有利',
    value: {
      docs: [
        ['cat', 'dog'],
        ['cat', 'cat', 'bird', 'fish', 'tree', 'sky'],
        ['dog', 'bird'],
      ],
      query: ['cat'],
      label: '',
    },
  },
  {
    name: '珍しい語が効く',
    value: {
      docs: [
        ['the', 'cat', 'sat'],
        ['the', 'dog', 'ran'],
        ['the', 'cat', 'ran', 'fast'],
      ],
      query: ['the', 'cat'],
      label: '',
    },
  },
  {
    name: '出現回数の飽和',
    value: {
      docs: [
        ['cat'],
        ['cat', 'cat'],
        ['cat', 'cat', 'cat', 'cat', 'cat', 'cat'],
      ],
      query: ['cat'],
      label: '',
    },
  },
]

export default function Bm25Score() {
  const [input, setInput] = useState<Input>(PRESETS[0]!.value)
  const frames = useMemo(() => trace(input), [input])

  return (
    <SimShell
      title="BM25 のスコアはどう決まるか"
      subtitle="珍しい語ほど重く（idf）、出現回数は多すぎても頭打ち（k1）、長い文書は割り引く（b）"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="入力" presets={PRESETS} onPick={setInput} />}
      legend={
        <>
          <LegendItem state="good">この語で加点された文書</LegendItem>
          <LegendItem state="idle">この語を含まない文書</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          {f.view.term && (
            <p className="m-0 font-mono text-xs" style={{ color: 'var(--accent)' }}>
              いま見ている語: 「{f.view.term}」
              {f.view.idf !== null && `　idf = ${f.view.idf.toFixed(3)}`}
            </p>
          )}
          <table
            className="m-0 border-collapse font-mono text-xs"
            style={{ display: 'table', width: 'auto' }}
          >
            <thead>
              <tr style={{ color: 'var(--fg-muted)' }}>
                <th className="px-2 py-1 text-left">文書</th>
                <th className="px-2 py-1 text-left">中身</th>
                <th className="px-2 py-1 text-right">語数</th>
                <th className="px-2 py-1 text-right">tf</th>
                <th className="px-2 py-1 text-right">増分</th>
                <th className="px-2 py-1 text-right">スコア</th>
              </tr>
            </thead>
            <tbody>
              {f.view.rows.map((r) => (
                <tr
                  key={r.id}
                  style={{
                    background: r.add !== null ? 'var(--ok-soft)' : 'transparent',
                    color: r.add !== null ? 'var(--ok)' : 'var(--fg-muted)',
                  }}
                >
                  <td className="px-2 py-1">{r.id}</td>
                  <td className="px-2 py-1">{r.text}</td>
                  <td className="px-2 py-1 text-right">{r.len}</td>
                  <td className="px-2 py-1 text-right">{r.tf ?? '·'}</td>
                  <td className="px-2 py-1 text-right">{r.add === null ? '·' : r.add.toFixed(3)}</td>
                  <td className="px-2 py-1 text-right font-bold">{r.score.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SimShell>
  )
}
