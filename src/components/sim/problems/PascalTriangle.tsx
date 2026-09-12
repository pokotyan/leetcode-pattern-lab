import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl } from '../core/Controls'
import { GridView } from '../views/GridView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `def binomial_table(n):
    C = [[0] * (n + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        C[i][0] = 1                             # 何も選ばない方法は1通り
        for j in range(1, i + 1):
            C[i][j] = C[i-1][j-1] + C[i-1][j]   # i 番目を選ぶ + 選ばない
    return C`

type View = { grid: Cell[][] }

function trace(n: number): Frame<View>[] {
  const C: number[][] = Array.from({ length: n + 1 }, () => Array<number>(n + 1).fill(0))
  const frames: Frame<View>[] = []

  const snap = (
    line: number | number[],
    note: string,
    opts: { cur?: [number, number]; refs?: [number, number][]; finished?: boolean } = {},
  ) => {
    const refs = new Set((opts.refs ?? []).map(([a, b]) => `${a},${b}`))
    const grid: Cell[][] = [
      [
        { value: 'n\\r', state: 'dim' },
        ...Array.from({ length: n + 1 }, (_, j): Cell => ({ value: j, state: 'dim' })),
      ],
      ...C.map((row, i) => [
        { value: i, state: 'dim' as Cell['state'] },
        ...row.map((v, j): Cell => {
          let state: Cell['state'] = j > i ? 'dim' : v === 0 ? 'idle' : 'window'
          if (refs.has(`${i},${j}`)) state = 'active'
          if (opts.cur && opts.cur[0] === i && opts.cur[1] === j) state = 'good'
          return { value: j > i ? '' : v, state }
        }),
      ]),
    ]
    frames.push({
      line,
      note,
      vars: { n: opts.cur ? opts.cur[0] : '−', r: opts.cur ? opts.cur[1] : '−' },
      view: { grid },
      done: opts.finished,
    })
  }

  snap(2, `C[n][r] は「n 個から r 個を選ぶ方法の数」。右上（r > n）は選びようがないので使わない`)

  for (let i = 0; i <= n; i++) {
    C[i]![0] = 1
    snap(4, `C[${i}][0] = 1。${i} 個から0個を選ぶ方法は「何も選ばない」の1通りだけ`, { cur: [i, 0] })
    for (let j = 1; j <= i; j++) {
      C[i]![j] = C[i - 1]![j - 1]! + C[i - 1]![j]!
      snap([5, 6], `C[${i}][${j}] = C[${i - 1}][${j - 1}] + C[${i - 1}][${j}] = ${C[i - 1]![j - 1]} + ${C[i - 1]![j]} = ${C[i]![j]}。${i} 番目を選ぶ場合と選ばない場合に分けて足している`, {
        cur: [i, j],
        refs: [[i - 1, j - 1], [i - 1, j]],
      })
    }
  }
  snap(7, `完成。各行の合計が 2^n になっていることも確かめてみてください`, { finished: true })
  return frames
}

const PRESETS = [
  { name: 'n = 6', value: 6 },
  { name: 'n = 4', value: 4 },
  { name: 'n = 8', value: 8 },
]

export default function PascalTriangle() {
  const [n, setN] = useState(6)
  const nn = Math.min(Math.max(Math.trunc(n), 1), 9)
  const frames = useMemo(() => trace(nn), [nn])

  return (
    <SimShell
      title="パスカルの三角形（二項係数を足し算だけで作る）"
      subtitle="C(n, r) = C(n-1, r-1) + C(n-1, r)。割り算も階乗も使わずに表が埋まる"
      code={CODE}
      frames={frames}
      controls={
        <>
          <NumberControl label="n =" value={n} onChange={setN} min={1} max={9} />
          <PresetControl presets={PRESETS} onPick={setN} />
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
      {(f) => <GridView grid={f.view.grid} cellSize={40} />}
    </SimShell>
  )
}
