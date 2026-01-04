/**
 * Lambda Handler のテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Context, ScheduledEvent } from 'aws-lambda'
import type { Article, Summary } from '../fetchers/types'

// モック関数の定義
const mockFetch = vi.fn()
const mockSummarize = vi.fn()
const mockFormat = vi.fn()
const mockPublish = vi.fn()

// モック設定
vi.mock('../secrets', () => ({
  getSecrets: vi.fn().mockResolvedValue({
    FEEDLY_ACCESS_TOKEN: 'mock-feedly-token',
    ANTHROPIC_API_KEY: 'mock-anthropic-key',
    GITHUB_TOKEN: 'mock-github-token',
  }),
}))

vi.mock('../fetchers/feedly', () => ({
  FeedlyFetcher: class MockFeedlyFetcher {
    name = 'feedly'
    fetch = mockFetch
  },
}))

vi.mock('../summarizer', () => ({
  Summarizer: class MockSummarizer {
    summarize = mockSummarize
  },
}))

vi.mock('../formatter', () => ({
  Formatter: class MockFormatter {
    format = mockFormat
  },
}))

vi.mock('../publisher', () => ({
  Publisher: class MockPublisher {
    publish = mockPublish
  },
}))

// ハンドラーをインポート（モック設定後）
import { handler, HandlerResult } from '../index'

/** テスト用の記事データ */
function createMockArticle(id: string): Article {
  return {
    id,
    source: 'feedly',
    title: `テスト記事 ${id}`,
    content: `これはテスト記事 ${id} の内容です。`,
    url: `https://example.com/article/${id}`,
    author: 'テスト著者',
    publishedAt: new Date('2025-01-01T09:00:00Z'),
    tags: ['test'],
  }
}

/** テスト用の要約データ */
function createMockSummary(article: Article): Summary {
  return {
    article,
    bullets: ['要点1', '要点2', '要点3'],
    category: 'Tech',
  }
}

/** テスト用の EventBridge イベント */
function createScheduledEvent(): ScheduledEvent {
  return {
    version: '0',
    id: 'test-event-id',
    'detail-type': 'Scheduled Event',
    source: 'aws.events',
    account: '123456789012',
    time: '2025-01-01T21:00:00Z',
    region: 'ap-northeast-1',
    resources: ['arn:aws:events:ap-northeast-1:123456789012:rule/daily-digest-schedule'],
    detail: {},
  }
}

/** テスト用の Lambda Context */
function createMockContext(): Context {
  return {
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'daily-digest',
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:aws:lambda:ap-northeast-1:123456789012:function:daily-digest',
    memoryLimitInMB: '256',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/daily-digest',
    logStreamName: '2025/01/01/[$LATEST]test',
    getRemainingTimeInMillis: () => 900000, // 15分
    done: () => {},
    fail: () => {},
    succeed: () => {},
  }
}

describe('Lambda Handler', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    // デフォルトの環境変数を設定
    process.env = {
      ...originalEnv,
      GITHUB_OWNER: 'test-owner',
      GITHUB_REPO: 'test-repo',
      GITHUB_BRANCH: 'main',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('EventBridge トリガー', () => {
    it('EventBridge スケジュールイベントを受信して処理を開始する', async () => {
      const articles = [createMockArticle('1')]
      const summaries = [createMockSummary(articles[0])]

      mockFetch.mockResolvedValue(articles)
      mockSummarize.mockResolvedValue(summaries)
      mockFormat.mockReturnValue({
        content: '# Daily Digest',
        path: 'digests/2025-01-01.md',
      })
      mockPublish.mockResolvedValue({ commitSha: 'abc123', path: 'digests/2025-01-01.md' })

      const event = createScheduledEvent()
      const context = createMockContext()

      const result = await handler(event, context)

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalled()
    })

    it('イベントなしでも手動実行できる', async () => {
      const articles = [createMockArticle('1')]
      const summaries = [createMockSummary(articles[0])]

      mockFetch.mockResolvedValue(articles)
      mockSummarize.mockResolvedValue(summaries)
      mockFormat.mockReturnValue({
        content: '# Daily Digest',
        path: 'digests/2025-01-01.md',
      })
      mockPublish.mockResolvedValue({ commitSha: 'abc123', path: 'digests/2025-01-01.md' })

      const context = createMockContext()

      // 空のイベントで手動実行
      const result = await handler({}, context)

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalled()
    })
  })

  describe('パイプライン統合', () => {
    it('Fetcher → Summarizer → Formatter → Publisher の順で処理する', async () => {
      const callOrder: string[] = []

      const articles = [createMockArticle('1'), createMockArticle('2')]
      const summaries = articles.map(createMockSummary)

      mockFetch.mockImplementation(async () => {
        callOrder.push('fetch')
        return articles
      })
      mockSummarize.mockImplementation(async () => {
        callOrder.push('summarize')
        return summaries
      })
      mockFormat.mockImplementation(() => {
        callOrder.push('format')
        return {
          content: '# Daily Digest',
          path: 'digests/2025-01-01.md',
        }
      })
      mockPublish.mockImplementation(async () => {
        callOrder.push('publish')
        return { commitSha: 'abc123' }
      })

      await handler({}, createMockContext())

      expect(callOrder).toEqual(['fetch', 'summarize', 'format', 'publish'])
    })

    it('各ステップの出力が次のステップの入力となる', async () => {
      const articles = [createMockArticle('1'), createMockArticle('2')]
      const summaries = articles.map(createMockSummary)
      const digestContent = '# Daily Digest\n\nTest content'
      const digestPath = 'digests/2025-01-01.md'

      mockFetch.mockResolvedValue(articles)
      mockSummarize.mockResolvedValue(summaries)
      mockFormat.mockReturnValue({
        content: digestContent,
        path: digestPath,
      })
      mockPublish.mockResolvedValue({ commitSha: 'abc123', path: 'digests/2025-01-01.md' })

      await handler({}, createMockContext())

      // Summarizer が Fetcher の結果を受け取る
      expect(mockSummarize).toHaveBeenCalledWith(articles)

      // Formatter が Summarizer の結果を受け取る
      expect(mockFormat).toHaveBeenCalledWith(
        summaries,
        expect.objectContaining({ date: expect.any(Date) })
      )

      // Publisher が Formatter の結果を受け取る
      expect(mockPublish).toHaveBeenCalledWith(
        digestContent,
        expect.objectContaining({ path: digestPath })
      )
    })

    it('全ステップ成功時に成功レスポンスを返す', async () => {
      const articles = [createMockArticle('1')]
      const summaries = [createMockSummary(articles[0])]

      mockFetch.mockResolvedValue(articles)
      mockSummarize.mockResolvedValue(summaries)
      mockFormat.mockReturnValue({
        content: '# Daily Digest',
        path: 'digests/2025-01-01.md',
      })
      mockPublish.mockResolvedValue({ commitSha: 'abc123def456', path: 'digests/2025-01-01.md' })

      const result = await handler({}, createMockContext())

      expect(result).toEqual({
        success: true,
        articleCount: 1,
        summaryCount: 1,
        commitSha: 'abc123def456',
        path: 'digests/2025-01-01.md',
      } satisfies HandlerResult)
    })
  })

  describe('エラーハンドリング', () => {
    it('Fetcher 失敗時は空の結果で続行する', async () => {
      mockFetch.mockRejectedValue(new Error('Feedly API error'))
      mockSummarize.mockResolvedValue([])
      mockFormat.mockReturnValue({
        content: '# Daily Digest - Empty',
        path: 'digests/2025-01-01.md',
      })
      mockPublish.mockResolvedValue({ commitSha: 'abc123', path: 'digests/2025-01-01.md' })

      const result = await handler({}, createMockContext())

      // Fetcher 失敗時でも処理は続行
      expect(result.success).toBe(true)
      expect(result.articleCount).toBe(0)
      expect(mockSummarize).toHaveBeenCalledWith([])
    })

    it('Summarizer 部分失敗時は成功分のみで続行する', async () => {
      const articles = [createMockArticle('1'), createMockArticle('2'), createMockArticle('3')]
      // 2番目の記事だけ失敗（フォールバック要約）
      const summaries = [
        createMockSummary(articles[0]),
        {
          article: articles[1],
          bullets: ['要約の取得に失敗しました'],
          category: 'Other',
        },
        createMockSummary(articles[2]),
      ]

      mockFetch.mockResolvedValue(articles)
      mockSummarize.mockResolvedValue(summaries)
      mockFormat.mockReturnValue({
        content: '# Daily Digest',
        path: 'digests/2025-01-01.md',
      })
      mockPublish.mockResolvedValue({ commitSha: 'abc123', path: 'digests/2025-01-01.md' })

      const result = await handler({}, createMockContext())

      // 部分失敗でも全記事の要約は返る（フォールバック含む）
      expect(result.success).toBe(true)
      expect(result.summaryCount).toBe(3)
    })

    it('Publisher 失敗時はエラーレスポンスを返す', async () => {
      const articles = [createMockArticle('1')]
      const summaries = [createMockSummary(articles[0])]

      mockFetch.mockResolvedValue(articles)
      mockSummarize.mockResolvedValue(summaries)
      mockFormat.mockReturnValue({
        content: '# Daily Digest',
        path: 'digests/2025-01-01.md',
      })
      mockPublish.mockRejectedValue(new Error('GitHub API error'))

      const result = await handler({}, createMockContext())

      expect(result.success).toBe(false)
      expect(result.error).toContain('GitHub API error')
    })
  })

  describe('パフォーマンス', () => {
    it('100件の記事を処理できる', async () => {
      const articles = Array.from({ length: 100 }, (_, i) => createMockArticle(String(i + 1)))
      const summaries = articles.map(createMockSummary)

      mockFetch.mockResolvedValue(articles)
      mockSummarize.mockResolvedValue(summaries)
      mockFormat.mockReturnValue({
        content: '# Daily Digest',
        path: 'digests/2025-01-01.md',
      })
      mockPublish.mockResolvedValue({ commitSha: 'abc123', path: 'digests/2025-01-01.md' })

      const result = await handler({}, createMockContext())

      expect(result.success).toBe(true)
      expect(result.articleCount).toBe(100)
      expect(result.summaryCount).toBe(100)
    })

    it('Lambda タイムアウト (15分) 内に完了する', async () => {
      const articles = [createMockArticle('1')]
      const summaries = [createMockSummary(articles[0])]

      mockFetch.mockResolvedValue(articles)
      mockSummarize.mockResolvedValue(summaries)
      mockFormat.mockReturnValue({
        content: '# Daily Digest',
        path: 'digests/2025-01-01.md',
      })
      mockPublish.mockResolvedValue({ commitSha: 'abc123', path: 'digests/2025-01-01.md' })

      const startTime = Date.now()

      await handler({}, createMockContext())

      const elapsed = Date.now() - startTime

      // モック使用なので実際には数ミリ秒で完了するはず
      expect(elapsed).toBeLessThan(15 * 60 * 1000) // 15分
    })
  })

  describe('環境変数設定', () => {
    it('必要な環境変数からリポジトリ設定を取得する', async () => {
      const articles = [createMockArticle('1')]
      const summaries = [createMockSummary(articles[0])]

      mockFetch.mockResolvedValue(articles)
      mockSummarize.mockResolvedValue(summaries)
      mockFormat.mockReturnValue({
        content: '# Daily Digest',
        path: 'digests/2025-01-01.md',
      })
      mockPublish.mockResolvedValue({ commitSha: 'abc123', path: 'digests/2025-01-01.md' })

      await handler({}, createMockContext())

      expect(mockPublish).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          owner: 'test-owner',
          repo: 'test-repo',
          branch: 'main',
        })
      )
    })
  })
})
