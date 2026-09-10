import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl, TextControl } from '../core/Controls'
import { GridView } from '../views/GridView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `def longest_common_subsequence(text1, text2):
    m, n = len(text1), len(text2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if text1[i - 1] == text2[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1   # 文字が一致。斜め上から+1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])  # 一致しない。上か左の良い方
    return dp[m][n]`

type View = { grid: Cell[][]; cursor: [number, number] | null }

/** dp[i][j] は augmented grid では [i+1][j+1] の位置になる（ヘッダー行・列があるため） */
function trace(text1: string, text2: string): Frame<View>[] {
  const m = text1.length
  const n = text2.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  const frames: Frame<View>[] = []

  const buildGrid = (cursor: [number, number] | null): Cell[][] => {
    const grid: Cell[][] = []
    const header: Cell[] = [{ value: ' ', state: 'idle' }, { value: '∅', state: 'dim' }]
    for (const ch of text2) header.push({ value: ch, state: 'dim' })
    grid.push(header)
    for (let i = 0; i <= m; i++) {
      const row: Cell[] = [{ value: i === 0 ? '∅' : text1[i - 1]!, state: 'dim' }]
      for (let j = 0; j <= n; j++) {
        const isCursor = cursor && cursor[0] === i && cursor[1] === j
        row.push({ value: dp[i]![j]!, state: isCursor ? 'active' : dp[i]![j]! > 0 ? 'good' : 'idle' })
      }
      grid.push(row)
    }
    return grid
  }

  const snap = (cursor: [number, number] | null, line: number | number[], note: string, finished = false) => {
    frames.push({ line, note, vars: {}, view: { grid: buildGrid(cursor), cursor }, done: finished })
  }

  snap(null, [2, 3], `dp[i][j] を「text1 の最初 i 文字」と「text2 の最初 j 文字」の LCS の長さと定義。端は0文字なので0`)

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (text1[i - 1] === text2[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1
        snap([i, j], [6, 7], `text1[${i - 1}]='${text1[i - 1]}' と text2[${j - 1}]='${text2[j - 1]}' が一致。斜め上の dp[${i - 1}][${j - 1}]=${dp[i - 1]![j - 1]} に +1`)
      } else {
        const up = dp[i - 1]![j]!
        const left = dp[i]![j - 1]!
        dp[i]![j] = Math.max(up, left)
        snap([i, j], [8, 9], `'${text1[i - 1]}' と '${text2[j - 1]}' は不一致。上(${up})と左(${left})の大きい方 ${dp[i]![j]} を採用`)
      }
    }
  }
  snap([m, n], 10, `右下 dp[${m}][${n}] = ${dp[m]![n]} が答え（最長共通部分列の長さ）`, true)
  return frames
}

const PRESETS = [
  { name: 'abcde / ace', value: { a: 'abcde', b: 'ace' } },
  { name: 'abc / abc', value: { a: 'abc', b: 'abc' } },
  { name: '共通部分なし', value: { a: 'abc', b: 'def' } },
]

export default function LongestCommonSubsequence() {
  const [a, setA] = useState('abcde')
  const [b, setB] = useState('ace')
  const text1 = a.replace(/[^a-zA-Z]/g, '').slice(0, 7) || 'a'
  const text2 = b.replace(/[^a-zA-Z]/g, '').slice(0, 7) || 'a'
  const frames = useMemo(() => trace(text1, text2), [text1, text2])

  return (
    <SimShell
      title="Longest Common Subsequence（文字列2本の二次元 DP）"
      subtitle="dp[i][j] は「text1の最初i文字」×「text2の最初j文字」の表。一致すれば斜め上+1、しなければ上と左の大きい方"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="text1 =" value={a} onChange={setA} width={120} />
          <TextControl label="text2 =" value={b} onChange={setB} width={100} />
          <PresetControl
            presets={PRESETS}
            onPick={(v) => {
              setA(v.a)
              setB(v.b)
            }}
          />
        </>
      }
      legend={
        <>
          <LegendItem state="dim">見出し（文字）</LegendItem>
          <LegendItem state="active">今計算しているマス</LegendItem>
          <LegendItem state="good">0より大きい値</LegendItem>
        </>
      }
    >
      {(f) => <GridView grid={f.view.grid} cursor={null} cellSize={32} />}
    </SimShell>
  )
}
