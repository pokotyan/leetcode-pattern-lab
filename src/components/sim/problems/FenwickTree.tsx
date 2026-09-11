import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl, TextControl, parseNums } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `class BIT:
    def __init__(self, n):
        self.n = n
        self.tree = [0] * (n + 1)     # 1-indexed。tree[i] は i の手前 lowbit(i) 個の合計

    def add(self, i, delta):          # i は 1-indexed
        while i <= self.n:
            self.tree[i] += delta
            i += i & -i               # 自分を覆っている、より大きい区間へ

    def sum(self, i):                 # 1..i の合計
        s = 0
        while i > 0:
            s += self.tree[i]
            i -= i & -i               # 覆い終えた区間の手前へ飛ぶ
        return s`

const lowbit = (i: number) => i & -i

type View = { orig: Cell[]; tree: Cell[]; treePointers: Pointer[]; origPointers: Pointer[]; label: string }

function trace(nums: number[], updateAt: number, updateTo: number, queryTo: number): Frame<View>[] {
  const n = nums.length
  const arr = [...nums]
  const tree = Array<number>(n + 1).fill(0)
  const frames: Frame<View>[] = []

  const snap = (
    line: number | number[],
    note: string,
    opts: {
      i?: number
      origIndex?: number
      touched?: number[]
      sum?: number
      label?: string
      finished?: boolean
    } = {},
  ) => {
    const touched = new Set(opts.touched ?? [])
    const origCells: Cell[] = arr.map((v, k) => ({
      value: v,
      state: k === opts.origIndex ? 'active' : k < queryTo ? 'window' : 'idle',
    }))
    const treeCells: Cell[] = tree.slice(1).map((v, k) => {
      const idx = k + 1
      let state: Cell['state'] = 'idle'
      if (touched.has(idx)) state = 'good'
      if (idx === opts.i) state = 'active'
      return { value: v, state, note: `${idx - lowbit(idx) + 1}..${idx}` }
    })
    const treePointers: Pointer[] =
      opts.i !== undefined && opts.i >= 1 && opts.i <= n
        ? [{ name: 'i', index: opts.i - 1, tone: 'accent' }]
        : []
    frames.push({
      line,
      note,
      vars: { i: opts.i ?? '−', 合計: opts.sum ?? '−', n },
      view: {
        orig: origCells,
        tree: treeCells,
        treePointers,
        origPointers:
          opts.origIndex !== undefined ? [{ name: 'pos', index: opts.origIndex, tone: 'warn' }] : [],
        label: opts.label ?? '',
      },
      done: opts.finished,
    })
  }

  snap([3, 4], `tree は 1-indexed で長さ n+1。各マスの下に書いてあるのが「そのマスが担当している区間」。tree[4] は 1..4 を、tree[6] は 5..6 を覚える`, {
    label: '準備',
  })

  // build
  for (let k = 0; k < n; k++) {
    let i = k + 1
    const touched: number[] = []
    while (i <= n) {
      tree[i]! += arr[k]!
      touched.push(i)
      snap([7, 8, 9], `nums[${k}] = ${arr[k]} を tree[${i}]（担当区間 ${i - lowbit(i) + 1}..${i}）に足す。次は i += lowbit(${i}) = ${i + lowbit(i)}`, {
        i,
        origIndex: k,
        touched,
        label: '構築',
      })
      i += lowbit(i)
    }
  }
  snap(9, `構築完了。1つの値を足すのに触るマスは高々 log n 個で済んでいる`, { label: '構築' })

  // query
  let s = 0
  let qi = queryTo
  const touchedQ: number[] = []
  snap([12, 13], `ここから「先頭から ${queryTo} 個の合計」を求める。i = ${queryTo} から始める`, {
    i: qi,
    sum: 0,
    label: '取得',
  })
  while (qi > 0) {
    s += tree[qi]!
    touchedQ.push(qi)
    snap([14, 15], `tree[${qi}] = ${tree[qi]}（区間 ${qi - lowbit(qi) + 1}..${qi}）を足して合計 ${s}。次は i -= lowbit(${qi}) = ${qi - lowbit(qi)}`, {
      i: qi,
      touched: touchedQ,
      sum: s,
      label: '取得',
    })
    qi -= lowbit(qi)
  }
  snap(16, `合計は ${s}。区間 1..${queryTo} を、重なりなく ${touchedQ.length} 個のマスに分解して足しただけ`, {
    sum: s,
    touched: touchedQ,
    label: '取得',
  })

  // update
  const delta = updateTo - arr[updateAt]!
  arr[updateAt] = updateTo
  let ui = updateAt + 1
  const touchedU: number[] = []
  snap(6, `次は nums[${updateAt}] を ${updateTo} に変える。差分 ${delta >= 0 ? '+' : ''}${delta} を足していく`, {
    i: ui,
    origIndex: updateAt,
    label: '更新',
  })
  while (ui <= n) {
    tree[ui]! += delta
    touchedU.push(ui)
    snap([7, 8, 9], `tree[${ui}] に ${delta >= 0 ? '+' : ''}${delta}。この区間は nums[${updateAt}] を含んでいる`, {
      i: ui,
      origIndex: updateAt,
      touched: touchedU,
      label: '更新',
    })
    ui += lowbit(ui)
  }

  let s2 = 0
  let q2 = queryTo
  const touched2: number[] = []
  while (q2 > 0) {
    s2 += tree[q2]!
    touched2.push(q2)
    q2 -= lowbit(q2)
  }
  snap(16, `更新後にもう一度 1..${queryTo} の合計を取ると ${s2}。更新も取得も、触るマスは log n 個だけ`, {
    sum: s2,
    touched: touched2,
    label: '更新後の取得',
    finished: true,
  })
  return frames
}

const PRESETS = [
  { name: '8要素', value: '1, 3, 5, 7, 9, 11, 13, 15' },
  { name: '全部1', value: '1, 1, 1, 1, 1, 1, 1, 1' },
  { name: '6要素', value: '2, 4, 6, 8, 10, 12' },
]

export default function FenwickTree() {
  const [raw, setRaw] = useState('1, 3, 5, 7, 9, 11, 13, 15')
  const nums = useMemo(() => parseNums(raw, [1, 3, 5, 7, 9, 11, 13, 15]).slice(0, 8), [raw])
  const frames = useMemo(
    () => trace(nums, Math.min(2, nums.length - 1), 100, Math.min(6, nums.length)),
    [nums],
  )

  return (
    <SimShell
      title="BIT / Fenwick Tree（更新できる累積和）"
      subtitle="各マスに「自分の手前 lowbit(i) 個の合計」を持たせる。更新も区間の合計も O(log N)"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="nums =" value={raw} onChange={setRaw} width={220} />
          <PresetControl presets={PRESETS} onPick={setRaw} />
        </>
      }
      legend={
        <>
          <LegendItem state="active">いま触っているマス</LegendItem>
          <LegendItem state="good">この操作で触ったマス</LegendItem>
          <LegendItem state="window">合計を求めたい範囲</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-4">
          <p className="m-0 font-mono text-[11px]" style={{ color: 'var(--accent)' }}>
            {f.view.label}
          </p>
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              nums（元の配列。0-indexed）
            </p>
            <ArrayView cells={f.view.orig} pointers={f.view.origPointers} size={40} />
          </div>
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              tree（1-indexed。下の表記が担当区間）
            </p>
            <ArrayView cells={f.view.tree} pointers={f.view.treePointers} showIndex={false} size={44} />
          </div>
        </div>
      )}
    </SimShell>
  )
}
