/**
 * Summarizer - 記事要約モジュール
 *
 * Claude 3.5 Haiku API を使用して記事の要点を抽出する。
 * バッチ処理による並列化とエラー耐性を備える。
 */

import Anthropic from '@anthropic-ai/sdk'
import type { Article, Summary } from './fetchers/types'
import { getSecrets } from './secrets'
import { withRetry, logError } from './utils/retry'
import { SUMMARIZER_SYSTEM_PROMPT, buildSummarizerPrompt } from './prompts'

/** Summarizer の設定 */
export interface SummarizerConfig {
  /** 1バッチあたりの記事数（デフォルト: 10） */
  batchSize?: number
  /** バッチ間の待機時間（ミリ秒、デフォルト: 1000） */
  batchDelayMs?: number
  /** 最大リトライ回数（デフォルト: 3） */
  maxRetries?: number
}

/** 使用するモデル */
const MODEL = 'claude-3-5-haiku-latest'

/** 最大トークン数 */
const MAX_TOKENS = 1024

/** フォールバックメッセージ */
const FALLBACK_BULLET = '要約の取得に失敗しました'
const FALLBACK_CATEGORY = 'Other'

/**
 * Claude API レスポンスをパースして Summary を生成
 */
function parseResponse(article: Article, responseText: string): Summary {
  const lines = responseText.trim().split('\n')
  const bullets: string[] = []
  let category: string | undefined

  for (const line of lines) {
    const trimmed = line.trim()

    // 箇条書きの抽出（- で始まる行）
    if (trimmed.startsWith('- ')) {
      bullets.push(trimmed.slice(2).trim())
    }

    // カテゴリの抽出
    const categoryMatch = trimmed.match(/^カテゴリ:\s*(.+)$/i)
    if (categoryMatch) {
      category = categoryMatch[1].trim()
    }
  }

  return {
    article,
    bullets: bullets.length > 0 ? bullets : [FALLBACK_BULLET],
    category: category || FALLBACK_CATEGORY,
  }
}

/**
 * リトライ対象かどうかを判定
 */
function shouldRetry(error: Error): boolean {
  // レート制限（429）はリトライ
  if (
    error.message.includes('429') ||
    error.message.includes('rate limit') ||
    (error as Error & { status?: number }).status === 429
  ) {
    return true
  }
  // ネットワークエラーはリトライ
  if (error.message.includes('Network') || error.message.includes('fetch')) {
    return true
  }
  // 認証エラー（401）はリトライしない
  if (error.message.includes('401') || error.message.includes('認証')) {
    return false
  }
  // その他のエラーはリトライ
  return true
}

/**
 * 指定ミリ秒待機する Promise を返す
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Summarizer クラス
 *
 * Claude 3.5 Haiku API を使用して記事の要約を生成する。
 */
export class Summarizer {
  private readonly batchSize: number
  private readonly batchDelayMs: number
  private readonly maxRetries: number
  private client: Anthropic | null = null

  constructor(config: SummarizerConfig = {}) {
    this.batchSize = config.batchSize ?? 10
    this.batchDelayMs = config.batchDelayMs ?? 1000
    this.maxRetries = config.maxRetries ?? 3
  }

  /**
   * Anthropic クライアントを取得（遅延初期化）
   */
  private async getClient(): Promise<Anthropic> {
    if (this.client) {
      return this.client
    }

    const secrets = await getSecrets()
    this.client = new Anthropic({
      apiKey: secrets.ANTHROPIC_API_KEY,
    })

    return this.client
  }

  /**
   * 記事の配列を要約
   *
   * @param articles 要約対象の記事配列
   * @returns 要約結果の配列（入力と同じ順序）
   */
  async summarize(articles: Article[]): Promise<Summary[]> {
    if (articles.length === 0) {
      return []
    }

    const results: Summary[] = []
    const batches = this.createBatches(articles)

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]

      // バッチ内の記事を並列処理
      const batchResults = await Promise.all(
        batch.map((article) => this.summarizeArticle(article))
      )

      results.push(...batchResults)

      // 最後のバッチでなければ待機
      if (i < batches.length - 1) {
        await sleep(this.batchDelayMs)
      }
    }

    return results
  }

  /**
   * 記事をバッチに分割
   */
  private createBatches(articles: Article[]): Article[][] {
    const batches: Article[][] = []

    for (let i = 0; i < articles.length; i += this.batchSize) {
      batches.push(articles.slice(i, i + this.batchSize))
    }

    return batches
  }

  /**
   * 単一記事を要約
   */
  private async summarizeArticle(article: Article): Promise<Summary> {
    try {
      const summary = await withRetry(
        () => this.callClaudeAPI(article),
        {
          maxRetries: this.maxRetries,
          baseDelay: 1000,
          shouldRetry,
          onRetry: (error, attempt) => {
            logError('Summarizer', error, {
              articleId: article.id,
              attempt,
            })
          },
        }
      )

      return summary
    } catch (error) {
      // すべてのリトライが失敗した場合はフォールバック
      logError('Summarizer', error, { articleId: article.id })

      return {
        article,
        bullets: [FALLBACK_BULLET],
        category: FALLBACK_CATEGORY,
      }
    }
  }

  /**
   * Claude API を呼び出して要約を取得
   */
  private async callClaudeAPI(article: Article): Promise<Summary> {
    const client = await this.getClient()
    const userPrompt = buildSummarizerPrompt(article)

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SUMMARIZER_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    })

    // レスポンスからテキストを抽出
    const textBlock = response.content.find((block) => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Claude API からテキストレスポンスを取得できませんでした')
    }

    return parseResponse(article, textBlock.text)
  }
}
