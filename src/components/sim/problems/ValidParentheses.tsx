import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl, TextControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { StackView } from '../views/StackView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `PAIR = {")": "(", "]": "[", "}": "{"}

def is_valid(s: str) -> bool:
    stack = []
    for ch in s:
        if ch in "([{":
            stack.append(ch)              # 開き括弧は積む
        else:
            if not stack or stack[-1] != PAIR[ch]:
                return False               # 相手がいない or 種類が違う
            stack.pop()                    # 対応が取れたので降ろす
    return len(stack) == 0                 # 積み残しが無ければ成功`

type View = { cells: Cell[]; pointers: Pointer[]; stack: Cell[] }
const PAIR: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

function trace(s: string): Frame<View>[] {
  const chars = [...s]
  const frames: Frame<View>[] = []
  const stack: string[] = []

  const snap = (
    i: number,
    line: number | number[],
    note: string,
    opts: { bad?: boolean; finished?: boolean; result?: boolean } = {},
  ) => {
    const cells: Cell[] = chars.map((ch, k) => ({
      value: ch,
      state: k === i ? (opts.bad ? 'bad' : 'active') : k < i ? 'dim' : 'idle',
    }))
    frames.push({
      line,
      note,
      vars: { stack: `[${stack.join(',')}]`, ...(opts.result !== undefined ? { 結果: opts.result } : {}) },
      view: { cells, pointers: i >= 0 ? [{ name: 'i', index: i, tone: 'accent' }] : [], stack: stack.map((c) => ({ value: c })) },
      done: opts.finished,
    })
  }

  snap(-1, 3, 'stack を空で用意する')
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!
    if ('([{'.includes(ch)) {
      stack.push(ch)
      snap(i, [4, 5], `'${ch}' は開き括弧。スタックに積む`)
      continue
    }
    if (stack.length === 0 || stack[stack.length - 1] !== PAIR[ch]) {
      snap(i, [6, 7, 8], `'${ch}' に対応する開き括弧がスタックに無い（または種類が違う）。ここで False 確定`, {
        bad: true,
        finished: true,
        result: false,
      })
      return frames
    }
    stack.pop()
    snap(i, [8, 9], `'${ch}' はスタック上の '${PAIR[ch]}' と対応が取れた。降ろす`)
  }
  const ok = stack.length === 0
  snap(chars.length - 1, 10, ok ? 'すべて対応が取れ、スタックも空。True' : `スタックに [${stack.join(',')}] が積み残っている。False`, {
    finished: true,
    result: ok,
  })
  return frames
}

const PRESETS = [
  { name: '()[]{}', value: '()[]{}' },
  { name: '(]', value: '(]' },
  { name: '([)]', value: '([)]' },
  { name: '{[]}', value: '{[]}' },
  { name: '(((', value: '(((' },
]

export default function ValidParentheses() {
  const [raw, setRaw] = useState('()[]{}')
  const s = raw.replace(/[^()[\]{}]/g, '').slice(0, 14) || '('
  const frames = useMemo(() => trace(s), [s])

  return (
    <SimShell
      title="Valid Parentheses（対応関係をスタックで持つ）"
      subtitle="開き括弧を積んで、閉じ括弧で降ろす。空チェックと最後の残りチェックが両方の判定条件"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="s =" value={raw} onChange={setRaw} width={160} />
          <PresetControl presets={PRESETS} onPick={setRaw} />
        </>
      }
      legend={
        <>
          <LegendItem state="active">今見ている文字</LegendItem>
          <LegendItem state="bad">対応が取れず失敗</LegendItem>
          <LegendItem state="dim">通り過ぎた文字</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="flex flex-wrap items-end gap-8">
          <ArrayView cells={f.view.cells} pointers={f.view.pointers} size={38} />
          <StackView items={f.view.stack} />
        </div>
      )}
    </SimShell>
  )
}
