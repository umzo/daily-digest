import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Summarizer, SummarizerConfig } from '../summarizer'
import * as secrets from '../secrets'
import type { Article, Summary } from '../fetchers/types'

// secrets モジュールをモック
vi.mock('../secrets')

// モック用の create 関数
const mockCreate = vi.fn()

// Anthropic SDK をモック
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: mockCreate,
      }
    },
  }
})

/** テスト用の Article を生成 */
function createMockArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 'test-article-1',
    source: 'feedly',
    title: 'テスト記事タイトル',
    content: 'これはテスト用の記事コンテンツです。重要な情報が含まれています。',
    url: 'https://example.com/article',
    author: 'テスト著者',
    publishedAt: new Date('2025-01-01T00:00:00Z'),
    tags: ['test', 'article'],
    ...overrides,
  }
}

/** Claude API レスポンスを模擬 */
function mockClaudeResponse(content: string) {
  return {
    content: [
      {
        type: 'text',
        text: content,
      },
    ],
    usage: {
      input_tokens: 100,
      output_tokens: 50,
    },
  }
}

describe('Summarizer', () => {
  let summarizer: Summarizer

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    // シークレットのモック
    vi.mocked(secrets.getSecrets).mockResolvedValue({
      ANTHROPIC_API_KEY: 'test-anthropic-key',
      FEEDLY_ACCESS_TOKEN: 'test-feedly-token',
      GITHUB_TOKEN: 'test-github-token',
    })

    summarizer = new Summarizer()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('正常系', () => {
    it('Claude API を呼び出して要約を取得できる', async () => {
      const article = createMockArticle()
      const responseText = `- 要点1: 重要な情報が含まれている
- 要点2: テスト用の記事である
- 要点3: 著者はテスト著者

カテゴリ: Tech`

      mockCreate.mockResolvedValueOnce(mockClaudeResponse(responseText))

      const summaries = await summarizer.summarize([article])

      expect(summaries).toHaveLength(1)
      expect(mockCreate).toHaveBeenCalledTimes(1)
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-haiku-4-5-latest',
          max_tokens: 1024,
        })
      )
    })

    it('各記事につき 3-5 個の箇条書き要点を生成する', async () => {
      const article = createMockArticle()
      const responseText = `- 要点1: 重要な情報1
- 要点2: 重要な情報2
- 要点3: 重要な情報3
- 要点4: 重要な情報4

カテゴリ: Tech`

      mockCreate.mockResolvedValueOnce(mockClaudeResponse(responseText))

      const summaries = await summarizer.summarize([article])

      expect(summaries[0].bullets).toHaveLength(4)
      expect(summaries[0].bullets[0]).toBe('要点1: 重要な情報1')
      expect(summaries[0].bullets[1]).toBe('要点2: 重要な情報2')
    })

    it('記事を自動でカテゴリ分類できる', async () => {
      const article = createMockArticle({
        title: 'AI の最新動向',
        content: '人工知能技術の発展について解説します。',
      })
      const responseText = `- AIが急速に発展している
- 機械学習の進歩が著しい
- 実用化が進んでいる

カテゴリ: Tech`

      mockCreate.mockResolvedValueOnce(mockClaudeResponse(responseText))

      const summaries = await summarizer.summarize([article])

      expect(summaries[0].category).toBe('Tech')
    })

    it('Summary オブジェクトが正しい構造を持つ', async () => {
      const article = createMockArticle()
      const responseText = `- 要点1
- 要点2
- 要点3

カテゴリ: Business`

      mockCreate.mockResolvedValueOnce(mockClaudeResponse(responseText))

      const summaries = await summarizer.summarize([article])

      expect(summaries[0]).toEqual<Summary>({
        article,
        bullets: ['要点1', '要点2', '要点3'],
        category: 'Business',
      })
    })
  })

  describe('バッチ処理', () => {
    it('10件の記事を並列処理できる', async () => {
      const articles = Array.from({ length: 10 }, (_, i) =>
        createMockArticle({ id: `article-${i}` })
      )
      const responseText = `- 要点1
- 要点2
- 要点3

カテゴリ: Tech`

      // 各記事に対してレスポンスを返す
      for (let i = 0; i < 10; i++) {
        mockCreate.mockResolvedValueOnce(mockClaudeResponse(responseText))
      }

      const summaries = await summarizer.summarize(articles)

      expect(summaries).toHaveLength(10)
      expect(mockCreate).toHaveBeenCalledTimes(10)
    })

    it('100件の記事を 10バッチに分けて処理できる', async () => {
      const articles = Array.from({ length: 100 }, (_, i) =>
        createMockArticle({ id: `article-${i}` })
      )
      const responseText = `- 要点1
- 要点2
- 要点3

カテゴリ: Tech`

      // 各記事に対してレスポンスを返す
      for (let i = 0; i < 100; i++) {
        mockCreate.mockResolvedValueOnce(mockClaudeResponse(responseText))
      }

      const summariesPromise = summarizer.summarize(articles)

      // タイマーを進める（バッチ間の待機時間）
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(1000)
      }

      const summaries = await summariesPromise

      expect(summaries).toHaveLength(100)
      expect(mockCreate).toHaveBeenCalledTimes(100)
    })

    it('バッチ間で適切な待機時間を設ける', async () => {
      const config: SummarizerConfig = {
        batchSize: 2,
        batchDelayMs: 500,
      }
      const summarizerWithConfig = new Summarizer(config)

      const articles = Array.from({ length: 4 }, (_, i) =>
        createMockArticle({ id: `article-${i}` })
      )
      const responseText = `- 要点1
- 要点2
- 要点3

カテゴリ: Tech`

      for (let i = 0; i < 4; i++) {
        mockCreate.mockResolvedValueOnce(mockClaudeResponse(responseText))
      }

      const start = Date.now()
      const summariesPromise = summarizerWithConfig.summarize(articles)

      // 最初のバッチが完了
      await vi.advanceTimersByTimeAsync(100)
      // バッチ間の待機
      await vi.advanceTimersByTimeAsync(500)
      // 2番目のバッチが完了
      await vi.advanceTimersByTimeAsync(100)

      const summaries = await summariesPromise

      expect(summaries).toHaveLength(4)
    })
  })

  describe('エラーハンドリング', () => {
    it('API エラー時に指数バックオフで最大3回リトライする', async () => {
      const article = createMockArticle()
      const responseText = `- 要点1
- 要点2
- 要点3

カテゴリ: Tech`

      // 最初の3回は失敗、4回目で成功
      mockCreate
        .mockRejectedValueOnce(new Error('API Error'))
        .mockRejectedValueOnce(new Error('API Error'))
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce(mockClaudeResponse(responseText))

      const summariesPromise = summarizer.summarize([article])

      // リトライの待機時間を進める（1s, 2s, 4s）
      await vi.advanceTimersByTimeAsync(1000)
      await vi.advanceTimersByTimeAsync(2000)
      await vi.advanceTimersByTimeAsync(4000)

      const summaries = await summariesPromise

      expect(summaries).toHaveLength(1)
      expect(mockCreate).toHaveBeenCalledTimes(4)
    })

    it('リトライ後も失敗時はフォールバックメッセージを返す', async () => {
      const article = createMockArticle()

      // すべて失敗
      mockCreate.mockRejectedValue(new Error('API Error'))

      const summariesPromise = summarizer.summarize([article])

      // リトライの待機時間を進める
      for (let i = 0; i < 4; i++) {
        await vi.advanceTimersByTimeAsync(10000)
      }

      const summaries = await summariesPromise

      expect(summaries).toHaveLength(1)
      expect(summaries[0].bullets).toEqual(['要約の取得に失敗しました'])
      expect(summaries[0].category).toBe('Other')
    })

    it('個別記事の失敗が他の記事処理をブロックしない', async () => {
      // バッチサイズを1にして順次処理させることで、モックの順序を保証
      const sequentialSummarizer = new Summarizer({ batchSize: 1, batchDelayMs: 0 })

      const articles = [
        createMockArticle({ id: 'article-1' }),
        createMockArticle({ id: 'article-2' }),
        createMockArticle({ id: 'article-3' }),
      ]
      const responseText = `- 要点1
- 要点2
- 要点3

カテゴリ: Tech`

      // 2番目の記事だけ失敗（4回すべて失敗させてフォールバック）
      mockCreate
        .mockResolvedValueOnce(mockClaudeResponse(responseText)) // article-1 成功
        .mockRejectedValueOnce(new Error('API Error')) // article-2 失敗1
        .mockRejectedValueOnce(new Error('API Error')) // article-2 失敗2
        .mockRejectedValueOnce(new Error('API Error')) // article-2 失敗3
        .mockRejectedValueOnce(new Error('API Error')) // article-2 失敗4（最後）
        .mockResolvedValueOnce(mockClaudeResponse(responseText)) // article-3 成功

      const summariesPromise = sequentialSummarizer.summarize(articles)

      // リトライの待機時間を進める
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(10000)
      }

      const summaries = await summariesPromise

      // 3件とも結果が返る（1件はフォールバック）
      expect(summaries).toHaveLength(3)
      expect(summaries[0].bullets).not.toContain('要約の取得に失敗しました')
      expect(summaries[1].bullets).toEqual(['要約の取得に失敗しました'])
      expect(summaries[2].bullets).not.toContain('要約の取得に失敗しました')
    })

    it('レート制限時は適切に待機してリトライする', async () => {
      const article = createMockArticle()
      const responseText = `- 要点1
- 要点2
- 要点3

カテゴリ: Tech`

      // レート制限エラー
      const rateLimitError = new Error('rate limit exceeded')
      ;(rateLimitError as Error & { status?: number }).status = 429

      mockCreate
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(mockClaudeResponse(responseText))

      const summariesPromise = summarizer.summarize([article])

      // リトライの待機時間を進める
      await vi.advanceTimersByTimeAsync(1000)

      const summaries = await summariesPromise

      expect(summaries).toHaveLength(1)
      expect(mockCreate).toHaveBeenCalledTimes(2)
    })
  })

  describe('Summary', () => {
    it('article プロパティに元の Article を保持する', async () => {
      const article = createMockArticle()
      const responseText = `- 要点1

カテゴリ: Tech`

      mockCreate.mockResolvedValueOnce(mockClaudeResponse(responseText))

      const summaries = await summarizer.summarize([article])

      expect(summaries[0].article).toBe(article)
    })

    it('bullets プロパティに要点の配列を保持する', async () => {
      const article = createMockArticle()
      const responseText = `- 最初の要点
- 2番目の要点
- 3番目の要点

カテゴリ: Tech`

      mockCreate.mockResolvedValueOnce(mockClaudeResponse(responseText))

      const summaries = await summarizer.summarize([article])

      expect(Array.isArray(summaries[0].bullets)).toBe(true)
      expect(summaries[0].bullets).toEqual([
        '最初の要点',
        '2番目の要点',
        '3番目の要点',
      ])
    })

    it('category プロパティはオプション', async () => {
      const article = createMockArticle()
      // カテゴリなしのレスポンス
      const responseText = `- 要点1
- 要点2
- 要点3`

      mockCreate.mockResolvedValueOnce(mockClaudeResponse(responseText))

      const summaries = await summarizer.summarize([article])

      // category がない場合は undefined または 'Other'
      expect(['Other', undefined]).toContain(summaries[0].category)
    })
  })

  describe('プロンプト構築', () => {
    it('記事のタイトルと本文をプロンプトに含める', async () => {
      const article = createMockArticle({
        title: 'カスタムタイトル',
        content: 'カスタムコンテンツ',
      })
      const responseText = `- 要点1

カテゴリ: Tech`

      mockCreate.mockResolvedValueOnce(mockClaudeResponse(responseText))

      await summarizer.summarize([article])

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('カスタムタイトル'),
            }),
          ]),
        })
      )
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('カスタムコンテンツ'),
            }),
          ]),
        })
      )
    })
  })
})
