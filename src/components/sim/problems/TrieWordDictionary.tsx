import { useMemo, useState } from 'react'
import { SimShell } from '../core/SimShell'
import { PresetControl, TextControl } from '../core/Controls'
import { GraphView } from '../views/GraphView'
import { LegendItem } from '../views/Legend'
import { insertWord, layoutTrie, newTrie, type TrieNode } from '../views/trieLayout'
import type { CellState, Frame } from '../core/types'

const CODE = `class WordDictionary:
    def __init__(self):
        self.children = {}                                # 文字 -> 子ノード
        self.is_word = False                              # ここで単語が終わるか

    def add_word(self, word):
        node = self
        for ch in word:
            if ch not in node.children:
                node.children[ch] = WordDictionary()      # 枝が無ければ作る
            node = node.children[ch]                      # 1文字ぶん降りる
        node.is_word = True

    def search(self, word, node=None):
        node = node or self
        for i, ch in enumerate(word):
            if ch == '.':
                for child in node.children.values():      # どの枝でもよい
                    if self.search(word[i + 1:], child):
                        return True
                return False
            if ch not in node.children:
                return False                              # 枝が切れたら無い
            node = node.children[ch]
        return node.is_word                               # 通過点ではなく終端か`

type Input = { words: string[]; query: string }
type View = { nodes: ReturnType<typeof layoutTrie>['nodes']; edges: ReturnType<typeof layoutTrie>['edges']; width: number; height: number; found: string }

function trace({ words, query }: Input): Frame<View>[] {
  const root = newTrie()
  const frames: Frame<View>[] = []
  const states = new Map<number, CellState>()

  const snap = (line: number | number[], note: string, opts: { vars?: Record<string, string | number>; found?: string; finished?: boolean } = {}) => {
    const { nodes, edges, width, height } = layoutTrie(root, states)
    frames.push({
      line,
      note,
      vars: opts.vars,
      view: { nodes, edges, width, height, found: opts.found ?? '' },
      done: opts.finished,
    })
  }

  snap([2, 3, 4], `空のトライ（根だけ）から始める。根は文字を持たない出発点で、図では · で描いてある`)

  for (const w of words) {
    const path = insertWord(root, w)
    states.clear()
    for (const n of path) states.set(n.id, 'good')
    snap([6, 7, 8, 9, 10, 11, 12], `"${w}" を追加。根から1文字ずつ降り、枝が無いところだけ新しく作る。最後のノードに「終」の印を付ける`, {
      vars: { 追加した単語: w, 節点数: countNodes(root) },
    })
  }
  states.clear()
  snap(12, `${words.length} 語を入れ終えた。共通の接頭辞は枝を共有しているので、節点は全文字数より少ない ${countNodes(root)} 個で済んでいる`, {
    vars: { 節点数: countNodes(root), 総文字数: words.join('').length },
  })

  // search
  let answer = false
  const walk = (word: string, node: TrieNode, depth: number): boolean => {
    for (let i = 0; i < word.length; i++) {
      const ch = word[i]!
      states.set(node.id, 'active')
      if (ch === '.') {
        snap([17, 18], `${depth + i} 文字目は '.'（任意の1文字）。この節点の子 [${[...node.children.keys()].join(', ')}] を順に試す`, {
          vars: { 探索中: word.slice(i), 位置: depth + i },
        })
        for (const child of node.children.values()) {
          snap([18, 19], `'${child.char}' の枝を試す`, { vars: { 探索中: word.slice(i), 試す枝: child.char } })
          if (walk(word.slice(i + 1), child, depth + i + 1)) return true
          states.set(child.id, 'bad')
          snap(18, `'${child.char}' の枝では見つからなかった。次の枝へ戻る`, { vars: { 試す枝: child.char } })
        }
        snap(21, `この節点のどの枝でも見つからなかった`, {})
        return false
      }
      const child = node.children.get(ch)
      if (!child) {
        snap([22, 23], `'${ch}' の枝が無い。この先に単語は存在しないので False`, {
          vars: { 探索中: word.slice(i) },
        })
        return false
      }
      states.set(child.id, 'active')
      snap(24, `'${ch}' の枝を降りる`, { vars: { 探索中: word.slice(i + 1) || '（終わり）' } })
      node = child
    }
    snap(25, node.word
      ? `文字を使い切った。この節点には「終」の印があるので、単語として登録されている → True`
      : `文字を使い切ったが、この節点に「終」の印が無い。ここは通過点にすぎないので False`, {})
    return node.word
  }

  states.clear()
  snap(14, `ここから "${query}" を検索する`, { vars: { query } })
  answer = walk(query, root, 0)
  snap(25, `検索結果: "${query}" は ${answer ? '登録されている（True）' : '登録されていない（False）'}`, {
    vars: { query, 結果: answer ? 'True' : 'False' },
    finished: true,
  })
  return frames
}

/** 根は文字を持たないので数えない */
function countNodes(node: TrieNode): number {
  let n = node.char ? 1 : 0
  for (const c of node.children.values()) n += countNodes(c)
  return n
}

const PRESETS: { name: string; value: Input }[] = [
  { name: 'app を検索', value: { words: ['apple', 'app', 'apt'], query: 'app' } },
  { name: 'ap を検索（通過点）', value: { words: ['apple', 'app', 'apt'], query: 'ap' } },
  { name: '.pp を検索', value: { words: ['apple', 'app', 'apt'], query: '.pp' } },
  { name: 'a.t を検索', value: { words: ['apple', 'app', 'apt', 'ant'], query: 'a.t' } },
  { name: 'bat を検索（無い）', value: { words: ['apple', 'app', 'apt'], query: 'bat' } },
]

export default function TrieWordDictionary() {
  const [input, setInput] = useState<Input>(PRESETS[0]!.value)
  const [query, setQuery] = useState('')
  const effective = useMemo<Input>(
    () => ({ words: input.words, query: query.trim() || input.query }),
    [input, query],
  )
  const frames = useMemo(() => trace(effective), [effective])

  return (
    <SimShell
      title="Trie（接頭辞で枝を共有する木）"
      subtitle="単語を1文字ずつ枝にして共有する。検索は根から降りるだけで、単語の長さぶんの手数で済む"
      code={CODE}
      frames={frames}
      controls={
        <>
          <PresetControl label="例" presets={PRESETS} onPick={(v) => { setInput(v); setQuery('') }} />
          <TextControl label="検索語 =" value={query} onChange={setQuery} width={120} placeholder={input.query} />
        </>
      }
      legend={
        <>
          <LegendItem state="good">追加した経路</LegendItem>
          <LegendItem state="active">検索でたどっている節点</LegendItem>
          <LegendItem state="bad">見つからず戻った枝</LegendItem>
        </>
      }
    >
      {(f) => (
        <div style={{ maxWidth: f.view.width }}>
          <GraphView
            nodes={f.view.nodes}
            edges={f.view.edges}
            directed={false}
            width={f.view.width}
            height={f.view.height}
          />
          <p className="m-0 text-[11px]" style={{ color: 'var(--fg-muted)' }}>
            「終」の印が付いた節点が、単語の終わりです
          </p>
        </div>
      )}
    </SimShell>
  )
}
