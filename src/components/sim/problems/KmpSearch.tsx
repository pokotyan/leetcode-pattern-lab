import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl, TextControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def build_lps(pattern):
    lps = [0] * len(pattern)          # lps[i] = pattern[:i+1] の「接頭辞 = 接尾辞」の最大長
    length = 0
    for i in range(1, len(pattern)):
        while length > 0 and pattern[i] != pattern[length]:
            length = lps[length - 1]  # 1つ短い候補へ戻る
        if pattern[i] == pattern[length]:
            length += 1
        lps[i] = length
    return lps

def kmp(text, pattern):
    lps = build_lps(pattern)
    length = 0                        # いま何文字ぶん一致しているか
    for i, ch in enumerate(text):
        while length > 0 and ch != pattern[length]:
            length = lps[length - 1]  # ずらす。text 側の i は戻さない
        if ch == pattern[length]:
            length += 1
        if length == len(pattern):
            return i - length + 1     # 一致した先頭位置
    return -1`

type View = {
  phase: 'build' | 'search'
  pattern: Cell[]
  patternPointers: Pointer[]
  text: Cell[]
  textPointers: Pointer[]
  aligned: Cell[]
}

function trace(text: string, pattern: string): Frame<View>[] {
  const p = [...pattern]
  const t = [...text]
  const lps = Array<number>(p.length).fill(0)
  const frames: Frame<View>[] = []

  const buildSnap = (
    line: number | number[],
    note: string,
    opts: { i?: number; length?: number; hit?: boolean; back?: boolean } = {},
  ) => {
    const pattern: Cell[] = p.map((ch, k) => {
      let state: Cell['state'] = 'idle'
      if (k === opts.length) state = opts.back ? 'bad' : 'window'
      if (k === opts.i) state = opts.hit ? 'good' : 'active'
      return { value: ch, state, note: k < (opts.i ?? 0) || k === opts.i ? String(lps[k]!) : undefined }
    })
    const patternPointers: Pointer[] = []
    if (opts.i !== undefined) patternPointers.push({ name: 'i', index: opts.i, tone: 'accent' })
    if (opts.length !== undefined && opts.length < p.length)
      patternPointers.push({ name: 'length', index: opts.length, side: 'bottom', tone: 'warn' })
    frames.push({
      line,
      note,
      vars: { 段階: 'lps を作る', i: opts.i ?? '−', length: opts.length ?? 0 },
      view: { phase: 'build', pattern, patternPointers, text: [], textPointers: [], aligned: [] },
    })
  }

  buildSnap([2, 3], `まず pattern だけを見て lps を作る。lps[i] は「pattern の先頭 i+1 文字の中で、接頭辞と接尾辞が一致する最大の長さ」`, {
    length: 0,
  })

  let length = 0
  for (let i = 1; i < p.length; i++) {
    while (length > 0 && p[i] !== p[length]) {
      buildSnap([5, 6], `pattern[${i}] = '${p[i]}' と pattern[${length}] = '${p[length]}' が違う。lps[${length - 1}] = ${lps[length - 1]} へ戻して、もっと短い候補を試す`, {
        i,
        length,
        back: true,
      })
      length = lps[length - 1]!
    }
    if (p[i] === p[length]) {
      length += 1
      buildSnap([7, 8], `pattern[${i}] = '${p[i]}' と pattern[${length - 1}] = '${p[length - 1]}' が一致。length を ${length} に伸ばす`, {
        i,
        length: length - 1,
        hit: true,
      })
    }
    lps[i] = length
    buildSnap(9, `lps[${i}] = ${length}`, { i, length })
  }
  buildSnap(10, `lps = [${lps.join(', ')}] が完成。ここまで text は一度も見ていない`, {})

  // --- search ---
  const searchSnap = (
    line: number | number[],
    note: string,
    opts: { i?: number; length: number; hit?: boolean; back?: boolean; found?: number; finished?: boolean } = {
      length: 0,
    },
  ) => {
    const start = (opts.i ?? 0) - opts.length
    const textCells: Cell[] = t.map((ch, k) => {
      let state: Cell['state'] = 'idle'
      if (opts.found !== undefined && k >= opts.found && k < opts.found + p.length) state = 'good'
      else if (k >= start && k < (opts.i ?? 0)) state = 'window'
      if (k === opts.i) state = opts.hit ? 'good' : opts.back ? 'bad' : 'active'
      return { value: ch, state }
    })
    const aligned: Cell[] = [
      ...Array.from({ length: Math.max(start, 0) }, (): Cell => ({ value: ' ', state: 'idle' })),
      ...p.map((ch, k): Cell => ({
        value: ch,
        state: k < opts.length ? 'window' : k === opts.length ? (opts.hit ? 'good' : 'active') : 'idle',
      })),
    ]
    frames.push({
      line,
      note,
      vars: {
        段階: '探索',
        i: opts.i ?? '−',
        length: opts.length,
        一致開始: start >= 0 ? start : '−',
      },
      view: {
        phase: 'search',
        pattern: [],
        patternPointers: [],
        text: textCells,
        textPointers: opts.i !== undefined ? [{ name: 'i', index: opts.i, tone: 'accent' }] : [],
        aligned,
      },
      done: opts.finished,
    })
  }

  length = 0
  searchSnap([13, 14], `ここから text を左から1文字ずつ見る。length は「いま何文字ぶん一致しているか」`, { length: 0 })

  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!
    while (length > 0 && ch !== p[length]) {
      searchSnap([16, 17], `text[${i}] = '${ch}' は pattern[${length}] = '${p[length]}' と違う。lps[${length - 1}] = ${lps[length - 1]} まで戻す。text の i は戻さないのがこの型の肝`, {
        i,
        length,
        back: true,
      })
      length = lps[length - 1]!
    }
    if (ch === p[length]) {
      length += 1
      searchSnap([18, 19], `text[${i}] = '${ch}' が pattern[${length - 1}] と一致。length = ${length}`, {
        i,
        length,
        hit: true,
      })
    } else {
      searchSnap([18], `text[${i}] = '${ch}' は pattern[0] とも違う。length は 0 のまま`, { i, length })
    }
    if (length === p.length) {
      searchSnap([20, 21], `${p.length} 文字すべて一致。開始位置は ${i - length + 1}`, {
        i,
        length,
        found: i - length + 1,
        finished: true,
      })
      return frames
    }
  }
  searchSnap(22, `text を最後まで見たが見つからなかった。−1 を返す`, { length, finished: true })
  return frames
}

const PRESETS = [
  { name: 'aabaaabaaac / aabaaac', value: { text: 'aabaaabaaac', pattern: 'aabaaac' } },
  { name: 'sadbutsad / sad', value: { text: 'sadbutsad', pattern: 'sad' } },
  { name: 'aaaaab / aaab', value: { text: 'aaaaab', pattern: 'aaab' } },
  { name: '見つからない', value: { text: 'leetcode', pattern: 'leeto' } },
]

export default function KmpSearch() {
  const [text, setText] = useState('aabaaabaaac')
  const [pattern, setPattern] = useState('aabaaac')
  const frames = useMemo(
    () => trace(text.slice(0, 16) || 'a', pattern.slice(0, 8) || 'a'),
    [text, pattern],
  )

  return (
    <SimShell
      title="KMP（一致した長さを覚えて、戻らずに進む）"
      subtitle="pattern だけから lps を作り、不一致のときに text を戻さず pattern だけをずらす。O(N + M)"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="text =" value={text} onChange={setText} width={150} />
          <TextControl label="pattern =" value={pattern} onChange={setPattern} width={110} />
          <PresetControl
            presets={PRESETS}
            onPick={(v) => {
              setText(v.text)
              setPattern(v.pattern)
            }}
          />
        </>
      }
      legend={
        <>
          <LegendItem state="active">いま比べている文字</LegendItem>
          <LegendItem state="window">一致している部分</LegendItem>
          <LegendItem state="bad">不一致で戻すところ</LegendItem>
          <LegendItem state="good">一致</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-4">
          {f.view.phase === 'build' ? (
            <div>
              <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                pattern（下の数字が lps）
              </p>
              <ArrayView cells={f.view.pattern} pointers={f.view.patternPointers} size={40} />
            </div>
          ) : (
            <>
              <div>
                <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                  text
                </p>
                <ArrayView cells={f.view.text} pointers={f.view.textPointers} size={36} />
              </div>
              <div>
                <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                  pattern（text に重ねた位置）
                </p>
                <ArrayView cells={f.view.aligned} showIndex={false} size={36} />
              </div>
            </>
          )}
        </div>
      )}
    </SimShell>
  )
}
