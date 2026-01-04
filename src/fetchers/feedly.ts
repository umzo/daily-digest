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

/** Feedly Web アプリのベース URL */
const FEEDLY_WEB_BASE = 'https://feedly.com/i/entry'

/** 1回のリクエストで取得する最大記事数 */
const MAX_COUNT = 100

/**
 * Feedly API のプロファイルレスポンス型
 */
interface FeedlyProfile {
  id: string
}

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
 * Feedly 記事詳細ページの URL を生成
 */
function buildFeedlyEntryUrl(entryId: string): string {
  return `${FEEDLY_WEB_BASE}/${encodeURIComponent(entryId)}`
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

  /** キャッシュされたユーザーID */
  private cachedUserId: string | null = null

  /**
   * Feedly API から未読記事を取得
   *
   * @returns 取得した記事の配列
   * @throws API リクエストが最終的に失敗した場合
   */
  async fetch(): Promise<Article[]> {
    const secrets = await getSecrets()
    const token = secrets.FEEDLY_ACCESS_TOKEN

    // ユーザーIDを取得（キャッシュがあれば使用）
    const userId = await this.getUserId(token)

    // ストリームIDを構築
    const streamId = `user/${userId}/category/global.all`

    const response = await withRetry(
      () => this.fetchStream(token, streamId),
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
   * ユーザーIDを取得
   *
   * /v3/profile エンドポイントからユーザーIDを取得する。
   * キャッシュがあれば再利用する。
   */
  private async getUserId(token: string): Promise<string> {
    if (this.cachedUserId) {
      return this.cachedUserId
    }

    const profile = await withRetry(
      () => this.fetchProfile(token),
      {
        maxRetries: 3,
        baseDelay: 1000,
        shouldRetry,
        onRetry: (error, attempt) => {
          logError('Feedly Profile API', error, { attempt })
        },
      }
    )

    // id は "user/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" 形式
    // "user/" プレフィックスを除去してユーザーIDのみ取得
    const userId = profile.id.replace(/^user\//, '')
    this.cachedUserId = userId

    return userId
  }

  /**
   * プロファイルを取得
   */
  private async fetchProfile(token: string): Promise<FeedlyProfile> {
    const url = `${FEEDLY_API_BASE}/profile`

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

    return response.json() as Promise<FeedlyProfile>
  }

  /**
   * Feedly API にリクエストを送信
   */
  private async fetchStream(
    token: string,
    streamId: string
  ): Promise<FeedlyStreamResponse> {
    const params = new URLSearchParams({
      streamId,
      unreadOnly: 'true',
      ranked: 'newest',
      count: String(MAX_COUNT),
    })

    const url = `${FEEDLY_API_BASE}/streams/contents?${params.toString()}`

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
      feedlyEntryUrl: buildFeedlyEntryUrl(entry.id),
      author: entry.author,
      publishedAt: new Date(entry.published ?? Date.now()),
      tags: entry.keywords,
    }
  }

  /**
   * ユーザーIDキャッシュをクリア（テスト用）
   */
  clearUserIdCache(): void {
    this.cachedUserId = null
  }

  /**
   * 記事を既読にマーク
   *
   * @param entryIds 既読にする記事IDの配列
   */
  async markAsRead(entryIds: string[]): Promise<void> {
    if (entryIds.length === 0) {
      return
    }

    const secrets = await getSecrets()
    const token = secrets.FEEDLY_ACCESS_TOKEN

    await withRetry(
      async () => {
        const url = `${FEEDLY_API_BASE}/markers`

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'markAsRead',
            type: 'entries',
            entryIds,
          }),
        })

        if (!response.ok) {
          const body = await response.text()
          console.error(`[Feedly] markAsRead failed: ${response.status}`, body)
          if (response.status === 401) {
            throw new Error('認証エラー: Feedly アクセストークンが無効です')
          }
          if (response.status === 429) {
            throw new Error('レート制限 (429): リクエスト制限に達しました')
          }
          throw new Error(`Feedly API エラー: ${response.status} - ${body}`)
        }

        console.log(`[Feedly] markAsRead API success: ${response.status}`)
      },
      {
        maxRetries: 3,
        baseDelay: 1000,
        shouldRetry,
        onRetry: (error, attempt) => {
          logError('Feedly markAsRead', error, { attempt, count: entryIds.length })
        },
      }
    )

    console.log(`[Feedly] Marked ${entryIds.length} articles as read (IDs: ${entryIds.slice(0, 3).join(', ')}${entryIds.length > 3 ? '...' : ''})`)
  }
}
