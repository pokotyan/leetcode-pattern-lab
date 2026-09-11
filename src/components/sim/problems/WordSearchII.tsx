import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl } from '../core/Controls'
import { GridView } from '../views/GridView'
import { LegendItem } from '../views/Legend'
import type { Cell, Frame } from '../core/types'

const CODE = `def find_words(board, words):
    trie = {}
    for w in words:                       # 単語をまとめてトライに入れる
        node = trie
        for ch in w:
            node = node.setdefault(ch, {})
        node['$'] = w                     # 終端に単語そのものを置く

    res = []
    rows, cols = len(board), len(board[0])

    def dfs(r, c, node):
        ch = board[r][c]
        if ch not in node:
            return                        # トライに枝が無い = この先に単語は無い
        nxt = node[ch]
        if '$' in nxt:
            res.append(nxt.pop('$'))      # 見つけた単語は取り除いて重複を防ぐ
        board[r][c] = '#'                 # 訪問済みの印
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols:
                dfs(nr, nc, nxt)
        board[r][c] = ch                  # 戻す

    for r in range(rows):
        for c in range(cols):
            dfs(r, c, trie)
    return res`

type TNode = Map<string, TNode> & { word?: string }
type Input = { board: string[][]; words: string[] }
type View = { grid: Cell[][]; path: string; found: string[]; start: [number, number] | null }

function makeNode(): TNode {
  return new Map() as TNode
}

function trace({ board, words }: Input): Frame<View>[] {
  const rows = board.length
  const cols = board[0]!.length
  const root = makeNode()
  for (const w of words) {
    let node = root
    for (const ch of w) {
      let next = node.get(ch)
      if (!next) {
        next = makeNode()
        node.set(ch, next)
      }
      node = next
    }
    node.word = w
  }

  const frames: Frame<View>[] = []
  const res: string[] = []
  const visited = new Set<string>()
  const path: [number, number][] = []
  let start: [number, number] | null = null

  const snap = (
    line: number | number[],
    note: string,
    opts: { cur?: [number, number]; hit?: boolean; dead?: boolean; finished?: boolean } = {},
  ) => {
    const grid: Cell[][] = board.map((row, r) =>
      row.map((ch, c) => {
        const key = `${r},${c}`
        let state: Cell['state'] = 'idle'
        if (visited.has(key)) state = 'window'
        if (start && start[0] === r && start[1] === c) state = 'window'
        if (opts.cur && opts.cur[0] === r && opts.cur[1] === c) {
          state = opts.hit ? 'good' : opts.dead ? 'bad' : 'active'
        }
        return { value: ch, state }
      }),
    )
    frames.push({
      line,
      note,
      vars: {
        なぞった文字列: path.map(([r, c]) => board[r]![c]!).join('') || '−',
        見つけた数: res.length,
      },
      view: { grid, path: path.map(([r, c]) => board[r]![c]!).join(''), found: [...res], start },
      done: opts.finished,
    })
  }

  snap([2, 3, 7], `${words.length} 語 [${words.join(', ')}] をトライにまとめる。共通の接頭辞は枝を共有する`)

  const dfs = (r: number, c: number, node: TNode) => {
    const ch = board[r]![c]!
    const key = `${r},${c}`
    if (visited.has(key)) return
    const next = node.get(ch)
    if (!next) {
      snap([13, 14, 15], `(${r}, ${c}) の '${ch}' は、この節点の枝に無い。この方向に単語は無いので打ち切る`, {
        cur: [r, c],
        dead: true,
      })
      return
    }
    visited.add(key)
    path.push([r, c])
    if (next.word) {
      res.push(next.word)
      next.word = undefined
      snap([17, 18], `"${res[res.length - 1]}" を発見。同じ単語を二度数えないよう、トライから終端の印を消す`, {
        cur: [r, c],
        hit: true,
      })
    } else {
      snap([16, 19], `(${r}, ${c}) の '${ch}' はトライの枝にある。ここまでなぞった文字列は "${path.map(([rr, cc]) => board[rr]![cc]!).join('')}"`, {
        cur: [r, c],
      })
    }
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nr = r + dr
      const nc = c + dc
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) dfs(nr, nc, next)
    }
    visited.delete(key)
    path.pop()
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!root.get(board[r]![c]!)) continue
      start = [r, c]
      snap([26, 27, 28], `(${r}, ${c}) の '${board[r]![c]}' から探索を始める。この文字は根の枝にある`, {
        cur: [r, c],
      })
      dfs(r, c, root)
    }
  }
  start = null
  snap(29, `完了。見つかった単語は [${res.join(', ')}]`, { finished: true })
  return frames
}

const PRESETS: { name: string; value: Input }[] = [
  {
    name: 'LC212の例',
    value: {
      board: [
        ['o', 'a', 'a', 'n'],
        ['e', 't', 'a', 'e'],
        ['i', 'h', 'k', 'r'],
        ['i', 'f', 'l', 'v'],
      ],
      words: ['oath', 'pea', 'eat', 'rain'],
    },
  },
  {
    name: '小さい盤面',
    value: {
      board: [
        ['a', 'b'],
        ['c', 'd'],
      ],
      words: ['abcd', 'acdb', 'ab'],
    },
  },
  {
    name: '接頭辞を共有',
    value: {
      board: [
        ['c', 'a', 't'],
        ['x', 'r', 's'],
        ['x', 'x', 'x'],
      ],
      words: ['cat', 'cats', 'car'],
    },
  },
]

export default function WordSearchII() {
  const [input, setInput] = useState<Input>(PRESETS[0]!.value)
  const frames = useMemo(() => trace(input), [input])

  return (
    <SimShell
      title="Word Search II（トライで枝刈りする盤面 DFS）"
      subtitle="単語ごとに盤面を探すのをやめ、トライを1つ持って「その先に単語があるか」で即座に打ち切る"
      code={CODE}
      frames={frames}
      controls={<PresetControl label="入力" presets={PRESETS} onPick={setInput} />}
      legend={
        <>
          <LegendItem state="active">いま見ているマス</LegendItem>
          <LegendItem state="window">なぞっている経路</LegendItem>
          <LegendItem state="bad">枝が無いので打ち切り</LegendItem>
          <LegendItem state="good">単語を発見</LegendItem>
        </>
      }
    >
      {(f) => (
        <div className="space-y-3">
          <GridView grid={f.view.grid} cellSize={38} />
          <p className="m-0 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
            なぞった文字列: <span style={{ color: 'var(--accent)' }}>{f.view.path || '−'}</span>
          </p>
          <p className="m-0 font-mono text-xs" style={{ color: 'var(--fg-muted)' }}>
            res = [<span style={{ color: 'var(--ok)' }}>{f.view.found.join(', ')}</span>]
          </p>
        </div>
      )}
    </SimShell>
  )
}
