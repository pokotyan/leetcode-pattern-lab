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

export const collections = { articles }
