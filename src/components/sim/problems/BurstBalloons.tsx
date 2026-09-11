import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl, TextControl, parseNums } from '../core/Controls'
import { GridView } from '../views/GridView'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `def max_coins(nums):
    vals = [1] + nums + [1]           # 両端に 1 を足して境界を消す
    n = len(vals)
    dp = [[0] * n for _ in range(n)]
    for length in range(2, n):        # 区間の幅を、狭いほうから広げていく
        for i in range(n - length):
            j = i + length            # 開区間 (i, j)。両端は割らずに残す
            for k in range(i + 1, j): # k を「この区間で最後に割る風船」に決める
                gain = vals[i] * vals[k] * vals[j]
                dp[i][j] = max(dp[i][j], dp[i][k] + gain + dp[k][j])
    return dp[0][n - 1]`

type View = { grid: Cell[][]; vals: Cell[]; answer: number }

function trace(nums: number[]): Frame<View>[] {
  const vals = [1, ...nums, 1]
  const n = vals.length
  const dp: number[][] = Array.from({ length: n }, () => Array<number>(n).fill(0))
  const frames: Frame<View>[] = []

  const snap = (
    line: number | number[],
    note: string,
    opts: { cur?: [number, number]; k?: number; refs?: [number, number][]; finished?: boolean } = {},
  ) => {
    const refs = new Set((opts.refs ?? []).map(([a, b]) => `${a},${b}`))
    const grid: Cell[][] = [
      [
        { value: 'i\\j', state: 'dim' },
        ...vals.map((_, j): Cell => ({ value: `${j}`, state: 'dim' })),
      ],
      ...dp.map((row, i) => [
        { value: `${i}`, state: 'dim' as Cell['state'] },
        ...row.map((v, j): Cell => {
          let state: Cell['state'] = j <= i + 1 ? 'dim' : v === 0 ? 'idle' : 'window'
          if (refs.has(`${i},${j}`)) state = 'active'
          if (opts.cur && opts.cur[0] === i && opts.cur[1] === j) state = 'good'
          return { value: j <= i + 1 ? '' : v, state }
        }),
      ]),
    ]
    const valCells: Cell[] = vals.map((v, i) => {
      let state: Cell['state'] = 'idle'
      if (opts.cur && (i === opts.cur[0] || i === opts.cur[1])) state = 'window'
      if (i === opts.k) state = 'active'
      if (i === 0 || i === n - 1) state = 'dim'
      return { value: v, state }
    })
    frames.push({
      line,
      note,
      vars: {
        区間: opts.cur ? `(${opts.cur[0]}, ${opts.cur[1]})` : '−',
        最後に割る: opts.k ?? '−',
        答え: dp[0]![n - 1]!,
      },
      view: { grid, vals: valCells, answer: dp[0]![n - 1]! },
      done: opts.finished,
    })
  }

  snap([2, 4], `両端に 1 を足して vals = [${vals.join(', ')}] にする。dp[i][j] は「開区間 (i, j) の中の風船を全部割ったときの最大コイン」。両端 i と j は割らずに残す`)

  for (let length = 2; length < n; length++) {
    for (let i = 0; i + length < n; i++) {
      const j = i + length
      for (let k = i + 1; k < j; k++) {
        const gain = vals[i]! * vals[k]! * vals[j]!
        const cand = dp[i]![k]! + gain + dp[k]![j]!
        if (cand > dp[i]![j]!) {
          dp[i]![j] = cand
          snap([8, 9], `区間 (${i}, ${j}) で、最後に割るのを ${k} 番目（値 ${vals[k]}）に決める。左 dp[${i}][${k}]=${dp[i]![k]} + ${vals[i]}×${vals[k]}×${vals[j]}=${gain} + 右 dp[${k}][${j}]=${dp[k]![j]} = ${cand}。更新`, {
            cur: [i, j],
            k,
            refs: [[i, k], [k, j]],
          })
        } else {
          snap([8, 9], `区間 (${i}, ${j}) で ${k} を最後にすると ${cand}。いまの ${dp[i]![j]} を超えないので採らない`, {
            cur: [i, j],
            k,
            refs: [[i, k], [k, j]],
          })
        }
      }
    }
  }
  snap(10, `完了。答えは dp[0][${n - 1}] = ${dp[0]![n - 1]}`, { cur: [0, n - 1], finished: true })
  return frames
}

const PRESETS = [
  { name: 'LC312の例', value: '3, 1, 5, 8' },
  { name: '2個', value: '1, 5' },
  { name: '同じ値', value: '2, 2, 2' },
]

export default function BurstBalloons() {
  const [raw, setRaw] = useState('3, 1, 5, 8')
  const nums = useMemo(() => parseNums(raw, [3, 1, 5, 8]).slice(0, 4), [raw])
  const frames = useMemo(() => trace(nums), [nums])

  return (
    <SimShell
      title="Burst Balloons（最後に割る1個を決める区間 DP）"
      subtitle="「最初に割る風船」では左右が独立しない。「最後に割る風船」を決めると、左右が別々の区間になる"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="nums =" value={raw} onChange={setRaw} width={140} />
          <PresetControl presets={PRESETS} onPick={setRaw} />
        </>
      }
      legend={
        <>
          <LegendItem state="good">いま更新したマス</LegendItem>
          <LegendItem state="active">参照したマス / 最後に割る風船</LegendItem>
          <LegendItem state="window">埋め終わったマス / 区間の両端</LegendItem>
          <LegendItem state="dim">使わないマス</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              vals（両端に 1 を足したもの）
            </p>
            <ArrayView cells={f.view.vals} size={38} />
          </div>
          <GridView grid={f.view.grid} cellSize={38} />
        </div>
      )}
    </SimShell>
  )
}
