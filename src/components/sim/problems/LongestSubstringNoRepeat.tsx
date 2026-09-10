import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl, TextControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def length_of_longest_substring(s):
    last = {}          # 文字 -> 最後に見た index
    left = 0
    best = 0
    for right, ch in enumerate(s):
        if ch in last and last[ch] >= left:
            left = last[ch] + 1    # 重複をウィンドウの外へ追い出す
        last[ch] = right
        best = max(best, right - left + 1)
    return best`

type View = { cells: Cell[]; pointers: Pointer[]; last: [string, number][]; bestRange: [number, number] | null }

function trace(s: string): Frame<View>[] {
  const chars = [...s]
  const frames: Frame<View>[] = []
  const last = new Map<string, number>()
  let left = 0
  let best = 0
  let bestRange: [number, number] | null = null

  const snap = (
    right: number,
    line: number | number[],
    note: string,
    opts: { dup?: number; finished?: boolean } = {},
  ) => {
    const cells: Cell[] = chars.map((ch, i) => {
      let state: Cell['state'] = 'idle'
      if (i < left) state = 'dim'
      else if (i <= right) state = 'window'
      if (i === right) state = 'active'
      if (i === opts.dup) state = 'bad'
      if (opts.finished && bestRange && i >= bestRange[0] && i <= bestRange[1]) state = 'good'
      return { value: ch, state }
    })
    frames.push({
      line,
      note,
      vars: {
        left,
        right,
        幅: right >= left ? right - left + 1 : 0,
        best,
      },
      view: {
        cells,
        pointers: [
          { name: 'left', index: left, tone: 'accent' },
          { name: 'right', index: right, side: 'bottom', tone: 'warn' },
        ],
        last: [...last.entries()],
        bestRange,
      },
      done: opts.finished,
    })
  }

  for (let right = 0; right < chars.length; right++) {
    const ch = chars[right]!
    snap(right, 5, `right=${right}、新しい文字 '${ch}' を見る`)
    const prev = last.get(ch)
    if (prev !== undefined && prev >= left) {
      snap(right, [6, 7], `'${ch}' は index ${prev} にもある（ウィンドウ内）。left を ${prev + 1} まで飛ばして重複を追い出す`, {
        dup: prev,
      })
      left = prev + 1
    } else {
      snap(right, 6, `'${ch}' はウィンドウ内に無い。left は動かさない`)
    }
    last.set(ch, right)
    const width = right - left + 1
    const prevBest = best
    if (width > best) {
      best = width
      bestRange = [left, right]
    }
    snap(
      right,
      [8, 9],
      width > prevBest
        ? `ウィンドウ [${left}, ${right}] は幅 ${width}。best を ${prevBest} → ${best} に更新`
        : `幅 ${width} は best(${best}) 以下。更新なし`,
    )
  }
  snap(chars.length - 1, 10, `答え: ${best}（例: "${bestRange ? chars.slice(bestRange[0], bestRange[1] + 1).join('') : ''}"）`, {
    finished: true,
  })
  return frames
}

const PRESETS = [
  { name: 'abcabcbb', value: 'abcabcbb' },
  { name: 'pwwkew', value: 'pwwkew' },
  { name: 'bbbbb', value: 'bbbbb' },
  { name: 'tmmzuxt', value: 'tmmzuxt' },
]

export default function LongestSubstringNoRepeat() {
  const [raw, setRaw] = useState('abcabcbb')
  const s = raw.replace(/\s/g, '').slice(0, 14) || 'a'
  const frames = useMemo(() => trace(s), [s])

  return (
    <SimShell
      title="Longest Substring Without Repeating Characters（可変長 Sliding Window）"
      subtitle="right を進め、制約が壊れたら left を「飛ばして」直す。left は戻らないので O(N)"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="s =" value={raw} onChange={setRaw} width={180} />
          <PresetControl presets={PRESETS} onPick={setRaw} />
        </>
      }
      legend={
        <>
          <LegendItem state="window">ウィンドウ内</LegendItem>
          <LegendItem state="active">right</LegendItem>
          <LegendItem state="bad">重複した位置</LegendItem>
          <LegendItem state="dim">追い出し済み</LegendItem>
        </>
      }
    >
      {(f) => (
        <div>
          <ArrayView cells={f.view.cells} pointers={f.view.pointers} size={38} />
          <div className="mt-3 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            last = {'{'}
            {f.view.last.map(([k, v], i) => (
              <span key={k}>
                {i > 0 && ', '}
                {k}:{v}
              </span>
            ))}
            {'}'}
          </div>
        </div>
      )}
    </SimShell>
  )
}
