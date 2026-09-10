import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl, TextControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def is_palindrome(s: str) -> bool:
    left, right = 0, len(s) - 1
    while left < right:
        if s[left] != s[right]:
            return False
        left += 1
        right -= 1
    return True`

type View = { cells: Cell[]; pointers: Pointer[] }

function trace(s: string): Frame<View>[] {
  const chars = [...s]
  const frames: Frame<View>[] = []
  const snap = (
    left: number,
    right: number,
    line: number | number[],
    note: string,
    opts: { hit?: 'ok' | 'ng'; finished?: boolean } = {},
  ) => {
    const cells: Cell[] = chars.map((ch, i) => {
      let state: Cell['state'] = 'idle'
      if (i < left || i > right) state = 'good' // すでに一致確認済み
      if (i === left || i === right) state = opts.hit === 'ng' ? 'bad' : 'active'
      if (opts.finished && opts.hit !== 'ng') state = 'good'
      return { value: ch, state }
    })
    frames.push({
      line,
      note,
      vars: { left, right, 's[left]': chars[left] ?? '−', 's[right]': chars[right] ?? '−' },
      view: {
        cells,
        pointers: [
          { name: 'left', index: left, tone: 'accent' },
          { name: 'right', index: right, side: 'bottom', tone: 'warn' },
        ],
      },
      done: opts.finished,
    })
  }

  let left = 0
  let right = chars.length - 1
  snap(left, right, 2, `両端にポインタを置く。left=0, right=${right}`)

  while (left < right) {
    snap(left, right, 3, `left(${left}) < right(${right}) なのでループ継続`)
    if (chars[left] !== chars[right]) {
      snap(left, right, [4, 5], `'${chars[left]}' ≠ '${chars[right]}' → 回文ではない。即 False`, {
        hit: 'ng',
        finished: true,
      })
      return frames
    }
    snap(left, right, 4, `'${chars[left]}' == '${chars[right]}' なので一致。内側へ進む`)
    left += 1
    right -= 1
    snap(left, right, [6, 7], `left=${left}, right=${right} に更新`)
  }
  snap(left, right, [3, 8], 'left >= right。全ペアが一致したので True', { finished: true })
  return frames
}

const PRESETS = [
  { name: 'level', value: 'level' },
  { name: 'racecar', value: 'racecar' },
  { name: 'abccba', value: 'abccba' },
  { name: 'interviewcat', value: 'interviewcat' },
]

export default function ValidPalindrome() {
  const [raw, setRaw] = useState('racecar')
  const s = raw.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14) || 'a'
  const frames = useMemo(() => trace(s), [s])

  return (
    <SimShell
      title="Valid Palindrome（逆方向 Two Pointers）"
      subtitle="両端から中央へ。1文字でも食い違えば即終了"
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
          <LegendItem state="active">比較中</LegendItem>
          <LegendItem state="good">一致済み</LegendItem>
          <LegendItem state="bad">不一致</LegendItem>
        </>
      }
    >
      {(f) => <ArrayView cells={f.view.cells} pointers={f.view.pointers} size={38} />}
    </SimShell>
  )
}
