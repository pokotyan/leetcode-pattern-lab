export type Section = {
  id: string
  title: string
  summary: string
}

/** 目次の並び順はこの配列の順。記事側は frontmatter の section/order で紐づく */
export const SECTIONS: Section[] = [
  {
    id: 'start',
    title: 'はじめに',
    summary: '何をどの順で身につけるか。計算量の見積もり方',
  },
  {
    id: 'array',
    title: '配列・文字列',
    summary: 'Medium で最も出る土俵。Two Pointers と Sliding Window が主役',
  },
  {
    id: 'hashing',
    title: 'ハッシュテーブル',
    summary: 'O(1) 参照で二重ループを潰す。カウント・グルーピング',
  },
  {
    id: 'search',
    title: '二分探索',
    summary: '「条件を満たす限界」を探す道具。答えそのものを二分探索する型まで',
  },
  {
    id: 'stack',
    title: 'スタック・キュー',
    summary: '対応関係の処理と単調スタック',
  },
  {
    id: 'linkedlist',
    title: '連結リスト',
    summary: 'ポインタ付け替えと Slow/Fast',
  },
  {
    id: 'tree',
    title: '木・二分木',
    summary: 'DFS の帰りがけで部分木の情報を集める',
  },
  {
    id: 'graph',
    title: 'グラフ',
    summary: 'BFS/DFS、グリッド、トポロジカルソート、最短経路',
  },
  {
    id: 'heap',
    title: 'ヒープ',
    summary: 'Top-K と「常に最小/最大を取り出す」処理',
  },
  {
    id: 'backtracking',
    title: '再帰・バックトラック',
    summary: '選ぶ/選ばないの全探索を構造化する',
  },
  {
    id: 'dp',
    title: '動的計画法',
    summary: '状態と遷移式。Medium で出る型に絞る',
  },
]

export const sectionById = new Map(SECTIONS.map((s) => [s.id, s]))

export const LEVEL_TONE: Record<string, string> = {
  Easy: 'var(--ok)',
  Medium: 'var(--warn)',
  Hard: 'var(--danger)',
}
