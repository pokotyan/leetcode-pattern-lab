import { getCollection } from 'astro:content'
import { LOWLEVEL_CHAPTERS, READING_SECTIONS } from './curriculum'
import { loadLowLevelNotes } from './prereq'

export type TermPage = {
  id: string
  /** 一覧で短く出す名前。低レイヤは「第 N 回」 */
  label: string
  title: string
  href: string
}

export type Term = {
  name: string
  anchor: string
  /** topics に宣言している回 */
  declared: TermPage[]
  /** 本文に出てくるが、宣言はしていない回 */
  mentioned: TermPage[]
}

export type TermGroup = { id: string; area: string; title: string; terms: Term[] }

/** 「名前空間 / cgroup」のようにまとめて書かれた topics を 1 語ずつに分ける */
export const splitTopic = (topic: string) =>
  topic
    .split(/\s+[/／]\s+/)
    .map((t) => t.trim())
    .filter(Boolean)

export const termAnchor = (name: string) => `t-${name.replace(/\s+/g, '_')}`

export const termHref = (base: string, name: string) =>
  `${base}terms/#${encodeURIComponent(termAnchor(name))}`

// 言及の判定から外すもの。コードブロックの中の語は説明ではなく、ASCII の語は単語の一部に当たると誤検出になる
const stripBody = (body: string) =>
  body.replace(/^```[\s\S]*?^```/gm, '').replace(/^import .*$/gm, '')

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function mentionMatcher(name: string): (text: string) => boolean {
  if (/^[\x20-\x7e]+$/.test(name)) {
    const re = new RegExp(`(?<![A-Za-z0-9_])${escapeRe(name)}(?![A-Za-z0-9_])`, 'i')
    return (text) => re.test(text)
  }
  return (text) => text.includes(name)
}

type Source = { page: TermPage; group: string; topics: string[]; text: string }

export async function loadTerms(base: string) {
  const { notes } = await loadLowLevelNotes()
  const reading = await getCollection('reading')
  const readingRank = new Map(READING_SECTIONS.map((s, i) => [s.id, i]))
  reading.sort(
    (a, b) =>
      (readingRank.get(a.data.category) ?? 99) - (readingRank.get(b.data.category) ?? 99) ||
      a.data.order - b.data.order,
  )

  const sources: Source[] = [
    ...notes
      .filter((n) => n.data.status === 'published')
      .map((n) => ({
        page: {
          id: n.id,
          label: `第 ${Number(n.id.slice(3, 5))} 回`,
          title: n.data.title,
          href: `${base}lowlevel/${n.id}/`,
        },
        group: `lowlevel:${n.data.chapter}`,
        topics: n.data.topics,
        text: stripBody(n.body ?? ''),
      })),
    ...reading
      .filter((r) => r.data.status === 'published')
      .map((r) => ({
        page: { id: r.id, label: r.data.title, title: r.data.title, href: `${base}reading/${r.id}/` },
        group: `reading:${r.data.category}`,
        topics: r.data.topics,
        text: stripBody(r.body ?? ''),
      })),
  ]

  const terms = new Map<string, Term & { group: string }>()
  for (const s of sources) {
    for (const name of s.topics.flatMap(splitTopic)) {
      let t = terms.get(name)
      if (!t) {
        t = { name, anchor: termAnchor(name), declared: [], mentioned: [], group: s.group }
        terms.set(name, t)
      }
      if (!t.declared.some((p) => p.id === s.page.id)) t.declared.push(s.page)
    }
  }
  for (const t of terms.values()) {
    const hit = mentionMatcher(t.name)
    for (const s of sources) {
      if (t.declared.some((p) => p.id === s.page.id)) continue
      if (hit(s.text)) t.mentioned.push(s.page)
    }
  }

  const groups: TermGroup[] = [
    ...LOWLEVEL_CHAPTERS.map((c) => ({ id: `lowlevel:${c.id}`, area: '低レイヤ', title: c.title })),
    ...READING_SECTIONS.map((s) => ({ id: `reading:${s.id}`, area: 'システム設計', title: s.title })),
  ]
    .map((g) => ({ ...g, terms: [...terms.values()].filter((t) => t.group === g.id) }))
    .filter((g) => g.terms.length > 0)

  const countIn = (prefix: string) =>
    new Set(sources.filter((s) => s.group.startsWith(prefix)).flatMap((s) => s.topics.flatMap(splitTopic))).size

  return {
    groups,
    total: terms.size,
    lowlevelCount: countIn('lowlevel:'),
    readingCount: countIn('reading:'),
  }
}
