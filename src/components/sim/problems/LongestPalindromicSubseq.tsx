import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl, TextControl } from '../core/Controls'
import { GridView } from '../views/GridView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `def longest_palindrome_subseq(s):
    n = len(s)
    dp = [[0] * n for _ in range(n)]
    for i in range(n - 1, -1, -1):     # i は右から左へ
        dp[i][i] = 1                   # 1文字はそれ自体が回文
        for j in range(i + 1, n):
            if s[i] == s[j]:
                dp[i][j] = dp[i + 1][j - 1] + 2
            else:
                dp[i][j] = max(dp[i + 1][j], dp[i][j - 1])
    return dp[0][n - 1]`

type View = { grid: Cell[][]; answer: string }

function trace(s: string): Frame<View>[] {
  const n = s.length
  const dp: number[][] = Array.from({ length: n }, () => Array<number>(n).fill(0))
  const frames: Frame<View>[] = []

  const snap = (
    line: number | number[],
    note: string,
    opts: { cur?: [number, number]; refs?: [number, number][]; finished?: boolean } = {},
  ) => {
    const refs = new Set((opts.refs ?? []).map(([a, b]) => `${a},${b}`))
    const grid: Cell[][] = [
      [
        { value: 'i\\j', state: 'dim' },
        ...[...s].map((ch, j): Cell => ({ value: `${ch}${j}`, state: 'dim' })),
      ],
      ...dp.map((row, i) => [
        { value: `${s[i]}${i}`, state: 'dim' as Cell['state'] },
        ...row.map((v, j): Cell => {
          let state: Cell['state'] = j < i ? 'dim' : v === 0 ? 'idle' : 'window'
          if (refs.has(`${i},${j}`)) state = 'active'
          if (opts.cur && opts.cur[0] === i && opts.cur[1] === j) state = 'good'
          return { value: j < i ? '' : v, state }
        }),
      ]),
    ]
    frames.push({
      line,
      note,
      vars: {
        i: opts.cur ? opts.cur[0] : '−',
        j: opts.cur ? opts.cur[1] : '−',
        答え: dp[0]?.[n - 1] ?? 0,
      },
      view: { grid, answer: String(dp[0]?.[n - 1] ?? 0) },
      done: opts.finished,
    })
  }

  snap(3, `dp[i][j] は「s の i 文字目から j 文字目までの中で、最長の回文部分列の長さ」。左下（j < i）は使わない`)

  for (let i = n - 1; i >= 0; i--) {
    dp[i]![i] = 1
    snap(5, `dp[${i}][${i}] = 1。1文字だけの区間は、それ自体が長さ1の回文`, { cur: [i, i] })
    for (let j = i + 1; j < n; j++) {
      if (s[i] === s[j]) {
        dp[i]![j] = dp[i + 1]![j - 1]! + 2
        snap([7, 8], `s[${i}] と s[${j}] はどちらも '${s[i]}'。両端をそのまま使えるので、1つ内側の dp[${i + 1}][${j - 1}] = ${dp[i + 1]![j - 1]} に 2 を足して ${dp[i]![j]}`, {
          cur: [i, j],
          refs: [[i + 1, j - 1]],
        })
      } else {
        dp[i]![j] = Math.max(dp[i + 1]![j]!, dp[i]![j - 1]!)
        snap([9, 10], `s[${i}] = '${s[i]}' と s[${j}] = '${s[j]}' は違う。左端を諦めた dp[${i + 1}][${j}] = ${dp[i + 1]![j]} と、右端を諦めた dp[${i}][${j - 1}] = ${dp[i]![j - 1]} の大きいほうで ${dp[i]![j]}`, {
          cur: [i, j],
          refs: [[i + 1, j], [i, j - 1]],
        })
      }
    }
  }
  snap(11, `完了。答えは dp[0][${n - 1}] = ${dp[0]![n - 1]}（"${s}" の最長回文部分列の長さ）`, {
    cur: [0, n - 1],
    finished: true,
  })
  return frames
}

const PRESETS = [
  { name: 'bbbab', value: 'bbbab' },
  { name: 'cbbd', value: 'cbbd' },
  { name: 'agbdba', value: 'agbdba' },
  { name: 'abcde', value: 'abcde' },
]

export default function LongestPalindromicSubseq() {
  const [raw, setRaw] = useState('bbbab')
  const s = useMemo(() => (raw.replace(/\s/g, '').slice(0, 7) || 'bbbab'), [raw])
  const frames = useMemo(() => trace(s), [s])

  return (
    <SimShell
      title="Longest Palindromic Subsequence（区間 DP の基本形）"
      subtitle="dp[i][j] は区間 [i, j] の答え。内側の短い区間から埋めて、外側へ広げていく"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="s =" value={raw} onChange={setRaw} width={140} />
          <PresetControl presets={PRESETS} onPick={setRaw} />
        </>
      }
      legend={
        <>
          <LegendItem state="good">いま埋めたマス</LegendItem>
          <LegendItem state="active">参照したマス</LegendItem>
          <LegendItem state="window">埋め終わったマス</LegendItem>
          <LegendItem state="dim">使わないマス</LegendItem>
        </>
      }
    >
      {(f) => <GridView grid={f.view.grid} cellSize={38} />}
    </SimShell>
  )
}
