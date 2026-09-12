import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl, TextControl, parseNums } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `MOD = 1_000_000_007

def product_naive(nums):
    p = 1
    for x in nums:
        p *= x                 # 桁がどんどん増えていく
    return p % MOD             # 最後に1回だけ余りを取る

def product_mod(nums):
    p = 1
    for x in nums:
        p = p * x % MOD        # 毎回その場で余りに畳む
    return p`

const MOD = 1000000007n

type View = { cells: Cell[]; pointers: Pointer[]; naive: string; digits: number; mod: string }

function trace(nums: number[]): Frame<View>[] {
  const frames: Frame<View>[] = []
  let naive = 1n
  let mod = 1n

  const snap = (
    line: number | number[],
    note: string,
    opts: { i?: number; finished?: boolean } = {},
  ) => {
    const cells: Cell[] = nums.map((v, k) => ({
      value: v,
      state: k === opts.i ? 'active' : opts.i !== undefined && k < opts.i ? 'dim' : 'idle',
    }))
    const s = naive.toString()
    frames.push({
      line,
      note,
      vars: {
        素直な積の桁数: s.length,
        余りを取った値: mod.toString(),
      },
      view: {
        cells,
        pointers: opts.i !== undefined ? [{ name: 'x', index: opts.i, tone: 'accent' }] : [],
        naive: s.length > 28 ? `${s.slice(0, 12)}…${s.slice(-8)}` : s,
        digits: s.length,
        mod: mod.toString(),
      },
      done: opts.finished,
    })
  }

  snap([4, 10], `どちらも 1 から始める。左は素直に掛け続け、右は毎回 MOD で割った余りに畳む`)

  for (let i = 0; i < nums.length; i++) {
    const x = BigInt(nums[i]!)
    naive *= x
    mod = (mod * x) % MOD
    snap([6, 12], `${nums[i]} を掛ける。素直な積は ${naive.toString().length} 桁になり、余りのほうは ${mod} のまま 10 桁以内に収まっている`, {
      i,
    })
  }

  const naiveMod = naive % MOD
  snap([7, 13], `最後に素直な積を MOD で割った余りは ${naiveMod}。毎回畳んだほうの値は ${mod}。${naiveMod === mod ? '一致している' : '一致していない'}`, {
    finished: true,
  })
  return frames
}

const PRESETS = [
  { name: '大きい数3つ', value: '123456789, 987654321, 555555555' },
  { name: '小さい数', value: '7, 11, 13, 17' },
  { name: '2の累乗', value: '1024, 1024, 1024, 1024, 1024' },
]

export default function ModDistribute() {
  const [raw, setRaw] = useState('123456789, 987654321, 555555555')
  const nums = useMemo(
    () => parseNums(raw, [123456789, 987654321, 555555555]).slice(0, 6).map((n) => Math.abs(Math.trunc(n)) || 1),
    [raw],
  )
  const frames = useMemo(() => trace(nums), [nums])

  return (
    <SimShell
      title="途中で余りを取っても、答えは変わらない"
      subtitle="掛け算のたびに畳んでも、最後にまとめて割っても結果は同じ。だから桁あふれを待たずに畳んでよい"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="nums =" value={raw} onChange={setRaw} width={240} />
          <PresetControl presets={PRESETS} onPick={setRaw} />
        </>
      }
      legend={
        <>
          <LegendItem state="active">いま掛けている数</LegendItem>
          <LegendItem state="dim">掛け終わった数</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-4">
          <ArrayView cells={f.view.cells} pointers={f.view.pointers} size={92} />
          <div className="space-y-2">
            <div
              className="rounded-lg border px-3 py-2"
              style={{ borderColor: 'var(--danger)', background: 'var(--danger-soft)' }}
            >
              <p className="m-0 text-[11px] font-bold" style={{ color: 'var(--danger)' }}>
                素直に掛け続けた値（{f.view.digits} 桁）
              </p>
              <p className="m-0 break-all font-mono text-xs" style={{ color: 'var(--danger)' }}>
                {f.view.naive}
              </p>
            </div>
            <div
              className="rounded-lg border px-3 py-2"
              style={{ borderColor: 'var(--ok)', background: 'var(--ok-soft)' }}
            >
              <p className="m-0 text-[11px] font-bold" style={{ color: 'var(--ok)' }}>
                毎回 MOD で畳んだ値
              </p>
              <p className="m-0 font-mono text-xs" style={{ color: 'var(--ok)' }}>
                {f.view.mod}
              </p>
            </div>
          </div>
        </div>
      )}
    </SimShell>
  )
}
