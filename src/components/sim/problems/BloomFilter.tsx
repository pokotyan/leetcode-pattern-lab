import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `class BloomFilter:
    def __init__(self, m, k):
        self.bits = [0] * m          # m ビットの配列
        self.m = m
        self.k = k                   # ハッシュ関数の本数

    def _positions(self, key):
        h1, h2 = hash1(key), hash2(key)
        return [(h1 + i * h2) % self.m for i in range(self.k)]

    def add(self, key):
        for p in self._positions(key):
            self.bits[p] = 1         # 立てるだけ。決して消さない

    def might_contain(self, key):
        # 1つでも 0 があれば「絶対に無い」
        # 全部 1 なら「たぶん有る」
        return all(self.bits[p] for p in self._positions(key))`

const M = 16
const K = 2

const h1 = (s: string) => {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}
const h2 = (s: string) => {
  let h = 7
  for (const c of s) h = (h * 131 + c.charCodeAt(0)) >>> 0
  // | 1 は符号付き32bitに落ちるので、必ず符号なしへ戻す
  return (h | 1) >>> 0
}
const positions = (s: string) => {
  const a = h1(s)
  const b = h2(s)
  return Array.from({ length: K }, (_, i) => ((a + i * b) % M + M) % M)
}

type Input = { add: string[]; query: string[] }
type View = { bits: Cell[]; word: string; pos: number[]; verdict: string; log: string[] }

function trace({ add, query }: Input): Frame<View>[] {
  const bits = Array<number>(M).fill(0)
  const stored = new Set<string>()
  const frames: Frame<View>[] = []
  const log: string[] = []

  const snap = (
    line: number | number[],
    note: string,
    opts: { word?: string; pos?: number[]; hit?: boolean; miss?: boolean; verdict?: string; finished?: boolean } = {},
  ) => {
    const pos = opts.pos ?? []
    const cells: Cell[] = bits.map((b, i) => {
      let state: Cell['state'] = b ? 'window' : 'idle'
      if (pos.includes(i)) state = opts.miss ? 'bad' : b ? 'good' : 'active'
      return { value: b, state, note: String(i) }
    })
    frames.push({
      line,
      note,
      vars: {
        入れた数: stored.size,
        '1のビット': bits.filter(Boolean).length + '/' + M,
        判定: opts.verdict ?? '−',
      },
      view: { bits: cells, word: opts.word ?? '', pos, verdict: opts.verdict ?? '', log: [...log] },
      done: opts.finished,
    })
  }

  snap(3, `${M} ビットの配列と ${K} 本のハッシュ。要素そのものは一切保存しない。持つのはビットだけ`)

  for (const w of add) {
    const pos = positions(w)
    for (const p of pos) bits[p] = 1
    stored.add(w)
    log.push(`add("${w}") → ビット ${pos.join(', ')} を立てる`)
    snap([12, 13, 14], `"${w}" を追加。ハッシュ ${K} 本が指す位置 ${pos.join(', ')} を 1 にする。すでに 1 なら何もしない`, {
      word: w,
      pos,
    })
  }

  for (const w of query) {
    const pos = positions(w)
    const all = pos.every((p) => bits[p] === 1)
    const actually = stored.has(w)
    if (!all) {
      const zero = pos.filter((p) => bits[p] === 0)
      log.push(`contains("${w}") → ビット ${zero.join(', ')} が 0 なので「絶対に無い」`)
      snap([16, 17, 18, 19], `"${w}" を問い合わせ。位置 ${pos.join(', ')} のうち ${zero.join(', ')} が 0。1つでも 0 なら、入れたことは絶対にない`, {
        word: w,
        pos,
        miss: true,
        verdict: '絶対に無い',
      })
    } else if (actually) {
      log.push(`contains("${w}") → 全ビット 1。実際に入っている`)
      snap([16, 19], `"${w}" を問い合わせ。位置 ${pos.join(', ')} が全部 1。「たぶん有る」と答える（実際に入っている）`, {
        word: w,
        pos,
        hit: true,
        verdict: 'たぶん有る（正解）',
      })
    } else {
      log.push(`contains("${w}") → 全ビット 1 だが、入れていない。偽陽性`)
      snap([16, 19], `"${w}" を問い合わせ。位置 ${pos.join(', ')} は全部 1 だが、この語は一度も追加していない。ほかの語が立てたビットがたまたま重なった。これが偽陽性`, {
        word: w,
        pos,
        hit: true,
        verdict: '偽陽性',
      })
    }
  }

  snap(19, `完了。${M} ビットのうち ${bits.filter(Boolean).length} 本が立っている。ビットが埋まるほど偽陽性は増える`, {
    finished: true,
  })
  return frames
}

const PRESETS: { name: string; value: Input }[] = [
  { name: '偽陽性が出る例', value: { add: ['apple', 'banana', 'cherry', 'melon'], query: ['apple', 'grape', 'kiwi', 'peach', 'plum', 'fig'] } },
  { name: '少なめに入れる', value: { add: ['cat', 'dog'], query: ['cat', 'bird', 'fish'] } },
  { name: '入れすぎ', value: { add: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], query: ['zzz', 'yyy'] } },
]

export default function BloomFilter() {
  const [input, setInput] = useState<Input>(PRESETS[0]!.value)
  const frames = useMemo(() => trace(input), [input])

  return (
    <SimShell
      title="Bloom Filter（「無い」だけを確実に言う）"
      subtitle="要素は保存せず、ハッシュが指すビットだけを立てる。1つでも 0 なら絶対に無い"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="入力" presets={PRESETS} onPick={setInput} />}
      legend={
        <>
          <LegendItem state="active">いま立てたビット</LegendItem>
          <LegendItem state="good">問い合わせで 1 だったビット</LegendItem>
          <LegendItem state="bad">0 だったビット（＝絶対に無い）</LegendItem>
          <LegendItem state="window">立っているビット</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          {f.view.word && (
            <p className="m-0 font-mono text-xs">
              <span style={{ color: 'var(--accent)' }}>"{f.view.word}"</span>
              <span style={{ color: 'var(--fg-muted)' }}> → 位置 {f.view.pos.join(', ')}</span>
              {f.view.verdict && (
                <span
                  style={{
                    color: f.view.verdict === '偽陽性' ? 'var(--danger)' : 'var(--ok)',
                  }}
                >
                  {'　'}
                  {f.view.verdict}
                </span>
              )}
            </p>
          )}
          <ArrayView cells={f.view.bits} showIndex={false} size={34} />
          <ul className="m-0 list-none space-y-0.5 p-0 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            {f.view.log.slice(-6).map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}
    </SimShell>
  )
}
