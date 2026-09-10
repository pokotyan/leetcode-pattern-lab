import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import mdx from '@astrojs/mdx'
import tailwind from '@tailwindcss/vite'

// GitHub Pages のプロジェクトサイトはサブパス配信になるため base が必要。
// リポジトリ名を変えたらここも変える。
const REPO = 'leetcode-pattern-lab'
const isPages = process.env.GITHUB_ACTIONS === 'true'

export default defineConfig({
  site: `https://pokotyan.github.io/${REPO}`,
  base: isPages ? `/${REPO}` : '/',
  trailingSlash: 'always',
  integrations: [react(), mdx()],
  vite: { plugins: [tailwind()] },
  markdown: {
    shikiConfig: { theme: 'github-dark', wrap: true },
  },
})
