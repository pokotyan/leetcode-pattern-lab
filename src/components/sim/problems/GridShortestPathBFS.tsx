import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { GridView } from '../views/GridView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `from collections import deque

def shortest_path(grid):
    H, W = len(grid), len(grid[0])
    dist = [[-1] * W for _ in range(H)]
    q = deque([(0, 0)])
    dist[0][0] = 0
    while q:
        r, c = q.popleft()                  # 近い順に取り出される
        if (r, c) == (H - 1, W - 1):
            return dist[r][c]
        for dr, dc in ((-1,0),(0,1),(1,0),(0,-1)):
            nr, nc = r + dr, c + dc
            if not (0 <= nr < H and 0 <= nc < W):
                continue
            if grid[nr][nc] == 1 or dist[nr][nc] != -1:
                continue                     # 壁 or 発見済み
            dist[nr][nc] = dist[r][c] + 1
            q.append((nr, nc))
    return -1`

type View = { grid: Cell[][]; cursor: [number, number] | null; queue: string[] }

const P1 = ['00000', '01110', '00010', '01000', '00000']
const P2 = ['000000', '011110', '010000', '010111', '000010', '011000']
const P3 = ['00100', '00100', '11100', '00000', '00000']

function trace(rows: string[]): Frame<View>[] {
  const H = rows.length
  const W = rows[0]!.length
  const wall = rows.map((r) => [...r].map((ch) => ch === '1'))
  const dist = Array.from({ length: H }, () => Array<number>(W).fill(-1))
  const frames: Frame<View>[] = []
  const q: [number, number][] = []

  const snap = (
    cursor: [number, number] | null,
    line: number | number[],
    note: string,
    opts: { found?: [number, number]; finished?: boolean } = {},
  ) => {
    const grid: Cell[][] = dist.map((row, r) =>
      row.map<Cell>((d, c) => {
        if (wall[r]![c]) return { value: '■', state: 'bad' }
        const inQueue = q.some(([qr, qc]) => qr === r && qc === c)
        let state: Cell['state'] = d === -1 ? 'idle' : inQueue ? 'window' : 'good'
        if (opts.found && opts.found[0] === r && opts.found[1] === c) state = 'active'
        return { value: d === -1 ? '·' : d, state }
      }),
    )
    if (cursor) {
      const [r, c] = cursor
      grid[r]![c] = { ...grid[r]![c]!, state: 'active' }
    }
    frames.push({
      line,
      note,
      vars: {
        queue長: q.length,
        goal: `(${H - 1}, ${W - 1})`,
        'dist[goal]': dist[H - 1]![W - 1]! === -1 ? '未到達' : dist[H - 1]![W - 1]!,
      },
      view: { grid, cursor, queue: q.map(([r, c]) => `(${r},${c})`) },
      done: opts.finished,
    })
  }

  if (wall[0]![0]) {
    snap(null, 6, 'スタートが壁。到達不可能', { finished: true })
    return frames
  }
  dist[0]![0] = 0
  q.push([0, 0])
  snap([0, 0], [6, 7], 'スタート (0,0) を距離 0 でキューに入れる。BFS は「近い順」に確定していく')

  let guard = 0
  while (q.length && guard++ < 900) {
    const [r, c] = q.shift()!
    snap([r, c], [8, 9], `キュー先頭 (${r}, ${c}) を取り出す。ここまでの距離は ${dist[r]![c]}`)
    if (r === H - 1 && c === W - 1) {
      snap([r, c], [10, 11], `ゴールに到達。最短距離は ${dist[r]![c]}`, { finished: true })
      return frames
    }
    for (const [dr, dc, name] of [
      [-1, 0, '上'],
      [0, 1, '右'],
      [1, 0, '下'],
      [0, -1, '左'],
    ] as const) {
      const nr = r + dr
      const nc = c + dc
      if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue
      if (wall[nr]![nc]) {
        snap([r, c], [16, 17], `${name}の (${nr}, ${nc}) は壁。スキップ`)
        continue
      }
      if (dist[nr]![nc] !== -1) {
        snap([r, c], [16, 17], `${name}の (${nr}, ${nc}) は発見済み（距離 ${dist[nr]![nc]}）。BFS では最初の発見が最短なので触らない`)
        continue
      }
      dist[nr]![nc] = dist[r]![c]! + 1
      q.push([nr, nc])
      snap([r, c], [18, 19], `${name}の (${nr}, ${nc}) を距離 ${dist[nr]![nc]} で確定してキューへ`, {
        found: [nr, nc],
      })
    }
  }
  snap(null, 20, 'キューが空。ゴールへ到達できない', { finished: true })
  return frames
}

const PRESETS = [
  { name: '基本', value: P1 },
  { name: '迷路', value: P2 },
  { name: '到達不可', value: P3 },
]

export default function GridShortestPathBFS() {
  const [rows, setRows] = useState<string[]>(P1)
  const frames = useMemo(() => trace(rows), [rows])

  return (
    <SimShell
      title="最短経路（グリッド BFS）"
      subtitle="キューは常に距離順。最初に到達した時点でそのセルの最短距離が確定する。DFS では最短にならない"
      code={CODE}
      frames={frames}
      controls={
        <>
          <PresetControl label="盤面" presets={PRESETS} onPick={setRows} />
          <span style={{ color: 'var(--fg-muted)' }}>セルをクリックで壁の付け外し</span>
        </>
      }
      legend={
        <>
          <LegendItem state="idle">未発見</LegendItem>
          <LegendItem state="window">キューの中</LegendItem>
          <LegendItem state="good">距離確定</LegendItem>
          <LegendItem state="bad">壁</LegendItem>
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
            queue: [{f.view.queue.join(', ')}]
          </div>
        </div>
      )}
    </SimShell>
  )
}
