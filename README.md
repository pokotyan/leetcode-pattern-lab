# LeetCode Pattern Lab

LeetCode Medium を「型」で解けるようにするための学習サイト。
解説記事と、アルゴリズムを1手ずつ進めながら状態を確認できるステップ実行を組み合わせている。

- 記事: Astro Content Collections（MDX）
- ステップ実行: React コンポーネント（Astro islands、`client:visible` で遅延読み込み）
- スタイル: Tailwind CSS v4 + CSS 変数（ライト / ダーク切替）
- 配信: GitHub Pages（GitHub Actions からデプロイ）

## 開発

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # dist/ に静的出力
npm run preview
```

## ディレクトリ構成

```
src/
  content/articles/*.mdx      記事。frontmatter で章立てと問題リストを持つ
  content.config.ts           記事の frontmatter スキーマ
  lib/curriculum.ts           セクション（章）の定義と並び順
  layouts/
    BaseLayout.astro          ヘッダー・フッター・テーマ切替
    ArticleLayout.astro       記事の枠、目次、前後リンク
  pages/
    index.astro               トップ（カリキュラム一覧）
    articles/[...slug].astro  記事ページ
  components/
    Callout.astro             補足ボックス
    ProblemTable.astro        記事冒頭の LeetCode 問題リスト
    sim/
      core/
        types.ts              Frame 型（1ステップ分の状態）
        useStepper.ts         再生位置の管理
        SimShell.tsx          ステップ実行の枠（操作UI・コード・変数表示）
        CodePanel.tsx         行ハイライト付きコード表示
        Controls.tsx          入力欄・プリセットボタン
      views/
        ArrayView.tsx         配列 + ポインタ
        GridView.tsx          二次元グリッド
        GraphView.tsx         ノードとエッジ（SVG）
        Legend.tsx / style.ts セルの状態と色の対応
      problems/*.tsx          問題ごとのステップ実行
```

## 記事を追加する

`src/content/articles/<slug>.mdx` を作る。

```mdx
---
title: 記事タイトル
description: 一行の説明
section: array            # lib/curriculum.ts の Section id
order: 3                  # セクション内の並び順
status: published         # published | planned
requires:
  - two-pointers          # 先に読んでほしい記事の slug
problems:
  - name: 3Sum
    url: https://leetcode.com/problems/3sum/
    level: Medium         # Easy | Medium | Hard
    importance: 高        # 高 | 中 | 低
    technique: ソート + 逆方向
---

import Callout from '../../components/Callout.astro'
import ThreeSum from '../../components/sim/problems/ThreeSum'

## 見出し

<ThreeSum client:visible />
```

`status: planned` にすると、トップに「準備中」バッジが付き、記事上部に注記が出る。

## ステップ実行を追加する

各問題は「アルゴリズムを実行しながら1手ごとに `Frame` を積む」トレース関数と、
その `Frame` を描画するコンポーネントの組で作る。

```tsx
import { SimShell } from '../core/SimShell'
import { ArrayView } from '../views/ArrayView'
import type { Cell, Frame, Pointer } from '../core/types'

const CODE = `def solve(nums):
    ...`                      // 表示するコード。行番号は Frame.line と対応させる

type View = { cells: Cell[]; pointers: Pointer[] }

function trace(nums: number[]): Frame<View>[] {
  const frames: Frame<View>[] = []
  // アルゴリズムを実際に動かし、要所で frames.push({ line, note, vars, view }) する
  return frames
}

export default function MyProblem() {
  const frames = useMemo(() => trace(nums), [nums])
  return (
    <SimShell title="..." code={CODE} frames={frames} controls={...} legend={...}>
      {(f) => <ArrayView cells={f.view.cells} pointers={f.view.pointers} />}
    </SimShell>
  )
}
```

`Frame` のフィールド。

| フィールド | 用途 |
| --- | --- |
| `line` | ハイライトするコードの行番号（1-indexed）。配列で複数行 |
| `note` | その手で何をしたかの説明 |
| `vars` | 右側に並べる変数の値 |
| `view` | 描画に必要な問題固有のデータ |

**コードの行番号と `line` の対応がずれやすい**ので、追加後は必ず全ステップを目視で確認する。

`Cell.state` は `idle` / `active` / `window` / `good` / `bad` / `dim` の6種。
色の対応は `views/style.ts` にある。

## GitHub Pages へのデプロイ

`.github/workflows/deploy.yml` が `main` への push で走る。
リポジトリの Settings → Pages で **Source を「GitHub Actions」** にすると有効になる。

- **private リポジトリで Pages を公開するには GitHub Pro 以上が必要**。
  無料プランの場合はリポジトリを public にする
- 公開 URL は `https://<user>.github.io/<repo>/`
- サブパス配信のため、`astro.config.mjs` の `REPO` をリポジトリ名に合わせる
  （ローカル開発時は `base: '/'`、Actions 実行時のみ `/<repo>` になる）
