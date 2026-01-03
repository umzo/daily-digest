/**
 * Feedly Fetcher
 *
 * Feedly API から未読記事を取得し、Article 形式に変換する。
 */

import type { Article, Fetcher } from './types'
import { getSecrets } from '../secrets'
import { withRetry, logError } from '../utils/retry'

/** Feedly API のベース URL */
const FEEDLY_API_BASE = 'https://cloud.feedly.com/v3'

/** ストリーム ID（すべての未読記事） */
const STREAM_ID = 'user/-/category/global.all'

/**
 * Feedly API のエントリレスポンス型
 */
interface FeedlyEntry {
  id: string
  title?: string
  content?: { content: string }
  summary?: { content: string }
  alternate?: Array<{ href: string }>
  author?: string
  published?: number
  keywords?: string[]
}

/**
 * Feedly API のストリームレスポンス型
 */
interface FeedlyStreamResponse {
  items: FeedlyEntry[]
  continuation?: string
}

/**
 * HTML タグを除去してプレーンテキストを取得
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * リトライ対象かどうかを判定
 */
function shouldRetry(error: Error): boolean {
  // ネットワークエラーはリトライ
  if (error.message.includes('Network') || error.message.includes('fetch')) {
    return true
  }
  // レート制限（429）はリトライ
  if (error.message.includes('429') || error.message.includes('rate limit')) {
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
 * Feedly Fetcher クラス
 *
 * Fetcher インターフェースを実装し、Feedly API から記事を取得する。
 */
export class FeedlyFetcher implements Fetcher {
  readonly name = 'feedly'

  /**
   * Feedly API から未読記事を取得
   *
   * @returns 取得した記事の配列
   * @throws API リクエストが最終的に失敗した場合
   */
  async fetch(): Promise<Article[]> {
    const secrets = await getSecrets()
    const token = secrets.FEEDLY_ACCESS_TOKEN

    const response = await withRetry(
      () => this.fetchStream(token),
      {
        maxRetries: 3,
        baseDelay: 1000,
        shouldRetry,
        onRetry: (error, attempt) => {
          logError('Feedly API', error, { attempt })
        },
      }
    )

    const articles: Article[] = []

    for (const entry of response.items) {
      try {
        const article = this.convertToArticle(entry)
        articles.push(article)
      } catch (error) {
        logError('Feedly Fetcher', error, { entryId: entry.id })
        // 個別記事の変換失敗はスキップして続行
      }
    }

    return articles
  }

  /**
   * Feedly API にリクエストを送信
   */
  private async fetchStream(token: string): Promise<FeedlyStreamResponse> {
    const url = `${FEEDLY_API_BASE}/streams/contents?streamId=${encodeURIComponent(STREAM_ID)}&unreadOnly=true`

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('認証エラー: Feedly アクセストークンが無効です')
      }
      if (response.status === 429) {
        throw new Error('レート制限 (429): リクエスト制限に達しました')
      }
      throw new Error(`Feedly API エラー: ${response.status}`)
    }

    return response.json() as Promise<FeedlyStreamResponse>
  }

  /**
   * Feedly エントリを Article 形式に変換
   */
  private convertToArticle(entry: FeedlyEntry): Article {
    // URL の取得（必須）
    const url = entry.alternate?.[0]?.href
    if (!url) {
      throw new Error('記事の URL が取得できません')
    }

    // コンテンツの取得（content を優先、なければ summary）
    const rawContent = entry.content?.content ?? entry.summary?.content ?? ''
    const content = stripHtml(rawContent)

    return {
      id: entry.id,
      source: 'feedly',
      title: entry.title ?? '無題',
      content,
      url,
      author: entry.author,
      publishedAt: new Date(entry.published ?? Date.now()),
      tags: entry.keywords,
    }
  }
}
