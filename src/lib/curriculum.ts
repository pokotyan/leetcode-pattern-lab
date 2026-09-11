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
  {
    id: 'advanced-array',
    title: '配列・区間（発展）',
    summary: '区間をまとめて動かす差分配列、イベントとして並べる走査、窓の最大値を O(N) で出す単調キュー',
  },
  {
    id: 'advanced-string',
    title: '文字列（発展）',
    summary: '接頭辞を共有する木と、ずれを再利用する文字列照合',
  },
  {
    id: 'advanced-structure',
    title: '区間クエリ構造',
    summary: '更新もできる累積和。BIT とセグメント木で「更新 O(log N)・区間取得 O(log N)」を作る',
  },
  {
    id: 'advanced-graph',
    title: 'グラフ（発展）',
    summary: '負の辺・全点間・辺コスト0/1の最短経路と、全体をつなぐ最小コストの木',
  },
  {
    id: 'advanced-dp',
    title: '動的計画法（発展）',
    summary: '二分探索で高速化する LIS、内側から埋める区間 DP、集合を整数で持つ bit DP',
  },
  {
    id: 'design',
    title: '設計問題',
    summary: '計算量の要求から、どのデータ構造を組み合わせるかを逆算する',
  },
]

export const sectionById = new Map(SECTIONS.map((s) => [s.id, s]))

export const LEVEL_TONE: Record<string, string> = {
  Easy: 'var(--ok)',
  Medium: 'var(--warn)',
  Hard: 'var(--danger)',
}

/** 学習段階。index / path ページの大きな区切りに使う */
export const LEVELS = [
  {
    id: '基礎',
    title: '基礎',
    summary: 'まずここ。ここに出てくる型を知らないと、発展編の記事は読んでも意味が取れない',
  },
  {
    id: '応用',
    title: '応用',
    summary: '基礎の型を2つ以上組み合わせる段階。Medium の上のほうがここで解けるようになる',
  },
  {
    id: '発展',
    title: '発展',
    summary: 'Hard 帯で問われる型。前提として必要な記事が必ずあるので、上から順に辿る',
  },
] as const

export type Level = (typeof LEVELS)[number]['id']

export const LEVEL_BADGE: Record<Level, { color: string; soft: string }> = {
  基礎: { color: 'var(--ok)', soft: 'var(--ok-soft)' },
  応用: { color: 'var(--warn)', soft: 'var(--warn-soft)' },
  発展: { color: 'var(--danger)', soft: 'var(--danger-soft)' },
}
