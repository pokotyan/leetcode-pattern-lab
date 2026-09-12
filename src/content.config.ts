import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const problem = z.object({
  name: z.string(),
  url: z.string().url(),
  /** LeetCode 上の難易度 */
  level: z.enum(['Easy', 'Medium', 'Hard']),
  /** 本書での重要度 */
  importance: z.enum(['高', '中', '低']).default('高'),
  technique: z.string(),
})

const articles = defineCollection({
  loader: glob({ base: 'src/content/articles', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    /** curriculum.ts の Section id */
    section: z.string(),
    /** セクション内の並び順 */
    order: z.number(),
    /** 学習段階。index / path ページのグルーピングに使う */
    level: z.enum(['基礎', '応用', '発展']).default('基礎'),
    status: z.enum(['published', 'planned']).default('published'),
    /** 前提として先に読む記事の slug */
    requires: z.array(z.string()).default([]),
    problems: z.array(problem).default([]),
    updated: z.string().optional(),
  }),
})

/**
 * 副読本（数学ノート）。本編のカリキュラムとは別の並びで、
 * usedIn によって「この知識をどの型で使うのか」を逆向きに引けるようにする。
 */
const math = defineCollection({
  loader: glob({ base: 'src/content/math', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    /** 副読本の中での並び順 */
    order: z.number(),
    status: z.enum(['published', 'planned']).default('published'),
    /** 先に読む数学ノートの slug */
    requires: z.array(z.string()).default([]),
    /** この知識を使う本編記事の slug と、そこで何に使うのか */
    usedIn: z
      .array(
        z.object({
          slug: z.string(),
          why: z.string(),
        }),
      )
      .default([]),
    problems: z.array(problem).default([]),
  }),
})

/**
 * 読み物（実務で出てくる仕組みの解説）。
 * basedOn で「この仕組みの土台になっている型・数学」を指し、
 * 型の側からは逆向きに「この型が実務で効いている場面」として引ける。
 */
const reading = defineCollection({
  loader: glob({ base: 'src/content/reading', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    /** curriculum.ts の READING_SECTIONS の id */
    category: z.string(),
    order: z.number(),
    status: z.enum(['published', 'planned']).default('published'),
    /** この読み物で扱う用語。索引に出す */
    topics: z.array(z.string()).default([]),
    /** 土台になっている本編の型 / 数学ノートと、そこで何が効いているのか */
    basedOn: z
      .array(
        z.object({
          kind: z.enum(['article', 'math']),
          slug: z.string(),
          why: z.string(),
        }),
      )
      .default([]),
    problems: z.array(problem).default([]),
  }),
})

export const collections = { articles, math, reading }
