import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl, TextControl, parseNums } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def length_of_lis(nums):
    tails = []                        # tails[k] = 長さ k+1 の増加列の、最小の末尾
    for x in nums:
        # 条件 P(i): tails[i] >= x を最初に満たす位置を探す
        ok, ng = len(tails), -1
        while abs(ok - ng) > 1:
            mid = (ok + ng) // 2
            if tails[mid] >= x:
                ok = mid
            else:
                ng = mid
        if ok == len(tails):
            tails.append(x)           # どの末尾より大きい → 長さを1つ伸ばせる
        else:
            tails[ok] = x             # 同じ長さを、より小さい末尾で作り直す
    return len(tails)`

type View = { nums: Cell[]; tails: Cell[]; tailPointers: Pointer[]; numPointers: Pointer[] }

function trace(nums: number[]): Frame<View>[] {
  const tails: number[] = []
  const frames: Frame<View>[] = []

  const snap = (
    line: number | number[],
    note: string,
    opts: {
      i?: number
      ok?: number
      ng?: number
      mid?: number
      grow?: boolean
      replace?: number
      finished?: boolean
    } = {},
  ) => {
    const numCells: Cell[] = nums.map((v, j) => ({
      value: v,
      state: j === opts.i ? 'active' : opts.i !== undefined && j < opts.i ? 'dim' : 'idle',
    }))
    const tailCells: Cell[] = tails.map((v, j) => {
      let state: Cell['state'] = 'window'
      if (j === opts.mid) state = 'active'
      if (opts.replace === j) state = 'bad'
      if (opts.grow && j === tails.length - 1) state = 'good'
      return { value: v, state, note: `長さ${j + 1}` }
    })
    const tailPointers: Pointer[] = []
    if (opts.ok !== undefined && opts.ok >= 0 && opts.ok < tails.length)
      tailPointers.push({ name: 'ok', index: opts.ok, tone: 'ok' })
    if (opts.ng !== undefined && opts.ng >= 0)
      tailPointers.push({ name: 'ng', index: opts.ng, side: 'bottom', tone: 'danger' })
    const numPointers: Pointer[] =
      opts.i !== undefined ? [{ name: 'x', index: opts.i, tone: 'accent' }] : []
    frames.push({
      line,
      note,
      vars: {
        x: opts.i !== undefined ? nums[opts.i]! : '−',
        ok: opts.ok ?? '−',
        ng: opts.ng ?? '−',
        長さ: tails.length,
      },
      view: { nums: numCells, tails: tailCells, tailPointers, numPointers },
      done: opts.finished,
    })
  }

  snap(2, `tails は「その長さの増加列を作るときの、いちばん小さい末尾」を並べた配列。中身は必ず増加順に並ぶ`)

  for (let i = 0; i < nums.length; i++) {
    const x = nums[i]!
    let ok = tails.length
    let ng = -1
    snap([3, 5], `x = ${x} を処理する。tails の中から「${x} 以上が最初に現れる位置」を二分探索する。ok = ${ok}（範囲外だが必ず成立扱い）、ng = -1`, {
      i,
      ok,
      ng,
    })
    while (Math.abs(ok - ng) > 1) {
      const mid = Math.floor((ok + ng) / 2)
      const hit = tails[mid]! >= x
      snap([7, 8], `mid = ${mid}。tails[${mid}] = ${tails[mid]} は ${x} 以上か → ${hit ? 'はい' : 'いいえ'}`, {
        i,
        ok,
        ng,
        mid,
      })
      if (hit) ok = mid
      else ng = mid
      snap(hit ? 9 : 11, `${hit ? `ok = ${ok}` : `ng = ${ng}`} に更新`, { i, ok, ng, mid })
    }

    if (ok === tails.length) {
      tails.push(x)
      snap([12, 13], `${x} は tails のどの値よりも大きい。増加列を1つ長くできるので末尾に追加。長さは ${tails.length}`, {
        i,
        grow: true,
      })
    } else {
      const before = tails[ok]!
      tails[ok] = x
      snap([14, 15], `tails[${ok}] を ${before} から ${x} に置き換える。長さ ${ok + 1} の増加列を、より小さい末尾で作り直した。長さは増えない`, {
        i,
        replace: ok,
      })
    }
  }
  snap(16, `完了。tails の長さ ${tails.length} が最長増加部分列の長さ。（tails の中身そのものは、答えの部分列とは限らない）`, {
    finished: true,
  })
  return frames
}

const PRESETS = [
  { name: 'LC300の例', value: '10, 9, 2, 5, 3, 7, 101, 18' },
  { name: '全部増加', value: '1, 2, 3, 4, 5' },
  { name: '全部減少', value: '5, 4, 3, 2, 1' },
  { name: '同じ値を含む', value: '2, 2, 2, 3, 1, 4' },
]

export default function LisNLogN() {
  const [raw, setRaw] = useState('10, 9, 2, 5, 3, 7, 101, 18')
  const nums = useMemo(() => parseNums(raw, [10, 9, 2, 5, 3, 7, 101, 18]).slice(0, 10), [raw])
  const frames = useMemo(() => trace(nums), [nums])

  return (
    <SimShell
      title="Longest Increasing Subsequence（O(N log N) 版）"
      subtitle="長さごとの「最小の末尾」だけを持ち、二分探索で置き換え先を探す"
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
          <LegendItem state="active">いま見ている値 / mid</LegendItem>
          <LegendItem state="window">tails の中身</LegendItem>
          <LegendItem state="good">長さを伸ばした</LegendItem>
          <LegendItem state="bad">末尾を置き換えた</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-4">
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              nums（左から1つずつ処理する）
            </p>
            <ArrayView cells={f.view.nums} pointers={f.view.numPointers} />
          </div>
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              tails（必ず増加順。長さは配列の要素数）
            </p>
            {f.view.tails.length === 0 ? (
              <p className="m-0 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
                （空）
              </p>
            ) : (
              <ArrayView cells={f.view.tails} pointers={f.view.tailPointers} showIndex={false} />
            )}
          </div>
        </div>
      )}
    </SimShell>
  )
}
