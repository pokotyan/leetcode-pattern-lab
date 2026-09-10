import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl, TextControl, parseNums } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { StackView } from '../views/StackView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `def subsets(nums):
    res = []
    path = []
    def backtrack(i):
        if i == len(nums):
            res.append(path[:])   # 決まったので記録（コピーを取る）
            return
        path.append(nums[i])       # nums[i] を「選ぶ」
        backtrack(i + 1)
        path.pop()                  # 選んだのを取り消す
        backtrack(i + 1)             # nums[i] を「選ばない」
    backtrack(0)
    return res`

type View = { cells: Cell[]; path: Cell[]; res: number[][]; depth: number }

function trace(nums: number[]): Frame<View>[] {
  const frames: Frame<View>[] = []
  const res: number[][] = []
  const path: number[] = []

  const snap = (
    i: number,
    line: number | number[],
    note: string,
    opts: { finished?: boolean } = {},
  ) => {
    const cells: Cell[] = nums.map((v, k) => ({
      value: v,
      state: k === i ? 'active' : 'idle',
    }))
    frames.push({
      line,
      note,
      vars: { i, 'len(path)': path.length, 'len(res)': res.length },
      view: { cells, path: path.map((v) => ({ value: v })), res: res.map((r) => [...r]), depth: path.length },
      done: opts.finished,
    })
  }

  const backtrack = (i: number) => {
    if (i === nums.length) {
      res.push([...path])
      snap(i, [4, 5], `i が末尾に到達。今の path [${path.join(', ')}] を1つの答えとして記録`)
      return
    }
    path.push(nums[i]!)
    snap(i, [7], `nums[${i}]=${nums[i]} を「選ぶ」。path に追加`)
    backtrack(i + 1)
    path.pop()
    snap(i, [9], `nums[${i}]=${nums[i]} の「選ぶ」側の探索が終わった。取り消して path から外す`)
    backtrack(i + 1)
  }

  snap(0, [2, 3], 'res（答えの一覧）と path（今組み立てている途中の部分集合）を空で用意する')
  backtrack(0)
  snap(nums.length, 12, `全パターンを試し終えた。2^${nums.length} = ${res.length} 個の部分集合が見つかった`, {
    finished: true,
  })
  return frames
}

const PRESETS = [
  { name: '[1,2,3]', value: '1, 2, 3' },
  { name: '[1,2]', value: '1, 2' },
  { name: '要素1個', value: '5' },
]

export default function SubsetsBacktrack() {
  const [raw, setRaw] = useState('1, 2, 3')
  const nums = useMemo(() => parseNums(raw, [1, 2, 3]).slice(0, 4), [raw])
  const frames = useMemo(() => trace(nums), [nums])

  return (
    <SimShell
      title="Subsets（選ぶ・選ばないの全探索）"
      subtitle="各要素について「選ぶ」を先に全部試してから、「選ばない」を試す。これで2^N通りすべてを漏れなく網羅する"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="nums =" value={raw} onChange={setRaw} width={160} />
          <PresetControl presets={PRESETS} onPick={setRaw} />
        </>
      }
      legend={
        <>
          <LegendItem state="active">今判断している要素</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <ArrayView cells={f.view.cells} size={38} />
          <div className="flex flex-wrap items-end gap-8">
            <div>
              <p className="mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
                path（組み立て中）
              </p>
              <StackView items={f.view.path} width={48} label="末尾" />
            </div>
          </div>
          <div className="font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            res = [
            {f.view.res.map((r, i) => (
              <span key={i} style={{ color: 'var(--ok)' }}>
                {i > 0 && ', '}[{r.join(',')}]
              </span>
            ))}
            ]
          </div>
        </div>
      )}
    </SimShell>
  )
}
