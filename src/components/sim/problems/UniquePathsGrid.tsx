import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl } from '../core/Controls'
import { GridView } from '../views/GridView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `def unique_paths(m, n):
    # dp[i][j]: (0,0) から (i,j) までの道のりの数
    dp = [[1] * n for _ in range(m)]   # 一番上の行と一番左の列は必ず1通り
    for i in range(1, m):
        for j in range(1, n):
            dp[i][j] = dp[i - 1][j] + dp[i][j - 1]  # 上から来るか、左から来るか
    return dp[-1][-1]`

type View = { grid: Cell[][]; cursor: [number, number] | null }

function trace(m: number, n: number): Frame<View>[] {
  const dp: number[][] = Array.from({ length: m }, () => Array(n).fill(0))
  const frames: Frame<View>[] = []

  const snap = (cursor: [number, number] | null, line: number | number[], note: string, finished = false) => {
    const grid: Cell[][] = dp.map((row, i) =>
      row.map<Cell>((v, j) => ({
        value: v === 0 ? '·' : v,
        state: v === 0 ? 'idle' : i === 0 || j === 0 ? 'dim' : 'good',
      })),
    )
    if (cursor) grid[cursor[0]]![cursor[1]] = { ...grid[cursor[0]]![cursor[1]]!, state: 'active' }
    frames.push({ line, note, vars: {}, view: { grid, cursor }, done: finished })
  }

  for (let i = 0; i < m; i++) dp[i]![0] = 1
  for (let j = 0; j < n; j++) dp[0]![j] = 1
  snap(null, [2, 3], '一番上の行と一番左の列は、まっすぐ進むしかないので必ず1通り')

  for (let i = 1; i < m; i++) {
    for (let j = 1; j < n; j++) {
      dp[i]![j] = dp[i - 1]![j]! + dp[i]![j - 1]!
      snap(
        [i, j],
        [4, 5],
        `(${i},${j}) には「上の(${i - 1},${j})から来る道」と「左の(${i},${j - 1})から来る道」の2通りしかない。dp[${i}][${j}] = ${dp[i - 1]![j]} + ${dp[i]![j - 1]} = ${dp[i]![j]}`,
      )
    }
  }
  snap([m - 1, n - 1], 6, `右下 (${m - 1},${n - 1}) の道のりの数は ${dp[m - 1]![n - 1]}`, true)
  return frames
}

const PRESETS = [
  { name: '3x7', value: { m: 3, n: 7 } },
  { name: '3x3', value: { m: 3, n: 3 } },
  { name: '1本道 1x5', value: { m: 1, n: 5 } },
]

export default function UniquePathsGrid() {
  const [m, setM] = useState(3)
  const [n, setN] = useState(4)
  const mm = Math.max(1, Math.min(m, 6))
  const nn = Math.max(1, Math.min(n, 8))
  const frames = useMemo(() => trace(mm, nn), [mm, nn])

  return (
    <SimShell
      title="Unique Paths（グリッド上の二次元 DP）"
      subtitle="右下のマスへの道のりは「上から来る」+「左から来る」の2択しかない"
      code={CODE}
      frames={frames}
      controls={
        <>
          <NumberControl label="行 m =" value={m} onChange={setM} min={1} />
          <NumberControl label="列 n =" value={n} onChange={setN} min={1} />
          <PresetControl
            presets={PRESETS}
            onPick={(v) => {
              setM(v.m)
              setN(v.n)
            }}
          />
        </>
      }
      legend={
        <>
          <LegendItem state="dim">1通り（端）</LegendItem>
          <LegendItem state="active">今計算しているマス</LegendItem>
          <LegendItem state="good">計算済み</LegendItem>
        </>
      }
    >
      {(f) => <GridView grid={f.view.grid} cursor={f.view.cursor} cellSize={36} />}
    </SimShell>
  )
}
