import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { ArrayView } from '../views/ArrayView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `from collections import defaultdict, OrderedDict

class LFUCache:
    def __init__(self, capacity):
        self.cap = capacity
        self.vals = {}                      # key -> value
        self.freq = {}                      # key -> 使われた回数
        self.buckets = defaultdict(OrderedDict)  # 回数 -> その回数のキー（古い順）
        self.min_freq = 0

    def _touch(self, key):
        f = self.freq[key]
        del self.buckets[f][key]
        if not self.buckets[f]:
            del self.buckets[f]
            if self.min_freq == f:
                self.min_freq = f + 1       # その回数の住人がいなくなった
        self.freq[key] = f + 1
        self.buckets[f + 1][key] = None

    def get(self, key):
        if key not in self.vals:
            return -1
        self._touch(key)
        return self.vals[key]

    def put(self, key, value):
        if self.cap == 0:
            return
        if key in self.vals:
            self.vals[key] = value
            self._touch(key)
            return
        if len(self.vals) >= self.cap:
            old, _ = self.buckets[self.min_freq].popitem(last=False)  # 同率なら古いほう
            del self.vals[old]
            del self.freq[old]
        self.vals[key] = value
        self.freq[key] = 1
        self.buckets[1][key] = None
        self.min_freq = 1`

type Op = ['put', number, number] | ['get', number]
type Case = { cap: number; ops: Op[] }
type View = { rows: { freq: number; cells: Cell[]; isMin: boolean }[]; op: string; result: string; minFreq: number }

function trace({ cap, ops }: Case): Frame<View>[] {
  const vals = new Map<number, number>()
  const freq = new Map<number, number>()
  const buckets = new Map<number, number[]>() // 回数 -> キー（古い順）
  let minFreq = 0
  const frames: Frame<View>[] = []

  const snap = (
    line: number | number[],
    note: string,
    opts: { op?: string; hit?: number; evict?: number; result?: string; finished?: boolean } = {},
  ) => {
    const rows = [...buckets.entries()]
      .filter(([, keys]) => keys.length > 0)
      .sort((a, b) => a[0] - b[0])
      .map(([f, keys]) => ({
        freq: f,
        isMin: f === minFreq,
        cells: keys.map((k): Cell => ({
          value: `${k}:${vals.get(k)}`,
          state: k === opts.evict ? 'bad' : k === opts.hit ? 'good' : 'window',
        })),
      }))
    frames.push({
      line,
      note,
      vars: {
        capacity: cap,
        件数: vals.size,
        min_freq: minFreq,
        戻り値: opts.result ?? '−',
      },
      view: { rows, op: opts.op ?? '', result: opts.result ?? '', minFreq },
      done: opts.finished,
    })
  }

  const touch = (key: number) => {
    const f = freq.get(key)!
    const arr = buckets.get(f)!
    arr.splice(arr.indexOf(key), 1)
    if (arr.length === 0) {
      buckets.delete(f)
      if (minFreq === f) minFreq = f + 1
    }
    freq.set(key, f + 1)
    if (!buckets.has(f + 1)) buckets.set(f + 1, [])
    buckets.get(f + 1)!.push(key)
  }

  snap([5, 6, 7, 8], `容量 ${cap}。key ごとの使用回数を覚え、「同じ回数のキー」を回数ごとの列にまとめて、その列の中は古い順に並べておく`, {
    op: `LFUCache(${cap})`,
  })

  for (const op of ops) {
    if (op[0] === 'get') {
      const key = op[1]
      if (!vals.has(key)) {
        snap([22, 23], `get(${key})。持っていないので −1`, { op: `get(${key})`, result: '-1' })
        continue
      }
      const before = freq.get(key)!
      touch(key)
      snap([24, 25], `get(${key}) → ${vals.get(key)}。使用回数を ${before} から ${before + 1} に上げ、その列へ移す`, {
        op: `get(${key})`,
        hit: key,
        result: String(vals.get(key)),
      })
    } else {
      const [, key, value] = op
      if (vals.has(key)) {
        const before = freq.get(key)!
        vals.set(key, value)
        touch(key)
        snap([30, 31, 32], `put(${key}, ${value})。すでにある key なので値を書き換え、使用回数を ${before} から ${before + 1} に上げる`, {
          op: `put(${key}, ${value})`,
          hit: key,
        })
        continue
      }
      if (vals.size >= cap) {
        const arr = buckets.get(minFreq)!
        const old = arr[0]!
        snap([34, 35], `容量がいっぱい。使用回数が最も少ないのは ${minFreq} 回の列で、その中で一番古い ${old} を追い出す`, {
          op: `put(${key}, ${value})`,
          evict: old,
        })
        arr.shift()
        if (arr.length === 0) buckets.delete(minFreq)
        vals.delete(old)
        freq.delete(old)
      }
      vals.set(key, value)
      freq.set(key, 1)
      if (!buckets.has(1)) buckets.set(1, [])
      buckets.get(1)!.push(key)
      minFreq = 1
      snap([38, 39, 40, 41], `${key} を使用回数 1 の列に入れる。新しく入れたものは必ず 1 回なので、min_freq は 1 に戻る`, {
        op: `put(${key}, ${value})`,
        hit: key,
      })
    }
  }
  snap(41, `完了。中身は ${[...vals.entries()].map(([k, v]) => `${k}:${v}`).join(', ') || '（空）'}`, {
    finished: true,
  })
  return frames
}

const CASES: { name: string; value: Case }[] = [
  {
    name: 'LC460の例',
    value: {
      cap: 2,
      ops: [['put', 1, 1], ['put', 2, 2], ['get', 1], ['put', 3, 3], ['get', 2], ['get', 3], ['put', 4, 4], ['get', 1], ['get', 3], ['get', 4]],
    },
  },
  {
    name: '同率は古いほうを追い出す',
    value: { cap: 2, ops: [['put', 1, 1], ['put', 2, 2], ['put', 3, 3], ['get', 1], ['get', 2]] },
  },
  {
    name: '容量3',
    value: {
      cap: 3,
      ops: [['put', 1, 1], ['put', 2, 2], ['put', 3, 3], ['get', 1], ['get', 1], ['put', 4, 4], ['get', 2]],
    },
  },
]

export default function LfuCache() {
  const [c, setC] = useState<Case>(CASES[0]!.value)
  const frames = useMemo(() => trace(c), [c])

  return (
    <SimShell
      title="LFU Cache（回数ごとの列に分けて持つ）"
      subtitle="使用回数ごとにキーの列を作り、その中を古い順に並べる。追い出す相手は min_freq の列の先頭"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="操作列" presets={CASES} onPick={setC} />}
      legend={
        <>
          <LegendItem state="good">いま使った / 入れた</LegendItem>
          <LegendItem state="bad">追い出す</LegendItem>
          <LegendItem state="window">キャッシュの中身</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <p className="m-0 font-mono text-xs">
            <span style={{ color: 'var(--accent)' }}>{f.view.op}</span>
            {f.view.result && <span style={{ color: 'var(--ok)' }}> → {f.view.result}</span>}
          </p>
          {f.view.rows.length === 0 ? (
            <p className="m-0 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
              （空）
            </p>
          ) : (
            f.view.rows.map((r) => (
              <div key={r.freq} className="flex items-center gap-3">
                <span
                  className="w-24 shrink-0 font-mono text-[11px]"
                  style={{ color: r.isMin ? 'var(--warn)' : 'var(--fg-muted)' }}
                >
                  {r.freq} 回{r.isMin ? '（min）' : ''}
                </span>
                <ArrayView cells={r.cells} showIndex={false} size={52} />
              </div>
            ))
          )}
          <p className="m-0 text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            各列は左が古く、右が新しい
          </p>
        </div>
      )}
    </SimShell>
  )
}
