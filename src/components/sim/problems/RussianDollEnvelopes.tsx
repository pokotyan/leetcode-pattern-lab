import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def max_envelopes(envelopes):
    envelopes.sort(key=lambda e: (e[0], -e[1]))   # 幅は昇順、同じ幅なら高さは降順
    tails = []
    for _, h in envelopes:
        ok, ng = len(tails), -1                   # tails[i] >= h の最初の位置
        while abs(ok - ng) > 1:
            mid = (ok + ng) // 2
            if tails[mid] >= h:
                ok = mid
            else:
                ng = mid
        if ok == len(tails):
            tails.append(h)
        else:
            tails[ok] = h
    return len(tails)`

type Env = [number, number]
type View = { envs: Cell[]; tails: Cell[]; pointers: Pointer[] }

function trace(raw: Env[]): Frame<View>[] {
  const envs = [...raw].sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const tails: number[] = []
  const frames: Frame<View>[] = []

  const snap = (
    line: number | number[],
    note: string,
    opts: { i?: number; grow?: boolean; replace?: number; finished?: boolean } = {},
  ) => {
    const envCells: Cell[] = envs.map((e, j) => ({
      value: `${e[0]},${e[1]}`,
      state: j === opts.i ? 'active' : opts.i !== undefined && j < opts.i ? 'dim' : 'idle',
    }))
    const tailCells: Cell[] = tails.map((v, j) => {
      let state: Cell['state'] = 'window'
      if (opts.replace === j) state = 'bad'
      if (opts.grow && j === tails.length - 1) state = 'good'
      return { value: v, state, note: `長さ${j + 1}` }
    })
    const pointers: Pointer[] =
      opts.i !== undefined ? [{ name: 'いま', index: opts.i, tone: 'accent' }] : []
    frames.push({
      line,
      note,
      vars: {
        高さ: opts.i !== undefined ? envs[opts.i]![1] : '−',
        入れ子の数: tails.length,
      },
      view: { envs: envCells, tails: tailCells, pointers },
      done: opts.finished,
    })
  }

  snap(
    2,
    `幅の昇順、同じ幅なら高さの降順で並べ替える。[${envs.map((e) => `(${e[0]},${e[1]})`).join(' ')}]。こう並べておくと、あとは高さの列に対する最長増加部分列を求めるだけになる`,
  )

  for (let i = 0; i < envs.length; i++) {
    const h = envs[i]![1]
    let ok = tails.length
    let ng = -1
    while (Math.abs(ok - ng) > 1) {
      const mid = Math.floor((ok + ng) / 2)
      if (tails[mid]! >= h) ok = mid
      else ng = mid
    }
    snap([4, 5, 6], `${i + 1} 枚目 (${envs[i]![0]}, ${h})。高さ ${h} を tails に入れる位置を二分探索すると ${ok}`, {
      i,
    })
    if (ok === tails.length) {
      tails.push(h)
      snap([12, 13], `どの末尾よりも高いので、入れ子を1段深くできる。深さは ${tails.length}`, { i, grow: true })
    } else {
      const before = tails[ok]!
      tails[ok] = h
      snap([14, 15], `tails[${ok}] を ${before} から ${h} に置き換える。深さ ${ok + 1} をより低い高さで作り直しただけなので、深さは増えない`, {
        i,
        replace: ok,
      })
    }
  }
  snap(16, `完了。入れ子にできる封筒は最大 ${tails.length} 枚`, { finished: true })
  return frames
}

const PRESETS: { name: string; value: Env[] }[] = [
  { name: 'LC354の例', value: [[5, 4], [6, 4], [6, 7], [2, 3]] },
  { name: '同じ幅が3枚', value: [[1, 1], [1, 2], [1, 3], [2, 4]] },
  { name: 'すべて入れ子', value: [[1, 1], [2, 2], [3, 3], [4, 4]] },
  { name: '1枚も入らない', value: [[3, 1], [2, 2], [1, 3]] },
]

export default function RussianDollEnvelopes() {
  const [envs, setEnvs] = useState<Env[]>(PRESETS[0]!.value)
  const frames = useMemo(() => trace(envs), [envs])

  return (
    <SimShell
      title="Russian Doll Envelopes（ソートで二次元を一次元に落とす）"
      subtitle="幅の昇順・高さの降順に並べると、残るのは高さの最長増加部分列だけになる"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="envelopes" presets={PRESETS} onPick={setEnvs} />}
      legend={
        <>
          <LegendItem state="active">いま見ている封筒</LegendItem>
          <LegendItem state="window">tails の中身（高さ）</LegendItem>
          <LegendItem state="good">深さが増えた</LegendItem>
          <LegendItem state="bad">末尾を置き換えた</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-4">
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              envelopes（幅の昇順・同じ幅なら高さの降順にソート済み）
            </p>
            <ArrayView cells={f.view.envs} pointers={f.view.pointers} size={52} />
          </div>
          <div>
            <p className="m-0 mb-1 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
              tails（高さについての最小の末尾）
            </p>
            {f.view.tails.length === 0 ? (
              <p className="m-0 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
                （空）
              </p>
            ) : (
              <ArrayView cells={f.view.tails} showIndex={false} />
            )}
          </div>
        </div>
      )}
    </SimShell>
  )
}
