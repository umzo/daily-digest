/**
 * Formatter テスト
 */

import { describe, it, expect } from 'vitest'
import {
  Formatter,
  formatDigest,
  type DigestOptions,
  type DigestResult,
} from '../formatter'
import type { Summary, Article } from '../fetchers/types'

/** テスト用の Article を生成 */
function createArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 'article-1',
    source: 'feedly',
    title: 'Test Article',
    content: 'Test content',
    url: 'https://example.com/article',
    publishedAt: new Date('2025-01-01T12:00:00Z'),
    ...overrides,
  }
}

/** テスト用の Summary を生成 */
function createSummary(overrides: Partial<Summary> = {}): Summary {
  return {
    article: createArticle(overrides.article),
    bullets: ['要点1', '要点2', '要点3'],
    category: 'Tech',
    ...overrides,
  }
}

describe('Formatter', () => {
  describe('Markdown 生成', () => {
    it('Obsidian 互換の Markdown を生成できる', () => {
      const formatter = new Formatter()
      const summaries = [createSummary()]
      const result = formatter.format(summaries, {
        date: new Date('2025-01-01'),
      })

      // frontmatter を含む
      expect(result.content).toContain('---')
      // タイトルを含む
      expect(result.content).toContain('# Daily Digest - 2025-01-01')
    })

    it('記事タイトルを h3 見出しで出力する', () => {
      const formatter = new Formatter()
      const summaries = [
        createSummary({
          article: createArticle({ title: 'OpenAI が GPT-5 を発表' }),
        }),
      ]
      const result = formatter.format(summaries, {
        date: new Date('2025-01-01'),
      })

      expect(result.content).toContain('### OpenAI が GPT-5 を発表')
    })

    it('要点を箇条書きリストで出力する', () => {
      const formatter = new Formatter()
      const summaries = [
        createSummary({
          bullets: ['マルチモーダル性能が向上', 'API価格は据え置き'],
        }),
      ]
      const result = formatter.format(summaries, {
        date: new Date('2025-01-01'),
      })

      expect(result.content).toContain('- マルチモーダル性能が向上')
      expect(result.content).toContain('- API価格は据え置き')
    })

    it('ソースリンクを blockquote で出力する', () => {
      const formatter = new Formatter()
      const summaries = [
        createSummary({
          article: createArticle({
            url: 'https://example.com/article1',
            source: 'feedly',
          }),
        }),
      ]
      const result = formatter.format(summaries, {
        date: new Date('2025-01-01'),
      })

      expect(result.content).toContain(
        '> [Source](https://example.com/article1) via Feedly'
      )
    })

    it('feedlyUrl がある場合は feedlyUrl をリンクに使用する', () => {
      const formatter = new Formatter()
      const summaries = [
        createSummary({
          article: createArticle({
            url: 'https://example.com/article1',
            source: 'feedly',
            feedlyUrl: 'https://feedly.com/i/entry/abc123',
          }),
        }),
      ]
      const result = formatter.format(summaries, {
        date: new Date('2025-01-01'),
      })

      expect(result.content).toContain(
        '> [Source](https://feedly.com/i/entry/abc123) via Feedly'
      )
    })
  })

  describe('YAML frontmatter', () => {
    it('date フィールドを YYYY-MM-DD 形式で出力する', () => {
      const formatter = new Formatter()
      const summaries = [createSummary()]
      const result = formatter.format(summaries, {
        date: new Date('2025-01-15'),
      })

      expect(result.content).toContain('date: 2025-01-15')
    })

    it('sources フィールドにデータソース一覧を出力する', () => {
      const formatter = new Formatter()
      const summaries = [
        createSummary({ article: createArticle({ source: 'feedly' }) }),
        createSummary({ article: createArticle({ source: 'rss' }) }),
      ]
      const result = formatter.format(summaries, {
        date: new Date('2025-01-01'),
      })

      expect(result.content).toContain('sources:')
      expect(result.content).toContain('  - feedly')
      expect(result.content).toContain('  - rss')
    })

    it('article_count フィールドに記事数を出力する', () => {
      const formatter = new Formatter()
      const summaries = [createSummary(), createSummary(), createSummary()]
      const result = formatter.format(summaries, {
        date: new Date('2025-01-01'),
      })

      expect(result.content).toContain('article_count: 3')
    })

    it('tags フィールドに digest, daily を出力する', () => {
      const formatter = new Formatter()
      const summaries = [createSummary()]
      const result = formatter.format(summaries, {
        date: new Date('2025-01-01'),
      })

      expect(result.content).toContain('tags:')
      expect(result.content).toContain('  - digest')
      expect(result.content).toContain('  - daily')
    })
  })

  describe('カテゴリ分類', () => {
    it('記事をカテゴリ別にグループ化できる', () => {
      const formatter = new Formatter()
      const summaries = [
        createSummary({ category: 'Tech' }),
        createSummary({ category: 'Business' }),
        createSummary({ category: 'Tech' }),
      ]
      const result = formatter.format(summaries, {
        date: new Date('2025-01-01'),
      })

      // Tech セクションの後に Business セクション
      const techIndex = result.content.indexOf('## Tech')
      const businessIndex = result.content.indexOf('## Business')
      expect(techIndex).toBeGreaterThan(-1)
      expect(businessIndex).toBeGreaterThan(-1)
    })

    it('カテゴリを h2 見出しで出力する', () => {
      const formatter = new Formatter()
      const summaries = [createSummary({ category: 'Tech' })]
      const result = formatter.format(summaries, {
        date: new Date('2025-01-01'),
      })

      expect(result.content).toContain('## Tech')
    })

    it('カテゴリがない記事は Other に分類する', () => {
      const formatter = new Formatter()
      const summaries = [createSummary({ category: undefined })]
      const result = formatter.format(summaries, {
        date: new Date('2025-01-01'),
      })

      expect(result.content).toContain('## Other')
    })

    it('カテゴリ間にセパレータを出力する', () => {
      const formatter = new Formatter()
      const summaries = [
        createSummary({ category: 'Tech' }),
        createSummary({ category: 'Business' }),
      ]
      const result = formatter.format(summaries, {
        date: new Date('2025-01-01'),
      })

      // カテゴリ間に --- セパレータがある
      const techIndex = result.content.indexOf('## Tech')
      const businessIndex = result.content.indexOf('## Business')
      const separatorIndex = result.content.indexOf(
        '---',
        techIndex + '## Tech'.length
      )
      expect(separatorIndex).toBeGreaterThan(techIndex)
      expect(separatorIndex).toBeLessThan(businessIndex)
    })
  })

  describe('境界値', () => {
    it('記事が 0 件の場合も有効な Markdown を生成する', () => {
      const formatter = new Formatter()
      const result = formatter.format([], { date: new Date('2025-01-01') })

      expect(result.content).toContain('---')
      expect(result.content).toContain('# Daily Digest - 2025-01-01')
      expect(result.content).toContain('article_count: 0')
    })

    it('カテゴリが 1 種類のみの場合も正しく出力する', () => {
      const formatter = new Formatter()
      const summaries = [
        createSummary({ category: 'Tech' }),
        createSummary({ category: 'Tech' }),
      ]
      const result = formatter.format(summaries, {
        date: new Date('2025-01-01'),
      })

      // 1つのカテゴリのみ
      expect(result.content).toContain('## Tech')
      // Business や Other が含まれない
      expect(result.content).not.toContain('## Business')
      expect(result.content).not.toContain('## Other')
    })

    it('非常に長いタイトルを適切に処理する', () => {
      const formatter = new Formatter()
      const longTitle = 'A'.repeat(500)
      const summaries = [
        createSummary({ article: createArticle({ title: longTitle }) }),
      ]
      const result = formatter.format(summaries, {
        date: new Date('2025-01-01'),
      })

      expect(result.content).toContain(`### ${longTitle}`)
    })
  })

  describe('生成日時', () => {
    it('末尾に生成日時を含む', () => {
      const formatter = new Formatter()
      const summaries = [createSummary()]
      const result = formatter.format(summaries, {
        date: new Date('2025-01-01'),
      })

      expect(result.content).toContain('*Generated at')
    })
  })
})

describe('formatDigest', () => {
  it('digests/YYYY-MM-DD.md 形式のパスを生成する', () => {
    const summaries = [createSummary()]
    const result = formatDigest(summaries, { date: new Date('2025-01-15') })

    expect(result.path).toBe('digests/2025-01-15.md')
  })

  it('groupBy オプションでグループ化方法を指定できる', () => {
    const summaries = [
      createSummary({
        article: createArticle({ source: 'feedly' }),
        category: 'Tech',
      }),
      createSummary({
        article: createArticle({ source: 'rss' }),
        category: 'Business',
      }),
    ]

    // デフォルト (category)
    const resultByCategory = formatDigest(summaries, {
      date: new Date('2025-01-01'),
      groupBy: 'category',
    })
    expect(resultByCategory.content).toContain('## Tech')
    expect(resultByCategory.content).toContain('## Business')

    // source でグループ化
    const resultBySource = formatDigest(summaries, {
      date: new Date('2025-01-01'),
      groupBy: 'source',
    })
    expect(resultBySource.content).toContain('## Feedly')
    expect(resultBySource.content).toContain('## Rss')
  })
})
