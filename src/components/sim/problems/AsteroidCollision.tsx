import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl, TextControl, parseNums } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { StackView } from '../views/StackView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def asteroid_collision(asteroids):
    stack = []
    for a in asteroids:
        alive = True
        while alive and stack and a < 0 < stack[-1]:
            top = stack[-1]
            if top < -a:
                stack.pop()          # 上のほうが小さい。消して続行
            elif top == -a:
                stack.pop()          # 同じ大きさ。両方消える
                alive = False
            else:
                alive = False        # 上のほうが大きい。a が消える
        if alive:
            stack.append(a)
    return stack`

type View = { cells: Cell[]; pointers: Pointer[]; stack: Cell[] }

function trace(input: number[]): Frame<View>[] {
  const frames: Frame<View>[] = []
  const stack: number[] = []

  const snap = (
    i: number,
    line: number | number[],
    note: string,
    opts: { finished?: boolean } = {},
  ) => {
    const cells: Cell[] = input.map((v, k) => ({
      value: v > 0 ? `→${v}` : `${v}←`,
      state: k === i ? 'active' : k < i ? 'dim' : 'idle',
    }))
    frames.push({
      line,
      note,
      vars: { a: input[i] ?? '−', stack: `[${stack.join(',')}]` },
      view: {
        cells,
        pointers: i >= 0 ? [{ name: 'a', index: i, tone: 'accent' }] : [],
        stack: stack.map((v) => ({ value: v > 0 ? `→${v}` : `${v}←` })),
      },
      done: opts.finished,
    })
  }

  snap(-1, 2, 'stack を空で用意する。→N は右へ進む大きさ N、N← は左へ進む大きさ N')
  for (let i = 0; i < input.length; i++) {
    const a = input[i]!
    let alive = true
    snap(i, [3, 4], `a=${a > 0 ? `→${a}` : `${a}←`} を見る`)
    while (alive && stack.length > 0 && a < 0 && stack[stack.length - 1]! > 0) {
      const top = stack[stack.length - 1]!
      snap(i, [5, 6], `stack の一番上は →${top}。a=${a}← と正面衝突するので比較する`)
      if (top < -a) {
        stack.pop()
        snap(i, [7, 8], `→${top} のほうが小さい（${top} < ${-a}）ので消える。まだ a=${a}← は生きているので、次の要素とも比較を続ける`)
      } else if (top === -a) {
        stack.pop()
        alive = false
        snap(i, [9, 10, 11], `大きさが同じ（${top} == ${-a}）なので、両方とも消える`)
      } else {
        alive = false
        snap(i, [12, 13], `→${top} のほうが大きい（${top} > ${-a}）ので、a=${a}← が消える。→${top} は生き残る`)
      }
    }
    if (alive) {
      stack.push(a)
      snap(i, [14, 15], `衝突せず残った。stack に積む → [${stack.join(',')}]`)
    }
  }
  snap(input.length - 1, 16, `全部見終わった。残った隕石は [${stack.join(', ')}]`, { finished: true })
  return frames
}

const PRESETS = [
  { name: '[5,10,-5]', value: '5, 10, -5' },
  { name: '同じ大きさで相殺', value: '8, -8' },
  { name: '連鎖して消える', value: '10, 2, -5' },
  { name: '全部同方向', value: '-2, -1, 1, 2' },
]

export default function AsteroidCollision() {
  const [raw, setRaw] = useState('5, 10, -5')
  const nums = useMemo(() => parseNums(raw, [5, 10, -5]).slice(0, 10), [raw])
  const frames = useMemo(() => trace(nums), [nums])

  return (
    <SimShell
      title="Asteroid Collision（スタックで衝突をシミュレート）"
      subtitle="右向きが積まれた状態で左向きが来たときだけ、衝突の判定が発生する"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="asteroids =" value={raw} onChange={setRaw} width={190} />
          <PresetControl presets={PRESETS} onPick={setRaw} />
        </>
      }
      legend={
        <>
          <LegendItem state="active">今見ている隕石</LegendItem>
          <LegendItem state="dim">処理済み</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="flex flex-wrap items-end gap-8">
          <ArrayView cells={f.view.cells} pointers={f.view.pointers} size={46} />
          <StackView items={f.view.stack} width={56} />
        </div>
      )}
    </SimShell>
  )
}
