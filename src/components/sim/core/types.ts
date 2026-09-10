/**
 * シミュレータ共通のフレーム表現。
 * 各問題は「アルゴリズムを1手ずつ実行して Frame を積む」トレース関数を書き、
 * SimShell がその配列を再生する。描画データ(view)の型だけが問題ごとに異なる。
 */
export type Frame<V> = {
  /** 疑似コードのハイライト行 (1-indexed)。複数行なら配列 */
  line: number | number[]
  /** その手で何をしたかの説明 */
  note: string
  /** 右側パネルに出す変数の値 */
  vars?: Record<string, string | number | boolean | null | undefined>
  /** 問題固有の描画データ */
  view: V
  /** 終了フレームか */
  done?: boolean
}

export type Tracer<Input, V> = (input: Input) => Frame<V>[]

/** セルの見た目の状態。views 側で色に対応させる */
export type CellState =
  | 'idle'
  | 'active' // いま注目している
  | 'window' // 区間・ウィンドウの内側
  | 'good' // 確定・採用
  | 'bad' // 除外・不一致
  | 'dim' // 探索範囲外

export type Cell = {
  value: string | number
  state?: CellState
  /** セル上部に出す小さな注記 (累積値など) */
  note?: string
}

export type Pointer = {
  name: string
  index: number
  /** 上に出すか下に出すか */
  side?: 'top' | 'bottom'
  tone?: 'accent' | 'ok' | 'warn' | 'danger'
}
