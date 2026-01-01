import { describe, it, expect } from 'vitest'
import type { Article, Fetcher, Summary } from '../types'

describe('Article', () => {
  it('必須フィールド (id, source, title, content, url, publishedAt) を持つ', () => {
    const article: Article = {
      id: 'article-123',
      source: 'feedly',
      title: 'テスト記事',
      content: 'これはテスト記事の本文です。',
      url: 'https://example.com/article',
      publishedAt: new Date('2025-01-01T00:00:00Z'),
    }

    expect(article.id).toBe('article-123')
    expect(article.source).toBe('feedly')
    expect(article.title).toBe('テスト記事')
    expect(article.content).toBe('これはテスト記事の本文です。')
    expect(article.url).toBe('https://example.com/article')
    expect(article.publishedAt).toEqual(new Date('2025-01-01T00:00:00Z'))
  })

  it('オプションフィールド (author, tags) は省略可能', () => {
    // author と tags を含む記事
    const articleWithOptionals: Article = {
      id: 'article-456',
      source: 'rss',
      title: 'オプション付き記事',
      content: '本文',
      url: 'https://example.com/article2',
      publishedAt: new Date('2025-01-02T00:00:00Z'),
      author: '著者名',
      tags: ['tech', 'news'],
    }

    expect(articleWithOptionals.author).toBe('著者名')
    expect(articleWithOptionals.tags).toEqual(['tech', 'news'])

    // author と tags を省略した記事
    const articleWithoutOptionals: Article = {
      id: 'article-789',
      source: 'x',
      title: 'オプションなし記事',
      content: '本文',
      url: 'https://example.com/article3',
      publishedAt: new Date('2025-01-03T00:00:00Z'),
    }

    expect(articleWithoutOptionals.author).toBeUndefined()
    expect(articleWithoutOptionals.tags).toBeUndefined()
  })
})

describe('Fetcher', () => {
  it('name プロパティを持つ', () => {
    const mockFetcher: Fetcher = {
      name: 'test-fetcher',
      fetch: async () => [],
    }

    expect(mockFetcher.name).toBe('test-fetcher')
  })

  it('fetch() メソッドで Article[] を返す', async () => {
    const articles: Article[] = [
      {
        id: 'article-1',
        source: 'test',
        title: '記事1',
        content: '本文1',
        url: 'https://example.com/1',
        publishedAt: new Date('2025-01-01T00:00:00Z'),
      },
      {
        id: 'article-2',
        source: 'test',
        title: '記事2',
        content: '本文2',
        url: 'https://example.com/2',
        publishedAt: new Date('2025-01-02T00:00:00Z'),
      },
    ]

    const mockFetcher: Fetcher = {
      name: 'test-fetcher',
      fetch: async () => articles,
    }

    const result = await mockFetcher.fetch()

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('article-1')
    expect(result[1].id).toBe('article-2')
  })
})

describe('Summary', () => {
  it('必須フィールド (article, bullets) を持つ', () => {
    const article: Article = {
      id: 'article-1',
      source: 'feedly',
      title: '要約対象記事',
      content: '本文',
      url: 'https://example.com/1',
      publishedAt: new Date('2025-01-01T00:00:00Z'),
    }

    const summary: Summary = {
      article,
      bullets: ['要点1', '要点2', '要点3'],
    }

    expect(summary.article).toBe(article)
    expect(summary.bullets).toEqual(['要点1', '要点2', '要点3'])
  })

  it('オプションフィールド (category) は省略可能', () => {
    const article: Article = {
      id: 'article-2',
      source: 'rss',
      title: 'カテゴリ付き記事',
      content: '本文',
      url: 'https://example.com/2',
      publishedAt: new Date('2025-01-02T00:00:00Z'),
    }

    const summaryWithCategory: Summary = {
      article,
      bullets: ['要点1', '要点2'],
      category: 'Tech',
    }

    expect(summaryWithCategory.category).toBe('Tech')

    const summaryWithoutCategory: Summary = {
      article,
      bullets: ['要点1', '要点2'],
    }

    expect(summaryWithoutCategory.category).toBeUndefined()
  })
})
