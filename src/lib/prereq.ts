import { getCollection } from 'astro:content'
import type { CollectionEntry } from 'astro:content'
import { SECTIONS } from './curriculum'

export type Article = CollectionEntry<'articles'>
export type Ref = { id: string; title: string; description: string; level: string }

const toRef = (a: Article): Ref => ({
  id: a.id,
  title: a.data.title,
  description: a.data.description,
  level: a.data.level,
})

const sectionRank = new Map(SECTIONS.map((s, i) => [s.id, i]))

export function orderArticles(all: Article[]): Article[] {
  return [...all].sort((a, b) => {
    const sa = sectionRank.get(a.data.section) ?? 99
    const sb = sectionRank.get(b.data.section) ?? 99
    return sa !== sb ? sa - sb : a.data.order - b.data.order
  })
}

/**
 * requires の slug を記事の実体に解決する。
 * 存在しない slug や自己参照はビルドを止める（リンク切れを本番まで持ち込まないため）。
 */
export async function buildGraph() {
  const all = orderArticles(await getCollection('articles'))
  const byId = new Map(all.map((a) => [a.id, a]))

  const requires = new Map<string, Ref[]>()
  const requiredBy = new Map<string, Ref[]>()
  for (const a of all) {
    requiredBy.set(a.id, [])
  }
  for (const a of all) {
    const refs: Ref[] = []
    for (const slug of a.data.requires) {
      const dep = byId.get(slug)
      if (!dep) {
        throw new Error(
          `[prereq] ${a.id}.mdx の requires に存在しない slug "${slug}" があります。src/content/articles/ を確認してください`,
        )
      }
      if (slug === a.id) {
        throw new Error(`[prereq] ${a.id}.mdx の requires が自分自身を指しています`)
      }
      refs.push(toRef(dep))
      requiredBy.get(slug)!.push(toRef(a))
    }
    requires.set(a.id, refs)
  }

  return { all, byId, requires, requiredBy }
}

/**
 * 前提をすべて満たす順に記事を並べ、同時に読める記事を同じ段にまとめる。
 * 段 0 は前提なしの記事。段 k の記事は、段 k-1 までの記事をすべて読めば読める。
 * 依存が循環していればビルドを止める。
 */
export function layerArticles<T extends { id: string; data: { requires: string[] } }>(
  all: T[],
): T[][] {
  const depth = new Map<string, number>()
  const rest = [...all]
  const layers: T[][] = []

  while (rest.length > 0) {
    const ready = rest.filter((a) => a.data.requires.every((r) => depth.has(r)))
    if (ready.length === 0) {
      throw new Error(
        `[prereq] requires が循環しています: ${rest.map((a) => a.id).join(', ')}`,
      )
    }
    layers.push(ready)
    for (const a of ready) depth.set(a.id, layers.length - 1)
    for (const a of ready) rest.splice(rest.indexOf(a), 1)
  }
  return layers
}


export type MathNote = CollectionEntry<'math'>
export type MathUse = { note: MathNote; why: string }

/**
 * 副読本（数学ノート）と本編記事の対応を作る。
 * - notes: order 順の数学ノート
 * - usedByArticle: 本編の slug -> その記事で使う数学ノートと理由（記事ページ側の逆引き）
 * usedIn / requires に存在しない slug があればビルドを止める。
 */
export async function buildMathGraph() {
  const notes = [...(await getCollection('math'))].sort((a, b) => a.data.order - b.data.order)
  const articles = await getCollection('articles')
  const articleById = new Map(articles.map((a) => [a.id, a]))
  const noteById = new Map(notes.map((n) => [n.id, n]))

  const usedByArticle = new Map<string, MathUse[]>()
  const requires = new Map<string, MathNote[]>()

  for (const n of notes) {
    for (const slug of n.data.requires) {
      if (!noteById.has(slug)) {
        throw new Error(
          `[math] ${n.id}.mdx の requires に存在しない数学ノート "${slug}" があります。src/content/math/ を確認してください`,
        )
      }
      if (slug === n.id) throw new Error(`[math] ${n.id}.mdx の requires が自分自身を指しています`)
    }
    requires.set(
      n.id,
      n.data.requires.map((slug) => noteById.get(slug)!),
    )

    for (const use of n.data.usedIn) {
      if (!articleById.has(use.slug)) {
        throw new Error(
          `[math] ${n.id}.mdx の usedIn に存在しない記事 "${use.slug}" があります。src/content/articles/ を確認してください`,
        )
      }
      const list = usedByArticle.get(use.slug) ?? []
      list.push({ note: n, why: use.why })
      usedByArticle.set(use.slug, list)
    }
  }

  return { notes, noteById, articleById, usedByArticle, requires }
}
