import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl, TextControl, parseNums } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def count_smaller(nums):
    ranks = {v: i + 1 for i, v in enumerate(sorted(set(nums)))}   # 値 -> 1始まりの順位
    tree = [0] * (len(ranks) + 1)

    def add(i):
        while i < len(tree):
            tree[i] += 1
            i += i & -i

    def count(i):                      # 順位 1..i の個数
        s = 0
        while i > 0:
            s += tree[i]
            i -= i & -i
        return s

    ans = [0] * len(nums)
    for k in range(len(nums) - 1, -1, -1):   # 右から左へ見ていく
        r = ranks[nums[k]]
        ans[k] = count(r - 1)          # すでに入れた中で、自分より小さい値の個数
        add(r)                         # 自分を入れる
    return ans`

const lowbit = (i: number) => i & -i

type View = { nums: Cell[]; tree: Cell[]; ans: Cell[]; pointers: Pointer[] }

function trace(nums: number[]): Frame<View>[] {
  const sorted = [...new Set(nums)].sort((a, b) => a - b)
  const rank = new Map(sorted.map((v, i) => [v, i + 1]))
  const size = sorted.length
  const tree = Array<number>(size + 1).fill(0)
  const ans = Array<number | '·'>(nums.length).fill('·')
  const frames: Frame<View>[] = []

  const snap = (
    line: number | number[],
    note: string,
    opts: { k?: number; touched?: number[]; sum?: number; hit?: boolean; finished?: boolean } = {},
  ) => {
    const touched = new Set(opts.touched ?? [])
    const numCells: Cell[] = nums.map((v, i) => ({
      value: v,
      state: i === opts.k ? 'active' : opts.k !== undefined && i > opts.k ? 'window' : 'idle',
    }))
    const treeCells: Cell[] = tree.slice(1).map((v, i) => {
      const idx = i + 1
      return {
        value: v,
        state: touched.has(idx) ? 'good' : 'idle',
        note: `${sorted[i]}`,
      }
    })
    const ansCells: Cell[] = ans.map((v, i) => ({
      value: v,
      state: v === '·' ? 'idle' : i === opts.k && opts.hit ? 'good' : 'window',
    }))
    frames.push({
      line,
      note,
      vars: {
        k: opts.k ?? '−',
        値: opts.k !== undefined ? nums[opts.k]! : '−',
        順位: opts.k !== undefined ? rank.get(nums[opts.k]!)! : '−',
        個数: opts.sum ?? '−',
      },
      view: {
        nums: numCells,
        tree: treeCells,
        ans: ansCells,
        pointers: opts.k !== undefined ? [{ name: 'k', index: opts.k, tone: 'accent' }] : [],
      },
      done: opts.finished,
    })
  }

  snap([2, 3], `値を小さい順に並べて順位を振る。${sorted.map((v, i) => `${v}→${i + 1}`).join(' / ')}。BIT のマスは「その順位の値が何個入っているか」を数える`)

  for (let k = nums.length - 1; k >= 0; k--) {
    const r = rank.get(nums[k]!)!
    let i = r - 1
    let s = 0
    const touched: number[] = []
    while (i > 0) {
      s += tree[i]!
      touched.push(i)
      i -= lowbit(i)
    }
    ans[k] = s
    snap([19, 20], `nums[${k}] = ${nums[k]}（順位 ${r}）。すでに入れてある「右側の値」のうち、順位 ${r - 1} までの個数を数えると ${s}。これが答え`, {
      k,
      touched,
      sum: s,
      hit: true,
    })

    let ai = r
    const touchedA: number[] = []
    while (ai <= size) {
      tree[ai]! += 1
      touchedA.push(ai)
      ai += lowbit(ai)
    }
    snap(21, `自分（順位 ${r}）を BIT に入れる。触ったのは ${touchedA.length} マスだけ`, {
      k,
      touched: touchedA,
      sum: s,
    })
  }
  snap(22, `完了。答えは [${ans.join(', ')}]`, { finished: true })
  return frames
}

const PRESETS = [
  { name: 'LC315の例', value: '5, 2, 6, 1' },
  { name: '降順', value: '5, 4, 3, 2, 1' },
  { name: '昇順', value: '1, 2, 3, 4, 5' },
  { name: '同じ値を含む', value: '2, 0, 1, 0' },
]

export default function CountOfSmaller() {
  const [raw, setRaw] = useState('5, 2, 6, 1')
  const nums = useMemo(() => parseNums(raw, [5, 2, 6, 1]).slice(0, 7), [raw])
  const frames = useMemo(() => trace(nums), [nums])

  return (
    <SimShell
      title="Count of Smaller Numbers After Self（BIT を「個数の器」として使う）"
      subtitle="右から順に値を BIT へ入れ、入れる前に「自分より小さい値がいくつ入っているか」を数える"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="nums =" value={raw} onChange={setRaw} width={180} />
          <PresetControl presets={PRESETS} onPick={setRaw} />
        </>
      }
      legend={
        <>
          <LegendItem state="active">いま見ている要素</LegendItem>
          <LegendItem state="window">すでに BIT に入れた（右側の）要素</LegendItem>
          <LegendItem state="good">この操作で触ったマス / 確定した答え</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-4">
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              nums（右から左へ処理する）
            </p>
            <ArrayView cells={f.view.nums} pointers={f.view.pointers} size={40} />
          </div>
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              tree（順位ごとの個数。下の数字が元の値）
            </p>
            <ArrayView cells={f.view.tree} showIndex={false} size={40} />
          </div>
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              ans
            </p>
            <ArrayView cells={f.view.ans} showIndex={false} size={40} />
          </div>
        </div>
      )}
    </SimShell>
  )
}
