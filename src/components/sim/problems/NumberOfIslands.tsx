import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { GridView } from '../views/GridView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `def num_islands(grid):
    H, W = len(grid), len(grid[0])
    seen = [[False] * W for _ in range(H)]
    count = 0

    def dfs(r, c):
        if not (0 <= r < H and 0 <= c < W):
            return                  # 盤外
        if grid[r][c] == "0" or seen[r][c]:
            return                  # 海 or 訪問済み
        seen[r][c] = True
        dfs(r - 1, c); dfs(r, c + 1)
        dfs(r + 1, c); dfs(r, c - 1)

    for r in range(H):
        for c in range(W):
            if grid[r][c] == "1" and not seen[r][c]:
                count += 1               # 新しい島を発見
                dfs(r, c)
    return count`

type View = { grid: Cell[][]; cursor: [number, number] | null; stack: string[] }

const P1 = [
  '11000',
  '11000',
  '00100',
  '00011',
]
const P2 = [
  '11110',
  '11010',
  '11000',
  '00000',
]
const P3 = [
  '10101',
  '01010',
  '10101',
]

function trace(rows: string[]): Frame<View>[] {
  const H = rows.length
  const W = rows[0]!.length
  const g = rows.map((r) => [...r])
  const seen = Array.from({ length: H }, () => Array<boolean>(W).fill(false))
  const frames: Frame<View>[] = []
  const stack: string[] = []
  let count = 0

  const snap = (
    cursor: [number, number] | null,
    line: number | number[],
    note: string,
    finished = false,
  ) => {
    const grid: Cell[][] = g.map((row, r) =>
      row.map<Cell>((v, c) => ({
        value: v,
        state: v === '0' ? 'dim' : seen[r]![c] ? 'good' : 'idle',
      })),
    )
    if (cursor) {
      const [r, c] = cursor
      grid[r]![c] = { ...grid[r]![c]!, state: 'active' }
    }
    frames.push({
      line,
      note,
      vars: { count, 再帰の深さ: stack.length },
      view: { grid, cursor, stack: [...stack] },
      done: finished,
    })
  }

  const dfs = (r: number, c: number) => {
    if (r < 0 || r >= H || c < 0 || c >= W) {
      snap(null, [7, 8], `(${r}, ${c}) は盤外。何もせず戻る`)
      return
    }
    if (g[r]![c] === '0' || seen[r]![c]) {
      snap([r, c], [9, 10], `(${r}, ${c}) は ${g[r]![c] === '0' ? '海' : '訪問済み'}。戻る`)
      return
    }
    seen[r]![c] = true
    stack.push(`(${r},${c})`)
    snap([r, c], 11, `(${r}, ${c}) を訪問済みにする。同じ島の陸地は全部沈める`)
    for (const [dr, dc, name] of [
      [-1, 0, '上'],
      [0, 1, '右'],
      [1, 0, '下'],
      [0, -1, '左'],
    ] as const) {
      snap([r, c], [12, 13], `(${r}, ${c}) から ${name} へ潜る`)
      dfs(r + dr, c + dc)
    }
    stack.pop()
    snap([r, c], [12, 13], `(${r}, ${c}) の4方向を見終わった。呼び出し元へ戻る`)
  }

  snap(null, [2, 3, 4], `${H}x${W} のグリッド。1=陸、0=海。上下左右で繋がる陸のかたまりを数える`)
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (g[r]![c] === '1' && !seen[r]![c]) {
        count += 1
        snap([r, c], [17, 18], `(${r}, ${c}) は未訪問の陸。新しい島 #${count} を発見。ここから DFS で塗り潰す`)
        dfs(r, c)
        snap(null, 19, `島 #${count} を塗り終えた。走査を続ける`)
      }
    }
  }
  snap(null, 20, `全セル走査完了。島の数は ${count}`, true)
  return frames
}

const PRESETS = [
  { name: '島3つ', value: P1 },
  { name: '大きい島', value: P2 },
  { name: '市松', value: P3 },
]

export default function NumberOfIslands() {
  const [rows, setRows] = useState<string[]>(P1)
  const frames = useMemo(() => trace(rows), [rows])

  return (
    <SimShell
      title="Number of Islands（グリッド DFS）"
      subtitle="未訪問の陸を見つけたらカウント +1、そこから繋がる陸を全部沈める。O(H·W)"
      code={CODE}
      frames={frames}
      controls={
        <>
          <PresetControl label="盤面" presets={PRESETS} onPick={setRows} />
          <span style={{ color: 'var(--fg-muted)' }}>セルをクリックで 1/0 を反転</span>
        </>
      }
      legend={
        <>
          <LegendItem state="idle">未訪問の陸 (1)</LegendItem>
          <LegendItem state="good">訪問済み</LegendItem>
          <LegendItem state="dim">海 (0)</LegendItem>
          <LegendItem state="active">いま見ているセル</LegendItem>
        </>
      }
    >
      {(f) => (
        <div>
          <div
            onClick={(e) => {
              const t = (e.target as HTMLElement).closest('[title]')
              const m = t?.getAttribute('title')?.match(/\((\d+), (\d+)\)/)
              if (!m) return
              const r = Number(m[1])
              const c = Number(m[2])
              setRows((prev) =>
                prev.map((row, i) =>
                  i === r ? row.slice(0, c) + (row[c] === '1' ? '0' : '1') + row.slice(c + 1) : row,
                ),
              )
            }}
          >
            <GridView grid={f.view.grid} cursor={f.view.cursor} cellSize={38} />
          </div>
          <div className="mt-3 font-mono text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            コールスタック: {f.view.stack.length ? f.view.stack.join(' → ') : '(空)'}
          </div>
        </div>
      )}
    </SimShell>
  )
}
