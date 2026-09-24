/**
 * サイトの区画（エリア）。ヘッダーのナビと、トップのポータルがこの定義を共有する。
 * 区画を増やすときはここに 1 つ足せば、ナビ・ポータル・サブナビが同時に追従する。
 */
export type AreaItem = {
  title: string
  /** BASE_URL からの相対パス。末尾のスラッシュまで含める */
  path: string
  summary: string
  status?: 'published' | 'planned'
}

export type Area = {
  id: string
  /** ヘッダーに出す短い名前 */
  title: string
  /** ポータルのカードに出す一行 */
  tagline: string
  summary: string
  path: string
  status: 'published' | 'planned'
  /** 区画のトップ以外のページ。サブナビとポータルのカードに出す */
  items: AreaItem[]
}

export const SITE_NAME = 'Pattern Lab'
export const SITE_TAGLINE = '型・仕組み・実装を、手を動かしながら繋ぎ直すための学習ノート'

export const AREAS: Area[] = [
  {
    id: 'algorithms',
    title: 'アルゴリズム',
    tagline: 'LeetCode を「型」で落とす',
    summary:
      '閃きに頼らず、パターンを引き出しから取り出して解けるようにする。各テクニックに 1 手ずつ動かせるシミュレーターが付く。',
    path: 'algorithms/',
    status: 'published',
    items: [
      { title: '学習経路', path: 'path/', summary: '前提を満たす順に並べ直したもの' },
      { title: '数学ノート', path: 'math/', summary: '型を支える数学を、使う場面から引く副読本' },
    ],
  },
  {
    id: 'system-design',
    title: 'システム設計',
    tagline: '大きな仕組みを、中身まで降りて読む',
    summary:
      '検索、分散システム、データベースの索引、メッセージング。名前だけ知っている仕組みを、中で何が起きているかまで降りて読む。',
    path: 'system-design/',
    status: 'published',
    items: [
      {
        title: '仕組みを読む',
        path: 'reading/',
        summary: '検索エンジン、分散合意、DB の索引など 13 本',
      },
    ],
  },
  {
    id: 'lowlevel',
    title: '低レイヤ',
    tagline: 'コンピュータの下のほうで何が起きているか',
    summary:
      'CPU、キャッシュ、仮想メモリ、プロセス、リンク、システムコール、FFI と WebAssembly。9 章で上から順に繋ぎ直す。',
    path: 'lowlevel/',
    status: 'published',
    items: [],
  },
  {
    id: 'build',
    title: '作る',
    tagline: 'NAND ひとつから、CPU と言語と NES エミュレータへ',
    summary:
      '1 回ぶん手を動かすと、動くものが 1 つ増える。論理回路から CPU、アセンブラからコンパイラ、そして実機のエミュレータまで。',
    path: 'build/',
    status: 'published',
    items: [],
  },
]

export const areaById = new Map(AREAS.map((a) => [a.id, a]))
