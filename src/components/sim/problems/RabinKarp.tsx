import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl, TextControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def val(ch):
    return ord(ch) - ord('a') + 1     # a..z を 1..26 に

def rabin_karp(text, pattern):
    n, m = len(text), len(pattern)
    BASE, MOD = 26, 997               # 提出時は MOD に大きい素数を使う
    power = pow(BASE, m - 1, MOD)     # 先頭文字が持つ桁の重み

    target = window = 0
    for i in range(m):                # 最初の窓だけ普通に計算する
        target = (target * BASE + val(pattern[i])) % MOD
        window = (window * BASE + val(text[i])) % MOD

    for i in range(n - m + 1):
        if window == target and text[i:i + m] == pattern:
            return i                  # ハッシュが同じでも本体を突き合わせる
        if i + m < n:
            window = (window - val(text[i]) * power) % MOD    # 左端を外す
            window = (window * BASE + val(text[i + m])) % MOD  # 右端を入れる
    return -1`

const BASE = 26
const MOD = 997
const val = (ch: string) => ch.charCodeAt(0) - 96

type View = { text: Cell[]; pointers: Pointer[]; window: number; target: number; verdict: string }

function trace(text: string, pattern: string): Frame<View>[] {
  const t = [...text]
  const n = t.length
  const m = pattern.length
  const frames: Frame<View>[] = []
  let power = 1
  for (let k = 0; k < m - 1; k++) power = (power * BASE) % MOD

  let target = 0
  let window = 0

  const snap = (
    line: number | number[],
    note: string,
    opts: { i?: number; state?: 'idle' | 'check' | 'hit' | 'miss'; verdict?: string; finished?: boolean } = {},
  ) => {
    const i = opts.i ?? -1
    const cells: Cell[] = t.map((ch, k) => {
      let state: Cell['state'] = 'idle'
      if (i >= 0 && k >= i && k < i + m) {
        state = opts.state === 'hit' ? 'good' : opts.state === 'miss' ? 'bad' : 'window'
      } else if (i >= 0 && k < i) state = 'dim'
      return { value: ch, state }
    })
    const pointers: Pointer[] = i >= 0 ? [{ name: 'i', index: i, tone: 'accent' }] : []
    frames.push({
      line,
      note,
      vars: { i: i < 0 ? '−' : i, window, target, 一致: window === target ? 'ハッシュ一致' : '違う' },
      view: { text: cells, pointers, window, target, verdict: opts.verdict ?? '' },
      done: opts.finished,
    })
  }

  for (let k = 0; k < m; k++) {
    target = (target * BASE + val(pattern[k]!)) % MOD
    window = (window * BASE + val(t[k]!)) % MOD
  }
  snap([10, 11, 12], `pattern "${pattern}" のハッシュは ${target}。text の最初の ${m} 文字 "${text.slice(0, m)}" のハッシュは ${window}。ここだけは ${m} 回かけて普通に計算する`, {
    i: 0,
  })

  for (let i = 0; i + m <= n; i++) {
    const slice = text.slice(i, i + m)
    if (window === target) {
      if (slice === pattern) {
        snap([15, 16], `ハッシュが一致し、本体 "${slice}" も pattern と同じ。位置 ${i} で発見`, {
          i,
          state: 'hit',
          verdict: '一致',
          finished: true,
        })
        return frames
      }
      snap(15, `ハッシュは ${window} で一致したが、本体は "${slice}" で pattern とは違う。これが偽陽性（衝突）。ハッシュだけで判定してはいけない理由がここにある`, {
        i,
        state: 'miss',
        verdict: '衝突',
      })
    } else {
      snap(15, `窓 "${slice}" のハッシュは ${window}、pattern は ${target}。違うので本体の比較すらしない`, {
        i,
        state: 'check',
      })
    }
    if (i + m < n) {
      const out = t[i]!
      const inn = t[i + m]!
      window = (window - val(out) * power) % MOD
      window = ((window % MOD) + MOD) % MOD
      window = (window * BASE + val(inn)) % MOD
      snap([18, 19], `窓を1つ右へ。左端 '${out}' の寄与を引き、右端 '${inn}' を足す。${m} 文字を数え直さず、定数回の計算で次のハッシュ ${window} が出る`, {
        i: i + 1,
        state: 'check',
      })
    }
  }
  snap(20, `text を最後まで見たが見つからなかった。−1 を返す`, { finished: true })
  return frames
}

const PRESETS = [
  { name: '衝突が起きる例', value: { text: 'xdncxcatx', pattern: 'cat' } },
  { name: 'sadbutsad / sad', value: { text: 'sadbutsad', pattern: 'sad' } },
  { name: '見つからない', value: { text: 'leetcode', pattern: 'zzz' } },
]

export default function RabinKarp() {
  const [text, setText] = useState('xdncxcatx')
  const [pattern, setPattern] = useState('cat')
  const clean = (s: string, fallback: string) => {
    const v = s.toLowerCase().replace(/[^a-z]/g, '')
    return v || fallback
  }
  const tt = clean(text, 'xdncxcatx').slice(0, 16)
  const pp = clean(pattern, 'cat').slice(0, 6)
  const frames = useMemo(() => (pp.length <= tt.length ? trace(tt, pp) : trace(tt, tt.slice(0, 1))), [tt, pp])

  return (
    <SimShell
      title="Rabin-Karp（窓のハッシュを転がす）"
      subtitle="窓をずらすたびに m 文字を数え直さず、左端を引いて右端を足すだけでハッシュを更新する"
      code={CODE}
      frames={frames}
      controls={
        <>
          <TextControl label="text =" value={text} onChange={setText} width={150} />
          <TextControl label="pattern =" value={pattern} onChange={setPattern} width={90} />
          <PresetControl
            presets={PRESETS}
            onPick={(v) => {
              setText(v.text)
              setPattern(v.pattern)
            }}
          />
        </>
      }
      legend={
        <>
          <LegendItem state="window">いまの窓</LegendItem>
          <LegendItem state="bad">ハッシュは一致したが本体は違う</LegendItem>
          <LegendItem state="good">一致</LegendItem>
          <LegendItem state="dim">通過済み</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <ArrayView cells={f.view.text} pointers={f.view.pointers} size={36} />
          <div className="flex flex-wrap gap-4 font-mono text-xs">
            <span style={{ color: 'var(--fg-muted)' }}>
              窓のハッシュ = <span style={{ color: 'var(--accent)' }}>{f.view.window}</span>
            </span>
            <span style={{ color: 'var(--fg-muted)' }}>
              pattern のハッシュ = <span style={{ color: 'var(--ok)' }}>{f.view.target}</span>
            </span>
            {f.view.verdict && (
              <span style={{ color: f.view.verdict === '一致' ? 'var(--ok)' : 'var(--danger)' }}>
                {f.view.verdict}
              </span>
            )}
          </div>
        </div>
      )}
    </SimShell>
  )
}
