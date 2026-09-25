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

/** 読み物のまとまり。/reading のグルーピングに使う */
export const READING_SECTIONS: Section[] = [
  {
    id: 'search',
    title: '検索とランキング',
    summary: '大量の文書から「関係あるものを、良い順に」返すまでに何が起きているか',
  },
  {
    id: 'data',
    title: 'データ構造とストレージ',
    summary: '「無い」を速く言う仕組み、置き場所の決め方、そしてデータベースの索引',
  },
  {
    id: 'distributed',
    title: '分散システム',
    summary: '複数のノードで1つの答えを決める方法と、失敗したときの後始末',
  },
  {
    id: 'performance',
    title: '性能とデータ基盤',
    summary: '速さを勘で語らないための法則と、大量データを流して処理する枠組み',
  },
  {
    id: 'web',
    title: 'ウェブの現実',
    summary: 'ブラウザの中で起きている差分計算と、避けて通れない security の型',
  },
]

export const readingSectionById = new Map(READING_SECTIONS.map((s) => [s.id, s]))

/**
 * 作って学ぶトラック。/build のグルーピングに使う。
 * 並び順がそのまま推奨の着手順で、後ろのトラックは前のトラックの成果物を土台にする。
 */
export type Track = Section & {
  /** トラックを終えたときに手元に残るもの */
  outcome: string
}

export const BUILD_TRACKS: Track[] = [
  {
    id: 'hardware',
    title: '論理回路からコンピュータへ',
    summary: 'NAND ひとつだけを出発点にして、加算器・ALU・レジスタ・RAM を作り、最後に CPU として動かす',
    outcome: '自分で組んだ CPU の上で、自分で書いた機械語が走る',
  },
  {
    id: 'toolchain',
    title: 'アセンブラからコンパイラへ',
    summary: '機械語を人が書ける形にし、スタックマシンを挟み、最後に高級言語を CPU まで落とす',
    outcome: '自作言語で書いたプログラムが、自作 CPU の上で動く',
  },
  {
    id: 'nes',
    title: 'NES エミュレータ',
    summary: '実在するハードウェアを相手にする。6502 の命令、バスとメモリマップ、PPU による描画',
    outcome: '市販のカートリッジ ROM が画面に出て、コントローラで操作できる',
  },
]

export const trackById = new Map(BUILD_TRACKS.map((t) => [t.id, t]))

/**
 * 低レイヤの読み物の章。/lowlevel のグルーピングに使う。
 * 並び順がそのまま読む順で、後ろの章は前の章の用語を説明なしに使う。
 */
export const LOWLEVEL_CHAPTERS: Section[] = [
  {
    id: 'repr',
    title: '第1章　数と、その表し方',
    summary: 'すべての出発点。ビット、2 の補数、バイト順、浮動小数点。ここを曖昧にしたまま上に進むと、後で必ず戻ってくることになる',
  },
  {
    id: 'cpu',
    title: '第2章　命令を実行する機械',
    summary: 'CPU が 1 命令を実行するまでに何をしているか。命令セットという約束、x86 と ARM、そして現代の CPU が裏でやっている大掛かりな仕掛け',
  },
  {
    id: 'memory',
    title: '第3章　記憶の階層',
    summary: 'メモリは 1 種類ではない。速さと容量のどうしようもない trade-off と、その間を埋めるキャッシュ',
  },
  {
    id: 'vm',
    title: '第4章　アドレスの嘘',
    summary: 'プログラムが見ているアドレスは実在しない。仮想メモリ、ページング、MMU、そしてセグメンテーションフォールト',
  },
  {
    id: 'linking',
    title: '第5章　プログラムが動き出すまで',
    summary: 'ソースコードが実行可能ファイルになり、メモリに載り、最初の命令に到達するまでの全工程',
  },
  {
    id: 'process',
    title: '第6章　走っているものたち',
    summary: 'プロセスとスレッドの違い、切り替えのコスト、誰がいつ CPU を取り上げるのか',
  },
  {
    id: 'kernel',
    title: '第7章　カーネルとの境界',
    summary: 'ユーザ空間から外の世界に触るための唯一の窓口。システムコール、ファイルディスクリプタ、入出力',
  },
  {
    id: 'storage',
    title: '第8章　データを残す',
    summary: '電源が落ちても消えないように書くということ。ファイルシステムの中身、write と fsync の間にある溝、クラッシュからの回復、そして SSD の中で起きていること',
  },
  {
    id: 'network',
    title: '第9章　ネットワークの下',
    summary: 'connect と send の裏で、カーネルが何を引き受けているか。TCP の接続の一生、速度の決まり方、そしてパケットが NIC からアプリに届くまで',
  },
  {
    id: 'db',
    title: '第10章　データベースの中身',
    summary: 'ここまでの部品で、データベースは組み上がっている。ページとバッファプール、プライマリとセカンダリの索引、WAL と MVCC、そしてそれを分散させた NewSQL',
  },
  {
    id: 'ffi',
    title: '第11章　言語の壁を越える',
    summary: '別の言語で書かれたコードを、同じプロセスの中で呼ぶということ。C ABI、FFI が招くクラッシュ、そしてその答えとして使われ始めた WebAssembly',
  },
  {
    id: 'around',
    title: '第12章　その下と、その横',
    summary: '電源投入から OS が立ち上がるまで、時計、デバッガ。そして、その OS ごと、あるいは OS の一部だけを切り出して動かす仮想化とコンテナの原理',
  },
  {
    id: 'ship',
    title: '第13章　手元から本番へ',
    summary: '書いたプログラムを、別のマシンで同じように動かすということ。コンテナイメージの中身、Dockerfile と Buildpacks、CPU アーキテクチャの違い、資源の制限、そして権限の絞り方',
  },
  {
    id: 'cloud',
    title: '第14章　大量に動かし続ける',
    summary: 'コンテナを何百台ものマシンに配り、宣言したとおりの状態を保ち続ける仕組み。調整ループ、Pod、スケジューリング、Service とサービスメッシュ、無停止の入れ替え、状態を持つもの、Operator、自動の増減',
  },
  {
    id: 'observe',
    title: '第15章　観測する',
    summary: '本番で動いているものを、止めずに外から見る。カーネルに小さなプログラムを差し込む eBPF、アプリケーションの中から見る OpenTelemetry、コードを書き換えずに計装を差し込む仕組み、そして手元で測る道具',
  },
]

export const chapterById = new Map(LOWLEVEL_CHAPTERS.map((c) => [c.id, c]))
