import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { NumberControl, PresetControl } from '../core/Controls'
import { GridView } from '../views/GridView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `def search(head, target):
    node = head
    for level in range(len(head.next) - 1, -1, -1):   # 上の層から順に
        while node.next[level] and node.next[level].val < target:
            node = node.next[level]                   # 同じ層を右へ進む
        # これ以上進めないので、1段下りる
    node = node.next[0]
    return node is not None and node.val == target`

// 値ごとの高さ。決め打ちにして毎回同じ形が出るようにする
const TOWERS: { val: number; h: number }[] = [
  { val: 1, h: 1 },
  { val: 4, h: 3 },
  { val: 7, h: 1 },
  { val: 9, h: 2 },
  { val: 12, h: 1 },
  { val: 17, h: 4 },
  { val: 19, h: 1 },
  { val: 21, h: 2 },
  { val: 25, h: 1 },
  { val: 26, h: 1 },
]
const LEVELS = 4

type View = { grid: Cell[][]; visited: number; target: number; found: boolean | null }

function trace(target: number): Frame<View>[] {
  const frames: Frame<View>[] = []
  let visited = 0
  let pos = -1 // -1 は head

  const snap = (
    line: number | number[],
    note: string,
    opts: { level: number; found?: boolean | null; finished?: boolean },
  ) => {
    const grid: Cell[][] = []
    for (let lv = LEVELS - 1; lv >= 0; lv--) {
      const row: Cell[] = [{ value: `L${lv}`, state: lv === opts.level ? 'active' : 'dim' }]
      row.push({ value: 'head', state: pos === -1 && lv === opts.level ? 'active' : 'window' })
      TOWERS.forEach((t, i) => {
        const present = t.h > lv
        let state: Cell['state'] = present ? 'window' : 'idle'
        if (!present) state = 'idle'
        if (present && i === pos && lv === opts.level) state = 'active'
        else if (present && i === pos) state = 'good'
        if (present && t.val === target && opts.found) state = 'good'
        return row.push({ value: present ? t.val : '', state })
      })
      grid.push(row)
    }
    frames.push({
      line,
      note,
      vars: { target, いまの層: opts.level, たどった数: visited },
      view: { grid, visited, target, found: opts.found ?? null },
      done: opts.finished,
    })
  }

  snap(2, `${target} を探す。最上段から始めて、行き過ぎない範囲で右へ進み、進めなくなったら1段下りる`, {
    level: LEVELS - 1,
  })

  for (let lv = LEVELS - 1; lv >= 0; lv--) {
    snap(3, `L${lv} に来た。この層に現れるのは、高さが ${lv + 1} 以上の値だけ`, { level: lv })
    for (;;) {
      // いまの位置より右で、この層に存在する最初の塔
      let next = -1
      for (let i = pos + 1; i < TOWERS.length; i++) {
        if (TOWERS[i]!.h > lv) {
          next = i
          break
        }
      }
      if (next === -1 || TOWERS[next]!.val >= target) {
        if (next === -1) {
          snap(4, `L${lv} には、これより右に値が無い。1段下りる`, { level: lv })
        } else {
          snap(4, `次は ${TOWERS[next]!.val} で、目標の ${target} 以上。行き過ぎるので進まず、1段下りる`, { level: lv })
        }
        break
      }
      pos = next
      visited += 1
      snap(5, `${TOWERS[next]!.val} は ${target} より小さいので、ここまで進む。この1手で、下の層の値を何個も飛ばしている`, {
        level: lv,
      })
    }
  }

  let next = -1
  for (let i = pos + 1; i < TOWERS.length; i++) {
    next = i
    break
  }
  const found = next !== -1 && TOWERS[next]!.val === target
  snap([7, 8], found
    ? `最下段で1歩進むと ${target}。見つかった。たどったノードは ${visited + 1} 個だけ`
    : `最下段で1歩進むと ${next === -1 ? '末尾' : TOWERS[next]!.val} で、${target} ではない。この値は存在しない`, {
    level: 0,
    found,
    finished: true,
  })
  return frames
}

const PRESETS = [
  { name: '19 を探す', value: 19 },
  { name: '25 を探す', value: 25 },
  { name: '13（無い）', value: 13 },
  { name: '4 を探す', value: 4 },
]

export default function SkipListSearch() {
  const [target, setTarget] = useState(19)
  const t = Math.min(Math.max(Math.trunc(target), 1), 30)
  const frames = useMemo(() => trace(t), [t])

  return (
    <SimShell
      title="Skip List（層をまたいで飛ばしながら探す）"
      subtitle="上の層ほど値が疎になる。上から降りてくると、二分探索のように候補が半分ずつ減る"
      code={CODE}
      frames={frames}
      controls={
        <>
          <NumberControl label="target =" value={target} onChange={setTarget} min={1} max={30} />
          <PresetControl presets={PRESETS} onPick={setTarget} />
        </>
      }
      legend={
        <>
          <LegendItem state="active">いま見ている層・位置</LegendItem>
          <LegendItem state="good">通ってきた位置 / 見つけた値</LegendItem>
          <LegendItem state="window">その層に存在する値</LegendItem>
          <LegendItem state="idle">その層には無い値</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-2">
          <GridView grid={f.view.grid} cellSize={34} />
          <p className="m-0 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
            たどったノード数 = <span style={{ color: 'var(--accent)' }}>{f.view.visited}</span> / 全{' '}
            {TOWERS.length} 個
            {f.view.found !== null && (
              <span style={{ color: f.view.found ? 'var(--ok)' : 'var(--danger)' }}>
                {'　'}
                {f.view.found ? '見つかった' : '存在しない'}
              </span>
            )}
          </p>
        </div>
      )}
    </SimShell>
  )
}
