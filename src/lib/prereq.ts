import { getCollection } from 'astro:content'
import type { CollectionEntry } from 'astro:content'
import { BUILD_TRACKS, LOWLEVEL_CHAPTERS, SECTIONS } from './curriculum'

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


export type ReadingNote = CollectionEntry<'reading'>
export type ReadingUse = { note: ReadingNote; why: string }

/**
 * 読み物と、その土台になっている型・数学ノートの対応を作る。
 * - byArticle / byMath: 型・数学の slug -> その型を使っている読み物（逆向きの引き方）
 * basedOn に存在しない slug があればビルドを止める。
 */
export async function buildReadingGraph() {
  const notes = [...(await getCollection('reading'))].sort((a, b) => a.data.order - b.data.order)
  const articles = await getCollection('articles')
  const mathNotes = await getCollection('math')
  const articleById = new Map(articles.map((a) => [a.id, a]))
  const mathById = new Map(mathNotes.map((m) => [m.id, m]))

  const byArticle = new Map<string, ReadingUse[]>()
  const byMath = new Map<string, ReadingUse[]>()

  for (const n of notes) {
    for (const b of n.data.basedOn) {
      const exists = b.kind === 'article' ? articleById.has(b.slug) : mathById.has(b.slug)
      if (!exists) {
        throw new Error(
          `[reading] ${n.id}.mdx の basedOn に存在しない ${b.kind} "${b.slug}" があります`,
        )
      }
      const target = b.kind === 'article' ? byArticle : byMath
      const list = target.get(b.slug) ?? []
      list.push({ note: n, why: b.why })
      target.set(b.slug, list)
    }
  }

  return { notes, articleById, mathById, byArticle, byMath }
}


export type BuildStep = CollectionEntry<'build'>

const trackRank = new Map(BUILD_TRACKS.map((t, i) => [t.id, i]))

/**
 * 作って学ぶトラックの回を、トラックの並び順 → 回の order の順に並べる。
 * requires / basedOn に存在しない slug があればビルドを止める。
 */
export async function loadBuildSteps() {
  const steps = [...(await getCollection('build'))].sort((a, b) => {
    const ta = trackRank.get(a.data.track) ?? 99
    const tb = trackRank.get(b.data.track) ?? 99
    return ta !== tb ? ta - tb : a.data.order - b.data.order
  })
  const byId = new Map(steps.map((s) => [s.id, s]))
  const articleById = new Map((await getCollection('articles')).map((a) => [a.id, a]))
  const mathById = new Map((await getCollection('math')).map((m) => [m.id, m]))
  const readingById = new Map((await getCollection('reading')).map((r) => [r.id, r]))

  const requires = new Map<string, BuildStep[]>()
  for (const s of steps) {
    if (!trackRank.has(s.data.track)) {
      throw new Error(`[build] ${s.id}.mdx の track "${s.data.track}" が BUILD_TRACKS にありません`)
    }
    for (const slug of s.data.requires) {
      if (!byId.has(slug)) {
        throw new Error(`[build] ${s.id}.mdx の requires に存在しない回 "${slug}" があります`)
      }
      if (slug === s.id) throw new Error(`[build] ${s.id}.mdx の requires が自分自身を指しています`)
    }
    requires.set(
      s.id,
      s.data.requires.map((slug) => byId.get(slug)!),
    )

    for (const b of s.data.basedOn) {
      const pool = b.kind === 'article' ? articleById : b.kind === 'math' ? mathById : readingById
      if (!pool.has(b.slug)) {
        throw new Error(`[build] ${s.id}.mdx の basedOn に存在しない ${b.kind} "${b.slug}" があります`)
      }
    }
  }

  return { steps, byId, requires, articleById, mathById, readingById }
}


export type LowLevelNote = CollectionEntry<'lowlevel'>

const chapterRank = new Map(LOWLEVEL_CHAPTERS.map((c, i) => [c.id, i]))

/**
 * 低レイヤの読み物を、章の並び順 → 章内の order の順に並べる。
 * requires / handsOn に存在しない slug があればビルドを止める。
 */
export async function loadLowLevelNotes() {
  const notes = [...(await getCollection('lowlevel'))].sort((a, b) => {
    const ca = chapterRank.get(a.data.chapter) ?? 99
    const cb = chapterRank.get(b.data.chapter) ?? 99
    return ca !== cb ? ca - cb : a.data.order - b.data.order
  })
  const byId = new Map(notes.map((n) => [n.id, n]))
  const buildById = new Map((await getCollection('build')).map((b) => [b.id, b]))

  const requires = new Map<string, LowLevelNote[]>()
  for (const n of notes) {
    if (!chapterRank.has(n.data.chapter)) {
      throw new Error(`[lowlevel] ${n.id}.mdx の chapter "${n.data.chapter}" が LOWLEVEL_CHAPTERS にありません`)
    }
    for (const slug of n.data.requires) {
      if (!byId.has(slug)) {
        throw new Error(`[lowlevel] ${n.id}.mdx の requires に存在しない回 "${slug}" があります`)
      }
      if (slug === n.id) throw new Error(`[lowlevel] ${n.id}.mdx の requires が自分自身を指しています`)
    }
    requires.set(
      n.id,
      n.data.requires.map((slug) => byId.get(slug)!),
    )
    for (const h of n.data.handsOn) {
      if (!buildById.has(h.slug)) {
        throw new Error(`[lowlevel] ${n.id}.mdx の handsOn に存在しない build の回 "${h.slug}" があります`)
      }
    }
  }

  return { notes, byId, requires, buildById }
}
