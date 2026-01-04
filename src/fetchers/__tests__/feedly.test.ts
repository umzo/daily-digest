import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FeedlyFetcher } from '../feedly'
import * as secrets from '../../secrets'
import type { Article } from '../types'

// secrets モジュールをモック
vi.mock('../../secrets')

// グローバル fetch をモック
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

/** プロファイルレスポンスのモック */
const mockProfileResponse = {
  id: 'user/12345678-1234-1234-1234-123456789abc',
}

/** プロファイル取得成功のモックを設定 */
function mockProfileSuccess() {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(mockProfileResponse),
  }
}

describe('FeedlyFetcher', () => {
  let fetcher: FeedlyFetcher

  beforeEach(() => {
    vi.clearAllMocks()
    fetcher = new FeedlyFetcher()

    // デフォルトでシークレットを返す
    vi.mocked(secrets.getSecrets).mockResolvedValue({
      ANTHROPIC_API_KEY: 'test-anthropic-key',
      FEEDLY_ACCESS_TOKEN: 'test-feedly-token',
      GITHUB_TOKEN: 'test-github-token',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('正常系', () => {
    it('Feedly API から未読記事を取得できる', async () => {
      const mockStreamResponse = {
        items: [
          {
            id: 'entry-1',
            title: 'テスト記事1',
            content: { content: '<p>記事の内容</p>' },
            alternate: [{ href: 'https://example.com/article1' }],
            author: 'テスト著者',
            published: 1704067200000, // 2024-01-01T00:00:00Z
            keywords: ['tech', 'news'],
          },
        ],
      }

      mockFetch
        .mockResolvedValueOnce(mockProfileSuccess())
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockStreamResponse),
        })

      const articles = await fetcher.fetch()

      expect(articles).toHaveLength(1)
      expect(articles[0].id).toBe('entry-1')
      expect(articles[0].source).toBe('feedly')
      expect(articles[0].title).toBe('テスト記事1')

      // プロファイルAPIが呼ばれていることを確認
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockFetch.mock.calls[0][0]).toContain('/profile')
      expect(mockFetch.mock.calls[1][0]).toContain('/streams/contents')
    })

    it('Feedly レスポンスを Article 形式に正しく変換できる', async () => {
      const mockStreamResponse = {
        items: [
          {
            id: 'entry-2',
            title: 'TypeScript の新機能',
            content: {
              content:
                '<p>TypeScriptに<strong>新しい機能</strong>が追加されました。</p>',
            },
            alternate: [{ href: 'https://example.com/typescript' }],
            author: 'Tech Writer',
            published: 1704153600000, // 2024-01-02T00:00:00Z
            keywords: ['typescript', 'programming'],
          },
        ],
      }

      mockFetch
        .mockResolvedValueOnce(mockProfileSuccess())
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockStreamResponse),
        })

      const articles = await fetcher.fetch()
      const article = articles[0]

      expect(article).toEqual<Article>({
        id: 'entry-2',
        source: 'feedly',
        title: 'TypeScript の新機能',
        content: 'TypeScriptに新しい機能が追加されました。',
        url: 'https://example.com/typescript',
        author: 'Tech Writer',
        publishedAt: new Date(1704153600000),
        tags: ['typescript', 'programming'],
        feedlyUrl: 'https://feedly.com/i/entry/entry-2',
      })
    })

    it('未読記事がない場合は空配列を返す', async () => {
      const mockStreamResponse = {
        items: [],
      }

      mockFetch
        .mockResolvedValueOnce(mockProfileSuccess())
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockStreamResponse),
        })

      const articles = await fetcher.fetch()

      expect(articles).toEqual([])
    })

    it('記事の publishedAt を Date オブジェクトに変換する', async () => {
      const timestamp = 1704067200000 // 2024-01-01T00:00:00Z
      const mockStreamResponse = {
        items: [
          {
            id: 'entry-3',
            title: '日付テスト',
            content: { content: '本文' },
            alternate: [{ href: 'https://example.com' }],
            published: timestamp,
          },
        ],
      }

      mockFetch
        .mockResolvedValueOnce(mockProfileSuccess())
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockStreamResponse),
        })

      const articles = await fetcher.fetch()

      expect(articles[0].publishedAt).toBeInstanceOf(Date)
      expect(articles[0].publishedAt.getTime()).toBe(timestamp)
    })

    it('summary フィールドがある場合は summary を使用する', async () => {
      const mockStreamResponse = {
        items: [
          {
            id: 'entry-4',
            title: 'サマリーテスト',
            summary: { content: '<p>これはサマリーです</p>' },
            alternate: [{ href: 'https://example.com' }],
            published: 1704067200000,
          },
        ],
      }

      mockFetch
        .mockResolvedValueOnce(mockProfileSuccess())
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockStreamResponse),
        })

      const articles = await fetcher.fetch()

      expect(articles[0].content).toBe('これはサマリーです')
    })

    it('content と summary が両方ある場合は content を優先する', async () => {
      const mockStreamResponse = {
        items: [
          {
            id: 'entry-5',
            title: '優先度テスト',
            content: { content: '<p>これはコンテンツです</p>' },
            summary: { content: '<p>これはサマリーです</p>' },
            alternate: [{ href: 'https://example.com' }],
            published: 1704067200000,
          },
        ],
      }

      mockFetch
        .mockResolvedValueOnce(mockProfileSuccess())
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockStreamResponse),
        })

      const articles = await fetcher.fetch()

      expect(articles[0].content).toBe('これはコンテンツです')
    })

    it('ユーザーIDをキャッシュして再利用する', async () => {
      const mockStreamResponse = { items: [] }

      // 1回目の呼び出し
      mockFetch
        .mockResolvedValueOnce(mockProfileSuccess())
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockStreamResponse),
        })

      await fetcher.fetch()

      // 2回目の呼び出し（プロファイルはキャッシュから取得）
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockStreamResponse),
      })

      await fetcher.fetch()

      // プロファイルAPIは1回だけ呼ばれる（2回目はキャッシュ）
      const profileCalls = mockFetch.mock.calls.filter((call) =>
        call[0].includes('/profile')
      )
      expect(profileCalls).toHaveLength(1)
    })

    it('正しいstream IDでAPIを呼び出す', async () => {
      const mockStreamResponse = { items: [] }

      mockFetch
        .mockResolvedValueOnce(mockProfileSuccess())
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockStreamResponse),
        })

      await fetcher.fetch()

      // streams/contents の呼び出しを確認
      const streamCall = mockFetch.mock.calls.find((call) =>
        call[0].includes('/streams/contents')
      )
      expect(streamCall).toBeDefined()

      const url = new URL(streamCall![0])
      expect(url.searchParams.get('streamId')).toBe(
        'user/12345678-1234-1234-1234-123456789abc/category/global.all'
      )
      expect(url.searchParams.get('count')).toBe('100')
      // newerThan と olderThan が設定されていることを確認
      expect(url.searchParams.get('newerThan')).toBeTruthy()
      expect(url.searchParams.get('olderThan')).toBeTruthy()
      // olderThan > newerThan であることを確認（24時間の範囲）
      const newerThan = Number(url.searchParams.get('newerThan'))
      const olderThan = Number(url.searchParams.get('olderThan'))
      expect(olderThan - newerThan).toBe(24 * 60 * 60 * 1000)
    })
  })

  describe('エラーハンドリング', () => {
    it('レート制限 (429) 時に指数バックオフで最大3回リトライする', async () => {
      // プロファイル取得は成功、ストリーム取得で429を返す
      mockFetch
        .mockResolvedValueOnce(mockProfileSuccess())
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [] }),
        })

      const articles = await fetcher.fetch()

      expect(articles).toEqual([])
      // プロファイル(1) + ストリーム(4回: 初回 + 3リトライ)
      expect(mockFetch).toHaveBeenCalledTimes(5)
    }, 30000)

    it('個別記事の変換失敗時はスキップしてログ出力する', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      const mockStreamResponse = {
        items: [
          {
            id: 'valid-entry',
            title: '正常な記事',
            content: { content: '本文' },
            alternate: [{ href: 'https://example.com/valid' }],
            published: 1704067200000,
          },
          {
            // 不完全な記事（alternate がない）
            id: 'invalid-entry',
            title: '不正な記事',
            content: { content: '本文' },
            published: 1704067200000,
          },
        ],
      }

      mockFetch
        .mockResolvedValueOnce(mockProfileSuccess())
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockStreamResponse),
        })

      const articles = await fetcher.fetch()

      // 正常な記事のみ返される
      expect(articles).toHaveLength(1)
      expect(articles[0].id).toBe('valid-entry')

      // エラーログが出力される
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('認証エラー (401) 時は適切なエラーをスローする', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      })

      await expect(fetcher.fetch()).rejects.toThrow('認証エラー')
    })

    it('ネットワークエラー時はリトライする', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockProfileSuccess())
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [] }),
        })

      const articles = await fetcher.fetch()

      expect(articles).toEqual([])
      // ネットワークエラー(2) + プロファイル成功(1) + ストリーム成功(1)
      expect(mockFetch).toHaveBeenCalledTimes(4)
    }, 30000)

    it('最大リトライ回数を超えた場合はエラーをスローする', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 429 })

      await expect(fetcher.fetch()).rejects.toThrow()
      // 最初の1回 + 3回リトライ = 4回
      expect(mockFetch).toHaveBeenCalledTimes(4)
    }, 30000)
  })

  describe('Fetcher インターフェース', () => {
    it('name プロパティが "feedly" を返す', () => {
      expect(fetcher.name).toBe('feedly')
    })
  })
})
